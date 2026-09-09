import {evidenceDigest,type EvaluationProfile} from './evaluation.js';
import type {ExperimentEvaluator} from './experiment.js';
import {jsonSnapshot} from '../services/log-value.js';

export interface EvaluationCase {id:string;input:unknown;expected?:unknown;metadata?:Record<string,unknown>}
export interface EvaluationDataset {id:string;version:string;cases:readonly EvaluationCase[]}
export interface VersionedEvaluation {version:string;evaluator:ExperimentEvaluator;dataset:EvaluationDataset;gates:EvaluationProfile}
export interface FrozenEvaluation {version:string;evaluator:ExperimentEvaluator;dataset:Readonly<EvaluationDataset>;gates:Readonly<EvaluationProfile>}

function freeze<T>(value:T):T {
 if(value&&typeof value==='object') {Object.freeze(value);for(const child of Object.values(value as object))freeze(child)}
 return value;
}
export function freezeEvaluation(definition:VersionedEvaluation):{definition:FrozenEvaluation;digest:string} {
 if(!definition||!definition.version||!definition.evaluator?.id||!definition.evaluator.version)throw new Error('Versioned evaluation package is required');
 if(!definition.dataset?.id||!definition.dataset.version||!Array.isArray(definition.dataset.cases)||!definition.dataset.cases.length)throw new Error('Evaluation dataset is required');
 if(new Set(definition.dataset.cases.map(c=>c.id)).size!==definition.dataset.cases.length||definition.dataset.cases.some(c=>!c.id))throw new Error('Evaluation dataset case IDs must be unique');
 if(!definition.gates?.id||!definition.gates.version)throw new Error('Evaluation gates are required');
 const dataset=jsonSnapshot(definition.dataset),gates=jsonSnapshot(definition.gates);
 const digest=evidenceDigest({version:definition.version,evaluator:{id:definition.evaluator.id,version:definition.evaluator.version,implementationDigest:evidenceDigest(definition.evaluator.judge.toString())},dataset,gates});
 const evaluator=Object.freeze({...definition.evaluator});
 const frozen={version:definition.version,evaluator,dataset:freeze(dataset),gates:freeze(gates)} as FrozenEvaluation;
 return {definition:Object.freeze(frozen),digest};
}
