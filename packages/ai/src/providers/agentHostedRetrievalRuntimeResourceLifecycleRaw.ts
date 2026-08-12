import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import { isAgentEvaluationProviderResultSpoolEnvelope } from '../evaluation/agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationProviderResultSpoolEnvelope } from '../evaluation/agentEvaluationEvidenceAuthenticity.types';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  matchAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt,
  matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CONSERVATIVE_RECOVERY_RECEIPT_ID_PREFIX,
} from './agentHostedRetrievalRuntimeResourceLifecycleTransportJournal';
import { isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord } from './agentHostedRetrievalRuntimeResourceLifecycleArchive';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolDisposition,
  matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  type AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
} from './agentHostedRetrievalRuntimeResourceLifecycleSpool';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-stage-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-stage-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-store-receipt-history' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_MAXIMUM =
  4 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-recovery-read-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-read-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_CANDIDATE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-candidate' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-page' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.unfinished.read' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_MAXIMUM =
  8 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-archive-read-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-archive-read-page' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.records.recovery.read' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_MAXIMUM =
  8 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_INSTANCE_ID' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 32;

export type AgentHostedRetrievalRuntimeResourceLifecycleStageRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch';
    dispatchIntent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
    dispatchStageClaimRequest: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest;
    requestDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleStageReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    receiptDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.transport';
    expectedPriorTransportStoreReceiptDigest: CanonicalDigest | null;
    dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
    dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
    dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    transportReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet;
    spoolAad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad;
    spoolWriteEnvelope: AgentEvaluationProviderResultSpoolEnvelope;
    spoolEnvelopeAuthority: AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority;
    spoolReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt;
    requestDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    operation: 'create' | 'delete';
    registrationRequestDigest: CanonicalDigest;
    expectedPriorTransportStoreReceiptDigest: CanonicalDigest | null;
    transportAuthorityIssuerId: string;
    transportAuthorityImplementationDigest: CanonicalDigest;
    transportLedgerRevision: number;
    dispatchIntentSetDigest: CanonicalDigest;
    dispatchStageClaimReceiptSetDigest: CanonicalDigest;
    dispatchStageClaimHistorySetDigest: CanonicalDigest;
    transportReceiptSetDigest: CanonicalDigest;
    spoolAadDigest: CanonicalDigest;
    spoolEnvelopeDigest: CanonicalDigest;
    spoolReceiptDigest: CanonicalDigest;
    supersededSpoolReceiptDigest: CanonicalDigest | null;
    supersededSpoolDestroyedAt: Instant | null;
    storedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: 'create' | 'delete';
    registrationRequestDigest: CanonicalDigest;
    receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt[];
    receiptDigests: readonly CanonicalDigest[];
    historyDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE;
    namespaceId: string;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    expectedPriorTransportReceiptDigest: CanonicalDigest;
    spoolRef: string;
    lifecycleOwnerInstanceId: string;
    requestedAt: Instant;
    minimumReceiptExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    request: AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest;
    requestDigest: CanonicalDigest;
    recoveryAuthorityIssuerId: string;
    recoveryAuthorityImplementationDigest: CanonicalDigest;
    storedDispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    currentDispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
    dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
    transportReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet;
    spoolAad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad;
    spoolWriteEnvelope: AgentEvaluationProviderResultSpoolEnvelope;
    spoolEnvelopeAuthority: AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority;
    spoolReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt;
    transportStoreReceiptHistory: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory;
    transportStoreReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt;
    readAt: Instant;
    expiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    lifecycleOwnerInstanceId: string;
    pageSize: number;
    cursor: string | null;
    requestedAt: Instant;
    minimumSnapshotExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_CANDIDATE_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
    registrationRequestDigest: CanonicalDigest;
    dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
    dispatchIntentSetDigest: CanonicalDigest;
    dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    dispatchStageClaimHistorySetDigest: CanonicalDigest;
    unfinishedState: 'staged-before-transport' | 'transport-stored-before-seal';
    durableTransportReceiptSetDigest: CanonicalDigest | null;
    spoolRef: string | null;
    transportStoreReceiptDigest: CanonicalDigest | null;
    candidateDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    request: AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest;
    requestDigest: CanonicalDigest;
    recoveryAuthorityIssuerId: string;
    recoveryAuthorityImplementationDigest: CanonicalDigest;
    snapshotId: string;
    snapshotRevision: number;
    snapshotAt: Instant;
    expiresAt: Instant;
    candidates: readonly AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate[];
    candidateDigests: readonly CanonicalDigest[];
    nextCursor: string | null;
    pageDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    lifecycleOwnerInstanceId: string;
    pageSize: number;
    cursor: string | null;
    requestedAt: Instant;
    minimumSnapshotExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    request: AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest;
    requestDigest: CanonicalDigest;
    recoveryAuthorityIssuerId: string;
    recoveryAuthorityImplementationDigest: CanonicalDigest;
    snapshotId: string;
    snapshotRevision: number;
    snapshotAt: Instant;
    expiresAt: Instant;
    archiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
    archiveRecordDigests: readonly CanonicalDigest[];
    nextCursor: string | null;
    rollingJournalSetDigest: CanonicalDigest;
    archiveRootDigest: CanonicalDigest;
    pageDigest: CanonicalDigest;
  }>;
export type AgentHostedRetrievalRuntimeResourceLifecycleSealRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  purpose: 'hosted-retrieval-runtime-resource.lifecycle-journal.seal';
  journalRecord: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord;
  transportStoreReceiptHistory: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory;
  spoolDispositionReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt;
  requestDigest: CanonicalDigest;
}>;
export type AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  requestDigest: CanonicalDigest;
  sealAuthorityIssuerId: string;
  sealAuthorityImplementationDigest: CanonicalDigest;
  sealLedgerRevision: number;
  journalRecordDigest: CanonicalDigest;
  transportStoreReceiptHistoryDigest: CanonicalDigest;
  spoolDispositionReceiptDigest: CanonicalDigest;
  archiveRecordDigest: CanonicalDigest;
  sealedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

const stageRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'dispatchIntent',
  'dispatchStageClaimRequest',
  'requestDigest',
] as const);
const stageReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'dispatchIntentDigest',
  'dispatchStageClaimReceipt',
  'dispatchStageClaimReceiptDigest',
  'receiptDigest',
] as const);
const transportRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'expectedPriorTransportStoreReceiptDigest',
  'dispatchIntentSet',
  'dispatchStageClaimReceiptSet',
  'dispatchStageClaimHistorySet',
  'transportReceiptSet',
  'spoolAad',
  'spoolWriteEnvelope',
  'spoolEnvelopeAuthority',
  'spoolReceipt',
  'requestDigest',
] as const);
const transportReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'operation',
  'registrationRequestDigest',
  'expectedPriorTransportStoreReceiptDigest',
  'transportAuthorityIssuerId',
  'transportAuthorityImplementationDigest',
  'transportLedgerRevision',
  'dispatchIntentSetDigest',
  'dispatchStageClaimReceiptSetDigest',
  'dispatchStageClaimHistorySetDigest',
  'transportReceiptSetDigest',
  'spoolAadDigest',
  'spoolEnvelopeDigest',
  'spoolReceiptDigest',
  'supersededSpoolReceiptDigest',
  'supersededSpoolDestroyedAt',
  'storedAt',
  'receiptDigest',
] as const);
const transportStoreReceiptHistoryKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'receipts',
  'receiptDigests',
  'historyDigest',
] as const);
const transportRecoveryReadRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'namespaceId',
  'dispatchIntentDigest',
  'dispatchStageClaimReceiptDigest',
  'expectedPriorTransportReceiptDigest',
  'spoolRef',
  'lifecycleOwnerInstanceId',
  'requestedAt',
  'minimumReceiptExpiresAt',
  'requestDigest',
] as const);
const transportRecoveryReadReceiptKeys = Object.freeze([
  'format',
  'version',
  'request',
  'requestDigest',
  'recoveryAuthorityIssuerId',
  'recoveryAuthorityImplementationDigest',
  'storedDispatchStageClaimHistorySet',
  'currentDispatchStageClaimHistorySet',
  'dispatchIntentSet',
  'dispatchStageClaimReceiptSet',
  'transportReceiptSet',
  'spoolAad',
  'spoolWriteEnvelope',
  'spoolEnvelopeAuthority',
  'spoolReceipt',
  'transportStoreReceiptHistory',
  'transportStoreReceipt',
  'readAt',
  'expiresAt',
  'receiptDigest',
] as const);
const unfinishedDispatchReadRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lifecycleOwnerInstanceId',
  'pageSize',
  'cursor',
  'requestedAt',
  'minimumSnapshotExpiresAt',
  'requestDigest',
] as const);
const unfinishedDispatchCandidateKeys = Object.freeze([
  'format',
  'version',
  'registrationRequest',
  'registrationRequestDigest',
  'dispatchIntentSet',
  'dispatchIntentSetDigest',
  'dispatchStageClaimHistorySet',
  'dispatchStageClaimHistorySetDigest',
  'unfinishedState',
  'durableTransportReceiptSetDigest',
  'spoolRef',
  'transportStoreReceiptDigest',
  'candidateDigest',
] as const);
const unfinishedDispatchPageKeys = Object.freeze([
  'format',
  'version',
  'request',
  'requestDigest',
  'recoveryAuthorityIssuerId',
  'recoveryAuthorityImplementationDigest',
  'snapshotId',
  'snapshotRevision',
  'snapshotAt',
  'expiresAt',
  'candidates',
  'candidateDigests',
  'nextCursor',
  'pageDigest',
] as const);
const archiveReadRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lifecycleOwnerInstanceId',
  'pageSize',
  'cursor',
  'requestedAt',
  'minimumSnapshotExpiresAt',
  'requestDigest',
] as const);
const archiveReadPageKeys = Object.freeze([
  'format',
  'version',
  'request',
  'requestDigest',
  'recoveryAuthorityIssuerId',
  'recoveryAuthorityImplementationDigest',
  'snapshotId',
  'snapshotRevision',
  'snapshotAt',
  'expiresAt',
  'archiveRecords',
  'archiveRecordDigests',
  'nextCursor',
  'rollingJournalSetDigest',
  'archiveRootDigest',
  'pageDigest',
] as const);
const sealRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'journalRecord',
  'transportStoreReceiptHistory',
  'spoolDispositionReceipt',
  'requestDigest',
] as const);
const sealReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'sealAuthorityIssuerId',
  'sealAuthorityImplementationDigest',
  'sealLedgerRevision',
  'journalRecordDigest',
  'transportStoreReceiptHistoryDigest',
  'spoolDispositionReceiptDigest',
  'archiveRecordDigest',
  'sealedAt',
  'receiptDigest',
] as const);

const selfDigest = (
  value: Readonly<Record<string, unknown>>,
  digestKey: string
): boolean => {
  const base = { ...value };
  delete base[digestKey];
  return (
    isAgentCanonicalDigest(value[digestKey]) &&
    value[digestKey] === digestAgentCanonicalValue(base)
  );
};

const claimHistoryIsCanonicalPrefix = (
  stored: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  current: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet
): boolean =>
  stored.operation === current.operation &&
  stored.registrationRequestDigest === current.registrationRequestDigest &&
  stored.dispatchIntentSetDigest === current.dispatchIntentSetDigest &&
  sameCanonicalJson(
    stored.initialClaimReceiptSet,
    current.initialClaimReceiptSet
  ) &&
  stored.initialClaimReceiptSet.receipts.every(({ dispatchIntentDigest }) => {
    const storedChain = stored.receipts.filter(
      (receipt) => receipt.dispatchIntentDigest === dispatchIntentDigest
    );
    const currentChain = current.receipts.filter(
      (receipt) => receipt.dispatchIntentDigest === dispatchIntentDigest
    );
    return (
      storedChain.length <= currentChain.length &&
      sameCanonicalJson(storedChain, currentChain.slice(0, storedChain.length))
    );
  });

export const createAgentHostedRetrievalRuntimeResourceLifecycleStageRequest = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
    'format' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceLifecycleStageRequest => {
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  const value = Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentHostedRetrievalRuntimeResourceLifecycleStageRequest(value)) {
    throw new TypeError('Hosted lifecycle stage request is invalid.');
  }
  return value;
};
export const isAgentHostedRetrievalRuntimeResourceLifecycleStageRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleStageRequest =>
  hasExactAgentControlKeys(value, stageRequestKeys) &&
  value.format ===
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_REQUEST_FORMAT &&
  value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
  value.purpose ===
    'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch' &&
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(
    value.dispatchIntent
  ) &&
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
    value.dispatchStageClaimRequest
  ) &&
  value.dispatchStageClaimRequest.dispatchIntentDigest ===
    value.dispatchIntent.intentDigest &&
  selfDigest(value, 'requestDigest') &&
  safe(
    value,
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
  );

