import type { PIRDocument } from '@prodivix/shared/types/pir';
import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import {
  findRouteNodeById,
  moveRouteNodeById,
  normalizeRoutePath,
  normalizeRouteSegment,
  removeRouteNodeById,
  updateRouteNodeById,
} from '@prodivix/shared/router';
import {
  isWorkspacePirDocument,
  normalizeRouteManifest,
  resolveActiveRouteNodeId,
} from './editorStore.normalizers';
import {
  attachDocumentToTree,
  createEntityId,
  createWorkspaceDocumentRecord,
} from './editorStore.tree';
import type {
  RouteIntent,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
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

const trimRouteSegment = (segment: string): string | null => {
  const normalized = normalizeRouteSegment(segment);
  return normalized.ok ? normalized.segment || null : null;
};

const createOrReusePirDocument = (
  documentsById: Record<string, WorkspaceDocumentRecord>,
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>,
  options: {
    documentId: string;
    type: WorkspaceDocumentRecord['type'];
    path: string;
  }
): {
  document: WorkspaceDocumentRecord;
  documentsById: Record<string, WorkspaceDocumentRecord>;
  treeRootId: string | undefined;
  treeById: Record<string, WorkspaceVfsNode>;
} => {
  const existing = documentsById[options.documentId];
  if (existing) {
    return { document: existing, documentsById, treeRootId, treeById };
  }
  const document = createWorkspaceDocumentRecord(
    options.documentId,
    options.type,
    options.path
  );
  const nextDocumentsById = { ...documentsById, [document.id]: document };
  const treeResult = attachDocumentToTree(treeRootId, treeById, document);
  return {
    document,
    documentsById: nextDocumentsById,
    treeRootId: treeResult.treeRootId,
    treeById: treeResult.treeById,
  };
};

const updateRouteRuntimeRef = (
  node: WorkspaceRouteNode,
  kind: 'loader' | 'action' | 'guard',
  reference: WorkspaceRouteCodeReference | undefined
): WorkspaceRouteNode => {
  const runtime = { ...(node.runtime ?? {}) };
  const key =
    kind === 'loader'
      ? 'loaderRef'
      : kind === 'action'
        ? 'actionRef'
        : 'guardRef';
  if (reference?.artifactId?.trim()) {
    runtime[key] = reference;
  } else {
    delete runtime[key];
  }
  return {
    ...node,
    runtime: Object.keys(runtime).length ? runtime : undefined,
  };
};

const clearOutletBindingFromRouteTree = (
  node: WorkspaceRouteNode,
  outletNodeId: string,
  outletName: string,
  exceptRouteNodeId?: string
): WorkspaceRouteNode => {
  let nextNode = node;
  if (node.id !== exceptRouteNodeId) {
    if (outletName === 'default' && node.outletNodeId === outletNodeId) {
      nextNode = { ...nextNode, outletNodeId: undefined };
    }
    if (outletName !== 'default' && node.outletBindings?.[outletName]) {
      const outletBindings = { ...node.outletBindings };
      if (outletBindings[outletName]?.outletNodeId === outletNodeId) {
        delete outletBindings[outletName];
        nextNode = {
          ...nextNode,
          outletBindings: Object.keys(outletBindings).length
            ? outletBindings
            : undefined,
        };
      }
    }
  }
  const children = nextNode.children ?? [];
  if (!children.length) return nextNode;
  let changed = false;
  const nextChildren = children.map((child) => {
    const nextChild = clearOutletBindingFromRouteTree(
      child,
      outletNodeId,
      outletName,
      exceptRouteNodeId
    );
    if (nextChild !== child) changed = true;
    return nextChild;
  });
  return changed ? { ...nextNode, children: nextChildren } : nextNode;
};

const createIntentResult = (
  state: RouteIntentState,
  result: {
    routeManifest: WorkspaceRouteManifest;
    activeRouteNodeId?: string;
    workspaceDocumentsById: Record<string, WorkspaceDocumentRecord>;
    treeRootId?: string;
    treeById: Record<string, WorkspaceVfsNode>;
    activeDocumentId?: string;
    pirDoc?: PIRDocument;
  }
): RouteIntentResult => {
  const activeDocumentId = result.activeDocumentId;
  return {
    routeManifest: normalizeRouteManifest(result.routeManifest),
    activeRouteNodeId: result.activeRouteNodeId,
    workspaceDocumentsById: result.workspaceDocumentsById,
    treeRootId: result.treeRootId,
    treeById: result.treeById,
    activeDocumentId,
    pirDoc:
      result.pirDoc ??
      (activeDocumentId
        ? resolvePirDocFromDocument(
            result.workspaceDocumentsById[activeDocumentId],
            state.pirDoc
          )
        : state.pirDoc),
  };
};

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
    const normalizedPath = normalizeRoutePath(intent.path);
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
    const segment = trimRouteSegment(intent.segment);
    if (!segment) return null;
    const routeNodeId = intent.routeNodeId?.trim() || createEntityId('route');
    const documentId = intent.pageDocId?.trim() || createEntityId('page');
    const documentResult = createOrReusePirDocument(
      nextDocumentsById,
      nextTreeRootId,
      nextTreeById,
      {
        documentId,
        type: 'pir-page',
        path: `/pages/${documentId}.pir.json`,
      }
    );
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
              segment,
              pageDocId: documentId,
            },
          ],
        })
      ),
    };
    nextActiveRouteNodeId = routeNodeId;
    if (
      !nextActiveDocumentId ||
      !documentResult.documentsById[nextActiveDocumentId]
    ) {
      nextActiveDocumentId = documentId;
    }
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: documentResult.documentsById,
      treeRootId: documentResult.treeRootId,
      treeById: documentResult.treeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'create-index') {
    const parent = findRouteNodeById(
      state.routeManifest.root,
      intent.parentRouteNodeId
    );
    if (!parent) return null;
    if ((parent.children ?? []).some((child) => child.index)) return null;
    const routeNodeId = intent.routeNodeId?.trim() || createEntityId('route');
    const documentId = intent.pageDocId?.trim() || createEntityId('page');
    const documentResult = createOrReusePirDocument(
      nextDocumentsById,
      nextTreeRootId,
      nextTreeById,
      {
        documentId,
        type: 'pir-page',
        path: `/pages/${documentId}.pir.json`,
      }
    );
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.parentRouteNodeId,
        (target) => ({
          ...target,
          children: [
            {
              id: routeNodeId,
              index: true,
              pageDocId: documentId,
            },
            ...(target.children ?? []),
          ],
        })
      ),
    };
    nextActiveRouteNodeId = routeNodeId;
    if (
      !nextActiveDocumentId ||
      !documentResult.documentsById[nextActiveDocumentId]
    ) {
      nextActiveDocumentId = documentId;
    }
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: documentResult.documentsById,
      treeRootId: documentResult.treeRootId,
      treeById: documentResult.treeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'rename-segment') {
    const targetNode = findRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!targetNode || targetNode.index) return null;
    const segment = trimRouteSegment(intent.segment);
    if (!segment) return null;
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.routeNodeId,
        (target) => ({ ...target, segment })
      ),
    };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'move-route') {
    const moved = moveRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId,
      intent.parentRouteNodeId,
      intent.index
    );
    if (!moved.moved) return null;
    nextRouteManifest = { ...state.routeManifest, root: moved.root };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'attach-layout') {
    const targetNode = findRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!targetNode) return null;
    if (targetNode.layoutDocId) return null;
    const layoutDocId = intent.layoutDocId?.trim() || createEntityId('layout');
    const documentResult = createOrReusePirDocument(
      nextDocumentsById,
      nextTreeRootId,
      nextTreeById,
      {
        documentId: layoutDocId,
        type: 'pir-layout',
        path: `/layouts/${layoutDocId}.pir.json`,
      }
    );
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.routeNodeId,
        (target) => ({ ...target, layoutDocId })
      ),
    };
    nextActiveDocumentId = layoutDocId;
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      workspaceDocumentsById: documentResult.documentsById,
      treeRootId: documentResult.treeRootId,
      treeById: documentResult.treeById,
      activeDocumentId: nextActiveDocumentId,
      pirDoc: resolvePirDocFromDocument(documentResult.document, state.pirDoc),
    });
  }

  if (intent.type === 'detach-layout') {
    const targetNode = findRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!targetNode?.layoutDocId) return null;
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.routeNodeId,
        (target) => ({ ...target, layoutDocId: undefined })
      ),
    };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'bind-outlet') {
    const routeNodeId = intent.routeNodeId.trim();
    const outletNodeId = intent.outletNodeId.trim();
    if (!routeNodeId || !outletNodeId) return null;
    const outletName = intent.outletName?.trim() || 'default';
    const targetNode = findRouteNodeById(state.routeManifest.root, routeNodeId);
    if (!targetNode) return null;
    const alreadyBound =
      outletName === 'default'
        ? targetNode.outletNodeId === outletNodeId
        : targetNode.outletBindings?.[outletName]?.outletNodeId ===
          outletNodeId;
    const rootWithoutDuplicateBinding = clearOutletBindingFromRouteTree(
      state.routeManifest.root,
      outletNodeId,
      outletName,
      routeNodeId
    );
    if (
      alreadyBound &&
      rootWithoutDuplicateBinding === state.routeManifest.root
    )
      return null;
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        rootWithoutDuplicateBinding,
        routeNodeId,
        (target) => {
          if (outletName === 'default') {
            return { ...target, outletNodeId };
          }
          return {
            ...target,
            outletBindings: {
              ...(target.outletBindings ?? {}),
              [outletName]: { outletNodeId },
            },
          };
        }
      ),
    };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'unbind-outlet') {
    const routeNodeId = intent.routeNodeId.trim();
    if (!routeNodeId) return null;
    const outletName = intent.outletName?.trim() || 'default';
    const targetNode = findRouteNodeById(state.routeManifest.root, routeNodeId);
    if (!targetNode) return null;
    if (outletName === 'default' && !targetNode.outletNodeId) return null;
    if (outletName !== 'default' && !targetNode.outletBindings?.[outletName]) {
      return null;
    }
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        routeNodeId,
        (target) => {
          if (outletName === 'default') {
            return { ...target, outletNodeId: undefined };
          }
          const outletBindings = { ...(target.outletBindings ?? {}) };
          delete outletBindings[outletName];
          return {
            ...target,
            outletBindings: Object.keys(outletBindings).length
              ? outletBindings
              : undefined,
          };
        }
      ),
    };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'set-runtime-ref') {
    if (!findRouteNodeById(state.routeManifest.root, intent.routeNodeId)) {
      return null;
    }
    nextRouteManifest = {
      ...state.routeManifest,
      root: updateRouteNodeById(
        state.routeManifest.root,
        intent.routeNodeId,
        (target) => updateRouteRuntimeRef(target, intent.kind, intent.reference)
      ),
    };
    return createIntentResult(state, {
      routeManifest: nextRouteManifest,
      activeRouteNodeId: nextActiveRouteNodeId,
      workspaceDocumentsById: nextDocumentsById,
      treeRootId: nextTreeRootId,
      treeById: nextTreeById,
      activeDocumentId: nextActiveDocumentId,
    });
  }

  if (intent.type === 'delete-route') {
    if (intent.routeNodeId === 'root') return null;
    const removed = removeRouteNodeById(
      state.routeManifest.root,
      intent.routeNodeId
    );
    if (!removed.removed) return null;
    nextRouteManifest = { ...state.routeManifest, root: removed.node };
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
