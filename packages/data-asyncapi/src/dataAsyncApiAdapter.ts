import {
  createDataOperationIdempotencyKey,
  type DataConfigurationValue,
  type DataJsonObject,
  type DataJsonValue,
  type DataOperationAbortSignal,
  type DataOperationAdapter,
} from '@prodivix/data';
import type {
  ExecutionEnvironmentResolutionLease,
  ExecutionNetworkCorrelation,
  ExecutionNetworkTrace,
  ExecutionSourceTrace,
  RuntimeZone,
} from '@prodivix/runtime-core';

export const DATA_ASYNCAPI_ADAPTER_ID = 'core.asyncapi' as const;

export const DATA_ASYNCAPI_RUNTIME_LIMITS = Object.freeze({
  maxResponseBytes: 4 * 1024 * 1024,
  maxResponseDepth: 64,
  maxResponseNodes: 100_000,
} as const);

export type DataAsyncApiFiniteAction = 'publish' | 'request-reply';

export type DataAsyncApiTransportRequest = Readonly<{
  requestId: string;
  url: string;
  method: 'POST';
  headers: Readonly<Record<string, string>>;
  body: string;
  signal?: DataOperationAbortSignal;
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  adapter: typeof DATA_ASYNCAPI_ADAPTER_ID;
  correlation?: ExecutionNetworkCorrelation;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type DataAsyncApiTransportResponse = Readonly<{
  status: number;
  ok: boolean;
  text: string;
  trace: ExecutionNetworkTrace;
}>;

export type DataAsyncApiTransport = Readonly<{
  execute(
    request: DataAsyncApiTransportRequest
  ): Promise<DataAsyncApiTransportResponse>;
}>;

export class DataAsyncApiOperationError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: Readonly<{ status?: number; retryable?: boolean }> = {}
  ) {
    super(message);
    this.name = 'DataAsyncApiOperationError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const isObject = (value: unknown): value is DataJsonObject =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

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
  if (
    typeof resolved !== 'string' ||
    !resolved ||
    resolved !== resolved.trim() ||
    resolved.includes('\0')
  )
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      `${label} must resolve to a canonical string.`
    );
  return resolved;
};

const optionalString = (
  value: DataConfigurationValue | undefined,
  label: string,
  field: string,
  environment: ExecutionEnvironmentResolutionLease | undefined
): string | undefined =>
  value ? literalString(value, label, field, environment) : undefined;

const endpoint = (baseUrl: string, path: string): string => {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      'AsyncAPI endpoint must be absolute.'
    );
  }
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:') ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !path.startsWith('/') ||
    path.startsWith('//')
  )
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      'AsyncAPI HTTP endpoint or channel address is unsupported.'
    );
  return new URL(path, base).toString();
};

const readPointer = (
  value: DataJsonValue,
  pointer: string
): DataJsonValue | undefined => {
  if (pointer === '') return value;
  if (!pointer.startsWith('/') || /~(?:[^01]|$)/u.test(pointer))
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      'AsyncAPI body mapping must use a canonical JSON Pointer.'
    );
  let current: DataJsonValue | undefined = value;
  for (const raw of pointer.slice(1).split('/')) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      current = current[Number(token)];
    } else if (isObject(current)) current = current[token];
    else return undefined;
  }
  return current;
};

const readJson = (text: string): DataJsonValue => {
  if (
    new TextEncoder().encode(text).length >
    DATA_ASYNCAPI_RUNTIME_LIMITS.maxResponseBytes
  )
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_RESPONSE_LIMIT_EXCEEDED',
      'AsyncAPI reply exceeds the byte budget.'
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_RESPONSE_INVALID',
      'AsyncAPI reply must be JSON.'
    );
  }
  let nodes = 0;
  const visit = (value: unknown, depth: number): DataJsonValue => {
    nodes += 1;
    if (
      nodes > DATA_ASYNCAPI_RUNTIME_LIMITS.maxResponseNodes ||
      depth > DATA_ASYNCAPI_RUNTIME_LIMITS.maxResponseDepth
    )
      throw new DataAsyncApiOperationError(
        'DATA_ASYNCAPI_RESPONSE_LIMIT_EXCEEDED',
        'AsyncAPI reply exceeds the structural budget.'
      );
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_RESPONSE_INVALID',
          'AsyncAPI reply contains a non-finite number.'
        );
      return value;
    }
    if (Array.isArray(value))
      return Object.freeze(value.map((entry) => visit(entry, depth + 1)));
    if (!value || typeof value !== 'object')
      throw new DataAsyncApiOperationError(
        'DATA_ASYNCAPI_RESPONSE_INVALID',
        'AsyncAPI reply contains an unsupported value.'
      );
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, visit(entry, depth + 1)])
      )
    );
  };
  return visit(parsed, 0);
};

