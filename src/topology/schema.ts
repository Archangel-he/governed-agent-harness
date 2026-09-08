import { jsonSnapshot } from '../services/log-value.js';
import { validateSchema, type ValueSchema } from './value-schema.js';
export type NodeKind='capability'|'control'|'kernel'|'tool'|'validation'|'governance';
export type EdgeKind='data'|'control'|'dependency'|'observation';
export interface TopologyNode {
  id:string; kind:NodeKind; seatId?:string; pluginId?:string; pluginVersion?:string;
  config?:Record<string,unknown>; inputSchema?:ValueSchema; outputSchema?:ValueSchema;
  loop?:{maxIterations:number};
  failurePolicy?:{mode:'stop'|'continue'|'retry';maxAttempts?:number};
  required?:boolean;
}
export interface TopologyEdge {from:string;to:string;kind:EdgeKind;when?:string;port?:string}
export interface TopologyDefinition {id:string;version:string;entry:string[];nodes:TopologyNode[];edges:TopologyEdge[]}
export interface ValidationReport {ok:boolean;errors:string[];warnings:string[]}
export function freezeTopology<T>(input:T):T {
  const snapshot=jsonSnapshot(input);
  const freeze=(value:unknown):void=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}};
  freeze(snapshot);return snapshot;
}
export function validateTopology(t:TopologyDefinition):ValidationReport {
  const errors:string[]=[];
  try { jsonSnapshot(t); } catch(error) {return {ok:false,errors:['topology must be JSON-safe: '+String(error)],warnings:[]}}
  if(!t||typeof t.id!=='string'||!t.id||typeof t.version!=='string'||!t.version||!Array.isArray(t.nodes)||!Array.isArray(t.edges)||!Array.isArray(t.entry)) return {ok:false,errors:['Invalid topology envelope'],warnings:[]};
  const ids=new Set<string>();
  for(const n of t.nodes){
    if(!n||!n.id){errors.push('node id required');continue}
    if(ids.has(n.id))errors.push('duplicate node id: '+n.id);ids.add(n.id);
    if(!['capability','control','kernel','tool','validation','governance'].includes(n.kind))errors.push('Invalid node kind: '+n.id);
    if(n.loop&&(!Number.isSafeInteger(n.loop.maxIterations)||n.loop.maxIterations<1))errors.push('Invalid loop maxIterations bound: '+n.id);
    if(n.failurePolicy){
      if(!['stop','continue','retry'].includes(n.failurePolicy.mode))errors.push('Invalid failure policy');
      if(n.failurePolicy.mode==='retry'&&(!Number.isSafeInteger(n.failurePolicy.maxAttempts)||(n.failurePolicy.maxAttempts??0)<1))errors.push('retry requires bounded maxAttempts');
    }
    try {if(n.inputSchema)validateSchema(n.inputSchema);if(n.outputSchema)validateSchema(n.outputSchema)}catch(error){errors.push(n.id+': '+String(error))}
  }
  if(!t.entry.length)errors.push('topology requires an entry node');
  if(new Set(t.entry).size!==t.entry.length)errors.push('duplicate entry');
  for(const id of t.entry)if(!ids.has(id))errors.push('missing entry node: '+id);
  const edges=new Set<string>();
  for(const e of t.edges){
    if(!ids.has(e.from)||!ids.has(e.to))errors.push(`missing edge endpoint: ${e.from} -> ${e.to}`);
    if(!['data','control','dependency','observation'].includes(e.kind))errors.push('Invalid edge kind');
    const key=JSON.stringify([e.from,e.to,e.kind,e.when??null]);
    if(edges.has(key))errors.push('duplicate edge: '+key);edges.add(key);
    if(e.from===e.to&&e.kind!=='observation')errors.push('cycle: use node.loop with a finite maxIterations');
    if(e.when!==undefined&&(typeof e.when!=='string'||!e.when))errors.push('Invalid branch port');
  }
  const scheduled=t.edges.filter(e=>e.kind!=='observation');
  for(const id of t.entry)if(scheduled.some(e=>e.to===id))errors.push('entry has incoming execution edge: '+id);
  const reachable=new Set(t.entry);let change=true;
  while(change){change=false;for(const e of scheduled)if(reachable.has(e.from)&&!reachable.has(e.to)){reachable.add(e.to);change=true}}
  for(const id of ids)if(!reachable.has(id))errors.push('unreachable node: '+id);
  for(const n of t.nodes){
    const incoming=scheduled.filter(e=>e.to===n.id&&e.kind==='data');
    const ports=incoming.map(e=>e.port??e.from); if(new Set(ports).size!==ports.length) errors.push('duplicate data input port: '+n.id);
    if(incoming.length===1){const source=t.nodes.find(s=>s.id===incoming[0].from);const from=source?.outputSchema?.type,to=n.inputSchema?.type;if(from&&to&&from!==to&&!(from==='integer'&&to==='number'))errors.push('schema incompatible edge: '+incoming[0].from+' -> '+n.id)}
  }
  for(const required of t.nodes.filter(n=>n.required)) {
    const bypass=new Set(t.entry.filter(id=>id!==required.id));let changed=true;
    while(changed){changed=false;for(const e of scheduled)if(e.to!==required.id&&bypass.has(e.from)&&!bypass.has(e.to)){bypass.add(e.to);changed=true}}
    const terminals=t.nodes.filter(n=>!scheduled.some(e=>e.from===n.id));
    if(terminals.some(n=>bypass.has(n.id)))errors.push('Required node has terminal bypass: '+required.id);
    if(scheduled.some(e=>e.to===required.id&&e.when!==undefined))errors.push('Required node cannot have conditional ingress: '+required.id);
  }
  return {ok:errors.length===0,errors,warnings:[]};
}

