import type {
  WorkspaceDocument,
  WorkspaceVfsNode,
  WorkspaceSnapshot,
  WorkspaceDocumentId,
  WorkspaceId,
  WorkspaceVfsNodeId,
  WorkspaceValidationIssue,
  WorkspaceCodeDocumentContent,
  WorkspaceDocumentType,
} from './types';
import { validateWorkspaceSnapshot } from './validateWorkspaceVfs';
import { isCanonicalPirDocumentContent } from './workspaceDocumentValidation';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import {
  isWorkspaceAssetDocumentContent,
  isWorkspaceProjectConfigDocumentContent,
} from './workspaceResourceDocument';
import { isCanonicalWorkspaceAnimationDocumentContent } from './workspaceAnimationDocument';
import { isCanonicalWorkspaceNodeGraphDocumentContent } from './workspaceNodeGraphDocument';
import { isCanonicalWorkspaceDesignTokenDocumentContent } from './workspaceDesignTokenDocument';
import { isCanonicalWorkspaceDesignTokenResolverDocumentContent } from './workspaceDesignTokenResolverDocument';
import {
  collectRouteManifestDocumentRefs,
  type WorkspaceRouteNode,
  type WorkspaceRouteManifest,
} from '@prodivix/router';

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
    | 'token'
    | 'code'
    | 'resource';
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
      snapshot: WorkspaceSnapshot;
      command: WorkspaceCommandEnvelope;
    }
  | {
      ok: false;
      issues: WorkspaceCommandIssue[];
    };

/**
 * Groups commands that must become visible as one authoring mutation. The
 * stable transaction id is also the grouping key consumed by workspace
 * history, outbox, and future collaboration layers.
 */
export type WorkspaceTransactionEnvelope = {
  id: string;
  workspaceId: WorkspaceId;
  issuedAt: string;
  commands: WorkspaceCommandEnvelope[];
  label?: string;
  mergeKey?: string;
};

export type WorkspaceTransactionIssueCode =
  | 'WKS_TRANSACTION_INVALID_ENVELOPE'
  | 'WKS_TRANSACTION_WORKSPACE_MISMATCH'
  | 'WKS_TRANSACTION_COMMAND_FAILED'
  | 'WKS_TRANSACTION_VALIDATION_FAILED';

export type WorkspaceTransactionIssue = {
  code: WorkspaceTransactionIssueCode;
  path: string;
  message: string;
  commandId?: string;
  commandIndex?: number;
  commandIssues?: WorkspaceCommandIssue[];
};

export type WorkspaceTransactionApplyResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
      transaction: WorkspaceTransactionEnvelope;
    }
  | {
      ok: false;
      transaction: WorkspaceTransactionEnvelope;
      issues: WorkspaceTransactionIssue[];
      failedCommandId?: string;
      failedCommandIndex?: number;
    };

export type WorkspaceDocumentCommandApplyResult<TContent = unknown> =
  | {
      ok: true;
      content: TContent;
      command: WorkspaceCommandEnvelope;
    }
  | {
      ok: false;
      issues: WorkspaceCommandIssue[];
    };

export type CreateWorkspaceCodeDocumentCommandInput = {
  workspace: WorkspaceSnapshot;
  commandId: string;
  issuedAt: string;
  parentNodeId: WorkspaceVfsNodeId;
  documentId: WorkspaceDocumentId;
  nodeId: WorkspaceVfsNodeId;
  name: string;
  content: WorkspaceCodeDocumentContent;
  label?: string;
};

export type CreateWorkspaceCodeSourceUpdateCommandInput = {
  workspaceId: WorkspaceId;
  document: WorkspaceDocument;
  source: string;
  commandId: string;
  issuedAt: string;
  mergeKey?: string;
  label?: string;
};

export type CreateWorkspaceCodeContentUpdateCommandInput = {
  workspaceId: WorkspaceId;
  document: WorkspaceDocument;
  content: WorkspaceCodeDocumentContent;
  commandId: string;
  issuedAt: string;
  mergeKey?: string;
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
  type: WorkspaceDocumentType;
  content: unknown;
  clientMutationId?: string;
};

