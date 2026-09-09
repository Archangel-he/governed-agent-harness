import type {JsonlSessionStore} from '../services/file-store.js';
import type {TraceEvent} from '../trace/events.js';
import type {AgentVersion} from '../contracts/domain.js';
import type {EvidenceSourceResolver,PersistedExecutionEvidence} from '../governance/experiment.js';
import {AgentTraceAggregator} from '../trace/aggregator.js';
import {evidenceDigest} from '../governance/evaluation.js';

export class RuntimeEvidenceSourceResolver implements EvidenceSourceResolver {
 constructor(private readonly sessions:JsonlSessionStore,private readonly agentIds:readonly string[]) {}
 async resolve(executionId:string):Promise<PersistedExecutionEvidence>{
  for(const agentId of this.agentIds){
   const rows=this.sessions.events('agent:'+agentId);
   const request=rows.find(r=>r.type==='harness/request'&&(r.payload as {executionId?:string}).executionId===executionId);
   if(!request)continue;
   const p=request.payload as {version:AgentVersion;input:unknown;environmentSnapshot:unknown;memory?:{releaseId:string};digest:string};
   if(evidenceDigest({version:p.version,input:p.input,environmentSnapshot:p.environmentSnapshot,...(p.memory?{memory:p.memory}:{})})!==p.digest)throw new Error('Persisted evidence digest mismatch');
   const agg=new AgentTraceAggregator();
   for(const row of rows)if(row.type==='harness/trace'&&(row.payload as TraceEvent).executionId===executionId)agg.append(row.payload as TraceEvent);
   const trace=agg.finish(executionId),end=trace.events.find(e=>e.type==='execution/end'&&e.operationId===executionId);
   const seal=rows.find(r=>r.type==='harness/seal'&&(r.payload as {executionId:string}).executionId===executionId);
   if(!seal||(seal.payload as {traceDigest:string}).traceDigest!==evidenceDigest(trace.events))throw new Error('Persisted execution seal mismatch');
   if(!end||!trace.complete)throw new Error('Persisted execution is not settled');
   return {executionId,versionId:p.version.id,versionDigest:evidenceDigest(p.version),input:p.input,trace,
    output:(end.payload as {output?:unknown})?.output??null,environmentSnapshot:p.environmentSnapshot,memoryReleaseId:p.memory?.releaseId??'none',memoryDigest:evidenceDigest(p.memory??null)};
  }
  throw new Error('Execution evidence not found: '+executionId);
 }
}