const secretConfiguration = (
  value: DataConfigurationValue | undefined
): Extract<DataConfigurationValue, { kind: 'secret-ref' }> | undefined => {
  if (!value) return undefined;
  if (value.kind !== 'secret-ref')
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      'AsyncAPI authorization must use a Secret reference.'
    );
  return value;
};

const safeHeader = (value: string): string => {
  if (
    value !== value.toLowerCase() ||
    value.length > 128 ||
    !/^[!#$%&'*+.^_|~0-9a-z-]+$/u.test(value) ||
    [
      'authorization',
      'content-length',
      'content-type',
      'cookie',
      'host',
    ].includes(value)
  )
    throw new DataAsyncApiOperationError(
      'DATA_ASYNCAPI_CONFIGURATION_INVALID',
      'AsyncAPI idempotency header is unsafe.'
    );
  return value;
};

const transportTrace = (error: unknown): ExecutionNetworkTrace | undefined =>
  error && typeof error === 'object' && 'trace' in error
    ? (error as { trace?: ExecutionNetworkTrace }).trace
    : undefined;

/** Finite-only AsyncAPI adapter. It intentionally has no receive/stream Session. */
export const createDataAsyncApiAdapter = (input: {
  transport: DataAsyncApiTransport;
}): DataOperationAdapter =>
  Object.freeze({
    descriptor: Object.freeze({
      id: DATA_ASYNCAPI_ADAPTER_ID,
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
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_ACTION_UNSUPPORTED',
          'AsyncAPI subscription requires the bounded stream adapter.'
        );
      const action = literalString(
        operation.configurationByKey.action,
        'AsyncAPI finite action',
        'operation.action',
        environment
      );
      if (action !== 'publish' && action !== 'request-reply')
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_ACTION_UNSUPPORTED',
          'AsyncAPI receive, subscription, and stream actions are unsupported.'
        );
      if (action === 'publish' && operation.kind !== 'mutation')
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'AsyncAPI publish must be a canonical mutation.'
        );
      const url = endpoint(
        literalString(
          source.configurationByKey.endpoint,
          'AsyncAPI source endpoint',
          'source.endpoint',
          environment
        ),
        literalString(
          operation.configurationByKey.path,
          'AsyncAPI channel path',
          'operation.path',
          environment
        )
      );
      const bodyInputPath = optionalString(
        operation.configurationByKey.bodyInputPath,
        'AsyncAPI body input path',
        'operation.bodyInputPath',
        environment
      );
      const bodyValue = bodyInputPath
        ? readPointer(invocation.input, bodyInputPath)
        : invocation.input;
      if (bodyValue === undefined)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_INPUT_INVALID',
          'AsyncAPI message payload mapping did not resolve.'
        );
      const authorization = secretConfiguration(
        operation.configurationByKey.authorization ??
          source.configurationByKey.authorization
      );
      if (authorization && !environment)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'AsyncAPI authorization requires an environment lease.'
        );
      let idempotency: Readonly<{ header: string; key: string }> | undefined;
      if (operation.policies.idempotency) {
        if (operation.kind !== 'mutation')
          throw new DataAsyncApiOperationError(
            'DATA_ASYNCAPI_CONFIGURATION_INVALID',
            'AsyncAPI idempotency is restricted to mutations.'
          );
        idempotency = Object.freeze({
          header: safeHeader(
            literalString(
              operation.configurationByKey.idempotencyHeader,
              'AsyncAPI idempotency header',
              'operation.idempotencyHeader',
              environment
            )
          ),
          key: createDataOperationIdempotencyKey(invocation),
        });
      } else if (operation.configurationByKey.idempotencyHeader)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'AsyncAPI idempotencyHeader requires an idempotency policy.'
        );
      const correlation = Object.freeze({
        kind: 'data-operation' as const,
        documentId: invocation.operation.documentId,
        operationId: invocation.operation.operationId,
        invocationId: invocation.invocationId,
        sequence: invocation.sequence,
        attempt: invocation.attempt,
      });
      const execute = async (
        secret?: string
      ): Promise<DataAsyncApiTransportResponse> => {
        try {
          return await input.transport.execute({
            requestId: `${invocation.invocationId}:${invocation.attempt}`,
            url,
            method: 'POST',
            headers: Object.freeze({
              accept: 'application/json',
              'content-type': 'application/json',
              ...(secret ? { authorization: secret } : {}),
              ...(idempotency ? { [idempotency.header]: idempotency.key } : {}),
            }),
            body: JSON.stringify(bodyValue),
            signal,
            runtimeZone: invocation.runtimeZone,
            mode: invocation.mode,
            adapter: DATA_ASYNCAPI_ADAPTER_ID,
            correlation,
            ...(invocation.sourceTrace
              ? { sourceTrace: invocation.sourceTrace }
              : {}),
          });
        } catch (error) {
          const trace = transportTrace(error);
          if (trace) publishNetworkTrace(trace);
          throw new DataAsyncApiOperationError(
            'DATA_ASYNCAPI_REQUEST_FAILED',
            'AsyncAPI finite Data operation request failed.',
            { retryable: true }
          );
        }
      };
      let response: DataAsyncApiTransportResponse | undefined;
      if (authorization && environment)
        await environment.useSecret(
          authorization.reference,
          operation.configurationByKey.authorization
            ? 'operation.authorization'
            : 'source.authorization',
          async (material) => {
            response = await execute(material);
          }
        );
      else response = await execute();
      if (!response)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_REQUEST_FAILED',
          'AsyncAPI finite Data operation request failed.'
        );
      publishNetworkTrace(response.trace);
      if (!response.ok)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_STATUS_FAILED',
          `AsyncAPI finite operation returned status ${response.status}.`,
          {
            status: response.status,
            retryable:
              response.status === 408 ||
              response.status === 429 ||
              response.status >= 500,
          }
        );
      if (action === 'publish')
        return Object.freeze({ value: true, empty: false });
      if (!response.text)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_RESPONSE_INVALID',
          'AsyncAPI request-reply operation returned no reply payload.'
        );
      let value = readJson(response.text);
      const responseBodyPath = optionalString(
        operation.configurationByKey.responseBodyPath,
        'AsyncAPI response body path',
        'operation.responseBodyPath',
        environment
      );
      if (responseBodyPath) {
        const mapped = readPointer(value, responseBodyPath);
        if (mapped === undefined)
          throw new DataAsyncApiOperationError(
            'DATA_ASYNCAPI_RESPONSE_INVALID',
            'AsyncAPI reply mapping did not resolve.'
          );
        value = mapped;
      }
      const emptyWhen =
        optionalString(
          operation.configurationByKey.emptyWhen,
          'AsyncAPI empty policy',
          'operation.emptyWhen',
          environment
        ) ?? 'never';
      if (!['never', 'null', 'empty-array'].includes(emptyWhen))
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'AsyncAPI empty policy is unsupported.'
        );
      return Object.freeze({
        value,
        empty:
          (emptyWhen === 'null' && value === null) ||
          (emptyWhen === 'empty-array' &&
            Array.isArray(value) &&
            value.length === 0),
      });
    },
  });

