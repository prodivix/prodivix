import {
  createPirProjectionRootPath,
  type PIRDocument,
  type PIRGraphPlacementTarget,
  type PIRNode,
  type PIRUiGraph,
  type PIRValueBinding,
} from '@prodivix/pir';
import type {
  PIRRenderLocation,
  PIRRenderRole,
} from '@prodivix/pir-react-renderer';

export type TreeDropPlacement = 'before' | 'after' | 'child';

export type BlueprintTreeProjectionNode = Readonly<{
  location: PIRRenderLocation;
  node: PIRNode;
  regionName?: string;
  children: readonly BlueprintTreeProjectionNode[];
}>;

export const getTreeDropPlacement = (options: {
  canNest: boolean;
  overTop: number;
  overHeight: number;
  activeCenterY: number;
}): TreeDropPlacement => {
  const { canNest, overTop, overHeight, activeCenterY } = options;
  if (
    !Number.isFinite(overTop) ||
    !Number.isFinite(overHeight) ||
    overHeight <= 0 ||
    !Number.isFinite(activeCenterY)
  ) {
    return 'after';
  }

  const ratio = Math.max(
    0,
    Math.min(1, (activeCenterY - overTop) / overHeight)
  );
  if (!canNest) return ratio < 1 / 2 ? 'before' : 'after';
  if (ratio < 1 / 3) return 'before';
  if (ratio > 2 / 3) return 'after';
  return 'child';
};

export const isSamePirRenderLocation = (
  left: PIRRenderLocation | undefined,
  right: PIRRenderLocation | undefined
): boolean =>
  Boolean(
    left &&
    right &&
    left.documentId === right.documentId &&
    left.nodeId === right.nodeId &&
    left.instancePath === right.instancePath &&
    left.role === right.role
  );

export const pirRenderLocationKey = (location: PIRRenderLocation): string =>
  JSON.stringify([
    location.documentId,
    location.nodeId,
    location.instancePath,
    location.role,
  ]);

export const createBlueprintRootLocation = (
  documentId: string,
  document: PIRDocument,
  role: PIRRenderRole = 'source'
): PIRRenderLocation =>
  Object.freeze({
    documentId,
    nodeId: document.ui.graph.rootId,
    instancePath: createPirProjectionRootPath(documentId),
    role,
  });

/** Builds the component-tree read model without recreating a saved tree. */
export const createBlueprintTreeProjection = (
  documentId: string,
  document: PIRDocument,
  options: Readonly<{
    instancePath?: string;
    role?: PIRRenderRole;
  }> = {}
): BlueprintTreeProjectionNode | null => {
  const graph = document.ui.graph;
  const rootLocation = createBlueprintRootLocation(
    documentId,
    document,
    options.role
  );
  const instancePath = options.instancePath ?? rootLocation.instancePath;
  const role = rootLocation.role;
  const visiting = new Set<string>();

  const build = (
    nodeId: string,
    regionName?: string
  ): BlueprintTreeProjectionNode | null => {
    const node = graph.nodesById[nodeId];
    if (!node || visiting.has(nodeId)) return null;
    visiting.add(nodeId);
    const directChildren = (graph.childIdsById[nodeId] ?? []).map((childId) =>
      build(childId)
    );
    const regionChildren = Object.entries(graph.regionsById?.[nodeId] ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([region, childIds]) =>
        childIds.map((childId) => build(childId, region))
      );
    visiting.delete(nodeId);
    return Object.freeze({
      location: Object.freeze({ documentId, nodeId, instancePath, role }),
      node,
      ...(regionName ? { regionName } : {}),
      children: Object.freeze(
        [...directChildren, ...regionChildren].filter(
          (child): child is BlueprintTreeProjectionNode => Boolean(child)
        )
      ),
    });
  };

  return build(graph.rootId);
};

export const findNodeById = (
  graph: PIRUiGraph,
  nodeId: string
): PIRNode | null => graph.nodesById[nodeId] ?? null;

export const findNodePlacement = (
  graph: PIRUiGraph,
  nodeId: string
): PIRGraphPlacementTarget | null => {
  for (const [parentId, childIds] of Object.entries(graph.childIdsById)) {
    const index = childIds.indexOf(nodeId);
    if (index >= 0) return { parentId, index };
  }
  for (const [parentId, regions] of Object.entries(graph.regionsById ?? {})) {
    for (const [regionName, childIds] of Object.entries(regions)) {
      const index = childIds.indexOf(nodeId);
      if (index >= 0) return { parentId, regionName, index };
    }
  }
  return null;
};

export const resolveChildEndPlacement = (
  graph: PIRUiGraph,
  nodeId: string
): PIRGraphPlacementTarget | null => {
  const node = graph.nodesById[nodeId];
  if (!node) return null;
  if (node.kind === 'collection') {
    const itemIds = graph.regionsById?.[nodeId]?.item;
    return itemIds
      ? { parentId: nodeId, regionName: 'item', index: itemIds.length }
      : null;
  }
  if (node.kind === 'component-instance') {
    const [regionName] = Object.keys(graph.regionsById?.[nodeId] ?? {}).sort();
    return regionName
      ? {
          parentId: nodeId,
          regionName,
          index: graph.regionsById?.[nodeId]?.[regionName]?.length ?? 0,
        }
      : null;
  }
  return {
    parentId: nodeId,
    index: graph.childIdsById[nodeId]?.length ?? 0,
  };
};

export const isAncestorOf = (
  graph: PIRUiGraph,
  ancestorId: string,
  targetId: string
): boolean => {
  if (ancestorId === targetId) return true;
  const visited = new Set<string>();
  const pending = [ancestorId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    const childIds = [
      ...(graph.childIdsById[nodeId] ?? []),
      ...Object.values(graph.regionsById?.[nodeId] ?? {}).flat(),
    ];
    if (childIds.includes(targetId)) return true;
    pending.push(...childIds);
  }
  return false;
};

export const supportsChildrenForNode = (
  graph: PIRUiGraph,
  nodeId: string
): boolean => resolveChildEndPlacement(graph, nodeId) !== null;

export const readLiteralBinding = (
  binding: PIRValueBinding | undefined
): unknown => (binding?.kind === 'literal' ? binding.value : undefined);

export const readElementLiteralProp = (
  node: PIRNode,
  propName: string
): unknown =>
  node.kind === 'element'
    ? readLiteralBinding(node.props?.[propName])
    : undefined;

export const getBlueprintNodeTypeLabel = (node: PIRNode): string => {
  if (node.kind === 'element') return node.type;
  if (node.kind === 'component-instance') return 'Component Instance';
  if (node.kind === 'component-slot-outlet') return 'Slot Outlet';
  return 'Collection';
};
