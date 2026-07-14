import {
  applyWorkspaceCommand,
  type WorkspaceCodeDocumentCreateIntentRequest,
  type WorkspaceCodeDocumentDeleteIntentRequest,
  type WorkspaceCodeDocumentRenameIntentRequest,
  type WorkspaceCommandEnvelope,
  type WorkspaceDirectoryCreateIntentRequest,
  type WorkspaceDirectoryDeleteIntentRequest,
  type WorkspaceDirectoryRenameIntentRequest,
  type WorkspaceDocumentCreateIntentRequest,
  type WorkspaceDocumentDeleteIntentRequest,
  type WorkspaceDocumentRenameIntentRequest,
  type WorkspacePatchOperation,
} from './workspaceCommand';
import {
  createWorkspaceDocumentNodeId,
  createWorkspacePathNodeId,
} from './workspaceDocumentFactory';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from './types';

export type WorkspaceVfsIntentRequest =
  | WorkspaceCodeDocumentCreateIntentRequest
  | WorkspaceCodeDocumentRenameIntentRequest
  | WorkspaceCodeDocumentDeleteIntentRequest
  | WorkspaceDocumentCreateIntentRequest
  | WorkspaceDocumentRenameIntentRequest
  | WorkspaceDocumentDeleteIntentRequest
  | WorkspaceDirectoryCreateIntentRequest
  | WorkspaceDirectoryRenameIntentRequest
  | WorkspaceDirectoryDeleteIntentRequest;

export type WorkspaceVfsIntentPlan = Readonly<{
  kind: 'command';
  command: WorkspaceCommandEnvelope;
}>;

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const normalizePath = (value: string): string | null => {
  const segments = value
    .trim()
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean);
  if (
    !segments.length ||
    segments.some((segment) => segment === '.' || segment === '..')
  ) {
    return null;
  }
  return `/${segments.join('/')}`;
};

const normalizeName = (value: string): string | null => {
  const name = value.trim();
  return !name || name === '.' || name === '..' || /[\\/]/.test(name)
    ? null
    : name;
};

const cloneTree = (
  treeById: WorkspaceSnapshot['treeById']
): WorkspaceSnapshot['treeById'] =>
  Object.fromEntries(
    Object.entries(treeById).map(([id, node]) => [
      id,
      { ...node, ...(node.children ? { children: [...node.children] } : {}) },
    ])
  );

const cloneDocuments = (
  docsById: WorkspaceSnapshot['docsById']
): WorkspaceSnapshot['docsById'] => ({ ...docsById });

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const createAvailableNodeId = (
  treeById: WorkspaceSnapshot['treeById'],
  preferredId: string
): string => {
  if (!treeById[preferredId]) return preferredId;
  let suffix = 2;
  while (treeById[`${preferredId}-${suffix}`]) suffix += 1;
  return `${preferredId}-${suffix}`;
};

const getChildByName = (
  treeById: WorkspaceSnapshot['treeById'],
  parent: WorkspaceVfsNode,
  name: string
): WorkspaceVfsNode | undefined =>
  (parent.children ?? [])
    .map((childId) => treeById[childId])
    .find((child) => child?.name === name);

const ensureDirectoryPath = (
  treeById: WorkspaceSnapshot['treeById'],
  rootId: string,
  segments: readonly string[]
): string | null => {
  let parentId = rootId;
  const authoredSegments: string[] = [];
  for (const segment of segments) {
    authoredSegments.push(segment);
    const parent = treeById[parentId];
    if (!parent || parent.kind !== 'dir') return null;
    const existing = getChildByName(treeById, parent, segment);
    if (existing) {
      if (existing.kind !== 'dir') return null;
      parentId = existing.id;
      continue;
    }
    const id = createAvailableNodeId(
      treeById,
      createWorkspacePathNodeId('dir', authoredSegments)
    );
    treeById[id] = {
      id,
      kind: 'dir',
      name: segment,
      parentId,
      children: [],
    };
    parent.children = [...(parent.children ?? []), id];
    parentId = id;
  }
  return parentId;
};

