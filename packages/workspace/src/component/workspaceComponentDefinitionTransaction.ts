import {
  createEmptyPirDocument,
  validatePirDocument,
  type PIRComponentContract,
  type PIRValidationCode,
} from '@prodivix/pir';
import { createWorkspaceDocumentNodeId } from '../workspaceDocumentFactory';
import { isCanonicalWorkspaceDocumentPath } from '../workspaceDocumentValidation';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';

export const WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES = {
  baseRevisionMismatch: 'WKS_COMPONENT_DEFINITION_BASE_REVISION_MISMATCH',
  inputInvalid: 'WKS_COMPONENT_DEFINITION_INPUT_INVALID',
  documentIdCollision: 'WKS_COMPONENT_DEFINITION_DOCUMENT_ID_COLLISION',
  documentPathInvalid: 'WKS_COMPONENT_DEFINITION_DOCUMENT_PATH_INVALID',
  documentPathCollision: 'WKS_COMPONENT_DEFINITION_DOCUMENT_PATH_COLLISION',
  parentMissing: 'WKS_COMPONENT_DEFINITION_PARENT_MISSING',
  parentNotDirectory: 'WKS_COMPONENT_DEFINITION_PARENT_NOT_DIRECTORY',
  parentPathMismatch: 'WKS_COMPONENT_DEFINITION_PARENT_PATH_MISMATCH',
  siblingNameCollision: 'WKS_COMPONENT_DEFINITION_SIBLING_NAME_COLLISION',
  insertionIndexInvalid: 'WKS_COMPONENT_DEFINITION_INSERTION_INDEX_INVALID',
  nodeIdCollision: 'WKS_COMPONENT_DEFINITION_NODE_ID_COLLISION',
  contractInvalid: 'WKS_COMPONENT_DEFINITION_CONTRACT_INVALID',
} as const;

export type WorkspaceComponentDefinitionPlanIssueCode =
  (typeof WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES];

export type WorkspaceComponentDefinitionPlanIssue = Readonly<{
  code: WorkspaceComponentDefinitionPlanIssueCode;
  path: string;
  message: string;
  causeCode?: PIRValidationCode;
}>;

export type CreateWorkspaceComponentDefinitionTransactionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  transactionId: string;
  issuedAt: string;
  documentId: string;
  path: string;
  name: string;
  rootId: string;
  rootType: string;
  componentContract: PIRComponentContract;
  parentDirectoryId: string;
  index: number;
}>;

export type WorkspaceComponentDefinitionTransactionPlan = Readonly<{
  baseRevision: number;
  document: WorkspaceDocument;
  documentNode: WorkspaceVfsNode & Readonly<{ kind: 'doc' }>;
  insertionIndex: number;
  transaction: WorkspaceTransactionEnvelope;
}>;

export type WorkspaceComponentDefinitionTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceComponentDefinitionTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceComponentDefinitionPlanIssue[];
    }>;

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string) =>
  value.replace(/~/g, '~0').replace(/\//g, '~1');

const isCanonicalRequiredText = (value: string) =>
  value.length > 0 && value === value.trim();

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isWorkspaceDirectoryNode = (
  node: WorkspaceVfsNode | undefined
): node is WorkspaceVfsNode & Readonly<{ kind: 'dir'; children: string[] }> =>
  node?.kind === 'dir' && Array.isArray(node.children);

const addIssue = (
  issues: WorkspaceComponentDefinitionPlanIssue[],
  issue: WorkspaceComponentDefinitionPlanIssue
) => {
  issues.push(issue);
};

const compareIssues = (
  left: WorkspaceComponentDefinitionPlanIssue,
  right: WorkspaceComponentDefinitionPlanIssue
) =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message) ||
  compareText(left.causeCode ?? '', right.causeCode ?? '');

