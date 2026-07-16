import type {
  ExecutionSourceTrace,
  ExecutionValue,
  RuntimeZone,
} from './execution.types';
import { RUNTIME_ZONES } from './execution.types';

export const EXECUTION_NETWORK_TRACE_NAME = 'network.request' as const;
export const EXECUTION_NETWORK_TRACE_FORMAT =
  'prodivix.execution-network-trace.v1' as const;

export type ExecutionNetworkTraceOutcome = 'allowed' | 'denied' | 'failed';

export type ExecutionNetworkCorrelation = Readonly<{
  kind: 'data-operation';
  documentId: string;
  operationId: string;
  invocationId: string;
  sequence: number;
  attempt: number;
}>;

export type ExecutionNetworkTrace = Readonly<{
  format: typeof EXECUTION_NETWORK_TRACE_FORMAT;
  requestId: string;
  phase: 'dependency-install' | 'runtime';
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  adapter: string;
  method: string;
  sanitizedUrl: string;
  protocol: 'http' | 'https';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  outcome: ExecutionNetworkTraceOutcome;
  status?: number;
  requestBytes?: number;
  responseBytes?: number;
  correlation?: ExecutionNetworkCorrelation;
  redacted: true;
  truncated?: boolean;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

const normalized = (value: unknown, label: string, maximum = 4_096): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > maximum ||
    value.includes('\0')
  )
    throw new TypeError(`${label} must be a normalized string.`);
  return value;
};

const safeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value as number;
};

const correlation = (
  value: ExecutionNetworkCorrelation | undefined
): ExecutionNetworkCorrelation | undefined => {
  if (!value) return undefined;
  if (value.kind !== 'data-operation')
    throw new TypeError('Network trace correlation kind is unsupported.');
  const attempt = safeInteger(value.attempt, 'Network correlation attempt');
  if (attempt < 1)
    throw new TypeError('Network correlation attempt must be positive.');
  return Object.freeze({
    kind: value.kind,
    documentId: normalized(value.documentId, 'Network correlation documentId'),
    operationId: normalized(
      value.operationId,
      'Network correlation operationId'
    ),
    invocationId: normalized(
      value.invocationId,
      'Network correlation invocationId'
    ),
    sequence: safeInteger(value.sequence, 'Network correlation sequence'),
    attempt,
  });
};

