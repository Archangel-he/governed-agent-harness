import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assembleAgent,type AgentTemplate} from '../agent.js';
import {defaultProfile} from '../governance/evaluation.js';
import {DynamicEvaluationStore} from '../governance/dynamic-evaluation.js';
import {createOpenAICompatibleModel} from '../providers/openai-compatible.js';
import type {ModelProvider} from '../contracts/loop.js';

/** Paid model calls are opt-in; feedback is explicitly a simulated acceptance event. */
export async function runModelFeedbackExperiment(root:string,model:ModelProvider,environment:Record<string,unknown>){
 const task='Return exactly ACK-42, with no other text.';
 const definition:AgentTemplate={
  agentId:'model-feedback',plugins:[],
  version:{id:'model-feedback-v1',agentDefinitionId:'model-feedback',bindings:[],policyVersion:'1',topology:{id:'model-feedback',version:'1',entry:['respond'],nodes:[{id:'respond',kind:'kernel',pluginVersion:'1'}],edges:[]}},
  evaluation:{version:'1',dataset:{id:'bootstrap',version:'1',cases:[{id:'response',input:task}]},gates:{...defaultProfile},evaluator:{id:'acceptance-feedback',version:'1',judge:(_input,output,expected)=>{
   const correct=typeof expected==='string'&&typeof output==='string'&&output.trim()===expected;
   return{completed:correct,quality:Number(correct),safe:true,cost:0,humanInterventions:0};
  }}},
  services:{environmentSnapshot:environment,systemPrompt:'Follow the task precisely.',kernel:{model,tools:{},maxSteps:1,maxRetries:0}}
 };
 const agent=assembleAgent(root,definition);
 const result=await agent.run(crypto.randomUUID(),task,{signal:AbortSignal.timeout(45_000)});
 const source=await agent.resolver.resolve(result.executionId);
 const dataset=new DynamicEvaluationStore('model-feedback');
 dataset.recordDecision({id:result.executionId,input:source.input,output:source.output,decisionAt:Date.now(),metadata:{agentVersionId:source.versionId,executionId:source.executionId}});
 if((await agent.evaluate(result,task)).passed)throw new Error('Unsettled task incorrectly passed');
 dataset.recordFeedback({id:crypto.randomUUID(),caseId:result.executionId,observedAt:Date.now(),source:'simulated-acceptance',value:'ACK-42'});
 const snapshot=dataset.snapshot();
 const evaluation=await agent.evaluate(result,task,snapshot.cases[0].feedback!.value);
 const report={executionId:result.executionId,status:result.status,output:result.output??null,environment,feedbackMode:'simulated',costMode:'unpriced; evaluator cost is a fixture value',modelEvents:source.trace.events.filter(e=>e.type==='model/request').length,evaluation,snapshot};
 mkdirSync(root,{recursive:true});writeFileSync(join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const apiKey=process.env.SILICONFLOW_API_KEY;
 if(!apiKey)throw new Error('Set SILICONFLOW_API_KEY for this opt-in experiment');
 const model=process.env.SILICONFLOW_MODEL??'deepseek-ai/DeepSeek-V3.1';
 const root=resolve('.tmp','model-feedback-'+Date.now());
 const report=await runModelFeedbackExperiment(root,createOpenAICompatibleModel({apiKey,model,endpoint:'https://api.siliconflow.cn/v1',temperature:0}),{provider:'siliconflow',model,temperature:0});
 console.log(JSON.stringify({root,status:report.status,passed:report.evaluation.passed,executionId:report.executionId}));
 if(!report.evaluation.passed)process.exitCode=1;
}
