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
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentCost,
  AgentPricingSnapshot,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import {
  createAgentCapabilityProbeProgram,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbePublicResourceMaterial,
} from '../providers/agentCapabilityProbeProgram';
import {
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial,
  type AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding,
} from '../providers/agentHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntent,
} from '../providers/agentHostedRetrievalRuntimeResourceRegistration';
import { isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily } from '../providers/agentHostedRetrievalRuntimeResourceLifecycleArchive';
import type { AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily } from '../providers/agentHostedRetrievalRuntimeResourceLifecycleTransportJournal';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import type { AgentSecurityFinding } from '../security/agentSecurity.types';
import {
  isAgentBudgetLedgerState,
  selectAgentBudgetUtilization,
} from '../usage/agentBudgetLedger';
import type {
  AgentBudgetDemand,
  AgentBudgetLedgerState,
} from '../usage/agentBudgetLedger';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import type {
  AgentEvaluationGraderReport,
  AgentEvaluationEndpointSmokeTarget,
  AgentEvaluationIssue,
  AgentEvaluationMetricReport,
  AgentEvaluationReviewCandidateRef,
  AgentEvaluationReviewRasterScanReceipt,
  AgentEvaluationShardCheckpoint,
  AgentHoldoutExecutionReceipt,
  AgentHumanReviewReport,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationCaseExecutionRequirement,
  AgentModelEvaluationManifest,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import {
  canonicalAgentEvaluationCapabilityExecutionReceiptOrder,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  type AgentEvaluationCapabilityExecutionReceipt,
} from './agentEvaluationCapabilityExecution';
import {
  canonicalAgentEvaluationCapabilitySpecificReceiptOrder,
  digestAgentEvaluationCapabilitySpecificReceiptSet,
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
} from './agentEvaluationCapabilitySpecificReceipt';
import {
  canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
} from './agentEvaluationProviderCapabilityObservation';
import {
  canonicalAgentEvaluationAuthenticityOrder,
  digestAgentEvaluationControlledRuntimeReceiptSet,
  digestAgentEvaluationBlindReviewMappingRefSet,
  digestAgentEvaluationPreDispatchFailureReceiptSet,
  digestAgentEvaluationReviewRasterScanReceiptSet,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationInvocationTurnSetReceiptSet,
  digestAgentEvaluationProviderResultSpoolDispositionReceiptSet,
  digestAgentEvaluationProviderResultSpoolReceiptSet,
  digestAgentEvaluationResultSubmissionReceiptSet,
  digestAgentEvaluationReviewCandidateRefSet,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  isAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import type {
  AgentEvaluationInvocationTurnReceipt,
  AgentEvaluationInvocationTurnSetReceipt,
  AgentEvaluationBlindReviewMappingRef,
  AgentEvaluationProviderResultSpoolDispositionReceipt,
  AgentEvaluationProviderResultSpoolReceipt,
  AgentEvaluationTransportDispatchIntent,
  AgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';
import type { AgentEvaluationPreDispatchFailureReceipt } from './agentEvaluationPreDispatchFailure';
import {
  canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder,
  digestAgentEvaluationAttemptAuthorityOwnerReceiptSet,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';
import {
  canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder,
  canonicalAgentEvaluationEndpointSmokeReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder,
  canonicalAgentEvaluationEndpointSmokeValidationFailureReceiptOrder,
  digestAgentEvaluationEndpointSmokeDispatchIntentSet,
  digestAgentEvaluationEndpointSmokeReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet,
  digestAgentEvaluationEndpointSmokeTransportReceiptSet,
  digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet,
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolReceipt,
  type AgentEvaluationEndpointSmokeValidationFailureReceipt,
} from './agentEvaluationEndpointSmoke';
import {
  matchAgentEvaluationEndpointSmokeAuthorityFacts,
  matchAgentEvaluationEndpointSmokeBudgetAuthority,
  qualifiesAgentEvaluationEndpointSmokeSet,
} from './agentEvaluationEndpointSmokeAuthenticity';
export {
  createAgentEvaluationEndpointSmokeReceipt,
  digestAgentEvaluationEndpointSmokeReceiptSet,
  isAgentEvaluationEndpointSmokeReceipt,
} from './agentEvaluationEndpointSmoke';
export type { AgentEvaluationEndpointSmokeReceipt } from './agentEvaluationEndpointSmoke';
import type { AgentEvaluationResultSubmissionReceipt } from './agentEvaluationResultContract';
import {
  canonicalAgentEvaluationValidatedHumanReviewArtifactOrder,
  digestAgentEvaluationValidatedHumanReviewArtifactSet,
  isAgentEvaluationValidatedHumanReviewArtifact,
  isAgentEvaluationValidatedHumanReviewArtifactSet,
  type AgentEvaluationValidatedHumanReviewArtifact,
} from './agentEvaluationValidatedHumanReview';
import {
  canonicalAgentEvaluationValidatedHumanMetricObservationOrder,
  createAgentEvaluationValidatedHumanMetricObservations,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  isAgentEvaluationValidatedHumanMetricObservation,
  type AgentEvaluationValidatedHumanMetricObservation,
} from './agentEvaluationHumanMetricAuthority';
import {
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from './agentEvaluationVerificationAttemptGrant';
import { validateAgentEvaluationEvidenceAuthenticity } from './agentEvaluationEvidenceAuthenticityValidation';
import {
  planAgentModelEvaluationAttempts,
  resolveAgentModelEvaluationHostedRuntimeBudgetFloor,
  resolveAgentModelEvaluationCaseExecutionRequirement,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import { isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyCompleteForPlan } from './agentEvaluationEvidenceArchiveAuthorityRecords';
import {
  isAgentEvaluationGraderReport,
  isAgentEvaluationMetricReport,
  isAgentEvaluationShardCheckpoint,
  isAgentHoldoutExecutionReceipt,
  isAgentHumanReviewReport,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
  validateAgentModelEvaluationManifest,
} from './agentEvaluationResults';

export const AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT =
  'prodivix.agent-model-evaluation-evidence' as const;
export const AGENT_MODEL_EVALUATION_EVIDENCE_VERSION = 3 as const;

export type AgentEvaluationSourceKind =
  | 'provider-reported-usage'
  | 'provider-reported-cost'
  | 'pricing-snapshot'
  | 'cost-calculation';

export type AgentEvaluationSourceReceipt = Readonly<{
  sourceReceiptId: string;
  planDigest: string;
  repositoryCommit: string;
  sourceKind: AgentEvaluationSourceKind;
  providerConfigurationId: string;
  modelLineageDigest?: string;
  providerRequestId?: string;
  executionFailureAuthorityReceiptDigest?: string;
  sourceUri?: string;
  sourceContentDigest: string;
  pricingSnapshot?: AgentPricingSnapshot;
  inputUsageDigest?: string;
  outputCostDigest?: string;
  observedAt: string;
  receiptDigest: string;
}>;

export const createAgentEvaluationPlanPricingSourceReceiptId = (
  input: Readonly<{
    planDigest: string;
    providerConfigurationId: string;
    modelLineageDigest: string;
    pricingAuthorityDigest: string;
    pricingSnapshotDigest: string;
  }>
): string =>
  `evaluation-source.pricing.${digestAgentCanonicalValue(input).slice('sha256-'.length)}`;

export type AgentEvaluationExecutionReceipt = Readonly<{
  executionReceiptId: string;
  planDigest: string;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: string;
  modelInvocations: number;
  toolCalls: number;
  repairRounds: number;
  transactions: number;
  artifactBytes: number;
  elapsedMs: number;
  capabilityExecutionReceiptSetDigest: string;
  verificationAttemptGrantReceiptSetDigest: string;
  toolReceiptSetDigest?: string;
  transactionReceiptSetDigest?: string;
  verificationClosureDigest?: string;
  receiptDigest: string;
}>;

export type AgentModelEvaluationAuthorityPayload = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_VERSION;
  authorityId: string;
  keyId: string;
  evidenceSetDigest: string;
  planDigest: string;
  capabilityProbeAdmissionSetDigest: string;
  capabilityProbeReferenceReceiptSetDigest: string;
  runtimeFactSourceOwnerRegistrationSetDigest: string;
  optionalCapabilityFactSourceSetDigest: string;
  optionalCapabilityFactAuthoritySetDigest: string;
  hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: string;
  hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: string;
  endpointSmokeDispatchIntentSetDigest: string;
  endpointSmokeTransportReceiptSetDigest: string;
  endpointSmokeResultSpoolReceiptSetDigest: string;
  endpointSmokeResultSpoolDispositionReceiptSetDigest: string;
  endpointSmokeValidationFailureReceiptSetDigest: string;
  endpointSmokeSetDigest: string;
  preDispatchFailureReceiptSetDigest: string;
  transportDispatchIntentSetDigest: string;
  transportReceiptSetDigest: string;
  providerResultSpoolReceiptSetDigest: string;
  providerResultSpoolDispositionReceiptSetDigest: string;
  invocationTurnReceiptSetDigest: string;
  invocationTurnSetReceiptSetDigest: string;
  resultSubmissionReceiptSetDigest: string;
  attemptAuthorityOwnerReceiptSetDigest: string;
  controlledRuntimeReceiptSetDigest: string;
  capabilityExecutionReceiptSetDigest: string;
  capabilitySpecificReceiptSetDigest: string;
  providerCapabilityObservationReceiptSetDigest: string;
  verificationAttemptGrantReceiptSetDigest: string;
  validatedHumanReviewArtifactSetDigest: string;
  validatedHumanMetricObservationSetDigest: string;
  reviewLeaseDigest?: string;
  reviewRasterScanReceiptSetDigest: string;
  reviewCandidateRefSetDigest: string;
  blindReviewMappingSetDigest: string;
  sourceReceiptSetDigest: string;
  executionReceiptSetDigest: string;
  holdoutExecutionReceiptDigest: string;
  secretCanarySetDigest: string;
  protectedHoldoutCanarySetDigest: string;
  workflowName: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  jobId: string;
  environmentDigest: string;
  repositoryCommit: string;
  issuedAt: string;
}>;

export type AgentModelEvaluationAuthorityAttestation = Readonly<
  AgentModelEvaluationAuthorityPayload & {
    algorithm: 'ed25519';
    attestedPayloadDigest: string;
    signature: string;
    attestationDigest: string;
  }
>;

export type AgentModelEvaluationEvidenceBundle = Readonly<{
  format: typeof AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT;
  version: typeof AGENT_MODEL_EVALUATION_EVIDENCE_VERSION;
  plan: AgentModelEvaluationPlan;
  hostedRetrievalRuntimeResourceLifecycleJournalSetDigest: string;
  hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[];
  hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: string;
  endpointSmokeDispatchIntents: readonly AgentEvaluationEndpointSmokeDispatchIntent[];
  endpointSmokeTransportReceipts: readonly AgentEvaluationTransportReceipt[];
  endpointSmokeResultSpoolReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[];
  endpointSmokeResultSpoolDispositionReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[];
  endpointSmokeValidationFailureReceipts: readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[];
  endpointSmokeReceipts: readonly AgentEvaluationEndpointSmokeReceipt[];
  preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
  transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
  transportReceipts: readonly AgentEvaluationTransportReceipt[];
  providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
  providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
  invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
  invocationTurnSetReceipts: readonly AgentEvaluationInvocationTurnSetReceipt[];
  resultSubmissionReceipts: readonly AgentEvaluationResultSubmissionReceipt[];
  attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
  controlledRuntimeReceipts: readonly AgentEvaluationControlledRuntimeReceipt[];
  capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
  capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  validatedHumanReviewArtifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[];
  validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
  reviewLeaseDigest?: string;
  reviewRasterScanReceipts: readonly AgentEvaluationReviewRasterScanReceipt[];
  reviewCandidateRefs: readonly AgentEvaluationReviewCandidateRef[];
  blindReviewMappingRefs: readonly AgentEvaluationBlindReviewMappingRef[];
  sourceReceipts: readonly AgentEvaluationSourceReceipt[];
  executionReceipts: readonly AgentEvaluationExecutionReceipt[];
  attempts: readonly AgentModelEvaluationAttempt[];
  checkpoints: readonly AgentEvaluationShardCheckpoint[];
  budgetLedger: AgentBudgetLedgerState;
  metricReport: AgentEvaluationMetricReport;
  graderReport: AgentEvaluationGraderReport;
  humanReviewReport: AgentHumanReviewReport;
  holdoutExecutionReceipt: AgentHoldoutExecutionReceipt;
  authorityAttestation: AgentModelEvaluationAuthorityAttestation;
  manifest: AgentModelEvaluationManifest;
  evidenceSetDigest: string;
  bundleDigest: string;
}>;

export type AgentModelEvaluationEvidenceValidationOptions = Readonly<{
  expectedRepositoryCommit?: string;
  now?: string;
  secretCanaries?: readonly string[];
  protectedHoldoutCanaries?: readonly string[];
}>;

export type AgentEvaluationTrustedPublicKey = Readonly<{
  keyId: string;
  publicKeyBase64Url: string;
}>;

export type AgentEvaluationEd25519VerificationInput = Readonly<{
  keyId: string;
  publicKeyBase64Url: string;
  signatureBase64Url: string;
  payload: AgentModelEvaluationAuthorityPayload;
  message: Uint8Array;
}>;

export type AgentModelEvaluationAuthorityTrust =
  AgentModelEvaluationEvidenceValidationOptions &
    Readonly<{
      trustedPublicKeys: readonly AgentEvaluationTrustedPublicKey[];
      verifyEd25519: (
        input: AgentEvaluationEd25519VerificationInput
      ) => boolean | Promise<boolean>;
    }>;

type SourceReceiptInput = Omit<AgentEvaluationSourceReceipt, 'receiptDigest'>;

type ExecutionReceiptInput = Omit<
  AgentEvaluationExecutionReceipt,
  'receiptDigest'
>;

type AuthorityAttestationInput = Omit<
  AgentModelEvaluationAuthorityAttestation,
  | 'format'
  | 'version'
  | 'algorithm'
  | 'attestedPayloadDigest'
  | 'attestationDigest'
>;

type EvidenceBundleInput = Omit<
  AgentModelEvaluationEvidenceBundle,
  | 'format'
  | 'version'
  | 'hostedRetrievalRuntimeResourceLifecycleJournalSetDigest'
  | 'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings'
  | 'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest'
  | 'evidenceSetDigest'
  | 'bundleDigest'
> &
  Readonly<{
    hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily?: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily;
  }>;

type EvidenceSetInput = Omit<
  AgentModelEvaluationEvidenceBundle,
  | 'format'
  | 'version'
  | 'authorityAttestation'
  | 'evidenceSetDigest'
  | 'bundleDigest'
>;

type HostedLifecycleBudgetExpectation = Readonly<{
  orderKey: string;
  registrationIntent: AgentHostedRetrievalRuntimeResourceRegistrationIntent;
  registrationIntentDigest: string;
  publicResourceMaterial: AgentCapabilityProbePublicResourceMaterial;
  demand: AgentBudgetDemand;
}>;

const resolveHostedLifecycleBudgetExpectations = (
  plan: AgentModelEvaluationPlan
): readonly HostedLifecycleBudgetExpectation[] => {
  const expectations = plan.capabilityQualificationTargets.flatMap(
    (target): readonly HostedLifecycleBudgetExpectation[] => {
      const source =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      const registrationIntentDigest =
        source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
      if (!source || !registrationIntentDigest) return Object.freeze([]);
      if (
        source.capabilityId !== 'provider.hosted-retrieval' ||
        source.sourceKind !== 'sealed-hosted-owner-result' ||
        (source.protocolFamily !== 'gemini-interactions' &&
          source.protocolFamily !== 'openai-responses') ||
        (source.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
          source.capabilityProfileId !==
            'g4-provider-hosted-retrieval-document')
      ) {
        throw new TypeError(
          'Hosted lifecycle budget target identity is inconsistent.'
        );
      }
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId: source.capabilityProfileId,
        capabilityProfileDigest: source.capabilityProfileDigest,
      });
      const publicResourceMaterial =
        resolveAgentCapabilityProbePublicResource(program);
      if (!publicResourceMaterial) {
        throw new TypeError('Hosted lifecycle budget material is unavailable.');
      }
      const registrationIntent =
        createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
          providerConfigurationId: source.providerConfigurationId,
          providerConfigurationDigest: target.providerIdentityDigest,
          protocolFamily: source.protocolFamily,
          modelId: source.modelId,
          modelLineageDigest: source.modelLineageDigest,
          adapterDigest: source.adapterDigest,
          capabilityProfileId: source.capabilityProfileId,
          capabilityProfileDigest: source.capabilityProfileDigest,
          probeProgramDigest: program.programDigest,
          publicResourceDescriptorDigest:
            publicResourceMaterial.descriptor.descriptorDigest,
        });
      if (
        registrationIntent.intentDigest !== registrationIntentDigest ||
        target.providerConfigurationId !== source.providerConfigurationId ||
        target.modelId !== source.modelId ||
        target.modelLineageDigest !== source.modelLineageDigest
      ) {
        throw new TypeError('Hosted lifecycle budget intent binding drifted.');
      }
      return Object.freeze([
        Object.freeze({
          orderKey: `${source.protocolFamily}\u0000${source.capabilityProfileId}\u0000${registrationIntentDigest}`,
          registrationIntent,
          registrationIntentDigest,
          publicResourceMaterial,
          demand:
            createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
              registrationIntent,
              publicResourceMaterial
            ),
        }),
      ]);
    }
  );
  const ordered = Object.freeze(
    [...expectations].sort((left, right) =>
      compareUnicodeCodePoints(left.orderKey, right.orderKey)
    )
  );
  if (
    ordered.length > 0 &&
    (ordered.length !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      new Set(ordered.map(({ orderKey }) => orderKey)).size !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      new Set(ordered.map(({ registrationIntentDigest: digest }) => digest))
        .size !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT)
  ) {
    throw new TypeError(
      'Hosted lifecycle budget requires the exact four plan intents.'
    );
  }
  return ordered;
};

