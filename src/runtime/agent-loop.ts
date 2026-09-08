import { isDeepStrictEqual } from 'node:util';
import type { SessionEvent, SessionStore } from '../contracts/runtime.js';
import type { AgentVersion } from '../contracts.js';
import { jsonSnapshot } from '../services/log-value.js';
import { SessionTrajectoryProjector } from './trajectory-projector.js';
import type { TrajectoryStore } from '../contracts/runtime.js';

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
type Envelope = Record<string, unknown> & { requestId: string; executionId: string; };

export class AgentLoop {
  private active?: AbortController;
  private readonly version: AgentVersion;
  private readonly tools: Record<string, ToolProvider>;
  private readonly projector?: SessionTrajectoryProjector;
  constructor(
    private readonly sessionId: string,
    version: AgentVersion,
    private readonly sessions: SessionStore,
    private readonly options: LoopOptions,
    trajectory?: { store: TrajectoryStore; agentId: string },
  ) {
    if (!sessionId || !Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) throw new Error('Invalid loop configuration');
    this.version = jsonSnapshot(version);
    this.tools = Object.assign(Object.create(null), options.tools);
    if (trajectory) this.projector = new SessionTrajectoryProjector(trajectory.store, trajectory.agentId, this.version);
  }

  history(): SessionEvent[] { return this.sessions.events(this.sessionId); }
  cancel(): void { this.active?.abort(new Error('Cancelled by caller')); }

  private pending(): SessionEvent[] {
    const events = this.history();
    const ended = new Set(events.filter(e => e.type === 'turn/end').map(e => (e.payload as Envelope).executionId));
    return events.filter(e => e.type === 'turn/start' && !ended.has((e.payload as Envelope).executionId));
  }
  recoverable(): boolean { return this.pending().length > 0; }

  // Mirrors DSH's interrupted-turn closure. Unknown external effects are NOT replayed.
  private closeInterrupted(): number {
    const pending = this.pending();
    for (const start of pending) {
      const { requestId, executionId } = start.payload as Envelope;
      const events = this.history().filter(e => (e.payload as Envelope).executionId === executionId);
      const endedSteps = new Set(events.filter(e => e.type === 'step/end').map(e => (e.payload as Envelope).stepId));
      for (const step of events.filter(e => e.type === 'step/start')) {
        const stepId = (step.payload as Envelope).stepId;
        if (!endedSteps.has(stepId)) this.append('step/end', { requestId, executionId, stepId, status: 'interrupted' });
      }
      this.append('turn/end', {
        requestId, executionId, status: 'interrupted',
        error: 'Previous owner stopped; reconcile unknown external effects before issuing a new request.',
      });
    }
    return pending.length;
  }
  resume(): number {
    if (this.active) throw new Error('Agent is running');
    const release = this.sessions.acquire(this.sessionId);
    try { return this.closeInterrupted(); } finally { release(); }
  }