export const createAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt = (
  request: AgentHostedRetrievalRuntimeResourceLifecycleStageRequest,
  claim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
): AgentHostedRetrievalRuntimeResourceLifecycleStageReceipt => {
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    requestDigest: request.requestDigest,
    dispatchIntentDigest: request.dispatchIntent.intentDigest,
    dispatchStageClaimReceipt: claim,
    dispatchStageClaimReceiptDigest: claim.receiptDigest,
  });
  const value = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !isAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt(value) ||
    claim.claimRequestDigest !== request.dispatchStageClaimRequest.requestDigest
  ) {
    throw new TypeError('Hosted lifecycle stage receipt is invalid.');
  }
  return value;
};
export const isAgentHostedRetrievalRuntimeResourceLifecycleStageReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleStageReceipt =>
  hasExactAgentControlKeys(value, stageReceiptKeys) &&
  value.format ===
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_STAGE_RECEIPT_FORMAT &&
  value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
  isAgentCanonicalDigest(value.requestDigest) &&
  isAgentCanonicalDigest(value.dispatchIntentDigest) &&
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
    value.dispatchStageClaimReceipt
  ) &&
  value.dispatchIntentDigest ===
    value.dispatchStageClaimReceipt.dispatchIntentDigest &&
  value.dispatchStageClaimReceiptDigest ===
    value.dispatchStageClaimReceipt.receiptDigest &&
  selfDigest(value, 'receiptDigest') &&
  safe(
    value,
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
  );

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport store request is invalid.'
      );
    }
    return value;
  };
export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest => {
    if (!hasExactAgentControlKeys(value, transportRequestKeys)) return false;
    const request =
      value as AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest;
    if (
      request.format !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_REQUEST_FORMAT ||
      request.version !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION ||
      request.purpose !==
        'hosted-retrieval-runtime-resource.lifecycle-journal.transport' ||
      (request.expectedPriorTransportStoreReceiptDigest !== null &&
        !isAgentCanonicalDigest(
          request.expectedPriorTransportStoreReceiptDigest
        )) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        request.dispatchIntentSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        request.dispatchStageClaimReceiptSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        request.dispatchStageClaimHistorySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
        request.transportReceiptSet
      )
    ) {
      return false;
    }
    if (
      request.dispatchStageClaimReceiptSet.dispatchIntentSetDigest !==
        request.dispatchIntentSet.setDigest ||
      request.dispatchStageClaimHistorySet.dispatchIntentSetDigest !==
        request.dispatchIntentSet.setDigest ||
      !sameCanonicalJson(
        request.dispatchStageClaimHistorySet.initialClaimReceiptSet,
        request.dispatchStageClaimReceiptSet
      ) ||
      request.transportReceiptSet.dispatchIntentSetDigest !==
        request.dispatchIntentSet.setDigest ||
      request.transportReceiptSet.dispatchStageClaimReceiptSetDigest !==
        request.dispatchStageClaimReceiptSet.setDigest ||
      request.spoolAad.dispatchIntentSetDigest !==
        request.dispatchIntentSet.setDigest ||
      request.spoolAad.dispatchStageClaimReceiptSetDigest !==
        request.dispatchStageClaimReceiptSet.setDigest ||
      request.spoolAad.dispatchStageClaimHistorySetDigest !==
        request.dispatchStageClaimHistorySet.setDigest ||
      request.spoolAad.transportReceiptSetDigest !==
        request.transportReceiptSet.setDigest ||
      !isAgentEvaluationProviderResultSpoolEnvelope(request.spoolWriteEnvelope)
    ) {
      return false;
    }
    if (
      request.spoolWriteEnvelope.spoolId !==
        request.spoolEnvelopeAuthority.spoolRef ||
      request.spoolWriteEnvelope.algorithm !==
        request.spoolEnvelopeAuthority.algorithm ||
      request.spoolWriteEnvelope.keyId !==
        request.spoolEnvelopeAuthority.keyId ||
      request.spoolWriteEnvelope.keyVersion !==
        request.spoolEnvelopeAuthority.keyVersion ||
      request.spoolWriteEnvelope.keyRefDigest !==
        request.spoolEnvelopeAuthority.keyRefDigest ||
      request.spoolWriteEnvelope.encryptionProfileDigest !==
        request.spoolEnvelopeAuthority.encryptionProfileDigest ||
      request.spoolWriteEnvelope.nonceBase64Url !==
        request.spoolEnvelopeAuthority.nonceBase64Url ||
      request.spoolWriteEnvelope.authenticationTagBase64Url !==
        request.spoolEnvelopeAuthority.authenticationTagBase64Url ||
      request.spoolWriteEnvelope.ciphertextDigest !==
        request.spoolEnvelopeAuthority.ciphertextDigest ||
      request.spoolWriteEnvelope.ciphertextSizeBytes !==
        request.spoolEnvelopeAuthority.ciphertextSizeBytes ||
      request.spoolWriteEnvelope.aadDigest !==
        request.spoolEnvelopeAuthority.aadDigest ||
      request.spoolWriteEnvelope.envelopeDigest !==
        request.spoolEnvelopeAuthority.envelopeDigest ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolReceipt(
        request.spoolReceipt,
        request.spoolAad,
        request.spoolEnvelopeAuthority
      )
    ) {
      return false;
    }
    for (
      let index = 0;
      index < request.dispatchIntentSet.intents.length;
      index += 1
    ) {
      const intent = request.dispatchIntentSet.intents[index]!;
      const initialClaim =
        request.dispatchStageClaimReceiptSet.receipts[index]!;
      const receipt = request.transportReceiptSet.receipts[index]!;
      const claimChain = request.dispatchStageClaimHistorySet.receipts.filter(
        ({ dispatchIntentDigest }) =>
          dispatchIntentDigest === intent.intentDigest
      );
      const currentClaim = claimChain.at(-1)!;
      const sentinelId = receipt.receiptId.startsWith(
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CONSERVATIVE_RECOVERY_RECEIPT_ID_PREFIX
      );
      const sentinelMatches =
        matchAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt(
          intent,
          initialClaim,
          currentClaim,
          receipt
        );
      if (
        sentinelId !== sentinelMatches ||
        (currentClaim !== initialClaim &&
          currentClaim.priorTransportReceiptDigest === null &&
          !sentinelMatches)
      ) {
        return false;
      }
    }
    return (
      selfDigest(request, 'requestDigest') &&
      safe(
        request,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
      | 'dispatchIntentSetDigest'
      | 'dispatchStageClaimReceiptSetDigest'
      | 'dispatchStageClaimHistorySetDigest'
      | 'format'
      | 'expectedPriorTransportStoreReceiptDigest'
      | 'operation'
      | 'receiptDigest'
      | 'registrationRequestDigest'
      | 'requestDigest'
      | 'spoolAadDigest'
      | 'spoolEnvelopeDigest'
      | 'spoolReceiptDigest'
      | 'transportReceiptSetDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      requestDigest: request.requestDigest,
      operation: request.dispatchIntentSet.operation,
      registrationRequestDigest:
        request.dispatchIntentSet.registrationRequestDigest,
      expectedPriorTransportStoreReceiptDigest:
        request.expectedPriorTransportStoreReceiptDigest,
      ...input,
      dispatchIntentSetDigest: request.dispatchIntentSet.setDigest,
      dispatchStageClaimReceiptSetDigest:
        request.dispatchStageClaimReceiptSet.setDigest,
      dispatchStageClaimHistorySetDigest:
        request.dispatchStageClaimHistorySet.setDigest,
      transportReceiptSetDigest: request.transportReceiptSet.setDigest,
      spoolAadDigest: request.spoolReceipt.aadDigest,
      spoolEnvelopeDigest: request.spoolEnvelopeAuthority.envelopeDigest,
      spoolReceiptDigest: request.spoolReceipt.receiptDigest,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport store receipt is invalid.'
      );
    }
    return value;
  };
