import type { ExecutionValue } from '@prodivix/runtime-core';
import type {
  ExecutionServerFunctionBridgeRequest,
  ExecutionServerFunctionBridgeResponse,
} from './serverRuntimeBridge';
import {
  SERVER_FUNCTION_MAX_ATTEMPTS,
  type ServerFunctionOutcome,
  type ServerFunctionReference,
} from './serverRuntime.types';

export const SERVER_FUNCTION_INVOCATION_TRACE_NAME = 'server.function' as const;
export const SERVER_FUNCTION_INVOCATION_TRACE_FORMAT =
  'prodivix.server-function-invocation-trace.v1' as const;
export const SERVER_RUNTIME_TEST_INVOCATION_TRACE_FILE_PATH =
  '.prodivix/server-function-invocation-traces.jsonl' as const;
export const SERVER_RUNTIME_TEST_INVOCATION_TRACE_MEDIA_TYPE =
  'application/vnd.prodivix.server-function-invocation-traces+jsonl' as const;
export const SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS = Object.freeze({
  maximumBytes: 4 * 1024 * 1024,
  maximumTraces: 10_000,
  maximumLineBytes: 16 * 1024,
});

type Utf8Encoder = Readonly<{ encode(value?: string): Uint8Array }>;
type Utf8Decoder = Readonly<{ decode(value?: Uint8Array): string }>;

const encodeUtf8 = (value: string): Uint8Array => {
  const Encoder = (
    globalThis as unknown as {
      TextEncoder: new () => Utf8Encoder;
    }
  ).TextEncoder;
  return new Encoder().encode(value);
};

const decodeUtf8 = (value: Uint8Array): string => {
  const Decoder = (
    globalThis as unknown as {
      TextDecoder: new (
        label?: string,
        options?: Readonly<{ fatal?: boolean }>
      ) => Utf8Decoder;
    }
  ).TextDecoder;
  return new Decoder('utf-8', { fatal: true }).decode(value);
};

export type ServerFunctionInvocationTraceOutcome =
  'succeeded' | 'failed' | 'cancelled';

export type ServerFunctionInvocationTrace = Readonly<{
  format: typeof SERVER_FUNCTION_INVOCATION_TRACE_FORMAT;
  requestId: string;
  invocationId: string;
  attempt: number;
  functionRef: ServerFunctionReference;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  outcome: ServerFunctionInvocationTraceOutcome;
  resultKind?: ServerFunctionOutcome['kind'];
  errorCode?: string;
  retryable?: boolean;
  redacted: true;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
    ? record
    : undefined;
};

const identifier = (value: unknown, label: string, maximum = 512): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim() ||
    value.includes('\0')
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const timestamp = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value as number;
};

const attempt = (value: unknown): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > SERVER_FUNCTION_MAX_ATTEMPTS
  )
    throw new TypeError('Server Function trace attempt is invalid.');
  return value as number;
};

const functionReference = (value: unknown): ServerFunctionReference => {
  const record = exactRecord(value, ['artifactId', 'exportName']);
  if (!record)
    throw new TypeError('Server Function trace reference is invalid.');
  const artifactId = identifier(
    record.artifactId,
    'Server Function trace artifact id',
    256
  );
  const exportName = identifier(
    record.exportName,
    'Server Function trace export name',
    256
  );
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(artifactId) ||
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)
  )
    throw new TypeError('Server Function trace reference is invalid.');
  return Object.freeze({ artifactId, exportName });
};

const resultKinds = new Set<ServerFunctionOutcome['kind']>([
  'value',
  'allow',
  'deny',
  'redirect',
]);

