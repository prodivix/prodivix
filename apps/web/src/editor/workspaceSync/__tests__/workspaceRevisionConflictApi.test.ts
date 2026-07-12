import { afterEach, describe, expect, it, vi } from 'vitest';
import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import {
  WorkspaceRevisionConflictProtocolError,
  loadWorkspaceRevisionConflictContext,
} from '@/editor/workspaceSync/workspaceRevisionConflictApi';

const createConflictError = (workspaceId = 'workspace-test') => {
  const payload = {
    error: {
      code: 'WKS-4003',
      message: 'Revision conflict.',
      retryable: true,
      details: {
        conflictType: 'DOCUMENT_CONFLICT',
        workspaceId,
        expected: {
          document: { id: 'page-home', contentRev: 1 },
        },
        current: {
          workspaceRev: 1,
          routeRev: 1,
          opSeq: 2,
          document: {
            id: 'page-home',
            type: 'pir-page',
            path: '/pages/home.pir.json',
            contentRev: 2,
            metaRev: 1,
            updatedAt: '2026-07-12T00:00:00Z',
          },
        },
      },
    },
  } as const;
  return new ApiError(
    payload.error.message,
    409,
    payload.error.code,
    payload.error.details,
    { retryable: true, payload }
  );
};

describe('loadWorkspaceRevisionConflictContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for failures outside the revision conflict protocol', async () => {
    const getWorkspace = vi.spyOn(editorApi, 'getWorkspace');

    await expect(
      loadWorkspaceRevisionConflictContext({
        error: new Error('offline'),
        expectedWorkspaceId: 'workspace-test',
        token: 'token',
      })
    ).resolves.toBeNull();
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it('decodes a canonical 409 and fetches the current authorized snapshot', async () => {
    const workspace = createEditorWorkspace();
    const getWorkspace = vi
      .spyOn(editorApi, 'getWorkspace')
      .mockResolvedValue({ workspace, settings: {} });

    const context = await loadWorkspaceRevisionConflictContext({
      error: createConflictError(),
      expectedWorkspaceId: workspace.id,
      token: 'token',
    });

    expect(context?.conflict).toMatchObject({
      code: 'WKS-4003',
      workspaceId: workspace.id,
      serverRevisions: {
        document: { id: 'page-home', contentRev: 2 },
      },
    });
    expect(getWorkspace).toHaveBeenCalledWith('token', workspace.id, {
      cache: 'no-store',
    });
  });

  it('rejects a conflict for a different workspace before fetching it', async () => {
    const getWorkspace = vi.spyOn(editorApi, 'getWorkspace');

    await expect(
      loadWorkspaceRevisionConflictContext({
        error: createConflictError('workspace-other'),
        expectedWorkspaceId: 'workspace-test',
        token: 'token',
      })
    ).rejects.toBeInstanceOf(WorkspaceRevisionConflictProtocolError);
    expect(getWorkspace).not.toHaveBeenCalled();
  });
});
