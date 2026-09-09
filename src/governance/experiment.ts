import type {AgentTrace,TraceEvent} from '../trace/events.js';
import {AgentTraceAggregator} from '../trace/aggregator.js';
import {evaluateTrace,evidenceDigest,type Evaluation,type EvaluationProfile,type TaskOutcome} from './evaluation.js';
import {LocalVersionStore,type LocalVersion} from '../services/version-store.js';
import {jsonSnapshot} from '../services/log-value.js';

export interface CandidateChange {id:string;baselineVersionId:string;candidateVersionId:string;hypothesis:string;evidenceEventIds:string[];sourceExecutionIds:string[];candidateEvaluationDigest?:string}
export interface PersistedExecutionEvidence {executionId:string;versionId:string;versionDigest:string;input:unknown;trace:AgentTrace;output:unknown;environmentSnapshot:unknown;memoryReleaseId:string;memoryDigest:string}
export interface EvidenceSourceResolver {resolve(executionId:string):Promise<PersistedExecutionEvidence>|PersistedExecutionEvidence}
export interface ExperimentEvaluator {id:string;version:string;judge(input:unknown,output:unknown,expected?:unknown):TaskOutcome}
interface Trial {executionId:string;versionId:string;events:TraceEvent[];output:unknown;outcome:TaskOutcome;evaluation:Evaluation;environmentSnapshot:unknown;memoryReleaseId:string;memoryDigest:string}
interface Source {executionId:string;digest:string}
export interface ExperimentReport {
 candidate:CandidateChange;baselineDigest:string;candidateDigest:string;profile:EvaluationProfile;
 evaluationDigest?:string;
 evaluator:{id:string;version:string;implementationDigest:string};sources:Source[];
 cases:{id:string;input:unknown;expected?:unknown;baseline:Trial;candidate:Trial}[];
 passed:boolean;baselineScore:number;candidateScore:number;evidenceDigest:string;
}
type Evidence=Omit<ExperimentReport,'passed'|'baselineScore'|'candidateScore'|'evidenceDigest'>;
function rebuild(trial:Trial):AgentTrace {
 const agg=new AgentTraceAggregator();
 for(const event of trial.events){if(event.executionId!==trial.executionId||event.agentVersionId!==trial.versionId)throw new Error('Trace provenance mismatch');agg.append(event)}
 return agg.finish(trial.executionId);
}
function assess(report:Evidence){
 const baseline=report.cases.map(row=>evaluateTrace(rebuild(row.baseline),report.profile,row.baseline.outcome));
 const candidate=report.cases.map(row=>evaluateTrace(rebuild(row.candidate),report.profile,row.candidate.outcome));
 const average=(values:Evaluation[])=>values.reduce((n,v)=>n+v.score,0)/values.length;
 const baselineScore=average(baseline),candidateScore=average(candidate);
 const passed=candidate.length>0&&candidate.every((v,i)=>v.passed&&v.metrics.quality>=baseline[i].metrics.quality)&&candidateScore>=baselineScore;
 return {passed,baselineScore,candidateScore};
}
function sourceDigest(source:PersistedExecutionEvidence):string {
 const {trace,...rest}=source;return evidenceDigest({...rest,events:trace.events});
}
function same(a:unknown,b:unknown,message:string):void {if(evidenceDigest(a)!==evidenceDigest(b))throw new Error(message)}
async function checkSources(change:CandidateChange,resolver:EvidenceSourceResolver,baselineDigest:string):Promise<Source[]> {
 if(!resolver||!change.sourceExecutionIds?.length||new Set(change.sourceExecutionIds).size!==change.sourceExecutionIds.length)throw new Error('Unique persisted source executions required');
 if(!change.evidenceEventIds.length||new Set(change.evidenceEventIds).size!==change.evidenceEventIds.length)throw new Error('Unique evidence events required');
 const found=new Set<string>(),sources:Source[]=[];
 for(const id of change.sourceExecutionIds){
  const source=await resolver.resolve(id);
  if(source.executionId!==id||source.versionId!==change.baselineVersionId||source.versionDigest!==baselineDigest)throw new Error('Persisted source provenance mismatch');
  let used=false;
  for(const event of source.trace.events)if(change.evidenceEventIds.includes(event.id)){
   if(event.executionId!==id||event.agentVersionId!==source.versionId)throw new Error('Persisted event provenance mismatch');
   found.add(event.id);used=true;
  }
  if(!used)throw new Error('Source has no referenced evidence');
  sources.push({executionId:id,digest:sourceDigest(source)});
 }
 if(found.size!==change.evidenceEventIds.length)throw new Error('Evidence event is not persisted in cited executions');
 return sources;
}
async function checkTrial(trial:Trial,input:unknown,expected:unknown,versionDigest:string,resolver:EvidenceSourceResolver,evaluator:ExperimentEvaluator):Promise<void>{
 const source=await resolver.resolve(trial.executionId);
 if(source.executionId!==trial.executionId||source.versionId!==trial.versionId||source.versionDigest!==versionDigest)throw new Error('Persisted trial version provenance mismatch');
 same({input,events:trial.events,output:trial.output,environmentSnapshot:trial.environmentSnapshot,memoryReleaseId:trial.memoryReleaseId,memoryDigest:trial.memoryDigest},
 {input:source.input,events:source.trace.events,output:source.output,environmentSnapshot:source.environmentSnapshot,memoryReleaseId:source.memoryReleaseId,memoryDigest:source.memoryDigest},'Persisted trial provenance mismatch');
 same(evaluator.judge(jsonSnapshot(input),jsonSnapshot(source.output),expected===undefined?undefined:jsonSnapshot(expected)),trial.outcome,'Evaluator outcome mismatch');
}
export async function runExperiment(
 versions:LocalVersionStore,candidate:CandidateChange,cases:{id:string;input:unknown;expected?:unknown}[],profile:EvaluationProfile,
 run:(version:LocalVersion,input:unknown)=>Promise<{trace:AgentTrace;output?:unknown}>,evaluator:ExperimentEvaluator,resolver:EvidenceSourceResolver
):Promise<ExperimentReport>{
 if(!candidate.id||!candidate.hypothesis||candidate.baselineVersionId===candidate.candidateVersionId)throw new Error('Candidate identity and hypothesis required');
 if(!cases.length||cases.some(c=>!c.id)||new Set(cases.map(c=>c.id)).size!==cases.length)throw new Error('Unique nonempty replay cases required');
 if(!evaluator.id||!evaluator.version)throw new Error('Evaluator identity/version required');
 const base=versions.get(candidate.baselineVersionId),next=versions.get(candidate.candidateVersionId);
 if(candidate.candidateEvaluationDigest!==undefined && candidate.candidateEvaluationDigest!==next.evaluationDigest)throw new Error('Candidate evaluation package mismatch');
 if(base.evaluationDigest!==undefined || next.evaluationDigest!==undefined){if(!base.evaluationDigest||base.evaluationDigest!==next.evaluationDigest)throw new Error('Baseline and candidate evaluation package mismatch')}
 const baselineDigest=evidenceDigest(base),candidateDigest=evidenceDigest(next);
 const sources=await checkSources(candidate,resolver,baselineDigest);
 const rows:ExperimentReport['cases']=[];
 const trial=async(version:LocalVersion,input:unknown,expected?:unknown):Promise<Trial>=>{
  const result=await run(jsonSnapshot(version),jsonSnapshot(input)),source=await resolver.resolve(result.trace.executionId);
  const output=jsonSnapshot(result.output??null),outcome=jsonSnapshot(evaluator.judge(jsonSnapshot(input),output,expected===undefined?undefined:jsonSnapshot(expected)));
  const row:Trial={executionId:result.trace.executionId,versionId:version.id,events:jsonSnapshot(result.trace.events),output,outcome,evaluation:evaluateTrace(result.trace,profile,outcome),environmentSnapshot:jsonSnapshot(source.environmentSnapshot),memoryReleaseId:source.memoryReleaseId,memoryDigest:source.memoryDigest};
  await checkTrial(row,input,expected,evidenceDigest(version),resolver,evaluator);return row;
 };
 for(const c of jsonSnapshot(cases)){
  const baseline=await trial(base,c.input,c.expected),candidateTrial=await trial(next,c.input,c.expected);
  same({environment:baseline.environmentSnapshot,memory:baseline.memoryReleaseId,memoryDigest:baseline.memoryDigest},{environment:candidateTrial.environmentSnapshot,memory:candidateTrial.memoryReleaseId,memoryDigest:candidateTrial.memoryDigest},'Paired experiment environment/memory mismatch');
  rows.push({id:c.id,input:c.input,...(c.expected===undefined?{}:{expected:c.expected}),baseline,candidate:candidateTrial});
 }
 const baseEvaluationDigest=typeof base.evaluationDigest==='string'?base.evaluationDigest:undefined;
 const evidence:Evidence={candidate:jsonSnapshot(candidate),baselineDigest,candidateDigest,profile:jsonSnapshot(profile),...(baseEvaluationDigest?{evaluationDigest:baseEvaluationDigest}:{}),evaluator:{id:evaluator.id,version:evaluator.version,implementationDigest:evidenceDigest(evaluator.judge.toString())},sources,cases:rows};
 return {...evidence,...assess(evidence),evidenceDigest:evidenceDigest(evidence)};
}
export async function promoteCandidate(versions:LocalVersionStore,report:ExperimentReport,approved:boolean,resolver:EvidenceSourceResolver,evaluator:ExperimentEvaluator):Promise<{versionId:string;rollbackVersionId:string;evidenceDigest:string;releaseRef:string}>{
 if(!approved)throw new Error('Local release approval required');
 const {passed:_,baselineScore:__,candidateScore:___,evidenceDigest:expected,...evidence}=jsonSnapshot(report);
 if(evidenceDigest(evidence)!==expected)throw new Error('Experiment evidence was modified');
 same(report.evaluator,{id:evaluator.id,version:evaluator.version,implementationDigest:evidenceDigest(evaluator.judge.toString())},'Evaluator identity/version mismatch');
 if(evidenceDigest(versions.get(report.candidate.baselineVersionId))!==report.baselineDigest||evidenceDigest(versions.get(report.candidate.candidateVersionId))!==report.candidateDigest)throw new Error('Version evidence mismatch');
 const baselineVersion=versions.get(report.candidate.baselineVersionId),candidateVersion=versions.get(report.candidate.candidateVersionId);
 if(report.evaluationDigest!==undefined && (baselineVersion.evaluationDigest!==report.evaluationDigest||candidateVersion.evaluationDigest!==report.evaluationDigest))throw new Error('Evaluation package evidence mismatch');
 same(await checkSources(report.candidate,resolver,report.baselineDigest),report.sources,'Persisted source evidence changed');
 const executionIds=new Set<string>();
 for(const row of report.cases){
  if(row.baseline.versionId!==report.candidate.baselineVersionId||row.candidate.versionId!==report.candidate.candidateVersionId)throw new Error('Trial version provenance mismatch');
  for(const trial of [row.baseline,row.candidate]){if(executionIds.has(trial.executionId))throw new Error('Duplicate trial execution');executionIds.add(trial.executionId)}
  await checkTrial(row.baseline,row.input,row.expected,report.baselineDigest,resolver,evaluator);
  await checkTrial(row.candidate,row.input,row.expected,report.candidateDigest,resolver,evaluator);
  same({environment:row.baseline.environmentSnapshot,memory:row.baseline.memoryReleaseId,memoryDigest:row.baseline.memoryDigest},{environment:row.candidate.environmentSnapshot,memory:row.candidate.memoryReleaseId,memoryDigest:row.candidate.memoryDigest},'Paired experiment environment/memory mismatch');
 }
 if(!assess(evidence).passed)throw new Error('Whole-agent release gate rejected candidate');
 if(versions.active().id!==report.candidate.baselineVersionId)throw new Error('Active baseline changed');
 const releaseRef=versions.recordRelease(evidence);
 if(evidenceDigest(versions.release(releaseRef))!==expected)throw new Error('Release evidence persistence mismatch');
 versions.activate(report.candidate.candidateVersionId,report.candidate.baselineVersionId);
 return {versionId:report.candidate.candidateVersionId,rollbackVersionId:report.candidate.baselineVersionId,evidenceDigest:expected,releaseRef};
}