const normalizeTrace = (
  input: Omit<
    ServerFunctionInvocationTrace,
    'format' | 'durationMs' | 'redacted'
  >
): ServerFunctionInvocationTrace => {
  const invocationId = identifier(
    input.invocationId,
    'Server Function trace invocation id'
  );
  const normalizedAttempt = attempt(input.attempt);
  const requestId = identifier(
    input.requestId,
    'Server Function trace request id'
  );
  if (requestId !== `${invocationId}:${normalizedAttempt}`)
    throw new TypeError('Server Function trace request identity is invalid.');
  const startedAt = timestamp(
    input.startedAt,
    'Server Function trace startedAt'
  );
  const completedAt = timestamp(
    input.completedAt,
    'Server Function trace completedAt'
  );
  if (completedAt < startedAt)
    throw new TypeError(
      'Server Function trace completedAt precedes startedAt.'
    );
  if (!['succeeded', 'failed', 'cancelled'].includes(input.outcome))
    throw new TypeError('Server Function trace outcome is invalid.');
  if (input.outcome === 'succeeded') {
    if (
      !input.resultKind ||
      !resultKinds.has(input.resultKind) ||
      input.errorCode !== undefined ||
      input.retryable !== undefined
    )
      throw new TypeError('Server Function success trace is invalid.');
  } else {
    const errorCode = identifier(
      input.errorCode,
      'Server Function trace error code',
      128
    );
    if (
      !/^[A-Z][A-Z0-9_-]{0,127}$/u.test(errorCode) ||
      typeof input.retryable !== 'boolean' ||
      input.resultKind !== undefined ||
      (input.outcome === 'cancelled') !== (errorCode === 'SVR_CANCELLED')
    )
      throw new TypeError('Server Function failure trace is invalid.');
  }
  return Object.freeze({
    format: SERVER_FUNCTION_INVOCATION_TRACE_FORMAT,
    requestId,
    invocationId,
    attempt: normalizedAttempt,
    functionRef: functionReference(input.functionRef),
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    outcome: input.outcome,
    ...(input.resultKind === undefined ? {} : { resultKind: input.resultKind }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
    redacted: true,
  });
};

/** Creates metadata-only invocation telemetry without copying input, output, principal, or authority. */
export const createServerFunctionInvocationTrace = (input: {
  request: Pick<
    ExecutionServerFunctionBridgeRequest,
    'requestId' | 'invocationId' | 'attempt' | 'functionRef'
  >;
  response: ExecutionServerFunctionBridgeResponse;
  startedAt: number;
  completedAt: number;
}): ServerFunctionInvocationTrace => {
  if (input.response.requestId !== input.request.requestId)
    throw new TypeError('Server Function trace response identity is invalid.');
  return normalizeTrace({
    requestId: input.request.requestId,
    invocationId: input.request.invocationId,
    attempt: input.request.attempt,
    functionRef: input.request.functionRef,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.response.ok
      ? {
          outcome: 'succeeded' as const,
          resultKind: input.response.result.kind,
        }
      : {
          outcome:
            input.response.error.code === 'SVR_CANCELLED'
              ? ('cancelled' as const)
              : ('failed' as const),
          errorCode: input.response.error.code,
          retryable: input.response.error.retryable,
        }),
  });
};

export const toServerFunctionInvocationTraceValue = (
  trace: ServerFunctionInvocationTrace
): ExecutionValue => ({
  format: trace.format,
  requestId: trace.requestId,
  invocationId: trace.invocationId,
  attempt: trace.attempt,
  functionRef: {
    artifactId: trace.functionRef.artifactId,
    exportName: trace.functionRef.exportName,
  },
  startedAt: trace.startedAt,
  completedAt: trace.completedAt,
  durationMs: trace.durationMs,
  outcome: trace.outcome,
  ...(trace.resultKind === undefined ? {} : { resultKind: trace.resultKind }),
  ...(trace.errorCode === undefined ? {} : { errorCode: trace.errorCode }),
  ...(trace.retryable === undefined ? {} : { retryable: trace.retryable }),
  redacted: true,
});

