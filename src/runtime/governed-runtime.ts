import { Context, type Fiber } from 'cordis';
import type { LifecyclePlugin } from '../plugins/lifecycle.js';
import type { Gateway } from '../contracts/runtime.js';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import type { AgentVersion } from '../contracts/domain.js';
import type { KernelDependencies } from '../contracts/kernel.js';
import type { CapabilityPlugin, PluginResult } from '../plugins/capability.js';
import { compileTopology } from '../topology/compiler.js';
import { freezeTopology } from '../topology/schema.js';
import { TopologyExecutor } from '../topology/executor.js';
import { AgentTraceAggregator } from '../trace/aggregator.js';
import type { AgentTrace, TraceEvent, TraceStatus } from '../trace/events.js';
import { projectSessionEvents } from '../trace/session-projector.js';
import { JsonlSessionStore } from '../services/file-store.js';
import { LocalArtifactStore } from '../services/artifact-store.js';
import { jsonSnapshot } from '../services/log-value.js';
import { evidenceDigest } from '../governance/evaluation.js';
import { StatelessAgentKernel } from './kernel/stateless.js';
import { validateVersion } from './validate-version.js';

export interface GovernedRuntimeOptions {
  root: string;
  plugins: Map<string, CapabilityPlugin>;
  kernel?: KernelDependencies;
  systemPrompt?: string;
  lifecycle?: Map<string,()=>LifecyclePlugin>;
  gateway?: Gateway;
}
export interface AgentRequest {
  agentId: string;
  requestId: string;
  version: AgentVersion;
  input: unknown;
  signal?: AbortSignal;
}
export interface AgentRunResult {
  executionId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  output?: unknown;
  error?: string;
  trace: AgentTrace;
}

/** Local product entry: a version binds seats, Cordis owns their lifetime, Session owns evidence. */
export class GovernedAgentRuntime {
  readonly sessions: JsonlSessionStore;
  readonly artifacts: LocalArtifactStore;
  constructor(private readonly options: GovernedRuntimeOptions) {
    this.sessions=new JsonlSessionStore(join(options.root,'session.jsonl'));
    this.artifacts=new LocalArtifactStore(join(options.root,'artifacts'));
  }

