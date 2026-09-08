import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { jsonSnapshot } from './log-value.js';
export const missing=(error:unknown)=>(error as NodeJS.ErrnoException).code==='ENOENT';
export function localId(id:string):string {if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)||id.includes('..'))throw new Error('Invalid ID');return id}
function held():NodeJS.ErrnoException {return Object.assign(new Error('EEXIST: Writer lock is held'),{code:'EEXIST'})}
/** All ownership changes use the same gate; ambiguous gate ownership fails closed. */
export function acquireFileLock(path:string):()=>void {
 const gate=path+'.gate';let gateFd:number;
 try {gateFd=openSync(gate,'wx')}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw held();throw error}
 const token=randomUUID();
 try {
  try {
   const owner=JSON.parse(readFileSync(path,'utf8'));
   if(!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.token!=='string')throw held();
   try {process.kill(owner.pid,0);throw held()}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw held()}
   unlinkSync(path);
  }catch(error){if(!missing(error))throw error}
  const fd=openSync(path,'wx');
  try {writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fsyncSync(fd)}finally{closeSync(fd)}
 }finally{closeSync(gateFd);unlinkSync(gate)}
 let released=false;
 return ()=>{
  if(released)return;
  const owner=JSON.parse(readFileSync(path,'utf8'));
  if(owner.token!==token)throw new Error('Writer ownership changed');
  unlinkSync(path);released=true;
 };
}
export function atomicJson(file:string,value:unknown):void {
 const text=JSON.stringify(jsonSnapshot(value))+'\n',temp=file+'.'+randomUUID()+'.tmp';
 try {
  const fd=openSync(temp,'wx');try{writeFileSync(fd,text);fsyncSync(fd)}finally{closeSync(fd)}
  renameSync(temp,file);
 }finally{try{unlinkSync(temp)}catch(error){if(!missing(error))throw error}}
}
