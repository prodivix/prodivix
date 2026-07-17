import {
  EXECUTION_TERMINAL_CAPABILITIES,
  EXECUTION_TERMINAL_CLOSE_REASONS,
  EXECUTION_TERMINAL_SIGNALS,
  type ExecutionTerminalCloseResult,
  type ExecutionTerminalOutputRecord,
  type ExecutionTerminalReadResult,
  type ExecutionTerminalResizeResult,
  type ExecutionTerminalSignalResult,
  type ExecutionTerminalSize,
  type ExecutionTerminalSnapshot,
  type ExecutionTerminalWriteResult,
} from '@prodivix/runtime-core';
import {
  REMOTE_EXECUTION_TERMINAL_LIMITS,
  REMOTE_EXECUTION_TERMINAL_PROTOCOL,
  REMOTE_EXECUTION_TERMINAL_VERSION,
  type RemoteExecutionTerminalOpenResult,
} from './remoteExecutionTerminal.types';
import {
  decodeRemoteExecutionTerminalBoolean as boolean,
  decodeRemoteExecutionTerminalExactRecord as exactRecord,
  decodeRemoteExecutionTerminalFinite as finite,
  decodeRemoteExecutionTerminalInteger as integer,
  decodeRemoteExecutionTerminalText as text,
} from './remoteExecutionTerminalCodecSupport';

export const decodeRemoteExecutionTerminalSize = (
  value: unknown
): ExecutionTerminalSize => {
  const record = exactRecord(value, ['columns', 'rows']);
  const columns = integer(record.columns, 'Remote Terminal columns', 1);
  const rows = integer(record.rows, 'Remote Terminal rows', 1);
  if (columns > 500 || rows > 200)
    throw new TypeError('Remote Terminal dimensions exceed their budget.');
  return Object.freeze({ columns, rows });
};

export const decodeRemoteExecutionTerminalSnapshot = (
  value: unknown
): ExecutionTerminalSnapshot => {
  const record = exactRecord(
    value,
    [
      'terminalSessionId',
      'executionId',
      'jobId',
      'providerId',
      'providerVersion',
      'capability',
      'status',
      'revision',
      'size',
      'openedAt',
      'updatedAt',
      'leaseExpiresAt',
      'latestOutputCursor',
      'earliestRetainedOutputCursor',
      'retainedOutputBytes',
      'droppedOutputRecords',
      'droppedOutputBytes',
      'latestClientSequence',
    ],
    ['closedAt', 'closeReason', 'exitCode']
  );
  if (!EXECUTION_TERMINAL_CAPABILITIES.includes(record.capability as 'shell'))
    throw new TypeError('Remote Terminal capability is invalid.');
  if (!['open', 'closing', 'closed'].includes(String(record.status)))
    throw new TypeError('Remote Terminal status is invalid.');
  if (
    record.closeReason !== undefined &&
    !EXECUTION_TERMINAL_CLOSE_REASONS.includes(
      record.closeReason as (typeof EXECUTION_TERMINAL_CLOSE_REASONS)[number]
    )
  )
    throw new TypeError('Remote Terminal close reason is invalid.');
  const snapshot: ExecutionTerminalSnapshot = {
    terminalSessionId: text(
      record.terminalSessionId,
      'Remote Terminal session id'
    ),
    executionId: text(record.executionId, 'Remote Terminal execution id'),
    jobId: text(record.jobId, 'Remote Terminal job id'),
    providerId: text(record.providerId, 'Remote Terminal provider id'),
    providerVersion: text(
      record.providerVersion,
      'Remote Terminal provider version'
    ),
    capability: record.capability as 'shell',
    status: record.status as 'open' | 'closing' | 'closed',
    revision: integer(record.revision, 'Remote Terminal revision', 1),
    size: decodeRemoteExecutionTerminalSize(record.size),
    openedAt: finite(record.openedAt, 'Remote Terminal openedAt'),
    updatedAt: finite(record.updatedAt, 'Remote Terminal updatedAt'),
    leaseExpiresAt: finite(
      record.leaseExpiresAt,
      'Remote Terminal leaseExpiresAt'
    ),
    latestOutputCursor: integer(
      record.latestOutputCursor,
      'Remote Terminal latest output cursor'
    ),
    earliestRetainedOutputCursor: integer(
      record.earliestRetainedOutputCursor,
      'Remote Terminal earliest output cursor'
    ),
    retainedOutputBytes: integer(
      record.retainedOutputBytes,
      'Remote Terminal retained output bytes'
    ),
    droppedOutputRecords: integer(
      record.droppedOutputRecords,
      'Remote Terminal dropped output records'
    ),
    droppedOutputBytes: integer(
      record.droppedOutputBytes,
      'Remote Terminal dropped output bytes'
    ),
    latestClientSequence: integer(
      record.latestClientSequence,
      'Remote Terminal latest client sequence'
    ),
    ...(record.closedAt === undefined
      ? {}
      : { closedAt: finite(record.closedAt, 'Remote Terminal closedAt') }),
    ...(record.closeReason === undefined
      ? {}
      : {
          closeReason: record.closeReason as NonNullable<
            ExecutionTerminalSnapshot['closeReason']
          >,
        }),
    ...(record.exitCode === undefined
      ? {}
      : { exitCode: integer(record.exitCode, 'Remote Terminal exit code') }),
  };
  if (
    snapshot.earliestRetainedOutputCursor > snapshot.latestOutputCursor ||
    snapshot.updatedAt < snapshot.openedAt ||
    (snapshot.status === 'closed' && snapshot.closedAt === undefined)
  )
    throw new TypeError('Remote Terminal snapshot is inconsistent.');
  return Object.freeze(snapshot);
};

