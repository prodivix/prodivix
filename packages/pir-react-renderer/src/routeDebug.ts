import type { RouteRuntimeContext } from '@prodivix/router';

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

type EventDebugDetail = {
  eventDebugId?: number;
  type?: string;
  targetTagName?: string;
  currentTargetTagName?: string;
  defaultPrevented?: boolean;
  propagationStopped?: boolean;
};

let nextEventDebugId = 1;
const eventDebugIds =
  typeof WeakMap === 'undefined' ? null : new WeakMap<object, number>();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const readElementTagName = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    'tagName' in value &&
    typeof (value as { tagName?: unknown }).tagName === 'string'
  ) {
    return (value as { tagName: string }).tagName.toLowerCase();
  }
  return undefined;
};

export const getRouteDebugEventDetail = (
  payload: unknown
): EventDebugDetail => {
  const eventRecord = asRecord(payload);
  if (!eventRecord) return {};
  const nativeEvent = asRecord(eventRecord.nativeEvent);
  const eventIdentity = nativeEvent ?? eventRecord;
  let eventDebugId: number | undefined;
  if (eventDebugIds) {
    eventDebugId = eventDebugIds.get(eventIdentity);
    if (!eventDebugId) {
      eventDebugId = nextEventDebugId;
      nextEventDebugId += 1;
      eventDebugIds.set(eventIdentity, eventDebugId);
    }
  }
  const propagationReader = eventRecord.isPropagationStopped;
  return {
    eventDebugId,
    type:
      typeof eventRecord.type === 'string'
        ? eventRecord.type
        : typeof nativeEvent?.type === 'string'
          ? nativeEvent.type
          : undefined,
    targetTagName: readElementTagName(eventRecord.target),
    currentTargetTagName: readElementTagName(eventRecord.currentTarget),
    defaultPrevented:
      typeof eventRecord.defaultPrevented === 'boolean'
        ? eventRecord.defaultPrevented
        : typeof nativeEvent?.defaultPrevented === 'boolean'
          ? nativeEvent.defaultPrevented
          : undefined,
    propagationStopped:
      typeof propagationReader === 'function'
        ? Boolean(propagationReader.call(payload))
        : undefined,
  };
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
