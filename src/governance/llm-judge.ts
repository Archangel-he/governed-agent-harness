import type {ModelProvider} from '../contracts/loop.js';
import type {LLMEvaluator,EvaluationRubric,DimensionJudgement,LLMEvaluationContext} from './llm-evaluation.js';

export function createStructuredLLMEvaluator(model:ModelProvider,rubric:EvaluationRubric):LLMEvaluator {
 return {rubric,evaluatorId:`${model.pluginId}:rubric-judge`,evaluatorVersion:'1',modelId:model.pluginId,promptVersion:'1',judge:async(context:LLMEvaluationContext)=>{
  const response=await model.invoke({systemPrompt:'Return JSON only. Evaluate each rubric dimension. Use event IDs from the trace as evidence. Output an array of objects: dimensionId, score, claim, evidence[{type,eventIds,path,claim}], confidence, uncertainty.',history:[{role:'user',content:{rubric,input:context.input,output:context.output,trace:context.trace,expected:context.expected}}],tools:[]},new AbortController().signal);
  const raw=typeof response.content==='string'?response.content:JSON.stringify(response.content);try{return JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0]??raw) as DimensionJudgement[]}catch{return rubric.dimensions.map(d=>({dimensionId:d.id,score:0,claim:'Evaluator returned invalid JSON',evidence:[],confidence:0,uncertainty:'invalid-json'}));}
 }};
}
