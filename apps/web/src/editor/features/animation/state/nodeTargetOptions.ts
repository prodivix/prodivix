import type { PIRDocument, PIRNode } from '@prodivix/pir';

export type NodeTargetOption = Readonly<{
  id: string;
  label: string;
}>;

const describeNode = (node: PIRNode): string =>
  node.kind === 'element' ? node.type : node.kind;

/** Reads animation targets directly from the canonical normalized PIR graph. */
export const collectNodeTargets = (
  document: PIRDocument
): NodeTargetOption[] => {
  const { graph } = document.ui;
  const options: NodeTargetOption[] = [];
  const visited = new Set<string>();
  const walk = (nodeId: string, depth: number): void => {
    if (visited.has(nodeId)) return;
    const node = graph.nodesById[nodeId];
    if (!node) return;
    visited.add(nodeId);
    options.push({
      id: node.id,
      label: `${'  '.repeat(depth)}${node.id} (${describeNode(node)})`,
    });
    for (const childId of graph.childIdsById[nodeId] ?? []) {
      walk(childId, depth + 1);
    }
    const regions = graph.regionsById?.[nodeId];
    if (!regions) return;
    for (const regionName of Object.keys(regions).sort()) {
      for (const childId of regions[regionName] ?? []) {
        walk(childId, depth + 1);
      }
    }
  };
  walk(graph.rootId, 0);
  return options;
};
