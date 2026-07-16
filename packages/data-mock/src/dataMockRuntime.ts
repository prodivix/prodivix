import type {
  DataJsonValue,
  DataOperationAdapterResult,
  DataOperationAbortSignal,
  DataOperationAdapter,
  DataOperationInvocation,
  DataOperationKind,
  DataOperationReference,
  DataPageSnapshot,
} from '@prodivix/data';
import type {
  ExecutableProjectSnapshot,
  RuntimeZone,
} from '@prodivix/runtime-core';

export const DATA_MOCK_ADAPTER_ID = 'prodivix.data.mock.fixture';
const DEFAULT_DATA_MOCK_RUNTIME_ZONES: readonly RuntimeZone[] = Object.freeze([
  'client',
  'server',
  'edge',
  'test',
]);

export type DataMockFixtureReference = Readonly<{
  fixtureSetId: string;
  fixtureId: string;
}>;

export type DataMockFixtureBehavior =
  | Readonly<{
      kind: 'result';
      value: DataJsonValue;
      empty: boolean;
      page?: DataPageSnapshot;
      delayMs?: number;
    }>
  | Readonly<{
      kind: 'error';
      code: string;
      retryable: boolean;
      delayMs?: number;
    }>
  | Readonly<{
      kind: 'crud';
      collectionId: string;
      action: 'list' | 'get' | 'create' | 'update' | 'delete';
      idInputKey?: string;
      valueInputKey?: string;
      delayMs?: number;
    }>;

export type DataMockCollection = Readonly<{
  id: string;
  entityIdKey: string;
  initialEntities: readonly Readonly<Record<string, DataJsonValue>>[];
}>;

export type DataMockFixture = Readonly<{
  id: string;
  operation: DataOperationReference;
  operationKind: DataOperationKind;
  input?: DataJsonValue;
  behavior: DataMockFixtureBehavior;
}>;

export type DataMockFixtureStore = Readonly<{
  resolve(
    invocation: DataOperationInvocation,
    operationKind: DataOperationKind
  ):
    | Readonly<{
        reference: DataMockFixtureReference;
        behavior: DataMockFixtureBehavior;
      }>
    | undefined;
}>;

export type MemoryDataMockFixtureStoreOptions = Readonly<{
  fixtureSetId: string;
  fixtures: readonly DataMockFixture[];
}>;

export type DataMockScheduler = Readonly<{
  wait(delayMs: number, signal: DataOperationAbortSignal): Promise<void>;
}>;

export type CreateDataMockRuntimeSessionOptions = Readonly<{
  fixtureStore: DataMockFixtureStore;
  emulatedAdapterIds: readonly string[];
  scheduler?: DataMockScheduler;
  runtimeZones?: readonly RuntimeZone[];
  namespaceId?: string;
  collections?: readonly DataMockCollection[];
}>;

export type CreateDataMockRuntimeSessionFromSnapshotOptions = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  scheduler?: DataMockScheduler;
  runtimeZones?: readonly RuntimeZone[];
  namespaceId?: string;
}>;

export type DataMockRuntimeSession = Readonly<{
  adapter: DataOperationAdapter;
  namespaceId?: string;
  reset(): void;
  dispose(): void;
  isDisposed(): boolean;
}>;

const normalized = (value: string, label: string): string => {
  const result = value.trim();
  if (!result || result !== value || result.length > 4_096)
    throw new TypeError(`${label} must be a normalized string.`);
  return result;
};

const delay = (value: number | undefined): number => {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value > 60_000)
    throw new TypeError('Data mock delay must be between 0 and 60000ms.');
  return value;
};

const cloneJson = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): DataJsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Data mock JSON numbers must be finite.');
    return value;
  }
  if (typeof value !== 'object')
    throw new TypeError('Data mock value must be JSON-compatible.');
  if (seen.has(value))
    throw new TypeError('Data mock value must not contain cycles.');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = Object.freeze(value.map((entry) => cloneJson(entry, seen)));
    seen.delete(value);
    return result;
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new TypeError('Data mock value must use plain JSON objects.');
  const result = Object.freeze(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, cloneJson(entry, seen)])
    )
  ) as Record<string, DataJsonValue>;
  seen.delete(value);
  return result;
};

