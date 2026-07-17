import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import { cloneExecutionValue } from './executionRequest';
import {
  EXECUTION_LOG_CATEGORIES,
  type ExecutionLogCategory,
  type ExecutionLogLevel,
  type ExecutionLogRecord,
  type ExecutionSourceTrace,
  type ExecutionValue,
} from './execution.types';
import type {
  ExecutionSessionConsoleObservation,
  ExecutionSessionEventRecord,
  ExecutionSessionSnapshot,
} from './executionSession';
import { EXECUTION_SECRET_REDACTION_MARKER } from './executionSecretLeakGuard';

export const EXECUTION_CONSOLE_BRIDGE_MESSAGE_TYPE =
  'prodivix.execution-console-bridge.v1' as const;
export const EXECUTION_CONSOLE_TRUNCATION_MARKER = '[TRUNCATED]' as const;

export const EXECUTION_CONSOLE_LIMITS = Object.freeze({
  maximumBridgeBytes: 32 * 1024,
  maximumBridgeArguments: 20,
  maximumBridgeValueDepth: 8,
  maximumBridgeValueNodes: 512,
  maximumMessageBytes: 8 * 1024,
  maximumArgumentStringBytes: 4 * 1024,
  maximumArgumentEntries: 64,
  maximumSourceTraces: 16,
  maximumRecords: 500,
  maximumRetainedBytes: 256 * 1024,
});

export type ExecutionConsoleLevel = 'debug' | 'info' | 'warning' | 'error';
export type ExecutionConsoleCategory =
  ExecutionLogCategory | 'lifecycle' | 'diagnostic' | 'artifact' | 'trace';
export type ExecutionConsoleRecordSource =
  | 'state'
  | 'log'
  | 'diagnostic'
  | 'artifact'
  | 'trace'
  | 'application-observation';

export type ExecutionConsoleCorrelation = Readonly<{
  sessionId: string;
  jobId: string;
  requestId: string;
  providerId: string;
  workspaceId: string;
  snapshotId: string;
  sequence: number;
}>;

export type ExecutionConsoleRecord = Readonly<{
  recordId: string;
  source: ExecutionConsoleRecordSource;
  category: ExecutionConsoleCategory;
  level: ExecutionConsoleLevel;
  label: string;
  message: string;
  arguments: readonly ExecutionValue[];
  recordedAt: number;
  correlation: ExecutionConsoleCorrelation;
  redacted: boolean;
  truncated: boolean;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionConsoleSnapshot = Readonly<{
  sessionId: string;
  sessionRevision: number;
  records: readonly ExecutionConsoleRecord[];
  retainedBytes: number;
  droppedRecords: number;
  truncated: boolean;
}>;

export type ExecutionConsoleBridgeMessage = Readonly<{
  type: typeof EXECUTION_CONSOLE_BRIDGE_MESSAGE_TYPE;
  messageId: string;
  log: ExecutionLogRecord;
}>;

export type CreateExecutionConsoleSnapshotInput = Readonly<{
  session: ExecutionSessionSnapshot;
  maximumRecords?: number;
  maximumRetainedBytes?: number;
}>;

const logCategories = new Set<ExecutionLogCategory>(EXECUTION_LOG_CATEGORIES);
const logLevels = new Set<ExecutionLogLevel>([
  'trace',
  'debug',
  'info',
  'warning',
  'error',
]);
const logStreams = new Set(['stdout', 'stderr', 'console']);
const sensitiveConsoleKeys = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'xapikey',
  'apikey',
  'password',
  'passwd',
  'secret',
  'clientsecret',
  'clientkey',
  'token',
  'authtoken',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'sessiontoken',
  'csrftoken',
  'jwt',
  'credential',
  'credentials',
  'sessionid',
  'privatekey',
]);

export type ExecutionConsoleTextRedaction = Readonly<{
  value: string;
  redacted: boolean;
}>;

