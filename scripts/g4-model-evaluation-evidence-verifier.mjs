import { execFileSync } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
  createAgentModelEvaluationEvidenceArchivePhysicalBudget,
  createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator,
  createAgentModelEvaluationEvidenceRoot,
  decodeAgentModelEvaluationEvidenceArchiveRecordLine,
  decodeAgentModelEvaluationEvidenceIndex,
  decodeAgentModelEvaluationEvidenceRoot,
  isAgentModelEvaluationEvidenceRoot,
  isAgentEvaluationAttemptAuthorityOwnerArchiveBudget,
  isAgentEvaluationCapabilitySpecificArchiveBudget,
  isAgentEvaluationProviderCapabilityObservationArchiveBudget,
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET,
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS,
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS,
  isAgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  isAgentEvaluationCapabilityProbeReferenceArchiveRecord,
  isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyCompleteForPlan,
  isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan,
  isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord,
  isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord,
  isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
  isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord,
  isAgentEvaluationQualificationAuthorityArchiveFamilyBudget,
  isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource,
  projectAgentModelEvaluationEvidenceArchiveSemanticValue,
  verifyAgentModelEvaluationEvidenceArchiveAttestation,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceArchive.ts';
import { isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord } from '../packages/ai/src/evaluation/agentEvaluationCapabilityEffectProviderJournal.ts';
import {
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings,
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily,
  isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  matchAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger,
} from '../packages/ai/src/providers/agentHostedRetrievalRuntimeResource.ts';
import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage,
  digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngress,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt,
  matchAgentCapabilityProbeProviderResourceCleanupReceipt,
  matchAgentCapabilityProbeProviderResourceCleanupResponse,
  matchAgentCapabilityProbeProviderResourceDeletionAuthority,
} from '../packages/ai/src/providers/agentCapabilityProbeProviderResource.ts';
import {
  AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES,
  isAgentEvaluationProductionRunConfigArtifactBinding,
} from '../packages/ai/src/evaluation/agentEvaluationFrozenConfigCommitment.ts';
import {
  createAgentEvaluationPlanPricingSourceReceiptId,
  digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet,
  isAgentEvaluationExecutionReceipt,
  isAgentEvaluationSourceReceipt,
  isAgentModelEvaluationAuthorityAttestation,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceBundle.ts';
import {
  isAgentEvaluationBlindReviewMappingRef,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationProviderResultSpoolDispositionReceipt,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationResultSubmissionReceipt,
  isAgentEvaluationReviewCandidateEvidenceRef,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticity.ts';
import {
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationEndpointSmoke.ts';
import {
  matchAgentEvaluationEndpointSmokeAuthorityFacts,
  qualifiesAgentEvaluationEndpointSmokeSet,
} from '../packages/ai/src/evaluation/agentEvaluationEndpointSmokeAuthenticity.ts';
import { isAgentEvaluationPreDispatchFailureReceipt } from '../packages/ai/src/evaluation/agentEvaluationPreDispatchFailure.ts';
import {
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  isAgentEvaluationCapabilityExecutionReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilityExecution.ts';
import {
  AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT,
  isAgentEvaluationCapabilitySpecificReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilitySpecificReceipt.ts';
import {
  createAgentEvaluationCapabilitySpecificProviderObservationProjection,
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityObservationProjection,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  matchAgentEvaluationCapabilitySpecificProviderObservationProjection,
  matchAgentEvaluationProviderCapabilityObservationFactPolicy,
  matchAgentEvaluationProviderCapabilityFactAuthorityBinding,
} from '../packages/ai/src/evaluation/agentEvaluationProviderCapabilityObservation.ts';
import { createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt } from '../packages/ai/src/evaluation/agentEvaluationNativeOptionalCapabilityBootstrap.ts';
import {
  createAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbePublicResource,
} from '../packages/ai/src/providers/agentCapabilityProbeProgram.ts';
import {
  createAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultAuthority,
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultResolveRequest,
  isAgentNativeProviderStateVaultRetirementReceipt,
  isAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
} from '../packages/ai/src/providers/agentNativeProviderStateVault.ts';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
  digestAgentEvaluationAttemptGrading,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationAttemptAuthorityOwnerReceipt.ts';
import {
  matchAgentEvaluationCapabilityTerminalAuthority,
  matchGuardedAgentEvaluationCapabilitySpecificOwnerAuthority,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilitySpecificOwnerBinding.ts';
import {
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilityEffectAuthority.ts';
import { isAgentEvaluationVerificationAttemptGrantReceipt } from '../packages/ai/src/evaluation/agentEvaluationVerificationAttemptGrant.ts';
import { isAgentEvaluationValidatedHumanReviewArtifact } from '../packages/ai/src/evaluation/agentEvaluationValidatedHumanReview.ts';
import {
  createAgentEvaluationValidatedHumanMetricObservations,
  isAgentEvaluationValidatedHumanMetricObservation,
} from '../packages/ai/src/evaluation/agentEvaluationHumanMetricAuthority.ts';
import {
  isAgentEvaluationGraderReport,
  isAgentEvaluationMetricReport,
  isAgentEvaluationReviewRasterScanReceipt,
  isAgentEvaluationShardCheckpoint,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
} from '../packages/ai/src/evaluation/agentEvaluationResults.ts';
import {
  planAgentModelEvaluationAttempts,
  resolveAgentModelEvaluationHostedRuntimeBudgetFloor,
  resolveAgentEvaluationCapabilityDescriptor,
  validateAgentModelEvaluationPlan,
} from '../packages/ai/src/evaluation/agentEvaluationPlan.ts';
import { AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT } from '../packages/ai/src/evaluation/agentEvaluationReleasePlan.ts';
import { isAgentBudgetLedgerState } from '../packages/ai/src/usage/agentBudgetLedger.ts';
import { createAgentUsageVector } from '../packages/ai/src/usage/agentUsage.ts';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
} from '../packages/ai/src/domain/agentCanonical.ts';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '../packages/shared/src/canonical/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';
import { createNodeAgentEvaluationCoordinatorFilePort } from '../apps/agent-evaluation-runner/src/productionFiles.ts';
import { createProductionAgentEvaluationHumanReviewImportVerifier } from '../apps/agent-evaluation-runner/src/reviewValidation.ts';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeReferenceBundle,
} from '../apps/agent-evaluation-runner/src/capabilityProbeAdmissionClient.ts';
import { decodeAgentEvaluationCapabilityProbeAdmissionResponse } from '../apps/agent-evaluation-runner/src/capabilityProbeAdmissionHttpClient.ts';
import {
  decodeAgentEvaluationRuntimeFactSourceOwnerHealth,
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest,
} from '../apps/agent-evaluation-runner/src/runtimeFactSourceRegistration.ts';
import { decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt } from '../apps/agent-evaluation-runner/src/runtimeFactSourceRegistrationClient.ts';
import {
  createAgentEvaluationOptionalCapabilityFactSourceRequest,
  decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse,
  decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt,
  decodeAgentEvaluationOptionalCapabilityFactStageResponse,
} from '../apps/agent-evaluation-runner/src/optionalCapabilityFactAuthorityClient.ts';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from '../apps/agent-evaluation-runner/src/runConfig.ts';
import { loadProductionAgentEvaluationRunConfigArtifact } from '../apps/agent-evaluation-runner/src/productionRunConfigArtifact.ts';

const maximumCanaryCount = 256;
const maximumCanaryBytes = 65_536;
const rawEd25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const digestPattern = /^sha256-[0-9a-f]{64}$/u;

const fail = (message) => {
  throw new Error(message);
};

const archiveBudgetAdmissionByFamily = new Map([
  [
    'capabilityProbeAdmissions',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'capabilityProbeAdmissions',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'capabilityProbeReferenceReceipts',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'capabilityProbeReferenceReceipts',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'capabilityProbeProviderResourceCleanups',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'capabilityProbeProviderResourceCleanups',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'runtimeFactSourceOwnerRegistrations',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'runtimeFactSourceOwnerRegistrations',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'capabilityEffectProviderRuntimeJournals',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'capabilityEffectProviderRuntimeJournals',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'hostedRetrievalRuntimeResourceLifecycleJournals',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'hostedRetrievalRuntimeResourceLifecycleJournals',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'hostedRetrievalRuntimeResourceCleanups',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'hostedRetrievalRuntimeResourceCleanups',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'optionalCapabilityFactSources',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'optionalCapabilityFactSources',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'optionalCapabilityFactAuthorities',
    Object.freeze({
      budget: Object.freeze({
        maximumRecordCount:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount,
        maximumCanonicalFamilyBytes:
          AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumFamilyBytes,
      }),
      admits: (recordCount, canonicalValueBytes) =>
        isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
          'optionalCapabilityFactAuthorities',
          recordCount,
          canonicalValueBytes
        ),
    }),
  ],
  [
    'capabilitySpecificReceipts',
    Object.freeze({
      budget: AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET,
      admits: isAgentEvaluationCapabilitySpecificArchiveBudget,
    }),
  ],
  [
    'attemptAuthorityOwnerReceipts',
    Object.freeze({
      budget: AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET,
      admits: isAgentEvaluationAttemptAuthorityOwnerArchiveBudget,
    }),
  ],
  [
    'providerCapabilityObservationReceipts',
    Object.freeze({
      budget: AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET,
      admits: isAgentEvaluationProviderCapabilityObservationArchiveBudget,
    }),
  ],
]);

/** Applies frozen family capacity only after raw family commitments verify. */
export const assertG4ModelEvaluationEvidenceFamilyBudget = ({
  family,
  recordCount,
  canonicalValueBytes,
}) => {
  const admission = archiveBudgetAdmissionByFamily.get(family);
  if (!admission) return;
  if (
    recordCount > admission.budget.maximumRecordCount ||
    canonicalValueBytes > admission.budget.maximumCanonicalFamilyBytes ||
    !admission.admits(recordCount, canonicalValueBytes)
  ) {
    fail(
      `Real-model evidence family ${family} exceeds its frozen denominator budget.`
    );
  }
};

export const assertG4ModelEvaluationEvidencePhysicalArchiveBudget = ({
  familyUsages,
  indexBytes,
  rootBytes,
}) => {
  try {
    return createAgentModelEvaluationEvidenceArchivePhysicalBudget({
      familyUsages,
      indexBytes,
      rootBytes,
    });
  } catch (caught) {
    fail(
      `Real-model evidence physical archive exceeds its exact 8 GiB NDJSON, index, and root budget: ${caught instanceof Error ? caught.message : 'unknown capacity failure'}.`
    );
  }
};

const requiredPath = (name) => {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required for real-model evidence.`);
  return resolve(value);
};

const requiredText = (name) => {
  const value = process.env[name]?.trim();
  if (!value || value.length > 2_048) {
    fail(`${name} is required and must be bounded.`);
  }
  return value;
};

const parseExpectedAttestationIdentity = () => {
  const workflowRunAttemptText = requiredText(
    'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ATTEMPT'
  );
  if (!/^[1-9][0-9]*$/u.test(workflowRunAttemptText)) {
    fail(
      'PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ATTEMPT must be a positive canonical integer.'
    );
  }
  const workflowRunAttempt = Number(workflowRunAttemptText);
  const environmentDigest = requiredText(
    'PRODIVIX_G4_MODEL_EVAL_ENVIRONMENT_DIGEST'
  );
  if (
    !Number.isSafeInteger(workflowRunAttempt) ||
    !digestPattern.test(environmentDigest)
  ) {
    fail('External attestation identity is malformed.');
  }
  return Object.freeze({
    authorityId: requiredText(
      'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_AUTHORITY_ID'
    ),
    keyId: requiredText('PRODIVIX_G4_MODEL_EVAL_ATTESTATION_KEY_ID'),
    workflowName: requiredText('PRODIVIX_G4_MODEL_EVAL_WORKFLOW_NAME'),
    workflowRunId: requiredText('PRODIVIX_G4_MODEL_EVAL_WORKFLOW_RUN_ID'),
    workflowRunAttempt,
    jobId: requiredText('PRODIVIX_G4_MODEL_EVAL_JOB_ID'),
    environmentDigest,
  });
};

const parseCanonicalStringArray = (name) => {
  const raw = process.env[name]?.trim();
  if (!raw) fail(`${name} is required.`);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail(`${name} must be valid JSON.`);
  }
  const encodedBytes = Array.isArray(value)
    ? value.reduce(
        (total, entry) =>
          total +
          (typeof entry === 'string'
            ? Buffer.byteLength(entry, 'utf8')
            : maximumCanaryBytes + 1),
        0
      )
    : maximumCanaryBytes + 1;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > maximumCanaryCount ||
    encodedBytes > maximumCanaryBytes ||
    value.some(
      (entry) =>
        typeof entry !== 'string' ||
        entry.length < 8 ||
        entry.length > 16_384 ||
        entry !== entry.trim()
    ) ||
    new Set(value).size !== value.length
  ) {
    fail(`${name} must be a non-empty unique JSON string array.`);
  }
  return Object.freeze([...value]);
};

const canarySignatures = (canaries) => {
  const signatures = new Set();
  for (const canary of canaries) {
    const bytes = Buffer.from(canary, 'utf8');
    const base64 = bytes.toString('base64');
    signatures.add(canary);
    try {
      signatures.add(encodeURIComponent(canary));
    } catch {
      // The fully percent-encoded UTF-8 signature remains deterministic.
    }
    signatures.add(
      [...bytes]
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
        .join('')
    );
    signatures.add(bytes.toString('hex'));
    signatures.add(bytes.toString('hex').toUpperCase());
    signatures.add(base64);
    signatures.add(
      base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
    );
  }
  return signatures;
};

const assertRawArtifactHasNoCanary = (text, signatures, label) => {
  for (const signature of signatures) {
    if (signature && text.includes(signature)) {
      fail(`${label} contains a protected canary signature.`);
    }
  }
};

const sameFileIdentity = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

const assertStableDirectory = async (path, label) => {
  const first = await lstat(path, { bigint: true });
  if (first.isSymbolicLink() || !first.isDirectory()) {
    fail(`${label} must be a regular non-symbolic-link directory.`);
  }
  const second = await lstat(path, { bigint: true });
  if (!sameFileIdentity(first, second)) fail(`${label} is unstable.`);
};

const readStableRegularFile = async (path, maximumBytes, label) => {
  const pathBefore = await lstat(path, { bigint: true });
  if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
    fail(`${label} must be a regular non-symbolic-link file.`);
  }
  const handle = await open(path, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    const pathAfterOpen = await lstat(path, { bigint: true });
    if (
      !before.isFile() ||
      pathAfterOpen.isSymbolicLink() ||
      !pathAfterOpen.isFile() ||
      !sameFileIdentity(before, pathAfterOpen) ||
      before.size < 1n ||
      before.size > BigInt(maximumBytes)
    ) {
      fail(`${label} is empty, oversized, unstable, or not regular.`);
    }
    const size = Number(before.size);
    const bytes = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        Math.min(1024 * 1024, size - offset),
        offset
      );
      if (bytesRead === 0) fail(`${label} changed while it was being read.`);
      offset += bytesRead;
    }
    const trailing = Buffer.allocUnsafe(1);
    const { bytesRead: trailingBytes } = await handle.read(
      trailing,
      0,
      1,
      size
    );
    const after = await handle.stat({ bigint: true });
    const pathAfterRead = await lstat(path, { bigint: true });
    if (
      trailingBytes !== 0 ||
      pathAfterRead.isSymbolicLink() ||
      !sameFileIdentity(before, after) ||
      !sameFileIdentity(after, pathAfterRead)
    ) {
      fail(`${label} changed while it was being read.`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
};

const decodeUtf8 = (bytes, label) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail(`${label} must contain valid UTF-8.`);
  }
};

const parseTrustedPublicKeys = () => {
  const raw = process.env.PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS?.trim();
  if (!raw) {
    fail(
      'PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS is required; evidence cannot establish its own trust root.'
    );
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    fail('PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS must be valid JSON.');
  }
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 32 ||
    value.some(
      (entry) =>
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).sort(compareUnicodeCodePoints).join('\0') !==
          ['keyId', 'publicKeyBase64Url']
            .sort(compareUnicodeCodePoints)
            .join('\0') ||
        typeof entry.keyId !== 'string' ||
        typeof entry.publicKeyBase64Url !== 'string'
    ) ||
    new Set(value.map(({ keyId }) => keyId)).size !== value.length
  ) {
    fail(
      'PRODIVIX_G4_MODEL_EVAL_TRUSTED_PUBLIC_KEYS must be a unique bounded key registry.'
    );
  }
  return Object.freeze(value.map((entry) => Object.freeze({ ...entry })));
};

const verifyEd25519 = ({ publicKeyBase64Url, signatureBase64Url, message }) => {
  const rawPublicKey = Buffer.from(publicKeyBase64Url, 'base64url');
  const signature = Buffer.from(signatureBase64Url, 'base64url');
  if (
    rawPublicKey.byteLength !== 32 ||
    signature.byteLength !== 64 ||
    rawPublicKey.toString('base64url') !== publicKeyBase64Url ||
    signature.toString('base64url') !== signatureBase64Url
  ) {
    return false;
  }
  const key = createPublicKey({
    key: Buffer.concat([rawEd25519SpkiPrefix, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, Buffer.from(message), key, signature);
};

const authorityPayloadFromAttestation = (attestation) => {
  const {
    algorithm: _algorithm,
    attestedPayloadDigest: _attestedPayloadDigest,
    signature: _signature,
    attestationDigest: _attestationDigest,
    ...payload
  } = attestation;
  return payload;
};

const verifyAuthorityAttestation = (
  attestation,
  trustedPublicKeys,
  expectedIdentity
) => {
  if (!isAgentModelEvaluationAuthorityAttestation(attestation)) return false;
  const trustedKey = trustedPublicKeys.find(
    ({ keyId }) => keyId === attestation.keyId
  );
  if (!trustedKey) return false;
  const payload = authorityPayloadFromAttestation(attestation);
  if (
    digestAgentCanonicalValue(payload) !== attestation.attestedPayloadDigest ||
    Object.entries(expectedIdentity).some(
      ([key, expected]) => attestation[key] !== expected
    )
  ) {
    return false;
  }
  return verifyEd25519({
    publicKeyBase64Url: trustedKey.publicKeyBase64Url,
    signatureBase64Url: attestation.signature,
    message: Buffer.from(canonicalJsonText(payload), 'utf8'),
  });
};

const recordGuardByFamily = Object.freeze({
  capabilityProbeAdmissions:
    isAgentEvaluationCapabilityProbeAdmissionArchiveRecord,
  capabilityProbeProviderResourceCleanups:
    isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  capabilityProbeReferenceReceipts:
    isAgentEvaluationCapabilityProbeReferenceArchiveRecord,
  runtimeFactSourceOwnerRegistrations:
    isAgentEvaluationRuntimeFactSourceRegistrationArchiveRecord,
  hostedRetrievalRuntimeResourceLifecycleJournals:
    isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  hostedRetrievalRuntimeResourceCleanups:
    isAgentHostedRetrievalRuntimeResourceCleanupArchiveRecord,
  capabilityEffectProviderRuntimeJournals:
    isAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
  optionalCapabilityFactSources:
    isAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
  optionalCapabilityFactAuthorities:
    isAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord,
  endpointSmokeDispatchIntents: isAgentEvaluationEndpointSmokeDispatchIntent,
  endpointSmokeTransportReceipts: isAgentEvaluationTransportReceipt,
  endpointSmokeResultSpoolReceipts:
    isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  endpointSmokeResultSpoolDispositionReceipts:
    isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  endpointSmokeValidationFailureReceipts:
    isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  endpointSmokeReceipts: isAgentEvaluationEndpointSmokeReceipt,
  preDispatchFailureReceipts: isAgentEvaluationPreDispatchFailureReceipt,
  transportDispatchIntents: isAgentEvaluationTransportDispatchIntent,
  transportReceipts: isAgentEvaluationTransportReceipt,
  providerResultSpoolReceipts: isAgentEvaluationProviderResultSpoolReceipt,
  providerResultSpoolDispositionReceipts:
    isAgentEvaluationProviderResultSpoolDispositionReceipt,
  invocationTurnReceipts: isAgentEvaluationInvocationTurnReceipt,
  invocationTurnSetReceipts: isAgentEvaluationInvocationTurnSetReceipt,
  resultSubmissionReceipts: isAgentEvaluationResultSubmissionReceipt,
  attemptAuthorityOwnerReceipts: isAgentEvaluationAttemptAuthorityOwnerReceipt,
  verificationAttemptGrantReceipts:
    isAgentEvaluationVerificationAttemptGrantReceipt,
  controlledRuntimeReceipts: isAgentEvaluationControlledRuntimeReceipt,
  capabilityExecutionReceipts: isAgentEvaluationCapabilityExecutionReceipt,
  capabilitySpecificReceipts: isAgentEvaluationCapabilitySpecificReceipt,
  providerCapabilityObservationReceipts:
    isAgentEvaluationProviderCapabilityObservationReceipt,
  validatedHumanReviewArtifacts: isAgentEvaluationValidatedHumanReviewArtifact,
  validatedHumanMetricObservations:
    isAgentEvaluationValidatedHumanMetricObservation,
  reviewRasterScanReceipts: isAgentEvaluationReviewRasterScanReceipt,
  reviewCandidateRefs: isAgentEvaluationReviewCandidateEvidenceRef,
  blindReviewMappingRefs: isAgentEvaluationBlindReviewMappingRef,
  sourceReceipts: isAgentEvaluationSourceReceipt,
  executionReceipts: isAgentEvaluationExecutionReceipt,
  attempts: isAgentModelEvaluationAttempt,
  checkpoints: isAgentEvaluationShardCheckpoint,
  budgetLedger: isAgentBudgetLedgerState,
  metricReport: isAgentEvaluationMetricReport,
  graderReport: isAgentEvaluationGraderReport,
  humanReviewReport: isAgentHumanReviewReport,
  holdoutExecutionReceipt: isAgentHoldoutExecutionReceipt,
  authorityAttestation: isAgentModelEvaluationAuthorityAttestation,
  manifest: isAgentModelEvaluationManifest,
});

const singletonFamilies = new Set([
  'plan',
  'budgetLedger',
  'metricReport',
  'graderReport',
  'humanReviewReport',
  'holdoutExecutionReceipt',
  'authorityAttestation',
  'manifest',
]);

const createSemanticState = (
  index,
  humanReviewVerifier,
  resolveFrozenRunConfig,
  observationSanitization
) => ({
  index,
  humanReviewVerifier,
  resolveFrozenRunConfig,
  observationSanitization,
  frozenRunConfig: undefined,
  singletons: Object.create(null),
  expectedDescriptors: undefined,
  expectedCases: undefined,
  capabilityProbeAdmissions: new Map(),
  capabilityProbeProviderResourceCleanups: new Map(),
  capabilityProbeReferences: new Map(),
  runtimeFactSourceRegistrations: new Map(),
  hostedRetrievalRuntimeResourceLifecycleJournals: new Map(),
  hostedRetrievalRuntimeResourceCleanups: new Map(),
  capabilityEffectProviderRuntimeJournals: new Map(),
  optionalCapabilityFactSources: new Map(),
  optionalCapabilityFactAuthorities: new Map(),
  consumedOptionalCapabilityFacts: new Set(),
  attemptIds: new Set(),
  attempts: new Map(),
  reviewedAttempts: new Map(),
  reviewCandidateAttemptIds: new Set(),
  executionAttemptIds: new Set(),
  executionMeasurements: new Map(),
  invocationTurns: new Map(),
  invocationTurnBindings: new Map(),
  invocationTurnSetAttemptIds: new Set(),
  invocationTurnSets: new Map(),
  preDispatchAttemptIds: new Set(),
  resultSubmissions: new Map(),
  controlledRuntimes: new Map(),
  capabilityOwners: new Map(),
  ownerReceiptDigests: new Set(),
  ownerRequestDigests: new Set(),
  verificationGrants: new Map(),
  capabilityExecutions: new Map(),
  capabilitySpecifics: new Map(),
  providerCapabilityObservations: new Map(),
  providerCapabilityObservationIds: new Set(),
  providerCapabilityObservationTurns: new Set(),
  attemptDispatchIntents: new Map(),
  attemptTransports: new Map(),
  attemptSpools: new Map(),
  checkpoints: new Map(),
  globalReceiptIdentities: new Map(),
  endpointSmokeIntents: [],
  endpointSmokeTransports: [],
  endpointSmokeSpools: [],
  endpointSmokeDispositions: [],
  endpointSmokeValidationFailures: [],
  endpointSmokeReceipts: [],
  endpointSmokeTransportIdentities: new Set(),
  attemptTransportIdentities: new Set(),
  pricingSnapshotDigests: new Set(),
  pricingSnapshotReceiptCounts: new Map(),
  referencedPricingSnapshotDigests: new Set(),
  validatedHumanReviewArtifacts: [],
  validatedHumanReviewArtifact: undefined,
  validatedHumanMetricObservations: [],
});

const expectedDescriptorFor = (state, attemptId) =>
  state.expectedDescriptors?.get(attemptId);

const pushBoundedAttemptValue = (
  valuesByAttempt,
  attemptId,
  value,
  maximum,
  label
) => {
  const values = valuesByAttempt.get(attemptId) ?? [];
  if (values.length >= maximum) {
    fail(`${label} exceeds its canonical per-attempt cardinality.`);
  }
  values.push(value);
  valuesByAttempt.set(attemptId, values);
};

const setUniqueAttemptValue = (valuesByAttempt, attemptId, value, label) => {
  if (valuesByAttempt.has(attemptId)) {
    fail(`${label} identity is duplicated.`);
  }
  valuesByAttempt.set(attemptId, value);
};

const globalReceiptIdentityFor = (family, value) => {
  switch (family) {
    case 'endpointSmokeTransportReceipts':
    case 'endpointSmokeValidationFailureReceipts':
    case 'endpointSmokeReceipts':
    case 'transportReceipts':
    case 'capabilitySpecificReceipts':
      return value.receiptId;
    case 'providerCapabilityObservationReceipts':
      return value.observationReceiptId;
    case 'preDispatchFailureReceipts':
      return value.failureReceiptId;
    case 'capabilityExecutionReceipts':
      return value.capabilityExecutionReceiptId;
    case 'reviewRasterScanReceipts':
      return value.scanReceiptId;
    case 'sourceReceipts':
      return value.sourceReceiptId;
    case 'executionReceipts':
      return value.executionReceiptId;
    case 'holdoutExecutionReceipt':
      return value.receiptId;
    default:
      return undefined;
  }
};

const recordGlobalReceiptIdentity = (state, family, value) => {
  const identity = globalReceiptIdentityFor(family, value);
  if (identity === undefined) return;
  const prior = state.globalReceiptIdentities.get(identity);
  if (prior !== undefined) {
    fail(`Evidence archive ${family} receipt identity collides with ${prior}.`);
  }
  state.globalReceiptIdentities.set(identity, family);
};

const compactCapabilityOwnerFact = (receipt) => {
  const { authority } = receipt;
  if (
    authority.authorityKind !== 'terminal-normalization' &&
    authority.authorityKind !== 'recovery-authority' &&
    authority.authorityKind !== 'capability-denial'
  ) {
    return undefined;
  }
  return Object.freeze({ ...authority.fact });
};

const compactCapabilitySpecific = (receipt, ownerReceiptDigest) => {
  const providerObservationProjection =
    receipt.providerCapabilityObservationReceiptDigest === undefined
      ? undefined
      : createAgentEvaluationCapabilitySpecificProviderObservationProjection(
          receipt
        );
  return Object.freeze({
    receiptId: receipt.receiptId,
    receiptKind: receipt.receiptKind,
    receiptDigest: receipt.receiptDigest,
    planDigest: receipt.planDigest,
    repositoryCommit: receipt.repositoryCommit,
    attemptId: receipt.attemptId,
    descriptorDigest: receipt.descriptorDigest,
    caseId: receipt.caseId,
    materialDigest: receipt.materialDigest,
    capabilityDescriptorDigest: receipt.capabilityDescriptorDigest,
    turnIndex: receipt.turnIndex,
    invocationId: receipt.invocationId,
    ...(receipt.toolId ? { toolId: receipt.toolId } : {}),
    ...(receipt.toolCallId ? { toolCallId: receipt.toolCallId } : {}),
    ...(receipt.providerToolCallId
      ? { providerToolCallId: receipt.providerToolCallId }
      : {}),
    requestDigest: receipt.requestDigest,
    resultDigest: receipt.resultDigest,
    startedAt: receipt.startedAt,
    completedAt: receipt.completedAt,
    authorityKind: receipt.authority.authorityKind,
    authorityFactDigest: receipt.authority.factDigest,
    ...(providerObservationProjection ? { providerObservationProjection } : {}),
    ...(receipt.authority.authorityKind === 'terminal-normalization' &&
    receipt.authority.fact.authorityKind === 'terminal-normalization'
      ? { terminalEventDigest: receipt.authority.fact.terminalEventDigest }
      : {}),
    ...(ownerReceiptDigest ? { ownerReceiptDigest } : {}),
    ownerFact: compactCapabilityOwnerFact(receipt),
  });
};

const compactProviderCapabilityObservation = (receipt) =>
  createAgentEvaluationProviderCapabilityObservationProjection(receipt);

const optionalCapabilityFactIdentity = (attemptId, turnIndex) =>
  `${attemptId}\u0000${turnIndex}`;

const assertEffectOptionalCapabilityFactAuthorityBinding = (
  state,
  sourceRecord,
  authorityRecord
) => {
  const receipt = sourceRecord.sourceReceipt;
  const descriptor = expectedDescriptorFor(state, sourceRecord.attemptId);
  const target = descriptor
    ? state.singletons.plan.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === descriptor.targetId
      )
    : undefined;
  const runtimeAuthority =
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  const provider = target
    ? state.singletons.plan.providerConfigurations.find(
        ({ providerConfigurationId }) =>
          providerConfigurationId === target.providerConfigurationId
      )
    : undefined;
  const concreteCase = descriptor
    ? state.expectedCases.get(descriptor.caseId)
    : undefined;
  let resolvedCapabilityDescriptor;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
  }
  const turn = state.invocationTurnBindings.get(
    optionalCapabilityFactIdentity(
      sourceRecord.attemptId,
      sourceRecord.turnIndex
    ) + `\u0000${receipt.invocationId}`
  );
  const dispatchIntent = state.attemptDispatchIntents.get(
    receipt.dispatchIntentDigest
  );
  const registration = runtimeAuthority
    ? state.runtimeFactSourceRegistrations.get(
        runtimeAuthority.registrationReceiptDigest
      )
    : undefined;
  const sharedOwners = (
    state.capabilityOwners.get(sourceRecord.attemptId) ?? []
  ).filter(
    ({ operation, responseProjection }) =>
      operation === 'execute-tool' &&
      responseProjection.executionAuthorityKind === 'shared-effect' &&
      responseProjection.preEffectIntentDigest ===
        sourceRecord.preEffectIntent.intentDigest &&
      responseProjection.effectSourceReceiptDigest ===
        sourceRecord.effectSourceReceipt.receiptDigest
  );
  const sharedOwner = sharedOwners[0];
  const sharedProjection = sharedOwner?.responseProjection;
  const preEffectIntent = sourceRecord.preEffectIntent;
  const inputAuthorityBinding = preEffectIntent.inputAuthorityBinding;
  const sourceTurn = state.invocationTurnBindings.get(
    `${inputAuthorityBinding.sourceAttemptId}\u0000${inputAuthorityBinding.sourceTurnIndex}\u0000${inputAuthorityBinding.sourceInvocationId}`
  );
  const sourceDispatchIntent = state.attemptDispatchIntents.get(
    inputAuthorityBinding.sourceDispatchIntentDigest
  );
  const sourceTransport = state.attemptTransports.get(
    inputAuthorityBinding.sourceTransportReceiptDigest
  );
  const sourceSpool = state.attemptSpools.get(
    inputAuthorityBinding.sourceResultSpoolReceiptDigest
  );
  let inputAuthorityRegistryReceipt;
  let recreatedInputAuthorityBinding;
  try {
    const {
      format: _format,
      version: _version,
      sourceRegistryReceiptDigest: _sourceRegistryReceiptDigest,
      bindingDigest: _bindingDigest,
      ...registryInput
    } = inputAuthorityBinding;
    inputAuthorityRegistryReceipt =
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(
        registryInput
      );
    recreatedInputAuthorityBinding =
      createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
        inputAuthorityRegistryReceipt
      );
  } catch {
    fail(
      'Evidence archive optional-capability input authority registry failed canonical reconstruction.'
    );
  }
  const materialDigest =
    state.controlledRuntimes.get(sourceRecord.attemptId)?.materialDigest ??
    state.resultSubmissions.get(sourceRecord.attemptId)?.materialDigest;
  if (
    !descriptor ||
    !target ||
    !runtimeAuthority ||
    !provider ||
    !resolvedCapabilityDescriptor ||
    !turn ||
    !dispatchIntent ||
    !sourceTurn ||
    !sourceDispatchIntent ||
    !sourceTransport ||
    !sourceSpool ||
    !registration ||
    sharedOwners.length !== 1 ||
    !sharedOwner ||
    !sharedProjection ||
    receipt.planDigest !== state.index.planDigest ||
    receipt.repositoryCommit !== state.index.repositoryCommit ||
    receipt.descriptorDigest !== descriptor.descriptorDigest ||
    receipt.targetId !== target.targetId ||
    receipt.targetDigest !== target.targetDigest ||
    receipt.capabilityProfileId !== target.capabilityProfileId ||
    receipt.capabilityProfileDigest !== target.capabilityProfileDigest ||
    receipt.capabilityDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest ||
    receipt.capabilityId !==
      target.optionalCapabilitySupportAuthority.capabilityId ||
    receipt.supportExpectation !==
      target.optionalCapabilitySupportAuthority.supportExpectation ||
    receipt.turnIndex !== sourceRecord.turnIndex ||
    receipt.protocolFamily !== target.protocolFamily ||
    receipt.protocolFamily !== provider.adapter.protocolFamily ||
    receipt.providerConfigurationId !== target.providerConfigurationId ||
    receipt.modelId !== target.modelId ||
    receipt.modelLineageDigest !== target.modelLineageDigest ||
    receipt.adapterDigest !== provider.adapter.adapterDigest ||
    receipt.providerRequestDigest !== turn.requestArtifactDigest ||
    receipt.responseDigest !== turn.responseArtifactDigest ||
    receipt.dispatchIntentDigest !== dispatchIntent.intentDigest ||
    receipt.targetAuthorityDigest !== runtimeAuthority.authorityDigest ||
    receipt.sourceAuthorityId !== runtimeAuthority.sourceAuthorityId ||
    receipt.sourceAuthorityImplementationDigest !==
      runtimeAuthority.sourceAuthorityImplementationDigest ||
    receipt.sourceAuthorityRouteBinding !== runtimeAuthority.routeBinding ||
    receipt.registrationAuthorityIssuerId !==
      runtimeAuthority.registrationAuthorityIssuerId ||
    receipt.registrationReceiptDigest !==
      runtimeAuthority.registrationReceiptDigest ||
    receipt.sourceKind !== runtimeAuthority.sourceKind ||
    sourceRecord.preEffectIntent.planDigest !== state.index.planDigest ||
    sourceRecord.preEffectIntent.repositoryCommit !==
      state.index.repositoryCommit ||
    sourceRecord.preEffectIntent.attemptId !== descriptor.attemptId ||
    sourceRecord.preEffectIntent.descriptorDigest !==
      descriptor.descriptorDigest ||
    sourceRecord.preEffectIntent.caseId !== descriptor.caseId ||
    sourceRecord.preEffectIntent.materialDigest !== materialDigest ||
    sourceRecord.preEffectIntent.turnIndex !== receipt.turnIndex ||
    sourceRecord.preEffectIntent.invocationId !== receipt.invocationId ||
    sourceRecord.preEffectIntent.providerRequestDigest !==
      receipt.providerRequestDigest ||
    inputAuthorityRegistryReceipt.receiptDigest !==
      inputAuthorityBinding.sourceRegistryReceiptDigest ||
    !sameCanonicalJson(recreatedInputAuthorityBinding, inputAuthorityBinding) ||
    inputAuthorityBinding.sourceAttemptId !== descriptor.attemptId ||
    inputAuthorityBinding.sourceProviderRequestDigest !==
      sourceTurn.requestArtifactDigest ||
    inputAuthorityBinding.sourceResponseDigest !==
      sourceTurn.responseArtifactDigest ||
    inputAuthorityBinding.sourceDispatchIntentDigest !==
      sourceTurn.dispatchIntentDigest ||
    inputAuthorityBinding.sourceTransportReceiptDigest !==
      sourceTurn.transportReceiptDigest ||
    inputAuthorityBinding.sourceResultSpoolReceiptDigest !==
      sourceTurn.providerResultSpoolReceiptDigest ||
    inputAuthorityBinding.sourceNormalizedEventSetDigest !==
      sourceSpool.normalizedEventSetDigest ||
    sourceDispatchIntent.attemptId !== descriptor.attemptId ||
    sourceDispatchIntent.turnIndex !== inputAuthorityBinding.sourceTurnIndex ||
    sourceDispatchIntent.invocationId !==
      inputAuthorityBinding.sourceInvocationId ||
    sourceDispatchIntent.requestDigest !==
      inputAuthorityBinding.sourceProviderRequestDigest ||
    sourceTransport.dispatchIntentDigest !==
      sourceDispatchIntent.intentDigest ||
    sourceTransport.requestDigest !==
      inputAuthorityBinding.sourceProviderRequestDigest ||
    sourceTransport.invocationId !== inputAuthorityBinding.sourceInvocationId ||
    sourceSpool.attemptId !== descriptor.attemptId ||
    sourceSpool.turnIndex !== inputAuthorityBinding.sourceTurnIndex ||
    sourceSpool.invocationId !== inputAuthorityBinding.sourceInvocationId ||
    sourceSpool.dispatchIntentDigest !== sourceDispatchIntent.intentDigest ||
    sourceSpool.transportReceiptDigest !== sourceTransport.receiptDigest ||
    sourceSpool.responseDigest !== inputAuthorityBinding.sourceResponseDigest ||
    inputAuthorityBinding.protocolFamily !== target.protocolFamily ||
    inputAuthorityBinding.providerConfigurationId !==
      target.providerConfigurationId ||
    inputAuthorityBinding.modelLineageDigest !== target.modelLineageDigest ||
    inputAuthorityBinding.adapterDigest !== provider.adapter.adapterDigest ||
    inputAuthorityBinding.requestRefAuthority
      .runtimeFactSourceAuthorityDigest !== runtimeAuthority.authorityDigest ||
    inputAuthorityBinding.requestRefAuthority.registrationReceiptDigest !==
      runtimeAuthority.registrationReceiptDigest ||
    sourceRecord.effectSourceReceipt.intentDigest !==
      preEffectIntent.intentDigest ||
    sourceRecord.effectSourceReceipt.ownerRequestId !==
      preEffectIntent.ownerRequestId ||
    sourceRecord.effectSourceReceipt.ownerRequestDigest !==
      preEffectIntent.ownerRequestDigest ||
    sourceRecord.effectSourceReceipt.registrationReceiptDigest !==
      runtimeAuthority.registrationReceiptDigest ||
    !sameCanonicalJson(
      sourceRecord.effectSourceReceipt.runtimeFactSourceAuthority,
      runtimeAuthority
    ) ||
    sourceRecord.effectSourceReceipt.effectStatus !==
      (receipt.outcome === 'observed' ? 'produced' : receipt.outcome) ||
    sourceRecord.effectSourceReceipt.businessResultDigest !==
      receipt.businessResultDigest ||
    sourceRecord.effectSourceReceipt.sourceFactKind !==
      (receipt.fact?.factKind ?? null) ||
    sourceRecord.effectSourceReceipt.sourceFactDigest !==
      (receipt.fact?.factDigest ?? null) ||
    sourceRecord.effectSourceReceipt.stageDigest !== receipt.ownerStageDigest ||
    sourceRecord.effectSourceReceipt.dispatchAckDigest !==
      receipt.ownerDispatchAckDigest ||
    sourceRecord.effectSourceReceipt.transportReceiptDigest !==
      receipt.transportReceiptDigest ||
    sourceRecord.effectSourceReceipt.resultSpoolReceiptDigest !==
      receipt.resultSpoolReceiptDigest ||
    sourceRecord.effectSourceReceipt.normalizedEventSetDigest !==
      receipt.normalizedEventSetDigest ||
    !sameCanonicalJson(sourceRecord.effectSourceFact, receipt.fact) ||
    sharedOwner.requestDigest !== receipt.ownerRequestDigest ||
    sharedOwner.receiptDigest !== receipt.ownerReceiptDigest ||
    sharedProjection.invocationId !== receipt.invocationId ||
    sharedProjection.turnIndex !== receipt.turnIndex ||
    sharedProjection.toolId !== sourceRecord.preEffectIntent.toolId ||
    sharedProjection.toolCallId !== sourceRecord.preEffectIntent.toolCallId ||
    sharedProjection.providerToolCallId !==
      sourceRecord.preEffectIntent.providerToolCallId ||
    sharedProjection.providerRequestDigest !== receipt.providerRequestDigest ||
    sharedProjection.resultDigest !== receipt.businessResultDigest ||
    sharedProjection.effectSourceFactDigest !==
      receipt.effectSourceFactDigest ||
    sharedProjection.specificReceiptDigests.length !== 0
  ) {
    const failedRawBindings = [
      [
        'prerequisites',
        [
          descriptor,
          target,
          runtimeAuthority,
          provider,
          resolvedCapabilityDescriptor,
          turn,
          dispatchIntent,
          sourceTurn,
          sourceDispatchIntent,
          sourceTransport,
          sourceSpool,
          registration,
          sharedOwner,
          sharedProjection,
        ].every((value) => value !== undefined) && sharedOwners.length === 1,
      ],
      [
        'outer-turn',
        receipt.providerRequestDigest === turn?.requestArtifactDigest &&
          receipt.responseDigest === turn?.responseArtifactDigest &&
          receipt.dispatchIntentDigest === dispatchIntent?.intentDigest,
      ],
      [
        'pre-effect',
        preEffectIntent.planDigest === state.index.planDigest &&
          preEffectIntent.repositoryCommit === state.index.repositoryCommit &&
          preEffectIntent.attemptId === descriptor?.attemptId &&
          preEffectIntent.descriptorDigest === descriptor?.descriptorDigest &&
          preEffectIntent.caseId === descriptor?.caseId &&
          preEffectIntent.materialDigest === materialDigest &&
          preEffectIntent.turnIndex === receipt.turnIndex &&
          preEffectIntent.invocationId === receipt.invocationId &&
          preEffectIntent.providerRequestDigest ===
            receipt.providerRequestDigest,
      ],
      [
        'input-registry',
        inputAuthorityRegistryReceipt?.receiptDigest ===
          inputAuthorityBinding.sourceRegistryReceiptDigest &&
          sameCanonicalJson(
            recreatedInputAuthorityBinding,
            inputAuthorityBinding
          ),
      ],
      [
        'source-turn',
        inputAuthorityBinding.sourceAttemptId === descriptor?.attemptId &&
          inputAuthorityBinding.sourceProviderRequestDigest ===
            sourceTurn?.requestArtifactDigest &&
          inputAuthorityBinding.sourceResponseDigest ===
            sourceTurn?.responseArtifactDigest &&
          inputAuthorityBinding.sourceDispatchIntentDigest ===
            sourceTurn?.dispatchIntentDigest &&
          inputAuthorityBinding.sourceTransportReceiptDigest ===
            sourceTurn?.transportReceiptDigest &&
          inputAuthorityBinding.sourceResultSpoolReceiptDigest ===
            sourceTurn?.providerResultSpoolReceiptDigest &&
          inputAuthorityBinding.sourceNormalizedEventSetDigest ===
            sourceSpool?.normalizedEventSetDigest,
      ],
      [
        'source-dispatch',
        sourceDispatchIntent?.attemptId === descriptor?.attemptId &&
          sourceDispatchIntent?.turnIndex ===
            inputAuthorityBinding.sourceTurnIndex &&
          sourceDispatchIntent?.invocationId ===
            inputAuthorityBinding.sourceInvocationId &&
          sourceDispatchIntent?.requestDigest ===
            inputAuthorityBinding.sourceProviderRequestDigest,
      ],
      [
        'source-transport',
        sourceTransport?.dispatchIntentDigest ===
          sourceDispatchIntent?.intentDigest &&
          sourceTransport?.requestDigest ===
            inputAuthorityBinding.sourceProviderRequestDigest &&
          sourceTransport?.invocationId ===
            inputAuthorityBinding.sourceInvocationId,
      ],
      [
        'source-spool',
        sourceSpool?.attemptId === descriptor?.attemptId &&
          sourceSpool?.turnIndex === inputAuthorityBinding.sourceTurnIndex &&
          sourceSpool?.invocationId ===
            inputAuthorityBinding.sourceInvocationId &&
          sourceSpool?.dispatchIntentDigest ===
            sourceDispatchIntent?.intentDigest &&
          sourceSpool?.transportReceiptDigest ===
            sourceTransport?.receiptDigest &&
          sourceSpool?.responseDigest ===
            inputAuthorityBinding.sourceResponseDigest,
      ],
      [
        'source-identity',
        inputAuthorityBinding.protocolFamily === target?.protocolFamily &&
          inputAuthorityBinding.providerConfigurationId ===
            target?.providerConfigurationId &&
          inputAuthorityBinding.modelLineageDigest ===
            target?.modelLineageDigest &&
          inputAuthorityBinding.adapterDigest ===
            provider?.adapter.adapterDigest,
      ],
      [
        'request-ref-authority',
        inputAuthorityBinding.requestRefAuthority
          .runtimeFactSourceAuthorityDigest ===
          runtimeAuthority?.authorityDigest &&
          inputAuthorityBinding.requestRefAuthority
            .registrationReceiptDigest ===
            runtimeAuthority?.registrationReceiptDigest,
      ],
      [
        'effect-intent',
        sourceRecord.effectSourceReceipt.intentDigest ===
          preEffectIntent.intentDigest &&
          sourceRecord.effectSourceReceipt.ownerRequestId ===
            preEffectIntent.ownerRequestId &&
          sourceRecord.effectSourceReceipt.ownerRequestDigest ===
            preEffectIntent.ownerRequestDigest,
      ],
      [
        'effect-authority',
        sourceRecord.effectSourceReceipt.registrationReceiptDigest ===
          runtimeAuthority?.registrationReceiptDigest &&
          sameCanonicalJson(
            sourceRecord.effectSourceReceipt.runtimeFactSourceAuthority,
            runtimeAuthority
          ),
      ],
      [
        'effect-result',
        sourceRecord.effectSourceReceipt.effectStatus ===
          (receipt.outcome === 'observed' ? 'produced' : receipt.outcome) &&
          sourceRecord.effectSourceReceipt.businessResultDigest ===
            receipt.businessResultDigest &&
          sourceRecord.effectSourceReceipt.sourceFactKind ===
            (receipt.fact?.factKind ?? null) &&
          sourceRecord.effectSourceReceipt.sourceFactDigest ===
            (receipt.fact?.factDigest ?? null) &&
          sameCanonicalJson(sourceRecord.effectSourceFact, receipt.fact),
      ],
      [
        'effect-leaves',
        sourceRecord.effectSourceReceipt.stageDigest ===
          receipt.ownerStageDigest &&
          sourceRecord.effectSourceReceipt.dispatchAckDigest ===
            receipt.ownerDispatchAckDigest &&
          sourceRecord.effectSourceReceipt.transportReceiptDigest ===
            receipt.transportReceiptDigest &&
          sourceRecord.effectSourceReceipt.resultSpoolReceiptDigest ===
            receipt.resultSpoolReceiptDigest &&
          sourceRecord.effectSourceReceipt.normalizedEventSetDigest ===
            receipt.normalizedEventSetDigest,
      ],
      [
        'shared-owner',
        sharedOwner?.requestDigest === receipt.ownerRequestDigest &&
          sharedOwner?.receiptDigest === receipt.ownerReceiptDigest &&
          sharedProjection?.invocationId === receipt.invocationId &&
          sharedProjection?.turnIndex === receipt.turnIndex &&
          sharedProjection?.toolId === preEffectIntent.toolId &&
          sharedProjection?.toolCallId === preEffectIntent.toolCallId &&
          sharedProjection?.providerToolCallId ===
            preEffectIntent.providerToolCallId &&
          sharedProjection?.providerRequestDigest ===
            receipt.providerRequestDigest &&
          sharedProjection?.resultDigest === receipt.businessResultDigest &&
          sharedProjection?.effectSourceFactDigest ===
            receipt.effectSourceFactDigest &&
          sharedProjection?.specificReceiptDigests.length === 0,
      ],
    ]
      .filter(([, matches]) => !matches)
      .map(([name]) => name)
      .join(',');
    fail(
      `Evidence archive optional-capability raw source drifted from its plan, registration, turn, dispatch, or shared-effect owner (${failedRawBindings}).`
    );
  }

  const request = createAgentEvaluationOptionalCapabilityFactSourceRequest({
    attemptId: receipt.attemptId,
    descriptorDigest: receipt.descriptorDigest,
    targetId: receipt.targetId,
    targetDigest: receipt.targetDigest,
    capabilityProfileId: receipt.capabilityProfileId,
    capabilityProfileDigest: receipt.capabilityProfileDigest,
    capabilityDescriptorDigest: receipt.capabilityDescriptorDigest,
    capabilityId: receipt.capabilityId,
    supportExpectation: receipt.supportExpectation,
    turnIndex: receipt.turnIndex,
    invocationId: receipt.invocationId,
    protocolFamily: receipt.protocolFamily,
    providerConfigurationId: receipt.providerConfigurationId,
    modelId: receipt.modelId,
    modelLineageDigest: receipt.modelLineageDigest,
    adapterDigest: receipt.adapterDigest,
    providerRequestDigest: receipt.providerRequestDigest,
    responseDigest: receipt.responseDigest,
    dispatchIntentDigest: receipt.dispatchIntentDigest,
    transportReceiptDigest: receipt.transportReceiptDigest,
    resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: receipt.normalizedEventSetDigest,
    source: Object.freeze({
      kind: receipt.sourceKind,
      ownerRequestDigest: receipt.ownerRequestDigest,
      ownerReceiptDigest: receipt.ownerReceiptDigest,
      effectSourceReceiptDigest: receipt.effectSourceReceiptDigest,
    }),
  });
  const sourceDigestBase = {
    kind: request.source.kind,
    planDigest: state.index.planDigest,
    repositoryCommit: state.index.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    turnIndex: request.turnIndex,
    invocationId: request.invocationId,
    providerRequestDigest: request.providerRequestDigest,
    responseDigest: request.responseDigest,
    dispatchIntentDigest: request.dispatchIntentDigest,
    transportReceiptDigest: request.transportReceiptDigest,
    resultSpoolReceiptDigest: request.resultSpoolReceiptDigest,
    normalizedEventSetDigest: request.normalizedEventSetDigest,
    ownerRequestDigest: receipt.ownerRequestDigest,
    ownerReceiptDigest: receipt.ownerReceiptDigest,
    ownerStageDigest: receipt.ownerStageDigest,
    ownerDispatchAckDigest: receipt.ownerDispatchAckDigest,
    preEffectIntentDigest: receipt.preEffectIntentDigest,
    effectSourceReceiptDigest: receipt.effectSourceReceiptDigest,
    effectSourceFactDigest: receipt.effectSourceFactDigest,
    businessResultDigest: receipt.businessResultDigest,
    outcome: receipt.outcome,
    ...(receipt.fact ? { factDigest: receipt.fact.factDigest } : {}),
  };
  let decodedReceipt;
  let decodedStage;
  let decodedAuthority;
  try {
    decodedReceipt =
      decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(receipt, {
        namespaceId: receipt.namespaceId,
        planDigest: state.index.planDigest,
        repositoryCommit: state.index.repositoryCommit,
        request,
      });
    const stageRequest = Object.freeze({ ...authorityRecord.stageRequest });
    decodedStage = decodeAgentEvaluationOptionalCapabilityFactStageResponse(
      Object.freeze({
        format:
          'prodivix.agent-evaluation-optional-capability-fact-authority-stage-response',
        version: 1,
        authorityRequestDigest: authorityRecord.authorityRequestDigest,
        sourceSealDigest: authorityRecord.sourceSealDigest,
        stageDigest: authorityRecord.stageDigest,
        replayed: false,
      }),
      { request: stageRequest, receipt: decodedReceipt }
    );
    decodedAuthority =
      decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
        authorityRecord.sealedResponse,
        {
          planDigest: state.index.planDigest,
          repositoryCommit: state.index.repositoryCommit,
          receipt: decodedReceipt,
          stage: decodedStage,
          sanitization: state.observationSanitization,
        }
      );
  } catch {
    fail(
      'Evidence archive optional-capability source, stage, acknowledgement, or sealed authority failed canonical decoding.'
    );
  }
  if (
    receipt.sourceRequestDigest !== digestAgentCanonicalValue(request) ||
    receipt.sourceDigest !== digestAgentCanonicalValue(sourceDigestBase) ||
    !sameCanonicalJson(decodedReceipt, receipt) ||
    decodedStage.authorityRequestDigest !==
      authorityRecord.authorityRequestDigest ||
    decodedStage.stageDigest !== authorityRecord.stageDigest ||
    !sameCanonicalJson(decodedAuthority, authorityRecord.sealedResponse) ||
    decodedAuthority.dispatchAckDigest !== authorityRecord.dispatchAckDigest ||
    decodedAuthority.resultDigest !== authorityRecord.resultDigest ||
    (decodedAuthority.outcome === 'observed'
      ? !sameCanonicalJson(
          decodedAuthority.runtimeFactEnvelopes[0],
          authorityRecord.runtimeFactEnvelope
        ) ||
        !sameCanonicalJson(
          decodedAuthority.factAuthorities[0],
          authorityRecord.factAuthority
        ) ||
        !sameCanonicalJson(authorityRecord.fact, sourceRecord.effectSourceFact)
      : authorityRecord.fact !== null ||
        authorityRecord.runtimeFactEnvelope !== null ||
        authorityRecord.factAuthority !== null)
  ) {
    fail(
      'Evidence archive optional-capability raw source or authority canonical projection drifted.'
    );
  }
};

export const assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding = (
  state,
  sourceRecord,
  authorityRecord
) => {
  if (
    !isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
      sourceRecord
    )
  ) {
    fail(
      'Evidence archive native optional-capability source is not a canonical tagged archive record.'
    );
  }
  const receipt = sourceRecord.sourceReceipt;
  const bootstrapRequest = sourceRecord.bootstrapSourceRequest;
  const bootstrapReceipt = sourceRecord.bootstrapSourceReceipt;
  const descriptor = expectedDescriptorFor(state, sourceRecord.attemptId);
  const target = descriptor
    ? state.singletons.plan.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === descriptor.targetId
      )
    : undefined;
  const runtimeAuthority =
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  const provider = target
    ? state.singletons.plan.providerConfigurations.find(
        ({ providerConfigurationId }) =>
          providerConfigurationId === target.providerConfigurationId
      )
    : undefined;
  const concreteCase = descriptor
    ? state.expectedCases.get(descriptor.caseId)
    : undefined;
  let resolvedCapabilityDescriptor;
  let program;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
    program = target
      ? createAgentCapabilityProbeProgram({
          capabilityProfileId: target.capabilityProfileId,
          capabilityProfileDigest: target.capabilityProfileDigest,
        })
      : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
    program = undefined;
  }
  const turnIdentity = `${sourceRecord.attemptId}\u0000${sourceRecord.turnIndex}\u0000${bootstrapRequest.invocationId}`;
  const turn = state.invocationTurnBindings.get(turnIdentity);
  const dispatchIntent = state.attemptDispatchIntents.get(
    bootstrapRequest.dispatchIntentDigest
  );
  const transport = state.attemptTransports.get(
    bootstrapRequest.transportReceiptDigest
  );
  const spool = state.attemptSpools.get(
    bootstrapRequest.resultSpoolReceiptDigest
  );
  const registration = runtimeAuthority
    ? state.runtimeFactSourceRegistrations.get(
        runtimeAuthority.registrationReceiptDigest
      )
    : undefined;
  if (
    !descriptor ||
    !target ||
    !runtimeAuthority ||
    !provider ||
    !resolvedCapabilityDescriptor ||
    !program ||
    !turn ||
    !dispatchIntent ||
    !transport ||
    !spool ||
    !registration ||
    sourceRecord.attemptId !== descriptor.attemptId ||
    sourceRecord.turnIndex !== bootstrapRequest.turnIndex ||
    receipt.namespaceId !== bootstrapRequest.namespaceId ||
    receipt.planDigest !== state.index.planDigest ||
    receipt.repositoryCommit !== state.index.repositoryCommit ||
    receipt.attemptId !== descriptor.attemptId ||
    receipt.descriptorDigest !== descriptor.descriptorDigest ||
    receipt.targetId !== target.targetId ||
    receipt.targetDigest !== target.targetDigest ||
    receipt.capabilityProfileId !== target.capabilityProfileId ||
    receipt.capabilityProfileDigest !== target.capabilityProfileDigest ||
    receipt.capabilityDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest ||
    receipt.capabilityId !==
      target.optionalCapabilitySupportAuthority.capabilityId ||
    receipt.supportExpectation !==
      target.optionalCapabilitySupportAuthority.supportExpectation ||
    receipt.protocolFamily !== target.protocolFamily ||
    receipt.protocolFamily !== provider.adapter.protocolFamily ||
    receipt.providerConfigurationId !== target.providerConfigurationId ||
    receipt.modelId !== target.modelId ||
    receipt.modelLineageDigest !== target.modelLineageDigest ||
    receipt.adapterDigest !== provider.adapter.adapterDigest ||
    receipt.targetAuthorityDigest !== runtimeAuthority.authorityDigest ||
    receipt.sourceAuthorityId !== runtimeAuthority.sourceAuthorityId ||
    receipt.sourceAuthorityImplementationDigest !==
      runtimeAuthority.sourceAuthorityImplementationDigest ||
    receipt.sourceAuthorityRouteBinding !== runtimeAuthority.routeBinding ||
    receipt.registrationAuthorityIssuerId !==
      runtimeAuthority.registrationAuthorityIssuerId ||
    receipt.registrationReceiptDigest !==
      runtimeAuthority.registrationReceiptDigest ||
    receipt.sourceKind !== runtimeAuthority.sourceKind ||
    !sameCanonicalJson(
      bootstrapRequest.runtimeFactSourceAuthority,
      runtimeAuthority
    ) ||
    bootstrapRequest.planDigest !== state.index.planDigest ||
    bootstrapRequest.repositoryCommit !== state.index.repositoryCommit ||
    bootstrapRequest.attemptId !== descriptor.attemptId ||
    bootstrapRequest.descriptorDigest !== descriptor.descriptorDigest ||
    bootstrapRequest.protocolFamily !== target.protocolFamily ||
    bootstrapRequest.providerConfigurationId !==
      target.providerConfigurationId ||
    bootstrapRequest.modelLineageDigest !== target.modelLineageDigest ||
    bootstrapRequest.adapterDigest !== provider.adapter.adapterDigest ||
    bootstrapRequest.providerRequestDigest !== turn.requestArtifactDigest ||
    bootstrapRequest.providerResponseDigest !== turn.responseArtifactDigest ||
    bootstrapRequest.dispatchIntentDigest !== turn.dispatchIntentDigest ||
    bootstrapRequest.transportReceiptDigest !== turn.transportReceiptDigest ||
    bootstrapRequest.resultSpoolReceiptDigest !==
      turn.providerResultSpoolReceiptDigest ||
    turn.dispatchState !== 'dispatched' ||
    dispatchIntent.attemptId !== descriptor.attemptId ||
    dispatchIntent.turnIndex !== bootstrapRequest.turnIndex ||
    dispatchIntent.invocationId !== bootstrapRequest.invocationId ||
    dispatchIntent.requestDigest !== bootstrapRequest.providerRequestDigest ||
    dispatchIntent.protocolFamily !== target.protocolFamily ||
    dispatchIntent.providerConfigurationId !== target.providerConfigurationId ||
    dispatchIntent.modelLineageDigest !== target.modelLineageDigest ||
    dispatchIntent.adapterDigest !== provider.adapter.adapterDigest ||
    transport.dispatchIntentDigest !== dispatchIntent.intentDigest ||
    transport.requestDigest !== bootstrapRequest.providerRequestDigest ||
    transport.invocationId !== bootstrapRequest.invocationId ||
    transport.protocolFamily !== target.protocolFamily ||
    transport.providerConfigurationId !== target.providerConfigurationId ||
    transport.receiptDigest !== bootstrapRequest.transportReceiptDigest ||
    transport.completedAt !== bootstrapRequest.transportCompletedAt ||
    spool.attemptId !== descriptor.attemptId ||
    spool.turnIndex !== bootstrapRequest.turnIndex ||
    spool.invocationId !== bootstrapRequest.invocationId ||
    spool.dispatchIntentDigest !== dispatchIntent.intentDigest ||
    spool.transportReceiptDigest !== transport.receiptDigest ||
    spool.responseDigest !== bootstrapRequest.providerResponseDigest ||
    spool.receiptDigest !== bootstrapRequest.resultSpoolReceiptDigest ||
    spool.normalizedEventSetDigest !==
      bootstrapRequest.normalizedEventSetDigest ||
    Date.parse(bootstrapRequest.observedAt) < Date.parse(spool.createdAt) ||
    receipt.nativeBootstrapSourceRequestDigest !==
      bootstrapRequest.requestDigest ||
    receipt.nativeBootstrapSourceReceiptDigest !==
      bootstrapReceipt.receiptDigest ||
    receipt.ownerStageDigest !== bootstrapReceipt.sourceOwnerStageDigest ||
    receipt.ownerDispatchAckDigest !==
      bootstrapReceipt.sourceOwnerDispatchAckDigest ||
    receipt.outcome !== bootstrapRequest.outcome ||
    receipt.observedAt !== bootstrapRequest.observedAt ||
    !sameCanonicalJson(
      sourceRecord.nativeSourceReceipt,
      bootstrapRequest.nativeSourceReceipt
    ) ||
    !sameCanonicalJson(sourceRecord.bootstrapFact, bootstrapRequest.fact) ||
    (receipt.outcome === 'observed'
      ? !sameCanonicalJson(receipt.fact, sourceRecord.bootstrapFact)
      : Object.hasOwn(receipt, 'fact'))
  ) {
    fail(
      'Evidence archive native optional-capability raw source drifted from its plan, registration, turn, transport, spool, Provider preimage, or bootstrap owner.'
    );
  }

  const nativeSourceReceipt = sourceRecord.nativeSourceReceipt;
  const stateVaultSealRequest = sourceRecord.stateVaultSealRequest;
  const stateVaultSealReceipt = sourceRecord.stateVaultSealReceipt;
  const stateVaultResolveRequest = sourceRecord.stateVaultResolveRequest;
  const stateVaultResolveReceipt = sourceRecord.stateVaultResolveReceipt;
  const stateVaultRetireRequest = sourceRecord.stateVaultRetireRequest;
  const stateVaultRetirementReceipt = sourceRecord.stateVaultRetirementReceipt;
  const stateVaultAuthority =
    state.frozenRunConfig?.nativeProviderStateVaultEncryption?.authority;
  const lifecycleIsAbsent =
    stateVaultSealRequest === null &&
    stateVaultSealReceipt === null &&
    stateVaultResolveRequest === null &&
    stateVaultResolveReceipt === null &&
    stateVaultRetireRequest === null &&
    stateVaultRetirementReceipt === null;
  if (
    nativeSourceReceipt === null ||
    nativeSourceReceipt.source.sourceKind === 'provider-cache-usage'
  ) {
    if (!lifecycleIsAbsent) {
      fail(
        'Evidence archive non-stateful native optional-capability source minted a state-vault lifecycle.'
      );
    }
  } else {
    let reconstructedRetireRequest;
    try {
      reconstructedRetireRequest =
        stateVaultSealRequest &&
        stateVaultSealReceipt &&
        stateVaultRetireRequest
          ? createAgentNativeProviderStateVaultRetireRequest({
              sealRequest: stateVaultSealRequest,
              sealReceipt: stateVaultSealReceipt,
              resolveRequest: stateVaultResolveRequest,
              resolveReceipt: stateVaultResolveReceipt,
              disposition: stateVaultRetireRequest.disposition,
              requestedAt: stateVaultRetireRequest.requestedAt,
            })
          : undefined;
    } catch {
      reconstructedRetireRequest = undefined;
    }
    const resolved = stateVaultResolveReceipt?.status === 'resolved';
    const expired = stateVaultResolveReceipt?.status === 'expired';
    const expectedPurpose =
      nativeSourceReceipt.source.sourceKind === 'provider-job-terminal-status'
        ? 'background-job-state'
        : 'reasoning-continuation-state';
    if (
      !stateVaultAuthority ||
      !isAgentNativeProviderStateVaultAuthority(stateVaultAuthority) ||
      !stateVaultSealRequest ||
      !isAgentNativeProviderStateVaultSealRequest(stateVaultSealRequest) ||
      !stateVaultSealReceipt ||
      !isAgentNativeProviderStateVaultSealReceipt(
        stateVaultSealReceipt,
        stateVaultSealRequest,
        state.observationSanitization
      ) ||
      stateVaultSealReceipt.status !== 'sealed' ||
      !stateVaultRetireRequest ||
      !isAgentNativeProviderStateVaultRetireRequest(stateVaultRetireRequest) ||
      !stateVaultRetirementReceipt ||
      !isAgentNativeProviderStateVaultRetirementReceipt(
        stateVaultRetirementReceipt,
        stateVaultRetireRequest,
        stateVaultSealRequest,
        stateVaultSealReceipt,
        state.observationSanitization
      ) ||
      !reconstructedRetireRequest ||
      !sameCanonicalJson(reconstructedRetireRequest, stateVaultRetireRequest) ||
      stateVaultSealRequest.authorityDigest !==
        stateVaultAuthority.authorityDigest ||
      stateVaultSealRequest.purpose !== expectedPurpose ||
      stateVaultSealRequest.attemptId !== sourceRecord.attemptId ||
      stateVaultSealRequest.protocolFamily !== target.protocolFamily ||
      stateVaultSealRequest.probeProgramDigest !== program.programDigest ||
      stateVaultSealRequest.capabilityProfileDigest !==
        target.capabilityProfileDigest ||
      stateVaultSealRequest.invocationId !== bootstrapRequest.invocationId ||
      stateVaultSealRequest.requestDigest !==
        bootstrapRequest.providerRequestDigest ||
      stateVaultSealRequest.responseDigest !==
        bootstrapRequest.providerResponseDigest ||
      stateVaultSealRequest.responseBodyDigest !==
        transport.responseBodyDigest ||
      stateVaultSealRequest.sealedResponseJsonDigest !==
        spool.normalizedEventSetDigest ||
      stateVaultSealRequest.providerConfigurationId !==
        target.providerConfigurationId ||
      stateVaultSealRequest.modelLineageDigest !== target.modelLineageDigest ||
      stateVaultSealRequest.adapterDigest !== provider.adapter.adapterDigest ||
      stateVaultSealRequest.taskId !==
        nativeSourceReceipt.executionIdentityAuthority.taskId ||
      stateVaultSealRequest.runId !==
        nativeSourceReceipt.executionIdentityAuthority.runId ||
      stateVaultSealRequest.generation !==
        nativeSourceReceipt.executionIdentityAuthority.generation ||
      stateVaultSealRequest.observedAt !== bootstrapRequest.observedAt ||
      stateVaultSealReceipt.authorityDigest !==
        stateVaultAuthority.authorityDigest ||
      stateVaultSealReceipt.providerStateReferenceDigest !==
        nativeSourceReceipt.source.providerStateReferenceDigest ||
      stateVaultSealReceipt.opaqueProviderStateRef !==
        nativeSourceReceipt.source.opaqueProviderStateRef ||
      stateVaultSealRequest.sealRequestDigest !==
        nativeSourceReceipt.source.stateVaultSealRequestDigest ||
      stateVaultSealReceipt.receiptDigest !==
        nativeSourceReceipt.source.stateVaultSealReceiptDigest ||
      stateVaultAuthority.authorityDigest !==
        nativeSourceReceipt.source.stateVaultAuthorityDigest ||
      (stateVaultResolveRequest === null) !==
        (stateVaultResolveReceipt === null) ||
      (stateVaultResolveRequest !== null &&
        (!isAgentNativeProviderStateVaultResolveRequest(
          stateVaultResolveRequest,
          stateVaultSealRequest,
          stateVaultSealReceipt
        ) ||
          !isAgentNativeProviderStateVaultResolveReceipt(
            stateVaultResolveReceipt,
            stateVaultResolveRequest,
            state.observationSanitization
          ))) ||
      (resolved && stateVaultRetireRequest.disposition !== 'consumed') ||
      (expired && stateVaultRetireRequest.disposition !== 'expired') ||
      (stateVaultResolveRequest === null &&
        !['cancelled', 'expired'].includes(
          stateVaultRetireRequest.disposition
        )) ||
      stateVaultRetirementReceipt.stateKeyCreationReceiptDigest !==
        stateVaultSealReceipt.stateKeyCreationReceiptDigest ||
      stateVaultRetirementReceipt.resolveReceiptDigest !==
        stateVaultRetireRequest.resolveReceiptDigest ||
      stateVaultRetirementReceipt.disposition !==
        stateVaultRetireRequest.disposition
    ) {
      fail(
        'Evidence archive native Provider state-vault seal, resolve, retirement, or frozen authority binding drifted.'
      );
    }
  }

  const sourceRequest =
    createAgentEvaluationOptionalCapabilityFactSourceRequest({
      attemptId: receipt.attemptId,
      descriptorDigest: receipt.descriptorDigest,
      targetId: receipt.targetId,
      targetDigest: receipt.targetDigest,
      capabilityProfileId: receipt.capabilityProfileId,
      capabilityProfileDigest: receipt.capabilityProfileDigest,
      capabilityDescriptorDigest: receipt.capabilityDescriptorDigest,
      capabilityId: receipt.capabilityId,
      supportExpectation: receipt.supportExpectation,
      turnIndex: receipt.turnIndex,
      invocationId: receipt.invocationId,
      protocolFamily: receipt.protocolFamily,
      providerConfigurationId: receipt.providerConfigurationId,
      modelId: receipt.modelId,
      modelLineageDigest: receipt.modelLineageDigest,
      adapterDigest: receipt.adapterDigest,
      providerRequestDigest: receipt.providerRequestDigest,
      responseDigest: receipt.responseDigest,
      dispatchIntentDigest: receipt.dispatchIntentDigest,
      transportReceiptDigest: receipt.transportReceiptDigest,
      resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
      normalizedEventSetDigest: receipt.normalizedEventSetDigest,
      source: Object.freeze({
        kind: receipt.sourceKind,
        nativeBootstrapSourceRequestDigest: bootstrapRequest.requestDigest,
      }),
    });
  let decodedReceipt;
  let expectedRuntimeEnvelope;
  try {
    decodedReceipt =
      decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(receipt, {
        namespaceId: receipt.namespaceId,
        planDigest: state.index.planDigest,
        repositoryCommit: state.index.repositoryCommit,
        request: sourceRequest,
      });
    expectedRuntimeEnvelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        bootstrapReceipt,
        state.observationSanitization
      );
  } catch {
    fail(
      'Evidence archive native optional-capability source or bootstrap projection failed canonical decoding.'
    );
  }
  if (
    receipt.sourceRequestDigest !== digestAgentCanonicalValue(sourceRequest) ||
    !sameCanonicalJson(decodedReceipt, receipt)
  ) {
    fail(
      'Evidence archive native optional-capability source request or sealed receipt projection drifted.'
    );
  }
  if (receipt.outcome !== 'observed') {
    if (authorityRecord !== undefined || expectedRuntimeEnvelope !== null) {
      fail(
        'Evidence archive unavailable or failed native optional-capability source minted an authority.'
      );
    }
    return;
  }
  if (!authorityRecord || !expectedRuntimeEnvelope) {
    fail(
      'Evidence archive observed native optional-capability source is missing its exact sealed authority.'
    );
  }
  let decodedStage;
  let decodedAuthority;
  let expectedFactAuthority;
  try {
    decodedStage = decodeAgentEvaluationOptionalCapabilityFactStageResponse(
      Object.freeze({
        format:
          'prodivix.agent-evaluation-optional-capability-fact-authority-stage-response',
        version: 1,
        authorityRequestDigest: authorityRecord.authorityRequestDigest,
        sourceSealDigest: authorityRecord.sourceSealDigest,
        stageDigest: authorityRecord.stageDigest,
        replayed: false,
      }),
      { request: authorityRecord.stageRequest, receipt: decodedReceipt }
    );
    decodedAuthority =
      decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
        authorityRecord.sealedResponse,
        {
          planDigest: state.index.planDigest,
          repositoryCommit: state.index.repositoryCommit,
          receipt: decodedReceipt,
          stage: decodedStage,
          sanitization: state.observationSanitization,
        }
      );
    expectedFactAuthority =
      createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        expectedRuntimeEnvelope,
        state.observationSanitization
      );
  } catch {
    fail(
      'Evidence archive native optional-capability authority stage, acknowledgement, or response failed canonical decoding.'
    );
  }
  if (
    authorityRecord.attemptId !== sourceRecord.attemptId ||
    authorityRecord.turnIndex !== sourceRecord.turnIndex ||
    authorityRecord.sourceSealDigest !== sourceRecord.sourceSealDigest ||
    authorityRecord.stageRequest.planDigest !== state.index.planDigest ||
    authorityRecord.stageRequest.repositoryCommit !==
      state.index.repositoryCommit ||
    authorityRecord.stageRequest.attemptId !== descriptor.attemptId ||
    authorityRecord.stageRequest.descriptorDigest !==
      descriptor.descriptorDigest ||
    authorityRecord.stageRequest.turnIndex !== sourceRecord.turnIndex ||
    authorityRecord.stageRequest.sourceSealDigest !==
      sourceRecord.sourceSealDigest ||
    decodedStage.authorityRequestDigest !==
      authorityRecord.authorityRequestDigest ||
    decodedStage.stageDigest !== authorityRecord.stageDigest ||
    !sameCanonicalJson(decodedAuthority, authorityRecord.sealedResponse) ||
    decodedAuthority.dispatchAckDigest !== authorityRecord.dispatchAckDigest ||
    decodedAuthority.resultDigest !== authorityRecord.resultDigest ||
    !sameCanonicalJson(
      authorityRecord.runtimeFactEnvelope,
      expectedRuntimeEnvelope
    ) ||
    !sameCanonicalJson(authorityRecord.factAuthority, expectedFactAuthority) ||
    !sameCanonicalJson(authorityRecord.fact, sourceRecord.bootstrapFact) ||
    !sameCanonicalJson(
      decodedAuthority.runtimeFactEnvelopes[0],
      expectedRuntimeEnvelope
    ) ||
    !sameCanonicalJson(
      decodedAuthority.factAuthorities[0],
      expectedFactAuthority
    )
  ) {
    fail(
      'Evidence archive native optional-capability authority drifted from its raw bootstrap source, canonical stage, acknowledgement, envelope, or fact authority.'
    );
  }
};

const assertOptionalCapabilityFactAuthorityBinding = (
  state,
  sourceRecord,
  authorityRecord
) =>
  isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
    sourceRecord
  )
    ? assertG4ModelEvaluationNativeBootstrapFactAuthorityBinding(
        state,
        sourceRecord,
        authorityRecord
      )
    : assertEffectOptionalCapabilityFactAuthorityBinding(
        state,
        sourceRecord,
        authorityRecord
      );

export const assertG4ModelEvaluationCapabilityEffectProviderRuntimeJournalJoins =
  (state) => {
    let effectSourceCount = 0;
    for (const sourceRecord of state.optionalCapabilityFactSources.values()) {
      if (
        !isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(
          sourceRecord
        )
      ) {
        continue;
      }
      effectSourceCount += 1;
      const runtimeRecord = state.capabilityEffectProviderRuntimeJournals.get(
        sourceRecord.sourceReceipt.ownerRequestDigest
      );
      if (
        !runtimeRecord ||
        !matchAgentEvaluationCapabilityEffectProviderRuntimeArchiveSource(
          runtimeRecord,
          sourceRecord
        )
      ) {
        fail(
          'Evidence archive capability-effect Provider runtime journal drifted from its exact outer source seal.'
        );
      }
    }
    if (
      effectSourceCount !== state.capabilityEffectProviderRuntimeJournals.size
    ) {
      fail(
        'Evidence archive capability-effect Provider runtime journal is orphaned from its exact outer source seal.'
      );
    }
  };

const exactHostedRuntimeBudgetFloor = Object.freeze({
  hostedSearchQueryCount: 210,
  hostedToolCallCount: 222,
  hostedAttemptToolCallCount: 210,
  hostedLifecycleToolCallCount: 12,
  providerUploadBytes: 310,
  providerStorageByteSeconds: 214_272_000,
});

const integerLifecycleUsage = (projection, unit) => {
  const source = projection.demand.usage.amounts.find(
    (amount) => amount.unit === unit
  )?.logicalAmount;
  if (source === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(source)) {
    fail('Evidence archive hosted lifecycle budget usage is not integral.');
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value)) {
    fail('Evidence archive hosted lifecycle budget usage is unbounded.');
  }
  return value;
};

export const assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins =
  (state) => {
    const plan = state.singletons.plan;
    const ledger = state.singletons.budgetLedger;
    const authority = state.singletons.authorityAttestation;
    const archivedRecords = [
      ...state.hostedRetrievalRuntimeResourceLifecycleJournals.values(),
    ];
    let family;
    try {
      family =
        createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
          archivedRecords
        );
    } catch {
      fail(
        'Evidence archive hosted retrieval runtime resource lifecycle journal family is not canonical.'
      );
    }
    if (
      !plan ||
      !ledger ||
      !isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyCompleteForPlan(
        plan,
        archivedRecords
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        family
      ) ||
      family.closureStatus !== 'zeroed' ||
      family.repositoryCommit !== state.index.repositoryCommit ||
      family.planDigest !== state.index.planDigest ||
      family.frozenRunDigest !== state.index.frozenRunDigest ||
      family.runConfigArtifactBindingDigest !==
        state.index.runConfigArtifactBinding.bindingDigest
    ) {
      fail(
        'Evidence archive hosted retrieval runtime resource lifecycle journal is incomplete or drifted from the frozen run.'
      );
    }

    const cleanupRecords = [
      ...state.hostedRetrievalRuntimeResourceCleanups.values(),
    ];
    const registrationResults = cleanupRecords.map(
      ({ registrationResult }) => registrationResult
    );
    const publicResourceMaterials = registrationResults.map(
      ({ registrationRequest }) => {
        const intent = registrationRequest.registrationIntent;
        const program = createAgentCapabilityProbeProgram({
          capabilityProfileId: intent.capabilityProfileId,
          capabilityProfileDigest: intent.capabilityProfileDigest,
        });
        const material = resolveAgentCapabilityProbePublicResource(program);
        if (
          !material ||
          program.programDigest !== intent.probeProgramDigest ||
          material.descriptor.descriptorDigest !==
            intent.publicResourceDescriptorDigest
        ) {
          fail(
            'Evidence archive hosted lifecycle public budget material drifted from its frozen registration intent.'
          );
        }
        return material;
      }
    );
    if (
      !matchAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        family,
        registrationResults,
        cleanupRecords,
        publicResourceMaterials
      )
    ) {
      fail(
        'Evidence archive hosted lifecycle journal does not close the exact registrations, cleanup records, public materials, and zero terminus.'
      );
    }

    let lifecycleBudgetClosureBindings;
    try {
      lifecycleBudgetClosureBindings =
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings(
          registrationResults.map(
            ({ registrationRequest }) => registrationRequest
          ),
          family.records.filter(
            ({ journalRecord }) => journalRecord.operation === 'create'
          )
        );
    } catch {
      fail(
        'Evidence archive hosted lifecycle creation closures do not bind the exact four archive records.'
      );
    }
    const lifecycleJournalSetDigest = digestAgentCanonicalValue({
      recordDigests: [...family.recordDigests].sort(compareUnicodeCodePoints),
    });
    const lifecycleBudgetClosureBindingSetDigest =
      digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
        lifecycleBudgetClosureBindings
      );
    if (
      lifecycleJournalSetDigest !==
        state.index.authorityRoots
          .hostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
      lifecycleJournalSetDigest !==
        authority?.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
      lifecycleBudgetClosureBindingSetDigest !==
        authority?.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest
    ) {
      fail(
        'Evidence archive hosted lifecycle journal or exact-four budget closure binding set drifted from the signed Bundle authority.'
      );
    }

    let lifecycleToolCalls = 0;
    let providerUploadBytes = 0;
    let providerStorageByteSeconds = 0;
    const lifecycleReservationIds = new Set();
    for (const record of family.records) {
      if (record.journalRecord.operation !== 'create') continue;
      const projection = record.budgetClosureProjection;
      const reservation = ledger.reservations.find(
        ({ reservationId }) => reservationId === projection?.reservationId
      );
      if (
        !projection ||
        !reservation ||
        reservation.status !== 'settled' ||
        !reservation.settlement ||
        reservation.demandDigest !== projection.demandDigest ||
        !sameCanonicalJson(reservation.demand, projection.demand) ||
        !sameCanonicalJson(reservation.settlement, projection.settlement) ||
        reservation.settlement.settlementDigest !==
          projection.settlementDigest ||
        projection.budgetReservationAuthority.ledgerRevision >
          ledger.revision ||
        lifecycleReservationIds.has(projection.reservationId)
      ) {
        fail(
          'Evidence archive hosted lifecycle budget closure drifted from the settled budget ledger authority.'
        );
      }
      lifecycleReservationIds.add(projection.reservationId);
      lifecycleToolCalls += integerLifecycleUsage(
        projection,
        'hosted-tool-call'
      );
      providerUploadBytes += integerLifecycleUsage(
        projection,
        'provider-upload-byte'
      );
      providerStorageByteSeconds += integerLifecycleUsage(
        projection,
        'provider-storage-byte-second'
      );
    }
    const budgetFloor =
      resolveAgentModelEvaluationHostedRuntimeBudgetFloor(plan);
    if (
      lifecycleReservationIds.size !== 4 ||
      !sameCanonicalJson(budgetFloor, exactHostedRuntimeBudgetFloor) ||
      lifecycleToolCalls !== budgetFloor.hostedLifecycleToolCallCount ||
      providerUploadBytes !== budgetFloor.providerUploadBytes ||
      providerStorageByteSeconds !== budgetFloor.providerStorageByteSeconds
    ) {
      fail(
        'Evidence archive hosted runtime query, lifecycle tool, upload, or storage budget floor drifted.'
      );
    }
    return Object.freeze({
      family,
      lifecycleReservationCount: lifecycleReservationIds.size,
      budgetFloor,
    });
  };

export const assertG4ModelEvaluationHostedRetrievalRuntimeResourceCleanupJoins =
  (state) => {
    const plan = state.singletons.plan;
    const archivedRecords = [
      ...state.hostedRetrievalRuntimeResourceCleanups.values(),
    ];
    let records = archivedRecords;
    if (archivedRecords.length > 0) {
      try {
        records =
          createAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(
            archivedRecords
          );
      } catch {
        fail(
          'Evidence archive hosted retrieval runtime resource cleanup family is not the exact canonical four-record lifecycle.'
        );
      }
    }
    if (
      !plan ||
      !isAgentEvaluationHostedRetrievalRuntimeResourceCleanupArchiveFamilyCompleteForPlan(
        plan,
        records
      )
    ) {
      fail(
        'Evidence archive hosted retrieval runtime resource cleanup family is incomplete for its frozen plan.'
      );
    }
    if (records.length === 0) return;
    if (!isAgentHostedRetrievalRuntimeResourceCleanupArchiveFamily(records)) {
      fail(
        'Evidence archive hosted retrieval runtime resource cleanup family is not the exact canonical four-record lifecycle.'
      );
    }

    const expectedRegistrationIntentDigests = new Set(
      plan.capabilityQualificationTargets.flatMap(
        ({ optionalCapabilitySupportAuthority }) => {
          const digest =
            optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority
              ?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
          return digest === undefined ? [] : [digest];
        }
      )
    );
    const observedRegistrationIntentDigests = new Set(
      records.map(
        ({ registrationResult }) =>
          registrationResult.registrationRequest.registrationIntentDigest
      )
    );
    if (
      expectedRegistrationIntentDigests.size !== records.length ||
      observedRegistrationIntentDigests.size !== records.length ||
      [...expectedRegistrationIntentDigests].some(
        (digest) => !observedRegistrationIntentDigests.has(digest)
      ) ||
      records.some(
        (record) =>
          record.frozenRunDigest !== state.index.frozenRunDigest ||
          record.runConfigArtifactBindingDigest !==
            state.index.runConfigArtifactBinding.bindingDigest
      )
    ) {
      fail(
        'Evidence archive hosted retrieval runtime resource cleanup drifted from its exact pre-plan registration intents or frozen run.'
      );
    }

    const expectedShardIds = [
      ...new Set(
        [...state.expectedDescriptors.values()].map(({ shardId }) => shardId)
      ),
    ].sort(compareUnicodeCodePoints);
    const terminalShardLedgerEntries = expectedShardIds.map((shardId) => {
      const checkpoints = [...state.checkpoints.values()].filter(
        (checkpoint) => checkpoint.shardId === shardId
      );
      const expectedAttemptIds = [...state.expectedDescriptors.values()]
        .filter((descriptor) => descriptor.shardId === shardId)
        .map(({ attemptId }) => attemptId)
        .sort(compareUnicodeCodePoints);
      if (
        checkpoints.length !== 1 ||
        checkpoints[0].state !== 'completed' ||
        checkpoints[0].missingAttemptIds.size !== 0 ||
        checkpoints[0].completedAttemptIds.size !== expectedAttemptIds.length ||
        expectedAttemptIds.some(
          (attemptId) => !checkpoints[0].completedAttemptIds.has(attemptId)
        )
      ) {
        fail(
          'Evidence archive hosted retrieval runtime terminal fence lacks one exact completed checkpoint per frozen shard.'
        );
      }
      const checkpoint = checkpoints[0];
      return Object.freeze({
        shardId,
        shardLeaseGeneration: checkpoint.leaseGeneration,
        checkpointDigest: checkpoint.checkpointDigest,
        checkpointUpdatedAt: checkpoint.updatedAt,
        terminalAttempts: Object.freeze(
          expectedAttemptIds.map((attemptId) => {
            const attempt = state.attempts.get(attemptId);
            if (!attempt) {
              fail(
                'Evidence archive hosted retrieval runtime terminal fence references a missing frozen attempt.'
              );
            }
            return Object.freeze({
              attemptId,
              attemptDigest: attempt.attemptDigest,
              status: attempt.status,
              completedAt: attempt.completedAt,
            });
          })
        ),
      });
    });
    if (
      records.some(
        (record) =>
          !matchAgentHostedRetrievalRuntimeResourceCleanupArchiveRunTerminalFenceLedger(
            record,
            expectedShardIds,
            terminalShardLedgerEntries
          )
      )
    ) {
      fail(
        'Evidence archive hosted retrieval runtime cleanup fence drifted from the frozen shard and durable terminal-attempt ledger.'
      );
    }
  };

export const assertG4ModelEvaluationOptionalCapabilityArchiveJoins = (
  state
) => {
  if (
    state.optionalCapabilityFactSources.size >
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount ||
    state.optionalCapabilityFactAuthorities.size >
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount ||
    state.optionalCapabilityFactAuthorities.size >
      state.optionalCapabilityFactSources.size
  ) {
    fail(
      'Evidence archive optional-capability source and authority denominators drifted.'
    );
  }
  for (const [identity, source] of state.optionalCapabilityFactSources) {
    const authority = state.optionalCapabilityFactAuthorities.get(identity);
    const nativeUnavailable =
      isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
        source
      ) && source.sourceReceipt.outcome !== 'observed';
    if (
      nativeUnavailable
        ? authority !== undefined
        : !authority ||
          authority.attemptId !== source.attemptId ||
          authority.turnIndex !== source.turnIndex ||
          authority.sourceSealDigest !== source.sourceSealDigest
    ) {
      fail(
        'Evidence archive optional-capability source is orphaned from its exact sealed authority.'
      );
    }
    assertOptionalCapabilityFactAuthorityBinding(state, source, authority);
  }
  if (
    [...state.optionalCapabilityFactAuthorities.keys()].some(
      (identity) => !state.optionalCapabilityFactSources.has(identity)
    )
  ) {
    fail(
      'Evidence archive optional-capability authority is orphaned from its exact raw source.'
    );
  }
  if (
    state.consumedOptionalCapabilityFacts.size !==
      state.optionalCapabilityFactSources.size ||
    [...state.consumedOptionalCapabilityFacts].some(
      (identity) => !state.optionalCapabilityFactSources.has(identity)
    )
  ) {
    fail(
      'Evidence archive optional-capability source or authority is orphaned from its exact provider observation.'
    );
  }
};

export const assertG4ModelEvaluationCapabilityProbeProviderResourceCleanupBinding =
  ({
    cleanupRecord,
    providerResourceAuthority,
    probeProgram,
    probeObservedAt,
    plannedAt,
    repositoryCommit,
    ownerImplementationDigest,
  }) => {
    if (
      !isAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord(
        cleanupRecord
      ) ||
      cleanupRecord.repositoryCommit !== repositoryCommit ||
      cleanupRecord.ownerImplementationDigest !== ownerImplementationDigest
    ) {
      fail(
        'Evidence archive capability-probe Provider resource cleanup drifted from its repository or owner authority.'
      );
    }
    let cleanupRequest;
    let cleanupResponse;
    let stageDigest;
    let ownerAdmissionDigest;
    let dispatchAckDigest;
    let resultIngressDigest;
    let resultIngressReceiptDigest;
    try {
      cleanupRequest =
        createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
          repositoryCommit,
          resourceRegistrationRequestDigest:
            cleanupRecord.resourceRegistrationRequestDigest,
          deletionAuthorityReceiptDigest:
            cleanupRecord.deletionAuthorityReceiptDigest,
        });
      stageDigest =
        digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
          cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
          ownerImplementationDigest,
        });
      ownerAdmissionDigest =
        digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission({
          cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
          stageDigest,
          ownerImplementationDigest,
        });
      dispatchAckDigest =
        digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck({
          cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
          stageDigest,
          ownerAdmissionDigest,
          cleanupReceiptDigest: cleanupRecord.cleanupReceiptDigest,
        });
      resultIngressDigest =
        digestAgentCapabilityProbeProviderResourceCleanupResultIngress({
          cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
          dispatchAckDigest,
          cleanupReceiptDigest: cleanupRecord.cleanupReceiptDigest,
        });
      resultIngressReceiptDigest =
        digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt({
          resultIngressDigest,
          cleanupReceiptDigest: cleanupRecord.cleanupReceiptDigest,
        });
      cleanupResponse =
        createAgentCapabilityProbeProviderResourceCleanupResponse({
          repositoryCommit,
          resourceRegistrationRequestDigest:
            cleanupRecord.resourceRegistrationRequestDigest,
          ownerImplementationDigest,
          cleanupReceipt: cleanupRecord.cleanupReceipt,
        });
    } catch {
      fail(
        'Evidence archive capability-probe Provider resource cleanup lifecycle preimages are invalid.'
      );
    }
    if (
      !sameCanonicalJson(cleanupRequest, cleanupRecord.cleanupRequest) ||
      !sameCanonicalJson(cleanupResponse, cleanupRecord.cleanupResponse) ||
      cleanupRecord.cleanupRequestDigest !==
        cleanupRequest.cleanupRequestDigest ||
      cleanupRecord.stageDigest !== stageDigest ||
      cleanupRecord.ownerAdmissionDigest !== ownerAdmissionDigest ||
      cleanupRecord.dispatchAckDigest !== dispatchAckDigest ||
      cleanupRecord.resultIngressDigest !== resultIngressDigest ||
      cleanupRecord.resultIngressReceiptDigest !== resultIngressReceiptDigest ||
      !matchAgentCapabilityProbeProviderResourceDeletionAuthority(
        cleanupRecord.deletionAuthorityReceipt,
        providerResourceAuthority,
        probeProgram,
        {
          requestDigest: cleanupRecord.resourceRegistrationRequestDigest,
        }
      ) ||
      !matchAgentCapabilityProbeProviderResourceCleanupReceipt(
        cleanupRecord.cleanupReceipt,
        cleanupRecord.deletionAuthorityReceipt,
        providerResourceAuthority,
        probeProgram,
        { probeObservedAt, plannedAt }
      ) ||
      !matchAgentCapabilityProbeProviderResourceCleanupResponse(
        cleanupRecord.cleanupResponse,
        cleanupRequest,
        cleanupRecord.deletionAuthorityReceipt,
        cleanupRecord.cleanupReceipt
      )
    ) {
      fail(
        'Evidence archive capability-probe Provider resource cleanup drifted from its exact registration, deletion, stage, acknowledgement, ingress, or terminal receipt authority.'
      );
    }
    return cleanupRecord.cleanupReceiptDigest;
  };

const assertQualificationAuthorityArchiveJoins = (state) => {
  const plan = state.singletons.plan;
  const qualifiedTargets = plan.capabilityQualificationTargets.filter(
    ({ optionalCapabilitySupportAuthority }) =>
      optionalCapabilitySupportAuthority !== undefined
  );
  if (
    (plan.plannedJourneyCount ===
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT &&
      qualifiedTargets.length !==
        AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount) ||
    state.capabilityProbeAdmissions.size !== qualifiedTargets.length ||
    [...state.capabilityProbeReferences.values()].reduce(
      (total, references) => total + references.length,
      0
    ) !==
      qualifiedTargets.length *
        AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.referencesPerAdmission
  ) {
    fail(
      'Evidence archive capability-probe authority denominator is incomplete.'
    );
  }
  const matchedAdmissionRequests = new Set();
  const matchedAdmissionByTargetId = new Map();
  for (const target of qualifiedTargets) {
    const authority = target.optionalCapabilitySupportAuthority;
    const provider = plan.providerConfigurations.find(
      ({ providerConfigurationId }) =>
        providerConfigurationId === target.providerConfigurationId
    );
    const model = plan.modelConfigurations.find(
      ({ modelId }) => modelId === target.modelId
    );
    const matches = [...state.capabilityProbeAdmissions.values()].filter(
      ({ response }) =>
        sameCanonicalJson(response.probeEvidence, authority.probeEvidence)
    );
    const admission = matches[0];
    if (
      matches.length !== 1 ||
      !admission ||
      matchedAdmissionRequests.has(admission.requestDigest) ||
      !provider ||
      !model ||
      admission.request.repositoryCommit !== state.index.repositoryCommit ||
      !sameCanonicalJson(admission.request.providerConfiguration, provider) ||
      !sameCanonicalJson(admission.request.modelLineage, model) ||
      admission.request.qualificationCapabilityProfileId !==
        authority.qualificationCapabilityProfileId ||
      admission.request.qualificationCapabilityProfileDigest !==
        authority.qualificationCapabilityProfileDigest ||
      admission.request.capabilityId !== authority.capabilityId ||
      Date.parse(admission.request.minimumExpiresAt) <
        Date.parse(plan.expiresAt)
    ) {
      fail(
        'Evidence archive capability-probe admission drifted from its exact frozen target authority.'
      );
    }
    try {
      const decodedRequest =
        decodeAgentEvaluationCapabilityProbeAdmissionRequest(admission.request);
      const decodedResponse =
        decodeAgentEvaluationCapabilityProbeAdmissionResponse(
          admission.response,
          decodedRequest
        );
      const decodedReferences =
        decodeAgentEvaluationCapabilityProbeReferenceBundle(
          admission.referenceBundle,
          decodedRequest,
          decodedResponse.probeEvidence,
          decodedResponse.ownerImplementationDigest
        );
      if (
        !sameCanonicalJson(decodedRequest, admission.request) ||
        !sameCanonicalJson(decodedResponse, admission.response) ||
        !sameCanonicalJson(decodedReferences, admission.referenceBundle)
      ) {
        fail('Capability-probe canonical decoder projection drifted.');
      }
    } catch (caught) {
      fail(
        `Evidence archive capability-probe stage, acknowledgement, response, or reference authority is invalid: ${caught instanceof Error ? caught.message : 'unknown decoder failure'}.`
      );
    }
    const references =
      state.capabilityProbeReferences.get(admission.requestDigest) ?? [];
    if (
      references.length !==
        AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.referencesPerAdmission ||
      references.some(
        (reference, ordinal) =>
          !reference ||
          reference.ordinal !== ordinal ||
          reference.admissionRequestDigest !== admission.requestDigest ||
          !sameCanonicalJson(
            {
              kind: reference.kind,
              receipt: reference.receipt,
              receiptDigest: reference.receiptDigest,
            },
            admission.referenceBundle[ordinal]
          )
      )
    ) {
      fail(
        'Evidence archive capability-probe reference chain is missing or drifted from its admission.'
      );
    }
    matchedAdmissionRequests.add(admission.requestDigest);
    matchedAdmissionByTargetId.set(target.targetId, admission);
  }
  if (matchedAdmissionRequests.size !== state.capabilityProbeAdmissions.size) {
    fail('Evidence archive contains an unplanned capability-probe admission.');
  }

  const providerResourceTargets = qualifiedTargets.filter(
    ({ optionalCapabilitySupportAuthority }) =>
      optionalCapabilitySupportAuthority.probeProviderResourceAuthority !==
      undefined
  );
  if (
    (plan.plannedJourneyCount ===
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT &&
      providerResourceTargets.length !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount) ||
    state.capabilityProbeProviderResourceCleanups.size !==
      providerResourceTargets.length
  ) {
    fail(
      'Evidence archive capability-probe Provider resource cleanup denominator is incomplete.'
    );
  }
  const matchedResourceCleanupRequests = new Set();
  for (const target of providerResourceTargets) {
    const authority = target.optionalCapabilitySupportAuthority;
    const providerResourceAuthority = authority.probeProviderResourceAuthority;
    const deletionAuthorityReceipt =
      authority.probeProviderResourceDeletionAuthorityReceipt;
    const plannedCleanupReceipt = authority.probeProviderResourceCleanupReceipt;
    const admission = matchedAdmissionByTargetId.get(target.targetId);
    const requestDigest = deletionAuthorityReceipt?.requestDigest;
    const cleanupRecord = requestDigest
      ? state.capabilityProbeProviderResourceCleanups.get(requestDigest)
      : undefined;
    if (
      !providerResourceAuthority ||
      !deletionAuthorityReceipt ||
      !plannedCleanupReceipt ||
      !admission ||
      !requestDigest ||
      !cleanupRecord ||
      matchedResourceCleanupRequests.has(requestDigest) ||
      !sameCanonicalJson(
        admission.request.probeProviderResourceAuthority,
        providerResourceAuthority
      ) ||
      !sameCanonicalJson(
        cleanupRecord.deletionAuthorityReceipt,
        deletionAuthorityReceipt
      ) ||
      !sameCanonicalJson(cleanupRecord.cleanupReceipt, plannedCleanupReceipt)
    ) {
      fail(
        'Evidence archive capability-probe Provider resource cleanup drifted from its exact frozen target and admission authority.'
      );
    }
    assertG4ModelEvaluationCapabilityProbeProviderResourceCleanupBinding({
      cleanupRecord,
      providerResourceAuthority,
      probeProgram: authority.probeEvidence.probeProgram,
      probeObservedAt: authority.probeEvidence.receipt.probedAt,
      plannedAt: plan.plannedAt,
      repositoryCommit: state.index.repositoryCommit,
      ownerImplementationDigest: admission.response.ownerImplementationDigest,
    });
    matchedResourceCleanupRequests.add(requestDigest);
  }
  if (
    matchedResourceCleanupRequests.size !==
    state.capabilityProbeProviderResourceCleanups.size
  ) {
    fail(
      'Evidence archive contains an unplanned capability-probe Provider resource cleanup.'
    );
  }

  const runtimeAuthorities = qualifiedTargets
    .map(
      ({ optionalCapabilitySupportAuthority }) =>
        optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
    )
    .filter((authority) => authority !== undefined);
  const runtimeAuthorityByRegistration = new Map(
    runtimeAuthorities.map((authority) => [
      authority.registrationReceiptDigest,
      authority,
    ])
  );
  if (
    (plan.plannedJourneyCount ===
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT &&
      runtimeAuthorities.length !==
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount) ||
    runtimeAuthorityByRegistration.size !== runtimeAuthorities.length ||
    state.runtimeFactSourceRegistrations.size !== runtimeAuthorities.length
  ) {
    fail(
      'Evidence archive runtime-fact source registration denominator is incomplete.'
    );
  }
  for (const [
    registrationReceiptDigest,
    authority,
  ] of runtimeAuthorityByRegistration) {
    const registration = state.runtimeFactSourceRegistrations.get(
      registrationReceiptDigest
    );
    const request = registration?.request;
    const health = registration?.ownerHealth;
    const receipt = registration?.receipt;
    if (
      !registration ||
      !request ||
      !health ||
      !receipt ||
      request.repositoryCommit !== state.index.repositoryCommit ||
      request.sourceAuthorityKind !== authority.kind ||
      request.sourceKind !== authority.sourceKind ||
      request.sourceAuthorityId !== authority.sourceAuthorityId ||
      request.sourceAuthorityImplementationDigest !==
        authority.sourceAuthorityImplementationDigest ||
      request.routeBinding !== authority.routeBinding ||
      request.capabilityProfileId !== authority.capabilityProfileId ||
      request.capabilityProfileDigest !== authority.capabilityProfileDigest ||
      request.capabilityId !== authority.capabilityId ||
      request.protocolFamily !== authority.protocolFamily ||
      request.providerConfigurationId !== authority.providerConfigurationId ||
      request.modelId !== authority.modelId ||
      request.modelLineageDigest !== authority.modelLineageDigest ||
      request.adapterDigest !== authority.adapterDigest ||
      receipt.registrationAuthorityIssuerId !==
        authority.registrationAuthorityIssuerId ||
      receipt.registrationReceiptDigest !==
        authority.registrationReceiptDigest ||
      Date.parse(request.minimumExpiresAt) < Date.parse(plan.expiresAt) ||
      Date.parse(health.expiresAt) < Date.parse(plan.expiresAt) ||
      Date.parse(receipt.expiresAt) < Date.parse(plan.expiresAt)
    ) {
      fail(
        'Evidence archive runtime-fact source registration drifted from its exact frozen target authority.'
      );
    }
    try {
      const decodedRequest =
        decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(request);
      const decodedHealth = decodeAgentEvaluationRuntimeFactSourceOwnerHealth(
        health,
        decodedRequest
      );
      const decodedReceipt =
        decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt(
          receipt,
          decodedRequest
        );
      if (
        !sameCanonicalJson(decodedRequest, request) ||
        !sameCanonicalJson(decodedHealth, health) ||
        !sameCanonicalJson(decodedReceipt, receipt) ||
        decodedReceipt.ownerHealthDigest !== decodedHealth.healthDigest
      ) {
        fail('Runtime-fact source canonical decoder projection drifted.');
      }
    } catch (caught) {
      fail(
        `Evidence archive runtime-fact source health, stage, acknowledgement, or receipt authority is invalid: ${caught instanceof Error ? caught.message : 'unknown decoder failure'}.`
      );
    }
  }

  assertG4ModelEvaluationHostedRetrievalRuntimeResourceLifecycleJournalJoins(
    state
  );
  assertG4ModelEvaluationHostedRetrievalRuntimeResourceCleanupJoins(state);
  assertG4ModelEvaluationCapabilityEffectProviderRuntimeJournalJoins(state);
  assertG4ModelEvaluationOptionalCapabilityArchiveJoins(state);
};

export const assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings =
  (state, receipt) => {
    const descriptor = expectedDescriptorFor(state, receipt.attemptId);
    const target = descriptor
      ? state.singletons.plan.capabilityQualificationTargets.find(
          ({ targetId }) => targetId === descriptor.targetId
        )
      : undefined;
    const provider = target
      ? state.singletons.plan.providerConfigurations.find(
          ({ providerConfigurationId }) =>
            providerConfigurationId === target.providerConfigurationId
        )
      : undefined;
    const concreteCase = descriptor
      ? state.expectedCases.get(descriptor.caseId)
      : undefined;
    let resolvedCapabilityDescriptor;
    try {
      resolvedCapabilityDescriptor =
        concreteCase && target
          ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
          : undefined;
    } catch {
      resolvedCapabilityDescriptor = undefined;
    }
    const turnIdentity = `${receipt.attemptId}\u0000${receipt.turnIndex}\u0000${receipt.invocationId}`;
    const turn = state.invocationTurnBindings.get(turnIdentity);
    const intent = state.attemptDispatchIntents.get(
      receipt.dispatchIntentDigest
    );
    const transport = state.attemptTransports.get(
      receipt.transportReceiptDigest
    );
    const spool = state.attemptSpools.get(receipt.resultSpoolReceiptDigest);
    const optionalFactIdentity = optionalCapabilityFactIdentity(
      receipt.attemptId,
      receipt.turnIndex
    );
    const optionalFactSource =
      state.optionalCapabilityFactSources.get(optionalFactIdentity);
    const optionalFactAuthority =
      state.optionalCapabilityFactAuthorities.get(optionalFactIdentity);
    const optionalFactObservedFact = optionalFactSource
      ? isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
          optionalFactSource
        )
        ? optionalFactSource.bootstrapFact
        : optionalFactSource.effectSourceFact
      : undefined;
    let sharedFactCount = 0;
    const factAuthoritiesBound = receipt.facts.every((fact, index) => {
      const authority = receipt.factAuthorities[index];
      if (!authority) return false;
      if (authority.sourceAuthorityKind === 'shared-durable-capability') {
        sharedFactCount += 1;
        return (
          optionalFactSource?.sourceReceipt.outcome === 'observed' &&
          optionalFactAuthority?.sealedResponse.outcome === 'observed' &&
          sameCanonicalJson(fact, optionalFactObservedFact) &&
          sameCanonicalJson(fact, optionalFactAuthority.fact) &&
          sameCanonicalJson(authority, optionalFactAuthority.factAuthority)
        );
      }
      if (authority.sourceAuthorityKind !== 'native-provider-transport') {
        return false;
      }
      try {
        const runtimeEnvelope =
          createAgentEvaluationProviderCapabilityRuntimeFactEnvelope({
            sourceAuthorityKind: 'native-provider-transport',
            sourceAuthorityId: receipt.providerConfigurationId,
            sourceAuthorityImplementationDigest: receipt.adapterDigest,
            stageDigest: receipt.dispatchIntentDigest,
            dispatchAckDigest: receipt.transportReceiptDigest,
            planDigest: receipt.planDigest,
            repositoryCommit: receipt.repositoryCommit,
            attemptId: receipt.attemptId,
            descriptorDigest: receipt.descriptorDigest,
            turnIndex: receipt.turnIndex,
            invocationId: receipt.invocationId,
            requestDigest: receipt.requestDigest,
            responseDigest: receipt.responseDigest,
            protocolFamily: receipt.protocolFamily,
            providerConfigurationId: receipt.providerConfigurationId,
            modelLineageDigest: receipt.modelLineageDigest,
            adapterDigest: receipt.adapterDigest,
            dispatchIntentDigest: receipt.dispatchIntentDigest,
            transportReceiptDigest: receipt.transportReceiptDigest,
            resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
            normalizedEventSetDigest: receipt.normalizedEventSetDigest,
            observedAt: receipt.observedAt,
            fact,
          });
        const expectedAuthority =
          createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
            runtimeEnvelope
          );
        const {
          format: _format,
          version: _version,
          authorityDigest: _authorityDigest,
          ...binding
        } = expectedAuthority;
        return matchAgentEvaluationProviderCapabilityFactAuthorityBinding(
          authority,
          binding
        );
      } catch {
        return false;
      }
    });
    const runtimeFactSourceAuthority =
      target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    const optionalFactLifecycleBound = runtimeFactSourceAuthority
      ? target.optionalCapabilitySupportAuthority.supportExpectation ===
        'required'
        ? (optionalFactSource?.sourceReceipt.outcome === 'observed' &&
            optionalFactAuthority?.sealedResponse.outcome === 'observed' &&
            sharedFactCount === 1) ||
          (optionalFactSource !== undefined &&
            isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
              optionalFactSource
            ) &&
            optionalFactSource.sourceReceipt.outcome !== 'observed' &&
            optionalFactAuthority === undefined &&
            sharedFactCount === 0)
        : optionalFactSource === undefined &&
            optionalFactAuthority === undefined
          ? sharedFactCount === 0
          : optionalFactSource?.sourceReceipt.outcome !== 'observed' &&
            (isAgentEvaluationOptionalCapabilityNativeBootstrapFactSourceArchiveRecord(
              optionalFactSource
            )
              ? optionalFactAuthority === undefined
              : optionalFactAuthority?.sealedResponse.outcome !== 'observed') &&
            sharedFactCount === 0
      : optionalFactSource === undefined &&
        optionalFactAuthority === undefined &&
        sharedFactCount === 0;
    if (
      !descriptor ||
      !target ||
      !provider ||
      !resolvedCapabilityDescriptor ||
      !turn ||
      !intent ||
      !transport ||
      !spool ||
      turn.dispatchState !== 'dispatched' ||
      receipt.descriptorDigest !== descriptor.descriptorDigest ||
      receipt.protocolFamily !== target.protocolFamily ||
      receipt.protocolFamily !== provider.adapter.protocolFamily ||
      receipt.protocolFamily !== intent.protocolFamily ||
      receipt.protocolFamily !== transport.protocolFamily ||
      receipt.providerConfigurationId !== target.providerConfigurationId ||
      receipt.providerConfigurationId !== provider.providerConfigurationId ||
      receipt.providerConfigurationId !== intent.providerConfigurationId ||
      receipt.providerConfigurationId !== transport.providerConfigurationId ||
      receipt.modelLineageDigest !== target.modelLineageDigest ||
      receipt.modelLineageDigest !== intent.modelLineageDigest ||
      receipt.adapterDigest !== provider.adapter.adapterDigest ||
      receipt.requestDigest !== turn.requestArtifactDigest ||
      receipt.requestDigest !== intent.requestDigest ||
      receipt.requestDigest !== transport.requestDigest ||
      receipt.responseDigest !== turn.responseArtifactDigest ||
      receipt.responseDigest !== spool.responseDigest ||
      receipt.dispatchIntentDigest !== intent.intentDigest ||
      receipt.transportReceiptDigest !== transport.receiptDigest ||
      receipt.resultSpoolReceiptDigest !== spool.receiptDigest ||
      receipt.normalizedEventSetDigest !== spool.normalizedEventSetDigest ||
      !factAuthoritiesBound ||
      !optionalFactLifecycleBound ||
      !matchAgentEvaluationProviderCapabilityObservationFactPolicy(
        receipt,
        resolvedCapabilityDescriptor,
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority
      ) ||
      Date.parse(receipt.observedAt) < Date.parse(spool.createdAt)
    ) {
      fail(
        'Evidence archive provider capability observation drifted from its exact plan, dispatch, transport, encrypted spool, normalized fact policy, or timeline.'
      );
    }
    if (optionalFactSource !== undefined) {
      state.consumedOptionalCapabilityFacts.add(optionalFactIdentity);
    }
    return turnIdentity;
  };

const assertCapabilitySpecificImmediateBindings = (state, receipt) => {
  const descriptor = expectedDescriptorFor(state, receipt.attemptId);
  const concreteCase = state.expectedCases?.get(receipt.caseId);
  const target = descriptor
    ? state.singletons.plan?.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === descriptor.targetId
      )
    : undefined;
  let resolvedCapabilityDescriptor;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
  }
  const execution = state.capabilityExecutions.get(receipt.attemptId);
  const turn = state.invocationTurnBindings.get(
    `${receipt.attemptId}\u0000${receipt.turnIndex}\u0000${receipt.invocationId}`
  );
  const submission = state.resultSubmissions.get(receipt.attemptId);
  const runtime = state.controlledRuntimes.get(receipt.attemptId);
  const optionalFactSource = state.optionalCapabilityFactSources.get(
    optionalCapabilityFactIdentity(receipt.attemptId, receipt.turnIndex)
  );
  const effectPreIntent =
    optionalFactSource !== undefined &&
    isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(
      optionalFactSource
    )
      ? optionalFactSource.preEffectIntent
      : undefined;
  const authority = receipt.authority;
  const fact = authority.fact;
  const toolBound = receipt.toolId !== undefined;
  const materialBound =
    submission?.materialDigest === receipt.materialDigest ||
    runtime?.materialDigest === receipt.materialDigest ||
    authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial';
  const toolBinding = execution?.toolBindings.find(
    ({ toolId }) => toolId === receipt.toolId
  );
  let authorityBound = true;
  let ownerReceiptDigest;
  if (authority.authorityKind === 'controlled-tool-execution') {
    authorityBound =
      fact.planDigest === receipt.planDigest &&
      fact.attemptId === receipt.attemptId &&
      fact.descriptorDigest === receipt.descriptorDigest &&
      fact.caseId === receipt.caseId &&
      fact.materialDigest === receipt.materialDigest &&
      fact.turnIndex === receipt.turnIndex &&
      fact.toolId === receipt.toolId &&
      fact.toolCallId === receipt.toolCallId &&
      fact.resultDigest === receipt.resultDigest &&
      receipt.providerToolCallId === undefined;
  } else if (authority.authorityKind === 'controlled-continuation') {
    authorityBound =
      fact.planDigest === receipt.planDigest &&
      fact.attemptId === receipt.attemptId &&
      fact.descriptorDigest === receipt.descriptorDigest &&
      fact.caseId === receipt.caseId &&
      fact.materialDigest === receipt.materialDigest &&
      fact.completedTurnIndex === receipt.turnIndex &&
      fact.toolResultSetDigest === receipt.resultDigest &&
      receipt.toolId === undefined;
  } else if (authority.authorityKind === 'controlled-runtime') {
    authorityBound =
      runtime !== undefined &&
      fact.planDigest === runtime.planDigest &&
      fact.repositoryCommit === runtime.repositoryCommit &&
      fact.attemptId === runtime.attemptId &&
      fact.descriptorDigest === runtime.descriptorDigest &&
      fact.caseId === runtime.caseId &&
      fact.materialDigest === runtime.materialDigest &&
      fact.runtimeAuthorityId === runtime.runtimeAuthorityId &&
      fact.runtimeImplementationDigest ===
        runtime.runtimeImplementationDigest &&
      fact.verificationClosureDigest === runtime.verificationClosureDigest &&
      fact.verificationVerdict === runtime.verificationVerdict &&
      fact.toolExecutionReceiptSetDigest ===
        runtime.toolExecutionReceiptSetDigest &&
      fact.continuationReceiptSetDigest ===
        runtime.continuationReceiptSetDigest &&
      fact.ownerAuthoritySetDigest === runtime.ownerAuthoritySetDigest;
  } else if (authority.authorityKind === 'provider-job') {
    authorityBound =
      effectPreIntent !== undefined &&
      fact.invocationId ===
        effectPreIntent.inputAuthorityBinding.sourceInvocationId;
  } else if (authority.authorityKind === 'opaque-continuation') {
    authorityBound =
      effectPreIntent !== undefined &&
      fact.parentInvocationId === effectPreIntent.invocationId;
  } else if (authority.authorityKind === 'usage-vector') {
    const reportedUsage = turn?.invocationReceipt?.usage;
    authorityBound =
      reportedUsage !== undefined &&
      sameCanonicalJson(
        fact,
        createAgentUsageVector(
          reportedUsage.amounts.map(
            ({ sourceDigest: _sourceDigest, ...amount }) => amount
          )
        )
      );
  } else if (authority.authorityKind === 'retrieval-query') {
    authorityBound =
      fact.startedAt === receipt.startedAt &&
      fact.completedAt === receipt.completedAt;
  } else if (
    authority.authorityKind === 'parallel-tool-join' &&
    fact.resultDigest !== undefined
  ) {
    authorityBound = fact.resultDigest === receipt.resultDigest;
  } else if (
    authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial'
  ) {
    authorityBound = fact.observedAt === receipt.completedAt;
    const matchingOwners = (state.capabilityOwners.get(receipt.attemptId) ?? [])
      .filter(({ serviceKind }) => serviceKind === 'capability-runtime')
      .filter((owner) =>
        matchGuardedAgentEvaluationCapabilitySpecificOwnerAuthority(
          receipt,
          owner
        )
      );
    if (
      matchingOwners.length !== 1 ||
      (authority.authorityKind === 'terminal-normalization' &&
        !matchAgentEvaluationCapabilityTerminalAuthority(receipt, submission))
    ) {
      authorityBound = false;
    } else {
      ownerReceiptDigest = matchingOwners[0].receiptDigest;
    }
  }
  const terminalBound =
    toolBound || authority.authorityKind === 'controlled-continuation'
      ? true
      : turn?.terminal === true &&
        receipt.turnIndex === execution?.turnIndex &&
        receipt.invocationId === execution?.invocationId &&
        receipt.resultDigest === turn.responseArtifactDigest;
  if (
    !descriptor ||
    !concreteCase ||
    !target ||
    !resolvedCapabilityDescriptor ||
    !execution ||
    !turn ||
    receipt.planDigest !== state.index.planDigest ||
    receipt.repositoryCommit !== state.index.repositoryCommit ||
    receipt.descriptorDigest !== descriptor.descriptorDigest ||
    receipt.caseId !== descriptor.caseId ||
    receipt.capabilityDescriptorDigest !==
      descriptor.capabilityDescriptorDigest ||
    receipt.capabilityDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest ||
    receipt.requestDigest !== turn.requestArtifactDigest ||
    Date.parse(receipt.completedAt) > Date.parse(execution.observedAt) ||
    !materialBound ||
    !authorityBound ||
    !terminalBound ||
    (toolBound &&
      (!toolBinding ||
        receipt.toolCallId === undefined ||
        (authority.authorityKind === 'controlled-tool-execution'
          ? receipt.providerToolCallId !== undefined
          : receipt.providerToolCallId === undefined))) ||
    (!toolBound &&
      (receipt.toolCallId !== undefined ||
        receipt.providerToolCallId !== undefined))
  ) {
    const failedBindings = [
      ['descriptor', descriptor !== undefined],
      ['case', concreteCase !== undefined],
      ['target', target !== undefined],
      ['resolved-descriptor', resolvedCapabilityDescriptor !== undefined],
      ['execution', execution !== undefined],
      ['turn', turn !== undefined],
      ['plan', receipt.planDigest === state.index.planDigest],
      ['repository', receipt.repositoryCommit === state.index.repositoryCommit],
      [
        'descriptor-digest',
        receipt.descriptorDigest === descriptor?.descriptorDigest,
      ],
      ['case-id', receipt.caseId === descriptor?.caseId],
      [
        'descriptor-capability',
        receipt.capabilityDescriptorDigest ===
          descriptor?.capabilityDescriptorDigest,
      ],
      [
        'resolved-capability',
        receipt.capabilityDescriptorDigest ===
          resolvedCapabilityDescriptor?.descriptorDigest,
      ],
      ['request', receipt.requestDigest === turn?.requestArtifactDigest],
      [
        'timeline',
        execution !== undefined &&
          Date.parse(receipt.completedAt) <= Date.parse(execution.observedAt),
      ],
      ['material', materialBound],
      ['authority', authorityBound],
      ['terminal', terminalBound],
      [
        'tool-callback',
        toolBound
          ? toolBinding !== undefined &&
            receipt.toolCallId !== undefined &&
            (authority.authorityKind === 'controlled-tool-execution'
              ? receipt.providerToolCallId === undefined
              : receipt.providerToolCallId !== undefined)
          : receipt.toolCallId === undefined &&
            receipt.providerToolCallId === undefined,
      ],
    ]
      .filter(([, matches]) => !matches)
      .map(([name]) => name)
      .join(',');
    fail(
      `Evidence archive capability-specific fact drifted from its exact plan, descriptor, turn, tool callback, material, result, timeline, or authority (${receipt.receiptKind}; ${failedBindings}).`
    );
  }
  return ownerReceiptDigest;
};

const assertCommonRecordBindings = (state, family, value) => {
  if (
    Object.hasOwn(value, 'planDigest') &&
    value.planDigest !== state.index.planDigest
  ) {
    fail(`Evidence archive ${family} record drifted from planDigest.`);
  }
  if (
    Object.hasOwn(value, 'repositoryCommit') &&
    value.repositoryCommit !== state.index.repositoryCommit
  ) {
    fail(`Evidence archive ${family} record drifted from repositoryCommit.`);
  }
  const attemptId =
    value.attemptId ?? value.evaluationAttemptId ?? value.descriptor?.attemptId;
  const descriptorDigest =
    value.descriptorDigest ?? value.descriptor?.descriptorDigest;
  if (typeof attemptId === 'string' && descriptorDigest !== undefined) {
    const expected = expectedDescriptorFor(state, attemptId);
    if (!expected || expected.descriptorDigest !== descriptorDigest) {
      fail(
        `Evidence archive ${family} record drifted from its planned attempt descriptor.`
      );
    }
  }
};

export const assertG4ModelEvaluationFrozenRunConfigBinding = ({
  index,
  plan,
  runConfigArtifactBinding,
  configuration,
}) => {
  const pricingAuthorities = Object.values(configuration.pricingAuthorities);
  const pricingByProvider = new Map(
    pricingAuthorities.map((authority) => [
      authority.providerConfigurationId,
      authority,
    ])
  );
  if (
    configuration.purpose !== 'production' ||
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      runConfigArtifactBinding
    ) ||
    !sameCanonicalJson(
      runConfigArtifactBinding,
      index.runConfigArtifactBinding
    ) ||
    runConfigArtifactBinding.sourceConfigDigest !==
      configuration.sourceConfigDigest ||
    runConfigArtifactBinding.frozenRunDigest !==
      configuration.frozenRunDigest ||
    runConfigArtifactBinding.planDigest !== configuration.plan.planDigest ||
    runConfigArtifactBinding.repositoryCommit !==
      configuration.plan.repositoryCommit ||
    configuration.sourceConfigDigest !== index.sourceConfigDigest ||
    configuration.frozenRunDigest !== index.frozenRunDigest ||
    configuration.plan.planDigest !== index.planDigest ||
    configuration.plan.repositoryCommit !== index.repositoryCommit ||
    !sameCanonicalJson(configuration.plan, plan) ||
    pricingAuthorities.length !== plan.endpointSmokeTargets.length ||
    pricingByProvider.size !== plan.endpointSmokeTargets.length ||
    plan.endpointSmokeTargets.some((target) => {
      const authority = pricingByProvider.get(target.providerConfigurationId);
      return (
        !authority ||
        authority.authorityDigest !== target.pricingAuthorityDigest ||
        target.responseSpoolEncryptionPolicyDigest !==
          configuration.endpointSmokeResponseSpoolEncryption
            .encryptionPolicyDigest
      );
    })
  ) {
    fail(
      'Evidence archive frozen run configuration drifted from its signed artifact binding, digests, plan, pricing authorities, or endpoint-spool policy.'
    );
  }
  return configuration;
};

const assertSpoolReceiptMatchesProfile = (receipt, profile, label) => {
  if (
    receipt.encryptionProfileDigest !== profile.encryptionProfileDigest ||
    receipt.keyRefDigest !== profile.keyRefDigest ||
    receipt.keyId !== profile.keyId ||
    receipt.keyVersion !== profile.keyVersion ||
    receipt.retentionPolicyDigest !== profile.retention.retentionPolicyDigest
  ) {
    fail(`${label} drifted from the signed frozen run configuration.`);
  }
};

const assertSourceReceiptMatchesFrozenPricing = (state, receipt) => {
  const authority = Object.values(
    state.frozenRunConfig.pricingAuthorities
  ).find(
    (candidate) =>
      candidate.providerConfigurationId === receipt.providerConfigurationId
  );
  const target = state.frozenRunConfig.plan.endpointSmokeTargets.find(
    (candidate) =>
      candidate.providerConfigurationId === receipt.providerConfigurationId
  );
  if (
    !authority ||
    !target ||
    receipt.modelLineageDigest !== target.modelLineageDigest
  ) {
    fail(
      'Evidence archive source receipt references an unconfigured pricing authority or model lineage.'
    );
  }
  if (receipt.sourceKind === 'pricing-snapshot') {
    if (
      receipt.sourceReceiptId !==
        createAgentEvaluationPlanPricingSourceReceiptId({
          planDigest: state.index.planDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          pricingAuthorityDigest: target.pricingAuthorityDigest,
          pricingSnapshotDigest: authority.snapshot.snapshotDigest,
        }) ||
      receipt.sourceUri !== authority.source.sourceUri ||
      receipt.observedAt !== authority.source.observedAt ||
      !sameCanonicalJson(receipt.pricingSnapshot, authority.snapshot)
    ) {
      fail(
        'Evidence archive pricing-snapshot receipt drifted from the frozen pricing authority.'
      );
    }
    state.pricingSnapshotDigests.add(receipt.pricingSnapshot.snapshotDigest);
    state.pricingSnapshotReceiptCounts.set(
      receipt.pricingSnapshot.snapshotDigest,
      (state.pricingSnapshotReceiptCounts.get(
        receipt.pricingSnapshot.snapshotDigest
      ) ?? 0) + 1
    );
  } else if (receipt.sourceKind === 'cost-calculation') {
    if (!sameCanonicalJson(receipt.pricingSnapshot, authority.snapshot)) {
      fail(
        'Evidence archive cost-calculation receipt drifted from the frozen pricing snapshot.'
      );
    }
    state.referencedPricingSnapshotDigests.add(
      receipt.pricingSnapshot.snapshotDigest
    );
  }
};

const assertPlan = async (state, value) => {
  const issues = validateAgentModelEvaluationPlan(value);
  if (
    issues.length > 0 ||
    value.planDigest !== state.index.planDigest ||
    value.repositoryCommit !== state.index.repositoryCommit
  ) {
    fail(
      'Evidence archive plan singleton is invalid or cross-bound incorrectly.'
    );
  }
  const descriptors = planAgentModelEvaluationAttempts(value);
  const byAttempt = new Map(
    descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  if (byAttempt.size !== descriptors.length) {
    fail('Evidence archive plan produced duplicate attempt descriptors.');
  }
  state.expectedDescriptors = byAttempt;
  state.expectedCases = new Map(
    value.concreteCases.map((concreteCase) => [
      concreteCase.caseId,
      concreteCase,
    ])
  );
  if (typeof state.resolveFrozenRunConfig !== 'function') {
    fail('Evidence archive frozen run configuration resolver is required.');
  }
  const resolved = await state.resolveFrozenRunConfig({
    index: state.index,
    plan: value,
  });
  if (
    !resolved ||
    typeof resolved !== 'object' ||
    !Object.hasOwn(resolved, 'configuration') ||
    !Object.hasOwn(resolved, 'runConfigArtifactBinding')
  ) {
    fail(
      'Evidence archive frozen run configuration resolver did not return its exact artifact binding.'
    );
  }
  state.frozenRunConfig = assertG4ModelEvaluationFrozenRunConfigBinding({
    index: state.index,
    plan: value,
    runConfigArtifactBinding: resolved.runConfigArtifactBinding,
    configuration: resolved.configuration,
  });
};

const assertInvocationTurn = (state, value) => {
  const prior = state.invocationTurns.get(value.attemptId) ?? {
    nextTurnIndex: 0,
    digests: [],
  };
  if (value.turnIndex !== prior.nextTurnIndex) {
    fail('Evidence archive invocation turns contain a duplicate or gap.');
  }
  prior.nextTurnIndex += 1;
  prior.digests.push(value.evidenceDigest);
  state.invocationTurns.set(value.attemptId, prior);
  const identity = `${value.attemptId}\u0000${value.turnIndex}\u0000${value.invocationId}`;
  if (state.invocationTurnBindings.has(identity)) {
    fail('Evidence archive invocation-turn binding is duplicated.');
  }
  state.invocationTurnBindings.set(
    identity,
    Object.freeze({
      turnIndex: value.turnIndex,
      invocationId: value.invocationId,
      evidenceDigest: value.evidenceDigest,
      requestArtifactDigest: value.requestArtifactDigest,
      responseArtifactDigest: value.responseArtifactDigest,
      dispatchIntentDigest: value.dispatchIntentDigest,
      transportReceiptDigest: value.transportReceiptDigest,
      providerResultSpoolReceiptDigest: value.providerResultSpoolReceiptDigest,
      terminal: value.terminal,
      status: value.status,
      dispatchState: value.dispatchState,
      invocationReceipt: value.invocationReceipt,
      resultSubmissionReceiptDigest: value.resultSubmissionReceiptDigest,
      controlledRuntimeReceiptDigest: value.controlledRuntimeReceiptDigest,
    })
  );
};

const assertInvocationTurnSet = (state, value) => {
  if (state.invocationTurnSetAttemptIds.has(value.attemptId)) {
    fail('Evidence archive invocation-turn-set identity is duplicated.');
  }
  const turns = state.invocationTurns.get(value.attemptId);
  if (
    !turns ||
    canonicalJsonText(turns.digests) !==
      canonicalJsonText(value.turnReceiptDigests)
  ) {
    fail(
      'Evidence archive invocation-turn-set does not bind exact turn receipts.'
    );
  }
  state.invocationTurnSetAttemptIds.add(value.attemptId);
  state.invocationTurnSets.set(
    value.attemptId,
    Object.freeze({
      receiptDigest: value.receiptDigest,
      turnReceiptDigests: Object.freeze([...value.turnReceiptDigests]),
    })
  );
};

const recordTransportIdentities = (identities, value, label) => {
  const values = [
    `invocation:${value.invocationId}`,
    `receipt-id:${value.receiptId}`,
    `receipt-digest:${value.receiptDigest}`,
  ];
  if (values.some((identity) => identities.has(identity))) {
    fail(`${label} identity is duplicated.`);
  }
  values.forEach((identity) => identities.add(identity));
};

const processSemanticRecord = async (state, family, value) => {
  if (family === 'plan') {
    await assertPlan(state, value);
  } else {
    const guard = recordGuardByFamily[family];
    if (typeof guard !== 'function' || !guard(value)) {
      fail(`Evidence archive ${family} contains an invalid domain record.`);
    }
  }
  if (!state.expectedDescriptors && family !== 'plan') {
    fail('Evidence archive families were observed before the plan singleton.');
  }
  assertCommonRecordBindings(state, family, value);
  if (singletonFamilies.has(family)) state.singletons[family] = value;
  recordGlobalReceiptIdentity(state, family, value);

  switch (family) {
    case 'capabilityProbeAdmissions':
      if (state.capabilityProbeAdmissions.has(value.requestDigest)) {
        fail('Evidence archive capability-probe admission is duplicated.');
      }
      state.capabilityProbeAdmissions.set(
        value.requestDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'capabilityProbeProviderResourceCleanups':
      if (
        state.capabilityProbeProviderResourceCleanups.has(
          value.resourceRegistrationRequestDigest
        )
      ) {
        fail(
          'Evidence archive capability-probe Provider resource cleanup is duplicated.'
        );
      }
      state.capabilityProbeProviderResourceCleanups.set(
        value.resourceRegistrationRequestDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'capabilityProbeReferenceReceipts': {
      const references =
        state.capabilityProbeReferences.get(value.admissionRequestDigest) ?? [];
      if (references[value.ordinal] !== undefined) {
        fail('Evidence archive capability-probe reference is duplicated.');
      }
      references[value.ordinal] = Object.freeze({ ...value });
      state.capabilityProbeReferences.set(
        value.admissionRequestDigest,
        references
      );
      break;
    }
    case 'runtimeFactSourceOwnerRegistrations':
      if (
        state.runtimeFactSourceRegistrations.has(
          value.registrationReceiptDigest
        )
      ) {
        fail(
          'Evidence archive runtime-fact source registration is duplicated.'
        );
      }
      state.runtimeFactSourceRegistrations.set(
        value.registrationReceiptDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'hostedRetrievalRuntimeResourceLifecycleJournals':
      if (
        state.hostedRetrievalRuntimeResourceLifecycleJournals.has(
          value.archiveRecordDigest
        )
      ) {
        fail(
          'Evidence archive hosted retrieval runtime resource lifecycle journal is duplicated.'
        );
      }
      state.hostedRetrievalRuntimeResourceLifecycleJournals.set(
        value.archiveRecordDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'hostedRetrievalRuntimeResourceCleanups':
      if (
        state.hostedRetrievalRuntimeResourceCleanups.has(value.authorityDigest)
      ) {
        fail(
          'Evidence archive hosted retrieval runtime resource cleanup authority is duplicated.'
        );
      }
      state.hostedRetrievalRuntimeResourceCleanups.set(
        value.authorityDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'capabilityEffectProviderRuntimeJournals':
      if (
        state.capabilityEffectProviderRuntimeJournals.has(
          value.ownerRequestDigest
        )
      ) {
        fail(
          'Evidence archive capability-effect Provider runtime journal is duplicated.'
        );
      }
      state.capabilityEffectProviderRuntimeJournals.set(
        value.ownerRequestDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'optionalCapabilityFactSources': {
      const identity = `${value.attemptId}\u0000${value.turnIndex}`;
      if (state.optionalCapabilityFactSources.has(identity)) {
        fail('Evidence archive optional-capability fact source is duplicated.');
      }
      state.optionalCapabilityFactSources.set(
        identity,
        Object.freeze({ ...value })
      );
      break;
    }
    case 'optionalCapabilityFactAuthorities': {
      const identity = `${value.attemptId}\u0000${value.turnIndex}`;
      if (state.optionalCapabilityFactAuthorities.has(identity)) {
        fail(
          'Evidence archive optional-capability fact authority is duplicated.'
        );
      }
      state.optionalCapabilityFactAuthorities.set(
        identity,
        Object.freeze({ ...value })
      );
      break;
    }
    case 'endpointSmokeDispatchIntents':
      state.endpointSmokeIntents.push(value);
      break;
    case 'endpointSmokeTransportReceipts':
      recordTransportIdentities(
        state.endpointSmokeTransportIdentities,
        value,
        'Endpoint-smoke transport receipt'
      );
      state.endpointSmokeTransports.push(value);
      break;
    case 'endpointSmokeResultSpoolReceipts':
      assertSpoolReceiptMatchesProfile(
        value,
        state.frozenRunConfig.endpointSmokeResponseSpoolEncryption,
        'Endpoint-smoke result-spool receipt'
      );
      state.endpointSmokeSpools.push(value);
      break;
    case 'endpointSmokeResultSpoolDispositionReceipts':
      state.endpointSmokeDispositions.push(value);
      break;
    case 'endpointSmokeValidationFailureReceipts':
      state.endpointSmokeValidationFailures.push(value);
      break;
    case 'endpointSmokeReceipts':
      state.endpointSmokeReceipts.push(value);
      break;
    case 'preDispatchFailureReceipts':
      if (state.preDispatchAttemptIds.has(value.attemptId)) {
        fail('Evidence archive pre-dispatch attempt identity is duplicated.');
      }
      state.preDispatchAttemptIds.add(value.attemptId);
      break;
    case 'invocationTurnReceipts':
      assertInvocationTurn(state, value);
      break;
    case 'invocationTurnSetReceipts':
      assertInvocationTurnSet(state, value);
      break;
    case 'transportDispatchIntents':
      if (state.attemptDispatchIntents.has(value.intentDigest)) {
        fail('Evidence archive attempt dispatch intent digest is duplicated.');
      }
      state.attemptDispatchIntents.set(
        value.intentDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'transportReceipts':
      recordTransportIdentities(
        state.attemptTransportIdentities,
        value,
        'Attempt transport receipt'
      );
      if (state.attemptTransports.has(value.receiptDigest)) {
        fail('Evidence archive attempt transport digest is duplicated.');
      }
      state.attemptTransports.set(
        value.receiptDigest,
        Object.freeze({ ...value })
      );
      break;
    case 'providerResultSpoolReceipts':
      assertSpoolReceiptMatchesProfile(
        value,
        state.frozenRunConfig.responseSpoolEncryption,
        'Provider result-spool receipt'
      );
      if (state.attemptSpools.has(value.receiptDigest)) {
        fail('Evidence archive provider result-spool digest is duplicated.');
      }
      state.attemptSpools.set(value.receiptDigest, Object.freeze({ ...value }));
      break;
    case 'resultSubmissionReceipts':
      setUniqueAttemptValue(
        state.resultSubmissions,
        value.attemptId,
        Object.freeze({
          receiptDigest: value.receiptDigest,
          invocationId: value.invocationId,
          caseId: value.caseId,
          materialDigest: value.materialDigest,
          terminalEventDigest: value.terminalEventDigest,
        }),
        'Evidence archive result-submission receipt'
      );
      break;
    case 'attemptAuthorityOwnerReceipts': {
      if (state.ownerReceiptDigests.has(value.receiptDigest)) {
        fail('Evidence archive attempt-authority owner digest is duplicated.');
      }
      if (state.ownerRequestDigests.has(value.requestDigest)) {
        fail('Evidence archive attempt-authority owner request is duplicated.');
      }
      state.ownerReceiptDigests.add(value.receiptDigest);
      state.ownerRequestDigests.add(value.requestDigest);
      pushBoundedAttemptValue(
        state.capabilityOwners,
        value.attemptId,
        Object.freeze({
          serviceKind: value.serviceKind,
          operation: value.operation,
          namespaceId: value.namespaceId,
          planDigest: value.planDigest,
          repositoryCommit: value.repositoryCommit,
          attemptId: value.attemptId,
          descriptorDigest: value.descriptorDigest,
          shardLeaseOwnerId: value.shardLeaseOwnerId,
          shardLeaseGeneration: value.shardLeaseGeneration,
          verificationGrantGeneration: value.verificationGrantGeneration,
          verificationAttemptGrantReceiptSetDigest:
            value.verificationAttemptGrantReceiptSetDigest,
          requestDigest: value.requestDigest,
          responseProjection: value.responseProjection,
          responseDigest: value.responseDigest,
          ownerImplementationDigest: value.ownerImplementationDigest,
          completedAt: value.completedAt,
          receiptDigest: value.receiptDigest,
        }),
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT,
        'Evidence archive attempt-authority owner family'
      );
      break;
    }
    case 'verificationAttemptGrantReceipts':
      pushBoundedAttemptValue(
        state.verificationGrants,
        value.evaluationAttemptId,
        Object.freeze({
          namespaceId: value.namespaceId,
          generation: value.generation,
          cellId: value.cellId,
          grantId: value.grant.grantId,
          receiptDigest: value.receiptDigest,
        }),
        8,
        'Evidence archive verification-attempt grant family'
      );
      break;
    case 'controlledRuntimeReceipts':
      setUniqueAttemptValue(
        state.controlledRuntimes,
        value.attemptId,
        Object.freeze({
          receiptDigest: value.receiptDigest,
          planDigest: value.planDigest,
          repositoryCommit: value.repositoryCommit,
          attemptId: value.attemptId,
          descriptorDigest: value.descriptorDigest,
          caseId: value.caseId,
          materialDigest: value.materialDigest,
          runtimeAuthorityId: value.runtimeAuthorityId,
          runtimeImplementationDigest: value.runtimeImplementationDigest,
          verificationClosureDigest:
            value.g3Verification.verificationClosureDigest,
          verificationVerdict: value.g3Verification.verdict,
          toolExecutionReceiptSetDigest: value.toolExecutionReceiptSetDigest,
          continuationReceiptSetDigest: value.continuationReceiptSetDigest,
          ownerAuthoritySetDigest: value.ownerAuthoritySetDigest,
        }),
        'Evidence archive controlled-runtime receipt'
      );
      break;
    case 'capabilityExecutionReceipts':
      setUniqueAttemptValue(
        state.capabilityExecutions,
        value.attemptId,
        Object.freeze({ ...value }),
        'Evidence archive capability-execution receipt'
      );
      break;
    case 'capabilitySpecificReceipts': {
      const ownerReceiptDigest = assertCapabilitySpecificImmediateBindings(
        state,
        value
      );
      pushBoundedAttemptValue(
        state.capabilitySpecifics,
        value.attemptId,
        compactCapabilitySpecific(value, ownerReceiptDigest),
        AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT,
        'Evidence archive capability-specific receipt family'
      );
      break;
    }
    case 'providerCapabilityObservationReceipts': {
      if (
        state.providerCapabilityObservationIds.has(
          value.observationReceiptId
        ) ||
        state.providerCapabilityObservations.has(value.receiptDigest)
      ) {
        fail(
          'Evidence archive provider capability observation identity is duplicated.'
        );
      }
      const turnIdentity =
        assertG4ModelEvaluationProviderCapabilityObservationImmediateBindings(
          state,
          value
        );
      if (state.providerCapabilityObservationTurns.has(turnIdentity)) {
        fail(
          'Evidence archive provider capability observation turn is duplicated.'
        );
      }
      state.providerCapabilityObservationIds.add(value.observationReceiptId);
      state.providerCapabilityObservationTurns.add(turnIdentity);
      state.providerCapabilityObservations.set(
        value.receiptDigest,
        compactProviderCapabilityObservation(value)
      );
      break;
    }
    case 'sourceReceipts':
      assertSourceReceiptMatchesFrozenPricing(state, value);
      break;
    case 'attempts':
      if (state.attemptIds.has(value.descriptor.attemptId)) {
        fail('Evidence archive attempt identity is duplicated.');
      }
      state.attemptIds.add(value.descriptor.attemptId);
      state.attempts.set(
        value.descriptor.attemptId,
        Object.freeze({
          descriptor: value.descriptor,
          invocationTurnSetReceiptDigest: value.invocationTurnSetReceiptDigest,
          capabilityExecutionReceiptSetDigest:
            value.capabilityExecutionReceiptSetDigest,
          verificationAttemptGrantReceiptSetDigest:
            value.verificationAttemptGrantReceiptSetDigest,
          status: value.status,
          metricObservations: Object.freeze([...value.metricObservations]),
          startedAt: value.startedAt,
          completedAt: value.completedAt,
          attemptDigest: value.attemptDigest,
        })
      );
      if (state.reviewCandidateAttemptIds.has(value.descriptor.attemptId)) {
        state.reviewedAttempts.set(value.descriptor.attemptId, value);
      }
      break;
    case 'executionReceipts':
      if (state.executionAttemptIds.has(value.attemptId)) {
        fail('Evidence archive execution-receipt identity is duplicated.');
      }
      state.executionAttemptIds.add(value.attemptId);
      state.executionMeasurements.set(
        value.attemptId,
        Object.freeze({ ...value })
      );
      break;
    case 'reviewCandidateRefs':
      if (state.reviewCandidateAttemptIds.has(value.attemptId)) {
        fail('Evidence archive review-candidate attempt is duplicated.');
      }
      state.reviewCandidateAttemptIds.add(value.attemptId);
      if (state.reviewCandidateAttemptIds.size > 18) {
        fail(
          'Evidence archive review-candidate set exceeds its bounded sample.'
        );
      }
      break;
    case 'checkpoints':
      state.checkpoints.set(
        value.checkpointDigest,
        Object.freeze({
          checkpointDigest: value.checkpointDigest,
          shardId: value.shardId,
          leaseOwnerId: value.leaseOwnerId,
          leaseGeneration: value.leaseGeneration,
          state: value.state,
          updatedAt: value.updatedAt,
          completedAttemptIds: new Set(
            value.completedAttemptRefs.map(({ attemptId }) => attemptId)
          ),
          missingAttemptIds: new Set(
            value.missingAttemptRefs.map(({ attemptId }) => attemptId)
          ),
        })
      );
      break;
    case 'validatedHumanReviewArtifacts': {
      if (state.validatedHumanReviewArtifact !== undefined) {
        fail('Evidence archive validated human-review artifact is duplicated.');
      }
      const authority = await state.humanReviewVerifier.verify({
        plan: state.singletons.plan,
        artifact: value.reviewArtifact,
      });
      if (!authority) {
        fail(
          'Evidence archive validated human-review artifact has an invalid imported signature.'
        );
      }
      if (
        !sameCanonicalJson(authority.publicRubrics, value.publicRubrics) ||
        !sameCanonicalJson(authority.trustRegistry, value.trustRegistry) ||
        !sameCanonicalJson(
          authority.adjudicationPolicy,
          value.adjudicationPolicy
        ) ||
        authority.randomizedPresentationPolicyDigest !==
          value.reviewArtifact.randomizedPresentationPolicyDigest
      ) {
        fail(
          'Evidence archive validated human-review artifact drifted from frozen trust or rubric authority.'
        );
      }
      state.validatedHumanReviewArtifacts.push(
        Object.freeze({
          reviewLeaseDigest: value.reviewLeaseDigest,
          humanReviewReportDigest: value.humanReviewReportDigest,
          validatedAt: value.validatedAt,
        })
      );
      state.validatedHumanReviewArtifact = value;
      break;
    }
    case 'validatedHumanMetricObservations':
      if (
        state.validatedHumanMetricObservations.length >=
        18 *
          state.singletons.plan.thresholds.metrics.filter(
            ({ requiredAuthority }) => requiredAuthority === 'human'
          ).length
      ) {
        fail(
          'Evidence archive validated human metric family exceeds its bounded review sample.'
        );
      }
      state.validatedHumanMetricObservations.push(value);
      break;
    default:
      break;
  }
};

const uniqueMap = (values, identity, label) => {
  const entries = new Map();
  for (const value of values) {
    const key = identity(value);
    if (entries.has(key)) fail(`${label} identity is duplicated.`);
    entries.set(key, value);
  }
  return entries;
};

export const assertG4ModelEvaluationEndpointSmokeDenominator = ({
  targets,
  receipts,
}) => {
  if (!qualifiesAgentEvaluationEndpointSmokeSet(targets, receipts)) {
    fail(
      'Endpoint-smoke release qualification requires exactly five planned targets and five passing receipts.'
    );
  }
};

const assertEndpointSmokeJoins = (state) => {
  const targets = state.singletons.plan.endpointSmokeTargets;
  assertG4ModelEvaluationEndpointSmokeDenominator({
    targets,
    receipts: state.endpointSmokeReceipts,
  });
  if (state.endpointSmokeValidationFailures.length !== 0) {
    fail(
      'Passing endpoint-smoke release evidence forbids validation failures.'
    );
  }
  const intentsByTarget = uniqueMap(
    state.endpointSmokeIntents,
    ({ smokeTargetId }) => smokeTargetId,
    'Endpoint-smoke dispatch intent'
  );
  const transportsByInvocation = uniqueMap(
    state.endpointSmokeTransports,
    ({ invocationId }) => invocationId,
    'Endpoint-smoke transport receipt'
  );
  const spoolsByInvocation = uniqueMap(
    state.endpointSmokeSpools,
    ({ invocationId }) => invocationId,
    'Endpoint-smoke result-spool receipt'
  );
  const dispositionsBySpool = uniqueMap(
    state.endpointSmokeDispositions,
    ({ spoolRef }) => spoolRef,
    'Endpoint-smoke result-spool disposition receipt'
  );
  const receiptsByTarget = uniqueMap(
    state.endpointSmokeReceipts,
    ({ smokeTargetId }) => smokeTargetId,
    'Endpoint-smoke final receipt'
  );
  if (
    [
      intentsByTarget,
      transportsByInvocation,
      spoolsByInvocation,
      dispositionsBySpool,
      receiptsByTarget,
    ].some((values) => values.size !== targets.length)
  ) {
    fail('Endpoint-smoke evidence chain has missing or extra records.');
  }
  for (const target of targets) {
    const intent = intentsByTarget.get(target.smokeTargetId);
    if (!intent) fail('Endpoint-smoke dispatch intent is missing.');
    const transport = transportsByInvocation.get(intent.invocationId);
    const spool = spoolsByInvocation.get(intent.invocationId);
    const disposition = spool
      ? dispositionsBySpool.get(spool.spoolRef)
      : undefined;
    const receipt = receiptsByTarget.get(target.smokeTargetId);
    if (
      !transport ||
      !spool ||
      !disposition ||
      !receipt ||
      receipt.outcome !== 'passed' ||
      !matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: state.index.planDigest,
        repositoryCommit: state.index.repositoryCommit,
        target,
        intent,
        transport,
        spool,
        disposition,
        receipt,
      })
    ) {
      fail('Endpoint-smoke evidence chain cross-binding drifted.');
    }
  }
  if (
    [...state.endpointSmokeTransportIdentities].some((identity) =>
      state.attemptTransportIdentities.has(identity)
    )
  ) {
    fail('Endpoint-smoke and attempt transport identities overlap.');
  }
};

const canonicalCapabilitySpecificProjection = (specifics) =>
  specifics
    .map(({ receiptKind, receiptDigest }) => ({ receiptKind, receiptDigest }))
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
        compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
    );

const verificationGrantSetDigestFor = (grants) => {
  const ordered = [...grants].sort(
    (left, right) =>
      compareUnicodeCodePoints(left.cellId, right.cellId) ||
      compareUnicodeCodePoints(left.grantId, right.grantId)
  );
  return digestAgentCanonicalValue({
    verificationAttemptGrantReceiptDigests: ordered.map(
      ({ receiptDigest }) => receiptDigest
    ),
  });
};

const ownerProjectionContainsSpecific = (owner, specific) =>
  owner.responseProjection.specificReceiptDigests.some(
    ({ receiptKind, receiptDigest }) =>
      receiptKind === specific.receiptKind &&
      receiptDigest === specific.receiptDigest
  );

const assertCustomCapabilityOwnerFact = ({
  state,
  owner,
  specific,
  execution,
}) => {
  const fact = specific.ownerFact;
  if (!fact) return;
  if (
    specific.ownerReceiptDigest !== owner.receiptDigest ||
    !ownerProjectionContainsSpecific(owner, specific)
  ) {
    fail(
      'Evidence archive capability custom fact drifted from its exact owner request, implementation, response projection, or result.'
    );
  }
  if (fact.authorityKind === 'terminal-normalization') {
    return;
  }
  if (fact.authorityKind === 'capability-denial') {
    if (fact.policyDigest !== execution.policyDigest) {
      fail(
        'Evidence archive capability-denial fact drifted from the frozen capability policy.'
      );
    }
    return;
  }
  if (fact.category === 'budget-reservation-receipt') {
    const reservation = state.singletons.budgetLedger.reservations.find(
      ({ reservationId }) => reservationId === fact.reservationId
    );
    const expectedStatus = reservation?.settlement?.requiresReconciliation
      ? 'reconciled'
      : 'settled';
    if (
      reservation?.status !== 'settled' ||
      reservation.demandDigest !== fact.demandDigest ||
      reservation.settlement?.settlementDigest !== fact.settlementDigest ||
      fact.reservationStatus !== expectedStatus
    ) {
      fail(
        'Evidence archive capability budget fact drifted from the settled budget ledger authority.'
      );
    }
    return;
  }
  if (fact.category === 'checkpoint-resume-receipt') {
    const checkpoint = state.checkpoints.get(fact.checkpointDigest);
    if (
      !checkpoint ||
      checkpoint.leaseOwnerId !== owner.shardLeaseOwnerId ||
      checkpoint.leaseGeneration !== fact.toGeneration ||
      fact.toGeneration !== owner.shardLeaseGeneration ||
      (!checkpoint.completedAttemptIds.has(specific.attemptId) &&
        !checkpoint.missingAttemptIds.has(specific.attemptId))
    ) {
      fail(
        'Evidence archive checkpoint-resume fact drifted from the durable checkpoint generation.'
      );
    }
    return;
  }
  if (
    fact.category === 'cancellation-receipt' ||
    fact.category === 'late-callback-rejection-receipt' ||
    fact.category === 'late-output-fence-receipt' ||
    fact.category === 'lease-fence-receipt' ||
    fact.category === 'state-fence-receipt' ||
    fact.category === 'timeout-receipt'
  ) {
    if (
      fact.shardLeaseOwnerId !== owner.shardLeaseOwnerId ||
      fact.shardLeaseGeneration !== owner.shardLeaseGeneration
    ) {
      fail(
        'Evidence archive capability temporal-fence fact drifted from the durable owner lease.'
      );
    }
  }
};

const assertProviderCapabilitySpecificObservation = (state, specific) => {
  const projection = specific.providerObservationProjection;
  if (projection === undefined) return;
  const observation = state.providerCapabilityObservations.get(
    projection.providerCapabilityObservationReceiptDigest
  );
  if (
    !observation ||
    !matchAgentEvaluationCapabilitySpecificProviderObservationProjection(
      projection,
      observation
    )
  ) {
    fail(
      'Evidence archive provider capability-specific fact is synthetic, missing, or drifted from its exact frozen observation authority.'
    );
  }
};

const assertCapabilityExecutionJoin = (state, attempt) => {
  const attemptId = attempt.descriptor.attemptId;
  const execution = state.capabilityExecutions.get(attemptId);
  const specifics = state.capabilitySpecifics.get(attemptId) ?? [];
  const owners = state.capabilityOwners.get(attemptId) ?? [];
  const capabilityOwners = owners.filter(
    ({ serviceKind }) => serviceKind === 'capability-runtime'
  );
  const grants = state.verificationGrants.get(attemptId) ?? [];
  const expectedGrantSetDigest = verificationGrantSetDigestFor(grants);
  const concreteCase = state.expectedCases.get(attempt.descriptor.caseId);
  const target = state.singletons.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === attempt.descriptor.targetId
  );
  let resolvedCapabilityDescriptor;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
  }
  if (!execution || !concreteCase || !target || !resolvedCapabilityDescriptor) {
    fail(
      'Evidence archive attempt is missing its exact capability execution authority.'
    );
  }
  const expectedSpecificProjection =
    canonicalCapabilitySpecificProjection(specifics);
  const expectedOwnerDigests = capabilityOwners
    .map(({ receiptDigest }) => receiptDigest)
    .sort(compareUnicodeCodePoints);
  if (
    execution.planDigest !== state.index.planDigest ||
    execution.repositoryCommit !== state.index.repositoryCommit ||
    execution.descriptorDigest !== attempt.descriptor.descriptorDigest ||
    execution.caseId !== attempt.descriptor.caseId ||
    execution.capabilityDescriptorDigest !==
      attempt.descriptor.capabilityDescriptorDigest ||
    execution.capabilityDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest ||
    !sameCanonicalJson(
      execution.specificReceiptDigests,
      expectedSpecificProjection
    ) ||
    !sameCanonicalJson(
      execution.attemptAuthorityOwnerReceiptDigests,
      expectedOwnerDigests
    ) ||
    Date.parse(execution.observedAt) > Date.parse(attempt.completedAt) ||
    specifics.some(
      (specific) =>
        Date.parse(specific.startedAt) < Date.parse(attempt.startedAt) ||
        Date.parse(specific.completedAt) > Date.parse(attempt.completedAt) ||
        Date.parse(specific.completedAt) > Date.parse(execution.observedAt)
    ) ||
    capabilityOwners.some(
      (owner) =>
        owner.planDigest !== state.index.planDigest ||
        owner.repositoryCommit !== state.index.repositoryCommit ||
        owner.descriptorDigest !== attempt.descriptor.descriptorDigest ||
        owner.verificationAttemptGrantReceiptSetDigest !==
          expectedGrantSetDigest ||
        !grants.some(
          (grant) =>
            grant.generation === owner.verificationGrantGeneration &&
            grant.namespaceId === owner.namespaceId
        ) ||
        Date.parse(owner.completedAt) > Date.parse(execution.observedAt)
    )
  ) {
    fail(
      'Evidence archive capability execution, specific facts, owners, grants, or timeline drifted.'
    );
  }
  if (capabilityOwners.length === 0) {
    if (
      !state.preDispatchAttemptIds.has(attemptId) ||
      execution.outcome !== 'failed' ||
      specifics.length !== 0 ||
      execution.attemptAuthorityOwnerReceiptDigests.length !== 0
    ) {
      fail(
        'Evidence archive ownerless capability execution is not an exact pre-dispatch failure.'
      );
    }
  } else {
    const assessmentOwners = capabilityOwners.filter(
      ({ operation }) => operation === 'assess-capability'
    );
    const executeOwners = capabilityOwners.filter(
      ({ operation }) => operation === 'execute-tool'
    );
    const assessmentOwner = assessmentOwners[0];
    const terminalTurn = state.invocationTurnBindings.get(
      `${attemptId}\u0000${execution.turnIndex}\u0000${execution.invocationId}`
    );
    const materialDigest =
      state.controlledRuntimes.get(attemptId)?.materialDigest ??
      state.resultSubmissions.get(attemptId)?.materialDigest ??
      specifics[0]?.materialDigest;
    if (
      assessmentOwners.length !== 1 ||
      !assessmentOwner ||
      !terminalTurn?.terminal ||
      !terminalTurn.invocationReceipt ||
      materialDigest === undefined ||
      Date.parse(terminalTurn.invocationReceipt.completedAt) >
        Date.parse(assessmentOwner.completedAt) ||
      specifics.some(
        ({ completedAt }) =>
          Date.parse(completedAt) > Date.parse(assessmentOwner.completedAt)
      ) ||
      !sameCanonicalJson(assessmentOwner.responseProjection, {
        serviceKind: 'capability-runtime',
        operation: 'assess-capability',
        terminalTurnIndex: execution.turnIndex,
        terminalInvocationId: execution.invocationId,
        materialDigest,
        capabilityDescriptorDigest: execution.capabilityDescriptorDigest,
        outcome: execution.outcome,
        specificReceiptDigests: expectedSpecificProjection,
      })
    ) {
      fail(
        'Evidence archive capability assessment owner drifted from its terminal turn, material, outcome, or exact fact set.'
      );
    }
    const executeSpecificDigests = [];
    const executeCallIdentities = new Set();
    for (const owner of executeOwners) {
      const projection = owner.responseProjection;
      if (projection.operation !== 'execute-tool') {
        fail(
          'Evidence archive capability execute owner has an invalid operation.'
        );
      }
      const callIdentity = `${projection.invocationId}\u0000${projection.turnIndex}\u0000${projection.toolCallId}\u0000${projection.providerToolCallId}`;
      if (executeCallIdentities.has(callIdentity)) {
        fail(
          'Evidence archive capability execute call identity is duplicated.'
        );
      }
      executeCallIdentities.add(callIdentity);
      const turn = state.invocationTurnBindings.get(
        `${attemptId}\u0000${projection.turnIndex}\u0000${projection.invocationId}`
      );
      const exactSpecifics = specifics.filter(
        (specific) =>
          specific.turnIndex === projection.turnIndex &&
          specific.invocationId === projection.invocationId &&
          specific.toolId === projection.toolId &&
          specific.toolCallId === projection.toolCallId &&
          specific.providerToolCallId === projection.providerToolCallId &&
          specific.requestDigest === projection.providerRequestDigest &&
          specific.resultDigest === projection.resultDigest
      );
      const sharedEffect =
        projection.executionAuthorityKind === 'shared-effect';
      const sharedSource = sharedEffect
        ? state.optionalCapabilityFactSources.get(
            optionalCapabilityFactIdentity(attemptId, projection.turnIndex)
          )
        : undefined;
      const sharedAuthority = sharedEffect
        ? state.optionalCapabilityFactAuthorities.get(
            optionalCapabilityFactIdentity(attemptId, projection.turnIndex)
          )
        : undefined;
      if (
        turn?.requestArtifactDigest !== projection.providerRequestDigest ||
        !execution.toolBindings.some(
          ({ toolId }) => toolId === projection.toolId
        ) ||
        exactSpecifics.some(
          ({ completedAt }) =>
            Date.parse(completedAt) > Date.parse(owner.completedAt)
        ) ||
        (sharedEffect
          ? projection.specificReceiptDigests.length !== 0 ||
            !sharedSource ||
            !isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(
              sharedSource
            ) ||
            !sharedAuthority ||
            projection.preEffectIntentDigest !==
              sharedSource.preEffectIntent.intentDigest ||
            projection.effectSourceReceiptDigest !==
              sharedSource.effectSourceReceipt.receiptDigest ||
            projection.effectSourceFactDigest !==
              sharedSource.sourceReceipt.effectSourceFactDigest ||
            sharedSource.sourceReceipt.ownerRequestDigest !==
              owner.requestDigest ||
            sharedSource.sourceReceipt.ownerReceiptDigest !==
              owner.receiptDigest
          : !sameCanonicalJson(
              projection.specificReceiptDigests,
              canonicalCapabilitySpecificProjection(exactSpecifics)
            ))
      ) {
        fail(
          'Evidence archive capability execute owner drifted from its per-call turn, result, timeline, or exact fact subset.'
        );
      }
      executeSpecificDigests.push(
        ...(sharedEffect
          ? exactSpecifics.map(({ receiptDigest }) => receiptDigest)
          : projection.specificReceiptDigests.map(
              ({ receiptDigest }) => receiptDigest
            ))
      );
    }
    const observedProviderSpecificDigests = specifics
      .filter(({ providerToolCallId }) => providerToolCallId !== undefined)
      .map(({ receiptDigest }) => receiptDigest)
      .sort(compareUnicodeCodePoints);
    executeSpecificDigests.sort(compareUnicodeCodePoints);
    if (
      !sameCanonicalJson(
        executeSpecificDigests,
        observedProviderSpecificDigests
      )
    ) {
      fail(
        'Evidence archive capability execute owners do not cover the exact provider-tool fact set.'
      );
    }
    for (const specific of specifics) {
      const owner = specific.ownerFact
        ? capabilityOwners.find(
            ({ receiptDigest }) => receiptDigest === specific.ownerReceiptDigest
          )
        : specific.providerToolCallId === undefined
          ? assessmentOwner
          : executeOwners.find((candidate) => {
              const projection = candidate.responseProjection;
              if (projection.executionAuthorityKind !== 'shared-effect') {
                return ownerProjectionContainsSpecific(candidate, specific);
              }
              const source = state.optionalCapabilityFactSources.get(
                optionalCapabilityFactIdentity(
                  specific.attemptId,
                  specific.turnIndex
                )
              );
              return (
                isAgentEvaluationOptionalCapabilityEffectFactSourceArchiveRecord(
                  source
                ) &&
                projection.invocationId === specific.invocationId &&
                projection.turnIndex === specific.turnIndex &&
                projection.toolId === specific.toolId &&
                projection.toolCallId === specific.toolCallId &&
                projection.providerToolCallId === specific.providerToolCallId &&
                projection.providerRequestDigest === specific.requestDigest &&
                projection.resultDigest === specific.resultDigest &&
                projection.preEffectIntentDigest ===
                  source.preEffectIntent.intentDigest &&
                projection.effectSourceReceiptDigest ===
                  source.effectSourceReceipt.receiptDigest
              );
            });
      if (!owner) {
        fail(
          'Evidence archive capability-specific fact is orphaned from its owner response.'
        );
      }
      assertProviderCapabilitySpecificObservation(state, specific);
      assertCustomCapabilityOwnerFact({ state, owner, specific, execution });
    }
  }
  const receiptKinds = expectedSpecificProjection.map(
    ({ receiptKind }) => receiptKind
  );
  if (
    (execution.outcome === 'supported' &&
      execution.supportExpectation === 'required' &&
      !sameCanonicalJson(receiptKinds, execution.expectedReceiptKinds)) ||
    (execution.outcome === 'unsupported' &&
      execution.supportExpectation === 'expected-blocked' &&
      (execution.verdict !== 'passed' ||
        !receiptKinds.some((kind) =>
          [
            'capability-unavailable-receipt',
            'authority-denial-receipt',
          ].includes(kind)
        ))) ||
    (execution.outcome === 'failed' &&
      receiptKinds.some(
        (kind) => !execution.expectedReceiptKinds.includes(kind)
      ))
  ) {
    fail('Evidence archive capability branch semantics drifted.');
  }
  const runtime = state.controlledRuntimes.get(attemptId);
  const controlledToolFactDigests = specifics
    .filter(
      ({ authorityKind }) => authorityKind === 'controlled-tool-execution'
    )
    .map(({ authorityFactDigest }) => authorityFactDigest)
    .sort(compareUnicodeCodePoints);
  const controlledContinuationFactDigests = specifics
    .filter(({ authorityKind }) => authorityKind === 'controlled-continuation')
    .map(({ authorityFactDigest }) => authorityFactDigest)
    .sort(compareUnicodeCodePoints);
  if (
    (controlledToolFactDigests.length > 0 &&
      runtime?.toolExecutionReceiptSetDigest !==
        digestAgentCanonicalValue({
          toolReceiptDigests: controlledToolFactDigests,
        })) ||
    (controlledContinuationFactDigests.length > 0 &&
      runtime?.continuationReceiptSetDigest !==
        digestAgentCanonicalValue({
          continuationReceiptDigests: controlledContinuationFactDigests,
        }))
  ) {
    fail(
      'Evidence archive controlled capability leaf set drifted from runtime authority.'
    );
  }
  return execution;
};

const assertAttemptGradingOwnerJoin = (state, attempt, execution) => {
  const attemptId = attempt.descriptor.attemptId;
  const owners = state.capabilityOwners.get(attemptId) ?? [];
  const gradingOwners = owners.filter(
    ({ serviceKind }) => serviceKind === 'attempt-grading'
  );
  const preDispatch = state.preDispatchAttemptIds.has(attemptId);
  if (gradingOwners.length !== (preDispatch ? 0 : 1)) {
    fail(
      'Evidence archive attempt grading requires one exact owner after dispatch and none before dispatch.'
    );
  }
  if (preDispatch) return;
  const owner = gradingOwners[0];
  const turnSet = state.invocationTurnSets.get(attemptId);
  const terminalTurns = [...state.invocationTurnBindings.entries()]
    .filter(
      ([identity, turn]) =>
        identity.startsWith(`${attemptId}\u0000`) && turn.terminal
    )
    .map(([, turn]) => turn);
  const terminalTurn = terminalTurns[0];
  const executionMeasurement = state.executionMeasurements.get(attemptId);
  const resultSubmission = state.resultSubmissions.get(attemptId);
  const controlledRuntime = state.controlledRuntimes.get(attemptId);
  const grants = state.verificationGrants.get(attemptId) ?? [];
  const verificationGrantSetDigest = verificationGrantSetDigestFor(grants);
  if (
    !owner ||
    owner.operation !== 'grade-and-persist' ||
    owner.responseProjection.operation !== 'grade-and-persist' ||
    !turnSet ||
    terminalTurns.length !== 1 ||
    !terminalTurn ||
    !executionMeasurement
  ) {
    fail('Evidence archive attempt grading authority is incomplete.');
  }
  let gradingDigest;
  try {
    gradingDigest = digestAgentEvaluationAttemptGrading({
      descriptorDigest: attempt.descriptor.descriptorDigest,
      invocationTurnSetReceiptDigest: turnSet.receiptDigest,
      terminalTurnReceiptDigest: terminalTurn.evidenceDigest,
      capabilityExecutionReceiptDigest: execution.receiptDigest,
      ...(resultSubmission
        ? { resultSubmissionReceiptDigest: resultSubmission.receiptDigest }
        : {}),
      ...(controlledRuntime
        ? { controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest }
        : {}),
      metricObservations: attempt.metricObservations,
      execution: {
        modelInvocations: executionMeasurement.modelInvocations,
        toolCalls: executionMeasurement.toolCalls,
        repairRounds: executionMeasurement.repairRounds,
        transactions: executionMeasurement.transactions,
        artifactBytes: executionMeasurement.artifactBytes,
        capabilityExecutionReceiptSetDigest:
          executionMeasurement.capabilityExecutionReceiptSetDigest,
        verificationAttemptGrantReceiptSetDigest:
          executionMeasurement.verificationAttemptGrantReceiptSetDigest,
        ...(executionMeasurement.toolReceiptSetDigest
          ? { toolReceiptSetDigest: executionMeasurement.toolReceiptSetDigest }
          : {}),
        ...(executionMeasurement.transactionReceiptSetDigest
          ? {
              transactionReceiptSetDigest:
                executionMeasurement.transactionReceiptSetDigest,
            }
          : {}),
        ...(executionMeasurement.verificationClosureDigest
          ? {
              verificationClosureDigest:
                executionMeasurement.verificationClosureDigest,
            }
          : {}),
      },
    });
  } catch {
    fail('Evidence archive attempt grading preimage is invalid.');
  }
  const observationDigests = attempt.metricObservations
    .map(({ observationDigest }) => observationDigest)
    .sort(compareUnicodeCodePoints);
  if (
    owner.planDigest !== state.index.planDigest ||
    owner.repositoryCommit !== state.index.repositoryCommit ||
    owner.descriptorDigest !== attempt.descriptor.descriptorDigest ||
    owner.verificationAttemptGrantReceiptSetDigest !==
      verificationGrantSetDigest ||
    !grants.some(
      (grant) =>
        grant.generation === owner.verificationGrantGeneration &&
        grant.namespaceId === owner.namespaceId
    ) ||
    turnSet.receiptDigest !== attempt.invocationTurnSetReceiptDigest ||
    executionMeasurement.capabilityExecutionReceiptSetDigest !==
      attempt.capabilityExecutionReceiptSetDigest ||
    executionMeasurement.capabilityExecutionReceiptSetDigest !==
      digestAgentEvaluationCapabilityExecutionReceiptSet([execution]) ||
    executionMeasurement.verificationAttemptGrantReceiptSetDigest !==
      attempt.verificationAttemptGrantReceiptSetDigest ||
    executionMeasurement.verificationAttemptGrantReceiptSetDigest !==
      verificationGrantSetDigest ||
    terminalTurn.resultSubmissionReceiptDigest !==
      resultSubmission?.receiptDigest ||
    terminalTurn.controlledRuntimeReceiptDigest !==
      controlledRuntime?.receiptDigest ||
    (terminalTurn.invocationReceipt &&
      Date.parse(owner.completedAt) <
        Date.parse(terminalTurn.invocationReceipt.completedAt)) ||
    Date.parse(owner.completedAt) > Date.parse(attempt.completedAt) ||
    !sameCanonicalJson(owner.responseProjection, {
      serviceKind: 'attempt-grading',
      operation: 'grade-and-persist',
      gradingDigest,
      observationDigests,
    })
  ) {
    fail(
      'Evidence archive attempt-grading owner drifted from its exact turn, capability, result/runtime, observation, execution, grant, or timeline preimage.'
    );
  }
};

export const assertG4ModelEvaluationCapabilityArchiveJoins = (state) => {
  for (const attempt of state.attempts.values()) {
    const execution = assertCapabilityExecutionJoin(state, attempt);
    assertAttemptGradingOwnerJoin(state, attempt, execution);
  }
  for (const attemptId of state.capabilitySpecifics.keys()) {
    if (!state.attempts.has(attemptId)) {
      fail('Evidence archive capability-specific fact is orphaned.');
    }
  }
  for (const [attemptId, owners] of state.capabilityOwners.entries()) {
    if (
      !state.attempts.has(attemptId) ||
      (owners.some(({ serviceKind }) => serviceKind === 'capability-runtime') &&
        !state.capabilityExecutions.has(attemptId))
    ) {
      fail('Evidence archive attempt-authority owner receipt is orphaned.');
    }
  }
  return Object.freeze({
    attempts: state.attempts.size,
    invocationTurns: state.invocationTurnBindings.size,
    capabilityOwners: state.ownerReceiptDigests.size,
    capabilityExecutions: state.capabilityExecutions.size,
    capabilitySpecifics: [...state.capabilitySpecifics.values()].reduce(
      (total, values) => total + values.length,
      0
    ),
    reviewedAttempts: state.reviewedAttempts.size,
  });
};

const assertAuthorityBindings = (state, now) => {
  const authority = state.singletons.authorityAttestation;
  const manifest = state.singletons.manifest;
  const authorityRootKeys = Object.keys(state.index.authorityRoots);
  const archiveOnlyAuthorityRootKeys = authorityRootKeys.filter(
    (key) => !Object.hasOwn(authority, key)
  );
  archiveOnlyAuthorityRootKeys.sort(compareUnicodeCodePoints);
  const expectedArchiveOnlyAuthorityRootKeys = [
    'capabilityProbeProviderResourceCleanupSetDigest',
    'hostedRetrievalRuntimeResourceCleanupSetDigest',
    'capabilityEffectProviderRuntimeJournalSetDigest',
  ].sort(compareUnicodeCodePoints);
  const authorityRoots = Object.fromEntries(
    authorityRootKeys
      .filter((key) => Object.hasOwn(authority, key))
      .map((key) => [key, authority[key]])
  );
  const indexModelAuthorityRoots = Object.fromEntries(
    Object.keys(authorityRoots).map((key) => [
      key,
      state.index.authorityRoots[key],
    ])
  );
  if (
    !sameCanonicalJson(
      archiveOnlyAuthorityRootKeys,
      expectedArchiveOnlyAuthorityRootKeys
    ) ||
    canonicalJsonText(authorityRoots) !==
      canonicalJsonText(indexModelAuthorityRoots) ||
    authority.planDigest !== state.index.planDigest ||
    authority.repositoryCommit !== state.index.repositoryCommit ||
    authority.evidenceSetDigest !== state.index.evidenceSetDigest ||
    authority.attestedPayloadDigest !== state.index.authorityPayloadDigest ||
    authority.attestationDigest !== state.index.authorityAttestationDigest ||
    authority.reviewLeaseDigest !== state.index.reviewLeaseDigest ||
    manifest.manifestDigest !== state.index.evaluationManifestDigest ||
    Date.parse(authority.issuedAt) < Date.parse(manifest.completedAt) ||
    Date.parse(authority.issuedAt) > Date.parse(now)
  ) {
    fail('Evidence archive semantic authority bindings drifted.');
  }
};

export const assertG4ModelEvaluationEvidenceReviewLeaseBinding = ({
  index,
  authorityAttestation,
  manifest,
  humanReviewReport,
  validatedHumanReviewArtifacts,
  validatedHumanMetricObservations,
}) => {
  const required = manifest.humanReviewReportDigest !== undefined;
  const artifact = validatedHumanReviewArtifacts[0];
  const indexLease = index.reviewLeaseDigest;
  if (
    validatedHumanReviewArtifacts.length !== (required ? 1 : 0) ||
    (required
      ? validatedHumanMetricObservations.length === 0
      : validatedHumanMetricObservations.length !== 0) ||
    Object.hasOwn(index, 'reviewLeaseDigest') !== required ||
    Object.hasOwn(index.authorityRoots, 'reviewLeaseDigest') !== required ||
    Object.hasOwn(authorityAttestation, 'reviewLeaseDigest') !== required ||
    index.authorityRoots.reviewLeaseDigest !== indexLease ||
    authorityAttestation.reviewLeaseDigest !== indexLease ||
    (required &&
      (!artifact ||
        manifest.humanReviewReportDigest !== humanReviewReport.reportDigest ||
        artifact.humanReviewReportDigest !== humanReviewReport.reportDigest ||
        artifact.reviewLeaseDigest !== indexLease ||
        Date.parse(artifact.validatedAt) > Date.parse(manifest.completedAt)))
  ) {
    fail(
      'Evidence archive human-review lease is missing, unexpected, or cross-bound incorrectly.'
    );
  }
  return indexLease;
};

const finalizeSemanticState = (state, now) => {
  const {
    plan,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    authorityAttestation,
    manifest,
  } = state.singletons;
  if (
    !plan ||
    !metricReport ||
    !graderReport ||
    !humanReviewReport ||
    !holdoutExecutionReceipt ||
    !authorityAttestation ||
    !manifest
  ) {
    fail('Evidence archive is missing a required singleton.');
  }
  const configuredPricingSnapshotDigests = new Set(
    Object.values(state.frozenRunConfig.pricingAuthorities).map(
      ({ snapshot }) => snapshot.snapshotDigest
    )
  );
  if (
    configuredPricingSnapshotDigests.size !== 5 ||
    state.pricingSnapshotDigests.size !== 5 ||
    [...configuredPricingSnapshotDigests].some(
      (digest) =>
        !state.pricingSnapshotDigests.has(digest) ||
        state.pricingSnapshotReceiptCounts.get(digest) !== 1
    ) ||
    [...state.referencedPricingSnapshotDigests].some(
      (digest) => !state.pricingSnapshotDigests.has(digest)
    )
  ) {
    fail(
      'Evidence archive pricing-snapshot and cost-calculation sources do not join the five frozen pricing authorities.'
    );
  }
  assertQualificationAuthorityArchiveJoins(state);
  assertEndpointSmokeJoins(state);
  assertG4ModelEvaluationEvidenceReviewLeaseBinding({
    index: state.index,
    authorityAttestation,
    manifest,
    humanReviewReport,
    validatedHumanReviewArtifacts: state.validatedHumanReviewArtifacts,
    validatedHumanMetricObservations: state.validatedHumanMetricObservations,
  });
  const humanReviewRequired = manifest.humanReviewReportDigest !== undefined;
  const validatedArtifact = state.validatedHumanReviewArtifact;
  const validatedHumanMetricObservations =
    state.validatedHumanMetricObservations;
  const ratedAttemptIds = new Set(
    humanReviewReport.ratings.map(({ attemptId }) => attemptId)
  );
  if (
    humanReviewRequired &&
    (!validatedArtifact ||
      ratedAttemptIds.size !== state.reviewCandidateAttemptIds.size ||
      state.reviewedAttempts.size !== state.reviewCandidateAttemptIds.size ||
      [...ratedAttemptIds].some(
        (attemptId) =>
          !state.reviewCandidateAttemptIds.has(attemptId) ||
          !state.reviewedAttempts.has(attemptId)
      ))
  ) {
    fail(
      'Evidence archive human-review report does not bind the exact bounded review-candidate attempt set.'
    );
  }
  const expectedHumanMetricObservations = humanReviewRequired
    ? createAgentEvaluationValidatedHumanMetricObservations({
        plan,
        attempts: [...state.reviewedAttempts.values()],
        humanReviewReport,
        validatedHumanReviewArtifact: validatedArtifact,
      })
    : Object.freeze([]);
  if (
    !sameCanonicalJson(
      validatedHumanMetricObservations,
      expectedHumanMetricObservations
    )
  ) {
    fail(
      'Evidence archive human metric observations drifted from signed criterion authority.'
    );
  }
  const capabilityState = assertG4ModelEvaluationCapabilityArchiveJoins(state);
  const expectedAttemptCount = plan.plannedJourneyCount;
  const maximumTurnsPerAttempt =
    state.frozenRunConfig.controlledRuntime.loop.maximumTurnsPerAttempt;
  if (
    state.attemptIds.size !== expectedAttemptCount ||
    state.executionAttemptIds.size !== expectedAttemptCount ||
    state.invocationTurnSetAttemptIds.size !== expectedAttemptCount ||
    [...state.expectedDescriptors.keys()].some(
      (attemptId) =>
        !state.attemptIds.has(attemptId) ||
        !state.executionAttemptIds.has(attemptId) ||
        !state.invocationTurnSetAttemptIds.has(attemptId)
    )
  ) {
    fail(
      'Evidence archive attempt denominator or execution joins are incomplete.'
    );
  }
  if (
    capabilityState.attempts !== expectedAttemptCount ||
    capabilityState.capabilityExecutions !== expectedAttemptCount ||
    capabilityState.invocationTurns >
      expectedAttemptCount * maximumTurnsPerAttempt ||
    capabilityState.capabilitySpecifics >
      expectedAttemptCount *
        AGENT_EVALUATION_CANONICAL_MAXIMUM_CAPABILITY_SPECIFIC_RECEIPT_KINDS_PER_ATTEMPT ||
    capabilityState.capabilityOwners >
      expectedAttemptCount *
        AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_MAXIMUM_RECEIPTS_PER_ATTEMPT ||
    capabilityState.reviewedAttempts > 18 ||
    state.globalReceiptIdentities.size >
      expectedAttemptCount * (maximumTurnsPerAttempt * 4 + 8) + 100
  ) {
    fail(
      'Evidence archive compact semantic state exceeds the frozen denominator memory bounds.'
    );
  }
  if (
    expectedAttemptCount !==
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT ||
    metricReport.slices.some(({ thresholdSatisfied }) => !thresholdSatisfied) ||
    graderReport.selfJudgeOnlyAttemptIds.length > 0 ||
    humanReviewReport.ratings.some(({ verdict }) => verdict !== 'passed') ||
    holdoutExecutionReceipt.leakedCaseIds.length > 0 ||
    manifest.outcome !== 'satisfied' ||
    manifest.missingOrInfrastructureAttemptRefs.length > 0 ||
    manifest.metricReportDigest !== metricReport.reportDigest ||
    manifest.graderReportDigest !== graderReport.reportDigest ||
    (humanReviewRequired &&
      manifest.humanReviewReportDigest !== humanReviewReport.reportDigest) ||
    manifest.holdoutExecutionReceiptDigest !==
      holdoutExecutionReceipt.receiptDigest ||
    Date.parse(manifest.expiresAt) <= Date.parse(now)
  ) {
    fail(
      'Evidence archive release qualification is incomplete or unsatisfied.'
    );
  }
  assertAuthorityBindings(state, now);
  return Object.freeze({
    plan,
    budgetLedger: state.singletons.budgetLedger,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    authorityAttestation,
    manifest,
  });
};

export const assertG4ModelEvaluationEvidenceRoot = (
  root,
  index,
  evidenceIndexArtifactBytes
) => {
  if (!isAgentModelEvaluationEvidenceRoot(root)) {
    fail('Real-model evidence root v2 has an invalid exact shape.');
  }
  let expected;
  try {
    expected = createAgentModelEvaluationEvidenceRoot({
      index,
      evidenceIndexArtifactBytes,
      archiveAttestation: root.archiveAttestation,
    });
  } catch {
    fail(
      'Real-model evidence root does not bind the exact semantic index and raw index artifact.'
    );
  }
  if (canonicalJsonText(root) !== canonicalJsonText(expected)) {
    fail(
      'Real-model evidence root does not bind the exact semantic index and raw index artifact.'
    );
  }
  return root;
};

const assertExactArchiveDirectory = async (archivePath, index) => {
  await assertStableDirectory(archivePath, 'Real-model evidence archive');
  const archiveEntries = await readdir(archivePath, { withFileTypes: true });
  const entryNames = archiveEntries
    .map(({ name }) => name)
    .sort(compareUnicodeCodePoints);
  const expectedEntries = [
    AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
    AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
  ].sort(compareUnicodeCodePoints);
  if (canonicalJsonText(entryNames) !== canonicalJsonText(expectedEntries)) {
    fail('Real-model evidence archive has missing or unexpected entries.');
  }
  const shardDirectoryPath = join(
    archivePath,
    AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME
  );
  await assertStableDirectory(
    shardDirectoryPath,
    'Real-model evidence shard directory'
  );
  const shardEntries = await readdir(shardDirectoryPath, {
    withFileTypes: true,
  });
  if (shardEntries.some((entry) => entry.isSymbolicLink() || !entry.isFile())) {
    fail('Real-model evidence shards must be regular non-symbolic-link files.');
  }
  const actualNames = shardEntries
    .map(({ name }) => name)
    .sort(compareUnicodeCodePoints);
  const expectedNames = index.shards
    .map(({ fileName }) => fileName)
    .sort(compareUnicodeCodePoints);
  if (
    actualNames.length !== new Set(actualNames).size ||
    canonicalJsonText(actualNames) !== canonicalJsonText(expectedNames)
  ) {
    fail(
      'Real-model evidence shard set is missing, duplicated, or unexpected.'
    );
  }
  return shardDirectoryPath;
};

const assertCanonicalShardBytes = (bytes, label, canarySignatures) => {
  if (
    bytes.byteLength < 1 ||
    bytes.at(-1) !== 0x0a ||
    bytes.includes(0x0d) ||
    (bytes.byteLength >= 3 &&
      bytes[0] === 0xef &&
      bytes[1] === 0xbb &&
      bytes[2] === 0xbf)
  ) {
    fail(`${label} must contain BOM-free LF-terminated canonical NDJSON.`);
  }
  const text = decodeUtf8(bytes, label);
  assertRawArtifactHasNoCanary(text, canarySignatures, label);
  const lines = text.slice(0, -1).split('\n');
  if (lines.length < 1 || lines.some((line) => line.length === 0)) {
    fail(`${label} contains an empty or malformed NDJSON record.`);
  }
  return lines;
};

const verifyArchiveShards = async ({
  archivePath,
  index,
  canarySignatures: signatures,
  humanReviewVerifier,
  resolveFrozenRunConfig,
  observationSanitization,
  now,
  indexBytes,
  rootBytes,
}) => {
  const shardDirectoryPath = await assertExactArchiveDirectory(
    archivePath,
    index
  );
  const state = createSemanticState(
    index,
    humanReviewVerifier,
    resolveFrozenRunConfig,
    observationSanitization
  );
  let observedTotalShardBytes = 0;
  const physicalFamilyUsages = [];
  for (const summary of index.families) {
    const familyShards = index.shards.filter(
      ({ family }) => family === summary.family
    );
    const familyRecordSet =
      createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
    const familySemantic =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        summary.family
      );
    const semanticRecordIdentities = new Set();
    let observedRecordCount = 0;
    let observedCanonicalValueBytes = 0;
    const physicalUsageAccumulator =
      createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator(
        summary.family
      );
    let previousOrderKey = null;
    let firstOrderKey = null;
    for (const descriptor of familyShards) {
      const shardPath = resolve(shardDirectoryPath, descriptor.fileName);
      const displacement = relative(shardDirectoryPath, shardPath);
      if (
        !displacement ||
        displacement === '..' ||
        displacement.startsWith(`..${sep}`) ||
        displacement.includes(sep)
      ) {
        fail('Real-model evidence shard path escaped its fixed directory.');
      }
      const label = `Real-model evidence shard ${descriptor.fileName}`;
      const bytes = await readStableRegularFile(
        shardPath,
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes,
        label
      );
      if (
        bytes.byteLength !== descriptor.byteSize ||
        digestAgentCanonicalBytes(bytes) !== descriptor.bytesDigest
      ) {
        fail(`${label} raw bytes drifted from its descriptor.`);
      }
      observedTotalShardBytes += bytes.byteLength;
      const lines = assertCanonicalShardBytes(bytes, label, signatures);
      if (lines.length !== descriptor.recordCount) {
        fail(`${label} record count drifted from its descriptor.`);
      }
      const shardRecordSet =
        createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
      let shardFirstOrderKey = null;
      let shardLastOrderKey = null;
      for (const line of lines) {
        const record = decodeAgentModelEvaluationEvidenceArchiveRecordLine(
          `${line}\n`
        );
        if (
          record.family !== summary.family ||
          record.recordIndex !== observedRecordCount ||
          (previousOrderKey !== null &&
            compareUnicodeCodePoints(previousOrderKey, record.orderKey) >= 0)
        ) {
          fail(
            `${label} contains a swapped, duplicate, missing, or out-of-order record.`
          );
        }
        try {
          physicalUsageAccumulator.append(record);
        } catch (caught) {
          fail(
            `${label} physical NDJSON accounting failed: ${caught instanceof Error ? caught.message : 'unknown record capacity failure'}.`
          );
        }
        const semanticValue =
          projectAgentModelEvaluationEvidenceArchiveSemanticValue(
            summary.family,
            record.value
          );
        const semanticIdentity = canonicalJsonText(semanticValue);
        if (semanticRecordIdentities.has(semanticIdentity)) {
          fail(`${label} contains a duplicate semantic record digest.`);
        }
        semanticRecordIdentities.add(semanticIdentity);
        shardFirstOrderKey ??= record.orderKey;
        firstOrderKey ??= record.orderKey;
        shardLastOrderKey = record.orderKey;
        previousOrderKey = record.orderKey;
        observedRecordCount += 1;
        observedCanonicalValueBytes += Buffer.byteLength(
          canonicalJsonText(record.value),
          'utf8'
        );
        if (!Number.isSafeInteger(observedCanonicalValueBytes)) {
          fail(`${label} canonical value byte count overflowed.`);
        }
        shardRecordSet.append(record.recordDigest);
        familyRecordSet.append(record.recordDigest);
        familySemantic.append(record.value);
        await processSemanticRecord(state, summary.family, record.value);
      }
      if (
        shardFirstOrderKey !== descriptor.firstOrderKey ||
        shardLastOrderKey !== descriptor.lastOrderKey ||
        shardRecordSet.finalize() !== descriptor.recordSetDigest
      ) {
        fail(`${label} ordered record commitment drifted from its descriptor.`);
      }
    }
    if (
      observedRecordCount !== summary.recordCount ||
      familyRecordSet.finalize() !== summary.recordSetDigest ||
      familySemantic.finalize() !== summary.semanticDigest ||
      firstOrderKey !== summary.firstOrderKey ||
      previousOrderKey !== summary.lastOrderKey
    ) {
      fail(
        `Real-model evidence family ${summary.family} drifted from its index summary.`
      );
    }
    assertG4ModelEvaluationEvidenceFamilyBudget({
      family: summary.family,
      recordCount: observedRecordCount,
      canonicalValueBytes: observedCanonicalValueBytes,
    });
    physicalFamilyUsages.push(physicalUsageAccumulator.finalize());
  }
  if (observedTotalShardBytes !== index.totalShardBytes) {
    fail('Real-model evidence aggregate shard bytes drifted from the index.');
  }
  const physicalBudget = assertG4ModelEvaluationEvidencePhysicalArchiveBudget({
    familyUsages: physicalFamilyUsages,
    indexBytes,
    rootBytes,
  });
  if (
    physicalBudget.totalRecordCount !== index.totalRecordCount ||
    physicalBudget.totalShardBytes !== observedTotalShardBytes
  ) {
    fail(
      'Real-model evidence physical archive budget drifted from the exact index totals.'
    );
  }
  return Object.freeze({
    singletons: finalizeSemanticState(state, now),
    attemptRecordCount: state.attemptIds.size,
    physicalBudget,
  });
};

export const verifyG4ModelEvaluationEvidenceArchive = async (options) => {
  const archivePath = resolve(options.archivePath);
  const evidenceRootPath = resolve(options.evidenceRootPath);
  const rootDisplacement = relative(archivePath, evidenceRootPath);
  if (
    !rootDisplacement ||
    (!rootDisplacement.startsWith(`..${sep}`) && rootDisplacement !== '..')
  ) {
    fail(
      'Real-model evidence root must be published separately from the archive.'
    );
  }
  const signatures = canarySignatures([
    ...options.secretCanaries,
    ...options.protectedHoldoutCanaries,
  ]);
  const rootBytes = await readStableRegularFile(
    evidenceRootPath,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
    'Real-model evidence root file'
  );
  const rootText = decodeUtf8(rootBytes, 'Real-model evidence root file');
  assertRawArtifactHasNoCanary(
    rootText,
    signatures,
    'Real-model evidence root file'
  );
  const evidenceRoot = decodeAgentModelEvaluationEvidenceRoot(rootText);
  const indexPath = join(
    archivePath,
    AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME
  );
  const indexBytes = await readStableRegularFile(
    indexPath,
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
    'Real-model evidence index file'
  );
  const indexText = decodeUtf8(indexBytes, 'Real-model evidence index file');
  assertRawArtifactHasNoCanary(
    indexText,
    signatures,
    'Real-model evidence index file'
  );
  const evidenceIndex = decodeAgentModelEvaluationEvidenceIndex(indexText);
  assertG4ModelEvaluationEvidenceRoot(evidenceRoot, evidenceIndex, indexBytes);
  if (evidenceIndex.repositoryCommit !== options.repositoryCommit) {
    fail(
      'Real-model evidence index drifted from the expected repository commit.'
    );
  }
  const streamed = await verifyArchiveShards({
    archivePath,
    index: evidenceIndex,
    canarySignatures: signatures,
    humanReviewVerifier: options.humanReviewVerifier,
    resolveFrozenRunConfig: options.resolveFrozenRunConfig,
    observationSanitization: Object.freeze({
      secretCanaries: Object.freeze([...options.secretCanaries]),
      protectedMaterialCanaries: Object.freeze([
        ...options.protectedHoldoutCanaries,
      ]),
    }),
    now: options.now,
    indexBytes: indexBytes.byteLength,
    rootBytes: rootBytes.byteLength,
  });

  // Raw bytes and semantic joins are authoritative before either signature is trusted.
  if (
    !verifyAuthorityAttestation(
      streamed.singletons.authorityAttestation,
      options.trustedPublicKeys,
      options.expectedAttestationIdentity
    )
  ) {
    fail(
      'Real-model evidence authority signature is invalid or its key is not trusted.'
    );
  }
  const archiveAttestation = evidenceRoot.archiveAttestation;
  if (
    archiveAttestation.authorityId !==
      options.expectedAttestationIdentity.authorityId ||
    archiveAttestation.keyId !== options.expectedAttestationIdentity.keyId ||
    Date.parse(archiveAttestation.issuedAt) <
      Date.parse(evidenceIndex.createdAt) ||
    Date.parse(archiveAttestation.issuedAt) > Date.parse(options.now) ||
    !(await verifyAgentModelEvaluationEvidenceArchiveAttestation(
      archiveAttestation,
      {
        trustedPublicKeys: options.trustedPublicKeys,
        verifyEd25519,
      }
    ))
  ) {
    fail(
      'Real-model evidence archive signature is invalid or its key is not trusted.'
    );
  }
  return Object.freeze({
    evidenceIndex,
    evidenceIndexArtifact: Object.freeze({
      path: indexPath,
      digest: digestAgentCanonicalBytes(indexBytes),
      size: indexBytes.byteLength,
    }),
    evidenceRoot,
    evidenceRootArtifact: Object.freeze({
      path: evidenceRootPath,
      digest: digestAgentCanonicalBytes(rootBytes),
      size: rootBytes.byteLength,
    }),
    singletons: streamed.singletons,
    attemptRecordCount: streamed.attemptRecordCount,
    physicalBudget: streamed.physicalBudget,
    repositoryCommit: options.repositoryCommit,
  });
};

export const decodeG4ModelEvaluationArtifactFrozenRunConfig = ({
  sourceBytes,
  runConfigArtifactBinding,
  index,
  plan,
}) => {
  const parsed = parseStrictJsonDocument(sourceBytes, {
    documentKind: 'contribution',
    maxBytes: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES,
    maxDepth: 128,
    maxNodes: 250_000,
  });
  if (!parsed.ok) {
    fail(
      'Generated model-evaluation run configuration is not bounded strict JSON or contains duplicate keys.'
    );
  }
  const canonicalBytes = Buffer.from(canonicalJsonText(parsed.value), 'utf8');
  if (
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      runConfigArtifactBinding
    ) ||
    !Buffer.from(sourceBytes).equals(canonicalBytes) ||
    canonicalBytes.byteLength !==
      runConfigArtifactBinding.runConfigByteLength ||
    digestAgentCanonicalBytes(canonicalBytes) !==
      runConfigArtifactBinding.runConfigCanonicalBytesDigest
  ) {
    fail(
      'Generated model-evaluation run configuration bytes drifted from the signed artifact binding.'
    );
  }
  let configuration;
  try {
    configuration = requireProductionAgentEvaluationFrozenRunConfig(
      decodeAgentEvaluationFrozenRunConfig(parsed.value, {
        clock: () => plan.plannedAt,
        expectedRepositoryCommit: index.repositoryCommit,
      }),
      index.repositoryCommit
    );
  } catch {
    fail('Generated model-evaluation run configuration is invalid.');
  }
  return assertG4ModelEvaluationFrozenRunConfigBinding({
    index,
    plan,
    runConfigArtifactBinding,
    configuration,
  });
};

const createRunConfigArtifactResolver =
  (files) =>
  async ({ index, plan }) => {
    try {
      const loaded = await loadProductionAgentEvaluationRunConfigArtifact({
        files,
        environment: process.env,
        expectedRepositoryCommit: index.repositoryCommit,
        expectedPlanDigest: index.planDigest,
        expectedPlan: plan,
        observedAt: plan.plannedAt,
      });
      return Object.freeze({
        configuration: loaded.config,
        runConfigArtifactBinding: loaded.artifactBinding,
      });
    } catch {
      fail(
        'Generated model-evaluation run configuration artifact is invalid, unavailable, or drifted from its signed workflow identity.'
      );
    }
  };

export const loadAndVerifyG4ModelEvaluationEvidence = async () => {
  if (process.env.PRODIVIX_G4_MODEL_EVAL_EVIDENCE?.trim()) {
    fail(
      'PRODIVIX_G4_MODEL_EVAL_EVIDENCE monolith input is unsupported; provide the bounded archive directory.'
    );
  }
  const archivePath = requiredPath('PRODIVIX_G4_MODEL_EVAL_EVIDENCE_ARCHIVE');
  const evidenceRootPath = requiredPath('PRODIVIX_G4_MODEL_EVAL_EVIDENCE_ROOT');
  const repositoryCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const now = new Date().toISOString();
  const archiveFiles = createNodeAgentEvaluationCoordinatorFilePort({
    maximumBytes:
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes,
  });
  const runConfigFiles = createNodeAgentEvaluationCoordinatorFilePort({
    maximumBytes: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES,
  });
  const result = await verifyG4ModelEvaluationEvidenceArchive({
    archivePath,
    evidenceRootPath,
    repositoryCommit,
    now,
    secretCanaries: parseCanonicalStringArray(
      'PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES'
    ),
    protectedHoldoutCanaries: parseCanonicalStringArray(
      'PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES'
    ),
    trustedPublicKeys: parseTrustedPublicKeys(),
    expectedAttestationIdentity: parseExpectedAttestationIdentity(),
    humanReviewVerifier:
      createProductionAgentEvaluationHumanReviewImportVerifier({
        files: archiveFiles,
        repositoryRoot: process.cwd(),
      }),
    resolveFrozenRunConfig: createRunConfigArtifactResolver(runConfigFiles),
  });
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  if (dirty || result.singletons.plan.repositoryCommit !== repositoryCommit) {
    fail(
      'Real-model evidence must bind the current exact clean repository commit.'
    );
  }
  return result;
};
