import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  repositoryCommitPattern,
  type AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt,
  type AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  type AgentHostedRetrievalRuntimeResourceProfileId,
  type AgentHostedRetrievalRuntimeResourceProtocolFamily,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import type { AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection } from './agentHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
  matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolDisposition,
  type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt,
} from './agentHostedRetrievalRuntimeResourceLifecycleSpool';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
} from './agentHostedRetrievalRuntimeResourceLifecycleReconciliation';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_HISTORY_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-history-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RESPONSE_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-response-projection' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-receipt-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUSINESS_RESULT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-business-result' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_RECORD_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-record' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-record' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_FAMILY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-transport-journal-archive-family' as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_TRANSPORT_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.transport' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_SEAL_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.seal' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CONSERVATIVE_RECOVERY_RECEIPT_ID_PREFIX =
  'lifecycle-recovery-sentinel.' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS =
  125_000 as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CLAIM_RECEIPTS =
  8 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLAIM_HISTORY_SET_MAXIMUM_BYTES =
  32_768 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_RECORD_WRAPPER_MAXIMUM_BYTES =
  8_192 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_RECORD_MAXIMUM_BYTES =
  139_264 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_RECORD_MAXIMUM_BYTES =
  155_648 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CREATE_MUTATIONS =
  4 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS =
  88 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES =
  13_697_024 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_RECORD_MAXIMUM_BYTES =
  163_840 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_FAMILY_MAXIMUM_BYTES =
  14_417_920 as const;

export type AgentHostedRetrievalRuntimeResourceLifecycleOperation =
  'create' | 'delete';
export type AgentHostedRetrievalRuntimeResourceLifecycleMutationKind =
  | 'create-primary'
  | 'delete-resource'
  | 'upload-content'
  | 'upload-content-finalize'
  | 'upload-content-start';

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    intentId: string;
    lifecycleOwnerAuthorityIssuerId: string;
    lifecycleOwnerImplementationDigest: CanonicalDigest;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    registrationIntentDigest: CanonicalDigest;
    registrationRequestDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest | null;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
    providerConfigurationId: string;
    providerConfigurationDigest: CanonicalDigest;
    budgetReservationId: string;
    budgetReservationAuthorityDigest: CanonicalDigest;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleMutationKind;
    mutationSequence: number;
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    endpointId: string;
    endpointClass: 'provider-hosted-retrieval-resource';
    method: 'DELETE' | 'POST';
    requestProjectionDigest: CanonicalDigest;
    requestBodyDigest: CanonicalDigest;
    requestBytes: number;
    providerIdempotencyKeyBinding: 'dispatch-intent-digest';
    createdAt: Instant;
    intentDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_SET_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    registrationRequestDigest: CanonicalDigest;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    intents: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent[];
    intentDigests: readonly CanonicalDigest[];
    setDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE;
    dispatchIntentDigest: CanonicalDigest;
    lifecycleOwnerInstanceId: string;
    expectedDispatchLedgerRevision: number;
    expectedDispatchGeneration: number;
    expectedPriorStageClaimReceiptDigest: CanonicalDigest | null;
    expectedPriorClaimExpiresAt: Instant | null;
    requestedAt: Instant;
    minimumClaimExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    claimRequest: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest;
    claimRequestDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    dispatchAuthorityIssuerId: string;
    dispatchAuthorityImplementationDigest: CanonicalDigest;
    dispatchLedgerRevision: number;
    lifecycleOwnerInstanceId: string;
    dispatchGeneration: number;
    generationTransition:
      | 'expired-owner-takeover'
      | 'generation-retained'
      | 'initial-first-delivery';
    deliveryDisposition:
      | 'dispatch-authorized-first-delivery'
      | 'reconcile-only-replay'
      | 'sealed-read-only';
    claimedAt: Instant;
    claimExpiresAt: Instant;
    priorTransportReceiptDigest: CanonicalDigest | null;
    sealedJournalRecordDigest: CanonicalDigest | null;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_SET_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    registrationRequestDigest: CanonicalDigest;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    dispatchIntentSetDigest: CanonicalDigest;
    receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[];
    receiptDigests: readonly CanonicalDigest[];
    setDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_HISTORY_SET_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    registrationRequestDigest: CanonicalDigest;
    dispatchIntentSetDigest: CanonicalDigest;
    initialClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
    initialClaimReceiptSetDigest: CanonicalDigest;
    receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[];
    receiptDigests: readonly CanonicalDigest[];
    setDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    receiptId: string;
    lifecycleOwnerAuthorityIssuerId: string;
    lifecycleOwnerImplementationDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    providerConfigurationId: string;
    endpointId: string;
    endpointClass: 'provider-hosted-retrieval-resource';
    method: 'DELETE' | 'POST';
    requestProjectionDigest: CanonicalDigest;
    requestBodyDigest: CanonicalDigest;
    requestBytes: number;
    responseProjection: AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection | null;
    responseProjectionDigest: CanonicalDigest | null;
    responseBodyDigest: CanonicalDigest | null;
    responseBytes: number;
    httpStatus: number | null;
    providerRequestId: string | null;
    dispatchState: 'dispatched' | 'not-dispatched';
    outcome: 'completed' | 'failed' | 'post-dispatch-unknown';
    errorCategory:
      | 'aborted'
      | 'provider-rejected'
      | 'response-invalid'
      | 'transport-failed'
      | null;
    startedAt: Instant;
    completedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RESPONSE_PROJECTION_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleMutationKind;
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    outcome:
      | 'accepted'
      | 'already-absent'
      | 'created'
      | 'deleted'
      | 'unknown'
      | 'uploaded';
    resourceManifestDigest: CanonicalDigest | null;
    httpStatus: number | null;
    projectionDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_SET_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    registrationRequestDigest: CanonicalDigest;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    dispatchIntentSetDigest: CanonicalDigest;
    dispatchStageClaimReceiptSetDigest: CanonicalDigest;
    receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt[];
    receiptDigests: readonly CanonicalDigest[];
    setDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUSINESS_RESULT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    providerResourceId: string | null;
    auxiliaryResourceIds: readonly string[];
    resourceManifestDigest: CanonicalDigest | null;
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    reconciliationObservationReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet | null;
    reconciliationObservationReceiptSetDigest: CanonicalDigest | null;
    outcome:
      | 'abandoned-before-provider-effect'
      | 'already-absent'
      | 'created-and-uploaded'
      | 'deleted'
      | 'partial-create-requires-cleanup'
      | 'provider-outcome-unresolved';
    completedAt: Instant;
    resultDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_RECORD_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: AgentHostedRetrievalRuntimeResourceLifecycleOperation;
    registrationRequestDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest | null;
    lifecycleClaimReceiptDigest: CanonicalDigest | null;
    dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
    dispatchIntentSetDigest: CanonicalDigest;
    dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
    dispatchStageClaimReceiptSetDigest: CanonicalDigest;
    dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    dispatchStageClaimHistorySetDigest: CanonicalDigest;
    transportReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet;
    transportReceiptSetDigest: CanonicalDigest;
    businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
    businessResultDigest: CanonicalDigest;
    resultSpoolReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt;
    resultSpoolReceiptDigest: CanonicalDigest;
    resultSpoolDispositionReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt;
    resultSpoolDispositionReceiptDigest: CanonicalDigest;
    recordDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_FAMILY_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    closureStatus: 'audit-incomplete' | 'zeroed';
    records: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
    recordDigests: readonly CanonicalDigest[];
    creationRecordSetDigest: CanonicalDigest;
    cleanupRecordSetDigest: CanonicalDigest;
    familyDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    journalRecord: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord;
    journalRecordDigest: CanonicalDigest;
    budgetClosureProjection: AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection | null;
    budgetClosureProjectionDigest: CanonicalDigest;
    archiveRecordDigest: CanonicalDigest;
  }>;

const safe = (value: unknown, maximumBytes: number): boolean =>
  inspectAgentControlJson(value, maximumBytes).length === 0 &&
  !containsAgentControlCredentialLikeText(canonicalJsonText(value));
const exact = (value: unknown, keys: readonly string[]): boolean =>
  hasExactAgentControlKeys(value, keys);
const sortedDigests = (values: readonly CanonicalDigest[]) =>
  Object.freeze([...values].sort(compareUnicodeCodePoints));
const canonicalIds = (values: readonly string[]) =>
  Object.freeze([...values].sort(compareUnicodeCodePoints));
const setRoot = (values: readonly CanonicalDigest[]): CanonicalDigest =>
  digestAgentCanonicalValue(sortedDigests(values));

