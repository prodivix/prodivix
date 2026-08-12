import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import {
  createV8EvaluationPlan,
  createV8HoldoutReceipt,
  createV8HumanReviewReport,
  createV8PublicReviewRubric,
  createV8QualificationAuthorityArchiveFixture,
  createV8ValidatedHumanReviewArtifact,
  V8_TIME,
} from '../packages/ai/src/__tests__/agentV8Fixtures.ts';
import {
  createAgentHostedRetrievalRuntimeResourceExact4Fixture,
  createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture,
} from '../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures.ts';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
  createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture,
  joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup,
} from '../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceLifecycleJournalFixtures.ts';
import {
  createAgentCapabilityEffectProviderRuntimeJournalFixture,
  createAgentHostedRetrievalProviderResponseFixture,
  finalizeAgentCapabilityEffectProviderRuntimeJournalFixture,
} from '../packages/ai/src/__tests__/agentCapabilityEffectProviderRuntimeFixtures.ts';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
} from '../packages/ai/src/domain/agentCanonical.ts';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../packages/ai/src/usage/agentUsage.ts';
import {
  createAgentProviderCacheReceipt,
  createAgentProviderEvent,
} from '../packages/ai/src/providers/agentInvocationFacts.ts';
import {
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
} from '../packages/ai/src/providers/agentHostedRetrievalRuntimeResource.ts';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../packages/ai/src/providers/agentNativeProviderOptionalCapability.ts';
import {
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultResolveReceipt,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  digestAgentNativeProviderStateReference,
} from '../packages/ai/src/providers/agentNativeProviderStateVault.ts';
import { createAgentCapabilityProbeProgram } from '../packages/ai/src/providers/agentCapabilityProbeProgram.ts';
import {
  createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  decodeAgentNativeProviderCapabilityRuntimeResponse,
} from '../packages/ai/src/providers/agentNativeProviderCapabilityRuntime.ts';
import { createAgentBudgetLedger } from '../packages/ai/src/usage/agentBudgetLedger.ts';
import {
  createAgentEvaluationGraderPlan,
  createAgentModelEvaluationBudget,
  createAgentModelEvaluationPlan,
  createAgentEvaluationRuntimeFactSourceAuthority,
  createAgentModelEvaluationThresholds,
  planAgentModelEvaluationAttempts,
  resolveAgentEvaluationCapabilityDescriptor,
} from '../packages/ai/src/evaluation/agentEvaluationPlan.ts';
import {
  buildAgentEvaluationGraderReport,
  buildAgentEvaluationMetricReport,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationReviewRasterScanReceipt,
  createAgentEvaluationShardCheckpoint,
  createAgentEvaluationTransportAttemptReceipt,
  createAgentEvaluationTransportRetryReceipt,
  createAgentModelEvaluationAttempt,
  createAgentModelEvaluationManifest,
} from '../packages/ai/src/evaluation/agentEvaluationResults.ts';
import {
  createAgentEvaluationExecutionReceipt,
  createAgentEvaluationPlanPricingSourceReceiptId,
  createAgentEvaluationSourceReceipt,
  createAgentModelEvaluationAuthorityAttestation,
  createAgentModelEvaluationAuthorityPayload,
  createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence,
  digestAgentModelEvaluationEvidenceSet,
  digestAgentEvaluationCostValues,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceBundle.ts';
import {
  createAgentEvaluationEndpointSmokeDispatchIntent,
  createAgentEvaluationEndpointSmokeReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
} from '../packages/ai/src/evaluation/agentEvaluationEndpointSmoke.ts';
import {
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolDispositionReceipt,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationProviderResultSpoolId,
  createAgentEvaluationProviderResultSpoolReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationProviderResultSpoolAad,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticity.ts';
import { createAgentEvaluationPreDispatchFailureReceipt } from '../packages/ai/src/evaluation/agentEvaluationPreDispatchFailure.ts';
import {
  createAgentEvaluationCapabilityExecutionReceipt,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilityExecution.ts';
import {
  createAgentEvaluationControlledRuntimeCapabilityFact,
  createAgentEvaluationCapabilityOwnerFact,
  createAgentEvaluationCapabilitySpecificReceipt,
  digestAgentEvaluationCapabilitySpecificAuthoritySemantic,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilitySpecificReceipt.ts';
import {
  createAgentEvaluationProviderCapabilityFactAuthority,
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  createAgentEvaluationProviderCapabilityObservationReceipt,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt,
  digestAgentEvaluationProviderCapabilitySourceAuthoritySet,
  digestAgentEvaluationSelectedRuntimeFactEnvelopeSet,
  isAgentEvaluationProviderCapabilityFactAuthority,
  isAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  selectAgentEvaluationProviderCapabilityObservationFacts,
} from '../packages/ai/src/evaluation/agentEvaluationProviderCapabilityObservation.ts';
import {
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt,
  digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck,
} from '../packages/ai/src/evaluation/agentEvaluationNativeOptionalCapabilityBootstrap.ts';
import {
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  digestAgentEvaluationCapabilityEffectToolArguments,
} from '../packages/ai/src/evaluation/agentEvaluationCapabilityEffectAuthority.ts';
import { createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord } from '../packages/ai/src/evaluation/agentEvaluationCapabilityEffectProviderJournal.ts';
import {
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  digestAgentEvaluationAttemptGrading,
} from '../packages/ai/src/evaluation/agentEvaluationAttemptAuthorityOwnerReceipt.ts';
import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
} from '../packages/ai/src/evaluation/agentEvaluationVerificationAttemptGrant.ts';
import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
} from '../packages/ai/src/evaluation/agentEvaluationResultContract.ts';
import { createAgentEvaluationBlindReviewPreviewProjection } from '../packages/ai/src/evaluation/agentEvaluationBlindReviewProjection.ts';
import { digestAgentEvaluationReviewGraderArtifactAuthority } from '../packages/ai/src/evaluation/agentEvaluationEvidenceAuthenticityValidation.ts';
import { createAgentEvaluationValidatedHumanMetricObservations } from '../packages/ai/src/evaluation/agentEvaluationHumanMetricAuthority.ts';
import {
  AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES,
  AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME,
  AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME,
  createAgentModelEvaluationEvidenceArchiveAttestation,
  createAgentModelEvaluationEvidenceArchiveAttestationPayload,
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots,
  createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveFamilySummary,
  createAgentModelEvaluationEvidenceArchiveOrderKey,
  createAgentModelEvaluationEvidenceArchiveRecord,
  createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator,
  createAgentModelEvaluationEvidenceArchiveShardDescriptor,
  createAgentModelEvaluationEvidenceIndex,
  createAgentModelEvaluationEvidenceRoot,
  encodeAgentModelEvaluationEvidenceArchiveRecordLine,
  encodeAgentModelEvaluationEvidenceIndex,
  encodeAgentModelEvaluationEvidenceRoot,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceArchive.ts';
import { createAgentEvaluationProductionRunConfigArtifactBinding } from '../packages/ai/src/evaluation/agentEvaluationFrozenConfigCommitment.ts';
import {
  createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord,
  createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord,
  createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord,
} from '../packages/ai/src/evaluation/agentEvaluationEvidenceArchiveAuthorityRecords.ts';
import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
} from '../packages/ai/src/providers/agentCapabilityProbeProviderResource.ts';
import {
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
  AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
  createAgentEvaluationOptionalCapabilityFactSourceRequest,
  createAgentEvaluationOptionalCapabilityFactStageRequest,
  decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse,
  decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt,
  decodeAgentEvaluationOptionalCapabilityFactStageResponse,
  digestAgentEvaluationOptionalCapabilityFactAuthorityRequest,
  digestAgentEvaluationOptionalCapabilityFactDispatchAck,
  digestAgentEvaluationOptionalCapabilityFactSourceRequest,
  digestAgentEvaluationOptionalCapabilityFactStage,
} from '../apps/agent-evaluation-runner/src/optionalCapabilityFactAuthorityClient.ts';
import { createAgentEvaluationNativeProviderStateVaultEncryptionProfile } from '../apps/agent-evaluation-runner/src/runConfig.ts';

export const SEMANTIC_FIXTURE_NOW = '2026-08-08T08:00:00.000Z';
const STARTED_AT = '2026-08-02T01:00:00.000Z';
const PROVIDER_COMPLETED_AT = '2026-08-02T01:00:00.001Z';
const OWNER_COMPLETED_AT = '2026-08-02T01:00:00.002Z';
const ATTEMPT_COMPLETED_AT = '2026-08-02T01:00:00.003Z';
const semanticObservationSanitization = Object.freeze({
  protectedMaterialCanaries: Object.freeze(['holdout-canary-semantic-fixture']),
  secretCanaries: Object.freeze(['secret-canary-semantic-fixture']),
});
const sourceConfigDigest = digestAgentCanonicalValue({
  fixture: 'semantic-source-config',
});
const frozenRunDigest = digestAgentCanonicalValue({
  fixture: 'semantic-frozen-run',
});
const createSemanticRunConfigArtifactBinding = (plan) =>
  createAgentEvaluationProductionRunConfigArtifactBinding({
    sourcePlanArtifactName: 'g4-real-model-plan-semantic',
    sourcePlanArtifactDigest: `sha256:${'a'.repeat(64)}`,
    sourcePlanWorkflowRunId: '123456789',
    sourcePlanWorkflowRunAttempt: 1,
    runConfigFileName: 'production-run-config.json',
    runConfigByteLength: 2,
    runConfigCanonicalBytesDigest: sourceConfigDigest,
    sourceConfigDigest,
    frozenRunDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
  });

const createSemanticHostedRuntimeResourceRegistrationIntents = (plan) => {
  const intents = plan.capabilityQualificationTargets.flatMap((target) => {
    const expectedDigest =
      target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority
        ?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
    if (expectedDigest === undefined) return [];
    const provider = plan.providerConfigurations.find(
      ({ providerConfigurationId }) =>
        providerConfigurationId === target.providerConfigurationId
    );
    const model = plan.modelConfigurations.find(
      ({ modelId, lineageDigest }) =>
        modelId === target.modelId &&
        lineageDigest === target.modelLineageDigest
    );
    const probeProgram =
      target.optionalCapabilitySupportAuthority?.probeEvidence.probeProgram;
    if (
      !provider ||
      !model ||
      !probeProgram ||
      (target.protocolFamily !== 'gemini-interactions' &&
        target.protocolFamily !== 'openai-responses') ||
      (target.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
        target.capabilityProfileId !== 'g4-provider-hosted-retrieval-document')
    ) {
      throw new TypeError(
        'Semantic verifier hosted runtime registration intent is incomplete.'
      );
    }
    const intent = createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId: provider.providerConfigurationId,
      providerConfigurationDigest: digestAgentCanonicalValue(provider),
      protocolFamily: target.protocolFamily,
      modelId: model.modelId,
      modelLineageDigest: model.lineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      capabilityProfileId: target.capabilityProfileId,
      capabilityProfileDigest: target.capabilityProfileDigest,
      probeProgramDigest: probeProgram.programDigest,
      publicResourceDescriptorDigest:
        probeProgram.providerRequestIntent.publicProbeResource.descriptorDigest,
    });
    if (intent.intentDigest !== expectedDigest) {
      throw new TypeError(
        'Semantic verifier hosted runtime registration intent drifted from the frozen plan.'
      );
    }
    return [intent];
  });
  if (intents.length !== 4) {
    throw new TypeError(
      'Semantic verifier hosted runtime registration intent set is incomplete.'
    );
  }
  return Object.freeze(
    intents.sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.protocolFamily}\u0000${left.capabilityProfileId}`,
        `${right.protocolFamily}\u0000${right.capabilityProfileId}`
      )
    )
  );
};

const createSemanticHostedRuntimeResourceLifecycleFixture = ({
  fixtureInput,
  checkpoints,
  attempts,
}) => {
  const expectedShardIds = Object.freeze(
    checkpoints.map(({ shardId }) => shardId).sort(compareUnicodeCodePoints)
  );
  const terminalShardLedgerEntries = Object.freeze(
    checkpoints.map((checkpoint) =>
      Object.freeze({
        shardId: checkpoint.shardId,
        shardLeaseGeneration: checkpoint.leaseGeneration,
        checkpointDigest: checkpoint.checkpointDigest,
        checkpointUpdatedAt: checkpoint.updatedAt,
        terminalAttempts: Object.freeze(
          attempts
            .filter(
              ({ descriptor }) => descriptor.shardId === checkpoint.shardId
            )
            .map((attempt) =>
              Object.freeze({
                attemptId: attempt.descriptor.attemptId,
                attemptDigest: attempt.attemptDigest,
                status: attempt.status,
                completedAt: attempt.completedAt,
              })
            )
            .sort((left, right) =>
              compareUnicodeCodePoints(left.attemptId, right.attemptId)
            )
        ),
      })
    )
  );
  return createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
    ...fixtureInput,
    expectedShardIds,
    terminalShardLedgerEntries,
    terminalFenceSealedAt: '2026-08-02T03:00:00.001Z',
    timing: Object.freeze({
      readCheckedAt: '2026-08-02T01:00:00.010Z',
      readExpiresAt: '2026-08-02T01:03:00.010Z',
      cleanupClaimedAt: '2026-08-02T03:00:00.002Z',
      cleanupClaimExpiresAt: '2026-08-02T03:01:00.002Z',
      cleanupDispatchedAt: '2026-08-02T03:00:00.003Z',
      cleanupCompletedAt: '2026-08-02T03:00:00.004Z',
    }),
  });
};

const exportLeaseId = 'evaluation-export-lease:semantic-verifier';
const exportLeaseDigest = digestAgentCanonicalValue({ exportLeaseId });
const authorityIdentity = Object.freeze({
  authorityId: 'evaluation-authority:semantic-verifier',
  keyId: 'evaluation-key:semantic-verifier',
  workflowName: 'g4-real-model-evaluation',
  workflowRunId: 'semantic-verifier-1',
  workflowRunAttempt: 1,
  jobId: 'finalize-semantic-verifier',
  environmentDigest: digestAgentCanonicalValue({
    environment: 'semantic-verifier',
  }),
});
const maximumRecordsPerShard = 2_048;
const spoolNamespaceDigest = digestAgentCanonicalValue(
  'g4-real-model-evaluation'
);
const attemptSpoolProfile = Object.freeze({
  encryptionProfileDigest: digestAgentCanonicalValue('attempt-spool-profile'),
  keyRefDigest: digestAgentCanonicalValue('attempt-spool-key-ref'),
  keyId: 'key.attempt-spool.test',
  keyVersion: 1,
  retention: Object.freeze({
    retentionPolicyDigest: digestAgentCanonicalValue('attempt-spool-retention'),
  }),
});
const endpointSpoolProfile = Object.freeze({
  encryptionProfileDigest: digestAgentCanonicalValue('smoke-spool-profile'),
  keyRefDigest: digestAgentCanonicalValue('smoke-spool-key-ref'),
  keyId: 'key.smoke-spool.test',
  keyVersion: 1,
  retention: Object.freeze({
    retentionPolicyDigest: digestAgentCanonicalValue('smoke-spool-retention'),
  }),
});
const nativeProviderStateVaultEncryption =
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile();

const digest = (label) => digestAgentCanonicalValue({ label });
const canonicalDigest = (base) =>
  Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });

const createSemanticPlan = ({ legacyCoreOnly = false } = {}) => {
  const fixture = createV8EvaluationPlan();
  const {
    plannedJourneyCount: _plannedJourneyCount,
    plannedAttemptSetDigest: _plannedAttemptSetDigest,
    planDigest: _planDigest,
    graderPlan,
    thresholds,
    budget,
    ...input
  } = fixture;
  const { thresholdsDigest: _thresholdsDigest, ...thresholdInput } = thresholds;
  const { planDigest: _graderPlanDigest, ...graderPlanInput } = graderPlan;
  const { budgetDigest: _budgetDigest, ...budgetInput } = budget;
  const publicReviewRubricDigest = createV8PublicReviewRubric().rubricDigest;
  const humanMetrics = [
    'visual.human-quality',
    'visual.information-hierarchy-quality',
    'visual.usability-quality',
    'visual.inter-rater-disagreement',
  ]
    .filter(
      (metricId) =>
        !thresholdInput.metrics.some(
          (threshold) => threshold.metricId === metricId
        )
    )
    .map((metricId) =>
      Object.freeze({
        metricId,
        requiredAuthority: 'human',
        maximumObservedFailureRate: '0',
        maximumUpperConfidenceBound: '1',
        minimumSampleCount: 1,
      })
    );
  return createAgentModelEvaluationPlan({
    ...input,
    ...(legacyCoreOnly
      ? {
          capabilityQualificationTargets:
            input.capabilityQualificationTargets.filter(
              ({ optionalCapabilitySupportAuthority }) =>
                optionalCapabilitySupportAuthority === undefined
            ),
        }
      : {}),
    graderPlan: createAgentEvaluationGraderPlan({
      ...graderPlanInput,
      graders: Object.freeze(
        graderPlanInput.graders.map((grader) =>
          graderPlanInput.blindHumanGraderIds.includes(grader.graderId)
            ? Object.freeze({
                ...grader,
                configurationDigest: publicReviewRubricDigest,
              })
            : grader
        )
      ),
    }),
    thresholds: createAgentModelEvaluationThresholds({
      ...thresholdInput,
      metrics: Object.freeze([...thresholdInput.metrics, ...humanMetrics]),
    }),
    budget: createAgentModelEvaluationBudget({
      ...budgetInput,
      budget: Object.freeze({
        ...budgetInput.budget,
        maxRepairRounds: 1_000_000,
      }),
    }),
  });
};

const createPricingSnapshot = (providerConfigurationId) => {
  const base = Object.freeze({
    pricingSnapshotId: `pricing.${providerConfigurationId}.semantic`,
    providerConfigurationId,
    effectiveAt: V8_TIME.planned,
    rates: Object.freeze([
      Object.freeze({
        unit: 'text-token-input',
        currency: 'USD',
        unitPrice: '0.0000005',
      }),
      Object.freeze({
        unit: 'text-token-output',
        currency: 'USD',
        unitPrice: '0.0000005',
      }),
    ]),
    sourceDigest: digestAgentCanonicalValue({
      providerConfigurationId,
      source: 'semantic-pricing',
    }),
  });
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

const createVerificationAttemptGrantReceipt = ({ plan, descriptor }) => {
  const verificationPlanDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    verificationPlan: 'semantic-fixture',
  });
  const cellId = `cell.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`;
  const grantDigestBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: 'workspace.g4-evaluation',
    projectId: 'project.g4-evaluation',
    workspaceRevision: 1,
    partitionRevisionsDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      partitionRevisions: 'frozen',
    }),
    policyRevision: 1,
    policyDigest: plan.policyDigest,
    policyEvaluationInstant: STARTED_AT,
    impactDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      impact: 'verified',
    }),
    planDigest: verificationPlanDigest,
    cellId,
    checkId: 'check.g4-evaluation',
    checkKind: 'e2e',
    targetId: descriptor.targetId,
    attemptId: descriptor.attemptId,
    runId: `verification-run.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    providerId: 'provider.g4-evaluation',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'ci-attested',
    retentionRequest: Object.freeze({
      successful: 'release',
      failed: 'release',
      protectReleaseEvidence: true,
    }),
    maximumClosureEvidenceRecords: 1_000,
    issuedBy: 'g4-evaluation.semantic-fixture',
    issuedAt: STARTED_AT,
    expiresAt: V8_TIME.expires,
  });
  const grantDigest = digestAgentCanonicalValue(grantDigestBase);
  const grant = Object.freeze({
    grantId: `attempt-grant-${grantDigest.slice('sha256-'.length)}`,
    grantDigest,
    workspaceId: grantDigestBase.workspaceId,
    projectId: grantDigestBase.projectId,
    workspaceRevision: grantDigestBase.workspaceRevision,
    partitionRevisionsDigest: grantDigestBase.partitionRevisionsDigest,
    policyRevision: grantDigestBase.policyRevision,
    policyDigest: grantDigestBase.policyDigest,
    policyEvaluationInstant: grantDigestBase.policyEvaluationInstant,
    impactDigest: grantDigestBase.impactDigest,
    verificationPlanDigest,
    cellId,
    checkId: grantDigestBase.checkId,
    checkKind: grantDigestBase.checkKind,
    targetId: grantDigestBase.targetId,
    attemptId: descriptor.attemptId,
    runId: grantDigestBase.runId,
    providerId: grantDigestBase.providerId,
    producerId: grantDigestBase.producerId,
    trustCeiling: grantDigestBase.trustCeiling,
    retentionRequest: grantDigestBase.retentionRequest,
    maximumClosureEvidenceRecords:
      grantDigestBase.maximumClosureEvidenceRecords,
    issuedBy: grantDigestBase.issuedBy,
    issuedAt: grantDigestBase.issuedAt,
    expiresAt: grantDigestBase.expiresAt,
  });
  const binding = Object.freeze({
    namespaceId: 'g4-model-evaluation',
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation: 1,
    workspaceId: grant.workspaceId,
    workspaceRevision: grant.workspaceRevision,
    projectId: grant.projectId,
    verificationPlanDigest,
    cellId,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
    namespaceId: binding.namespaceId,
    evaluationPlanDigest: binding.evaluationPlanDigest,
    repositoryCommit: binding.repositoryCommit,
    evaluationAttemptId: binding.evaluationAttemptId,
    descriptorDigest: binding.descriptorDigest,
    capabilityDescriptorDigest: binding.capabilityDescriptorDigest,
    caseId: binding.caseId,
    generation: binding.generation,
    verificationPlanDigest,
    cellId,
    requestDigest: digestAgentCanonicalValue({
      ...binding,
      request: 'verification-attempt-grant',
    }),
    issuanceBindingDigest: digestAgentCanonicalValue(binding),
    grant,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const createResultSubmissionReceipt = ({
  descriptor,
  concreteCase,
  invocationId,
  materialDigest,
  responseDigest,
}) => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-result-submission-receipt',
    version: 1,
    attemptId: descriptor.attemptId,
    invocationId,
    descriptorDigest: descriptor.descriptorDigest,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    materialDigest,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
    nativeToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
    toolVersion: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
    schemaDigest: digest('semantic-result-schema'),
    inputSchemaDigest: digestAgentCanonicalValue({
      caseId: concreteCase.caseId,
      schema: 'case-result-input',
    }),
    toolDefinitionDigest: digest('semantic-result-submit-tool'),
    providerToolCallId: `result-submit.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    toolArgumentsDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      result: 'submitted',
    }),
    toolEventSequence: 1,
    toolEventDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      event: 'tool-result-submitted',
    }),
    terminalEventSequence: 2,
    terminalEventDigest: responseDigest,
    submissionDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      submission: 'validated',
    }),
  });
  return canonicalDigest(base);
};

const createControlledRuntimeReceipt = ({
  plan,
  descriptor,
  concreteCase,
  materialDigest,
  resultSubmissionReceipt,
  verificationAttemptGrantReceipt,
  controlledPreview,
  toolCallCount = 0,
}) => {
  const verificationAttemptGrantReceiptDigests = Object.freeze([
    verificationAttemptGrantReceipt.receiptDigest,
  ]);
  const ownerAuthorityReceiptDigests = Object.freeze([
    verificationAttemptGrantReceipt.receiptDigest,
  ]);
  const operationSealReceiptDigests = Object.freeze(
    Array.from({ length: toolCallCount }, (_, index) =>
      digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        operationSeal: index,
      })
    ).sort(compareUnicodeCodePoints)
  );
  const toolReceiptSetDigest =
    toolCallCount > 0
      ? digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          toolCallCount,
          toolReceipts: 'shared-capability',
        })
      : undefined;
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-controlled-runtime-receipt',
    version: 1,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    materialDigest,
    submissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    runtimeAuthorityId: 'runtime.g4-evaluation-semantic-fixture',
    runtimeImplementationDigest: digest('semantic-controlled-runtime'),
    artifactResolutionPolicyDigest: digest('semantic-artifact-resolution'),
    proposalValidationPolicyDigest: digest('semantic-proposal-validation'),
    isolationPolicyDigest: digest('semantic-runtime-isolation'),
    g3VerificationPolicyDigest: digest('semantic-g3-verification'),
    controlledRenderPolicyDigest: digest('semantic-controlled-render'),
    loopPolicyDigest: digest('semantic-loop-policy'),
    maximumTurnsPerAttempt: 7,
    maximumToolCallsPerAttempt: 4,
    maximumRepairRoundsPerAttempt: 1,
    maximumAggregateArtifactBytes: 8_388_608,
    grantDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      grant: 'controlled-runtime',
    }),
    grantGeneration: 1,
    verificationAttemptGrantReceiptDigests,
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet(
        verificationAttemptGrantReceiptDigests
      ),
    toolRegistryDigest: plan.toolRegistryDigest,
    actionRegistryDigest: plan.actionRegistryDigest,
    operationSealReceiptDigests,
    ownerAuthorityReceiptDigests,
    baseSnapshotDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      snapshot: 'base',
    }),
    finalSnapshotDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      snapshot: 'final',
    }),
    cleanupReceiptDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      cleanup: 'complete',
    }),
    sourceReferencesRevoked: true,
    sandboxDestroyed: true,
    ownerAuthoritySetDigest: digestAgentCanonicalValue({
      ownerAuthorityReceiptDigests,
    }),
    ...(toolCallCount > 0
      ? {
          toolExecutionReceiptSetDigest: digestAgentCanonicalValue({
            attemptId: descriptor.attemptId,
            toolCallCount,
            toolExecutionReceipts: 'shared-capability',
          }),
          operationIntentSetDigest: digestAgentCanonicalValue({
            attemptId: descriptor.attemptId,
            toolCallCount,
            operationIntents: 'shared-capability',
          }),
          operationSealSetDigest: digestAgentCanonicalValue({
            operationSealReceiptDigests,
          }),
        }
      : {}),
    artifactResolution: Object.freeze({
      resolvedArtifactCount: controlledPreview ? 1 : 0,
      resolvedArtifactBytes: controlledPreview?.byteLength ?? 0,
      artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        artifactResolution: 'complete',
      }),
    }),
    proposalValidation: Object.freeze({
      verdict: 'passed',
      typedProposalValidationReceiptDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        proposal: 'passed',
      }),
    }),
    isolatedExecution: Object.freeze({
      isolationPolicyDigest: digest('semantic-runtime-isolation'),
      toolCallCount,
      repairRoundCount: 0,
      commandCount: 0,
      commandReceiptSetDigest: digestAgentCanonicalValue({
        commandReceiptDigests: [],
      }),
      transactionCount: controlledPreview ? 1 : 0,
      ...(toolReceiptSetDigest ? { toolReceiptSetDigest } : {}),
      ...(controlledPreview
        ? {
            transactionReceiptSetDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              transactionReceiptDigests: [
                digestAgentCanonicalValue({
                  attemptId: descriptor.attemptId,
                  transaction: 'review-preview',
                }),
              ],
            }),
          }
        : {}),
    }),
    g3Verification: Object.freeze({
      verificationPlanReceiptDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        verificationPlan: 'executed',
      }),
      verificationClosureDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        closure: 'satisfied',
      }),
      verdict: 'passed',
    }),
    ...(controlledPreview ? { controlledPreview } : {}),
  });
  return canonicalDigest(base);
};

const createInvocationReceipt = ({
  plan,
  descriptor,
  target,
  provider,
  model,
  invocationId,
  independentRunId,
  contextPackDigest,
  requestDigest,
  responseDigest,
  usage,
  cost,
}) => {
  const base = Object.freeze({
    invocationId,
    taskId: plan.evaluationPlanId,
    runId: independentRunId,
    generation: 0,
    attempt: descriptor.repetitionIndex,
    provider,
    model,
    capabilityQualificationDigest: target.qualificationSliceDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    contextPackDigest,
    requestDigest,
    responseDigest,
    outcome: 'completed',
    usage,
    costStatus: 'priced',
    cost,
    pricingSnapshotRef: `pricing.${provider.providerConfigurationId}.semantic`,
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  return canonicalDigest(base);
};

const createPreDispatchContext = ({
  plan,
  descriptor,
  concreteCase,
  resolvedCapabilityDescriptor,
}) => {
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const invocationId = `invocation.pre-dispatch.${suffix}`;
  const failure = createAgentEvaluationPreDispatchFailureReceipt({
    failureReceiptId: `pre-dispatch-failure.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    stage: 'dispatch-admission',
    reasonCode: 'verification-attempt-grant-unavailable',
    policyDigest: plan.policyDigest,
    inputDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      input: 'dispatch-admission',
    }),
    findingDigest: digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      finding: 'grant-unavailable',
    }),
    occurredAt: PROVIDER_COMPLETED_AT,
  });
  const turn = createAgentEvaluationInvocationTurnReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    status: 'infrastructure-error',
    dispatchState: 'not-created',
    terminal: true,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    contextPackDigest: digestAgentCanonicalValue({
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      context: 'pre-dispatch',
    }),
    executionFailureAuthorityReceiptDigest: failure.receiptDigest,
  });
  const turnSet = createAgentEvaluationInvocationTurnSetReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turns: Object.freeze([turn]),
  });
  const capabilityExecution = createAgentEvaluationCapabilityExecutionReceipt({
    capabilityExecutionReceiptId: `capability-execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    targetId: descriptor.targetId,
    targetDigest: descriptor.targetDigest,
    capabilityProfileId: concreteCase.capabilityProfileId,
    capabilityId: resolvedCapabilityDescriptor.capabilityId,
    supportExpectation: resolvedCapabilityDescriptor.supportExpectation,
    expectedToolIds: resolvedCapabilityDescriptor.expectedToolIds,
    expectedReceiptKinds: resolvedCapabilityDescriptor.expectedReceiptKinds,
    capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
    toolBindings: Object.freeze([]),
    outcome: 'failed',
    verdict: 'failed',
    specificReceiptDigests: Object.freeze([]),
    attemptAuthorityOwnerReceiptDigests: Object.freeze([]),
    policyDigest: plan.policyDigest,
    toolRegistryDigest: plan.toolRegistryDigest,
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const capabilityExecutionReceiptSetDigest =
    digestAgentEvaluationCapabilityExecutionReceiptSet([capabilityExecution]);
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationVerificationAttemptGrantReceiptSet([]);
  const execution = createAgentEvaluationExecutionReceipt({
    executionReceiptId: `execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    modelInvocations: 0,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 1,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
  });
  const observation = createAgentEvaluationMetricObservation({
    metricId: 'authority.correctness',
    graderId: 'grader.strict-authority.v8',
    graderKind: 'deterministic-rule',
    authority: 'deterministic',
    verdict: 'passed',
  });
  const attempt = createAgentModelEvaluationAttempt({
    descriptor,
    independentRunId: `run.${suffix}`,
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet(
      []
    ),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet([]),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet([turn]),
    invocationTurnSetReceiptDigest: turnSet.receiptDigest,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    responseDigest: failure.findingDigest,
    status: 'completed',
    outcome: 'passed',
    metricObservations: Object.freeze([observation]),
    usage: turnSet.aggregateUsage,
    cost: turnSet.aggregateCost,
    startedAt: STARTED_AT,
    completedAt: ATTEMPT_COMPLETED_AT,
  });
  return Object.freeze({
    attempt,
    failure,
    turn,
    turnSet,
    capabilityExecution,
    execution,
  });
};

