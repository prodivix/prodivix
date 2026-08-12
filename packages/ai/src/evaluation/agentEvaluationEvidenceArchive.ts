import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  type AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
} from '../providers/agentHostedRetrievalRuntimeResource';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES,
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import { AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES } from './agentEvaluationCapabilitySpecificReceipt';
import {
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES,
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_PLANNED_TURNS,
} from './agentEvaluationProviderCapabilityObservation';
import {
  isAgentEvaluationProductionRunConfigArtifactBinding,
  type AgentEvaluationProductionRunConfigArtifactBinding,
} from './agentEvaluationFrozenConfigCommitment';
import {
  AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES,
  AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS,
  isAgentEvaluationQualificationAuthorityArchiveFamilyBudget,
  projectAgentEvaluationQualificationAuthorityArchiveRecord,
  type AgentEvaluationQualificationAuthorityArchiveFamily,
} from './agentEvaluationEvidenceArchiveAuthorityRecords';

export * from './agentEvaluationEvidenceArchiveAuthorityRecords';

export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_FORMAT =
  'prodivix.agent-model-evaluation-evidence-record' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_VERSION =
  1 as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FORMAT =
  'prodivix.agent-model-evaluation-evidence-index' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_VERSION = 1 as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_FORMAT =
  'prodivix.agent-model-evaluation-evidence-archive-attestation' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_VERSION =
  1 as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_FORMAT =
  'prodivix.agent-model-evaluation-evidence-root' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_VERSION = 2 as const;

export const AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME =
  'evidence-index.json' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME =
  'shards' as const;

export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS = Object.freeze({
  maximumRecordCanonicalBytes: 16 * 1_024 * 1_024,
  maximumShardBytes: 32 * 1_024 * 1_024,
  maximumIndexBytes: 8 * 1_024 * 1_024,
  maximumRootBytes: 1 * 1_024 * 1_024,
  maximumArchiveBytes: 8 * 1_024 * 1_024 * 1_024,
  maximumShards: 4_096,
  maximumRecords: 2_000_000,
  maximumRecordsPerPage: 256,
  maximumJsonDepth: 128,
});

/** Preflight budget for the frozen 14,040-journey release plan. */
export const AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET =
  Object.freeze({
    plannedJourneyCount: 14_040,
    maximumReceiptsPerAttempt: 2,
    maximumRecordCount: 14_040 * 2,
    maximumCanonicalRecordBytes:
      AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES,
    maximumCanonicalFamilyBytes:
      14_040 * 2 * AGENT_EVALUATION_CAPABILITY_SPECIFIC_MAXIMUM_RECEIPT_BYTES,
  });

export const isAgentEvaluationCapabilitySpecificArchiveBudget = (
  recordCount: number,
  canonicalValueBytes: number
): boolean =>
  Number.isSafeInteger(recordCount) &&
  recordCount >= 0 &&
  recordCount <=
    AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumRecordCount &&
  Number.isSafeInteger(canonicalValueBytes) &&
  canonicalValueBytes >= 0 &&
  canonicalValueBytes <=
    AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes;

/** Bounded external authority journal projection for every frozen attempt. */
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET =
  Object.freeze({
    plannedJourneyCount: 14_040,
    maximumReceiptsPerAttempt:
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
    maximumRecordCount:
      14_040 *
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
    maximumCanonicalRecordBytes:
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES,
    maximumCanonicalFamilyBytes:
      14_040 *
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT *
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPT_BYTES,
  });

export const isAgentEvaluationAttemptAuthorityOwnerArchiveBudget = (
  recordCount: number,
  canonicalValueBytes: number
): boolean =>
  Number.isSafeInteger(recordCount) &&
  recordCount >= 0 &&
  recordCount <=
    AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumRecordCount &&
  Number.isSafeInteger(canonicalValueBytes) &&
  canonicalValueBytes >= 0 &&
  canonicalValueBytes <=
    AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes;

/** One authoritative native-provider observation for each bounded invocation turn. */
export const AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET =
  Object.freeze({
    plannedJourneyCount: 14_040,
    maximumTurnsPerAttempt: 7,
    maximumRecordCount:
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_PLANNED_TURNS,
    maximumCanonicalRecordBytes:
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES,
    maximumCanonicalFamilyBytes:
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_PLANNED_TURNS *
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_BYTES,
  });

export const isAgentEvaluationProviderCapabilityObservationArchiveBudget = (
  recordCount: number,
  canonicalValueBytes: number
): boolean =>
  Number.isSafeInteger(recordCount) &&
  recordCount >= 0 &&
  recordCount <=
    AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET.maximumRecordCount &&
  Number.isSafeInteger(canonicalValueBytes) &&
  canonicalValueBytes >= 0 &&
  canonicalValueBytes <=
    AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes;

export type AgentEvaluationCapabilityAuthorityArchiveUsage = Readonly<{
  capabilitySpecificRecordCount: number;
  capabilitySpecificCanonicalBytes: number;
  attemptAuthorityOwnerRecordCount: number;
  attemptAuthorityOwnerCanonicalBytes: number;
  providerCapabilityObservationRecordCount: number;
  providerCapabilityObservationCanonicalBytes: number;
}>;

export const AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET =
  Object.freeze({
    maximumRecordCount:
      AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumRecordCount +
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumRecordCount +
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET.maximumRecordCount,
    maximumCanonicalBytes:
      AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes +
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes +
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET.maximumCanonicalFamilyBytes,
  });

/** Complete model-evaluation authority capacity, including nine raw qualification families. */
export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET =
  Object.freeze({
    maximumRecordCount:
      AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET.maximumRecordCount +
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount,
    maximumCanonicalBytes:
      AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET.maximumCanonicalBytes +
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes,
  });

export const isAgentEvaluationCapabilityAuthorityArchiveBudget = (
  usage: AgentEvaluationCapabilityAuthorityArchiveUsage
): boolean =>
  isAgentEvaluationCapabilitySpecificArchiveBudget(
    usage.capabilitySpecificRecordCount,
    usage.capabilitySpecificCanonicalBytes
  ) &&
  isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
    usage.attemptAuthorityOwnerRecordCount,
    usage.attemptAuthorityOwnerCanonicalBytes
  ) &&
  isAgentEvaluationProviderCapabilityObservationArchiveBudget(
    usage.providerCapabilityObservationRecordCount,
    usage.providerCapabilityObservationCanonicalBytes
  ) &&
  usage.capabilitySpecificRecordCount +
    usage.attemptAuthorityOwnerRecordCount +
    usage.providerCapabilityObservationRecordCount <=
    AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET.maximumRecordCount &&
  usage.capabilitySpecificCanonicalBytes +
    usage.attemptAuthorityOwnerCanonicalBytes +
    usage.providerCapabilityObservationCanonicalBytes <=
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes;

export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES = Object.freeze([
  'plan',
  'capabilityProbeAdmissions',
  'capabilityProbeReferenceReceipts',
  'runtimeFactSourceOwnerRegistrations',
  'capabilityProbeProviderResourceCleanups',
  'hostedRetrievalRuntimeResourceLifecycleJournals',
  'hostedRetrievalRuntimeResourceCleanups',
  'capabilityEffectProviderRuntimeJournals',
  'optionalCapabilityFactSources',
  'optionalCapabilityFactAuthorities',
  'endpointSmokeDispatchIntents',
  'endpointSmokeTransportReceipts',
  'endpointSmokeResultSpoolReceipts',
  'endpointSmokeResultSpoolDispositionReceipts',
  'endpointSmokeValidationFailureReceipts',
  'endpointSmokeReceipts',
  'preDispatchFailureReceipts',
  'transportDispatchIntents',
  'transportReceipts',
  'providerResultSpoolReceipts',
  'providerResultSpoolDispositionReceipts',
  'invocationTurnReceipts',
  'invocationTurnSetReceipts',
  'resultSubmissionReceipts',
  'attemptAuthorityOwnerReceipts',
  'verificationAttemptGrantReceipts',
  'controlledRuntimeReceipts',
  'capabilityExecutionReceipts',
  'capabilitySpecificReceipts',
  'providerCapabilityObservationReceipts',
  'validatedHumanReviewArtifacts',
  'validatedHumanMetricObservations',
  'reviewRasterScanReceipts',
  'reviewCandidateRefs',
  'blindReviewMappingRefs',
  'sourceReceipts',
  'executionReceipts',
  'attempts',
  'checkpoints',
  'budgetLedger',
  'metricReport',
  'graderReport',
  'humanReviewReport',
  'holdoutExecutionReceipt',
  'authorityAttestation',
  'manifest',
] as const);

export type AgentEvaluationEvidenceArchiveFamily =
  (typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES)[number];

export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES =
  Object.freeze([
    'plan',
    'budgetLedger',
    'metricReport',
    'graderReport',
    'humanReviewReport',
    'holdoutExecutionReceipt',
    'authorityAttestation',
    'manifest',
  ] as const satisfies readonly AgentEvaluationEvidenceArchiveFamily[]);

const familySet = new Set<string>(
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES
);
const singletonFamilySet = new Set<string>(
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES
);
const utf8Encoder = new TextEncoder();
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const canonicalBase64UrlPattern = /^[A-Za-z0-9_-]+$/u;

export type AgentModelEvaluationEvidenceArchiveRecord = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_VERSION;
  family: AgentEvaluationEvidenceArchiveFamily;
  recordIndex: number;
  orderKey: string;
  recordDigest: CanonicalDigest;
  value: unknown;
}>;

export type AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage = Readonly<{
  family: AgentEvaluationEvidenceArchiveFamily;
  recordCount: number;
  canonicalValueBytes: number;
  canonicalOrderKeyBytes: number;
  canonicalRecordWrapperBytes: number;
  shardBytes: number;
}>;

export interface AgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator {
  readonly family: AgentEvaluationEvidenceArchiveFamily;
  readonly count: number;
  append(record: AgentModelEvaluationEvidenceArchiveRecord): void;
  finalize(): AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage;
}

export type AgentModelEvaluationEvidenceArchivePhysicalCapacity = Readonly<{
  totalRecordCount: number;
  totalShardBytes: number;
  indexBytes: number;
  rootBytes: number;
}>;

export type AgentModelEvaluationEvidenceArchivePhysicalBudget = Readonly<{
  familyUsages: readonly AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage[];
  totalRecordCount: number;
  totalCanonicalValueBytes: number;
  totalCanonicalOrderKeyBytes: number;
  totalCanonicalRecordWrapperBytes: number;
  totalShardBytes: number;
  indexBytes: number;
  rootBytes: number;
  totalArchiveBytes: number;
}>;

