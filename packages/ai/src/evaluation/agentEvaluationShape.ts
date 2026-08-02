import { hasExactAgentControlKeys } from '../control/agentControlValidation';
import type { AgentEvaluationFact } from './agentEvaluation.types';

const every = (
  value: unknown,
  predicate: (entry: unknown) => boolean
): boolean => Array.isArray(value) && value.every(predicate);

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  hasExactAgentControlKeys(value, required, optional);

const hasAdapterShape = (value: unknown): boolean =>
  exact(value, [
    'adapterId',
    'adapterVersion',
    'adapterDigest',
    'protocolFamily',
    'transportSchemaDigest',
    'eventNormalizationDigest',
  ]);

const hasProviderShape = (value: unknown): boolean =>
  exact(
    value,
    [
      'providerConfigurationId',
      'providerOperatorId',
      'endpointClass',
      'endpointProfileDigest',
      'adapter',
      'dataPolicyDigest',
    ],
    ['providerRegion', 'apiRevision']
  ) && hasAdapterShape(value.adapter);

const hasModelShape = (value: unknown): boolean =>
  exact(
    value,
    ['modelId', 'modelFamilyId', 'modelFamilyOwnerId', 'lineageDigest'],
    [
      'immutableVersion',
      'baseModelRef',
      'fineTuneRef',
      'tokenizerDigest',
      'chatTemplateDigest',
      'quantizationDigest',
      'runtimeBackendDigest',
    ]
  ) &&
  (value.baseModelRef === undefined ||
    exact(value.baseModelRef, ['modelId', 'lineageDigest'])) &&
  (value.fineTuneRef === undefined ||
    exact(value.fineTuneRef, [
      'fineTuneId',
      'jobId',
      'deploymentId',
      'baseModelLineageDigest',
      'trainingPolicyDigest',
      'disclosedDataLineageDigest',
    ]));

const hasUsageAmountShape = (value: unknown): boolean =>
  exact(
    value,
    ['unit', 'confidence'],
    ['logicalAmount', 'billableAmount', 'cachedAmount', 'sourceDigest']
  );

const hasUsageShape = (value: unknown): boolean =>
  exact(value, ['amounts', 'vectorDigest']) &&
  every(value.amounts, hasUsageAmountShape);

const hasCostShape = (value: unknown): boolean =>
  exact(value, ['currency', 'confidence'], ['amount', 'sourceDigest']);

const hasBudgetShape = (value: unknown): boolean =>
  exact(value, [
    'usageLimits',
    'costLimits',
    'maxModelInvocations',
    'maxToolCalls',
    'maxRepairRounds',
    'maxTransactions',
    'maxArtifactBytes',
    'maxElapsedMs',
  ]) &&
  every(value.usageLimits, (entry) => exact(entry, ['unit', 'maximum'])) &&
  every(value.costLimits, (entry) => exact(entry, ['currency', 'maximum']));

const hasDemandShape = (value: unknown): boolean =>
  exact(value, [
    'usage',
    'cost',
    'modelInvocations',
    'toolCalls',
    'repairRounds',
    'transactions',
    'artifactBytes',
    'elapsedMs',
  ]) &&
  hasUsageShape(value.usage) &&
  every(value.cost, hasCostShape);

const hasSettlementShape = (value: unknown): boolean =>
  exact(
    value,
    [
      'actual',
      'charged',
      'requiresReconciliation',
      'settledAt',
      'settlementDigest',
    ],
    ['reconciliationReason']
  ) &&
  hasDemandShape(value.actual) &&
  hasDemandShape(value.charged);

const hasBudgetLedgerShape = (value: unknown): boolean =>
  exact(value, ['budget', 'revision', 'reservations', 'ledgerDigest']) &&
  hasBudgetShape(value.budget) &&
  every(
    value.reservations,
    (entry) =>
      exact(
        entry,
        ['reservationId', 'demand', 'demandDigest', 'reservedAt', 'status'],
        ['settlement']
      ) &&
      hasDemandShape(entry.demand) &&
      (entry.settlement === undefined || hasSettlementShape(entry.settlement))
  );

