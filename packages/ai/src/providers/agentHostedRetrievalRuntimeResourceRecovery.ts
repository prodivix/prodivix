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
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  exact,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceActiveState,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupRequest,
  type AgentHostedRetrievalRuntimeResourceOverdueReceipt,
  type AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceRunTerminalFence,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupReceipt,
  isAgentHostedRetrievalRuntimeResourceCleanupRequest,
  isAgentHostedRetrievalRuntimeResourceOverdueReceipt,
  isAgentHostedRetrievalRuntimeResourceRunTerminalFence,
  matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim,
} from './agentHostedRetrievalRuntimeResourceCleanup';
import {
  isAgentHostedRetrievalRuntimeResourceActiveState,
  isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot,
} from './agentHostedRetrievalRuntimeResourceRead';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE,
  isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
  isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext,
  type AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest,
  type AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt,
} from './agentHostedRetrievalRuntimeResourceLifecycle';
import { AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE } from './agentHostedRetrievalRuntimeResourcePartialPrepareCleanup';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
} from './agentHostedRetrievalRuntimeResourceLifecycleTransportJournal';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER =
  'X-Prodivix-Hosted-Retrieval-Runtime-Resource-Purpose' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES = Object.freeze({
  ownerHealth: 'hosted-retrieval-runtime-resource-owner-health',
  registrations: 'hosted-retrieval-runtime-resource-registrations',
  registrationResults: 'hosted-retrieval-runtime-resource-results',
  reads: 'hosted-retrieval-runtime-resource-reads',
  terminalFenceDerivations:
    'hosted-retrieval-runtime-resource-terminal-fences/derive',
  recoveryCandidates: 'hosted-retrieval-runtime-resource-recovery-candidates',
  cleanupClaims: 'hosted-retrieval-runtime-resource-cleanup-claims',
  cleanups: 'hosted-retrieval-runtime-resource-cleanups',
  cleanupResults: 'hosted-retrieval-runtime-resource-cleanup-results',
  lifecycleJournalDispatchIntents:
    'hosted-retrieval-runtime-resource-lifecycle-journal/dispatch-intents',
  lifecycleJournalTransportReceipts:
    'hosted-retrieval-runtime-resource-lifecycle-journal/transport-receipts',
  lifecycleJournalRecords:
    'hosted-retrieval-runtime-resource-lifecycle-journal/records',
} as const);
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES = Object.freeze({
  readOwnerHealth:
    'hosted-retrieval-runtime-resource.preactivation-health.read',
  prepare: 'hosted-retrieval-runtime-resource.prepare',
  readRegistrationSet:
    'hosted-retrieval-runtime-resource.registration-set.read',
  read: 'hosted-retrieval-runtime-resource.read',
  deriveTerminalFence:
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_FENCE_DERIVE_PURPOSE,
  listRecovery: 'hosted-retrieval-runtime-resource.cleanup.recovery.list',
  claimPostMatrixCleanup:
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_POST_MATRIX_CLEANUP_CLAIM_PURPOSE,
  claimPartialPrepareCleanup:
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE,
  claimCleanup: 'hosted-retrieval-runtime-resource.cleanup.claim',
  executePostMatrixCleanup:
    'hosted-retrieval-runtime-resource.cleanup.post-matrix.execute',
  executeCleanup: 'hosted-retrieval-runtime-resource.cleanup.execute',
  readPostMatrixCleanupResult:
    'hosted-retrieval-runtime-resource.cleanup.post-matrix.result.read',
  readCleanupResult: 'hosted-retrieval-runtime-resource.cleanup.result.read',
  stageLifecycleJournalDispatch:
    'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch',
  readLifecycleJournalUnfinishedDispatches:
    'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.unfinished.read',
  storeLifecycleJournalTransport:
    'hosted-retrieval-runtime-resource.lifecycle-journal.transport',
  readLifecycleJournalTransportRecovery:
    'hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read',
  readLifecycleJournalTransportReconciliation:
    'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read',
  storeLifecycleJournalTransportReconciliationObservation:
    'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.store',
  readLifecycleJournalArchive:
    'hosted-retrieval-runtime-resource.lifecycle-journal.records.recovery.read',
  sealLifecycleJournalRecord:
    'hosted-retrieval-runtime-resource.lifecycle-journal.seal',
} as const);

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_MAXIMUM =
  64 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_MAXIMUM_LIFETIME_MS =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES =
  196_608 as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CURSOR_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-cursor' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_SCAN_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-scan-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CANDIDATE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-candidate' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-page' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIMED_STATE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claimed-state' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_STATE_TRANSITION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-recovery-claim-state-transition' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-result-read-receipt' as const;

