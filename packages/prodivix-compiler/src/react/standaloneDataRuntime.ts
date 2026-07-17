import type { DataOperationKind } from '@prodivix/data';
import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { ExportModule } from '#src/export/types';
import {
  projectStandaloneDataDocuments,
  STANDALONE_DATA_LIVE_RUNTIME_SOURCE,
} from '#src/react/standaloneDataLiveRuntime';
import {
  STATIC_CLIENT_DATA_RUNTIME_TARGET,
  type WorkspaceDataRuntimeTarget,
} from '#src/react/workspaceDataRuntimeTarget';

export const WORKSPACE_DATA_RUNTIME_MODULE_ID = 'workspace-data-runtime';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const operationKinds = (
  workspace: WorkspaceSnapshot
): Readonly<Record<string, Readonly<Record<string, DataOperationKind>>>> =>
  Object.freeze(
    Object.fromEntries(
      Object.values(workspace.docsById)
        .filter((document) => document.type === 'data-source')
        .sort((left, right) => compareText(left.id, right.id))
        .flatMap((document) => {
          const read = decodeWorkspaceDataSourceDocument(document);
          if (read.status !== 'valid') return [];
          return [
            [
              document.id,
              Object.freeze(
                Object.fromEntries(
                  Object.values(read.decodedContent.operationsById)
                    .sort((left, right) => compareText(left.id, right.id))
                    .map((operation) => [operation.id, operation.kind])
                )
              ),
            ],
          ];
        })
    )
  );

