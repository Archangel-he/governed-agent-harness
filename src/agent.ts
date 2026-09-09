import {join} from 'node:path';
import {GovernedAgentRuntime,type GovernedRuntimeOptions,type AgentRequest} from './runtime/governed-runtime.js';
import {RuntimeEvidenceSourceResolver} from './runtime/evidence-source.js';
import type {AgentVersion} from './contracts/domain.js';
import type {CapabilityPlugin} from './plugins/capability.js';
import {defaultProfile,evaluateTrace,type EvaluationProfile} from './governance/evaluation.js';
import {runExperiment,type CandidateChange,type ExperimentEvaluator} from './governance/experiment.js';
import {LocalVersionStore,type LocalVersion} from './services/version-store.js';
import {WikiStore,type MemoryRelease} from './memory/wiki.js';
import {evidenceDigest} from './governance/evaluation.js';
import {freezeTopology} from './topology/schema.js';

export interface AgentTemplate {
 agentId:string;version:AgentVersion;plugins:CapabilityPlugin[];evaluator:ExperimentEvaluator;
 profile?:EvaluationProfile;services?:Omit<GovernedRuntimeOptions,'root'|'plugins'>;
}
export function memorySnapshot(releases:MemoryRelease[]):NonNullable<AgentRequest['memory']>{
 const pages=releases.flatMap(release=>Object.values(release.pages).map(page=>({pageId:`${release.scope}:${release.owner}/${page.pageId}`,revision:page.revision,content:`Status: ${page.status}\n${page.markdown}\nSources: ${page.sources.map(s=>s.hash).join(', ')}`})));
 return freezeTopology({releaseId:evidenceDigest(releases.map(r=>({scope:r.scope,owner:r.owner,id:r.id}))),pages});
}
/** Fill a definition; adding an Agent never edits the execution engine. */
export function assembleAgent(root:string,definition:AgentTemplate){
 const version=freezeTopology(definition.version),agentId=definition.agentId;
 const plugins=new Map<string,CapabilityPlugin>();
 for(const plugin of definition.plugins){const key=plugin.manifest.id+'@'+plugin.manifest.version;if(plugins.has(key))throw new Error('Duplicate plugin implementation');plugins.set(key,plugin)}
 const runtime=new GovernedAgentRuntime({...definition.services,root:join(root,'runtime'),plugins});
 const versions=new LocalVersionStore(join(root,'versions')),wiki=new WikiStore(join(root,'memory'));
 const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,[agentId]);
 const profile=freezeTopology(definition.profile??defaultProfile);
 const run=(requestId:string,input:unknown,options:{version?:AgentVersion;memory?:AgentRequest['memory'];signal?:AbortSignal}={})=>runtime.run({agentId,requestId,version:options.version??version,input,memory:options.memory??memorySnapshot([wiki.pinned('agent',agentId)]),...(options.signal?{signal:options.signal}:{})});
 const evaluate=async(result:Awaited<ReturnType<typeof run>>,input:unknown)=>evaluateTrace(result.trace,profile,definition.evaluator.judge(input,result.output??null));
 const compare=async(change:CandidateChange,cases:{id:string;input:unknown}[])=>{
  const memory=memorySnapshot([wiki.pinned('agent',agentId)]);
  return runExperiment(versions,change,cases,profile,(candidate:LocalVersion,input)=>run(crypto.randomUUID(),input,{version:candidate as unknown as AgentVersion,memory}),definition.evaluator,resolver);
 };
 return {version,runtime,versions,wiki,resolver,run,evaluate,compare};
}
