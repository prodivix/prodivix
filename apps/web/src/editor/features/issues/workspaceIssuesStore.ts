import { create } from 'zustand';
import {
  createDiagnosticIssueCollectionState,
  upsertDiagnosticProviderSnapshot,
  type DiagnosticIssueCollectionState,
  type DiagnosticProviderSnapshot,
  type SourceSpan,
} from '@prodivix/diagnostics';

export type WorkspaceIssueNavigationRequestInput =
  | Readonly<{
      kind: 'code-source';
      projectId: string;
      sourceSpan: SourceSpan;
    }>
  | Readonly<{
      kind: 'animation-track';
      projectId: string;
      documentId: string;
      timelineId: string;
      bindingId: string;
      trackId: string;
    }>
  | Readonly<{
      kind: 'nodegraph-node';
      projectId: string;
      documentId: string;
      graphId: string;
      nodeId: string;
      portId?: string;
    }>;

export type WorkspaceIssueNavigationRequest =
  WorkspaceIssueNavigationRequestInput & Readonly<{ id: number }>;

type WorkspaceIssuesStore = {
  collection: DiagnosticIssueCollectionState | null;
  navigationRequest: WorkspaceIssueNavigationRequest | null;
  ensureWorkspace: (workspaceId: string) => void;
  publishSnapshot: (snapshot: DiagnosticProviderSnapshot) => void;
  requestNavigation: (request: WorkspaceIssueNavigationRequestInput) => void;
  consumeNavigation: (requestId: number) => void;
  clearWorkspace: (workspaceId?: string) => void;
};

let nextNavigationRequestId = 0;

export const useWorkspaceIssuesStore = create<WorkspaceIssuesStore>()(
  (set) => ({
    collection: null,
    navigationRequest: null,
    ensureWorkspace: (workspaceId) =>
      set((state) =>
        state.collection?.workspaceId === workspaceId
          ? state
          : {
              collection: createDiagnosticIssueCollectionState(workspaceId),
              navigationRequest: null,
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
    requestNavigation: (request) => {
      nextNavigationRequestId += 1;
      set({ navigationRequest: { ...request, id: nextNavigationRequestId } });
    },
    consumeNavigation: (requestId) =>
      set((state) =>
        state.navigationRequest?.id === requestId
          ? { navigationRequest: null }
          : state
      ),
    clearWorkspace: (workspaceId) =>
      set((state) => {
        if (
          workspaceId &&
          state.collection?.workspaceId &&
          state.collection.workspaceId !== workspaceId
        ) {
          return state;
        }
        if (!state.collection && !state.navigationRequest) return state;
        return { collection: null, navigationRequest: null };
      }),
  })
);
