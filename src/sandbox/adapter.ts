import { mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, relative, isAbsolute, sep, join } from 'node:path';

export interface SandboxSpec {
  id:string; root:string; network:'none'|'restricted'|'full';
  timeoutMs?:number; maxOutputBytes?:number; memoryMb?:number; cpus?:number; pidsLimit?:number;
}
export interface SandboxAdapter { create(spec:SandboxSpec):SandboxHandle }
export interface SandboxRunResult { code:number|null; signal:NodeJS.Signals|null; stdout:string; stderr:string }
export interface SandboxHandle {
  readonly spec:SandboxSpec;
  resolve(path:string):string;
  run(command:string,args?:string[],options?:{signal?:AbortSignal}):Promise<SandboxRunResult>;
  dispose():Promise<void>;
}
function safeRoot(root:string,path:string):string {
  const target=resolve(root,path), rel=relative(root,target);
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)) throw new Error('sandbox path escape');
  let part=root;
  for(const segment of rel.split(sep).filter(Boolean)) {
    part=join(part,segment);
    try {if(lstatSync(part).isSymbolicLink()) throw new Error('sandbox symlink denied');}
    catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;}
  }
  return target;
}
function createHandle(input:SandboxSpec,docker:boolean):SandboxHandle {
  const spec=Object.freeze({...input});
  if(!['none','restricted','full'].includes(spec.network)) throw new Error('Invalid network policy');
  if(docker&&spec.network==='restricted') throw new Error('Docker restricted network policy unavailable');
  if(!docker&&spec.network!=='full') throw new Error('LocalSandboxAdapter cannot isolate network');
  const timeout=spec.timeoutMs??60_000, limit=spec.maxOutputBytes??1_048_576;
  const memory=spec.memoryMb??512, cpus=spec.cpus??1, pids=spec.pidsLimit??128;
  for(const [key,value] of Object.entries({timeout,limit,memory,cpus,pids}))
    if(!Number.isFinite(value)||value<=0||(key!=='cpus'&&!Number.isSafeInteger(value))) throw new Error('Invalid sandbox '+key);
  if(docker&&spawnSync('docker',['info'],{stdio:'ignore',windowsHide:true,timeout:10_000}).status!==0) throw new Error('Docker daemon unavailable');
  mkdirSync(spec.root,{recursive:true});
  const root=realpathSync(spec.root);
  if(docker&&root.includes(',')) throw new Error('Docker mount path cannot contain comma');
  let disposed=false;
  const active=new Set<{stop:(error:Error)=>void;done:Promise<unknown>}>();
  return {
    spec,resolve:path=>safeRoot(root,path),
    async run(command,args=[],options={}) {
      if(disposed) throw new Error('Sandbox disposed');
      if(options.signal?.aborted) throw new Error('Sandbox cancelled');
      if(!command||command.includes('\0')||args.some(arg=>arg.includes('\0'))) throw new Error('Invalid sandbox command');
      const name='gah-'+randomUUID();
      const argv=docker?['run','--rm','--name',name,'--network',spec.network==='none'?'none':'bridge',
        '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',memory+'m',
        '--cpus',String(cpus),'--pids-limit',String(pids),'--tmpfs','/tmp:rw,noexec,nosuid,size=64m',
        '--mount',`type=bind,source=${root},target=/workspace`,'-w','/workspace','node:22-alpine',command,...args]:args;
      const child=spawn(docker?'docker':command,argv,{cwd:root,windowsHide:true});
      let failure:Error|undefined, bytes=0;
      const stdout:Buffer[]=[],stderr:Buffer[]=[];
      let cleanup:Promise<void>=Promise.resolve();
      const stop=(error:Error)=>{
        if(failure) return;
        failure=error;
        cleanup=docker?new Promise<void>(resolveCleanup=>{
          const remover=spawn('docker',['rm','-f',name],{stdio:'ignore',windowsHide:true});
          const killTimer=setTimeout(()=>remover.kill(),10_000);
          const finish=()=>{clearTimeout(killTimer);child.kill();resolveCleanup()};
          remover.once('error',finish);remover.once('close',finish);
        }):Promise.resolve().then(()=>{child.kill()});
      };
      const timer=setTimeout(()=>stop(new Error('Sandbox timeout')),timeout);
      const abort=()=>stop(new Error('Sandbox cancelled'));
      options.signal?.addEventListener('abort',abort,{once:true});
      const capture=(chunks:Buffer[],data:Buffer)=>{
        bytes+=data.length;
        if(bytes>limit) stop(new Error('Sandbox output limit exceeded'));
        else chunks.push(data);
      };
      child.stdout.on('data',(data:Buffer)=>capture(stdout,data));
      child.stderr.on('data',(data:Buffer)=>capture(stderr,data));
      const done=new Promise<SandboxRunResult>((resolveRun,reject)=>{
        child.once('error',error=>{failure=error});
        child.once('close',async(code,signal)=>{
          clearTimeout(timer);options.signal?.removeEventListener('abort',abort);
          await cleanup;
          if(failure) reject(failure);
          else resolveRun({code,signal,stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()});
        });
      });
      const entry={stop,done};active.add(entry);
      if(options.signal?.aborted) abort();
      try{return await done}finally{active.delete(entry)}
    },
    async dispose(){disposed=true;for(const entry of active)entry.stop(new Error('Sandbox disposed'));await Promise.allSettled([...active].map(entry=>entry.done))},
  };
}
/** Trusted local execution only; use DockerSandboxAdapter for OS isolation. */
export class LocalSandboxAdapter implements SandboxAdapter {create(spec:SandboxSpec){return createHandle(spec,false)}}
export class DockerSandboxAdapter implements SandboxAdapter {create(spec:SandboxSpec){return createHandle(spec,true)}}
