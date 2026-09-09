# Governed Agent Harness

A single-machine Docker experimental foundation for a small group of developers. Developers define capability plugins, execution topology, and evaluators; the framework provides Cordis assembly, execution records, Wiki memory, whole-Agent evaluation, and candidate release. Plugins are either `capability` plugins that carry Agent behavior or `infrastructure` plugins that provide runtime foundations. Trajectory optimization targets capability plugins by default.

Core path: **human-defined capability topology → Cordis plugin seats → complete execution trace → integrated attribution hypothesis → controlled experiment → release or rollback**. Supreme, Team Leader, and Member all use the same complete Agent runtime.

## Run directly

```sh
npm ci
npm run template
npm run team:acceptance
npm run verify
```

- `template`: demonstrates a downstream validation failure caused by upstream output; creates an evidence-linked hypothesis, changes only upstream configuration, runs a paired experiment, publishes, and rolls back. Results and source evidence are written to `.tmp/template-*`.
- `team:acceptance`: runs one Supreme, two Leaders, and two Members with independent Sessions, scoped Wiki reads, hierarchical acceptance, and idempotent recovery.
- `acceptance`: runs six-step Decision and Tool Agents through the real Kernel, tool, and trace pipeline.
- `verify`: runs type checking, tests, and all examples. Tests use deterministic Providers; real Docker Sandbox tests require a Docker daemon and the `node:22-alpine` image.

```sh
docker build -t governed-agent-harness:local .
docker run --rm --network none governed-agent-harness:local
```

The application image pins Node and runs as a non-root user. Example data is written under `/app/.tmp`; mount that directory when it must be retained. Application acceptance does not mount the Docker socket and does not call paid models automatically.

## Real-model and delayed-feedback experiment

Set `SILICONFLOW_API_KEY` and run `npm run experiment:model-feedback`.
Use `SILICONFLOW_MODEL` to select a model; the default is `deepseek-ai/DeepSeek-V3.1`.
The command performs one real API call (45-second timeout, no automatic retry), uses a complete AgentTemplate and persistent Session, records a decision, backfills feedback explicitly marked `simulated-acceptance`, and calls `agent.evaluate(result, input, feedback)`.
The report and frozen snapshot are written to `report.json`; the raw trace is `runtime/session.jsonl` in the same output directory.
This is a pipeline experiment: feedback is simulated rather than real business feedback, costs are not modeled, and it does not prove business value or long-term reliability.
The command is excluded from default tests; default tests verify the same path with an offline model. The example uses an in-memory dynamic dataset and saves a snapshot for audit.
`DynamicEvaluationStore` optionally accepts a file path for JSONL persistence and reload. `FeedbackScheduler.tick()` is caller-driven; its cursor remains in memory, so reliable continuous listening and restart-time backfill are not provided.

## Define an Agent

### Five-minute start

Copy [minimal-agent.ts](src/templates/minimal-agent.ts), fill in four items—`AgentVersion`, `CapabilityPlugin`, `Topology`, and a versioned `EvaluationPackage`—then call:

```ts
const agent = assembleAgent('./data/my-agent', {agentId:'my-agent', ...definition});
const result = await agent.run('request-1', input);
const evaluation = await agent.evaluate(result, input);
```

Execution is stateless by default. Set `memoryMode: 'persistent'` explicitly when long-term episodes are required. Infrastructure plugins are excluded from capability optimization analysis.

The public composition entry point is `src/index.ts`. A new Agent only needs an `AgentTemplate`; the runtime does not need to change:

```ts
import {assembleAgent, definePlugin, type AgentTemplate} from './src/index.js';
const definition: AgentTemplate = {/* version, plugins, topology, evaluation */};
const agent = assembleAgent('./data/my-agent', definition);
const result = await agent.run('request-1', input);
const report = await agent.evaluate(result, input);
```

Agents with delayed feedback can use `DynamicEvaluationStore`: record a decision, attach feedback when it arrives, then freeze `snapshot()` for fair baseline/candidate comparison. The store defines generic time and evidence constraints and makes no domain assumptions.

Wiki memory can also be maintained automatically. `maintainMemory(wiki, trace, options)` extracts candidates from explicit `knowledge/candidate` facts in a trace, merges conflicts by topic, creates source-backed proposals, and publishes a new immutable Release. Conflicts remain `hypothesis` entries; old Releases are preserved and failed publication never overwrites the previous memory.

The default Agent is stateless: each run uses only explicit input and a versioned Wiki. `memoryMode: 'persistent'` enables Episodic Memory; `memoryMaintenance: true` enables persistent memory and automatic Wiki maintenance. With persistent memory, the assembled Agent writes each execution to `memory/episodes.jsonl`, retrieves relevant episodes on the next run, and injects summaries and details within the context budget. Automatic Wiki maintenance also requires a Kernel model and runs after successful execution; inspect `memoryMaintenanceError` when maintenance fails. `analyzeCapabilityTrajectory` reports the supplied capability plugin set; it does not generate optimization code.

Copy [text-agent.ts](src/templates/text-agent.ts) and fill in an `AgentTemplate`:

```ts
const agent = assembleAgent('./data/my-agent', myTemplate);
const result = await agent.run('stable-request-id', task);
const evaluation = await agent.evaluate(result, task);
```

A template contains the version, capability plugins, data/control edges, a versioned EvaluationPackage (Evaluator, Dataset, and Gates), and optional model/tool services. `assembleAgent` exposes `versions`, `wiki`, `resolver`, and `compare`; see [template-acceptance.ts](src/examples/template-acceptance.ts). Adding an Agent does not require changing the core runtime.

Plugins share the Agent's published Wiki; temporary work state remains inside the call. Wiki updates cite raw sources, create a proposal, and require the scope owner to publish. A new Release does not change an execution's pinned memory. See [team-acceptance.ts](src/examples/team-acceptance.ts) for the team flow.

## Reading guide

The supported entry point is the TypeScript SDK and the example scripts above. LLM evaluation can be added with versioned `llmRubric`, `aggregateLLMEvaluation`, and `compareLLMEvaluations`; results must cite evidence events and enter `needs-review` on low confidence or high disagreement. LLM scores cannot bypass deterministic gates. See [Architecture boundaries and acceptance](docs/ARCHITECTURE_GAPS.md).

- [Code map](docs/CODE_MAP.md): actual call paths.
- [Product and architecture specification](docs/GOVERNED_AGENT_HARNESS_SPEC.md): principles and increments.
- [Architecture boundaries and acceptance](docs/ARCHITECTURE_GAPS.md): scope, trust boundaries, and verification commands.

Technical references are DeepSeek Harness and Cordis. The DSH reference checkout was updated to `5dda764ed3aa172535a7967b06ff95d9cbfe536a`; this project adopts its lifecycle, durable messages, receipts, and task-authority semantics without importing the entire DSH monorepo.
