type GraphExecuteRequest = {
  nodeId: string;
  trigger: string;
  eventKey: string;
  params?: Record<string, unknown>;
};

type GraphExecuteResult = {
  statePatch: Record<string, unknown>;
};

const REQUEST_EVENT = 'prodivix:execute-graph';
const RESULT_EVENT = 'prodivix:execute-graph-result';
const DEFAULT_TIMEOUT_MS = 5000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStatePatch = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return {};
  if (isPlainObject(value.statePatch)) return value.statePatch;
  if (isPlainObject(value.patch)) return value.patch;
  return value;
};

/**
 * 执行链路：Blueprint controller -> GraphExecutor -> 节点图执行层（事件总线）-> runtime state patch。
 */
export const executeBlueprintGraph = async (
  request: GraphExecuteRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<GraphExecuteResult> => {
  if (typeof window === 'undefined') {
    return { statePatch: {} };
  }
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return new Promise((resolve) => {
    let completed = false;
    const timeoutId = window.setTimeout(
      () => {
        if (completed) return;
        completed = true;
        window.removeEventListener(RESULT_EVENT, handleResult as EventListener);
        resolve({ statePatch: {} });
      },
      Math.max(0, timeoutMs)
    );

    const handleResult = (event: CustomEvent) => {
      if (completed) return;
      const detail = event.detail;
      if (!isPlainObject(detail) || detail.requestId !== requestId) return;
      completed = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener(RESULT_EVENT, handleResult as EventListener);
      resolve({
        statePatch: normalizeStatePatch(detail.result),
      });
    };

    window.addEventListener(RESULT_EVENT, handleResult as EventListener);
    window.dispatchEvent(
      new CustomEvent(REQUEST_EVENT, {
        detail: {
          requestId,
          nodeId: request.nodeId,
          trigger: request.trigger,
          eventKey: request.eventKey,
          params: request.params ?? {},
        },
      })
    );
  });
};
