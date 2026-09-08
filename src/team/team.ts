import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { jsonSnapshot } from '../services/log-value.js';

export interface TeamMessage { id: string; senderId: string; targetId: string; content: unknown; delivered: boolean; }
export interface TeamTask { id: string; revision: number; subject: string; status: 'pending'|'in_progress'|'completed'|'deleted'; ownerId?: string; blockedBy: string[]; }
export type TeamEvent = { id: string; type: 'message/queued'|'message/delivered'|'task/created'|'task/updated'; payload: unknown };
export interface TeamStore { append(event: TeamEvent): void; events(): TeamEvent[]; }

export class MemoryTeamStore implements TeamStore {
  private readonly rows: TeamEvent[] = [];
  append(event: TeamEvent): void { if (this.rows.some(row => row.id === event.id)) throw new Error('Duplicate team event'); this.rows.push(jsonSnapshot(event)); }
  events(): TeamEvent[] { return jsonSnapshot(this.rows); }
}

export class JsonlTeamStore implements TeamStore {
  constructor(private readonly file: string) { mkdirSync(dirname(file), { recursive: true }); }
  append(event: TeamEvent): void {
    const release = this.lock();
    try {
      const rows = this.events();
      if (rows.some(row => row.id === event.id)) throw new Error('Duplicate team event');
      appendFileSync(this.file, JSON.stringify(jsonSnapshot(event)) + '\n', 'utf8');
    } finally { release(); }
  }
  events(): TeamEvent[] {
    let text: string;
    try { text = readFileSync(this.file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    if (text && !text.endsWith('\n')) throw new Error('Incomplete team log');
    return text ? text.trimEnd().split('\n').map(line => JSON.parse(line) as TeamEvent) : [];
  }
  private lock(): () => void { const path = this.file + '.lock'; const fd = openSync(path, 'wx'); closeSync(fd); return () => { try { unlinkSync(path); } catch {} }; }
}

export class TeamBoard {
  readonly messages: TeamMessage[] = [];
  readonly tasks: TeamTask[] = [];
  constructor(private readonly store: TeamStore = new MemoryTeamStore()) { this.fold(); }
  send(senderId: string, targetId: string, content: unknown): TeamMessage {
    const message: TeamMessage = { id: crypto.randomUUID(), senderId, targetId, content: jsonSnapshot(content), delivered: false };
    this.store.append({ id: crypto.randomUUID(), type: 'message/queued', payload: message }); this.messages.push(message); return message;
  }
  acknowledge(messageId: string): TeamMessage {
    const message = this.messages.find(item => item.id === messageId);
    if (!message) throw new Error('Unknown team message');
    if (!message.delivered) { message.delivered = true; this.store.append({ id: crypto.randomUUID(), type: 'message/delivered', payload: { messageId } }); }
    return message;
  }
  createTask(subject: string, blockedBy: string[] = []): TeamTask {
    if (blockedBy.some(id => !this.tasks.some(task => task.id === id))) throw new Error('Unknown task blocker');
    const task: TeamTask = { id: `task-${this.tasks.length + 1}`, revision: 1, subject, status: 'pending', blockedBy: [...blockedBy] };
    this.store.append({ id: crypto.randomUUID(), type: 'task/created', payload: task }); this.tasks.push(task); return task;
  }
  updateTask(id: string, expectedRevision: number, status: TeamTask['status'], ownerId?: string): TeamTask {
    const task = this.tasks.find(item => item.id === id);
    if (!task || task.revision !== expectedRevision) throw new Error('task revision conflict');
    if (status === 'in_progress' && task.blockedBy.some(blocker => this.tasks.find(item => item.id === blocker)?.status !== 'completed')) throw new Error('task is blocked');
    const next = { ...task, status, ...(ownerId === undefined ? {} : { ownerId }), revision: task.revision + 1 };
    this.store.append({ id: crypto.randomUUID(), type: 'task/updated', payload: next }); Object.assign(task, next); return task;
  }
  private fold(): void {
    for (const event of this.store.events()) {
      if (event.type === 'message/queued') this.messages.push(jsonSnapshot(event.payload as TeamMessage));
      if (event.type === 'message/delivered') { const message = this.messages.find(item => item.id === (event.payload as { messageId: string }).messageId); if (message) message.delivered = true; }
      if (event.type === 'task/created') this.tasks.push(jsonSnapshot(event.payload as TeamTask));
      if (event.type === 'task/updated') { const next = event.payload as TeamTask; const task = this.tasks.find(item => item.id === next.id); if (task) Object.assign(task, jsonSnapshot(next)); }
    }
  }
}


