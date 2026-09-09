/** Public composition surface: define a template, assemble it, then run it. */
export {assembleAgent, memorySnapshot, type AgentTemplate} from './agent.js';
export {definePlugin, type CapabilityPlugin} from './plugins/capability.js';
export {evaluateTrace, defaultProfile, type Evaluation, type EvaluationProfile, type TaskOutcome} from './governance/evaluation.js';
export {freezeEvaluation, type EvaluationCase, type EvaluationDataset, type VersionedEvaluation} from './governance/evaluation-package.js';
export {DynamicEvaluationStore, type DynamicCase, type DynamicDatasetSnapshot, type FeedbackEvent, type FeedbackStatus} from './governance/dynamic-evaluation.js';
export type {AgentVersion} from './contracts/index.js';
export type {TopologyDefinition, TopologyNode, TopologyEdge} from './topology/schema.js';
