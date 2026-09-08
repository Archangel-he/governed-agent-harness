import { MemorySessionStore, MemoryTrajectoryStore } from '../../services/memory.js';
import { AgentLoop } from '../agent-loop.js';
import type { AgentKernel, KernelDependencies, KernelEvent, KernelInput, KernelResult } from '../../contracts/kernel.js';
import { jsonSnapshot } from '../../services/log-value.js';

/** One execution with explicit dependencies; durable event acknowledgement precedes effects. */
export class StatelessAgentKernel implements AgentKernel {
  async run(input:KernelInput,deps:KernelDependencies,signal=new AbortController().signal):Promise<KernelResult> {
    const events:KernelEvent[]=[];
    if(signal.aborted)return {executionId:input.executionId,status:'cancelled',error:String(signal.reason),events,trajectory:[]};
    const sessions=new MemorySessionStore(),trajectories=new MemoryTrajectoryStore();
    const loop=new AgentLoop('kernel:'+input.executionId,input.version,sessions,{
      systemPrompt:input.systemPrompt,model:deps.model,tools:deps.tools,maxSteps:deps.maxSteps??16,maxRetries:deps.maxRetries,requestErrorHandlers:deps.requestErrorHandlers,retryDelayMs:deps.retryDelayMs,
      eventSink:async event=>{
        const row:KernelEvent={sequence:events.length+1,executionId:input.executionId,type:event.type,payload:jsonSnapshot(event.payload)};
        await deps.emit?.(row);
        events.push(row);
      }
    },{store:trajectories,agentId:input.agentId});
    try {
      const result=await loop.run({id:input.executionId,executionId:input.executionId,content:input.userContent,signal});
      return {executionId:input.executionId,status:result.status==='interrupted'?'failed':result.status,...(result.output===undefined?{}:{output:result.output}),...(result.error?{error:result.error}:{}),events,trajectory:trajectories.list(input.executionId)};
    } catch(error) {
      return {executionId:input.executionId,status:signal.aborted?'cancelled':'failed',error:String(error),events,trajectory:trajectories.list(input.executionId)};
    }
  }
}
