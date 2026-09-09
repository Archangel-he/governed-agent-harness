import {randomUUID} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {LocalArtifactStore} from '../services/artifact-store.js';
import {acquireFileLock,atomicJson,localId,missing} from '../services/local-file.js';
import {jsonSnapshot} from '../services/log-value.js';
import {evidenceDigest} from '../governance/evaluation.js';

export type Scope='agent'|'team'|'supreme';
export type FactStatus='fact'|'hypothesis';
export interface SourceRef {hash:string;mediaType?:string}
export interface PageRevision {pageId:string;revision:number;title:string;markdown:string;status:FactStatus;sources:SourceRef[];owner:string;createdAt:string}
export interface Proposal {id:string;scope:Scope;owner:string;proposedBy?:string;pageId:string;baseRelease:string;title:string;markdown:string;status:FactStatus;sources:SourceRef[];createdAt:string}
export interface MemoryRelease {id:string;scope:Scope;owner:string;pages:Record<string,PageRevision>;createdAt:string}
interface State {schemaVersion:1;releases:Record<string,MemoryRelease>;current:Record<string,string>;proposals:Record<string,Proposal>;published:Record<string,string>;conflicts:{proposalId:string;expected:string;actual:string}[]}
const empty=():State=>({schemaVersion:1,releases:{},current:{},proposals:{},published:{},conflicts:[]});
function scopeKey(scope:Scope,owner:string):string {
 if(!['agent','team','supreme'].includes(scope))throw new Error('Invalid scope');localId(owner);return scope+':'+owner;
}
function releaseDigest(r:Omit<MemoryRelease,'id'>):string {return evidenceDigest({scope:r.scope,owner:r.owner,pages:r.pages})}