export const digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet =
  (
    bindings: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[]
  ): string =>
    digestAgentCanonicalValue({
      bindings: bindings.map(
        ({
          registrationRequestDigest,
          registrationIntentDigest,
          createJournalArchiveRecordDigest,
          projectionDigest,
        }) =>
          Object.freeze({
            registrationRequestDigest,
            registrationIntentDigest,
            createJournalArchiveRecordDigest,
            projectionDigest,
          })
      ),
    });

export const createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence =
  (
    plan: AgentModelEvaluationPlan,
    family:
      | AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily
      | undefined
  ): Readonly<{
    journalSetDigest: string;
    bindings: readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[];
    bindingSetDigest: string;
  }> => {
    const expectations = resolveHostedLifecycleBudgetExpectations(plan);
    if (expectations.length === 0) {
      if (family !== undefined) {
        throw new TypeError(
          'Hosted lifecycle archive family is foreign to the evaluation plan.'
        );
      }
      const bindings = Object.freeze(
        []
      ) as readonly AgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureBinding[];
      return Object.freeze({
        journalSetDigest: digestAgentCanonicalValue({ recordDigests: [] }),
        bindings,
        bindingSetDigest:
          digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
            bindings
          ),
      });
    }
    if (
      !family ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveFamily(
        family
      ) ||
      !isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveFamilyCompleteForPlan(
        plan,
        family.records
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle archive family is incomplete for the evaluation plan.'
      );
    }
    const createRecordsByIntent = new Map(
      family.records.flatMap((record) => {
        if (record.journalRecord.operation !== 'create') return [];
        const firstIntent = record.journalRecord.dispatchIntentSet.intents[0];
        return firstIntent
          ? ([[firstIntent.registrationIntentDigest, record]] as const)
          : [];
      })
    );
    if (
      createRecordsByIntent.size !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
    ) {
      throw new TypeError(
        'Hosted lifecycle creation closure set is incomplete.'
      );
    }
    const bindings = Object.freeze(
      expectations.map(({ registrationIntentDigest }) => {
        const record = createRecordsByIntent.get(registrationIntentDigest);
        const projection = record?.budgetClosureProjection;
        if (
          !record ||
          !projection ||
          record.budgetClosureProjectionDigest !== projection.projectionDigest
        ) {
          throw new TypeError(
            'Hosted lifecycle creation budget closure is incomplete.'
          );
        }
        return Object.freeze({
          registrationRequestDigest:
            record.journalRecord.registrationRequestDigest,
          registrationIntentDigest,
          createJournalArchiveRecordDigest: record.archiveRecordDigest,
          projection,
          projectionDigest: projection.projectionDigest,
        });
      })
    );
    return Object.freeze({
      journalSetDigest: digestAgentCanonicalValue({
        recordDigests: [...family.recordDigests].sort(compareUnicodeCodePoints),
      }),
      bindings,
      bindingSetDigest:
        digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
          bindings
        ),
    });
  };

const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;
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
    !base64UrlPattern.test(value)
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
const issue = (
  code: AgentEvaluationIssue['code'],
  path: string,
  message: string
): AgentEvaluationIssue =>
  Object.freeze({ code, path, message, blocking: true });

const compareIssues = (
  left: AgentEvaluationIssue,
  right: AgentEvaluationIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Readonly<Record<string, unknown>> => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort(compareUnicodeCodePoints);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key)) &&
    keys.length >= required.length
  );
};

const isIdentity = (value: unknown): value is string =>
  isAgentControlIdentity(value);
const isDigest = (value: unknown): value is string =>
  isAgentCanonicalDigest(value);
const isInstant = (value: unknown): value is string =>
  isAgentControlInstant(value);

export const digestAgentEvaluationCostValues = (
  cost: readonly AgentCost[]
): string =>
  digestAgentCanonicalValue(
    cost.map(({ currency, amount, confidence }) => ({
      currency,
      amount,
      confidence,
    }))
  );

export const digestAgentEvaluationCostCalculationSource = (
  input: Readonly<{
    providerConfigurationId: string;
    modelLineageDigest?: string;
    providerRequestId?: string;
    executionFailureAuthorityReceiptDigest?: string;
    pricingSnapshotDigest: string;
    inputUsageDigest: string;
    outputCostDigest: string;
  }>
): string =>
  digestAgentCanonicalValue({
    sourceKind: 'cost-calculation',
    providerConfigurationId: input.providerConfigurationId,
    ...(input.modelLineageDigest
      ? { modelLineageDigest: input.modelLineageDigest }
      : {}),
    ...(input.providerRequestId
      ? { providerRequestId: input.providerRequestId }
      : {}),
    ...(input.executionFailureAuthorityReceiptDigest
      ? {
          executionFailureAuthorityReceiptDigest:
            input.executionFailureAuthorityReceiptDigest,
        }
      : {}),
    pricingSnapshotDigest: input.pricingSnapshotDigest,
    inputUsageDigest: input.inputUsageDigest,
    outputCostDigest: input.outputCostDigest,
  });

const hasPricingSnapshotShape = (
  value: unknown
): value is AgentPricingSnapshot =>
  exactKeys(
    value,
    [
      'pricingSnapshotId',
      'providerConfigurationId',
      'effectiveAt',
      'rates',
      'sourceDigest',
      'snapshotDigest',
    ],
    ['serviceTier', 'region']
  );

const isPricingSnapshot = (value: unknown): value is AgentPricingSnapshot => {
  try {
    if (!hasPricingSnapshotShape(value)) return false;
    if (
      !isIdentity(value.pricingSnapshotId) ||
      !isIdentity(value.providerConfigurationId) ||
      !isInstant(value.effectiveAt) ||
      !isDigest(value.sourceDigest) ||
      !Array.isArray(value.rates) ||
      value.rates.length === 0 ||
      value.rates.some(
        (rate) =>
          !exactKeys(rate, ['unit', 'currency', 'unitPrice']) ||
          typeof rate.unit !== 'string' ||
          typeof rate.currency !== 'string' ||
          !/^[A-Z]{3}$/u.test(rate.currency) ||
          typeof rate.unitPrice !== 'string'
      )
    ) {
      return false;
    }
    const { snapshotDigest: _snapshotDigest, ...base } = value;
    return digestAgentCanonicalValue(base) === value.snapshotDigest;
  } catch {
    return false;
  }
};

