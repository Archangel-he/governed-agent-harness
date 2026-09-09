import type {AgentTrace} from '../trace/events.js';
import type {TopologyDefinition} from '../topology/schema.js';
import {AgentTraceAggregator} from '../trace/aggregator.js';
import type {ExperimentReport} from './experiment.js';
import {evidenceDigest} from './evaluation.js';

export interface AttributionHypothesis {
 executionId:string;taskInputDigest:string;upstreamNodeId:string;downstreamNodeId:string;
 upstreamOperationId:string;downstreamOperationId:string;
 statement:string;evidenceEventIds:string[];upstreamOutputDigest:string;downstreamInputDigest:string;
}
/** Dependency plus actual I/O supports a hypothesis, never proof of causation. */
export function attributeTrace(trace:AgentTrace,topology:TopologyDefinition):AttributionHypothesis[]{
 const agg=new AgentTraceAggregator();for(const event of trace.events)agg.append(event);
 const rebuilt=agg.finish(trace.executionId),out:AttributionHypothesis[]=[];
 const root=trace.events.find(e=>e.type==='execution/start'&&e.operationId===trace.executionId);
 const taskInputDigest=(root?.payload as {inputDigest?:string})?.inputDigest;if(!taskInputDigest)return out;
 for(const downstream of rebuilt.operations.values()){
  if(downstream.status!=='failed'||!downstream.nodeId)continue;
  const start=rebuilt.events.find(e=>e.id===downstream.startEventId)!;
  const end=rebuilt.events.find(e=>e.id===downstream.terminalEventId)!;
  const input=(start.payload as {input?:unknown})?.input;
  if(input===undefined)continue;
  for(const upstreamId of downstream.dependencyOperationIds){
   const upstream=rebuilt.operations.get(upstreamId);
   if(!upstream?.nodeId||upstream.status!=='succeeded')continue;
   const edge=topology.edges.find(e=>e.kind==='data'&&e.from===upstream.nodeId&&e.to===downstream.nodeId);
   if(!edge)continue;
   const source=rebuilt.events.find(e=>e.id===upstream.terminalEventId)!;
   const output=(source.payload as {output?:unknown})?.output;
   if(output===undefined)continue;
   const direct=evidenceDigest(input)===evidenceDigest(output);
   const selected=input&&typeof input==='object'?(input as Record<string,unknown>)[edge.port??edge.from]:undefined;
   if(!direct&&(selected===undefined||evidenceDigest(selected)!==evidenceDigest(output)))continue;
   out.push({executionId:trace.executionId,taskInputDigest,upstreamNodeId:upstream.nodeId,downstreamNodeId:downstream.nodeId,
    upstreamOperationId:upstreamId,downstreamOperationId:downstream.operationId,
    statement:`Test whether ${upstream.nodeId} output quality contributes to ${downstream.nodeId} failure.`,
    evidenceEventIds:[source.id,start.id,end.id],upstreamOutputDigest:evidenceDigest(output),downstreamInputDigest:evidenceDigest(input)});
  }
 }
 return out;
}
/** Only a single upstream-node intervention can support this attribution in a paired replay. */
export function assessAttribution(hypothesis:AttributionHypothesis,report:ExperimentReport,baseline:TopologyDefinition,candidate:TopologyDefinition):{status:'supported'|'not-supported';reason:string}{
 const changed=baseline.nodes.filter(node=>{
  const next=candidate.nodes.find(n=>n.id===node.id);return !next||evidenceDigest(node)!==evidenceDigest(next);
 });
 const controlled=baseline.nodes.length===candidate.nodes.length&&changed.length===1&&changed[0].id===hypothesis.upstreamNodeId&&evidenceDigest(baseline.edges)===evidenceDigest(candidate.edges)&&evidenceDigest(baseline.entry)===evidenceDigest(candidate.entry);
 const cited=report.candidate.sourceExecutionIds.includes(hypothesis.executionId)&&hypothesis.evidenceEventIds.every(id=>report.candidate.evidenceEventIds.includes(id));
 const recovered=report.cases.some(row=>evidenceDigest(row.input)===hypothesis.taskInputDigest&&row.baseline.events.some(e=>e.nodeId===hypothesis.downstreamNodeId&&e.type==='node/end'&&e.status==='failed')&&row.candidate.events.some(e=>e.nodeId===hypothesis.downstreamNodeId&&e.type==='node/end'&&e.status==='succeeded'));
 return controlled&&cited&&recovered&&report.passed?{status:'supported',reason:'A paired upstream intervention recovered the downstream node and passed whole-Agent gates; support is limited to these cases.'}:{status:'not-supported',reason:'Requires cited source evidence, one upstream intervention, downstream recovery and whole-Agent gates.'};
}
