import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceConflictSession } from '@prodivix/workspace-sync';
import {
  createEditorWorkspace,
  resetEditorStore,
} from '@/test-utils/editorStore';
import { useEditorStore } from '@/editor/store/useEditorStore';

const createConflictSession = (
  overrides: Partial<WorkspaceConflictSession> = {}
): WorkspaceConflictSession =>
  ({
    id: 'conflict-1',
    workspaceId: 'workspace-test',
    status: 'unresolved',
    ...overrides,
  }) as WorkspaceConflictSession;

describe('editor workspace sync state', () => {
  beforeEach(() => {
    resetEditorStore({ workspace: createEditorWorkspace() });
  });

  it('only opens conflicts for the active workspace', () => {
    useEditorStore
      .getState()
      .openWorkspaceRevisionConflict(
        createConflictSession({ workspaceId: 'another-workspace' })
      );
    expect(useEditorStore.getState().workspaceRevisionConflict).toBeNull();

    const session = createConflictSession();
    useEditorStore.getState().openWorkspaceRevisionConflict(session);

    expect(useEditorStore.getState().workspaceRevisionConflict).toBe(session);
    expect(useEditorStore.getState().workspaceConflictResolutionStatus).toBe(
      'idle'
    );
  });

  it('guards asynchronous resolution updates with the session id', () => {
    useEditorStore
      .getState()
      .openWorkspaceRevisionConflict(createConflictSession());

    expect(
      useEditorStore
        .getState()
        .beginWorkspaceConflictResolution('stale-conflict')
    ).toBe(false);
    expect(
      useEditorStore.getState().beginWorkspaceConflictResolution('conflict-1')
    ).toBe(true);
    expect(useEditorStore.getState().workspaceConflictResolutionStatus).toBe(
      'resolving'
    );

    useEditorStore
      .getState()
      .failWorkspaceConflictResolution('stale-conflict', 'stale');
    expect(useEditorStore.getState().workspaceConflictResolutionError).toBe(
      null
    );

    useEditorStore
      .getState()
      .failWorkspaceConflictResolution('conflict-1', 'retry failed');
    expect(useEditorStore.getState()).toMatchObject({
      workspaceConflictResolutionStatus: 'error',
      workspaceConflictResolutionError: 'retry failed',
    });

    useEditorStore.getState().clearWorkspaceRevisionConflict('stale-conflict');
    expect(useEditorStore.getState().workspaceRevisionConflict?.id).toBe(
      'conflict-1'
    );

    useEditorStore.getState().clearWorkspaceRevisionConflict('conflict-1');
    expect(useEditorStore.getState()).toMatchObject({
      workspaceRevisionConflict: null,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
    });
  });

  it('does not let a stale asynchronous result replace a newer session', () => {
    const first = createConflictSession({ id: 'conflict-first' });
    const newer = createConflictSession({ id: 'conflict-newer' });
    const staleResult = createConflictSession({ id: 'conflict-stale-result' });

    expect(useEditorStore.getState().openWorkspaceRevisionConflict(first)).toBe(
      true
    );
    expect(
      useEditorStore.getState().openWorkspaceRevisionConflict(newer, first.id)
    ).toBe(true);
    expect(
      useEditorStore
        .getState()
        .openWorkspaceRevisionConflict(staleResult, first.id)
    ).toBe(false);
    expect(useEditorStore.getState().workspaceRevisionConflict).toBe(newer);
  });
});