export const createAgentEvaluationSourceReceipt = (
  input: SourceReceiptInput
): AgentEvaluationSourceReceipt => {
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const hasSourceReceiptShape = (
  value: unknown
): value is AgentEvaluationSourceReceipt =>
  exactKeys(
    value,
    [
      'sourceReceiptId',
      'planDigest',
      'repositoryCommit',
      'sourceKind',
      'providerConfigurationId',
      'sourceContentDigest',
      'observedAt',
      'receiptDigest',
    ],
    [
      'modelLineageDigest',
      'providerRequestId',
      'executionFailureAuthorityReceiptDigest',
      'sourceUri',
      'pricingSnapshot',
      'inputUsageDigest',
      'outputCostDigest',
    ]
  );

const isSourceReceipt = (
  value: unknown
): value is AgentEvaluationSourceReceipt => {
  try {
    if (!hasSourceReceiptShape(value)) return false;
    const receipt = value;
    if (
      !isIdentity(receipt.sourceReceiptId) ||
      !isDigest(receipt.planDigest) ||
      !/^[0-9a-f]{40}$/u.test(receipt.repositoryCommit) ||
      !isIdentity(receipt.providerConfigurationId) ||
      !isDigest(receipt.sourceContentDigest) ||
      !isInstant(receipt.observedAt) ||
      (receipt.modelLineageDigest !== undefined &&
        !isDigest(receipt.modelLineageDigest)) ||
      (receipt.providerRequestId !== undefined &&
        !isIdentity(receipt.providerRequestId)) ||
      (receipt.executionFailureAuthorityReceiptDigest !== undefined &&
        !isDigest(receipt.executionFailureAuthorityReceiptDigest)) ||
      (receipt.sourceUri !== undefined &&
        (!receipt.sourceUri.trim() || receipt.sourceUri.length > 2_048)) ||
      (receipt.inputUsageDigest !== undefined &&
        !isDigest(receipt.inputUsageDigest)) ||
      (receipt.outputCostDigest !== undefined &&
        !isDigest(receipt.outputCostDigest))
    ) {
      return false;
    }
    switch (receipt.sourceKind) {
      case 'provider-reported-usage':
        if (
          (receipt.providerRequestId === undefined) ===
            (receipt.executionFailureAuthorityReceiptDigest === undefined) ||
          (receipt.executionFailureAuthorityReceiptDigest !== undefined &&
            receipt.sourceUri === undefined) ||
          receipt.inputUsageDigest === undefined ||
          receipt.pricingSnapshot !== undefined ||
          receipt.outputCostDigest !== undefined
        ) {
          return false;
        }
        break;
      case 'provider-reported-cost':
        if (
          (receipt.providerRequestId === undefined) ===
            (receipt.executionFailureAuthorityReceiptDigest === undefined) ||
          (receipt.executionFailureAuthorityReceiptDigest !== undefined &&
            receipt.sourceUri === undefined) ||
          receipt.outputCostDigest === undefined ||
          receipt.pricingSnapshot !== undefined ||
          receipt.inputUsageDigest !== undefined
        ) {
          return false;
        }
        break;
      case 'pricing-snapshot':
        if (
          !isPricingSnapshot(receipt.pricingSnapshot) ||
          receipt.modelLineageDigest === undefined ||
          receipt.sourceUri === undefined ||
          receipt.sourceContentDigest !==
            receipt.pricingSnapshot.snapshotDigest ||
          receipt.providerConfigurationId !==
            receipt.pricingSnapshot.providerConfigurationId ||
          receipt.providerRequestId !== undefined ||
          receipt.executionFailureAuthorityReceiptDigest !== undefined ||
          receipt.inputUsageDigest !== undefined ||
          receipt.outputCostDigest !== undefined
        ) {
          return false;
        }
        break;
      case 'cost-calculation':
        if (
          !isPricingSnapshot(receipt.pricingSnapshot) ||
          receipt.inputUsageDigest === undefined ||
          receipt.outputCostDigest === undefined ||
          receipt.providerConfigurationId !==
            receipt.pricingSnapshot.providerConfigurationId ||
          (receipt.providerRequestId === undefined) ===
            (receipt.executionFailureAuthorityReceiptDigest === undefined) ||
          (receipt.executionFailureAuthorityReceiptDigest !== undefined &&
            receipt.sourceUri === undefined) ||
          receipt.sourceContentDigest !==
            digestAgentEvaluationCostCalculationSource({
              providerConfigurationId: receipt.providerConfigurationId,
              ...(receipt.modelLineageDigest
                ? { modelLineageDigest: receipt.modelLineageDigest }
                : {}),
              ...(receipt.providerRequestId
                ? { providerRequestId: receipt.providerRequestId }
                : {}),
              ...(receipt.executionFailureAuthorityReceiptDigest
                ? {
                    executionFailureAuthorityReceiptDigest:
                      receipt.executionFailureAuthorityReceiptDigest,
                  }
                : {}),
              pricingSnapshotDigest: receipt.pricingSnapshot.snapshotDigest,
              inputUsageDigest: receipt.inputUsageDigest,
              outputCostDigest: receipt.outputCostDigest,
            })
        ) {
          return false;
        }
        break;
      default:
        return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return digestAgentCanonicalValue(base) === receipt.receiptDigest;
  } catch {
    return false;
  }
};

export const isAgentEvaluationSourceReceipt = isSourceReceipt;

export const matchesAgentEvaluationPlanPricingSourceReceipt = (
  receipt: AgentEvaluationSourceReceipt,
  input: Readonly<{
    planDigest: string;
    repositoryCommit: string;
    target: AgentEvaluationEndpointSmokeTarget;
  }>
): boolean =>
  receipt.sourceKind === 'pricing-snapshot' &&
  receipt.pricingSnapshot !== undefined &&
  receipt.planDigest === input.planDigest &&
  receipt.repositoryCommit === input.repositoryCommit &&
  receipt.providerConfigurationId === input.target.providerConfigurationId &&
  receipt.modelLineageDigest === input.target.modelLineageDigest &&
  receipt.sourceReceiptId ===
    createAgentEvaluationPlanPricingSourceReceiptId({
      planDigest: input.planDigest,
      providerConfigurationId: input.target.providerConfigurationId,
      modelLineageDigest: input.target.modelLineageDigest,
      pricingAuthorityDigest: input.target.pricingAuthorityDigest,
      pricingSnapshotDigest: receipt.pricingSnapshot.snapshotDigest,
    });

export const hasExactAgentEvaluationPlanPricingSourceReceiptCoverage = (
  receipts: readonly AgentEvaluationSourceReceipt[],
  input: Readonly<{
    planDigest: string;
    repositoryCommit: string;
    targets: readonly AgentEvaluationEndpointSmokeTarget[];
  }>
): boolean => {
  const pricingReceipts = receipts.filter(
    (receipt) => receipt.sourceKind === 'pricing-snapshot'
  );
  return (
    pricingReceipts.length === input.targets.length &&
    input.targets.every(
      (target) =>
        pricingReceipts.filter((receipt) =>
          matchesAgentEvaluationPlanPricingSourceReceipt(receipt, {
            planDigest: input.planDigest,
            repositoryCommit: input.repositoryCommit,
            target,
          })
        ).length === 1
    ) &&
    pricingReceipts.every(
      (receipt) =>
        input.targets.filter((target) =>
          matchesAgentEvaluationPlanPricingSourceReceipt(receipt, {
            planDigest: input.planDigest,
            repositoryCommit: input.repositoryCommit,
            target,
          })
        ).length === 1
    )
  );
};

export const createAgentEvaluationExecutionReceipt = (
  input: ExecutionReceiptInput
): AgentEvaluationExecutionReceipt => {
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const hasExecutionReceiptShape = (
  value: unknown
): value is AgentEvaluationExecutionReceipt =>
  exactKeys(
    value,
    [
      'executionReceiptId',
      'planDigest',
      'repositoryCommit',
      'attemptId',
      'descriptorDigest',
      'modelInvocations',
      'toolCalls',
      'repairRounds',
      'transactions',
      'artifactBytes',
      'elapsedMs',
      'capabilityExecutionReceiptSetDigest',
      'verificationAttemptGrantReceiptSetDigest',
      'receiptDigest',
    ],
    [
      'toolReceiptSetDigest',
      'transactionReceiptSetDigest',
      'verificationClosureDigest',
    ]
  );

const isExecutionReceipt = (
  value: unknown
): value is AgentEvaluationExecutionReceipt => {
  try {
    if (!hasExecutionReceiptShape(value)) return false;
    const receipt = value;
    if (
      !isIdentity(receipt.executionReceiptId) ||
      !isDigest(receipt.planDigest) ||
      !/^[0-9a-f]{40}$/u.test(receipt.repositoryCommit) ||
      !isIdentity(receipt.attemptId) ||
      !isDigest(receipt.descriptorDigest) ||
      [
        receipt.modelInvocations,
        receipt.toolCalls,
        receipt.repairRounds,
        receipt.transactions,
        receipt.artifactBytes,
        receipt.elapsedMs,
      ].some((count) => !Number.isSafeInteger(count) || count < 0) ||
      !isDigest(receipt.capabilityExecutionReceiptSetDigest) ||
      !isDigest(receipt.verificationAttemptGrantReceiptSetDigest) ||
      receipt.toolCalls > 0 !== (receipt.toolReceiptSetDigest !== undefined) ||
      receipt.transactions > 0 !==
        (receipt.transactionReceiptSetDigest !== undefined) ||
      [
        receipt.toolReceiptSetDigest,
        receipt.transactionReceiptSetDigest,
        receipt.verificationClosureDigest,
      ].some((digest) => digest !== undefined && !isDigest(digest))
    ) {
      return false;
    }
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    return digestAgentCanonicalValue(base) === receipt.receiptDigest;
  } catch {
    return false;
  }
};

export const isAgentEvaluationExecutionReceipt = isExecutionReceipt;

export const createAgentModelEvaluationAuthorityPayload = (
  input: Omit<AgentModelEvaluationAuthorityPayload, 'format' | 'version'>
): AgentModelEvaluationAuthorityPayload =>
  Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_VERSION,
    ...input,
  });

export const createAgentModelEvaluationAuthorityAttestation = (
  input: AuthorityAttestationInput
): AgentModelEvaluationAuthorityAttestation => {
  const { signature, ...payloadInput } = input;
  const payload = createAgentModelEvaluationAuthorityPayload(payloadInput);
  const base = Object.freeze({
    ...payload,
    algorithm: 'ed25519' as const,
    attestedPayloadDigest: digestAgentCanonicalValue(payload),
    signature,
  });
  return Object.freeze({
    ...base,
    attestationDigest: digestAgentCanonicalValue(base),
  });
};

const authorityPayloadFromAttestation = (
  value: AgentModelEvaluationAuthorityAttestation
): AgentModelEvaluationAuthorityPayload => {
  const {
    algorithm: _algorithm,
    attestedPayloadDigest: _attestedPayloadDigest,
    signature: _signature,
    attestationDigest: _attestationDigest,
    ...payload
  } = value;
  return payload;
};

const hasAuthorityAttestationShape = (
  value: unknown
): value is AgentModelEvaluationAuthorityAttestation =>
  exactKeys(
    value,
    [
      'format',
      'version',
      'authorityId',
      'keyId',
      'evidenceSetDigest',
      'planDigest',
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
      'endpointSmokeSetDigest',
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
      'workflowName',
      'workflowRunId',
      'workflowRunAttempt',
      'jobId',
      'environmentDigest',
      'repositoryCommit',
      'issuedAt',
      'algorithm',
      'attestedPayloadDigest',
      'signature',
      'attestationDigest',
    ],
    ['reviewLeaseDigest']
  ) &&
  (!Object.hasOwn(value, 'reviewLeaseDigest') ||
    (value as { reviewLeaseDigest?: unknown }).reviewLeaseDigest !== undefined);

const isAuthorityAttestation = (
  value: unknown
): value is AgentModelEvaluationAuthorityAttestation => {
  try {
    if (!hasAuthorityAttestationShape(value)) return false;
    const payload = authorityPayloadFromAttestation(value);
    if (
      value.format !== AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT ||
      value.version !== AGENT_MODEL_EVALUATION_EVIDENCE_VERSION ||
      value.algorithm !== 'ed25519' ||
      !isIdentity(value.authorityId) ||
      !isIdentity(value.keyId) ||
      !isIdentity(value.workflowName) ||
      !isIdentity(value.workflowRunId) ||
      !Number.isSafeInteger(value.workflowRunAttempt) ||
      value.workflowRunAttempt < 1 ||
      !isIdentity(value.jobId) ||
      !/^[0-9a-f]{40}$/u.test(value.repositoryCommit) ||
      !isInstant(value.issuedAt) ||
      !isCanonicalBase64Url(value.signature, 64) ||
      ![
        value.evidenceSetDigest,
        value.planDigest,
        value.capabilityProbeAdmissionSetDigest,
        value.capabilityProbeReferenceReceiptSetDigest,
        value.runtimeFactSourceOwnerRegistrationSetDigest,
        value.optionalCapabilityFactSourceSetDigest,
        value.optionalCapabilityFactAuthoritySetDigest,
        value.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
        value.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
        value.endpointSmokeDispatchIntentSetDigest,
        value.endpointSmokeTransportReceiptSetDigest,
        value.endpointSmokeResultSpoolReceiptSetDigest,
        value.endpointSmokeResultSpoolDispositionReceiptSetDigest,
        value.endpointSmokeValidationFailureReceiptSetDigest,
        value.endpointSmokeSetDigest,
        value.preDispatchFailureReceiptSetDigest,
        value.transportDispatchIntentSetDigest,
        value.transportReceiptSetDigest,
        value.providerResultSpoolReceiptSetDigest,
        value.providerResultSpoolDispositionReceiptSetDigest,
        value.invocationTurnReceiptSetDigest,
        value.invocationTurnSetReceiptSetDigest,
        value.resultSubmissionReceiptSetDigest,
        value.attemptAuthorityOwnerReceiptSetDigest,
        value.controlledRuntimeReceiptSetDigest,
        value.capabilityExecutionReceiptSetDigest,
        value.capabilitySpecificReceiptSetDigest,
        value.providerCapabilityObservationReceiptSetDigest,
        value.verificationAttemptGrantReceiptSetDigest,
        value.validatedHumanReviewArtifactSetDigest,
        value.validatedHumanMetricObservationSetDigest,
        value.reviewRasterScanReceiptSetDigest,
        value.reviewCandidateRefSetDigest,
        value.blindReviewMappingSetDigest,
        value.sourceReceiptSetDigest,
        value.executionReceiptSetDigest,
        value.holdoutExecutionReceiptDigest,
        value.secretCanarySetDigest,
        value.protectedHoldoutCanarySetDigest,
        value.environmentDigest,
        value.attestedPayloadDigest,
        value.attestationDigest,
      ].every(isDigest) ||
      (value.reviewLeaseDigest !== undefined &&
        !isDigest(value.reviewLeaseDigest)) ||
      digestAgentCanonicalValue(payload) !== value.attestedPayloadDigest
    ) {
      return false;
    }
    const { attestationDigest: _attestationDigest, ...base } = value;
    return digestAgentCanonicalValue(base) === value.attestationDigest;
  } catch {
    return false;
  }
};

export const isAgentModelEvaluationAuthorityAttestation =
  isAuthorityAttestation;

export const digestAgentEvaluationSourceReceiptSet = (
  receipts: readonly AgentEvaluationSourceReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentEvaluationExecutionReceiptSet = (
  receipts: readonly AgentEvaluationExecutionReceipt[]
): string =>
  digestAgentCanonicalValue(receipts.map(({ receiptDigest }) => receiptDigest));

export const digestAgentModelEvaluationEvidenceSet = (
  input: EvidenceSetInput
): string =>
  digestAgentCanonicalValue({
    repositoryCommit: input.plan.repositoryCommit,
    planDigest: input.plan.planDigest,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      input.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      input.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
    endpointSmokeDispatchIntentDigests: input.endpointSmokeDispatchIntents.map(
      ({ intentDigest }) => intentDigest
    ),
    endpointSmokeTransportReceiptDigests:
      input.endpointSmokeTransportReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    endpointSmokeResultSpoolReceiptDigests:
      input.endpointSmokeResultSpoolReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    endpointSmokeResultSpoolDispositionReceiptDigests:
      input.endpointSmokeResultSpoolDispositionReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    endpointSmokeValidationFailureReceiptDigests:
      input.endpointSmokeValidationFailureReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    endpointSmokeReceiptDigests: input.endpointSmokeReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    preDispatchFailureReceiptDigests: input.preDispatchFailureReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    transportDispatchIntentDigests: input.transportDispatchIntents.map(
      ({ intentDigest }) => intentDigest
    ),
    transportReceiptDigests: input.transportReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    providerResultSpoolReceiptDigests: input.providerResultSpoolReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    providerResultSpoolDispositionReceiptDigests:
      input.providerResultSpoolDispositionReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    invocationTurnReceiptDigests: input.invocationTurnReceipts.map(
      ({ evidenceDigest }) => evidenceDigest
    ),
    invocationTurnSetReceiptDigests: input.invocationTurnSetReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    resultSubmissionReceiptDigests: input.resultSubmissionReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    attemptAuthorityOwnerReceiptDigests:
      input.attemptAuthorityOwnerReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    controlledRuntimeReceiptDigests: input.controlledRuntimeReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    capabilityExecutionReceiptDigests: input.capabilityExecutionReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    capabilitySpecificReceiptDigests: input.capabilitySpecificReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    providerCapabilityObservationReceiptDigests:
      input.providerCapabilityObservationReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    verificationAttemptGrantReceiptDigests:
      input.verificationAttemptGrantReceipts.map(
        ({ receiptDigest }) => receiptDigest
      ),
    validatedHumanReviewArtifactDigests:
      input.validatedHumanReviewArtifacts.map(
        ({ artifactDigest }) => artifactDigest
      ),
    validatedHumanMetricObservationDigests:
      input.validatedHumanMetricObservations.map(
        ({ observationDigest }) => observationDigest
      ),
    ...(input.reviewLeaseDigest
      ? { reviewLeaseDigest: input.reviewLeaseDigest }
      : {}),
    reviewRasterScanReceiptDigests: input.reviewRasterScanReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    reviewCandidateDigests: input.reviewCandidateRefs.map(
      ({ candidateDigest }) => candidateDigest
    ),
    blindReviewMappingRefs: input.blindReviewMappingRefs,
    sourceReceiptDigests: input.sourceReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    executionReceiptDigests: input.executionReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
    attemptDigests: input.attempts.map(({ attemptDigest }) => attemptDigest),
    checkpointDigests: input.checkpoints.map(
      ({ checkpointDigest }) => checkpointDigest
    ),
    budgetLedgerDigest: input.budgetLedger.ledgerDigest,
    metricReportDigest: input.metricReport.reportDigest,
    graderReportDigest: input.graderReport.reportDigest,
    humanReviewReportDigest: input.humanReviewReport.reportDigest,
    holdoutExecutionReceiptDigest: input.holdoutExecutionReceipt.receiptDigest,
    manifestDigest: input.manifest.manifestDigest,
  });

export const digestAgentModelEvaluationEvidenceBundleRoot = (
  input: Readonly<{
    evidenceSetDigest: string;
    authorityAttestationDigest: string;
  }>
): string =>
  digestAgentCanonicalValue({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_VERSION,
    evidenceSetDigest: input.evidenceSetDigest,
    authorityAttestationDigest: input.authorityAttestationDigest,
  });

export const createAgentModelEvaluationEvidenceBundle = (
  input: EvidenceBundleInput
): AgentModelEvaluationEvidenceBundle => {
  const {
    hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily,
    ...evidenceInput
  } = input;
  const lifecycleBudgetEvidence =
    createAgentModelEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetEvidence(
      input.plan,
      hostedRetrievalRuntimeResourceLifecycleJournalArchiveFamily
    );
  const canonical = Object.freeze({
    format: AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT,
    version: AGENT_MODEL_EVALUATION_EVIDENCE_VERSION,
    ...evidenceInput,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      lifecycleBudgetEvidence.journalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      lifecycleBudgetEvidence.bindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      lifecycleBudgetEvidence.bindingSetDigest,
    endpointSmokeDispatchIntents:
      canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder(
        input.endpointSmokeDispatchIntents
      ),
    endpointSmokeTransportReceipts:
      canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder(
        input.endpointSmokeTransportReceipts
      ),
    endpointSmokeResultSpoolReceipts:
      canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder(
        input.endpointSmokeResultSpoolReceipts
      ),
    endpointSmokeResultSpoolDispositionReceipts:
      canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder(
        input.endpointSmokeResultSpoolDispositionReceipts
      ),
    endpointSmokeValidationFailureReceipts:
      canonicalAgentEvaluationEndpointSmokeValidationFailureReceiptOrder(
        input.endpointSmokeValidationFailureReceipts
      ),
    endpointSmokeReceipts: canonicalAgentEvaluationEndpointSmokeReceiptOrder(
      input.endpointSmokeReceipts
    ),
    preDispatchFailureReceipts:
      canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
        input.preDispatchFailureReceipts
      ),
    transportDispatchIntents:
      canonicalAgentEvaluationAuthenticityOrder.transportDispatchIntents(
        input.transportDispatchIntents
      ),
    transportReceipts:
      canonicalAgentEvaluationAuthenticityOrder.transportReceipts(
        input.transportReceipts
      ),
    providerResultSpoolReceipts:
      canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolReceipts(
        input.providerResultSpoolReceipts
      ),
    providerResultSpoolDispositionReceipts:
      canonicalAgentEvaluationAuthenticityOrder.providerResultSpoolDispositionReceipts(
        input.providerResultSpoolDispositionReceipts
      ),
    invocationTurnReceipts:
      canonicalAgentEvaluationAuthenticityOrder.invocationTurnReceipts(
        input.invocationTurnReceipts
      ),
    invocationTurnSetReceipts:
      canonicalAgentEvaluationAuthenticityOrder.invocationTurnSetReceipts(
        input.invocationTurnSetReceipts
      ),
    resultSubmissionReceipts:
      canonicalAgentEvaluationAuthenticityOrder.resultSubmissionReceipts(
        input.resultSubmissionReceipts
      ),
    attemptAuthorityOwnerReceipts: Object.freeze(
      [...input.attemptAuthorityOwnerReceipts].sort(
        canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder
      )
    ),
    controlledRuntimeReceipts:
      canonicalAgentEvaluationAuthenticityOrder.controlledRuntimeReceipts(
        input.controlledRuntimeReceipts
      ),
    capabilityExecutionReceipts:
      canonicalAgentEvaluationCapabilityExecutionReceiptOrder(
        input.capabilityExecutionReceipts
      ),
    capabilitySpecificReceipts: Object.freeze(
      [...input.capabilitySpecificReceipts].sort(
        canonicalAgentEvaluationCapabilitySpecificReceiptOrder
      )
    ),
    providerCapabilityObservationReceipts: Object.freeze(
      [...input.providerCapabilityObservationReceipts].sort(
        canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder
      )
    ),
    verificationAttemptGrantReceipts:
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        input.verificationAttemptGrantReceipts
      ),
    validatedHumanReviewArtifacts:
      canonicalAgentEvaluationValidatedHumanReviewArtifactOrder(
        input.validatedHumanReviewArtifacts
      ),
    validatedHumanMetricObservations:
      canonicalAgentEvaluationValidatedHumanMetricObservationOrder(
        input.validatedHumanMetricObservations
      ),
    reviewRasterScanReceipts:
      canonicalAgentEvaluationAuthenticityOrder.reviewRasterScanReceipts(
        input.reviewRasterScanReceipts
      ),
    reviewCandidateRefs:
      canonicalAgentEvaluationAuthenticityOrder.reviewCandidateRefs(
        input.reviewCandidateRefs
      ),
    blindReviewMappingRefs:
      canonicalAgentEvaluationAuthenticityOrder.blindReviewMappingRefs(
        input.blindReviewMappingRefs
      ),
    sourceReceipts: Object.freeze(
      [...input.sourceReceipts].sort((left, right) =>
        compareUnicodeCodePoints(left.sourceReceiptId, right.sourceReceiptId)
      )
    ),
    executionReceipts: Object.freeze(
      [...input.executionReceipts].sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      )
    ),
    attempts: Object.freeze(
      [...input.attempts].sort((left, right) =>
        compareUnicodeCodePoints(
          left.descriptor.attemptId,
          right.descriptor.attemptId
        )
      )
    ),
    checkpoints: Object.freeze(
      [...input.checkpoints].sort((left, right) =>
        compareUnicodeCodePoints(left.shardId, right.shardId)
      )
    ),
  });
  const evidenceSetDigest = digestAgentModelEvaluationEvidenceSet(canonical);
  const base = Object.freeze({ ...canonical, evidenceSetDigest });
  return Object.freeze({
    ...base,
    bundleDigest: digestAgentModelEvaluationEvidenceBundleRoot({
      evidenceSetDigest,
      authorityAttestationDigest:
        canonical.authorityAttestation.attestationDigest,
    }),
  });
};

