import {
  type PIRGraphDuplicateIdKind,
  type PIRGraphPlacementTarget,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import {
  selectWorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  findNodePlacement,
  isAncestorOf,
  resolveChildEndPlacement,
} from '../model/tree';

export type BlueprintTreeDropPlacement = 'before' | 'after' | 'child';

export type BlueprintResolvedPlacement = Readonly<{
  documentId: string;
  placement: PIRGraphPlacementTarget;
}>;

/** Resolves the canonical append slot exposed by a rendered PIR location. */
export const resolveBlueprintInsertionPlacement = (
  workspace: WorkspaceSnapshot,
  location: PIRRenderLocation
): BlueprintResolvedPlacement | null => {
  const read = selectWorkspacePirDocument(workspace, location.documentId);
  if (read?.status !== 'valid') return null;
  const graph = read.decodedContent.ui.graph;
  const node = graph.nodesById[location.nodeId];
  if (!node) return null;

  if (node.kind !== 'component-instance') {
    const placement = resolveChildEndPlacement(graph, node.id);
    if (!placement) return null;
    return {
      documentId: read.document.id,
      placement,
    };
  }

  const definition = selectWorkspacePirDocument(
    workspace,
    node.componentDocumentId
  );
  if (definition?.status !== 'valid') return null;
  const slot = Object.values(
    definition.decodedContent.componentContract?.slotsById ?? {}
  ).find((candidate) => {
    const count = graph.regionsById?.[node.id]?.[candidate.id]?.length ?? 0;
    return candidate.maxChildren === undefined || count < candidate.maxChildren;
  });
  if (!slot) return null;
  return {
    documentId: read.document.id,
    placement: {
      parentId: node.id,
      regionName: slot.id,
      index: graph.regionsById?.[node.id]?.[slot.id]?.length ?? 0,
    },
  };
};

export const resolveBlueprintTreePlacement = (
  workspace: WorkspaceSnapshot,
  location: PIRRenderLocation,
  drop: BlueprintTreeDropPlacement
): BlueprintResolvedPlacement | null => {
  if (drop === 'child') {
    return resolveBlueprintInsertionPlacement(workspace, location);
  }
  const read = selectWorkspacePirDocument(workspace, location.documentId);
  if (read?.status !== 'valid') return null;
  const placement = findNodePlacement(
    read.decodedContent.ui.graph,
    location.nodeId
  );
  if (!placement) return null;
  return {
    documentId: read.document.id,
    placement: {
      ...placement,
      index: placement.index + (drop === 'after' ? 1 : 0),
    },
  };
};

export const canNestBlueprintLocation = (
  workspace: WorkspaceSnapshot,
  source: PIRRenderLocation,
  target: PIRRenderLocation
): boolean => {
  const insertion = resolveBlueprintInsertionPlacement(workspace, target);
  if (!insertion || source.documentId !== target.documentId) return false;
  const read = selectWorkspacePirDocument(workspace, source.documentId);
  if (read?.status !== 'valid') return false;
  return !isAncestorOf(
    read.decodedContent.ui.graph,
    source.nodeId,
    insertion.placement.parentId
  );
};

export const resolveBlueprintDirectionalMoveTarget = (
  workspace: WorkspaceSnapshot,
  location: PIRRenderLocation,
  direction: 'up' | 'down'
): BlueprintResolvedPlacement | null => {
  const read = selectWorkspacePirDocument(workspace, location.documentId);
  if (read?.status !== 'valid') return null;
  const placement = findNodePlacement(
    read.decodedContent.ui.graph,
    location.nodeId
  );
  if (!placement) return null;
  const siblings = placement.regionName
    ? (read.decodedContent.ui.graph.regionsById?.[placement.parentId]?.[
        placement.regionName
      ] ?? [])
    : (read.decodedContent.ui.graph.childIdsById[placement.parentId] ?? []);
  if (
    (direction === 'up' && placement.index === 0) ||
    (direction === 'down' && placement.index >= siblings.length - 1)
  ) {
    return null;
  }
  return {
    documentId: read.document.id,
    placement: {
      ...placement,
      index: placement.index + (direction === 'up' ? -1 : 2),
    },
  };
};

export const createBlueprintDuplicateIdFactory = (transactionId: string) => {
  const suffix = transactionId.replace(/[^a-zA-Z0-9]/g, '').slice(-10);
  const ids = new Map<string, string>();
  return (kind: PIRGraphDuplicateIdKind, sourceId: string): string => {
    const key = `${kind}:${sourceId}`;
    const existing = ids.get(key);
    if (existing) return existing;
    const created = `${sourceId}-copy-${suffix}-${ids.size + 1}`;
    ids.set(key, created);
    return created;
  };
};
