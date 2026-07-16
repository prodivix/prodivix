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
  canvasMode: 'design' | 'interactive' | 'run';
  runProvider: 'browser' | 'remote';
  routePreviewPath: string;
  selectedId?: string;
  hiddenNodeIds: string[];
};

export const DEFAULT_BLUEPRINT_STATE: BlueprintState = {
  viewportWidth: '1440',
  viewportHeight: '900',
  zoom: 100,
  pan: { x: 80, y: 60 },
  canvasMode: 'design',
  runProvider: 'browser',
  routePreviewPath: '/',
  selectedId: undefined,
  hiddenNodeIds: [],
};
