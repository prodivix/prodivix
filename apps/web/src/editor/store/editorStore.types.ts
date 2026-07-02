import type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
} from '@prodivix/shared/router';

export type {
  RouteModule,
  RouteModuleMount,
  WorkspaceRouteCodeReference,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
  WorkspaceRouteOutletBinding,
  WorkspaceRouteRuntime,
} from '@prodivix/shared/router';

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

export type WorkspaceVfsNode = {
  id: string;
  kind: 'dir' | 'doc';
  name: string;
  parentId: string | null;
  children?: string[];
  docId?: string;
};

export type RouteIntent =
  | {
      type: 'create-page';
      path: string;
      routeNodeId?: string;
    }
  | {
      type: 'create-index';
      parentRouteNodeId: string;
      routeNodeId?: string;
      pageDocId?: string;
    }
  | {
      type: 'create-child-route';
      parentRouteNodeId: string;
      segment: string;
      routeNodeId?: string;
      pageDocId?: string;
    }
  | {
      type: 'rename-segment';
      routeNodeId: string;
      segment: string;
    }
  | {
      type: 'move-route';
      routeNodeId: string;
      parentRouteNodeId: string;
      index?: number;
    }
  | {
      type: 'attach-layout';
      routeNodeId: string;
      layoutDocId?: string;
    }
  | {
      type: 'detach-layout';
      routeNodeId: string;
    }
  | {
      type: 'bind-outlet';
      routeNodeId: string;
      outletNodeId: string;
      outletName?: string;
    }
  | {
      type: 'unbind-outlet';
      routeNodeId: string;
      outletName?: string;
    }
  | {
      type: 'set-runtime-ref';
      routeNodeId: string;
      kind: 'loader' | 'action' | 'guard';
      reference?: WorkspaceRouteCodeReference;
    }
  | {
      type: 'delete-route';
      routeNodeId: string;
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

export const DEFAULT_ROUTE_MANIFEST: WorkspaceRouteManifest = {
  version: '1',
  root: {
    id: 'root',
    children: [],
  },
};
