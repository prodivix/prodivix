import {
  createExecutionNetworkTrace,
  RUNTIME_ZONES,
  type ExecutionEnvironmentSnapshotRef,
  type ExecutionNetworkCorrelation,
  type ExecutionNetworkTrace,
  type ExecutionSourceTrace,
  type RuntimeZone,
} from '@prodivix/runtime-core';
import type {
  DataJsonValue,
  DataLifecycleSnapshot,
  DataOperation,
  DataOperationKind,
  DataOperationReference,
  DataPageSnapshot,
  DataSourceDefinition,
} from './data.types';
import { DATA_OPERATION_KINDS } from './data.types';
import { createDataLifecycleSnapshot } from './dataDocument';

export const DATA_OPERATION_ACTIVATIONS = Object.freeze([
  'document',
  'route',
  'refresh',
  'input-change',
  'pagination',
  'event',
  'test',
] as const);
export type DataOperationActivation =
  (typeof DATA_OPERATION_ACTIVATIONS)[number];

export type DataOperationInvocation = Readonly<{
  invocationId: string;
  sequence: number;
  attempt: number;
  startedAt: number;
  operation: DataOperationReference;
  documentRevision: string;
  runtimeZone: RuntimeZone;
  mode: 'mock' | 'live';
  activation: DataOperationActivation;
  input: DataJsonValue;
  environment?: ExecutionEnvironmentSnapshotRef;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type DataOperationAbortSignal = Readonly<{
  aborted: boolean;
  reason?: unknown;
  addEventListener(
    type: 'abort',
    listener: () => void,
    options?: Readonly<{ once?: boolean }>
  ): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}>;

export type DataOperationAdapterDescriptor = Readonly<{
  id: string;
  version: string;
  emulatedAdapterIds?: readonly string[];
  operationKinds: readonly DataOperationKind[];
  runtimeZones: readonly RuntimeZone[];
  modes: readonly ('mock' | 'live')[];
  capabilities: readonly ('network' | 'environment-binding')[];
}>;

export type DataOperationAdapterInput = Readonly<{
  invocation: DataOperationInvocation;
  source: DataSourceDefinition;
  operation: DataOperation;
  signal: DataOperationAbortSignal;
  publishNetworkTrace(trace: ExecutionNetworkTrace): void;
}>;

export type DataOperationAdapterResult = Readonly<{
  value: DataJsonValue;
  empty: boolean;
  page?: DataPageSnapshot;
}>;

export type DataOperationAdapter = Readonly<{
  descriptor: DataOperationAdapterDescriptor;
  invoke(input: DataOperationAdapterInput): Promise<DataOperationAdapterResult>;
}>;

export type DataOperationAdapterRegistry = Readonly<{
  register(adapter: DataOperationAdapter): () => void;
  resolve(
    adapterId: string,
    invocation: DataOperationInvocation,
    operation: DataOperation
  ): DataOperationAdapter;
  list(): readonly DataOperationAdapterDescriptor[];
}>;

export type ExecuteDataOperationInput = Readonly<{
  registry: DataOperationAdapterRegistry;
  invocation: DataOperationInvocation;
  source: DataSourceDefinition;
  operation: DataOperation;
  signal: DataOperationAbortSignal;
  now?: () => number;
  publishLifecycle?(snapshot: DataLifecycleSnapshot): void;
  publishNetworkTrace?(trace: ExecutionNetworkTrace): void;
}>;

export type ExecuteDataOperationResult = Readonly<{
  result: DataOperationAdapterResult;
  lifecycle: DataLifecycleSnapshot;
  networkTraces: readonly ExecutionNetworkTrace[];
}>;

const normalized = (value: string, label: string): string => {
  const result = value.trim();
  if (!result || result !== value || result.length > 4_096)
    throw new TypeError(`${label} must be a normalized string.`);
  return result;
};

const cloneDataJsonValue = (value: DataJsonValue): DataJsonValue => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return Object.freeze(value.map((entry) => cloneDataJsonValue(entry)));
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, cloneDataJsonValue(entry)])
    )
  );
};

