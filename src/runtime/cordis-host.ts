import type { LifecyclePlugin, LifecycleContext } from '../plugins/lifecycle.js';
import { Context } from 'cordis';
import type { Fiber } from 'cordis';
import type { Gateway, TrajectoryStore } from '../contracts/runtime.js';
import type { AgentVersion, Execution } from '../contracts/domain.js';
import { validateVersion } from './validate-version.js';
export class CordisPluginHost {
  private readonly root = new Context();
  async run(agentId: string, version: AgentVersion, plugins: LifecyclePlugin[], gateway: Gateway, trajectories: TrajectoryStore): Promise<Execution> {
    validateVersion(version);
    const execution: Execution = { id: crypto.randomUUID(), agentId, agentVersionId: version.id, status: 'running', rootRevisionBefore: 0 };
    const fibers: Fiber[] = [];
    try {
      for (const plugin of plugins) {
        const seatId = plugin.binding.seatId;
        const fiber = this.root.plugin({ name: `agent:${agentId}:seat:${seatId}`, apply: (ctx: Context) => { ctx.effect(() => () => {}, 'seat-lifecycle'); } });
        fibers.push(fiber);
        await fiber.await();
        const context: LifecycleContext = { execution, agentVersion: version, principal: { agentId, agentVersionId: version.id, executionId: execution.id, seatId }, gateway, record: event => trajectories.append({ id: crypto.randomUUID(), executionId: execution.id, agentId, agentVersionId: version.id, ...event }) };
        await plugin.activate(context);
      }
      execution.status = 'completed'; execution.rootRevisionAfter = 1; return execution;
    } catch (error) { execution.status = 'failed'; throw error; }
    finally { for (const plugin of [...plugins].reverse()) await plugin.dispose(); for (const fiber of fibers.reverse()) await fiber.dispose(); }
  }
}
