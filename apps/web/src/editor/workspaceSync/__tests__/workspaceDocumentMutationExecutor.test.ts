import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyWorkspaceCommand,
  type DecodedWorkspaceMutation,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { executeWorkspaceDocumentMutation } from '@/editor/workspaceSync/workspaceDocumentMutationExecutor';

const cloneWorkspace = (workspace: WorkspaceSnapshot): WorkspaceSnapshot =>
  JSON.parse(JSON.stringify(workspace)) as WorkspaceSnapshot;

const setMetadata = (
  workspace: WorkspaceSnapshot,
  metadata: Record<string, unknown>
) => {
  const document = workspace.docsById['page-home'];
  if (!document || typeof document.content !== 'object' || !document.content) {
    throw new Error('Expected a PIR document.');
  }
  document.content = { ...document.content, metadata };
};

const createCommand = (): WorkspaceCommandEnvelope => ({
  id: 'command-local',
  namespace: 'core.pir',
  type: 'metadata.update',
  version: '1.0',
  issuedAt: '2026-07-12T00:00:00Z',
  domainHint: 'pir',
  target: { workspaceId: 'workspace-test', documentId: 'page-home' },
  forwardOps: [{ op: 'replace', path: '/metadata/name', value: 'Local name' }],
  reverseOps: [{ op: 'replace', path: '/metadata/name', value: 'Base name' }],
});

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

const createMutation = (
  snapshot: WorkspaceSnapshot,
  acceptedMutationId: string
): DecodedWorkspaceMutation => ({
  workspaceId: snapshot.id,
  workspaceRev: snapshot.workspaceRev,
  routeRev: snapshot.routeRev,
  opSeq: snapshot.opSeq + 1,
  updatedDocuments: [{ ...snapshot.docsById['page-home'], contentRev: 3 }],
  removedDocumentIds: [],
  acceptedMutationId,
});

describe('executeWorkspaceDocumentMutation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rebuilds and retries a command against the latest independent remote edit', async () => {
    const base = createEditorWorkspace();
    setMetadata(base, { name: 'Base name' });
    const command = createCommand();
    const applied = applyWorkspaceCommand(base, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const remote = cloneWorkspace(base);
    setMetadata(remote, {
      name: 'Base name',
      description: 'Remote description',
    });
    remote.docsById['page-home'].contentRev = 2;
    remote.opSeq = 2;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: remote,
      settings: {},
    });
    const patch = vi
      .spyOn(editorApi, 'patchWorkspaceDocument')
      .mockRejectedValueOnce(createConflictError())
      .mockImplementationOnce(async (_token, snapshot, _documentId, request) =>
        createMutation(snapshot, request.command.id)
      );

    const result = await executeWorkspaceDocumentMutation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
    });

    expect(result.kind).toBe('acknowledged');
    if (result.kind !== 'acknowledged') return;
    expect(result.rebased).toBe(true);
    expect(result.operation).toMatchObject({
      kind: 'command',
      sourceOperationIds: ['command-local'],
      command: {
        target: { documentId: 'page-home' },
        reverseOps: [
          {
            op: 'replace',
            path: '/metadata',
            value: {
              name: 'Base name',
              description: 'Remote description',
            },
          },
        ],
      },
    });
    expect(
      result.optimisticSnapshot.docsById['page-home'].content
    ).toHaveProperty('metadata', {
      name: 'Local name',
      description: 'Remote description',
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1]?.[3]).toMatchObject({ expectedContentRev: 2 });
  });

  it('returns an open session instead of overwriting a competing remote value', async () => {
    const base = createEditorWorkspace();
    setMetadata(base, { name: 'Base name' });
    const command = createCommand();
    const applied = applyWorkspaceCommand(base, command);
    if (!applied.ok) throw new Error('Expected local command to apply.');
    const remote = cloneWorkspace(base);
    setMetadata(remote, { name: 'Remote name' });
    remote.docsById['page-home'].contentRev = 2;
    remote.opSeq = 2;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: remote,
      settings: {},
    });
    const patch = vi
      .spyOn(editorApi, 'patchWorkspaceDocument')
      .mockRejectedValueOnce(createConflictError());

    const result = await executeWorkspaceDocumentMutation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
    });

    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.session.status).toBe('open');
    expect(result.session.unresolvedConflictIds).toHaveLength(1);
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', undefined],
    ['unrelated', 'another-command'],
  ] as const)(
    'rejects a %s document mutation acknowledgement',
    async (_case, acceptedMutationId) => {
      const base = createEditorWorkspace();
      setMetadata(base, { name: 'Base name' });
      const command = createCommand();
      const applied = applyWorkspaceCommand(base, command);
      if (!applied.ok) throw new Error('Expected local command to apply.');
      const mutation = createMutation(base, command.id);
      if (acceptedMutationId === undefined) {
        delete mutation.acceptedMutationId;
      } else {
        mutation.acceptedMutationId = acceptedMutationId;
      }
      vi.spyOn(editorApi, 'patchWorkspaceDocument').mockResolvedValue(mutation);

      await expect(
        executeWorkspaceDocumentMutation({
          token: 'token',
          baseSnapshot: base,
          localSnapshot: applied.snapshot,
          operation: { kind: 'command', command },
        })
      ).rejects.toThrow(/did not acknowledge/);
    }
  );
});
