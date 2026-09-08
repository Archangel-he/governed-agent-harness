import { InMemoryAgentRuntime } from '../runtime/index.js';
import type { AgentVersion, CandidateExperiment } from '../contracts.js';

const version: AgentVersion = {
  id: 'agent-v1', agentDefinitionId: 'example-agent', policyVersion: 'policy-v1',
  bindings: [{
    seatId: 'analysis', configDigest: 'config-v1',
    plugin: { id: 'example-analysis', version: '1.0.0', contract: 'analysis@1', kind: 'service', capabilities: [] },
  }],
};
const runtime = new InMemoryAgentRuntime();
const execution = runtime.startExecution('agent-1', version);
runtime.record({
  id: 'event-1', executionId: execution.id, agentId: 'agent-1', agentVersionId: version.id,
  operationId: 'op-1', seatId: 'analysis', pluginId: 'example-analysis', pluginVersion: '1.0.0',
  type: 'plugin/operation', status: 'succeeded',
});
runtime.finishExecution(execution, 'completed', 1);
const experiment: CandidateExperiment = {
  id: 'experiment-1', baselineVersionId: 'agent-v1', candidateVersionId: 'agent-v2',
  hypothesisId: 'hypothesis-1', status: 'proposed',
};
const decision = runtime.decideRelease(experiment, 0.9, 0.8);
console.log({ execution, events: runtime.events.length, decision });
if (decision.decision !== 'release' || runtime.events.length !== 3) throw new Error('template self-check failed');


