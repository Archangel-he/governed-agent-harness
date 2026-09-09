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

export interface AgentTemplate {
 agentId:string;
 version:AgentVersion;
 plugins:CapabilityPlugin[];
 evaluation:VersionedEvaluation;
 services?:Omit<GovernedRuntimeOptions,'root'|'plugins'>;
 memoryMaintenance?:boolean;
}
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
 const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,[agentId]);
 let memoryMaintenanceError:string|undefined;
 const run=async(requestId:string,input:unknown,options:{version?:AgentVersion;memory?:AgentRequest['memory'];signal?:AbortSignal}={})=>{const result=await runtime.run({agentId,requestId,version:options.version??version,input,memory:options.memory??memorySnapshot([wiki.pinned('agent',agentId)]),...(options.signal?{signal:options.signal}:{})});if(definition.memoryMaintenance&&definition.services?.kernel?.model&&result.status==='completed')try{await maintainMemoryWithModel(wiki,result.trace,definition.services.kernel.model,{scope:'agent',owner:agentId,proposedBy:agentId});memoryMaintenanceError=undefined}catch(error){memoryMaintenanceError=String(error)}return result};
 const evaluate=async(result:Awaited<ReturnType<typeof run>>,input:unknown,expected?:unknown)=>evaluateTrace(result.trace,evaluation.gates,evaluation.evaluator.judge(input,result.output??null,expected));
 const compare=async(change:CandidateChange,cases:readonly EvaluationCase[]=evaluation.dataset.cases)=>{
  if(change.baselineVersionId===version.id && change.candidateVersionId!==version.id) {
   const candidateDigest=(change as CandidateChange & {candidateEvaluationDigest?:string}).candidateEvaluationDigest;
   if(candidateDigest!==evaluationDigest)throw new Error('Candidate evaluation package mismatch');
  }
  const memory=memorySnapshot([wiki.pinned('agent',agentId)]);
  const selected=cases.map(c=>({id:c.id,input:c.input,...('expected' in c?{expected:c.expected}:{})}));
  return runExperiment(versions,change,selected,evaluation.gates,(candidate:LocalVersion,input)=>run(crypto.randomUUID(),input,{version:candidate as unknown as AgentVersion,memory}),evaluation.evaluator,resolver);
 };
 return {version,runtime,versions,wiki,resolver,evaluation,evaluationDigest,run,evaluate,compare,get memoryMaintenanceError(){return memoryMaintenanceError}};
}
