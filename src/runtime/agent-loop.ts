import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { SessionEvent, SessionStore } from '../contracts/runtime.js';
import type { AgentVersion } from '../contracts/domain.js';
import { jsonSnapshot } from '../services/log-value.js';
import { SessionTrajectoryProjector } from '../trace/session-projector.js';
import type { TrajectoryStore } from '../contracts/runtime.js';

import type { LoopRequest, LoopResult, ToolCall, ModelResponse, ModelInput, ProviderIdentity, ModelProvider, ToolProvider, LoopOptions } from '../contracts/loop.js';
export type { LoopRequest, LoopResult, ToolCall, ModelResponse, ModelChunk, ModelInput, ProviderIdentity, ModelProvider, ToolProvider, LoopOptions } from '../contracts/loop.js';
type Envelope = Record<string, unknown> & { requestId: string; executionId: string; };

export class AgentLoop {
  private active?: AbortController;
  private readonly version: AgentVersion;
  private readonly tools: Record<string, ToolProvider>;
  private readonly projector?: SessionTrajectoryProjector;
  private eventQueue: Promise<void> = Promise.resolve();
  private eventError: unknown;
  constructor(
    private readonly sessionId: string,
    version: AgentVersion,
    private readonly sessions: SessionStore,
    private readonly options: LoopOptions,
    trajectory?: { store: TrajectoryStore; agentId: string },
  ) {
    if (!sessionId || !Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) throw new Error('Invalid loop configuration');
    if(!Number.isSafeInteger(options.maxRetries??0)||(options.maxRetries??0)<0||!Number.isFinite(options.retryDelayMs??0)||(options.retryDelayMs??0)<0)throw new Error('Invalid retry policy');
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
      const endedOperations=new Set(events.filter(e=>['assistant/message','model/error','tool/result'].includes(e.type)).map(e=>(e.payload as Envelope).operationId));
      for(const opened of events.filter(e=>['model/request','tool/call'].includes(e.type)).reverse()){
        const p=opened.payload as Envelope;
        if(p.operationId&&!endedOperations.has(p.operationId))this.append(opened.type==='tool/call'?'tool/result':'model/error',{
          ...p,status:'unknown',error:'Previous owner stopped; external outcome unknown',
          ...(opened.type==='tool/call'?{content:{callId:p.callId??null,error:'External outcome unknown'}}:{})
        });
      }
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
    request = { ...jsonSnapshot({ id: request.id, content: request.content, ...(request.executionId?{executionId:request.executionId}:{}) }), signal: request.signal };
    this.eventError=undefined;
    const release = this.sessions.acquire(this.sessionId);
    const controller = new AbortController();
    this.active = controller;
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', onAbort, { once: true });
    if (request.signal?.aborted) controller.abort(request.signal.reason);
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
      const executionId = request.executionId ?? crypto.randomUUID();
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
          await this.flushEvents();
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
              await this.flushEvents();
              signal.throwIfAborted();
              if (!tool) throw new Error('Tool not authorized: ' + call.name);
              const output = jsonSnapshot(await tool.invoke(jsonSnapshot(call.input), signal));
              // Record a settled external result even if cancellation arrived while it ran.
              this.append('tool/result', { ...toolOperation, content: { callId: call.id, output }, status: 'completed' });
            } catch (error) {
              this.append('tool/result', { ...toolOperation, content: { callId: call.id, error: String(error) }, status: signal.aborted?'unknown':'failed' });
              throw error;
            }
          }
          signal.throwIfAborted();
          this.append('step/end', { ...base, stepId, status: 'completed' });
          stepId = undefined;
          if (response.toolCalls.length === 0) {
            const result: LoopResult = { requestId: request.id, status: 'completed', output: response.content };
            this.append('turn/end', { ...base, ...result });
            await this.flushEvents();
            return result;
          }
        }
        throw new Error('Step budget exhausted');
      } catch (error) {
        const result: LoopResult = { requestId: request.id, status: signal.aborted ? 'cancelled' : 'failed', error: String(error) };
        if (stepId) this.append('step/end', { ...base, stepId, status: result.status });
        if(!this.history().some(e=>e.type==='turn/end'&&(e.payload as Envelope).executionId===executionId))this.append('turn/end', { ...base, ...result });
        try { await this.flushEvents(); } catch (sinkError) { return {...result,status:'failed',error:String(sinkError)}; }
        return result;
      }
    } finally {
      this.active = undefined;
      request.signal?.removeEventListener('abort', onAbort);
      release();
    }
  }

  private async invokeModel(model: ModelProvider, input: ModelInput, signal: AbortSignal, operation: Record<string, unknown>): Promise<ModelResponse> {
    const retries = this.options.maxRetries ?? 0;
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        this.append('assistant/attempt', { ...operation, attempt });
        await this.flushEvents();
        if (!model.stream) return await model.invoke(jsonSnapshot(input), signal);
        let content = ''; let done=false; const deltas=new Map<number,{id?:string;name?:string;arguments:string}>(); const calls: ToolCall[] = []; let usage: unknown; let replayState: unknown; let requestHeader: unknown;
        for await (const chunk of model.stream(jsonSnapshot(input), signal)) {
          signal.throwIfAborted();
          if(done)throw new Error('Stream frame after completion');
          if(chunk.done)done=true;
          for(const delta of chunk.toolCallDeltas??[]){
            if(!Number.isSafeInteger(delta.index)||delta.index<0)throw new Error('Invalid tool delta index');
            const previous=deltas.get(delta.index)??{arguments:''};
            if(delta.id!==undefined&&previous.id!==undefined&&delta.id!==previous.id)throw new Error('Tool delta identity changed');
            if(delta.name!==undefined&&previous.name!==undefined&&delta.name!==previous.name)throw new Error('Tool delta name changed');
            deltas.set(delta.index,{...previous,...(delta.id===undefined?{}:{id:delta.id}),...(delta.name===undefined?{}:{name:delta.name}),arguments:previous.arguments+(delta.arguments??'')});
          }
          if (chunk.content !== undefined) content += typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
          if (chunk.toolCalls) calls.push(...jsonSnapshot(chunk.toolCalls));
          if (chunk.usage !== undefined) usage = jsonSnapshot(chunk.usage);
          if (chunk.replayState !== undefined) replayState = jsonSnapshot(chunk.replayState);
          if (chunk.requestHeader !== undefined) requestHeader = jsonSnapshot(chunk.requestHeader);
          this.append('assistant/stream', { ...operation, attempt, chunk, ...(chunk.usage !== undefined ? { usage: chunk.usage } : {}), ...(chunk.replayState !== undefined ? { replayState: chunk.replayState } : {}), ...(chunk.requestHeader !== undefined ? { requestHeader: chunk.requestHeader } : {}) });
          await this.flushEvents();
        }
        if(!done)throw new Error('Incomplete model stream');
        for(const [,delta] of [...deltas].sort(([a],[b])=>a-b)){if(!delta.id||!delta.name)throw new Error('Incomplete tool delta');calls.push({id:delta.id,name:delta.name,input:JSON.parse(delta.arguments)})}
        const ids = new Set<string>();
        for (const call of calls) { if (!call?.id || ids.has(call.id)) throw new Error('Invalid streamed tool call'); ids.add(call.id); }
        return { content, toolCalls: calls, ...(usage === undefined ? {} : { usage }), ...(replayState === undefined ? {} : { replayState }), ...(requestHeader === undefined ? {} : { requestHeader }) };
      } catch (error) {
        last = error;
        if (signal.aborted || this.eventError!==undefined || attempt >= retries) throw error;
        const handlers=this.options.requestErrorHandlers??[];
        let cursor=-1;
        const dispatch=async(index:number):Promise<import('../contracts/loop.js').RetryAction>=>{
          if(index<=cursor)throw new Error('Retry waterfall next called twice');cursor=index;
          if(index<handlers.length)return handlers[index]({error,attempt,provider:identity(model),signal},()=>dispatch(index+1));
          return this.options.isRetryableError?.(error)===false?undefined:{kind:'retry',delayMs:this.options.retryDelayMs??0};
        };
        const action=await dispatch(0);signal.throwIfAborted();
        if(!action)throw error;
        if(action.kind!=='retry'||!Number.isFinite(action.delayMs??0)||(action.delayMs??0)<0)throw new Error('Invalid retry action');
        this.append('model/retry', { ...operation, attempt, error: String(error), delayMs:action.delayMs??0 });
        await this.flushEvents();
        if(action.delayMs)await delay(action.delayMs,undefined,{signal});
        this.append('model/retry-started',{...operation,attempt:attempt+1});
      }
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
    if(this.options.eventSink) this.eventQueue=this.eventQueue.then(async()=>{
      if(this.eventError!==undefined)return;
      try {await this.options.eventSink!(jsonSnapshot(event));} catch(error){this.eventError=error??new Error('Event sink failed');}
    });
  }
  private async flushEvents():Promise<void> {await this.eventQueue;if(this.eventError!==undefined)throw this.eventError;}
}
function identity(provider: ProviderIdentity): ProviderIdentity {
  return { seatId: provider.seatId, pluginId: provider.pluginId, pluginVersion: provider.pluginVersion };
}

