import { definePlugin } from '../plugins/contract.js';
import { TopologyExecutor } from '../runtime/topology-executor.js';
import { AgentTraceAggregator } from '../trace/aggregator.js';

const run = async () => {
  const plugins = new Map([
    ['intent', definePlugin({id:'intent',version:'1',capabilitySurface:'decision', async invoke(input){ return {output:{...input as object, decisionReady:true}}; }})],
    ['validate', definePlugin({id:'validate',version:'1',capabilitySurface:'decision', async invoke(input){ return {output:{...input as object, validated:true}}; }})],
    ['select', definePlugin({id:'select',version:'1',capabilitySurface:'tool', async invoke(input){ return {output:{...input as object, tool:'echo'}}; }})],
    ['execute', definePlugin({id:'execute',version:'1',capabilitySurface:'tool', async invoke(input){ return {output:{...input as object, result:'ok'}}; }})]
  ]);
  const execute = async (topology:any, input:any) => { const executionId = crypto.randomUUID(); const events:any[] = []; const result = await new TopologyExecutor({agentId:'acceptance',agentVersionId:'v1',executionId,plugins,emit:e=>events.push(e)}).run(topology,input); const agg = new AgentTraceAggregator(); for (const event of events) agg.append({id: crypto.randomUUID(), executionId, type:String(event.type), operationId:String(event.operationId), nodeId:String(event.nodeId), status:event.status}); return { ...result, trace: agg.finish(executionId) }; };
  const decision = await execute({id:'decision',version:'1',entry:['intent'],nodes:[{id:'intent',kind:'capability',pluginId:'intent'},{id:'validate',kind:'validation',pluginId:'validate'}],edges:[{from:'intent',to:'validate',kind:'data'}]}, {task:'choose'});
  const tool = await execute({id:'tool',version:'1',entry:['select'],nodes:[{id:'select',kind:'capability',pluginId:'select'},{id:'execute',kind:'tool',pluginId:'execute'}],edges:[{from:'select',to:'execute',kind:'data'}]}, {task:'run'});
  if (!(decision.output as any).validated || (tool.output as any).result !== 'ok' || !decision.trace.complete || !tool.trace.complete) throw new Error('acceptance failed');
  console.log(JSON.stringify({ok:true, decision:decision.output, tool:tool.output, decisionTrace:decision.trace.events.length, toolTrace:tool.trace.events.length}));
};
run();


