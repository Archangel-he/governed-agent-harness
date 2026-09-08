import type { TrajectoryEvent } from '../contracts/domain.js';

export interface AgentEvaluation {
  successRate: number;
  pluginCount: number;
  operationCount: number;
  failed: number;
  completed: boolean;
}

export function evaluateAgent(events: TrajectoryEvent[], options: { expectedOperations?: number } = {}): AgentEvaluation {
  const operations = new Set(events.map(event => event.operationId));
  const plugins = new Set(events.map(event => event.pluginId ?? event.seatId).filter(Boolean));
  const failed = events.filter(event => event.status === 'failed').length;
  const succeeded = events.filter(event => event.status === 'succeeded').length;
  return {
    successRate: events.length ? succeeded / events.length : 0,
    pluginCount: plugins.size,
    operationCount: operations.size,
    failed,
    completed: options.expectedOperations === undefined || operations.size >= options.expectedOperations
  };
}
