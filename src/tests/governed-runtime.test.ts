import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GovernedAgentRuntime } from '../runtime/governed-runtime.js';
import { definePlugin } from '../plugins/capability.js';
import type { AgentVersion } from '../contracts/domain.js';

test('one version assembles Cordis capability seats and persists a replayable complete trace',async()=>{
  const root=mkdtempSync(join(tmpdir(),'gah-unified-'));
  let calls=0;
  const plugins=new Map([['echo',definePlugin({id:'echo',version:'1',capabilitySurface:'test',async invoke(input,ctx){calls++;ctx.emit({type:'evidence',payload:{checked:true}});return {output:input};}})]]);
  const version:AgentVersion={id:'v1',agentDefinitionId:'a',policyVersion:'p',bindings:[],topology:{id:'t',version:'1',entry:['echo'],nodes:[{id:'echo',kind:'capability',seatId:'s',pluginId:'echo',pluginVersion:'1'}],edges:[]}};
  const runtime=new GovernedAgentRuntime({root,plugins});
  const first=await runtime.run({agentId:'a',requestId:'r',version,input:{x:1}});
  assert.equal(first.status,'completed'); assert.equal(first.trace.complete,true);
  assert.deepEqual(first.output,{x:1});
  assert.ok(first.trace.events.some(e=>e.type==='plugin/artifacts'));
  const second=await new GovernedAgentRuntime({root,plugins}).run({agentId:'a',requestId:'r',version,input:{x:1}});
  assert.equal(calls,1); assert.equal(second.executionId,first.executionId);
  assert.deepEqual(second.trace.events,first.trace.events);
  await assert.rejects(runtime.run({agentId:'a',requestId:'r',version,input:{x:2}}),/reused/);
});

test('terminated topology owner reopens without replaying unknown plugin effects',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 const root=mkdtempSync(join(tmpdir(),'gah-crash-'));
 const version:AgentVersion={id:'v',agentDefinitionId:'a',policyVersion:'p',bindings:[],topology:{id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability',pluginId:'effect',pluginVersion:'1'}],edges:[]}};
 const code=`import {GovernedAgentRuntime} from './src/runtime/governed-runtime.ts';
 const plugin={manifest:{id:'effect',version:'1',capabilitySurface:'test',sideEffects:['write']},invoke:async()=>{process.stdout.write('ready');await new Promise(()=>{});return{output:null}}};
 const hold=setInterval(()=>{},1000);
 await new GovernedAgentRuntime({root:${JSON.stringify(root)},plugins:new Map([['effect',plugin]])}).run({agentId:'a',requestId:'r',version:${JSON.stringify(version)},input:null});clearInterval(hold);`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{windowsHide:true});
 let stderr='';child.stderr.on('data',data=>stderr+=data);
 const exit=once(child,'exit');const timer=setTimeout(()=>child.kill(),10_000);
 try{await once(child.stdout,'data');child.kill();await exit}finally{clearTimeout(timer)}
 assert.equal(stderr,'');let calls=0;
 const runtime=new GovernedAgentRuntime({root,plugins:new Map([['effect',definePlugin({id:'effect',version:'1',capabilitySurface:'test',async invoke(){calls++;return{output:null}}})]])});
 const result=await runtime.run({agentId:'a',requestId:'r',version,input:null});
 assert.equal(result.status,'interrupted');assert.equal(calls,0);assert.equal(result.trace.openOperations.length,0);assert.ok(result.trace.unknownOperations.length>0);
 const repeated=await runtime.run({agentId:'a',requestId:'r',version,input:null});assert.deepEqual(repeated.trace.events,result.trace.events);
});