const sanitizeUrl = (value: unknown): string => {
  const source = normalized(value, 'Execution network sanitizedUrl');
  let url: Readonly<{
    protocol: string;
    username: string;
    password: string;
    search: string;
    hash: string;
    pathname: string;
    toString(): string;
  }>;
  try {
    const Url = (
      globalThis as unknown as {
        URL: new (source: string) => typeof url;
      }
    ).URL;
    url = new Url(source);
  } catch {
    throw new TypeError(
      'Execution network sanitizedUrl must be an absolute URL.'
    );
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new TypeError(
      'Execution network sanitizedUrl must contain only scheme, host, optional port, and root path.'
    );
  return url.toString();
};

/** Creates metadata-only Network Devtools data that cannot carry headers, queries, bodies, or credentials. */
export const createExecutionNetworkTrace = (
  input: Omit<ExecutionNetworkTrace, 'format' | 'durationMs' | 'redacted'>
): ExecutionNetworkTrace => {
  const startedAt = safeInteger(input.startedAt, 'Network trace startedAt');
  const completedAt = safeInteger(
    input.completedAt,
    'Network trace completedAt'
  );
  if (completedAt < startedAt)
    throw new TypeError('Network trace completedAt precedes startedAt.');
  if (!['dependency-install', 'runtime'].includes(input.phase))
    throw new TypeError('Network trace phase is unsupported.');
  if (!(RUNTIME_ZONES as readonly RuntimeZone[]).includes(input.runtimeZone))
    throw new TypeError('Network trace runtime zone is unsupported.');
  if (!['mock', 'live'].includes(input.mode))
    throw new TypeError('Network trace mode is unsupported.');
  if (!['http', 'https'].includes(input.protocol))
    throw new TypeError('Network trace protocol is unsupported.');
  if (!['allowed', 'denied', 'failed'].includes(input.outcome))
    throw new TypeError('Network trace outcome is unsupported.');
  if (input.status !== undefined && (input.status < 100 || input.status > 599))
    throw new TypeError('Network trace status is invalid.');
  return Object.freeze({
    format: EXECUTION_NETWORK_TRACE_FORMAT,
    requestId: normalized(input.requestId, 'Network trace requestId'),
    phase: input.phase,
    runtimeZone: input.runtimeZone,
    mode: input.mode,
    adapter: normalized(input.adapter, 'Network trace adapter', 256),
    method: normalized(input.method, 'Network trace method', 32).toUpperCase(),
    sanitizedUrl: sanitizeUrl(input.sanitizedUrl),
    protocol: input.protocol,
    startedAt,
    completedAt,
    durationMs: completedAt - startedAt,
    outcome: input.outcome,
    ...(input.status === undefined
      ? {}
      : { status: safeInteger(input.status, 'Network trace status') }),
    ...(input.requestBytes === undefined
      ? {}
      : {
          requestBytes: safeInteger(
            input.requestBytes,
            'Network trace requestBytes'
          ),
        }),
    ...(input.responseBytes === undefined
      ? {}
      : {
          responseBytes: safeInteger(
            input.responseBytes,
            'Network trace responseBytes'
          ),
        }),
    ...(input.correlation
      ? { correlation: correlation(input.correlation) }
      : {}),
    redacted: true,
    ...(input.truncated === undefined
      ? {}
      : { truncated: input.truncated === true }),
    ...(input.sourceTrace
      ? { sourceTrace: Object.freeze([...input.sourceTrace]) }
      : {}),
  });
};

export const toExecutionNetworkTraceValue = (
  trace: ExecutionNetworkTrace
): ExecutionValue => ({
  format: trace.format,
  requestId: trace.requestId,
  phase: trace.phase,
  runtimeZone: trace.runtimeZone,
  mode: trace.mode,
  adapter: trace.adapter,
  method: trace.method,
  sanitizedUrl: trace.sanitizedUrl,
  protocol: trace.protocol,
  startedAt: trace.startedAt,
  completedAt: trace.completedAt,
  durationMs: trace.durationMs,
  outcome: trace.outcome,
  ...(trace.status === undefined ? {} : { status: trace.status }),
  ...(trace.requestBytes === undefined
    ? {}
    : { requestBytes: trace.requestBytes }),
  ...(trace.responseBytes === undefined
    ? {}
    : { responseBytes: trace.responseBytes }),
  ...(trace.correlation
    ? {
        correlation: {
          kind: trace.correlation.kind,
          documentId: trace.correlation.documentId,
          operationId: trace.correlation.operationId,
          invocationId: trace.correlation.invocationId,
          sequence: trace.correlation.sequence,
          attempt: trace.correlation.attempt,
        },
      }
    : {}),
  redacted: true,
  ...(trace.truncated === undefined ? {} : { truncated: trace.truncated }),
});

/** Reads a Network trace from an untrusted transport value and rejects field or redaction drift. */
export const readExecutionNetworkTraceValue = (
  value: unknown
): ExecutionNetworkTrace | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'format',
    'requestId',
    'phase',
    'runtimeZone',
    'mode',
    'adapter',
    'method',
    'sanitizedUrl',
    'protocol',
    'startedAt',
    'completedAt',
    'durationMs',
    'outcome',
    'status',
    'requestBytes',
    'responseBytes',
    'correlation',
    'redacted',
    'truncated',
  ]);
  if (
    Object.keys(record).some((key) => !allowed.has(key)) ||
    record.format !== EXECUTION_NETWORK_TRACE_FORMAT ||
    record.redacted !== true ||
    !(RUNTIME_ZONES as readonly unknown[]).includes(record.runtimeZone) ||
    (record.truncated !== undefined && typeof record.truncated !== 'boolean')
  )
    return undefined;
  try {
    const trace = createExecutionNetworkTrace({
      requestId: record.requestId as string,
      phase: record.phase as ExecutionNetworkTrace['phase'],
      runtimeZone: record.runtimeZone as RuntimeZone,
      mode: record.mode as ExecutionNetworkTrace['mode'],
      adapter: record.adapter as string,
      method: record.method as string,
      sanitizedUrl: record.sanitizedUrl as string,
      protocol: record.protocol as ExecutionNetworkTrace['protocol'],
      startedAt: record.startedAt as number,
      completedAt: record.completedAt as number,
      outcome: record.outcome as ExecutionNetworkTraceOutcome,
      ...(record.status === undefined
        ? {}
        : { status: record.status as number }),
      ...(record.requestBytes === undefined
        ? {}
        : { requestBytes: record.requestBytes as number }),
      ...(record.responseBytes === undefined
        ? {}
        : { responseBytes: record.responseBytes as number }),
      ...(record.correlation === undefined
        ? {}
        : {
            correlation: (() => {
              if (
                !record.correlation ||
                typeof record.correlation !== 'object' ||
                Array.isArray(record.correlation)
              )
                throw new TypeError('Network trace correlation is invalid.');
              const value = record.correlation as Record<string, unknown>;
              if (
                Object.keys(value).some(
                  (key) =>
                    ![
                      'kind',
                      'documentId',
                      'operationId',
                      'invocationId',
                      'sequence',
                      'attempt',
                    ].includes(key)
                )
              )
                throw new TypeError(
                  'Network trace correlation has unknown fields.'
                );
              return value as unknown as ExecutionNetworkCorrelation;
            })(),
          }),
      ...(record.truncated === undefined
        ? {}
        : { truncated: record.truncated as boolean }),
    });
    return record.durationMs === trace.durationMs ? trace : undefined;
  } catch {
    return undefined;
  }
};
