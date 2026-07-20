import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ExecutionJobStatus } from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalBroker } from './remoteExecutionTerminal.types';

export const REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT =
  'prodivix.remote-execution-regional-recovery' as const;
export const REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION = 1 as const;

const terminalStatuses = new Set<ExecutionJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);

export type RemoteExecutionRegionalRecoveryLease = Readonly<{
  workerId: string;
  attempt: number;
  acquiredAt: number;
  expiresAt: number;
}>;

export type RemoteExecutionRegionalTerminalCheckpoint = Readonly<{
  terminalSessionId: string;
  revision: number;
  expiresAt: number;
  sealedStateDigest: string;
}>;

/**
 * Metadata-only, credential-free view of one region's durable execution state.
 * stateDigest covers the exact request, provider, events, artifact bytes,
 * authority row, lease token digest, snapshot grant/blob and Terminal row.
 */
export type RemoteExecutionRegionalRecoveryCheckpoint = Readonly<{
  format: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT;
  version: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION;
  regionId: string;
  executionId: string;
  ownerId: string;
  requestId: string;
  providerId: string;
  snapshotId: string;
  snapshotDigest: string;
  status: ExecutionJobStatus;
  latestCursor: number;
  /** Exact durable state excluding the independently revoked Terminal row. */
  executionStateDigest: string;
  stateDigest: string;
  capturedAt: number;
  lease?: RemoteExecutionRegionalRecoveryLease;
  terminal?: RemoteExecutionRegionalTerminalCheckpoint;
}>;

export type RemoteExecutionRegionalRecoveryProbe = Readonly<{
  capture(
    executionId: string,
    capturedAt: number
  ): Promise<RemoteExecutionRegionalRecoveryCheckpoint | undefined>;
}>;

export type RemoteExecutionRegionalRecoveryReadyMode =
  | 'queued-claim'
  | 'same-worker-continuation'
  | 'worker-reclaim'
  | 'worker-recovery-exhausted';

export type RemoteExecutionRegionalRecoveryAssessment =
  | Readonly<{
      kind: 'ready';
      mode: RemoteExecutionRegionalRecoveryReadyMode;
      checkpointDigest: string;
      source: RemoteExecutionRegionalRecoveryCheckpoint;
      target: RemoteExecutionRegionalRecoveryCheckpoint;
      terminalAction: 'preserve' | 'close-transport-lost' | 'none';
      nextWorkerAttempt?: number;
    }>
  | Readonly<{
      kind: 'terminal';
      checkpointDigest: string;
      source: RemoteExecutionRegionalRecoveryCheckpoint;
      target: RemoteExecutionRegionalRecoveryCheckpoint;
    }>
  | Readonly<{
      kind: 'wait-for-replication';
      reason:
        | 'target-missing'
        | 'execution-cursor-behind'
        | 'terminal-revision-behind';
      source: RemoteExecutionRegionalRecoveryCheckpoint;
      target?: RemoteExecutionRegionalRecoveryCheckpoint;
    }>
  | Readonly<{
      kind: 'blocked';
      reason:
        | 'source-missing'
        | 'identity-diverged'
        | 'target-ahead'
        | 'state-diverged'
        | 'lease-shape-invalid';
      source?: RemoteExecutionRegionalRecoveryCheckpoint;
      target?: RemoteExecutionRegionalRecoveryCheckpoint;
    }>;

export const remoteExecutionRegionalRecoveryIdentity = (
  checkpoint: RemoteExecutionRegionalRecoveryCheckpoint
): string =>
  JSON.stringify([
    checkpoint.executionId,
    checkpoint.ownerId,
    checkpoint.requestId,
    checkpoint.providerId,
    checkpoint.snapshotId,
    checkpoint.snapshotDigest,
  ]);

export const createRemoteExecutionRegionalRecoveryCheckpointDigest = (
  source: RemoteExecutionRegionalRecoveryCheckpoint,
  target: RemoteExecutionRegionalRecoveryCheckpoint,
  mode: RemoteExecutionRegionalRecoveryReadyMode | 'terminal'
): string =>
  `sha256-${bytesToHex(
    sha256(
      utf8ToBytes(
        JSON.stringify({
          format: REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
          version: REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
          executionId: source.executionId,
          sourceRegionId: source.regionId,
          targetRegionId: target.regionId,
          stateDigest: source.stateDigest,
          latestCursor: source.latestCursor,
          terminalRevision: source.terminal?.revision ?? null,
          mode,
        })
      )
    )
  )}`;