const createNativeProviderCapabilityObservationReceipt = (input) => {
  const sourceAuthority = Object.freeze({
    sourceAuthorityKind: 'native-provider-transport',
    sourceAuthorityId: input.providerConfigurationId,
    sourceAuthorityImplementationDigest: input.adapterDigest,
  });
  const envelopes = Object.freeze(
    input.facts.map((fact) =>
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        {
          ...sourceAuthority,
          stageDigest: input.dispatchIntentDigest,
          dispatchAckDigest: input.transportReceiptDigest,
          planDigest: input.planDigest,
          repositoryCommit: input.repositoryCommit,
          attemptId: input.attemptId,
          descriptorDigest: input.descriptorDigest,
          turnIndex: input.turnIndex,
          invocationId: input.invocationId,
          requestDigest: input.requestDigest,
          responseDigest: input.responseDigest,
          protocolFamily: input.protocolFamily,
          providerConfigurationId: input.providerConfigurationId,
          modelLineageDigest: input.modelLineageDigest,
          adapterDigest: input.adapterDigest,
          dispatchIntentDigest: input.dispatchIntentDigest,
          transportReceiptDigest: input.transportReceiptDigest,
          resultSpoolReceiptDigest: input.resultSpoolReceiptDigest,
          normalizedEventSetDigest: input.normalizedEventSetDigest,
          observedAt: input.observedAt,
          fact,
        },
        semanticObservationSanitization
      )
    )
  );
  const selection = selectAgentEvaluationProviderCapabilityObservationFacts({
    envelopes,
    requiredFactKinds: Object.freeze(
      input.facts.map(({ factKind }) => factKind)
    ),
    admittedSourceAuthorities: Object.freeze([sourceAuthority]),
    sanitization: semanticObservationSanitization,
  });
  return createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      ...input,
      facts: selection.facts,
      factAuthorities: selection.factAuthorities,
    },
    semanticObservationSanitization
  );
};