export type RenameWorkspaceDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  path: string;
  type: WorkspaceDocumentType;
  clientMutationId?: string;
};

export type DeleteWorkspaceDocumentIntentInput = {
  workspaceRev: number;
  intentId: string;
  issuedAt: string;
  documentId: WorkspaceDocumentId;
  type: WorkspaceDocumentType;
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
      type: WorkspaceDocumentType;
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
      type: WorkspaceDocumentType;
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
      type: WorkspaceDocumentType;
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
const DOCUMENT_PATCH_DOMAINS: readonly DocumentPatchDomain[] = [
  'pir',
  'nodegraph',
  'animation',
  'token',
  'code',
  'resource',
];
const isDocumentPatchDomain = (
  domain: WorkspaceCommandDomain
): domain is DocumentPatchDomain =>
  DOCUMENT_PATCH_DOMAINS.includes(domain as DocumentPatchDomain);
type PatchApplyResult =
  { ok: true; value: unknown } | { ok: false; path: string };

const isPatchFailure = (
  result: PatchApplyResult
): result is { ok: false; path: string } => result.ok === false;

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const decodePointerSegment = (segment: string): string | undefined => {
  let decoded = '';
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index]!;
    if (character !== '~') {
      decoded += character;
      continue;
    }
    const escaped = segment[index + 1];
    if (escaped === '0') decoded += '~';
    else if (escaped === '1') decoded += '/';
    else return undefined;
    index += 1;
  }
  return decoded;
};

const parsePointer = (path: string): string[] | undefined => {
  if (path === '') return [];
  if (!path.startsWith('/')) return undefined;
  const segments: string[] = [];
  for (const segment of path.slice(1).split('/')) {
    const decoded = decodePointerSegment(segment);
    if (decoded === undefined) return undefined;
    segments.push(decoded);
  }
  return segments;
};

const parseArrayIndex = (
  segment: string,
  length: number,
  allowAppend: boolean
): number | undefined => {
  if (segment === '-') return allowAppend ? length : undefined;
  if (!/^(?:0|[1-9]\d*)$/.test(segment)) return undefined;
  const index = Number(segment);
  if (!Number.isSafeInteger(index)) return undefined;
  return allowAppend
    ? index <= length
      ? index
      : undefined
    : index < length
      ? index
      : undefined;
};

const setOwnJsonProperty = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
) =>
  Object.defineProperty(target, key, {
    value: cloneJson(value),
    configurable: true,
    enumerable: true,
    writable: true,
  });

const getValueAtPath = (
  source: unknown,
  path: string
): { ok: true; value: unknown } | { ok: false } => {
  const segments = parsePointer(path);
  if (!segments) return { ok: false };

  let current = source;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = parseArrayIndex(segment, current.length, false);
      if (index === undefined) return { ok: false };
      current = current[index];
      continue;
    }

    if (!isObjectLike(current) || !Object.hasOwn(current, segment)) {
      return { ok: false };
    }
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
      const index = parseArrayIndex(segment, parent.length, false);
      if (index === undefined) return { ok: false };
      parent = parent[index];
      continue;
    }

    if (!isObjectLike(parent) || !Object.hasOwn(parent, segment)) {
      return { ok: false };
    }
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
    const index = parseArrayIndex(key, parent.length, mode === 'add');
    if (index === undefined) return false;
    if (mode === 'replace') {
      parent[index] = cloneJson(value);
      return true;
    }
    parent.splice(index, 0, cloneJson(value));
    return true;
  }

  if (mode === 'replace' && !Object.hasOwn(parent, key)) return false;
  setOwnJsonProperty(parent, key, value);
  return true;
};