const hasDescriptorShape = (value: unknown): boolean =>
  exact(
    value,
    [
      'attemptId',
      'planDigest',
      'shardId',
      'caseId',
      'targetId',
      'targetDigest',
      'riskClass',
      'repetitionIndex',
      'samplingIdentityDigest',
      'descriptorDigest',
    ],
    ['contextTier', 'mediaRepresentationTier']
  );

const hasAttemptRefShape = (value: unknown): boolean =>
  exact(value, ['attemptId', 'descriptorDigest', 'attemptDigest']);

const hasMissingRefShape = (value: unknown): boolean =>
  exact(value, ['attemptId', 'descriptorDigest', 'reason']);

const hasPlanShape = (value: unknown): boolean =>
  exact(value, [
    'evaluationPlanId',
    'repositoryCommit',
    'policyDigest',
    'contextBuilderDigest',
    'semanticProviderSetDigest',
    'promptPolicyDigest',
    'outputSchemaDigest',
    'toolRegistryDigest',
    'actionRegistryDigest',
    'providerConfigurations',
    'modelConfigurations',
    'capabilityQualificationTargets',
    'endpointSmokeTargets',
    'publicCorpusDigest',
    'protectedHoldoutManifestDigest',
    'rotatingCorpusPolicyDigest',
    'concreteCases',
    'contextTiers',
    'mediaRepresentationTiers',
    'contextSentinelCaseIds',
    'mediaSentinelCaseIds',
    'repetitionPolicy',
    'graderPlan',
    'thresholds',
    'budget',
    'plannedJourneyCount',
    'plannedAttemptSetDigest',
    'plannedAt',
    'expiresAt',
    'planDigest',
  ]) &&
  every(value.providerConfigurations, hasProviderShape) &&
  every(value.modelConfigurations, hasModelShape) &&
  every(value.capabilityQualificationTargets, (entry) =>
    exact(entry, [
      'targetId',
      'providerConfigurationId',
      'providerIdentityDigest',
      'protocolFamily',
      'providerOperatorId',
      'modelId',
      'modelLineageDigest',
      'modelFamilyOwnerId',
      'capabilityProfileId',
      'capabilityProfileDigest',
      'inferenceConfigurationDigest',
      'qualificationSliceDigest',
      'targetDigest',
    ])
  ) &&
  every(value.endpointSmokeTargets, (entry) =>
    exact(entry, [
      'smokeTargetId',
      'endpointClass',
      'protocolFamily',
      'providerConfigurationId',
      'adapterDigest',
      'smokeProfileDigest',
      'targetDigest',
    ])
  ) &&
  every(value.concreteCases, (entry) =>
    exact(entry, [
      'caseId',
      'familyId',
      'primaryBucket',
      'riskClass',
      'access',
      'capabilityProfileId',
      'fixtureRef',
      'caseDefinitionDigest',
      'expectedAuthorityDigest',
      'gradingPolicyDigest',
      'contextSentinel',
      'mediaSentinel',
      'subjectiveVisualQuality',
      'tags',
      'caseDigest',
    ])
  ) &&
  every(value.contextTiers, (entry) =>
    exact(entry, [
      'caseId',
      'tier',
      'contextPackDigest',
      'transformReceiptDigest',
      'cacheReceiptDigest',
      'tierDigest',
    ])
  ) &&
  every(value.mediaRepresentationTiers, (entry) =>
    exact(entry, [
      'caseId',
      'tier',
      'representationManifestDigest',
      'transformReceiptDigest',
      'omissionReceiptDigest',
      'tierDigest',
    ])
  ) &&
  exact(value.repetitionPolicy, [
    'rules',
    'highAssuranceCaseIds',
    'samplingIndependencePolicyDigest',
    'cacheAndStateIsolationPolicyDigest',
  ]) &&
  every(value.repetitionPolicy.rules, (entry) =>
    exact(
      entry,
      ['riskClass', 'minimumIndependentAttempts', 'confidenceLevel'],
      ['maximumFailureRateBound', 'sequentialStoppingRuleDigest']
    )
  ) &&
  exact(value.graderPlan, [
    'graders',
    'deterministicAuthorityGraderIds',
    'auxiliaryJudgeGraderIds',
    'blindHumanGraderIds',
    'minimumIndependentVisualRatings',
    'disagreementPolicyDigest',
    'randomizedPresentationPolicyDigest',
    'planDigest',
  ]) &&
  every(value.graderPlan.graders, (entry) =>
    exact(
      entry,
      [
        'graderId',
        'kind',
        'authority',
        'configurationDigest',
        'testedModelFamilyOwnerIds',
      ],
      ['providerConfigurationId', 'modelLineageDigest']
    )
  ) &&
  exact(value.thresholds, [
    'metrics',
    'multipleComparisonPolicyDigest',
    'slicePolicyDigest',
    'thresholdsDigest',
  ]) &&
  every(value.thresholds.metrics, (entry) =>
    exact(
      entry,
      [
        'metricId',
        'requiredAuthority',
        'maximumObservedFailureRate',
        'minimumSampleCount',
      ],
      ['maximumUpperConfidenceBound']
    )
  ) &&
  exact(value.budget, [
    'budget',
    'maxProviderJobs',
    'maxShards',
    'maxHumanRatings',
    'reservePolicyDigest',
    'budgetDigest',
  ]) &&
  hasBudgetShape(value.budget.budget);

