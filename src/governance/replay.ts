import type { CandidateExperiment } from '../contracts/domain.js';

export interface ReplayCase<TInput, TOutput> { id: string; input: TInput; expected?: TOutput; }
export interface ReplayResult { versionId: string; score: number; passed: number; total: number; }

export async function replay<TInput, TOutput>(
  versionId: string,
  cases: ReplayCase<TInput, TOutput>[],
  run: (input: TInput) => Promise<TOutput>,
  equal: (actual: TOutput, expected: TOutput | undefined) => boolean,
): Promise<ReplayResult> {
  let passed = 0;
  for (const item of cases) if (item.expected !== undefined && equal(await run(item.input), item.expected)) passed++;
  return { versionId, passed, total: cases.length, score: cases.length === 0 ? 0 : passed / cases.length };
}

export async function compare<TInput, TOutput>(
  candidate: CandidateExperiment,
  cases: ReplayCase<TInput, TOutput>[],
  runBaseline: (input: TInput) => Promise<TOutput>,
  runCandidate: (input: TInput) => Promise<TOutput>,
  equal: (actual: TOutput, expected: TOutput | undefined) => boolean,
): Promise<{ baseline: ReplayResult; candidate: ReplayResult; improved: boolean }> {
  const baseline = await replay(candidate.baselineVersionId, cases, runBaseline, equal);
  const result = await replay(candidate.candidateVersionId, cases, runCandidate, equal);
  return { baseline, candidate: result, improved: result.score > baseline.score };
}