export type AgentModelEvaluationEvidenceArchiveShardDescriptor = Readonly<{
  sequence: number;
  family: AgentEvaluationEvidenceArchiveFamily;
  familyShardIndex: number;
  fileName: string;
  firstRecordIndex: number;
  lastRecordIndex: number;
  firstOrderKey: string;
  lastOrderKey: string;
  recordCount: number;
  byteSize: number;
  bytesDigest: CanonicalDigest;
  recordSetDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationEvidenceArchiveFamilySummary = Readonly<{
  family: AgentEvaluationEvidenceArchiveFamily;
  familyIndex: number;
  recordCount: number;
  semanticDigest: CanonicalDigest;
  recordSetDigest: CanonicalDigest;
  shardCount: number;
  firstOrderKey: string | null;
  lastOrderKey: string | null;
}>;

export type AgentModelEvaluationEvidenceArchiveAuthorityRoots = Readonly<{
  capabilityProbeAdmissionSetDigest: CanonicalDigest;
  capabilityProbeReferenceReceiptSetDigest: CanonicalDigest;
  runtimeFactSourceOwnerRegistrationSetDigest: CanonicalDigest;
  capabilityProbeProviderResourceCleanupSetDigest: CanonicalDigest;
  hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: CanonicalDigest;
  hostedRetrievalRuntimeResourceCleanupSetDigest: CanonicalDigest;
  capabilityEffectProviderRuntimeJournalSetDigest: CanonicalDigest;
  optionalCapabilityFactSourceSetDigest: CanonicalDigest;
  optionalCapabilityFactAuthoritySetDigest: CanonicalDigest;
  endpointSmokeSetDigest: CanonicalDigest;
  endpointSmokeDispatchIntentSetDigest: CanonicalDigest;
  endpointSmokeTransportReceiptSetDigest: CanonicalDigest;
  endpointSmokeResultSpoolReceiptSetDigest: CanonicalDigest;
  endpointSmokeResultSpoolDispositionReceiptSetDigest: CanonicalDigest;
  endpointSmokeValidationFailureReceiptSetDigest: CanonicalDigest;
  preDispatchFailureReceiptSetDigest: CanonicalDigest;
  transportDispatchIntentSetDigest: CanonicalDigest;
  transportReceiptSetDigest: CanonicalDigest;
  providerResultSpoolReceiptSetDigest: CanonicalDigest;
  providerResultSpoolDispositionReceiptSetDigest: CanonicalDigest;
  invocationTurnReceiptSetDigest: CanonicalDigest;
  invocationTurnSetReceiptSetDigest: CanonicalDigest;
  resultSubmissionReceiptSetDigest: CanonicalDigest;
  attemptAuthorityOwnerReceiptSetDigest: CanonicalDigest;
  controlledRuntimeReceiptSetDigest: CanonicalDigest;
  capabilityExecutionReceiptSetDigest: CanonicalDigest;
  capabilitySpecificReceiptSetDigest: CanonicalDigest;
  providerCapabilityObservationReceiptSetDigest: CanonicalDigest;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  validatedHumanReviewArtifactSetDigest: CanonicalDigest;
  validatedHumanMetricObservationSetDigest: CanonicalDigest;
  reviewLeaseDigest?: CanonicalDigest;
  reviewRasterScanReceiptSetDigest: CanonicalDigest;
  reviewCandidateRefSetDigest: CanonicalDigest;
  blindReviewMappingSetDigest: CanonicalDigest;
  sourceReceiptSetDigest: CanonicalDigest;
  executionReceiptSetDigest: CanonicalDigest;
  holdoutExecutionReceiptDigest: CanonicalDigest;
  secretCanarySetDigest: CanonicalDigest;
  protectedHoldoutCanarySetDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationEvidenceIndex = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_VERSION;
  indexId: string;
  evidenceFormat: 'prodivix.agent-model-evaluation-evidence';
  evidenceVersion: 3;
  exportLeaseId: string;
  exportLeaseDigest: CanonicalDigest;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  evidenceSetDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
  authorityPayloadDigest: CanonicalDigest;
  authorityAttestationDigest: CanonicalDigest;
  authorityRoots: AgentModelEvaluationEvidenceArchiveAuthorityRoots;
  reviewLeaseDigest?: CanonicalDigest;
  evaluationManifestDigest: CanonicalDigest;
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[];
  shards: readonly AgentModelEvaluationEvidenceArchiveShardDescriptor[];
  shardSetDigest: CanonicalDigest;
  totalShardBytes: number;
  totalRecordCount: number;
  createdAt: string;
  indexDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationEvidenceArchiveAttestationPayload = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_VERSION;
  authorityId: string;
  keyId: string;
  exportLeaseId: string;
  exportLeaseDigest: CanonicalDigest;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  evidenceSetDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
  authorityPayloadDigest: CanonicalDigest;
  authorityAttestationDigest: CanonicalDigest;
  authorityRoots: AgentModelEvaluationEvidenceArchiveAuthorityRoots;
  reviewLeaseDigest?: CanonicalDigest;
  evaluationManifestDigest: CanonicalDigest;
  indexDigest: CanonicalDigest;
  evidenceIndexArtifactDigest: CanonicalDigest;
  evidenceIndexArtifactSize: number;
  shardSetDigest: CanonicalDigest;
  totalShardBytes: number;
  totalRecordCount: number;
  issuedAt: string;
}>;

export type AgentModelEvaluationEvidenceArchiveAttestation = Readonly<
  AgentModelEvaluationEvidenceArchiveAttestationPayload & {
    algorithm: 'ed25519';
    attestedPayloadDigest: CanonicalDigest;
    signature: string;
    attestationDigest: CanonicalDigest;
  }
>;

export type AgentModelEvaluationEvidenceRoot = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_VERSION;
  rootId: string;
  exportLeaseId: string;
  exportLeaseDigest: CanonicalDigest;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  evidenceSetDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
  authorityPayloadDigest: CanonicalDigest;
  authorityAttestationDigest: CanonicalDigest;
  authorityRoots: AgentModelEvaluationEvidenceArchiveAuthorityRoots;
  reviewLeaseDigest?: CanonicalDigest;
  evaluationManifestDigest: CanonicalDigest;
  indexDigest: CanonicalDigest;
  evidenceIndexArtifactDigest: CanonicalDigest;
  evidenceIndexArtifactSize: number;
  shardSetDigest: CanonicalDigest;
  totalShardBytes: number;
  totalRecordCount: number;
  archiveAttestation: AgentModelEvaluationEvidenceArchiveAttestation;
  archiveAttestationDigest: CanonicalDigest;
  recordedAt: string;
  rootDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationEvidenceArchiveCommitments = Readonly<{
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  evidenceSetDigest: CanonicalDigest;
  authorityPayloadDigest: CanonicalDigest;
  authorityAttestationDigest: CanonicalDigest;
  authorityRoots: AgentModelEvaluationEvidenceArchiveAuthorityRoots;
  reviewLeaseDigest?: CanonicalDigest;
  evaluationManifestDigest: CanonicalDigest;
  createdAt: string;
}>;

export type AgentModelEvaluationEvidenceArchiveSourceRecord = Readonly<{
  orderKey: string;
  recordDigest: CanonicalDigest;
  contentDigest: CanonicalDigest;
  byteLength: number;
  value: unknown;
}>;

export type AgentModelEvaluationEvidenceArchiveFamilyPage = Readonly<{
  leaseId: string;
  family: AgentEvaluationEvidenceArchiveFamily;
  pageOrdinal: number;
  firstRecordOrdinal: number;
  records: readonly AgentModelEvaluationEvidenceArchiveSourceRecord[];
  recordCount: number;
  recordBytes: number;
  pageRecordSetDigest: CanonicalDigest;
  pageDigest: CanonicalDigest;
  nextCursor?: string;
}>;

export type AgentModelEvaluationEvidenceArchiveFamilySource = Readonly<{
  family: AgentEvaluationEvidenceArchiveFamily;
  familyIndex: number;
  expectedRecordCount: number;
  expectedRecordSetDigest: CanonicalDigest;
  expectedTotalBytes: number;
  pages: AsyncIterable<AgentModelEvaluationEvidenceArchiveFamilyPage>;
}>;

/**
 * Production exporters consume repository-backed ordered pages. A full
 * EvidenceBundle or durable snapshot is intentionally absent from this port.
 */
export interface AgentModelEvaluationEvidenceArchiveSource {
  readonly leaseId: string;
  readonly leaseDigest: CanonicalDigest;
  readonly commitments: AgentModelEvaluationEvidenceArchiveCommitments;
  readonly families: AsyncIterable<AgentModelEvaluationEvidenceArchiveFamilySource>;
}

export type AgentEvaluationArchiveTrustedPublicKey = Readonly<{
  keyId: string;
  publicKeyBase64Url: string;
}>;

export type AgentModelEvaluationEvidenceArchiveAttestationTrust = Readonly<{
  trustedPublicKeys: readonly AgentEvaluationArchiveTrustedPublicKey[];
  verifyEd25519: (
    input: Readonly<{
      keyId: string;
      publicKeyBase64Url: string;
      signatureBase64Url: string;
      payload: AgentModelEvaluationEvidenceArchiveAttestationPayload;
      message: Uint8Array;
    }>
  ) => boolean | Promise<boolean>;
}>;

const exactKeys = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key)) &&
  Object.keys(value).length === required.length &&
  required.every((key) => Object.hasOwn(value, key));

const exactKeysWithOptional = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): value is Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey)
  ) {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const isBoundedSafeInteger = (
  value: unknown,
  maximum: number,
  minimum = 0
): value is number =>
  Number.isSafeInteger(value) &&
  Number(value) >= minimum &&
  Number(value) <= maximum;

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 20 &&
  value.length <= 32 &&
  new Date(value).toISOString() === value;

const isBoundedText = (value: unknown, maximum = 2_048): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= maximum &&
  value === value.trim() &&
  ![...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

/** Canonical, portable repository-relative path to the tracked frozen config. */
export const isAgentModelEvaluationEvidenceSourceConfigPath = (
  value: unknown
): value is string =>
  isBoundedText(value, 255) &&
  /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/u.test(value) &&
  !value.includes('\\') &&
  !value.includes('//') &&
  !value.endsWith('/') &&
  !value.split('/').some((segment) => segment === '.' || segment === '..');

const base64UrlDigit = (value: string): number => {
  const code = value.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (code === 45) return 62;
  if (code === 95) return 63;
  return -1;
};

const isCanonicalBase64Url = (
  value: unknown,
  decodedByteLength: number
): value is string => {
  if (
    typeof value !== 'string' ||
    value.length !== Math.ceil((decodedByteLength * 4) / 3) ||
    !canonicalBase64UrlPattern.test(value)
  ) {
    return false;
  }
  const finalDigit = base64UrlDigit(value.at(-1)!);
  const remainder = decodedByteLength % 3;
  return (
    finalDigit >= 0 &&
    (remainder === 0 ||
      (remainder === 1 && (finalDigit & 0x0f) === 0) ||
      (remainder === 2 && (finalDigit & 0x03) === 0))
  );
};

const isSafeJsonValue = (
  value: unknown,
  depth = 0,
  ancestors: Set<object> = new Set()
): boolean => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (
    typeof value !== 'object' ||
    depth > AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumJsonDepth
  ) {
    return false;
  }
  const object = value as object;
  if (ancestors.has(object)) return false;
  ancestors.add(object);
  try {
    if (Array.isArray(value)) {
      if (
        value.length >
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
      ) {
        return false;
      }
      for (let index = 0; index < value.length; index += 1) {
        if (
          !Object.hasOwn(value, index) ||
          !isSafeJsonValue(value[index], depth + 1, ancestors)
        ) {
          return false;
        }
      }
      return true;
    }
    if (!isPlainObject(value)) return false;
    const keys = Object.keys(value);
    if (keys.length > 100_000 || keys.some(isUnsafeObjectKey)) return false;
    return keys.every((key) =>
      isSafeJsonValue(value[key], depth + 1, ancestors)
    );
  } finally {
    ancestors.delete(object);
  }
};

const freezeJsonValue = (value: unknown): unknown => {
  const parsed = JSON.parse(canonicalJsonText(value)) as unknown;
  const pending: unknown[] = [parsed];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === null || typeof entry !== 'object' || Object.isFrozen(entry))
      continue;
    pending.push(...Object.values(entry));
    Object.freeze(entry);
  }
  return parsed;
};

export const isAgentEvaluationEvidenceArchiveFamily = (
  value: unknown
): value is AgentEvaluationEvidenceArchiveFamily =>
  typeof value === 'string' && familySet.has(value);

export const agentEvaluationEvidenceArchiveFamilyIndex = (
  family: AgentEvaluationEvidenceArchiveFamily
): number => AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.indexOf(family);

export const isAgentEvaluationEvidenceArchiveSingletonFamily = (
  family: AgentEvaluationEvidenceArchiveFamily
): boolean => singletonFamilySet.has(family);

const stringField = (value: unknown, key: string): string => {
  if (!isPlainObject(value) || !isBoundedText(value[key], 4_096)) {
    throw new TypeError(`Evidence archive ${key} is invalid.`);
  }
  return value[key];
};

const integerField = (value: unknown, key: string): number => {
  if (
    !isPlainObject(value) ||
    !Number.isSafeInteger(value[key]) ||
    Number(value[key]) < 0
  ) {
    throw new TypeError(`Evidence archive ${key} is invalid.`);
  }
  return Number(value[key]);
};

const nestedStringField = (
  value: unknown,
  parent: string,
  key: string
): string => {
  if (!isPlainObject(value) || !isPlainObject(value[parent])) {
    throw new TypeError(`Evidence archive ${parent}.${key} is invalid.`);
  }
  return stringField(value[parent], key);
};

const paddedIndex = (value: number): string =>
  value.toString().padStart(12, '0');
const orderKey = (...parts: readonly string[]): string =>
  canonicalJsonText(parts);