/** Conservatively removes common credential forms at every Console trust boundary. */
export const redactExecutionConsoleText = (
  value: string
): ExecutionConsoleTextRedaction => {
  const redacted = value
    .replace(
      /(^|[\s,;])((?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]*/gimu,
      (_match, prefix: string, key: string) =>
        `${prefix}${key}${EXECUTION_SECRET_REDACTION_MARKER}`
    )
    .replace(
      /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu,
      (_match, scheme: string) =>
        `${scheme} ${EXECUTION_SECRET_REDACTION_MARKER}`
    )
    .replace(
      /([?&](?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|password|secret|signature|sig)=)[^&#\s]*/giu,
      `$1${EXECUTION_SECRET_REDACTION_MARKER}`
    )
    .replace(
      /:\/\/[^/@:\s]+:[^/@\s]+@/gu,
      `://${EXECUTION_SECRET_REDACTION_MARKER}@`
    )
    .replace(
      /(^|[\s,{;])(["']?(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|password|passwd|secret|client[_-]?secret|token|auth[_-]?token|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|csrf[_-]?token|credential|credentials)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\r\n]+)/gimu,
      (_match, prefix: string, key: string) =>
        `${prefix}${key}${EXECUTION_SECRET_REDACTION_MARKER}`
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      EXECUTION_SECRET_REDACTION_MARKER
    );
  return Object.freeze({ value: redacted, redacted: redacted !== value });
};

const isSensitiveConsoleKey = (value: string): boolean =>
  sensitiveConsoleKeys.has(value.replace(/[-_\s]/gu, '').toLowerCase());

type ConsoleRedactionState = { redacted: boolean };

const redactExecutionConsoleValue = (
  value: ExecutionValue,
  state: ConsoleRedactionState
): ExecutionValue => {
  if (typeof value === 'string') {
    const result = redactExecutionConsoleText(value);
    state.redacted ||= result.redacted;
    return result.value;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (Array.isArray(value))
    return Object.freeze(
      value.map((entry) => redactExecutionConsoleValue(entry, state))
    );
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (isSensitiveConsoleKey(key)) {
          state.redacted = true;
          return [key, EXECUTION_SECRET_REDACTION_MARKER];
        }
        return [key, redactExecutionConsoleValue(entry, state)];
      })
    )
  );
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const exactRecord = (
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected)
    throw new TypeError(`${label} contains unsupported field: ${unexpected}.`);
  const missing = requiredKeys.find(
    (key) => !Object.prototype.hasOwnProperty.call(value, key)
  );
  if (missing) throw new TypeError(`${label} is missing field: ${missing}.`);
  return value;
};

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
};

const freezeSourceTrace = (
  sourceTrace: readonly ExecutionSourceTrace[] | undefined,
  maximum = Number.POSITIVE_INFINITY
): Readonly<{
  value?: readonly ExecutionSourceTrace[];
  truncated: boolean;
}> => {
  if (!sourceTrace) return Object.freeze({ truncated: false });
  const retained = sourceTrace.slice(0, maximum).map((trace) =>
    Object.freeze({
      ...trace,
      sourceRef: Object.freeze({ ...trace.sourceRef }),
      ...(trace.sourceSpan
        ? { sourceSpan: Object.freeze({ ...trace.sourceSpan }) }
        : {}),
    })
  );
  return Object.freeze({
    value: Object.freeze(retained),
    truncated: retained.length !== sourceTrace.length,
  });
};

/** Normalizes provider and iframe logs before they enter a Job or Session. */
export const createExecutionLogRecord = (
  input: ExecutionLogRecord
): ExecutionLogRecord => {
  if (!logStreams.has(input.stream))
    throw new TypeError('Execution log stream is unsupported.');
  if (!logLevels.has(input.level))
    throw new TypeError('Execution log level is unsupported.');
  if (input.category !== undefined && !logCategories.has(input.category))
    throw new TypeError('Execution log category is unsupported.');
  if (typeof input.message !== 'string')
    throw new TypeError('Execution log message must be a string.');
  if (utf8ToBytes(input.message).byteLength > 64 * 1024)
    throw new TypeError('Execution log message exceeds its byte budget.');
  if (input.arguments && input.arguments.length > 64)
    throw new TypeError('Execution log arguments exceed their entry budget.');
  const redactionState: ConsoleRedactionState = {
    redacted: input.redacted ?? false,
  };
  const message = redactExecutionConsoleText(input.message);
  redactionState.redacted ||= message.redacted;
  const sourceTrace = freezeSourceTrace(input.sourceTrace);
  return Object.freeze({
    stream: input.stream,
    level: input.level,
    ...(input.category ? { category: input.category } : {}),
    message: message.value,
    ...(input.arguments
      ? {
          arguments: Object.freeze(
            input.arguments.map((value) =>
              redactExecutionConsoleValue(
                cloneExecutionValue(value),
                redactionState
              )
            )
          ),
        }
      : {}),
    ...(input.data === undefined
      ? {}
      : {
          data: redactExecutionConsoleValue(
            cloneExecutionValue(input.data),
            redactionState
          ),
        }),
    ...(redactionState.redacted ? { redacted: true } : {}),
    ...(input.truncated === undefined ? {} : { truncated: input.truncated }),
    ...(sourceTrace.value ? { sourceTrace: sourceTrace.value } : {}),
  });
};

type BridgeValueState = { nodes: number };

const readBridgeValue = (
  value: unknown,
  label: string,
  depth: number,
  state: BridgeValueState
): ExecutionValue => {
  state.nodes += 1;
  if (state.nodes > EXECUTION_CONSOLE_LIMITS.maximumBridgeValueNodes)
    throw new TypeError(`${label} exceeds the node budget.`);
  if (depth > EXECUTION_CONSOLE_LIMITS.maximumBridgeValueDepth)
    throw new TypeError(`${label} exceeds the depth budget.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError(`${label} must contain finite numbers.`);
    return value;
  }
  if (typeof value === 'string') {
    if (
      utf8ToBytes(value).byteLength >
      EXECUTION_CONSOLE_LIMITS.maximumArgumentStringBytes
    )
      throw new TypeError(`${label} exceeds the string byte budget.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > EXECUTION_CONSOLE_LIMITS.maximumArgumentEntries)
      throw new TypeError(`${label} exceeds the array entry budget.`);
    return Object.freeze(
      value.map((entry, index) =>
        readBridgeValue(entry, `${label}[${index}]`, depth + 1, state)
      )
    );
  }
  if (!isPlainRecord(value))
    throw new TypeError(`${label} must contain transport-safe values.`);
  const entries = Object.entries(value);
  if (entries.length > EXECUTION_CONSOLE_LIMITS.maximumArgumentEntries)
    throw new TypeError(`${label} exceeds the record entry budget.`);
  return Object.freeze(
    Object.fromEntries(
      entries.map(([key, entry]) => [
        key,
        readBridgeValue(entry, `${label}.${key}`, depth + 1, state),
      ])
    )
  );
};

