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

type DataRuntimeStreamCollectionPolicy = Readonly<{
  kind: 'keyed-event-v1';
  entityIdPath: string;
  maxItems: number;
}>;

type DataRuntimeStreamPolicy = Readonly<{
  reconnect: Readonly<{
    resume: 'sse-last-event-id';
    maxReconnectAttempts: number;
    backoff: 'fixed' | 'exponential';
    initialDelayMs: number;
    maxDelayMs?: number;
  }>;
  credentialRenewal?: 'per-connection';
  collection?: DataRuntimeStreamCollectionPolicy;
}>;

type DataRuntimeOperation = Readonly<{
  id: string;
  kind: 'query' | 'mutation' | 'subscription';
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
    stream?: DataRuntimeStreamPolicy;
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

type DataRuntimeResult = Readonly<{
  value: unknown;
  empty: boolean;
  page?: unknown;
  attempt?: number;
}>;
type DataRuntimeManifest = Readonly<{ format: 'prodivix.executable-data-runtime.v1'; mode: 'mock' | 'live' }>;
type DataRuntimeLiveAdapter = 'core.http' | 'core.graphql' | 'core.asyncapi';
type DataRuntimeNetworkTrace = Readonly<{
  format: 'prodivix.execution-network-trace.v1';
  requestId: string;
  phase: 'runtime';
  runtimeZone: 'client' | 'server' | 'edge';
  mode: 'live';
  adapter: DataRuntimeLiveAdapter;
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
  sourceTrace?: readonly Readonly<{
    sourceRef: Readonly<{
      kind: 'data-operation';
      documentId: string;
      operationId: string;
    }>;
    label?: string;
  }>[];
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

type DataStreamBridgeMessage =
  | Readonly<{
      type: 'prodivix.execution-data-stream.v1';
      requestId: string;
      phase: 'open';
      network: DataRuntimeNetworkTrace;
    }>
  | Readonly<{
      type: 'prodivix.execution-data-stream.v1';
      requestId: string;
      phase: 'event';
      cursor: number;
      value: unknown;
    }>
  | Readonly<{
      type: 'prodivix.execution-data-stream.v1';
      requestId: string;
      phase: 'complete';
      cursor: number;
    }>
  | Readonly<{
      type: 'prodivix.execution-data-stream.v1';
      requestId: string;
      phase: 'error';
      code: string;
      retryable: boolean;
    }>;

type DataRuntimeStreamEvent = Readonly<{
  cursor: number;
  value: unknown;
  collection?: DataRuntimeStreamCollectionSnapshot;
}>;

type DataRuntimeStreamCollectionSnapshot = Readonly<{
  cursor: number;
  appliedEvents: number;
  items: readonly Readonly<Record<string, unknown>>[];
}>;

type DataRuntimeStreamSession = Readonly<{
  network: DataRuntimeNetworkTrace;
  next(): Promise<DataRuntimeStreamEvent | undefined>;
  getCollectionSnapshot(): DataRuntimeStreamCollectionSnapshot | undefined;
  close(): void;
}>;

class DataRuntimeFailure extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly attempt: number;

  constructor(code: string, retryable = false, attempt = 1) {
    super(code);
    this.name = 'DataRuntimeFailure';
    this.code = code;
    this.retryable = retryable;
    this.attempt = attempt;
  }
}

type DataRuntimeStreamCollection = Readonly<{
  getSnapshot(): DataRuntimeStreamCollectionSnapshot;
  apply(cursor: number, value: unknown): DataRuntimeStreamCollectionSnapshot;
}>;

const streamCollectionRecord = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const freezeStreamCollectionValue = (value: unknown): unknown => {
  if (Array.isArray(value))
    return Object.freeze(value.map((entry) => freezeStreamCollectionValue(entry)));
  if (streamCollectionRecord(value))
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          freezeStreamCollectionValue(entry),
        ])
      )
    );
  return value;
};

const streamCollectionExactRecord = (
  value: unknown,
  keys: readonly string[]
): Readonly<Record<string, unknown>> | undefined => {
  if (!streamCollectionRecord(value)) return undefined;
  const expected = new Set(keys);
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    Object.keys(value).every((key) => expected.has(key))
    ? value
    : undefined;
};

