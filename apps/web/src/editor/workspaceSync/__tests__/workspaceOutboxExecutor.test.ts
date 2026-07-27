import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DecodedWorkspaceMutation,
  WorkspaceOperation,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createMemoryWorkspaceOutboxStore,
  createWorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import { editorApi } from '@/editor/editorApi';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { persistAcknowledgedWorkspaceLocalReplica } from '@/editor/workspaceSync/workspaceLocalReplica';
import {
  executeWorkspaceOutboxOperation,
  resumeWorkspaceOutbox,
} from '@/editor/workspaceSync/workspaceOutboxExecutor';

const OPERATION_ID = 'operation-metadata';

const createOperation = (workspace: WorkspaceSnapshot): WorkspaceOperation => ({
  kind: 'command',
  command: {
    id: OPERATION_ID,
    namespace: 'core.pir',
    type: 'document.update',
    version: '1.0',
    issuedAt: '2026-07-27T00:00:00.000Z',
    forwardOps: [{ op: 'add', path: '/metadata', value: { name: 'Local' } }],
    reverseOps: [{ op: 'remove', path: '/metadata' }],
    target: { workspaceId: workspace.id, documentId: 'page-home' },
    domainHint: 'pir',
  },
});

const mockAcceptedCommit = (workspace: WorkspaceSnapshot) => {
  const mutation: DecodedWorkspaceMutation = {
    workspaceId: workspace.id,
    workspaceRev: workspace.workspaceRev + 1,
    routeRev: workspace.routeRev,
    opSeq: workspace.opSeq + 1,
    updatedDocuments: [],
    removedDocumentIds: [],
    acceptedMutationId: OPERATION_ID,
  };
  return vi
    .spyOn(editorApi, 'commitWorkspaceOperation')
    .mockResolvedValue(mutation);
};

describe('executeWorkspaceOutboxOperation acknowledgement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retires a confirmed operation when no local replica has been cached yet', async () => {
    const base = createEditorWorkspace();
    const commit = mockAcceptedCommit(base);
    const store = createMemoryWorkspaceOutboxStore();

    const result = await executeWorkspaceOutboxOperation({
      baseSnapshot: base,
      localSnapshot: base,
      operation: createOperation(base),
      replicaWriter: persistAcknowledgedWorkspaceLocalReplica,
      store,
      token: 'token',
    });

    expect(result.kind).toBe('acknowledged');
    expect(commit).toHaveBeenCalledTimes(1);
    await expect(store.get(OPERATION_ID)).resolves.toBeNull();
  });

  it('keeps a confirmed operation queued while local replica writes may still recover', async () => {
    const base = createEditorWorkspace();
    mockAcceptedCommit(base);
    const store = createMemoryWorkspaceOutboxStore();

    const result = await executeWorkspaceOutboxOperation({
      baseSnapshot: base,
      localSnapshot: base,
      operation: createOperation(base),
      replicaWriter: async () => {
        throw new Error('IndexedDB write failed');
      },
      store,
      token: 'token',
    });

    expect(result).toMatchObject({
      kind: 'queued',
      entry: {
        state: {
          kind: 'retry-wait',
          failure: { code: 'LOCAL_ACK_PERSISTENCE_FAILED' },
        },
      },
    });
  });

  it('stops resending a confirmed operation once local replica writes keep failing', async () => {
    const base = createEditorWorkspace();
    const commit = mockAcceptedCommit(base);
    const created = createWorkspaceOutboxEntry({
      baseSnapshot: base,
      operation: createOperation(base),
      now: Date.now(),
    });
    if (created.ok === false) throw new Error(created.issues[0]?.message);
    const store = createMemoryWorkspaceOutboxStore([
      { ...created.entry, attemptCount: 3 },
    ]);

    const results = await resumeWorkspaceOutbox({
      store,
      token: 'token',
      workspaceId: base.id,
      replicaWriter: async () => {
        throw new Error('IndexedDB write failed');
      },
    });

    expect(results[0]?.kind).toBe('acknowledged');
    expect(commit).toHaveBeenCalledTimes(1);
    await expect(store.get(OPERATION_ID)).resolves.toBeNull();
  });
});
