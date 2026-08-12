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
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION = 1 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_INTENT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-intent' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_BUDGET_RESERVATION_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-budget-reservation-authority' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_NETWORK_POLICY_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-network-policy-authority' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-request-projection' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-deletion-authority-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-set-commitment' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-result' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ACTIVE_STATE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-active-state' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_LEASE_LEDGER_ROOT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-lease-ledger-root' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_AUTHORITY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claim-authority-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIMED_STATE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-claimed-state' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RUN_TERMINAL_FENCE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-run-terminal-fence' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ID_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-id-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_ATTEMPT_ID_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-attempt-id-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_ID_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-id-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_ATTEMPT_RESULT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-attempt-result-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_LEASE_GENERATION_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-lease-generation-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_TERMINAL_SHARD_RESULT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-terminal-shard-result-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-resource-result' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OVERDUE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-overdue-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-cleanup-archive-record' as const;

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT = 4 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS =
  20 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS =
  8 * 24 * 60 * 60 * 1_000;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MAXIMUM_LIFETIME_MS =
  180_000 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS =
  155_000 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS =
  15 * 60 * 1_000;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES =
  32_768 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES =
  24_576 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES =
  32_768 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES =
  786_432 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_RECORD_WRAPPER_MAXIMUM_BYTES =
  8_192 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_ADMISSION_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_MAXIMUM_BYTES +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 6 +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_RECORD_WRAPPER_MAXIMUM_BYTES;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_READ_RECEIPTS =
  14_040 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_TERMINAL_SHARDS =
  1_024 as const;

export type AgentHostedRetrievalRuntimeResourceProtocolFamily =
  'gemini-interactions' | 'openai-responses';

export type AgentHostedRetrievalRuntimeResourceKind =
  'gemini-file-search-store-name' | 'openai-vector-store-id';

export type AgentHostedRetrievalRuntimeResourceProfileId =
  'g4-provider-hosted-retrieval-core' | 'g4-provider-hosted-retrieval-document';

export type AgentHostedRetrievalRuntimeResourceCleanupReason =
  'expired' | 'matrix-terminal' | 'owner-shutdown' | 'startup-reconcile';

export type AgentHostedRetrievalRuntimeResourceRegistrationIntent = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_INTENT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  providerConfigurationId: string;
  providerConfigurationDigest: CanonicalDigest;
  protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
  capabilityProfileDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  publicResourceDescriptorDigest: CanonicalDigest;
  maximumResourceLifetimeMs: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS;
  minimumQueryReadLeaseMs: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS;
  requiredOperations: readonly ['create', 'delete', 'query', 'upload'];
  intentDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceTerminalAttemptStatus =
  | 'blocked'
  | 'cancelled'
  | 'completed'
  | 'infrastructure-error'
  | 'provider-error'
  | 'rate-limited'
  | 'schema-failed'
  | 'timed-out';

export type AgentHostedRetrievalRuntimeResourceTerminalAttemptRecord =
  Readonly<{
    attemptId: string;
    attemptDigest: CanonicalDigest;
    status: AgentHostedRetrievalRuntimeResourceTerminalAttemptStatus;
    completedAt: Instant;
  }>;

export type AgentHostedRetrievalRuntimeResourceTerminalShardRecord = Readonly<{
  shardId: string;
  shardLeaseGeneration: number;
  checkpointDigest: CanonicalDigest;
  terminalAttemptCount: number;
  terminalAttemptIdSetDigest: CanonicalDigest;
  terminalAttemptResultSetDigest: CanonicalDigest;
  terminalOutcome: 'cancelled' | 'completed' | 'failed';
  terminalAt: Instant;
  terminalRecordDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRunTerminalFence = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_RUN_TERMINAL_FENCE_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  fenceId: string;
  fenceAuthorityIssuerId: string;
  fenceAuthorityImplementationDigest: CanonicalDigest;
  fenceLedgerRevision: number;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  expectedShardCount: number;
  terminalShardCount: number;
  terminalShardIdSetDigest: CanonicalDigest;
  terminalAttemptIdSetDigest: CanonicalDigest;
  terminalShardLeaseGenerationSetDigest: CanonicalDigest;
  terminalShardResultSetDigest: CanonicalDigest;
  terminalOutcome: 'cancelled' | 'completed' | 'failed';
  allShardsTerminalAt: Instant;
  sealedAt: Instant;
  fenceDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_BUDGET_RESERVATION_AUTHORITY_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    reservePolicyDigest: CanonicalDigest;
    budgetDigest: CanonicalDigest;
    reservationId: string;
    ledgerRevision: number;
    demandDigest: CanonicalDigest;
    demandBytesDigest: CanonicalDigest;
    reservedAt: Instant;
    authorityDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceBudgetPlanBinding = Readonly<{
  namespaceId: string;
  planDigest: CanonicalDigest;
  reservePolicyDigest: CanonicalDigest;
  budgetDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_NETWORK_POLICY_AUTHORITY_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    providerConfigurationId: string;
    providerConfigurationDigest: CanonicalDigest;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    purpose: 'hosted-retrieval-runtime-resource-lifecycle';
    endpointClass: 'first-party-hosted';
    allowedOperations: readonly ['create', 'delete', 'query', 'upload'];
    authorityDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceNetworkPolicyFrozenBinding =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    providerConfigurationId: string;
    providerConfigurationDigest: CanonicalDigest;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  }>;

export type AgentHostedRetrievalRuntimeResourceRegistrationRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent;
  registrationIntentDigest: CanonicalDigest;
  providerConfigurationId: string;
  providerConfigurationDigest: CanonicalDigest;
  protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
  capabilityProfileDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  publicResourceDescriptorDigest: CanonicalDigest;
  budgetReservationAuthority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
  budgetReservationAuthorityDigest: CanonicalDigest;
  networkPolicyAuthority: AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority;
  networkPolicyAuthorityDigest: CanonicalDigest;
  minimumExpiresAt: Instant;
  requestDigest: CanonicalDigest;
}>;

export type CreateAgentHostedRetrievalRuntimeResourceRegistrationRequestInput =
  Omit<
    AgentHostedRetrievalRuntimeResourceRegistrationRequest,
    'format' | 'requestDigest' | 'version'
  >;

export type AgentHostedRetrievalRuntimeResourceDeletionRequestProjection =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    registrationRequestDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    providerResourceKind: AgentHostedRetrievalRuntimeResourceKind;
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
    projectionDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    registrationRequestDigest: CanonicalDigest;
    planDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    resourceManifestDigest: CanonicalDigest;
    providerResourceKind: AgentHostedRetrievalRuntimeResourceKind;
    providerResourceId: string;
    deletionRouteBinding: 'hosted-retrieval-runtime-resource.delete';
    deletionRequestProjection: AgentHostedRetrievalRuntimeResourceDeletionRequestProjection;
    deletionRequestProjectionDigest: CanonicalDigest;
    registeredAt: Instant;
    expiresAt: Instant;
    deletionAuthorityReceiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceAuthority = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  registrationRequestDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  registrationIntentDigest: CanonicalDigest;
  providerConfigurationId: string;
  providerConfigurationDigest: CanonicalDigest;
  protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
  capabilityProfileDigest: CanonicalDigest;
  probeProgramDigest: CanonicalDigest;
  publicResourceDescriptorDigest: CanonicalDigest;
  budgetReservationAuthority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
  budgetReservationAuthorityDigest: CanonicalDigest;
  networkPolicyAuthority: AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority;
  networkPolicyAuthorityDigest: CanonicalDigest;
  providerResourceKind: AgentHostedRetrievalRuntimeResourceKind;
  providerResourceId: string;
  auxiliaryResourceIds: readonly string[];
  resourceManifestDigest: CanonicalDigest;
  contentUploadReceiptDigest: CanonicalDigest;
  creationDispatchIntentSetDigest: CanonicalDigest;
  creationTransportReceiptSetDigest: CanonicalDigest;
  creationResultSpoolReceiptSetDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  registeredAt: Instant;
  expiresAt: Instant;
  authorityDigest: CanonicalDigest;
}>;