/** Strictly decodes the bounded, value-only generated application Console bridge. */
export const readExecutionConsoleBridgeMessage = (
  value: unknown
): ExecutionConsoleBridgeMessage | undefined => {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (
    utf8ToBytes(encoded).byteLength >
    EXECUTION_CONSOLE_LIMITS.maximumBridgeBytes
  )
    return undefined;
  try {
    const message = exactRecord(
      value,
      ['type', 'messageId', 'log'],
      ['type', 'messageId', 'log'],
      'Execution Console bridge message'
    );
    if (message.type !== EXECUTION_CONSOLE_BRIDGE_MESSAGE_TYPE)
      return undefined;
    if (
      typeof message.messageId !== 'string' ||
      message.messageId !== message.messageId.trim() ||
      !/^[A-Za-z0-9._:-]{1,256}$/u.test(message.messageId)
    )
      return undefined;
    const log = exactRecord(
      message.log,
      ['level', 'category', 'message', 'arguments', 'redacted', 'truncated'],
      ['level', 'category', 'message', 'arguments', 'redacted', 'truncated'],
      'Execution Console bridge log'
    );
    if (
      typeof log.level !== 'string' ||
      !['debug', 'info', 'warning', 'error'].includes(log.level) ||
      (log.category !== 'application' && log.category !== 'runtime') ||
      typeof log.message !== 'string' ||
      utf8ToBytes(log.message).byteLength >
        EXECUTION_CONSOLE_LIMITS.maximumMessageBytes ||
      !Array.isArray(log.arguments) ||
      log.arguments.length > EXECUTION_CONSOLE_LIMITS.maximumBridgeArguments ||
      typeof log.redacted !== 'boolean' ||
      typeof log.truncated !== 'boolean'
    )
      return undefined;
    const state: BridgeValueState = { nodes: 0 };
    const executionArguments = Object.freeze(
      log.arguments.map((argument, index) =>
        readBridgeValue(argument, `Console argument ${index}`, 0, state)
      )
    );
    return Object.freeze({
      type: EXECUTION_CONSOLE_BRIDGE_MESSAGE_TYPE,
      messageId: message.messageId,
      log: createExecutionLogRecord({
        stream: 'console',
        level: log.level as ExecutionLogLevel,
        category: log.category,
        message: log.message,
        arguments: executionArguments,
        redacted: log.redacted,
        truncated: log.truncated,
      }),
    });
  } catch {
    return undefined;
  }
};

