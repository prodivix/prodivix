import type { RouteRuntimeContext } from '@prodivix/shared/router';

type RouteDebugRoute = {
  id: string;
  path: string;
  hasPage?: boolean;
  hasLayout?: boolean;
  hasOutlet?: boolean;
};

type RouteDebugSnapshotInput = {
  currentPath?: string;
  routes?: RouteDebugRoute[];
  routeRuntimeContext?: RouteRuntimeContext;
  interactionMode?: string;
  outletTargetNodeId?: string;
  outletContentNodeId?: string | null;
};

export type RouteDebugSnapshot = {
  timestamp: string;
  locationHref?: string;
  elementCount: number;
  pirNodeElementCount: number;
  selectedPirNodeElementCount: number;
  mountedPirStyleCount: number;
  currentPath?: string;
  interactionMode?: string;
  outletTargetNodeId?: string;
  outletContentNodeId?: string | null;
  routeCount: number;
  routes: RouteDebugRoute[];
  runtime?: {
    currentPath: string;
    matchedPath: string;
    activeRouteNodeId?: string;
    matchChain: Array<{
      routeNodeId: string;
      path: string;
      pageDocId?: string;
      layoutDocId?: string;
      outletNodeId?: string;
    }>;
  };
};

declare global {
  interface Window {
    __PRODIVIX_DEBUG_ROUTE__?: boolean;
    __PRODIVIX_ROUTE_DEBUG_SNAPSHOT__?: () => RouteDebugSnapshot;
  }
}

export const isRouteDebugEnabled = () =>
  typeof window !== 'undefined' && window.__PRODIVIX_DEBUG_ROUTE__ === true;

export const logRouteDebug = (
  message: string,
  detail: Record<string, unknown>
) => {
  if (!isRouteDebugEnabled()) return;
  console.debug('[prodivix-route-debug]', message, detail);
};

export const createRouteDebugSnapshot = (
  input: RouteDebugSnapshotInput
): RouteDebugSnapshot => {
  const runtime = input.routeRuntimeContext;
  return {
    timestamp: new Date().toISOString(),
    locationHref:
      typeof window === 'undefined' ? undefined : window.location.href,
    elementCount:
      typeof document === 'undefined'
        ? 0
        : document.querySelectorAll('*').length,
    pirNodeElementCount:
      typeof document === 'undefined'
        ? 0
        : document.querySelectorAll('[data-pir-node-id], [data-pir-id]').length,
    selectedPirNodeElementCount:
      typeof document === 'undefined'
        ? 0
        : document.querySelectorAll('[data-pir-selected="true"]').length,
    mountedPirStyleCount:
      typeof document === 'undefined'
        ? 0
        : document.querySelectorAll('style[data-pir-mounted-css]').length,
    currentPath: input.currentPath,
    interactionMode: input.interactionMode,
    outletTargetNodeId: input.outletTargetNodeId,
    outletContentNodeId: input.outletContentNodeId,
    routeCount: input.routes?.length ?? 0,
    routes: input.routes ?? [],
    runtime: runtime
      ? {
          currentPath: runtime.currentPath,
          matchedPath: runtime.matchedPath,
          activeRouteNodeId: runtime.activeRouteNodeId,
          matchChain: runtime.matchChain.map((match) => ({
            routeNodeId: match.routeNodeId,
            path: match.path,
            pageDocId: match.pageDocId,
            layoutDocId: match.layoutDocId,
            outletNodeId: match.outletNodeId,
          })),
        }
      : undefined,
  };
};
