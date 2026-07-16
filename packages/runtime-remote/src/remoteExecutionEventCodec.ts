import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  ExecutionArtifact,
  ExecutionJobEvent,
  ExecutionJobSnapshot,
  ExecutionJobStatus,
  ExecutionLogRecord,
  ExecutionTraceRecord,
} from '@prodivix/runtime-core';
import {
  EXECUTION_NETWORK_TRACE_NAME,
  readExecutionNetworkTraceValue,
  toExecutionNetworkTraceValue,
} from '@prodivix/runtime-core';
import {
  booleanValue,
  diagnostic,
  exactRecord,
  executionValue,
  normalizedString,
  optionalSafeInteger,
  safeInteger,
  safeString,
  sourceTraces,
  stringRecord,
} from './remoteExecutionCodecPrimitives';
import type {
  RemoteExecutionEventRecord,
  RemoteExecutionEventsResult,
} from './remoteExecutionProtocol.types';

const jobStatuses = new Set<ExecutionJobStatus>([
  'queued',
  'starting',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);
const artifactKinds = new Set([
  'file',
  'bundle',
  'report',
  'coverage',
  'screenshot',
  'trace',
  'custom',
]);

const jobStatus = (value: unknown, label: string): ExecutionJobStatus => {
  const status = normalizedString(value, label) as ExecutionJobStatus;
  if (!jobStatuses.has(status)) throw new TypeError(`${label} is unsupported.`);
  return status;
};

const jobSnapshot = (value: unknown, label: string): ExecutionJobSnapshot => {
  const record = exactRecord(
    value,
    [
      'jobId',
      'requestId',
      'providerId',
      'status',
      'latestEventSequence',
      'createdAt',
      'startedAt',
      'cancellationRequestedAt',
      'completedAt',
    ],
    [
      'jobId',
      'requestId',
      'providerId',
      'status',
      'latestEventSequence',
      'createdAt',
    ],
    label
  );
  return Object.freeze({
    jobId: normalizedString(record.jobId, `${label}.jobId`),
    requestId: normalizedString(record.requestId, `${label}.requestId`),
    providerId: normalizedString(record.providerId, `${label}.providerId`),
    status: jobStatus(record.status, `${label}.status`),
    latestEventSequence: safeInteger(
      record.latestEventSequence,
      `${label}.latestEventSequence`
    ),
    createdAt: safeInteger(record.createdAt, `${label}.createdAt`),
    ...(
      ['startedAt', 'cancellationRequestedAt', 'completedAt'] as const
    ).reduce(
      (output, key) => {
        const decoded = optionalSafeInteger(record[key], `${label}.${key}`);
        return decoded === undefined ? output : { ...output, [key]: decoded };
      },
      {} as Record<string, number>
    ),
  });
};

const logRecord = (value: unknown, label: string): ExecutionLogRecord => {
  const record = exactRecord(
    value,
    ['stream', 'level', 'message', 'data', 'redacted', 'sourceTrace'],
    ['stream', 'level', 'message'],
    label
  );
  const stream = normalizedString(record.stream, `${label}.stream`);
  const level = normalizedString(record.level, `${label}.level`);
  if (!['stdout', 'stderr', 'console'].includes(stream)) {
    throw new TypeError(`${label}.stream is unsupported.`);
  }
  if (!['trace', 'debug', 'info', 'warning', 'error'].includes(level)) {
    throw new TypeError(`${label}.level is unsupported.`);
  }
  return Object.freeze({
    stream: stream as ExecutionLogRecord['stream'],
    level: level as ExecutionLogRecord['level'],
    message: safeString(record.message, `${label}.message`),
    ...(record.data === undefined
      ? {}
      : { data: executionValue(record.data, `${label}.data`) }),
    ...(record.redacted === undefined
      ? {}
      : { redacted: booleanValue(record.redacted, `${label}.redacted`) }),
    ...(record.sourceTrace === undefined
      ? {}
      : {
          sourceTrace: sourceTraces(record.sourceTrace, `${label}.sourceTrace`),
        }),
  });
};

const executionArtifact = (
  value: unknown,
  label: string
): ExecutionArtifact => {
  const record = exactRecord(
    value,
    [
      'artifactId',
      'kind',
      'label',
      'mediaType',
      'size',
      'digest',
      'sourceTrace',
      'metadata',
    ],
    ['artifactId', 'kind'],
    label
  );
  const kind = normalizedString(record.kind, `${label}.kind`);
  if (!artifactKinds.has(kind)) {
    throw new TypeError(`${label}.kind is unsupported.`);
  }
  return Object.freeze({
    artifactId: normalizedString(record.artifactId, `${label}.artifactId`),
    kind: kind as ExecutionArtifact['kind'],
    ...(record.label === undefined
      ? {}
      : { label: safeString(record.label, `${label}.label`) }),
    ...(record.mediaType === undefined
      ? {}
      : {
          mediaType: normalizedString(record.mediaType, `${label}.mediaType`),
        }),
    ...(record.size === undefined
      ? {}
      : { size: safeInteger(record.size, `${label}.size`) }),
    ...(record.digest === undefined
      ? {}
      : { digest: normalizedString(record.digest, `${label}.digest`) }),
    ...(record.sourceTrace === undefined
      ? {}
      : {
          sourceTrace: sourceTraces(record.sourceTrace, `${label}.sourceTrace`),
        }),
    ...(record.metadata === undefined
      ? {}
      : { metadata: stringRecord(record.metadata, `${label}.metadata`) }),
  });
};

const traceRecord = (value: unknown, label: string): ExecutionTraceRecord => {
  const record = exactRecord(
    value,
    [
      'traceId',
      'spanId',
      'parentSpanId',
      'name',
      'phase',
      'detail',
      'sourceTrace',
    ],
    ['traceId', 'spanId', 'name', 'phase'],
    label
  );
  const phase = normalizedString(record.phase, `${label}.phase`);
  if (!['start', 'event', 'end'].includes(phase)) {
    throw new TypeError(`${label}.phase is unsupported.`);
  }
  const name = normalizedString(record.name, `${label}.name`);
  const detail =
    record.detail === undefined
      ? undefined
      : executionValue(record.detail, `${label}.detail`);
  const normalizedDetail =
    name === EXECUTION_NETWORK_TRACE_NAME
      ? (() => {
          const network = readExecutionNetworkTraceValue(detail);
          if (!network)
            throw new TypeError(
              `${label}.detail is not a canonical Network trace.`
            );
          return toExecutionNetworkTraceValue(network);
        })()
      : detail;
  return Object.freeze({
    traceId: normalizedString(record.traceId, `${label}.traceId`),
    spanId: normalizedString(record.spanId, `${label}.spanId`),
    ...(record.parentSpanId === undefined
      ? {}
      : {
          parentSpanId: normalizedString(
            record.parentSpanId,
            `${label}.parentSpanId`
          ),
        }),
    name,
    phase: phase as ExecutionTraceRecord['phase'],
    ...(normalizedDetail === undefined ? {} : { detail: normalizedDetail }),
    ...(record.sourceTrace === undefined
      ? {}
      : {
          sourceTrace: sourceTraces(record.sourceTrace, `${label}.sourceTrace`),
        }),
  });
};

const jobEvent = (value: unknown, label: string): ExecutionJobEvent => {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${label} must be an object.`);
  }
  const kind = (value as Record<string, unknown>).kind;
  const baseKeys = ['jobId', 'sequence', 'emittedAt', 'kind'];
  const base = (record: Record<string, unknown>) => ({
    jobId: normalizedString(record.jobId, `${label}.jobId`),
    sequence: safeInteger(record.sequence, `${label}.sequence`, 1),
    emittedAt: safeInteger(record.emittedAt, `${label}.emittedAt`),
  });
  switch (kind) {
    case 'state': {
      const record = exactRecord(
        value,
        [...baseKeys, 'previousStatus', 'snapshot', 'reason'],
        [...baseKeys, 'snapshot'],
        label
      );
      return Object.freeze({
        ...base(record),
        kind,
        ...(record.previousStatus === undefined
          ? {}
          : {
              previousStatus: jobStatus(
                record.previousStatus,
                `${label}.previousStatus`
              ),
            }),
        snapshot: jobSnapshot(record.snapshot, `${label}.snapshot`),
        ...(record.reason === undefined
          ? {}
          : { reason: safeString(record.reason, `${label}.reason`) }),
      });
    }
    case 'log': {
      const record = exactRecord(
        value,
        [...baseKeys, 'log'],
        [...baseKeys, 'log'],
        label
      );
      return Object.freeze({
        ...base(record),
        kind,
        log: logRecord(record.log, `${label}.log`),
      });
    }
    case 'diagnostic': {
      const record = exactRecord(
        value,
        [...baseKeys, 'diagnostic'],
        [...baseKeys, 'diagnostic'],
        label
      );
      return Object.freeze({
        ...base(record),
        kind,
        diagnostic: diagnostic(
          record.diagnostic,
          `${label}.diagnostic`
        ) as ProdivixDiagnostic,
      });
    }
    case 'artifact': {
      const record = exactRecord(
        value,
        [...baseKeys, 'artifact'],
        [...baseKeys, 'artifact'],
        label
      );
      return Object.freeze({
        ...base(record),
        kind,
        artifact: executionArtifact(record.artifact, `${label}.artifact`),
      });
    }
    case 'trace': {
      const record = exactRecord(
        value,
        [...baseKeys, 'trace'],
        [...baseKeys, 'trace'],
        label
      );
      return Object.freeze({
        ...base(record),
        kind,
        trace: traceRecord(record.trace, `${label}.trace`),
      });
    }
    default:
      throw new TypeError(`${label}.kind is unsupported.`);
  }
};

export const decodeRemoteExecutionJobEvent = (
  value: unknown
): ExecutionJobEvent => jobEvent(value, 'Remote execution job event');

const eventRecord = (
  value: unknown,
  label: string
): RemoteExecutionEventRecord => {
  const record = exactRecord(
    value,
    ['cursor', 'event'],
    ['cursor', 'event'],
    label
  );
  return Object.freeze({
    cursor: safeInteger(record.cursor, `${label}.cursor`, 1),
    event: jobEvent(record.event, `${label}.event`),
  });
};

export const decodeRemoteExecutionEventsResult = (
  value: unknown
): RemoteExecutionEventsResult => {
  const record = exactRecord(
    value,
    [
      'executionId',
      'providerId',
      'afterCursor',
      'latestCursor',
      'hasMore',
      'events',
    ],
    [
      'executionId',
      'providerId',
      'afterCursor',
      'latestCursor',
      'hasMore',
      'events',
    ],
    'Remote events result'
  );
  if (!Array.isArray(record.events)) {
    throw new TypeError('Remote events result events must be an array.');
  }
  return Object.freeze({
    executionId: normalizedString(
      record.executionId,
      'Remote events executionId'
    ),
    providerId: normalizedString(record.providerId, 'Remote events providerId'),
    afterCursor: safeInteger(record.afterCursor, 'Remote events afterCursor'),
    latestCursor: safeInteger(
      record.latestCursor,
      'Remote events latestCursor'
    ),
    hasMore: booleanValue(record.hasMore, 'Remote events hasMore'),
    events: Object.freeze(
      record.events.map((entry, index) =>
        eventRecord(entry, `Remote event ${index}`)
      )
    ),
  });
};
