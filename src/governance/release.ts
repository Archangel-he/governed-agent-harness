import type { CandidateExperiment, ReleaseDecision } from '../contracts.js';
export interface ReleasePolicy { minScore: number; maxCost?: number; maxErrorRate?: number; sampleCount: number; minSamples: number; }
export function releaseGate(candidate: CandidateExperiment, score: number, thresholdOrPolicy: number | ReleasePolicy, cost = 0, errorRate = 0): ReleaseDecision {
  const policy: ReleasePolicy = typeof thresholdOrPolicy === 'number' ? { minScore: thresholdOrPolicy, sampleCount: 1, minSamples: 1 } : thresholdOrPolicy;
  candidate.agentScore = score;
  const ok = score >= policy.minScore && policy.sampleCount >= policy.minSamples && (policy.maxCost === undefined || cost <= policy.maxCost) && (policy.maxErrorRate === undefined || errorRate <= policy.maxErrorRate);
  candidate.status = ok ? 'accepted' : 'rejected';
  return { candidateId: candidate.id, decision: ok ? 'release' : 'reject', reason: `score=${score}; min=${policy.minScore}; samples=${policy.sampleCount}/${policy.minSamples}; cost=${cost}; errorRate=${errorRate}` };
}