const removeValue = (source: unknown, path: string): boolean => {
  const resolved = resolveParent(source, path);
  if (!resolved.ok) return false;

  const { parent, key } = resolved;
  if (Array.isArray(parent)) {
    const index = parseArrayIndex(key, parent.length, false);
    if (index === undefined) return false;
    parent.splice(index, 1);
    return true;
  }

  if (!Object.hasOwn(parent, key)) return false;
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
  treeById: WorkspaceSnapshot['treeById'],
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
  snapshot: WorkspaceSnapshot,
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

export const resolveWorkspaceCommandDomain = (
  command: WorkspaceCommandEnvelope
): WorkspaceCommandDomain => {
  if (command.domainHint) return command.domainHint;
  if (command.namespace.startsWith('core.nodegraph')) return 'nodegraph';
  if (command.namespace.startsWith('core.animation')) return 'animation';
  if (command.namespace.startsWith('core.code')) return 'code';
  if (command.namespace.startsWith('core.resource')) return 'resource';
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
  path === '/componentContract' ||
  path.startsWith('/componentContract/') ||
  path === '/logic' ||
  path.startsWith('/logic/') ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedNodeGraphDocumentPath = (path: string): boolean =>
  path === '/nodes' ||
  path.startsWith('/nodes/') ||
  path === '/edges' ||
  path.startsWith('/edges/');

const isAllowedAnimationDocumentPath = (path: string): boolean =>
  path === '/target' ||
  path.startsWith('/target/') ||
  path === '/timelines' ||
  path.startsWith('/timelines/') ||
  path === '/svgFilters' ||
  path.startsWith('/svgFilters/') ||
  path === '/x-animationEditor' ||
  path.startsWith('/x-animationEditor/');

const isAllowedCodeDocumentPath = (path: string): boolean =>
  path === '/language' ||
  path === '/source' ||
  path === '/metadata' ||
  path.startsWith('/metadata/') ||
  path.startsWith('/x-');

const isAllowedDesignTokenDocumentPath = (path: string): boolean =>
  path.startsWith('/') && path !== '/';

const isAllowedResourceDocumentPath = (
  path: string,
  documentType: WorkspaceDocumentType
): boolean => {
  const roots =
    documentType === 'asset'
      ? ['mime', 'category', 'size', 'dataUrl', 'text', 'metadata']
      : documentType === 'project-config'
        ? ['value', 'metadata']
        : [];
  return roots.some(
    (root) => path === `/${root}` || path.startsWith(`/${root}/`)
  );
};

const PIR_DOCUMENT_TYPES: ReadonlySet<WorkspaceDocumentType> = new Set([
  'pir-page',
  'pir-layout',
  'pir-component',
]);

const isPirWorkspaceDocumentType = (
  documentType: WorkspaceDocumentType
): boolean => PIR_DOCUMENT_TYPES.has(documentType);

const isAllowedDocumentPath = (
  path: string,
  documentType: WorkspaceDocumentType
): boolean => {
  if (path === '/' || path === '/ui/root' || path.startsWith('/ui/root/')) {
    return false;
  }

  if (isPirWorkspaceDocumentType(documentType)) {
    return isAllowedPirDocumentPath(path);
  }
  if (documentType === 'pir-graph') {
    return isAllowedNodeGraphDocumentPath(path);
  }
  if (documentType === 'pir-animation') {
    return isAllowedAnimationDocumentPath(path);
  }
  if (
    documentType === 'design-tokens' ||
    documentType === 'design-token-resolver'
  ) {
    return isAllowedDesignTokenDocumentPath(path);
  }
  if (documentType === 'code') return isAllowedCodeDocumentPath(path);
  if (documentType === 'asset' || documentType === 'project-config') {
    return isAllowedResourceDocumentPath(path, documentType);
  }
  return false;
};

const isAllowedWorkspacePath = (path: string): boolean =>
  path === '/treeRootId' ||
  path === '/activeDocumentId' ||
  path === '/activeRouteNodeId' ||
  path === '/settings' ||
  path.startsWith('/settings/') ||
  path === '/treeById' ||
  path.startsWith('/treeById/') ||
  path.startsWith('/docsById/') ||
  path === '/routeManifest' ||
  path.startsWith('/routeManifest/');

const isAllowedPatchPath = (
  path: string,
  target: PatchTarget,
  documentType?: WorkspaceDocumentType
): boolean =>
  target === 'document'
    ? documentType !== undefined && isAllowedDocumentPath(path, documentType)
    : isAllowedWorkspacePath(path);

const validatePatchPaths = (
  ops: WorkspacePatchOperation[],
  target: PatchTarget,
  documentType?: WorkspaceDocumentType
): WorkspaceCommandIssue[] => {
  const issues: WorkspaceCommandIssue[] = [];

  ops.forEach((op) => {
    if (!isAllowedPatchPath(op.path, target, documentType)) {
      issues.push({
        code: 'WKS_COMMAND_PATCH_PATH_FORBIDDEN',
        path: op.path,
        message: 'Patch path is not allowed for this command target.',
      });
    }
    if (
      (op.op === 'move' || op.op === 'copy') &&
      (!op.from || !isAllowedPatchPath(op.from, target, documentType))
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
    if (
      (op.op === 'add' || op.op === 'replace' || op.op === 'test') &&
      (!Object.hasOwn(op, 'value') || op.value === undefined)
    ) {
      return { ok: false, path: op.path };
    }
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

  if (
    command.target?.documentId &&
    !isDocumentPatchDomain(resolveWorkspaceCommandDomain(command))
  ) {
    issues.push({
      code: 'WKS_COMMAND_INVALID_ENVELOPE',
      path: '/domainHint',
      message: 'Document-targeted commands must use a document command domain.',
      documentId: command.target.documentId,
    });
  }

  return issues;
};

const findMissingRouteDocumentRefs = (
  snapshot: WorkspaceSnapshot
): WorkspaceDocumentId[] => {
  const routeRoot = snapshot.routeManifest.root as
    WorkspaceRouteNode | undefined;
  if (!routeRoot || typeof routeRoot !== 'object') return [];
  const routeDocumentRefs = collectRouteManifestDocumentRefs(
    snapshot.routeManifest as WorkspaceRouteManifest
  );
  return [...routeDocumentRefs].filter(
    (documentId) => !snapshot.docsById[documentId]
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
  const document: WorkspaceDocument = {
    id: documentId,
    type: 'code',
    name,
    path: documentPath,
    contentRev: 1,
    metaRev: 1,
    content,
  };
  const node: WorkspaceVfsNode = {
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

export const createWorkspaceCodeSourceUpdateCommand = ({
  workspaceId,
  document,
  source,
  commandId,
  issuedAt,
  mergeKey = `code-source:${document.id}`,
  label = `Update ${document.path}`,
}: CreateWorkspaceCodeSourceUpdateCommandInput): WorkspaceCommandEnvelope | null => {
  if (
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content) ||
    document.content.source === source
  ) {
    return null;
  }
  return {
    id: commandId,
    namespace: 'core.code',
    type: 'source.update',
    version: '1.0',
    issuedAt,
    target: { workspaceId, documentId: document.id },
    domainHint: 'code',
    mergeKey,
    label,
    forwardOps: [{ op: 'replace', path: '/source', value: source }],
    reverseOps: [
      { op: 'replace', path: '/source', value: document.content.source },
    ],
  };
};

/** Updates canonical code content, including typed authoring metadata. */
export const createWorkspaceCodeContentUpdateCommand = ({
  workspaceId,
  document,
  content,
  commandId,
  issuedAt,
  mergeKey = `code-content:${document.id}`,
  label = `Update ${document.path}`,
}: CreateWorkspaceCodeContentUpdateCommandInput): WorkspaceCommandEnvelope | null => {
  if (
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return null;
  }
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  if (document.content.language !== content.language) {
    forwardOps.push({
      op: 'replace',
      path: '/language',
      value: content.language,
    });
    reverseOps.unshift({
      op: 'replace',
      path: '/language',
      value: document.content.language,
    });
  }
  if (document.content.source !== content.source) {
    forwardOps.push({ op: 'replace', path: '/source', value: content.source });
    reverseOps.unshift({
      op: 'replace',
      path: '/source',
      value: document.content.source,
    });
  }
  if (!valuesEqual(document.content.metadata, content.metadata)) {
    if (document.content.metadata === undefined) {
      forwardOps.push({
        op: 'add',
        path: '/metadata',
        value: content.metadata,
      });
      reverseOps.unshift({ op: 'remove', path: '/metadata' });
    } else if (content.metadata === undefined) {
      forwardOps.push({ op: 'remove', path: '/metadata' });
      reverseOps.unshift({
        op: 'add',
        path: '/metadata',
        value: document.content.metadata,
      });
    } else {
      forwardOps.push({
        op: 'replace',
        path: '/metadata',
        value: content.metadata,
      });
      reverseOps.unshift({
        op: 'replace',
        path: '/metadata',
        value: document.content.metadata,
      });
    }
  }
  if (forwardOps.length === 0) return null;
  return {
    id: commandId,
    namespace: 'core.code',
    type: 'content.update',
    version: '1.0',
    issuedAt,
    target: { workspaceId, documentId: document.id },
    domainHint: 'code',
    mergeKey,
    label,
    forwardOps,
    reverseOps,
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

const applyWorkspaceDocumentCommandInternal = <TContent>(
  content: TContent,
  command: WorkspaceCommandEnvelope,
  target: Readonly<{
    workspaceId: WorkspaceId;
    documentId: WorkspaceDocumentId;
    documentType: WorkspaceDocumentType;
    domain: DocumentPatchDomain;
  }>
): WorkspaceDocumentCommandApplyResult<TContent> => {
  const envelopeIssues = validateEnvelope(command);
  if (envelopeIssues.length) return { ok: false, issues: envelopeIssues };
  if (command.target.workspaceId !== target.workspaceId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_WORKSPACE_MISMATCH',
          path: '/target/workspaceId',
          message: 'Command target workspaceId must match the document owner.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (command.target.documentId !== target.documentId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_DOCUMENT_MISSING',
          path: '/target/documentId',
          message: 'Command target documentId must match the document.',
          documentId: target.documentId,
        },
      ],
    };
  }
  const isResourceDocument =
    target.documentType === 'asset' || target.documentType === 'project-config';
  if ((target.domain === 'resource') !== isResourceDocument) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_INVALID_ENVELOPE',
          path: '/domainHint',
          message:
            'Resource commands may target only asset or project-config documents.',
          documentId: target.documentId,
        },
      ],
    };
  }
  const pathIssues = [
    ...validatePatchPaths(command.forwardOps, 'document', target.documentType),
    ...validatePatchPaths(command.reverseOps, 'document', target.documentType),
  ];
  if (pathIssues.length) return { ok: false, issues: pathIssues };

  const patchedContent = applyPatchOperations(content, command.forwardOps);
  if (isPatchFailure(patchedContent)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_PATCH_FAILED',
          path: patchedContent.path,
          message: 'Command forwardOps could not be applied.',
          documentId: target.documentId,
        },
      ],
    };
  }
  const restoredContent = applyPatchOperations(
    patchedContent.value,
    command.reverseOps
  );
  if (
    isPatchFailure(restoredContent) ||
    !valuesEqual(restoredContent.value, content)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_PATCH_FAILED',
          path: isPatchFailure(restoredContent) ? restoredContent.path : '/',
          message: 'Command reverseOps must restore the original document.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    isPirWorkspaceDocumentType(target.documentType) &&
    !isCanonicalPirDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message: 'PIR Workspace documents must remain canonical PIR-current.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'pir-graph' &&
    !isCanonicalWorkspaceNodeGraphDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'NodeGraph Workspace documents must remain canonical standalone definitions.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'pir-animation' &&
    !isCanonicalWorkspaceAnimationDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'Animation Workspace documents must remain canonical standalone definitions.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'code' &&
    !isWorkspaceCodeDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'Code workspace documents must remain a language/source wrapper.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'design-tokens' &&
    !isCanonicalWorkspaceDesignTokenDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'Design Token workspace documents must remain valid DTCG documents.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'design-token-resolver' &&
    !isCanonicalWorkspaceDesignTokenResolverDocumentContent(
      patchedContent.value
    )
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'Design Token Resolver workspace documents must remain valid DTCG resolver documents.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'asset' &&
    !isWorkspaceAssetDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message: 'Asset documents must retain valid resource content.',
          documentId: target.documentId,
        },
      ],
    };
  }
  if (
    target.documentType === 'project-config' &&
    !isWorkspaceProjectConfigDocumentContent(patchedContent.value)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_COMMAND_VALIDATION_FAILED',
          path: '/target/documentId',
          message:
            'Project-config documents must retain valid configuration content.',
          documentId: target.documentId,
        },
      ],
    };
  }
  return {
    ok: true,
    content: patchedContent.value as TContent,
    command,
  };
};