const findDocumentNode = (
  treeById: WorkspaceSnapshot['treeById'],
  documentId: string
): WorkspaceVfsNode | undefined =>
  Object.values(treeById).find(
    (node) => node.kind === 'doc' && node.docId === documentId
  );

const collectSubtreeNodeIds = (
  treeById: WorkspaceSnapshot['treeById'],
  nodeId: string,
  collected = new Set<string>()
): Set<string> => {
  const node = treeById[nodeId];
  if (!node || collected.has(nodeId)) return collected;
  collected.add(nodeId);
  if (node.kind === 'dir') {
    (node.children ?? []).forEach((childId) =>
      collectSubtreeNodeIds(treeById, childId, collected)
    );
  }
  return collected;
};

const getNodePath = (
  treeById: WorkspaceSnapshot['treeById'],
  rootId: string,
  nodeId: string
): string | null => {
  const segments: string[] = [];
  const visited = new Set<string>();
  let node = treeById[nodeId];
  while (node && node.id !== rootId) {
    if (visited.has(node.id) || node.parentId === null) return null;
    visited.add(node.id);
    segments.unshift(node.name);
    node = treeById[node.parentId];
  }
  return node?.id === rootId ? `/${segments.join('/')}` : null;
};

const updateActiveDocument = (snapshot: WorkspaceSnapshot): void => {
  if (
    snapshot.activeDocumentId &&
    !snapshot.docsById[snapshot.activeDocumentId]
  ) {
    snapshot.activeDocumentId = Object.keys(snapshot.docsById).sort()[0];
  }
};

const createDocument = (
  workspace: WorkspaceSnapshot,
  request:
    | WorkspaceCodeDocumentCreateIntentRequest
    | WorkspaceDocumentCreateIntentRequest
): WorkspaceSnapshot | null => {
  const payload = request.intent.payload;
  const path = normalizePath(payload.path);
  if (!path || workspace.docsById[payload.documentId]) return null;
  if (
    Object.values(workspace.docsById).some(
      (document) => normalizePath(document.path) === path
    )
  ) {
    return null;
  }
  const segments = path.slice(1).split('/');
  const name = segments.at(-1)!;
  const treeById = cloneTree(workspace.treeById);
  const parentId = ensureDirectoryPath(
    treeById,
    workspace.treeRootId,
    segments.slice(0, -1)
  );
  if (!parentId) return null;
  const parent = treeById[parentId];
  if (
    !parent ||
    parent.kind !== 'dir' ||
    getChildByName(treeById, parent, name)
  ) {
    return null;
  }
  const preferredNodeId =
    payload.nodeId?.trim() || createWorkspaceDocumentNodeId(payload.documentId);
  if (treeById[preferredNodeId]) return null;
  const document: WorkspaceDocument = {
    id: payload.documentId,
    type: 'type' in payload ? payload.type : 'code',
    name,
    path,
    contentRev: 1,
    metaRev: 1,
    content: payload.content,
  };
  treeById[preferredNodeId] = {
    id: preferredNodeId,
    kind: 'doc',
    name,
    parentId,
    docId: payload.documentId,
  };
  parent.children = [...(parent.children ?? []), preferredNodeId];
  return {
    ...workspace,
    treeById,
    docsById: { ...workspace.docsById, [document.id]: document },
    activeDocumentId: document.id,
  };
};

