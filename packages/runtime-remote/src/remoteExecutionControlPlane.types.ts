import type {
  ExecutableProjectSnapshot,
  ExecutionJobEvent,
  ExecutionJobStatus,
  ExecutionLogRecord,
  ExecutionProviderDescriptor,
  ExecutionRequest,
  ExecutionTraceRecord,
} from '@prodivix/runtime-core';
import type { ProdivixDiagnostic } from '@prodivix/diagnostics';
import type {
  RemoteExecutionArtifactDescriptor,
  RemoteExecutionOperation,
  RemoteExecutionRecord,
  RemoteExecutionRequestEnvelope,
  RemoteExecutionResponseEnvelope,
} from './remoteExecutionProtocol.types';
import type {
  RemoteExecutionServerAuthority,
  RemoteExecutionServerAuthorityLease,
} from './remoteExecutionServerAuthority';

export type RemoteExecutionPrincipal = Readonly<{
  subjectId: string;
  scopes: readonly string[];
}>;

export type RemoteExecutionRequestContext = Readonly<{
  principal?: RemoteExecutionPrincipal;
  /** Trusted transport metadata; never part of the public execution envelope. */
  serverAuthority?: RemoteExecutionServerAuthority;
}>;

export type RemoteExecutionAuthorizationDecision =
  Readonly<{ allowed: true }> | Readonly<{ allowed: false; reason?: string }>;

export type RemoteExecutionAuthorizationPolicy = Readonly<{
  authorize(
    input: Readonly<{
      principal: RemoteExecutionPrincipal;
      operation: RemoteExecutionOperation;
      executionId?: string;
      request?: ExecutionRequest;
    }>
  ): Promise<RemoteExecutionAuthorizationDecision>;
}>;

export type RemoteExecutionQuotaDecision =
  | Readonly<{ allowed: true; maximumActiveExecutions: number }>
  | Readonly<{ allowed: false; reason?: string }>;

export type RemoteExecutionQuotaPolicy = Readonly<{
  check(
    input: Readonly<{
      principal: RemoteExecutionPrincipal;
      request: ExecutionRequest;
    }>
  ): Promise<RemoteExecutionQuotaDecision>;
}>;

export type RemoteExecutionProviderRouter = Readonly<{
  select(
    request: ExecutionRequest
  ): Promise<ExecutionProviderDescriptor | undefined>;
}>;

export type RemoteExecutionStoredSnapshot = Readonly<{
  snapshotId: string;
  contentDigest: string;
  snapshot: ExecutableProjectSnapshot;
  storedAt: number;
}>;

export type RemoteExecutionSnapshotStore = Readonly<{
  put(
    ownerId: string,
    snapshot: ExecutableProjectSnapshot,
    storedAt: number
  ): Promise<RemoteExecutionStoredSnapshot>;
  get(
    ownerId: string,
    snapshotId: string,
    contentDigest: string
  ): Promise<RemoteExecutionStoredSnapshot | undefined>;
}>;

export type RemoteExecutionStoredEvent = Readonly<{
  cursor: number;
  event: ExecutionJobEvent;
  workerEventId?: string;
  workerEventIdentity?: string;
}>;

export type RemoteExecutionWorkerEvent =
  | Readonly<{ kind: 'log'; log: ExecutionLogRecord }>
  | Readonly<{ kind: 'diagnostic'; diagnostic: ProdivixDiagnostic }>
  | Readonly<{ kind: 'trace'; trace: ExecutionTraceRecord }>;

export type RemoteExecutionIngestionLimits = Readonly<{
  maximumEvents: number;
  maximumEventBytes: number;
  maximumLogBytes: number;
  maximumArtifacts: number;
  maximumArtifactBytes: number;
  maximumSingleArtifactBytes: number;
  maximumArtifactRetentionMs: number;
}>;

export type RemoteExecutionArtifactBlob = Readonly<{
  descriptor: RemoteExecutionArtifactDescriptor;
  contents: Uint8Array;
}>;

export type RemoteExecutionArtifactPutResult =
  | Readonly<{
      kind: 'stored' | 'existing';
      execution: RemoteExecutionStoredRecord;
    }>
  | Readonly<{ kind: 'lease-rejected' }>
  | Readonly<{ kind: 'identity-conflict' }>
  | Readonly<{ kind: 'secret-leak' }>
  | Readonly<{ kind: 'budget-exceeded' }>;

export type RemoteExecutionEventAppendResult =
  | Readonly<{
      kind: 'stored' | 'existing';
      execution: RemoteExecutionStoredRecord;
    }>
  | Readonly<{ kind: 'lease-rejected' }>
  | Readonly<{ kind: 'identity-conflict' }>
  | Readonly<{ kind: 'secret-leak' }>
  | Readonly<{ kind: 'budget-exceeded' }>;

export type RemoteExecutionLease = Readonly<{
  workerId: string;
  token: string;
  attempt: number;
  acquiredAt: number;
  expiresAt: number;
}>;

