import type {
  ComponentNodeData,
  NodeId,
  UiGraph,
} from '@prodivix/shared/types/pir';

export type InstantiatedUiFragment = Readonly<{
  rootIds: readonly NodeId[];
  primaryNodeId: NodeId;
  nodesById: Readonly<Record<NodeId, ComponentNodeData>>;
  childIdsById: Readonly<Record<NodeId, readonly NodeId[]>>;
  regionsById?: Readonly<
    Record<NodeId, Readonly<Record<string, readonly NodeId[]>>>
  >;
  localToNodeId: Readonly<Record<string, NodeId>>;
}>;

export type UiGraphFragmentInsertionTarget = Readonly<{
  parentId: NodeId;
  index: number;
  regionName?: string;
}>;

type UiGraphFragmentInsertionResult =
  | Readonly<{ ok: true; graph: UiGraph }>
  | Readonly<{ ok: false; reason: string }>;

const duplicate = (values: readonly string[]): boolean =>
  new Set(values).size !== values.length;

export const insertUiGraphFragment = (
  graph: UiGraph,
  fragment: InstantiatedUiFragment,
  target: UiGraphFragmentInsertionTarget
): UiGraphFragmentInsertionResult => {
  const nodeIds = Object.keys(fragment.nodesById);
  if (
    nodeIds.length === 0 ||
    fragment.rootIds.length === 0 ||
    duplicate(fragment.rootIds) ||
    !fragment.nodesById[fragment.primaryNodeId]
  ) {
    return { ok: false, reason: 'Fragment identity is invalid.' };
  }
  if (!graph.nodesById[target.parentId]) {
    return { ok: false, reason: 'Fragment insertion parent does not exist.' };
  }
  if (nodeIds.some((nodeId) => graph.nodesById[nodeId])) {
    return {
      ok: false,
      reason: 'Fragment node id conflicts with the document.',
    };
  }
  if (fragment.rootIds.some((rootId) => !fragment.nodesById[rootId])) {
    return { ok: false, reason: 'Fragment root does not exist.' };
  }

  const parents = new Map<string, string>();
  const registerEdges = (
    ownerId: string,
    childIds: readonly string[]
  ): string | undefined => {
    if (!fragment.nodesById[ownerId] || duplicate(childIds)) {
      return 'Fragment edge owner or ordering is invalid.';
    }
    for (const childId of childIds) {
      if (!fragment.nodesById[childId] || parents.has(childId)) {
        return 'Fragment child reference or parent ownership is invalid.';
      }
      parents.set(childId, ownerId);
    }
    return undefined;
  };
  for (const [ownerId, childIds] of Object.entries(fragment.childIdsById)) {
    const issue = registerEdges(ownerId, childIds);
    if (issue) return { ok: false, reason: issue };
  }
  for (const [ownerId, regions] of Object.entries(fragment.regionsById ?? {})) {
    for (const childIds of Object.values(regions)) {
      const issue = registerEdges(ownerId, childIds);
      if (issue) return { ok: false, reason: issue };
    }
  }
  const roots = new Set(fragment.rootIds);
  if (
    nodeIds.some((nodeId) =>
      roots.has(nodeId) ? parents.has(nodeId) : !parents.has(nodeId)
    )
  ) {
    return {
      ok: false,
      reason: 'Fragment contains a root parent or orphan node.',
    };
  }

  const nodesById = { ...graph.nodesById };
  nodeIds.forEach((nodeId) => {
    nodesById[nodeId] = { ...fragment.nodesById[nodeId]!, id: nodeId };
  });
  const childIdsById: UiGraph['childIdsById'] = {
    ...graph.childIdsById,
  };
  Object.entries(fragment.childIdsById).forEach(([nodeId, childIds]) => {
    childIdsById[nodeId] = [...childIds];
  });
  nodeIds.forEach((nodeId) => {
    childIdsById[nodeId] ??= [];
  });
  const regionsById: NonNullable<UiGraph['regionsById']> = {};
  Object.entries(graph.regionsById ?? {}).forEach(([nodeId, regions]) => {
    regionsById[nodeId] = Object.fromEntries(
      Object.entries(regions).map(([name, childIds]) => [name, [...childIds]])
    );
  });
  Object.entries(fragment.regionsById ?? {}).forEach(([nodeId, regions]) => {
    regionsById[nodeId] = Object.fromEntries(
      Object.entries(regions).map(([name, childIds]) => [name, [...childIds]])
    );
  });

  const currentTargetIds = target.regionName
    ? (regionsById[target.parentId]?.[target.regionName] ?? [])
    : (childIdsById[target.parentId] ?? []);
  const index = Math.max(0, Math.min(target.index, currentTargetIds.length));
  const nextTargetIds = [
    ...currentTargetIds.slice(0, index),
    ...fragment.rootIds,
    ...currentTargetIds.slice(index),
  ];
  if (target.regionName) {
    regionsById[target.parentId] = {
      ...(regionsById[target.parentId] ?? {}),
      [target.regionName]: nextTargetIds,
    };
  } else {
    childIdsById[target.parentId] = nextTargetIds;
  }

  return {
    ok: true,
    graph: {
      ...graph,
      nodesById,
      childIdsById,
      ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
    },
  };
};
