export interface PluginManifest {
  id: string;
  version: string;
  capabilitySurface: string;
  seatId?: string;
  sideEffects?: string[];
}

export interface PluginEvent {
  type: string;
  payload?: unknown;
}

export interface PluginContext {
  readonly executionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly nodeId: string;
  readonly seatId?: string;
  readonly emit: (event: PluginEvent) => void;
}

export interface PluginResult {
  output?: unknown;
  artifacts?: ArtifactRef[];
  control?: ControlSignal;
}

export interface ArtifactRef {
  hash: string;
  mediaType: string;
  size: number;
}

export type ControlSignal =
  | { type: 'continue' }
  | { type: 'skip'; nodeIds: string[] }
  | { type: 'stop'; reason: string };

export interface AgentPlugin<I = unknown> {
  manifest: PluginManifest;
  invoke(input: I, context: PluginContext): Promise<PluginResult>;
}

export function definePlugin<I>(input: PluginManifest & { invoke: AgentPlugin<I>['invoke'] }): AgentPlugin<I> {
  const { invoke, ...manifest } = input;
  if (!manifest.id || !manifest.version) throw new Error('plugin id and version are required');
  return { manifest, invoke };
}
