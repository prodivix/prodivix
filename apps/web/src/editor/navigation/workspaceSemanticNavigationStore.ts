import { create } from 'zustand';
import type {
  WorkspaceSurfaceNavigationRequest,
  WorkspaceSurfaceNavigationRequestInput,
} from './workspaceSemanticNavigation.types';

type WorkspaceSemanticNavigationStore = {
  navigationRequest: WorkspaceSurfaceNavigationRequest | null;
  requestSurfaceNavigation: (
    request: WorkspaceSurfaceNavigationRequestInput
  ) => void;
  consumeNavigation: (requestId: number) => void;
  clearNavigation: (workspaceId?: string) => void;
};

let nextNavigationRequestId = 0;

export const useWorkspaceSemanticNavigationStore =
  create<WorkspaceSemanticNavigationStore>()((set) => ({
    navigationRequest: null,
    requestSurfaceNavigation: (request) => {
      nextNavigationRequestId += 1;
      set({
        navigationRequest: {
          ...request,
          id: nextNavigationRequestId,
        },
      });
    },
    consumeNavigation: (requestId) =>
      set((state) =>
        state.navigationRequest?.id === requestId
          ? { navigationRequest: null }
          : state
      ),
    clearNavigation: (workspaceId) =>
      set((state) => {
        if (
          !state.navigationRequest ||
          (workspaceId && state.navigationRequest.workspaceId !== workspaceId)
        ) {
          return state;
        }
        return { navigationRequest: null };
      }),
  }));
