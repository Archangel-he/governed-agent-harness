import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path'; import {tmpdir} from 'node:os';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {definePlugin} from '../plugins/capability.js';

const lifeDef={id:'life',version:'1',contract:'x',kind:'service' as const,capabilities:[]};
const version=(bindings:any[]=[], nodes:any[]=[{id:'n',kind:'capability',pluginId:'n',pluginVersion:'1'}]):any=>({id:'v',agentDefinitionId:'a',policyVersion:'p',bindings,seats:[],topology:{id:'t',version:'1',entry:['n'],nodes,edges:[]}});
const plugin=definePlugin({id:'n',version:'1',capabilitySurface:'x',invoke:async x=>({output:x})});
const runtime=(root:string,lifecycle?:Map<string,()=>any>)=>new GovernedAgentRuntime({root,plugins:new Map([['n',plugin]]),lifecycle});

test('late preflight failure disposes prior lifecycle exactly once and records no start',async()=>{let disposed=0,calls=0; const root=mkdtempSync(join(tmpdir(),'pre-')); const factory=()=>{if(++calls>1)throw new Error('factory'); return {binding:{seatId:'a',plugin:lifeDef,configDigest:'x'},activate:async()=>{},dispose:async()=>{disposed++}}}; await assert.rejects(runtime(root,new Map([['life',factory]])).run({agentId:'a',requestId:'r',version:version([{seatId:'a',plugin:lifeDef,configDigest:'x'},{seatId:'b',plugin:lifeDef,configDigest:'x'}]),input:1})); assert.equal(disposed,1); assert.ok(!existsSync(join(root,'session.jsonl')) || !/execution\/start|harness\/request/.test(readFileSync(join(root,'session.jsonl'),'utf8')));});
test('missing plugin admits no request and same request can succeed later',async()=>{const root=mkdtempSync(join(tmpdir(),'pre-')); const rt=new GovernedAgentRuntime({root,plugins:new Map()}); await assert.rejects(rt.run({agentId:'a',requestId:'r',version:version(),input:1})); const ok=await runtime(root).run({agentId:'a',requestId:'r',version:version(),input:1}); assert.equal(ok.status,'completed');});
test('factory is called once and exact instance activates',async()=>{let calls=0,activated=0; const instance={binding:{seatId:'life',plugin:lifeDef,configDigest:'x'},activate:async()=>{activated++},dispose:async()=>{}}; const rt=runtime(mkdtempSync(join(tmpdir(),'pre-')),new Map([['life',()=>{calls++;return instance;}]])); await rt.run({agentId:'a',requestId:'r',version:version([{seatId:'life',plugin:lifeDef,configDigest:'x'}]),input:1}); assert.equal(calls,1); assert.equal(activated,1);});
test('duplicate lifecycle binding is rejected',async()=>{const rt=runtime(mkdtempSync(join(tmpdir(),'pre-')),new Map([['life',()=>({binding:{seatId:'life',plugin:lifeDef,configDigest:'x'},activate:async()=>{},dispose:async()=>{}})]])); await assert.rejects(rt.run({agentId:'a',requestId:'r',version:version([{seatId:'life',plugin:lifeDef,configDigest:'x'},{seatId:'life',plugin:lifeDef,configDigest:'x'}]),input:1}),/Duplicate/);});

test('cleanup failure marks failed while all instances still dispose once',async()=>{
 let disposed=0;const bindings=['x','y'].map(seatId=>({seatId,plugin:{...lifeDef,id:seatId},configDigest:'x'}));
 const factories=new Map(bindings.map(binding=>[binding.plugin.id,()=>({binding,activate:async()=>{},dispose:async()=>{disposed++;throw new Error('cleanup')}})]));
 const result=await runtime(mkdtempSync(join(tmpdir(),'pre-')),factories).run({agentId:'a',requestId:'r',input:1,version:version(bindings)});
 assert.equal(result.status,'failed');assert.equal(disposed,2);assert.match(result.error!,/cleanup/);assert.equal(result.trace.complete,true);
});
test('memory is immutable model-visible evidence and replay rejects changed memory',async()=>{
 let prompt='';
 const rt=new GovernedAgentRuntime({root:mkdtempSync(join(tmpdir(),'pre-')),plugins:new Map(),kernel:{model:{seatId:'m',pluginId:'m',pluginVersion:'1',invoke:async input=>{prompt=input.systemPrompt;return{content:'ok',toolCalls:[]}}},tools:{}}});
 const request={agentId:'a',requestId:'r',input:'task',version:version([],[{id:'n',kind:'kernel',pluginId:'kernel',pluginVersion:'1'}]),memory:{releaseId:'wiki-v1',pages:[{pageId:'a/p',revision:1,content:'remember this'}]}};
 const result=await rt.run(request);assert.equal(result.status,'completed');assert.match(prompt,/remember this/);assert.ok(result.trace.events.some(e=>e.type==='memory/read'));
 await assert.rejects(rt.run({...request,memory:{...request.memory,releaseId:'wiki-v2'}}),/reused/);
 await assert.rejects(rt.run({...request,requestId:'bad',memory:{...request.memory,pages:[{pageId:'p',revision:0,content:'bad'}]}}),/memory/);
 assert.equal((await rt.run({...request,requestId:'bad'})).status,'completed');
});

test('plugin cannot forge runtime event types',async()=>{
 const root=mkdtempSync(join(tmpdir(),'pre-'));
 const rt=new GovernedAgentRuntime({root,plugins:new Map([['n',definePlugin({id:'n',version:'1',capabilitySurface:'x',invoke:async(input,ctx)=>{ctx.emit({type:'execution/end',payload:{status:'completed'}});return{output:input}}})]])});
 const result=await rt.run({agentId:'a',requestId:'r',input:1,version:version()});assert.equal(result.status,'failed');assert.match(result.error!,/Reserved/);
 assert.equal(result.trace.events.filter(e=>e.type==='execution/end').length,1);
});

test('static plugin preflight rejects before any lifecycle factory runs',async()=>{
 let calls=0;const root=mkdtempSync(join(tmpdir(),'pre-')),binding={seatId:'life',plugin:lifeDef,configDigest:'x'};
 const rt=new GovernedAgentRuntime({root,plugins:new Map(),lifecycle:new Map([['life',()=>{calls++;return{binding,activate:async()=>{},dispose:async()=>{}}}]])});
 await assert.rejects(rt.run({agentId:'a',requestId:'r',input:1,version:version([binding])}),/registered/);assert.equal(calls,0);
});

test('non-idempotent side effect followed by exception remains unknown and is not retried',async()=>{
 let calls=0;const rt=new GovernedAgentRuntime({root:mkdtempSync(join(tmpdir(),'unknown-')),plugins:new Map([['n',definePlugin({id:'n',version:'1',capabilitySurface:'external',sideEffects:['external-write'],invoke:async()=>{calls++;throw new Error('connection lost after write')}})]])});
 const request={agentId:'a',requestId:'r',input:1,version:version()};const result=await rt.run(request);
 assert.equal(result.status,'interrupted');assert.equal(result.trace.unknownOperations.length,2);await rt.run(request);assert.equal(calls,1);
});
