import type { AgentPlugin } from '../contracts/runtime.js';
import { CordisHost } from '../runtime/host.js';
import { MemoryTrajectoryStore } from '../services/memory.js';
import type { AgentVersion } from '../contracts.js';

const version: AgentVersion = { id: 'generic-v1', agentDefinitionId: 'generic-agent', policyVersion: 'policy-v1', bindings: [] };
const plugin: AgentPlugin = { binding: { seatId: 'capability', configDigest: 'empty', plugin: { id: 'generic-plugin', version: '1.0.0', contract: 'capability@1', kind: 'service', capabilities: [] } }, async activate(ctx) { ctx.record({ operationId: 'op-1', type: 'plugin/operation', status: 'succeeded', seatId: 'capability', pluginId: 'generic-plugin', pluginVersion: '1.0.0' }); }, async dispose() {} };
export async function runGenericAgent(): Promise<number> { const store = new MemoryTrajectoryStore(); const host = new CordisHost(store, { invoke: async () => undefined }); const execution = await host.run('generic-1', version, [plugin]); return store.list(execution.id).length; }