export const applyWorkspaceDocumentCommand = <TContent>(
  content: TContent,
  command: WorkspaceCommandEnvelope,
  target: Readonly<{
    workspaceId: WorkspaceId;
    documentId: WorkspaceDocumentId;
    documentType: WorkspaceDocumentType;
    domain: DocumentPatchDomain;
  }>
): WorkspaceDocumentCommandApplyResult<TContent> =>
  applyWorkspaceDocumentCommandInternal(content, command, target);

type WorkspaceCommandApplyOptions = {
  validateWorkspaceResult: boolean;
};

const validateWorkspaceTransition = (
  after: WorkspaceSnapshot
): WorkspaceCommandIssue[] => {
  const missingRouteDocumentRefs = findMissingRouteDocumentRefs(after);
  if (missingRouteDocumentRefs.length) {
    return missingRouteDocumentRefs.map((documentId) => ({
      code: 'WKS_COMMAND_VALIDATION_FAILED',
      path: `/docsById/${documentId}`,
      message:
        'Workspace document is referenced by the route graph and cannot be deleted.',
      documentId,
    }));
  }

  const validation = validateWorkspaceSnapshot(after);
  if (!validation.valid) {
    return [
      {
        code: 'WKS_COMMAND_VALIDATION_FAILED',
        path: '/',
        message: 'Command result failed workspace validation.',
        validationIssues: validation.issues,
      },
    ];
  }

  return [];
};

