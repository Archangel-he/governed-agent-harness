# Governed Agent Harness Experimental Design

## Status

Approved design for the single-machine experimental implementation. This is an implementation spec, not a claim that the current repository already satisfies it.

## Goal

Build a local, high-completeness Agent Harness where developers define a free execution topology, bind versioned capability plugins, execute through Cordis/DSH-compatible runtime seams, reconstruct the complete Agent Trace, evaluate the whole Agent, and compare candidate plugin or topology changes before switching a local active version.

## Scope

In scope: one machine, one process as the default, a few developers, local JSONL persistence, local content-addressed artifacts, real in-process plugin execution, interruption recovery, two acceptance agents, and local replay/compare/release.

Out of scope for this phase: multi-user, multi-tenant, distributed workers, cloud scheduling, SaaS identity, enterprise secret management, and every platform sandbox backend. Missing OS isolation must fail closed and be recorded as a gap.

## Architecture

```text
Declarative Agent Definition
  -> Topology Compiler and Validator
  -> Frozen AgentVersion
  -> Cordis Host / Agent Kernel
  -> Plugin Nodes, Branch, Join, bounded Loop
  -> Session Events + Plugin Events + Artifacts
  -> Agent Trace Aggregator
  -> Multi-dimensional Agent Evaluation
  -> Candidate Experiment / Replay / Compare
  -> Local Active-Version Pointer and Rollback
```

The existing DSH-style AgentLoop remains the model/tool/session execution seam. The topology engine schedules capability plugins through a narrow Plugin Context; plugins do not call each other directly or mutate topology.

## Topology contract

A topology is JSON-serializable and has nodes, edges, version, and policies. Nodes use one envelope with a `kind` discriminator: `capability`, `control`, `kernel`, `tool`, `validation`, or `governance`. Edges declare `data`, `control`, `dependency`, or `observation` semantics.

Every capability node declares a stable id, seat id, capability surface, plugin id/version, input schema, output schema, side-effect class, and failure policy. The compiler rejects duplicate ids, missing endpoints, schema-incompatible data edges, undeclared capabilities, unsafe cycles, missing loop bounds, and paths that bypass required policy nodes.

The runtime supports serial edges, explicit branch nodes, explicit join nodes, and bounded loop nodes. The execution engine is the only scheduler. A plugin returns output, artifact references, events, and a structured control signal; it cannot create nodes or edges at runtime.

## Plugin contract

```ts
interface CapabilityPlugin {
  readonly manifest: PluginManifest
  invoke(context: PluginContext, input: unknown, signal: AbortSignal): Promise<PluginResult>
}
```

`PluginContext` contains the frozen AgentVersion, Execution identity, Seat identity, declared capabilities, local artifact port, event sink, and a read-only view of permitted inputs. Cross-execution state requires an explicit state port. Secrets never enter events, topology, or artifacts.

Input and output schemas are checked at the node boundary. Large values are written to the local ArtifactStore and passed by hash/reference. Side effects are explicit. Only declared idempotent operations may be retried automatically; uncertain external outcomes become `unknown_outcome`.

## Trace contract

The append-only Session Event Log remains the recovery and model-visible fact source. Plugin events are projected into four levels:

1. Plugin Event: one fact.
2. Plugin Trace: one operation for one plugin.
3. Agent Trace: all participating plugin operations for one Execution, with order and causal/data dependencies.
4. Evaluation Dataset: multiple complete Agent Traces plus independent task outcomes.

Every event includes AgentVersion, Execution, node/seat/plugin, operation, parent/dependency references, global sequence, operation sequence, status, timing, and input/output references when applicable. Missing terminal events are represented as interrupted or unknown; they are never inferred as success.

The system does not persist private model chain-of-thought. It records observable messages, structured decisions, tool calls, artifacts, receipts, and evidence references.

## Evaluation and candidate contract

An EvaluationProfile declares versioned metrics and hard gates. The evaluator consumes complete Agent Traces and independent expected outcomes. It produces multidimensional results for completion, quality, safety, reliability, cost, latency, retries, and human intervention. A single score may summarize but never override a failed hard gate.

An optimization candidate may change plugin version/configuration, node split/merge, edge order, branch/loop policy, or governance grouping. Candidates record changed objects, hypothesis, evidence references, expected metrics, experiment population, and rollback version. Candidate generation never changes the active version.

Replay uses frozen input/assets/provider fixtures where possible and distinguishes replayed side effects from real execution. A candidate becomes active only after static validation, replay/compare, whole-Agent evaluation, and local release approval. Active versions are immutable pointers; rollback only changes the pointer and does not undo external side effects.

## Persistence and recovery

The first implementation uses local JSONL for Session, Trajectory, Team and release metadata, plus a content-addressed local ArtifactStore. Appends are validated and durable before acknowledgement. A per-session writer lock records process identity and safely handles stale local locks. An interrupted execution is closed with explicit step/turn and operation outcomes; unknown external effects are not blindly replayed.

## Acceptance agents

Decision Agent topology:

```text
intent -> constraints -> candidate-generation -> risk -> decision -> validation
```

Tool Agent topology:

```text
task -> tool-selection -> argument-construction -> permission -> execution -> result-validation
```

Both use the same runtime, persistence, trace aggregation, evaluation, candidate, replay, and release components. Only topology and plugin bindings differ.

## Error rules

- Invalid topology/schema/edge/capability: fail before execution.
- Plugin failure: emit structured failure and follow declared edge policy.
- Unknown side effect: stop or escalate; never silently retry.
- Join timeout or missing branch: structured failure.
- Loop bound exceeded: structured failure.
- Trace persistence failure: terminate the run; do not claim completion.
- Missing OS Sandbox runner: fail closed and record a gap.

## Verification

Each new behavior follows red-green-refactor. The phase gate is:

```text
npm run check
npm test
npm run minimal
npm run verify
```

Additional acceptance tests must prove topology rejection, branch/join/loop behavior, schema rejection, artifact references, trace reconstruction, aggregate evaluation, candidate comparison, release/rollback, and interrupted-run recovery.
