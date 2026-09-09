# Architecture Boundaries and Acceptance

This release targets a small developer group running experiments on one machine in Docker. It does not add multi-tenancy, distributed leases, or another host-isolation system.

## Implemented improvements

| Priority | Implementation | Runnable evidence |
| --- | --- | --- |
| P0 runtime/lifecycle | Preflight before admission; one factory instance; failure cleanup; cleanup errors become failures; duplicate seats rejected | `runtime-preflight.test.ts` |
| P0 release evidence | Persisted Session resolver; request and terminal summaries; source events verified individually; evaluator summary; frozen input/environment/memory; revalidation at release | `experiment-release.test.ts` |
| P0 retry evaluation | Only explicitly linked retries may replace an attempt failure; root failures, retry loops, and unknown effects remain visible; reliability cost is recorded | `evaluation-retry.test.ts` |
| P1 integrated attribution | Data dependencies plus observed upstream/downstream I/O produce hypotheses; paired intervention changes one upstream configuration and checks downstream recovery and whole-Agent gates | `npm run template` |
| P1 one Agent runtime | Supreme, two Leaders, and two Members all execute a complete AgentVersion with independent Sessions, evidence checks, hierarchical acceptance, deduplication, and cold recovery | `team-hierarchy.test.ts`, `npm run team:acceptance` |
| P1 developer template | Fill a template, assemble, run, inspect traces, evaluate, and compare candidates without changing core runtime | `src/templates/text-agent.ts`, `npm run template` |

Every AgentTemplate provides a versioned EvaluationPackage (Evaluator, Dataset, and Gates). Assembly creates an `evaluationDigest`; experiments and releases verify package identity. `evaluation-package.test.ts` covers missing packages, frozen cases, and digest consistency.

Wiki coverage includes source Artifact validation, immutable old Releases, publication authority, CAS conflicts, cross-instance reads, scope isolation, link checks, Markdown/index/log projections, and pinned execution memory. See `wiki-memory.test.ts` and the team/template acceptance runs.

## Boundaries

- Topology freedom is configured by the definition author: directed execution, data/control edges, parallelism, branches, and bounded loops are supported. Unbounded cycles are rejected and an Agent cannot rewrite an in-flight version.
- Attribution is a hypothesis. Rules cover directly observable data transfer; paired experiments change one upstream node for identical input. The system does not claim universal causal proof or publish generated code automatically.
- Wiki compilation is a source → proposal → release interface. Model guesses do not become facts automatically. Callers and publishers remain responsible for page correctness. Low-level Runtime memory adapters are trusted host snapshots; templates and Teams build them from published Wiki releases.
- `harness/seal`, content-addressed Artifacts, and experiment summaries detect inconsistent evidence. A trusted local administrator who can rewrite all files is outside the experimental trust boundary; there is no signing service or key-management system.
- Completed executions deduplicate by request ID. Unknown external effects after a crash are not replayed blindly; rework receives a new key and preserves old evidence.
- New Teams register the complete Runtime. Legacy `AgentRegistry`, `TeamBoard`, and standalone Loop examples remain compatibility surfaces, not a second product entry point.
- Old logs without request/terminal evidence cannot satisfy new release gates. Preserve them and collect new evidence in a new experiment directory.
- Docker Sandbox accepts `none` or `full` network modes. Application acceptance needs no Docker socket. Providers and business tools are injected by developers; tests use deterministic providers and incur no paid API calls.

## Reference implementation

The DSH checkout is `5dda764ed3aa172535a7967b06ff95d9cbfe536a`. Relevant reference files are `packages/experimental/agent-team/src/{types,mailbox,lifecycle,task-board,journal}.ts`. This project adapts DSH independent Sessions, durable tasks, receipts, confirmation order, revision, and authority semantics to the AgentVersion contract. Cordis is a locked npm dependency. Wiki, integrated attribution, and governance topology are project extensions.

## Verification

```sh
npm run verify
docker build -t governed-agent-harness:local .
docker run --rm --network none governed-agent-harness:local
```

The application image uses `node:24.18.0-bookworm-slim` and runs as user `node`. Host regression covers Docker Sandbox networking, read-only root, resource limits, output, timeout, and cancellation.

## Current capability boundary (2026-09-09)

- Integrated optimization still relies mainly on plugin success statistics and specific upstream/downstream attribution rules. `governanceReport` does not automatically chain attribution into candidate experiments; proposal constructors receive caller-supplied hypotheses and standards.
- LLM evaluation provides versioned dimensions, evidence citations, confidence, disagreement, provisional/settled states, and paired comparison. It remains a soft signal and cannot override deterministic gates or prove causality; low confidence or high disagreement becomes `needs-review`.
- Dynamic evaluation supports optional JSONL persistence and reload. The feedback scheduler is caller-driven and its checkpoint is in memory, so unattended long-running recovery is not claimed.
- The supported entry point is the SDK, templates, and example scripts. Providers, tools, and business-quality criteria are supplied by each Agent author.

## Current verification record (2026-09-09)

The latest focused validation passed TypeScript checks and 102 non-Docker tests. Four Docker tests remain environment-blocked because the Docker daemon was unavailable. The seven examples passed; the `acceptance` example requires `.tmp` to exist first. Docker image build, real-model business quality, and long-running stability were not verified in this run. This record does not claim business quality or long-term reliability.

Historical 86-test and earlier real-model records are retained as historical evidence only.