const applyWorkspaceCommandInternal = (
  snapshot: WorkspaceSnapshot,
  command: WorkspaceCommandEnvelope,
  options: WorkspaceCommandApplyOptions
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
  const commandDomain = resolveWorkspaceCommandDomain(command);

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

    const documentDomain: DocumentPatchDomain =
      commandDomain === 'nodegraph' ||
      commandDomain === 'animation' ||
      commandDomain === 'token' ||
      commandDomain === 'code' ||
      commandDomain === 'resource'
        ? commandDomain
        : 'pir';
    const documentResult = applyWorkspaceDocumentCommandInternal(
      document.content,
      command,
      {
        workspaceId: snapshot.id,
        documentId,
        documentType: document.type,
        domain: documentDomain,
      }
    );
    if (documentResult.ok === false) return documentResult;

    const nextSnapshot: WorkspaceSnapshot = {
      ...snapshot,
      docsById: {
        ...snapshot.docsById,
        [documentId]: {
          ...document,
          content: documentResult.content,
        },
      },
    };

    return { ok: true, snapshot: nextSnapshot, command };
  }

  const pathIssues = [
    ...validatePatchPaths(command.forwardOps, 'workspace'),
    ...validatePatchPaths(command.reverseOps, 'workspace'),
  ];
  if (pathIssues.length) return { ok: false, issues: pathIssues };

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

  const nextSnapshot = patchedSnapshot.value as WorkspaceSnapshot;
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

  if (options.validateWorkspaceResult) {
    const validationIssues = validateWorkspaceTransition(nextSnapshot);
    if (validationIssues.length) {
      return { ok: false, issues: validationIssues };
    }
  }

  return { ok: true, snapshot: nextSnapshot, command };
};