const createAdditionalProviderTurnEvidence = ({
  plan,
  descriptor,
  target,
  provider,
  model,
  contextPackDigest,
  turnIndex,
  baseUsage,
  baseCost,
}) => {
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const invocationId = `invocation.${suffix}.turn-${turnIndex}`;
  const independentRunId = `run.${suffix}`;
  const requestDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    direction: 'request',
    turnIndex,
  });
  const responseDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    direction: 'response',
    turnIndex,
  });
  const providerRequestId = `provider-request.${suffix}.turn-${turnIndex}`;
  const usageSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'reported-usage',
  });
  const costSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'reported-cost',
  });
  const usage = createAgentUsageVector(
    baseUsage.amounts.map((amount) =>
      Object.freeze({
        ...amount,
        sourceDigest: usageSourceContentDigest,
      })
    )
  );
  const cost = normalizeAgentCosts(
    baseCost.map((value) =>
      Object.freeze({
        ...value,
        sourceDigest: costSourceContentDigest,
      })
    )
  );
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.usage.${suffix}.turn-${turnIndex}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: usageSourceContentDigest,
    inputUsageDigest: usage.vectorDigest,
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.cost.${suffix}.turn-${turnIndex}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-cost',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: costSourceContentDigest,
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const invocationReceipt = createInvocationReceipt({
    plan,
    descriptor,
    target,
    provider,
    model,
    invocationId,
    independentRunId,
    contextPackDigest,
    requestDigest,
    responseDigest,
    usage,
    cost,
  });
  const requestBodyDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    body: 'provider-request',
    turnIndex,
  });
  const endpointClass =
    target.protocolFamily === 'openai-compatible'
      ? 'local'
      : 'first-party-hosted';
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: `intent.${suffix}.turn-${turnIndex}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    invocationId,
    budgetReservationId: 'semantic-budget-reservation',
    demandDigest: digest('semantic-budget-demand'),
    requestDigest,
    endpointId: `endpoint.${provider.providerConfigurationId}`,
    endpointClass,
    requestBodyDigest,
    requestBytes: 1,
    createdAt: STARTED_AT,
  });
  const responseHeaderDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    responseHeaders: 'sanitized',
    turnIndex,
  });
  const responseBodyDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    body: 'provider-response',
    turnIndex,
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: `transport.${suffix}.turn-${turnIndex}`,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass,
    requestBodyDigest,
    requestBytes: 1,
    responseBytes: 1,
    httpStatus: 200,
    responseHeaderDigest,
    responseBodyDigest,
    providerRequestId,
    providerIdentityKind:
      target.protocolFamily === 'anthropic-messages'
        ? 'message-id'
        : target.protocolFamily === 'gemini-interactions'
          ? 'interaction-id'
          : 'response-id',
    providerResponseId: `provider-response.${suffix}.turn-${turnIndex}`,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    sseEventCount: 2,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest,
    status: 'completed',
    retryable: false,
    invocationReceiptDigest: invocationReceipt.receiptDigest,
    responseDigest,
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digest('semantic-transport-retry-policy'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: false,
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    events: ['created', 'completed'],
    turnIndex,
  });
  const spoolAad = createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: spoolNamespaceDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex,
    invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    responseBodyDigest,
    normalizedEventSetDigest,
  });
  const spoolEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationProviderResultSpoolId(spoolAad),
    algorithm: 'aes-256-gcm',
    keyId: attemptSpoolProfile.keyId,
    keyVersion: attemptSpoolProfile.keyVersion,
    keyRefDigest: attemptSpoolProfile.keyRefDigest,
    encryptionProfileDigest: attemptSpoolProfile.encryptionProfileDigest,
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationProviderResultSpoolAad(spoolAad),
  });
  const providerResultSpoolReceipt =
    createAgentEvaluationProviderResultSpoolReceipt({
      aad: spoolAad,
      envelope: spoolEnvelope,
      responseDigest,
      retentionClass: 'attempt-resume-only',
      retentionPolicyDigest:
        attemptSpoolProfile.retention.retentionPolicyDigest,
      createdAt: PROVIDER_COMPLETED_AT,
      expiresAt: V8_TIME.expires,
    });
  const providerResultSpoolDispositionReceipt =
    createAgentEvaluationProviderResultSpoolDispositionReceipt({
      spoolRef: providerResultSpoolReceipt.spoolRef,
      spoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      disposition: 'consumed-and-destroyed',
      retentionPolicyDigest: providerResultSpoolReceipt.retentionPolicyDigest,
      disposedAt: OWNER_COMPLETED_AT,
    });
  return Object.freeze({
    turnIndex,
    invocationId,
    requestDigest,
    responseDigest,
    providerRequestId,
    invocationReceipt,
    dispatchIntent,
    transportReceipt,
    transportRetryReceipt,
    providerResultSpoolReceipt,
    providerResultSpoolDispositionReceipt,
    responseHeaderDigest,
    normalizedEventSetDigest,
    usageSourceReceipt,
    costSourceReceipt,
  });
};

const createProviderTurnReceipt = ({
  plan,
  descriptor,
  concreteCase,
  target,
  model,
  contextPackDigest,
  evidence,
  terminal,
  resultSubmissionReceipt,
  controlledRuntime,
}) =>
  createAgentEvaluationInvocationTurnReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: evidence.turnIndex,
    invocationId: evidence.invocationId,
    status: 'completed',
    dispatchState: 'dispatched',
    terminal,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    contextPackDigest,
    requestArtifactDigest: evidence.requestDigest,
    dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
    transportReceiptDigest: evidence.transportReceipt.receiptDigest,
    transportRetryReceipt: evidence.transportRetryReceipt,
    invocationReceipt: evidence.invocationReceipt,
    providerRequestId: evidence.providerRequestId,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    resolvedModelIdentityDigest: digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: target.protocolFamily,
      transportReceiptDigest: evidence.transportReceipt.receiptDigest,
      frozenModelId: model.modelId,
      ...(model.immutableVersion
        ? { frozenImmutableModelVersion: model.immutableVersion }
        : {}),
      resolvedModelId: model.modelId,
      ...(model.immutableVersion
        ? { resolvedModelVersion: model.immutableVersion }
        : {}),
    }),
    responseHeaderDigest: evidence.responseHeaderDigest,
    responseArtifactDigest: evidence.responseDigest,
    providerResultSpoolReceiptDigest:
      evidence.providerResultSpoolReceipt.receiptDigest,
    usageSourceReceiptDigest: evidence.usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: evidence.costSourceReceipt.receiptDigest,
    ...(terminal
      ? {
          resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
          controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
        }
      : {
          continuationReceiptDigest: digestAgentCanonicalValue({
            attemptId: descriptor.attemptId,
            turnIndex: evidence.turnIndex,
            invocationId: evidence.invocationId,
            responseDigest: evidence.responseDigest,
            continuation: 'provider-turn',
          }),
        }),
  });

const createFullContext = ({
  plan,
  descriptor,
  concreteCase,
  target,
  resolvedCapabilityDescriptor,
  provider,
  model,
  pricingSnapshot,
  blockedReceiptKind,
  includeObservedCacheSpecific,
  includeReviewCandidate,
}) => {
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const invocationId = `invocation.${suffix}`;
  const independentRunId = `run.${suffix}`;
  const requestDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    direction: 'request',
  });
  const responseDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    direction: 'response',
  });
  const contextPackDigest = digestAgentCanonicalValue({
    contextBuilderDigest: plan.contextBuilderDigest,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
  });
  const materialDigest = digestAgentCanonicalValue({
    caseId: concreteCase.caseId,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
  });
  const providerRequestId = `provider-request.${suffix}`;
  const usageSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'reported-usage',
  });
  const costSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'reported-cost',
  });
  const usage = createAgentUsageVector([
    Object.freeze({
      unit: 'text-token-input',
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported',
      sourceDigest: usageSourceContentDigest,
    }),
    Object.freeze({
      unit: 'text-token-output',
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported',
      sourceDigest: usageSourceContentDigest,
    }),
  ]);
  const cost = normalizeAgentCosts([
    Object.freeze({
      currency: 'USD',
      amount: '0.000001',
      confidence: 'reported',
      sourceDigest: costSourceContentDigest,
    }),
  ]);
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.usage.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: usageSourceContentDigest,
    inputUsageDigest: usage.vectorDigest,
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.cost.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-cost',
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    providerRequestId,
    sourceContentDigest: costSourceContentDigest,
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const invocationReceipt = createInvocationReceipt({
    plan,
    descriptor,
    target,
    provider,
    model,
    invocationId,
    independentRunId,
    contextPackDigest,
    requestDigest,
    responseDigest,
    usage,
    cost,
  });
  const requestBodyDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    body: 'provider-request',
  });
  const endpointClass =
    target.protocolFamily === 'openai-compatible'
      ? 'local'
      : 'first-party-hosted';
  const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
    intentId: `intent.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    modelLineageDigest: model.lineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    invocationId,
    budgetReservationId: 'semantic-budget-reservation',
    demandDigest: digest('semantic-budget-demand'),
    requestDigest,
    endpointId: `endpoint.${provider.providerConfigurationId}`,
    endpointClass,
    requestBodyDigest,
    requestBytes: 1,
    createdAt: STARTED_AT,
  });
  const responseHeaderDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    responseHeaders: 'sanitized',
  });
  const responseBodyDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    body: 'provider-response',
  });
  const transportReceipt = createAgentEvaluationTransportReceipt({
    receiptId: `transport.${suffix}`,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: provider.providerConfigurationId,
    invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    requestDigest,
    endpointId: dispatchIntent.endpointId,
    endpointClass,
    requestBodyDigest,
    requestBytes: 1,
    responseBytes: 1,
    httpStatus: 200,
    responseHeaderDigest,
    responseBodyDigest,
    providerRequestId,
    providerIdentityKind:
      target.protocolFamily === 'anthropic-messages'
        ? 'message-id'
        : target.protocolFamily === 'gemini-interactions'
          ? 'interaction-id'
          : 'response-id',
    providerResponseId: `provider-response.${suffix}`,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    sseEventCount: 2,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest,
    status: 'completed',
    retryable: false,
    invocationReceiptDigest: invocationReceipt.receiptDigest,
    responseDigest,
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digest('semantic-transport-retry-policy'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: false,
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    attemptId: descriptor.attemptId,
    events: ['created', 'completed'],
  });
  const spoolAad = createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: spoolNamespaceDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    responseBodyDigest,
    normalizedEventSetDigest,
  });
  const spoolEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationProviderResultSpoolId(spoolAad),
    algorithm: 'aes-256-gcm',
    keyId: attemptSpoolProfile.keyId,
    keyVersion: attemptSpoolProfile.keyVersion,
    keyRefDigest: attemptSpoolProfile.keyRefDigest,
    encryptionProfileDigest: attemptSpoolProfile.encryptionProfileDigest,
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationProviderResultSpoolAad(spoolAad),
  });
  const providerResultSpoolReceipt =
    createAgentEvaluationProviderResultSpoolReceipt({
      aad: spoolAad,
      envelope: spoolEnvelope,
      responseDigest,
      retentionClass: 'attempt-resume-only',
      retentionPolicyDigest:
        attemptSpoolProfile.retention.retentionPolicyDigest,
      createdAt: PROVIDER_COMPLETED_AT,
      expiresAt: V8_TIME.expires,
    });
  const providerResultSpoolDispositionReceipt =
    createAgentEvaluationProviderResultSpoolDispositionReceipt({
      spoolRef: providerResultSpoolReceipt.spoolRef,
      spoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId,
      disposition: 'consumed-and-destroyed',
      retentionPolicyDigest: providerResultSpoolReceipt.retentionPolicyDigest,
      disposedAt: OWNER_COMPLETED_AT,
    });
  const providerCacheReceipt = includeObservedCacheSpecific
    ? createAgentProviderCacheReceipt({
        receipt: Object.freeze({
          cacheMode: 'prompt',
          cacheScope: 'invocation',
          cacheKeyDigest: digestAgentCanonicalValue({
            invocationId,
            cache: 'semantic-observation',
          }),
          prefixOrItemDigests: Object.freeze([
            digestAgentCanonicalValue({
              requestDigest,
              cacheItem: 'semantic-observation',
            }),
          ]),
          usageRef: `usage.semantic.${suffix}`,
        }),
        isolation: 'invocation',
      })
    : undefined;
  const providerTerminalEvent =
    includeObservedCacheSpecific || blockedReceiptKind !== undefined
      ? createAgentProviderEvent({
          eventId: `provider-event.completed.${suffix}`,
          invocationId,
          sequence: 1,
          type:
            blockedReceiptKind === 'authority-denial-receipt'
              ? 'refusal'
              : 'completed',
          payloadDigest: responseDigest,
          occurredAt: PROVIDER_COMPLETED_AT,
        })
      : undefined;
  const providerCapabilityObservationReceipt = providerTerminalEvent
    ? createNativeProviderCapabilityObservationReceipt({
        observationReceiptId: `provider-observation.${suffix}`,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId,
        requestDigest,
        responseDigest,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: provider.providerConfigurationId,
        modelLineageDigest: model.lineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        dispatchIntentDigest: dispatchIntent.intentDigest,
        transportReceiptDigest: transportReceipt.receiptDigest,
        resultSpoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
        normalizedEventSetDigest,
        facts: Object.freeze([
          ...(providerCacheReceipt
            ? [
                Object.freeze({
                  factKind: 'provider-cache-receipt',
                  factDigest: providerCacheReceipt.receiptDigest,
                  value: providerCacheReceipt,
                }),
              ]
            : []),
          Object.freeze({
            factKind: 'provider-event',
            factDigest: providerTerminalEvent.eventDigest,
            value: providerTerminalEvent,
          }),
        ]),
        observedAt: PROVIDER_COMPLETED_AT,
      })
    : undefined;
  const verificationAttemptGrantReceipt = createVerificationAttemptGrantReceipt(
    { plan, descriptor }
  );
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationVerificationAttemptGrantReceiptSet([
      verificationAttemptGrantReceipt,
    ]);
  const resultSubmissionReceipt = createResultSubmissionReceipt({
    descriptor,
    concreteCase,
    invocationId,
    materialDigest,
    responseDigest,
  });
  const controlledPreview = includeReviewCandidate
    ? Object.freeze({
        artifactRef: `preview.${suffix}`,
        artifactDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          preview: 'raster',
        }),
        mediaType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 1,
        renderPolicyDigest: digest('semantic-controlled-render'),
      })
    : undefined;
  const controlledRuntime = createControlledRuntimeReceipt({
    plan,
    descriptor,
    concreteCase,
    materialDigest,
    resultSubmissionReceipt,
    verificationAttemptGrantReceipt,
    controlledPreview,
  });
  const controlledRuntimeFact =
    createAgentEvaluationControlledRuntimeCapabilityFact(controlledRuntime);
  const ownerImplementationDigest = digest(
    'semantic-capability-owner-implementation'
  );
  const assessmentRequestDigest = digestAgentCanonicalValue({
    operation: 'assess-capability',
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
  });
  const denialFact = blockedReceiptKind
    ? createAgentEvaluationCapabilityOwnerFact({
        authorityKind: 'capability-denial',
        category: blockedReceiptKind,
        authorityId: 'authority.capability-denial.semantic-fixture',
        authorityImplementationDigest: ownerImplementationDigest,
        policyDigest: plan.policyDigest,
        authorityRequestDigest: assessmentRequestDigest,
        authorityResultDigest: responseDigest,
        reasonCode: 'capability-policy-rejected',
        decisionDigest: responseDigest,
        observedAt: PROVIDER_COMPLETED_AT,
      })
    : undefined;
  const denialSpecificReceipt = denialFact
    ? createAgentEvaluationCapabilitySpecificReceipt({
        receiptId: `capability-specific.denial.${suffix}`,
        receiptKind: blockedReceiptKind,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        caseId: concreteCase.caseId,
        materialDigest,
        capabilityDescriptorDigest:
          resolvedCapabilityDescriptor.descriptorDigest,
        turnIndex: 0,
        invocationId,
        providerCapabilityObservationReceiptDigest:
          providerCapabilityObservationReceipt.receiptDigest,
        requestDigest,
        resultDigest: responseDigest,
        startedAt: STARTED_AT,
        completedAt: PROVIDER_COMPLETED_AT,
        authority: Object.freeze({
          authorityKind: 'capability-denial',
          receiptKind: blockedReceiptKind,
          factDigest: denialFact.factDigest,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
              authorityKind: 'capability-denial',
              receiptKind: blockedReceiptKind,
              factDigest: denialFact.factDigest,
            }),
          fact: denialFact,
        }),
      })
    : undefined;
  const cacheSpecificReceipt =
    providerCapabilityObservationReceipt && providerCacheReceipt
      ? createAgentEvaluationCapabilitySpecificReceipt({
          receiptId: `capability-specific.cache.${suffix}`,
          receiptKind: 'cache-lineage-receipt',
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          caseId: concreteCase.caseId,
          materialDigest,
          capabilityDescriptorDigest:
            resolvedCapabilityDescriptor.descriptorDigest,
          turnIndex: 0,
          invocationId,
          providerCapabilityObservationReceiptDigest:
            providerCapabilityObservationReceipt.receiptDigest,
          requestDigest,
          resultDigest: responseDigest,
          startedAt: STARTED_AT,
          completedAt: PROVIDER_COMPLETED_AT,
          authority: Object.freeze({
            authorityKind: 'provider-cache',
            receiptKind: 'cache-lineage-receipt',
            factDigest: providerCacheReceipt.receiptDigest,
            semanticDigest:
              digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
                authorityKind: 'provider-cache',
                receiptKind: 'cache-lineage-receipt',
                factDigest: providerCacheReceipt.receiptDigest,
              }),
            fact: providerCacheReceipt,
          }),
        })
      : undefined;
  const verificationClosureSpecificReceipt =
    blockedReceiptKind === 'capability-unavailable-receipt' &&
    resolvedCapabilityDescriptor.expectedReceiptKinds.includes(
      'verification-closure-receipt'
    )
      ? createAgentEvaluationCapabilitySpecificReceipt({
          receiptId: `capability-specific.verification-closure.${suffix}`,
          receiptKind: 'verification-closure-receipt',
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          caseId: concreteCase.caseId,
          materialDigest,
          capabilityDescriptorDigest:
            resolvedCapabilityDescriptor.descriptorDigest,
          turnIndex: 0,
          invocationId,
          requestDigest,
          resultDigest: responseDigest,
          startedAt: STARTED_AT,
          completedAt: PROVIDER_COMPLETED_AT,
          authority: Object.freeze({
            authorityKind: 'controlled-runtime',
            receiptKind: 'verification-closure-receipt',
            factDigest: controlledRuntimeFact.factDigest,
            semanticDigest:
              digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
                authorityKind: 'controlled-runtime',
                receiptKind: 'verification-closure-receipt',
                factDigest: controlledRuntimeFact.factDigest,
              }),
            fact: controlledRuntimeFact,
          }),
        })
      : undefined;
  const capabilitySpecificReceipts = Object.freeze(
    [
      denialSpecificReceipt,
      cacheSpecificReceipt,
      verificationClosureSpecificReceipt,
    ].filter((receipt) => receipt !== undefined)
  );
  const capabilityOutcome = blockedReceiptKind ? 'unsupported' : 'failed';
  const assessmentOwner = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'capability-runtime',
    operation: 'assess-capability',
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
    shardLeaseGeneration: 1,
    verificationGrantGeneration: verificationAttemptGrantReceipt.generation,
    verificationAttemptGrantReceiptSetDigest,
    requestDigest: assessmentRequestDigest,
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'assess-capability',
      {
        outcome: capabilityOutcome,
        specificReceipts: capabilitySpecificReceipts,
      },
      {
        bindingKind: 'assess-capability',
        terminalTurnIndex: 0,
        terminalInvocationId: invocationId,
        materialDigest,
        capabilityDescriptorDigest:
          resolvedCapabilityDescriptor.descriptorDigest,
      }
    ),
    ownerImplementationDigest,
    completedAt: OWNER_COMPLETED_AT,
  });
  const capabilityExecution = createAgentEvaluationCapabilityExecutionReceipt({
    capabilityExecutionReceiptId: `capability-execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    caseId: concreteCase.caseId,
    caseDigest: concreteCase.caseDigest,
    targetId: descriptor.targetId,
    targetDigest: descriptor.targetDigest,
    capabilityProfileId: concreteCase.capabilityProfileId,
    capabilityId: resolvedCapabilityDescriptor.capabilityId,
    supportExpectation: resolvedCapabilityDescriptor.supportExpectation,
    expectedToolIds: resolvedCapabilityDescriptor.expectedToolIds,
    expectedReceiptKinds: resolvedCapabilityDescriptor.expectedReceiptKinds,
    capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
    toolBindings: Object.freeze([]),
    outcome: capabilityOutcome,
    verdict: blockedReceiptKind ? 'passed' : 'failed',
    specificReceiptDigests: Object.freeze(
      capabilitySpecificReceipts.map(({ receiptKind, receiptDigest }) =>
        Object.freeze({ receiptKind, receiptDigest })
      )
    ),
    attemptAuthorityOwnerReceiptDigests: Object.freeze([
      assessmentOwner.receiptDigest,
    ]),
    policyDigest: plan.policyDigest,
    toolRegistryDigest: plan.toolRegistryDigest,
    observedAt: OWNER_COMPLETED_AT,
  });
  const capabilityExecutionReceiptSetDigest =
    digestAgentEvaluationCapabilityExecutionReceiptSet([capabilityExecution]);
  const execution = createAgentEvaluationExecutionReceipt({
    executionReceiptId: `execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    modelInvocations: 1,
    toolCalls: 0,
    repairRounds: 0,
    transactions: includeReviewCandidate ? 1 : 0,
    ...(includeReviewCandidate
      ? {
          transactionReceiptSetDigest: digestAgentCanonicalValue({
            attemptId: descriptor.attemptId,
            transactionReceiptDigests: [
              digestAgentCanonicalValue({
                attemptId: descriptor.attemptId,
                transaction: 'review-preview',
              }),
            ],
          }),
        }
      : {}),
    artifactBytes: includeReviewCandidate ? 1 : 0,
    elapsedMs: Date.parse(ATTEMPT_COMPLETED_AT) - Date.parse(STARTED_AT),
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    verificationClosureDigest:
      controlledRuntime.g3Verification.verificationClosureDigest,
  });
  const turn = createAgentEvaluationInvocationTurnReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    status: 'completed',
    dispatchState: 'dispatched',
    terminal: true,
    caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    contextPackDigest,
    requestArtifactDigest: requestDigest,
    dispatchIntentDigest: dispatchIntent.intentDigest,
    transportReceiptDigest: transportReceipt.receiptDigest,
    transportRetryReceipt,
    invocationReceipt,
    providerRequestId,
    resolvedModelId: model.modelId,
    ...(model.immutableVersion
      ? { resolvedModelVersion: model.immutableVersion }
      : {}),
    resolvedModelIdentityDigest: digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: target.protocolFamily,
      transportReceiptDigest: transportReceipt.receiptDigest,
      frozenModelId: model.modelId,
      ...(model.immutableVersion
        ? { frozenImmutableModelVersion: model.immutableVersion }
        : {}),
      resolvedModelId: model.modelId,
      ...(model.immutableVersion
        ? { resolvedModelVersion: model.immutableVersion }
        : {}),
    }),
    responseHeaderDigest,
    responseArtifactDigest: responseDigest,
    providerResultSpoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
    usageSourceReceiptDigest: usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: costSourceReceipt.receiptDigest,
    resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
  });
  const turnSet = createAgentEvaluationInvocationTurnSetReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turns: Object.freeze([turn]),
  });
  const observation = createAgentEvaluationMetricObservation({
    metricId: 'authority.correctness',
    graderId: 'grader.strict-authority.v8',
    graderKind: 'deterministic-rule',
    authority: 'deterministic',
    verdict: 'passed',
  });
  const attempt = createAgentModelEvaluationAttempt({
    descriptor,
    independentRunId,
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet([
      dispatchIntent,
    ]),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet([
      transportReceipt,
    ]),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet([turn]),
    invocationTurnSetReceiptDigest: turnSet.receiptDigest,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    responseDigest,
    status: 'completed',
    outcome: 'passed',
    metricObservations: Object.freeze([observation]),
    usage: turnSet.aggregateUsage,
    cost: turnSet.aggregateCost,
    startedAt: STARTED_AT,
    completedAt: ATTEMPT_COMPLETED_AT,
  });
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest: turnSet.receiptDigest,
    terminalTurnReceiptDigest: turn.evidenceDigest,
    capabilityExecutionReceiptDigest: capabilityExecution.receiptDigest,
    resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
    metricObservations: attempt.metricObservations,
    execution: {
      modelInvocations: execution.modelInvocations,
      toolCalls: execution.toolCalls,
      repairRounds: execution.repairRounds,
      transactions: execution.transactions,
      artifactBytes: execution.artifactBytes,
      capabilityExecutionReceiptSetDigest:
        execution.capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        execution.verificationAttemptGrantReceiptSetDigest,
      ...(execution.transactionReceiptSetDigest
        ? {
            transactionReceiptSetDigest: execution.transactionReceiptSetDigest,
          }
        : {}),
      verificationClosureDigest: execution.verificationClosureDigest,
    },
  });
  const gradingOwner = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'attempt-grading',
    operation: 'grade-and-persist',
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
    shardLeaseGeneration: 1,
    verificationGrantGeneration: verificationAttemptGrantReceipt.generation,
    verificationAttemptGrantReceiptSetDigest,
    requestDigest: digestAgentCanonicalValue({
      operation: 'grade-and-persist',
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      gradingDigest,
    }),
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      'attempt-grading',
      'grade-and-persist',
      {
        metricObservations: attempt.metricObservations,
        gradingDigest,
      }
    ),
    ownerImplementationDigest: digest(
      'semantic-attempt-grading-owner-implementation'
    ),
    completedAt: ATTEMPT_COMPLETED_AT,
  });
  let reviewRasterScanReceipt;
  let reviewCandidateRef;
  if (includeReviewCandidate) {
    const projection = createAgentEvaluationBlindReviewPreviewProjection({
      runtimeReceipt: controlledRuntime,
      blindPresentationPolicyDigest:
        plan.graderPlan.randomizedPresentationPolicyDigest,
    });
    reviewRasterScanReceipt = createAgentEvaluationReviewRasterScanReceipt({
      scanReceiptId: `review-raster-scan.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      projectionAuthorityDigest:
        projection.authorityBinding.authorityBindingDigest,
      mediaType: controlledPreview.mediaType,
      width: controlledPreview.width,
      height: controlledPreview.height,
      byteLength: controlledPreview.byteLength,
      policyDigest: digest('semantic-review-raster-scan-policy'),
      bytesDigest: controlledPreview.artifactDigest,
      decodedPixelDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        decodedPixels: 'safe',
      }),
      metadataProfileDigest: digest('semantic-review-raster-metadata'),
      canarySetDigest: digestAgentCanonicalValue([
        'secret-canary-verifier-test',
      ]),
      fingerprintSetDigest: digestAgentCanonicalValue([]),
      findingDigests: Object.freeze([]),
      verdict: 'safe',
      scannedAt: V8_TIME.evaluated,
    });
    const candidateBase = Object.freeze({
      candidateId: `candidate.${suffix}`,
      attemptId: descriptor.attemptId,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      descriptorDigest: descriptor.descriptorDigest,
      responseDigest,
      executionReceiptDigest: execution.receiptDigest,
      graderArtifactDigest: digestAgentEvaluationReviewGraderArtifactAuthority({
        attempt,
        executionReceiptDigest: execution.receiptDigest,
        controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
        graderPlanDigest: plan.graderPlan.planDigest,
      }),
      projectionAuthorityDigest:
        projection.authorityBinding.authorityBindingDigest,
      mediaType: controlledPreview.mediaType,
      width: controlledPreview.width,
      height: controlledPreview.height,
      bytesDigest: controlledPreview.artifactDigest,
      byteLength: controlledPreview.byteLength,
      publicArtifactScanDigest: reviewRasterScanReceipt.receiptDigest,
      generatedAt: V8_TIME.evaluated,
    });
    reviewCandidateRef = Object.freeze({
      ...candidateBase,
      candidateDigest: digestAgentCanonicalValue(candidateBase),
    });
  }
  return Object.freeze({
    attempt,
    dispatchIntent,
    transportReceipt,
    providerResultSpoolReceipt,
    providerResultSpoolDispositionReceipt,
    turn,
    turnSet,
    resultSubmissionReceipt,
    controlledRuntime,
    capabilityExecution,
    capabilitySpecificReceipts,
    providerCapabilityObservationReceipt,
    assessmentOwner,
    gradingOwner,
    verificationAttemptGrantReceipt,
    usageSourceReceipt,
    costSourceReceipt,
    reviewRasterScanReceipt,
    reviewCandidateRef,
    execution,
    pricingSnapshot,
  });
};

const providerSpecificAuthority = (receiptKind, fact) => {
  const authorityKind =
    receiptKind === 'background-job-receipt'
      ? 'provider-job'
      : receiptKind === 'cache-lineage-receipt'
        ? 'provider-cache'
        : receiptKind === 'continuation-receipt'
          ? 'opaque-continuation'
          : receiptKind === 'usage-receipt'
            ? 'usage-vector'
            : 'retrieval-query';
  return Object.freeze({
    authorityKind,
    receiptKind,
    factDigest: fact.factDigest,
    semanticDigest: digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
      authorityKind,
      receiptKind,
      factDigest: fact.factDigest,
    }),
    fact: fact.value,
  });
};

const capabilityEffectRuntimeResponseJson = ({
  protocolFamily,
  id,
  status = 'completed',
  text = 'prodivix-capability-probe-v1 bounded runtime result',
  cachedTokens = 0,
}) => {
  if (protocolFamily === 'anthropic-messages') {
    return Object.freeze({
      id,
      type: 'message',
      role: 'assistant',
      content: Object.freeze([Object.freeze({ type: 'text', text })]),
      stop_reason: 'end_turn',
      usage: Object.freeze({
        input_tokens: 4_200,
        output_tokens: 8,
        cache_read_input_tokens: cachedTokens,
      }),
    });
  }
  if (protocolFamily === 'openai-responses') {
    return Object.freeze({
      object: 'response',
      id,
      status,
      output: Object.freeze(
        text.length === 0
          ? []
          : [
              Object.freeze({
                type: 'message',
                content: Object.freeze([
                  Object.freeze({ type: 'output_text', text }),
                ]),
              }),
            ]
      ),
      usage: Object.freeze({
        input_tokens: 4_200,
        output_tokens: 8,
        input_tokens_details: Object.freeze({ cached_tokens: cachedTokens }),
      }),
    });
  }
  return Object.freeze({
    id,
    status,
    steps: Object.freeze(
      text.length === 0 ? [] : [Object.freeze({ type: 'model_output', text })]
    ),
    usage: Object.freeze({
      total_input_tokens: 4_200,
      total_output_tokens: 8,
      total_cached_tokens: cachedTokens,
    }),
  });
};

const createSemanticHostedRuntimeResourceRead = ({
  fixture,
  target,
  suffix,
  turnIndex,
}) => {
  const registrationResult = fixture?.registrationResults.find(
    ({ authority }) =>
      authority.protocolFamily === target.protocolFamily &&
      authority.capabilityProfileId === target.capabilityProfileId
  );
  if (!registrationResult) {
    throw new TypeError(
      'Semantic verifier hosted runtime resource authority is missing.'
    );
  }
  const authority = registrationResult.authority;
  const commitment = fixture.resourceSetCommitment;
  const readRequest = createAgentHostedRetrievalRuntimeResourceReadRequest({
    namespaceId: 'g4-model-evaluation',
    repositoryCommit: registrationResult.registrationRequest.repositoryCommit,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: commitment.commitmentDigest,
    readerOwnerInstanceId: `runtime-owner.${suffix}.${turnIndex}`,
    readLeaseId: `runtime-read.${suffix}.${turnIndex}`,
    minimumExpiresAt: '2026-08-02T01:02:35.000Z',
  });
  const activeState = createAgentHostedRetrievalRuntimeResourceActiveState(
    authority,
    commitment,
    {
      activeOwnerInstanceId: readRequest.readerOwnerInstanceId,
      claimGeneration: 1,
      readLeaseNotAfter: '2026-08-02T01:03:00.000Z',
      updatedAt: PROVIDER_COMPLETED_AT,
    }
  );
  const readReceipt = createAgentHostedRetrievalRuntimeResourceReadReceipt(
    readRequest,
    authority,
    commitment,
    {
      activeState,
      checkedAt: PROVIDER_COMPLETED_AT,
      expiresAt: '2026-08-02T01:02:40.000Z',
    }
  );
  return Object.freeze({ authority, commitment, readRequest, readReceipt });
};

const createSharedOptionalTurnEvidence = ({
  plan,
  descriptor,
  concreteCase,
  target,
  resolvedCapabilityDescriptor,
  provider,
  materialDigest,
  verificationAttemptGrantReceipt,
  evidence,
  sourceEvidence,
  profileId,
  retrievalMode,
  hostedRuntimeResourceFixture,
}) => {
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const runtimeFactSourceAuthority =
    target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (!runtimeFactSourceAuthority) {
    throw new TypeError(
      'Semantic verifier shared runtime-fact source authority is missing.'
    );
  }
  const program =
    target.optionalCapabilitySupportAuthority?.probeEvidence.probeProgram;
  if (!program) {
    throw new TypeError(
      'Semantic verifier shared capability probe program is missing.'
    );
  }
  const toolId = resolvedCapabilityDescriptor.expectedToolIds[0];
  const toolCallId = `tool-call.${suffix}.turn-${evidence.turnIndex}`;
  const providerToolCallId = `provider-tool-call.${suffix}.turn-${evidence.turnIndex}`;
  const bindingKind =
    profileId === 'g4-provider-background-job'
      ? 'provider-job'
      : profileId === 'g4-provider-isolated-cache'
        ? 'provider-cache'
        : profileId === 'g4-provider-reasoning-continuation'
          ? 'opaque-continuation'
          : 'hosted-retrieval-query';
  const sourceFactKind =
    bindingKind === 'provider-job'
      ? 'provider-job-receipt'
      : bindingKind === 'provider-cache'
        ? 'provider-cache-receipt'
        : bindingKind === 'opaque-continuation'
          ? 'opaque-continuation'
          : 'provider-event';
  const effectiveSourceEvidence =
    bindingKind === 'hosted-retrieval-query' ? evidence : sourceEvidence;
  if (!effectiveSourceEvidence) {
    throw new TypeError(
      'Semantic verifier capability-effect input source is missing.'
    );
  }
  const requiresStateVault =
    bindingKind === 'provider-job' || bindingKind === 'opaque-continuation';
  const providerStateReferenceKind =
    target.protocolFamily === 'gemini-interactions'
      ? 'interaction-id'
      : 'response-id';
  const providerStateHandle = `provider-state.shared.${suffix}.turn-${effectiveSourceEvidence.turnIndex}`;
  const providerStateReferenceDigest = digestAgentNativeProviderStateReference(
    providerStateReferenceKind,
    providerStateHandle
  );
  const stateVaultInstant = (offsetMs) =>
    new Date(
      Date.parse(effectiveSourceEvidence.transportReceipt.completedAt) +
        offsetMs
    ).toISOString();
  const stateVaultSealRequest = requiresStateVault
    ? createAgentNativeProviderStateVaultSealRequest({
        authorityDigest:
          nativeProviderStateVaultEncryption.authority.authorityDigest,
        purpose:
          bindingKind === 'provider-job'
            ? 'background-job-state'
            : 'reasoning-continuation-state',
        attemptId: descriptor.attemptId,
        protocolFamily: target.protocolFamily,
        providerStateReferenceKind,
        providerStateReferenceDigest,
        probeProgramDigest: program.programDigest,
        capabilityProfileDigest: target.capabilityProfileDigest,
        invocationId: effectiveSourceEvidence.invocationId,
        requestDigest: effectiveSourceEvidence.requestDigest,
        responseDigest: effectiveSourceEvidence.responseDigest,
        responseBodyDigest:
          effectiveSourceEvidence.transportReceipt.responseBodyDigest,
        sealedResponseJsonDigest:
          effectiveSourceEvidence.normalizedEventSetDigest,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        taskId: descriptor.attemptId,
        runId: `evaluation-run.${suffix}`,
        generation: descriptor.repetitionIndex,
        observedAt: effectiveSourceEvidence.transportReceipt.completedAt,
        expiresAt: stateVaultInstant(125_000),
      })
    : null;
  const stateVaultSealReceipt =
    stateVaultSealRequest === null
      ? null
      : createAgentNativeProviderStateVaultSealReceipt(
          stateVaultSealRequest,
          {
            status: 'sealed',
            opaqueProviderStateRef:
              createAgentNativeProviderStateVaultOpaqueRef({
                authorityDigest: stateVaultSealRequest.authorityDigest,
                sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
                stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
                  attemptId: descriptor.attemptId,
                  turnIndex: effectiveSourceEvidence.turnIndex,
                  stateVault: 'key-created',
                }),
              }),
            stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              turnIndex: effectiveSourceEvidence.turnIndex,
              stateVault: 'key-created',
            }),
            sealedAt: stateVaultInstant(1),
          },
          semanticObservationSanitization
        );
  const stateVaultResolveRequest =
    stateVaultSealRequest === null || stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultResolveRequest({
          sealRequest: stateVaultSealRequest,
          sealReceipt: stateVaultSealReceipt,
          consumerAttemptId: descriptor.attemptId,
          consumerInvocationId: evidence.invocationId,
          consumerGeneration: descriptor.repetitionIndex,
          requestedAt: stateVaultInstant(1),
        });
  const stateVaultResolveReceipt =
    stateVaultResolveRequest === null
      ? null
      : createAgentNativeProviderStateVaultResolveReceipt(
          stateVaultResolveRequest,
          {
            status: 'resolved',
            callbackLocalProviderStateHandle: providerStateHandle,
            resolvedAt: stateVaultInstant(1),
          },
          semanticObservationSanitization
        );
  const stateVaultRetireRequest =
    stateVaultSealRequest === null ||
    stateVaultSealReceipt === null ||
    stateVaultResolveRequest === null ||
    stateVaultResolveReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetireRequest({
          sealRequest: stateVaultSealRequest,
          sealReceipt: stateVaultSealReceipt,
          resolveRequest: stateVaultResolveRequest,
          resolveReceipt: stateVaultResolveReceipt,
          disposition: 'consumed',
          requestedAt: stateVaultInstant(4_500),
        });
  const stateVaultRetirementReceipt =
    stateVaultRetireRequest === null ||
    stateVaultSealRequest === null ||
    stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetirementReceipt(
          stateVaultRetireRequest,
          stateVaultSealRequest,
          stateVaultSealReceipt,
          {
            status: 'retired',
            stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              turnIndex: effectiveSourceEvidence.turnIndex,
              stateVault: 'key-destroyed',
            }),
            opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              turnIndex: effectiveSourceEvidence.turnIndex,
              stateVault: 'record-deleted',
            }),
            retiredAt: stateVaultInstant(4_600),
          },
          semanticObservationSanitization
        );
  const nativeSourceReceipt =
    bindingKind === 'hosted-retrieval-query'
      ? null
      : createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
          protocolFamily: target.protocolFamily,
          capabilityProfileDigest: target.capabilityProfileDigest,
          invocationId: effectiveSourceEvidence.invocationId,
          requestDigest: effectiveSourceEvidence.requestDigest,
          responseDigest: effectiveSourceEvidence.responseDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          executionIdentityAuthority:
            createAgentNativeProviderExecutionIdentityAuthority({
              invocationId: effectiveSourceEvidence.invocationId,
              taskId:
                stateVaultSealRequest?.taskId ?? `task.shared-cache.${suffix}`,
              runId:
                stateVaultSealRequest?.runId ?? `run.shared-cache.${suffix}`,
              generation:
                stateVaultSealRequest?.generation ?? descriptor.repetitionIndex,
            }),
          source:
            bindingKind === 'provider-job'
              ? Object.freeze({
                  sourceKind: 'provider-job-active-status',
                  providerStateReferenceDigest:
                    stateVaultSealRequest.providerStateReferenceDigest,
                  opaqueProviderStateRef:
                    stateVaultSealReceipt.opaqueProviderStateRef,
                  stateVaultAuthorityDigest:
                    stateVaultSealRequest.authorityDigest,
                  stateVaultSealRequestDigest:
                    stateVaultSealRequest.sealRequestDigest,
                  stateVaultSealReceiptDigest:
                    stateVaultSealReceipt.receiptDigest,
                  taskId: stateVaultSealRequest.taskId,
                  runId: stateVaultSealRequest.runId,
                  generation: stateVaultSealRequest.generation,
                  providerStatus: 'in-progress',
                })
              : bindingKind === 'opaque-continuation'
                ? Object.freeze({
                    sourceKind: 'provider-stored-continuation',
                    providerStateReferenceDigest:
                      stateVaultSealRequest.providerStateReferenceDigest,
                    opaqueProviderStateRef:
                      stateVaultSealReceipt.opaqueProviderStateRef,
                    stateVaultAuthorityDigest:
                      stateVaultSealRequest.authorityDigest,
                    stateVaultSealRequestDigest:
                      stateVaultSealRequest.sealRequestDigest,
                    stateVaultSealReceiptDigest:
                      stateVaultSealReceipt.receiptDigest,
                    taskId: stateVaultSealRequest.taskId,
                    runId: stateVaultSealRequest.runId,
                    generation: stateVaultSealRequest.generation,
                    expiresAt: stateVaultSealReceipt.expiresAt,
                  })
                : Object.freeze({
                    sourceKind: 'provider-cache-usage',
                    cacheIsolationAuthorityDigest: digestAgentCanonicalValue({
                      attemptId: descriptor.attemptId,
                      turnIndex: effectiveSourceEvidence.turnIndex,
                      cacheIsolation: 'task',
                    }),
                    cacheKeyDigest: digestAgentCanonicalValue({
                      attemptId: descriptor.attemptId,
                      cacheKey: 'shared-runtime',
                    }),
                    prefixDescriptorDigest:
                      program.providerRequestIntent.cachePrefixResource
                        .descriptorDigest,
                    usageVector: createAgentUsageVector([
                      Object.freeze({
                        unit: 'cache-read-token',
                        logicalAmount: '4096',
                        billableAmount: '4096',
                        confidence: 'reported',
                      }),
                    ]),
                    cachedTokenCount: 4_096,
                    cacheScope: 'task',
                    provenIsolation: 'task',
                    providerRegion: 'fixture-region',
                  }),
          observedAt: effectiveSourceEvidence.transportReceipt.completedAt,
        });
  const sourceHandleDigest =
    nativeSourceReceipt === null
      ? digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          turnIndex: effectiveSourceEvidence.turnIndex,
          invocationId: effectiveSourceEvidence.invocationId,
          responseDigest: effectiveSourceEvidence.responseDigest,
          sourceFactKind,
        })
      : nativeSourceReceipt.fact.factType === 'opaque-continuation'
        ? nativeSourceReceipt.fact.value.continuationDigest
        : nativeSourceReceipt.fact.value.receiptDigest;
  const effectSealedAt = requiresStateVault
    ? stateVaultInstant(4_700)
    : '2026-08-02T01:00:04.700Z';
  const targetRef = target.targetId;
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId: 'g4-model-evaluation',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: evidence.turnIndex,
      invocationId: evidence.invocationId,
      bindingKind,
      capabilityId: runtimeFactSourceAuthority.capabilityId,
      toolId,
      targetRef,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      runtimeFactSourceAuthorityDigest:
        runtimeFactSourceAuthority.authorityDigest,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      issuedAt: STARTED_AT,
      expiresAt: '2026-08-02T01:02:05.000Z',
    });
  const requestRef = requestRefAuthority.requestRef;
  const argumentsDigest = digestAgentEvaluationCapabilityEffectToolArguments({
    requestRef,
    targetRef,
  });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind,
        capabilityId: runtimeFactSourceAuthority.capabilityId,
        requestRef,
        targetRef,
        requestRefAuthority,
        requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
        sourceAttemptId: descriptor.attemptId,
        sourceTurnIndex: effectiveSourceEvidence.turnIndex,
        sourceInvocationId: effectiveSourceEvidence.invocationId,
        sourceProviderRequestDigest: effectiveSourceEvidence.requestDigest,
        sourceResponseDigest: effectiveSourceEvidence.responseDigest,
        sourceDispatchIntentDigest:
          effectiveSourceEvidence.dispatchIntent.intentDigest,
        sourceTransportReceiptDigest:
          effectiveSourceEvidence.transportReceipt.receiptDigest,
        sourceResultSpoolReceiptDigest:
          effectiveSourceEvidence.providerResultSpoolReceipt.receiptDigest,
        sourceNormalizedEventSetDigest:
          effectiveSourceEvidence.normalizedEventSetDigest,
        sourceObservationReceiptDigest:
          bindingKind === 'hosted-retrieval-query'
            ? null
            : digestAgentCanonicalValue({
                attemptId: descriptor.attemptId,
                turnIndex: effectiveSourceEvidence.turnIndex,
                sourceObservation: sourceFactKind,
              }),
        sourceFactKind,
        sourceProviderEventType:
          bindingKind === 'hosted-retrieval-query' ? 'tool-call' : null,
        sourceProviderToolCallId:
          bindingKind === 'hosted-retrieval-query' ? providerToolCallId : null,
        sourceToolId: bindingKind === 'hosted-retrieval-query' ? toolId : null,
        sourceArgumentsDigest:
          bindingKind === 'hosted-retrieval-query' ? argumentsDigest : null,
        sourceHandleDigest,
        stateVaultSealRequest,
        stateVaultSealReceipt,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
      })
    );
  const preEffectBinding = Object.freeze({
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    caseId: concreteCase.caseId,
    materialDigest,
    turnIndex: evidence.turnIndex,
    invocationId: evidence.invocationId,
    toolId,
    toolCallId,
    providerToolCallId,
    providerRequestDigest: evidence.requestDigest,
    argumentsDigest,
    requestedAt: PROVIDER_COMPLETED_AT,
    inputAuthorityBinding,
    runtimeFactSourceAuthority,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
  });
  const preEffectIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...preEffectBinding,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(
      preEffectBinding
    ),
  });
  const hostedRuntimeRead =
    bindingKind === 'hosted-retrieval-query'
      ? createSemanticHostedRuntimeResourceRead({
          fixture: hostedRuntimeResourceFixture,
          target,
          suffix,
          turnIndex: evidence.turnIndex,
        })
      : null;
  const runtimeInstant = (offsetMs) =>
    new Date(Date.parse(PROVIDER_COMPLETED_AT) + offsetMs).toISOString();
  const runtimeRequestInput = Object.freeze({
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    modelLineageDigest: target.modelLineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    callbackLocalBaseRequestBody: null,
    callbackLocalProviderStateHandle: requiresStateVault
      ? providerStateHandle
      : null,
    providerResourceAuthority: hostedRuntimeRead?.authority ?? null,
    providerResourceReadRequest: hostedRuntimeRead?.readRequest ?? null,
    providerResourceReadReceipt: hostedRuntimeRead?.readReceipt ?? null,
    cacheKeyDigest:
      nativeSourceReceipt?.source.sourceKind === 'provider-cache-usage'
        ? nativeSourceReceipt.source.cacheKeyDigest
        : null,
    observedAt: runtimeInstant(100),
  });
  const operation =
    bindingKind === 'provider-job'
      ? 'background-poll'
      : bindingKind === 'provider-cache'
        ? 'cache-cold'
        : bindingKind === 'opaque-continuation'
          ? 'continuation-resume'
          : 'hosted-retrieval-query';
  if (hostedRuntimeRead) {
    const authority = hostedRuntimeRead.authority;
    const mismatches = [
      ['protocolFamily', authority.protocolFamily, target.protocolFamily],
      [
        'providerConfigurationId',
        authority.providerConfigurationId,
        target.providerConfigurationId,
      ],
      ['modelId', authority.modelId, target.modelId],
      [
        'modelLineageDigest',
        authority.modelLineageDigest,
        target.modelLineageDigest,
      ],
      [
        'adapterDigest',
        authority.adapterDigest,
        provider.adapter.adapterDigest,
      ],
      [
        'probeProgramDigest',
        authority.probeProgramDigest,
        program.programDigest,
      ],
      [
        'capabilityProfileId',
        authority.capabilityProfileId,
        program.profileProjection.capabilityProfileId,
      ],
      [
        'capabilityProfileDigest',
        authority.capabilityProfileDigest,
        program.profileProjection.capabilityProfileDigest,
      ],
      [
        'publicResourceDescriptorDigest',
        authority.publicResourceDescriptorDigest,
        program.providerRequestIntent.publicProbeResource?.descriptorDigest,
      ],
    ].filter(([, observed, expected]) => observed !== expected);
    if (mismatches.length > 0) {
      throw new TypeError(
        `Semantic verifier hosted runtime authority drifted: ${mismatches.map(([field]) => field).join(', ')}.`
      );
    }
  }
  const firstRequest =
    createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
      ...runtimeRequestInput,
      operation,
    });
  const terminalProviderStateHandle =
    bindingKind === 'opaque-continuation'
      ? `provider-state.next.${suffix}.turn-${evidence.turnIndex}`
      : providerStateHandle;
  const executionSpecs = (() => {
    if (bindingKind === 'provider-job') {
      return ['queued', 'in_progress', 'in_progress', 'completed'].map(
        (status, index) => {
          const offset = 700 + index * 900;
          return Object.freeze({
            requestMaterial: firstRequest,
            cacheWarmAuthority: null,
            transportOutcome: 'received',
            httpStatus: 200,
            sealedResponseJson: capabilityEffectRuntimeResponseJson({
              protocolFamily: target.protocolFamily,
              id: providerStateHandle,
              status,
              text: '',
            }),
            pollSequence: index + 1,
            createdAt: runtimeInstant(offset),
            startedAt: runtimeInstant(offset + 100),
            completedAt: runtimeInstant(offset + 200),
            observedAt: runtimeInstant(offset + 300),
            executedAt: runtimeInstant(offset + 400),
          });
        }
      );
    }
    if (bindingKind === 'provider-cache') {
      const warmRequest =
        createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
          ...runtimeRequestInput,
          operation: 'cache-warm',
          observedAt: runtimeInstant(1_500),
        });
      const coldResponseJson = capabilityEffectRuntimeResponseJson({
        protocolFamily: target.protocolFamily,
        id: `provider-cache-cold.${suffix}`,
        cachedTokens: 0,
      });
      const coldResponse = decodeAgentNativeProviderCapabilityRuntimeResponse(
        program,
        firstRequest.projection,
        {
          transportOutcome: 'received',
          httpStatus: 200,
          responseBodyDigest: digestAgentCanonicalValue(coldResponseJson),
          sealedResponseJson: coldResponseJson,
          observedAt: runtimeInstant(1_300),
        }
      );
      const cacheWarmAuthority =
        createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(program, {
          coldRequest: firstRequest.projection,
          coldResponse: coldResponse.projection,
          warmRequest: warmRequest.projection,
          preparedAt: runtimeInstant(1_400),
          expiresAt: '2026-08-02T01:02:05.000Z',
        });
      return [
        Object.freeze({
          requestMaterial: firstRequest,
          cacheWarmAuthority: null,
          transportOutcome: 'received',
          httpStatus: 200,
          sealedResponseJson: coldResponseJson,
          pollSequence: 0,
          createdAt: runtimeInstant(900),
          startedAt: runtimeInstant(1_000),
          completedAt: runtimeInstant(1_100),
          observedAt: runtimeInstant(1_300),
          executedAt: runtimeInstant(1_350),
        }),
        Object.freeze({
          requestMaterial: warmRequest,
          cacheWarmAuthority,
          transportOutcome: 'received',
          httpStatus: 200,
          sealedResponseJson: capabilityEffectRuntimeResponseJson({
            protocolFamily: target.protocolFamily,
            id: `provider-cache-warm.${suffix}`,
            cachedTokens: 4_096,
          }),
          pollSequence: 1,
          createdAt: runtimeInstant(1_600),
          startedAt: runtimeInstant(1_700),
          completedAt: runtimeInstant(1_800),
          observedAt: runtimeInstant(1_900),
          executedAt: runtimeInstant(2_000),
        }),
      ];
    }
    const sealedResponseJson =
      bindingKind === 'hosted-retrieval-query'
        ? createAgentHostedRetrievalProviderResponseFixture({
            protocolFamily: target.protocolFamily,
            responseId: `provider-runtime.${suffix}.${evidence.turnIndex}`,
            citationResourceId:
              retrievalMode === 'citation'
                ? (hostedRuntimeRead?.authority.providerResourceId ?? null)
                : null,
          })
        : capabilityEffectRuntimeResponseJson({
            protocolFamily: target.protocolFamily,
            id:
              bindingKind === 'opaque-continuation'
                ? terminalProviderStateHandle
                : `provider-runtime.${suffix}.${evidence.turnIndex}`,
          });
    return [
      Object.freeze({
        requestMaterial: firstRequest,
        cacheWarmAuthority: null,
        transportOutcome: 'received',
        httpStatus: 200,
        sealedResponseJson,
        pollSequence: 0,
        createdAt: runtimeInstant(700),
        startedAt: runtimeInstant(800),
        completedAt: runtimeInstant(900),
        observedAt:
          bindingKind === 'hosted-retrieval-query'
            ? effectSealedAt
            : runtimeInstant(1_000),
        executedAt:
          bindingKind === 'hosted-retrieval-query'
            ? effectSealedAt
            : runtimeInstant(1_100),
      }),
    ];
  })();
  const terminalSpec = executionSpecs.at(-1);
  if (!terminalSpec) {
    throw new TypeError(
      'Semantic verifier capability-effect runtime execution is missing.'
    );
  }
  const terminalResponse = decodeAgentNativeProviderCapabilityRuntimeResponse(
    program,
    terminalSpec.requestMaterial.projection,
    {
      transportOutcome: terminalSpec.transportOutcome,
      httpStatus: terminalSpec.httpStatus,
      responseBodyDigest: digestAgentCanonicalValue(
        terminalSpec.sealedResponseJson
      ),
      sealedResponseJson: terminalSpec.sealedResponseJson,
      observedAt: terminalSpec.observedAt,
    }
  );
  const nextStateVaultSealRequest =
    bindingKind === 'opaque-continuation'
      ? createAgentNativeProviderStateVaultSealRequest({
          authorityDigest: stateVaultSealRequest.authorityDigest,
          purpose: 'reasoning-continuation-state',
          attemptId: descriptor.attemptId,
          protocolFamily: target.protocolFamily,
          providerStateReferenceKind:
            terminalResponse.projection.providerStateReferenceKind,
          providerStateReferenceDigest:
            terminalResponse.projection.providerStateReferenceDigest,
          probeProgramDigest: program.programDigest,
          capabilityProfileDigest: target.capabilityProfileDigest,
          invocationId: evidence.invocationId,
          requestDigest: terminalSpec.requestMaterial.projection.requestDigest,
          responseDigest: terminalResponse.projection.responseDigest,
          responseBodyDigest: terminalResponse.projection.responseBodyDigest,
          sealedResponseJsonDigest:
            terminalResponse.projection.sealedResponseJsonDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          taskId: stateVaultSealRequest.taskId,
          runId: stateVaultSealRequest.runId,
          generation: stateVaultSealRequest.generation + 1,
          observedAt: terminalResponse.projection.observedAt,
          expiresAt: new Date(
            Date.parse(terminalResponse.projection.observedAt) + 125_000
          ).toISOString(),
        })
      : null;
  const nextStateVaultSealReceipt =
    nextStateVaultSealRequest === null
      ? null
      : createAgentNativeProviderStateVaultSealReceipt(
          nextStateVaultSealRequest,
          {
            status: 'sealed',
            opaqueProviderStateRef:
              createAgentNativeProviderStateVaultOpaqueRef({
                authorityDigest: nextStateVaultSealRequest.authorityDigest,
                sealRequestDigest: nextStateVaultSealRequest.sealRequestDigest,
                stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
                  attemptId: descriptor.attemptId,
                  turnIndex: evidence.turnIndex,
                  stateVault: 'next-key-created',
                }),
              }),
            stateKeyCreationReceiptDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              turnIndex: evidence.turnIndex,
              stateVault: 'next-key-created',
            }),
            sealedAt: runtimeInstant(1_200),
          },
          semanticObservationSanitization
        );
  const runtimeJournalFixture =
    createAgentCapabilityEffectProviderRuntimeJournalFixture({
      program,
      intent: preEffectIntent,
      readiness: {
        ownerInstanceId: `runtime-owner.${suffix}.${evidence.turnIndex}`,
        transportOwnerInstanceId: `runtime-transport.${suffix}.${evidence.turnIndex}`,
        transportHealthDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          turnIndex: evidence.turnIndex,
          runtimeTransport: 'healthy',
        }),
        vaultOwnerInstanceId: requiresStateVault
          ? `runtime-vault.${suffix}.${evidence.turnIndex}`
          : null,
        vaultHealthDigest: requiresStateVault
          ? digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              turnIndex: evidence.turnIndex,
              runtimeVault: 'healthy',
            })
          : null,
        status: 'healthy',
        unavailableReason: null,
        checkedAt: PROVIDER_COMPLETED_AT,
        expiresAt: '2026-08-02T01:02:05.000Z',
      },
      stage: {
        nativeSourceReceipt,
        stateVaultResolveRequest,
        stateVaultResolveReceipt,
        providerResourceSetCommitment: hostedRuntimeRead?.commitment ?? null,
        providerResourceAuthority: hostedRuntimeRead?.authority ?? null,
        providerResourceReadRequest: hostedRuntimeRead?.readRequest ?? null,
        providerResourceReadReceipt: hostedRuntimeRead?.readReceipt ?? null,
        stagedAt: runtimeInstant(500),
        expiresAt: '2026-08-02T01:02:05.000Z',
      },
      executions: Object.freeze(executionSpecs),
      stateVaultRetireRequest,
      stateVaultRetirementReceipt,
      nextStateVaultSealRequest,
      nextStateVaultSealReceipt,
      sealedAt: effectSealedAt,
    });
  if (!runtimeJournalFixture.runtimeResult.fact) {
    throw new TypeError(
      'Semantic verifier capability-effect runtime fact is missing.'
    );
  }
  const sharedFact = Object.freeze({
    fact: runtimeJournalFixture.runtimeResult.fact,
    receiptKind:
      runtimeJournalFixture.runtimeResult.fact.factKind ===
      'provider-job-receipt'
        ? 'background-job-receipt'
        : runtimeJournalFixture.runtimeResult.fact.factKind ===
            'provider-cache-receipt'
          ? 'cache-lineage-receipt'
          : runtimeJournalFixture.runtimeResult.fact.factKind ===
              'opaque-continuation'
            ? 'continuation-receipt'
            : runtimeJournalFixture.runtimeResult.fact.value.sourceResultRefs
                  .length > 0
              ? 'retrieval-citation-receipt'
              : 'source-freshness-receipt',
  });
  const businessResult = runtimeJournalFixture.runtimeResult.businessResult;
  const { resultDigest: businessResultDigest, ...businessResultProjection } =
    businessResult;
  const terminalExecution = runtimeJournalFixture.executionReceipts.at(-1);
  if (!terminalExecution || !terminalExecution.resultSpoolReceipt) {
    throw new TypeError(
      'Semantic verifier capability-effect terminal execution is unsealed.'
    );
  }
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(preEffectIntent, {
      intentDigest: preEffectIntent.intentDigest,
      ownerRequestId: preEffectIntent.ownerRequestId,
      ownerRequestDigest: preEffectIntent.ownerRequestDigest,
      runtimeFactSourceAuthority,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      effectStatus: 'produced',
      businessResultDigest,
      sourceFactKind: sharedFact.fact.factKind,
      sourceFactDigest: sharedFact.fact.factDigest,
      providerRuntimeJournalResultRecordDigest:
        runtimeJournalFixture.resultRecord.recordDigest,
      providerRuntimeResultSealReceiptDigest:
        runtimeJournalFixture.runtimeResult.resultSealReceipt.receiptDigest,
      stageDigest: runtimeJournalFixture.stageRequest.stageDigest,
      dispatchAckDigest: terminalExecution.dispatchAckDigest,
      transportReceiptDigest: terminalExecution.transportReceipt.receiptDigest,
      resultSpoolReceiptDigest:
        terminalExecution.resultSpoolReceipt.receiptDigest,
      normalizedEventSetDigest:
        terminalExecution.responseProjection.normalizedEventSetDigest,
      stateVaultResolveRequest,
      stateVaultResolveReceipt,
      stateVaultRetireRequest,
      stateVaultRetirementReceipt,
      specificReceiptDigests: Object.freeze([]),
      sealedAt: runtimeJournalFixture.runtimeResult.resultSealReceipt.sealedAt,
    });
  const runtimeJournalRecord =
    finalizeAgentCapabilityEffectProviderRuntimeJournalFixture(
      runtimeJournalFixture,
      effectSourceReceipt.receiptDigest
    );
  const executeOwner = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'capability-runtime',
    operation: 'execute-tool',
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
    shardLeaseGeneration: 1,
    verificationGrantGeneration: verificationAttemptGrantReceipt.generation,
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationVerificationAttemptGrantReceiptSet([
        verificationAttemptGrantReceipt,
      ]),
    requestDigest: preEffectIntent.ownerRequestDigest,
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      {
        executionAuthorityKind: 'shared-effect',
        outcome: 'supported',
        result: Object.freeze(businessResultProjection),
        resultDigest: businessResultDigest,
        continuationReceiptDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          turnIndex: evidence.turnIndex,
          continuation: 'shared-effect-complete',
        }),
        effectSourceReceipt,
        effectSourceFact: sharedFact.fact,
        specificReceipts: Object.freeze([]),
      },
      {
        bindingKind: 'execute-tool',
        executionAuthorityKind: 'shared-effect',
        invocationId: evidence.invocationId,
        turnIndex: evidence.turnIndex,
        toolId,
        toolCallId,
        providerToolCallId,
        providerRequestDigest: evidence.requestDigest,
        preEffectIntent,
      }
    ),
    ownerImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    completedAt: effectSealedAt,
  });
  const sourceRequest =
    createAgentEvaluationOptionalCapabilityFactSourceRequest({
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      targetId: target.targetId,
      targetDigest: target.targetDigest,
      capabilityProfileId: target.capabilityProfileId,
      capabilityProfileDigest: target.capabilityProfileDigest,
      capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
      capabilityId: runtimeFactSourceAuthority.capabilityId,
      supportExpectation:
        target.optionalCapabilitySupportAuthority.supportExpectation,
      turnIndex: evidence.turnIndex,
      invocationId: evidence.invocationId,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelId: target.modelId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      providerRequestDigest: evidence.requestDigest,
      responseDigest: evidence.responseDigest,
      dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
      transportReceiptDigest: effectSourceReceipt.transportReceiptDigest,
      resultSpoolReceiptDigest: effectSourceReceipt.resultSpoolReceiptDigest,
      normalizedEventSetDigest: effectSourceReceipt.normalizedEventSetDigest,
      source: Object.freeze({
        kind: runtimeFactSourceAuthority.sourceKind,
        ownerRequestDigest: executeOwner.requestDigest,
        ownerReceiptDigest: executeOwner.receiptDigest,
        effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
      }),
    });
  const sourceDigestBase = Object.freeze({
    kind: sourceRequest.source.kind,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: sourceRequest.attemptId,
    descriptorDigest: sourceRequest.descriptorDigest,
    turnIndex: sourceRequest.turnIndex,
    invocationId: sourceRequest.invocationId,
    providerRequestDigest: sourceRequest.providerRequestDigest,
    responseDigest: sourceRequest.responseDigest,
    dispatchIntentDigest: sourceRequest.dispatchIntentDigest,
    transportReceiptDigest: sourceRequest.transportReceiptDigest,
    resultSpoolReceiptDigest: sourceRequest.resultSpoolReceiptDigest,
    normalizedEventSetDigest: sourceRequest.normalizedEventSetDigest,
    ownerRequestDigest: executeOwner.requestDigest,
    ownerReceiptDigest: executeOwner.receiptDigest,
    ownerStageDigest: effectSourceReceipt.stageDigest,
    ownerDispatchAckDigest: effectSourceReceipt.dispatchAckDigest,
    preEffectIntentDigest: preEffectIntent.intentDigest,
    effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
    effectSourceFactDigest: sharedFact.fact.factDigest,
    businessResultDigest,
    outcome: 'observed',
    factDigest: sharedFact.fact.factDigest,
  });
  const sourceReceiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt',
    version: 1,
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    targetId: target.targetId,
    targetDigest: target.targetDigest,
    capabilityProfileId: target.capabilityProfileId,
    capabilityProfileDigest: target.capabilityProfileDigest,
    capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
    capabilityId: runtimeFactSourceAuthority.capabilityId,
    supportExpectation:
      target.optionalCapabilitySupportAuthority.supportExpectation,
    turnIndex: evidence.turnIndex,
    invocationId: evidence.invocationId,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    modelLineageDigest: target.modelLineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    providerRequestDigest: evidence.requestDigest,
    responseDigest: evidence.responseDigest,
    dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
    transportReceiptDigest: effectSourceReceipt.transportReceiptDigest,
    resultSpoolReceiptDigest: effectSourceReceipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: effectSourceReceipt.normalizedEventSetDigest,
    targetAuthorityDigest: runtimeFactSourceAuthority.authorityDigest,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: runtimeFactSourceAuthority.routeBinding,
    registrationAuthorityIssuerId:
      runtimeFactSourceAuthority.registrationAuthorityIssuerId,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
    sourceKind: runtimeFactSourceAuthority.sourceKind,
    sourceDigest: digestAgentCanonicalValue(sourceDigestBase),
    sourceRequestDigest:
      digestAgentEvaluationOptionalCapabilityFactSourceRequest(sourceRequest),
    outcome: 'observed',
    observedAt: effectSealedAt,
    sealedAt: effectSealedAt,
    ownerRequestDigest: executeOwner.requestDigest,
    ownerReceiptDigest: executeOwner.receiptDigest,
    ownerStageDigest: effectSourceReceipt.stageDigest,
    ownerDispatchAckDigest: effectSourceReceipt.dispatchAckDigest,
    preEffectIntentDigest: preEffectIntent.intentDigest,
    effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
    providerRuntimeJournalResultRecordDigest:
      effectSourceReceipt.providerRuntimeJournalResultRecordDigest,
    providerRuntimeResultSealReceiptDigest:
      effectSourceReceipt.providerRuntimeResultSealReceiptDigest,
    effectSourceFactDigest: sharedFact.fact.factDigest,
    businessResultDigest,
    fact: sharedFact.fact,
  });
  const sourceReceipt =
    decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(
      Object.freeze({
        ...sourceReceiptBase,
        sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
      }),
      {
        namespaceId: 'g4-model-evaluation',
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        request: sourceRequest,
      }
    );
  const sourceRecord =
    createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
      attemptId: descriptor.attemptId,
      turnIndex: evidence.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      sourceReceipt,
      preEffectIntent,
      effectSourceReceipt,
      effectSourceFact: sharedFact.fact,
    });
  const runtimeFactEnvelope = (() => {
    try {
      return createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
        preEffectIntent,
        effectSourceReceipt,
        {
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          turnIndex: evidence.turnIndex,
          invocationId: evidence.invocationId,
          requestDigest: evidence.requestDigest,
          responseDigest: evidence.responseDigest,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
          observedAt: sourceReceipt.observedAt,
          fact: sharedFact.fact,
        },
        semanticObservationSanitization
      );
    } catch (caught) {
      throw new TypeError(
        `Semantic verifier ${profileId}/${sharedFact.fact.factKind}/${runtimeFactSourceAuthority.sourceKind} runtime-fact envelope is invalid.`,
        { cause: caught }
      );
    }
  })();
  if (!runtimeFactEnvelope) {
    throw new TypeError(
      'Semantic verifier shared runtime-fact envelope is unavailable.'
    );
  }
  const factAuthority =
    createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
      runtimeFactEnvelope,
      semanticObservationSanitization
    );
  if (
    !isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      runtimeFactEnvelope,
      semanticObservationSanitization
    ) ||
    !isAgentEvaluationProviderCapabilityFactAuthority(factAuthority)
  ) {
    throw new TypeError(
      `Semantic verifier ${profileId}/${sharedFact.fact.factKind} runtime fact or authority is invalid.`
    );
  }
  const stageRequest = createAgentEvaluationOptionalCapabilityFactStageRequest({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: evidence.turnIndex,
    sourceSealDigest: sourceReceipt.sourceSealDigest,
  });
  const authorityRequestDigest =
    digestAgentEvaluationOptionalCapabilityFactAuthorityRequest(stageRequest);
  const stageDigest = digestAgentEvaluationOptionalCapabilityFactStage(
    authorityRequestDigest,
    sourceReceipt
  );
  const stageResponse =
    decodeAgentEvaluationOptionalCapabilityFactStageResponse(
      Object.freeze({
        format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
        version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
        authorityRequestDigest,
        sourceSealDigest: sourceReceipt.sourceSealDigest,
        stageDigest,
        replayed: false,
      }),
      { request: stageRequest, receipt: sourceReceipt }
    );
  const dispatchAckDigest =
    digestAgentEvaluationOptionalCapabilityFactDispatchAck(
      sourceReceipt,
      stageResponse
    );
  const sealedResponseBase = Object.freeze({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    outcome: 'observed',
    authorityRequestDigest,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    stageDigest,
    dispatchAckDigest,
    runtimeFactEnvelopes: Object.freeze([runtimeFactEnvelope]),
    factAuthorities: Object.freeze([factAuthority]),
  });
  const sealedResponse = (() => {
    try {
      return decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
        Object.freeze({
          ...sealedResponseBase,
          resultDigest: digestAgentCanonicalValue(sealedResponseBase),
        }),
        {
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          receipt: sourceReceipt,
          stage: stageResponse,
          sanitization: semanticObservationSanitization,
        }
      );
    } catch (caught) {
      throw new TypeError(
        `Semantic verifier ${profileId}/${sharedFact.fact.factKind} optional fact-authority response is invalid.`,
        { cause: caught }
      );
    }
  })();
  const authorityRecord =
    createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
      attemptId: descriptor.attemptId,
      turnIndex: evidence.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      authorityRequestDigest,
      stageDigest,
      dispatchAckDigest,
      resultDigest: sealedResponse.resultDigest,
      stageRequest,
      fact: sharedFact.fact,
      runtimeFactEnvelope,
      factAuthority,
      sealedResponse,
    });
  const nativeFact =
    profileId === 'g4-provider-isolated-cache'
      ? (() => {
          const usage = createAgentUsageVector(
            evidence.invocationReceipt.usage.amounts.map(
              ({ sourceDigest: _sourceDigest, ...amount }) =>
                Object.freeze(amount)
            )
          );
          return Object.freeze({
            factKind: 'usage-vector',
            factDigest: usage.vectorDigest,
            value: usage,
          });
        })()
      : (() => {
          const terminal = createAgentProviderEvent({
            eventId: `provider-event.completed.${suffix}.turn-${evidence.turnIndex}`,
            invocationId: evidence.invocationId,
            sequence: 1,
            type: 'completed',
            payloadDigest: evidence.responseDigest,
            occurredAt: effectSealedAt,
          });
          return Object.freeze({
            factKind: 'provider-event',
            factDigest: terminal.eventDigest,
            value: terminal,
          });
        })();
  const nativeSourceAuthority = Object.freeze({
    sourceAuthorityKind: 'native-provider-transport',
    sourceAuthorityId: target.providerConfigurationId,
    sourceAuthorityImplementationDigest: provider.adapter.adapterDigest,
  });
  const nativeRuntimeFactEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      {
        ...nativeSourceAuthority,
        stageDigest: evidence.dispatchIntent.intentDigest,
        dispatchAckDigest: evidence.transportReceipt.receiptDigest,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: evidence.turnIndex,
        invocationId: evidence.invocationId,
        requestDigest: evidence.requestDigest,
        responseDigest: evidence.responseDigest,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
        transportReceiptDigest: evidence.transportReceipt.receiptDigest,
        resultSpoolReceiptDigest:
          evidence.providerResultSpoolReceipt.receiptDigest,
        normalizedEventSetDigest: evidence.normalizedEventSetDigest,
        observedAt: effectSealedAt,
        fact: nativeFact,
      },
      semanticObservationSanitization
    );
  const selection = selectAgentEvaluationProviderCapabilityObservationFacts({
    envelopes: Object.freeze([runtimeFactEnvelope, nativeRuntimeFactEnvelope]),
    requiredFactKinds: Object.freeze([
      sharedFact.fact.factKind,
      nativeFact.factKind,
    ]),
    admittedSourceAuthorities: Object.freeze([
      nativeSourceAuthority,
      Object.freeze({
        sourceAuthorityKind: 'shared-durable-capability',
        runtimeFactSourceAuthority,
      }),
    ]),
    sanitization: semanticObservationSanitization,
  });
  const observation = createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: `provider-observation.${suffix}.turn-${evidence.turnIndex}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: evidence.turnIndex,
      invocationId: evidence.invocationId,
      requestDigest: evidence.requestDigest,
      responseDigest: evidence.responseDigest,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      dispatchIntentDigest: evidence.dispatchIntent.intentDigest,
      transportReceiptDigest: evidence.transportReceipt.receiptDigest,
      resultSpoolReceiptDigest:
        evidence.providerResultSpoolReceipt.receiptDigest,
      normalizedEventSetDigest: evidence.normalizedEventSetDigest,
      facts: selection.facts,
      factAuthorities: selection.factAuthorities,
      observedAt: effectSealedAt,
    },
    semanticObservationSanitization
  );
  const createProviderSpecific = (receiptKind, fact) => {
    try {
      return createAgentEvaluationCapabilitySpecificReceipt({
        receiptId: `capability-specific.${receiptKind}.${suffix}.turn-${evidence.turnIndex}`,
        receiptKind,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        caseId: concreteCase.caseId,
        materialDigest,
        capabilityDescriptorDigest:
          resolvedCapabilityDescriptor.descriptorDigest,
        turnIndex: evidence.turnIndex,
        invocationId: evidence.invocationId,
        toolId,
        toolCallId,
        providerToolCallId,
        providerCapabilityObservationReceiptDigest: observation.receiptDigest,
        requestDigest: evidence.requestDigest,
        resultDigest: businessResultDigest,
        startedAt:
          fact.factKind === 'retrieval-query-receipt'
            ? fact.value.startedAt
            : STARTED_AT,
        completedAt: effectSealedAt,
        authority: providerSpecificAuthority(receiptKind, fact),
      });
    } catch (caught) {
      throw new TypeError(
        `Semantic verifier ${profileId}/${receiptKind} capability-specific receipt is invalid.`,
        { cause: caught }
      );
    }
  };
  const providerSpecificReceipts = [
    createProviderSpecific(sharedFact.receiptKind, sharedFact.fact),
    ...(profileId === 'g4-provider-isolated-cache'
      ? [createProviderSpecific('usage-receipt', nativeFact)]
      : []),
  ];
  return Object.freeze({
    executeOwner,
    sourceRecord,
    authorityRecord,
    observation,
    runtimeJournalRecord,
    providerSpecificReceipts: Object.freeze(providerSpecificReceipts),
  });
};

