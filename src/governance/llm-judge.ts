import type {ModelProvider} from '../contracts/loop.js';
import type {LLMEvaluator,EvaluationRubric,DimensionJudgement,LLMEvaluationContext} from './llm-evaluation.js';

function compactTrace(trace:LLMEvaluationContext['trace']):unknown {
 return {executionId:trace.executionId,complete:trace.complete,eventIds:trace.events.map(event=>event.id),events:trace.events.map(event=>({id:event.id,type:event.type,operationId:event.operationId,nodeId:event.nodeId,status:event.status,payload:JSON.stringify(event.payload).slice(0,1200)}))};
}
const compactValue=(value:unknown):string=>JSON.stringify(value??null).slice(0,8000);

export function createStructuredLLMEvaluator(model:ModelProvider,rubric:EvaluationRubric):LLMEvaluator {
 return {rubric,evaluatorId:`${model.pluginId}:rubric-judge`,evaluatorVersion:'1',modelId:model.pluginId,promptVersion:'1',judge:async(context:LLMEvaluationContext)=>{
  const response=await model.invoke({systemPrompt:'Return JSON only. Evaluate each rubric dimension. Use event IDs from the compact trace as evidence. Output an array of objects: dimensionId, score, claim, evidence[{type,eventIds,path,claim}], confidence, uncertainty.',history:[{role:'user',content:{rubric,input:compactValue(context.input),output:compactValue(context.output),trace:compactTrace(context.trace),expected:compactValue(context.expected)}}],tools:[]},AbortSignal.timeout(45_000));
  const raw=typeof response.content==='string'?response.content:JSON.stringify(response.content);try{return JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0]??raw) as DimensionJudgement[]}catch{return rubric.dimensions.map(d=>({dimensionId:d.id,score:0,claim:'Evaluator returned invalid JSON',evidence:[],confidence:0,uncertainty:'invalid-json'}));}
 }};
}
