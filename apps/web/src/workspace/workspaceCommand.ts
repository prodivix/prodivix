import type {
  StableWorkspaceDocument,
  StableWorkspaceVfsNode,
  StableWorkspaceSnapshot,
  WorkspaceDocumentId,
  WorkspaceId,
  WorkspaceVfsNodeId,
  WorkspaceValidationIssue,
  WorkspaceCodeDocumentContent,
  StableWorkspaceDocumentType,
} from './types';
import { validateStableWorkspaceSnapshot } from './validateWorkspaceVfs';
import { isPirDocumentContent } from './workspaceSelectors';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';
import {
  collectRouteManifestDocumentRefs,
  type WorkspaceRouteNode,
  type WorkspaceRouteManifest,
} from '@prodivix/shared/router';

export type WorkspacePatchOperation = {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
};

export type WorkspaceCommandEnvelope = {
  id: string;
  namespace: string;
  type: string;
  version: string;
  issuedAt: string;
  forwardOps: WorkspacePatchOperation[];
  reverseOps: WorkspacePatchOperation[];
  target: {
    workspaceId: WorkspaceId;
    documentId?: WorkspaceDocumentId;
    routeNodeId?: string;
  };
  mergeKey?: string;
  label?: string;
  domainHint?:
    | 'pir'
    | 'workspace'
    | 'route'
    | 'nodegraph'
    | 'animation'
    | 'code';
};

export type WorkspaceCommandDomain = NonNullable<
  WorkspaceCommandEnvelope['domainHint']
>;

export type WorkspaceCommandIssueCode =
  | 'WKS_COMMAND_INVALID_ENVELOPE'
  | 'WKS_COMMAND_WORKSPACE_MISMATCH'
  | 'WKS_COMMAND_DOCUMENT_MISSING'
  | 'WKS_COMMAND_PATCH_PATH_FORBIDDEN'
  | 'WKS_COMMAND_PATCH_FAILED'
  | 'WKS_COMMAND_VALIDATION_FAILED';

export type WorkspaceCommandIssue = {
  code: WorkspaceCommandIssueCode;
  path: string;
  message: string;
  documentId?: WorkspaceDocumentId;
  validationIssues?: WorkspaceValidationIssue[];
};

export type WorkspaceCommandApplyResult =
  | {
      ok: true;
      snapshot: StableWorkspaceSnapshot;
      command: WorkspaceCommandEnvelope;
    }
  | {
      ok: false;
      issues: WorkspaceCommandIssue[];
    };

export type CreateWorkspaceCodeDocumentCommandInput = {
  workspace: StableWorkspaceSnapshot;
  commandId: string;
  issuedAt: string;
  parentNodeId: WorkspaceVfsNodeId;
  documentId: WorkspaceDocumentId;
  nodeId: WorkspaceVfsNodeId;
  name: string;
  content: WorkspaceCodeDocumentContent;
  label?: string;
};

export type CreateWorkspaceCodeDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  nodeId?: WorkspaceVfsNodeId;
  parentNodeId?: WorkspaceVfsNodeId;
  path: string;
  content: WorkspaceCodeDocumentContent;
  clientMutationId?: string;
};

export type RenameWorkspaceCodeDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  path: string;
  clientMutationId?: string;
};

export type DeleteWorkspaceCodeDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  clientMutationId?: string;
};

export type CreateWorkspaceDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  nodeId?: WorkspaceVfsNodeId;
  parentNodeId?: WorkspaceVfsNodeId;
  path: string;
  type: StableWorkspaceDocumentType;
  content: unknown;
  clientMutationId?: string;
};

export type RenameWorkspaceDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  path: string;
  type: StableWorkspaceDocumentType;
  clientMutationId?: string;
};

export type DeleteWorkspaceDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  type: StableWorkspaceDocumentType;
  clientMutationId?: string;
};

export type CreateWorkspaceDirectoryIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  nodeId: WorkspaceVfsNodeId;
  parentNodeId?: WorkspaceVfsNodeId;
  name: string;
  clientMutationId?: string;
};

export type RenameWorkspaceDirectoryIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  nodeId: WorkspaceVfsNodeId;
  name: string;
  clientMutationId?: string;
};

export type DeleteWorkspaceDirectoryIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  nodeId: WorkspaceVfsNodeId;
  clientMutationId?: string;
};

export type WorkspaceCodeDocumentCreateIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'code-document.create';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
      nodeId?: WorkspaceVfsNodeId;
      parentNodeId?: WorkspaceVfsNodeId;
      path: string;
      content: WorkspaceCodeDocumentContent;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceCodeDocumentRenameIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'code-document.rename';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
      path: string;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceCodeDocumentDeleteIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'code-document.delete';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDocumentCreateIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'document.create';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
      nodeId?: WorkspaceVfsNodeId;
      parentNodeId?: WorkspaceVfsNodeId;
      path: string;
      type: StableWorkspaceDocumentType;
      content: unknown;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDocumentRenameIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'document.rename';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
      path: string;
      type: StableWorkspaceDocumentType;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDocumentDeleteIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'document.delete';
    version: '1.0';
    payload: {
      documentId: WorkspaceDocumentId;
      type: StableWorkspaceDocumentType;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDirectoryCreateIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'directory.create';
    version: '1.0';
    payload: {
      nodeId: WorkspaceVfsNodeId;
      parentNodeId?: WorkspaceVfsNodeId;
      name: string;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDirectoryRenameIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'directory.rename';
    version: '1.0';
    payload: {
      nodeId: WorkspaceVfsNodeId;
      name: string;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

export type WorkspaceDirectoryDeleteIntentRequest = {
  expectedWorkspaceRev: number;
  intent: {
    id: string;
    namespace: 'core.workspace';
    type: 'directory.delete';
    version: '1.0';
    payload: {
      nodeId: WorkspaceVfsNodeId;
    };
    issuedAt: string;
  };
  clientMutationId?: string;
};

type PatchTarget = 'document' | 'workspace';
type DocumentPatchDomain = Exclude<
  WorkspaceCommandDomain,
  'workspace' | 'route'
>;
type PatchApplyResult =
  | { ok: true; value: unknown }
  | { ok: false; path: string };

const isPatchFailure = (
  result: PatchApplyResult
): result is { ok: false; path: string } => result.ok === false;

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const decodePointerSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

const parsePointer = (path: string): string[] | undefined => {
  if (path === '') return [];
  if (!path.startsWith('/')) return undefined;
  return path.slice(1).split('/').map(decodePointerSegment);
};

const getValueAtPath = (
  source: unknown,
  path: string
): { ok: true; value: unknown } | { ok: false } => {
  const segments = parsePointer(path);
  if (!segments) return { ok: false };

  let current = source;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { ok: false };
      }
      current = current[index];
      continue;
    }

    if (!isObjectLike(current) || !(segment in current)) return { ok: false };
    current = current[segment];
  }

  return { ok: true, value: cloneJson(current) };
};

const resolveParent = (
  source: unknown,
  path: string
):
  | { ok: true; parent: Record<string, unknown> | unknown[]; key: string }
  | { ok: false } => {
  const segments = parsePointer(path);
  if (!segments?.length) return { ok: false };

  let parent = source;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(parent)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
        return { ok: false };
      }
      parent = parent[index];
      continue;
    }

    if (!isObjectLike(parent) || !(segment in parent)) return { ok: false };
    parent = parent[segment];
  }

  if (!isObjectLike(parent)) return { ok: false };
  return {
    ok: true,
    parent: parent as Record<string, unknown>,
    key: segments.at(-1) ?? '',
  };
};

const setValue = (
  source: unknown,
  path: string,
  value: unknown,
  mode: 'add' | 'replace'
): boolean => {
  const resolved = resolveParent(source, path);
  if (!resolved.ok) return false;

  const { parent, key } = resolved;
  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length) {
      return false;
    }
    if (mode === 'replace') {
      if (index >= parent.length) return false;
      parent[index] = cloneJson(value);
      return true;
    }
    parent.splice(index, 0, cloneJson(value));
    return true;
  }

  if (mode === 'replace' && !(key in parent)) return false;
  parent[key] = cloneJson(value);
  return true;
};

const removeValue = (source: unknown, path: string): boolean => {
  const resolved = resolveParent(source, path);
  if (!resolved.ok) return false;

  const { parent, key } = resolved;
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      return false;
    }
    parent.splice(index, 1);
    return true;
  }

  if (!(key in parent)) return false;
  delete parent[key];
  return true;
};

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((item, index) => valuesEqual(item, right[index]));
  }

  if (isObjectLike(left) || isObjectLike(right)) {
    if (
      !isObjectLike(left) ||
      !isObjectLike(right) ||
      Array.isArray(left) ||
      Array.isArray(right)
    ) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!valuesEqual(leftKeys, rightKeys)) return false;

    return leftKeys.every((key) => valuesEqual(left[key], right[key]));
  }

  return false;
};

