import type { TrajectoryEvent } from '../contracts/domain.js';
export interface AgentEvaluation {successRate:number;pluginCount:number;operationCount:number;failed:number;completed:boolean}
/** Legacy summaries use operation outcomes, never event counts. Full release gates use evaluateTrace. */
export function operationOutcomes(events:TrajectoryEvent[]):TrajectoryEvent[]{
 const operations=new Map<string,TrajectoryEvent>();
 for(const event of events)if(event.phase!=='fact')operations.set(JSON.stringify([event.executionId,event.operationId]),event);
 return [...operations.values()];
}
export function evaluateAgent(events:TrajectoryEvent[],options:{expectedOperations?:number}={}):AgentEvaluation {
 const outcomes=operationOutcomes(events),settled=outcomes.filter(e=>!['started','unknown'].includes(e.status));
 return {successRate:outcomes.length?outcomes.filter(e=>e.status==='succeeded').length/outcomes.length:0,
 pluginCount:new Set(events.map(e=>e.pluginId??e.seatId).filter(Boolean)).size,operationCount:outcomes.length,
 failed:outcomes.filter(e=>e.status==='failed').length,
 completed:outcomes.length>0&&settled.length===outcomes.length&&outcomes.length>=(options.expectedOperations??0)};
}
