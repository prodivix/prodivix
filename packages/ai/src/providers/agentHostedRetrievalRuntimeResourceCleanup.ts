import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_AUTHORITY_RECEIPT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIMED_STATE_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OVERDUE_RECEIPT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RUN_TERMINAL_FENCE_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_ATTEMPT_ID_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ID_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_ID_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_RESULT_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_LEASE_GENERATION_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_RESULT_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  canonicalAuxiliaryResourceIds,
  cleanupClaimAuthorityReceiptKeys,
  cleanupArchiveRecordKeys,
  cleanupReceiptKeys,
  cleanupRequestKeys,
  cleanupResourceResultKeys,
  createAgentHostedRetrievalRuntimeResourceAuthoritySet,
  exact,
  expectedRuntimeAuthorityKeys,
  isAgentHostedRetrievalRuntimeResourceAuthority,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  matchAgentHostedRetrievalRuntimeResourceSetCommitment,
  overdueReceiptKeys,
  repositoryCommitPattern,
  resourceKindByProtocol,
  runTerminalFenceKeys,
  safe,
  type AgentHostedRetrievalRuntimeResourceActiveState,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupRequest,
  type AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  type AgentHostedRetrievalRuntimeResourceOverdueReceipt,
  type AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
  type AgentHostedRetrievalRuntimeResourceTerminalAttemptRecord,
  type AgentHostedRetrievalRuntimeResourceTerminalAttemptStatus,
  type AgentHostedRetrievalRuntimeResourceTerminalShardRecord,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  isAgentHostedRetrievalRuntimeResourceActiveState,
  isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
} from './agentHostedRetrievalRuntimeResourceRead';

export type AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry =
  Readonly<{
    shardId: string;
    shardLeaseGeneration: number;
    checkpointDigest: CanonicalDigest;
    checkpointUpdatedAt: Instant;
    terminalAttempts: readonly AgentHostedRetrievalRuntimeResourceTerminalAttemptRecord[];
  }>;

