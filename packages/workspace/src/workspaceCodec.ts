import type { WorkspaceRouteManifest } from '@prodivix/shared/router';
import type { PIRDocument } from '@prodivix/shared/types/pir';
import { validatePirDocument } from '@prodivix/pir';
import { resolveCanonicalWorkspaceDocumentId } from './resolveCanonicalWorkspaceDocumentId';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from './types';
import { validateWorkspaceSnapshot } from './validateWorkspaceVfs';
import { isWorkspaceCodeDocumentContent } from './workspaceCodeDocument';
import { WorkspaceCodecError } from './workspaceCodecError';
import {
  isCanonicalWorkspaceDocumentUpdatedAt,
  isValidWorkspaceDocumentName,
} from './workspaceDocumentValidation';
import {
  decodeWorkspaceRouteManifest,
  resolveActiveRouteNodeId,
} from './workspaceRouteCodec';

export { WorkspaceCodecError } from './workspaceCodecError';
export {
  decodeWorkspaceRouteManifest,
  hasRouteNodeId,
  normalizeRouteManifest,
  resolveActiveRouteNodeId,
  resolveDefaultActiveRouteNodeId,
} from './workspaceRouteCodec';
export type {
  WorkspaceRouteDocumentTypeResolver,
  WorkspaceRouteManifestDecodeInput,
  WorkspaceRouteManifestDecodeOptions,
} from './workspaceRouteCodec';

const WORKSPACE_DOCUMENT_TYPES = new Set<WorkspaceDocumentType>([
  'pir-page',
  'pir-layout',
  'pir-component',
  'pir-graph',
  'pir-animation',
  'code',
  'asset',
  'project-config',
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requireRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new WorkspaceCodecError(path, 'Expected an object.');
  }
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new WorkspaceCodecError(path, 'Expected a non-empty string.');
  }
  return value;
};

const optionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireString(value, path);
};

const WORKSPACE_DOCUMENT_KEYS = new Set([
  'id',
  'type',
  'name',
  'path',
  'contentRev',
  'metaRev',
  'content',
  'updatedAt',
  'capabilities',
]);
const WORKSPACE_TREE_KEYS = new Set(['treeRootId', 'treeById']);
const WORKSPACE_DIR_NODE_KEYS = new Set([
  'id',
  'kind',
  'name',
  'parentId',
  'children',
]);
const WORKSPACE_DOC_NODE_KEYS = new Set([
  'id',
  'kind',
  'name',
  'parentId',
  'docId',
]);
const WORKSPACE_SNAPSHOT_KEYS = new Set([
  'id',
  'name',
  'workspaceRev',
  'routeRev',
  'opSeq',
  'tree',
  'documents',
  'routeManifest',
  'settings',
  'activeDocumentId',
  'activeRouteNodeId',
]);
const WORKSPACE_MUTATION_KEYS = new Set([
  'workspaceId',
  'workspaceRev',
  'routeRev',
  'opSeq',
  'tree',
  'updatedDocuments',
  'removedDocumentIds',
  'routeManifest',
  'settings',
  'activeDocumentId',
  'activeRouteNodeId',
  'acceptedMutationId',
]);

const toJsonPointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const assertAllowedKeys = (
  source: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  path: string,
  unknownFieldMessage = 'Unknown route manifest field.'
): void => {
  const unknownKey = Object.keys(source).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    throw new WorkspaceCodecError(
      `${path}/${toJsonPointerToken(unknownKey)}`,
      unknownFieldMessage
    );
  }
};

const requirePositiveInteger = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new WorkspaceCodecError(path, 'Expected a positive safe integer.');
  }
  return value as number;
};

const requireCanonicalId = (value: unknown, path: string): string => {
  const result = requireString(value, path);
  if (result !== result.trim()) {
    throw new WorkspaceCodecError(
      path,
      'Expected an id without leading or trailing whitespace.'
    );
  }
  return result;
};

const parseStringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) {
    throw new WorkspaceCodecError(path, 'Expected an array.');
  }
  return value.map((item, index) => requireString(item, `${path}/${index}`));
};

const parseCanonicalIdArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) {
    throw new WorkspaceCodecError(path, 'Expected an array.');
  }
  return value.map((item, index) =>
    requireCanonicalId(item, `${path}/${index}`)
  );
};

export const isPirWorkspaceDocumentType = (
  type: WorkspaceDocumentType
): boolean =>
  type === 'pir-page' || type === 'pir-layout' || type === 'pir-component';

export const isWorkspacePirDocument = (
  document: WorkspaceDocument | undefined
): document is WorkspaceDocument & { content: PIRDocument } =>
  Boolean(document && isPirWorkspaceDocumentType(document.type));

const parseWorkspaceDocument = (
  value: unknown,
  path: string
): WorkspaceDocument => {
  const source = requireRecord(value, path);
  assertAllowedKeys(
    source,
    WORKSPACE_DOCUMENT_KEYS,
    path,
    'Unknown workspace document field.'
  );
  const type = requireString(source.type, `${path}/type`);
  if (!WORKSPACE_DOCUMENT_TYPES.has(type as WorkspaceDocumentType)) {
    throw new WorkspaceCodecError(
      `${path}/type`,
      `Unsupported workspace document type: ${type}.`
    );
  }
  const id = requireString(source.id, `${path}/id`);
  const name =
    source.name === undefined
      ? undefined
      : isValidWorkspaceDocumentName(source.name)
        ? source.name
        : (() => {
            throw new WorkspaceCodecError(
              `${path}/name`,
              'Expected a non-empty string.'
            );
          })();
  const updatedAt =
    source.updatedAt === undefined
      ? undefined
      : isCanonicalWorkspaceDocumentUpdatedAt(source.updatedAt)
        ? source.updatedAt
        : (() => {
            throw new WorkspaceCodecError(
              `${path}/updatedAt`,
              'Expected an RFC3339 timestamp.'
            );
          })();
  let content = source.content;
  if (isPirWorkspaceDocumentType(type as WorkspaceDocumentType)) {
    const validation = validatePirDocument(content);
    if (validation.hasError) {
      throw new WorkspaceCodecError(
        `${path}/content`,
        validation.issues.map((issue) => issue.message).join('; ')
      );
    }
    content = validation.document;
  } else if (type === 'code' && !isWorkspaceCodeDocumentContent(content)) {
    throw new WorkspaceCodecError(
      `${path}/content`,
      `Workspace code document ${id} must use the code content wrapper.`
    );
  }
  const capabilities =
    source.capabilities === undefined
      ? undefined
      : parseStringArray(source.capabilities, `${path}/capabilities`);
  return {
    id,
    type: type as WorkspaceDocumentType,
    path: requireString(source.path, `${path}/path`),
    contentRev: requirePositiveInteger(source.contentRev, `${path}/contentRev`),
    metaRev: requirePositiveInteger(source.metaRev, `${path}/metaRev`),
    content,
    ...(name !== undefined ? { name } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
    ...(capabilities ? { capabilities } : {}),
  };
};

export const normalizeWorkspaceDocument = (
  document: WorkspaceDocument
): WorkspaceDocument =>
  parseWorkspaceDocument(document, `/documents/${document.id}`);

const parseWorkspaceTree = (
  value: unknown,
  path = '/tree'
): Pick<WorkspaceSnapshot, 'treeRootId' | 'treeById'> => {
  const source = requireRecord(value, path);
  assertAllowedKeys(
    source,
    WORKSPACE_TREE_KEYS,
    path,
    'Unknown workspace tree field.'
  );
  const treeRootId = requireCanonicalId(
    source.treeRootId,
    `${path}/treeRootId`
  );
  const rawTreeById = requireRecord(source.treeById, `${path}/treeById`);
  if (!Object.hasOwn(rawTreeById, treeRootId)) {
    throw new WorkspaceCodecError(
      `${path}/treeRootId`,
      'WKS_ROOT_MISSING: treeRootId must reference an existing node.'
    );
  }
  const treeById: Record<string, WorkspaceVfsNode> = {};
  Object.entries(rawTreeById).forEach(([nodeKey, rawNode]) => {
    const nodePath = `${path}/treeById/${toJsonPointerToken(nodeKey)}`;
    requireCanonicalId(nodeKey, nodePath);
    const node = requireRecord(rawNode, nodePath);
    const id = requireCanonicalId(node.id, `${nodePath}/id`);
    if (id !== nodeKey) {
      throw new WorkspaceCodecError(
        `${nodePath}/id`,
        'Tree node key must match node id.'
      );
    }
    if (node.kind !== 'dir' && node.kind !== 'doc') {
      throw new WorkspaceCodecError(`${nodePath}/kind`, 'Expected dir or doc.');
    }
    let parentId: string | null;
    if (nodeKey === treeRootId) {
      if (node.parentId !== null) {
        throw new WorkspaceCodecError(
          `${nodePath}/parentId`,
          'Expected null for the workspace root parentId.'
        );
      }
      parentId = null;
    } else {
      parentId = requireCanonicalId(node.parentId, `${nodePath}/parentId`);
    }
    if (node.kind === 'dir') {
      assertAllowedKeys(
        node,
        WORKSPACE_DIR_NODE_KEYS,
        nodePath,
        'Unknown workspace tree node field.'
      );
      treeById[id] = {
        id,
        kind: 'dir',
        name: requireString(node.name, `${nodePath}/name`),
        parentId,
        children: parseCanonicalIdArray(node.children, `${nodePath}/children`),
      };
      return;
    }
    assertAllowedKeys(
      node,
      WORKSPACE_DOC_NODE_KEYS,
      nodePath,
      'Unknown workspace tree node field.'
    );
    treeById[id] = {
      id,
      kind: 'doc',
      name: requireString(node.name, `${nodePath}/name`),
      parentId,
      docId: requireCanonicalId(node.docId, `${nodePath}/docId`),
    };
  });
  return { treeRootId, treeById };
};

export const normalizeWorkspaceTree = (
  tree: unknown,
  _documentsById?: Record<string, WorkspaceDocument>
): Pick<WorkspaceSnapshot, 'treeRootId' | 'treeById'> =>
  parseWorkspaceTree(tree);

const parseSettings = (value: unknown): Record<string, unknown> =>
  requireRecord(value, '/settings');

export type WorkspaceDocumentWireDto = {
  id: string;
  type: WorkspaceDocumentType;
  name?: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown;
  updatedAt?: string;
  capabilities?: string[];
};

export type WorkspaceTreeWireDto = {
  treeRootId: string;
  treeById: Record<string, WorkspaceVfsNode>;
};

export type WorkspaceSnapshotWireDto = {
  id: string;
  name?: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree: WorkspaceTreeWireDto;
  documents: WorkspaceDocumentWireDto[];
  routeManifest: unknown;
  settings: Record<string, unknown>;
  activeDocumentId?: string;
  activeRouteNodeId?: string;
};

export type DecodedWorkspaceSnapshot = {
  workspace: WorkspaceSnapshot;
  settings: Record<string, unknown>;
};

export type WorkspaceMutationWireDto = {
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree?: WorkspaceTreeWireDto;
  updatedDocuments?: WorkspaceDocumentWireDto[];
  removedDocumentIds?: string[];
  routeManifest?: unknown;
  settings?: Record<string, unknown>;
  activeDocumentId?: string;
  activeRouteNodeId?: string;
  acceptedMutationId?: string;
};

export type DecodedWorkspaceMutation = {
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  tree?: Pick<WorkspaceSnapshot, 'treeRootId' | 'treeById'>;
  updatedDocuments: WorkspaceDocument[];
  removedDocumentIds: string[];
  routeManifest?: WorkspaceRouteManifest;
  settings?: Record<string, unknown>;
  activeDocumentId?: string;
  activeRouteNodeId?: string;
  acceptedMutationId?: string;
};

/** Decodes the backend wire contract into the only canonical Workspace model. */
export const decodeWorkspaceSnapshot = (
  value: unknown
): DecodedWorkspaceSnapshot => {
  const source = requireRecord(value, '/workspace');
  assertAllowedKeys(
    source,
    WORKSPACE_SNAPSHOT_KEYS,
    '/workspace',
    'Unknown workspace snapshot field.'
  );
  if (!Array.isArray(source.documents) || !source.documents.length) {
    throw new WorkspaceCodecError(
      '/workspace/documents',
      'Expected at least one workspace document.'
    );
  }
  const documents = source.documents.map((document, index) =>
    parseWorkspaceDocument(document, `/workspace/documents/${index}`)
  );
  const docsById: Record<string, WorkspaceDocument> = {};
  documents.forEach((document, index) => {
    if (docsById[document.id]) {
      throw new WorkspaceCodecError(
        `/workspace/documents/${index}/id`,
        `Duplicate workspace document id: ${document.id}.`
      );
    }
    docsById[document.id] = document;
  });
  const tree = parseWorkspaceTree(source.tree, '/workspace/tree');
  const routeManifest = decodeWorkspaceRouteManifest(source.routeManifest, {
    resolveDocumentType: (documentId) => docsById[documentId]?.type,
  });
  const activeDocumentCandidate = optionalString(
    source.activeDocumentId,
    '/workspace/activeDocumentId'
  );
  const activeDocumentId =
    activeDocumentCandidate ?? resolveCanonicalWorkspaceDocumentId(documents);
  const activeRouteNodeId = resolveActiveRouteNodeId(routeManifest, [
    optionalString(source.activeRouteNodeId, '/workspace/activeRouteNodeId'),
  ]);
  const workspace: WorkspaceSnapshot = {
    id: requireString(source.id, '/workspace/id'),
    workspaceRev: requirePositiveInteger(
      source.workspaceRev,
      '/workspace/workspaceRev'
    ),
    routeRev: requirePositiveInteger(source.routeRev, '/workspace/routeRev'),
    opSeq: requirePositiveInteger(source.opSeq, '/workspace/opSeq'),
    ...tree,
    docsById,
    routeManifest,
    ...(optionalString(source.name, '/workspace/name')
      ? { name: source.name as string }
      : {}),
    ...(activeDocumentId ? { activeDocumentId } : {}),
    ...(activeRouteNodeId ? { activeRouteNodeId } : {}),
  };
  const validation = validateWorkspaceSnapshot(workspace);
  if (!validation.valid) {
    throw new WorkspaceCodecError(
      '/workspace',
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join('; ')
    );
  }
  return { workspace, settings: parseSettings(source.settings) };
};

export const encodeWorkspaceSnapshot = (
  workspace: WorkspaceSnapshot,
  settings: Record<string, unknown>
): WorkspaceSnapshotWireDto => {
  const validation = validateWorkspaceSnapshot(workspace);
  if (!validation.valid) {
    throw new WorkspaceCodecError(
      '/workspace',
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join('; ')
    );
  }
  return {
    id: workspace.id,
    ...(workspace.name ? { name: workspace.name } : {}),
    workspaceRev: workspace.workspaceRev,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq,
    tree: {
      treeRootId: workspace.treeRootId,
      treeById: workspace.treeById,
    },
    documents: Object.values(workspace.docsById).sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.id.localeCompare(right.id)
    ),
    routeManifest: workspace.routeManifest,
    settings: parseSettings(settings),
    ...(workspace.activeDocumentId
      ? { activeDocumentId: workspace.activeDocumentId }
      : {}),
    ...(workspace.activeRouteNodeId
      ? { activeRouteNodeId: workspace.activeRouteNodeId }
      : {}),
  };
};