const source = (
  workspace: WorkspaceSnapshot,
  dataRuntimeTarget: WorkspaceDataRuntimeTarget
): string => `type DataOperationReference = Readonly<{
  documentId: string;
  operationId: string;
}>;

type DataOperationInputBinding =
  | Readonly<{ kind: 'literal'; value: unknown }>
  | Readonly<{ kind: 'trigger-payload'; path?: string }>
  | Readonly<{ kind: 'runtime-value'; valueId: string; path?: string }>
  | Readonly<{ kind: 'object'; propertiesByKey: Readonly<Record<string, DataOperationInputBinding>> }>
  | Readonly<{ kind: 'array'; items: readonly DataOperationInputBinding[] }>
  | Readonly<{ kind: 'code'; slotId: string; reference: unknown; input: DataOperationInputBinding }>;

type DataQueryActivation =
  | Readonly<{ kind: 'document' }>
  | Readonly<{ kind: 'route'; routeId: string }>
  | Readonly<{ kind: 'input-change'; dependencyId: string }>;

type DataOperationBinding = Readonly<{
  operation: DataOperationReference;
  input?: DataOperationInputBinding;
  activations?: readonly DataQueryActivation[];
}>;

type DataLifecycleSnapshot = Readonly<Record<string, unknown>> & Readonly<{
  operation: DataOperationReference;
  sequence: number;
  status: 'idle' | 'loading' | 'success' | 'empty' | 'error';
}>;

type DataLifecycleRequest = Readonly<{
  documentId: string;
  instancePath: string;
  dataId: string;
  binding: DataOperationBinding;
}>;

type DataBindingsActivationRequest = Readonly<{
  documentId: string;
  instancePath: string;
  currentRouteId?: string;
  bindingsByDataId: Readonly<Record<string, DataOperationBinding>>;
  runtimeValuesById: Readonly<Record<string, unknown>>;
}>;

type DataMutationDispatchRequest = Readonly<{
  binding: Readonly<{
    kind: 'dispatch-data-operation';
    operation: DataOperationReference;
    input: DataOperationInputBinding;
  }>;
  payload: unknown;
  runtimeValuesById: Readonly<Record<string, unknown>>;
  source: Readonly<{
    documentId: string;
    nodeId: string;
    eventName: string;
    instancePath: string;
  }>;
}>;

type DataMockBehavior =
  | Readonly<{ kind: 'result'; value: unknown; empty: boolean; page?: unknown; delayMs?: number }>
  | Readonly<{ kind: 'error'; code: string; retryable: boolean; delayMs?: number }>
  | Readonly<{
      kind: 'crud';
      collectionId: string;
      action: 'list' | 'get' | 'create' | 'update' | 'delete';
      idInputKey?: string;
      valueInputKey?: string;
      delayMs?: number;
    }>;

type DataMockFixture = Readonly<{
  documentId: string;
  operationId: string;
  operationKind: 'query' | 'mutation';
  input?: unknown;
  behavior: DataMockBehavior;
}>;

type DataMockCollection = Readonly<{
  id: string;
  entityIdKey: string;
  initialEntities: readonly Readonly<Record<string, unknown>>[];
}>;

type DataMockProvision = Readonly<{
  fixtures: readonly DataMockFixture[];
  collections?: readonly DataMockCollection[];
}>;

type DataMockCollectionState = {
  entityIdKey: string;
  entities: Readonly<Record<string, unknown>>[];
};

type DataRuntimeTarget = Readonly<{
  format: 'prodivix.workspace-data-runtime-target.v1';
  kind: 'static-client' | 'execution-parent-gateway' | 'provider-mock';
  runtimeMode: 'live' | 'mock-only';
  serverGateway: 'none' | 'execution-data-gateway-message-v1';
}>;

const operationKinds = ${JSON.stringify(operationKinds(workspace))} as const;
const dataDocuments = ${JSON.stringify(projectStandaloneDataDocuments(workspace))} as Readonly<Record<string, DataRuntimeDocument>>;
const dataRuntimeTarget: DataRuntimeTarget = ${JSON.stringify(dataRuntimeTarget)};
const provisionUrl = '/.prodivix/data-mock-provision.json';

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => JSON.stringify(key) + ':' + canonicalJson(entry))
      .join(',') + '}';
  }
  throw new Error('DATA_INPUT_NOT_JSON');
};

const cloneJson = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;

const decodePointerToken = (token: string): string => {
  if (/~(?:[^01]|$)/u.test(token)) throw new Error('DATA_INPUT_POINTER_INVALID');
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
};

const selectPointer = (value: unknown, pointer?: string): unknown => {
  if (pointer === undefined) return cloneJson(value);
  if (!pointer.startsWith('/')) throw new Error('DATA_INPUT_POINTER_INVALID');
  let current = value;
  for (const token of pointer.slice(1).split('/').map(decodePointerToken)) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) throw new Error('DATA_INPUT_POINTER_INVALID');
      current = current[Number(token)];
    } else if (current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, token)) {
      current = (current as Readonly<Record<string, unknown>>)[token];
    } else {
      throw new Error('DATA_INPUT_VALUE_MISSING');
    }
    if (current === undefined) throw new Error('DATA_INPUT_VALUE_MISSING');
  }
  return cloneJson(current);
};

${STANDALONE_DATA_LIVE_RUNTIME_SOURCE}

const resolveInput = (
  binding: DataOperationInputBinding,
  context: Readonly<{ payload?: unknown; runtimeValuesById: Readonly<Record<string, unknown>> }>
): unknown => {
  let nodes = 0;
  const resolve = (candidate: DataOperationInputBinding, depth: number): unknown => {
    nodes += 1;
    if (nodes > 10000 || depth > 32) throw new Error('DATA_INPUT_BINDING_INVALID');
    switch (candidate.kind) {
      case 'literal':
        return cloneJson(candidate.value);
      case 'trigger-payload':
        if (context.payload === undefined) throw new Error('DATA_INPUT_VALUE_MISSING');
        return selectPointer(context.payload, candidate.path);
      case 'runtime-value': {
        const value = context.runtimeValuesById[candidate.valueId];
        if (value === undefined) throw new Error('DATA_INPUT_VALUE_MISSING');
        return selectPointer(value, candidate.path);
      }
      case 'object':
        return Object.fromEntries(
          Object.entries(candidate.propertiesByKey)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, child]) => [key, resolve(child, depth + 1)])
        );
      case 'array':
        return candidate.items.map((child) => resolve(child, depth + 1));
      case 'code':
        throw new Error('DATA_CODE_INPUT_RUNTIME_UNAVAILABLE');
    }
  };
  return cloneJson(resolve(binding, 0));
};

const lifecycleKey = (request: DataLifecycleRequest): string =>
  JSON.stringify([request.documentId, request.instancePath, request.dataId]);

const fixtureMatch = (
  fixture: DataMockFixture,
  operation: DataOperationReference,
  operationKind: 'query' | 'mutation',
  input: unknown
): boolean =>
  fixture.documentId === operation.documentId &&
  fixture.operationId === operation.operationId &&
  fixture.operationKind === operationKind &&
  (fixture.input === undefined || canonicalJson(fixture.input) === canonicalJson(input));

const loadProvision = async (): Promise<DataMockProvision> => {
  const response = await fetch(provisionUrl, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('DATA_MOCK_PROVISION_UNAVAILABLE');
  return await response.json() as DataMockProvision;
};

const entityIdentity = (value: unknown): string => {
  if ((typeof value !== 'string' || !value) && (typeof value !== 'number' || !Number.isFinite(value)))
    throw new Error('DATA_MOCK_ENTITY_ID_INVALID');
  return JSON.stringify(value);
};

export const createWorkspaceDataRuntime = () => {
  const snapshots = new Map<string, DataLifecycleSnapshot>();
  const listeners = new Set<() => void>();
  const networkListeners = new Set<(trace: DataRuntimeNetworkTrace) => void>();
  const activated = new Set<string>();
  const inputDigests = new Map<string, string>();
  const trackedQueries = new Map<string, Readonly<{ request: DataLifecycleRequest; input: unknown }>>();
  let sequence = 0;
  let provision: Promise<DataMockProvision> | undefined;
  let runtimeManifest: Promise<DataRuntimeManifest> | undefined;
  let collectionStates: Map<string, DataMockCollectionState> | undefined;
  const cacheEntries = new Map<string, DataRuntimeCacheEntry>();
  let disposed = false;

  const createMutationInvocationId = (mutationSequence: number): string => {
    const dispatchId = globalThis.crypto?.randomUUID?.();
    if (!dispatchId) throw new DataRuntimeFailure('DATA_MUTATION_IDENTITY_UNAVAILABLE');
    return 'standalone:mutation:' + dispatchId + ':' + mutationSequence;
  };

  const publish = () => listeners.forEach((listener) => listener());
  const publishNetworkTrace = (trace: DataRuntimeNetworkTrace): void => {
    networkListeners.forEach((listener) => listener(trace));
    const parent = typeof globalThis === 'object'
      ? (globalThis as unknown as { parent?: { postMessage(value: unknown, targetOrigin: string): void } }).parent
      : undefined;
    if (parent && parent !== (globalThis as unknown))
      parent.postMessage(
        { type: 'prodivix.execution-network-bridge.v1', trace },
        '*'
      );
  };
  const operationKind = (operation: DataOperationReference): 'query' | 'mutation' | undefined =>
    (operationKinds as Record<string, Record<string, 'query' | 'mutation'>>)[operation.documentId]?.[operation.operationId];
  const failure = (
    operation: DataOperationReference,
    currentSequence: number,
    invocationId: string,
    startedAt: number,
    code: string
  ): DataLifecycleSnapshot => Object.freeze({
    operation,
    sequence: currentSequence,
    status: 'error',
    invocationId,
    attempt: 1,
    startedAt,
    completedAt: Date.now(),
    error: Object.freeze({ code, message: 'Data operation failed.', retryable: false }),
  });

  const readProvision = async (): Promise<DataMockProvision> => {
    const value = await (provision ??= loadProvision());
    if (!collectionStates) {
      collectionStates = new Map(
        (value.collections ?? []).map((collection) => [
          collection.id,
          {
            entityIdKey: collection.entityIdKey,
            entities: collection.initialEntities.map((entity) => cloneJson(entity)),
          },
        ])
      );
    }
    return value;
  };

  const executeCrud = (behavior: Extract<DataMockBehavior, { kind: 'crud' }>, input: unknown): Readonly<{ value: unknown; empty: boolean }> => {
    const state = collectionStates?.get(behavior.collectionId);
    if (!state) throw new Error('DATA_MOCK_COLLECTION_MISSING');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('DATA_MOCK_CRUD_INPUT_INVALID');
    const record = input as Readonly<Record<string, unknown>>;
    const readInput = (key: string | undefined): unknown => {
      if (!key || record[key] === undefined) throw new Error('DATA_MOCK_CRUD_INPUT_MISSING');
      return record[key];
    };
    if (behavior.action === 'list')
      return { value: cloneJson(state.entities), empty: state.entities.length === 0 };
    const id = behavior.idInputKey ? entityIdentity(readInput(behavior.idInputKey)) : undefined;
    if (behavior.action === 'get') {
      const entity = state.entities.find((candidate) => entityIdentity(candidate[state.entityIdKey]) === id);
      return entity ? { value: cloneJson(entity), empty: false } : { value: null, empty: true };
    }
    if (behavior.action === 'create') {
      const value = readInput(behavior.valueInputKey);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DATA_MOCK_ENTITY_INVALID');
      const entity = cloneJson(value as Readonly<Record<string, unknown>>);
      const entityId = entityIdentity(entity[state.entityIdKey]);
      if (state.entities.some((candidate) => entityIdentity(candidate[state.entityIdKey]) === entityId))
        throw new Error('DATA_MOCK_ENTITY_CONFLICT');
      state.entities.push(entity);
      return { value: cloneJson(entity), empty: false };
    }
    const index = state.entities.findIndex((candidate) => entityIdentity(candidate[state.entityIdKey]) === id);
    if (index < 0) throw new Error('DATA_MOCK_ENTITY_NOT_FOUND');
    const current = state.entities[index]!;
    if (behavior.action === 'delete') {
      state.entities.splice(index, 1);
      return { value: cloneJson(current), empty: false };
    }
    const value = readInput(behavior.valueInputKey);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('DATA_MOCK_ENTITY_INVALID');
    const patch = cloneJson(value as Readonly<Record<string, unknown>>);
    if (patch[state.entityIdKey] !== undefined && entityIdentity(patch[state.entityIdKey]) !== id)
      throw new Error('DATA_MOCK_ENTITY_ID_IMMUTABLE');
    const updated = Object.freeze({ ...current, ...patch, [state.entityIdKey]: current[state.entityIdKey] });
    state.entities[index] = updated;
    return { value: cloneJson(updated), empty: false };
  };

  const invokeMock = async (
    operation: DataOperationReference,
    kind: 'query' | 'mutation',
    input: unknown
  ): Promise<Readonly<{ value: unknown; empty: boolean; page?: unknown }>> => {
    const value = await readProvision();
    const matches = value.fixtures.filter((fixture) => fixtureMatch(fixture, operation, kind, input));
    const exact = matches.filter((fixture) => fixture.input !== undefined);
    const fixture = exact.length === 1 ? exact[0] : exact.length === 0 && matches.length === 1 ? matches[0] : undefined;
    if (!fixture) throw new Error(matches.length ? 'DATA_MOCK_FIXTURE_AMBIGUOUS' : 'DATA_MOCK_FIXTURE_MISSING');
    const delayMs = fixture.behavior.delayMs;
    if (typeof delayMs === 'number' && delayMs > 0)
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
    if (fixture.behavior.kind === 'error') throw new Error(fixture.behavior.code);
    if (fixture.behavior.kind === 'crud') return executeCrud(fixture.behavior, input);
    return {
      value: cloneJson(fixture.behavior.value),
      empty: fixture.behavior.empty,
      ...(fixture.behavior.page === undefined ? {} : { page: cloneJson(fixture.behavior.page) }),
    };
  };

  const waitForRetry = async (delayMs: number): Promise<void> => {
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
  };

  const invoke = async (
    operationReference: DataOperationReference,
    kind: 'query' | 'mutation',
    rawInput: unknown,
    invocationId: string,
    currentSequence: number
  ): Promise<DataRuntimeResult> => {
    const document = dataDocuments[operationReference.documentId];
    const operation = document?.operationsById[operationReference.operationId];
    if (!document || !operation || operation.kind !== kind)
      throw new DataRuntimeFailure('DATA_OPERATION_UNRESOLVED');
    const operationInput = applyPaginationInput(rawInput, operation.policies.pagination);
    validateRuntimePayload(
      operationReference.documentId,
      document,
      operation.inputSchemaId,
      operationInput,
      'input'
    );
    const manifest = await (runtimeManifest ??= loadDataRuntimeManifest());
    if (
      dataRuntimeTarget.runtimeMode === 'mock-only' &&
      manifest.mode !== 'mock'
    )
      throw new DataRuntimeFailure('DATA_RUNTIME_TARGET_MODE_INVALID');
    const cachePolicy = kind === 'query' ? operation.policies.cache : undefined;
    let cacheTtlMs = 0;
    let cacheStaleMs = 0;
    let cacheKey: string | undefined;
    let cacheEntry: DataRuntimeCacheEntry | undefined;
    if (cachePolicy && cachePolicy.strategy !== 'no-store') {
      cacheTtlMs = cachePolicy.ttlMs ?? 0;
      cacheStaleMs = cachePolicy.strategy === 'cache-first'
        ? 0
        : cachePolicy.staleWhileRevalidateMs ?? 0;
      if (
        !Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 1 ||
        !Number.isSafeInteger(cacheStaleMs) || cacheStaleMs < 0 ||
        cachePolicy.strategy === 'stale-while-revalidate' && cacheStaleMs < 1 ||
        cacheTtlMs + cacheStaleMs > 7 * 24 * 60 * 60_000 ||
        (cachePolicy.keyInputPaths?.length ?? 0) > 64
      ) throw new DataRuntimeFailure('DATA_CACHE_POLICY_INVALID');
      cacheKey = await dataCacheKey({
        documentId: operationReference.documentId,
        document,
        operation,
        operationInput,
        mode: manifest.mode,
      });
      cacheEntry = cacheEntries.get(cacheKey);
      if (cacheEntry && Date.now() >= cacheEntry.staleUntil) {
        cacheEntries.delete(cacheKey);
        cacheEntry = undefined;
      }
      const fresh = cacheEntry && Date.now() < cacheEntry.freshUntil;
      if (
        cacheEntry &&
        fresh &&
        ['cache-first', 'stale-while-revalidate'].includes(cachePolicy.strategy)
      ) return cloneJson(cacheEntry.result);
      if (cachePolicy.strategy === 'stale-while-revalidate' && cacheEntry) {
        const stale = cloneJson(cacheEntry.result);
        const staleEntry = cacheEntry;
        const staleKey = cacheKey;
        cacheEntries.delete(staleKey);
        void invoke(
          operationReference,
          kind,
          rawInput,
          invocationId,
          currentSequence
        ).catch(() => {
          if (!disposed && !cacheEntries.has(staleKey))
            cacheEntries.set(staleKey, staleEntry);
        });
        return stale;
      }
    }
    const retry = operation.policies.retry;
    if (
      kind === 'mutation' &&
      retry &&
      retry.maxAttempts > 1 &&
      operation.policies.idempotency?.kind !== 'invocation-key'
    )
      throw new DataRuntimeFailure('DATA_MUTATION_RETRY_UNSUPPORTED');
    if (
      retry &&
      (retry.maxAttempts < 1 || retry.maxAttempts > 10 || retry.initialDelayMs < 0 || retry.initialDelayMs > 300000)
    ) throw new DataRuntimeFailure('DATA_RETRY_POLICY_BUDGET_EXCEEDED');
    const maxAttempts = retry?.maxAttempts ?? 1;
    let result: DataRuntimeResult | undefined;
    let lastFailure: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        result = manifest.mode === 'mock'
          ? await invokeMock(operationReference, kind, operationInput)
          : await invokeLiveHttp({
              documentId: operationReference.documentId,
              document,
              operation,
              operationInput,
              invocationId,
              sequence: currentSequence,
              attempt,
              publishNetworkTrace,
            });
        break;
      } catch (error) {
        lastFailure = error;
        const retryable = error instanceof DataRuntimeFailure && error.retryable;
        if (!retryable || attempt >= maxAttempts) break;
        const exponential = retry?.backoff === 'exponential'
          ? retry.initialDelayMs * 2 ** Math.max(0, attempt - 1)
          : retry?.initialDelayMs ?? 0;
        const delay = Math.min(retry?.maxDelayMs ?? exponential, exponential);
        if (!Number.isSafeInteger(delay) || delay < 0 || delay > 300000)
          throw new DataRuntimeFailure('DATA_RETRY_POLICY_BUDGET_EXCEEDED');
        await waitForRetry(delay);
      }
    }
    if (!result) {
      if (
        cachePolicy?.strategy === 'network-first' &&
        cacheEntry &&
        lastFailure instanceof DataRuntimeFailure &&
        lastFailure.retryable
      ) return cloneJson(cacheEntry.result);
      throw lastFailure;
    }
    validateRuntimePage(result.page, operation.policies.pagination, operationInput);
    validateRuntimePayload(
      operationReference.documentId,
      document,
      operation.outputSchemaId,
      result.value,
      'output'
    );
    if (
      !disposed &&
      cacheKey &&
      cachePolicy &&
      cachePolicy.strategy !== 'no-store'
    ) {
      const storedAt = Date.now();
      cacheEntries.delete(cacheKey);
      cacheEntries.set(cacheKey, Object.freeze({
        freshUntil: storedAt + cacheTtlMs,
        staleUntil: storedAt + cacheTtlMs + cacheStaleMs,
        result: cloneJson(result),
      }));
      while (cacheEntries.size > 1000) {
        const oldest = cacheEntries.keys().next().value as string | undefined;
        if (!oldest) break;
        cacheEntries.delete(oldest);
      }
    }
    return cloneJson(result);
  };

  const applyOptimisticMutation = (
    operation: DataRuntimeOperation,
    input: unknown,
    mutationSequence: number,
    invocationId: string
  ): Readonly<{
    commit(result: DataRuntimeResult): void;
    rollback(): void;
  }> | undefined => {
    const policy = operation.policies.optimistic;
    if (!policy) return undefined;
    const candidate = policy.valueInputPath
      ? selectPointer(input, policy.valueInputPath)
      : cloneJson(input);
    const identity = (value: unknown): string => {
      if (!policy.entityIdPath)
        throw new DataRuntimeFailure('DATA_OPTIMISTIC_ENTITY_IDENTITY_MISSING');
      const selected = selectPointer(value, policy.entityIdPath);
      if (
        (typeof selected !== 'string' || !selected) &&
        (typeof selected !== 'number' || !Number.isFinite(selected))
      ) throw new DataRuntimeFailure('DATA_OPTIMISTIC_ENTITY_IDENTITY_MISSING');
      return JSON.stringify(selected);
    };
    const changes: Array<Readonly<{
      key: string;
      before: DataLifecycleSnapshot;
      affectedIndex: number;
    }>> = [];
    for (const [key, tracked] of trackedQueries) {
      if (
        tracked.request.binding.operation.documentId !== policy.target.documentId ||
        tracked.request.binding.operation.operationId !== policy.target.operationId
      ) continue;
      const before = snapshots.get(key);
      const value = before && 'value' in before ? before.value : undefined;
      if (!before || before.status !== 'success' || !Array.isArray(value)) continue;
      const next = value.map((entry) => cloneJson(entry));
      let affectedIndex: number;
      if (policy.action === 'create') {
        affectedIndex = policy.placement === 'start' ? 0 : next.length;
        next.splice(affectedIndex, 0, cloneJson(candidate));
      } else {
        const expected = identity(candidate);
        const matches = next.flatMap((entry, index) => {
          try { return identity(entry) === expected ? [index] : []; }
          catch { return []; }
        });
        if (matches.length === 0)
          throw new DataRuntimeFailure('DATA_OPTIMISTIC_ENTITY_IDENTITY_MISSING');
        if (matches.length > 1)
          throw new DataRuntimeFailure('DATA_OPTIMISTIC_ENTITY_IDENTITY_AMBIGUOUS');
        affectedIndex = matches[0]!;
        if (policy.action === 'delete') next.splice(affectedIndex, 1);
        else next[affectedIndex] = cloneJson(candidate);
      }
      changes.push(Object.freeze({ key, before, affectedIndex }));
      snapshots.set(key, Object.freeze({
        ...before,
        sequence: mutationSequence,
        invocationId,
        value: cloneJson(next),
      }));
    }
    if (!changes.length)
      throw new DataRuntimeFailure('DATA_OPTIMISTIC_PROJECTION_MISSING');
    publish();
    const settle = (kind: 'commit' | 'rollback', result?: DataRuntimeResult): void => {
      for (const change of changes) {
        const current = snapshots.get(change.key);
        if (!current || current.sequence !== mutationSequence) continue;
        if (kind === 'rollback') {
          snapshots.set(change.key, change.before);
          continue;
        }
        if (policy.action === 'delete') continue;
        if (!policy.valueOutputPath || !result)
          throw new DataRuntimeFailure('DATA_OPTIMISTIC_POINTER_INVALID');
        const authoritative = selectPointer(result.value, policy.valueOutputPath);
        const currentValue = 'value' in current ? current.value : undefined;
        if (!Array.isArray(currentValue) || change.affectedIndex >= currentValue.length)
          continue;
        const reconciled = currentValue.map((entry) => cloneJson(entry));
        reconciled[change.affectedIndex] = authoritative;
        snapshots.set(change.key, Object.freeze({
          ...current,
          value: cloneJson(reconciled),
        }));
      }
      publish();
    };
    return Object.freeze({
      commit: (result) => settle('commit', result),
      rollback: () => settle('rollback'),
    });
  };

  const runQuery = async (key: string, request: DataLifecycleRequest, input: unknown): Promise<void> => {
    const currentSequence = ++sequence;
    const invocationId = 'standalone:query:' + currentSequence;
    const startedAt = Date.now();
    trackedQueries.set(key, Object.freeze({ request, input: cloneJson(input) }));
    snapshots.set(key, Object.freeze({
      operation: request.binding.operation,
      sequence: currentSequence,
      status: 'loading',
      invocationId,
      attempt: 1,
      startedAt,
    }));
    publish();
    try {
      const result = await invoke(
        request.binding.operation,
        'query',
        input,
        invocationId,
        currentSequence
      );
      if (disposed || snapshots.get(key)?.sequence !== currentSequence) return;
      snapshots.set(key, Object.freeze({
        operation: request.binding.operation,
        sequence: currentSequence,
        status: result.empty ? 'empty' : 'success',
        invocationId,
        attempt: 1,
        startedAt,
        completedAt: Date.now(),
        ...(result.empty ? {} : { value: result.value }),
        ...(result.page === undefined ? {} : { page: result.page }),
      }));
    } catch (error) {
      if (disposed || snapshots.get(key)?.sequence !== currentSequence) return;
      snapshots.set(key, failure(
        request.binding.operation,
        currentSequence,
        invocationId,
        startedAt,
        runtimeFailureCode(error)
      ));
    }
    publish();
  };

  const activateBindings = async (input: DataBindingsActivationRequest): Promise<void> => {
    const pending: Promise<void>[] = [];
    for (const [dataId, binding] of Object.entries(input.bindingsByDataId).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
      const request = Object.freeze({
        documentId: input.documentId,
        instancePath: input.instancePath,
        dataId,
        binding,
      });
      const key = lifecycleKey(request);
      if (operationKind(binding.operation) !== 'query') {
        snapshots.set(key, failure(binding.operation, 0, 'unresolved', Date.now(), 'DATA_QUERY_OPERATION_UNRESOLVED'));
        publish();
        continue;
      }
      if (!snapshots.has(key))
        snapshots.set(key, Object.freeze({ operation: binding.operation, sequence: 0, status: 'idle' }));
      let mappedInput: unknown;
      try {
        mappedInput = resolveInput(binding.input ?? { kind: 'literal', value: {} }, {
          runtimeValuesById: input.runtimeValuesById,
        });
      } catch (error) {
        snapshots.set(key, failure(
          binding.operation,
          snapshots.get(key)?.sequence ?? 0,
          'input',
          Date.now(),
          runtimeFailureCode(error)
        ));
        publish();
        continue;
      }
      const digest = canonicalJson(mappedInput);
      const activations = binding.activations ?? [{ kind: 'document' } as const];
      let shouldDispatch = false;
      for (const activation of activations) {
        if (activation.kind === 'document') {
          const activationKey = key + ':document';
          if (!activated.has(activationKey)) {
            activated.add(activationKey);
            shouldDispatch = true;
          }
        } else if (activation.kind === 'route') {
          const activationKey = key + ':route:' + activation.routeId;
          if (input.currentRouteId === activation.routeId && !activated.has(activationKey)) {
            activated.add(activationKey);
            shouldDispatch = true;
          }
        } else {
          const dependencyKey = key + ':input:' + activation.dependencyId;
          if (inputDigests.get(dependencyKey) !== digest) shouldDispatch = true;
          inputDigests.set(dependencyKey, digest);
        }
      }
      if (shouldDispatch) pending.push(runQuery(key, request, mappedInput));
    }
    await Promise.all(pending);
  };

  return Object.freeze({
    subscribeDataLifecycle(listener: () => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeNetworkTrace(listener: (trace: DataRuntimeNetworkTrace) => void) {
      if (disposed) return () => undefined;
      networkListeners.add(listener);
      return () => networkListeners.delete(listener);
    },
    resolveDataLifecycleSnapshot(request: DataLifecycleRequest): DataLifecycleSnapshot {
      const key = lifecycleKey(request);
      const existing = snapshots.get(key);
      if (existing) return existing;
      const operation = request.binding.operation;
      const snapshot = operationKind(operation)
        ? Object.freeze({ operation, sequence: 0, status: 'idle' as const })
        : failure(operation, 0, 'unresolved', Date.now(), 'DATA_OPERATION_UNRESOLVED');
      snapshots.set(key, snapshot);
      return snapshot;
    },
    activateDataBindings: activateBindings,
    async dispatchDataMutation(request: DataMutationDispatchRequest): Promise<unknown> {
      if (disposed) throw new Error('DATA_RUNTIME_DISPOSED');
      if (operationKind(request.binding.operation) !== 'mutation') throw new Error('DATA_MUTATION_OPERATION_UNRESOLVED');
      const input = resolveInput(request.binding.input, {
        payload: request.payload,
        runtimeValuesById: request.runtimeValuesById,
      });
      const mutationSequence = ++sequence;
      const invocationId = createMutationInvocationId(mutationSequence);
      const document = dataDocuments[request.binding.operation.documentId];
      const operation = document?.operationsById[request.binding.operation.operationId];
      if (!operation || operation.kind !== 'mutation')
        throw new DataRuntimeFailure('DATA_MUTATION_OPERATION_UNRESOLVED');
      const optimistic = applyOptimisticMutation(
        operation,
        input,
        mutationSequence,
        invocationId
      );
      let result: DataRuntimeResult;
      try {
        result = await invoke(
          request.binding.operation,
          'mutation',
          input,
          invocationId,
          mutationSequence
        );
        optimistic?.commit(result);
      } catch (error) {
        optimistic?.rollback();
        throw error;
      }
      if (disposed) throw new Error('DATA_RUNTIME_DISPOSED');
      cacheEntries.clear();
      const revalidations = [...trackedQueries.entries()].map(([key, tracked]) =>
        runQuery(key, tracked.request, tracked.input)
      );
      await Promise.all(revalidations);
      return result.value;
    },
    dispose() {
      disposed = true;
      listeners.clear();
      networkListeners.clear();
      snapshots.clear();
      activated.clear();
      inputDigests.clear();
      trackedQueries.clear();
      collectionStates?.clear();
      cacheEntries.clear();
    },
  });
};
`;

