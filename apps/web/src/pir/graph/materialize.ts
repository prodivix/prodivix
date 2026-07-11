import type {
  ComponentNode,
  ComponentNodeData,
  PIRDocument,
  NodeId,
  UiGraph,
} from '@prodivix/shared/types/pir';

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const toComponentNode = (data: ComponentNodeData): ComponentNode =>
  cloneJson(data) as ComponentNode;

export const materializeUiTree = (graph: UiGraph): ComponentNode => {
  const visiting = new Set<NodeId>();

  const visit = (nodeId: NodeId): ComponentNode => {
    if (visiting.has(nodeId)) {
      throw new Error(`PIR graph contains a cycle at node "${nodeId}".`);
    }
    const nodeData = graph.nodesById[nodeId];
    if (!nodeData) {
      throw new Error(`PIR graph references missing node "${nodeId}".`);
    }
    visiting.add(nodeId);
    const node = toComponentNode(nodeData);
    const childIds = graph.childIdsById[nodeId] ?? [];
    const children = childIds.map((childId) => visit(childId));
    visiting.delete(nodeId);
    if (children.length) {
      node.children = children;
    } else {
      delete node.children;
    }
    return node;
  };

  return visit(graph.rootId);
};

export const materializePirRoot = (doc: PIRDocument): ComponentNode =>
  materializeUiTree(doc.ui.graph);
