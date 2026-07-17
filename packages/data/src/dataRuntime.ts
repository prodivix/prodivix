import {
  createExecutionNetworkTrace,
  RUNTIME_ZONES,
  type ExecutionEnvironmentSnapshotRef,
  type ExecutionEnvironmentResolutionLease,
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
  DataSourceDocument,
} from './data.types';
import type { DataOperationTriggerOrigin } from './dataDispatchRuntime';
import { DATA_OPERATION_KINDS } from './data.types';
import {
  createDataOperationCachePlan,
  type DataOperationCacheResultMetadata,
  type DataOperationCacheRuntime,
} from './dataCacheRuntime';
import { createDataLifecycleSnapshot } from './dataDocument';
import {
  resolveDataOperationEnvironment,
  type DataOperationEnvironmentResolution,
} from './dataEnvironmentRuntime';
import { cloneDataJsonValue } from './dataJsonRuntime';
import {
  DATA_INVOCATION_ERROR_CODES,
  DataInvocationError,
  type DataLifecycleChannel,
} from './dataLifecycleChannel';
import {
  createDataOptimisticCrudPlan,
  type DataOptimisticCrudPlan,
  type DataOptimisticProjectionSnapshot,
  type DataOptimisticResultMetadata,
  type DataOptimisticRuntime,
} from './dataOptimisticRuntime';
import {
  applyDataPaginationInput,
  calculateDataRetryDelay,
  DATA_RETRY_RUNTIME_ERROR_CODES,
  DataRetryRuntimeError,
  defaultDataOperationScheduler,
  resolveDataRetryPolicy,
  validateDataPaginationPage,
  type DataOperationScheduler,
} from './dataPolicyRuntime';
import {
  defaultDataSchemaValidator,
  type DataSchemaValidationIssue,
  type DataSchemaValidator,
} from './dataSchemaValidator';

