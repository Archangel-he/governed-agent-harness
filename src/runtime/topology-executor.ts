import { compileTopology } from '../topology/compiler.js';
import type { TopologyDefinition } from '../topology/schema.js';
import type { AgentPlugin, PluginEvent, PluginResult } from '../plugins/contract.js';

interface ExecutorOptions {
  agentId: string; agentVersionId: string; executionId: string;
  plugins: Map<string, AgentPlugin>; emit: (event: Record<string, unknown>) => void;
}

export class TopologyExecutor {
  constructor(private readonly options: ExecutorOptions) {}

  async run(topology: TopologyDefinition, input: unknown): Promise<{ output: unknown; results: Map<string, PluginResult> }> {
    const plan = compileTopology(topology);
    let current = input;
    const results = new Map<string, PluginResult>();
    for (const stage of plan.stages) {
      const outputs = await Promise.all(stage.map(async nodeId => {
        const node = topology.nodes.find(item => item.id === nodeId)!;
        const pluginId = node.pluginId ?? node.id;
        const plugin = this.options.plugins.get(pluginId);
        if (!plugin) throw new Error(`plugin not registered: ${pluginId}`);
        const operationId = `${this.options.executionId}:${nodeId}`;
        this.options.emit({ type: 'node/start', operationId, nodeId, pluginId, status: 'started' });
        const pluginEvents: PluginEvent[] = [];
        try {
          const result = await plugin.invoke(current, {
            executionId: this.options.executionId,
            agentId: this.options.agentId,
            agentVersionId: this.options.agentVersionId,
            nodeId,
            seatId: node.seatId,
            emit: event => pluginEvents.push(event)
          });
          results.set(nodeId, result);
          this.options.emit({ type: 'node/end', operationId, nodeId, pluginId, status: 'succeeded', output: result.output, events: pluginEvents });
          return result.output;
        } catch (error) {
          this.options.emit({ type: 'node/end', operationId, nodeId, pluginId, status: 'failed', error: error instanceof Error ? error.message : String(error), events: pluginEvents });
          throw error;
        }
      }));
      current = outputs.length === 1 ? outputs[0] : outputs;
    }
    return { output: current, results };
  }
}
