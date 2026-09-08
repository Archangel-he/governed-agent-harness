import {validateTopology,freezeTopology,type TopologyDefinition} from './schema.js';
export interface CompiledTopology {topology:TopologyDefinition;stages:string[][];terminals:string[]}
export function compileTopology(input:TopologyDefinition):CompiledTopology {
  const report=validateTopology(input);if(!report.ok)throw new Error(report.errors.join('; '));
  const topology=freezeTopology(input);
  const ids=topology.nodes.map(n=>n.id);
  const incoming=new Map(ids.map(id=>[id,0]));
  const outgoing=new Map(ids.map(id=>[id,[] as string[]]));
  for(const edge of topology.edges.filter(e=>e.kind!=='observation')){incoming.set(edge.to,incoming.get(edge.to)!+1);outgoing.get(edge.from)!.push(edge.to)}
  const stages:string[][]=[];let ready=ids.filter(id=>incoming.get(id)===0).sort();let seen=0;
  while(ready.length){stages.push(ready);seen+=ready.length;const next:string[]=[];for(const id of ready)for(const target of outgoing.get(id)!){incoming.set(target,incoming.get(target)!-1);if(incoming.get(target)===0)next.push(target)}ready=next.sort()}
  if(seen!==ids.length)throw new Error('topology contains a cycle');
  return {topology,stages,terminals:ids.filter(id=>outgoing.get(id)!.length===0)};
}
