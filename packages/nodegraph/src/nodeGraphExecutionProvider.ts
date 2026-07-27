import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  getExecutionProviderCompatibility,
  isExecutionJobTerminalStatus,
  type ExecutionJob,
  type ExecutionJobController,
  type ExecutionJobResult,
  type ExecutionProvider,
  type ExecutionRequest,
  type ExecutionSourceTrace,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import { createNodeGraphExecutor } from './nodeGraphExecutor';
import type {
  NodeGraphDocument,
  NodeGraphExecutionResult,
  NodeGraphExecutorOptions,
  NodeGraphTraceEvent,
} from './nodeGraph.types';

export const NODEGRAPH_EXECUTION_PROVIDER_ID =
  'prodivix.nodegraph.same-context';

export type ResolveNodeGraphExecutionDocument = (
  request: ExecutionRequest
) => NodeGraphDocument | Promise<NodeGraphDocument>;

export type CreateNodeGraphExecutionProviderOptions = Readonly<{
  resolveDocument: ResolveNodeGraphExecutionDocument;
  executor?: Omit<NodeGraphExecutorOptions, 'onTrace'>;
  createJobId?: (request: ExecutionRequest) => string;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, timeoutMs: number) => () => void;
}>;

export type CreateNodeGraphExecutionInvocationInput = Readonly<{
  input?: unknown;
  params?: Readonly<Record<string, unknown>>;
}>;

export type NodeGraphExecutionJobOutput = Readonly<{
  status: 'completed';
  steps: number;
  statePatch: Readonly<Record<string, ExecutionValue>>;
  output?: ExecutionValue;
}>;

const descriptor = createExecutionProviderDescriptor({
  id: NODEGRAPH_EXECUTION_PROVIDER_ID,
  version: '1',
  displayName: 'NodeGraph Execution Provider',
  isolation: 'same-context',
  profiles: ['preview', 'test'],
  runtimeZones: ['client', 'test'],
  invocationKinds: ['nodegraph'],
  capabilities: [
    'cancellation',
    'diagnostics',
    'source-trace',
    'streaming-logs',
    'timeout',
  ],
});

type ExecutionTimerHost = Readonly<{
  setTimeout(callback: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

const scheduleHostTimeout = (
  callback: () => void,
  timeoutMs: number
): (() => void) => {
  const host = globalThis as unknown as Partial<ExecutionTimerHost>;
  if (!host.setTimeout || !host.clearTimeout) {
    throw new Error('The execution host does not provide timeout scheduling.');
  }
  const handle = host.setTimeout(callback, timeoutMs);
  return () => host.clearTimeout?.(handle);
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );

const toExecutionValue = (
  value: unknown,
  ancestors: Set<object> = new Set(),
  depth = 0
): ExecutionValue => {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === undefined) return null;
  if (typeof value !== 'object') return String(value);
  if (depth >= 16) return '[Maximum execution value depth reached]';
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((entry) => toExecutionValue(entry, ancestors, depth + 1))
      );
    }
    if (value instanceof Error) {
      return Object.freeze({ name: value.name, message: value.message });
    }
    if (!isPlainRecord(value)) return String(value);
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [
            key,
            toExecutionValue(entry, ancestors, depth + 1),
          ])
      )
    );
  } finally {
    ancestors.delete(value);
  }
};

const toExecutionRecord = (
  value: Readonly<Record<string, unknown>>
): Readonly<Record<string, ExecutionValue>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, toExecutionValue(entry)])
    )
  );

export const createNodeGraphExecutionInvocationInput = (
  input: CreateNodeGraphExecutionInvocationInput = {}
): ExecutionValue =>
  Object.freeze({
    ...(input.input === undefined
      ? {}
      : { input: toExecutionValue(input.input) }),
    params: toExecutionRecord(input.params ?? {}),
  });

const readInvocationInput = (
  request: ExecutionRequest
): Readonly<{
  input?: ExecutionValue;
  params: Record<string, unknown>;
}> => {
  const value = request.invocation.input;
  if (!isPlainRecord(value)) {
    return Object.freeze({
      ...(value === undefined ? {} : { input: value }),
      params: {},
    });
  }
  const params = isPlainRecord(value.params) ? value.params : {};
  return Object.freeze({
    ...('input' in value ? { input: value.input as ExecutionValue } : {}),
    params,
  });
};

