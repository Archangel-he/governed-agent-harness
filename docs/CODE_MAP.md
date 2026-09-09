# Code Map

## Complete product path

`templates/*.ts` → `agent.ts / assembleAgent` → `runtime/governed-runtime.ts` → Cordis seat Fiber → `topology/executor.ts` → `CapabilityPlugin`. AgentTemplates are stateless by default; `memoryMode: 'persistent'` enables Episodic Memory.

Kernel nodes use the same runtime and enter `runtime/kernel/stateless.ts` → `runtime/agent-loop.ts`. Model requests, tool calls, node I/O, and Wiki reads enter the persistent Session and Trace. Preflight runs before `request/start`; each lifecycle instance is created once and disposed once.

Team path: `team/hierarchy.ts` persists role definitions and tasks → the same `GovernedAgentRuntime.run(AgentVersion)`. Coordination is an ordinary plugin; the hierarchy checks direct-parent authority, source execution evidence, and staged acceptance. The legacy `AgentRegistry` Loop interface remains compatible; new Teams still use topology execution.

## Files and responsibilities

| File/directory | Responsibility |
| --- | --- |
| `agent.ts` | Template assembly, pinned memory, versioned evaluation package, execution, evaluation, candidate comparison |
| `templates/text-agent.ts` | Copyable Agent definition; create a new file to branch an Agent |
| `contracts` | AgentVersion, model/tool, Kernel, and service contracts |
| `plugins` | Capability/lifecycle contracts and seat binding validation |
| `topology` | Static compilation, edge input, fork/join, conditional branches, bounded loops, retry |
| `runtime/governed-runtime.ts` | Single complete Agent entry point, preflight, Cordis lifecycle, request deduplication, closure |
| `runtime/evidence-source.ts` | Reconstructs source evidence from a chosen Agent Session and verifies terminal summaries |
| `runtime/agent-loop.ts` | Streaming model, tool pipeline, retry waterfall, cancellation, Session reconstruction |
| `trace` | Strict operation state machine and unified Session projection |
| `governance/evaluation.ts` | Whole-Agent gates; attempt failure, final failure, and unknown side effects are separate |
| `governance/evaluation-package.ts` | Versioned Evaluator, Dataset, Gates contract and digest |
| `governance/attribution.ts` | Builds hypotheses from dependencies and observed I/O; validates single-node interventions |
| `governance/experiment.ts` | Evidence checks, paired experiments, evaluator locking, pre-release revalidation, CAS |
| `memory/wiki.ts` | Immutable sources, proposals, CAS release, pages, index, link checks |
| `memory/episodic.ts` | Persistent episodes, observations, progressive retrieval |
| `memory/trajectory-proposals.ts` | Trajectory candidates, model extraction, conflict merging, automatic Wiki maintenance |
| `memory/maintenance.ts` | Wiki health checks and budgeted retrieval |
| `governance/dynamic-evaluation.ts` | Decisions, delayed feedback, frozen snapshots, optional JSONL persistence/reload |
| `governance/feedback-scheduler.ts` | Caller-driven feedback polling; checkpoint remains in memory |
| `governance/analyzer.ts`, `governance/report.ts` | Capability success statistics and reports; attribution and candidate experiments are not auto-chained |
| `governance/llm-evaluation.ts` | Versioned rubric, evidence-bound structured LLM evaluation, confidence/disagreement, paired comparison |
| `governance/plugin-proposal.ts` | Builds candidate proposals from caller-supplied hypothesis, evidence, and criteria |
| `team/hierarchy.ts` | Supreme/Leader/Member, queues, reports, receipts, acceptance, cold recovery, scoped memory |
| `services` | Session, Artifact, Version, Registry, workspace, local atomic files/locks |
| `sandbox/adapter.ts` | Docker-isolated execution |
| `examples/*acceptance.ts` | Six-step Agents, template governance loop, hierarchical Team acceptance |

## Evidence chain

`harness/request` freezes version/input/environment/memory → `harness/trace` records operation facts → `harness/seal` stores terminal trace digest → `RuntimeEvidenceSourceResolver` reads and verifies → Experiment freezes source and each trial → release re-resolves sources, recomputes evaluator/gates → immutable release evidence → active pointer CAS.

`wiki.json` is the authoritative atomic index. `releases/<id>/pages/*.md`, `index.md`, and `log.md` are readable projections. Executions pin the release and complete page-content digest; baseline and candidate cannot drift in memory. Episodic Memory lives in `memory/episodes.jsonl` and records experience without replacing Wiki knowledge.

## Retained low-level examples

`demo`, `skeleton`, `integration`, and `minimal` expose lower-level interfaces and remain compatible. `runtime/memory-runtime.ts` and `governance/release.ts` are early in-memory/demo scoring helpers; they do not change governed `LocalVersionStore` release records. Product candidate publication uses `promoteCandidate`. Kernel is a model-loop adapter, not a second Agent product.

Read new code from the templates and unified entry point first; do not mistake a low-level compatibility example for another complete runtime path.
