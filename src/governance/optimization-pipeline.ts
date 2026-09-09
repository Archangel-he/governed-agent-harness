import type { AgentTrace } from '../trace/events.js';
import type { ExperimentReport } from './experiment.js';

export interface OptimizationFinding { id: string; summary: string; evidenceEventIds: string[]; affectedPlugins: string[]; hypothesis: string; }
export interface OptimizationCandidate { id: string; findingId: string; versionId: string; }
export interface OptimizationDecision { status: 'accepted' | 'rejected' | 'needs-review'; reason: string; report?: ExperimentReport; }
export interface OptimizationPipelineInput { trace: AgentTrace; findings: (trace: AgentTrace) => Promise<OptimizationFinding[]> | OptimizationFinding[]; propose: (finding: OptimizationFinding) => Promise<OptimizationCandidate> | OptimizationCandidate; experiment: (candidate: OptimizationCandidate, finding: OptimizationFinding) => Promise<ExperimentReport>; decide: (report: ExperimentReport, finding: OptimizationFinding) => OptimizationDecision; }

/** Runs the evidence-to-candidate loop without changing the active version. */
export async function runOptimizationPipeline(input: OptimizationPipelineInput): Promise<{ findings: OptimizationFinding[]; candidates: OptimizationCandidate[]; decisions: OptimizationDecision[] }> {
  const findings = await input.findings(input.trace);
  const candidates: OptimizationCandidate[] = [];
  const decisions: OptimizationDecision[] = [];
  for (const finding of findings) {
    const candidate = await input.propose(finding);
    candidates.push(candidate);
    const report = await input.experiment(candidate, finding);
    decisions.push({ ...input.decide(report, finding), report });
  }
  return { findings, candidates, decisions };
}
