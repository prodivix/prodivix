import type { WorkspaceDocument, WorkspaceSnapshot } from '@prodivix/workspace';
import { jsonValuesEqual } from './jsonValue';

export type WorkspaceDocumentAuthoringDelta = {
  documentId: string;
  kind: 'add' | 'delete' | 'update';
  before?: WorkspaceDocument;
  after?: WorkspaceDocument;
  contentChanged: boolean;
  metadataChanged: boolean;
};

export type WorkspaceAuthoringDelta = {
  treeChanged: boolean;
  routeChanged: boolean;
  workspaceChanged: boolean;
  documents: WorkspaceDocumentAuthoringDelta[];
  hasDurableDelta: boolean;
};

export const workspaceDocumentAuthoringState = (
  document: WorkspaceDocument
) => ({
  id: document.id,
  type: document.type,
  name: document.name,
  path: document.path,
  content: document.content,
  capabilities: document.capabilities,
});

export const workspaceDocumentMetadataAuthoringState = (
  document: WorkspaceDocument
) => ({
  type: document.type,
  name: document.name,
  path: document.path,
  capabilities: document.capabilities,
});

export const workspaceTreeAuthoringState = (workspace: WorkspaceSnapshot) => ({
  treeRootId: workspace.treeRootId,
  treeById: workspace.treeById,
});

/**
 * Compares the exact durable authoring projection used by Atomic Commit.
 * Revisions, timestamps, and ephemeral selection never participate.
 */
export const analyzeWorkspaceAuthoringDelta = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): WorkspaceAuthoringDelta => {
  const treeChanged = !jsonValuesEqual(
    workspaceTreeAuthoringState(before),
    workspaceTreeAuthoringState(after)
  );
  const routeChanged = !jsonValuesEqual(
    before.routeManifest,
    after.routeManifest
  );
  const documentIds = new Set([
    ...Object.keys(before.docsById),
    ...Object.keys(after.docsById),
  ]);
  const documents: WorkspaceDocumentAuthoringDelta[] = [];
  [...documentIds].sort().forEach((documentId) => {
    const beforeDocument = before.docsById[documentId];
    const afterDocument = after.docsById[documentId];
    if (!beforeDocument && afterDocument) {
      documents.push({
        documentId,
        kind: 'add',
        after: afterDocument,
        contentChanged: true,
        metadataChanged: true,
      });
      return;
    }
    if (beforeDocument && !afterDocument) {
      documents.push({
        documentId,
        kind: 'delete',
        before: beforeDocument,
        contentChanged: true,
        metadataChanged: true,
      });
      return;
    }
    if (!beforeDocument || !afterDocument) return;
    const contentChanged = !jsonValuesEqual(
      beforeDocument.content,
      afterDocument.content
    );
    const metadataChanged = !jsonValuesEqual(
      workspaceDocumentMetadataAuthoringState(beforeDocument),
      workspaceDocumentMetadataAuthoringState(afterDocument)
    );
    if (!contentChanged && !metadataChanged) return;
    documents.push({
      documentId,
      kind: 'update',
      before: beforeDocument,
      after: afterDocument,
      contentChanged,
      metadataChanged,
    });
  });
  const workspaceChanged =
    treeChanged ||
    routeChanged ||
    documents.some(
      (document) => document.kind !== 'update' || document.metadataChanged
    );
  return {
    treeChanged,
    routeChanged,
    workspaceChanged,
    documents,
    hasDurableDelta: treeChanged || routeChanged || documents.length > 0,
  };
};
