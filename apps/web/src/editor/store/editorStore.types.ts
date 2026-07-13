export type { WorkspaceVfsNode } from '@prodivix/workspace';

export type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
  WorkspaceRouteOutletBinding,
  WorkspaceRouteRuntime,
} from '@prodivix/router';

export type BlueprintState = {
  viewportWidth: string;
  viewportHeight: string;
  zoom: number;
  pan: { x: number; y: number };
  interactionMode: 'design' | 'interactive';
  routePreviewPath: string;
  selectedId?: string;
  hiddenNodeIds: string[];
};

export const DEFAULT_BLUEPRINT_STATE: BlueprintState = {
  viewportWidth: '1440',
  viewportHeight: '900',
  zoom: 100,
  pan: { x: 80, y: 60 },
  interactionMode: 'design',
  routePreviewPath: '/',
  selectedId: undefined,
  hiddenNodeIds: [],
};
