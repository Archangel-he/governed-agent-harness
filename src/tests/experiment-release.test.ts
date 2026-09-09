import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {LocalVersionStore} from '../services/version-store.js';
import {runExperiment,promoteCandidate,type ExperimentEvaluator} from '../governance/experiment.js';
import {defaultProfile,evidenceDigest} from '../governance/evaluation.js';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {RuntimeEvidenceSourceResolver} from '../runtime/evidence-source.js';
import type {AgentVersion} from '../contracts/domain.js';
const evaluator:ExperimentEvaluator={id:'quality',version:'1',judge:(_input,output)=>({completed:true,quality:Number(output),safe:true,cost:0,humanInterventions:0})};
async function fixture(){
 const root=mkdtempSync(join(tmpdir(),'experiment-')),versions=new LocalVersionStore(join(root,'versions'));
 const topology={id:'t',version:'1',entry:['a'],nodes:[{id:'a',kind:'capability' as const,pluginId:'a',pluginVersion:'1'}],edges:[]};
 for(const id of ['base','candidate'])versions.publish({id,agentDefinitionId:'a',policyVersion:'1',bindings:[],topology});versions.activate('base');
 const runtime=new GovernedAgentRuntime({root:join(root,'runtime'),environmentSnapshot:{model:'deterministic-v1'},plugins:new Map([['a',{manifest:{id:'a',version:'1',capabilitySurface:'quality'},invoke:async(_input,ctx)=>({output:ctx.agentVersionId==='base'?.8:1})}]])});
 const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,['a']);
 const run=async(version:{id:string},input:unknown)=>runtime.run({agentId:'a',requestId:crypto.randomUUID(),version:version as AgentVersion,input});
 const source=await run(versions.get('base'),{value:1});
 const change={id:'change',baselineVersionId:'base',candidateVersionId:'candidate',hypothesis:'improve quality',evidenceEventIds:source.trace.events.map(e=>e.id),sourceExecutionIds:[source.executionId]};
 return {versions,resolver,run,change};
}
test('paired persisted experiment releases and rolls back; tampering and evaluator drift rejected',async()=>{
 const {versions,resolver,run,change}=await fixture();
 const report=await runExperiment(versions,change,[{id:'case',input:{value:1}}],defaultProfile,run,evaluator,resolver);
 assert.equal(report.passed,true);await assert.rejects(promoteCandidate(versions,report,false,resolver,evaluator),/approval/);
 await promoteCandidate(versions,report,true,resolver,evaluator);assert.equal(versions.active().id,'candidate');versions.rollback('base');
 const altered=structuredClone(report);altered.cases[0].candidate.output=9;
 const {passed,baselineScore,candidateScore,evidenceDigest:_,...body}=altered;altered.evidenceDigest=evidenceDigest(body);
 await assert.rejects(promoteCandidate(versions,altered,true,resolver,evaluator),/persisted|provenance/);
 await assert.rejects(promoteCandidate(versions,report,true,resolver,{...evaluator,version:'2'}),/evaluator/i);
 versions.activate('candidate');await assert.rejects(promoteCandidate(versions,report,true,resolver,evaluator),/baseline|CAS/);
});
test('one genuine source event cannot hide fabricated event IDs',async()=>{
 const {versions,resolver,run,change}=await fixture();
 await assert.rejects(runExperiment(versions,{...change,evidenceEventIds:[...change.evidenceEventIds,'fabricated']},[{id:'case',input:1}],defaultProfile,run,evaluator,resolver),/evidence|persisted/i);
 await assert.rejects(runExperiment(versions,{...change,sourceExecutionIds:[]},[{id:'case',input:1}],defaultProfile,run,evaluator,resolver),/source/i);
});

test('persisted source seal rejects valid-JSON trace edits',async()=>{
 const root=mkdtempSync(join(tmpdir(),'seal-')),version={id:'v',agentDefinitionId:'a',policyVersion:'1',bindings:[],topology:{id:'t',version:'1',entry:['a'],nodes:[{id:'a',kind:'capability' as const,pluginId:'a',pluginVersion:'1'}],edges:[]}};
 const runtime=new GovernedAgentRuntime({root,plugins:new Map([['a',{manifest:{id:'a',version:'1',capabilitySurface:'work'},invoke:async()=>({output:1})}]])});
 const result=await runtime.run({agentId:'a',requestId:'r',input:1,version});const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,['a']);await resolver.resolve(result.executionId);
 const {readFileSync,writeFileSync}=await import('node:fs'),path=join(root,'session.jsonl');
 const rows=readFileSync(path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
 const end=rows.find(r=>r.type==='harness/trace'&&r.payload.type==='execution/end');end.payload.payload.output=9;
 writeFileSync(path,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 await assert.rejects(resolver.resolve(result.executionId),/seal/);
});
test('paired runs reject environment drift and memory content drift even with same release label',async()=>{
 for(const drift of ['environment','memory']){
  const {versions,resolver,run,change}=await fixture();const sources=new Map<string,Awaited<ReturnType<typeof resolver.resolve>>>();
  const runner=async(version:{id:string},input:unknown)=>{const result=await run(version,input),source=await resolver.resolve(result.executionId);if(version.id==='candidate'){if(drift==='environment')source.environmentSnapshot={different:true};else source.memoryDigest='different'}sources.set(result.executionId,source);return result};
  const resolving={resolve:async(id:string)=>sources.get(id)??resolver.resolve(id)};
  await assert.rejects(runExperiment(versions,change,[{id:'case',input:1}],defaultProfile,runner,evaluator,resolving),/environment\/memory/);
 }
});