export const createAgentHostedRetrievalRuntimeResourceOverdueReceipt = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  detectedAt: Instant
): AgentHostedRetrievalRuntimeResourceOverdueReceipt => {
  if (
    !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
    !isAgentControlInstant(detectedAt) ||
    Date.parse(detectedAt) <= Date.parse(authority.expiresAt)
  ) {
    throw new TypeError('Hosted retrieval runtime overdue receipt is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OVERDUE_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    providerResourceKind: authority.providerResourceKind,
    providerResourceId: authority.providerResourceId,
    resourceExpiresAt: authority.expiresAt,
    detectedAt,
    disposition: 'cleanup-required' as const,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceOverdueReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceOverdueReceipt => {
  if (!exact(value, overdueReceiptKeys)) return false;
  const receipt = value as AgentHostedRetrievalRuntimeResourceOverdueReceipt;
  const { receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OVERDUE_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      receipt.planDigest,
      receipt.runConfigArtifactBindingDigest,
      receipt.authorityDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    [receipt.runtimeResourceSetId, receipt.providerResourceId].every(
      isAgentControlIdentity
    ) &&
    Object.values(resourceKindByProtocol).includes(
      receipt.providerResourceKind
    ) &&
    isAgentControlInstant(receipt.resourceExpiresAt) &&
    isAgentControlInstant(receipt.detectedAt) &&
    Date.parse(receipt.detectedAt) > Date.parse(receipt.resourceExpiresAt) &&
    receipt.disposition === 'cleanup-required' &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  );
};

/**
 * Canonical codec for the immutable Backend-owned terminal-fence receipt.
 * Production cleanup must exact-match this value against the durable receipt
 * derived from the frozen shard plan and terminal-attempt ledger.
 */
const terminalAttemptStatuses = Object.freeze([
  'blocked',
  'cancelled',
  'completed',
  'infrastructure-error',
  'provider-error',
  'rate-limited',
  'schema-failed',
  'timed-out',
] as const satisfies readonly AgentHostedRetrievalRuntimeResourceTerminalAttemptStatus[]);

const digestTerminalShardRecord = (
  record: Omit<
    AgentHostedRetrievalRuntimeResourceTerminalShardRecord,
    'terminalRecordDigest'
  >
): CanonicalDigest => digestAgentCanonicalValue(record);

const digestCleanupClaimedState = (
  input: Readonly<{
    authorityDigest: CanonicalDigest;
    resourceSetCommitmentDigest: CanonicalDigest;
    cleanupOwnerInstanceId: string;
    claimGeneration: number;
    claimedAt: Instant;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIMED_STATE_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
    lifecycle: 'cleanup-in-progress',
  });

const digestCleanupTerminalState = (
  input: Readonly<{
    authorityDigest: CanonicalDigest;
    cleanupRequestDigest: CanonicalDigest;
    cleanupOwnerInstanceId: string;
    claimGeneration: number;
    readLeaseLedgerRootDigest: CanonicalDigest;
    cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
    completedAt: Instant;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-state',
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
    lifecycle: 'cleaned',
    residualProviderResourceIds: Object.freeze([]),
  });

export const normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome = (
  status: AgentHostedRetrievalRuntimeResourceTerminalAttemptStatus
): 'cancelled' | 'completed' | 'failed' =>
  status === 'completed'
    ? 'completed'
    : status === 'cancelled'
      ? 'cancelled'
      : 'failed';

/** Canonical per-shard projection from all terminal attempts plus checkpoint. */
export const deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord = (
  input: AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry
): AgentHostedRetrievalRuntimeResourceTerminalShardRecord => {
  const terminalAttempts = Object.freeze(
    [...input.terminalAttempts].sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    )
  );
  if (
    !exact(input, [
      'shardId',
      'shardLeaseGeneration',
      'checkpointDigest',
      'checkpointUpdatedAt',
      'terminalAttempts',
    ]) ||
    !isAgentControlIdentity(input.shardId) ||
    !Number.isSafeInteger(input.shardLeaseGeneration) ||
    input.shardLeaseGeneration < 1 ||
    !isAgentCanonicalDigest(input.checkpointDigest) ||
    !isAgentControlInstant(input.checkpointUpdatedAt) ||
    terminalAttempts.length < 1 ||
    !sameCanonicalJson(input.terminalAttempts, terminalAttempts) ||
    new Set(terminalAttempts.map(({ attemptId }) => attemptId)).size !==
      terminalAttempts.length ||
    terminalAttempts.some(
      (attempt) =>
        !exact(attempt, [
          'attemptId',
          'attemptDigest',
          'status',
          'completedAt',
        ]) ||
        !isAgentControlIdentity(attempt.attemptId) ||
        !isAgentCanonicalDigest(attempt.attemptDigest) ||
        !terminalAttemptStatuses.includes(attempt.status) ||
        !isAgentControlInstant(attempt.completedAt)
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime terminal shard attempts are invalid.'
    );
  }
  const normalizedOutcomes = terminalAttempts.map(({ status }) =>
    normalizeAgentHostedRetrievalRuntimeResourceTerminalOutcome(status)
  );
  const terminalOutcome = normalizedOutcomes.includes('failed')
    ? ('failed' as const)
    : normalizedOutcomes.includes('cancelled')
      ? ('cancelled' as const)
      : ('completed' as const);
  const terminalAt = [
    input.checkpointUpdatedAt,
    ...terminalAttempts.map(({ completedAt }) => completedAt),
  ]
    .sort(compareUnicodeCodePoints)
    .at(-1)!;
  const base = Object.freeze({
    shardId: input.shardId,
    shardLeaseGeneration: input.shardLeaseGeneration,
    checkpointDigest: input.checkpointDigest,
    terminalAttemptCount: terminalAttempts.length,
    terminalAttemptIdSetDigest: digestAgentCanonicalValue({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_ID_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      shardId: input.shardId,
      attemptIds: terminalAttempts.map(({ attemptId }) => attemptId),
    }),
    terminalAttemptResultSetDigest: digestAgentCanonicalValue({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_RESULT_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      shardId: input.shardId,
      terminalAttempts,
    }),
    terminalOutcome,
    terminalAt,
  });
  return Object.freeze({
    ...base,
    terminalRecordDigest: digestTerminalShardRecord(base),
  });
};

export const matchAgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry =
  (
    record: AgentHostedRetrievalRuntimeResourceTerminalShardRecord,
    entry: AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry
  ): boolean => {
    try {
      return sameCanonicalJson(
        record,
        deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(entry)
      );
    } catch {
      return false;
    }
  };

/**
 * Reference derivation mirrored by the Backend durable terminal-ledger owner.
 * Outcome precedence is deterministic: failed, then cancelled, then completed.
 */
export const deriveAgentHostedRetrievalRuntimeResourceRunTerminalFence = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRunTerminalFence,
    | 'expectedShardCount'
    | 'fenceDigest'
    | 'format'
    | 'terminalAttemptIdSetDigest'
    | 'terminalOutcome'
    | 'terminalShardCount'
    | 'terminalShardIdSetDigest'
    | 'terminalShardLeaseGenerationSetDigest'
    | 'terminalShardResultSetDigest'
    | 'version'
  > &
    Readonly<{
      expectedShardIds: readonly string[];
      terminalShardRecords: readonly AgentHostedRetrievalRuntimeResourceTerminalShardRecord[];
    }>
): AgentHostedRetrievalRuntimeResourceRunTerminalFence => {
  const expectedShardIds = Object.freeze(
    [...input.expectedShardIds].sort(compareUnicodeCodePoints)
  );
  const terminalShardRecords = Object.freeze(
    [...input.terminalShardRecords].sort((left, right) =>
      compareUnicodeCodePoints(left.shardId, right.shardId)
    )
  );
  if (
    expectedShardIds.length < 1 ||
    expectedShardIds.length >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS ||
    !sameCanonicalJson(input.expectedShardIds, expectedShardIds) ||
    new Set(expectedShardIds).size !== expectedShardIds.length ||
    expectedShardIds.some((shardId) => !isAgentControlIdentity(shardId)) ||
    terminalShardRecords.length !== expectedShardIds.length ||
    !sameCanonicalJson(input.terminalShardRecords, terminalShardRecords) ||
    terminalShardRecords.some(
      (record) =>
        !exact(record, [
          'shardId',
          'shardLeaseGeneration',
          'checkpointDigest',
          'terminalAttemptCount',
          'terminalAttemptIdSetDigest',
          'terminalAttemptResultSetDigest',
          'terminalOutcome',
          'terminalAt',
          'terminalRecordDigest',
        ]) ||
        !isAgentControlIdentity(record.shardId) ||
        !Number.isSafeInteger(record.shardLeaseGeneration) ||
        record.shardLeaseGeneration < 1 ||
        !Number.isSafeInteger(record.terminalAttemptCount) ||
        record.terminalAttemptCount < 1 ||
        ![
          record.checkpointDigest,
          record.terminalAttemptIdSetDigest,
          record.terminalAttemptResultSetDigest,
        ].every(isAgentCanonicalDigest) ||
        !['cancelled', 'completed', 'failed'].includes(
          record.terminalOutcome
        ) ||
        !isAgentControlInstant(record.terminalAt) ||
        !isAgentCanonicalDigest(record.terminalRecordDigest) ||
        record.terminalRecordDigest !==
          digestTerminalShardRecord(
            (({ terminalRecordDigest: _digest, ...base }) => base)(record)
          )
    ) ||
    !sameCanonicalJson(
      terminalShardRecords.map(({ shardId }) => shardId),
      expectedShardIds
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime terminal shard ledger is invalid.'
    );
  }
  const allShardsTerminalAt = terminalShardRecords
    .map(({ terminalAt }) => terminalAt)
    .sort(compareUnicodeCodePoints)
    .at(-1)!;
  if (input.allShardsTerminalAt !== allShardsTerminalAt) {
    throw new TypeError(
      'Hosted retrieval runtime terminal shard ledger timestamp drifted.'
    );
  }
  const terminalOutcome = terminalShardRecords.some(
    (record) => record.terminalOutcome === 'failed'
  )
    ? ('failed' as const)
    : terminalShardRecords.some(
          (record) => record.terminalOutcome === 'cancelled'
        )
      ? ('cancelled' as const)
      : ('completed' as const);
  const terminalShardIdSetDigest = digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ID_SET_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    shardIds: expectedShardIds,
  });
  const terminalAttemptIdSetDigest = digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_ATTEMPT_ID_SET_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    shardAttemptSets: terminalShardRecords.map(
      ({ shardId, terminalAttemptCount, terminalAttemptIdSetDigest }) =>
        Object.freeze({
          shardId,
          terminalAttemptCount,
          terminalAttemptIdSetDigest,
        })
    ),
  });
  const terminalShardLeaseGenerationSetDigest = digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_LEASE_GENERATION_SET_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    generations: terminalShardRecords.map(({ shardId, shardLeaseGeneration }) =>
      Object.freeze({ shardId, shardLeaseGeneration })
    ),
  });
  const terminalShardResultSetDigest = digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_RESULT_SET_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    terminalShardRecords,
  });
  const {
    expectedShardIds: _expectedShardIds,
    terminalShardRecords: _terminalShardRecords,
    ...baseInput
  } = input;
  return createAgentHostedRetrievalRuntimeResourceRunTerminalFence({
    ...baseInput,
    expectedShardCount: expectedShardIds.length,
    terminalShardCount: terminalShardRecords.length,
    terminalShardIdSetDigest,
    terminalAttemptIdSetDigest,
    terminalShardLeaseGenerationSetDigest,
    terminalShardResultSetDigest,
    terminalOutcome,
  });
};

