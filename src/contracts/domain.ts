import type { TraceEvent as importTraceEvent } from '../trace/events.js';
export type PluginKind = 'service' | 'event' | 'agent' | 'execution' | 'governance';
export type { TopologyDefinition, TopologyNode, TopologyEdge } from '../topology/schema.js';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface PluginDefinition {
  id: string;
  version: string;
  contract: string;
  kind: PluginKind;
  capabilities: string[];
}

export interface PluginSeat {
  id: string;
  role: string;
  contract: string;
  requiredCapabilities: string[];
  primaryClusterId: string;
  observationClusterIds: string[];
}

export interface PluginBinding {
  seatId: string;
  plugin: PluginDefinition;
  configDigest: string;
}

export interface AgentVersion {
  id: string;
  agentDefinitionId: string;
  seats?: PluginSeat[];
  bindings: PluginBinding[];
  policyVersion: string;
  topology?: import('../topology/schema.js').TopologyDefinition;
}

export interface AgentInstance {
  id: string;
  definitionId: string;
  activeVersionId: string;
  rootSessionId: string;
  status: 'active' | 'paused' | 'failed' | 'retired';
}

export interface Execution {
  id: string;
  agentId: string;
  agentVersionId: string;
  status: RunStatus;
  rootRevisionBefore: number;
  rootRevisionAfter?: number;
}

export type TrajectoryStatus = import('../trace/events.js').TraceStatus;
/** Compatibility name for the canonical evidence event with required Agent identity. */
export interface TrajectoryEvent extends importTraceEvent {
  agentId:string;
  agentVersionId:string;
  errorCode?:string;
}

export interface GovernanceCluster {
  id: string;
  version: string;
  seatIds: string[];
  metricProfile: string;
}

export interface Observation {
  id: string;
  executionId: string;
  text: string;
  evidenceEventIds: string[];
}

export interface Finding {
  id: string;
  observationIds: string[];
  statement: string;
}

export interface Hypothesis {
  id: string;
  findingIds: string[];
  statement: string;
}

export interface CandidateExperiment {
  id: string;
  baselineVersionId: string;
  candidateVersionId: string;
  hypothesisId: string;
  status: 'proposed' | 'running' | 'accepted' | 'rejected';
  agentScore?: number;
}

export interface ReleaseDecision {
  candidateId: string;
  decision: 'release' | 'reject';
  reason: string;
}
