import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentTraceAggregator } from '../trace/aggregator.js';

test('reconstructs complete agent trace with stable sequence', () => {
  const agg = new AgentTraceAggregator();
  agg.append({id:'n1',executionId:'e',type:'node/start',operationId:'op',nodeId:'a',status:'started'});
  agg.append({id:'n2',executionId:'e',type:'node/end',operationId:'op',nodeId:'a',status:'succeeded'});
  const trace = agg.finish('e');
  assert.equal(trace.complete, true);
  assert.deepEqual(trace.events.map(e => e.sequence), [1,2]);
  assert.equal(trace.operations.get('op')?.status, 'succeeded');
});

test('missing terminal state is incomplete', () => {
  const agg = new AgentTraceAggregator();
  agg.append({id:'n1',executionId:'e',type:'node/start',operationId:'op',nodeId:'a',status:'started'});
  assert.equal(agg.finish('e').complete, false);
});
