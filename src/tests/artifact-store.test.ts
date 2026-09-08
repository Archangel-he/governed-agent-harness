import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalArtifactStore } from '../services/artifact-store.js';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('artifact store addresses immutable content by hash', async () => {
  const store = new LocalArtifactStore(mkdtempSync(join(tmpdir(), 'gah-artifact-')));
  const first = await store.put(Buffer.from('hello'), 'text/plain');
  const second = await store.put(Buffer.from('hello'), 'text/plain');
  assert.equal(first.hash, second.hash);
  assert.deepEqual(await store.get(first.hash), Buffer.from('hello'));
  assert.equal(await store.has(first.hash), true);
});
