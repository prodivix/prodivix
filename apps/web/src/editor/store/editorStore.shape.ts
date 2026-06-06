import type { BlueprintSlice } from './editorStore.blueprintSlice';
import type { PirSlice } from './editorStore.pirSlice';
import type { ProjectSlice } from './editorStore.projectSlice';
import type { RouteSlice } from './editorStore.routeSlice';
import type { WorkspaceSlice } from './editorStore.workspaceSlice';

export type EditorStore = PirSlice &
  WorkspaceSlice &
  RouteSlice &
  BlueprintSlice &
  ProjectSlice;
