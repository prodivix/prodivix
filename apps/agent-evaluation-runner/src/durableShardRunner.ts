import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
  AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT,
  canonicalAgentEvaluationCapabilityExecutionReceiptOrder,
  canonicalAgentEvaluationCapabilitySpecificReceiptOrder,
  canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder,
  canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder,
  canonicalAgentEvaluationAuthenticityOrder,
  canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationProviderResultSpoolId,
  createAgentEvaluationShardCheckpoint,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationProviderResultSpoolAad,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  isAgentBudgetLedgerState,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentEvaluationCapabilityExecutionReceipt,
  isAgentEvaluationCapabilitySpecificReceipt,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  isAgentEvaluationExecutionReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationPreDispatchFailureReceipt,
  isAgentEvaluationProviderResultSpoolAad,
  isAgentEvaluationProviderResultSpoolDispositionReceipt,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentEvaluationResultSubmissionReceipt,
  isAgentEvaluationShardCheckpoint,
  isAgentEvaluationSourceReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  isAgentModelEvaluationAttempt,
  matchAgentEvaluationCapabilitySpecificProviderObservation,
  normalizeAgentCosts,
  planAgentModelEvaluationAttempts,
  validateAgentEvaluationPreDispatchFailureCoverage,
  validateAgentModelEvaluationPlan,
  type AgentBudgetDemand,
  type AgentBudgetLedgerResult,
  type AgentBudgetLedgerState,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationInvocationTurnSetReceipt,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationProviderResultSpoolAad,
  type AgentEvaluationProviderResultSpoolDispositionReceipt,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationProviderResultSpoolReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationRepositoryWriteResult,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationShardCheckpoint,
  type AgentEvaluationShardLease,
  type AgentEvaluationShardRunResult,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationTransportReceipt,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationMissingAttemptRef,
  type AgentModelEvaluationPlan,
  type Instant,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationAttemptExecutor,
  AgentEvaluationAttemptExecutorResult,
  AgentEvaluationPreDispatchAttemptFinalizer,
  AgentEvaluationReceiptPersistence,
} from './attemptExecutor';
import {
  decodeAgentEvaluationVerificationAttemptGrantReceipt,
  type AgentEvaluationVerificationAttemptGrantIssueInput,
  type AgentEvaluationVerificationAttemptGrantIssuer,
} from './verificationAttemptGrantClient';
import {
  isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  nativeOptionalCapabilityBootstrapIngressMatchesTransport,
  type AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
} from './nativeOptionalCapabilityBootstrapIngress';
/*
 * The grant client owns full G3 plan/run and backend grant validation. This
 * runner only rechecks the descriptor/lease bindings it supplies.
 */
type VerificationGrantBinding = Readonly<{
  namespaceId: string;
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  leaseGeneration: number;
}>;

const assertVerificationGrantIssueInput = (
  input: AgentEvaluationVerificationAttemptGrantIssueInput,
  expected: VerificationGrantBinding
): void => {
  if (
    input.namespaceId !== expected.namespaceId ||
    input.evaluationPlanDigest !== expected.plan.planDigest ||
    input.repositoryCommit !== expected.plan.repositoryCommit ||
    !sameCanonicalJson(input.descriptor, expected.descriptor) ||
    input.generation !== expected.leaseGeneration
  ) {
    throw new TypeError(
      'Evaluation verification attempt grant input drifted from the shard lease.'
    );
  }
};

const assertVerificationGrantIssueInputs = (
  inputs: readonly AgentEvaluationVerificationAttemptGrantIssueInput[],
  expected: VerificationGrantBinding
): readonly AgentEvaluationVerificationAttemptGrantIssueInput[] => {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError(
      'Evaluation verification attempt grant inputs are missing.'
    );
  }
  const first = inputs[0]!;
  const expectedCellIds = [...first.verificationPlan.cells]
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .map(({ id }) => id);
  const actualCellIds = inputs.map(({ cellId }) => cellId);
  if (
    !sameCanonicalJson(actualCellIds, expectedCellIds) ||
    inputs.some((input) => {
      assertVerificationGrantIssueInput(input, expected);
      return (
        !sameCanonicalJson(input.verificationPlan, first.verificationPlan) ||
        input.projectId !== first.projectId ||
        input.trustCeiling !== first.trustCeiling ||
        input.expiresAt !== first.expiresAt
      );
    })
  ) {
    throw new TypeError(
      'Evaluation verification attempt grant cell coverage is invalid.'
    );
  }
  return Object.freeze([...inputs]);
};

const decodeVerificationAttemptGrantCoverage = (
  receipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[],
  issueInputs: readonly AgentEvaluationVerificationAttemptGrantIssueInput[],
  exactCoverage: boolean
): readonly AgentEvaluationVerificationAttemptGrantReceipt[] => {
  const issueInputByCellId = new Map(
    issueInputs.map((input) => [input.cellId, input])
  );
  const decoded = receipts.map((receipt) => {
    const issueInput = issueInputByCellId.get(receipt.cellId);
    if (!issueInput) {
      throw new TypeError(
        'Evaluation verification attempt grant receipt references an unknown cell.'
      );
    }
    return decodeAgentEvaluationVerificationAttemptGrantReceipt(
      receipt,
      issueInput
    );
  });
  const canonical =
    canonicalAgentEvaluationVerificationAttemptGrantReceipts(decoded);
  if (
    !sameCanonicalJson(receipts, canonical) ||
    new Set(canonical.map(({ cellId }) => cellId)).size !== canonical.length ||
    (exactCoverage && canonical.length !== issueInputs.length)
  ) {
    throw new TypeError(
      'Evaluation verification attempt grant receipt coverage is invalid.'
    );
  }
  return canonical;
};

export type AgentEvaluationDurableShardCheckpointPolicy = Readonly<{
  completedAttemptInterval: number;
  maximumIntervalMs: number;
}>;

export type AgentEvaluationDurableShardSettings = Readonly<{
  ownerId: string;
  leaseDurationMs: number;
  checkpoint: AgentEvaluationDurableShardCheckpointPolicy;
}>;

export const createAgentEvaluationAttemptBudgetReservationId = (
  input: Readonly<{
    planDigest: string;
    shardId: string;
    descriptorDigest: string;
  }>
): string =>
  `evaluation-reservation.${digestAgentCanonicalValue(input).slice('sha256-'.length)}`;

export type AgentEvaluationDurableEncryptedResultSpool = Readonly<{
  aad: AgentEvaluationProviderResultSpoolAad;
  envelope: AgentEvaluationProviderResultSpoolEnvelope;
  responseDigest: string;
  retentionPolicyDigest: string;
  expiresAt: Instant;
}>;

type AgentEvaluationDurableTurnRecordBase = Readonly<{
  attemptId: string;
  descriptorDigest: string;
  turnIndex: number;
  budgetReservationId: string;
  dispatchIntent: AgentEvaluationTransportDispatchIntent;
  createdAt: Instant;
  turnDigest: string;
}>;

export type AgentEvaluationDurableTurnRecord = Readonly<
  AgentEvaluationDurableTurnRecordBase &
    (
      | Readonly<{
          state: 'dispatched';
          transportReceipt?: never;
          resultSpoolReceipt?: never;
          closedAt?: never;
        }>
      | Readonly<{
          state: 'closed';
          transportReceipt: AgentEvaluationTransportReceipt;
          resultSpoolReceipt?: AgentEvaluationProviderResultSpoolReceipt;
          closedAt: Instant;
        }>
    )
>;

export type AgentEvaluationDurableResultSpoolAccessReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-provider-result-spool-access-receipt';
  version: 1;
  spoolRef: string;
  spoolReceiptDigest: string;
  attemptId: string;
  turnIndex: number;
  expectedTurnDigest: string;
  shardId: string;
  ownerId: string;
  leaseGeneration: number;
  accessedAt: Instant;
  receiptDigest: string;
}>;

export type AgentEvaluationDurableResultSpoolRead =
  AgentEvaluationDurableEncryptedResultSpool &
    Readonly<{
      resultSpoolReceipt: AgentEvaluationProviderResultSpoolReceipt;
      accessReceipt: AgentEvaluationDurableResultSpoolAccessReceipt;
    }>;

export type AgentEvaluationDurableReceiptPersistence = Readonly<{
  namespaceDigest: string;
  listTransportTurns(): Promise<readonly AgentEvaluationDurableTurnRecord[]>;
  persistTransportDispatchIntent(
    input: Readonly<{
      turnIndex: number;
      dispatchIntent: AgentEvaluationTransportDispatchIntent;
    }>
  ): Promise<AgentEvaluationDurableTurnRecord>;
  closeTransportTurn(
    input: Readonly<{
      turnIndex: number;
      expectedIntentDigest: string;
      transportReceipt: AgentEvaluationTransportReceipt;
      encryptedResultSpool?: AgentEvaluationDurableEncryptedResultSpool;
      nativeOptionalCapabilityBootstrapIngress?: AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress;
      closedAt: Instant;
    }>
  ): Promise<AgentEvaluationDurableTurnRecord>;
  readEncryptedResultSpool(
    input: Readonly<{
      turnIndex: number;
      expectedTurnDigest: string;
    }>
  ): Promise<AgentEvaluationDurableResultSpoolRead>;
  stageResultSpoolDispositionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationProviderResultSpoolDispositionReceipt>;
  persistPreDispatchFailureReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationPreDispatchFailureReceipt>;
  persistCapabilityExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationCapabilityExecutionReceipt>;
  persistCapabilitySpecificReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationCapabilitySpecificReceipt>;
  persistProviderCapabilityObservationReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationProviderCapabilityObservationReceipt>;
  persistAttemptAuthorityOwnerReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationAttemptAuthorityOwnerReceipt>;
  persistSourceReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationSourceReceipt>;
  persistInvocationTurnReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationInvocationTurnReceipt>;
  persistResultSubmissionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationResultSubmissionReceipt>;
  persistControlledRuntimeReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationControlledRuntimeReceipt>;
  persistExecutionReceipt: AgentEvaluationReceiptPersistence<AgentEvaluationExecutionReceipt>;
}>;

export type AgentEvaluationDurableAttemptExecutorResult = Omit<
  AgentEvaluationAttemptExecutorResult,
  | 'invocationReceipt'
  | 'transportDispatchIntents'
  | 'transportReceipts'
  | 'providerResultSpoolReceipts'
  | 'providerResultSpoolDispositionReceipts'
  | 'invocationTurnReceipts'
  | 'invocationTurnSetReceipt'
> &
  Readonly<{
    transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
    transportReceipts: readonly AgentEvaluationTransportReceipt[];
    providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
    providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
    preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
    capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
    capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
    providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
    attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
    invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
    invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
    controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  }>;

type AgentEvaluationDurableAttemptCommitResult =
  AgentEvaluationDurableAttemptExecutorResult &
    Readonly<{
      verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
    }>;

type AgentEvaluationDurableExecutorInput = Parameters<
  AgentEvaluationAttemptExecutor['execute']
>[0];

export type AgentEvaluationDurableAttemptExecutor = Readonly<{
  execute(
    input: AgentEvaluationDurableExecutorInput
  ): Promise<AgentEvaluationDurableAttemptExecutorResult>;
  /** Resumes closed turns and may append only the next turn after exact replay. */
  resume(
    input: AgentEvaluationDurableExecutorInput &
      Readonly<{ turns: readonly AgentEvaluationDurableTurnRecord[] }>
  ): Promise<AgentEvaluationDurableAttemptExecutorResult>;
}>;

/** Constructs one descriptor-bound executor over the exact durable callbacks. */
export interface AgentEvaluationDurableAttemptExecutorFactory {
  /** Pure upper-bound estimate; it must not create an adapter or dispatch. */
  estimateShard: AgentEvaluationAttemptExecutor['estimateShard'];
  /** Controlled G3 owner supplies the exact plan/cell/run context. */
  prepareVerificationAttemptGrants(
    input: Readonly<{
      namespaceId: string;
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      leaseGeneration: number;
    }>
  ): Promise<readonly AgentEvaluationVerificationAttemptGrantIssueInput[]>;
  /** Supplies the classifier while the runner supplies durable callbacks/time. */
  createPreDispatchAttemptFinalizer(
    persistence: AgentEvaluationDurableReceiptPersistence,
    now: () => Instant
  ): AgentEvaluationPreDispatchAttemptFinalizer;
  create(
    persistence: AgentEvaluationDurableReceiptPersistence,
    verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[],
    authority: Readonly<{
      namespaceId: string;
      shardLeaseOwnerId: string;
      shardLeaseGeneration: number;
    }>
  ): AgentEvaluationDurableAttemptExecutor;
}

/**
 * Partition-bound async ledger surface used by the production HTTP adapter.
 * Every successful write returns the canonical value acknowledged by durable
 * storage, including immutable replays.
 */