const hasBundleShape = (
  value: unknown
): value is AgentModelEvaluationEvidenceBundle =>
  exactKeys(
    value,
    [
      'format',
      'version',
      'plan',
      'hostedRetrievalRuntimeResourceLifecycleJournalSetDigest',
      'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings',
      'hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest',
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
      'controlledRuntimeReceipts',
      'capabilityExecutionReceipts',
      'capabilitySpecificReceipts',
      'providerCapabilityObservationReceipts',
      'verificationAttemptGrantReceipts',
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
      'evidenceSetDigest',
      'bundleDigest',
    ],
    ['reviewLeaseDigest']
  ) &&
  (!Object.hasOwn(value, 'reviewLeaseDigest') ||
    (value as { reviewLeaseDigest?: unknown }).reviewLeaseDigest !== undefined);

const addDuplicateIssues = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  path: string,
  issues: AgentEvaluationIssue[]
): void => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = identity(value);
    if (seen.has(id)) {
      issues.push(
        issue(
          'AI-8011',
          `${path}/${index}`,
          `Duplicate evidence identity ${id}.`
        )
      );
    }
    seen.add(id);
  });
};

const validateGlobalReceiptIdentityIsolation = (
  bundle: AgentModelEvaluationEvidenceBundle,
  issues: AgentEvaluationIssue[]
): void => {
  const identities = [
    ...bundle.endpointSmokeTransportReceipts.map((receipt, index) => ({
      id: receipt.receiptId,
      path: `/endpointSmokeTransportReceipts/${index}`,
    })),
    ...bundle.endpointSmokeValidationFailureReceipts.map((receipt, index) => ({
      id: receipt.receiptId,
      path: `/endpointSmokeValidationFailureReceipts/${index}`,
    })),
    ...bundle.endpointSmokeReceipts.map((receipt, index) => ({
      id: receipt.receiptId,
      path: `/endpointSmokeReceipts/${index}`,
    })),
    ...bundle.preDispatchFailureReceipts.map((receipt, index) => ({
      id: receipt.failureReceiptId,
      path: `/preDispatchFailureReceipts/${index}`,
    })),
    ...bundle.transportReceipts.map((receipt, index) => ({
      id: receipt.receiptId,
      path: `/transportReceipts/${index}`,
    })),
    ...bundle.capabilityExecutionReceipts.map((receipt, index) => ({
      id: receipt.capabilityExecutionReceiptId,
      path: `/capabilityExecutionReceipts/${index}`,
    })),
    ...bundle.capabilitySpecificReceipts.map((receipt, index) => ({
      id: receipt.receiptId,
      path: `/capabilitySpecificReceipts/${index}`,
    })),
    ...bundle.providerCapabilityObservationReceipts.map((receipt, index) => ({
      id: receipt.observationReceiptId,
      path: `/providerCapabilityObservationReceipts/${index}`,
    })),
    ...bundle.reviewRasterScanReceipts.map((receipt, index) => ({
      id: receipt.scanReceiptId,
      path: `/reviewRasterScanReceipts/${index}`,
    })),
    ...bundle.sourceReceipts.map((receipt, index) => ({
      id: receipt.sourceReceiptId,
      path: `/sourceReceipts/${index}`,
    })),
    ...bundle.executionReceipts.map((receipt, index) => ({
      id: receipt.executionReceiptId,
      path: `/executionReceipts/${index}`,
    })),
    {
      id: bundle.holdoutExecutionReceipt.receiptId,
      path: '/holdoutExecutionReceipt',
    },
  ];
  const seen = new Map<string, string>();
  for (const { id, path } of identities) {
    const prior = seen.get(id);
    if (prior !== undefined) {
      issues.push(
        issue('AI-8011', path, `Receipt identity ${id} collides with ${prior}.`)
      );
    } else {
      seen.set(id, path);
    }
  }
};

const isCanonicallyOrdered = <T>(
  values: readonly T[],
  identity: (value: T) => string
): boolean =>
  values.every(
    (value, index) =>
      index === 0 ||
      compareUnicodeCodePoints(identity(values[index - 1]!), identity(value)) <
        0
  );

const attemptRef = (attempt: AgentModelEvaluationAttempt) =>
  Object.freeze({
    attemptId: attempt.descriptor.attemptId,
    descriptorDigest: attempt.descriptor.descriptorDigest,
    attemptDigest: attempt.attemptDigest,
  });

const validateSourceReceipts = (
  bundle: AgentModelEvaluationEvidenceBundle,
  issues: AgentEvaluationIssue[]
): Readonly<{
  byReceiptDigest: ReadonlyMap<string, AgentEvaluationSourceReceipt>;
  pricingBySnapshotDigest: ReadonlyMap<string, AgentEvaluationSourceReceipt>;
}> => {
  addDuplicateIssues(
    bundle.sourceReceipts,
    ({ sourceReceiptId }) => sourceReceiptId,
    '/sourceReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.sourceReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/sourceReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.sourceReceipts,
    ({ sourceContentDigest }) => sourceContentDigest,
    '/sourceReceipts',
    issues
  );
  const allowedProviders = new Set([
    ...bundle.plan.providerConfigurations.map(
      ({ providerConfigurationId }) => providerConfigurationId
    ),
    ...bundle.plan.endpointSmokeTargets.map(
      ({ providerConfigurationId }) => providerConfigurationId
    ),
  ]);
  const allowedModels = new Set([
    ...bundle.plan.modelConfigurations.map(
      ({ lineageDigest }) => lineageDigest
    ),
    ...bundle.plan.endpointSmokeTargets.map(
      ({ modelLineageDigest }) => modelLineageDigest
    ),
  ]);
  for (const [index, receipt] of bundle.sourceReceipts.entries()) {
    if (
      !isSourceReceipt(receipt) ||
      receipt.planDigest !== bundle.plan.planDigest ||
      receipt.repositoryCommit !== bundle.plan.repositoryCommit ||
      !allowedProviders.has(receipt.providerConfigurationId) ||
      (receipt.modelLineageDigest !== undefined &&
        !allowedModels.has(receipt.modelLineageDigest)) ||
      (receipt.sourceKind !== 'pricing-snapshot' &&
        Date.parse(receipt.observedAt) < Date.parse(bundle.plan.plannedAt)) ||
      Date.parse(receipt.observedAt) > Date.parse(bundle.manifest.completedAt)
    ) {
      issues.push(
        issue(
          'AI-8011',
          `/sourceReceipts/${index}`,
          'Source receipt is malformed or drifted from its plan, provider, model, observation time, or commit binding.'
        )
      );
    }
  }
  if (
    !hasExactAgentEvaluationPlanPricingSourceReceiptCoverage(
      bundle.sourceReceipts,
      {
        planDigest: bundle.plan.planDigest,
        repositoryCommit: bundle.plan.repositoryCommit,
        targets: bundle.plan.endpointSmokeTargets,
      }
    )
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/sourceReceipts',
        'Pricing-snapshot receipts must exactly cover the frozen endpoint pricing authorities with one canonical plan-level singleton per authority.'
      )
    );
  }
  return Object.freeze({
    byReceiptDigest: new Map(
      bundle.sourceReceipts.map((receipt) => [receipt.receiptDigest, receipt])
    ),
    pricingBySnapshotDigest: new Map(
      bundle.sourceReceipts
        .filter(
          (receipt) =>
            receipt.sourceKind === 'pricing-snapshot' &&
            receipt.pricingSnapshot !== undefined
        )
        .map((receipt) => [receipt.pricingSnapshot!.snapshotDigest, receipt])
    ),
  });
};

const sourceMatchesUsage = (
  source: AgentEvaluationSourceReceipt | undefined,
  input: Readonly<{
    usage: AgentUsageVector;
    providerConfigurationId: string;
    modelLineageDigest?: string;
    providerRequestId?: string;
    executionFailureAuthorityReceiptDigest?: string;
  }>
): boolean =>
  source !== undefined &&
  source.sourceKind === 'provider-reported-usage' &&
  source.providerConfigurationId === input.providerConfigurationId &&
  source.modelLineageDigest === input.modelLineageDigest &&
  source.providerRequestId === input.providerRequestId &&
  source.executionFailureAuthorityReceiptDigest ===
    input.executionFailureAuthorityReceiptDigest &&
  source.inputUsageDigest === input.usage.vectorDigest &&
  input.usage.amounts.every(
    ({ sourceDigest }) => sourceDigest === source.sourceContentDigest
  );

const sourceMatchesCost = (
  source: AgentEvaluationSourceReceipt | undefined,
  input: Readonly<{
    usage: AgentUsageVector;
    cost: readonly AgentCost[];
    providerConfigurationId: string;
    modelLineageDigest?: string;
    providerRequestId?: string;
    executionFailureAuthorityReceiptDigest?: string;
    pricingSnapshotRef?: string;
  }>,
  pricingBySnapshotDigest: ReadonlyMap<string, AgentEvaluationSourceReceipt>,
  usedSourceReceiptDigests: Set<string>
): boolean => {
  if (
    source === undefined ||
    !['provider-reported-cost', 'cost-calculation'].includes(
      source.sourceKind
    ) ||
    source.providerConfigurationId !== input.providerConfigurationId ||
    source.modelLineageDigest !== input.modelLineageDigest ||
    source.providerRequestId !== input.providerRequestId ||
    source.executionFailureAuthorityReceiptDigest !==
      input.executionFailureAuthorityReceiptDigest ||
    source.outputCostDigest !== digestAgentEvaluationCostValues(input.cost) ||
    !input.cost.every(
      ({ sourceDigest }) => sourceDigest === source.sourceContentDigest
    )
  ) {
    return false;
  }
  if (source.sourceKind === 'provider-reported-cost') return true;
  if (
    source.inputUsageDigest !== input.usage.vectorDigest ||
    !source.pricingSnapshot ||
    input.pricingSnapshotRef !== source.pricingSnapshot.pricingSnapshotId
  ) {
    return false;
  }
  const pricingSource = pricingBySnapshotDigest.get(
    source.pricingSnapshot.snapshotDigest
  );
  if (
    !pricingSource ||
    pricingSource.providerConfigurationId !== input.providerConfigurationId ||
    pricingSource.modelLineageDigest !== input.modelLineageDigest ||
    !sameCanonicalJson(pricingSource.pricingSnapshot, source.pricingSnapshot)
  ) {
    return false;
  }
  usedSourceReceiptDigests.add(pricingSource.receiptDigest);
  return true;
};

const hasAuthoritativeUsageSources = (usage: AgentUsageVector): boolean =>
  usage.amounts.length > 0 &&
  usage.amounts.every(({ sourceDigest }) =>
    isAgentCanonicalDigest(sourceDigest)
  );

const hasAuthoritativeCostSources = (cost: readonly AgentCost[]): boolean =>
  cost.length > 0 &&
  cost.every(({ sourceDigest }) => isAgentCanonicalDigest(sourceDigest));