const dispatchIntentKeys = Object.freeze([
  'format',
  'version',
  'intentId',
  'lifecycleOwnerAuthorityIssuerId',
  'lifecycleOwnerImplementationDigest',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'registrationIntentDigest',
  'registrationRequestDigest',
  'authorityDigest',
  'lifecycleClaimReceiptDigest',
  'protocolFamily',
  'capabilityProfileId',
  'providerConfigurationId',
  'providerConfigurationDigest',
  'budgetReservationId',
  'budgetReservationAuthorityDigest',
  'operation',
  'mutationKind',
  'mutationSequence',
  'resourceId',
  'resourceRole',
  'endpointId',
  'endpointClass',
  'method',
  'requestProjectionDigest',
  'requestBodyDigest',
  'requestBytes',
  'providerIdempotencyKeyBinding',
  'createdAt',
  'intentDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
      'format' | 'intentDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent => {
    if (
      !exact(input, dispatchIntentKeys.slice(2, -1)) ||
      ![
        input.intentId,
        input.lifecycleOwnerAuthorityIssuerId,
        input.namespaceId,
        input.runtimeResourceSetId,
        input.providerConfigurationId,
        input.budgetReservationId,
        input.endpointId,
      ].every(isAgentControlIdentity) ||
      !repositoryCommitPattern.test(input.repositoryCommit) ||
      ![
        input.lifecycleOwnerImplementationDigest,
        input.planDigest,
        input.frozenRunDigest,
        input.runConfigArtifactBindingDigest,
        input.registrationIntentDigest,
        input.registrationRequestDigest,
        input.providerConfigurationDigest,
        input.budgetReservationAuthorityDigest,
        input.requestProjectionDigest,
        input.requestBodyDigest,
      ].every(isAgentCanonicalDigest) ||
      (input.authorityDigest !== null &&
        !isAgentCanonicalDigest(input.authorityDigest)) ||
      (input.lifecycleClaimReceiptDigest !== null &&
        !isAgentCanonicalDigest(input.lifecycleClaimReceiptDigest)) ||
      !['gemini-interactions', 'openai-responses'].includes(
        input.protocolFamily
      ) ||
      ![
        'g4-provider-hosted-retrieval-core',
        'g4-provider-hosted-retrieval-document',
      ].includes(input.capabilityProfileId) ||
      !['create', 'delete'].includes(input.operation) ||
      ![
        'create-primary',
        'delete-resource',
        'upload-content',
        'upload-content-finalize',
        'upload-content-start',
      ].includes(input.mutationKind) ||
      !Number.isSafeInteger(input.mutationSequence) ||
      input.mutationSequence < 0 ||
      input.mutationSequence >=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CREATE_MUTATIONS ||
      (input.resourceId !== null &&
        !isAgentControlIdentity(input.resourceId)) ||
      ![null, 'auxiliary', 'primary'].includes(input.resourceRole) ||
      input.endpointClass !== 'provider-hosted-retrieval-resource' ||
      !['DELETE', 'POST'].includes(input.method) ||
      !Number.isSafeInteger(input.requestBytes) ||
      input.requestBytes < 0 ||
      input.requestBytes > 16_777_216 ||
      input.providerIdempotencyKeyBinding !== 'dispatch-intent-digest' ||
      !isAgentControlInstant(input.createdAt) ||
      (input.operation === 'create' &&
        (input.authorityDigest !== null ||
          input.lifecycleClaimReceiptDigest !== null ||
          input.method !== 'POST' ||
          input.mutationKind === 'delete-resource')) ||
      (input.operation === 'delete' &&
        ((input.authorityDigest !== null &&
          !isAgentCanonicalDigest(input.authorityDigest)) ||
          !isAgentCanonicalDigest(input.lifecycleClaimReceiptDigest) ||
          input.method !== 'DELETE' ||
          input.mutationKind !== 'delete-resource' ||
          input.mutationSequence !== 0 ||
          input.resourceId === null ||
          input.resourceRole === null))
    ) {
      throw new TypeError('Hosted lifecycle dispatch intent is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      intentDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch intent is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent => {
  if (!exact(value, dispatchIntentKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      intentDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(input)
    );
  } catch {
    return false;
  }
};

const expectedCreateMutationKinds: Readonly<
  Record<
    AgentHostedRetrievalRuntimeResourceProtocolFamily,
    readonly AgentHostedRetrievalRuntimeResourceLifecycleMutationKind[]
  >
> = Object.freeze({
  'gemini-interactions': Object.freeze([
    'create-primary',
    'upload-content-start',
    'upload-content-finalize',
  ] as const),
  'openai-responses': Object.freeze([
    'upload-content',
    'create-primary',
  ] as const),
});

const dispatchIntentSetKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'lifecycleClaimReceiptDigest',
  'intents',
  'intentDigests',
  'setDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet =
  (
    intentsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent[],
    options: Readonly<{ allowPartialCreate?: boolean }> = {}
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet => {
    if (
      intentsInput.length < 1 ||
      intentsInput.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CREATE_MUTATIONS ||
      intentsInput.some(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(value)
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch intent set is invalid.');
    }
    const intents = Object.freeze(
      [...intentsInput].sort(
        (left, right) => left.mutationSequence - right.mutationSequence
      )
    );
    const first = intents[0]!;
    if (
      intents.some(
        (value, index) =>
          value.operation !== first.operation ||
          value.registrationRequestDigest !== first.registrationRequestDigest ||
          value.lifecycleClaimReceiptDigest !==
            first.lifecycleClaimReceiptDigest ||
          value.protocolFamily !== first.protocolFamily ||
          value.lifecycleOwnerAuthorityIssuerId !==
            first.lifecycleOwnerAuthorityIssuerId ||
          value.lifecycleOwnerImplementationDigest !==
            first.lifecycleOwnerImplementationDigest ||
          value.namespaceId !== first.namespaceId ||
          value.repositoryCommit !== first.repositoryCommit ||
          value.planDigest !== first.planDigest ||
          value.frozenRunDigest !== first.frozenRunDigest ||
          value.runConfigArtifactBindingDigest !==
            first.runConfigArtifactBindingDigest ||
          value.runtimeResourceSetId !== first.runtimeResourceSetId ||
          value.registrationIntentDigest !== first.registrationIntentDigest ||
          value.authorityDigest !== first.authorityDigest ||
          value.capabilityProfileId !== first.capabilityProfileId ||
          value.providerConfigurationId !== first.providerConfigurationId ||
          value.providerConfigurationDigest !==
            first.providerConfigurationDigest ||
          value.budgetReservationId !== first.budgetReservationId ||
          value.budgetReservationAuthorityDigest !==
            first.budgetReservationAuthorityDigest ||
          value.mutationSequence !== index
      ) ||
      new Set(intents.map(({ intentId }) => intentId)).size !==
        intents.length ||
      new Set(intents.map(({ intentDigest }) => intentDigest)).size !==
        intents.length
    ) {
      throw new TypeError('Hosted lifecycle dispatch intent set drifted.');
    }
    const expected =
      first.operation === 'delete'
        ? Object.freeze(['delete-resource'] as const)
        : expectedCreateMutationKinds[first.protocolFamily];
    const actual = intents.map(({ mutationKind }) => mutationKind);
    const sequenceMatches =
      options.allowPartialCreate === true && first.operation === 'create'
        ? actual.every((value, index) => value === expected[index])
        : sameCanonicalJson(actual, expected);
    if (!sequenceMatches) {
      throw new TypeError('Hosted lifecycle mutation sequence is invalid.');
    }
    const intentDigests = Object.freeze(
      intents.map(({ intentDigest }) => intentDigest)
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_INTENT_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: first.operation,
      registrationRequestDigest: first.registrationRequestDigest,
      lifecycleClaimReceiptDigest: first.lifecycleClaimReceiptDigest,
      intents,
      intentDigests,
    });
    const value = Object.freeze({
      ...base,
      setDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch intent set is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet => {
  if (!exact(value, dispatchIntentSetKeys)) return false;
  try {
    const candidate =
      value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
    return sameCanonicalJson(
      candidate,
      createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        candidate.intents,
        {
          allowPartialCreate:
            candidate.intents.length <
            expectedCreateMutationKinds[candidate.intents[0]!.protocolFamily]
              .length,
        }
      )
    );
  } catch {
    return false;
  }
};

const dispatchClaimRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'dispatchIntentDigest',
  'lifecycleOwnerInstanceId',
  'expectedDispatchLedgerRevision',
  'expectedDispatchGeneration',
  'expectedPriorStageClaimReceiptDigest',
  'expectedPriorClaimExpiresAt',
  'requestedAt',
  'minimumClaimExpiresAt',
  'requestDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest => {
    if (
      !exact(input, dispatchClaimRequestKeys.slice(2, -1)) ||
      input.purpose !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_DISPATCH_CLAIM_PURPOSE ||
      !isAgentCanonicalDigest(input.dispatchIntentDigest) ||
      !isAgentControlIdentity(input.lifecycleOwnerInstanceId) ||
      !Number.isSafeInteger(input.expectedDispatchLedgerRevision) ||
      input.expectedDispatchLedgerRevision < 0 ||
      !Number.isSafeInteger(input.expectedDispatchGeneration) ||
      input.expectedDispatchGeneration < 0 ||
      (input.expectedPriorStageClaimReceiptDigest !== null &&
        !isAgentCanonicalDigest(input.expectedPriorStageClaimReceiptDigest)) ||
      (input.expectedPriorClaimExpiresAt !== null &&
        !isAgentControlInstant(input.expectedPriorClaimExpiresAt)) ||
      (input.expectedDispatchGeneration === 0
        ? input.expectedDispatchLedgerRevision !== 0 ||
          input.expectedPriorStageClaimReceiptDigest !== null ||
          input.expectedPriorClaimExpiresAt !== null
        : input.expectedDispatchLedgerRevision <
            input.expectedDispatchGeneration ||
          input.expectedPriorStageClaimReceiptDigest === null ||
          input.expectedPriorClaimExpiresAt === null) ||
      !isAgentControlInstant(input.requestedAt) ||
      !isAgentControlInstant(input.minimumClaimExpiresAt) ||
      Date.parse(input.minimumClaimExpiresAt) <=
        Date.parse(input.requestedAt) ||
      Date.parse(input.minimumClaimExpiresAt) - Date.parse(input.requestedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError(
        'Hosted lifecycle dispatch claim request is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim request is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest => {
    if (!exact(value, dispatchClaimRequestKeys)) return false;
    try {
      const {
        format: _format,
        version: _version,
        requestDigest: _digest,
        ...input
      } = value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest;
      return sameCanonicalJson(
        value,
        createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
          input
        )
      );
    } catch {
      return false;
    }
  };

const dispatchClaimReceiptKeys = Object.freeze([
  'format',
  'version',
  'claimRequest',
  'claimRequestDigest',
  'dispatchIntentDigest',
  'dispatchAuthorityIssuerId',
  'dispatchAuthorityImplementationDigest',
  'dispatchLedgerRevision',
  'lifecycleOwnerInstanceId',
  'dispatchGeneration',
  'generationTransition',
  'deliveryDisposition',
  'claimedAt',
  'claimExpiresAt',
  'priorTransportReceiptDigest',
  'sealedJournalRecordDigest',
  'receiptDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    claimRequest: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
    input: Readonly<{
      dispatchAuthorityIssuerId: string;
      dispatchAuthorityImplementationDigest: CanonicalDigest;
      dispatchLedgerRevision: number;
      dispatchGeneration: number;
      generationTransition:
        | 'expired-owner-takeover'
        | 'generation-retained'
        | 'initial-first-delivery';
      deliveryDisposition:
        | 'dispatch-authorized-first-delivery'
        | 'reconcile-only-replay'
        | 'sealed-read-only';
      claimedAt: Instant;
      claimExpiresAt: Instant;
      priorTransportReceiptDigest: CanonicalDigest | null;
      sealedJournalRecordDigest: CanonicalDigest | null;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
        claimRequest
      ) ||
      !exact(input, [
        'dispatchAuthorityIssuerId',
        'dispatchAuthorityImplementationDigest',
        'dispatchLedgerRevision',
        'dispatchGeneration',
        'generationTransition',
        'deliveryDisposition',
        'claimedAt',
        'claimExpiresAt',
        'priorTransportReceiptDigest',
        'sealedJournalRecordDigest',
      ]) ||
      claimRequest.dispatchIntentDigest !== intent.intentDigest ||
      !isAgentControlIdentity(input.dispatchAuthorityIssuerId) ||
      !isAgentCanonicalDigest(input.dispatchAuthorityImplementationDigest) ||
      !Number.isSafeInteger(input.dispatchLedgerRevision) ||
      input.dispatchLedgerRevision < 1 ||
      !Number.isSafeInteger(input.dispatchGeneration) ||
      input.dispatchGeneration < 1 ||
      ![
        'expired-owner-takeover',
        'generation-retained',
        'initial-first-delivery',
      ].includes(input.generationTransition) ||
      ![
        'dispatch-authorized-first-delivery',
        'reconcile-only-replay',
        'sealed-read-only',
      ].includes(input.deliveryDisposition) ||
      !isAgentControlInstant(input.claimedAt) ||
      !isAgentControlInstant(input.claimExpiresAt) ||
      Date.parse(input.claimedAt) < Date.parse(claimRequest.requestedAt) ||
      Date.parse(input.claimExpiresAt) <
        Date.parse(claimRequest.minimumClaimExpiresAt) ||
      Date.parse(input.claimExpiresAt) - Date.parse(input.claimedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS ||
      (input.priorTransportReceiptDigest !== null &&
        !isAgentCanonicalDigest(input.priorTransportReceiptDigest)) ||
      (input.sealedJournalRecordDigest !== null &&
        !isAgentCanonicalDigest(input.sealedJournalRecordDigest)) ||
      (input.generationTransition === 'initial-first-delivery'
        ? claimRequest.expectedDispatchGeneration !== 0 ||
          claimRequest.expectedDispatchLedgerRevision !== 0 ||
          input.deliveryDisposition !== 'dispatch-authorized-first-delivery' ||
          input.dispatchGeneration !== 1 ||
          input.dispatchLedgerRevision !== 1 ||
          input.priorTransportReceiptDigest !== null ||
          input.sealedJournalRecordDigest !== null
        : input.generationTransition === 'expired-owner-takeover'
          ? claimRequest.expectedDispatchGeneration < 1 ||
            claimRequest.expectedPriorClaimExpiresAt === null ||
            Date.parse(claimRequest.requestedAt) <
              Date.parse(claimRequest.expectedPriorClaimExpiresAt) ||
            input.deliveryDisposition !== 'reconcile-only-replay' ||
            input.dispatchGeneration !==
              claimRequest.expectedDispatchGeneration + 1 ||
            input.dispatchLedgerRevision !==
              claimRequest.expectedDispatchLedgerRevision + 1 ||
            input.sealedJournalRecordDigest !== null
          : input.dispatchGeneration !==
              claimRequest.expectedDispatchGeneration ||
            input.dispatchLedgerRevision !==
              claimRequest.expectedDispatchLedgerRevision ||
            input.deliveryDisposition ===
              'dispatch-authorized-first-delivery' ||
            (input.deliveryDisposition === 'sealed-read-only'
              ? input.priorTransportReceiptDigest === null ||
                input.sealedJournalRecordDigest === null
              : input.sealedJournalRecordDigest !== null))
    ) {
      throw new TypeError(
        'Hosted lifecycle dispatch claim receipt is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      claimRequest,
      claimRequestDigest: claimRequest.requestDigest,
      dispatchIntentDigest: intent.intentDigest,
      dispatchAuthorityIssuerId: input.dispatchAuthorityIssuerId,
      dispatchAuthorityImplementationDigest:
        input.dispatchAuthorityImplementationDigest,
      dispatchLedgerRevision: input.dispatchLedgerRevision,
      lifecycleOwnerInstanceId: claimRequest.lifecycleOwnerInstanceId,
      dispatchGeneration: input.dispatchGeneration,
      generationTransition: input.generationTransition,
      deliveryDisposition: input.deliveryDisposition,
      claimedAt: input.claimedAt,
      claimExpiresAt: input.claimExpiresAt,
      priorTransportReceiptDigest: input.priorTransportReceiptDigest,
      sealedJournalRecordDigest: input.sealedJournalRecordDigest,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim receipt is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt => {
    if (!exact(value, dispatchClaimReceiptKeys)) return false;
    const candidate =
      value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
    return (
      candidate.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_FORMAT &&
      candidate.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
        candidate.claimRequest
      ) &&
      candidate.claimRequestDigest === candidate.claimRequest.requestDigest &&
      candidate.dispatchIntentDigest ===
        candidate.claimRequest.dispatchIntentDigest &&
      isAgentControlIdentity(candidate.dispatchAuthorityIssuerId) &&
      isAgentCanonicalDigest(candidate.dispatchAuthorityImplementationDigest) &&
      Number.isSafeInteger(candidate.dispatchLedgerRevision) &&
      candidate.dispatchLedgerRevision >= 1 &&
      candidate.lifecycleOwnerInstanceId ===
        candidate.claimRequest.lifecycleOwnerInstanceId &&
      Number.isSafeInteger(candidate.dispatchGeneration) &&
      candidate.dispatchGeneration >= 1 &&
      [
        'expired-owner-takeover',
        'generation-retained',
        'initial-first-delivery',
      ].includes(candidate.generationTransition) &&
      [
        'dispatch-authorized-first-delivery',
        'reconcile-only-replay',
        'sealed-read-only',
      ].includes(candidate.deliveryDisposition) &&
      isAgentControlInstant(candidate.claimedAt) &&
      isAgentControlInstant(candidate.claimExpiresAt) &&
      Date.parse(candidate.claimedAt) >=
        Date.parse(candidate.claimRequest.requestedAt) &&
      Date.parse(candidate.claimExpiresAt) >=
        Date.parse(candidate.claimRequest.minimumClaimExpiresAt) &&
      Date.parse(candidate.claimExpiresAt) - Date.parse(candidate.claimedAt) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_CLAIM_MAXIMUM_LIFETIME_MS &&
      (candidate.priorTransportReceiptDigest === null ||
        isAgentCanonicalDigest(candidate.priorTransportReceiptDigest)) &&
      (candidate.sealedJournalRecordDigest === null ||
        isAgentCanonicalDigest(candidate.sealedJournalRecordDigest)) &&
      (candidate.generationTransition === 'initial-first-delivery'
        ? candidate.claimRequest.expectedDispatchGeneration === 0 &&
          candidate.claimRequest.expectedDispatchLedgerRevision === 0 &&
          candidate.deliveryDisposition ===
            'dispatch-authorized-first-delivery' &&
          candidate.dispatchGeneration === 1 &&
          candidate.dispatchLedgerRevision === 1 &&
          candidate.priorTransportReceiptDigest === null &&
          candidate.sealedJournalRecordDigest === null
        : candidate.generationTransition === 'expired-owner-takeover'
          ? candidate.claimRequest.expectedDispatchGeneration >= 1 &&
            candidate.claimRequest.expectedPriorClaimExpiresAt !== null &&
            Date.parse(candidate.claimRequest.requestedAt) >=
              Date.parse(candidate.claimRequest.expectedPriorClaimExpiresAt) &&
            candidate.deliveryDisposition === 'reconcile-only-replay' &&
            candidate.dispatchGeneration ===
              candidate.claimRequest.expectedDispatchGeneration + 1 &&
            candidate.dispatchLedgerRevision ===
              candidate.claimRequest.expectedDispatchLedgerRevision + 1 &&
            candidate.sealedJournalRecordDigest === null
          : candidate.dispatchGeneration ===
              candidate.claimRequest.expectedDispatchGeneration &&
            candidate.dispatchLedgerRevision ===
              candidate.claimRequest.expectedDispatchLedgerRevision &&
            candidate.deliveryDisposition !==
              'dispatch-authorized-first-delivery' &&
            (candidate.deliveryDisposition === 'sealed-read-only'
              ? candidate.priorTransportReceiptDigest !== null &&
                candidate.sealedJournalRecordDigest !== null
              : candidate.sealedJournalRecordDigest === null)) &&
      candidate.receiptDigest ===
        digestAgentCanonicalValue(
          Object.fromEntries(
            Object.entries(candidate).filter(([key]) => key !== 'receiptDigest')
          )
        ) &&
      safe(
        candidate,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    receipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    observedAt: Instant
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
      receipt
    ) &&
    receipt.dispatchIntentDigest === intent.intentDigest &&
    receipt.deliveryDisposition === 'dispatch-authorized-first-delivery' &&
    isAgentControlInstant(observedAt) &&
    Date.parse(observedAt) >= Date.parse(receipt.claimedAt) &&
    Date.parse(observedAt) < Date.parse(receipt.claimExpiresAt);

/**
 * Proves an expired-owner generation takeover retained reconcile-only authority.
 * Once generation one authorized delivery, every later generation stays unable
 * to dispatch the Provider mutation again.
 */
export const matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchGenerationTakeover =
  (
    prior: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    next: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
      prior
    ) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
      next
    ) &&
    prior.dispatchIntentDigest === next.dispatchIntentDigest &&
    next.generationTransition === 'expired-owner-takeover' &&
    next.deliveryDisposition === 'reconcile-only-replay' &&
    next.claimRequest.expectedDispatchGeneration === prior.dispatchGeneration &&
    next.claimRequest.expectedDispatchLedgerRevision ===
      prior.dispatchLedgerRevision &&
    next.claimRequest.expectedPriorStageClaimReceiptDigest ===
      prior.receiptDigest &&
    next.claimRequest.expectedPriorClaimExpiresAt === prior.claimExpiresAt &&
    Date.parse(next.claimRequest.requestedAt) >=
      Date.parse(prior.claimExpiresAt) &&
    next.dispatchGeneration === prior.dispatchGeneration + 1 &&
    next.dispatchLedgerRevision === prior.dispatchLedgerRevision + 1;

const dispatchClaimReceiptSetKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'lifecycleClaimReceiptDigest',
  'dispatchIntentSetDigest',
  'receipts',
  'receiptDigests',
  'setDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet =
  (
    intentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    receiptsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[]
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        intentSet
      ) ||
      receiptsInput.length !== intentSet.intents.length ||
      receiptsInput.some(
        (receipt, index) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
            receipt
          ) ||
          receipt.dispatchIntentDigest !==
            intentSet.intents[index]!.intentDigest ||
          receipt.deliveryDisposition !== 'dispatch-authorized-first-delivery'
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim set is invalid.');
    }
    const receipts = Object.freeze([...receiptsInput]);
    const receiptDigests = Object.freeze(
      receipts.map(({ receiptDigest }) => receiptDigest)
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: intentSet.operation,
      registrationRequestDigest: intentSet.registrationRequestDigest,
      lifecycleClaimReceiptDigest: intentSet.lifecycleClaimReceiptDigest,
      dispatchIntentSetDigest: intentSet.setDigest,
      receipts,
      receiptDigests,
    });
    const value = Object.freeze({
      ...base,
      setDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim set is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet => {
    if (!exact(value, dispatchClaimReceiptSetKeys)) return false;
    const candidate =
      value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
    const { setDigest, ...base } = candidate;
    return (
      candidate.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_RECEIPT_SET_FORMAT &&
      candidate.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      ['create', 'delete'].includes(candidate.operation) &&
      isAgentCanonicalDigest(candidate.registrationRequestDigest) &&
      (candidate.lifecycleClaimReceiptDigest === null ||
        isAgentCanonicalDigest(candidate.lifecycleClaimReceiptDigest)) &&
      isAgentCanonicalDigest(candidate.dispatchIntentSetDigest) &&
      candidate.receipts.length >= 1 &&
      candidate.receipts.length <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CREATE_MUTATIONS &&
      candidate.receipts.every(
        (receipt) =>
          isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
            receipt
          ) &&
          receipt.deliveryDisposition === 'dispatch-authorized-first-delivery'
      ) &&
      sameCanonicalJson(
        candidate.receiptDigests,
        candidate.receipts.map(({ receiptDigest }) => receiptDigest)
      ) &&
      new Set(candidate.receiptDigests).size ===
        candidate.receiptDigests.length &&
      setDigest === digestAgentCanonicalValue(base) &&
      safe(
        candidate,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    );
  };

const dispatchClaimHistorySetKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'dispatchIntentSetDigest',
  'initialClaimReceiptSet',
  'initialClaimReceiptSetDigest',
  'receipts',
  'receiptDigests',
  'setDigest',
] as const);

const canonicalClaimHistoryReceipts = (
  initialSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[]
): readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] => {
  const intentOrder = new Map(
    initialSet.receipts.map(({ dispatchIntentDigest }, index) => [
      dispatchIntentDigest,
      index,
    ])
  );
  return Object.freeze(
    [...receipts].sort((left, right) => {
      const intentComparison =
        (intentOrder.get(left.dispatchIntentDigest) ??
          Number.MAX_SAFE_INTEGER) -
        (intentOrder.get(right.dispatchIntentDigest) ??
          Number.MAX_SAFE_INTEGER);
      if (intentComparison !== 0) return intentComparison;
      const timeComparison = compareUnicodeCodePoints(
        left.claimedAt,
        right.claimedAt
      );
      return timeComparison !== 0
        ? timeComparison
        : compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest);
    })
  );
};

const claimHistorySuccessorMatches = (
  prior: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  next: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
): boolean =>
  prior.dispatchIntentDigest === next.dispatchIntentDigest &&
  prior.dispatchAuthorityIssuerId === next.dispatchAuthorityIssuerId &&
  prior.dispatchAuthorityImplementationDigest ===
    next.dispatchAuthorityImplementationDigest &&
  next.generationTransition !== 'initial-first-delivery' &&
  next.deliveryDisposition === 'reconcile-only-replay' &&
  next.claimRequest.expectedPriorStageClaimReceiptDigest ===
    prior.receiptDigest &&
  next.claimRequest.expectedPriorClaimExpiresAt === prior.claimExpiresAt &&
  next.claimRequest.expectedDispatchLedgerRevision ===
    prior.dispatchLedgerRevision &&
  next.claimRequest.expectedDispatchGeneration === prior.dispatchGeneration &&
  (next.generationTransition === 'expired-owner-takeover'
    ? matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchGenerationTakeover(
        prior,
        next
      )
    : next.lifecycleOwnerInstanceId === prior.lifecycleOwnerInstanceId &&
      next.dispatchLedgerRevision === prior.dispatchLedgerRevision &&
      next.dispatchGeneration === prior.dispatchGeneration &&
      Date.parse(next.claimRequest.requestedAt) <
        Date.parse(prior.claimExpiresAt));

const claimHistoryChainsMatch = (
  initialSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[]
): boolean =>
  initialSet.receipts.every((initialReceipt) => {
    const chain = receipts.filter(
      ({ dispatchIntentDigest }) =>
        dispatchIntentDigest === initialReceipt.dispatchIntentDigest
    );
    return (
      chain[0]?.receiptDigest === initialReceipt.receiptDigest &&
      chain.every(
        (receipt, index) =>
          index === 0 ||
          claimHistorySuccessorMatches(chain[index - 1]!, receipt)
      )
    );
  }) &&
  receipts.every(({ dispatchIntentDigest }) =>
    initialSet.receipts.some(
      (initial) => initial.dispatchIntentDigest === dispatchIntentDigest
    )
  );

export const createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet =
  (
    intentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    initialClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
    receiptsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[]
  ): AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        intentSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        initialClaimReceiptSet
      ) ||
      initialClaimReceiptSet.operation !== intentSet.operation ||
      initialClaimReceiptSet.registrationRequestDigest !==
        intentSet.registrationRequestDigest ||
      initialClaimReceiptSet.dispatchIntentSetDigest !== intentSet.setDigest ||
      receiptsInput.length < initialClaimReceiptSet.receipts.length ||
      receiptsInput.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CLAIM_RECEIPTS ||
      receiptsInput.some(
        (receipt) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
            receipt
          )
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle dispatch claim history is invalid.'
      );
    }
    const receipts = canonicalClaimHistoryReceipts(
      initialClaimReceiptSet,
      receiptsInput
    );
    if (
      new Set(receipts.map(({ receiptDigest }) => receiptDigest)).size !==
        receipts.length ||
      !claimHistoryChainsMatch(initialClaimReceiptSet, receipts)
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim history drifted.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_HISTORY_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: intentSet.operation,
      registrationRequestDigest: intentSet.registrationRequestDigest,
      dispatchIntentSetDigest: intentSet.setDigest,
      initialClaimReceiptSet,
      initialClaimReceiptSetDigest: initialClaimReceiptSet.setDigest,
      receipts,
      receiptDigests: Object.freeze(
        receipts.map(({ receiptDigest }) => receiptDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      setDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLAIM_HISTORY_SET_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle dispatch claim history is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet => {
    if (!exact(value, dispatchClaimHistorySetKeys)) return false;
    const history =
      value as AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
    const { setDigest, ...base } = history;
    return (
      history.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_DISPATCH_STAGE_CLAIM_HISTORY_SET_FORMAT &&
      history.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        history.initialClaimReceiptSet
      ) &&
      history.operation === history.initialClaimReceiptSet.operation &&
      history.registrationRequestDigest ===
        history.initialClaimReceiptSet.registrationRequestDigest &&
      history.dispatchIntentSetDigest ===
        history.initialClaimReceiptSet.dispatchIntentSetDigest &&
      history.initialClaimReceiptSetDigest ===
        history.initialClaimReceiptSet.setDigest &&
      history.receipts.length >=
        history.initialClaimReceiptSet.receipts.length &&
      history.receipts.length <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CLAIM_RECEIPTS &&
      history.receipts.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
      ) &&
      sameCanonicalJson(
        history.receipts,
        canonicalClaimHistoryReceipts(
          history.initialClaimReceiptSet,
          history.receipts
        )
      ) &&
      sameCanonicalJson(
        history.receiptDigests,
        history.receipts.map(({ receiptDigest }) => receiptDigest)
      ) &&
      new Set(history.receiptDigests).size === history.receiptDigests.length &&
      claimHistoryChainsMatch(
        history.initialClaimReceiptSet,
        history.receipts
      ) &&
      setDigest === digestAgentCanonicalValue(base) &&
      safe(
        history,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CLAIM_HISTORY_SET_MAXIMUM_BYTES
      )
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory =
  (
    intentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    initialClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
    history: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
      intentSet
    ) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
      initialClaimReceiptSet
    ) &&
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
      history
    ) &&
    history.operation === intentSet.operation &&
    history.registrationRequestDigest === intentSet.registrationRequestDigest &&
    history.dispatchIntentSetDigest === intentSet.setDigest &&
    history.initialClaimReceiptSetDigest === initialClaimReceiptSet.setDigest &&
    sameCanonicalJson(history.initialClaimReceiptSet, initialClaimReceiptSet) &&
    initialClaimReceiptSet.receipts.every(
      (receipt, index) =>
        receipt.dispatchIntentDigest === intentSet.intents[index]?.intentDigest
    );

export const matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistoryPrefixDigest =
  (
    intentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    initialClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
    currentHistory: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
    expectedPrefixDigest: CanonicalDigest
  ): boolean => {
    if (
      !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory(
        intentSet,
        initialClaimReceiptSet,
        currentHistory
      ) ||
      !isAgentCanonicalDigest(expectedPrefixDigest)
    ) {
      return false;
    }
    const chains = initialClaimReceiptSet.receipts.map(
      ({ dispatchIntentDigest }) =>
        currentHistory.receipts.filter(
          (receipt) => receipt.dispatchIntentDigest === dispatchIntentDigest
        )
    );
    const candidateReceipts: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt[] =
      [];
    const visit = (chainIndex: number): boolean => {
      if (chainIndex === chains.length) {
        return (
          createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet(
            intentSet,
            initialClaimReceiptSet,
            candidateReceipts
          ).setDigest === expectedPrefixDigest
        );
      }
      const chain = chains[chainIndex]!;
      for (let length = 1; length <= chain.length; length += 1) {
        const priorLength = candidateReceipts.length;
        candidateReceipts.push(...chain.slice(0, length));
        if (visit(chainIndex + 1)) return true;
        candidateReceipts.length = priorLength;
      }
      return false;
    };
    return visit(0);
  };

const responseProjectionKeys = Object.freeze([
  'format',
  'version',
  'mutationKind',
  'resourceId',
  'resourceRole',
  'outcome',
  'resourceManifestDigest',
  'httpStatus',
  'projectionDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    input: Readonly<{
      resourceId: string | null;
      resourceRole: 'auxiliary' | 'primary' | null;
      outcome:
        | 'accepted'
        | 'already-absent'
        | 'created'
        | 'deleted'
        | 'unknown'
        | 'uploaded';
      resourceManifestDigest: CanonicalDigest | null;
      httpStatus: number | null;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !exact(input, [
        'resourceId',
        'resourceRole',
        'outcome',
        'resourceManifestDigest',
        'httpStatus',
      ]) ||
      (input.resourceId !== null &&
        !isAgentControlIdentity(input.resourceId)) ||
      ![null, 'auxiliary', 'primary'].includes(input.resourceRole) ||
      ![
        'accepted',
        'already-absent',
        'created',
        'deleted',
        'unknown',
        'uploaded',
      ].includes(input.outcome) ||
      (input.resourceManifestDigest !== null &&
        !isAgentCanonicalDigest(input.resourceManifestDigest)) ||
      (input.httpStatus !== null &&
        (!Number.isSafeInteger(input.httpStatus) ||
          input.httpStatus < 100 ||
          input.httpStatus > 599)) ||
      (input.outcome === 'unknown' && input.httpStatus !== null) ||
      (input.outcome !== 'unknown' && input.httpStatus === null) ||
      (input.outcome !== 'unknown' &&
        intent.mutationKind !== 'delete-resource' &&
        (input.httpStatus! < 200 || input.httpStatus! > 299)) ||
      (intent.mutationKind === 'delete-resource' &&
        (input.resourceId !== intent.resourceId ||
          input.resourceRole !== intent.resourceRole ||
          !['already-absent', 'deleted', 'unknown'].includes(input.outcome) ||
          (input.outcome === 'already-absent' && input.httpStatus !== 404) ||
          (input.outcome === 'deleted' &&
            (input.httpStatus! < 200 || input.httpStatus! > 299)) ||
          input.resourceManifestDigest !== null)) ||
      (input.outcome !== 'unknown' &&
        intent.mutationKind === 'create-primary' &&
        (input.outcome !== 'created' ||
          input.resourceId === null ||
          input.resourceRole !== 'primary' ||
          input.resourceManifestDigest !== null)) ||
      (input.outcome !== 'unknown' &&
        intent.mutationKind === 'upload-content' &&
        (input.outcome !== 'uploaded' ||
          input.resourceId === null ||
          input.resourceRole !== 'auxiliary' ||
          !isAgentCanonicalDigest(input.resourceManifestDigest))) ||
      (input.outcome !== 'unknown' &&
        intent.mutationKind === 'upload-content-start' &&
        (input.outcome !== 'accepted' ||
          input.resourceId === null ||
          input.resourceRole !== 'primary' ||
          input.resourceManifestDigest !== null)) ||
      (input.outcome !== 'unknown' &&
        intent.mutationKind === 'upload-content-finalize' &&
        (input.outcome !== 'uploaded' ||
          input.resourceId === null ||
          input.resourceRole !== 'primary' ||
          !isAgentCanonicalDigest(input.resourceManifestDigest)))
    ) {
      throw new TypeError('Hosted lifecycle response projection is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RESPONSE_PROJECTION_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      mutationKind: intent.mutationKind,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      projectionDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle response projection is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection => {
    if (!exact(value, responseProjectionKeys)) return false;
    const candidate =
      value as AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection;
    const { projectionDigest, ...base } = candidate;
    return (
      candidate.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RESPONSE_PROJECTION_FORMAT &&
      candidate.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        'create-primary',
        'delete-resource',
        'upload-content',
        'upload-content-finalize',
        'upload-content-start',
      ].includes(candidate.mutationKind) &&
      (candidate.resourceId === null ||
        isAgentControlIdentity(candidate.resourceId)) &&
      [null, 'auxiliary', 'primary'].includes(candidate.resourceRole) &&
      [
        'accepted',
        'already-absent',
        'created',
        'deleted',
        'unknown',
        'uploaded',
      ].includes(candidate.outcome) &&
      (candidate.resourceManifestDigest === null ||
        isAgentCanonicalDigest(candidate.resourceManifestDigest)) &&
      (candidate.httpStatus === null ||
        (Number.isSafeInteger(candidate.httpStatus) &&
          candidate.httpStatus >= 100 &&
          candidate.httpStatus <= 599)) &&
      (candidate.outcome === 'unknown'
        ? candidate.httpStatus === null
        : candidate.httpStatus !== null &&
          (candidate.mutationKind === 'delete-resource'
            ? candidate.outcome === 'already-absent'
              ? candidate.httpStatus === 404
              : candidate.outcome === 'deleted' &&
                candidate.httpStatus >= 200 &&
                candidate.httpStatus <= 299
            : candidate.httpStatus >= 200 && candidate.httpStatus <= 299)) &&
      (candidate.outcome !== 'already-absent' ||
        candidate.httpStatus === 404) &&
      (candidate.outcome !== 'deleted' ||
        (candidate.httpStatus !== null && candidate.httpStatus !== 404)) &&
      (candidate.outcome !== 'created' ||
        (candidate.resourceId !== null &&
          candidate.resourceRole === 'primary' &&
          candidate.resourceManifestDigest === null)) &&
      (candidate.outcome !== 'uploaded' ||
        (candidate.resourceId !== null &&
          candidate.resourceRole !== null &&
          candidate.resourceManifestDigest !== null)) &&
      (candidate.outcome !== 'accepted' ||
        (candidate.resourceId !== null &&
          candidate.resourceRole !== null &&
          candidate.resourceManifestDigest === null)) &&
      projectionDigest === digestAgentCanonicalValue(base) &&
      safe(
        candidate,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    );
  };

const transportReceiptKeys = Object.freeze([
  'format',
  'version',
  'receiptId',
  'lifecycleOwnerAuthorityIssuerId',
  'lifecycleOwnerImplementationDigest',
  'dispatchIntentDigest',
  'dispatchStageClaimReceiptDigest',
  'protocolFamily',
  'providerConfigurationId',
  'endpointId',
  'endpointClass',
  'method',
  'requestProjectionDigest',
  'requestBodyDigest',
  'requestBytes',
  'responseProjection',
  'responseProjectionDigest',
  'responseBodyDigest',
  'responseBytes',
  'httpStatus',
  'providerRequestId',
  'dispatchState',
  'outcome',
  'errorCategory',
  'startedAt',
  'completedAt',
  'receiptDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    dispatchStageClaimReceipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    input: Readonly<{
      receiptId: string;
      dispatchState: 'dispatched' | 'not-dispatched';
      responseProjection: AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection | null;
      responseBodyDigest: CanonicalDigest | null;
      responseBytes: number;
      httpStatus: number | null;
      providerRequestId: string | null;
      outcome: 'completed' | 'failed' | 'post-dispatch-unknown';
      errorCategory:
        | 'aborted'
        | 'provider-rejected'
        | 'response-invalid'
        | 'transport-failed'
        | null;
      startedAt: Instant;
      completedAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
        intent,
        dispatchStageClaimReceipt,
        input.startedAt
      ) ||
      !exact(input, [
        'receiptId',
        'dispatchState',
        'responseProjection',
        'responseBodyDigest',
        'responseBytes',
        'httpStatus',
        'providerRequestId',
        'outcome',
        'errorCategory',
        'startedAt',
        'completedAt',
      ]) ||
      !isAgentControlIdentity(input.receiptId) ||
      !['dispatched', 'not-dispatched'].includes(input.dispatchState) ||
      (input.responseProjection !== null &&
        (!isAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
          input.responseProjection
        ) ||
          input.responseProjection.mutationKind !== intent.mutationKind ||
          input.responseProjection.httpStatus !== input.httpStatus)) ||
      (input.responseBodyDigest !== null &&
        !isAgentCanonicalDigest(input.responseBodyDigest)) ||
      !Number.isSafeInteger(input.responseBytes) ||
      input.responseBytes < 0 ||
      input.responseBytes > 16_777_216 ||
      (input.httpStatus !== null &&
        (!Number.isSafeInteger(input.httpStatus) ||
          input.httpStatus < 100 ||
          input.httpStatus > 599)) ||
      (input.providerRequestId !== null &&
        !isAgentControlIdentity(input.providerRequestId)) ||
      !['completed', 'failed', 'post-dispatch-unknown'].includes(
        input.outcome
      ) ||
      ![
        null,
        'aborted',
        'provider-rejected',
        'response-invalid',
        'transport-failed',
      ].includes(input.errorCategory) ||
      !isAgentControlInstant(input.startedAt) ||
      !isAgentControlInstant(input.completedAt) ||
      Date.parse(input.completedAt) < Date.parse(input.startedAt) ||
      (input.dispatchState === 'not-dispatched' &&
        (input.outcome !== 'failed' ||
          input.responseProjection !== null ||
          input.responseBodyDigest !== null ||
          input.responseBytes !== 0 ||
          input.httpStatus !== null ||
          input.providerRequestId !== null ||
          input.errorCategory === null ||
          input.completedAt !== input.startedAt)) ||
      (input.outcome === 'completed' &&
        (input.dispatchState !== 'dispatched' ||
          input.errorCategory !== null ||
          input.httpStatus === null ||
          input.responseProjection === null ||
          input.responseProjection.outcome === 'unknown' ||
          input.responseBodyDigest === null)) ||
      (input.outcome !== 'completed' && input.errorCategory === null) ||
      (input.outcome === 'post-dispatch-unknown' &&
        (input.dispatchState !== 'dispatched' ||
          input.responseProjection?.outcome !== 'unknown' ||
          input.httpStatus !== null))
    ) {
      throw new TypeError('Hosted lifecycle transport receipt is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      receiptId: input.receiptId,
      lifecycleOwnerAuthorityIssuerId: intent.lifecycleOwnerAuthorityIssuerId,
      lifecycleOwnerImplementationDigest:
        intent.lifecycleOwnerImplementationDigest,
      dispatchIntentDigest: intent.intentDigest,
      dispatchStageClaimReceiptDigest: dispatchStageClaimReceipt.receiptDigest,
      protocolFamily: intent.protocolFamily,
      providerConfigurationId: intent.providerConfigurationId,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      method: intent.method,
      requestProjectionDigest: intent.requestProjectionDigest,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseProjection: input.responseProjection,
      responseProjectionDigest:
        input.responseProjection?.projectionDigest ?? null,
      responseBodyDigest: input.responseBodyDigest,
      responseBytes: input.responseBytes,
      httpStatus: input.httpStatus,
      providerRequestId: input.providerRequestId,
      dispatchState: input.dispatchState,
      outcome: input.outcome,
      errorCategory: input.errorCategory,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle transport receipt is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt => {
  if (!exact(value, transportReceiptKeys)) return false;
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt;
  const { receiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      receipt.receiptId,
      receipt.lifecycleOwnerAuthorityIssuerId,
      receipt.providerConfigurationId,
      receipt.endpointId,
    ].every(isAgentControlIdentity) &&
    [
      receipt.lifecycleOwnerImplementationDigest,
      receipt.dispatchIntentDigest,
      receipt.dispatchStageClaimReceiptDigest,
      receipt.requestProjectionDigest,
      receipt.requestBodyDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) &&
    (receipt.responseProjectionDigest === null ||
      isAgentCanonicalDigest(receipt.responseProjectionDigest)) &&
    (receipt.responseProjection === null
      ? receipt.responseProjectionDigest === null
      : isAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
          receipt.responseProjection
        ) &&
        receipt.responseProjectionDigest ===
          receipt.responseProjection.projectionDigest &&
        receipt.httpStatus === receipt.responseProjection.httpStatus) &&
    (receipt.responseBodyDigest === null ||
      isAgentCanonicalDigest(receipt.responseBodyDigest)) &&
    Number.isSafeInteger(receipt.requestBytes) &&
    receipt.requestBytes >= 0 &&
    receipt.requestBytes <= 16_777_216 &&
    Number.isSafeInteger(receipt.responseBytes) &&
    receipt.responseBytes >= 0 &&
    receipt.responseBytes <= 16_777_216 &&
    ['gemini-interactions', 'openai-responses'].includes(
      receipt.protocolFamily
    ) &&
    receipt.endpointClass === 'provider-hosted-retrieval-resource' &&
    ['DELETE', 'POST'].includes(receipt.method) &&
    (receipt.httpStatus === null ||
      (Number.isSafeInteger(receipt.httpStatus) &&
        receipt.httpStatus >= 100 &&
        receipt.httpStatus <= 599)) &&
    (receipt.providerRequestId === null ||
      isAgentControlIdentity(receipt.providerRequestId)) &&
    ['dispatched', 'not-dispatched'].includes(receipt.dispatchState) &&
    ['completed', 'failed', 'post-dispatch-unknown'].includes(
      receipt.outcome
    ) &&
    [
      null,
      'aborted',
      'provider-rejected',
      'response-invalid',
      'transport-failed',
    ].includes(receipt.errorCategory) &&
    (receipt.outcome === 'completed'
      ? receipt.dispatchState === 'dispatched' &&
        receipt.errorCategory === null &&
        receipt.httpStatus !== null &&
        receipt.responseProjection !== null &&
        receipt.responseProjection.outcome !== 'unknown' &&
        receipt.responseBodyDigest !== null
      : receipt.errorCategory !== null) &&
    (receipt.dispatchState !== 'not-dispatched' ||
      (receipt.outcome === 'failed' &&
        receipt.responseProjection === null &&
        receipt.responseBodyDigest === null &&
        receipt.responseBytes === 0 &&
        receipt.httpStatus === null &&
        receipt.providerRequestId === null &&
        receipt.startedAt === receipt.completedAt)) &&
    (receipt.outcome !== 'post-dispatch-unknown' ||
      (receipt.dispatchState === 'dispatched' &&
        receipt.responseProjection?.outcome === 'unknown' &&
        receipt.httpStatus === null)) &&
    isAgentControlInstant(receipt.startedAt) &&
    isAgentControlInstant(receipt.completedAt) &&
    Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt) &&
    receiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceiptId =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    initialClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  ): string => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        initialClaim
      ) ||
      initialClaim.dispatchIntentDigest !== intent.intentDigest ||
      initialClaim.deliveryDisposition !== 'dispatch-authorized-first-delivery'
    ) {
      throw new TypeError(
        'Hosted lifecycle recovery sentinel identity is invalid.'
      );
    }
    return `${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_CONSERVATIVE_RECOVERY_RECEIPT_ID_PREFIX}${digestAgentCanonicalValue(
      {
        dispatchIntentDigest: intent.intentDigest,
        initialClaimReceiptDigest: initialClaim.receiptDigest,
      }
    ).slice('sha256-'.length)}`;
  };

/**
 * Freezes a conservative receipt for the crash window where first delivery may
 * have reached the Provider while no transport receipt became durable. The
 * current claim contributes only the recovery timestamp; it never authorizes
 * another Provider mutation.
 */
export const createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    initialClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    currentRecoveryClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        currentRecoveryClaim
      ) ||
      currentRecoveryClaim.dispatchIntentDigest !== intent.intentDigest ||
      currentRecoveryClaim.deliveryDisposition !== 'reconcile-only-replay' ||
      currentRecoveryClaim.generationTransition !== 'expired-owner-takeover' ||
      currentRecoveryClaim.priorTransportReceiptDigest !== null ||
      Date.parse(currentRecoveryClaim.claimedAt) <
        Date.parse(initialClaim.claimExpiresAt)
    ) {
      throw new TypeError(
        'Hosted lifecycle recovery sentinel claim is invalid.'
      );
    }
    const responseProjection =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection(
        intent,
        {
          resourceId:
            intent.mutationKind === 'delete-resource'
              ? intent.resourceId
              : null,
          resourceRole:
            intent.mutationKind === 'delete-resource'
              ? intent.resourceRole
              : null,
          outcome: 'unknown',
          resourceManifestDigest: null,
          httpStatus: null,
        }
      );
    return createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
      intent,
      initialClaim,
      {
        receiptId:
          createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceiptId(
            intent,
            initialClaim
          ),
        dispatchState: 'dispatched',
        responseProjection,
        responseBodyDigest: null,
        responseBytes: 0,
        httpStatus: null,
        providerRequestId: null,
        outcome: 'post-dispatch-unknown',
        errorCategory: 'transport-failed',
        startedAt: initialClaim.claimedAt,
        completedAt: currentRecoveryClaim.claimedAt,
      }
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    initialClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    currentRecoveryClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    receipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt
  ): boolean => {
    try {
      return sameCanonicalJson(
        receipt,
        createAgentHostedRetrievalRuntimeResourceLifecycleConservativeRecoveryTransportReceipt(
          intent,
          initialClaim,
          currentRecoveryClaim
        )
      );
    } catch {
      return false;
    }
  };

const transportReceiptSetKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'lifecycleClaimReceiptDigest',
  'dispatchIntentSetDigest',
  'dispatchStageClaimReceiptSetDigest',
  'receipts',
  'receiptDigests',
  'setDigest',
] as const);

const lifecycleTransportReceiptMatchesIntent = (
  receipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt,
  intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent
): boolean =>
  receipt.dispatchIntentDigest === intent.intentDigest &&
  receipt.lifecycleOwnerAuthorityIssuerId ===
    intent.lifecycleOwnerAuthorityIssuerId &&
  receipt.lifecycleOwnerImplementationDigest ===
    intent.lifecycleOwnerImplementationDigest &&
  receipt.protocolFamily === intent.protocolFamily &&
  receipt.providerConfigurationId === intent.providerConfigurationId &&
  receipt.endpointId === intent.endpointId &&
  receipt.endpointClass === intent.endpointClass &&
  receipt.method === intent.method &&
  receipt.requestProjectionDigest === intent.requestProjectionDigest &&
  receipt.requestBodyDigest === intent.requestBodyDigest &&
  receipt.requestBytes === intent.requestBytes &&
  Date.parse(receipt.startedAt) >= Date.parse(intent.createdAt) &&
  (receipt.responseProjection === null ||
    (receipt.responseProjection.mutationKind === intent.mutationKind &&
      (intent.mutationKind !== 'delete-resource' ||
        (receipt.responseProjection.resourceId === intent.resourceId &&
          receipt.responseProjection.resourceRole === intent.resourceRole)) &&
      (receipt.responseProjection.outcome === 'unknown' ||
        (intent.mutationKind === 'create-primary'
          ? receipt.responseProjection.outcome === 'created' &&
            receipt.responseProjection.resourceRole === 'primary'
          : intent.mutationKind === 'upload-content'
            ? receipt.responseProjection.outcome === 'uploaded' &&
              receipt.responseProjection.resourceRole === 'auxiliary'
            : intent.mutationKind === 'upload-content-start'
              ? receipt.responseProjection.outcome === 'accepted' &&
                receipt.responseProjection.resourceRole === 'primary'
              : intent.mutationKind === 'upload-content-finalize'
                ? receipt.responseProjection.outcome === 'uploaded' &&
                  receipt.responseProjection.resourceRole === 'primary'
                : ['already-absent', 'deleted'].includes(
                    receipt.responseProjection.outcome
                  )))));