const ROOT_PATH = '/';

const normalizePathSegment = (segment: string): string => segment.trim();

const joinWorkspacePath = (parentPath: string, name: string): string => {
  const normalizedName = normalizePathSegment(name);
  if (!normalizedName || normalizedName === ROOT_PATH) return parentPath;
  if (parentPath === ROOT_PATH) return `/${normalizedName}`;
  return `${parentPath}/${normalizedName}`;
};

const collectWorkspacePaths = (
  treeById: StableWorkspaceSnapshot['treeById'],
  nodeId: WorkspaceVfsNodeId,
  currentPath: string,
  pathsByNodeId: Map<WorkspaceVfsNodeId, string>
) => {
  const node = treeById[nodeId];
  if (!node || pathsByNodeId.has(nodeId)) return;

  const nextPath =
    node.parentId === null
      ? ROOT_PATH
      : joinWorkspacePath(currentPath, node.name);
  pathsByNodeId.set(nodeId, nextPath);

  if (node.kind === 'dir') {
    (node.children ?? []).forEach((childId) =>
      collectWorkspacePaths(treeById, childId, nextPath, pathsByNodeId)
    );
  }
};

const getWorkspaceNodePath = (
  snapshot: StableWorkspaceSnapshot,
  nodeId: WorkspaceVfsNodeId
): string | null => {
  const pathsByNodeId = new Map<WorkspaceVfsNodeId, string>();
  collectWorkspacePaths(
    snapshot.treeById,
    snapshot.treeRootId,
    ROOT_PATH,
    pathsByNodeId
  );
  return pathsByNodeId.get(nodeId) ?? null;
};

const isPirWorkspaceDocumentType = (type: string): boolean =>
  type === 'pir-page' || type === 'pir-layout' || type === 'pir-component';

const inferCommandDomain = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandDomain => {
  if (command.domainHint) return command.domainHint;
  if (command.namespace.startsWith('core.nodegraph')) return 'nodegraph';
  if (command.namespace.startsWith('core.animation')) return 'animation';
  if (command.namespace.startsWith('core.code')) return 'code';
  if (
    command.namespace.startsWith('core.route') ||
    command.target.routeNodeId
  ) {
    return 'route';
  }
  if (command.namespace.startsWith('core.workspace')) return 'workspace';
  return 'pir';
};

const isAllowedPirDocumentPath = (path: string): boolean =>
  path === '/ui/graph' ||
  path.startsWith('/ui/graph/') ||
  path === '/logic' ||
  path.startsWith('/logic/') ||
  path === '/animation' ||
  path.startsWith('/animation/') ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedNodeGraphDocumentPath = (path: string): boolean =>
  path === '/nodesById' ||
  path.startsWith('/nodesById/') ||
  path === '/edgesById' ||
  path.startsWith('/edgesById/') ||
  path === '/groupsById' ||
  path.startsWith('/groupsById/') ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedAnimationDocumentPath = (path: string): boolean =>
  path === '/timelinesById' ||
  path.startsWith('/timelinesById/') ||
  path === '/tracksById' ||
  path.startsWith('/tracksById/') ||
  path === '/keyframesById' ||
  path.startsWith('/keyframesById/') ||
  path === '/bindingsById' ||
  path.startsWith('/bindingsById/') ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedCodeDocumentPath = (path: string): boolean =>
  path === '/language' ||
  path === '/source' ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedDocumentPath = (
  path: string,
  domain: DocumentPatchDomain
): boolean => {
  if (path === '/' || path === '/ui/root' || path.startsWith('/ui/root/')) {
    return false;
  }

  if (domain === 'nodegraph') return isAllowedNodeGraphDocumentPath(path);
  if (domain === 'animation') return isAllowedAnimationDocumentPath(path);
  if (domain === 'code') return isAllowedCodeDocumentPath(path);
  return isAllowedPirDocumentPath(path);
};

const isAllowedWorkspacePath = (path: string): boolean =>
  path === '/treeRootId' ||
  path === '/activeDocumentId' ||
  path === '/activeRouteNodeId' ||
  path === '/treeById' ||
  path.startsWith('/treeById/') ||
  path === '/docsById' ||
  path.startsWith('/docsById/') ||
  path === '/routeManifest' ||
  path.startsWith('/routeManifest/');

const isAllowedPatchPath = (
  path: string,
  target: PatchTarget,
  domain: WorkspaceCommandDomain
): boolean =>
  target === 'document'
    ? isAllowedDocumentPath(
        path,
        domain === 'workspace' || domain === 'route' ? 'pir' : domain
      )
    : isAllowedWorkspacePath(path);

