import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  ExecutionArtifact,
  ExecutionCancellationRequest,
  ExecutionCancellationResult,
  ExecutionFailure,
  ExecutionJob,
  ExecutionJobArtifactEvent,
  ExecutionJobCancelledResult,
  ExecutionJobDiagnosticEvent,
  ExecutionJobEvent,
  ExecutionJobEventListener,
  ExecutionJobFailedResult,
  ExecutionJobLogEvent,
  ExecutionJobResult,
  ExecutionJobSnapshot,
  ExecutionJobStateEvent,
  ExecutionJobStatus,
  ExecutionJobSucceededResult,
  ExecutionJobTimedOutResult,
  ExecutionJobTraceEvent,
  ExecutionLogRecord,
  ExecutionProviderDescriptor,
  ExecutionRequest,
  ExecutionSourceTrace,
  ExecutionTraceRecord,
  ExecutionValue,
} from './execution.types';
import { cloneExecutionValue } from './executionRequest';
import { createExecutionLogRecord } from './executionConsole';

const terminalStatuses = new Set<ExecutionJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);

const allowedTransitions: Readonly<
  Record<ExecutionJobStatus, ReadonlySet<ExecutionJobStatus>>
> = {
  queued: new Set([
    'starting',
    'running',
    'cancelling',
    'failed',
    'cancelled',
    'timed-out',
  ]),
  starting: new Set([
    'running',
    'cancelling',
    'failed',
    'cancelled',
    'timed-out',
  ]),
  running: new Set([
    'cancelling',
    'succeeded',
    'failed',
    'cancelled',
    'timed-out',
  ]),
  cancelling: new Set(['succeeded', 'failed', 'cancelled', 'timed-out']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  'timed-out': new Set(),
};

export const isExecutionJobTerminalStatus = (
  status: ExecutionJobStatus
): boolean => terminalStatuses.has(status);

export const canTransitionExecutionJob = (
  from: ExecutionJobStatus,
  to: ExecutionJobStatus
): boolean => allowedTransitions[from].has(to);

export class ExecutionJobTransitionError extends Error {
  readonly from: ExecutionJobStatus;
  readonly to: ExecutionJobStatus;

  constructor(from: ExecutionJobStatus, to: ExecutionJobStatus) {
    super(`Execution job cannot transition from ${from} to ${to}.`);
    this.name = 'ExecutionJobTransitionError';
    this.from = from;
    this.to = to;
  }
}

export type ExecutionCancellationHandler = (
  request: ExecutionCancellationRequest
) =>
  | 'accepted'
  | 'unsupported'
  | void
  | Promise<'accepted' | 'unsupported' | void>;

export type CreateExecutionJobControllerInput = Readonly<{
  jobId: string;
  request: ExecutionRequest;
  provider: ExecutionProviderDescriptor;
  now?: () => number;
  requestCancellation?: ExecutionCancellationHandler;
  onSubscriberError?: (error: unknown) => void;
}>;

export type ExecutionJobController = Readonly<{
  job: ExecutionJob;
  markStarting(): ExecutionJobSnapshot;
  markRunning(): ExecutionJobSnapshot;
  markCancelling(reason?: string): ExecutionJobSnapshot;
  emitLog(log: ExecutionLogRecord): ExecutionJobLogEvent;
  emitDiagnostic(diagnostic: ProdivixDiagnostic): ExecutionJobDiagnosticEvent;
  emitArtifact(artifact: ExecutionArtifact): ExecutionJobArtifactEvent;
  emitTrace(trace: ExecutionTraceRecord): ExecutionJobTraceEvent;
  succeed(
    result?: Readonly<{ output?: ExecutionValue; exitCode?: number }>
  ): ExecutionJobSucceededResult;
  fail(
    failure: ExecutionFailure,
    result?: Readonly<{ exitCode?: number }>
  ): ExecutionJobFailedResult;
  finishCancelled(reason?: string): ExecutionJobCancelledResult;
  finishTimedOut(timeoutMs?: number): ExecutionJobTimedOutResult;
}>;

type Subscriber = {
  active: boolean;
  delivering: boolean;
  listener: ExecutionJobEventListener;
  queue: ExecutionJobEvent[];
};

const normalizeId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  return normalized;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const freezeSourceTrace = (
  sourceTrace: readonly ExecutionSourceTrace[] | undefined
): readonly ExecutionSourceTrace[] | undefined =>
  sourceTrace
    ? Object.freeze(
        sourceTrace.map((trace) =>
          Object.freeze({
            ...trace,
            sourceRef: Object.freeze({ ...trace.sourceRef }),
            ...(trace.sourceSpan
              ? { sourceSpan: Object.freeze({ ...trace.sourceSpan }) }
              : {}),
          })
        )
      )
    : undefined;

/**
 * Creates the provider-facing half of an ExecutionJob. Adapters emit through
 * the controller while consumers only receive the immutable job interface.
 * State transition, event ordering, replay, and terminal settlement therefore
 * remain identical for browser and remote providers.
 */
export const createExecutionJobController = (
  input: CreateExecutionJobControllerInput
): ExecutionJobController => {
  const jobId = normalizeId(input.jobId, 'Execution jobId');
  const requestId = normalizeId(input.request.requestId, 'Execution requestId');
  if (requestId !== input.request.requestId) {
    throw new TypeError('Execution requestId must be normalized.');
  }
  if (input.provider.id !== input.provider.id.trim() || !input.provider.id) {
    throw new TypeError('Execution provider id must be normalized.');
  }
  if (
    input.provider.capabilities.includes('cancellation') !==
    Boolean(input.requestCancellation)
  ) {
    throw new TypeError(
      'Execution cancellation capability and handler must be declared together.'
    );
  }

  let lastTimestamp = Number.NEGATIVE_INFINITY;
  const readTimestamp = (): number => {
    const value = (input.now ?? Date.now)();
    if (!Number.isFinite(value)) {
      throw new TypeError('Execution clock must return a finite timestamp.');
    }
    lastTimestamp = Math.max(lastTimestamp, value);
    return lastTimestamp;
  };

  const createdAt = readTimestamp();
  let sequence = 0;
  let snapshot: ExecutionJobSnapshot = Object.freeze({
    jobId,
    requestId,
    providerId: input.provider.id,
    status: 'queued',
    latestEventSequence: sequence,
    createdAt,
  });
  const history: ExecutionJobEvent[] = [];
  const subscribers = new Set<Subscriber>();
  const diagnostics: ProdivixDiagnostic[] = [];
  const artifacts: ExecutionArtifact[] = [];
  let cancellationState: 'idle' | 'pending' | 'accepted' = 'idle';
  let resolveCompletion: (result: ExecutionJobResult) => void = () => undefined;
  const completion = new Promise<ExecutionJobResult>((resolve) => {
    resolveCompletion = resolve;
  });

  const reportSubscriberError = (error: unknown): void => {
    try {
      input.onSubscriberError?.(error);
    } catch {
      // Subscriber error reporting is observational and cannot alter a job.
    }
  };

  const drainSubscriber = (subscriber: Subscriber): void => {
    if (!subscriber.active || subscriber.delivering) return;
    subscriber.delivering = true;
    try {
      while (subscriber.active && subscriber.queue.length) {
        const event = subscriber.queue.shift();
        if (!event) continue;
        try {
          subscriber.listener(event);
        } catch (error) {
          reportSubscriberError(error);
        }
      }
    } finally {
      subscriber.delivering = false;
    }
  };

  const commitEvent = <Event extends ExecutionJobEvent>(
    event: Event
  ): Event => {
    history.push(event);
    subscribers.forEach((subscriber) => {
      subscriber.queue.push(event);
      drainSubscriber(subscriber);
    });
    return event;
  };

  const publishInitialState = (): void => {
    sequence += 1;
    snapshot = Object.freeze({
      ...snapshot,
      latestEventSequence: sequence,
    });
    commitEvent(
      Object.freeze({
        kind: 'state',
        jobId,
        sequence,
        emittedAt: createdAt,
        snapshot,
      }) satisfies ExecutionJobStateEvent
    );
  };

  const transition = (
    status: ExecutionJobStatus,
    reason?: string
  ): ExecutionJobSnapshot => {
    const previousStatus = snapshot.status;
    if (!canTransitionExecutionJob(previousStatus, status)) {
      throw new ExecutionJobTransitionError(previousStatus, status);
    }
    const emittedAt = readTimestamp();
    sequence += 1;
    snapshot = Object.freeze({
      ...snapshot,
      status,
      latestEventSequence: sequence,
      ...(snapshot.startedAt === undefined &&
      (status === 'starting' || status === 'running')
        ? { startedAt: emittedAt }
        : {}),
      ...(status === 'cancelling'
        ? { cancellationRequestedAt: emittedAt }
        : {}),
      ...(isExecutionJobTerminalStatus(status)
        ? { completedAt: emittedAt }
        : {}),
    });
    commitEvent(
      Object.freeze({
        kind: 'state',
        jobId,
        sequence,
        emittedAt,
        previousStatus,
        snapshot,
        ...(reason ? { reason } : {}),
      }) satisfies ExecutionJobStateEvent
    );
    return snapshot;
  };

  const publishEvent = <
    Event extends
      | ExecutionJobLogEvent
      | ExecutionJobDiagnosticEvent
      | ExecutionJobArtifactEvent
      | ExecutionJobTraceEvent,
  >(
    body: Omit<Event, 'jobId' | 'sequence' | 'emittedAt'>
  ): Event => {
    if (isExecutionJobTerminalStatus(snapshot.status)) {
      throw new ExecutionJobTransitionError(snapshot.status, snapshot.status);
    }
    const emittedAt = readTimestamp();
    sequence += 1;
    snapshot = Object.freeze({
      ...snapshot,
      latestEventSequence: sequence,
    });
    return commitEvent(
      Object.freeze({
        ...body,
        jobId,
        sequence,
        emittedAt,
      }) as Event
    );
  };

  const assertCanPublish = (): void => {
    if (isExecutionJobTerminalStatus(snapshot.status)) {
      throw new ExecutionJobTransitionError(snapshot.status, snapshot.status);
    }
  };

  const resultBase = () => {
    if (snapshot.completedAt === undefined) {
      throw new Error('Execution result requires a terminal job snapshot.');
    }
    return {
      jobId,
      requestId,
      providerId: input.provider.id,
      createdAt,
      ...(snapshot.startedAt === undefined
        ? {}
        : { startedAt: snapshot.startedAt }),
      completedAt: snapshot.completedAt,
      diagnostics: Object.freeze([...diagnostics]),
      artifacts: Object.freeze([...artifacts]),
    } as const;
  };

  const readCurrentStatus = (): ExecutionJobStatus => snapshot.status;

  const settle = <Result extends ExecutionJobResult>(
    result: Result
  ): Result => {
    resolveCompletion(result);
    return result;
  };

  const cancel = async (
    request: ExecutionCancellationRequest = {}
  ): Promise<ExecutionCancellationResult> => {
    if (isExecutionJobTerminalStatus(snapshot.status)) {
      return Object.freeze({ status: 'already-terminal' });
    }
    if (snapshot.status === 'cancelling' || cancellationState !== 'idle') {
      return Object.freeze({ status: 'already-requested' });
    }
    if (!input.requestCancellation) {
      return Object.freeze({ status: 'unsupported' });
    }

    cancellationState = 'pending';
    try {
      const disposition = await input.requestCancellation(
        Object.freeze({ ...(request.reason ? { reason: request.reason } : {}) })
      );
      if (disposition === 'unsupported') {
        cancellationState = 'idle';
        return Object.freeze({ status: 'unsupported' });
      }
      cancellationState = 'accepted';
      const currentStatus = readCurrentStatus();
      if (
        !isExecutionJobTerminalStatus(currentStatus) &&
        currentStatus !== 'cancelling'
      ) {
        transition('cancelling', request.reason);
      }
      return Object.freeze({ status: 'accepted' });
    } catch (error) {
      cancellationState = 'idle';
      return Object.freeze({
        status: 'rejected',
        reason: errorMessage(error),
      });
    }
  };

  publishInitialState();

  const job: ExecutionJob = Object.freeze({
    id: jobId,
    request: input.request,
    provider: input.provider,
    getSnapshot: () => snapshot,
    subscribe: (listener, options = {}) => {
      const afterSequence = options.afterSequence ?? 0;
      if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
        throw new TypeError(
          'Execution event afterSequence must be a non-negative safe integer.'
        );
      }
      const subscriber: Subscriber = {
        active: true,
        delivering: false,
        listener,
        queue: history.filter((event) => event.sequence > afterSequence),
      };
      subscribers.add(subscriber);
      drainSubscriber(subscriber);
      return () => {
        subscriber.active = false;
        subscriber.queue.length = 0;
        subscribers.delete(subscriber);
      };
    },
    completion,
    cancel,
  });

  return Object.freeze({
    job,
    markStarting: () => transition('starting'),
    markRunning: () => transition('running'),
    markCancelling: (reason) => transition('cancelling', reason),
    emitLog: (log) =>
      publishEvent<ExecutionJobLogEvent>({
        kind: 'log',
        log: createExecutionLogRecord(log),
      }),
    emitDiagnostic: (diagnostic) => {
      assertCanPublish();
      const immutableDiagnostic = Object.freeze({ ...diagnostic });
      diagnostics.push(immutableDiagnostic);
      return publishEvent<ExecutionJobDiagnosticEvent>({
        kind: 'diagnostic',
        diagnostic: immutableDiagnostic,
      });
    },
    emitArtifact: (artifact) => {
      assertCanPublish();
      const immutableArtifact = Object.freeze({
        ...artifact,
        ...(artifact.sourceTrace
          ? { sourceTrace: freezeSourceTrace(artifact.sourceTrace) }
          : {}),
        ...(artifact.metadata
          ? { metadata: Object.freeze({ ...artifact.metadata }) }
          : {}),
      });
      artifacts.push(immutableArtifact);
      return publishEvent<ExecutionJobArtifactEvent>({
        kind: 'artifact',
        artifact: immutableArtifact,
      });
    },
    emitTrace: (trace) =>
      publishEvent<ExecutionJobTraceEvent>({
        kind: 'trace',
        trace: Object.freeze({
          ...trace,
          ...(trace.detail === undefined
            ? {}
            : { detail: cloneExecutionValue(trace.detail) }),
          ...(trace.sourceTrace
            ? { sourceTrace: freezeSourceTrace(trace.sourceTrace) }
            : {}),
        }),
      }),
    succeed: (result = {}) => {
      transition('succeeded');
      return settle(
        Object.freeze({
          ...resultBase(),
          status: 'succeeded',
          ...(result.output === undefined
            ? {}
            : { output: cloneExecutionValue(result.output) }),
          ...(result.exitCode === undefined
            ? {}
            : { exitCode: result.exitCode }),
        }) satisfies ExecutionJobSucceededResult
      );
    },
    fail: (failure, result = {}) => {
      transition('failed', failure.message);
      return settle(
        Object.freeze({
          ...resultBase(),
          status: 'failed',
          failure: Object.freeze({
            ...failure,
            ...(failure.details
              ? {
                  details: Object.freeze(
                    Object.fromEntries(
                      Object.entries(failure.details).map(([key, value]) => [
                        key,
                        cloneExecutionValue(value),
                      ])
                    )
                  ),
                }
              : {}),
            ...(failure.sourceTrace
              ? { sourceTrace: freezeSourceTrace(failure.sourceTrace) }
              : {}),
          }),
          ...(result.exitCode === undefined
            ? {}
            : { exitCode: result.exitCode }),
        }) satisfies ExecutionJobFailedResult
      );
    },
    finishCancelled: (reason) => {
      transition('cancelled', reason);
      return settle(
        Object.freeze({
          ...resultBase(),
          status: 'cancelled',
          ...(reason ? { reason } : {}),
        }) satisfies ExecutionJobCancelledResult
      );
    },
    finishTimedOut: (timeoutMs) => {
      if (
        timeoutMs !== undefined &&
        (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
      ) {
        throw new TypeError(
          'Execution timeoutMs must be a positive safe integer.'
        );
      }
      transition('timed-out');
      return settle(
        Object.freeze({
          ...resultBase(),
          status: 'timed-out',
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        }) satisfies ExecutionJobTimedOutResult
      );
    },
  });
};
