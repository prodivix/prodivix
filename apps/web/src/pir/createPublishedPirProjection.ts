import { decodePirDocument, type PIRDocument } from '@prodivix/pir';
import {
  createWorkspacePirProjectionPlan,
  type WorkspacePirProjectionPlan,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type PublishedPirProjectionIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type PublishedPirProjection =
  | Readonly<{
      status: 'ready';
      document: PIRDocument;
      plan: WorkspacePirProjectionPlan;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly PublishedPirProjectionIssue[];
    }>;

const ENTRY_DOCUMENT_ID = 'published-pir-entry';

/** Adapts the publication wire boundary to the canonical Workspace projection. */
export const createPublishedPirProjection = (
  wireDocument: unknown,
  documentType: 'pir-page' | 'pir-component'
): PublishedPirProjection => {
  const decoded = decodePirDocument(wireDocument);
  if (decoded.ok === false) {
    return {
      status: 'blocked',
      issues: decoded.issues.map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    };
  }

  const workspace: WorkspaceSnapshot = {
    id: 'published-pir-preview',
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
        children: ['published-pir-node'],
      },
      'published-pir-node': {
        id: 'published-pir-node',
        kind: 'doc',
        name: 'published.pir.json',
        parentId: 'root',
        docId: ENTRY_DOCUMENT_ID,
      },
    },
    docsById: {
      [ENTRY_DOCUMENT_ID]: {
        id: ENTRY_DOCUMENT_ID,
        type: documentType,
        path: '/published.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: decoded.value,
      },
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'published-route-root',
        ...(documentType === 'pir-page'
          ? { pageDocId: ENTRY_DOCUMENT_ID }
          : {}),
      },
    },
    activeDocumentId: ENTRY_DOCUMENT_ID,
  };
  const projection = createWorkspacePirProjectionPlan({
    workspace,
    entryDocumentId: ENTRY_DOCUMENT_ID,
  });
  if (projection.status === 'blocked') {
    return {
      status: 'blocked',
      issues: projection.issues.map(({ code, path, message }) => ({
        code,
        path,
        message,
      })),
    };
  }
  return {
    status: 'ready',
    document: decoded.value,
    plan: projection.plan,
  };
};