const renameDocument = (
  workspace: WorkspaceSnapshot,
  request:
    | WorkspaceCodeDocumentRenameIntentRequest
    | WorkspaceDocumentRenameIntentRequest
): WorkspaceSnapshot | null => {
  const payload = request.intent.payload;
  const document = workspace.docsById[payload.documentId];
  const path = normalizePath(payload.path);
  if (!document || !path) return null;
  if ('type' in payload && document.type !== payload.type) {
    return null;
  }
  if (
    Object.values(workspace.docsById).some(
      (candidate) =>
        candidate.id !== document.id && normalizePath(candidate.path) === path
    )
  ) {
    return null;
  }
  const treeById = cloneTree(workspace.treeById);
  const node = findDocumentNode(treeById, document.id);
  if (!node || node.parentId === null) return null;
  const segments = path.slice(1).split('/');
  const name = segments.at(-1)!;
  const nextParentId = ensureDirectoryPath(
    treeById,
    workspace.treeRootId,
    segments.slice(0, -1)
  );
  if (!nextParentId) return null;
  const currentParent = treeById[node.parentId];
  const nextParent = treeById[nextParentId];
  if (
    !currentParent ||
    currentParent.kind !== 'dir' ||
    !nextParent ||
    nextParent.kind !== 'dir'
  ) {
    return null;
  }
  const duplicate = getChildByName(treeById, nextParent, name);
  if (duplicate && duplicate.id !== node.id) return null;
  if (currentParent.id !== nextParent.id) {
    currentParent.children = (currentParent.children ?? []).filter(
      (childId) => childId !== node.id
    );
    nextParent.children = [...(nextParent.children ?? []), node.id];
  }
  treeById[node.id] = { ...node, name, parentId: nextParent.id };
  return {
    ...workspace,
    treeById,
    docsById: {
      ...workspace.docsById,
      [document.id]: { ...document, name, path },
    },
  };
};

const deleteDocument = (
  workspace: WorkspaceSnapshot,
  request:
    | WorkspaceCodeDocumentDeleteIntentRequest
    | WorkspaceDocumentDeleteIntentRequest
): WorkspaceSnapshot | null => {
  const payload = request.intent.payload;
  const document = workspace.docsById[payload.documentId];
  if (!document || Object.keys(workspace.docsById).length <= 1) return null;
  if ('type' in payload && document.type !== payload.type) {
    return null;
  }
  const treeById = cloneTree(workspace.treeById);
  const node = findDocumentNode(treeById, document.id);
  if (!node || node.parentId === null) return null;
  const parent = treeById[node.parentId];
  if (!parent || parent.kind !== 'dir') return null;
  parent.children = (parent.children ?? []).filter(
    (childId) => childId !== node.id
  );
  delete treeById[node.id];
  const docsById = cloneDocuments(workspace.docsById);
  delete docsById[document.id];
  const next = { ...workspace, treeById, docsById };
  updateActiveDocument(next);
  return next;
};

const createDirectory = (
  workspace: WorkspaceSnapshot,
  request: WorkspaceDirectoryCreateIntentRequest
): WorkspaceSnapshot | null => {
  const payload = request.intent.payload;
  const name = normalizeName(payload.name);
  const nodeId = payload.nodeId.trim();
  const parentId = payload.parentNodeId?.trim() || workspace.treeRootId;
  if (!name || !nodeId || workspace.treeById[nodeId]) return null;
  const treeById = cloneTree(workspace.treeById);
  const parent = treeById[parentId];
  if (
    !parent ||
    parent.kind !== 'dir' ||
    getChildByName(treeById, parent, name)
  ) {
    return null;
  }
  treeById[nodeId] = {
    id: nodeId,
    kind: 'dir',
    name,
    parentId,
    children: [],
  };
  parent.children = [...(parent.children ?? []), nodeId];
  return { ...workspace, treeById };
};