export const applyWorkspaceCommand = (
  snapshot: WorkspaceSnapshot,
  command: WorkspaceCommandEnvelope
): WorkspaceCommandApplyResult =>
  applyWorkspaceCommandInternal(snapshot, command, {
    validateWorkspaceResult: true,
  });

const validateTransactionEnvelope = (
  transaction: WorkspaceTransactionEnvelope
): WorkspaceTransactionIssue[] => {
  const issues: WorkspaceTransactionIssue[] = [];
  const requiredStringFields = [
    ['id', transaction.id],
    ['workspaceId', transaction.workspaceId],
    ['issuedAt', transaction.issuedAt],
  ] as const;

  requiredStringFields.forEach(([field, value]) => {
    if (typeof value !== 'string' || !value.trim()) {
      issues.push({
        code: 'WKS_TRANSACTION_INVALID_ENVELOPE',
        path: `/${field}`,
        message: 'Transaction envelope field is required.',
      });
    }
  });

  if (!Array.isArray(transaction.commands) || !transaction.commands.length) {
    issues.push({
      code: 'WKS_TRANSACTION_INVALID_ENVELOPE',
      path: '/commands',
      message: 'A transaction must contain at least one command.',
    });
  } else {
    const commandIds = new Set<string>();
    transaction.commands.forEach((command, index) => {
      if (commandIds.has(command.id)) {
        issues.push({
          code: 'WKS_TRANSACTION_INVALID_ENVELOPE',
          path: `/commands/${index}/id`,
          message: 'Command ids must be unique within a transaction.',
          commandId: command.id,
          commandIndex: index,
        });
      }
      commandIds.add(command.id);
    });
  }

  return issues;
};

