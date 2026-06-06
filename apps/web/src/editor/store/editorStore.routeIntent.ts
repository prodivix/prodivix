import type { PIRDocument } from '@/core/types/engine.types';
import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import {
  collectRouteDocumentRefs,
  findRouteNodeById,
  removeRouteNodeById,
  updateRouteNodeById,
} from './routeManifest';
import {
  isWorkspacePirDocument,
  normalizeRouteManifest,
  resolveActiveRouteNodeId,
} from './editorStore.normalizers';
import {
  attachDocumentToTree,
  createEntityId,
  createWorkspaceDocumentRecord,
  removeDocumentFromTree,
} from './editorStore.tree';
import type {
  RouteIntent,
  WorkspaceRouteManifest,
  WorkspaceVfsNode,
} from './editorStore.types';

export type RouteIntentState = {
  routeManifest: WorkspaceRouteManifest;
  workspaceDocumentsById: Record<string, WorkspaceDocumentRecord>;
  treeRootId?: string;
  treeById: Record<string, WorkspaceVfsNode>;
  activeRouteNodeId?: string;
  activeDocumentId?: string;
  pirDoc: PIRDocument;
};

export type RouteIntentResult = {
  routeManifest: WorkspaceRouteManifest;
  activeRouteNodeId?: string;
  workspaceDocumentsById: Record<string, WorkspaceDocumentRecord>;
  treeRootId?: string;
  treeById: Record<string, WorkspaceVfsNode>;
  activeDocumentId?: string;
  pirDoc: PIRDocument;
};

const resolvePirDocFromDocument = (
  document: WorkspaceDocumentRecord | undefined,
  fallback: PIRDocument
): PIRDocument =>
  isWorkspacePirDocument(document) ? document.content : fallback;

