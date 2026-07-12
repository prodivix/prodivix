import {
  getWorkspaceOperationCommands,
  resolveWorkspaceCommandDomain,
  type WorkspaceDocument,
  type WorkspacePatchOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  issue,
  parsePointer,
  validateCommandTargetAndDomain,
  type WorkspaceOperationCommitDocumentExpectation,
  type WorkspaceOperationCommitPlanIssue,
} from './workspaceOperationCommitWire';

type MutableDocumentExpectation = {
  id: string;
  content: boolean;
  metadata: boolean;
};

export type CommitWriteSet = {
  workspace: boolean;
  route: boolean;
  documents: Map<string, MutableDocumentExpectation>;
  baseDocuments: WorkspaceSnapshot['docsById'];
  structuralDocuments: Map<string, 'add' | 'remove'>;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compareUnicodeCodePoints = (left: string, right: string): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};

const markDocument = (
  writeSet: CommitWriteSet,
  documentId: string,
  partition: 'content' | 'metadata' | 'both'
) => {
  const expectation = writeSet.documents.get(documentId) ?? {
    id: documentId,
    content: false,
    metadata: false,
  };
  if (partition === 'content' || partition === 'both') {
    expectation.content = true;
  }
  if (partition === 'metadata' || partition === 'both') {
    expectation.metadata = true;
  }
  writeSet.documents.set(documentId, expectation);
};

const validateCommitPathPolicy = (
  operation: WorkspacePatchOperation,
  rawPath: string,
  domain: 'workspace' | 'route',
  commandId: string,
  path: string
): WorkspaceOperationCommitPlanIssue | null => {
  const segments = parsePointer(rawPath);
  if (!segments?.length) {
    return issue(
      'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
      path,
      'Workspace commits require a supported non-root JSON pointer.',
      commandId
    );
  }
  const [root, documentId, documentField] = segments;
  if (root === 'activeDocumentId' || root === 'activeRouteNodeId') {
    return segments.length === 1
      ? null
      : issue(
          'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
          path,
          'Ephemeral selection patches must target the field directly.',
          commandId
        );
  }
  if (domain === 'route') {
    return root === 'routeManifest'
      ? null
      : issue(
          'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
          path,
          'Route-domain commands may persist only RouteManifest.',
          commandId
        );
  }
  if (root === 'routeManifest') {
    return issue(
      'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
      path,
      'RouteManifest must be written by a route-domain command.',
      commandId
    );
  }
  if ((root === 'treeRootId' && segments.length === 1) || root === 'treeById') {
    return null;
  }
  if (root !== 'docsById' || !documentId) {
    return issue(
      'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
      path,
      `Workspace commit path is not persistent: ${rawPath}.`,
      commandId
    );
  }
  if (!documentField) {
    return operation.op === 'add' || operation.op === 'remove'
      ? null
      : issue(
          'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
          path,
          'A whole document record may only be added or removed.',
          commandId,
          documentId
        );
  }
  if (documentField === 'name' || documentField === 'path') {
    return segments.length === 3
      ? null
      : issue(
          'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
          path,
          'Document name and path patches must target the metadata field directly.',
          commandId,
          documentId
        );
  }
  if (documentField === 'capabilities') return null;
  return issue(
    'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
    path,
    `Workspace commands cannot mutate document field ${documentField}; content uses a document-targeted command and server revisions are authoritative.`,
    commandId,
    documentId
  );
};

const collectWorkspacePath = (
  writeSet: CommitWriteSet,
  operation: WorkspacePatchOperation,
  rawPath: string,
  domain: 'workspace' | 'route',
  commandId: string,
  path: string
): WorkspaceOperationCommitPlanIssue | null => {
  const policyIssue = validateCommitPathPolicy(
    operation,
    rawPath,
    domain,
    commandId,
    path
  );
  if (policyIssue) return policyIssue;
  const segments = parsePointer(rawPath);
  if (!segments?.length) return null;
  const [root, documentId, documentField] = segments;
  if (root === 'activeDocumentId' || root === 'activeRouteNodeId') {
    return null;
  }
  if (root === 'routeManifest') {
    writeSet.workspace = true;
    writeSet.route = true;
    return null;
  }
  if (root === 'treeRootId' || root === 'treeById') {
    writeSet.workspace = true;
    return null;
  }
  if (root !== 'docsById') return null;
  writeSet.workspace = true;
  if (!documentId) return null;
  if (!documentField) {
    if (operation.op !== 'add' && operation.op !== 'remove') return null;
    const previousStructuralMutation =
      writeSet.structuralDocuments.get(documentId);
    const existingExpectation = writeSet.documents.get(documentId);
    if (
      previousStructuralMutation ||
      existingExpectation?.content ||
      existingExpectation?.metadata
    ) {
      return issue(
        'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
        path,
        'A document cannot combine structural add/remove with content or metadata writes in one commit.',
        commandId,
        documentId
      );
    }
    const existsInBase = Boolean(writeSet.baseDocuments[documentId]);
    if (
      (operation.op === 'add' && existsInBase) ||
      (operation.op === 'remove' && !existsInBase)
    ) {
      return issue(
        'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
        path,
        operation.op === 'add'
          ? 'Whole-document add requires an absent document identity.'
          : 'Whole-document remove requires an existing document identity.',
        commandId,
        documentId
      );
    }
    if (operation.op === 'add') {
      const document = operation.value;
      if (
        !isPlainRecord(document) ||
        document.id !== documentId ||
        document.contentRev !== 1 ||
        document.metaRev !== 1
      ) {
        return issue(
          'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
          path,
          'Whole-document add must use the JSON pointer identity and start at contentRev=1 and metaRev=1.',
          commandId,
          documentId
        );
      }
    }
    writeSet.structuralDocuments.set(documentId, operation.op);
    markDocument(writeSet, documentId, 'both');
    return null;
  }
  if (documentField === 'name' || documentField === 'path') {
    if (writeSet.structuralDocuments.has(documentId)) {
      return issue(
        'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
        path,
        'Document metadata cannot be combined with structural add/remove in one commit.',
        commandId,
        documentId
      );
    }
    markDocument(writeSet, documentId, 'metadata');
    return null;
  }
  if (documentField === 'capabilities') {
    if (writeSet.structuralDocuments.has(documentId)) {
      return issue(
        'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
        path,
        'Document metadata cannot be combined with structural add/remove in one commit.',
        commandId,
        documentId
      );
    }
    markDocument(writeSet, documentId, 'metadata');
    return null;
  }
  return issue(
    'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
    path,
    `Workspace commands cannot mutate document field ${documentField}; content uses a document-targeted command and server revisions are authoritative.`,
    commandId,
    documentId
  );
};

