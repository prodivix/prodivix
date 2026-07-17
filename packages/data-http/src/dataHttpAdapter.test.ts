import {
  createDataLifecycleChannel,
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  executeDataOperation,
  type DataOperation,
  type DataSourceDocument,
  type DataSourceDefinition,
} from '@prodivix/data';
import {
  createExecutionEnvironmentResolutionService,
  createExecutionNetworkTrace,
} from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import { createDataHttpAdapter } from './dataHttpAdapter';

const source: DataSourceDefinition = {
  id: 'products',
  adapterId: 'core.http',
  runtimeZone: 'client',
  bindingsById: {},
  configurationByKey: {
    baseUrl: { kind: 'literal', value: 'https://api.example.test/v1/' },
  },
};
const operation: DataOperation = {
  id: 'list',
  kind: 'query',
  outputSchemaId: 'products',
  configurationByKey: {
    method: { kind: 'literal', value: 'GET' },
    path: { kind: 'literal', value: '/products' },
    emptyWhen: { kind: 'literal', value: 'never' },
  },
  policies: {},
};
const document: DataSourceDocument = {
  source,
  schemasById: {
    products: { id: 'products', schema: true },
  },
  operationsById: { list: operation },
};
const invocation = createDataOperationInvocation({
  invocationId: 'invocation-1',
  sequence: 3,
  attempt: 1,
  startedAt: 100,
  operation: { documentId: 'data-products', operationId: 'list' },
  documentRevision: '9',
  runtimeZone: 'client',
  mode: 'live',
  activation: 'route',
  input: { page: 1 },
});