const upgradeFullContextToSharedCapability = ({
  context,
  plan,
  descriptor,
  concreteCase,
  target,
  resolvedCapabilityDescriptor,
  provider,
  model,
  profileId,
  hostedRuntimeResourceFixture,
}) => {
  const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
  const contextPackDigest = context.turn.contextPackDigest;
  const baseEvidence = Object.freeze({
    turnIndex: context.turn.turnIndex,
    invocationId: context.turn.invocationId,
    requestDigest: context.turn.requestArtifactDigest,
    responseDigest: context.turn.responseArtifactDigest,
    providerRequestId: context.turn.providerRequestId,
    invocationReceipt: context.turn.invocationReceipt,
    dispatchIntent: context.dispatchIntent,
    transportReceipt: context.transportReceipt,
    transportRetryReceipt: context.turn.transportRetryReceipt,
    providerResultSpoolReceipt: context.providerResultSpoolReceipt,
    providerResultSpoolDispositionReceipt:
      context.providerResultSpoolDispositionReceipt,
    responseHeaderDigest: context.turn.responseHeaderDigest,
    normalizedEventSetDigest:
      context.providerResultSpoolReceipt.normalizedEventSetDigest,
    usageSourceReceipt: context.usageSourceReceipt,
    costSourceReceipt: context.costSourceReceipt,
  });
  const retrievalProfile =
    profileId === 'g4-provider-hosted-retrieval-core' ||
    profileId === 'g4-provider-hosted-retrieval-document';
  const outerEvidence = Object.freeze([
    baseEvidence,
    createAdditionalProviderTurnEvidence({
      plan,
      descriptor,
      target,
      provider,
      model,
      contextPackDigest,
      turnIndex: 1,
      baseUsage: baseEvidence.invocationReceipt.usage,
      baseCost: baseEvidence.invocationReceipt.cost,
    }),
  ]);
  const sharedTurnInputs = retrievalProfile
    ? outerEvidence.map((evidence, index) =>
        Object.freeze({
          evidence,
          sourceEvidence: evidence,
          retrievalMode: index === 0 ? 'citation' : 'freshness',
        })
      )
    : [
        Object.freeze({
          evidence: outerEvidence[1],
          sourceEvidence: outerEvidence[0],
          retrievalMode: undefined,
        }),
      ];
  const sharedTurns = sharedTurnInputs.map(
    ({ evidence, sourceEvidence, retrievalMode }) =>
      createSharedOptionalTurnEvidence({
        plan,
        descriptor,
        concreteCase,
        target,
        resolvedCapabilityDescriptor,
        provider,
        materialDigest: context.controlledRuntime.materialDigest,
        verificationAttemptGrantReceipt:
          context.verificationAttemptGrantReceipt,
        evidence,
        sourceEvidence,
        profileId,
        retrievalMode,
        hostedRuntimeResourceFixture,
      })
  );
  const terminalEvidence = outerEvidence.at(-1);
  const terminalSharedTurn = sharedTurns.at(-1);
  if (!terminalEvidence || !terminalSharedTurn) {
    throw new TypeError('Semantic verifier shared terminal turn is missing.');
  }
  const assessmentRequestDigest = digestAgentCanonicalValue({
    operation: 'assess-capability',
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
  });
  const assessmentOwnerImplementationDigest = digest(
    'semantic-capability-owner-implementation'
  );
  const recoveryReceiptKind =
    profileId === 'g4-provider-background-job'
      ? 'reconciliation-receipt'
      : profileId === 'g4-provider-reasoning-continuation'
        ? 'state-fence-receipt'
        : undefined;
  const recoverySpecificReceipt = (() => {
    if (!recoveryReceiptKind) return undefined;
    const authorityResultDigest = terminalEvidence.responseDigest;
    const fact =
      recoveryReceiptKind === 'reconciliation-receipt'
        ? createAgentEvaluationCapabilityOwnerFact({
            authorityKind: 'recovery-authority',
            category: recoveryReceiptKind,
            authorityId: 'authority.capability-recovery.semantic-fixture',
            authorityImplementationDigest: assessmentOwnerImplementationDigest,
            authorityRequestDigest: assessmentRequestDigest,
            authorityResultDigest,
            replayDisposition: 'reconciled',
            idempotencyKey: `reconcile.${suffix}`,
            observedAt: PROVIDER_COMPLETED_AT,
          })
        : createAgentEvaluationCapabilityOwnerFact({
            authorityKind: 'recovery-authority',
            category: recoveryReceiptKind,
            authorityId: 'authority.capability-recovery.semantic-fixture',
            authorityImplementationDigest: assessmentOwnerImplementationDigest,
            authorityRequestDigest: assessmentRequestDigest,
            authorityResultDigest,
            shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
            shardLeaseGeneration: 1,
            dispatchState: 'dispatched',
            authorityInstant: PROVIDER_COMPLETED_AT,
            fenceDigest: authorityResultDigest,
            fenceOutcome: 'fenced',
            observedAt: PROVIDER_COMPLETED_AT,
          });
    return createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: `capability-specific.${recoveryReceiptKind}.${suffix}`,
      receiptKind: recoveryReceiptKind,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      materialDigest: context.controlledRuntime.materialDigest,
      capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
      turnIndex: terminalEvidence.turnIndex,
      invocationId: terminalEvidence.invocationId,
      requestDigest: terminalEvidence.requestDigest,
      resultDigest: authorityResultDigest,
      startedAt: STARTED_AT,
      completedAt: PROVIDER_COMPLETED_AT,
      authority: Object.freeze({
        authorityKind: 'recovery-authority',
        receiptKind: recoveryReceiptKind,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'recovery-authority',
            receiptKind: recoveryReceiptKind,
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });
  })();
  const expectedReceiptKindSet = new Set(
    resolvedCapabilityDescriptor.expectedReceiptKinds
  );
  const capabilitySpecificReceiptByKind = new Map();
  for (const receipt of [
    ...sharedTurns.flatMap(({ providerSpecificReceipts }) =>
      providerSpecificReceipts.slice()
    ),
    ...(recoverySpecificReceipt ? [recoverySpecificReceipt] : []),
  ]) {
    if (
      !expectedReceiptKindSet.has(receipt.receiptKind) ||
      capabilitySpecificReceiptByKind.has(receipt.receiptKind)
    ) {
      throw new TypeError(
        `Semantic verifier ${profileId} capability-specific receipt kinds are not exact.`
      );
    }
    capabilitySpecificReceiptByKind.set(receipt.receiptKind, receipt);
  }
  if (
    capabilitySpecificReceiptByKind.size !== expectedReceiptKindSet.size ||
    [...expectedReceiptKindSet].some(
      (receiptKind) => !capabilitySpecificReceiptByKind.has(receiptKind)
    )
  ) {
    throw new TypeError(
      `Semantic verifier ${profileId} capability-specific receipt kinds are incomplete.`
    );
  }
  const capabilitySpecificReceipts = Object.freeze(
    [...capabilitySpecificReceiptByKind.values()].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.receiptKind, right.receiptKind) ||
        compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
    )
  );
  const capabilityAuthorityCompletedAt = new Date(
    Math.max(
      Date.parse(OWNER_COMPLETED_AT),
      ...sharedTurns.map(({ executeOwner }) =>
        Date.parse(executeOwner.completedAt)
      ),
      ...capabilitySpecificReceipts.map(({ completedAt }) =>
        Date.parse(completedAt)
      )
    )
  ).toISOString();
  const sharedAttemptCompletedAt = new Date(
    Math.max(
      Date.parse(ATTEMPT_COMPLETED_AT),
      Date.parse(capabilityAuthorityCompletedAt) + 1
    )
  ).toISOString();
  const verificationAttemptGrantReceiptSetDigest =
    digestAgentEvaluationVerificationAttemptGrantReceiptSet([
      context.verificationAttemptGrantReceipt,
    ]);
  const assessmentOwner = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'capability-runtime',
    operation: 'assess-capability',
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
    shardLeaseGeneration: 1,
    verificationGrantGeneration:
      context.verificationAttemptGrantReceipt.generation,
    verificationAttemptGrantReceiptSetDigest,
    requestDigest: assessmentRequestDigest,
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'assess-capability',
      {
        outcome: 'supported',
        specificReceipts: capabilitySpecificReceipts,
      },
      {
        bindingKind: 'assess-capability',
        terminalTurnIndex: terminalEvidence.turnIndex,
        terminalInvocationId: terminalEvidence.invocationId,
        materialDigest: context.controlledRuntime.materialDigest,
        capabilityDescriptorDigest:
          resolvedCapabilityDescriptor.descriptorDigest,
      }
    ),
    ownerImplementationDigest: assessmentOwnerImplementationDigest,
    completedAt: capabilityAuthorityCompletedAt,
  });
  const resultSubmissionReceipt = createResultSubmissionReceipt({
    descriptor,
    concreteCase,
    invocationId: terminalEvidence.invocationId,
    materialDigest: context.controlledRuntime.materialDigest,
    responseDigest: terminalEvidence.responseDigest,
  });
  const controlledRuntime = createControlledRuntimeReceipt({
    plan,
    descriptor,
    concreteCase,
    materialDigest: context.controlledRuntime.materialDigest,
    resultSubmissionReceipt,
    verificationAttemptGrantReceipt: context.verificationAttemptGrantReceipt,
    controlledPreview: undefined,
    toolCallCount: sharedTurns.length,
  });
  const turns = Object.freeze(
    outerEvidence.map((evidence, index) =>
      createProviderTurnReceipt({
        plan,
        descriptor,
        concreteCase,
        target,
        model,
        contextPackDigest,
        evidence,
        terminal: index === outerEvidence.length - 1,
        resultSubmissionReceipt,
        controlledRuntime,
      })
    )
  );
  const turnSet = createAgentEvaluationInvocationTurnSetReceipt({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turns,
  });
  const capabilityExecution = (() => {
    try {
      return createAgentEvaluationCapabilityExecutionReceipt({
        capabilityExecutionReceiptId: `capability-execution.${suffix}`,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: terminalEvidence.turnIndex,
        invocationId: terminalEvidence.invocationId,
        caseId: concreteCase.caseId,
        caseDigest: concreteCase.caseDigest,
        targetId: descriptor.targetId,
        targetDigest: descriptor.targetDigest,
        capabilityProfileId: concreteCase.capabilityProfileId,
        capabilityId: resolvedCapabilityDescriptor.capabilityId,
        supportExpectation: resolvedCapabilityDescriptor.supportExpectation,
        expectedToolIds: resolvedCapabilityDescriptor.expectedToolIds,
        expectedReceiptKinds: resolvedCapabilityDescriptor.expectedReceiptKinds,
        capabilityDescriptorDigest:
          resolvedCapabilityDescriptor.descriptorDigest,
        toolBindings: Object.freeze([
          Object.freeze({
            toolId: resolvedCapabilityDescriptor.expectedToolIds[0],
            definitionDigest: digestAgentCanonicalValue({
              toolId: resolvedCapabilityDescriptor.expectedToolIds[0],
              definition: 'shared-semantic-fixture',
            }),
          }),
        ]),
        outcome: 'supported',
        verdict: 'passed',
        specificReceiptDigests: Object.freeze(
          capabilitySpecificReceipts.map(({ receiptKind, receiptDigest }) =>
            Object.freeze({ receiptKind, receiptDigest })
          )
        ),
        attemptAuthorityOwnerReceiptDigests: Object.freeze([
          assessmentOwner.receiptDigest,
          ...sharedTurns.map(({ executeOwner }) => executeOwner.receiptDigest),
        ]),
        policyDigest: plan.policyDigest,
        toolRegistryDigest: plan.toolRegistryDigest,
        observedAt: capabilityAuthorityCompletedAt,
      });
    } catch (caught) {
      throw new TypeError(
        `Semantic verifier ${profileId} capability execution receipt is invalid.`,
        { cause: caught }
      );
    }
  })();
  const capabilityExecutionReceiptSetDigest =
    digestAgentEvaluationCapabilityExecutionReceiptSet([capabilityExecution]);
  const execution = createAgentEvaluationExecutionReceipt({
    executionReceiptId: `execution.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    modelInvocations: outerEvidence.length,
    toolCalls: sharedTurns.length,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: Date.parse(sharedAttemptCompletedAt) - Date.parse(STARTED_AT),
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    toolReceiptSetDigest:
      controlledRuntime.isolatedExecution.toolReceiptSetDigest,
    verificationClosureDigest:
      controlledRuntime.g3Verification.verificationClosureDigest,
  });
  const observation = createAgentEvaluationMetricObservation({
    metricId: 'authority.correctness',
    graderId: 'grader.strict-authority.v8',
    graderKind: 'deterministic-rule',
    authority: 'deterministic',
    verdict: 'passed',
  });
  const attempt = createAgentModelEvaluationAttempt({
    descriptor,
    independentRunId: `run.${suffix}`,
    dispatchIntentSetDigest: digestAgentEvaluationTransportDispatchIntentSet(
      outerEvidence.map(({ dispatchIntent }) => dispatchIntent)
    ),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet(
      outerEvidence.map(({ transportReceipt }) => transportReceipt)
    ),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet(turns),
    invocationTurnSetReceiptDigest: turnSet.receiptDigest,
    capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest,
    responseDigest: terminalEvidence.responseDigest,
    status: 'completed',
    outcome: 'passed',
    metricObservations: Object.freeze([observation]),
    usage: turnSet.aggregateUsage,
    cost: turnSet.aggregateCost,
    startedAt: STARTED_AT,
    completedAt: sharedAttemptCompletedAt,
  });
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest: turnSet.receiptDigest,
    terminalTurnReceiptDigest: turns.at(-1).evidenceDigest,
    capabilityExecutionReceiptDigest: capabilityExecution.receiptDigest,
    resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
    controlledRuntimeReceiptDigest: controlledRuntime.receiptDigest,
    metricObservations: attempt.metricObservations,
    execution: {
      modelInvocations: execution.modelInvocations,
      toolCalls: execution.toolCalls,
      repairRounds: execution.repairRounds,
      transactions: execution.transactions,
      artifactBytes: execution.artifactBytes,
      capabilityExecutionReceiptSetDigest:
        execution.capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest:
        execution.verificationAttemptGrantReceiptSetDigest,
      toolReceiptSetDigest: execution.toolReceiptSetDigest,
      verificationClosureDigest: execution.verificationClosureDigest,
    },
  });
  const gradingOwner = createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'attempt-grading',
    operation: 'grade-and-persist',
    namespaceId: 'g4-model-evaluation',
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'evaluation.runner.semantic-fixture',
    shardLeaseGeneration: 1,
    verificationGrantGeneration:
      context.verificationAttemptGrantReceipt.generation,
    verificationAttemptGrantReceiptSetDigest,
    requestDigest: digestAgentCanonicalValue({
      operation: 'grade-and-persist',
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      gradingDigest,
    }),
    responseProjection: createAgentEvaluationAttemptAuthorityResponseProjection(
      'attempt-grading',
      'grade-and-persist',
      {
        metricObservations: attempt.metricObservations,
        gradingDigest,
      }
    ),
    ownerImplementationDigest: digest(
      'semantic-attempt-grading-owner-implementation'
    ),
    completedAt: sharedAttemptCompletedAt,
  });
  return Object.freeze({
    ...context,
    attempt,
    turn: turns.at(-1),
    turns,
    turnSet,
    resultSubmissionReceipt,
    controlledRuntime,
    capabilityExecution,
    capabilitySpecificReceipts,
    providerCapabilityObservationReceipt: undefined,
    providerCapabilityObservationReceipts: Object.freeze(
      sharedTurns.map(({ observation: receipt }) => receipt)
    ),
    assessmentOwner,
    executeOwners: Object.freeze(
      sharedTurns.map(({ executeOwner }) => executeOwner)
    ),
    gradingOwner,
    execution,
    dispatchIntents: Object.freeze(
      outerEvidence.map(({ dispatchIntent }) => dispatchIntent)
    ),
    transportReceipts: Object.freeze(
      outerEvidence.map(({ transportReceipt }) => transportReceipt)
    ),
    providerResultSpoolReceipts: Object.freeze(
      outerEvidence.map(
        ({ providerResultSpoolReceipt }) => providerResultSpoolReceipt
      )
    ),
    providerResultSpoolDispositionReceipts: Object.freeze(
      outerEvidence.map(
        ({ providerResultSpoolDispositionReceipt }) =>
          providerResultSpoolDispositionReceipt
      )
    ),
    optionalCapabilityFactSources: Object.freeze(
      sharedTurns.map(({ sourceRecord }) => sourceRecord)
    ),
    optionalCapabilityFactAuthorities: Object.freeze(
      sharedTurns.map(({ authorityRecord }) => authorityRecord)
    ),
    capabilityEffectProviderRuntimeJournals: Object.freeze(
      sharedTurns.map(({ runtimeJournalRecord }) => runtimeJournalRecord)
    ),
    additionalSourceReceipts: Object.freeze(
      outerEvidence
        .slice(1)
        .flatMap(({ usageSourceReceipt, costSourceReceipt }) => [
          usageSourceReceipt,
          costSourceReceipt,
        ])
    ),
  });
};

const nativeBootstrapSourceDigest = (receipt) =>
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

export const createG4ModelEvaluationNativeBootstrapAuthorityFixture = ({
  outcome = 'observed',
  sourceAuthorityImplementationDigest,
  nativeFactSalt = 'baseline',
  providerResponseDigest: providerResponseDigestOverride,
  stateVaultDisposition = 'cancelled',
  stateVaultAuthorityImplementationDigest,
} = {}) => {
  const qualification = createV8QualificationAuthorityArchiveFixture();
  const plan = qualification.plan;
  const target = plan.capabilityQualificationTargets.find(
    (candidate) =>
      candidate.capabilityProfileId === 'g4-provider-background-job' &&
      candidate.optionalCapabilitySupportAuthority?.supportExpectation ===
        'required'
  );
  if (!target) {
    throw new TypeError(
      'Native bootstrap verifier fixture required target is missing.'
    );
  }
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    ({ targetId }) => targetId === target.targetId
  );
  const concreteCase = descriptor
    ? plan.concreteCases.find(({ caseId }) => caseId === descriptor.caseId)
    : undefined;
  const provider = plan.providerConfigurations.find(
    ({ providerConfigurationId }) =>
      providerConfigurationId === target.providerConfigurationId
  );
  const canonicalRuntimeAuthority =
    target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (!descriptor || !concreteCase || !provider || !canonicalRuntimeAuthority) {
    throw new TypeError(
      'Native bootstrap verifier fixture frozen authority is incomplete.'
    );
  }
  const resolvedCapabilityDescriptor =
    resolveAgentEvaluationCapabilityDescriptor(concreteCase, target);
  const runtimeFactSourceAuthority = sourceAuthorityImplementationDigest
    ? (() => {
        const {
          authorityDigest: _authorityDigest,
          sourceAuthorityImplementationDigest:
            _sourceAuthorityImplementationDigest,
          ...input
        } = canonicalRuntimeAuthority;
        return createAgentEvaluationRuntimeFactSourceAuthority({
          ...input,
          sourceAuthorityImplementationDigest,
        });
      })()
    : canonicalRuntimeAuthority;
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId: target.capabilityProfileId,
    capabilityProfileDigest: target.capabilityProfileDigest,
  });
  const turnIndex = 0;
  const invocationId = 'invocation.native-bootstrap.1';
  const providerRequestDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'request',
    attemptId: descriptor.attemptId,
  });
  const providerResponseDigest =
    providerResponseDigestOverride ??
    digestAgentCanonicalValue({
      nativeBootstrap: 'response',
      attemptId: descriptor.attemptId,
    });
  const dispatchIntentDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'dispatch-intent',
    attemptId: descriptor.attemptId,
  });
  const transportReceiptDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'transport',
    attemptId: descriptor.attemptId,
  });
  const resultSpoolReceiptDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'spool',
    attemptId: descriptor.attemptId,
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'normalized-events',
    attemptId: descriptor.attemptId,
  });
  const responseBodyDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'response-body',
    attemptId: descriptor.attemptId,
  });
  const transportCompletedAt = PROVIDER_COMPLETED_AT;
  const observedAt = PROVIDER_COMPLETED_AT;
  const instantOffset = (instant, milliseconds) =>
    new Date(Date.parse(instant) + milliseconds).toISOString();
  const stateVaultAuthority = stateVaultAuthorityImplementationDigest
    ? createAgentNativeProviderStateVaultAuthority({
        authorityId: nativeProviderStateVaultEncryption.authority.authorityId,
        authorityImplementationDigest: stateVaultAuthorityImplementationDigest,
        algorithm: nativeProviderStateVaultEncryption.authority.algorithm,
        keyReferenceDigest:
          nativeProviderStateVaultEncryption.authority.keyReferenceDigest,
        keyVersion: nativeProviderStateVaultEncryption.authority.keyVersion,
        encryptionProfileDigest:
          nativeProviderStateVaultEncryption.authority.encryptionProfileDigest,
        retentionPolicyDigest:
          nativeProviderStateVaultEncryption.authority.retentionPolicyDigest,
        deletionReceiptPolicyDigest:
          nativeProviderStateVaultEncryption.authority
            .deletionReceiptPolicyDigest,
      })
    : nativeProviderStateVaultEncryption.authority;
  const stateVaultPurpose = 'background-job-state';
  const providerStateReferenceKind =
    target.protocolFamily === 'gemini-interactions'
      ? 'interaction-id'
      : 'response-id';
  const providerStateHandle = `provider-state.native-bootstrap.${nativeFactSalt}`;
  const providerStateReferenceDigest = digestAgentNativeProviderStateReference(
    providerStateReferenceKind,
    providerStateHandle
  );
  const taskId = `task.native-bootstrap.${nativeFactSalt}`;
  const runId = `run.native-bootstrap.${nativeFactSalt}`;
  const generation = 1;
  const stateVaultExpiresAt = instantOffset(observedAt, 125_000);
  const stateVaultSealRequest =
    outcome === 'observed'
      ? createAgentNativeProviderStateVaultSealRequest({
          authorityDigest: stateVaultAuthority.authorityDigest,
          purpose: stateVaultPurpose,
          attemptId: descriptor.attemptId,
          protocolFamily: target.protocolFamily,
          providerStateReferenceKind,
          providerStateReferenceDigest,
          probeProgramDigest: program.programDigest,
          capabilityProfileDigest: target.capabilityProfileDigest,
          invocationId,
          requestDigest: providerRequestDigest,
          responseDigest: providerResponseDigest,
          responseBodyDigest,
          sealedResponseJsonDigest: normalizedEventSetDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          taskId,
          runId,
          generation,
          observedAt,
          expiresAt: stateVaultExpiresAt,
        })
      : null;
  const stateKeyCreationReceiptDigest = digestAgentCanonicalValue({
    nativeBootstrap: 'state-key-creation',
    nativeFactSalt,
  });
  const stateVaultSealReceipt =
    stateVaultSealRequest === null
      ? null
      : createAgentNativeProviderStateVaultSealReceipt(
          stateVaultSealRequest,
          {
            status: 'sealed',
            opaqueProviderStateRef:
              createAgentNativeProviderStateVaultOpaqueRef({
                authorityDigest: stateVaultAuthority.authorityDigest,
                sealRequestDigest: stateVaultSealRequest.sealRequestDigest,
                stateKeyCreationReceiptDigest,
              }),
            stateKeyCreationReceiptDigest,
            sealedAt: OWNER_COMPLETED_AT,
          },
          semanticObservationSanitization
        );
  const stateVaultResolveRequest =
    stateVaultDisposition === 'consumed' &&
    stateVaultSealRequest !== null &&
    stateVaultSealReceipt !== null
      ? createAgentNativeProviderStateVaultResolveRequest({
          sealRequest: stateVaultSealRequest,
          sealReceipt: stateVaultSealReceipt,
          consumerAttemptId: descriptor.attemptId,
          consumerInvocationId: `${invocationId}.consumer`,
          consumerGeneration: generation,
          requestedAt: instantOffset(observedAt, 2),
        })
      : null;
  const stateVaultResolveReceipt =
    stateVaultResolveRequest === null
      ? null
      : createAgentNativeProviderStateVaultResolveReceipt(
          stateVaultResolveRequest,
          {
            status: 'resolved',
            callbackLocalProviderStateHandle: providerStateHandle,
            resolvedAt: instantOffset(observedAt, 3),
          },
          semanticObservationSanitization
        );
  const stateVaultRetireRequest =
    stateVaultSealRequest === null || stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetireRequest({
          sealRequest: stateVaultSealRequest,
          sealReceipt: stateVaultSealReceipt,
          resolveRequest: stateVaultResolveRequest,
          resolveReceipt: stateVaultResolveReceipt,
          disposition: stateVaultDisposition,
          requestedAt:
            stateVaultDisposition === 'expired'
              ? stateVaultExpiresAt
              : instantOffset(observedAt, 4),
        });
  const stateVaultRetirementReceipt =
    stateVaultRetireRequest === null ||
    stateVaultSealRequest === null ||
    stateVaultSealReceipt === null
      ? null
      : createAgentNativeProviderStateVaultRetirementReceipt(
          stateVaultRetireRequest,
          stateVaultSealRequest,
          stateVaultSealReceipt,
          {
            status: 'retired',
            stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
              nativeBootstrap: 'state-key-destruction',
              nativeFactSalt,
              stateVaultDisposition,
            }),
            opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
              nativeBootstrap: 'opaque-record-deletion',
              nativeFactSalt,
              stateVaultDisposition,
            }),
            retiredAt: instantOffset(stateVaultRetireRequest.requestedAt, 1),
          },
          semanticObservationSanitization
        );
  const nativeSourceReceipt =
    outcome === 'observed'
      ? createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
          protocolFamily: target.protocolFamily,
          capabilityProfileDigest: target.capabilityProfileDigest,
          invocationId,
          requestDigest: providerRequestDigest,
          responseDigest: providerResponseDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          executionIdentityAuthority:
            createAgentNativeProviderExecutionIdentityAuthority({
              invocationId,
              taskId,
              runId,
              generation,
            }),
          source: Object.freeze({
            sourceKind: 'provider-job-terminal-status',
            providerStateReferenceDigest,
            opaqueProviderStateRef:
              stateVaultSealReceipt.opaqueProviderStateRef,
            stateVaultAuthorityDigest: stateVaultAuthority.authorityDigest,
            stateVaultSealRequestDigest:
              stateVaultSealRequest.sealRequestDigest,
            stateVaultSealReceiptDigest: stateVaultSealReceipt.receiptDigest,
            taskId,
            runId,
            generation,
            providerStatus: 'completed',
          }),
          observedAt,
        })
      : null;
  const bootstrapSourceRequest =
    createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
      program,
      {
        namespaceId: 'g4-model-evaluation',
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex,
        invocationId,
        providerRequestDigest,
        providerResponseDigest,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        dispatchIntentDigest,
        transportReceiptDigest,
        resultSpoolReceiptDigest,
        normalizedEventSetDigest,
        transportCompletedAt,
        runtimeFactSourceAuthority,
        outcome,
        nativeSourceReceipt,
        observedAt,
      },
      semanticObservationSanitization
    );
  const bootstrapSourceReceipt =
    createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
      program,
      {
        sourceRequest: bootstrapSourceRequest,
        sealedAt: OWNER_COMPLETED_AT,
      },
      semanticObservationSanitization
    );
  const bootstrapFact = bootstrapSourceRequest.fact;
  const sourceRequest =
    createAgentEvaluationOptionalCapabilityFactSourceRequest({
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      targetId: target.targetId,
      targetDigest: target.targetDigest,
      capabilityProfileId: target.capabilityProfileId,
      capabilityProfileDigest: target.capabilityProfileDigest,
      capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
      capabilityId: runtimeFactSourceAuthority.capabilityId,
      supportExpectation:
        target.optionalCapabilitySupportAuthority.supportExpectation,
      turnIndex,
      invocationId,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelId: target.modelId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      providerRequestDigest,
      responseDigest: providerResponseDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      source: Object.freeze({
        kind: runtimeFactSourceAuthority.sourceKind,
        nativeBootstrapSourceRequestDigest:
          bootstrapSourceRequest.requestDigest,
      }),
    });
  const sourceReceiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt',
    version: 1,
    namespaceId: bootstrapSourceRequest.namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    targetId: target.targetId,
    targetDigest: target.targetDigest,
    capabilityProfileId: target.capabilityProfileId,
    capabilityProfileDigest: target.capabilityProfileDigest,
    capabilityDescriptorDigest: resolvedCapabilityDescriptor.descriptorDigest,
    capabilityId: runtimeFactSourceAuthority.capabilityId,
    supportExpectation:
      target.optionalCapabilitySupportAuthority.supportExpectation,
    turnIndex,
    invocationId,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    modelLineageDigest: target.modelLineageDigest,
    adapterDigest: provider.adapter.adapterDigest,
    providerRequestDigest,
    responseDigest: providerResponseDigest,
    dispatchIntentDigest,
    transportReceiptDigest,
    resultSpoolReceiptDigest,
    normalizedEventSetDigest,
    targetAuthorityDigest: runtimeFactSourceAuthority.authorityDigest,
    sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: runtimeFactSourceAuthority.routeBinding,
    registrationAuthorityIssuerId:
      runtimeFactSourceAuthority.registrationAuthorityIssuerId,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
    sourceKind: runtimeFactSourceAuthority.sourceKind,
    sourceDigest: digestAgentCanonicalValue({
      kind: runtimeFactSourceAuthority.sourceKind,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      providerRequestDigest,
      responseDigest: providerResponseDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      nativeBootstrapSourceRequestDigest: bootstrapSourceRequest.requestDigest,
      nativeBootstrapSourceReceiptDigest: bootstrapSourceReceipt.receiptDigest,
      ownerStageDigest: bootstrapSourceReceipt.sourceOwnerStageDigest,
      ownerDispatchAckDigest:
        bootstrapSourceReceipt.sourceOwnerDispatchAckDigest,
      nativeProviderSourceReceiptDigest:
        nativeSourceReceipt?.receiptDigest ?? null,
      nativeProviderSourceDigest: nativeSourceReceipt?.sourceDigest ?? null,
      nativeProviderSourceFactDigest: bootstrapFact?.factDigest ?? null,
      outcome,
    }),
    sourceRequestDigest:
      digestAgentEvaluationOptionalCapabilityFactSourceRequest(sourceRequest),
    ownerStageDigest: bootstrapSourceReceipt.sourceOwnerStageDigest,
    ownerDispatchAckDigest: bootstrapSourceReceipt.sourceOwnerDispatchAckDigest,
    nativeBootstrapSourceRequestDigest: bootstrapSourceRequest.requestDigest,
    nativeBootstrapSourceReceiptDigest: bootstrapSourceReceipt.receiptDigest,
    nativeProviderSourceReceiptDigest:
      nativeSourceReceipt?.receiptDigest ?? null,
    nativeProviderSourceDigest: nativeSourceReceipt?.sourceDigest ?? null,
    nativeProviderSourceFactDigest: bootstrapFact?.factDigest ?? null,
    outcome,
    observedAt,
    sealedAt: ATTEMPT_COMPLETED_AT,
    ...(bootstrapFact === null ? {} : { fact: bootstrapFact }),
  });
  const sourceReceipt = Object.freeze({
    ...sourceReceiptBase,
    sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
  });
  const sourceRecord =
    createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
      attemptId: descriptor.attemptId,
      turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      sourceReceipt,
      bootstrapSourceRequest,
      bootstrapSourceReceipt,
      nativeSourceReceipt,
      bootstrapFact,
      stateVaultSealRequest,
      stateVaultSealReceipt,
      stateVaultResolveRequest,
      stateVaultResolveReceipt,
      stateVaultRetireRequest,
      stateVaultRetirementReceipt,
    });
  const runtimeFactEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
      program,
      bootstrapSourceReceipt,
      semanticObservationSanitization
    );
  let authorityRecord;
  if (runtimeFactEnvelope) {
    const factAuthority =
      createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        runtimeFactEnvelope,
        semanticObservationSanitization
      );
    const stageRequest =
      createAgentEvaluationOptionalCapabilityFactStageRequest({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex,
        sourceSealDigest: sourceReceipt.sourceSealDigest,
      });
    const authorityRequestDigest =
      digestAgentEvaluationOptionalCapabilityFactAuthorityRequest(stageRequest);
    const stageDigest = digestAgentEvaluationOptionalCapabilityFactStage(
      authorityRequestDigest,
      sourceReceipt
    );
    const stageResponse =
      decodeAgentEvaluationOptionalCapabilityFactStageResponse(
        Object.freeze({
          format:
            AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
          version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
          authorityRequestDigest,
          sourceSealDigest: sourceReceipt.sourceSealDigest,
          stageDigest,
          replayed: false,
        }),
        { request: stageRequest, receipt: sourceReceipt }
      );
    const dispatchAckDigest =
      digestAgentEvaluationOptionalCapabilityFactDispatchAck(
        sourceReceipt,
        stageResponse
      );
    const responseBase = Object.freeze({
      format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
      version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
      outcome: 'observed',
      authorityRequestDigest,
      sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
      stageDigest,
      dispatchAckDigest,
      runtimeFactEnvelopes: Object.freeze([runtimeFactEnvelope]),
      factAuthorities: Object.freeze([factAuthority]),
    });
    const sealedResponse =
      decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
        Object.freeze({
          ...responseBase,
          resultDigest: digestAgentCanonicalValue(responseBase),
        }),
        {
          planDigest: plan.planDigest,
          repositoryCommit: plan.repositoryCommit,
          receipt: sourceReceipt,
          stage: stageResponse,
          sanitization: semanticObservationSanitization,
        }
      );
    authorityRecord =
      createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
        attemptId: descriptor.attemptId,
        turnIndex,
        sourceSealDigest: sourceReceipt.sourceSealDigest,
        authorityRequestDigest,
        stageDigest,
        dispatchAckDigest,
        resultDigest: sealedResponse.resultDigest,
        stageRequest,
        fact: bootstrapFact,
        runtimeFactEnvelope,
        factAuthority,
        sealedResponse,
      });
  }
  const terminal = createAgentProviderEvent({
    eventId: `provider-event.native-bootstrap.${nativeFactSalt}`,
    invocationId,
    sequence: 1,
    type: outcome === 'observed' ? 'completed' : 'failed',
    payloadDigest: providerResponseDigest,
    occurredAt: observedAt,
  });
  const terminalFact = Object.freeze({
    factKind: 'provider-event',
    factDigest: terminal.eventDigest,
    value: terminal,
  });
  const nativeSourceAuthority = Object.freeze({
    sourceAuthorityKind: 'native-provider-transport',
    sourceAuthorityId: target.providerConfigurationId,
    sourceAuthorityImplementationDigest: provider.adapter.adapterDigest,
  });
  const terminalEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      {
        ...nativeSourceAuthority,
        stageDigest: dispatchIntentDigest,
        dispatchAckDigest: transportReceiptDigest,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex,
        invocationId,
        requestDigest: providerRequestDigest,
        responseDigest: providerResponseDigest,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        adapterDigest: provider.adapter.adapterDigest,
        dispatchIntentDigest,
        transportReceiptDigest,
        resultSpoolReceiptDigest,
        normalizedEventSetDigest,
        observedAt,
        fact: terminalFact,
      },
      semanticObservationSanitization
    );
  const selection = selectAgentEvaluationProviderCapabilityObservationFacts({
    envelopes: Object.freeze(
      runtimeFactEnvelope
        ? [runtimeFactEnvelope, terminalEnvelope]
        : [terminalEnvelope]
    ),
    requiredFactKinds: Object.freeze(
      bootstrapFact
        ? [bootstrapFact.factKind, terminalFact.factKind]
        : [terminalFact.factKind]
    ),
    admittedSourceAuthorities: Object.freeze([
      nativeSourceAuthority,
      ...(runtimeFactEnvelope
        ? [
            Object.freeze({
              sourceAuthorityKind: 'shared-durable-capability',
              runtimeFactSourceAuthority,
            }),
          ]
        : []),
    ]),
    sanitization: semanticObservationSanitization,
  });
  const observation = createAgentEvaluationProviderCapabilityObservationReceipt(
    {
      observationReceiptId: `provider-observation.native-bootstrap.${nativeFactSalt}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      requestDigest: providerRequestDigest,
      responseDigest: providerResponseDigest,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      modelLineageDigest: target.modelLineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      dispatchIntentDigest,
      transportReceiptDigest,
      resultSpoolReceiptDigest,
      normalizedEventSetDigest,
      facts: selection.facts,
      factAuthorities: selection.factAuthorities,
      observedAt,
    },
    semanticObservationSanitization
  );
  const registration = qualification.runtimeFactSourceOwnerRegistrations.find(
    ({ registrationReceiptDigest }) =>
      registrationReceiptDigest ===
      canonicalRuntimeAuthority.registrationReceiptDigest
  );
  if (!registration) {
    throw new TypeError(
      'Native bootstrap verifier fixture registration is missing.'
    );
  }
  const identity = `${descriptor.attemptId}\u0000${turnIndex}`;
  const state = {
    index: Object.freeze({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
    }),
    frozenRunConfig: Object.freeze({
      nativeProviderStateVaultEncryption,
    }),
    singletons: Object.freeze({ plan }),
    expectedDescriptors: new Map([[descriptor.attemptId, descriptor]]),
    expectedCases: new Map([[concreteCase.caseId, concreteCase]]),
    runtimeFactSourceRegistrations: new Map([
      [canonicalRuntimeAuthority.registrationReceiptDigest, registration],
    ]),
    optionalCapabilityFactSources: new Map([[identity, sourceRecord]]),
    optionalCapabilityFactAuthorities: new Map(
      authorityRecord ? [[identity, authorityRecord]] : []
    ),
    consumedOptionalCapabilityFacts: new Set(),
    invocationTurnBindings: new Map([
      [
        `${identity}\u0000${invocationId}`,
        Object.freeze({
          dispatchState: 'dispatched',
          requestArtifactDigest: providerRequestDigest,
          responseArtifactDigest: providerResponseDigest,
          dispatchIntentDigest,
          transportReceiptDigest,
          providerResultSpoolReceiptDigest: resultSpoolReceiptDigest,
        }),
      ],
    ]),
    attemptDispatchIntents: new Map([
      [
        dispatchIntentDigest,
        Object.freeze({
          intentDigest: dispatchIntentDigest,
          attemptId: descriptor.attemptId,
          turnIndex,
          invocationId,
          requestDigest: providerRequestDigest,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
        }),
      ],
    ]),
    attemptTransports: new Map([
      [
        transportReceiptDigest,
        Object.freeze({
          receiptDigest: transportReceiptDigest,
          dispatchIntentDigest,
          requestDigest: providerRequestDigest,
          invocationId,
          protocolFamily: target.protocolFamily,
          providerConfigurationId: target.providerConfigurationId,
          completedAt: transportCompletedAt,
          responseBodyDigest,
        }),
      ],
    ]),
    attemptSpools: new Map([
      [
        resultSpoolReceiptDigest,
        Object.freeze({
          receiptDigest: resultSpoolReceiptDigest,
          attemptId: descriptor.attemptId,
          turnIndex,
          invocationId,
          dispatchIntentDigest,
          transportReceiptDigest,
          responseDigest: providerResponseDigest,
          normalizedEventSetDigest,
          createdAt: transportCompletedAt,
        }),
      ],
    ]),
    observationSanitization: semanticObservationSanitization,
  };
  return Object.freeze({
    state,
    identity,
    sourceRecord,
    authorityRecord,
    observation,
    runtimeFactSourceAuthority,
    stateVaultAuthority,
  });
};