const createStreamCollection = (
  policy: DataRuntimeStreamCollectionPolicy | undefined
): DataRuntimeStreamCollection | undefined => {
  if (!policy) return undefined;
  if (
    policy.kind !== 'keyed-event-v1' ||
    typeof policy.entityIdPath !== 'string' ||
    !policy.entityIdPath.startsWith('/') ||
    /~(?:[^01]|$)/u.test(policy.entityIdPath) ||
    !Number.isSafeInteger(policy.maxItems) ||
    policy.maxItems < 1 ||
    policy.maxItems > 10_000
  ) throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_EVENT_INVALID');
  const tokens = policy.entityIdPath
    .slice(1)
    .split('/')
    .map((token) => token.replace(/~1/gu, '/').replace(/~0/gu, '~'));
  const readIdentityValue = (value: unknown): unknown => {
    let current = value;
    for (const token of tokens) {
      if (Array.isArray(current)) {
        if (!/^(?:0|[1-9][0-9]*)$/u.test(token))
          throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_IDENTITY_INVALID');
        current = current[Number(token)];
      } else if (
        streamCollectionRecord(current) &&
        Object.prototype.hasOwnProperty.call(current, token)
      ) {
        current = current[token];
      } else {
        throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_IDENTITY_INVALID');
      }
    }
    return current;
  };
  const identity = (value: unknown): string => {
    if (
      (typeof value !== 'string' || !value) &&
      (typeof value !== 'number' || !Number.isSafeInteger(value))
    ) throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_IDENTITY_INVALID');
    return JSON.stringify(value);
  };
  const normalizeItems = (
    values: readonly unknown[]
  ): readonly Readonly<Record<string, unknown>>[] => {
    if (values.length > policy.maxItems)
      throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_CAPACITY');
    const seen = new Set<string>();
    return Object.freeze(
      values.map((candidate) => {
        const cloned = freezeStreamCollectionValue(cloneJson(candidate));
        if (!streamCollectionRecord(cloned))
          throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_EVENT_INVALID');
        const key = identity(readIdentityValue(cloned));
        if (seen.has(key))
          throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_IDENTITY_CONFLICT');
        seen.add(key);
        return cloned;
      })
    );
  };
  let snapshot: DataRuntimeStreamCollectionSnapshot = Object.freeze({
    cursor: 0,
    appliedEvents: 0,
    items: Object.freeze([]),
  });
  return Object.freeze({
    getSnapshot: () => snapshot,
    apply(cursor, value) {
      if (!Number.isSafeInteger(cursor) || cursor !== snapshot.cursor + 1)
        throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_CURSOR_CONFLICT');
      const replacement = streamCollectionExactRecord(value, ['action', 'items']);
      const upsert = streamCollectionExactRecord(value, ['action', 'entity']);
      const deletion = streamCollectionExactRecord(value, ['action', 'id']);
      let items: readonly Readonly<Record<string, unknown>>[];
      if (replacement?.action === 'replace' && Array.isArray(replacement.items)) {
        items = normalizeItems(replacement.items);
      } else if (upsert?.action === 'upsert' && streamCollectionRecord(upsert.entity)) {
        const entity = normalizeItems([upsert.entity])[0]!;
        const key = identity(readIdentityValue(entity));
        const index = snapshot.items.findIndex(
          (candidate) => identity(readIdentityValue(candidate)) === key
        );
        if (index < 0) {
          if (snapshot.items.length >= policy.maxItems)
            throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_CAPACITY');
          items = Object.freeze([...snapshot.items, entity]);
        } else {
          const next = [...snapshot.items];
          next[index] = entity;
          items = Object.freeze(next);
        }
      } else if (
        deletion?.action === 'delete' &&
        (typeof deletion.id === 'string' || typeof deletion.id === 'number')
      ) {
        const key = identity(deletion.id);
        items = Object.freeze(
          snapshot.items.filter(
            (candidate) => identity(readIdentityValue(candidate)) !== key
          )
        );
      } else {
        throw new DataRuntimeFailure('DATA_STREAM_COLLECTION_EVENT_INVALID');
      }
      snapshot = Object.freeze({
        cursor,
        appliedEvents: snapshot.appliedEvents + 1,
        items,
      });
      return snapshot;
    },
  });
};

