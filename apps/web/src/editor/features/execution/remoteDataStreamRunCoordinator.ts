import {
  EXECUTION_DATA_STREAM_BRIDGE_LIMITS,
  EXECUTION_NETWORK_TRACE_NAME,
  toExecutionDataStreamEventMessage,
  toExecutionDataStreamOpenMessage,
  toExecutionDataStreamTerminalMessage,
  toExecutionNetworkTraceValue,
  type ExecutionDataStreamBridgeMessage,
  type ExecutionDataStreamCancellation,
  type ExecutionDataStreamOpenRequest,
  type ExecutionDataStreamPull,
  type ExecutionSessionTracePublication,
  type PublishExecutionSessionTraceInput,
} from '@prodivix/runtime-core';
import { isRemoteDataGatewaySafeErrorCode } from './remoteDataGatewayClient';
import type {
  RemoteDataStreamGatewayClient,
  RemoteDataStreamGatewaySession,
} from './remoteDataStreamGatewayClient';

export type RemoteDataStreamRunActivation = Readonly<{
  executionId: string;
  jobId: string;
  sessionId: string;
  open: RemoteDataStreamGatewayClient['open'];
}>;

export type RemoteDataStreamRunCoordinator = Readonly<{
  activate(activation: RemoteDataStreamRunActivation): number;
  deactivate(expectedJobId?: string): boolean;
  hasActiveJob(jobId: string): boolean;
  open(
    request: ExecutionDataStreamOpenRequest,
    publish: (message: ExecutionDataStreamBridgeMessage) => void
  ): Promise<void>;
  pull(request: ExecutionDataStreamPull): Promise<boolean>;
  cancel(cancellation: ExecutionDataStreamCancellation): boolean;
}>;

type ActiveRun = RemoteDataStreamRunActivation &
  Readonly<{ generation: number }>;

type ActiveStream = {
  run: ActiveRun;
  request: ExecutionDataStreamOpenRequest;
  abort: AbortController;
  session?: RemoteDataStreamGatewaySession;
  unsubscribeNetwork?: () => void;
  cursor: number;
  pending: boolean;
  publish(message: ExecutionDataStreamBridgeMessage): void;
};