/**
 * Applies a command group against an isolated snapshot and exposes only the
 * fully validated result. Intermediate workspace states may be incomplete,
 * which lets multi-document and route/VFS edits cross the boundary atomically.
 */
const applyWorkspaceTransactionInternal = (
  snapshot: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope
): WorkspaceTransactionApplyResult => {
  const envelopeIssues = validateTransactionEnvelope(transaction);
  if (envelopeIssues.length) {
    return { ok: false, transaction, issues: envelopeIssues };
  }

  if (transaction.workspaceId !== snapshot.id) {
    return {
      ok: false,
      transaction,
      issues: [
        {
          code: 'WKS_TRANSACTION_WORKSPACE_MISMATCH',
          path: '/workspaceId',
          message: 'Transaction workspaceId must match the snapshot.',
        },
      ],
    };
  }

  let nextSnapshot = snapshot;
  for (let index = 0; index < transaction.commands.length; index += 1) {
    const command = transaction.commands[index];
    if (command.target.workspaceId !== transaction.workspaceId) {
      return {
        ok: false,
        transaction,
        failedCommandId: command.id,
        failedCommandIndex: index,
        issues: [
          {
            code: 'WKS_TRANSACTION_WORKSPACE_MISMATCH',
            path: `/commands/${index}/target/workspaceId`,
            message:
              'Every command in a transaction must target its workspace.',
            commandId: command.id,
            commandIndex: index,
          },
        ],
      };
    }

    const commandResult = applyWorkspaceCommandInternal(nextSnapshot, command, {
      validateWorkspaceResult: false,
    });
    if (commandResult.ok === false) {
      return {
        ok: false,
        transaction,
        failedCommandId: command.id,
        failedCommandIndex: index,
        issues: [
          {
            code: 'WKS_TRANSACTION_COMMAND_FAILED',
            path: `/commands/${index}`,
            message: 'A transaction command failed to apply.',
            commandId: command.id,
            commandIndex: index,
            commandIssues: commandResult.issues,
          },
        ],
      };
    }
    nextSnapshot = commandResult.snapshot;
  }

  const validationIssues = validateWorkspaceTransition(nextSnapshot);
  if (validationIssues.length) {
    return {
      ok: false,
      transaction,
      issues: [
        {
          code: 'WKS_TRANSACTION_VALIDATION_FAILED',
          path: '/',
          message: 'Transaction result failed workspace validation.',
          commandIssues: validationIssues,
        },
      ],
    };
  }

  return { ok: true, snapshot: nextSnapshot, transaction };
};

export const applyWorkspaceTransaction = (
  snapshot: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope
): WorkspaceTransactionApplyResult =>
  applyWorkspaceTransactionInternal(snapshot, transaction);