/** Derives the exact family-local identity key used by archive ordering. */
export const createAgentModelEvaluationEvidenceArchiveOrderKey = (
  family: AgentEvaluationEvidenceArchiveFamily,
  value: unknown
): string => {
  switch (family) {
    case 'capabilityProbeAdmissions': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(record.requestDigest);
    }
    case 'capabilityProbeReferenceReceipts': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(
        record.admissionRequestDigest,
        record.ordinal.toString().padStart(2, '0')
      );
    }
    case 'runtimeFactSourceOwnerRegistrations': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(record.registrationReceiptDigest);
    }
    case 'capabilityProbeProviderResourceCleanups': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(
        record.repositoryCommit,
        record.resourceRegistrationRequestDigest
      );
    }
    case 'hostedRetrievalRuntimeResourceLifecycleJournals': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      const firstIntent = record.journalRecord.dispatchIntentSet.intents[0];
      if (!firstIntent) {
        throw new TypeError('Lifecycle journal archive record has no intent.');
      }
      return orderKey(
        firstIntent.repositoryCommit,
        firstIntent.runtimeResourceSetId,
        record.journalRecord.operation,
        record.journalRecord.registrationRequestDigest,
        record.journalRecord.businessResult.resourceRole ?? '',
        record.journalRecord.businessResult.resourceId ?? '',
        record.archiveRecordDigest
      );
    }
    case 'hostedRetrievalRuntimeResourceCleanups': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(
        record.repositoryCommit,
        record.runtimeResourceSetId,
        record.authorityDigest
      );
    }
    case 'capabilityEffectProviderRuntimeJournals': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(
        record.attemptId,
        paddedIndex(record.turnIndex),
        record.ownerRequestDigest
      );
    }
    case 'optionalCapabilityFactSources': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(record.attemptId, paddedIndex(record.turnIndex));
    }
    case 'optionalCapabilityFactAuthorities': {
      const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      );
      return orderKey(record.attemptId, paddedIndex(record.turnIndex));
    }
    case 'endpointSmokeReceipts':
      return orderKey(stringField(value, 'smokeTargetId'));
    case 'endpointSmokeDispatchIntents':
      return orderKey(
        stringField(value, 'smokeTargetId'),
        stringField(value, 'intentId')
      );
    case 'endpointSmokeTransportReceipts':
      return orderKey(
        stringField(value, 'invocationId'),
        stringField(value, 'receiptId')
      );
    case 'endpointSmokeResultSpoolReceipts':
      return orderKey(
        stringField(value, 'smokeTargetId'),
        stringField(value, 'spoolRef')
      );
    case 'endpointSmokeResultSpoolDispositionReceipts':
      return orderKey(
        stringField(value, 'smokeTargetId'),
        stringField(value, 'spoolRef')
      );
    case 'endpointSmokeValidationFailureReceipts':
      return orderKey(
        stringField(value, 'smokeTargetId'),
        stringField(value, 'receiptId')
      );
    case 'preDispatchFailureReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        paddedIndex(integerField(value, 'turnIndex')),
        stringField(value, 'failureReceiptId')
      );
    case 'transportDispatchIntents':
      return orderKey(stringField(value, 'intentId'));
    case 'transportReceipts':
      return orderKey(stringField(value, 'receiptId'));
    case 'providerResultSpoolReceipts':
    case 'providerResultSpoolDispositionReceipts':
      return orderKey(stringField(value, 'spoolRef'));
    case 'invocationTurnReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        paddedIndex(integerField(value, 'turnIndex'))
      );
    case 'invocationTurnSetReceipts':
    case 'resultSubmissionReceipts':
    case 'controlledRuntimeReceipts':
    case 'reviewRasterScanReceipts':
    case 'reviewCandidateRefs':
    case 'executionReceipts':
      return orderKey(stringField(value, 'attemptId'));
    case 'attemptAuthorityOwnerReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        stringField(value, 'serviceKind'),
        stringField(value, 'operation'),
        stringField(value, 'requestDigest')
      );
    case 'verificationAttemptGrantReceipts':
      return orderKey(
        stringField(value, 'evaluationAttemptId'),
        stringField(value, 'cellId'),
        nestedStringField(value, 'grant', 'grantId')
      );
    case 'capabilityExecutionReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        paddedIndex(integerField(value, 'turnIndex')),
        stringField(value, 'capabilityExecutionReceiptId')
      );
    case 'capabilitySpecificReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        paddedIndex(integerField(value, 'turnIndex')),
        stringField(value, 'receiptKind'),
        stringField(value, 'receiptId')
      );
    case 'providerCapabilityObservationReceipts':
      return orderKey(
        stringField(value, 'attemptId'),
        paddedIndex(integerField(value, 'turnIndex')),
        stringField(value, 'invocationId'),
        stringField(value, 'observationReceiptId')
      );
    case 'validatedHumanReviewArtifacts':
      return orderKey(stringField(value, 'artifactId'));
    case 'validatedHumanMetricObservations':
      return orderKey(stringField(value, 'observationId'));
    case 'blindReviewMappingRefs':
      return orderKey(stringField(value, 'mappingId'));
    case 'sourceReceipts':
      return orderKey(stringField(value, 'sourceReceiptId'));
    case 'attempts':
      return orderKey(nestedStringField(value, 'descriptor', 'attemptId'));
    case 'checkpoints':
      return orderKey(stringField(value, 'shardId'));
    default:
      return orderKey(family);
  }
};

const semanticDigestFieldByFamily = Object.freeze({
  plan: 'planDigest',
  capabilityProbeAdmissions: 'recordDigest',
  capabilityProbeReferenceReceipts: 'recordDigest',
  runtimeFactSourceOwnerRegistrations: 'recordDigest',
  capabilityProbeProviderResourceCleanups: 'recordDigest',
  hostedRetrievalRuntimeResourceLifecycleJournals: 'archiveRecordDigest',
  hostedRetrievalRuntimeResourceCleanups: 'recordDigest',
  capabilityEffectProviderRuntimeJournals: 'recordDigest',
  optionalCapabilityFactSources: 'recordDigest',
  optionalCapabilityFactAuthorities: 'recordDigest',
  endpointSmokeDispatchIntents: 'intentDigest',
  endpointSmokeTransportReceipts: 'receiptDigest',
  endpointSmokeResultSpoolReceipts: 'receiptDigest',
  endpointSmokeResultSpoolDispositionReceipts: 'receiptDigest',
  endpointSmokeValidationFailureReceipts: 'receiptDigest',
  endpointSmokeReceipts: 'receiptDigest',
  preDispatchFailureReceipts: 'receiptDigest',
  transportDispatchIntents: 'intentDigest',
  transportReceipts: 'receiptDigest',
  providerResultSpoolReceipts: 'receiptDigest',
  providerResultSpoolDispositionReceipts: 'receiptDigest',
  invocationTurnReceipts: 'evidenceDigest',
  invocationTurnSetReceipts: 'receiptDigest',
  resultSubmissionReceipts: 'receiptDigest',
  attemptAuthorityOwnerReceipts: 'receiptDigest',
  verificationAttemptGrantReceipts: 'receiptDigest',
  controlledRuntimeReceipts: 'receiptDigest',
  capabilityExecutionReceipts: 'receiptDigest',
  capabilitySpecificReceipts: 'receiptDigest',
  providerCapabilityObservationReceipts: 'receiptDigest',
  validatedHumanReviewArtifacts: 'artifactDigest',
  validatedHumanMetricObservations: 'observationDigest',
  reviewRasterScanReceipts: 'receiptDigest',
  reviewCandidateRefs: 'candidateDigest',
  sourceReceipts: 'receiptDigest',
  executionReceipts: 'receiptDigest',
  attempts: 'attemptDigest',
  checkpoints: 'checkpointDigest',
  budgetLedger: 'ledgerDigest',
  metricReport: 'reportDigest',
  graderReport: 'reportDigest',
  humanReviewReport: 'reportDigest',
  holdoutExecutionReceipt: 'receiptDigest',
  authorityAttestation: 'attestationDigest',
  manifest: 'manifestDigest',
} as const);

/** Projects one record to the exact preimage used by its existing set digest. */
export const projectAgentModelEvaluationEvidenceArchiveSemanticValue = (
  family: AgentEvaluationEvidenceArchiveFamily,
  value: unknown
): unknown => {
  if (
    AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES.includes(
      family as AgentEvaluationQualificationAuthorityArchiveFamily
    )
  ) {
    if (family === 'hostedRetrievalRuntimeResourceLifecycleJournals') {
      return projectAgentEvaluationQualificationAuthorityArchiveRecord(
        family,
        value
      ).archiveRecordDigest;
    }
    const record = projectAgentEvaluationQualificationAuthorityArchiveRecord(
      family as AgentEvaluationQualificationAuthorityArchiveFamily,
      value
    );
    if (!('recordDigest' in record)) {
      throw new TypeError(`Evidence archive ${family} digest is invalid.`);
    }
    return record.recordDigest;
  }
  if (family === 'blindReviewMappingRefs') {
    if (
      !exactKeys(value, ['mappingId', 'mappingDigest']) ||
      !isBoundedText(value.mappingId) ||
      !isAgentCanonicalDigest(value.mappingDigest)
    ) {
      throw new TypeError('Blind review mapping archive record is invalid.');
    }
    return value;
  }
  const field = semanticDigestFieldByFamily[family];
  if (!isPlainObject(value) || !isAgentCanonicalDigest(value[field])) {
    throw new TypeError(
      `Evidence archive ${family} semantic digest is invalid.`
    );
  }
  return value[field];
};

export const digestAgentModelEvaluationEvidenceArchiveSemanticRecord = (
  family: AgentEvaluationEvidenceArchiveFamily,
  value: unknown
): CanonicalDigest => {
  const projected = projectAgentModelEvaluationEvidenceArchiveSemanticValue(
    family,
    value
  );
  return isAgentCanonicalDigest(projected)
    ? projected
    : digestAgentCanonicalValue(projected);
};

export interface AgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator {
  readonly family: AgentEvaluationEvidenceArchiveFamily;
  readonly count: number;
  append(value: unknown): void;
  finalize(): CanonicalDigest;
}

const familySemanticEnvelopeKey: Partial<
  Record<AgentEvaluationEvidenceArchiveFamily, string>
> = Object.freeze({
  capabilityProbeAdmissions: 'recordDigests',
  capabilityProbeReferenceReceipts: 'recordDigests',
  runtimeFactSourceOwnerRegistrations: 'recordDigests',
  capabilityProbeProviderResourceCleanups: 'recordDigests',
  hostedRetrievalRuntimeResourceLifecycleJournals: 'recordDigests',
  hostedRetrievalRuntimeResourceCleanups: 'recordDigests',
  capabilityEffectProviderRuntimeJournals: 'recordDigests',
  optionalCapabilityFactSources: 'recordDigests',
  optionalCapabilityFactAuthorities: 'recordDigests',
  endpointSmokeDispatchIntents: 'endpointSmokeDispatchIntentDigests',
  endpointSmokeTransportReceipts: 'endpointSmokeTransportReceiptDigests',
  endpointSmokeResultSpoolReceipts: 'endpointSmokeResultSpoolReceiptDigests',
  endpointSmokeResultSpoolDispositionReceipts:
    'endpointSmokeResultSpoolDispositionReceiptDigests',
  endpointSmokeValidationFailureReceipts:
    'endpointSmokeValidationFailureReceiptDigests',
  endpointSmokeReceipts: 'endpointSmokeReceiptDigests',
  verificationAttemptGrantReceipts: 'verificationAttemptGrantReceiptDigests',
  capabilitySpecificReceipts: 'receiptDigests',
  providerCapabilityObservationReceipts: 'receiptDigests',
  attemptAuthorityOwnerReceipts: 'receiptDigests',
  validatedHumanMetricObservations: 'validatedHumanMetricObservationDigests',
});

/** Incrementally reproduces every legacy family/set digest without retaining records. */
export const createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator =
  (
    family: AgentEvaluationEvidenceArchiveFamily
  ): AgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator => {
    const hash = sha256.create();
    const singleton = isAgentEvaluationEvidenceArchiveSingletonFamily(family);
    const envelopeKey = familySemanticEnvelopeKey[family];
    const sortedDigests =
      family === 'verificationAttemptGrantReceipts' ||
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES.includes(
        family as AgentEvaluationQualificationAuthorityArchiveFamily
      )
        ? ([] as CanonicalDigest[])
        : undefined;
    const hostedRuntimeResourceCleanupRecords =
      family === 'hostedRetrievalRuntimeResourceCleanups'
        ? ([] as AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord[])
        : undefined;
    let count = 0;
    let finalDigest: CanonicalDigest | undefined;
    let singletonDigest: CanonicalDigest | undefined;
    hash.update(utf8ToBytes(envelopeKey ? `{"${envelopeKey}":[` : '['));
    return {
      family,
      get count() {
        return count;
      },
      append(value: unknown): void {
        if (finalDigest !== undefined || (singleton && count > 0)) {
          throw new TypeError(
            `Evidence archive ${family} digest accumulator is closed or overfull.`
          );
        }
        const projected =
          projectAgentModelEvaluationEvidenceArchiveSemanticValue(
            family,
            value
          );
        if (singleton) singletonDigest = projected as CanonicalDigest;
        if (sortedDigests) {
          sortedDigests.push(projected as CanonicalDigest);
          if (hostedRuntimeResourceCleanupRecords) {
            hostedRuntimeResourceCleanupRecords.push(
              value as AgentHostedRetrievalRuntimeResourceCleanupArchiveRecord
            );
          }
        } else {
          if (count > 0) hash.update(utf8ToBytes(','));
          hash.update(utf8ToBytes(canonicalJsonText(projected)));
        }
        count += 1;
      },
      finalize(): CanonicalDigest {
        if (finalDigest !== undefined) return finalDigest;
        if (singleton) {
          if (count !== 1) {
            throw new TypeError(
              `Evidence archive singleton ${family} must contain exactly one record.`
            );
          }
          finalDigest = singletonDigest!;
          return finalDigest;
        }
        if (
          hostedRuntimeResourceCleanupRecords &&
          hostedRuntimeResourceCleanupRecords.length > 0
        ) {
          createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
            hostedRuntimeResourceCleanupRecords
          );
        }
        if (sortedDigests) {
          finalDigest = digestAgentCanonicalValue({
            [envelopeKey!]: Object.freeze(
              [...sortedDigests].sort(compareUnicodeCodePoints)
            ),
          });
          return finalDigest;
        }
        hash.update(utf8ToBytes(envelopeKey ? ']}' : ']'));
        finalDigest = `sha256-${bytesToHex(hash.digest())}`;
        return finalDigest;
      },
    };
  };

/** Extracts the direct domain digest for an exact-one singleton family. */
export const finalizeAgentModelEvaluationEvidenceArchiveSingletonDigest = (
  family: AgentEvaluationEvidenceArchiveFamily,
  value: unknown
): CanonicalDigest => {
  if (!isAgentEvaluationEvidenceArchiveSingletonFamily(family)) {
    throw new TypeError(
      `Evidence archive ${family} is not a singleton family.`
    );
  }
  const projected = projectAgentModelEvaluationEvidenceArchiveSemanticValue(
    family,
    value
  );
  if (!isAgentCanonicalDigest(projected)) {
    throw new TypeError(
      `Evidence archive ${family} singleton digest is invalid.`
    );
  }
  return projected;
};

const recordDigestBase = (
  family: AgentEvaluationEvidenceArchiveFamily,
  recordIndex: number,
  order: string,
  value: unknown
): Readonly<Record<string, unknown>> =>
  Object.freeze({ family, recordIndex, orderKey: order, value });

