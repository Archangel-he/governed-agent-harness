import type { LifecyclePlugin } from '../plugins/lifecycle.js';
﻿import { CordisPluginHost } from '../runtime/cordis-host.js';
import { FileWorkspaceStore, JsonlTrajectoryStore } from '../services/file-store.js';
import { MemoryGateway } from '../services/gateway.js';
import { JsonlTeamStore, TeamBoard } from '../team/team.js';

import type { AgentVersion } from '../contracts/domain.js';
import { LocalSandboxAdapter } from '../sandbox/adapter.js';
import { AgentLoop } from '../runtime/agent-loop.js';
import { MemorySessionStore } from '../services/memory.js';
const sessions = new MemorySessionStore();
let modelCalls = 0;
const version: AgentVersion = { id: 'prod-v1', agentDefinitionId: 'prod', policyVersion: 'p1', bindings: [] };
const loop = new AgentLoop('session-1', version, sessions, {
  systemPrompt: 'Generic test agent', maxSteps: 3,
  model: { seatId: 'model', pluginId: 'fake-model', pluginVersion: '1', invoke: async () => {
    modelCalls++;
    return modelCalls === 1 ? { content: 'use tool', toolCalls: [{ id: 'call-1', name: 'echo', input: 'hello' }] } : { content: 'done', toolCalls: [] };
  } },
  tools: { echo: { seatId: 'echo', pluginId: 'echo', pluginVersion: '1', invoke: async input => input } },
});
const loopResult = await loop.run({ id: 'request-1', content: 'hello' });
if (loopResult.status !== 'completed' || modelCalls !== 2 || loop.recoverable()) throw new Error('agent loop check failed');
const trajectory = new JsonlTrajectoryStore('.tmp/trajectory.jsonl');
const plugin: LifecyclePlugin = { binding: { seatId: 'demo', configDigest: 'x', plugin: { id: 'demo', version: '1', contract: 'demo@1', kind: 'service', capabilities: [] } }, async activate(ctx) { ctx.record({ operationId: 'demo', type: 'plugin/operation', status: 'succeeded', seatId: 'demo', pluginId: 'demo', pluginVersion: '1' }); }, async dispose() {} };
const host = new CordisPluginHost(); const run = await host.run('prod-agent', version, [plugin], new MemoryGateway(new Set()), trajectory);
if (run.status !== 'completed' || trajectory.list(run.id).length !== 1) throw new Error('production cordis check failed');
const ws = new FileWorkspaceStore('.tmp/workspace'); ws.write('root', 'ok.txt', 'ok'); if (ws.read('root', 'ok.txt') !== 'ok') throw new Error('workspace check failed');
const teamFile = '.tmp/team.jsonl'; const board = new TeamBoard(new JsonlTeamStore(teamFile)); const task = board.createTask('demo'); board.updateTask(task.id, 1, 'completed', 'agent-1'); const reopenedTeam = new TeamBoard(new JsonlTeamStore(teamFile)); if (reopenedTeam.tasks[0]?.status !== 'completed') throw new Error('team persistence check failed');
const sandbox = new LocalSandboxAdapter().create({ id: 'sbx-1', root: '.tmp/sandbox', network: 'none' }); sandbox.resolve('inside.txt'); try { sandbox.resolve('../escape'); throw new Error('sandbox escape check failed'); } catch (error) { if (!(error instanceof Error) || !error.message.includes('sandbox path escape')) throw error; }
console.log({ ok: true, cordis: run.status, trajectory: trajectory.list(run.id).length, teamTask: task.status });