const jsonIdentity = (value: DataJsonValue): string =>
  JSON.stringify(cloneJson(value));

const fixtureIdentity = (
  fixture: DataMockFixture,
  documentId: string,
  operationId: string
): string =>
  JSON.stringify([
    documentId,
    operationId,
    fixture.operationKind,
    fixture.input === undefined ? '*' : jsonIdentity(fixture.input),
  ]);

const normalizePage = (
  page: DataPageSnapshot | undefined
): DataPageSnapshot | undefined => {
  if (!page) return undefined;
  if (page.kind === 'offset') {
    if (
      !Number.isSafeInteger(page.offset) ||
      page.offset < 0 ||
      !Number.isSafeInteger(page.limit) ||
      page.limit < 1 ||
      typeof page.hasMore !== 'boolean' ||
      (page.total !== undefined &&
        (!Number.isSafeInteger(page.total) || page.total < 0))
    )
      throw new TypeError('Data mock offset page is invalid.');
    return Object.freeze({ ...page });
  }
  if (
    typeof page.hasMore !== 'boolean' ||
    (page.nextCursor !== undefined && !page.nextCursor) ||
    (page.previousCursor !== undefined && !page.previousCursor)
  )
    throw new TypeError('Data mock cursor page is invalid.');
  return Object.freeze({ ...page });
};

const normalizeBehavior = (
  behavior: DataMockFixtureBehavior
): DataMockFixtureBehavior => {
  const delayMs = delay(behavior.delayMs);
  if (behavior.kind === 'error') {
    if (typeof behavior.retryable !== 'boolean')
      throw new TypeError('Data mock error retryable must be a boolean.');
    return Object.freeze({
      kind: behavior.kind,
      code: normalized(behavior.code, 'Data mock error code'),
      retryable: behavior.retryable,
      ...(delayMs ? { delayMs } : {}),
    });
  }
  if (behavior.kind === 'crud') {
    const collectionId = normalized(
      behavior.collectionId,
      'Data mock CRUD collection id'
    );
    if (
      behavior.action !== 'list' &&
      behavior.action !== 'get' &&
      behavior.action !== 'create' &&
      behavior.action !== 'update' &&
      behavior.action !== 'delete'
    )
      throw new TypeError('Data mock CRUD action is unsupported.');
    const requiresId =
      behavior.action === 'get' ||
      behavior.action === 'update' ||
      behavior.action === 'delete';
    const requiresValue =
      behavior.action === 'create' || behavior.action === 'update';
    if (requiresId !== (behavior.idInputKey !== undefined))
      throw new TypeError(
        'Data mock CRUD idInputKey must be present exactly for get/update/delete.'
      );
    if (requiresValue !== (behavior.valueInputKey !== undefined))
      throw new TypeError(
        'Data mock CRUD valueInputKey must be present exactly for create/update.'
      );
    return Object.freeze({
      kind: behavior.kind,
      collectionId,
      action: behavior.action,
      ...(requiresId
        ? {
            idInputKey: normalized(
              behavior.idInputKey!,
              'Data mock CRUD id input key'
            ),
          }
        : {}),
      ...(requiresValue
        ? {
            valueInputKey: normalized(
              behavior.valueInputKey!,
              'Data mock CRUD value input key'
            ),
          }
        : {}),
      ...(delayMs ? { delayMs } : {}),
    });
  }
  if (behavior.kind !== 'result')
    throw new TypeError('Data mock fixture behavior is unsupported.');
  if (typeof behavior.empty !== 'boolean')
    throw new TypeError('Data mock result empty must be a boolean.');
  const page = normalizePage(behavior.page);
  return Object.freeze({
    kind: behavior.kind,
    value: cloneJson(behavior.value),
    empty: behavior.empty,
    ...(page ? { page } : {}),
    ...(delayMs ? { delayMs } : {}),
  });
};

