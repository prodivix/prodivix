import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';
import {
  asFiniteNumber,
  asNonEmptyString,
  indexStableEntities,
  isRecord,
} from './revisionConflictAdapterUtils';

export type NodeGraphSnapshotProjection = {
  documentId: string;
  documentPath: string;
  edgesById: Record<string, Record<string, unknown>>;
  graphId?: string;
  graphLabel: string;
  nodesById: Record<string, Record<string, unknown>>;
  positionsByNodeId: Record<string, { x: number; y: number }>;
};

export const createNodeGraphProjectionKey = (
  documentId: string,
  graphId?: string
): string => JSON.stringify([documentId, graphId ?? null]);

const positionFromRecord = (
  value: Record<string, unknown> | undefined
): { x: number; y: number } | undefined => {
  if (!value) return undefined;
  const position = isRecord(value.position) ? value.position : value;
  const x = asFiniteNumber(position.x);
  const y = asFiniteNumber(position.y);
  return x === undefined || y === undefined ? undefined : { x, y };
};

const indexEditorPositions = (
  logic: Record<string, unknown>,
  graphId: string
): Record<string, { x: number; y: number }> => {
  const editorState = isRecord(logic['x-nodeGraphEditor'])
    ? logic['x-nodeGraphEditor']
    : undefined;
  const graphState = editorState
    ? indexStableEntities(editorState, 'graphs', 'graphsById')[graphId]
    : undefined;
  const nodes = graphState
    ? indexStableEntities(graphState, 'nodes', 'nodesById')
    : {};
  return Object.fromEntries(
    Object.entries(nodes).flatMap(([nodeId, node]) => {
      const position = positionFromRecord(node);
      return position ? [[nodeId, position] as const] : [];
    })
  );
};

const projectEmbeddedGraphs = (
  document: WorkspaceDocument,
  content: Record<string, unknown>
): NodeGraphSnapshotProjection[] => {
  const logic = isRecord(content.logic) ? content.logic : undefined;
  if (!logic) return [];
  const graphs = indexStableEntities(logic, 'graphs', 'graphsById');
  return Object.entries(graphs).map(([graphId, graph]) => {
    const nodesById = indexStableEntities(graph, 'nodes', 'nodesById');
    const positionsByNodeId = indexEditorPositions(logic, graphId);
    Object.entries(nodesById).forEach(([nodeId, node]) => {
      positionsByNodeId[nodeId] ??= positionFromRecord(node) ?? { x: 0, y: 0 };
    });
    return {
      documentId: document.id,
      documentPath: document.path,
      edgesById: indexStableEntities(graph, 'edges', 'edgesById'),
      graphId,
      graphLabel:
        asNonEmptyString(graph.name) ??
        asNonEmptyString(graph.label) ??
        graphId,
      nodesById,
      positionsByNodeId,
    };
  });
};

const projectStandaloneGraph = (
  document: WorkspaceDocument,
  content: Record<string, unknown>
): NodeGraphSnapshotProjection | undefined => {
  if (document.type !== 'pir-graph') return undefined;
  const nodesById = indexStableEntities(content, 'nodes', 'nodesById');
  const edgesById = indexStableEntities(content, 'edges', 'edgesById');
  const positionsByNodeId = Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [
      nodeId,
      positionFromRecord(node) ?? { x: 0, y: 0 },
    ])
  );
  return {
    documentId: document.id,
    documentPath: document.path,
    edgesById,
    graphLabel:
      document.name ?? asNonEmptyString(content.name) ?? document.path,
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
    const standalone = projectStandaloneGraph(document, document.content);
    if (standalone) {
      result.set(createNodeGraphProjectionKey(document.id), standalone);
    }
    projectEmbeddedGraphs(document, document.content).forEach((graph) => {
      result.set(
        createNodeGraphProjectionKey(document.id, graph.graphId),
        graph
      );
    });
  });
  return result;
};