const renameDirectory = (
  workspace: WorkspaceSnapshot,
  request: WorkspaceDirectoryRenameIntentRequest
): WorkspaceSnapshot | null => {
  const payload = request.intent.payload;
  const name = normalizeName(payload.name);
  const treeById = cloneTree(workspace.treeById);
  const node = treeById[payload.nodeId];
  if (!name || !node || node.kind !== 'dir' || node.parentId === null) {
    return null;
  }
  const parent = treeById[node.parentId];
  if (
    !parent ||
    parent.kind !== 'dir' ||
    (getChildByName(treeById, parent, name)?.id ?? node.id) !== node.id
  ) {
    return null;
  }
  treeById[node.id] = { ...node, name };
  const docsById = cloneDocuments(workspace.docsById);
  for (const descendantId of collectSubtreeNodeIds(treeById, node.id)) {
    const descendant = treeById[descendantId];
    if (descendant?.kind !== 'doc' || !descendant.docId) continue;
    const document = docsById[descendant.docId];
    const path = getNodePath(treeById, workspace.treeRootId, descendant.id);
    if (!document || !path) return null;
    docsById[document.id] = { ...document, name: descendant.name, path };
  }
  return { ...workspace, treeById, docsById };
};

const deleteDirectory = (
  workspace: WorkspaceSnapshot,
  request: WorkspaceDirectoryDeleteIntentRequest
): WorkspaceSnapshot | null => {
  const treeById = cloneTree(workspace.treeById);
  const node = treeById[request.intent.payload.nodeId];
  if (!node || node.kind !== 'dir' || node.parentId === null) return null;
  const parent = treeById[node.parentId];
  if (!parent || parent.kind !== 'dir') return null;
  const removedNodeIds = collectSubtreeNodeIds(treeById, node.id);
  const removedDocumentIds = [...removedNodeIds]
    .map((nodeId) => treeById[nodeId])
    .filter((candidate) => candidate?.kind === 'doc' && candidate.docId)
    .map((candidate) => candidate!.docId!);
  if (Object.keys(workspace.docsById).length <= removedDocumentIds.length) {
    return null;
  }
  parent.children = (parent.children ?? []).filter(
    (childId) => childId !== node.id
  );
  removedNodeIds.forEach((nodeId) => delete treeById[nodeId]);
  const docsById = cloneDocuments(workspace.docsById);
  removedDocumentIds.forEach((documentId) => delete docsById[documentId]);
  const next = { ...workspace, treeById, docsById };
  updateActiveDocument(next);
  return next;
};

const metadataPatch = (
  documentId: string,
  field: 'name' | 'path',
  before: string | undefined,
  after: string | undefined
): {
  forward: WorkspacePatchOperation;
  reverse: WorkspacePatchOperation;
} | null => {
  if (before === after) return null;
  const path = `/docsById/${escapePointerSegment(documentId)}/${field}`;
  if (before === undefined) {
    return {
      forward: { op: 'add', path, value: after },
      reverse: { op: 'remove', path },
    };
  }
  if (after === undefined) {
    return {
      forward: { op: 'remove', path },
      reverse: { op: 'add', path, value: before },
    };
  }
  return {
    forward: { op: 'replace', path, value: after },
    reverse: { op: 'replace', path, value: before },
  };
};