export const createAgentModelEvaluationEvidenceArchiveRecord = (input: {
  family: AgentEvaluationEvidenceArchiveFamily;
  recordIndex: number;
  value: unknown;
}): AgentModelEvaluationEvidenceArchiveRecord => {
  if (
    !isAgentEvaluationEvidenceArchiveFamily(input.family) ||
    !isBoundedSafeInteger(
      input.recordIndex,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords - 1
    ) ||
    !isSafeJsonValue(input.value)
  ) {
    throw new TypeError('Evidence archive record input is invalid.');
  }
  const valueText = canonicalJsonText(input.value);
  if (
    utf8Encoder.encode(valueText).byteLength >
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes
  ) {
    throw new TypeError(
      'Evidence archive record exceeds the canonical byte limit.'
    );
  }
  const value = freezeJsonValue(input.value);
  const key = createAgentModelEvaluationEvidenceArchiveOrderKey(
    input.family,
    value
  );
  const base = recordDigestBase(input.family, input.recordIndex, key, value);
  const record = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_VERSION,
    family: input.family,
    recordIndex: input.recordIndex,
    orderKey: key,
    recordDigest: digestAgentCanonicalValue(base),
    value,
  });
  if (
    utf8Encoder.encode(canonicalJsonText(record)).byteLength >
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes
  ) {
    throw new TypeError(
      'Evidence archive canonical record exceeds the byte limit.'
    );
  }
  return record;
};

export const isAgentModelEvaluationEvidenceArchiveRecord = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveRecord => {
  try {
    if (
      !exactKeys(value, [
        'format',
        'version',
        'family',
        'recordIndex',
        'orderKey',
        'recordDigest',
        'value',
      ]) ||
      value.format !== AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_FORMAT ||
      value.version !==
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_VERSION ||
      !isAgentEvaluationEvidenceArchiveFamily(value.family) ||
      !isBoundedSafeInteger(
        value.recordIndex,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords - 1
      ) ||
      !isBoundedText(value.orderKey, 8_192) ||
      !isAgentCanonicalDigest(value.recordDigest) ||
      !isSafeJsonValue(value.value) ||
      utf8Encoder.encode(canonicalJsonText(value.value)).byteLength >
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes ||
      utf8Encoder.encode(canonicalJsonText(value)).byteLength >
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes
    ) {
      return false;
    }
    return (
      value.orderKey ===
        createAgentModelEvaluationEvidenceArchiveOrderKey(
          value.family,
          value.value
        ) &&
      value.recordDigest ===
        digestAgentCanonicalValue(
          recordDigestBase(
            value.family,
            value.recordIndex,
            value.orderKey,
            value.value
          )
        )
    );
  } catch {
    return false;
  }
};

export const encodeAgentModelEvaluationEvidenceArchiveRecordLine = (
  record: AgentModelEvaluationEvidenceArchiveRecord
): string => {
  if (!isAgentModelEvaluationEvidenceArchiveRecord(record)) {
    throw new TypeError('Evidence archive record is invalid.');
  }
  const line = `${canonicalJsonText(record)}\n`;
  if (
    utf8Encoder.encode(line).byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes +
        1 ||
    utf8Encoder.encode(line).byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
  ) {
    throw new TypeError(
      'Evidence archive record line exceeds the shard byte limit.'
    );
  }
  return line;
};

const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_MAXIMUM_ORDER_KEY_CANONICAL_BYTES =
  4 * 8_192 + 2;

const maximumRecordWrapperBytes = (
  family: AgentEvaluationEvidenceArchiveFamily
): number => {
  const orderKey = 'x';
  const value = null;
  const probe = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_VERSION,
    family,
    recordIndex:
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords - 1,
    orderKey,
    recordDigest: digestAgentCanonicalValue(null),
    value,
  });
  return (
    utf8Encoder.encode(`${canonicalJsonText(probe)}\n`).byteLength -
    utf8Encoder.encode(canonicalJsonText(orderKey)).byteLength -
    utf8Encoder.encode(canonicalJsonText(value)).byteLength
  );
};

/**
 * Exact fixed bytes around one canonical value and its encoded order-key
 * string, including the LF terminator and the largest legal record index.
 */
export const AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_WRAPPER_BYTES_BY_FAMILY: Readonly<
  Record<AgentEvaluationEvidenceArchiveFamily, number>
> = Object.freeze(
  Object.fromEntries(
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.map((family) => [
      family,
      maximumRecordWrapperBytes(family),
    ])
  ) as Record<AgentEvaluationEvidenceArchiveFamily, number>
);

const isAgentModelEvaluationEvidenceArchiveFamilyValueBudget = (
  family: AgentEvaluationEvidenceArchiveFamily,
  recordCount: number,
  canonicalValueBytes: number
): boolean => {
  switch (family) {
    case 'capabilitySpecificReceipts':
      return isAgentEvaluationCapabilitySpecificArchiveBudget(
        recordCount,
        canonicalValueBytes
      );
    case 'attemptAuthorityOwnerReceipts':
      return isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
        recordCount,
        canonicalValueBytes
      );
    case 'providerCapabilityObservationReceipts':
      return isAgentEvaluationProviderCapabilityObservationArchiveBudget(
        recordCount,
        canonicalValueBytes
      );
    default:
      return AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES.includes(
        family as AgentEvaluationQualificationAuthorityArchiveFamily
      )
        ? isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
            family as AgentEvaluationQualificationAuthorityArchiveFamily,
            recordCount,
            canonicalValueBytes
          )
        : true;
  }
};

export const isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage => {
  if (
    !exactKeys(value, [
      'family',
      'recordCount',
      'canonicalValueBytes',
      'canonicalOrderKeyBytes',
      'canonicalRecordWrapperBytes',
      'shardBytes',
    ])
  ) {
    return false;
  }
  const usage = value as AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage;
  if (
    !isAgentEvaluationEvidenceArchiveFamily(usage.family) ||
    !isBoundedSafeInteger(
      usage.recordCount,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
    ) ||
    !isBoundedSafeInteger(
      usage.canonicalValueBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    ) ||
    !isBoundedSafeInteger(
      usage.canonicalOrderKeyBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    ) ||
    !isBoundedSafeInteger(
      usage.canonicalRecordWrapperBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    ) ||
    !isBoundedSafeInteger(
      usage.shardBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    )
  ) {
    return false;
  }
  const empty = usage.recordCount === 0;
  return (
    empty ===
      (usage.canonicalValueBytes === 0 &&
        usage.canonicalOrderKeyBytes === 0 &&
        usage.canonicalRecordWrapperBytes === 0 &&
        usage.shardBytes === 0) &&
    usage.canonicalValueBytes <=
      usage.recordCount *
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes &&
    usage.canonicalOrderKeyBytes <=
      usage.recordCount *
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_MAXIMUM_ORDER_KEY_CANONICAL_BYTES &&
    usage.canonicalRecordWrapperBytes <=
      usage.recordCount *
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_WRAPPER_BYTES_BY_FAMILY[
          usage.family
        ] &&
    isAgentModelEvaluationEvidenceArchiveFamilyValueBudget(
      usage.family,
      usage.recordCount,
      usage.canonicalValueBytes
    ) &&
    usage.shardBytes ===
      usage.canonicalValueBytes +
        usage.canonicalOrderKeyBytes +
        usage.canonicalRecordWrapperBytes
  );
};

/** Streaming physical-byte accounting over the exact canonical NDJSON lines. */
export const createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator =
  (
    family: AgentEvaluationEvidenceArchiveFamily
  ): AgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator => {
    if (!isAgentEvaluationEvidenceArchiveFamily(family)) {
      throw new TypeError('Evidence archive physical family is invalid.');
    }
    let count = 0;
    let canonicalValueBytes = 0;
    let canonicalOrderKeyBytes = 0;
    let canonicalRecordWrapperBytes = 0;
    let shardBytes = 0;
    let closed = false;
    return {
      family,
      get count() {
        return count;
      },
      append(record): void {
        if (
          closed ||
          !isAgentModelEvaluationEvidenceArchiveRecord(record) ||
          record.family !== family ||
          record.recordIndex !== count
        ) {
          throw new TypeError(
            'Evidence archive physical family record is invalid or non-contiguous.'
          );
        }
        const valueBytes = utf8Encoder.encode(
          canonicalJsonText(record.value)
        ).byteLength;
        const orderKeyBytes = utf8Encoder.encode(
          canonicalJsonText(record.orderKey)
        ).byteLength;
        const lineBytes = utf8Encoder.encode(
          encodeAgentModelEvaluationEvidenceArchiveRecordLine(record)
        ).byteLength;
        const wrapperBytes = lineBytes - valueBytes - orderKeyBytes;
        count += 1;
        canonicalValueBytes += valueBytes;
        canonicalOrderKeyBytes += orderKeyBytes;
        canonicalRecordWrapperBytes += wrapperBytes;
        shardBytes += lineBytes;
        if (
          !Number.isSafeInteger(shardBytes) ||
          shardBytes >
            AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
        ) {
          throw new TypeError(
            'Evidence archive physical family exceeded the archive byte ceiling.'
          );
        }
      },
      finalize(): AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage {
        if (closed) {
          throw new TypeError(
            'Evidence archive physical family accumulator is closed.'
          );
        }
        closed = true;
        const usage = Object.freeze({
          family,
          recordCount: count,
          canonicalValueBytes,
          canonicalOrderKeyBytes,
          canonicalRecordWrapperBytes,
          shardBytes,
        });
        if (!isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(usage)) {
          throw new TypeError(
            'Evidence archive physical family usage is invalid.'
          );
        }
        return usage;
      },
    };
  };

export const createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage = (
  family: AgentEvaluationEvidenceArchiveFamily,
  records: readonly AgentModelEvaluationEvidenceArchiveRecord[]
): AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage => {
  if (!Array.isArray(records)) {
    throw new TypeError(
      'Evidence archive physical family records are invalid.'
    );
  }
  const accumulator =
    createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator(
      family
    );
  records.forEach((record) => accumulator.append(record));
  return accumulator.finalize();
};

/** The 8 GiB ceiling covers shard NDJSON plus the canonical index and root. */
export const isAgentModelEvaluationEvidenceArchivePhysicalCapacity = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchivePhysicalCapacity => {
  if (
    !exactKeys(value, [
      'totalRecordCount',
      'totalShardBytes',
      'indexBytes',
      'rootBytes',
    ])
  ) {
    return false;
  }
  const capacity = value as AgentModelEvaluationEvidenceArchivePhysicalCapacity;
  return (
    isBoundedSafeInteger(
      capacity.totalRecordCount,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords,
      1
    ) &&
    isBoundedSafeInteger(
      capacity.totalShardBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes,
      1
    ) &&
    isBoundedSafeInteger(
      capacity.indexBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
      1
    ) &&
    isBoundedSafeInteger(
      capacity.rootBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
      1
    ) &&
    capacity.totalShardBytes + capacity.indexBytes + capacity.rootBytes <=
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
  );
};

export const createAgentModelEvaluationEvidenceArchivePhysicalBudget = (
  input: Readonly<{
    familyUsages: readonly AgentModelEvaluationEvidenceArchivePhysicalFamilyUsage[];
    indexBytes: number;
    rootBytes: number;
  }>
): AgentModelEvaluationEvidenceArchivePhysicalBudget => {
  if (
    !exactKeys(input, ['familyUsages', 'indexBytes', 'rootBytes']) ||
    !Array.isArray(input.familyUsages) ||
    input.familyUsages.length !==
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.length ||
    input.familyUsages.some(
      (usage, index) =>
        !isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(usage) ||
        usage.family !== AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES[index]
    ) ||
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES.some(
      (family) =>
        input.familyUsages[agentEvaluationEvidenceArchiveFamilyIndex(family)]
          ?.recordCount !== 1
    )
  ) {
    throw new TypeError(
      'Evidence archive physical budget family set is invalid.'
    );
  }
  const familyUsages = Object.freeze(
    input.familyUsages.map((usage) => Object.freeze({ ...usage }))
  );
  const totalRecordCount = familyUsages.reduce(
    (total, usage) => total + usage.recordCount,
    0
  );
  const totalCanonicalValueBytes = familyUsages.reduce(
    (total, usage) => total + usage.canonicalValueBytes,
    0
  );
  const totalCanonicalOrderKeyBytes = familyUsages.reduce(
    (total, usage) => total + usage.canonicalOrderKeyBytes,
    0
  );
  const totalCanonicalRecordWrapperBytes = familyUsages.reduce(
    (total, usage) => total + usage.canonicalRecordWrapperBytes,
    0
  );
  const totalShardBytes = familyUsages.reduce(
    (total, usage) => total + usage.shardBytes,
    0
  );
  if (
    !isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
      totalRecordCount,
      totalShardBytes,
      indexBytes: input.indexBytes,
      rootBytes: input.rootBytes,
    })
  ) {
    throw new TypeError(
      'Evidence archive physical budget exceeds the fixed archive ceiling.'
    );
  }
  return Object.freeze({
    familyUsages,
    totalRecordCount,
    totalCanonicalValueBytes,
    totalCanonicalOrderKeyBytes,
    totalCanonicalRecordWrapperBytes,
    totalShardBytes,
    indexBytes: input.indexBytes,
    rootBytes: input.rootBytes,
    totalArchiveBytes: totalShardBytes + input.indexBytes + input.rootBytes,
  });
};

