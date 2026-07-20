import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ExecutionJobStatus } from '@prodivix/runtime-core';
import {
  assessRemoteExecutionRegionalRecovery,
  hasExactRemoteExecutionRegionalRecoveryLease,
  remoteExecutionRegionalRecoveryIdentity,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
  type RemoteExecutionRegionalRecoveryCheckpoint,
  type RemoteExecutionRegionalRecoveryProbe,
  type RemoteExecutionRegionalTrafficAuthority,
} from './remoteExecutionRegionalRecovery';
import type { RemoteExecutionTerminalBroker } from './remoteExecutionTerminal.types';
import {
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  RemoteExecutionRegionalRecoveryOperatorError,
  type RemoteExecutionRegionalInfrastructureFenceDecision,
  type RemoteExecutionRegionalInfrastructureFencePort,
  type RemoteExecutionRegionalRecoveryAuthorizationDecision,
  type RemoteExecutionRegionalRecoveryAuthorizationPort,
  type RemoteExecutionRegionalRecoveryAuthorizationScope,
  type RemoteExecutionRegionalRecoveryOperator,
  type RemoteExecutionRegionalRecoveryOperatorEvidence,
  type RemoteExecutionRegionalRecoveryOperatorRequest,
  type RemoteExecutionRegionalRecoveryOutcomeCounts,
  type RemoteExecutionRegionalRecoveryRpoEvidence,
  type RemoteExecutionRegionalReplicationAttestationDecision,
  type RemoteExecutionRegionalReplicationAttestationPort,
} from './remoteExecutionRegionalRecoveryOperator.types';

const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const canonicalIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const terminalStatuses = new Set<ExecutionJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);
const executionStatuses = new Set<ExecutionJobStatus>([
  'queued',
  'starting',
  'running',
  'cancelling',
  ...terminalStatuses,
]);

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
};

