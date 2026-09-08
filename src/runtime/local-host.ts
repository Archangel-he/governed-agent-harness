import type { LifecyclePlugin, LifecycleContext } from '../plugins/lifecycle.js';
import type { Gateway } from '../contracts/runtime.js';
import type { AgentVersion, Execution, TrajectoryEvent } from '../contracts/domain.js';
import type { TrajectoryStore } from '../contracts/runtime.js';
import { validateVersion } from './validate-version.js';

export class LocalPluginHost {
  constructor(private readonly trajectories: TrajectoryStore, private readonly gateway: Gateway) {}
  async run(agentId: string, version: AgentVersion, plugins: LifecyclePlugin[], revision = 0): Promise<Execution> {
    validateVersion(version);
    const execution: Execution = { id: crypto.randomUUID(), agentId, agentVersionId: version.id, status: 'running', rootRevisionBefore: revision };
    const ctx: LifecycleContext = { execution, agentVersion: version, principal: { agentId, agentVersionId: version.id, executionId: execution.id, seatId: 'agent-host' }, gateway: this.gateway, record: e => this.record(agentId, version.id, execution.id, e) };
    for (const plugin of plugins) await plugin.activate(ctx);
    execution.status = 'completed'; execution.rootRevisionAfter = revision + 1;
    for (const plugin of [...plugins].reverse()) await plugin.dispose();
    return execution;
  }
  private record(agentId: string, versionId: string, executionId: string, event: Omit<TrajectoryEvent, 'id'|'executionId'|'agentId'|'agentVersionId'>): void {
    this.trajectories.append({ id: crypto.randomUUID(), executionId, agentId, agentVersionId: versionId, ...event });
  }
}
