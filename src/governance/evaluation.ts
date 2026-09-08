import { createHash } from 'node:crypto';
import type { AgentTrace } from '../trace/events.js';
import { AgentTraceAggregator } from '../trace/aggregator.js';
import { jsonSnapshot } from '../services/log-value.js';

export interface EvaluationProfile {
  id: string;
  version: string;
  minQuality: number;
  minReliability: number;
  maxCost: number;
  maxLatencyMs: number;
  maxRetries: number;
  maxHumanInterventions: number;
}
export interface TaskOutcome {
  completed: boolean;
  quality: number;
  safe: boolean;
  cost: number;
  humanInterventions: number;
}
export interface Evaluation {
  executionId: string;
  traceDigest: string;
  profileDigest: string;
  evidenceEventIds: string[];
  metrics: { completion: number; quality: number; safety: number; reliability: number; cost: number; latencyMs: number; retries: number; humanInterventions: number };
  score: number;
  passed: boolean;
  failedGates: string[];
}
export const defaultProfile: EvaluationProfile = {
  id:'local-agent',version:'1',minQuality:.8,minReliability:1,
  maxCost:10,maxLatencyMs:60_000,maxRetries:3,maxHumanInterventions:0
};

export function evidenceDigest(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input && typeof input==='object' ? Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : input;
  return createHash('sha256').update(JSON.stringify(canonical(jsonSnapshot(value)))).digest('hex');
}

export function evaluateTrace(trace: AgentTrace, profile: EvaluationProfile, outcome: TaskOutcome): Evaluation {
  jsonSnapshot(profile); jsonSnapshot(outcome);
  for (const n of [profile.minQuality,profile.minReliability,outcome.quality]) {
    if (!Number.isFinite(n) || n<0 || n>1) throw new Error('Quality/reliability must be in [0,1]');
  }
  for (const n of [profile.maxCost,profile.maxLatencyMs,profile.maxRetries,profile.maxHumanInterventions,outcome.cost,outcome.humanInterventions]) {
    if (!Number.isFinite(n) || n<0) throw new Error('Invalid nonnegative evaluation metric');
  }
  if (typeof outcome.completed!=='boolean'||typeof outcome.safe!=='boolean') throw new Error('Outcome completion/safety required');
  // Rebuild from evidence; never trust caller-supplied complete flag or operation summary.
  const aggregator=new AgentTraceAggregator();
  for (const event of trace.events) aggregator.append(event);
  const rebuilt=aggregator.finish(trace.executionId);
  const operations=[...rebuilt.operations.values()];
  const nodes=operations.filter(op=>op.nodeId!==undefined);
  const measured=nodes.length?nodes:operations;
  const attempted=measured.filter(op=>op.status!=='skipped');
  const reliability=attempted.length?attempted.filter(op=>op.status==='succeeded').length/attempted.length:0;
  const times=rebuilt.events.map(e=>e.timestamp).filter((n):n is number=>typeof n==='number');
  const retries=rebuilt.events.filter(e=>e.type==='model/retry'||e.type==='node/retry').length;
  const latencyMs=times.length?Math.max(...times)-Math.min(...times):0;
  const metrics={completion:Number(outcome.completed),quality:outcome.quality,safety:Number(outcome.safe),reliability,cost:outcome.cost,latencyMs,retries,humanInterventions:outcome.humanInterventions};
  const gates:Record<string,boolean>={
    trace:rebuilt.complete, completion:outcome.completed,
    terminal:operations.every(op=>['succeeded','skipped'].includes(op.status)),
    quality:outcome.quality>=profile.minQuality,safety:outcome.safe,
    reliability:reliability>=profile.minReliability,cost:outcome.cost<=profile.maxCost,
    latency:latencyMs<=profile.maxLatencyMs,retries:retries<=profile.maxRetries,
    humanInterventions:outcome.humanInterventions<=profile.maxHumanInterventions
  };
  const failedGates=Object.keys(gates).filter(key=>!gates[key]);
  return {executionId:trace.executionId,traceDigest:evidenceDigest(rebuilt.events),profileDigest:evidenceDigest(profile),evidenceEventIds:rebuilt.events.map(e=>e.id),metrics,score:.8*outcome.quality+.2*reliability,passed:failedGates.length===0,failedGates};
}