export type RemoteExecutionStoredRecord = Readonly<{
  ownerId: string;
  identityKey: string;
  request: ExecutionRequest;
  snapshotId: string;
  record: RemoteExecutionRecord;
  events: readonly RemoteExecutionStoredEvent[];
  artifacts: readonly RemoteExecutionArtifactDescriptor[];
  cancellationIds: readonly string[];
  lease?: RemoteExecutionLease;
}>;

export type RemoteExecutionCreateMutationResult =
  | Readonly<{ kind: 'created'; execution: RemoteExecutionStoredRecord }>
  | Readonly<{ kind: 'existing'; execution: RemoteExecutionStoredRecord }>
  | Readonly<{ kind: 'identity-conflict' }>
  | Readonly<{ kind: 'quota-exceeded' }>;

export type RemoteExecutionCancelMutationResult =
  | Readonly<{ kind: 'not-found' }>
  | Readonly<{ kind: 'forbidden' }>
  | Readonly<{
      kind: 'cancelled';
      result: 'accepted' | 'already-requested' | 'already-terminal';
      execution: RemoteExecutionStoredRecord;
    }>;

export type RemoteExecutionClaimResult = Readonly<{
  execution: RemoteExecutionStoredRecord;
  lease: RemoteExecutionLease;
  authority?: RemoteExecutionServerAuthorityLease;
}>;

export type RemoteExecutionRepository = Readonly<{
  createOrGet(
    input: Readonly<{
      ownerId: string;
      identityKey: string;
      request: ExecutionRequest;
      snapshotId: string;
      snapshotDigest: string;
      provider: ExecutionProviderDescriptor;
      executionId: string;
      createdAt: number;
      maximumActiveExecutions: number;
      serverAuthority?: RemoteExecutionServerAuthority;
    }>
  ): Promise<RemoteExecutionCreateMutationResult>;
  get(executionId: string): Promise<RemoteExecutionStoredRecord | undefined>;
  getByOwnerRequest(
    ownerId: string,
    requestId: string
  ): Promise<RemoteExecutionStoredRecord | undefined>;
  countActive(ownerId: string): Promise<number>;
  cancel(
    input: Readonly<{
      ownerId: string;
      executionId: string;
      cancellationId: string;
      reason?: string;
      cancelledAt: number;
    }>
  ): Promise<RemoteExecutionCancelMutationResult>;
  claimNext(
    input: Readonly<{
      workerId: string;
      providerId: string;
      leaseToken: string;
      now: number;
      leaseDurationMs: number;
    }>
  ): Promise<RemoteExecutionClaimResult | undefined>;
  renewLease(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      now: number;
      leaseDurationMs: number;
    }>
  ): Promise<RemoteExecutionLease | undefined>;
  transition(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      status: ExecutionJobStatus;
      now: number;
      reason?: string;
    }>
  ): Promise<RemoteExecutionStoredRecord | undefined>;
  appendWorkerEvent(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      emittedAt: number;
      workerEventId: string;
      event: RemoteExecutionWorkerEvent;
      limits: RemoteExecutionIngestionLimits;
    }>
  ): Promise<RemoteExecutionEventAppendResult>;
  putArtifact(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      workerEventId: string;
      emittedAt: number;
      descriptor: RemoteExecutionArtifactDescriptor;
      contents: Uint8Array;
      limits: RemoteExecutionIngestionLimits;
    }>
  ): Promise<RemoteExecutionArtifactPutResult>;
  getArtifact(
    input: Readonly<{
      ownerId: string;
      executionId: string;
      artifactId: string;
      now: number;
    }>
  ): Promise<RemoteExecutionArtifactBlob | undefined>;
  sweepExpiredArtifacts(
    input: Readonly<{
      now: number;
      limit: number;
    }>
  ): Promise<number>;
}>;

export type RemoteExecutionControlPlane = Readonly<{
  handle(
    envelope: RemoteExecutionRequestEnvelope,
    context: RemoteExecutionRequestContext
  ): Promise<RemoteExecutionResponseEnvelope>;
  claimNext(
    input: Readonly<{
      workerId: string;
      providerId: string;
      leaseDurationMs: number;
    }>
  ): Promise<RemoteExecutionClaimResult | undefined>;
  renewLease(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      leaseDurationMs: number;
    }>
  ): Promise<RemoteExecutionLease | undefined>;
  transition(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      status: ExecutionJobStatus;
      reason?: string;
    }>
  ): Promise<RemoteExecutionStoredRecord | undefined>;
  appendWorkerEvent(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      workerEventId: string;
      event: RemoteExecutionWorkerEvent;
    }>
  ): Promise<RemoteExecutionEventAppendResult>;
  putArtifact(
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      workerEventId: string;
      descriptor: RemoteExecutionArtifactDescriptor;
      contents: Uint8Array;
    }>
  ): Promise<RemoteExecutionArtifactPutResult>;
  getArtifact(
    input: Readonly<{
      principal: RemoteExecutionPrincipal;
      executionId: string;
      artifactId: string;
    }>
  ): Promise<RemoteExecutionArtifactBlob | undefined>;
  sweepExpiredArtifacts(limit: number): Promise<number>;
}>;