/** One trusted local store; Agent-facing access is restricted by the assembly's memory bindings. */
export class WikiStore {
 readonly artifacts:LocalArtifactStore;
 private readonly file:string;
 constructor(private readonly root:string){mkdirSync(root,{recursive:true});this.file=join(root,'wiki.json');this.artifacts=new LocalArtifactStore(join(root,'artifacts'))}
 createScope(scope:Scope,owner:string):string {
  const key=scopeKey(scope,owner);
  this.transaction(state=>{
   if(state.current[key])return;
   const data={scope,owner,pages:{},createdAt:new Date().toISOString()},id=releaseDigest(data);
   state.releases[id]={id,...data};state.current[key]=id;
  });return key;
 }
 async source(content:Buffer,mediaType='text/markdown'):Promise<SourceRef>{const ref=await this.artifacts.put(content,mediaType);return {hash:ref.hash,mediaType}}
 async propose(input:Omit<Proposal,'id'|'createdAt'> & {id?:string}):Promise<Proposal>{
  scopeKey(input.scope,input.owner);localId(input.pageId);if(input.id)localId(input.id);if(input.proposedBy)localId(input.proposedBy);
  if(!input.sources?.length||typeof input.title!=='string'||!input.title.trim()||typeof input.markdown!=='string'||!input.markdown.trim()||!['fact','hypothesis'].includes(input.status))throw new Error('Invalid proposal');
  const proposal:Proposal=jsonSnapshot({id:input.id??randomUUID(),scope:input.scope,owner:input.owner,pageId:input.pageId,baseRelease:input.baseRelease,title:input.title,markdown:input.markdown,status:input.status,sources:input.sources,...(input.proposedBy?{proposedBy:input.proposedBy}:{}),createdAt:new Date().toISOString()});
  for(const source of proposal.sources)if(!/^[a-f0-9]{64}$/.test(source.hash)||!await this.artifacts.get(source.hash))throw new Error('Unknown source artifact');
  return this.transaction(state=>{
   this.release(state,proposal.scope,proposal.owner,proposal.baseRelease);
   const old=state.proposals[proposal.id];
   if(old){const {createdAt:_,...a}=old,{createdAt:__,...b}=proposal;if(evidenceDigest(a)!==evidenceDigest(b))throw new Error('Proposal ID collision');return old}
   state.proposals[proposal.id]=proposal;return proposal;
  });
 }
 publish(proposalId:string,actorId:string):MemoryRelease {
  localId(proposalId);
  const outcome=this.transaction(state=>{
   const proposal=state.proposals[proposalId];if(!proposal)throw new Error('Unknown proposal');
   if(actorId!==proposal.owner)throw new Error('Unauthorized publisher');
   if(state.published[proposalId])return {release:state.releases[state.published[proposalId]]};
   const current=this.release(state,proposal.scope,proposal.owner);
   if(current.id!==proposal.baseRelease){state.conflicts.push({proposalId,expected:proposal.baseRelease,actual:current.id});return {conflict:true}}
   const pages=jsonSnapshot(current.pages);
   pages[proposal.pageId]={pageId:proposal.pageId,revision:(pages[proposal.pageId]?.revision??0)+1,title:proposal.title,markdown:proposal.markdown,status:proposal.status,sources:proposal.sources,owner:proposal.owner,createdAt:new Date().toISOString()};
   const problems=this.lintPages(pages);if(problems.length)throw new Error('Wiki lint: '+problems.join('; '));
   const data={scope:proposal.scope,owner:proposal.owner,pages,createdAt:new Date().toISOString()},id=releaseDigest(data),release={id,...data};
   // Markdown is an inspectable projection. Only the final atomic JSON commit publishes a release.
   const directory=join(this.root,'releases',id),pageDir=join(directory,'pages');mkdirSync(pageDir,{recursive:true});
   for(const page of Object.values(pages))writeFileSync(join(pageDir,page.pageId+'.md'),`# ${page.title}\n\nStatus: ${page.status}\nRevision: ${page.revision}\n\n${page.markdown}\n\nSources: ${page.sources.map(s=>s.hash).join(', ')}\n`);
   writeFileSync(join(directory,'index.md'),Object.values(pages).map(p=>`- [${p.title}](pages/${p.pageId}.md)`).join('\n')+'\n');
   writeFileSync(join(directory,'log.md'),`Proposal: ${proposalId}\nPublisher: ${actorId}\nParent: ${current.id}\n`);
   state.releases[id]=release;state.current[scopeKey(proposal.scope,proposal.owner)]=id;state.published[proposalId]=id;
   return {release};
  });
  if(!outcome.release)throw new Error('Release conflict');return outcome.release;
 }
 pinned(scope:Scope,owner:string):MemoryRelease {this.createScope(scope,owner);return this.release(this.load(),scope,owner)}
 read(scope:Scope,owner:string,pageId:string,releaseId?:string):PageRevision|undefined {localId(pageId);return this.release(this.load(),scope,owner,releaseId).pages[pageId]}
 search(scope:Scope,owner:string,term:string,releaseId?:string):PageRevision[]{const q=term.toLowerCase();return Object.values(this.release(this.load(),scope,owner,releaseId).pages).filter(p=>(p.title+' '+p.markdown).toLowerCase().includes(q))}
 lint(scope:Scope,owner:string,releaseId?:string):string[]{return this.lintPages(this.release(this.load(),scope,owner,releaseId).pages)}
 conflicts():State['conflicts'] {return this.load().conflicts}
 private lintPages(pages:Record<string,PageRevision>):string[]{
  const errors:string[]=[];
  for(const page of Object.values(pages))for(const match of page.markdown.matchAll(/\[\[([^\]]+)\]\]/g))if(!Object.hasOwn(pages,match[1]))errors.push(`${page.pageId}: missing link ${match[1]}`);
  return errors;
 }
 private release(state:State,scope:Scope,owner:string,id?:string):MemoryRelease {
  const release=state.releases[id??state.current[scopeKey(scope,owner)]];
  if(!release||release.scope!==scope||release.owner!==owner)throw new Error('Release scope mismatch');
  if(releaseDigest(release)!==release.id)throw new Error('Memory release integrity mismatch');
  return jsonSnapshot(release);
 }
 private load():State {
  let state:State;try{state=JSON.parse(readFileSync(this.file,'utf8'))}catch(error){if(!missing(error))throw error;return empty()}
  if(state.schemaVersion!==1||!state.releases||!state.current||!state.proposals||!state.published||!Array.isArray(state.conflicts))throw new Error('Invalid Wiki store schema');
  return jsonSnapshot(state);
 }
 private transaction<T>(change:(state:State)=>T):T {
  const unlock=acquireFileLock(this.file+'.lock');
  try{const state=this.load(),result=change(state);atomicJson(this.file,state);return result===undefined?result:jsonSnapshot(result)}finally{unlock()}
 }
}
