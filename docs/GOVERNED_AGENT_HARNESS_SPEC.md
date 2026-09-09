# Governed Agent Harness
## Product and Architecture Specification

Version: 0.4 (2026-09-09)\nStatus: product positioning and core principles approved; implementation continues.\n“Must” describes the target contract, not a claim of production certification.

## 1. Product positioning

This release is a complete local framework for a small developer group running Docker experiments: define an Agent, assemble a free topology, execute it, collect traces, evaluate the whole Agent, validate candidates, and publish versions.

The deliverable is a framework that can build and run concrete Agents. Developers define task-specific capabilities, plugin bindings, and evaluation criteria; they should not reimplement model loops, Sessions, permissions, persistence, recovery, or governance. DSH and Cordis are the sole technical references. The project name is Governed Agent Harness.

## 2. Core additions beyond DSH

DSH/Cordis provide plugin composition, lifecycle, Agent execution, and event mechanisms. This project adds four product contracts:

1. **Free capability topology:** the author chooses plugin count, composition, dependencies, order, parallelism, branches, and governance groups.
2. **Complete Agent Trace:** evidence covers every participating plugin in one Agent execution instead of isolated plugin counters.
3. **Whole-Agent evaluation:** overall effect is evaluated from complete executions and samples; local metrics are diagnostics.
4. **Governed evolution:** an optimization becomes a candidate, then passes experiments, whole-Agent evaluation, and release gates.

These are design goals, not a claim of absolute novelty.

## 3. Frozen foundation and variable capabilities

Kernel, model Provider configuration, Sandbox, Session/Workspace/Trajectory stores, Gateway, and permission enforcement are frozen runtime components of an AgentVersion. They may still be managed as Cordis plugins, but are not the everyday decomposition surface for Agent authors. Upgrades create a new version and receive independent validation.

Standard capability vocabulary is a recommended starting point, not a mandatory template:

| Capability area | Typical decomposition |
| --- | --- |
| Context and knowledge | selection, retrieval, evidence organization, context assembly, compression |
| Tasks and planning | goals, constraints, decomposition, dependency plans, replanning |
| Reasoning and decision | candidate generation, comparison, risk trade-offs, selection, explanation |
| Tool use | selection, argument construction, result interpretation, fallback |
| Verification and correction | acceptance, evidence checks, diagnosis, repair |
| Collaboration | delegation, role split, report aggregation, conflict handling |
| Self-evaluation | completion, confidence, evidence sufficiency, escalation |
| Interaction and communication | clarification, feedback, explanation, progress |
| Strategy and risk | risk detection, strategy explanation, approval escalation |

Capability areas are composable rather than fixed stages. A Seat declares its responsibility, contract, I/O, and dependencies; required data dependencies must be explicit.

## 4. Human-defined structure

Before release, the author chooses capability areas, splits Plugin Seats, binds implementations, and configures governance topology. An AgentVersion freezes runtime configuration, Seat definitions, plugin versions and parameters, dependencies and allowed control flow, governance groups, evaluation criteria, and release policy.

An executing Agent may choose tools and branches inside that authorized structure, but cannot add Seats, install replacements, change permissions, or rewrite governance rules. An analyzer may propose split, merge, replacement, parameter, ordering, or dependency changes. A human must approve a candidate before experiment and release.

## 5. Topologies and boundaries

Execution topology defines calls, data flow, branches, loops, and parallel paths. Observation topology defines events and evidence references. Governance topology defines which Seats share analysis and evaluation. Authors may start from a blank graph; recommended Profiles are reusable defaults.

One plugin may cover several stages and several plugins may share one analyzer. No per-plugin analysis Agent is required. Finer decomposition is justified only when it creates a real governance need in contracts, failure modes, optimization targets, or permissions; decomposition cost (calls, latency, context loss, interface errors) enters whole-Agent evaluation.

## 6. Core loop

Human defines capability and governance topology → publish frozen AgentVersion → Cordis assembles foundation and Seats → execute and record all plugin traces → aggregate complete Agent Trace → analyze samples and independently evaluate the whole Agent → produce plugin/topology proposal → author approves candidate → replay or isolated experiment → publish or reject, with rollback when needed.

