import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { analyzeWorkspaceRevisionFailure } from '@/editor/workspaceSync/workspaceRevisionRecovery';

const cloneWorkspace = (workspace: WorkspaceSnapshot): WorkspaceSnapshot =>
  JSON.parse(JSON.stringify(workspace)) as WorkspaceSnapshot;

const setDocumentMetadata = (
  workspace: WorkspaceSnapshot,
  metadata: Record<string, unknown>
) => {
  const document = workspace.docsById['page-home'];
  if (!document || typeof document.content !== 'object' || !document.content) {
    throw new Error('Expected a PIR document.');
  }
  document.content = { ...document.content, metadata };
};

const createConflictError = () => {
  const payload = {
    error: {
      code: 'WKS-4003',
      message: 'Revision conflict.',
      retryable: true,
      details: {
        conflictType: 'DOCUMENT_CONFLICT',
        workspaceId: 'workspace-test',
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

describe('analyzeWorkspaceRevisionFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('automatically rebases independent local and remote document fields', async () => {
    const base = createEditorWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    setDocumentMetadata(local, { name: 'Local name' });
    setDocumentMetadata(remote, { description: 'Remote description' });
    remote.docsById['page-home'].contentRev = 2;
    remote.opSeq = 2;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: remote,
      settings: {},
    });

    const result = await analyzeWorkspaceRevisionFailure({
      baseSnapshot: base,
      localSnapshot: local,
      error: createConflictError(),
      token: 'token',
    });

    expect(result.kind).toBe('auto-rebased');
    if (result.kind !== 'auto-rebased') return;
    expect(result.snapshot.docsById['page-home'].content).toHaveProperty(
      'metadata',
      { name: 'Local name', description: 'Remote description' }
    );
    expect(result.snapshot.docsById['page-home'].contentRev).toBe(2);
  });

  it('creates an unresolved review session for competing field values', async () => {
    const base = createEditorWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    setDocumentMetadata(base, { name: 'Base name' });
    setDocumentMetadata(local, { name: 'Local name' });
    setDocumentMetadata(remote, { name: 'Remote name' });
    remote.docsById['page-home'].contentRev = 2;
    remote.opSeq = 2;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: remote,
      settings: {},
    });

    const result = await analyzeWorkspaceRevisionFailure({
      baseSnapshot: base,
      localSnapshot: local,
      error: createConflictError(),
      token: 'token',
    });

    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.session).toMatchObject({
      workspaceId: base.id,
      status: 'open',
      unresolvedConflictIds: [expect.stringContaining('/metadata/name')],
    });
    expect(
      result.session.analysis.candidateSnapshot.docsById['page-home'].content
    ).toHaveProperty('metadata.name', 'Remote name');
  });
});
