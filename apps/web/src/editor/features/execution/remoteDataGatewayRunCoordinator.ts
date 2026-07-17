import {
  EXECUTION_NETWORK_TRACE_NAME,
  toExecutionDataGatewayBridgeFailure,
  toExecutionDataGatewayBridgeSuccess,
  toExecutionNetworkTraceValue,
  type ExecutionDataGatewayBridgeRequest,
  type ExecutionDataGatewayBridgeResponse,
  type ExecutionSessionTracePublication,
  type PublishExecutionSessionTraceInput,
} from '@prodivix/runtime-core';
import {
  isRemoteDataGatewaySafeErrorCode,
  type RemoteDataGatewayClient,
} from './remoteDataGatewayClient';

export type RemoteDataGatewayRunActivation = Readonly<{
  executionId: string;
  jobId: string;
  sessionId: string;
  invoke: RemoteDataGatewayClient['invoke'];
}>;

export type RemoteDataGatewayRunCoordinator = Readonly<{
  activate(activation: RemoteDataGatewayRunActivation): number;
  deactivate(expectedJobId?: string): boolean;
  hasActiveJob(jobId: string): boolean;
  execute(
    request: ExecutionDataGatewayBridgeRequest
  ): Promise<ExecutionDataGatewayBridgeResponse>;
}>;

const identifier = (value: string, label: string): string => {
  if (!value || value !== value.trim() || value.includes('\0'))
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const safeGatewayFailure = (
  request: ExecutionDataGatewayBridgeRequest,
  error: unknown
): ExecutionDataGatewayBridgeResponse => {
  const candidate =
    error && typeof error === 'object'
      ? (error as { code?: unknown; retryable?: unknown })
      : undefined;
  const code = isRemoteDataGatewaySafeErrorCode(candidate?.code)
    ? candidate.code
    : 'DATA_REMOTE_GATEWAY_UNAVAILABLE';
  return toExecutionDataGatewayBridgeFailure(
    request.requestId,
    code,
    candidate?.retryable === true
  );
};

/**
 * Fences iframe Remote Data requests to one preview generation and publishes
 * only normalized Network metadata into its stable product Session. The
 * finite Remote Preview Job remains terminal and is never reopened or mutated.
 */
export const createRemoteDataGatewayRunCoordinator = (options: {
  publishTrace(
    input: PublishExecutionSessionTraceInput
  ): ExecutionSessionTracePublication;
}): RemoteDataGatewayRunCoordinator => {
  let generation = 0;
  let active:
    | (RemoteDataGatewayRunActivation & Readonly<{ generation: number }>)
    | undefined;

  const advanceGeneration = (): number => {
    if (generation >= Number.MAX_SAFE_INTEGER)
      throw new Error('Remote Data gateway generation budget is exhausted.');
    generation += 1;
    return generation;
  };

  const current = (
    candidate: RemoteDataGatewayRunActivation & Readonly<{ generation: number }>
  ): boolean => active === candidate && generation === candidate.generation;

  return Object.freeze({
    activate: (activation) => {
      const next = advanceGeneration();
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
    deactivate: (expectedJobId) => {
      if (!active) return false;
      if (expectedJobId !== undefined && active.jobId !== expectedJobId)
        return false;
      active = undefined;
      advanceGeneration();
      return true;
    },
    hasActiveJob: (jobId) => active?.jobId === jobId,
    execute: async (request) => {
      const run = active;
      if (!run)
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_UNAVAILABLE',
          true
        );
      let result: Awaited<ReturnType<RemoteDataGatewayClient['invoke']>>;
      try {
        result = await run.invoke(run.executionId, request);
      } catch (error) {
        return current(run)
          ? safeGatewayFailure(request, error)
          : toExecutionDataGatewayBridgeFailure(
              request.requestId,
              'DATA_REMOTE_GATEWAY_STALE'
            );
      }
      if (!current(run))
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_STALE'
        );
      let response: ExecutionDataGatewayBridgeResponse;
      try {
        response = toExecutionDataGatewayBridgeSuccess(request, result);
      } catch {
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_INVALID'
        );
      }
      if (!response.ok)
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_INVALID'
        );
      let publication: ExecutionSessionTracePublication;
      try {
        publication = options.publishTrace({
          sessionId: run.sessionId,
          jobId: run.jobId,
          observedAt: response.result.network.completedAt,
          trace: {
            traceId: `network:${run.jobId}`,
            spanId: response.result.network.requestId,
            name: EXECUTION_NETWORK_TRACE_NAME,
            phase: 'event',
            detail: toExecutionNetworkTraceValue(response.result.network),
          },
        });
      } catch {
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_INVALID'
        );
      }
      if (!current(run))
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_STALE'
        );
      if (
        publication.status === 'session-not-found' ||
        publication.status === 'stale-job'
      )
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_STALE'
        );
      if (publication.status === 'conflict')
        return toExecutionDataGatewayBridgeFailure(
          request.requestId,
          'DATA_REMOTE_GATEWAY_INVALID'
        );
      return response;
    },
  });
};
