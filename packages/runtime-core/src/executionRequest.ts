import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  EXECUTION_INVOCATION_KINDS,
  EXECUTION_PROFILES,
  EXECUTION_PROVIDER_CAPABILITIES,
  EXECUTION_PROVIDER_ISOLATIONS,
  RUNTIME_ZONES,
  type ExecutionInvocationKind,
  type ExecutionProfile,
  type ExecutionProviderCapability,
  type ExecutionProviderCompatibility,
  type ExecutionProviderDescriptor,
  type ExecutionProviderDescriptorInput,
  type ExecutionProviderIncompatibility,
  type ExecutionProviderIsolation,
  type ExecutionRequest,
  type ExecutionRequestInput,
  type ExecutionValue,
  type RuntimeZone,
} from './execution.types';
import { createExecutionEnvironmentSnapshotRef } from './executionEnvironment';

const profiles = new Set<ExecutionProfile>(EXECUTION_PROFILES);
const runtimeZones = new Set<RuntimeZone>(RUNTIME_ZONES);
const invocationKinds = new Set<ExecutionInvocationKind>(
  EXECUTION_INVOCATION_KINDS
);
const providerCapabilities = new Set<ExecutionProviderCapability>(
  EXECUTION_PROVIDER_CAPABILITIES
);
const providerIsolations = new Set<ExecutionProviderIsolation>(
  EXECUTION_PROVIDER_ISOLATIONS
);

