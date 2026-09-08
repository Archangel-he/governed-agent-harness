import type { SessionEvent, TrajectoryStore } from '../contracts/runtime.js';
import type { AgentVersion } from '../contracts/domain.js';

/** Projects model-visible execution facts into the governance trajectory. */
export class SessionTrajectoryProjector {
  constructor(private readonly store: TrajectoryStore, private readonly agentId: string, private readonly version: AgentVersion) {}
  append(event: SessionEvent): void {
    const p = event.payload as Record<string, unknown>;
    const type = event.type;
    if (!['model/request', 'model/error', 'assistant/message', 'tool/call', 'tool/result'].includes(type)) return;
    const status = type.endsWith('/error') || p.status === 'failed' ? 'failed' : type === 'assistant/message' || (type === 'tool/result' && p.status === 'completed') ? 'succeeded' : 'started';
    this.store.append({ id: event.id, executionId: String(p.executionId), agentId: this.agentId, agentVersionId: this.version.id, operationId: String(p.operationId ?? event.id), type, status, ...(typeof p.parentOperationId === 'string' ? { parentOperationId: p.parentOperationId } : {}), ...(typeof p.seatId === 'string' ? { seatId: p.seatId } : {}), ...(typeof p.pluginId === 'string' ? { pluginId: p.pluginId } : {}), ...(typeof p.pluginVersion === 'string' ? { pluginVersion: p.pluginVersion } : {}) });
  }
}