const validateExecutionReceipts = (
  bundle: AgentModelEvaluationEvidenceBundle,
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[],
  issues: AgentEvaluationIssue[]
): void => {
  addDuplicateIssues(
    bundle.executionReceipts,
    ({ attemptId }) => attemptId,
    '/executionReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.executionReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/executionReceipts',
    issues
  );
  const descriptorsById = new Map(
    descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  const attemptsById = new Map(
    bundle.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const turnSetsByAttemptId = new Map(
    bundle.invocationTurnSetReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  const casesById = new Map(
    bundle.plan.concreteCases.map((concreteCase) => [
      concreteCase.caseId,
      concreteCase,
    ])
  );
  const targetsById = new Map(
    bundle.plan.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  for (const [index, receipt] of bundle.executionReceipts.entries()) {
    const descriptor = descriptorsById.get(receipt.attemptId);
    const attempt = attemptsById.get(receipt.attemptId);
    const turnSet = turnSetsByAttemptId.get(receipt.attemptId);
    const concreteCase = descriptor
      ? casesById.get(descriptor.caseId)
      : undefined;
    const target = descriptor
      ? targetsById.get(descriptor.targetId)
      : undefined;
    let executionRequirement:
      AgentModelEvaluationCaseExecutionRequirement | undefined;
    try {
      executionRequirement =
        concreteCase && target
          ? resolveAgentModelEvaluationCaseExecutionRequirement(
              concreteCase,
              target
            )
          : undefined;
    } catch {
      executionRequirement = undefined;
    }
    const capabilityUnavailableCompletion =
      turnSet?.terminalStatus === 'completed' &&
      turnSet.terminalZeroToolCallDisposition === 'grade-unavailable';
    if (
      !isExecutionReceipt(receipt) ||
      !descriptor ||
      !attempt ||
      !concreteCase ||
      !target ||
      !executionRequirement ||
      !turnSet ||
      receipt.planDigest !== bundle.plan.planDigest ||
      receipt.repositoryCommit !== bundle.plan.repositoryCommit ||
      receipt.descriptorDigest !== descriptor.descriptorDigest ||
      receipt.modelInvocations !== turnSet.dispatchedInvocationCount ||
      receipt.elapsedMs !==
        Date.parse(attempt.completedAt) - Date.parse(attempt.startedAt) ||
      (attempt.status === 'completed' &&
        !capabilityUnavailableCompletion &&
        receipt.toolCalls < executionRequirement.minimumToolCalls) ||
      (attempt.status === 'completed' &&
        !capabilityUnavailableCompletion &&
        receipt.repairRounds < executionRequirement.minimumRepairRounds) ||
      (attempt.status === 'completed' &&
        !capabilityUnavailableCompletion &&
        receipt.transactions < executionRequirement.minimumTransactions) ||
      (attempt.status === 'completed' &&
        !capabilityUnavailableCompletion &&
        executionRequirement.verificationClosureRequired &&
        receipt.verificationClosureDigest === undefined)
    ) {
      issues.push(
        issue(
          'AI-8011',
          `/executionReceipts/${index}`,
          'Execution receipt drifted from its attempt, transport tries, case-required tools/repair/transaction/Closure, elapsed time, or commit binding.'
        )
      );
    }
  }
  if (bundle.executionReceipts.length !== descriptors.length) {
    issues.push(
      issue(
        'AI-8011',
        '/executionReceipts',
        'Execution receipts must cover every planned attempt exactly once.'
      )
    );
  }
};

const validateRuntimeOptions = (
  bundle: AgentModelEvaluationEvidenceBundle,
  options: AgentModelEvaluationEvidenceValidationOptions,
  issues: AgentEvaluationIssue[]
): void => {
  if (
    !options.expectedRepositoryCommit ||
    !/^[0-9a-f]{40}$/u.test(options.expectedRepositoryCommit)
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/expectedRepositoryCommit',
        'Strict evidence admission requires an exact externally supplied repository commit.'
      )
    );
  } else if (
    bundle.plan.repositoryCommit !== options.expectedRepositoryCommit
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/plan/repositoryCommit',
        'Evaluation evidence belongs to a different repository commit.'
      )
    );
  }
  if (!options.now || !isInstant(options.now)) {
    issues.push(
      issue(
        'AI-8011',
        '/now',
        'Strict evidence admission requires a canonical current instant.'
      )
    );
  } else if (
    Date.parse(options.now) >= Date.parse(bundle.plan.expiresAt) ||
    Date.parse(options.now) >= Date.parse(bundle.manifest.expiresAt)
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/manifest/expiresAt',
        'Evaluation evidence has expired.'
      )
    );
  }
  for (const [path, values] of [
    ['/secretCanaries', options.secretCanaries],
    ['/protectedHoldoutCanaries', options.protectedHoldoutCanaries],
  ] as const) {
    if (!values || values.length === 0 || values.some((value) => !value)) {
      issues.push(
        issue(
          'AI-8011',
          path,
          'Strict evidence admission requires a non-empty registered canary set.'
        )
      );
    }
  }
};

const validateReceipts = (
  bundle: AgentModelEvaluationEvidenceBundle,
  sourceReceipts: ReturnType<typeof validateSourceReceipts>,
  issues: AgentEvaluationIssue[]
): void => {
  const plan = bundle.plan;
  const usedSourceReceiptDigests = new Set(
    bundle.sourceReceipts
      .filter(({ sourceKind }) => sourceKind === 'pricing-snapshot')
      .map(({ receiptDigest }) => receiptDigest)
  );
  for (const [index, turn] of bundle.invocationTurnReceipts.entries()) {
    if (!turn.invocationReceipt) continue;
    const usageSource = turn.usageSourceReceiptDigest
      ? sourceReceipts.byReceiptDigest.get(turn.usageSourceReceiptDigest)
      : undefined;
    const costSource = turn.costSourceReceiptDigest
      ? sourceReceipts.byReceiptDigest.get(turn.costSourceReceiptDigest)
      : undefined;
    const provider = turn.invocationReceipt.provider;
    const model = turn.invocationReceipt.model;
    const failureAuthority = turn.executionFailureAuthorityReceiptDigest;
    const usageKnown = hasAuthoritativeUsageSources(
      turn.invocationReceipt.usage
    );
    const costKnown = hasAuthoritativeCostSources(turn.invocationReceipt.cost);
    if (
      (usageKnown &&
        (!turn.usageSourceReceiptDigest ||
          !sourceMatchesUsage(usageSource, {
            usage: turn.invocationReceipt.usage,
            providerConfigurationId: provider.providerConfigurationId,
            modelLineageDigest: model.lineageDigest,
            ...(turn.providerRequestId
              ? { providerRequestId: turn.providerRequestId }
              : { executionFailureAuthorityReceiptDigest: failureAuthority }),
          }))) ||
      (costKnown &&
        (!turn.costSourceReceiptDigest ||
          !sourceMatchesCost(
            costSource,
            {
              usage: turn.invocationReceipt.usage,
              cost: turn.invocationReceipt.cost,
              providerConfigurationId: provider.providerConfigurationId,
              modelLineageDigest: model.lineageDigest,
              ...(turn.providerRequestId
                ? { providerRequestId: turn.providerRequestId }
                : {
                    executionFailureAuthorityReceiptDigest: failureAuthority,
                  }),
              ...(turn.invocationReceipt.pricingSnapshotRef
                ? {
                    pricingSnapshotRef:
                      turn.invocationReceipt.pricingSnapshotRef,
                  }
                : {}),
            },
            sourceReceipts.pricingBySnapshotDigest,
            usedSourceReceiptDigests
          )))
    ) {
      issues.push(
        issue(
          'AI-8011',
          `/invocationTurnReceipts/${index}`,
          'Invocation turn usage or cost source authority drifted.'
        )
      );
    } else {
      if (turn.usageSourceReceiptDigest) {
        usedSourceReceiptDigests.add(turn.usageSourceReceiptDigest);
      }
      if (turn.costSourceReceiptDigest) {
        usedSourceReceiptDigests.add(turn.costSourceReceiptDigest);
      }
    }
  }

  const smokeTargets = new Map(
    plan.endpointSmokeTargets.map((value) => [value.smokeTargetId, value])
  );
  addDuplicateIssues(
    bundle.endpointSmokeDispatchIntents,
    ({ smokeTargetId }) => smokeTargetId,
    '/endpointSmokeDispatchIntents',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeTransportReceipts,
    ({ invocationId }) => invocationId,
    '/endpointSmokeTransportReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeResultSpoolReceipts,
    ({ smokeTargetId }) => smokeTargetId,
    '/endpointSmokeResultSpoolReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeResultSpoolDispositionReceipts,
    ({ smokeTargetId }) => smokeTargetId,
    '/endpointSmokeResultSpoolDispositionReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeValidationFailureReceipts,
    ({ smokeTargetId }) => smokeTargetId,
    '/endpointSmokeValidationFailureReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeValidationFailureReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/endpointSmokeValidationFailureReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeReceipts,
    ({ smokeTargetId }) => smokeTargetId,
    '/endpointSmokeReceipts',
    issues
  );
  addDuplicateIssues(
    bundle.endpointSmokeReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/endpointSmokeReceipts',
    issues
  );
  const smokeIntentsByTarget = new Map(
    bundle.endpointSmokeDispatchIntents.map((intent) => [
      intent.smokeTargetId,
      intent,
    ])
  );
  const smokeTransportsByInvocation = new Map(
    bundle.endpointSmokeTransportReceipts.map((receipt) => [
      receipt.invocationId,
      receipt,
    ])
  );
  const smokeSpoolsByTarget = new Map(
    bundle.endpointSmokeResultSpoolReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const smokeDispositionsByTarget = new Map(
    bundle.endpointSmokeResultSpoolDispositionReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const smokeValidationFailuresByTarget = new Map(
    bundle.endpointSmokeValidationFailureReceipts.map((receipt) => [
      receipt.smokeTargetId,
      receipt,
    ])
  );
  const budgetReservationsById = new Map(
    (isAgentBudgetLedgerState(bundle.budgetLedger)
      ? bundle.budgetLedger.reservations
      : []
    ).map((reservation) => [reservation.reservationId, reservation])
  );
  for (const [index, receipt] of bundle.endpointSmokeReceipts.entries()) {
    const path = `/endpointSmokeReceipts/${index}`;
    const target = smokeTargets.get(receipt.smokeTargetId);
    const intent = smokeIntentsByTarget.get(receipt.smokeTargetId);
    const transport = intent
      ? smokeTransportsByInvocation.get(intent.invocationId)
      : undefined;
    const spool = smokeSpoolsByTarget.get(receipt.smokeTargetId);
    const disposition = smokeDispositionsByTarget.get(receipt.smokeTargetId);
    const validationFailure = smokeValidationFailuresByTarget.get(
      receipt.smokeTargetId
    );
    const reservation = budgetReservationsById.get(receipt.budgetReservationId);
    const budgetAuthorityInvalid =
      !matchAgentEvaluationEndpointSmokeBudgetAuthority(receipt, reservation);
    const hasResponse = receipt.providerRequestId !== undefined;
    const hasAccounting = receipt.usage !== undefined;
    const authorityFactsInvalid =
      !target ||
      !intent ||
      !transport ||
      !matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        target,
        intent,
        transport,
        ...(spool ? { spool } : {}),
        ...(disposition ? { disposition } : {}),
        ...(validationFailure ? { validationFailure } : {}),
        receipt,
      });
    let accountingBranchInvalid = false;
    if (hasAccounting) {
      const usage = receipt.usage!;
      const cost = receipt.cost!;
      const usageSourceReceiptDigest = receipt.usageSourceReceiptDigest!;
      const costSourceReceiptDigest = receipt.costSourceReceiptDigest!;
      const usageSource = sourceReceipts.byReceiptDigest.get(
        usageSourceReceiptDigest
      );
      const costSource = sourceReceipts.byReceiptDigest.get(
        costSourceReceiptDigest
      );
      accountingBranchInvalid =
        !hasResponse ||
        !sourceMatchesUsage(usageSource, {
          usage,
          providerConfigurationId: receipt.providerConfigurationId,
          modelLineageDigest: receipt.modelLineageDigest,
          providerRequestId: receipt.providerRequestId,
        }) ||
        !sourceMatchesCost(
          costSource,
          {
            usage,
            cost,
            providerConfigurationId: receipt.providerConfigurationId,
            modelLineageDigest: receipt.modelLineageDigest,
            providerRequestId: receipt.providerRequestId,
            ...(receipt.pricingSnapshotRef
              ? { pricingSnapshotRef: receipt.pricingSnapshotRef }
              : {}),
          },
          sourceReceipts.pricingBySnapshotDigest,
          usedSourceReceiptDigests
        );
      if (!accountingBranchInvalid) {
        usedSourceReceiptDigests.add(usageSourceReceiptDigest);
        usedSourceReceiptDigests.add(costSourceReceiptDigest);
      }
    }
    if (
      authorityFactsInvalid ||
      budgetAuthorityInvalid ||
      accountingBranchInvalid ||
      (receipt.outcome === 'passed' && (!hasResponse || !hasAccounting))
    ) {
      issues.push(
        issue(
          'AI-8011',
          path,
          'Endpoint smoke authority facts drifted from the target, transport, response spool, accounting source, or commit binding.'
        )
      );
    }
  }
  if (bundle.endpointSmokeReceipts.length !== smokeTargets.size) {
    issues.push(
      issue(
        'AI-8011',
        '/endpointSmokeReceipts',
        'Endpoint smoke receipts must cover every planned endpoint exactly once.'
      )
    );
  }
  if (
    bundle.endpointSmokeDispatchIntents.length !== smokeTargets.size ||
    bundle.endpointSmokeTransportReceipts.length !== smokeTargets.size ||
    bundle.endpointSmokeResultSpoolReceipts.length !==
      bundle.endpointSmokeReceipts.filter(
        ({ spoolReceiptDigest }) => spoolReceiptDigest !== undefined
      ).length ||
    bundle.endpointSmokeResultSpoolDispositionReceipts.length !==
      bundle.endpointSmokeResultSpoolReceipts.length ||
    bundle.endpointSmokeValidationFailureReceipts.length !==
      bundle.endpointSmokeReceipts.filter(
        (receipt) =>
          receipt.outcome === 'failed' &&
          receipt.failureCategory === 'provider-response-invalid'
      ).length
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/endpointSmokeReceipts',
        'Endpoint smoke authority facts must cover every planned endpoint exactly once.'
      )
    );
  }
  const attemptTransportIdentities = new Set(
    bundle.transportReceipts.flatMap((receipt) => [
      `invocation:${receipt.invocationId}`,
      `receipt-id:${receipt.receiptId}`,
      `receipt-digest:${receipt.receiptDigest}`,
    ])
  );
  if (
    bundle.endpointSmokeTransportReceipts.some((receipt) =>
      [
        `invocation:${receipt.invocationId}`,
        `receipt-id:${receipt.receiptId}`,
        `receipt-digest:${receipt.receiptDigest}`,
      ].some((identity) => attemptTransportIdentities.has(identity))
    )
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/endpointSmokeTransportReceipts',
        'Endpoint smoke and attempt transport identities must be disjoint.'
      )
    );
  }
  const providerRequestIds = [
    ...bundle.invocationTurnReceipts
      .map(({ invocationReceipt, providerRequestId }) =>
        providerRequestId && invocationReceipt
          ? `${invocationReceipt.provider.providerConfigurationId}\u0000${providerRequestId}`
          : undefined
      )
      .filter((value): value is string => value !== undefined),
    ...bundle.endpointSmokeReceipts.flatMap(
      ({ providerConfigurationId, providerRequestId }) =>
        providerRequestId
          ? [`${providerConfigurationId}\u0000${providerRequestId}`]
          : []
    ),
  ];
  if (new Set(providerRequestIds).size !== providerRequestIds.length) {
    issues.push(
      issue(
        'AI-8011',
        '/providerRequestId',
        'Provider request identities must be unique within each provider configuration.'
      )
    );
  }
  const failureAuthorityIds = bundle.invocationTurnReceipts
    .map(
      ({ executionFailureAuthorityReceiptDigest }) =>
        executionFailureAuthorityReceiptDigest
    )
    .filter((value): value is string => value !== undefined);
  if (new Set(failureAuthorityIds).size !== failureAuthorityIds.length) {
    issues.push(
      issue(
        'AI-8011',
        '/executionFailureAuthorityReceiptDigest',
        'Pre-request execution failure authority receipts must be unique.'
      )
    );
  }
  if (usedSourceReceiptDigests.size !== bundle.sourceReceipts.length) {
    issues.push(
      issue(
        'AI-8011',
        '/sourceReceipts',
        'Every source receipt must be uniquely referenced by an invocation, endpoint smoke, or cost calculation.'
      )
    );
  }
};