export const matchAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreContext =
  (
    storeRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    currentClaim: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
    transportReceipt: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt
  ): boolean => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        storeRequest
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        currentClaim
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(
        transportReceipt
      )
    ) {
      return false;
    }
    const authorization = storeRequest.authorizationRequest;
    const projection = storeRequest.observationProjection;
    const requestedAtMs = Date.parse(authorization.requestedAt);
    const expectedOutcome =
      intent.mutationKind === 'create-primary'
        ? 'created'
        : intent.mutationKind === 'upload-content'
          ? 'uploaded'
          : intent.mutationKind === 'upload-content-start'
            ? 'accepted'
            : intent.mutationKind === 'upload-content-finalize'
              ? 'uploaded'
              : null;
    return (
      authorization.dispatchIntentDigest === intent.intentDigest &&
      authorization.dispatchStageClaimReceiptDigest ===
        currentClaim.receiptDigest &&
      authorization.transportReceiptDigest === transportReceipt.receiptDigest &&
      authorization.mutationKind === intent.mutationKind &&
      authorization.mutationSequence === intent.mutationSequence &&
      authorization.providerConfigurationId ===
        intent.providerConfigurationId &&
      authorization.endpointId === intent.endpointId &&
      currentClaim.dispatchIntentDigest === intent.intentDigest &&
      currentClaim.deliveryDisposition === 'reconcile-only-replay' &&
      requestedAtMs >= Date.parse(currentClaim.claimedAt) &&
      requestedAtMs < Date.parse(currentClaim.claimExpiresAt) &&
      transportReceipt.dispatchIntentDigest === intent.intentDigest &&
      transportReceipt.outcome === 'post-dispatch-unknown' &&
      transportReceipt.responseProjection?.outcome === 'unknown' &&
      projection.requestProjectionDigest === intent.requestProjectionDigest &&
      (intent.mutationKind === 'delete-resource'
        ? projection.resourceId === intent.resourceId &&
          projection.resourceRole === intent.resourceRole &&
          ['already-absent', 'deleted'].includes(projection.observationOutcome)
        : projection.observationOutcome === expectedOutcome &&
          (intent.mutationKind === 'upload-content'
            ? projection.resourceRole === 'auxiliary'
            : projection.resourceRole === 'primary'))
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet =
  (
    intentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
    dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
    receiptsInput: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt[]
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        intentSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        dispatchStageClaimReceiptSet
      ) ||
      dispatchStageClaimReceiptSet.operation !== intentSet.operation ||
      dispatchStageClaimReceiptSet.registrationRequestDigest !==
        intentSet.registrationRequestDigest ||
      dispatchStageClaimReceiptSet.lifecycleClaimReceiptDigest !==
        intentSet.lifecycleClaimReceiptDigest ||
      dispatchStageClaimReceiptSet.dispatchIntentSetDigest !==
        intentSet.setDigest ||
      receiptsInput.length !== intentSet.intents.length ||
      receiptsInput.some(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt(value)
      )
    ) {
      throw new TypeError('Hosted lifecycle transport receipt set is invalid.');
    }
    const byIntent = new Map(
      receiptsInput.map((receipt) => [receipt.dispatchIntentDigest, receipt])
    );
    const receipts = Object.freeze(
      intentSet.intents.map(({ intentDigest }) => byIntent.get(intentDigest)!)
    );
    if (
      byIntent.size !== receiptsInput.length ||
      receipts.some(
        (receipt, index) =>
          receipt === undefined ||
          !lifecycleTransportReceiptMatchesIntent(
            receipt,
            intentSet.intents[index]!
          ) ||
          receipt.dispatchStageClaimReceiptDigest !==
            dispatchStageClaimReceiptSet.receipts[index]!.receiptDigest
      )
    ) {
      throw new TypeError('Hosted lifecycle transport receipt set drifted.');
    }
    const receiptDigests = Object.freeze(
      receipts.map(({ receiptDigest }) => receiptDigest)
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: intentSet.operation,
      registrationRequestDigest: intentSet.registrationRequestDigest,
      lifecycleClaimReceiptDigest: intentSet.lifecycleClaimReceiptDigest,
      dispatchIntentSetDigest: intentSet.setDigest,
      dispatchStageClaimReceiptSetDigest:
        dispatchStageClaimReceiptSet.setDigest,
      receipts,
      receiptDigests,
    });
    const value = Object.freeze({
      ...base,
      setDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle transport receipt set is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet => {
    if (!exact(value, transportReceiptSetKeys)) return false;
    try {
      const candidate =
        value as AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet;
      const { setDigest, ...base } = candidate;
      return (
        candidate.format ===
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_RECEIPT_SET_FORMAT &&
        candidate.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
        ['create', 'delete'].includes(candidate.operation) &&
        isAgentCanonicalDigest(candidate.registrationRequestDigest) &&
        (candidate.lifecycleClaimReceiptDigest === null ||
          isAgentCanonicalDigest(candidate.lifecycleClaimReceiptDigest)) &&
        isAgentCanonicalDigest(candidate.dispatchIntentSetDigest) &&
        isAgentCanonicalDigest(candidate.dispatchStageClaimReceiptSetDigest) &&
        candidate.receipts.length >= 1 &&
        candidate.receipts.length <=
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_CREATE_MUTATIONS &&
        candidate.receipts.every(
          isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceipt
        ) &&
        new Set(
          candidate.receipts.map(
            ({ dispatchIntentDigest }) => dispatchIntentDigest
          )
        ).size === candidate.receipts.length &&
        sameCanonicalJson(
          candidate.receiptDigests,
          candidate.receipts.map(({ receiptDigest }) => receiptDigest)
        ) &&
        setDigest === digestAgentCanonicalValue(base) &&
        safe(
          candidate,
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
        )
      );
    } catch {
      return false;
    }
  };

const businessResultKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'providerResourceId',
  'auxiliaryResourceIds',
  'resourceManifestDigest',
  'resourceId',
  'resourceRole',
  'reconciliationObservationReceiptSet',
  'reconciliationObservationReceiptSetDigest',
  'outcome',
  'completedAt',
  'resultDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
      'format' | 'resultDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult => {
    const auxiliaryResourceIds = canonicalIds(input.auxiliaryResourceIds);
    if (
      !exact(input, businessResultKeys.slice(2, -1)) ||
      input.auxiliaryResourceIds.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS ||
      new Set(input.auxiliaryResourceIds).size !==
        input.auxiliaryResourceIds.length ||
      input.auxiliaryResourceIds.some(
        (value) => !isAgentControlIdentity(value)
      ) ||
      !sameCanonicalJson(input.auxiliaryResourceIds, auxiliaryResourceIds) ||
      (input.reconciliationObservationReceiptSet === null
        ? input.reconciliationObservationReceiptSetDigest !== null
        : !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
            input.reconciliationObservationReceiptSet
          ) ||
          input.reconciliationObservationReceiptSetDigest !==
            input.reconciliationObservationReceiptSet.setDigest ||
          input.reconciliationObservationReceiptSet.operation !==
            input.operation) ||
      !isAgentControlInstant(input.completedAt) ||
      (input.operation === 'create' &&
        ((input.providerResourceId !== null &&
          !isAgentControlIdentity(input.providerResourceId)) ||
          input.resourceId !== null ||
          input.resourceRole !== null ||
          ![
            'abandoned-before-provider-effect',
            'created-and-uploaded',
            'partial-create-requires-cleanup',
            'provider-outcome-unresolved',
          ].includes(input.outcome) ||
          (input.outcome === 'created-and-uploaded' &&
            (input.providerResourceId === null ||
              !isAgentCanonicalDigest(input.resourceManifestDigest))) ||
          (input.outcome === 'partial-create-requires-cleanup' &&
            input.providerResourceId === null &&
            input.auxiliaryResourceIds.length === 0) ||
          (input.outcome === 'abandoned-before-provider-effect' &&
            (input.providerResourceId !== null ||
              input.auxiliaryResourceIds.length !== 0 ||
              input.resourceManifestDigest !== null)) ||
          (input.outcome === 'provider-outcome-unresolved' &&
            input.reconciliationObservationReceiptSet !== null))) ||
      (input.operation === 'delete' &&
        (input.providerResourceId !== null ||
          input.auxiliaryResourceIds.length !== 0 ||
          input.resourceManifestDigest !== null ||
          !isAgentControlIdentity(input.resourceId) ||
          !['auxiliary', 'primary'].includes(input.resourceRole ?? '') ||
          !['already-absent', 'deleted'].includes(input.outcome))) ||
      !['create', 'delete'].includes(input.operation)
    ) {
      throw new TypeError('Hosted lifecycle business result is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_BUSINESS_RESULT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
      auxiliaryResourceIds,
    });
    const value = Object.freeze({
      ...base,
      resultDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle business result is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult => {
  if (!exact(value, businessResultKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      resultDigest: _digest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult(input)
    );
  } catch {
    return false;
  }
};

const journalRecordKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'authorityDigest',
  'lifecycleClaimReceiptDigest',
  'dispatchIntentSet',
  'dispatchIntentSetDigest',
  'dispatchStageClaimReceiptSet',
  'dispatchStageClaimReceiptSetDigest',
  'dispatchStageClaimHistorySet',
  'dispatchStageClaimHistorySetDigest',
  'transportReceiptSet',
  'transportReceiptSetDigest',
  'businessResult',
  'businessResultDigest',
  'resultSpoolReceipt',
  'resultSpoolReceiptDigest',
  'resultSpoolDispositionReceipt',
  'resultSpoolDispositionReceiptDigest',
  'recordDigest',
] as const);

const recordTransportSemanticsMatch = (
  dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet,
  dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet,
  dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet,
  transportReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet,
  businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult,
  disposition: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt
): boolean => {
  if (
    disposition.disposition !== 'destroyed-after-business-seal' ||
    disposition.encryptionState !== 'destroyed' ||
    disposition.businessSealReceiptDigest !== businessResult.resultDigest ||
    !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory(
      dispatchIntentSet,
      dispatchStageClaimReceiptSet,
      dispatchStageClaimHistorySet
    ) ||
    transportReceiptSet.dispatchIntentSetDigest !==
      dispatchIntentSet.setDigest ||
    dispatchStageClaimReceiptSet.dispatchIntentSetDigest !==
      dispatchIntentSet.setDigest ||
    transportReceiptSet.dispatchStageClaimReceiptSetDigest !==
      dispatchStageClaimReceiptSet.setDigest ||
    transportReceiptSet.receipts.length !== dispatchIntentSet.intents.length ||
    dispatchStageClaimReceiptSet.receipts.length !==
      dispatchIntentSet.intents.length ||
    transportReceiptSet.receipts.some(
      (receipt, index) =>
        dispatchStageClaimReceiptSet.receipts[index]?.dispatchIntentDigest !==
          dispatchIntentSet.intents[index]!.intentDigest ||
        receipt.dispatchStageClaimReceiptDigest !==
          dispatchStageClaimReceiptSet.receipts[index]!.receiptDigest ||
        !lifecycleTransportReceiptMatchesIntent(
          receipt,
          dispatchIntentSet.intents[index]!
        )
    )
  ) {
    return false;
  }
  const receipts = transportReceiptSet.receipts;
  const unknownReceipts = receipts.filter(
    ({ outcome }) => outcome === 'post-dispatch-unknown'
  );
  const historyByIntent = new Map(
    dispatchIntentSet.intents.map(
      (intent) =>
        [
          intent.intentDigest,
          dispatchStageClaimHistorySet.receipts.filter(
            ({ dispatchIntentDigest }) =>
              dispatchIntentDigest === intent.intentDigest
          ),
        ] as const
    )
  );
  if (
    receipts.some((receipt) =>
      (historyByIntent.get(receipt.dispatchIntentDigest) ?? [])
        .slice(1)
        .some(
          ({ priorTransportReceiptDigest }) =>
            priorTransportReceiptDigest !== null &&
            priorTransportReceiptDigest !== receipt.receiptDigest
        )
    ) ||
    unknownReceipts.some(
      (receipt) =>
        (historyByIntent.get(receipt.dispatchIntentDigest)?.length ?? 0) < 2
    )
  ) {
    return false;
  }
  const reconciliationSet = businessResult.reconciliationObservationReceiptSet;
  const observations = reconciliationSet?.receipts ?? [];
  const observationByTransport = new Map(
    observations.map(
      (observation) =>
        [observation.transportReceiptDigest, observation] as const
    )
  );
  if (
    (unknownReceipts.length === 0) !== (reconciliationSet === null) ||
    (reconciliationSet !== null &&
      (reconciliationSet.registrationRequestDigest !==
        dispatchIntentSet.registrationRequestDigest ||
        reconciliationSet.operation !== dispatchIntentSet.operation ||
        observationByTransport.size !== observations.length ||
        observations.length !== unknownReceipts.length ||
        unknownReceipts.some((receipt) => {
          const observation = observationByTransport.get(receipt.receiptDigest);
          const intent = dispatchIntentSet.intents.find(
            ({ intentDigest }) => intentDigest === receipt.dispatchIntentDigest
          );
          const observationClaim = dispatchStageClaimHistorySet.receipts.find(
            ({ receiptDigest }) =>
              receiptDigest === observation?.dispatchStageClaimReceiptDigest
          );
          return (
            !observation ||
            !intent ||
            !observationClaim ||
            observationClaim.dispatchIntentDigest !== intent.intentDigest ||
            observationClaim.deliveryDisposition !== 'reconcile-only-replay' ||
            Date.parse(observation.request.requestedAt) <
              Date.parse(observationClaim.claimedAt) ||
            observation.dispatchIntentDigest !== intent.intentDigest ||
            observation.mutationKind !== intent.mutationKind ||
            observation.mutationSequence !== intent.mutationSequence ||
            observation.request.providerConfigurationId !==
              intent.providerConfigurationId ||
            observation.request.endpointId !== intent.endpointId ||
            (intent.mutationKind === 'create-primary'
              ? observation.observationOutcome !== 'created' ||
                observation.resourceRole !== 'primary'
              : intent.mutationKind === 'upload-content'
                ? observation.observationOutcome !== 'uploaded' ||
                  observation.resourceRole !== 'auxiliary'
                : intent.mutationKind === 'upload-content-start'
                  ? observation.observationOutcome !== 'accepted' ||
                    observation.resourceRole !== 'primary'
                  : intent.mutationKind === 'upload-content-finalize'
                    ? observation.observationOutcome !== 'uploaded' ||
                      observation.resourceRole !== 'primary'
                    : !['already-absent', 'deleted'].includes(
                        observation.observationOutcome
                      ) ||
                      observation.resourceId !== intent.resourceId ||
                      observation.resourceRole !== intent.resourceRole) ||
            Date.parse(observation.observedAt) < Date.parse(receipt.completedAt)
          );
        })))
  )
    return false;
  const completedAt = [
    ...receipts.map((receipt) => receipt.completedAt),
    ...observations.map((observation) => observation.observedAt),
  ]
    .sort(compareUnicodeCodePoints)
    .at(-1);
  if (completedAt !== businessResult.completedAt) return false;
  if (businessResult.operation === 'delete') {
    const receipt = receipts[0];
    const directProjection = receipt?.responseProjection;
    const observation = receipt
      ? observationByTransport.get(receipt.receiptDigest)
      : undefined;
    const projection =
      directProjection?.outcome === 'unknown' ? observation : directProjection;
    return (
      receipts.length === 1 &&
      (receipt?.outcome === 'completed' || observation !== undefined) &&
      receipt.dispatchState === 'dispatched' &&
      projection !== null &&
      projection !== undefined &&
      projection.resourceId === businessResult.resourceId &&
      projection.resourceRole === businessResult.resourceRole &&
      ('outcome' in projection
        ? projection.outcome
        : projection.observationOutcome) === businessResult.outcome &&
      (businessResult.outcome === 'already-absent'
        ? projection.httpStatus === 404
        : projection.httpStatus !== null &&
          projection.httpStatus >= 200 &&
          projection.httpStatus <= 299) &&
      disposition.businessSealKind === 'cleanup-result'
    );
  }
  const completedProjections = receipts
    .filter(({ outcome }) => outcome === 'completed')
    .map(({ responseProjection }) => responseProjection)
    .filter(
      (
        value
      ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportResponseProjection =>
        value !== null
    );
  const reconciledProjections = observations.map((observation) => ({
    resourceRole: observation.resourceRole,
    resourceId: observation.resourceId,
    resourceManifestDigest: observation.resourceManifestDigest,
  }));
  const knownProjections = [...completedProjections, ...reconciledProjections];
  const primaryIds = canonicalIds([
    ...new Set(
      knownProjections
        .filter(({ resourceRole }) => resourceRole === 'primary')
        .map(({ resourceId }) => resourceId)
        .filter((value): value is string => value !== null)
    ),
  ]);
  const auxiliaryIds = canonicalIds([
    ...new Set(
      knownProjections
        .filter(({ resourceRole }) => resourceRole === 'auxiliary')
        .map(({ resourceId }) => resourceId)
        .filter((value): value is string => value !== null)
    ),
  ]);
  const manifests = [
    ...new Set(
      knownProjections
        .map(({ resourceManifestDigest }) => resourceManifestDigest)
        .filter((value): value is CanonicalDigest => value !== null)
    ),
  ];
  const knownPrimaryId = primaryIds[0] ?? null;
  const knownManifestDigest = manifests[0] ?? null;
  if (
    primaryIds.length > 1 ||
    manifests.length > 1 ||
    businessResult.providerResourceId !== knownPrimaryId ||
    !sameCanonicalJson(auxiliaryIds, businessResult.auxiliaryResourceIds) ||
    businessResult.resourceManifestDigest !== knownManifestDigest
  ) {
    return false;
  }
  if (businessResult.outcome === 'abandoned-before-provider-effect') {
    return (
      completedProjections.length === 0 &&
      receipts.every(
        ({ dispatchState }) => dispatchState === 'not-dispatched'
      ) &&
      disposition.businessSealKind === 'abandoned-before-provider-effect'
    );
  }
  if (businessResult.outcome === 'provider-outcome-unresolved') {
    return false;
  }
  return businessResult.outcome === 'created-and-uploaded'
    ? receipts.every(
        ({ receiptDigest, dispatchState, outcome, httpStatus }) =>
          dispatchState === 'dispatched' &&
          (outcome === 'completed'
            ? httpStatus !== null && httpStatus >= 200 && httpStatus <= 299
            : observationByTransport.has(receiptDigest))
      ) &&
        knownPrimaryId !== null &&
        knownManifestDigest !== null &&
        disposition.businessSealKind === 'registration-result'
    : businessResult.outcome === 'partial-create-requires-cleanup' &&
        primaryIds.length + auxiliaryIds.length >= 1 &&
        disposition.businessSealKind === 'partial-create-result';
};

export const createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord =
  (
    input: Readonly<{
      dispatchIntentSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet;
      dispatchStageClaimReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet;
      dispatchStageClaimHistorySet: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistorySet;
      transportReceiptSet: AgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet;
      businessResult: AgentHostedRetrievalRuntimeResourceLifecycleBusinessResult;
      resultSpoolReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt;
      resultSpoolDispositionReceipt: AgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord => {
    const {
      dispatchIntentSet,
      dispatchStageClaimReceiptSet,
      dispatchStageClaimHistorySet,
      transportReceiptSet,
      businessResult,
      resultSpoolReceipt,
      resultSpoolDispositionReceipt,
    } = input;
    const firstIntent = dispatchIntentSet.intents[0];
    if (
      !exact(input, [
        'dispatchIntentSet',
        'dispatchStageClaimReceiptSet',
        'dispatchStageClaimHistorySet',
        'transportReceiptSet',
        'businessResult',
        'resultSpoolReceipt',
        'resultSpoolDispositionReceipt',
      ]) ||
      !firstIntent ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(
        dispatchIntentSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceiptSet(
        dispatchStageClaimReceiptSet
      ) ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistory(
        dispatchIntentSet,
        dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(
        transportReceiptSet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleBusinessResult(
        businessResult
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolReceipt(
        resultSpoolReceipt
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleResultSpoolDispositionReceipt(
        resultSpoolDispositionReceipt
      ) ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleSpoolDisposition(
        resultSpoolReceipt,
        resultSpoolDispositionReceipt
      ) ||
      transportReceiptSet.operation !== dispatchIntentSet.operation ||
      dispatchStageClaimReceiptSet.operation !== dispatchIntentSet.operation ||
      dispatchStageClaimReceiptSet.registrationRequestDigest !==
        dispatchIntentSet.registrationRequestDigest ||
      dispatchStageClaimReceiptSet.lifecycleClaimReceiptDigest !==
        dispatchIntentSet.lifecycleClaimReceiptDigest ||
      dispatchStageClaimReceiptSet.dispatchIntentSetDigest !==
        dispatchIntentSet.setDigest ||
      transportReceiptSet.dispatchStageClaimReceiptSetDigest !==
        dispatchStageClaimReceiptSet.setDigest ||
      transportReceiptSet.registrationRequestDigest !==
        dispatchIntentSet.registrationRequestDigest ||
      transportReceiptSet.lifecycleClaimReceiptDigest !==
        dispatchIntentSet.lifecycleClaimReceiptDigest ||
      transportReceiptSet.dispatchIntentSetDigest !==
        dispatchIntentSet.setDigest ||
      businessResult.operation !== dispatchIntentSet.operation ||
      resultSpoolReceipt.operation !== dispatchIntentSet.operation ||
      resultSpoolReceipt.namespaceId !== firstIntent.namespaceId ||
      resultSpoolReceipt.repositoryCommit !== firstIntent.repositoryCommit ||
      resultSpoolReceipt.planDigest !== firstIntent.planDigest ||
      resultSpoolReceipt.frozenRunDigest !== firstIntent.frozenRunDigest ||
      resultSpoolReceipt.runConfigArtifactBindingDigest !==
        firstIntent.runConfigArtifactBindingDigest ||
      resultSpoolReceipt.runtimeResourceSetId !==
        firstIntent.runtimeResourceSetId ||
      resultSpoolReceipt.registrationRequestDigest !==
        dispatchIntentSet.registrationRequestDigest ||
      resultSpoolReceipt.authorityDigest !== firstIntent.authorityDigest ||
      resultSpoolReceipt.lifecycleClaimReceiptDigest !==
        dispatchIntentSet.lifecycleClaimReceiptDigest ||
      resultSpoolReceipt.dispatchIntentSetDigest !==
        dispatchIntentSet.setDigest ||
      resultSpoolReceipt.dispatchStageClaimReceiptSetDigest !==
        dispatchStageClaimReceiptSet.setDigest ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimHistoryPrefixDigest(
        dispatchIntentSet,
        dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet,
        resultSpoolReceipt.dispatchStageClaimHistorySetDigest
      ) ||
      resultSpoolReceipt.transportReceiptSetDigest !==
        transportReceiptSet.setDigest ||
      resultSpoolReceipt.businessResultDigest !== businessResult.resultDigest ||
      resultSpoolReceipt.resourceId !== businessResult.resourceId ||
      resultSpoolReceipt.resourceRole !== businessResult.resourceRole ||
      resultSpoolDispositionReceipt.spoolReceiptDigest !==
        resultSpoolReceipt.receiptDigest ||
      resultSpoolDispositionReceipt.spoolRef !== resultSpoolReceipt.spoolRef ||
      resultSpoolDispositionReceipt.operation !== dispatchIntentSet.operation ||
      resultSpoolDispositionReceipt.registrationRequestDigest !==
        dispatchIntentSet.registrationRequestDigest ||
      resultSpoolDispositionReceipt.authorityDigest !==
        firstIntent.authorityDigest ||
      resultSpoolDispositionReceipt.lifecycleClaimReceiptDigest !==
        dispatchIntentSet.lifecycleClaimReceiptDigest ||
      Date.parse(resultSpoolReceipt.createdAt) <
        Math.max(
          ...transportReceiptSet.receipts.map(({ completedAt }) =>
            Date.parse(completedAt)
          )
        ) ||
      Date.parse(resultSpoolDispositionReceipt.disposedAt) <
        Date.parse(resultSpoolReceipt.createdAt) ||
      !recordTransportSemanticsMatch(
        dispatchIntentSet,
        dispatchStageClaimReceiptSet,
        dispatchStageClaimHistorySet,
        transportReceiptSet,
        businessResult,
        resultSpoolDispositionReceipt
      )
    ) {
      throw new TypeError('Hosted lifecycle journal record is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_TRANSPORT_JOURNAL_RECORD_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: dispatchIntentSet.operation,
      registrationRequestDigest: dispatchIntentSet.registrationRequestDigest,
      authorityDigest: firstIntent.authorityDigest,
      lifecycleClaimReceiptDigest:
        dispatchIntentSet.lifecycleClaimReceiptDigest,
      dispatchIntentSet,
      dispatchIntentSetDigest: dispatchIntentSet.setDigest,
      dispatchStageClaimReceiptSet,
      dispatchStageClaimReceiptSetDigest:
        dispatchStageClaimReceiptSet.setDigest,
      dispatchStageClaimHistorySet,
      dispatchStageClaimHistorySetDigest:
        dispatchStageClaimHistorySet.setDigest,
      transportReceiptSet,
      transportReceiptSetDigest: transportReceiptSet.setDigest,
      businessResult,
      businessResultDigest: businessResult.resultDigest,
      resultSpoolReceipt,
      resultSpoolReceiptDigest: resultSpoolReceipt.receiptDigest,
      resultSpoolDispositionReceipt,
      resultSpoolDispositionReceiptDigest:
        resultSpoolDispositionReceipt.receiptDigest,
    });
    const value = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_RECORD_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted lifecycle journal record is unsafe.');
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord => {
    if (!exact(value, journalRecordKeys)) return false;
    try {
      const record =
        value as AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord;
      return sameCanonicalJson(
        record,
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
          {
            dispatchIntentSet: record.dispatchIntentSet,
            dispatchStageClaimReceiptSet: record.dispatchStageClaimReceiptSet,
            dispatchStageClaimHistorySet: record.dispatchStageClaimHistorySet,
            transportReceiptSet: record.transportReceiptSet,
            businessResult: record.businessResult,
            resultSpoolReceipt: record.resultSpoolReceipt,
            resultSpoolDispositionReceipt: record.resultSpoolDispositionReceipt,
          }
        )
      );
    } catch {
      return false;
    }
  };

export const matchAgentHostedRetrievalRuntimeResourceRegistrationResultLifecycleJournal =
  (
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
    record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord
  ): boolean => {
    if (
      !isAgentHostedRetrievalRuntimeResourceRegistrationResult(
        registrationResult
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
        record
      ) ||
      record.operation !== 'create' ||
      record.businessResult.outcome !== 'created-and-uploaded'
    ) {
      return false;
    }
    const authority = registrationResult.authority;
    const request = registrationResult.registrationRequest;
    const intent = record.dispatchIntentSet.intents[0]!;
    return (
      record.registrationRequestDigest === request.requestDigest &&
      record.authorityDigest === null &&
      record.lifecycleClaimReceiptDigest === null &&
      intent.namespaceId === request.namespaceId &&
      intent.repositoryCommit === request.repositoryCommit &&
      intent.planDigest === request.planDigest &&
      intent.frozenRunDigest === request.frozenRunDigest &&
      intent.runConfigArtifactBindingDigest ===
        request.runConfigArtifactBindingDigest &&
      intent.runtimeResourceSetId === request.runtimeResourceSetId &&
      intent.registrationIntentDigest === request.registrationIntentDigest &&
      intent.protocolFamily === request.protocolFamily &&
      intent.capabilityProfileId === request.capabilityProfileId &&
      intent.providerConfigurationId === request.providerConfigurationId &&
      intent.providerConfigurationDigest ===
        request.providerConfigurationDigest &&
      intent.budgetReservationId ===
        request.budgetReservationAuthority.reservationId &&
      intent.budgetReservationAuthorityDigest ===
        request.budgetReservationAuthorityDigest &&
      record.businessResult.providerResourceId ===
        authority.providerResourceId &&
      sameCanonicalJson(
        record.businessResult.auxiliaryResourceIds,
        authority.auxiliaryResourceIds
      ) &&
      record.businessResult.resourceManifestDigest ===
        authority.resourceManifestDigest &&
      record.resultSpoolReceiptDigest ===
        authority.contentUploadReceiptDigest &&
      setRoot(record.dispatchIntentSet.intentDigests) ===
        authority.creationDispatchIntentSetDigest &&
      setRoot(record.transportReceiptSet.receiptDigests) ===
        authority.creationTransportReceiptSetDigest &&
      setRoot([record.resultSpoolReceiptDigest]) ===
        authority.creationResultSpoolReceiptSetDigest
    );
  };

export const matchAgentHostedRetrievalRuntimeResourceCleanupResultLifecycleJournal =
  (
    result: AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
    record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord,
    registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult,
    claim: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalRecord(
      record
    ) &&
    isAgentHostedRetrievalRuntimeResourceRegistrationResult(
      registrationResult
    ) &&
    record.operation === 'delete' &&
    record.registrationRequestDigest ===
      registrationResult.registrationRequestDigest &&
    record.authorityDigest === registrationResult.authorityDigest &&
    record.lifecycleClaimReceiptDigest === claim.receiptDigest &&
    record.businessResult.resourceId === result.resourceId &&
    record.businessResult.resourceRole === result.resourceRole &&
    record.businessResult.outcome === result.outcome &&
    record.dispatchIntentSetDigest === result.dispatchIntentDigest &&
    record.transportReceiptSetDigest === result.transportReceiptDigest &&
    record.resultSpoolReceiptDigest === result.resultSpoolReceiptDigest &&
    record.resultSpoolDispositionReceiptDigest ===
      result.resultSpoolDispositionReceiptDigest &&
    record.dispatchIntentSet.intents[0]!.createdAt ===
      result.dispatchCreatedAt &&
    record.businessResult.completedAt === result.completedAt;
