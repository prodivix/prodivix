import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import { resolveAgentCapabilityProbeProviderRequestCodecAvailability } from '../providers/agentCapabilityProbeProviderRequest';
import {
  isAgentCapabilityProbeProviderResourceAuthority,
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  isAgentCapabilityProbeProviderResourceCleanupReceipt,
  isAgentCapabilityProbeProviderResourceCleanupResponse,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  matchAgentCapabilityProbeProviderResourceCleanupResponse,
  type AgentCapabilityProbeProviderResourceAuthority,
  type AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  type AgentCapabilityProbeProviderResourceCleanupReceipt,
  type AgentCapabilityProbeProviderResourceCleanupResponse,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
} from '../providers/agentCapabilityProbeProviderResource';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_RECORD_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
} from '../providers/agentHostedRetrievalRuntimeResource';
import type {
  AgentModelLineage,
  AgentProviderConfigurationIdentity,
} from '../providers/agentProvider.types';
import {
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import {
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultResolveRequest,
  isAgentNativeProviderStateVaultRetirementReceipt,
  isAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultResolveRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultSealRequestProjection,
} from '../providers/agentNativeProviderStateVault';
import {
  isAgentEvaluationCapabilityEffectSourceReceipt,
  isAgentEvaluationCapabilityPreEffectIntent,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilityPreEffectIntent,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS,
  isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget,
  isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
  type AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
} from './agentEvaluationCapabilityEffectProviderJournal';
import {
  createAgentEvaluationProductionCapabilityProbeEvidence,
  isAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import {
  isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  type AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact,
  type AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  type AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
} from './agentEvaluationNativeOptionalCapabilityBootstrap';
import type {
  AgentEvaluationProductionCapabilityProbeEvidence,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import {
  isAgentEvaluationProviderCapabilityFactAuthority,
  isAgentEvaluationProviderCapabilityObservedFact,
  isAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentEvaluationProviderCapabilityFactAuthority,
  type AgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
} from './agentEvaluationProviderCapabilityObservation';

export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-archive-record' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-probe-reference-receipt-archive-record' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-archive-record' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-source-archive-record' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-archive-record' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-archive-record' as const;
export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION =
  1 as const;

export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-request' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_STAGE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-stage' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_OWNER_ADMISSION_FORMAT =
  'prodivix.agent-evaluation-capability-probe-owner-admission' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-capability-probe-dispatch-ack' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-response' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-health' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-admission' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-dispatch-ack' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt' as const;

export type AgentEvaluationCapabilityProbeAdmissionRequest = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT;
  version: 1;
  namespaceId: string;
  repositoryCommit: string;
  providerConfiguration: AgentProviderConfigurationIdentity;
  modelLineage: AgentModelLineage;
  qualificationCapabilityProfileId: string;
  qualificationCapabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  declaredCapabilityProfileDigests: readonly CanonicalDigest[];
  probeProgram: AgentCapabilityProbeProgram;
  probeProviderResourceAuthority: AgentCapabilityProbeProviderResourceAuthority | null;
  minimumExpiresAt: string;
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeAdmissionResponse = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT;
  version: 1;
  requestDigest: CanonicalDigest;
  probeEvidence: AgentEvaluationProductionCapabilityProbeEvidence;
  ownerImplementationDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  admissionReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceRegistrationRequest = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_REQUEST_FORMAT;
  version: 1;
  namespaceId: string;
  repositoryCommit: string;
  sourceAuthorityKind: 'shared-durable-capability';
  sourceKind:
    'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  routeBinding: string;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  protocolFamily:
    'openai-responses' | 'anthropic-messages' | 'gemini-interactions';
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  hostedRetrievalRuntimeResourceRegistrationIntentDigest?: CanonicalDigest;
  minimumExpiresAt: string;
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceOwnerHealth = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT;
  version: 1;
  requestDigest: CanonicalDigest;
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  sourceKind:
    'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  routeBinding: string;
  status: 'ready';
  checkedAt: string;
  expiresAt: string;
  healthDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceRegistrationReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT;
  version: 1;
  namespaceId: string;
  repositoryCommit: string;
  requestDigest: CanonicalDigest;
  sourceAuthorityKind: 'shared-durable-capability';
  sourceKind:
    'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  routeBinding: string;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  protocolFamily:
    'openai-responses' | 'anthropic-messages' | 'gemini-interactions';
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  registrationAuthorityIssuerId: string;
  ownerHealthDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  registeredAt: string;
  expiresAt: string;
  registrationReceiptDigest: CanonicalDigest;
}>;

export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS = Object.freeze([
  'probe-request',
  'probe-response',
  'dispatch',
  'transport',
  'encrypted-response-spool',
  'normalized-event-set',
] as const);

export type AgentEvaluationCapabilityProbeReferenceKind =
  (typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS)[number];

export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES =
  Object.freeze([
    'capabilityProbeAdmissions',
    'capabilityProbeReferenceReceipts',
    'runtimeFactSourceOwnerRegistrations',
    'capabilityProbeProviderResourceCleanups',
    'hostedRetrievalRuntimeResourceLifecycleJournals',
    'hostedRetrievalRuntimeResourceCleanups',
    'capabilityEffectProviderRuntimeJournals',
    'optionalCapabilityFactSources',
    'optionalCapabilityFactAuthorities',
  ] as const);

export type AgentEvaluationQualificationAuthorityArchiveFamily =
  (typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES)[number];

export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS =
  Object.freeze({
    requiredRecordCount: 18,
    maximumRecordBytes: 2_367_488,
    maximumFamilyBytes: 42_614_784,
  });
export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS =
  Object.freeze({
    requiredRecordCount: 108,
    referencesPerAdmission: 6,
    maximumRecordBytes: 264_192,
    maximumFamilyBytes: 19_095_552,
  });
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS =
  Object.freeze({
    maximumRecordCount: 15,
    maximumRecordBytes: 200_704,
    maximumFamilyBytes: 3_010_560,
  });
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS =
  Object.freeze({
    requiredRecordCount: 4,
    maximumRecordBytes: 196_608,
    maximumFamilyBytes: 786_432,
  });
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS =
  Object.freeze({
    requiredRecordCount: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
    maximumRecordBytes:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES /
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
    maximumFamilyBytes:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  });
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS =
  Object.freeze({
    minimumRecordCount: 1,
    maximumRecordCount:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_MAXIMUM_RECORDS,
    maximumRecordBytes:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_RECORD_MAXIMUM_BYTES,
    maximumFamilyBytes:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_PHYSICAL_FAMILY_MAXIMUM_BYTES,
  });
export const AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS =
  Object.freeze({
    maximumRecordCount:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive,
    maximumRecordBytes:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes,
    maximumFamilyBytes:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes,
  });
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS =
  Object.freeze({
    maximumRecordCount: 5_880,
    maximumRecordBytes: 167_936,
    maximumFamilyBytes: 987_463_680,
  });
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS =
  Object.freeze({
    maximumRecordCount: 5_880,
    maximumRecordBytes: 184_320,
    maximumFamilyBytes: 1_083_801_600,
  });

export const AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS =
  Object.freeze({
    maximumRecordCount:
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount +
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount +
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount +
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount +
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumRecordCount +
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount +
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordCount +
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount +
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount,
    maximumCanonicalBytes:
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes +
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumFamilyBytes,
  });

export type AgentEvaluationCapabilityProbeAdmissionArchiveRecord = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_RECORD_FORMAT;
  version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
  requestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  admissionReceiptDigest: CanonicalDigest;
  request: Readonly<Record<string, unknown>>;
  referenceBundle: readonly Readonly<Record<string, unknown>>[];
  response: Readonly<Record<string, unknown>>;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeReferenceArchiveRecord = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_RECORD_FORMAT;
  version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
  admissionRequestDigest: CanonicalDigest;
  ordinal: number;
  kind: AgentEvaluationCapabilityProbeReferenceKind;
  receiptDigest: CanonicalDigest;
  receipt: Readonly<Record<string, unknown>>;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
    registrationReceiptDigest: CanonicalDigest;
    requestDigest: CanonicalDigest;
    ownerHealthDigest: CanonicalDigest;
    request: Readonly<Record<string, unknown>>;
    ownerHealth: Readonly<Record<string, unknown>>;
    receipt: Readonly<Record<string, unknown>>;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
    repositoryCommit: string;
    resourceRegistrationRequestDigest: CanonicalDigest;
    cleanupRequestDigest: CanonicalDigest;
    deletionAuthorityReceiptDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    resultIngressDigest: CanonicalDigest;
    resultIngressReceiptDigest: CanonicalDigest;
    cleanupReceiptDigest: CanonicalDigest;
    cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
    deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
    cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
    cleanupResponse: AgentCapabilityProbeProviderResourceCleanupResponse;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
    attemptId: string;
    turnIndex: number;
    sourceSealDigest: CanonicalDigest;
    sourceReceipt: Readonly<Record<string, unknown>>;
    preEffectIntent: AgentEvaluationCapabilityPreEffectIntent;
    effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
    effectSourceFact: AgentEvaluationProviderCapabilityObservedFact | null;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
    attemptId: string;
    turnIndex: number;
    sourceSealDigest: CanonicalDigest;
    sourceReceipt: Readonly<Record<string, unknown>>;
    bootstrapSourceRequest: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest;
    bootstrapSourceReceipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt;
    nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    bootstrapFact: AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact | null;
    stateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    stateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
    stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
    stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
    stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationOptionalCapabilityFactSourceArchiveRecord =
  | AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord
  | AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord;

export type AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord =
  Readonly<{
    format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_RECORD_FORMAT;
    version: typeof AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION;
    attemptId: string;
    turnIndex: number;
    sourceSealDigest: CanonicalDigest;
    authorityRequestDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    resultDigest: CanonicalDigest;
    stageRequest: Readonly<Record<string, unknown>>;
    fact: AgentEvaluationProviderCapabilityObservedFact | null;
    runtimeFactEnvelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope | null;
    factAuthority: AgentEvaluationProviderCapabilityFactAuthority | null;
    sealedResponse: Readonly<Record<string, unknown>>;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationQualificationAuthorityArchiveRecord =
  | AgentEvaluationCapabilityProbeAdmissionArchiveRecord
  | AgentEvaluationCapabilityProbeReferenceArchiveRecord
  | AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord
  | AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord
  | AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
  | AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord
  | AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord
  | AgentEvaluationOptionalCapabilityFactSourceArchiveRecord
  | AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord;

type ArchiveRecordInput<
  T extends AgentEvaluationQualificationAuthorityArchiveRecord,
> = T extends unknown ? Omit<T, 'format' | 'version' | 'recordDigest'> : never;

const utf8Encoder = new TextEncoder();
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const maximumRuntimeFactSourceRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Readonly<Record<string, unknown>> => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key)) &&
    keys.length >= required.length &&
    keys.length <= required.length + optional.length
  );
};

const withoutKey = (
  value: Readonly<Record<string, unknown>>,
  key: string
): Readonly<Record<string, unknown>> => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

const isSelfDigest = (
  value: Readonly<Record<string, unknown>>,
  field: string,
  expected: unknown = value[field]
): expected is CanonicalDigest =>
  isAgentCanonicalDigest(expected) &&
  value[field] === expected &&
  digestAgentCanonicalValue(withoutKey(value, field)) === expected;

const withinBytes = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      utf8Encoder.encode(canonicalJsonText(value)).byteLength <= maximumBytes
    );
  } catch {
    return false;
  }
};

const isProtocolFamily = (value: unknown): boolean =>
  value === 'openai-responses' ||
  value === 'anthropic-messages' ||
  value === 'gemini-interactions';

