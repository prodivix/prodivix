import { editorApi } from '@/editor/editorApi';
import {
  getWorkspaceOperationId,
  getWorkspaceOperationSourceIds,
  reconcileWorkspaceOperationConfirmation,
  type DecodedWorkspaceMutation,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceConflictResolutionOperation,
  createWorkspaceResolutionOperation,
  planWorkspaceOperationCommit,
  type WorkspaceConflictSession,
} from '@prodivix/workspace-sync';
import { analyzeWorkspaceRevisionFailure } from '@/editor/workspaceSync/workspaceRevisionRecovery';

export class WorkspaceConflictResolutionExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceConflictResolutionExecutionError';
  }
}

export type WorkspaceConflictResolutionUnsupportedReason =
  'unresolved-session' | 'invalid-resolution' | 'concurrent-revisions';

export type WorkspaceConflictResolutionExecutionResult =
  | {
      kind: 'acknowledged';
      mutation: DecodedWorkspaceMutation;
      operation: WorkspaceOperation;
      optimisticSnapshot: WorkspaceSnapshot;
      rebased: boolean;
      serverBaseSnapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'already-applied';
      operation: WorkspaceOperation | null;
      snapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'conflict';
      session: WorkspaceConflictSession;
    }
  | {
      kind: 'unsupported';
      reason: WorkspaceConflictResolutionUnsupportedReason;
      message: string;
    };

type ExecuteOperationInput = {
  automaticCommitRebaseAttempts: number;
  baseSnapshot: WorkspaceSnapshot;
  optimisticSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  rebased: boolean;
  token: string;
};

const MAX_AUTOMATIC_COMMIT_REBASE_ATTEMPTS = 2;

