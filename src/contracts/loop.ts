export interface LoopRequest { id: string; content: unknown; }
export interface LoopResult {
  requestId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  output?: unknown;
  error?: string;
}
export interface ToolCall { id: string; name: string; input: unknown; }
export interface ModelResponse { content: unknown; toolCalls: ToolCall[]; }
export interface ModelChunk { content?: unknown; toolCalls?: ToolCall[]; done?: boolean; usage?: unknown; replayState?: unknown; requestHeader?: unknown; }
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
  systemPrompt: string;
  model: ModelProvider;
  tools: Record<string, ToolProvider>;
  maxSteps: number;
  maxRetries?: number;
}
