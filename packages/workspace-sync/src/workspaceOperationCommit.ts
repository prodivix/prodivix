import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  decodeWorkspaceRouteManifest,
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  type WorkspaceCommandEnvelope,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  analyzeWorkspaceAuthoringDelta,
  type WorkspaceAuthoringDelta,
} from './workspaceAuthoringDelta';
import {
  collectCommandWriteSet,
  createCommitWriteSet,
  toDocumentExpectations,
} from './workspaceOperationCommitWriteSet';
import {
  issue,
  normalizeWorkspaceOperationWire,
  type WorkspaceOperationCommitPlanResult,
} from './workspaceOperationCommitWire';

export type {
  WorkspaceOperationCommitDocumentExpectation,
  WorkspaceOperationCommitExpectedRevisions,
  WorkspaceOperationCommitPlanIssue,
  WorkspaceOperationCommitPlanIssueCode,
  WorkspaceOperationCommitPlanResult,
  WorkspaceOperationCommitRequest,
} from './workspaceOperationCommitWire';

const EPHEMERAL_SELECTION_PATHS = new Set([
  '/activeDocumentId',
  '/activeRouteNodeId',
]);

type PersistentWorkspaceCommandProjection = {
  command: WorkspaceCommandEnvelope;
  selectionOnly: boolean;
};

const validateCommitRevisionCapacity = (
  workspace: WorkspaceSnapshot,
  delta: WorkspaceAuthoringDelta
) => {
  if (workspace.opSeq >= Number.MAX_SAFE_INTEGER) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      '/workspace/opSeq',
      'Workspace opSeq cannot advance beyond the JSON safe integer range.'
    );
  }
  if (
    delta.workspaceChanged &&
    workspace.workspaceRev >= Number.MAX_SAFE_INTEGER
  ) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      '/workspace/workspaceRev',
      'Workspace revision cannot advance beyond the JSON safe integer range.'
    );
  }
  if (delta.routeChanged && workspace.routeRev >= Number.MAX_SAFE_INTEGER) {
    return issue(
      'WKS_SYNC_COMMIT_OPERATION_INVALID',
      '/workspace/routeRev',
      'Route revision cannot advance beyond the JSON safe integer range.'
    );
  }
  for (const documentDelta of delta.documents) {
    if (documentDelta.kind !== 'update') continue;
    const document = documentDelta.before;
    if (
      documentDelta.contentChanged &&
      document &&
      document.contentRev >= Number.MAX_SAFE_INTEGER
    ) {
      return issue(
        'WKS_SYNC_COMMIT_OPERATION_INVALID',
        `/workspace/docsById/${documentDelta.documentId}/contentRev`,
        `Document ${documentDelta.documentId} content revision cannot advance beyond the JSON safe integer range.`,
        undefined,
        documentDelta.documentId
      );
    }
    if (
      documentDelta.metadataChanged &&
      document &&
      document.metaRev >= Number.MAX_SAFE_INTEGER
    ) {
      return issue(
        'WKS_SYNC_COMMIT_OPERATION_INVALID',
        `/workspace/docsById/${documentDelta.documentId}/metaRev`,
        `Document ${documentDelta.documentId} metadata revision cannot advance beyond the JSON safe integer range.`,
        undefined,
        documentDelta.documentId
      );
    }
  }
  return null;
};

const projectPersistentWorkspaceCommand = (
  command: WorkspaceCommandEnvelope
): PersistentWorkspaceCommandProjection => {
  if (command.target.documentId) {
    return { command, selectionOnly: false };
  }
  const forwardOps = command.forwardOps.filter(
    (operation) => !EPHEMERAL_SELECTION_PATHS.has(operation.path)
  );
  const reverseOps = command.reverseOps.filter(
    (operation) => !EPHEMERAL_SELECTION_PATHS.has(operation.path)
  );
  const projectedCommand =
    forwardOps.length === command.forwardOps.length &&
    reverseOps.length === command.reverseOps.length
      ? command
      : { ...command, forwardOps, reverseOps };
  return {
    command: projectedCommand,
    selectionOnly:
      command.forwardOps.length > 0 &&
      command.reverseOps.length > 0 &&
      forwardOps.length === 0 &&
      reverseOps.length === 0,
  };
};

