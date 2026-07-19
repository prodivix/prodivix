import {
  createDataOperationIdempotencyKey,
  type DataConfigurationValue,
  type DataJsonObject,
  type DataJsonValue,
  type DataOperationAbortSignal,
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
import { Kind, parse, type OperationDefinitionNode } from 'graphql';

export const DATA_GRAPHQL_ADAPTER_ID = 'core.graphql' as const;

export const DATA_GRAPHQL_RUNTIME_LIMITS = Object.freeze({
  maxDocumentBytes: 128 * 1024,
  maxResponseBytes: 4 * 1024 * 1024,
  maxResponseDepth: 64,
  maxResponseNodes: 100_000,
  maxErrors: 64,
} as const);

export type DataGraphqlTransportRequest = Readonly<{
  requestId: string;
  url: string;
  method: 'POST';
  headers: Readonly<Record<string, string>>;
  body: string;
  signal?: DataOperationAbortSignal;
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  adapter: typeof DATA_GRAPHQL_ADAPTER_ID;
  correlation?: ExecutionNetworkCorrelation;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type DataGraphqlTransportResponse = Readonly<{
  status: number;
  ok: boolean;
  text: string;
  trace: ExecutionNetworkTrace;
}>;

export type DataGraphqlTransport = Readonly<{
  execute(
    request: DataGraphqlTransportRequest
  ): Promise<DataGraphqlTransportResponse>;
}>;

export class DataGraphqlOperationError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: Readonly<{ status?: number; retryable?: boolean }> = {}
  ) {
    super(message);
    this.name = 'DataGraphqlOperationError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
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
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      `${label} must resolve to a canonical string.`
    );
  return resolved;
};

const optionalLiteralString = (
  value: DataConfigurationValue | undefined,
  label: string,
  field: string,
  environment: ExecutionEnvironmentResolutionLease | undefined
): string | undefined =>
  value ? literalString(value, label, field, environment) : undefined;

const endpoint = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      'GraphQL endpoint must be absolute.'
    );
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      'GraphQL endpoint contains unsupported URL fields.'
    );
  return url.toString();
};

const readPointer = (
  value: DataJsonValue,
  pointer: string
): DataJsonValue | undefined => {
  if (pointer === '') return value;
  if (!pointer.startsWith('/') || /~(?:[^01]|$)/u.test(pointer))
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      'GraphQL mapping must use a canonical JSON Pointer.'
    );
  let current: DataJsonValue | undefined = value;
  for (const raw of pointer.slice(1).split('/')) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      current = current[Number(token)];
    } else if (current !== null && typeof current === 'object') {
      current = (current as DataJsonObject)[token];
    } else return undefined;
  }
  return current;
};

const cloneBoundedJson = (text: string): DataJsonValue => {
  if (
    new TextEncoder().encode(text).length >
    DATA_GRAPHQL_RUNTIME_LIMITS.maxResponseBytes
  )
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_RESPONSE_LIMIT_EXCEEDED',
      'GraphQL response exceeds the byte budget.'
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_RESPONSE_INVALID',
      'GraphQL response must be JSON.'
    );
  }
  let nodes = 0;
  const visit = (value: unknown, depth: number): DataJsonValue => {
    nodes += 1;
    if (
      nodes > DATA_GRAPHQL_RUNTIME_LIMITS.maxResponseNodes ||
      depth > DATA_GRAPHQL_RUNTIME_LIMITS.maxResponseDepth
    )
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_RESPONSE_LIMIT_EXCEEDED',
        'GraphQL response exceeds the structural budget.'
      );
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_RESPONSE_INVALID',
          'GraphQL response contains a non-finite number.'
        );
      return value;
    }
    if (Array.isArray(value))
      return Object.freeze(value.map((entry) => visit(entry, depth + 1)));
    if (!isObject(value))
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_RESPONSE_INVALID',
        'GraphQL response contains an unsupported value.'
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