export const decodeWorkspaceMutation = (
  value: unknown,
  workspace: WorkspaceSnapshot
): DecodedWorkspaceMutation => {
  const source = requireRecord(value, '/mutation');
  assertAllowedKeys(
    source,
    WORKSPACE_MUTATION_KEYS,
    '/mutation',
    'Unknown workspace mutation field.'
  );
  const workspaceId = requireString(
    source.workspaceId,
    '/mutation/workspaceId'
  );
  if (workspaceId !== workspace.id) {
    throw new WorkspaceCodecError(
      '/mutation/workspaceId',
      'Mutation workspaceId does not match the current workspace.'
    );
  }
  const updatedDocuments =
    source.updatedDocuments === undefined
      ? []
      : Array.isArray(source.updatedDocuments)
        ? source.updatedDocuments.map((document, index) =>
            parseWorkspaceDocument(
              document,
              `/mutation/updatedDocuments/${index}`
            )
          )
        : (() => {
            throw new WorkspaceCodecError(
              '/mutation/updatedDocuments',
              'Expected an array.'
            );
          })();
  const seenIds = new Set<string>();
  updatedDocuments.forEach((document, index) => {
    if (seenIds.has(document.id)) {
      throw new WorkspaceCodecError(
        `/mutation/updatedDocuments/${index}/id`,
        `Duplicate workspace document id: ${document.id}.`
      );
    }
    seenIds.add(document.id);
  });
  const removedDocumentIds =
    source.removedDocumentIds === undefined
      ? []
      : parseStringArray(
          source.removedDocumentIds,
          '/mutation/removedDocumentIds'
        );
  const docsAfterMutation = { ...workspace.docsById };
  removedDocumentIds.forEach(
    (documentId) => delete docsAfterMutation[documentId]
  );
  updatedDocuments.forEach((document) => {
    docsAfterMutation[document.id] = document;
  });
  return {
    workspaceId,
    workspaceRev: requirePositiveInteger(
      source.workspaceRev,
      '/mutation/workspaceRev'
    ),
    routeRev: requirePositiveInteger(source.routeRev, '/mutation/routeRev'),
    opSeq: requirePositiveInteger(source.opSeq, '/mutation/opSeq'),
    ...(source.tree !== undefined
      ? { tree: parseWorkspaceTree(source.tree, '/mutation/tree') }
      : {}),
    updatedDocuments,
    removedDocumentIds,
    ...(source.routeManifest !== undefined
      ? {
          routeManifest: decodeWorkspaceRouteManifest(source.routeManifest, {
            resolveDocumentType: (documentId) =>
              docsAfterMutation[documentId]?.type,
          }),
        }
      : {}),
    ...(source.settings !== undefined
      ? { settings: parseSettings(source.settings) }
      : {}),
    ...(optionalString(source.activeDocumentId, '/mutation/activeDocumentId')
      ? { activeDocumentId: source.activeDocumentId as string }
      : {}),
    ...(optionalString(source.activeRouteNodeId, '/mutation/activeRouteNodeId')
      ? { activeRouteNodeId: source.activeRouteNodeId as string }
      : {}),
    ...(optionalString(
      source.acceptedMutationId,
      '/mutation/acceptedMutationId'
    )
      ? { acceptedMutationId: source.acceptedMutationId as string }
      : {}),
  };
};

