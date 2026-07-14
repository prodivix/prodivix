import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
  WorkspaceValidationIssue,
  WorkspaceValidationResult,
} from './types';
import {
  isPlainWorkspaceRecord,
  validateWorkspaceDocumentRecord,
} from './workspaceDocumentValidation';
import { validateWorkspaceComponentGraph } from './component/workspaceComponentGraph';
import { validateWorkspaceAnimationTargets } from './workspaceAnimationDocument';

type WorkspaceVfsValidationInput = Pick<
  WorkspaceSnapshot,
  'treeRootId' | 'treeById' | 'docsById' | 'activeDocumentId'
>;

const ROOT_PATH = '/';

const VFS_NODE_COMMON_FIELDS = ['id', 'kind', 'name', 'parentId'] as const;

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const joinPath = (parentPath: string, name: string): string => {
  if (parentPath === ROOT_PATH) return `/${name}`;
  return `${parentPath}/${name}`;
};

const isCanonicalNodeName = (name: unknown, isRoot: boolean): boolean => {
  if (typeof name !== 'string' || !name || name !== name.trim()) return false;
  if (isRoot && name === ROOT_PATH) return true;
  return (
    name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\')
  );
};

const isCanonicalWorkspaceId = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value) && value === value.trim();

const getDirectoryChildren = (node: WorkspaceVfsNode): unknown[] =>
  Array.isArray(node.children) ? node.children : [];

const addIssue = (
  issues: WorkspaceValidationIssue[],
  issue: WorkspaceValidationIssue
) => {
  issues.push(issue);
};

const getNodePath = (nodeId: string) =>
  `/treeById/${escapePointerSegment(nodeId)}`;

const validateDirectoryChildren = (
  nodeId: string,
  node: WorkspaceVfsNode,
  treeById: Record<string, WorkspaceVfsNode>,
  issues: WorkspaceValidationIssue[]
) => {
  if (!Array.isArray(node.children)) {
    addIssue(issues, {
      code: 'WKS_DIR_CHILDREN_MISSING',
      path: `${getNodePath(nodeId)}/children`,
      message: 'Directory nodes must declare a children array.',
      nodeId,
    });
    return;
  }

  const seenChildIds = new Set<string>();
  const seenNames = new Map<string, string>();

  node.children.forEach((childId, index) => {
    const childPath = `${getNodePath(nodeId)}/children/${index}`;
    if (!isCanonicalWorkspaceId(childId)) {
      addIssue(issues, {
        code: 'WKS_DIR_CHILD_ID_INVALID',
        path: childPath,
        message:
          'Directory child ids must be non-empty and must not contain surrounding whitespace.',
        nodeId,
      });
      return;
    }
    if (seenChildIds.has(childId)) {
      addIssue(issues, {
        code: 'WKS_DIR_DUPLICATE_CHILD',
        path: childPath,
        message: 'Directory children must not contain duplicate node ids.',
        nodeId: childId,
      });
      return;
    }
    seenChildIds.add(childId);

    const child = treeById[childId];
    if (!child) {
      addIssue(issues, {
        code: 'WKS_DIR_CHILD_MISSING',
        path: childPath,
        message: 'Directory child id must exist in treeById.',
        nodeId: childId,
      });
      return;
    }

    if (child.parentId !== nodeId) {
      addIssue(issues, {
        code: 'WKS_DIR_CHILD_PARENT_MISMATCH',
        path: `${getNodePath(childId)}/parentId`,
        message: 'Child parentId must point back to the owning directory.',
        nodeId: childId,
      });
    }

    const duplicateNameNodeId = seenNames.get(child.name);
    if (duplicateNameNodeId) {
      addIssue(issues, {
        code: 'WKS_DIR_DUPLICATE_NAME',
        path: `${getNodePath(childId)}/name`,
        message: 'Sibling nodes must not use the same name.',
        nodeId: childId,
      });
      return;
    }
    seenNames.set(child.name, childId);
  });
};