const resolveDocumentId = (request: ExecutionRequest): string => {
  const target = request.invocation.targetRef;
  if (
    target.kind === 'document' ||
    target.kind === 'nodegraph-node' ||
    target.kind === 'nodegraph-port'
  ) {
    return target.documentId;
  }
  const entrypoint = request.invocation.entrypoint?.trim();
  if (entrypoint) return entrypoint;
  throw new TypeError(
    'NodeGraph execution requires a document-qualified target.'
  );
};

const traceSource = (
  documentId: string,
  event: NodeGraphTraceEvent
): readonly ExecutionSourceTrace[] => {
  const nodeId =
    typeof event.detail.nodeId === 'string' && event.detail.nodeId.trim()
      ? event.detail.nodeId.trim()
      : undefined;
  return Object.freeze([
    Object.freeze({
      sourceRef: nodeId
        ? { kind: 'nodegraph-node' as const, documentId, nodeId }
        : { kind: 'document' as const, documentId },
    }),
  ]);
};

const tracePhase = (event: NodeGraphTraceEvent): 'start' | 'event' | 'end' => {
  if (event.kind === 'graph-started') return 'start';
  if (event.kind === 'graph-completed' || event.kind === 'graph-stopped') {
    return 'end';
  }
  return 'event';
};

const formatLogValue = (value: ExecutionValue): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isRunnable = (controller: ExecutionJobController): boolean => {
  const status = controller.job.getSnapshot().status;
  return !isExecutionJobTerminalStatus(status) && status !== 'cancelling';
};

const failureMessage = (status: NodeGraphExecutionResult['status']): string => {
  if (status === 'no-entry') return 'The NodeGraph has no executable entry.';
  if (status === 'unsupported-node') {
    return 'The NodeGraph contains a node without a registered executor.';
  }
  if (status === 'missing-target') {
    return 'The NodeGraph control flow points to a missing target node.';
  }
  if (status === 'max-steps') {
    return 'The NodeGraph exceeded its deterministic step budget.';
  }
  return `NodeGraph execution stopped with status ${status}.`;
};

export const readNodeGraphExecutionJobOutput = (
  result: ExecutionJobResult
): NodeGraphExecutionJobOutput | undefined => {
  if (result.status !== 'succeeded' || !isPlainRecord(result.output)) {
    return undefined;
  }
  if (
    result.output.status !== 'completed' ||
    typeof result.output.steps !== 'number' ||
    !isPlainRecord(result.output.statePatch)
  ) {
    return undefined;
  }
  return result.output as NodeGraphExecutionJobOutput;
};

/**
 * Adapts the deterministic NodeGraph kernel to the canonical ExecutionJob
 * lifecycle without making the domain document or trace depend on a browser.
 */
