import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const projectConfiguration = (
  values: Readonly<Record<string, Readonly<{ kind: string; value?: unknown }>>>
): Readonly<Record<string, Readonly<{ kind: string; value?: unknown }>>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(values)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, value]) => [
          key,
          value.kind === 'literal'
            ? Object.freeze({ kind: value.kind, value: value.value })
            : Object.freeze({ kind: value.kind }),
        ])
    )
  );

/** Projects only public Data contract fields; environment and Secret identities never enter client source. */
export const projectStandaloneDataDocuments = (
  workspace: WorkspaceSnapshot
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(
      Object.values(workspace.docsById)
        .filter((document) => document.type === 'data-source')
        .sort((left, right) => compareText(left.id, right.id))
        .flatMap((document) => {
          const read = decodeWorkspaceDataSourceDocument(document);
          if (read.status !== 'valid') return [];
          const value = read.decodedContent;
          return [
            [
              document.id,
              Object.freeze({
                revision: `${document.contentRev}.${document.metaRev}`,
                source: Object.freeze({
                  adapterId: value.source.adapterId,
                  runtimeZone: value.source.runtimeZone,
                  configurationByKey: projectConfiguration(
                    value.source.configurationByKey
                  ),
                }),
                schemasById: value.schemasById,
                operationsById: Object.freeze(
                  Object.fromEntries(
                    Object.values(value.operationsById)
                      .sort((left, right) => compareText(left.id, right.id))
                      .map((operation) => [
                        operation.id,
                        Object.freeze({
                          id: operation.id,
                          kind: operation.kind,
                          ...(operation.inputSchemaId
                            ? { inputSchemaId: operation.inputSchemaId }
                            : {}),
                          outputSchemaId: operation.outputSchemaId,
                          configurationByKey: projectConfiguration(
                            operation.configurationByKey
                          ),
                          policies: operation.policies,
                        }),
                      ])
                  )
                ),
              }),
            ],
          ];
        })
    )
  );

