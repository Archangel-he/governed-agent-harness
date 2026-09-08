# Governed Agent Harness Experimental Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Build the single-machine experimental Agent Harness described by the approved specification: free declarative topology, validated execution, complete Agent Trace, aggregate evaluation, candidate replay/compare, and local release/rollback.

**Architecture:** Keep DSH-style AgentLoop, Session, Cordis and existing stores as runtime seams. Add a topology package that compiles a JSON-safe graph into an executor plan; plugins run only through the executor. Project Session and plugin events into an Agent Trace, evaluate the complete trace, then run local candidate experiments and version pointer changes.

**Tech Stack:** TypeScript ESM, Node built-ins, existing `tsx`/`node:test`, existing `cordis` dependency, JSONL/local filesystem.

**Spec:** `docs/superpowers/specs/2026-09-08-governed-agent-harness-experimental-design.md`

## Global Constraints

- Single-machine, single-process default; no multi-user, multi-tenant, distributed-worker or cloud scope.
- DSH/Cordis are the implementation references.
- JSON-safe persisted values only; large values use local content-addressed Artifact references.
- Plugins cannot call plugins directly or mutate topology.
- Published AgentVersions are immutable; active state is a local pointer.
- Unknown external outcomes are never silently retried.
- Every behavior starts with a failing test and ends with fresh verification.

---

### Task 1: Topology and Plugin Contracts

**Files:**
- Create: `src/topology/schema.ts`
- Create: `src/plugins/contract.ts`
- Modify: `src/contracts/index.ts`
- Test: `src/tests/topology.test.ts`

**Interfaces:**
- `TopologyDefinition`, `TopologyNode`, `TopologyEdge`, `NodeKind`, `EdgeKind`.
- `PluginManifest`, `PluginContext`, `PluginResult`, `ControlSignal`, `FailurePolicy`.
- JSON-safe schemas are plain `Record<string, unknown>` values validated by the local schema helper.

- [ ] Write tests that accept a serializable node/edge definition, reject duplicate IDs and reject undefined endpoints.
- [ ] Run `npx tsx --test src/tests/topology.test.ts`; confirm the new tests fail because the contracts/validator are absent.
- [ ] Add the minimum JSON-safe types and manifest/result contracts.
- [ ] Run the focused test and `npm run check`.
- [ ] Refactor only naming/import issues while tests remain green.

### Task 2: Topology Validation and Compilation

**Files:**
- Create: `src/topology/validate.ts`
- Create: `src/topology/compiler.ts`
- Test: `src/tests/topology-validation.test.ts`

**Interfaces:**
- `validateTopology(topology): ValidationReport`.
- `compileTopology(topology): ExecutionPlan`.
- `ExecutionPlan` contains indexed nodes, typed edges, entry nodes, terminal nodes, branch/join metadata, and loop bounds.

- [ ] Write failing tests for schema mismatch, duplicate edges, invalid cycle without Loop node, missing loop bound, and valid branch/join/finite-loop graphs.
- [ ] Run the focused test and confirm expected failures.
- [ ] Implement cycle detection, endpoint checks, edge-kind validation, and loop bound validation using Node/TypeScript standard code.
- [ ] Implement deterministic compilation with stable node ordering and frozen snapshots.
- [ ] Run focused tests and typecheck.

### Task 3: Local Artifact Store

**Files:**
- Create: `src/services/artifact-store.ts`
- Modify: `src/contracts/runtime.ts`
- Test: `src/tests/artifact-store.test.ts`

**Interfaces:**
- `ArtifactRef { hash, mediaType, bytes }`.
- `ArtifactStore.put(value, mediaType): ArtifactRef`.
- `ArtifactStore.get(ref): unknown`.

- [ ] Write failing tests for stable hash, detached read value, missing artifact, and path traversal rejection.
- [ ] Run focused tests to verify red.
- [ ] Implement local content-addressed files under one configured root with atomic write/rename.
- [ ] Run focused tests and `npm run check`.

### Task 4: Plugin Registry and Graph Executor

**Files:**
- Create: `src/plugins/registry.ts`
- Create: `src/topology/executor.ts`
- Test: `src/tests/topology-executor.test.ts`

**Interfaces:**
- `PluginRegistry.register(manifest, plugin)` and `resolve(id, version)`.
- `TopologyExecutor.run(plan, input, runtime): ExecutionResult`.
- Runtime provides ArtifactStore, event sink, and AbortSignal.

- [ ] Write failing tests for serial nodes, branch selection, join waiting, bounded loop, missing plugin, input/output schema rejection, and explicit failure policy.
- [ ] Run focused tests and confirm red.
- [ ] Implement queue-based deterministic scheduler; execute only ready nodes; use explicit join counters and loop counters.
- [ ] Emit start/terminal events for every node and preserve unknown outcomes on aborted side effects.
- [ ] Run focused tests and typecheck.