const isProductionCapabilityProbeEvidence = (
  value: unknown
): value is AgentEvaluationProductionCapabilityProbeEvidence => {
  if (!isPlainObject(value) || !isAgentCanonicalDigest(value.evidenceDigest)) {
    return false;
  }
  try {
    const { evidenceDigest: _evidenceDigest, ...input } = value;
    return sameCanonicalJson(
      value,
      createAgentEvaluationProductionCapabilityProbeEvidence(
        input as Omit<
          AgentEvaluationProductionCapabilityProbeEvidence,
          'evidenceDigest'
        >
      )
    );
  } catch {
    return false;
  }
};

const providerKeys = Object.freeze([
  'providerConfigurationId',
  'providerOperatorId',
  'endpointClass',
  'endpointProfileDigest',
  'adapter',
  'dataPolicyDigest',
]);
const adapterKeys = Object.freeze([
  'adapterId',
  'adapterVersion',
  'adapterDigest',
  'protocolFamily',
  'transportSchemaDigest',
  'eventNormalizationDigest',
]);
const modelKeys = Object.freeze([
  'modelId',
  'modelFamilyId',
  'modelFamilyOwnerId',
  'lineageDigest',
]);

const isProbeProviderConfiguration = (value: unknown): boolean => {
  if (
    !exactKeys(value, providerKeys, ['providerRegion', 'apiRevision']) ||
    ![value.providerConfigurationId, value.providerOperatorId].every(
      isAgentControlIdentity
    ) ||
    !['first-party-hosted', 'aggregator', 'self-hosted', 'local'].includes(
      value.endpointClass as string
    ) ||
    ![value.endpointProfileDigest, value.dataPolicyDigest].every(
      isAgentCanonicalDigest
    ) ||
    !exactKeys(value.adapter, adapterKeys)
  ) {
    return false;
  }
  const adapter = value.adapter;
  if (
    ![adapter.adapterId, adapter.adapterVersion].every(
      isAgentControlIdentity
    ) ||
    ![
      adapter.adapterDigest,
      adapter.transportSchemaDigest,
      adapter.eventNormalizationDigest,
    ].every(isAgentCanonicalDigest) ||
    ![
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
      'openai-compatible',
    ].includes(adapter.protocolFamily as string) ||
    !isSelfDigest(adapter, 'adapterDigest')
  ) {
    return false;
  }
  return ['providerRegion', 'apiRevision'].every(
    (key) => !Object.hasOwn(value, key) || isAgentControlIdentity(value[key])
  );
};

const isProbeModelLineage = (value: unknown): boolean => {
  if (
    !exactKeys(value, modelKeys, [
      'immutableVersion',
      'baseModelRef',
      'fineTuneRef',
      'tokenizerDigest',
      'chatTemplateDigest',
      'quantizationDigest',
      'runtimeBackendDigest',
    ]) ||
    ![value.modelId, value.modelFamilyId, value.modelFamilyOwnerId].every(
      isAgentControlIdentity
    ) ||
    !isSelfDigest(value, 'lineageDigest')
  ) {
    return false;
  }
  if (
    Object.hasOwn(value, 'immutableVersion') &&
    !isAgentControlIdentity(value.immutableVersion)
  ) {
    return false;
  }
  for (const key of [
    'tokenizerDigest',
    'chatTemplateDigest',
    'quantizationDigest',
    'runtimeBackendDigest',
  ]) {
    if (Object.hasOwn(value, key) && !isAgentCanonicalDigest(value[key])) {
      return false;
    }
  }
  if (
    Object.hasOwn(value, 'baseModelRef') &&
    (!exactKeys(value.baseModelRef, ['modelId', 'lineageDigest']) ||
      !isAgentControlIdentity(value.baseModelRef.modelId) ||
      !isAgentCanonicalDigest(value.baseModelRef.lineageDigest))
  ) {
    return false;
  }
  if (Object.hasOwn(value, 'fineTuneRef')) {
    const fineTune = value.fineTuneRef;
    if (
      !exactKeys(fineTune, [
        'fineTuneId',
        'jobId',
        'deploymentId',
        'baseModelLineageDigest',
        'trainingPolicyDigest',
        'disclosedDataLineageDigest',
      ]) ||
      ![fineTune.fineTuneId, fineTune.jobId, fineTune.deploymentId].every(
        isAgentControlIdentity
      ) ||
      ![
        fineTune.baseModelLineageDigest,
        fineTune.trainingPolicyDigest,
        fineTune.disclosedDataLineageDigest,
      ].every(isAgentCanonicalDigest)
    ) {
      return false;
    }
  }
  return true;
};

const admissionRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'providerConfiguration',
  'modelLineage',
  'qualificationCapabilityProfileId',
  'qualificationCapabilityProfileDigest',
  'capabilityId',
  'declaredCapabilityProfileDigests',
  'probeProgram',
  'probeProviderResourceAuthority',
  'minimumExpiresAt',
  'requestDigest',
]);

export const isAgentEvaluationCapabilityProbeAdmissionRequest = (
  value: unknown
): value is AgentEvaluationCapabilityProbeAdmissionRequest => {
  if (
    !exactKeys(value, admissionRequestKeys) ||
    value.format !==
      'prodivix.agent-evaluation-capability-probe-admission-request' ||
    value.version !== 1 ||
    !isAgentControlIdentity(value.namespaceId) ||
    typeof value.repositoryCommit !== 'string' ||
    !repositoryCommitPattern.test(value.repositoryCommit) ||
    !isProbeProviderConfiguration(value.providerConfiguration) ||
    !isProbeModelLineage(value.modelLineage) ||
    !isAgentControlIdentity(value.qualificationCapabilityProfileId) ||
    !isAgentCanonicalDigest(value.qualificationCapabilityProfileDigest) ||
    !isAgentControlIdentity(value.capabilityId) ||
    !Array.isArray(value.declaredCapabilityProfileDigests) ||
    value.declaredCapabilityProfileDigests.length === 0 ||
    value.declaredCapabilityProfileDigests.length > 128 ||
    !value.declaredCapabilityProfileDigests.every(isAgentCanonicalDigest) ||
    !isAgentCapabilityProbeProgram(value.probeProgram) ||
    value.probeProgram.profileProjection.capabilityProfileId !==
      value.qualificationCapabilityProfileId ||
    value.probeProgram.profileProjection.capabilityProfileDigest !==
      value.qualificationCapabilityProfileDigest ||
    value.probeProgram.profileProjection.capabilityId !== value.capabilityId ||
    !isAgentControlInstant(value.minimumExpiresAt) ||
    !isSelfDigest(value, 'requestDigest')
  ) {
    return false;
  }
  const request =
    value as unknown as AgentEvaluationCapabilityProbeAdmissionRequest;
  const protocolFamily = request.providerConfiguration.adapter.protocolFamily;
  if (
    protocolFamily !== 'openai-responses' &&
    protocolFamily !== 'anthropic-messages' &&
    protocolFamily !== 'gemini-interactions'
  ) {
    return false;
  }
  const resourceRequired =
    request.capabilityId === 'provider.hosted-retrieval' &&
    resolveAgentCapabilityProbeProviderRequestCodecAvailability(
      protocolFamily,
      request.probeProgram.profileProjection.capabilityProfileId
    ).availability === 'available';
  if ((request.probeProviderResourceAuthority !== null) !== resourceRequired) {
    return false;
  }
  const resource = request.probeProviderResourceAuthority;
  return (
    resource === null ||
    (isAgentCapabilityProbeProviderResourceAuthority(
      resource,
      request.probeProgram
    ) &&
      resource.protocolFamily === protocolFamily &&
      resource.providerConfigurationId ===
        request.providerConfiguration.providerConfigurationId &&
      resource.modelId === request.modelLineage.modelId &&
      resource.modelLineageDigest === request.modelLineage.lineageDigest &&
      resource.adapterDigest ===
        request.providerConfiguration.adapter.adapterDigest &&
      Date.parse(resource.expiresAt) >= Date.parse(request.minimumExpiresAt))
  );
};

const failQualificationAuthorityDigest = (message: string): never => {
  throw new TypeError(
    `Evaluation qualification authority digest is invalid: ${message}`
  );
};

export const digestAgentEvaluationCapabilityProbeAdmissionStage = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    !isAgentEvaluationCapabilityProbeAdmissionRequest(request) ||
    !isAgentCanonicalDigest(ownerImplementationDigest)
  ) {
    return failQualificationAuthorityDigest('probe admission stage');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_STAGE_FORMAT,
    version: 1,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });
};

export const digestAgentEvaluationCapabilityProbeOwnerAdmission = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  evidenceDigest: CanonicalDigest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    !isAgentCanonicalDigest(evidenceDigest) ||
    stageDigest !==
      digestAgentEvaluationCapabilityProbeAdmissionStage(
        request,
        ownerImplementationDigest
      )
  ) {
    return failQualificationAuthorityDigest('probe owner admission');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_OWNER_ADMISSION_FORMAT,
    version: 1,
    requestDigest: request.requestDigest,
    evidenceDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

export const digestAgentEvaluationCapabilityProbeDispatchAck = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  result: Readonly<{
    probeEvidence: AgentEvaluationProductionCapabilityProbeEvidence;
    ownerAdmissionDigest: CanonicalDigest;
  }>,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    !isProductionCapabilityProbeEvidence(result.probeEvidence) ||
    result.ownerAdmissionDigest !==
      digestAgentEvaluationCapabilityProbeOwnerAdmission(
        request,
        result.probeEvidence.evidenceDigest,
        ownerImplementationDigest,
        stageDigest
      )
  ) {
    return failQualificationAuthorityDigest('probe dispatch acknowledgement');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_DISPATCH_ACK_FORMAT,
    version: 1,
    requestDigest: request.requestDigest,
    evidenceDigest: result.probeEvidence.evidenceDigest,
    ownerImplementationDigest,
    ownerAdmissionDigest: result.ownerAdmissionDigest,
    stageDigest,
  });
};

