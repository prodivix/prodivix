import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  ExecuteVerificationAdapterLifecycleInput,
  PreparedVerificationInvocation,
  VerificationAdapterCleanupResult,
} from './verificationAdapterRuntime.types';

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const INPUT_KINDS = new Set([
  'diagnostic-snapshot',
  'executable-snapshot',
  'scenario-program',
  'test-report',
  'baseline-set',
  'verification-profile',
  'security-observation-set',
]);

export class VerificationLifecycleContractError extends Error {
  constructor(
    readonly reasonCode: string,
    message: string
  ) {
    super(message);
    this.name = 'VerificationLifecycleContractError';
  }
}

export class VerificationLifecycleCancelledError extends Error {
  constructor() {
    super('Verification adapter lifecycle was cancelled.');
    this.name = 'VerificationLifecycleCancelledError';
  }
}

export class VerificationLifecycleTimeoutError extends Error {
  constructor() {
    super('Verification adapter lifecycle timed out.');
    this.name = 'VerificationLifecycleTimeoutError';
  }
}

export const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter lifecycle value must be a plain object.'
    );
  }
  const keys = Object.keys(value);
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!required.includes(key) && !optional.includes(key))
    )
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter lifecycle value has unknown, missing, or unsafe fields.'
    );
  }
  return value;
};

export const token = (value: unknown, label: string): string => {
  if (
    typeof value !== 'string' ||
    value !== value.normalize('NFC') ||
    !TOKEN_PATTERN.test(value)
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} must be a canonical identifier.`
    );
  }
  return value;
};

export const digest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} must be a SHA-256 digest.`
    );
  }
  return value;
};

export const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} must be a positive safe integer.`
    );
  }
  return value as number;
};

const nonnegativeInteger = (value: unknown, label: string): number => {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    (value as number) < 0
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} must be a non-negative safe integer.`
    );
  }
  return value as number;
};