/** Builds an immutable fixture index with exact-input precedence and no ambiguous fallbacks. */
export const createMemoryDataMockFixtureStore = (
  options: MemoryDataMockFixtureStoreOptions
): DataMockFixtureStore => {
  const fixtureSetId = normalized(options.fixtureSetId, 'Data fixture set id');
  const byIdentity = new Map<
    string,
    Readonly<{
      reference: DataMockFixtureReference;
      behavior: DataMockFixtureBehavior;
    }>
  >();
  const fixtureIds = new Set<string>();
  for (const fixture of options.fixtures) {
    const fixtureId = normalized(fixture.id, 'Data fixture id');
    if (fixtureIds.has(fixtureId))
      throw new TypeError(`Duplicate Data fixture id: ${fixtureId}.`);
    fixtureIds.add(fixtureId);
    const documentId = normalized(
      fixture.operation.documentId,
      'Data fixture document id'
    );
    const operationId = normalized(
      fixture.operation.operationId,
      'Data fixture operation id'
    );
    if (
      fixture.operationKind !== 'query' &&
      fixture.operationKind !== 'mutation'
    )
      throw new TypeError('Data fixture operation kind is unsupported.');
    const identity = fixtureIdentity(fixture, documentId, operationId);
    if (byIdentity.has(identity))
      throw new TypeError('Ambiguous Data fixtures have the same match key.');
    byIdentity.set(
      identity,
      Object.freeze({
        reference: Object.freeze({ fixtureSetId, fixtureId }),
        behavior: normalizeBehavior(fixture.behavior),
      })
    );
  }
  return Object.freeze({
    resolve(invocation, operationKind) {
      const exact = JSON.stringify([
        invocation.operation.documentId,
        invocation.operation.operationId,
        operationKind,
        jsonIdentity(invocation.input),
      ]);
      const fallback = JSON.stringify([
        invocation.operation.documentId,
        invocation.operation.operationId,
        operationKind,
        '*',
      ]);
      return byIdentity.get(exact) ?? byIdentity.get(fallback);
    },
  });
};

export const createSystemDataMockScheduler = (): DataMockScheduler =>
  Object.freeze({
    wait(delayMs, signal) {
      if (!delayMs) return Promise.resolve();
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }, delayMs);
        const onAbort = () => {
          globalThis.clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          reject(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  });

export class DataMockRuntimeError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fixture?: DataMockFixtureReference;

  constructor(input: {
    code: string;
    retryable: boolean;
    fixture?: DataMockFixtureReference;
  }) {
    super('Data mock operation failed.');
    this.name = 'DataMockRuntimeError';
    this.code = input.code;
    this.retryable = input.retryable;
    this.fixture = input.fixture;
  }
}

type DataMockCollectionState = {
  entityIdKey: string;
  initialEntities: readonly Readonly<Record<string, DataJsonValue>>[];
  entities: Readonly<Record<string, DataJsonValue>>[];
};

const jsonObject = (
  value: DataJsonValue,
  code: string
): Readonly<Record<string, DataJsonValue>> => {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new DataMockRuntimeError({ code, retryable: false });
  return value as Readonly<Record<string, DataJsonValue>>;
};

const entityIdentity = (value: DataJsonValue | undefined): string => {
  if (
    (typeof value !== 'string' || !value) &&
    (typeof value !== 'number' || !Number.isFinite(value))
  )
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_ENTITY_ID_INVALID',
      retryable: false,
    });
  return JSON.stringify(value);
};

const createCollectionStates = (
  collections: readonly DataMockCollection[]
): Map<string, DataMockCollectionState> => {
  const states = new Map<string, DataMockCollectionState>();
  collections.forEach((collection) => {
    const id = normalized(collection.id, 'Data mock collection id');
    if (states.has(id))
      throw new TypeError(`Duplicate Data mock collection: ${id}.`);
    const entityIdKey = normalized(
      collection.entityIdKey,
      'Data mock collection entity id key'
    );
    const identities = new Set<string>();
    const initialEntities = Object.freeze(
      collection.initialEntities.map((value) => {
        const entity = jsonObject(cloneJson(value), 'DATA_MOCK_ENTITY_INVALID');
        const identity = entityIdentity(entity[entityIdKey]);
        if (identities.has(identity))
          throw new TypeError(
            `Data mock collection ${id} contains duplicate entity identities.`
          );
        identities.add(identity);
        return entity;
      })
    );
    states.set(id, {
      entityIdKey,
      initialEntities,
      entities: [...initialEntities],
    });
  });
  return states;
};

