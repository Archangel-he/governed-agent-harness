import type { AgentTrace, TraceEvent, TraceOperation } from './events.js';
import { jsonSnapshot } from '../services/log-value.js';

export class AgentTraceAggregator {
  private readonly events: TraceEvent[] = [];
  private readonly ids = new Set<string>();
  private readonly operations = new Map<string, TraceOperation>();
  private readonly sequences = new Map<string, number>();
  private readonly operationSequences = new Map<string, number>();

  append(input: TraceEvent): void {
    const event = jsonSnapshot(input);
    for (const field of ['id', 'executionId', 'type', 'operationId'] as const) {
      if (typeof event[field] !== 'string' || !event[field]) throw new Error('Invalid trace ' + field);
    }
    if (!['started','succeeded','failed','cancelled','unknown','skipped'].includes(event.status)) throw new Error('Invalid trace status');
    if (this.ids.has(event.id)) throw new Error('duplicate trace event: ' + event.id);
    const key = JSON.stringify([event.executionId, event.operationId]);
    const previous = this.operations.get(key);
    const phase = event.phase ?? (event.status === 'started' ? 'start' : 'end');
    if (!['start','fact','end'].includes(phase)) throw new Error('Invalid trace phase');
    if (phase === 'start') {
      if (previous) throw new Error('Duplicate operation start');
      if (event.status !== 'started') throw new Error('Start requires started status');
      for (const dependency of event.dependencyOperationIds ?? []) {
        const operation = this.operations.get(JSON.stringify([event.executionId, dependency]));
        if (!operation || operation.status === 'started') throw new Error('Dependency not settled: ' + dependency);
      }
      if (event.parentOperationId && !this.operations.has(JSON.stringify([event.executionId,event.parentOperationId]))) throw new Error('Missing parent operation');
    } else {
      if (!previous) throw new Error('Missing operation start: ' + event.operationId);
      if (previous.terminalEventId) throw new Error('Operation already terminal: ' + event.operationId);
      if (phase === 'end' && event.status === 'started') throw new Error('End requires terminal status');
    }
    const sequence = (this.sequences.get(event.executionId) ?? 0) + 1;
    const operationSequence = (this.operationSequences.get(key) ?? 0) + 1;
    if (event.sequence !== undefined && event.sequence !== sequence) throw new Error('Trace sequence gap');
    if (event.operationSequence !== undefined && event.operationSequence !== operationSequence) throw new Error('Operation sequence gap');
    // Validation happens before state mutation, so rejected appends leave the log usable.
    if (phase === 'start') this.operations.set(key, {
      operationId:event.operationId, status:'started', startEventId:event.id,
      ...(event.nodeId ? {nodeId:event.nodeId} : {}),
      ...(event.parentOperationId ? {parentOperationId:event.parentOperationId} : {}),
      dependencyOperationIds:event.dependencyOperationIds ?? []
    });
    if (phase === 'end') Object.assign(previous!, {status:event.status,terminalEventId:event.id});
    this.ids.add(event.id);
    this.sequences.set(event.executionId,sequence);
    this.operationSequences.set(key,operationSequence);
    this.events.push({...event,phase,sequence,operationSequence});
  }

  finish(executionId: string): AgentTrace {
    const events = jsonSnapshot(this.events.filter(event => event.executionId === executionId));
    const ids = new Set(events.map(event=>event.operationId));
    const operations = new Map([...ids].map(id=>[id,jsonSnapshot(this.operations.get(JSON.stringify([executionId,id]))!)]));
    const openOperations=[...operations.values()].filter(op=>op.status==='started').map(op=>op.operationId);
    const unknownOperations=[...operations.values()].filter(op=>op.status==='unknown').map(op=>op.operationId);
    return { executionId, events, operations, openOperations, unknownOperations, complete: events.length>0 && openOperations.length===0 && unknownOperations.length===0 };
  }
}
