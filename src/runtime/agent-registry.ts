import type { AgentInboxMessage } from '../contracts/registry.js';
import type { AgentLoop, LoopRequest, LoopResult } from './agent-loop.js';

export interface RegisteredAgent { id: string; sessionId: string; loop: AgentLoop; role: 'lead' | 'member'; }

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
