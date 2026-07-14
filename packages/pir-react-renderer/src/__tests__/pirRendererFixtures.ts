import type React from 'react';
import type {
  PIRComponentContract,
  PIRDocument,
  PIRLogicDefinition,
  PIRNode,
} from '@prodivix/pir';
import type {
  WorkspaceComponentDependencyEdge,
  WorkspacePirProjectionPlan,
  WorkspacePirDocument,
  WorkspacePirDocumentType,
} from '@prodivix/workspace';
import type { PIRRendererHost } from '../PIRRenderer.types';

export const createContract = (
  overrides: Partial<PIRComponentContract> = {}
): PIRComponentContract => ({
  propsById: {},
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
  ...overrides,
});

export const createWorkspaceDocument = (
  input: Readonly<{
    id: string;
    type: WorkspacePirDocumentType;
    rootId: string;
    nodesById: Readonly<Record<string, PIRNode>>;
    childIdsById?: Readonly<Record<string, readonly string[]>>;
    regionsById?: Readonly<
      Record<string, Readonly<Record<string, readonly string[]>>>
    >;
    contract?: PIRComponentContract;
    logic?: PIRLogicDefinition;
    contentRev?: number;
  }>
): WorkspacePirDocument => {
  const content: PIRDocument = {
    ...(input.contract ? { componentContract: input.contract } : {}),
    ui: {
      graph: {
        rootId: input.rootId,
        nodesById: input.nodesById,
        childIdsById: input.childIdsById ?? {},
        ...(input.regionsById ? { regionsById: input.regionsById } : {}),
      },
    },
    ...(input.logic ? { logic: input.logic } : {}),
  };
  return {
    id: input.id,
    type: input.type,
    path: `/src/${input.id}.json`,
    contentRev: input.contentRev ?? 1,
    metaRev: 1,
    content,
  };
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const createProjectionPlan = (
  entryDocumentId: string,
  documents: readonly WorkspacePirDocument[]
): WorkspacePirProjectionPlan => {
  const documentsById = Object.fromEntries(
    documents.map((document) => [document.id, document])
  );
  const edges: WorkspaceComponentDependencyEdge[] = [];
  for (const document of documents) {
    for (const [nodeId, node] of Object.entries(
      document.content.ui.graph.nodesById
    )) {
      if (node.kind !== 'component-instance') continue;
      edges.push({
        sourceDocumentId: document.id,
        targetDocumentId: node.componentDocumentId,
        instanceNodeId: nodeId,
        path: `/docsById/${document.id}/content/ui/graph/nodesById/${nodeId}/componentDocumentId`,
      });
    }
  }
  edges.sort(
    (left, right) =>
      compareText(left.sourceDocumentId, right.sourceDocumentId) ||
      compareText(left.targetDocumentId, right.targetDocumentId) ||
      compareText(left.instanceNodeId, right.instanceNodeId)
  );
  const dependenciesByDocumentId = Object.fromEntries(
    documents.map((document) => [
      document.id,
      [
        ...new Set(
          edges
            .filter((edge) => edge.sourceDocumentId === document.id)
            .map((edge) => edge.targetDocumentId)
        ),
      ].sort(compareText),
    ])
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dependencyFirstDocumentIds: string[] = [];
  const visit = (documentId: string): void => {
    if (visited.has(documentId) || visiting.has(documentId)) return;
    visiting.add(documentId);
    for (const dependencyId of dependenciesByDocumentId[documentId] ?? []) {
      visit(dependencyId);
    }
    visiting.delete(documentId);
    visited.add(documentId);
    dependencyFirstDocumentIds.push(documentId);
  };
  visit(entryDocumentId);
  const componentDocumentIds = documents
    .filter((document) => document.type === 'pir-component')
    .map((document) => document.id)
    .sort(compareText);
  return {
    snapshotIdentity: {
      workspaceId: 'workspace-renderer-test',
      workspaceRev: 1,
      documents: Object.fromEntries(
        documents.map((document) => [
          document.id,
          { contentRev: document.contentRev, metaRev: document.metaRev },
        ])
      ),
    },
    entryDocumentId,
    entryDocument: documentsById[entryDocumentId]!,
    documentsById,
    dependencyFirstDocumentIds,
    componentDocumentIds,
    graph: {
      documents: documents
        .map((document) => ({
          documentId: document.id,
          documentType: document.type,
        }))
        .sort((left, right) => compareText(left.documentId, right.documentId)),
      componentDocumentIds,
      componentTopologicalOrder: componentDocumentIds,
      edges,
      dependenciesByDocumentId,
    },
  };
};

export const nativeHost: PIRRendererHost = {
  resolveElement: (type) =>
    type === type.toLowerCase()
      ? { component: type as React.ElementType }
      : undefined,
};