const resolveDirectoryPath = (
  workspace: WorkspaceSnapshot,
  directoryId: string
): string | undefined => {
  const segments: string[] = [];
  const visited = new Set<string>();
  let currentId = directoryId;

  while (currentId !== workspace.treeRootId) {
    if (visited.has(currentId)) return undefined;
    visited.add(currentId);
    const node = hasOwn(workspace.treeById, currentId)
      ? workspace.treeById[currentId]
      : undefined;
    if (
      !node ||
      node.kind !== 'dir' ||
      !Array.isArray(node.children) ||
      !node.parentId ||
      !isCanonicalRequiredText(node.name) ||
      node.name.includes('/') ||
      node.name.includes('\\')
    ) {
      return undefined;
    }
    const parent = hasOwn(workspace.treeById, node.parentId)
      ? workspace.treeById[node.parentId]
      : undefined;
    if (
      !isWorkspaceDirectoryNode(parent) ||
      !parent.children.includes(currentId)
    ) {
      return undefined;
    }
    segments.unshift(node.name);
    currentId = node.parentId;
  }

  const root = hasOwn(workspace.treeById, workspace.treeRootId)
    ? workspace.treeById[workspace.treeRootId]
    : undefined;
  if (
    !root ||
    root.kind !== 'dir' ||
    root.parentId !== null ||
    !Array.isArray(root.children)
  ) {
    return undefined;
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
};

const createWorkspaceCommand = (
  input: Readonly<{
    id: string;
    workspaceId: string;
    issuedAt: string;
    type: string;
    label: string;
    forwardOps: WorkspaceCommandEnvelope['forwardOps'];
    reverseOps: WorkspaceCommandEnvelope['reverseOps'];
  }>
): WorkspaceCommandEnvelope => ({
  id: input.id,
  namespace: 'core.workspace',
  type: input.type,
  version: '1.0',
  issuedAt: input.issuedAt,
  target: { workspaceId: input.workspaceId },
  domainHint: 'workspace',
  label: input.label,
  forwardOps: input.forwardOps,
  reverseOps: input.reverseOps,
});

/**
 * Plans one atomic Component Definition creation. The returned transaction is
 * consumed by WorkspaceOperation/History; this function never applies or
 * transports the mutation itself.
 */
export const createWorkspaceComponentDefinitionTransactionPlan = (
  input: CreateWorkspaceComponentDefinitionTransactionInput
): WorkspaceComponentDefinitionTransactionPlanResult => {
  const issues: WorkspaceComponentDefinitionPlanIssue[] = [];
  const { workspace } = input;

  if (
    !Number.isSafeInteger(input.baseRevision) ||
    input.baseRevision !== workspace.workspaceRev
  ) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.baseRevisionMismatch,
      path: '/baseRevision',
      message: `Base revision must equal Workspace revision ${workspace.workspaceRev}.`,
    });
  }

  for (const [path, value, label] of [
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
    ['/documentId', input.documentId, 'Document id'],
    ['/name', input.name, 'Component name'],
    ['/rootId', input.rootId, 'Root id'],
    ['/rootType', input.rootType, 'Root type'],
    ['/parentDirectoryId', input.parentDirectoryId, 'Parent directory id'],
  ] as const) {
    if (isCanonicalRequiredText(value)) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
    });
  }

  if (
    isCanonicalRequiredText(input.documentId) &&
    hasOwn(workspace.docsById, input.documentId)
  ) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentIdCollision,
      path: `/docsById/${escapeJsonPointerSegment(input.documentId)}`,
      message: `Workspace document id already exists: ${input.documentId}.`,
    });
  }

  const documentNodeId = isCanonicalRequiredText(input.documentId)
    ? createWorkspaceDocumentNodeId(input.documentId)
    : '';
  if (documentNodeId && hasOwn(workspace.treeById, documentNodeId)) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.nodeIdCollision,
      path: `/treeById/${escapeJsonPointerSegment(documentNodeId)}`,
      message: `Canonical Component document node id already exists: ${documentNodeId}.`,
    });
  }

  const pathIsCanonical = isCanonicalWorkspaceDocumentPath(input.path);
  const pathSegments = pathIsCanonical ? input.path.slice(1).split('/') : [];
  const fileName = pathSegments.at(-1);
  if (!pathIsCanonical || !fileName) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentPathInvalid,
      path: '/path',
      message:
        'Component document path must be an absolute canonical file path.',
    });
  } else if (
    Object.values(workspace.docsById).some(
      (document) => document.path === input.path
    )
  ) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentPathCollision,
      path: '/path',
      message: `Workspace document path already exists: ${input.path}.`,
    });
  }

  const parent = hasOwn(workspace.treeById, input.parentDirectoryId)
    ? workspace.treeById[input.parentDirectoryId]
    : undefined;
  const parentDirectory = isWorkspaceDirectoryNode(parent) ? parent : undefined;
  if (!parent) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentMissing,
      path: `/treeById/${escapeJsonPointerSegment(input.parentDirectoryId)}`,
      message: 'Component document parent directory does not exist.',
    });
  } else if (!parentDirectory) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentNotDirectory,
      path: `/treeById/${escapeJsonPointerSegment(input.parentDirectoryId)}`,
      message: 'Component document parent must be a VFS directory.',
    });
  }

  if (
    !Number.isSafeInteger(input.index) ||
    input.index < 0 ||
    !parentDirectory ||
    input.index > parentDirectory.children.length
  ) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.insertionIndexInvalid,
      path: '/index',
      message: parentDirectory
        ? `Insertion index must be between 0 and ${parentDirectory.children.length}.`
        : 'Insertion index requires a valid parent directory.',
    });
  }

  if (parentDirectory && pathIsCanonical && fileName) {
    const parentPath = resolveDirectoryPath(workspace, input.parentDirectoryId);
    const requestedParentPath =
      pathSegments.length === 1
        ? '/'
        : `/${pathSegments.slice(0, -1).join('/')}`;
    if (!parentPath || parentPath !== requestedParentPath) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentPathMismatch,
        path: '/parentDirectoryId',
        message: `Parent directory must own the requested path ${input.path}.`,
      });
    }

    const siblingCollision = parentDirectory.children.some((childId) => {
      const child = hasOwn(workspace.treeById, childId)
        ? workspace.treeById[childId]
        : undefined;
      return child?.name === fileName;
    });
    if (siblingCollision) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.siblingNameCollision,
        path: '/path',
        message: `Parent directory already contains a child named ${fileName}.`,
      });
    }
  }

  if (
    !isCanonicalRequiredText(input.rootId) ||
    !isCanonicalRequiredText(input.rootType)
  ) {
    issues.sort(compareIssues);
    return { status: 'rejected', issues };
  }

  const content = createEmptyPirDocument({
    rootId: input.rootId,
    rootType: input.rootType,
    componentContract: input.componentContract,
  });
  const contentValidation = validatePirDocument(content);
  for (const issue of contentValidation.issues) {
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.contractInvalid,
      path: issue.path,
      message: issue.message,
      causeCode: issue.code,
    });
  }

  if (issues.length > 0 || !fileName || !parentDirectory) {
    issues.sort(compareIssues);
    return { status: 'rejected', issues };
  }

  const document: WorkspaceDocument = {
    id: input.documentId,
    type: 'pir-component',
    name: input.name,
    path: input.path,
    contentRev: 1,
    metaRev: 1,
    content,
  };
  const documentNode: WorkspaceVfsNode & Readonly<{ kind: 'doc' }> = {
    id: documentNodeId,
    kind: 'doc',
    name: fileName,
    parentId: input.parentDirectoryId,
    docId: input.documentId,
  };
  const documentPath = `/docsById/${escapeJsonPointerSegment(input.documentId)}`;
  const nodePath = `/treeById/${escapeJsonPointerSegment(documentNodeId)}`;
  const childPath = `/treeById/${escapeJsonPointerSegment(input.parentDirectoryId)}/children/${input.index}`;
  const label = `Create component ${input.name}`;
  const createDocument = createWorkspaceCommand({
    id: `${input.transactionId}:create-document`,
    workspaceId: workspace.id,
    issuedAt: input.issuedAt,
    type: 'component-definition.document.create',
    label,
    forwardOps: [{ op: 'add', path: documentPath, value: document }],
    reverseOps: [{ op: 'remove', path: documentPath }],
  });
  const mountDocument = createWorkspaceCommand({
    id: `${input.transactionId}:mount-document`,
    workspaceId: workspace.id,
    issuedAt: input.issuedAt,
    type: 'component-definition.document.mount',
    label,
    forwardOps: [
      { op: 'add', path: nodePath, value: documentNode },
      { op: 'add', path: childPath, value: documentNodeId },
    ],
    reverseOps: [
      { op: 'remove', path: childPath },
      { op: 'remove', path: nodePath },
    ],
  });

  return {
    status: 'ready',
    plan: {
      baseRevision: input.baseRevision,
      document,
      documentNode,
      insertionIndex: input.index,
      transaction: {
        id: input.transactionId,
        workspaceId: workspace.id,
        issuedAt: input.issuedAt,
        label,
        commands: [createDocument, mountDocument],
      },
    },
  };
};
