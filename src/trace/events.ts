export type TraceStatus = 'started' | 'succeeded' | 'failed' | 'cancelled' | 'unknown' | 'skipped';
export interface TraceEvent {
  id: string;
  executionId: string;
  type: string;
  operationId: string;
  nodeId?: string;
  parentOperationId?: string;
  status: TraceStatus;
  sequence?: number;
  operationSequence?: number;
  phase?: 'start' | 'fact' | 'end';
  agentId?: string;
  agentVersionId?: string;
  seatId?: string;
  pluginId?: string;
  pluginVersion?: string;
  dependencyOperationIds?: string[];
  timestamp?: number;
  inputRef?: string;
  outputRef?: string;
  sourceEventId?: string;
  payload?: unknown;
}
export interface TraceOperation {
  operationId: string;
  status: TraceStatus;
  nodeId?: string;
  startEventId: string;
  terminalEventId?: string;
  parentOperationId?: string;
  dependencyOperationIds: string[];
}
export interface AgentTrace {
  executionId: string;
  events: TraceEvent[];
  operations: Map<string, TraceOperation>;
  complete: boolean;
  unknownOperations: string[];
  openOperations: string[];
}