export const createAgentHostedRetrievalRuntimeResourceRunTerminalFence = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRunTerminalFence,
    'fenceDigest' | 'format' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRunTerminalFence => {
  if (
    !exact(input, runTerminalFenceKeys.slice(2, -1)) ||
    ![
      input.fenceId,
      input.fenceAuthorityIssuerId,
      input.namespaceId,
      input.runtimeResourceSetId,
    ].every(isAgentControlIdentity) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
      input.fenceAuthorityImplementationDigest,
      input.terminalShardIdSetDigest,
      input.terminalAttemptIdSetDigest,
      input.terminalShardLeaseGenerationSetDigest,
      input.terminalShardResultSetDigest,
    ].every(isAgentCanonicalDigest) ||
    !Number.isSafeInteger(input.expectedShardCount) ||
    input.expectedShardCount < 1 ||
    input.expectedShardCount >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS ||
    !Number.isSafeInteger(input.fenceLedgerRevision) ||
    input.fenceLedgerRevision < 1 ||
    input.terminalShardCount !== input.expectedShardCount ||
    !['cancelled', 'completed', 'failed'].includes(input.terminalOutcome) ||
    !isAgentControlInstant(input.allShardsTerminalAt) ||
    !isAgentControlInstant(input.sealedAt) ||
    Date.parse(input.sealedAt) < Date.parse(input.allShardsTerminalAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource run terminal fence is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RUN_TERMINAL_FENCE_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  const fence = Object.freeze({
    ...base,
    fenceDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      fence,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource run terminal fence is unsafe or unbounded.'
    );
  }
  return fence;
};

/** Exact durable-lookup fence used by cleanup claims; caller-minted values fail. */
export const matchAgentHostedRetrievalRuntimeResourceStoredRunTerminalFence = (
  fence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  storedFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence
): boolean =>
  isAgentHostedRetrievalRuntimeResourceRunTerminalFence(fence) &&
  isAgentHostedRetrievalRuntimeResourceRunTerminalFence(storedFence) &&
  sameCanonicalJson(fence, storedFence);

export const isAgentHostedRetrievalRuntimeResourceRunTerminalFence = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRunTerminalFence => {
  if (!exact(value, runTerminalFenceKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      fenceDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceRunTerminalFence;
    const recreated =
      createAgentHostedRetrievalRuntimeResourceRunTerminalFence(input);
    return (
      fenceDigest === recreated.fenceDigest &&
      sameCanonicalJson(value, recreated)
    );
  } catch {
    return false;
  }
};

/** Recomputes the durable fence from the frozen shard plan and terminal rows. */
export const matchAgentHostedRetrievalRuntimeResourceRunTerminalFenceLedger = (
  fence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  expectedShardIds: readonly string[],
  terminalShardRecords: readonly AgentHostedRetrievalRuntimeResourceTerminalShardRecord[]
): boolean => {
  if (!isAgentHostedRetrievalRuntimeResourceRunTerminalFence(fence)) {
    return false;
  }
  const {
    format: _format,
    version: _version,
    expectedShardCount: _expectedShardCount,
    terminalShardCount: _terminalShardCount,
    terminalShardIdSetDigest: _terminalShardIdSetDigest,
    terminalAttemptIdSetDigest: _terminalAttemptIdSetDigest,
    terminalShardLeaseGenerationSetDigest:
      _terminalShardLeaseGenerationSetDigest,
    terminalShardResultSetDigest: _terminalShardResultSetDigest,
    terminalOutcome: _terminalOutcome,
    fenceDigest: _fenceDigest,
    ...input
  } = fence;
  try {
    return sameCanonicalJson(
      fence,
      deriveAgentHostedRetrievalRuntimeResourceRunTerminalFence({
        ...input,
        expectedShardIds,
        terminalShardRecords,
      })
    );
  } catch {
    return false;
  }
};

/** Backend serializable-CAS receipt shared by post-matrix and recovery cleanup. */
export const createAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt =
  (
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
    resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
    storedActiveState: AgentHostedRetrievalRuntimeResourceActiveState,
    input: Readonly<{
      claimId: string;
      claimAuthorityIssuerId: string;
      claimAuthorityImplementationDigest: CanonicalDigest;
      claimLedgerRevision: number;
      cleanupOwnerInstanceId: string;
      claimGeneration: number;
      claimedAt: Instant;
      claimExpiresAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt => {
    const authority = registrationResult.authority;
    const registrationRequest = registrationResult.registrationRequest;
    if (
      !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
        registrationResult
      ) ||
      !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
        resourceSetCommitment,
        authority
      ) ||
      !isAgentHostedRetrievalRuntimeResourceActiveState(storedActiveState) ||
      storedActiveState.authorityDigest !== authority.authorityDigest ||
      storedActiveState.resourceSetCommitmentDigest !==
        resourceSetCommitment.commitmentDigest ||
      !exact(input, [
        'claimId',
        'claimAuthorityIssuerId',
        'claimAuthorityImplementationDigest',
        'claimLedgerRevision',
        'cleanupOwnerInstanceId',
        'claimGeneration',
        'claimedAt',
        'claimExpiresAt',
      ]) ||
      ![
        input.claimId,
        input.claimAuthorityIssuerId,
        input.cleanupOwnerInstanceId,
      ].every(isAgentControlIdentity) ||
      !isAgentCanonicalDigest(input.claimAuthorityImplementationDigest) ||
      !Number.isSafeInteger(input.claimLedgerRevision) ||
      input.claimLedgerRevision < 1 ||
      input.claimGeneration !== storedActiveState.claimGeneration + 1 ||
      !isAgentControlInstant(input.claimedAt) ||
      !isAgentControlInstant(input.claimExpiresAt) ||
      Date.parse(input.claimedAt) < Date.parse(storedActiveState.updatedAt) ||
      Date.parse(input.claimExpiresAt) <= Date.parse(input.claimedAt) ||
      Date.parse(input.claimExpiresAt) - Date.parse(input.claimedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError(
        'Hosted retrieval runtime cleanup claim authority receipt is invalid.'
      );
    }
    const claimedStateDigest = digestCleanupClaimedState({
      authorityDigest: authority.authorityDigest,
      resourceSetCommitmentDigest: resourceSetCommitment.commitmentDigest,
      cleanupOwnerInstanceId: input.cleanupOwnerInstanceId,
      claimGeneration: input.claimGeneration,
      claimedAt: input.claimedAt,
    });
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_AUTHORITY_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      claimId: input.claimId,
      claimAuthorityIssuerId: input.claimAuthorityIssuerId,
      claimAuthorityImplementationDigest:
        input.claimAuthorityImplementationDigest,
      claimLedgerRevision: input.claimLedgerRevision,
      namespaceId: registrationRequest.namespaceId,
      repositoryCommit: registrationRequest.repositoryCommit,
      planDigest: authority.planDigest,
      frozenRunDigest: authority.frozenRunDigest,
      runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
      runtimeResourceSetId: authority.runtimeResourceSetId,
      authorityDigest: authority.authorityDigest,
      resourceSetCommitmentDigest: resourceSetCommitment.commitmentDigest,
      expectedActiveStateDigest: storedActiveState.stateDigest,
      cleanupOwnerInstanceId: input.cleanupOwnerInstanceId,
      claimGeneration: input.claimGeneration,
      claimedStateDigest,
      claimedAt: input.claimedAt,
      claimExpiresAt: input.claimExpiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval runtime cleanup claim authority receipt is unsafe or unbounded.'
      );
    }
    return receipt;
  };

export const isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt => {
    if (!exact(value, cleanupClaimAuthorityReceiptKeys)) return false;
    const receipt =
      value as AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt;
    const { receiptDigest, ...base } = receipt;
    return (
      receipt.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_AUTHORITY_RECEIPT_FORMAT &&
      receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        receipt.claimAuthorityImplementationDigest,
        receipt.planDigest,
        receipt.frozenRunDigest,
        receipt.runConfigArtifactBindingDigest,
        receipt.authorityDigest,
        receipt.resourceSetCommitmentDigest,
        receipt.expectedActiveStateDigest,
        receipt.claimedStateDigest,
        receipt.receiptDigest,
      ].every(isAgentCanonicalDigest) &&
      [
        receipt.claimId,
        receipt.claimAuthorityIssuerId,
        receipt.namespaceId,
        receipt.runtimeResourceSetId,
        receipt.cleanupOwnerInstanceId,
      ].every(isAgentControlIdentity) &&
      repositoryCommitPattern.test(receipt.repositoryCommit) &&
      Number.isSafeInteger(receipt.claimLedgerRevision) &&
      receipt.claimLedgerRevision >= 1 &&
      Number.isSafeInteger(receipt.claimGeneration) &&
      receipt.claimGeneration >= 1 &&
      isAgentControlInstant(receipt.claimedAt) &&
      isAgentControlInstant(receipt.claimExpiresAt) &&
      Date.parse(receipt.claimExpiresAt) > Date.parse(receipt.claimedAt) &&
      Date.parse(receipt.claimExpiresAt) - Date.parse(receipt.claimedAt) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS &&
      receipt.claimedStateDigest ===
        digestCleanupClaimedState({
          authorityDigest: receipt.authorityDigest,
          resourceSetCommitmentDigest: receipt.resourceSetCommitmentDigest,
          cleanupOwnerInstanceId: receipt.cleanupOwnerInstanceId,
          claimGeneration: receipt.claimGeneration,
          claimedAt: receipt.claimedAt,
        }) &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
      )
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceStoredCleanupClaimAuthorityReceipt =
  (
    receipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
    storedReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      receipt
    ) &&
    isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      storedReceipt
    ) &&
    sameCanonicalJson(receipt, storedReceipt);

