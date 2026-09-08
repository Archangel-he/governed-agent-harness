export type NodeKind = 'capability' | 'control' | 'kernel' | 'tool' | 'validation' | 'governance';
export type EdgeKind = 'data' | 'control' | 'dependency' | 'observation';

export interface TopologyNode {
  id: string;
  kind: NodeKind;
  seatId?: string;
  pluginId?: string;
  pluginVersion?: string;
  config?: Record<string, unknown>;
}

export interface TopologyEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  when?: string;
}

export interface TopologyDefinition {
  id: string;
  version: string;
  entry: string[];
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTopology(topology: TopologyDefinition): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const node of topology.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  for (const entry of topology.entry) {
    if (!ids.has(entry)) errors.push(`missing entry node: ${entry}`);
  }
  for (const edge of topology.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      errors.push(`missing edge endpoint: ${edge.from} -> ${edge.to}`);
    }
    if (edge.from === edge.to && edge.kind !== 'control') warnings.push(`self-loop is only supported as control: ${edge.from}`);
  }
  if (topology.entry.length === 0) errors.push('topology requires an entry node');
  return { ok: errors.length === 0, errors, warnings };
}