describe('Data HTTP adapter', () => {
  it('resolves public HTTP configuration from the exact authorized environment before transport', async () => {
    const execute = vi.fn(async (request) => ({
      status: 200,
      ok: true,
      text: '{"items":[]}',
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
        completedAt: 125,
        outcome: 'allowed',
        status: 200,
        correlation: request.correlation,
      }),
    }));
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataHttpAdapter({ transport: { execute } }));
    const environmentService = createExecutionEnvironmentResolutionService({
      snapshots: {
        load: () => ({
          environmentId: 'environment-main',
          revision: 'revision-1',
          mode: 'live',
          publicBindingsById: {
            endpoint: 'https://api.example.test/v1/',
          },
          secretBindingIds: [],
        }),
      },
      permissions: {
        authorize: () => ({
          allowed: true,
          grantId: 'grant-1',
          permissionRevision: 'permission-1',
          expiresAt: 1_000,
        }),
      },
      secrets: { read: () => undefined },
      now: () => 100,
    });

    await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        invocationId: 'environment-http',
        environment: {
          environmentId: 'environment-main',
          revision: 'revision-1',
          mode: 'live',
        },
      }),
      document: {
        ...document,
        source: {
          ...source,
          bindingsById: {
            endpoint: {
              kind: 'environment-ref',
              reference: { bindingId: 'endpoint' },
            },
          },
          configurationByKey: {
            baseUrl: {
              kind: 'environment-ref',
              reference: { bindingId: 'endpoint' },
            },
          },
        },
      },
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      environmentResolution: {
        service: environmentService,
        workspaceId: 'workspace-1',
        principal: {
          principalId: 'principal-1',
          sessionId: 'session-1',
        },
        providerId: 'browser-preview',
        providerIsolation: 'same-context',
        executionClass: 'browser',
        profile: 'preview',
      },
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/products?page=1',
      })
    );
  });

  it('injects an authorized server Secret only at transport and keeps result, trace, and audit canary-free', async () => {
    const canary = 'secret-canary-7f0c';
    const audits: object[] = [];
    let injectedAuthorization: string | undefined;
    const execute = vi.fn(async (request) => {
      injectedAuthorization = request.headers?.authorization;
      return {
        status: 200,
        ok: true,
        text: '{"items":[]}',
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
          completedAt: 125,
          outcome: 'allowed',
          status: 200,
          correlation: request.correlation,
        }),
      };
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataHttpAdapter({ transport: { execute } }));
    const environmentService = createExecutionEnvironmentResolutionService({
      snapshots: {
        load: () => ({
          environmentId: 'environment-server',
          revision: 'revision-1',
          mode: 'live',
          publicBindingsById: {},
          secretBindingIds: ['authorization'],
        }),
      },
      permissions: {
        authorize: () => ({
          allowed: true,
          grantId: 'grant-server',
          permissionRevision: 'permission-1',
          expiresAt: 1_000,
        }),
      },
      secrets: { read: () => canary },
      now: () => 100,
      publishAudit: (event) => audits.push(event),
    });
    const result = await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        invocationId: 'server-secret',
        runtimeZone: 'server',
        environment: {
          environmentId: 'environment-server',
          revision: 'revision-1',
          mode: 'live',
        },
      }),
      document: {
        ...document,
        source: {
          ...source,
          runtimeZone: 'server',
          bindingsById: {
            authorization: {
              kind: 'secret-ref',
              reference: { bindingId: 'authorization' },
            },
          },
          configurationByKey: {
            ...source.configurationByKey,
            authorization: {
              kind: 'secret-ref',
              reference: { bindingId: 'authorization' },
            },
          },
        },
      },
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      environmentResolution: {
        service: environmentService,
        workspaceId: 'workspace-1',
        principal: {
          principalId: 'principal-1',
          sessionId: 'session-1',
        },
        providerId: 'remote-runner',
        providerIsolation: 'remote-isolated',
        executionClass: 'isolated-runner',
        profile: 'production',
      },
    });

    expect(injectedAuthorization).toBe(canary);
    expect(JSON.stringify({ result, audits })).not.toContain(canary);
    expect(audits.map((entry) => (entry as { kind: string }).kind)).toEqual([
      'lease-issued',
      'secret-binding-used',
      'lease-revoked',
    ]);
  });

  it('runs through the Data registry and preserves operation correlation', async () => {
    const execute = vi.fn(async (request) => ({
      status: 200,
      ok: true,
      text: '{"items":[]}',
      trace: createExecutionNetworkTrace({
        requestId: request.requestId,
        phase: 'runtime',
        runtimeZone: 'client',
        mode: 'live',
        adapter: 'core.http',
        method: request.method,
        sanitizedUrl: 'https://api.example.test/',
        protocol: 'https',
        startedAt: 100,
        completedAt: 125,
        outcome: 'allowed',
        status: 200,
        correlation: request.correlation,
      }),
    }));
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataHttpAdapter({ transport: { execute } }));
    const result = await executeDataOperation({
      registry,
      invocation,
      document,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      now: () => 125,
    });

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/products?page=1',
        correlation: expect.objectContaining({
          documentId: 'data-products',
          operationId: 'list',
          invocationId: 'invocation-1',
          sequence: 3,
          attempt: 1,
        }),
      })
    );
    expect(result.result).toEqual({ value: { items: [] }, empty: false });
    expect(Object.isFrozen(result.result.value)).toBe(true);
    expect(result.lifecycle).toMatchObject({
      status: 'success',
      invocationId: 'invocation-1',
      completedAt: 125,
    });
    expect(result.networkTraces).toEqual([
      expect.objectContaining({
        sanitizedUrl: 'https://api.example.test/',
        correlation: expect.objectContaining({ operationId: 'list' }),
      }),
    ]);
  });

  it('does not guess empty from an empty array', async () => {
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataHttpAdapter({
        transport: {
          async execute(request) {
            return {
              status: 200,
              ok: true,
              text: '[]',
              trace: createExecutionNetworkTrace({
                requestId: request.requestId,
                phase: 'runtime',
                runtimeZone: 'client',
                mode: 'live',
                adapter: 'core.http',
                method: 'GET',
                sanitizedUrl: 'https://api.example.test/',
                protocol: 'https',
                startedAt: 1,
                completedAt: 2,
                outcome: 'allowed',
                status: 200,
                correlation: request.correlation,
              }),
            };
          },
        },
      })
    );
    const result = await executeDataOperation({
      registry,
      invocation,
      document,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      now: () => 2,
    });
    expect(result.result).toEqual({ value: [], empty: false });
  });

  it('retries retryable HTTP failures with a new attempt correlation', async () => {
    const requests: Array<{ requestId: string; attempt?: number }> = [];
    const delays: number[] = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataHttpAdapter({
        transport: {
          async execute(request) {
            const attempt =
              request.correlation?.kind === 'data-operation'
                ? request.correlation.attempt
                : undefined;
            requests.push({ requestId: request.requestId, attempt });
            const status = attempt === 1 ? 503 : 200;
            return {
              status,
              ok: status === 200,
              text: status === 200 ? '{"items":[]}' : '',
              trace: createExecutionNetworkTrace({
                requestId: request.requestId,
                phase: 'runtime',
                runtimeZone: 'client',
                mode: 'live',
                adapter: 'core.http',
                method: 'GET',
                sanitizedUrl: 'https://api.example.test/',
                protocol: 'https',
                startedAt: 1,
                completedAt: 2,
                outcome: 'allowed',
                status,
                correlation: request.correlation,
              }),
            };
          },
        },
      })
    );
    const retryDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...operation,
          policies: {
            retry: {
              maxAttempts: 2,
              backoff: 'fixed',
              initialDelayMs: 25,
            },
          },
        },
      },
    };

    const result = await executeDataOperation({
      registry,
      invocation,
      document: retryDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      scheduler: {
        async wait(delayMs) {
          delays.push(delayMs);
        },
      },
      now: () => 3,
    });

    expect(requests).toEqual([
      { requestId: 'invocation-1:1', attempt: 1 },
      { requestId: 'invocation-1:2', attempt: 2 },
    ]);
    expect(delays).toEqual([25]);
    expect(result.lifecycle).toMatchObject({ status: 'success', attempt: 2 });
    expect(result.networkTraces).toHaveLength(2);
  });

  it('reuses one opaque adapter-projected idempotency header across mutation attempts', async () => {
    const requests: Array<Readonly<{ attempt: number; key?: string }>> = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataHttpAdapter({
        transport: {
          async execute(request) {
            const attempt = request.correlation?.attempt ?? 0;
            requests.push({
              attempt,
              key: request.headers?.['idempotency-key'],
            });
            const status = attempt === 1 ? 503 : 201;
            return {
              status,
              ok: status === 201,
              text: status === 201 ? '{"id":"created"}' : '',
              trace: createExecutionNetworkTrace({
                requestId: request.requestId,
                phase: 'runtime',
                runtimeZone: 'client',
                mode: 'live',
                adapter: 'core.http',
                method: 'POST',
                sanitizedUrl: 'https://api.example.test/',
                protocol: 'https',
                startedAt: attempt,
                completedAt: attempt + 1,
                outcome: 'allowed',
                status,
                correlation: request.correlation,
              }),
            };
          },
        },
      })
    );
    const mutationDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...operation,
          kind: 'mutation',
          configurationByKey: {
            ...operation.configurationByKey,
            method: { kind: 'literal', value: 'POST' },
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
    };

    await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        activation: 'event',
        input: { name: 'Desk' },
      }),
      document: mutationDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      scheduler: { wait: async () => undefined },
    });

    expect(requests.map(({ attempt }) => attempt)).toEqual([1, 2]);
    expect(requests[0]?.key).toBe(requests[1]?.key);
    expect(requests[0]?.key).toMatch(/^prodivix-data-sha256-[0-9a-f]{64}$/u);
    expect(requests[0]?.key).not.toContain('Desk');
  });

  it('fails closed before transport for missing or unsafe idempotency header mappings', async () => {
    const execute = vi.fn();
    const registry = createDataOperationAdapterRegistry();
    registry.register(createDataHttpAdapter({ transport: { execute } }));
    for (const value of [undefined, 'authorization', 'X-Idempotency-Key']) {
      const mutationDocument: DataSourceDocument = {
        ...document,
        operationsById: {
          list: {
            ...operation,
            kind: 'mutation',
            configurationByKey: {
              ...operation.configurationByKey,
              method: { kind: 'literal', value: 'POST' },
              ...(value === undefined
                ? {}
                : {
                    idempotencyHeader: {
                      kind: 'literal' as const,
                      value,
                    },
                  }),
            },
            policies: { idempotency: { kind: 'invocation-key' } },
          },
        },
      };
      await expect(
        executeDataOperation({
          registry,
          invocation: createDataOperationInvocation({
            ...invocation,
            activation: 'event',
          }),
          document: mutationDocument,
          lifecycleChannel: createDataLifecycleChannel(),
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({ code: 'DATA_HTTP_CONFIGURATION_INVALID' });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it('projects exact offset and cursor pagination facts from declared response paths', async () => {
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataHttpAdapter({
        transport: {
          async execute(request) {
            const cursor = request.url.includes('cursor=next-1');
            return {
              status: 200,
              ok: true,
              text: cursor
                ? '{"items":[],"page":{"next":null,"previous":"prev-1"}}'
                : '{"items":[],"meta":{"total":23}}',
              trace: createExecutionNetworkTrace({
                requestId: request.requestId,
                phase: 'runtime',
                runtimeZone: 'client',
                mode: 'live',
                adapter: 'core.http',
                method: 'GET',
                sanitizedUrl: 'https://api.example.test/',
                protocol: 'https',
                startedAt: 1,
                completedAt: 2,
                outcome: 'allowed',
                status: 200,
                correlation: request.correlation,
              }),
            };
          },
        },
      })
    );
    const offsetResult = await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        input: { offset: 10, limit: 10 },
      }),
      document: {
        ...document,
        operationsById: {
          list: {
            ...operation,
            policies: {
              pagination: {
                kind: 'offset',
                offsetInput: 'offset',
                limitInput: 'limit',
                defaultLimit: 10,
                totalPath: '/meta/total',
              },
            },
          },
        },
      },
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      now: () => 2,
    });
    expect(offsetResult.result.page).toEqual({
      kind: 'offset',
      offset: 10,
      limit: 10,
      total: 23,
      hasMore: true,
    });

    const cursorResult = await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...invocation,
        input: { cursor: 'next-1', limit: 20 },
      }),
      document: {
        ...document,
        operationsById: {
          list: {
            ...operation,
            policies: {
              pagination: {
                kind: 'cursor',
                cursorInput: 'cursor',
                limitInput: 'limit',
                defaultLimit: 20,
                nextCursorPath: '/page/next',
                previousCursorPath: '/page/previous',
              },
            },
          },
        },
      },
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      now: () => 2,
    });
    expect(cursorResult.result.page).toEqual({
      kind: 'cursor',
      previousCursor: 'prev-1',
      hasMore: false,
    });
  });

  it('fails closed when HTTP offset pagination has no explicit total mapping', async () => {
    const registry = createDataOperationAdapterRegistry();
    registry.register(
      createDataHttpAdapter({
        transport: {
          async execute(request) {
            return {
              status: 200,
              ok: true,
              text: '[]',
              trace: createExecutionNetworkTrace({
                requestId: request.requestId,
                phase: 'runtime',
                runtimeZone: 'client',
                mode: 'live',
                adapter: 'core.http',
                method: 'GET',
                sanitizedUrl: 'https://api.example.test/',
                protocol: 'https',
                startedAt: 1,
                completedAt: 2,
                outcome: 'allowed',
                status: 200,
                correlation: request.correlation,
              }),
            };
          },
        },
      })
    );
    await expect(
      executeDataOperation({
        registry,
        invocation: createDataOperationInvocation({
          ...invocation,
          input: { offset: 0, limit: 10 },
        }),
        document: {
          ...document,
          operationsById: {
            list: {
              ...operation,
              policies: {
                pagination: {
                  kind: 'offset',
                  offsetInput: 'offset',
                  limitInput: 'limit',
                  defaultLimit: 10,
                },
              },
            },
          },
        },
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_HTTP_CONFIGURATION_INVALID' });
  });
});
