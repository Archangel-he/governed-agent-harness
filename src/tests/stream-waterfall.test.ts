import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentLoop } from '../runtime/agent-loop.js';
import { MemorySessionStore } from '../services/memory.js';

test('stream frames preserve usage replay state and request header', async () => {
  const sessions = new MemorySessionStore();
  const loop = new AgentLoop('s', {id:'v',agentDefinitionId:'a',bindings:[],policyVersion:'1'}, sessions, {
    systemPrompt:'x', maxSteps:2, model:{seatId:'m',pluginId:'p',pluginVersion:'1', async invoke(){return {content:'fallback',toolCalls:[]}}, async *stream(){yield {content:'ok',usage:{inputTokens:1},replayState:{cursor:'c'},requestHeader:{trace:'t'},done:true};}}, tools:{}
  });
  await loop.run({id:'r',content:'hi'});
  const stream = sessions.events('s').find(e=>e.type==='assistant/stream');
  assert.deepEqual((stream?.payload as any).usage,{inputTokens:1});
  assert.equal((stream?.payload as any).replayState.cursor,'c');
  assert.equal((stream?.payload as any).requestHeader.trace,'t');
});

test('waterfall delegates once, persists retry before wait, and discards failed stream content',async()=>{
 const sessions=new MemorySessionStore();let attempts=0;const order:string[]=[];
 const loop=new AgentLoop('retry',{id:'v',agentDefinitionId:'a',bindings:[],policyVersion:'1'},sessions,{
  systemPrompt:'x',maxSteps:1,maxRetries:1,tools:{},requestErrorHandlers:[async(_ctx,next)=>{order.push('outer');return next()},async()=>{order.push('retry');return{kind:'retry',delayMs:1}}],
  model:{seatId:'m',pluginId:'p',pluginVersion:'1',invoke:async()=>{throw Error('unused')},async *stream(){attempts++;if(attempts===1){yield{content:'discard'};throw Error('transient')}yield{content:'final',toolCallDeltas:[],done:true}}}
 });
 assert.equal((await loop.run({id:'r',content:'hi'})).output,'final');assert.deepEqual(order,['outer','retry']);
 const events=sessions.events('retry');assert.equal(events.filter(e=>e.type==='model/retry').length,1);assert.equal(events.filter(e=>e.type==='assistant/stream').length,2);
});

test('stream assembles interleaved tool argument deltas and rejects incomplete stream',async()=>{
 const calls:unknown[]=[];let step=0;
 const loop=new AgentLoop('delta',{id:'v',agentDefinitionId:'a',bindings:[],policyVersion:'1'},new MemorySessionStore(),{
  systemPrompt:'x',maxSteps:2,tools:{echo:{seatId:'t',pluginId:'t',pluginVersion:'1',invoke:async input=>{calls.push(input);return input}}},
  model:{seatId:'m',pluginId:'p',pluginVersion:'1',invoke:async()=>{throw Error('unused')},async *stream(){if(step++===0){yield{toolCallDeltas:[{index:0,id:'c',name:'echo',arguments:'{"x":'}]};yield{toolCallDeltas:[{index:0,arguments:'1}'}],done:true}}else yield{content:'done',done:true}}}
 });
 assert.equal((await loop.run({id:'r',content:null})).status,'completed');assert.deepEqual(calls,[{x:1}]);
 const broken=new AgentLoop('broken',{id:'v',agentDefinitionId:'a',bindings:[],policyVersion:'1'},new MemorySessionStore(),{systemPrompt:'x',maxSteps:1,tools:{},model:{seatId:'m',pluginId:'p',pluginVersion:'1',invoke:async()=>({content:'',toolCalls:[]}),async *stream(){yield{content:'partial'}}}});
 assert.equal((await broken.run({id:'r',content:null})).status,'failed');
});
