import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistryStore } from '../services/registry-store.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('registry persists inbox and rehydrates cold state', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'gah-reg-')), 'registry.json');
  const first = new AgentRegistryStore(file);
  first.saveAgent({id:'a',sessionId:'s',role:'member'});
  first.saveMessage({id:'m',from:'a',to:'a',content:{x:1}});
  const second = new AgentRegistryStore(file);
  assert.deepEqual(second.listAgents(), [{id:'a',sessionId:'s',role:'member'}]);
  assert.deepEqual(second.drainMessages('a')[0].content, {x:1});
});
