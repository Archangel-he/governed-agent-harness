import type { ArtifactRef } from '../contracts/artifact.js';

export interface PluginManifest {
  id: string;
  version: string;
  capabilitySurface: string;
  seatId?: string;
  sideEffects?: string[];
  idempotent?: boolean;
  category?: 'capability'|'infrastructure';
}

export interface PluginEvent {
  type: string;
  payload?: unknown;
}

export interface CapabilityContext {
  readonly executionId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly nodeId: string;
  readonly operationId?: string;
  readonly signal?: AbortSignal;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly seatId?: string;
  readonly memory?: Readonly<{releaseId:string;pages:readonly {pageId:string;content:string;revision:number}[]}>;
  readonly emit: (event: PluginEvent) => void;
}

export interface PluginResult {
  output?: unknown;
  artifacts?: ArtifactRef[];
  control?: ControlSignal;
}


export type ControlSignal =
  | { type: 'continue' }
  | { type: 'skip'; nodeIds: string[] }
  | { type: 'stop'; reason: string }
  | { type: 'select'; port: string }
  | { type: 'loop' };

export interface CapabilityPlugin<I = unknown> {
  manifest: PluginManifest;
  invoke(input: I, context: CapabilityContext): Promise<PluginResult>;
}

export function definePlugin<I>(input: PluginManifest & { invoke: CapabilityPlugin<I>['invoke'] }): CapabilityPlugin<I> {
  const { invoke, ...manifest } = input;
  if (!manifest.id || !manifest.version) throw new Error('plugin id and version are required');
  return { manifest: {...manifest, category: manifest.category??'capability'}, invoke };
}



