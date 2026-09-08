import { StatelessAgentKernel } from '../kernel/stateless.js';
import { analyzeTrajectory } from '../governance/analyzer.js';
import type { AgentVersion } from '../contracts.js';

const version: AgentVersion = { id: 'minimal-v1', agentDefinitionId: 'minimal', policyVersion: 'p1', bindings: [] };
const result = await new StatelessAgentKernel().run({ executionId: 'minimal-run', agentId: 'minimal-agent', version, systemPrompt: 'Answer briefly.', userContent: 'hello' }, {
  model: { seatId: 'model', pluginId: 'demo-model', pluginVersion: '1', invoke: async () => ({ content: 'done', toolCalls: [] }) },
  tools: {},
});
if (result.status !== 'completed') throw new Error(result.error ?? 'minimal agent failed');
console.log({ status: result.status, events: result.events.length, pluginStats: analyzeTrajectory(result.trajectory).stats });

