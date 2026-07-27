import {
  compareDataText,
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
    ([left], [right]) => compareDataText(left, right)
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

type DataHttpParameterLocation = 'path' | 'query' | 'header';
type DataHttpParameterMappings = Readonly<
  Record<DataHttpParameterLocation, Readonly<Record<string, string>>>
>;

const isJsonObject = (value: DataJsonValue): value is DataJsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readParameterMappings = (
  value: DataConfigurationValue | undefined
): DataHttpParameterMappings | undefined => {
  if (!value) return undefined;
  if (value.kind !== 'literal' || !isJsonObject(value.value))
    throw new DataHttpOperationError(
      'DATA_HTTP_CONFIGURATION_INVALID',
      'HTTP parameterMappings must be a literal object.'
    );
  const allowedLocations = new Set<DataHttpParameterLocation>([
    'path',
    'query',
    'header',
  ]);
  const result: Record<
    DataHttpParameterLocation,
    Readonly<Record<string, string>>
  > = {
    path: Object.freeze({}),
    query: Object.freeze({}),
    header: Object.freeze({}),
  };
  for (const [location, rawMappings] of Object.entries(value.value)) {
    if (!allowedLocations.has(location as DataHttpParameterLocation))
      throw new DataHttpOperationError(
        'DATA_HTTP_CONFIGURATION_INVALID',
        'HTTP parameterMappings contains an unsupported location.'
      );
    if (!isJsonObject(rawMappings))
      throw new DataHttpOperationError(
        'DATA_HTTP_CONFIGURATION_INVALID',
        'HTTP parameter location mapping must be an object.'
      );
    const mappings: Record<string, string> = {};
    for (const [wireName, pointer] of Object.entries(rawMappings)) {
      if (
        !wireName ||
        wireName !== wireName.trim() ||
        typeof pointer !== 'string' ||
        !pointer.startsWith('/') ||
        /~(?:[^01]|$)/u.test(pointer)
      )
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP parameter mapping names and JSON Pointers must be canonical.'
        );
      if (
        location === 'header' &&
        (wireName !== wireName.toLowerCase() ||
          wireName.length > 128 ||
          !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(wireName) ||
          DATA_HTTP_RESERVED_HEADER_NAMES.has(wireName))
      )
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP header parameter mapping is unsafe.'
        );
      mappings[wireName] = pointer;
    }
    result[location as DataHttpParameterLocation] = Object.freeze(mappings);
  }
  return Object.freeze(result);
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

const scalarParameterValue = (
  input: DataJsonValue,
  pointer: string,
  label: string,
  required: boolean
): string | undefined => {
  const value = readResponsePointer(input, pointer);
  if (value === undefined || value === null) {
    if (required)
      throw new DataHttpOperationError(
        'DATA_HTTP_INPUT_INVALID',
        `HTTP ${label} parameter is missing.`
      );
    return undefined;
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  )
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      `HTTP ${label} parameter must be scalar.`
    );
  const result = String(value);
  if (result.includes('\r') || result.includes('\n'))
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      `HTTP ${label} parameter contains a line break.`
    );
  return result;
};

