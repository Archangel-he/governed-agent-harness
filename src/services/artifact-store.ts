import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, linkSync, unlinkSync, fsyncSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ArtifactRef } from '../contracts/artifact.js';
import { missing } from './local-file.js';
const hashOf=(content:Buffer)=>createHash('sha256').update(content).digest('hex');
export class LocalArtifactStore {
 constructor(private readonly root:string){mkdirSync(root,{recursive:true});this.root=resolve(root)}
 private file(hash:string){if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('Invalid artifact hash');return join(this.root,hash)}
 async put(content:Buffer,mediaType:string):Promise<ArtifactRef>{
  if(!Buffer.isBuffer(content)||typeof mediaType!=='string'||!mediaType)throw new Error('Invalid artifact');
  const bytes=Buffer.from(content),hash=hashOf(bytes),file=this.file(hash);
  if(existsSync(file)){await this.get(hash);return{hash,mediaType,size:bytes.length}}
  const temp=file+'.'+randomUUID()+'.tmp';
  try{
   const fd=openSync(temp,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd)}finally{closeSync(fd)}
   try{linkSync(temp,file)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await this.get(hash)}
  }finally{try{unlinkSync(temp)}catch(error){if(!missing(error))throw error}}
  return{hash,mediaType,size:bytes.length};
 }
 async get(hash:string){try{const bytes=readFileSync(this.file(hash));if(hashOf(bytes)!==hash)throw new Error('Artifact integrity failure');return bytes}catch(error){if(missing(error))return undefined;throw error}}
 async has(hash:string){return (await this.get(hash))!==undefined}
}
