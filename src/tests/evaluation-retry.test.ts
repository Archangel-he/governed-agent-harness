import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {evaluateTrace,defaultProfile} from '../governance/evaluation.js';
import {AgentTraceAggregator} from '../trace/aggregator.js';
const outcome={completed:true,quality:1,safe:true,cost:0,humanInterventions:0};
test('successful retry retains penalty but passes terminal gate',async()=>{
 let attempts=0;
 const runtime=new GovernedAgentRuntime({root:mkdtempSync(join(tmpdir(),'retry-')),plugins:new Map([['a',{manifest:{id:'a',version:'1',capabilitySurface:'work'},invoke:async()=>{if(++attempts===1)throw new Error('transient');return{output:1}}}]])});
 const result=await runtime.run({agentId:'a',requestId:'r',input:1,version:{id:'v',agentDefinitionId:'a',policyVersion:'1',bindings:[],topology:{id:'t',version:'1',entry:['a'],nodes:[{id:'a',kind:'capability',pluginId:'a',pluginVersion:'1',failurePolicy:{mode:'retry',maxAttempts:2}}],edges:[]}}});
 assert.equal(result.status,'completed');const evaluation=evaluateTrace(result.trace,defaultProfile,outcome);
 assert.equal(evaluation.passed,true);assert.equal(evaluation.metrics.reliability,1);assert.equal(evaluation.metrics.attemptReliability,.5);assert.equal(evaluation.metrics.retries,1);assert.ok(evaluation.score<1);
});
test('root failure, failed loop iteration and unknown effect never disappear behind success',()=>{
 for(const mode of ['root','loop','unknown']){
  const agg=new AgentTraceAggregator();let n=0;
  const add=(operationId:string,type:string,status:any,nodeId?:string,payload:unknown={})=>agg.append({id:String(++n),executionId:'e',operationId,type,status,...(nodeId?{nodeId}:{}),payload});
  add('e','execution/start','started');
  add('a0','node/start','started','a',{iteration:0,attempt:1});add('a0','node/end',mode==='unknown'?'unknown':mode==='loop'?'failed':'succeeded','a');
  add('a1','node/start','started','a',{iteration:1,attempt:1});add('a1','node/end','succeeded','a');
  add('e','execution/end',mode==='root'?'failed':'succeeded');
  assert.equal(evaluateTrace(agg.finish('e'),defaultProfile,outcome).passed,false,mode);
 }
});
