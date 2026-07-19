import {
  createDataLifecycleChannel,
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  executeDataOperation,
  openDataOperationStream,
  type DataOperation,
  type DataSourceDocument,
} from '@prodivix/data';
import { createExecutionNetworkTrace } from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createDataGraphqlAdapter,
  createDataGraphqlStreamingAdapter,
  DataGraphqlOperationError,
  type DataGraphqlStreamTransport,
  type DataGraphqlTransportRequest,
} from './dataGraphqlAdapter';

const source = {
  id: 'catalog',
  adapterId: 'core.graphql',
  runtimeZone: 'client' as const,
  bindingsById: {},
  configurationByKey: {
    endpoint: {
      kind: 'literal' as const,
      value: 'https://api.example.test/graphql',
    },
  },
};

const query: DataOperation = {
  id: 'products',
  kind: 'query',
  inputSchemaId: 'input',
  outputSchemaId: 'output',
  configurationByKey: {
    document: {
      kind: 'literal',
      value: 'query Products($limit: Int!) { products(limit: $limit) { id } }',
    },
    operationName: { kind: 'literal', value: 'Products' },
    resultPath: { kind: 'literal', value: '/products' },
    emptyWhen: { kind: 'literal', value: 'empty-array' },
  },
  policies: {},
};

const document: DataSourceDocument = {
  source,
  schemasById: {
    input: { id: 'input', schema: true },
    output: { id: 'output', schema: true },
  },
  operationsById: { products: query },
};

const invocation = createDataOperationInvocation({
  invocationId: 'graphql-1',
  sequence: 1,
  attempt: 1,
  startedAt: 100,
  operation: { documentId: 'data-catalog', operationId: 'products' },
  documentRevision: 'revision-1',
  runtimeZone: 'client',
  mode: 'live',
  activation: 'route',
  input: { limit: 2 },
});

const response = (
  request: DataGraphqlTransportRequest,
  text: string,
  status = 200
) => ({
  status,
  ok: status >= 200 && status < 300,
  text,
  trace: createExecutionNetworkTrace({
    requestId: request.requestId,
    phase: 'runtime',
    runtimeZone: request.runtimeZone,
    mode: request.mode,
    adapter: request.adapter,
    method: request.method,
    sanitizedUrl: 'https://api.example.test/',
    protocol: 'https',
    startedAt: 100,
    completedAt: 120,
    outcome: 'allowed',
    status,
    correlation: request.correlation,
  }),
});

