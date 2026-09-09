import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {assembleAgent} from '../agent.js';
import {textAgentTemplate} from '../templates/text-agent.js';
import type {AgentTemplate} from '../agent.js';

const template=()=>textAgentTemplate();
test('AgentTemplate requires a versioned evaluation package at assembly',()=>{
 const invalid={...template(),evaluation:undefined} as unknown as AgentTemplate;
 assert.throws(()=>assembleAgent(mkdtempSync(join('.tmp','eval-')),invalid),/evaluation package/i);
});
test('assembly freezes evaluator dataset gates and exposes an evaluation digest',()=>{
 const agent=assembleAgent(mkdtempSync(join('.tmp','eval-')),template());
 assert.equal(agent.evaluation.evaluator.id,'trimmed-text');
 assert.equal(agent.evaluation.dataset.id,'text-agent-cases');
 assert.match(agent.evaluationDigest,/^[a-f0-9]{64}$/);
 assert.equal(agent.evaluation.dataset.cases.length,2);
 assert.throws(()=>{(agent.evaluation.dataset.cases as unknown as {input:unknown}[])[0].input='mutated'},/read only|Cannot assign|frozen/i);
});
test('dataset cases can be selected for a paired experiment without changing the core runtime',()=>{
 const agent=assembleAgent(mkdtempSync(join('.tmp','eval-')),template());
 assert.deepEqual(agent.evaluation.dataset.cases.map(c=>c.id),['spaces','clean']);
 assert.equal(agent.evaluation.dataset.version,'1');
});

test('experiment rejects a candidate whose AgentVersion uses another evaluation package',async()=>{
 const {mkdtempSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {LocalVersionStore}=await import('../services/version-store.js');const {runExperiment}=await import('../governance/experiment.js');const {defaultProfile}=await import('../governance/evaluation.js');
 const store=new LocalVersionStore(mkdtempSync(join(tmpdir(),'eval-version-'))),topology={id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability' as const}],edges:[]};
 store.publish({id:'base',topology,evaluationDigest:'eval-a'});store.publish({id:'candidate',topology,evaluationDigest:'eval-b'});store.activate('base');
 await assert.rejects(runExperiment(store,{id:'c',baselineVersionId:'base',candidateVersionId:'candidate',hypothesis:'x',evidenceEventIds:['e'],sourceExecutionIds:['s']},[{id:'c',input:1}],defaultProfile,async()=>{throw new Error('must not run')},{id:'e',version:'1',judge:()=>({completed:true,quality:1,safe:true,cost:0,humanInterventions:0})},{resolve:async()=>{throw new Error('must not resolve')}}),/evaluation package/);
});
