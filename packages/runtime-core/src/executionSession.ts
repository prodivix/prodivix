import type {
  ExecutionCancellationRequest,
  ExecutionCancellationResult,
  ExecutionInvocationKind,
  ExecutionJob,
  ExecutionJobEvent,
  ExecutionJobResult,
  ExecutionJobStatus,
  ExecutionLogRecord,
  ExecutionProfile,
  ExecutionProviderCapability,
  ExecutionSourceTrace,
  ExecutionTraceRecord,
  ExecutionWorkspaceSnapshotRef,
  RuntimeZone,
} from './execution.types';
import { createExecutionLogRecord } from './executionConsole';
import { cloneExecutionValue } from './executionRequest';
import {
  EXECUTION_NETWORK_TRACE_NAME,
  readExecutionNetworkTraceValue,
  toExecutionNetworkTraceValue,
} from './executionNetworkTrace';

export type ExecutionSessionStatus = 'idle' | ExecutionJobStatus;

export type ExecutionSessionActiveJob = Readonly<{
  jobId: string;
  requestId: string;
  providerId: string;
  providerVersion: string;
  profile: ExecutionProfile;
  runtimeZone: RuntimeZone;
  invocationKind: ExecutionInvocationKind;
  capabilities: readonly ExecutionProviderCapability[];
  workspace: ExecutionWorkspaceSnapshotRef;
}>;

export type ExecutionSessionEventRecord = Readonly<{
  sessionId: string;
  jobId: string;
  requestId: string;
  providerId: string;
  workspaceId: string;
  snapshotId: string;
  event: ExecutionJobEvent;
}>;

export type ExecutionSessionTraceObservation = Readonly<{
  sessionId: string;
  jobId: string;
  requestId: string;
  providerId: string;
  workspaceId: string;
  snapshotId: string;
  sequence: number;
  observedAt: number;
  trace: ExecutionTraceRecord;
}>;

export type ExecutionSessionConsoleObservation = Readonly<{
  sessionId: string;
  jobId: string;
  requestId: string;
  providerId: string;
  workspaceId: string;
  snapshotId: string;
  observationId: string;
  sequence: number;
  observedAt: number;
  log: ExecutionLogRecord;
}>;

export type ExecutionSessionTerminal = Readonly<{
  jobId: string;
  requestId: string;
  providerId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'timed-out';
  completedAt: number;
  failure?: Readonly<{
    code: string;
    message: string;
    retryable?: boolean;
  }>;
  reason?: string;
  timeoutMs?: number;
}>;

export type PublishExecutionSessionTraceInput = Readonly<{
  sessionId: string;
  jobId: string;
  trace: ExecutionTraceRecord;
  observedAt?: number;
}>;

export type PublishExecutionSessionConsoleInput = Readonly<{
  sessionId: string;
  jobId: string;
  observationId: string;
  log: ExecutionLogRecord;
  observedAt?: number;
}>;

export type ExecutionSessionTracePublication =
  | Readonly<{
      status: 'published' | 'duplicate';
      observation: ExecutionSessionTraceObservation;
    }>
  | Readonly<{
      status: 'session-not-found' | 'stale-job' | 'conflict';
    }>;

export type ExecutionSessionConsolePublication =
  | Readonly<{
      status: 'published' | 'duplicate';
      observation: ExecutionSessionConsoleObservation;
    }>
  | Readonly<{
      status: 'session-not-found' | 'stale-job' | 'conflict';
    }>;

export type ExecutionSessionSnapshot = Readonly<{
  sessionId: string;
  label?: string;
  revision: number;
  status: ExecutionSessionStatus;
  activeJob?: ExecutionSessionActiveJob;
  terminal?: ExecutionSessionTerminal;
  events: readonly ExecutionSessionEventRecord[];
  observations: readonly ExecutionSessionTraceObservation[];
  consoleObservations: readonly ExecutionSessionConsoleObservation[];
  updatedAt?: number;
}>;

export type ActivateExecutionSessionInput = Readonly<{
  sessionId: string;
  job: ExecutionJob;
  label?: string;
  preserveEvents?: boolean;
}>;

export type ExecutionSessionCancellationResult =
  ExecutionCancellationResult | Readonly<{ status: 'session-not-found' }>;

