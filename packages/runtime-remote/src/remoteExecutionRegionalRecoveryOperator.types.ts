import type { RemoteExecutionRegionalTrafficState } from './remoteExecutionRegionalRecovery';

export const REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT =
  'prodivix.remote-execution-regional-recovery-operator' as const;
export const REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION = 1 as const;

export const REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_LIMITS = Object.freeze(
  {
    maximumBatchSize: 128,
    maximumCredentialBytes: 16 * 1_024,
    maximumConcurrentCaptures: 16,
  }
);

export type RemoteExecutionRegionalRecoveryOperatorMode =
  'planned' | 'source-unavailable';

export type RemoteExecutionRegionalRecoveryOperatorRequest = Readonly<{
  format: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT;
  version: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION;
  operationId: string;
  mode: RemoteExecutionRegionalRecoveryOperatorMode;
  executionIds: readonly string[];
  expectedTrafficEpoch: number;
  initiatedAt: number;
  cutoverAt: number;
  /** Required only for source-unavailable recovery. */
  maximumAcceptedRpoMs?: number;
}>;

/**
 * Callback-bound proof bytes are kept outside the request/evidence models so
 * callers cannot accidentally serialize credentials with an operator record.
 */
export type RemoteExecutionRegionalRecoveryOperatorCredentials = Readonly<{
  authorizationGrant: Uint8Array;
  infrastructureFenceProof?: Uint8Array;
  replicationAttestation?: Uint8Array;
}>;

export type RemoteExecutionRegionalRecoveryAuthorizationScope = Readonly<{
  format: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT;
  version: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION;
  operationId: string;
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  mode: RemoteExecutionRegionalRecoveryOperatorMode;
  expectedTrafficEpoch: number;
  executionCount: number;
  executionSetDigest: string;
  initiatedAt: number;
  cutoverAt: number;
  maximumAcceptedRpoMs?: number;
}>;

export type RemoteExecutionRegionalRecoveryAuthorizationDecision =
  | Readonly<{ kind: 'denied' }>
  | Readonly<{
      kind: 'authorized';
      scopeDigest: string;
      grantDigest: string;
      principalDigest: string;
      expiresAt: number;
    }>;

/** consume must atomically reject a previously used grant. */
export type RemoteExecutionRegionalRecoveryAuthorizationPort = Readonly<{
  consume(
    scope: RemoteExecutionRegionalRecoveryAuthorizationScope,
    grant: Uint8Array
  ): Promise<RemoteExecutionRegionalRecoveryAuthorizationDecision>;
}>;

/** Durable replay fence used by signed-grant authorization adapters. */
export type RemoteExecutionRegionalRecoveryGrantReplayStore = Readonly<{
  consume(
    input: Readonly<{
      grantDigest: string;
      expiresAt: number;
      consumedAt: number;
    }>
  ): Promise<boolean>;
}>;

export type RemoteExecutionRegionalInfrastructureFenceDecision =
  | Readonly<{ kind: 'unverified' }>
  | Readonly<{
      kind: 'verified';
      scopeDigest: string;
      fenceDigest: string;
      incidentObservedAt: number;
      sourceFencedAt: number;
      expiresAt: number;
    }>;

/**
 * The verifier is deployment-specific. A verified result must mean old
 * ingress, schedulers and workers cannot mutate the source authority anymore.
 */
export type RemoteExecutionRegionalInfrastructureFencePort = Readonly<{
  verify(
    scope: RemoteExecutionRegionalRecoveryAuthorizationScope,
    proof: Uint8Array
  ): Promise<RemoteExecutionRegionalInfrastructureFenceDecision>;
}>;

export type RemoteExecutionRegionalReplicationAttestationDecision =
  | Readonly<{ kind: 'unverified' }>
  | Readonly<{
      kind: 'verified';
      scopeDigest: string;
      targetCheckpointDigest: string;
      attestationDigest: string;
      lastReplicatedAt: number;
      expiresAt: number;
    }>;

/**
 * A verifier must bind replication telemetry to the exact target batch
 * checkpoint. Merely proving that a replica exists is insufficient.
 */