export type CreateAgentHostedRetrievalRuntimeResourceAuthorityInput = Readonly<{
  providerResourceId: string;
  auxiliaryResourceIds: readonly string[];
  resourceManifestDigest: CanonicalDigest;
  contentUploadReceiptDigest: CanonicalDigest;
  creationDispatchIntentSetDigest: CanonicalDigest;
  creationTransportReceiptSetDigest: CanonicalDigest;
  creationResultSpoolReceiptSetDigest: CanonicalDigest;
  deletionAuthorityReceipt: AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt;
  registeredAt: Instant;
  expiresAt: Instant;
}>;

export type AgentHostedRetrievalRuntimeResourceAuthoritySet = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_SET_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorities: readonly AgentHostedRetrievalRuntimeResourceAuthority[];
  authorityDigests: readonly CanonicalDigest[];
  authoritySetDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceSetAuthorityBinding = Readonly<{
  authorityDigest: CanonicalDigest;
  registrationIntentDigest: CanonicalDigest;
  protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
  providerConfigurationDigest: CanonicalDigest;
  budgetReservationId: string;
  budgetReservationAuthorityDigest: CanonicalDigest;
  networkPolicyAuthorityDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceSetCommitment = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authoritySetDigest: CanonicalDigest;
  authorityBindings: readonly AgentHostedRetrievalRuntimeResourceSetAuthorityBinding[];
  commitmentDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceRegistrationResult = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  registrationRequestDigest: CanonicalDigest;
  registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
  authority: AgentHostedRetrievalRuntimeResourceAuthority;
  authorityDigest: CanonicalDigest;
  deletionAuthorityReceipt: AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  resultDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceReadRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  readerOwnerInstanceId: string;
  readLeaseId: string;
  minimumExpiresAt: Instant;
  requestDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceActiveState = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ACTIVE_STATE_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  activeOwnerInstanceId: string;
  claimGeneration: number;
  lifecycle: 'active';
  readLeaseNotAfter: Instant | null;
  updatedAt: Instant;
  stateDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceReadReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  readRequestDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  readLeaseId: string;
  activeOwnerInstanceId: string;
  claimGeneration: number;
  activeState: AgentHostedRetrievalRuntimeResourceActiveState;
  activeStateDigest: CanonicalDigest;
  lifecycle: 'active';
  checkedAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_LEASE_LEDGER_ROOT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  ledgerAuthorityIssuerId: string;
  ledgerAuthorityImplementationDigest: CanonicalDigest;
  ledgerRevision: number;
  planDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  readLeaseCount: number;
  readLeaseIdSetDigest: CanonicalDigest;
  readRequestDigestSetDigest: CanonicalDigest;
  readReceiptDigestSetDigest: CanonicalDigest;
  activeStateDigestSetDigest: CanonicalDigest;
  minimumClaimGeneration: number | null;
  maximumClaimGeneration: number | null;
  firstCheckedAt: Instant | null;
  lastExpiresAt: Instant | null;
  sealedAt: Instant;
  rootDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceOverdueReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OVERDUE_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  planDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  providerResourceKind: AgentHostedRetrievalRuntimeResourceKind;
  providerResourceId: string;
  resourceExpiresAt: Instant;
  detectedAt: Instant;
  disposition: 'cleanup-required';
  receiptDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_AUTHORITY_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    claimId: string;
    claimAuthorityIssuerId: string;
    claimAuthorityImplementationDigest: CanonicalDigest;
    claimLedgerRevision: number;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    authorityDigest: CanonicalDigest;
    resourceSetCommitmentDigest: CanonicalDigest;
    expectedActiveStateDigest: CanonicalDigest;
    cleanupOwnerInstanceId: string;
    claimGeneration: number;
    claimedStateDigest: CanonicalDigest;
    claimedAt: Instant;
    claimExpiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceCleanupRequest = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_REQUEST_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  readLeaseLedgerRootDigest: CanonicalDigest;
  cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  cleanupOwnerInstanceId: string;
  claimGeneration: number;
  priorActiveState: AgentHostedRetrievalRuntimeResourceActiveState;
  priorActiveStateDigest: CanonicalDigest;
  claimedLifecycle: 'cleanup-in-progress';
  runTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
  runTerminalFenceDigest: CanonicalDigest;
  cleanupReason: AgentHostedRetrievalRuntimeResourceCleanupReason;
  overdueReceiptDigest: CanonicalDigest | null;
  requestedAt: Instant;
  deletionNotBefore: Instant;
  requestDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceCleanupResourceResult =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    resourceId: string;
    resourceRole: 'auxiliary' | 'primary';
    outcome: 'already-absent' | 'deleted';
    cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    resultSpoolReceiptDigest: CanonicalDigest;
    resultSpoolDispositionReceiptDigest: CanonicalDigest;
    dispatchCreatedAt: Instant;
    completedAt: Instant;
    resultDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceCleanupReceipt = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_RECEIPT_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  cleanupRequestDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorityDigest: CanonicalDigest;
  resourceSetCommitmentDigest: CanonicalDigest;
  readLeaseLedgerRootDigest: CanonicalDigest;
  cleanupClaimAuthorityReceiptDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
  providerResourceKind: AgentHostedRetrievalRuntimeResourceKind;
  providerResourceId: string;
  auxiliaryResourceIds: readonly string[];
  runTerminalFenceDigest: CanonicalDigest;
  cleanupReason: AgentHostedRetrievalRuntimeResourceCleanupReason;
  overdueReceiptDigest: CanonicalDigest | null;
  cleanupOwnerInstanceId: string;
  claimGeneration: number;
  priorActiveStateDigest: CanonicalDigest;
  deletionNotBefore: Instant;
  resourceResults: readonly AgentHostedRetrievalRuntimeResourceCleanupResourceResult[];
  resourceResultSetDigest: CanonicalDigest;
  residualProviderResourceIds: readonly [];
  terminalLifecycle: 'cleaned';
  terminalStateDigest: CanonicalDigest;
  completedAt: Instant;
  cleanupReceiptDigest: CanonicalDigest;
}>;

export type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord = Readonly<{
  format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT;
  version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  registrationRequestDigest: CanonicalDigest;
  authorityDigest: CanonicalDigest;
  cleanupRequestDigest: CanonicalDigest;
  cleanupReceiptDigest: CanonicalDigest;
  registrationResult: AgentHostedRetrievalRuntimeResourceRegistrationResult;
  resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
  cleanupRequest: AgentHostedRetrievalRuntimeResourceCleanupRequest;
  storedCleanupClaimAuthorityReceipt: AgentHostedRetrievalRuntimeResourceCleanupClaimAuthorityReceipt;
  storedPriorActiveState: AgentHostedRetrievalRuntimeResourceActiveState;
  readLeaseLedgerRoot: AgentHostedRetrievalRuntimeResourceReadLeaseLedgerRoot;
  storedRunTerminalFence: AgentHostedRetrievalRuntimeResourceRunTerminalFence;
  overdueReceipt: AgentHostedRetrievalRuntimeResourceOverdueReceipt | null;
  cleanupReceipt: AgentHostedRetrievalRuntimeResourceCleanupReceipt;
  recordDigest: CanonicalDigest;
}>;

export const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
export const resourceKindByProtocol = Object.freeze({
  'gemini-interactions': 'gemini-file-search-store-name',
  'openai-responses': 'openai-vector-store-id',
}) satisfies Readonly<
  Record<
    AgentHostedRetrievalRuntimeResourceProtocolFamily,
    AgentHostedRetrievalRuntimeResourceKind
  >