export const DATA_OPERATION_ACTIVATIONS = Object.freeze([
  'document',
  'route',
  'refresh',
  'input-change',
  'pagination',
  'event',
  'code-slot',
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
  trigger?: DataOperationTriggerOrigin;
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
  capabilities: readonly (
    'network' | 'environment-binding' | 'idempotency-key'
  )[];
}>;

export type DataOperationAdapterInput = Readonly<{
  invocation: DataOperationInvocation;
  source: DataSourceDefinition;
  operation: DataOperation;
  environment?: ExecutionEnvironmentResolutionLease;
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
  document: DataSourceDocument;
  lifecycleChannel: DataLifecycleChannel;
  signal: DataOperationAbortSignal;
  cache?: DataOperationCacheRuntime;
  optimistic?: DataOptimisticRuntime;
  environmentResolution?: DataOperationEnvironmentResolution;
  schemaValidator?: DataSchemaValidator;
  scheduler?: DataOperationScheduler;
  now?: () => number;
  publishLifecycle?(snapshot: DataLifecycleSnapshot): void;
  publishOptimistic?(snapshot: DataOptimisticProjectionSnapshot): void;
  publishNetworkTrace?(trace: ExecutionNetworkTrace): void;
}>;

export type ExecuteDataOperationResult = Readonly<{
  result: DataOperationAdapterResult;
  lifecycle: DataLifecycleSnapshot;
  networkTraces: readonly ExecutionNetworkTrace[];
  cache: DataOperationCacheResultMetadata;
  optimistic: DataOptimisticResultMetadata;
}>;

export const DATA_SCHEMA_RUNTIME_ERROR_CODES = Object.freeze({
  missing: 'DATA_SCHEMA_MISSING',
  unsupported: 'DATA_SCHEMA_UNSUPPORTED',
  inputInvalid: 'DATA_INPUT_SCHEMA_INVALID',
  outputInvalid: 'DATA_OUTPUT_SCHEMA_INVALID',
} as const);

export type DataSchemaRuntimeErrorCode =
  (typeof DATA_SCHEMA_RUNTIME_ERROR_CODES)[keyof typeof DATA_SCHEMA_RUNTIME_ERROR_CODES];

export class DataSchemaRuntimeError extends Error {
  readonly code: DataSchemaRuntimeErrorCode;
  readonly retryable = false;
  readonly phase: 'input' | 'output';
  readonly schemaId: string;
  readonly issues: readonly DataSchemaValidationIssue[];
  readonly truncated: boolean;

  constructor(input: {
    code: DataSchemaRuntimeErrorCode;
    phase: 'input' | 'output';
    schemaId: string;
    issues?: readonly DataSchemaValidationIssue[];
    truncated?: boolean;
  }) {
    super('Data operation payload failed schema preflight.');
    this.name = 'DataSchemaRuntimeError';
    this.code = input.code;
    this.phase = input.phase;
    this.schemaId = input.schemaId;
    this.issues = Object.freeze([...(input.issues ?? [])]);
    this.truncated = input.truncated === true;
  }
}

const normalized = (value: string, label: string): string => {
  const result = value.trim();
  if (
    !result ||
    result !== value ||
    result.includes('\0') ||
    result.length > 4_096
  )
    throw new TypeError(`${label} must be a normalized string.`);
  return result;
};

const normalizeTriggerOrigin = (
  trigger: DataOperationTriggerOrigin
): DataOperationTriggerOrigin => {
  switch (trigger.kind) {
    case 'route':
      return Object.freeze({
        kind: 'route',
        routeId: normalized(trigger.routeId, 'Data trigger routeId'),
      });
    case 'document':
      return Object.freeze({
        kind: 'document',
        documentId: normalized(trigger.documentId, 'Data trigger documentId'),
      });
    case 'refresh':
      return Object.freeze({
        kind: 'refresh',
        ...(trigger.reason
          ? { reason: normalized(trigger.reason, 'Data trigger reason') }
          : {}),
      });
    case 'input-change':
      return Object.freeze({
        kind: 'input-change',
        dependencyId: normalized(
          trigger.dependencyId,
          'Data trigger dependencyId'
        ),
      });
    case 'pagination':
      if (
        trigger.action !== 'next' &&
        trigger.action !== 'previous' &&
        trigger.action !== 'replace'
      )
        throw new TypeError('Data pagination trigger action is unsupported.');
      return Object.freeze({ kind: 'pagination', action: trigger.action });
    case 'blueprint-event':
      return Object.freeze({
        kind: 'blueprint-event',
        documentId: normalized(trigger.documentId, 'Data trigger documentId'),
        nodeId: normalized(trigger.nodeId, 'Data trigger nodeId'),
        eventName: normalized(trigger.eventName, 'Data trigger eventName'),
        dispatchId: normalized(trigger.dispatchId, 'Data trigger dispatchId'),
      });
    case 'code-slot':
      return Object.freeze({
        kind: 'code-slot',
        slotId: normalized(trigger.slotId, 'Data trigger slotId'),
        reference: Object.freeze({
          artifactId: normalized(
            trigger.reference.artifactId,
            'Data trigger artifactId'
          ),
          ...(trigger.reference.exportName
            ? {
                exportName: normalized(
                  trigger.reference.exportName,
                  'Data trigger exportName'
                ),
              }
            : {}),
          ...(trigger.reference.symbolId
            ? {
                symbolId: normalized(
                  trigger.reference.symbolId,
                  'Data trigger symbolId'
                ),
              }
            : {}),
          ...(trigger.reference.sourceSpan
            ? {
                sourceSpan: Object.freeze({
                  ...trigger.reference.sourceSpan,
                }),
              }
            : {}),
        }),
        dispatchId: normalized(trigger.dispatchId, 'Data trigger dispatchId'),
      });
    case 'test':
      return Object.freeze({
        kind: 'test',
        testId: normalized(trigger.testId, 'Data trigger testId'),
        dispatchId: normalized(trigger.dispatchId, 'Data trigger dispatchId'),
      });
  }
  throw new TypeError('Data invocation trigger is unsupported.');
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
  const trigger = input.trigger
    ? normalizeTriggerOrigin(input.trigger)
    : undefined;
  if (trigger) {
    const expectedActivation: DataOperationActivation =
      trigger.kind === 'blueprint-event'
        ? 'event'
        : trigger.kind === 'code-slot'
          ? 'code-slot'
          : trigger.kind;
    if (input.activation !== expectedActivation)
      throw new TypeError('Data invocation trigger activation drifted.');
  }
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
    ...(trigger ? { trigger } : {}),
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
        capability !== 'network' &&
        capability !== 'environment-binding' &&
        capability !== 'idempotency-key'
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
              adapter.descriptor.capabilities.includes(
                'environment-binding'
              )) &&
            (!operation.policies.idempotency ||
              invocation.mode === 'mock' ||
              adapter.descriptor.capabilities.includes('idempotency-key'))
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
        if (
          operation.policies.idempotency &&
          invocation.mode !== 'mock' &&
          !adapter.descriptor.capabilities.includes('idempotency-key')
        )
          throw new Error(
            `Data adapter ${adapterId} cannot project an idempotency key.`
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

const validateOperationPayload = (
  input: Readonly<{
    document: DataSourceDocument;
    schemaId: string;
    value: DataJsonValue;
    phase: 'input' | 'output';
    validator: DataSchemaValidator;
  }>
): void => {
  const schema = input.document.schemasById[input.schemaId];
  if (!schema)
    throw new DataSchemaRuntimeError({
      code: DATA_SCHEMA_RUNTIME_ERROR_CODES.missing,
      phase: input.phase,
      schemaId: input.schemaId,
    });
  let validation: ReturnType<DataSchemaValidator['validate']>;
  try {
    validation = input.validator.validate(schema.schema, input.value);
  } catch {
    throw new DataSchemaRuntimeError({
      code: DATA_SCHEMA_RUNTIME_ERROR_CODES.unsupported,
      phase: input.phase,
      schemaId: input.schemaId,
    });
  }
  if (!validation.valid)
    throw new DataSchemaRuntimeError({
      code:
        input.phase === 'input'
          ? DATA_SCHEMA_RUNTIME_ERROR_CODES.inputInvalid
          : DATA_SCHEMA_RUNTIME_ERROR_CODES.outputInvalid,
      phase: input.phase,
      schemaId: input.schemaId,
      issues: validation.issues,
      truncated: validation.truncated,
    });
};

const safeRuntimeError = (
  error: unknown
): Readonly<{ code: string; retryable: boolean }> => {
  const candidate = error as { code?: unknown; retryable?: unknown };
  return Object.freeze({
    code:
      typeof candidate.code === 'string' &&
      /^[A-Z][A-Z0-9_]{0,127}$/u.test(candidate.code)
        ? candidate.code
        : 'DATA_OPERATION_FAILED',
    retryable: candidate.retryable === true,
  });
};

/** Executes an exact Data document through the registered adapter and fences schema, lifecycle, and Network facts. */
export const executeDataOperation = async (
  input: ExecuteDataOperationInput
): Promise<ExecuteDataOperationResult> => {
  const operation =
    input.document.operationsById[input.invocation.operation.operationId];
  if (!operation)
    throw new Error('Data runtime operation does not exist in the document.');
  const source = input.document.source;
  if (source.runtimeZone !== input.invocation.runtimeZone)
    throw new Error('Data source runtime zone does not match invocation.');
  const lease = input.lifecycleChannel.activate(input.invocation);
  const networkTraces: ExecutionNetworkTrace[] = [];
  const publishLifecycle = (snapshot: DataLifecycleSnapshot): boolean => {
    const published = lease.publish(snapshot);
    if (published) input.publishLifecycle?.(snapshot);
    return published;
  };
  let activeInvocation = input.invocation;
  let resolvedEnvironment: ExecutionEnvironmentResolutionLease | undefined;
  let optimisticPlan: DataOptimisticCrudPlan | undefined;
  let optimisticMetadata: DataOptimisticResultMetadata = Object.freeze({
    status: 'bypass',
  });
  try {
    const schemaValidator = input.schemaValidator ?? defaultDataSchemaValidator;
    const effectiveInput = applyDataPaginationInput(
      input.invocation.input,
      operation.policies.pagination
    );
    const runtimeInvocation =
      effectiveInput === input.invocation.input
        ? input.invocation
        : createDataOperationInvocation({
            ...input.invocation,
            input: effectiveInput,
          });
    activeInvocation = runtimeInvocation;
    if (operation.inputSchemaId)
      validateOperationPayload({
        document: input.document,
        schemaId: operation.inputSchemaId,
        value: runtimeInvocation.input,
        phase: 'input',
        validator: schemaValidator,
      });
    const retryPolicy = resolveDataRetryPolicy(
      operation,
      runtimeInvocation.attempt
    );
    const maximumAttempt =
      retryPolicy?.maxAttempts ?? runtimeInvocation.attempt;
    const scheduler = input.scheduler ?? defaultDataOperationScheduler;
    const adapter = input.registry.resolve(
      source.adapterId,
      runtimeInvocation,
      operation
    );
    const environmentResolution = resolveDataOperationEnvironment({
      invocation: runtimeInvocation,
      source,
      operation,
      resolution: input.environmentResolution,
    });
    resolvedEnvironment = environmentResolution
      ? await environmentResolution
      : undefined;
    const cachePolicy = operation.policies.cache;
    const cachePlan =
      cachePolicy && cachePolicy.strategy !== 'no-store'
        ? await createDataOperationCachePlan({
            policy: cachePolicy,
            ...(input.cache ? { runtime: input.cache } : {}),
            invocation: runtimeInvocation,
            effectiveInput: runtimeInvocation.input,
            adapter: adapter.descriptor,
            sourceAdapterId: source.adapterId,
            sourceConfiguration: source.configurationByKey,
            operationConfiguration: operation.configurationByKey,
            now: (input.now ?? Date.now)(),
          })
        : undefined;
    let cacheMetadata: DataOperationCacheResultMetadata =
      cachePlan?.metadata ?? Object.freeze({ status: 'bypass' });
    if (operation.policies.optimistic) {
      optimisticPlan = await createDataOptimisticCrudPlan({
        policy: operation.policies.optimistic,
        ...(input.optimistic ? { runtime: input.optimistic } : {}),
        invocation: runtimeInvocation,
      });
      optimisticMetadata = optimisticPlan.metadata;
      input.publishOptimistic?.(optimisticPlan.applied);
    }
    for (
      let attempt = runtimeInvocation.attempt;
      attempt <= maximumAttempt;
      attempt += 1
    ) {
      const attemptInvocation =
        attempt === runtimeInvocation.attempt
          ? runtimeInvocation
          : createDataOperationInvocation({ ...runtimeInvocation, attempt });
      activeInvocation = attemptInvocation;
      const loading = createDataLifecycleSnapshot({
        operation: attemptInvocation.operation,
        sequence: attemptInvocation.sequence,
        status: 'loading',
        invocationId: attemptInvocation.invocationId,
        attempt: attemptInvocation.attempt,
        startedAt: attemptInvocation.startedAt,
      });
      if (!publishLifecycle(loading))
        throw new DataInvocationError(DATA_INVOCATION_ERROR_CODES.superseded);
      const expectedCorrelation =
        createDataNetworkCorrelation(attemptInvocation);
      let adapterResult: DataOperationAdapterResult;
      let resultOrigin: 'cache' | 'network' | 'fallback' = 'network';
      if (attempt === runtimeInvocation.attempt && cachePlan?.immediate) {
        adapterResult = cachePlan.immediate;
        cacheMetadata = cachePlan.metadata;
        resultOrigin = 'cache';
      } else {
        try {
          adapterResult = await adapter.invoke({
            invocation: attemptInvocation,
            source,
            operation,
            ...(resolvedEnvironment
              ? { environment: resolvedEnvironment }
              : {}),
            signal: input.signal,
            publishNetworkTrace(trace) {
              if (
                JSON.stringify(trace.correlation) !==
                  JSON.stringify(expectedCorrelation) ||
                trace.runtimeZone !== attemptInvocation.runtimeZone ||
                trace.mode !== attemptInvocation.mode ||
                trace.phase !== 'runtime' ||
                trace.adapter !== source.adapterId ||
                JSON.stringify(trace.sourceTrace ?? []) !==
                  JSON.stringify(attemptInvocation.sourceTrace ?? [])
              )
                throw new Error(
                  'Data adapter published a Network trace with correlation drift.'
                );
              networkTraces.push(trace);
              input.publishNetworkTrace?.(trace);
            },
          });
        } catch (error) {
          const failure = safeRuntimeError(error);
          if (input.signal.aborted || !lease.isCurrent()) throw error;
          if (retryPolicy && failure.retryable && attempt < maximumAttempt) {
            try {
              await scheduler.wait(
                calculateDataRetryDelay(retryPolicy, attempt),
                input.signal
              );
            } catch (schedulerError) {
              if (input.signal.aborted) throw schedulerError;
              throw new DataRetryRuntimeError(
                DATA_RETRY_RUNTIME_ERROR_CODES.schedulerFailed
              );
            }
            if (!lease.isCurrent())
              throw new DataInvocationError(
                DATA_INVOCATION_ERROR_CODES.superseded
              );
            continue;
          }
          if (failure.retryable && cachePlan?.fallback) {
            adapterResult = cachePlan.fallback;
            cacheMetadata = Object.freeze({ status: 'network-fallback' });
            resultOrigin = 'fallback';
          } else throw error;
        }
      }
      if (!lease.isCurrent())
        throw new DataInvocationError(DATA_INVOCATION_ERROR_CODES.superseded);
      if (typeof adapterResult.empty !== 'boolean')
        throw new TypeError('Data adapter result empty must be a boolean.');
      validateDataPaginationPage(
        adapterResult.page,
        operation.policies.pagination,
        attemptInvocation.input
      );
      const value = cloneDataJsonValue(adapterResult.value);
      validateOperationPayload({
        document: input.document,
        schemaId: operation.outputSchemaId,
        value,
        phase: 'output',
        validator: schemaValidator,
      });
      const completedAt = Math.max(
        attemptInvocation.startedAt,
        (input.now ?? Date.now)()
      );
      const normalizedResult: DataOperationAdapterResult = Object.freeze({
        value,
        empty: adapterResult.empty,
        ...(adapterResult.page ? { page: adapterResult.page } : {}),
      });
      if (optimisticPlan) {
        const settlement = await optimisticPlan.commit(normalizedResult);
        optimisticMetadata = settlement.metadata;
        if (settlement.snapshot) input.publishOptimistic?.(settlement.snapshot);
      }
      if (
        resultOrigin === 'network' &&
        cachePlan &&
        cachePlan.metadata.status !== 'bypass-private'
      ) {
        const stored = await cachePlan.write(normalizedResult, completedAt);
        cacheMetadata = Object.freeze({
          status: stored ? 'network' : 'network-uncached',
        });
        if (!lease.isCurrent())
          throw new DataInvocationError(DATA_INVOCATION_ERROR_CODES.superseded);
      }
      const lifecycle = createDataLifecycleSnapshot(
        adapterResult.empty
          ? {
              operation: attemptInvocation.operation,
              sequence: attemptInvocation.sequence,
              status: 'empty' as const,
              invocationId: attemptInvocation.invocationId,
              attempt: attemptInvocation.attempt,
              startedAt: attemptInvocation.startedAt,
              completedAt,
              ...(adapterResult.page ? { page: adapterResult.page } : {}),
            }
          : {
              operation: attemptInvocation.operation,
              sequence: attemptInvocation.sequence,
              status: 'success' as const,
              invocationId: attemptInvocation.invocationId,
              attempt: attemptInvocation.attempt,
              startedAt: attemptInvocation.startedAt,
              completedAt,
              value,
              ...(adapterResult.page ? { page: adapterResult.page } : {}),
            }
      );
      if (!publishLifecycle(lifecycle))
        throw new DataInvocationError(DATA_INVOCATION_ERROR_CODES.superseded);
      const result = Object.freeze({
        value,
        empty: adapterResult.empty,
        ...('page' in lifecycle && lifecycle.page
          ? { page: lifecycle.page }
          : {}),
      });
      return Object.freeze({
        result,
        lifecycle,
        networkTraces: Object.freeze(networkTraces),
        cache: cacheMetadata,
        optimistic: optimisticMetadata,
      });
    }
    throw new DataRetryRuntimeError(
      DATA_RETRY_RUNTIME_ERROR_CODES.policyBudgetExceeded
    );
  } catch (error) {
    if (optimisticPlan) {
      const settlement = await optimisticPlan.rollback();
      optimisticMetadata = settlement.metadata;
      if (settlement.snapshot) input.publishOptimistic?.(settlement.snapshot);
    }
    if (input.signal.aborted || !lease.isCurrent()) throw error;
    const failure = safeRuntimeError(error);
    const completedAt = Math.max(
      activeInvocation.startedAt,
      (input.now ?? Date.now)()
    );
    const lifecycle = createDataLifecycleSnapshot({
      operation: activeInvocation.operation,
      sequence: activeInvocation.sequence,
      status: 'error',
      invocationId: activeInvocation.invocationId,
      attempt: activeInvocation.attempt,
      startedAt: activeInvocation.startedAt,
      completedAt,
      error: {
        code: failure.code,
        message: 'Data operation failed.',
        retryable: failure.retryable,
      },
    });
    publishLifecycle(lifecycle);
    throw error;
  } finally {
    resolvedEnvironment?.revoke();
  }
};