export type DataAsyncApiStreamTransportRequest = Readonly<{
  requestId: string;
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  signal?: DataOperationAbortSignal;
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  adapter: typeof DATA_ASYNCAPI_ADAPTER_ID;
  correlation?: ExecutionNetworkCorrelation;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type DataAsyncApiStreamTransportResponse = Readonly<{
  trace: ExecutionNetworkTrace;
  events: AsyncIterable<string>;
  close(reason?: string): void | Promise<void>;
}>;

export type DataAsyncApiStreamTransport = Readonly<{
  open(
    request: DataAsyncApiStreamTransportRequest
  ): Promise<DataAsyncApiStreamTransportResponse>;
}>;

/** Adds bounded receive/stream sessions while retaining the finite adapter for publish/request-reply. */
export const createDataAsyncApiStreamingAdapter = (input: {
  transport: DataAsyncApiTransport;
  streamTransport: DataAsyncApiStreamTransport;
}): DataOperationAdapter => {
  const finite = createDataAsyncApiAdapter({ transport: input.transport });
  return Object.freeze({
    descriptor: Object.freeze({
      ...finite.descriptor,
      operationKinds: Object.freeze([
        'query',
        'mutation',
        'subscription',
      ] as const),
      capabilities: Object.freeze([
        ...finite.descriptor.capabilities,
        'stream',
      ] as const),
    }),
    invoke: finite.invoke,
    async openStream({
      invocation,
      source,
      operation,
      environment,
      signal,
      publishNetworkTrace,
    }) {
      if (operation.kind !== 'subscription')
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_ACTION_UNSUPPORTED',
          'AsyncAPI stream adapter accepts only subscriptions.'
        );
      const action = literalString(
        operation.configurationByKey.action,
        'AsyncAPI stream action',
        'operation.action',
        environment
      );
      if (action !== 'receive' && action !== 'stream')
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_ACTION_UNSUPPORTED',
          'AsyncAPI subscription action must be receive or stream.'
        );
      const url = endpoint(
        literalString(
          source.configurationByKey.endpoint,
          'AsyncAPI source endpoint',
          'source.endpoint',
          environment
        ),
        literalString(
          operation.configurationByKey.path,
          'AsyncAPI channel path',
          'operation.path',
          environment
        )
      );
      const authorization = secretConfiguration(
        operation.configurationByKey.authorization ??
          source.configurationByKey.authorization
      );
      if (
        authorization &&
        operation.policies.stream?.credentialRenewal !== 'per-connection'
      )
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'Secret-authenticated AsyncAPI streams require per-connection credential renewal.'
        );
      if (authorization && !environment)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_CONFIGURATION_INVALID',
          'AsyncAPI stream credential renewal requires an environment lease.'
        );
      const bodyInputPath = optionalString(
        operation.configurationByKey.bodyInputPath,
        'AsyncAPI body input path',
        'operation.bodyInputPath',
        environment
      );
      const bodyValue = bodyInputPath
        ? readPointer(invocation.input, bodyInputPath)
        : invocation.input;
      if (bodyValue === undefined)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_INPUT_INVALID',
          'AsyncAPI stream payload mapping did not resolve.'
        );
      const responseBodyPath = optionalString(
        operation.configurationByKey.responseBodyPath,
        'AsyncAPI stream event path',
        'operation.responseBodyPath',
        environment
      );
      const correlation = Object.freeze({
        kind: 'data-operation' as const,
        documentId: invocation.operation.documentId,
        operationId: invocation.operation.operationId,
        invocationId: invocation.invocationId,
        sequence: invocation.sequence,
        attempt: invocation.attempt,
      });
      const open = (secret?: string) =>
        input.streamTransport.open({
          requestId: `${invocation.invocationId}:stream`,
          url,
          method: action === 'receive' ? 'GET' : 'POST',
          headers: Object.freeze({
            accept: 'text/event-stream, application/x-ndjson',
            ...(action === 'stream'
              ? { 'content-type': 'application/json' }
              : {}),
            ...(secret ? { authorization: secret } : {}),
          }),
          ...(action === 'stream' ? { body: JSON.stringify(bodyValue) } : {}),
          signal,
          runtimeZone: invocation.runtimeZone,
          mode: invocation.mode,
          adapter: DATA_ASYNCAPI_ADAPTER_ID,
          correlation,
          ...(invocation.sourceTrace
            ? { sourceTrace: invocation.sourceTrace }
            : {}),
        });
      let stream: Awaited<ReturnType<typeof open>> | undefined;
      if (authorization && environment)
        await environment.useSecret(
          authorization.reference,
          operation.configurationByKey.authorization
            ? 'operation.authorization'
            : 'source.authorization',
          async (material) => {
            stream = await open(material);
          }
        );
      else stream = await open();
      if (!stream)
        throw new DataAsyncApiOperationError(
          'DATA_ASYNCAPI_REQUEST_FAILED',
          'AsyncAPI stream could not be opened.',
          { retryable: true }
        );
      publishNetworkTrace(stream.trace);
      const upstream = stream;
      return Object.freeze({
        events: (async function* () {
          for await (const frame of upstream.events) {
            let value = readJson(frame);
            if (responseBodyPath) {
              const projected = readPointer(value, responseBodyPath);
              if (projected === undefined)
                throw new DataAsyncApiOperationError(
                  'DATA_ASYNCAPI_RESPONSE_INVALID',
                  'AsyncAPI stream event path did not resolve.'
                );
              value = projected;
            }
            yield value;
          }
        })(),
        close: upstream.close,
      });
    },
  });
};
