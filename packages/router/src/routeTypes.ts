export type WorkspaceRouteOutletBinding = {
  outletNodeId: string;
  pageDocId?: string;
};

export type WorkspaceRouteCodeReference = {
  artifactId: string;
  exportName?: string;
  symbolId?: string;
};

export type WorkspaceRouteRuntime = {
  loaderRef?: WorkspaceRouteCodeReference;
  actionRef?: WorkspaceRouteCodeReference;
  guardRef?: WorkspaceRouteCodeReference;
};

export type WorkspaceRouteNode = {
  id: string;
  segment?: string;
  index?: boolean;
  layoutDocId?: string;
  pageDocId?: string;
  outletNodeId?: string;
  outletBindings?: Record<string, WorkspaceRouteOutletBinding>;
  runtime?: WorkspaceRouteRuntime;
  children?: WorkspaceRouteNode[];
};

export type RouteModule = {
  moduleId: string;
  version: string;
  root: WorkspaceRouteNode;
};

export type RouteModuleMount = {
  mountId: string;
  moduleRef: string;
  mountPath?: string;
  parentRouteNodeId?: string;
};

export type WorkspaceRouteManifest = {
  version: string;
  root: WorkspaceRouteNode;
  modules?: Record<string, RouteModule>;
  mounts?: RouteModuleMount[];
};