const resolveOperationDefinition = (
  document: string,
  operationName: string | undefined,
  expectedKind: 'query' | 'mutation' | 'subscription'
): void => {
  if (
    new TextEncoder().encode(document).length >
    DATA_GRAPHQL_RUNTIME_LIMITS.maxDocumentBytes
  )
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_DOCUMENT_LIMIT_EXCEEDED',
      'GraphQL operation document exceeds the byte budget.'
    );
  let definitions: readonly OperationDefinitionNode[];
  try {
    definitions = parse(document, { maxTokens: 20_000 }).definitions.filter(
      (definition): definition is OperationDefinitionNode =>
        definition.kind === Kind.OPERATION_DEFINITION
    );
  } catch {
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_DOCUMENT_INVALID',
      'GraphQL operation document is invalid.'
    );
  }
  const selected = operationName
    ? definitions.filter(
        (definition) => definition.name?.value === operationName
      )
    : definitions.length === 1
      ? definitions
      : [];
  if (selected.length !== 1 || selected[0]?.operation !== expectedKind)
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_OPERATION_UNSUPPORTED',
      'GraphQL operation selection or canonical kind does not match.'
    );
};

const secretConfiguration = (
  value: DataConfigurationValue | undefined
): Extract<DataConfigurationValue, { kind: 'secret-ref' }> | undefined => {
  if (!value) return undefined;
  if (value.kind !== 'secret-ref')
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      'GraphQL authorization must use a Secret reference.'
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
    throw new DataGraphqlOperationError(
      'DATA_GRAPHQL_CONFIGURATION_INVALID',
      'GraphQL idempotency header is unsafe.'
    );
  return value;
};

const transportTrace = (error: unknown): ExecutionNetworkTrace | undefined =>
  error && typeof error === 'object' && 'trace' in error
    ? (error as { trace?: ExecutionNetworkTrace }).trace
    : undefined;

const pageSnapshot = (
  operation: Parameters<DataOperationAdapter['invoke']>[0]['operation'],
  input: DataJsonValue,
  value: DataJsonValue
): DataPageSnapshot | undefined => {
  const policy = operation.policies.pagination;
  if (!policy) return undefined;
  const readInputInteger = (pointer: string, fallback: number): number => {
    const candidate = readPointer(input, pointer) ?? fallback;
    if (!Number.isSafeInteger(candidate) || (candidate as number) < 0)
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_INPUT_INVALID',
        'GraphQL pagination input is invalid.'
      );
    return candidate as number;
  };
  if (policy.kind === 'offset') {
    if (!policy.totalPath)
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_CONFIGURATION_INVALID',
        'GraphQL offset pagination requires totalPath.'
      );
    const offset = readInputInteger(policy.offsetInput, 0);
    const limit = readInputInteger(policy.limitInput, policy.defaultLimit);
    const total = readPointer(value, policy.totalPath);
    if (!Number.isSafeInteger(total) || (total as number) < 0)
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_RESPONSE_INVALID',
        'GraphQL pagination total is invalid.'
      );
    return Object.freeze({
      kind: 'offset',
      offset,
      limit,
      total: total as number,
      hasMore: offset + limit < (total as number),
    });
  }
  const cursor = (pointer: string | undefined): string | undefined => {
    if (!pointer) return undefined;
    const candidate = readPointer(value, pointer);
    if (candidate === undefined || candidate === null) return undefined;
    if (
      typeof candidate !== 'string' ||
      !candidate ||
      candidate !== candidate.trim()
    )
      throw new DataGraphqlOperationError(
        'DATA_GRAPHQL_RESPONSE_INVALID',
        'GraphQL pagination cursor is invalid.'
      );
    return candidate;
  };
  const nextCursor = cursor(policy.nextCursorPath);
  const previousCursor = cursor(policy.previousCursorPath);
  return Object.freeze({
    kind: 'cursor',
    hasMore: nextCursor !== undefined,
    ...(nextCursor ? { nextCursor } : {}),
    ...(previousCursor ? { previousCursor } : {}),
  });
};

