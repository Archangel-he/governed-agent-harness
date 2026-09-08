import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentRegistry } from '../runtime/agent-registry.js';
import { AgentRegistryStore } from '../services/registry-store.js';
import { JsonlSessionStore } from '../services/file-store.js';
import { AgentLoop } from '../runtime/agent-loop.js';
const version={id:'v',agentDefinitionId:'a',policyVersion:'p',bindings:[]};
test('cold registry retains inbox, rebuilds independent sessions, deduplicates execution before ack',async()=>{
 const root=mkdtempSync(join(tmpdir(),'registry-')),file=join(root,'registry.json');let calls=0;
 const make=(a:{id:string;sessionId:string;role:'lead'|'member'})=>({...a,loop:new AgentLoop(a.sessionId,version,new JsonlSessionStore(join(root,'sessions.jsonl')),{systemPrompt:'test',maxSteps:1,tools:{},model:{seatId:'m',pluginId:'m',pluginVersion:'1',invoke:async()=>{calls++;return{content:'done',toolCalls:[]}}}})});
 let registry=new AgentRegistry(new AgentRegistryStore(file));
 registry.register(make({id:'lead',sessionId:'sl',role:'lead'}));registry.register(make({id:'member',sessionId:'sm',role:'member'}));
 const message={id:'m',from:'lead',to:'member',content:'work'};registry.send(message);
 registry=new AgentRegistry(new AgentRegistryStore(file));registry.rehydrate(make);
 assert.equal(registry.receive('member').length,1);assert.notEqual(registry.get('lead')!.loop,registry.get('member')!.loop);
 // Simulate crash after the turn committed but before mailbox acknowledgement.
 await registry.run('member',{id:'inbox:m',content:{from:'lead',content:'work'}});
 registry=new AgentRegistry(new AgentRegistryStore(file));registry.rehydrate(make);
 assert.equal((await registry.processInbox('member'))[0].status,'completed');assert.equal(calls,1);assert.equal(registry.receive('member').length,0);
 registry.send(message);assert.equal(registry.receive('member').length,0);
 assert.throws(()=>registry.unregister('lead','member'),/lead/);registry.unregister('member','lead');
 assert.deepEqual(new AgentRegistryStore(file).listAgents().map(a=>a.id),['lead']);
});
