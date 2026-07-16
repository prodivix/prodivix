import { createDataOperationInvocation } from '@prodivix/data';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserDataExecutionEnvironment,
  createBrowserTestDataExecutionEnvironment,
} from './browserDataExecutionEnvironment';

describe('Browser Data execution composition', () => {
  it('carries one correlation identity through Data, HTTP, browser fetch, and Network trace', async () => {
    const fetch = vi.fn(
      async () => new Response('{"items":[{"id":"p1"}]}', { status: 200 })
    );
    const published: unknown[] = [];
    const environment = createBrowserDataExecutionEnvironment({
      fetch: fetch as typeof globalThis.fetch,
      now: (() => {
        let value = 100;
        return () => value++;
      })(),
    });
    const invocation = createDataOperationInvocation({
      invocationId: 'invocation-products-1',
      sequence: 4,
      attempt: 1,
      startedAt: 100,
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
      documentRevision: '11',
      runtimeZone: 'client',
      mode: 'live',
      activation: 'route',
      input: { page: 2 },
      sourceTrace: [
        {
          sourceRef: {
            kind: 'data-operation',
            documentId: 'data-products',
            operationId: 'list-products',
          },
        },
      ],
    });
    const result = await environment.execute({
      invocation,
      source: {
        id: 'products-source',
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
      operation: {
        id: 'list-products',
        kind: 'query',
        outputSchemaId: 'products',
        configurationByKey: {
          method: { kind: 'literal', value: 'GET' },
          path: { kind: 'literal', value: '/products' },
        },
        policies: {},
      },
      signal: new AbortController().signal,
      publishNetworkTrace: (trace) => published.push(trace),
    });

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.test/products?page=2'),
      expect.objectContaining({ method: 'GET', credentials: 'omit' })
    );
    expect(result.result).toEqual({
      value: { items: [{ id: 'p1' }] },
      empty: false,
    });
    expect(published).toEqual([
      expect.objectContaining({
        sanitizedUrl: 'https://api.example.test/',
        correlation: {
          kind: 'data-operation',
          documentId: 'data-products',
          operationId: 'list-products',
          invocationId: 'invocation-products-1',
          sequence: 4,
          attempt: 1,
        },
        sourceTrace: invocation.sourceTrace,
      }),
    ]);
    expect(JSON.stringify(published)).not.toContain('page=2');
  });

  it('runs the same HTTP source through an exact mock fixture without network access', async () => {
    const fetch = vi.fn();
    const environment = createBrowserTestDataExecutionEnvironment({
      fetch: fetch as typeof globalThis.fetch,
      mock: {
        fixtureSetId: 'catalog-test',
        fixtures: [
          {
            id: 'products-page-2',
            operation: {
              documentId: 'data-products',
              operationId: 'list-products',
            },
            operationKind: 'query',
            input: { page: 2 },
            behavior: {
              kind: 'result',
              value: { items: [{ id: 'fixture-product' }] },
              empty: false,
            },
          },
        ],
      },
    });
    const invocation = createDataOperationInvocation({
      invocationId: 'invocation-products-test',
      sequence: 1,
      attempt: 1,
      startedAt: 100,
      operation: {
        documentId: 'data-products',
        operationId: 'list-products',
      },
      documentRevision: '11',
      runtimeZone: 'client',
      mode: 'mock',
      activation: 'test',
      input: { page: 2 },
    });
    const execute = () =>
      environment.execute({
        invocation,
        source: {
          id: 'products-source',
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
        operation: {
          id: 'list-products',
          kind: 'query',
          outputSchemaId: 'products',
          configurationByKey: {
            method: { kind: 'literal', value: 'GET' },
            path: { kind: 'literal', value: '/products' },
          },
          policies: {},
        },
        signal: new AbortController().signal,
      });

    await expect(execute()).resolves.toMatchObject({
      lifecycle: {
        status: 'success',
        value: { items: [{ id: 'fixture-product' }] },
      },
      networkTraces: [],
    });
    expect(fetch).not.toHaveBeenCalled();
    environment.dispose();
    await expect(execute()).rejects.toMatchObject({
      code: 'DATA_MOCK_RUNTIME_DISPOSED',
    });
  });

  it('denies Browser Test live Data unless explicitly enabled', () => {
    const environment = createBrowserTestDataExecutionEnvironment({
      mock: { fixtureSetId: 'empty', fixtures: [] },
    });
    expect(() =>
      environment.execute({
        invocation: createDataOperationInvocation({
          invocationId: 'live-test',
          sequence: 1,
          attempt: 1,
          startedAt: 100,
          operation: {
            documentId: 'data-products',
            operationId: 'list-products',
          },
          documentRevision: '11',
          runtimeZone: 'client',
          mode: 'live',
          activation: 'test',
          input: {},
        }),
        source: {
          id: 'products-source',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        operation: {
          id: 'list-products',
          kind: 'query',
          outputSchemaId: 'products',
          configurationByKey: {},
          policies: {},
        },
        signal: new AbortController().signal,
      })
    ).toThrow(/denies live mode/u);
  });

  it('provisions Browser Test fixtures from the exact executable snapshot', async () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [{ path: 'package.json', contents: '{}' }],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'package.json' }],
      capabilityRequirements: { preview: [], build: [], test: [] },
      dataMockProvision: {
        fixtureSetId: 'browser-snapshot-fixtures',
        emulatedAdapterIds: ['core.http'],
        fixtures: [
          {
            id: 'products',
            documentId: 'data-products',
            operationId: 'list-products',
            operationKind: 'query',
            behavior: {
              kind: 'result',
              value: [{ id: 'snapshot-product' }],
              empty: false,
            },
          },
        ],
      },
    });
    const environment = createBrowserTestDataExecutionEnvironment({
      snapshot,
    });

    await expect(
      environment.execute({
        invocation: createDataOperationInvocation({
          invocationId: 'snapshot-test',
          sequence: 1,
          attempt: 1,
          startedAt: 100,
          operation: {
            documentId: 'data-products',
            operationId: 'list-products',
          },
          documentRevision: '11',
          runtimeZone: 'client',
          mode: 'mock',
          activation: 'test',
          input: {},
        }),
        source: {
          id: 'products-source',
          adapterId: 'core.http',
          runtimeZone: 'client',
          bindingsById: {},
          configurationByKey: {},
        },
        operation: {
          id: 'list-products',
          kind: 'query',
          outputSchemaId: 'products',
          configurationByKey: {},
          policies: {},
        },
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      result: { value: [{ id: 'snapshot-product' }], empty: false },
    });
  });
});
