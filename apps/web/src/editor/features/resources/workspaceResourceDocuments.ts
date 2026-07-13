import {
  collectRouteManifestDocumentRefs,
  type WorkspaceRouteManifest,
} from '@prodivix/router';
import {
  createWorkspaceDocumentIntentRequest,
  createWorkspaceProjectConfigValueUpdateCommand,
  deleteWorkspaceDocumentIntentRequest,
  isWorkspaceProjectConfigDocumentContent,
  renameWorkspaceDocumentIntentRequest,
  type WorkspaceDocument,
  type WorkspaceDocumentType,
  type WorkspaceVfsNode,
} from '@prodivix/workspace';

export const RESOURCE_ROOTS = {
  public: '/public',
  projectFiles: '/project',
  i18n: '/i18n/store.json',
  external: '/config/external-libraries.json',
} as const;

export const createResourceIntentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const createWorkspaceResourceDocumentId = (
  prefix: string,
  path: string
) =>
  `${prefix}_${path
    .trim()
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;

export const createWorkspaceResourceNodeId = (prefix: string, path: string) =>
  `${prefix}_dir_${path
    .trim()
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')}`;

export const getWorkspaceNodePath = (
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>,
  nodeId: string
): string | null => {
  const node = treeById[nodeId];
  if (!node) return null;
  const segments: string[] = [];
  let current: WorkspaceVfsNode | undefined = node;
  while (current && current.parentId !== null) {
    segments.unshift(current.name);
    current = treeById[current.parentId];
  }
  if (!treeRootId || !treeById[treeRootId]) return null;
  return `/${segments.join('/')}`;
};

export const findWorkspaceNodeByPath = (
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>,
  path: string
) => {
  const normalizedPath = normalizeWorkspaceResourcePath(path);
  return Object.values(treeById).find(
    (node) =>
      normalizeWorkspaceResourcePath(
        getWorkspaceNodePath(treeRootId, treeById, node.id) ?? ''
      ) === normalizedPath
  );
};

export const normalizeWorkspaceResourcePath = (path: string) =>
  `/${path.trim().replace(/^\/+/, '').replace(/\/+/g, '/')}`.replace(/\/$/, '');

export const joinWorkspaceResourcePath = (...parts: string[]) =>
  normalizeWorkspaceResourcePath(parts.join('/'));

export const listWorkspaceDocumentsByPrefix = (
  documentsById: Record<string, WorkspaceDocument>,
  prefix: string,
  type?: WorkspaceDocumentType
) => {
  const normalizedPrefix = normalizeWorkspaceResourcePath(prefix);
  return Object.values(documentsById)
    .filter((document) => {
      if (type && document.type !== type) return false;
      const normalizedPath = normalizeWorkspaceResourcePath(document.path);
      return (
        normalizedPath === normalizedPrefix ||
        normalizedPath.startsWith(`${normalizedPrefix}/`)
      );
    })
    .sort((left, right) => left.path.localeCompare(right.path));
};

export const findWorkspaceDocumentByPath = (
  documentsById: Record<string, WorkspaceDocument>,
  path: string,
  type?: WorkspaceDocumentType
) => {
  const normalizedPath = normalizeWorkspaceResourcePath(path);
  return Object.values(documentsById).find(
    (document) =>
      (!type || document.type === type) &&
      normalizeWorkspaceResourcePath(document.path) === normalizedPath
  );
};

export const getWorkspaceConfigDocumentValue = <TValue>(
  documentsById: Record<string, WorkspaceDocument>,
  path: string,
  fallback: TValue
): TValue => {
  const document = findWorkspaceDocumentByPath(
    documentsById,
    path,
    'project-config'
  );
  if (
    !document ||
    !isWorkspaceProjectConfigDocumentContent<TValue>(document.content)
  ) {
    return fallback;
  }
  return document.content.value;
};

export const createWorkspaceResourceDocumentRequest = ({
  workspaceRev,
  documentId,
  nodeId,
  parentNodeId,
  path,
  type,
  content,
}: {
  workspaceRev: number;
  documentId: string;
  nodeId?: string;
  parentNodeId?: string;
  path: string;
  type: WorkspaceDocumentType;
  content: unknown;
}) =>
  createWorkspaceDocumentIntentRequest({
    workspaceRev,
    intentId: createResourceIntentId(),
    issuedAt: new Date().toISOString(),
    documentId,
    nodeId,
    parentNodeId,
    path,
    type,
    content,
  });

export const renameWorkspaceResourceDocumentRequest = ({
  workspaceRev,
  documentId,
  path,
  type,
}: {
  workspaceRev: number;
  documentId: string;
  path: string;
  type: WorkspaceDocumentType;
}) =>
  renameWorkspaceDocumentIntentRequest({
    workspaceRev,
    intentId: createResourceIntentId(),
    issuedAt: new Date().toISOString(),
    documentId,
    path,
    type,
  });

export const deleteWorkspaceResourceDocumentRequest = ({
  workspaceRev,
  documentId,
  type,
}: {
  workspaceRev: number;
  documentId: string;
  type: WorkspaceDocumentType;
}) =>
  deleteWorkspaceDocumentIntentRequest({
    workspaceRev,
    intentId: createResourceIntentId(),
    issuedAt: new Date().toISOString(),
    documentId,
    type,
  });

export const isWorkspaceDocumentReferencedByRoute = (
  routeManifest: WorkspaceRouteManifest,
  documentId: string
): boolean => collectRouteManifestDocumentRefs(routeManifest).has(documentId);

export const createWorkspaceResourceValueUpdateCommand = <TValue>({
  workspaceId,
  document,
  value,
  label,
}: {
  workspaceId: string;
  document: WorkspaceDocument;
  value: TValue;
  label?: string;
}) => {
  const issuedAt = new Date().toISOString();
  return createWorkspaceProjectConfigValueUpdateCommand({
    commandId: createResourceIntentId(),
    issuedAt,
    workspaceId,
    document,
    value,
    ...(label ? { label } : {}),
  });
};
