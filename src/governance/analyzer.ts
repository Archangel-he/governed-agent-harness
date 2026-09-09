import { operationOutcomes } from './agent-evaluator.js';
import type { TrajectoryEvent } from '../contracts/domain.js';
export interface PluginStats { seatId: string; pluginId: string; calls: number; successes: number; failures: number; successRate: number; }
export interface TrajectoryFinding { seatId: string; pluginId: string; statement: string; severity: 'info' | 'warning'; }
export function analyzeTrajectory(events: TrajectoryEvent[]): { stats: PluginStats[]; findings: TrajectoryFinding[] } {
  const groups = new Map<string, TrajectoryEvent[]>();
  for (const event of operationOutcomes(events)) { const key = JSON.stringify([event.seatId ?? 'unknown',event.pluginId ?? 'unknown']); const list = groups.get(key) ?? []; list.push(event); groups.set(key, list); }
  const stats = [...groups].map(([key, rows]) => { const [seatId, pluginId] = JSON.parse(key); const successes = rows.filter(row => row.status === 'succeeded').length; const failures = rows.filter(row => row.status === 'failed').length; const settled = successes + failures; return { seatId, pluginId, calls: rows.length, successes, failures, successRate: rows.length ? successes / rows.length : 0 }; });
  const findings = stats.filter(row => row.successRate < 0.8).map(row => ({ seatId: row.seatId, pluginId: row.pluginId, statement: `${row.pluginId} success rate is ${(row.successRate * 100).toFixed(1)}%`, severity: 'warning' as const }));
  return { stats, findings };
}
/** Capability-only governance view; infrastructure identities are excluded by the caller's frozen binding set. */
export function analyzeCapabilityTrajectory(events: TrajectoryEvent[],capabilityPluginIds:ReadonlySet<string>):ReturnType<typeof analyzeTrajectory>{return analyzeTrajectory(events.filter(event=>capabilityPluginIds.has(event.pluginId??'')))}
