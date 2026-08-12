import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_RECORD_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_RECORD_MAXIMUM_BYTES,
} from '../providers/agentHostedRetrievalRuntimeResource';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET,
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET,
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS,
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET,
  AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_WRAPPER_BYTES_BY_FAMILY,
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES,
  agentEvaluationEvidenceArchiveFamilyIndex,
  assertAgentModelEvaluationEvidenceArchiveFamilyPage,
  createAgentModelEvaluationEvidenceArchiveAttestation,
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilySummary,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveOrderKey,
  createAgentModelEvaluationEvidenceArchivePhysicalBudget,
  createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage,
  createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator,
  createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveShardDescriptor,
  createAgentModelEvaluationEvidenceIndex,
  createAgentModelEvaluationEvidenceRoot,
  decodeAgentModelEvaluationEvidenceArchiveRecordLine,
  decodeAgentModelEvaluationEvidenceIndex,
  decodeAgentModelEvaluationEvidenceRoot,
  digestAgentModelEvaluationEvidenceArchiveRecordSet,
  digestAgentModelEvaluationEvidenceArchiveSemanticRecord,
  digestAgentModelEvaluationEvidenceArchiveShardSet,
  encodeAgentModelEvaluationEvidenceArchiveRecordLine,
  encodeAgentModelEvaluationEvidenceIndex,
  encodeAgentModelEvaluationEvidenceRoot,
  isAgentModelEvaluationEvidenceArchiveAttestation,
  isAgentModelEvaluationEvidenceArchiveAuthorityRoots,
  isAgentModelEvaluationEvidenceArchiveRecord,
  isAgentModelEvaluationEvidenceArchivePhysicalBudget,
  isAgentModelEvaluationEvidenceArchivePhysicalCapacity,
  isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage,
  isAgentModelEvaluationEvidenceIndex,
  isAgentModelEvaluationEvidenceRoot,
  isAgentEvaluationCapabilitySpecificArchiveBudget,
  isAgentEvaluationCapabilityAuthorityArchiveBudget,
  isAgentEvaluationAttemptAuthorityOwnerArchiveBudget,
  isAgentEvaluationProviderCapabilityObservationArchiveBudget,
  verifyAgentModelEvaluationEvidenceArchiveAttestation,
  type AgentEvaluationEvidenceArchiveFamily,
  type AgentModelEvaluationEvidenceArchiveAuthorityRoots,
  type AgentModelEvaluationEvidenceArchiveFamilyPage,
  type AgentModelEvaluationEvidenceArchiveFamilySummary,
  type AgentModelEvaluationEvidenceArchiveShardDescriptor,
} from './agentEvaluationEvidenceArchive';
import { createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt } from './agentEvaluationEndpointSmoke';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS,
  isAgentEvaluationQualificationAuthorityArchiveFamilyBudget,
} from './agentEvaluationEvidenceArchiveAuthorityRecords';
import { createAgentEvaluationProductionRunConfigArtifactBinding } from './agentEvaluationFrozenConfigCommitment';
import { planAgentModelEvaluationAttempts } from './agentEvaluationPlan';
import { AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS } from './agentEvaluationCapabilityEffectProviderJournal';
import {
  createAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderCapabilityObservationReceipt,
} from './agentEvaluationProviderCapabilityObservation';

const COMMIT = '1234567890abcdef1234567890abcdef12345678';
const NOW = '2026-08-08T08:00:00.000Z';
const SOURCE_CONFIG_DIGEST = digestAgentCanonicalValue({
  source: 'frozen-run-config',
});
const FROZEN_RUN_DIGEST = digestAgentCanonicalValue({
  frozen: 'production-run',
});
const digest = (label: string) => digestAgentCanonicalValue({ label });
const runConfigArtifactBinding = (
  planDigest: string,
  repositoryCommit: string
) =>
  createAgentEvaluationProductionRunConfigArtifactBinding({
    sourcePlanArtifactName: 'g4-plan-1234567-2',
    sourcePlanArtifactDigest: `sha256:${'a'.repeat(64)}`,
    sourcePlanWorkflowRunId: '1234567',
    sourcePlanWorkflowRunAttempt: 2,
    runConfigFileName: 'production-run-config.json',
    runConfigByteLength: 4_096,
    runConfigCanonicalBytesDigest: SOURCE_CONFIG_DIGEST,
    sourceConfigDigest: SOURCE_CONFIG_DIGEST,
    frozenRunDigest: FROZEN_RUN_DIGEST,
    planDigest,
    repositoryCommit,
  });
const EMPTY_SET_DIGEST = digestAgentCanonicalValue([]);
const SIGNATURE =
  'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBw';
const PUBLIC_KEY = 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk';
const emptyFamilySemanticDigest = (
  family: AgentEvaluationEvidenceArchiveFamily
): string =>
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
    family
  ).finalize();

const singletonValue = (
  family: AgentEvaluationEvidenceArchiveFamily,
  plan?: Readonly<{ planDigest: string; repositoryCommit: string }>
): Readonly<Record<string, unknown>> => {
  const valueDigest = digest(`singleton:${family}`);
  switch (family) {
    case 'plan':
      return plan ?? Object.freeze({ planDigest: valueDigest });
    case 'budgetLedger':
      return Object.freeze({ ledgerDigest: valueDigest });
    case 'metricReport':
    case 'graderReport':
    case 'humanReviewReport':
      return Object.freeze({ reportDigest: valueDigest });
    case 'holdoutExecutionReceipt':
      return Object.freeze({ receiptDigest: valueDigest });
    case 'authorityAttestation':
      return Object.freeze({ attestationDigest: valueDigest });
    case 'manifest':
      return Object.freeze({ manifestDigest: valueDigest });
    default:
      throw new TypeError(`${family} is not a singleton family.`);
  }
};