export type ExecutionSessionListener = (
  sessionId: string,
  snapshot: ExecutionSessionSnapshot | undefined
) => void;

export type ExecutionSessionCoordinator = Readonly<{
  activate(input: ActivateExecutionSessionInput): ExecutionSessionSnapshot;
  getSnapshot(sessionId: string): ExecutionSessionSnapshot | undefined;
  listSnapshots(): readonly ExecutionSessionSnapshot[];
  subscribe(listener: ExecutionSessionListener): () => void;
  publishTrace(
    input: PublishExecutionSessionTraceInput
  ): ExecutionSessionTracePublication;
  publishConsole(
    input: PublishExecutionSessionConsoleInput
  ): ExecutionSessionConsolePublication;
  clearEvents(sessionId: string): ExecutionSessionSnapshot | undefined;
  cancel(
    sessionId: string,
    request?: ExecutionCancellationRequest
  ): Promise<ExecutionSessionCancellationResult>;
  remove(sessionId: string): boolean;
}>;

export type CreateExecutionSessionCoordinatorInput = Readonly<{
  maxEvents?: number;
  now?: () => number;
  onSubscriberError?: (error: unknown) => void;
}>;

type RetainedSessionRecord =
  | Readonly<{
      kind: 'job-event';
      record: ExecutionSessionEventRecord;
    }>
  | Readonly<{
      kind: 'trace-observation';
      record: ExecutionSessionTraceObservation;
    }>
  | Readonly<{
      kind: 'console-observation';
      record: ExecutionSessionConsoleObservation;
    }>;

type InternalSession = {
  job: ExecutionJob;
  snapshot: ExecutionSessionSnapshot;
  retained: readonly RetainedSessionRecord[];
  nextObservationSequence: number;
  unsubscribe: () => void;
};

const normalizeIdentifier = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  return normalized;
};

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

const freezeTrace = (trace: ExecutionTraceRecord): ExecutionTraceRecord => {
  const traceId = normalizeIdentifier(trace.traceId, 'Execution trace id');
  const spanId = normalizeIdentifier(trace.spanId, 'Execution trace span id');
  const name = normalizeIdentifier(trace.name, 'Execution trace name');
  const parentSpanId = trace.parentSpanId
    ? normalizeIdentifier(trace.parentSpanId, 'Execution trace parent span id')
    : undefined;
  if (!['start', 'event', 'end'].includes(trace.phase))
    throw new TypeError('Execution trace phase is invalid.');
  const network =
    name === EXECUTION_NETWORK_TRACE_NAME
      ? readExecutionNetworkTraceValue(trace.detail)
      : undefined;
  if (
    name === EXECUTION_NETWORK_TRACE_NAME &&
    (!network || trace.phase !== 'event' || network.requestId !== spanId)
  )
    throw new TypeError(
      'Execution session Network observation is not canonical.'
    );
  return Object.freeze({
    traceId,
    spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    name,
    phase: trace.phase,
    ...(network
      ? { detail: toExecutionNetworkTraceValue(network) }
      : trace.detail === undefined
        ? {}
        : { detail: cloneExecutionValue(trace.detail) }),
    ...(trace.sourceTrace
      ? { sourceTrace: freezeSourceTrace(trace.sourceTrace) }
      : {}),
  });
};

const projectRetained = (records: readonly RetainedSessionRecord[]) =>
  Object.freeze({
    events: Object.freeze(
      records.flatMap((entry) =>
        entry.kind === 'job-event' ? [entry.record] : []
      )
    ),
    observations: Object.freeze(
      records.flatMap((entry) =>
        entry.kind === 'trace-observation' ? [entry.record] : []
      )
    ),
    consoleObservations: Object.freeze(
      records.flatMap((entry) =>
        entry.kind === 'console-observation' ? [entry.record] : []
      )
    ),
  });

const createActiveJob = (job: ExecutionJob): ExecutionSessionActiveJob =>
  Object.freeze({
    jobId: job.id,
    requestId: job.request.requestId,
    providerId: job.provider.id,
    providerVersion: job.provider.version,
    profile: job.request.profile,
    runtimeZone: job.request.runtimeZone,
    invocationKind: job.request.invocation.kind,
    capabilities: Object.freeze([...job.provider.capabilities]),
    workspace: job.request.workspace,
  });

