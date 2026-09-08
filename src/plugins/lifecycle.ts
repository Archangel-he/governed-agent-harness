import type { AgentVersion, Execution, PluginBinding, TrajectoryEvent } from '../contracts/domain.js';
import type { Gateway, GatewayPrincipal } from '../contracts/runtime.js';

export interface LifecyclePlugin {
  readonly binding: PluginBinding;
  activate(ctx: LifecycleContext): Promise<void>;
  dispose(): Promise<void>;
}

export interface LifecycleContext {
  readonly execution: Execution;
  readonly agentVersion: AgentVersion;
  readonly principal: GatewayPrincipal;
  readonly gateway: Gateway;
  record(event: Omit<TrajectoryEvent, 'id'|'executionId'|'agentId'|'agentVersionId'>): void;
}
