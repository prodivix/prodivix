import {
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  executeDataOperation,
  type DataOperation,
  type DataOperationAdapter,
  type DataJsonValue,
  type DataSourceDefinition,
} from '@prodivix/data';
import { describe, expect, it } from 'vitest';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  createDataMockRuntimeSession,
  createDataMockRuntimeSessionFromSnapshot,
  createMemoryDataMockFixtureStore,
  DataMockRuntimeError,
  type DataMockFixture,
  type DataMockScheduler,
} from './dataMockRuntime';

const operation = (id: string, kind: DataOperation['kind']): DataOperation => ({
  id,
  kind,
  outputSchemaId: `${id}-output`,
  configurationByKey: {},
  policies: {},
});

const source: DataSourceDefinition = {
  id: 'products',
  adapterId: 'core.http',
  runtimeZone: 'client',
  bindingsById: {},
  configurationByKey: {},
};

const invocation = (
  operationId: string,
  input: DataJsonValue,
  mode: 'mock' | 'live' = 'mock'
) =>
  createDataOperationInvocation({
    invocationId: `invocation-${operationId}`,
    sequence: 1,
    attempt: 1,
    startedAt: 100,
    operation: { documentId: 'data-products', operationId },
    documentRevision: '7',
    runtimeZone: 'client',
    mode,
    activation: 'test',
    input,
  });

const fixture = (
  value: Partial<DataMockFixture> &
    Pick<DataMockFixture, 'id' | 'operation' | 'operationKind' | 'behavior'>
): DataMockFixture => value;