const digest = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(stableJson(value))))}`;

export const createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest = (
  scope: RemoteExecutionRegionalRecoveryAuthorizationScope
): string => digest(scope);

export const createRemoteExecutionRegionalRecoveryExecutionSetDigest = (
  values: readonly string[]
): string => {
  if (
    values.length < 1 ||
    values.length >
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize
  )
    throw new TypeError('Remote regional recovery batch is invalid.');
  const executionIds = values.map((value) =>
    identifier(value, 'Remote regional recovery execution id')
  );
  if (new Set(executionIds).size !== executionIds.length)
    throw new TypeError('Remote regional recovery batch is invalid.');
  executionIds.sort((left, right) => left.localeCompare(right));
  return digest(executionIds);
};

export const createRemoteExecutionRegionalRecoveryAuthorizationScope = (input: {
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  request: RemoteExecutionRegionalRecoveryOperatorRequest;
}): RemoteExecutionRegionalRecoveryAuthorizationScope => {
  if (
    input.request.format !==
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT ||
    input.request.version !==
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION ||
    (input.request.mode !== 'planned' &&
      input.request.mode !== 'source-unavailable')
  )
    throw new TypeError('Remote regional recovery request is invalid.');
  const deploymentId = identifier(
    input.deploymentId,
    'Remote regional deployment id'
  );
  const sourceRegionId = identifier(
    input.sourceRegionId,
    'Remote regional source region id'
  );
  const targetRegionId = identifier(
    input.targetRegionId,
    'Remote regional target region id'
  );
  if (sourceRegionId === targetRegionId)
    throw new TypeError('Remote regional recovery requires distinct regions.');
  const initiatedAt = timestamp(
    input.request.initiatedAt,
    'Remote regional recovery initiation time'
  );
  const cutoverAt = timestamp(
    input.request.cutoverAt,
    'Remote regional recovery cutover time'
  );
  if (initiatedAt > cutoverAt)
    throw new TypeError('Remote regional recovery request time is invalid.');
  if (
    input.request.mode === 'planned' &&
    input.request.maximumAcceptedRpoMs !== undefined
  )
    throw new TypeError('Planned regional recovery cannot accept data loss.');
  const maximumAcceptedRpoMs =
    input.request.mode === 'source-unavailable'
      ? nonnegativeInteger(
          input.request.maximumAcceptedRpoMs!,
          'Remote regional recovery accepted RPO'
        )
      : undefined;
  return Object.freeze({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    operationId: identifier(
      input.request.operationId,
      'Remote regional recovery operation id'
    ),
    deploymentId,
    sourceRegionId,
    targetRegionId,
    mode: input.request.mode,
    expectedTrafficEpoch: positiveInteger(
      input.request.expectedTrafficEpoch,
      'Remote regional recovery traffic epoch'
    ),
    executionCount: input.request.executionIds.length,
    executionSetDigest: createRemoteExecutionRegionalRecoveryExecutionSetDigest(
      input.request.executionIds
    ),
    initiatedAt,
    cutoverAt,
    ...(maximumAcceptedRpoMs === undefined ? {} : { maximumAcceptedRpoMs }),
  });
};

const identifier = (value: string, label: string): string => {
  const normalized = value.trim();
  if (normalized !== value || !canonicalIdentifierPattern.test(normalized))
    throw new TypeError(`${label} is invalid.`);
  return normalized;
};

const timestamp = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const positiveInteger = (
  value: number,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER
): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const nonnegativeInteger = (
  value: number,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER
): number => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const opaqueCredential = (value: Uint8Array | undefined, label: string) => {
  if (
    !(value instanceof Uint8Array) ||
    value.byteLength < 1 ||
    value.byteLength >
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumCredentialBytes
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const nonempty = (value: string, maximum = 4_096): boolean =>
  value.length > 0 && value.length <= maximum;

const validLease = (
  lease: RemoteExecutionRegionalRecoveryCheckpoint['lease']
): boolean =>
  lease === undefined ||
  (nonempty(lease.workerId) &&
    Number.isSafeInteger(lease.attempt) &&
    lease.attempt >= 1 &&
    Number.isSafeInteger(lease.acquiredAt) &&
    lease.acquiredAt >= 0 &&
    Number.isSafeInteger(lease.expiresAt) &&
    lease.expiresAt > lease.acquiredAt);

const validTerminal = (
  terminal: RemoteExecutionRegionalRecoveryCheckpoint['terminal']
): boolean =>
  terminal === undefined ||
  (nonempty(terminal.terminalSessionId) &&
    Number.isSafeInteger(terminal.revision) &&
    terminal.revision >= 1 &&
    Number.isSafeInteger(terminal.expiresAt) &&
    terminal.expiresAt >= 0 &&
    digestPattern.test(terminal.sealedStateDigest));

const validCheckpoint = (
  value: RemoteExecutionRegionalRecoveryCheckpoint,
  regionId: string,
  executionId: string,
  capturedAt: number
): boolean =>
  value.format === REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT &&
  value.version === REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION &&
  value.regionId === regionId &&
  value.executionId === executionId &&
  value.capturedAt === capturedAt &&
  nonempty(value.ownerId) &&
  nonempty(value.requestId) &&
  nonempty(value.providerId) &&
  nonempty(value.snapshotId) &&
  digestPattern.test(value.snapshotDigest) &&
  executionStatuses.has(value.status) &&
  Number.isSafeInteger(value.latestCursor) &&
  value.latestCursor >= 0 &&
  digestPattern.test(value.executionStateDigest) &&
  digestPattern.test(value.stateDigest) &&
  validLease(value.lease) &&
  validTerminal(value.terminal);

export const createRemoteExecutionRegionalRecoveryTargetCheckpointDigest = (
  targets: readonly RemoteExecutionRegionalRecoveryCheckpoint[]
): string => {
  if (
    targets.length < 1 ||
    targets.length >
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize
  )
    throw new TypeError('Remote regional recovery target batch is invalid.');
  const sorted = [...targets].sort((left, right) =>
    left.executionId.localeCompare(right.executionId)
  );
  if (
    new Set(sorted.map(({ executionId }) => executionId)).size !==
      sorted.length ||
    new Set(sorted.map(({ regionId }) => regionId)).size !== 1 ||
    new Set(sorted.map(({ capturedAt }) => capturedAt)).size !== 1 ||
    sorted.some(
      (target) =>
        !validCheckpoint(
          target,
          target.regionId,
          target.executionId,
          target.capturedAt
        )
    )
  )
    throw new TypeError('Remote regional recovery target batch is invalid.');
  return digest({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    kind: 'target-checkpoint-batch',
    entries: sorted.map((target) => ({
      executionId: target.executionId,
      stateDigest: target.stateDigest,
      capturedAt: target.capturedAt,
    })),
  });
};

type PreparedOutcome = Readonly<{
  executionId: string;
  checkpointDigest: string;
  mode:
    | 'terminal'
    | 'queued-claim'
    | 'same-worker-continuation'
    | 'worker-reclaim'
    | 'worker-recovery-exhausted';
  revokeTerminal: boolean;
  target: RemoteExecutionRegionalRecoveryCheckpoint;
}>;

const outcomeCounts = (
  outcomes: readonly PreparedOutcome[]
): RemoteExecutionRegionalRecoveryOutcomeCounts => {
  const counts = {
    terminal: 0,
    queuedClaim: 0,
    sameWorkerContinuation: 0,
    workerReclaim: 0,
    workerRecoveryExhausted: 0,
  };
  outcomes.forEach((outcome) => {
    if (outcome.mode === 'terminal') counts.terminal += 1;
    else if (outcome.mode === 'queued-claim') counts.queuedClaim += 1;
    else if (outcome.mode === 'same-worker-continuation')
      counts.sameWorkerContinuation += 1;
    else if (outcome.mode === 'worker-reclaim') counts.workerReclaim += 1;
    else counts.workerRecoveryExhausted += 1;
  });
  return Object.freeze(counts);
};

const aggregateCutoverDigest = (
  scopeDigest: string,
  checkpointDigest: string,
  outcomes: readonly PreparedOutcome[]
): string =>
  digest({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    kind: 'cutover-checkpoint-batch',
    scopeDigest,
    targetCheckpointDigest: checkpointDigest,
    entries: outcomes.map((outcome) => ({
      executionId: outcome.executionId,
      checkpointDigest: outcome.checkpointDigest,
      mode: outcome.mode,
      terminalRevoked: outcome.revokeTerminal,
    })),
  });

const executeBounded = async <Value, Result>(
  values: readonly Value[],
  concurrency: number,
  action: (value: Value) => Promise<Result>
): Promise<readonly Result[]> => {
  const results = new Array<Result>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await action(values[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker)
  );
  return Object.freeze(results);
};

const capture = async (
  probe: RemoteExecutionRegionalRecoveryProbe,
  executionId: string,
  capturedAt: number
): Promise<RemoteExecutionRegionalRecoveryCheckpoint | undefined> => {
  try {
    return await probe.capture(executionId, capturedAt);
  } catch {
    throw new RemoteExecutionRegionalRecoveryOperatorError(
      'checkpoint-unavailable'
    );
  }
};

const plannedOutcome = (
  source: RemoteExecutionRegionalRecoveryCheckpoint | undefined,
  target: RemoteExecutionRegionalRecoveryCheckpoint | undefined,
  now: number,
  maximumWorkerAttempts: number
): PreparedOutcome => {
  const assessment = assessRemoteExecutionRegionalRecovery({
    source,
    target,
    now,
    maximumWorkerAttempts,
  });
  if (assessment.kind === 'wait-for-replication')
    throw new RemoteExecutionRegionalRecoveryOperatorError('replication-lag');
  if (assessment.kind === 'blocked')
    throw new RemoteExecutionRegionalRecoveryOperatorError('recovery-blocked');
  if (assessment.kind === 'terminal')
    return Object.freeze({
      executionId: assessment.target.executionId,
      checkpointDigest: assessment.checkpointDigest,
      mode: 'terminal',
      revokeTerminal: assessment.target.terminal !== undefined,
      target: assessment.target,
    });
  return Object.freeze({
    executionId: assessment.target.executionId,
    checkpointDigest: assessment.checkpointDigest,
    mode: assessment.mode,
    revokeTerminal: assessment.terminalAction === 'close-transport-lost',
    target: assessment.target,
  });
};

const sourceUnavailableOutcome = (
  target: RemoteExecutionRegionalRecoveryCheckpoint,
  now: number,
  maximumWorkerAttempts: number,
  attestationDigest: string
): PreparedOutcome => {
  let mode: PreparedOutcome['mode'];
  if (terminalStatuses.has(target.status)) mode = 'terminal';
  else if (!target.lease) {
    if (target.status !== 'queued')
      throw new RemoteExecutionRegionalRecoveryOperatorError(
        'recovery-blocked'
      );
    mode = 'queued-claim';
  } else {
    // A fenced source still owns its lease until expiry. Waiting for the
    // bounded lease is safer than inventing a second mutation authority.
    if (target.lease.expiresAt > now)
      throw new RemoteExecutionRegionalRecoveryOperatorError(
        'recovery-blocked'
      );
    mode =
      target.lease.attempt >= maximumWorkerAttempts
        ? 'worker-recovery-exhausted'
        : 'worker-reclaim';
  }
  return Object.freeze({
    executionId: target.executionId,
    checkpointDigest: digest({
      format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
      version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
      kind: 'source-unavailable-checkpoint',
      executionId: target.executionId,
      targetRegionId: target.regionId,
      stateDigest: target.stateDigest,
      latestCursor: target.latestCursor,
      terminalRevision: target.terminal?.revision ?? null,
      mode,
      attestationDigest,
    }),
    mode,
    revokeTerminal: target.terminal !== undefined,
    target,
  });
};

const verifyRevokedCheckpoint = (
  original: RemoteExecutionRegionalRecoveryCheckpoint,
  revoked: RemoteExecutionRegionalRecoveryCheckpoint | undefined
): boolean =>
  revoked !== undefined &&
  revoked.terminal === undefined &&
  revoked.regionId === original.regionId &&
  revoked.executionId === original.executionId &&
  revoked.capturedAt === original.capturedAt &&
  remoteExecutionRegionalRecoveryIdentity(revoked) ===
    remoteExecutionRegionalRecoveryIdentity(original) &&
  revoked.status === original.status &&
  revoked.latestCursor === original.latestCursor &&
  revoked.executionStateDigest === original.executionStateDigest &&
  hasExactRemoteExecutionRegionalRecoveryLease(revoked, original);

const revokeTerminals = async (
  outcomes: readonly PreparedOutcome[],
  broker:
    | Pick<RemoteExecutionTerminalBroker, 'closeExecution' | 'sweepExpired'>
    | undefined,
  target: RemoteExecutionRegionalRecoveryProbe,
  cutoverAt: number,
  concurrency: number
): Promise<void> => {
  const revocations = outcomes.filter((outcome) => outcome.revokeTerminal);
  if (revocations.length === 0) return;
  if (!broker)
    throw new RemoteExecutionRegionalRecoveryOperatorError(
      'terminal-revocation-unavailable'
    );
  try {
    for (const outcome of revocations) {
      const closed = await broker.closeExecution(
        outcome.executionId,
        'transport-lost'
      );
      if (closed !== 1)
        throw new RemoteExecutionRegionalRecoveryOperatorError(
          'terminal-revocation-failed'
        );
    }
    await broker.sweepExpired();
  } catch (error) {
    if (error instanceof RemoteExecutionRegionalRecoveryOperatorError)
      throw error;
    throw new RemoteExecutionRegionalRecoveryOperatorError(
      'terminal-revocation-failed'
    );
  }
  const revoked = await executeBounded(revocations, concurrency, (outcome) =>
    capture(target, outcome.executionId, cutoverAt)
  );
  if (
    revoked.some(
      (checkpoint, index) =>
        !verifyRevokedCheckpoint(revocations[index]!.target, checkpoint)
    )
  )
    throw new RemoteExecutionRegionalRecoveryOperatorError(
      'terminal-revocation-failed'
    );
};

const validDigest = (value: string): boolean => digestPattern.test(value);

const validAuthorization = (
  decision: RemoteExecutionRegionalRecoveryAuthorizationDecision,
  scopeDigest: string,
  now: number,
  maximumProofLifetimeMs: number
): decision is Extract<
  RemoteExecutionRegionalRecoveryAuthorizationDecision,
  { kind: 'authorized' }
> =>
  decision.kind === 'authorized' &&
  decision.scopeDigest === scopeDigest &&
  validDigest(decision.grantDigest) &&
  validDigest(decision.principalDigest) &&
  Number.isSafeInteger(decision.expiresAt) &&
  decision.expiresAt > now &&
  decision.expiresAt <= now + maximumProofLifetimeMs;

const validFence = (
  decision: RemoteExecutionRegionalInfrastructureFenceDecision,
  scopeDigest: string,
  now: number,
  cutoverAt: number,
  maximumProofLifetimeMs: number
): decision is Extract<
  RemoteExecutionRegionalInfrastructureFenceDecision,
  { kind: 'verified' }
> =>
  decision.kind === 'verified' &&
  decision.scopeDigest === scopeDigest &&
  validDigest(decision.fenceDigest) &&
  Number.isSafeInteger(decision.incidentObservedAt) &&
  decision.incidentObservedAt >= 0 &&
  Number.isSafeInteger(decision.sourceFencedAt) &&
  decision.sourceFencedAt >= decision.incidentObservedAt &&
  decision.sourceFencedAt <= cutoverAt &&
  Number.isSafeInteger(decision.expiresAt) &&
  decision.expiresAt > now &&
  decision.expiresAt <= now + maximumProofLifetimeMs;

const validAttestation = (
  decision: RemoteExecutionRegionalReplicationAttestationDecision,
  scopeDigest: string,
  checkpointDigest: string,
  now: number,
  cutoverAt: number,
  maximumProofLifetimeMs: number
): decision is Extract<
  RemoteExecutionRegionalReplicationAttestationDecision,
  { kind: 'verified' }
> =>
  decision.kind === 'verified' &&
  decision.scopeDigest === scopeDigest &&
  decision.targetCheckpointDigest === checkpointDigest &&
  validDigest(decision.attestationDigest) &&
  Number.isSafeInteger(decision.lastReplicatedAt) &&
  decision.lastReplicatedAt >= 0 &&
  decision.lastReplicatedAt <= cutoverAt &&
  Number.isSafeInteger(decision.expiresAt) &&
  decision.expiresAt > now &&
  decision.expiresAt <= now + maximumProofLifetimeMs;

const createEvidence = (input: {
  scope: RemoteExecutionRegionalRecoveryAuthorizationScope;
  scopeDigest: string;
  authorization: Extract<
    RemoteExecutionRegionalRecoveryAuthorizationDecision,
    { kind: 'authorized' }
  >;
  targetCheckpointDigest: string;
  cutoverCheckpointDigest: string;
  outcomes: readonly PreparedOutcome[];
  rpo: RemoteExecutionRegionalRecoveryRpoEvidence;
  preparedAt: number;
  rtoStartedAt: number;
}): RemoteExecutionRegionalRecoveryOperatorEvidence => {
  const base = Object.freeze({
    format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
    version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
    operationId: input.scope.operationId,
    mode: input.scope.mode,
    deploymentId: input.scope.deploymentId,
    sourceRegionId: input.scope.sourceRegionId,
    targetRegionId: input.scope.targetRegionId,
    sourceTrafficEpoch: input.scope.expectedTrafficEpoch,
    targetTrafficEpoch: input.scope.expectedTrafficEpoch + 1,
    executionCount: input.scope.executionCount,
    executionSetDigest: input.scope.executionSetDigest,
    targetCheckpointDigest: input.targetCheckpointDigest,
    cutoverCheckpointDigest: input.cutoverCheckpointDigest,
    authorizationGrantDigest: input.authorization.grantDigest,
    principalDigest: input.authorization.principalDigest,
    outcomes: outcomeCounts(input.outcomes),
    rpo: input.rpo,
    timing: Object.freeze({
      initiatedAt: input.scope.initiatedAt,
      cutoverAt: input.scope.cutoverAt,
      preparedAt: input.preparedAt,
      rtoStartedAt: input.rtoStartedAt,
      measuredRtoMs: input.preparedAt - input.rtoStartedAt,
      measurementBoundary: 'operator-prepared-before-traffic-commit' as const,
    }),
  });
  return Object.freeze({ ...base, evidenceDigest: digest(base) });
};

export type CreateRemoteExecutionRegionalRecoveryOperatorOptions = Readonly<{
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  source: RemoteExecutionRegionalRecoveryProbe;
  target: RemoteExecutionRegionalRecoveryProbe;
  trafficAuthority: RemoteExecutionRegionalTrafficAuthority;
  authorization: RemoteExecutionRegionalRecoveryAuthorizationPort;
  infrastructureFence?: RemoteExecutionRegionalInfrastructureFencePort;
  replicationAttestation?: RemoteExecutionRegionalReplicationAttestationPort;
  targetTerminalBroker?: Pick<
    RemoteExecutionTerminalBroker,
    'closeExecution' | 'sweepExpired'
  >;
  maximumWorkerAttempts: number;
  maximumBatchSize?: number;
  maximumConcurrentCaptures?: number;
  maximumRequestAgeMs: number;
  maximumProofLifetimeMs: number;
  maximumAcceptedRpoMs: number;
  now?: () => number;
}>;

/**
 * Executes one all-or-nothing traffic epoch transition. No public HTTP
 * transport is provided: deployments must invoke this from a protected,
 * one-shot operator job and supply concrete authorization/fencing verifiers.
 */
export const createRemoteExecutionRegionalRecoveryOperator = (
  options: CreateRemoteExecutionRegionalRecoveryOperatorOptions
): RemoteExecutionRegionalRecoveryOperator => {
  const deploymentId = identifier(
    options.deploymentId,
    'Remote regional deployment id'
  );
  const sourceRegionId = identifier(
    options.sourceRegionId,
    'Remote regional source region id'
  );
  const targetRegionId = identifier(
    options.targetRegionId,
    'Remote regional target region id'
  );
  if (sourceRegionId === targetRegionId)
    throw new TypeError('Remote regional recovery requires distinct regions.');
  const maximumWorkerAttempts = positiveInteger(
    options.maximumWorkerAttempts,
    'Remote regional maximum worker attempts'
  );
  const maximumBatchSize = positiveInteger(
    options.maximumBatchSize ??
      REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize,
    'Remote regional recovery batch size',
    REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumBatchSize
  );
  const maximumConcurrentCaptures = positiveInteger(
    options.maximumConcurrentCaptures ?? 8,
    'Remote regional recovery capture concurrency',
    REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS.maximumConcurrentCaptures
  );
  const maximumRequestAgeMs = positiveInteger(
    options.maximumRequestAgeMs,
    'Remote regional recovery request age'
  );
  const maximumProofLifetimeMs = positiveInteger(
    options.maximumProofLifetimeMs,
    'Remote regional recovery proof lifetime'
  );
  const configuredMaximumRpoMs = nonnegativeInteger(
    options.maximumAcceptedRpoMs,
    'Remote regional recovery RPO bound'
  );
  const now = options.now ?? Date.now;

  return Object.freeze({
    async execute(request, credentials) {
      const startedAt = timestamp(now(), 'Remote regional operator time');
      if (
        request.format !== REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT ||
        request.version !==
          REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION ||
        (request.mode !== 'planned' && request.mode !== 'source-unavailable')
      )
        throw new TypeError('Remote regional recovery request is invalid.');
      const operationId = identifier(
        request.operationId,
        'Remote regional recovery operation id'
      );
      const executionIds = request.executionIds.map((executionId) =>
        identifier(executionId, 'Remote regional recovery execution id')
      );
      if (
        executionIds.length < 1 ||
        executionIds.length > maximumBatchSize ||
        new Set(executionIds).size !== executionIds.length
      )
        throw new TypeError('Remote regional recovery batch is invalid.');
      executionIds.sort((left, right) => left.localeCompare(right));
      const expectedTrafficEpoch = positiveInteger(
        request.expectedTrafficEpoch,
        'Remote regional recovery traffic epoch'
      );
      const initiatedAt = timestamp(
        request.initiatedAt,
        'Remote regional recovery initiation time'
      );
      const cutoverAt = timestamp(
        request.cutoverAt,
        'Remote regional recovery cutover time'
      );
      if (
        initiatedAt > cutoverAt ||
        cutoverAt > startedAt ||
        startedAt - initiatedAt > maximumRequestAgeMs
      )
        throw new TypeError(
          'Remote regional recovery request time is invalid.'
        );
      let requestedMaximumRpoMs: number | undefined;
      if (request.mode === 'planned') {
        if (request.maximumAcceptedRpoMs !== undefined)
          throw new TypeError(
            'Planned regional recovery cannot accept data loss.'
          );
        if (
          credentials.infrastructureFenceProof !== undefined ||
          credentials.replicationAttestation !== undefined
        )
          throw new TypeError(
            'Planned regional recovery received unexpected proof material.'
          );
      } else {
        requestedMaximumRpoMs = nonnegativeInteger(
          request.maximumAcceptedRpoMs!,
          'Remote regional recovery accepted RPO'
        );
        if (requestedMaximumRpoMs > configuredMaximumRpoMs)
          throw new RemoteExecutionRegionalRecoveryOperatorError(
            'rpo-bound-exceeded'
          );
      }
      const authorizationGrant = opaqueCredential(
        credentials.authorizationGrant,
        'Remote regional recovery authorization grant'
      );
      const scope: RemoteExecutionRegionalRecoveryAuthorizationScope =
        Object.freeze({
          format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
          version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
          operationId,
          deploymentId,
          sourceRegionId,
          targetRegionId,
          mode: request.mode,
          expectedTrafficEpoch,
          executionCount: executionIds.length,
          executionSetDigest:
            createRemoteExecutionRegionalRecoveryExecutionSetDigest(
              executionIds
            ),
          initiatedAt,
          cutoverAt,
          ...(requestedMaximumRpoMs === undefined
            ? {}
            : { maximumAcceptedRpoMs: requestedMaximumRpoMs }),
        });
      const scopeDigest = digest(scope);
      let authorization: RemoteExecutionRegionalRecoveryAuthorizationDecision;
      try {
        authorization = await options.authorization.consume(
          scope,
          authorizationGrant
        );
      } catch {
        throw new RemoteExecutionRegionalRecoveryOperatorError(
          'authorization-denied'
        );
      }
      if (authorization.kind === 'denied')
        throw new RemoteExecutionRegionalRecoveryOperatorError(
          'authorization-denied'
        );
      if (
        !validAuthorization(
          authorization,
          scopeDigest,
          startedAt,
          maximumProofLifetimeMs
        )
      )
        throw new RemoteExecutionRegionalRecoveryOperatorError(
          'authorization-invalid'
        );

      let cutover;
      try {
        cutover = await options.trafficAuthority.cutover(
          {
            deploymentId,
            expectedEpoch: expectedTrafficEpoch,
            sourceRegionId,
            targetRegionId,
            cutoverAt,
          },
          async () => {
            let fence:
              | Extract<
                  RemoteExecutionRegionalInfrastructureFenceDecision,
                  { kind: 'verified' }
                >
              | undefined;
            if (request.mode === 'source-unavailable') {
              if (!options.infrastructureFence)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'fence-unverified'
                );
              const proof = credentials.infrastructureFenceProof;
              if (!proof)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'fence-proof-required'
                );
              const verifiedAt = timestamp(
                now(),
                'Remote regional fence verification time'
              );
              let decision: RemoteExecutionRegionalInfrastructureFenceDecision;
              try {
                decision = await options.infrastructureFence.verify(
                  scope,
                  opaqueCredential(
                    proof,
                    'Remote regional infrastructure fence proof'
                  )
                );
              } catch {
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'fence-unverified'
                );
              }
              if (
                !validFence(
                  decision,
                  scopeDigest,
                  verifiedAt,
                  cutoverAt,
                  maximumProofLifetimeMs
                )
              )
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'fence-unverified'
                );
              fence = decision;
            }

            const pairs = await executeBounded(
              executionIds,
              maximumConcurrentCaptures,
              async (executionId) => {
                const [source, target] = await Promise.all([
                  request.mode === 'planned'
                    ? capture(options.source, executionId, cutoverAt)
                    : Promise.resolve(undefined),
                  capture(options.target, executionId, cutoverAt),
                ]);
                if (
                  (source &&
                    !validCheckpoint(
                      source,
                      sourceRegionId,
                      executionId,
                      cutoverAt
                    )) ||
                  (target &&
                    !validCheckpoint(
                      target,
                      targetRegionId,
                      executionId,
                      cutoverAt
                    ))
                )
                  throw new RemoteExecutionRegionalRecoveryOperatorError(
                    'checkpoint-invalid'
                  );
                return Object.freeze({ source, target });
              }
            );
            const targets = pairs.map(({ target }) => {
              if (!target)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'checkpoint-unavailable'
                );
              return target;
            });
            const targetBatchDigest =
              createRemoteExecutionRegionalRecoveryTargetCheckpointDigest(
                targets
              );
            let attestation:
              | Extract<
                  RemoteExecutionRegionalReplicationAttestationDecision,
                  { kind: 'verified' }
                >
              | undefined;
            if (request.mode === 'source-unavailable') {
              if (!options.replicationAttestation)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'replication-attestation-unverified'
                );
              const proof = credentials.replicationAttestation;
              if (!proof)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'replication-attestation-required'
                );
              const verifiedAt = timestamp(
                now(),
                'Remote regional replication verification time'
              );
              let decision: RemoteExecutionRegionalReplicationAttestationDecision;
              try {
                decision = await options.replicationAttestation.verify(
                  { scope, targetCheckpointDigest: targetBatchDigest },
                  opaqueCredential(
                    proof,
                    'Remote regional replication attestation'
                  )
                );
              } catch {
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'replication-attestation-unverified'
                );
              }
              if (
                !validAttestation(
                  decision,
                  scopeDigest,
                  targetBatchDigest,
                  verifiedAt,
                  cutoverAt,
                  maximumProofLifetimeMs
                )
              )
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'replication-attestation-unverified'
                );
              const measuredRpoMs = cutoverAt - decision.lastReplicatedAt;
              if (measuredRpoMs > requestedMaximumRpoMs!)
                throw new RemoteExecutionRegionalRecoveryOperatorError(
                  'rpo-bound-exceeded'
                );
              attestation = decision;
            }

            const outcomes = pairs.map(({ source, target }) =>
              request.mode === 'planned'
                ? plannedOutcome(
                    source,
                    target,
                    cutoverAt,
                    maximumWorkerAttempts
                  )
                : sourceUnavailableOutcome(
                    target!,
                    cutoverAt,
                    maximumWorkerAttempts,
                    attestation!.attestationDigest
                  )
            );
            await revokeTerminals(
              outcomes,
              options.targetTerminalBroker,
              options.target,
              cutoverAt,
              maximumConcurrentCaptures
            );
            const preparedAt = timestamp(
              now(),
              'Remote regional recovery preparation time'
            );
            if (preparedAt < startedAt || preparedAt < cutoverAt)
              throw new TypeError(
                'Remote regional recovery preparation time moved backwards.'
              );
            if (authorization.expiresAt <= preparedAt)
              throw new RemoteExecutionRegionalRecoveryOperatorError(
                'authorization-invalid'
              );
            if (fence && fence.expiresAt <= preparedAt)
              throw new RemoteExecutionRegionalRecoveryOperatorError(
                'fence-unverified'
              );
            if (attestation && attestation.expiresAt <= preparedAt)
              throw new RemoteExecutionRegionalRecoveryOperatorError(
                'replication-attestation-unverified'
              );
            const checkpointDigest = aggregateCutoverDigest(
              scopeDigest,
              targetBatchDigest,
              outcomes
            );
            const rpo: RemoteExecutionRegionalRecoveryRpoEvidence =
              request.mode === 'planned'
                ? Object.freeze({
                    kind: 'exact-replicated-checkpoint',
                    maximumMs: 0,
                  })
                : Object.freeze({
                    kind: 'attested-upper-bound',
                    maximumMs: cutoverAt - attestation!.lastReplicatedAt,
                    lastReplicatedAt: attestation!.lastReplicatedAt,
                    fenceDigest: fence!.fenceDigest,
                    attestationDigest: attestation!.attestationDigest,
                  });
            const evidence = createEvidence({
              scope,
              scopeDigest,
              authorization,
              targetCheckpointDigest: targetBatchDigest,
              cutoverCheckpointDigest: checkpointDigest,
              outcomes,
              rpo,
              preparedAt,
              rtoStartedAt:
                request.mode === 'planned'
                  ? initiatedAt
                  : fence!.incidentObservedAt,
            });
            return Object.freeze({
              // The durable traffic row anchors the complete sanitized
              // evidence record. cutoverCheckpointDigest remains the
              // aggregate execution/checkpoint digest nested inside it.
              checkpointDigest: evidence.evidenceDigest,
              result: evidence,
            });
          }
        );
      } catch (error) {
        if (error instanceof RemoteExecutionRegionalRecoveryOperatorError)
          throw error;
        throw new RemoteExecutionRegionalRecoveryOperatorError(
          'authority-unavailable'
        );
      }
      if (cutover.kind === 'conflict')
        return Object.freeze({
          kind: 'conflict' as const,
          ...(cutover.state ? { state: cutover.state } : {}),
        });
      return Object.freeze({
        kind: 'cutover' as const,
        state: cutover.state,
        evidence: cutover.result,
      });
    },
  });
};