/** Strictly reads only the sanitized trace shape; credential-shaped or provider-private fields are rejected. */
export const readServerFunctionInvocationTraceValue = (
  value: unknown
): ServerFunctionInvocationTrace | undefined => {
  const record = exactRecord(
    value,
    [
      'format',
      'requestId',
      'invocationId',
      'attempt',
      'functionRef',
      'startedAt',
      'completedAt',
      'durationMs',
      'outcome',
      'redacted',
    ],
    ['resultKind', 'errorCode', 'retryable']
  );
  if (
    !record ||
    record.format !== SERVER_FUNCTION_INVOCATION_TRACE_FORMAT ||
    record.redacted !== true
  )
    return undefined;
  try {
    const trace = normalizeTrace({
      requestId: record.requestId as string,
      invocationId: record.invocationId as string,
      attempt: record.attempt as number,
      functionRef: record.functionRef as ServerFunctionReference,
      startedAt: record.startedAt as number,
      completedAt: record.completedAt as number,
      outcome: record.outcome as ServerFunctionInvocationTraceOutcome,
      ...(record.resultKind === undefined
        ? {}
        : { resultKind: record.resultKind as ServerFunctionOutcome['kind'] }),
      ...(record.errorCode === undefined
        ? {}
        : { errorCode: record.errorCode as string }),
      ...(record.retryable === undefined
        ? {}
        : { retryable: record.retryable as boolean }),
    });
    return record.durationMs === trace.durationMs ? trace : undefined;
  } catch {
    return undefined;
  }
};

/** Encodes the deterministic Test producer file without input/output material. */
export const encodeServerRuntimeTestInvocationTraces = (
  traces: readonly ServerFunctionInvocationTrace[]
): Uint8Array => {
  if (traces.length > SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumTraces)
    throw new TypeError(
      'Server Runtime Test invocation trace count is invalid.'
    );
  const lines = traces.map((trace) =>
    JSON.stringify(toServerFunctionInvocationTraceValue(trace))
  );
  if (
    lines.some(
      (line) =>
        encodeUtf8(line).byteLength >
        SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumLineBytes
    )
  )
    throw new TypeError(
      'Server Runtime Test invocation trace line is invalid.'
    );
  const encoded = encodeUtf8(lines.length ? `${lines.join('\n')}\n` : '');
  if (
    encoded.byteLength >
    SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumBytes
  )
    throw new TypeError(
      'Server Runtime Test invocation trace file is invalid.'
    );
  return encoded;
};

/** Strictly decodes the bounded JSONL emitted by deterministic Browser/Remote Test. */
export const decodeServerRuntimeTestInvocationTraces = (
  value: Uint8Array | string
): readonly ServerFunctionInvocationTrace[] => {
  const bytes = typeof value === 'string' ? encodeUtf8(value) : value;
  if (
    bytes.byteLength > SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumBytes
  )
    throw new TypeError(
      'Server Runtime Test invocation trace file is invalid.'
    );
  let text: string;
  try {
    text = typeof value === 'string' ? value : decodeUtf8(value);
  } catch {
    throw new TypeError(
      'Server Runtime Test invocation trace file is invalid.'
    );
  }
  if (!text) return Object.freeze([]);
  if (!text.endsWith('\n'))
    throw new TypeError(
      'Server Runtime Test invocation trace file is incomplete.'
    );
  const lines = text.slice(0, -1).split('\n');
  if (
    lines.length > SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumTraces ||
    lines.some(
      (line) =>
        !line ||
        encodeUtf8(line).byteLength >
          SERVER_RUNTIME_TEST_INVOCATION_TRACE_LIMITS.maximumLineBytes
    )
  )
    throw new TypeError(
      'Server Runtime Test invocation trace file is invalid.'
    );
  const traces = lines.map((line) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line) as unknown;
    } catch {
      throw new TypeError(
        'Server Runtime Test invocation trace file is invalid.'
      );
    }
    const trace = readServerFunctionInvocationTraceValue(decoded);
    if (!trace)
      throw new TypeError(
        'Server Runtime Test invocation trace file is invalid.'
      );
    return trace;
  });
  return Object.freeze(traces);
};