const hasAttemptShape = (value: unknown): boolean =>
  exact(
    value,
    [
      'descriptor',
      'independentRunId',
      'status',
      'outcome',
      'metricObservations',
      'usage',
      'cost',
      'startedAt',
      'completedAt',
      'attemptDigest',
    ],
    ['invocationReceiptDigest', 'responseDigest']
  ) &&
  hasDescriptorShape(value.descriptor) &&
  every(value.metricObservations, (entry) =>
    exact(entry, [
      'metricId',
      'graderId',
      'graderKind',
      'authority',
      'verdict',
      'observationDigest',
    ])
  ) &&
  hasUsageShape(value.usage) &&
  every(value.cost, hasCostShape);

const hasCheckpointShape = (value: unknown): boolean =>
  exact(value, [
    'planDigest',
    'shardId',
    'revision',
    'leaseOwnerId',
    'leaseGeneration',
    'state',
    'completedAttemptRefs',
    'missingAttemptRefs',
    'budgetLedger',
    'updatedAt',
    'checkpointDigest',
  ]) &&
  every(value.completedAttemptRefs, hasAttemptRefShape) &&
  every(value.missingAttemptRefs, hasMissingRefShape) &&
  hasBudgetLedgerShape(value.budgetLedger);

const hasMetricReportShape = (value: unknown): boolean =>
  exact(value, [
    'reportId',
    'planDigest',
    'attemptSetDigest',
    'slices',
    'generatedAt',
    'reportDigest',
  ]) &&
  every(value.slices, (entry) =>
    exact(
      entry,
      [
        'sliceId',
        'metricId',
        'protocolFamily',
        'providerConfigurationId',
        'modelFamilyOwnerId',
        'capabilityProfileId',
        'primaryBucket',
        'familyId',
        'riskClass',
        'graderKind',
        'passed',
        'failed',
        'inconclusive',
        'denominator',
        'observedFailureRate',
        'upperConfidenceBound',
        'thresholdSatisfied',
        'sliceDigest',
      ],
      ['contextTier', 'mediaRepresentationTier']
    )
  );

