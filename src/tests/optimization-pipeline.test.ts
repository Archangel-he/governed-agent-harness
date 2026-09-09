import test from 'node:test';
import assert from 'node:assert/strict';
import { runOptimizationPipeline } from '../governance/optimization-pipeline.js';
import type { AgentTrace } from '../trace/events.js';
const trace = { executionId: 'e', events: [], operations: new Map(), complete: true, unknownOperations: [], openOperations: [] } as unknown as AgentTrace;
test('optimization pipeline materializes and experiments every finding before deciding', async () => {
 const order: string[] = [];
 const result = await runOptimizationPipeline({ trace, findings: () => [{ id: 'f', summary: 'x', evidenceEventIds: ['e'], affectedPlugins: ['p'], hypothesis: 'h' }], propose: finding => { order.push('propose:' + finding.id); return { id: 'c', findingId: finding.id, versionId: 'v2' }; }, experiment: async candidate => { order.push('experiment:' + candidate.id); return { candidate, baseline: { status: 'completed' }, candidateResult: { status: 'completed' }, passed: true } as never; }, decide: report => { order.push('decide'); return { status: report.passed ? 'accepted' : 'rejected', reason: 'tested' }; } });
 assert.deepEqual(order, ['propose:f', 'experiment:c', 'decide']); assert.equal(result.decisions[0].status, 'accepted');
});
