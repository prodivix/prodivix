import {
  createDataOperationIdempotencyKey,
  type DataConfigurationValue,
  type DataOperationAbortSignal,
  type DataJsonObject,
  type DataJsonValue,
  type DataOperationAdapter,
  type DataPageSnapshot,
} from '@prodivix/data';
import type {
  ExecutionEnvironmentResolutionLease,
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
  label: string,
  field: string,
  environment: ExecutionEnvironmentResolutionLease | undefined
): string => {
  const resolved =
    value?.kind === 'literal'
      ? value.value
      : value?.kind === 'environment-ref' && environment
        ? environment.readPublicBinding(value.reference, field)
        : undefined;
  if (typeof resolved !== 'string' || !resolved || resolved !== resolved.trim())
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      `${label} must resolve to a normalized public string.`
    );
  return resolved;
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

const readResponsePointer = (
  value: DataJsonValue,
  pointer: string
): DataJsonValue | undefined => {
  if (pointer === '') return value;
  if (!pointer.startsWith('/'))
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP response mapping pointer is invalid.'
    );
  let current = value;
  for (const rawToken of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/u.test(rawToken))
      throw new DataHttpOperationError(
        'DATA_HTTP_CONFIGURATION_INVALID',
        'HTTP response mapping pointer is invalid.'
      );
    const token = rawToken.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      current = current[Number(token)]!;
    } else if (
      current !== null &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, token)
    ) {
      current = (current as DataJsonObject)[token]!;
    } else return undefined;
    if (current === undefined) return undefined;
  }
  return current;
};

const pageSnapshot = (
  operation: Parameters<DataOperationAdapter['invoke']>[0]['operation'],
  input: DataJsonValue,
  value: DataJsonValue
): DataPageSnapshot | undefined => {
  const policy = operation.policies.pagination;
  if (!policy) return undefined;
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      'HTTP pagination input must be an object.'
    );
  const record = input as DataJsonObject;
  const limit = record[policy.limitInput];
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1)
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      'HTTP pagination limit is invalid.'
    );
  if (policy.kind === 'offset') {
    const offset = record[policy.offsetInput];
    if (
      typeof offset !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      throw new DataHttpOperationError(
        'DATA_HTTP_INPUT_INVALID',
        'HTTP pagination offset is invalid.'
      );
    if (!policy.totalPath)
      throw new DataHttpOperationError(
        'DATA_HTTP_CONFIGURATION_INVALID',
        'HTTP offset pagination requires totalPath.'
      );
    const total = readResponsePointer(value, policy.totalPath);
    if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)
      throw new DataHttpOperationError(
        'DATA_HTTP_RESPONSE_INVALID',
        'HTTP pagination total is missing or invalid.'
      );
    return Object.freeze({
      kind: 'offset',
      offset,
      limit,
      total,
      hasMore: offset + limit < total,
    });
  }
  const readCursor = (pointer: string | undefined): string | undefined => {
    if (!pointer) return undefined;
    const cursor = readResponsePointer(value, pointer);
    if (cursor === undefined || cursor === null) return undefined;
    if (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim())
      throw new DataHttpOperationError(
        'DATA_HTTP_RESPONSE_INVALID',
        'HTTP pagination cursor is invalid.'
      );
    return cursor;
  };
  const nextCursor = readCursor(policy.nextCursorPath);
  const previousCursor = readCursor(policy.previousCursorPath);
  return Object.freeze({
    kind: 'cursor',
    hasMore: nextCursor !== undefined,
    ...(nextCursor ? { nextCursor } : {}),
    ...(previousCursor ? { previousCursor } : {}),
  });
};

const transportTrace = (error: unknown): ExecutionNetworkTrace | undefined =>
  error && typeof error === 'object' && 'trace' in error
    ? (error as { trace?: ExecutionNetworkTrace }).trace
    : undefined;

