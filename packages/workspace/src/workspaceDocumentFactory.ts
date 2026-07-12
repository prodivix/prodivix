import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from './types';

export type WorkspaceDocumentNodeIdFactory = (preferredId: string) => string;

export type CreateWorkspaceDocumentAtPathCommandInput = {
  workspace: WorkspaceSnapshot;
  document: WorkspaceDocument;
  commandId: string;
  issuedAt: string;
  idFactory?: WorkspaceDocumentNodeIdFactory;
  label?: string;
};

export type WorkspaceDocumentFactoryErrorCode =
  | 'WKS_DOCUMENT_FACTORY_INVALID_ID'
  | 'WKS_DOCUMENT_FACTORY_INVALID_PATH'
  | 'WKS_DOCUMENT_FACTORY_DUPLICATE_ID'
  | 'WKS_DOCUMENT_FACTORY_DUPLICATE_PATH'
  | 'WKS_DOCUMENT_FACTORY_VFS_CONFLICT'
  | 'WKS_DOCUMENT_FACTORY_NODE_ID_COLLISION';

export class WorkspaceDocumentFactoryError extends Error {
  readonly code: WorkspaceDocumentFactoryErrorCode;
  readonly path: string;

  constructor(
    code: WorkspaceDocumentFactoryErrorCode,
    path: string,
    message: string
  ) {
    super(message);
    this.name = 'WorkspaceDocumentFactoryError';
    this.code = code;
    this.path = path;
  }
}

export type WorkspaceDocumentAtPathPlan = {
  snapshot: WorkspaceSnapshot;
  documentNodeId: string;
  forwardOps: WorkspacePatchOperation[];
  reverseOps: WorkspacePatchOperation[];
};

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const normalizeCanonicalDocumentPath = (path: string): string[] => {
  const source = path.trim().replaceAll('\\', '/');
  if (!source.startsWith('/')) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_INVALID_PATH',
      '/document/path',
      'Workspace document paths must be absolute.'
    );
  }
  const segments = source.split('/').slice(1);
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment !== segment.trim() ||
        segment === '.' ||
        segment === '..'
    )
  ) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_INVALID_PATH',
      '/document/path',
      'Workspace document paths must be canonical and address a file.'
    );
  }
  const canonicalPath = `/${segments.join('/')}`;
  if (source !== canonicalPath) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_INVALID_PATH',
      '/document/path',
      'Workspace document paths must use canonical separators.'
    );
  }
  return segments;
};

const tryNormalizeDocumentPath = (path: string): string | undefined => {
  try {
    return `/${normalizeCanonicalDocumentPath(path).join('/')}`;
  } catch {
    return undefined;
  }
};

const findNamedChild = (
  treeById: Record<string, WorkspaceVfsNode>,
  parent: WorkspaceVfsNode,
  name: string
): WorkspaceVfsNode | undefined =>
  (parent.children ?? [])
    .map((childId) => treeById[childId])
    .find((child) => child?.name === name);

const createAvailableNodeId = (
  treeById: Record<string, WorkspaceVfsNode>,
  preferredId: string,
  idFactory: WorkspaceDocumentNodeIdFactory | undefined
): string => {
  if (idFactory) {
    const candidate = idFactory(preferredId).trim();
    if (!candidate) {
      throw new WorkspaceDocumentFactoryError(
        'WKS_DOCUMENT_FACTORY_INVALID_ID',
        '/idFactory',
        'Workspace node id factories must return a non-empty id.'
      );
    }
    if (treeById[candidate]) {
      throw new WorkspaceDocumentFactoryError(
        'WKS_DOCUMENT_FACTORY_NODE_ID_COLLISION',
        `/treeById/${escapePointerSegment(candidate)}`,
        `Workspace VFS node already exists: ${candidate}`
      );
    }
    return candidate;
  }

  if (treeById[preferredId]) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_NODE_ID_COLLISION',
      `/treeById/${escapePointerSegment(preferredId)}`,
      `Workspace VFS node already exists: ${preferredId}`
    );
  }
  return preferredId;
};

const normalizePathNodeIdSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'item';

export const createWorkspacePathNodeId = (
  prefix: 'dir' | 'doc',
  segments: readonly string[]
): string =>
  segments.length
    ? `${prefix}_${segments.map(normalizePathNodeIdSegment).join('_')}`
    : prefix;

export const createWorkspaceDocumentNodeId = (documentId: string): string =>
  createWorkspacePathNodeId('doc', [documentId]);

/**
 * Builds the canonical snapshot and reversible patch pair for mounting one
 * new document. Callers that need a larger transaction can reuse this plan
 * without applying an intermediate Store mutation.
 */
