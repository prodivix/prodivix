import { create } from 'zustand';
import { createBlueprintSlice } from './editorStore.blueprintSlice';
import { createProjectSlice } from './editorStore.projectSlice';
import { createRouteSlice } from './editorStore.routeSlice';
import { createWorkspaceSlice } from './editorStore.workspaceSlice';
import { createWorkspaceSyncSlice } from './editorStore.workspaceSyncSlice';
import type { EditorStore } from './editorStore.shape';

export {
  DEFAULT_BLUEPRINT_STATE,
  type BlueprintState,
  type WorkspaceRouteManifest,
  type WorkspaceRouteNode,
  type WorkspaceVfsNode,
} from './editorStore.types';
export type { WorkspaceRouteIntent } from '@prodivix/workspace';
export * from './editorStore.selectors';
export type { EditorStore } from './editorStore.shape';
export type { UpdateActivePirDocumentOptions } from './editorStore.workspaceSlice';

export const useEditorStore = create<EditorStore>()((...args) => ({
  ...createWorkspaceSlice(...args),
  ...createWorkspaceSyncSlice(...args),
  ...createRouteSlice(...args),
  ...createBlueprintSlice(...args),
  ...createProjectSlice(...args),
}));