export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt =>
    hasExactAgentControlKeys(value, transportReceiptKeys) &&
    value.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_FORMAT &&
    value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    isAgentCanonicalDigest(value.requestDigest) &&
    (value.operation === 'create' || value.operation === 'delete') &&
    isAgentCanonicalDigest(value.registrationRequestDigest) &&
    (value.expectedPriorTransportStoreReceiptDigest === null ||
      isAgentCanonicalDigest(value.expectedPriorTransportStoreReceiptDigest)) &&
    isAgentControlIdentity(value.transportAuthorityIssuerId) &&
    isAgentCanonicalDigest(value.transportAuthorityImplementationDigest) &&
    Number.isSafeInteger(value.transportLedgerRevision) &&
    (value.transportLedgerRevision as number) >= 1 &&
    [
      value.dispatchIntentSetDigest,
      value.dispatchStageClaimReceiptSetDigest,
      value.dispatchStageClaimHistorySetDigest,
      value.transportReceiptSetDigest,
      value.spoolAadDigest,
      value.spoolEnvelopeDigest,
      value.spoolReceiptDigest,
    ].every(isAgentCanonicalDigest) &&
    (value.supersededSpoolReceiptDigest === null ||
      isAgentCanonicalDigest(value.supersededSpoolReceiptDigest)) &&
    (value.supersededSpoolDestroyedAt === null ||
      isAgentControlInstant(value.supersededSpoolDestroyedAt)) &&
    (value.expectedPriorTransportStoreReceiptDigest === null
      ? value.supersededSpoolReceiptDigest === null &&
        value.supersededSpoolDestroyedAt === null
      : value.supersededSpoolReceiptDigest !== null &&
        value.supersededSpoolDestroyedAt !== null) &&
    isAgentControlInstant(value.storedAt) &&
    (value.supersededSpoolDestroyedAt === null ||
      Date.parse(value.supersededSpoolDestroyedAt as string) <=
        Date.parse(value.storedAt as string)) &&
    selfDigest(value, 'receiptDigest') &&
    safe(
      value,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    );

export const matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
    receipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
      request
    ) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
      receipt
    ) &&
    receipt.requestDigest === request.requestDigest &&
    receipt.operation === request.dispatchIntentSet.operation &&
    receipt.registrationRequestDigest ===
      request.dispatchIntentSet.registrationRequestDigest &&
    receipt.expectedPriorTransportStoreReceiptDigest ===
      request.expectedPriorTransportStoreReceiptDigest &&
    receipt.dispatchIntentSetDigest === request.dispatchIntentSet.setDigest &&
    receipt.dispatchStageClaimReceiptSetDigest ===
      request.dispatchStageClaimReceiptSet.setDigest &&
    receipt.dispatchStageClaimHistorySetDigest ===
      request.dispatchStageClaimHistorySet.setDigest &&
    receipt.transportReceiptSetDigest ===
      request.transportReceiptSet.setDigest &&
    receipt.spoolAadDigest === request.spoolReceipt.aadDigest &&
    receipt.spoolEnvelopeDigest ===
      request.spoolEnvelopeAuthority.envelopeDigest &&
    receipt.spoolReceiptDigest === request.spoolReceipt.receiptDigest &&
    Date.parse(receipt.storedAt) >=
      Date.parse(request.spoolReceipt.createdAt) &&
    Date.parse(receipt.storedAt) < Date.parse(request.spoolReceipt.expiresAt);

export const matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStorePrefixExtension =
  (
    priorRequest: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
    priorReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
    nextRequest: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
    nextReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
  ): boolean =>
    matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
      priorRequest,
      priorReceipt
    ) &&
    matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
      nextRequest,
      nextReceipt
    ) &&
    nextRequest.expectedPriorTransportStoreReceiptDigest ===
      priorReceipt.receiptDigest &&
    priorRequest.dispatchIntentSet.operation ===
      nextRequest.dispatchIntentSet.operation &&
    priorRequest.dispatchIntentSet.registrationRequestDigest ===
      nextRequest.dispatchIntentSet.registrationRequestDigest &&
    priorRequest.dispatchIntentSet.intents.length <=
      nextRequest.dispatchIntentSet.intents.length &&
    sameCanonicalJson(
      priorRequest.dispatchIntentSet.intents,
      nextRequest.dispatchIntentSet.intents.slice(
        0,
        priorRequest.dispatchIntentSet.intents.length
      )
    ) &&
    sameCanonicalJson(
      priorRequest.dispatchStageClaimReceiptSet.receipts,
      nextRequest.dispatchStageClaimReceiptSet.receipts.slice(
        0,
        priorRequest.dispatchStageClaimReceiptSet.receipts.length
      )
    ) &&
    claimHistoryIsCanonicalPrefix(
      priorRequest.dispatchStageClaimHistorySet,
      nextRequest.dispatchStageClaimHistorySet
    ) &&
    sameCanonicalJson(
      priorRequest.transportReceiptSet.receipts,
      nextRequest.transportReceiptSet.receipts.slice(
        0,
        priorRequest.transportReceiptSet.receipts.length
      )
    ) &&
    priorRequest.spoolReceipt.receiptDigest !==
      nextRequest.spoolReceipt.receiptDigest &&
    nextReceipt.supersededSpoolReceiptDigest ===
      priorRequest.spoolReceipt.receiptDigest &&
    nextReceipt.supersededSpoolDestroyedAt !== null &&
    Date.parse(nextReceipt.supersededSpoolDestroyedAt) >=
      Date.parse(priorReceipt.storedAt);

