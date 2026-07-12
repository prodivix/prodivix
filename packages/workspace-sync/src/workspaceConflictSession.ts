import {
  validateWorkspaceSnapshot,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { WorkspaceRevisionConflictResponse } from './workspaceRevisionConflict';
import { cloneJsonValue } from './jsonValue';
import {
  analyzeWorkspaceThreeWay,
  type WorkspaceConflictResolutionChoice,
  type WorkspaceThreeWayAnalysis,
  type WorkspaceThreeWayIssue,
} from './workspaceThreeWay';

export type WorkspaceConflictSessionStatus = 'open' | 'resolved';

export type WorkspaceConflictSession = {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  status: WorkspaceConflictSessionStatus;
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  remoteSnapshot: WorkspaceSnapshot;
  sourceOperation?: WorkspaceOperation;
  serverConflict?: WorkspaceRevisionConflictResponse;
  analysis: WorkspaceThreeWayAnalysis;
  resolutions: Record<string, WorkspaceConflictResolutionChoice>;
  unresolvedConflictIds: string[];
  resolvedSnapshot?: WorkspaceSnapshot;
};

export type CreateWorkspaceConflictSessionInput = {
  id: string;
  createdAt: string;
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  remoteSnapshot: WorkspaceSnapshot;
  sourceOperation?: WorkspaceOperation;
  serverConflict?: WorkspaceRevisionConflictResponse;
};

export type WorkspaceConflictSessionIssue =
  | WorkspaceThreeWayIssue
  | {
      code:
        | 'WKS_SYNC_CONFLICT_SESSION_INVALID'
        | 'WKS_SYNC_CONFLICT_NOT_FOUND'
        | 'WKS_SYNC_RESOLVED_SNAPSHOT_INVALID';
      path: string;
      message: string;
      validationIssues?: ReturnType<typeof validateWorkspaceSnapshot>['issues'];
    };

export type WorkspaceConflictSessionResult =
  | { ok: true; session: WorkspaceConflictSession }
  | { ok: false; issues: WorkspaceConflictSessionIssue[] };

const isNonEmptyString = (value: string): boolean => Boolean(value.trim());

const materializeSession = (
  input: CreateWorkspaceConflictSessionInput,
  resolutions: Record<string, WorkspaceConflictResolutionChoice>,
  updatedAt: string
): WorkspaceConflictSessionResult => {
  if (!isNonEmptyString(updatedAt)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: '/updatedAt',
          message: 'Conflict session updatedAt is required.',
        },
      ],
    };
  }
  const analysisResult = analyzeWorkspaceThreeWay(
    input.baseSnapshot,
    input.localSnapshot,
    input.remoteSnapshot,
    resolutions
  );
  if (!analysisResult.ok) return analysisResult;
  if (
    input.serverConflict &&
    input.serverConflict.workspaceId !== analysisResult.analysis.workspaceId
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: '/serverConflict/workspaceId',
          message: 'The server conflict must belong to the session workspace.',
        },
      ],
    };
  }
  const sourceWorkspaceId = input.sourceOperation
    ? input.sourceOperation.kind === 'command'
      ? input.sourceOperation.command.target.workspaceId
      : input.sourceOperation.transaction.workspaceId
    : undefined;
  if (
    sourceWorkspaceId !== undefined &&
    sourceWorkspaceId !== analysisResult.analysis.workspaceId
  ) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: '/sourceOperation',
          message: 'The source operation must target the session workspace.',
        },
      ],
    };
  }
  const conflictIds = new Set(
    analysisResult.analysis.conflicts.map((conflict) => conflict.id)
  );
  const unknownResolutionId = Object.keys(resolutions).find(
    (conflictId) => !conflictIds.has(conflictId)
  );
  if (unknownResolutionId) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_NOT_FOUND',
          path: `/resolutions/${unknownResolutionId}`,
          message: 'The selected conflict does not exist in this session.',
        },
      ],
    };
  }
  const unresolvedConflictIds = analysisResult.analysis.conflicts
    .map((conflict) => conflict.id)
    .filter((conflictId) => resolutions[conflictId] === undefined);
  const resolved = unresolvedConflictIds.length === 0;
  if (resolved) {
    const validation = validateWorkspaceSnapshot(
      analysisResult.analysis.candidateSnapshot
    );
    if (!validation.valid) {
      return {
        ok: false,
        issues: [
          {
            code: 'WKS_SYNC_RESOLVED_SNAPSHOT_INVALID',
            path: '/',
            message: 'The selected conflict resolutions are not valid.',
            validationIssues: validation.issues,
          },
        ],
      };
    }
  }
  return {
    ok: true,
    session: {
      id: input.id,
      workspaceId: analysisResult.analysis.workspaceId,
      createdAt: input.createdAt,
      updatedAt,
      status: resolved ? 'resolved' : 'open',
      baseSnapshot: cloneJsonValue(input.baseSnapshot),
      localSnapshot: cloneJsonValue(input.localSnapshot),
      remoteSnapshot: cloneJsonValue(input.remoteSnapshot),
      ...(input.sourceOperation
        ? { sourceOperation: cloneJsonValue(input.sourceOperation) }
        : {}),
      ...(input.serverConflict
        ? { serverConflict: cloneJsonValue(input.serverConflict) }
        : {}),
      analysis: cloneJsonValue(analysisResult.analysis),
      resolutions: { ...resolutions },
      unresolvedConflictIds: [...unresolvedConflictIds],
      ...(resolved
        ? {
            resolvedSnapshot: cloneJsonValue(
              analysisResult.analysis.candidateSnapshot
            ),
          }
        : {}),
    },
  };
};

