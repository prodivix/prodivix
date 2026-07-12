import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import {
  decodeWorkspaceRevisionConflict,
  type WorkspaceRevisionConflictDecodeIssue,
  type WorkspaceRevisionConflictResponse,
} from '@prodivix/workspace-sync';

export class WorkspaceRevisionConflictProtocolError extends Error {
  readonly issues: readonly WorkspaceRevisionConflictDecodeIssue[];

  constructor(issues: readonly WorkspaceRevisionConflictDecodeIssue[]) {
    super(
      issues[0]?.message ||
        'The server returned an invalid workspace conflict envelope.'
    );
    this.name = 'WorkspaceRevisionConflictProtocolError';
    this.issues = issues;
  }
}

export type WorkspaceRevisionConflictContext = {
  conflict: WorkspaceRevisionConflictResponse;
  remote: Awaited<ReturnType<typeof editorApi.getWorkspace>>;
};

/**
 * Converts an API failure into an authorized, current three-way merge input.
 * A 409 is never treated as an ordinary retryable error: its canonical
 * envelope is decoded first, then the latest snapshot is fetched explicitly.
 */
export const loadWorkspaceRevisionConflictContext = async (input: {
  error: unknown;
  expectedWorkspaceId: string;
  token: string;
}): Promise<WorkspaceRevisionConflictContext | null> => {
  if (!(input.error instanceof ApiError) || input.error.status !== 409) {
    return null;
  }
  const decoded = decodeWorkspaceRevisionConflict(input.error.payload);
  if (decoded.ok === false) {
    throw new WorkspaceRevisionConflictProtocolError(decoded.issues);
  }
  if (decoded.conflict.workspaceId !== input.expectedWorkspaceId) {
    throw new WorkspaceRevisionConflictProtocolError([
      {
        code: 'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        path: '/error/details/workspaceId',
        message: 'Conflict workspaceId does not match the active workspace.',
      },
    ]);
  }
  const remote = await editorApi.getWorkspace(
    input.token,
    decoded.conflict.workspaceId,
    { cache: 'no-store' }
  );
  if (remote.workspace.id !== decoded.conflict.workspaceId) {
    throw new WorkspaceRevisionConflictProtocolError([
      {
        code: 'WKS_SYNC_CONFLICT_DETAILS_INVALID',
        path: '/workspace/id',
        message: 'Fetched workspace does not match the conflict workspace.',
      },
    ]);
  }
  return { conflict: decoded.conflict, remote };
};