const createAuthorityRoots = (
  holdoutExecutionReceiptDigest: string,
  validatedHumanReviewArtifactSetDigest: string,
  validatedHumanMetricObservationSetDigest: string,
  reviewLeaseDigest?: string
): AgentModelEvaluationEvidenceArchiveAuthorityRoots =>
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots({
    capabilityProbeAdmissionSetDigest: emptyFamilySemanticDigest(
      'capabilityProbeAdmissions'
    ),
    capabilityProbeReferenceReceiptSetDigest: emptyFamilySemanticDigest(
      'capabilityProbeReferenceReceipts'
    ),
    runtimeFactSourceOwnerRegistrationSetDigest: emptyFamilySemanticDigest(
      'runtimeFactSourceOwnerRegistrations'
    ),
    capabilityProbeProviderResourceCleanupSetDigest: emptyFamilySemanticDigest(
      'capabilityProbeProviderResourceCleanups'
    ),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      emptyFamilySemanticDigest(
        'hostedRetrievalRuntimeResourceLifecycleJournals'
      ),
    hostedRetrievalRuntimeResourceCleanupSetDigest: emptyFamilySemanticDigest(
      'hostedRetrievalRuntimeResourceCleanups'
    ),
    capabilityEffectProviderRuntimeJournalSetDigest: emptyFamilySemanticDigest(
      'capabilityEffectProviderRuntimeJournals'
    ),
    optionalCapabilityFactSourceSetDigest: emptyFamilySemanticDigest(
      'optionalCapabilityFactSources'
    ),
    optionalCapabilityFactAuthoritySetDigest: emptyFamilySemanticDigest(
      'optionalCapabilityFactAuthorities'
    ),
    endpointSmokeSetDigest: emptyFamilySemanticDigest('endpointSmokeReceipts'),
    endpointSmokeDispatchIntentSetDigest: emptyFamilySemanticDigest(
      'endpointSmokeDispatchIntents'
    ),
    endpointSmokeTransportReceiptSetDigest: emptyFamilySemanticDigest(
      'endpointSmokeTransportReceipts'
    ),
    endpointSmokeResultSpoolReceiptSetDigest: emptyFamilySemanticDigest(
      'endpointSmokeResultSpoolReceipts'
    ),
    endpointSmokeResultSpoolDispositionReceiptSetDigest:
      emptyFamilySemanticDigest('endpointSmokeResultSpoolDispositionReceipts'),
    endpointSmokeValidationFailureReceiptSetDigest: emptyFamilySemanticDigest(
      'endpointSmokeValidationFailureReceipts'
    ),
    preDispatchFailureReceiptSetDigest: EMPTY_SET_DIGEST,
    transportDispatchIntentSetDigest: EMPTY_SET_DIGEST,
    transportReceiptSetDigest: EMPTY_SET_DIGEST,
    providerResultSpoolReceiptSetDigest: EMPTY_SET_DIGEST,
    providerResultSpoolDispositionReceiptSetDigest: EMPTY_SET_DIGEST,
    invocationTurnReceiptSetDigest: EMPTY_SET_DIGEST,
    invocationTurnSetReceiptSetDigest: EMPTY_SET_DIGEST,
    resultSubmissionReceiptSetDigest: EMPTY_SET_DIGEST,
    attemptAuthorityOwnerReceiptSetDigest: emptyFamilySemanticDigest(
      'attemptAuthorityOwnerReceipts'
    ),
    controlledRuntimeReceiptSetDigest: EMPTY_SET_DIGEST,
    capabilityExecutionReceiptSetDigest: EMPTY_SET_DIGEST,
    capabilitySpecificReceiptSetDigest: emptyFamilySemanticDigest(
      'capabilitySpecificReceipts'
    ),
    providerCapabilityObservationReceiptSetDigest: emptyFamilySemanticDigest(
      'providerCapabilityObservationReceipts'
    ),
    verificationAttemptGrantReceiptSetDigest: emptyFamilySemanticDigest(
      'verificationAttemptGrantReceipts'
    ),
    validatedHumanReviewArtifactSetDigest,
    validatedHumanMetricObservationSetDigest,
    ...(reviewLeaseDigest === undefined ? {} : { reviewLeaseDigest }),
    reviewRasterScanReceiptSetDigest: EMPTY_SET_DIGEST,
    reviewCandidateRefSetDigest: EMPTY_SET_DIGEST,
    blindReviewMappingSetDigest: EMPTY_SET_DIGEST,
    sourceReceiptSetDigest: EMPTY_SET_DIGEST,
    executionReceiptSetDigest: EMPTY_SET_DIGEST,
    holdoutExecutionReceiptDigest,
    secretCanarySetDigest: digest('secret-canaries'),
    protectedHoldoutCanarySetDigest: digest('holdout-canaries'),
  });

const createArchiveFixture = (
  input: Readonly<{
    reviewLeaseDigest?: string;
    plan?: Readonly<{ planDigest: string; repositoryCommit: string }>;
  }> = {}
) => {
  const families: AgentModelEvaluationEvidenceArchiveFamilySummary[] = [];
  const shards: AgentModelEvaluationEvidenceArchiveShardDescriptor[] = [];
  const values = new Map<AgentEvaluationEvidenceArchiveFamily, unknown>();
  let sequence = 0;
  for (const family of AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES) {
    const isValidatedReviewArtifact =
      family === 'validatedHumanReviewArtifacts' &&
      input.reviewLeaseDigest !== undefined;
    const isValidatedHumanMetricObservation =
      family === 'validatedHumanMetricObservations' &&
      input.reviewLeaseDigest !== undefined;
    if (
      !AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES.includes(
        family as (typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES)[number]
      ) &&
      !isValidatedReviewArtifact &&
      !isValidatedHumanMetricObservation
    ) {
      const accumulator =
        createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
          family
        );
      families.push(
        createAgentModelEvaluationEvidenceArchiveFamilySummary({
          family,
          recordCount: 0,
          semanticDigest: accumulator.finalize(),
          recordSetDigest: digestAgentModelEvaluationEvidenceArchiveRecordSet(
            []
          ),
          shardCount: 0,
          firstOrderKey: null,
          lastOrderKey: null,
        })
      );
      continue;
    }
    const value = isValidatedReviewArtifact
      ? Object.freeze({
          artifactId: 'validated-human-review-artifact:test',
          reviewLeaseDigest: input.reviewLeaseDigest,
          artifactDigest: digest('validated-human-review-artifact'),
        })
      : isValidatedHumanMetricObservation
        ? Object.freeze({
            observationId: 'validated-human-metric-observation:test',
            observationDigest: digest('validated-human-metric-observation'),
          })
        : singletonValue(family, input.plan);
    if (!isValidatedReviewArtifact && !isValidatedHumanMetricObservation) {
      values.set(family, value);
    }
    const record = createAgentModelEvaluationEvidenceArchiveRecord({
      family,
      recordIndex: 0,
      value,
    });
    const line = encodeAgentModelEvaluationEvidenceArchiveRecordLine(record);
    const bytes = new TextEncoder().encode(line);
    const recordSetDigest = digestAgentModelEvaluationEvidenceArchiveRecordSet([
      record.recordDigest,
    ]);
    const descriptor = createAgentModelEvaluationEvidenceArchiveShardDescriptor(
      {
        sequence,
        family,
        familyShardIndex: 0,
        firstRecordIndex: 0,
        lastRecordIndex: 0,
        firstOrderKey: record.orderKey,
        lastOrderKey: record.orderKey,
        recordCount: 1,
        byteSize: bytes.byteLength,
        bytesDigest: digestAgentCanonicalBytes(bytes),
        recordSetDigest,
      }
    );
    shards.push(descriptor);
    const accumulator =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(family);
    accumulator.append(value);
    families.push(
      createAgentModelEvaluationEvidenceArchiveFamilySummary({
        family,
        recordCount: 1,
        semanticDigest: accumulator.finalize(),
        recordSetDigest,
        shardCount: 1,
        firstOrderKey: record.orderKey,
        lastOrderKey: record.orderKey,
      })
    );
    sequence += 1;
  }
  const planDigest = (values.get('plan') as { planDigest: string }).planDigest;
  const repositoryCommit =
    (values.get('plan') as { repositoryCommit?: string }).repositoryCommit ??
    COMMIT;
  const holdoutExecutionReceiptDigest = (
    values.get('holdoutExecutionReceipt') as { receiptDigest: string }
  ).receiptDigest;
  const authorityAttestationDigest = (
    values.get('authorityAttestation') as { attestationDigest: string }
  ).attestationDigest;
  const evaluationManifestDigest = (
    values.get('manifest') as { manifestDigest: string }
  ).manifestDigest;
  const validatedHumanReviewArtifactSetDigest = families.find(
    ({ family }) => family === 'validatedHumanReviewArtifacts'
  )!.semanticDigest;
  const validatedHumanMetricObservationSetDigest = families.find(
    ({ family }) => family === 'validatedHumanMetricObservations'
  )!.semanticDigest;
  const authorityRoots = createAuthorityRoots(
    holdoutExecutionReceiptDigest,
    validatedHumanReviewArtifactSetDigest,
    validatedHumanMetricObservationSetDigest,
    input.reviewLeaseDigest
  );
  const index = createAgentModelEvaluationEvidenceIndex({
    exportLeaseId: 'evaluation-export-lease:test',
    exportLeaseDigest: digest('export-lease'),
    runConfigArtifactBinding: runConfigArtifactBinding(
      planDigest,
      repositoryCommit
    ),
    sourceConfigDigest: SOURCE_CONFIG_DIGEST,
    frozenRunDigest: FROZEN_RUN_DIGEST,
    planDigest,
    repositoryCommit,
    evidenceSetDigest: digest('evidence-set'),
    authorityPayloadDigest: digest('authority-payload'),
    authorityAttestationDigest,
    authorityRoots,
    ...(input.reviewLeaseDigest === undefined
      ? {}
      : { reviewLeaseDigest: input.reviewLeaseDigest }),
    evaluationManifestDigest,
    families,
    shards,
    createdAt: NOW,
  });
  const indexText = encodeAgentModelEvaluationEvidenceIndex(index);
  const indexBytes = new TextEncoder().encode(indexText);
  const archiveAttestation =
    createAgentModelEvaluationEvidenceArchiveAttestation({
      authorityId: 'evaluation-authority:test',
      keyId: 'evaluation-key:test',
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
      evidenceIndexArtifactDigest: digestAgentCanonicalBytes(indexBytes),
      evidenceIndexArtifactSize: indexBytes.byteLength,
      shardSetDigest: index.shardSetDigest,
      totalShardBytes: index.totalShardBytes,
      totalRecordCount: index.totalRecordCount,
      issuedAt: NOW,
      signature: SIGNATURE,
    });
  const root = createAgentModelEvaluationEvidenceRoot({
    index,
    evidenceIndexArtifactBytes: indexBytes,
    archiveAttestation,
  });
  return Object.freeze({
    index,
    indexText,
    indexBytes,
    archiveAttestation,
    root,
    families: Object.freeze(families),
    shards: Object.freeze(shards),
  });
};