export interface AgentEvaluationDurableShardLedger {
  readonly namespaceId: string;
  readonly namespaceDigest: string;
  listAttempts(): Promise<readonly AgentModelEvaluationAttempt[]>;
  listAttemptTurns(
    attemptId: string
  ): Promise<readonly AgentEvaluationDurableTurnRecord[]>;
  listPreDispatchFailureReceipts(): Promise<
    readonly AgentEvaluationPreDispatchFailureReceipt[]
  >;
  getLatestCheckpoint(
    shardId: string
  ): Promise<AgentEvaluationShardCheckpoint | undefined>;
  getBudgetLedger(): Promise<AgentBudgetLedgerState>;
  claimLease(
    input: Readonly<{
      planDigest: string;
      shardId: string;
      ownerId: string;
      acquiredAt: Instant;
      expiresAt: Instant;
    }>
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>>;
  renewLease(
    input: Readonly<{
      planDigest: string;
      shardId: string;
      ownerId: string;
      generation: number;
      renewedAt: Instant;
      expiresAt: Instant;
    }>
  ): Promise<AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>>;
  reserveBudget(
    input: Readonly<{
      reservationId: string;
      expectedRevision: number;
      demand: AgentBudgetDemand;
      reservedAt: Instant;
    }>
  ): Promise<AgentBudgetLedgerResult>;
  reconcileBudget(
    input: Readonly<{
      reservationId: string;
      expectedRevision: number;
      reason: 'ack-loss' | 'provider-disconnect' | 'timeout' | 'worker-loss';
      settledAt: Instant;
    }>
  ): Promise<AgentBudgetLedgerResult>;
  putPreDispatchFailureReceipt(
    receipt: AgentEvaluationPreDispatchFailureReceipt
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationPreDispatchFailureReceipt>
  >;
  putTurnDispatchIntent(
    input: Readonly<{
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turnIndex: number;
      budgetReservationId: string;
      dispatchIntent: AgentEvaluationTransportDispatchIntent;
    }>
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationDurableTurnRecord>
  >;
  closeTurnTransport(
    input: Readonly<{
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turnIndex: number;
      budgetReservationId: string;
      expectedIntentDigest: string;
      transportReceipt: AgentEvaluationTransportReceipt;
      encryptedResultSpool?: AgentEvaluationDurableEncryptedResultSpool;
      nativeOptionalCapabilityBootstrapIngress?: AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress;
      closedAt: Instant;
    }>
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationDurableTurnRecord>
  >;
  getTurnResultSpool(
    input: Readonly<{
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turnIndex: number;
      shardId: string;
      ownerId: string;
      leaseGeneration: number;
      expectedTurnDigest: string;
    }>
  ): Promise<AgentEvaluationDurableResultSpoolRead>;
  /**
   * Commits the complete receipt join, immutable attempt, and exact budget
   * settlement in one database transaction. Partial success is forbidden.
   */
  commitAttemptEvidence(
    input: Readonly<{
      reservationId: string;
      expectedRevision: number;
      actual: AgentBudgetDemand;
      settledAt: Instant;
      transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
      transportReceipts: readonly AgentEvaluationTransportReceipt[];
      providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
      providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
      preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
      capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
      capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
      providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
      attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
      verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
      invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
      invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
      sourceReceipts: readonly AgentEvaluationSourceReceipt[];
      resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
      controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
      executionReceipt: AgentEvaluationExecutionReceipt;
      attempt: AgentModelEvaluationAttempt;
    }>
  ): Promise<
    Readonly<{
      transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
      transportReceipts: readonly AgentEvaluationTransportReceipt[];
      providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
      providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
      preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
      capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
      capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
      providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
      attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
      verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
      invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
      invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
      sourceReceipts: readonly AgentEvaluationSourceReceipt[];
      resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
      controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
      executionReceipt: AgentEvaluationExecutionReceipt;
      attempt: AgentModelEvaluationAttempt;
      budgetLedger: AgentBudgetLedgerState;
      replayed: boolean;
    }>
  >;
  putCheckpoint(
    checkpoint: AgentEvaluationShardCheckpoint,
    expectedPreviousRevision: number
  ): Promise<
    AgentEvaluationRepositoryWriteResult<AgentEvaluationShardCheckpoint>
  >;
}

type ReconciliationReason = Parameters<
  AgentEvaluationDurableShardLedger['reconcileBudget']
>[0]['reason'];

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const assertInstant = (value: string): Instant => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError('Evaluation shard clock returned an invalid instant.');
  }
  return value;
};

const expiresAt = (from: Instant, durationMs: number): Instant => {
  const milliseconds = Date.parse(from) + durationMs;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new TypeError('Evaluation shard lease expiry is invalid.');
  }
  return assertInstant(new Date(milliseconds).toISOString());
};

const assertSettings = (
  settings: AgentEvaluationDurableShardSettings
): AgentEvaluationDurableShardSettings => {
  if (
    !identityPattern.test(settings.ownerId) ||
    !Number.isSafeInteger(settings.leaseDurationMs) ||
    settings.leaseDurationMs < 60_000 ||
    settings.leaseDurationMs > 3_600_000 ||
    !Number.isSafeInteger(settings.checkpoint.completedAttemptInterval) ||
    settings.checkpoint.completedAttemptInterval < 1 ||
    !Number.isSafeInteger(settings.checkpoint.maximumIntervalMs) ||
    settings.checkpoint.maximumIntervalMs < 1_000 ||
    settings.checkpoint.maximumIntervalMs >= settings.leaseDurationMs
  ) {
    throw new TypeError('Evaluation durable shard settings are invalid.');
  }
  return Object.freeze({
    ownerId: settings.ownerId,
    leaseDurationMs: settings.leaseDurationMs,
    checkpoint: Object.freeze({ ...settings.checkpoint }),
  });
};

const normalizeDemand = (demand: AgentBudgetDemand): AgentBudgetDemand => {
  const counts = [
    demand.modelInvocations,
    demand.toolCalls,
    demand.repairRounds,
    demand.transactions,
    demand.artifactBytes,
    demand.elapsedMs,
  ];
  if (counts.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('Evaluation attempt budget demand is invalid.');
  }
  const value = Object.freeze({
    ...demand,
    usage: createAgentUsageVector(demand.usage.amounts),
    cost: normalizeAgentCosts(demand.cost),
  });
  if (!sameCanonicalJson(value, demand)) {
    throw new TypeError('Evaluation attempt budget demand is non-canonical.');
  }
  return value;
};

const plannedShardDescriptors = (
  plan: AgentModelEvaluationPlan,
  shardId: string
): readonly AgentModelEvaluationAttemptDescriptor[] => {
  if (
    validateAgentModelEvaluationPlan(plan).length > 0 ||
    !identityPattern.test(shardId)
  ) {
    throw new TypeError('Evaluation plan or shard id is invalid.');
  }
  return Object.freeze(
    planAgentModelEvaluationAttempts(plan)
      .filter((descriptor) => descriptor.shardId === shardId)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
  );
};

const assertLease = (
  lease: AgentEvaluationShardLease,
  expected: Readonly<{
    planDigest: string;
    shardId: string;
    ownerId: string;
    generation?: number;
  }>
): void => {
  const { leaseDigest: _leaseDigest, ...base } = lease;
  if (
    lease.planDigest !== expected.planDigest ||
    lease.shardId !== expected.shardId ||
    lease.ownerId !== expected.ownerId ||
    !Number.isSafeInteger(lease.generation) ||
    lease.generation < 1 ||
    (expected.generation !== undefined &&
      lease.generation !== expected.generation) ||
    !sameCanonicalJson(
      Object.freeze({
        ...base,
        leaseDigest: digestAgentCanonicalValue(base),
      }),
      lease
    ) ||
    Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt)
  ) {
    throw new TypeError('Evaluation shard lease acknowledgement drifted.');
  }
  assertInstant(lease.acquiredAt);
  assertInstant(lease.expiresAt);
};

const missingRef = (
  descriptor: AgentModelEvaluationAttemptDescriptor,
  reason: AgentModelEvaluationMissingAttemptRef['reason']
): AgentModelEvaluationMissingAttemptRef =>
  Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    reason,
  });

const attemptMatchesDescriptor = (
  attempt: AgentModelEvaluationAttempt,
  descriptor: AgentModelEvaluationAttemptDescriptor
): boolean =>
  isAgentModelEvaluationAttempt(attempt) &&
  sameCanonicalJson(attempt.descriptor, descriptor);

