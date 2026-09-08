import type { SessionEvent, TrajectoryStore } from '../contracts/runtime.js';
import type { AgentVersion } from '../contracts/domain.js';
import type { TraceEvent, TraceStatus } from './events.js';
import { jsonSnapshot } from '../services/log-value.js';

/** Lossless projection: retain every Session payload; facts do not close operations. */
export function projectSessionEvents(events: SessionEvent[]): TraceEvent[] {
  return events.map(event => {
    if (event.type === 'harness/trace') return jsonSnapshot(event.payload as TraceEvent);
    const p = event.payload as Record<string, unknown>;
    if (!p || typeof p.executionId !== 'string') throw new Error('Session event missing executionId: ' + event.id);
    let operationId = String(p.operationId ?? p.stepId ?? p.executionId);
    let parentOperationId: string | undefined;
    let phase: TraceEvent['phase'] = 'fact';
    let status: TraceStatus = 'started';
    if (event.type.startsWith('turn/')) operationId=p.executionId;
    if (event.type === 'user/message') operationId=p.executionId;
    if (event.type.startsWith('step/')) { operationId=String(p.stepId); parentOperationId=p.executionId; }
    if (event.type==='model/request') parentOperationId=String(p.stepId ?? p.executionId);
    if (event.type==='tool/call') parentOperationId=String(p.parentOperationId ?? p.stepId ?? p.executionId);
    if (['turn/start','step/start','model/request','tool/call'].includes(event.type)) phase='start';
    if (['turn/end','step/end','assistant/message','model/error','tool/result'].includes(event.type)) {
      phase='end';
      status=event.type==='model/error' || p.status==='failed' ? 'failed'
        : p.status==='interrupted' || p.status==='unknown' || p.status==='unknown_outcome' ? 'unknown'
        : p.status==='cancelled' ? 'cancelled' : 'succeeded';
    }
    const metadata: Partial<TraceEvent> = {};
    for (const key of ['agentId','agentVersionId','nodeId','seatId','pluginId','pluginVersion','inputRef','outputRef'] as const) {
      if (typeof p[key]==='string') metadata[key]=p[key];
    }
    if (parentOperationId) metadata.parentOperationId=parentOperationId;
    const timestamp=typeof p.ts==='string'?Date.parse(p.ts):undefined;
    if (timestamp!==undefined && Number.isFinite(timestamp)) metadata.timestamp=timestamp;
    return jsonSnapshot({id:event.id,sourceEventId:event.id,executionId:p.executionId,operationId,type:event.type,phase,status,...metadata,payload:event.payload});
  });
}

/** Projects model-visible execution facts into the governance trajectory. */
export class SessionTrajectoryProjector {
  constructor(private readonly store: TrajectoryStore, private readonly agentId: string, private readonly version: AgentVersion) {}
  append(event: SessionEvent): void {
    const projected=projectSessionEvents([event])[0];
    this.store.append({...projected,agentId:this.agentId,agentVersionId:this.version.id});
  }
}