const resetCollectionStates = (
  states: Map<string, DataMockCollectionState>
): void => {
  states.forEach((state) => {
    state.entities = [...state.initialEntities];
  });
};

const executeCrudBehavior = (
  behavior: Extract<DataMockFixtureBehavior, { kind: 'crud' }>,
  invocation: DataOperationInvocation,
  operationKind: DataOperationKind,
  states: ReadonlyMap<string, DataMockCollectionState>
): DataOperationAdapterResult => {
  const state = states.get(behavior.collectionId);
  if (!state)
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_COLLECTION_MISSING',
      retryable: false,
    });
  const expectedKind =
    behavior.action === 'list' || behavior.action === 'get'
      ? 'query'
      : 'mutation';
  if (operationKind !== expectedKind)
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_CRUD_OPERATION_KIND_MISMATCH',
      retryable: false,
    });
  const input = jsonObject(invocation.input, 'DATA_MOCK_CRUD_INPUT_INVALID');
  const inputValue = (key: string): DataJsonValue => {
    const value = input[key];
    if (value === undefined)
      throw new DataMockRuntimeError({
        code: 'DATA_MOCK_CRUD_INPUT_MISSING',
        retryable: false,
      });
    return value;
  };
  if (behavior.action === 'list') {
    const value = cloneJson(state.entities);
    return Object.freeze({ value, empty: state.entities.length === 0 });
  }
  const id = behavior.idInputKey
    ? entityIdentity(inputValue(behavior.idInputKey))
    : undefined;
  if (behavior.action === 'get') {
    const entity = state.entities.find(
      (candidate) => entityIdentity(candidate[state.entityIdKey]) === id
    );
    return entity
      ? Object.freeze({ value: cloneJson(entity), empty: false })
      : Object.freeze({ value: null, empty: true });
  }
  if (behavior.action === 'create') {
    const entity = jsonObject(
      cloneJson(inputValue(behavior.valueInputKey!)),
      'DATA_MOCK_ENTITY_INVALID'
    );
    const entityId = entityIdentity(entity[state.entityIdKey]);
    if (
      state.entities.some(
        (candidate) => entityIdentity(candidate[state.entityIdKey]) === entityId
      )
    )
      throw new DataMockRuntimeError({
        code: 'DATA_MOCK_ENTITY_CONFLICT',
        retryable: false,
      });
    state.entities.push(entity);
    return Object.freeze({ value: cloneJson(entity), empty: false });
  }
  const index = state.entities.findIndex(
    (candidate) => entityIdentity(candidate[state.entityIdKey]) === id
  );
  if (index < 0)
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_ENTITY_NOT_FOUND',
      retryable: false,
    });
  const current = state.entities[index]!;
  if (behavior.action === 'delete') {
    state.entities.splice(index, 1);
    return Object.freeze({ value: cloneJson(current), empty: false });
  }
  const patch = jsonObject(
    cloneJson(inputValue(behavior.valueInputKey!)),
    'DATA_MOCK_ENTITY_INVALID'
  );
  if (
    patch[state.entityIdKey] !== undefined &&
    entityIdentity(patch[state.entityIdKey]) !== id
  )
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_ENTITY_ID_IMMUTABLE',
      retryable: false,
    });
  const updated = Object.freeze({
    ...current,
    ...patch,
    [state.entityIdKey]: current[state.entityIdKey]!,
  });
  state.entities[index] = updated;
  return Object.freeze({ value: cloneJson(updated), empty: false });
};