const hasExactRecordShape = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey)
  ) {
    return false;
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const canonicalTurnRecord = (
  value: AgentEvaluationDurableTurnRecord
): Omit<AgentEvaluationDurableTurnRecord, 'turnDigest'> => {
  const { turnDigest: _turnDigest, ...base } = value;
  return base;
};

export const isAgentEvaluationDurableTurnRecord = (
  value: unknown
): value is AgentEvaluationDurableTurnRecord => {
  try {
    if (
      !hasExactRecordShape(
        value,
        [
          'attemptId',
          'descriptorDigest',
          'turnIndex',
          'budgetReservationId',
          'dispatchIntent',
          'createdAt',
          'state',
          'turnDigest',
        ],
        ['transportReceipt', 'resultSpoolReceipt', 'closedAt']
      )
    ) {
      return false;
    }
    const turn = value as AgentEvaluationDurableTurnRecord;
    const closed = turn.state === 'closed';
    if (
      !isAgentControlIdentity(turn.attemptId) ||
      !isAgentCanonicalDigest(turn.descriptorDigest) ||
      !Number.isSafeInteger(turn.turnIndex) ||
      turn.turnIndex < 0 ||
      !isAgentControlIdentity(turn.budgetReservationId) ||
      !isAgentEvaluationTransportDispatchIntent(turn.dispatchIntent) ||
      turn.dispatchIntent.attemptId !== turn.attemptId ||
      turn.dispatchIntent.descriptorDigest !== turn.descriptorDigest ||
      turn.dispatchIntent.turnIndex !== turn.turnIndex ||
      turn.dispatchIntent.budgetReservationId !== turn.budgetReservationId ||
      turn.createdAt !== turn.dispatchIntent.createdAt ||
      !['dispatched', 'closed'].includes(turn.state) ||
      !isAgentCanonicalDigest(turn.turnDigest) ||
      closed !== (turn.transportReceipt !== undefined) ||
      closed !== (turn.closedAt !== undefined) ||
      (!closed && turn.resultSpoolReceipt !== undefined)
    ) {
      return false;
    }
    if (closed) {
      const receipt = turn.transportReceipt;
      const spool = turn.resultSpoolReceipt;
      if (
        !isAgentEvaluationTransportReceipt(receipt) ||
        !isAgentControlInstant(turn.closedAt) ||
        turn.closedAt !== receipt.completedAt ||
        receipt.dispatchIntentDigest !== turn.dispatchIntent.intentDigest ||
        receipt.protocolFamily !== turn.dispatchIntent.protocolFamily ||
        receipt.providerConfigurationId !==
          turn.dispatchIntent.providerConfigurationId ||
        receipt.invocationId !== turn.dispatchIntent.invocationId ||
        receipt.requestDigest !== turn.dispatchIntent.requestDigest ||
        receipt.endpointId !== turn.dispatchIntent.endpointId ||
        receipt.endpointClass !== turn.dispatchIntent.endpointClass ||
        receipt.requestBodyDigest !== turn.dispatchIntent.requestBodyDigest ||
        receipt.requestBytes !== turn.dispatchIntent.requestBytes ||
        (receipt.outcome === 'completed') !== (spool !== undefined) ||
        (spool !== undefined &&
          (!isAgentEvaluationProviderResultSpoolReceipt(spool) ||
            spool.attemptId !== turn.attemptId ||
            spool.descriptorDigest !== turn.descriptorDigest ||
            spool.turnIndex !== turn.turnIndex ||
            spool.invocationId !== turn.dispatchIntent.invocationId ||
            spool.dispatchIntentDigest !== turn.dispatchIntent.intentDigest ||
            spool.transportReceiptDigest !== receipt.receiptDigest ||
            spool.responseBodyDigest !== receipt.responseBodyDigest))
      ) {
        return false;
      }
    }
    return (
      turn.turnDigest === digestAgentCanonicalValue(canonicalTurnRecord(turn))
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationDurableResultSpoolAccessReceipt = (
  value: unknown
): value is AgentEvaluationDurableResultSpoolAccessReceipt => {
  if (
    !hasExactRecordShape(value, [
      'format',
      'version',
      'spoolRef',
      'spoolReceiptDigest',
      'attemptId',
      'turnIndex',
      'expectedTurnDigest',
      'shardId',
      'ownerId',
      'leaseGeneration',
      'accessedAt',
      'receiptDigest',
    ])
  ) {
    return false;
  }
  const receipt = value as AgentEvaluationDurableResultSpoolAccessReceipt;
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      'prodivix.agent-evaluation-provider-result-spool-access-receipt' &&
    receipt.version === 1 &&
    isAgentControlIdentity(receipt.spoolRef) &&
    isAgentCanonicalDigest(receipt.spoolReceiptDigest) &&
    isAgentControlIdentity(receipt.attemptId) &&
    Number.isSafeInteger(receipt.turnIndex) &&
    receipt.turnIndex >= 0 &&
    isAgentCanonicalDigest(receipt.expectedTurnDigest) &&
    isAgentControlIdentity(receipt.shardId) &&
    isAgentControlIdentity(receipt.ownerId) &&
    Number.isSafeInteger(receipt.leaseGeneration) &&
    receipt.leaseGeneration >= 1 &&
    isAgentControlInstant(receipt.accessedAt) &&
    isAgentCanonicalDigest(receipt.receiptDigest) &&
    receipt.receiptDigest === digestAgentCanonicalValue(base)
  );
};

const spoolMatchesTransport = (
  spool: AgentEvaluationDurableEncryptedResultSpool,
  input: Readonly<{
    namespaceDigest: string;
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    intent: AgentEvaluationTransportDispatchIntent;
    transport: AgentEvaluationTransportReceipt;
  }>
): boolean =>
  isAgentEvaluationProviderResultSpoolAad(spool.aad) &&
  isAgentEvaluationProviderResultSpoolEnvelope(spool.envelope) &&
  isAgentCanonicalDigest(spool.responseDigest) &&
  isAgentCanonicalDigest(spool.retentionPolicyDigest) &&
  isAgentControlInstant(spool.expiresAt) &&
  spool.aad.namespaceDigest === input.namespaceDigest &&
  spool.aad.planDigest === input.plan.planDigest &&
  spool.aad.repositoryCommit === input.plan.repositoryCommit &&
  spool.aad.attemptId === input.descriptor.attemptId &&
  spool.aad.descriptorDigest === input.descriptor.descriptorDigest &&
  spool.aad.turnIndex === input.turnIndex &&
  spool.aad.invocationId === input.intent.invocationId &&
  spool.aad.dispatchIntentDigest === input.intent.intentDigest &&
  spool.aad.transportReceiptDigest === input.transport.receiptDigest &&
  spool.aad.responseBodyDigest === input.transport.responseBodyDigest &&
  spool.envelope.spoolId ===
    createAgentEvaluationProviderResultSpoolId(spool.aad) &&
  spool.envelope.aadDigest ===
    digestAgentEvaluationProviderResultSpoolAad(spool.aad) &&
  Date.parse(spool.expiresAt) > Date.parse(input.transport.completedAt);

/** Validates terminal result/runtime authority against the exact terminal turn. */
export const isAgentEvaluationDurableCompletionEvidence = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    attempt: AgentModelEvaluationAttempt;
    terminalTurn: AgentEvaluationInvocationTurnReceipt;
    executionReceipt: AgentEvaluationExecutionReceipt;
    resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
    controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  }>
): boolean => {
  const submission = input.resultSubmissionReceipt;
  const runtime = input.controlledRuntimeReceipt;
  if (input.attempt.status !== 'completed') {
    return (
      input.terminalTurn.status === input.attempt.status &&
      submission === undefined &&
      runtime === undefined
    );
  }
  const concreteCase = input.plan.concreteCases.find(
    ({ caseId }) => caseId === input.descriptor.caseId
  );
  const invocation = input.terminalTurn.invocationReceipt;
  if (
    !concreteCase ||
    input.terminalTurn.status !== 'completed' ||
    !input.terminalTurn.terminal ||
    !invocation ||
    !isAgentEvaluationResultSubmissionReceipt(submission) ||
    !isAgentEvaluationControlledRuntimeReceipt(runtime)
  ) {
    return false;
  }
  return (
    submission.attemptId === input.descriptor.attemptId &&
    submission.invocationId === invocation.invocationId &&
    submission.descriptorDigest === input.descriptor.descriptorDigest &&
    submission.caseId === concreteCase.caseId &&
    submission.caseDigest === concreteCase.caseDigest &&
    submission.caseDefinitionDigest === concreteCase.caseDefinitionDigest &&
    submission.caseDefinitionDigest ===
      input.terminalTurn.caseDefinitionDigest &&
    input.terminalTurn.resultSubmissionReceiptDigest ===
      submission.receiptDigest &&
    input.terminalTurn.controlledRuntimeReceiptDigest ===
      runtime.receiptDigest &&
    runtime.planDigest === input.plan.planDigest &&
    runtime.repositoryCommit === input.plan.repositoryCommit &&
    runtime.attemptId === input.descriptor.attemptId &&
    runtime.descriptorDigest === input.descriptor.descriptorDigest &&
    runtime.caseId === submission.caseId &&
    runtime.caseDigest === submission.caseDigest &&
    runtime.materialDigest === submission.materialDigest &&
    runtime.submissionReceiptDigest === submission.receiptDigest &&
    runtime.artifactResolution.resolvedArtifactBytes ===
      input.executionReceipt.artifactBytes &&
    runtime.isolatedExecution.toolCallCount ===
      input.executionReceipt.toolCalls &&
    runtime.isolatedExecution.toolReceiptSetDigest ===
      input.executionReceipt.toolReceiptSetDigest &&
    runtime.isolatedExecution.repairRoundCount ===
      input.executionReceipt.repairRounds &&
    runtime.isolatedExecution.transactionCount ===
      input.executionReceipt.transactions &&
    runtime.isolatedExecution.transactionReceiptSetDigest ===
      input.executionReceipt.transactionReceiptSetDigest &&
    runtime.g3Verification.verificationClosureDigest ===
      input.executionReceipt.verificationClosureDigest
  );
};

export type AgentEvaluationDurableAttemptEvidence = Readonly<{
  plan: AgentModelEvaluationPlan;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  demand: AgentBudgetDemand;
  transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
  transportReceipts: readonly AgentEvaluationTransportReceipt[];
  providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
  providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
  preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
  capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
  capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
  attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
  invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
  sourceReceipts: readonly AgentEvaluationSourceReceipt[];
  resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  executionReceipt: AgentEvaluationExecutionReceipt;
  attempt: AgentModelEvaluationAttempt;
}>;

/** Exact per-attempt join shared by staging and the HTTP ledger adapter. */
export const isAgentEvaluationDurableAttemptEvidence = (
  input: AgentEvaluationDurableAttemptEvidence
): boolean => {
  try {
    const demand = normalizeDemand(input.demand);
    const demandDigest = digestAgentCanonicalValue(demand);
    const target = input.plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === input.descriptor.targetId
    );
    const provider = target
      ? input.plan.providerConfigurations.find(
          ({ providerConfigurationId }) =>
            providerConfigurationId === target.providerConfigurationId
        )
      : undefined;
    const concreteCase = input.plan.concreteCases.find(
      ({ caseId }) => caseId === input.descriptor.caseId
    );
    const turns = input.invocationTurnReceipts;
    const terminalTurn = turns.at(-1);
    if (
      !terminalTurn ||
      !target ||
      !provider ||
      !concreteCase ||
      !attemptMatchesDescriptor(input.attempt, input.descriptor) ||
      !isAgentEvaluationExecutionReceipt(input.executionReceipt) ||
      !isAgentEvaluationInvocationTurnSetReceipt(
        input.invocationTurnSetReceipt
      ) ||
      input.executionReceipt.attemptId !== input.descriptor.attemptId ||
      input.executionReceipt.descriptorDigest !==
        input.descriptor.descriptorDigest ||
      input.invocationTurnSetReceipt.attemptId !== input.descriptor.attemptId ||
      input.invocationTurnSetReceipt.descriptorDigest !==
        input.descriptor.descriptorDigest ||
      !sameCanonicalJson(
        input.invocationTurnSetReceipt,
        createAgentEvaluationInvocationTurnSetReceipt({
          planDigest: input.plan.planDigest,
          repositoryCommit: input.plan.repositoryCommit,
          attemptId: input.descriptor.attemptId,
          descriptorDigest: input.descriptor.descriptorDigest,
          turns,
        })
      ) ||
      !sameCanonicalJson(
        input.transportDispatchIntents,
        canonicalAgentEvaluationAuthenticityOrder.transportDispatchIntents(
          input.transportDispatchIntents
        )
      ) ||
      !sameCanonicalJson(
        input.transportReceipts,
        canonicalAgentEvaluationAuthenticityOrder.transportReceipts(
          input.transportReceipts
        )
      ) ||
      !sameCanonicalJson(
        input.providerResultSpoolReceipts,
        canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolReceipts(
          input.providerResultSpoolReceipts
        )
      ) ||
      !sameCanonicalJson(
        input.providerResultSpoolDispositionReceipts,
        canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolDispositionReceipts(
          input.providerResultSpoolDispositionReceipts
        )
      ) ||
      !sameCanonicalJson(
        input.preDispatchFailureReceipts,
        canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
          input.preDispatchFailureReceipts
        )
      ) ||
      !sameCanonicalJson(
        input.capabilityExecutionReceipts,
        canonicalAgentEvaluationCapabilityExecutionReceiptOrder(
          input.capabilityExecutionReceipts
        )
      ) ||
      !sameCanonicalJson(
        input.capabilitySpecificReceipts,
        [...input.capabilitySpecificReceipts].sort(
          canonicalAgentEvaluationCapabilitySpecificReceiptOrder
        )
      ) ||
      !sameCanonicalJson(
        input.providerCapabilityObservationReceipts,
        [...input.providerCapabilityObservationReceipts].sort(
          canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder
        )
      ) ||
      !isAgentEvaluationProviderCapabilityObservationReceiptSet(
        input.providerCapabilityObservationReceipts,
        {
          planDigest: input.plan.planDigest,
          repositoryCommit: input.plan.repositoryCommit,
          attemptId: input.descriptor.attemptId,
          descriptorDigest: input.descriptor.descriptorDigest,
          maximumTurnCount: turns.length,
        }
      ) ||
      input.providerCapabilityObservationReceipts.some((observation) => {
        const turn = turns[observation.turnIndex];
        const dispatch = input.transportDispatchIntents.find(
          ({ turnIndex }) => turnIndex === observation.turnIndex
        );
        const transport = input.transportReceipts.find(
          ({ invocationId }) => invocationId === observation.invocationId
        );
        const spool = input.providerResultSpoolReceipts.find(
          ({ receiptDigest }) =>
            receiptDigest === observation.resultSpoolReceiptDigest
        );
        return (
          !isAgentEvaluationProviderCapabilityObservationReceipt(observation) ||
          observation.protocolFamily !== target.protocolFamily ||
          observation.providerConfigurationId !==
            target.providerConfigurationId ||
          observation.modelLineageDigest !== target.modelLineageDigest ||
          observation.adapterDigest !== provider.adapter.adapterDigest ||
          !turn ||
          turn.invocationId !== observation.invocationId ||
          turn.requestArtifactDigest !== observation.requestDigest ||
          turn.responseArtifactDigest !== observation.responseDigest ||
          !dispatch ||
          dispatch.intentDigest !== observation.dispatchIntentDigest ||
          !transport ||
          transport.receiptDigest !== observation.transportReceiptDigest ||
          transport.completedAt !== observation.observedAt ||
          !spool ||
          spool.dispatchIntentDigest !== observation.dispatchIntentDigest ||
          spool.transportReceiptDigest !== observation.transportReceiptDigest ||
          spool.responseDigest !== observation.responseDigest ||
          spool.normalizedEventSetDigest !==
            observation.normalizedEventSetDigest
        );
      }) ||
      !sameCanonicalJson(
        input.attemptAuthorityOwnerReceipts,
        [...input.attemptAuthorityOwnerReceipts].sort(
          canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder
        )
      ) ||
      !sameCanonicalJson(
        input.verificationAttemptGrantReceipts,
        canonicalAgentEvaluationVerificationAttemptGrantReceipts(
          input.verificationAttemptGrantReceipts
        )
      ) ||
      !sameCanonicalJson(
        turns,
        canonicalAgentEvaluationAuthenticityOrder.invocationTurnReceipts(turns)
      ) ||
      validateAgentEvaluationPreDispatchFailureCoverage({
        preDispatchFailureReceipts: input.preDispatchFailureReceipts,
        invocationTurnReceipts: turns,
      }).length > 0 ||
      input.capabilityExecutionReceipts.length !== 1 ||
      input.capabilityExecutionReceipts.some((receipt) => {
        const authoritativeTurn = turns[receipt.turnIndex];
        return (
          !isAgentEvaluationCapabilityExecutionReceipt(receipt) ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.attemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.caseId !== concreteCase.caseId ||
          receipt.caseDigest !== concreteCase.caseDigest ||
          receipt.targetId !== target.targetId ||
          receipt.targetDigest !== target.targetDigest ||
          receipt.capabilityProfileId !== concreteCase.capabilityProfileId ||
          receipt.capabilityProfileId !== target.capabilityProfileId ||
          receipt.capabilityDescriptorDigest !==
            concreteCase.capabilityDescriptorDigest ||
          receipt.capabilityDescriptorDigest !==
            input.descriptor.capabilityDescriptorDigest ||
          receipt.capabilityId !==
            concreteCase.capabilityDescriptor.capabilityId ||
          receipt.supportExpectation !==
            concreteCase.capabilityDescriptor.supportExpectation ||
          !sameCanonicalJson(
            receipt.expectedToolIds,
            concreteCase.capabilityDescriptor.expectedToolIds
          ) ||
          !sameCanonicalJson(
            receipt.expectedReceiptKinds,
            concreteCase.capabilityDescriptor.expectedReceiptKinds
          ) ||
          !authoritativeTurn ||
          authoritativeTurn.invocationId !== receipt.invocationId
        );
      }) ||
      input.attemptAuthorityOwnerReceipts.some(
        (receipt) =>
          !isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt) ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.attemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest
      ) ||
      input.attemptAuthorityOwnerReceipts.length >
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT ||
      new Set(
        input.attemptAuthorityOwnerReceipts.flatMap(
          ({ receiptDigest, requestDigest }) => [
            `receipt\u0000${receiptDigest}`,
            `request\u0000${requestDigest}`,
          ]
        )
      ).size !==
        input.attemptAuthorityOwnerReceipts.length * 2 ||
      input.capabilityExecutionReceipts.some((receipt) => {
        const expected = receipt.attemptAuthorityOwnerReceiptDigests;
        const actual = input.attemptAuthorityOwnerReceipts
          .filter(({ serviceKind }) => serviceKind === 'capability-runtime')
          .map(({ receiptDigest }) => receiptDigest)
          .sort(compareUnicodeCodePoints);
        return !sameCanonicalJson(expected, actual);
      }) ||
      (input.preDispatchFailureReceipts.length > 0
        ? input.attemptAuthorityOwnerReceipts.length !== 0
        : input.attemptAuthorityOwnerReceipts.filter(
            ({ serviceKind, operation }) =>
              serviceKind === 'attempt-grading' &&
              operation === 'grade-and-persist'
          ).length !== 1) ||
      new Set(
        input.capabilityExecutionReceipts.map(
          ({ attemptId, caseId, capabilityId }) =>
            `${attemptId}\u0000${caseId}\u0000${capabilityId}`
        )
      ).size !== input.capabilityExecutionReceipts.length ||
      input.capabilitySpecificReceipts.some((receipt) => {
        const authoritativeTurn = turns[receipt.turnIndex];
        const matchingProviderObservations =
          receipt.providerCapabilityObservationReceiptDigest === undefined
            ? []
            : input.providerCapabilityObservationReceipts.filter(
                (observation) =>
                  matchAgentEvaluationCapabilitySpecificProviderObservation(
                    receipt,
                    observation
                  )
              );
        return (
          !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.attemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.caseId !== concreteCase.caseId ||
          receipt.capabilityDescriptorDigest !==
            concreteCase.capabilityDescriptorDigest ||
          !authoritativeTurn ||
          authoritativeTurn.invocationId !== receipt.invocationId ||
          authoritativeTurn.requestArtifactDigest !== receipt.requestDigest ||
          (receipt.providerCapabilityObservationReceiptDigest === undefined
            ? matchingProviderObservations.length !== 0
            : matchingProviderObservations.length !== 1)
        );
      }) ||
      input.capabilitySpecificReceipts.length >
        AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT ||
      new Set(
        input.capabilitySpecificReceipts.map(
          ({ receiptDigest }) => receiptDigest
        )
      ).size !== input.capabilitySpecificReceipts.length ||
      input.capabilityExecutionReceipts.some((receipt) => {
        const expected = new Set(
          receipt.specificReceiptDigests.map(
            ({ receiptKind, receiptDigest }) =>
              `${receiptKind}\u0000${receiptDigest}`
          )
        );
        const actual = new Set(
          input.capabilitySpecificReceipts.map(
            ({ receiptKind, receiptDigest }) =>
              `${receiptKind}\u0000${receiptDigest}`
          )
        );
        return (
          expected.size !== receipt.specificReceiptDigests.length ||
          expected.size !== actual.size ||
          [...expected].some((entry) => !actual.has(entry))
        );
      }) ||
      (!input.preDispatchFailureReceipts.some(
        ({ reasonCode }) =>
          reasonCode === 'verification-attempt-grant-unavailable'
      ) &&
        input.verificationAttemptGrantReceipts.length === 0) ||
      input.verificationAttemptGrantReceipts.some(
        (receipt) =>
          !isAgentEvaluationVerificationAttemptGrantReceipt(receipt) ||
          receipt.namespaceId.length === 0 ||
          receipt.evaluationPlanDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit ||
          receipt.evaluationAttemptId !== input.descriptor.attemptId ||
          receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
          receipt.capabilityDescriptorDigest !==
            input.descriptor.capabilityDescriptorDigest ||
          receipt.caseId !== input.descriptor.caseId ||
          receipt.grant.attemptId !== input.descriptor.attemptId
      ) ||
      new Set(
        input.verificationAttemptGrantReceipts.map(({ cellId }) => cellId)
      ).size !== input.verificationAttemptGrantReceipts.length ||
      new Set(
        input.verificationAttemptGrantReceipts.map(
          ({ verificationPlanDigest }) => verificationPlanDigest
        )
      ).size > 1 ||
      new Set(
        input.verificationAttemptGrantReceipts.map(
          ({ namespaceId, generation }) => `${namespaceId}\u0000${generation}`
        )
      ).size > 1 ||
      input.sourceReceipts.some(
        (receipt) =>
          !isAgentEvaluationSourceReceipt(receipt) ||
          receipt.planDigest !== input.plan.planDigest ||
          receipt.repositoryCommit !== input.plan.repositoryCommit
      ) ||
      new Set(
        input.sourceReceipts.map(({ sourceReceiptId }) => sourceReceiptId)
      ).size !== input.sourceReceipts.length ||
      new Set(input.sourceReceipts.map(({ receiptDigest }) => receiptDigest))
        .size !== input.sourceReceipts.length ||
      input.transportDispatchIntents.some(
        (intent) =>
          !isAgentEvaluationTransportDispatchIntent(intent) ||
          intent.planDigest !== input.plan.planDigest ||
          intent.repositoryCommit !== input.plan.repositoryCommit ||
          intent.attemptId !== input.descriptor.attemptId ||
          intent.descriptorDigest !== input.descriptor.descriptorDigest ||
          intent.providerConfigurationId !== target.providerConfigurationId ||
          intent.protocolFamily !== target.protocolFamily ||
          intent.modelLineageDigest !== target.modelLineageDigest ||
          intent.inferenceConfigurationDigest !==
            target.inferenceConfigurationDigest ||
          intent.demandDigest !== demandDigest
      ) ||
      input.transportReceipts.some(
        (receipt) => !isAgentEvaluationTransportReceipt(receipt)
      ) ||
      input.providerResultSpoolReceipts.some(
        (receipt) => !isAgentEvaluationProviderResultSpoolReceipt(receipt)
      ) ||
      input.providerResultSpoolDispositionReceipts.some(
        (receipt) =>
          !isAgentEvaluationProviderResultSpoolDispositionReceipt(receipt)
      ) ||
      turns.some(
        (turn, turnIndex) =>
          !isAgentEvaluationInvocationTurnReceipt(turn) ||
          turn.planDigest !== input.plan.planDigest ||
          turn.repositoryCommit !== input.plan.repositoryCommit ||
          turn.attemptId !== input.descriptor.attemptId ||
          turn.descriptorDigest !== input.descriptor.descriptorDigest ||
          turn.turnIndex !== turnIndex ||
          turn.terminal !== (turnIndex === turns.length - 1)
      )
    ) {
      return false;
    }

    const intents = new Map(
      input.transportDispatchIntents.map((intent) => [
        intent.intentDigest,
        intent,
      ])
    );
    const transports = new Map(
      input.transportReceipts.map((receipt) => [
        receipt.dispatchIntentDigest,
        receipt,
      ])
    );
    const spools = new Map(
      input.providerResultSpoolReceipts.map((receipt) => [
        receipt.receiptDigest,
        receipt,
      ])
    );
    const dispositions = new Map(
      input.providerResultSpoolDispositionReceipts.map((receipt) => [
        receipt.spoolReceiptDigest,
        receipt,
      ])
    );
    const sources = new Map(
      input.sourceReceipts.map((receipt) => [receipt.receiptDigest, receipt])
    );
    const usedIntentDigests = new Set<string>();
    const usedTransportDigests = new Set<string>();
    const usedSpoolDigests = new Set<string>();
    const usedSourceDigests = new Set<string>();
    for (const turn of turns) {
      if (turn.dispatchState === 'not-created') {
        continue;
      }
      const intent = intents.get(turn.dispatchIntentDigest);
      const transport = transports.get(turn.dispatchIntentDigest);
      if (
        !intent ||
        !transport ||
        intent.turnIndex !== turn.turnIndex ||
        intent.invocationId !==
          (turn.invocationReceipt?.invocationId ?? intent.invocationId) ||
        intent.requestDigest !== turn.requestArtifactDigest ||
        transport.receiptDigest !== turn.transportReceiptDigest ||
        transport.invocationId !== intent.invocationId ||
        transport.requestDigest !== intent.requestDigest ||
        transport.dispatchState !==
          (turn.dispatchState === 'dispatched'
            ? 'dispatched'
            : 'not-dispatched')
      ) {
        return false;
      }
      usedIntentDigests.add(intent.intentDigest);
      usedTransportDigests.add(transport.receiptDigest);
      const spool = turn.providerResultSpoolReceiptDigest
        ? spools.get(turn.providerResultSpoolReceiptDigest)
        : undefined;
      if (
        (transport.outcome === 'completed') !== (spool !== undefined) ||
        (spool !== undefined &&
          (spool.planDigest !== input.plan.planDigest ||
            spool.repositoryCommit !== input.plan.repositoryCommit ||
            spool.attemptId !== input.descriptor.attemptId ||
            spool.descriptorDigest !== input.descriptor.descriptorDigest ||
            spool.turnIndex !== turn.turnIndex ||
            spool.invocationId !== intent.invocationId ||
            spool.dispatchIntentDigest !== intent.intentDigest ||
            spool.transportReceiptDigest !== transport.receiptDigest ||
            spool.responseBodyDigest !== transport.responseBodyDigest ||
            spool.responseDigest !== turn.responseArtifactDigest))
      ) {
        return false;
      }
      if (spool) {
        const disposition = dispositions.get(spool.receiptDigest);
        if (
          !disposition ||
          disposition.spoolRef !== spool.spoolRef ||
          disposition.planDigest !== input.plan.planDigest ||
          disposition.repositoryCommit !== input.plan.repositoryCommit ||
          disposition.attemptId !== input.descriptor.attemptId ||
          disposition.descriptorDigest !== input.descriptor.descriptorDigest ||
          disposition.turnIndex !== turn.turnIndex ||
          disposition.invocationId !== intent.invocationId
        ) {
          return false;
        }
        usedSpoolDigests.add(spool.receiptDigest);
      }
      for (const sourceDigest of [
        turn.usageSourceReceiptDigest,
        turn.costSourceReceiptDigest,
      ]) {
        if (sourceDigest === undefined) continue;
        const source = sources.get(sourceDigest);
        if (
          !source ||
          source.providerConfigurationId !== intent.providerConfigurationId ||
          source.modelLineageDigest !== intent.modelLineageDigest ||
          source.providerRequestId !== transport.providerRequestId
        ) {
          return false;
        }
        usedSourceDigests.add(sourceDigest);
      }
    }
    if (
      usedIntentDigests.size !== intents.size ||
      usedTransportDigests.size !== transports.size ||
      usedSpoolDigests.size !== spools.size ||
      usedSpoolDigests.size !== dispositions.size ||
      usedSourceDigests.size !== sources.size ||
      input.attempt.status !== terminalTurn.status ||
      input.attempt.dispatchIntentSetDigest !==
        digestAgentEvaluationTransportDispatchIntentSet(
          input.transportDispatchIntents
        ) ||
      input.attempt.transportReceiptSetDigest !==
        digestAgentEvaluationTransportReceiptSet(input.transportReceipts) ||
      input.attempt.invocationTurnReceiptSetDigest !==
        digestAgentEvaluationInvocationTurnReceiptSet(turns) ||
      input.attempt.invocationTurnSetReceiptDigest !==
        input.invocationTurnSetReceipt.receiptDigest ||
      input.attempt.capabilityExecutionReceiptSetDigest !==
        digestAgentEvaluationCapabilityExecutionReceiptSet(
          input.capabilityExecutionReceipts
        ) ||
      input.attempt.verificationAttemptGrantReceiptSetDigest !==
        digestAgentEvaluationVerificationAttemptGrantReceiptSet(
          input.verificationAttemptGrantReceipts
        ) ||
      (input.attempt.responseDigest !== undefined &&
        input.attempt.responseDigest !== terminalTurn.responseArtifactDigest) ||
      input.executionReceipt.modelInvocations !==
        input.invocationTurnSetReceipt.dispatchedInvocationCount ||
      input.executionReceipt.modelInvocations !== demand.modelInvocations ||
      input.executionReceipt.toolCalls !== demand.toolCalls ||
      input.executionReceipt.repairRounds !== demand.repairRounds ||
      input.executionReceipt.transactions !== demand.transactions ||
      input.executionReceipt.artifactBytes !== demand.artifactBytes ||
      input.executionReceipt.elapsedMs !== demand.elapsedMs ||
      input.executionReceipt.capabilityExecutionReceiptSetDigest !==
        input.attempt.capabilityExecutionReceiptSetDigest ||
      input.executionReceipt.verificationAttemptGrantReceiptSetDigest !==
        input.attempt.verificationAttemptGrantReceiptSetDigest ||
      !sameCanonicalJson(input.attempt.usage, demand.usage) ||
      !sameCanonicalJson(input.attempt.cost, demand.cost) ||
      !sameCanonicalJson(
        input.invocationTurnSetReceipt.aggregateUsage,
        demand.usage
      ) ||
      !sameCanonicalJson(
        input.invocationTurnSetReceipt.aggregateCost,
        demand.cost
      ) ||
      (input.controlledRuntimeReceipt !== undefined &&
        !sameCanonicalJson(
          input.controlledRuntimeReceipt.verificationAttemptGrantReceiptDigests,
          canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(
            input.verificationAttemptGrantReceipts.map(
              ({ receiptDigest }) => receiptDigest
            )
          )
        )) ||
      !isAgentEvaluationDurableCompletionEvidence({
        plan: input.plan,
        descriptor: input.descriptor,
        attempt: input.attempt,
        terminalTurn,
        executionReceipt: input.executionReceipt,
        ...(input.resultSubmissionReceipt
          ? { resultSubmissionReceipt: input.resultSubmissionReceipt }
          : {}),
        ...(input.controlledRuntimeReceipt
          ? { controlledRuntimeReceipt: input.controlledRuntimeReceipt }
          : {}),
      })
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

class DescriptorReceiptCollector {
  readonly #plan: AgentModelEvaluationPlan;
  readonly #descriptor: AgentModelEvaluationAttemptDescriptor;
  readonly #ledger: AgentEvaluationDurableShardLedger;
  readonly #reservationId: string;
  readonly #shardId: string;
  readonly #ownerId: string;
  readonly #leaseGeneration: number;
  readonly #sourceReceipts: AgentEvaluationSourceReceipt[] = [];
  readonly #invocationTurnReceipts: AgentEvaluationInvocationTurnReceipt[] = [];
  readonly #spoolDispositionReceipts: AgentEvaluationProviderResultSpoolDispositionReceipt[] =
    [];
  readonly #preDispatchFailureReceipts: AgentEvaluationPreDispatchFailureReceipt[] =
    [];
  readonly #capabilityExecutionReceipts: AgentEvaluationCapabilityExecutionReceipt[] =
    [];
  readonly #capabilitySpecificReceipts: AgentEvaluationCapabilitySpecificReceipt[] =
    [];
  readonly #providerCapabilityObservationReceipts: AgentEvaluationProviderCapabilityObservationReceipt[] =
    [];
  readonly #attemptAuthorityOwnerReceipts: AgentEvaluationAttemptAuthorityOwnerReceipt[] =
    [];
  #turns: AgentEvaluationDurableTurnRecord[] = [];
  #demandDigest?: string;
  #prepared = false;
  #recoveryMode = false;
  #resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
  #controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
  #executionReceipt?: AgentEvaluationExecutionReceipt;
  readonly #verificationAttemptGrantReceipts: AgentEvaluationVerificationAttemptGrantReceipt[] =
    [];
  #verificationAttemptGrantsBound = false;
  readonly persistence: AgentEvaluationDurableReceiptPersistence;

  constructor(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      descriptor: AgentModelEvaluationAttemptDescriptor;
      ledger: AgentEvaluationDurableShardLedger;
      reservationId: string;
      shardId: string;
      ownerId: string;
      leaseGeneration: number;
    }>
  ) {
    this.#plan = input.plan;
    this.#descriptor = input.descriptor;
    this.#ledger = input.ledger;
    this.#reservationId = input.reservationId;
    this.#shardId = input.shardId;
    this.#ownerId = input.ownerId;
    this.#leaseGeneration = input.leaseGeneration;
    this.persistence = Object.freeze({
      namespaceDigest: this.#ledger.namespaceDigest,
      listTransportTurns: async () =>
        Object.freeze(this.#turns.map((turn) => turn)),
      persistTransportDispatchIntent: async ({ turnIndex, dispatchIntent }) => {
        if (
          !this.#prepared ||
          turnIndex !== this.#turns.length ||
          this.#turns.some(({ state }) => state !== 'closed') ||
          this.#turns.some(
            ({ transportReceipt }) =>
              transportReceipt && transportReceipt.outcome !== 'completed'
          ) ||
          this.#invocationTurnReceipts.some(({ terminal }) => terminal) ||
          (this.#recoveryMode &&
            this.#invocationTurnReceipts.length !== this.#turns.length) ||
          !isAgentEvaluationTransportDispatchIntent(dispatchIntent) ||
          !this.#plan.providerConfigurations.some(
            ({ providerConfigurationId, adapter }) =>
              providerConfigurationId ===
                dispatchIntent.providerConfigurationId &&
              adapter.protocolFamily === dispatchIntent.protocolFamily
          )
        ) {
          throw new TypeError(
            'Evaluation transport dispatch intent staging is invalid.'
          );
        }
        const result = await this.#ledger.putTurnDispatchIntent({
          descriptor: this.#descriptor,
          turnIndex,
          budgetReservationId: this.#reservationId,
          dispatchIntent,
        });
        if (
          !result.ok ||
          !this.#turnMatches(result.value, turnIndex) ||
          result.value.state !== 'dispatched' ||
          !sameCanonicalJson(result.value.dispatchIntent, dispatchIntent)
        ) {
          throw new TypeError(
            'Evaluation transport dispatch intent acknowledgement drifted.'
          );
        }
        this.#turns.push(result.value);
        return result.value;
      },
      closeTransportTurn: async (input) => this.#closeTransport(input),
      readEncryptedResultSpool: async ({ turnIndex, expectedTurnDigest }) => {
        const turn = this.#turns[turnIndex];
        if (
          !this.#prepared ||
          !turn ||
          turn.state !== 'closed' ||
          turn.transportReceipt.outcome !== 'completed' ||
          !turn.resultSpoolReceipt ||
          turn.turnDigest !== expectedTurnDigest
        ) {
          throw new TypeError(
            'Evaluation result-spool recovery request is invalid.'
          );
        }
        const result = await this.#ledger.getTurnResultSpool({
          descriptor: this.#descriptor,
          turnIndex,
          shardId: this.#shardId,
          ownerId: this.#ownerId,
          leaseGeneration: this.#leaseGeneration,
          expectedTurnDigest,
        });
        if (
          !sameCanonicalJson(
            result.resultSpoolReceipt,
            turn.resultSpoolReceipt
          ) ||
          !isAgentEvaluationDurableResultSpoolAccessReceipt(
            result.accessReceipt
          ) ||
          result.accessReceipt.spoolRef !== turn.resultSpoolReceipt.spoolRef ||
          result.accessReceipt.spoolReceiptDigest !==
            turn.resultSpoolReceipt.receiptDigest ||
          result.accessReceipt.attemptId !== this.#descriptor.attemptId ||
          result.accessReceipt.turnIndex !== turnIndex ||
          result.accessReceipt.expectedTurnDigest !== expectedTurnDigest ||
          result.accessReceipt.shardId !== this.#shardId ||
          result.accessReceipt.ownerId !== this.#ownerId ||
          result.accessReceipt.leaseGeneration !== this.#leaseGeneration ||
          !spoolMatchesTransport(result, {
            namespaceDigest: this.#ledger.namespaceDigest,
            plan: this.#plan,
            descriptor: this.#descriptor,
            turnIndex,
            intent: turn.dispatchIntent,
            transport: turn.transportReceipt,
          }) ||
          result.envelope.envelopeDigest !==
            turn.resultSpoolReceipt.envelopeDigest ||
          result.retentionPolicyDigest !==
            turn.resultSpoolReceipt.retentionPolicyDigest ||
          result.expiresAt !== turn.resultSpoolReceipt.expiresAt ||
          result.responseDigest !== turn.resultSpoolReceipt.responseDigest
        ) {
          throw new TypeError(
            'Evaluation result-spool recovery acknowledgement drifted.'
          );
        }
        return result;
      },
      stageResultSpoolDispositionReceipt: async (receipt) => {
        const spool = this.#turns
          .flatMap((turn) =>
            turn.state === 'closed' && turn.resultSpoolReceipt
              ? [turn.resultSpoolReceipt]
              : []
          )
          .find(
            ({ receiptDigest }) => receiptDigest === receipt.spoolReceiptDigest
          );
        if (
          this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !spool ||
          !isAgentEvaluationProviderResultSpoolDispositionReceipt(receipt) ||
          receipt.spoolRef !== spool.spoolRef ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.turnIndex !== spool.turnIndex ||
          receipt.invocationId !== spool.invocationId ||
          receipt.retentionPolicyDigest !== spool.retentionPolicyDigest ||
          this.#spoolDispositionReceipts.some(
            ({ spoolReceiptDigest }) =>
              spoolReceiptDigest === receipt.spoolReceiptDigest
          )
        ) {
          throw new TypeError(
            'Evaluation result-spool disposition staging is invalid.'
          );
        }
        this.#spoolDispositionReceipts.push(receipt);
        return receipt;
      },
      persistPreDispatchFailureReceipt: async (receipt) => {
        const existing = this.#preDispatchFailureReceipts.find(
          (entry) =>
            entry.failureReceiptId === receipt.failureReceiptId ||
            entry.receiptDigest === receipt.receiptDigest ||
            entry.turnIndex === receipt.turnIndex
        );
        if (
          this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !isAgentEvaluationPreDispatchFailureReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.turnIndex !== this.#invocationTurnReceipts.length ||
          this.#turns[receipt.turnIndex] !== undefined ||
          (existing !== undefined && !sameCanonicalJson(existing, receipt))
        ) {
          throw new TypeError(
            'Evaluation pre-dispatch failure receipt staging transcript is invalid.'
          );
        }
        const result = await this.#ledger.putPreDispatchFailureReceipt(receipt);
        if (
          !result.ok ||
          !sameCanonicalJson(result.value, receipt) ||
          (existing !== undefined && !result.replayed)
        ) {
          throw new TypeError(
            'Evaluation pre-dispatch failure receipt acknowledgement drifted.'
          );
        }
        if (!existing) this.#preDispatchFailureReceipts.push(result.value);
        return result.value;
      },
      persistCapabilityExecutionReceipt: async (receipt) => {
        const concreteCase = this.#plan.concreteCases.find(
          ({ caseId }) => caseId === this.#descriptor.caseId
        );
        const target = this.#plan.capabilityQualificationTargets.find(
          ({ targetId }) => targetId === this.#descriptor.targetId
        );
        const authoritativeTurn =
          this.#invocationTurnReceipts[receipt.turnIndex];
        const preDispatchFailure = this.#preDispatchFailureReceipts.find(
          ({ turnIndex, invocationId }) =>
            turnIndex === receipt.turnIndex &&
            invocationId === receipt.invocationId
        );
        if (
          this.#executionReceipt ||
          !concreteCase ||
          !target ||
          !isAgentEvaluationCapabilityExecutionReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.caseId !== concreteCase.caseId ||
          receipt.caseDigest !== concreteCase.caseDigest ||
          receipt.targetId !== target.targetId ||
          receipt.targetDigest !== target.targetDigest ||
          receipt.capabilityProfileId !== concreteCase.capabilityProfileId ||
          receipt.capabilityProfileId !== target.capabilityProfileId ||
          receipt.capabilityDescriptorDigest !==
            this.#descriptor.capabilityDescriptorDigest ||
          receipt.capabilityDescriptorDigest !==
            concreteCase.capabilityDescriptorDigest ||
          receipt.capabilityId !==
            concreteCase.capabilityDescriptor.capabilityId ||
          receipt.supportExpectation !==
            concreteCase.capabilityDescriptor.supportExpectation ||
          !sameCanonicalJson(
            receipt.expectedToolIds,
            concreteCase.capabilityDescriptor.expectedToolIds
          ) ||
          !sameCanonicalJson(
            receipt.expectedReceiptKinds,
            concreteCase.capabilityDescriptor.expectedReceiptKinds
          ) ||
          receipt.specificReceiptDigests.length !==
            this.#capabilitySpecificReceipts.length ||
          receipt.specificReceiptDigests.some(
            ({ receiptKind, receiptDigest }) =>
              !this.#capabilitySpecificReceipts.some(
                (specific) =>
                  specific.receiptKind === receiptKind &&
                  specific.receiptDigest === receiptDigest
              )
          ) ||
          !sameCanonicalJson(
            receipt.attemptAuthorityOwnerReceiptDigests,
            this.#attemptAuthorityOwnerReceipts
              .filter(({ serviceKind }) => serviceKind === 'capability-runtime')
              .map(({ receiptDigest }) => receiptDigest)
              .sort(compareUnicodeCodePoints)
          ) ||
          (authoritativeTurn === undefined
            ? preDispatchFailure === undefined
            : authoritativeTurn.invocationId !== receipt.invocationId) ||
          this.#capabilityExecutionReceipts.some(
            (entry) =>
              entry.capabilityExecutionReceiptId ===
                receipt.capabilityExecutionReceiptId ||
              entry.receiptDigest === receipt.receiptDigest ||
              (entry.attemptId === receipt.attemptId &&
                entry.caseId === receipt.caseId &&
                entry.capabilityId === receipt.capabilityId)
          )
        ) {
          throw new TypeError(
            'Evaluation capability execution receipt staging transcript is invalid.'
          );
        }
        this.#capabilityExecutionReceipts.push(receipt);
        return receipt;
      },
      persistCapabilitySpecificReceipt: async (receipt) => {
        const concreteCase = this.#plan.concreteCases.find(
          ({ caseId }) => caseId === this.#descriptor.caseId
        );
        const authoritativeTurn =
          this.#invocationTurnReceipts[receipt.turnIndex];
        if (
          this.#capabilityExecutionReceipts.length > 0 ||
          this.#executionReceipt ||
          !concreteCase ||
          !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.caseId !== concreteCase.caseId ||
          receipt.capabilityDescriptorDigest !==
            concreteCase.capabilityDescriptorDigest ||
          !authoritativeTurn ||
          authoritativeTurn.invocationId !== receipt.invocationId ||
          authoritativeTurn.requestArtifactDigest !== receipt.requestDigest ||
          this.#capabilitySpecificReceipts.some(
            (entry) =>
              entry.receiptId === receipt.receiptId ||
              entry.receiptDigest === receipt.receiptDigest ||
              entry.receiptKind === receipt.receiptKind
          )
        ) {
          throw new TypeError(
            'Evaluation capability-specific receipt staging transcript is invalid.'
          );
        }
        this.#capabilitySpecificReceipts.push(receipt);
        return receipt;
      },
      persistProviderCapabilityObservationReceipt: async (receipt) => {
        const target = this.#plan.capabilityQualificationTargets.find(
          ({ targetId }) => targetId === this.#descriptor.targetId
        );
        const provider = target
          ? this.#plan.providerConfigurations.find(
              ({ providerConfigurationId }) =>
                providerConfigurationId === target.providerConfigurationId
            )
          : undefined;
        const turn = this.#turns[receipt.turnIndex];
        if (
          this.#capabilityExecutionReceipts.length > 0 ||
          this.#executionReceipt ||
          !target ||
          !provider ||
          turn?.state !== 'closed' ||
          turn.transportReceipt.outcome !== 'completed' ||
          !turn.resultSpoolReceipt ||
          !isAgentEvaluationProviderCapabilityObservationReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.protocolFamily !== target.protocolFamily ||
          receipt.providerConfigurationId !== target.providerConfigurationId ||
          receipt.modelLineageDigest !== target.modelLineageDigest ||
          receipt.adapterDigest !== provider.adapter.adapterDigest ||
          receipt.invocationId !== turn.transportReceipt.invocationId ||
          receipt.requestDigest !== turn.transportReceipt.requestDigest ||
          receipt.dispatchIntentDigest !== turn.dispatchIntent.intentDigest ||
          receipt.transportReceiptDigest !==
            turn.transportReceipt.receiptDigest ||
          receipt.resultSpoolReceiptDigest !==
            turn.resultSpoolReceipt.receiptDigest ||
          receipt.responseDigest !== turn.resultSpoolReceipt.responseDigest ||
          receipt.normalizedEventSetDigest !==
            turn.resultSpoolReceipt.normalizedEventSetDigest ||
          receipt.observedAt !== turn.transportReceipt.completedAt ||
          this.#providerCapabilityObservationReceipts.some(
            (entry) =>
              entry.turnIndex === receipt.turnIndex ||
              entry.observationReceiptId === receipt.observationReceiptId ||
              entry.receiptDigest === receipt.receiptDigest
          )
        ) {
          throw new TypeError(
            'Evaluation provider capability observation staging transcript is invalid.'
          );
        }
        this.#providerCapabilityObservationReceipts.push(receipt);
        return receipt;
      },
      persistAttemptAuthorityOwnerReceipt: async (receipt) => {
        const verificationAttemptGrantReceiptSetDigest =
          digestAgentEvaluationVerificationAttemptGrantReceiptSet(
            this.#verificationAttemptGrantReceipts
          );
        const capabilityReceiptAlreadyPersisted =
          this.#capabilityExecutionReceipts.length === 1;
        if (
          this.#executionReceipt ||
          !isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt) ||
          receipt.namespaceId !== this.#ledger.namespaceId ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.shardLeaseOwnerId !== this.#ownerId ||
          receipt.shardLeaseGeneration !== this.#leaseGeneration ||
          receipt.verificationAttemptGrantReceiptSetDigest !==
            verificationAttemptGrantReceiptSetDigest ||
          (receipt.serviceKind === 'capability-runtime' &&
            capabilityReceiptAlreadyPersisted) ||
          (receipt.serviceKind === 'attempt-grading' &&
            !capabilityReceiptAlreadyPersisted) ||
          this.#attemptAuthorityOwnerReceipts.some(
            (entry) =>
              entry.receiptDigest === receipt.receiptDigest ||
              entry.requestDigest === receipt.requestDigest
          )
        ) {
          throw new TypeError(
            'Evaluation attempt-authority owner receipt staging transcript is invalid.'
          );
        }
        this.#attemptAuthorityOwnerReceipts.push(receipt);
        return receipt;
      },
      persistSourceReceipt: async (receipt) => {
        if (
          this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !isAgentEvaluationSourceReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          this.#sourceReceipts.some(
            (entry) =>
              entry.sourceReceiptId === receipt.sourceReceiptId ||
              entry.receiptDigest === receipt.receiptDigest
          )
        ) {
          throw new TypeError(
            'Evaluation source receipt staging transcript is invalid.'
          );
        }
        this.#sourceReceipts.push(receipt);
        return receipt;
      },
      persistInvocationTurnReceipt: async (receipt) => {
        if (
          this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !isAgentEvaluationInvocationTurnReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.turnIndex !== this.#invocationTurnReceipts.length ||
          this.#invocationTurnReceipts.some(({ terminal }) => terminal) ||
          !this.#receiptMatchesDurableTurn(receipt) ||
          (receipt.usageSourceReceiptDigest !== undefined &&
            !this.#sourceReceipts.some(
              ({ receiptDigest }) =>
                receiptDigest === receipt.usageSourceReceiptDigest
            )) ||
          (receipt.costSourceReceiptDigest !== undefined &&
            !this.#sourceReceipts.some(
              ({ receiptDigest }) =>
                receiptDigest === receipt.costSourceReceiptDigest
            ))
        ) {
          throw new TypeError(
            'Evaluation invocation turn receipt staging transcript is invalid.'
          );
        }
        this.#invocationTurnReceipts.push(receipt);
        return receipt;
      },
      persistResultSubmissionReceipt: async (receipt) => {
        const concreteCase = this.#plan.concreteCases.find(
          ({ caseId }) => caseId === this.#descriptor.caseId
        );
        const terminalTurn = this.#invocationTurnReceipts.at(-1);
        if (
          !terminalTurn ||
          !terminalTurn.terminal ||
          terminalTurn.status !== 'completed' ||
          !terminalTurn.invocationReceipt ||
          this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !concreteCase ||
          !isAgentEvaluationResultSubmissionReceipt(receipt) ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.invocationId !==
            terminalTurn.invocationReceipt.invocationId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.caseId !== concreteCase.caseId ||
          receipt.caseDigest !== concreteCase.caseDigest ||
          receipt.caseDefinitionDigest !== concreteCase.caseDefinitionDigest ||
          receipt.caseDefinitionDigest !== terminalTurn.caseDefinitionDigest ||
          terminalTurn.resultSubmissionReceiptDigest !== receipt.receiptDigest
        ) {
          throw new TypeError(
            'Evaluation result submission receipt staging transcript is invalid.'
          );
        }
        this.#resultSubmissionReceipt = receipt;
        return receipt;
      },
      persistControlledRuntimeReceipt: async (receipt) => {
        if (
          !this.#resultSubmissionReceipt ||
          this.#controlledRuntimeReceipt ||
          this.#executionReceipt ||
          !isAgentEvaluationControlledRuntimeReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.caseId !== this.#resultSubmissionReceipt.caseId ||
          receipt.caseDigest !== this.#resultSubmissionReceipt.caseDigest ||
          receipt.materialDigest !==
            this.#resultSubmissionReceipt.materialDigest ||
          receipt.submissionReceiptDigest !==
            this.#resultSubmissionReceipt.receiptDigest ||
          this.#verificationAttemptGrantReceipts.length === 0 ||
          !sameCanonicalJson(
            receipt.verificationAttemptGrantReceiptDigests,
            canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(
              this.#verificationAttemptGrantReceipts.map(
                ({ receiptDigest }) => receiptDigest
              )
            )
          )
        ) {
          throw new TypeError(
            'Evaluation controlled runtime receipt staging transcript is invalid.'
          );
        }
        this.#controlledRuntimeReceipt = receipt;
        return receipt;
      },
      persistExecutionReceipt: async (receipt) => {
        const capabilityExecutionReceiptSetDigest =
          digestAgentEvaluationCapabilityExecutionReceiptSet(
            this.#capabilityExecutionReceipts
          );
        const verificationAttemptGrantReceiptSetDigest =
          digestAgentEvaluationVerificationAttemptGrantReceiptSet(
            this.#verificationAttemptGrantReceipts
          );
        if (
          this.#invocationTurnReceipts.length === 0 ||
          !this.#invocationTurnReceipts.at(-1)?.terminal ||
          this.#executionReceipt ||
          (this.#resultSubmissionReceipt === undefined) !==
            (this.#controlledRuntimeReceipt === undefined) ||
          !isAgentEvaluationExecutionReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          this.#capabilityExecutionReceipts.length !== 1 ||
          receipt.capabilityExecutionReceiptSetDigest !==
            capabilityExecutionReceiptSetDigest ||
          receipt.verificationAttemptGrantReceiptSetDigest !==
            verificationAttemptGrantReceiptSetDigest
        ) {
          throw new TypeError(
            'Evaluation execution receipt staging transcript is invalid.'
          );
        }
        this.#executionReceipt = receipt;
        return receipt;
      },
    });
  }

  async prepare(closeOpenAt: Instant): Promise<
    Readonly<{
      turns: readonly AgentEvaluationDurableTurnRecord[];
      preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
      recovery: boolean;
    }>
  > {
    if (this.#prepared) {
      throw new TypeError(
        'Evaluation descriptor collector was prepared twice.'
      );
    }
    const [turns, allPreDispatchFailureReceipts] = await Promise.all([
      this.#ledger.listAttemptTurns(this.#descriptor.attemptId),
      this.#ledger.listPreDispatchFailureReceipts(),
    ]);
    const preDispatchFailureReceipts =
      canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
        allPreDispatchFailureReceipts.filter(
          ({ attemptId }) => attemptId === this.#descriptor.attemptId
        )
      );
    if (
      turns.some(
        (turn, turnIndex) =>
          !this.#turnMatches(turn, turnIndex) ||
          (turnIndex < turns.length - 1 && turn.state !== 'closed') ||
          (turnIndex < turns.length - 1 &&
            turn.state === 'closed' &&
            turn.transportReceipt.outcome !== 'completed')
      ) ||
      preDispatchFailureReceipts.some(
        (receipt) =>
          !isAgentEvaluationPreDispatchFailureReceipt(receipt) ||
          receipt.planDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.attemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest
      ) ||
      new Set(preDispatchFailureReceipts.map(({ turnIndex }) => turnIndex))
        .size !== preDispatchFailureReceipts.length
    ) {
      throw new TypeError('Evaluation durable turn transcript is invalid.');
    }
    this.#turns = [...turns];
    this.#preDispatchFailureReceipts.push(...preDispatchFailureReceipts);
    this.#prepared = true;
    this.#recoveryMode =
      turns.length > 0 || preDispatchFailureReceipts.length > 0;
    const open = this.#turns.at(-1);
    if (open?.state === 'dispatched') {
      const transportReceipt = createAgentEvaluationTransportReceipt({
        receiptId: `evaluation-transport-unknown:${open.dispatchIntent.intentDigest.slice('sha256-'.length)}`,
        protocolFamily: open.dispatchIntent.protocolFamily,
        providerConfigurationId: open.dispatchIntent.providerConfigurationId,
        invocationId: open.dispatchIntent.invocationId,
        dispatchIntentDigest: open.dispatchIntent.intentDigest,
        requestDigest: open.dispatchIntent.requestDigest,
        endpointId: open.dispatchIntent.endpointId,
        endpointClass: open.dispatchIntent.endpointClass,
        requestBodyDigest: open.dispatchIntent.requestBodyDigest,
        requestBytes: open.dispatchIntent.requestBytes,
        responseBytes: 0,
        sseEventCount: 0,
        dispatchState: 'dispatched',
        outcome: 'post-dispatch-unknown',
        errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
        startedAt: open.dispatchIntent.createdAt,
        completedAt: closeOpenAt,
      });
      await this.#closeTransport({
        turnIndex: open.turnIndex,
        expectedIntentDigest: open.dispatchIntent.intentDigest,
        transportReceipt,
        closedAt: closeOpenAt,
      });
    }
    return Object.freeze({
      turns: Object.freeze([...this.#turns]),
      preDispatchFailureReceipts: Object.freeze([
        ...this.#preDispatchFailureReceipts,
      ]),
      recovery: this.#recoveryMode,
    });
  }

  bindVerificationAttemptGrants(
    receipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[]
  ): void {
    const canonical =
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(receipts);
    if (
      this.#verificationAttemptGrantsBound ||
      !sameCanonicalJson(receipts, canonical) ||
      canonical.some(
        (receipt) =>
          !isAgentEvaluationVerificationAttemptGrantReceipt(receipt) ||
          receipt.namespaceId !== this.#ledger.namespaceId ||
          receipt.evaluationPlanDigest !== this.#plan.planDigest ||
          receipt.repositoryCommit !== this.#plan.repositoryCommit ||
          receipt.evaluationAttemptId !== this.#descriptor.attemptId ||
          receipt.descriptorDigest !== this.#descriptor.descriptorDigest ||
          receipt.capabilityDescriptorDigest !==
            this.#descriptor.capabilityDescriptorDigest ||
          receipt.caseId !== this.#descriptor.caseId ||
          receipt.generation !== this.#leaseGeneration ||
          receipt.grant.attemptId !== this.#descriptor.attemptId
      ) ||
      new Set(canonical.map(({ cellId }) => cellId)).size !== canonical.length
    ) {
      throw new TypeError(
        'Evaluation verification attempt grant binding is invalid.'
      );
    }
    this.#verificationAttemptGrantReceipts.push(...canonical);
    this.#verificationAttemptGrantsBound = true;
  }

  bindDemand(demand: AgentBudgetDemand): void {
    const demandDigest = digestAgentCanonicalValue(normalizeDemand(demand));
    if (
      this.#demandDigest !== undefined &&
      this.#demandDigest !== demandDigest
    ) {
      throw new TypeError('Evaluation descriptor budget demand drifted.');
    }
    this.#demandDigest = demandDigest;
  }

  async #closeTransport(
    input: Parameters<
      AgentEvaluationDurableReceiptPersistence['closeTransportTurn']
    >[0]
  ): Promise<AgentEvaluationDurableTurnRecord> {
    const current = this.#turns[input.turnIndex];
    const completed = input.transportReceipt.outcome === 'completed';
    if (
      !this.#prepared ||
      !current ||
      current.state !== 'dispatched' ||
      current.turnIndex !== this.#turns.length - 1 ||
      current.dispatchIntent.intentDigest !== input.expectedIntentDigest ||
      !isAgentEvaluationTransportReceipt(input.transportReceipt) ||
      input.transportReceipt.dispatchIntentDigest !==
        current.dispatchIntent.intentDigest ||
      input.transportReceipt.completedAt !== input.closedAt ||
      completed !== (input.encryptedResultSpool !== undefined) ||
      (input.encryptedResultSpool !== undefined &&
        !spoolMatchesTransport(input.encryptedResultSpool, {
          namespaceDigest: this.#ledger.namespaceDigest,
          plan: this.#plan,
          descriptor: this.#descriptor,
          turnIndex: input.turnIndex,
          intent: current.dispatchIntent,
          transport: input.transportReceipt,
        })) ||
      (input.nativeOptionalCapabilityBootstrapIngress !== undefined &&
        (!input.encryptedResultSpool ||
          !isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(
            input.nativeOptionalCapabilityBootstrapIngress
          ) ||
          !nativeOptionalCapabilityBootstrapIngressMatchesTransport(
            input.nativeOptionalCapabilityBootstrapIngress,
            {
              turnIndex: input.turnIndex,
              transportReceipt: input.transportReceipt,
              responseDigest: input.encryptedResultSpool.responseDigest,
              resultSpoolAad: input.encryptedResultSpool.aad,
              encryptedResultSpool: input.encryptedResultSpool.envelope,
            }
          )))
    ) {
      throw new TypeError('Evaluation transport close staging is invalid.');
    }
    const result = await this.#ledger.closeTurnTransport({
      descriptor: this.#descriptor,
      turnIndex: input.turnIndex,
      budgetReservationId: this.#reservationId,
      expectedIntentDigest: input.expectedIntentDigest,
      transportReceipt: input.transportReceipt,
      ...(input.encryptedResultSpool
        ? { encryptedResultSpool: input.encryptedResultSpool }
        : {}),
      ...(input.nativeOptionalCapabilityBootstrapIngress
        ? {
            nativeOptionalCapabilityBootstrapIngress:
              input.nativeOptionalCapabilityBootstrapIngress,
          }
        : {}),
      closedAt: input.closedAt,
    });
    if (
      !result.ok ||
      !this.#turnMatches(result.value, input.turnIndex) ||
      result.value.state !== 'closed' ||
      !sameCanonicalJson(result.value.dispatchIntent, current.dispatchIntent) ||
      !sameCanonicalJson(
        result.value.transportReceipt,
        input.transportReceipt
      ) ||
      completed !== (result.value.resultSpoolReceipt !== undefined) ||
      (input.encryptedResultSpool !== undefined &&
        (result.value.resultSpoolReceipt?.envelopeDigest !==
          input.encryptedResultSpool.envelope.envelopeDigest ||
          result.value.resultSpoolReceipt?.aadDigest !==
            input.encryptedResultSpool.envelope.aadDigest ||
          result.value.resultSpoolReceipt?.responseDigest !==
            input.encryptedResultSpool.responseDigest ||
          result.value.resultSpoolReceipt?.retentionPolicyDigest !==
            input.encryptedResultSpool.retentionPolicyDigest ||
          result.value.resultSpoolReceipt?.expiresAt !==
            input.encryptedResultSpool.expiresAt))
    ) {
      throw new TypeError(
        'Evaluation transport close acknowledgement drifted.'
      );
    }
    this.#turns[input.turnIndex] = result.value;
    return result.value;
  }

  #turnMatches(
    turn: AgentEvaluationDurableTurnRecord,
    turnIndex: number
  ): boolean {
    const target = this.#plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === this.#descriptor.targetId
    );
    return (
      isAgentEvaluationDurableTurnRecord(turn) &&
      target !== undefined &&
      turn.attemptId === this.#descriptor.attemptId &&
      turn.descriptorDigest === this.#descriptor.descriptorDigest &&
      turn.turnIndex === turnIndex &&
      turn.budgetReservationId === this.#reservationId &&
      turn.dispatchIntent.planDigest === this.#plan.planDigest &&
      turn.dispatchIntent.repositoryCommit === this.#plan.repositoryCommit &&
      turn.dispatchIntent.providerConfigurationId ===
        target.providerConfigurationId &&
      turn.dispatchIntent.protocolFamily === target.protocolFamily &&
      turn.dispatchIntent.modelLineageDigest === target.modelLineageDigest &&
      turn.dispatchIntent.inferenceConfigurationDigest ===
        target.inferenceConfigurationDigest &&
      (this.#demandDigest === undefined ||
        turn.dispatchIntent.demandDigest === this.#demandDigest) &&
      (turn.state !== 'closed' ||
        !turn.resultSpoolReceipt ||
        (turn.resultSpoolReceipt.planDigest === this.#plan.planDigest &&
          turn.resultSpoolReceipt.repositoryCommit ===
            this.#plan.repositoryCommit))
    );
  }

  #receiptMatchesDurableTurn(
    receipt: AgentEvaluationInvocationTurnReceipt
  ): boolean {
    if (receipt.dispatchState === 'not-created') {
      const failure = this.#preDispatchFailureReceipts.find(
        ({ receiptDigest }) =>
          receiptDigest === receipt.executionFailureAuthorityReceiptDigest
      );
      return (
        this.#turns[receipt.turnIndex] === undefined &&
        failure !== undefined &&
        failure.turnIndex === receipt.turnIndex &&
        failure.invocationId === receipt.invocationId
      );
    }
    const turn = this.#turns[receipt.turnIndex];
    if (
      turn?.state !== 'closed' ||
      receipt.dispatchIntentDigest !== turn.dispatchIntent.intentDigest ||
      receipt.transportReceiptDigest !== turn.transportReceipt.receiptDigest ||
      turn.transportReceipt.dispatchState !==
        (receipt.dispatchState === 'dispatched'
          ? 'dispatched'
          : 'not-dispatched')
    ) {
      return false;
    }
    return turn.resultSpoolReceipt
      ? receipt.providerResultSpoolReceiptDigest ===
          turn.resultSpoolReceipt.receiptDigest
      : receipt.providerResultSpoolReceiptDigest === undefined;
  }

  complete(result: AgentEvaluationDurableAttemptExecutorResult): Readonly<{
    transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
    transportReceipts: readonly AgentEvaluationTransportReceipt[];
    providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
    providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
    preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
    capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
    capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
    providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
    attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
    verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
    invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
    invocationTurnSetReceipt: AgentEvaluationInvocationTurnSetReceipt;
    sourceReceipts: readonly AgentEvaluationSourceReceipt[];
    resultSubmissionReceipt?: AgentEvaluationResultSubmissionReceipt;
    controlledRuntimeReceipt?: AgentEvaluationControlledRuntimeReceipt;
    executionReceipt: AgentEvaluationExecutionReceipt;
  }> {
    const transportDispatchIntents =
      canonicalAgentEvaluationAuthenticityOrder.transportDispatchIntents(
        this.#turns.map(({ dispatchIntent }) => dispatchIntent)
      );
    const transportReceipts =
      canonicalAgentEvaluationAuthenticityOrder.transportReceipts(
        this.#turns.flatMap((turn) =>
          turn.state === 'closed' ? [turn.transportReceipt] : []
        )
      );
    const providerResultSpoolReceipts =
      canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolReceipts(
        this.#turns.flatMap((turn) =>
          turn.state === 'closed' && turn.resultSpoolReceipt
            ? [turn.resultSpoolReceipt]
            : []
        )
      );
    const preDispatchFailureReceipts =
      canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
        this.#preDispatchFailureReceipts
      );
    const capabilityExecutionReceipts =
      canonicalAgentEvaluationCapabilityExecutionReceiptOrder(
        this.#capabilityExecutionReceipts
      );
    const capabilitySpecificReceipts = Object.freeze(
      [...this.#capabilitySpecificReceipts].sort(
        canonicalAgentEvaluationCapabilitySpecificReceiptOrder
      )
    );
    const providerCapabilityObservationReceipts = Object.freeze(
      [...this.#providerCapabilityObservationReceipts].sort(
        canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder
      )
    );
    const attemptAuthorityOwnerReceipts = Object.freeze(
      [...this.#attemptAuthorityOwnerReceipts].sort(
        canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder
      )
    );
    const verificationAttemptGrantReceipts =
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        this.#verificationAttemptGrantReceipts
      );
    if (
      this.#turns.some(({ state }) => state !== 'closed') ||
      !sameCanonicalJson(
        transportDispatchIntents,
        result.transportDispatchIntents
      ) ||
      !sameCanonicalJson(transportReceipts, result.transportReceipts) ||
      !sameCanonicalJson(
        providerResultSpoolReceipts,
        result.providerResultSpoolReceipts
      ) ||
      !sameCanonicalJson(
        this.#invocationTurnReceipts,
        result.invocationTurnReceipts
      ) ||
      !sameCanonicalJson(
        canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolDispositionReceipts(
          this.#spoolDispositionReceipts
        ),
        result.providerResultSpoolDispositionReceipts
      ) ||
      !sameCanonicalJson(
        preDispatchFailureReceipts,
        result.preDispatchFailureReceipts
      ) ||
      !sameCanonicalJson(
        capabilityExecutionReceipts,
        result.capabilityExecutionReceipts
      ) ||
      !sameCanonicalJson(
        capabilitySpecificReceipts,
        result.capabilitySpecificReceipts
      ) ||
      !sameCanonicalJson(
        providerCapabilityObservationReceipts,
        result.providerCapabilityObservationReceipts
      ) ||
      !sameCanonicalJson(
        attemptAuthorityOwnerReceipts,
        result.attemptAuthorityOwnerReceipts
      ) ||
      !isAgentEvaluationDurableAttemptEvidence({
        plan: this.#plan,
        descriptor: this.#descriptor,
        demand: result.demand,
        transportDispatchIntents,
        transportReceipts,
        providerResultSpoolReceipts,
        providerResultSpoolDispositionReceipts:
          result.providerResultSpoolDispositionReceipts,
        preDispatchFailureReceipts,
        capabilityExecutionReceipts,
        capabilitySpecificReceipts,
        providerCapabilityObservationReceipts,
        attemptAuthorityOwnerReceipts,
        verificationAttemptGrantReceipts,
        invocationTurnReceipts: this.#invocationTurnReceipts,
        invocationTurnSetReceipt: result.invocationTurnSetReceipt,
        sourceReceipts: this.#sourceReceipts,
        ...(this.#resultSubmissionReceipt
          ? { resultSubmissionReceipt: this.#resultSubmissionReceipt }
          : {}),
        ...(this.#controlledRuntimeReceipt
          ? { controlledRuntimeReceipt: this.#controlledRuntimeReceipt }
          : {}),
        executionReceipt: this.#executionReceipt ?? result.executionReceipt,
        attempt: result.attempt,
      }) ||
      !sameCanonicalJson(this.#sourceReceipts, result.sourceReceipts) ||
      (this.#resultSubmissionReceipt === undefined
        ? result.resultSubmissionReceipt !== undefined
        : result.resultSubmissionReceipt === undefined ||
          !sameCanonicalJson(
            this.#resultSubmissionReceipt,
            result.resultSubmissionReceipt
          )) ||
      (this.#controlledRuntimeReceipt === undefined
        ? result.controlledRuntimeReceipt !== undefined
        : result.controlledRuntimeReceipt === undefined ||
          !sameCanonicalJson(
            this.#controlledRuntimeReceipt,
            result.controlledRuntimeReceipt
          )) ||
      !sameCanonicalJson(this.#executionReceipt, result.executionReceipt)
    ) {
      throw new TypeError(
        'Evaluation executor result drifted from its durable transcript.'
      );
    }
    return Object.freeze({
      transportDispatchIntents,
      transportReceipts,
      providerResultSpoolReceipts,
      providerResultSpoolDispositionReceipts:
        result.providerResultSpoolDispositionReceipts,
      preDispatchFailureReceipts,
      capabilityExecutionReceipts,
      capabilitySpecificReceipts,
      providerCapabilityObservationReceipts,
      attemptAuthorityOwnerReceipts,
      verificationAttemptGrantReceipts,
      invocationTurnReceipts: Object.freeze([...this.#invocationTurnReceipts]),
      invocationTurnSetReceipt: result.invocationTurnSetReceipt,
      sourceReceipts: Object.freeze([...this.#sourceReceipts]),
      ...(this.#resultSubmissionReceipt
        ? { resultSubmissionReceipt: this.#resultSubmissionReceipt }
        : {}),
      ...(this.#controlledRuntimeReceipt
        ? { controlledRuntimeReceipt: this.#controlledRuntimeReceipt }
        : {}),
      executionReceipt: this.#executionReceipt!,
    });
  }
}

const executionFailureReason = (
  caught: unknown,
  signal: AbortSignal | undefined
): ReconciliationReason => {
  if (
    signal?.aborted ||
    (caught instanceof AgentEvaluationRunnerError &&
      caught.code === AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted)
  ) {
    return 'timeout';
  }
  if (
    caught instanceof AgentEvaluationRunnerError &&
    new Set<AgentEvaluationRunnerError['code']>([
      AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
      AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRateLimited,
      AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected,
      AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
    ]).has(caught.code)
  ) {
    return 'provider-disconnect';
  }
  return 'worker-loss';
};

/**
 * Executes a frozen shard against an async durable ledger. Provider terminal
 * failures remain denominator attempts when they carry the complete receipt
 * transcript. Descriptor-local evidence stays staged until the atomic join,
 * while dispatch intents, sanitized transport receipts, and encrypted result
 * spools survive worker loss in the turn journal. Recovery replays closed
 * spools, seals open dispatches as post-dispatch-unknown, and never invokes an
 * already journaled turn again. Local failures keep the descriptor missing.
 */
export class AgentEvaluationDurableShardRunner {
  readonly #ledger: AgentEvaluationDurableShardLedger;
  readonly #executorFactory: AgentEvaluationDurableAttemptExecutorFactory;
  readonly #verificationAttemptGrantIssuer: AgentEvaluationVerificationAttemptGrantIssuer;
  readonly #settings: AgentEvaluationDurableShardSettings;
  readonly #now: () => Instant;

  constructor(
    input: Readonly<{
      ledger: AgentEvaluationDurableShardLedger;
      executorFactory: AgentEvaluationDurableAttemptExecutorFactory;
      verificationAttemptGrantIssuer: AgentEvaluationVerificationAttemptGrantIssuer;
      settings: AgentEvaluationDurableShardSettings;
      now: () => Instant;
    }>
  ) {
    this.#ledger = input.ledger;
    this.#executorFactory = input.executorFactory;
    this.#verificationAttemptGrantIssuer = input.verificationAttemptGrantIssuer;
    this.#settings = assertSettings(input.settings);
    this.#now = input.now;
  }

  async run(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId: string;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationShardRunResult> {
    let descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
    try {
      descriptors = plannedShardDescriptors(input.plan, input.shardId);
    } catch {
      return Object.freeze({ ok: false, reason: 'plan-not-found' });
    }
    if (descriptors.length === 0) {
      return Object.freeze({ ok: false, reason: 'shard-not-found' });
    }

    const acquiredAt = this.#instant();
    let leaseResult: AgentEvaluationRepositoryWriteResult<AgentEvaluationShardLease>;
    try {
      leaseResult = await this.#ledger.claimLease({
        planDigest: input.plan.planDigest,
        shardId: input.shardId,
        ownerId: this.#settings.ownerId,
        acquiredAt,
        expiresAt: expiresAt(acquiredAt, this.#settings.leaseDurationMs),
      });
    } catch {
      return Object.freeze({ ok: false, reason: 'lease-rejected' });
    }
    if (!leaseResult.ok) {
      return Object.freeze({ ok: false, reason: 'lease-rejected' });
    }
    const lease = leaseResult.value;
    try {
      assertLease(lease, {
        planDigest: input.plan.planDigest,
        shardId: input.shardId,
        ownerId: this.#settings.ownerId,
      });
    } catch {
      return Object.freeze({ ok: false, reason: 'lease-rejected' });
    }

    let latest: AgentEvaluationShardCheckpoint | undefined;
    let attempts: readonly AgentModelEvaluationAttempt[];
    try {
      [latest, attempts] = await Promise.all([
        this.#ledger.getLatestCheckpoint(input.shardId),
        this.#ledger.listAttempts(),
      ]);
    } catch {
      return Object.freeze({ ok: false, reason: 'executor-failed' });
    }
    if (
      latest &&
      (!isAgentEvaluationShardCheckpoint(latest) ||
        latest.planDigest !== input.plan.planDigest ||
        latest.shardId !== input.shardId)
    ) {
      return Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
    }

    const descriptorById = new Map(
      descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
    );
    const durableAttempts = new Map<string, AgentModelEvaluationAttempt>();
    for (const attempt of attempts) {
      const descriptor = descriptorById.get(attempt.descriptor.attemptId);
      if (!descriptor) continue;
      if (
        durableAttempts.has(descriptor.attemptId) ||
        !attemptMatchesDescriptor(attempt, descriptor)
      ) {
        return Object.freeze({ ok: false, reason: 'attempt-conflict' });
      }
      durableAttempts.set(descriptor.attemptId, attempt);
    }
    const pending = descriptors.filter(
      ({ attemptId }) => !durableAttempts.has(attemptId)
    );
    let revision = (latest?.revision ?? -1) + 1;
    let completedSinceCheckpoint = 0;
    let checkpointedAtMilliseconds = Date.parse(acquiredAt);
    let executedAttemptCount = 0;

    for (const descriptor of pending) {
      if (input.signal?.aborted) {
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: 'cancelled',
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'executor-failed' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      if (!(await this.#renew(input.plan, input.shardId, lease))) {
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: 'infrastructure-error',
        });
        return Object.freeze({
          ok: false,
          reason: 'lease-rejected',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      const reservationId = createAgentEvaluationAttemptBudgetReservationId({
        planDigest: input.plan.planDigest,
        shardId: input.shardId,
        descriptorDigest: descriptor.descriptorDigest,
      });
      const collector = new DescriptorReceiptCollector({
        plan: input.plan,
        descriptor,
        ledger: this.#ledger,
        reservationId,
        shardId: input.shardId,
        ownerId: this.#settings.ownerId,
        leaseGeneration: lease.generation,
      });
      let estimatedDemand: AgentBudgetDemand;
      try {
        estimatedDemand = normalizeDemand(
          this.#executorFactory.estimateShard({
            plan: input.plan,
            descriptors: Object.freeze([descriptor]),
          })
        );
        collector.bindDemand(estimatedDemand);
      } catch {
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: 'infrastructure-error',
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'executor-failed' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      let reservationState: AgentBudgetLedgerState;
      let reservationWasSettled = false;
      try {
        const budget = await this.#ledger.getBudgetLedger();
        if (!isAgentBudgetLedgerState(budget)) throw new TypeError();
        const priorReservation = budget.reservations.find(
          (entry) => entry.reservationId === reservationId
        );
        const reservation = await this.#ledger.reserveBudget({
          reservationId,
          expectedRevision: budget.revision,
          demand: estimatedDemand,
          // A stable reservation id also requires an exact replay of its first
          // observed timestamp after worker loss or acknowledgement loss.
          reservedAt: priorReservation?.reservedAt ?? this.#instant(),
        });
        if (
          !reservation.ok ||
          (reservation.reservation.status !== 'reserved' &&
            (!reservation.reservation.settlement ||
              !sameCanonicalJson(
                reservation.reservation.settlement.actual,
                estimatedDemand
              )))
        ) {
          const checkpoint = await this.#checkpoint({
            plan: input.plan,
            shardId: input.shardId,
            lease,
            revision,
            state: 'incomplete',
            descriptors,
            attempts: durableAttempts,
            failedAttemptId: descriptor.attemptId,
            failedReason: 'missing',
          });
          return Object.freeze({
            ok: false,
            reason: checkpoint ? 'budget-exhausted' : 'checkpoint-conflict',
            ...(checkpoint ? { checkpoint } : {}),
          });
        }
        reservationState = reservation.state;
        reservationWasSettled = reservation.reservation.status === 'settled';
      } catch {
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: 'missing',
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'budget-exhausted' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      let result: AgentEvaluationDurableAttemptExecutorResult;
      let commitResult: AgentEvaluationDurableAttemptCommitResult;
      try {
        const prepared = await collector.prepare(this.#instant());
        if (reservationWasSettled && !prepared.recovery) {
          throw new TypeError(
            'A settled evaluation reservation has no durable turn transcript.'
          );
        }
        const grantBinding = Object.freeze({
          namespaceId: this.#ledger.namespaceId,
          plan: input.plan,
          descriptor,
          leaseGeneration: lease.generation,
        });
        if (prepared.preDispatchFailureReceipts.length > 1) {
          throw new TypeError(
            'Evaluation pre-dispatch recovery contains multiple terminal authorities.'
          );
        }
        const existingPreDispatchFailure =
          prepared.preDispatchFailureReceipts[0];
        const existingGrantFailure =
          existingPreDispatchFailure?.reasonCode ===
          'verification-attempt-grant-unavailable'
            ? existingPreDispatchFailure
            : undefined;
        let grantFailureCaught: unknown;
        let grantFailed = existingGrantFailure !== undefined;
        let grantIssueInputs:
          | readonly AgentEvaluationVerificationAttemptGrantIssueInput[]
          | undefined;
        let verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[] =
          Object.freeze([]);
        try {
          grantIssueInputs = assertVerificationGrantIssueInputs(
            await this.#executorFactory.prepareVerificationAttemptGrants(
              grantBinding
            ),
            grantBinding
          );
        } catch (caught) {
          grantFailed = true;
          grantFailureCaught = caught;
        }
        if (!grantIssueInputs && existingPreDispatchFailure) {
          throw grantFailureCaught;
        }
        if (grantIssueInputs) {
          const grantListInput = Object.freeze({
            descriptor,
            generation: lease.generation,
            verificationPlanDigest:
              grantIssueInputs[0]!.verificationPlan.planDigest,
          });
          verificationAttemptGrantReceipts =
            decodeVerificationAttemptGrantCoverage(
              await this.#verificationAttemptGrantIssuer.list(grantListInput),
              grantIssueInputs,
              existingPreDispatchFailure !== undefined &&
                existingGrantFailure === undefined
            );
          if (!existingPreDispatchFailure) {
            const issuedCellIds = new Set(
              verificationAttemptGrantReceipts.map(({ cellId }) => cellId)
            );
            try {
              for (const grantIssueInput of grantIssueInputs) {
                if (issuedCellIds.has(grantIssueInput.cellId)) continue;
                const issued =
                  decodeAgentEvaluationVerificationAttemptGrantReceipt(
                    await this.#verificationAttemptGrantIssuer.issue(
                      grantIssueInput
                    ),
                    grantIssueInput
                  );
                issuedCellIds.add(issued.cellId);
              }
            } catch (caught) {
              grantFailed = true;
              grantFailureCaught = caught;
            }
            // The post-issue read is the durable authority after an ACK loss.
            // A failed/partial issuance remains a denominator attempt, while
            // every receipt that reached the ledger joins that attempt exactly.
            verificationAttemptGrantReceipts =
              decodeVerificationAttemptGrantCoverage(
                await this.#verificationAttemptGrantIssuer.list(grantListInput),
                grantIssueInputs,
                !grantFailed
              );
          }
        }
        collector.bindVerificationAttemptGrants(
          verificationAttemptGrantReceipts
        );
        if (grantFailed || existingPreDispatchFailure) {
          const occurredAt =
            existingPreDispatchFailure?.occurredAt ?? this.#instant();
          const finalizer =
            this.#executorFactory.createPreDispatchAttemptFinalizer(
              collector.persistence,
              () => occurredAt
            );
          result = await finalizer.execute({
            plan: input.plan,
            descriptor,
            stage: existingPreDispatchFailure?.stage ?? 'dispatch-admission',
            suggestedReasonCode:
              existingPreDispatchFailure?.reasonCode ??
              'verification-attempt-grant-unavailable',
            verificationAttemptGrantReceiptSetDigest:
              digestAgentEvaluationVerificationAttemptGrantReceiptSet(
                verificationAttemptGrantReceipts
              ),
            policyDigest:
              existingPreDispatchFailure?.policyDigest ??
              input.plan.policyDigest,
            inputDigest:
              existingPreDispatchFailure?.inputDigest ??
              digestAgentCanonicalValue({
                format:
                  'prodivix.agent-evaluation-verification-attempt-grant-admission',
                version: 1,
                namespaceId: this.#ledger.namespaceId,
                planDigest: input.plan.planDigest,
                repositoryCommit: input.plan.repositoryCommit,
                attemptId: descriptor.attemptId,
                descriptorDigest: descriptor.descriptorDigest,
                leaseGeneration: lease.generation,
              }),
            ...(grantFailureCaught === undefined
              ? {}
              : { caught: grantFailureCaught }),
          });
        } else {
          if (verificationAttemptGrantReceipts.length === 0) {
            throw new TypeError(
              'Evaluation verification attempt grant is missing.'
            );
          }
          const executor = this.#executorFactory.create(
            collector.persistence,
            verificationAttemptGrantReceipts,
            Object.freeze({
              namespaceId: this.#ledger.namespaceId,
              shardLeaseOwnerId: lease.ownerId,
              shardLeaseGeneration: lease.generation,
            })
          );
          const executionInput = Object.freeze({
            plan: input.plan,
            descriptor,
            ...(input.signal ? { signal: input.signal } : {}),
          });
          result = prepared.recovery
            ? await executor.resume(
                Object.freeze({
                  ...executionInput,
                  turns: prepared.turns,
                })
              )
            : await executor.execute(executionInput);
        }
        const completedEvidence = collector.complete(result);
        commitResult = Object.freeze({
          ...result,
          verificationAttemptGrantReceipts:
            completedEvidence.verificationAttemptGrantReceipts,
        });
      } catch (caught) {
        const preDispatchFailureKnown =
          await this.#durablePreDispatchFailureState(input.plan, descriptor);
        if (preDispatchFailureKnown === false) {
          await this.#reconcile(
            reservationId,
            reservationState,
            executionFailureReason(caught, input.signal)
          );
        }
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: input.signal?.aborted
            ? 'cancelled'
            : 'infrastructure-error',
        });
        return Object.freeze({
          ok: false,
          reason: checkpoint ? 'executor-failed' : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      const commitDisposition = await this.#commitAttemptEvidence(
        reservationId,
        commitResult
      );
      if (commitDisposition !== 'committed') {
        if (commitResult.preDispatchFailureReceipts.length === 0) {
          await this.#reconcile(reservationId, reservationState, 'ack-loss');
        }
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'incomplete',
          descriptors,
          attempts: durableAttempts,
          failedAttemptId: descriptor.attemptId,
          failedReason: 'infrastructure-error',
        });
        return Object.freeze({
          ok: false,
          reason:
            commitDisposition === 'attempt-conflict'
              ? 'attempt-conflict'
              : checkpoint
                ? 'executor-failed'
                : 'checkpoint-conflict',
          ...(checkpoint ? { checkpoint } : {}),
        });
      }

      durableAttempts.set(descriptor.attemptId, result.attempt);
      executedAttemptCount += 1;
      completedSinceCheckpoint += 1;

      const observedAt = this.#instant();
      if (
        completedSinceCheckpoint >=
          this.#settings.checkpoint.completedAttemptInterval ||
        Date.parse(observedAt) - checkpointedAtMilliseconds >=
          this.#settings.checkpoint.maximumIntervalMs
      ) {
        const checkpoint = await this.#checkpoint({
          plan: input.plan,
          shardId: input.shardId,
          lease,
          revision,
          state: 'running',
          descriptors,
          attempts: durableAttempts,
        });
        if (!checkpoint) {
          return Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
        }
        revision += 1;
        completedSinceCheckpoint = 0;
        checkpointedAtMilliseconds = Date.parse(checkpoint.updatedAt);
      }
    }

    const checkpoint = await this.#checkpoint({
      plan: input.plan,
      shardId: input.shardId,
      lease,
      revision,
      state: 'completed',
      descriptors,
      attempts: durableAttempts,
    });
    return checkpoint
      ? Object.freeze({ ok: true, checkpoint, executedAttemptCount })
      : Object.freeze({ ok: false, reason: 'checkpoint-conflict' });
  }

  #instant(): Instant {
    return assertInstant(this.#now());
  }

  async #renew(
    plan: AgentModelEvaluationPlan,
    shardId: string,
    lease: AgentEvaluationShardLease
  ): Promise<boolean> {
    try {
      const renewedAt = this.#instant();
      const result = await this.#ledger.renewLease({
        planDigest: plan.planDigest,
        shardId,
        ownerId: this.#settings.ownerId,
        generation: lease.generation,
        renewedAt,
        expiresAt: expiresAt(renewedAt, this.#settings.leaseDurationMs),
      });
      if (!result.ok) return false;
      assertLease(result.value, {
        planDigest: plan.planDigest,
        shardId,
        ownerId: this.#settings.ownerId,
        generation: lease.generation,
      });
      return true;
    } catch {
      return false;
    }
  }

  async #commitAttemptEvidence(
    reservationId: string,
    result: AgentEvaluationDurableAttemptCommitResult
  ): Promise<'committed' | 'attempt-conflict' | 'failed'> {
    const sourceReceipts = Object.freeze(
      [...result.sourceReceipts].sort((left, right) =>
        compareUnicodeCodePoints(left.sourceReceiptId, right.sourceReceiptId)
      )
    );
    const firstSettledAt = this.#instant();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const budget = await this.#ledger.getBudgetLedger();
        const reservation = budget.reservations.find(
          (entry) => entry.reservationId === reservationId
        );
        if (!reservation) return 'failed';
        if (
          reservation.status === 'settled' &&
          (await this.#hasExactDurableAttempt(result.attempt))
        ) {
          return 'committed';
        }
        const settledAt =
          reservation.status === 'settled'
            ? reservation.settlement?.settledAt
            : firstSettledAt;
        if (
          !settledAt ||
          (reservation.status === 'settled' &&
            (!reservation.settlement ||
              !sameCanonicalJson(reservation.settlement.actual, result.demand)))
        ) {
          return 'failed';
        }
        const committed = await this.#ledger.commitAttemptEvidence({
          reservationId,
          expectedRevision: budget.revision,
          actual: result.demand,
          settledAt,
          transportDispatchIntents: result.transportDispatchIntents,
          transportReceipts: result.transportReceipts,
          providerResultSpoolReceipts: result.providerResultSpoolReceipts,
          providerResultSpoolDispositionReceipts:
            result.providerResultSpoolDispositionReceipts,
          preDispatchFailureReceipts: result.preDispatchFailureReceipts,
          capabilityExecutionReceipts: result.capabilityExecutionReceipts,
          capabilitySpecificReceipts: result.capabilitySpecificReceipts,
          providerCapabilityObservationReceipts:
            result.providerCapabilityObservationReceipts,
          attemptAuthorityOwnerReceipts: result.attemptAuthorityOwnerReceipts,
          verificationAttemptGrantReceipts:
            result.verificationAttemptGrantReceipts,
          invocationTurnReceipts: result.invocationTurnReceipts,
          invocationTurnSetReceipt: result.invocationTurnSetReceipt,
          sourceReceipts,
          ...(result.resultSubmissionReceipt
            ? { resultSubmissionReceipt: result.resultSubmissionReceipt }
            : {}),
          ...(result.controlledRuntimeReceipt
            ? { controlledRuntimeReceipt: result.controlledRuntimeReceipt }
            : {}),
          executionReceipt: result.executionReceipt,
          attempt: result.attempt,
        });
        if (
          !sameCanonicalJson(
            committed.transportDispatchIntents,
            result.transportDispatchIntents
          ) ||
          !sameCanonicalJson(
            committed.transportReceipts,
            result.transportReceipts
          ) ||
          !sameCanonicalJson(
            committed.providerResultSpoolReceipts,
            result.providerResultSpoolReceipts
          ) ||
          !sameCanonicalJson(
            committed.providerResultSpoolDispositionReceipts,
            result.providerResultSpoolDispositionReceipts
          ) ||
          !sameCanonicalJson(
            committed.preDispatchFailureReceipts,
            result.preDispatchFailureReceipts
          ) ||
          !sameCanonicalJson(
            committed.capabilityExecutionReceipts,
            result.capabilityExecutionReceipts
          ) ||
          !sameCanonicalJson(
            committed.capabilitySpecificReceipts,
            result.capabilitySpecificReceipts
          ) ||
          !sameCanonicalJson(
            committed.providerCapabilityObservationReceipts,
            result.providerCapabilityObservationReceipts
          ) ||
          !sameCanonicalJson(
            committed.attemptAuthorityOwnerReceipts,
            result.attemptAuthorityOwnerReceipts
          ) ||
          !sameCanonicalJson(
            committed.verificationAttemptGrantReceipts,
            result.verificationAttemptGrantReceipts
          ) ||
          !sameCanonicalJson(
            committed.invocationTurnReceipts,
            result.invocationTurnReceipts
          ) ||
          !sameCanonicalJson(
            committed.invocationTurnSetReceipt,
            result.invocationTurnSetReceipt
          ) ||
          !sameCanonicalJson(committed.sourceReceipts, sourceReceipts) ||
          (result.resultSubmissionReceipt === undefined
            ? committed.resultSubmissionReceipt !== undefined
            : committed.resultSubmissionReceipt === undefined ||
              !sameCanonicalJson(
                committed.resultSubmissionReceipt,
                result.resultSubmissionReceipt
              )) ||
          (result.controlledRuntimeReceipt === undefined
            ? committed.controlledRuntimeReceipt !== undefined
            : committed.controlledRuntimeReceipt === undefined ||
              !sameCanonicalJson(
                committed.controlledRuntimeReceipt,
                result.controlledRuntimeReceipt
              )) ||
          !sameCanonicalJson(
            committed.executionReceipt,
            result.executionReceipt
          ) ||
          !sameCanonicalJson(committed.attempt, result.attempt) ||
          !isAgentBudgetLedgerState(committed.budgetLedger)
        ) {
          return 'failed';
        }
        const settled = committed.budgetLedger.reservations.find(
          (entry) => entry.reservationId === reservationId
        );
        if (
          settled?.status !== 'settled' ||
          !settled.settlement ||
          !sameCanonicalJson(settled.settlement.actual, result.demand)
        ) {
          return 'failed';
        }
        return 'committed';
      } catch {
        try {
          const attempts = await this.#ledger.listAttempts();
          const durable = attempts.filter(
            ({ descriptor }) =>
              descriptor.attemptId === result.attempt.descriptor.attemptId
          );
          if (durable.length > 1) return 'attempt-conflict';
          if (durable.length === 1) {
            return sameCanonicalJson(durable[0], result.attempt)
              ? 'committed'
              : 'attempt-conflict';
          }
        } catch {
          // A bounded exact replay below can recover an acknowledgement loss.
        }
      }
    }
    return 'failed';
  }

  async #hasExactDurableAttempt(
    attempt: AgentModelEvaluationAttempt
  ): Promise<boolean> {
    const matches = (await this.#ledger.listAttempts()).filter(
      ({ descriptor }) => descriptor.attemptId === attempt.descriptor.attemptId
    );
    return matches.length === 1 && sameCanonicalJson(matches[0], attempt);
  }

  async #reconcile(
    reservationId: string,
    knownState: AgentBudgetLedgerState,
    reason: ReconciliationReason
  ): Promise<void> {
    try {
      const current = await this.#ledger.getBudgetLedger();
      const reservation = current.reservations.find(
        (entry) => entry.reservationId === reservationId
      );
      if (!reservation || reservation.status === 'settled') return;
      await this.#ledger.reconcileBudget({
        reservationId,
        expectedRevision: current.revision,
        reason,
        settledAt: this.#instant(),
      });
    } catch {
      try {
        const reservation = knownState.reservations.find(
          (entry) => entry.reservationId === reservationId
        );
        if (reservation?.status !== 'reserved') return;
        await this.#ledger.reconcileBudget({
          reservationId,
          expectedRevision: knownState.revision,
          reason,
          settledAt: this.#instant(),
        });
      } catch {
        // The durable reservation remains observable for a later reconciler.
      }
    }
  }

  async #durablePreDispatchFailureState(
    plan: AgentModelEvaluationPlan,
    descriptor: AgentModelEvaluationAttemptDescriptor
  ): Promise<boolean | undefined> {
    try {
      const receipts = await this.#ledger.listPreDispatchFailureReceipts();
      return receipts.some(
        (receipt) =>
          isAgentEvaluationPreDispatchFailureReceipt(receipt) &&
          receipt.planDigest === plan.planDigest &&
          receipt.repositoryCommit === plan.repositoryCommit &&
          receipt.attemptId === descriptor.attemptId &&
          receipt.descriptorDigest === descriptor.descriptorDigest
      );
    } catch {
      // Preserve the reservation for the durable reconciler when the no-call
      // authority cannot be read. Settling the full estimate here could make
      // an exact zero-call attempt impossible to resume and commit.
      return undefined;
    }
  }

  async #checkpoint(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId: string;
      lease: AgentEvaluationShardLease;
      revision: number;
      state: AgentEvaluationShardCheckpoint['state'];
      descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
      attempts: ReadonlyMap<string, AgentModelEvaluationAttempt>;
      failedAttemptId?: string;
      failedReason?: AgentModelEvaluationMissingAttemptRef['reason'];
    }>
  ): Promise<AgentEvaluationShardCheckpoint | undefined> {
    try {
      const budgetLedger = await this.#ledger.getBudgetLedger();
      if (!isAgentBudgetLedgerState(budgetLedger)) return undefined;
      const completedAttemptRefs = input.descriptors.flatMap((descriptor) => {
        const attempt = input.attempts.get(descriptor.attemptId);
        return attempt
          ? [
              Object.freeze({
                attemptId: descriptor.attemptId,
                descriptorDigest: descriptor.descriptorDigest,
                attemptDigest: attempt.attemptDigest,
              }),
            ]
          : [];
      });
      const missingAttemptRefs = input.descriptors.flatMap((descriptor) => {
        if (input.attempts.has(descriptor.attemptId)) return [];
        return [
          missingRef(
            descriptor,
            descriptor.attemptId === input.failedAttemptId
              ? (input.failedReason ?? 'infrastructure-error')
              : 'missing'
          ),
        ];
      });
      const checkpoint = createAgentEvaluationShardCheckpoint({
        planDigest: input.plan.planDigest,
        shardId: input.shardId,
        revision: input.revision,
        leaseOwnerId: this.#settings.ownerId,
        leaseGeneration: input.lease.generation,
        state: input.state,
        completedAttemptRefs: Object.freeze(completedAttemptRefs),
        missingAttemptRefs: Object.freeze(missingAttemptRefs),
        budgetLedger,
        updatedAt: this.#instant(),
      });
      if (
        input.state === 'completed' &&
        checkpoint.missingAttemptRefs.length > 0
      ) {
        return undefined;
      }
      const stored = await this.#ledger.putCheckpoint(
        checkpoint,
        input.revision - 1
      );
      return stored.ok && sameCanonicalJson(stored.value, checkpoint)
        ? stored.value
        : undefined;
    } catch {
      return undefined;
    }
  }
}