/** Executes only finite GraphQL query/mutation documents through the Data kernel. */
export const createDataGraphqlAdapter = (input: {
  transport: DataGraphqlTransport;
}): DataOperationAdapter =>
  Object.freeze({
    descriptor: Object.freeze({
      id: DATA_GRAPHQL_ADAPTER_ID,
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
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_OPERATION_UNSUPPORTED',
          'GraphQL subscription requires the bounded stream adapter.'
        );
      const url = endpoint(
        literalString(
          source.configurationByKey.endpoint,
          'GraphQL source endpoint',
          'source.endpoint',
          environment
        )
      );
      const document = literalString(
        operation.configurationByKey.document,
        'GraphQL operation document',
        'operation.document',
        environment
      );
      const operationName = optionalLiteralString(
        operation.configurationByKey.operationName,
        'GraphQL operation name',
        'operation.operationName',
        environment
      );
      resolveOperationDefinition(document, operationName, operation.kind);
      const variablesPointer = optionalLiteralString(
        operation.configurationByKey.variablesInputPath,
        'GraphQL variables input path',
        'operation.variablesInputPath',
        environment
      );
      const variables = variablesPointer
        ? readPointer(invocation.input, variablesPointer)
        : invocation.input;
      if (variables === undefined || !isObject(variables))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_INPUT_INVALID',
          'GraphQL variables must resolve to an object.'
        );
      const partialErrorPolicy =
        optionalLiteralString(
          operation.configurationByKey.partialErrorPolicy,
          'GraphQL partial error policy',
          'operation.partialErrorPolicy',
          environment
        ) ?? 'reject';
      if (
        partialErrorPolicy !== 'reject' &&
        partialErrorPolicy !== 'allow-partial'
      )
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL partial error policy is unsupported.'
        );
      const emptyWhen =
        optionalLiteralString(
          operation.configurationByKey.emptyWhen,
          'GraphQL empty policy',
          'operation.emptyWhen',
          environment
        ) ?? 'never';
      if (!['never', 'null', 'empty-array'].includes(emptyWhen))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL empty policy is unsupported.'
        );
      const authorization = secretConfiguration(
        operation.configurationByKey.authorization ??
          source.configurationByKey.authorization
      );
      if (authorization && !environment)
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL authorization requires an environment lease.'
        );
      let idempotency: Readonly<{ header: string; key: string }> | undefined;
      if (operation.policies.idempotency) {
        if (operation.kind !== 'mutation')
          throw new DataGraphqlOperationError(
            'DATA_GRAPHQL_CONFIGURATION_INVALID',
            'GraphQL idempotency is restricted to mutations.'
          );
        idempotency = Object.freeze({
          header: safeHeader(
            literalString(
              operation.configurationByKey.idempotencyHeader,
              'GraphQL idempotency header',
              'operation.idempotencyHeader',
              environment
            )
          ),
          key: createDataOperationIdempotencyKey(invocation),
        });
      } else if (operation.configurationByKey.idempotencyHeader) {
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL idempotencyHeader requires an idempotency policy.'
        );
      }
      const correlation = Object.freeze({
        kind: 'data-operation' as const,
        documentId: invocation.operation.documentId,
        operationId: invocation.operation.operationId,
        invocationId: invocation.invocationId,
        sequence: invocation.sequence,
        attempt: invocation.attempt,
      });
      const body = JSON.stringify({
        query: document,
        variables,
        ...(operationName ? { operationName } : {}),
      });
      const execute = async (
        secret?: string
      ): Promise<DataGraphqlTransportResponse> => {
        try {
          return await input.transport.execute({
            requestId: `${invocation.invocationId}:${invocation.attempt}`,
            url,
            method: 'POST',
            headers: Object.freeze({
              accept: 'application/graphql-response+json, application/json',
              'content-type': 'application/json',
              ...(secret ? { authorization: secret } : {}),
              ...(idempotency ? { [idempotency.header]: idempotency.key } : {}),
            }),
            body,
            signal,
            runtimeZone: invocation.runtimeZone,
            mode: invocation.mode,
            adapter: DATA_GRAPHQL_ADAPTER_ID,
            correlation,
            ...(invocation.sourceTrace
              ? { sourceTrace: invocation.sourceTrace }
              : {}),
          });
        } catch (error) {
          const trace = transportTrace(error);
          if (trace) publishNetworkTrace(trace);
          throw new DataGraphqlOperationError(
            'DATA_GRAPHQL_REQUEST_FAILED',
            'GraphQL Data operation request failed.',
            { retryable: true }
          );
        }
      };
      let response: DataGraphqlTransportResponse | undefined;
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
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_REQUEST_FAILED',
          'GraphQL Data operation request failed.'
        );
      publishNetworkTrace(response.trace);
      if (!response.ok)
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_STATUS_FAILED',
          `GraphQL Data operation returned status ${response.status}.`,
          {
            status: response.status,
            retryable:
              response.status === 408 ||
              response.status === 429 ||
              response.status >= 500,
          }
        );
      const envelope = cloneBoundedJson(response.text);
      if (!isObject(envelope))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_RESPONSE_INVALID',
          'GraphQL response envelope must be an object.'
        );
      const errors = envelope.errors;
      if (
        errors !== undefined &&
        (!Array.isArray(errors) ||
          errors.length > DATA_GRAPHQL_RUNTIME_LIMITS.maxErrors ||
          errors.some(
            (entry) =>
              !isObject(entry) ||
              typeof entry.message !== 'string' ||
              !entry.message
          ))
      )
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_RESPONSE_INVALID',
          'GraphQL response errors are malformed or exceed the budget.'
        );
      if (
        Array.isArray(errors) &&
        errors.length > 0 &&
        partialErrorPolicy === 'reject'
      )
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_RESPONSE_ERRORS',
          'GraphQL response contains execution errors.'
        );
      if (!Object.hasOwn(envelope, 'data') || envelope.data === undefined)
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_RESPONSE_INVALID',
          'GraphQL response does not contain data.'
        );
      let value = envelope.data as DataJsonValue;
      const resultPath = optionalLiteralString(
        operation.configurationByKey.resultPath,
        'GraphQL result path',
        'operation.resultPath',
        environment
      );
      if (resultPath) {
        const mapped = readPointer(value, resultPath);
        if (mapped === undefined)
          throw new DataGraphqlOperationError(
            'DATA_GRAPHQL_RESPONSE_INVALID',
            'GraphQL result path did not resolve.'
          );
        value = mapped;
      }
      const page = pageSnapshot(operation, invocation.input, value);
      return Object.freeze({
        value,
        empty:
          (emptyWhen === 'null' && value === null) ||
          (emptyWhen === 'empty-array' &&
            Array.isArray(value) &&
            value.length === 0),
        ...(page ? { page } : {}),
      });
    },
  });