/** Creates a durable, transport-neutral conflict review session. */
export const createWorkspaceConflictSession = (
  input: CreateWorkspaceConflictSessionInput
): WorkspaceConflictSessionResult => {
  if (!isNonEmptyString(input.id) || !isNonEmptyString(input.createdAt)) {
    return {
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: !isNonEmptyString(input.id) ? '/id' : '/createdAt',
          message: 'Conflict session id and createdAt are required.',
        },
      ],
    };
  }
  return materializeSession(input, {}, input.createdAt);
};

/** Applies one explicit local/remote choice and recomputes the safe candidate. */
export const resolveWorkspaceConflictSession = (
  session: WorkspaceConflictSession,
  conflictId: string,
  choice: WorkspaceConflictResolutionChoice,
  updatedAt: string
): WorkspaceConflictSessionResult =>
  materializeSession(
    {
      id: session.id,
      createdAt: session.createdAt,
      baseSnapshot: session.baseSnapshot,
      localSnapshot: session.localSnapshot,
      remoteSnapshot: session.remoteSnapshot,
      ...(session.sourceOperation
        ? { sourceOperation: session.sourceOperation }
        : {}),
      ...(session.serverConflict
        ? { serverConflict: session.serverConflict }
        : {}),
    },
    { ...session.resolutions, [conflictId]: choice },
    updatedAt
  );

/** Applies a batch of explicit choices without silently resolving omissions. */
export const resolveWorkspaceConflictSessionBatch = (
  session: WorkspaceConflictSession,
  choices: Readonly<Record<string, WorkspaceConflictResolutionChoice>>,
  updatedAt: string
): WorkspaceConflictSessionResult =>
  materializeSession(
    {
      id: session.id,
      createdAt: session.createdAt,
      baseSnapshot: session.baseSnapshot,
      localSnapshot: session.localSnapshot,
      remoteSnapshot: session.remoteSnapshot,
      ...(session.sourceOperation
        ? { sourceOperation: session.sourceOperation }
        : {}),
      ...(session.serverConflict
        ? { serverConflict: session.serverConflict }
        : {}),
    },
    { ...session.resolutions, ...choices },
    updatedAt
  );