>;

export const safe = (value: unknown, maximumBytes: number): boolean =>
  inspectAgentControlJson(value, maximumBytes).length === 0 &&
  !containsAgentControlCredentialLikeText(canonicalJsonText(value));

export const exact = (value: unknown, keys: readonly string[]): boolean =>
  hasExactAgentControlKeys(value, keys);

const registrationIntentKeys = Object.freeze([
  'format',
  'version',
  'providerConfigurationId',
  'providerConfigurationDigest',
  'protocolFamily',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'probeProgramDigest',
  'publicResourceDescriptorDigest',
  'maximumResourceLifetimeMs',
  'minimumQueryReadLeaseMs',
  'requiredOperations',
  'intentDigest',
] as const);

const budgetReservationAuthorityKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'reservePolicyDigest',
  'budgetDigest',
  'reservationId',
  'ledgerRevision',
  'demandDigest',
  'demandBytesDigest',
  'reservedAt',
  'authorityDigest',
] as const);

const networkPolicyAuthorityKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'providerConfigurationId',
  'providerConfigurationDigest',
  'protocolFamily',
  'purpose',
  'endpointClass',
  'allowedOperations',
  'authorityDigest',
] as const);

const registrationKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'registrationIntent',
  'registrationIntentDigest',
  'providerConfigurationId',
  'providerConfigurationDigest',
  'protocolFamily',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'probeProgramDigest',
  'publicResourceDescriptorDigest',
  'budgetReservationAuthority',
  'budgetReservationAuthorityDigest',
  'networkPolicyAuthority',
  'networkPolicyAuthorityDigest',
  'minimumExpiresAt',
  'requestDigest',
] as const);

const deletionProjectionKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'runtimeResourceSetId',
  'protocolFamily',
  'providerResourceKind',
  'providerResourceId',
  'auxiliaryResourceIds',
  'projectionDigest',
] as const);

const deletionReceiptKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'resourceManifestDigest',
  'providerResourceKind',
  'providerResourceId',
  'deletionRouteBinding',
  'deletionRequestProjection',
  'deletionRequestProjectionDigest',
  'registeredAt',
  'expiresAt',
  'deletionAuthorityReceiptDigest',
] as const);

const authorityKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'registrationIntentDigest',
  'providerConfigurationId',
  'providerConfigurationDigest',
  'protocolFamily',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'probeProgramDigest',
  'publicResourceDescriptorDigest',
  'budgetReservationAuthority',
  'budgetReservationAuthorityDigest',
  'networkPolicyAuthority',
  'networkPolicyAuthorityDigest',
  'providerResourceKind',
  'providerResourceId',
  'auxiliaryResourceIds',
  'resourceManifestDigest',
  'contentUploadReceiptDigest',
  'creationDispatchIntentSetDigest',
  'creationTransportReceiptSetDigest',
  'creationResultSpoolReceiptSetDigest',
  'deletionAuthorityReceiptDigest',
  'registeredAt',
  'expiresAt',
  'authorityDigest',
] as const);

const authoritySetKeys = Object.freeze([
  'format',
  'version',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorities',
  'authorityDigests',
  'authoritySetDigest',
] as const);

const resourceSetCommitmentKeys = Object.freeze([
  'format',
  'version',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authoritySetDigest',
  'authorityBindings',
  'commitmentDigest',
] as const);

const resourceSetAuthorityBindingKeys = Object.freeze([
  'authorityDigest',
  'registrationIntentDigest',
  'protocolFamily',
  'capabilityProfileId',
  'providerConfigurationDigest',
  'budgetReservationId',
  'budgetReservationAuthorityDigest',
  'networkPolicyAuthorityDigest',
] as const);

const registrationResultKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'registrationRequest',
  'authority',
  'authorityDigest',
  'deletionAuthorityReceipt',
  'deletionAuthorityReceiptDigest',
  'resultDigest',
] as const);

export const readRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'readerOwnerInstanceId',
  'readLeaseId',
  'minimumExpiresAt',
  'requestDigest',
] as const);

export const activeStateKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'activeOwnerInstanceId',
  'claimGeneration',
  'lifecycle',
  'readLeaseNotAfter',
  'updatedAt',
  'stateDigest',
] as const);

export const readReceiptKeys = Object.freeze([
  'format',
  'version',
  'readRequestDigest',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'readLeaseId',
  'activeOwnerInstanceId',
  'claimGeneration',
  'activeState',
  'activeStateDigest',
  'lifecycle',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

export const readLeaseLedgerRootKeys = Object.freeze([
  'format',
  'version',
  'ledgerAuthorityIssuerId',
  'ledgerAuthorityImplementationDigest',
  'ledgerRevision',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'readLeaseCount',
  'readLeaseIdSetDigest',
  'readRequestDigestSetDigest',
  'readReceiptDigestSetDigest',
  'activeStateDigestSetDigest',
  'minimumClaimGeneration',
  'maximumClaimGeneration',
  'firstCheckedAt',
  'lastExpiresAt',
  'sealedAt',
  'rootDigest',
] as const);

export const overdueReceiptKeys = Object.freeze([
  'format',
  'version',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'providerResourceKind',
  'providerResourceId',
  'resourceExpiresAt',
  'detectedAt',
  'disposition',
  'receiptDigest',
] as const);

export const cleanupClaimAuthorityReceiptKeys = Object.freeze([
  'format',
  'version',
  'claimId',
  'claimAuthorityIssuerId',
  'claimAuthorityImplementationDigest',
  'claimLedgerRevision',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'expectedActiveStateDigest',
  'cleanupOwnerInstanceId',
  'claimGeneration',
  'claimedStateDigest',
  'claimedAt',
  'claimExpiresAt',
  'receiptDigest',
] as const);

export const runTerminalFenceKeys = Object.freeze([
  'format',
  'version',
  'fenceId',
  'fenceAuthorityIssuerId',
  'fenceAuthorityImplementationDigest',
  'fenceLedgerRevision',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'expectedShardCount',
  'terminalShardCount',
  'terminalShardIdSetDigest',
  'terminalAttemptIdSetDigest',
  'terminalShardLeaseGenerationSetDigest',
  'terminalShardResultSetDigest',
  'terminalOutcome',
  'allShardsTerminalAt',
  'sealedAt',
  'fenceDigest',
] as const);

export const cleanupRequestKeys = Object.freeze([
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
  'readLeaseLedgerRootDigest',
  'cleanupClaimAuthorityReceiptDigest',
  'deletionAuthorityReceiptDigest',
  'cleanupOwnerInstanceId',
  'claimGeneration',
  'priorActiveState',
  'priorActiveStateDigest',
  'claimedLifecycle',
  'runTerminalFence',
  'runTerminalFenceDigest',
  'cleanupReason',
  'overdueReceiptDigest',
  'requestedAt',
  'deletionNotBefore',
  'requestDigest',
] as const);

export const cleanupResourceResultKeys = Object.freeze([
  'format',
  'version',
  'resourceId',
  'resourceRole',
  'outcome',
  'cleanupClaimAuthorityReceiptDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'resultSpoolDispositionReceiptDigest',
  'dispatchCreatedAt',
  'completedAt',
  'resultDigest',
] as const);

export const cleanupReceiptKeys = Object.freeze([
  'format',
  'version',
  'cleanupRequestDigest',
  'planDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'authorityDigest',
  'resourceSetCommitmentDigest',
  'readLeaseLedgerRootDigest',
  'cleanupClaimAuthorityReceiptDigest',
  'deletionAuthorityReceiptDigest',
  'protocolFamily',
  'providerResourceKind',
  'providerResourceId',
  'auxiliaryResourceIds',
  'runTerminalFenceDigest',
  'cleanupReason',
  'overdueReceiptDigest',
  'cleanupOwnerInstanceId',
  'claimGeneration',
  'priorActiveStateDigest',
  'deletionNotBefore',
  'resourceResults',
  'resourceResultSetDigest',
  'residualProviderResourceIds',
  'terminalLifecycle',
  'terminalStateDigest',
  'completedAt',
  'cleanupReceiptDigest',
] as const);

export const cleanupArchiveRecordKeys = Object.freeze([
  'format',
  'version',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'registrationRequestDigest',
  'authorityDigest',
  'cleanupRequestDigest',
  'cleanupReceiptDigest',
  'registrationResult',
  'resourceSetCommitment',
  'cleanupRequest',
  'storedCleanupClaimAuthorityReceipt',
  'storedPriorActiveState',
  'readLeaseLedgerRoot',
  'storedRunTerminalFence',
  'overdueReceipt',
  'cleanupReceipt',
  'recordDigest',
] as const);

export const canonicalAuxiliaryResourceIds = (
  values: readonly string[],
  providerResourceId: string
): readonly string[] => {
  const result = Object.freeze([...values].sort(compareUnicodeCodePoints));
  if (
    result.length >
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_AUXILIARY_IDS ||
    new Set(result).size !== result.length ||
    result.some(
      (value) => !isAgentControlIdentity(value) || value === providerResourceId
    ) ||
    !sameCanonicalJson(values, result)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime auxiliary resource ids are invalid.'
    );
  }
  return result;
};

export const createAgentHostedRetrievalRuntimeResourceRegistrationIntent = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceRegistrationIntent,
    | 'format'
    | 'intentDigest'
    | 'maximumResourceLifetimeMs'
    | 'minimumQueryReadLeaseMs'
    | 'requiredOperations'
    | 'version'
  >
): AgentHostedRetrievalRuntimeResourceRegistrationIntent => {
  if (
    !exact(input, registrationIntentKeys.slice(2, -4)) ||
    ![
      input.providerConfigurationId,
      input.modelId,
      input.capabilityProfileId,
    ].every(isAgentControlIdentity) ||
    ![
      input.providerConfigurationDigest,
      input.modelLineageDigest,
      input.adapterDigest,
      input.capabilityProfileDigest,
      input.probeProgramDigest,
      input.publicResourceDescriptorDigest,
    ].every(isAgentCanonicalDigest) ||
    !Object.hasOwn(resourceKindByProtocol, input.protocolFamily) ||
    ![
      'g4-provider-hosted-retrieval-core',
      'g4-provider-hosted-retrieval-document',
    ].includes(input.capabilityProfileId)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource registration intent is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_INTENT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
    maximumResourceLifetimeMs:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS,
    minimumQueryReadLeaseMs:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_READ_MINIMUM_QUERY_LEASE_MS,
    requiredOperations: Object.freeze([
      'create',
      'delete',
      'query',
      'upload',
    ] as const),
  });
  const intent = Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      intent,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource registration intent is unsafe or unbounded.'
    );
  }
  return intent;
};