export const createDataOperationInvocation = (
  input: DataOperationInvocation
): DataOperationInvocation => {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0)
    throw new TypeError('Data invocation sequence must be non-negative.');
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1)
    throw new TypeError('Data invocation attempt must be positive.');
  if (!DATA_OPERATION_ACTIVATIONS.includes(input.activation))
    throw new TypeError('Data invocation activation is unsupported.');
  if (!(RUNTIME_ZONES as readonly RuntimeZone[]).includes(input.runtimeZone))
    throw new TypeError('Data invocation runtime zone is unsupported.');
  if (input.mode !== 'mock' && input.mode !== 'live')
    throw new TypeError('Data invocation mode is unsupported.');
  return Object.freeze({
    invocationId: normalized(input.invocationId, 'Data invocationId'),
    sequence: input.sequence,
    attempt: input.attempt,
    startedAt: safeNonNegativeInteger(
      input.startedAt,
      'Data invocation startedAt'
    ),
    operation: Object.freeze({
      documentId: normalized(
        input.operation.documentId,
        'Data operation documentId'
      ),
      operationId: normalized(
        input.operation.operationId,
        'Data operation operationId'
      ),
    }),
    documentRevision: normalized(
      input.documentRevision,
      'Data document revision'
    ),
    runtimeZone: input.runtimeZone,
    mode: input.mode,
    activation: input.activation,
    input: cloneDataJsonValue(input.input),
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.sourceTrace
      ? { sourceTrace: Object.freeze([...input.sourceTrace]) }
      : {}),
  });
};

export const createDataNetworkCorrelation = (
  invocation: DataOperationInvocation
): ExecutionNetworkCorrelation =>
  Object.freeze({
    kind: 'data-operation',
    documentId: invocation.operation.documentId,
    operationId: invocation.operation.operationId,
    invocationId: invocation.invocationId,
    sequence: invocation.sequence,
    attempt: invocation.attempt,
  });

export const createDataOperationNetworkTrace = (
  invocation: DataOperationInvocation,
  input: Omit<
    ExecutionNetworkTrace,
    | 'format'
    | 'durationMs'
    | 'redacted'
    | 'runtimeZone'
    | 'mode'
    | 'correlation'
    | 'sourceTrace'
  >
): ExecutionNetworkTrace =>
  createExecutionNetworkTrace({
    ...input,
    runtimeZone: invocation.runtimeZone,
    mode: invocation.mode,
    correlation: createDataNetworkCorrelation(invocation),
    ...(invocation.sourceTrace ? { sourceTrace: invocation.sourceTrace } : {}),
  });

const descriptor = (
  value: DataOperationAdapterDescriptor
): DataOperationAdapterDescriptor => {
  if (
    !value.operationKinds.length ||
    !value.runtimeZones.length ||
    !value.modes.length
  )
    throw new TypeError(
      'Data adapter descriptor support sets must not be empty.'
    );
  const id = normalized(value.id, 'Data adapter id');
  const emulatedAdapterIds = Object.freeze(
    [...new Set(value.emulatedAdapterIds ?? [])]
      .map((adapterId) => normalized(adapterId, 'Emulated Data adapter id'))
      .sort()
  );
  if (emulatedAdapterIds.includes(id))
    throw new TypeError('Data adapter cannot emulate itself.');
  if (
    emulatedAdapterIds.length &&
    (value.modes.length !== 1 || value.modes[0] !== 'mock')
  )
    throw new TypeError('Data adapter emulation is restricted to mock mode.');
  const operationKinds = Object.freeze([...new Set(value.operationKinds)]);
  const runtimeZones = Object.freeze([...new Set(value.runtimeZones)]);
  const modes = Object.freeze([...new Set(value.modes)]);
  const capabilities = Object.freeze([...new Set(value.capabilities)]);
  if (
    operationKinds.some(
      (kind) =>
        !(DATA_OPERATION_KINDS as readonly DataOperationKind[]).includes(kind)
    )
  )
    throw new TypeError('Data adapter operation kind is unsupported.');
  if (
    runtimeZones.some(
      (zone) => !(RUNTIME_ZONES as readonly RuntimeZone[]).includes(zone)
    )
  )
    throw new TypeError('Data adapter runtime zone is unsupported.');
  if (modes.some((mode) => mode !== 'mock' && mode !== 'live'))
    throw new TypeError('Data adapter mode is unsupported.');
  if (
    capabilities.some(
      (capability) =>
        capability !== 'network' && capability !== 'environment-binding'
    )
  )
    throw new TypeError('Data adapter capability is unsupported.');
  return Object.freeze({
    id,
    version: normalized(value.version, 'Data adapter version'),
    ...(emulatedAdapterIds.length ? { emulatedAdapterIds } : {}),
    operationKinds: Object.freeze([...operationKinds].sort()),
    runtimeZones: Object.freeze([...runtimeZones].sort()),
    modes: Object.freeze([...modes].sort()),
    capabilities: Object.freeze([...capabilities].sort()),
  });
};

const safeNonNegativeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  return value;
};

/** Owns protocol-neutral adapter compatibility and rejects implicit fallback. */
export const createDataOperationAdapterRegistry =
  (): DataOperationAdapterRegistry => {
    const adapters = new Map<string, DataOperationAdapter>();
    return Object.freeze({
      register(adapter) {
        if (typeof adapter.invoke !== 'function')
          throw new TypeError('Data adapter invoke must be a function.');
        const normalizedDescriptor = descriptor(adapter.descriptor);
        if (adapters.has(normalizedDescriptor.id))
          throw new TypeError(
            `Duplicate Data adapter: ${normalizedDescriptor.id}.`
          );
        const registered = Object.freeze({
          descriptor: normalizedDescriptor,
          invoke: adapter.invoke,
        });
        adapters.set(normalizedDescriptor.id, registered);
        return () => {
          if (adapters.get(normalizedDescriptor.id) === registered)
            adapters.delete(normalizedDescriptor.id);
        };
      },
      resolve(adapterId, invocation, operation) {
        const candidates = [...adapters.values()].filter(
          (adapter) =>
            adapter.descriptor.id === adapterId ||
            adapter.descriptor.emulatedAdapterIds?.includes(adapterId)
        );
        if (!candidates.length)
          throw new Error(`Data adapter is not registered: ${adapterId}.`);
        const compatible = candidates.filter(
          (adapter) =>
            adapter.descriptor.operationKinds.includes(operation.kind) &&
            adapter.descriptor.runtimeZones.includes(invocation.runtimeZone) &&
            adapter.descriptor.modes.includes(invocation.mode) &&
            (!invocation.environment ||
              adapter.descriptor.capabilities.includes('environment-binding'))
        );
        if (compatible.length > 1)
          throw new Error(
            `Data adapter resolution is ambiguous for ${adapterId} in ${invocation.mode} mode.`
          );
        if (compatible.length === 1) return compatible[0];
        const adapter =
          candidates.find(({ descriptor }) => descriptor.id === adapterId) ??
          candidates[0];
        if (!adapter.descriptor.operationKinds.includes(operation.kind))
          throw new Error(
            `Data adapter ${adapterId} does not support ${operation.kind}.`
          );
        if (!adapter.descriptor.runtimeZones.includes(invocation.runtimeZone))
          throw new Error(
            `Data adapter ${adapterId} does not support runtime zone ${invocation.runtimeZone}.`
          );
        if (!adapter.descriptor.modes.includes(invocation.mode))
          throw new Error(
            `Data adapter ${adapterId} does not support ${invocation.mode} mode.`
          );
        if (
          invocation.environment &&
          !adapter.descriptor.capabilities.includes('environment-binding')
        )
          throw new Error(
            `Data adapter ${adapterId} cannot bind an environment.`
          );
        throw new Error(
          `Data adapter ${adapterId} has no compatible implementation.`
        );
      },
      list: () =>
        Object.freeze(
          [...adapters.values()]
            .map((adapter) => adapter.descriptor)
            .sort((left, right) => left.id.localeCompare(right.id))
        ),
    });
  };