const validatePatchPaths = (
  ops: WorkspacePatchOperation[],
  target: PatchTarget,
  domain: WorkspaceCommandDomain
): WorkspaceCommandIssue[] => {
  const issues: WorkspaceCommandIssue[] = [];

  ops.forEach((op) => {
    if (!isAllowedPatchPath(op.path, target, domain)) {
      issues.push({
        code: 'WKS_COMMAND_PATCH_PATH_FORBIDDEN',
        path: op.path,
        message: 'Patch path is not allowed for this command target.',
      });
    }
    if (
      (op.op === 'move' || op.op === 'copy') &&
      (!op.from || !isAllowedPatchPath(op.from, target, domain))
    ) {
      issues.push({
        code: 'WKS_COMMAND_PATCH_PATH_FORBIDDEN',
        path: op.from ?? '',
        message: 'Patch from path is not allowed for this command target.',
      });
    }
  });

  return issues;
};

const applyPatchOperations = (
  source: unknown,
  ops: WorkspacePatchOperation[]
): PatchApplyResult => {
  const value = cloneJson(source);

  for (const op of ops) {
    if (op.op === 'add') {
      if (!setValue(value, op.path, op.value, 'add')) {
        return { ok: false, path: op.path };
      }
      continue;
    }

    if (op.op === 'replace') {
      if (!setValue(value, op.path, op.value, 'replace')) {
        return { ok: false, path: op.path };
      }
      continue;
    }

    if (op.op === 'remove') {
      if (!removeValue(value, op.path)) return { ok: false, path: op.path };
      continue;
    }

    if (op.op === 'test') {
      const current = getValueAtPath(value, op.path);
      if (!current.ok || !valuesEqual(current.value, op.value)) {
        return { ok: false, path: op.path };
      }
      continue;
    }

    if (op.op === 'copy' || op.op === 'move') {
      if (!op.from) return { ok: false, path: op.path };
      const current = getValueAtPath(value, op.from);
      if (!current.ok) return { ok: false, path: op.from };
      if (op.op === 'move' && !removeValue(value, op.from)) {
        return { ok: false, path: op.from };
      }
      if (!setValue(value, op.path, current.value, 'add')) {
        return { ok: false, path: op.path };
      }
      continue;
    }

    return { ok: false, path: op.path };
  }

  return { ok: true, value };
};

const validateEnvelope = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandIssue[] => {
  const issues: WorkspaceCommandIssue[] = [];
  const requiredStringFields = [
    ['id', command.id],
    ['namespace', command.namespace],
    ['type', command.type],
    ['version', command.version],
    ['issuedAt', command.issuedAt],
    ['target/workspaceId', command.target?.workspaceId],
  ] as const;

  requiredStringFields.forEach(([field, value]) => {
    if (typeof value !== 'string' || !value.trim()) {
      issues.push({
        code: 'WKS_COMMAND_INVALID_ENVELOPE',
        path: `/${field}`,
        message: 'Command envelope field is required.',
      });
    }
  });

  if (!command.forwardOps.length || !command.reverseOps.length) {
    issues.push({
      code: 'WKS_COMMAND_INVALID_ENVELOPE',
      path: '/forwardOps',
      message: 'Mutating commands must provide forwardOps and reverseOps.',
    });
  }

  return issues;
};

const findRemovedRouteDocumentRefs = (
  before: StableWorkspaceSnapshot,
  after: StableWorkspaceSnapshot
): WorkspaceDocumentId[] => {
  const routeRoot = before.routeManifest.root as WorkspaceRouteNode | undefined;
  if (!routeRoot || typeof routeRoot !== 'object') return [];
  const routeDocumentRefs = collectRouteManifestDocumentRefs(
    before.routeManifest as WorkspaceRouteManifest
  );
  return Object.keys(before.docsById).filter(
    (documentId) =>
      routeDocumentRefs.has(documentId) && !after.docsById[documentId]
  );
};

