import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { AgentInboxMessage, PersistedAgent } from '../contracts/registry.js';
import { acquireFileLock, atomicJson, localId, missing } from './local-file.js';
import { jsonSnapshot } from './log-value.js';
interface State {version:1;agents:PersistedAgent[];messages:AgentInboxMessage[];acknowledged:string[]}
function agent(a:PersistedAgent){localId(a.id);localId(a.sessionId);if(!['lead','member'].includes(a.role))throw new Error('Invalid agent role')}
function message(m:AgentInboxMessage){localId(m.id);localId(m.from);localId(m.to);if(!Object.hasOwn(m,'content'))throw new Error('Missing message content')}
export class AgentRegistryStore {
 constructor(private readonly file:string){mkdirSync(dirname(file),{recursive:true});this.read()}
 private read():State {
  let s:State;
  try{s=JSON.parse(readFileSync(this.file,'utf8'))}catch(error){if(missing(error))return{version:1,agents:[],messages:[],acknowledged:[]};throw error}
  // Explicit migration of the earlier snapshot format; retain seen IDs as tombstones.
  if(!('version' in s)) {
   const old=s as unknown as {agents:PersistedAgent[];inbox:Record<string,AgentInboxMessage[]>;seen:string[]};
   if(!Array.isArray(old.agents)||!old.inbox||!Array.isArray(old.seen))throw new Error('Invalid registry snapshot');
   const messages=Object.values(old.inbox).flat();s={version:1,agents:old.agents,messages,acknowledged:old.seen.filter(id=>!messages.some(m=>m.id===id))};
  }
  if(s.version!==1||!Array.isArray(s.agents)||!Array.isArray(s.messages)||!Array.isArray(s.acknowledged))throw new Error('Invalid registry snapshot');
  s.agents.forEach(agent);s.messages.forEach(message);s.acknowledged.forEach(localId);
  if(new Set(s.agents.map(a=>a.id)).size!==s.agents.length||new Set(s.agents.map(a=>a.sessionId)).size!==s.agents.length||new Set(s.messages.map(m=>m.id)).size!==s.messages.length)throw new Error('Duplicate registry identity');
  return jsonSnapshot(s);
 }
 private transaction<T>(fn:(s:State)=>T):T {const release=acquireFileLock(this.file+'.lock');try{const s=this.read(),result=fn(s);atomicJson(this.file,s);return result}finally{release()}}
 saveAgent(value:PersistedAgent){const a=jsonSnapshot(value);agent(a);this.transaction(s=>{
  const previous=s.agents.find(x=>x.id===a.id);if(previous){if(!isDeepStrictEqual(previous,a))throw new Error('Agent identity conflict');return}
  if(s.agents.some(x=>x.sessionId===a.sessionId))throw new Error('Agent sessions must be independent');s.agents.push(a);
 })}
 saveMessage(value:AgentInboxMessage){const m=jsonSnapshot(value);message(m);this.transaction(s=>{
  const previous=s.messages.find(x=>x.id===m.id);if(previous){if(!isDeepStrictEqual(previous,m))throw new Error('Message ID conflict');return}
  if(s.acknowledged.includes(m.id))throw new Error('Message ID conflict with migrated tombstone');
  if(!s.agents.some(x=>x.id===m.to)||!s.agents.some(x=>x.id===m.from))throw new Error('Unknown message agent');s.messages.push(m);
 })}
 listAgents(){return this.read().agents}
 peekMessages(id:string){localId(id);const s=this.read();if(!s.agents.some(a=>a.id===id))throw new Error('Unknown agent');return s.messages.filter(m=>m.to===id&&!s.acknowledged.includes(m.id))}
 acknowledge(id:string,messageId:string){this.transaction(s=>{if(!s.messages.some(m=>m.id===messageId&&m.to===id))throw new Error('Unknown inbox message');if(!s.acknowledged.includes(messageId))s.acknowledged.push(messageId)})}
 drainMessages(id:string){return this.transaction(s=>{if(!s.agents.some(a=>a.id===id))throw new Error('Unknown agent');const rows=s.messages.filter(m=>m.to===id&&!s.acknowledged.includes(m.id));s.acknowledged.push(...rows.map(m=>m.id));return rows})}
 removeAgent(id:string){this.transaction(s=>{s.agents=s.agents.filter(a=>a.id!==id);for(const m of s.messages.filter(m=>m.to===id))if(!s.acknowledged.includes(m.id))s.acknowledged.push(m.id)})}
}
