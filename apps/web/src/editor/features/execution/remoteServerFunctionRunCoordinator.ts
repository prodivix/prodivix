import {
  createServerFunctionInvocationTrace,
  SERVER_FUNCTION_INVOCATION_TRACE_NAME,
  toExecutionServerFunctionBridgeFailure,
  toServerFunctionInvocationTraceValue,
  type ExecutionServerFunctionBridgeCancellation,
  type ExecutionServerFunctionBridgeRequest,
  type ExecutionServerFunctionBridgeResponse,
} from '@prodivix/server-runtime';
import type {
  ExecutionSessionTracePublication,
  PublishExecutionSessionTraceInput,
} from '@prodivix/runtime-core';
import {
  isRemoteServerFunctionSafeErrorCode,
  type RemoteServerFunctionGatewayClient,
} from './remoteServerFunctionGatewayClient';

export type RemoteServerFunctionRunActivation = Readonly<{
  executionId: string;
  jobId: string;
  sessionId: string;
  invoke: RemoteServerFunctionGatewayClient['invoke'];
}>;

export type RemoteServerFunctionRunCoordinator = Readonly<{
  activate(activation: RemoteServerFunctionRunActivation): number;
  deactivate(expectedJobId?: string): boolean;
  hasActiveJob(jobId: string): boolean;
  cancel(cancellation: ExecutionServerFunctionBridgeCancellation): boolean;
  execute(
    request: ExecutionServerFunctionBridgeRequest
  ): Promise<ExecutionServerFunctionBridgeResponse>;
}>;

const identifier = (value: string, label: string): string => {
  if (!value || value !== value.trim() || value.includes('\0')) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
};

const safeGatewayFailure = (
  request: ExecutionServerFunctionBridgeRequest,
  error: unknown,
  aborted: boolean
): ExecutionServerFunctionBridgeResponse => {
  if (aborted) {
    return toExecutionServerFunctionBridgeFailure(
      request.requestId,
      'SVR_CANCELLED'
    );
  }
  const candidate =
    error && typeof error === 'object'
      ? (error as { code?: unknown; retryable?: unknown })
      : undefined;
  return toExecutionServerFunctionBridgeFailure(
    request.requestId,
    isRemoteServerFunctionSafeErrorCode(candidate?.code)
      ? candidate.code
      : 'SVR_REMOTE_GATEWAY_UNAVAILABLE',
    candidate?.retryable === true
  );
};

/**
 * Fences authenticated Server Function calls to one exact Remote Preview
 * generation and publishes metadata-only completion observations to its exact
 * Session Job. A terminal finite Preview Job is retained, never reopened.
 */
export const createRemoteServerFunctionRunCoordinator = (options: {
  publishTrace(
    input: PublishExecutionSessionTraceInput
  ): ExecutionSessionTracePublication;
  now?: () => number;
}): RemoteServerFunctionRunCoordinator => {
  let generation = 0;
  let active:
    | (RemoteServerFunctionRunActivation & Readonly<{ generation: number }>)
    | undefined;
  const controllersByRequestId = new Map<
    string,
    Readonly<{ invocationId: string; controller: AbortController }>
  >();

  const abortActiveRequests = (): void => {
    controllersByRequestId.forEach(({ controller }) => controller.abort());
    controllersByRequestId.clear();
  };

  const advance = (): number => {
    if (generation >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Remote Server Function generation budget is exhausted.');
    }
    generation += 1;
    return generation;
  };

  const isCurrent = (
    run: RemoteServerFunctionRunActivation & Readonly<{ generation: number }>
  ): boolean => active === run && generation === run.generation;

  const complete = (
    run: RemoteServerFunctionRunActivation & Readonly<{ generation: number }>,
    request: ExecutionServerFunctionBridgeRequest,
    response: ExecutionServerFunctionBridgeResponse,
    startedAt: number
  ): ExecutionServerFunctionBridgeResponse => {
    if (!isCurrent(run)) {
      return toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR_REMOTE_GATEWAY_STALE'
      );
    }
    const completedAt = (options.now ?? Date.now)();
    let publication: ExecutionSessionTracePublication;
    try {
      const trace = createServerFunctionInvocationTrace({
        request,
        response,
        startedAt,
        completedAt,
      });
      publication = options.publishTrace({
        sessionId: run.sessionId,
        jobId: run.jobId,
        observedAt: completedAt,
        trace: {
          traceId: `server-function:${run.jobId}`,
          spanId: request.requestId,
          name: SERVER_FUNCTION_INVOCATION_TRACE_NAME,
          phase: 'event',
          detail: toServerFunctionInvocationTraceValue(trace),
          sourceTrace: [
            {
              sourceRef: {
                kind: 'code-artifact',
                artifactId: request.functionRef.artifactId,
              },
              label: `${request.functionRef.artifactId}#${request.functionRef.exportName}`,
            },
          ],
        },
      });
    } catch {
      return toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR_REMOTE_GATEWAY_INVALID'
      );
    }
    if (!isCurrent(run)) {
      return toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR_REMOTE_GATEWAY_STALE'
      );
    }
    if (
      publication.status === 'session-not-found' ||
      publication.status === 'stale-job'
    ) {
      return toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR_REMOTE_GATEWAY_STALE'
      );
    }
    if (publication.status === 'conflict') {
      return toExecutionServerFunctionBridgeFailure(
        request.requestId,
        'SVR_REMOTE_GATEWAY_INVALID'
      );
    }
    return response;
  };

  return Object.freeze({
    activate(activation) {
      abortActiveRequests();
      const next = advance();
      active = Object.freeze({
        executionId: identifier(activation.executionId, 'Remote execution id'),
        jobId: identifier(activation.jobId, 'Remote execution job id'),
        sessionId: identifier(
          activation.sessionId,
          'Remote execution session id'
        ),
        invoke: activation.invoke,
        generation: next,
      });
      return next;
    },
    deactivate(expectedJobId) {
      if (!active || (expectedJobId && active.jobId !== expectedJobId)) {
        return false;
      }
      abortActiveRequests();
      active = undefined;
      advance();
      return true;
    },
    hasActiveJob(jobId) {
      return active?.jobId === jobId;
    },
    cancel(cancellation) {
      const pending = controllersByRequestId.get(cancellation.requestId);
      if (!pending || pending.invocationId !== cancellation.invocationId) {
        return false;
      }
      pending.controller.abort();
      controllersByRequestId.delete(cancellation.requestId);
      return true;
    },
    async execute(request) {
      const run = active;
      if (!run) {
        return toExecutionServerFunctionBridgeFailure(
          request.requestId,
          'SVR_REMOTE_GATEWAY_UNAVAILABLE',
          true
        );
      }
      const previous = controllersByRequestId.get(request.requestId);
      previous?.controller.abort();
      const controller = new AbortController();
      const pending = Object.freeze({
        invocationId: request.invocationId,
        controller,
      });
      controllersByRequestId.set(request.requestId, pending);
      const startedAt = (options.now ?? Date.now)();
      try {
        const response = await run.invoke(
          run.executionId,
          request,
          controller.signal
        );
        return complete(run, request, response, startedAt);
      } catch (error) {
        if (!isCurrent(run)) {
          return toExecutionServerFunctionBridgeFailure(
            request.requestId,
            'SVR_REMOTE_GATEWAY_STALE'
          );
        }
        return complete(
          run,
          request,
          safeGatewayFailure(request, error, controller.signal.aborted),
          startedAt
        );
      } finally {
        if (controllersByRequestId.get(request.requestId) === pending) {
          controllersByRequestId.delete(request.requestId);
        }
      }
    },
  });
};
