import type { AgentVersion, TrajectoryEvent } from './domain.js';
import type { ModelProvider, ToolProvider } from './loop.js';

export interface KernelInput { executionId: string; agentId: string; version: AgentVersion; userContent: unknown; systemPrompt: string; }
export interface KernelDependencies { model: ModelProvider; tools: Record<string, ToolProvider>; emit?(event: KernelEvent): void | Promise<void>; }
export interface KernelEvent { sequence: number; executionId: string; type: string; payload: unknown; }
export interface KernelResult { executionId: string; status: 'completed' | 'failed' | 'cancelled'; output?: unknown; error?: string; events: KernelEvent[]; trajectory: TrajectoryEvent[]; }
export interface AgentKernel { run(input: KernelInput, deps: KernelDependencies, signal?: AbortSignal): Promise<KernelResult>; }
