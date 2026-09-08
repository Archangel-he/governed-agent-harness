import test from 'node:test';
import assert from 'node:assert/strict';
import { StatelessAgentKernel } from '../runtime/kernel/stateless.js';
const input={executionId:'e',agentId:'a',version:{id:'v',agentDefinitionId:'a',policyVersion:'p',bindings:[]},userContent:'hi',systemPrompt:'test'};
const identity={seatId:'model',pluginId:'model',pluginVersion:'1'};
test('pre-aborted kernel never invokes providers',async()=>{
  let calls=0;
  const result=await new StatelessAgentKernel().run(input,{model:{...identity,invoke:async()=>{calls++;return{content:'x',toolCalls:[]}}},tools:{}},AbortSignal.abort());
  assert.equal(result.status,'cancelled');assert.equal(calls,0);
});
test('kernel awaits event persistence before model and tool side effects',async()=>{
  const recorded:string[]=[];let calls=0;
  const result=await new StatelessAgentKernel().run(input,{model:{...identity,invoke:async()=>{
    assert.ok(recorded.includes('model/request'));calls++;
    return calls===1?{content:'tool',toolCalls:[{id:'t',name:'write',input:null}]}:{content:'done',toolCalls:[]};
  }},tools:{write:{...identity,invoke:async()=>{assert.ok(recorded.includes('tool/call'));return'written'}}},emit:async e=>{await Promise.resolve();recorded.push(e.type)}});
  assert.equal(result.status,'completed');assert.equal(result.executionId,'e');
  assert.ok(result.events.every(e=>e.executionId==='e'));
});
test('failed trace sink prevents provider invocation and kernel cancellation propagates',async()=>{
  let calls=0;
  const result=await new StatelessAgentKernel().run(input,{model:{...identity,invoke:async()=>{calls++;return{content:'x',toolCalls:[]}}},tools:{},emit:async()=>{throw new Error('disk failed')}});
  assert.equal(result.status,'failed');assert.equal(calls,0);
  let started!:()=>void;const ready=new Promise<void>(r=>started=r);const controller=new AbortController();let aborted=false;
  const run=new StatelessAgentKernel().run(input,{model:{...identity,invoke:async(_,signal)=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true}))}},tools:{}},controller.signal);
  await ready;controller.abort();assert.equal((await run).status,'cancelled');assert.equal(aborted,true);
});