export const createAgentHostedRetrievalRuntimeResourceCleanupRequest = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceCleanupRequest,
    'format' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceCleanupRequest => {
  const overdue = input.cleanupReason === 'expired';
  if (
    !exact(input, cleanupRequestKeys.slice(2, -1)) ||
    ![
      input.namespaceId,
      input.runtimeResourceSetId,
      input.cleanupOwnerInstanceId,
    ].every(isAgentControlIdentity) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
      input.authorityDigest,
      input.resourceSetCommitmentDigest,
      input.readLeaseLedgerRootDigest,
      input.cleanupClaimAuthorityReceiptDigest,
      input.deletionAuthorityReceiptDigest,
      input.priorActiveStateDigest,
      input.runTerminalFenceDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(input.priorActiveState) ||
    input.priorActiveState.stateDigest !== input.priorActiveStateDigest ||
    input.priorActiveState.authorityDigest !== input.authorityDigest ||
    input.priorActiveState.resourceSetCommitmentDigest !==
      input.resourceSetCommitmentDigest ||
    input.claimGeneration !== input.priorActiveState.claimGeneration + 1 ||
    !isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
      input.runTerminalFence
    ) ||
    input.runTerminalFenceDigest !== input.runTerminalFence.fenceDigest ||
    input.runTerminalFence.namespaceId !== input.namespaceId ||
    input.runTerminalFence.repositoryCommit !== input.repositoryCommit ||
    input.runTerminalFence.planDigest !== input.planDigest ||
    input.runTerminalFence.frozenRunDigest !== input.frozenRunDigest ||
    input.runTerminalFence.runConfigArtifactBindingDigest !==
      input.runConfigArtifactBindingDigest ||
    input.runTerminalFence.runtimeResourceSetId !==
      input.runtimeResourceSetId ||
    ![
      'expired',
      'matrix-terminal',
      'owner-shutdown',
      'startup-reconcile',
    ].includes(input.cleanupReason) ||
    overdue !== (input.overdueReceiptDigest !== null) ||
    (input.overdueReceiptDigest !== null &&
      !isAgentCanonicalDigest(input.overdueReceiptDigest)) ||
    !Number.isSafeInteger(input.claimGeneration) ||
    input.claimGeneration < 1 ||
    input.claimedLifecycle !== 'cleanup-in-progress' ||
    !isAgentControlInstant(input.requestedAt) ||
    !isAgentControlInstant(input.deletionNotBefore) ||
    Date.parse(input.requestedAt) <
      Date.parse(input.priorActiveState.updatedAt) ||
    Date.parse(input.requestedAt) <
      Date.parse(input.runTerminalFence.allShardsTerminalAt) ||
    Date.parse(input.requestedAt) <
      Date.parse(input.runTerminalFence.sealedAt) ||
    input.deletionNotBefore !==
      (input.priorActiveState.readLeaseNotAfter !== null &&
      Date.parse(input.priorActiveState.readLeaseNotAfter) >
        Date.parse(input.requestedAt)
        ? input.priorActiveState.readLeaseNotAfter
        : input.requestedAt)
  ) {
    throw new TypeError('Hosted retrieval runtime cleanup request is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  const request = Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      request,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup request is unsafe or unbounded.'
    );
  }
  return request;
};

export const isAgentHostedRetrievalRuntimeResourceCleanupRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupRequest => {
  if (!exact(value, cleanupRequestKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceCleanupRequest;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceCleanupRequest(input)
    );
  } catch {
    return false;
  }
};

/**
 * Exact online cleanup-claim join. The stored terminal fence and ledger root
 * come from Backend durable owners; a self-consistent caller payload alone is
 * insufficient to authorize provider deletion.
 */
