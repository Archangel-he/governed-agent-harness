import {evidenceDigest} from './evaluation.js';
import {freezeTopology} from '../topology/schema.js';
import {appendFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';

export type FeedbackStatus = 'pending'|'scored'|'expired'|'invalid';
export interface DecisionCase {id:string;input:unknown;output:unknown;decisionAt:number;metadata?:Record<string,unknown>}
export interface FeedbackEvent {id:string;caseId:string;observedAt:number;value:unknown;source:string}
export interface DynamicCase extends DecisionCase {status:FeedbackStatus;feedback?:FeedbackEvent}
export interface DynamicDataset {id:string;version:string;cases:readonly DynamicCase[]}
export interface DynamicDatasetSnapshot extends DynamicDataset {snapshotAt:number;digest:string}
export interface DynamicScore {caseId:string;quality:number;feedbackDigest:string;status:'scored'|'unscored'}

/** In-memory reference store; replace only this boundary when persistence is needed. */
export class DynamicEvaluationStore {
 private readonly items=new Map<string,DynamicCase>();
 constructor(readonly id:string,readonly version='1',private readonly file?:string) {
  if(file){mkdirSync(dirname(file),{recursive:true});if(existsSync(file)){for(const line of readFileSync(file,'utf8').split('\n').filter(Boolean)){const row=JSON.parse(line) as DynamicCase;this.items.set(row.id,freezeTopology(row));}}}
 }
 private persist(item:DynamicCase):void {if(this.file)appendFileSync(this.file,JSON.stringify(item)+'\n','utf8');}
 recordDecision(input:Omit<DecisionCase,'id'> & {id?:string}):DynamicCase {
  const id=input.id??crypto.randomUUID();
  if(this.items.has(id))throw new Error('Duplicate evaluation case');
  if(!Number.isFinite(input.decisionAt))throw new Error('Decision timestamp required');
  const item=freezeTopology({...input,id,status:'pending' as const});this.items.set(id,item);this.persist(item);return item;
 }
 recordFeedback(feedback:FeedbackEvent):DynamicCase {
  const item=this.items.get(feedback.caseId);if(!item)throw new Error('Unknown evaluation case');
  if(item.status!=='pending')throw new Error('Evaluation case is already settled');
  if(!Number.isFinite(feedback.observedAt)||feedback.observedAt<item.decisionAt)throw new Error('Feedback precedes decision');
  const next=freezeTopology({...item,feedback,status:'scored' as const});this.items.set(item.id,next);this.persist(next);return next;
 }
 expire(id:string):DynamicCase {
  const item=this.items.get(id);if(!item)throw new Error('Unknown evaluation case');
  if(item.status!=='pending')throw new Error('Evaluation case is already settled');
  const next=freezeTopology({...item,status:'expired' as const});this.items.set(id,next);this.persist(next);return next;
 }
 invalidate(id:string):DynamicCase {
  const item=this.items.get(id);if(!item)throw new Error('Unknown evaluation case');
  if(item.status!=='pending')throw new Error('Evaluation case is already settled');
  const next=freezeTopology({...item,status:'invalid' as const});this.items.set(id,next);this.persist(next);return next;
 }
 snapshot(now=Date.now()):DynamicDatasetSnapshot {
  if(!Number.isFinite(now))throw new Error('Snapshot timestamp required');
  const cases=[...this.items.values()].map(item=>{if(item.decisionAt>now||item.feedback?.observedAt&&item.feedback.observedAt>now)throw new Error('Snapshot contains future evidence');return structuredClone(item)});
  const dataset={id:this.id,version:this.version,cases};return freezeTopology({...dataset,snapshotAt:now,digest:evidenceDigest(dataset)});
 }
 list():DynamicCase[]{return [...this.items.values()].map(item=>Object.freeze({...item}));}
}
export function scoreDynamicSnapshot(snapshot:DynamicDatasetSnapshot,judge:(input:unknown,output:unknown,feedback:unknown)=>{quality:number}):DynamicScore[]{return snapshot.cases.map(item=>{if(item.status!=='scored'||!item.feedback)return{caseId:item.id,quality:0,feedbackDigest:'',status:'unscored'};const result=judge(item.input,item.output,item.feedback.value);if(!Number.isFinite(result.quality)||result.quality<0||result.quality>1)throw new Error('Dynamic score must be in [0,1]');return{caseId:item.id,quality:result.quality,feedbackDigest:evidenceDigest(item.feedback),status:'scored'}})}