/** Executes through the registered adapter and fences every Network trace to the exact invocation identity. */
export const executeDataOperation = async (
  input: ExecuteDataOperationInput
): Promise<ExecuteDataOperationResult> => {
  if (input.operation.id !== input.invocation.operation.operationId)
    throw new Error(
      'Data runtime operation identity does not match invocation.'
    );
  if (input.source.runtimeZone !== input.invocation.runtimeZone)
    throw new Error('Data source runtime zone does not match invocation.');
  const adapter = input.registry.resolve(
    input.source.adapterId,
    input.invocation,
    input.operation
  );
  const expectedCorrelation = createDataNetworkCorrelation(input.invocation);
  const networkTraces: ExecutionNetworkTrace[] = [];
  const loading = createDataLifecycleSnapshot({
    operation: input.invocation.operation,
    sequence: input.invocation.sequence,
    status: 'loading',
    invocationId: input.invocation.invocationId,
    attempt: input.invocation.attempt,
    startedAt: input.invocation.startedAt,
  });
  input.publishLifecycle?.(loading);
  try {
    const result = await adapter.invoke({
      invocation: input.invocation,
      source: input.source,
      operation: input.operation,
      signal: input.signal,
      publishNetworkTrace(trace) {
        if (
          JSON.stringify(trace.correlation) !==
            JSON.stringify(expectedCorrelation) ||
          trace.runtimeZone !== input.invocation.runtimeZone ||
          trace.mode !== input.invocation.mode ||
          trace.phase !== 'runtime' ||
          trace.adapter !== input.source.adapterId ||
          JSON.stringify(trace.sourceTrace ?? []) !==
            JSON.stringify(input.invocation.sourceTrace ?? [])
        )
          throw new Error(
            'Data adapter published a Network trace with correlation drift.'
          );
        networkTraces.push(trace);
        input.publishNetworkTrace?.(trace);
      },
    });
    const completedAt = Math.max(
      input.invocation.startedAt,
      (input.now ?? Date.now)()
    );
    const lifecycle = createDataLifecycleSnapshot(
      result.empty
        ? {
            operation: input.invocation.operation,
            sequence: input.invocation.sequence,
            status: 'empty' as const,
            invocationId: input.invocation.invocationId,
            attempt: input.invocation.attempt,
            startedAt: input.invocation.startedAt,
            completedAt,
            ...(result.page ? { page: result.page } : {}),
          }
        : {
            operation: input.invocation.operation,
            sequence: input.invocation.sequence,
            status: 'success' as const,
            invocationId: input.invocation.invocationId,
            attempt: input.invocation.attempt,
            startedAt: input.invocation.startedAt,
            completedAt,
            value: result.value,
            ...(result.page ? { page: result.page } : {}),
          }
    );
    input.publishLifecycle?.(lifecycle);
    return Object.freeze({
      result,
      lifecycle,
      networkTraces: Object.freeze(networkTraces),
    });
  } catch (error) {
    if (input.signal.aborted) throw error;
    const candidate = error as {
      code?: unknown;
      retryable?: unknown;
    };
    const completedAt = Math.max(
      input.invocation.startedAt,
      (input.now ?? Date.now)()
    );
    const lifecycle = createDataLifecycleSnapshot({
      operation: input.invocation.operation,
      sequence: input.invocation.sequence,
      status: 'error',
      invocationId: input.invocation.invocationId,
      attempt: input.invocation.attempt,
      startedAt: input.invocation.startedAt,
      completedAt,
      error: {
        code:
          typeof candidate.code === 'string'
            ? candidate.code
            : 'DATA_OPERATION_FAILED',
        message: 'Data operation failed.',
        retryable: candidate.retryable === true,
      },
    });
    input.publishLifecycle?.(lifecycle);
    throw error;
  }
};
