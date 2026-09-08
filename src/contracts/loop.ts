export interface LoopRequest { id: string; content: unknown; signal?: AbortSignal; executionId?: string; }
export interface LoopResult {
  requestId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  output?: unknown;
  error?: string;
}
export interface ToolCall { id: string; name: string; input: unknown; }
export interface ModelResponse { content: unknown; toolCalls: ToolCall[]; usage?: unknown; replayState?: unknown; requestHeader?: unknown; }
export interface ToolCallDelta {index:number;id?:string;name?:string;arguments?:string}
export type RetryAction={kind:"retry";delayMs?:number}|undefined;
export type RequestErrorHandler=(context:{error:unknown;attempt:number;provider:ProviderIdentity;signal:AbortSignal},next:()=>Promise<RetryAction>)=>Promise<RetryAction>;
export interface ModelChunk { toolCallDeltas?:ToolCallDelta[]; content?: unknown; toolCalls?: ToolCall[]; done?: boolean; usage?: unknown; replayState?: unknown; requestHeader?: unknown; }
export interface ModelInput {
  systemPrompt: string;
  history: { role: 'user' | 'assistant' | 'tool'; content: unknown }[];
  tools: string[];
}
export interface ProviderIdentity { seatId: string; pluginId: string; pluginVersion: string; }
export interface ModelProvider extends ProviderIdentity {
  invoke(input: ModelInput, signal: AbortSignal): Promise<ModelResponse>;
  stream?(input: ModelInput, signal: AbortSignal): AsyncIterable<ModelChunk>;
}
export interface ToolProvider extends ProviderIdentity {
  invoke(input: unknown, signal: AbortSignal): Promise<unknown>;
}
export interface LoopOptions {
  eventSink?: (event: import('./runtime.js').SessionEvent) => void | Promise<void>;
  systemPrompt: string;
  model: ModelProvider;
  tools: Record<string, ToolProvider>;
  maxSteps: number;
  maxRetries?: number;
  requestErrorHandlers?: RequestErrorHandler[];
  retryDelayMs?:number;
  isRetryableError?: (error: unknown) => boolean;
}