export const decodeRemoteExecutionTerminalOpenResult = (
  value: unknown
): RemoteExecutionTerminalOpenResult => {
  const record = exactRecord(value, [
    'protocol',
    'version',
    'snapshot',
    'access',
  ]);
  if (
    record.protocol !== REMOTE_EXECUTION_TERMINAL_PROTOCOL ||
    record.version !== REMOTE_EXECUTION_TERMINAL_VERSION
  )
    throw new TypeError('Remote Terminal protocol is unsupported.');
  const access = exactRecord(record.access, ['token', 'expiresAt']);
  return Object.freeze({
    protocol: REMOTE_EXECUTION_TERMINAL_PROTOCOL,
    version: REMOTE_EXECUTION_TERMINAL_VERSION,
    snapshot: decodeRemoteExecutionTerminalSnapshot(record.snapshot),
    access: Object.freeze({
      token: text(
        access.token,
        'Remote Terminal access token',
        REMOTE_EXECUTION_TERMINAL_LIMITS.maximumAccessTokenLength
      ),
      expiresAt: finite(
        access.expiresAt,
        'Remote Terminal access token expiry'
      ),
    }),
  });
};

const decodeOutputRecord = (value: unknown): ExecutionTerminalOutputRecord => {
  const record = exactRecord(value, [
    'terminalSessionId',
    'executionId',
    'jobId',
    'cursor',
    'emittedAt',
    'stream',
    'data',
    'byteLength',
    'redacted',
    'truncated',
  ]);
  if (record.stream !== 'stdout' && record.stream !== 'stderr')
    throw new TypeError('Remote Terminal output stream is invalid.');
  if (typeof record.data !== 'string')
    throw new TypeError('Remote Terminal output data is invalid.');
  return Object.freeze({
    terminalSessionId: text(
      record.terminalSessionId,
      'Remote Terminal output session id'
    ),
    executionId: text(
      record.executionId,
      'Remote Terminal output execution id'
    ),
    jobId: text(record.jobId, 'Remote Terminal output job id'),
    cursor: integer(record.cursor, 'Remote Terminal output cursor', 1),
    emittedAt: finite(record.emittedAt, 'Remote Terminal output emittedAt'),
    stream: record.stream,
    data: record.data,
    byteLength: integer(
      record.byteLength,
      'Remote Terminal output byte length'
    ),
    redacted: boolean(record.redacted, 'Remote Terminal output redacted'),
    truncated: boolean(record.truncated, 'Remote Terminal output truncated'),
  });
};