export type RemoteExecutionRegionalReplicationAttestationPort = Readonly<{
  verify(
    input: Readonly<{
      scope: RemoteExecutionRegionalRecoveryAuthorizationScope;
      targetCheckpointDigest: string;
    }>,
    attestation: Uint8Array
  ): Promise<RemoteExecutionRegionalReplicationAttestationDecision>;
}>;

export type RemoteExecutionRegionalRecoveryOutcomeCounts = Readonly<{
  terminal: number;
  queuedClaim: number;
  sameWorkerContinuation: number;
  workerReclaim: number;
  workerRecoveryExhausted: number;
}>;

export type RemoteExecutionRegionalRecoveryRpoEvidence =
  | Readonly<{
      kind: 'exact-replicated-checkpoint';
      maximumMs: 0;
    }>
  | Readonly<{
      kind: 'attested-upper-bound';
      maximumMs: number;
      lastReplicatedAt: number;
      fenceDigest: string;
      attestationDigest: string;
    }>;

/**
 * Secret-free record suitable for a protected CI artifact or evidence store.
 * It intentionally omits execution ids, request/owner ids, ARNs, proof bytes,
 * database locations, ciphertext and application input/output. A successful
 * traffic cutover persists evidenceDigest as its immutable checkpoint digest;
 * the self-digest alone is not a standalone authenticity claim.
 */
export type RemoteExecutionRegionalRecoveryOperatorEvidence = Readonly<{
  format: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT;
  version: typeof REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION;
  evidenceDigest: string;
  operationId: string;
  mode: RemoteExecutionRegionalRecoveryOperatorMode;
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  sourceTrafficEpoch: number;
  targetTrafficEpoch: number;
  executionCount: number;
  executionSetDigest: string;
  targetCheckpointDigest: string;
  cutoverCheckpointDigest: string;
  authorizationGrantDigest: string;
  principalDigest: string;
  outcomes: RemoteExecutionRegionalRecoveryOutcomeCounts;
  rpo: RemoteExecutionRegionalRecoveryRpoEvidence;
  timing: Readonly<{
    initiatedAt: number;
    cutoverAt: number;
    preparedAt: number;
    rtoStartedAt: number;
    measuredRtoMs: number;
    measurementBoundary: 'operator-prepared-before-traffic-commit';
  }>;
}>;

export type RemoteExecutionRegionalRecoveryOperatorResult =
  | Readonly<{
      kind: 'cutover';
      state: RemoteExecutionRegionalTrafficState;
      evidence: RemoteExecutionRegionalRecoveryOperatorEvidence;
    }>
  | Readonly<{
      kind: 'conflict';
      state?: RemoteExecutionRegionalTrafficState;
    }>;

export type RemoteExecutionRegionalRecoveryOperator = Readonly<{
  execute(
    request: RemoteExecutionRegionalRecoveryOperatorRequest,
    credentials: RemoteExecutionRegionalRecoveryOperatorCredentials
  ): Promise<RemoteExecutionRegionalRecoveryOperatorResult>;
}>;

export type RemoteExecutionRegionalRecoveryOperatorErrorCode =
  | 'authorization-denied'
  | 'authorization-invalid'
  | 'fence-proof-required'
  | 'fence-unverified'
  | 'replication-attestation-required'
  | 'replication-attestation-unverified'
  | 'rpo-bound-exceeded'
  | 'checkpoint-unavailable'
  | 'checkpoint-invalid'
  | 'recovery-blocked'
  | 'replication-lag'
  | 'terminal-revocation-unavailable'
  | 'terminal-revocation-failed'
  | 'authority-unavailable';

export class RemoteExecutionRegionalRecoveryOperatorError extends Error {
  readonly code: RemoteExecutionRegionalRecoveryOperatorErrorCode;

  constructor(code: RemoteExecutionRegionalRecoveryOperatorErrorCode) {
    super(`Remote regional recovery operator failed closed: ${code}.`);
    this.name = 'RemoteExecutionRegionalRecoveryOperatorError';
    this.code = code;
  }
}
