import { useEditorStore } from '@/editor/store/useEditorStore';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  autoRebaseWorkspaceSnapshots,
  createWorkspaceConflictSession,
} from '@prodivix/workspace-sync';
import { createWorkspaceClientOperationId } from './workspaceOperationIdentity';

/** Rebases current local edits when a non-correlated canonical read is adopted. */
export const adoptWorkspaceRemoteSnapshot = (
  baseSnapshot: WorkspaceSnapshot,
  remoteSnapshot: WorkspaceSnapshot
): void => {
  const state = useEditorStore.getState();
  const current = state.workspace;
  if (!current || current.id !== baseSnapshot.id) return;
  const rebased = autoRebaseWorkspaceSnapshots(
    baseSnapshot,
    current,
    remoteSnapshot
  );
  if (rebased.ok) {
    state.setWorkspaceSnapshot(rebased.snapshot);
    return;
  }
  if (rebased.status !== 'conflicted') return;
  const created = createWorkspaceConflictSession({
    id: createWorkspaceClientOperationId('workspace-outbox-conflict'),
    createdAt: new Date().toISOString(),
    baseSnapshot,
    localSnapshot: current,
    remoteSnapshot,
  });
  if (created.ok) state.openWorkspaceRevisionConflict(created.session);
};