export const hasExactRemoteExecutionRegionalRecoveryLease = (
  source: RemoteExecutionRegionalRecoveryCheckpoint,
  target: RemoteExecutionRegionalRecoveryCheckpoint
): boolean =>
  JSON.stringify(source.lease ?? null) === JSON.stringify(target.lease ?? null);

/**
 * Fails closed on any same-cursor drift. A lower cursor/revision is the only
 * state treated as ordinary replication lag; an ahead target is never chosen
 * automatically because it is evidence of a split writer or stale source.
 */
export const assessRemoteExecutionRegionalRecovery = (input: {
  source?: RemoteExecutionRegionalRecoveryCheckpoint;
  target?: RemoteExecutionRegionalRecoveryCheckpoint;
  now: number;
  maximumWorkerAttempts: number;
}): RemoteExecutionRegionalRecoveryAssessment => {
  if (!Number.isSafeInteger(input.now) || input.now < 0)
    throw new TypeError('Remote regional recovery time is invalid.');
  if (
    !Number.isSafeInteger(input.maximumWorkerAttempts) ||
    input.maximumWorkerAttempts < 1
  )
    throw new TypeError(
      'Remote regional recovery maximum worker attempts must be positive.'
    );
  if (!input.source)
    return Object.freeze({ kind: 'blocked', reason: 'source-missing' });
  if (!input.target)
    return Object.freeze({
      kind: 'wait-for-replication',
      reason: 'target-missing',
      source: input.source,
    });
  const { source, target } = input;
  if (
    source.format !== REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT ||
    target.format !== REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT ||
    source.version !== REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION ||
    target.version !== REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION ||
    source.regionId === target.regionId ||
    remoteExecutionRegionalRecoveryIdentity(source) !==
      remoteExecutionRegionalRecoveryIdentity(target)
  )
    return Object.freeze({
      kind: 'blocked',
      reason: 'identity-diverged',
      source,
      target,
    });
  if (target.latestCursor < source.latestCursor)
    return Object.freeze({
      kind: 'wait-for-replication',
      reason: 'execution-cursor-behind',
      source,
      target,
    });
  if ((target.terminal?.revision ?? 0) < (source.terminal?.revision ?? 0))
    return Object.freeze({
      kind: 'wait-for-replication',
      reason: 'terminal-revision-behind',
      source,
      target,
    });
  if (
    target.latestCursor > source.latestCursor ||
    (target.terminal?.revision ?? 0) > (source.terminal?.revision ?? 0)
  )
    return Object.freeze({
      kind: 'blocked',
      reason: 'target-ahead',
      source,
      target,
    });
  if (source.stateDigest !== target.stateDigest)
    return Object.freeze({
      kind: 'blocked',
      reason: 'state-diverged',
      source,
      target,
    });
  if (!hasExactRemoteExecutionRegionalRecoveryLease(source, target))
    return Object.freeze({
      kind: 'blocked',
      reason: 'state-diverged',
      source,
      target,
    });
  if (terminalStatuses.has(source.status))
    return Object.freeze({
      kind: 'terminal',
      checkpointDigest: createRemoteExecutionRegionalRecoveryCheckpointDigest(
        source,
        target,
        'terminal'
      ),
      source,
      target,
    });
  if (!source.lease) {
    if (source.status !== 'queued')
      return Object.freeze({
        kind: 'blocked',
        reason: 'lease-shape-invalid',
        source,
        target,
      });
    return Object.freeze({
      kind: 'ready',
      mode: 'queued-claim',
      checkpointDigest: createRemoteExecutionRegionalRecoveryCheckpointDigest(
        source,
        target,
        'queued-claim'
      ),
      source,
      target,
      terminalAction: 'none',
      nextWorkerAttempt: 1,
    });
  }
  if (source.lease.expiresAt > input.now)
    return Object.freeze({
      kind: 'ready',
      mode: 'same-worker-continuation',
      checkpointDigest: createRemoteExecutionRegionalRecoveryCheckpointDigest(
        source,
        target,
        'same-worker-continuation'
      ),
      source,
      target,
      terminalAction: 'preserve',
      nextWorkerAttempt: source.lease.attempt,
    });
  const exhausted = source.lease.attempt >= input.maximumWorkerAttempts;
  const mode = exhausted ? 'worker-recovery-exhausted' : 'worker-reclaim';
  return Object.freeze({
    kind: 'ready',
    mode,
    checkpointDigest: createRemoteExecutionRegionalRecoveryCheckpointDigest(
      source,
      target,
      mode
    ),
    source,
    target,
    terminalAction: source.terminal ? 'close-transport-lost' : 'none',
    ...(exhausted ? {} : { nextWorkerAttempt: source.lease.attempt + 1 }),
  });
};

