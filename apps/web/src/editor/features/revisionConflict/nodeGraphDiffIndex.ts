import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';
import { indexStableEntities, isRecord } from './revisionConflictAdapterUtils';

export type NodeGraphSnapshotProjection = {
  documentId: string;
  documentPath: string;
  edgesById: Record<string, Record<string, unknown>>;
  graphLabel: string;
  nodesById: Record<string, Record<string, unknown>>;
  positionsByNodeId: Record<string, { x: number; y: number }>;
};

export const createNodeGraphProjectionKey = (documentId: string): string =>
  documentId;

const projectStandaloneGraph = (
  document: WorkspaceDocument,
  content: Record<string, unknown>
): NodeGraphSnapshotProjection | undefined => {
  if (document.type !== 'pir-graph') return undefined;
  const nodesById = indexStableEntities(content, 'nodes', 'nodesById');
  const positionsByNodeId = Object.fromEntries(
    Object.keys(nodesById)
      .sort()
      .map((nodeId, index) => [
        nodeId,
        { x: (index % 4) * 240, y: Math.floor(index / 4) * 140 },
      ])
  );
  return {
    documentId: document.id,
    documentPath: document.path,
    edgesById: indexStableEntities(content, 'edges', 'edgesById'),
    graphLabel: document.name ?? document.path,
    nodesById,
    positionsByNodeId,
  };
};

export const indexSnapshotNodeGraphs = (
  snapshot: WorkspaceSnapshot | undefined
): Map<string, NodeGraphSnapshotProjection> => {
  const result = new Map<string, NodeGraphSnapshotProjection>();
  if (!snapshot) return result;
  Object.values(snapshot.docsById).forEach((document) => {
    if (!isRecord(document.content)) return;
    const projection = projectStandaloneGraph(document, document.content);
    if (projection) result.set(document.id, projection);
  });
  return result;
};
