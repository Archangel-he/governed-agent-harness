import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WikiStore } from '../memory/wiki.js';

test('wiki publishes immutable revisions and detects stale proposals', async()=>{
 const w=new WikiStore(mkdtempSync(join(tmpdir(),'wiki-'))); w.createScope('agent','a');
 const s=await w.source(Buffer.from('source')); const base=w.pinned('agent','a');
 const p=await w.propose({scope:'agent',owner:'a',pageId:'p',baseRelease:base.id,title:'P',markdown:'one',status:'fact',sources:[s]});
 const r=w.publish(p.id,"a"); assert.equal(w.read('agent','a','p')?.markdown,'one'); assert.equal(w.read('agent','a','p',base.id),undefined);
 const stale=await w.propose({scope:'agent',owner:'a',pageId:'p',baseRelease:base.id,title:'P',markdown:'two',status:'hypothesis',sources:[s]});
 assert.throws(()=>w.publish(stale.id,"a"),/Release conflict/); assert.equal(w.conflicts().length,1); assert.equal((await w.propose({...p})).id,p.id); assert.equal(r.pages.p.revision,1);
});



test('Wiki scopes reload across instances, reject forged sources and preserve immutable snapshots',async()=>{
 const root=mkdtempSync(join(tmpdir(),'wiki-')),one=new WikiStore(root),two=new WikiStore(root);
 const base=one.pinned('team','lead'),source=await one.source(Buffer.from('original'));
 const input={id:'same',scope:'team' as const,owner:'lead',proposedBy:'member',pageId:'knowledge',baseRelease:base.id,title:'Knowledge',markdown:'useful',status:'fact' as const,sources:[source]};
 const proposal=await one.propose(input);
 await assert.rejects(two.propose({...input,markdown:'changed'}),/collision/);
 await assert.rejects(one.propose({...input,id:'forged',sources:[{hash:'0'.repeat(64)}]}),/source/);
 await assert.rejects(one.propose({...input,id:'empty',sources:[]}),/Invalid/);
 await assert.rejects(one.propose({...input,id:'escape',pageId:'../escape'}),/Invalid/);
 assert.throws(()=>two.publish(proposal.id,'member'),/Unauthorized/);
 const release=two.publish(proposal.id,'lead');release.pages.knowledge.markdown='mutation';
 assert.equal(one.search('team','lead','useful')[0].markdown,'useful');
 const found=one.search('team','lead','useful');found[0].markdown='mutation';assert.equal(one.read('team','lead','knowledge')?.markdown,'useful');
 assert.deepEqual(one.publish(proposal.id,'lead'),two.pinned('team','lead'));
 assert.throws(()=>one.search('agent','other','',release.id),/scope/);
 const badLink=await one.propose({...input,id:'broken-link',baseRelease:release.id,markdown:'[[missing]]'});
 assert.throws(()=>one.publish(badLink.id,'lead'),/lint/);assert.equal(one.pinned('team','lead').id,release.id);
 const {readFileSync}=await import('node:fs');assert.match(readFileSync(join(root,'releases',release.id,'index.md'),'utf8'),/pages\/knowledge.md/);
});