export type RemoteExecutionRegionalTrafficPermit = Readonly<{
  deploymentId: string;
  regionId: string;
  epoch: number;
  release(): Promise<void>;
}>;

export type RemoteExecutionRegionalTrafficState = Readonly<{
  deploymentId: string;
  activeRegionId: string;
  epoch: number;
  checkpointDigest?: string;
  updatedAt: number;
}>;

export type RemoteExecutionRegionalTrafficCutoverEvidence = Readonly<{
  deploymentId: string;
  epoch: number;
  sourceRegionId: string;
  targetRegionId: string;
  checkpointDigest: string;
  cutoverAt: number;
}>;

export type RemoteExecutionRegionalTrafficCutoverResult<Result> =
  | Readonly<{
      kind: 'cutover';
      state: RemoteExecutionRegionalTrafficState;
      result: Result;
    }>
  | Readonly<{
      kind: 'conflict';
      state?: RemoteExecutionRegionalTrafficState;
    }>;

/**
 * acquire holds a shared regional permit for the whole request. cutover must
 * take an exclusive permit, drain all acquired requests, run prepare while no
 * region can mutate, and only then advance the durable epoch.
 */
export type RemoteExecutionRegionalTrafficAuthority = Readonly<{
  initialize(input: {
    deploymentId: string;
    activeRegionId: string;
    initializedAt: number;
  }): Promise<RemoteExecutionRegionalTrafficState>;
  inspect(
    deploymentId: string
  ): Promise<RemoteExecutionRegionalTrafficState | undefined>;
  listCutovers(
    deploymentId: string,
    maximumRecords: number
  ): Promise<readonly RemoteExecutionRegionalTrafficCutoverEvidence[]>;
  acquire(input: {
    deploymentId: string;
    regionId: string;
  }): Promise<RemoteExecutionRegionalTrafficPermit | undefined>;
  cutover<Result>(
    input: {
      deploymentId: string;
      expectedEpoch: number;
      sourceRegionId: string;
      targetRegionId: string;
      cutoverAt: number;
    },
    prepare: () => Promise<
      Readonly<{ checkpointDigest: string; result: Result }>
    >
  ): Promise<RemoteExecutionRegionalTrafficCutoverResult<Result>>;
}>;

export type RemoteExecutionRegionalTrafficGate = Readonly<{
  acquire(): Promise<RemoteExecutionRegionalTrafficPermit | undefined>;
}>;

export const createRemoteExecutionRegionalTrafficGate = (input: {
  authority: RemoteExecutionRegionalTrafficAuthority;
  deploymentId: string;
  regionId: string;
}): RemoteExecutionRegionalTrafficGate =>
  Object.freeze({
    acquire: () =>
      input.authority.acquire({
        deploymentId: input.deploymentId,
        regionId: input.regionId,
      }),
  });

export type RemoteExecutionRegionalRecoveryCoordinator = Readonly<{
  cutover(input: {
    executionId: string;
    expectedTrafficEpoch: number;
    cutoverAt: number;
  }): Promise<
    RemoteExecutionRegionalTrafficCutoverResult<RemoteExecutionRegionalRecoveryAssessment>
  >;
}>;