const mapHttpRequest = (
  path: string,
  input: DataJsonValue,
  operationKind: 'query' | 'mutation',
  mappings: DataHttpParameterMappings | undefined,
  bodyInputPath: string | undefined
): Readonly<{
  path: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: DataJsonValue;
}> => {
  if (!mappings && !bodyInputPath) {
    return Object.freeze({
      path,
      query: Object.freeze({}),
      headers: Object.freeze({}),
      ...(operationKind === 'mutation' ? { body: input } : {}),
    });
  }
  let mappedPath = path;
  const query: Record<string, string> = {};
  const headers: Record<string, string> = {};
  for (const [wireName, pointer] of Object.entries(mappings?.path ?? {})) {
    const value = scalarParameterValue(input, pointer, 'path', true)!;
    const token = `{${wireName}}`;
    if (!mappedPath.includes(token))
      throw new DataHttpOperationError(
        'DATA_HTTP_CONFIGURATION_INVALID',
        'HTTP path parameter mapping does not match the path template.'
      );
    mappedPath = mappedPath.replaceAll(token, encodeURIComponent(value));
  }
  if (/[{}]/u.test(mappedPath))
    throw new DataHttpOperationError(
      'DATA_HTTP_INPUT_INVALID',
      'HTTP path template contains an unresolved parameter.'
    );
  for (const [wireName, pointer] of Object.entries(mappings?.query ?? {})) {
    const value = scalarParameterValue(input, pointer, 'query', false);
    if (value !== undefined) query[wireName] = value;
  }
  for (const [wireName, pointer] of Object.entries(mappings?.header ?? {})) {
    const value = scalarParameterValue(input, pointer, 'header', false);
    if (value !== undefined) headers[wireName] = value;
  }
  const body = bodyInputPath
    ? readResponsePointer(input, bodyInputPath)
    : undefined;
  return Object.freeze({
    path: mappedPath,
    query: Object.freeze(query),
    headers: Object.freeze(headers),
    ...(body === undefined ? {} : { body }),
  });
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

export const DATA_HTTP_RESERVED_HEADER_NAMES: ReadonlySet<string> = new Set([
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

const safeHeaderName = (value: string): boolean =>
  value === value.toLowerCase() &&
  value.length <= 128 &&
  /^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(value) &&
  !DATA_HTTP_RESERVED_HEADER_NAMES.has(value);

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
    DATA_HTTP_RESERVED_HEADER_NAMES.has(header)
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
      if (operation.kind === 'subscription')
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP adapter does not implement subscription operations.'
        );
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
      const parameterMappings = readParameterMappings(
        operation.configurationByKey.parameterMappings
      );
      const bodyInputPath = operation.configurationByKey.bodyInputPath
        ? literalString(
            operation.configurationByKey.bodyInputPath,
            'HTTP operation bodyInputPath',
            'operation.bodyInputPath',
            environment
          )
        : undefined;
      const mappedRequest = mapHttpRequest(
        path,
        invocation.input,
        operation.kind,
        parameterMappings,
        bodyInputPath
      );
      const url = endpoint(baseUrl, mappedRequest.path);
      if (parameterMappings) {
        for (const [key, value] of Object.entries(mappedRequest.query))
          url.searchParams.append(key, value);
      } else if (operation.kind === 'query') appendQuery(url, invocation.input);
      const body =
        mappedRequest.body === undefined
          ? undefined
          : JSON.stringify(mappedRequest.body);
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
      const authorizationField = operation.configurationByKey.authorization
        ? 'operation.authorization'
        : 'source.authorization';
      const authorization = secretConfiguration(
        operation.configurationByKey.authorization ??
          source.configurationByKey.authorization,
        'HTTP source authorization'
      );
      const apiKey = secretConfiguration(
        operation.configurationByKey.apiKey ?? source.configurationByKey.apiKey,
        'HTTP source API key'
      );
      if (authorization && apiKey)
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP operations cannot combine authorization and API key Secret injection.'
        );
      const apiKeyHeader = apiKey
        ? literalString(
            operation.configurationByKey.apiKeyHeader ??
              source.configurationByKey.apiKeyHeader,
            'HTTP API key header',
            operation.configurationByKey.apiKeyHeader
              ? 'operation.apiKeyHeader'
              : 'source.apiKeyHeader',
            environment
          )
        : undefined;
      if (apiKeyHeader && !safeHeaderName(apiKeyHeader))
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP API key header is unsafe.'
        );
      if (authorization && !environment)
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP source authorization requires an environment lease.'
        );
      if (apiKey && !environment)
        throw new DataHttpOperationError(
          'DATA_HTTP_CONFIGURATION_INVALID',
          'HTTP source API key requires an environment lease.'
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
        secretMaterial?: string
      ): Promise<DataHttpTransportResponse> => {
        const headers: Record<string, string> = {
          ...mappedRequest.headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(authorization && secretMaterial
            ? { authorization: secretMaterial }
            : {}),
          ...(apiKey && apiKeyHeader && secretMaterial
            ? { [apiKeyHeader]: secretMaterial }
            : {}),
          ...(upstreamIdempotency
            ? { [upstreamIdempotency.header]: upstreamIdempotency.key }
            : {}),
        };
        try {
          return await input.transport.execute({
            requestId: `${invocation.invocationId}:${invocation.attempt}`,
            url: url.toString(),
            method,
            ...(Object.keys(headers).length ? { headers } : {}),
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
          authorizationField,
          async (material) => {
            response = await executeTransport(material);
          }
        );
      else if (apiKey && environment)
        await environment.useSecret(
          apiKey.reference,
          operation.configurationByKey.apiKey
            ? 'operation.apiKey'
            : 'source.apiKey',
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
      const rawValue = readJson(response.text);
      const responseBodyPath = operation.configurationByKey.responseBodyPath
        ? literalString(
            operation.configurationByKey.responseBodyPath,
            'HTTP operation responseBodyPath',
            'operation.responseBodyPath',
            environment
          )
        : undefined;
      const value = responseBodyPath
        ? readResponsePointer(rawValue, responseBodyPath)
        : rawValue;
      if (value === undefined)
        throw new DataHttpOperationError(
          'DATA_HTTP_RESPONSE_INVALID',
          'HTTP response body mapping did not resolve.'
        );
      const page = pageSnapshot(operation, invocation.input, value);
      return Object.freeze({
        value,
        empty: emptyWhen === 'status-204' && response.status === 204,
        ...(page ? { page } : {}),
      });
    },
  });
