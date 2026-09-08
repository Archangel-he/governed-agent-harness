import { MemorySessionStore, MemoryTrajectoryStore } from '../../services/memory.js';
import { AgentLoop } from '../agent-loop.js';
import type { AgentKernel, KernelDependencies, KernelEvent, KernelInput, KernelResult } from '../../contracts/kernel.js';
import type { SessionEvent } from '../../contracts/runtime.js';

/** One-turn kernel adapter: all state is local to run and returned as events. */
export class StatelessAgentKernel implements AgentKernel {
  async run(input: KernelInput, deps: KernelDependencies, signal = new AbortController().signal): Promise<KernelResult> {
    const sessions = new MemorySessionStore();
    const trajectoryStore = new MemoryTrajectoryStore();
    const events: KernelEvent[] = [];
    const sessionId = `kernel-${input.executionId}`;
    const loop = new AgentLoop(sessionId, input.version, sessions, { systemPrompt: input.systemPrompt, model: deps.model, tools: deps.tools, maxSteps: 16 }, { store: trajectoryStore, agentId: input.agentId });
    const original = sessions.append.bind(sessions);
    sessions.append = (event: SessionEvent) => { original(event); const row = { sequence: events.length + 1, executionId: input.executionId, type: event.type, payload: event.payload }; events.push(row); void deps.emit?.(row); };
    const abort = new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    try {
      const result = await Promise.race([loop.run({ id: input.executionId, content: input.userContent }), abort]);
      const executionId = String((events.find(event => event.type === 'turn/start')?.payload as { executionId?: string })?.executionId ?? input.executionId);
      return { executionId, status: result.status === 'completed' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'failed', ...(result.output === undefined ? {} : { output: result.output }), ...(result.error ? { error: result.error } : {}), events, trajectory: trajectoryStore.list(executionId) };
    } catch (error) { const executionId = String((events.find(event => event.type === 'turn/start')?.payload as { executionId?: string })?.executionId ?? input.executionId); return { executionId, status: signal.aborted ? 'cancelled' : 'failed', error: String(error), events, trajectory: trajectoryStore.list(executionId) }; }
  }
}