export const recommitG4NativeBootstrapSourceRawMutation = (
  sourceRecord,
  mutationKind
) => {
  const bootstrapReceiptBase = { ...sourceRecord.bootstrapSourceReceipt };
  delete bootstrapReceiptBase.receiptDigest;
  if (mutationKind === 'stage') {
    bootstrapReceiptBase.sourceOwnerStageDigest = digestAgentCanonicalValue({
      mutation: 'native-bootstrap-stage-swap',
    });
    bootstrapReceiptBase.sourceOwnerDispatchAckDigest =
      digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck(
        bootstrapReceiptBase.sourceRequest,
        bootstrapReceiptBase.sourceOwnerStageDigest,
        bootstrapReceiptBase.sealedAt
      );
  } else if (mutationKind === 'ack') {
    bootstrapReceiptBase.sourceOwnerDispatchAckDigest =
      digestAgentCanonicalValue({ mutation: 'native-bootstrap-ack-swap' });
  } else if (mutationKind !== 'missing-native-receipt') {
    throw new TypeError(
      `Native bootstrap verifier fixture mutation ${mutationKind} is unsupported.`
    );
  }
  const bootstrapSourceReceipt = Object.freeze({
    ...bootstrapReceiptBase,
    receiptDigest: digestAgentCanonicalValue(bootstrapReceiptBase),
  });
  const sourceReceiptBase = { ...sourceRecord.sourceReceipt };
  delete sourceReceiptBase.sourceSealDigest;
  sourceReceiptBase.nativeBootstrapSourceReceiptDigest =
    bootstrapSourceReceipt.receiptDigest;
  sourceReceiptBase.ownerStageDigest =
    bootstrapSourceReceipt.sourceOwnerStageDigest;
  sourceReceiptBase.ownerDispatchAckDigest =
    bootstrapSourceReceipt.sourceOwnerDispatchAckDigest;
  sourceReceiptBase.sourceDigest =
    nativeBootstrapSourceDigest(sourceReceiptBase);
  const sourceReceipt = Object.freeze({
    ...sourceReceiptBase,
    sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
  });
  const recordBase = {
    ...sourceRecord,
    sourceSealDigest: sourceReceipt.sourceSealDigest,
    sourceReceipt,
    bootstrapSourceReceipt,
  };
  delete recordBase.recordDigest;
  if (mutationKind === 'missing-native-receipt') {
    delete recordBase.nativeSourceReceipt;
  }
  return Object.freeze({
    ...recordBase,
    recordDigest: digestAgentCanonicalValue(recordBase),
  });
};

