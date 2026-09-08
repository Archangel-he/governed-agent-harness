import type { AgentInboxMessage, PersistedAgent } from '../contracts/registry.js';
import type { AgentLoop, LoopRequest, LoopResult } from './agent-loop.js';
import { jsonSnapshot } from '../services/log-value.js';
import { localId } from '../services/local-file.js';
import { isDeepStrictEqual } from 'node:util';
export interface RegisteredAgent extends PersistedAgent {loop:AgentLoop}
export interface AgentRegistryStore {
 saveAgent(a:PersistedAgent):void;saveMessage(m:AgentInboxMessage):void;listAgents():PersistedAgent[];
 peekMessages(id:string):AgentInboxMessage[];acknowledge(id:string,messageId:string):void;
 drainMessages(id:string):AgentInboxMessage[];removeAgent(id:string):void;
}
export class AgentRegistry {
 private readonly agents=new Map<string,RegisteredAgent>();
 private readonly messages=new Map<string,AgentInboxMessage>();
 private readonly acknowledged=new Set<string>();
 constructor(private readonly store?:AgentRegistryStore){}
 register(agent:RegisteredAgent):void {
  localId(agent.id);localId(agent.sessionId);
  if(!['lead','member'].includes(agent.role))throw new Error('Invalid agent role');
  if(this.agents.has(agent.id))throw new Error('Agent already registered');
  if([...this.agents.values()].some(a=>a.sessionId===agent.sessionId||a.loop===agent.loop))throw new Error('Agent sessions must be independent');
  this.store?.saveAgent({id:agent.id,sessionId:agent.sessionId,role:agent.role});
  agent.loop.resume();this.agents.set(agent.id,{...agent});
 }
 rehydrate(factory:(a:PersistedAgent)=>RegisteredAgent):void {
  for(const metadata of this.store?.listAgents()??[])if(!this.agents.has(metadata.id)){
   const agent=factory(jsonSnapshot(metadata));
   if(agent.id!==metadata.id||agent.sessionId!==metadata.sessionId||agent.role!==metadata.role)throw new Error('Recovered agent identity mismatch');
   this.register(agent);
  }
 }
 unregister(id:string,actorId?:string):void {
  if(actorId&&this.agents.get(actorId)?.role!=='lead')throw new Error('Only lead may administer agents');
  this.store?.removeAgent(id);this.agents.get(id)?.loop.cancel();this.agents.delete(id);
  for(const m of this.messages.values())if(m.to===id)this.acknowledged.add(m.id);
 }
 get(id:string){const a=this.agents.get(id);return a?{...a}:undefined}
 list(){return [...this.agents.values()].map(a=>({...a}))}
 send(value:AgentInboxMessage):void {
  const message=jsonSnapshot(value);localId(message.id);
  if(!this.agents.has(message.from)||!this.agents.has(message.to))throw new Error('Unknown message agent');
  if(this.store){this.store.saveMessage(message);return}
  const previous=this.messages.get(message.id);if(previous){if(!isDeepStrictEqual(previous,message))throw new Error('Message ID conflict');return}
  this.messages.set(message.id,message);
 }
 receive(id:string):AgentInboxMessage[] {
  if(!this.agents.has(id))throw new Error('Unknown agent');
  return this.store?this.store.peekMessages(id):jsonSnapshot([...this.messages.values()].filter(m=>m.to===id&&!this.acknowledged.has(m.id)));
 }
 acknowledge(id:string,messageId:string):void {
  if(this.store){this.store.acknowledge(id,messageId);return}
  if(this.messages.get(messageId)?.to!==id)throw new Error('Unknown inbox message');this.acknowledged.add(messageId);
 }
 /** Compatibility operation: returning a batch explicitly acknowledges it. Prefer processInbox. */
 drain(id:string):AgentInboxMessage[]{if(this.store)return this.store.drainMessages(id);const rows=this.receive(id);for(const m of rows)this.acknowledge(id,m.id);return rows}
 async processInbox(id:string):Promise<LoopResult[]> {
  const results:LoopResult[]=[];
  for(const message of this.receive(id)){
   const result=await this.run(id,{id:'inbox:'+message.id,content:{from:message.from,content:message.content}});
   results.push(result);
   if(result.status!=='completed')break;
   this.acknowledge(id,message.id);
  }
  return results;
 }
 async run(id:string,request:LoopRequest):Promise<LoopResult>{const agent=this.agents.get(id);if(!agent)throw new Error('Unknown agent');return agent.loop.run(request)}
}