const validateAttemptsAndCheckpoints = (
  bundle: AgentModelEvaluationEvidenceBundle,
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[],
  issues: AgentEvaluationIssue[]
): void => {
  const descriptorById = new Map(
    descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  addDuplicateIssues(
    bundle.attempts,
    ({ descriptor }) => descriptor.attemptId,
    '/attempts',
    issues
  );
  addDuplicateIssues(
    bundle.attempts,
    ({ independentRunId }) => independentRunId,
    '/attempts',
    issues
  );
  for (const [index, attempt] of bundle.attempts.entries()) {
    const planned = descriptorById.get(attempt.descriptor.attemptId);
    if (
      !isAgentModelEvaluationAttempt(attempt) ||
      !planned ||
      !sameCanonicalJson(attempt.descriptor, planned) ||
      (attempt.status === 'completed' &&
        attempt.responseDigest === undefined) ||
      attempt.metricObservations.length === 0 ||
      (attempt.outcome === 'passed' &&
        attempt.metricObservations.some(({ verdict }) => verdict !== 'passed'))
    ) {
      issues.push(
        issue(
          'AI-8011',
          `/attempts/${index}`,
          'A satisfied evidence bundle requires one canonical, transport-receipted attempt per descriptor with exact terminal outcome and metric semantics.'
        )
      );
    }
  }
  if (bundle.attempts.length !== descriptors.length) {
    issues.push(
      issue(
        'AI-8011',
        '/attempts',
        'Attempts must cover the planned descriptor set exactly once.'
      )
    );
  }

  const descriptorsByShard = new Map<
    string,
    AgentModelEvaluationAttemptDescriptor[]
  >();
  for (const descriptor of descriptors) {
    const values = descriptorsByShard.get(descriptor.shardId) ?? [];
    values.push(descriptor);
    descriptorsByShard.set(descriptor.shardId, values);
  }
  const attemptById = new Map(
    bundle.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  addDuplicateIssues(
    bundle.checkpoints,
    ({ shardId }) => shardId,
    '/checkpoints',
    issues
  );
  for (const [index, checkpoint] of bundle.checkpoints.entries()) {
    const expectedDescriptors = descriptorsByShard.get(checkpoint.shardId);
    const expectedRefs = expectedDescriptors
      ?.map((descriptor) => attemptRef(attemptById.get(descriptor.attemptId)!))
      .sort((left, right) =>
        compareUnicodeCodePoints(left.attemptId, right.attemptId)
      );
    if (
      !isAgentEvaluationShardCheckpoint(checkpoint) ||
      !expectedRefs ||
      checkpoint.planDigest !== bundle.plan.planDigest ||
      checkpoint.state !== 'completed' ||
      checkpoint.missingAttemptRefs.length !== 0 ||
      !sameCanonicalJson(checkpoint.completedAttemptRefs, expectedRefs) ||
      !sameCanonicalJson(checkpoint.budgetLedger, bundle.budgetLedger)
    ) {
      issues.push(
        issue(
          'AI-8011',
          `/checkpoints/${index}`,
          'Completed shard checkpoint coverage or budget-ledger binding drifted.'
        )
      );
    }
  }
  if (bundle.checkpoints.length !== descriptorsByShard.size) {
    issues.push(
      issue(
        'AI-8011',
        '/checkpoints',
        'Completed checkpoints must cover every evaluation shard exactly once.'
      )
    );
  }
};

const hostedLifecycleBudgetUsageFromPlan = (
  plan: AgentModelEvaluationPlan
): AgentUsageVector => {
  const floor = resolveAgentModelEvaluationHostedRuntimeBudgetFloor(plan);
  if (floor.hostedLifecycleToolCallCount === 0) {
    return createAgentUsageVector([]);
  }
  return createAgentUsageVector([
    Object.freeze({
      unit: 'hosted-tool-call' as const,
      logicalAmount: String(floor.hostedLifecycleToolCallCount),
      billableAmount: String(floor.hostedLifecycleToolCallCount),
      confidence: 'estimated' as const,
    }),
    Object.freeze({
      unit: 'provider-upload-byte' as const,
      logicalAmount: String(floor.providerUploadBytes),
      billableAmount: String(floor.providerUploadBytes),
      confidence: 'measured' as const,
    }),
    Object.freeze({
      unit: 'provider-storage-byte-second' as const,
      logicalAmount: String(floor.providerStorageByteSeconds),
      billableAmount: String(floor.providerStorageByteSeconds),
      confidence: 'estimated' as const,
    }),
  ]);
};

const validateHostedLifecycleBudgetClosures = (
  bundle: AgentModelEvaluationEvidenceBundle,
  issues: AgentEvaluationIssue[],
  requireReleaseQualification: boolean
): AgentUsageVector => {
  let expectations: readonly HostedLifecycleBudgetExpectation[];
  let expectedUsage: AgentUsageVector;
  try {
    expectations = resolveHostedLifecycleBudgetExpectations(bundle.plan);
    expectedUsage = hostedLifecycleBudgetUsageFromPlan(bundle.plan);
  } catch (caught) {
    issues.push(
      issue(
        'AI-6013',
        '/hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings',
        caught instanceof Error
          ? caught.message
          : 'Hosted lifecycle budget plan binding is invalid.'
      )
    );
    return createAgentUsageVector([]);
  }
  const bindings =
    bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings;
  const emptyJournalSetDigest = digestAgentCanonicalValue({
    recordDigests: [],
  });
  const reservationById = new Map(
    (isAgentBudgetLedgerState(bundle.budgetLedger)
      ? bundle.budgetLedger.reservations
      : []
    ).map((reservation) => [reservation.reservationId, reservation])
  );
  const namespaces = new Set<string>();
  const registrationRequestDigests = new Set<string>();
  const registrationIntentDigests = new Set<string>();
  const createArchiveRecordDigests = new Set<string>();
  const projectionDigests = new Set<string>();
  const reservationIds = new Set<string>();
  const reservationAuthorityDigests = new Set<string>();
  const ledgerRevisions = new Set<number>();
  let invalid =
    bindings.length !== expectations.length ||
    bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest !==
      digestAgentEvaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSet(
        bindings
      ) ||
    (expectations.length === 0
      ? bundle.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest !==
        emptyJournalSetDigest
      : bundle.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest ===
        emptyJournalSetDigest);
  for (const [index, binding] of bindings.entries()) {
    const expectation = expectations[index];
    if (
      !expectation ||
      !exactKeys(binding, [
        'registrationRequestDigest',
        'registrationIntentDigest',
        'createJournalArchiveRecordDigest',
        'projection',
        'projectionDigest',
      ]) ||
      !isAgentCanonicalDigest(binding.registrationRequestDigest) ||
      !isAgentCanonicalDigest(binding.registrationIntentDigest) ||
      !isAgentCanonicalDigest(binding.createJournalArchiveRecordDigest) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection(
        binding.projection
      ) ||
      binding.projectionDigest !== binding.projection.projectionDigest ||
      binding.registrationIntentDigest !==
        expectation.registrationIntentDigest ||
      !sameCanonicalJson(binding.projection.demand, expectation.demand) ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleBudgetMaterial(
        binding.projection,
        expectation.registrationIntent,
        expectation.publicResourceMaterial
      )
    ) {
      invalid = true;
      continue;
    }
    const projection = binding.projection;
    const authority = projection.budgetReservationAuthority;
    const reservation = reservationById.get(projection.reservationId);
    namespaces.add(authority.namespaceId);
    registrationRequestDigests.add(binding.registrationRequestDigest);
    registrationIntentDigests.add(binding.registrationIntentDigest);
    createArchiveRecordDigests.add(binding.createJournalArchiveRecordDigest);
    projectionDigests.add(binding.projectionDigest);
    reservationIds.add(projection.reservationId);
    reservationAuthorityDigests.add(
      projection.budgetReservationAuthorityDigest
    );
    ledgerRevisions.add(projection.ledgerRevision);
    if (
      authority.planDigest !== bundle.plan.planDigest ||
      authority.reservePolicyDigest !==
        bundle.plan.budget.reservePolicyDigest ||
      authority.budgetDigest !== bundle.plan.budget.budgetDigest ||
      projection.ledgerRevision < 1 ||
      (isAgentBudgetLedgerState(bundle.budgetLedger) &&
        projection.ledgerRevision > bundle.budgetLedger.revision) ||
      !reservation ||
      reservation.status !== 'settled' ||
      !reservation.settlement ||
      reservation.demandDigest !== projection.demandDigest ||
      reservation.reservedAt !== projection.reservedAt ||
      !sameCanonicalJson(reservation.demand, projection.demand) ||
      !sameCanonicalJson(reservation.settlement, projection.settlement) ||
      (requireReleaseQualification &&
        (projection.closureKind !== 'settled' ||
          projection.settlement.requiresReconciliation))
    ) {
      invalid = true;
    }
  }
  const exactCount = expectations.length;
  if (
    (exactCount > 0 &&
      [
        registrationRequestDigests.size,
        registrationIntentDigests.size,
        createArchiveRecordDigests.size,
        projectionDigests.size,
        reservationIds.size,
        reservationAuthorityDigests.size,
        ledgerRevisions.size,
      ].some(
        (count) => count !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
      )) ||
    (exactCount > 0 && namespaces.size !== 1) ||
    !sameCanonicalJson(
      createAgentUsageVector(
        bindings.flatMap(({ projection }) => projection.demand.usage.amounts)
      ),
      expectedUsage
    )
  ) {
    invalid = true;
  }
  if (invalid) {
    issues.push(
      issue(
        'AI-6013',
        '/hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings',
        requireReleaseQualification
          ? 'Release evidence requires the signed exact-four lifecycle creation closures to match the plan material, archive membership digests, and fully reconciled ledger reservations.'
          : 'Authenticity evidence lifecycle creation closures must match the plan material, archive membership digests, and ledger reservations.'
      )
    );
  }
  return expectedUsage;
};

const validateBudgetLedger = (
  bundle: AgentModelEvaluationEvidenceBundle,
  issues: AgentEvaluationIssue[],
  requireReleaseQualification: boolean,
  hostedLifecycleBudgetUsage: AgentUsageVector
): void => {
  if (!isAgentBudgetLedgerState(bundle.budgetLedger)) {
    issues.push(
      issue(
        'AI-6013',
        '/budgetLedger',
        'Evidence budget ledger must be canonical.'
      )
    );
    return;
  }
  const hasUnreconciledSettlement = bundle.budgetLedger.reservations.some(
    ({ settlement }) => settlement?.requiresReconciliation === true
  );
  if (
    !sameCanonicalJson(bundle.budgetLedger.budget, bundle.plan.budget.budget) ||
    bundle.budgetLedger.reservations.length === 0 ||
    bundle.budgetLedger.reservations.some(
      ({ status, settlement }) => status !== 'settled' || !settlement
    ) ||
    (requireReleaseQualification && hasUnreconciledSettlement)
  ) {
    issues.push(
      issue(
        'AI-6013',
        '/budgetLedger',
        requireReleaseQualification
          ? 'Release evidence budget ledger must be canonical, fully settled, reconciled, and use the plan budget.'
          : 'Authenticity evidence budget ledger must be canonical, fully settled, and use the plan budget.'
      )
    );
    return;
  }
  if (!requireReleaseQualification && hasUnreconciledSettlement) return;
  const utilization = selectAgentBudgetUtilization(bundle.budgetLedger);
  const expectedUsage = createAgentUsageVector([
    ...bundle.attempts.flatMap(({ usage }) => usage.amounts),
    ...bundle.endpointSmokeReceipts.flatMap((receipt) =>
      receipt.usage ? receipt.usage.amounts : []
    ),
    ...hostedLifecycleBudgetUsage.amounts,
  ]);
  const expectedCost = normalizeAgentCosts([
    ...bundle.attempts.flatMap(({ cost }) => cost),
    ...bundle.endpointSmokeReceipts.flatMap((receipt) =>
      receipt.cost ? receipt.cost : []
    ),
  ]);
  const usageAccountingView = (usage: AgentUsageVector): AgentUsageVector =>
    createAgentUsageVector(
      usage.amounts.map(({ sourceDigest: _sourceDigest, ...amount }) => amount)
    );
  const costAccountingView = (
    cost: readonly AgentCost[]
  ): readonly AgentCost[] =>
    normalizeAgentCosts(
      cost.map(({ sourceDigest: _sourceDigest, ...entry }) => entry)
    );
  const executionTotals = bundle.executionReceipts.reduce(
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
  const smokeElapsedMs = bundle.endpointSmokeReceipts.reduce(
    (total, receipt) =>
      total + Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt),
    0
  );
  if (
    !sameCanonicalJson(
      usageAccountingView(utilization.usage),
      usageAccountingView(expectedUsage)
    ) ||
    !sameCanonicalJson(
      costAccountingView(utilization.cost),
      costAccountingView(expectedCost)
    ) ||
    utilization.modelInvocations !==
      executionTotals.modelInvocations +
        bundle.endpointSmokeTransportReceipts.filter(
          ({ dispatchState }) => dispatchState === 'dispatched'
        ).length ||
    utilization.toolCalls !== executionTotals.toolCalls ||
    utilization.repairRounds !== executionTotals.repairRounds ||
    utilization.transactions !== executionTotals.transactions ||
    utilization.artifactBytes !== executionTotals.artifactBytes ||
    utilization.elapsedMs !== executionTotals.elapsedMs + smokeElapsedMs
  ) {
    issues.push(
      issue(
        'AI-6013',
        '/budgetLedger',
        'Budget ledger utilization must exactly match invocation and endpoint-smoke usage, cost, count, and elapsed time.'
      )
    );
  }
};

const validateReportsAndManifest = (
  bundle: AgentModelEvaluationEvidenceBundle,
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[],
  issues: AgentEvaluationIssue[],
  requireReleaseQualification: boolean
): void => {
  if (
    !isAgentEvaluationMetricReport(bundle.metricReport) ||
    !isAgentEvaluationGraderReport(bundle.graderReport) ||
    !isAgentHumanReviewReport(bundle.humanReviewReport) ||
    !isAgentHoldoutExecutionReceipt(bundle.holdoutExecutionReceipt) ||
    !isAgentModelEvaluationManifest(bundle.manifest)
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/manifest',
        'One or more evaluation reports, receipts, or the manifest are malformed.'
      )
    );
    return;
  }
  const humanReviewRequired =
    bundle.manifest.humanReviewReportDigest !== undefined;
  const validatedReviewArtifact = bundle.validatedHumanReviewArtifacts[0];
  let expectedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[] =
    Object.freeze([]);
  if (
    !isAgentEvaluationValidatedHumanReviewArtifactSet(
      bundle.validatedHumanReviewArtifacts
    ) ||
    bundle.validatedHumanReviewArtifacts.length !==
      (humanReviewRequired ? 1 : 0) ||
    (bundle.reviewLeaseDigest !== undefined) !== humanReviewRequired ||
    (humanReviewRequired &&
      (!validatedReviewArtifact ||
        !isAgentEvaluationValidatedHumanReviewArtifact(
          validatedReviewArtifact,
          bundle.humanReviewReport
        ) ||
        validatedReviewArtifact.planDigest !== bundle.plan.planDigest ||
        validatedReviewArtifact.repositoryCommit !==
          bundle.plan.repositoryCommit ||
        validatedReviewArtifact.humanReviewReportDigest !==
          bundle.manifest.humanReviewReportDigest ||
        bundle.reviewLeaseDigest !==
          validatedReviewArtifact.reviewLeaseDigest ||
        validatedReviewArtifact.reviewArtifact
          .randomizedPresentationPolicyDigest !==
          bundle.plan.graderPlan.randomizedPresentationPolicyDigest ||
        validatedReviewArtifact.adjudicationPolicy.minimumIndependentRatings !==
          bundle.plan.graderPlan.minimumIndependentVisualRatings ||
        Date.parse(validatedReviewArtifact.validatedAt) >
          Date.parse(bundle.manifest.completedAt)))
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/validatedHumanReviewArtifacts',
        'Human-review authority requires one exact raw signed artifact bound to the normalized report, frozen trust policy, plan, commit, and validation time.'
      )
    );
  }
  if (humanReviewRequired && validatedReviewArtifact) {
    try {
      expectedHumanMetricObservations =
        createAgentEvaluationValidatedHumanMetricObservations({
          plan: bundle.plan,
          attempts: bundle.attempts,
          humanReviewReport: bundle.humanReviewReport,
          validatedHumanReviewArtifact: validatedReviewArtifact,
        });
    } catch {
      expectedHumanMetricObservations = Object.freeze([]);
    }
  }
  if (
    !sameCanonicalJson(
      bundle.validatedHumanMetricObservations,
      expectedHumanMetricObservations
    )
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/validatedHumanMetricObservations',
        'Validated human metric observations must exactly project the signed criterion-level review authority.'
      )
    );
  }
  issues.push(
    ...validateAgentModelEvaluationManifest({
      manifest: bundle.manifest,
      plan: bundle.plan,
      descriptors,
      attempts: bundle.attempts,
      validatedHumanMetricObservations: bundle.validatedHumanMetricObservations,
      metricReport: bundle.metricReport,
      graderReport: bundle.graderReport,
      humanReviewReport: bundle.humanReviewReport,
      holdoutExecutionReceipt: bundle.holdoutExecutionReceipt,
    })
  );
  const protectedCaseIds = bundle.plan.concreteCases
    .filter(({ access }) => access === 'protected-holdout')
    .map(({ caseId }) => caseId)
    .sort(compareUnicodeCodePoints);
  if (
    requireReleaseQualification &&
    (bundle.manifest.outcome !== 'satisfied' ||
      bundle.manifest.planDigest !== bundle.plan.planDigest ||
      bundle.metricReport.slices.length === 0 ||
      bundle.metricReport.slices.some(
        ({ thresholdSatisfied }) => !thresholdSatisfied
      ) ||
      bundle.graderReport.selfJudgeOnlyAttemptIds.length > 0 ||
      bundle.humanReviewReport.ratings.length === 0 ||
      bundle.humanReviewReport.ratings.some(
        ({ verdict }) => verdict !== 'passed'
      ) ||
      bundle.holdoutExecutionReceipt.planDigest !== bundle.plan.planDigest ||
      !sameCanonicalJson(
        bundle.holdoutExecutionReceipt.executedCaseIds,
        protectedCaseIds
      ) ||
      bundle.holdoutExecutionReceipt.leakedCaseIds.length > 0)
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/manifest/outcome',
        'Satisfied admission requires passing metric, grader, human, protected-holdout, and manifest outcomes.'
      )
    );
  }
};

