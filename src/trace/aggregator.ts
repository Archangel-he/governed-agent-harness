import type { AgentTrace, TraceEvent } from './events.js';

export class AgentTraceAggregator {
  private readonly events: TraceEvent[] = [];
  private readonly ids = new Set<string>();
  append(event: TraceEvent): void {
    if (this.ids.has(event.id)) throw new Error(`duplicate trace event: ${event.id}`);
    this.ids.add(event.id);
    this.events.push({ ...event, sequence: this.events.length + 1 });
  }
  finish(executionId: string): AgentTrace {
    const events = this.events.filter(event => event.executionId === executionId);
    const operations = new Map<string, { operationId: string; status: TraceEvent['status']; nodeId?: string }>();
    for (const event of events) {
      const prior = operations.get(event.operationId);
      operations.set(event.operationId, { operationId: event.operationId, nodeId: event.nodeId ?? prior?.nodeId, status: event.status === 'started' && prior ? prior.status : event.status });
    }
    const complete = events.length > 0 && [...operations.values()].every(operation => operation.status !== 'started');
    return { executionId, events, operations, complete };
  }
}