export const isAgentModelEvaluationEvidenceArchivePhysicalBudget = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchivePhysicalBudget => {
  if (
    !exactKeys(value, [
      'familyUsages',
      'totalRecordCount',
      'totalCanonicalValueBytes',
      'totalCanonicalOrderKeyBytes',
      'totalCanonicalRecordWrapperBytes',
      'totalShardBytes',
      'indexBytes',
      'rootBytes',
      'totalArchiveBytes',
    ])
  ) {
    return false;
  }
  const budget = value as AgentModelEvaluationEvidenceArchivePhysicalBudget;
  try {
    return sameCanonicalJson(
      budget,
      createAgentModelEvaluationEvidenceArchivePhysicalBudget({
        familyUsages: budget.familyUsages,
        indexBytes: budget.indexBytes,
        rootBytes: budget.rootBytes,
      })
    );
  } catch {
    return false;
  }
};

export const decodeAgentModelEvaluationEvidenceArchiveRecordLine = (
  line: string
): AgentModelEvaluationEvidenceArchiveRecord => {
  if (
    typeof line !== 'string' ||
    !line.endsWith('\n') ||
    line.slice(0, -1).includes('\n') ||
    line.includes('\r')
  ) {
    throw new TypeError(
      'Evidence archive record line must contain one LF-terminated JSON value.'
    );
  }
  const text = line.slice(0, -1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Evidence archive record line is not valid JSON.');
  }
  if (
    !isSafeJsonValue(parsed) ||
    canonicalJsonText(parsed) !== text ||
    !isAgentModelEvaluationEvidenceArchiveRecord(parsed)
  ) {
    throw new TypeError(
      'Evidence archive record line is non-canonical or invalid.'
    );
  }
  return freezeJsonValue(parsed) as AgentModelEvaluationEvidenceArchiveRecord;
};

export const digestAgentModelEvaluationEvidenceArchiveRecordSet = (
  recordDigests: readonly CanonicalDigest[]
): CanonicalDigest => {
  if (
    recordDigests.length >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords ||
    !recordDigests.every(isAgentCanonicalDigest)
  ) {
    throw new TypeError('Evidence archive record digest set is invalid.');
  }
  return digestAgentCanonicalValue(recordDigests);
};

export interface AgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator {
  readonly count: number;
  append(recordDigest: CanonicalDigest): void;
  finalize(): CanonicalDigest;
}

export const createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator =
  (): AgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator => {
    const hash = sha256.create();
    let count = 0;
    let finalDigest: CanonicalDigest | undefined;
    hash.update(utf8ToBytes('['));
    return {
      get count() {
        return count;
      },
      append(recordDigest: CanonicalDigest): void {
        if (
          finalDigest !== undefined ||
          count >=
            AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords ||
          !isAgentCanonicalDigest(recordDigest)
        ) {
          throw new TypeError(
            'Evidence archive record-set digest accumulator is closed or invalid.'
          );
        }
        if (count > 0) hash.update(utf8ToBytes(','));
        hash.update(utf8ToBytes(canonicalJsonText(recordDigest)));
        count += 1;
      },
      finalize(): CanonicalDigest {
        if (finalDigest !== undefined) return finalDigest;
        hash.update(utf8ToBytes(']'));
        finalDigest = `sha256-${bytesToHex(hash.digest())}`;
        return finalDigest;
      },
    };
  };

export const agentModelEvaluationEvidenceArchiveShardFileName = (
  sequence: number,
  bytesDigest: CanonicalDigest
): string => {
  if (
    !isBoundedSafeInteger(
      sequence,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards - 1
    ) ||
    !isAgentCanonicalDigest(bytesDigest)
  ) {
    throw new TypeError('Evidence archive shard filename input is invalid.');
  }
  return `${sequence.toString().padStart(6, '0')}-${bytesDigest}.ndjson`;
};

type ShardDescriptorInput = Omit<
  AgentModelEvaluationEvidenceArchiveShardDescriptor,
  'fileName' | 'descriptorDigest'
>;

export const createAgentModelEvaluationEvidenceArchiveShardDescriptor = (
  input: ShardDescriptorInput
): AgentModelEvaluationEvidenceArchiveShardDescriptor => {
  const base = Object.freeze({
    ...input,
    fileName: agentModelEvaluationEvidenceArchiveShardFileName(
      input.sequence,
      input.bytesDigest
    ),
  });
  const descriptor = Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentModelEvaluationEvidenceArchiveShardDescriptor(descriptor)) {
    throw new TypeError('Evidence archive shard descriptor is invalid.');
  }
  return descriptor;
};

export const isAgentModelEvaluationEvidenceArchiveShardDescriptor = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveShardDescriptor => {
  try {
    if (
      !exactKeys(value, [
        'sequence',
        'family',
        'familyShardIndex',
        'fileName',
        'firstRecordIndex',
        'lastRecordIndex',
        'firstOrderKey',
        'lastOrderKey',
        'recordCount',
        'byteSize',
        'bytesDigest',
        'recordSetDigest',
        'descriptorDigest',
      ]) ||
      !isBoundedSafeInteger(
        value.sequence,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards - 1
      ) ||
      !isAgentEvaluationEvidenceArchiveFamily(value.family) ||
      !isBoundedSafeInteger(
        value.familyShardIndex,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards - 1
      ) ||
      !isBoundedText(value.fileName, 128) ||
      !isBoundedSafeInteger(
        value.firstRecordIndex,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords - 1
      ) ||
      !isBoundedSafeInteger(
        value.lastRecordIndex,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords - 1
      ) ||
      !isBoundedText(value.firstOrderKey, 8_192) ||
      !isBoundedText(value.lastOrderKey, 8_192) ||
      !isBoundedSafeInteger(
        value.recordCount,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords,
        1
      ) ||
      !isBoundedSafeInteger(
        value.byteSize,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes,
        1
      ) ||
      !isAgentCanonicalDigest(value.bytesDigest) ||
      !isAgentCanonicalDigest(value.recordSetDigest) ||
      !isAgentCanonicalDigest(value.descriptorDigest) ||
      value.lastRecordIndex !==
        value.firstRecordIndex + value.recordCount - 1 ||
      compareUnicodeCodePoints(value.firstOrderKey, value.lastOrderKey) > 0 ||
      value.fileName !==
        agentModelEvaluationEvidenceArchiveShardFileName(
          value.sequence,
          value.bytesDigest
        )
    ) {
      return false;
    }
    const { descriptorDigest: _descriptorDigest, ...base } = value;
    return value.descriptorDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const digestAgentModelEvaluationEvidenceArchiveShardSet = (
  shards: readonly AgentModelEvaluationEvidenceArchiveShardDescriptor[]
): CanonicalDigest => {
  if (
    shards.length >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards ||
    !shards.every(isAgentModelEvaluationEvidenceArchiveShardDescriptor) ||
    shards.some((shard, index) => shard.sequence !== index)
  ) {
    throw new TypeError(
      'Evidence archive shard set is invalid or non-canonical.'
    );
  }
  return digestAgentCanonicalValue(
    shards.map(({ descriptorDigest }) => descriptorDigest)
  );
};

type FamilySummaryInput = Omit<
  AgentModelEvaluationEvidenceArchiveFamilySummary,
  'familyIndex'
>;

export const createAgentModelEvaluationEvidenceArchiveFamilySummary = (
  input: FamilySummaryInput
): AgentModelEvaluationEvidenceArchiveFamilySummary => {
  const summary = Object.freeze({
    ...input,
    familyIndex: agentEvaluationEvidenceArchiveFamilyIndex(input.family),
  });
  if (!isAgentModelEvaluationEvidenceArchiveFamilySummary(summary)) {
    throw new TypeError('Evidence archive family summary is invalid.');
  }
  return summary;
};

export const isAgentModelEvaluationEvidenceArchiveFamilySummary = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveFamilySummary =>
  exactKeys(value, [
    'family',
    'familyIndex',
    'recordCount',
    'semanticDigest',
    'recordSetDigest',
    'shardCount',
    'firstOrderKey',
    'lastOrderKey',
  ]) &&
  isAgentEvaluationEvidenceArchiveFamily(value.family) &&
  value.familyIndex ===
    agentEvaluationEvidenceArchiveFamilyIndex(value.family) &&
  isBoundedSafeInteger(
    value.recordCount,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
  ) &&
  isAgentCanonicalDigest(value.semanticDigest) &&
  isAgentCanonicalDigest(value.recordSetDigest) &&
  isBoundedSafeInteger(
    value.shardCount,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards
  ) &&
  ((value.recordCount === 0 &&
    value.shardCount === 0 &&
    value.firstOrderKey === null &&
    value.lastOrderKey === null) ||
    (value.recordCount > 0 &&
      value.shardCount > 0 &&
      isBoundedText(value.firstOrderKey, 8_192) &&
      isBoundedText(value.lastOrderKey, 8_192) &&
      compareUnicodeCodePoints(value.firstOrderKey, value.lastOrderKey) <=
        0)) &&
  (!isAgentEvaluationEvidenceArchiveSingletonFamily(value.family) ||
    (value.recordCount === 1 && value.shardCount === 1));

const authorityRootKeys = Object.freeze([
  'capabilityProbeAdmissionSetDigest',
  'capabilityProbeReferenceReceiptSetDigest',
  'runtimeFactSourceOwnerRegistrationSetDigest',
  'capabilityProbeProviderResourceCleanupSetDigest',
  'hostedRetrievalRuntimeResourceLifecycleJournalSetDigest',
  'hostedRetrievalRuntimeResourceCleanupSetDigest',
  'capabilityEffectProviderRuntimeJournalSetDigest',
  'optionalCapabilityFactSourceSetDigest',
  'optionalCapabilityFactAuthoritySetDigest',
  'endpointSmokeSetDigest',
  'endpointSmokeDispatchIntentSetDigest',
  'endpointSmokeTransportReceiptSetDigest',
  'endpointSmokeResultSpoolReceiptSetDigest',
  'endpointSmokeResultSpoolDispositionReceiptSetDigest',
  'endpointSmokeValidationFailureReceiptSetDigest',
  'preDispatchFailureReceiptSetDigest',
  'transportDispatchIntentSetDigest',
  'transportReceiptSetDigest',
  'providerResultSpoolReceiptSetDigest',
  'providerResultSpoolDispositionReceiptSetDigest',
  'invocationTurnReceiptSetDigest',
  'invocationTurnSetReceiptSetDigest',
  'resultSubmissionReceiptSetDigest',
  'attemptAuthorityOwnerReceiptSetDigest',
  'controlledRuntimeReceiptSetDigest',
  'capabilityExecutionReceiptSetDigest',
  'capabilitySpecificReceiptSetDigest',
  'providerCapabilityObservationReceiptSetDigest',
  'verificationAttemptGrantReceiptSetDigest',
  'validatedHumanReviewArtifactSetDigest',
  'validatedHumanMetricObservationSetDigest',
  'reviewRasterScanReceiptSetDigest',
  'reviewCandidateRefSetDigest',
  'blindReviewMappingSetDigest',
  'sourceReceiptSetDigest',
  'executionReceiptSetDigest',
  'holdoutExecutionReceiptDigest',
  'secretCanarySetDigest',
  'protectedHoldoutCanarySetDigest',
] as const satisfies readonly (keyof AgentModelEvaluationEvidenceArchiveAuthorityRoots)[]);

export const createAgentModelEvaluationEvidenceArchiveAuthorityRoots = (
  input: AgentModelEvaluationEvidenceArchiveAuthorityRoots
): AgentModelEvaluationEvidenceArchiveAuthorityRoots => {
  const roots = Object.freeze({ ...input });
  if (!isAgentModelEvaluationEvidenceArchiveAuthorityRoots(roots)) {
    throw new TypeError('Evidence archive authority roots are invalid.');
  }
  return roots;
};

export const isAgentModelEvaluationEvidenceArchiveAuthorityRoots = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveAuthorityRoots =>
  exactKeysWithOptional(value, authorityRootKeys, ['reviewLeaseDigest']) &&
  authorityRootKeys.every((key) => isAgentCanonicalDigest(value[key])) &&
  (!Object.hasOwn(value, 'reviewLeaseDigest') ||
    isAgentCanonicalDigest(value.reviewLeaseDigest));

const authorityRootFamilyBindings = Object.freeze([
  ['capabilityProbeAdmissionSetDigest', 'capabilityProbeAdmissions'],
  [
    'capabilityProbeReferenceReceiptSetDigest',
    'capabilityProbeReferenceReceipts',
  ],
  [
    'runtimeFactSourceOwnerRegistrationSetDigest',
    'runtimeFactSourceOwnerRegistrations',
  ],
  [
    'capabilityProbeProviderResourceCleanupSetDigest',
    'capabilityProbeProviderResourceCleanups',
  ],
  [
    'hostedRetrievalRuntimeResourceLifecycleJournalSetDigest',
    'hostedRetrievalRuntimeResourceLifecycleJournals',
  ],
  [
    'hostedRetrievalRuntimeResourceCleanupSetDigest',
    'hostedRetrievalRuntimeResourceCleanups',
  ],
  [
    'capabilityEffectProviderRuntimeJournalSetDigest',
    'capabilityEffectProviderRuntimeJournals',
  ],
  ['optionalCapabilityFactSourceSetDigest', 'optionalCapabilityFactSources'],
  [
    'optionalCapabilityFactAuthoritySetDigest',
    'optionalCapabilityFactAuthorities',
  ],
  ['endpointSmokeSetDigest', 'endpointSmokeReceipts'],
  ['endpointSmokeDispatchIntentSetDigest', 'endpointSmokeDispatchIntents'],
  ['endpointSmokeTransportReceiptSetDigest', 'endpointSmokeTransportReceipts'],
  [
    'endpointSmokeResultSpoolReceiptSetDigest',
    'endpointSmokeResultSpoolReceipts',
  ],
  [
    'endpointSmokeResultSpoolDispositionReceiptSetDigest',
    'endpointSmokeResultSpoolDispositionReceipts',
  ],
  [
    'endpointSmokeValidationFailureReceiptSetDigest',
    'endpointSmokeValidationFailureReceipts',
  ],
  ['preDispatchFailureReceiptSetDigest', 'preDispatchFailureReceipts'],
  ['transportDispatchIntentSetDigest', 'transportDispatchIntents'],
  ['transportReceiptSetDigest', 'transportReceipts'],
  ['providerResultSpoolReceiptSetDigest', 'providerResultSpoolReceipts'],
  [
    'providerResultSpoolDispositionReceiptSetDigest',
    'providerResultSpoolDispositionReceipts',
  ],
  ['invocationTurnReceiptSetDigest', 'invocationTurnReceipts'],
  ['invocationTurnSetReceiptSetDigest', 'invocationTurnSetReceipts'],
  ['resultSubmissionReceiptSetDigest', 'resultSubmissionReceipts'],
  ['attemptAuthorityOwnerReceiptSetDigest', 'attemptAuthorityOwnerReceipts'],
  ['controlledRuntimeReceiptSetDigest', 'controlledRuntimeReceipts'],
  ['capabilityExecutionReceiptSetDigest', 'capabilityExecutionReceipts'],
  ['capabilitySpecificReceiptSetDigest', 'capabilitySpecificReceipts'],
  [
    'providerCapabilityObservationReceiptSetDigest',
    'providerCapabilityObservationReceipts',
  ],
  [
    'verificationAttemptGrantReceiptSetDigest',
    'verificationAttemptGrantReceipts',
  ],
  ['validatedHumanReviewArtifactSetDigest', 'validatedHumanReviewArtifacts'],
  [
    'validatedHumanMetricObservationSetDigest',
    'validatedHumanMetricObservations',
  ],
  ['reviewRasterScanReceiptSetDigest', 'reviewRasterScanReceipts'],
  ['reviewCandidateRefSetDigest', 'reviewCandidateRefs'],
  ['blindReviewMappingSetDigest', 'blindReviewMappingRefs'],
  ['sourceReceiptSetDigest', 'sourceReceipts'],
  ['executionReceiptSetDigest', 'executionReceipts'],
  ['holdoutExecutionReceiptDigest', 'holdoutExecutionReceipt'],
] as const satisfies readonly (readonly [
  keyof AgentModelEvaluationEvidenceArchiveAuthorityRoots,
  AgentEvaluationEvidenceArchiveFamily,
])[]);

const areAuthorityRootsBoundToFamilies = (
  roots: AgentModelEvaluationEvidenceArchiveAuthorityRoots,
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[]
): boolean => {
  const byFamily = new Map(
    families.map((summary) => [summary.family, summary])
  );
  return authorityRootFamilyBindings.every(
    ([rootKey, family]) =>
      byFamily.get(family)?.semanticDigest === roots[rootKey]
  );
};

const areReviewLeaseCommitmentsBoundToFamilies = (
  hasReviewLeaseDigest: boolean,
  reviewLeaseDigest: unknown,
  roots: AgentModelEvaluationEvidenceArchiveAuthorityRoots,
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[]
): boolean => {
  const reviewArtifacts = families.find(
    ({ family }) => family === 'validatedHumanReviewArtifacts'
  );
  const humanMetricObservations = families.find(
    ({ family }) => family === 'validatedHumanMetricObservations'
  );
  if (
    !reviewArtifacts ||
    !humanMetricObservations ||
    reviewArtifacts.recordCount > 1
  ) {
    return false;
  }
  const required = reviewArtifacts.recordCount === 1;
  const rootHasLease = Object.hasOwn(roots, 'reviewLeaseDigest');
  return (
    rootHasLease === required &&
    hasReviewLeaseDigest === required &&
    (required
      ? humanMetricObservations.recordCount > 0
      : humanMetricObservations.recordCount === 0) &&
    (!required ||
      (isAgentCanonicalDigest(reviewLeaseDigest) &&
        reviewLeaseDigest === roots.reviewLeaseDigest))
  );
};

const indexIdForPlan = (planDigest: CanonicalDigest): string =>
  `evaluation-evidence-index:${planDigest.slice('sha256-'.length)}`;
const rootIdForPlan = (planDigest: CanonicalDigest): string =>
  `evaluation-evidence-root:${planDigest.slice('sha256-'.length)}`;

const isCanonicalFamilySummarySet = (
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[]
): boolean =>
  families.length === AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.length &&
  families.every(
    (summary, index) =>
      isAgentModelEvaluationEvidenceArchiveFamilySummary(summary) &&
      summary.family ===
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES[index] &&
      summary.familyIndex === index &&
      (!AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_FAMILIES.includes(
        summary.family as AgentEvaluationQualificationAuthorityArchiveFamily
      ) ||
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          summary.family as AgentEvaluationQualificationAuthorityArchiveFamily,
          summary.recordCount,
          0
        )) &&
      (summary.family !== 'capabilitySpecificReceipts' ||
        isAgentEvaluationCapabilitySpecificArchiveBudget(
          summary.recordCount,
          0
        )) &&
      (summary.family !== 'attemptAuthorityOwnerReceipts' ||
        isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
          summary.recordCount,
          0
        )) &&
      (summary.family !== 'providerCapabilityObservationReceipts' ||
        isAgentEvaluationProviderCapabilityObservationArchiveBudget(
          summary.recordCount,
          0
        ))
  );

