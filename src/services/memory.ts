import type { SessionEvent, SessionStore, TrajectoryStore, WorkspaceStore } from '../contracts/runtime.js';
import type { TrajectoryEvent } from '../contracts.js';
import { jsonSnapshot, validateSessionEvent } from './log-value.js';

export class MemorySessionStore implements SessionStore {
  private readonly values: SessionEvent[] = [];
  private readonly writers = new Set<string>();
  acquire(sessionId: string): () => void {
    if (this.writers.has(sessionId)) throw new Error('Session is already owned: ' + sessionId);
    this.writers.add(sessionId);
    let released = false;
    return () => { if (!released) { released = true; this.writers.delete(sessionId); } };
  }
  append(event: SessionEvent): void {
    validateSessionEvent(event);
    if (this.values.some(item => item.id === event.id)) throw new Error('Duplicate event ID');
    this.values.push(jsonSnapshot(event));
  }
  events(sessionId: string): SessionEvent[] { return jsonSnapshot(this.values.filter(e => e.sessionId === sessionId)); }
}
export class MemoryWorkspaceStore implements WorkspaceStore {
  private readonly values = new Map<string, string>();
  write(workspaceId: string, path: string, content: string): void { this.values.set(`${workspaceId}:${path}`, content); }
  read(workspaceId: string, path: string): string | undefined { return this.values.get(`${workspaceId}:${path}`); }
}
export class MemoryTrajectoryStore implements TrajectoryStore {
  private readonly values: TrajectoryEvent[] = [];
  append(event: TrajectoryEvent): void { this.values.push(jsonSnapshot(event)); }
  list(executionId: string): TrajectoryEvent[] { return jsonSnapshot(this.values.filter(e => e.executionId === executionId)); }
}