const validateDocumentNode = (
  nodeId: string,
  node: WorkspaceVfsNode,
  docsById: Record<string, WorkspaceDocument>,
  referencedDocumentIds: Map<string, string>,
  issues: WorkspaceValidationIssue[]
) => {
  if (node.children !== undefined) {
    addIssue(issues, {
      code: 'WKS_DOC_NODE_CHILDREN_INVALID',
      path: `${getNodePath(nodeId)}/children`,
      message: 'Document nodes must not declare children.',
      nodeId,
    });
  }

  if (node.docId === undefined) {
    addIssue(issues, {
      code: 'WKS_DOC_REF_MISSING',
      path: `${getNodePath(nodeId)}/docId`,
      message: 'Document nodes must reference an existing document.',
      nodeId,
      documentId: node.docId,
    });
    return;
  }

  if (!isCanonicalWorkspaceId(node.docId)) {
    addIssue(issues, {
      code: 'WKS_DOC_REF_ID_INVALID',
      path: `${getNodePath(nodeId)}/docId`,
      message:
        'Document reference ids must be non-empty and must not contain surrounding whitespace.',
      nodeId,
      documentId: node.docId,
    });
    return;
  }

  if (!docsById[node.docId]) {
    addIssue(issues, {
      code: 'WKS_DOC_REF_MISSING',
      path: `${getNodePath(nodeId)}/docId`,
      message: 'Document nodes must reference an existing document.',
      nodeId,
      documentId: node.docId,
    });
    return;
  }

  const previousNodeId = referencedDocumentIds.get(node.docId);
  if (previousNodeId) {
    addIssue(issues, {
      code: 'WKS_DOC_REF_DUPLICATE',
      path: `${getNodePath(nodeId)}/docId`,
      message: 'A document can only be mounted once in the workspace tree.',
      nodeId,
      documentId: node.docId,
    });
    return;
  }
  referencedDocumentIds.set(node.docId, nodeId);
};

const visitReachableTree = (
  nodeId: string,
  treeById: Record<string, WorkspaceVfsNode>,
  issues: WorkspaceValidationIssue[],
  reachableNodeIds: Set<string>,
  visitingNodeIds: Set<string>
) => {
  if (visitingNodeIds.has(nodeId)) {
    addIssue(issues, {
      code: 'WKS_TREE_CYCLE',
      path: getNodePath(nodeId),
      message: 'Workspace tree must not contain cycles.',
      nodeId,
    });
    return;
  }

  const node = treeById[nodeId];
  if (!node || reachableNodeIds.has(nodeId)) return;

  visitingNodeIds.add(nodeId);
  reachableNodeIds.add(nodeId);
  if (node.kind === 'dir') {
    getDirectoryChildren(node)
      .filter(isCanonicalWorkspaceId)
      .forEach((childId) =>
        visitReachableTree(
          childId,
          treeById,
          issues,
          reachableNodeIds,
          visitingNodeIds
        )
      );
  }
  visitingNodeIds.delete(nodeId);
};

const collectTreePaths = (
  nodeId: string,
  treeById: Record<string, WorkspaceVfsNode>,
  currentPath: string,
  pathsByNodeId: Map<string, string>
) => {
  const node = treeById[nodeId];
  if (!node || pathsByNodeId.has(nodeId)) return;

  const nextPath =
    node.parentId === null ? ROOT_PATH : joinPath(currentPath, node.name);
  pathsByNodeId.set(nodeId, nextPath);

  if (node.kind === 'dir') {
    getDirectoryChildren(node)
      .filter(isCanonicalWorkspaceId)
      .forEach((childId) =>
        collectTreePaths(childId, treeById, nextPath, pathsByNodeId)
      );
  }
};