const hasGraderReportShape = (value: unknown): boolean =>
  exact(value, [
    'reportId',
    'planDigest',
    'graderPlanDigest',
    'deterministicVerdictCount',
    'auxiliaryVerdictCount',
    'humanVerdictCount',
    'disagreementCount',
    'selfJudgeOnlyAttemptIds',
    'generatedAt',
    'reportDigest',
  ]);

const hasHumanReportShape = (value: unknown): boolean =>
  exact(value, [
    'reportId',
    'planDigest',
    'blindedArtifactSetDigest',
    'ratings',
    'adjudicationDigest',
    'generatedAt',
    'reportDigest',
  ]) &&
  every(value.ratings, (entry) =>
    exact(entry, [
      'ratingId',
      'attemptId',
      'reviewerPseudonym',
      'randomizedPresentationId',
      'rubricDigest',
      'verdict',
      'ratingDigest',
    ])
  );

const hasHoldoutReceiptShape = (value: unknown): boolean =>
  exact(value, [
    'receiptId',
    'planDigest',
    'protectedHoldoutManifestDigest',
    'accessPolicyDigest',
    'encryptedCorpusDigest',
    'executedCaseIds',
    'publicArtifactScanDigest',
    'leakedCaseIds',
    'executorPrincipalId',
    'executedAt',
    'receiptDigest',
  ]);

const hasManifestShape = (value: unknown): boolean =>
  exact(
    value,
    [
      'manifestId',
      'planDigest',
      'attemptRefs',
      'attemptCountByRisk',
      'missingOrInfrastructureAttemptRefs',
      'usage',
      'cost',
      'metricReportRef',
      'metricReportDigest',
      'graderReportRef',
      'graderReportDigest',
      'holdoutExecutionReceiptRef',
      'holdoutExecutionReceiptDigest',
      'qualificationTargetDigests',
      'outcome',
      'completedAt',
      'expiresAt',
      'manifestDigest',
    ],
    ['humanReviewReportRef', 'humanReviewReportDigest']
  ) &&
  every(value.attemptRefs, hasAttemptRefShape) &&
  exact(value.attemptCountByRisk, ['ordinary', 'critical', 'high-assurance']) &&
  every(value.missingOrInfrastructureAttemptRefs, hasMissingRefShape) &&
  hasUsageShape(value.usage) &&
  every(value.cost, hasCostShape);

export const hasExactAgentEvaluationFactShape = (
  fact: AgentEvaluationFact
): boolean => {
  if (!exact(fact, ['factType', 'value'])) return false;
  switch (fact.factType) {
    case 'evaluation-plan':
      return hasPlanShape(fact.value);
    case 'evaluation-attempt':
      return hasAttemptShape(fact.value);
    case 'evaluation-checkpoint':
      return hasCheckpointShape(fact.value);
    case 'evaluation-metric-report':
      return hasMetricReportShape(fact.value);
    case 'evaluation-grader-report':
      return hasGraderReportShape(fact.value);
    case 'evaluation-human-review-report':
      return hasHumanReportShape(fact.value);
    case 'evaluation-holdout-receipt':
      return hasHoldoutReceiptShape(fact.value);
    case 'evaluation-manifest':
      return hasManifestShape(fact.value);
  }
};

export const hasExactAgentEvaluationPlanShape = hasPlanShape;
export const hasExactAgentEvaluationAttemptShape = hasAttemptShape;
export const hasExactAgentEvaluationDescriptorShape = hasDescriptorShape;
export const hasExactAgentEvaluationCheckpointShape = hasCheckpointShape;
export const hasExactAgentEvaluationMetricReportShape = hasMetricReportShape;
export const hasExactAgentEvaluationGraderReportShape = hasGraderReportShape;
export const hasExactAgentEvaluationHumanReportShape = hasHumanReportShape;
export const hasExactAgentEvaluationHoldoutReceiptShape =
  hasHoldoutReceiptShape;
export const hasExactAgentEvaluationManifestShape = hasManifestShape;
