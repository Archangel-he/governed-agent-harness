# Close Audit Gaps: Implementation Plan

This plan was authorized to complete the approved P0/P1 improvements for the single-machine experimental product. It does not add multi-tenancy or a distributed platform.

## Acceptance areas

1. Topology: edge inputs, branch/join, bounded loops, plugin/version/schema validation, cancellation, and failure policy.
2. Infrastructure: Artifact/Version/Registry validation, immutable publication, locks, recovery, and the existing real isolation runner.
3. Loop and recovery: DSH-style streaming/retry semantics, Kernel cancellation, independent Session cold recovery, message deduplication, Lead authority, and removal of demo-only duplicate publication.
4. Unified runtime: one AgentVersion through Cordis bindings, topology, Kernel, complete Session/Trace/Artifact persistence.
5. Integrated governance: trace reconstruction, independent quality/cost/latency/reliability metrics, hard gates, replay/compare on identical cases, evidence-bound release/rollback.
6. Acceptance: real six-node Decision/Tool Agents through the same runtime and governance path, including failures, interruption recovery, and refusal to replay unknown side effects.

## Status

- [x] Topology semantics and review
- [x] Persistence/isolation and review
- [x] Loop, Kernel, Registry, and review
- [x] Unified runtime and Trace
- [x] Evaluation, candidate, release, and rollback
- [x] Six-step Agents, recovery, and full verification

The repository remains scoped to one local checkout and deterministic offline verification. External model behavior is not certified by these tests.