export const createWorkspaceCodeDocumentCommand = ({
  workspace,
  commandId,
  issuedAt,
  parentNodeId,
  documentId,
  nodeId,
  name,
  content,
  label,
}: CreateWorkspaceCodeDocumentCommandInput): WorkspaceCommandEnvelope => {
  const parentNode = workspace.treeById[parentNodeId];
  const parentChildren = parentNode?.kind === 'dir' ? parentNode.children : [];
  const parentPath = parentNode
    ? getWorkspaceNodePath(workspace, parentNodeId)
    : null;
  const documentPath = joinWorkspacePath(parentPath ?? ROOT_PATH, name);
  const document: StableWorkspaceDocument = {
    id: documentId,
    type: 'code',
    name,
    path: documentPath,
    contentRev: 1,
    metaRev: 1,
    content,
  };
  const node: StableWorkspaceVfsNode = {
    id: nodeId,
    kind: 'doc',
    name,
    parentId: parentNodeId,
    docId: documentId,
  };

  return {
    id: commandId,
    namespace: 'core.workspace',
    type: 'code-document.create',
    version: '1.0',
    issuedAt,
    target: { workspaceId: workspace.id },
    domainHint: 'workspace',
    ...(label ? { label } : {}),
    forwardOps: [
      { op: 'add', path: `/docsById/${documentId}`, value: document },
      { op: 'add', path: `/treeById/${nodeId}`, value: node },
      {
        op: 'add',
        path: `/treeById/${parentNodeId}/children/-`,
        value: nodeId,
      },
    ],
    reverseOps: [
      {
        op: 'remove',
        path: `/treeById/${parentNodeId}/children/${parentChildren?.length ?? 0}`,
      },
      { op: 'remove', path: `/treeById/${nodeId}` },
      { op: 'remove', path: `/docsById/${documentId}` },
    ],
  };
};