An analysis may point to one plugin, but must include relevant upstream/downstream evidence and whole-task outcome. A one-plugin candidate still receives whole-Agent evaluation.

## 7. Facts and trace contract

Session records recoverable, model-visible facts. Trajectory describes capability participation. Stable event, Execution, and operation IDs connect them; projection must be rebuildable and idempotent.

Four levels are retained: Plugin Event, Plugin Trace, Agent Trace, and Evaluation Dataset. Events include Agent/Version, Seat/Plugin/Version, Execution/Operation, parent/dependency references, sequence, time, status, I/O references, errors, usage, and latency. An uncalled Seat is marked uncalled; missing terminal evidence is incomplete, never implicit success. The system records observable outputs and evidence, not private chain-of-thought.

## 8. Integrated analysis and optimization

Analysis consumes complete Agent Trace sets and independent outcomes. Outputs remain distinct: Observation → Finding → Hypothesis → Optimization Proposal → Candidate Experiment → Agent Evaluation → Release Decision.

Local metrics diagnose; release targets completion, quality, constraints, safety, side effects, cost, latency, and intervention. Candidates state scope, evidence, expected benefit, risks, validation, and rollback. Baseline and candidate use identical evaluation assets, input distribution, frozen infrastructure, and memory. A local improvement with whole-Agent regression is rejected.

### 8.5 Agent-specific EvaluationPackage

Every releasable AgentTemplate carries a versioned `EvaluationPackage`: `Evaluator` defines business judgment, `EvaluationDataset` defines stable versioned cases, and `Gates` define runtime gates plus Agent-specific release conditions. Assembly freezes all three and writes an `evaluationDigest` into AgentVersion.

LLM evaluation is a structured soft signal. `llmRubric` defines dimensions, anchors, and evidence requirements. The system stores evaluator/model/prompt/rubric versions, aggregates repeated judgments, measures disagreement, and routes low-confidence or high-disagreement results to `needs-review`. LLM scores never override deterministic gates or prove causality.

## 9. Wiki memory

Each Agent owns a Wiki; authorized plugins read shared Agent memory while keeping temporary call state local. Immutable source Artifacts feed proposals containing pages, fact/hypothesis status, and citations. The scope owner publishes with expected-release CAS. Old Releases remain; conflicts cannot silently overwrite facts.

Reads cite release and page revisions. Executions pin a complete memory snapshot, and paired experiments use the same snapshot. Team and Supreme shared Wikis are separate namespaces with explicit read and publication authority.

## 10. Hierarchical composition

Supreme → Team Leader → Member are all complete `GovernedAgentRuntime + AgentVersion` instances. Humans enter through Supreme; Supreme delegates to direct Leaders, Leaders to direct Members, and reports return to the immediate parent. Tasks are persisted before execution, request IDs deduplicate work, and each Agent owns an independent Session.

Report submission and acceptance are separate. Parent coordination cites child evidence and may accept or reject; required rejected work prevents parent acceptance. A crash after completion but before acknowledgement can recover the result from the original Session. Unknown side effects remain interrupted and are not blindly replayed. Rework gets a new assignment key.

## 11. Engineering acceptance

Acceptance covers generic template branching, lifecycle cleanup, edge execution, branch/parallel/bounded-loop semantics, Session projection, evidence and recovery, integrated governance, Wiki authority, hierarchical Teams, and Docker execution. This phase does not add multi-tenancy, cross-host leases, host OS security, or a vector database.

## 12. Current implementation

As of 2026-09-09, integrated analysis still relies on runtime statistics and targeted attribution rules; proposal content is caller supplied, and dynamic feedback checkpoints are not persistent. The SDK, templates, and examples are the supported entry points. Current verification and retained boundaries are recorded in [ARCHITECTURE_GAPS.md](ARCHITECTURE_GAPS.md).

Governed Agent Harness is a single-machine Agent execution and evolution framework: freeze the runtime foundation, let humans define and refine capability topology, run plugins on Cordis, use complete Agent traces to form optimization hypotheses, and evolve versions through whole-Agent evidence. Multi-Agent operation is a governed hierarchical composition of the same foundation.

