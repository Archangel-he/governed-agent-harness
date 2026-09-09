import {evidenceDigest} from './evaluation.js';

export interface EvaluationEvidence {type:string;eventIds:string[];path?:string;claim:string}
export interface RubricDimension {id:string;description:string;minScore:number;maxScore:number;anchors:Record<string,string>;requiredEvidence?:string[]}
export interface EvaluationRubric {id:string;version:string;dimensions:RubricDimension[];forbiddenBehaviors?:string[]}
export interface DimensionJudgement {dimensionId:string;score:number;claim:string;evidence:EvaluationEvidence[];confidence:number;uncertainty?:string}
export interface StructuredLLMEvaluation {evaluatorId:string;evaluatorVersion:string;modelId:string;promptVersion:string;rubricDigest:string;traceDigest:string;status:'provisional'|'settled'|'needs-review';judgements:DimensionJudgement[];overall?:number;confidence:number;dispersion?:number;evidenceEventIds:string[]}
export interface PairwiseJudgement {winner:'baseline'|'candidate'|'tie'|'uncertain';margin:'small'|'large';reasons:string[];regressions:string[];confidence:number;evidenceEventIds:string[]}

export function aggregateLLMEvaluation(input:{rubric:EvaluationRubric;judgements:DimensionJudgement[];traceDigest:string;evaluatorId:string;evaluatorVersion:string;modelId:string;promptVersion:string;provisional?:boolean}):StructuredLLMEvaluation {
  const ids=new Set(input.rubric.dimensions.map(d=>d.id));
  if(input.judgements.some(j=>!ids.has(j.dimensionId)||!Number.isFinite(j.score)||!Number.isFinite(j.confidence)||j.confidence<0||j.confidence>1))throw new Error('Invalid LLM judgement');
  const scores=input.judgements.map(j=>j.score),confidence=scores.length?scores.reduce((sum,_,i)=>sum+input.judgements[i].confidence,0)/scores.length:0;
  const mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:undefined;
  const dispersion=scores.length?Math.sqrt(scores.reduce((sum,s)=>sum+(s-(mean??0))**2,0)/scores.length):undefined;
  const status=confidence<.6||(dispersion!==undefined&&dispersion>1.2)?'needs-review':input.provisional?'provisional':'settled';
  return {evaluatorId:input.evaluatorId,evaluatorVersion:input.evaluatorVersion,modelId:input.modelId,promptVersion:input.promptVersion,rubricDigest:evidenceDigest(input.rubric),traceDigest:input.traceDigest,status,judgements:input.judgements.map(j=>({...j,evidence:j.evidence.map(e=>({...e,eventIds:[...e.eventIds]}))})),overall:mean,confidence,dispersion,evidenceEventIds:[...new Set(input.judgements.flatMap(j=>j.evidence.flatMap(e=>e.eventIds)))]};
}

export function compareLLMEvaluations(baseline:StructuredLLMEvaluation,candidate:StructuredLLMEvaluation):PairwiseJudgement {
  if(baseline.status==='needs-review'||candidate.status==='needs-review'||baseline.overall===undefined||candidate.overall===undefined)return {winner:'uncertain',margin:'small',reasons:[],regressions:[],confidence:0,evidenceEventIds:[...new Set([...baseline.evidenceEventIds,...candidate.evidenceEventIds])]};
  const delta=candidate.overall-baseline.overall;
  return {winner:Math.abs(delta)<.05?'tie':delta>0?'candidate':'baseline',margin:Math.abs(delta)>=.5?'large':'small',reasons:[`overall delta ${delta.toFixed(3)}`],regressions:[],confidence:Math.min(baseline.confidence,candidate.confidence),evidenceEventIds:[...new Set([...baseline.evidenceEventIds,...candidate.evidenceEventIds])]};
}