const createPageRecord = (smokeTargetId: string, receiptLabel: string) => {
  const value = Object.freeze({
    smokeTargetId,
    receiptDigest: digest(receiptLabel),
  });
  const orderKey = canonicalJsonText([smokeTargetId]);
  return Object.freeze({
    orderKey,
    recordDigest: digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
      'endpointSmokeReceipts',
      value
    ),
    contentDigest: digestAgentCanonicalValue(value),
    byteLength: new TextEncoder().encode(canonicalJsonText(value)).byteLength,
    value,
  });
};

const createPage = (
  leaseId = 'evaluation-export-lease:test',
  records = [createPageRecord('smoke.a', 'receipt:a')],
  input: Readonly<{
    pageOrdinal?: number;
    firstRecordOrdinal?: number;
    nextCursor?: string;
  }> = {}
): AgentModelEvaluationEvidenceArchiveFamilyPage => {
  const base = {
    leaseId,
    family: 'endpointSmokeReceipts' as const,
    pageOrdinal: input.pageOrdinal ?? 0,
    firstRecordOrdinal: input.firstRecordOrdinal ?? 0,
    records: Object.freeze(records),
    recordCount: records.length,
    recordBytes: records.reduce(
      (total, { byteLength }) => total + byteLength,
      0
    ),
    pageRecordSetDigest: digestAgentCanonicalValue(
      records.map(({ recordDigest }) => recordDigest)
    ),
    ...(input.nextCursor === undefined ? {} : { nextCursor: input.nextCursor }),
  };
  return Object.freeze({
    ...base,
    pageDigest: digestAgentCanonicalValue(base),
  });
};