export const planWorkspaceDocumentAtPath = (
  workspace: WorkspaceSnapshot,
  document: WorkspaceDocument,
  idFactory?: WorkspaceDocumentNodeIdFactory
): WorkspaceDocumentAtPathPlan => {
  if (!document.id.trim() || document.id !== document.id.trim()) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_INVALID_ID',
      '/document/id',
      'Workspace document ids must be non-empty and trimmed.'
    );
  }
  if (workspace.docsById[document.id]) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_DUPLICATE_ID',
      `/docsById/${escapePointerSegment(document.id)}`,
      `Workspace document id already exists: ${document.id}`
    );
  }

  const pathSegments = normalizeCanonicalDocumentPath(document.path);
  const canonicalPath = `/${pathSegments.join('/')}`;
  const duplicateDocument = Object.values(workspace.docsById).find(
    (candidate) => tryNormalizeDocumentPath(candidate.path) === canonicalPath
  );
  if (duplicateDocument) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_DUPLICATE_PATH',
      '/document/path',
      `Workspace document path already exists: ${canonicalPath}`
    );
  }

  const root = workspace.treeById[workspace.treeRootId];
  if (
    !root ||
    root.kind !== 'dir' ||
    root.parentId !== null ||
    !Array.isArray(root.children)
  ) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
      '/treeRootId',
      'Workspace root directory is missing or invalid.'
    );
  }

  const nextTreeById = { ...workspace.treeById };
  const forwardOps: WorkspacePatchOperation[] = [
    {
      op: 'add',
      path: `/docsById/${escapePointerSegment(document.id)}`,
      value: document,
    },
  ];
  const reverseOps: WorkspacePatchOperation[] = [
    {
      op: 'remove',
      path: `/docsById/${escapePointerSegment(document.id)}`,
    },
  ];

  const appendNode = (parentId: string, node: WorkspaceVfsNode) => {
    const parent = nextTreeById[parentId];
    if (parent?.kind !== 'dir' || !Array.isArray(parent.children)) {
      throw new WorkspaceDocumentFactoryError(
        'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
        `/treeById/${escapePointerSegment(parentId)}`,
        'A workspace document path can only traverse directories.'
      );
    }
    const childIndex = parent.children.length;
    forwardOps.push({
      op: 'add',
      path: `/treeById/${escapePointerSegment(node.id)}`,
      value: node,
    });
    forwardOps.push({
      op: 'add',
      path: `/treeById/${escapePointerSegment(parentId)}/children/-`,
      value: node.id,
    });
    reverseOps.unshift({
      op: 'remove',
      path: `/treeById/${escapePointerSegment(node.id)}`,
    });
    reverseOps.unshift({
      op: 'remove',
      path: `/treeById/${escapePointerSegment(parentId)}/children/${childIndex}`,
    });
    nextTreeById[node.id] = node;
    nextTreeById[parentId] = {
      ...parent,
      children: [...parent.children, node.id],
    };
  };

  let parentId = workspace.treeRootId;
  const directorySegments = pathSegments.slice(0, -1);
  for (
    let directoryIndex = 0;
    directoryIndex < directorySegments.length;
    directoryIndex += 1
  ) {
    const directoryName = directorySegments[directoryIndex];
    const parent = nextTreeById[parentId];
    if (!parent || parent.kind !== 'dir') {
      throw new WorkspaceDocumentFactoryError(
        'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
        `/treeById/${escapePointerSegment(parentId)}`,
        'A workspace document path can only traverse directories.'
      );
    }
    const existing = findNamedChild(nextTreeById, parent, directoryName);
    if (existing) {
      if (existing.kind !== 'dir') {
        throw new WorkspaceDocumentFactoryError(
          'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
          `/treeById/${escapePointerSegment(existing.id)}`,
          `Workspace path segment is already a document: ${directoryName}`
        );
      }
      parentId = existing.id;
      continue;
    }

    const directoryId = createAvailableNodeId(
      nextTreeById,
      createWorkspacePathNodeId(
        'dir',
        directorySegments.slice(0, directoryIndex + 1)
      ),
      idFactory
    );
    appendNode(parentId, {
      id: directoryId,
      kind: 'dir',
      name: directoryName,
      parentId,
      children: [],
    });
    parentId = directoryId;
  }

  const fileName = pathSegments.at(-1) as string;
  const parent = nextTreeById[parentId];
  if (!parent || parent.kind !== 'dir') {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_VFS_CONFLICT',
      `/treeById/${escapePointerSegment(parentId)}`,
      'Workspace document parent must be a directory.'
    );
  }
  if (findNamedChild(nextTreeById, parent, fileName)) {
    throw new WorkspaceDocumentFactoryError(
      'WKS_DOCUMENT_FACTORY_DUPLICATE_PATH',
      '/document/path',
      `Workspace VFS path already exists: ${canonicalPath}`
    );
  }

  const documentNodeId = createAvailableNodeId(
    nextTreeById,
    createWorkspaceDocumentNodeId(document.id),
    idFactory
  );
  appendNode(parentId, {
    id: documentNodeId,
    kind: 'doc',
    name: fileName,
    parentId,
    docId: document.id,
  });

  return {
    snapshot: {
      ...workspace,
      treeById: nextTreeById,
      docsById: { ...workspace.docsById, [document.id]: document },
    },
    documentNodeId,
    forwardOps,
    reverseOps,
  };
};

/** Creates one reversible command that mounts a new document at its VFS path. */
export const createWorkspaceDocumentAtPathCommand = ({
  workspace,
  document,
  commandId,
  issuedAt,
  idFactory,
  label,
}: CreateWorkspaceDocumentAtPathCommandInput): WorkspaceCommandEnvelope => {
  const plan = planWorkspaceDocumentAtPath(workspace, document, idFactory);
  return {
    id: commandId,
    namespace: 'core.workspace',
    type: 'document.create-at-path',
    version: '1.0',
    issuedAt,
    target: { workspaceId: workspace.id },
    domainHint: 'workspace',
    label: label ?? `Create ${document.path}`,
    forwardOps: plan.forwardOps,
    reverseOps: plan.reverseOps,
  };
};