export type AgentHostedRetrievalRuntimeResourceRecoveryCursor = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CURSOR_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  scanLedgerRevision: number;
  afterEligibleAt: Instant;
  afterAuthorityDigest: CanonicalDigest;
  cursorDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRecoveryScanRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_SCAN_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.listRecovery;
  pageSize: number;
  cursor: AgentHostedRetrievalRuntimeResourceRecoveryCursor | null;
  requestedAt: Instant;
  requestDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRecoveryCandidate = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CANDIDATE_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  activeStateDigest: CanonicalDigest;
  readLeaseLedgerRootDigest: CanonicalDigest;
  storedRunTerminalFenceDigest: CanonicalDigest;
  resourceExpiresAt: Instant;
  eligibleAt: Instant;
  disposition: 'cleanup-incomplete' | 'resource-expired' | 'run-terminal';
  candidateDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRecoveryPage = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  requestDigest: CanonicalDigest;
  recoveryAuthorityIssuerId: string;
  recoveryAuthorityImplementationDigest: CanonicalDigest;
  scanLedgerRevision: number;
  candidates: readonly AgentHostedRetrievalRuntimeResourceRecoveryCandidate[];
  candidateSetDigest: CanonicalDigest;
  nextCursor: AgentHostedRetrievalRuntimeResourceRecoveryCursor | null;
  scannedAt: Instant;
  pageDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup;
  recoveryPageDigest: CanonicalDigest;
  candidate: AgentHostedRetrievalRuntimeResourceRecoveryCandidate;
  candidateDigest: CanonicalDigest;
  expectedActiveStateDigest: CanonicalDigest;
  cleanupOwnerInstanceId: string;
  claimedAt: Instant;
  requestDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  claimSource: 'post-matrix' | 'recovery';
  requestDigest: CanonicalDigest;
  claimSourceReceiptDigest: CanonicalDigest;
  candidateDigest: CanonicalDigest | null;
  recoveryAuthorityIssuerId: string;
  recoveryAuthorityImplementationDigest: CanonicalDigest;
  claimLedgerRevision: number;
  expectedActiveStateDigest: CanonicalDigest;
  cleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt;
  cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult;
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
  storedPriorActiveState: AgentHostedRetrievalRuntimeResourceActiveState;
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot;
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
  overdueReceipt: AgentHostedRetrievalRuntimeResourceOverdueReceipt | null;
  cleanupRequest: AgentHostedRetrievalRuntimeResourceCleanupRequest;
  cleanupClaimGeneration: number;
  claimedStateDigest: CanonicalDigest;
  claimStateTransitionDigest: CanonicalDigest;
  claimedAt: Instant;
  claimExpiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    purpose:
      | typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readCleanupResult
      | typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult;
    authorityDigest: CanonicalDigest;
    cleanupRequestDigest: CanonicalDigest;
    recoveryClaimReceiptDigest: CanonicalDigest;
    requestedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    status: 'cleaned' | 'pending';
    cleanupReceipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt | null;
    cleanupArchiveRecord: AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord | null;
    residualProviderResourceIds: readonly [] | null;
    readAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export const matchAgentHostedRetrievalRuntimeResourceRecoveryLifecycleDispatchRole =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    stageClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    recoveryClaimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt | null,
    observedAt: Instant
  ): boolean => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        stageClaim
      ) ||
      !isAgentControlInstant(observedAt) ||
      stageClaim.dispatchIntentDigest !== intent.intentDigest
    ) {
      return false;
    }
    if (intent.operation === 'create') {
      return (
        recoveryClaimReceipt === null &&
        stageClaim.deliveryDisposition === 'reconcile-only-replay' &&
        Date.parse(observedAt) >= Date.parse(stageClaim.claimedAt) &&
        Date.parse(observedAt) < Date.parse(stageClaim.claimExpiresAt) &&
        !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
          intent,
          stageClaim,
          observedAt
        )
      );
    }
    if (
      recoveryClaimReceipt === null ||
      !isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        recoveryClaimReceipt
      )
    ) {
      return false;
    }
    const registrationResult = recoveryClaimReceipt.registrationResult;
    const registrationRequest = registrationResult.registrationRequest;
    return (
      intent.lifecycleClaimReceiptDigest ===
        recoveryClaimReceipt.receiptDigest &&
      intent.authorityDigest === registrationResult.authorityDigest &&
      intent.registrationRequestDigest ===
        registrationResult.registrationRequestDigest &&
      intent.namespaceId === registrationRequest.namespaceId &&
      intent.repositoryCommit === registrationRequest.repositoryCommit &&
      intent.planDigest === registrationRequest.planDigest &&
      intent.frozenRunDigest === registrationRequest.frozenRunDigest &&
      intent.runConfigArtifactBindingDigest ===
        registrationRequest.runConfigArtifactBindingDigest &&
      intent.runtimeResourceSetId ===
        registrationRequest.runtimeResourceSetId &&
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
        intent,
        stageClaim,
        observedAt
      )
    );
  };

const selfDigest = <T extends Readonly<Record<string, unknown>>>(
  value: T,
  digestKey: string
): boolean => {
  const base: Record<string, unknown> = { ...value };
  delete base[digestKey];
  return (
    isAgentCanonicalDigest(value[digestKey]) &&
    value[digestKey] === digestAgentCanonicalValue(base)
  );
};

