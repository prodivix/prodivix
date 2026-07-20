import { afterEach, describe, expect, it, vi } from 'vitest';
import { editorApi } from '@/editor/editorApi';
import { executeWorkspaceSettingsOutboxCommit } from '@/editor/workspaceSync/workspaceSettingsOutboxExecutor';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import {
  createMemoryWorkspaceOutboxStore,
  type WorkspaceSettingsOutboxEntry,
} from '@prodivix/workspace-sync';

describe('executeWorkspaceSettingsOutboxCommit', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not enqueue or commit semantically unchanged settings', async () => {
    const base = createEditorWorkspace();
    const store =
      createMemoryWorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>();
    const commit = vi.spyOn(editorApi, 'commitWorkspaceSettings');

    const result = await executeWorkspaceSettingsOutboxCommit({
      token: 'token',
      baseSnapshot: base,
      baseSettings: {
        global: { density: 'compact', language: 'zh-CN' },
        projectGlobalById: { project: { undoSteps: 80 } },
      },
      settings: {
        projectGlobalById: { project: { undoSteps: 80 } },
        global: { language: 'zh-CN', density: 'compact' },
      },
      commitId: 'settings-no-op',
      store,
    });

    expect(result).toMatchObject({
      kind: 'already-applied',
      snapshot: { workspaceRev: base.workspaceRev, opSeq: base.opSeq },
    });
    expect(commit).not.toHaveBeenCalled();
    await expect(store.get('settings-no-op')).resolves.toBeNull();
  });

  it('keeps the exact settings request retryable when local ACK persistence fails', async () => {
    const base = createEditorWorkspace();
    const store =
      createMemoryWorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>();
    vi.spyOn(editorApi, 'commitWorkspaceSettings').mockResolvedValue({
      workspaceId: base.id,
      workspaceRev: base.workspaceRev + 1,
      routeRev: base.routeRev,
      opSeq: base.opSeq + 1,
      updatedDocuments: [],
      removedDocumentIds: [],
      settings: { theme: 'dark' },
      acceptedMutationId: 'settings-local',
    });

    const result = await executeWorkspaceSettingsOutboxCommit({
      token: 'token',
      baseSnapshot: base,
      baseSettings: { theme: 'light' },
      settings: { theme: 'dark' },
      commitId: 'settings-local',
      store,
      replicaWriter: async () => {
        throw new Error('IndexedDB write failed');
      },
    });

    expect(result).toMatchObject({
      kind: 'queued',
      entry: {
        id: 'settings-local',
        request: { settings: { theme: 'dark' } },
        state: {
          kind: 'retry-wait',
          failure: {
            code: 'LOCAL_ACK_PERSISTENCE_FAILED',
            retryable: true,
          },
        },
      },
    });
    expect(await store.get('settings-local')).toMatchObject({
      request: { commitId: 'settings-local', settings: { theme: 'dark' } },
      state: { kind: 'retry-wait' },
    });
  });
});