export const createWorkspaceCodeDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  nodeId,
  parentNodeId,
  path,
  content,
  clientMutationId,
}: CreateWorkspaceCodeDocumentIntentInput): WorkspaceCodeDocumentCreateIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'code-document.create',
    version: '1.0',
    payload: {
      documentId,
      ...(nodeId ? { nodeId } : {}),
      ...(parentNodeId ? { parentNodeId } : {}),
      path,
      content,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const renameWorkspaceCodeDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  path,
  clientMutationId,
}: RenameWorkspaceCodeDocumentIntentInput): WorkspaceCodeDocumentRenameIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'code-document.rename',
    version: '1.0',
    payload: {
      documentId,
      path,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const deleteWorkspaceCodeDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  clientMutationId,
}: DeleteWorkspaceCodeDocumentIntentInput): WorkspaceCodeDocumentDeleteIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'code-document.delete',
    version: '1.0',
    payload: {
      documentId,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const createWorkspaceDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  nodeId,
  parentNodeId,
  path,
  type,
  content,
  clientMutationId,
}: CreateWorkspaceDocumentIntentInput): WorkspaceDocumentCreateIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'document.create',
    version: '1.0',
    payload: {
      documentId,
      ...(nodeId ? { nodeId } : {}),
      ...(parentNodeId ? { parentNodeId } : {}),
      path,
      type,
      content,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const renameWorkspaceDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  path,
  type,
  clientMutationId,
}: RenameWorkspaceDocumentIntentInput): WorkspaceDocumentRenameIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'document.rename',
    version: '1.0',
    payload: {
      documentId,
      path,
      type,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const deleteWorkspaceDocumentIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  documentId,
  type,
  clientMutationId,
}: DeleteWorkspaceDocumentIntentInput): WorkspaceDocumentDeleteIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'document.delete',
    version: '1.0',
    payload: {
      documentId,
      type,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const createWorkspaceDirectoryIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  nodeId,
  parentNodeId,
  name,
  clientMutationId,
}: CreateWorkspaceDirectoryIntentInput): WorkspaceDirectoryCreateIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'directory.create',
    version: '1.0',
    payload: {
      nodeId,
      ...(parentNodeId ? { parentNodeId } : {}),
      name,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const renameWorkspaceDirectoryIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  nodeId,
  name,
  clientMutationId,
}: RenameWorkspaceDirectoryIntentInput): WorkspaceDirectoryRenameIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'directory.rename',
    version: '1.0',
    payload: {
      nodeId,
      name,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const deleteWorkspaceDirectoryIntentRequest = ({
  workspaceRev,
  intentId,
  issuedAt,
  nodeId,
  clientMutationId,
}: DeleteWorkspaceDirectoryIntentInput): WorkspaceDirectoryDeleteIntentRequest => ({
  expectedWorkspaceRev: workspaceRev,
  intent: {
    id: intentId,
    namespace: 'core.workspace',
    type: 'directory.delete',
    version: '1.0',
    payload: {
      nodeId,
    },
    issuedAt,
  },
  ...(clientMutationId ? { clientMutationId } : {}),
});

export const applyWorkspaceCommand = (
  snapshot: StableWorkspaceSnapshot,
  command: WorkspaceCommandEnvelope
): WorkspaceCommandApplyResult => {
  const envelopeIssues = validateEnvelope(command);
  if (envelopeIssues.length) return { ok: false, issues: envelopeIssues };

  if (command.target.workspaceId !== snapshot.id) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_WORKSPACE_MISMATCH',
          path: '/target/workspaceId',
          message: 'Command target workspaceId must match the snapshot.',
        },
      ],
    };
  }

  const patchTarget: PatchTarget = command.target.documentId
    ? 'document'
    : 'workspace';
  const commandDomain = inferCommandDomain(command);
  const pathIssues = [
    ...validatePatchPaths(command.forwardOps, patchTarget, commandDomain),
    ...validatePatchPaths(command.reverseOps, patchTarget, commandDomain),
  ];
  if (pathIssues.length) return { ok: false, issues: pathIssues };

  if (patchTarget === 'document') {
    const documentId = command.target.documentId;
    const document = documentId ? snapshot.docsById[documentId] : undefined;
    if (!documentId || !document) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_DOCUMENT_MISSING',
            path: '/target/documentId',
            message: 'Command target documentId must reference a document.',
            documentId,
          },
        ],
      };
    }

    const patchedContent = applyPatchOperations(
      document.content,
      command.forwardOps
    );
    if (isPatchFailure(patchedContent)) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_PATCH_FAILED',
            path: patchedContent.path,
            message: 'Command forwardOps could not be applied.',
            documentId,
          },
        ],
      };
    }

    const restoredContent = applyPatchOperations(
      patchedContent.value,
      command.reverseOps
    );
    if (isPatchFailure(restoredContent)) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_PATCH_FAILED',
            path: restoredContent.path,
            message: 'Command reverseOps must restore the original document.',
            documentId,
          },
        ],
      };
    }

    if (!valuesEqual(restoredContent.value, document.content)) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_PATCH_FAILED',
            path: '/',
            message: 'Command reverseOps must restore the original document.',
            documentId,
          },
        ],
      };
    }

    if (
      isPirWorkspaceDocumentType(document.type) &&
      !isPirDocumentContent(patchedContent.value)
    ) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_COMMAND_VALIDATION_FAILED',
            path: '/target/documentId',
            message: `PIR workspace documents must remain ${CURRENT_PIR_VERSION} graph-only.`,
            documentId,
          },
        ],
      };
    }

    const nextSnapshot: StableWorkspaceSnapshot = {
      ...snapshot,
      docsById: {
        ...snapshot.docsById,
        [documentId]: {
          ...document,
          content: patchedContent.value,
          contentRev: document.contentRev + 1,
        },
      },
    };

    return { ok: true, snapshot: nextSnapshot, command };
  }

  const patchedSnapshot = applyPatchOperations(snapshot, command.forwardOps);
  if (isPatchFailure(patchedSnapshot)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_PATCH_FAILED',
          path: patchedSnapshot.path,
          message: 'Command forwardOps could not be applied.',
        },
      ],
    };
  }

  const nextSnapshot = patchedSnapshot.value as StableWorkspaceSnapshot;
  const restoredSnapshot = applyPatchOperations(
    nextSnapshot,
    command.reverseOps
  );
  if (isPatchFailure(restoredSnapshot)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_PATCH_FAILED',
          path: restoredSnapshot.path,
          message: 'Command reverseOps must restore the original workspace.',
        },
      ],
    };
  }

  if (!valuesEqual(restoredSnapshot.value, snapshot)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_PATCH_FAILED',
          path: '/',
          message: 'Command reverseOps must restore the original workspace.',
        },
      ],
    };
  }

  const removedRouteDocumentRefs = findRemovedRouteDocumentRefs(
    snapshot,
    nextSnapshot
  );
  if (removedRouteDocumentRefs.length) {
    return {
      ok: false,
      issues: removedRouteDocumentRefs.map((documentId) => ({
        code: 'WKS_COMMAND_VALIDATION_FAILED',
        path: `/docsById/${documentId}`,
        message:
          'Workspace document is referenced by the route graph and cannot be deleted.',
        documentId,
      })),
    };
  }

  const validation = validateStableWorkspaceSnapshot(nextSnapshot);
  if (!validation.valid) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/',
          message: 'Command result failed workspace validation.',
          validationIssues: validation.issues,
        },
      ],
    };
  }

  return { ok: true, snapshot: nextSnapshot, command };
};
