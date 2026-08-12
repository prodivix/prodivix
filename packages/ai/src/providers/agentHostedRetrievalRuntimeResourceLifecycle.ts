import {
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
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ID_SET_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  exact,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  isAgentHostedRetrievalRuntimeResourceRunTerminalFence,
  matchAgentHostedRetrievalRuntimeResourceStoredRunTerminalFence,
} from './agentHostedRetrievalRuntimeResourceCleanup';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE =
  'hosted-retrieval-runtime-resource.terminal-fence.derive' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE =
  'hosted-retrieval-runtime-resource.cleanup.post-matrix.claim' as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-fence-derive-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-post-matrix-cleanup-claim-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 2;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 3;

export type AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    resourceSetCommitmentDigest: CanonicalDigest;
    expectedShardCount: number;
    expectedShardIdSetDigest: CanonicalDigest;
    requestedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    resourceSetCommitmentDigest: CanonicalDigest;
    expectedShardCount: number;
    expectedShardIdSetDigest: CanonicalDigest;
    runTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
    runTerminalFenceDigest: CanonicalDigest;
    checkedAt: Instant;
    expiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    authorityDigest: CanonicalDigest;
    resourceSetCommitmentDigest: CanonicalDigest;
    terminalFenceDeriveReceipt: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt;
    terminalFenceDeriveReceiptDigest: CanonicalDigest;
    cleanupOwnerInstanceId: string;
    claimedAt: Instant;
    minimumClaimExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

const terminalFenceDeriveRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'purpose',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'resourceSetCommitmentDigest',
  'expectedShardCount',
  'expectedShardIdSetDigest',
  'requestedAt',
  'requestDigest',
] as const);

const terminalFenceDeriveReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'resourceSetCommitmentDigest',
  'expectedShardCount',
  'expectedShardIdSetDigest',
  'runTerminalFence',
  'runTerminalFenceDigest',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

const postMatrixCleanupClaimRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'purpose',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'terminalFenceDeriveReceipt',
  'terminalFenceDeriveReceiptDigest',
  'cleanupOwnerInstanceId',
  'claimedAt',
  'minimumClaimExpiresAt',
  'requestDigest',
] as const);
const postMatrixCleanupClaimRequestInputKeys = Object.freeze([
  'namespaceId',
  'purpose',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'terminalFenceDeriveReceipt',
  'cleanupOwnerInstanceId',
  'claimedAt',
  'minimumClaimExpiresAt',
] as const);

export const deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest =
  (expectedShardIdsInput: readonly string[]): CanonicalDigest => {
    if (!Array.isArray(expectedShardIdsInput)) {
      throw new TypeError(
        'Hosted retrieval runtime expected shard ids are invalid.'
      );
    }
    const expectedShardIds = Object.freeze(
      [...expectedShardIdsInput].sort(compareUnicodeCodePoints)
    );
    if (
      expectedShardIds.length < 1 ||
      expectedShardIds.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS ||
      new Set(expectedShardIds).size !== expectedShardIds.length ||
      expectedShardIds.some((shardId) => !isAgentControlIdentity(shardId)) ||
      !sameCanonicalJson(expectedShardIdsInput, expectedShardIds)
    ) {
      throw new TypeError(
        'Hosted retrieval runtime expected shard ids are invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ID_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      shardIds: expectedShardIds,
    });
  };

export const createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest => {
    if (
      !exact(input, terminalFenceDeriveRequestKeys.slice(2, -1)) ||
      ![input.namespaceId, input.runtimeResourceSetId].every(
        isAgentControlIdentity
      ) ||
      input.purpose !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE ||
      !repositoryCommitPattern.test(input.repositoryCommit) ||
      ![
        input.planDigest,
        input.frozenRunDigest,
        input.runConfigArtifactBindingDigest,
        input.resourceSetCommitmentDigest,
        input.expectedShardIdSetDigest,
      ].every(isAgentCanonicalDigest) ||
      !Number.isSafeInteger(input.expectedShardCount) ||
      input.expectedShardCount < 1 ||
      input.expectedShardCount >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS ||
      !isAgentControlInstant(input.requestedAt)
    ) {
      throw new TypeError(
        'Hosted retrieval runtime terminal fence derive request is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_FORMAT,
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
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_REQUEST_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval runtime terminal fence derive request is oversized.'
      );
    }
    return request;
  };