const identifier = (value: string, label: string): string => {
  if (!value || value !== value.trim() || value.includes('\0'))
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const failureMessage = (
  request: ExecutionDataStreamOpenRequest,
  error: unknown
): ExecutionDataStreamBridgeMessage => {
  const candidate =
    error && typeof error === 'object'
      ? (error as { code?: unknown; retryable?: unknown })
      : undefined;
  const code = isRemoteDataGatewaySafeErrorCode(candidate?.code)
    ? candidate.code
    : 'DATA_REMOTE_GATEWAY_UNAVAILABLE';
  return toExecutionDataStreamTerminalMessage(request, {
    phase: 'error',
    code,
    retryable: candidate?.retryable === true,
  });
};

/**
 * Owns active Remote stream identity, exact Preview generation fencing, and
 * publication of only the sanitized opening Network trace into the Session.
 */
export const createRemoteDataStreamRunCoordinator = (options: {
  publishTrace(
    input: PublishExecutionSessionTraceInput
  ): ExecutionSessionTracePublication;
}): RemoteDataStreamRunCoordinator => {
  let generation = 0;
  let active: ActiveRun | undefined;
  const streams = new Map<string, ActiveStream>();

  const advanceGeneration = (): number => {
    if (generation >= Number.MAX_SAFE_INTEGER)
      throw new Error('Remote Data stream generation budget is exhausted.');
    generation += 1;
    return generation;
  };
  const current = (run: ActiveRun): boolean =>
    active === run && generation === run.generation;
  const release = (stream: ActiveStream): void => {
    stream.unsubscribeNetwork?.();
    stream.unsubscribeNetwork = undefined;
    if (streams.get(stream.request.requestId) === stream)
      streams.delete(stream.request.requestId);
  };
  const terminate = (stream: ActiveStream): void => {
    stream.abort.abort();
    stream.session?.close();
    release(stream);
  };
  const closeAll = (): void => {
    for (const stream of streams.values()) {
      stream.unsubscribeNetwork?.();
      stream.unsubscribeNetwork = undefined;
      stream.abort.abort();
      stream.session?.close();
    }
    streams.clear();
  };
  const publishNetworkTrace = (
    stream: ActiveStream,
    network: RemoteDataStreamGatewaySession['network']
  ): boolean => {
    if (
      !current(stream.run) ||
      streams.get(stream.request.requestId) !== stream
    )
      return false;
    let publication: ExecutionSessionTracePublication;
    try {
      publication = options.publishTrace({
        sessionId: stream.run.sessionId,
        jobId: stream.run.jobId,
        observedAt: network.completedAt,
        trace: {
          traceId: `network:${stream.run.jobId}`,
          spanId: network.requestId,
          name: EXECUTION_NETWORK_TRACE_NAME,
          phase: 'event',
          detail: toExecutionNetworkTraceValue(network),
          ...(network.sourceTrace ? { sourceTrace: network.sourceTrace } : {}),
        },
      });
    } catch {
      return false;
    }
    return (
      current(stream.run) &&
      streams.get(stream.request.requestId) === stream &&
      publication.status !== 'session-not-found' &&
      publication.status !== 'stale-job' &&
      publication.status !== 'conflict'
    );
  };

  return Object.freeze({
    activate(activation) {
      closeAll();
      const next = advanceGeneration();
      active = Object.freeze({
        executionId: identifier(activation.executionId, 'Remote execution id'),
        jobId: identifier(activation.jobId, 'Remote execution job id'),
        sessionId: identifier(
          activation.sessionId,
          'Remote execution session id'
        ),
        open: activation.open,
        generation: next,
      });
      return next;
    },
    deactivate(expectedJobId) {
      if (!active) return false;
      if (expectedJobId !== undefined && active.jobId !== expectedJobId)
        return false;
      active = undefined;
      closeAll();
      advanceGeneration();
      return true;
    },
    hasActiveJob(jobId) {
      return active?.jobId === jobId;
    },
    async open(request, publish) {
      const run = active;
      if (!run) {
        publish(
          toExecutionDataStreamTerminalMessage(request, {
            phase: 'error',
            code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
            retryable: true,
          })
        );
        return;
      }
      if (streams.has(request.requestId)) {
        publish(
          toExecutionDataStreamTerminalMessage(request, {
            phase: 'error',
            code: 'DATA_STREAM_CONFLICT',
            retryable: false,
          })
        );
        return;
      }
      if (
        streams.size >= EXECUTION_DATA_STREAM_BRIDGE_LIMITS.maxActiveStreams
      ) {
        publish(
          toExecutionDataStreamTerminalMessage(request, {
            phase: 'error',
            code: 'DATA_STREAM_CAPACITY',
            retryable: true,
          })
        );
        return;
      }
      const stream: ActiveStream = {
        run,
        request,
        abort: new AbortController(),
        cursor: 0,
        pending: false,
        publish,
      };
      streams.set(request.requestId, stream);
      try {
        stream.session = await run.open(
          run.executionId,
          request,
          stream.abort.signal
        );
        if (!current(run) || streams.get(request.requestId) !== stream) {
          stream.session.close();
          return;
        }
        stream.unsubscribeNetwork = stream.session.subscribeNetwork(
          (network) => {
            if (publishNetworkTrace(stream, network)) return;
            if (current(run) && streams.get(request.requestId) === stream) {
              publish(
                toExecutionDataStreamTerminalMessage(request, {
                  phase: 'error',
                  code: 'DATA_REMOTE_GATEWAY_INVALID',
                  retryable: false,
                })
              );
              terminate(stream);
            }
          }
        );
        if (!publishNetworkTrace(stream, stream.session.network)) {
          publish(
            toExecutionDataStreamTerminalMessage(request, {
              phase: 'error',
              code: 'DATA_REMOTE_GATEWAY_INVALID',
              retryable: false,
            })
          );
          terminate(stream);
          return;
        }
        publish(
          toExecutionDataStreamOpenMessage(request, stream.session.network)
        );
      } catch (error) {
        if (current(run) && streams.get(request.requestId) === stream) {
          publish(failureMessage(request, error));
          terminate(stream);
        }
      }
    },
    async pull(request) {
      const stream = streams.get(request.requestId);
      if (!stream || !current(stream.run)) return false;
      if (!stream.session || request.cursor !== stream.cursor) {
        stream.publish(
          toExecutionDataStreamTerminalMessage(stream.request, {
            phase: 'error',
            code: 'DATA_REMOTE_GATEWAY_INVALID',
            retryable: false,
          })
        );
        terminate(stream);
        return false;
      }
      if (stream.pending) {
        stream.publish(
          toExecutionDataStreamTerminalMessage(stream.request, {
            phase: 'error',
            code: 'DATA_STREAM_CONFLICT',
            retryable: false,
          })
        );
        terminate(stream);
        return false;
      }
      stream.pending = true;
      try {
        const event = await stream.session.next();
        if (!current(stream.run) || streams.get(request.requestId) !== stream)
          return false;
        if (!event) {
          stream.publish(
            toExecutionDataStreamTerminalMessage(stream.request, {
              phase: 'complete',
              cursor: stream.cursor,
            })
          );
          terminate(stream);
          return true;
        }
        if (event.cursor !== stream.cursor + 1) {
          stream.publish(
            toExecutionDataStreamTerminalMessage(stream.request, {
              phase: 'error',
              code: 'DATA_REMOTE_GATEWAY_INVALID',
              retryable: false,
            })
          );
          terminate(stream);
          return false;
        }
        stream.cursor = event.cursor;
        stream.publish(
          toExecutionDataStreamEventMessage(
            stream.request,
            event.cursor,
            event.value
          )
        );
        return true;
      } catch (error) {
        if (current(stream.run) && streams.get(request.requestId) === stream) {
          stream.publish(failureMessage(stream.request, error));
          terminate(stream);
        }
        return false;
      } finally {
        stream.pending = false;
      }
    },
    cancel(cancellation) {
      const stream = streams.get(cancellation.requestId);
      if (!stream || !current(stream.run)) return false;
      streams.delete(cancellation.requestId);
      stream.unsubscribeNetwork?.();
      stream.unsubscribeNetwork = undefined;
      stream.abort.abort();
      stream.session?.close();
      return true;
    },
  });
};