describe('Data GraphQL adapter', () => {
  it('executes one finite query with variables, result mapping, and correlated network trace', async () => {
    const execute = vi.fn(async (request: DataGraphqlTransportRequest) =>
      response(request, '{"data":{"products":[{"id":"p1"}]}}')
    );
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataGraphqlAdapter({ transport: { execute } }));
    const result = await executeDataOperation({
      registry,
      invocation,
      document,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
    });

    expect(result.result).toEqual({
      value: [{ id: 'p1' }],
      empty: false,
    });
    expect(JSON.parse(execute.mock.calls[0]![0].body)).toEqual({
      query:
        query.configurationByKey.document?.kind === 'literal'
          ? query.configurationByKey.document.value
          : undefined,
      variables: { limit: 2 },
      operationName: 'Products',
    });
    expect(result.networkTraces[0]?.correlation).toMatchObject({
      kind: 'data-operation',
      documentId: 'data-catalog',
      operationId: 'products',
      invocationId: 'graphql-1',
    });
  });

  it('rejects partial errors by default and allows bounded partial data only when explicit', async () => {
    const execute = vi.fn(async (request: DataGraphqlTransportRequest) =>
      response(
        request,
        '{"data":{"products":[]},"errors":[{"message":"denied"}]}'
      )
    );
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataGraphqlAdapter({ transport: { execute } }));
    await expect(
      executeDataOperation({
        registry,
        invocation,
        document,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_GRAPHQL_RESPONSE_ERRORS' });

    const allowed = await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        invocationId: 'graphql-partial',
      }),
      document: {
        ...document,
        operationsById: {
          products: {
            ...query,
            configurationByKey: {
              ...query.configurationByKey,
              partialErrorPolicy: { kind: 'literal', value: 'allow-partial' },
            },
          },
        },
      },
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
    });
    expect(allowed.result).toEqual({ value: [], empty: true });
  });

  it('uses an attempt-invariant invocation key for mutation retries and rejects subscription documents', async () => {
    const headers: string[] = [];
    const execute = vi.fn(async (request: DataGraphqlTransportRequest) => {
      headers.push(request.headers['idempotency-key'] ?? '');
      return response(request, '{"data":{"updateProduct":{"id":"p1"}}}');
    });
    const mutation: DataOperation = {
      id: 'update',
      kind: 'mutation',
      outputSchemaId: 'output',
      configurationByKey: {
        document: {
          kind: 'literal',
          value: 'mutation UpdateProduct { updateProduct { id } }',
        },
        operationName: { kind: 'literal', value: 'UpdateProduct' },
        idempotencyHeader: { kind: 'literal', value: 'idempotency-key' },
      },
      policies: { idempotency: { kind: 'invocation-key' } },
    };
    const mutationDocument: DataSourceDocument = {
      ...document,
      operationsById: { update: mutation },
    };
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataGraphqlAdapter({ transport: { execute } }));
    for (const attempt of [1, 2])
      await executeDataOperation({
        registry,
        invocation: createDataOperationInvocation({
          ...invocation,
          operation: { documentId: 'data-catalog', operationId: 'update' },
          attempt,
          input: {},
        }),
        document: mutationDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      });
    expect(headers[0]).toBeTruthy();
    expect(headers[1]).toBe(headers[0]);

    const adapter = createDataGraphqlAdapter({ transport: { execute } });
    await expect(
      adapter.invoke({
        invocation,
        source,
        operation: {
          ...query,
          configurationByKey: {
            document: {
              kind: 'literal',
              value: 'subscription Updates { productUpdated { id } }',
            },
          },
        },
        signal: new AbortController().signal,
        publishNetworkTrace: () => undefined,
      })
    ).rejects.toBeInstanceOf(DataGraphqlOperationError);
  });
});

