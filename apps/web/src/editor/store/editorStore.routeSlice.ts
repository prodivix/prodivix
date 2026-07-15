import type { StateCreator } from 'zustand';
import { selectWorkspaceRoute } from '@prodivix/workspace';
import type { EditorStore } from './editorStore.shape';

export interface RouteSlice {
  setActiveRouteNodeId: (routeNodeId: string | undefined) => void;
}

export const createRouteSlice: StateCreator<EditorStore, [], [], RouteSlice> = (
  set
) => ({
  setActiveRouteNodeId: (routeNodeId) =>
    set((state) => {
      if (!state.workspace) return state;
      const workspace = selectWorkspaceRoute(state.workspace, routeNodeId);
      return workspace && workspace !== state.workspace ? { workspace } : state;
    }),
});