const isCanonicalShardSetForFamilies = (
  shards: readonly AgentModelEvaluationEvidenceArchiveShardDescriptor[],
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[]
): boolean => {
  if (
    shards.length >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShards ||
    !shards.every(isAgentModelEvaluationEvidenceArchiveShardDescriptor)
  ) {
    return false;
  }
  let expectedSequence = 0;
  let expectedFirstRecordIndex = 0;
  for (const summary of families) {
    const familyShards = shards.filter(
      ({ family }) => family === summary.family
    );
    if (familyShards.length !== summary.shardCount) return false;
    if (summary.recordCount === 0) {
      if (familyShards.length !== 0) return false;
      continue;
    }
    let familyRecordCount = 0;
    for (const [familyShardIndex, shard] of familyShards.entries()) {
      if (
        shard.sequence !== expectedSequence ||
        shard.familyShardIndex !== familyShardIndex ||
        shard.firstRecordIndex !== expectedFirstRecordIndex ||
        (familyShardIndex > 0 &&
          compareUnicodeCodePoints(
            familyShards[familyShardIndex - 1]!.lastOrderKey,
            shard.firstOrderKey
          ) >= 0)
      ) {
        return false;
      }
      expectedSequence += 1;
      expectedFirstRecordIndex = shard.lastRecordIndex + 1;
      familyRecordCount += shard.recordCount;
    }
    if (
      familyRecordCount !== summary.recordCount ||
      familyShards[0]!.firstOrderKey !== summary.firstOrderKey ||
      familyShards.at(-1)!.lastOrderKey !== summary.lastOrderKey
    ) {
      return false;
    }
    expectedFirstRecordIndex = 0;
  }
  return expectedSequence === shards.length;
};

type EvidenceIndexInput = Omit<
  AgentModelEvaluationEvidenceIndex,
  | 'format'
  | 'version'
  | 'indexId'
  | 'evidenceFormat'
  | 'evidenceVersion'
  | 'bundleDigest'
  | 'shardSetDigest'
  | 'totalShardBytes'
  | 'totalRecordCount'
  | 'indexDigest'
>;

/**
 * Semantic replacement for the legacy monolithic bundle byte digest. The
 * preimage is bounded to one root per fixed family and can be derived after a
 * streaming export without materializing any record collection.
 */
export const digestAgentModelEvaluationEvidenceArchiveSemanticBundle = (input: {
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  evidenceSetDigest: CanonicalDigest;
  authorityRoots: AgentModelEvaluationEvidenceArchiveAuthorityRoots;
  families: readonly AgentModelEvaluationEvidenceArchiveFamilySummary[];
}): CanonicalDigest => {
  if (
    !isAgentCanonicalDigest(input.planDigest) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    !isAgentCanonicalDigest(input.evidenceSetDigest) ||
    !isAgentModelEvaluationEvidenceArchiveAuthorityRoots(
      input.authorityRoots
    ) ||
    !isCanonicalFamilySummarySet(input.families) ||
    !areAuthorityRootsBoundToFamilies(input.authorityRoots, input.families)
  ) {
    throw new TypeError('Evidence archive semantic bundle roots are invalid.');
  }
  return digestAgentCanonicalValue({
    evidenceFormat: 'prodivix.agent-model-evaluation-evidence',
    evidenceVersion: 3,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    evidenceSetDigest: input.evidenceSetDigest,
    authorityRoots: input.authorityRoots,
    familySemanticRoots: input.families.map(
      ({ family, recordCount, semanticDigest }) => ({
        family,
        recordCount,
        semanticDigest,
      })
    ),
  });
};

export const createAgentModelEvaluationEvidenceIndex = (
  input: EvidenceIndexInput
): AgentModelEvaluationEvidenceIndex => {
  const families = Object.freeze([...input.families]);
  const shards = Object.freeze([...input.shards]);
  const base = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_VERSION,
    indexId: indexIdForPlan(input.planDigest),
    evidenceFormat: 'prodivix.agent-model-evaluation-evidence' as const,
    evidenceVersion: 3 as const,
    exportLeaseId: input.exportLeaseId,
    exportLeaseDigest: input.exportLeaseDigest,
    runConfigArtifactBinding: input.runConfigArtifactBinding,
    sourceConfigDigest: input.sourceConfigDigest,
    frozenRunDigest: input.frozenRunDigest,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    evidenceSetDigest: input.evidenceSetDigest,
    bundleDigest: digestAgentModelEvaluationEvidenceArchiveSemanticBundle({
      planDigest: input.planDigest,
      repositoryCommit: input.repositoryCommit,
      evidenceSetDigest: input.evidenceSetDigest,
      authorityRoots: input.authorityRoots,
      families,
    }),
    authorityPayloadDigest: input.authorityPayloadDigest,
    authorityAttestationDigest: input.authorityAttestationDigest,
    authorityRoots: createAgentModelEvaluationEvidenceArchiveAuthorityRoots(
      input.authorityRoots
    ),
    ...(input.reviewLeaseDigest === undefined
      ? {}
      : { reviewLeaseDigest: input.reviewLeaseDigest }),
    evaluationManifestDigest: input.evaluationManifestDigest,
    families,
    shards,
    shardSetDigest: digestAgentModelEvaluationEvidenceArchiveShardSet(shards),
    totalShardBytes: shards.reduce(
      (total, { byteSize }) => total + byteSize,
      0
    ),
    totalRecordCount: families.reduce(
      (total, { recordCount }) => total + recordCount,
      0
    ),
    createdAt: input.createdAt,
  });
  const index = Object.freeze({
    ...base,
    indexDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentModelEvaluationEvidenceIndex(index)) {
    throw new TypeError('Evidence archive index is invalid.');
  }
  return index;
};

