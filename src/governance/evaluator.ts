import type { CandidateExperiment, GovernanceCluster, TrajectoryEvent } from '../contracts.js';
export interface ClusterEvaluation { clusterId: string; score: number; observations: string[]; }
export function evaluateCluster(cluster: GovernanceCluster, events: TrajectoryEvent[]): ClusterEvaluation {
  const relevant = events.filter(e => e.seatId !== undefined && cluster.seatIds.includes(e.seatId));
  return { clusterId: cluster.id, score: relevant.length === 0 ? 0 : relevant.filter(e => e.status === 'succeeded').length / relevant.length, observations: [`events=${relevant.length}`] };
}
export function makeCandidate(id: string, baselineVersionId: string, candidateVersionId: string, hypothesisId: string): CandidateExperiment {
  return { id, baselineVersionId, candidateVersionId, hypothesisId, status: 'proposed' };
}
