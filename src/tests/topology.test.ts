import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTopology, type TopologyDefinition } from '../topology/schema.js';

test('accepts a valid topology', () => {
  const topology: TopologyDefinition = {
    id: 'decision', version: '1.0.0', entry: ['intent'],
    nodes: [
      { id: 'intent', kind: 'capability' },
      { id: 'decision', kind: 'capability' }
    ],
    edges: [{ from: 'intent', to: 'decision', kind: 'data' }]
  };
  assert.equal(validateTopology(topology).ok, true);
});

test('rejects duplicate node ids', () => {
  const topology: TopologyDefinition = {
    id: 'bad', version: '1.0.0', entry: ['a'],
    nodes: [{ id: 'a', kind: 'capability' }, { id: 'a', kind: 'control' }], edges: []
  };
  const result = validateTopology(topology);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate node/i);
});

test('rejects missing edge endpoints', () => {
  const topology: TopologyDefinition = {
    id: 'bad', version: '1.0.0', entry: ['a'],
    nodes: [{ id: 'a', kind: 'capability' }], edges: [{ from: 'a', to: 'missing', kind: 'data' }]
  };
  const result = validateTopology(topology);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing.*endpoint/i);
});