export const isAgentModelEvaluationEvidenceIndex = (
  value: unknown
): value is AgentModelEvaluationEvidenceIndex => {
  try {
    if (
      !exactKeysWithOptional(
        value,
        [
          'format',
          'version',
          'indexId',
          'evidenceFormat',
          'evidenceVersion',
          'exportLeaseId',
          'exportLeaseDigest',
          'runConfigArtifactBinding',
          'sourceConfigDigest',
          'frozenRunDigest',
          'planDigest',
          'repositoryCommit',
          'evidenceSetDigest',
          'bundleDigest',
          'authorityPayloadDigest',
          'authorityAttestationDigest',
          'authorityRoots',
          'evaluationManifestDigest',
          'families',
          'shards',
          'shardSetDigest',
          'totalShardBytes',
          'totalRecordCount',
          'createdAt',
          'indexDigest',
        ],
        ['reviewLeaseDigest']
      ) ||
      value.format !== AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FORMAT ||
      value.version !== AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_VERSION ||
      value.evidenceFormat !== 'prodivix.agent-model-evaluation-evidence' ||
      value.evidenceVersion !== 3 ||
      !isBoundedText(value.exportLeaseId) ||
      !isAgentCanonicalDigest(value.exportLeaseDigest) ||
      !isAgentEvaluationProductionRunConfigArtifactBinding(
        value.runConfigArtifactBinding
      ) ||
      !isAgentCanonicalDigest(value.planDigest) ||
      value.indexId !== indexIdForPlan(value.planDigest) ||
      typeof value.repositoryCommit !== 'string' ||
      !repositoryCommitPattern.test(value.repositoryCommit) ||
      ![
        value.evidenceSetDigest,
        value.bundleDigest,
        value.sourceConfigDigest,
        value.frozenRunDigest,
        value.authorityPayloadDigest,
        value.authorityAttestationDigest,
        value.evaluationManifestDigest,
        value.shardSetDigest,
        value.indexDigest,
      ].every(isAgentCanonicalDigest) ||
      !Array.isArray(value.families) ||
      !isCanonicalFamilySummarySet(value.families) ||
      !isAgentModelEvaluationEvidenceArchiveAuthorityRoots(
        value.authorityRoots
      ) ||
      !areAuthorityRootsBoundToFamilies(value.authorityRoots, value.families) ||
      !areReviewLeaseCommitmentsBoundToFamilies(
        Object.hasOwn(value, 'reviewLeaseDigest'),
        value.reviewLeaseDigest,
        value.authorityRoots,
        value.families
      ) ||
      !Array.isArray(value.shards) ||
      !isCanonicalShardSetForFamilies(value.shards, value.families) ||
      !isBoundedSafeInteger(
        value.totalShardBytes,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
      ) ||
      !isBoundedSafeInteger(
        value.totalRecordCount,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
      ) ||
      !isInstant(value.createdAt)
    ) {
      return false;
    }
    if (
      value.runConfigArtifactBinding.sourceConfigDigest !==
        value.sourceConfigDigest ||
      value.runConfigArtifactBinding.frozenRunDigest !==
        value.frozenRunDigest ||
      value.runConfigArtifactBinding.planDigest !== value.planDigest ||
      value.runConfigArtifactBinding.repositoryCommit !== value.repositoryCommit
    ) {
      return false;
    }
    const expectedShardBytes = value.shards.reduce(
      (total, shard) => total + shard.byteSize,
      0
    );
    const expectedRecordCount = value.families.reduce(
      (total, family) => total + family.recordCount,
      0
    );
    const canonicalIndexBytes = utf8Encoder.encode(
      canonicalJsonText(value)
    ).byteLength;
    const { indexDigest: _indexDigest, ...base } = value;
    return (
      value.shardSetDigest ===
        digestAgentModelEvaluationEvidenceArchiveShardSet(value.shards) &&
      value.bundleDigest ===
        digestAgentModelEvaluationEvidenceArchiveSemanticBundle({
          planDigest: value.planDigest,
          repositoryCommit: value.repositoryCommit,
          evidenceSetDigest: value.evidenceSetDigest as CanonicalDigest,
          authorityRoots: value.authorityRoots,
          families: value.families,
        }) &&
      value.totalShardBytes === expectedShardBytes &&
      value.totalRecordCount === expectedRecordCount &&
      value.indexDigest === digestAgentCanonicalValue(base) &&
      canonicalIndexBytes <=
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes &&
      value.totalShardBytes + canonicalIndexBytes <=
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
  } catch {
    return false;
  }
};

export const encodeAgentModelEvaluationEvidenceIndex = (
  index: AgentModelEvaluationEvidenceIndex
): string => {
  if (!isAgentModelEvaluationEvidenceIndex(index)) {
    throw new TypeError('Evidence archive index is invalid.');
  }
  const text = canonicalJsonText(index);
  if (
    utf8Encoder.encode(text).byteLength >
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes
  ) {
    throw new TypeError('Evidence archive index exceeds the byte limit.');
  }
  return text;
};

export const decodeAgentModelEvaluationEvidenceIndex = (
  text: string
): AgentModelEvaluationEvidenceIndex => {
  if (
    typeof text !== 'string' ||
    utf8Encoder.encode(text).byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes
  ) {
    throw new TypeError('Evidence archive index exceeds the byte limit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Evidence archive index is not valid JSON.');
  }
  if (
    !isSafeJsonValue(parsed) ||
    canonicalJsonText(parsed) !== text ||
    !isAgentModelEvaluationEvidenceIndex(parsed)
  ) {
    throw new TypeError('Evidence archive index is non-canonical or invalid.');
  }
  return freezeJsonValue(parsed) as AgentModelEvaluationEvidenceIndex;
};

type ArchiveAttestationPayloadInput = Omit<
  AgentModelEvaluationEvidenceArchiveAttestationPayload,
  'format' | 'version'
>;

export const createAgentModelEvaluationEvidenceArchiveAttestationPayload = (
  input: ArchiveAttestationPayloadInput
): AgentModelEvaluationEvidenceArchiveAttestationPayload => {
  const payload = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_VERSION,
    ...input,
  });
  if (!isAgentModelEvaluationEvidenceArchiveAttestationPayload(payload)) {
    throw new TypeError('Evidence archive attestation payload is invalid.');
  }
  return payload;
};

export const isAgentModelEvaluationEvidenceArchiveAttestationPayload = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveAttestationPayload =>
  exactKeysWithOptional(
    value,
    [
      'format',
      'version',
      'authorityId',
      'keyId',
      'exportLeaseId',
      'exportLeaseDigest',
      'runConfigArtifactBinding',
      'sourceConfigDigest',
      'frozenRunDigest',
      'planDigest',
      'repositoryCommit',
      'evidenceSetDigest',
      'bundleDigest',
      'authorityPayloadDigest',
      'authorityAttestationDigest',
      'authorityRoots',
      'evaluationManifestDigest',
      'indexDigest',
      'evidenceIndexArtifactDigest',
      'evidenceIndexArtifactSize',
      'shardSetDigest',
      'totalShardBytes',
      'totalRecordCount',
      'issuedAt',
    ],
    ['reviewLeaseDigest']
  ) &&
  value.format === AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_FORMAT &&
  value.version ===
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_ATTESTATION_VERSION &&
  isBoundedText(value.authorityId) &&
  isBoundedText(value.keyId) &&
  isBoundedText(value.exportLeaseId) &&
  isAgentEvaluationProductionRunConfigArtifactBinding(
    value.runConfigArtifactBinding
  ) &&
  typeof value.repositoryCommit === 'string' &&
  repositoryCommitPattern.test(value.repositoryCommit) &&
  [
    value.planDigest,
    value.exportLeaseDigest,
    value.sourceConfigDigest,
    value.frozenRunDigest,
    value.evidenceSetDigest,
    value.bundleDigest,
    value.authorityPayloadDigest,
    value.authorityAttestationDigest,
    value.evaluationManifestDigest,
    value.indexDigest,
    value.evidenceIndexArtifactDigest,
    value.shardSetDigest,
  ].every(isAgentCanonicalDigest) &&
  value.runConfigArtifactBinding.sourceConfigDigest ===
    value.sourceConfigDigest &&
  value.runConfigArtifactBinding.frozenRunDigest === value.frozenRunDigest &&
  value.runConfigArtifactBinding.planDigest === value.planDigest &&
  value.runConfigArtifactBinding.repositoryCommit === value.repositoryCommit &&
  isAgentModelEvaluationEvidenceArchiveAuthorityRoots(value.authorityRoots) &&
  (!Object.hasOwn(value, 'reviewLeaseDigest') ||
    isAgentCanonicalDigest(value.reviewLeaseDigest)) &&
  Object.hasOwn(value, 'reviewLeaseDigest') ===
    Object.hasOwn(value.authorityRoots, 'reviewLeaseDigest') &&
  value.reviewLeaseDigest === value.authorityRoots.reviewLeaseDigest &&
  isBoundedSafeInteger(
    value.evidenceIndexArtifactSize,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
    1
  ) &&
  isBoundedSafeInteger(
    value.totalShardBytes,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
  ) &&
  isBoundedSafeInteger(
    value.totalRecordCount,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
  ) &&
  value.totalShardBytes + value.evidenceIndexArtifactSize <=
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes &&
  isInstant(value.issuedAt);

export const agentModelEvaluationEvidenceArchiveAttestationPayloadFrom = (
  value: AgentModelEvaluationEvidenceArchiveAttestation
): AgentModelEvaluationEvidenceArchiveAttestationPayload => {
  const {
    algorithm: _algorithm,
    attestedPayloadDigest: _attestedPayloadDigest,
    signature: _signature,
    attestationDigest: _attestationDigest,
    ...payload
  } = value;
  return payload;
};

type ArchiveAttestationInput = ArchiveAttestationPayloadInput &
  Readonly<{ signature: string }>;

