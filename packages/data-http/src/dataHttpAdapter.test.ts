import {
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  executeDataOperation,
  type DataOperation,
  type DataSourceDefinition,
} from '@prodivix/data';
import { createExecutionNetworkTrace } from '@prodivix/runtime-core';
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
      source,
      operation,
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
      source,
      operation,
      signal: new AbortController().signal,
      now: () => 2,
    });
    expect(result.result).toEqual({ value: [], empty: false });
  });
});
