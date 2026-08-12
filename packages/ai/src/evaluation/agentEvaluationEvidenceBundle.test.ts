import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createV8EvaluationPlan,
  createV8HoldoutReceipt,
  createV8HumanReviewReport,
  createV8PublicReviewRubric,
  V8_TIME,
} from '../__tests__/agentV8Fixtures';
import {
  createAgentHostedRetrievalRuntimeResourceExact4Fixture,
  createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture,
} from '../__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING,
  createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture,
  joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup,
} from '../__tests__/agentHostedRetrievalRuntimeResourceLifecycleJournalFixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  matchAgentHostedRetrievalRuntimeResourceCleanupResultLifecycleJournal,
  matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosure,
  matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial,
  matchAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily,
  matchAgentHostedRetrievalRuntimeResourceRegistrationResultLifecycleJournal,
} from '../providers/agentHostedRetrievalRuntimeResource';
import { AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS } from './agentEvaluationEvidenceArchive';
import type {
  AgentModelInvocationReceipt,
  AgentPricingSnapshot,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  createAgentBudgetLedger,
  reserveAgentBudget,
  settleAgentBudget,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import {
  createAgentEvaluationExecutionReceipt,
  createAgentEvaluationPlanPricingSourceReceiptId,
  createAgentEvaluationSourceReceipt,
  createAgentModelEvaluationAuthorityAttestation,
  createAgentModelEvaluationAuthorityPayload,
  createAgentModelEvaluationEvidenceBundle,
  createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence,
  digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet,
  digestAgentEvaluationExecutionReceiptSet,
  digestAgentEvaluationCostCalculationSource,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationSourceReceiptSet,
  digestAgentModelEvaluationEvidenceSet,
  hasExactAgentEvaluationPlanPricingSourceReceiptCoverage,
  isAgentModelEvaluationAuthorityAttestation,
  isAgentModelEvaluationEvidenceBundle,
  validateAgentModelEvaluationEvidenceBundle,
  verifyAgentModelEvaluationAuthorityAttestation,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationSourceReceipt,
  type AgentModelEvaluationAuthorityTrust,
  type AgentModelEvaluationEvidenceBundle,
} from './agentEvaluationEvidenceBundle';
import {
  canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder,
  canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder,
  createAgentEvaluationEndpointSmokeDispatchIntent,
  createAgentEvaluationEndpointSmokeReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  digestAgentEvaluationEndpointSmokeDispatchIntentSet,
  digestAgentEvaluationEndpointSmokeReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet,
  digestAgentEvaluationEndpointSmokeTransportReceiptSet,
  digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolReceipt,
} from './agentEvaluationEndpointSmoke';
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
  digestAgentEvaluationControlledRuntimeReceiptSet,
  digestAgentEvaluationBlindReviewMappingRefSet,
  digestAgentEvaluationPreDispatchFailureReceiptSet,
  digestAgentEvaluationReviewRasterScanReceiptSet,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationInvocationTurnSetReceiptSet,
  digestAgentEvaluationProviderResultSpoolAad,
  digestAgentEvaluationProviderResultSpoolDispositionReceiptSet,
  digestAgentEvaluationProviderResultSpoolReceiptSet,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationResultSubmissionReceiptSet,
  digestAgentEvaluationReviewCandidateRefSet,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
} from './agentEvaluationEvidenceAuthenticity';
import type {
  AgentEvaluationInvocationTurnReceipt,
  AgentEvaluationInvocationTurnSetReceipt,
  AgentEvaluationProviderResultSpoolDispositionReceipt,
  AgentEvaluationProviderResultSpoolReceipt,
  AgentEvaluationTransportDispatchIntent,
  AgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';
import { createAgentEvaluationBlindReviewPreviewProjection } from './agentEvaluationBlindReviewProjection';
import {
  createAgentEvaluationCapabilityExecutionReceipt,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  type AgentEvaluationCapabilityExecutionReceipt,
} from './agentEvaluationCapabilityExecution';
import { digestAgentEvaluationCapabilitySpecificReceiptSet } from './agentEvaluationCapabilitySpecificReceipt';
import { digestAgentEvaluationProviderCapabilityObservationReceiptSet } from './agentEvaluationProviderCapabilityObservation';
import {
  canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  digestAgentEvaluationAttemptAuthorityOwnerReceiptSet,
  digestAgentEvaluationAttemptGrading,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';
import {
  AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
  AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
  type AgentEvaluationResultSubmissionReceipt,
} from './agentEvaluationResultContract';
import { digestAgentEvaluationReviewGraderArtifactAuthority } from './agentEvaluationEvidenceAuthenticityValidation';
import {
  AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
  createAgentEvaluationValidatedHumanReviewArtifact,
  digestAgentEvaluationValidatedHumanReviewArtifactSet,
  type AgentEvaluationHumanReviewImport,
  type AgentEvaluationHumanReviewTrustAuthority,
  type AgentEvaluationValidatedHumanReviewArtifact,
} from './agentEvaluationValidatedHumanReview';
import {
  createAgentEvaluationValidatedHumanMetricObservations,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
} from './agentEvaluationHumanMetricAuthority';
import {
  createAgentModelEvaluationBudget,
  createAgentModelEvaluationPlan,
  planAgentModelEvaluationAttempts,
  resolveAgentModelEvaluationCaseExecutionRequirement,
} from './agentEvaluationPlan';
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
} from './agentEvaluationResults';
import type {
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from './agentEvaluationVerificationAttemptGrant';

const SECRET_CANARIES = Object.freeze(['secret-canary-value-v2']);
const HOLDOUT_CANARIES = Object.freeze(['protected-holdout-body-v2']);
const PUBLIC_KEY = `${'B'.repeat(42)}A`;
const SIGNATURE = 'A'.repeat(86);
const ATTEMPT_COMPLETED = '2026-08-02T01:00:00.001Z';

const createUsage = (sourceDigest: string): AgentUsageVector =>
  createAgentUsageVector([
    Object.freeze({
      unit: 'text-token-input' as const,
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported' as const,
      sourceDigest,
    }),
    Object.freeze({
      unit: 'text-token-output' as const,
      logicalAmount: '1',
      billableAmount: '1',
      confidence: 'reported' as const,
      sourceDigest,
    }),
  ]);

const createCosts = (sourceDigest: string) =>
  normalizeAgentCosts([
    Object.freeze({
      currency: 'USD',
      amount: '0.000001',
      confidence: 'reported' as const,
      sourceDigest,
    }),
  ]);

const receiptDigest = (
  receipt: Omit<AgentModelInvocationReceipt, 'receiptDigest'>
): AgentModelInvocationReceipt =>
  Object.freeze({
    ...receipt,
    receiptDigest: digestAgentCanonicalValue(receipt),
  });

const createVerificationAttemptGrantReceipt = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    descriptor: AgentModelEvaluationAttemptDescriptor;
  }>
): AgentEvaluationVerificationAttemptGrantReceipt => {
  const verificationPlanDigest = digestAgentCanonicalValue({
    attemptId: input.descriptor.attemptId,
    verificationPlan: 'fixture',
  });
  const cellId = `cell.${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`;
  const grantDigestBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: 'workspace.g4-evaluation',
    projectId: 'project.g4-evaluation',
    workspaceRevision: 1,
    partitionRevisionsDigest: digestAgentCanonicalValue({
      attemptId: input.descriptor.attemptId,
      partitionRevisions: 'frozen',
    }),
    policyRevision: 1,
    policyDigest: input.plan.policyDigest,
    policyEvaluationInstant: V8_TIME.started,
    impactDigest: digestAgentCanonicalValue({
      attemptId: input.descriptor.attemptId,
      impact: 'verified',
    }),
    planDigest: verificationPlanDigest,
    cellId,
    checkId: 'check.g4-evaluation',
    checkKind: 'e2e',
    targetId: input.descriptor.targetId,
    attemptId: input.descriptor.attemptId,
    runId: `verification-run.${input.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
    providerId: 'provider.g4-evaluation',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'ci-attested' as const,
    retentionRequest: Object.freeze({
      successful: 'release' as const,
      failed: 'release' as const,
      protectReleaseEvidence: true,
    }),
    maximumClosureEvidenceRecords: 1_000,
    issuedBy: 'g4-evaluation.fixture',
    issuedAt: V8_TIME.started,
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
    attemptId: input.descriptor.attemptId,
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
    evaluationPlanDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
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
  const receipt = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationVerificationAttemptGrantReceipt(receipt)) {
    throw new TypeError('Verification AttemptGrant fixture is invalid.');
  }
  return receipt;
};

const createPricingSnapshot = (
  providerConfigurationId: string
): AgentPricingSnapshot => {
  const base = Object.freeze({
    pricingSnapshotId: `pricing.${providerConfigurationId}.v2`,
    providerConfigurationId,
    effectiveAt: V8_TIME.planned,
    rates: Object.freeze([
      Object.freeze({
        unit: 'text-token-input' as const,
        currency: 'USD',
        unitPrice: '0.0000005',
      }),
      Object.freeze({
        unit: 'text-token-output' as const,
        currency: 'USD',
        unitPrice: '0.0000005',
      }),
    ]),
    sourceDigest: digestAgentCanonicalValue({
      providerConfigurationId,
      source: 'published-pricing',
    }),
  });
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

const settledLedger = (
  budget: Parameters<typeof createAgentBudgetLedger>[0],
  reservationDemand: AgentBudgetDemand,
  actual: AgentBudgetDemand
): AgentBudgetLedgerState => {
  const reserved = reserveAgentBudget(createAgentBudgetLedger(budget), {
    reservationId: 'evaluation-evidence-v3',
    expectedRevision: 0,
    demand: reservationDemand,
    reservedAt: V8_TIME.started,
  });
  if (!reserved.ok) throw new Error('Fixture budget reservation failed.');
  const settled = settleAgentBudget(reserved.state, {
    reservationId: 'evaluation-evidence-v3',
    expectedRevision: reserved.state.revision,
    actual,
    settledAt: V8_TIME.evaluated,
  });
  if (!settled.ok) throw new Error('Fixture budget settlement failed.');
  return settled.state;
};

const createEvidencePlan = () => {
  const fixturePlan = createV8EvaluationPlan();
  const {
    plannedJourneyCount: _plannedJourneyCount,
    plannedAttemptSetDigest: _plannedAttemptSetDigest,
    planDigest: _planDigest,
    budget,
    ...planInput
  } = fixturePlan;
  const { budgetDigest: _budgetDigest, ...budgetInput } = budget;
  return createAgentModelEvaluationPlan({
    ...planInput,
    budget: createAgentModelEvaluationBudget({
      ...budgetInput,
      budget: Object.freeze({
        ...budgetInput.budget,
        maxRepairRounds: 1_000_000,
      }),
    }),
  });
};

const createValidatedHumanReviewArtifactFixture = (
  plan: ReturnType<typeof createEvidencePlan>,
  humanReviewReport: ReturnType<typeof createV8HumanReviewReport>
): AgentEvaluationValidatedHumanReviewArtifact => {
  const independencePolicyDigest = digestAgentCanonicalValue(
    'human-review-independence.evidence-v3'
  );
  const reviewerPseudonyms = Object.freeze(
    [
      ...new Set(
        humanReviewReport.ratings.map(
          ({ reviewerPseudonym }) => reviewerPseudonym
        )
      ),
    ].sort(compareUnicodeCodePoints)
  );
  const createAuthority = (
    authorityId: string,
    pseudonym: string,
    role: AgentEvaluationHumanReviewTrustAuthority['role']
  ): AgentEvaluationHumanReviewTrustAuthority => {
    const base = Object.freeze({
      authorityId,
      pseudonym,
      role,
      keyId: `key.${pseudonym}`,
      publicKeyBase64Url: PUBLIC_KEY,
      validFrom: V8_TIME.planned,
      validUntil: V8_TIME.expires,
      independencePolicyDigest,
    });
    return Object.freeze({
      ...base,
      authorityDigest: digestAgentCanonicalValue(base),
    });
  };
  const authorities = Object.freeze(
    [
      createAuthority(
        'authority.human-review.adjudicator',
        'adjudicator-evidence-v3',
        'adjudicator'
      ),
      ...reviewerPseudonyms.map((pseudonym) =>
        createAuthority(
          `authority.human-review.${pseudonym}`,
          pseudonym,
          'reviewer'
        )
      ),
    ].sort((left, right) =>
      compareUnicodeCodePoints(left.authorityId, right.authorityId)
    )
  );
  const authoritySetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-authority-set',
    version: 1,
    authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
  });
  const trustRegistryBase = Object.freeze({
    format: 'prodivix.g4-human-review-trust-registry' as const,
    version: 1 as const,
    registryId: 'human-review.registry.evidence-v3',
    authorities,
    authoritySetDigest,
  });
  const trustRegistry = Object.freeze({
    ...trustRegistryBase,
    registryDigest: digestAgentCanonicalValue(trustRegistryBase),
  });
  const adjudicator = authorities.find(({ role }) => role === 'adjudicator')!;
  const reviewerAuthorityIds = Object.freeze(
    authorities
      .filter(({ role }) => role === 'reviewer')
      .map(({ authorityId }) => authorityId)
      .sort(compareUnicodeCodePoints)
  );
  const adjudicationPolicyBase = Object.freeze({
    minimumIndependentRatings: plan.graderPlan.minimumIndependentVisualRatings,
    reviewerAuthorityIds,
    adjudicationAuthorityId: adjudicator.authorityId,
    adjudicatorKeyId: adjudicator.keyId,
    trigger: 'reviewer-disagreement' as const,
    trustRegistryDigest: trustRegistry.registryDigest,
    independencePolicyDigest,
    consensusRule: 'unanimous' as const,
    disagreementRule: 'escalate-to-independent-adjudicator' as const,
    reviewerRatingSignaturesRequired: true as const,
    adjudicatorDecisionSignatureRequired: true as const,
    signatureAlgorithm: 'Ed25519' as const,
    decisionPayloadFields:
      AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  });
  const adjudicationPolicy = Object.freeze({
    ...adjudicationPolicyBase,
    policyDigest: digestAgentCanonicalValue(adjudicationPolicyBase),
  });
  const authoritiesByPseudonym = new Map(
    authorities.map((authority) => [authority.pseudonym, authority])
  );
  const signedRatings = Object.freeze(
    humanReviewReport.ratings.map((rating) => {
      const authority = authoritiesByPseudonym.get(rating.reviewerPseudonym)!;
      const payload = Object.freeze({
        format: 'prodivix.g4-human-review-signed-rating' as const,
        version: 1 as const,
        ratingId: rating.ratingId,
        randomizedPresentationId: rating.randomizedPresentationId,
        rubricDigest: rating.rubricDigest,
        blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
        reviewerAuthorityId: authority.authorityId,
        reviewerPseudonym: rating.reviewerPseudonym,
        keyId: authority.keyId,
        criterionVerdicts: rating.criterionVerdicts,
        verdict: rating.verdict,
        ratedAt: V8_TIME.completed,
      });
      return Object.freeze({
        ...payload,
        ratingDigest: digestAgentCanonicalValue(payload),
        signatureBase64Url: SIGNATURE,
      });
    })
  );
  const independenceAttestations = Object.freeze(
    authorities
      .filter(({ role }) => role === 'reviewer')
      .map((authority) => {
        const payload = Object.freeze({
          format: 'prodivix.g4-human-review-independence-attestation' as const,
          version: 1 as const,
          attestationId: `independence.${authority.pseudonym}`,
          planDigest: plan.planDigest,
          blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
          authorityId: authority.authorityId,
          authorityPseudonym: authority.pseudonym,
          role: 'reviewer' as const,
          keyId: authority.keyId,
          independencePolicyDigest,
          testedModelFamilyOwnerSetDigest: digestAgentCanonicalValue(
            plan.modelConfigurations
              .map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
              .sort(compareUnicodeCodePoints)
          ),
          conflictModelFamilyOwnerSetDigest: digestAgentCanonicalValue([]),
          issuedAt: V8_TIME.completed,
          expiresAt: V8_TIME.expires,
        });
        return Object.freeze({
          ...payload,
          attestationDigest: digestAgentCanonicalValue(payload),
          signatureBase64Url: SIGNATURE,
        });
      })
  );
  const sourceProvenance = Object.freeze({
    sourceRunId: '30761547895',
    sourceRunAttempt: 1,
    sourceArtifactName: 'g4-blind-review',
    sourceArtifactDigest: `sha256:${'b'.repeat(64)}`,
  });
  const ratingsByPresentation = new Map<
    string,
    (typeof signedRatings)[number][]
  >();
  for (const rating of signedRatings) {
    const grouped =
      ratingsByPresentation.get(rating.randomizedPresentationId) ?? [];
    grouped.push(rating);
    ratingsByPresentation.set(rating.randomizedPresentationId, grouped);
  }
  const candidateAdjudications = Object.freeze(
    [...ratingsByPresentation.entries()]
      .map(([randomizedPresentationId, ratings]) =>
        Object.freeze({
          randomizedPresentationId,
          candidateDigest: digestAgentCanonicalValue({
            randomizedPresentationId,
            authority: 'validated-human-review',
          }),
          rubricDigest: ratings[0]!.rubricDigest,
          ratingDigests: Object.freeze(
            ratings
              .map(({ ratingDigest }) => ratingDigest)
              .sort(compareUnicodeCodePoints)
          ),
          reviewerAuthorityIds: Object.freeze(
            ratings
              .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
              .sort(compareUnicodeCodePoints)
          ),
          criterionVerdicts: ratings[0]!.criterionVerdicts,
          verdict: 'passed' as const,
        })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.randomizedPresentationId,
          right.randomizedPresentationId
        )
      )
  );
  const reviewLeaseDigest = digestAgentCanonicalValue({
    planDigest: plan.planDigest,
    authority: 'human-review-lease',
  });
  const validationReceiptBase = Object.freeze({
    format: 'prodivix.g4-human-review-validation-receipt' as const,
    version: 1 as const,
    receiptId: 'human-review-validation:evidence-v3',
    submissionId: 'human-review-submission:evidence-v3',
    submissionDigest: digestAgentCanonicalValue('human-review-submission'),
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest: digestAgentCanonicalValue('blind-bundle.evidence-v3'),
    reviewLeaseDigest,
    blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    trustRegistryDigest: trustRegistry.registryDigest,
    authoritySetDigest: trustRegistry.authoritySetDigest,
    adjudicationPolicyDigest: adjudicationPolicy.policyDigest,
    ratingSignatureSetDigest: digestAgentCanonicalValue(
      signedRatings.map(({ ratingDigest, signatureBase64Url }) => ({
        ratingDigest,
        signatureBase64Url,
      }))
    ),
    independenceAttestationSetDigest: digestAgentCanonicalValue(
      independenceAttestations.map(
        ({ attestationDigest, signatureBase64Url }) => ({
          attestationDigest,
          signatureBase64Url,
        })
      )
    ),
    adjudicationDecisionSetDigest: digestAgentCanonicalValue([]),
    candidateAdjudications,
    candidateAdjudicationSetDigest: digestAgentCanonicalValue(
      candidateAdjudications
    ),
    adjudicationDigest: humanReviewReport.adjudicationDigest,
    validatedAt: '2026-08-02T02:30:00.000Z',
  });
  const validationReceipt = Object.freeze({
    ...validationReceiptBase,
    receiptDigest: digestAgentCanonicalValue(validationReceiptBase),
  });
  const reviewPayload = Object.freeze({
    format: AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
    version: 1 as const,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest: validationReceipt.blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest: humanReviewReport.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    signedRatings,
    independenceAttestations,
    adjudicationDecisions: Object.freeze([]),
    validationReceipt,
    reviewedAt: '2026-08-02T02:15:00.000Z',
  });
  const artifactAuthority = Object.freeze({
    authorityId: adjudicator.authorityId,
    keyId: adjudicator.keyId,
    workflowName: 'g4-real-model-human-review' as const,
    workflowRunId: '30761547896',
    workflowRunAttempt: 1,
    signedAt: validationReceipt.validatedAt,
    payloadDigest: digestAgentCanonicalValue(reviewPayload),
    signatureBase64Url: SIGNATURE,
  });
  const reviewArtifact: AgentEvaluationHumanReviewImport = Object.freeze({
    ...reviewPayload,
    artifactAuthority,
    artifactDigest: digestAgentCanonicalValue({
      ...reviewPayload,
      artifactAuthority,
    }),
  });
  return createAgentEvaluationValidatedHumanReviewArtifact({
    reviewArtifact,
    humanReviewReport,
    publicRubrics: Object.freeze([createV8PublicReviewRubric()]),
    trustRegistry,
    adjudicationPolicy,
  });
};

const createFixture = (): Readonly<{
  bundle: AgentModelEvaluationEvidenceBundle;
  trust: AgentModelEvaluationAuthorityTrust;
}> => {
  const plan = createEvidencePlan();
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const cases = new Map(
    plan.concreteCases.map((value) => [value.caseId, value])
  );
  const targets = new Map(
    plan.capabilityQualificationTargets.map((value) => [value.targetId, value])
  );
  const providers = new Map(
    plan.providerConfigurations.map((value) => [
      value.providerConfigurationId,
      value,
    ])
  );
  const models = new Map(
    plan.modelConfigurations.map((value) => [value.lineageDigest, value])
  );
  const contexts = new Map(
    plan.contextTiers.map((value) => [
      `${value.caseId}\u0000${value.tier}`,
      value,
    ])
  );
  const media = new Map(
    plan.mediaRepresentationTiers.map((value) => [
      `${value.caseId}\u0000${value.tier}`,
      value,
    ])
  );
  const observation = createAgentEvaluationMetricObservation({
    metricId: 'authority.correctness',
    graderId: 'grader.strict-authority.v8',
    graderKind: 'deterministic-rule',
    authority: 'deterministic',
    verdict: 'passed',
  });
  const pricingSnapshots = new Map<string, AgentPricingSnapshot>();
  const sourceReceipts: AgentEvaluationSourceReceipt[] = [];
  for (const target of plan.endpointSmokeTargets) {
    const pricingSnapshot = createPricingSnapshot(
      target.providerConfigurationId
    );
    pricingSnapshots.set(target.providerConfigurationId, pricingSnapshot);
    sourceReceipts.push(
      createAgentEvaluationSourceReceipt({
        sourceReceiptId: createAgentEvaluationPlanPricingSourceReceiptId({
          planDigest: plan.planDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          pricingAuthorityDigest: target.pricingAuthorityDigest,
          pricingSnapshotDigest: pricingSnapshot.snapshotDigest,
        }),
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        sourceKind: 'pricing-snapshot',
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        sourceUri: `https://pricing.invalid/${target.providerConfigurationId}`,
        sourceContentDigest: pricingSnapshot.snapshotDigest,
        pricingSnapshot,
        observedAt: V8_TIME.completed,
      })
    );
  }

  const reservationSourceDigest = digestAgentCanonicalValue({
    planDigest: plan.planDigest,
    authority: 'evaluation-evidence-v3-reservation',
  });
  const reservationDemand: AgentBudgetDemand = Object.freeze({
    usage: createAgentUsageVector(
      plan.budget.budget.usageLimits.map(({ unit, maximum }) =>
        Object.freeze({
          unit,
          logicalAmount: maximum,
          billableAmount: maximum,
          confidence: 'estimated' as const,
          sourceDigest: reservationSourceDigest,
        })
      )
    ),
    cost: normalizeAgentCosts(
      plan.budget.budget.costLimits.map(({ currency, maximum }) =>
        Object.freeze({
          currency,
          amount: maximum,
          confidence: 'estimated' as const,
          sourceDigest: reservationSourceDigest,
        })
      )
    ),
    modelInvocations: plan.budget.budget.maxModelInvocations,
    toolCalls: plan.budget.budget.maxToolCalls,
    repairRounds: plan.budget.budget.maxRepairRounds,
    transactions: plan.budget.budget.maxTransactions,
    artifactBytes: plan.budget.budget.maxArtifactBytes,
    elapsedMs: plan.budget.budget.maxElapsedMs,
  });
  const reservationDemandDigest = digestAgentCanonicalValue(reservationDemand);
  const spoolNamespaceDigest = digestAgentCanonicalValue(
    'g4-real-model-evaluation'
  );
  const spoolKeyRefDigest = digestAgentCanonicalValue({
    keyId: 'key.g4-model-eval.result-spool.v1',
    keyVersion: 1,
    environmentName: 'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64',
    secretRef: 'secret.g4-model-eval.result-spool.aes256gcm.v1',
  });
  const spoolEncryptionProfileDigest = digestAgentCanonicalValue({
    algorithm: 'aes-256-gcm',
    maximumCiphertextBytes: 16_777_216,
  });
  const spoolRetentionPolicyDigest = digestAgentCanonicalValue({
    retentionClass: 'attempt-resume-only',
    maximumRetentionHours: 24,
  });

  const materialized = descriptors.map((descriptor) => {
    const concreteCase = cases.get(descriptor.caseId)!;
    const target = targets.get(descriptor.targetId)!;
    const provider = providers.get(target.providerConfigurationId)!;
    const model = models.get(target.modelLineageDigest)!;
    const contextPackDigest = descriptor.contextTier
      ? contexts.get(`${descriptor.caseId}\u0000${descriptor.contextTier}`)!
          .contextPackDigest
      : digestAgentCanonicalValue({
          contextBuilderDigest: plan.contextBuilderDigest,
          caseDefinitionDigest: concreteCase.caseDefinitionDigest,
        });
    const mediaRepresentationManifestDigest = descriptor.mediaRepresentationTier
      ? media.get(
          `${descriptor.caseId}\u0000${descriptor.mediaRepresentationTier}`
        )!.representationManifestDigest
      : undefined;
    const requestDigest = digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      direction: 'request',
    });
    const responseDigest = digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      direction: 'response',
    });
    const suffix = descriptor.samplingIdentityDigest.slice('sha256-'.length);
    const providerRequestId = `provider-request.${suffix}`;
    const providerUsageContentDigest = digestAgentCanonicalValue({
      providerConfigurationId: provider.providerConfigurationId,
      providerRequestId,
      responseHeader: 'reported-usage',
    });
    const usage = createUsage(providerUsageContentDigest);
    const pricingSnapshot = pricingSnapshots.get(
      provider.providerConfigurationId
    )!;
    const outputCostDigest = digestAgentEvaluationCostValues(
      normalizeAgentCosts([
        Object.freeze({
          currency: 'USD',
          amount: '0.000001',
          confidence: 'reported' as const,
        }),
      ])
    );
    const calculatedCostContentDigest =
      digestAgentEvaluationCostCalculationSource({
        providerConfigurationId: provider.providerConfigurationId,
        modelLineageDigest: model.lineageDigest,
        providerRequestId,
        pricingSnapshotDigest: pricingSnapshot.snapshotDigest,
        inputUsageDigest: usage.vectorDigest,
        outputCostDigest,
      });
    const cost = createCosts(calculatedCostContentDigest);
    const usageSourceReceipt = createAgentEvaluationSourceReceipt({
      sourceReceiptId: `source.usage.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      sourceKind: 'provider-reported-usage',
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: model.lineageDigest,
      providerRequestId,
      sourceContentDigest: providerUsageContentDigest,
      inputUsageDigest: usage.vectorDigest,
      observedAt: V8_TIME.completed,
    });
    const costSourceReceipt = createAgentEvaluationSourceReceipt({
      sourceReceiptId: `source.cost.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      sourceKind: 'cost-calculation',
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: model.lineageDigest,
      providerRequestId,
      sourceContentDigest: calculatedCostContentDigest,
      pricingSnapshot,
      inputUsageDigest: usage.vectorDigest,
      outputCostDigest,
      observedAt: V8_TIME.completed,
    });
    sourceReceipts.push(usageSourceReceipt, costSourceReceipt);
    const independentRunId = `run.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`;
    const invocationReceipt = receiptDigest({
      invocationId: `invocation.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
      taskId: plan.evaluationPlanId,
      runId: independentRunId,
      generation: 0,
      attempt: descriptor.repetitionIndex,
      provider,
      model,
      capabilityQualificationDigest: target.qualificationSliceDigest,
      inferenceConfigurationDigest: target.inferenceConfigurationDigest,
      contextPackDigest,
      ...(mediaRepresentationManifestDigest
        ? {
            multimodalContextManifestDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              type: 'multimodal-context',
            }),
            providerMediaBlockManifestDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              type: 'provider-media-block',
            }),
          }
        : {}),
      requestDigest,
      responseDigest,
      outcome: 'completed',
      usage,
      costStatus: 'priced',
      cost,
      pricingSnapshotRef: pricingSnapshot.pricingSnapshotId,
      startedAt: V8_TIME.started,
      completedAt: ATTEMPT_COMPLETED,
    });
    const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
      sequence: 1,
      requestDigest,
      status: 'completed',
      retryable: false,
      invocationReceiptDigest: invocationReceipt.receiptDigest,
      responseDigest,
      startedAt: V8_TIME.started,
      completedAt: ATTEMPT_COMPLETED,
    });
    const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
      policyDigest: digestAgentCanonicalValue({
        planDigest: plan.planDigest,
        retryPolicy: 'single-attempt-evidence-v3',
      }),
      maximumAttempts: 1,
      attempts: Object.freeze([transportAttempt]),
      exhausted: false,
    });
    const requestBodyDigest = digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      body: 'provider-request',
    });
    const endpointClass =
      target.protocolFamily === 'openai-compatible'
        ? ('local' as const)
        : ('first-party-hosted' as const);
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
      invocationId: invocationReceipt.invocationId,
      budgetReservationId: 'evaluation-evidence-v3',
      demandDigest: reservationDemandDigest,
      requestDigest,
      endpointId: `endpoint.${provider.providerConfigurationId}`,
      endpointClass,
      requestBodyDigest,
      requestBytes: 1,
      createdAt: V8_TIME.started,
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
      invocationId: invocationReceipt.invocationId,
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
      startedAt: V8_TIME.started,
      completedAt: ATTEMPT_COMPLETED,
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
      invocationId: invocationReceipt.invocationId,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      transportReceiptDigest: transportReceipt.receiptDigest,
      responseBodyDigest,
      normalizedEventSetDigest,
    });
    const spoolEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
      spoolId: createAgentEvaluationProviderResultSpoolId(spoolAad),
      algorithm: 'aes-256-gcm',
      keyId: 'key.g4-model-eval.result-spool.v1',
      keyVersion: 1,
      keyRefDigest: spoolKeyRefDigest,
      encryptionProfileDigest: spoolEncryptionProfileDigest,
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
        retentionPolicyDigest: spoolRetentionPolicyDigest,
        createdAt: ATTEMPT_COMPLETED,
        expiresAt: V8_TIME.expires,
      });
    const providerResultSpoolDispositionReceipt =
      createAgentEvaluationProviderResultSpoolDispositionReceipt({
        spoolRef: providerResultSpoolReceipt.spoolRef,
        spoolReceiptDigest: providerResultSpoolReceipt.receiptDigest,
        planDigest: providerResultSpoolReceipt.planDigest,
        repositoryCommit: providerResultSpoolReceipt.repositoryCommit,
        attemptId: providerResultSpoolReceipt.attemptId,
        descriptorDigest: providerResultSpoolReceipt.descriptorDigest,
        turnIndex: providerResultSpoolReceipt.turnIndex,
        invocationId: providerResultSpoolReceipt.invocationId,
        disposition: 'consumed-and-destroyed',
        retentionPolicyDigest: providerResultSpoolReceipt.retentionPolicyDigest,
        disposedAt: V8_TIME.evaluated,
      });
    const executionRequirement =
      resolveAgentModelEvaluationCaseExecutionRequirement(concreteCase, target);
    const expectsTool = executionRequirement.minimumToolCalls > 0;
    const expectsRepair = executionRequirement.minimumRepairRounds > 0;
    const subjective = concreteCase.subjectiveVisualQuality;
    const expectsTransaction =
      executionRequirement.minimumTransactions > 0 || subjective;
    const artifactBytes =
      mediaRepresentationManifestDigest || subjective ? 1 : 0;
    const toolReceiptSetDigest = expectsTool
      ? digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          toolReceipts: 1,
        })
      : undefined;
    const transactionReceiptSetDigest = expectsTransaction
      ? digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          transactions: 1,
        })
      : undefined;
    const verificationClosureDigest = digestAgentCanonicalValue({
      attemptId: descriptor.attemptId,
      closure: 'satisfied',
    });
    const capabilitySpecificReceiptDigests = Object.freeze(
      concreteCase.capabilityDescriptor.expectedReceiptKinds.map(
        (receiptKind) =>
          Object.freeze({
            receiptKind,
            receiptDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              receiptKind,
              ownerAuthority: 'controlled-runtime',
            }),
          })
      )
    );
    const verificationAttemptGrantReceipt =
      createVerificationAttemptGrantReceipt({ plan, descriptor });
    const verificationAttemptGrantReceiptSetDigest =
      digestAgentEvaluationVerificationAttemptGrantReceiptSet([
        verificationAttemptGrantReceipt,
      ]);
    const materialDigest = digestAgentCanonicalValue({
      caseId: concreteCase.caseId,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
    });
    const capabilityOutcome =
      concreteCase.capabilityDescriptor.supportExpectation ===
      'expected-blocked'
        ? 'unsupported'
        : 'supported';
    const attemptAuthorityOwnerReceipt =
      createAgentEvaluationAttemptAuthorityOwnerReceipt({
        serviceKind: 'capability-runtime',
        operation: 'assess-capability',
        namespaceId: 'evaluation.namespace.evidence-bundle',
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        shardLeaseOwnerId: 'evaluation.runner.evidence-bundle',
        shardLeaseGeneration: 1,
        verificationGrantGeneration: verificationAttemptGrantReceipt.generation,
        verificationAttemptGrantReceiptSetDigest,
        requestDigest: digestAgentCanonicalValue({
          operation: 'assess-capability',
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
        }),
        responseProjection:
          createAgentEvaluationAttemptAuthorityResponseProjection(
            'capability-runtime',
            'assess-capability',
            {
              outcome: capabilityOutcome,
              specificReceipts: capabilitySpecificReceiptDigests,
            },
            {
              bindingKind: 'assess-capability',
              terminalTurnIndex: 0,
              terminalInvocationId: invocationReceipt.invocationId,
              materialDigest,
              capabilityDescriptorDigest:
                concreteCase.capabilityDescriptorDigest,
            }
          ),
        ownerImplementationDigest: digestAgentCanonicalValue(
          'evaluation-capability-owner.evidence-bundle.v1'
        ),
        completedAt: ATTEMPT_COMPLETED,
      });
    const capabilityExecutionReceipt: AgentEvaluationCapabilityExecutionReceipt =
      createAgentEvaluationCapabilityExecutionReceipt({
        capabilityExecutionReceiptId: `capability-execution.${suffix}`,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId: invocationReceipt.invocationId,
        caseId: concreteCase.caseId,
        caseDigest: concreteCase.caseDigest,
        targetId: descriptor.targetId,
        targetDigest: descriptor.targetDigest,
        capabilityProfileId: concreteCase.capabilityProfileId,
        capabilityId: concreteCase.capabilityDescriptor.capabilityId,
        supportExpectation:
          concreteCase.capabilityDescriptor.supportExpectation,
        expectedToolIds: concreteCase.capabilityDescriptor.expectedToolIds,
        expectedReceiptKinds:
          concreteCase.capabilityDescriptor.expectedReceiptKinds,
        capabilityDescriptorDigest: concreteCase.capabilityDescriptorDigest,
        toolBindings:
          concreteCase.capabilityDescriptor.supportExpectation ===
          'expected-blocked'
            ? Object.freeze([])
            : Object.freeze(
                concreteCase.capabilityDescriptor.expectedToolIds.map(
                  (toolId) =>
                    Object.freeze({
                      toolId,
                      definitionDigest: digestAgentCanonicalValue({
                        toolId,
                        toolRegistryDigest: plan.toolRegistryDigest,
                      }),
                    })
                )
              ),
        outcome: capabilityOutcome,
        verdict: 'passed',
        specificReceiptDigests: capabilitySpecificReceiptDigests,
        attemptAuthorityOwnerReceiptDigests: Object.freeze([
          attemptAuthorityOwnerReceipt.receiptDigest,
        ]),
        policyDigest: plan.policyDigest,
        toolRegistryDigest: plan.toolRegistryDigest,
        observedAt: ATTEMPT_COMPLETED,
      });
    const capabilityExecutionReceiptSetDigest =
      digestAgentEvaluationCapabilityExecutionReceiptSet([
        capabilityExecutionReceipt,
      ]);
    const executionReceipt = createAgentEvaluationExecutionReceipt({
      executionReceiptId: `execution.${suffix}`,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      modelInvocations: 1,
      toolCalls: executionRequirement.minimumToolCalls,
      repairRounds: executionRequirement.minimumRepairRounds,
      transactions: expectsTransaction
        ? Math.max(1, executionRequirement.minimumTransactions)
        : 0,
      artifactBytes,
      elapsedMs: Date.parse(ATTEMPT_COMPLETED) - Date.parse(V8_TIME.started),
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest,
      ...(toolReceiptSetDigest ? { toolReceiptSetDigest } : {}),
      ...(transactionReceiptSetDigest ? { transactionReceiptSetDigest } : {}),
      verificationClosureDigest,
    });
    const submissionBase = Object.freeze({
      format: 'prodivix.agent-evaluation-result-submission-receipt' as const,
      version: 1 as const,
      attemptId: descriptor.attemptId,
      invocationId: invocationReceipt.invocationId,
      descriptorDigest: descriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      toolId: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_ID,
      nativeToolName: AGENT_EVALUATION_RESULT_SUBMIT_NATIVE_TOOL_NAME,
      toolVersion: AGENT_EVALUATION_RESULT_SUBMIT_TOOL_VERSION,
      schemaDigest: digestAgentCanonicalValue('result-schema.evidence-v3'),
      inputSchemaDigest: digestAgentCanonicalValue({
        caseId: concreteCase.caseId,
        schema: 'case-result-input',
      }),
      toolDefinitionDigest: digestAgentCanonicalValue(
        'result-submit-tool-definition.evidence-v3'
      ),
      providerToolCallId: `tool-call.${suffix}`,
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
      terminalEventDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        event: 'provider-completed',
      }),
      submissionDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        submission: 'validated',
      }),
    });
    const resultSubmissionReceipt: AgentEvaluationResultSubmissionReceipt =
      Object.freeze({
        ...submissionBase,
        receiptDigest: digestAgentCanonicalValue(submissionBase),
      });
    const controlledRenderPolicyDigest = digestAgentCanonicalValue(
      'controlled-render-policy.evidence-v3'
    );
    const controlledPreview = subjective
      ? Object.freeze({
          artifactRef: `preview.${suffix}`,
          artifactDigest: digestAgentCanonicalValue({
            attemptId: descriptor.attemptId,
            preview: 'raster',
          }),
          mediaType: 'image/png' as const,
          width: 1,
          height: 1,
          byteLength: 1,
          renderPolicyDigest: controlledRenderPolicyDigest,
        })
      : undefined;
    const operationSealReceiptDigests = Object.freeze(
      expectsTool
        ? [
            digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              operationSeal: 'sealed',
            }),
          ]
        : []
    );
    const ownerAuthorityReceiptDigests = Object.freeze(
      capabilitySpecificReceiptDigests
        .map(({ receiptDigest }) => receiptDigest)
        .sort(compareUnicodeCodePoints)
    );
    const verificationAttemptGrantReceiptDigest =
      verificationAttemptGrantReceipt.receiptDigest;
    const runtimeOwnerAuthorityReceiptDigests = Object.freeze(
      [
        ...ownerAuthorityReceiptDigests,
        verificationAttemptGrantReceiptDigest,
      ].sort(compareUnicodeCodePoints)
    );
    const runtimeBase = Object.freeze({
      format: 'prodivix.agent-evaluation-controlled-runtime-receipt' as const,
      version: 1 as const,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      caseId: concreteCase.caseId,
      caseDigest: concreteCase.caseDigest,
      materialDigest,
      submissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
      runtimeAuthorityId: 'runtime.g4-evaluation-evidence-v3',
      runtimeImplementationDigest: digestAgentCanonicalValue(
        'controlled-runtime.evidence-v3'
      ),
      artifactResolutionPolicyDigest: digestAgentCanonicalValue(
        'artifact-resolution.evidence-v3'
      ),
      proposalValidationPolicyDigest: digestAgentCanonicalValue(
        'proposal-validation.evidence-v3'
      ),
      isolationPolicyDigest: digestAgentCanonicalValue(
        'runtime-isolation.evidence-v3'
      ),
      g3VerificationPolicyDigest: digestAgentCanonicalValue(
        'g3-verification.evidence-v3'
      ),
      controlledRenderPolicyDigest,
      loopPolicyDigest: digestAgentCanonicalValue('loop-policy.evidence-v3'),
      maximumTurnsPerAttempt: 2,
      maximumToolCallsPerAttempt: 1,
      maximumRepairRoundsPerAttempt: 1,
      maximumAggregateArtifactBytes: 8_388_608,
      grantDigest: digestAgentCanonicalValue({
        attemptId: descriptor.attemptId,
        grant: 'controlled-runtime',
      }),
      grantGeneration: 1,
      verificationAttemptGrantReceiptDigests: Object.freeze([
        verificationAttemptGrantReceiptDigest,
      ]),
      verificationAttemptGrantReceiptSetDigest:
        digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet([
          verificationAttemptGrantReceiptDigest,
        ])!,
      toolRegistryDigest: plan.toolRegistryDigest,
      actionRegistryDigest: digestAgentCanonicalValue(
        'action-registry.evidence-v3'
      ),
      operationSealReceiptDigests,
      ownerAuthorityReceiptDigests: runtimeOwnerAuthorityReceiptDigests,
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
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      ...(expectsTool
        ? {
            toolExecutionReceiptSetDigest: toolReceiptSetDigest!,
            operationIntentSetDigest: digestAgentCanonicalValue({
              attemptId: descriptor.attemptId,
              operationIntents: 'sealed',
            }),
            operationSealSetDigest: digestAgentCanonicalValue({
              operationSealReceiptDigests,
            }),
          }
        : {}),
      ownerAuthoritySetDigest: digestAgentCanonicalValue({
        ownerAuthorityReceiptDigests: runtimeOwnerAuthorityReceiptDigests,
      }),
      producedCapabilityExecutionReceiptSetDigest:
        capabilityExecutionReceiptSetDigest,
      artifactResolution: Object.freeze({
        resolvedArtifactCount: artifactBytes > 0 ? 1 : 0,
        resolvedArtifactBytes: artifactBytes,
        artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          artifactResolution: 'complete',
        }),
      }),
      proposalValidation: Object.freeze({
        verdict: 'passed' as const,
        typedProposalValidationReceiptDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          proposal: 'passed',
        }),
      }),
      isolatedExecution: Object.freeze({
        isolationPolicyDigest: digestAgentCanonicalValue(
          'runtime-isolation.evidence-v3'
        ),
        toolCallCount: expectsTool ? 1 : 0,
        ...(toolReceiptSetDigest ? { toolReceiptSetDigest } : {}),
        repairRoundCount: expectsRepair ? 1 : 0,
        commandCount: 0,
        commandReceiptSetDigest: digestAgentCanonicalValue({
          commandReceiptDigests: [],
        }),
        transactionCount: expectsTransaction ? 1 : 0,
        ...(transactionReceiptSetDigest ? { transactionReceiptSetDigest } : {}),
      }),
      g3Verification: Object.freeze({
        verificationPlanReceiptDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          verificationPlan: 'executed',
        }),
        verificationClosureDigest,
        verdict: 'passed' as const,
      }),
      ...(controlledPreview ? { controlledPreview } : {}),
    });
    const controlledRuntimeReceipt: AgentEvaluationControlledRuntimeReceipt =
      Object.freeze({
        ...runtimeBase,
        receiptDigest: digestAgentCanonicalValue(runtimeBase),
      });
    const invocationTurnReceipt = createAgentEvaluationInvocationTurnReceipt({
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex: 0,
      invocationId: invocationReceipt.invocationId,
      status: 'completed',
      dispatchState: 'dispatched',
      terminal: true,
      caseDefinitionDigest: concreteCase.caseDefinitionDigest,
      contextPackDigest,
      ...(mediaRepresentationManifestDigest
        ? { mediaRepresentationManifestDigest }
        : {}),
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
      providerResultSpoolReceiptDigest:
        providerResultSpoolReceipt.receiptDigest,
      usageSourceReceiptDigest: usageSourceReceipt.receiptDigest,
      costSourceReceiptDigest: costSourceReceipt.receiptDigest,
      resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
      controlledRuntimeReceiptDigest: controlledRuntimeReceipt.receiptDigest,
    });
    const invocationTurnSetReceipt =
      createAgentEvaluationInvocationTurnSetReceipt({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turns: Object.freeze([invocationTurnReceipt]),
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
        digestAgentEvaluationInvocationTurnReceiptSet([invocationTurnReceipt]),
      invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
      capabilityExecutionReceiptSetDigest,
      verificationAttemptGrantReceiptSetDigest,
      responseDigest,
      status: 'completed',
      outcome: 'passed',
      metricObservations: Object.freeze([observation]),
      usage: invocationTurnSetReceipt.aggregateUsage,
      cost: invocationTurnSetReceipt.aggregateCost,
      startedAt: V8_TIME.started,
      completedAt: ATTEMPT_COMPLETED,
    });
    const gradingDigest = digestAgentEvaluationAttemptGrading({
      descriptorDigest: descriptor.descriptorDigest,
      invocationTurnSetReceiptDigest: invocationTurnSetReceipt.receiptDigest,
      terminalTurnReceiptDigest: invocationTurnReceipt.evidenceDigest,
      capabilityExecutionReceiptDigest:
        capabilityExecutionReceipt.receiptDigest,
      resultSubmissionReceiptDigest: resultSubmissionReceipt.receiptDigest,
      controlledRuntimeReceiptDigest: controlledRuntimeReceipt.receiptDigest,
      metricObservations: attempt.metricObservations,
      execution: {
        modelInvocations: executionReceipt.modelInvocations,
        toolCalls: executionReceipt.toolCalls,
        repairRounds: executionReceipt.repairRounds,
        transactions: executionReceipt.transactions,
        artifactBytes: executionReceipt.artifactBytes,
        capabilityExecutionReceiptSetDigest:
          executionReceipt.capabilityExecutionReceiptSetDigest,
        verificationAttemptGrantReceiptSetDigest:
          executionReceipt.verificationAttemptGrantReceiptSetDigest,
        ...(executionReceipt.toolReceiptSetDigest
          ? { toolReceiptSetDigest: executionReceipt.toolReceiptSetDigest }
          : {}),
        ...(executionReceipt.transactionReceiptSetDigest
          ? {
              transactionReceiptSetDigest:
                executionReceipt.transactionReceiptSetDigest,
            }
          : {}),
        ...(executionReceipt.verificationClosureDigest
          ? {
              verificationClosureDigest:
                executionReceipt.verificationClosureDigest,
            }
          : {}),
      },
    });
    const gradingAttemptAuthorityOwnerReceipt =
      createAgentEvaluationAttemptAuthorityOwnerReceipt({
        serviceKind: 'attempt-grading',
        operation: 'grade-and-persist',
        namespaceId: 'evaluation.namespace.evidence-bundle',
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        shardLeaseOwnerId: 'evaluation.runner.evidence-bundle',
        shardLeaseGeneration: 1,
        verificationGrantGeneration: verificationAttemptGrantReceipt.generation,
        verificationAttemptGrantReceiptSetDigest,
        requestDigest: digestAgentCanonicalValue({
          operation: 'grade-and-persist',
          attemptId: descriptor.attemptId,
          descriptorDigest: descriptor.descriptorDigest,
          gradingDigest,
        }),
        responseProjection:
          createAgentEvaluationAttemptAuthorityResponseProjection(
            'attempt-grading',
            'grade-and-persist',
            {
              metricObservations: attempt.metricObservations,
              gradingDigest,
            }
          ),
        ownerImplementationDigest: digestAgentCanonicalValue(
          'evaluation-attempt-grading-owner.evidence-bundle.v1'
        ),
        completedAt: ATTEMPT_COMPLETED,
      });
    let reviewRasterScanReceipt;
    let reviewCandidateRef;
    if (subjective) {
      const projection = createAgentEvaluationBlindReviewPreviewProjection({
        runtimeReceipt: controlledRuntimeReceipt,
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
        mediaType: controlledPreview!.mediaType,
        width: controlledPreview!.width,
        height: controlledPreview!.height,
        byteLength: controlledPreview!.byteLength,
        policyDigest: digestAgentCanonicalValue(
          'public-review-raster-scan-policy.evidence-v3'
        ),
        bytesDigest: controlledPreview!.artifactDigest,
        decodedPixelDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          decodedPixels: 'safe',
        }),
        metadataProfileDigest: digestAgentCanonicalValue(
          'public-review-raster-metadata-profile.evidence-v3'
        ),
        canarySetDigest: digestAgentCanonicalValue([...SECRET_CANARIES]),
        fingerprintSetDigest: digestAgentCanonicalValue([]),
        findingDigests: Object.freeze([]),
        verdict: 'safe',
        scannedAt: V8_TIME.evaluated,
      });
      const reviewCandidateBase = Object.freeze({
        candidateId: `candidate.${suffix}`,
        attemptId: descriptor.attemptId,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        descriptorDigest: descriptor.descriptorDigest,
        responseDigest,
        executionReceiptDigest: executionReceipt.receiptDigest,
        graderArtifactDigest:
          digestAgentEvaluationReviewGraderArtifactAuthority({
            attempt,
            executionReceiptDigest: executionReceipt.receiptDigest,
            controlledRuntimeReceiptDigest:
              controlledRuntimeReceipt.receiptDigest,
            graderPlanDigest: plan.graderPlan.planDigest,
          }),
        projectionAuthorityDigest:
          projection.authorityBinding.authorityBindingDigest,
        mediaType: controlledPreview!.mediaType,
        width: controlledPreview!.width,
        height: controlledPreview!.height,
        bytesDigest: controlledPreview!.artifactDigest,
        byteLength: controlledPreview!.byteLength,
        publicArtifactScanDigest: reviewRasterScanReceipt.receiptDigest,
        generatedAt: V8_TIME.evaluated,
      });
      reviewCandidateRef = Object.freeze({
        ...reviewCandidateBase,
        candidateDigest: digestAgentCanonicalValue(reviewCandidateBase),
      });
    }
    return Object.freeze({
      attempt,
      dispatchIntent,
      transportReceipt,
      providerResultSpoolReceipt,
      providerResultSpoolDispositionReceipt,
      invocationTurnReceipt,
      invocationTurnSetReceipt,
      resultSubmissionReceipt,
      controlledRuntimeReceipt,
      capabilityExecutionReceipt,
      attemptAuthorityOwnerReceipt,
      gradingAttemptAuthorityOwnerReceipt,
      verificationAttemptGrantReceipt,
      ...(reviewRasterScanReceipt ? { reviewRasterScanReceipt } : {}),
      ...(reviewCandidateRef ? { reviewCandidateRef } : {}),
      executionReceipt,
    });
  });
  const attempts = Object.freeze(
    materialized
      .map(({ attempt }) => attempt)
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.descriptor.attemptId,
          right.descriptor.attemptId
        )
      )
  );
  const byAttemptId = <T extends Readonly<{ attemptId: string }>>(
    values: readonly T[]
  ): readonly T[] =>
    Object.freeze(
      [...values].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    );
  const transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[] =
    Object.freeze(
      materialized
        .map(({ dispatchIntent }) => dispatchIntent)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.intentId, right.intentId)
        )
    );
  const transportReceipts: readonly AgentEvaluationTransportReceipt[] =
    Object.freeze(
      materialized
        .map(({ transportReceipt }) => transportReceipt)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.receiptId, right.receiptId)
        )
    );
  const providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[] =
    Object.freeze(
      materialized
        .map(({ providerResultSpoolReceipt }) => providerResultSpoolReceipt)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.spoolRef, right.spoolRef)
        )
    );
  const providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[] =
    Object.freeze(
      materialized
        .map(
          ({ providerResultSpoolDispositionReceipt }) =>
            providerResultSpoolDispositionReceipt
        )
        .sort((left, right) =>
          compareUnicodeCodePoints(left.spoolRef, right.spoolRef)
        )
    );
  const invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[] =
    byAttemptId(
      materialized.map(({ invocationTurnReceipt }) => invocationTurnReceipt)
    );
  const invocationTurnSetReceipts: readonly AgentEvaluationInvocationTurnSetReceipt[] =
    byAttemptId(
      materialized.map(
        ({ invocationTurnSetReceipt }) => invocationTurnSetReceipt
      )
    );
  const resultSubmissionReceipts: readonly AgentEvaluationResultSubmissionReceipt[] =
    byAttemptId(
      materialized.map(({ resultSubmissionReceipt }) => resultSubmissionReceipt)
    );
  const attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[] =
    Object.freeze(
      materialized
        .flatMap(
          ({
            attemptAuthorityOwnerReceipt,
            gradingAttemptAuthorityOwnerReceipt,
          }) => [
            attemptAuthorityOwnerReceipt,
            gradingAttemptAuthorityOwnerReceipt,
          ]
        )
        .sort(canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder)
    );
  const controlledRuntimeReceipts: readonly AgentEvaluationControlledRuntimeReceipt[] =
    byAttemptId(
      materialized.map(
        ({ controlledRuntimeReceipt }) => controlledRuntimeReceipt
      )
    );
  const capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[] =
    byAttemptId(
      materialized.map(
        ({ capabilityExecutionReceipt }) => capabilityExecutionReceipt
      )
    );
  const capabilitySpecificReceipts = Object.freeze([]);
  const verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[] =
    canonicalAgentEvaluationVerificationAttemptGrantReceipts(
      materialized.map(
        ({ verificationAttemptGrantReceipt }) => verificationAttemptGrantReceipt
      )
    );
  const reviewRasterScanReceipts = byAttemptId(
    materialized.flatMap(({ reviewRasterScanReceipt }) =>
      reviewRasterScanReceipt ? [reviewRasterScanReceipt] : []
    )
  );
  const reviewCandidateRefs = byAttemptId(
    materialized.flatMap(({ reviewCandidateRef }) =>
      reviewCandidateRef ? [reviewCandidateRef] : []
    )
  );
  const blindReviewMappingRefs = Object.freeze(
    reviewCandidateRefs
      .map((reference) =>
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
      .sort((left, right) =>
        compareUnicodeCodePoints(left.mappingId, right.mappingId)
      )
  );
  const executionReceipts: readonly AgentEvaluationExecutionReceipt[] =
    Object.freeze(
      materialized
        .map(({ executionReceipt }) => executionReceipt)
        .sort((left, right) =>
          compareUnicodeCodePoints(left.attemptId, right.attemptId)
        )
    );
  const executionTotals = executionReceipts.reduce(
    (total, receipt) => ({
      modelInvocations: total.modelInvocations + receipt.modelInvocations,
      toolCalls: total.toolCalls + receipt.toolCalls,
      repairRounds: total.repairRounds + receipt.repairRounds,
      transactions: total.transactions + receipt.transactions,
      artifactBytes: total.artifactBytes + receipt.artifactBytes,
      elapsedMs: total.elapsedMs + receipt.elapsedMs,
    }),
    {
      modelInvocations: 0,
      toolCalls: 0,
      repairRounds: 0,
      transactions: 0,
      artifactBytes: 0,
      elapsedMs: 0,
    }
  );
  const actualBudgetDemand: AgentBudgetDemand = Object.freeze({
    usage: createAgentUsageVector([
      ...attempts.flatMap(({ usage }) => usage.amounts),
      ...plan.endpointSmokeTargets.flatMap(
        (target) =>
          createUsage(
            digestAgentCanonicalValue({
              providerConfigurationId: target.providerConfigurationId,
              providerRequestId: `provider-request.${target.smokeTargetId}`,
              responseHeader: 'reported-smoke-usage',
            })
          ).amounts
      ),
    ]),
    cost: normalizeAgentCosts([
      ...attempts.flatMap(({ cost }) => cost),
      ...plan.endpointSmokeTargets.flatMap((target) =>
        createCosts(
          digestAgentCanonicalValue({
            providerConfigurationId: target.providerConfigurationId,
            providerRequestId: `provider-request.${target.smokeTargetId}`,
            responseHeader: 'reported-smoke-cost',
          })
        )
      ),
    ]),
    modelInvocations:
      executionTotals.modelInvocations + plan.endpointSmokeTargets.length,
    toolCalls: executionTotals.toolCalls,
    repairRounds: executionTotals.repairRounds,
    transactions: executionTotals.transactions,
    artifactBytes: executionTotals.artifactBytes,
    elapsedMs:
      executionTotals.elapsedMs +
      plan.endpointSmokeTargets.length *
        (Date.parse(ATTEMPT_COMPLETED) - Date.parse(V8_TIME.started)),
  });
  const aggregateSettlementDigest = digestAgentCanonicalValue({
    actual: actualBudgetDemand,
    charged: actualBudgetDemand,
    requiresReconciliation: false,
    settledAt: V8_TIME.evaluated,
  });
  const endpointSmokeDispatchIntentFacts: AgentEvaluationEndpointSmokeDispatchIntent[] =
    [];
  const endpointSmokeTransportReceiptFacts: AgentEvaluationTransportReceipt[] =
    [];
  const endpointSmokeResultSpoolReceiptFacts: AgentEvaluationEndpointSmokeResultSpoolReceipt[] =
    [];
  const endpointSmokeResultSpoolDispositionReceiptFacts: AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[] =
    [];
  const endpointSmokeReceipts: readonly AgentEvaluationEndpointSmokeReceipt[] =
    Object.freeze(
      plan.endpointSmokeTargets
        .map((target) => {
          const providerRequestId = `provider-request.${target.smokeTargetId}`;
          const usageContentDigest = digestAgentCanonicalValue({
            providerConfigurationId: target.providerConfigurationId,
            providerRequestId,
            responseHeader: 'reported-smoke-usage',
          });
          const usage = createUsage(usageContentDigest);
          const providerCostContentDigest = digestAgentCanonicalValue({
            providerConfigurationId: target.providerConfigurationId,
            providerRequestId,
            responseHeader: 'reported-smoke-cost',
          });
          const cost = createCosts(providerCostContentDigest);
          const invocationId = `invocation.${target.smokeTargetId}`;
          const budgetReservationId = 'evaluation-evidence-v3';
          const demandDigest = reservationDemandDigest;
          const settlementDigest = aggregateSettlementDigest;
          const requestDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            direction: 'request',
          });
          const requestBodyDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            requestBody: 'sanitized',
          });
          const responseHeaderDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            responseHeaders: 'sanitized',
          });
          const responseBodyDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            responseBody: 'encrypted-spool',
          });
          const responseDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            direction: 'response',
          });
          const normalizedEventSetDigest = digestAgentCanonicalValue({
            smokeTargetId: target.smokeTargetId,
            events: ['created', 'completed'],
          });
          const dispatchIntent =
            createAgentEvaluationEndpointSmokeDispatchIntent({
              intentId: `intent.${target.smokeTargetId}`,
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
              endpointId: `endpoint.${target.smokeTargetId}`,
              requestBodyDigest,
              requestBytes: 64,
              createdAt: V8_TIME.started,
            });
          const transportReceipt = createAgentEvaluationTransportReceipt({
            receiptId: `transport-receipt.${target.smokeTargetId}`,
            protocolFamily: target.protocolFamily,
            providerConfigurationId: target.providerConfigurationId,
            invocationId,
            dispatchIntentDigest: dispatchIntent.intentDigest,
            requestDigest,
            endpointId: dispatchIntent.endpointId,
            endpointClass: target.endpointClass,
            requestBodyDigest,
            requestBytes: 64,
            responseBytes: 64,
            httpStatus: 200,
            responseHeaderDigest,
            responseBodyDigest,
            providerRequestId,
            resolvedModelId: target.modelId,
            resolvedModelVersion: target.immutableModelVersion,
            sseEventCount: 2,
            dispatchState: 'dispatched',
            outcome: 'completed',
            startedAt: V8_TIME.started,
            completedAt: ATTEMPT_COMPLETED,
          });
          const smokeSpoolAad: AgentEvaluationEndpointSmokeResultSpoolAad =
            Object.freeze({
              format:
                'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad',
              version: 1,
              namespaceDigest: spoolNamespaceDigest,
              planDigest: plan.planDigest,
              repositoryCommit: plan.repositoryCommit,
              smokeTargetId: target.smokeTargetId,
              smokeTargetDigest: target.targetDigest,
              invocationId,
              dispatchIntentDigest: dispatchIntent.intentDigest,
              transportReceiptDigest: transportReceipt.receiptDigest,
              responseBodyDigest,
              normalizedEventSetDigest,
            });
          const smokeSpoolEnvelope =
            createAgentEvaluationProviderResultSpoolEnvelope({
              spoolId:
                createAgentEvaluationEndpointSmokeResultSpoolId(smokeSpoolAad),
              algorithm: 'aes-256-gcm',
              keyId: 'key.g4-model-eval.result-spool.v1',
              keyVersion: 1,
              keyRefDigest: spoolKeyRefDigest,
              encryptionProfileDigest: spoolEncryptionProfileDigest,
              nonceBase64Url: 'AAAAAAAAAAAAAAAA',
              authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
              ciphertextBase64Url: 'AQ',
              aadDigest:
                digestAgentEvaluationEndpointSmokeResultSpoolAad(smokeSpoolAad),
            });
          const smokeSpoolReceipt =
            createAgentEvaluationEndpointSmokeResultSpoolReceipt({
              aad: smokeSpoolAad,
              envelope: smokeSpoolEnvelope,
              responseDigest,
              retentionPolicyDigest: spoolRetentionPolicyDigest,
              createdAt: ATTEMPT_COMPLETED,
              expiresAt: V8_TIME.expires,
            });
          const smokeSpoolDispositionReceipt =
            createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
              spoolRef: smokeSpoolReceipt.spoolRef,
              spoolReceiptDigest: smokeSpoolReceipt.receiptDigest,
              planDigest: plan.planDigest,
              repositoryCommit: plan.repositoryCommit,
              smokeTargetId: target.smokeTargetId,
              smokeTargetDigest: target.targetDigest,
              invocationId,
              disposition: 'consumed-and-destroyed',
              retentionPolicyDigest: spoolRetentionPolicyDigest,
              disposedAt: ATTEMPT_COMPLETED,
            });
          endpointSmokeDispatchIntentFacts.push(dispatchIntent);
          endpointSmokeTransportReceiptFacts.push(transportReceipt);
          endpointSmokeResultSpoolReceiptFacts.push(smokeSpoolReceipt);
          endpointSmokeResultSpoolDispositionReceiptFacts.push(
            smokeSpoolDispositionReceipt
          );
          const usageSourceReceipt = createAgentEvaluationSourceReceipt({
            sourceReceiptId: `source.usage.${target.smokeTargetId}`,
            planDigest: plan.planDigest,
            repositoryCommit: plan.repositoryCommit,
            sourceKind: 'provider-reported-usage',
            providerConfigurationId: target.providerConfigurationId,
            modelLineageDigest: target.modelLineageDigest,
            providerRequestId,
            sourceContentDigest: usageContentDigest,
            inputUsageDigest: usage.vectorDigest,
            observedAt: V8_TIME.completed,
          });
          const costSourceReceipt = createAgentEvaluationSourceReceipt({
            sourceReceiptId: `source.cost.${target.smokeTargetId}`,
            planDigest: plan.planDigest,
            repositoryCommit: plan.repositoryCommit,
            sourceKind: 'provider-reported-cost',
            providerConfigurationId: target.providerConfigurationId,
            modelLineageDigest: target.modelLineageDigest,
            providerRequestId,
            sourceContentDigest: providerCostContentDigest,
            outputCostDigest: digestAgentEvaluationCostValues(cost),
            observedAt: V8_TIME.completed,
          });
          sourceReceipts.push(usageSourceReceipt, costSourceReceipt);
          return createAgentEvaluationEndpointSmokeReceipt({
            receiptId: `receipt.${target.smokeTargetId}`,
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
            dispatchIntentDigest: dispatchIntent.intentDigest,
            transportReceiptDigest: transportReceipt.receiptDigest,
            providerRequestId,
            responseHeaderDigest,
            requestDigest,
            responseDigest,
            resolvedModelId: target.modelId,
            resolvedModelVersion: target.immutableModelVersion,
            spoolReceiptDigest: smokeSpoolReceipt.receiptDigest,
            spoolDispositionReceiptDigest:
              smokeSpoolDispositionReceipt.receiptDigest,
            usage,
            cost,
            usageSourceReceiptDigest: usageSourceReceipt.receiptDigest,
            costSourceReceiptDigest: costSourceReceipt.receiptDigest,
            outcome: 'passed',
            startedAt: V8_TIME.started,
            completedAt: ATTEMPT_COMPLETED,
          });
        })
        .sort((left, right) =>
          compareUnicodeCodePoints(left.smokeTargetId, right.smokeTargetId)
        )
    );
  const endpointSmokeDispatchIntents =
    canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder(
      endpointSmokeDispatchIntentFacts
    );
  const endpointSmokeTransportReceipts =
    canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder(
      endpointSmokeTransportReceiptFacts
    );
  const endpointSmokeResultSpoolReceipts =
    canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder(
      endpointSmokeResultSpoolReceiptFacts
    );
  const endpointSmokeResultSpoolDispositionReceipts =
    canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder(
      endpointSmokeResultSpoolDispositionReceiptFacts
    );
  const humanReviewReport = createV8HumanReviewReport(plan);
  const validatedHumanReviewArtifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[] =
    Object.freeze([
      createValidatedHumanReviewArtifactFixture(plan, humanReviewReport),
    ]);
  const validatedHumanMetricObservations =
    createAgentEvaluationValidatedHumanMetricObservations({
      plan,
      attempts,
      humanReviewReport,
      validatedHumanReviewArtifact: validatedHumanReviewArtifacts[0]!,
    });
  const metricReport = buildAgentEvaluationMetricReport({
    reportId: 'metric-report.evidence-v2',
    plan,
    descriptors,
    attempts,
    validatedHumanMetricObservations,
    generatedAt: V8_TIME.evaluated,
  });
  const graderReport = buildAgentEvaluationGraderReport({
    reportId: 'grader-report.evidence-v2',
    plan,
    attempts,
    validatedHumanMetricObservations,
    generatedAt: V8_TIME.evaluated,
  });
  const holdoutExecutionReceipt = createV8HoldoutReceipt(plan);
  const manifest = createAgentModelEvaluationManifest({
    manifestId: 'manifest.evidence-v2',
    plan,
    descriptors,
    attempts,
    validatedHumanMetricObservations,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    completedAt: V8_TIME.evaluated,
    expiresAt: V8_TIME.expires,
  });
  if (manifest.outcome !== 'satisfied') {
    throw new Error(`Fixture manifest outcome was ${manifest.outcome}.`);
  }
  const baseBudgetLedger = settledLedger(
    plan.budget.budget,
    reservationDemand,
    actualBudgetDemand
  );
  const lifecycleBudgetArchiveFixture =
    createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
      plan,
      baseBudgetLedger
    );
  const budgetLedger = lifecycleBudgetArchiveFixture.budgetLedger;
  const lifecycleBudgetEvidence =
    createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence(
      plan,
      lifecycleBudgetArchiveFixture.archiveFamily
    );
  const attemptsByShard = new Map<string, (typeof attempts)[number][]>();
  for (const attempt of attempts) {
    const shard = attemptsByShard.get(attempt.descriptor.shardId) ?? [];
    shard.push(attempt);
    attemptsByShard.set(attempt.descriptor.shardId, shard);
  }
  const checkpoints = Object.freeze(
    [...attemptsByShard.entries()]
      .map(([shardId, shardAttempts]) =>
        createAgentEvaluationShardCheckpoint({
          planDigest: plan.planDigest,
          shardId,
          revision: 1,
          leaseOwnerId: 'evaluation-runner.evidence-v2',
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
      .sort((left, right) =>
        compareUnicodeCodePoints(left.shardId, right.shardId)
      )
  );
  const canonicalSourceReceipts = Object.freeze(
    [...sourceReceipts].sort((left, right) =>
      compareUnicodeCodePoints(left.sourceReceiptId, right.sourceReceiptId)
    )
  );
  const evidenceInput = Object.freeze({
    plan,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      lifecycleBudgetEvidence.journalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      lifecycleBudgetEvidence.bindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      lifecycleBudgetEvidence.bindingSetDigest,
    endpointSmokeDispatchIntents,
    endpointSmokeTransportReceipts,
    endpointSmokeResultSpoolReceipts,
    endpointSmokeResultSpoolDispositionReceipts,
    endpointSmokeValidationFailureReceipts: Object.freeze([]),
    endpointSmokeReceipts,
    preDispatchFailureReceipts: Object.freeze([]),
    transportDispatchIntents,
    transportReceipts,
    providerResultSpoolReceipts,
    providerResultSpoolDispositionReceipts,
    invocationTurnReceipts,
    invocationTurnSetReceipts,
    resultSubmissionReceipts,
    attemptAuthorityOwnerReceipts,
    controlledRuntimeReceipts,
    capabilityExecutionReceipts,
    capabilitySpecificReceipts,
    providerCapabilityObservationReceipts: Object.freeze([]),
    verificationAttemptGrantReceipts,
    validatedHumanReviewArtifacts,
    validatedHumanMetricObservations,
    reviewLeaseDigest: validatedHumanReviewArtifacts[0]!.reviewLeaseDigest,
    reviewRasterScanReceipts,
    reviewCandidateRefs,
    blindReviewMappingRefs,
    sourceReceipts: canonicalSourceReceipts,
    executionReceipts,
    attempts,
    checkpoints,
    budgetLedger,
    metricReport,
    graderReport,
    humanReviewReport,
    holdoutExecutionReceipt,
    manifest,
  });
  const evidenceSetDigest =
    digestAgentModelEvaluationEvidenceSet(evidenceInput);
  const authorityInput = Object.freeze({
    authorityId: 'authority.g4-real-evaluation',
    keyId: 'key.g4-real-evaluation',
    evidenceSetDigest,
    planDigest: plan.planDigest,
    capabilityProbeAdmissionSetDigest: digestAgentCanonicalValue({
      recordDigests: [],
    }),
    capabilityProbeReferenceReceiptSetDigest: digestAgentCanonicalValue({
      recordDigests: [],
    }),
    runtimeFactSourceOwnerRegistrationSetDigest: digestAgentCanonicalValue({
      recordDigests: [],
    }),
    optionalCapabilityFactSourceSetDigest: digestAgentCanonicalValue({
      recordDigests: [],
    }),
    optionalCapabilityFactAuthoritySetDigest: digestAgentCanonicalValue({
      recordDigests: [],
    }),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      lifecycleBudgetEvidence.journalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      lifecycleBudgetEvidence.bindingSetDigest,
    endpointSmokeDispatchIntentSetDigest:
      digestAgentEvaluationEndpointSmokeDispatchIntentSet(
        endpointSmokeDispatchIntents
      ),
    endpointSmokeTransportReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeTransportReceiptSet(
        endpointSmokeTransportReceipts
      ),
    endpointSmokeResultSpoolReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet(
        endpointSmokeResultSpoolReceipts
      ),
    endpointSmokeResultSpoolDispositionReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet(
        endpointSmokeResultSpoolDispositionReceipts
      ),
    endpointSmokeValidationFailureReceiptSetDigest:
      digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet([]),
    endpointSmokeSetDigest: digestAgentEvaluationEndpointSmokeReceiptSet(
      endpointSmokeReceipts
    ),
    preDispatchFailureReceiptSetDigest:
      digestAgentEvaluationPreDispatchFailureReceiptSet([]),
    transportDispatchIntentSetDigest:
      digestAgentEvaluationTransportDispatchIntentSet(transportDispatchIntents),
    transportReceiptSetDigest:
      digestAgentEvaluationTransportReceiptSet(transportReceipts),
    providerResultSpoolReceiptSetDigest:
      digestAgentEvaluationProviderResultSpoolReceiptSet(
        providerResultSpoolReceipts
      ),
    providerResultSpoolDispositionReceiptSetDigest:
      digestAgentEvaluationProviderResultSpoolDispositionReceiptSet(
        providerResultSpoolDispositionReceipts
      ),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet(invocationTurnReceipts),
    invocationTurnSetReceiptSetDigest:
      digestAgentEvaluationInvocationTurnSetReceiptSet(
        invocationTurnSetReceipts
      ),
    resultSubmissionReceiptSetDigest:
      digestAgentEvaluationResultSubmissionReceiptSet(resultSubmissionReceipts),
    attemptAuthorityOwnerReceiptSetDigest:
      digestAgentEvaluationAttemptAuthorityOwnerReceiptSet(
        attemptAuthorityOwnerReceipts
      ),
    controlledRuntimeReceiptSetDigest:
      digestAgentEvaluationControlledRuntimeReceiptSet(
        controlledRuntimeReceipts
      ),
    capabilityExecutionReceiptSetDigest:
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        capabilityExecutionReceipts
      ),
    capabilitySpecificReceiptSetDigest:
      digestAgentEvaluationCapabilitySpecificReceiptSet(
        capabilitySpecificReceipts
      ),
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet([]),
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        verificationAttemptGrantReceipts
      ),
    validatedHumanReviewArtifactSetDigest:
      digestAgentEvaluationValidatedHumanReviewArtifactSet(
        validatedHumanReviewArtifacts
      ),
    validatedHumanMetricObservationSetDigest:
      digestAgentEvaluationValidatedHumanMetricObservationSet(
        validatedHumanMetricObservations
      ),
    reviewLeaseDigest: validatedHumanReviewArtifacts[0]!.reviewLeaseDigest,
    reviewRasterScanReceiptSetDigest:
      digestAgentEvaluationReviewRasterScanReceiptSet(reviewRasterScanReceipts),
    reviewCandidateRefSetDigest:
      digestAgentEvaluationReviewCandidateRefSet(reviewCandidateRefs),
    blindReviewMappingSetDigest: digestAgentEvaluationBlindReviewMappingRefSet(
      blindReviewMappingRefs
    ),
    sourceReceiptSetDigest: digestAgentEvaluationSourceReceiptSet(
      canonicalSourceReceipts
    ),
    executionReceiptSetDigest:
      digestAgentEvaluationExecutionReceiptSet(executionReceipts),
    holdoutExecutionReceiptDigest: holdoutExecutionReceipt.receiptDigest,
    secretCanarySetDigest: digestAgentCanonicalValue([...SECRET_CANARIES]),
    protectedHoldoutCanarySetDigest: digestAgentCanonicalValue([
      ...HOLDOUT_CANARIES,
    ]),
    workflowName: 'g4-real-model-evaluation',
    workflowRunId: '30761547895',
    workflowRunAttempt: 1,
    jobId: '91532914906',
    environmentDigest: digestAgentCanonicalValue('isolated-evaluation-worker'),
    repositoryCommit: plan.repositoryCommit,
    issuedAt: V8_TIME.evaluated,
  });
  const authorityPayload =
    createAgentModelEvaluationAuthorityPayload(authorityInput);
  const authorityAttestation = createAgentModelEvaluationAuthorityAttestation({
    ...authorityInput,
    signature: SIGNATURE,
  });
  expect(authorityAttestation.attestedPayloadDigest).toBe(
    digestAgentCanonicalValue(authorityPayload)
  );
  const {
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      _hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      _hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      _hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
    ...bundleEvidenceInput
  } = evidenceInput;
  const bundle = createAgentModelEvaluationEvidenceBundle({
    ...bundleEvidenceInput,
    hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily:
      lifecycleBudgetArchiveFixture.archiveFamily,
    authorityAttestation,
  });
  const trust = Object.freeze({
    expectedRepositoryCommit: plan.repositoryCommit,
    now: '2026-08-08T00:00:00.000Z',
    secretCanaries: SECRET_CANARIES,
    protectedHoldoutCanaries: HOLDOUT_CANARIES,
    trustedPublicKeys: Object.freeze([
      Object.freeze({
        keyId: authorityAttestation.keyId,
        publicKeyBase64Url: PUBLIC_KEY,
      }),
    ]),
    verifyEd25519: ({
      signatureBase64Url,
      payload,
      message,
    }: Parameters<AgentModelEvaluationAuthorityTrust['verifyEd25519']>[0]) =>
      signatureBase64Url === SIGNATURE &&
      digestAgentCanonicalValue(payload) ===
        authorityAttestation.attestedPayloadDigest &&
      new TextDecoder().decode(message).includes(authorityAttestation.keyId),
  });
  return Object.freeze({ bundle, trust });
};

const lightweightEvidenceSetInput = (): Parameters<
  typeof digestAgentModelEvaluationEvidenceSet
>[0] => {
  const factDigest = (kind: string) =>
    digestAgentCanonicalValue({ fixture: 'bounded-v3', kind });
  return Object.freeze({
    plan: Object.freeze({
      repositoryCommit: 'a'.repeat(40),
      planDigest: factDigest('plan'),
    }),
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: factDigest(
      'hosted-lifecycle-journal-set'
    ),
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings: Object.freeze(
      []
    ),
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      factDigest('hosted-lifecycle-budget-closure-binding-set'),
    endpointSmokeDispatchIntents: Object.freeze([
      Object.freeze({ intentDigest: factDigest('endpoint-smoke-intent') }),
    ]),
    endpointSmokeTransportReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('endpoint-smoke-transport') }),
    ]),
    endpointSmokeResultSpoolReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('endpoint-smoke-spool') }),
    ]),
    endpointSmokeResultSpoolDispositionReceipts: Object.freeze([
      Object.freeze({
        receiptDigest: factDigest('endpoint-smoke-spool-disposition'),
      }),
    ]),
    endpointSmokeValidationFailureReceipts: Object.freeze([
      Object.freeze({
        receiptDigest: factDigest('endpoint-smoke-validation-failure'),
      }),
    ]),
    endpointSmokeReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('endpoint-smoke') }),
    ]),
    preDispatchFailureReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('pre-dispatch-failure') }),
    ]),
    transportDispatchIntents: Object.freeze([
      Object.freeze({ intentDigest: factDigest('dispatch-intent') }),
    ]),
    transportReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('transport') }),
    ]),
    providerResultSpoolReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('spool') }),
    ]),
    providerResultSpoolDispositionReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('spool-disposition') }),
    ]),
    invocationTurnReceipts: Object.freeze([
      Object.freeze({ evidenceDigest: factDigest('invocation-turn') }),
    ]),
    invocationTurnSetReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('invocation-turn-set') }),
    ]),
    resultSubmissionReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('result-submission') }),
    ]),
    attemptAuthorityOwnerReceipts: Object.freeze([
      Object.freeze({
        receiptDigest: factDigest('attempt-authority-owner-receipt'),
      }),
    ]),
    controlledRuntimeReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('controlled-runtime') }),
    ]),
    capabilityExecutionReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('capability-execution') }),
    ]),
    capabilitySpecificReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('capability-specific') }),
    ]),
    providerCapabilityObservationReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('provider-observation') }),
    ]),
    verificationAttemptGrantReceipts: Object.freeze([
      Object.freeze({
        receiptDigest: factDigest('verification-attempt-grant'),
      }),
    ]),
    validatedHumanReviewArtifacts: Object.freeze([
      Object.freeze({ artifactDigest: factDigest('validated-human-review') }),
    ]),
    validatedHumanMetricObservations: Object.freeze([
      Object.freeze({
        observationDigest: factDigest('validated-human-metric-observation'),
      }),
    ]),
    reviewLeaseDigest: factDigest('review-lease'),
    reviewRasterScanReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('review-raster-scan') }),
    ]),
    reviewCandidateRefs: Object.freeze([
      Object.freeze({ candidateDigest: factDigest('review-candidate') }),
    ]),
    blindReviewMappingRefs: Object.freeze([
      Object.freeze({
        mappingId: 'blind-mapping.bounded',
        mappingDigest: factDigest('blind-review-mapping'),
      }),
    ]),
    sourceReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('source') }),
    ]),
    executionReceipts: Object.freeze([
      Object.freeze({ receiptDigest: factDigest('execution') }),
    ]),
    attempts: Object.freeze([
      Object.freeze({ attemptDigest: factDigest('attempt') }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ checkpointDigest: factDigest('checkpoint') }),
    ]),
    budgetLedger: Object.freeze({ ledgerDigest: factDigest('budget-ledger') }),
    metricReport: Object.freeze({ reportDigest: factDigest('metric-report') }),
    graderReport: Object.freeze({ reportDigest: factDigest('grader-report') }),
    humanReviewReport: Object.freeze({
      blindedArtifactSetDigest: factDigest('public-blind-presentations'),
      reportDigest: factDigest('human-review-report'),
    }),
    holdoutExecutionReceipt: Object.freeze({
      receiptDigest: factDigest('holdout'),
    }),
    manifest: Object.freeze({ manifestDigest: factDigest('manifest') }),
  }) as unknown as Parameters<typeof digestAgentModelEvaluationEvidenceSet>[0];
};

const createFocusedLifecycleBudgetBundleFixture = () => {
  const plan = createEvidencePlan();
  const lifecycle =
    createAgentHostedRetrievalRuntimeResourceLifecycleJournalBudgetFixture(
      plan,
      createAgentBudgetLedger(plan.budget.budget)
    );
  const empty = Object.freeze([]);
  const input = Object.freeze({
    ...lightweightEvidenceSetInput(),
    plan,
    endpointSmokeDispatchIntents: empty,
    endpointSmokeTransportReceipts: empty,
    endpointSmokeResultSpoolReceipts: empty,
    endpointSmokeResultSpoolDispositionReceipts: empty,
    endpointSmokeValidationFailureReceipts: empty,
    endpointSmokeReceipts: empty,
    preDispatchFailureReceipts: empty,
    transportDispatchIntents: empty,
    transportReceipts: empty,
    providerResultSpoolReceipts: empty,
    providerResultSpoolDispositionReceipts: empty,
    invocationTurnReceipts: empty,
    invocationTurnSetReceipts: empty,
    resultSubmissionReceipts: empty,
    attemptAuthorityOwnerReceipts: empty,
    controlledRuntimeReceipts: empty,
    capabilityExecutionReceipts: empty,
    capabilitySpecificReceipts: empty,
    providerCapabilityObservationReceipts: empty,
    verificationAttemptGrantReceipts: empty,
    validatedHumanReviewArtifacts: empty,
    validatedHumanMetricObservations: empty,
    reviewRasterScanReceipts: empty,
    reviewCandidateRefs: empty,
    blindReviewMappingRefs: empty,
    sourceReceipts: empty,
    executionReceipts: empty,
    attempts: empty,
    checkpoints: empty,
    budgetLedger: lifecycle.budgetLedger,
    authorityAttestation: Object.freeze({
      attestationDigest: digestAgentCanonicalValue(
        'focused-hosted-lifecycle-attestation'
      ),
    }),
    hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily:
      lifecycle.archiveFamily,
  }) as unknown as Parameters<
    typeof createAgentModelEvaluationEvidenceBundle
  >[0];
  return Object.freeze({
    plan,
    lifecycle,
    input,
    bundle: createAgentModelEvaluationEvidenceBundle(input),
  });
};

describe('Agent model evaluation evidence bundle v3 bounded authority', () => {
  it('requires one canonical plan-level pricing singleton per frozen endpoint authority', () => {
    const plan = createEvidencePlan();
    const pricingReceipts = plan.endpointSmokeTargets.map((target) => {
      const pricingSnapshot = createPricingSnapshot(
        target.providerConfigurationId
      );
      return createAgentEvaluationSourceReceipt({
        sourceReceiptId: createAgentEvaluationPlanPricingSourceReceiptId({
          planDigest: plan.planDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          pricingAuthorityDigest: target.pricingAuthorityDigest,
          pricingSnapshotDigest: pricingSnapshot.snapshotDigest,
        }),
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        sourceKind: 'pricing-snapshot',
        providerConfigurationId: target.providerConfigurationId,
        modelLineageDigest: target.modelLineageDigest,
        sourceUri: `https://pricing.invalid/${target.providerConfigurationId}`,
        sourceContentDigest: pricingSnapshot.snapshotDigest,
        pricingSnapshot,
        observedAt: V8_TIME.completed,
      });
    });
    const coverage = (receipts: readonly AgentEvaluationSourceReceipt[]) =>
      hasExactAgentEvaluationPlanPricingSourceReceiptCoverage(receipts, {
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        targets: plan.endpointSmokeTargets,
      });

    expect(coverage(pricingReceipts)).toBe(true);
    expect(coverage(pricingReceipts.slice(1))).toBe(false);
    expect(
      coverage([...pricingReceipts.slice(0, -1), pricingReceipts[0]!])
    ).toBe(false);
    expect(
      hasExactAgentEvaluationPlanPricingSourceReceiptCoverage(pricingReceipts, {
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        targets: [
          {
            ...plan.endpointSmokeTargets[0]!,
            pricingAuthorityDigest: digestAgentCanonicalValue(
              'drifted-pricing-authority'
            ),
          },
          ...plan.endpointSmokeTargets.slice(1),
        ],
      })
    ).toBe(false);
  });

  it('binds every v3 authenticity fact set into the evidence-set digest', () => {
    const input = lightweightEvidenceSetInput();
    const baseline = digestAgentModelEvaluationEvidenceSet(input);
    for (const key of [
      'endpointSmokeDispatchIntents',
      'endpointSmokeTransportReceipts',
      'endpointSmokeResultSpoolReceipts',
      'endpointSmokeResultSpoolDispositionReceipts',
      'endpointSmokeValidationFailureReceipts',
      'transportDispatchIntents',
      'preDispatchFailureReceipts',
      'transportReceipts',
      'providerResultSpoolReceipts',
      'providerResultSpoolDispositionReceipts',
      'invocationTurnReceipts',
      'invocationTurnSetReceipts',
      'resultSubmissionReceipts',
      'controlledRuntimeReceipts',
      'capabilityExecutionReceipts',
      'providerCapabilityObservationReceipts',
      'verificationAttemptGrantReceipts',
      'validatedHumanReviewArtifacts',
      'validatedHumanMetricObservations',
      'reviewRasterScanReceipts',
      'reviewCandidateRefs',
      'blindReviewMappingRefs',
    ] as const) {
      expect(
        digestAgentModelEvaluationEvidenceSet({
          ...input,
          [key]: Object.freeze([]),
        })
      ).not.toBe(baseline);
    }
    expect(
      digestAgentModelEvaluationEvidenceSet({
        ...input,
        reviewLeaseDigest: digestAgentCanonicalValue(
          'different-human-review-lease'
        ),
      })
    ).not.toBe(baseline);
    expect(
      digestAgentModelEvaluationEvidenceSet({
        ...input,
        hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
          digestAgentCanonicalValue('different-hosted-lifecycle-journal-set'),
      })
    ).not.toBe(baseline);
    expect(
      digestAgentModelEvaluationEvidenceSet({
        ...input,
        hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
          digestAgentCanonicalValue(
            'different-hosted-lifecycle-budget-closure-binding-set'
          ),
      })
    ).not.toBe(baseline);
  });

  it('requires every signed authority root and rejects the legacy singleton root', () => {
    const digest = (kind: string) =>
      digestAgentCanonicalValue({ fixture: 'bounded-v3-attestation', kind });
    const input = Object.freeze({
      authorityId: 'authority.g4-evaluation',
      keyId: 'key.g4-evaluation',
      evidenceSetDigest: digest('evidence-set'),
      planDigest: digest('plan'),
      capabilityProbeAdmissionSetDigest: digest(
        'capability-probe-admission-set'
      ),
      capabilityProbeReferenceReceiptSetDigest: digest(
        'capability-probe-reference-set'
      ),
      runtimeFactSourceOwnerRegistrationSetDigest: digest(
        'runtime-fact-source-registration-set'
      ),
      optionalCapabilityFactSourceSetDigest: digest(
        'optional-capability-fact-source-set'
      ),
      optionalCapabilityFactAuthoritySetDigest: digest(
        'optional-capability-fact-authority-set'
      ),
      hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: digest(
        'hosted-lifecycle-journal-set'
      ),
      hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
        digest('hosted-lifecycle-budget-closure-binding-set'),
      endpointSmokeDispatchIntentSetDigest: digest(
        'endpoint-smoke-dispatch-intent-set'
      ),
      endpointSmokeTransportReceiptSetDigest: digest(
        'endpoint-smoke-transport-set'
      ),
      endpointSmokeResultSpoolReceiptSetDigest: digest(
        'endpoint-smoke-result-spool-set'
      ),
      endpointSmokeResultSpoolDispositionReceiptSetDigest: digest(
        'endpoint-smoke-result-spool-disposition-set'
      ),
      endpointSmokeValidationFailureReceiptSetDigest: digest(
        'endpoint-smoke-validation-failure-set'
      ),
      endpointSmokeSetDigest: digest('endpoint-smoke-set'),
      preDispatchFailureReceiptSetDigest: digest('pre-dispatch-failure-set'),
      transportDispatchIntentSetDigest: digest('dispatch-intent-set'),
      transportReceiptSetDigest: digest('transport-set'),
      providerResultSpoolReceiptSetDigest: digest('spool-set'),
      providerResultSpoolDispositionReceiptSetDigest: digest(
        'spool-disposition-set'
      ),
      invocationTurnReceiptSetDigest: digest('invocation-turn-set'),
      invocationTurnSetReceiptSetDigest: digest(
        'invocation-turn-set-receipt-set'
      ),
      resultSubmissionReceiptSetDigest: digest('result-submission-set'),
      attemptAuthorityOwnerReceiptSetDigest: digest(
        'attempt-authority-owner-receipt-set'
      ),
      controlledRuntimeReceiptSetDigest: digest('controlled-runtime-set'),
      capabilityExecutionReceiptSetDigest: digest('capability-execution-set'),
      capabilitySpecificReceiptSetDigest: digest('capability-specific-set'),
      providerCapabilityObservationReceiptSetDigest: digest(
        'provider-capability-observation-set'
      ),
      verificationAttemptGrantReceiptSetDigest: digest(
        'verification-attempt-grant-set'
      ),
      validatedHumanReviewArtifactSetDigest: digest(
        'validated-human-review-set'
      ),
      validatedHumanMetricObservationSetDigest: digest(
        'validated-human-metric-observation-set'
      ),
      reviewLeaseDigest: digest('review-lease'),
      reviewRasterScanReceiptSetDigest: digest('review-raster-scan-set'),
      reviewCandidateRefSetDigest: digest('review-candidate-set'),
      blindReviewMappingSetDigest: digest('blind-review-mapping-set'),
      sourceReceiptSetDigest: digest('source-set'),
      executionReceiptSetDigest: digest('execution-set'),
      holdoutExecutionReceiptDigest: digest('holdout'),
      secretCanarySetDigest: digest('secret-canaries'),
      protectedHoldoutCanarySetDigest: digest('holdout-canaries'),
      workflowName: 'g4-real-model-evaluation',
      workflowRunId: '1234',
      workflowRunAttempt: 1,
      jobId: 'finalize',
      environmentDigest: digest('environment'),
      repositoryCommit: 'a'.repeat(40),
      issuedAt: '2026-08-08T00:00:00.000Z',
      signature: SIGNATURE,
    });
    const attestation = createAgentModelEvaluationAuthorityAttestation(input);
    expect(isAgentModelEvaluationAuthorityAttestation(attestation)).toBe(true);
    for (const key of [
      'capabilityProbeAdmissionSetDigest',
      'capabilityProbeReferenceReceiptSetDigest',
      'runtimeFactSourceOwnerRegistrationSetDigest',
      'optionalCapabilityFactSourceSetDigest',
      'optionalCapabilityFactAuthoritySetDigest',
      'hostedRetrievalRuntimeResourceLifecycleJournalSetDigest',
      'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest',
      'endpointSmokeDispatchIntentSetDigest',
      'endpointSmokeTransportReceiptSetDigest',
      'endpointSmokeResultSpoolReceiptSetDigest',
      'endpointSmokeResultSpoolDispositionReceiptSetDigest',
      'endpointSmokeValidationFailureReceiptSetDigest',
      'transportDispatchIntentSetDigest',
      'preDispatchFailureReceiptSetDigest',
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
    ] as const) {
      const withoutRoot = { ...attestation } as Record<string, unknown>;
      delete withoutRoot[key];
      expect(isAgentModelEvaluationAuthorityAttestation(withoutRoot)).toBe(
        false
      );
    }
    expect(
      isAgentModelEvaluationAuthorityAttestation({
        ...attestation,
        invocationReceiptSetDigest: digest('legacy-invocation-set'),
      })
    ).toBe(false);
  });

  it('keeps opaque server mappings distinct from the public blind presentation authority', () => {
    const input = lightweightEvidenceSetInput();
    expect(
      digestAgentEvaluationBlindReviewMappingRefSet(
        input.blindReviewMappingRefs
      )
    ).not.toBe(input.humanReviewReport.blindedArtifactSetDigest);
    const baseline = digestAgentModelEvaluationEvidenceSet(input);
    expect(
      digestAgentModelEvaluationEvidenceSet({
        ...input,
        humanReviewReport: {
          ...input.humanReviewReport,
          reportDigest: digestAgentCanonicalValue(
            'different-public-blind-review-report'
          ),
        },
      })
    ).not.toBe(baseline);
    expect(
      digestAgentModelEvaluationEvidenceSet({
        ...input,
        blindReviewMappingRefs: input.blindReviewMappingRefs.map(
          (reference) => ({
            ...reference,
            mappingDigest: digestAgentCanonicalValue(
              'mapping-from-another-authority'
            ),
          })
        ),
      })
    ).not.toBe(baseline);
  });

  it('derives the exact-four hosted lifecycle budget closures from a complete zeroed journal family', () => {
    const { plan, lifecycle, bundle } =
      createFocusedLifecycleBudgetBundleFixture();
    const bindings =
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings;
    const usage = createAgentUsageVector(
      bindings.flatMap(({ projection }) => projection.demand.usage.amounts)
    );
    const amountByUnit = Object.fromEntries(
      usage.amounts.map(({ unit, logicalAmount }) => [unit, logicalAmount])
    );

    expect(lifecycle.archiveFamily.closureStatus).toBe('zeroed');
    expect(lifecycle.archiveFamily.records).toHaveLength(10);
    expect(bindings).toHaveLength(4);
    expect(bindings.map(({ projection }) => projection.reservationId)).toEqual([
      'budget.hosted-lifecycle.gemini-interactions.g4-provider-hosted-retrieval-core',
      'budget.hosted-lifecycle.gemini-interactions.g4-provider-hosted-retrieval-document',
      'budget.hosted-lifecycle.openai-responses.g4-provider-hosted-retrieval-core',
      'budget.hosted-lifecycle.openai-responses.g4-provider-hosted-retrieval-document',
    ]);
    expect(
      new Set(
        bindings.map(
          ({ createJournalArchiveRecordDigest }) =>
            createJournalArchiveRecordDigest
        )
      ).size
    ).toBe(4);
    expect(
      new Set(
        bindings.map(
          ({ projection }) =>
            projection.budgetReservationAuthority.authorityDigest
        )
      ).size
    ).toBe(4);
    expect(
      bindings.every(
        ({ projection }) =>
          projection.closureKind === 'settled' &&
          projection.settlement.requiresReconciliation === false
      )
    ).toBe(true);
    expect(amountByUnit).toEqual({
      'hosted-tool-call': '12',
      'provider-storage-byte-second': '214272000',
      'provider-upload-byte': '310',
    });
    expect(
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest
    ).toBe(
      digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
        bindings
      )
    );
    expect(
      Object.hasOwn(
        bundle,
        'hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily'
      )
    ).toBe(false);
    const registrationFixture =
      createAgentHostedRetrievalRuntimeResourceExact4Fixture({
        ...lifecycle.scope,
        registeredAt:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.startedAt,
        expiresAt:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.expiresAt,
        registrationIntents: lifecycle.registrationIntents,
        lifecycleBudgetDemands: lifecycle.lifecycleBudgetDemands,
        lifecycleBudgetReservationAuthorities:
          lifecycle.budgetReservationAuthorities,
        lifecycleBudgetDigest: plan.budget.budgetDigest,
        lifecycleBudgetReservePolicyDigest: plan.budget.reservePolicyDigest,
        lifecycleAuthorityCommitments: lifecycle.lifecycleAuthorityCommitments,
      });
    expect(
      registrationFixture.registrationResults.map(
        ({ registrationRequestDigest }) => registrationRequestDigest
      )
    ).toEqual(
      lifecycle.registrationRequests.map(({ requestDigest }) => requestDigest)
    );
    const provisionalLifecycle =
      createAgentHostedRetrievalRuntimeResourceExact4LifecycleFixture({
        ...lifecycle.scope,
        registeredAt:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.startedAt,
        expiresAt:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.expiresAt,
        registrationIntents: lifecycle.registrationIntents,
        lifecycleBudgetDemands: lifecycle.lifecycleBudgetDemands,
        lifecycleBudgetReservationAuthorities:
          lifecycle.budgetReservationAuthorities,
        lifecycleBudgetDigest: plan.budget.budgetDigest,
        lifecycleBudgetReservePolicyDigest: plan.budget.reservePolicyDigest,
        lifecycleAuthorityCommitments: lifecycle.lifecycleAuthorityCommitments,
        expectedShardIds: Object.freeze(['shard.hosted-lifecycle']),
        terminalShardLedgerEntries: Object.freeze([
          Object.freeze({
            shardId: 'shard.hosted-lifecycle',
            shardLeaseGeneration: 1,
            checkpointDigest: digestAgentCanonicalValue(
              'hosted-lifecycle-checkpoint'
            ),
            checkpointUpdatedAt: '2026-08-02T02:59:59.994Z',
            terminalAttempts: Object.freeze([
              Object.freeze({
                attemptId: 'attempt.hosted-lifecycle',
                attemptDigest: digestAgentCanonicalValue(
                  'hosted-lifecycle-attempt'
                ),
                status: 'completed' as const,
                completedAt: '2026-08-02T02:59:59.993Z',
              }),
            ]),
          }),
        ]),
        terminalFenceSealedAt: '2026-08-02T02:59:59.995Z',
        timing: Object.freeze({
          readCheckedAt: '2026-08-02T01:00:00.010Z',
          readExpiresAt: '2026-08-02T01:03:00.010Z',
          cleanupClaimedAt: '2026-08-02T02:59:59.996Z',
          cleanupClaimExpiresAt: '2026-08-02T03:01:00.000Z',
          cleanupDispatchedAt: '2026-08-02T02:59:59.999Z',
          cleanupCompletedAt:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_JOURNAL_FIXTURE_TIMING.settledAt,
        }),
      });
    const exactLifecycle =
      joinAgentHostedRetrievalRuntimeResourceLifecycleJournalFixtureToExact4Cleanup(
        lifecycle,
        provisionalLifecycle
      );
    expect(exactLifecycle.journal.archiveFamily.records).toHaveLength(10);
    const createRecordByRequest = new Map(
      exactLifecycle.journal.archiveFamily.records
        .filter(({ journalRecord }) => journalRecord.operation === 'create')
        .map((record) => [
          record.journalRecord.registrationRequestDigest,
          record,
        ])
    );
    const materialByDescriptor = new Map(
      exactLifecycle.journal.publicResourceMaterials.map((material) => [
        material.descriptor.descriptorDigest,
        material,
      ])
    );
    expect(
      exactLifecycle.lifecycle.cleanupArchiveRecords.map((cleanupRecord) => {
        const registrationResult = cleanupRecord.registrationResult;
        const createRecord = createRecordByRequest.get(
          registrationResult.registrationRequestDigest
        )!;
        const material = materialByDescriptor.get(
          registrationResult.registrationRequest.registrationIntent
            .publicResourceDescriptorDigest
        )!;
        return Object.freeze({
          registration:
            matchAgentHostedRetrievalRuntimeResourceRegistrationResultLifecycleJournal(
              registrationResult,
              createRecord.journalRecord
            ),
          closure:
            matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosure(
              createRecord.budgetClosureProjection!,
              registrationResult.authority.budgetReservationAuthority,
              cleanupRecord.cleanupReceipt.completedAt
            ),
          material:
            matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial(
              createRecord.budgetClosureProjection!,
              registrationResult.registrationRequest.registrationIntent,
              material
            ),
        });
      })
    ).toEqual(
      Array.from({ length: 4 }, () => ({
        registration: true,
        closure: true,
        material: true,
      }))
    );
    expect(
      exactLifecycle.lifecycle.cleanupArchiveRecords.flatMap((cleanupRecord) =>
        exactLifecycle.journal.archiveFamily.records
          .filter(
            ({ journalRecord }) =>
              journalRecord.operation === 'delete' &&
              journalRecord.registrationRequestDigest ===
                cleanupRecord.registrationResult.registrationRequestDigest
          )
          .map((record) => {
            const result = cleanupRecord.cleanupReceipt.resourceResults.find(
              (candidate) =>
                candidate.resourceId ===
                  record.journalRecord.businessResult.resourceId &&
                candidate.resourceRole ===
                  record.journalRecord.businessResult.resourceRole
            )!;
            return matchAgentHostedRetrievalRuntimeResourceCleanupResultLifecycleJournal(
              result,
              record.journalRecord,
              cleanupRecord.registrationResult,
              cleanupRecord.storedCleanupClaimAuthorityReceipt
            );
          })
      )
    ).toEqual(Array.from({ length: 6 }, () => true));
    expect(
      matchAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        exactLifecycle.journal.archiveFamily,
        exactLifecycle.lifecycle.registrationResults,
        exactLifecycle.lifecycle.cleanupArchiveRecords,
        exactLifecycle.journal.publicResourceMaterials
      )
    ).toBe(true);
  });

  it('rejects an incomplete constructor family and a decoded canonical binding swap', () => {
    const { lifecycle, input, bundle } =
      createFocusedLifecycleBudgetBundleFixture();
    const incompleteFamily =
      createAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        lifecycle.archiveFamily.records.slice(0, -1)
      );
    expect(() =>
      createAgentModelEvaluationEvidenceBundle({
        ...input,
        hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily:
          incompleteFamily,
      })
    ).toThrow(/incomplete/u);

    const baselineIssues = validateAgentModelEvaluationEvidenceBundle(bundle);
    expect(
      baselineIssues.some(
        ({ path }) =>
          path ===
          '/hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings'
      )
    ).toBe(false);
    const bindings =
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings;
    const swappedBindings = Object.freeze([
      bindings[1]!,
      bindings[0]!,
      ...bindings.slice(2),
    ]);
    const swapped = Object.freeze({
      ...bundle,
      hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
        swappedBindings,
      hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
        digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
          swappedBindings
        ),
    });
    expect(validateAgentModelEvaluationEvidenceBundle(swapped)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AI-6013',
          path: '/hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings',
        }),
      ])
    );
  });
});

