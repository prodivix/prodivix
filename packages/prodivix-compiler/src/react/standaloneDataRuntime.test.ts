import { transformWithEsbuild } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createWorkspaceStandaloneDataRuntimeModule } from './standaloneDataRuntime';
import {
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
} from './workspaceDataRuntimeTarget';

const workspace: WorkspaceSnapshot = {
  id: 'standalone-data-runtime',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['data-node'],
    },
    'data-node': {
      id: 'data-node',
      kind: 'doc',
      name: 'products.data.json',
      parentId: 'root',
      docId: 'data-products',
    },
  },
  docsById: {
    'data-products': {
      id: 'data-products',
      type: 'data-source',
      path: '/products.data.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        source: {
          id: 'products',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        schemasById: {
          product: {
            id: 'product',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
            },
          },
          products: {
            id: 'products',
            schema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'array',
            },
          },
        },
        operationsById: {
          'list-products': {
            id: 'list-products',
            kind: 'query',
            outputSchemaId: 'products',
            configurationByKey: {},
            policies: {},
          },
          'create-product': {
            id: 'create-product',
            kind: 'mutation',
            outputSchemaId: 'product',
            configurationByKey: {},
            policies: {},
          },
        },
      },
    },
  },
  routeManifest: { version: '1', root: { id: 'root-route' } },
};

const remoteServerWorkspace: WorkspaceSnapshot = {
  ...workspace,
  docsById: {
    'data-products': {
      ...workspace.docsById['data-products']!,
      content: {
        ...workspace.docsById['data-products']!.content,
        source: {
          id: 'products',
          adapterId: 'core.http',
          runtimeZone: 'server',
          bindingsById: {
            'api-url': {
              kind: 'environment-ref',
              reference: { bindingId: 'api-url' },
            },
            'api-token': {
              kind: 'secret-ref',
              reference: { bindingId: 'api-token' },
            },
          },
          configurationByKey: {
            baseUrl: {
              kind: 'environment-ref',
              reference: { bindingId: 'api-url' },
            },
            authorization: {
              kind: 'secret-ref',
              reference: { bindingId: 'api-token' },
            },
          },
        },
        operationsById: {
          ...workspace.docsById['data-products']!.content.operationsById,
          'list-products': {
            ...workspace.docsById['data-products']!.content.operationsById[
              'list-products'
            ]!,
            configurationByKey: {
              method: { kind: 'literal', value: 'GET' },
              path: { kind: 'literal', value: '/products' },
              emptyWhen: { kind: 'literal', value: 'never' },
            },
          },
          'create-product': {
            ...workspace.docsById['data-products']!.content.operationsById[
              'create-product'
            ]!,
            configurationByKey: {
              method: { kind: 'literal', value: 'POST' },
              path: { kind: 'literal', value: '/products' },
              emptyWhen: { kind: 'literal', value: 'never' },
              idempotencyHeader: {
                kind: 'literal',
                value: 'idempotency-key',
              },
            },
            policies: {
              idempotency: { kind: 'invocation-key' },
              retry: {
                maxAttempts: 2,
                backoff: 'fixed',
                initialDelayMs: 0,
              },
            },
          },
        },
      },
    },
  },
};

type Runtime = Readonly<{
  subscribeDataLifecycle(listener: () => void): () => void;
  subscribeNetworkTrace(listener: (trace: unknown) => void): () => void;
  resolveDataLifecycleSnapshot(request: unknown): Readonly<{
    status: string;
    value?: unknown;
    page?: unknown;
    sequence?: number;
  }>;
  activateDataBindings(request: unknown): Promise<void>;
  dispatchDataMutation(request: unknown): Promise<unknown>;
  dispose(): void;
}>;

