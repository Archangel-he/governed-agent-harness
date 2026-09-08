import { validateTopology, type TopologyDefinition } from './schema.js';

export interface CompiledTopology {
  topology: TopologyDefinition;
  stages: string[][];
}

export function compileTopology(topology: TopologyDefinition): CompiledTopology {
  const report = validateTopology(topology);
  if (!report.ok) throw new Error(report.errors.join('; '));
  const ids = topology.nodes.map(node => node.id);
  const incoming = new Map(ids.map(id => [id, 0]));
  const outgoing = new Map(ids.map(id => [id, [] as string[]]));
  for (const edge of topology.edges) {
    if (edge.kind === 'control' && edge.from === edge.to) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }
  const stages: string[][] = [];
  let ready = ids.filter(id => incoming.get(id) === 0).sort();
  let visited = 0;
  while (ready.length) {
    stages.push(ready);
    visited += ready.length;
    const next: string[] = [];
    for (const id of ready) for (const target of outgoing.get(id)!) {
      const count = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, count);
      if (count === 0) next.push(target);
    }
    ready = next.sort();
  }
  if (visited !== ids.length) throw new Error('topology contains a cycle');
  return { topology, stages };
}