  async run(request: AgentRequest): Promise<AgentRunResult> {
    if (!request.agentId || !request.requestId) throw new Error('Agent/request identity required');
    const version=freezeTopology(request.version);
    const input=jsonSnapshot(request.input);
    validateVersion(version);
    if (!version.topology) throw new Error('AgentVersion requires topology');
    const plan=compileTopology(version.topology);
    const sessionId='agent:'+request.agentId;
    const release=this.sessions.acquire(sessionId);
    const digest=evidenceDigest({version,input});
    try {
      const history=this.sessions.events(sessionId);
      const prior=history.find(event=>event.type==='harness/request' && (event.payload as Record<string,unknown>).requestId===request.requestId);
      if (prior) {
        const p=prior.payload as {executionId:string;digest:string};
        if(p.digest!==digest) throw new Error('Request ID reused with different version/input');
        return this.restore(sessionId,p.executionId);
      }
      request.signal?.throwIfAborted();
      const executionId=crypto.randomUUID();
      this.sessions.append({id:crypto.randomUUID(),sessionId,type:'harness/request',payload:{requestId:request.requestId,executionId,digest,version,input}});
      const aggregator=new AgentTraceAggregator();
      let persistenceFailed=false;
      const append=(event: Omit<TraceEvent,'id'|'executionId'> & {id?:string}):void=>{
        const traceEvent:TraceEvent={...event,id:event.id??crypto.randomUUID(),executionId,agentId:request.agentId,agentVersionId:version.id,timestamp:event.timestamp??Date.now()};
        try {
          aggregator.append(traceEvent);
          this.sessions.append({id:traceEvent.id,sessionId,type:'harness/trace',payload:traceEvent});
        } catch(error) {persistenceFailed=true;throw error;}
      };
      append({operationId:executionId,type:'execution/start',status:'started'});
      // Preflight every binding and implementation before creating any Cordis seat or artifact wrapper.
      for(const binding of version.bindings){
        const node=plan.topology.nodes.find(n=>(n.seatId??n.id)===binding.seatId);
        const factory=this.options.lifecycle?.get(binding.plugin.id+'@'+binding.plugin.version)??this.options.lifecycle?.get(binding.plugin.id);
        if(node&&(node.pluginId!==binding.plugin.id||node.pluginVersion!==binding.plugin.version))throw new Error('Seat binding and topology mismatch: '+binding.seatId);
        if(!node&&!factory)throw new Error('Unresolved infrastructure binding: '+binding.seatId);
        if(factory){const life=factory();if(!isDeepStrictEqual(life.binding,binding))throw new Error('Lifecycle binding mismatch');}
      }
      for(const node of plan.topology.nodes){const id=node.pluginId??node.id;if(node.kind!=='kernel'&&!this.options.plugins.has(id+'@'+node.pluginVersion)&&!this.options.plugins.has(id))throw new Error('Plugin not registered: '+id);}
      const root=new Context();
      const fibers:Fiber[]=[];
      const scopes=new Map<string,Context>();
      const seats=new Map<string,CapabilityPlugin>();
      const wrapped=new Map<string,CapabilityPlugin>();
      let output:unknown;
      let status:AgentRunResult['status']='completed';
      let failure:string|undefined;
      try {
        for(const node of plan.topology.nodes) {
          const pluginId=node.pluginId??node.id;
          let plugin=this.options.plugins.get(pluginId+'@'+node.pluginVersion)??this.options.plugins.get(pluginId);
          if(node.kind==='kernel' && !plugin) {
            if(!this.options.kernel) throw new Error('Kernel dependencies required');
            const deps=this.options.kernel;
            plugin={manifest:{id:pluginId,version:node.pluginVersion??'1',capabilitySurface:'kernel'},invoke:async(arg,ctx)=>{
              const operationId=(ctx as typeof ctx & {operationId?:string}).operationId;
              if(!operationId) throw new Error('Kernel seat requires operation identity');
              const result=await new StatelessAgentKernel().run({executionId:operationId+':kernel',agentId:request.agentId,version,userContent:arg,systemPrompt:this.options.systemPrompt??'Follow the task and return a result.'},{...deps,emit:async event=>{
                await deps.emit?.(event);
                const projected=projectSessionEvents([{id:crypto.randomUUID(),sessionId,type:event.type,payload:event.payload}])[0];
                if(projected.type==='turn/start') projected.parentOperationId=operationId;
                // Nested Loop has its own operation identity but belongs to this Agent execution.
                const {executionId:_,...fact}=projected;
                append(fact);
              }},ctx.signal);
              if(result.status!=='completed') throw new Error(result.error??'Kernel execution failed');
              return {output:result.output??null};
            }};
          }
          if(!plugin) throw new Error('Plugin not registered: '+pluginId);
          if(!node.pluginVersion || plugin.manifest.version!==node.pluginVersion) throw new Error('Frozen plugin version required/mismatch: '+pluginId);
          const active=plugin;
          const seatId=node.seatId??node.id;
          const fiber=root.plugin({name:`seat:${seatId}:${pluginId}`,apply:scope=>{
            scopes.set(seatId,scope);
            seats.set(node.id,active);
            scope.effect(()=>()=>{seats.delete(node.id);},'capability-seat');
          }});
          fibers.push(fiber); await fiber.await();
          wrapped.set(pluginId+'@'+node.pluginVersion,{manifest:jsonSnapshot(active.manifest),invoke:async(arg,ctx):Promise<PluginResult>=>{
            const implementation=seats.get(ctx.nodeId);
            if(!implementation) throw new Error('Cordis seat is disposed');
            const inputRef=await this.artifacts.put(Buffer.from(JSON.stringify(jsonSnapshot(arg??null))),'application/json');
            const result=await implementation.invoke(jsonSnapshot(arg??null),ctx);
            const outputRef=await this.artifacts.put(Buffer.from(JSON.stringify(jsonSnapshot(result.output??null))),'application/json');
            ctx.emit({type:'plugin/artifacts',payload:{inputRef,outputRef}});
            return jsonSnapshot({...result,output:result.output??null});
          }});
        }
        for(const binding of version.bindings){
          const factory=this.options.lifecycle?.get(binding.plugin.id+'@'+binding.plugin.version)??this.options.lifecycle?.get(binding.plugin.id);
          const node=plan.topology.nodes.find(n=>(n.seatId??n.id)===binding.seatId);
          if(!factory){continue}
          const plugin=factory();
          let scope=scopes.get(binding.seatId);
          if(!scope){const fiber=root.plugin({name:'seat:'+binding.seatId,apply:ctx=>{scopes.set(binding.seatId,ctx)}});fibers.push(fiber);await fiber.await();scope=scopes.get(binding.seatId)!}
          scope.effect(()=>()=>plugin.dispose(),'lifecycle-dispose');
          const op=executionId+':lifecycle:'+binding.seatId;
          append({operationId:op,parentOperationId:executionId,seatId:binding.seatId,pluginId:binding.plugin.id,pluginVersion:binding.plugin.version,type:'lifecycle/start',status:'started'});
          try{
            await plugin.activate({execution:{id:executionId,agentId:request.agentId,agentVersionId:version.id,status:'running',rootRevisionBefore:0},agentVersion:version,
              principal:{agentId:request.agentId,agentVersionId:version.id,executionId,seatId:binding.seatId},
              gateway:this.options.gateway??{invoke:async()=>{throw new Error('Gateway capability denied')}},
              record:event=>append({...event,operationId:op,phase:'fact',status:'started'})});
            append({operationId:op,type:'lifecycle/end',status:'succeeded'});
          }catch(error){append({operationId:op,type:'lifecycle/end',status:'failed',payload:{error:String(error)}});throw error}
        }
        const executor=new TopologyExecutor({agentId:request.agentId,agentVersionId:version.id,executionId,plugins:wrapped,signal:request.signal,emit:record=>{
          if(record.type==='plugin/late'){this.sessions.append({id:crypto.randomUUID(),sessionId,type:'harness/late',payload:{executionId,requestId:request.requestId,record:jsonSnapshot(record)}});return;}
          const op=String(record.operationId??`${executionId}:skipped:${String(record.nodeId)}`);
          const meta={nodeId:String(record.nodeId),seatId:String(record.seatId??record.nodeId),pluginId:String(record.pluginId??record.nodeId),...(typeof record.pluginVersion==='string'?{pluginVersion:record.pluginVersion}:{})};
          const payload=jsonSnapshot(Object.fromEntries(Object.entries(record).filter(([,value])=>value!==undefined)));
          if(record.type==='node/skipped') {
            append({operationId:op,parentOperationId:executionId,type:'node/start',status:'started',...meta,payload});
            append({operationId:op,type:'node/end',status:'skipped',...meta,payload});return;
          }
          if(record.type==='node/end') {
            for(const event of (Array.isArray(record.events)?record.events:[]) as {type:string;payload?:unknown}[]) {
              append({operationId:op,type:event.type,phase:'fact',status:'started',...meta,...(event.payload===undefined?{}:{payload:event.payload})});
            }
          }
          const phase=record.type==='node/start'?'start':record.type==='node/end'?'end':'fact';
          const rawStatus=String(record.status??'started');
          const traceStatus:TraceStatus=['started','succeeded','failed','cancelled','unknown','skipped'].includes(rawStatus)?rawStatus as TraceStatus:'unknown';
          append({operationId:op,...(phase==='start'?{parentOperationId:executionId,dependencyOperationIds:Array.isArray(record.dependencyOperationIds)?record.dependencyOperationIds as string[]:[]}:{}),type:String(record.type),phase,status:traceStatus,...meta,payload});
        }});
        output=(await executor.run(plan.topology,input)).output;
      } catch(error) {status=request.signal?.aborted?'cancelled':'failed';failure=error instanceof Error?error.message:String(error);}
      finally {
        for(const fiber of fibers.reverse()) {
          try {await fiber.dispose();}catch(error){status='failed';failure='Cordis cleanup failed: '+String(error);}
        }
      }
      if(persistenceFailed) throw new Error('Trace persistence failed: '+failure);
      const current=aggregator.finish(executionId);
      for(const op of current.openOperations.filter(id=>id!==executionId).reverse()) {
        append({operationId:op,type:'operation/interrupted',status:'unknown',payload:{reason:failure??'Missing terminal'}});
        status='interrupted';
      }
      append({operationId:executionId,type:'execution/end',status:status==='completed'?'succeeded':status==='interrupted'?'unknown':status, payload:{status,...(failure?{error:failure}:{}),...(output===undefined?{}:{output})}});
      return {executionId,status,...(output===undefined?{}:{output}),...(failure?{error:failure}:{}),trace:aggregator.finish(executionId)};
    } finally {release();}
  }