export const createAgentEvaluationCapabilityProbeAdmissionResponse = (input: {
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  probeEvidence: AgentEvaluationProductionCapabilityProbeEvidence;
  ownerImplementationDigest: CanonicalDigest;
}): AgentEvaluationCapabilityProbeAdmissionResponse => {
  const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
    input.request,
    input.ownerImplementationDigest
  );
  const ownerAdmissionDigest =
    digestAgentEvaluationCapabilityProbeOwnerAdmission(
      input.request,
      input.probeEvidence.evidenceDigest,
      input.ownerImplementationDigest,
      stageDigest
    );
  const result = Object.freeze({
    probeEvidence: input.probeEvidence,
    ownerAdmissionDigest,
  });
  const dispatchAckDigest = digestAgentEvaluationCapabilityProbeDispatchAck(
    input.request,
    result,
    input.ownerImplementationDigest,
    stageDigest
  );
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT,
    version: 1 as const,
    requestDigest: input.request.requestDigest,
    probeEvidence: input.probeEvidence,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest,
  });
  return Object.freeze({
    ...base,
    admissionReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const referenceReceiptFormats = Object.freeze([
  'prodivix.agent-evaluation-capability-probe-request',
  'prodivix.agent-evaluation-capability-probe-response',
  'prodivix.agent-evaluation-capability-probe-dispatch-receipt',
  'prodivix.agent-evaluation-capability-probe-transport-receipt',
  'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt',
  'prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt',
] as const);

const probeReferenceReceiptKeys = Object.freeze([
  'format',
  'version',
  'admissionRequestDigest',
  'providerConfigurationDigest',
  'modelLineageDigest',
  'qualificationCapabilityProfileDigest',
  'capabilityId',
  'probeProgramDigest',
  'profileProjectionDigest',
  'adapterDigest',
  'ownerImplementationDigest',
  'authorityIssuerId',
  'previousReceiptDigest',
  'observedAt',
  'sourceReceipt',
  'sourceReceiptDigest',
]);

const isCapabilityProbeReferenceReceipt = (
  value: unknown,
  admissionRequestDigest: CanonicalDigest,
  ordinal: number,
  previousReceiptDigest: CanonicalDigest | null
): value is Readonly<Record<string, unknown>> =>
  exactKeys(value, probeReferenceReceiptKeys) &&
  value.format === referenceReceiptFormats[ordinal] &&
  value.version === 1 &&
  value.admissionRequestDigest === admissionRequestDigest &&
  [
    value.providerConfigurationDigest,
    value.modelLineageDigest,
    value.qualificationCapabilityProfileDigest,
    value.probeProgramDigest,
    value.profileProjectionDigest,
    value.adapterDigest,
    value.ownerImplementationDigest,
    value.sourceReceiptDigest,
  ].every(isAgentCanonicalDigest) &&
  isAgentControlIdentity(value.capabilityId) &&
  isAgentControlIdentity(value.authorityIssuerId) &&
  value.previousReceiptDigest === previousReceiptDigest &&
  isAgentControlInstant(value.observedAt) &&
  isPlainObject(value.sourceReceipt) &&
  digestAgentCanonicalValue(value.sourceReceipt) === value.sourceReceiptDigest;

const isCapabilityProbeReferenceEntry = (
  value: unknown,
  admissionRequestDigest: CanonicalDigest,
  ordinal: number,
  previousReceiptDigest: CanonicalDigest | null
): value is Readonly<Record<string, unknown>> =>
  exactKeys(value, ['kind', 'receipt', 'receiptDigest']) &&
  value.kind === AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS[ordinal] &&
  isCapabilityProbeReferenceReceipt(
    value.receipt,
    admissionRequestDigest,
    ordinal,
    previousReceiptDigest
  ) &&
  isAgentCanonicalDigest(value.receiptDigest) &&
  digestAgentCanonicalValue(value.receipt) === value.receiptDigest;

const probeEvidenceReferenceDigestFields = Object.freeze([
  'probeRequestDigest',
  'probeResponseDigest',
  'dispatchReceiptDigest',
  'transportReceiptDigest',
  'responseSpoolDigest',
  'normalizedEventSetDigest',
] as const);

const isCapabilityProbeAdmissionResponse = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  stageDigest: CanonicalDigest,
  dispatchAckDigest: CanonicalDigest,
  admissionReceiptDigest: CanonicalDigest
): value is AgentEvaluationCapabilityProbeAdmissionResponse =>
  exactKeys(value, [
    'format',
    'version',
    'requestDigest',
    'probeEvidence',
    'ownerImplementationDigest',
    'ownerAdmissionDigest',
    'stageDigest',
    'dispatchAckDigest',
    'admissionReceiptDigest',
  ]) &&
  value.format ===
    AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT &&
  value.version === 1 &&
  value.requestDigest === request.requestDigest &&
  value.stageDigest === stageDigest &&
  value.dispatchAckDigest === dispatchAckDigest &&
  value.admissionReceiptDigest === admissionReceiptDigest &&
  [
    value.ownerImplementationDigest,
    value.ownerAdmissionDigest,
    value.stageDigest,
    value.dispatchAckDigest,
    value.admissionReceiptDigest,
  ].every(isAgentCanonicalDigest) &&
  isProductionCapabilityProbeEvidence(value.probeEvidence) &&
  value.stageDigest ===
    digestAgentEvaluationCapabilityProbeAdmissionStage(
      request,
      value.ownerImplementationDigest as CanonicalDigest
    ) &&
  value.ownerAdmissionDigest ===
    digestAgentEvaluationCapabilityProbeOwnerAdmission(
      request,
      value.probeEvidence.evidenceDigest,
      value.ownerImplementationDigest as CanonicalDigest,
      value.stageDigest as CanonicalDigest
    ) &&
  value.dispatchAckDigest ===
    digestAgentEvaluationCapabilityProbeDispatchAck(
      request,
      Object.freeze({
        probeEvidence: value.probeEvidence,
        ownerAdmissionDigest: value.ownerAdmissionDigest as CanonicalDigest,
      }),
      value.ownerImplementationDigest as CanonicalDigest,
      value.stageDigest as CanonicalDigest
    ) &&
  isSelfDigest(value, 'admissionReceiptDigest', admissionReceiptDigest);

const admissionArchiveKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'stageDigest',
  'dispatchAckDigest',
  'admissionReceiptDigest',
  'request',
  'referenceBundle',
  'response',
  'recordDigest',
]);

export const isAgentEvaluationCapabilityProbeAdmissionArchiveRecord = (
  value: unknown
): value is AgentEvaluationCapabilityProbeAdmissionArchiveRecord => {
  if (
    !exactKeys(value, admissionArchiveKeys) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_RECORD_FORMAT ||
    value.version !==
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION ||
    ![
      value.requestDigest,
      value.stageDigest,
      value.dispatchAckDigest,
      value.admissionReceiptDigest,
      value.recordDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentEvaluationCapabilityProbeAdmissionRequest(value.request) ||
    value.request.requestDigest !== value.requestDigest ||
    !Array.isArray(value.referenceBundle) ||
    value.referenceBundle.length !==
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.length ||
    !isCapabilityProbeAdmissionResponse(
      value.response,
      value.request,
      value.stageDigest as CanonicalDigest,
      value.dispatchAckDigest as CanonicalDigest,
      value.admissionReceiptDigest as CanonicalDigest
    ) ||
    !sameCanonicalJson(
      value.request.probeProgram,
      value.response.probeEvidence.probeProgram
    ) ||
    value.response.probeEvidence.ownerImplementationDigest !==
      value.response.ownerImplementationDigest ||
    !withinBytes(
      value,
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.maximumRecordBytes
    ) ||
    !isSelfDigest(value, 'recordDigest')
  ) {
    return false;
  }
  let previous: CanonicalDigest | null = null;
  for (const [ordinal, entry] of value.referenceBundle.entries()) {
    if (
      !isCapabilityProbeReferenceEntry(
        entry,
        value.requestDigest as CanonicalDigest,
        ordinal,
        previous
      ) ||
      entry.receiptDigest !==
        value.response.probeEvidence[
          probeEvidenceReferenceDigestFields[ordinal]!
        ]
    ) {
      return false;
    }
    previous = entry.receiptDigest as CanonicalDigest;
  }
  return true;
};

export const createAgentEvaluationCapabilityProbeAdmissionArchiveRecord = (
  input: ArchiveRecordInput<AgentEvaluationCapabilityProbeAdmissionArchiveRecord>
): AgentEvaluationCapabilityProbeAdmissionArchiveRecord => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_RECORD_FORMAT,
    version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
    ...input,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityProbeAdmissionArchiveRecord(record)) {
    throw new TypeError(
      'Capability probe admission archive record is invalid.'
    );
  }
  return record;
};

const referenceArchiveKeys = Object.freeze([
  'format',
  'version',
  'admissionRequestDigest',
  'ordinal',
  'kind',
  'receiptDigest',
  'receipt',
  'recordDigest',
]);

export const isAgentEvaluationCapabilityProbeReferenceArchiveRecord = (
  value: unknown
): value is AgentEvaluationCapabilityProbeReferenceArchiveRecord =>
  exactKeys(value, referenceArchiveKeys) &&
  value.format ===
    AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_RECORD_FORMAT &&
  value.version ===
    AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION &&
  isAgentCanonicalDigest(value.admissionRequestDigest) &&
  Number.isSafeInteger(value.ordinal) &&
  (value.ordinal as number) >= 0 &&
  (value.ordinal as number) <
    AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.length &&
  value.kind ===
    AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS[
      value.ordinal as number
    ] &&
  isAgentCanonicalDigest(value.receiptDigest) &&
  isCapabilityProbeReferenceReceipt(
    value.receipt,
    value.admissionRequestDigest as CanonicalDigest,
    value.ordinal as number,
    value.ordinal === 0
      ? null
      : ((value.receipt as Readonly<Record<string, unknown>>)
          .previousReceiptDigest as CanonicalDigest)
  ) &&
  digestAgentCanonicalValue(value.receipt) === value.receiptDigest &&
  withinBytes(
    value,
    AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.maximumRecordBytes
  ) &&
  isSelfDigest(value, 'recordDigest');

export const createAgentEvaluationCapabilityProbeReferenceArchiveRecord = (
  input: ArchiveRecordInput<AgentEvaluationCapabilityProbeReferenceArchiveRecord>
): AgentEvaluationCapabilityProbeReferenceArchiveRecord => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_RECORD_FORMAT,
    version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
    ...input,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationCapabilityProbeReferenceArchiveRecord(record)) {
    throw new TypeError(
      'Capability probe reference archive record is invalid.'
    );
  }
  return record;
};

const registrationRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'sourceAuthorityKind',
  'sourceKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'routeBinding',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'minimumExpiresAt',
  'requestDigest',
]);
const registrationHealthKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceKind',
  'routeBinding',
  'status',
  'checkedAt',
  'expiresAt',
  'healthDigest',
]);
const registrationReceiptKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'requestDigest',
  'sourceAuthorityKind',
  'sourceKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'routeBinding',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'registrationAuthorityIssuerId',
  'ownerHealthDigest',
  'ownerAdmissionDigest',
  'stageDigest',
  'dispatchAckDigest',
  'registeredAt',
  'expiresAt',
  'registrationReceiptDigest',
]);

const registrationCapabilitySourceKind = (
  capabilityId: unknown
): 'sealed-hosted-owner-result' | 'sealed-provider-response-metadata' | null =>
  capabilityId === 'provider.hosted-retrieval'
    ? 'sealed-hosted-owner-result'
    : [
          'provider.background-job',
          'provider.isolated-cache',
          'provider.reasoning-continuation',
        ].includes(capabilityId as string)
      ? 'sealed-provider-response-metadata'
      : null;

export const isAgentEvaluationRuntimeFactSourceRegistrationRequest = (
  value: unknown
): value is AgentEvaluationRuntimeFactSourceRegistrationRequest =>
  exactKeys(value, registrationRequestKeys, [
    'hostedRetrievalRuntimeResourceRegistrationIntentDigest',
  ]) &&
  value.format ===
    'prodivix.agent-evaluation-runtime-fact-source-owner-registration-request' &&
  value.version === 1 &&
  value.sourceAuthorityKind === 'shared-durable-capability' &&
  value.sourceKind === registrationCapabilitySourceKind(value.capabilityId) &&
  typeof value.repositoryCommit === 'string' &&
  repositoryCommitPattern.test(value.repositoryCommit) &&
  [
    value.namespaceId,
    value.sourceAuthorityId,
    value.routeBinding,
    value.capabilityProfileId,
    value.capabilityId,
    value.providerConfigurationId,
    value.modelId,
  ].every(isAgentControlIdentity) &&
  [
    value.sourceAuthorityImplementationDigest,
    value.capabilityProfileDigest,
    value.modelLineageDigest,
    value.adapterDigest,
  ].every(isAgentCanonicalDigest) &&
  (value.capabilityId === 'provider.hosted-retrieval' &&
    (value.protocolFamily === 'openai-responses' ||
      value.protocolFamily === 'gemini-interactions')) ===
    (value.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
      undefined) &&
  (value.hostedRetrievalRuntimeResourceRegistrationIntentDigest === undefined ||
    isAgentCanonicalDigest(
      value.hostedRetrievalRuntimeResourceRegistrationIntentDigest
    )) &&
  isProtocolFamily(value.protocolFamily) &&
  isAgentControlInstant(value.minimumExpiresAt) &&
  isSelfDigest(value, 'requestDigest');

export const digestAgentEvaluationRuntimeFactSourceRegistrationStage = (
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  registrationAuthorityIssuerId: string
): CanonicalDigest => {
  if (
    !isAgentEvaluationRuntimeFactSourceRegistrationRequest(request) ||
    !isAgentControlIdentity(registrationAuthorityIssuerId)
  ) {
    return failQualificationAuthorityDigest('runtime registration stage');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_STAGE_FORMAT,
    version: 1,
    requestDigest: request.requestDigest,
    registrationAuthorityIssuerId,
  });
};

