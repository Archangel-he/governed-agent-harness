import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compileTopology } from '../topology/compiler.js';
import type { TopologyDefinition } from '../topology/schema.js';
import { acquireFileLock, atomicJson, localId, missing } from './local-file.js';
import { jsonSnapshot } from './log-value.js';
export interface LocalVersion { id:string; topology:TopologyDefinition; [key:string]:unknown }
export class LocalVersionStore {
 private readonly activeFile:string;
 constructor(private readonly root:string){mkdirSync(root,{recursive:true});this.activeFile=join(root,'active.json')}
 private path(id:string){localId(id);if(id==='active')throw new Error('Reserved version ID');return join(this.root,id+'.json')}
 publish(value:LocalVersion){const v=jsonSnapshot(value),file=this.path(v.id);if(!v.topology||typeof v.topology!=='object')throw new Error('Invalid version topology');compileTopology(v.topology);const release=acquireFileLock(join(this.root,'.writer.lock'));try{if(existsSync(file))throw new Error('immutable version already exists');atomicJson(file,v)}finally{release()}}
 get(id:string){const v=JSON.parse(readFileSync(this.path(id),'utf8')) as LocalVersion;if(v.id!==id||!v.topology||typeof v.topology!=='object')throw new Error('Invalid stored version');compileTopology(v.topology);return jsonSnapshot(v)}
 activate(id:string,expectedId?:string){const release=acquireFileLock(join(this.root,'.writer.lock'));try{this.get(id);let current:string|undefined;try{current=JSON.parse(readFileSync(this.activeFile,'utf8')).id}catch(error){if(!missing(error))throw error}if(expectedId!==undefined&&current!==expectedId)throw new Error('activation CAS conflict');atomicJson(this.activeFile,{id})}finally{release()}}
 active(){return this.get(JSON.parse(readFileSync(this.activeFile,'utf8')).id)}
 recordRelease(evidence:unknown):string {
  const digest=createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
  const dir=join(this.root,'releases'); mkdirSync(dir,{recursive:true});
  const file=join(dir,digest+'.json'); const release=acquireFileLock(join(this.root,'.writer.lock'));
  try { if(!existsSync(file)) atomicJson(file,evidence); } finally { release(); }
  return digest;
 }
 release(digest:string):unknown { localId(digest); return JSON.parse(readFileSync(join(this.root,'releases',digest+'.json'),'utf8')); }
 rollback(id:string){this.activate(id)}
}