export const STANDALONE_DATA_LIVE_RUNTIME_SOURCE = String.raw`
type DataRuntimeConfigurationValue =
  | Readonly<{ kind: 'literal'; value: unknown }>
  | Readonly<{ kind: 'environment-ref' | 'secret-ref' }>;

type DataRuntimePaginationPolicy =
  | Readonly<{ kind: 'offset'; offsetInput: string; limitInput: string; defaultLimit: number; maxLimit?: number; totalPath?: string }>
  | Readonly<{ kind: 'cursor'; cursorInput: string; limitInput: string; defaultLimit: number; maxLimit?: number; nextCursorPath: string; previousCursorPath?: string }>;

type DataRuntimeCachePolicy = Readonly<{
  strategy: 'no-store' | 'cache-first' | 'network-first' | 'stale-while-revalidate';
  ttlMs?: number;
  staleWhileRevalidateMs?: number;
  keyInputPaths?: readonly string[];
}>;

type DataRuntimeOperation = Readonly<{
  id: string;
  kind: 'query' | 'mutation';
  inputSchemaId?: string;
  outputSchemaId: string;
  configurationByKey: Readonly<Record<string, DataRuntimeConfigurationValue>>;
  policies: Readonly<{
    cache?: DataRuntimeCachePolicy;
    retry?: Readonly<{ maxAttempts: number; backoff: 'fixed' | 'exponential'; initialDelayMs: number; maxDelayMs?: number }>;
    idempotency?: Readonly<{ kind: 'invocation-key' }>;
    pagination?: DataRuntimePaginationPolicy;
    optimistic?: Readonly<{
      kind: 'crud';
      action: 'create' | 'update' | 'delete';
      target: DataOperationReference;
      entityIdPath?: string;
      valueInputPath?: string;
      valueOutputPath?: string;
      placement?: 'start' | 'end';
      rollback: 'on-error';
    }>;
  }>;
}>;

type DataRuntimeDocument = Readonly<{
  revision: string;
  source: Readonly<{
    adapterId: string;
    runtimeZone: string;
    configurationByKey: Readonly<Record<string, DataRuntimeConfigurationValue>>;
  }>;
  schemasById: Readonly<Record<string, Readonly<{ schema: unknown }>>>;
  operationsById: Readonly<Record<string, DataRuntimeOperation>>;
}>;

type DataRuntimeResult = Readonly<{ value: unknown; empty: boolean; page?: unknown }>;
type DataRuntimeManifest = Readonly<{ format: 'prodivix.executable-data-runtime.v1'; mode: 'mock' | 'live' }>;
type DataRuntimeNetworkTrace = Readonly<{
  format: 'prodivix.execution-network-trace.v1';
  requestId: string;
  phase: 'runtime';
  runtimeZone: 'client' | 'server' | 'edge';
  mode: 'live';
  adapter: 'core.http';
  method: string;
  sanitizedUrl: string;
  protocol: 'http' | 'https';
  startedAt: number;
  completedAt: number;
  durationMs: number;
  outcome: 'allowed' | 'failed';
  status?: number;
  requestBytes?: number;
  responseBytes?: number;
  correlation: Readonly<{
    kind: 'data-operation';
    documentId: string;
    operationId: string;
    invocationId: string;
    sequence: number;
    attempt: number;
  }>;
  redacted: true;
  truncated?: boolean;
}>;

type DataGatewayBridgeResponse = Readonly<{
  type: 'prodivix.execution-data-gateway-response.v1';
  requestId: string;
  ok: boolean;
  result?: Readonly<{ value: unknown; empty: boolean; network: DataRuntimeNetworkTrace }>;
  error?: Readonly<{ code: string; retryable: boolean }>;
}>;

class DataRuntimeFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, retryable = false) {
    super(code);
    this.name = 'DataRuntimeFailure';
    this.code = code;
    this.retryable = retryable;
  }
}

const remoteGatewaySafeErrorCodes = new Set([
  'DATA_REMOTE_GATEWAY_UNAVAILABLE',
  'DATA_REMOTE_GATEWAY_DENIED',
  'DATA_REMOTE_GATEWAY_INVALID',
  'DATA_HTTP_REQUEST_FAILED',
  'DATA_MUTATION_REPLAY_CONFLICT',
  'DATA_MUTATION_REPLAY_UNSAFE',
  'DATA_MUTATION_REPLAY_CAPACITY',
]);

const runtimeFailureCode = (error: unknown): string => {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as Readonly<{ code?: unknown }>).code
    : undefined;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(code)
    ? code
    : error instanceof Error && /^[A-Z][A-Z0-9_]{0,127}$/u.test(error.message)
      ? error.message
      : 'DATA_OPERATION_FAILED';
};

const runtimeManifestUrl = '/.prodivix/data-runtime.json';

const loadDataRuntimeManifest = async (): Promise<DataRuntimeManifest> => {
  const response = await fetch(runtimeManifestUrl, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if (response.status === 404)
    return Object.freeze({ format: 'prodivix.executable-data-runtime.v1', mode: 'live' });
  if (!response.ok) throw new DataRuntimeFailure('DATA_RUNTIME_MANIFEST_UNAVAILABLE');
  const value = await response.json() as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DataRuntimeFailure('DATA_RUNTIME_MANIFEST_INVALID');
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !['format', 'mode'].includes(key)) ||
    record.format !== 'prodivix.executable-data-runtime.v1' ||
    !['mock', 'live'].includes(record.mode as string)
  ) throw new DataRuntimeFailure('DATA_RUNTIME_MANIFEST_INVALID');
  return Object.freeze({ format: record.format, mode: record.mode as 'mock' | 'live' });
};

const literalConfiguration = (
  value: DataRuntimeConfigurationValue | undefined,
  code = 'DATA_HTTP_CONFIGURATION_INVALID'
): unknown => {
  if (!value || value.kind !== 'literal')
    throw new DataRuntimeFailure(
      value?.kind === 'environment-ref' || value?.kind === 'secret-ref'
        ? 'DATA_STANDALONE_ENVIRONMENT_UNAVAILABLE'
        : code
    );
  return cloneJson(value.value);
};

const literalConfigurationString = (
  value: DataRuntimeConfigurationValue | undefined
): string => {
  const resolved = literalConfiguration(value);
  if (typeof resolved !== 'string' || !resolved || resolved !== resolved.trim())
    throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  return resolved;
};

const optionalPointer = (value: unknown, pointer: string): unknown => {
  try {
    return selectPointer(value, pointer);
  } catch (error) {
    if (runtimeFailureCode(error) === 'DATA_INPUT_VALUE_MISSING') return undefined;
    throw error;
  }
};

const paginationInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum?: number
): number => {
  const candidate = value === undefined ? fallback : value;
  if (
    typeof candidate !== 'number' ||
    !Number.isSafeInteger(candidate) ||
    candidate < minimum ||
    (maximum !== undefined && candidate > maximum)
  ) throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  return candidate;
};

const applyPaginationInput = (input: unknown, policy?: DataRuntimePaginationPolicy): unknown => {
  if (!policy) return cloneJson(input);
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  const record = input as Readonly<Record<string, unknown>>;
  const positionKey = policy.kind === 'offset' ? policy.offsetInput : policy.cursorInput;
  if (positionKey === policy.limitInput)
    throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  const limit = paginationInteger(record[policy.limitInput], policy.defaultLimit, 1, policy.maxLimit);
  if (policy.kind === 'offset') {
    const offset = paginationInteger(record[policy.offsetInput], 0, 0);
    return cloneJson({ ...record, [policy.offsetInput]: offset, [policy.limitInput]: limit });
  }
  const cursor = record[policy.cursorInput];
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim()))
    throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  return cloneJson({ ...record, [policy.limitInput]: limit });
};

const projectHttpPage = (
  operation: DataRuntimeOperation,
  input: unknown,
  value: unknown
): unknown => {
  const policy = operation.policies.pagination;
  if (!policy) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  const record = input as Readonly<Record<string, unknown>>;
  const limit = paginationInteger(record[policy.limitInput], policy.defaultLimit, 1, policy.maxLimit);
  if (policy.kind === 'offset') {
    const offset = paginationInteger(record[policy.offsetInput], 0, 0);
    if (!policy.totalPath) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
    const total = optionalPointer(value, policy.totalPath);
    if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)
      throw new DataRuntimeFailure('DATA_HTTP_RESPONSE_INVALID');
    return Object.freeze({ kind: 'offset', offset, limit, total, hasMore: offset + limit < total });
  }
  const readCursor = (path?: string): string | undefined => {
    if (!path) return undefined;
    const cursor = optionalPointer(value, path);
    if (cursor === undefined || cursor === null) return undefined;
    if (typeof cursor !== 'string' || !cursor || cursor !== cursor.trim())
      throw new DataRuntimeFailure('DATA_HTTP_RESPONSE_INVALID');
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

const validateRuntimePage = (
  page: unknown,
  policy: DataRuntimePaginationPolicy | undefined,
  effectiveInput: unknown
): void => {
  if (!policy) {
    if (page !== undefined) throw new DataRuntimeFailure('DATA_PAGINATION_PAGE_UNDECLARED');
    return;
  }
  if (!page || typeof page !== 'object' || Array.isArray(page))
    throw new DataRuntimeFailure('DATA_PAGINATION_PAGE_MISSING');
  const record = page as Readonly<Record<string, unknown>>;
  if (record.kind !== policy.kind)
    throw new DataRuntimeFailure('DATA_PAGINATION_PAGE_MISMATCH');
  if (!effectiveInput || typeof effectiveInput !== 'object' || Array.isArray(effectiveInput))
    throw new DataRuntimeFailure('DATA_PAGINATION_INPUT_INVALID');
  const input = effectiveInput as Readonly<Record<string, unknown>>;
  if (policy.kind === 'offset') {
    const offset = paginationInteger(input[policy.offsetInput], 0, 0);
    const limit = paginationInteger(input[policy.limitInput], policy.defaultLimit, 1, policy.maxLimit);
    if (
      record.offset !== offset || record.limit !== limit ||
      typeof record.hasMore !== 'boolean' ||
      (record.total !== undefined &&
        (typeof record.total !== 'number' || !Number.isSafeInteger(record.total) || record.total < 0 ||
          record.hasMore !== offset + limit < record.total))
    ) throw new DataRuntimeFailure('DATA_PAGINATION_PAGE_MISMATCH');
    return;
  }
  const cursors = [record.nextCursor, record.previousCursor].filter((value) => value !== undefined);
  if (
    typeof record.hasMore !== 'boolean' ||
    cursors.some((value) => typeof value !== 'string' || !value || value !== value.trim()) ||
    (record.hasMore && !record.nextCursor)
  ) throw new DataRuntimeFailure('DATA_PAGINATION_PAGE_MISMATCH');
};

const privateHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    normalized === 'localhost' || normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') || normalized === '::' || normalized === '::1' ||
    normalized.startsWith('::ffff:') || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || /^fe[89ab]/u.test(normalized)
  ) return true;
  const octets = normalized.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/u.test(octet) || Number(octet) > 255))
    return false;
  const [first, second] = octets.map(Number);
  return first === 0 || first === 10 || first === 127 ||
    (first === 100 && second! >= 64 && second! <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second! >= 16 && second! <= 31) ||
    (first === 192 && second === 168) || first! >= 224;
};

const httpEndpoint = (baseUrl: string, path: string): URL => {
  let base: URL;
  try { base = new URL(baseUrl); }
  catch { throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID'); }
  if (
    !['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
    base.search || base.hash || privateHostname(base.hostname) ||
    !path.startsWith('/') || path.startsWith('//')
  ) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  return new URL(path, base);
};

const appendHttpQuery = (url: URL, input: unknown): void => {
  if (input === null) return;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
  for (const [key, value] of Object.entries(input).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
    if (value !== null) url.searchParams.append(key, String(value));
  }
};

const createNetworkTrace = (input: Readonly<{
  requestId: string;
  documentId: string;
  operationId: string;
  invocationId: string;
  sequence: number;
  attempt: number;
  method: string;
  url: URL;
  startedAt: number;
  completedAt: number;
  outcome: 'allowed' | 'failed';
  status?: number;
  requestBytes: number;
  responseBytes?: number;
  truncated?: boolean;
}>): DataRuntimeNetworkTrace => Object.freeze({
  format: 'prodivix.execution-network-trace.v1',
  requestId: input.requestId,
  phase: 'runtime',
  runtimeZone: 'client',
  mode: 'live',
  adapter: 'core.http',
  method: input.method,
  sanitizedUrl: input.url.origin + '/',
  protocol: input.url.protocol === 'https:' ? 'https' : 'http',
  startedAt: input.startedAt,
  completedAt: input.completedAt,
  durationMs: input.completedAt - input.startedAt,
  outcome: input.outcome,
  ...(input.status === undefined ? {} : { status: input.status }),
  requestBytes: input.requestBytes,
  ...(input.responseBytes === undefined ? {} : { responseBytes: input.responseBytes }),
  correlation: Object.freeze({
    kind: 'data-operation',
    documentId: input.documentId,
    operationId: input.operationId,
    invocationId: input.invocationId,
    sequence: input.sequence,
    attempt: input.attempt,
  }),
  redacted: true,
  ...(input.truncated ? { truncated: true } : {}),
});

const exactBridgeRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
    ? record
    : undefined;
};

const readGatewayNetworkTrace = (
  value: unknown,
  input: Readonly<{
    documentId: string;
    operationId: string;
    invocationId: string;
    sequence: number;
    attempt: number;
  }>
): DataRuntimeNetworkTrace | undefined => {
  const record = exactBridgeRecord(value, [
    'format', 'requestId', 'phase', 'runtimeZone', 'mode', 'adapter', 'method',
    'sanitizedUrl', 'protocol', 'startedAt', 'completedAt', 'durationMs',
    'outcome', 'correlation', 'redacted',
  ], ['status', 'requestBytes', 'responseBytes', 'truncated']);
  const correlation = exactBridgeRecord(record?.correlation, [
    'kind', 'documentId', 'operationId', 'invocationId', 'sequence', 'attempt',
  ]);
  let sanitizedUrl: URL;
  try { sanitizedUrl = new URL(String(record?.sanitizedUrl)); }
  catch { return undefined; }
  if (
    !record || !correlation ||
    record.format !== 'prodivix.execution-network-trace.v1' ||
    record.phase !== 'runtime' || !['server', 'edge'].includes(String(record.runtimeZone)) ||
    record.mode !== 'live' || record.adapter !== 'core.http' || record.redacted !== true ||
    !['https:'].includes(sanitizedUrl.protocol) || sanitizedUrl.pathname !== '/' ||
    sanitizedUrl.username || sanitizedUrl.password || sanitizedUrl.search || sanitizedUrl.hash ||
    correlation.kind !== 'data-operation' || correlation.documentId !== input.documentId ||
    correlation.operationId !== input.operationId || correlation.invocationId !== input.invocationId ||
    correlation.sequence !== input.sequence || correlation.attempt !== input.attempt ||
    !Number.isSafeInteger(record.startedAt) || !Number.isSafeInteger(record.completedAt) ||
    !Number.isSafeInteger(record.durationMs) ||
    Number(record.completedAt) - Number(record.startedAt) !== record.durationMs ||
    !['allowed', 'failed'].includes(String(record.outcome)) ||
    typeof record.method !== 'string' || !record.method ||
    record.protocol !== 'https' ||
    (record.status !== undefined && (!Number.isSafeInteger(record.status) || Number(record.status) < 100 || Number(record.status) > 599)) ||
    (record.requestBytes !== undefined && (!Number.isSafeInteger(record.requestBytes) || Number(record.requestBytes) < 0)) ||
    (record.responseBytes !== undefined && (!Number.isSafeInteger(record.responseBytes) || Number(record.responseBytes) < 0)) ||
    (record.truncated !== undefined && typeof record.truncated !== 'boolean')
  ) return undefined;
  return Object.freeze(cloneJson(record)) as DataRuntimeNetworkTrace;
};

const invokeRemoteDataGateway = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  attempt: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeResult> => {
  if (!['server', 'edge'].includes(input.document.source.runtimeZone))
    throw new DataRuntimeFailure('DATA_STANDALONE_RUNTIME_ZONE_UNAVAILABLE');
  if (dataRuntimeTarget.serverGateway !== 'execution-data-gateway-message-v1')
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_UNAVAILABLE');
  const runtimeWindow = globalThis as unknown as Window;
  const parent = runtimeWindow.parent;
  if (!parent || parent === runtimeWindow)
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_UNAVAILABLE', true);
  const requestId = input.invocationId + ':' + input.attempt;
  const response = await new Promise<DataGatewayBridgeResponse>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      globalThis.removeEventListener('message', onMessage);
      reject(new DataRuntimeFailure('DATA_REMOTE_GATEWAY_TIMEOUT', true));
    }, 30_000);
    const onMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== parent) return;
      const record = exactBridgeRecord(event.data, ['type', 'requestId', 'ok'], ['result', 'error']);
      if (
        !record || record.type !== 'prodivix.execution-data-gateway-response.v1' ||
        record.requestId !== requestId || typeof record.ok !== 'boolean'
      ) return;
      globalThis.clearTimeout(timeout);
      globalThis.removeEventListener('message', onMessage);
      resolve(record as unknown as DataGatewayBridgeResponse);
    };
    globalThis.addEventListener('message', onMessage);
    parent.postMessage(Object.freeze({
      type: 'prodivix.execution-data-gateway-request.v1',
      requestId,
      documentId: input.documentId,
      operationId: input.operation.id,
      invocationId: input.invocationId,
      sequence: input.sequence,
      attempt: input.attempt,
      input: cloneJson(input.operationInput),
    }), '*');
  });
  if (!response.ok) {
    const error = exactBridgeRecord(response.error, ['code', 'retryable']);
    if (
      !error || typeof error.code !== 'string' ||
      !remoteGatewaySafeErrorCodes.has(error.code) || typeof error.retryable !== 'boolean'
    ) throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID');
    throw new DataRuntimeFailure(error.code, error.retryable);
  }
  const result = exactBridgeRecord(response.result, ['value', 'empty', 'network']);
  const network = readGatewayNetworkTrace(result?.network, {
    documentId: input.documentId,
    operationId: input.operation.id,
    invocationId: input.invocationId,
    sequence: input.sequence,
    attempt: input.attempt,
  });
  if (!result || typeof result.empty !== 'boolean' || !network)
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID');
  const value = cloneJson(result.value);
  input.publishNetworkTrace(network);
  const page = projectHttpPage(input.operation, input.operationInput, value);
  return Object.freeze({
    value,
    empty: result.empty,
    ...(page === undefined ? {} : { page }),
  });
};

const invokeLiveHttp = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  attempt: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeResult> => {
  if (input.document.source.adapterId !== 'core.http')
    throw new DataRuntimeFailure('DATA_ADAPTER_UNAVAILABLE');
  if (['server', 'edge'].includes(input.document.source.runtimeZone))
    return invokeRemoteDataGateway(input);
  if (input.document.source.runtimeZone !== 'client')
    throw new DataRuntimeFailure('DATA_STANDALONE_RUNTIME_ZONE_UNAVAILABLE');
  if (input.document.source.configurationByKey.authorization)
    literalConfiguration(input.document.source.configurationByKey.authorization);
  const baseUrl = literalConfigurationString(input.document.source.configurationByKey.baseUrl);
  const method = literalConfigurationString(input.operation.configurationByKey.method).toUpperCase();
  const path = literalConfigurationString(input.operation.configurationByKey.path);
  const allowedMethods = input.operation.kind === 'query'
    ? ['GET', 'HEAD']
    : ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!allowedMethods.includes(method)) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  const emptyWhen = input.operation.configurationByKey.emptyWhen
    ? literalConfigurationString(input.operation.configurationByKey.emptyWhen)
    : 'never';
  if (!['never', 'status-204'].includes(emptyWhen))
    throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  const url = httpEndpoint(baseUrl, path);
  if (input.operation.kind === 'query') appendHttpQuery(url, input.operationInput);
  const body = input.operation.kind === 'mutation' ? canonicalJson(input.operationInput) : undefined;
  if (input.operation.configurationByKey.idempotencyHeader && !input.operation.policies.idempotency)
    throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  let upstreamIdempotency: Readonly<{ header: string; key: string }> | undefined;
  if (input.operation.policies.idempotency) {
    if (input.operation.policies.idempotency.kind !== 'invocation-key')
      throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
    const header = literalConfigurationString(input.operation.configurationByKey.idempotencyHeader);
    if (
      header !== header.toLowerCase() || header.length > 128 ||
      !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(header) ||
      ['authorization', 'connection', 'content-length', 'content-type', 'cookie', 'host', 'proxy-authorization', 'set-cookie', 'transfer-encoding'].includes(header)
    ) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
    upstreamIdempotency = Object.freeze({
      header,
      key: await dataIdempotencyKey({
        documentId: input.documentId,
        operationId: input.operation.id,
        invocationId: input.invocationId,
        sequence: input.sequence,
        documentRevision: input.document.revision,
        runtimeZone: input.document.source.runtimeZone,
        operationInput: input.operationInput,
      }),
    });
  }
  const requestBytes = body ? new TextEncoder().encode(body).byteLength : 0;
  const requestId = input.invocationId + ':' + input.attempt;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(body === undefined && !upstreamIdempotency ? {} : {
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(upstreamIdempotency ? { [upstreamIdempotency.header]: upstreamIdempotency.key } : {}),
        },
        ...(body === undefined ? {} : { body }),
      }),
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    const completedAt = Date.now();
    input.publishNetworkTrace(createNetworkTrace({
      requestId, documentId: input.documentId, operationId: input.operation.id,
      invocationId: input.invocationId, sequence: input.sequence, attempt: input.attempt,
      method, url, startedAt, completedAt, outcome: 'failed', requestBytes,
    }));
    throw new DataRuntimeFailure('DATA_HTTP_REQUEST_FAILED', true);
  }
  let contents: Uint8Array;
  try { contents = new Uint8Array(await response.arrayBuffer()); }
  catch {
    const completedAt = Date.now();
    input.publishNetworkTrace(createNetworkTrace({
      requestId, documentId: input.documentId, operationId: input.operation.id,
      invocationId: input.invocationId, sequence: input.sequence, attempt: input.attempt,
      method, url, startedAt, completedAt, outcome: 'failed', requestBytes,
    }));
    throw new DataRuntimeFailure('DATA_HTTP_REQUEST_FAILED', true);
  }
  const responseBytes = contents.byteLength;
  const truncated = responseBytes > 4 * 1024 * 1024;
  const completedAt = Date.now();
  input.publishNetworkTrace(createNetworkTrace({
    requestId, documentId: input.documentId, operationId: input.operation.id,
    invocationId: input.invocationId, sequence: input.sequence, attempt: input.attempt,
    method, url, startedAt, completedAt, outcome: 'allowed', status: response.status,
    requestBytes, responseBytes, ...(truncated ? { truncated: true } : {}),
  }));
  if (truncated) throw new DataRuntimeFailure('DATA_HTTP_RESPONSE_TOO_LARGE');
  if (!response.ok)
    throw new DataRuntimeFailure(
      'DATA_HTTP_STATUS_FAILED',
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  let value: unknown = null;
  if (contents.byteLength) {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
      value = cloneJson(JSON.parse(text));
    } catch { throw new DataRuntimeFailure('DATA_HTTP_RESPONSE_INVALID'); }
  }
  const page = projectHttpPage(input.operation, input.operationInput, value);
  return Object.freeze({
    value,
    empty: emptyWhen === 'status-204' && response.status === 204,
    ...(page === undefined ? {} : { page }),
  });
};

const schemaValidators = new Map<string, (value: unknown) => boolean>();

const validateRuntimePayload = (
  documentId: string,
  document: DataRuntimeDocument,
  schemaId: string | undefined,
  value: unknown,
  phase: 'input' | 'output'
): void => {
  if (!schemaId) return;
  const schema = document.schemasById[schemaId]?.schema;
  if (schema === undefined) throw new DataRuntimeFailure('DATA_SCHEMA_UNRESOLVED');
  if (
    typeof schema !== 'boolean' &&
    (!schema || typeof schema !== 'object' || Array.isArray(schema))
  ) throw new DataRuntimeFailure('DATA_SCHEMA_UNSUPPORTED');
  const key = documentId + ':' + document.revision + ':' + schemaId;
  let validator = schemaValidators.get(key);
  if (!validator) {
    try {
      validator = new Ajv2020({ allErrors: true, messages: false, strict: false, validateFormats: false }).compile(schema as boolean | object);
    } catch { throw new DataRuntimeFailure('DATA_SCHEMA_UNSUPPORTED'); }
    schemaValidators.set(key, validator);
  }
  if (!validator(value))
    throw new DataRuntimeFailure(phase === 'input' ? 'DATA_INPUT_SCHEMA_INVALID' : 'DATA_OUTPUT_SCHEMA_INVALID');
};

type DataRuntimeCacheEntry = Readonly<{
  freshUntil: number;
  staleUntil: number;
  result: DataRuntimeResult;
}>;

const selectedCacheInput = (input: unknown, paths?: readonly string[]): unknown =>
  paths
    ? [...paths].sort().map((path) => {
        const value = optionalPointer(input, path);
        return value === undefined ? [path, false] : [path, true, value];
      })
    : cloneJson(input);

const sha256Text = async (
  value: string,
  unavailableCode = 'DATA_CACHE_RUNTIME_UNAVAILABLE'
): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new DataRuntimeFailure(unavailableCode);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const dataIdempotencyKey = async (input: Readonly<{
  documentId: string;
  operationId: string;
  invocationId: string;
  sequence: number;
  documentRevision: string;
  runtimeZone: string;
  operationInput: unknown;
}>): Promise<string> => 'prodivix-data-sha256-' + await sha256Text(canonicalJson({
  format: 'prodivix.data-idempotency-key.v1',
  documentId: input.documentId,
  operationId: input.operationId,
  invocationId: input.invocationId,
  sequence: input.sequence,
  documentRevision: input.documentRevision,
  runtimeZone: input.runtimeZone,
  mode: 'live',
  input: input.operationInput,
}), 'DATA_IDEMPOTENCY_RUNTIME_UNAVAILABLE');

const dataCacheKey = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  mode: 'mock' | 'live';
}>): Promise<string> => 'data-cache:sha256:' + await sha256Text(canonicalJson({
  operation: { documentId: input.documentId, operationId: input.operation.id },
  documentRevision: input.document.revision,
  input: selectedCacheInput(input.operationInput, input.operation.policies.cache?.keyInputPaths),
  runtimeZone: input.document.source.runtimeZone,
  mode: input.mode,
  adapter: { sourceId: input.document.source.adapterId, implementationId: input.mode === 'mock' ? 'core.mock' : 'core.http', implementationVersion: '1' },
  targetId: 'react-vite-standalone',
  partitionId: 'runtime-instance',
}));
`;