export const digestAgentEvaluationRuntimeFactSourceOwnerAdmission = (
  requestDigest: CanonicalDigest,
  ownerHealthDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    ![requestDigest, ownerHealthDigest, stageDigest].every(
      isAgentCanonicalDigest
    )
  ) {
    return failQualificationAuthorityDigest('runtime owner admission');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_ADMISSION_FORMAT,
    version: 1,
    requestDigest,
    ownerHealthDigest,
    stageDigest,
  });
};

export const digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck = (
  input: Readonly<{
    requestDigest: CanonicalDigest;
    ownerHealthDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    registrationAuthorityIssuerId: string;
  }>
): CanonicalDigest => {
  if (
    ![
      input.requestDigest,
      input.ownerHealthDigest,
      input.ownerAdmissionDigest,
      input.stageDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlIdentity(input.registrationAuthorityIssuerId)
  ) {
    return failQualificationAuthorityDigest(
      'runtime registration dispatch acknowledgement'
    );
  }
  return digestAgentCanonicalValue({
    format:
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_DISPATCH_ACK_FORMAT,
    version: 1,
    requestDigest: input.requestDigest,
    ownerHealthDigest: input.ownerHealthDigest,
    ownerAdmissionDigest: input.ownerAdmissionDigest,
    stageDigest: input.stageDigest,
    registrationAuthorityIssuerId: input.registrationAuthorityIssuerId,
  });
};

const isRuntimeFactSourceRegistrationHealth = (
  value: unknown,
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest
): value is AgentEvaluationRuntimeFactSourceOwnerHealth =>
  exactKeys(value, registrationHealthKeys) &&
  value.format === AGENT_EVALUATION_RUNTIME_FACT_SOURCE_OWNER_HEALTH_FORMAT &&
  value.version === 1 &&
  value.requestDigest === request.requestDigest &&
  value.sourceAuthorityId === request.sourceAuthorityId &&
  value.sourceAuthorityImplementationDigest ===
    request.sourceAuthorityImplementationDigest &&
  value.sourceKind === request.sourceKind &&
  value.routeBinding === request.routeBinding &&
  value.status === 'ready' &&
  isAgentControlInstant(value.checkedAt) &&
  isAgentControlInstant(value.expiresAt) &&
  Date.parse(value.expiresAt) > Date.parse(value.checkedAt) &&
  Date.parse(value.expiresAt) - Date.parse(value.checkedAt) <=
    maximumRuntimeFactSourceRegistrationLifetimeMs &&
  Date.parse(value.expiresAt) >= Date.parse(request.minimumExpiresAt) &&
  isSelfDigest(value, 'healthDigest');

const isRuntimeFactSourceRegistrationReceipt = (
  value: unknown,
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest,
  health: AgentEvaluationRuntimeFactSourceOwnerHealth
): value is AgentEvaluationRuntimeFactSourceRegistrationReceipt =>
  exactKeys(value, registrationReceiptKeys) &&
  value.format ===
    AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT &&
  value.version === 1 &&
  [
    'namespaceId',
    'repositoryCommit',
    'requestDigest',
    'sourceAuthorityKind',
    'sourceKind',
    'sourceAuthorityId',
    'sourceAuthorityImplementationDigest',
    'routeBinding',
    'capabilityProfileId',
    'capabilityProfileDigest',
    'capabilityId',
    'protocolFamily',
    'providerConfigurationId',
    'modelId',
    'modelLineageDigest',
    'adapterDigest',
  ].every(
    (key) =>
      value[key] ===
      (request as unknown as Readonly<Record<string, unknown>>)[key]
  ) &&
  value.ownerHealthDigest === health.healthDigest &&
  isAgentControlIdentity(value.registrationAuthorityIssuerId) &&
  [
    value.ownerAdmissionDigest,
    value.stageDigest,
    value.dispatchAckDigest,
  ].every(isAgentCanonicalDigest) &&
  isAgentControlInstant(value.registeredAt) &&
  isAgentControlInstant(value.expiresAt) &&
  Date.parse(value.expiresAt) > Date.parse(value.registeredAt) &&
  Date.parse(value.expiresAt) - Date.parse(value.registeredAt) <=
    maximumRuntimeFactSourceRegistrationLifetimeMs &&
  Date.parse(value.expiresAt) >= Date.parse(request.minimumExpiresAt) &&
  value.stageDigest ===
    digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      value.registrationAuthorityIssuerId
    ) &&
  value.ownerAdmissionDigest ===
    digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
      request.requestDigest,
      health.healthDigest,
      value.stageDigest
    ) &&
  value.dispatchAckDigest ===
    digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
      requestDigest: request.requestDigest,
      ownerHealthDigest: health.healthDigest,
      ownerAdmissionDigest: value.ownerAdmissionDigest,
      stageDigest: value.stageDigest,
      registrationAuthorityIssuerId: value.registrationAuthorityIssuerId,
    }) &&
  isSelfDigest(value, 'registrationReceiptDigest');

export const createAgentEvaluationRuntimeFactSourceRegistrationReceipt = (
  input: Readonly<{
    request: AgentEvaluationRuntimeFactSourceRegistrationRequest;
    ownerHealth: AgentEvaluationRuntimeFactSourceOwnerHealth;
    registrationAuthorityIssuerId: string;
    registeredAt: string;
    expiresAt: string;
  }>
): AgentEvaluationRuntimeFactSourceRegistrationReceipt => {
  if (
    !isAgentEvaluationRuntimeFactSourceRegistrationRequest(input.request) ||
    !isRuntimeFactSourceRegistrationHealth(input.ownerHealth, input.request) ||
    !isAgentControlInstant(input.registeredAt) ||
    !isAgentControlInstant(input.expiresAt)
  ) {
    return failQualificationAuthorityDigest('runtime registration receipt');
  }
  const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
    input.request,
    input.registrationAuthorityIssuerId
  );
  const ownerAdmissionDigest =
    digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
      input.request.requestDigest,
      input.ownerHealth.healthDigest,
      stageDigest
    );
  const dispatchAckDigest =
    digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
      requestDigest: input.request.requestDigest,
      ownerHealthDigest: input.ownerHealth.healthDigest,
      ownerAdmissionDigest,
      stageDigest,
      registrationAuthorityIssuerId: input.registrationAuthorityIssuerId,
    });
  const base = Object.freeze({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT,
    version: 1 as const,
    namespaceId: input.request.namespaceId,
    repositoryCommit: input.request.repositoryCommit,
    requestDigest: input.request.requestDigest,
    sourceAuthorityKind: input.request.sourceAuthorityKind,
    sourceKind: input.request.sourceKind,
    sourceAuthorityId: input.request.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      input.request.sourceAuthorityImplementationDigest,
    routeBinding: input.request.routeBinding,
    capabilityProfileId: input.request.capabilityProfileId,
    capabilityProfileDigest: input.request.capabilityProfileDigest,
    capabilityId: input.request.capabilityId,
    protocolFamily: input.request.protocolFamily,
    providerConfigurationId: input.request.providerConfigurationId,
    modelId: input.request.modelId,
    modelLineageDigest: input.request.modelLineageDigest,
    adapterDigest: input.request.adapterDigest,
    registrationAuthorityIssuerId: input.registrationAuthorityIssuerId,
    ownerHealthDigest: input.ownerHealth.healthDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest,
    registeredAt: input.registeredAt,
    expiresAt: input.expiresAt,
  });
  const receipt = Object.freeze({
    ...base,
    registrationReceiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    !isRuntimeFactSourceRegistrationReceipt(
      receipt,
      input.request,
      input.ownerHealth
    )
  ) {
    return failQualificationAuthorityDigest('runtime registration receipt');
  }
  return receipt;
};

const registrationArchiveKeys = Object.freeze([
  'format',
  'version',
  'registrationReceiptDigest',
  'requestDigest',
  'ownerHealthDigest',
  'request',
  'ownerHealth',
  'receipt',
  'recordDigest',
]);

export const isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord = (
  value: unknown
): value is AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord =>
  exactKeys(value, registrationArchiveKeys) &&
  value.format ===
    AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_RECORD_FORMAT &&
  value.version ===
    AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION &&
  [
    value.registrationReceiptDigest,
    value.requestDigest,
    value.ownerHealthDigest,
    value.recordDigest,
  ].every(isAgentCanonicalDigest) &&
  isAgentEvaluationRuntimeFactSourceRegistrationRequest(value.request) &&
  value.request.requestDigest === value.requestDigest &&
  isRuntimeFactSourceRegistrationHealth(value.ownerHealth, value.request) &&
  value.ownerHealth.healthDigest === value.ownerHealthDigest &&
  isRuntimeFactSourceRegistrationReceipt(
    value.receipt,
    value.request,
    value.ownerHealth
  ) &&
  value.receipt.registrationReceiptDigest === value.registrationReceiptDigest &&
  withinBytes(
    value,
    AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordBytes
  ) &&
  isSelfDigest(value, 'recordDigest');

export const createAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord = (
  input: ArchiveRecordInput<AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord>
): AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_RECORD_FORMAT,
    version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
    ...input,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord(record)) {
    throw new TypeError(
      'Runtime fact source registration archive record is invalid.'
    );
  }
  return record;
};

const capabilityProbeProviderResourceCleanupArchiveKeys = Object.freeze([
  'format',
  'version',
  'repositoryCommit',
  'resourceRegistrationRequestDigest',
  'cleanupRequestDigest',
  'deletionAuthorityReceiptDigest',
  'ownerImplementationDigest',
  'stageDigest',
  'ownerAdmissionDigest',
  'dispatchAckDigest',
  'resultIngressDigest',
  'resultIngressReceiptDigest',
  'cleanupReceiptDigest',
  'cleanupRequest',
  'deletionAuthorityReceipt',
  'cleanupReceipt',
  'cleanupResponse',
  'recordDigest',
] as const);

export const isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord =
  (
    value: unknown
  ): value is AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord =>
    exactKeys(value, capabilityProbeProviderResourceCleanupArchiveKeys) &&
    value.format ===
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT &&
    value.version ===
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION &&
    typeof value.repositoryCommit === 'string' &&
    repositoryCommitPattern.test(value.repositoryCommit) &&
    [
      value.resourceRegistrationRequestDigest,
      value.cleanupRequestDigest,
      value.deletionAuthorityReceiptDigest,
      value.ownerImplementationDigest,
      value.stageDigest,
      value.ownerAdmissionDigest,
      value.dispatchAckDigest,
      value.resultIngressDigest,
      value.resultIngressReceiptDigest,
      value.cleanupReceiptDigest,
      value.recordDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
      value.cleanupRequest
    ) &&
    isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
      value.deletionAuthorityReceipt
    ) &&
    isAgentCapabilityProbeProviderResourceCleanupReceipt(
      value.cleanupReceipt
    ) &&
    isAgentCapabilityProbeProviderResourceCleanupResponse(
      value.cleanupResponse
    ) &&
    matchAgentCapabilityProbeProviderResourceCleanupResponse(
      value.cleanupResponse,
      value.cleanupRequest,
      value.deletionAuthorityReceipt,
      value.cleanupReceipt
    ) &&
    value.resourceRegistrationRequestDigest ===
      value.cleanupReceipt.requestDigest &&
    value.resourceRegistrationRequestDigest ===
      value.cleanupRequest.resourceRegistrationRequestDigest &&
    value.cleanupRequestDigest === value.cleanupRequest.cleanupRequestDigest &&
    value.deletionAuthorityReceiptDigest ===
      value.cleanupReceipt.deletionAuthorityReceiptDigest &&
    value.deletionAuthorityReceiptDigest ===
      value.cleanupRequest.deletionAuthorityReceiptDigest &&
    value.deletionAuthorityReceiptDigest ===
      value.deletionAuthorityReceipt.deletionAuthorityReceiptDigest &&
    value.resourceRegistrationRequestDigest ===
      value.deletionAuthorityReceipt.requestDigest &&
    value.cleanupReceiptDigest === value.cleanupReceipt.cleanupReceiptDigest &&
    value.repositoryCommit === value.cleanupResponse.repositoryCommit &&
    value.resourceRegistrationRequestDigest ===
      value.cleanupResponse.resourceRegistrationRequestDigest &&
    value.cleanupRequestDigest === value.cleanupResponse.cleanupRequestDigest &&
    value.deletionAuthorityReceiptDigest ===
      value.cleanupResponse.deletionAuthorityReceiptDigest &&
    value.ownerImplementationDigest ===
      value.cleanupResponse.ownerImplementationDigest &&
    value.stageDigest === value.cleanupResponse.stageDigest &&
    value.ownerAdmissionDigest === value.cleanupResponse.ownerAdmissionDigest &&
    value.dispatchAckDigest === value.cleanupResponse.dispatchAckDigest &&
    value.resultIngressDigest === value.cleanupResponse.resultIngressDigest &&
    value.resultIngressReceiptDigest ===
      value.cleanupResponse.resultIngressReceiptDigest &&
    value.cleanupReceiptDigest ===
      value.cleanupResponse.cleanupReceipt.cleanupReceiptDigest &&
    sameCanonicalJson(
      value.cleanupReceipt,
      value.cleanupResponse.cleanupReceipt
    ) &&
    withinBytes(
      value,
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumRecordBytes
    ) &&
    isSelfDigest(value, 'recordDigest');

