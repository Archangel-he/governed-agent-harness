import type { TrajectoryEvent } from '../contracts.js';
export interface PluginStats { seatId: string; pluginId: string; calls: number; successes: number; failures: number; successRate: number; }
export interface TrajectoryFinding { seatId: string; pluginId: string; statement: string; severity: 'info' | 'warning'; }
export function analyzeTrajectory(events: TrajectoryEvent[]): { stats: PluginStats[]; findings: TrajectoryFinding[] } {
  const groups = new Map<string, TrajectoryEvent[]>();
  for (const event of events) { const key = `${event.seatId ?? 'unknown'}:${event.pluginId ?? 'unknown'}`; const list = groups.get(key) ?? []; list.push(event); groups.set(key, list); }
  const stats = [...groups].map(([key, rows]) => { const [seatId, pluginId] = key.split(':'); const successes = rows.filter(row => row.status === 'succeeded').length; const failures = rows.filter(row => row.status === 'failed').length; const settled = successes + failures; return { seatId, pluginId, calls: rows.length, successes, failures, successRate: settled ? successes / settled : 1 }; });
  const findings = stats.filter(row => row.successRate < 0.8).map(row => ({ seatId: row.seatId, pluginId: row.pluginId, statement: `${row.pluginId} success rate is ${(row.successRate * 100).toFixed(1)}%`, severity: 'warning' as const }));
  return { stats, findings };
}