  async run(request: LoopRequest): Promise<LoopResult> {
    if (this.active) throw new Error('Agent is already running');
    if (!request.id) throw new Error('Request ID is required');
    request = jsonSnapshot(request);
    const release = this.sessions.acquire(this.sessionId);
    const controller = new AbortController();
    this.active = controller;
    const signal = controller.signal;
    try {
      this.closeInterrupted();
      const events = this.history();
      const previous = events.find(e => e.type === 'turn/start' && (e.payload as Envelope).requestId === request.id);
      if (previous) {
        if (!isDeepStrictEqual((previous.payload as Envelope).content, request.content)) throw new Error('Request ID reused with different content');
        const terminal = events.find(e => e.type === 'turn/end' && (e.payload as Envelope).executionId === (previous.payload as Envelope).executionId);
        if (!terminal) throw new Error('Missing terminal event');
        const payload = terminal.payload as Envelope & LoopResult;
        return { requestId: request.id, status: payload.status, ...(Object.hasOwn(payload, 'output') ? { output: payload.output } : {}), ...(payload.error ? { error: payload.error } : {}) };
      }
      const executionId = crypto.randomUUID();
      const base = { requestId: request.id, executionId };
      this.append('turn/start', { ...base, content: request.content, version: this.version });
      let stepId: string | undefined;
      try {
        this.append('user/message', { ...base, content: request.content });
        for (let step = 0; step < this.options.maxSteps; step++) {
          signal.throwIfAborted();
          stepId = crypto.randomUUID();
          this.append('step/start', { ...base, stepId, step });
          const model = this.options.model;
          const operationId = crypto.randomUUID();
          const operation = { ...base, stepId, operationId, ...identity(model) };
          const input: ModelInput = {
            systemPrompt: this.options.systemPrompt,
            history: this.messages(),
            tools: Object.keys(this.tools),
          };
          this.append('model/request', { ...operation, input });
          let response: ModelResponse;
          try {
            response = jsonSnapshot(await this.invokeModel(model, input, signal, operation));
            signal.throwIfAborted();
            if (!response || !Array.isArray(response.toolCalls) || !Object.hasOwn(response, 'content')) throw new Error('Invalid model response');
            const ids = new Set<string>();
            for (const call of response.toolCalls) {
              if (!call || typeof call.id !== 'string' || !call.id || ids.has(call.id) || typeof call.name !== 'string' || !call.name || !Object.hasOwn(call, 'input')) throw new Error('Invalid model tool call');
              ids.add(call.id);
            }
          } catch (error) {
            this.append('model/error', { ...operation, error: String(error) });
            throw error;
          }
          this.append('assistant/message', { ...operation, content: response });
          for (const call of response.toolCalls) {
            const tool = Object.hasOwn(this.tools, call.name) ? this.tools[call.name] : undefined;
            const toolOperation = { ...base, stepId, operationId: crypto.randomUUID(), parentOperationId: operationId, callId: call.id, name: call.name, ...(tool ? identity(tool) : {}) };
            this.append('tool/call', { ...toolOperation, input: call.input });
            try {
              signal.throwIfAborted();
              if (!tool) throw new Error('Tool not authorized: ' + call.name);
              const output = jsonSnapshot(await tool.invoke(jsonSnapshot(call.input), signal));
              // Record a settled external result even if cancellation arrived while it ran.
              this.append('tool/result', { ...toolOperation, content: { callId: call.id, output }, status: 'completed' });
            } catch (error) {
              this.append('tool/result', { ...toolOperation, content: { callId: call.id, error: String(error) }, status: 'failed' });
              throw error;
            }
          }
          signal.throwIfAborted();
          this.append('step/end', { ...base, stepId, status: 'completed' });
          stepId = undefined;
          if (response.toolCalls.length === 0) {
            const result: LoopResult = { requestId: request.id, status: 'completed', output: response.content };
            this.append('turn/end', { ...base, ...result });
            return result;
          }
        }
        throw new Error('Step budget exhausted');
      } catch (error) {
        const result: LoopResult = { requestId: request.id, status: signal.aborted ? 'cancelled' : 'failed', error: String(error) };
        if (stepId) this.append('step/end', { ...base, stepId, status: result.status });
        this.append('turn/end', { ...base, ...result });
        return result;
      }
    } finally {
      this.active = undefined;
      release();
    }
  }

  private async invokeModel(model: ModelProvider, input: ModelInput, signal: AbortSignal, operation: Record<string, unknown>): Promise<ModelResponse> {
    const retries = this.options.maxRetries ?? 0;
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.append('assistant/attempt', { ...operation, attempt });
        if (!model.stream) return await model.invoke(jsonSnapshot(input), signal);
        let content = ''; const calls: ToolCall[] = [];
        for await (const chunk of model.stream(jsonSnapshot(input), signal)) {
          signal.throwIfAborted();
          if (chunk.content !== undefined) content += typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
          if (chunk.toolCalls) calls.push(...jsonSnapshot(chunk.toolCalls));
          this.append('assistant/stream', { ...operation, attempt, chunk, ...(chunk.usage !== undefined ? { usage: chunk.usage } : {}), ...(chunk.replayState !== undefined ? { replayState: chunk.replayState } : {}), ...(chunk.requestHeader !== undefined ? { requestHeader: chunk.requestHeader } : {}) });
        }
        return { content, toolCalls: calls };
      } catch (error) { last = error; if (attempt >= retries) throw error; this.append('model/retry', { ...operation, attempt, error: String(error) }); }
    }
    throw last;
  }

  private messages(): ModelInput['history'] {
    return this.history().flatMap(event => {
      const role = event.type === 'user/message' ? 'user' : event.type === 'assistant/message' ? 'assistant' : event.type === 'tool/result' ? 'tool' : undefined;
      return role ? [{ role, content: (event.payload as Envelope).content }] : [];
    });
  }
  private append(type: string, payload: Record<string, unknown>): void {
    const event = {
      id: crypto.randomUUID(), sessionId: this.sessionId, type,
      payload: { ...payload, agentVersionId: this.version.id, ts: new Date().toISOString() },
    } satisfies SessionEvent;
    this.sessions.append(event);
    this.projector?.append(event);
  }
}
function identity(provider: ProviderIdentity): ProviderIdentity {
  return { seatId: provider.seatId, pluginId: provider.pluginId, pluginVersion: provider.pluginVersion };
}