const remoteGatewaySafeErrorCodes = new Set([
  'DATA_REMOTE_GATEWAY_UNAVAILABLE',
  'DATA_REMOTE_GATEWAY_DENIED',
  'DATA_REMOTE_GATEWAY_INVALID',
  'DATA_REMOTE_GATEWAY_STALE',
  'DATA_HTTP_REQUEST_FAILED',
  'DATA_GRAPHQL_REQUEST_FAILED',
  'DATA_ASYNCAPI_REQUEST_FAILED',
  'DATA_MUTATION_REPLAY_CONFLICT',
  'DATA_MUTATION_REPLAY_UNSAFE',
  'DATA_MUTATION_REPLAY_CAPACITY',
  'DATA_STREAM_CONFLICT',
  'DATA_STREAM_CAPACITY',
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
  value: DataRuntimeConfigurationValue | undefined,
  code = 'DATA_HTTP_CONFIGURATION_INVALID'
): string => {
  const resolved = literalConfiguration(value, code);
  if (typeof resolved !== 'string' || !resolved || resolved !== resolved.trim())
    throw new DataRuntimeFailure(code);
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

const httpEndpoint = (
  baseUrl: string,
  path: string,
  code = 'DATA_HTTP_CONFIGURATION_INVALID'
): URL => {
  let base: URL;
  try { base = new URL(baseUrl); }
  catch { throw new DataRuntimeFailure(code); }
  if (
    !['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
    base.search || base.hash || privateHostname(base.hostname) ||
    !path.startsWith('/') || path.startsWith('//')
  ) throw new DataRuntimeFailure(code);
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

type DataRuntimeHttpParameterLocation = 'path' | 'query' | 'header';
type DataRuntimeHttpParameterMappings = Readonly<
  Record<DataRuntimeHttpParameterLocation, Readonly<Record<string, string>>>
>;

const runtimeHttpRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const runtimeHttpPointer = (value: unknown): string => {
  if (
    typeof value !== 'string' || !value.startsWith('/') ||
    /~(?:[^01]|$)/u.test(value)
  ) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  return value;
};

const readRuntimeHttpParameterMappings = (
  value: DataRuntimeConfigurationValue | undefined
): DataRuntimeHttpParameterMappings | undefined => {
  if (!value) return undefined;
  const raw = literalConfiguration(value);
  if (!runtimeHttpRecord(raw))
    throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
  const allowed = new Set<DataRuntimeHttpParameterLocation>(['path', 'query', 'header']);
  const result: Record<DataRuntimeHttpParameterLocation, Readonly<Record<string, string>>> = {
    path: Object.freeze({}), query: Object.freeze({}), header: Object.freeze({}),
  };
  for (const [location, rawMappings] of Object.entries(raw)) {
    if (!allowed.has(location as DataRuntimeHttpParameterLocation) || !runtimeHttpRecord(rawMappings))
      throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
    const mappings: Record<string, string> = {};
    for (const [wireName, pointer] of Object.entries(rawMappings)) {
      if (!wireName || wireName !== wireName.trim())
        throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
      if (
        location === 'header' &&
        (wireName !== wireName.toLowerCase() || wireName.length > 128 ||
          !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(wireName) ||
          ['authorization', 'connection', 'content-length', 'content-type', 'cookie', 'host', 'proxy-authorization', 'set-cookie', 'transfer-encoding'].includes(wireName))
      ) throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
      mappings[wireName] = runtimeHttpPointer(pointer);
    }
    result[location as DataRuntimeHttpParameterLocation] = Object.freeze(mappings);
  }
  return Object.freeze(result);
};

const runtimeHttpScalar = (
  input: unknown,
  pointer: string,
  required: boolean
): string | undefined => {
  const value = optionalPointer(input, pointer);
  if (value === undefined || value === null) {
    if (required) throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
    return undefined;
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
  const result = String(value);
  if (result.includes('\r') || result.includes('\n'))
    throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
  return result;
};

const mapRuntimeHttpRequest = (
  path: string,
  input: unknown,
  operationKind: 'query' | 'mutation',
  mappings: DataRuntimeHttpParameterMappings | undefined,
  bodyInputPath: string | undefined
): Readonly<{
  path: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  body?: unknown;
  legacyQuery?: unknown;
}> => {
  if (!mappings && !bodyInputPath) {
    return Object.freeze({
      path,
      query: Object.freeze({}),
      headers: Object.freeze({}),
      ...(operationKind === 'query' ? { legacyQuery: input } : { body: input }),
    });
  }
  let mappedPath = path;
  const query: Record<string, string> = {};
  const headers: Record<string, string> = {};
  for (const [wireName, pointer] of Object.entries(mappings?.path ?? {})) {
    const value = runtimeHttpScalar(input, pointer, true)!;
    const token = '{' + wireName + '}';
    if (!mappedPath.includes(token))
      throw new DataRuntimeFailure('DATA_HTTP_CONFIGURATION_INVALID');
    mappedPath = mappedPath.split(token).join(encodeURIComponent(value));
  }
  if (/[{}]/u.test(mappedPath)) throw new DataRuntimeFailure('DATA_HTTP_INPUT_INVALID');
  for (const [wireName, pointer] of Object.entries(mappings?.query ?? {})) {
    const value = runtimeHttpScalar(input, pointer, false);
    if (value !== undefined) query[wireName] = value;
  }
  for (const [wireName, pointer] of Object.entries(mappings?.header ?? {})) {
    const value = runtimeHttpScalar(input, pointer, false);
    if (value !== undefined) headers[wireName] = value;
  }
  const body = bodyInputPath ? optionalPointer(input, bodyInputPath) : undefined;
  return Object.freeze({
    path: mappedPath,
    query: Object.freeze(query),
    headers: Object.freeze(headers),
    ...(body === undefined ? {} : { body }),
  });
};

const createNetworkTrace = (input: Readonly<{
  adapter?: DataRuntimeLiveAdapter;
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
  adapter: input.adapter ?? 'core.http',
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

const protocolEndpoint = (value: string, code: string): URL => {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new DataRuntimeFailure(code); }
  if (
    !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.search || url.hash || privateHostname(url.hostname)
  ) throw new DataRuntimeFailure(code);
  return url;
};

const protocolHeader = (value: string, code: string): string => {
  if (
    value !== value.toLowerCase() || value.length > 128 ||
    !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(value) ||
    ['authorization', 'connection', 'content-length', 'content-type', 'cookie', 'host',
      'proxy-authorization', 'set-cookie', 'transfer-encoding'].includes(value)
  ) throw new DataRuntimeFailure(code);
  return value;
};

const protocolPointer = (value: string, code: string): string => {
  if ((value !== '' && !value.startsWith('/')) || /~(?:[^01]|$)/u.test(value))
    throw new DataRuntimeFailure(code);
  return value;
};

const selectProtocolPointer = (
  value: unknown,
  pointer: string,
  code: string
): unknown => {
  if (pointer === '') return cloneJson(value);
  try { return selectPointer(value, pointer); }
  catch (error) {
    if (runtimeFailureCode(error) === 'DATA_INPUT_VALUE_MISSING') return undefined;
    throw new DataRuntimeFailure(code);
  }
};

const executeClientJsonRequest = async (input: Readonly<{
  adapter: DataRuntimeLiveAdapter;
  url: URL;
  headers: Readonly<Record<string, string>>;
  body: string;
  requestId: string;
  documentId: string;
  operationId: string;
  invocationId: string;
  sequence: number;
  attempt: number;
  requestFailureCode: string;
  statusFailureCode: string;
  responseLimitCode: string;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<Uint8Array> => {
  const requestBytes = new TextEncoder().encode(input.body).byteLength;
  if (requestBytes > 4 * 1024 * 1024)
    throw new DataRuntimeFailure(input.responseLimitCode);
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: 'POST',
      headers: input.headers,
      body: input.body,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    const completedAt = Date.now();
    publishProtocolTrace(input, startedAt, completedAt, 'failed', requestBytes);
    throw new DataRuntimeFailure(input.requestFailureCode, true);
  }
  let contents: Uint8Array;
  try { contents = new Uint8Array(await response.arrayBuffer()); }
  catch {
    const completedAt = Date.now();
    publishProtocolTrace(input, startedAt, completedAt, 'failed', requestBytes);
    throw new DataRuntimeFailure(input.requestFailureCode, true);
  }
  const completedAt = Date.now();
  const truncated = contents.byteLength > 4 * 1024 * 1024;
  publishProtocolTrace(
    input,
    startedAt,
    completedAt,
    'allowed',
    requestBytes,
    response.status,
    contents.byteLength,
    truncated
  );
  if (truncated) throw new DataRuntimeFailure(input.responseLimitCode);
  if (!response.ok)
    throw new DataRuntimeFailure(
      input.statusFailureCode,
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  return contents;
};

const publishProtocolTrace = (
  input: Readonly<{
    adapter: DataRuntimeLiveAdapter;
    url: URL;
    requestId: string;
    documentId: string;
    operationId: string;
    invocationId: string;
    sequence: number;
    attempt: number;
    publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
  }>,
  startedAt: number,
  completedAt: number,
  outcome: 'allowed' | 'failed',
  requestBytes: number,
  status?: number,
  responseBytes?: number,
  truncated = false
): void => input.publishNetworkTrace(createNetworkTrace({
  adapter: input.adapter,
  requestId: input.requestId,
  documentId: input.documentId,
  operationId: input.operationId,
  invocationId: input.invocationId,
  sequence: input.sequence,
  attempt: input.attempt,
  method: 'POST',
  url: input.url,
  startedAt,
  completedAt,
  outcome,
  ...(status === undefined ? {} : { status }),
  requestBytes,
  ...(responseBytes === undefined ? {} : { responseBytes }),
  ...(truncated ? { truncated: true } : {}),
}));

const decodeBoundedProtocolJson = (
  contents: Uint8Array,
  invalidCode: string,
  limitCode: string
): unknown => {
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
    value = JSON.parse(text);
  } catch { throw new DataRuntimeFailure(invalidCode); }
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 100000 || depth > 64) throw new DataRuntimeFailure(limitCode);
    if (
      candidate === null || typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) return candidate;
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new DataRuntimeFailure(invalidCode);
      return candidate;
    }
    if (Array.isArray(candidate))
      return Object.freeze(candidate.map((entry) => visit(entry, depth + 1)));
    if (!runtimeHttpRecord(candidate)) throw new DataRuntimeFailure(invalidCode);
    return Object.freeze(Object.fromEntries(
      Object.entries(candidate)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, visit(entry, depth + 1)])
    ));
  };
  return visit(value, 0);
};

const finiteGraphqlOperation = (
  document: string,
  operationName: string | undefined,
  expectedKind: 'query' | 'mutation'
): void => {
  if (new TextEncoder().encode(document).byteLength > 128 * 1024)
    throw new DataRuntimeFailure('DATA_GRAPHQL_DOCUMENT_LIMIT_EXCEEDED');
  const withoutComments = document.replace(/#[^\r\n]*/gu, ' ');
  const declarations = [...withoutComments.matchAll(
    /\b(query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/gu
  )];
  if (
    declarations.length !== 1 || declarations[0]?.[1] !== expectedKind ||
    (operationName !== undefined && declarations[0]?.[2] !== operationName)
  ) throw new DataRuntimeFailure('DATA_GRAPHQL_OPERATION_UNSUPPORTED');
};

const protocolIdempotency = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  code: string;
}>): Promise<Readonly<{ header: string; key: string }> | undefined> => {
  const configured = input.operation.configurationByKey.idempotencyHeader;
  const policy = input.operation.policies.idempotency;
  if (!policy) {
    if (configured) throw new DataRuntimeFailure(input.code);
    return undefined;
  }
  if (input.operation.kind !== 'mutation' || policy.kind !== 'invocation-key')
    throw new DataRuntimeFailure(input.code);
  const header = protocolHeader(
    literalConfigurationString(configured, input.code),
    input.code
  );
  return Object.freeze({
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
};

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

const readGatewaySourceTrace = (
  value: unknown,
  documentId: string,
  operationId: string
): DataRuntimeNetworkTrace['sourceTrace'] | undefined => {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length < 1 || value.length > 16)
    return undefined;
  const traces = value.map((entry) => {
    const record = exactBridgeRecord(entry, ['sourceRef'], ['label']);
    const sourceRef = exactBridgeRecord(record?.sourceRef, [
      'kind', 'documentId', 'operationId',
    ]);
    if (
      !record || !sourceRef || sourceRef.kind !== 'data-operation' ||
      sourceRef.documentId !== documentId || sourceRef.operationId !== operationId ||
      (record.label !== undefined &&
        (typeof record.label !== 'string' || !record.label || record.label.length > 512))
    ) throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID');
    return Object.freeze({
      sourceRef: Object.freeze({
        kind: 'data-operation' as const,
        documentId,
        operationId,
      }),
      ...(record.label ? { label: record.label as string } : {}),
    });
  });
  return Object.freeze(traces);
};

const readGatewayNetworkTrace = (
  value: unknown,
  input: Readonly<{
    documentId: string;
    operationId: string;
    adapterId: DataRuntimeLiveAdapter;
    invocationId: string;
    sequence: number;
    attempt: number;
  }>
): DataRuntimeNetworkTrace | undefined => {
  const record = exactBridgeRecord(value, [
    'format', 'requestId', 'phase', 'runtimeZone', 'mode', 'adapter', 'method',
    'sanitizedUrl', 'protocol', 'startedAt', 'completedAt', 'durationMs',
    'outcome', 'correlation', 'redacted',
  ], ['status', 'requestBytes', 'responseBytes', 'sourceTrace', 'truncated']);
  const correlation = exactBridgeRecord(record?.correlation, [
    'kind', 'documentId', 'operationId', 'invocationId', 'sequence', 'attempt',
  ]);
  let sanitizedUrl: URL;
  try { sanitizedUrl = new URL(String(record?.sanitizedUrl)); }
  catch { return undefined; }
  let sourceTrace: DataRuntimeNetworkTrace['sourceTrace'];
  try {
    sourceTrace = readGatewaySourceTrace(
      record?.sourceTrace,
      input.documentId,
      input.operationId
    );
  } catch { return undefined; }
  if (
    !record || !correlation ||
    record.format !== 'prodivix.execution-network-trace.v1' ||
    record.phase !== 'runtime' || !['server', 'edge'].includes(String(record.runtimeZone)) ||
    record.mode !== 'live' || record.adapter !== input.adapterId || record.redacted !== true ||
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
    (record.truncated !== undefined && typeof record.truncated !== 'boolean') ||
    sourceTrace === undefined
  ) return undefined;
  return Object.freeze({
    ...cloneJson(record),
    ...(sourceTrace.length ? { sourceTrace } : {}),
  }) as DataRuntimeNetworkTrace;
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
      adapterId: input.document.source.adapterId,
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
    adapterId: input.document.source.adapterId as DataRuntimeLiveAdapter,
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

const openRemoteDataStream = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeStreamSession> => {
  if (
    input.operation.kind !== 'subscription' ||
    !['server', 'edge'].includes(input.document.source.runtimeZone) ||
    !['core.graphql', 'core.asyncapi'].includes(input.document.source.adapterId)
  ) throw new DataRuntimeFailure('DATA_STREAM_OPERATION_UNAVAILABLE');
  if (dataRuntimeTarget.serverGateway !== 'execution-data-gateway-message-v1')
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_UNAVAILABLE');
  const runtimeWindow = globalThis as unknown as Window;
  const parent = runtimeWindow.parent;
  if (!parent || parent === runtimeWindow)
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_UNAVAILABLE', true);
  const requestId = input.invocationId + ':stream';
  let cursor = 0;
  let eventCount = 0;
  let totalBytes = 0;
  let pending = false;
  let terminal = false;
  let cancelPending: (() => void) | undefined;
  const collection = createStreamCollection(
    input.operation.policies.stream?.collection
  );

  const readMessage = (value: unknown): DataStreamBridgeMessage | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const phase = (value as Record<string, unknown>).phase;
    if (phase === 'open') {
      const record = exactBridgeRecord(value, ['type', 'requestId', 'phase', 'network']);
      const network = readGatewayNetworkTrace(record?.network, {
        documentId: input.documentId,
        operationId: input.operation.id,
        adapterId: input.document.source.adapterId as DataRuntimeLiveAdapter,
        invocationId: input.invocationId,
        sequence: input.sequence,
        attempt: 1,
      });
      return record?.type === 'prodivix.execution-data-stream.v1' &&
        record.requestId === requestId && network
        ? Object.freeze({ type: record.type, requestId, phase: 'open', network })
        : undefined;
    }
    if (phase === 'event') {
      const record = exactBridgeRecord(value, ['type', 'requestId', 'phase', 'cursor', 'value']);
      if (
        record?.type !== 'prodivix.execution-data-stream.v1' ||
        record.requestId !== requestId || record.cursor !== cursor + 1 ||
        !Number.isSafeInteger(record.cursor) || Number(record.cursor) > 256
      ) return undefined;
      let cloned: unknown;
      try {
        cloned = cloneJson(record.value);
        if (new TextEncoder().encode(canonicalJson(cloned)).byteLength > 256 * 1024)
          return undefined;
      } catch { return undefined; }
      return Object.freeze({
        type: record.type,
        requestId,
        phase: 'event',
        cursor: record.cursor as number,
        value: cloned,
      });
    }
    if (phase === 'complete') {
      const record = exactBridgeRecord(value, ['type', 'requestId', 'phase', 'cursor']);
      return record?.type === 'prodivix.execution-data-stream.v1' &&
        record.requestId === requestId && record.cursor === cursor
        ? Object.freeze({ type: record.type, requestId, phase: 'complete', cursor })
        : undefined;
    }
    if (phase === 'error') {
      const record = exactBridgeRecord(value, ['type', 'requestId', 'phase', 'code', 'retryable']);
      return record?.type === 'prodivix.execution-data-stream.v1' &&
        record.requestId === requestId && typeof record.code === 'string' &&
        remoteGatewaySafeErrorCodes.has(record.code) && typeof record.retryable === 'boolean'
        ? Object.freeze({
            type: record.type,
            requestId,
            phase: 'error',
            code: record.code,
            retryable: record.retryable,
          })
        : undefined;
    }
    return undefined;
  };

  const waitForMessage = (): Promise<DataStreamBridgeMessage> =>
    new Promise((resolve, reject) => {
      const cleanup = (): void => {
        globalThis.clearTimeout(timeout);
        globalThis.removeEventListener('message', onMessage);
        if (cancelPending === cancel) cancelPending = undefined;
      };
      const cancel = (): void => {
        cleanup();
        reject(new DataRuntimeFailure('DATA_STREAM_CLOSED'));
      };
      const timeout = globalThis.setTimeout(() => {
        cleanup();
        reject(new DataRuntimeFailure('DATA_REMOTE_GATEWAY_TIMEOUT', true));
      }, 30_000);
      const onMessage = (event: MessageEvent<unknown>): void => {
        if (event.source !== parent) return;
        const candidate = event.data as Readonly<Record<string, unknown>> | undefined;
        if (
          !candidate || candidate.type !== 'prodivix.execution-data-stream.v1' ||
          candidate.requestId !== requestId
        ) return;
        const message = readMessage(event.data);
        cleanup();
        if (!message) {
          reject(new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID'));
          return;
        }
        resolve(message);
      };
      cancelPending = cancel;
      globalThis.addEventListener('message', onMessage);
    });

  const opening = waitForMessage();
  parent.postMessage(Object.freeze({
    type: 'prodivix.execution-data-stream-open.v1',
    requestId,
    documentId: input.documentId,
    operationId: input.operation.id,
    adapterId: input.document.source.adapterId,
    invocationId: input.invocationId,
    sequence: input.sequence,
    attempt: 1,
    input: cloneJson(input.operationInput),
  }), '*');
  let opened: DataStreamBridgeMessage;
  try { opened = await opening; }
  catch (error) {
    parent.postMessage(Object.freeze({
      type: 'prodivix.execution-data-stream-cancel.v1', requestId,
    }), '*');
    throw error;
  }
  if (opened.phase === 'error')
    throw new DataRuntimeFailure(opened.code, opened.retryable);
  if (opened.phase !== 'open')
    throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID');
  input.publishNetworkTrace(opened.network);
  return Object.freeze({
    network: opened.network,
    getCollectionSnapshot: () => collection?.getSnapshot(),
    async next() {
      if (terminal) return undefined;
      if (pending) throw new DataRuntimeFailure('DATA_STREAM_CONFLICT');
      pending = true;
      try {
        const response = waitForMessage();
        parent.postMessage(Object.freeze({
          type: 'prodivix.execution-data-stream-pull.v1', requestId, cursor,
        }), '*');
        const message = await response;
        if (message.phase === 'event') {
          validateRuntimePayload(
            input.documentId,
            input.document,
            input.operation.outputSchemaId,
            message.value,
            'output'
          );
          const bytes = new TextEncoder().encode(canonicalJson(message.value)).byteLength;
          eventCount += 1;
          totalBytes += bytes;
          if (eventCount > 256 || totalBytes > 4 * 1024 * 1024) {
            terminal = true;
            parent.postMessage(Object.freeze({
              type: 'prodivix.execution-data-stream-cancel.v1', requestId,
            }), '*');
            throw new DataRuntimeFailure('DATA_STREAM_CAPACITY');
          }
          cursor = message.cursor;
          const collectionSnapshot = collection?.apply(cursor, message.value);
          return Object.freeze({
            cursor,
            value: message.value,
            ...(collectionSnapshot
              ? { collection: collectionSnapshot }
              : {}),
          });
        }
        terminal = true;
        if (message.phase === 'complete') return undefined;
        if (message.phase === 'error')
          throw new DataRuntimeFailure(message.code, message.retryable);
        throw new DataRuntimeFailure('DATA_REMOTE_GATEWAY_INVALID');
      } catch (error) {
        if (!terminal) {
          terminal = true;
          parent.postMessage(Object.freeze({
            type: 'prodivix.execution-data-stream-cancel.v1', requestId,
          }), '*');
        }
        throw error;
      } finally { pending = false; }
    },
    close() {
      if (terminal) return;
      terminal = true;
      cancelPending?.();
      parent.postMessage(Object.freeze({
        type: 'prodivix.execution-data-stream-cancel.v1', requestId,
      }), '*');
    },
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
  if (input.operation.kind === 'subscription')
    throw new DataRuntimeFailure('DATA_STREAM_OPERATION_UNAVAILABLE');
  if (['server', 'edge'].includes(input.document.source.runtimeZone))
    return invokeRemoteDataGateway(input);
  if (input.document.source.runtimeZone !== 'client')
    throw new DataRuntimeFailure('DATA_STANDALONE_RUNTIME_ZONE_UNAVAILABLE');
  if (input.document.source.configurationByKey.authorization)
    literalConfiguration(input.document.source.configurationByKey.authorization);
  if (input.operation.configurationByKey.authorization)
    literalConfiguration(input.operation.configurationByKey.authorization);
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
  const parameterMappings = readRuntimeHttpParameterMappings(
    input.operation.configurationByKey.parameterMappings
  );
  const bodyInputPath = input.operation.configurationByKey.bodyInputPath
    ? runtimeHttpPointer(literalConfigurationString(input.operation.configurationByKey.bodyInputPath))
    : undefined;
  const mappedRequest = mapRuntimeHttpRequest(
    path,
    input.operationInput,
    input.operation.kind,
    parameterMappings,
    bodyInputPath
  );
  const url = httpEndpoint(baseUrl, mappedRequest.path);
  if (mappedRequest.legacyQuery !== undefined)
    appendHttpQuery(url, mappedRequest.legacyQuery);
  for (const [key, value] of Object.entries(mappedRequest.query).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    url.searchParams.append(key, value);
  const body = mappedRequest.body === undefined ? undefined : canonicalJson(mappedRequest.body);
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
  const requestHeaders = {
    ...mappedRequest.headers,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...(upstreamIdempotency ? { [upstreamIdempotency.header]: upstreamIdempotency.key } : {}),
  };
  const requestBytes = body ? new TextEncoder().encode(body).byteLength : 0;
  const requestId = input.invocationId + ':' + input.attempt;
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      ...(Object.keys(requestHeaders).length === 0 ? {} : { headers: requestHeaders }),
      ...(body === undefined ? {} : { body }),
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
  const responseBodyPath = input.operation.configurationByKey.responseBodyPath
    ? runtimeHttpPointer(literalConfigurationString(input.operation.configurationByKey.responseBodyPath))
    : undefined;
  if (responseBodyPath) {
    const projected = optionalPointer(value, responseBodyPath);
    if (projected === undefined) throw new DataRuntimeFailure('DATA_HTTP_RESPONSE_INVALID');
    value = projected;
  }
  const page = projectHttpPage(input.operation, input.operationInput, value);
  return Object.freeze({
    value,
    empty: emptyWhen === 'status-204' && response.status === 204,
    ...(page === undefined ? {} : { page }),
  });
};

const invokeLiveGraphql = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  attempt: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeResult> => {
  const code = 'DATA_GRAPHQL_CONFIGURATION_INVALID';
  if (input.document.source.adapterId !== 'core.graphql')
    throw new DataRuntimeFailure('DATA_ADAPTER_UNAVAILABLE');
  if (input.operation.kind === 'subscription')
    throw new DataRuntimeFailure('DATA_STREAM_OPERATION_UNAVAILABLE');
  if (['server', 'edge'].includes(input.document.source.runtimeZone))
    return invokeRemoteDataGateway(input);
  if (input.document.source.runtimeZone !== 'client')
    throw new DataRuntimeFailure('DATA_STANDALONE_RUNTIME_ZONE_UNAVAILABLE');
  const authorization = input.operation.configurationByKey.authorization ??
    input.document.source.configurationByKey.authorization;
  if (authorization)
    throw new DataRuntimeFailure(
      authorization.kind === 'environment-ref' || authorization.kind === 'secret-ref'
        ? 'DATA_STANDALONE_ENVIRONMENT_UNAVAILABLE'
        : code
    );
  const url = protocolEndpoint(
    literalConfigurationString(input.document.source.configurationByKey.endpoint, code),
    code
  );
  const document = literalConfigurationString(
    input.operation.configurationByKey.document,
    code
  );
  const operationName = input.operation.configurationByKey.operationName
    ? literalConfigurationString(input.operation.configurationByKey.operationName, code)
    : undefined;
  finiteGraphqlOperation(document, operationName, input.operation.kind);
  const variablesPointer = input.operation.configurationByKey.variablesInputPath
    ? protocolPointer(
        literalConfigurationString(input.operation.configurationByKey.variablesInputPath, code),
        code
      )
    : undefined;
  const variables = variablesPointer === undefined
    ? cloneJson(input.operationInput)
    : selectProtocolPointer(input.operationInput, variablesPointer, code);
  if (!runtimeHttpRecord(variables))
    throw new DataRuntimeFailure('DATA_GRAPHQL_INPUT_INVALID');
  const partialErrorPolicy = input.operation.configurationByKey.partialErrorPolicy
    ? literalConfigurationString(input.operation.configurationByKey.partialErrorPolicy, code)
    : 'reject';
  if (!['reject', 'allow-partial'].includes(partialErrorPolicy))
    throw new DataRuntimeFailure(code);
  const emptyWhen = input.operation.configurationByKey.emptyWhen
    ? literalConfigurationString(input.operation.configurationByKey.emptyWhen, code)
    : 'never';
  if (!['never', 'null', 'empty-array'].includes(emptyWhen))
    throw new DataRuntimeFailure(code);
  const idempotency = await protocolIdempotency({
    documentId: input.documentId,
    document: input.document,
    operation: input.operation,
    operationInput: input.operationInput,
    invocationId: input.invocationId,
    sequence: input.sequence,
    code,
  });
  const body = canonicalJson({
    query: document,
    variables,
    ...(operationName ? { operationName } : {}),
  });
  const contents = await executeClientJsonRequest({
    adapter: 'core.graphql',
    url,
    headers: Object.freeze({
      accept: 'application/graphql-response+json, application/json',
      'content-type': 'application/json',
      ...(idempotency ? { [idempotency.header]: idempotency.key } : {}),
    }),
    body,
    requestId: input.invocationId + ':' + input.attempt,
    documentId: input.documentId,
    operationId: input.operation.id,
    invocationId: input.invocationId,
    sequence: input.sequence,
    attempt: input.attempt,
    requestFailureCode: 'DATA_GRAPHQL_REQUEST_FAILED',
    statusFailureCode: 'DATA_GRAPHQL_STATUS_FAILED',
    responseLimitCode: 'DATA_GRAPHQL_RESPONSE_LIMIT_EXCEEDED',
    publishNetworkTrace: input.publishNetworkTrace,
  });
  const envelope = decodeBoundedProtocolJson(
    contents,
    'DATA_GRAPHQL_RESPONSE_INVALID',
    'DATA_GRAPHQL_RESPONSE_LIMIT_EXCEEDED'
  );
  if (!runtimeHttpRecord(envelope))
    throw new DataRuntimeFailure('DATA_GRAPHQL_RESPONSE_INVALID');
  const errors = envelope.errors;
  if (
    errors !== undefined &&
    (!Array.isArray(errors) || errors.length > 64 || errors.some((entry) =>
      !runtimeHttpRecord(entry) || typeof entry.message !== 'string' || !entry.message
    ))
  ) throw new DataRuntimeFailure('DATA_GRAPHQL_RESPONSE_INVALID');
  if (Array.isArray(errors) && errors.length && partialErrorPolicy === 'reject')
    throw new DataRuntimeFailure('DATA_GRAPHQL_RESPONSE_ERRORS');
  if (!Object.prototype.hasOwnProperty.call(envelope, 'data') || envelope.data === undefined)
    throw new DataRuntimeFailure('DATA_GRAPHQL_RESPONSE_INVALID');
  let value: unknown = cloneJson(envelope.data);
  const resultPath = input.operation.configurationByKey.resultPath
    ? protocolPointer(
        literalConfigurationString(input.operation.configurationByKey.resultPath, code),
        code
      )
    : undefined;
  if (resultPath !== undefined) {
    const projected = selectProtocolPointer(value, resultPath, code);
    if (projected === undefined)
      throw new DataRuntimeFailure('DATA_GRAPHQL_RESPONSE_INVALID');
    value = projected;
  }
  const page = projectHttpPage(input.operation, input.operationInput, value);
  return Object.freeze({
    value,
    empty:
      (emptyWhen === 'null' && value === null) ||
      (emptyWhen === 'empty-array' && Array.isArray(value) && value.length === 0),
    ...(page === undefined ? {} : { page }),
  });
};

const invokeLiveAsyncApi = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  attempt: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeResult> => {
  const code = 'DATA_ASYNCAPI_CONFIGURATION_INVALID';
  if (input.document.source.adapterId !== 'core.asyncapi')
    throw new DataRuntimeFailure('DATA_ADAPTER_UNAVAILABLE');
  if (input.operation.kind === 'subscription')
    throw new DataRuntimeFailure('DATA_STREAM_OPERATION_UNAVAILABLE');
  if (['server', 'edge'].includes(input.document.source.runtimeZone))
    return invokeRemoteDataGateway(input);
  if (input.document.source.runtimeZone !== 'client')
    throw new DataRuntimeFailure('DATA_STANDALONE_RUNTIME_ZONE_UNAVAILABLE');
  const authorization = input.operation.configurationByKey.authorization ??
    input.document.source.configurationByKey.authorization;
  if (authorization)
    throw new DataRuntimeFailure(
      authorization.kind === 'environment-ref' || authorization.kind === 'secret-ref'
        ? 'DATA_STANDALONE_ENVIRONMENT_UNAVAILABLE'
        : code
    );
  const action = literalConfigurationString(
    input.operation.configurationByKey.action,
    code
  );
  if (!['publish', 'request-reply'].includes(action))
    throw new DataRuntimeFailure('DATA_ASYNCAPI_ACTION_UNSUPPORTED');
  if (action === 'publish' && input.operation.kind !== 'mutation')
    throw new DataRuntimeFailure(code);
  const url = httpEndpoint(
    literalConfigurationString(input.document.source.configurationByKey.endpoint, code),
    literalConfigurationString(input.operation.configurationByKey.path, code),
    code
  );
  const bodyInputPath = input.operation.configurationByKey.bodyInputPath
    ? protocolPointer(
        literalConfigurationString(input.operation.configurationByKey.bodyInputPath, code),
        code
      )
    : undefined;
  const bodyValue = bodyInputPath === undefined
    ? cloneJson(input.operationInput)
    : selectProtocolPointer(input.operationInput, bodyInputPath, code);
  if (bodyValue === undefined)
    throw new DataRuntimeFailure('DATA_ASYNCAPI_INPUT_INVALID');
  const idempotency = await protocolIdempotency({
    documentId: input.documentId,
    document: input.document,
    operation: input.operation,
    operationInput: input.operationInput,
    invocationId: input.invocationId,
    sequence: input.sequence,
    code,
  });
  const contents = await executeClientJsonRequest({
    adapter: 'core.asyncapi',
    url,
    headers: Object.freeze({
      accept: 'application/json',
      'content-type': 'application/json',
      ...(idempotency ? { [idempotency.header]: idempotency.key } : {}),
    }),
    body: canonicalJson(bodyValue),
    requestId: input.invocationId + ':' + input.attempt,
    documentId: input.documentId,
    operationId: input.operation.id,
    invocationId: input.invocationId,
    sequence: input.sequence,
    attempt: input.attempt,
    requestFailureCode: 'DATA_ASYNCAPI_REQUEST_FAILED',
    statusFailureCode: 'DATA_ASYNCAPI_STATUS_FAILED',
    responseLimitCode: 'DATA_ASYNCAPI_RESPONSE_LIMIT_EXCEEDED',
    publishNetworkTrace: input.publishNetworkTrace,
  });
  if (action === 'publish') return Object.freeze({ value: true, empty: false });
  if (!contents.byteLength)
    throw new DataRuntimeFailure('DATA_ASYNCAPI_RESPONSE_INVALID');
  let value = decodeBoundedProtocolJson(
    contents,
    'DATA_ASYNCAPI_RESPONSE_INVALID',
    'DATA_ASYNCAPI_RESPONSE_LIMIT_EXCEEDED'
  );
  const responseBodyPath = input.operation.configurationByKey.responseBodyPath
    ? protocolPointer(
        literalConfigurationString(input.operation.configurationByKey.responseBodyPath, code),
        code
      )
    : undefined;
  if (responseBodyPath !== undefined) {
    const projected = selectProtocolPointer(value, responseBodyPath, code);
    if (projected === undefined)
      throw new DataRuntimeFailure('DATA_ASYNCAPI_RESPONSE_INVALID');
    value = projected;
  }
  const emptyWhen = input.operation.configurationByKey.emptyWhen
    ? literalConfigurationString(input.operation.configurationByKey.emptyWhen, code)
    : 'never';
  if (!['never', 'null', 'empty-array'].includes(emptyWhen))
    throw new DataRuntimeFailure(code);
  return Object.freeze({
    value,
    empty:
      (emptyWhen === 'null' && value === null) ||
      (emptyWhen === 'empty-array' && Array.isArray(value) && value.length === 0),
  });
};

const invokeLiveData = async (input: Readonly<{
  documentId: string;
  document: DataRuntimeDocument;
  operation: DataRuntimeOperation;
  operationInput: unknown;
  invocationId: string;
  sequence: number;
  attempt: number;
  publishNetworkTrace(trace: DataRuntimeNetworkTrace): void;
}>): Promise<DataRuntimeResult> => {
  switch (input.document.source.adapterId) {
    case 'core.http':
      return invokeLiveHttp(input);
    case 'core.graphql':
      return invokeLiveGraphql(input);
    case 'core.asyncapi':
      return invokeLiveAsyncApi(input);
    default:
      throw new DataRuntimeFailure('DATA_ADAPTER_UNAVAILABLE');
  }
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
  adapter: { sourceId: input.document.source.adapterId, implementationId: input.mode === 'mock' ? 'core.mock' : input.document.source.adapterId, implementationVersion: '1' },
  targetId: 'react-vite-standalone',
  partitionId: 'runtime-instance',
}));
`;
