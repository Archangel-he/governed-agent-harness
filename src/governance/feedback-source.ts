import {readFileSync} from 'node:fs';
import type {FeedbackEvent} from './dynamic-evaluation.js';

export interface FeedbackSource {id:string;version:string;collect(after?:number):Promise<FeedbackEvent[]>}
export function fileFeedbackSource(file:string):FeedbackSource {return {id:'file',version:'1',async collect(after=0){return readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line) as FeedbackEvent).filter(event=>event.observedAt>after)}}}
export function httpFeedbackSource(endpoint:string,headers:Record<string,string>={}):FeedbackSource {return {id:'http',version:'1',async collect(after=0){const response=await fetch(endpoint+'?after='+encodeURIComponent(String(after)),{headers});if(!response.ok)throw new Error('Feedback source HTTP '+response.status);const value=await response.json() as unknown; if(!Array.isArray(value))throw new Error('Feedback source must return an array');return value as FeedbackEvent[]}}}
