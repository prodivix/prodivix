import type {
  AgentBudget,
  AgentModelEvaluationManifestRef,
  AgentProviderProtocolFamily,
  CanonicalDigest,
  DecimalString,
  Instant,
} from '../domain/agent.types';
import type {
  AgentCost,
  AgentModelLineage,
  AgentProviderConfigurationIdentity,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import type { AgentBudgetLedgerState } from '../usage/agentBudgetLedger';

export type AgentModelEvaluationPlanId = string;
export type AgentModelEvaluationCaseId = string;
export type AgentModelEvaluationAttemptId = string;
export type AgentEvaluationShardId = string;

export type AgentEvaluationPrimaryBucket =
  | 'positive-cross-domain'
  | 'adversarial-security'
  | 'recovery-repair-reconciliation'
  | 'capability-differential';

export type AgentEvaluationRiskClass =
  'ordinary' | 'critical' | 'high-assurance';

export type AgentEvaluationCorpusAccess =
  'public' | 'protected-holdout' | 'rotating-counterexample';

export type AgentEvaluationContextTierName =
  'small' | 'representative' | 'near-limit';

export type AgentMediaRepresentationTierName =
  'source-faithful' | 'representative-transform' | 'near-limit-transform';

export type AgentEvaluationGraderKind =
  | 'strict-decoder'
  | 'deterministic-rule'
  | 'domain-dry-run'
  | 'g3-closure'
  | 'perceptual-metric'
  | 'model-judge'
  | 'blind-human-rubric';

export type AgentModelEvaluationCase = Readonly<{
  caseId: AgentModelEvaluationCaseId;
  familyId: string;
  primaryBucket: AgentEvaluationPrimaryBucket;
  riskClass: AgentEvaluationRiskClass;
  access: AgentEvaluationCorpusAccess;
  capabilityProfileId: string;
  fixtureRef: string;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  contextSentinel: boolean;
  mediaSentinel: boolean;
  subjectiveVisualQuality: boolean;
  tags: readonly string[];
  caseDigest: CanonicalDigest;
}>;

export type AgentEvaluationContextTier = Readonly<{
  caseId: AgentModelEvaluationCaseId;
  tier: AgentEvaluationContextTierName;
  contextPackDigest: CanonicalDigest;
  transformReceiptDigest: CanonicalDigest;
  cacheReceiptDigest: CanonicalDigest;
  tierDigest: CanonicalDigest;
}>;

export type AgentMediaRepresentationTier = Readonly<{
  caseId: AgentModelEvaluationCaseId;
  tier: AgentMediaRepresentationTierName;
  representationManifestDigest: CanonicalDigest;
  transformReceiptDigest: CanonicalDigest;
  omissionReceiptDigest: CanonicalDigest;
  tierDigest: CanonicalDigest;
}>;

export type AgentCapabilityQualificationTarget = Readonly<{
  targetId: string;
  providerConfigurationId: string;
  providerIdentityDigest: CanonicalDigest;
  protocolFamily: AgentProviderProtocolFamily;
  providerOperatorId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  modelFamilyOwnerId: string;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  qualificationSliceDigest: CanonicalDigest;
  targetDigest: CanonicalDigest;
}>;

export type AgentEvaluationEndpointSmokeTarget = Readonly<{
  smokeTargetId: string;
  endpointClass: 'first-party-hosted' | 'aggregator' | 'self-hosted' | 'local';
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  adapterDigest: CanonicalDigest;
  smokeProfileDigest: CanonicalDigest;
  targetDigest: CanonicalDigest;
}>;

export type AgentEvaluationRepetitionRule = Readonly<{
  riskClass: AgentEvaluationRiskClass;
  minimumIndependentAttempts: number;
  confidenceLevel: DecimalString;
  maximumFailureRateBound?: DecimalString;
  sequentialStoppingRuleDigest?: CanonicalDigest;
}>;

export type AgentEvaluationRepetitionPolicy = Readonly<{
  rules: readonly AgentEvaluationRepetitionRule[];
  highAssuranceCaseIds: readonly AgentModelEvaluationCaseId[];
  samplingIndependencePolicyDigest: CanonicalDigest;
  cacheAndStateIsolationPolicyDigest: CanonicalDigest;
}>;

export type AgentEvaluationGrader = Readonly<{
  graderId: string;
  kind: AgentEvaluationGraderKind;
  authority: 'deterministic' | 'auxiliary' | 'human';
  configurationDigest: CanonicalDigest;
  providerConfigurationId?: string;
  modelLineageDigest?: CanonicalDigest;
  testedModelFamilyOwnerIds: readonly string[];
}>;

export type AgentEvaluationGraderPlan = Readonly<{
  graders: readonly AgentEvaluationGrader[];
  deterministicAuthorityGraderIds: readonly string[];
  auxiliaryJudgeGraderIds: readonly string[];
  blindHumanGraderIds: readonly string[];
  minimumIndependentVisualRatings: number;
  disagreementPolicyDigest: CanonicalDigest;
  randomizedPresentationPolicyDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
}>;

export type AgentEvaluationMetricThreshold = Readonly<{
  metricId: string;
  requiredAuthority: 'deterministic' | 'human';
  maximumObservedFailureRate: DecimalString;
  maximumUpperConfidenceBound?: DecimalString;
  minimumSampleCount: number;
}>;

export type AgentModelEvaluationThresholds = Readonly<{
  metrics: readonly AgentEvaluationMetricThreshold[];
  multipleComparisonPolicyDigest: CanonicalDigest;
  slicePolicyDigest: CanonicalDigest;
  thresholdsDigest: CanonicalDigest;
}>;

/**
 * Evaluation reuses the shared multi-dimensional AgentBudget. Media, hosted
 * search, compute, storage, and generated assets are represented by usage
 * units rather than being flattened into text tokens.
 */
export type AgentModelEvaluationBudget = Readonly<{
  budget: AgentBudget;
  maxProviderJobs: number;
  maxShards: number;
  maxHumanRatings: number;
  reservePolicyDigest: CanonicalDigest;
  budgetDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationPlan = Readonly<{
  evaluationPlanId: AgentModelEvaluationPlanId;
  repositoryCommit: string;
  policyDigest: CanonicalDigest;
  contextBuilderDigest: CanonicalDigest;
  semanticProviderSetDigest: CanonicalDigest;
  promptPolicyDigest: CanonicalDigest;
  outputSchemaDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  providerConfigurations: readonly AgentProviderConfigurationIdentity[];
  modelConfigurations: readonly AgentModelLineage[];
  capabilityQualificationTargets: readonly AgentCapabilityQualificationTarget[];
  endpointSmokeTargets: readonly AgentEvaluationEndpointSmokeTarget[];
  publicCorpusDigest: CanonicalDigest;
  protectedHoldoutManifestDigest: CanonicalDigest;
  rotatingCorpusPolicyDigest: CanonicalDigest;
  concreteCases: readonly AgentModelEvaluationCase[];
  contextTiers: readonly AgentEvaluationContextTier[];
  mediaRepresentationTiers: readonly AgentMediaRepresentationTier[];
  contextSentinelCaseIds: readonly AgentModelEvaluationCaseId[];
  mediaSentinelCaseIds: readonly AgentModelEvaluationCaseId[];
  repetitionPolicy: AgentEvaluationRepetitionPolicy;
  graderPlan: AgentEvaluationGraderPlan;
  thresholds: AgentModelEvaluationThresholds;
  budget: AgentModelEvaluationBudget;
  plannedJourneyCount: number;
  plannedAttemptSetDigest: CanonicalDigest;
  plannedAt: Instant;
  expiresAt: Instant;
  planDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationAttemptDescriptor = Readonly<{
  attemptId: AgentModelEvaluationAttemptId;
  planDigest: CanonicalDigest;
  shardId: AgentEvaluationShardId;
  caseId: AgentModelEvaluationCaseId;
  targetId: string;
  targetDigest: CanonicalDigest;
  riskClass: AgentEvaluationRiskClass;
  contextTier?: AgentEvaluationContextTierName;
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
  repetitionIndex: number;
  samplingIdentityDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptStatus =
  | 'completed'
  | 'provider-error'
  | 'timed-out'
  | 'rate-limited'
  | 'schema-failed'
  | 'blocked'
  | 'cancelled'
  | 'infrastructure-error';

export type AgentEvaluationMetricObservation = Readonly<{
  metricId: string;
  graderId: string;
  graderKind: AgentEvaluationGraderKind;
  authority: 'deterministic' | 'auxiliary' | 'human';
  verdict: 'passed' | 'failed' | 'inconclusive';
  observationDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationAttempt = Readonly<{
  descriptor: AgentModelEvaluationAttemptDescriptor;
  independentRunId: string;
  invocationReceiptDigest?: CanonicalDigest;
  responseDigest?: CanonicalDigest;
  status: AgentEvaluationAttemptStatus;
  outcome: 'passed' | 'failed' | 'inconclusive';
  metricObservations: readonly AgentEvaluationMetricObservation[];
  usage: AgentUsageVector;
  cost: readonly AgentCost[];
  startedAt: Instant;
  completedAt: Instant;
  attemptDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationAttemptRef = Readonly<{
  attemptId: AgentModelEvaluationAttemptId;
  descriptorDigest: CanonicalDigest;
  attemptDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationMissingAttemptRef = Readonly<{
  attemptId: AgentModelEvaluationAttemptId;
  descriptorDigest: CanonicalDigest;
  reason:
    | 'missing'
    | 'provider-error'
    | 'timed-out'
    | 'rate-limited'
    | 'schema-failed'
    | 'blocked'
    | 'cancelled'
    | 'infrastructure-error';
}>;

export type AgentEvaluationShardCheckpoint = Readonly<{
  planDigest: CanonicalDigest;
  shardId: AgentEvaluationShardId;
  revision: number;
  leaseOwnerId: string;
  leaseGeneration: number;
  state: 'running' | 'completed' | 'incomplete';
  completedAttemptRefs: readonly AgentModelEvaluationAttemptRef[];
  missingAttemptRefs: readonly AgentModelEvaluationMissingAttemptRef[];
  budgetLedger: AgentBudgetLedgerState;
  updatedAt: Instant;
  checkpointDigest: CanonicalDigest;
}>;

export type AgentEvaluationMetricSlice = Readonly<{
  sliceId: string;
  metricId: string;
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  modelFamilyOwnerId: string;
  capabilityProfileId: string;
  primaryBucket: AgentEvaluationPrimaryBucket;
  familyId: string;
  riskClass: AgentEvaluationRiskClass;
  contextTier?: AgentEvaluationContextTierName;
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
  graderKind: AgentEvaluationGraderKind;
  passed: number;
  failed: number;
  inconclusive: number;
  denominator: number;
  observedFailureRate: DecimalString;
  upperConfidenceBound: DecimalString;
  thresholdSatisfied: boolean;
  sliceDigest: CanonicalDigest;
}>;

export type AgentEvaluationMetricReport = Readonly<{
  reportId: string;
  planDigest: CanonicalDigest;
  attemptSetDigest: CanonicalDigest;
  slices: readonly AgentEvaluationMetricSlice[];
  generatedAt: Instant;
  reportDigest: CanonicalDigest;
}>;

export type AgentEvaluationGraderReport = Readonly<{
  reportId: string;
  planDigest: CanonicalDigest;
  graderPlanDigest: CanonicalDigest;
  deterministicVerdictCount: number;
  auxiliaryVerdictCount: number;
  humanVerdictCount: number;
  disagreementCount: number;
  selfJudgeOnlyAttemptIds: readonly AgentModelEvaluationAttemptId[];
  generatedAt: Instant;
  reportDigest: CanonicalDigest;
}>;

export type AgentHumanReviewRating = Readonly<{
  ratingId: string;
  attemptId: AgentModelEvaluationAttemptId;
  reviewerPseudonym: string;
  randomizedPresentationId: string;
  rubricDigest: CanonicalDigest;
  verdict: 'passed' | 'failed';
  ratingDigest: CanonicalDigest;
}>;

export type AgentHumanReviewReport = Readonly<{
  reportId: string;
  planDigest: CanonicalDigest;
  blindedArtifactSetDigest: CanonicalDigest;
  ratings: readonly AgentHumanReviewRating[];
  adjudicationDigest: CanonicalDigest;
  generatedAt: Instant;
  reportDigest: CanonicalDigest;
}>;

export type AgentHoldoutExecutionReceipt = Readonly<{
  receiptId: string;
  planDigest: CanonicalDigest;
  protectedHoldoutManifestDigest: CanonicalDigest;
  accessPolicyDigest: CanonicalDigest;
  encryptedCorpusDigest: CanonicalDigest;
  executedCaseIds: readonly AgentModelEvaluationCaseId[];
  publicArtifactScanDigest: CanonicalDigest;
  leakedCaseIds: readonly AgentModelEvaluationCaseId[];
  executorPrincipalId: string;
  executedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentModelEvaluationManifest = Readonly<{
  manifestId: AgentModelEvaluationManifestRef;
  planDigest: CanonicalDigest;
  attemptRefs: readonly AgentModelEvaluationAttemptRef[];
  attemptCountByRisk: Readonly<Record<AgentEvaluationRiskClass, number>>;
  missingOrInfrastructureAttemptRefs: readonly AgentModelEvaluationMissingAttemptRef[];
  usage: AgentUsageVector;
  cost: readonly AgentCost[];
  metricReportRef: string;
  metricReportDigest: CanonicalDigest;
  graderReportRef: string;
  graderReportDigest: CanonicalDigest;
  humanReviewReportRef?: string;
  humanReviewReportDigest?: CanonicalDigest;
  holdoutExecutionReceiptRef: string;
  holdoutExecutionReceiptDigest: CanonicalDigest;
  qualificationTargetDigests: readonly CanonicalDigest[];
  outcome: 'satisfied' | 'unsatisfied' | 'incomplete' | 'expired';
  completedAt: Instant;
  expiresAt: Instant;
  manifestDigest: CanonicalDigest;
}>;

export type AgentEvaluationFact =
  | Readonly<{ factType: 'evaluation-plan'; value: AgentModelEvaluationPlan }>
  | Readonly<{
      factType: 'evaluation-attempt';
      value: AgentModelEvaluationAttempt;
    }>
  | Readonly<{
      factType: 'evaluation-checkpoint';
      value: AgentEvaluationShardCheckpoint;
    }>
  | Readonly<{
      factType: 'evaluation-metric-report';
      value: AgentEvaluationMetricReport;
    }>
  | Readonly<{
      factType: 'evaluation-grader-report';
      value: AgentEvaluationGraderReport;
    }>
  | Readonly<{
      factType: 'evaluation-human-review-report';
      value: AgentHumanReviewReport;
    }>
  | Readonly<{
      factType: 'evaluation-holdout-receipt';
      value: AgentHoldoutExecutionReceipt;
    }>
  | Readonly<{
      factType: 'evaluation-manifest';
      value: AgentModelEvaluationManifest;
    }>;

export type AgentEvaluationIssueCode =
  | 'AI-6002'
  | 'AI-6010'
  | 'AI-6011'
  | 'AI-6013'
  | 'AI-8005'
  | 'AI-8010'
  | 'AI-8011'
  | 'AI-9001';

export type AgentEvaluationIssue = Readonly<{
  code: AgentEvaluationIssueCode;
  path: string;
  message: string;
  blocking: true;
}>;
