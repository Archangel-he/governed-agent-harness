import test from 'node:test'; import assert from 'node:assert/strict'; import {mkdtempSync,writeFileSync} from 'node:fs'; import {join} from 'node:path'; import {tmpdir} from 'node:os'; import {LocalArtifactStore} from '../services/artifact-store.js'; import {LocalVersionStore} from '../services/version-store.js';
test('artifact rejects invalid hash and corruption',async()=>{const d=mkdtempSync(join(tmpdir(),'s-'));const s=new LocalArtifactStore(d);const r=await s.put(Buffer.from('x'),'text/plain');writeFileSync(join(d,r.hash),'y');await assert.rejects(()=>s.get(r.hash),'integrity');await assert.rejects(()=>s.get('..'))});
test('version ids are constrained and immutable',()=>{const d=mkdtempSync(join(tmpdir(),'v-'));const s=new LocalVersionStore(d);const v={id:'a',topology:{id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability' as const}],edges:[]}};s.publish(v);assert.throws(()=>s.publish(v));assert.throws(()=>s.publish({...v,id:'../x'}));});

test('artifact put refuses corrupt existing content instead of returning false success',async()=>{
 const d=mkdtempSync(join(tmpdir(),'artifact-'));const s=new LocalArtifactStore(d);const ref=await s.put(Buffer.from('original'),'text/plain');writeFileSync(join(d,ref.hash),'corrupt');await assert.rejects(s.put(Buffer.from('original'),'text/plain'),/integrity/);
});
