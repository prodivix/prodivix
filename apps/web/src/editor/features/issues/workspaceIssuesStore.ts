import { create } from 'zustand';
import {
  createDiagnosticIssueCollectionState,
  upsertDiagnosticProviderSnapshot,
  type DiagnosticIssueCollectionState,
  type DiagnosticProviderSnapshot,
} from '@prodivix/diagnostics';

type WorkspaceIssuesStore = {
  collection: DiagnosticIssueCollectionState | null;
  ensureWorkspace: (workspaceId: string) => void;
  publishSnapshot: (snapshot: DiagnosticProviderSnapshot) => void;
  clearWorkspace: (workspaceId?: string) => void;
};

export const useWorkspaceIssuesStore = create<WorkspaceIssuesStore>()(
  (set) => ({
    collection: null,
    ensureWorkspace: (workspaceId) =>
      set((state) =>
        state.collection?.workspaceId === workspaceId
          ? state
          : {
              collection: createDiagnosticIssueCollectionState(workspaceId),
            }
      ),
    publishSnapshot: (snapshot) =>
      set((state) => {
        const collection =
          state.collection?.workspaceId === snapshot.workspaceId
            ? state.collection
            : createDiagnosticIssueCollectionState(snapshot.workspaceId);
        const result = upsertDiagnosticProviderSnapshot(collection, snapshot);
        return result.status === 'updated'
          ? { collection: result.state }
          : state;
      }),
    clearWorkspace: (workspaceId) =>
      set((state) => {
        if (
          workspaceId &&
          state.collection?.workspaceId &&
          state.collection.workspaceId !== workspaceId
        ) {
          return state;
        }
        if (!state.collection) return state;
        return { collection: null };
      }),
  })
);