export const createNodeGraphExecutionProvider = (
  options: CreateNodeGraphExecutionProviderOptions
): ExecutionProvider => {
  let jobSequence = 0;

  return Object.freeze({
    descriptor,
    start: async (request): Promise<ExecutionJob> => {
      const compatibility = getExecutionProviderCompatibility(
        descriptor,
        request
      );
      if (!compatibility.compatible) {
        throw new TypeError(
          'The NodeGraph execution provider cannot satisfy this request.'
        );
      }

      const documentId = resolveDocumentId(request);
      const cancellation = {
        aborted: false,
        reason: undefined as unknown,
      };
      const controller: ExecutionJobController = createExecutionJobController({
        jobId:
          options.createJobId?.(request) ??
          `nodegraph:${request.requestId}:${++jobSequence}`,
        request,
        provider: descriptor,
        ...(options.now ? { now: options.now } : {}),
        requestCancellation: ({ reason }) => {
          cancellation.aborted = true;
          cancellation.reason = reason ?? 'NodeGraph execution was cancelled.';
          return 'accepted';
        },
      });

      const publishTrace = (event: NodeGraphTraceEvent): void => {
        if (!isRunnable(controller)) return;
        const sourceTrace = traceSource(documentId, event);
        const detail = toExecutionValue(event.detail);
        controller.emitTrace({
          traceId: controller.job.id,
          spanId: `${controller.job.id}:${event.sequence}`,
          name: event.kind,
          phase: tracePhase(event),
          detail,
          sourceTrace,
        });
        if (event.kind === 'log') {
          const value = toExecutionValue(event.detail.value);
          controller.emitLog({
            stream: 'console',
            level: 'info',
            message: formatLogValue(value),
            data: value,
            sourceTrace,
          });
        }
      };

      const execute = async (): Promise<void> => {
        if (cancellation.aborted) {
          controller.finishCancelled(String(cancellation.reason));
          return;
        }
        if (!isRunnable(controller)) return;
        controller.markStarting();
        try {
          const graph = await options.resolveDocument(request);
          if (cancellation.aborted) {
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          if (!isRunnable(controller)) return;
          controller.markRunning();
          const invocation = readInvocationInput(request);
          const result = await createNodeGraphExecutor({
            ...options.executor,
            onTrace: publishTrace,
          })(graph, {
            documentId,
            requestId: request.requestId,
            source: {
              ownerId:
                request.metadata?.sourceOwnerId ??
                (request.invocation.targetRef.kind === 'nodegraph-node'
                  ? request.invocation.targetRef.nodeId
                  : documentId),
              trigger: request.metadata?.trigger ?? 'manual',
              eventKey: request.metadata?.eventKey ?? 'run',
            },
            params: invocation.params,
            input: invocation.input,
            signal: cancellation,
          });
          if (
            !isExecutionJobTerminalStatus(
              controller.job.getSnapshot().status
            ) &&
            (result.status === 'cancelled' || cancellation.aborted)
          ) {
            controller.finishCancelled(
              String(
                cancellation.reason ?? 'NodeGraph execution was cancelled.'
              )
            );
            return;
          }
          if (!isRunnable(controller)) return;
          if (result.status === 'completed') {
            controller.succeed({
              output: Object.freeze({
                status: 'completed',
                steps: result.steps,
                statePatch: toExecutionRecord(result.statePatch),
                ...(result.output === undefined
                  ? {}
                  : { output: toExecutionValue(result.output) }),
              }),
            });
            return;
          }
          const lastNodeId = [...result.trace]
            .reverse()
            .map((event) => event.detail.nodeId)
            .find(
              (nodeId): nodeId is string =>
                typeof nodeId === 'string' && Boolean(nodeId.trim())
            );
          const message = failureMessage(result.status);
          controller.emitDiagnostic({
            code:
              result.status === 'unsupported-node' ? 'NGR-1001' : 'NGR-4001',
            severity: 'error',
            domain: 'nodegraph',
            message,
            retryable: false,
            targetRef: lastNodeId
              ? { kind: 'nodegraph-node', documentId, nodeId: lastNodeId }
              : { kind: 'document', documentId },
            meta: {
              status: result.status,
              steps: result.steps,
              documentId,
              runId: controller.job.id,
            },
          });
          controller.fail({
            code: `NODEGRAPH_${result.status.toUpperCase().replaceAll('-', '_')}`,
            message,
            retryable: false,
            details: {
              status: result.status,
              steps: result.steps,
            },
          });
        } catch (error) {
          if (
            cancellation.aborted &&
            !isExecutionJobTerminalStatus(controller.job.getSnapshot().status)
          ) {
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          if (!isRunnable(controller)) return;
          const message =
            error instanceof Error ? error.message : String(error);
          controller.emitDiagnostic({
            code: 'NGR-9001',
            severity: 'error',
            domain: 'nodegraph',
            message,
            retryable: true,
            targetRef: { kind: 'document', documentId },
            meta: { documentId, runId: controller.job.id },
          });
          controller.fail({
            code: 'NODEGRAPH_EXECUTION_FAILED',
            message,
            retryable: true,
          });
        }
      };

      const cancelTimeout =
        request.timeoutMs === undefined
          ? undefined
          : (options.scheduleTimeout ?? scheduleHostTimeout)(() => {
              if (!isRunnable(controller)) return;
              cancellation.aborted = true;
              cancellation.reason = `NodeGraph execution timed out after ${request.timeoutMs}ms.`;
              controller.finishTimedOut(request.timeoutMs);
            }, request.timeoutMs);
      if (cancelTimeout) {
        void controller.job.completion.finally(cancelTimeout);
      }
      void Promise.resolve().then(execute);
      return controller.job;
    },
  });
};