export const createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord =
  (
    input: ArchiveRecordInput<AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord>
  ): AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_RECORD_FORMAT,
      version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
      ...input,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord(
        record
      )
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup archive record is invalid.'
      );
    }
    return record;
  };

const effectSourceReceiptKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'targetId',
  'targetDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityDescriptorDigest',
  'capabilityId',
  'supportExpectation',
  'turnIndex',
  'invocationId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'providerRequestDigest',
  'responseDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'targetAuthorityDigest',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceAuthorityRouteBinding',
  'registrationAuthorityIssuerId',
  'registrationReceiptDigest',
  'sourceKind',
  'sourceDigest',
  'sourceRequestDigest',
  'outcome',
  'observedAt',
  'sealedAt',
  'ownerRequestDigest',
  'ownerReceiptDigest',
  'ownerStageDigest',
  'ownerDispatchAckDigest',
  'preEffectIntentDigest',
  'effectSourceReceiptDigest',
  'providerRuntimeJournalResultRecordDigest',
  'providerRuntimeResultSealReceiptDigest',
  'effectSourceFactDigest',
  'businessResultDigest',
  'sourceSealDigest',
]);

const isOptionalEffectFactSourceReceipt = (
  value: unknown,
  attemptId: string,
  turnIndex: number,
  sourceSealDigest: CanonicalDigest
): value is Readonly<Record<string, unknown>> =>
  exactKeys(value, effectSourceReceiptKeys, ['fact']) &&
  value.format ===
    'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt' &&
  value.version === 1 &&
  value.attemptId === attemptId &&
  value.turnIndex === turnIndex &&
  value.sourceSealDigest === sourceSealDigest &&
  typeof value.repositoryCommit === 'string' &&
  repositoryCommitPattern.test(value.repositoryCommit) &&
  [
    value.namespaceId,
    value.attemptId,
    value.targetId,
    value.capabilityProfileId,
    value.capabilityId,
    value.invocationId,
    value.providerConfigurationId,
    value.modelId,
    value.sourceAuthorityId,
    value.sourceAuthorityRouteBinding,
    value.registrationAuthorityIssuerId,
  ].every(isAgentControlIdentity) &&
  [
    value.planDigest,
    value.descriptorDigest,
    value.targetDigest,
    value.capabilityProfileDigest,
    value.capabilityDescriptorDigest,
    value.modelLineageDigest,
    value.adapterDigest,
    value.providerRequestDigest,
    value.responseDigest,
    value.dispatchIntentDigest,
    value.transportReceiptDigest,
    value.normalizedEventSetDigest,
    value.targetAuthorityDigest,
    value.sourceAuthorityImplementationDigest,
    value.registrationReceiptDigest,
    value.sourceDigest,
    value.sourceRequestDigest,
    value.ownerRequestDigest,
    value.ownerReceiptDigest,
    value.ownerStageDigest,
    value.ownerDispatchAckDigest,
    value.preEffectIntentDigest,
    value.effectSourceReceiptDigest,
    value.providerRuntimeJournalResultRecordDigest,
    value.providerRuntimeResultSealReceiptDigest,
    value.businessResultDigest,
  ].every(isAgentCanonicalDigest) &&
  (value.resultSpoolReceiptDigest === null ||
    isAgentCanonicalDigest(value.resultSpoolReceiptDigest)) &&
  (value.supportExpectation === 'required' ||
    value.supportExpectation === 'expected-blocked') &&
  isProtocolFamily(value.protocolFamily) &&
  (value.sourceKind === 'sealed-provider-response-metadata' ||
    value.sourceKind === 'sealed-hosted-owner-result') &&
  (value.outcome === 'observed' ||
    value.outcome === 'unavailable' ||
    value.outcome === 'failed') &&
  isAgentControlInstant(value.observedAt) &&
  isAgentControlInstant(value.sealedAt) &&
  Date.parse(value.sealedAt) >= Date.parse(value.observedAt) &&
  (value.outcome === 'observed'
    ? Object.hasOwn(value, 'fact') &&
      isAgentCanonicalDigest(value.resultSpoolReceiptDigest) &&
      isAgentCanonicalDigest(value.effectSourceFactDigest) &&
      isAgentEvaluationProviderCapabilityObservedFact(value.fact) &&
      value.fact.factDigest === value.effectSourceFactDigest
    : !Object.hasOwn(value, 'fact') && value.effectSourceFactDigest === null) &&
  isSelfDigest(value, 'sourceSealDigest', sourceSealDigest);

const nativeBootstrapSourceReceiptKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'targetId',
  'targetDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityDescriptorDigest',
  'capabilityId',
  'supportExpectation',
  'turnIndex',
  'invocationId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'providerRequestDigest',
  'responseDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'targetAuthorityDigest',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceAuthorityRouteBinding',
  'registrationAuthorityIssuerId',
  'registrationReceiptDigest',
  'sourceKind',
  'sourceDigest',
  'sourceRequestDigest',
  'ownerStageDigest',
  'ownerDispatchAckDigest',
  'nativeBootstrapSourceRequestDigest',
  'nativeBootstrapSourceReceiptDigest',
  'nativeProviderSourceReceiptDigest',
  'nativeProviderSourceDigest',
  'nativeProviderSourceFactDigest',
  'outcome',
  'observedAt',
  'sealedAt',
  'sourceSealDigest',
]);

const nativeBootstrapProfileIds = Object.freeze([
  'g4-provider-background-job',
  'g4-provider-isolated-cache',
  'g4-provider-reasoning-continuation',
] as const satisfies readonly AgentCapabilityProbeProfileId[]);

const resolveNativeBootstrapProgram = (
  request: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest
): AgentCapabilityProbeProgram | null => {
  const capabilityProfileId =
    request.runtimeFactSourceAuthority.capabilityProfileId;
  if (
    !nativeBootstrapProfileIds.includes(
      capabilityProfileId as (typeof nativeBootstrapProfileIds)[number]
    )
  ) {
    return null;
  }
  try {
    return createAgentCapabilityProbeProgram({
      capabilityProfileId:
        capabilityProfileId as (typeof nativeBootstrapProfileIds)[number],
      capabilityProfileDigest:
        request.runtimeFactSourceAuthority.capabilityProfileDigest,
    });
  } catch {
    return null;
  }
};

const nativeSourceDigest = (
  receipt: Readonly<Record<string, unknown>>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    kind: receipt.sourceKind,
    planDigest: receipt.planDigest,
    repositoryCommit: receipt.repositoryCommit,
    attemptId: receipt.attemptId,
    descriptorDigest: receipt.descriptorDigest,
    turnIndex: receipt.turnIndex,
    invocationId: receipt.invocationId,
    providerRequestDigest: receipt.providerRequestDigest,
    responseDigest: receipt.responseDigest,
    dispatchIntentDigest: receipt.dispatchIntentDigest,
    transportReceiptDigest: receipt.transportReceiptDigest,
    resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: receipt.normalizedEventSetDigest,
    nativeBootstrapSourceRequestDigest:
      receipt.nativeBootstrapSourceRequestDigest,
    nativeBootstrapSourceReceiptDigest:
      receipt.nativeBootstrapSourceReceiptDigest,
    ownerStageDigest: receipt.ownerStageDigest,
    ownerDispatchAckDigest: receipt.ownerDispatchAckDigest,
    nativeProviderSourceReceiptDigest:
      receipt.nativeProviderSourceReceiptDigest,
    nativeProviderSourceDigest: receipt.nativeProviderSourceDigest,
    nativeProviderSourceFactDigest: receipt.nativeProviderSourceFactDigest,
    outcome: receipt.outcome,
  });