const createEventRecord = (
  sessionId: string,
  job: ExecutionJob,
  event: ExecutionJobEvent
): ExecutionSessionEventRecord =>
  Object.freeze({
    sessionId,
    jobId: job.id,
    requestId: job.request.requestId,
    providerId: job.provider.id,
    workspaceId: job.request.workspace.workspaceId,
    snapshotId: job.request.workspace.snapshotId,
    event,
  });

const createSessionTerminal = (
  result: ExecutionJobResult
): ExecutionSessionTerminal =>
  Object.freeze({
    jobId: result.jobId,
    requestId: result.requestId,
    providerId: result.providerId,
    status: result.status,
    completedAt: result.completedAt,
    ...(result.status === 'failed'
      ? {
          failure: Object.freeze({
            code: result.failure.code,
            message: result.failure.message,
            ...(result.failure.retryable === undefined
              ? {}
              : { retryable: result.failure.retryable }),
          }),
        }
      : {}),
    ...(result.status === 'cancelled' && result.reason
      ? { reason: result.reason }
      : {}),
    ...(result.status === 'timed-out' && result.timeoutMs !== undefined
      ? { timeoutMs: result.timeoutMs }
      : {}),
  });

/**
 * Composes long-lived product sessions from revision-bound jobs. The
 * coordinator retains only bounded observable execution events; canonical
 * Workspace data and provider processes remain owned by their existing owners.
 */
