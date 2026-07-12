import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  autoRebaseWorkspaceSnapshots,
  createWorkspaceConflictSession,
  type WorkspaceConflictSession,
  type WorkspaceConflictSessionIssue,
  type WorkspaceThreeWayIssue,
} from '@prodivix/workspace-sync';

export type WorkspaceConflictResolutionPreparationResult =
  | {
      kind: 'ready';
      resolvedSnapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'conflict';
      session: WorkspaceConflictSession;
    }
  | {
      kind: 'invalid';
      issues: readonly (
        WorkspaceConflictSessionIssue | WorkspaceThreeWayIssue
      )[];
    };

/**
 * Folds edits made while a conflict was being reviewed into the chosen result.
 * A second explicit conflict session is created when those later edits overlap
 * a remote choice, so applying a stale review can never erase newer authoring.
 */
export const prepareWorkspaceConflictResolution = (input: {
  currentSnapshot: WorkspaceSnapshot;
  preparedAt: string;
  preparedSessionId: string;
  session: WorkspaceConflictSession;
}): WorkspaceConflictResolutionPreparationResult => {
  if (input.session.status !== 'resolved' || !input.session.resolvedSnapshot) {
    return {
      kind: 'invalid',
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: '/status',
          message: 'Every conflict must be resolved before preparing a save.',
        },
      ],
    };
  }

  const rebased = autoRebaseWorkspaceSnapshots(
    input.session.localSnapshot,
    input.currentSnapshot,
    input.session.resolvedSnapshot
  );
  if (rebased.ok === true) {
    return { kind: 'ready', resolvedSnapshot: rebased.snapshot };
  }
  if (rebased.status === 'invalid') {
    return { kind: 'invalid', issues: rebased.issues };
  }

  const conflictSession = createWorkspaceConflictSession({
    id: input.preparedSessionId,
    createdAt: input.preparedAt,
    baseSnapshot: input.session.localSnapshot,
    localSnapshot: input.currentSnapshot,
    remoteSnapshot: input.session.resolvedSnapshot,
    ...(input.session.sourceOperation
      ? { sourceOperation: input.session.sourceOperation }
      : {}),
  });
  return conflictSession.ok === true
    ? { kind: 'conflict', session: conflictSession.session }
    : { kind: 'invalid', issues: conflictSession.issues };
};