export const isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest => {
  if (!exact(value, terminalFenceDeriveRequestKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest: _requestDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(input)
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequestExpectedShards =
  (
    request: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
    expectedShardIds: readonly string[]
  ): boolean => {
    try {
      return (
        isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(
          request
        ) &&
        request.expectedShardCount === expectedShardIds.length &&
        request.expectedShardIdSetDigest ===
          deriveAgentHostedRetrievalRuntimeResourceExpectedShardIdSetDigest(
            expectedShardIds
          )
      );
    } catch {
      return false;
    }
  };

export const createAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
    runTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
    seal: Readonly<{
      checkedAt: Instant;
      expiresAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(
        request
      ) ||
      !isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
        runTerminalFence
      ) ||
      !exact(seal, ['checkedAt', 'expiresAt']) ||
      !isAgentControlInstant(seal.checkedAt) ||
      !isAgentControlInstant(seal.expiresAt) ||
      Date.parse(seal.checkedAt) < Date.parse(request.requestedAt) ||
      Date.parse(seal.expiresAt) <= Date.parse(seal.checkedAt) ||
      Date.parse(seal.expiresAt) - Date.parse(seal.checkedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_MAXIMUM_LIFETIME_MS ||
      runTerminalFence.namespaceId !== request.namespaceId ||
      runTerminalFence.repositoryCommit !== request.repositoryCommit ||
      runTerminalFence.planDigest !== request.planDigest ||
      runTerminalFence.frozenRunDigest !== request.frozenRunDigest ||
      runTerminalFence.runConfigArtifactBindingDigest !==
        request.runConfigArtifactBindingDigest ||
      runTerminalFence.runtimeResourceSetId !== request.runtimeResourceSetId ||
      runTerminalFence.expectedShardCount !== request.expectedShardCount ||
      runTerminalFence.terminalShardIdSetDigest !==
        request.expectedShardIdSetDigest
    ) {
      throw new TypeError(
        'Hosted retrieval runtime terminal fence derive receipt is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      requestDigest: request.requestDigest,
      namespaceId: request.namespaceId,
      repositoryCommit: request.repositoryCommit,
      planDigest: request.planDigest,
      frozenRunDigest: request.frozenRunDigest,
      runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
      runtimeResourceSetId: request.runtimeResourceSetId,
      resourceSetCommitmentDigest: request.resourceSetCommitmentDigest,
      expectedShardCount: request.expectedShardCount,
      expectedShardIdSetDigest: request.expectedShardIdSetDigest,
      runTerminalFence,
      runTerminalFenceDigest: runTerminalFence.fenceDigest,
      checkedAt: seal.checkedAt,
      expiresAt: seal.expiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval runtime terminal fence derive receipt is oversized.'
      );
    }
    return receipt;
  };

export const isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt => {
  if (!exact(value, terminalFenceDeriveReceiptKeys)) return false;
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt;
  const { receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [receipt.namespaceId, receipt.runtimeResourceSetId].every(
      isAgentControlIdentity
    ) &&
    repositoryCommitPattern.test(receipt.repositoryCommit) &&
    [
      receipt.requestDigest,
      receipt.planDigest,
      receipt.frozenRunDigest,
      receipt.runConfigArtifactBindingDigest,
      receipt.resourceSetCommitmentDigest,
      receipt.expectedShardIdSetDigest,
      receipt.runTerminalFenceDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    Number.isSafeInteger(receipt.expectedShardCount) &&
    receipt.expectedShardCount >= 1 &&
    receipt.expectedShardCount <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS &&
    isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
      receipt.runTerminalFence
    ) &&
    receipt.runTerminalFenceDigest === receipt.runTerminalFence.fenceDigest &&
    receipt.runTerminalFence.namespaceId === receipt.namespaceId &&
    receipt.runTerminalFence.repositoryCommit === receipt.repositoryCommit &&
    receipt.runTerminalFence.planDigest === receipt.planDigest &&
    receipt.runTerminalFence.frozenRunDigest === receipt.frozenRunDigest &&
    receipt.runTerminalFence.runConfigArtifactBindingDigest ===
      receipt.runConfigArtifactBindingDigest &&
    receipt.runTerminalFence.runtimeResourceSetId ===
      receipt.runtimeResourceSetId &&
    receipt.runTerminalFence.expectedShardCount ===
      receipt.expectedShardCount &&
    receipt.runTerminalFence.terminalShardIdSetDigest ===
      receipt.expectedShardIdSetDigest &&
    isAgentControlInstant(receipt.checkedAt) &&
    isAgentControlInstant(receipt.expiresAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(receipt.checkedAt) &&
    Date.parse(receipt.expiresAt) - Date.parse(receipt.checkedAt) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_MAXIMUM_LIFETIME_MS &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_RECEIPT_MAXIMUM_BYTES
    )
  );
};

export const matchAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt =
  (
    receipt: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
    request: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest,
    observedAt: Instant
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(receipt) &&
    isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveRequest(request) &&
    isAgentControlInstant(observedAt) &&
    receipt.requestDigest === request.requestDigest &&
    receipt.namespaceId === request.namespaceId &&
    receipt.repositoryCommit === request.repositoryCommit &&
    receipt.planDigest === request.planDigest &&
    receipt.frozenRunDigest === request.frozenRunDigest &&
    receipt.runConfigArtifactBindingDigest ===
      request.runConfigArtifactBindingDigest &&
    receipt.runtimeResourceSetId === request.runtimeResourceSetId &&
    receipt.resourceSetCommitmentDigest ===
      request.resourceSetCommitmentDigest &&
    receipt.expectedShardCount === request.expectedShardCount &&
    receipt.expectedShardIdSetDigest === request.expectedShardIdSetDigest &&
    Date.parse(receipt.checkedAt) >= Date.parse(request.requestedAt) &&
    Date.parse(observedAt) >= Date.parse(receipt.checkedAt) &&
    Date.parse(observedAt) < Date.parse(receipt.expiresAt);

export const createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
      | 'format'
      | 'requestDigest'
      | 'terminalFenceDeriveReceiptDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest => {
    if (
      !exact(input, postMatrixCleanupClaimRequestInputKeys) ||
      ![input.namespaceId, input.runtimeResourceSetId].every(
        isAgentControlIdentity
      ) ||
      input.purpose !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE ||
      !repositoryCommitPattern.test(input.repositoryCommit) ||
      ![
        input.planDigest,
        input.frozenRunDigest,
        input.runConfigArtifactBindingDigest,
        input.authorityDigest,
        input.resourceSetCommitmentDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        input.terminalFenceDeriveReceipt
      ) ||
      !isAgentControlIdentity(input.cleanupOwnerInstanceId) ||
      !isAgentControlInstant(input.claimedAt) ||
      !isAgentControlInstant(input.minimumClaimExpiresAt) ||
      Date.parse(input.claimedAt) <
        Date.parse(input.terminalFenceDeriveReceipt.checkedAt) ||
      Date.parse(input.claimedAt) >=
        Date.parse(input.terminalFenceDeriveReceipt.expiresAt) ||
      Date.parse(input.minimumClaimExpiresAt) <= Date.parse(input.claimedAt) ||
      Date.parse(input.minimumClaimExpiresAt) - Date.parse(input.claimedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS ||
      input.namespaceId !== input.terminalFenceDeriveReceipt.namespaceId ||
      input.repositoryCommit !==
        input.terminalFenceDeriveReceipt.repositoryCommit ||
      input.planDigest !== input.terminalFenceDeriveReceipt.planDigest ||
      input.frozenRunDigest !==
        input.terminalFenceDeriveReceipt.frozenRunDigest ||
      input.runConfigArtifactBindingDigest !==
        input.terminalFenceDeriveReceipt.runConfigArtifactBindingDigest ||
      input.runtimeResourceSetId !==
        input.terminalFenceDeriveReceipt.runtimeResourceSetId ||
      input.resourceSetCommitmentDigest !==
        input.terminalFenceDeriveReceipt.resourceSetCommitmentDigest
    ) {
      throw new TypeError(
        'Hosted retrieval runtime post-matrix cleanup claim request is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
      terminalFenceDeriveReceiptDigest:
        input.terminalFenceDeriveReceipt.receiptDigest,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        request,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_REQUEST_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval runtime post-matrix cleanup claim request is oversized.'
      );
    }
    return request;
  };

export const isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest => {
    if (!exact(value, postMatrixCleanupClaimRequestKeys)) return false;
    try {
      const {
        format: _format,
        version: _version,
        requestDigest: _requestDigest,
        terminalFenceDeriveReceiptDigest: _receiptDigest,
        ...input
      } = value as AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest;
      return sameCanonicalJson(
        value,
        createAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
          input
        )
      );
    } catch {
      return false;
    }
  };

const matchPostMatrixCleanupClaimContext = (
  request: AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence
): boolean => {
  if (
    !isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
      request
    ) ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      registrationResult
    ) ||
    !isAgentHostedRetrievalRuntimeResourceSetCommitment(
      resourceSetCommitment
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment(
      resourceSetCommitment,
      registrationResult.authority
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceStoredRunTerminalFence(
      request.terminalFenceDeriveReceipt.runTerminalFence,
      storedRunTerminalFence
    )
  ) {
    return false;
  }
  const registrationRequest = registrationResult.registrationRequest;
  return (
    request.namespaceId === registrationRequest.namespaceId &&
    request.repositoryCommit === registrationRequest.repositoryCommit &&
    request.planDigest === registrationRequest.planDigest &&
    request.frozenRunDigest === registrationRequest.frozenRunDigest &&
    request.runConfigArtifactBindingDigest ===
      registrationRequest.runConfigArtifactBindingDigest &&
    request.runtimeResourceSetId === registrationRequest.runtimeResourceSetId &&
    request.authorityDigest === registrationResult.authorityDigest &&
    request.resourceSetCommitmentDigest ===
      resourceSetCommitment.commitmentDigest
  );
};

/** Backend must perform this exact receipt lookup inside the serializable claim CAS. */
export const matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext =
  (
    request: AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
    resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
    storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence,
    storedTerminalFenceDeriveReceipt: AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt
  ): boolean =>
    matchPostMatrixCleanupClaimContext(
      request,
      registrationResult,
      resourceSetCommitment,
      storedRunTerminalFence
    ) &&
    isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
      storedTerminalFenceDeriveReceipt
    ) &&
    sameCanonicalJson(
      request.terminalFenceDeriveReceipt,
      storedTerminalFenceDeriveReceipt
    );
