import type {
  ComponentNode,
  ComponentNodeData,
  NodeId,
  UiGraph,
} from '@prodivix/shared/types/pir';
import type { InstantiatedUiFragment } from './fragment';
import type { GraphParentRef } from './types';
import { materializeUiTree } from './materialize';
import { normalizeTreeToUiGraph } from './normalize';

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const sameJsonValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const withoutRegions = (graph: UiGraph): Omit<UiGraph, 'regionsById'> => {
  const { regionsById: _regionsById, ...rest } = graph;
  return rest;
};

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

export const collectGraphSubtreeIds = (
  graph: UiGraph,
  nodeId: NodeId,
  ids: Set<NodeId>
) => {
  if (ids.has(nodeId)) return;
  ids.add(nodeId);
  (graph.childIdsById[nodeId] ?? []).forEach((childId) =>
    collectGraphSubtreeIds(graph, childId, ids)
  );
  Object.values(graph.regionsById?.[nodeId] ?? {}).forEach((childIds) => {
    childIds.forEach((childId) => collectGraphSubtreeIds(graph, childId, ids));
  });
};

export const removeNode = (graph: UiGraph, nodeId: NodeId): UiGraph => {
  if (nodeId === graph.rootId || !graph.nodesById[nodeId]) return graph;
  const parentMap = getParentMap(graph);
  const parent = parentMap[nodeId];
  if (!parent) return graph;
  const idsToRemove = new Set<NodeId>();
  collectGraphSubtreeIds(graph, nodeId, idsToRemove);

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
    ...withoutRegions(graph),
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

const collectDefaultSubtreeIds = (
  graph: UiGraph,
  nodeId: NodeId,
  ids: Set<NodeId>
) => {
  if (ids.has(nodeId)) return;
  ids.add(nodeId);
  (graph.childIdsById[nodeId] ?? []).forEach((childId) =>
    collectDefaultSubtreeIds(graph, childId, ids)
  );
};

const collectRemovedSubtreeIds = (
  graph: UiGraph,
  nodeId: NodeId,
  retainedIds: ReadonlySet<NodeId>,
  removedIds: Set<NodeId>
) => {
  if (retainedIds.has(nodeId) || removedIds.has(nodeId)) return;
  removedIds.add(nodeId);
  (graph.childIdsById[nodeId] ?? []).forEach((childId) =>
    collectRemovedSubtreeIds(graph, childId, retainedIds, removedIds)
  );
  Object.values(graph.regionsById?.[nodeId] ?? {}).forEach((childIds) => {
    childIds.forEach((childId) =>
      collectRemovedSubtreeIds(graph, childId, retainedIds, removedIds)
    );
  });
};

/**
 * Applies a Blueprint subtree updater as a scoped graph mutation.
 *
 * The default-children subtree is materialized only for the updater contract;
 * the result patches `nodesById` and `childIdsById` while retaining named
 * regions for every surviving owner.
 */
export const updateUiGraphSubtree = (
  graph: UiGraph,
  nodeId: NodeId,
  updater: (root: ComponentNode) => ComponentNode
): { graph: UiGraph; changed: boolean } => {
  if (!graph.nodesById[nodeId]) return { graph, changed: false };

  const currentRoot = materializeUiTree({ ...graph, rootId: nodeId });
  const nextRoot = updater(currentRoot);
  if (nextRoot.id !== nodeId) return { graph, changed: false };

  const normalized = normalizeTreeToUiGraph(nextRoot);
  const currentDefaultIds = new Set<NodeId>();
  collectDefaultSubtreeIds(graph, nodeId, currentDefaultIds);
  const nextIds = new Set(Object.keys(normalized.nodesById));
  const conflictsWithExternalNode = [...nextIds].some(
    (id) => !currentDefaultIds.has(id) && Boolean(graph.nodesById[id])
  );
  if (conflictsWithExternalNode) return { graph, changed: false };

  const removedIds = new Set<NodeId>();
  currentDefaultIds.forEach((id) => {
    if (!nextIds.has(id)) {
      collectRemovedSubtreeIds(graph, id, nextIds, removedIds);
    }
  });

  const nodesById = { ...graph.nodesById };
  removedIds.forEach((id) => delete nodesById[id]);
  Object.entries(normalized.nodesById).forEach(([id, node]) => {
    nodesById[id] = cloneJson(node);
  });

  const childIdsById: UiGraph['childIdsById'] = {};
  Object.entries(graph.childIdsById).forEach(([id, childIds]) => {
    if (removedIds.has(id)) return;
    childIdsById[id] = childIds.filter((childId) => !removedIds.has(childId));
  });
  Object.entries(normalized.childIdsById).forEach(([id, childIds]) => {
    childIdsById[id] = [...childIds];
  });

  const regionsById: NonNullable<UiGraph['regionsById']> = {};
  Object.entries(graph.regionsById ?? {}).forEach(([id, regions]) => {
    if (removedIds.has(id)) return;
    regionsById[id] = Object.fromEntries(
      Object.entries(regions).map(([name, childIds]) => [
        name,
        childIds.filter((childId) => !removedIds.has(childId)),
      ])
    );
  });

  const nextGraph: UiGraph = {
    ...withoutRegions(graph),
    nodesById,
    childIdsById,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
  };
  return sameJsonValue(graph, nextGraph)
    ? { graph, changed: false }
    : { graph: nextGraph, changed: true };
};

/**
 * Clones a complete graph subtree, including every named-region descendant,
 * into an insertion-ready fragment with newly allocated node identities.
 */
export const instantiateUiGraphSubtreeClone = (
  graph: UiGraph,
  nodeId: NodeId,
  createId: (type: string) => NodeId
): InstantiatedUiFragment | null => {
  if (!graph.nodesById[nodeId]) return null;
  const sourceIds = new Set<NodeId>();
  collectGraphSubtreeIds(graph, nodeId, sourceIds);
  const idMap = new Map<NodeId, NodeId>();
  const allocatedIds = new Set<NodeId>();

  for (const sourceId of sourceIds) {
    const source = graph.nodesById[sourceId];
    if (!source) return null;
    const clonedId = createId(source.type).trim();
    if (!clonedId || graph.nodesById[clonedId] || allocatedIds.has(clonedId)) {
      return null;
    }
    allocatedIds.add(clonedId);
    idMap.set(sourceId, clonedId);
  }

  const nodesById: Record<NodeId, ComponentNodeData> = {};
  const childIdsById: Record<NodeId, NodeId[]> = {};
  const regionsById: NonNullable<UiGraph['regionsById']> = {};
  for (const sourceId of sourceIds) {
    const clonedId = idMap.get(sourceId)!;
    nodesById[clonedId] = {
      ...cloneJson(graph.nodesById[sourceId]!),
      id: clonedId,
    };
    childIdsById[clonedId] = (graph.childIdsById[sourceId] ?? []).map(
      (childId) => idMap.get(childId)!
    );
    const sourceRegions = graph.regionsById?.[sourceId];
    if (sourceRegions) {
      regionsById[clonedId] = Object.fromEntries(
        Object.entries(sourceRegions).map(([name, childIds]) => [
          name,
          childIds.map((childId) => idMap.get(childId)!),
        ])
      );
    }
  }

  const clonedRootId = idMap.get(nodeId)!;
  return Object.freeze({
    rootIds: Object.freeze([clonedRootId]),
    primaryNodeId: clonedRootId,
    nodesById: Object.freeze(nodesById),
    childIdsById: Object.freeze(childIdsById),
    ...(Object.keys(regionsById).length > 0
      ? { regionsById: Object.freeze(regionsById) }
      : {}),
    localToNodeId: Object.freeze(Object.fromEntries(idMap)),
  });
};
