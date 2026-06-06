import type {
  ComponentNode,
  ComponentNodeData,
  NodeId,
  UiGraph,
} from '@/core/types/engine.types';
import type { GraphParentRef } from './types';
import { normalizeTreeToUiGraph } from './normalize';

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const withoutChildren = (node: ComponentNode): ComponentNodeData => {
  const { children: _children, ...data } = cloneJson(node);
  return data;
};

export const getNode = (
  graph: UiGraph,
  nodeId: NodeId
): ComponentNodeData | undefined => graph.nodesById[nodeId];

export const getChildren = (graph: UiGraph, parentId: NodeId): NodeId[] =>
  graph.childIdsById[parentId] ?? [];

export const getParentMap = (
  graph: UiGraph
): Record<NodeId, GraphParentRef> => {
  const result: Record<NodeId, GraphParentRef> = {};
  Object.entries(graph.childIdsById).forEach(([parentId, childIds]) => {
    childIds.forEach((childId, index) => {
      result[childId] = { parentId, index };
    });
  });
  Object.entries(graph.regionsById ?? {}).forEach(([parentId, regions]) => {
    Object.entries(regions).forEach(([regionName, childIds]) => {
      childIds.forEach((childId, index) => {
        result[childId] = { parentId, regionName, index };
      });
    });
  });
  return result;
};

export const updateNode = (
  graph: UiGraph,
  nodeId: NodeId,
  updater: (node: ComponentNodeData) => ComponentNodeData
): UiGraph => {
  const current = graph.nodesById[nodeId];
  if (!current) return graph;
  const nextNode = updater(cloneJson(current));
  return {
    ...graph,
    nodesById: {
      ...graph.nodesById,
      [nodeId]: { ...nextNode, id: nodeId },
    },
  };
};

export const insertNode = (
  graph: UiGraph,
  parentId: NodeId,
  node: ComponentNode,
  index?: number
): UiGraph => {
  if (!graph.nodesById[parentId]) return graph;
  const subtree = normalizeTreeToUiGraph(node);
  const childIds = graph.childIdsById[parentId] ?? [];
  const insertIndex =
    typeof index === 'number'
      ? Math.max(0, Math.min(index, childIds.length))
      : childIds.length;
  return {
    ...graph,
    nodesById: {
      ...graph.nodesById,
      ...subtree.nodesById,
    },
    childIdsById: {
      ...graph.childIdsById,
      ...subtree.childIdsById,
      [parentId]: [
        ...childIds.slice(0, insertIndex),
        subtree.rootId,
        ...childIds.slice(insertIndex),
      ],
    },
    regionsById: {
      ...(graph.regionsById ?? {}),
      ...(subtree.regionsById ?? {}),
    },
  };
};

const collectSubtreeIds = (
  graph: UiGraph,
  nodeId: NodeId,
  ids: Set<NodeId>
) => {
  if (ids.has(nodeId)) return;
  ids.add(nodeId);
  (graph.childIdsById[nodeId] ?? []).forEach((childId) =>
    collectSubtreeIds(graph, childId, ids)
  );
  Object.values(graph.regionsById?.[nodeId] ?? {}).forEach((childIds) => {
    childIds.forEach((childId) => collectSubtreeIds(graph, childId, ids));
  });
};

export const removeNode = (graph: UiGraph, nodeId: NodeId): UiGraph => {
  if (nodeId === graph.rootId || !graph.nodesById[nodeId]) return graph;
  const parentMap = getParentMap(graph);
  const parent = parentMap[nodeId];
  if (!parent) return graph;
  const idsToRemove = new Set<NodeId>();
  collectSubtreeIds(graph, nodeId, idsToRemove);

  const nodesById = { ...graph.nodesById };
  const childIdsById = { ...graph.childIdsById };
  const regionsById = graph.regionsById ? cloneJson(graph.regionsById) : {};
  idsToRemove.forEach((id) => {
    delete nodesById[id];
    delete childIdsById[id];
    delete regionsById[id];
  });

  if (parent.regionName) {
    const regions = regionsById[parent.parentId] ?? {};
    regionsById[parent.parentId] = {
      ...regions,
      [parent.regionName]: (regions[parent.regionName] ?? []).filter(
        (id) => id !== nodeId
      ),
    };
  } else {
    childIdsById[parent.parentId] = (
      childIdsById[parent.parentId] ?? []
    ).filter((id) => id !== nodeId);
  }

  return {
    ...graph,
    nodesById,
    childIdsById,
    ...(Object.keys(regionsById).length ? { regionsById } : {}),
  };
};

export const moveNode = (
  graph: UiGraph,
  nodeId: NodeId,
  targetParentId: NodeId,
  index: number
): UiGraph => {
  if (
    nodeId === graph.rootId ||
    !graph.nodesById[nodeId] ||
    !graph.nodesById[targetParentId]
  ) {
    return graph;
  }
  const parentMap = getParentMap(graph);
  const parent = parentMap[nodeId];
  if (!parent || parent.regionName) return graph;
  const sourceChildren = graph.childIdsById[parent.parentId] ?? [];
  const targetChildren =
    parent.parentId === targetParentId
      ? sourceChildren.filter((id) => id !== nodeId)
      : (graph.childIdsById[targetParentId] ?? []);
  const nextIndex = Math.max(0, Math.min(index, targetChildren.length));
  return {
    ...graph,
    childIdsById: {
      ...graph.childIdsById,
      [parent.parentId]: sourceChildren.filter((id) => id !== nodeId),
      [targetParentId]: [
        ...targetChildren.slice(0, nextIndex),
        nodeId,
        ...targetChildren.slice(nextIndex),
      ],
    },
  };
};

export const renameNodeId = (
  graph: UiGraph,
  fromId: NodeId,
  toId: NodeId
): UiGraph => {
  const nextId = toId.trim();
  if (!nextId || fromId === nextId || !graph.nodesById[fromId]) return graph;
  if (graph.nodesById[nextId]) return graph;
  const nodesById = { ...graph.nodesById };
  nodesById[nextId] = { ...nodesById[fromId], id: nextId };
  delete nodesById[fromId];
  const replace = (ids: NodeId[]) =>
    ids.map((id) => (id === fromId ? nextId : id));
  const childIdsById: Record<NodeId, NodeId[]> = {};
  Object.entries(graph.childIdsById).forEach(([parentId, childIds]) => {
    childIdsById[parentId === fromId ? nextId : parentId] = replace(childIds);
  });
  const regionsById: UiGraph['regionsById'] = graph.regionsById
    ? {}
    : undefined;
  if (graph.regionsById && regionsById) {
    Object.entries(graph.regionsById).forEach(([parentId, regions]) => {
      const nextRegions: Record<string, NodeId[]> = {};
      Object.entries(regions).forEach(([regionName, childIds]) => {
        nextRegions[regionName] = replace(childIds);
      });
      regionsById[parentId === fromId ? nextId : parentId] = nextRegions;
    });
  }
  return {
    ...graph,
    rootId: graph.rootId === fromId ? nextId : graph.rootId,
    nodesById,
    childIdsById,
    ...(regionsById ? { regionsById } : {}),
  };
};

export const replaceGraphWithMaterializedRoot = (
  graph: UiGraph,
  root: ComponentNode
): UiGraph => ({
  ...normalizeTreeToUiGraph(root),
  rootId:
    graph.rootId === root.id ? root.id : normalizeTreeToUiGraph(root).rootId,
});
