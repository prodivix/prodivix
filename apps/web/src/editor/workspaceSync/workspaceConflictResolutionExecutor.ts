import {
  getWorkspaceOperationId,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceConflictResolutionOperation,
  type WorkspaceConflictSession,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import {
  executeWorkspaceOutboxOperation,
  type WorkspaceOutboxOperationExecutionResult,
} from './workspaceOutboxExecutor';

export class WorkspaceConflictResolutionExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceConflictResolutionExecutionError';
  }
}

export type WorkspaceConflictResolutionUnsupportedReason =
  'unresolved-session' | 'invalid-resolution' | 'concurrent-revisions';

export type WorkspaceConflictResolutionExecutionResult =
  | WorkspaceOutboxOperationExecutionResult
  | {
      kind: 'unsupported';
      reason: WorkspaceConflictResolutionUnsupportedReason;
      message: string;
    };

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

/** Replaces the blocked entry with one reviewed, durable resolution operation. */
export const executeWorkspaceConflictResolution = async (input: {
  session: WorkspaceConflictSession;
  token: string;
  resolvedSnapshot?: WorkspaceSnapshot;
  outboxStore?: WorkspaceOutboxStore;
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
  const sourceOperation = effectiveSession.sourceOperation as
    WorkspaceOperation | undefined;
  return executeWorkspaceOutboxOperation({
    token: input.token,
    baseSnapshot: input.session.remoteSnapshot,
    localSnapshot: resolvedSnapshot,
    operation: built.operation,
    ...(sourceOperation
      ? { replaceEntryId: getWorkspaceOperationId(sourceOperation) }
      : {}),
    ...(input.outboxStore ? { store: input.outboxStore } : {}),
  });
};
