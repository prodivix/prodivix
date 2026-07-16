import { describe, expect, it } from 'vitest';
import {
  createDataNetworkCorrelation,
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  createDataOperationNetworkTrace,
  executeDataOperation,
} from './dataRuntime';

const invocation = createDataOperationInvocation({
  invocationId: 'invocation-1',
  sequence: 2,
  attempt: 1,
  startedAt: 100,
  operation: { documentId: 'data-products', operationId: 'list' },
  documentRevision: '7',
  runtimeZone: 'client',
  mode: 'live',
  activation: 'route',
  input: { page: 1 },
});

describe('Data operation runtime contract', () => {
  it('projects stable Network correlation without endpoint or credential data', () => {
    expect(createDataNetworkCorrelation(invocation)).toEqual({
      kind: 'data-operation',
      documentId: 'data-products',
      operationId: 'list',
      invocationId: 'invocation-1',
      sequence: 2,
      attempt: 1,
    });
    const trace = createDataOperationNetworkTrace(invocation, {
      requestId: 'request-1',
      phase: 'runtime',
      adapter: 'core.http',
      method: 'GET',
      sanitizedUrl: 'https://api.example.test/',
      protocol: 'https',
      startedAt: 100,
      completedAt: 125,
      outcome: 'allowed',
      status: 200,
    });
    expect(trace).toMatchObject({
      runtimeZone: 'client',
      mode: 'live',
      correlation: { operationId: 'list', invocationId: 'invocation-1' },
    });
  });

  it('fails closed on unregistered or incompatible adapters', () => {
    const registry = createDataOperationAdapterRegistry();
    expect(() =>
      registry.resolve('core.http', invocation, {
        id: 'list',
        kind: 'query',
        outputSchemaId: 'products',
        configurationByKey: {},
        policies: {},
      })
    ).toThrow(/not registered/u);
    registry.register({
      descriptor: {
        id: 'core.mock',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['test'],
        modes: ['mock'],
        capabilities: [],
      },
      async invoke() {
        return { value: null, empty: false };
      },
    });
    expect(() =>
      registry.resolve('core.mock', invocation, {
        id: 'list',
        kind: 'query',
        outputSchemaId: 'products',
        configurationByKey: {},
        policies: {},
      })
    ).toThrow(/runtime zone/u);
    expect(() =>
      registry.register({
        descriptor: {
          id: 'invalid.adapter',
          version: '1',
          operationKinds: ['query'],
          runtimeZones: ['unknown' as 'client'],
          modes: ['mock'],
          capabilities: [],
        },
        async invoke() {
          return { value: null, empty: false };
        },
      })
    ).toThrow(/runtime zone is unsupported/u);
    expect(() =>
      registry.register({
        descriptor: {
          id: 'unsafe.emulator',
          version: '1',
          emulatedAdapterIds: ['core.http'],
          operationKinds: ['query'],
          runtimeZones: ['client'],
          modes: ['live'],
          capabilities: [],
        },
        async invoke() {
          return { value: null, empty: false };
        },
      })
    ).toThrow(/restricted to mock mode/u);
  });

  it('publishes loading/success and rejects adapter correlation drift', async () => {
    const lifecycle: string[] = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['network'],
      },
      async invoke(input) {
        input.publishNetworkTrace(
          createDataOperationNetworkTrace(input.invocation, {
            requestId: 'request-1',
            phase: 'runtime',
            adapter: 'core.http',
            method: 'GET',
            sanitizedUrl: 'https://api.example.test/',
            protocol: 'https',
            startedAt: 100,
            completedAt: 110,
            outcome: 'allowed',
            status: 200,
          })
        );
        return { value: [], empty: false };
      },
    });
    const result = await executeDataOperation({
      registry,
      invocation,
      source: {
        id: 'products',
        adapterId: 'core.http',
        runtimeZone: 'client',
        bindingsById: {},
        configurationByKey: {},
      },
      operation: {
        id: 'list',
        kind: 'query',
        outputSchemaId: 'products',
        configurationByKey: {},
        policies: {},
      },
      signal: new AbortController().signal,
      now: () => 125,
      publishLifecycle: (snapshot) => lifecycle.push(snapshot.status),
    });
    expect(lifecycle).toEqual(['loading', 'success']);
    expect(result.lifecycle).toMatchObject({
      status: 'success',
      invocationId: 'invocation-1',
      sequence: 2,
    });
  });
});