const collectWorkspaceReadDependency = (
  writeSet: CommitWriteSet,
  rawPath: string,
  domain: 'workspace' | 'route'
) => {
  const segments = parsePointer(rawPath);
  if (!segments?.length) return;
  const [root, documentId] = segments;
  if (root === 'activeDocumentId' || root === 'activeRouteNodeId') return;
  if (domain === 'route') {
    writeSet.workspace = true;
    writeSet.route = true;
    return;
  }
  if (root === 'treeRootId' || root === 'treeById') {
    writeSet.workspace = true;
    return;
  }
  if (root !== 'docsById' || !documentId) return;
  writeSet.workspace = true;
  if (!writeSet.structuralDocuments.has(documentId)) {
    markDocument(writeSet, documentId, 'metadata');
  }
};

export const collectCommandWriteSet = (
  writeSet: CommitWriteSet,
  command: ReturnType<typeof getWorkspaceOperationCommands>[number],
  commandIndex: number
): WorkspaceOperationCommitPlanIssue[] => {
  const targetOrDomainIssue = validateCommandTargetAndDomain(
    command,
    commandIndex
  );
  if (targetOrDomainIssue) return [targetOrDomainIssue];
  const nonGranularForwardIndex = command.forwardOps.findIndex(
    ({ op }) => op === 'move' || op === 'copy'
  );
  const nonGranularReverseIndex = command.reverseOps.findIndex(
    ({ op }) => op === 'move' || op === 'copy'
  );
  if (nonGranularForwardIndex >= 0 || nonGranularReverseIndex >= 0) {
    const direction =
      nonGranularForwardIndex >= 0 ? 'forwardOps' : 'reverseOps';
    const operationIndex =
      nonGranularForwardIndex >= 0
        ? nonGranularForwardIndex
        : nonGranularReverseIndex;
    return [
      issue(
        'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
        `/commands/${commandIndex}/${direction}/${operationIndex}/op`,
        'Atomic commits require explicit granular patches instead of move/copy.',
        command.id
      ),
    ];
  }
  const documentId = command.target.documentId;
  if (documentId) {
    if (writeSet.structuralDocuments.has(documentId)) {
      return [
        issue(
          'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID',
          `/commands/${commandIndex}/target/documentId`,
          'Document content cannot be combined with structural add/remove in one commit.',
          command.id,
          documentId
        ),
      ];
    }
    markDocument(writeSet, documentId, 'content');
    return [];
  }
  const resolvedDomain = resolveWorkspaceCommandDomain(command);
  if (resolvedDomain !== 'workspace' && resolvedDomain !== 'route') {
    return [
      issue(
        'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
        `/commands/${commandIndex}/domainHint`,
        'Commands without a document target must use workspace or route domain.',
        command.id
      ),
    ];
  }
  const issues: WorkspaceOperationCommitPlanIssue[] = [];
  command.forwardOps.forEach((operation, operationIndex) => {
    const operationPath = `/commands/${commandIndex}/forwardOps/${operationIndex}`;
    const pathIssue = collectWorkspacePath(
      writeSet,
      operation,
      operation.path,
      resolvedDomain,
      command.id,
      `${operationPath}/path`
    );
    if (pathIssue) issues.push(pathIssue);
  });
  if (issues.length) return issues;
  command.reverseOps.forEach((operation, operationIndex) => {
    const pathIssue = validateCommitPathPolicy(
      operation,
      operation.path,
      resolvedDomain,
      command.id,
      `/commands/${commandIndex}/reverseOps/${operationIndex}/path`
    );
    if (pathIssue) {
      issues.push(pathIssue);
      return;
    }
    if (operation.op === 'test') {
      collectWorkspaceReadDependency(writeSet, operation.path, resolvedDomain);
    }
  });
  return issues;
};

const toDocumentExpectation = (
  document: WorkspaceDocument | undefined,
  write: MutableDocumentExpectation
): WorkspaceOperationCommitDocumentExpectation => ({
  id: write.id,
  ...(write.content
    ? { contentRev: document ? document.contentRev : null }
    : {}),
  ...(write.metadata ? { metaRev: document ? document.metaRev : null } : {}),
});

export const createCommitWriteSet = (
  workspace: WorkspaceSnapshot
): CommitWriteSet => ({
  workspace: false,
  route: false,
  documents: new Map(),
  baseDocuments: workspace.docsById,
  structuralDocuments: new Map(),
});

export const toDocumentExpectations = (
  workspace: WorkspaceSnapshot,
  writeSet: CommitWriteSet
): WorkspaceOperationCommitDocumentExpectation[] =>
  [...writeSet.documents.values()]
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .map((write) => toDocumentExpectation(workspace.docsById[write.id], write));