export const validateWorkspaceVfs = ({
  treeRootId,
  treeById,
  docsById,
  activeDocumentId,
}: WorkspaceVfsValidationInput): WorkspaceValidationResult => {
  const issues: WorkspaceValidationIssue[] = [];
  const root = treeById[treeRootId];

  if (
    typeof treeRootId !== 'string' ||
    !treeRootId ||
    treeRootId !== treeRootId.trim()
  ) {
    addIssue(issues, {
      code: 'WKS_ROOT_ID_INVALID',
      path: '/treeRootId',
      message: 'treeRootId must be a non-empty id without outer whitespace.',
      nodeId: treeRootId,
    });
  }

  if (!root) {
    addIssue(issues, {
      code: 'WKS_ROOT_MISSING',
      path: '/treeRootId',
      message: 'treeRootId must reference an existing node.',
      nodeId: treeRootId,
    });
    return { valid: false, issues };
  }

  if (!Object.keys(docsById).length) {
    addIssue(issues, {
      code: 'WKS_DOCUMENTS_EMPTY',
      path: '/docsById',
      message: 'A workspace must contain at least one document.',
    });
  }

  if (root.parentId !== null) {
    addIssue(issues, {
      code: 'WKS_ROOT_PARENT_INVALID',
      path: `${getNodePath(treeRootId)}/parentId`,
      message: 'Root node parentId must be null.',
      nodeId: treeRootId,
    });
  }

  if (root.kind !== 'dir') {
    addIssue(issues, {
      code: 'WKS_ROOT_KIND_INVALID',
      path: `${getNodePath(treeRootId)}/kind`,
      message: 'Workspace root must be a directory node.',
      nodeId: treeRootId,
    });
  }

  const referencedDocumentIds = new Map<string, string>();

  Object.entries(treeById).forEach(([nodeId, node]) => {
    if (!isPlainWorkspaceRecord(node)) {
      addIssue(issues, {
        code: 'WKS_NODE_KIND_INVALID',
        path: getNodePath(nodeId),
        message: 'VFS nodes must be objects using the dir or doc shape.',
        nodeId,
      });
      return;
    }
    if (!isCanonicalWorkspaceId(nodeId)) {
      addIssue(issues, {
        code: 'WKS_NODE_ID_INVALID',
        path: getNodePath(nodeId),
        message:
          'treeById keys must be non-empty and must not contain surrounding whitespace.',
        nodeId,
      });
    }
    if (!isCanonicalWorkspaceId(node.id)) {
      addIssue(issues, {
        code: 'WKS_NODE_ID_INVALID',
        path: `${getNodePath(nodeId)}/id`,
        message:
          'VFS node ids must be non-empty and must not contain surrounding whitespace.',
        nodeId,
      });
    }
    if (node.id !== nodeId) {
      addIssue(issues, {
        code: 'WKS_NODE_ID_MISMATCH',
        path: `${getNodePath(nodeId)}/id`,
        message: 'treeById key must match node.id.',
        nodeId,
      });
    }

    if (!isCanonicalNodeName(node.name, nodeId === treeRootId)) {
      addIssue(issues, {
        code: 'WKS_NODE_NAME_INVALID',
        path: `${getNodePath(nodeId)}/name`,
        message:
          'VFS node names must be non-empty, trimmed, and must not contain path separators or dot segments.',
        nodeId,
      });
    }

    if (node.kind !== 'dir' && node.kind !== 'doc') {
      addIssue(issues, {
        code: 'WKS_NODE_KIND_INVALID',
        path: `${getNodePath(nodeId)}/kind`,
        message: 'VFS node kind must be dir or doc.',
        nodeId,
      });
    }
    const allowedFields = new Set<string>([
      ...VFS_NODE_COMMON_FIELDS,
      ...(node.kind === 'dir' ? ['children'] : ['docId']),
    ]);
    const unknownField = Object.keys(node).find(
      (field) => !allowedFields.has(field)
    );
    if (unknownField) {
      addIssue(issues, {
        code: 'WKS_NODE_FIELD_INVALID',
        path: `${getNodePath(nodeId)}/${escapePointerSegment(unknownField)}`,
        message: `VFS node field ${unknownField} is not valid for ${node.kind} nodes.`,
        nodeId,
      });
    }

    const isRootNode = nodeId === treeRootId;
    if (!isRootNode && !isCanonicalWorkspaceId(node.parentId)) {
      addIssue(issues, {
        code: 'WKS_NODE_PARENT_ID_INVALID',
        path: `${getNodePath(nodeId)}/parentId`,
        message:
          'Non-root parentId values must be non-empty and must not contain surrounding whitespace.',
        nodeId,
      });
    }

    if (isCanonicalWorkspaceId(node.parentId) && !treeById[node.parentId]) {
      addIssue(issues, {
        code: 'WKS_NODE_PARENT_MISSING',
        path: `${getNodePath(nodeId)}/parentId`,
        message: 'Node parentId must reference an existing directory.',
        nodeId,
      });
    }

    if (isCanonicalWorkspaceId(node.parentId)) {
      const parent = treeById[node.parentId];
      if (
        parent?.kind === 'dir' &&
        !getDirectoryChildren(parent).includes(nodeId)
      ) {
        addIssue(issues, {
          code: 'WKS_NODE_PARENT_LINK_MISSING',
          path: `${getNodePath(node.parentId)}/children`,
          message: 'Parent directory children must include the child node id.',
          nodeId,
        });
      }
    }

    if (node.kind === 'dir') {
      validateDirectoryChildren(nodeId, node, treeById, issues);
      return;
    }

    validateDocumentNode(nodeId, node, docsById, referencedDocumentIds, issues);
  });

  const reachableNodeIds = new Set<string>();
  visitReachableTree(treeRootId, treeById, issues, reachableNodeIds, new Set());

  Object.keys(treeById).forEach((nodeId) => {
    if (reachableNodeIds.has(nodeId)) return;
    addIssue(issues, {
      code: 'WKS_TREE_ORPHANED_NODE',
      path: getNodePath(nodeId),
      message: 'Every workspace tree node must be reachable from treeRootId.',
      nodeId,
    });
  });

  const pathsByNodeId = new Map<string, string>();
  collectTreePaths(treeRootId, treeById, ROOT_PATH, pathsByNodeId);

  Object.entries(docsById).forEach(([documentId, document]) => {
    issues.push(...validateWorkspaceDocumentRecord(documentId, document));
    const nodeId = referencedDocumentIds.get(documentId);
    if (!nodeId) {
      addIssue(issues, {
        code: 'WKS_DOCUMENT_ORPHANED',
        path: `/docsById/${escapePointerSegment(documentId)}`,
        message: 'Every document must be mounted by exactly one VFS doc node.',
        documentId,
      });
      return;
    }

    if (!isPlainWorkspaceRecord(document)) return;

    const expectedPath = pathsByNodeId.get(nodeId);
    if (expectedPath && document.path !== expectedPath) {
      addIssue(issues, {
        code: 'WKS_DOCUMENT_PATH_MISMATCH',
        path: `/docsById/${escapePointerSegment(documentId)}/path`,
        message: 'WorkspaceDocument.path must match the path derived from VFS.',
        nodeId,
        documentId,
      });
    }
  });

  if (activeDocumentId && !docsById[activeDocumentId]) {
    addIssue(issues, {
      code: 'WKS_ACTIVE_DOCUMENT_MISSING',
      path: '/activeDocumentId',
      message: 'activeDocumentId must reference an existing document.',
      documentId: activeDocumentId,
    });
  }

  return { valid: issues.length === 0, issues };
};

