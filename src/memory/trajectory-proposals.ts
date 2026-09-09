import type {AgentTrace,TraceEvent} from '../trace/events.js';
import {evidenceDigest} from '../governance/evaluation.js';
import {jsonSnapshot} from '../services/log-value.js';
import type {Proposal,Scope,WikiStore} from './wiki.js';

export interface MemoryCandidate {id:string;title:string;markdown:string;scope:Scope;owner:string;status:'fact'|'hypothesis';confidence:number;expiresAt?:number;sourceEventIds:string[]}
export interface ProposalOptions {scope:Scope;owner:string;proposedBy:string;baseRelease?:string}

/** Extracts only explicit, machine-readable knowledge facts; LLM summarisation belongs above this boundary. */
export function extractMemoryCandidates(trace:AgentTrace,options:ProposalOptions):MemoryCandidate[] {
 const events=trace.events.filter(event=>event.type==='knowledge/candidate'||event.type==='knowledge/used'&&event.phase==='fact');
 const out:MemoryCandidate[]=[];const seen=new Set<string>();
 for(const event of events){const payload=event.payload as Record<string,unknown>|undefined;const title=typeof payload?.title==='string'?payload.title.trim():'';const markdown=typeof payload?.markdown==='string'?payload.markdown.trim():'';if(!title||!markdown)continue;const sourceEventIds=[event.id];const id=evidenceDigest({title,markdown,scope:options.scope,owner:options.owner,sourceEventIds});if(seen.has(id))continue;seen.add(id);const confidence=typeof payload?.confidence==='number'?payload.confidence:.5;if(confidence<0||confidence>1)throw new Error('Memory candidate confidence must be in [0,1]');out.push({id,title,markdown,scope:options.scope,owner:options.owner,status:payload?.status==='fact'?'fact':'hypothesis',confidence, ...(typeof payload?.expiresAt==='number'?{expiresAt:payload.expiresAt}:{}),sourceEventIds});}
 return out;
}
export function detectMemoryConflicts(candidates:readonly MemoryCandidate[]):MemoryCandidate[][] {const groups=new Map<string,MemoryCandidate[]>();for(const candidate of candidates){const key=candidate.title.toLowerCase();const group=groups.get(key)??[];group.push(candidate);groups.set(key,group)}return [...groups.values()].filter(group=>new Set(group.map(candidate=>candidate.markdown)).size>1)}
export async function proposeMemory(wiki:WikiStore,trace:AgentTrace,options:ProposalOptions):Promise<Proposal[]> {
 const candidates=extractMemoryCandidates(trace,options);const conflicts=detectMemoryConflicts(candidates);const conflicting=new Set(conflicts.flat().map(candidate=>candidate.id));const baseRelease=options.baseRelease??wiki.pinned(options.scope,options.owner).id;const proposals:Proposal[]=[];
 for(const candidate of candidates){const evidence=jsonSnapshot({candidate,trace:{executionId:trace.executionId,eventIds:candidate.sourceEventIds}});const source=await wiki.source(Buffer.from(JSON.stringify(evidence),'utf8'),'application/json');proposals.push(await wiki.propose({id:candidate.id,scope:candidate.scope,owner:candidate.owner,proposedBy:options.proposedBy,pageId:candidate.title.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'candidate',baseRelease,title:candidate.title,markdown:candidate.markdown,status:conflicting.has(candidate.id)?'hypothesis':candidate.status,sources:[source]}));}
 return proposals;
}
