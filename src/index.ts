/** Public composition surface: define a template, assemble it, then run it. */
export {assembleAgent, memorySnapshot} from './agent.js';
export {definePlugin, type CapabilityPlugin} from './plugins/capability.js';
export {evaluateTrace, defaultProfile, type Evaluation, type EvaluationProfile, type TaskOutcome} from './governance/evaluation.js';
export {freezeEvaluation, type EvaluationCase, type EvaluationDataset, type VersionedEvaluation} from './governance/evaluation-package.js';
export {DynamicEvaluationStore, scoreDynamicSnapshot, type DynamicCase, type DynamicDatasetSnapshot, type FeedbackEvent, type FeedbackStatus, type DynamicScore} from './governance/dynamic-evaluation.js';
export {fileFeedbackSource, httpFeedbackSource, type FeedbackSource} from './governance/feedback-source.js';
export {extractMemoryCandidates, extractMemoryCandidatesWithModel, detectMemoryConflicts, consolidateMemoryCandidates, proposeMemory, maintainMemory, maintainMemoryWithModel, type MemoryCandidate, type ModelMemoryCandidate, type ProposalOptions} from './memory/trajectory-proposals.js';
export {inspectWiki, maintainWiki, retrieveMemory, type WikiHealth} from './memory/maintenance.js';
export {FeedbackScheduler} from './governance/feedback-scheduler.js';
export {createOptimizationProposal, type OptimizationProposal} from './governance/optimization-proposal.js';
export {EpisodicMemoryStore, ObservationMemory, ProgressiveMemoryRetriever, type Episode, type Observation, type MemoryAction} from './memory/episodic.js';
export {analyzeTrajectory, analyzeCapabilityTrajectory} from './governance/analyzer.js';
export {createPluginOptimizationProposal, proposalToCandidateChange, type PluginOptimizationProposal} from './governance/plugin-proposal.js';
export {compareInterventions, type CrossEvaluation} from './governance/cross-evaluation.js';
export {governanceReport} from './governance/report.js';
export {aggregateLLMEvaluation, compareLLMEvaluations, validateEvaluationEvidence, type EvaluationRubric, type RubricDimension, type StructuredLLMEvaluation, type DimensionJudgement, type PairwiseJudgement, type EvaluationEvidence, type LLMEvaluator, type LLMEvaluationContext} from './governance/llm-evaluation.js';
export {createStructuredLLMEvaluator} from './governance/llm-judge.js';
export type {MemoryPage, MemorySnapshot, MemoryProvider} from './contracts/memory.js';
export {minimalAgentTemplate} from './templates/minimal-agent.js';
export {toolAgentTemplate} from './templates/tool-agent.js';
export type {AgentTemplate, AgentHandle} from './agent.js';
export type {AgentRequest, AgentRunResult, GovernedRuntimeOptions} from './runtime/governed-runtime.js';
export {createOpenAICompatibleModel, type OpenAICompatibleOptions} from './providers/openai-compatible.js';
export type {AgentVersion} from './contracts/index.js';
export type {TopologyDefinition, TopologyNode, TopologyEdge} from './topology/schema.js';

export {runOptimizationPipeline, type OptimizationFinding, type OptimizationCandidate, type OptimizationDecision, type OptimizationPipelineInput} from './governance/optimization-pipeline.js';