export const recommitG4NativeBootstrapStateVaultRawSwap = (
  sourceRecord,
  replacementRecord,
  field
) => {
  if (
    ![
      'stateVaultSealRequest',
      'stateVaultSealReceipt',
      'stateVaultResolveRequest',
      'stateVaultResolveReceipt',
      'stateVaultRetireRequest',
      'stateVaultRetirementReceipt',
    ].includes(field)
  ) {
    throw new TypeError(
      `Native bootstrap state-vault raw swap ${field} is unsupported.`
    );
  }
  const recordBase = {
    ...sourceRecord,
    [field]: replacementRecord[field],
  };
  delete recordBase.recordDigest;
  return Object.freeze({
    ...recordBase,
    recordDigest: digestAgentCanonicalValue(recordBase),
  });
};

const semanticSigningKeys = generateKeyPairSync('ed25519');
const semanticPublicKeyDer = semanticSigningKeys.publicKey.export({
  format: 'der',
  type: 'spki',
});
const semanticPublicKeyBase64Url = semanticPublicKeyDer
  .subarray(semanticPublicKeyDer.byteLength - 32)
  .toString('base64url');

const signSemanticPayload = (payload) =>
  sign(
    null,
    Buffer.from(canonicalJsonText(payload), 'utf8'),
    semanticSigningKeys.privateKey
  ).toString('base64url');

const orderedFamilyValues = (family, values) =>
  Object.freeze(
    [...values].sort((left, right) =>
      compareUnicodeCodePoints(
        createAgentModelEvaluationEvidenceArchiveOrderKey(family, left),
        createAgentModelEvaluationEvidenceArchiveOrderKey(family, right)
      )
    )
  );

const semanticFamilyDigest = (family, values) => {
  const accumulator =
    createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(family);
  for (const value of values) accumulator.append(value);
  return accumulator.finalize();
};

const createEndpointSmokeEvidence = ({ plan, target }) => {
  const suffix = target.smokeTargetId;
  const invocationId = `invocation.${suffix}`;
  const providerRequestId = `provider-request.${suffix}`;
  const budgetReservationId = `reservation.${suffix}`;
  const demandDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    demand: 'endpoint-smoke',
  });
  const settlementDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    settlement: 'endpoint-smoke',
  });
  const requestDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    direction: 'request',
  });
  const requestBodyDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    body: 'sanitized-request',
  });
  const responseHeaderDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    headers: 'sanitized-response',
  });
  const responseBodyDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    body: 'encrypted-response',
  });
  const responseDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    direction: 'response',
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    smokeTargetId: suffix,
    events: ['created', 'completed'],
  });
  const usageSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'endpoint-smoke-usage',
  });
  const costSourceContentDigest = digestAgentCanonicalValue({
    providerRequestId,
    source: 'endpoint-smoke-cost',
  });
  const usage = createAgentUsageVector([
    Object.freeze({
      unit: 'text-token-input',
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported',
      sourceDigest: usageSourceContentDigest,
    }),
    Object.freeze({
      unit: 'text-token-output',
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported',
      sourceDigest: usageSourceContentDigest,
    }),
  ]);
  const cost = normalizeAgentCosts([
    Object.freeze({
      currency: 'USD',
      amount: '0.000001',
      confidence: 'reported',
      sourceDigest: costSourceContentDigest,
    }),
  ]);
  const intent = createAgentEvaluationEndpointSmokeDispatchIntent({
    intentId: `intent.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    endpointClass: target.endpointClass,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    immutableModelVersion: target.immutableModelVersion,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    adapterDigest: target.adapterDigest,
    pricingAuthorityDigest: target.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      target.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: target.smokeProfileDigest,
    invocationId,
    budgetReservationId,
    demandDigest,
    requestDigest,
    endpointId: `endpoint.${suffix}`,
    requestBodyDigest,
    requestBytes: 1,
    createdAt: STARTED_AT,
  });
  const transport = createAgentEvaluationTransportReceipt({
    receiptId: `transport.${suffix}`,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    invocationId,
    dispatchIntentDigest: intent.intentDigest,
    requestDigest,
    endpointId: intent.endpointId,
    endpointClass: target.endpointClass,
    requestBodyDigest,
    requestBytes: 1,
    responseBytes: 1,
    httpStatus: 200,
    responseHeaderDigest,
    responseBodyDigest,
    providerRequestId,
    providerIdentityKind:
      target.protocolFamily === 'anthropic-messages'
        ? 'message-id'
        : target.protocolFamily === 'gemini-interactions'
          ? 'interaction-id'
          : 'response-id',
    providerResponseId: `provider-response.${suffix}`,
    resolvedModelId: target.modelId,
    resolvedModelVersion: target.immutableModelVersion,
    sseEventCount: 2,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt: STARTED_AT,
    completedAt: PROVIDER_COMPLETED_AT,
  });
  const aad = Object.freeze({
    format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad',
    version: 1,
    namespaceDigest: spoolNamespaceDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    invocationId,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    responseBodyDigest,
    normalizedEventSetDigest,
  });
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationEndpointSmokeResultSpoolId(aad),
    algorithm: 'aes-256-gcm',
    keyId: endpointSpoolProfile.keyId,
    keyVersion: endpointSpoolProfile.keyVersion,
    keyRefDigest: endpointSpoolProfile.keyRefDigest,
    encryptionProfileDigest: endpointSpoolProfile.encryptionProfileDigest,
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationEndpointSmokeResultSpoolAad(aad),
  });
  const spool = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
    aad,
    envelope,
    responseDigest,
    retentionPolicyDigest: endpointSpoolProfile.retention.retentionPolicyDigest,
    createdAt: PROVIDER_COMPLETED_AT,
    expiresAt: V8_TIME.expires,
  });
  const disposition =
    createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
      spoolRef: spool.spoolRef,
      spoolReceiptDigest: spool.receiptDigest,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      smokeTargetId: target.smokeTargetId,
      smokeTargetDigest: target.targetDigest,
      invocationId,
      disposition: 'consumed-and-destroyed',
      retentionPolicyDigest: spool.retentionPolicyDigest,
      disposedAt: OWNER_COMPLETED_AT,
    });
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.usage.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-usage',
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    providerRequestId,
    sourceContentDigest: usageSourceContentDigest,
    inputUsageDigest: usage.vectorDigest,
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: `source.cost.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    sourceKind: 'provider-reported-cost',
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    providerRequestId,
    sourceContentDigest: costSourceContentDigest,
    outputCostDigest: digestAgentEvaluationCostValues(cost),
    observedAt: PROVIDER_COMPLETED_AT,
  });
  const receipt = createAgentEvaluationEndpointSmokeReceipt({
    receiptId: `receipt.${suffix}`,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    endpointClass: target.endpointClass,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    immutableModelVersion: target.immutableModelVersion,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    adapterDigest: target.adapterDigest,
    pricingAuthorityDigest: target.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      target.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: target.smokeProfileDigest,
    invocationId,
    budgetReservationId,
    demandDigest,
    settlementDigest,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    requestDigest,
    providerRequestId,
    responseHeaderDigest,
    responseDigest,
    resolvedModelId: target.modelId,
    resolvedModelVersion: target.immutableModelVersion,
    spoolReceiptDigest: spool.receiptDigest,
    spoolDispositionReceiptDigest: disposition.receiptDigest,
    usage,
    cost,
    usageSourceReceiptDigest: usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: costSourceReceipt.receiptDigest,
    outcome: 'passed',
    startedAt: STARTED_AT,
    completedAt: OWNER_COMPLETED_AT,
  });
  return Object.freeze({
    intent,
    transport,
    spool,
    disposition,
    receipt,
    usageSourceReceipt,
    costSourceReceipt,
  });
};

const cachedSemanticEvidenceBases = new Map();

const createSemanticEvidenceBase = ({ legacyCoreOnly = false } = {}) => {
  const cacheKey = legacyCoreOnly ? 'legacy-13,200' : 'production-14,040';
  const cached = cachedSemanticEvidenceBases.get(cacheKey);
  if (cached) return cached;
  const plan = createSemanticPlan({ legacyCoreOnly });
  const qualificationAuthorityArchive = legacyCoreOnly
    ? Object.freeze({
        capabilityProbeAdmissions: Object.freeze([]),
        capabilityProbeReferenceReceipts: Object.freeze([]),
        runtimeFactSourceOwnerRegistrations: Object.freeze([]),
        capabilityProbeProviderResourceCleanups: Object.freeze([]),
      })
    : createV8QualificationAuthorityArchiveFixture();
  const baseBudgetLedger = createAgentBudgetLedger(plan.budget.budget);
  const hostedRuntimeResourceScope = legacyCoreOnly
    ? null
    : Object.freeze({
        namespaceId: 'g4-model-evaluation',
        repositoryCommit: plan.repositoryCommit,
        planDigest: plan.planDigest,
        frozenRunDigest,
        runConfigArtifactBindingDigest:
          createSemanticRunConfigArtifactBinding(plan).bindingDigest,
        runtimeResourceSetId: 'runtime-resource-set.semantic-fixture',
      });
  const hostedRuntimeResourceJournalFixture = hostedRuntimeResourceScope
    ? createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
        plan,
        baseBudgetLedger,
        Object.freeze({
          ...AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
          settledAt: '2026-08-02T03:00:00.004Z',
        }),
        hostedRuntimeResourceScope
      )
    : null;
  const hostedRuntimeResourceFixtureInput =
    hostedRuntimeResourceScope && hostedRuntimeResourceJournalFixture
      ? Object.freeze({
          ...hostedRuntimeResourceScope,
          registeredAt: V8_TIME.started,
          expiresAt: plan.expiresAt,
          registrationIntents:
            hostedRuntimeResourceJournalFixture.registrationIntents,
          lifecycleBudgetDemands:
            hostedRuntimeResourceJournalFixture.lifecycleBudgetDemands,
          lifecycleBudgetReservationAuthorities:
            hostedRuntimeResourceJournalFixture.budgetReservationAuthorities,
          lifecycleBudgetDigest: plan.budget.budgetDigest,
          lifecycleBudgetReservePolicyDigest: plan.budget.reservePolicyDigest,
          lifecycleAuthorityCommitments:
            hostedRuntimeResourceJournalFixture.lifecycleAuthorityCommitments,
        })
      : null;
  const hostedRuntimeResourceFixture = hostedRuntimeResourceFixtureInput
    ? createAgentHostedRetrievalRuntimeResourceExact4Fixture(
        hostedRuntimeResourceFixtureInput
      )
    : null;
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const expectedDescriptorCount = legacyCoreOnly ? 13_200 : 14_040;
  if (descriptors.length !== expectedDescriptorCount) {
    throw new TypeError(
      `Semantic verifier fixture requires ${expectedDescriptorCount} attempts; observed ${descriptors.length}.`
    );
  }
  const cases = new Map(
    plan.concreteCases.map((value) => [value.caseId, value])
  );
  const targets = new Map(
    plan.capabilityQualificationTargets.map((value) => [value.targetId, value])
  );
  const resolvedCapabilityDescriptorFor = (descriptor) => {
    const concreteCase = cases.get(descriptor.caseId);
    const target = targets.get(descriptor.targetId);
    if (!concreteCase || !target) return undefined;
    const resolved = resolveAgentEvaluationCapabilityDescriptor(
      concreteCase,
      target
    );
    return resolved.descriptorDigest === descriptor.capabilityDescriptorDigest
      ? resolved
      : undefined;
  };
  const providers = new Map(
    plan.providerConfigurations.map((value) => [
      value.providerConfigurationId,
      value,
    ])
  );
  const models = new Map(
    plan.modelConfigurations.map((value) => [value.lineageDigest, value])
  );
  const pricingSnapshots = new Map();
  const pricingAuthorities = Object.create(null);
  const sourceReceipts = [];
  for (const target of plan.endpointSmokeTargets) {
    const snapshot = createPricingSnapshot(target.providerConfigurationId);
    const source = Object.freeze({
      sourceUri: `https://pricing.example.test/${target.providerConfigurationId}`,
      observedAt: V8_TIME.completed,
    });
    pricingSnapshots.set(target.providerConfigurationId, snapshot);
    pricingAuthorities[target.providerConfigurationId] = Object.freeze({
      providerConfigurationId: target.providerConfigurationId,
      authorityDigest: target.pricingAuthorityDigest,
      source,
      snapshot,
    });
    sourceReceipts.push(
      createAgentEvaluationSourceReceipt({
        sourceReceiptId: createAgentEvaluationPlanPricingSourceReceiptId({
          planDigest: plan.planDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          pricingAuthorityDigest: target.pricingAuthorityDigest,
          pricingSnapshotDigest: snapshot.snapshotDigest,
        }),
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        sourceKind: 'pricing-snapshot',
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        sourceUri: source.sourceUri,
        sourceContentDigest: snapshot.snapshotDigest,
        pricingSnapshot: snapshot,
        observedAt: source.observedAt,
      })
    );
  }
  const endpointSmoke = plan.endpointSmokeTargets.map((target) =>
    createEndpointSmokeEvidence({ plan, target })
  );
  sourceReceipts.push(
    ...endpointSmoke.flatMap(({ usageSourceReceipt, costSourceReceipt }) => [
      usageSourceReceipt,
      costSourceReceipt,
    ])
  );
  const humanReviewReport = createV8HumanReviewReport(plan);
  const reviewedAttemptIds = new Set(
    humanReviewReport.ratings.map(({ attemptId }) => attemptId)
  );
  if (reviewedAttemptIds.size < 1 || reviewedAttemptIds.size > 18) {
    throw new TypeError('Semantic verifier fixture human sample is unbounded.');
  }
  const blockedDescriptorByReceiptKind = new Map(
    legacyCoreOnly
      ? []
      : ['authority-denial-receipt', 'capability-unavailable-receipt'].map(
          (receiptKind) => [
            receiptKind,
            descriptors.find((descriptor) => {
              const resolvedCapabilityDescriptor =
                resolvedCapabilityDescriptorFor(descriptor);
              return (
                !reviewedAttemptIds.has(descriptor.attemptId) &&
                resolvedCapabilityDescriptor?.supportExpectation ===
                  'expected-blocked' &&
                resolvedCapabilityDescriptor.expectedReceiptKinds.includes(
                  receiptKind
                )
              );
            }),
          ]
        )
  );
  if (
    !legacyCoreOnly &&
    [...blockedDescriptorByReceiptKind.values()].some((value) => !value)
  ) {
    throw new TypeError(
      'Semantic verifier fixture denial/unavailable slices are missing.'
    );
  }
  const blockedReceiptKindByAttemptId = new Map(
    [...blockedDescriptorByReceiptKind.entries()].map(
      ([receiptKind, descriptor]) => [descriptor.attemptId, receiptKind]
    )
  );
  const sharedCapabilityProfiles = Object.freeze([
    'g4-provider-background-job',
    'g4-provider-hosted-retrieval-core',
    'g4-provider-hosted-retrieval-document',
    'g4-provider-isolated-cache',
    'g4-provider-reasoning-continuation',
  ]);
  const sharedDescriptorByProfile = new Map(
    legacyCoreOnly
      ? []
      : sharedCapabilityProfiles.map((profileId) => [
          profileId,
          descriptors.find((descriptor) => {
            const target = targets.get(descriptor.targetId);
            const resolvedCapabilityDescriptor =
              resolvedCapabilityDescriptorFor(descriptor);
            return (
              !reviewedAttemptIds.has(descriptor.attemptId) &&
              !blockedReceiptKindByAttemptId.has(descriptor.attemptId) &&
              target?.capabilityProfileId === profileId &&
              resolvedCapabilityDescriptor?.supportExpectation === 'required'
            );
          }),
        ])
  );
  if (
    !legacyCoreOnly &&
    [...sharedDescriptorByProfile.values()].some((descriptor) => !descriptor)
  ) {
    throw new TypeError(
      'Semantic verifier fixture shared optional capability slices are missing.'
    );
  }
  const sharedProfileByAttemptId = new Map(
    [...sharedDescriptorByProfile.entries()].map(([profileId, descriptor]) => [
      descriptor.attemptId,
      profileId,
    ])
  );
  const values = {
    capabilityProbeAdmissions: [
      ...qualificationAuthorityArchive.capabilityProbeAdmissions,
    ],
    capabilityProbeReferenceReceipts: [
      ...qualificationAuthorityArchive.capabilityProbeReferenceReceipts,
    ],
    runtimeFactSourceOwnerRegistrations: [
      ...qualificationAuthorityArchive.runtimeFactSourceOwnerRegistrations,
    ],
    capabilityProbeProviderResourceCleanups: [
      ...qualificationAuthorityArchive.capabilityProbeProviderResourceCleanups,
    ],
    hostedRetrievalRuntimeResourceCleanups: [
      ...(qualificationAuthorityArchive.hostedRetrievalRuntimeResourceCleanups ??
        []),
    ],
    hostedRetrievalRuntimeResourceLifecycleJournals:
      hostedRuntimeResourceJournalFixture?.archiveFamily.records ?? [],
    capabilityEffectProviderRuntimeJournals: [],
    optionalCapabilityFactSources: [],
    optionalCapabilityFactAuthorities: [],
    preDispatchFailureReceipts: [],
    transportDispatchIntents: [],
    transportReceipts: [],
    providerResultSpoolReceipts: [],
    providerResultSpoolDispositionReceipts: [],
    invocationTurnReceipts: [],
    invocationTurnSetReceipts: [],
    resultSubmissionReceipts: [],
    attemptAuthorityOwnerReceipts: [],
    verificationAttemptGrantReceipts: [],
    controlledRuntimeReceipts: [],
    capabilityExecutionReceipts: [],
    capabilitySpecificReceipts: [],
    providerCapabilityObservationReceipts: [],
    reviewRasterScanReceipts: [],
    reviewCandidateRefs: [],
    executionReceipts: [],
    attempts: [],
  };
  for (const descriptor of descriptors) {
    const concreteCase = cases.get(descriptor.caseId);
    if (!concreteCase) {
      throw new TypeError('Semantic verifier fixture case is missing.');
    }
    const target = targets.get(descriptor.targetId);
    const resolvedCapabilityDescriptor =
      resolvedCapabilityDescriptorFor(descriptor);
    if (!target || !resolvedCapabilityDescriptor) {
      throw new TypeError(
        `Semantic verifier fixture resolved capability authority is missing for ${descriptor.attemptId}.`
      );
    }
    const includeReviewCandidate = reviewedAttemptIds.has(descriptor.attemptId);
    const blockedReceiptKind = blockedReceiptKindByAttemptId.get(
      descriptor.attemptId
    );
    const sharedCapabilityProfileId = sharedProfileByAttemptId.get(
      descriptor.attemptId
    );
    const includeObservedCacheSpecific = false;
    if (
      !includeReviewCandidate &&
      blockedReceiptKind === undefined &&
      !includeObservedCacheSpecific &&
      sharedCapabilityProfileId === undefined
    ) {
      const context = createPreDispatchContext({
        plan,
        descriptor,
        concreteCase,
        resolvedCapabilityDescriptor,
      });
      values.preDispatchFailureReceipts.push(context.failure);
      values.invocationTurnReceipts.push(context.turn);
      values.invocationTurnSetReceipts.push(context.turnSet);
      values.capabilityExecutionReceipts.push(context.capabilityExecution);
      values.executionReceipts.push(context.execution);
      values.attempts.push(context.attempt);
      continue;
    }
    const provider = target
      ? providers.get(target.providerConfigurationId)
      : undefined;
    const model = target ? models.get(target.modelLineageDigest) : undefined;
    const pricingSnapshot = target
      ? pricingSnapshots.get(target.providerConfigurationId)
      : undefined;
    if (!target || !provider || !model || !pricingSnapshot) {
      throw new TypeError(
        `Semantic verifier fixture provider authority is missing for ${descriptor.attemptId} (${descriptor.targetId}): target=${Boolean(target)}, provider=${Boolean(provider)}, model=${Boolean(model)}, pricing=${Boolean(pricingSnapshot)}.`
      );
    }
    let context = createFullContext({
      plan,
      descriptor,
      concreteCase,
      target,
      resolvedCapabilityDescriptor,
      provider,
      model,
      pricingSnapshot,
      blockedReceiptKind,
      includeObservedCacheSpecific,
      includeReviewCandidate,
    });
    if (sharedCapabilityProfileId !== undefined) {
      context = upgradeFullContextToSharedCapability({
        context,
        plan,
        descriptor,
        concreteCase,
        target,
        resolvedCapabilityDescriptor,
        provider,
        model,
        profileId: sharedCapabilityProfileId,
        hostedRuntimeResourceFixture,
      });
    }
    values.transportDispatchIntents.push(
      ...(context.dispatchIntents ?? [context.dispatchIntent])
    );
    values.transportReceipts.push(
      ...(context.transportReceipts ?? [context.transportReceipt])
    );
    values.providerResultSpoolReceipts.push(
      ...(context.providerResultSpoolReceipts ?? [
        context.providerResultSpoolReceipt,
      ])
    );
    values.providerResultSpoolDispositionReceipts.push(
      ...(context.providerResultSpoolDispositionReceipts ?? [
        context.providerResultSpoolDispositionReceipt,
      ])
    );
    values.invocationTurnReceipts.push(...(context.turns ?? [context.turn]));
    values.invocationTurnSetReceipts.push(context.turnSet);
    values.resultSubmissionReceipts.push(context.resultSubmissionReceipt);
    values.attemptAuthorityOwnerReceipts.push(
      ...(context.executeOwners ?? []),
      context.assessmentOwner,
      context.gradingOwner
    );
    values.verificationAttemptGrantReceipts.push(
      context.verificationAttemptGrantReceipt
    );
    values.controlledRuntimeReceipts.push(context.controlledRuntime);
    values.capabilityExecutionReceipts.push(context.capabilityExecution);
    values.capabilitySpecificReceipts.push(
      ...context.capabilitySpecificReceipts
    );
    if (context.providerCapabilityObservationReceipts) {
      values.providerCapabilityObservationReceipts.push(
        ...context.providerCapabilityObservationReceipts
      );
    } else if (context.providerCapabilityObservationReceipt) {
      values.providerCapabilityObservationReceipts.push(
        context.providerCapabilityObservationReceipt
      );
    }
    values.optionalCapabilityFactSources.push(
      ...(context.optionalCapabilityFactSources ?? [])
    );
    values.optionalCapabilityFactAuthorities.push(
      ...(context.optionalCapabilityFactAuthorities ?? [])
    );
    values.capabilityEffectProviderRuntimeJournals.push(
      ...(context.capabilityEffectProviderRuntimeJournals ?? [])
    );
    if (context.reviewRasterScanReceipt && context.reviewCandidateRef) {
      values.reviewRasterScanReceipts.push(context.reviewRasterScanReceipt);
      values.reviewCandidateRefs.push(context.reviewCandidateRef);
    }
    values.executionReceipts.push(context.execution);
    values.attempts.push(context.attempt);
    sourceReceipts.push(
      context.usageSourceReceipt,
      context.costSourceReceipt,
      ...(context.additionalSourceReceipts ?? [])
    );
  }
  for (const family of Object.keys(values)) {
    values[family] = orderedFamilyValues(family, values[family]);
  }
  const reviewedAttempts = values.attempts.filter(({ descriptor }) =>
    reviewedAttemptIds.has(descriptor.attemptId)
  );
  const validatedHumanReviewArtifact = createV8ValidatedHumanReviewArtifact(
    plan,
    humanReviewReport
  );
  const validatedHumanMetricObservations =
    createAgentEvaluationValidatedHumanMetricObservations({
      plan,
      attempts: reviewedAttempts,
      humanReviewReport,
      validatedHumanReviewArtifact,
    });
  const metricReport = buildAgentEvaluationMetricReport({
    reportId: 'metric-report.semantic-verifier',
    plan,
    descriptors,
    attempts: values.attempts,
    validatedHumanMetricObservations,
    generatedAt: V8_TIME.evaluated,
  });
  const graderReport = buildAgentEvaluationGraderReport({
    reportId: 'grader-report.semantic-verifier',
    plan,
    attempts: values.attempts,
    validatedHumanMetricObservations,
    generatedAt: V8_TIME.evaluated,
  });
  const holdoutExecutionReceipt = createV8HoldoutReceipt(plan);
  const manifest = createAgentModelEvaluationManifest({
    manifestId: 'manifest.semantic-verifier',
    plan,
    descriptors,
    attempts: values.attempts,
    validatedHumanMetricObservations,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    completedAt: V8_TIME.evaluated,
    expiresAt: V8_TIME.expires,
  });
  if (manifest.outcome !== 'satisfied') {
    throw new TypeError(
      `Semantic verifier fixture manifest is ${manifest.outcome}.`
    );
  }
  const budgetLedger =
    hostedRuntimeResourceJournalFixture?.budgetLedger ?? baseBudgetLedger;
  const attemptsByShard = new Map();
  for (const attempt of values.attempts) {
    const shard = attemptsByShard.get(attempt.descriptor.shardId) ?? [];
    shard.push(attempt);
    attemptsByShard.set(attempt.descriptor.shardId, shard);
  }
  const checkpoints = orderedFamilyValues(
    'checkpoints',
    [...attemptsByShard.entries()].map(([shardId, shardAttempts]) =>
      createAgentEvaluationShardCheckpoint({
        planDigest: plan.planDigest,
        shardId,
        revision: 1,
        leaseOwnerId: 'evaluation.runner.semantic-fixture',
        leaseGeneration: 1,
        state: 'completed',
        completedAttemptRefs: shardAttempts.map((attempt) =>
          Object.freeze({
            attemptId: attempt.descriptor.attemptId,
            descriptorDigest: attempt.descriptor.descriptorDigest,
            attemptDigest: attempt.attemptDigest,
          })
        ),
        missingAttemptRefs: Object.freeze([]),
        budgetLedger,
        updatedAt: V8_TIME.evaluated,
      })
    )
  );
  let hostedRuntimeResourceLifecycleJournalArchiveFamily =
    hostedRuntimeResourceJournalFixture?.archiveFamily;
  if (
    hostedRuntimeResourceFixtureInput &&
    hostedRuntimeResourceJournalFixture
  ) {
    const hostedRuntimeResourceLifecycleFixture =
      createSemanticHostedRuntimeResourceLifecycleFixture({
        fixtureInput: hostedRuntimeResourceFixtureInput,
        checkpoints,
        attempts: values.attempts,
      });
    const joinedHostedRuntimeResourceLifecycle =
      joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup(
        hostedRuntimeResourceJournalFixture,
        hostedRuntimeResourceLifecycleFixture
      );
    values.hostedRetrievalRuntimeResourceCleanups =
      joinedHostedRuntimeResourceLifecycle.lifecycle.cleanupArchiveFamily;
    values.hostedRetrievalRuntimeResourceLifecycleJournals =
      joinedHostedRuntimeResourceLifecycle.journal.archiveFamily.records;
    hostedRuntimeResourceLifecycleJournalArchiveFamily =
      joinedHostedRuntimeResourceLifecycle.journal.archiveFamily;
  }
  const hostedRuntimeResourceLifecycleBudgetEvidence =
    createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence(
      plan,
      hostedRuntimeResourceLifecycleJournalArchiveFamily
    );
  const blindReviewMappingRefs = orderedFamilyValues(
    'blindReviewMappingRefs',
    values.reviewCandidateRefs.map((reference) =>
      Object.freeze({
        mappingId: `blind-mapping:${reference.candidateDigest.slice('sha256-'.length)}`,
        mappingDigest: digestAgentCanonicalValue({
          planDigest: plan.planDigest,
          candidateId: reference.candidateId,
          candidateDigest: reference.candidateDigest,
          projectionAuthorityDigest: reference.projectionAuthorityDigest,
        }),
      })
    )
  );
  const evidence = Object.freeze({
    plan,
    frozenRunConfig: Object.freeze({
      purpose: 'production',
      sourceConfigDigest,
      frozenRunDigest,
      plan,
      pricingAuthorities: Object.freeze(pricingAuthorities),
      responseSpoolEncryption: attemptSpoolProfile,
      nativeProviderStateVaultEncryption,
      endpointSmokeResponseSpoolEncryption: Object.freeze({
        ...endpointSpoolProfile,
        encryptionPolicyDigest:
          plan.endpointSmokeTargets[0].responseSpoolEncryptionPolicyDigest,
      }),
      controlledRuntime: Object.freeze({
        loop: Object.freeze({ maximumTurnsPerAttempt: 7 }),
      }),
    }),
    endpointSmokeDispatchIntents: orderedFamilyValues(
      'endpointSmokeDispatchIntents',
      endpointSmoke.map(({ intent }) => intent)
    ),
    endpointSmokeTransportReceipts: orderedFamilyValues(
      'endpointSmokeTransportReceipts',
      endpointSmoke.map(({ transport }) => transport)
    ),
    endpointSmokeResultSpoolReceipts: orderedFamilyValues(
      'endpointSmokeResultSpoolReceipts',
      endpointSmoke.map(({ spool }) => spool)
    ),
    endpointSmokeResultSpoolDispositionReceipts: orderedFamilyValues(
      'endpointSmokeResultSpoolDispositionReceipts',
      endpointSmoke.map(({ disposition }) => disposition)
    ),
    endpointSmokeValidationFailureReceipts: Object.freeze([]),
    endpointSmokeReceipts: orderedFamilyValues(
      'endpointSmokeReceipts',
      endpointSmoke.map(({ receipt }) => receipt)
    ),
    ...values,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      hostedRuntimeResourceLifecycleBudgetEvidence.journalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      hostedRuntimeResourceLifecycleBudgetEvidence.bindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      hostedRuntimeResourceLifecycleBudgetEvidence.bindingSetDigest,
    validatedHumanReviewArtifacts: Object.freeze([
      validatedHumanReviewArtifact,
    ]),
    validatedHumanMetricObservations: orderedFamilyValues(
      'validatedHumanMetricObservations',
      validatedHumanMetricObservations
    ),
    blindReviewMappingRefs,
    sourceReceipts: orderedFamilyValues('sourceReceipts', sourceReceipts),
    checkpoints,
    budgetLedger,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    manifest,
  });
  cachedSemanticEvidenceBases.set(cacheKey, evidence);
  return evidence;
};

