import type { TrajectoryEvent } from './domain.js';

export interface ServiceDefinition<TRequest, TResponse> { readonly contract: string; }
export interface ServiceProvider<TRequest, TResponse> { readonly definition: ServiceDefinition<TRequest, TResponse>; invoke(request: TRequest): Promise<TResponse>; }
export interface ServiceConsumer<TRequest, TResponse> { call(request: TRequest): Promise<TResponse>; }
export interface SessionEvent { readonly id: string; readonly sessionId: string; readonly type: string; readonly payload: unknown; }
export interface SessionStore {
  append(event: SessionEvent): void;
  events(sessionId: string): SessionEvent[];
  acquire(sessionId: string): () => void;
  metadata?(sessionId: string): { version: number; generation: number };
}
export interface WorkspaceStore { write(workspaceId: string, path: string, content: string): void; read(workspaceId: string, path: string): string | undefined; }
export interface TrajectoryStore { append(event: TrajectoryEvent): void; list(executionId: string): TrajectoryEvent[]; }
export interface GatewayPrincipal { agentId: string; agentVersionId: string; executionId: string; seatId: string; }
export interface Gateway { invoke<T>(principal: GatewayPrincipal, capability: string, request: T): Promise<unknown>; }
export interface RecoveryRecord { executionId: string; status: 'retryable' | 'terminal' | 'recovered'; reason: string; attempts: number; }