export type DataGraphqlStreamTransportResponse = Readonly<{
  trace: ExecutionNetworkTrace;
  events: AsyncIterable<string>;
  close(reason?: string): void | Promise<void>;
}>;

export type DataGraphqlStreamTransport = Readonly<{
  open(
    request: DataGraphqlTransportRequest
  ): Promise<DataGraphqlStreamTransportResponse>;
}>;

/** Adds GraphQL subscription without changing finite query/mutation semantics. */
export const createDataGraphqlStreamingAdapter = (input: {
  transport: DataGraphqlTransport;
  streamTransport: DataGraphqlStreamTransport;
}): DataOperationAdapter => {
  const finite = createDataGraphqlAdapter({ transport: input.transport });
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
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_OPERATION_UNSUPPORTED',
          'GraphQL stream adapter accepts only subscriptions.'
        );
      const url = endpoint(
        literalString(
          source.configurationByKey.endpoint,
          'GraphQL source endpoint',
          'source.endpoint',
          environment
        )
      );
      const document = literalString(
        operation.configurationByKey.document,
        'GraphQL subscription document',
        'operation.document',
        environment
      );
      const operationName = optionalLiteralString(
        operation.configurationByKey.operationName,
        'GraphQL operation name',
        'operation.operationName',
        environment
      );
      resolveOperationDefinition(document, operationName, 'subscription');
      const variablesPointer = optionalLiteralString(
        operation.configurationByKey.variablesInputPath,
        'GraphQL variables input path',
        'operation.variablesInputPath',
        environment
      );
      const variables = variablesPointer
        ? readPointer(invocation.input, variablesPointer)
        : invocation.input;
      if (variables === undefined || !isObject(variables))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_INPUT_INVALID',
          'GraphQL subscription variables must resolve to an object.'
        );
      const resultPath = optionalLiteralString(
        operation.configurationByKey.resultPath,
        'GraphQL result path',
        'operation.resultPath',
        environment
      );
      const partialErrorPolicy =
        optionalLiteralString(
          operation.configurationByKey.partialErrorPolicy,
          'GraphQL partial error policy',
          'operation.partialErrorPolicy',
          environment
        ) ?? 'reject';
      if (!['reject', 'allow-partial'].includes(partialErrorPolicy))
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL partial error policy is unsupported.'
        );
      const authorization = secretConfiguration(
        operation.configurationByKey.authorization ??
          source.configurationByKey.authorization
      );
      if (
        authorization &&
        operation.policies.stream?.credentialRenewal !== 'per-connection'
      )
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'Secret-authenticated GraphQL subscriptions require per-connection credential renewal.'
        );
      if (authorization && !environment)
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_CONFIGURATION_INVALID',
          'GraphQL subscription credential renewal requires an environment lease.'
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
          method: 'POST',
          headers: Object.freeze({
            accept: 'text/event-stream, application/graphql-response+json',
            'content-type': 'application/json',
            ...(secret ? { authorization: secret } : {}),
          }),
          body: JSON.stringify({
            query: document,
            variables,
            ...(operationName ? { operationName } : {}),
          }),
          signal,
          runtimeZone: invocation.runtimeZone,
          mode: invocation.mode,
          adapter: DATA_GRAPHQL_ADAPTER_ID,
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
        throw new DataGraphqlOperationError(
          'DATA_GRAPHQL_REQUEST_FAILED',
          'GraphQL subscription could not be opened.',
          { retryable: true }
        );
      publishNetworkTrace(stream.trace);
      const upstream = stream;
      return Object.freeze({
        events: (async function* () {
          for await (const frame of upstream.events) {
            const envelope = cloneBoundedJson(frame);
            if (!isObject(envelope))
              throw new DataGraphqlOperationError(
                'DATA_GRAPHQL_RESPONSE_INVALID',
                'GraphQL subscription frame must be an object.'
              );
            const errors = envelope.errors;
            if (
              errors !== undefined &&
              (!Array.isArray(errors) ||
                errors.length > DATA_GRAPHQL_RUNTIME_LIMITS.maxErrors ||
                errors.some(
                  (entry) =>
                    !isObject(entry) ||
                    typeof entry.message !== 'string' ||
                    !entry.message
                ))
            )
              throw new DataGraphqlOperationError(
                'DATA_GRAPHQL_RESPONSE_INVALID',
                'GraphQL subscription errors exceed the budget.'
              );
            if (
              Array.isArray(errors) &&
              errors.length > 0 &&
              partialErrorPolicy === 'reject'
            )
              throw new DataGraphqlOperationError(
                'DATA_GRAPHQL_RESPONSE_ERRORS',
                'GraphQL subscription frame contains errors.'
              );
            if (!Object.hasOwn(envelope, 'data'))
              throw new DataGraphqlOperationError(
                'DATA_GRAPHQL_RESPONSE_INVALID',
                'GraphQL subscription frame has no data.'
              );
            let value = envelope.data as DataJsonValue;
            if (resultPath) {
              const projected = readPointer(value, resultPath);
              if (projected === undefined)
                throw new DataGraphqlOperationError(
                  'DATA_GRAPHQL_RESPONSE_INVALID',
                  'GraphQL subscription result path did not resolve.'
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