const normalizeIdentifier = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${label} must not be empty.`);
  return normalized;
};

const normalizeEnumValues = <Value extends string>(
  values: readonly Value[],
  allowed: ReadonlySet<Value>,
  label: string,
  options: Readonly<{ allowEmpty?: boolean }> = {}
): readonly Value[] => {
  const normalized = [...new Set(values)].sort();
  if (!options.allowEmpty && normalized.length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
  normalized.forEach((value) => {
    if (!allowed.has(value)) {
      throw new TypeError(`${label} contains an unsupported value: ${value}`);
    }
  });
  return Object.freeze(normalized);
};

const normalizeStringRecord = (
  value: Readonly<Record<string, string>> | undefined,
  label: string
): Readonly<Record<string, string>> | undefined => {
  if (!value) return undefined;
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [
      normalizeIdentifier(key, `${label} key`),
      normalizeIdentifier(entryValue, `${label}.${key}`),
    ])
    .sort(([left], [right]) => compareUnicodeCodePoints(left, right));
  return Object.freeze(Object.fromEntries(entries));
};

export const cloneExecutionValue = (
  value: ExecutionValue,
  ancestors: Set<object> = new Set()
): ExecutionValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Execution values must contain finite numbers.');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError('Execution values must be transport-safe data.');
  }
  if (ancestors.has(value)) {
    throw new TypeError('Execution values must not contain cycles.');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Object.freeze(
        value.map((entry) => cloneExecutionValue(entry, ancestors))
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(
        'Execution values must contain only plain objects and arrays.'
      );
    }
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          cloneExecutionValue(entry, ancestors),
        ])
      )
    );
  } finally {
    ancestors.delete(value);
  }
};

export const createExecutionRequest = (
  input: ExecutionRequestInput
): ExecutionRequest => {
  if (!profiles.has(input.profile)) {
    throw new TypeError(`Unsupported execution profile: ${input.profile}`);
  }
  if (!runtimeZones.has(input.runtimeZone)) {
    throw new TypeError(`Unsupported runtime zone: ${input.runtimeZone}`);
  }
  if (!invocationKinds.has(input.invocation.kind)) {
    throw new TypeError(
      `Unsupported execution invocation: ${input.invocation.kind}`
    );
  }
  if (
    input.timeoutMs !== undefined &&
    (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0)
  ) {
    throw new TypeError('Execution timeoutMs must be a positive safe integer.');
  }

  const partitionRevisions = normalizeStringRecord(
    input.workspace.partitionRevisions,
    'Execution partition revision'
  );
  const metadata = normalizeStringRecord(input.metadata, 'Execution metadata');

  return Object.freeze({
    requestId: normalizeIdentifier(input.requestId, 'Execution requestId'),
    profile: input.profile,
    runtimeZone: input.runtimeZone,
    workspace: Object.freeze({
      workspaceId: normalizeIdentifier(
        input.workspace.workspaceId,
        'Execution workspaceId'
      ),
      snapshotId: normalizeIdentifier(
        input.workspace.snapshotId,
        'Execution snapshotId'
      ),
      ...(partitionRevisions ? { partitionRevisions } : {}),
    }),
    ...(input.environment === undefined
      ? {}
      : {
          environment: createExecutionEnvironmentSnapshotRef(input.environment),
        }),
    invocation: Object.freeze({
      kind: input.invocation.kind,
      targetRef: Object.freeze({ ...input.invocation.targetRef }),
      ...(input.invocation.entrypoint
        ? {
            entrypoint: normalizeIdentifier(
              input.invocation.entrypoint,
              'Execution entrypoint'
            ),
          }
        : {}),
      ...(input.invocation.input === undefined
        ? {}
        : { input: cloneExecutionValue(input.invocation.input) }),
    }),
    requiredCapabilities: normalizeEnumValues(
      [
        ...(input.requiredCapabilities ?? []),
        ...(input.timeoutMs === undefined ? [] : (['timeout'] as const)),
        ...(input.environment === undefined
          ? []
          : (['environment-binding'] as const)),
      ],
      providerCapabilities,
      'Execution requiredCapabilities',
      { allowEmpty: true }
    ),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    ...(metadata ? { metadata } : {}),
  });
};

export const createExecutionProviderDescriptor = (
  input: ExecutionProviderDescriptorInput
): ExecutionProviderDescriptor => {
  if (!providerIsolations.has(input.isolation)) {
    throw new TypeError(
      `Unsupported execution provider isolation: ${input.isolation}`
    );
  }
  return Object.freeze({
    id: normalizeIdentifier(input.id, 'Execution provider id'),
    version: normalizeIdentifier(input.version, 'Execution provider version'),
    ...(input.displayName
      ? {
          displayName: normalizeIdentifier(
            input.displayName,
            'Execution provider displayName'
          ),
        }
      : {}),
    isolation: input.isolation,
    profiles: normalizeEnumValues(
      input.profiles,
      profiles,
      'Execution provider profiles'
    ),
    runtimeZones: normalizeEnumValues(
      input.runtimeZones,
      runtimeZones,
      'Execution provider runtimeZones'
    ),
    invocationKinds: normalizeEnumValues(
      input.invocationKinds,
      invocationKinds,
      'Execution provider invocationKinds'
    ),
    capabilities: normalizeEnumValues(
      input.capabilities ?? [],
      providerCapabilities,
      'Execution provider capabilities',
      { allowEmpty: true }
    ),
  });
};

export const getExecutionProviderCompatibility = (
  descriptor: ExecutionProviderDescriptor,
  request: ExecutionRequest
): ExecutionProviderCompatibility => {
  const reasons: ExecutionProviderIncompatibility[] = [];
  if (!descriptor.profiles.includes(request.profile)) {
    reasons.push({ kind: 'profile', profile: request.profile });
  }
  if (!descriptor.runtimeZones.includes(request.runtimeZone)) {
    reasons.push({ kind: 'runtime-zone', runtimeZone: request.runtimeZone });
  }
  if (!descriptor.invocationKinds.includes(request.invocation.kind)) {
    reasons.push({
      kind: 'invocation',
      invocationKind: request.invocation.kind,
    });
  }
  const requiredCapabilities = new Set(request.requiredCapabilities);
  if (request.timeoutMs !== undefined) requiredCapabilities.add('timeout');
  if (request.environment !== undefined) {
    requiredCapabilities.add('environment-binding');
  }
  [...requiredCapabilities].sort().forEach((capability) => {
    if (!descriptor.capabilities.includes(capability)) {
      reasons.push({ kind: 'capability', capability });
    }
  });
  return reasons.length
    ? Object.freeze({ compatible: false, reasons: Object.freeze(reasons) })
    : Object.freeze({ compatible: true });
};
