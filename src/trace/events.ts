export type TraceStatus = 'started' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
export interface TraceEvent {
  id: string;
  executionId: string;
  type: string;
  operationId: string;
  nodeId?: string;
  parentOperationId?: string;
  status: TraceStatus;
  sequence?: number;
  payload?: unknown;
}
export interface TraceOperation { operationId: string; status: TraceStatus; nodeId?: string; }
export interface AgentTrace { executionId: string; events: TraceEvent[]; operations: Map<string, TraceOperation>; complete: boolean; }
