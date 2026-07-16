import {
  type DataConfigurationValue,
  type DataOperationAbortSignal,
  type DataJsonObject,
  type DataJsonValue,
  type DataOperationAdapter,
} from '@prodivix/data';
import type {
  ExecutionNetworkCorrelation,
  ExecutionNetworkTrace,
  ExecutionSourceTrace,
  RuntimeZone,
} from '@prodivix/runtime-core';

export const DATA_HTTP_ADAPTER_ID = 'core.http' as const;

export type DataHttpTransportRequest = Readonly<{
  requestId: string;
  url: string;
  method: string;
  headers?: Readonly<Record<string, string>>;
  body?: string;
  signal?: DataOperationAbortSignal;
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  adapter: string;
  correlation?: ExecutionNetworkCorrelation;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type DataHttpTransportResponse = Readonly<{
  status: number;
  ok: boolean;
  text: string;
  trace: ExecutionNetworkTrace;
}>;

export type DataHttpTransport = Readonly<{
  execute(
    request: DataHttpTransportRequest
  ): Promise<DataHttpTransportResponse>;
}>;

export class DataHttpOperationError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: Readonly<{ status?: number; retryable?: boolean }> = {}
  ) {
    super(message);
    this.name = 'DataHttpOperationError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const literalString = (
  value: DataConfigurationValue | undefined,
  label: string
): string => {
  if (
    !value ||
    value.kind !== 'literal' ||
    typeof value.value !== 'string' ||
    !value.value ||
    value.value !== value.value.trim()
  )
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      `${label} must be a literal normalized string.`
    );
  return value.value;
};

const endpoint = (baseUrl: string, path: string): URL => {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP baseUrl must be absolute.'
    );
  }
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:') ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP baseUrl contains unsupported authority or URL fields.'
    );
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP operation path must be origin-relative.'
    );
  return new URL(path, base);
};

const appendQuery = (url: URL, input: DataJsonValue): void => {
  if (input === null) return;
  if (typeof input !== 'object' || Array.isArray(input))
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      'HTTP query input must be an object.'
    );
  for (const [key, value] of Object.entries(input as DataJsonObject).sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    )
      throw new DataHttpOperationError(
        'DATA_HTTP_INPUT_INVALID',
        `HTTP query input ${key} must be scalar.`
      );
    if (value !== null) url.searchParams.append(key, String(value));
  }
};

const freezeJson = (value: DataJsonValue): DataJsonValue => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return Object.freeze(value.map((entry) => freezeJson(entry)));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)])
    )
  );
};

const readJson = (text: string): DataJsonValue => {
  if (!text) return null;
  try {
    return freezeJson(JSON.parse(text) as DataJsonValue);
  } catch {
    throw new DataHttpOperationError(
      'DATA_HTTP_RESPONSE_INVALID',
      'HTTP response is not valid JSON.'
    );
  }
};

const transportTrace = (error: unknown): ExecutionNetworkTrace | undefined =>
  error && typeof error === 'object' && 'trace' in error
    ? (error as { trace?: ExecutionNetworkTrace }).trace
    : undefined;

/** Maps one canonical Data operation to HTTP without exposing protocol details to the Data kernel. */
export const createDataHttpAdapter = (input: {
  transport: DataHttpTransport;
}): DataOperationAdapter =>
  Object.freeze({
    descriptor: Object.freeze({
      id: DATA_HTTP_ADAPTER_ID,
      version: '1',
      operationKinds: Object.freeze(['query', 'mutation'] as const),
      runtimeZones: Object.freeze([
        'client',
        'server',
        'edge',
        'test',
      ] as const),
      modes: Object.freeze(['live'] as const),
      capabilities: Object.freeze(['network'] as const),
    }),
    async invoke({
      invocation,
      source,
      operation,
      signal,
      publishNetworkTrace,
    }) {
      const baseUrl = literalString(
        source.configurationByKey.baseUrl,
        'HTTP source baseUrl'
      );
      const method = literalString(
        operation.configurationByKey.method,
        'HTTP operation method'
      ).toUpperCase();
      const path = literalString(
        operation.configurationByKey.path,
        'HTTP operation path'
      );
      const allowedMethods =
        operation.kind === 'query'
          ? new Set(['GET', 'HEAD'])
          : new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
      if (!allowedMethods.has(method))
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          `HTTP ${operation.kind} method is unsupported.`
        );
      const emptyWhen = operation.configurationByKey.emptyWhen
        ? literalString(
            operation.configurationByKey.emptyWhen,
            'HTTP operation emptyWhen'
          )
        : 'never';
      if (!['never', 'status-204'].includes(emptyWhen))
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP operation emptyWhen is unsupported.'
        );
      const url = endpoint(baseUrl, path);
      if (operation.kind === 'query') appendQuery(url, invocation.input);
      const body =
        operation.kind === 'mutation'
          ? JSON.stringify(invocation.input)
          : undefined;
      const correlation = {
        kind: 'data-operation' as const,
        documentId: invocation.operation.documentId,
        operationId: invocation.operation.operationId,
        invocationId: invocation.invocationId,
        sequence: invocation.sequence,
        attempt: invocation.attempt,
      };
      let response: DataHttpTransportResponse;
      try {
        response = await input.transport.execute({
          requestId: `${invocation.invocationId}:${invocation.attempt}`,
          url: url.toString(),
          method,
          ...(body === undefined
            ? {}
            : {
                body,
                headers: { 'content-type': 'application/json' },
              }),
          signal,
          runtimeZone: invocation.runtimeZone,
          mode: invocation.mode,
          adapter: DATA_HTTP_ADAPTER_ID,
          correlation,
          ...(invocation.sourceTrace
            ? { sourceTrace: invocation.sourceTrace }
            : {}),
        });
      } catch (error) {
        const trace = transportTrace(error);
        if (trace) publishNetworkTrace(trace);
        throw new DataHttpOperationError(
          'DATA_HTTP_REQUEST_FAILED',
          'HTTP Data operation request failed.',
          { retryable: true }
        );
      }
      publishNetworkTrace(response.trace);
      if (!response.ok)
        throw new DataHttpOperationError(
          'DATA_HTTP_STATUS_FAILED',
          `HTTP Data operation returned status ${response.status}.`,
          {
            status: response.status,
            retryable:
              response.status === 408 ||
              response.status === 429 ||
              response.status >= 500,
          }
        );
      return Object.freeze({
        value: readJson(response.text),
        empty: emptyWhen === 'status-204' && response.status === 204,
      });
    },
  });