/** Generates the standalone projection that reads provider-projected runtime assets. */
export const createWorkspaceStandaloneDataRuntimeModule = (
  workspace: WorkspaceSnapshot,
  dataRuntimeTarget: WorkspaceDataRuntimeTarget = STATIC_CLIENT_DATA_RUNTIME_TARGET
): ExportModule => ({
  id: WORKSPACE_DATA_RUNTIME_MODULE_ID,
  kind: 'runtime-helper',
  suggestedName: 'prodivixDataRuntime',
  desiredPath: 'src/prodivix-data-runtime.ts',
  language: 'ts',
  imports: [
    {
      kind: 'default',
      source: 'ajv/dist/2020.js',
      imported: 'Ajv2020',
      local: 'Ajv2020',
    },
  ],
  body: source(workspace, dataRuntimeTarget),
  sourceTrace: Object.values(workspace.docsById)
    .filter((document) => document.type === 'data-source')
    .sort((left, right) => compareText(left.id, right.id))
    .map((document) => ({
      sourceRef: {
        domain: 'workspace-document' as const,
        id: document.id,
        path: document.path,
      },
    })),
  origin: {
    kind: 'generated',
    owner: 'prodivix',
    writePolicy: 'generated',
    updatePolicy: 'regenerate',
  },
});