/** Owns one isolated mock runtime lifetime; disposal fences all later invocations. */
export const createDataMockRuntimeSession = (
  options: CreateDataMockRuntimeSessionOptions
): DataMockRuntimeSession => {
  const emulatedAdapterIds = Object.freeze(
    [...new Set(options.emulatedAdapterIds)].map((id) =>
      normalized(id, 'Emulated Data adapter id')
    )
  );
  if (!emulatedAdapterIds.length)
    throw new TypeError('Data mock runtime must emulate at least one adapter.');
  const runtimeZones: readonly RuntimeZone[] = Object.freeze([
    ...new Set<RuntimeZone>(
      options.runtimeZones ?? DEFAULT_DATA_MOCK_RUNTIME_ZONES
    ),
  ]);
  const scheduler = options.scheduler ?? createSystemDataMockScheduler();
  const collections = options.collections ?? [];
  const namespaceId =
    options.namespaceId === undefined
      ? undefined
      : normalized(options.namespaceId, 'Data mock namespace id');
  if (collections.length && !namespaceId)
    throw new TypeError(
      'Stateful Data mock collections require an explicit session namespace.'
    );
  const collectionStates = createCollectionStates(collections);
  let disposed = false;
  const adapter: DataOperationAdapter = Object.freeze({
    descriptor: Object.freeze({
      id: DATA_MOCK_ADAPTER_ID,
      version: '1',
      emulatedAdapterIds,
      operationKinds: Object.freeze(['query', 'mutation'] as const),
      runtimeZones,
      modes: Object.freeze(['mock'] as const),
      capabilities: Object.freeze([] as const),
    }),
    async invoke(input) {
      if (disposed)
        throw new DataMockRuntimeError({
          code: 'DATA_MOCK_RUNTIME_DISPOSED',
          retryable: false,
        });
      const resolved = options.fixtureStore.resolve(
        input.invocation,
        input.operation.kind
      );
      if (!resolved)
        throw new DataMockRuntimeError({
          code: 'DATA_MOCK_FIXTURE_MISSING',
          retryable: false,
        });
      await scheduler.wait(resolved.behavior.delayMs ?? 0, input.signal);
      if (input.signal.aborted) throw input.signal.reason;
      if (resolved.behavior.kind === 'error')
        throw new DataMockRuntimeError({
          code: resolved.behavior.code,
          retryable: resolved.behavior.retryable,
          fixture: resolved.reference,
        });
      if (resolved.behavior.kind === 'crud')
        return executeCrudBehavior(
          resolved.behavior,
          input.invocation,
          input.operation.kind,
          collectionStates
        );
      return Object.freeze({
        value: cloneJson(resolved.behavior.value),
        empty: resolved.behavior.empty,
        ...(resolved.behavior.page ? { page: resolved.behavior.page } : {}),
      });
    },
  });
  return Object.freeze({
    adapter,
    ...(namespaceId ? { namespaceId } : {}),
    reset() {
      if (disposed)
        throw new DataMockRuntimeError({
          code: 'DATA_MOCK_RUNTIME_DISPOSED',
          retryable: false,
        });
      resetCollectionStates(collectionStates);
    },
    dispose() {
      disposed = true;
      collectionStates.clear();
    },
    isDisposed: () => disposed,
  });
};

/** Resolves the exact content-addressed fixture provision shared by Browser and Remote snapshot codecs. */
export const createDataMockRuntimeSessionFromSnapshot = (
  options: CreateDataMockRuntimeSessionFromSnapshotOptions
): DataMockRuntimeSession => {
  const provision = options.snapshot.dataMockProvision;
  if (!provision)
    throw new DataMockRuntimeError({
      code: 'DATA_MOCK_PROVISION_MISSING',
      retryable: false,
    });
  return createDataMockRuntimeSession({
    fixtureStore: createMemoryDataMockFixtureStore({
      fixtureSetId: provision.fixtureSetId,
      fixtures: provision.fixtures.map((fixture) =>
        Object.freeze({
          id: fixture.id,
          operation: Object.freeze({
            documentId: fixture.documentId,
            operationId: fixture.operationId,
          }),
          operationKind: fixture.operationKind,
          ...(fixture.input === undefined
            ? {}
            : { input: fixture.input as DataJsonValue }),
          behavior: fixture.behavior as DataMockFixtureBehavior,
        })
      ),
    }),
    emulatedAdapterIds: provision.emulatedAdapterIds,
    ...(provision.collections
      ? {
          collections: provision.collections as readonly DataMockCollection[],
          namespaceId: options.namespaceId,
        }
      : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    ...(options.runtimeZones ? { runtimeZones: options.runtimeZones } : {}),
  });
};