const secretConfiguration = (
  value: DataConfigurationValue | undefined,
  label: string
): Extract<DataConfigurationValue, { kind: 'secret-ref' }> | undefined => {
  if (!value) return undefined;
  if (value.kind !== 'secret-ref')
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      `${label} must use a Secret reference.`
    );
  return value;
};

const reservedIdempotencyHeaders = new Set([
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
]);

const idempotencyHeader = (
  value: DataConfigurationValue | undefined,
  environment: ExecutionEnvironmentResolutionLease | undefined
): string => {
  const header = literalString(
    value,
    'HTTP operation idempotencyHeader',
    'operation.idempotencyHeader',
    environment
  );
  if (
    header !== header.toLowerCase() ||
    header.length > 128 ||
    !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(header) ||
    reservedIdempotencyHeaders.has(header)
  )
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP operation idempotencyHeader is unsafe.'
    );
  return header;
};

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
      capabilities: Object.freeze([
        'environment-binding',
        'idempotency-key',
        'network',
      ] as const),
    }),
    async invoke({
      invocation,
      source,
      operation,
      environment,
      signal,
      publishNetworkTrace,
    }) {
      const baseUrl = literalString(
        source.configurationByKey.baseUrl,
        'HTTP source baseUrl',
        'source.baseUrl',
        environment
      );
      const method = literalString(
        operation.configurationByKey.method,
        'HTTP operation method',
        'operation.method',
        environment
      ).toUpperCase();
      const path = literalString(
        operation.configurationByKey.path,
        'HTTP operation path',
        'operation.path',
        environment
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
            'HTTP operation emptyWhen',
            'operation.emptyWhen',
            environment
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
      if (
        operation.configurationByKey.idempotencyHeader &&
        !operation.policies.idempotency
      )
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP idempotencyHeader requires an idempotency policy.'
        );
      const upstreamIdempotency = operation.policies.idempotency
        ? {
            header: idempotencyHeader(
              operation.configurationByKey.idempotencyHeader,
              environment
            ),
            key: createDataOperationIdempotencyKey(invocation),
          }
        : undefined;
      const authorization = secretConfiguration(
        source.configurationByKey.authorization,
        'HTTP source authorization'
      );
      if (authorization && !environment)
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP source authorization requires an environment lease.'
        );
      const correlation = {
        kind: 'data-operation' as const,
        documentId: invocation.operation.documentId,
        operationId: invocation.operation.operationId,
        invocationId: invocation.invocationId,
        sequence: invocation.sequence,
        attempt: invocation.attempt,
      };
      const executeTransport = async (
        authorizationMaterial?: string
      ): Promise<DataHttpTransportResponse> => {
        try {
          return await input.transport.execute({
            requestId: `${invocation.invocationId}:${invocation.attempt}`,
            url: url.toString(),
            method,
            ...(!authorizationMaterial && body === undefined
              ? {}
              : {
                  headers: {
                    ...(body === undefined
                      ? {}
                      : { 'content-type': 'application/json' }),
                    ...(authorizationMaterial
                      ? { authorization: authorizationMaterial }
                      : {}),
                    ...(upstreamIdempotency
                      ? {
                          [upstreamIdempotency.header]: upstreamIdempotency.key,
                        }
                      : {}),
                  },
                }),
            ...(body === undefined ? {} : { body }),
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
      };
      let response: DataHttpTransportResponse | undefined;
      if (authorization && environment)
        await environment.useSecret(
          authorization.reference,
          'source.authorization',
          async (material) => {
            response = await executeTransport(material);
          }
        );
      else response = await executeTransport();
      if (!response)
        throw new DataHttpOperationError(
          'DATA_HTTP_REQUEST_FAILED',
          'HTTP Data operation request failed.'
        );
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
      const value = readJson(response.text);
      const page = pageSnapshot(operation, invocation.input, value);
      return Object.freeze({
        value,
        empty: emptyWhen === 'status-204' && response.status === 204,
        ...(page ? { page } : {}),
      });
    },
  });
