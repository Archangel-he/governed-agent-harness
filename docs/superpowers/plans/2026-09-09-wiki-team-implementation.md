# Unified Wiki and Team Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development; TDD, source review, and whole-branch verification.

Goal: implement all approved P0/P1 improvements plus scoped Wiki memory and hierarchical Teams in one validated product extension.
Architecture: preserve GovernedAgentRuntime as the only complete Agent executor. Wiki is a versioned service; roles are plugin composition plus validated Team authority.
Tech Stack: TypeScript, Cordis, Node fs/crypto, current Docker runner.
Spec: ../specs/2026-09-09-wiki-team-design.md
Constraints: same repository; no new OS runners; preserve user data; deterministic offline tests; no vector DB, multi-tenancy or unbounded Agent spawning.

## Task 1 Runtime P0
Files: runtime/governed-runtime.ts, topology/executor.ts; tests/runtime-preflight.test.ts.
- [x] Red: missing plugin writes no orphan start; factory called once, exact instance activated/disposed; same seat ambiguity rejected; retries have attempt/dependency evidence.
- [x] Green: resolve into immutable prepared binding objects before request admission; clean created resources on failure; ensure one terminal per admitted run.
- [x] Verify: node --import tsx --test src/tests/runtime-preflight.test.ts src/tests/governed-runtime.test.ts src/tests/topology-advanced.test.ts.

## Task 2 Wiki
Files: memory/wiki.ts and memory contracts in same file; tests/wiki-memory.test.ts.
- [x] Red: immutable sources/revisions, scoped access, nonempty valid sources, CAS conflict, repeated proposal dedupe, pinned old-release reads, link/conflict validation.
- [x] Green: local WikiStore using existing atomicJson/acquireFileLock/ArtifactStore; stable published release and index; propose then authorize publication by scope owner.
- [x] Verify: node --import tsx --test src/tests/wiki-memory.test.ts.

## Task 3 Evidence, retries and attribution
Files: governance/experiment.ts, evaluation.ts, attribution.ts; tests/experiment-release.test.ts, tests/evaluation-retry.test.ts.
- [x] Red: fabricated/wrong-version/wrong-execution evidence rejected; evaluator and environment pinned; recovered retry may pass policy while unknown never passes; downstream failures generate trace-backed upstream hypotheses.
- [x] Green: persisted source resolver, immutable evaluator identity, trace-linked input and runtime metadata; strict release revalidation; attempts/final operations separated.
- [x] Verify focused governance tests; update acceptance callers to provide real persisted evidence.

## Task 4 Integrate Memory and Hierarchical Teams
Files: runtime/governed-runtime.ts, team/hierarchy.ts, examples/team-acceptance.ts; tests/team-hierarchy.test.ts.
- [x] Red: Supreme-only human ingress; direct-parent authority; same AgentVersion executor for all roles; duplicate delivery/reopen does not repeat side effects; report before acceptance; rejected work cannot produce accepted parent; memory read receipts in trace.
- [x] Green: durable Team state transaction + dispatch using stable Agent request IDs; coordinator plugin delegates/reviews through Team service; memories pinned in execution. Preserve legacy Registry API but provide full-Agent registration route.
- [x] Verify: two leaders, independent member sessions, fork/join, cancel, cold recovery between completion and ack; no repeated provider call.

## Task 5 Developer Template and Docker Acceptance
Files: templates/text-agent.ts, examples/template-acceptance.ts, examples/team-acceptance.ts, package.json, Dockerfile, docs.
- [x] New Agent module provides version/plugins/evaluator; importing it is sufficient to run, inspect evidence and compare candidates, no core changes.
- [x] End-to-end Wiki proposal/release/read, Supreme delegation -> Team reports -> final acceptance, paired candidate replay with frozen memory.
- [x] Run npm run verify plus Docker application acceptance. Source review and fix unresolved findings before goal completion.

## Execution ledger
- Baseline cfbfd7f; current feature branch feat/wiki-team-governance. Working in the user's established checkout.
- DSH fetched and reference updated to 5dda764ed3aa172535a7967b06ff95d9cbfe536a.
- Independent workers own only assigned files; root owns Team composition/integration/docs. No completion claim based solely on the previous 60 tests.

## Final verification (2026-09-09)
- `npm run verify`: exit 0, 86 tests passed, 0 failed, 0 skipped; all six-step/template/team and compatibility examples passed.
- `docker build --pull=false -t governed-agent-harness:local .`: exit 0; Node 24.18.0 fixed base, non-root runtime.
- `docker run --rm --network none --read-only --tmpfs /app/.tmp:uid=1000,gid=1000 --tmpfs /tmp governed-agent-harness:local`: exit 0; three acceptance suites passed.
- Logs: `.tmp/verify-wiki-team.log`, `.tmp/docker-wiki-team.log` (local artifacts, not tracked).
- Source review: fixed completion sealing and independent child report evidence revalidation. Clarified trusted-host memory adapters and full-content experiment binding. Re-review found no remaining important issue within approved single-host scope.
- Implementation keeps coordinator capabilities in the runnable Team example rather than adding a second coordinator abstraction. Rework is a new parent-owned assignment key; unknown side effects remain interrupted.