const validateEndpointSmokeQualification = (
  bundle: AgentModelEvaluationEvidenceBundle,
  issues: AgentEvaluationIssue[]
): void => {
  if (
    !qualifiesAgentEvaluationEndpointSmokeSet(
      bundle.plan.endpointSmokeTargets,
      bundle.endpointSmokeReceipts
    )
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/endpointSmokeReceipts',
        'Release qualification requires all five frozen endpoint-smoke targets to pass with authoritative receipts.'
      )
    );
  }
};

const validateAttestationBindings = (
  bundle: AgentModelEvaluationEvidenceBundle,
  options: AgentModelEvaluationEvidenceValidationOptions,
  issues: AgentEvaluationIssue[]
): void => {
  const attestation = bundle.authorityAttestation;
  const secretCanaries = [...(options.secretCanaries ?? [])].sort(
    compareUnicodeCodePoints
  );
  const holdoutCanaries = [...(options.protectedHoldoutCanaries ?? [])].sort(
    compareUnicodeCodePoints
  );
  if (
    !isAuthorityAttestation(attestation) ||
    attestation.evidenceSetDigest !== bundle.evidenceSetDigest ||
    attestation.planDigest !== bundle.plan.planDigest ||
    attestation.repositoryCommit !== bundle.plan.repositoryCommit ||
    attestation.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest !==
      bundle.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest ||
    attestation.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest !==
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest ||
    attestation.endpointSmokeDispatchIntentSetDigest !==
      digestAgentEvaluationEndpointSmokeDispatchIntentSet(
        bundle.endpointSmokeDispatchIntents
      ) ||
    attestation.endpointSmokeTransportReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeTransportReceiptSet(
        bundle.endpointSmokeTransportReceipts
      ) ||
    attestation.endpointSmokeResultSpoolReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet(
        bundle.endpointSmokeResultSpoolReceipts
      ) ||
    attestation.endpointSmokeResultSpoolDispositionReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet(
        bundle.endpointSmokeResultSpoolDispositionReceipts
      ) ||
    attestation.endpointSmokeValidationFailureReceiptSetDigest !==
      digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet(
        bundle.endpointSmokeValidationFailureReceipts
      ) ||
    attestation.endpointSmokeSetDigest !==
      digestAgentEvaluationEndpointSmokeReceiptSet(
        bundle.endpointSmokeReceipts
      ) ||
    attestation.preDispatchFailureReceiptSetDigest !==
      digestAgentEvaluationPreDispatchFailureReceiptSet(
        bundle.preDispatchFailureReceipts
      ) ||
    attestation.transportDispatchIntentSetDigest !==
      digestAgentEvaluationTransportDispatchIntentSet(
        bundle.transportDispatchIntents
      ) ||
    attestation.transportReceiptSetDigest !==
      digestAgentEvaluationTransportReceiptSet(bundle.transportReceipts) ||
    attestation.providerResultSpoolReceiptSetDigest !==
      digestAgentEvaluationProviderResultSpoolReceiptSet(
        bundle.providerResultSpoolReceipts
      ) ||
    attestation.providerResultSpoolDispositionReceiptSetDigest !==
      digestAgentEvaluationProviderResultSpoolDispositionReceiptSet(
        bundle.providerResultSpoolDispositionReceipts
      ) ||
    attestation.invocationTurnReceiptSetDigest !==
      digestAgentEvaluationInvocationTurnReceiptSet(
        bundle.invocationTurnReceipts
      ) ||
    attestation.invocationTurnSetReceiptSetDigest !==
      digestAgentEvaluationInvocationTurnSetReceiptSet(
        bundle.invocationTurnSetReceipts
      ) ||
    attestation.resultSubmissionReceiptSetDigest !==
      digestAgentEvaluationResultSubmissionReceiptSet(
        bundle.resultSubmissionReceipts
      ) ||
    attestation.attemptAuthorityOwnerReceiptSetDigest !==
      digestAgentEvaluationAttemptAuthorityOwnerReceiptSet(
        bundle.attemptAuthorityOwnerReceipts
      ) ||
    attestation.controlledRuntimeReceiptSetDigest !==
      digestAgentEvaluationControlledRuntimeReceiptSet(
        bundle.controlledRuntimeReceipts
      ) ||
    attestation.capabilityExecutionReceiptSetDigest !==
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        bundle.capabilityExecutionReceipts
      ) ||
    attestation.capabilitySpecificReceiptSetDigest !==
      digestAgentEvaluationCapabilitySpecificReceiptSet(
        bundle.capabilitySpecificReceipts
      ) ||
    attestation.providerCapabilityObservationReceiptSetDigest !==
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        bundle.providerCapabilityObservationReceipts
      ) ||
    attestation.verificationAttemptGrantReceiptSetDigest !==
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        bundle.verificationAttemptGrantReceipts
      ) ||
    attestation.validatedHumanReviewArtifactSetDigest !==
      digestAgentEvaluationValidatedHumanReviewArtifactSet(
        bundle.validatedHumanReviewArtifacts
      ) ||
    attestation.validatedHumanMetricObservationSetDigest !==
      digestAgentEvaluationValidatedHumanMetricObservationSet(
        bundle.validatedHumanMetricObservations
      ) ||
    attestation.reviewLeaseDigest !== bundle.reviewLeaseDigest ||
    attestation.reviewRasterScanReceiptSetDigest !==
      digestAgentEvaluationReviewRasterScanReceiptSet(
        bundle.reviewRasterScanReceipts
      ) ||
    attestation.reviewCandidateRefSetDigest !==
      digestAgentEvaluationReviewCandidateRefSet(bundle.reviewCandidateRefs) ||
    attestation.blindReviewMappingSetDigest !==
      digestAgentEvaluationBlindReviewMappingRefSet(
        bundle.blindReviewMappingRefs
      ) ||
    attestation.sourceReceiptSetDigest !==
      digestAgentEvaluationSourceReceiptSet(bundle.sourceReceipts) ||
    attestation.executionReceiptSetDigest !==
      digestAgentEvaluationExecutionReceiptSet(bundle.executionReceipts) ||
    attestation.holdoutExecutionReceiptDigest !==
      bundle.holdoutExecutionReceipt.receiptDigest ||
    attestation.secretCanarySetDigest !==
      digestAgentCanonicalValue(secretCanaries) ||
    attestation.protectedHoldoutCanarySetDigest !==
      digestAgentCanonicalValue(holdoutCanaries) ||
    Date.parse(attestation.issuedAt) <
      Date.parse(bundle.manifest.completedAt) ||
    (options.now !== undefined &&
      Date.parse(attestation.issuedAt) > Date.parse(options.now))
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/authorityAttestation',
        'Authority attestation is malformed or drifted from evidence, workflow scan, holdout, or commit bindings.'
      )
    );
  }
};

const scanEvidenceInBoundedShards = (
  bundle: AgentModelEvaluationEvidenceBundle,
  canaries: readonly string[],
  scanner: (
    value: unknown,
    canaries: readonly string[]
  ) => readonly AgentSecurityFinding[]
): readonly AgentSecurityFinding[] => {
  if (canaries.length === 0) return Object.freeze([]);
  const findings: AgentSecurityFinding[] = [];
  const scanValue = (value: unknown, path: string): void => {
    if (Array.isArray(value) && value.length > 128) {
      for (let start = 0; start < value.length; start += 128) {
        scanValue(value.slice(start, start + 128), `${path}/${start}`);
      }
      return;
    }
    const result = scanner(value, canaries);
    const overflow = result.some(
      ({ message }) =>
        message ===
        'Artifact canary scan exceeded its safe inspection envelope.'
    );
    if (overflow && Array.isArray(value) && value.length > 1) {
      const middle = Math.ceil(value.length / 2);
      scanValue(value.slice(0, middle), path);
      scanValue(value.slice(middle), `${path}/${middle}`);
      return;
    }
    if (overflow && isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        scanValue(child, `${path}/${key}`);
      }
      return;
    }
    findings.push(
      ...result.map((finding) =>
        Object.freeze({
          ...finding,
          path: `${path}${finding.path === '/' ? '' : finding.path}`,
        })
      )
    );
  };
  for (const [key, value] of Object.entries(bundle)) {
    scanValue(value, `/${key}`);
  }
  return Object.freeze(findings);
};

