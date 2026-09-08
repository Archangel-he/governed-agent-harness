import { runGenericAgent } from './generic-agent.js';
import { evaluateCluster, makeCandidate } from '../governance/cluster-evaluator.js';
import { releaseGate } from '../governance/release.js';
import { MemoryRootSession, RevisionConflict } from '../services/session.js';
import { CapabilityError, MemoryGateway } from '../services/gateway.js';
import { recoverExecution } from '../runtime/recovery.js';
import { compare } from '../governance/replay.js';
import type { Execution } from '../contracts/domain.js';
import { validateBinding } from '../plugins/validate-binding.js';
import { validateVersion } from '../runtime/validate-version.js';
const count = await runGenericAgent();
if (count !== 1) throw new Error(`expected one trajectory event, got ${count}`);
const candidate = makeCandidate('candidate-1', 'v1', 'v2', 'hypothesis-1');
if (candidate.status !== 'proposed') throw new Error('candidate contract failed');
if (releaseGate(candidate, 0.9, 0.8).decision !== 'release') throw new Error('release gate failed');
const session = new MemoryRootSession(); session.commit(0, { ok: true });
try { session.commit(0, {}); throw new Error('CAS failed'); } catch (error) { if (!(error instanceof RevisionConflict)) throw error; }
try { await new MemoryGateway(new Set()).invoke({ agentId: 'a', agentVersionId: 'v', executionId: 'e', seatId: 's' }, 'forbidden', {}); throw new Error('gateway failed'); } catch (error) { if (!(error instanceof CapabilityError)) throw error; }
const execution: Execution = { id: 'execution-1', agentId: 'agent-1', agentVersionId: 'v1', status: 'failed', rootRevisionBefore: 0 };
const recovery = recoverExecution(execution, 1, true, 'temporary');
if (recovery.status !== 'retryable' || execution.status !== 'queued') throw new Error('recovery failed');
const experimentResult = await compare(candidate, [{ id: 'case-1', input: 1, expected: 2 }], async n => n, async n => n + 1, (actual, expected) => actual === expected);
if (!experimentResult.improved) throw new Error('replay comparison failed');
validateBinding({ id: 'capability', role: 'capability', contract: 'capability@1', requiredCapabilities: [], primaryClusterId: 'cluster-1', observationClusterIds: [] }, pluginBinding());
try { validateBinding({ id: 'bad', role: 'bad', contract: 'wrong@1', requiredCapabilities: [], primaryClusterId: 'cluster-1', observationClusterIds: [] }, pluginBinding()); throw new Error('binding validation failed'); } catch (error) { if (!(error instanceof Error) || !error.message.includes('seat mismatch')) throw error; }
validateVersion({ id: 'version-checked', agentDefinitionId: 'generic', policyVersion: 'p1', seats: [{ id: 'capability', role: 'capability', contract: 'capability@1', requiredCapabilities: [], primaryClusterId: 'cluster-1', observationClusterIds: [] }], bindings: [pluginBinding()] });
console.log({ ok: true, trajectoryEvents: count, candidate: candidate.id, evaluator: evaluateCluster({ id: 'cluster-1', version: '1', seatIds: ['capability'], metricProfile: 'default' }, []).score, revision: session.revision, recovery: recovery.status, improved: experimentResult.improved });

function pluginBinding() { return { seatId: 'capability', configDigest: 'x', plugin: { id: 'p', version: '1', contract: 'capability@1', kind: 'service' as const, capabilities: [] } }; }