describe('deterministic Data mock runtime', () => {
  it('prefers exact input and projects explicit page/empty lifecycle', async () => {
    const delays: number[] = [];
    const scheduler: DataMockScheduler = {
      async wait(delayMs) {
        delays.push(delayMs);
      },
    };
    const session = createDataMockRuntimeSession({
      emulatedAdapterIds: ['core.http'],
      scheduler,
      fixtureStore: createMemoryDataMockFixtureStore({
        fixtureSetId: 'catalog-test',
        fixtures: [
          fixture({
            id: 'fallback',
            operation: {
              documentId: 'data-products',
              operationId: 'list',
            },
            operationKind: 'query',
            behavior: { kind: 'result', value: ['fallback'], empty: false },
          }),
          fixture({
            id: 'page-2',
            operation: {
              documentId: 'data-products',
              operationId: 'list',
            },
            operationKind: 'query',
            input: { page: 2 },
            behavior: {
              kind: 'result',
              value: [],
              empty: true,
              delayMs: 25,
              page: {
                kind: 'offset',
                offset: 20,
                limit: 20,
                total: 20,
                hasMore: false,
              },
            },
          }),
        ],
      }),
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register(session.adapter);
    const result = await executeDataOperation({
      registry,
      invocation: invocation('list', { page: 2 }),
      source,
      operation: operation('list', 'query'),
      signal: new AbortController().signal,
      now: () => 125,
    });

    expect(delays).toEqual([25]);
    expect(result.lifecycle).toMatchObject({
      status: 'empty',
      page: { kind: 'offset', offset: 20, hasMore: false },
    });
    expect(result.networkTraces).toEqual([]);
  });

  it('supports input-bound mutation results without crossing into live mode', async () => {
    const session = createDataMockRuntimeSession({
      emulatedAdapterIds: ['core.http'],
      fixtureStore: createMemoryDataMockFixtureStore({
        fixtureSetId: 'catalog-test',
        fixtures: [
          fixture({
            id: 'create-product',
            operation: {
              documentId: 'data-products',
              operationId: 'create',
            },
            operationKind: 'mutation',
            input: { name: 'Desk' },
            behavior: {
              kind: 'result',
              value: { id: 'product-1', name: 'Desk' },
              empty: false,
            },
          }),
        ],
      }),
    });
    const liveAdapter: DataOperationAdapter = {
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query', 'mutation'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['network'],
      },
      async invoke() {
        return { value: 'live', empty: false };
      },
    };
    const registry = createDataOperationAdapterRegistry();
    registry.register(liveAdapter);
    registry.register(session.adapter);

    expect(
      registry.resolve(
        source.adapterId,
        invocation('create', { name: 'Desk' }),
        operation('create', 'mutation')
      ).descriptor.id
    ).toBe('prodivix.data.mock.fixture');
    expect(
      registry.resolve(
        source.adapterId,
        invocation('create', { name: 'Desk' }, 'live'),
        operation('create', 'mutation')
      ).descriptor.id
    ).toBe('core.http');
  });

  it('fails closed for missing/error fixtures and disposed sessions', async () => {
    const session = createDataMockRuntimeSession({
      emulatedAdapterIds: ['core.http'],
      fixtureStore: createMemoryDataMockFixtureStore({
        fixtureSetId: 'catalog-test',
        fixtures: [
          fixture({
            id: 'failure',
            operation: {
              documentId: 'data-products',
              operationId: 'failing',
            },
            operationKind: 'query',
            behavior: {
              kind: 'error',
              code: 'CATALOG_UNAVAILABLE',
              retryable: true,
            },
          }),
        ],
      }),
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register(session.adapter);
    const execute = (operationId: string) =>
      executeDataOperation({
        registry,
        invocation: invocation(operationId, {}),
        source,
        operation: operation(operationId, 'query'),
        signal: new AbortController().signal,
      });

    await expect(execute('missing')).rejects.toMatchObject({
      code: 'DATA_MOCK_FIXTURE_MISSING',
      retryable: false,
    });
    await expect(execute('failing')).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      retryable: true,
    });
    session.dispose();
    expect(session.isDisposed()).toBe(true);
    await expect(execute('failing')).rejects.toBeInstanceOf(
      DataMockRuntimeError
    );
    await expect(execute('failing')).rejects.toMatchObject({
      code: 'DATA_MOCK_RUNTIME_DISPOSED',
    });
  });

  it('rejects ambiguous fixture matches when the store is created', () => {
    const duplicate = fixture({
      id: 'first',
      operation: { documentId: 'data-products', operationId: 'list' },
      operationKind: 'query',
      input: { page: 1 },
      behavior: { kind: 'result', value: [], empty: true },
    });
    expect(() =>
      createMemoryDataMockFixtureStore({
        fixtureSetId: 'catalog-test',
        fixtures: [duplicate, { ...duplicate, id: 'second' }],
      })
    ).toThrow(/Ambiguous Data fixtures/u);
    expect(() =>
      createMemoryDataMockFixtureStore({
        fixtureSetId: 'catalog-test',
        fixtures: [
          fixture({
            id: 'invalid-json',
            operation: {
              documentId: 'data-products',
              operationId: 'list',
            },
            operationKind: 'query',
            behavior: {
              kind: 'result',
              value: Number.NaN,
              empty: false,
            },
          }),
        ],
      })
    ).toThrow(/numbers must be finite/u);
  });

  it('creates the same isolated runtime from a content-addressed snapshot provision', async () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [{ path: 'package.json', contents: '{}' }],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'package.json' }],
      capabilityRequirements: { preview: [], build: [], test: [] },
      dataMockProvision: {
        fixtureSetId: 'snapshot-fixtures',
        emulatedAdapterIds: ['core.http'],
        fixtures: [
          {
            id: 'products',
            documentId: 'data-products',
            operationId: 'list',
            operationKind: 'query',
            behavior: {
              kind: 'result',
              value: [{ id: 'from-snapshot' }],
              empty: false,
            },
          },
        ],
      },
    });
    const session = createDataMockRuntimeSessionFromSnapshot({ snapshot });
    const registry = createDataOperationAdapterRegistry();
    registry.register(session.adapter);

    await expect(
      executeDataOperation({
        registry,
        invocation: invocation('list', {}),
        source,
        operation: operation('list', 'query'),
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      result: { value: [{ id: 'from-snapshot' }], empty: false },
    });
  });

  it('isolates stateful CRUD mutations by session namespace and resets deterministically', async () => {
    const fixtures: DataMockFixture[] = [
      fixture({
        id: 'list',
        operation: { documentId: 'data-products', operationId: 'list' },
        operationKind: 'query',
        behavior: {
          kind: 'crud',
          collectionId: 'products',
          action: 'list',
        },
      }),
      fixture({
        id: 'create',
        operation: { documentId: 'data-products', operationId: 'create' },
        operationKind: 'mutation',
        behavior: {
          kind: 'crud',
          collectionId: 'products',
          action: 'create',
          valueInputKey: 'value',
        },
      }),
      fixture({
        id: 'update',
        operation: { documentId: 'data-products', operationId: 'update' },
        operationKind: 'mutation',
        behavior: {
          kind: 'crud',
          collectionId: 'products',
          action: 'update',
          idInputKey: 'id',
          valueInputKey: 'patch',
        },
      }),
      fixture({
        id: 'delete',
        operation: { documentId: 'data-products', operationId: 'delete' },
        operationKind: 'mutation',
        behavior: {
          kind: 'crud',
          collectionId: 'products',
          action: 'delete',
          idInputKey: 'id',
        },
      }),
    ];
    const createSession = (namespaceId: string) =>
      createDataMockRuntimeSession({
        namespaceId,
        emulatedAdapterIds: ['core.http'],
        fixtureStore: createMemoryDataMockFixtureStore({
          fixtureSetId: 'crud-test',
          fixtures,
        }),
        collections: [
          {
            id: 'products',
            entityIdKey: 'id',
            initialEntities: [{ id: 'p1', name: 'Chair' }],
          },
        ],
      });
    expect(() =>
      createDataMockRuntimeSession({
        emulatedAdapterIds: ['core.http'],
        fixtureStore: createMemoryDataMockFixtureStore({
          fixtureSetId: 'crud-test',
          fixtures,
        }),
        collections: [
          {
            id: 'products',
            entityIdKey: 'id',
            initialEntities: [{ id: 'p1' }],
          },
        ],
      })
    ).toThrow(/explicit session namespace/u);
    const first = createSession('test-session-1');
    const second = createSession('test-session-2');
    const registry = (session: ReturnType<typeof createSession>) => {
      const result = createDataOperationAdapterRegistry();
      result.register(session.adapter);
      return result;
    };
    const firstRegistry = registry(first);
    const secondRegistry = registry(second);
    const execute = (
      adapterRegistry: ReturnType<typeof registry>,
      operationId: string,
      kind: DataOperation['kind'],
      input: DataJsonValue
    ) =>
      executeDataOperation({
        registry: adapterRegistry,
        invocation: invocation(operationId, input),
        source,
        operation: operation(operationId, kind),
        signal: new AbortController().signal,
      });

    await expect(
      execute(firstRegistry, 'create', 'mutation', {
        value: { id: 'p2', name: 'Desk' },
      })
    ).resolves.toMatchObject({ result: { value: { id: 'p2' } } });
    await expect(
      execute(firstRegistry, 'update', 'mutation', {
        id: 'p2',
        patch: { name: 'Standing Desk' },
      })
    ).resolves.toMatchObject({
      result: { value: { id: 'p2', name: 'Standing Desk' } },
    });
    await expect(
      execute(firstRegistry, 'list', 'query', {})
    ).resolves.toMatchObject({
      result: {
        value: [
          { id: 'p1', name: 'Chair' },
          { id: 'p2', name: 'Standing Desk' },
        ],
      },
    });
    await expect(
      execute(secondRegistry, 'list', 'query', {})
    ).resolves.toMatchObject({
      result: { value: [{ id: 'p1', name: 'Chair' }] },
    });
    await expect(
      execute(firstRegistry, 'delete', 'mutation', { id: 'p1' })
    ).resolves.toMatchObject({ result: { value: { id: 'p1' } } });
    first.reset();
    await expect(
      execute(firstRegistry, 'list', 'query', {})
    ).resolves.toMatchObject({
      result: { value: [{ id: 'p1', name: 'Chair' }] },
    });
    expect(first.namespaceId).toBe('test-session-1');
  });

  it('requires a namespace when a snapshot provisions mutable collections', async () => {
    const snapshot = createExecutableProjectSnapshot({
      workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-state' },
      target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
      files: [{ path: 'package.json', contents: '{}' }],
      dependencyPlan: { manifestFilePath: 'package.json' },
      entrypoints: [{ kind: 'test', path: 'package.json' }],
      capabilityRequirements: { preview: [], build: [], test: [] },
      dataMockProvision: {
        fixtureSetId: 'snapshot-state',
        emulatedAdapterIds: ['core.http'],
        collections: [
          {
            id: 'products',
            entityIdKey: 'id',
            initialEntities: [{ id: 'p1', name: 'Chair' }],
          },
        ],
        fixtures: [
          {
            id: 'list',
            documentId: 'data-products',
            operationId: 'list',
            operationKind: 'query',
            behavior: {
              kind: 'crud',
              collectionId: 'products',
              action: 'list',
            },
          },
        ],
      },
    });
    expect(() =>
      createDataMockRuntimeSessionFromSnapshot({ snapshot })
    ).toThrow(/explicit session namespace/u);
    const session = createDataMockRuntimeSessionFromSnapshot({
      snapshot,
      namespaceId: 'snapshot-session-1',
    });
    const registry = createDataOperationAdapterRegistry();
    registry.register(session.adapter);
    await expect(
      executeDataOperation({
        registry,
        invocation: invocation('list', {}),
        source,
        operation: operation('list', 'query'),
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      result: { value: [{ id: 'p1', name: 'Chair' }] },
    });
  });
});
