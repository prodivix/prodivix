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
  createDataAsyncApiAdapter,
  createDataAsyncApiStreamingAdapter,
  type DataAsyncApiStreamTransport,
  type DataAsyncApiTransportRequest,
} from './dataAsyncApiAdapter';

const source = {
  id: 'events',
  adapterId: 'core.asyncapi',
  runtimeZone: 'client' as const,
  bindingsById: {},
  configurationByKey: {
    endpoint: {
      kind: 'literal' as const,
      value: 'https://events.example.test/v1/',
    },
  },
};
const publish: DataOperation = {
  id: 'publish-product',
  kind: 'mutation',
  inputSchemaId: 'input',
  outputSchemaId: 'receipt',
  configurationByKey: {
    action: { kind: 'literal', value: 'publish' },
    path: { kind: 'literal', value: '/events/product-created' },
    idempotencyHeader: { kind: 'literal', value: 'idempotency-key' },
  },
  policies: { idempotency: { kind: 'invocation-key' } },
};
const requestReply: DataOperation = {
  id: 'lookup-product',
  kind: 'query',
  inputSchemaId: 'input',
  outputSchemaId: 'output',
  configurationByKey: {
    action: { kind: 'literal', value: 'request-reply' },
    path: { kind: 'literal', value: '/commands/product' },
    responseBodyPath: { kind: 'literal', value: '/payload' },
  },
  policies: {},
};
const document = (operation: DataOperation): DataSourceDocument => ({
  source,
  schemasById: {
    input: { id: 'input', schema: true },
    output: { id: 'output', schema: true },
    receipt: { id: 'receipt', schema: true },
  },
  operationsById: { [operation.id]: operation },
});
const invocation = (operationId: string, attempt = 1) =>
  createDataOperationInvocation({
    invocationId: 'asyncapi-1',
    sequence: 2,
    attempt,
    startedAt: 100,
    operation: { documentId: 'data-events', operationId },
    documentRevision: 'revision-1',
    runtimeZone: 'client',
    mode: 'live',
    activation: 'event',
    input: { id: 'p1' },
  });
const response = (
  request: DataAsyncApiTransportRequest,
  text = '',
  status = 202
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
    sanitizedUrl: 'https://events.example.test/',
    protocol: 'https',
    startedAt: 100,
    completedAt: 120,
    outcome: 'allowed',
    status,
    correlation: request.correlation,
  }),
});

describe('Data AsyncAPI finite adapter', () => {
  it('publishes one finite message with attempt-invariant idempotency and correlation', async () => {
    const keys: string[] = [];
    const execute = vi.fn(async (request: DataAsyncApiTransportRequest) => {
      keys.push(request.headers['idempotency-key'] ?? '');
      return response(request);
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataAsyncApiAdapter({ transport: { execute } }));
    const results = [];
    for (const attempt of [1, 2])
      results.push(
        await executeDataOperation({
          registry,
          invocation: invocation(publish.id, attempt),
          document: document(publish),
          lifecycleChannel: createDataLifecycleChannel(),
          signal: new AbortController().signal,
        })
      );
    expect(results[0]?.result).toEqual({ value: true, empty: false });
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(results[0]?.networkTraces[0]?.correlation).toMatchObject({
      kind: 'data-operation',
      operationId: 'publish-product',
      invocationId: 'asyncapi-1',
    });
  });

  it('maps one finite request-reply response into the canonical result', async () => {
    const execute = vi.fn(async (request: DataAsyncApiTransportRequest) =>
      response(request, '{"payload":{"id":"p1","name":"Desk"}}', 200)
    );
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataAsyncApiAdapter({ transport: { execute } }));
    const result = await executeDataOperation({
      registry,
      invocation: invocation(requestReply.id),
      document: document(requestReply),
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
    });
    expect(result.result).toEqual({
      value: { id: 'p1', name: 'Desk' },
      empty: false,
    });
    expect(JSON.parse(execute.mock.calls[0]![0].body)).toEqual({ id: 'p1' });
  });

  it('keeps receive, subscription, and stream actions fail closed', async () => {
    const adapter = createDataAsyncApiAdapter({
      transport: { execute: vi.fn() },
    });
    await expect(
      adapter.invoke({
        invocation: invocation(requestReply.id),
        source,
        operation: {
          ...requestReply,
          configurationByKey: {
            ...requestReply.configurationByKey,
            action: { kind: 'literal', value: 'receive' },
          },
        },
        signal: new AbortController().signal,
        publishNetworkTrace: () => undefined,
      })
    ).rejects.toMatchObject({ code: 'DATA_ASYNCAPI_ACTION_UNSUPPORTED' });
  });
});

