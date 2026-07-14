import {
  createNodeGraphExecutor,
  decodeNodeGraphDocument,
} from '@prodivix/nodegraph';
import type {
  NodeGraphDecodeIssue,
  NodeGraphExecutionResult,
  NodeGraphExecutor,
  NodeGraphTraceEvent,
} from '@prodivix/nodegraph';

export type ExecuteNodeGraphActionRequest = {
  documentId: string;
  nodeId: string;
  trigger: string;
  eventKey: string;
  params?: Record<string, unknown>;
  input?: unknown;
};

export type ExecuteNodeGraphActionOptions = {
  executor?: NodeGraphExecutor;
  onLog?: (value: unknown, event: NodeGraphTraceEvent) => void;
  createRequestId?: () => string;
};

export type ExecuteNodeGraphActionResult =
  | NodeGraphExecutionResult
  | {
      status: 'invalid-document';
      statePatch: Record<string, unknown>;
      steps: 0;
      trace: [];
      issues: NodeGraphDecodeIssue[];
    };

const defaultExecutor = createNodeGraphExecutor();

const createBrowserRequestId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Browser composition port from persisted NodeGraph input to the transport-
 * neutral executor. The caller receives the full trace without a global event bus.
 */
export const executeNodeGraphAction = async (
  graphSource: unknown,
  request: ExecuteNodeGraphActionRequest,
  options: ExecuteNodeGraphActionOptions = {}
): Promise<ExecuteNodeGraphActionResult> => {
  const decoded = decodeNodeGraphDocument(graphSource);
  if (decoded.ok === false) {
    return {
      status: 'invalid-document',
      statePatch: {},
      steps: 0,
      trace: [],
      issues: decoded.issues,
    };
  }
  const result = await (options.executor ?? defaultExecutor)(decoded.value, {
    documentId: request.documentId,
    requestId: (options.createRequestId ?? createBrowserRequestId)(),
    source: {
      ownerId: request.nodeId,
      trigger: request.trigger,
      eventKey: request.eventKey,
    },
    params: request.params ?? {},
    input: request.input,
  });
  if (options.onLog) {
    result.trace.forEach((event) => {
      if (event.kind === 'log') options.onLog?.(event.detail.value, event);
    });
  }
  return result;
};