export const createAgentModelEvaluationEvidenceArchiveAttestation = (
  input: ArchiveAttestationInput
): AgentModelEvaluationEvidenceArchiveAttestation => {
  const { signature, ...payloadInput } = input;
  const payload =
    createAgentModelEvaluationEvidenceArchiveAttestationPayload(payloadInput);
  const base = Object.freeze({
    ...payload,
    algorithm: 'ed25519' as const,
    attestedPayloadDigest: digestAgentCanonicalValue(payload),
    signature,
  });
  const attestation = Object.freeze({
    ...base,
    attestationDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentModelEvaluationEvidenceArchiveAttestation(attestation)) {
    throw new TypeError('Evidence archive attestation is invalid.');
  }
  return attestation;
};

export const isAgentModelEvaluationEvidenceArchiveAttestation = (
  value: unknown
): value is AgentModelEvaluationEvidenceArchiveAttestation => {
  try {
    if (
      !exactKeysWithOptional(
        value,
        [
          'format',
          'version',
          'authorityId',
          'keyId',
          'exportLeaseId',
          'exportLeaseDigest',
          'runConfigArtifactBinding',
          'sourceConfigDigest',
          'frozenRunDigest',
          'planDigest',
          'repositoryCommit',
          'evidenceSetDigest',
          'bundleDigest',
          'authorityPayloadDigest',
          'authorityAttestationDigest',
          'authorityRoots',
          'evaluationManifestDigest',
          'indexDigest',
          'evidenceIndexArtifactDigest',
          'evidenceIndexArtifactSize',
          'shardSetDigest',
          'totalShardBytes',
          'totalRecordCount',
          'issuedAt',
          'algorithm',
          'attestedPayloadDigest',
          'signature',
          'attestationDigest',
        ],
        ['reviewLeaseDigest']
      ) ||
      value.algorithm !== 'ed25519' ||
      !isCanonicalBase64Url(value.signature, 64) ||
      !isAgentCanonicalDigest(value.attestedPayloadDigest) ||
      !isAgentCanonicalDigest(value.attestationDigest)
    ) {
      return false;
    }
    const payload = agentModelEvaluationEvidenceArchiveAttestationPayloadFrom(
      value as AgentModelEvaluationEvidenceArchiveAttestation
    );
    if (
      !isAgentModelEvaluationEvidenceArchiveAttestationPayload(payload) ||
      value.attestedPayloadDigest !== digestAgentCanonicalValue(payload)
    ) {
      return false;
    }
    const { attestationDigest: _attestationDigest, ...base } = value;
    return value.attestationDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const verifyAgentModelEvaluationEvidenceArchiveAttestation = async (
  value: unknown,
  trust: AgentModelEvaluationEvidenceArchiveAttestationTrust
): Promise<boolean> => {
  if (!isAgentModelEvaluationEvidenceArchiveAttestation(value)) return false;
  const keyIds = trust.trustedPublicKeys.map(({ keyId }) => keyId);
  if (new Set(keyIds).size !== keyIds.length) return false;
  const trustedKey = trust.trustedPublicKeys.find(
    ({ keyId }) => keyId === value.keyId
  );
  if (
    !trustedKey ||
    !isBoundedText(trustedKey.keyId) ||
    !isCanonicalBase64Url(trustedKey.publicKeyBase64Url, 32)
  ) {
    return false;
  }
  const payload =
    agentModelEvaluationEvidenceArchiveAttestationPayloadFrom(value);
  try {
    return await trust.verifyEd25519({
      keyId: trustedKey.keyId,
      publicKeyBase64Url: trustedKey.publicKeyBase64Url,
      signatureBase64Url: value.signature,
      payload,
      message: utf8Encoder.encode(canonicalJsonText(payload)),
    });
  } catch {
    return false;
  }
};

type EvidenceRootInput = Readonly<{
  index: AgentModelEvaluationEvidenceIndex;
  evidenceIndexArtifactBytes: Uint8Array;
  archiveAttestation: AgentModelEvaluationEvidenceArchiveAttestation;
}>;

export const createAgentModelEvaluationEvidenceRoot = (
  input: EvidenceRootInput
): AgentModelEvaluationEvidenceRoot => {
  if (
    !isAgentModelEvaluationEvidenceIndex(input.index) ||
    input.evidenceIndexArtifactBytes.byteLength < 1 ||
    input.evidenceIndexArtifactBytes.byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes ||
    !isAgentModelEvaluationEvidenceArchiveAttestation(input.archiveAttestation)
  ) {
    throw new TypeError('Evidence archive root input is invalid.');
  }
  const indexArtifactDigest = digestAgentCanonicalBytes(
    input.evidenceIndexArtifactBytes
  );
  const index = input.index;
  const attestation = input.archiveAttestation;
  if (
    canonicalJsonText(index) !==
      new TextDecoder('utf-8', { fatal: true }).decode(
        input.evidenceIndexArtifactBytes
      ) ||
    attestation.exportLeaseId !== index.exportLeaseId ||
    attestation.exportLeaseDigest !== index.exportLeaseDigest ||
    canonicalJsonText(attestation.runConfigArtifactBinding) !==
      canonicalJsonText(index.runConfigArtifactBinding) ||
    attestation.sourceConfigDigest !== index.sourceConfigDigest ||
    attestation.frozenRunDigest !== index.frozenRunDigest ||
    attestation.planDigest !== index.planDigest ||
    attestation.repositoryCommit !== index.repositoryCommit ||
    attestation.evidenceSetDigest !== index.evidenceSetDigest ||
    attestation.bundleDigest !== index.bundleDigest ||
    attestation.authorityPayloadDigest !== index.authorityPayloadDigest ||
    attestation.authorityAttestationDigest !==
      index.authorityAttestationDigest ||
    canonicalJsonText(attestation.authorityRoots) !==
      canonicalJsonText(index.authorityRoots) ||
    attestation.reviewLeaseDigest !== index.reviewLeaseDigest ||
    attestation.evaluationManifestDigest !== index.evaluationManifestDigest ||
    attestation.indexDigest !== index.indexDigest ||
    attestation.evidenceIndexArtifactDigest !== indexArtifactDigest ||
    attestation.evidenceIndexArtifactSize !==
      input.evidenceIndexArtifactBytes.byteLength ||
    attestation.shardSetDigest !== index.shardSetDigest ||
    attestation.totalShardBytes !== index.totalShardBytes ||
    attestation.totalRecordCount !== index.totalRecordCount
  ) {
    throw new TypeError(
      'Evidence archive attestation does not bind the exact index.'
    );
  }
  const base = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_VERSION,
    rootId: rootIdForPlan(index.planDigest),
    exportLeaseId: index.exportLeaseId,
    exportLeaseDigest: index.exportLeaseDigest,
    runConfigArtifactBinding: index.runConfigArtifactBinding,
    sourceConfigDigest: index.sourceConfigDigest,
    frozenRunDigest: index.frozenRunDigest,
    planDigest: index.planDigest,
    repositoryCommit: index.repositoryCommit,
    evidenceSetDigest: index.evidenceSetDigest,
    bundleDigest: index.bundleDigest,
    authorityPayloadDigest: index.authorityPayloadDigest,
    authorityAttestationDigest: index.authorityAttestationDigest,
    authorityRoots: index.authorityRoots,
    ...(index.reviewLeaseDigest === undefined
      ? {}
      : { reviewLeaseDigest: index.reviewLeaseDigest }),
    evaluationManifestDigest: index.evaluationManifestDigest,
    indexDigest: index.indexDigest,
    evidenceIndexArtifactDigest: indexArtifactDigest,
    evidenceIndexArtifactSize: input.evidenceIndexArtifactBytes.byteLength,
    shardSetDigest: index.shardSetDigest,
    totalShardBytes: index.totalShardBytes,
    totalRecordCount: index.totalRecordCount,
    archiveAttestation: attestation,
    archiveAttestationDigest: attestation.attestationDigest,
    recordedAt: attestation.issuedAt,
  });
  const root = Object.freeze({
    ...base,
    rootDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentModelEvaluationEvidenceRoot(root)) {
    throw new TypeError('Evidence archive root is invalid.');
  }
  return root;
};

export const isAgentModelEvaluationEvidenceRoot = (
  value: unknown
): value is AgentModelEvaluationEvidenceRoot => {
  try {
    if (
      !exactKeysWithOptional(
        value,
        [
          'format',
          'version',
          'rootId',
          'exportLeaseId',
          'exportLeaseDigest',
          'runConfigArtifactBinding',
          'sourceConfigDigest',
          'frozenRunDigest',
          'planDigest',
          'repositoryCommit',
          'evidenceSetDigest',
          'bundleDigest',
          'authorityPayloadDigest',
          'authorityAttestationDigest',
          'authorityRoots',
          'evaluationManifestDigest',
          'indexDigest',
          'evidenceIndexArtifactDigest',
          'evidenceIndexArtifactSize',
          'shardSetDigest',
          'totalShardBytes',
          'totalRecordCount',
          'archiveAttestation',
          'archiveAttestationDigest',
          'recordedAt',
          'rootDigest',
        ],
        ['reviewLeaseDigest']
      ) ||
      value.format !== AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_FORMAT ||
      value.version !== AGENT_MODEL_EVALUATION_EVIDENCE_ROOT_VERSION ||
      !isBoundedText(value.exportLeaseId) ||
      !isAgentCanonicalDigest(value.exportLeaseDigest) ||
      !isAgentEvaluationProductionRunConfigArtifactBinding(
        value.runConfigArtifactBinding
      ) ||
      !isAgentCanonicalDigest(value.planDigest) ||
      value.rootId !== rootIdForPlan(value.planDigest) ||
      typeof value.repositoryCommit !== 'string' ||
      !repositoryCommitPattern.test(value.repositoryCommit) ||
      ![
        value.evidenceSetDigest,
        value.bundleDigest,
        value.sourceConfigDigest,
        value.frozenRunDigest,
        value.authorityPayloadDigest,
        value.authorityAttestationDigest,
        value.evaluationManifestDigest,
        value.indexDigest,
        value.evidenceIndexArtifactDigest,
        value.shardSetDigest,
        value.archiveAttestationDigest,
        value.rootDigest,
      ].every(isAgentCanonicalDigest) ||
      !isBoundedSafeInteger(
        value.evidenceIndexArtifactSize,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
        1
      ) ||
      !isBoundedSafeInteger(
        value.totalShardBytes,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
      ) ||
      !isBoundedSafeInteger(
        value.totalRecordCount,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords
      ) ||
      !isAgentModelEvaluationEvidenceArchiveAttestation(
        value.archiveAttestation
      ) ||
      !isAgentModelEvaluationEvidenceArchiveAuthorityRoots(
        value.authorityRoots
      ) ||
      (Object.hasOwn(value, 'reviewLeaseDigest') &&
        !isAgentCanonicalDigest(value.reviewLeaseDigest)) ||
      Object.hasOwn(value, 'reviewLeaseDigest') !==
        Object.hasOwn(value.authorityRoots, 'reviewLeaseDigest') ||
      value.reviewLeaseDigest !== value.authorityRoots.reviewLeaseDigest ||
      !isInstant(value.recordedAt)
    ) {
      return false;
    }
    if (
      value.runConfigArtifactBinding.sourceConfigDigest !==
        value.sourceConfigDigest ||
      value.runConfigArtifactBinding.frozenRunDigest !==
        value.frozenRunDigest ||
      value.runConfigArtifactBinding.planDigest !== value.planDigest ||
      value.runConfigArtifactBinding.repositoryCommit !== value.repositoryCommit
    ) {
      return false;
    }
    const attestation = value.archiveAttestation;
    if (
      value.archiveAttestationDigest !== attestation.attestationDigest ||
      value.recordedAt !== attestation.issuedAt ||
      value.exportLeaseId !== attestation.exportLeaseId ||
      value.exportLeaseDigest !== attestation.exportLeaseDigest ||
      canonicalJsonText(value.runConfigArtifactBinding) !==
        canonicalJsonText(attestation.runConfigArtifactBinding) ||
      value.sourceConfigDigest !== attestation.sourceConfigDigest ||
      value.frozenRunDigest !== attestation.frozenRunDigest ||
      value.planDigest !== attestation.planDigest ||
      value.repositoryCommit !== attestation.repositoryCommit ||
      value.evidenceSetDigest !== attestation.evidenceSetDigest ||
      value.bundleDigest !== attestation.bundleDigest ||
      value.authorityPayloadDigest !== attestation.authorityPayloadDigest ||
      value.authorityAttestationDigest !==
        attestation.authorityAttestationDigest ||
      canonicalJsonText(value.authorityRoots) !==
        canonicalJsonText(attestation.authorityRoots) ||
      value.reviewLeaseDigest !== attestation.reviewLeaseDigest ||
      value.evaluationManifestDigest !== attestation.evaluationManifestDigest ||
      value.indexDigest !== attestation.indexDigest ||
      value.evidenceIndexArtifactDigest !==
        attestation.evidenceIndexArtifactDigest ||
      value.evidenceIndexArtifactSize !==
        attestation.evidenceIndexArtifactSize ||
      value.shardSetDigest !== attestation.shardSetDigest ||
      value.totalShardBytes !== attestation.totalShardBytes ||
      value.totalRecordCount !== attestation.totalRecordCount
    ) {
      return false;
    }
    const canonicalRootBytes = utf8Encoder.encode(
      canonicalJsonText(value)
    ).byteLength;
    const { rootDigest: _rootDigest, ...base } = value;
    return (
      value.rootDigest === digestAgentCanonicalValue(base) &&
      canonicalRootBytes <=
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes &&
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount: value.totalRecordCount,
        totalShardBytes: value.totalShardBytes,
        indexBytes: value.evidenceIndexArtifactSize,
        rootBytes: canonicalRootBytes,
      })
    );
  } catch {
    return false;
  }
};

export const encodeAgentModelEvaluationEvidenceRoot = (
  root: AgentModelEvaluationEvidenceRoot
): string => {
  if (!isAgentModelEvaluationEvidenceRoot(root)) {
    throw new TypeError('Evidence archive root is invalid.');
  }
  return canonicalJsonText(root);
};

export const decodeAgentModelEvaluationEvidenceRoot = (
  text: string
): AgentModelEvaluationEvidenceRoot => {
  if (
    typeof text !== 'string' ||
    utf8Encoder.encode(text).byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes
  ) {
    throw new TypeError('Evidence archive root exceeds the byte limit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError('Evidence archive root is not valid JSON.');
  }
  if (
    !isSafeJsonValue(parsed) ||
    canonicalJsonText(parsed) !== text ||
    !isAgentModelEvaluationEvidenceRoot(parsed)
  ) {
    throw new TypeError('Evidence archive root is non-canonical or invalid.');
  }
  return freezeJsonValue(parsed) as AgentModelEvaluationEvidenceRoot;
};

export const assertAgentModelEvaluationEvidenceArchiveFamilyPage = (
  value: unknown,
  expectedLeaseId: string,
  expectedFamily: AgentEvaluationEvidenceArchiveFamily,
  expectedPageOrdinal: number,
  expectedFirstRecordOrdinal: number,
  expectedPreviousOrderKey: string | null
): AgentModelEvaluationEvidenceArchiveFamilyPage => {
  if (
    (!exactKeys(value, [
      'leaseId',
      'family',
      'pageOrdinal',
      'firstRecordOrdinal',
      'records',
      'recordCount',
      'recordBytes',
      'pageRecordSetDigest',
      'pageDigest',
    ]) &&
      !exactKeys(value, [
        'leaseId',
        'family',
        'pageOrdinal',
        'firstRecordOrdinal',
        'records',
        'recordCount',
        'recordBytes',
        'pageRecordSetDigest',
        'pageDigest',
        'nextCursor',
      ])) ||
    !isBoundedText(expectedLeaseId) ||
    (expectedPreviousOrderKey !== null &&
      !isBoundedText(expectedPreviousOrderKey, 8_192)) ||
    value.leaseId !== expectedLeaseId ||
    value.family !== expectedFamily ||
    value.pageOrdinal !== expectedPageOrdinal ||
    value.firstRecordOrdinal !== expectedFirstRecordOrdinal ||
    !Array.isArray(value.records) ||
    value.records.length < 1 ||
    value.records.length >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordsPerPage ||
    value.records.some(
      (record) =>
        !exactKeys(record, [
          'orderKey',
          'recordDigest',
          'contentDigest',
          'byteLength',
          'value',
        ]) ||
        !isBoundedText(record.orderKey, 8_192) ||
        !isAgentCanonicalDigest(record.recordDigest) ||
        !isAgentCanonicalDigest(record.contentDigest) ||
        !isBoundedSafeInteger(
          record.byteLength,
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes,
          1
        ) ||
        !isSafeJsonValue(record.value) ||
        record.orderKey !==
          createAgentModelEvaluationEvidenceArchiveOrderKey(
            expectedFamily,
            record.value
          ) ||
        record.recordDigest !==
          digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
            expectedFamily,
            record.value
          ) ||
        record.contentDigest !== digestAgentCanonicalValue(record.value) ||
        record.byteLength !==
          utf8Encoder.encode(canonicalJsonText(record.value)).byteLength
    ) ||
    value.records.some(
      (record, index) =>
        (index === 0 &&
          expectedPreviousOrderKey !== null &&
          compareUnicodeCodePoints(expectedPreviousOrderKey, record.orderKey) >=
            0) ||
        (index > 0 &&
          compareUnicodeCodePoints(
            (
              value.records as readonly AgentModelEvaluationEvidenceArchiveSourceRecord[]
            )[index - 1]!.orderKey,
            record.orderKey
          ) >= 0)
    ) ||
    value.recordCount !== value.records.length ||
    !isBoundedSafeInteger(
      value.recordBytes,
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes,
      1
    ) ||
    value.recordBytes !==
      value.records.reduce((total, record) => total + record.byteLength, 0) ||
    !isAgentCanonicalDigest(value.pageRecordSetDigest) ||
    value.pageRecordSetDigest !==
      digestAgentCanonicalValue(
        value.records.map(({ recordDigest }) => recordDigest)
      ) ||
    !isAgentCanonicalDigest(value.pageDigest) ||
    (value.nextCursor !== undefined &&
      !isBoundedText(value.nextCursor, 8_192)) ||
    utf8Encoder.encode(canonicalJsonText(value)).byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
  ) {
    throw new TypeError(
      'Evidence archive family page is malformed, empty, oversized, or non-contiguous.'
    );
  }
  const { pageDigest, ...pageBase } = value;
  if (pageDigest !== digestAgentCanonicalValue(pageBase)) {
    throw new TypeError('Evidence archive family page digest is invalid.');
  }
  return value as AgentModelEvaluationEvidenceArchiveFamilyPage;
};

export const digestAgentModelEvaluationEvidenceIndexArtifactBytes = (
  bytes: Uint8Array
): CanonicalDigest => {
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength >
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes
  ) {
    throw new TypeError(
      'Evidence archive index artifact bytes are out of bounds.'
    );
  }
  return digestAgentCanonicalBytes(bytes);
};
