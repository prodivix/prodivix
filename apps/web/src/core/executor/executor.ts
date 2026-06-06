import type { BuiltInActionContext } from '@/pir/actions/registry';

type UnsafeRecord = Record<string, unknown>;

type GraphExecuteParams = BuiltInActionContext['params'];

export type GraphExecutionRequest = {
  requestId: string;
  nodeId: string;
  trigger: string;
  eventKey: string;
  params?: GraphExecuteParams;
};

export type GraphExecutionResult = {
  statePatch: Record<string, unknown>;
};

export type GraphExecutionHandler = (
  request: GraphExecutionRequest
) =>
  | GraphExecutionResult
  | Record<string, unknown>
  | null
  | undefined
  | Promise<GraphExecutionResult | Record<string, unknown> | null | undefined>;

export const GRAPH_EXECUTE_REQUEST_EVENT = 'prodivix:execute-graph';
export const GRAPH_EXECUTE_RESULT_EVENT = 'prodivix:execute-graph-result';

const graphHandlers = new Map<string, GraphExecutionHandler>();

const isPlainObject = (value: unknown): value is UnsafeRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStatePatch = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  if (isPlainObject(value.statePatch)) return value.statePatch;
  if (isPlainObject(value.patch)) return value.patch;
  return value;
};

const normalizeGraphKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const pickHandler = (
  params?: GraphExecuteParams
): GraphExecutionHandler | null => {
  const graphId = normalizeGraphKey(params?.graphId);
  if (graphId && graphHandlers.has(graphId)) {
    return graphHandlers.get(graphId) ?? null;
  }
  const graphName = normalizeGraphKey(params?.graphName);
  if (graphName && graphHandlers.has(graphName)) {
    return graphHandlers.get(graphName) ?? null;
  }
  const wildcard = graphHandlers.get('*');
  return wildcard ?? null;
};

const resolveInlineStatePatch = (
  params?: GraphExecuteParams
): Record<string, unknown> => {
  if (!isPlainObject(params)) return {};
  return normalizeStatePatch(params);
};

const safeDispatchResult = (
  target: Window,
  requestId: string,
  result: GraphExecutionResult
) => {
  target.dispatchEvent(
    new CustomEvent(GRAPH_EXECUTE_RESULT_EVENT, {
      detail: {
        requestId,
        result,
      },
    })
  );
};

const emitGraphDebugLog = (label: string, detail: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  console.debug(`[node-graph-executor] ${label}`, detail);
};

/**
 * 执行链路：PIR executeGraph 事件 -> Graph bridge -> NodeGraph handler -> runtime state patch。
 */
export const executeGraphRequest = async (
  request: GraphExecutionRequest
): Promise<GraphExecutionResult> => {
  emitGraphDebugLog('request', {
    requestId: request.requestId,
    nodeId: request.nodeId,
    trigger: request.trigger,
    eventKey: request.eventKey,
    params: request.params ?? null,
  });
  const handler = pickHandler(request.params);
  if (handler) {
    const resolved = await handler(request);
    const result = {
      statePatch: normalizeStatePatch(resolved),
    };
    emitGraphDebugLog('result', {
      requestId: request.requestId,
      handled: true,
      statePatchKeys: Object.keys(result.statePatch),
    });
    return result;
  }
  const result = {
    statePatch: resolveInlineStatePatch(request.params),
  };
  emitGraphDebugLog('result', {
    requestId: request.requestId,
    handled: false,
    statePatchKeys: Object.keys(result.statePatch),
  });
  return result;
};

export const mountGraphExecutionBridge = (
  target: Window | undefined = typeof window === 'undefined'
    ? undefined
    : window
): (() => void) => {
  if (!target) return () => undefined;

  const handleRequest = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!isPlainObject(detail)) return;
    const requestId = normalizeGraphKey(detail.requestId);
    if (!requestId) return;

    const request: GraphExecutionRequest = {
      requestId,
      nodeId: typeof detail.nodeId === 'string' ? detail.nodeId : '',
      trigger: typeof detail.trigger === 'string' ? detail.trigger : '',
      eventKey: typeof detail.eventKey === 'string' ? detail.eventKey : '',
      params: isPlainObject(detail.params)
        ? (detail.params as GraphExecuteParams)
        : undefined,
    };

    void executeGraphRequest(request)
      .then((result) => {
        safeDispatchResult(target, requestId, result);
      })
      .catch(() => {
        safeDispatchResult(target, requestId, { statePatch: {} });
      });
  };

  target.addEventListener(
    GRAPH_EXECUTE_REQUEST_EVENT,
    handleRequest as EventListener
  );
  return () => {
    target.removeEventListener(
      GRAPH_EXECUTE_REQUEST_EVENT,
      handleRequest as EventListener
    );
  };
};

export const registerGraphExecutionHandler = (
  key: string,
  handler: GraphExecutionHandler
): (() => void) => {
  const normalized = key.trim();
  if (!normalized) {
    return () => undefined;
  }
  graphHandlers.set(normalized, handler);
  return () => {
    if (graphHandlers.get(normalized) === handler) {
      graphHandlers.delete(normalized);
    }
  };
};

export const clearGraphExecutionHandlers = () => {
  graphHandlers.clear();
};
