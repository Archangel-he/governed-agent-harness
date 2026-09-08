import { compileTopology } from './compiler.js';
import { freezeTopology, type TopologyDefinition, type TopologyNode } from './schema.js';
import { checkValue } from './value-schema.js';
import { jsonSnapshot } from '../services/log-value.js';
import type { CapabilityPlugin, PluginResult } from '../plugins/capability.js';

interface ExecutorOptions {
  agentId:string; agentVersionId:string; executionId:string;
  plugins:Map<string,CapabilityPlugin>;
  emit:(event:Record<string,unknown>)=>void;
  signal?:AbortSignal;
}
export class TopologyExecutor {
  constructor(private readonly options:ExecutorOptions) {}
  async run(definition:TopologyDefinition,input:unknown):Promise<{output:unknown;results:Map<string,PluginResult>}> {
    const plan=compileTopology(definition), topology=plan.topology;
    const initial=jsonSnapshot(input??null);
    const results=new Map<string,PluginResult>();
    const lastOperations=new Map<string,string>();
    const skipped=new Set<string>();
    const forcedSkip=new Set<string>();
    const plugins=new Map<string,CapabilityPlugin>();
    // Resolve and validate the entire version before allowing any plugin side effect.
    for(const node of topology.nodes) {
      const id=node.pluginId??node.id,plugin=this.options.plugins.get(id+'@'+node.pluginVersion)??this.options.plugins.get(id);
      if(!plugin||plugin.manifest.id!==id)throw new Error('plugin not registered: '+id);
      if(node.pluginVersion&&node.pluginVersion!==plugin.manifest.version)throw new Error('plugin version mismatch: '+id);
      if(node.failurePolicy?.mode==='retry'&&(plugin.manifest.sideEffects?.length??0)>0&&!plugin.manifest.idempotent)throw new Error('Unsafe retry for non-idempotent plugin: '+id);
      plugins.set(node.id,plugin);
    }
    const controller=new AbortController();
    const cancel=()=>controller.abort(this.options.signal?.reason??new Error('cancelled'));
    this.options.signal?.addEventListener('abort',cancel,{once:true});
    if(this.options.signal?.aborted)cancel();
    let stop=false,stopOutput:unknown,sequence=0,persistenceFailed=false;
    const emit=(event:Record<string,unknown>)=>{
      if(persistenceFailed)throw new Error('event sink failed');
      try{this.options.emit({...event,timestamp:Date.now()})}catch(error){persistenceFailed=true;controller.abort(error);throw error}
    };
    const runNode=async(nodeId:string):Promise<void>=>{
      const node=topology.nodes.find(n=>n.id===nodeId)!;
      const incoming=topology.edges.filter(e=>e.to===nodeId&&e.kind!=='observation');
      const active=incoming.filter(edge=>{
        if(skipped.has(edge.from))return false;
        const control=results.get(edge.from)?.control;
        return edge.when===undefined||(control?.type==='select'&&control.port===edge.when);
      });
      if(stop||forcedSkip.has(nodeId)||(incoming.length>0&&active.length===0)) {
        if(node.required)throw new Error('Required policy node would be skipped: '+nodeId);
        skipped.add(nodeId);emit({type:'node/skipped',nodeId,status:'skipped',reason:stop?'stop':'branch'});return;
      }
      controller.signal.throwIfAborted();
      const data=active.filter(e=>e.kind==='data');
      let arg=data.length===0?initial:data.length===1?results.get(data[0].from)?.output??null:Object.fromEntries(data.map(e=>[e.port??e.from,results.get(e.from)?.output??null]));
      const plugin=plugins.get(nodeId)!;
      const dependencies=active.map(e=>lastOperations.get(e.from)).filter((id):id is string=>!!id);
      let iteration=0;
      while(true) {
        const attempts=node.failurePolicy?.mode==='retry'?node.failurePolicy.maxAttempts!:1;
        let result:PluginResult|undefined;
        for(let attempt=1;attempt<=attempts;attempt++) {
          controller.signal.throwIfAborted();
          checkValue(arg,node.inputSchema,'input:'+nodeId);
          const operationId=`${this.options.executionId}:${nodeId}:${++sequence}`;
          let operationOpen=true;
          const metadata={operationId,nodeId,seatId:node.seatId??nodeId,pluginId:plugin.manifest.id,pluginVersion:plugin.manifest.version,iteration,attempt};
          emit({type:'node/start',status:'started',...metadata,input:arg,dependencyOperationIds:[...dependencies]});
          try {
            result=jsonSnapshot(await plugin.invoke(jsonSnapshot(arg),Object.freeze({
              executionId:this.options.executionId,agentId:this.options.agentId,agentVersionId:this.options.agentVersionId,nodeId,seatId:node.seatId??nodeId,operationId,signal:controller.signal,config:freezeTopology(node.config??{}),
              emit:(event:{type:string;payload?:unknown})=>{if(!operationOpen){const late=`${operationId}:late:${++sequence}`;emit({type:'plugin/late',operationId:late,nodeId,status:'unknown',phase:'fact',parentOperationId:operationId,payload:{event:jsonSnapshot(event)}});return}emit({type:event.type,...metadata,status:'started',phase:'fact',...(event.payload===undefined?{}:{payload:jsonSnapshot(event.payload)})})}
            })));
            controller.signal.throwIfAborted();
            checkValue(result.output??null,node.outputSchema,'output:'+nodeId);
            if(result.control&&!['continue','select','loop','skip','stop'].includes(result.control.type))throw new Error('Unknown ControlSignal');
            if(result.control?.type==='skip'&&!Array.isArray(result.control.nodeIds))throw new Error('Invalid skip control');
            const selectedPort=result.control?.type==='select'?result.control.port:undefined;
            if(selectedPort!==undefined&&!topology.edges.some(e=>e.from===nodeId&&e.when===selectedPort))throw new Error('Unknown branch port: '+selectedPort);
            if(result.control?.type==='loop'&&(!node.loop||iteration+1>=node.loop.maxIterations))throw new Error('loop maxIterations bound exceeded: '+nodeId);
            if(result.control?.type==='skip')for(const id of result.control.nodeIds){if(!topology.nodes.some(n=>n.id===id))throw new Error('Unknown skipped node');forcedSkip.add(id)}
            for(const edge of topology.edges.filter(e=>e.kind==='observation'&&e.from===nodeId))emit({type:'node/observation',...metadata,status:'started',phase:'fact',observerNodeId:edge.to,output:result.output??null});
            operationOpen=false;
            emit({type:'node/end',status:'succeeded',...metadata,output:result.output??null,...(result.control?{control:result.control}:{})});
            lastOperations.set(nodeId,operationId);dependencies.splice(0,dependencies.length,operationId);
            break;
          } catch(error) {
            if(persistenceFailed)throw error;
            const unknown=controller.signal.aborted&&(plugin.manifest.sideEffects?.length??0)>0;
            const status=unknown?'unknown':controller.signal.aborted?'cancelled':'failed';
            const retry=!controller.signal.aborted&&attempt<attempts;
            if(retry)emit({type:'node/retry',...metadata,status:'started',phase:'fact',error:String(error)});
            operationOpen=false;
            emit({type:'node/end',status,...metadata,error:String(error),retry});
            lastOperations.set(nodeId,operationId);
            if(retry)continue;
            if(node.failurePolicy?.mode==='continue'&&!unknown&&!controller.signal.aborted){result={output:{error:String(error)}};break}
            controller.abort(error);throw error;
          }
        }
        results.set(nodeId,result!);
        if(result!.control?.type==='loop'){arg=result!.output??null;iteration++;continue}
        if(result!.control?.type==='stop'){stop=true;stopOutput=result!.output??null}
        return;
      }
    };
    try {
      for(const stage of plan.stages) {
        const settled=await Promise.allSettled(stage.map(runNode));
        const failure=settled.find((row):row is PromiseRejectedResult=>row.status==='rejected');
        if(failure)throw failure.reason;
      }
      controller.signal.throwIfAborted();
      const terminal=plan.terminals.filter(id=>results.has(id)&&!skipped.has(id));
      const output=stop?stopOutput:terminal.length===1?results.get(terminal[0])!.output??null:Object.fromEntries(terminal.map(id=>[id,results.get(id)!.output??null]));
      return {output,results};
    } finally {this.options.signal?.removeEventListener('abort',cancel)}
  }
}