const truncateUtf8 = (
  value: string,
  maximumBytes: number
): Readonly<{ value: string; truncated: boolean }> => {
  if (utf8ToBytes(value).byteLength <= maximumBytes)
    return Object.freeze({ value, truncated: false });
  const suffix = '…';
  const suffixBytes = utf8ToBytes(suffix).byteLength;
  let retained = '';
  let retainedBytes = 0;
  for (const character of value) {
    const bytes = utf8ToBytes(character).byteLength;
    if (retainedBytes + bytes + suffixBytes > maximumBytes) break;
    retained += character;
    retainedBytes += bytes;
  }
  return Object.freeze({ value: `${retained}${suffix}`, truncated: true });
};

type ConsoleValueBudget = {
  nodes: number;
  truncated: boolean;
};

const boundConsoleValue = (
  value: ExecutionValue,
  depth: number,
  state: ConsoleValueBudget
): ExecutionValue => {
  state.nodes += 1;
  if (
    state.nodes > EXECUTION_CONSOLE_LIMITS.maximumBridgeValueNodes ||
    depth > EXECUTION_CONSOLE_LIMITS.maximumBridgeValueDepth
  ) {
    state.truncated = true;
    return EXECUTION_CONSOLE_TRUNCATION_MARKER;
  }
  if (typeof value === 'string') {
    const bounded = truncateUtf8(
      value,
      EXECUTION_CONSOLE_LIMITS.maximumArgumentStringBytes
    );
    state.truncated ||= bounded.truncated;
    return bounded.value;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (Array.isArray(value)) {
    const retained = value.slice(
      0,
      EXECUTION_CONSOLE_LIMITS.maximumArgumentEntries
    );
    state.truncated ||= retained.length !== value.length;
    return Object.freeze(
      retained.map((entry) => boundConsoleValue(entry, depth + 1, state))
    );
  }
  const entries = Object.entries(value).slice(
    0,
    EXECUTION_CONSOLE_LIMITS.maximumArgumentEntries
  );
  state.truncated ||= entries.length !== Object.keys(value).length;
  return Object.freeze(
    Object.fromEntries(
      entries.map(([key, entry]) => [
        key,
        boundConsoleValue(entry, depth + 1, state),
      ])
    )
  );
};

const consoleLevel = (level: ExecutionLogLevel): ExecutionConsoleLevel =>
  level === 'trace' || level === 'debug' ? 'debug' : level;

const diagnosticLevel = (
  diagnostic: ProdivixDiagnostic
): ExecutionConsoleLevel =>
  diagnostic.severity === 'fatal' ? 'error' : diagnostic.severity;

const diagnosticSourceTrace = (
  diagnostic: ProdivixDiagnostic
): readonly ExecutionSourceTrace[] | undefined =>
  diagnostic.targetRef
    ? Object.freeze([
        Object.freeze({
          sourceRef: Object.freeze({ ...diagnostic.targetRef }),
          ...(diagnostic.sourceSpan
            ? { sourceSpan: Object.freeze({ ...diagnostic.sourceSpan }) }
            : {}),
          label: diagnostic.code,
        }),
      ])
    : undefined;

type ConsoleRecordIdentity = Readonly<{
  recordId: string;
  source: ExecutionConsoleRecordSource;
  recordedAt: number;
  sessionId: string;
  jobId: string;
  requestId: string;
  providerId: string;
  workspaceId: string;
  snapshotId: string;
  sequence: number;
}>;

const createConsoleRecord = (input: {
  identity: ConsoleRecordIdentity;
  category: ExecutionConsoleCategory;
  level: ExecutionConsoleLevel;
  label: string;
  message: string;
  arguments?: readonly ExecutionValue[];
  redacted?: boolean;
  truncated?: boolean;
  sourceTrace?: readonly ExecutionSourceTrace[];
}): ExecutionConsoleRecord => {
  const redactionState: ConsoleRedactionState = {
    redacted: input.redacted ?? false,
  };
  const safeMessage = redactExecutionConsoleText(input.message);
  redactionState.redacted ||= safeMessage.redacted;
  const message = truncateUtf8(
    safeMessage.value,
    EXECUTION_CONSOLE_LIMITS.maximumMessageBytes
  );
  const label = truncateUtf8(input.label, 256);
  const budget: ConsoleValueBudget = { nodes: 0, truncated: false };
  const executionArguments = Object.freeze(
    (input.arguments ?? [])
      .slice(0, EXECUTION_CONSOLE_LIMITS.maximumBridgeArguments)
      .map((value) =>
        boundConsoleValue(
          redactExecutionConsoleValue(value, redactionState),
          0,
          budget
        )
      )
  );
  budget.truncated ||=
    (input.arguments?.length ?? 0) >
    EXECUTION_CONSOLE_LIMITS.maximumBridgeArguments;
  const sourceTrace = freezeSourceTrace(
    input.sourceTrace,
    EXECUTION_CONSOLE_LIMITS.maximumSourceTraces
  );
  return Object.freeze({
    recordId: input.identity.recordId,
    source: input.identity.source,
    category: input.category,
    level: input.level,
    label: label.value,
    message: message.value,
    arguments: executionArguments,
    recordedAt: input.identity.recordedAt,
    correlation: Object.freeze({
      sessionId: input.identity.sessionId,
      jobId: input.identity.jobId,
      requestId: input.identity.requestId,
      providerId: input.identity.providerId,
      workspaceId: input.identity.workspaceId,
      snapshotId: input.identity.snapshotId,
      sequence: input.identity.sequence,
    }),
    redacted: redactionState.redacted,
    truncated:
      (input.truncated ?? false) ||
      message.truncated ||
      label.truncated ||
      budget.truncated ||
      sourceTrace.truncated,
    ...(sourceTrace.value ? { sourceTrace: sourceTrace.value } : {}),
  });
};

const eventIdentity = (
  record: ExecutionSessionEventRecord
): ConsoleRecordIdentity =>
  Object.freeze({
    recordId: `${record.jobId}:${record.event.sequence}:${record.event.kind}`,
    source: record.event.kind,
    recordedAt: record.event.emittedAt,
    sessionId: record.sessionId,
    jobId: record.jobId,
    requestId: record.requestId,
    providerId: record.providerId,
    workspaceId: record.workspaceId,
    snapshotId: record.snapshotId,
    sequence: record.event.sequence,
  });

const eventConsoleRecord = (
  record: ExecutionSessionEventRecord
): ExecutionConsoleRecord => {
  const identity = eventIdentity(record);
  const { event } = record;
  if (event.kind === 'state') {
    const status = event.snapshot.status;
    return createConsoleRecord({
      identity,
      category: 'lifecycle',
      level:
        status === 'failed' || status === 'timed-out'
          ? 'error'
          : status === 'cancelling' || status === 'cancelled'
            ? 'warning'
            : 'info',
      label: status,
      message: event.reason ?? status,
    });
  }
  if (event.kind === 'log') {
    return createConsoleRecord({
      identity,
      category:
        event.log.category ??
        (event.log.stream === 'console' ? 'application' : 'process'),
      level: consoleLevel(event.log.level),
      label: event.log.stream,
      message: event.log.message,
      arguments:
        event.log.arguments ??
        (event.log.data === undefined ? undefined : [event.log.data]),
      redacted: event.log.redacted,
      truncated: event.log.truncated,
      sourceTrace: event.log.sourceTrace,
    });
  }
  if (event.kind === 'diagnostic') {
    return createConsoleRecord({
      identity,
      category: 'diagnostic',
      level: diagnosticLevel(event.diagnostic),
      label: event.diagnostic.code,
      message: event.diagnostic.message,
      sourceTrace: diagnosticSourceTrace(event.diagnostic),
    });
  }
  if (event.kind === 'artifact') {
    return createConsoleRecord({
      identity,
      category: 'artifact',
      level: 'info',
      label: event.artifact.kind,
      message:
        event.artifact.label ?? event.artifact.uri ?? event.artifact.artifactId,
      arguments: event.artifact.metadata
        ? [event.artifact.metadata]
        : undefined,
      sourceTrace: event.artifact.sourceTrace,
    });
  }
  return createConsoleRecord({
    identity,
    category: 'trace',
    level: 'debug',
    label: event.trace.phase,
    message: event.trace.name,
    arguments:
      event.trace.detail === undefined ? undefined : [event.trace.detail],
    sourceTrace: event.trace.sourceTrace,
  });
};

const observationConsoleRecord = (
  observation: ExecutionSessionConsoleObservation
): ExecutionConsoleRecord =>
  createConsoleRecord({
    identity: Object.freeze({
      recordId: `${observation.jobId}:console:${observation.observationId}`,
      source: 'application-observation',
      recordedAt: observation.observedAt,
      sessionId: observation.sessionId,
      jobId: observation.jobId,
      requestId: observation.requestId,
      providerId: observation.providerId,
      workspaceId: observation.workspaceId,
      snapshotId: observation.snapshotId,
      sequence: observation.sequence,
    }),
    category: observation.log.category ?? 'application',
    level: consoleLevel(observation.log.level),
    label: observation.log.stream,
    message: observation.log.message,
    arguments:
      observation.log.arguments ??
      (observation.log.data === undefined ? undefined : [observation.log.data]),
    redacted: observation.log.redacted,
    truncated: observation.log.truncated,
    sourceTrace: observation.log.sourceTrace,
  });

/** Projects one bounded Session into provider-neutral structured Console records. */
export const createExecutionConsoleSnapshot = (
  input: CreateExecutionConsoleSnapshotInput
): ExecutionConsoleSnapshot => {
  const maximumRecords = positiveSafeInteger(
    input.maximumRecords ?? EXECUTION_CONSOLE_LIMITS.maximumRecords,
    'Execution Console maximumRecords'
  );
  const maximumRetainedBytes = positiveSafeInteger(
    input.maximumRetainedBytes ?? EXECUTION_CONSOLE_LIMITS.maximumRetainedBytes,
    'Execution Console maximumRetainedBytes'
  );
  const candidates = [
    ...input.session.events.map(eventConsoleRecord),
    ...input.session.consoleObservations.map(observationConsoleRecord),
  ].sort(
    (left, right) =>
      left.recordedAt - right.recordedAt ||
      left.correlation.sequence - right.correlation.sequence ||
      left.recordId.localeCompare(right.recordId)
  );
  const retained: ExecutionConsoleRecord[] = [];
  let retainedBytes = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (retained.length >= maximumRecords) break;
    const record = candidates[index]!;
    const bytes = utf8ToBytes(JSON.stringify(record)).byteLength;
    if (
      bytes > maximumRetainedBytes ||
      retainedBytes + bytes > maximumRetainedBytes
    )
      continue;
    retained.push(record);
    retainedBytes += bytes;
  }
  retained.reverse();
  const droppedRecords = candidates.length - retained.length;
  return Object.freeze({
    sessionId: input.session.sessionId,
    sessionRevision: input.session.revision,
    records: Object.freeze(retained),
    retainedBytes,
    droppedRecords,
    truncated:
      droppedRecords > 0 || retained.some((record) => record.truncated),
  });
};
