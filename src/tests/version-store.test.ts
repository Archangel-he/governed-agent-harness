import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalVersionStore } from '../services/version-store.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('publishes immutable versions and rolls active pointer back', () => {
  const store = new LocalVersionStore(mkdtempSync(join(tmpdir(), 'gah-version-')));
  store.publish({id:'v1', topology:{id:'t',version:'1',entry:['n'],nodes:[{id:'n',kind:'capability'}],edges:[]}});
  store.publish({id:'v2', topology:{id:'t',version:'2',entry:['n'],nodes:[{id:'n',kind:'capability'}],edges:[]}});
  store.activate('v2');
  assert.equal(store.active().id, 'v2');
  store.rollback('v1');
  assert.equal(store.active().id, 'v1');
  assert.throws(() => store.publish({id:'v1', topology:{id:'x',version:'x',entry:['n'],nodes:[{id:'n',kind:'capability'}],edges:[]}}), /immutable/i);
});