let fixture: ReturnType<typeof createFixture>;

const describeMonolithicEvidenceDiagnostic = describe.runIf(
  (
    globalThis as typeof globalThis & {
      process?: { env?: Readonly<Record<string, string | undefined>> };
    }
  ).process?.env?.PRODIVIX_DIAGNOSE_G4_V8_MONOLITH === '1'
);

describeMonolithicEvidenceDiagnostic(
  'Agent model evaluation evidence bundle v3 monolith diagnostic',
  () => {
    beforeAll(() => {
      fixture = createFixture();
    }, 900_000);

    it('measures the retired canonical full-matrix evidence artifact', () => {
      const byteLength = new TextEncoder().encode(
        canonicalJsonText(fixture.bundle)
      ).byteLength;
      const invocationTurnReceiptBytes = new TextEncoder().encode(
        canonicalJsonText(fixture.bundle.invocationTurnReceipts)
      ).byteLength;
      const turnLinearBytes = new TextEncoder().encode(
        canonicalJsonText({
          transportDispatchIntents: fixture.bundle.transportDispatchIntents,
          transportReceipts: fixture.bundle.transportReceipts,
          providerResultSpoolReceipts:
            fixture.bundle.providerResultSpoolReceipts,
          providerResultSpoolDispositionReceipts:
            fixture.bundle.providerResultSpoolDispositionReceipts,
          invocationTurnReceipts: fixture.bundle.invocationTurnReceipts,
          sourceReceipts: fixture.bundle.sourceReceipts,
        })
      ).byteLength;
      const projectedSevenTurnBytes = byteLength + turnLinearBytes * 6;
      const singletonBytes = Object.fromEntries(
        [
          'plan',
          'budgetLedger',
          'metricReport',
          'graderReport',
          'humanReviewReport',
          'holdoutExecutionReceipt',
          'authorityAttestation',
          'manifest',
        ].map((family) => [
          family,
          new TextEncoder().encode(
            canonicalJsonText(
              fixture.bundle[family as keyof typeof fixture.bundle]
            )
          ).byteLength,
        ])
      );
      expect(
        projectedSevenTurnBytes,
        `canonical evidence bytes=${byteLength}; invocation turn receipt bytes=${invocationTurnReceiptBytes}; turn-linear bytes=${turnLinearBytes}; projected seven-turn bytes=${projectedSevenTurnBytes}; singleton bytes=${JSON.stringify(singletonBytes)}`
      ).toBeGreaterThan(512 * 1_024 * 1_024);
      expect(projectedSevenTurnBytes).toBeLessThan(
        AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumArchiveBytes
      );
      for (const singletonByteLength of Object.values(singletonBytes)) {
        expect(singletonByteLength).toBeLessThanOrEqual(
          AGENT_MODEL_EVALUATION_EVIDENCE_ARCHIVE_LIMITS.maximumRecordCanonicalBytes
        );
      }
    }, 120_000);

    it('admits an exact full-coverage bundle with a trusted Ed25519 authority', async () => {
      const issues = validateAgentModelEvaluationEvidenceBundle(
        fixture.bundle,
        fixture.trust
      );
      expect(issues).toEqual([]);
      expect(
        isAgentModelEvaluationEvidenceBundle(fixture.bundle, fixture.trust)
      ).toBe(true);
      await expect(
        verifyAgentModelEvaluationAuthorityAttestation(
          fixture.bundle,
          fixture.trust
        )
      ).resolves.toBe(true);
    }, 120_000);

    it('admits an authority attestation issued after evaluation finalization', () => {
      const authorityAttestation =
        createAgentModelEvaluationAuthorityAttestation({
          ...fixture.bundle.authorityAttestation,
          issuedAt: new Date(
            Date.parse(fixture.bundle.manifest.completedAt) + 1_000
          ).toISOString(),
          signature: SIGNATURE,
        });
      const bundle = createAgentModelEvaluationEvidenceBundle({
        ...fixture.bundle,
        authorityAttestation,
      });
      expect(
        validateAgentModelEvaluationEvidenceBundle(bundle, fixture.trust)
      ).toEqual([]);
    }, 120_000);

    it('rejects a synthetic all-green bundle without an authority receipt', () => {
      const {
        authorityAttestation: _authorityAttestation,
        ...withoutAuthority
      } = fixture.bundle;
      expect(
        validateAgentModelEvaluationEvidenceBundle(
          withoutAuthority,
          fixture.trust
        )
      ).toEqual([expect.objectContaining({ code: 'AI-9001', path: '/' })]);
    });

    it('fails closed for an untrusted authority key', async () => {
      await expect(
        verifyAgentModelEvaluationAuthorityAttestation(fixture.bundle, {
          ...fixture.trust,
          trustedPublicKeys: Object.freeze([]),
        })
      ).resolves.toBe(false);
    });

    it('rejects a non-canonical base64url signature alias', () => {
      expect(() =>
        createAgentModelEvaluationAuthorityAttestation({
          ...fixture.bundle.authorityAttestation,
          signature: `${SIGNATURE.slice(0, -1)}B`,
        })
      ).toThrow();
    });

    it('rejects duplicate coverage, cross-binding drift, and registered canary leakage', () => {
      const leakedAttestation = createAgentModelEvaluationAuthorityAttestation({
        ...fixture.bundle.authorityAttestation,
        workflowName: SECRET_CANARIES[0]!,
        signature: SIGNATURE,
      });
      const first = fixture.bundle.invocationTurnReceipts[0]!;
      const { evidenceDigest: _evidenceDigest, ...firstBase } = first;
      const driftedBase = Object.freeze({
        ...firstBase,
        repositoryCommit: 'f'.repeat(40),
        responseArtifactDigest: digestAgentCanonicalValue('drifted-response'),
        usageSourceDigest: digestAgentCanonicalValue('drifted-usage-source'),
        costSourceDigest: digestAgentCanonicalValue('drifted-cost-source'),
      });
      const driftedReceipt: AgentEvaluationInvocationTurnReceipt =
        Object.freeze({
          ...driftedBase,
          evidenceDigest: digestAgentCanonicalValue(driftedBase),
        }) as AgentEvaluationInvocationTurnReceipt;
      const tampered = createAgentModelEvaluationEvidenceBundle({
        ...fixture.bundle,
        authorityAttestation: leakedAttestation,
        attempts: Object.freeze([
          ...fixture.bundle.attempts,
          fixture.bundle.attempts[0]!,
        ]),
        invocationTurnReceipts: Object.freeze([
          driftedReceipt,
          ...fixture.bundle.invocationTurnReceipts.slice(1),
          driftedReceipt,
        ]),
      });
      const issues = validateAgentModelEvaluationEvidenceBundle(
        tampered,
        fixture.trust
      );
      expect(issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringMatching(/^\/attempts/),
          }),
          expect.objectContaining({
            path: expect.stringMatching(/^\/invocationTurnReceipts/),
          }),
          expect.objectContaining({
            code: 'AI-8010',
            message: expect.stringContaining('Secret canary'),
          }),
        ])
      );
    }, 120_000);
  }
);