### Task 5: Agent Trace Aggregation

**Files:**
- Create: `src/trace/events.ts`
- Create: `src/trace/aggregator.ts`
- Modify: `src/runtime/trajectory-projector.ts`
- Test: `src/tests/agent-trace.test.ts`

**Interfaces:**
- `TraceEvent`, `PluginTrace`, `AgentTrace`.
- `AgentTraceAggregator.append(event)` and `.finish(executionId)`.
- Stable global sequence, operation sequence, parent operation, dependency IDs and input/output refs.

- [ ] Write failing tests for complete serial trace, parallel trace, missing terminal event, duplicate event, and AgentTrace reconstruction from events.
- [ ] Run focused tests to confirm red.
- [ ] Implement aggregation without treating missing terminal state as success.
- [ ] Project model/tool/plugin events into the same trace model while preserving source event IDs.
- [ ] Run focused tests and `npm run check`.

### Task 6: Multi-dimensional Agent Evaluation

**Files:**
- Create: `src/evaluation/profile.ts`
- Create: `src/evaluation/evaluator.ts`
- Modify: `src/governance/analyzer.ts`
- Test: `src/tests/evaluation.test.ts`

**Interfaces:**
- `EvaluationProfile`, `MetricDefinition`, `GateDefinition`, `AgentEvaluation`.
- `evaluateAgent(trace, profile, outcome): AgentEvaluation`.
- Hard gates cannot be overridden by aggregate score.

- [ ] Write failing tests for completion, quality, reliability, cost/latency, hard-gate rejection, and local plugin improvement with overall regression.
- [ ] Run focused tests and verify red.
- [ ] Implement deterministic aggregation from complete AgentTrace plus independent outcome facts.
- [ ] Keep local plugin statistics as diagnostics only; release result is Agent-level.
- [ ] Run focused tests and typecheck.

### Task 7: Candidate, Replay, Local Release and Rollback

**Files:**
- Create: `src/evaluation/candidate.ts`
- Create: `src/evaluation/experiment.ts`
- Create: `src/services/version-store.ts`
- Modify: `src/governance/replay.ts`
- Modify: `src/governance/release.ts`
- Test: `src/tests/candidate-release.test.ts`

**Interfaces:**
- `CandidateChange`, `CandidateExperiment`, `compareCandidates(...)`.
- `VersionStore.publish(version)`, `activate(id)`, `active()`, `rollback(id)`.
- Candidate must preserve baseline and rollback IDs and never mutate active version in place.

- [ ] Write failing tests for baseline/candidate comparison, hard-gate rejection, activation, rollback, and immutable version snapshots.
- [ ] Run focused tests to confirm red.
- [ ] Implement local JSON version pointer and atomic publication.
- [ ] Run focused tests and typecheck.

### Task 8: Decision and Tool Acceptance Agents

**Files:**
- Create: `src/examples/decision-agent/definition.ts`
- Create: `src/examples/tool-agent/definition.ts`
- Create: `src/examples/acceptance-run.ts`
- Test: `src/tests/acceptance-agents.test.ts`

**Interfaces:**
- Both definitions use the same topology/compiler/executor/trace/evaluation/release APIs.
- Decision graph: intent → constraints → candidate → risk → decision → validation.
- Tool graph: task → selection → arguments → permission → execution → result-validation.

- [ ] Write failing acceptance tests that assert both graphs compile, run, produce complete AgentTrace, and return multi-dimensional evaluation.
- [ ] Run focused tests and confirm red.
- [ ] Implement deterministic fixture plugins and outcomes, with no real network dependency.
- [ ] Run acceptance tests and `npm run check`.

### Task 9: Recovery, Documentation and Full Verification

**Files:**
- Modify: `src/runtime/recovery.ts`
- Modify: `src/services/file-store.ts`
- Modify: `docs/ARCHITECTURE_GAPS.md`
- Modify: `README.md`
- Modify: `package.json`
- Test: `src/tests/recovery-topology.test.ts`

**Interfaces:**
- Interrupted topology executions close active node operations and preserve unknown external effects.
- `npm run acceptance` runs both acceptance agents and produces local JSON reports.

- [ ] Write failing recovery tests for interruption before node completion, writer lock recovery, and replay refusal for unknown side effects.
- [ ] Run focused tests and confirm red.
- [ ] Implement recovery using existing Session ownership and JSONL writer behavior; do not add distributed infrastructure.
- [ ] Update README and gaps only with evidence-backed status.
- [ ] Run `npm run verify` plus `npm run acceptance`; inspect exit codes and all test counts.

## Completion Gate

Do not claim completion until `npm run verify` and `npm run acceptance` pass freshly, both acceptance traces contain every expected node, hard-gate and rollback tests pass, and `ARCHITECTURE_GAPS.md` accurately lists only unimplemented external/platform work.

