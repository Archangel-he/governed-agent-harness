import test from 'node:test';
import assert from 'node:assert/strict';
import { TopologyExecutor } from '../topology/executor.js';
import { definePlugin, type CapabilityPlugin } from '../plugins/capability.js';
import { compileTopology } from '../topology/compiler.js';
import type { TopologyDefinition } from '../topology/schema.js';

const node=(id:string)=>({id,kind:'capability' as const,pluginId:id,pluginVersion:'1'});
const edge=(from:string,to:string,when?:string)=>({from,to,kind:'data' as const,...(when?{when}:{})});
const plugin=(id:string,invoke:CapabilityPlugin['invoke'])=>definePlugin({id,version:'1',capabilitySurface:'test',invoke});
const run=(topology:TopologyDefinition,plugins:CapabilityPlugin[],input:unknown=0,events:Record<string,unknown>[]=[],signal?:AbortSignal)=>new TopologyExecutor({agentId:'a',agentVersionId:'v',executionId:'e',plugins:new Map(plugins.map(p=>[p.manifest.id,p])),emit:e=>events.push(e),signal}).run(topology,input);

test('branch joins only selected input and propagates skipped subtree',async()=>{
  const t:TopologyDefinition={id:'b',version:'1',entry:['a'],nodes:['a','b','c','d','join'].map(node),edges:[edge('a','b','yes'),edge('a','c','no'),edge('c','d'),edge('b','join'),edge('d','join')]};
  let forbidden=0;
  const result=await run(t,[plugin('a',async()=>({output:5,control:{type:'select',port:'yes'}})),plugin('b',async x=>({output:Number(x)+1})),plugin('c',async()=>{forbidden++;return{output:8}}),plugin('d',async()=>{forbidden++;return{output:9}}),plugin('join',async x=>({output:x}))]);
  assert.equal(forbidden,0); assert.equal(result.output,6);
});
test('fork executes concurrently and join receives keyed predecessor outputs',async()=>{
  let ready=0;let release!:()=>void;
  const barrier=new Promise<void>(r=>release=r);
  const work=(id:string)=>plugin(id,async()=>{if(++ready===2)release();await barrier;return{output:id}});
  const t:TopologyDefinition={id:'fork',version:'1',entry:['a','b'],nodes:['a','b','c'].map(node),edges:[edge('a','c'),edge('b','c')]};
  const result=await run(t,[work('a'),work('b'),plugin('c',async x=>({output:x}))]);
  assert.deepEqual(result.output,{a:'a',b:'b'});
});
test('bounded loop records unique operation for each iteration and fails at bound',async()=>{
  const t:TopologyDefinition={id:'loop',version:'1',entry:['a'],nodes:[{...node('a'),loop:{maxIterations:3}}],edges:[]};
  const events:Record<string,unknown>[]=[];
  const p=plugin('a',async x=>({output:Number(x)+1,...(Number(x)<2?{control:{type:'loop' as const}}:{})}));
  assert.equal((await run(t,[p],0,events)).output,3);
  const starts=events.filter(e=>e.type==='node/start');
  assert.equal(starts.length,3);assert.equal(new Set(starts.map(e=>e.operationId)).size,3);
  await assert.rejects(run(t,[plugin('a',async()=>({output:0,control:{type:'loop'}}))]),/bound|maxIterations/);
});
test('stop prevents all downstream stages and unknown branch port is rejected',async()=>{
  const t:TopologyDefinition={id:'stop',version:'1',entry:['a'],nodes:['a','b'].map(node),edges:[edge('a','b')]};let calls=0;
  await run(t,[plugin('a',async()=>({output:1,control:{type:'stop',reason:'done'}})),plugin('b',async()=>{calls++;return{output:2}})]);
  assert.equal(calls,0);
  await assert.rejects(run({...t,edges:[edge('a','b','yes')]},[plugin('a',async()=>({control:{type:'select',port:'missing'}})),plugin('b',async()=>({}))]),/port/);
});
test('schema and plugin validation occur before any plugin invokes',async()=>{
  const t:TopologyDefinition={id:'s',version:'1',entry:['a'],nodes:[{...node('a'),inputSchema:{type:'object',required:['x'],properties:{x:{type:'number'}},additionalProperties:false}}],edges:[]};let calls=0;
  const p=plugin('a',async()=>{calls++;return{output:1}});
  await assert.rejects(run(t,[p],{x:'bad'}),/schema/);assert.equal(calls,0);
  const unsupported=JSON.parse(JSON.stringify({...t,nodes:[{...node('a'),inputSchema:{type:'object',invented:1}}]}));
  assert.throws(()=>compileTopology(unsupported),/unsupported/);
  await assert.rejects(run({...t,nodes:[{...node('a'),pluginVersion:'2'}]},[p]),/version/);
});
test('dependency edges order nodes without replacing their task input',async()=>{
  const t:TopologyDefinition={id:'dep',version:'1',entry:['a'],nodes:['a','b'].map(node),edges:[{from:'a',to:'b',kind:'dependency'}]};
  assert.equal((await run(t,[plugin('a',async()=>({output:99})),plugin('b',async x=>({output:x}))],7)).output,7);
});
test('compiler snapshots caller topology and rejects invalid loop bounds',()=>{
  const t:TopologyDefinition={id:'t',version:'1',entry:['a'],nodes:[node('a')],edges:[]};
  const compiled=compileTopology(t);t.nodes[0].id='changed';assert.equal(compiled.topology.nodes[0].id,'a');
  assert.throws(()=>compileTopology({...t,entry:['a'],nodes:[{...node('a'),loop:{maxIterations:0}}]}),/bound|maxIterations/);
});
test('cancellation after a noncooperative plugin returns cannot commit success',async()=>{const c=new AbortController();let downstream=0;const t:TopologyDefinition={id:'cancel-return',version:'1',entry:['a'],nodes:[node('a'),node('b')],edges:[edge('a','b')]};await assert.rejects(run(t,[plugin('a',async()=>{c.abort();return{output:1}}),plugin('b',async()=>{downstream++;return{output:2}})],0,[],c.signal),/aborted|cancel/i);assert.equal(downstream,0)});
test('late capability facts are recorded outside the terminal operation',async()=>{const events:Record<string,unknown>[]=[];const t:TopologyDefinition={id:'late',version:'1',entry:['a'],nodes:[node('a')],edges:[]};const result=await run(t,[plugin('a',async(_input,ctx)=>{setTimeout(()=>ctx.emit({type:'late',payload:{x:1}}),5);return{output:1}})],0,events);await new Promise(r=>setTimeout(r,20));assert.equal(result.output,1);assert.ok(events.some(e=>e.type==='plugin/late'));});
