import {join} from 'node:path';
import {GovernedAgentRuntime,type GovernedRuntimeOptions,type AgentRequest} from './runtime/governed-runtime.js';
import {RuntimeEvidenceSourceResolver} from './runtime/evidence-source.js';
import type {AgentVersion} from './contracts/domain.js';
import type {CapabilityPlugin} from './plugins/capability.js';
import {evaluateTrace} from './governance/evaluation.js';
import {runExperiment,type CandidateChange} from './governance/experiment.js';
import {LocalVersionStore,type LocalVersion} from './services/version-store.js';
import {WikiStore,type MemoryRelease} from './memory/wiki.js';
import {evidenceDigest} from './governance/evaluation.js';
import {freezeEvaluation,type VersionedEvaluation,type EvaluationCase} from './governance/evaluation-package.js';
import {freezeTopology} from './topology/schema.js';
import {maintainMemoryWithModel} from './memory/trajectory-proposals.js';
import {EpisodicMemoryStore,ProgressiveMemoryRetriever} from './memory/episodic.js';
import type {MemoryProvider} from './contracts/memory.js';
import {aggregateLLMEvaluation,validateEvaluationEvidence,type LLMEvaluator} from './governance/llm-evaluation.js';

export interface AgentTemplate {
 agentId:string;
 version:AgentVersion;
 plugins:CapabilityPlugin[];
 evaluation:VersionedEvaluation;
 services?:Omit<GovernedRuntimeOptions,'root'|'plugins'>;
 memoryMaintenance?:boolean;
 memoryMode?:'stateless'|'persistent';
 memoryProvider?:MemoryProvider;
 llmEvaluator?:LLMEvaluator;
}
export type AgentHandle=ReturnType<typeof assembleAgent>;
export function memorySnapshot(releases:MemoryRelease[]):NonNullable<AgentRequest['memory']>{
 const pages=releases.flatMap(release=>Object.values(release.pages).map(page=>({pageId:`${release.scope}:${release.owner}/${page.pageId}`,revision:page.revision,content:`Status: ${page.status}\n${page.markdown}\nSources: ${page.sources.map(s=>s.hash).join(', ')}`})));
 return freezeTopology({releaseId:evidenceDigest(releases.map(r=>({scope:r.scope,owner:r.owner,id:r.id}))),pages});
}
/** Fill a definition; adding an Agent never edits the execution engine. */
export function assembleAgent(root:string,definition:AgentTemplate){
 const frozenEvaluation=freezeEvaluation(definition.evaluation);
 const evaluation=frozenEvaluation.definition,evaluationDigest=frozenEvaluation.digest;
 const version=freezeTopology({...definition.version,evaluationDigest}),agentId=definition.agentId;
 const plugins=new Map<string,CapabilityPlugin>();
 for(const plugin of definition.plugins){const key=plugin.manifest.id+'@'+plugin.manifest.version;if(plugins.has(key))throw new Error('Duplicate plugin implementation');plugins.set(key,plugin)}
 const runtime=new GovernedAgentRuntime({...definition.services,root:join(root,'runtime'),plugins});
 const versions=new LocalVersionStore(join(root,'versions')),wiki=new WikiStore(join(root,'memory'));
 const episodes=new EpisodicMemoryStore(join(root,'memory','episodes.jsonl')),retriever=new ProgressiveMemoryRetriever(episodes);
 const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,[agentId]);
 let memoryMaintenanceError:string|undefined;
 const persistentMemory=definition.memoryMode==='persistent'||definition.memoryMaintenance===true;
 const run=async(requestId:string,input:unknown,options:{version?:AgentVersion;memory?:AgentRequest['memory'];memoryProvider?:MemoryProvider;signal?:AbortSignal}={})=>{const provided=options.memoryProvider??definition.memoryProvider;const base=options.memory??(provided?await provided.read(input,3000):memorySnapshot([wiki.pinned('agent',agentId)]));const recalled=!persistentMemory||options.memory||provided?{details:[]}:retriever.search(String(input),3000);const memory=freezeTopology({...base,pages:[...base.pages,...recalled.details.map(row=>({pageId:`episode:${row.id}`,revision:1,content:`${row.summary}\n${row.details}`}))]});const result=await runtime.run({agentId,requestId,version:options.version??(await (async()=>{try{return versions.active() as unknown as AgentVersion}catch{return version}})()),input,memory,...(options.signal?{signal:options.signal}:{})});if(persistentMemory)try{episodes.record({id:result.executionId,agentId,sessionId:'agent:'+agentId,executionId:result.executionId,occurredAt:Date.now(),summary:`${result.status}: ${String(result.output??result.error??'')}`.slice(0,240),details:JSON.stringify({input,output:result.output,error:result.error}),tags:['execution',result.status],outcome:{status:result.status}})}catch(error){if(!String(error).includes('Duplicate episode'))throw error}if(provided?.record)await provided.record({agentId,executionId:result.executionId,input,output:result.output,status:result.status});if(definition.memoryMaintenance&&definition.services?.kernel?.model&&result.status==='completed')try{await maintainMemoryWithModel(wiki,result.trace,definition.services.kernel.model,{scope:'agent',owner:agentId,proposedBy:agentId});memoryMaintenanceError=undefined}catch(error){memoryMaintenanceError=String(error)}return result};
 const evaluate=async(result:Awaited<ReturnType<typeof run>>,input:unknown,expected?:unknown)=>{const base=evaluateTrace(result.trace,evaluation.gates,evaluation.evaluator.judge(input,result.output??null,expected));if(!definition.llmEvaluator)return base;const llm=definition.llmEvaluator;const structured=aggregateLLMEvaluation({rubric:llm.rubric,judgements:await llm.judge({input,output:result.output??null,trace:result.trace,expected}),traceDigest:evidenceDigest(result.trace.events),evaluatorId:llm.evaluatorId,evaluatorVersion:llm.evaluatorVersion,modelId:llm.modelId,promptVersion:llm.promptVersion});validateEvaluationEvidence(structured,result.trace);return {...base,llmEvaluation:structured}};
 const compare=async(change:CandidateChange,cases:readonly EvaluationCase[]=evaluation.dataset.cases)=>{
  if(change.baselineVersionId===version.id && change.candidateVersionId!==version.id) {
   const candidateDigest=(change as CandidateChange & {candidateEvaluationDigest?:string}).candidateEvaluationDigest;
   if(candidateDigest!==evaluationDigest)throw new Error('Candidate evaluation package mismatch');
  }
  const memory=memorySnapshot([wiki.pinned('agent',agentId)]);
  const selected=cases.map(c=>({id:c.id,input:c.input,...('expected' in c?{expected:c.expected}:{})}));
  return runExperiment(versions,change,selected,evaluation.gates,(candidate:LocalVersion,input)=>run(crypto.randomUUID(),input,{version:candidate as unknown as AgentVersion,memory}),evaluation.evaluator,resolver);
 };
 return {version,runtime,versions,wiki,episodes,retriever,resolver,evaluation,evaluationDigest,run,evaluate,compare,get memoryMaintenanceError(){return memoryMaintenanceError}};
}

