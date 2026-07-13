import { createDefaultPirDoc } from '@prodivix/pir';
import {
  composeRouteManifestWithModules,
  findRouteNodeById,
  moveRouteNodeById,
  normalizeRoutePath,
  normalizeRouteSegment,
  removeRouteNodeById,
  resolveDefaultActiveRouteNodeId,
  updateRouteNodeById,
  validateRouteManifest,
} from '@prodivix/router';
import type {
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from '@prodivix/router';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import {
  createRouteIntentCommand,
  createRouteIntentTransaction,
} from './workspaceRouteIntentCommand';
import { planWorkspaceDocumentAtPath } from './workspaceDocumentFactory';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceRouteIntent =
  | {
      type: 'create-page';
      path: string;
      routeNodeId?: string;
    }
  | {
      type: 'create-index';
      parentRouteNodeId: string;
      routeNodeId?: string;
      pageDocId?: string;
    }
  | {
      type: 'create-child-route';
      parentRouteNodeId: string;
      segment: string;
      routeNodeId?: string;
      pageDocId?: string;
    }
  | {
      type: 'rename-segment';
      routeNodeId: string;
      segment: string;
    }
  | {
      type: 'move-route';
      routeNodeId: string;
      parentRouteNodeId: string;
      index?: number;
    }
  | {
      type: 'attach-layout';
      routeNodeId: string;
      layoutDocId?: string;
    }
  | {
      type: 'detach-layout';
      routeNodeId: string;
    }
  | {
      type: 'bind-outlet';
      routeNodeId: string;
      outletNodeId: string;
      outletName?: string;
    }
  | {
      type: 'unbind-outlet';
      routeNodeId: string;
      outletName?: string;
    }
  | {
      type: 'set-runtime-ref';
      routeNodeId: string;
      kind: 'loader' | 'action' | 'guard';
      reference?: WorkspaceRouteCodeReference;
    }
  | {
      type: 'delete-route';
      routeNodeId: string;
    };

export type WorkspaceRouteIntentPlan =
  | { kind: 'command'; command: WorkspaceCommandEnvelope }
  | { kind: 'transaction'; transaction: WorkspaceTransactionEnvelope };

export type WorkspaceRouteIntentIdFactory = (prefix: string) => string;

export type WorkspaceRouteIntentPlanOptions = {
  id?: string;
  issuedAt?: string;
  idFactory?: WorkspaceRouteIntentIdFactory;
  clock?: () => string;
};

const createDefaultRouteIntentId: WorkspaceRouteIntentIdFactory = (prefix) => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${timestamp}-${random}`;
};

const trimRouteSegment = (segment: string): string | null => {
  const normalized = normalizeRouteSegment(segment);
  return normalized.ok ? normalized.segment || null : null;
};

const createOrReuseRouteDocument = (
  workspace: WorkspaceSnapshot,
  options: {
    documentId: string;
    createType: 'pir-page' | 'pir-layout';
    acceptedExistingTypes?: readonly (
      'pir-page' | 'pir-layout' | 'pir-component'
    )[];
    path: string;
  }
): {
  workspace: WorkspaceSnapshot;
  document: WorkspaceDocument;
  created: boolean;
} | null => {
  const existing = workspace.docsById[options.documentId];
  if (existing) {
    const acceptedExistingTypes: readonly WorkspaceDocument['type'][] =
      options.acceptedExistingTypes ?? [options.createType];
    if (!acceptedExistingTypes.includes(existing.type)) {
      return null;
    }
    return { workspace, document: existing, created: false };
  }
  const document: WorkspaceDocument = {
    id: options.documentId,
    type: options.createType,
    path: options.path,
    contentRev: 1,
    metaRev: 1,
    content: createDefaultPirDoc(),
  };
  let attachment;
  try {
    attachment = planWorkspaceDocumentAtPath(workspace, document);
  } catch {
    return null;
  }
  return {
    workspace: attachment.snapshot,
    document,
    created: true,
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
  if (reference?.artifactId?.trim()) runtime[key] = reference;
  else delete runtime[key];
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

const appendRouteAtPath = (
  manifest: WorkspaceRouteManifest,
  path: string,
  routeNodeId: string,
  pageDocId: string,
  idFactory: WorkspaceRouteIntentIdFactory
): WorkspaceRouteManifest | null => {
  if (findRouteNodeById(manifest.root, routeNodeId)) return null;
  const normalizedPath = normalizeRoutePath(path);
  if (normalizedPath === '/') {
    if ((manifest.root.children ?? []).some((child) => child.index))
      return null;
    return {
      ...manifest,
      root: {
        ...manifest.root,
        children: [
          ...(manifest.root.children ?? []),
          { id: routeNodeId, index: true, pageDocId },
        ],
      },
    };
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  let root = manifest.root;
  let parentId = root.id;
  for (const [index, rawSegment] of segments.entries()) {
    const segment = trimRouteSegment(rawSegment);
    if (!segment) return null;
    const parent = findRouteNodeById(root, parentId);
    if (!parent) return null;
    const existing = (parent.children ?? []).find(
      (child) => !child.index && child.segment === segment
    );
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      if (existing) return null;
      root = updateRouteNodeById(root, parentId, (node) => ({
        ...node,
        children: [
          ...(node.children ?? []),
          { id: routeNodeId, segment, pageDocId },
        ],
      }));
      continue;
    }
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const intermediateId = idFactory('route');
    root = updateRouteNodeById(root, parentId, (node) => ({
      ...node,
      children: [
        ...(node.children ?? []),
        { id: intermediateId, segment, children: [] },
      ],
    }));
    parentId = intermediateId;
  }
  return { ...manifest, root };
};

const resolveRouteSelection = (
  workspace: WorkspaceSnapshot,
  requestedRouteNodeId: string | undefined
): WorkspaceSnapshot | null => {
  const composed = composeRouteManifestWithModules(
    workspace.routeManifest
  ).manifest;
  const normalizedRouteNodeId = requestedRouteNodeId?.trim();
  const routeNodeId =
    normalizedRouteNodeId || resolveDefaultActiveRouteNodeId(composed);
  const routeNode = findRouteNodeById(composed.root, routeNodeId);
  if (!routeNode) return null;
  const pageDocId = routeNode.pageDocId?.trim();
  return {
    ...workspace,
    activeRouteNodeId: routeNode.id,
    ...(pageDocId && workspace.docsById[pageDocId]
      ? { activeDocumentId: pageDocId }
      : {}),
  };
};

/** Keeps the authoring document aligned with the explicitly selected route page. */
export const selectWorkspaceRoute = (
  workspace: WorkspaceSnapshot,
  routeNodeId: string | undefined
): WorkspaceSnapshot | null => resolveRouteSelection(workspace, routeNodeId);

const applyWorkspaceRouteIntent = (
  workspace: WorkspaceSnapshot,
  intent: WorkspaceRouteIntent,
  idFactory: WorkspaceRouteIntentIdFactory
): WorkspaceSnapshot | null => {
  let next = workspace;
  let nextManifest = workspace.routeManifest;

  if (intent.type === 'create-page') {
    const routeNodeId = intent.routeNodeId?.trim() || idFactory('route');
    const documentId = idFactory('page');
    const documentResult = createOrReuseRouteDocument(workspace, {
      documentId,
      createType: 'pir-page',
      path: `/pages/${documentId}.pir.json`,
    });
    if (!documentResult) return null;
    const routeManifest = appendRouteAtPath(
      nextManifest,
      intent.path,
      routeNodeId,
      documentId,
      idFactory
    );
    if (!routeManifest) return null;
    next = {
      ...documentResult.workspace,
      routeManifest,
      activeRouteNodeId: routeNodeId,
      activeDocumentId: documentId,
    };
  } else if (intent.type === 'create-child-route') {
    const parent = findRouteNodeById(
      nextManifest.root,
      intent.parentRouteNodeId
    );
    const segment = trimRouteSegment(intent.segment);
    if (
      !parent ||
      !segment ||
      (parent.children ?? []).some(
        (child) => !child.index && child.segment === segment
      )
    ) {
      return null;
    }
    const routeNodeId = intent.routeNodeId?.trim() || idFactory('route');
    if (findRouteNodeById(nextManifest.root, routeNodeId)) return null;
    const requestedDocumentId = intent.pageDocId?.trim();
    const documentId = requestedDocumentId || idFactory('page');
    const documentResult = createOrReuseRouteDocument(workspace, {
      documentId,
      createType: 'pir-page',
      ...(requestedDocumentId
        ? { acceptedExistingTypes: ['pir-page', 'pir-component'] as const }
        : {}),
      path: `/pages/${documentId}.pir.json`,
    });
    if (!documentResult) return null;
    nextManifest = {
      ...nextManifest,
      root: updateRouteNodeById(
        nextManifest.root,
        intent.parentRouteNodeId,
        (node) => ({
          ...node,
          children: [
            ...(node.children ?? []),
            { id: routeNodeId, segment, pageDocId: documentId },
          ],
        })
      ),
    };
    next = {
      ...documentResult.workspace,
      routeManifest: nextManifest,
      activeRouteNodeId: routeNodeId,
      activeDocumentId: documentId,
    };
  } else if (intent.type === 'create-index') {
    const parent = findRouteNodeById(
      nextManifest.root,
      intent.parentRouteNodeId
    );
    if (!parent || (parent.children ?? []).some((child) => child.index)) {
      return null;
    }
    const routeNodeId = intent.routeNodeId?.trim() || idFactory('route');
    if (findRouteNodeById(nextManifest.root, routeNodeId)) return null;
    const requestedDocumentId = intent.pageDocId?.trim();
    const documentId = requestedDocumentId || idFactory('page');
    const documentResult = createOrReuseRouteDocument(workspace, {
      documentId,
      createType: 'pir-page',
      ...(requestedDocumentId
        ? { acceptedExistingTypes: ['pir-page', 'pir-component'] as const }
        : {}),
      path: `/pages/${documentId}.pir.json`,
    });
    if (!documentResult) return null;
    nextManifest = {
      ...nextManifest,
      root: updateRouteNodeById(
        nextManifest.root,
        intent.parentRouteNodeId,
        (node) => ({
          ...node,
          children: [
            { id: routeNodeId, index: true, pageDocId: documentId },
            ...(node.children ?? []),
          ],
        })
      ),
    };
    next = {
      ...documentResult.workspace,
      routeManifest: nextManifest,
      activeRouteNodeId: routeNodeId,
      activeDocumentId: documentId,
    };
  } else if (intent.type === 'rename-segment') {
    const target = findRouteNodeById(nextManifest.root, intent.routeNodeId);
    const segment = trimRouteSegment(intent.segment);
    if (
      !target ||
      target.index ||
      target.id === nextManifest.root.id ||
      !segment
    ) {
      return null;
    }
    next = {
      ...workspace,
      routeManifest: {
        ...nextManifest,
        root: updateRouteNodeById(
          nextManifest.root,
          intent.routeNodeId,
          (node) => ({ ...node, segment })
        ),
      },
    };
  } else if (intent.type === 'move-route') {
    const moved = moveRouteNodeById(
      nextManifest.root,
      intent.routeNodeId,
      intent.parentRouteNodeId,
      intent.index
    );
    if (!moved.moved) return null;
    next = {
      ...workspace,
      routeManifest: { ...nextManifest, root: moved.root },
    };
  } else if (intent.type === 'attach-layout') {
    const target = findRouteNodeById(nextManifest.root, intent.routeNodeId);
    if (!target || target.layoutDocId) return null;
    const documentId = intent.layoutDocId?.trim() || idFactory('layout');
    const documentResult = createOrReuseRouteDocument(workspace, {
      documentId,
      createType: 'pir-layout',
      path: `/layouts/${documentId}.pir.json`,
    });
    if (!documentResult) return null;
    next = {
      ...documentResult.workspace,
      routeManifest: {
        ...nextManifest,
        root: updateRouteNodeById(
          nextManifest.root,
          intent.routeNodeId,
          (node) => ({ ...node, layoutDocId: documentId })
        ),
      },
      activeDocumentId: documentId,
    };
  } else if (intent.type === 'detach-layout') {
    const target = findRouteNodeById(nextManifest.root, intent.routeNodeId);
    if (!target?.layoutDocId) return null;
    next = {
      ...workspace,
      routeManifest: {
        ...nextManifest,
        root: updateRouteNodeById(
          nextManifest.root,
          intent.routeNodeId,
          (node) => ({ ...node, layoutDocId: undefined })
        ),
      },
    };
  } else if (intent.type === 'bind-outlet') {
    const routeNodeId = intent.routeNodeId.trim();
    const outletNodeId = intent.outletNodeId.trim();
    const outletName = intent.outletName?.trim() || 'default';
    const target = findRouteNodeById(nextManifest.root, routeNodeId);
    if (!routeNodeId || !outletNodeId || !target) return null;
    const alreadyBound =
      outletName === 'default'
        ? target.outletNodeId === outletNodeId
        : target.outletBindings?.[outletName]?.outletNodeId === outletNodeId;
    const clearedRoot = clearOutletBindingFromRouteTree(
      nextManifest.root,
      outletNodeId,
      outletName,
      routeNodeId
    );
    if (alreadyBound && clearedRoot === nextManifest.root) return null;
    const root = updateRouteNodeById(clearedRoot, routeNodeId, (node) =>
      outletName === 'default'
        ? { ...node, outletNodeId }
        : {
            ...node,
            outletBindings: {
              ...(node.outletBindings ?? {}),
              [outletName]: { outletNodeId },
            },
          }
    );
    if (root === nextManifest.root) return null;
    next = { ...workspace, routeManifest: { ...nextManifest, root } };
  } else if (intent.type === 'unbind-outlet') {
    const routeNodeId = intent.routeNodeId.trim();
    const outletName = intent.outletName?.trim() || 'default';
    const target = findRouteNodeById(nextManifest.root, routeNodeId);
    if (!routeNodeId || !target) return null;
    if (outletName === 'default' && !target.outletNodeId) return null;
    if (outletName !== 'default' && !target.outletBindings?.[outletName]) {
      return null;
    }
    next = {
      ...workspace,
      routeManifest: {
        ...nextManifest,
        root: updateRouteNodeById(nextManifest.root, routeNodeId, (node) => {
          if (outletName === 'default') {
            return { ...node, outletNodeId: undefined };
          }
          const outletBindings = { ...(node.outletBindings ?? {}) };
          delete outletBindings[outletName];
          return {
            ...node,
            outletBindings: Object.keys(outletBindings).length
              ? outletBindings
              : undefined,
          };
        }),
      },
    };
  } else if (intent.type === 'set-runtime-ref') {
    if (!findRouteNodeById(nextManifest.root, intent.routeNodeId)) return null;
    next = {
      ...workspace,
      routeManifest: {
        ...nextManifest,
        root: updateRouteNodeById(
          nextManifest.root,
          intent.routeNodeId,
          (node) => updateRouteRuntimeRef(node, intent.kind, intent.reference)
        ),
      },
    };
  } else if (intent.type === 'delete-route') {
    if (intent.routeNodeId === nextManifest.root.id) return null;
    const removed = removeRouteNodeById(nextManifest.root, intent.routeNodeId);
    if (!removed.removed) return null;
    const routeManifest = { ...nextManifest, root: removed.node };
    next = { ...workspace, routeManifest };
    const activeRouteStillExists = workspace.activeRouteNodeId
      ? Boolean(
          findRouteNodeById(routeManifest.root, workspace.activeRouteNodeId)
        )
      : false;
    if (!activeRouteStillExists) {
      const selected = resolveRouteSelection(
        next,
        resolveDefaultActiveRouteNodeId(routeManifest)
      );
      if (!selected) return null;
      next = selected;
    }
  }

  const routeIssues = validateRouteManifest({
    manifest: next.routeManifest,
    documentExists: (documentId) => Boolean(next.docsById[documentId]),
  });
  return routeIssues.length ? null : next;
};

const hasWorkspaceDocumentChanges = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): boolean =>
  before.docsById !== after.docsById ||
  before.treeById !== after.treeById ||
  before.treeRootId !== after.treeRootId;

/** Plans a route user action as either one command or an atomic transaction. */
export const createWorkspaceRouteIntentPlan = (
  workspace: WorkspaceSnapshot,
  intent: WorkspaceRouteIntent,
  options: WorkspaceRouteIntentPlanOptions = {}
): WorkspaceRouteIntentPlan | null => {
  const idFactory = options.idFactory ?? createDefaultRouteIntentId;
  const after = applyWorkspaceRouteIntent(workspace, intent, idFactory);
  if (!after || after === workspace) return null;
  const id = options.id ?? idFactory('route-operation');
  const issuedAt =
    options.issuedAt ?? options.clock?.() ?? new Date().toISOString();

  if (!hasWorkspaceDocumentChanges(workspace, after)) {
    const command = createRouteIntentCommand({
      commandId: id,
      issuedAt,
      intent,
      before: workspace,
      after,
    });
    return command.forwardOps.length ? { kind: 'command', command } : null;
  }

  const afterWorkspaceMutation: WorkspaceSnapshot = {
    ...workspace,
    treeRootId: after.treeRootId,
    treeById: after.treeById,
    docsById: after.docsById,
    activeDocumentId: after.activeDocumentId,
  };
  return {
    kind: 'transaction',
    transaction: createRouteIntentTransaction({
      transactionId: id,
      issuedAt,
      intent,
      before: workspace,
      afterWorkspaceMutation,
      after,
    }),
  };
};