const digestRecoveryClaimStateTransition = (
  input: Readonly<{
    claimSource: 'post-matrix' | 'recovery';
    recoveryAuthorityIssuerId: string;
    recoveryAuthorityImplementationDigest: CanonicalDigest;
    claimLedgerRevision: number;
    requestDigest: CanonicalDigest;
    claimSourceReceiptDigest: CanonicalDigest;
    candidateDigest: CanonicalDigest | null;
    expectedActiveStateDigest: CanonicalDigest;
    claimedStateDigest: CanonicalDigest;
    cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_STATE_TRANSITION_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });

const cursorKeys = Object.freeze([
  'format',
  'version',
  'scanLedgerRevision',
  'afterEligibleAt',
  'afterAuthorityDigest',
  'cursorDigest',
]);
const candidateKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'activeStateDigest',
  'readLeaseLedgerRootDigest',
  'storedRunTerminalFenceDigest',
  'resourceExpiresAt',
  'eligibleAt',
  'disposition',
  'candidateDigest',
]);

export const isAgentHostedRetrievalRuntimeResourceRecoveryCursor = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryCursor => {
  if (!exact(value, cursorKeys)) return false;
  const cursor = value as AgentHostedRetrievalRuntimeResourceRecoveryCursor;
  return (
    cursor.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CURSOR_FORMAT &&
    cursor.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    Number.isSafeInteger(cursor.scanLedgerRevision) &&
    cursor.scanLedgerRevision >= 1 &&
    isAgentControlInstant(cursor.afterEligibleAt) &&
    isAgentCanonicalDigest(cursor.afterAuthorityDigest) &&
    selfDigest(cursor, 'cursorDigest')
  );
};