describe('Data AsyncAPI subscription adapter', () => {
  it('opens an NDJSON/SSE-neutral receive stream and maps each message body', async () => {
    const subscription: DataOperation = {
      id: 'watch-products',
      kind: 'subscription',
      inputSchemaId: 'input',
      outputSchemaId: 'output',
      configurationByKey: {
        action: { kind: 'literal', value: 'receive' },
        path: { kind: 'literal', value: '/events/products' },
        responseBodyPath: { kind: 'literal', value: '/payload' },
      },
      policies: {},
    };
    const close = vi.fn();
    const open = vi.fn<DataAsyncApiStreamTransport['open']>(
      async (request) => ({
        trace: createExecutionNetworkTrace({
          requestId: request.requestId,
          phase: 'runtime',
          runtimeZone: request.runtimeZone,
          mode: request.mode,
          adapter: request.adapter,
          method: request.method,
          sanitizedUrl: 'https://events.example.test/',
          protocol: 'https',
          startedAt: 100,
          completedAt: 101,
          outcome: 'allowed',
          correlation: request.correlation,
        }),
        events: (async function* () {
          yield '{"payload":{"id":"p1"}}';
          yield '{"payload":{"id":"p2"}}';
        })(),
        close,
      })
    );
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataAsyncApiStreamingAdapter({
        transport: { execute: vi.fn() },
        streamTransport: { open },
      })
    );
    const session = await openDataOperationStream({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation(subscription.id),
        invocationId: 'asyncapi-stream-1',
        activation: 'document',
      }),
      document: document(subscription),
      signal: new AbortController().signal,
    });

    await expect(session.next()).resolves.toMatchObject({
      cursor: 1,
      value: { id: 'p1' },
    });
    await expect(session.next()).resolves.toMatchObject({
      cursor: 2,
      value: { id: 'p2' },
    });
    await expect(session.next()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        adapter: 'core.asyncapi',
        correlation: expect.objectContaining({
          operationId: 'watch-products',
          invocationId: 'asyncapi-stream-1',
        }),
      })
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects Secret authorization without an explicit per-connection renewal policy', async () => {
    const open = vi.fn<DataAsyncApiStreamTransport['open']>();
    const useSecret = vi.fn();
    const adapter = createDataAsyncApiStreamingAdapter({
      transport: { execute: vi.fn() },
      streamTransport: { open },
    });
    await expect(
      adapter.openStream?.({
        invocation: createDataOperationInvocation({
          ...invocation('secret-watch'),
          invocationId: 'asyncapi-secret-stream',
          activation: 'document',
        }),
        source,
        operation: {
          id: 'secret-watch',
          kind: 'subscription',
          outputSchemaId: 'output',
          configurationByKey: {
            action: { kind: 'literal', value: 'receive' },
            path: { kind: 'literal', value: '/events/products' },
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
    ).rejects.toMatchObject({ code: 'DATA_ASYNCAPI_CONFIGURATION_INVALID' });
    expect(useSecret).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a Secret-authenticated connection only inside the current environment lease', async () => {
    const close = vi.fn();
    const open = vi.fn<DataAsyncApiStreamTransport['open']>(
      async (request) => ({
        trace: createExecutionNetworkTrace({
          requestId: request.requestId,
          phase: 'runtime',
          runtimeZone: request.runtimeZone,
          mode: request.mode,
          adapter: request.adapter,
          method: request.method,
          sanitizedUrl: 'https://events.example.test/',
          protocol: 'https',
          startedAt: 100,
          completedAt: 101,
          outcome: 'allowed',
          correlation: request.correlation,
        }),
        events: (async function* () {
          yield '{"payload":{"id":"p1"}}';
        })(),
        close,
      })
    );
    const useSecret = vi.fn(
      async (
        _reference: unknown,
        _field: string,
        consumer: (material: string) => void | Promise<void>
      ) => consumer('Bearer renewed-asyncapi-token')
    );
    const adapter = createDataAsyncApiStreamingAdapter({
      transport: { execute: vi.fn() },
      streamTransport: { open },
    });
    const session = await adapter.openStream?.({
      invocation: createDataOperationInvocation({
        ...invocation('secret-watch'),
        invocationId: 'asyncapi-secret-stream-renewed',
        activation: 'document',
      }),
      source,
      operation: {
        id: 'secret-watch',
        kind: 'subscription',
        outputSchemaId: 'output',
        configurationByKey: {
          action: { kind: 'literal', value: 'receive' },
          path: { kind: 'literal', value: '/events/products' },
          responseBodyPath: { kind: 'literal', value: '/payload' },
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
      'Bearer renewed-asyncapi-token'
    );
    await expect(
      session?.events[Symbol.asyncIterator]().next()
    ).resolves.toMatchObject({
      value: { id: 'p1' },
    });
    expect(JSON.stringify(session)).not.toContain('renewed-asyncapi-token');
    session?.close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
