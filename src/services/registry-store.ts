import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentInboxMessage, PersistedAgent } from '../contracts/registry.js';

/** Local registry metadata and inbox snapshots; does not start AgentLoop instances. */
export class AgentRegistryStore {
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