const isOptionalNativeBootstrapFactSourceReceipt = (
  value: unknown,
  attemptId: string,
  turnIndex: number,
  sourceSealDigest: CanonicalDigest,
  bootstrapSourceRequest: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  bootstrapSourceReceipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null,
  bootstrapFact: AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact | null
): value is Readonly<Record<string, unknown>> => {
  if (
    !exactKeys(value, nativeBootstrapSourceReceiptKeys, ['fact']) ||
    value.format !==
      'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt' ||
    value.version !== 1 ||
    value.attemptId !== attemptId ||
    value.turnIndex !== turnIndex ||
    value.sourceSealDigest !== sourceSealDigest ||
    typeof value.repositoryCommit !== 'string' ||
    !repositoryCommitPattern.test(value.repositoryCommit) ||
    ![
      value.namespaceId,
      value.attemptId,
      value.targetId,
      value.capabilityProfileId,
      value.capabilityId,
      value.invocationId,
      value.providerConfigurationId,
      value.modelId,
      value.sourceAuthorityId,
      value.sourceAuthorityRouteBinding,
      value.registrationAuthorityIssuerId,
    ].every(isAgentControlIdentity) ||
    ![
      value.planDigest,
      value.descriptorDigest,
      value.targetDigest,
      value.capabilityProfileDigest,
      value.capabilityDescriptorDigest,
      value.modelLineageDigest,
      value.adapterDigest,
      value.providerRequestDigest,
      value.responseDigest,
      value.dispatchIntentDigest,
      value.transportReceiptDigest,
      value.resultSpoolReceiptDigest,
      value.normalizedEventSetDigest,
      value.targetAuthorityDigest,
      value.sourceAuthorityImplementationDigest,
      value.registrationReceiptDigest,
      value.sourceDigest,
      value.sourceRequestDigest,
      value.ownerStageDigest,
      value.ownerDispatchAckDigest,
      value.nativeBootstrapSourceRequestDigest,
      value.nativeBootstrapSourceReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    (value.supportExpectation !== 'required' &&
      value.supportExpectation !== 'expected-blocked') ||
    !isProtocolFamily(value.protocolFamily) ||
    value.sourceKind !== 'sealed-provider-response-metadata' ||
    (value.outcome !== 'observed' &&
      value.outcome !== 'unavailable' &&
      value.outcome !== 'failed') ||
    !isAgentControlInstant(value.observedAt) ||
    !isAgentControlInstant(value.sealedAt) ||
    Date.parse(value.sealedAt) < Date.parse(value.observedAt) ||
    value.namespaceId !== bootstrapSourceRequest.namespaceId ||
    value.planDigest !== bootstrapSourceRequest.planDigest ||
    value.repositoryCommit !== bootstrapSourceRequest.repositoryCommit ||
    value.attemptId !== bootstrapSourceRequest.attemptId ||
    value.descriptorDigest !== bootstrapSourceRequest.descriptorDigest ||
    value.turnIndex !== bootstrapSourceRequest.turnIndex ||
    value.invocationId !== bootstrapSourceRequest.invocationId ||
    value.providerRequestDigest !==
      bootstrapSourceRequest.providerRequestDigest ||
    value.responseDigest !== bootstrapSourceRequest.providerResponseDigest ||
    value.protocolFamily !== bootstrapSourceRequest.protocolFamily ||
    value.providerConfigurationId !==
      bootstrapSourceRequest.providerConfigurationId ||
    value.modelLineageDigest !== bootstrapSourceRequest.modelLineageDigest ||
    value.adapterDigest !== bootstrapSourceRequest.adapterDigest ||
    value.dispatchIntentDigest !==
      bootstrapSourceRequest.dispatchIntentDigest ||
    value.transportReceiptDigest !==
      bootstrapSourceRequest.transportReceiptDigest ||
    value.resultSpoolReceiptDigest !==
      bootstrapSourceRequest.resultSpoolReceiptDigest ||
    value.normalizedEventSetDigest !==
      bootstrapSourceRequest.normalizedEventSetDigest ||
    value.targetAuthorityDigest !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.authorityDigest ||
    value.sourceAuthorityId !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.sourceAuthorityId ||
    value.sourceAuthorityImplementationDigest !==
      bootstrapSourceRequest.runtimeFactSourceAuthority
        .sourceAuthorityImplementationDigest ||
    value.sourceAuthorityRouteBinding !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.routeBinding ||
    value.registrationAuthorityIssuerId !==
      bootstrapSourceRequest.runtimeFactSourceAuthority
        .registrationAuthorityIssuerId ||
    value.registrationReceiptDigest !==
      bootstrapSourceRequest.runtimeFactSourceAuthority
        .registrationReceiptDigest ||
    value.sourceKind !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.sourceKind ||
    value.capabilityProfileId !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.capabilityProfileId ||
    value.capabilityProfileDigest !==
      bootstrapSourceRequest.runtimeFactSourceAuthority
        .capabilityProfileDigest ||
    value.capabilityId !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.capabilityId ||
    value.modelId !==
      bootstrapSourceRequest.runtimeFactSourceAuthority.modelId ||
    value.nativeBootstrapSourceRequestDigest !==
      bootstrapSourceRequest.requestDigest ||
    value.nativeBootstrapSourceReceiptDigest !==
      bootstrapSourceReceipt.receiptDigest ||
    value.ownerStageDigest !== bootstrapSourceReceipt.sourceOwnerStageDigest ||
    value.ownerDispatchAckDigest !==
      bootstrapSourceReceipt.sourceOwnerDispatchAckDigest ||
    value.outcome !== bootstrapSourceRequest.outcome ||
    value.observedAt !== bootstrapSourceRequest.observedAt ||
    Date.parse(value.sealedAt) < Date.parse(bootstrapSourceReceipt.sealedAt) ||
    value.sourceDigest !== nativeSourceDigest(value) ||
    !isSelfDigest(value, 'sourceSealDigest', sourceSealDigest)
  ) {
    return false;
  }
  if (value.outcome === 'observed') {
    return (
      nativeSourceReceipt !== null &&
      bootstrapFact !== null &&
      Object.hasOwn(value, 'fact') &&
      isAgentCanonicalDigest(value.nativeProviderSourceReceiptDigest) &&
      isAgentCanonicalDigest(value.nativeProviderSourceDigest) &&
      isAgentCanonicalDigest(value.nativeProviderSourceFactDigest) &&
      value.nativeProviderSourceReceiptDigest ===
        nativeSourceReceipt.receiptDigest &&
      value.nativeProviderSourceDigest === nativeSourceReceipt.sourceDigest &&
      value.nativeProviderSourceFactDigest === bootstrapFact.factDigest &&
      sameCanonicalJson(
        nativeSourceReceipt,
        bootstrapSourceRequest.nativeSourceReceipt
      ) &&
      sameCanonicalJson(bootstrapFact, bootstrapSourceRequest.fact) &&
      sameCanonicalJson(bootstrapFact, value.fact)
    );
  }
  return (
    nativeSourceReceipt === null &&
    bootstrapFact === null &&
    bootstrapSourceRequest.nativeSourceReceipt === null &&
    bootstrapSourceRequest.fact === null &&
    value.nativeProviderSourceReceiptDigest === null &&
    value.nativeProviderSourceDigest === null &&
    value.nativeProviderSourceFactDigest === null &&
    !Object.hasOwn(value, 'fact')
  );
};

const effectSourceArchiveKeys = Object.freeze([
  'format',
  'version',
  'attemptId',
  'turnIndex',
  'sourceSealDigest',
  'sourceReceipt',
  'preEffectIntent',
  'effectSourceReceipt',
  'effectSourceFact',
  'recordDigest',
]);

const nativeBootstrapSourceArchiveKeys = Object.freeze([
  'format',
  'version',
  'attemptId',
  'turnIndex',
  'sourceSealDigest',
  'sourceReceipt',
  'bootstrapSourceRequest',
  'bootstrapSourceReceipt',
  'nativeSourceReceipt',
  'bootstrapFact',
  'stateVaultSealRequest',
  'stateVaultSealReceipt',
  'stateVaultResolveRequest',
  'stateVaultResolveReceipt',
  'stateVaultRetireRequest',
  'stateVaultRetirementReceipt',
  'recordDigest',
]);

const nativeStateVaultLifecycleMatches = (
  record: AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord,
  nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null
): boolean => {
  const sealRequest = record.stateVaultSealRequest;
  const sealReceipt = record.stateVaultSealReceipt;
  const resolveRequest = record.stateVaultResolveRequest;
  const resolveReceipt = record.stateVaultResolveReceipt;
  const retireRequest = record.stateVaultRetireRequest;
  const retirementReceipt = record.stateVaultRetirementReceipt;
  if (nativeSourceReceipt === null) {
    return (
      sealRequest === null &&
      sealReceipt === null &&
      resolveRequest === null &&
      resolveReceipt === null &&
      retireRequest === null &&
      retirementReceipt === null
    );
  }
  if (nativeSourceReceipt.source.sourceKind === 'provider-cache-usage') {
    return (
      sealRequest === null &&
      sealReceipt === null &&
      resolveRequest === null &&
      resolveReceipt === null &&
      retireRequest === null &&
      retirementReceipt === null
    );
  }
  if (
    sealRequest === null ||
    sealReceipt === null ||
    retireRequest === null ||
    retirementReceipt === null ||
    !isAgentNativeProviderStateVaultSealRequest(sealRequest) ||
    !isAgentNativeProviderStateVaultSealReceipt(sealReceipt, sealRequest) ||
    sealReceipt.status !== 'sealed' ||
    !isAgentNativeProviderStateVaultRetireRequest(retireRequest) ||
    !isAgentNativeProviderStateVaultRetirementReceipt(
      retirementReceipt,
      retireRequest,
      sealRequest,
      sealReceipt
    ) ||
    sealRequest.attemptId !== record.attemptId ||
    sealRequest.invocationId !== nativeSourceReceipt.invocationId ||
    sealRequest.requestDigest !== nativeSourceReceipt.requestDigest ||
    sealRequest.responseDigest !== nativeSourceReceipt.responseDigest ||
    sealRequest.protocolFamily !== nativeSourceReceipt.protocolFamily ||
    sealRequest.providerConfigurationId !==
      nativeSourceReceipt.providerConfigurationId ||
    sealRequest.modelLineageDigest !== nativeSourceReceipt.modelLineageDigest ||
    sealRequest.adapterDigest !== nativeSourceReceipt.adapterDigest ||
    sealRequest.providerStateReferenceDigest !==
      nativeSourceReceipt.source.providerStateReferenceDigest ||
    sealReceipt.opaqueProviderStateRef !==
      nativeSourceReceipt.source.opaqueProviderStateRef ||
    sealReceipt.authorityDigest !==
      nativeSourceReceipt.source.stateVaultAuthorityDigest ||
    sealRequest.sealRequestDigest !==
      nativeSourceReceipt.source.stateVaultSealRequestDigest ||
    sealReceipt.receiptDigest !==
      nativeSourceReceipt.source.stateVaultSealReceiptDigest ||
    retireRequest.sealRequestDigest !== sealRequest.sealRequestDigest ||
    retireRequest.sealReceiptDigest !== sealReceipt.receiptDigest
  ) {
    return false;
  }
  if (resolveRequest === null || resolveReceipt === null) {
    return (
      resolveRequest === null &&
      resolveReceipt === null &&
      retireRequest.resolveReceiptDigest === null
    );
  }
  return (
    isAgentNativeProviderStateVaultResolveRequest(
      resolveRequest,
      sealRequest,
      sealReceipt
    ) &&
    isAgentNativeProviderStateVaultResolveReceipt(
      resolveReceipt,
      resolveRequest
    ) &&
    retireRequest.resolveReceiptDigest === resolveReceipt.receiptDigest
  );
};

export const isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord =
  (
    value: unknown
  ): value is AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord => {
    if (
      !exactKeys(value, effectSourceArchiveKeys) ||
      value.format !==
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT ||
      value.version !==
        AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION ||
      !isAgentControlIdentity(value.attemptId) ||
      !Number.isSafeInteger(value.turnIndex) ||
      (value.turnIndex as number) < 0 ||
      (value.turnIndex as number) >= 7 ||
      !isAgentCanonicalDigest(value.sourceSealDigest) ||
      !isOptionalEffectFactSourceReceipt(
        value.sourceReceipt,
        value.attemptId as string,
        value.turnIndex as number,
        value.sourceSealDigest as CanonicalDigest
      ) ||
      !isAgentEvaluationCapabilityPreEffectIntent(value.preEffectIntent) ||
      !isAgentEvaluationCapabilityEffectSourceReceipt(
        value.effectSourceReceipt,
        value.preEffectIntent
      ) ||
      value.preEffectIntent.attemptId !== value.attemptId ||
      value.preEffectIntent.turnIndex !== value.turnIndex ||
      value.sourceReceipt.preEffectIntentDigest !==
        value.preEffectIntent.intentDigest ||
      value.sourceReceipt.effectSourceReceiptDigest !==
        value.effectSourceReceipt.receiptDigest ||
      value.sourceReceipt.providerRuntimeJournalResultRecordDigest !==
        value.effectSourceReceipt.providerRuntimeJournalResultRecordDigest ||
      value.sourceReceipt.providerRuntimeResultSealReceiptDigest !==
        value.effectSourceReceipt.providerRuntimeResultSealReceiptDigest ||
      value.sourceReceipt.registrationReceiptDigest !==
        value.effectSourceReceipt.registrationReceiptDigest ||
      value.sourceReceipt.targetAuthorityDigest !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.authorityDigest ||
      value.sourceReceipt.sourceAuthorityId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .sourceAuthorityId ||
      value.sourceReceipt.sourceAuthorityImplementationDigest !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .sourceAuthorityImplementationDigest ||
      value.sourceReceipt.sourceAuthorityRouteBinding !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.routeBinding ||
      value.sourceReceipt.registrationAuthorityIssuerId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .registrationAuthorityIssuerId ||
      value.sourceReceipt.sourceKind !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.sourceKind ||
      value.sourceReceipt.capabilityProfileId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .capabilityProfileId ||
      value.sourceReceipt.capabilityProfileDigest !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .capabilityProfileDigest ||
      value.sourceReceipt.capabilityId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.capabilityId ||
      value.sourceReceipt.protocolFamily !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.protocolFamily ||
      value.sourceReceipt.providerConfigurationId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .providerConfigurationId ||
      value.sourceReceipt.modelId !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.modelId ||
      value.sourceReceipt.modelLineageDigest !==
        value.effectSourceReceipt.runtimeFactSourceAuthority
          .modelLineageDigest ||
      value.sourceReceipt.adapterDigest !==
        value.effectSourceReceipt.runtimeFactSourceAuthority.adapterDigest ||
      value.sourceReceipt.planDigest !== value.preEffectIntent.planDigest ||
      value.sourceReceipt.repositoryCommit !==
        value.preEffectIntent.repositoryCommit ||
      value.sourceReceipt.descriptorDigest !==
        value.preEffectIntent.descriptorDigest ||
      value.sourceReceipt.invocationId !== value.preEffectIntent.invocationId ||
      value.sourceReceipt.providerRequestDigest !==
        value.preEffectIntent.providerRequestDigest ||
      value.sourceReceipt.ownerRequestDigest !==
        value.effectSourceReceipt.ownerRequestDigest ||
      value.sourceReceipt.ownerStageDigest !==
        value.effectSourceReceipt.stageDigest ||
      value.sourceReceipt.ownerDispatchAckDigest !==
        value.effectSourceReceipt.dispatchAckDigest ||
      value.sourceReceipt.transportReceiptDigest !==
        value.effectSourceReceipt.transportReceiptDigest ||
      value.sourceReceipt.resultSpoolReceiptDigest !==
        value.effectSourceReceipt.resultSpoolReceiptDigest ||
      value.sourceReceipt.normalizedEventSetDigest !==
        value.effectSourceReceipt.normalizedEventSetDigest ||
      value.sourceReceipt.businessResultDigest !==
        value.effectSourceReceipt.businessResultDigest ||
      !withinBytes(
        value,
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordBytes
      ) ||
      !isSelfDigest(value, 'recordDigest')
    ) {
      return false;
    }
    const observed = value.sourceReceipt.outcome === 'observed';
    return observed
      ? isAgentEvaluationProviderCapabilityObservedFact(
          value.effectSourceFact
        ) &&
          value.effectSourceReceipt.effectStatus === 'produced' &&
          value.effectSourceFact.factKind ===
            value.effectSourceReceipt.sourceFactKind &&
          value.effectSourceFact.factDigest ===
            value.effectSourceReceipt.sourceFactDigest &&
          value.effectSourceFact.factDigest ===
            value.sourceReceipt.effectSourceFactDigest &&
          sameCanonicalJson(value.effectSourceFact, value.sourceReceipt.fact)
      : value.effectSourceFact === null &&
          value.effectSourceReceipt.effectStatus ===
            value.sourceReceipt.outcome &&
          value.effectSourceReceipt.sourceFactKind === null &&
          value.effectSourceReceipt.sourceFactDigest === null;
  };

/** Exact offline join between the Provider runtime journal and its outer source seal. */
export const matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource =
  (
    runtimeRecord: AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
    sourceRecord: AgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord
  ): boolean => {
    if (
      !isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord(
        runtimeRecord
      ) ||
      !isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(
        sourceRecord
      )
    ) {
      return false;
    }
    const result = runtimeRecord.resultRecord;
    const resultSeal = result.resultSealReceipt;
    const terminal = runtimeRecord.executionRecords.at(-1);
    const receipt = sourceRecord.effectSourceReceipt;
    if (terminal === undefined) return false;
    return (
      runtimeRecord.attemptId === sourceRecord.attemptId &&
      runtimeRecord.turnIndex === sourceRecord.turnIndex &&
      runtimeRecord.ownerRequestDigest === receipt.ownerRequestDigest &&
      runtimeRecord.preEffectIntentDigest ===
        sourceRecord.preEffectIntent.intentDigest &&
      runtimeRecord.effectSourceReceiptDigest === receipt.receiptDigest &&
      result.recordDigest ===
        receipt.providerRuntimeJournalResultRecordDigest &&
      resultSeal.receiptDigest ===
        receipt.providerRuntimeResultSealReceiptDigest &&
      sameCanonicalJson(
        runtimeRecord.stageRecord.stageRequest.stateVaultResolveRequest,
        receipt.stateVaultResolveRequest
      ) &&
      sameCanonicalJson(
        runtimeRecord.stageRecord.stageRequest.stateVaultResolveReceipt,
        receipt.stateVaultResolveReceipt
      ) &&
      sameCanonicalJson(
        result.stateVaultRetireRequest,
        receipt.stateVaultRetireRequest
      ) &&
      sameCanonicalJson(
        result.stateVaultRetirementReceipt,
        receipt.stateVaultRetirementReceipt
      ) &&
      result.sealedAt === receipt.sealedAt &&
      resultSeal.sealedAt === receipt.sealedAt &&
      terminal.executionReceipt.transportReceipt.receiptDigest ===
        receipt.transportReceiptDigest &&
      (terminal.executionReceipt.resultSpoolReceipt?.receiptDigest ?? null) ===
        receipt.resultSpoolReceiptDigest &&
      terminal.executionReceipt.responseProjection.normalizedEventSetDigest ===
        receipt.normalizedEventSetDigest &&
      result.businessResult.resultDigest === receipt.businessResultDigest &&
      resultSeal.resultStatus === receipt.effectStatus &&
      resultSeal.sourceFactKind === receipt.sourceFactKind &&
      resultSeal.sourceFactDigest === receipt.sourceFactDigest &&
      sameCanonicalJson(result.effectSourceFact, sourceRecord.effectSourceFact)
    );
  };

export const isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord =
  (
    value: unknown
  ): value is AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord => {
    if (
      !exactKeys(value, nativeBootstrapSourceArchiveKeys) ||
      value.format !==
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT ||
      value.version !==
        AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION ||
      !isAgentControlIdentity(value.attemptId) ||
      !Number.isSafeInteger(value.turnIndex) ||
      (value.turnIndex as number) < 0 ||
      (value.turnIndex as number) >= 7 ||
      !isAgentCanonicalDigest(value.sourceSealDigest) ||
      !isPlainObject(value.bootstrapSourceRequest)
    ) {
      return false;
    }
    const bootstrapSourceRequest =
      value.bootstrapSourceRequest as AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest;
    const program = resolveNativeBootstrapProgram(bootstrapSourceRequest);
    if (
      program === null ||
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        bootstrapSourceRequest,
        program
      ) ||
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        value.bootstrapSourceReceipt,
        program
      )
    ) {
      return false;
    }
    const bootstrapSourceReceipt =
      value.bootstrapSourceReceipt as AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt;
    if (
      !sameCanonicalJson(
        bootstrapSourceReceipt.sourceRequest,
        bootstrapSourceRequest
      ) ||
      bootstrapSourceReceipt.sourceRequestDigest !==
        bootstrapSourceRequest.requestDigest ||
      value.attemptId !== bootstrapSourceRequest.attemptId ||
      value.turnIndex !== bootstrapSourceRequest.turnIndex ||
      !withinBytes(
        value,
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordBytes
      ) ||
      !isSelfDigest(value, 'recordDigest')
    ) {
      return false;
    }
    const nativeSourceReceipt =
      value.nativeSourceReceipt as AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    const bootstrapFact =
      value.bootstrapFact as AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact | null;
    if (
      bootstrapSourceRequest.outcome === 'observed'
        ? !isAgentNativeProviderOptionalCapabilitySourceReceipt(
            nativeSourceReceipt,
            program
          ) || !isAgentEvaluationProviderCapabilityObservedFact(bootstrapFact)
        : nativeSourceReceipt !== null || bootstrapFact !== null
    ) {
      return false;
    }
    return (
      isOptionalNativeBootstrapFactSourceReceipt(
        value.sourceReceipt,
        value.attemptId as string,
        value.turnIndex as number,
        value.sourceSealDigest as CanonicalDigest,
        bootstrapSourceRequest,
        bootstrapSourceReceipt,
        nativeSourceReceipt,
        bootstrapFact
      ) &&
      nativeStateVaultLifecycleMatches(
        value as AgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord,
        nativeSourceReceipt
      )
    );
  };