const validateAgentModelEvaluationEvidenceBundleForMode = (
  value: unknown,
  options: AgentModelEvaluationEvidenceValidationOptions,
  requireReleaseQualification: boolean
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  if (!hasBundleShape(value)) {
    return Object.freeze([
      issue(
        'AI-9001',
        '/',
        'Evaluation evidence bundle v3 has missing, extra, or malformed top-level fields.'
      ),
    ]);
  }
  const bundle = value;
  if (
    bundle.format !== AGENT_MODEL_EVALUATION_EVIDENCE_FORMAT ||
    bundle.version !== AGENT_MODEL_EVALUATION_EVIDENCE_VERSION ||
    !isAgentCanonicalDigest(
      bundle.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest
    ) ||
    !Array.isArray(
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings
    ) ||
    !isAgentCanonicalDigest(
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest
    ) ||
    !Array.isArray(bundle.endpointSmokeDispatchIntents) ||
    !bundle.endpointSmokeDispatchIntents.every(
      isAgentEvaluationEndpointSmokeDispatchIntent
    ) ||
    !Array.isArray(bundle.endpointSmokeTransportReceipts) ||
    !bundle.endpointSmokeTransportReceipts.every(
      isAgentEvaluationTransportReceipt
    ) ||
    !Array.isArray(bundle.endpointSmokeResultSpoolReceipts) ||
    !bundle.endpointSmokeResultSpoolReceipts.every(
      isAgentEvaluationEndpointSmokeResultSpoolReceipt
    ) ||
    !Array.isArray(bundle.endpointSmokeResultSpoolDispositionReceipts) ||
    !bundle.endpointSmokeResultSpoolDispositionReceipts.every(
      isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt
    ) ||
    !Array.isArray(bundle.endpointSmokeValidationFailureReceipts) ||
    !bundle.endpointSmokeValidationFailureReceipts.every(
      isAgentEvaluationEndpointSmokeValidationFailureReceipt
    ) ||
    !Array.isArray(bundle.endpointSmokeReceipts) ||
    !bundle.endpointSmokeReceipts.every(
      isAgentEvaluationEndpointSmokeReceipt
    ) ||
    !Array.isArray(bundle.preDispatchFailureReceipts) ||
    !Array.isArray(bundle.transportDispatchIntents) ||
    !Array.isArray(bundle.transportReceipts) ||
    !Array.isArray(bundle.providerResultSpoolReceipts) ||
    !Array.isArray(bundle.providerResultSpoolDispositionReceipts) ||
    !Array.isArray(bundle.invocationTurnReceipts) ||
    !Array.isArray(bundle.invocationTurnSetReceipts) ||
    !Array.isArray(bundle.resultSubmissionReceipts) ||
    !Array.isArray(bundle.attemptAuthorityOwnerReceipts) ||
    !bundle.attemptAuthorityOwnerReceipts.every(
      isAgentEvaluationAttemptAuthorityOwnerReceipt
    ) ||
    !Array.isArray(bundle.controlledRuntimeReceipts) ||
    !Array.isArray(bundle.capabilityExecutionReceipts) ||
    !Array.isArray(bundle.capabilitySpecificReceipts) ||
    !bundle.capabilitySpecificReceipts.every(
      isAgentEvaluationCapabilitySpecificReceipt
    ) ||
    !Array.isArray(bundle.providerCapabilityObservationReceipts) ||
    !bundle.providerCapabilityObservationReceipts.every(
      isAgentEvaluationProviderCapabilityObservationReceipt
    ) ||
    !Array.isArray(bundle.verificationAttemptGrantReceipts) ||
    !Array.isArray(bundle.validatedHumanReviewArtifacts) ||
    !Array.isArray(bundle.validatedHumanMetricObservations) ||
    !bundle.validatedHumanMetricObservations.every(
      isAgentEvaluationValidatedHumanMetricObservation
    ) ||
    !Array.isArray(bundle.reviewRasterScanReceipts) ||
    !Array.isArray(bundle.reviewCandidateRefs) ||
    !Array.isArray(bundle.blindReviewMappingRefs) ||
    !Array.isArray(bundle.sourceReceipts) ||
    !Array.isArray(bundle.executionReceipts) ||
    !Array.isArray(bundle.attempts) ||
    !Array.isArray(bundle.checkpoints)
  ) {
    return Object.freeze([
      issue('AI-9001', '/', 'Evaluation evidence bundle v3 shape is invalid.'),
    ]);
  }
  validateRuntimeOptions(bundle, options, issues);
  validateGlobalReceiptIdentityIsolation(bundle, issues);
  issues.push(...validateAgentModelEvaluationPlan(bundle.plan));
  let descriptors: readonly AgentModelEvaluationAttemptDescriptor[] = [];
  try {
    descriptors = planAgentModelEvaluationAttempts(bundle.plan);
  } catch (caught) {
    issues.push(
      issue(
        'AI-9001',
        '/plan',
        caught instanceof Error ? caught.message : 'Evaluation plan is invalid.'
      )
    );
  }
  validateAttemptsAndCheckpoints(bundle, descriptors, issues);
  validateExecutionReceipts(bundle, descriptors, issues);
  issues.push(
    ...validateAgentEvaluationEvidenceAuthenticity({
      plan: bundle.plan,
      attempts: bundle.attempts,
      descriptors,
      executionReceipts: bundle.executionReceipts,
      budgetLedger: bundle.budgetLedger,
      checkpoints: bundle.checkpoints,
      preDispatchFailureReceipts: bundle.preDispatchFailureReceipts,
      transportDispatchIntents: bundle.transportDispatchIntents,
      transportReceipts: bundle.transportReceipts,
      providerResultSpoolReceipts: bundle.providerResultSpoolReceipts,
      providerResultSpoolDispositionReceipts:
        bundle.providerResultSpoolDispositionReceipts,
      invocationTurnReceipts: bundle.invocationTurnReceipts,
      invocationTurnSetReceipts: bundle.invocationTurnSetReceipts,
      resultSubmissionReceipts: bundle.resultSubmissionReceipts,
      attemptAuthorityOwnerReceipts: bundle.attemptAuthorityOwnerReceipts,
      controlledRuntimeReceipts: bundle.controlledRuntimeReceipts,
      capabilityExecutionReceipts: bundle.capabilityExecutionReceipts,
      capabilitySpecificReceipts: bundle.capabilitySpecificReceipts,
      providerCapabilityObservationReceipts:
        bundle.providerCapabilityObservationReceipts,
      verificationAttemptGrantReceipts: bundle.verificationAttemptGrantReceipts,
      reviewRasterScanReceipts: bundle.reviewRasterScanReceipts,
      reviewCandidateRefs: bundle.reviewCandidateRefs,
      blindReviewMappingRefs: bundle.blindReviewMappingRefs,
    })
  );
  const sourceReceipts = validateSourceReceipts(bundle, issues);
  validateReceipts(bundle, sourceReceipts, issues);
  const hostedLifecycleBudgetUsage = validateHostedLifecycleBudgetClosures(
    bundle,
    issues,
    requireReleaseQualification
  );
  validateBudgetLedger(
    bundle,
    issues,
    requireReleaseQualification,
    hostedLifecycleBudgetUsage
  );
  validateReportsAndManifest(
    bundle,
    descriptors,
    issues,
    requireReleaseQualification
  );
  if (requireReleaseQualification) {
    validateEndpointSmokeQualification(bundle, issues);
  }
  const evidenceInput: EvidenceSetInput = {
    plan: bundle.plan,
    hostedRetrievalRuntimeResourceLifecycleJournalSetDigest:
      bundle.hostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings:
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindings,
    hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest:
      bundle.hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
    endpointSmokeDispatchIntents: bundle.endpointSmokeDispatchIntents,
    endpointSmokeTransportReceipts: bundle.endpointSmokeTransportReceipts,
    endpointSmokeResultSpoolReceipts: bundle.endpointSmokeResultSpoolReceipts,
    endpointSmokeResultSpoolDispositionReceipts:
      bundle.endpointSmokeResultSpoolDispositionReceipts,
    endpointSmokeValidationFailureReceipts:
      bundle.endpointSmokeValidationFailureReceipts,
    endpointSmokeReceipts: bundle.endpointSmokeReceipts,
    preDispatchFailureReceipts: bundle.preDispatchFailureReceipts,
    transportDispatchIntents: bundle.transportDispatchIntents,
    transportReceipts: bundle.transportReceipts,
    providerResultSpoolReceipts: bundle.providerResultSpoolReceipts,
    providerResultSpoolDispositionReceipts:
      bundle.providerResultSpoolDispositionReceipts,
    invocationTurnReceipts: bundle.invocationTurnReceipts,
    invocationTurnSetReceipts: bundle.invocationTurnSetReceipts,
    resultSubmissionReceipts: bundle.resultSubmissionReceipts,
    attemptAuthorityOwnerReceipts: bundle.attemptAuthorityOwnerReceipts,
    controlledRuntimeReceipts: bundle.controlledRuntimeReceipts,
    capabilityExecutionReceipts: bundle.capabilityExecutionReceipts,
    capabilitySpecificReceipts: bundle.capabilitySpecificReceipts,
    providerCapabilityObservationReceipts:
      bundle.providerCapabilityObservationReceipts,
    verificationAttemptGrantReceipts: bundle.verificationAttemptGrantReceipts,
    validatedHumanReviewArtifacts: bundle.validatedHumanReviewArtifacts,
    validatedHumanMetricObservations: bundle.validatedHumanMetricObservations,
    ...(bundle.reviewLeaseDigest
      ? { reviewLeaseDigest: bundle.reviewLeaseDigest }
      : {}),
    reviewRasterScanReceipts: bundle.reviewRasterScanReceipts,
    reviewCandidateRefs: bundle.reviewCandidateRefs,
    blindReviewMappingRefs: bundle.blindReviewMappingRefs,
    sourceReceipts: bundle.sourceReceipts,
    executionReceipts: bundle.executionReceipts,
    attempts: bundle.attempts,
    checkpoints: bundle.checkpoints,
    budgetLedger: bundle.budgetLedger,
    metricReport: bundle.metricReport,
    graderReport: bundle.graderReport,
    humanReviewReport: bundle.humanReviewReport,
    holdoutExecutionReceipt: bundle.holdoutExecutionReceipt,
    manifest: bundle.manifest,
  };
  const evidenceSetDigest =
    digestAgentModelEvaluationEvidenceSet(evidenceInput);
  const bundleDigest = digestAgentModelEvaluationEvidenceBundleRoot({
    evidenceSetDigest,
    authorityAttestationDigest: bundle.authorityAttestation.attestationDigest,
  });
  if (
    !sameCanonicalJson(
      bundle.endpointSmokeDispatchIntents,
      canonicalAgentEvaluationEndpointSmokeDispatchIntentOrder(
        bundle.endpointSmokeDispatchIntents
      )
    ) ||
    !sameCanonicalJson(
      bundle.endpointSmokeTransportReceipts,
      canonicalAgentEvaluationEndpointSmokeTransportReceiptOrder(
        bundle.endpointSmokeTransportReceipts
      )
    ) ||
    !sameCanonicalJson(
      bundle.endpointSmokeResultSpoolReceipts,
      canonicalAgentEvaluationEndpointSmokeResultSpoolReceiptOrder(
        bundle.endpointSmokeResultSpoolReceipts
      )
    ) ||
    !sameCanonicalJson(
      bundle.endpointSmokeResultSpoolDispositionReceipts,
      canonicalAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptOrder(
        bundle.endpointSmokeResultSpoolDispositionReceipts
      )
    ) ||
    !sameCanonicalJson(
      bundle.endpointSmokeValidationFailureReceipts,
      canonicalAgentEvaluationEndpointSmokeValidationFailureReceiptOrder(
        bundle.endpointSmokeValidationFailureReceipts
      )
    ) ||
    !sameCanonicalJson(
      bundle.endpointSmokeReceipts,
      canonicalAgentEvaluationEndpointSmokeReceiptOrder(
        bundle.endpointSmokeReceipts
      )
    ) ||
    !isCanonicallyOrdered(
      bundle.preDispatchFailureReceipts,
      ({ failureReceiptId }) => failureReceiptId
    ) ||
    !isCanonicallyOrdered(
      bundle.transportDispatchIntents,
      ({ intentId }) => intentId
    ) ||
    !isCanonicallyOrdered(
      bundle.transportReceipts,
      ({ receiptId }) => receiptId
    ) ||
    !isCanonicallyOrdered(
      bundle.providerResultSpoolReceipts,
      ({ spoolRef }) => spoolRef
    ) ||
    !isCanonicallyOrdered(
      bundle.providerResultSpoolDispositionReceipts,
      ({ spoolRef }) => spoolRef
    ) ||
    !bundle.invocationTurnReceipts.every(
      (receipt, index) =>
        index === 0 ||
        compareUnicodeCodePoints(
          bundle.invocationTurnReceipts[index - 1]!.attemptId,
          receipt.attemptId
        ) < 0 ||
        (bundle.invocationTurnReceipts[index - 1]!.attemptId ===
          receipt.attemptId &&
          bundle.invocationTurnReceipts[index - 1]!.turnIndex <
            receipt.turnIndex)
    ) ||
    !isCanonicallyOrdered(
      bundle.invocationTurnSetReceipts,
      ({ attemptId }) => attemptId
    ) ||
    !isCanonicallyOrdered(
      bundle.resultSubmissionReceipts,
      ({ attemptId }) => attemptId
    ) ||
    !sameCanonicalJson(
      bundle.attemptAuthorityOwnerReceipts,
      [...bundle.attemptAuthorityOwnerReceipts].sort(
        canonicalAgentEvaluationAttemptAuthorityOwnerReceiptOrder
      )
    ) ||
    !isCanonicallyOrdered(
      bundle.controlledRuntimeReceipts,
      ({ attemptId }) => attemptId
    ) ||
    !bundle.capabilityExecutionReceipts.every(
      (receipt, index) =>
        index === 0 ||
        compareUnicodeCodePoints(
          bundle.capabilityExecutionReceipts[index - 1]!.attemptId,
          receipt.attemptId
        ) < 0 ||
        (bundle.capabilityExecutionReceipts[index - 1]!.attemptId ===
          receipt.attemptId &&
          (bundle.capabilityExecutionReceipts[index - 1]!.turnIndex <
            receipt.turnIndex ||
            (bundle.capabilityExecutionReceipts[index - 1]!.turnIndex ===
              receipt.turnIndex &&
              compareUnicodeCodePoints(
                bundle.capabilityExecutionReceipts[index - 1]!
                  .capabilityExecutionReceiptId,
                receipt.capabilityExecutionReceiptId
              ) < 0)))
    ) ||
    !sameCanonicalJson(
      bundle.capabilitySpecificReceipts,
      [...bundle.capabilitySpecificReceipts].sort(
        canonicalAgentEvaluationCapabilitySpecificReceiptOrder
      )
    ) ||
    !sameCanonicalJson(
      bundle.providerCapabilityObservationReceipts,
      [...bundle.providerCapabilityObservationReceipts].sort(
        canonicalAgentEvaluationProviderCapabilityObservationReceiptOrder
      )
    ) ||
    !bundle.verificationAttemptGrantReceipts.every(
      isAgentEvaluationVerificationAttemptGrantReceipt
    ) ||
    !sameCanonicalJson(
      bundle.verificationAttemptGrantReceipts,
      canonicalAgentEvaluationVerificationAttemptGrantReceipts(
        bundle.verificationAttemptGrantReceipts
      )
    ) ||
    !isAgentEvaluationValidatedHumanReviewArtifactSet(
      bundle.validatedHumanReviewArtifacts
    ) ||
    !sameCanonicalJson(
      bundle.validatedHumanMetricObservations,
      canonicalAgentEvaluationValidatedHumanMetricObservationOrder(
        bundle.validatedHumanMetricObservations
      )
    ) ||
    !isCanonicallyOrdered(
      bundle.reviewRasterScanReceipts,
      ({ attemptId }) => attemptId
    ) ||
    !isCanonicallyOrdered(
      bundle.reviewCandidateRefs,
      ({ attemptId }) => attemptId
    ) ||
    !isCanonicallyOrdered(
      bundle.blindReviewMappingRefs,
      ({ mappingId }) => mappingId
    ) ||
    !isCanonicallyOrdered(
      bundle.sourceReceipts,
      ({ sourceReceiptId }) => sourceReceiptId
    ) ||
    !isCanonicallyOrdered(
      bundle.executionReceipts,
      ({ attemptId }) => attemptId
    ) ||
    !isCanonicallyOrdered(
      bundle.attempts,
      ({ descriptor }) => descriptor.attemptId
    ) ||
    !isCanonicallyOrdered(bundle.checkpoints, ({ shardId }) => shardId) ||
    evidenceSetDigest !== bundle.evidenceSetDigest ||
    bundleDigest !== bundle.bundleDigest
  ) {
    issues.push(
      issue(
        'AI-8011',
        '/bundleDigest',
        'Bundle ordering, evidence-set digest, or bundle digest is non-canonical.'
      )
    );
  }
  validateAttestationBindings(bundle, options, issues);
  const secretFindings = scanEvidenceInBoundedShards(
    bundle,
    options.secretCanaries ?? [],
    scanAgentArtifactForSecretCanaries
  );
  const holdoutFindings = scanEvidenceInBoundedShards(
    bundle,
    options.protectedHoldoutCanaries ?? [],
    scanAgentArtifactForProtectedHoldoutLeak
  );
  for (const finding of [...secretFindings, ...holdoutFindings]) {
    issues.push(
      issue(
        finding.code === 'AI-8011' ? 'AI-8011' : 'AI-8010',
        finding.path,
        finding.message
      )
    );
  }
  const result = Object.freeze(issues.sort(compareIssues));
  return result;
};

export const validateAgentModelEvaluationEvidenceBundleAuthenticity = (
  value: unknown,
  options: AgentModelEvaluationEvidenceValidationOptions = {}
): readonly AgentEvaluationIssue[] =>
  validateAgentModelEvaluationEvidenceBundleForMode(value, options, false);

export const validateAgentModelEvaluationEvidenceBundle = (
  value: unknown,
  options: AgentModelEvaluationEvidenceValidationOptions = {}
): readonly AgentEvaluationIssue[] =>
  validateAgentModelEvaluationEvidenceBundleForMode(value, options, true);

export const isAgentModelEvaluationEvidenceBundleAuthenticity = (
  value: unknown,
  options: AgentModelEvaluationEvidenceValidationOptions = {}
): value is AgentModelEvaluationEvidenceBundle =>
  validateAgentModelEvaluationEvidenceBundleAuthenticity(value, options)
    .length === 0;

export const isAgentModelEvaluationEvidenceBundle = (
  value: unknown,
  options: AgentModelEvaluationEvidenceValidationOptions = {}
): value is AgentModelEvaluationEvidenceBundle =>
  validateAgentModelEvaluationEvidenceBundle(value, options).length === 0;

export const verifyAgentModelEvaluationAuthorityAttestation = async (
  value: unknown,
  trust: AgentModelEvaluationAuthorityTrust
): Promise<boolean> => {
  if (
    !hasBundleShape(value) ||
    !isAuthorityAttestation(value.authorityAttestation)
  ) {
    return false;
  }
  const keyIds = trust.trustedPublicKeys.map(({ keyId }) => keyId);
  if (new Set(keyIds).size !== keyIds.length) return false;
  const trustedKey = trust.trustedPublicKeys.find(
    ({ keyId }) => keyId === value.authorityAttestation.keyId
  );
  if (
    !trustedKey ||
    !isIdentity(trustedKey.keyId) ||
    !isCanonicalBase64Url(trustedKey.publicKeyBase64Url, 32)
  ) {
    return false;
  }
  if (!isAgentModelEvaluationEvidenceBundle(value, trust)) return false;
  const payload = authorityPayloadFromAttestation(value.authorityAttestation);
  if (
    digestAgentCanonicalValue(payload) !==
    value.authorityAttestation.attestedPayloadDigest
  ) {
    return false;
  }
  try {
    return await trust.verifyEd25519({
      keyId: trustedKey.keyId,
      publicKeyBase64Url: trustedKey.publicKeyBase64Url,
      signatureBase64Url: value.authorityAttestation.signature,
      payload,
      message: new TextEncoder().encode(canonicalJsonText(payload)),
    });
  } catch {
    return false;
  }
};