describe('Data GraphQL subscription adapter', () => {
  it('opens a pull-driven subscription and projects each bounded GraphQL frame', async () => {
    const subscription: DataOperation = {
      id: 'product-updates',
      kind: 'subscription',
      inputSchemaId: 'input',
      outputSchemaId: 'output',
      configurationByKey: {
        document: {
          kind: 'literal',
          value:
            'subscription ProductUpdates($category: String!) { productUpdated(category: $category) { id name } }',
        },
        operationName: { kind: 'literal', value: 'ProductUpdates' },
        resultPath: { kind: 'literal', value: '/productUpdated' },
      },
      policies: {},
    };
    const subscriptionInvocation = createDataOperationInvocation({
      ...invocation,
      invocationId: 'graphql-stream-1',
      operation: {
        documentId: 'data-catalog',
        operationId: subscription.id,
      },
      activation: 'document',
      input: { category: 'chairs' },
    });
    const close = vi.fn();
    const open = vi.fn<DataGraphqlStreamTransport['open']>(async (request) => ({
      trace: response(request, '', 200).trace,
      events: (async function* () {
        yield '{"data":{"productUpdated":{"id":"p1","name":"Desk chair"}}}';
        yield '{"data":{"productUpdated":{"id":"p2","name":"Lounge chair"}}}';
      })(),
      close,
    }));
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataGraphqlStreamingAdapter({
        transport: { execute: vi.fn() },
        streamTransport: { open },
      })
    );
    const traces: unknown[] = [];
    const session = await openDataOperationStream({
      registry,
      invocation: subscriptionInvocation,
      document: {
        ...document,
        operationsById: { [subscription.id]: subscription },
      },
      signal: new AbortController().signal,
      publishNetworkTrace: (trace) => traces.push(trace),
    });

    await expect(session.next()).resolves.toMatchObject({
      cursor: 1,
      value: { id: 'p1', name: 'Desk chair' },
    });
    await expect(session.next()).resolves.toMatchObject({
      cursor: 2,
      value: { id: 'p2', name: 'Lounge chair' },
    });
    await expect(session.next()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'graphql-stream-1:stream',
        adapter: 'core.graphql',
        correlation: expect.objectContaining({
          operationId: 'product-updates',
          invocationId: 'graphql-stream-1',
        }),
      })
    );
    expect(JSON.parse(open.mock.calls[0]![0].body)).toMatchObject({
      operationName: 'ProductUpdates',
      variables: { category: 'chairs' },
    });
    expect(traces).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);

    open.mockImplementationOnce(async (request) => ({
      trace: response(request, '', 200).trace,
      events: (async function* () {
        yield '{"data":{"productUpdated":{"id":"p3"}},"errors":[{"message":7}]}';
      })(),
      close,
    }));
    const malformed = await openDataOperationStream({
      registry,
      invocation: createDataOperationInvocation({
        ...subscriptionInvocation,
        invocationId: 'graphql-stream-malformed',
      }),
      document: {
        ...document,
        operationsById: { [subscription.id]: subscription },
      },
      signal: new AbortController().signal,
    });
    await expect(malformed.next()).rejects.toMatchObject({
      code: 'DATA_GRAPHQL_RESPONSE_INVALID',
    });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('rejects Secret authorization without an explicit per-connection renewal policy', async () => {
    const open = vi.fn<DataGraphqlStreamTransport['open']>();
    const useSecret = vi.fn();
    const adapter = createDataGraphqlStreamingAdapter({
      transport: { execute: vi.fn() },
      streamTransport: { open },
    });
    await expect(
      adapter.openStream?.({
        invocation: createDataOperationInvocation({
          ...invocation,
          invocationId: 'graphql-secret-stream',
          operation: {
            documentId: 'data-catalog',
            operationId: 'secret-watch',
          },
        }),
        source,
        operation: {
          id: 'secret-watch',
          kind: 'subscription',
          outputSchemaId: 'output',
          configurationByKey: {
            document: {
              kind: 'literal',
              value: 'subscription SecretWatch { productUpdated { id } }',
            },
            authorization: {
              kind: 'secret-ref',
              reference: { bindingId: 'api-token' },
            },
          },
          policies: {},
        },
        environment: {
          useSecret,
        } as never,
        signal: new AbortController().signal,
        publishNetworkTrace: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'DATA_GRAPHQL_CONFIGURATION_INVALID' });
    expect(useSecret).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a Secret-authenticated connection only inside the current environment lease', async () => {
    const close = vi.fn();
    const open = vi.fn<DataGraphqlStreamTransport['open']>(async (request) => ({
      trace: response(request, '', 200).trace,
      events: (async function* () {
        yield '{"data":{"productUpdated":{"id":"p1"}}}';
      })(),
      close,
    }));
    const useSecret = vi.fn(
      async (
        _reference: unknown,
        _field: string,
        consumer: (material: string) => void | Promise<void>
      ) => consumer('Bearer renewed-graphql-token')
    );
    const adapter = createDataGraphqlStreamingAdapter({
      transport: { execute: vi.fn() },
      streamTransport: { open },
    });
    const session = await adapter.openStream?.({
      invocation: createDataOperationInvocation({
        ...invocation,
        invocationId: 'graphql-secret-stream-renewed',
        operation: {
          documentId: 'data-catalog',
          operationId: 'secret-watch',
        },
      }),
      source,
      operation: {
        id: 'secret-watch',
        kind: 'subscription',
        outputSchemaId: 'output',
        configurationByKey: {
          document: {
            kind: 'literal',
            value: 'subscription SecretWatch { productUpdated { id } }',
          },
          resultPath: { kind: 'literal', value: '/productUpdated' },
          authorization: {
            kind: 'secret-ref',
            reference: { bindingId: 'api-token' },
          },
        },
        policies: {
          stream: {
            reconnect: {
              resume: 'sse-last-event-id',
              maxReconnectAttempts: 2,
              backoff: 'fixed',
              initialDelayMs: 10,
            },
            credentialRenewal: 'per-connection',
          },
        },
      },
      environment: { useSecret } as never,
      signal: new AbortController().signal,
      publishNetworkTrace: () => undefined,
    });

    expect(useSecret).toHaveBeenCalledWith(
      { bindingId: 'api-token' },
      'operation.authorization',
      expect.any(Function)
    );
    expect(open.mock.calls[0]?.[0].headers.authorization).toBe(
      'Bearer renewed-graphql-token'
    );
    await expect(
      session?.events[Symbol.asyncIterator]().next()
    ).resolves.toMatchObject({
      value: { id: 'p1' },
    });
    expect(JSON.stringify(session)).not.toContain('renewed-graphql-token');
    session?.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
