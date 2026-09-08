import type { AgentLoop, LoopRequest, LoopResult } from './agent-loop.js';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface RegisteredAgent { id: string; sessionId: string; loop: AgentLoop; role: 'lead' | 'member'; }
export interface AgentInboxMessage { id: string; from: string; to: string; content: unknown; }

/** DSH-style process-local registry; persistence remains in each AgentLoop Session. */
export class AgentRegistry {
  private readonly agents = new Map<string, RegisteredAgent>();
  private readonly inbox = new Map<string, AgentInboxMessage[]>();
  private readonly seen = new Set<string>();
  register(agent: RegisteredAgent): void { if (this.agents.has(agent.id)) throw new Error('Agent already registered'); this.agents.set(agent.id, agent); this.inbox.set(agent.id, []); agent.loop.resume(); }
  unregister(id: string): void { this.agents.delete(id); this.inbox.delete(id); }
  get(id: string): RegisteredAgent | undefined { return this.agents.get(id); }
  list(): RegisteredAgent[] { return [...this.agents.values()]; }
  send(message: AgentInboxMessage): void { if (this.seen.has(message.id)) return; if (!this.agents.has(message.to)) throw new Error('Unknown target agent'); this.seen.add(message.id); this.inbox.get(message.to)!.push({ ...message }); }
  drain(id: string): AgentInboxMessage[] { const queue = this.inbox.get(id); if (!queue) throw new Error('Unknown agent'); const result = queue.splice(0); return result; }
  async run(id: string, request: LoopRequest): Promise<LoopResult> { const agent = this.agents.get(id); if (!agent) throw new Error('Unknown agent'); return agent.loop.run(request); }
}

export type PersistedAgent = { id: string; sessionId: string; role: 'lead' | 'member' };
export class PersistentAgentRegistry {
  private state: { agents: PersistedAgent[]; inbox: Record<string, AgentInboxMessage[]>; seen: string[] };
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { agents: [], inbox: {}, seen: [] };
  }
  private save(): void { writeFileSync(this.file + '.tmp', JSON.stringify(this.state) + '\n', 'utf8'); renameSync(this.file + '.tmp', this.file); }
  saveAgent(agent: PersistedAgent): void { if (!this.state.agents.some(item => item.id === agent.id)) this.state.agents.push({ ...agent }); if (!this.state.inbox[agent.id]) this.state.inbox[agent.id] = []; this.save(); }
  saveMessage(message: AgentInboxMessage): void { if (this.state.seen.includes(message.id)) return; if (!this.state.inbox[message.to]) throw new Error('Unknown target agent'); this.state.seen.push(message.id); this.state.inbox[message.to].push({ ...message }); this.save(); }
  listAgents(): PersistedAgent[] { return this.state.agents.map(agent => ({ ...agent })); }
  drainMessages(id: string): AgentInboxMessage[] { const messages = this.state.inbox[id]; if (!messages) throw new Error('Unknown agent'); this.state.inbox[id] = []; this.save(); return messages.map(message => ({ ...message })); }
}
