import { createEmptyPirDocument, type PIRDocument } from '@prodivix/pir';
import {
  createWorkspacePirProjectionPlan,
  type WorkspacePirProjectionPlan,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export const createPirCurrentDocument = (name: string): PIRDocument => ({
  ...createEmptyPirDocument({ rootType: 'div' }),
  metadata: { name },
});

export const createPirCurrentProjectionPlan = (
  document: PIRDocument,
  documentId = 'plugin-conformance-document'
): WorkspacePirProjectionPlan => {
  const documentNodeId = `node:${documentId}`;
  const workspace: WorkspaceSnapshot = {
    id: 'plugin-conformance-workspace',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 0,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: [documentNodeId],
      },
      [documentNodeId]: {
        id: documentNodeId,
        kind: 'doc',
        name: `${documentId}.pir.json`,
        parentId: 'root',
        docId: documentId,
      },
    },
    docsById: {
      [documentId]: {
        id: documentId,
        type: 'pir-page',
        path: `/${documentId}.pir.json`,
        contentRev: 1,
        metaRev: 1,
        content: document,
      },
    },
    routeManifest: {
      version: '1',
      root: { id: `route:${documentId}`, pageDocId: documentId },
    },
    activeDocumentId: documentId,
  };
  const result = createWorkspacePirProjectionPlan({
    workspace,
    entryDocumentId: documentId,
  });
  if (result.status === 'blocked') {
    throw new Error(
      result.issues.map(({ code, message }) => `${code}: ${message}`).join('; ')
    );
  }
  return result.plan;
};