  private restore(sessionId:string,executionId:string):AgentRunResult {
    const agg=new AgentTraceAggregator();
    for(const row of this.sessions.events(sessionId)) {
      if(row.type==='harness/trace' && (row.payload as TraceEvent).executionId===executionId) agg.append(row.payload as TraceEvent);
    }
    let trace=agg.finish(executionId);
    // Reopening never executes a pending plugin: its external result may be unknown.
    for(const operationId of [...trace.openOperations].reverse()) {
      const event:TraceEvent={id:crypto.randomUUID(),executionId,operationId,type:operationId===executionId?'execution/end':'operation/interrupted',status:'unknown',timestamp:Date.now(),payload:{status:'interrupted',error:'Previous owner stopped; reconcile unknown outcomes before new execution.'}};
      agg.append(event);this.sessions.append({id:event.id,sessionId,type:'harness/trace',payload:event});
    }
    trace=agg.finish(executionId);
    const terminal=trace.events.find(event=>event.type==='execution/end');
    const payload=terminal?.payload as {status?:AgentRunResult['status'];output?:unknown;error?:string}|undefined;
    return {executionId,status:payload?.status??'interrupted',...(payload?.output===undefined?{}:{output:payload.output}),...(payload?.error?{error:payload.error}:{}),trace};
  }
}