export const isAgentHostedRetrievalRuntimeResourceRegistrationIntent = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRegistrationIntent => {
  if (!exact(value, registrationIntentKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      maximumResourceLifetimeMs: _maximumResourceLifetimeMs,
      minimumQueryReadLeaseMs: _minimumQueryReadLeaseMs,
      requiredOperations: _requiredOperations,
      intentDigest: _intentDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceRegistrationIntent;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceRegistrationIntent(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
      'authorityDigest' | 'format' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority => {
    if (
      !exact(input, budgetReservationAuthorityKeys.slice(2, -1)) ||
      ![input.namespaceId, input.reservationId].every(isAgentControlIdentity) ||
      ![
        input.planDigest,
        input.reservePolicyDigest,
        input.budgetDigest,
        input.demandDigest,
        input.demandBytesDigest,
      ].every(isAgentCanonicalDigest) ||
      !Number.isSafeInteger(input.ledgerRevision) ||
      input.ledgerRevision < 0 ||
      !isAgentControlInstant(input.reservedAt)
    ) {
      throw new TypeError(
        'Hosted retrieval runtime budget reservation authority is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_BUDGET_RESERVATION_AUTHORITY_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    return Object.freeze({
      ...base,
      authorityDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority => {
  if (!exact(value, budgetReservationAuthorityKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      authorityDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority;
    const recreated =
      createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
        input
      );
    return (
      authorityDigest === recreated.authorityDigest &&
      sameCanonicalJson(value, recreated)
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceBudgetReservationPlan = (
  authority: AgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  binding: AgentHostedRetrievalRuntimeResourceBudgetPlanBinding
): boolean =>
  isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(authority) &&
  exact(binding, [
    'namespaceId',
    'planDigest',
    'reservePolicyDigest',
    'budgetDigest',
  ]) &&
  authority.namespaceId === binding.namespaceId &&
  authority.planDigest === binding.planDigest &&
  authority.reservePolicyDigest === binding.reservePolicyDigest &&
  authority.budgetDigest === binding.budgetDigest;

export const createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority = (
  input: Omit<
    AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
    | 'allowedOperations'
    | 'authorityDigest'
    | 'endpointClass'
    | 'format'
    | 'purpose'
    | 'version'
  >
): AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority => {
  if (
    !exact(input, [
      'namespaceId',
      'repositoryCommit',
      'planDigest',
      'frozenRunDigest',
      'runConfigArtifactBindingDigest',
      'providerConfigurationId',
      'providerConfigurationDigest',
      'protocolFamily',
    ]) ||
    ![input.namespaceId, input.providerConfigurationId].every(
      isAgentControlIdentity
    ) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
      input.providerConfigurationDigest,
    ].every(isAgentCanonicalDigest) ||
    !Object.hasOwn(resourceKindByProtocol, input.protocolFamily)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime network policy authority is invalid.'
    );
  }
  const base = Object.freeze({
    format:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_NETWORK_POLICY_AUTHORITY_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
    purpose: 'hosted-retrieval-runtime-resource-lifecycle' as const,
    endpointClass: 'first-party-hosted' as const,
    allowedOperations: Object.freeze([
      'create',
      'delete',
      'query',
      'upload',
    ] as const),
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority => {
  if (!exact(value, networkPolicyAuthorityKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      purpose,
      endpointClass,
      allowedOperations,
      authorityDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority;
    const recreated =
      createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority(input);
    return (
      purpose === recreated.purpose &&
      endpointClass === recreated.endpointClass &&
      sameCanonicalJson(allowedOperations, recreated.allowedOperations) &&
      authorityDigest === recreated.authorityDigest &&
      sameCanonicalJson(value, recreated)
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceNetworkPolicyFrozenBinding =
  (
    authority: AgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
    binding: AgentHostedRetrievalRuntimeResourceNetworkPolicyFrozenBinding
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority(authority) &&
    exact(binding, [
      'namespaceId',
      'repositoryCommit',
      'planDigest',
      'frozenRunDigest',
      'runConfigArtifactBindingDigest',
      'providerConfigurationId',
      'providerConfigurationDigest',
      'protocolFamily',
    ]) &&
    authority.namespaceId === binding.namespaceId &&
    authority.repositoryCommit === binding.repositoryCommit &&
    authority.planDigest === binding.planDigest &&
    authority.frozenRunDigest === binding.frozenRunDigest &&
    authority.runConfigArtifactBindingDigest ===
      binding.runConfigArtifactBindingDigest &&
    authority.providerConfigurationId === binding.providerConfigurationId &&
    authority.providerConfigurationDigest ===
      binding.providerConfigurationDigest &&
    authority.protocolFamily === binding.protocolFamily;

const registrationBase = (
  input: CreateAgentHostedRetrievalRuntimeResourceRegistrationRequestInput
) =>
  Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_REQUEST_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    ...input,
  });

export const createAgentHostedRetrievalRuntimeResourceRegistrationRequest = (
  input: CreateAgentHostedRetrievalRuntimeResourceRegistrationRequestInput
): AgentHostedRetrievalRuntimeResourceRegistrationRequest => {
  if (
    !exact(input, registrationKeys.slice(2, -1)) ||
    ![
      input.namespaceId,
      input.runtimeResourceSetId,
      input.providerConfigurationId,
      input.modelId,
      input.capabilityProfileId,
    ].every(isAgentControlIdentity) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    !isAgentHostedRetrievalRuntimeResourceRegistrationIntent(
      input.registrationIntent
    ) ||
    input.registrationIntentDigest !== input.registrationIntent.intentDigest ||
    input.registrationIntent.providerConfigurationId !==
      input.providerConfigurationId ||
    input.registrationIntent.providerConfigurationDigest !==
      input.providerConfigurationDigest ||
    input.registrationIntent.protocolFamily !== input.protocolFamily ||
    input.registrationIntent.modelId !== input.modelId ||
    input.registrationIntent.modelLineageDigest !== input.modelLineageDigest ||
    input.registrationIntent.adapterDigest !== input.adapterDigest ||
    input.registrationIntent.capabilityProfileId !==
      input.capabilityProfileId ||
    input.registrationIntent.capabilityProfileDigest !==
      input.capabilityProfileDigest ||
    input.registrationIntent.probeProgramDigest !== input.probeProgramDigest ||
    input.registrationIntent.publicResourceDescriptorDigest !==
      input.publicResourceDescriptorDigest ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
      input.registrationIntentDigest,
      input.providerConfigurationDigest,
      input.modelLineageDigest,
      input.adapterDigest,
      input.capabilityProfileDigest,
      input.probeProgramDigest,
      input.publicResourceDescriptorDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
      input.budgetReservationAuthority
    ) ||
    input.budgetReservationAuthorityDigest !==
      input.budgetReservationAuthority.authorityDigest ||
    input.budgetReservationAuthority.namespaceId !== input.namespaceId ||
    input.budgetReservationAuthority.planDigest !== input.planDigest ||
    !isAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority(
      input.networkPolicyAuthority
    ) ||
    input.networkPolicyAuthorityDigest !==
      input.networkPolicyAuthority.authorityDigest ||
    input.networkPolicyAuthority.namespaceId !== input.namespaceId ||
    input.networkPolicyAuthority.repositoryCommit !== input.repositoryCommit ||
    input.networkPolicyAuthority.planDigest !== input.planDigest ||
    input.networkPolicyAuthority.frozenRunDigest !== input.frozenRunDigest ||
    input.networkPolicyAuthority.runConfigArtifactBindingDigest !==
      input.runConfigArtifactBindingDigest ||
    input.networkPolicyAuthority.providerConfigurationId !==
      input.providerConfigurationId ||
    input.networkPolicyAuthority.providerConfigurationDigest !==
      input.providerConfigurationDigest ||
    input.networkPolicyAuthority.protocolFamily !== input.protocolFamily ||
    !Object.hasOwn(resourceKindByProtocol, input.protocolFamily) ||
    ![
      'g4-provider-hosted-retrieval-core',
      'g4-provider-hosted-retrieval-document',
    ].includes(input.capabilityProfileId) ||
    !isAgentControlInstant(input.minimumExpiresAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource registration request is invalid.'
    );
  }
  const base = registrationBase(input);
  const request = Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      request,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource registration request is unsafe or unbounded.'
    );
  }
  return request;
};

export const isAgentHostedRetrievalRuntimeResourceRegistrationRequest = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRegistrationRequest => {
  if (!exact(value, registrationKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      requestDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceRegistrationRequest;
    return (
      sameCanonicalJson(
        value,
        createAgentHostedRetrievalRuntimeResourceRegistrationRequest(input)
      ) && requestDigest === digestAgentCanonicalValue(registrationBase(input))
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection =
  (input: {
    registrationRequestDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
  }): AgentHostedRetrievalRuntimeResourceDeletionRequestProjection => {
    if (
      !exact(input, [
        'registrationRequestDigest',
        'runtimeResourceSetId',
        'protocolFamily',
        'providerResourceId',
        'auxiliaryResourceIds',
      ]) ||
      !isAgentCanonicalDigest(input.registrationRequestDigest) ||
      ![input.runtimeResourceSetId, input.providerResourceId].every(
        isAgentControlIdentity
      ) ||
      !Object.hasOwn(resourceKindByProtocol, input.protocolFamily)
    ) {
      throw new TypeError(
        'Hosted retrieval runtime deletion projection is invalid.'
      );
    }
    const auxiliaryResourceIds = canonicalAuxiliaryResourceIds(
      input.auxiliaryResourceIds,
      input.providerResourceId
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      registrationRequestDigest: input.registrationRequestDigest,
      runtimeResourceSetId: input.runtimeResourceSetId,
      protocolFamily: input.protocolFamily,
      providerResourceKind: resourceKindByProtocol[input.protocolFamily],
      providerResourceId: input.providerResourceId,
      auxiliaryResourceIds,
    });
    return Object.freeze({
      ...base,
      projectionDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentHostedRetrievalRuntimeResourceDeletionRequestProjection = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceDeletionRequestProjection => {
  if (!exact(value, deletionProjectionKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      providerResourceKind,
      projectionDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceDeletionRequestProjection;
    const canonical =
      createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection(input);
    return (
      providerResourceKind === canonical.providerResourceKind &&
      projectionDigest === canonical.projectionDigest &&
      sameCanonicalJson(value, canonical)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt =
  (input: {
    registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
    resourceManifestDigest: CanonicalDigest;
    deletionRequestProjection: AgentHostedRetrievalRuntimeResourceDeletionRequestProjection;
    registeredAt: Instant;
    expiresAt: Instant;
  }): AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt => {
    if (
      !exact(input, [
        'registrationRequest',
        'resourceManifestDigest',
        'deletionRequestProjection',
        'registeredAt',
        'expiresAt',
      ]) ||
      !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(
        input.registrationRequest
      ) ||
      !isAgentCanonicalDigest(input.resourceManifestDigest) ||
      !isAgentHostedRetrievalRuntimeResourceDeletionRequestProjection(
        input.deletionRequestProjection
      ) ||
      input.deletionRequestProjection.registrationRequestDigest !==
        input.registrationRequest.requestDigest ||
      input.deletionRequestProjection.runtimeResourceSetId !==
        input.registrationRequest.runtimeResourceSetId ||
      input.deletionRequestProjection.protocolFamily !==
        input.registrationRequest.protocolFamily ||
      !isAgentControlInstant(input.registeredAt) ||
      !isAgentControlInstant(input.expiresAt) ||
      Date.parse(input.expiresAt) <= Date.parse(input.registeredAt) ||
      Date.parse(input.expiresAt) - Date.parse(input.registeredAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS ||
      Date.parse(input.expiresAt) <
        Date.parse(input.registrationRequest.minimumExpiresAt)
    ) {
      throw new TypeError(
        'Hosted retrieval runtime deletion authority receipt is invalid.'
      );
    }
    const projection = input.deletionRequestProjection;
    const request = input.registrationRequest;
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      registrationRequestDigest: request.requestDigest,
      planDigest: request.planDigest,
      runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
      runtimeResourceSetId: request.runtimeResourceSetId,
      resourceManifestDigest: input.resourceManifestDigest,
      providerResourceKind: projection.providerResourceKind,
      providerResourceId: projection.providerResourceId,
      deletionRouteBinding: 'hosted-retrieval-runtime-resource.delete' as const,
      deletionRequestProjection: projection,
      deletionRequestProjectionDigest: projection.projectionDigest,
      registeredAt: input.registeredAt,
      expiresAt: input.expiresAt,
    });
    return Object.freeze({
      ...base,
      deletionAuthorityReceiptDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt => {
  if (!exact(value, deletionReceiptKeys)) return false;
  const receipt =
    value as AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt;
  const { deletionAuthorityReceiptDigest, ...base } = receipt;
  return (
    receipt.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT &&
    receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    isAgentCanonicalDigest(receipt.registrationRequestDigest) &&
    isAgentCanonicalDigest(receipt.planDigest) &&
    isAgentCanonicalDigest(receipt.runConfigArtifactBindingDigest) &&
    isAgentControlIdentity(receipt.runtimeResourceSetId) &&
    isAgentCanonicalDigest(receipt.resourceManifestDigest) &&
    isAgentHostedRetrievalRuntimeResourceDeletionRequestProjection(
      receipt.deletionRequestProjection
    ) &&
    receipt.deletionRequestProjection.registrationRequestDigest ===
      receipt.registrationRequestDigest &&
    receipt.deletionRequestProjection.runtimeResourceSetId ===
      receipt.runtimeResourceSetId &&
    receipt.deletionRequestProjectionDigest ===
      receipt.deletionRequestProjection.projectionDigest &&
    receipt.deletionRequestProjection.providerResourceKind ===
      receipt.providerResourceKind &&
    receipt.deletionRequestProjection.providerResourceId ===
      receipt.providerResourceId &&
    receipt.deletionRouteBinding ===
      'hosted-retrieval-runtime-resource.delete' &&
    isAgentControlInstant(receipt.registeredAt) &&
    isAgentControlInstant(receipt.expiresAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(receipt.registeredAt) &&
    Date.parse(receipt.expiresAt) - Date.parse(receipt.registeredAt) <=
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS &&
    deletionAuthorityReceiptDigest === digestAgentCanonicalValue(base) &&
    safe(
      receipt,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  );
};

export const createAgentHostedRetrievalRuntimeResourceAuthority = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  input: CreateAgentHostedRetrievalRuntimeResourceAuthorityInput
): AgentHostedRetrievalRuntimeResourceAuthority => {
  if (
    !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request) ||
    !exact(input, [
      'providerResourceId',
      'auxiliaryResourceIds',
      'resourceManifestDigest',
      'contentUploadReceiptDigest',
      'creationDispatchIntentSetDigest',
      'creationTransportReceiptSetDigest',
      'creationResultSpoolReceiptSetDigest',
      'deletionAuthorityReceipt',
      'registeredAt',
      'expiresAt',
    ]) ||
    !isAgentControlIdentity(input.providerResourceId) ||
    ![
      input.resourceManifestDigest,
      input.contentUploadReceiptDigest,
      input.creationDispatchIntentSetDigest,
      input.creationTransportReceiptSetDigest,
      input.creationResultSpoolReceiptSetDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt(
      input.deletionAuthorityReceipt
    ) ||
    !isAgentControlInstant(input.registeredAt) ||
    !isAgentControlInstant(input.expiresAt)
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource authority input is invalid.'
    );
  }
  const auxiliaryResourceIds = canonicalAuxiliaryResourceIds(
    input.auxiliaryResourceIds,
    input.providerResourceId
  );
  const deletion = input.deletionAuthorityReceipt;
  if (
    deletion.registrationRequestDigest !== request.requestDigest ||
    deletion.planDigest !== request.planDigest ||
    deletion.runConfigArtifactBindingDigest !==
      request.runConfigArtifactBindingDigest ||
    deletion.runtimeResourceSetId !== request.runtimeResourceSetId ||
    deletion.resourceManifestDigest !== input.resourceManifestDigest ||
    deletion.providerResourceId !== input.providerResourceId ||
    deletion.providerResourceKind !==
      resourceKindByProtocol[request.protocolFamily] ||
    !sameCanonicalJson(
      deletion.deletionRequestProjection.auxiliaryResourceIds,
      auxiliaryResourceIds
    ) ||
    deletion.registeredAt !== input.registeredAt ||
    deletion.expiresAt !== input.expiresAt
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource deletion authority drifted.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    registrationRequestDigest: request.requestDigest,
    planDigest: request.planDigest,
    frozenRunDigest: request.frozenRunDigest,
    runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
    runtimeResourceSetId: request.runtimeResourceSetId,
    registrationIntentDigest: request.registrationIntentDigest,
    providerConfigurationId: request.providerConfigurationId,
    providerConfigurationDigest: request.providerConfigurationDigest,
    protocolFamily: request.protocolFamily,
    modelId: request.modelId,
    modelLineageDigest: request.modelLineageDigest,
    adapterDigest: request.adapterDigest,
    capabilityProfileId: request.capabilityProfileId,
    capabilityProfileDigest: request.capabilityProfileDigest,
    probeProgramDigest: request.probeProgramDigest,
    publicResourceDescriptorDigest: request.publicResourceDescriptorDigest,
    budgetReservationAuthority: request.budgetReservationAuthority,
    budgetReservationAuthorityDigest: request.budgetReservationAuthorityDigest,
    networkPolicyAuthority: request.networkPolicyAuthority,
    networkPolicyAuthorityDigest: request.networkPolicyAuthorityDigest,
    providerResourceKind: deletion.providerResourceKind,
    providerResourceId: input.providerResourceId,
    auxiliaryResourceIds,
    resourceManifestDigest: input.resourceManifestDigest,
    contentUploadReceiptDigest: input.contentUploadReceiptDigest,
    creationDispatchIntentSetDigest: input.creationDispatchIntentSetDigest,
    creationTransportReceiptSetDigest: input.creationTransportReceiptSetDigest,
    creationResultSpoolReceiptSetDigest:
      input.creationResultSpoolReceiptSetDigest,
    deletionAuthorityReceiptDigest: deletion.deletionAuthorityReceiptDigest,
    registeredAt: input.registeredAt,
    expiresAt: input.expiresAt,
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      authority,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource authority is unsafe or unbounded.'
    );
  }
  return authority;
};

export const isAgentHostedRetrievalRuntimeResourceAuthority = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceAuthority => {
  if (!exact(value, authorityKeys)) return false;
  try {
    const authority = value as AgentHostedRetrievalRuntimeResourceAuthority;
    const { authorityDigest, ...base } = authority;
    return (
      authority.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_FORMAT &&
      authority.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        authority.runtimeResourceSetId,
        authority.providerConfigurationId,
        authority.modelId,
        authority.capabilityProfileId,
        authority.budgetReservationAuthority.reservationId,
        authority.providerResourceId,
      ].every(isAgentControlIdentity) &&
      [
        authority.registrationRequestDigest,
        authority.planDigest,
        authority.frozenRunDigest,
        authority.runConfigArtifactBindingDigest,
        authority.registrationIntentDigest,
        authority.providerConfigurationDigest,
        authority.modelLineageDigest,
        authority.adapterDigest,
        authority.capabilityProfileDigest,
        authority.probeProgramDigest,
        authority.publicResourceDescriptorDigest,
        authority.budgetReservationAuthorityDigest,
        authority.networkPolicyAuthorityDigest,
        authority.resourceManifestDigest,
        authority.contentUploadReceiptDigest,
        authority.creationDispatchIntentSetDigest,
        authority.creationTransportReceiptSetDigest,
        authority.creationResultSpoolReceiptSetDigest,
        authority.deletionAuthorityReceiptDigest,
        authority.authorityDigest,
      ].every(isAgentCanonicalDigest) &&
      isAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority(
        authority.budgetReservationAuthority
      ) &&
      authority.budgetReservationAuthorityDigest ===
        authority.budgetReservationAuthority.authorityDigest &&
      authority.budgetReservationAuthority.planDigest ===
        authority.planDigest &&
      isAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority(
        authority.networkPolicyAuthority
      ) &&
      authority.networkPolicyAuthorityDigest ===
        authority.networkPolicyAuthority.authorityDigest &&
      authority.networkPolicyAuthority.planDigest === authority.planDigest &&
      authority.networkPolicyAuthority.frozenRunDigest ===
        authority.frozenRunDigest &&
      authority.networkPolicyAuthority.runConfigArtifactBindingDigest ===
        authority.runConfigArtifactBindingDigest &&
      authority.networkPolicyAuthority.providerConfigurationId ===
        authority.providerConfigurationId &&
      authority.networkPolicyAuthority.providerConfigurationDigest ===
        authority.providerConfigurationDigest &&
      authority.networkPolicyAuthority.protocolFamily ===
        authority.protocolFamily &&
      authority.budgetReservationAuthority.namespaceId ===
        authority.networkPolicyAuthority.namespaceId &&
      Object.hasOwn(resourceKindByProtocol, authority.protocolFamily) &&
      authority.providerResourceKind ===
        resourceKindByProtocol[authority.protocolFamily] &&
      sameCanonicalJson(
        authority.auxiliaryResourceIds,
        canonicalAuxiliaryResourceIds(
          authority.auxiliaryResourceIds,
          authority.providerResourceId
        )
      ) &&
      isAgentControlInstant(authority.registeredAt) &&
      isAgentControlInstant(authority.expiresAt) &&
      Date.parse(authority.expiresAt) > Date.parse(authority.registeredAt) &&
      Date.parse(authority.expiresAt) - Date.parse(authority.registeredAt) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_MAXIMUM_LIFETIME_MS &&
      authorityDigest === digestAgentCanonicalValue(base) &&
      safe(
        authority,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceRegistration = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest
): boolean =>
  isAgentHostedRetrievalRuntimeResourceAuthority(authority) &&
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request) &&
  authority.registrationRequestDigest === request.requestDigest &&
  authority.planDigest === request.planDigest &&
  authority.frozenRunDigest === request.frozenRunDigest &&
  authority.runConfigArtifactBindingDigest ===
    request.runConfigArtifactBindingDigest &&
  authority.runtimeResourceSetId === request.runtimeResourceSetId &&
  authority.registrationIntentDigest === request.registrationIntentDigest &&
  authority.providerConfigurationId === request.providerConfigurationId &&
  authority.providerConfigurationDigest ===
    request.providerConfigurationDigest &&
  authority.protocolFamily === request.protocolFamily &&
  authority.modelId === request.modelId &&
  authority.modelLineageDigest === request.modelLineageDigest &&
  authority.adapterDigest === request.adapterDigest &&
  authority.capabilityProfileId === request.capabilityProfileId &&
  authority.capabilityProfileDigest === request.capabilityProfileDigest &&
  authority.probeProgramDigest === request.probeProgramDigest &&
  authority.publicResourceDescriptorDigest ===
    request.publicResourceDescriptorDigest &&
  sameCanonicalJson(
    authority.budgetReservationAuthority,
    request.budgetReservationAuthority
  ) &&
  authority.budgetReservationAuthorityDigest ===
    request.budgetReservationAuthorityDigest &&
  sameCanonicalJson(
    authority.networkPolicyAuthority,
    request.networkPolicyAuthority
  ) &&
  authority.networkPolicyAuthorityDigest ===
    request.networkPolicyAuthorityDigest &&
  Date.parse(authority.expiresAt) >= Date.parse(request.minimumExpiresAt);

export const matchAgentHostedRetrievalRuntimeResourceAuthority = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  program: AgentCapabilityProbeProgram,
  binding: Readonly<{
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    providerConfigurationId: string;
    modelId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    observedAt: Instant;
  }>
): boolean =>
  isAgentHostedRetrievalRuntimeResourceAuthority(authority) &&
  isAgentCapabilityProbeProgram(program) &&
  program.profileProjection.capabilityId === 'provider.hosted-retrieval' &&
  authority.probeProgramDigest === program.programDigest &&
  authority.capabilityProfileId ===
    program.profileProjection.capabilityProfileId &&
  authority.capabilityProfileDigest ===
    program.profileProjection.capabilityProfileDigest &&
  authority.publicResourceDescriptorDigest ===
    program.providerRequestIntent.publicProbeResource?.descriptorDigest &&
  authority.planDigest === binding.planDigest &&
  authority.frozenRunDigest === binding.frozenRunDigest &&
  authority.runConfigArtifactBindingDigest ===
    binding.runConfigArtifactBindingDigest &&
  authority.runtimeResourceSetId === binding.runtimeResourceSetId &&
  authority.protocolFamily === binding.protocolFamily &&
  authority.providerConfigurationId === binding.providerConfigurationId &&
  authority.modelId === binding.modelId &&
  authority.modelLineageDigest === binding.modelLineageDigest &&
  authority.adapterDigest === binding.adapterDigest &&
  isAgentControlInstant(binding.observedAt) &&
  Date.parse(authority.registeredAt) <= Date.parse(binding.observedAt) &&
  Date.parse(authority.expiresAt) > Date.parse(binding.observedAt);

const runtimeAuthorityKey = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority
): string =>
  `${authority.protocolFamily}\u0000${authority.capabilityProfileId}`;

export const expectedRuntimeAuthorityKeys = Object.freeze([
  'gemini-interactions\u0000g4-provider-hosted-retrieval-core',
  'gemini-interactions\u0000g4-provider-hosted-retrieval-document',
  'openai-responses\u0000g4-provider-hosted-retrieval-core',
  'openai-responses\u0000g4-provider-hosted-retrieval-document',
]);

export const createAgentHostedRetrievalRuntimeResourceAuthoritySet = (input: {
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  authorities: readonly AgentHostedRetrievalRuntimeResourceAuthority[];
}): AgentHostedRetrievalRuntimeResourceAuthoritySet => {
  if (
    !exact(input, [
      'planDigest',
      'frozenRunDigest',
      'runConfigArtifactBindingDigest',
      'runtimeResourceSetId',
      'authorities',
    ]) ||
    ![
      input.planDigest,
      input.frozenRunDigest,
      input.runConfigArtifactBindingDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlIdentity(input.runtimeResourceSetId) ||
    input.authorities.length !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    input.authorities.some(
      (authority) =>
        !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
        authority.planDigest !== input.planDigest ||
        authority.frozenRunDigest !== input.frozenRunDigest ||
        authority.runConfigArtifactBindingDigest !==
          input.runConfigArtifactBindingDigest ||
        authority.runtimeResourceSetId !== input.runtimeResourceSetId
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource authority set is invalid.'
    );
  }
  const authorities = Object.freeze(
    [...input.authorities].sort((left, right) =>
      compareUnicodeCodePoints(
        runtimeAuthorityKey(left),
        runtimeAuthorityKey(right)
      )
    )
  );
  if (
    !sameCanonicalJson(
      authorities.map(runtimeAuthorityKey),
      expectedRuntimeAuthorityKeys
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime resource authority set is incomplete.'
    );
  }
  const authorityDigests = Object.freeze(
    authorities.map(({ authorityDigest }) => authorityDigest)
  );
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_AUTHORITY_SET_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    planDigest: input.planDigest,
    frozenRunDigest: input.frozenRunDigest,
    runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
    runtimeResourceSetId: input.runtimeResourceSetId,
    authorities,
    authorityDigests,
  });
  return Object.freeze({
    ...base,
    authoritySetDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceAuthoritySet = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceAuthoritySet => {
  if (!exact(value, authoritySetKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      authorityDigests: _authorityDigests,
      authoritySetDigest: _authoritySetDigest,
      ...input
    } = value as AgentHostedRetrievalRuntimeResourceAuthoritySet;
    return sameCanonicalJson(
      value,
      createAgentHostedRetrievalRuntimeResourceAuthoritySet(input)
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourceSetCommitment = (
  authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet
): AgentHostedRetrievalRuntimeResourceSetCommitment => {
  if (!isAgentHostedRetrievalRuntimeResourceAuthoritySet(authoritySet)) {
    throw new TypeError(
      'Hosted retrieval runtime resource set commitment input is invalid.'
    );
  }
  const authorityBindings = Object.freeze(
    authoritySet.authorities.map((authority) =>
      Object.freeze({
        authorityDigest: authority.authorityDigest,
        registrationIntentDigest: authority.registrationIntentDigest,
        protocolFamily: authority.protocolFamily,
        capabilityProfileId: authority.capabilityProfileId,
        providerConfigurationDigest: authority.providerConfigurationDigest,
        budgetReservationId: authority.budgetReservationAuthority.reservationId,
        budgetReservationAuthorityDigest:
          authority.budgetReservationAuthorityDigest,
        networkPolicyAuthorityDigest: authority.networkPolicyAuthorityDigest,
      })
    )
  );
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    planDigest: authoritySet.planDigest,
    frozenRunDigest: authoritySet.frozenRunDigest,
    runConfigArtifactBindingDigest: authoritySet.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authoritySet.runtimeResourceSetId,
    authoritySetDigest: authoritySet.authoritySetDigest,
    authorityBindings,
  });
  return Object.freeze({
    ...base,
    commitmentDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHostedRetrievalRuntimeResourceSetCommitment = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceSetCommitment => {
  if (!exact(value, resourceSetCommitmentKeys)) return false;
  const commitment = value as AgentHostedRetrievalRuntimeResourceSetCommitment;
  const { commitmentDigest, ...base } = commitment;
  return (
    commitment.format ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT &&
    commitment.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
    [
      commitment.planDigest,
      commitment.frozenRunDigest,
      commitment.runConfigArtifactBindingDigest,
      commitment.authoritySetDigest,
      commitment.commitmentDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlIdentity(commitment.runtimeResourceSetId) &&
    Array.isArray(commitment.authorityBindings) &&
    commitment.authorityBindings.length ===
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT &&
    commitment.authorityBindings.every(
      (binding) =>
        exact(binding, resourceSetAuthorityBindingKeys) &&
        Object.hasOwn(resourceKindByProtocol, binding.protocolFamily) &&
        [
          'g4-provider-hosted-retrieval-core',
          'g4-provider-hosted-retrieval-document',
        ].includes(binding.capabilityProfileId) &&
        isAgentControlIdentity(binding.budgetReservationId) &&
        [
          binding.authorityDigest,
          binding.registrationIntentDigest,
          binding.providerConfigurationDigest,
          binding.budgetReservationAuthorityDigest,
          binding.networkPolicyAuthorityDigest,
        ].every(isAgentCanonicalDigest)
    ) &&
    sameCanonicalJson(
      commitment.authorityBindings.map(
        ({ protocolFamily, capabilityProfileId }) =>
          `${protocolFamily}\u0000${capabilityProfileId}`
      ),
      expectedRuntimeAuthorityKeys
    ) &&
    new Set(
      commitment.authorityBindings.map(({ authorityDigest }) => authorityDigest)
    ).size === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT &&
    commitmentDigest === digestAgentCanonicalValue(base) &&
    safe(
      commitment,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
    )
  );
};

export const matchAgentHostedRetrievalRuntimeResourceSetCommitment = (
  commitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet
): boolean => {
  try {
    return (
      isAgentHostedRetrievalRuntimeResourceSetCommitment(commitment) &&
      isAgentHostedRetrievalRuntimeResourceAuthoritySet(authoritySet) &&
      sameCanonicalJson(
        commitment,
        createAgentHostedRetrievalRuntimeResourceSetCommitment(authoritySet)
      )
    );
  } catch {
    return false;
  }
};

export const matchAgentHostedRetrievalRuntimeResourceAuthoritySetCommitment = (
  commitment: AgentHostedRetrievalRuntimeResourceSetCommitment,
  authority: AgentHostedRetrievalRuntimeResourceAuthority
): boolean =>
  isAgentHostedRetrievalRuntimeResourceSetCommitment(commitment) &&
  isAgentHostedRetrievalRuntimeResourceAuthority(authority) &&
  commitment.planDigest === authority.planDigest &&
  commitment.frozenRunDigest === authority.frozenRunDigest &&
  commitment.runConfigArtifactBindingDigest ===
    authority.runConfigArtifactBindingDigest &&
  commitment.runtimeResourceSetId === authority.runtimeResourceSetId &&
  commitment.authorityBindings.some(
    (binding) =>
      binding.authorityDigest === authority.authorityDigest &&
      binding.registrationIntentDigest === authority.registrationIntentDigest &&
      binding.protocolFamily === authority.protocolFamily &&
      binding.capabilityProfileId === authority.capabilityProfileId &&
      binding.providerConfigurationDigest ===
        authority.providerConfigurationDigest &&
      binding.budgetReservationId ===
        authority.budgetReservationAuthority.reservationId &&
      binding.budgetReservationAuthorityDigest ===
        authority.budgetReservationAuthorityDigest &&
      binding.networkPolicyAuthorityDigest ===
        authority.networkPolicyAuthorityDigest
  );

export const createAgentHostedRetrievalRuntimeResourceRegistrationResult = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  deletionAuthorityReceipt: AgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt
): AgentHostedRetrievalRuntimeResourceRegistrationResult => {
  if (
    !isAgentHostedRetrievalRuntimeResourceRegistrationRequest(request) ||
    !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
    !isAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt(
      deletionAuthorityReceipt
    ) ||
    !matchAgentHostedRetrievalRuntimeResourceRegistration(authority, request) ||
    deletionAuthorityReceipt.registrationRequestDigest !==
      request.requestDigest ||
    deletionAuthorityReceipt.planDigest !== request.planDigest ||
    deletionAuthorityReceipt.runConfigArtifactBindingDigest !==
      request.runConfigArtifactBindingDigest ||
    deletionAuthorityReceipt.runtimeResourceSetId !==
      request.runtimeResourceSetId ||
    deletionAuthorityReceipt.resourceManifestDigest !==
      authority.resourceManifestDigest ||
    deletionAuthorityReceipt.providerResourceKind !==
      authority.providerResourceKind ||
    deletionAuthorityReceipt.providerResourceId !==
      authority.providerResourceId ||
    !sameCanonicalJson(
      deletionAuthorityReceipt.deletionRequestProjection,
      createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection({
        registrationRequestDigest: request.requestDigest,
        runtimeResourceSetId: request.runtimeResourceSetId,
        protocolFamily: request.protocolFamily,
        providerResourceId: authority.providerResourceId,
        auxiliaryResourceIds: authority.auxiliaryResourceIds,
      })
    ) ||
    deletionAuthorityReceipt.registeredAt !== authority.registeredAt ||
    deletionAuthorityReceipt.expiresAt !== authority.expiresAt ||
    authority.deletionAuthorityReceiptDigest !==
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest
  ) {
    throw new TypeError(
      'Hosted retrieval runtime registration result is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    registrationRequestDigest: request.requestDigest,
    registrationRequest: request,
    authority,
    authorityDigest: authority.authorityDigest,
    deletionAuthorityReceipt,
    deletionAuthorityReceiptDigest:
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
  });
  const result = Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
  if (
    !safe(
      result,
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES
    )
  ) {
    throw new TypeError(
      'Hosted retrieval runtime registration result is unsafe or unbounded.'
    );
  }
  return result;
};

export const isAgentHostedRetrievalRuntimeResourceRegistrationResult = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRegistrationResult => {
  if (!exact(value, registrationResultKeys)) return false;
  try {
    const result =
      value as AgentHostedRetrievalRuntimeResourceRegistrationResult;
    return sameCanonicalJson(
      result,
      createAgentHostedRetrievalRuntimeResourceRegistrationResult(
        result.registrationRequest,
        result.authority,
        result.deletionAuthorityReceipt
      )
    );
  } catch {
    return false;
  }
};