export const createAgentHostedRetrievalRuntimeResourceRecoveryCursor = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryCursor,
    'cursorDigest' | 'format' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRecoveryCursor => {
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CURSOR_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  const value = Object.freeze({
    ...base,
    cursorDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentHostedRetrievalRuntimeResourceRecoveryCursor(value)) {
    throw new TypeError('Hosted retrieval runtime recovery cursor is invalid.');
  }
  return value;
};

export const createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
    'format' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRecoveryScanRequest => {
  if (
    !exact(input, [
      'namespaceId',
      'purpose',
      'pageSize',
      'cursor',
      'requestedAt',
    ]) ||
    !isAgentControlIdentity(input.namespaceId) ||
    input.purpose !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.listRecovery ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_MAXIMUM ||
    (input.cursor !== null &&
      !isAgentHostedRetrievalRuntimeResourceRecoveryCursor(input.cursor)) ||
    !isAgentControlInstant(input.requestedAt)
  )
    throw new TypeError(
      'Hosted retrieval runtime recovery scan request is invalid.'
    );
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_SCAN_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryScanRequest => {
  if (
    !exact(value, [
      'format',
      'version',
      'namespaceId',
      'purpose',
      'pageSize',
      'cursor',
      'requestedAt',
      'requestDigest',
    ])
  )
    return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceRecoveryScanRequest;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceRecoveryScanRequest(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceRecoveryCandidate = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryCandidate,
    'candidateDigest' | 'format' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRecoveryCandidate => {
  if (
    !exact(input, candidateKeys.slice(2, -1)) ||
    ![input.namespaceId, input.runtimeResourceSetId].every(
      isAgentControlIdentity
    ) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
      input.authorityDigest,
      input.resourceSetCommitmentDigest,
      input.activeStateDigest,
      input.readLeaseLedgerRootDigest,
      input.storedRunTerminalFenceDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(input.resourceExpiresAt) ||
    !isAgentControlInstant(input.eligibleAt) ||
    !['cleanup-incomplete', 'resource-expired', 'run-terminal'].includes(
      input.disposition
    )
  )
    throw new TypeError(
      'Hosted retrieval runtime recovery candidate is invalid.'
    );
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CANDIDATE_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    candidateDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceRecoveryCandidate = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryCandidate => {
  if (!exact(value, candidateKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      candidateDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceRecoveryCandidate;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceRecoveryCandidate(input)
    );
  } catch {
    return false;
  }
};

const candidateOrderKey = (
  candidate: AgentHostedRetrievalRuntimeResourceRecoveryCandidate
): string =>
  canonicalJsonText([candidate.eligibleAt, candidate.authorityDigest]);

export const createAgentHostedRetrievalRuntimeResourceRecoveryPage = (
  request: AgentHostedRetrievalRuntimeResourceRecoveryScanRequest,
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryPage,
    'candidateSetDigest' | 'format' | 'pageDigest' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRecoveryPage => {
  const candidates = Object.freeze([...input.candidates]);
  if (
    !isAgentHostedRetrievalRuntimeResourceRecoveryScanRequest(request) ||
    !exact(input, [
      'recoveryAuthorityIssuerId',
      'recoveryAuthorityImplementationDigest',
      'scanLedgerRevision',
      'candidates',
      'nextCursor',
      'scannedAt',
    ]) ||
    !isAgentControlIdentity(input.recoveryAuthorityIssuerId) ||
    !isAgentCanonicalDigest(input.recoveryAuthorityImplementationDigest) ||
    !Number.isSafeInteger(input.scanLedgerRevision) ||
    input.scanLedgerRevision < 1 ||
    candidates.length > request.pageSize ||
    candidates.some(
      (candidate) =>
        !isAgentHostedRetrievalRuntimeResourceRecoveryCandidate(candidate) ||
        candidate.namespaceId !== request.namespaceId
    ) ||
    candidates.some(
      (candidate, index) =>
        index > 0 &&
        compareUnicodeCodePoints(
          candidateOrderKey(candidates[index - 1]!),
          candidateOrderKey(candidate)
        ) >= 0
    ) ||
    (input.nextCursor !== null &&
      (!isAgentHostedRetrievalRuntimeResourceRecoveryCursor(input.nextCursor) ||
        input.nextCursor.scanLedgerRevision !== input.scanLedgerRevision)) ||
    !isAgentControlInstant(input.scannedAt)
  )
    throw new TypeError('Hosted retrieval runtime recovery page is invalid.');
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    requestDigest: request.requestDigest,
    ...input,
    candidates,
    candidateSetDigest: digestAgentCanonicalValue(
      candidates.map(({ candidateDigest }) => candidateDigest)
    ),
  });
  const page = Object.freeze({
    ...base,
    pageDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      page,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 4
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime recovery page is unsafe or unbounded.'
    );
  }
  return page;
};

export const isAgentHostedRetrievalRuntimeResourceRecoveryPage = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryPage => {
  if (
    !exact(value, [
      'format',
      'version',
      'requestDigest',
      'recoveryAuthorityIssuerId',
      'recoveryAuthorityImplementationDigest',
      'scanLedgerRevision',
      'candidates',
      'candidateSetDigest',
      'nextCursor',
      'scannedAt',
      'pageDigest',
    ])
  ) {
    return false;
  }
  const page = value as AgentHostedRetrievalRuntimeResourceRecoveryPage;
  const { pageDigest, ...base } = page;
  return (
    page.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_FORMAT &&
    page.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      page.requestDigest,
      page.recoveryAuthorityImplementationDigest,
      page.candidateSetDigest,
      page.pageDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlIdentity(page.recoveryAuthorityIssuerId) &&
    Number.isSafeInteger(page.scanLedgerRevision) &&
    page.scanLedgerRevision >= 1 &&
    Array.isArray(page.candidates) &&
    page.candidates.length <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_PAGE_MAXIMUM &&
    page.candidates.every(
      isAgentHostedRetrievalRuntimeResourceRecoveryCandidate
    ) &&
    page.candidates.every(
      (candidate, index) =>
        index === 0 ||
        compareUnicodeCodePoints(
          candidateOrderKey(page.candidates[index - 1]!),
          candidateOrderKey(candidate)
        ) < 0
    ) &&
    page.candidateSetDigest ===
      digestAgentCanonicalValue(
        page.candidates.map(({ candidateDigest }) => candidateDigest)
      ) &&
    (page.nextCursor === null ||
      (isAgentHostedRetrievalRuntimeResourceRecoveryCursor(page.nextCursor) &&
        page.nextCursor.scanLedgerRevision === page.scanLedgerRevision)) &&
    isAgentControlInstant(page.scannedAt) &&
    pageDigest === digestAgentCanonicalValue(base) &&
    safe(
      page,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 4
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest = (
  page: AgentHostedRetrievalRuntimeResourceRecoveryPage,
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
    | 'candidateDigest'
    | 'format'
    | 'recoveryPageDigest'
    | 'requestDigest'
    | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest => {
  if (
    !isAgentHostedRetrievalRuntimeResourceRecoveryPage(page) ||
    !exact(input, [
      'namespaceId',
      'purpose',
      'candidate',
      'expectedActiveStateDigest',
      'cleanupOwnerInstanceId',
      'claimedAt',
    ]) ||
    !isAgentHostedRetrievalRuntimeResourceRecoveryCandidate(input.candidate) ||
    !page.candidates.some(
      ({ candidateDigest }) =>
        candidateDigest === input.candidate.candidateDigest
    ) ||
    input.namespaceId !== input.candidate.namespaceId ||
    input.expectedActiveStateDigest !== input.candidate.activeStateDigest ||
    !isAgentControlIdentity(input.cleanupOwnerInstanceId) ||
    !isAgentControlInstant(input.claimedAt) ||
    input.purpose !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup
  )
    throw new TypeError(
      'Hosted retrieval runtime recovery claim request is invalid.'
    );
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
    recoveryPageDigest: page.pageDigest,
    candidateDigest: input.candidate.candidateDigest,
  });
  return Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest => {
  if (
    !exact(value, [
      'format',
      'version',
      'namespaceId',
      'purpose',
      'recoveryPageDigest',
      'candidate',
      'candidateDigest',
      'expectedActiveStateDigest',
      'cleanupOwnerInstanceId',
      'claimedAt',
      'requestDigest',
    ])
  )
    return false;
  const request =
    value as AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest;
  const { requestDigest, ...base } = request;
  return (
    request.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_REQUEST_FORMAT &&
    request.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    isAgentControlIdentity(request.namespaceId) &&
    request.purpose ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.claimCleanup &&
    isAgentCanonicalDigest(request.recoveryPageDigest) &&
    isAgentHostedRetrievalRuntimeResourceRecoveryCandidate(request.candidate) &&
    request.candidateDigest === request.candidate.candidateDigest &&
    request.namespaceId === request.candidate.namespaceId &&
    request.expectedActiveStateDigest === request.candidate.activeStateDigest &&
    isAgentControlIdentity(request.cleanupOwnerInstanceId) &&
    isAgentControlInstant(request.claimedAt) &&
    requestDigest === digestAgentCanonicalValue(base)
  );
};

export const createAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt = (
  request:
    | AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest
    | AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest,
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
    | 'candidateDigest'
    | 'claimSource'
    | 'claimSourceReceiptDigest'
    | 'claimedStateDigest'
    | 'claimStateTransitionDigest'
    | 'cleanupClaimGeneration'
    | 'cleanupClaimAuthorityReceiptDigest'
    | 'expectedActiveStateDigest'
    | 'format'
    | 'receiptDigest'
    | 'recoveryAuthorityImplementationDigest'
    | 'recoveryAuthorityIssuerId'
    | 'claimLedgerRevision'
    | 'requestDigest'
    | 'version'
  >,
  storedClaimSourceReceipt:
    | AgentHostedRetrievalRuntimeResourceRecoveryPage
    | AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt
): AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt => {
  const authority = input.registrationResult.authority;
  const recoveryRequest =
    isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(request);
  const postMatrixRequest =
    isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(request);
  const expectedActiveStateDigest = recoveryRequest
    ? request.expectedActiveStateDigest
    : input.cleanupClaimAuthorityReceipt.expectedActiveStateDigest;
  const claimSource = recoveryRequest
    ? ('recovery' as const)
    : ('post-matrix' as const);
  const claimSourceReceiptDigest = recoveryRequest
    ? request.recoveryPageDigest
    : postMatrixRequest
      ? request.terminalFenceDeriveReceiptDigest
      : input.cleanupClaimAuthorityReceipt.receiptDigest;
  const candidateDigest = recoveryRequest ? request.candidateDigest : null;
  if (
    (!recoveryRequest && !postMatrixRequest) ||
    (recoveryRequest &&
      (!isAgentHostedRetrievalRuntimeResourceRecoveryPage(
        storedClaimSourceReceipt
      ) ||
        storedClaimSourceReceipt.pageDigest !== request.recoveryPageDigest ||
        !storedClaimSourceReceipt.candidates.some(
          ({ candidateDigest: storedCandidateDigest }) =>
            storedCandidateDigest === request.candidateDigest
        ))) ||
    (postMatrixRequest &&
      !isAgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt(
        storedClaimSourceReceipt
      )) ||
    !exact(input, [
      'cleanupClaimAuthorityReceipt',
      'registrationResult',
      'resourceSetCommitment',
      'storedPriorActiveState',
      'readLeaseLedgerRoot',
      'storedRunTerminalFence',
      'overdueReceipt',
      'cleanupRequest',
      'claimedAt',
      'claimExpiresAt',
    ]) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      input.cleanupClaimAuthorityReceipt
    ) ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      input.registrationResult
    ) ||
    !isAgentHostedRetrievalRuntimeResourceSetCommitment(
      input.resourceSetCommitment
    ) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(
      input.storedPriorActiveState
    ) ||
    !isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
      input.readLeaseLedgerRoot
    ) ||
    !isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
      input.storedRunTerminalFence
    ) ||
    (input.overdueReceipt !== null &&
      !isAgentHostedRetrievalRuntimeResourceOverdueReceipt(
        input.overdueReceipt
      )) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupRequest(
      input.cleanupRequest
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim(
      input.cleanupRequest,
      input.registrationResult,
      input.resourceSetCommitment,
      input.cleanupClaimAuthorityReceipt,
      input.storedPriorActiveState,
      input.readLeaseLedgerRoot,
      input.storedRunTerminalFence,
      input.overdueReceipt
    ) ||
    (recoveryRequest &&
      (authority.authorityDigest !== request.candidate.authorityDigest ||
        input.registrationResult.registrationRequest.namespaceId !==
          request.candidate.namespaceId ||
        input.registrationResult.registrationRequest.repositoryCommit !==
          request.candidate.repositoryCommit ||
        authority.planDigest !== request.candidate.planDigest ||
        authority.frozenRunDigest !== request.candidate.frozenRunDigest ||
        authority.runConfigArtifactBindingDigest !==
          request.candidate.runConfigArtifactBindingDigest ||
        authority.runtimeResourceSetId !==
          request.candidate.runtimeResourceSetId ||
        input.resourceSetCommitment.commitmentDigest !==
          request.candidate.resourceSetCommitmentDigest ||
        input.readLeaseLedgerRoot.rootDigest !==
          request.candidate.readLeaseLedgerRootDigest ||
        input.storedRunTerminalFence.fenceDigest !==
          request.candidate.storedRunTerminalFenceDigest)) ||
    (postMatrixRequest &&
      !matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimStoredContext(
        request,
        input.registrationResult,
        input.resourceSetCommitment,
        input.storedRunTerminalFence,
        storedClaimSourceReceipt as AgentHostedRetrievalRuntimeResourceTerminalFenceDeriveReceipt
      )) ||
    input.storedPriorActiveState.stateDigest !== expectedActiveStateDigest ||
    input.cleanupClaimAuthorityReceipt.expectedActiveStateDigest !==
      expectedActiveStateDigest ||
    input.cleanupClaimAuthorityReceipt.cleanupOwnerInstanceId !==
      request.cleanupOwnerInstanceId ||
    input.cleanupClaimAuthorityReceipt.claimedAt !== input.claimedAt ||
    input.cleanupClaimAuthorityReceipt.claimExpiresAt !==
      input.claimExpiresAt ||
    input.cleanupClaimAuthorityReceipt.receiptDigest !==
      input.cleanupRequest.cleanupClaimAuthorityReceiptDigest ||
    input.cleanupRequest.cleanupOwnerInstanceId !==
      request.cleanupOwnerInstanceId ||
    input.cleanupRequest.requestedAt !== request.claimedAt ||
    input.claimedAt !== request.claimedAt ||
    (postMatrixRequest &&
      Date.parse(input.claimExpiresAt) <
        Date.parse(request.minimumClaimExpiresAt)) ||
    !isAgentControlInstant(input.claimExpiresAt) ||
    Date.parse(input.claimExpiresAt) <= Date.parse(input.claimedAt) ||
    Date.parse(input.claimExpiresAt) - Date.parse(input.claimedAt) >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_MAXIMUM_LIFETIME_MS
  )
    throw new TypeError(
      'Hosted retrieval runtime recovery claim receipt is invalid.'
    );
  const cleanupClaimGeneration = input.cleanupRequest.claimGeneration;
  const claimedStateDigest =
    input.cleanupClaimAuthorityReceipt.claimedStateDigest;
  const claimStateTransitionDigest = digestRecoveryClaimStateTransition({
    claimSource,
    recoveryAuthorityIssuerId:
      input.cleanupClaimAuthorityReceipt.claimAuthorityIssuerId,
    recoveryAuthorityImplementationDigest:
      input.cleanupClaimAuthorityReceipt.claimAuthorityImplementationDigest,
    claimLedgerRevision: input.cleanupClaimAuthorityReceipt.claimLedgerRevision,
    requestDigest: request.requestDigest,
    claimSourceReceiptDigest,
    candidateDigest,
    expectedActiveStateDigest,
    claimedStateDigest,
    cleanupClaimAuthorityReceiptDigest:
      input.cleanupClaimAuthorityReceipt.receiptDigest,
  });
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    claimSource,
    requestDigest: request.requestDigest,
    claimSourceReceiptDigest,
    candidateDigest,
    expectedActiveStateDigest,
    recoveryAuthorityIssuerId:
      input.cleanupClaimAuthorityReceipt.claimAuthorityIssuerId,
    recoveryAuthorityImplementationDigest:
      input.cleanupClaimAuthorityReceipt.claimAuthorityImplementationDigest,
    claimLedgerRevision: input.cleanupClaimAuthorityReceipt.claimLedgerRevision,
    cleanupClaimAuthorityReceiptDigest:
      input.cleanupClaimAuthorityReceipt.receiptDigest,
    ...input,
    cleanupClaimGeneration,
    claimedStateDigest,
    claimStateTransitionDigest,
  });
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime recovery claim receipt is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt => {
  if (
    !exact(value, [
      'format',
      'version',
      'claimSource',
      'requestDigest',
      'claimSourceReceiptDigest',
      'candidateDigest',
      'recoveryAuthorityIssuerId',
      'recoveryAuthorityImplementationDigest',
      'claimLedgerRevision',
      'expectedActiveStateDigest',
      'cleanupClaimAuthorityReceipt',
      'cleanupClaimAuthorityReceiptDigest',
      'registrationResult',
      'resourceSetCommitment',
      'storedPriorActiveState',
      'readLeaseLedgerRoot',
      'storedRunTerminalFence',
      'overdueReceipt',
      'cleanupRequest',
      'cleanupClaimGeneration',
      'claimedStateDigest',
      'claimStateTransitionDigest',
      'claimedAt',
      'claimExpiresAt',
      'receiptDigest',
    ])
  )
    return false;
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt;
  const { receiptDigest, ...base } = receipt;
  if (
    receipt.format !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_FORMAT ||
    receipt.version !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION ||
    !['post-matrix', 'recovery'].includes(receipt.claimSource) ||
    (receipt.claimSource === 'post-matrix') !==
      (receipt.candidateDigest === null) ||
    ![
      receipt.requestDigest,
      receipt.claimSourceReceiptDigest,
      receipt.recoveryAuthorityImplementationDigest,
      receipt.expectedActiveStateDigest,
      receipt.cleanupClaimAuthorityReceiptDigest,
      receipt.claimedStateDigest,
      receipt.claimStateTransitionDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) ||
    (receipt.candidateDigest !== null &&
      !isAgentCanonicalDigest(receipt.candidateDigest)) ||
    !isAgentControlIdentity(receipt.recoveryAuthorityIssuerId) ||
    !Number.isSafeInteger(receipt.claimLedgerRevision) ||
    receipt.claimLedgerRevision < 1 ||
    !isAgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt(
      receipt.cleanupClaimAuthorityReceipt
    ) ||
    receipt.cleanupClaimAuthorityReceiptDigest !==
      receipt.cleanupClaimAuthorityReceipt.receiptDigest ||
    receipt.recoveryAuthorityIssuerId !==
      receipt.cleanupClaimAuthorityReceipt.claimAuthorityIssuerId ||
    receipt.recoveryAuthorityImplementationDigest !==
      receipt.cleanupClaimAuthorityReceipt.claimAuthorityImplementationDigest ||
    receipt.claimLedgerRevision !==
      receipt.cleanupClaimAuthorityReceipt.claimLedgerRevision ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      receipt.registrationResult
    ) ||
    !isAgentHostedRetrievalRuntimeResourceSetCommitment(
      receipt.resourceSetCommitment
    ) ||
    !isAgentHostedRetrievalRuntimeResourceActiveState(
      receipt.storedPriorActiveState
    ) ||
    receipt.expectedActiveStateDigest !==
      receipt.storedPriorActiveState.stateDigest ||
    receipt.cleanupClaimAuthorityReceipt.expectedActiveStateDigest !==
      receipt.expectedActiveStateDigest ||
    receipt.cleanupClaimAuthorityReceipt.claimedAt !== receipt.claimedAt ||
    receipt.cleanupClaimAuthorityReceipt.claimExpiresAt !==
      receipt.claimExpiresAt ||
    !isAgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot(
      receipt.readLeaseLedgerRoot
    ) ||
    !isAgentHostedRetrievalRuntimeResourceRunTerminalFence(
      receipt.storedRunTerminalFence
    ) ||
    (receipt.overdueReceipt !== null &&
      !isAgentHostedRetrievalRuntimeResourceOverdueReceipt(
        receipt.overdueReceipt
      )) ||
    !isAgentHostedRetrievalRuntimeResourceCleanupRequest(
      receipt.cleanupRequest
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceDurableCleanupClaim(
      receipt.cleanupRequest,
      receipt.registrationResult,
      receipt.resourceSetCommitment,
      receipt.cleanupClaimAuthorityReceipt,
      receipt.storedPriorActiveState,
      receipt.readLeaseLedgerRoot,
      receipt.storedRunTerminalFence,
      receipt.overdueReceipt
    ) ||
    receipt.cleanupClaimGeneration !== receipt.cleanupRequest.claimGeneration ||
    receipt.claimedAt !== receipt.cleanupRequest.requestedAt ||
    !isAgentControlInstant(receipt.claimedAt) ||
    !isAgentControlInstant(receipt.claimExpiresAt) ||
    Date.parse(receipt.claimExpiresAt) <= Date.parse(receipt.claimedAt) ||
    Date.parse(receipt.claimExpiresAt) - Date.parse(receipt.claimedAt) >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_MAXIMUM_LIFETIME_MS
  )
    return false;
  return (
    receipt.claimedStateDigest ===
      receipt.cleanupClaimAuthorityReceipt.claimedStateDigest &&
    receipt.claimStateTransitionDigest ===
      digestRecoveryClaimStateTransition({
        claimSource: receipt.claimSource,
        recoveryAuthorityIssuerId: receipt.recoveryAuthorityIssuerId,
        recoveryAuthorityImplementationDigest:
          receipt.recoveryAuthorityImplementationDigest,
        claimLedgerRevision: receipt.claimLedgerRevision,
        requestDigest: receipt.requestDigest,
        claimSourceReceiptDigest: receipt.claimSourceReceiptDigest,
        candidateDigest: receipt.candidateDigest,
        expectedActiveStateDigest: receipt.expectedActiveStateDigest,
        claimedStateDigest: receipt.claimedStateDigest,
        cleanupClaimAuthorityReceiptDigest:
          receipt.cleanupClaimAuthorityReceiptDigest,
      }) &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RECOVERY_CLAIM_RECEIPT_MAXIMUM_BYTES
    )
  );
};

export const matchAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt = (
  receipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  request: AgentHostedRetrievalRuntimeResourceRecoveryClaimRequest
): boolean =>
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(receipt) &&
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimRequest(request) &&
  receipt.claimSource === 'recovery' &&
  receipt.requestDigest === request.requestDigest &&
  receipt.candidateDigest === request.candidateDigest &&
  receipt.claimSourceReceiptDigest === request.recoveryPageDigest &&
  receipt.expectedActiveStateDigest === request.expectedActiveStateDigest &&
  receipt.cleanupRequest.cleanupOwnerInstanceId ===
    request.cleanupOwnerInstanceId;

export const matchAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimReceipt =
  (
    receipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
    request: AgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(receipt) &&
    isAgentHostedRetrievalRuntimeResourcePostMatrixCleanupClaimRequest(
      request
    ) &&
    receipt.claimSource === 'post-matrix' &&
    receipt.requestDigest === request.requestDigest &&
    receipt.claimSourceReceiptDigest ===
      request.terminalFenceDeriveReceiptDigest &&
    receipt.candidateDigest === null &&
    receipt.registrationResult.authorityDigest === request.authorityDigest &&
    receipt.resourceSetCommitment.commitmentDigest ===
      request.resourceSetCommitmentDigest &&
    receipt.storedRunTerminalFence.fenceDigest ===
      request.terminalFenceDeriveReceipt.runTerminalFenceDigest &&
    receipt.cleanupRequest.cleanupOwnerInstanceId ===
      request.cleanupOwnerInstanceId &&
    Date.parse(receipt.claimExpiresAt) >=
      Date.parse(request.minimumClaimExpiresAt);

/** Exact Backend CAS lookup required immediately before provider deletion. */
export const matchAgentHostedRetrievalRuntimeResourceStoredRecoveryClaimReceipt =
  (
    receipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
    storedReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(receipt) &&
    isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(storedReceipt) &&
    sameCanonicalJson(receipt, storedReceipt);

export const createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest => {
    if (
      !exact(input, [
        'namespaceId',
        'purpose',
        'authorityDigest',
        'cleanupRequestDigest',
        'recoveryClaimReceiptDigest',
        'requestedAt',
      ]) ||
      !isAgentControlIdentity(input.namespaceId) ||
      ![
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readCleanupResult,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readPostMatrixCleanupResult,
      ].includes(input.purpose) ||
      ![
        input.authorityDigest,
        input.cleanupRequestDigest,
        input.recoveryClaimReceiptDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlInstant(input.requestedAt)
    )
      throw new TypeError(
        'Hosted retrieval runtime cleanup result read request is invalid.'
      );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    return Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest => {
  if (
    !exact(value, [
      'format',
      'version',
      'namespaceId',
      'purpose',
      'authorityDigest',
      'cleanupRequestDigest',
      'recoveryClaimReceiptDigest',
      'requestedAt',
      'requestDigest',
    ])
  )
    return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest: _requestDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceCleanupResultReadRequest,
    input: Omit<
      AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt,
      'format' | 'receiptDigest' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt => {
    const cleaned = input.status === 'cleaned';
    if (
      !isAgentHostedRetrievalRuntimeResourceCleanupResultReadRequest(request) ||
      !exact(input, [
        'status',
        'cleanupReceipt',
        'cleanupArchiveRecord',
        'residualProviderResourceIds',
        'readAt',
      ]) ||
      !['cleaned', 'pending'].includes(input.status) ||
      cleaned !== (input.cleanupReceipt !== null) ||
      cleaned !== (input.cleanupArchiveRecord !== null) ||
      cleaned !== (input.residualProviderResourceIds !== null) ||
      (input.cleanupReceipt !== null &&
        (!isAgentHostedRetrievalRuntimeResourceCleanupReceipt(
          input.cleanupReceipt
        ) ||
          input.cleanupReceipt.authorityDigest !== request.authorityDigest ||
          input.cleanupReceipt.cleanupRequestDigest !==
            request.cleanupRequestDigest)) ||
      (input.cleanupArchiveRecord !== null &&
        (!isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(
          input.cleanupArchiveRecord
        ) ||
          input.cleanupArchiveRecord.cleanupReceiptDigest !==
            input.cleanupReceipt?.cleanupReceiptDigest)) ||
      (input.residualProviderResourceIds !== null &&
        input.residualProviderResourceIds.length !== 0) ||
      !isAgentControlInstant(input.readAt)
    )
      throw new TypeError(
        'Hosted retrieval runtime cleanup result read receipt is invalid.'
      );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      requestDigest: request.requestDigest,
      ...input,
    });
    return Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt => {
  if (
    !exact(value, [
      'format',
      'version',
      'requestDigest',
      'status',
      'cleanupReceipt',
      'cleanupArchiveRecord',
      'residualProviderResourceIds',
      'readAt',
      'receiptDigest',
    ])
  )
    return false;
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceCleanupResultReadReceipt;
  const { receiptDigest, ...base } = receipt;
  const cleaned = receipt.status === 'cleaned';
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESULT_READ_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    isAgentCanonicalDigest(receipt.requestDigest) &&
    ['cleaned', 'pending'].includes(receipt.status) &&
    cleaned === (receipt.cleanupReceipt !== null) &&
    cleaned === (receipt.cleanupArchiveRecord !== null) &&
    cleaned === (receipt.residualProviderResourceIds !== null) &&
    (receipt.cleanupReceipt === null ||
      isAgentHostedRetrievalRuntimeResourceCleanupReceipt(
        receipt.cleanupReceipt
      )) &&
    (receipt.cleanupArchiveRecord === null ||
      (isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(
        receipt.cleanupArchiveRecord
      ) &&
        receipt.cleanupArchiveRecord.cleanupReceiptDigest ===
          receipt.cleanupReceipt?.cleanupReceiptDigest)) &&
    (receipt.residualProviderResourceIds === null ||
      receipt.residualProviderResourceIds.length === 0) &&
    isAgentControlInstant(receipt.readAt) &&
    isAgentCanonicalDigest(receipt.receiptDigest) &&
    receiptDigest === digestAgentCanonicalValue(base)
  );
};