/** Applies only the durable projection of a WorkspaceOperation. */
export const applyPersistentWorkspaceOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceSnapshot | null => {
  try {
    const {
      activeDocumentId: _activeDocumentId,
      activeRouteNodeId: _activeRouteNodeId,
      ...persistentWorkspace
    } = workspace;
    if (operation.kind === 'command') {
      if (operation.command.target.workspaceId !== workspace.id) return null;
      const projection = projectPersistentWorkspaceCommand(operation.command);
      if (projection.selectionOnly) return workspace;
      const applied = applyWorkspaceCommand(
        persistentWorkspace,
        projection.command
      );
      if (!applied.ok) return null;
      decodeWorkspaceRouteManifest(applied.snapshot.routeManifest, {
        resolveDocumentType: (documentId) =>
          applied.snapshot.docsById[documentId]?.type,
      });
      return applied.snapshot;
    }
    if (
      operation.transaction.workspaceId !== workspace.id ||
      operation.transaction.commands.length === 0 ||
      operation.transaction.commands.some(
        (command) => command.target.workspaceId !== workspace.id
      ) ||
      new Set(operation.transaction.commands.map(({ id }) => id)).size !==
        operation.transaction.commands.length
    ) {
      return null;
    }
    const commands = operation.transaction.commands
      .map(projectPersistentWorkspaceCommand)
      .filter(({ selectionOnly }) => !selectionOnly)
      .map(({ command }) => command);
    if (commands.length === 0) return workspace;
    const applied = applyWorkspaceTransaction(persistentWorkspace, {
      ...operation.transaction,
      commands,
    });
    if (!applied.ok) return null;
    decodeWorkspaceRouteManifest(applied.snapshot.routeManifest, {
      resolveDocumentType: (documentId) =>
        applied.snapshot.docsById[documentId]?.type,
    });
    return applied.snapshot;
  } catch {
    return null;
  }
};

/** Plans the exact partitioned CAS vector for one durable WorkspaceOperation. */
export const planWorkspaceOperationCommit = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceOperationCommitPlanResult => {
  const normalizedWire = normalizeWorkspaceOperationWire(operation);
  if (!normalizedWire.ok) {
    return { ok: false, issues: [normalizedWire.issue] };
  }
  const canonicalOperation = normalizedWire.operation;
  const operationId = getWorkspaceOperationId(canonicalOperation);
  const commands = getWorkspaceOperationCommands(canonicalOperation);
  const workspaceMismatch = commands.find(
    (command) => command.target.workspaceId !== workspace.id
  );
  if (
    workspaceMismatch ||
    (canonicalOperation.kind === 'transaction' &&
      canonicalOperation.transaction.workspaceId !== workspace.id)
  ) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_COMMIT_WORKSPACE_MISMATCH',
          '/operation',
          'Every command and transaction must target the confirmed workspace.',
          workspaceMismatch?.id
        ),
      ],
    };
  }
  if (!operationId) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_COMMIT_OPERATION_INVALID',
          '/operation',
          'WorkspaceOperation must apply and validate against its confirmed base snapshot.'
        ),
      ],
    };
  }
  const writeSet = createCommitWriteSet(workspace);
  const issues = commands.flatMap((command, index) =>
    collectCommandWriteSet(writeSet, command, index)
  );
  if (issues.length) return { ok: false, issues };
  const appliedSnapshot = applyPersistentWorkspaceOperation(
    workspace,
    canonicalOperation
  );
  if (!appliedSnapshot) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_COMMIT_OPERATION_INVALID',
          '/operation',
          'WorkspaceOperation must apply and validate against its confirmed base snapshot.'
        ),
      ],
    };
  }
  if (!writeSet.workspace && !writeSet.route && !writeSet.documents.size) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_COMMIT_EMPTY_WRITE_SET',
          '/operation',
          'WorkspaceOperation does not contain a persistent authoring mutation.'
        ),
      ],
    };
  }
  const authoringDelta = analyzeWorkspaceAuthoringDelta(
    workspace,
    appliedSnapshot
  );
  if (!authoringDelta.hasDurableDelta) {
    return {
      ok: false,
      issues: [
        issue(
          'WKS_SYNC_COMMIT_EMPTY_WRITE_SET',
          '/operation',
          'WorkspaceOperation does not change canonical persistent authoring state.'
        ),
      ],
    };
  }
  const revisionCapacityIssue = validateCommitRevisionCapacity(
    workspace,
    authoringDelta
  );
  if (revisionCapacityIssue) {
    return { ok: false, issues: [revisionCapacityIssue] };
  }
  const documents = toDocumentExpectations(workspace, writeSet);
  return {
    ok: true,
    request: {
      expected: {
        ...(writeSet.workspace ? { workspaceRev: workspace.workspaceRev } : {}),
        ...(writeSet.route ? { routeRev: workspace.routeRev } : {}),
        documents,
      },
      operation: canonicalOperation,
    },
  };
};