describe('standalone Data runtime projection', () => {
  it('routes server query and uniquely identified mutation through the value-only parent bridge', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(
      remoteServerWorkspace,
      EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET
    );
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const listeners = new Set<
      (event: { source: unknown; data: unknown }) => void
    >();
    const posted: unknown[] = [];
    let gatewayMode: 'success' | 'malicious-error' = 'success';
    const parent = {
      postMessage(value: unknown) {
        posted.push(value);
        if (
          !value ||
          typeof value !== 'object' ||
          (value as { type?: unknown }).type !==
            'prodivix.execution-data-gateway-request.v1'
        )
          return;
        const request = value as {
          requestId: string;
          documentId: string;
          operationId: string;
          invocationId: string;
          sequence: number;
          attempt: number;
        };
        queueMicrotask(() => {
          const mutation = request.operationId === 'create-product';
          const response =
            gatewayMode === 'malicious-error'
              ? {
                  type: 'prodivix.execution-data-gateway-response.v1',
                  requestId: request.requestId,
                  ok: false,
                  error: {
                    code: 'SECRET_CANARY_FROM_GATEWAY',
                    retryable: false,
                  },
                }
              : mutation && request.attempt === 1
                ? {
                    type: 'prodivix.execution-data-gateway-response.v1',
                    requestId: request.requestId,
                    ok: false,
                    error: {
                      code: 'DATA_REMOTE_GATEWAY_UNAVAILABLE',
                      retryable: true,
                    },
                  }
                : {
                    type: 'prodivix.execution-data-gateway-response.v1',
                    requestId: request.requestId,
                    ok: true,
                    result: {
                      value: mutation ? { id: 'p2', name: 'Desk' } : [],
                      empty: false,
                      network: {
                        format: 'prodivix.execution-network-trace.v1',
                        requestId: request.requestId,
                        phase: 'runtime',
                        runtimeZone: 'server',
                        mode: 'live',
                        adapter: 'core.http',
                        method: mutation ? 'POST' : 'GET',
                        sanitizedUrl: 'https://api.example.test/',
                        protocol: 'https',
                        startedAt: 100,
                        completedAt: 120,
                        durationMs: 20,
                        outcome: 'allowed',
                        status: mutation ? 201 : 200,
                        correlation: {
                          kind: 'data-operation',
                          documentId: request.documentId,
                          operationId: request.operationId,
                          invocationId: request.invocationId,
                          sequence: request.sequence,
                          attempt: request.attempt,
                        },
                        redacted: true,
                      },
                    },
                  };
          listeners.forEach((listener) =>
            listener({ source: parent, data: response })
          );
        });
      },
    };
    const runtimeGlobal = {
      parent,
      crypto: globalThis.crypto,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: (
        _type: string,
        listener: (event: { source: unknown; data: unknown }) => void
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: { source: unknown; data: unknown }) => void
      ) => listeners.delete(listener),
    };
    const fetch = vi.fn(async () =>
      Response.json({
        format: 'prodivix.executable-data-runtime.v1',
        mode: 'live',
      })
    );
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      'globalThis',
      transformed.code
    )(record, record.exports, fetch, Ajv2020, runtimeGlobal);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const binding = {
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
    } as const;
    const lifecycleRequest = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding,
    };
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: {},
    });
    const remoteSnapshot =
      runtime.resolveDataLifecycleSnapshot(lifecycleRequest);
    expect(remoteSnapshot).toMatchObject({
      status: 'success',
      value: [],
    });
    const request = posted.find(
      (value) =>
        (value as { type?: unknown })?.type ===
        'prodivix.execution-data-gateway-request.v1'
    );
    expect(request).toMatchObject({
      documentId: 'data-products',
      operationId: 'list-products',
      input: {},
    });
    expect(JSON.stringify(request)).not.toContain('api-url');
    expect(JSON.stringify(request)).not.toContain('api-token');

    await expect(
      runtime.dispatchDataMutation({
        binding: {
          kind: 'dispatch-data-operation',
          operation: {
            documentId: 'data-products',
            operationId: 'create-product',
          },
          input: {
            kind: 'object',
            propertiesByKey: {
              name: { kind: 'trigger-payload', path: '/name' },
            },
          },
        },
        payload: { name: 'Desk' },
        runtimeValuesById: {},
      })
    ).resolves.toEqual({ id: 'p2', name: 'Desk' });
    const mutationRequests = posted.filter(
      (value) =>
        (value as { operationId?: unknown })?.operationId === 'create-product'
    ) as Array<{
      invocationId?: unknown;
      attempt?: unknown;
      input?: unknown;
    }>;
    expect(mutationRequests).toEqual([
      expect.objectContaining({ attempt: 1, input: { name: 'Desk' } }),
      expect.objectContaining({ attempt: 2, input: { name: 'Desk' } }),
    ]);
    expect(mutationRequests[0]?.invocationId).toBe(
      mutationRequests[1]?.invocationId
    );
    expect(mutationRequests[0]?.invocationId).toMatch(
      /^standalone:mutation:[0-9a-f-]{36}:\d+$/u
    );
    expect(JSON.stringify(mutationRequests)).not.toContain('api-token');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      '/.prodivix/data-runtime.json'
    );
    expect(
      posted.some(
        (value) =>
          (value as { type?: unknown })?.type ===
          'prodivix.execution-network-bridge.v1'
      )
    ).toBe(true);
    gatewayMode = 'malicious-error';
    await expect(
      runtime.dispatchDataMutation({
        binding: {
          kind: 'dispatch-data-operation',
          operation: {
            documentId: 'data-products',
            operationId: 'create-product',
          },
          input: { kind: 'literal', value: { name: 'Secret probe' } },
        },
        payload: undefined,
        runtimeValuesById: {},
      })
    ).rejects.toMatchObject({ code: 'DATA_REMOTE_GATEWAY_INVALID' });
    runtime.dispose();
  });

  it('publishes loading then success from the provider-projected fixture asset', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(workspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/.prodivix/data-runtime.json'))
        return Response.json({
          format: 'prodivix.executable-data-runtime.v1',
          mode: 'mock',
        });
      return Response.json({
        fixtureSetId: 'standalone-test',
        emulatedAdapterIds: ['core.http'],
        fixtures: [
          {
            id: 'products',
            documentId: 'data-products',
            operationId: 'list-products',
            operationKind: 'query',
            behavior: {
              kind: 'result',
              value: [{ id: 'p1' }],
              empty: false,
            },
          },
        ],
      });
    });
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding: {
        operation: {
          documentId: 'data-products',
          operationId: 'list-products',
        },
      },
    };
    expect(runtime.resolveDataLifecycleSnapshot(request).status).toBe('idle');
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: request.binding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'success',
      value: [{ id: 'p1' }],
    });
    expect(fetch).toHaveBeenCalledWith(
      '/.prodivix/data-runtime.json',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })
    );
    expect(fetch).toHaveBeenCalledWith(
      '/.prodivix/data-mock-provision.json',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' })
    );
    const routeBinding = {
      ...request.binding,
      activations: [{ kind: 'route', routeId: 'catalog-route' }],
    } as const;
    const routeRequest = {
      ...request,
      dataId: 'route-products',
      binding: routeBinding,
    };
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      currentRouteId: 'other-route',
      bindingsByDataId: { 'route-products': routeBinding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(routeRequest).status).toBe(
      'idle'
    );
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      currentRouteId: 'catalog-route',
      bindingsByDataId: { 'route-products': routeBinding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(routeRequest).status).toBe(
      'success'
    );
    runtime.dispose();
  });

  it('maps input-change values, suppresses unchanged dispatch, and revalidates CRUD after mutation', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(workspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/.prodivix/data-runtime.json'))
        return Response.json({
          format: 'prodivix.executable-data-runtime.v1',
          mode: 'mock',
        });
      return Response.json({
        fixtureSetId: 'standalone-crud',
        emulatedAdapterIds: ['core.http'],
        collections: [
          {
            id: 'products',
            entityIdKey: 'id',
            initialEntities: [{ id: 'p1', name: 'Alpha' }],
          },
        ],
        fixtures: [
          {
            id: 'list-products',
            documentId: 'data-products',
            operationId: 'list-products',
            operationKind: 'query',
            behavior: {
              kind: 'crud',
              collectionId: 'products',
              action: 'list',
            },
          },
          {
            id: 'create-product',
            documentId: 'data-products',
            operationId: 'create-product',
            operationKind: 'mutation',
            behavior: {
              kind: 'crud',
              collectionId: 'products',
              action: 'create',
              valueInputKey: 'product',
            },
          },
        ],
      });
    });
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const binding = {
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
      input: {
        kind: 'object',
        propertiesByKey: {
          filter: { kind: 'runtime-value', valueId: 'filter-symbol' },
        },
      },
      activations: [{ kind: 'input-change', dependencyId: 'filter-symbol' }],
    } as const;
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding,
    };

    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: { 'filter-symbol': 'active' },
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'success',
      sequence: 1,
      value: [{ id: 'p1', name: 'Alpha' }],
    });

    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: { 'filter-symbol': 'active' },
    });
    expect(runtime.resolveDataLifecycleSnapshot(request).sequence).toBe(1);

    await runtime.dispatchDataMutation({
      binding: {
        kind: 'dispatch-data-operation',
        operation: {
          documentId: 'data-products',
          operationId: 'create-product',
        },
        input: {
          kind: 'object',
          propertiesByKey: {
            product: { kind: 'trigger-payload', path: '/product' },
          },
        },
      },
      payload: { product: { id: 'p2', name: 'Beta' } },
      runtimeValuesById: {},
      source: {
        documentId: 'page',
        nodeId: 'create',
        eventName: 'onClick',
        instancePath: '/page/create',
      },
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'success',
      sequence: 3,
      value: [
        { id: 'p1', name: 'Alpha' },
        { id: 'p2', name: 'Beta' },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it('executes public live HTTP with schema, retry, pagination, cache, and sanitized correlation', async () => {
    const liveWorkspace: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        'data-products': {
          ...workspace.docsById['data-products']!,
          content: {
            source: {
              id: 'products',
              adapterId: 'core.http',
              runtimeZone: 'client',
              bindingsById: {},
              configurationByKey: {
                baseUrl: {
                  kind: 'literal',
                  value: 'https://api.example.test/v1/',
                },
              },
            },
            schemasById: {
              input: {
                id: 'input',
                schema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    offset: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                  required: ['offset', 'limit'],
                  additionalProperties: false,
                },
              },
              products: {
                id: 'products',
                schema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    items: { type: 'array' },
                    meta: {
                      type: 'object',
                      properties: { total: { type: 'integer' } },
                      required: ['total'],
                    },
                  },
                  required: ['items', 'meta'],
                },
              },
            },
            operationsById: {
              'list-products': {
                id: 'list-products',
                kind: 'query',
                inputSchemaId: 'input',
                outputSchemaId: 'products',
                configurationByKey: {
                  method: { kind: 'literal', value: 'GET' },
                  path: { kind: 'literal', value: '/products' },
                  emptyWhen: { kind: 'literal', value: 'never' },
                },
                policies: {
                  retry: {
                    maxAttempts: 2,
                    backoff: 'fixed',
                    initialDelayMs: 0,
                  },
                  pagination: {
                    kind: 'offset',
                    offsetInput: 'offset',
                    limitInput: 'limit',
                    defaultLimit: 10,
                    totalPath: '/meta/total',
                  },
                  cache: { strategy: 'cache-first', ttlMs: 60_000 },
                },
              },
            },
          },
        },
      },
    };
    const generated = createWorkspaceStandaloneDataRuntimeModule(liveWorkspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    let apiAttempt = 0;
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/.prodivix/data-runtime.json'))
        return Response.json({
          format: 'prodivix.executable-data-runtime.v1',
          mode: 'live',
        });
      apiAttempt += 1;
      return new Response(
        apiAttempt === 1
          ? '{}'
          : JSON.stringify({ items: [{ id: 'p1' }], meta: { total: 21 } }),
        {
          status: apiAttempt === 1 ? 503 : 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const traces: Array<Record<string, unknown>> = [];
    runtime.subscribeNetworkTrace((trace) =>
      traces.push(trace as Record<string, unknown>)
    );
    const binding = {
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
      input: { kind: 'literal', value: {} },
    } as const;
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding,
    };
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'success',
      value: { items: [{ id: 'p1' }], meta: { total: 21 } },
      page: {
        kind: 'offset',
        offset: 0,
        limit: 10,
        total: 21,
        hasMore: true,
      },
    });
    expect(traces).toEqual([
      expect.objectContaining({
        sanitizedUrl: 'https://api.example.test/',
        status: 503,
        redacted: true,
        correlation: expect.objectContaining({ attempt: 1 }),
      }),
      expect.objectContaining({
        sanitizedUrl: 'https://api.example.test/',
        status: 200,
        redacted: true,
        correlation: expect.objectContaining({ attempt: 2 }),
      }),
    ]);
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page-cache',
      bindingsByDataId: { products: binding },
      runtimeValuesById: {},
    });
    expect(apiAttempt).toBe(2);
    expect(JSON.stringify(traces)).not.toContain('/products');
    runtime.dispose();
  });

  it('retries public live mutation with one opaque upstream idempotency key', async () => {
    const liveWorkspace: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        'data-products': {
          ...workspace.docsById['data-products']!,
          content: {
            ...workspace.docsById['data-products']!.content,
            source: {
              id: 'products',
              adapterId: 'core.http',
              runtimeZone: 'client',
              bindingsById: {},
              configurationByKey: {
                baseUrl: {
                  kind: 'literal',
                  value: 'https://api.example.test/v1/',
                },
              },
            },
            operationsById: {
              ...workspace.docsById['data-products']!.content.operationsById,
              'create-product': {
                ...workspace.docsById['data-products']!.content.operationsById[
                  'create-product'
                ]!,
                configurationByKey: {
                  method: { kind: 'literal', value: 'POST' },
                  path: { kind: 'literal', value: '/products' },
                  emptyWhen: { kind: 'literal', value: 'never' },
                  idempotencyHeader: {
                    kind: 'literal',
                    value: 'idempotency-key',
                  },
                },
                policies: {
                  idempotency: { kind: 'invocation-key' },
                  retry: {
                    maxAttempts: 2,
                    backoff: 'fixed',
                    initialDelayMs: 0,
                  },
                },
              },
            },
          },
        },
      },
    };
    const generated = createWorkspaceStandaloneDataRuntimeModule(liveWorkspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const upstreamKeys: string[] = [];
    let apiAttempt = 0;
    const fetch = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<Response> => {
        if (String(input).endsWith('/.prodivix/data-runtime.json'))
          return Response.json({
            format: 'prodivix.executable-data-runtime.v1',
            mode: 'live',
          });
        apiAttempt += 1;
        upstreamKeys.push(
          new Headers(init?.headers).get('idempotency-key') ?? ''
        );
        return new Response(
          apiAttempt === 1 ? '{}' : JSON.stringify({ id: 'created' }),
          {
            status: apiAttempt === 1 ? 503 : 201,
            headers: { 'content-type': 'application/json' },
          }
        );
      }
    );
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const traces: Array<Record<string, unknown>> = [];
    runtime.subscribeNetworkTrace((trace) =>
      traces.push(trace as Record<string, unknown>)
    );

    await expect(
      runtime.dispatchDataMutation({
        binding: {
          kind: 'dispatch-data-operation',
          operation: {
            documentId: 'data-products',
            operationId: 'create-product',
          },
          input: {
            kind: 'object',
            propertiesByKey: {
              name: { kind: 'literal', value: 'Desk' },
            },
          },
        },
        payload: {},
        runtimeValuesById: {},
        source: {
          documentId: 'page',
          nodeId: 'create',
          eventName: 'onClick',
          instancePath: '/page/create',
        },
      })
    ).resolves.toEqual({ id: 'created' });

    expect(upstreamKeys).toHaveLength(2);
    expect(upstreamKeys[0]).toBe(upstreamKeys[1]);
    expect(upstreamKeys[0]).toMatch(/^prodivix-data-sha256-[0-9a-f]{64}$/u);
    expect(upstreamKeys[0]).not.toContain('Desk');
    expect(traces).toEqual([
      expect.objectContaining({
        status: 503,
        correlation: expect.objectContaining({ attempt: 1 }),
      }),
      expect.objectContaining({
        status: 201,
        correlation: expect.objectContaining({ attempt: 2 }),
      }),
    ]);
    runtime.dispose();
  });

  it('never falls back to live HTTP when explicit mock provisioning is missing', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(workspace);
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/.prodivix/data-runtime.json'))
        return Response.json({
          format: 'prodivix.executable-data-runtime.v1',
          mode: 'mock',
        });
      return new Response('', { status: 404 });
    });
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const binding = {
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
    } as const;
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding,
    };
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'error',
      error: { code: 'DATA_MOCK_PROVISION_UNAVAILABLE' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.some(([input]) => String(input).startsWith('http'))
    ).toBe(false);
    runtime.dispose();
  });

  it('rejects a live manifest for the provider-forced mock target', async () => {
    const generated = createWorkspaceStandaloneDataRuntimeModule(
      workspace,
      PROVIDER_MOCK_DATA_RUNTIME_TARGET
    );
    const transformed = await transformWithEsbuild(
      generated.body,
      'prodivix-data-runtime.ts',
      { loader: 'ts', target: 'es2022', format: 'cjs' }
    );
    const fetch = vi.fn(async () =>
      Response.json({
        format: 'prodivix.executable-data-runtime.v1',
        mode: 'live',
      })
    );
    const record: { exports: Record<string, unknown> } = { exports: {} };
    Function(
      'module',
      'exports',
      'fetch',
      'Ajv2020',
      transformed.code
    )(record, record.exports, fetch, Ajv2020);
    const runtime = (
      record.exports.createWorkspaceDataRuntime as () => Runtime
    )();
    const binding = {
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
    } as const;
    const request = {
      documentId: 'page',
      instancePath: '/page',
      dataId: 'products',
      binding,
    };
    await runtime.activateDataBindings({
      documentId: 'page',
      instancePath: '/page',
      bindingsByDataId: { products: binding },
      runtimeValuesById: {},
    });
    expect(runtime.resolveDataLifecycleSnapshot(request)).toMatchObject({
      status: 'error',
      error: { code: 'DATA_RUNTIME_TARGET_MODE_INVALID' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
});