export const isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord = (
  value: unknown
): value is AgentEvaluationOptionalCapabilityFactSourceArchiveRecord =>
  isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(value) ||
  isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
    value
  );

export const createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord = (
  input: ArchiveRecordInput<AgentEvaluationOptionalCapabilityFactSourceArchiveRecord>
): AgentEvaluationOptionalCapabilityFactSourceArchiveRecord => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_RECORD_FORMAT,
    version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
    ...input,
  });
  const record = Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(record)) {
    throw new TypeError(
      'Optional capability fact source archive record is invalid.'
    );
  }
  return record;
};

const authorityStageRequestKeys = Object.freeze([
  'format',
  'version',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'sourceSealDigest',
]);
const authorityResponseKeys = Object.freeze([
  'format',
  'version',
  'outcome',
  'authorityRequestDigest',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'stageDigest',
  'dispatchAckDigest',
  'runtimeFactEnvelopes',
  'factAuthorities',
  'resultDigest',
]);

type OptionalFactAuthoritySealedResponse = Readonly<
  Record<string, unknown> & {
    outcome: 'observed' | 'unavailable' | 'failed';
    runtimeFactEnvelopes: readonly unknown[];
    factAuthorities: readonly unknown[];
  }
>;

const isOptionalFactAuthorityStageRequest = (
  value: unknown,
  record: Readonly<Record<string, unknown>>
): value is Readonly<Record<string, unknown>> =>
  exactKeys(value, authorityStageRequestKeys) &&
  value.format ===
    'prodivix.agent-evaluation-optional-capability-fact-authority-stage-request' &&
  value.version === 1 &&
  isAgentCanonicalDigest(value.planDigest) &&
  typeof value.repositoryCommit === 'string' &&
  repositoryCommitPattern.test(value.repositoryCommit) &&
  value.attemptId === record.attemptId &&
  value.turnIndex === record.turnIndex &&
  value.sourceSealDigest === record.sourceSealDigest &&
  isAgentCanonicalDigest(value.descriptorDigest) &&
  digestAgentCanonicalValue(value) === record.authorityRequestDigest;

const isOptionalFactAuthorityResponse = (
  value: unknown,
  record: Readonly<Record<string, unknown>>
): value is OptionalFactAuthoritySealedResponse =>
  exactKeys(value, authorityResponseKeys) &&
  value.format ===
    'prodivix.agent-evaluation-optional-capability-fact-authority-response' &&
  value.version === 1 &&
  (value.outcome === 'observed' ||
    value.outcome === 'unavailable' ||
    value.outcome === 'failed') &&
  value.authorityRequestDigest === record.authorityRequestDigest &&
  value.stageDigest === record.stageDigest &&
  value.dispatchAckDigest === record.dispatchAckDigest &&
  isAgentControlIdentity(value.sourceAuthorityId) &&
  isAgentCanonicalDigest(value.sourceAuthorityImplementationDigest) &&
  Array.isArray(value.runtimeFactEnvelopes) &&
  Array.isArray(value.factAuthorities) &&
  isSelfDigest(value, 'resultDigest', record.resultDigest);

const authorityArchiveKeys = Object.freeze([
  'format',
  'version',
  'attemptId',
  'turnIndex',
  'sourceSealDigest',
  'authorityRequestDigest',
  'stageDigest',
  'dispatchAckDigest',
  'resultDigest',
  'stageRequest',
  'fact',
  'runtimeFactEnvelope',
  'factAuthority',
  'sealedResponse',
  'recordDigest',
]);