const recreateOwnerReceipt = (receipt, responseProjection) => {
  const {
    format: _format,
    version: _version,
    responseDigest: _responseDigest,
    receiptDigest: _receiptDigest,
    ...input
  } = receipt;
  return createAgentEvaluationAttemptAuthorityOwnerReceipt({
    ...input,
    responseProjection,
  });
};

const recommitProviderObservationWithAuthorities = (
  receipt,
  factAuthorities
) => {
  const {
    format,
    version,
    factAuthorities: _factAuthorities,
    selectedRuntimeFactEnvelopeSetDigest: _selectedRuntimeFactEnvelopeSetDigest,
    sourceAuthoritySetDigest: _sourceAuthoritySetDigest,
    observationDigest: _observationDigest,
    receiptDigest: _receiptDigest,
    ...input
  } = receipt;
  const canonicalAuthorities = Object.freeze([...factAuthorities]);
  const base = Object.freeze({
    format,
    version,
    ...input,
    factAuthorities: canonicalAuthorities,
    selectedRuntimeFactEnvelopeSetDigest:
      digestAgentEvaluationSelectedRuntimeFactEnvelopeSet(canonicalAuthorities),
    sourceAuthoritySetDigest:
      digestAgentEvaluationProviderCapabilitySourceAuthoritySet(
        canonicalAuthorities
      ),
  });
  const observationDigest = digestAgentCanonicalValue({
    planDigest: base.planDigest,
    repositoryCommit: base.repositoryCommit,
    attemptId: base.attemptId,
    descriptorDigest: base.descriptorDigest,
    turnIndex: base.turnIndex,
    invocationId: base.invocationId,
    requestDigest: base.requestDigest,
    responseDigest: base.responseDigest,
    protocolFamily: base.protocolFamily,
    providerConfigurationId: base.providerConfigurationId,
    modelLineageDigest: base.modelLineageDigest,
    adapterDigest: base.adapterDigest,
    dispatchIntentDigest: base.dispatchIntentDigest,
    transportReceiptDigest: base.transportReceiptDigest,
    resultSpoolReceiptDigest: base.resultSpoolReceiptDigest,
    normalizedEventSetDigest: base.normalizedEventSetDigest,
    selectedRuntimeFactEnvelopeSetDigest:
      base.selectedRuntimeFactEnvelopeSetDigest,
    sourceAuthoritySetDigest: base.sourceAuthoritySetDigest,
    factDigests: base.facts.map(({ factKind, factDigest }) =>
      Object.freeze({ factKind, factDigest })
    ),
    factAuthorityDigests: base.factAuthorities.map(
      ({ factKind, factDigest, authorityDigest }) =>
        Object.freeze({ factKind, factDigest, authorityDigest })
    ),
  });
  const receiptBase = Object.freeze({ ...base, observationDigest });
  return Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
};

const duplicateQualificationArchiveRecord = (base, family) => {
  const records = [...base[family]];
  if (!records[0] || !records[1]) {
    throw new TypeError(
      `Semantic verifier fixture ${family} mutation requires two records.`
    );
  }
  records[0] = records[1];
  return Object.freeze({
    ...base,
    [family]: orderedFamilyValues(family, records),
  });
};

const recommitProviderResourceCleanup = (base, mutationKind) => {
  const records = [...base.capabilityProbeProviderResourceCleanups];
  const original = records[0];
  if (!original) {
    throw new TypeError(
      'Semantic verifier fixture Provider resource cleanup mutation is missing its authority.'
    );
  }
  const ownerImplementationDigest =
    mutationKind === 'owner'
      ? digestAgentCanonicalValue({
          mutation: 'provider-resource-cleanup-owner',
          resourceRegistrationRequestDigest:
            original.resourceRegistrationRequestDigest,
        })
      : original.ownerImplementationDigest;
  const resourceResults =
    mutationKind === 'result'
      ? original.cleanupReceipt.resourceResults.map((result, index) =>
          index === 0
            ? createAgentCapabilityProbeProviderResourceCleanupResourceResult({
                resourceId: result.resourceId,
                resourceRole: result.resourceRole,
                outcome:
                  result.outcome === 'deleted' ? 'already-absent' : 'deleted',
                dispatchIntentDigest: result.dispatchIntentDigest,
                transportReceiptDigest: result.transportReceiptDigest,
                completedAt: result.completedAt,
              })
            : result
        )
      : original.cleanupReceipt.resourceResults;
  const cleanupReceipt =
    createAgentCapabilityProbeProviderResourceCleanupReceipt({
      deletionAuthorityReceipt: original.deletionAuthorityReceipt,
      resourceResults: Object.freeze([...resourceResults]),
    });
  const cleanupRequest =
    createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
      repositoryCommit: original.repositoryCommit,
      resourceRegistrationRequestDigest:
        original.resourceRegistrationRequestDigest,
      deletionAuthorityReceiptDigest: original.deletionAuthorityReceiptDigest,
    });
  const cleanupResponse =
    createAgentCapabilityProbeProviderResourceCleanupResponse({
      repositoryCommit: original.repositoryCommit,
      resourceRegistrationRequestDigest:
        original.resourceRegistrationRequestDigest,
      ownerImplementationDigest,
      cleanupReceipt,
    });
  records[0] =
    createAgentEvaluationCapabilityProbeProviderResourceCleanupArchiveRecord({
      repositoryCommit: original.repositoryCommit,
      resourceRegistrationRequestDigest:
        original.resourceRegistrationRequestDigest,
      cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
      deletionAuthorityReceiptDigest: original.deletionAuthorityReceiptDigest,
      ownerImplementationDigest,
      stageDigest: cleanupResponse.stageDigest,
      ownerAdmissionDigest: cleanupResponse.ownerAdmissionDigest,
      dispatchAckDigest: cleanupResponse.dispatchAckDigest,
      resultIngressDigest: cleanupResponse.resultIngressDigest,
      resultIngressReceiptDigest: cleanupResponse.resultIngressReceiptDigest,
      cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
      cleanupRequest,
      deletionAuthorityReceipt: original.deletionAuthorityReceipt,
      cleanupReceipt,
      cleanupResponse,
    });
  return Object.freeze({
    ...base,
    capabilityProbeProviderResourceCleanups: orderedFamilyValues(
      'capabilityProbeProviderResourceCleanups',
      records
    ),
  });
};

const removeProviderResourceCleanup = (base) =>
  Object.freeze({
    ...base,
    capabilityProbeProviderResourceCleanups: orderedFamilyValues(
      'capabilityProbeProviderResourceCleanups',
      base.capabilityProbeProviderResourceCleanups.slice(1)
    ),
  });

const recommitOptionalCapabilityRawPair = (base, mutationKind) => {
  const sourceRecords = [...base.optionalCapabilityFactSources];
  const authorityRecords = [...base.optionalCapabilityFactAuthorities];
  let sourceIndex = 0;
  let replacementFact;
  if (mutationKind === 'fact-authority') {
    sourceIndex = sourceRecords.findIndex((source, index) =>
      sourceRecords.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.attemptId === source.attemptId &&
          candidate.effectSourceFact?.factKind ===
            source.effectSourceFact?.factKind
      )
    );
    const source = sourceRecords[sourceIndex];
    replacementFact = sourceRecords.find(
      (candidate, candidateIndex) =>
        candidateIndex !== sourceIndex &&
        candidate.attemptId === source?.attemptId &&
        candidate.effectSourceFact?.factKind ===
          source?.effectSourceFact?.factKind
    )?.effectSourceFact;
  }
  const sourceRecord = sourceRecords[sourceIndex];
  const authorityIndex = authorityRecords.findIndex(
    ({ attemptId, turnIndex }) =>
      attemptId === sourceRecord?.attemptId &&
      turnIndex === sourceRecord?.turnIndex
  );
  const authorityRecord = authorityRecords[authorityIndex];
  if (!sourceRecord || !authorityRecord) {
    throw new TypeError(
      'Semantic verifier fixture optional raw-pair mutation is missing its source or authority.'
    );
  }
  const fact = replacementFact ?? sourceRecord.effectSourceFact;
  if (!fact) {
    throw new TypeError(
      'Semantic verifier fixture optional raw-pair mutation is missing its observed fact.'
    );
  }
  const mutationDigest = digestAgentCanonicalValue({
    mutation: `optional-capability-${mutationKind}`,
    attemptId: sourceRecord.attemptId,
    turnIndex: sourceRecord.turnIndex,
  });
  const {
    format: _effectFormat,
    version: _effectVersion,
    receiptDigest: _effectReceiptDigest,
    ...effectInput
  } = sourceRecord.effectSourceReceipt;
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(
      sourceRecord.preEffectIntent,
      {
        ...effectInput,
        ...(mutationKind === 'source'
          ? { transportReceiptDigest: mutationDigest }
          : {}),
        ...(mutationKind === 'stage' ? { stageDigest: mutationDigest } : {}),
        ...(mutationKind === 'ack'
          ? { dispatchAckDigest: mutationDigest }
          : {}),
        ...(mutationKind === 'envelope'
          ? { normalizedEventSetDigest: mutationDigest }
          : {}),
        ...(mutationKind === 'result'
          ? { businessResultDigest: mutationDigest }
          : {}),
        ...(mutationKind === 'fact-authority'
          ? {
              businessResultDigest: mutationDigest,
              sourceFactKind: fact.factKind,
              sourceFactDigest: fact.factDigest,
            }
          : {}),
      }
    );
  const originalReceipt = sourceRecord.sourceReceipt;
  const sourceRequest =
    createAgentEvaluationOptionalCapabilityFactSourceRequest({
      attemptId: originalReceipt.attemptId,
      descriptorDigest: originalReceipt.descriptorDigest,
      targetId: originalReceipt.targetId,
      targetDigest: originalReceipt.targetDigest,
      capabilityProfileId: originalReceipt.capabilityProfileId,
      capabilityProfileDigest: originalReceipt.capabilityProfileDigest,
      capabilityDescriptorDigest: originalReceipt.capabilityDescriptorDigest,
      capabilityId: originalReceipt.capabilityId,
      supportExpectation: originalReceipt.supportExpectation,
      turnIndex: originalReceipt.turnIndex,
      invocationId: originalReceipt.invocationId,
      protocolFamily: originalReceipt.protocolFamily,
      providerConfigurationId: originalReceipt.providerConfigurationId,
      modelId: originalReceipt.modelId,
      modelLineageDigest: originalReceipt.modelLineageDigest,
      adapterDigest: originalReceipt.adapterDigest,
      providerRequestDigest: originalReceipt.providerRequestDigest,
      responseDigest: originalReceipt.responseDigest,
      dispatchIntentDigest: originalReceipt.dispatchIntentDigest,
      transportReceiptDigest: effectSourceReceipt.transportReceiptDigest,
      resultSpoolReceiptDigest: effectSourceReceipt.resultSpoolReceiptDigest,
      normalizedEventSetDigest: effectSourceReceipt.normalizedEventSetDigest,
      source: Object.freeze({
        kind: originalReceipt.sourceKind,
        ownerRequestDigest: originalReceipt.ownerRequestDigest,
        ownerReceiptDigest: originalReceipt.ownerReceiptDigest,
        effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
      }),
    });
  const sourceDigestBase = Object.freeze({
    kind: sourceRequest.source.kind,
    planDigest: originalReceipt.planDigest,
    repositoryCommit: originalReceipt.repositoryCommit,
    attemptId: sourceRequest.attemptId,
    descriptorDigest: sourceRequest.descriptorDigest,
    turnIndex: sourceRequest.turnIndex,
    invocationId: sourceRequest.invocationId,
    providerRequestDigest: sourceRequest.providerRequestDigest,
    responseDigest: sourceRequest.responseDigest,
    dispatchIntentDigest: sourceRequest.dispatchIntentDigest,
    transportReceiptDigest: sourceRequest.transportReceiptDigest,
    resultSpoolReceiptDigest: sourceRequest.resultSpoolReceiptDigest,
    normalizedEventSetDigest: sourceRequest.normalizedEventSetDigest,
    ownerRequestDigest: originalReceipt.ownerRequestDigest,
    ownerReceiptDigest: originalReceipt.ownerReceiptDigest,
    ownerStageDigest: effectSourceReceipt.stageDigest,
    ownerDispatchAckDigest: effectSourceReceipt.dispatchAckDigest,
    preEffectIntentDigest: sourceRecord.preEffectIntent.intentDigest,
    effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
    effectSourceFactDigest: fact.factDigest,
    businessResultDigest: effectSourceReceipt.businessResultDigest,
    outcome: 'observed',
    factDigest: fact.factDigest,
  });
  const {
    sourceDigest: _sourceDigest,
    sourceRequestDigest: _sourceRequestDigest,
    sourceSealDigest: _sourceSealDigest,
    ...sourceReceiptInput
  } = originalReceipt;
  const sourceReceiptBase = Object.freeze({
    ...sourceReceiptInput,
    transportReceiptDigest: effectSourceReceipt.transportReceiptDigest,
    resultSpoolReceiptDigest: effectSourceReceipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: effectSourceReceipt.normalizedEventSetDigest,
    sourceDigest: digestAgentCanonicalValue(sourceDigestBase),
    sourceRequestDigest:
      digestAgentEvaluationOptionalCapabilityFactSourceRequest(sourceRequest),
    ownerStageDigest: effectSourceReceipt.stageDigest,
    ownerDispatchAckDigest: effectSourceReceipt.dispatchAckDigest,
    effectSourceReceiptDigest: effectSourceReceipt.receiptDigest,
    effectSourceFactDigest: fact.factDigest,
    businessResultDigest: effectSourceReceipt.businessResultDigest,
    fact,
  });
  const sourceReceipt =
    decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(
      Object.freeze({
        ...sourceReceiptBase,
        sourceSealDigest: digestAgentCanonicalValue(sourceReceiptBase),
      }),
      {
        namespaceId: originalReceipt.namespaceId,
        planDigest: originalReceipt.planDigest,
        repositoryCommit: originalReceipt.repositoryCommit,
        request: sourceRequest,
      }
    );
  const newSourceRecord =
    createAgentEvaluationOptionalCapabilityFactSourceArchiveRecord({
      attemptId: sourceRecord.attemptId,
      turnIndex: sourceRecord.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      sourceReceipt,
      preEffectIntent: sourceRecord.preEffectIntent,
      effectSourceReceipt,
      effectSourceFact: fact,
    });
  const originalEnvelope = authorityRecord.runtimeFactEnvelope;
  const runtimeFactEnvelope =
    createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromEffectSourceReceipt(
      sourceRecord.preEffectIntent,
      effectSourceReceipt,
      {
        planDigest: originalEnvelope.planDigest,
        repositoryCommit: originalEnvelope.repositoryCommit,
        attemptId: originalEnvelope.attemptId,
        descriptorDigest: originalEnvelope.descriptorDigest,
        turnIndex: originalEnvelope.turnIndex,
        invocationId: originalEnvelope.invocationId,
        requestDigest: originalEnvelope.requestDigest,
        responseDigest: originalEnvelope.responseDigest,
        protocolFamily: originalEnvelope.protocolFamily,
        providerConfigurationId: originalEnvelope.providerConfigurationId,
        modelLineageDigest: originalEnvelope.modelLineageDigest,
        adapterDigest: originalEnvelope.adapterDigest,
        dispatchIntentDigest: originalEnvelope.dispatchIntentDigest,
        observedAt: originalEnvelope.observedAt,
        fact,
      },
      semanticObservationSanitization
    );
  if (!runtimeFactEnvelope) {
    throw new TypeError(
      'Semantic verifier fixture mutated optional runtime envelope is unavailable.'
    );
  }
  const factAuthority =
    createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
      runtimeFactEnvelope,
      semanticObservationSanitization
    );
  const stageRequest = createAgentEvaluationOptionalCapabilityFactStageRequest({
    planDigest: originalReceipt.planDigest,
    repositoryCommit: originalReceipt.repositoryCommit,
    attemptId: originalReceipt.attemptId,
    descriptorDigest: originalReceipt.descriptorDigest,
    turnIndex: originalReceipt.turnIndex,
    sourceSealDigest: sourceReceipt.sourceSealDigest,
  });
  const authorityRequestDigest =
    digestAgentEvaluationOptionalCapabilityFactAuthorityRequest(stageRequest);
  const stageDigest = digestAgentEvaluationOptionalCapabilityFactStage(
    authorityRequestDigest,
    sourceReceipt
  );
  const stageResponse =
    decodeAgentEvaluationOptionalCapabilityFactStageResponse(
      Object.freeze({
        format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT,
        version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
        authorityRequestDigest,
        sourceSealDigest: sourceReceipt.sourceSealDigest,
        stageDigest,
        replayed: false,
      }),
      { request: stageRequest, receipt: sourceReceipt }
    );
  const dispatchAckDigest =
    digestAgentEvaluationOptionalCapabilityFactDispatchAck(
      sourceReceipt,
      stageResponse
    );
  const sealedResponseBase = Object.freeze({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    outcome: 'observed',
    authorityRequestDigest,
    sourceAuthorityId:
      effectSourceReceipt.runtimeFactSourceAuthority.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      effectSourceReceipt.runtimeFactSourceAuthority
        .sourceAuthorityImplementationDigest,
    stageDigest,
    dispatchAckDigest,
    runtimeFactEnvelopes: Object.freeze([runtimeFactEnvelope]),
    factAuthorities: Object.freeze([factAuthority]),
  });
  const sealedResponse =
    decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
      Object.freeze({
        ...sealedResponseBase,
        resultDigest: digestAgentCanonicalValue(sealedResponseBase),
      }),
      {
        planDigest: originalReceipt.planDigest,
        repositoryCommit: originalReceipt.repositoryCommit,
        receipt: sourceReceipt,
        stage: stageResponse,
        sanitization: semanticObservationSanitization,
      }
    );
  const newAuthorityRecord =
    createAgentEvaluationOptionalCapabilityFactAuthorityArchiveRecord({
      attemptId: authorityRecord.attemptId,
      turnIndex: authorityRecord.turnIndex,
      sourceSealDigest: sourceReceipt.sourceSealDigest,
      authorityRequestDigest,
      stageDigest,
      dispatchAckDigest,
      resultDigest: sealedResponse.resultDigest,
      stageRequest,
      fact,
      runtimeFactEnvelope,
      factAuthority,
      sealedResponse,
    });
  sourceRecords[sourceIndex] = newSourceRecord;
  authorityRecords[authorityIndex] = newAuthorityRecord;
  return Object.freeze({
    ...base,
    optionalCapabilityFactSources: orderedFamilyValues(
      'optionalCapabilityFactSources',
      sourceRecords
    ),
    optionalCapabilityFactAuthorities: orderedFamilyValues(
      'optionalCapabilityFactAuthorities',
      authorityRecords
    ),
  });
};

const recommitForeignHostedRuntimeResourceRegistrationIntents = (base) => {
  const registrationIntents = Object.freeze(
    createSemanticHostedRuntimeResourceRegistrationIntents(base.plan).map(
      (intent, index) =>
        createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
          providerConfigurationId: intent.providerConfigurationId,
          providerConfigurationDigest: intent.providerConfigurationDigest,
          protocolFamily: intent.protocolFamily,
          modelId: intent.modelId,
          modelLineageDigest: intent.modelLineageDigest,
          adapterDigest: intent.adapterDigest,
          capabilityProfileId: intent.capabilityProfileId,
          capabilityProfileDigest: intent.capabilityProfileDigest,
          probeProgramDigest: intent.probeProgramDigest,
          publicResourceDescriptorDigest: digestAgentCanonicalValue({
            mutation: 'foreign-hosted-runtime-registration-intent',
            index,
            originalDescriptorDigest: intent.publicResourceDescriptorDigest,
          }),
        })
    )
  );
  const lifecycle = createSemanticHostedRuntimeResourceLifecycleFixture({
    fixtureInput: Object.freeze({
      namespaceId: 'g4-model-evaluation',
      repositoryCommit: base.plan.repositoryCommit,
      planDigest: base.plan.planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest: createSemanticRunConfigArtifactBinding(
        base.plan
      ).bindingDigest,
      runtimeResourceSetId:
        'runtime-resource-set.semantic-fixture.foreign-intents',
      registeredAt: V8_TIME.started,
      expiresAt: base.plan.expiresAt,
      registrationIntents,
    }),
    checkpoints: base.checkpoints,
    attempts: base.attempts,
  });
  return Object.freeze({
    ...base,
    hostedRetrievalRuntimeResourceCleanups: lifecycle.cleanupArchiveFamily,
  });
};

const removeCapabilityEffectProviderRuntimeJournal = (base) =>
  Object.freeze({
    ...base,
    capabilityEffectProviderRuntimeJournals: orderedFamilyValues(
      'capabilityEffectProviderRuntimeJournals',
      base.capabilityEffectProviderRuntimeJournals.slice(1)
    ),
  });

const recommitCapabilityEffectProviderRuntimeJournalSourceSwap = (base) => {
  const records = [...base.capabilityEffectProviderRuntimeJournals];
  const first = records[0];
  const second = records[1];
  if (!first || !second) {
    throw new TypeError(
      'Semantic verifier fixture capability-effect Provider runtime journal swap requires two records.'
    );
  }
  const recreate = (record, effectSourceReceiptDigest) =>
    createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
      stageRecord: record.stageRecord,
      executionRecords: record.executionRecords,
      resultRecord: record.resultRecord,
      effectSourceReceiptDigest,
    });
  records[0] = recreate(first, second.effectSourceReceiptDigest);
  records[1] = recreate(second, first.effectSourceReceiptDigest);
  return Object.freeze({
    ...base,
    capabilityEffectProviderRuntimeJournals: orderedFamilyValues(
      'capabilityEffectProviderRuntimeJournals',
      records
    ),
  });
};

const withSemanticMutation = (base, mutation) => {
  if (mutation === undefined || mutation === 'none') return base;
  if (mutation === 'swap-hosted-runtime-resource-registration-intents') {
    return recommitForeignHostedRuntimeResourceRegistrationIntents(base);
  }
  if (mutation === 'missing-capability-effect-provider-runtime-journal') {
    return removeCapabilityEffectProviderRuntimeJournal(base);
  }
  if (mutation === 'duplicate-capability-effect-provider-runtime-journal') {
    return duplicateQualificationArchiveRecord(
      base,
      'capabilityEffectProviderRuntimeJournals'
    );
  }
  if (mutation === 'swap-capability-effect-provider-runtime-journal-source') {
    return recommitCapabilityEffectProviderRuntimeJournalSourceSwap(base);
  }
  if (mutation === 'swap-runtime-source-registration-receipt') {
    return duplicateQualificationArchiveRecord(
      base,
      'runtimeFactSourceOwnerRegistrations'
    );
  }
  if (mutation === 'swap-provider-resource-cleanup-registration') {
    return duplicateQualificationArchiveRecord(
      base,
      'capabilityProbeProviderResourceCleanups'
    );
  }
  if (mutation === 'tamper-provider-resource-cleanup-owner') {
    return recommitProviderResourceCleanup(base, 'owner');
  }
  if (mutation === 'tamper-provider-resource-cleanup-result') {
    return recommitProviderResourceCleanup(base, 'result');
  }
  if (mutation === 'missing-provider-resource-cleanup') {
    return removeProviderResourceCleanup(base);
  }
  if (mutation === 'swap-optional-fact-effect-source-receipt') {
    return recommitOptionalCapabilityRawPair(base, 'source');
  }
  if (mutation === 'swap-optional-fact-authority-stage') {
    return recommitOptionalCapabilityRawPair(base, 'stage');
  }
  if (mutation === 'swap-optional-fact-authority-ack') {
    return recommitOptionalCapabilityRawPair(base, 'ack');
  }
  if (mutation === 'swap-optional-fact-runtime-envelope') {
    return recommitOptionalCapabilityRawPair(base, 'envelope');
  }
  if (mutation === 'swap-optional-fact-authority-result') {
    return recommitOptionalCapabilityRawPair(base, 'result');
  }
  if (mutation === 'swap-optional-fact-authority-binding') {
    return recommitOptionalCapabilityRawPair(base, 'fact-authority');
  }
  if (mutation === 'swap-grading-owner-projections') {
    const receipts = [...base.attemptAuthorityOwnerReceipts];
    const indexes = receipts
      .map((receipt, index) =>
        receipt.serviceKind === 'attempt-grading' ? index : -1
      )
      .filter((index) => index >= 0)
      .slice(0, 2);
    if (indexes.length !== 2) {
      throw new TypeError(
        'Semantic verifier fixture grading owners are missing.'
      );
    }
    const first = receipts[indexes[0]];
    const second = receipts[indexes[1]];
    receipts[indexes[0]] = recreateOwnerReceipt(
      first,
      second.responseProjection
    );
    receipts[indexes[1]] = recreateOwnerReceipt(
      second,
      first.responseProjection
    );
    return Object.freeze({
      ...base,
      attemptAuthorityOwnerReceipts: orderedFamilyValues(
        'attemptAuthorityOwnerReceipts',
        receipts
      ),
    });
  }
  if (mutation === 'tamper-capability-specific-result') {
    const receipts = [...base.capabilitySpecificReceipts];
    const denialIndex = receipts.findIndex(
      ({ authority }) => authority.authorityKind === 'capability-denial'
    );
    const original = receipts[denialIndex];
    if (!original) {
      throw new TypeError(
        'Semantic verifier fixture capability-specific denial is missing.'
      );
    }
    const resultDigest = digestAgentCanonicalValue({
      mutation: 'capability-specific-result',
      receiptId: original.receiptId,
    });
    const {
      format: _factFormat,
      version: _factVersion,
      factDigest: _factDigest,
      ...factInput
    } = original.authority.fact;
    const fact = createAgentEvaluationCapabilityOwnerFact({
      ...factInput,
      authorityResultDigest: resultDigest,
      decisionDigest: resultDigest,
    });
    const authority = Object.freeze({
      authorityKind: original.authority.authorityKind,
      receiptKind: original.authority.receiptKind,
      factDigest: fact.factDigest,
      semanticDigest: digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
        authorityKind: original.authority.authorityKind,
        receiptKind: original.authority.receiptKind,
        factDigest: fact.factDigest,
      }),
      fact,
    });
    const {
      format: _receiptFormat,
      version: _receiptVersion,
      receiptDigest: _receiptDigest,
      ...receiptInput
    } = original;
    receipts[denialIndex] = createAgentEvaluationCapabilitySpecificReceipt({
      ...receiptInput,
      resultDigest,
      authority,
    });
    return Object.freeze({
      ...base,
      capabilitySpecificReceipts: orderedFamilyValues(
        'capabilitySpecificReceipts',
        receipts
      ),
    });
  }
  if (mutation === 'tamper-provider-observation-adapter') {
    const receipts = [...base.providerCapabilityObservationReceipts];
    const originalIndex = receipts.findIndex(
      (receipt) =>
        receipt.factAuthorities.length > 0 &&
        receipt.factAuthorities.every(
          ({ sourceAuthorityKind }) =>
            sourceAuthorityKind === 'native-provider-transport'
        )
    );
    const original = receipts[originalIndex];
    if (originalIndex < 0 || !original) {
      throw new TypeError(
        'Semantic verifier fixture native provider observation is missing.'
      );
    }
    const {
      format: _format,
      version: _version,
      factAuthorities: _factAuthorities,
      selectedRuntimeFactEnvelopeSetDigest:
        _selectedRuntimeFactEnvelopeSetDigest,
      sourceAuthoritySetDigest: _sourceAuthoritySetDigest,
      observationDigest: _observationDigest,
      receiptDigest: _receiptDigest,
      ...input
    } = original;
    receipts[originalIndex] = createNativeProviderCapabilityObservationReceipt({
      ...input,
      adapterDigest: digestAgentCanonicalValue({
        mutation: 'provider-observation-adapter',
        observationReceiptId: original.observationReceiptId,
      }),
    });
    return Object.freeze({
      ...base,
      providerCapabilityObservationReceipts: orderedFamilyValues(
        'providerCapabilityObservationReceipts',
        receipts
      ),
    });
  }
  if (mutation === 'tamper-provider-observation-runtime-envelope') {
    const receipts = [...base.providerCapabilityObservationReceipts];
    const original = receipts[0];
    const authority = original?.factAuthorities[0];
    if (!original || !authority) {
      throw new TypeError(
        'Semantic verifier fixture provider observation authority is missing.'
      );
    }
    const {
      format: _authorityFormat,
      version: _authorityVersion,
      authorityDigest: _authorityDigest,
      ...authorityInput
    } = authority;
    const factAuthorities = [...original.factAuthorities];
    factAuthorities[0] = createAgentEvaluationProviderCapabilityFactAuthority({
      ...authorityInput,
      runtimeFactEnvelopeDigest: digestAgentCanonicalValue({
        mutation: 'provider-observation-runtime-envelope',
        observationReceiptId: original.observationReceiptId,
      }),
    });
    receipts[0] = recommitProviderObservationWithAuthorities(
      original,
      factAuthorities
    );
    return Object.freeze({
      ...base,
      providerCapabilityObservationReceipts: orderedFamilyValues(
        'providerCapabilityObservationReceipts',
        receipts
      ),
    });
  }
  if (mutation === 'swap-provider-observation-bindings') {
    const receipts = [...base.providerCapabilityObservationReceipts];
    const [firstIndex, secondIndex] = receipts
      .map((receipt, index) =>
        receipt.factAuthorities.length > 0 &&
        receipt.factAuthorities.every(
          ({ sourceAuthorityKind }) =>
            sourceAuthorityKind === 'native-provider-transport'
        )
          ? index
          : -1
      )
      .filter((index) => index >= 0);
    const first = receipts[firstIndex];
    const second = receipts[secondIndex];
    if (
      firstIndex === undefined ||
      secondIndex === undefined ||
      !first ||
      !second
    ) {
      throw new TypeError(
        'Semantic verifier fixture provider observation swap requires two native receipts.'
      );
    }
    const recreateFrom = (identity, source) => {
      const {
        format: _format,
        version: _version,
        observationReceiptId: _observationReceiptId,
        factAuthorities: _factAuthorities,
        selectedRuntimeFactEnvelopeSetDigest:
          _selectedRuntimeFactEnvelopeSetDigest,
        sourceAuthoritySetDigest: _sourceAuthoritySetDigest,
        observationDigest: _observationDigest,
        receiptDigest: _receiptDigest,
        ...input
      } = source;
      return createNativeProviderCapabilityObservationReceipt({
        ...input,
        observationReceiptId: identity.observationReceiptId,
      });
    };
    receipts[firstIndex] = recreateFrom(first, second);
    receipts[secondIndex] = recreateFrom(second, first);
    return Object.freeze({
      ...base,
      providerCapabilityObservationReceipts: orderedFamilyValues(
        'providerCapabilityObservationReceipts',
        receipts
      ),
    });
  }
  if (mutation === 'swap-capability-specific-resolved-descriptor') {
    const receipts = [...base.capabilitySpecificReceipts];
    const sourceIndex = receipts.findIndex((receipt, index) =>
      receipts.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.capabilityDescriptorDigest !==
            receipt.capabilityDescriptorDigest
      )
    );
    const source = receipts[sourceIndex];
    const replacement = receipts.find(
      (candidate) =>
        candidate.capabilityDescriptorDigest !==
        source?.capabilityDescriptorDigest
    );
    if (!source || !replacement) {
      throw new TypeError(
        'Semantic verifier fixture resolved descriptor swap requires two authorities.'
      );
    }
    const {
      format: _format,
      version: _version,
      receiptDigest: _receiptDigest,
      ...input
    } = source;
    receipts[sourceIndex] = createAgentEvaluationCapabilitySpecificReceipt({
      ...input,
      capabilityDescriptorDigest: replacement.capabilityDescriptorDigest,
    });
    return Object.freeze({
      ...base,
      capabilitySpecificReceipts: orderedFamilyValues(
        'capabilitySpecificReceipts',
        receipts
      ),
    });
  }
  throw new TypeError(`Unknown semantic fixture mutation ${mutation}.`);
};

