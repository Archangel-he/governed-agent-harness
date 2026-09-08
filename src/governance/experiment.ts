import type { AgentTrace, TraceEvent } from '../trace/events.js';
import { AgentTraceAggregator } from '../trace/aggregator.js';
import { evaluateTrace, evidenceDigest, type Evaluation, type EvaluationProfile, type TaskOutcome } from './evaluation.js';
import { LocalVersionStore, type LocalVersion } from '../services/version-store.js';
import { jsonSnapshot } from '../services/log-value.js';

export interface CandidateChange {
  id:string;
  baselineVersionId:string;
  candidateVersionId:string;
  hypothesis:string;
  evidenceEventIds:string[];
}
interface Trial {
  executionId:string;
  versionId:string;
  events:TraceEvent[];
  output:unknown;
  outcome:TaskOutcome;
  evaluation:Evaluation;
}
export interface ExperimentReport {
  candidate:CandidateChange;
  baselineDigest:string;
  candidateDigest:string;
  profile:EvaluationProfile;
  cases:{id:string;input:unknown;baseline:Trial;candidate:Trial}[];
  passed:boolean;
  baselineScore:number;
  candidateScore:number;
  evidenceDigest:string;
}

function rebuild(trial:Trial):AgentTrace {
  const agg=new AgentTraceAggregator();
  for(const event of trial.events) {
    if(event.agentVersionId!==undefined&&event.agentVersionId!==trial.versionId)throw new Error('Trace version evidence mismatch');
    agg.append(event);
  }
  return agg.finish(trial.executionId);
}
function assess(report:Omit<ExperimentReport,'passed'|'baselineScore'|'candidateScore'|'evidenceDigest'>) {
  const baseline=report.cases.map(row=>evaluateTrace(rebuild(row.baseline),report.profile,row.baseline.outcome));
  const candidate=report.cases.map(row=>evaluateTrace(rebuild(row.candidate),report.profile,row.candidate.outcome));
  const average=(values:Evaluation[])=>values.reduce((total,value)=>total+value.score,0)/values.length;
  const baselineScore=average(baseline),candidateScore=average(candidate);
  // No local/plugin improvement can excuse task-quality or safety regression on a case.
  const passed=candidate.length>0&&candidate.every((result,index)=>result.passed&&result.metrics.quality>=baseline[index].metrics.quality)&&candidateScore>=baselineScore;
  return{passed,baselineScore,candidateScore};
}

export async function runExperiment(
  versions:LocalVersionStore,candidate:CandidateChange,cases:{id:string;input:unknown}[],profile:EvaluationProfile,
  run:(version:LocalVersion,input:unknown)=>Promise<{trace:AgentTrace;output?:unknown}>,
  judge:(input:unknown,output:unknown)=>TaskOutcome
):Promise<ExperimentReport> {
  if(!candidate.id||!candidate.hypothesis||!candidate.evidenceEventIds.length||candidate.baselineVersionId===candidate.candidateVersionId)throw new Error('Candidate identity, hypothesis and evidence required');
  if(!cases.length||new Set(cases.map(row=>row.id)).size!==cases.length)throw new Error('Nonempty unique replay cases required');
  const baselineVersion=versions.get(candidate.baselineVersionId),candidateVersion=versions.get(candidate.candidateVersionId);
  const frozenCases=jsonSnapshot(cases),rows:ExperimentReport['cases']=[];
  const trial=async(version:LocalVersion,input:unknown):Promise<Trial>=>{
    const result=await run(jsonSnapshot(version),jsonSnapshot(input));
    const outcome=jsonSnapshot(judge(jsonSnapshot(input),jsonSnapshot(result.output??null)));
    const evaluation=evaluateTrace(result.trace,profile,outcome);
    return {executionId:result.trace.executionId,versionId:version.id,events:jsonSnapshot(result.trace.events),output:jsonSnapshot(result.output??null),outcome,evaluation};
  };
  for(const row of frozenCases)rows.push({id:row.id,input:row.input,baseline:await trial(baselineVersion,row.input),candidate:await trial(candidateVersion,row.input)});
  const evidence={candidate:jsonSnapshot(candidate),baselineDigest:evidenceDigest(baselineVersion),candidateDigest:evidenceDigest(candidateVersion),profile:jsonSnapshot(profile),cases:rows};
  return {...evidence,...assess(evidence),evidenceDigest:evidenceDigest(evidence)};
}

export function promoteCandidate(versions:LocalVersionStore,report:ExperimentReport,approved:boolean):{versionId:string;rollbackVersionId:string;evidenceDigest:string;releaseRef:string} {
  if(!approved)throw new Error('Local release approval required');
  const {passed:_,baselineScore:__,candidateScore:___,evidenceDigest:expected,...evidence}=jsonSnapshot(report);
  if(evidenceDigest(evidence)!==expected)throw new Error('Experiment evidence was modified');
  if(evidenceDigest(versions.get(report.candidate.baselineVersionId))!==report.baselineDigest||evidenceDigest(versions.get(report.candidate.candidateVersionId))!==report.candidateDigest)throw new Error('Version evidence mismatch');
  if(!assess(evidence).passed)throw new Error('Whole-agent release gate rejected candidate');
  if(versions.active().id!==report.candidate.baselineVersionId)throw new Error('Active baseline changed');
  const releaseDigest=versions.recordRelease(evidence);
  if(evidenceDigest(versions.release(releaseDigest))!==expected)throw new Error('Release evidence persistence mismatch');
  versions.activate(report.candidate.candidateVersionId,report.candidate.baselineVersionId);
  return {versionId:report.candidate.candidateVersionId,rollbackVersionId:report.candidate.baselineVersionId,evidenceDigest:expected,releaseRef:releaseDigest};
}
