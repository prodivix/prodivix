import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyWorkspaceCommand,
  getWorkspaceOperationId,
  type DecodedWorkspaceMutation,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { executeWorkspaceDocumentMutation } from '@/editor/workspaceSync/workspaceDocumentMutationExecutor';
import { executeWorkspaceOutboxOperation } from '@/editor/workspaceSync/workspaceOutboxExecutor';
import {
  createMemoryWorkspaceOutboxStore,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';

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
  let outboxStore: WorkspaceOutboxStore;

  beforeEach(() => {
    outboxStore = createMemoryWorkspaceOutboxStore();
  });

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
    const commit = vi
      .spyOn(editorApi, 'commitWorkspaceOperation')
      .mockRejectedValueOnce(createConflictError())
      .mockImplementationOnce(async (_token, snapshot, request) =>
        createMutation(snapshot, getWorkspaceOperationId(request.operation))
      );

    const result = await executeWorkspaceDocumentMutation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
      outboxStore,
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
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]?.[2]).toMatchObject({
      expected: {
        documents: [{ id: 'page-home', contentRev: 2 }],
      },
    });
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
    const commit = vi
      .spyOn(editorApi, 'commitWorkspaceOperation')
      .mockRejectedValueOnce(createConflictError());

    const result = await executeWorkspaceDocumentMutation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
      outboxStore,
    });

    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.session.status).toBe('open');
    expect(result.session.unresolvedConflictIds).toHaveLength(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('keeps the exact operation queued after a network failure', async () => {
    const base = createEditorWorkspace();
    setMetadata(base, { name: 'Base name' });
    const command = createCommand();
    const applied = applyWorkspaceCommand(base, command);
    if (!applied.ok) throw new Error('Expected local command to apply.');
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockRejectedValue(
      new TypeError('offline')
    );

    const result = await executeWorkspaceDocumentMutation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'queued',
      operation: { kind: 'command', command: { id: command.id } },
      entry: {
        id: command.id,
        attemptCount: 1,
        state: { kind: 'retry-wait' },
      },
    });
    expect(await outboxStore.list(base.id)).toHaveLength(1);
  });

  it('keeps the exact operation retryable when local ACK persistence fails', async () => {
    const base = createEditorWorkspace();
    setMetadata(base, { name: 'Base name' });
    const command = createCommand();
    const applied = applyWorkspaceCommand(base, command);
    if (!applied.ok) throw new Error('Expected local command to apply.');
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockResolvedValue(
      createMutation(base, command.id)
    );

    const result = await executeWorkspaceOutboxOperation({
      token: 'token',
      baseSnapshot: base,
      localSnapshot: applied.snapshot,
      operation: { kind: 'command', command },
      store: outboxStore,
      replicaWriter: async () => {
        throw new Error('IndexedDB write failed');
      },
    });

    expect(result).toMatchObject({
      kind: 'queued',
      operation: { kind: 'command', command: { id: command.id } },
      entry: {
        id: command.id,
        state: {
          kind: 'retry-wait',
          failure: {
            code: 'LOCAL_ACK_PERSISTENCE_FAILED',
            retryable: true,
          },
        },
      },
    });
    expect(await outboxStore.get(command.id)).toMatchObject({
      request: { operation: { kind: 'command', command: { id: command.id } } },
      state: { kind: 'retry-wait' },
    });
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
      vi.spyOn(editorApi, 'commitWorkspaceOperation').mockResolvedValue(
        mutation
      );

      await expect(
        executeWorkspaceDocumentMutation({
          token: 'token',
          baseSnapshot: base,
          localSnapshot: applied.snapshot,
          operation: { kind: 'command', command },
          outboxStore,
        })
      ).rejects.toThrow(/acknowledged an unrelated/);
    }
  );
});
