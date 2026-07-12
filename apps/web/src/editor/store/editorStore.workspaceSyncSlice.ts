import type { StateCreator } from 'zustand';
import type { WorkspaceConflictSession } from '@prodivix/workspace-sync';
import type { EditorStore } from './editorStore.shape';

export type WorkspaceConflictResolutionStatus = 'idle' | 'resolving' | 'error';

export interface WorkspaceSyncSlice {
  workspaceRevisionConflict: WorkspaceConflictSession | null;
  workspaceConflictResolutionStatus: WorkspaceConflictResolutionStatus;
  workspaceConflictResolutionError: string | null;
  openWorkspaceRevisionConflict: (
    session: WorkspaceConflictSession,
    expectedSessionId?: string
  ) => boolean;
  beginWorkspaceConflictResolution: (sessionId: string) => boolean;
  failWorkspaceConflictResolution: (sessionId: string, message: string) => void;
  clearWorkspaceRevisionConflict: (sessionId?: string) => void;
}

export const createWorkspaceSyncSlice: StateCreator<
  EditorStore,
  [],
  [],
  WorkspaceSyncSlice
> = (set, get) => ({
  workspaceRevisionConflict: null,
  workspaceConflictResolutionStatus: 'idle',
  workspaceConflictResolutionError: null,
  openWorkspaceRevisionConflict: (session, expectedSessionId) => {
    const state = get();
    if (!state.workspace || state.workspace.id !== session.workspaceId) {
      return false;
    }
    const currentSessionId = state.workspaceRevisionConflict?.id;
    if (
      expectedSessionId !== undefined
        ? currentSessionId !== expectedSessionId
        : currentSessionId !== undefined && currentSessionId !== session.id
    ) {
      return false;
    }
    set({
      workspaceRevisionConflict: session,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
    });
    return true;
  },
  beginWorkspaceConflictResolution: (sessionId) => {
    const conflict = get().workspaceRevisionConflict;
    if (!conflict || conflict.id !== sessionId) return false;
    set({
      workspaceConflictResolutionStatus: 'resolving',
      workspaceConflictResolutionError: null,
    });
    return true;
  },
  failWorkspaceConflictResolution: (sessionId, message) =>
    set((state) => {
      if (state.workspaceRevisionConflict?.id !== sessionId) return state;
      return {
        workspaceConflictResolutionStatus: 'error',
        workspaceConflictResolutionError:
          message.trim() || 'Could not resolve the revision conflict.',
      };
    }),
  clearWorkspaceRevisionConflict: (sessionId) =>
    set((state) => {
      if (
        sessionId &&
        state.workspaceRevisionConflict &&
        state.workspaceRevisionConflict.id !== sessionId
      ) {
        return state;
      }
      return {
        workspaceRevisionConflict: null,
        workspaceConflictResolutionStatus: 'idle',
        workspaceConflictResolutionError: null,
      };
    }),
});