const evidenceInputFrom = (evidence) =>
  Object.freeze({
    plan: evidence.plan,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      evidence.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      evidence.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      evidence.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
    capabilityProbeAdmissions: evidence.capabilityProbeAdmissions,
    capabilityProbeReferenceReceipts: evidence.capabilityProbeReferenceReceipts,
    runtimeFactSourceOwnerRegistrations:
      evidence.runtimeFactSourceOwnerRegistrations,
    capabilityProbeProviderResourceCleanups:
      evidence.capabilityProbeProviderResourceCleanups,
    optionalCapabilityFactSources: evidence.optionalCapabilityFactSources,
    optionalCapabilityFactAuthorities:
      evidence.optionalCapabilityFactAuthorities,
    endpointSmokeDispatchIntents: evidence.endpointSmokeDispatchIntents,
    endpointSmokeTransportReceipts: evidence.endpointSmokeTransportReceipts,
    endpointSmokeResultSpoolReceipts: evidence.endpointSmokeResultSpoolReceipts,
    endpointSmokeResultSpoolDispositionReceipts:
      evidence.endpointSmokeResultSpoolDispositionReceipts,
    endpointSmokeValidationFailureReceipts:
      evidence.endpointSmokeValidationFailureReceipts,
    endpointSmokeReceipts: evidence.endpointSmokeReceipts,
    preDispatchFailureReceipts: evidence.preDispatchFailureReceipts,
    transportDispatchIntents: evidence.transportDispatchIntents,
    transportReceipts: evidence.transportReceipts,
    providerResultSpoolReceipts: evidence.providerResultSpoolReceipts,
    providerResultSpoolDispositionReceipts:
      evidence.providerResultSpoolDispositionReceipts,
    invocationTurnReceipts: evidence.invocationTurnReceipts,
    invocationTurnSetReceipts: evidence.invocationTurnSetReceipts,
    resultSubmissionReceipts: evidence.resultSubmissionReceipts,
    attemptAuthorityOwnerReceipts: evidence.attemptAuthorityOwnerReceipts,
    verificationAttemptGrantReceipts: evidence.verificationAttemptGrantReceipts,
    controlledRuntimeReceipts: evidence.controlledRuntimeReceipts,
    capabilityExecutionReceipts: evidence.capabilityExecutionReceipts,
    capabilitySpecificReceipts: evidence.capabilitySpecificReceipts,
    providerCapabilityObservationReceipts:
      evidence.providerCapabilityObservationReceipts,
    validatedHumanReviewArtifacts: evidence.validatedHumanReviewArtifacts,
    validatedHumanMetricObservations: evidence.validatedHumanMetricObservations,
    reviewLeaseDigest:
      evidence.validatedHumanReviewArtifacts[0].reviewLeaseDigest,
    reviewRasterScanReceipts: evidence.reviewRasterScanReceipts,
    reviewCandidateRefs: evidence.reviewCandidateRefs,
    blindReviewMappingRefs: evidence.blindReviewMappingRefs,
    sourceReceipts: evidence.sourceReceipts,
    executionReceipts: evidence.executionReceipts,
    attempts: evidence.attempts,
    checkpoints: evidence.checkpoints,
    budgetLedger: evidence.budgetLedger,
    metricReport: evidence.metricReport,
    graderReport: evidence.graderReport,
    humanReviewReport: evidence.humanReviewReport,
    holdoutExecutionReceipt: evidence.holdoutExecutionReceipt,
    manifest: evidence.manifest,
  });

const archiveValuesFrom = (evidence, authorityAttestation) =>
  new Map([
    ['plan', [evidence.plan]],
    ['capabilityProbeAdmissions', evidence.capabilityProbeAdmissions],
    [
      'capabilityProbeReferenceReceipts',
      evidence.capabilityProbeReferenceReceipts,
    ],
    [
      'runtimeFactSourceOwnerRegistrations',
      evidence.runtimeFactSourceOwnerRegistrations,
    ],
    [
      'capabilityProbeProviderResourceCleanups',
      evidence.capabilityProbeProviderResourceCleanups,
    ],
    [
      'hostedRetrievalRuntimeResourceLifecycleJournals',
      evidence.hostedRetrievalRuntimeResourceLifecycleJournals,
    ],
    [
      'hostedRetrievalRuntimeResourceCleanups',
      evidence.hostedRetrievalRuntimeResourceCleanups,
    ],
    [
      'capabilityEffectProviderRuntimeJournals',
      evidence.capabilityEffectProviderRuntimeJournals,
    ],
    ['optionalCapabilityFactSources', evidence.optionalCapabilityFactSources],
    [
      'optionalCapabilityFactAuthorities',
      evidence.optionalCapabilityFactAuthorities,
    ],
    ['endpointSmokeDispatchIntents', evidence.endpointSmokeDispatchIntents],
    ['endpointSmokeTransportReceipts', evidence.endpointSmokeTransportReceipts],
    [
      'endpointSmokeResultSpoolReceipts',
      evidence.endpointSmokeResultSpoolReceipts,
    ],
    [
      'endpointSmokeResultSpoolDispositionReceipts',
      evidence.endpointSmokeResultSpoolDispositionReceipts,
    ],
    [
      'endpointSmokeValidationFailureReceipts',
      evidence.endpointSmokeValidationFailureReceipts,
    ],
    ['endpointSmokeReceipts', evidence.endpointSmokeReceipts],
    ['preDispatchFailureReceipts', evidence.preDispatchFailureReceipts],
    ['transportDispatchIntents', evidence.transportDispatchIntents],
    ['transportReceipts', evidence.transportReceipts],
    ['providerResultSpoolReceipts', evidence.providerResultSpoolReceipts],
    [
      'providerResultSpoolDispositionReceipts',
      evidence.providerResultSpoolDispositionReceipts,
    ],
    ['invocationTurnReceipts', evidence.invocationTurnReceipts],
    ['invocationTurnSetReceipts', evidence.invocationTurnSetReceipts],
    ['resultSubmissionReceipts', evidence.resultSubmissionReceipts],
    ['attemptAuthorityOwnerReceipts', evidence.attemptAuthorityOwnerReceipts],
    [
      'verificationAttemptGrantReceipts',
      evidence.verificationAttemptGrantReceipts,
    ],
    ['controlledRuntimeReceipts', evidence.controlledRuntimeReceipts],
    ['capabilityExecutionReceipts', evidence.capabilityExecutionReceipts],
    ['capabilitySpecificReceipts', evidence.capabilitySpecificReceipts],
    [
      'providerCapabilityObservationReceipts',
      evidence.providerCapabilityObservationReceipts,
    ],
    ['validatedHumanReviewArtifacts', evidence.validatedHumanReviewArtifacts],
    [
      'validatedHumanMetricObservations',
      evidence.validatedHumanMetricObservations,
    ],
    ['reviewRasterScanReceipts', evidence.reviewRasterScanReceipts],
    ['reviewCandidateRefs', evidence.reviewCandidateRefs],
    ['blindReviewMappingRefs', evidence.blindReviewMappingRefs],
    ['sourceReceipts', evidence.sourceReceipts],
    ['executionReceipts', evidence.executionReceipts],
    ['attempts', evidence.attempts],
    ['checkpoints', evidence.checkpoints],
    ['budgetLedger', [evidence.budgetLedger]],
    ['metricReport', [evidence.metricReport]],
    ['graderReport', [evidence.graderReport]],
    ['humanReviewReport', [evidence.humanReviewReport]],
    ['holdoutExecutionReceipt', [evidence.holdoutExecutionReceipt]],
    ['authorityAttestation', [authorityAttestation]],
    ['manifest', [evidence.manifest]],
  ]);

const authorityRootsFor = (evidence) =>
  createAgentModelEvaluationEvidenceArchiveAuthorityRoots({
    capabilityProbeAdmissionSetDigest: semanticFamilyDigest(
      'capabilityProbeAdmissions',
      evidence.capabilityProbeAdmissions
    ),
    capabilityProbeReferenceReceiptSetDigest: semanticFamilyDigest(
      'capabilityProbeReferenceReceipts',
      evidence.capabilityProbeReferenceReceipts
    ),
    runtimeFactSourceOwnerRegistrationSetDigest: semanticFamilyDigest(
      'runtimeFactSourceOwnerRegistrations',
      evidence.runtimeFactSourceOwnerRegistrations
    ),
    capabilityProbeProviderResourceCleanupSetDigest: semanticFamilyDigest(
      'capabilityProbeProviderResourceCleanups',
      evidence.capabilityProbeProviderResourceCleanups
    ),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      semanticFamilyDigest(
        'hostedRetrievalRuntimeResourceLifecycleJournals',
        evidence.hostedRetrievalRuntimeResourceLifecycleJournals
      ),
    hostedRetrievalRuntimeResourceCleanupSetDigest: semanticFamilyDigest(
      'hostedRetrievalRuntimeResourceCleanups',
      evidence.hostedRetrievalRuntimeResourceCleanups
    ),
    capabilityEffectProviderRuntimeJournalSetDigest: semanticFamilyDigest(
      'capabilityEffectProviderRuntimeJournals',
      evidence.capabilityEffectProviderRuntimeJournals
    ),
    optionalCapabilityFactSourceSetDigest: semanticFamilyDigest(
      'optionalCapabilityFactSources',
      evidence.optionalCapabilityFactSources
    ),
    optionalCapabilityFactAuthoritySetDigest: semanticFamilyDigest(
      'optionalCapabilityFactAuthorities',
      evidence.optionalCapabilityFactAuthorities
    ),
    endpointSmokeSetDigest: semanticFamilyDigest(
      'endpointSmokeReceipts',
      evidence.endpointSmokeReceipts
    ),
    endpointSmokeDispatchIntentSetDigest: semanticFamilyDigest(
      'endpointSmokeDispatchIntents',
      evidence.endpointSmokeDispatchIntents
    ),
    endpointSmokeTransportReceiptSetDigest: semanticFamilyDigest(
      'endpointSmokeTransportReceipts',
      evidence.endpointSmokeTransportReceipts
    ),
    endpointSmokeResultSpoolReceiptSetDigest: semanticFamilyDigest(
      'endpointSmokeResultSpoolReceipts',
      evidence.endpointSmokeResultSpoolReceipts
    ),
    endpointSmokeResultSpoolDispositionReceiptSetDigest: semanticFamilyDigest(
      'endpointSmokeResultSpoolDispositionReceipts',
      evidence.endpointSmokeResultSpoolDispositionReceipts
    ),
    endpointSmokeValidationFailureReceiptSetDigest: semanticFamilyDigest(
      'endpointSmokeValidationFailureReceipts',
      evidence.endpointSmokeValidationFailureReceipts
    ),
    preDispatchFailureReceiptSetDigest: semanticFamilyDigest(
      'preDispatchFailureReceipts',
      evidence.preDispatchFailureReceipts
    ),
    transportDispatchIntentSetDigest: semanticFamilyDigest(
      'transportDispatchIntents',
      evidence.transportDispatchIntents
    ),
    transportReceiptSetDigest: semanticFamilyDigest(
      'transportReceipts',
      evidence.transportReceipts
    ),
    providerResultSpoolReceiptSetDigest: semanticFamilyDigest(
      'providerResultSpoolReceipts',
      evidence.providerResultSpoolReceipts
    ),
    providerResultSpoolDispositionReceiptSetDigest: semanticFamilyDigest(
      'providerResultSpoolDispositionReceipts',
      evidence.providerResultSpoolDispositionReceipts
    ),
    invocationTurnReceiptSetDigest: semanticFamilyDigest(
      'invocationTurnReceipts',
      evidence.invocationTurnReceipts
    ),
    invocationTurnSetReceiptSetDigest: semanticFamilyDigest(
      'invocationTurnSetReceipts',
      evidence.invocationTurnSetReceipts
    ),
    resultSubmissionReceiptSetDigest: semanticFamilyDigest(
      'resultSubmissionReceipts',
      evidence.resultSubmissionReceipts
    ),
    attemptAuthorityOwnerReceiptSetDigest: semanticFamilyDigest(
      'attemptAuthorityOwnerReceipts',
      evidence.attemptAuthorityOwnerReceipts
    ),
    verificationAttemptGrantReceiptSetDigest: semanticFamilyDigest(
      'verificationAttemptGrantReceipts',
      evidence.verificationAttemptGrantReceipts
    ),
    controlledRuntimeReceiptSetDigest: semanticFamilyDigest(
      'controlledRuntimeReceipts',
      evidence.controlledRuntimeReceipts
    ),
    capabilityExecutionReceiptSetDigest: semanticFamilyDigest(
      'capabilityExecutionReceipts',
      evidence.capabilityExecutionReceipts
    ),
    capabilitySpecificReceiptSetDigest: semanticFamilyDigest(
      'capabilitySpecificReceipts',
      evidence.capabilitySpecificReceipts
    ),
    providerCapabilityObservationReceiptSetDigest: semanticFamilyDigest(
      'providerCapabilityObservationReceipts',
      evidence.providerCapabilityObservationReceipts
    ),
    validatedHumanReviewArtifactSetDigest: semanticFamilyDigest(
      'validatedHumanReviewArtifacts',
      evidence.validatedHumanReviewArtifacts
    ),
    validatedHumanMetricObservationSetDigest: semanticFamilyDigest(
      'validatedHumanMetricObservations',
      evidence.validatedHumanMetricObservations
    ),
    reviewLeaseDigest:
      evidence.validatedHumanReviewArtifacts[0].reviewLeaseDigest,
    reviewRasterScanReceiptSetDigest: semanticFamilyDigest(
      'reviewRasterScanReceipts',
      evidence.reviewRasterScanReceipts
    ),
    reviewCandidateRefSetDigest: semanticFamilyDigest(
      'reviewCandidateRefs',
      evidence.reviewCandidateRefs
    ),
    blindReviewMappingSetDigest: semanticFamilyDigest(
      'blindReviewMappingRefs',
      evidence.blindReviewMappingRefs
    ),
    sourceReceiptSetDigest: semanticFamilyDigest(
      'sourceReceipts',
      evidence.sourceReceipts
    ),
    executionReceiptSetDigest: semanticFamilyDigest(
      'executionReceipts',
      evidence.executionReceipts
    ),
    holdoutExecutionReceiptDigest: semanticFamilyDigest(
      'holdoutExecutionReceipt',
      [evidence.holdoutExecutionReceipt]
    ),
    secretCanarySetDigest: digestAgentCanonicalValue([
      'secret-canary-verifier-test',
    ]),
    protectedHoldoutCanarySetDigest: digestAgentCanonicalValue([
      'protected-canary-verifier-test',
    ]),
  });

const buildArchiveRecords = (valuesByFamily) => {
  const families = [];
  const shards = [];
  const shardBytes = new Map();
  let sequence = 0;
  for (const family of AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_FAMILIES) {
    const values = orderedFamilyValues(
      family,
      valuesByFamily.get(family) ?? []
    );
    const semantic =
      createAgentModelEvaluationEvidenceArchiveFamilyDigestAccumulator(family);
    const familyRecordSet =
      createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
    const records = values.map((value, recordIndex) => {
      semantic.append(value);
      const record = createAgentModelEvaluationEvidenceArchiveRecord({
        family,
        recordIndex,
        value,
      });
      familyRecordSet.append(record.recordDigest);
      return record;
    });
    const familyShards = [];
    for (
      let firstRecordIndex = 0;
      firstRecordIndex < records.length;
      firstRecordIndex += maximumRecordsPerShard
    ) {
      const chunk = records.slice(
        firstRecordIndex,
        firstRecordIndex + maximumRecordsPerShard
      );
      const bytes = Buffer.from(
        chunk
          .map((record) =>
            encodeAgentModelEvaluationEvidenceArchiveRecordLine(record)
          )
          .join(''),
        'utf8'
      );
      const recordSet =
        createAgentModelEvaluationEvidenceArchiveRecordSetDigestAccumulator();
      for (const record of chunk) recordSet.append(record.recordDigest);
      const descriptor =
        createAgentModelEvaluationEvidenceArchiveShardDescriptor({
          sequence,
          family,
          familyShardIndex: familyShards.length,
          firstRecordIndex,
          lastRecordIndex: firstRecordIndex + chunk.length - 1,
          firstOrderKey: chunk[0].orderKey,
          lastOrderKey: chunk.at(-1).orderKey,
          recordCount: chunk.length,
          byteSize: bytes.byteLength,
          bytesDigest: digestAgentCanonicalBytes(bytes),
          recordSetDigest: recordSet.finalize(),
        });
      familyShards.push(descriptor);
      shards.push(descriptor);
      shardBytes.set(descriptor.fileName, bytes);
      sequence += 1;
    }
    families.push(
      createAgentModelEvaluationEvidenceArchiveFamilySummary({
        family,
        recordCount: records.length,
        semanticDigest: semantic.finalize(),
        recordSetDigest: familyRecordSet.finalize(),
        shardCount: familyShards.length,
        firstOrderKey: records[0]?.orderKey ?? null,
        lastOrderKey: records.at(-1)?.orderKey ?? null,
      })
    );
  }
  return Object.freeze({
    families: Object.freeze(families),
    shards: Object.freeze(shards),
    shardBytes,
  });
};

const semanticEvidenceBaseCache = new Map();

const cachedSemanticEvidenceBase = (legacyCoreOnly) => {
  if (!semanticEvidenceBaseCache.has(legacyCoreOnly)) {
    semanticEvidenceBaseCache.set(
      legacyCoreOnly,
      createSemanticEvidenceBase({ legacyCoreOnly })
    );
  }
  return semanticEvidenceBaseCache.get(legacyCoreOnly);
};

export const createG4ModelEvaluationSemanticArchiveFixture = ({
  mutation = 'none',
} = {}) => {
  const legacyCoreOnly = mutation === 'legacy-13,200-production-denominator';
  const base = cachedSemanticEvidenceBase(legacyCoreOnly);
  const evidence = legacyCoreOnly ? base : withSemanticMutation(base, mutation);
  const evidenceInput = evidenceInputFrom(evidence);
  const evidenceSetDigest =
    digestAgentModelEvaluationEvidenceSet(evidenceInput);
  const authorityRoots = authorityRootsFor(evidence);
  const {
    capabilityProbeProviderResourceCleanupSetDigest:
      _capabilityProbeProviderResourceCleanupSetDigest,
    hostedRetrievalRuntimeResourceCleanupSetDigest:
      _hostedRetrievalRuntimeResourceCleanupSetDigest,
    capabilityEffectProviderRuntimeJournalSetDigest:
      _capabilityEffectProviderRuntimeJournalSetDigest,
    ...modelEvaluationAuthorityRoots
  } = authorityRoots;
  const authorityInput = Object.freeze({
    authorityId: authorityIdentity.authorityId,
    keyId: authorityIdentity.keyId,
    evidenceSetDigest,
    planDigest: evidence.plan.planDigest,
    ...modelEvaluationAuthorityRoots,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      evidence.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
    workflowName: authorityIdentity.workflowName,
    workflowRunId: authorityIdentity.workflowRunId,
    workflowRunAttempt: authorityIdentity.workflowRunAttempt,
    jobId: authorityIdentity.jobId,
    environmentDigest: authorityIdentity.environmentDigest,
    repositoryCommit: evidence.plan.repositoryCommit,
    issuedAt: SEMANTIC_FIXTURE_NOW,
  });
  const authorityPayload =
    createAgentModelEvaluationAuthorityPayload(authorityInput);
  const authorityAttestation = createAgentModelEvaluationAuthorityAttestation({
    ...authorityInput,
    signature: signSemanticPayload(authorityPayload),
  });
  const archive = buildArchiveRecords(
    archiveValuesFrom(evidence, authorityAttestation)
  );
  const runConfigArtifactBinding = createSemanticRunConfigArtifactBinding(
    evidence.plan
  );
  const index = createAgentModelEvaluationEvidenceIndex({
    exportLeaseId,
    exportLeaseDigest,
    runConfigArtifactBinding,
    sourceConfigDigest,
    frozenRunDigest,
    planDigest: evidence.plan.planDigest,
    repositoryCommit: evidence.plan.repositoryCommit,
    evidenceSetDigest,
    authorityPayloadDigest: authorityAttestation.attestedPayloadDigest,
    authorityAttestationDigest: authorityAttestation.attestationDigest,
    authorityRoots,
    reviewLeaseDigest: authorityRoots.reviewLeaseDigest,
    evaluationManifestDigest: evidence.manifest.manifestDigest,
    families: archive.families,
    shards: archive.shards,
    createdAt: SEMANTIC_FIXTURE_NOW,
  });
  const indexText = encodeAgentModelEvaluationEvidenceIndex(index);
  const indexBytes = Buffer.from(indexText, 'utf8');
  const archiveAttestationInput = Object.freeze({
    authorityId: authorityIdentity.authorityId,
    keyId: authorityIdentity.keyId,
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
    reviewLeaseDigest: index.reviewLeaseDigest,
    evaluationManifestDigest: index.evaluationManifestDigest,
    indexDigest: index.indexDigest,
    evidenceIndexArtifactDigest: digestAgentCanonicalBytes(indexBytes),
    evidenceIndexArtifactSize: indexBytes.byteLength,
    shardSetDigest: index.shardSetDigest,
    totalShardBytes: index.totalShardBytes,
    totalRecordCount: index.totalRecordCount,
    issuedAt: SEMANTIC_FIXTURE_NOW,
  });
  const archiveAttestationPayload =
    createAgentModelEvaluationEvidenceArchiveAttestationPayload(
      archiveAttestationInput
    );
  const archiveAttestation =
    createAgentModelEvaluationEvidenceArchiveAttestation({
      ...archiveAttestationInput,
      signature: signSemanticPayload(archiveAttestationPayload),
    });
  const root = createAgentModelEvaluationEvidenceRoot({
    index,
    evidenceIndexArtifactBytes: indexBytes,
    archiveAttestation,
  });
  return Object.freeze({
    mutation,
    evidence,
    evidenceInput,
    evidenceSetDigest,
    authorityRoots,
    authorityAttestation,
    index,
    indexBytes,
    root,
    rootBytes: Buffer.from(
      encodeAgentModelEvaluationEvidenceRoot(root),
      'utf8'
    ),
    shards: archive.shards,
    shardBytes: archive.shardBytes,
    publicKeyBase64Url: semanticPublicKeyBase64Url,
  });
};

let semanticFixtureWriteSequence = 0;

export const writeG4ModelEvaluationSemanticArchiveFixture = async ({
  fixture,
  rootDirectory,
}) => {
  semanticFixtureWriteSequence += 1;
  const fixturePath = join(
    rootDirectory,
    `semantic-${semanticFixtureWriteSequence.toString().padStart(3, '0')}-${fixture.mutation}`
  );
  const archivePath = join(fixturePath, 'archive');
  const shardPath = join(
    archivePath,
    AGENT_MODEL_EVALUATION_EVIDENCE_SHARD_DIRECTORY_NAME
  );
  const evidenceRootPath = join(fixturePath, 'evidence-root.json');
  await mkdir(shardPath, { recursive: true });
  await writeFile(
    join(archivePath, AGENT_MODEL_EVALUATION_EVIDENCE_INDEX_FILE_NAME),
    fixture.indexBytes
  );
  await writeFile(evidenceRootPath, fixture.rootBytes);
  await Promise.all(
    fixture.shards.map((descriptor) =>
      writeFile(
        join(shardPath, descriptor.fileName),
        fixture.shardBytes.get(descriptor.fileName)
      )
    )
  );
  return Object.freeze({
    fixturePath,
    archivePath,
    shardPath,
    evidenceRootPath,
  });
};

export const semanticArchiveVerifyOptions = (fixture, paths) => ({
  archivePath: paths.archivePath,
  evidenceRootPath: paths.evidenceRootPath,
  repositoryCommit: fixture.evidence.plan.repositoryCommit,
  now: SEMANTIC_FIXTURE_NOW,
  secretCanaries: ['secret-canary-verifier-test'],
  protectedHoldoutCanaries: ['protected-canary-verifier-test'],
  trustedPublicKeys: [
    Object.freeze({
      keyId: authorityIdentity.keyId,
      publicKeyBase64Url: fixture.publicKeyBase64Url,
    }),
  ],
  expectedAttestationIdentity: authorityIdentity,
  humanReviewVerifier: Object.freeze({
    verify: async ({ plan, artifact }) => {
      const validated = fixture.evidence.validatedHumanReviewArtifacts[0];
      if (
        plan.planDigest !== fixture.evidence.plan.planDigest ||
        artifact.artifactDigest !== validated.reviewArtifact.artifactDigest
      ) {
        return undefined;
      }
      return Object.freeze({
        publicRubrics: validated.publicRubrics,
        trustRegistry: validated.trustRegistry,
        adjudicationPolicy: validated.adjudicationPolicy,
        randomizedPresentationPolicyDigest:
          validated.reviewArtifact.randomizedPresentationPolicyDigest,
      });
    },
  }),
  resolveFrozenRunConfig: async ({ index, plan }) => {
    if (
      index.indexDigest !== fixture.index.indexDigest ||
      plan.planDigest !== fixture.evidence.plan.planDigest
    ) {
      throw new TypeError('Semantic fixture frozen config lookup drifted.');
    }
    return Object.freeze({
      configuration: fixture.evidence.frozenRunConfig,
      runConfigArtifactBinding: fixture.index.runConfigArtifactBinding,
    });
  },
});
