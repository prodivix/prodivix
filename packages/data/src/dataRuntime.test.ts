import { describe, expect, it } from 'vitest';
import { createExecutionEnvironmentResolutionService } from '@prodivix/runtime-core';
import {
  createDataNetworkCorrelation,
  createDataOperationAdapterRegistry,
  createDataOperationInvocation,
  createDataOperationNetworkTrace,
  DataSchemaRuntimeError,
  executeDataOperation,
} from './dataRuntime';
import {
  applyDataPaginationInput,
  validateDataPaginationPage,
} from './dataPolicyRuntime';
import { createMemoryDataOperationCacheStore } from './dataCacheRuntime';
import { createMemoryDataOptimisticProjectionStore } from './dataOptimisticRuntime';
import {
  createDataLifecycleChannel,
  DataInvocationError,
} from './dataLifecycleChannel';
import type { DataJsonValue, DataSourceDocument } from './data.types';

const createInvocation = (
  invocationId: string,
  sequence: number,
  input: DataJsonValue = { page: 1 }
) =>
  createDataOperationInvocation({
    invocationId,
    sequence,
    attempt: 1,
    startedAt: 100,
    operation: { documentId: 'data-products', operationId: 'list' },
    documentRevision: '7',
    runtimeZone: 'client',
    mode: 'live',
    activation: 'route',
    input,
  });

const invocation = createInvocation('invocation-1', 2);

