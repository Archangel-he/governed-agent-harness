import {mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {AgentVersion} from '../contracts/domain.js';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {validateVersion} from '../runtime/validate-version.js';
import {evidenceDigest} from '../governance/evaluation.js';
import {jsonSnapshot} from '../services/log-value.js';
import {acquireFileLock,atomicJson,missing} from '../services/local-file.js';
import {WikiStore,type Proposal} from '../memory/wiki.js';
import {memorySnapshot} from '../agent.js';
import type {AgentRequest} from '../runtime/governed-runtime.js';
import {RuntimeEvidenceSourceResolver} from '../runtime/evidence-source.js';

export interface HierarchyDefinition {
  id:string; supremeId:string; maxTasks:number;
  agents:{id:string;role:'supreme'|'leader'|'member';parentId?:string;version:AgentVersion}[];
}
export interface AgentReport {taskId:string;agentId:string;executionId:string;status:string;output:unknown;traceDigest:string;eventIds:string[]}
export interface HierarchyTask {
  id:string;revision:number;assigneeId:string;parentTaskId?:string;input:unknown;
  status:'queued'|'running'|'reported'|'accepted'|'rejected'|'failed'|'interrupted';
  report?:AgentReport;error?:string;
  memory?:AgentRequest['memory'];
}
interface Event {id:string;type:string;taskId:string;payload:unknown}
interface State {schemaVersion:1;definitionDigest:string;tasks:HierarchyTask[];events:Event[]}
interface Decision {taskId:string;accept:boolean;reason:string;evidenceDigest:string}

/** Roles compose the same Agent runtime. Reports become accepted only after a parent's recorded review. */
export class HierarchyRuntime {
  private readonly runtimes=new Map<string,GovernedAgentRuntime>();
  private readonly inflight=new Map<string,Promise<HierarchyTask>>();
  private readonly queues=new Map<string,Promise<unknown>>();
  private readonly definition:HierarchyDefinition;
  private readonly file:string;
  constructor(private readonly root:string,definition:HierarchyDefinition,private readonly wiki?:WikiStore) {
    this.definition=jsonSnapshot(definition);this.file=join(root,'hierarchy.json');
    const agents=this.definition.agents;
    if(!definition.id||!Number.isSafeInteger(definition.maxTasks)||definition.maxTasks<1||new Set(agents.map(a=>a.id)).size!==agents.length)throw new Error('Invalid hierarchy');
    if(agents.filter(a=>a.role==='supreme').length!==1)throw new Error('Hierarchy requires one supreme');
    for(const agent of agents){
      validateVersion(agent.version);
      const parent=agents.find(a=>a.id===agent.parentId);
      if(!agent.id||!agent.version.topology||!['supreme','leader','member'].includes(agent.role))throw new Error('Invalid hierarchy Agent');
      if(agent.role==='supreme'?(agent.id!==definition.supremeId||agent.parentId!==undefined):parent?.role!==(agent.role==='leader'?'supreme':'leader'))throw new Error('Invalid hierarchy parent');
    }
    mkdirSync(root,{recursive:true});this.mutate(()=>{});
  }
  register(agentId:string,runtime:GovernedAgentRuntime):void {
    if(!this.definition.agents.some(a=>a.id===agentId)||!(runtime instanceof GovernedAgentRuntime)||this.runtimes.has(agentId))throw new Error('Invalid Agent registration');
    this.runtimes.set(agentId,runtime);
  }
  tasks():HierarchyTask[]{return this.load().tasks}
  events():Event[]{return this.load().events}
  private memoryFor(agentId:string):AgentRequest['memory'] {
    if(!this.wiki)return undefined;
    const agent=this.definition.agents.find(a=>a.id===agentId)!;
    const releases=[this.wiki.pinned('agent',agentId),this.wiki.pinned('supreme',this.definition.supremeId)];
    if(agent.role!=='supreme')releases.push(this.wiki.pinned('team',agent.role==='leader'?agent.id:agent.parentId!));
    return memorySnapshot(releases);
  }
  async proposeMemory(callerId:string,target:'agent'|'team'|'supreme',input:Omit<Proposal,'id'|'createdAt'|'scope'|'owner'|'proposedBy'>):Promise<Proposal>{
    if(!this.wiki)throw new Error('Wiki not configured');
    const agent=this.definition.agents.find(a=>a.id===callerId);if(!agent)throw new Error('Unknown Agent');
    const owner=target==='agent'?callerId:target==='supreme'?this.definition.supremeId:agent.role==='leader'?callerId:agent.parentId;
    if(!owner||target==='team'&&agent.role==='supreme')throw new Error('Team memory scope denied');
    return this.wiki.propose({...input,scope:target,owner,proposedBy:callerId});
  }
  publishMemory(callerId:string,proposalId:string){if(!this.wiki)throw new Error('Wiki not configured');return this.wiki.publish(proposalId,callerId)}
  async submit(requestId:string,input:unknown,signal?:AbortSignal):Promise<HierarchyTask>{
    if(!requestId)throw new Error('Request identity required');
    const id=evidenceDigest({hierarchy:this.definition.id,requestId});
    this.enqueue(id,this.definition.supremeId,input);
    return this.execute(id,signal);
  }
  async delegate(callerId:string,parentTaskId:string,childId:string,key:string,input:unknown,signal?:AbortSignal):Promise<AgentReport>{
    const id=evidenceDigest({parentTaskId,childId,key});
    this.mutate(state=>{
      const parent=state.tasks.find(t=>t.id===parentTaskId),child=this.definition.agents.find(a=>a.id===childId);
      if(!key||parent?.assigneeId!==callerId||parent.status!=='running'||child?.parentId!==callerId)throw new Error('Delegation authority requires running direct parent');
      this.add(state,id,childId,input,parentTaskId);
    });
    const task=await this.execute(id,signal);
    if(!task.report)throw new Error(task.error??'Child has no durable report');
    return task.report;
  }
  private enqueue(id:string,agentId:string,input:unknown):void {this.mutate(state=>this.add(state,id,agentId,input))}
  private add(state:State,id:string,assigneeId:string,input:unknown,parentTaskId?:string):void {
    const snapshot=jsonSnapshot(input),old=state.tasks.find(t=>t.id===id);
    if(old){if(evidenceDigest(old.input)!==evidenceDigest(snapshot)||old.assigneeId!==assigneeId||old.parentTaskId!==parentTaskId)throw new Error('Task request conflict');return}
    if(state.tasks.length>=this.definition.maxTasks)throw new Error('Hierarchy task budget exceeded');
    const memory=this.memoryFor(assigneeId);
    state.tasks.push({id,revision:1,assigneeId,input:snapshot,status:'queued',...(memory?{memory}:{}),...(parentTaskId?{parentTaskId}:{})});
    this.event(state,'assignment',id,{assigneeId});
  }
  private execute(id:string,signal?:AbortSignal):Promise<HierarchyTask>{
    const pending=this.inflight.get(id);if(pending)return pending;
    const agentId=this.tasks().find(t=>t.id===id)!.assigneeId;
    const previous=this.queues.get(agentId)??Promise.resolve();
    const promise=previous.catch(()=>{}).then(()=>this.perform(id,signal)).finally(()=>{
      this.inflight.delete(id);if(this.queues.get(agentId)===promise)this.queues.delete(agentId);
    });
    this.inflight.set(id,promise);this.queues.set(agentId,promise);return promise;
  }
  private async perform(id:string,signal?:AbortSignal):Promise<HierarchyTask>{
    const unlock=acquireFileLock(join(this.root,'task-'+id+'.lock'));
    try{
      let task=this.tasks().find(t=>t.id===id)!;
      if(!['queued','running'].includes(task.status))return task;
      const runtime=this.runtimes.get(task.assigneeId),agent=this.definition.agents.find(a=>a.id===task.assigneeId)!;
      if(!runtime)throw new Error('Agent runtime not registered: '+task.assigneeId);
      signal?.throwIfAborted();
      this.mutate(state=>{const row=state.tasks.find(t=>t.id===id)!;row.status='running';row.revision++;this.event(state,'delivery',id,{agentId:agent.id})});
      // The stable request identity recovers a durable completed run without repeating its effects.
      const result=await runtime.run({agentId:agent.id,requestId:'team-task:'+id,version:agent.version,input:{taskId:id,request:task.input},...(task.memory?{memory:task.memory}:{}),...(signal?{signal}:{})});
      const report:AgentReport={taskId:id,agentId:agent.id,executionId:result.executionId,status:result.status,output:result.output??null,traceDigest:evidenceDigest(result.trace.events),eventIds:result.trace.events.map(e=>e.id)};
      const verified=new Map<string,string>();
      for(const child of this.tasks().filter(t=>t.parentTaskId===id)){
        try{
          if(!child.report)continue;
          const childRuntime=this.runtimes.get(child.assigneeId);if(!childRuntime)continue;
          const source=await new RuntimeEvidenceSourceResolver(childRuntime.sessions,[child.assigneeId]).resolve(child.report.executionId);
          const childVersion=this.definition.agents.find(a=>a.id===child.assigneeId)!.version;
          const terminal=source.trace.events.find(e=>e.type==='execution/end'&&e.operationId===source.executionId)!;
          const expected={taskId:child.id,agentId:child.assigneeId,executionId:source.executionId,status:(terminal.payload as {status:string}).status,output:source.output,traceDigest:evidenceDigest(source.trace.events),eventIds:source.trace.events.map(e=>e.id)};
          if(source.versionDigest===evidenceDigest(childVersion)&&evidenceDigest(source.input)===evidenceDigest({taskId:child.id,request:child.input})&&evidenceDigest(expected)===evidenceDigest(child.report))verified.set(child.id,evidenceDigest(child.report));
        }catch{/* Unverifiable reports fail the parent review below. */}
      }
      this.mutate(state=>{
        const row=state.tasks.find(t=>t.id===id)!;row.report=report;row.revision++;
        const children=state.tasks.filter(t=>t.parentTaskId===id);
        row.status=result.status==='completed'?'reported':result.status==='interrupted'?'interrupted':'failed';
        this.event(state,'report',id,report);this.event(state,'ack',id,{executionId:result.executionId});
        if(result.status!=='completed')return;
        if(children.length){
          if(children.some(child=>!child.report||verified.get(child.id)!==evidenceDigest(child.report))){row.status='rejected';row.error='Child persisted evidence mismatch';this.event(state,'review/invalid',id,{reason:row.error});return}
          const decisions=(report.output as {decisions?:Decision[]}|null)?.decisions;
          if(!Array.isArray(decisions)||decisions.length!==children.length||new Set(decisions.map(d=>d.taskId)).size!==children.length){row.status='rejected';row.error='Missing complete child review';return}
          for(const decision of decisions){
            const child=children.find(t=>t.id===decision.taskId);
            if(!child?.report||decision.evidenceDigest!==child.report.traceDigest||typeof decision.accept!=='boolean'||typeof decision.reason!=='string'||!decision.reason.trim()){
              row.status='rejected';row.error='Invalid child review evidence';return;
            }
          }
          for(const decision of decisions){
            const child=children.find(t=>t.id===decision.taskId)!;
            const accepted=decision.accept&&child.status==='reported'&&child.report?.status==='completed';
            child.status=accepted?'accepted':'rejected';child.revision++;
            this.event(state,'review',child.id,{...decision,accepted,reviewerExecutionId:result.executionId});
          }
          if(children.some(t=>t.status!=='accepted'))row.status='rejected';
        }
        if(agent.role==='supreme'&&row.status==='reported')row.status='accepted';
      });
      task=this.tasks().find(t=>t.id===id)!;return task;
    }finally{unlock()}
  }
  private event(state:State,type:string,taskId:string,payload:unknown):void {state.events.push({id:crypto.randomUUID(),type,taskId,payload:jsonSnapshot(payload)})}
  private load():State {
    let state:State;
    try{state=JSON.parse(readFileSync(this.file,'utf8'))}catch(error){if(!missing(error))throw error;state={schemaVersion:1,definitionDigest:evidenceDigest(this.definition),tasks:[],events:[]}}
    if(state.schemaVersion!==1||state.definitionDigest!==evidenceDigest(this.definition)||!Array.isArray(state.tasks)||!Array.isArray(state.events))throw new Error('Hierarchy store/version mismatch');
    return jsonSnapshot(state);
  }
  private mutate(change:(state:State)=>void):void {
    // ponytail: one local transaction lock; shard only if single-host contention warrants it.
    const unlock=acquireFileLock(this.file+'.lock');
    try{const state=this.load();change(state);atomicJson(this.file,state)}finally{unlock()}
  }
}
