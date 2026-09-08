import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';import {definePlugin} from '../plugins/capability.js';
const identity={id:'life',version:'1',contract:'x',kind:'service' as const,capabilities:[]};
test('lifecycle seats use Cordis fiber and dispose',async()=>{
 let activated=0,disposed=0;
 const version:any={id:'v',agentDefinitionId:'a',policyVersion:'p',bindings:[{seatId:'life',plugin:identity,configDigest:'x'}],seats:[{id:'life',role:'infra',contract:'x',requiredCapabilities:[],primaryClusterId:'c',observationClusterIds:[]}],topology:{id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability',seatId:'n',pluginId:'n',pluginVersion:'1'}],edges:[]}};
 const lifecycle=()=>({binding:{seatId:'life',plugin:identity,configDigest:'x'},activate:async()=>{activated++},dispose:async()=>{disposed++}});
 const runtime=new GovernedAgentRuntime({root:mkdtempSync(join(tmpdir(),'life-')),plugins:new Map([['n',definePlugin({id:'n',version:'1',capabilitySurface:'x',invoke:async x=>({output:x})})]]),lifecycle:new Map([['life@1',lifecycle]])});
 const r=await runtime.run({agentId:'a',requestId:'r',version,input:1});assert.equal(r.status,'completed');assert.equal(activated,1);assert.equal(disposed,1);assert.ok(r.trace.events.some(e=>e.type==='lifecycle/end'));
});