export const createRemoteExecutionRegionalRecoveryCoordinator = (input: {
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  source: RemoteExecutionRegionalRecoveryProbe;
  target: RemoteExecutionRegionalRecoveryProbe;
  trafficAuthority: RemoteExecutionRegionalTrafficAuthority;
  maximumWorkerAttempts: number;
  targetTerminalBroker?: Pick<
    RemoteExecutionTerminalBroker,
    'closeExecution' | 'sweepExpired'
  >;
}): RemoteExecutionRegionalRecoveryCoordinator => {
  if (input.sourceRegionId === input.targetRegionId)
    throw new TypeError('Remote regional recovery requires distinct regions.');
  return Object.freeze({
    async cutover(request) {
      return input.trafficAuthority.cutover(
        {
          deploymentId: input.deploymentId,
          expectedEpoch: request.expectedTrafficEpoch,
          sourceRegionId: input.sourceRegionId,
          targetRegionId: input.targetRegionId,
          cutoverAt: request.cutoverAt,
        },
        async () => {
          const [source, target] = await Promise.all([
            input.source.capture(request.executionId, request.cutoverAt),
            input.target.capture(request.executionId, request.cutoverAt),
          ]);
          if (
            (source &&
              (source.regionId !== input.sourceRegionId ||
                source.executionId !== request.executionId)) ||
            (target &&
              (target.regionId !== input.targetRegionId ||
                target.executionId !== request.executionId))
          )
            throw new RemoteExecutionRegionalRecoveryError('blocked', {
              kind: 'blocked',
              reason: 'identity-diverged',
              ...(source ? { source } : {}),
              ...(target ? { target } : {}),
            });
          const assessment = assessRemoteExecutionRegionalRecovery({
            source,
            target,
            now: request.cutoverAt,
            maximumWorkerAttempts: input.maximumWorkerAttempts,
          });
          if (assessment.kind === 'blocked')
            throw new RemoteExecutionRegionalRecoveryError(
              'blocked',
              assessment
            );
          if (assessment.kind === 'wait-for-replication')
            throw new RemoteExecutionRegionalRecoveryError(
              'replication-lag',
              assessment
            );
          if (
            assessment.kind === 'ready' &&
            assessment.terminalAction === 'close-transport-lost'
          ) {
            if (!input.targetTerminalBroker)
              throw new RemoteExecutionRegionalRecoveryError(
                'terminal-revocation-unavailable',
                assessment
              );
            const closed = await input.targetTerminalBroker.closeExecution(
              request.executionId,
              'transport-lost'
            );
            if (closed !== 1)
              throw new RemoteExecutionRegionalRecoveryError(
                'terminal-revocation-failed',
                assessment
              );
            await input.targetTerminalBroker.sweepExpired();
            const revoked = await input.target.capture(
              request.executionId,
              request.cutoverAt
            );
            if (
              !revoked ||
              revoked.terminal ||
              remoteExecutionRegionalRecoveryIdentity(revoked) !==
                remoteExecutionRegionalRecoveryIdentity(assessment.target) ||
              revoked.status !== assessment.target.status ||
              revoked.latestCursor !== assessment.target.latestCursor ||
              !hasExactRemoteExecutionRegionalRecoveryLease(
                revoked,
                assessment.target
              ) ||
              revoked.executionStateDigest !==
                assessment.target.executionStateDigest
            )
              throw new RemoteExecutionRegionalRecoveryError(
                'terminal-revocation-failed',
                assessment
              );
          }
          return Object.freeze({
            checkpointDigest: assessment.checkpointDigest,
            result: assessment,
          });
        }
      );
    },
  });
};

export class RemoteExecutionRegionalRecoveryError extends Error {
  readonly code:
    | 'blocked'
    | 'replication-lag'
    | 'terminal-revocation-unavailable'
    | 'terminal-revocation-failed';
  readonly assessment: RemoteExecutionRegionalRecoveryAssessment;

  constructor(
    code: RemoteExecutionRegionalRecoveryError['code'],
    assessment: RemoteExecutionRegionalRecoveryAssessment
  ) {
    super(`Remote regional recovery failed closed: ${code}.`);
    this.name = 'RemoteExecutionRegionalRecoveryError';
    this.code = code;
    this.assessment = assessment;
  }
}
