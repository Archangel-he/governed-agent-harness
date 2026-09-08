import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentRegistryStore } from '../services/registry-store.js';
import { LocalVersionStore } from '../services/version-store.js';
import { JsonlSessionStore } from '../services/file-store.js';
const dir=()=>mkdtempSync(join(tmpdir(),'durability-'));
test('registry transactions retain writes from multiple reopened instances',()=>{
 const file=join(dir(),'registry.json'),a=new AgentRegistryStore(file),b=new AgentRegistryStore(file);
 a.saveAgent({id:'a',sessionId:'sa',role:'lead'});b.saveAgent({id:'b',sessionId:'sb',role:'member'});
 assert.deepEqual(a.listAgents().map(x=>x.id),['a','b']);
 a.saveMessage({id:'m',from:'a',to:'b',content:{x:1}});
 b.saveMessage({id:'m',from:'a',to:'b',content:{x:1}});
 assert.throws(()=>b.saveMessage({id:'m',from:'a',to:'b',content:{x:2}}),/conflict/);
 assert.equal(new AgentRegistryStore(file).peekMessages('b').length,1);
 b.acknowledge('b','m');assert.equal(a.peekMessages('b').length,0);
});
test('activation CAS requires expected current version, including missing pointer',()=>{
 const s=new LocalVersionStore(dir());s.publish({id:'v',topology:{id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability',seatId:'s',pluginId:'p'}],edges:[]} as any});
 assert.throws(()=>s.activate('v','missing'),/CAS/);
});
test('session generation recovers from durable log when sidecar is stale',()=>{
 const file=join(dir(),'session.jsonl'),s=new JsonlSessionStore(file);
 s.append({id:'e',sessionId:'s',type:'x',payload:null});
 writeFileSync(file+'.meta.json',JSON.stringify({version:1,generation:0}));
 assert.equal(new JsonlSessionStore(file).metadata().generation,1);
});