export const applyRouteIntentToState = (
  state: RouteIntentState,
  intent: RouteIntent
): RouteIntentResult | null => {
  const nextDocumentsById = { ...state.workspaceDocumentsById };
  let nextRouteManifest = state.routeManifest;
  let nextTreeRootId = state.treeRootId;
  let nextTreeById = state.treeById;
  let nextActiveRouteNodeId = state.activeRouteNodeId;
  let nextActiveDocumentId = state.activeDocumentId;

  if (intent.type === 'create-page') {
    const routeNodeId = intent.routeNodeId?.trim() || createEntityId('route');
    const documentId = createEntityId('page');
    const normalizedPath = intent.path.startsWith('/')
      ? intent.path
      : `/${intent.path}`;
    const pageDocument = createWorkspaceDocumentRecord(
      documentId,
      'pir-page',
      normalizedPath
    );
    nextDocumentsById[documentId] = pageDocument;
    const treeResult = attachDocumentToTree(
      nextTreeRootId,
      nextTreeById,
      pageDocument
    );
    nextTreeRootId = treeResult.treeRootId;
    nextTreeById = treeResult.treeById;
    nextRouteManifest = {
      ...state.routeManifest,
      root: {
        ...state.routeManifest.root,
        children: [
          ...(state.routeManifest.root.children ?? []),
          {
            id: routeNodeId,
            index: normalizedPath === '/',
            segment:
              normalizedPath === '/'
                ? undefined
                : normalizedPath.replace(/^\//, ''),
            pageDocId: documentId,
          },
        ],
      },
    };
    nextActiveRouteNodeId = routeNodeId;
    if (!nextActiveDocumentId || !nextDocumentsById[nextActiveDocumentId]) {
      nextActiveDocumentId = documentId;
    }
    return {
      routeManifest: normalizeRouteManifest(nextRouteManifest),
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
      pirDoc: nextActiveDocumentId
        ? resolvePirDocFromDocument(
            nextDocumentsById[nextActiveDocumentId],
            state.pirDoc
          )
        : state.pirDoc,
    };
  }

  if (intent.type === 'create-child-route') {
    const parent = findRouteNodeById(
      state.routeManifest.root,
      intent.parentRouteNodeId
    );
    if (!parent) return null;
    const routeNodeId = intent.routeNodeId?.trim() || createEntityId('route');
    const documentId = intent.pageDocId?.trim() || createEntityId('page');
    const pageDocument = createWorkspaceDocumentRecord(
      documentId,
      'pir-page',
      `/${intent.segment}`
    );
    nextDocumentsById[documentId] = pageDocument;
    const treeResult = attachDocumentToTree(
      nextTreeRootId,
      nextTreeById,
      pageDocument
    );
    nextTreeRootId = treeResult.treeRootId;
    nextTreeById = treeResult.treeById;
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.parentRouteNodeId,
        (target) => ({
          ...target,
          children: [
            ...(target.children ?? []),
            {
              id: routeNodeId,
              segment: intent.segment,
              pageDocId: documentId,
            },
          ],
        })
      ),
    };
    nextActiveRouteNodeId = routeNodeId;
    if (!nextActiveDocumentId || !nextDocumentsById[nextActiveDocumentId]) {
      nextActiveDocumentId = documentId;
    }
    return {
      routeManifest: normalizeRouteManifest(nextRouteManifest),
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
      pirDoc: nextActiveDocumentId
        ? resolvePirDocFromDocument(
            nextDocumentsById[nextActiveDocumentId],
            state.pirDoc
          )
        : state.pirDoc,
    };
  }

  if (intent.type === 'split-layout') {
    const targetNode = findRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!targetNode) return null;
    if (targetNode.layoutDocId) return null;
    const layoutDocId = intent.layoutDocId?.trim() || createEntityId('layout');
    const layoutDocument = createWorkspaceDocumentRecord(
      layoutDocId,
      'pir-layout',
      `/layouts/${layoutDocId}`
    );
    nextDocumentsById[layoutDocId] = layoutDocument;
    const treeResult = attachDocumentToTree(
      nextTreeRootId,
      nextTreeById,
      layoutDocument
    );
    nextTreeRootId = treeResult.treeRootId;
    nextTreeById = treeResult.treeById;
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.routeNodeId,
        (target) => ({ ...target, layoutDocId })
      ),
    };
    nextActiveDocumentId = layoutDocId;
    return {
      routeManifest: normalizeRouteManifest(nextRouteManifest),
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
      pirDoc: resolvePirDocFromDocument(layoutDocument, state.pirDoc),
    };
  }

  if (intent.type === 'delete-route') {
    if (intent.routeNodeId === 'root') return null;
    const removed = removeRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!removed.removed) return null;
    nextRouteManifest = { ...state.routeManifest, root: removed.node };
    const referencedDocs = collectRouteDocumentRefs(nextRouteManifest.root);
    const removedRouteDocs = collectRouteDocumentRefs(removed.removed);
    removedRouteDocs.forEach((docId) => {
      if (referencedDocs.has(docId)) return;
      if (!nextDocumentsById[docId]) return;
      delete nextDocumentsById[docId];
      nextTreeById = removeDocumentFromTree(nextTreeById, docId);
    });
    nextActiveRouteNodeId = resolveActiveRouteNodeId(nextRouteManifest, [
      state.activeRouteNodeId === intent.routeNodeId
        ? undefined
        : state.activeRouteNodeId,
    ]);
    if (nextActiveDocumentId && !nextDocumentsById[nextActiveDocumentId]) {
      nextActiveDocumentId = Object.keys(nextDocumentsById)[0];
    }
    const nextPirDoc = nextActiveDocumentId
      ? resolvePirDocFromDocument(
          nextDocumentsById[nextActiveDocumentId],
          state.pirDoc
        )
      : state.pirDoc;
    return {
      routeManifest: normalizeRouteManifest(nextRouteManifest),
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
      pirDoc: nextPirDoc,
    };
  }

  return null;
};