export const matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim = (
  request: AgentHostedRetrievalRuntimeResourceCleanupRequest,
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  storedCleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  storedPriorActiveState: AgentHostedRetrievalRuntimeResourceActiveState,
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  overdueReceipt: AgentHostedRetrievalRuntimeResourceOverdueReceipt | null
): boolean => {
  if (
    !isAgentHostedRetrievalRuntimeResourceCleanupRequest(request) ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      registrationResult
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      resourceSetCommitment,
      registrationResult.authority
    ) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      storedCleanupClaimAuthorityReceipt
    ) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(storedPriorActiveState) ||
    !sameCanonicalJson(request.priorActiveState, storedPriorActiveState) ||
    !isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
      readLeaseLedgerRoot
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceStoredRunTerminalFence(
      request.runTerminalFence,
      storedRunTerminalFence
    )
  ) {
    return false;
  }
  const registrationRequest = registrationResult.registrationRequest;
  const authority = registrationResult.authority;
  const deletionAuthorityReceipt = registrationResult.deletionAuthorityReceipt;
  const maximumReadGeneration = readLeaseLedgerRoot.maximumClaimGeneration;
  const overdueMatches =
    overdueReceipt === null
      ? request.overdueReceiptDigest === null &&
        request.cleanupReason !== 'expired'
      : request.cleanupReason === 'expired' &&
        request.overdueReceiptDigest === overdueReceipt.receiptDigest &&
        sameCanonicalJson(
          overdueReceipt,
          createAgentHostedRetrievalRuntimeResourceOverdueReceipt(
            authority,
            overdueReceipt.detectedAt
          )
        ) &&
        Date.parse(request.requestedAt) >=
          Date.parse(overdueReceipt.detectedAt);
  return (
    request.namespaceId === registrationRequest.namespaceId &&
    request.repositoryCommit === registrationRequest.repositoryCommit &&
    request.planDigest === authority.planDigest &&
    request.frozenRunDigest === authority.frozenRunDigest &&
    request.runConfigArtifactBindingDigest ===
      authority.runConfigArtifactBindingDigest &&
    request.runtimeResourceSetId === authority.runtimeResourceSetId &&
    request.authorityDigest === authority.authorityDigest &&
    request.resourceSetCommitmentDigest ===
      resourceSetCommitment.commitmentDigest &&
    request.cleanupClaimAuthorityReceiptDigest ===
      storedCleanupClaimAuthorityReceipt.receiptDigest &&
    storedCleanupClaimAuthorityReceipt.namespaceId === request.namespaceId &&
    storedCleanupClaimAuthorityReceipt.repositoryCommit ===
      request.repositoryCommit &&
    storedCleanupClaimAuthorityReceipt.planDigest === request.planDigest &&
    storedCleanupClaimAuthorityReceipt.frozenRunDigest ===
      request.frozenRunDigest &&
    storedCleanupClaimAuthorityReceipt.runConfigArtifactBindingDigest ===
      request.runConfigArtifactBindingDigest &&
    storedCleanupClaimAuthorityReceipt.runtimeResourceSetId ===
      request.runtimeResourceSetId &&
    storedCleanupClaimAuthorityReceipt.authorityDigest ===
      request.authorityDigest &&
    storedCleanupClaimAuthorityReceipt.resourceSetCommitmentDigest ===
      request.resourceSetCommitmentDigest &&
    storedCleanupClaimAuthorityReceipt.expectedActiveStateDigest ===
      request.priorActiveStateDigest &&
    storedCleanupClaimAuthorityReceipt.cleanupOwnerInstanceId ===
      request.cleanupOwnerInstanceId &&
    storedCleanupClaimAuthorityReceipt.claimGeneration ===
      request.claimGeneration &&
    storedCleanupClaimAuthorityReceipt.claimedAt === request.requestedAt &&
    Date.parse(request.requestedAt) <
      Date.parse(storedCleanupClaimAuthorityReceipt.claimExpiresAt) &&
    request.readLeaseLedgerRootDigest === readLeaseLedgerRoot.rootDigest &&
    request.deletionAuthorityReceiptDigest ===
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest &&
    readLeaseLedgerRoot.planDigest === authority.planDigest &&
    readLeaseLedgerRoot.runConfigArtifactBindingDigest ===
      authority.runConfigArtifactBindingDigest &&
    readLeaseLedgerRoot.runtimeResourceSetId ===
      authority.runtimeResourceSetId &&
    readLeaseLedgerRoot.authorityDigest === authority.authorityDigest &&
    readLeaseLedgerRoot.resourceSetCommitmentDigest ===
      resourceSetCommitment.commitmentDigest &&
    readLeaseLedgerRoot.lastExpiresAt ===
      request.priorActiveState.readLeaseNotAfter &&
    Date.parse(request.requestedAt) >=
      Date.parse(readLeaseLedgerRoot.sealedAt) &&
    (maximumReadGeneration === null ||
      request.claimGeneration > maximumReadGeneration) &&
    request.runTerminalFenceDigest === storedRunTerminalFence.fenceDigest &&
    overdueMatches
  );
};

