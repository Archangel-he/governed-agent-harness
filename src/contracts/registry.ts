export interface AgentInboxMessage { id: string; from: string; to: string; content: unknown; }
export type PersistedAgent = { id: string; sessionId: string; role: 'lead' | 'member' };