export const validateWorkspaceSnapshot = (
  snapshot: WorkspaceSnapshot
): WorkspaceValidationResult => {
  const result = validateWorkspaceVfs({
    treeRootId: snapshot.treeRootId,
    treeById: snapshot.treeById,
    docsById: snapshot.docsById,
    activeDocumentId: snapshot.activeDocumentId,
  });
  const issues = [...result.issues];
  issues.push(...validateWorkspaceAnimationTargets(snapshot));
  (
    [
      ['workspaceRev', snapshot.workspaceRev],
      ['routeRev', snapshot.routeRev],
      ['opSeq', snapshot.opSeq],
    ] as const
  ).forEach(([field, value]) => {
    if (Number.isSafeInteger(value) && value > 0) return;
    addIssue(issues, {
      code: 'WKS_SNAPSHOT_REVISION_INVALID',
      path: `/${field}`,
      message: `${field} must be a positive safe integer.`,
    });
  });
  for (const issue of validateWorkspaceComponentGraph(snapshot).issues) {
    addIssue(issues, {
      code: 'WKS_DOCUMENT_CONTENT_INVALID',
      path: issue.path,
      message: `${issue.code}: ${issue.message}`,
      documentId: issue.documentId,
    });
  }
  return { valid: issues.length === 0, issues };
};