export const createAgentHostedRetrievalRuntimeResourceCleanupResourceResult = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
    'format' | 'resultDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceCleanupResourceResult => {
  if (
    !exact(input, cleanupResourceResultKeys.slice(2, -1)) ||
    !isAgentControlIdentity(input.resourceId) ||
    !['auxiliary', 'primary'].includes(input.resourceRole) ||
    !['already-absent', 'deleted'].includes(input.outcome) ||
    ![
      input.cleanupClaimAuthorityReceiptDigest,
      input.dispatchIntentDigest,
      input.transportReceiptDigest,
      input.resultSpoolReceiptDigest,
      input.resultSpoolDispositionReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(input.dispatchCreatedAt) ||
    !isAgentControlInstant(input.completedAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup resource result is invalid.'
    );
  }
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceCleanupResourceResult = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupResourceResult => {
  if (!exact(value, cleanupResourceResultKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      resultDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceCleanupResourceResult;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceCleanupResourceResult(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceCleanupReceipt = (
  request: AgentHostedRetrievalRuntimeResourceCleanupRequest,
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  storedCleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  storedPriorActiveState: AgentHostedRetrievalRuntimeResourceActiveState,
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  overdueReceipt: AgentHostedRetrievalRuntimeResourceOverdueReceipt | null,
  resourceResultsInput: readonly AgentHostedRetrievalRuntimeResourceCleanupResourceResult[]
): AgentHostedRetrievalRuntimeResourceCleanupReceipt => {
  const authority = registrationResult.authority;
  const deletionAuthorityReceipt = registrationResult.deletionAuthorityReceipt;
  if (
    !matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim(
      request,
      registrationResult,
      resourceSetCommitment,
      storedCleanupClaimAuthorityReceipt,
      storedPriorActiveState,
      readLeaseLedgerRoot,
      storedRunTerminalFence,
      overdueReceipt
    ) ||
    resourceResultsInput.length !== authority.auxiliaryResourceIds.length + 1 ||
    resourceResultsInput.some(
      (value) =>
        !isAgentHostedRetrievalRuntimeResourceCleanupResourceResult(value) ||
        value.cleanupClaimAuthorityReceiptDigest !==
          request.cleanupClaimAuthorityReceiptDigest
    )
  ) {
    throw new TypeError('Hosted retrieval runtime cleanup receipt is invalid.');
  }
  const expectedIds = Object.freeze(
    [...authority.auxiliaryResourceIds, authority.providerResourceId].sort(
      compareUnicodeCodePoints
    )
  );
  const resourceResults = Object.freeze(
    [...resourceResultsInput].sort((left, right) =>
      compareUnicodeCodePoints(left.resourceId, right.resourceId)
    )
  );
  if (
    !sameCanonicalJson(
      resourceResults.map(({ resourceId }) => resourceId),
      expectedIds
    ) ||
    resourceResults.some(
      ({ resourceId, resourceRole }) =>
        (resourceId === authority.providerResourceId) !==
        (resourceRole === 'primary')
    ) ||
    resourceResults.some(
      ({ completedAt }) =>
        Date.parse(completedAt) < Date.parse(request.deletionNotBefore)
    ) ||
    resourceResults.some(
      ({ dispatchCreatedAt, completedAt }) =>
        Date.parse(dispatchCreatedAt) < Date.parse(request.deletionNotBefore) ||
        Date.parse(dispatchCreatedAt) >=
          Date.parse(storedCleanupClaimAuthorityReceipt.claimExpiresAt) ||
        Date.parse(completedAt) < Date.parse(dispatchCreatedAt)
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup results drifted from the authority.'
    );
  }
  const completedAt = resourceResults
    .map(({ completedAt }) => completedAt)
    .sort(compareUnicodeCodePoints)
    .at(-1)!;
  const resourceResultSetDigest = digestAgentCanonicalValue(
    resourceResults.map(({ resultDigest }) => resultDigest)
  );
  const terminalStateDigest = digestCleanupTerminalState({
    authorityDigest: authority.authorityDigest,
    cleanupRequestDigest: request.requestDigest,
    cleanupOwnerInstanceId: request.cleanupOwnerInstanceId,
    claimGeneration: request.claimGeneration,
    readLeaseLedgerRootDigest: request.readLeaseLedgerRootDigest,
    cleanupClaimAuthorityReceiptDigest:
      request.cleanupClaimAuthorityReceiptDigest,
    completedAt,
  });
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    cleanupRequestDigest: request.requestDigest,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: request.resourceSetCommitmentDigest,
    readLeaseLedgerRootDigest: request.readLeaseLedgerRootDigest,
    cleanupClaimAuthorityReceiptDigest:
      request.cleanupClaimAuthorityReceiptDigest,
    deletionAuthorityReceiptDigest:
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
    protocolFamily: authority.protocolFamily,
    providerResourceKind: authority.providerResourceKind,
    providerResourceId: authority.providerResourceId,
    auxiliaryResourceIds: authority.auxiliaryResourceIds,
    runTerminalFenceDigest: request.runTerminalFenceDigest,
    cleanupReason: request.cleanupReason,
    overdueReceiptDigest: request.overdueReceiptDigest,
    cleanupOwnerInstanceId: request.cleanupOwnerInstanceId,
    claimGeneration: request.claimGeneration,
    priorActiveStateDigest: request.priorActiveStateDigest,
    deletionNotBefore: request.deletionNotBefore,
    resourceResults,
    resourceResultSetDigest,
    residualProviderResourceIds: Object.freeze([]) as readonly [],
    terminalLifecycle: 'cleaned' as const,
    terminalStateDigest,
    completedAt,
  });
  const receipt = Object.freeze({
    ...base,
    cleanupReceiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup receipt is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentHostedRetrievalRuntimeResourceCleanupReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupReceipt => {
  if (!exact(value, cleanupReceiptKeys)) return false;
  try {
    const receipt = value as AgentHostedRetrievalRuntimeResourceCleanupReceipt;
    const { cleanupReceiptDigest, ...base } = receipt;
    const resultIds = receipt.resourceResults.map(
      ({ resourceId }) => resourceId
    );
    const expectedIds = [
      ...receipt.auxiliaryResourceIds,
      receipt.providerResourceId,
    ].sort(compareUnicodeCodePoints);
    const completedAt = receipt.resourceResults
      .map((result) => result.completedAt)
      .sort(compareUnicodeCodePoints)
      .at(-1);
    return (
      receipt.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_FORMAT &&
      receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        receipt.cleanupRequestDigest,
        receipt.planDigest,
        receipt.runConfigArtifactBindingDigest,
        receipt.authorityDigest,
        receipt.resourceSetCommitmentDigest,
        receipt.readLeaseLedgerRootDigest,
        receipt.cleanupClaimAuthorityReceiptDigest,
        receipt.deletionAuthorityReceiptDigest,
        receipt.runTerminalFenceDigest,
        receipt.resourceResultSetDigest,
        receipt.priorActiveStateDigest,
        receipt.terminalStateDigest,
        receipt.cleanupReceiptDigest,
      ].every(isAgentCanonicalDigest) &&
      Object.hasOwn(resourceKindByProtocol, receipt.protocolFamily) &&
      receipt.providerResourceKind ===
        resourceKindByProtocol[receipt.protocolFamily] &&
      [
        receipt.runtimeResourceSetId,
        receipt.providerResourceId,
        receipt.cleanupOwnerInstanceId,
      ].every(isAgentControlIdentity) &&
      Number.isSafeInteger(receipt.claimGeneration) &&
      receipt.claimGeneration >= 1 &&
      sameCanonicalJson(
        receipt.auxiliaryResourceIds,
        canonicalAuxiliaryResourceIds(
          receipt.auxiliaryResourceIds,
          receipt.providerResourceId
        )
      ) &&
      Array.isArray(receipt.resourceResults) &&
      receipt.resourceResults.every(
        isAgentHostedRetrievalRuntimeResourceCleanupResourceResult
      ) &&
      receipt.resourceResults.every(
        ({ cleanupClaimAuthorityReceiptDigest }) =>
          cleanupClaimAuthorityReceiptDigest ===
          receipt.cleanupClaimAuthorityReceiptDigest
      ) &&
      receipt.resourceResults.length ===
        receipt.auxiliaryResourceIds.length + 1 &&
      sameCanonicalJson(resultIds, expectedIds) &&
      receipt.resourceResults.every(
        ({ resourceId, resourceRole }) =>
          (resourceId === receipt.providerResourceId) ===
          (resourceRole === 'primary')
      ) &&
      receipt.resourceResultSetDigest ===
        digestAgentCanonicalValue(
          receipt.resourceResults.map(({ resultDigest }) => resultDigest)
        ) &&
      receipt.resourceResults.every(
        ({ dispatchCreatedAt, completedAt: resultCompletedAt }) =>
          isAgentControlInstant(dispatchCreatedAt) &&
          Date.parse(dispatchCreatedAt) >=
            Date.parse(receipt.deletionNotBefore) &&
          Date.parse(resultCompletedAt) >= Date.parse(dispatchCreatedAt)
      ) &&
      Array.isArray(receipt.residualProviderResourceIds) &&
      receipt.residualProviderResourceIds.length === 0 &&
      receipt.terminalLifecycle === 'cleaned' &&
      receipt.completedAt === completedAt &&
      isAgentControlInstant(receipt.deletionNotBefore) &&
      isAgentControlInstant(receipt.completedAt) &&
      receipt.terminalStateDigest ===
        digestCleanupTerminalState({
          authorityDigest: receipt.authorityDigest,
          cleanupRequestDigest: receipt.cleanupRequestDigest,
          cleanupOwnerInstanceId: receipt.cleanupOwnerInstanceId,
          claimGeneration: receipt.claimGeneration,
          readLeaseLedgerRootDigest: receipt.readLeaseLedgerRootDigest,
          cleanupClaimAuthorityReceiptDigest:
            receipt.cleanupClaimAuthorityReceiptDigest,
          completedAt: receipt.completedAt,
        }) &&
      [
        'expired',
        'matrix-terminal',
        'owner-shutdown',
        'startup-reconcile',
      ].includes(receipt.cleanupReason) &&
      (receipt.cleanupReason === 'expired') ===
        (receipt.overdueReceiptDigest !== null) &&
      (receipt.overdueReceiptDigest === null ||
        isAgentCanonicalDigest(receipt.overdueReceiptDigest)) &&
      cleanupReceiptDigest === digestAgentCanonicalValue(base) &&
      safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceCleanupReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  request: AgentHostedRetrievalRuntimeResourceCleanupRequest,
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  storedCleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  storedPriorActiveState: AgentHostedRetrievalRuntimeResourceActiveState,
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  overdueReceipt: AgentHostedRetrievalRuntimeResourceOverdueReceipt | null
): boolean => {
  const authority = registrationResult.authority;
  const deletionAuthorityReceipt = registrationResult.deletionAuthorityReceipt;
  return (
    isAgentHostedRetrievalRuntimeResourceCleanupReceipt(receipt) &&
    matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim(
      request,
      registrationResult,
      resourceSetCommitment,
      storedCleanupClaimAuthorityReceipt,
      storedPriorActiveState,
      readLeaseLedgerRoot,
      storedRunTerminalFence,
      overdueReceipt
    ) &&
    receipt.cleanupRequestDigest === request.requestDigest &&
    receipt.planDigest === authority.planDigest &&
    receipt.runConfigArtifactBindingDigest ===
      authority.runConfigArtifactBindingDigest &&
    receipt.runtimeResourceSetId === authority.runtimeResourceSetId &&
    receipt.authorityDigest === authority.authorityDigest &&
    receipt.resourceSetCommitmentDigest ===
      request.resourceSetCommitmentDigest &&
    receipt.readLeaseLedgerRootDigest === request.readLeaseLedgerRootDigest &&
    receipt.cleanupClaimAuthorityReceiptDigest ===
      request.cleanupClaimAuthorityReceiptDigest &&
    receipt.deletionAuthorityReceiptDigest ===
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest &&
    receipt.runTerminalFenceDigest === request.runTerminalFenceDigest &&
    receipt.cleanupReason === request.cleanupReason &&
    receipt.overdueReceiptDigest === request.overdueReceiptDigest &&
    receipt.cleanupOwnerInstanceId === request.cleanupOwnerInstanceId &&
    receipt.claimGeneration === request.claimGeneration &&
    receipt.priorActiveStateDigest === request.priorActiveStateDigest &&
    receipt.deletionNotBefore === request.deletionNotBefore &&
    receipt.protocolFamily === authority.protocolFamily &&
    receipt.providerResourceKind === authority.providerResourceKind &&
    receipt.providerResourceId === authority.providerResourceId &&
    sameCanonicalJson(
      receipt.auxiliaryResourceIds,
      authority.auxiliaryResourceIds
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
    | 'authorityDigest'
    | 'cleanupReceiptDigest'
    | 'cleanupRequestDigest'
    | 'format'
    | 'frozenRunDigest'
    | 'planDigest'
    | 'recordDigest'
    | 'registrationRequestDigest'
    | 'runConfigArtifactBindingDigest'
    | 'runtimeResourceSetId'
    | 'version'
  >
): AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord => {
  if (
    !exact(input, [
      'repositoryCommit',
      'registrationResult',
      'resourceSetCommitment',
      'cleanupRequest',
      'storedCleanupClaimAuthorityReceipt',
      'storedPriorActiveState',
      'readLeaseLedgerRoot',
      'storedRunTerminalFence',
      'overdueReceipt',
      'cleanupReceipt',
    ]) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      input.registrationResult
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      input.resourceSetCommitment,
      input.registrationResult.authority
    ) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupRequest(
      input.cleanupRequest
    ) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      input.storedCleanupClaimAuthorityReceipt
    ) ||
    !isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
      input.readLeaseLedgerRoot
    ) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(
      input.storedPriorActiveState
    ) ||
    !isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
      input.storedRunTerminalFence
    ) ||
    (input.overdueReceipt !== null &&
      !isAgentHostedRetrievalRuntimeResourceOverdueReceipt(
        input.overdueReceipt
      )) ||
    !matchAgentHostedRetrievalRuntimeResourceCleanupReceipt(
      input.cleanupReceipt,
      input.cleanupRequest,
      input.registrationResult,
      input.resourceSetCommitment,
      input.storedCleanupClaimAuthorityReceipt,
      input.storedPriorActiveState,
      input.readLeaseLedgerRoot,
      input.storedRunTerminalFence,
      input.overdueReceipt
    ) ||
    input.registrationResult.registrationRequest.repositoryCommit !==
      input.repositoryCommit ||
    input.cleanupRequest.resourceSetCommitmentDigest !==
      input.resourceSetCommitment.commitmentDigest ||
    input.cleanupRequest.readLeaseLedgerRootDigest !==
      input.readLeaseLedgerRoot.rootDigest ||
    input.cleanupRequest.cleanupClaimAuthorityReceiptDigest !==
      input.storedCleanupClaimAuthorityReceipt.receiptDigest ||
    !sameCanonicalJson(
      input.cleanupRequest.runTerminalFence,
      input.storedRunTerminalFence
    ) ||
    !sameCanonicalJson(
      input.cleanupRequest.priorActiveState,
      input.storedPriorActiveState
    ) ||
    input.readLeaseLedgerRoot.planDigest !==
      input.registrationResult.authority.planDigest ||
    input.readLeaseLedgerRoot.runConfigArtifactBindingDigest !==
      input.registrationResult.authority.runConfigArtifactBindingDigest ||
    input.readLeaseLedgerRoot.runtimeResourceSetId !==
      input.registrationResult.authority.runtimeResourceSetId ||
    input.readLeaseLedgerRoot.authorityDigest !==
      input.registrationResult.authorityDigest ||
    input.readLeaseLedgerRoot.resourceSetCommitmentDigest !==
      input.resourceSetCommitment.commitmentDigest ||
    input.readLeaseLedgerRoot.lastExpiresAt !==
      input.cleanupRequest.priorActiveState.readLeaseNotAfter ||
    (input.cleanupRequest.cleanupReason === 'expired') !==
      (input.overdueReceipt !== null) ||
    (input.overdueReceipt !== null &&
      (input.overdueReceipt.receiptDigest !==
        input.cleanupRequest.overdueReceiptDigest ||
        input.overdueReceipt.authorityDigest !==
          input.registrationResult.authorityDigest))
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup archive record is invalid.'
    );
  }
  const authority = input.registrationResult.authority;
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    repositoryCommit: input.repositoryCommit,
    planDigest: authority.planDigest,
    frozenRunDigest: authority.frozenRunDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    registrationRequestDigest:
      input.registrationResult.registrationRequest.requestDigest,
    authorityDigest: authority.authorityDigest,
    cleanupRequestDigest: input.cleanupRequest.requestDigest,
    cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
    registrationResult: input.registrationResult,
    resourceSetCommitment: input.resourceSetCommitment,
    cleanupRequest: input.cleanupRequest,
    storedCleanupClaimAuthorityReceipt:
      input.storedCleanupClaimAuthorityReceipt,
    storedPriorActiveState: input.storedPriorActiveState,
    readLeaseLedgerRoot: input.readLeaseLedgerRoot,
    storedRunTerminalFence: input.storedRunTerminalFence,
    overdueReceipt: input.overdueReceipt,
    cleanupReceipt: input.cleanupReceipt,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES /
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    !safe(
      record,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES /
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup archive record is unsafe or unbounded.'
    );
  }
  return record;
};

export const isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord => {
  if (!exact(value, cleanupArchiveRecordKeys)) return false;
  try {
    const record =
      value as AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord;
    const {
      format: _format,
      version: _version,
      planDigest: _planDigest,
      frozenRunDigest: _frozenRunDigest,
      runConfigArtifactBindingDigest: _bindingDigest,
      runtimeResourceSetId: _runtimeResourceSetId,
      registrationRequestDigest: _registrationRequestDigest,
      authorityDigest: _authorityDigest,
      cleanupRequestDigest: _cleanupRequestDigest,
      cleanupReceiptDigest: _cleanupReceiptDigest,
      recordDigest: _recordDigest,
      ...input
    } = record;
    return sameCanonicalJson(
      record,
      createAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(input)
    );
  } catch {
    return false;
  }
};

/**
 * Semantic verifier join against the frozen shard set and durable terminal rows.
 * Archive/export owners must call this in addition to the structural validator.
 */
export const matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger =
  (
    record: AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
    expectedShardIds: readonly string[],
    terminalShardLedgerEntries: readonly AgentHostedRetrievalRuntimeResourceTerminalShardLedgerEntry[]
  ): boolean => {
    if (!isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(record)) {
      return false;
    }
    try {
      return matchAgentHostedRetrievalRuntimeResourceRunTerminalFenceLedger(
        record.storedRunTerminalFence,
        expectedShardIds,
        terminalShardLedgerEntries.map((entry) =>
          deriveAgentHostedRetrievalRuntimeResourceTerminalShardRecord(entry)
        )
      );
    } catch {
      return false;
    }
  };

const cleanupArchiveAuthorityKey = (
  record: AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord
): string => {
  const authority = record.registrationResult.authority;
  return `${authority.protocolFamily}\u0000${authority.capabilityProfileId}`;
};

/** Exact four-record run-level lifecycle family retained by the evidence root. */
export const createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily = (
  recordsInput: readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[]
): readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[] => {
  if (
    !Array.isArray(recordsInput) ||
    recordsInput.length !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    recordsInput.some(
      (record) =>
        !isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(record)
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup archive family is incomplete.'
    );
  }
  const records = Object.freeze(
    [...recordsInput].sort((left, right) =>
      compareUnicodeCodePoints(
        cleanupArchiveAuthorityKey(left),
        cleanupArchiveAuthorityKey(right)
      )
    )
  );
  const first = records[0]!;
  const authoritySet = createAgentHostedRetrievalRuntimeResourceAuthoritySet({
    planDigest: first.planDigest,
    frozenRunDigest: first.frozenRunDigest,
    runConfigArtifactBindingDigest: first.runConfigArtifactBindingDigest,
    runtimeResourceSetId: first.runtimeResourceSetId,
    authorities: records.map(
      ({ registrationResult }) => registrationResult.authority
    ),
  });
  if (
    !sameCanonicalJson(
      records.map(cleanupArchiveAuthorityKey),
      expectedRuntimeAuthorityKeys
    ) ||
    new Set(records.map(({ authorityDigest }) => authorityDigest)).size !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    records.some(
      (record) =>
        record.planDigest !== first.planDigest ||
        record.repositoryCommit !== first.repositoryCommit ||
        record.registrationResult.registrationRequest.namespaceId !==
          first.registrationResult.registrationRequest.namespaceId ||
        record.frozenRunDigest !== first.frozenRunDigest ||
        record.runConfigArtifactBindingDigest !==
          first.runConfigArtifactBindingDigest ||
        record.runtimeResourceSetId !== first.runtimeResourceSetId ||
        record.resourceSetCommitment.commitmentDigest !==
          first.resourceSetCommitment.commitmentDigest ||
        record.storedRunTerminalFence.fenceDigest !==
          first.storedRunTerminalFence.fenceDigest ||
        !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
          first.resourceSetCommitment,
          record.registrationResult.authority
        )
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceSetCommitment(
      first.resourceSetCommitment,
      authoritySet
    ) ||
    new TextEncoder().encode(canonicalJsonText(records)).byteLength >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES
  ) {
    throw new TypeError(
      'Hosted retrieval runtime cleanup archive family drifted or exceeded capacity.'
    );
  }
  return records;
};

export const isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily = (
  value: unknown
): value is readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[] => {
  if (!Array.isArray(value)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(value)
    );
  } catch {
    return false;
  }
};
