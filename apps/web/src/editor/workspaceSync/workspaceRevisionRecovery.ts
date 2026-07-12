import type {
  WorkspaceOperation,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  autoRebaseWorkspaceSnapshots,
  createWorkspaceConflictSession,
  type WorkspaceConflictSession,
  type WorkspaceThreeWayAnalysis,
} from '@prodivix/workspace-sync';
import { loadWorkspaceRevisionConflictContext } from './workspaceRevisionConflictApi';

export class WorkspaceRevisionRecoveryError extends Error {
  readonly issues: readonly { path: string; message: string }[];

  constructor(issues: readonly { path: string; message: string }[]) {
    super(issues[0]?.message || 'Could not analyze the revision conflict.');
    this.name = 'WorkspaceRevisionRecoveryError';
    this.issues = issues;
  }
}

export type WorkspaceRevisionRecoveryResult =
  | { kind: 'not-conflict' }
  | {
      kind: 'auto-rebased';
      analysis: WorkspaceThreeWayAnalysis;
      remoteSettings: Record<string, unknown>;
      remoteSnapshot: WorkspaceSnapshot;
      snapshot: WorkspaceSnapshot;
      status: 'already-applied' | 'rebased';
    }
  | {
      kind: 'conflict';
      remoteSettings: Record<string, unknown>;
      session: WorkspaceConflictSession;
    };

const createConflictSessionId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `workspace-conflict-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

/**
 * Loads the latest authorized snapshot and converts one 409 into either a
 * validator-safe automatic rebase or a durable conflict review session.
 */
export const analyzeWorkspaceRevisionFailure = async (input: {
  baseSnapshot: WorkspaceSnapshot;
  error: unknown;
  localSnapshot: WorkspaceSnapshot;
  sourceOperation?: WorkspaceOperation;
  token: string;
}): Promise<WorkspaceRevisionRecoveryResult> => {
  const context = await loadWorkspaceRevisionConflictContext({
    error: input.error,
    expectedWorkspaceId: input.baseSnapshot.id,
    token: input.token,
  });
  if (!context) return { kind: 'not-conflict' };
  const remoteSnapshot = context.remote.workspace;
  const rebased = autoRebaseWorkspaceSnapshots(
    input.baseSnapshot,
    input.localSnapshot,
    remoteSnapshot
  );
  if (rebased.ok === true) {
    return {
      kind: 'auto-rebased',
      status: rebased.status,
      snapshot: rebased.snapshot,
      analysis: rebased.analysis,
      remoteSnapshot,
      remoteSettings: context.remote.settings,
    };
  }
  if (rebased.status === 'invalid') {
    throw new WorkspaceRevisionRecoveryError(rebased.issues);
  }
  const createdAt = new Date().toISOString();
  const created = createWorkspaceConflictSession({
    id: createConflictSessionId(),
    createdAt,
    baseSnapshot: input.baseSnapshot,
    localSnapshot: input.localSnapshot,
    remoteSnapshot,
    ...(input.sourceOperation
      ? { sourceOperation: input.sourceOperation }
      : {}),
    serverConflict: context.conflict,
  });
  if (created.ok === false) {
    throw new WorkspaceRevisionRecoveryError(created.issues);
  }
  return {
    kind: 'conflict',
    session: created.session,
    remoteSettings: context.remote.settings,
  };
};