const document: DataSourceDocument = {
  source: {
    id: 'products',
    adapterId: 'core.http',
    runtimeZone: 'client',
    bindingsById: {},
    configurationByKey: {},
  },
  schemasById: {
    input: {
      id: 'input',
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { page: { type: 'integer' } },
        required: ['page'],
        additionalProperties: false,
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
    list: {
      id: 'list',
      kind: 'query',
      inputSchemaId: 'input',
      outputSchemaId: 'products',
      configurationByKey: {},
      policies: {},
    },
  },
};

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
      document,
      lifecycleChannel: createDataLifecycleChannel(),
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

  it('validates input and output schemas without publishing payload values', async () => {
    let adapterCalls = 0;
    let adapterValue: DataJsonValue = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke() {
        adapterCalls += 1;
        return { value: adapterValue, empty: false };
      },
    });

    const invalidInputChannel = createDataLifecycleChannel();
    const invalidInput = executeDataOperation({
      registry,
      invocation: createInvocation('invalid-input', 1, { page: 'secret' }),
      document,
      lifecycleChannel: invalidInputChannel,
      signal: new AbortController().signal,
      now: () => 125,
    });
    await expect(invalidInput).rejects.toMatchObject({
      code: 'DATA_INPUT_SCHEMA_INVALID',
      phase: 'input',
      schemaId: 'input',
    });
    await expect(invalidInput).rejects.toBeInstanceOf(DataSchemaRuntimeError);
    expect(adapterCalls).toBe(0);
    expect(invalidInputChannel.getSnapshot()).toMatchObject({
      status: 'error',
      error: { code: 'DATA_INPUT_SCHEMA_INVALID' },
    });
    expect(JSON.stringify(invalidInputChannel.getSnapshot())).not.toContain(
      'secret'
    );

    adapterValue = { unexpected: true };
    const invalidOutputChannel = createDataLifecycleChannel();
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('invalid-output', 2),
        document,
        lifecycleChannel: invalidOutputChannel,
        signal: new AbortController().signal,
        now: () => 125,
      })
    ).rejects.toMatchObject({
      code: 'DATA_OUTPUT_SCHEMA_INVALID',
      phase: 'output',
      schemaId: 'products',
    });
    expect(adapterCalls).toBe(1);
  });

  it('retries retryable queries with deterministic attempt correlation and bounded backoff', async () => {
    const attempts: number[] = [];
    const delays: number[] = [];
    const lifecycle: Array<{ status: string; attempt?: number }> = [];
    const traces: number[] = [];
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
        attempts.push(input.invocation.attempt);
        input.publishNetworkTrace(
          createDataOperationNetworkTrace(input.invocation, {
            requestId: `request-${input.invocation.attempt}`,
            phase: 'runtime',
            adapter: 'core.http',
            method: 'GET',
            sanitizedUrl: 'https://api.example.test/',
            protocol: 'https',
            startedAt: 100 + input.invocation.attempt,
            completedAt: 101 + input.invocation.attempt,
            outcome: 'allowed',
            status: input.invocation.attempt < 3 ? 503 : 200,
          })
        );
        if (input.invocation.attempt < 3)
          throw Object.assign(new Error('not published'), {
            code: 'CATALOG_TEMPORARY',
            retryable: true,
          });
        return { value: ['ready'], empty: false };
      },
    });
    const retryDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...document.operationsById.list!,
          policies: {
            retry: {
              maxAttempts: 3,
              backoff: 'exponential',
              initialDelayMs: 10,
              maxDelayMs: 15,
            },
          },
        },
      },
    };

    const result = await executeDataOperation({
      registry,
      invocation: createInvocation('retry-query', 5),
      document: retryDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      scheduler: {
        async wait(delayMs) {
          delays.push(delayMs);
        },
      },
      now: () => 150,
      publishLifecycle: (snapshot) =>
        lifecycle.push({
          status: snapshot.status,
          ...('attempt' in snapshot ? { attempt: snapshot.attempt } : {}),
        }),
      publishNetworkTrace: (trace) => {
        if (trace.correlation?.kind === 'data-operation')
          traces.push(trace.correlation.attempt);
      },
    });

    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([10, 15]);
    expect(traces).toEqual([1, 2, 3]);
    expect(lifecycle).toEqual([
      { status: 'loading', attempt: 1 },
      { status: 'loading', attempt: 2 },
      { status: 'loading', attempt: 3 },
      { status: 'success', attempt: 3 },
    ]);
    expect(result).toMatchObject({
      result: { value: ['ready'], empty: false },
      lifecycle: { status: 'success', attempt: 3 },
    });
  });

  it('denies automatic mutation replay before invoking an adapter', async () => {
    let adapterCalls = 0;
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['mutation'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke() {
        adapterCalls += 1;
        return { value: [], empty: false };
      },
    });
    const mutationDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...document.operationsById.list!,
          kind: 'mutation',
          policies: {
            retry: {
              maxAttempts: 2,
              backoff: 'fixed',
              initialDelayMs: 10,
            },
          },
        },
      },
    };

    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('mutation-retry', 1),
        document: mutationDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_MUTATION_RETRY_UNSUPPORTED' });
    expect(adapterCalls).toBe(0);
  });

  it('retries an explicitly idempotent mutation only through a capable adapter', async () => {
    const attempts: number[] = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['mutation'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['idempotency-key'],
      },
      async invoke(input) {
        attempts.push(input.invocation.attempt);
        if (input.invocation.attempt === 1)
          throw Object.assign(new Error('transient'), {
            code: 'TRANSIENT',
            retryable: true,
          });
        return { value: ['created'], empty: false };
      },
    });
    const mutationDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...document.operationsById.list!,
          kind: 'mutation',
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

    const result = await executeDataOperation({
      registry,
      invocation: createInvocation('mutation-retry', 1),
      document: mutationDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      scheduler: { wait: async () => undefined },
    });

    expect(attempts).toEqual([1, 2]);
    expect(result.lifecycle).toMatchObject({ status: 'success', attempt: 2 });

    const incapableRegistry = createDataOperationAdapterRegistry();
    incapableRegistry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['mutation'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      invoke: async () => ({ value: [], empty: false }),
    });
    await expect(
      executeDataOperation({
        registry: incapableRegistry,
        invocation: createInvocation('mutation-no-capability', 2),
        document: mutationDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toThrow('cannot project an idempotency key');
  });

  it('applies pagination defaults and rejects adapter page drift', async () => {
    const receivedInputs: DataJsonValue[] = [];
    let pageOffset = 0;
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke(input) {
        receivedInputs.push(input.invocation.input);
        return {
          value: ['page'],
          empty: false,
          page: {
            kind: 'offset',
            offset: pageOffset,
            limit: 20,
            total: 21,
            hasMore: true,
          },
        };
      },
    });
    const paginationDocument: DataSourceDocument = {
      ...document,
      schemasById: {
        ...document.schemasById,
        input: { id: 'input', schema: true },
      },
      operationsById: {
        list: {
          ...document.operationsById.list!,
          policies: {
            pagination: {
              kind: 'offset',
              offsetInput: 'offset',
              limitInput: 'limit',
              defaultLimit: 20,
              maxLimit: 50,
              totalPath: '/total',
            },
          },
        },
      },
    };

    const result = await executeDataOperation({
      registry,
      invocation: createInvocation('page-defaults', 1, {}),
      document: paginationDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
    });
    expect(receivedInputs).toEqual([{ limit: 20, offset: 0 }]);
    expect(result.lifecycle).toMatchObject({
      status: 'success',
      page: { kind: 'offset', offset: 0, limit: 20, hasMore: true },
    });

    pageOffset = 10;
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('page-drift', 2, {}),
        document: paginationDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_PAGINATION_PAGE_MISMATCH' });
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('page-limit', 3, { limit: 51 }),
        document: paginationDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_PAGINATION_INPUT_INVALID' });
    expect(receivedInputs).toHaveLength(2);
  });

  it('keeps cursor pagination explicit and fail closed', () => {
    const policy = {
      kind: 'cursor' as const,
      cursorInput: 'after',
      limitInput: 'first',
      defaultLimit: 10,
      maxLimit: 25,
      nextCursorPath: '/pageInfo/endCursor',
    };
    const effectiveInput = applyDataPaginationInput(
      { after: 'cursor-1' },
      policy
    );
    expect(effectiveInput).toEqual({ after: 'cursor-1', first: 10 });
    expect(() =>
      validateDataPaginationPage(
        { kind: 'cursor', nextCursor: 'cursor-2', hasMore: true },
        policy,
        effectiveInput
      )
    ).not.toThrow();
    expect(() => applyDataPaginationInput({ after: ' ' }, policy)).toThrow(
      /pagination policy/u
    );
    expect(() =>
      validateDataPaginationPage(undefined, policy, effectiveInput)
    ).toThrow(/pagination policy/u);
  });

  it('serves cache-first and stale-while-revalidate hits without rerunning the adapter', async () => {
    let adapterCalls = 0;
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke() {
        adapterCalls += 1;
        return { value: [`network-${adapterCalls}`], empty: false };
      },
    });
    const cache = {
      store: createMemoryDataOperationCacheStore(),
      targetId: 'browser-preview',
    };
    const cacheDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...document.operationsById.list!,
          policies: {
            cache: {
              strategy: 'stale-while-revalidate',
              ttlMs: 10,
              staleWhileRevalidateMs: 100,
            },
          },
        },
      },
    };
    const lifecycleChannel = createDataLifecycleChannel();

    const network = await executeDataOperation({
      registry,
      invocation: createInvocation('cache-network', 1),
      document: cacheDocument,
      lifecycleChannel,
      signal: new AbortController().signal,
      cache,
      now: () => 100,
    });
    expect(network.cache).toEqual({ status: 'network' });

    const fresh = await executeDataOperation({
      registry,
      invocation: createInvocation('cache-fresh', 2),
      document: cacheDocument,
      lifecycleChannel,
      signal: new AbortController().signal,
      cache,
      now: () => 109,
    });
    expect(fresh).toMatchObject({
      result: { value: ['network-1'] },
      cache: { status: 'hit-fresh' },
      networkTraces: [],
    });

    const stale = await executeDataOperation({
      registry,
      invocation: createInvocation('cache-stale', 3),
      document: cacheDocument,
      lifecycleChannel,
      signal: new AbortController().signal,
      cache,
      now: () => 110,
    });
    expect(stale).toMatchObject({
      result: { value: ['network-1'] },
      cache: { status: 'hit-stale', revalidationRequired: true },
    });
    expect(adapterCalls).toBe(1);
  });

  it('uses a validated network-first cache only for retryable adapter failure', async () => {
    let failure: { code: string; retryable: boolean } | undefined;
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke() {
        if (failure) throw failure;
        return { value: ['validated'], empty: false };
      },
    });
    const cache = {
      store: createMemoryDataOperationCacheStore(),
      targetId: 'browser-preview',
    };
    const networkFirstDocument: DataSourceDocument = {
      ...document,
      operationsById: {
        list: {
          ...document.operationsById.list!,
          policies: {
            cache: {
              strategy: 'network-first',
              ttlMs: 1_000,
              staleWhileRevalidateMs: 1_000,
            },
          },
        },
      },
    };
    const lifecycleChannel = createDataLifecycleChannel();
    await executeDataOperation({
      registry,
      invocation: createInvocation('network-first-seed', 1),
      document: networkFirstDocument,
      lifecycleChannel,
      signal: new AbortController().signal,
      cache,
      now: () => 100,
    });
    failure = { code: 'TRANSIENT', retryable: true };
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('network-first-fallback', 2),
        document: networkFirstDocument,
        lifecycleChannel,
        signal: new AbortController().signal,
        cache,
        now: () => 101,
      })
    ).resolves.toMatchObject({
      result: { value: ['validated'] },
      cache: { status: 'network-fallback' },
    });

    failure = { code: 'AUTH_DENIED', retryable: false };
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('network-first-denied', 3),
        document: networkFirstDocument,
        lifecycleChannel,
        signal: new AbortController().signal,
        cache,
        now: () => 102,
      })
    ).rejects.toMatchObject({ code: 'AUTH_DENIED' });
  });

  it('rejects duplicate work and prevents a superseded result from replacing the current lifecycle', async () => {
    const completions = new Map<
      number,
      (result: { value: string[]; empty: boolean }) => void
    >();
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      invoke({ invocation: activeInvocation }) {
        return new Promise((resolve) => {
          completions.set(activeInvocation.sequence, resolve);
        });
      },
    });
    const lifecycleChannel = createDataLifecycleChannel();
    const older = executeDataOperation({
      registry,
      invocation: createInvocation('older', 2),
      document,
      lifecycleChannel,
      signal: new AbortController().signal,
    });
    const newer = executeDataOperation({
      registry,
      invocation: createInvocation('newer', 3),
      document,
      lifecycleChannel,
      signal: new AbortController().signal,
    });

    completions.get(3)?.({ value: ['current'], empty: false });
    await expect(newer).resolves.toMatchObject({
      lifecycle: { status: 'success', sequence: 3 },
    });
    completions.get(2)?.({ value: ['stale'], empty: false });
    await expect(older).rejects.toMatchObject({
      code: 'DATA_INVOCATION_SUPERSEDED',
    });
    await expect(older).rejects.toBeInstanceOf(DataInvocationError);
    expect(lifecycleChannel.getSnapshot()).toMatchObject({
      status: 'success',
      sequence: 3,
      value: ['current'],
    });

    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('newer', 3),
        document,
        lifecycleChannel,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_INVOCATION_DUPLICATE' });
  });

  it('binds a lifecycle channel to one exact document revision and operation', () => {
    const lifecycleChannel = createDataLifecycleChannel();
    lifecycleChannel.activate(invocation);
    let rejection: unknown;
    try {
      lifecycleChannel.activate(
        createDataOperationInvocation({
          ...invocation,
          invocationId: 'revision-drift',
          sequence: 3,
          documentRevision: '8',
        })
      );
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(DataInvocationError);
    expect(rejection).toMatchObject({
      code: 'DATA_LIFECYCLE_IDENTITY_DRIFT',
    });
  });

  it('resolves exact environment bindings before adapter effects and revokes the lease', async () => {
    const adapterInvocations: string[] = [];
    const auditKinds: string[] = [];
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['environment-binding'],
      },
      async invoke(input) {
        const baseUrl = input.environment?.readPublicBinding(
          { bindingId: 'endpoint' },
          'source.baseUrl'
        );
        adapterInvocations.push(String(baseUrl));
        return { value: ['resolved'], empty: false };
      },
    });
    const environmentDocument: DataSourceDocument = {
      ...document,
      source: {
        ...document.source,
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
    };
    const environmentService = createExecutionEnvironmentResolutionService({
      snapshots: {
        load: () => ({
          environmentId: 'environment-main',
          revision: 'revision-7',
          mode: 'live',
          publicBindingsById: {
            endpoint: 'https://api.example.test',
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
      publishAudit: (event) => auditKinds.push(event.kind),
    });
    const environmentInvocation = createDataOperationInvocation({
      ...createInvocation('environment-resolution', 1),
      environment: {
        environmentId: 'environment-main',
        revision: 'revision-7',
        mode: 'live',
      },
    });

    await expect(
      executeDataOperation({
        registry,
        invocation: environmentInvocation,
        document: environmentDocument,
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
      })
    ).resolves.toMatchObject({ result: { value: ['resolved'] } });
    expect(adapterInvocations).toEqual(['https://api.example.test']);
    expect(auditKinds).toEqual([
      'lease-issued',
      'public-binding-read',
      'lease-revoked',
    ]);
  });

  it('denies missing or stale environment resolution before invoking the adapter', async () => {
    let adapterCalls = 0;
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['query'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: ['environment-binding'],
      },
      async invoke() {
        adapterCalls += 1;
        return { value: [], empty: false };
      },
    });
    const environmentDocument: DataSourceDocument = {
      ...document,
      source: {
        ...document.source,
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
    };
    await expect(
      executeDataOperation({
        registry,
        invocation: createInvocation('missing-environment', 1),
        document: environmentDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: 'DATA_ENVIRONMENT_REFERENCE_REQUIRED' });

    const staleEnvironment = createExecutionEnvironmentResolutionService({
      snapshots: {
        load: () => ({
          environmentId: 'environment-main',
          revision: 'revision-current',
          mode: 'live',
          publicBindingsById: { endpoint: 'https://api.example.test' },
          secretBindingIds: [],
        }),
      },
      permissions: {
        authorize: () => {
          throw new Error('stale revision must fail before authorization');
        },
      },
      secrets: { read: () => undefined },
    });
    await expect(
      executeDataOperation({
        registry,
        invocation: createDataOperationInvocation({
          ...createInvocation('stale-environment', 2),
          environment: {
            environmentId: 'environment-main',
            revision: 'revision-stale',
            mode: 'live',
          },
        }),
        document: environmentDocument,
        lifecycleChannel: createDataLifecycleChannel(),
        signal: new AbortController().signal,
        environmentResolution: {
          service: staleEnvironment,
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
      })
    ).rejects.toMatchObject({ code: 'ENVIRONMENT_REVISION_MISMATCH' });
    expect(adapterCalls).toBe(0);
  });

  it('applies and reconciles an optimistic mutation through the shared execute kernel', async () => {
    const registry = createDataOperationAdapterRegistry();
    registry.register({
      descriptor: {
        id: 'core.http',
        version: '1',
        operationKinds: ['mutation'],
        runtimeZones: ['client'],
        modes: ['live'],
        capabilities: [],
      },
      async invoke() {
        return {
          value: { item: { id: 'server-1', name: 'Saved' } },
          empty: false,
        };
      },
    });
    const mutationDocument: DataSourceDocument = {
      ...document,
      schemasById: {
        input: {
          id: 'input',
          schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
          },
        },
        result: {
          id: 'result',
          schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
          },
        },
      },
      operationsById: {
        save: {
          id: 'save',
          kind: 'mutation',
          inputSchemaId: 'input',
          outputSchemaId: 'result',
          configurationByKey: {},
          policies: {
            optimistic: {
              kind: 'crud',
              action: 'create',
              target: {
                documentId: 'data-products',
                operationId: 'list',
              },
              valueInputPath: '/item',
              valueOutputPath: '/item',
              placement: 'end',
              rollback: 'on-error',
            },
          },
        },
      },
    };
    const store = createMemoryDataOptimisticProjectionStore([
      {
        target: { documentId: 'data-products', operationId: 'list' },
        partitionId: 'products:all',
        version: 0,
        value: [],
      },
    ]);
    const projections: DataJsonValue[] = [];
    const result = await executeDataOperation({
      registry,
      invocation: createDataOperationInvocation({
        ...createInvocation('save-1', 1, {
          item: { id: 'temporary', name: 'Draft' },
        }),
        operation: { documentId: 'data-products', operationId: 'save' },
        activation: 'event',
      }),
      document: mutationDocument,
      lifecycleChannel: createDataLifecycleChannel(),
      signal: new AbortController().signal,
      optimistic: { store, targetPartitionId: 'products:all' },
      publishOptimistic: (snapshot) => projections.push(snapshot.value),
      now: () => 125,
    });

    expect(result.optimistic.status).toBe('committed');
    expect(projections).toEqual([
      [{ id: 'temporary', name: 'Draft' }],
      [{ id: 'server-1', name: 'Saved' }],
    ]);
    expect(
      await store.read(
        { documentId: 'data-products', operationId: 'list' },
        'products:all'
      )
    ).toMatchObject({
      version: 2,
      value: [{ id: 'server-1', name: 'Saved' }],
    });
  });
});
