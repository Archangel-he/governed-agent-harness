import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgent } from '../governance/agent-evaluator.js';

test('agent evaluation aggregates outcomes across all plugins', () => {
  const result = evaluateAgent([
    {id:'1',executionId:'e',agentId:'a',agentVersionId:'v',operationId:'o1',seatId:'s1',type:'x',status:'succeeded'},
    {id:'2',executionId:'e',agentId:'a',agentVersionId:'v',operationId:'o2',seatId:'s2',type:'x',status:'failed'}
  ], {expectedOperations: 2});
  assert.equal(result.successRate, .5);
  assert.equal(result.pluginCount, 2);
  assert.equal(result.completed, true);
});