const createCommand = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot,
  request: WorkspaceVfsIntentRequest
): WorkspaceCommandEnvelope | null => {
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  const documentIds = new Set([
    ...Object.keys(before.docsById),
    ...Object.keys(after.docsById),
  ]);
  [...documentIds].sort().forEach((documentId) => {
    const previous = before.docsById[documentId];
    const next = after.docsById[documentId];
    const path = `/docsById/${escapePointerSegment(documentId)}`;
    if (!previous && next) {
      forwardOps.push({ op: 'add', path, value: next });
      reverseOps.unshift({ op: 'remove', path });
      return;
    }
    if (previous && !next) {
      forwardOps.push({ op: 'remove', path });
      reverseOps.unshift({ op: 'add', path, value: previous });
      return;
    }
    if (!previous || !next) return;
    for (const field of ['name', 'path'] as const) {
      const patch = metadataPatch(
        documentId,
        field,
        previous[field],
        next[field]
      );
      if (patch) {
        forwardOps.push(patch.forward);
        reverseOps.unshift(patch.reverse);
      }
    }
  });
  if (!valuesEqual(before.treeById, after.treeById)) {
    forwardOps.push({
      op: 'replace',
      path: '/treeById',
      value: after.treeById,
    });
    reverseOps.unshift({
      op: 'replace',
      path: '/treeById',
      value: before.treeById,
    });
  }
  if (before.activeDocumentId !== after.activeDocumentId) {
    if (before.activeDocumentId === undefined) {
      forwardOps.push({
        op: 'add',
        path: '/activeDocumentId',
        value: after.activeDocumentId,
      });
      reverseOps.unshift({ op: 'remove', path: '/activeDocumentId' });
    } else if (after.activeDocumentId === undefined) {
      forwardOps.push({ op: 'remove', path: '/activeDocumentId' });
      reverseOps.unshift({
        op: 'add',
        path: '/activeDocumentId',
        value: before.activeDocumentId,
      });
    } else {
      forwardOps.push({
        op: 'replace',
        path: '/activeDocumentId',
        value: after.activeDocumentId,
      });
      reverseOps.unshift({
        op: 'replace',
        path: '/activeDocumentId',
        value: before.activeDocumentId,
      });
    }
  }
  if (!forwardOps.length || !reverseOps.length) return null;
  return {
    id: request.intent.id,
    namespace: 'core.workspace',
    type: request.intent.type,
    version: request.intent.version,
    issuedAt: request.intent.issuedAt,
    target: { workspaceId: before.id },
    domainHint: 'workspace',
    label: request.intent.type,
    forwardOps,
    reverseOps,
  };
};

/**
 * Materializes one VFS request as an exact reversible command without choosing
 * a domain validation policy. Versioned domain planners use this boundary and
 * validate the resulting transaction through the canonical Workspace policy.
 */
export const createWorkspaceVfsIntentCommandPlan = (
  workspace: WorkspaceSnapshot,
  request: WorkspaceVfsIntentRequest
): WorkspaceVfsIntentPlan | null => {
  if (request.expectedWorkspaceRev !== workspace.workspaceRev) return null;
  let after: WorkspaceSnapshot | null = null;
  switch (request.intent.type) {
    case 'code-document.create':
    case 'document.create':
      after = createDocument(
        workspace,
        request as
          | WorkspaceCodeDocumentCreateIntentRequest
          | WorkspaceDocumentCreateIntentRequest
      );
      break;
    case 'code-document.rename':
    case 'document.rename':
      after = renameDocument(
        workspace,
        request as
          | WorkspaceCodeDocumentRenameIntentRequest
          | WorkspaceDocumentRenameIntentRequest
      );
      break;
    case 'code-document.delete':
    case 'document.delete':
      after = deleteDocument(
        workspace,
        request as
          | WorkspaceCodeDocumentDeleteIntentRequest
          | WorkspaceDocumentDeleteIntentRequest
      );
      break;
    case 'directory.create':
      after = createDirectory(
        workspace,
        request as WorkspaceDirectoryCreateIntentRequest
      );
      break;
    case 'directory.rename':
      after = renameDirectory(
        workspace,
        request as WorkspaceDirectoryRenameIntentRequest
      );
      break;
    case 'directory.delete':
      after = deleteDirectory(
        workspace,
        request as WorkspaceDirectoryDeleteIntentRequest
      );
      break;
  }
  if (!after) return null;
  const command = createCommand(workspace, after, request);
  return command ? { kind: 'command', command } : null;
};

/** Converts a VFS request into one current-policy reversible operation. */
export const createWorkspaceVfsIntentPlan = (
  workspace: WorkspaceSnapshot,
  request: WorkspaceVfsIntentRequest
): WorkspaceVfsIntentPlan | null => {
  const plan = createWorkspaceVfsIntentCommandPlan(workspace, request);
  if (!plan) return null;
  const applied = applyWorkspaceCommand(workspace, plan.command);
  return applied.ok ? plan : null;
};
