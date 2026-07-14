import type { PIRUiGraph } from '../pir.types';
import type {
  PIRExtractionSourcePlacement,
  PIRNodeRelocationFact,
} from './pirSubtreeExtraction.types';

export type PIRExtractionParentEdge = Readonly<{
  parentId: string;
  index: number;
  regionName?: string;
}>;

export type PIRCollectionSymbolOwner = Readonly<{
  nodeId: string;
  role: 'item' | 'index' | 'error';
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const collectPirExtractionSubtreeNodeIds = (
  graph: PIRUiGraph,
  rootId: string
): readonly string[] => {
  const collected = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (collected.has(nodeId)) continue;
    collected.add(nodeId);
    pending.push(...(graph.childIdsById[nodeId] ?? []));
    for (const childIds of Object.values(graph.regionsById?.[nodeId] ?? {})) {
      pending.push(...childIds);
    }
  }
  return Object.freeze([...collected].sort(compareText));
};

export const createPirExtractionParentEdges = (
  graph: PIRUiGraph
): ReadonlyMap<string, PIRExtractionParentEdge> => {
  const edges = new Map<string, PIRExtractionParentEdge>();
  for (const parentId of Object.keys(graph.childIdsById).sort(compareText)) {
    graph.childIdsById[parentId]!.forEach((childId, index) => {
      edges.set(childId, Object.freeze({ parentId, index }));
    });
  }
  for (const parentId of Object.keys(graph.regionsById ?? {}).sort(
    compareText
  )) {
    const regions = graph.regionsById?.[parentId] ?? {};
    for (const regionName of Object.keys(regions).sort(compareText)) {
      regions[regionName]!.forEach((childId, index) => {
        edges.set(childId, Object.freeze({ parentId, regionName, index }));
      });
    }
  }
  return edges;
};

export const resolvePirExtractionSourcePlacement = (
  graph: PIRUiGraph,
  subtreeRootId: string,
  parentEdges: ReadonlyMap<string, PIRExtractionParentEdge>
): PIRExtractionSourcePlacement | undefined => {
  if (subtreeRootId === graph.rootId) {
    return Object.freeze({
      kind: 'document-root',
      previousRootId: graph.rootId,
    });
  }
  const edge = parentEdges.get(subtreeRootId);
  if (!edge) return undefined;
  return edge.regionName === undefined
    ? Object.freeze({
        kind: 'default-children',
        parentId: edge.parentId,
        index: edge.index,
      })
    : Object.freeze({
        kind: 'named-region',
        parentId: edge.parentId,
        regionName: edge.regionName,
        index: edge.index,
      });
};

export const createPirCollectionSymbolOwners = (
  graph: PIRUiGraph
): ReadonlyMap<string, PIRCollectionSymbolOwner> => {
  const result = new Map<string, PIRCollectionSymbolOwner>();
  for (const nodeId of Object.keys(graph.nodesById).sort(compareText)) {
    const node = graph.nodesById[nodeId]!;
    if (node.kind !== 'collection') continue;
    result.set(node.symbols.itemId, { nodeId, role: 'item' });
    result.set(node.symbols.indexId, { nodeId, role: 'index' });
    if (node.symbols.errorId) {
      result.set(node.symbols.errorId, { nodeId, role: 'error' });
    }
  }
  return result;
};

export const isPirNodeAncestorOrSelf = (
  ancestorId: string,
  nodeId: string,
  parentEdges: ReadonlyMap<string, PIRExtractionParentEdge>
): boolean => {
  let currentId: string | undefined = nodeId;
  while (currentId !== undefined) {
    if (currentId === ancestorId) return true;
    currentId = parentEdges.get(currentId)?.parentId;
  }
  return false;
};

export const isPirCollectionSymbolVisible = (
  owner: PIRCollectionSymbolOwner,
  occurrenceNodeId: string,
  occurrenceKind: 'node' | 'collection-key' | 'collection-source',
  parentEdges: ReadonlyMap<string, PIRExtractionParentEdge>
): boolean => {
  if (owner.nodeId === occurrenceNodeId) {
    return occurrenceKind === 'collection-key' && owner.role !== 'error';
  }

  let currentId = occurrenceNodeId;
  while (true) {
    const edge = parentEdges.get(currentId);
    if (!edge) return false;
    if (edge.parentId === owner.nodeId) {
      return owner.role === 'error'
        ? edge.regionName === 'error'
        : edge.regionName === 'item';
    }
    currentId = edge.parentId;
  }
};

export const createPirNodeRelocationFacts = (
  sourceDocumentId: string,
  definitionDocumentId: string,
  nodeIds: readonly string[]
): readonly PIRNodeRelocationFact[] =>
  Object.freeze(
    nodeIds.map((nodeId) =>
      Object.freeze({
        kind: 'pir-node' as const,
        sourceDocumentId,
        sourceNodeId: nodeId,
        definitionDocumentId,
        definitionNodeId: nodeId,
      })
    )
  );