describe('agent model evaluation evidence archive contract', () => {
  it('orders endpoint-smoke spool dispositions by their exact public identity', () => {
    const receipt =
      createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
        spoolRef: 'endpoint-smoke-spool.archive-order',
        spoolReceiptDigest: digest('endpoint-smoke-spool-receipt'),
        planDigest: digest('endpoint-smoke-plan'),
        repositoryCommit: COMMIT,
        smokeTargetId: 'endpoint-smoke.archive-order',
        smokeTargetDigest: digest('endpoint-smoke-target'),
        invocationId: 'invocation.endpoint-smoke.archive-order',
        disposition: 'consumed-and-destroyed',
        retentionPolicyDigest: digest('endpoint-smoke-retention-policy'),
        disposedAt: NOW,
      });

    expect(
      createAgentModelEvaluationEvidenceArchiveOrderKey(
        'endpointSmokeResultSpoolDispositionReceipts',
        receipt
      )
    ).toBe(canonicalJsonText([receipt.smokeTargetId, receipt.spoolRef]));
  });

  it('preflights all 11 authority value families below 8 GiB', () => {
    const specificBudget = AGENT_EVALUATION_CAPABILITY_SPECIFIC_ARCHIVE_BUDGET;
    const ownerBudget = AGENT_EVALUATION_ATTEMPT_AUTHORITY_OWNER_ARCHIVE_BUDGET;
    const observationBudget =
      AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_ARCHIVE_BUDGET;
    const plan = createV8EvaluationPlan();
    expect(plan.plannedJourneyCount).toBe(specificBudget.plannedJourneyCount);
    expect(plan.plannedJourneyCount).toBe(ownerBudget.plannedJourneyCount);
    expect(plan.plannedJourneyCount).toBe(
      observationBudget.plannedJourneyCount
    );
    expect(
      Math.max(
        ...plan.concreteCases.map(
          ({ capabilityDescriptor }) =>
            capabilityDescriptor.expectedReceiptKinds.length
        )
      )
    ).toBe(specificBudget.maximumReceiptsPerAttempt);
    expect(specificBudget.maximumRecordCount).toBe(28_080);
    expect(specificBudget.maximumCanonicalFamilyBytes).toBe(1_840_250_880);
    expect(ownerBudget.maximumReceiptsPerAttempt).toBe(4 + 1 + 1);
    expect(ownerBudget.maximumRecordCount).toBe(84_240);
    expect(ownerBudget.maximumCanonicalFamilyBytes).toBe(1_380_188_160);
    expect(observationBudget.maximumTurnsPerAttempt).toBe(7);
    expect(observationBudget.maximumRecordCount).toBe(98_280);
    expect(observationBudget.maximumCanonicalFamilyBytes).toBe(1_610_219_520);
    const optionalCapabilityTargetIds = new Set(
      plan.capabilityQualificationTargets
        .filter(({ optionalCapabilitySupportAuthority }) =>
          Boolean(optionalCapabilitySupportAuthority)
        )
        .map(({ targetId }) => targetId)
    );
    const maximumOptionalCapabilityOwnerRequests =
      planAgentModelEvaluationAttempts(plan).filter(({ targetId }) =>
        optionalCapabilityTargetIds.has(targetId)
      ).length * observationBudget.maximumTurnsPerAttempt;
    expect(maximumOptionalCapabilityOwnerRequests).toBe(5_880);
    expect(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive
    ).toBe(maximumOptionalCapabilityOwnerRequests);
    expect(
      AGENT_EVALUATION_CAPABILITY_AUTHORITY_ARCHIVE_BUDGET.maximumCanonicalBytes
    ).toBe(4_830_658_560);
    expect(
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_ARCHIVE_LIMITS.requiredRecordCount
    ).toBe(18);
    expect(
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_ARCHIVE_LIMITS.requiredRecordCount
    ).toBe(108);
    expect(
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ARCHIVE_LIMITS.maximumRecordCount
    ).toBe(15);
    expect(
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ARCHIVE_LIMITS.requiredRecordCount
    ).toBe(4);
    expect(
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_ARCHIVE_LIMITS.maximumRecordCount
    ).toBe(maximumOptionalCapabilityOwnerRequests);
    expect(
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount
    ).toBe(maximumOptionalCapabilityOwnerRequests);
    expect(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive
    ).toBe(
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_AUTHORITY_ARCHIVE_LIMITS.maximumRecordCount
    );
    expect(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveFamilyBytes
    ).toBe(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumOwnerRequestsPerArchive *
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumArchiveRecordBytes
    );
    expect(
      AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes
    ).toBe(3_308_032_000);
    expect(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_AUTHORITY_BUDGET.maximumCanonicalBytes
    ).toBe(8_138_690_560);
    expect(
      specificBudget.maximumCanonicalFamilyBytes +
        ownerBudget.maximumCanonicalFamilyBytes +
        observationBudget.maximumCanonicalFamilyBytes +
        AGENT_EVALUATION_QUALIFICATION_AUTHORITY_ARCHIVE_LIMITS.maximumCanonicalBytes
    ).toBeLessThan(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
    expect(
      isAgentEvaluationCapabilitySpecificArchiveBudget(
        specificBudget.maximumRecordCount,
        specificBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilitySpecificArchiveBudget(
        specificBudget.maximumRecordCount + 1,
        specificBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(false);
    expect(
      isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
        ownerBudget.maximumRecordCount,
        ownerBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationAttemptAuthorityOwnerArchiveBudget(
        ownerBudget.maximumRecordCount + 1,
        ownerBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(false);
    expect(
      isAgentEvaluationProviderCapabilityObservationArchiveBudget(
        observationBudget.maximumRecordCount,
        observationBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationProviderCapabilityObservationArchiveBudget(
        observationBudget.maximumRecordCount + 1,
        observationBudget.maximumCanonicalFamilyBytes
      )
    ).toBe(false);
    const maximumUsage = Object.freeze({
      capabilitySpecificRecordCount: specificBudget.maximumRecordCount,
      capabilitySpecificCanonicalBytes:
        specificBudget.maximumCanonicalFamilyBytes,
      attemptAuthorityOwnerRecordCount: ownerBudget.maximumRecordCount,
      attemptAuthorityOwnerCanonicalBytes:
        ownerBudget.maximumCanonicalFamilyBytes,
      providerCapabilityObservationRecordCount:
        observationBudget.maximumRecordCount,
      providerCapabilityObservationCanonicalBytes:
        observationBudget.maximumCanonicalFamilyBytes,
    });
    expect(
      isAgentEvaluationCapabilityAuthorityArchiveBudget(maximumUsage)
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityAuthorityArchiveBudget({
        ...maximumUsage,
        providerCapabilityObservationCanonicalBytes:
          observationBudget.maximumCanonicalFamilyBytes + 1,
      })
    ).toBe(false);
  });

  it('locks the independent lifecycle journal family maximum and plus-one rejection', () => {
    const limits =
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_LIMITS;
    expect(limits.minimumRecordCount).toBe(1);
    expect(limits.maximumRecordCount).toBe(88);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_RECORD_MAXIMUM_BYTES
    ).toBe(139_264);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_RECORD_MAXIMUM_BYTES
    ).toBe(155_648);
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_ARCHIVE_FAMILY_MAXIMUM_BYTES
    ).toBe(13_697_024);
    expect(limits.maximumRecordBytes).toBe(163_840);
    expect(limits.maximumFamilyBytes).toBe(14_417_920);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        0,
        0
      )
    ).toBe(true);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        limits.minimumRecordCount,
        limits.maximumRecordBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        limits.maximumRecordCount,
        limits.maximumFamilyBytes
      )
    ).toBe(true);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        limits.maximumRecordCount + 1,
        limits.maximumFamilyBytes
      )
    ).toBe(false);
    expect(
      isAgentEvaluationQualificationAuthorityArchiveFamilyBudget(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        limits.maximumRecordCount,
        limits.maximumFamilyBytes + 1
      )
    ).toBe(false);
  });

  it('accounts all 46 canonical NDJSON families plus index and root bytes', () => {
    const fixture = createArchiveFixture();
    const familyUsages = AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.map(
      (family) => {
        if (
          !AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES.includes(
            family as (typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES)[number]
          )
        ) {
          return createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(
            family,
            []
          );
        }
        const record = createAgentModelEvaluationEvidenceArchiveRecord({
          family,
          recordIndex: 0,
          value: singletonValue(family),
        });
        return createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(
          family,
          [record]
        );
      }
    );
    const indexBytes = fixture.indexBytes.byteLength;
    const rootBytes = new TextEncoder().encode(
      encodeAgentModelEvaluationEvidenceRoot(fixture.root)
    ).byteLength;
    const budget = createAgentModelEvaluationEvidenceArchivePhysicalBudget({
      familyUsages,
      indexBytes,
      rootBytes,
    });

    expect(familyUsages).toHaveLength(46);
    expect(
      Object.keys(
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_WRAPPER_BYTES_BY_FAMILY
      )
    ).toEqual(AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES);
    expect(
      Object.values(
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_RECORD_WRAPPER_BYTES_BY_FAMILY
      ).every((bytes) => bytes > 0)
    ).toBe(true);
    expect(budget.totalRecordCount).toBe(8);
    expect(budget.totalShardBytes).toBe(
      budget.totalCanonicalValueBytes +
        budget.totalCanonicalOrderKeyBytes +
        budget.totalCanonicalRecordWrapperBytes
    );
    expect(budget.totalArchiveBytes).toBe(
      budget.totalShardBytes + indexBytes + rootBytes
    );
    expect(isAgentModelEvaluationEvidenceArchivePhysicalBudget(budget)).toBe(
      true
    );
    const mutableFamilyUsages = familyUsages.map((usage) => ({ ...usage }));
    const immutableBudget =
      createAgentModelEvaluationEvidenceArchivePhysicalBudget({
        familyUsages: mutableFamilyUsages,
        indexBytes,
        rootBytes,
      });
    mutableFamilyUsages[0]!.shardBytes += 1;
    expect(immutableBudget.familyUsages[0]).toEqual(familyUsages[0]);
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalBudget(immutableBudget)
    ).toBe(true);
    expect(() =>
      createAgentModelEvaluationEvidenceArchivePhysicalBudget({
        familyUsages: familyUsages.slice(1),
        indexBytes,
        rootBytes,
      })
    ).toThrow(/family set/u);

    const nonEmptyUsage = familyUsages.find(
      ({ recordCount }) => recordCount === 1
    )!;
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage({
        ...nonEmptyUsage,
        shardBytes: nonEmptyUsage.shardBytes + 1,
      })
    ).toBe(false);

    const maximumMetadataBytes =
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes +
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes;
    const maximumShardBytes =
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes -
      maximumMetadataBytes;
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords,
        totalShardBytes: maximumShardBytes,
        indexBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
        rootBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
      })
    ).toBe(true);
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords,
        totalShardBytes: maximumShardBytes + 1,
        indexBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
        rootBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
      })
    ).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalCapacity({
        totalRecordCount:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecords + 1,
        totalShardBytes: maximumShardBytes,
        indexBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
        rootBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
      })
    ).toBe(false);
  });

  it('rejects a root when shard, exact index, and exact root bytes exceed 8 GiB', () => {
    const fixture = createArchiveFixture();
    const {
      algorithm: _algorithm,
      attestedPayloadDigest: _attestedPayloadDigest,
      attestationDigest: _attestationDigest,
      ...attestationInput
    } = fixture.archiveAttestation;
    const maximumShardBytesBeforeRoot =
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes -
      fixture.indexBytes.byteLength;
    const archiveAttestation =
      createAgentModelEvaluationEvidenceArchiveAttestation({
        ...attestationInput,
        totalShardBytes: maximumShardBytesBeforeRoot,
      });
    const { rootDigest: _rootDigest, ...rootInput } = fixture.root;
    const rootBase = Object.freeze({
      ...rootInput,
      totalShardBytes: maximumShardBytesBeforeRoot,
      archiveAttestation,
      archiveAttestationDigest: archiveAttestation.attestationDigest,
    });
    const overBudgetRoot = Object.freeze({
      ...rootBase,
      rootDigest: digestAgentCanonicalValue(rootBase),
    });

    expect(
      isAgentModelEvaluationEvidenceArchiveAttestation(archiveAttestation)
    ).toBe(true);
    expect(maximumShardBytesBeforeRoot + fixture.indexBytes.byteLength).toBe(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
    expect(isAgentModelEvaluationEvidenceRoot(overBudgetRoot)).toBe(false);
  });

  it('freezes the complete family order and every singleton cardinality', () => {
    expect(AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES).toEqual([
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
    ]);
    AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.forEach((family, index) =>
      expect(agentEvaluationEvidenceArchiveFamilyIndex(family)).toBe(index)
    );
    expect(AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES).toEqual([
      'plan',
      'budgetLedger',
      'metricReport',
      'graderReport',
      'humanReviewReport',
      'holdoutExecutionReceipt',
      'authorityAttestation',
      'manifest',
    ]);
  });

  it('round-trips canonical LF records and rejects raw/canonical drift', () => {
    const record = createAgentModelEvaluationEvidenceArchiveRecord({
      family: 'endpointSmokeReceipts',
      recordIndex: 0,
      value: {
        smokeTargetId: 'smoke.a',
        receiptDigest: digest('receipt:a'),
      },
    });
    const line = encodeAgentModelEvaluationEvidenceArchiveRecordLine(record);
    expect(decodeAgentModelEvaluationEvidenceArchiveRecordLine(line)).toEqual(
      record
    );
    expect(() =>
      decodeAgentModelEvaluationEvidenceArchiveRecordLine(
        line.replace('\n', '\r\n')
      )
    ).toThrow(/LF-terminated/u);
    expect(() =>
      decodeAgentModelEvaluationEvidenceArchiveRecordLine(` ${line}`)
    ).toThrow(/non-canonical/u);
    expect(
      isAgentModelEvaluationEvidenceArchiveRecord({ ...record, extra: true })
    ).toBe(false);
    const unsafe = JSON.parse(
      `{"planDigest":"${digest('plan')}","__proto__":{"polluted":true}}`
    ) as unknown;
    expect(() =>
      createAgentModelEvaluationEvidenceArchiveRecord({
        family: 'plan',
        recordIndex: 0,
        value: unsafe,
      })
    ).toThrow(/invalid/u);
  });

  it('admits an exact 16 MiB value with envelope and rejects one extra byte', () => {
    const planDigest = digest('large-plan');
    const emptyValue = { planDigest, payload: '' };
    const emptyRecord = createAgentModelEvaluationEvidenceArchiveRecord({
      family: 'plan',
      recordIndex: 0,
      value: emptyValue,
    });
    const overhead = new TextEncoder().encode(
      canonicalJsonText(emptyRecord)
    ).byteLength;
    const payloadLength =
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes -
      overhead;
    const exactValue = { planDigest, payload: 'x'.repeat(payloadLength) };
    const exactRecord = createAgentModelEvaluationEvidenceArchiveRecord({
      family: 'plan',
      recordIndex: 0,
      value: exactValue,
    });
    expect(
      new TextEncoder().encode(canonicalJsonText(exactRecord)).byteLength
    ).toBe(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes
    );
    expect(
      new TextEncoder().encode(
        encodeAgentModelEvaluationEvidenceArchiveRecordLine(exactRecord)
      ).byteLength
    ).toBeLessThan(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
    );
    expect(() =>
      createAgentModelEvaluationEvidenceArchiveRecord({
        family: 'plan',
        recordIndex: 0,
        value: { ...exactValue, payload: `${exactValue.payload}x` },
      })
    ).toThrow(/byte limit/u);
  });

  it('reproduces family semantic roots incrementally', () => {
    const receipts = [
      { smokeTargetId: 'smoke.a', receiptDigest: digest('receipt:a') },
      { smokeTargetId: 'smoke.b', receiptDigest: digest('receipt:b') },
    ];
    const accumulator =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'endpointSmokeReceipts'
      );
    receipts.forEach((receipt) => accumulator.append(receipt));
    expect(accumulator.finalize()).toBe(
      digestAgentCanonicalValue({
        endpointSmokeReceiptDigests: receipts.map(
          ({ receiptDigest }) => receiptDigest
        ),
      })
    );
    expect(accumulator.finalize()).toBe(accumulator.finalize());
  });

  it('binds one lease and exact page ordinals, content, digest, and order', () => {
    const records = [
      createPageRecord('smoke.a', 'receipt:a'),
      createPageRecord('smoke.b', 'receipt:b'),
    ];
    const page = createPage('evaluation-export-lease:test', records);
    expect(
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        page,
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toBe(page);
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        page,
        'evaluation-export-lease:swapped',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toThrow(/malformed/u);
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        page,
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        1,
        2,
        records.at(-1)!.orderKey
      )
    ).toThrow(/malformed/u);
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        createPage('evaluation-export-lease:test', [records[0]!, records[0]!]),
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toThrow(/malformed/u);
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        createPage('evaluation-export-lease:test', [...records].reverse()),
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toThrow(/malformed/u);
    const drifted = {
      ...page,
      records: [{ ...records[0], contentDigest: digest('drift') }, records[1]],
    };
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        drifted,
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toThrow(/malformed/u);
  });

  it('rejects a canonical page response whose envelope exceeds 32 MiB', () => {
    const payload = 'x'.repeat(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes -
        1_024
    );
    const records = [
      createPageRecord(`smoke.${payload}`, 'receipt:a'),
      createPageRecord(`smoke.${payload}y`, 'receipt:b'),
    ];
    const page = createPage('evaluation-export-lease:test', records);
    expect(
      new TextEncoder().encode(canonicalJsonText(page)).byteLength
    ).toBeGreaterThan(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
    );
    expect(() =>
      assertAgentModelEvaluationEvidenceArchiveFamilyPage(
        page,
        'evaluation-export-lease:test',
        'endpointSmokeReceipts',
        0,
        0,
        null
      )
    ).toThrow(/malformed/u);
  });

  it('proves the complete 14,040-attempt matrix through bounded pages and the archive index', () => {
    const plan = createV8EvaluationPlan();
    const descriptors = [...planAgentModelEvaluationAttempts(plan)].sort(
      (left, right) => compareUnicodeCodePoints(left.attemptId, right.attemptId)
    );
    expect(plan.plannedJourneyCount).toBe(14_040);
    expect(descriptors).toHaveLength(14_040);
    expect(new Set(descriptors.map(({ attemptId }) => attemptId)).size).toBe(
      14_040
    );

    const baseFixture = createArchiveFixture({ plan });
    const attemptSemantic =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(
        'attempts'
      );
    const attemptRecordSet =
      createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
    const attemptPhysicalUsage =
      createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsageAccumulator(
        'attempts'
      );
    const attemptShards: AgentModelEvaluationEvidenceArchiveShardDescriptor[] =
      [];
    let previousOrderKey: string | null = null;
    let firstOrderKey: string | null = null;
    let totalAttemptBytes = 0;

    for (
      let firstRecordOrdinal = 0, pageOrdinal = 0;
      firstRecordOrdinal < descriptors.length;
      firstRecordOrdinal +=
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordsPerPage,
        pageOrdinal += 1
    ) {
      const pageDescriptors = descriptors.slice(
        firstRecordOrdinal,
        firstRecordOrdinal +
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordsPerPage
      );
      const values = pageDescriptors.map(({ attemptId, descriptorDigest }) =>
        Object.freeze({
          descriptor: Object.freeze({ attemptId }),
          attemptDigest: digestAgentCanonicalValue({
            attemptId,
            descriptorDigest,
          }),
        })
      );
      const sourceRecords = values.map((value, index) => {
        const archiveRecord = createAgentModelEvaluationEvidenceArchiveRecord({
          family: 'attempts',
          recordIndex: firstRecordOrdinal + index,
          value,
        });
        return Object.freeze({
          orderKey: archiveRecord.orderKey,
          recordDigest: digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
            'attempts',
            value
          ),
          contentDigest: digestAgentCanonicalValue(value),
          byteLength: new TextEncoder().encode(canonicalJsonText(value))
            .byteLength,
          value,
        });
      });
      const pageBase = Object.freeze({
        leaseId: 'evaluation-export-lease:full-matrix',
        family: 'attempts' as const,
        pageOrdinal,
        firstRecordOrdinal,
        records: Object.freeze(sourceRecords),
        recordCount: sourceRecords.length,
        recordBytes: sourceRecords.reduce(
          (total, { byteLength }) => total + byteLength,
          0
        ),
        pageRecordSetDigest: digestAgentCanonicalValue(
          sourceRecords.map(({ recordDigest }) => recordDigest)
        ),
        ...(firstRecordOrdinal + sourceRecords.length < descriptors.length
          ? { nextCursor: `cursor.page.${pageOrdinal + 1}` }
          : {}),
      });
      const page = Object.freeze({
        ...pageBase,
        pageDigest: digestAgentCanonicalValue(pageBase),
      });
      expect(
        assertAgentModelEvaluationEvidenceArchiveFamilyPage(
          page,
          'evaluation-export-lease:full-matrix',
          'attempts',
          pageOrdinal,
          firstRecordOrdinal,
          previousOrderKey
        )
      ).toBe(page);

      const archiveRecords = values.map((value, index) =>
        createAgentModelEvaluationEvidenceArchiveRecord({
          family: 'attempts',
          recordIndex: firstRecordOrdinal + index,
          value,
        })
      );
      const shardRecordSet =
        createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
      const shardBytes = new TextEncoder().encode(
        archiveRecords
          .map((record) => {
            attemptSemantic.append(record.value);
            attemptRecordSet.append(record.recordDigest);
            shardRecordSet.append(record.recordDigest);
            attemptPhysicalUsage.append(record);
            return encodeAgentModelEvaluationEvidenceArchiveRecordLine(record);
          })
          .join('')
      );
      const shard = createAgentModelEvaluationEvidenceArchiveShardDescriptor({
        sequence: 1 + pageOrdinal,
        family: 'attempts',
        familyShardIndex: pageOrdinal,
        firstRecordIndex: firstRecordOrdinal,
        lastRecordIndex: firstRecordOrdinal + archiveRecords.length - 1,
        firstOrderKey: archiveRecords[0]!.orderKey,
        lastOrderKey: archiveRecords.at(-1)!.orderKey,
        recordCount: archiveRecords.length,
        byteSize: shardBytes.byteLength,
        bytesDigest: digestAgentCanonicalBytes(shardBytes),
        recordSetDigest: shardRecordSet.finalize(),
      });
      attemptShards.push(shard);
      firstOrderKey ??= shard.firstOrderKey;
      previousOrderKey = shard.lastOrderKey;
      totalAttemptBytes += shard.byteSize;
    }

    const attemptSummary =
      createAgentModelEvaluationEvidenceArchiveFamilySummary({
        family: 'attempts',
        recordCount: descriptors.length,
        semanticDigest: attemptSemantic.finalize(),
        recordSetDigest: attemptRecordSet.finalize(),
        shardCount: attemptShards.length,
        firstOrderKey,
        lastOrderKey: previousOrderKey,
      });
    const trailingShards = baseFixture.shards
      .filter(({ family }) => family !== 'plan')
      .map((shard, index) => {
        const {
          sequence: _sequence,
          fileName: _fileName,
          descriptorDigest: _descriptorDigest,
          ...input
        } = shard;
        return createAgentModelEvaluationEvidenceArchiveShardDescriptor({
          ...input,
          sequence: 1 + attemptShards.length + index,
        });
      });
    const shards = Object.freeze([
      baseFixture.shards.find(({ family }) => family === 'plan')!,
      ...attemptShards,
      ...trailingShards,
    ]);
    const families = Object.freeze(
      baseFixture.families.map((summary) =>
        summary.family === 'attempts' ? attemptSummary : summary
      )
    );
    const index = createAgentModelEvaluationEvidenceIndex({
      ...baseFixture.index,
      families,
      shards,
    });
    const indexedAttempts = index.families.find(
      ({ family }) => family === 'attempts'
    )!;
    expect(indexedAttempts.recordCount).toBe(14_040);
    expect(indexedAttempts.shardCount).toBe(55);
    expect(index.totalRecordCount).toBe(14_048);
    expect(totalAttemptBytes).toBeLessThan(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
    expect(
      attemptShards.every(
        ({ recordCount, byteSize }) =>
          recordCount <=
            AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordsPerPage &&
          byteSize <=
            AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumShardBytes
      )
    ).toBe(true);

    const qualificationTargetById = new Map(
      plan.capabilityQualificationTargets.map((target) => [
        target.targetId,
        target,
      ])
    );
    const providerConfigurationById = new Map(
      plan.providerConfigurations.map((provider) => [
        provider.providerConfigurationId,
        provider,
      ])
    );
    const observationSanitization = Object.freeze({
      protectedMaterialCanaries: Object.freeze([
        'protected-physical-capacity-canary',
      ]),
      secretCanaries: Object.freeze(['secret-physical-capacity-canary']),
    });
    type ObservationInput = Parameters<
      typeof createAgentEvaluationProviderCapabilityObservationReceipt
    >[0];
    const observationShapeGroups = new Map<
      string,
      Readonly<{
        count: number;
        recordIndex: number;
        input: ObservationInput;
      }>
    >();
    const shapeTextEncoder = new TextEncoder();
    const shapeBytes = (value: unknown): number =>
      shapeTextEncoder.encode(canonicalJsonText(value)).byteLength;
    const representativeTurnDigest = digest('physical-observation-turn');
    let observationRecordIndex = 0;
    for (const descriptor of descriptors) {
      const target = qualificationTargetById.get(descriptor.targetId)!;
      if (target.protocolFamily === 'openai-compatible') {
        throw new TypeError(
          'The frozen native matrix cannot use the compatibility protocol.'
        );
      }
      const provider = providerConfigurationById.get(
        target.providerConfigurationId
      )!;
      for (let turnIndex = 0; turnIndex < 7; turnIndex += 1) {
        const observationReceiptId = `observation.${descriptor.attemptId}.${turnIndex}`;
        const invocationId = `invocation.${descriptor.attemptId}.${turnIndex}`;
        const input = Object.freeze({
          observationReceiptId,
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          turnIndex,
          invocationId,
          requestDigest: representativeTurnDigest,
          responseDigest: representativeTurnDigest,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          dispatchIntentDigest: representativeTurnDigest,
          transportReceiptDigest: representativeTurnDigest,
          resultSpoolReceiptDigest: representativeTurnDigest,
          normalizedEventSetDigest: representativeTurnDigest,
          facts: Object.freeze([]),
          factAuthorities: Object.freeze([]),
          observedAt: NOW,
        }) satisfies ObservationInput;
        // Canonical bytes only vary with these encoded text/number widths and
        // the decimal record-index width; all digests have one fixed encoding.
        const shapeKey = [
          observationRecordIndex.toString().length,
          shapeBytes(observationReceiptId),
          shapeBytes(descriptor.attemptId),
          shapeBytes(turnIndex),
          shapeBytes(invocationId),
          shapeBytes(target.protocolFamily),
          shapeBytes(target.providerConfigurationId),
        ].join(':');
        const group = observationShapeGroups.get(shapeKey);
        observationShapeGroups.set(
          shapeKey,
          group === undefined
            ? Object.freeze({
                count: 1,
                recordIndex: observationRecordIndex,
                input,
              })
            : Object.freeze({ ...group, count: group.count + 1 })
        );
        observationRecordIndex += 1;
      }
    }
    let observationCanonicalValueBytes = 0;
    let observationCanonicalOrderKeyBytes = 0;
    let observationCanonicalRecordWrapperBytes = 0;
    let observationShardBytes = 0;
    for (const group of observationShapeGroups.values()) {
      const receipt = createAgentEvaluationProviderCapabilityObservationReceipt(
        group.input,
        observationSanitization
      );
      const record = createAgentModelEvaluationEvidenceArchiveRecord({
        family: 'providerCapabilityObservationReceipts',
        recordIndex: group.recordIndex,
        value: receipt,
      });
      const valueBytes = shapeBytes(receipt);
      const orderKeyBytes = shapeBytes(record.orderKey);
      const lineBytes = shapeTextEncoder.encode(
        encodeAgentModelEvaluationEvidenceArchiveRecordLine(record)
      ).byteLength;
      const wrapperBytes = lineBytes - valueBytes - orderKeyBytes;
      expect(
        isAgentEvaluationProviderCapabilityObservationReceipt(receipt)
      ).toBe(true);
      expect(
        digestAgentModelEvaluationEvidenceArchiveSemanticRecord(
          'providerCapabilityObservationReceipts',
          receipt
        )
      ).toBe(receipt.receiptDigest);
      observationCanonicalValueBytes += valueBytes * group.count;
      observationCanonicalOrderKeyBytes += orderKeyBytes * group.count;
      observationCanonicalRecordWrapperBytes += wrapperBytes * group.count;
      observationShardBytes += lineBytes * group.count;
    }
    const providerObservationPhysicalUsage = Object.freeze({
      family: 'providerCapabilityObservationReceipts' as const,
      recordCount: observationRecordIndex,
      canonicalValueBytes: observationCanonicalValueBytes,
      canonicalOrderKeyBytes: observationCanonicalOrderKeyBytes,
      canonicalRecordWrapperBytes: observationCanonicalRecordWrapperBytes,
      shardBytes: observationShardBytes,
    });
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(
        providerObservationPhysicalUsage
      )
    ).toBe(true);
    // This is the current executable attempt/turn projection. Runtime-produced
    // non-singleton families remain independently bounded and evidence-pending.
    const physicalUsageByFamily = new Map(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.map(
        (family) =>
          [
            family,
            createAgentModelEvaluationEvidenceArchivePhysicalFamilyUsage(
              family,
              AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES.includes(
                family as (typeof AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_SINGLETON_FAMILIES)[number]
              )
                ? [
                    createAgentModelEvaluationEvidenceArchiveRecord({
                      family,
                      recordIndex: 0,
                      value: singletonValue(
                        family,
                        family === 'plan' ? plan : undefined
                      ),
                    }),
                  ]
                : []
            ),
          ] as const
      )
    );
    physicalUsageByFamily.set('attempts', attemptPhysicalUsage.finalize());
    physicalUsageByFamily.set(
      'providerCapabilityObservationReceipts',
      providerObservationPhysicalUsage
    );
    const physicalBudget =
      createAgentModelEvaluationEvidenceArchivePhysicalBudget({
        familyUsages: AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES.map(
          (family) => physicalUsageByFamily.get(family)!
        ),
        indexBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumIndexBytes,
        rootBytes:
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRootBytes,
      });
    expect(observationRecordIndex).toBe(98_280);
    expect(observationShapeGroups.size).toBeGreaterThan(1);
    expect(providerObservationPhysicalUsage.shardBytes).toBe(252_994_370);
    expect(physicalBudget.familyUsages).toHaveLength(46);
    expect(physicalBudget.totalRecordCount).toBe(112_328);
    expect(physicalBudget.totalArchiveBytes).toBe(270_158_038);
    expect(physicalBudget.totalArchiveBytes).toBeLessThanOrEqual(
      AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
    );
    expect(
      isAgentModelEvaluationEvidenceArchivePhysicalBudget(physicalBudget)
    ).toBe(true);
  }, 60_000);

  it('cross-binds shard set, semantic index, raw index, signature, and root v2', async () => {
    const fixture = createArchiveFixture();
    expect(isAgentModelEvaluationEvidenceIndex(fixture.index)).toBe(true);
    expect(decodeAgentModelEvaluationEvidenceIndex(fixture.indexText)).toEqual(
      fixture.index
    );
    expect(
      digestAgentModelEvaluationEvidenceArchiveShardSet(fixture.shards)
    ).toBe(fixture.index.shardSetDigest);
    expect(
      isAgentModelEvaluationEvidenceArchiveAttestation(
        fixture.archiveAttestation
      )
    ).toBe(true);
    await expect(
      verifyAgentModelEvaluationEvidenceArchiveAttestation(
        fixture.archiveAttestation,
        {
          trustedPublicKeys: [
            {
              keyId: fixture.archiveAttestation.keyId,
              publicKeyBase64Url: PUBLIC_KEY,
            },
          ],
          verifyEd25519: ({ message, payload }) =>
            new TextDecoder().decode(message) === canonicalJsonText(payload),
        }
      )
    ).resolves.toBe(true);
    expect(isAgentModelEvaluationEvidenceRoot(fixture.root)).toBe(true);
    expect(
      decodeAgentModelEvaluationEvidenceRoot(
        encodeAgentModelEvaluationEvidenceRoot(fixture.root)
      )
    ).toEqual(fixture.root);
    expect(fixture.root.version).toBe(2);
    expect(fixture.root.evidenceIndexArtifactDigest).toBe(
      digestAgentCanonicalBytes(fixture.indexBytes)
    );
    expect(fixture.index.runConfigArtifactBinding.runConfigFileName).toBe(
      'production-run-config.json'
    );
    expect(fixture.archiveAttestation.sourceConfigDigest).toBe(
      SOURCE_CONFIG_DIGEST
    );
    expect(fixture.root.frozenRunDigest).toBe(FROZEN_RUN_DIGEST);
  });

  it('requires one exact production run-config artifact binding and signed digests', () => {
    const fixture = createArchiveFixture();
    expect(
      isAgentModelEvaluationEvidenceIndex({
        ...fixture.index,
        sourceConfigDigest: digest('drifted-source-config'),
      })
    ).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceArchiveAttestation({
        ...fixture.archiveAttestation,
        frozenRunDigest: digest('drifted-frozen-run'),
      })
    ).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceRoot({
        ...fixture.root,
        runConfigArtifactBinding: {
          ...fixture.root.runConfigArtifactBinding,
          sourcePlanWorkflowRunAttempt: 3,
        },
      })
    ).toBe(false);
    const { sourceConfigDigest: _missingDigest, ...missingDigest } =
      fixture.root;
    expect(isAgentModelEvaluationEvidenceRoot(missingDigest)).toBe(false);
  });

  it('cross-binds the optional human-review lease through roots, index, attestation, and root v2', () => {
    const reviewLeaseDigest = digest('review-lease');
    const fixture = createArchiveFixture({ reviewLeaseDigest });
    expect(fixture.index.authorityRoots.reviewLeaseDigest).toBe(
      reviewLeaseDigest
    );
    expect(fixture.index.reviewLeaseDigest).toBe(reviewLeaseDigest);
    expect(fixture.archiveAttestation.reviewLeaseDigest).toBe(
      reviewLeaseDigest
    );
    expect(fixture.root.reviewLeaseDigest).toBe(reviewLeaseDigest);
    expect(isAgentModelEvaluationEvidenceIndex(fixture.index)).toBe(true);
    expect(
      isAgentModelEvaluationEvidenceArchiveAttestation(
        fixture.archiveAttestation
      )
    ).toBe(true);
    expect(isAgentModelEvaluationEvidenceRoot(fixture.root)).toBe(true);

    const { reviewLeaseDigest: _missingIndexLease, ...missingIndexLease } =
      fixture.index;
    expect(isAgentModelEvaluationEvidenceIndex(missingIndexLease)).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceIndex({
        ...fixture.index,
        reviewLeaseDigest: digest('drifted-review-lease'),
      })
    ).toBe(false);
    const {
      reviewLeaseDigest: _missingAttestationLease,
      ...missingAttestationLease
    } = fixture.archiveAttestation;
    expect(
      isAgentModelEvaluationEvidenceArchiveAttestation(missingAttestationLease)
    ).toBe(false);
    const { reviewLeaseDigest: _missingRootLease, ...missingRootLease } =
      fixture.root;
    expect(isAgentModelEvaluationEvidenceRoot(missingRootLease)).toBe(false);

    const withoutHumanReview = createArchiveFixture();
    expect(withoutHumanReview.index.reviewLeaseDigest).toBeUndefined();
    expect(withoutHumanReview.root.reviewLeaseDigest).toBeUndefined();
    expect(
      isAgentModelEvaluationEvidenceIndex({
        ...withoutHumanReview.index,
        reviewLeaseDigest,
      })
    ).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceArchiveAuthorityRoots({
        ...withoutHumanReview.index.authorityRoots,
        reviewLeaseDigest: undefined,
      })
    ).toBe(false);
  });

  it('fails closed for shard swap, index drift, raw index drift, and root mismatch', () => {
    const fixture = createArchiveFixture();
    expect(() =>
      createAgentModelEvaluationEvidenceIndex({
        ...fixture.index,
        shards: [...fixture.shards].reverse(),
      })
    ).toThrow(/shard set/u);
    expect(
      isAgentModelEvaluationEvidenceIndex({
        ...fixture.index,
        exportLeaseDigest: digest('swapped-lease'),
      })
    ).toBe(false);
    expect(() =>
      createAgentModelEvaluationEvidenceRoot({
        index: fixture.index,
        evidenceIndexArtifactBytes: new TextEncoder().encode(
          `${fixture.indexText} `
        ),
        archiveAttestation: fixture.archiveAttestation,
      })
    ).toThrow(/exact index/u);
    expect(
      isAgentModelEvaluationEvidenceRoot({
        ...fixture.root,
        indexDigest: digest('swapped-index'),
      })
    ).toBe(false);
    expect(
      isAgentModelEvaluationEvidenceRoot({
        ...fixture.root,
        archiveAttestationDigest: digest('swapped-signature'),
      })
    ).toBe(false);
  });
});
