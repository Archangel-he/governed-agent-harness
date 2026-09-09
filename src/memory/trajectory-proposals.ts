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
function consolidate(candidates:readonly MemoryCandidate[]):MemoryCandidate {const first=candidates[0];const conflict=new Set(candidates.map(candidate=>candidate.markdown)).size>1;return {...first,id:evidenceDigest(candidates.map(candidate=>candidate.id)),markdown:conflict?['Conflicting observations:',...candidates.map(candidate=>`- ${candidate.markdown}`),'','Keep this hypothesis until later evidence resolves the conflict.'].join('\n'):first.markdown,status:conflict?'hypothesis':first.status,confidence:Math.min(...candidates.map(candidate=>candidate.confidence)),sourceEventIds:candidates.flatMap(candidate=>candidate.sourceEventIds)}}
export function consolidateMemoryCandidates(candidates:readonly MemoryCandidate[]):MemoryCandidate[]{const groups=new Map<string,MemoryCandidate[]>();for(const candidate of candidates){const key=candidate.title.toLowerCase();groups.set(key,[...(groups.get(key)??[]),candidate])}return [...groups.values()].map(consolidate)}
export async function proposeMemory(wiki:WikiStore,trace:AgentTrace,options:ProposalOptions):Promise<Proposal[]> {
 const candidates=consolidateMemoryCandidates(extractMemoryCandidates(trace,options));const baseRelease=options.baseRelease??wiki.pinned(options.scope,options.owner).id;const proposals:Proposal[]=[];
 for(const candidate of candidates){const evidence=jsonSnapshot({candidate,trace:{executionId:trace.executionId,eventIds:candidate.sourceEventIds}});const source=await wiki.source(Buffer.from(JSON.stringify(evidence),'utf8'),'application/json');proposals.push(await wiki.propose({id:candidate.id,scope:candidate.scope,owner:candidate.owner,proposedBy:options.proposedBy,pageId:candidate.title.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'candidate',baseRelease,title:candidate.title,markdown:candidate.markdown,status:candidate.status,sources:[source]}));}
 return proposals;
}
export async function maintainMemory(wiki:WikiStore,trace:AgentTrace,options:ProposalOptions):Promise<{proposals:Proposal[];releaseId:string;published:number}> {const proposals=await proposeMemory(wiki,trace,options);let releaseId=wiki.pinned(options.scope,options.owner).id;let published=0;for(const proposal of proposals){try{const release=wiki.publish(proposal.id,options.owner);releaseId=release.id;published++}catch(error){if(!String(error).toLowerCase().includes('conflict'))throw error}}return {proposals,releaseId,published};}