export const createExecutionSessionCoordinator = (
  input: CreateExecutionSessionCoordinatorInput = {}
): ExecutionSessionCoordinator => {
  const maxEvents = input.maxEvents ?? 500;
  if (!Number.isSafeInteger(maxEvents) || maxEvents <= 0) {
    throw new TypeError(
      'Execution session maxEvents must be a positive safe integer.'
    );
  }
  const sessions = new Map<string, InternalSession>();
  const listeners = new Set<ExecutionSessionListener>();

  const reportSubscriberError = (error: unknown): void => {
    try {
      input.onSubscriberError?.(error);
    } catch {
      // Observability hooks cannot alter session coordination.
    }
  };

  const publish = (
    sessionId: string,
    snapshot: ExecutionSessionSnapshot | undefined
  ): void => {
    listeners.forEach((listener) => {
      try {
        listener(sessionId, snapshot);
      } catch (error) {
        reportSubscriberError(error);
      }
    });
  };

  const readSession = (sessionId: string): InternalSession | undefined =>
    sessions.get(normalizeIdentifier(sessionId, 'Execution session id'));

  const retain = (
    session: InternalSession,
    record: RetainedSessionRecord
  ): ReturnType<typeof projectRetained> => {
    session.retained = Object.freeze(
      [...session.retained, record].slice(-maxEvents)
    );
    return projectRetained(session.retained);
  };

  const activate = (
    activation: ActivateExecutionSessionInput
  ): ExecutionSessionSnapshot => {
    const sessionId = normalizeIdentifier(
      activation.sessionId,
      'Execution session id'
    );
    const label =
      activation.label === undefined
        ? undefined
        : normalizeIdentifier(activation.label, 'Execution session label');
    const previous = sessions.get(sessionId);
    if (previous?.job === activation.job) {
      if (previous.snapshot.label === label || label === undefined) {
        return previous.snapshot;
      }
      previous.snapshot = Object.freeze({
        ...previous.snapshot,
        label,
        revision: previous.snapshot.revision + 1,
      });
      publish(sessionId, previous.snapshot);
      return previous.snapshot;
    }

    previous?.unsubscribe();
    const jobSnapshot = activation.job.getSnapshot();
    const replayBoundarySequence = jobSnapshot.latestEventSequence;
    const retained: readonly RetainedSessionRecord[] = Object.freeze(
      activation.preserveEvents === false ? [] : [...(previous?.retained ?? [])]
    );
    const projected = projectRetained(retained);
    const snapshot: ExecutionSessionSnapshot = Object.freeze({
      sessionId,
      ...(label
        ? { label }
        : previous?.snapshot.label
          ? { label: previous.snapshot.label }
          : {}),
      revision: (previous?.snapshot.revision ?? 0) + 1,
      status: jobSnapshot.status,
      activeJob: createActiveJob(activation.job),
      events: projected.events,
      observations: projected.observations,
      consoleObservations: projected.consoleObservations,
      updatedAt:
        jobSnapshot.completedAt ??
        jobSnapshot.cancellationRequestedAt ??
        jobSnapshot.startedAt ??
        jobSnapshot.createdAt,
    });
    const internal: InternalSession = {
      job: activation.job,
      snapshot,
      retained,
      nextObservationSequence: previous?.nextObservationSequence ?? 0,
      unsubscribe: () => undefined,
    };
    sessions.set(sessionId, internal);
    publish(sessionId, snapshot);

    const unsubscribe = activation.job.subscribe((event) => {
      if (sessions.get(sessionId) !== internal) return;
      const projected = retain(
        internal,
        Object.freeze({
          kind: 'job-event',
          record: createEventRecord(sessionId, activation.job, event),
        })
      );
      internal.snapshot = Object.freeze({
        ...internal.snapshot,
        revision: internal.snapshot.revision + 1,
        status:
          event.kind === 'state' && event.sequence > replayBoundarySequence
            ? event.snapshot.status
            : internal.snapshot.status,
        events: projected.events,
        observations: projected.observations,
        consoleObservations: projected.consoleObservations,
        updatedAt: Math.max(
          internal.snapshot.updatedAt ?? event.emittedAt,
          event.emittedAt
        ),
      });
      publish(sessionId, internal.snapshot);
    });
    if (sessions.get(sessionId) === internal)
      internal.unsubscribe = unsubscribe;
    else unsubscribe();
    void activation.job.completion.then((result) => {
      if (sessions.get(sessionId) !== internal) return;
      const terminal = createSessionTerminal(result);
      internal.snapshot = Object.freeze({
        ...internal.snapshot,
        revision: internal.snapshot.revision + 1,
        status: terminal.status,
        terminal,
        updatedAt: Math.max(
          internal.snapshot.updatedAt ?? terminal.completedAt,
          terminal.completedAt
        ),
      });
      publish(sessionId, internal.snapshot);
    });
    return internal.snapshot;
  };

  return Object.freeze({
    activate,
    getSnapshot: (sessionId) => readSession(sessionId)?.snapshot,
    listSnapshots: () =>
      Object.freeze(
        [...sessions.values()]
          .map((session) => session.snapshot)
          .sort((left, right) => left.sessionId.localeCompare(right.sessionId))
      ),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publishTrace: (publication) => {
      const sessionId = normalizeIdentifier(
        publication.sessionId,
        'Execution session id'
      );
      const jobId = normalizeIdentifier(publication.jobId, 'Execution job id');
      const session = sessions.get(sessionId);
      if (!session)
        return Object.freeze({ status: 'session-not-found' as const });
      if (session.job.id !== jobId)
        return Object.freeze({ status: 'stale-job' as const });
      const trace = freezeTrace(publication.trace);
      const identity = `${jobId}\0${trace.traceId}\0${trace.spanId}\0${trace.phase}`;
      const fingerprint = JSON.stringify(trace);
      const duplicate = session.retained.find(
        (entry) =>
          entry.kind === 'trace-observation' &&
          `${entry.record.jobId}\0${entry.record.trace.traceId}\0${entry.record.trace.spanId}\0${entry.record.trace.phase}` ===
            identity
      );
      if (duplicate?.kind === 'trace-observation')
        return JSON.stringify(duplicate.record.trace) === fingerprint
          ? Object.freeze({
              status: 'duplicate' as const,
              observation: duplicate.record,
            })
          : Object.freeze({ status: 'conflict' as const });
      const observedAt = publication.observedAt ?? (input.now ?? Date.now)();
      if (!Number.isSafeInteger(observedAt) || observedAt < 0)
        throw new TypeError(
          'Execution session observation time must be a non-negative safe integer.'
        );
      session.nextObservationSequence += 1;
      const observation: ExecutionSessionTraceObservation = Object.freeze({
        sessionId,
        jobId,
        requestId: session.job.request.requestId,
        providerId: session.job.provider.id,
        workspaceId: session.job.request.workspace.workspaceId,
        snapshotId: session.job.request.workspace.snapshotId,
        sequence: session.nextObservationSequence,
        observedAt,
        trace,
      });
      const projected = retain(
        session,
        Object.freeze({ kind: 'trace-observation', record: observation })
      );
      session.snapshot = Object.freeze({
        ...session.snapshot,
        revision: session.snapshot.revision + 1,
        events: projected.events,
        observations: projected.observations,
        updatedAt: Math.max(
          session.snapshot.updatedAt ?? observedAt,
          observedAt
        ),
      });
      publish(sessionId, session.snapshot);
      return Object.freeze({ status: 'published' as const, observation });
    },
    publishConsole: (publication) => {
      const sessionId = normalizeIdentifier(
        publication.sessionId,
        'Execution session id'
      );
      const jobId = normalizeIdentifier(publication.jobId, 'Execution job id');
      const observationId = normalizeIdentifier(
        publication.observationId,
        'Execution Console observation id'
      );
      if (observationId.length > 256)
        throw new TypeError(
          'Execution Console observation id exceeds its length budget.'
        );
      const session = sessions.get(sessionId);
      if (!session)
        return Object.freeze({ status: 'session-not-found' as const });
      if (session.job.id !== jobId)
        return Object.freeze({ status: 'stale-job' as const });
      const log = createExecutionLogRecord(publication.log);
      const duplicate = session.retained.find(
        (entry) =>
          entry.kind === 'console-observation' &&
          entry.record.jobId === jobId &&
          entry.record.observationId === observationId
      );
      if (duplicate?.kind === 'console-observation')
        return JSON.stringify(duplicate.record.log) === JSON.stringify(log)
          ? Object.freeze({
              status: 'duplicate' as const,
              observation: duplicate.record,
            })
          : Object.freeze({ status: 'conflict' as const });
      const observedAt = publication.observedAt ?? (input.now ?? Date.now)();
      if (!Number.isSafeInteger(observedAt) || observedAt < 0)
        throw new TypeError(
          'Execution Console observation time must be a non-negative safe integer.'
        );
      session.nextObservationSequence += 1;
      const observation: ExecutionSessionConsoleObservation = Object.freeze({
        sessionId,
        jobId,
        requestId: session.job.request.requestId,
        providerId: session.job.provider.id,
        workspaceId: session.job.request.workspace.workspaceId,
        snapshotId: session.job.request.workspace.snapshotId,
        observationId,
        sequence: session.nextObservationSequence,
        observedAt,
        log,
      });
      const projected = retain(
        session,
        Object.freeze({ kind: 'console-observation', record: observation })
      );
      session.snapshot = Object.freeze({
        ...session.snapshot,
        revision: session.snapshot.revision + 1,
        events: projected.events,
        observations: projected.observations,
        consoleObservations: projected.consoleObservations,
        updatedAt: Math.max(
          session.snapshot.updatedAt ?? observedAt,
          observedAt
        ),
      });
      publish(sessionId, session.snapshot);
      return Object.freeze({ status: 'published' as const, observation });
    },
    clearEvents: (sessionId) => {
      const normalized = normalizeIdentifier(sessionId, 'Execution session id');
      const session = sessions.get(normalized);
      if (!session) return undefined;
      session.retained = Object.freeze([]);
      session.snapshot = Object.freeze({
        ...session.snapshot,
        revision: session.snapshot.revision + 1,
        events: Object.freeze([]),
        observations: Object.freeze([]),
        consoleObservations: Object.freeze([]),
      });
      publish(normalized, session.snapshot);
      return session.snapshot;
    },
    cancel: async (sessionId, request) => {
      const session = readSession(sessionId);
      if (!session) return Object.freeze({ status: 'session-not-found' });
      return session.job.cancel(request);
    },
    remove: (sessionId) => {
      const normalized = normalizeIdentifier(sessionId, 'Execution session id');
      const session = sessions.get(normalized);
      if (!session) return false;
      session.unsubscribe();
      sessions.delete(normalized);
      publish(normalized, undefined);
      return true;
    },
  });
};