const canonicalTokenArray = (
  value: unknown,
  label: string
): readonly string[] => {
  if (!Array.isArray(value) || value.length > 1_024) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} must be a bounded identifier array.`
    );
  }
  const normalized = value.map((entry) => token(entry, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      `${label} contains duplicate identifiers.`
    );
  }
  return Object.freeze([...normalized].sort(compareUnicodeCodePoints));
};

export const validateAdapterContext = (
  input: ExecuteVerificationAdapterLifecycleInput
): void => {
  exactRecord(
    input.context,
    [
      'registrySnapshotDigest',
      'adapter',
      'runtimeZone',
      'runtimeEnvironmentDigest',
      'inputDigest',
      'executableSnapshotDigest',
      'controlProfileDigest',
      'fixtureSetDigests',
      'controlCapabilityIds',
      'controlCapabilitySnapshotDigest',
      'appliedControlDigest',
      'inputRefs',
      'inputResolver',
      'artifactStaging',
      'abortSignal',
    ],
    ['scenarioProgramDigest', 'baselineSetDigest']
  );
  digest(input.context.inputDigest, 'Context input digest');
  digest(input.context.runtimeEnvironmentDigest, 'Runtime environment digest');
  digest(input.context.executableSnapshotDigest, 'Executable Snapshot digest');
  digest(input.context.controlProfileDigest, 'Control Profile digest');
  digest(
    input.context.controlCapabilitySnapshotDigest,
    'Control capability snapshot digest'
  );
  digest(input.context.appliedControlDigest, 'Applied control digest');
  if (input.context.inputDigest !== input.cell.inputDigest) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context input digest does not match the Plan cell.'
    );
  }
  if (
    input.cell.controlProfileRef.digest !== undefined &&
    input.context.controlProfileDigest !== input.cell.controlProfileRef.digest
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context Control Profile drifted from the Plan cell.'
    );
  }
  const fixtureSetDigests = canonicalTokenArray(
    input.context.fixtureSetDigests,
    'Fixture Set digests'
  );
  fixtureSetDigests.forEach((value) => digest(value, 'Fixture Set digest'));
  const expectedFixtureSetDigests = input.cell.fixtureSetRef?.digest
    ? [input.cell.fixtureSetRef.digest]
    : [];
  if (!sameCanonicalJson(fixtureSetDigests, expectedFixtureSetDigests)) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context Fixture Set drifted from the Plan cell.'
    );
  }
  if (
    input.context.baselineSetDigest !== input.cell.baselineSetRef?.digest ||
    (input.context.baselineSetDigest !== undefined &&
      !DIGEST_PATTERN.test(input.context.baselineSetDigest))
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context Baseline Set drifted from the Plan cell.'
    );
  }
  if (
    (input.cell.scenarioId === undefined) !==
      (input.context.scenarioProgramDigest === undefined) ||
    (input.context.scenarioProgramDigest !== undefined &&
      !DIGEST_PATTERN.test(input.context.scenarioProgramDigest))
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context Scenario Program does not match the Plan cell.'
    );
  }
  const controlCapabilityIds = canonicalTokenArray(
    input.context.controlCapabilityIds,
    'Control capability ids'
  );
  if (
    !sameCanonicalJson(controlCapabilityIds, input.context.controlCapabilityIds)
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Control capability ids must be canonical and ordered.'
    );
  }
  const inputResolver = exactRecord(input.context.inputResolver, ['read']);
  const artifactStaging = exactRecord(input.context.artifactStaging, ['stage']);
  const abortSignal = exactRecord(
    input.context.abortSignal,
    ['aborted', 'subscribe'],
    ['reason']
  );
  if (
    typeof inputResolver.read !== 'function' ||
    typeof artifactStaging.stage !== 'function' ||
    typeof abortSignal.aborted !== 'boolean' ||
    (abortSignal.reason !== undefined &&
      typeof abortSignal.reason !== 'string') ||
    typeof abortSignal.subscribe !== 'function'
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter context ports or abort signal are invalid.'
    );
  }
  if (
    !Array.isArray(input.context.inputRefs) ||
    input.context.inputRefs.length > 64
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter input references are invalid or over budget.'
    );
  }
  const ids = new Set<string>();
  const kinds = new Set<string>();
  let totalBytes = 0;
  for (const reference of input.context.inputRefs) {
    const data = exactRecord(
      reference,
      ['id', 'kind', 'digest', 'size'],
      ['mediaType']
    );
    const id = token(data.id, 'Adapter input reference id');
    const kind = token(data.kind, 'Adapter input reference kind');
    if (
      !INPUT_KINDS.has(kind) ||
      ids.has(id) ||
      !input.cell.inputKinds.includes(
        kind as (typeof input.cell.inputKinds)[number]
      )
    ) {
      throw new VerificationLifecycleContractError(
        'VER-4001',
        'Adapter input reference identity or kind is invalid.'
      );
    }
    ids.add(id);
    kinds.add(kind);
    digest(data.digest, 'Adapter input reference digest');
    const size = nonnegativeInteger(data.size, 'Adapter input reference size');
    totalBytes += size;
    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes > 1024 * 1024 * 1024 ||
      (data.mediaType !== undefined &&
        (typeof data.mediaType !== 'string' ||
          !MEDIA_TYPE_PATTERN.test(data.mediaType)))
    ) {
      throw new VerificationLifecycleContractError(
        'VER-4001',
        'Adapter input references exceed their budget or media contract.'
      );
    }
  }
  if (
    kinds.size !== input.cell.inputKinds.length ||
    input.cell.inputKinds.some((kind) => !kinds.has(kind))
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter input reference kinds do not exactly match the Plan cell.'
    );
  }
};

export const normalizePreparedInvocation = (
  value: unknown,
  input: ExecuteVerificationAdapterLifecycleInput,
  resolvedInputSetDigest: string
): PreparedVerificationInvocation => {
  const invocation = exactRecord(
    value,
    [
      'invocationId',
      'planDigest',
      'cellId',
      'adapterId',
      'attemptId',
      'generation',
      'providerKind',
      'inputDigest',
      'controlCapabilitySnapshotDigest',
      'appliedControlDigest',
      'confirmedCursor',
      'state',
    ],
    ['executionId', 'sessionId', 'jobId']
  );
  const normalized: PreparedVerificationInvocation = Object.freeze({
    invocationId: token(invocation.invocationId, 'Invocation id'),
    planDigest: digest(invocation.planDigest, 'Invocation Plan digest'),
    cellId: token(invocation.cellId, 'Invocation cell id'),
    adapterId: token(invocation.adapterId, 'Invocation adapter id'),
    attemptId: token(invocation.attemptId, 'Invocation attempt id'),
    generation: positiveInteger(invocation.generation, 'Invocation generation'),
    providerKind: (() => {
      if (
        !['browser', 'remote', 'export', 'ci', 'local'].includes(
          invocation.providerKind as string
        )
      ) {
        throw new VerificationLifecycleContractError(
          'VER-4001',
          'Invocation provider kind is invalid.'
        );
      }
      return invocation.providerKind as PreparedVerificationInvocation['providerKind'];
    })(),
    ...(invocation.executionId === undefined
      ? {}
      : { executionId: token(invocation.executionId, 'Execution id') }),
    ...(invocation.sessionId === undefined
      ? {}
      : { sessionId: token(invocation.sessionId, 'Session id') }),
    ...(invocation.jobId === undefined
      ? {}
      : { jobId: token(invocation.jobId, 'Job id') }),
    inputDigest: digest(invocation.inputDigest, 'Invocation input digest'),
    resolvedInputSetDigest,
    controlCapabilitySnapshotDigest: digest(
      invocation.controlCapabilitySnapshotDigest,
      'Control capability snapshot digest'
    ),
    appliedControlDigest: digest(
      invocation.appliedControlDigest,
      'Applied control digest'
    ),
    confirmedCursor: nonnegativeInteger(
      invocation.confirmedCursor,
      'Confirmed cursor'
    ),
    state: (() => {
      if (
        !['preparing', 'running', 'collecting'].includes(
          invocation.state as string
        )
      ) {
        throw new VerificationLifecycleContractError(
          'VER-4001',
          'Invocation state is invalid.'
        );
      }
      return invocation.state as PreparedVerificationInvocation['state'];
    })(),
  });
  if (
    normalized.planDigest !== input.planDigest ||
    normalized.cellId !== input.cell.id ||
    normalized.adapterId !== input.cell.adapter.adapterId ||
    normalized.attemptId !== input.attemptId ||
    normalized.generation !== input.generation ||
    normalized.providerKind !== input.providerKind ||
    normalized.inputDigest !== input.cell.inputDigest ||
    normalized.controlCapabilitySnapshotDigest !==
      input.context.controlCapabilitySnapshotDigest ||
    normalized.appliedControlDigest !== input.context.appliedControlDigest
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Prepared invocation drifted from its Core-bound coordinates.'
    );
  }
  return normalized;
};

export const normalizeCleanupResult = (
  value: unknown
): VerificationAdapterCleanupResult => {
  const cleanup = exactRecord(value, [
    'status',
    'residualCanaryIds',
    'diagnosticCodes',
  ]);
  if (!['clean', 'residual', 'failed'].includes(cleanup.status as string)) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Cleanup status is invalid.'
    );
  }
  const residualCanaryIds = canonicalTokenArray(
    cleanup.residualCanaryIds,
    'Cleanup residual canary ids'
  );
  const diagnosticCodes = canonicalTokenArray(
    cleanup.diagnosticCodes,
    'Cleanup diagnostic codes'
  );
  if (
    (cleanup.status === 'clean' && residualCanaryIds.length !== 0) ||
    (cleanup.status === 'residual' && residualCanaryIds.length === 0)
  ) {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Cleanup status does not match its residual canaries.'
    );
  }
  return Object.freeze({
    status: cleanup.status as VerificationAdapterCleanupResult['status'],
    residualCanaryIds,
    diagnosticCodes,
  });
};

export const failedCleanup = (): VerificationAdapterCleanupResult =>
  Object.freeze({
    status: 'failed',
    residualCanaryIds: Object.freeze([]),
    diagnosticCodes: Object.freeze(['VER-4002']),
  });

export const normalizePreflight = (
  value: unknown
):
  | Readonly<{ status: 'supported' }>
  | Readonly<{ status: 'unsupported' | 'blocked'; reasonCode: string }> => {
  if (!isPlainObject(value) || typeof value.status !== 'string') {
    throw new VerificationLifecycleContractError(
      'VER-4001',
      'Adapter preflight result is malformed.'
    );
  }
  if (value.status === 'supported') {
    exactRecord(value, ['status']);
    return Object.freeze({ status: 'supported' });
  }
  if (value.status === 'unsupported' || value.status === 'blocked') {
    const preflight = exactRecord(value, ['status', 'reasonCode', 'message']);
    if (
      typeof preflight.message !== 'string' ||
      preflight.message.length === 0 ||
      preflight.message.length > 1_024
    ) {
      throw new VerificationLifecycleContractError(
        'VER-4001',
        'Adapter preflight message is invalid.'
      );
    }
    return Object.freeze({
      status: value.status,
      reasonCode: token(preflight.reasonCode, 'Preflight reason code'),
    });
  }
  throw new VerificationLifecycleContractError(
    'VER-4001',
    'Adapter preflight status is invalid.'
  );
};

const ADAPTER_REASON_CODE_PATTERN = /^VER-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;

export const errorReasonCode = (error: unknown): string => {
  if (error instanceof VerificationLifecycleContractError) {
    return error.reasonCode;
  }
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    ADAPTER_REASON_CODE_PATTERN.test(error.code) &&
    error.code.length <= 256
  ) {
    return error.code;
  }
  return 'VER-4002';
};