const storeReceiptSuccessorMatches = (
  prior: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
  next: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt
): boolean =>
  next.operation === prior.operation &&
  next.registrationRequestDigest === prior.registrationRequestDigest &&
  next.expectedPriorTransportStoreReceiptDigest === prior.receiptDigest &&
  next.supersededSpoolReceiptDigest === prior.spoolReceiptDigest &&
  next.spoolReceiptDigest !== prior.spoolReceiptDigest &&
  next.supersededSpoolDestroyedAt !== null &&
  Date.parse(next.supersededSpoolDestroyedAt) >= Date.parse(prior.storedAt) &&
  Date.parse(next.supersededSpoolDestroyedAt) <= Date.parse(next.storedAt) &&
  next.transportLedgerRevision === prior.transportLedgerRevision + 1;

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory =
  (
    receiptsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt[]
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory => {
    if (
      receiptsInput.length < 1 ||
      receiptsInput.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_MAXIMUM ||
      receiptsInput.some(
        (receipt) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
            receipt
          )
      ) ||
      receiptsInput[0]!.expectedPriorTransportStoreReceiptDigest !== null ||
      receiptsInput.some(
        (receipt, index) =>
          index > 0 &&
          !storeReceiptSuccessorMatches(receiptsInput[index - 1]!, receipt)
      ) ||
      new Set(receiptsInput.map(({ receiptDigest }) => receiptDigest)).size !==
        receiptsInput.length
    ) {
      throw new TypeError(
        'Hosted lifecycle transport store history is invalid.'
      );
    }
    const receipts = Object.freeze([...receiptsInput]);
    const first = receipts[0]!;
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_RECEIPT_HISTORY_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: first.operation,
      registrationRequestDigest: first.registrationRequestDigest,
      receipts,
      receiptDigests: Object.freeze(
        receipts.map(({ receiptDigest }) => receiptDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      historyDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport store history is unsafe.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory => {
    if (!hasExactAgentControlKeys(value, transportStoreReceiptHistoryKeys)) {
      return false;
    }
    try {
      const history =
        value as AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory;
      return sameCanonicalJson(
        history,
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
          history.receipts
        )
      );
    } catch {
      return false;
    }
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport recovery read is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest =>
    hasExactAgentControlKeys(value, transportRecoveryReadRequestKeys) &&
    value.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_REQUEST_FORMAT &&
    value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    value.purpose ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_PURPOSE &&
    isAgentControlIdentity(value.namespaceId) &&
    isAgentCanonicalDigest(value.dispatchIntentDigest) &&
    isAgentCanonicalDigest(value.dispatchStageClaimReceiptDigest) &&
    isAgentCanonicalDigest(value.expectedPriorTransportReceiptDigest) &&
    isAgentControlIdentity(value.spoolRef) &&
    isAgentControlIdentity(value.lifecycleOwnerInstanceId) &&
    isAgentControlInstant(value.requestedAt) &&
    isAgentControlInstant(value.minimumReceiptExpiresAt) &&
    Date.parse(value.minimumReceiptExpiresAt as string) >
      Date.parse(value.requestedAt as string) &&
    Date.parse(value.minimumReceiptExpiresAt as string) -
      Date.parse(value.requestedAt as string) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
    selfDigest(value, 'requestDigest') &&
    safe(
      value,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    );

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest,
    currentDispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
    transportStoreReceiptHistory: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory,
    storedRequest: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest,
    transportStoreReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt,
    input: Readonly<{
      recoveryAuthorityIssuerId: string;
      recoveryAuthorityImplementationDigest: CanonicalDigest;
      readAt: Instant;
      expiresAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
        request
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        currentDispatchStageClaimHistorySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        transportStoreReceiptHistory
      ) ||
      transportStoreReceiptHistory.receipts.at(-1)?.receiptDigest !==
        transportStoreReceipt.receiptDigest ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
        storedRequest,
        transportStoreReceipt
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport recovery read context is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      request,
      requestDigest: request.requestDigest,
      recoveryAuthorityIssuerId: input.recoveryAuthorityIssuerId,
      recoveryAuthorityImplementationDigest:
        input.recoveryAuthorityImplementationDigest,
      storedDispatchStageClaimHistorySet:
        storedRequest.dispatchStageClaimHistorySet,
      currentDispatchStageClaimHistorySet,
      dispatchIntentSet: storedRequest.dispatchIntentSet,
      dispatchStageClaimReceiptSet: storedRequest.dispatchStageClaimReceiptSet,
      transportReceiptSet: storedRequest.transportReceiptSet,
      spoolAad: storedRequest.spoolAad,
      spoolWriteEnvelope: storedRequest.spoolWriteEnvelope,
      spoolEnvelopeAuthority: storedRequest.spoolEnvelopeAuthority,
      spoolReceipt: storedRequest.spoolReceipt,
      transportStoreReceiptHistory,
      transportStoreReceipt,
      readAt: input.readAt,
      expiresAt: input.expiresAt,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle transport recovery receipt is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt => {
    if (!hasExactAgentControlKeys(value, transportRecoveryReadReceiptKeys)) {
      return false;
    }
    const receipt =
      value as AgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadReceipt;
    if (
      receipt.format !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECOVERY_READ_RECEIPT_FORMAT ||
      receipt.version !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadRequest(
        receipt.request
      ) ||
      receipt.requestDigest !== receipt.request.requestDigest ||
      !isAgentControlIdentity(receipt.recoveryAuthorityIssuerId) ||
      !isAgentCanonicalDigest(receipt.recoveryAuthorityImplementationDigest) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        receipt.storedDispatchStageClaimHistorySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
        receipt.currentDispatchStageClaimHistorySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
        receipt.transportStoreReceiptHistory
      ) ||
      !isAgentControlInstant(receipt.readAt) ||
      !isAgentControlInstant(receipt.expiresAt)
    ) {
      return false;
    }
    const selectedIntent = receipt.dispatchIntentSet.intents.find(
      ({ intentDigest }) =>
        intentDigest === receipt.request.dispatchIntentDigest
    );
    const selectedClaims =
      receipt.currentDispatchStageClaimHistorySet.receipts.filter(
        ({ dispatchIntentDigest }) =>
          dispatchIntentDigest === receipt.request.dispatchIntentDigest
      );
    const selectedClaim = selectedClaims.at(-1);
    const storedRequest = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_STORE_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      purpose:
        'hosted-retrieval-runtime-resource.lifecycle-journal.transport' as const,
      expectedPriorTransportStoreReceiptDigest:
        receipt.transportStoreReceipt.expectedPriorTransportStoreReceiptDigest,
      dispatchIntentSet: receipt.dispatchIntentSet,
      dispatchStageClaimReceiptSet: receipt.dispatchStageClaimReceiptSet,
      dispatchStageClaimHistorySet: receipt.storedDispatchStageClaimHistorySet,
      transportReceiptSet: receipt.transportReceiptSet,
      spoolAad: receipt.spoolAad,
      spoolWriteEnvelope: receipt.spoolWriteEnvelope,
      spoolEnvelopeAuthority: receipt.spoolEnvelopeAuthority,
      spoolReceipt: receipt.spoolReceipt,
    });
    const canonicalStoredRequest = Object.freeze({
      ...storedRequest,
      requestDigest: digestAgentCanonicalValue(storedRequest),
    });
    const readAtMs = Date.parse(receipt.readAt);
    const expiresAtMs = Date.parse(receipt.expiresAt);
    return (
      selectedIntent !== undefined &&
      receipt.transportStoreReceiptHistory.operation ===
        receipt.dispatchIntentSet.operation &&
      receipt.transportStoreReceiptHistory.registrationRequestDigest ===
        receipt.dispatchIntentSet.registrationRequestDigest &&
      sameCanonicalJson(
        receipt.transportStoreReceiptHistory.receipts.at(-1),
        receipt.transportStoreReceipt
      ) &&
      selectedIntent.namespaceId === receipt.request.namespaceId &&
      selectedClaim !== undefined &&
      selectedClaim.receiptDigest ===
        receipt.request.dispatchStageClaimReceiptDigest &&
      selectedClaim.lifecycleOwnerInstanceId ===
        receipt.request.lifecycleOwnerInstanceId &&
      selectedClaim.deliveryDisposition === 'reconcile-only-replay' &&
      selectedClaim.priorTransportReceiptDigest ===
        receipt.request.expectedPriorTransportReceiptDigest &&
      receipt.transportReceiptSet.receipts.some(
        ({ receiptDigest }) =>
          receiptDigest === receipt.request.expectedPriorTransportReceiptDigest
      ) &&
      receipt.spoolReceipt.spoolRef === receipt.request.spoolRef &&
      receipt.storedDispatchStageClaimHistorySet.dispatchIntentSetDigest ===
        receipt.dispatchIntentSet.setDigest &&
      receipt.currentDispatchStageClaimHistorySet.dispatchIntentSetDigest ===
        receipt.dispatchIntentSet.setDigest &&
      sameCanonicalJson(
        receipt.storedDispatchStageClaimHistorySet.initialClaimReceiptSet,
        receipt.dispatchStageClaimReceiptSet
      ) &&
      sameCanonicalJson(
        receipt.currentDispatchStageClaimHistorySet.initialClaimReceiptSet,
        receipt.dispatchStageClaimReceiptSet
      ) &&
      claimHistoryIsCanonicalPrefix(
        receipt.storedDispatchStageClaimHistorySet,
        receipt.currentDispatchStageClaimHistorySet
      ) &&
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(
        canonicalStoredRequest
      ) &&
      matchAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceipt(
        canonicalStoredRequest,
        receipt.transportStoreReceipt
      ) &&
      readAtMs >= Date.parse(receipt.request.requestedAt) &&
      readAtMs >= Date.parse(receipt.transportStoreReceipt.storedAt) &&
      readAtMs >= Date.parse(selectedClaim.claimedAt) &&
      readAtMs < Date.parse(selectedClaim.claimExpiresAt) &&
      readAtMs < Date.parse(receipt.spoolReceipt.expiresAt) &&
      expiresAtMs >= Date.parse(receipt.request.minimumReceiptExpiresAt) &&
      expiresAtMs > readAtMs &&
      expiresAtMs - readAtMs <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
      expiresAtMs <= Date.parse(selectedClaim.claimExpiresAt) &&
      expiresAtMs <= Date.parse(receipt.spoolReceipt.expiresAt) &&
      selfDigest(receipt, 'receiptDigest') &&
      safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle unfinished dispatch read is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest =>
    hasExactAgentControlKeys(value, unfinishedDispatchReadRequestKeys) &&
    value.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_REQUEST_FORMAT &&
    value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    value.purpose ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_READ_PURPOSE &&
    isAgentControlIdentity(value.namespaceId) &&
    repositoryCommitPattern.test(value.repositoryCommit as string) &&
    [
      value.planDigest,
      value.frozenRunDigest,
      value.runConfigArtifactBindingDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlIdentity(value.runtimeResourceSetId) &&
    isAgentControlIdentity(value.lifecycleOwnerInstanceId) &&
    Number.isSafeInteger(value.pageSize) &&
    (value.pageSize as number) >= 1 &&
    (value.pageSize as number) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_MAXIMUM &&
    (value.cursor === null || isAgentControlIdentity(value.cursor)) &&
    isAgentControlInstant(value.requestedAt) &&
    isAgentControlInstant(value.minimumSnapshotExpiresAt) &&
    Date.parse(value.minimumSnapshotExpiresAt as string) >
      Date.parse(value.requestedAt as string) &&
    Date.parse(value.minimumSnapshotExpiresAt as string) -
      Date.parse(value.requestedAt as string) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
    selfDigest(value, 'requestDigest') &&
    safe(
      value,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    );

export const createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate =
  (
    registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest,
    dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
    input: Readonly<{
      unfinishedState:
        'staged-before-transport' | 'transport-stored-before-seal';
      durableTransportReceiptSetDigest: CanonicalDigest | null;
      spoolRef: string | null;
      transportStoreReceiptDigest: CanonicalDigest | null;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_CANDIDATE_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      registrationRequest,
      registrationRequestDigest: registrationRequest.requestDigest,
      dispatchIntentSet,
      dispatchIntentSetDigest: dispatchIntentSet.setDigest,
      dispatchStageClaimHistorySet,
      dispatchStageClaimHistorySetDigest:
        dispatchStageClaimHistorySet.setDigest,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      candidateDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
        value
      )
    ) {
      throw new TypeError('Hosted lifecycle unfinished candidate is invalid.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate => {
    if (!hasExactAgentControlKeys(value, unfinishedDispatchCandidateKeys)) {
      return false;
    }
    const candidate =
      value as AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate;
    const latestClaims = candidate.dispatchIntentSet.intents.map((intent) =>
      candidate.dispatchStageClaimHistorySet.receipts
        .filter(
          ({ dispatchIntentDigest }) =>
            dispatchIntentDigest === intent.intentDigest
        )
        .at(-1)
    );
    const staged = candidate.unfinishedState === 'staged-before-transport';
    return (
      candidate.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_CANDIDATE_FORMAT &&
      candidate.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentHostedRetrievalRuntimeResourceRegistrationRequest(
        candidate.registrationRequest
      ) &&
      candidate.registrationRequestDigest ===
        candidate.registrationRequest.requestDigest &&
      isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        candidate.dispatchIntentSet
      ) &&
      candidate.dispatchIntentSet.registrationRequestDigest ===
        candidate.registrationRequest.requestDigest &&
      candidate.dispatchIntentSet.intents.every(
        (intent) =>
          intent.namespaceId === candidate.registrationRequest.namespaceId &&
          intent.repositoryCommit ===
            candidate.registrationRequest.repositoryCommit &&
          intent.planDigest === candidate.registrationRequest.planDigest &&
          intent.frozenRunDigest ===
            candidate.registrationRequest.frozenRunDigest &&
          intent.runConfigArtifactBindingDigest ===
            candidate.registrationRequest.runConfigArtifactBindingDigest &&
          intent.runtimeResourceSetId ===
            candidate.registrationRequest.runtimeResourceSetId &&
          intent.registrationIntentDigest ===
            candidate.registrationRequest.registrationIntentDigest &&
          intent.protocolFamily ===
            candidate.registrationRequest.protocolFamily &&
          intent.capabilityProfileId ===
            candidate.registrationRequest.capabilityProfileId &&
          intent.providerConfigurationId ===
            candidate.registrationRequest.providerConfigurationId &&
          intent.providerConfigurationDigest ===
            candidate.registrationRequest.providerConfigurationDigest &&
          intent.budgetReservationId ===
            candidate.registrationRequest.budgetReservationAuthority
              .reservationId &&
          intent.budgetReservationAuthorityDigest ===
            candidate.registrationRequest.budgetReservationAuthorityDigest
      ) &&
      candidate.dispatchIntentSetDigest ===
        candidate.dispatchIntentSet.setDigest &&
      matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory(
        candidate.dispatchIntentSet,
        candidate.dispatchStageClaimHistorySet.initialClaimReceiptSet,
        candidate.dispatchStageClaimHistorySet
      ) &&
      candidate.dispatchStageClaimHistorySetDigest ===
        candidate.dispatchStageClaimHistorySet.setDigest &&
      latestClaims.every(
        (claim) =>
          claim !== undefined &&
          claim.deliveryDisposition !== 'sealed-read-only'
      ) &&
      (staged
        ? candidate.durableTransportReceiptSetDigest === null &&
          candidate.spoolRef === null &&
          candidate.transportStoreReceiptDigest === null
        : isAgentCanonicalDigest(candidate.durableTransportReceiptSetDigest) &&
          isAgentControlIdentity(candidate.spoolRef) &&
          isAgentCanonicalDigest(candidate.transportStoreReceiptDigest)) &&
      selfDigest(candidate, 'candidateDigest') &&
      safe(
        candidate,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage,
      | 'candidateDigests'
      | 'format'
      | 'pageDigest'
      | 'request'
      | 'requestDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage => {
    const candidates = Object.freeze(
      [...input.candidates].sort((left, right) =>
        compareUnicodeCodePoints(
          left.dispatchIntentSetDigest,
          right.dispatchIntentSetDigest
        )
      )
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      request,
      requestDigest: request.requestDigest,
      ...input,
      candidates,
      candidateDigests: Object.freeze(
        candidates.map(({ candidateDigest }) => candidateDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      pageDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle unfinished dispatch page is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage => {
    if (!hasExactAgentControlKeys(value, unfinishedDispatchPageKeys))
      return false;
    const page =
      value as AgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage;
    const request = page.request;
    const { pageDigest, ...base } = page;
    const snapshotAtMs = Date.parse(page.snapshotAt);
    const expiresAtMs = Date.parse(page.expiresAt);
    return (
      page.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_UNFINISHED_DISPATCH_PAGE_FORMAT &&
      page.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
        request
      ) &&
      page.requestDigest === request.requestDigest &&
      isAgentControlIdentity(page.recoveryAuthorityIssuerId) &&
      isAgentCanonicalDigest(page.recoveryAuthorityImplementationDigest) &&
      isAgentControlIdentity(page.snapshotId) &&
      Number.isSafeInteger(page.snapshotRevision) &&
      page.snapshotRevision >= 1 &&
      isAgentControlInstant(page.snapshotAt) &&
      isAgentControlInstant(page.expiresAt) &&
      snapshotAtMs >= Date.parse(request.requestedAt) &&
      expiresAtMs >= Date.parse(request.minimumSnapshotExpiresAt) &&
      expiresAtMs > snapshotAtMs &&
      expiresAtMs - snapshotAtMs <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
      page.candidates.length <= request.pageSize &&
      page.candidates.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate
      ) &&
      page.candidates.every((candidate) => {
        const firstIntent = candidate.dispatchIntentSet.intents[0];
        return (
          firstIntent !== undefined &&
          firstIntent.namespaceId === request.namespaceId &&
          firstIntent.repositoryCommit === request.repositoryCommit &&
          firstIntent.planDigest === request.planDigest &&
          firstIntent.frozenRunDigest === request.frozenRunDigest &&
          firstIntent.runConfigArtifactBindingDigest ===
            request.runConfigArtifactBindingDigest &&
          firstIntent.runtimeResourceSetId === request.runtimeResourceSetId
        );
      }) &&
      sameCanonicalJson(
        page.candidates,
        [...page.candidates].sort((left, right) =>
          compareUnicodeCodePoints(
            left.dispatchIntentSetDigest,
            right.dispatchIntentSetDigest
          )
        )
      ) &&
      new Set(
        page.candidates.map(
          ({ dispatchIntentSetDigest }) => dispatchIntentSetDigest
        )
      ).size === page.candidates.length &&
      sameCanonicalJson(
        page.candidateDigests,
        page.candidates.map(({ candidateDigest }) => candidateDigest)
      ) &&
      (page.nextCursor === null || isAgentControlIdentity(page.nextCursor)) &&
      pageDigest === digestAgentCanonicalValue(base) &&
      safe(
        page,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(value)
    ) {
      throw new TypeError('Hosted lifecycle archive read request is invalid.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest =>
    hasExactAgentControlKeys(value, archiveReadRequestKeys) &&
    value.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_REQUEST_FORMAT &&
    value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    value.purpose ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PURPOSE &&
    isAgentControlIdentity(value.namespaceId) &&
    repositoryCommitPattern.test(value.repositoryCommit as string) &&
    [
      value.planDigest,
      value.frozenRunDigest,
      value.runConfigArtifactBindingDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlIdentity(value.runtimeResourceSetId) &&
    isAgentControlIdentity(value.lifecycleOwnerInstanceId) &&
    Number.isSafeInteger(value.pageSize) &&
    (value.pageSize as number) >= 1 &&
    (value.pageSize as number) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_MAXIMUM &&
    (value.cursor === null || isAgentControlIdentity(value.cursor)) &&
    isAgentControlInstant(value.requestedAt) &&
    isAgentControlInstant(value.minimumSnapshotExpiresAt) &&
    Date.parse(value.minimumSnapshotExpiresAt as string) >
      Date.parse(value.requestedAt as string) &&
    Date.parse(value.minimumSnapshotExpiresAt as string) -
      Date.parse(value.requestedAt as string) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
    selfDigest(value, 'requestDigest') &&
    safe(
      value,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    );

export const createAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest,
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage,
      | 'archiveRecordDigests'
      | 'format'
      | 'pageDigest'
      | 'request'
      | 'requestDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage => {
    const archiveRecords = Object.freeze(
      [...input.archiveRecords].sort((left, right) =>
        compareUnicodeCodePoints(
          left.archiveRecordDigest,
          right.archiveRecordDigest
        )
      )
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      request,
      requestDigest: request.requestDigest,
      ...input,
      archiveRecords,
      archiveRecordDigests: Object.freeze(
        archiveRecords.map(({ archiveRecordDigest }) => archiveRecordDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      pageDigest: digestAgentCanonicalValue(base),
    });
    if (!isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage(value)) {
      throw new TypeError('Hosted lifecycle archive read page is invalid.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage => {
  if (!hasExactAgentControlKeys(value, archiveReadPageKeys)) return false;
  const page =
    value as AgentHostedRetrievalRuntimeResourceLifecycleArchiveReadPage;
  const { pageDigest, ...base } = page;
  const snapshotAtMs = Date.parse(page.snapshotAt);
  const expiresAtMs = Date.parse(page.expiresAt);
  return (
    page.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_ARCHIVE_READ_PAGE_FORMAT &&
    page.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    isAgentHostedRetrievalRuntimeResourceLifecycleArchiveReadRequest(
      page.request
    ) &&
    page.requestDigest === page.request.requestDigest &&
    isAgentControlIdentity(page.recoveryAuthorityIssuerId) &&
    isAgentCanonicalDigest(page.recoveryAuthorityImplementationDigest) &&
    isAgentControlIdentity(page.snapshotId) &&
    Number.isSafeInteger(page.snapshotRevision) &&
    page.snapshotRevision >= 1 &&
    isAgentControlInstant(page.snapshotAt) &&
    isAgentControlInstant(page.expiresAt) &&
    snapshotAtMs >= Date.parse(page.request.requestedAt) &&
    expiresAtMs >= Date.parse(page.request.minimumSnapshotExpiresAt) &&
    expiresAtMs > snapshotAtMs &&
    expiresAtMs - snapshotAtMs <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
    page.archiveRecords.length <= page.request.pageSize &&
    page.archiveRecords.every(
      isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
    ) &&
    page.archiveRecords.every((record) => {
      const intent = record.journalRecord.dispatchIntentSet.intents[0];
      return (
        intent !== undefined &&
        intent.namespaceId === page.request.namespaceId &&
        intent.repositoryCommit === page.request.repositoryCommit &&
        intent.planDigest === page.request.planDigest &&
        intent.frozenRunDigest === page.request.frozenRunDigest &&
        intent.runConfigArtifactBindingDigest ===
          page.request.runConfigArtifactBindingDigest &&
        intent.runtimeResourceSetId === page.request.runtimeResourceSetId
      );
    }) &&
    sameCanonicalJson(
      page.archiveRecords,
      [...page.archiveRecords].sort((left, right) =>
        compareUnicodeCodePoints(
          left.archiveRecordDigest,
          right.archiveRecordDigest
        )
      )
    ) &&
    new Set(page.archiveRecordDigests).size ===
      page.archiveRecordDigests.length &&
    sameCanonicalJson(
      page.archiveRecordDigests,
      page.archiveRecords.map(({ archiveRecordDigest }) => archiveRecordDigest)
    ) &&
    (page.nextCursor === null || isAgentControlIdentity(page.nextCursor)) &&
    isAgentCanonicalDigest(page.rollingJournalSetDigest) &&
    isAgentCanonicalDigest(page.archiveRootDigest) &&
    pageDigest === digestAgentCanonicalValue(base) &&
    safe(
      page,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleSealRequest = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
    'format' | 'requestDigest' | 'version'
  >
): AgentHostedRetrievalRuntimeResourceLifecycleSealRequest => {
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });
  const value = Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest(value)) {
    throw new TypeError('Hosted lifecycle seal request is invalid.');
  }
  return value;
};
export const isAgentHostedRetrievalRuntimeResourceLifecycleSealRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleSealRequest => {
  if (!hasExactAgentControlKeys(value, sealRequestKeys)) return false;
  const request =
    value as AgentHostedRetrievalRuntimeResourceLifecycleSealRequest;
  return (
    request.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_REQUEST_FORMAT &&
    request.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    request.purpose ===
      'hosted-retrieval-runtime-resource.lifecycle-journal.seal' &&
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
      request.journalRecord
    ) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportStoreReceiptHistory(
      request.transportStoreReceiptHistory
    ) &&
    request.transportStoreReceiptHistory.operation ===
      request.journalRecord.operation &&
    request.transportStoreReceiptHistory.registrationRequestDigest ===
      request.journalRecord.registrationRequestDigest &&
    request.transportStoreReceiptHistory.receipts.at(-1)
      ?.dispatchIntentSetDigest ===
      request.journalRecord.dispatchIntentSetDigest &&
    request.transportStoreReceiptHistory.receipts.at(-1)
      ?.dispatchStageClaimReceiptSetDigest ===
      request.journalRecord.dispatchStageClaimReceiptSetDigest &&
    request.transportStoreReceiptHistory.receipts.at(-1)
      ?.dispatchStageClaimHistorySetDigest ===
      request.journalRecord.dispatchStageClaimHistorySetDigest &&
    request.transportStoreReceiptHistory.receipts.at(-1)
      ?.transportReceiptSetDigest ===
      request.journalRecord.transportReceiptSetDigest &&
    request.transportStoreReceiptHistory.receipts.at(-1)?.spoolReceiptDigest ===
      request.journalRecord.resultSpoolReceiptDigest &&
    isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
      request.spoolDispositionReceipt
    ) &&
    matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolDisposition(
      request.journalRecord.resultSpoolReceipt,
      request.spoolDispositionReceipt
    ) &&
    request.journalRecord.resultSpoolDispositionReceiptDigest ===
      request.spoolDispositionReceipt.receiptDigest &&
    selfDigest(request, 'requestDigest') &&
    safe(
      request,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt = (
  request: AgentHostedRetrievalRuntimeResourceLifecycleSealRequest,
  input: Omit<
    AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt,
    | 'format'
    | 'journalRecordDigest'
    | 'receiptDigest'
    | 'requestDigest'
    | 'transportStoreReceiptHistoryDigest'
    | 'spoolDispositionReceiptDigest'
    | 'version'
  >
): AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt => {
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_RECEIPT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    requestDigest: request.requestDigest,
    ...input,
    journalRecordDigest: request.journalRecord.recordDigest,
    transportStoreReceiptHistoryDigest:
      request.transportStoreReceiptHistory.historyDigest,
    spoolDispositionReceiptDigest:
      request.spoolDispositionReceipt.receiptDigest,
  });
  const value = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt(value)) {
    throw new TypeError('Hosted lifecycle seal receipt is invalid.');
  }
  return value;
};
export const isAgentHostedRetrievalRuntimeResourceLifecycleSealReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleSealReceipt =>
  hasExactAgentControlKeys(value, sealReceiptKeys) &&
  value.format ===
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SEAL_RECEIPT_FORMAT &&
  value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
  isAgentCanonicalDigest(value.requestDigest) &&
  isAgentControlIdentity(value.sealAuthorityIssuerId) &&
  isAgentCanonicalDigest(value.sealAuthorityImplementationDigest) &&
  Number.isSafeInteger(value.sealLedgerRevision) &&
  (value.sealLedgerRevision as number) >= 1 &&
  [
    value.journalRecordDigest,
    value.transportStoreReceiptHistoryDigest,
    value.spoolDispositionReceiptDigest,
    value.archiveRecordDigest,
  ].every(isAgentCanonicalDigest) &&
  isAgentControlInstant(value.sealedAt) &&
  selfDigest(value, 'receiptDigest') &&
  safe(
    value,
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RAW_MAXIMUM_BYTES
  );