export const decodeRemoteExecutionTerminalReadResult = (
  value: unknown
): ExecutionTerminalReadResult => {
  const record = exactRecord(value, [
    'terminalSessionId',
    'executionId',
    'jobId',
    'status',
    'afterCursor',
    'nextCursor',
    'latestCursor',
    'earliestAvailableCursor',
    'gap',
    'hasMore',
    'records',
  ]);
  if (
    !['open', 'closing', 'closed'].includes(String(record.status)) ||
    !Array.isArray(record.records) ||
    record.records.length > 250
  )
    throw new TypeError('Remote Terminal read result is invalid.');
  const result: ExecutionTerminalReadResult = Object.freeze({
    terminalSessionId: text(
      record.terminalSessionId,
      'Remote Terminal read session id'
    ),
    executionId: text(record.executionId, 'Remote Terminal read execution id'),
    jobId: text(record.jobId, 'Remote Terminal read job id'),
    status: record.status as 'open' | 'closing' | 'closed',
    afterCursor: integer(
      record.afterCursor,
      'Remote Terminal read after cursor'
    ),
    nextCursor: integer(record.nextCursor, 'Remote Terminal read next cursor'),
    latestCursor: integer(
      record.latestCursor,
      'Remote Terminal read latest cursor'
    ),
    earliestAvailableCursor: integer(
      record.earliestAvailableCursor,
      'Remote Terminal earliest available cursor'
    ),
    gap: boolean(record.gap, 'Remote Terminal read gap'),
    hasMore: boolean(record.hasMore, 'Remote Terminal read hasMore'),
    records: Object.freeze(record.records.map(decodeOutputRecord)),
  });
  if (
    result.afterCursor > result.nextCursor ||
    result.nextCursor > result.latestCursor ||
    result.records.some(
      (output, index) =>
        output.terminalSessionId !== result.terminalSessionId ||
        output.executionId !== result.executionId ||
        output.cursor <= result.afterCursor ||
        (index > 0 && output.cursor <= result.records[index - 1]!.cursor)
    )
  )
    throw new TypeError('Remote Terminal read cursor order is invalid.');
  return result;
};

export const decodeRemoteExecutionTerminalWriteResult = (
  value: unknown
): ExecutionTerminalWriteResult => {
  const record = exactRecord(
    value,
    ['status', 'clientSequence'],
    ['expectedClientSequence']
  );
  const statuses = [
    'accepted',
    'duplicate',
    'out-of-order',
    'stale',
    'conflict',
    'closed',
    'rejected',
  ];
  if (!statuses.includes(String(record.status)))
    throw new TypeError('Remote Terminal write status is invalid.');
  const clientSequence = integer(
    record.clientSequence,
    'Remote Terminal client sequence',
    1
  );
  if (record.status === 'out-of-order')
    return Object.freeze({
      status: 'out-of-order',
      clientSequence,
      expectedClientSequence: integer(
        record.expectedClientSequence,
        'Remote Terminal expected client sequence',
        1
      ),
    });
  if (record.expectedClientSequence !== undefined)
    throw new TypeError('Remote Terminal write result has unexpected fields.');
  return Object.freeze({
    status: record.status as Exclude<
      ExecutionTerminalWriteResult['status'],
      'out-of-order'
    >,
    clientSequence,
  });
};

export const decodeRemoteExecutionTerminalResizeResult = (
  value: unknown
): ExecutionTerminalResizeResult => {
  const record = exactRecord(value, ['status', 'size']);
  if (
    !['accepted', 'unchanged', 'closed', 'rejected'].includes(
      String(record.status)
    )
  )
    throw new TypeError('Remote Terminal resize status is invalid.');
  return Object.freeze({
    status: record.status as ExecutionTerminalResizeResult['status'],
    size: decodeRemoteExecutionTerminalSize(record.size),
  });
};

export const decodeRemoteExecutionTerminalSignalResult = (
  value: unknown
): ExecutionTerminalSignalResult => {
  const record = exactRecord(value, ['status', 'signal']);
  if (
    !['accepted', 'closed', 'rejected'].includes(String(record.status)) ||
    !EXECUTION_TERMINAL_SIGNALS.includes(
      record.signal as (typeof EXECUTION_TERMINAL_SIGNALS)[number]
    )
  )
    throw new TypeError('Remote Terminal signal result is invalid.');
  return Object.freeze({
    status: record.status as ExecutionTerminalSignalResult['status'],
    signal: record.signal as ExecutionTerminalSignalResult['signal'],
  });
};

export const decodeRemoteExecutionTerminalCloseResult = (
  value: unknown
): ExecutionTerminalCloseResult => {
  const record = exactRecord(value, ['status']);
  if (!['closed', 'already-closed', 'rejected'].includes(String(record.status)))
    throw new TypeError('Remote Terminal close status is invalid.');
  return Object.freeze({
    status: record.status as ExecutionTerminalCloseResult['status'],
  });
};