export const isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord = (
  value: unknown
): value is AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord => {
  if (
    !exactKeys(value, authorityArchiveKeys) ||
    value.format !==
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_RECORD_FORMAT ||
    value.version !==
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION ||
    !isAgentControlIdentity(value.attemptId) ||
    !Number.isSafeInteger(value.turnIndex) ||
    (value.turnIndex as number) < 0 ||
    (value.turnIndex as number) >= 7 ||
    ![
      value.sourceSealDigest,
      value.authorityRequestDigest,
      value.stageDigest,
      value.dispatchAckDigest,
      value.resultDigest,
      value.recordDigest,
    ].every(isAgentCanonicalDigest) ||
    !isOptionalFactAuthorityStageRequest(value.stageRequest, value) ||
    !isOptionalFactAuthorityResponse(value.sealedResponse, value) ||
    !withinBytes(
      value,
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordBytes
    ) ||
    !isSelfDigest(value, 'recordDigest')
  ) {
    return false;
  }
  const observed = value.sealedResponse.outcome === 'observed';
  if (!observed) {
    return (
      value.fact === null &&
      value.runtimeFactEnvelope === null &&
      value.factAuthority === null &&
      value.sealedResponse.runtimeFactEnvelopes.length === 0 &&
      value.sealedResponse.factAuthorities.length === 0
    );
  }
  return (
    isAgentEvaluationProviderCapabilityObservedFact(value.fact) &&
    isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      value.runtimeFactEnvelope
    ) &&
    isAgentEvaluationProviderCapabilityFactAuthority(value.factAuthority) &&
    value.runtimeFactEnvelope.fact.factKind === value.fact.factKind &&
    value.runtimeFactEnvelope.fact.factDigest === value.fact.factDigest &&
    sameCanonicalJson(value.runtimeFactEnvelope.fact, value.fact) &&
    value.factAuthority.factKind === value.fact.factKind &&
    value.factAuthority.factDigest === value.fact.factDigest &&
    value.factAuthority.sourceAuthorityKind === 'shared-durable-capability' &&
    value.runtimeFactEnvelope.sourceAuthorityKind ===
      'shared-durable-capability' &&
    value.factAuthority.runtimeFactEnvelopeDigest ===
      value.runtimeFactEnvelope.envelopeDigest &&
    value.factAuthority.sourceAuthorityId ===
      value.sealedResponse.sourceAuthorityId &&
    value.factAuthority.sourceAuthorityImplementationDigest ===
      value.sealedResponse.sourceAuthorityImplementationDigest &&
    value.factAuthority.sourceKind === value.runtimeFactEnvelope.sourceKind &&
    value.factAuthority.routeBinding ===
      value.runtimeFactEnvelope.routeBinding &&
    value.factAuthority.registrationAuthorityIssuerId ===
      value.runtimeFactEnvelope.registrationAuthorityIssuerId &&
    value.factAuthority.registrationReceiptDigest ===
      value.runtimeFactEnvelope.registrationReceiptDigest &&
    value.factAuthority.runtimeFactSourceAuthorityDigest ===
      value.runtimeFactEnvelope.runtimeFactSourceAuthorityDigest &&
    value.factAuthority.stageDigest === value.runtimeFactEnvelope.stageDigest &&
    value.factAuthority.dispatchAckDigest ===
      value.runtimeFactEnvelope.dispatchAckDigest &&
    value.factAuthority.transportReceiptDigest ===
      value.runtimeFactEnvelope.transportReceiptDigest &&
    value.factAuthority.resultSpoolReceiptDigest ===
      value.runtimeFactEnvelope.resultSpoolReceiptDigest &&
    value.factAuthority.normalizedEventSetDigest ===
      value.runtimeFactEnvelope.normalizedEventSetDigest &&
    value.sealedResponse.runtimeFactEnvelopes.length === 1 &&
    value.sealedResponse.factAuthorities.length === 1 &&
    sameCanonicalJson(
      value.sealedResponse.runtimeFactEnvelopes[0],
      value.runtimeFactEnvelope
    ) &&
    sameCanonicalJson(
      value.sealedResponse.factAuthorities[0],
      value.factAuthority
    )
  );
};

export const createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord =
  (
    input: ArchiveRecordInput<AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord>
  ): AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_RECORD_FORMAT,
      version: AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_RECORD_VERSION,
      ...input,
    });
    const record = Object.freeze({
      ...base,
      recordDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord(record)
    ) {
      throw new TypeError(
        'Optional capability fact authority archive record is invalid.'
      );
    }
    return record;
  };

export const isAgentEvaluationQualificationAuthorityArchiveRecord = (
  family: AgentEvaluationQualificationAuthorityArchiveFamily,
  value: unknown
): value is AgentEvaluationQualificationAuthorityArchiveRecord => {
  switch (family) {
    case 'capabilityProbeAdmissions':
      return isAgentEvaluationCapabilityProbeAdmissionArchiveRecord(value);
    case 'capabilityProbeReferenceReceipts':
      return isAgentEvaluationCapabilityProbeReferenceArchiveRecord(value);
    case 'runtimeFactSourceOwnerRegistrations':
      return isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord(value);
    case 'capabilityProbeProviderResourceCleanups':
      return isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord(
        value
      );
    case 'hostedRetrievalRuntimeResourceLifecycleJournals':
      return isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
        value
      );
    case 'hostedRetrievalRuntimeResourceCleanups':
      return isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord(value);
    case 'capabilityEffectProviderRuntimeJournals':
      return isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord(
        value
      );
    case 'optionalCapabilityFactSources':
      return isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord(value);
    case 'optionalCapabilityFactAuthorities':
      return isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord(
        value
      );
  }
};

/** Fail-closed projection used by archive ordering and semantic set roots. */
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'capabilityProbeAdmissions',
  value: unknown
): AgentEvaluationCapabilityProbeAdmissionArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'capabilityProbeReferenceReceipts',
  value: unknown
): AgentEvaluationCapabilityProbeReferenceArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'runtimeFactSourceOwnerRegistrations',
  value: unknown
): AgentEvaluationRuntimeFactSourceRegistrationArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'capabilityProbeProviderResourceCleanups',
  value: unknown
): AgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'hostedRetrievalRuntimeResourceLifecycleJournals',
  value: unknown
): AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'hostedRetrievalRuntimeResourceCleanups',
  value: unknown
): AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'capabilityEffectProviderRuntimeJournals',
  value: unknown
): AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'optionalCapabilityFactSources',
  value: unknown
): AgentEvaluationOptionalCapabilityFactSourceArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: 'optionalCapabilityFactAuthorities',
  value: unknown
): AgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: AgentEvaluationQualificationAuthorityArchiveFamily,
  value: unknown
): AgentEvaluationQualificationAuthorityArchiveRecord;
export function projectAgentEvaluationQualificationAuthorityArchiveRecord(
  family: AgentEvaluationQualificationAuthorityArchiveFamily,
  value: unknown
): AgentEvaluationQualificationAuthorityArchiveRecord {
  if (!isAgentEvaluationQualificationAuthorityArchiveRecord(family, value)) {
    throw new TypeError(
      `Evaluation qualification authority archive ${family} record is invalid.`
    );
  }
  return value;
}

export const isAgentEvaluationQualificationAuthorityArchiveFamilyBudget = (
  family: AgentEvaluationQualificationAuthorityArchiveFamily,
  recordCount: number,
  canonicalBytes: number
): boolean => {
  if (
    !Number.isSafeInteger(recordCount) ||
    recordCount < 0 ||
    !Number.isSafeInteger(canonicalBytes) ||
    canonicalBytes < 0
  ) {
    return false;
  }
  switch (family) {
    case 'capabilityProbeAdmissions':
      return (
        recordCount <=
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'capabilityProbeReferenceReceipts':
      return (
        recordCount <=
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'runtimeFactSourceOwnerRegistrations':
      return (
        recordCount <=
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'capabilityProbeProviderResourceCleanups':
      return (
        recordCount <=
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'hostedRetrievalRuntimeResourceLifecycleJournals':
      return (
        (recordCount === 0 ||
          (recordCount >=
            AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.minimumRecordCount &&
            recordCount <=
              AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumRecordCount)) &&
        canonicalBytes <=
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'hostedRetrievalRuntimeResourceCleanups':
      return (
        (recordCount === 0 ||
          recordCount ===
            AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount) &&
        canonicalBytes <=
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'capabilityEffectProviderRuntimeJournals':
      return isAgentEvaluationCapabilityEffectProviderRuntimeArchiveFamilyBudget(
        recordCount,
        canonicalBytes
      );
    case 'optionalCapabilityFactSources':
      return (
        recordCount <=
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes
      );
    case 'optionalCapabilityFactAuthorities':
      return (
        recordCount <=
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount &&
        canonicalBytes <=
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumFamilyBytes
      );
  }
};

/**
 * Final archive completeness join for the pre-plan hosted intent and the
 * post-plan exact-four runtime resource lifecycle family.
 */
export const isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan =
  (
    plan: unknown,
    records: unknown
  ): records is readonly AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[] => {
    if (!isAgentModelEvaluationPlan(plan) || !Array.isArray(records)) {
      return false;
    }
    const expectedIntentBindings = (
      plan as AgentModelEvaluationPlan
    ).capabilityQualificationTargets
      .flatMap(({ optionalCapabilitySupportAuthority }) => {
        const authority =
          optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
        const registrationIntentDigest =
          authority?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
        return authority && registrationIntentDigest
          ? [
              Object.freeze({
                key: `${authority.protocolFamily}\u0000${authority.capabilityProfileId}`,
                registrationIntentDigest,
              }),
            ]
          : [];
      })
      .sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
    const requiresHostedRuntimeResources = expectedIntentBindings.length > 0;
    if (
      requiresHostedRuntimeResources &&
      (expectedIntentBindings.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
        new Set(expectedIntentBindings.map(({ key }) => key)).size !==
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT)
    ) {
      return false;
    }
    if (!requiresHostedRuntimeResources) {
      return records.length === 0;
    }
    if (!isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(records)) {
      return false;
    }
    const archivedIntentBindings = records
      .map(({ registrationResult }) => {
        const request = registrationResult.registrationRequest;
        return Object.freeze({
          key: `${request.protocolFamily}\u0000${request.capabilityProfileId}`,
          registrationIntentDigest: request.registrationIntentDigest,
        });
      })
      .sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
    return (
      sameCanonicalJson(expectedIntentBindings, archivedIntentBindings) &&
      records.every(
        (record) =>
          record.planDigest === plan.planDigest &&
          record.repositoryCommit === plan.repositoryCommit
      )
    );
  };

/**
 * Release completeness join for the exact-four hosted resource creations and
 * their immutable lifecycle journal cleanup closure.
 */
export const isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyCompleteForPlan =
  (
    plan: unknown,
    records: unknown
  ): records is readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[] => {
    if (!isAgentModelEvaluationPlan(plan) || !Array.isArray(records)) {
      return false;
    }
    const expectedIntentBindings = (
      plan as AgentModelEvaluationPlan
    ).capabilityQualificationTargets
      .flatMap(({ optionalCapabilitySupportAuthority }) => {
        const authority =
          optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
        const registrationIntentDigest =
          authority?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
        return authority && registrationIntentDigest
          ? [
              Object.freeze({
                key: `${authority.protocolFamily}\u0000${authority.capabilityProfileId}`,
                registrationIntentDigest,
              }),
            ]
          : [];
      })
      .sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
    if (expectedIntentBindings.length === 0) {
      return records.length === 0;
    }
    if (
      expectedIntentBindings.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      new Set(expectedIntentBindings.map(({ key }) => key)).size !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    ) {
      return false;
    }
    try {
      const family =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          records
        );
      if (family.closureStatus !== 'zeroed') return false;
      const creationRecords = family.records.filter(
        ({ journalRecord }) => journalRecord.operation === 'create'
      );
      if (
        creationRecords.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
      ) {
        return false;
      }
      const archivedIntentBindings = creationRecords
        .map(({ journalRecord }) => {
          const intent = journalRecord.dispatchIntentSet.intents[0];
          if (!intent)
            throw new TypeError('Lifecycle create intent is absent.');
          return Object.freeze({
            key: `${intent.protocolFamily}\u0000${intent.capabilityProfileId}`,
            registrationIntentDigest: intent.registrationIntentDigest,
          });
        })
        .sort((left, right) => compareUnicodeCodePoints(left.key, right.key));
      return (
        family.planDigest === plan.planDigest &&
        family.repositoryCommit === plan.repositoryCommit &&
        sameCanonicalJson(expectedIntentBindings, archivedIntentBindings)
      );
    } catch {
      return false;
    }
  };