export const applyWorkspaceMutation = (
  workspace: WorkspaceSnapshot,
  mutation: DecodedWorkspaceMutation
): WorkspaceSnapshot => {
  if (workspace.id !== mutation.workspaceId) {
    throw new WorkspaceCodecError(
      '/mutation/workspaceId',
      'Mutation workspaceId does not match the current workspace.'
    );
  }
  const docsById = { ...workspace.docsById };
  mutation.removedDocumentIds.forEach(
    (documentId) => delete docsById[documentId]
  );
  mutation.updatedDocuments.forEach((document) => {
    docsById[document.id] = document;
  });
  const routeManifest = mutation.routeManifest ?? workspace.routeManifest;
  const requestedActiveDocumentId =
    mutation.activeDocumentId ?? workspace.activeDocumentId;
  const activeDocumentId =
    requestedActiveDocumentId && docsById[requestedActiveDocumentId]
      ? requestedActiveDocumentId
      : resolveCanonicalWorkspaceDocumentId(Object.values(docsById));
  const nextWorkspace: WorkspaceSnapshot = {
    ...workspace,
    workspaceRev: mutation.workspaceRev,
    routeRev: mutation.routeRev,
    opSeq: mutation.opSeq,
    ...(mutation.tree ?? {}),
    docsById,
    routeManifest,
    ...(activeDocumentId ? { activeDocumentId } : {}),
    activeRouteNodeId: resolveActiveRouteNodeId(routeManifest, [
      mutation.activeRouteNodeId,
      workspace.activeRouteNodeId,
    ]),
  };
  const validation = validateWorkspaceSnapshot(nextWorkspace);
  if (!validation.valid) {
    throw new WorkspaceCodecError(
      '/mutation',
      validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join('; ')
    );
  }
  return nextWorkspace;
};
