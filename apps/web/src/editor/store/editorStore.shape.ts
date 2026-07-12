import type { BlueprintSlice } from './editorStore.blueprintSlice';
import type { ProjectSlice } from './editorStore.projectSlice';
import type { RouteSlice } from './editorStore.routeSlice';
import type { WorkspaceSlice } from './editorStore.workspaceSlice';
import type { WorkspaceSyncSlice } from './editorStore.workspaceSyncSlice';

export type EditorStore = WorkspaceSlice &
  WorkspaceSyncSlice &
  RouteSlice &
  BlueprintSlice &
  ProjectSlice;