const createOperationId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `workspace-conflict-resolution-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const unsupported = (
  reason: WorkspaceConflictResolutionUnsupportedReason,
  message: string
): WorkspaceConflictResolutionExecutionResult => ({
  kind: 'unsupported',
  reason,
  message,
});

const recoverOperation = async (
  input: ExecuteOperationInput,
  error: unknown
): Promise<WorkspaceConflictResolutionExecutionResult> => {
  const recovery = await analyzeWorkspaceRevisionFailure({
    error,
    token: input.token,
    baseSnapshot: input.baseSnapshot,
    localSnapshot: input.optimisticSnapshot,
    sourceOperation: input.operation,
  });
  if (recovery.kind === 'not-conflict') throw error;
  if (recovery.kind === 'conflict') {
    return { kind: 'conflict', session: recovery.session };
  }
  if (recovery.status === 'already-applied') {
    return {
      kind: 'already-applied',
      operation: input.operation,
      snapshot: recovery.snapshot,
    };
  }
  if (
    input.automaticCommitRebaseAttempts >= MAX_AUTOMATIC_COMMIT_REBASE_ATTEMPTS
  ) {
    return unsupported(
      'concurrent-revisions',
      'The workspace kept changing while the conflict resolution was being rebased. Review the latest revision before retrying.'
    );
  }
  const rebuilt = createWorkspaceResolutionOperation({
    remoteSnapshot: recovery.remoteSnapshot,
    resolvedSnapshot: recovery.snapshot,
    operationId: createOperationId(),
    issuedAt: new Date().toISOString(),
    label: 'Rebase workspace conflict resolution',
    sourceOperationIds: getWorkspaceOperationSourceIds(input.operation),
  });
  if (rebuilt.ok === false) {
    return unsupported(
      'invalid-resolution',
      rebuilt.issues[0]?.message ||
        'Could not build a safe workspace conflict resolution operation.'
    );
  }
  if (!rebuilt.operation) {
    return {
      kind: 'already-applied',
      operation: input.operation,
      snapshot: recovery.snapshot,
    };
  }
  return executeOperation({
    token: input.token,
    baseSnapshot: recovery.remoteSnapshot,
    optimisticSnapshot: recovery.snapshot,
    operation: rebuilt.operation,
    rebased: true,
    automaticCommitRebaseAttempts: input.automaticCommitRebaseAttempts + 1,
  });
};

async function executeOperation(
  input: ExecuteOperationInput
): Promise<WorkspaceConflictResolutionExecutionResult> {
  const planned = planWorkspaceOperationCommit(
    input.baseSnapshot,
    input.operation
  );
  if (planned.ok === false) {
    return unsupported(
      'invalid-resolution',
      planned.issues[0]?.message ||
        'Could not plan the workspace conflict resolution commit.'
    );
  }
  const committedOperation = planned.request.operation;

  try {
    const mutation = await editorApi.commitWorkspaceOperation(
      input.token,
      input.baseSnapshot,
      planned.request
    );
    const operationId = getWorkspaceOperationId(committedOperation);
    if (mutation.acceptedMutationId !== operationId) {
      throw new WorkspaceConflictResolutionExecutionError(
        'The server acknowledged an unrelated workspace operation.'
      );
    }
    if (mutation.opSeq > input.baseSnapshot.opSeq + 1) {
      const latest = await editorApi.getWorkspace(
        input.token,
        input.baseSnapshot.id,
        { cache: 'no-store' }
      );
      if (latest.workspace.opSeq < mutation.opSeq) {
        throw new WorkspaceConflictResolutionExecutionError(
          'The refreshed workspace predates the committed operation.'
        );
      }
      if (latest.workspace.opSeq > mutation.opSeq) {
        return {
          kind: 'already-applied',
          operation: null,
          snapshot: latest.workspace,
        };
      }
      return {
        kind: 'already-applied',
        operation: reconcileWorkspaceOperationConfirmation(
          committedOperation,
          latest.workspace,
          mutation.updatedDocuments.map(({ id }) => id)
        ),
        snapshot: latest.workspace,
      };
    }
    return {
      kind: 'acknowledged',
      mutation,
      operation: committedOperation,
      optimisticSnapshot: input.optimisticSnapshot,
      rebased: input.rebased,
      serverBaseSnapshot: input.baseSnapshot,
    };
  } catch (error) {
    return recoverOperation({ ...input, operation: committedOperation }, error);
  }
}

/**
 * Commits a fully reviewed resolution as one canonical WorkspaceOperation.
 * Workspace, route, and document writes share one atomic server boundary.
 */
export const executeWorkspaceConflictResolution = async (input: {
  session: WorkspaceConflictSession;
  token: string;
  resolvedSnapshot?: WorkspaceSnapshot;
}): Promise<WorkspaceConflictResolutionExecutionResult> => {
  const effectiveSession = input.resolvedSnapshot
    ? { ...input.session, resolvedSnapshot: input.resolvedSnapshot }
    : input.session;
  const built = createWorkspaceConflictResolutionOperation({
    session: effectiveSession,
    operationId: createOperationId(),
    issuedAt: new Date().toISOString(),
    label: 'Resolve workspace revision conflict',
  });
  if (built.ok === false) {
    const issue = built.issues[0];
    return unsupported(
      issue?.code === 'WKS_SYNC_CONFLICTS_UNRESOLVED'
        ? 'unresolved-session'
        : 'invalid-resolution',
      issue?.message || 'Could not build the conflict resolution operation.'
    );
  }
  const resolvedSnapshot = effectiveSession.resolvedSnapshot;
  if (!resolvedSnapshot) {
    return unsupported(
      'unresolved-session',
      'Every conflict requires an explicit local or remote choice.'
    );
  }
  if (!built.operation) {
    return {
      kind: 'already-applied',
      operation: null,
      snapshot: resolvedSnapshot,
    };
  }
  return executeOperation({
    token: input.token,
    baseSnapshot: input.session.remoteSnapshot,
    optimisticSnapshot: resolvedSnapshot,
    operation: built.operation,
    rebased: false,
    automaticCommitRebaseAttempts: 0,
  });
};
