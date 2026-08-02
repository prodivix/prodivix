import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import type { AgentBudget, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentModelLineage,
  createAgentProviderConfigurationIdentity,
} from '../providers/agentProviderIdentity';
import {
  compareAgentDecimals,
  normalizeAgentDecimal,
} from '../usage/agentUsage';
import type {
  AgentCapabilityQualificationTarget,
  AgentEvaluationContextTier,
  AgentEvaluationEndpointSmokeTarget,
  AgentEvaluationGraderPlan,
  AgentEvaluationIssue,
  AgentEvaluationMetricThreshold,
  AgentEvaluationPrimaryBucket,
  AgentEvaluationRepetitionPolicy,
  AgentEvaluationRepetitionRule,
  AgentEvaluationRiskClass,
  AgentMediaRepresentationTier,
  AgentMediaRepresentationTierName,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationBudget,
  AgentModelEvaluationCase,
  AgentModelEvaluationPlan,
  AgentModelEvaluationThresholds,
} from './agentEvaluation.types';
import { hasExactAgentEvaluationPlanShape } from './agentEvaluationShape';

const bucketRequirements: Readonly<
  Record<
    AgentEvaluationPrimaryBucket,
    Readonly<{ minimumFamilies: number; minimumCases: number }>
  >
> = Object.freeze({
  'positive-cross-domain': Object.freeze({
    minimumFamilies: 12,
    minimumCases: 32,
  }),
  'adversarial-security': Object.freeze({
    minimumFamilies: 20,
    minimumCases: 48,
  }),
  'recovery-repair-reconciliation': Object.freeze({
    minimumFamilies: 8,
    minimumCases: 16,
  }),
  'capability-differential': Object.freeze({
    minimumFamilies: 12,
    minimumCases: 32,
  }),
});

const riskMinimums: Readonly<Record<AgentEvaluationRiskClass, number>> =
  Object.freeze({ ordinary: 10, critical: 30, 'high-assurance': 100 });

const nativeProtocolFamilies = Object.freeze([
  'anthropic-messages',
  'gemini-interactions',
  'openai-responses',
] as const);

const requiredCapabilityProfiles = Object.freeze([
  'g4-core-text-tools',
  'g4-document-input',
  'g4-visual-input',
]);
const evaluationPrimaryBuckets = new Set(Object.keys(bucketRequirements));
const evaluationRiskClasses = new Set(Object.keys(riskMinimums));
const evaluationAccessClasses = new Set([
  'public',
  'protected-holdout',
  'rotating-counterexample',
]);
const evaluationContextTiers = new Set([
  'small',
  'representative',
  'near-limit',
]);
const evaluationMediaTiers = new Set([
  'source-faithful',
  'representative-transform',
  'near-limit-transform',
]);
const providerProtocolFamilies = new Set([
  ...nativeProtocolFamilies,
  'openai-compatible',
]);
const endpointClasses = new Set([
  'first-party-hosted',
  'aggregator',
  'self-hosted',
  'local',
]);
const evaluationGraderKinds = new Set([
  'strict-decoder',
  'deterministic-rule',
  'domain-dry-run',
  'g3-closure',
  'perceptual-metric',
  'model-judge',
  'blind-human-rubric',
]);

const planValidationCache = new WeakMap<
  object,
  readonly AgentEvaluationIssue[]
>();
const plannedDescriptorCache = new WeakMap<
  object,
  readonly AgentModelEvaluationAttemptDescriptor[]
>();

const issue = (
  code: AgentEvaluationIssue['code'],
  path: string,
  message: string
): AgentEvaluationIssue =>
  Object.freeze({ code, path, message, blocking: true });

const canonicalArray = <T>(
  values: readonly T[],
  identity: (value: T) => string
): readonly T[] =>
  Object.freeze(
    values
      .map((value) => Object.freeze(cloneAgentControlJson(value)))
      .sort((left, right) =>
        compareUnicodeCodePoints(identity(left), identity(right))
      )
  );

const assertIdentity = (value: string, label: string): void => {
  if (!isAgentControlIdentity(value)) {
    throw new TypeError(`${label} is not a bounded canonical identity.`);
  }
};

const assertDigest = (value: string, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
};

const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} is not a non-negative safe integer.`);
  }
};

const omitDigest = <T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> => {
  const { [key]: _digest, ...base } = value;
  return base;
};

export const createAgentModelEvaluationCase = (
  input: Omit<AgentModelEvaluationCase, 'caseDigest'>
): AgentModelEvaluationCase => {
  assertIdentity(input.caseId, 'Evaluation case id');
  assertIdentity(input.familyId, 'Evaluation family id');
  assertIdentity(input.capabilityProfileId, 'Capability profile id');
  assertDigest(input.caseDefinitionDigest, 'Case definition digest');
  assertDigest(input.expectedAuthorityDigest, 'Expected authority digest');
  assertDigest(input.gradingPolicyDigest, 'Grading policy digest');
  if (
    !evaluationPrimaryBuckets.has(input.primaryBucket) ||
    !evaluationRiskClasses.has(input.riskClass) ||
    !evaluationAccessClasses.has(input.access) ||
    typeof input.contextSentinel !== 'boolean' ||
    typeof input.mediaSentinel !== 'boolean' ||
    typeof input.subjectiveVisualQuality !== 'boolean'
  ) {
    throw new TypeError('Evaluation case classification is invalid.');
  }
  if (
    !input.fixtureRef.trim() ||
    input.fixtureRef.length > 2_048 ||
    (input.access === 'protected-holdout' &&
      !input.fixtureRef.startsWith('holdout://')) ||
    (input.access !== 'protected-holdout' &&
      input.fixtureRef.startsWith('holdout://'))
  ) {
    throw new TypeError(
      'Evaluation fixture reference violates its public/holdout boundary.'
    );
  }
  const tags = Object.freeze([...input.tags].sort(compareUnicodeCodePoints));
  if (
    new Set(tags).size !== tags.length ||
    tags.some((tag) => !isAgentControlIdentity(tag))
  ) {
    throw new TypeError('Evaluation case tags must be unique identities.');
  }
  const base = Object.freeze({ ...input, tags });
  return Object.freeze({
    ...base,
    caseDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationContextTier = (
  input: Omit<AgentEvaluationContextTier, 'tierDigest'>
): AgentEvaluationContextTier => {
  assertIdentity(input.caseId, 'Context sentinel case id');
  if (!evaluationContextTiers.has(input.tier)) {
    throw new TypeError('Context sentinel tier is invalid.');
  }
  for (const [label, digest] of [
    ['Context Pack digest', input.contextPackDigest],
    ['Context transform receipt digest', input.transformReceiptDigest],
    ['Context cache receipt digest', input.cacheReceiptDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    tierDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentMediaRepresentationTier = (
  input: Omit<AgentMediaRepresentationTier, 'tierDigest'>
): AgentMediaRepresentationTier => {
  assertIdentity(input.caseId, 'Media sentinel case id');
  if (!evaluationMediaTiers.has(input.tier)) {
    throw new TypeError('Media representation tier is invalid.');
  }
  for (const [label, digest] of [
    [
      'Media representation manifest digest',
      input.representationManifestDigest,
    ],
    ['Media transform receipt digest', input.transformReceiptDigest],
    ['Media omission receipt digest', input.omissionReceiptDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    tierDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentCapabilityQualificationTarget = (
  input: Omit<AgentCapabilityQualificationTarget, 'targetDigest'>
): AgentCapabilityQualificationTarget => {
  for (const [label, value] of [
    ['Evaluation target id', input.targetId],
    ['Provider configuration id', input.providerConfigurationId],
    ['Provider operator id', input.providerOperatorId],
    ['Model id', input.modelId],
    ['Model family owner id', input.modelFamilyOwnerId],
    ['Capability profile id', input.capabilityProfileId],
  ] as const) {
    assertIdentity(value, label);
  }
  if (!providerProtocolFamilies.has(input.protocolFamily)) {
    throw new TypeError('Evaluation target protocol family is invalid.');
  }
  for (const [label, digest] of [
    ['Provider identity digest', input.providerIdentityDigest],
    ['Model lineage digest', input.modelLineageDigest],
    ['Capability profile digest', input.capabilityProfileDigest],
    ['Inference configuration digest', input.inferenceConfigurationDigest],
    ['Qualification slice digest', input.qualificationSliceDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    targetDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationEndpointSmokeTarget = (
  input: Omit<AgentEvaluationEndpointSmokeTarget, 'targetDigest'>
): AgentEvaluationEndpointSmokeTarget => {
  assertIdentity(input.smokeTargetId, 'Endpoint smoke target id');
  assertIdentity(input.providerConfigurationId, 'Provider configuration id');
  assertDigest(input.adapterDigest, 'Endpoint smoke adapter digest');
  assertDigest(input.smokeProfileDigest, 'Endpoint smoke profile digest');
  if (
    !endpointClasses.has(input.endpointClass) ||
    !providerProtocolFamilies.has(input.protocolFamily)
  ) {
    throw new TypeError('Endpoint smoke classification is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    targetDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeRule = (
  input: AgentEvaluationRepetitionRule
): AgentEvaluationRepetitionRule => {
  if (!evaluationRiskClasses.has(input.riskClass)) {
    throw new TypeError('Evaluation repetition risk class is invalid.');
  }
  const minimum = riskMinimums[input.riskClass];
  if (
    !Number.isSafeInteger(input.minimumIndependentAttempts) ||
    input.minimumIndependentAttempts < minimum
  ) {
    throw new TypeError(
      `${input.riskClass} evaluation requires at least ${minimum} independent attempts.`
    );
  }
  const confidenceLevel = normalizeAgentDecimal(input.confidenceLevel);
  if (
    compareAgentDecimals(confidenceLevel, '0') <= 0 ||
    compareAgentDecimals(confidenceLevel, '1') >= 0
  ) {
    throw new TypeError('Evaluation confidence level must be between 0 and 1.');
  }
  const maximumFailureRateBound =
    input.maximumFailureRateBound === undefined
      ? undefined
      : normalizeAgentDecimal(input.maximumFailureRateBound);
  if (
    maximumFailureRateBound !== undefined &&
    compareAgentDecimals(maximumFailureRateBound, '1') > 0
  ) {
    throw new TypeError('Maximum failure-rate bound cannot exceed 1.');
  }
  if (input.sequentialStoppingRuleDigest !== undefined) {
    assertDigest(
      input.sequentialStoppingRuleDigest,
      'Sequential stopping rule digest'
    );
  }
  return Object.freeze({
    riskClass: input.riskClass,
    minimumIndependentAttempts: input.minimumIndependentAttempts,
    confidenceLevel,
    ...(maximumFailureRateBound !== undefined
      ? { maximumFailureRateBound }
      : {}),
    ...(input.sequentialStoppingRuleDigest
      ? { sequentialStoppingRuleDigest: input.sequentialStoppingRuleDigest }
      : {}),
  });
};

export const createAgentEvaluationRepetitionPolicy = (
  input: AgentEvaluationRepetitionPolicy
): AgentEvaluationRepetitionPolicy => {
  assertDigest(
    input.samplingIndependencePolicyDigest,
    'Sampling independence policy digest'
  );
  assertDigest(
    input.cacheAndStateIsolationPolicyDigest,
    'Cache and state isolation policy digest'
  );
  const rules = canonicalArray(
    input.rules.map(normalizeRule),
    (rule) => rule.riskClass
  );
  if (
    rules.length !== 3 ||
    new Set(rules.map(({ riskClass }) => riskClass)).size !== 3
  ) {
    throw new TypeError(
      'Evaluation repetition policy requires all risk rules.'
    );
  }
  const highAssuranceCaseIds = Object.freeze(
    [...input.highAssuranceCaseIds].sort(compareUnicodeCodePoints)
  );
  if (
    highAssuranceCaseIds.length < 12 ||
    new Set(highAssuranceCaseIds).size !== highAssuranceCaseIds.length
  ) {
    throw new TypeError(
      'Evaluation repetition policy requires at least 12 unique high-assurance cases.'
    );
  }
  return Object.freeze({
    rules,
    highAssuranceCaseIds,
    samplingIndependencePolicyDigest: input.samplingIndependencePolicyDigest,
    cacheAndStateIsolationPolicyDigest:
      input.cacheAndStateIsolationPolicyDigest,
  });
};

export const createAgentEvaluationGraderPlan = (
  input: Omit<AgentEvaluationGraderPlan, 'planDigest'>
): AgentEvaluationGraderPlan => {
  assertDigest(input.disagreementPolicyDigest, 'Grader disagreement policy');
  assertDigest(
    input.randomizedPresentationPolicyDigest,
    'Randomized presentation policy'
  );
  if (
    !Number.isSafeInteger(input.minimumIndependentVisualRatings) ||
    input.minimumIndependentVisualRatings < 2
  ) {
    throw new TypeError('Visual quality requires at least two blind ratings.');
  }
  const graders = canonicalArray(input.graders, ({ graderId }) => graderId);
  if (
    new Set(graders.map(({ graderId }) => graderId)).size !== graders.length
  ) {
    throw new TypeError('Evaluation grader identities must be unique.');
  }
  for (const grader of graders) {
    assertIdentity(grader.graderId, 'Grader id');
    assertDigest(grader.configurationDigest, 'Grader configuration digest');
    if (
      !evaluationGraderKinds.has(grader.kind) ||
      !['deterministic', 'auxiliary', 'human'].includes(grader.authority) ||
      grader.testedModelFamilyOwnerIds.some(
        (ownerId) => !isAgentControlIdentity(ownerId)
      ) ||
      new Set(grader.testedModelFamilyOwnerIds).size !==
        grader.testedModelFamilyOwnerIds.length
    ) {
      throw new TypeError('Evaluation grader classification is invalid.');
    }
    if (
      (grader.kind === 'model-judge') !== (grader.authority === 'auxiliary') ||
      (grader.kind === 'blind-human-rubric') !== (grader.authority === 'human')
    ) {
      throw new TypeError('Grader kind and authority are inconsistent.');
    }
  }
  const graderIds = new Set(graders.map(({ graderId }) => graderId));
  const normalizeIds = (ids: readonly string[]): readonly string[] => {
    const normalized = Object.freeze([...ids].sort(compareUnicodeCodePoints));
    if (
      new Set(normalized).size !== normalized.length ||
      normalized.some((id) => !graderIds.has(id))
    ) {
      throw new TypeError(
        'Grader authority list contains an unknown identity.'
      );
    }
    return normalized;
  };
  const base = Object.freeze({
    graders,
    deterministicAuthorityGraderIds: normalizeIds(
      input.deterministicAuthorityGraderIds
    ),
    auxiliaryJudgeGraderIds: normalizeIds(input.auxiliaryJudgeGraderIds),
    blindHumanGraderIds: normalizeIds(input.blindHumanGraderIds),
    minimumIndependentVisualRatings: input.minimumIndependentVisualRatings,
    disagreementPolicyDigest: input.disagreementPolicyDigest,
    randomizedPresentationPolicyDigest:
      input.randomizedPresentationPolicyDigest,
  });
  if (base.deterministicAuthorityGraderIds.length === 0) {
    throw new TypeError('Evaluation requires deterministic grader authority.');
  }
  return Object.freeze({
    ...base,
    planDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeThreshold = (
  threshold: AgentEvaluationMetricThreshold
): AgentEvaluationMetricThreshold => {
  assertIdentity(threshold.metricId, 'Evaluation metric id');
  assertCount(threshold.minimumSampleCount, 'Metric minimum sample count');
  if (
    threshold.minimumSampleCount < 1 ||
    !['deterministic', 'human'].includes(threshold.requiredAuthority)
  ) {
    throw new TypeError(
      'Evaluation metric threshold authority or sample floor is invalid.'
    );
  }
  const maximumObservedFailureRate = normalizeAgentDecimal(
    threshold.maximumObservedFailureRate
  );
  const maximumUpperConfidenceBound =
    threshold.maximumUpperConfidenceBound === undefined
      ? undefined
      : normalizeAgentDecimal(threshold.maximumUpperConfidenceBound);
  for (const value of [
    maximumObservedFailureRate,
    maximumUpperConfidenceBound,
  ]) {
    if (value !== undefined && compareAgentDecimals(value, '1') > 0) {
      throw new TypeError('Evaluation failure-rate threshold cannot exceed 1.');
    }
  }
  return Object.freeze({
    ...threshold,
    maximumObservedFailureRate,
    ...(maximumUpperConfidenceBound !== undefined
      ? { maximumUpperConfidenceBound }
      : {}),
  });
};

export const createAgentModelEvaluationThresholds = (
  input: Omit<AgentModelEvaluationThresholds, 'thresholdsDigest'>
): AgentModelEvaluationThresholds => {
  assertDigest(
    input.multipleComparisonPolicyDigest,
    'Multiple comparison policy digest'
  );
  assertDigest(input.slicePolicyDigest, 'Metric slice policy digest');
  const metrics = canonicalArray(
    input.metrics.map(normalizeThreshold),
    ({ metricId }) => metricId
  );
  if (
    metrics.length === 0 ||
    new Set(metrics.map(({ metricId }) => metricId)).size !== metrics.length
  ) {
    throw new TypeError('Evaluation thresholds require unique metrics.');
  }
  const base = Object.freeze({
    metrics,
    multipleComparisonPolicyDigest: input.multipleComparisonPolicyDigest,
    slicePolicyDigest: input.slicePolicyDigest,
  });
  return Object.freeze({
    ...base,
    thresholdsDigest: digestAgentCanonicalValue(base),
  });
};

const canonicalBudget = (budget: AgentBudget): AgentBudget => {
  const usageLimits = canonicalArray(budget.usageLimits, ({ unit }) => unit);
  const costLimits = canonicalArray(
    budget.costLimits,
    ({ currency }) => currency
  );
  if (
    new Set(usageLimits.map(({ unit }) => unit)).size !== usageLimits.length ||
    new Set(costLimits.map(({ currency }) => currency)).size !==
      costLimits.length ||
    costLimits.some(({ currency }) => !/^[A-Z]{3}$/u.test(currency))
  ) {
    throw new TypeError('Evaluation budget limit identities are invalid.');
  }
  for (const { maximum } of [...usageLimits, ...costLimits]) {
    normalizeAgentDecimal(maximum);
  }
  for (const [label, value] of [
    ['maxModelInvocations', budget.maxModelInvocations],
    ['maxToolCalls', budget.maxToolCalls],
    ['maxRepairRounds', budget.maxRepairRounds],
    ['maxTransactions', budget.maxTransactions],
    ['maxArtifactBytes', budget.maxArtifactBytes],
    ['maxElapsedMs', budget.maxElapsedMs],
  ] as const) {
    assertCount(value, label);
  }
  return Object.freeze({
    ...budget,
    usageLimits,
    costLimits,
  });
};

export const createAgentModelEvaluationBudget = (
  input: Omit<AgentModelEvaluationBudget, 'budgetDigest'>
): AgentModelEvaluationBudget => {
  assertDigest(input.reservePolicyDigest, 'Evaluation reserve policy digest');
  for (const [label, value] of [
    ['maxProviderJobs', input.maxProviderJobs],
    ['maxShards', input.maxShards],
    ['maxHumanRatings', input.maxHumanRatings],
  ] as const) {
    assertCount(value, label);
  }
  if (input.maxShards === 0) {
    throw new TypeError('Evaluation budget requires at least one shard.');
  }
  const base = Object.freeze({
    budget: canonicalBudget(input.budget),
    maxProviderJobs: input.maxProviderJobs,
    maxShards: input.maxShards,
    maxHumanRatings: input.maxHumanRatings,
    reservePolicyDigest: input.reservePolicyDigest,
  });
  return Object.freeze({
    ...base,
    budgetDigest: digestAgentCanonicalValue(base),
  });
};

type ScheduleKey = Readonly<{
  caseId: string;
  targetId: string;
  targetDigest: CanonicalDigest;
  riskClass: AgentEvaluationRiskClass;
  contextTier?: AgentEvaluationContextTier['tier'];
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
  repetitionIndex: number;
}>;

const repetitionCount = (
  policy: AgentEvaluationRepetitionPolicy,
  riskClass: AgentEvaluationRiskClass
): number =>
  policy.rules.find((rule) => rule.riskClass === riskClass)
    ?.minimumIndependentAttempts ?? 0;

const scheduleVariants = (
  evaluationCase: AgentModelEvaluationCase
): readonly Readonly<{
  contextTier?: AgentEvaluationContextTier['tier'];
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
}>[] => {
  const base = Object.freeze({
    ...(evaluationCase.contextSentinel
      ? ({ contextTier: 'representative' as const } as const)
      : {}),
    ...(evaluationCase.mediaSentinel
      ? ({
          mediaRepresentationTier: 'representative-transform' as const,
        } as const)
      : {}),
  });
  return Object.freeze([
    base,
    ...(evaluationCase.contextSentinel
      ? [
          Object.freeze({
            ...base,
            contextTier: 'small' as const,
          }),
          Object.freeze({
            ...base,
            contextTier: 'near-limit' as const,
          }),
        ]
      : []),
    ...(evaluationCase.mediaSentinel
      ? [
          Object.freeze({
            ...base,
            mediaRepresentationTier: 'source-faithful' as const,
          }),
          Object.freeze({
            ...base,
            mediaRepresentationTier: 'near-limit-transform' as const,
          }),
        ]
      : []),
  ]);
};

const createScheduleKeys = (
  cases: readonly AgentModelEvaluationCase[],
  targets: readonly AgentCapabilityQualificationTarget[],
  repetitionPolicy: AgentEvaluationRepetitionPolicy
): readonly ScheduleKey[] => {
  const keys: ScheduleKey[] = [];
  for (const evaluationCase of cases) {
    const matchingTargets = targets.filter(
      ({ capabilityProfileId }) =>
        capabilityProfileId === evaluationCase.capabilityProfileId
    );
    const repetitions = repetitionCount(
      repetitionPolicy,
      evaluationCase.riskClass
    );
    for (const target of matchingTargets) {
      for (const variant of scheduleVariants(evaluationCase)) {
        for (
          let repetitionIndex = 0;
          repetitionIndex < repetitions;
          repetitionIndex += 1
        ) {
          keys.push(
            Object.freeze({
              caseId: evaluationCase.caseId,
              targetId: target.targetId,
              targetDigest: target.targetDigest,
              riskClass: evaluationCase.riskClass,
              ...variant,
              repetitionIndex,
            })
          );
        }
      }
    }
  }
  const identity = (key: ScheduleKey): string =>
    [
      key.caseId,
      key.targetId,
      key.riskClass,
      key.contextTier ?? '',
      key.mediaRepresentationTier ?? '',
      String(key.repetitionIndex).padStart(6, '0'),
    ].join('\u0000');
  return Object.freeze(
    keys.sort((left, right) =>
      compareUnicodeCodePoints(identity(left), identity(right))
    )
  );
};

const validateCorpus = (
  cases: readonly AgentModelEvaluationCase[]
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const caseIds = cases.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== cases.length) {
    issues.push(issue('AI-8010', '/concreteCases', 'Case ids are not unique.'));
  }
  for (const [bucket, requirement] of Object.entries(bucketRequirements) as [
    AgentEvaluationPrimaryBucket,
    (typeof bucketRequirements)[AgentEvaluationPrimaryBucket],
  ][]) {
    const selected = cases.filter(
      ({ primaryBucket }) => primaryBucket === bucket
    );
    const familyCount = new Set(selected.map(({ familyId }) => familyId)).size;
    const holdoutCount = selected.filter(
      ({ access }) => access === 'protected-holdout'
    ).length;
    if (
      selected.length < requirement.minimumCases ||
      familyCount < requirement.minimumFamilies
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/concreteCases/${bucket}`,
          `${bucket} requires ${requirement.minimumCases} cases across ${requirement.minimumFamilies} families.`
        )
      );
    }
    if (holdoutCount < Math.ceil(selected.length / 4)) {
      issues.push(
        issue(
          'AI-8010',
          `/concreteCases/${bucket}/holdout`,
          'Every primary bucket requires at least 25% protected holdout cases.'
        )
      );
    }
  }
  return Object.freeze(issues);
};

const validateSentinelBindings = (
  input: Readonly<{
    cases: readonly AgentModelEvaluationCase[];
    contextCaseIds: readonly string[];
    mediaCaseIds: readonly string[];
    contextTiers: readonly AgentEvaluationContextTier[];
    mediaTiers: readonly AgentMediaRepresentationTier[];
  }>
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const caseById = new Map(input.cases.map((entry) => [entry.caseId, entry]));
  if (
    input.contextCaseIds.length < 24 ||
    new Set(input.contextCaseIds).size !== input.contextCaseIds.length
  ) {
    issues.push(
      issue(
        'AI-8010',
        '/contextSentinelCaseIds',
        'At least 24 unique Context sentinel cases are required.'
      )
    );
  }
  if (
    input.mediaCaseIds.length < 16 ||
    new Set(input.mediaCaseIds).size !== input.mediaCaseIds.length
  ) {
    issues.push(
      issue(
        'AI-8010',
        '/mediaSentinelCaseIds',
        'At least 16 unique media sentinel cases are required.'
      )
    );
  }
  for (const caseId of input.contextCaseIds) {
    const bound = input.contextTiers.filter((entry) => entry.caseId === caseId);
    if (
      !caseById.get(caseId)?.contextSentinel ||
      new Set(bound.map(({ tier }) => tier)).size !== 3
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/contextTiers/${caseId}`,
          'Every Context sentinel requires three exact independent tier bindings.'
        )
      );
    }
  }
  for (const caseId of input.mediaCaseIds) {
    const bound = input.mediaTiers.filter((entry) => entry.caseId === caseId);
    if (
      !caseById.get(caseId)?.mediaSentinel ||
      new Set(bound.map(({ tier }) => tier)).size !== 3
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/mediaRepresentationTiers/${caseId}`,
          'Every media sentinel requires three exact representation bindings.'
        )
      );
    }
  }
  return Object.freeze(issues);
};

const validateDiversity = (
  providers: AgentModelEvaluationPlan['providerConfigurations'],
  models: AgentModelEvaluationPlan['modelConfigurations'],
  targets: AgentModelEvaluationPlan['capabilityQualificationTargets'],
  smokes: AgentModelEvaluationPlan['endpointSmokeTargets']
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const providerById = new Map(
    providers.map((provider) => [provider.providerConfigurationId, provider])
  );
  const modelByDigest = new Map(
    models.map((model) => [model.lineageDigest, model])
  );
  const requiredConfigurations = nativeProtocolFamilies.map((family) => {
    const configurations = providers.filter(
      ({ adapter }) => adapter.protocolFamily === family
    );
    if (configurations.length !== 1) {
      issues.push(
        issue(
          'AI-6010',
          `/providerConfigurations/${family}`,
          `Exactly one required ${family} configuration must be frozen.`
        )
      );
    }
    return configurations[0];
  });
  if (
    new Set(
      requiredConfigurations
        .filter(Boolean)
        .map(({ providerOperatorId }) => providerOperatorId)
    ).size !== 3
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/providerConfigurations/providerOperatorId',
        'Required native configurations need three independent operators.'
      )
    );
  }
  const ownerIds = new Set<string>();
  for (const provider of requiredConfigurations.filter(Boolean)) {
    for (const profileId of requiredCapabilityProfiles) {
      const matching = targets.filter(
        (target) =>
          target.providerConfigurationId ===
            provider!.providerConfigurationId &&
          target.capabilityProfileId === profileId
      );
      if (matching.length !== 1) {
        issues.push(
          issue(
            'AI-6010',
            `/capabilityQualificationTargets/${provider!.providerConfigurationId}/${profileId}`,
            'Every required provider/profile slice needs one exact target.'
          )
        );
      }
      const target = matching[0];
      if (target) ownerIds.add(target.modelFamilyOwnerId);
    }
  }
  if (ownerIds.size !== 3) {
    issues.push(
      issue(
        'AI-6010',
        '/modelConfigurations/modelFamilyOwnerId',
        'Required native configurations need three independent model-family owners.'
      )
    );
  }
  for (const target of targets) {
    const provider = providerById.get(target.providerConfigurationId);
    const model = modelByDigest.get(target.modelLineageDigest);
    if (
      !provider ||
      !model ||
      digestAgentCanonicalValue(provider) !== target.providerIdentityDigest ||
      provider.adapter.protocolFamily !== target.protocolFamily ||
      provider.providerOperatorId !== target.providerOperatorId ||
      model.modelId !== target.modelId ||
      model.modelFamilyOwnerId !== target.modelFamilyOwnerId
    ) {
      issues.push(
        issue(
          'AI-6010',
          `/capabilityQualificationTargets/${target.targetId}`,
          'Evaluation target drifted from its provider/model identity.'
        )
      );
    }
  }
  const compatibleSmokes = smokes.filter(
    ({ protocolFamily }) => protocolFamily === 'openai-compatible'
  );
  if (
    !compatibleSmokes.some(({ endpointClass }) =>
      ['first-party-hosted', 'aggregator'].includes(endpointClass)
    ) ||
    !compatibleSmokes.some(({ endpointClass }) =>
      ['local', 'self-hosted'].includes(endpointClass)
    )
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/endpointSmokeTargets',
        'Generic OpenAI-compatible requires hosted and local/self-hosted smoke targets.'
      )
    );
  }
  return Object.freeze(issues);
};

type PlanInput = Omit<
  AgentModelEvaluationPlan,
  'plannedJourneyCount' | 'plannedAttemptSetDigest' | 'planDigest'
>;

const canonicalizePlanInput = (input: PlanInput): PlanInput => {
  assertIdentity(input.evaluationPlanId, 'Evaluation plan id');
  assertIdentity(input.repositoryCommit, 'Repository commit');
  for (const [label, digest] of [
    ['Policy digest', input.policyDigest],
    ['Context builder digest', input.contextBuilderDigest],
    ['Semantic provider-set digest', input.semanticProviderSetDigest],
    ['Prompt-policy digest', input.promptPolicyDigest],
    ['Output-schema digest', input.outputSchemaDigest],
    ['Tool-registry digest', input.toolRegistryDigest],
    ['Action-registry digest', input.actionRegistryDigest],
    ['Public corpus digest', input.publicCorpusDigest],
    ['Protected holdout manifest digest', input.protectedHoldoutManifestDigest],
    ['Rotating corpus policy digest', input.rotatingCorpusPolicyDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  if (
    !isAgentControlInstant(input.plannedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.plannedAt)
  ) {
    throw new TypeError('Evaluation plan expiry is invalid.');
  }
  const providers = canonicalArray(
    input.providerConfigurations.map((provider) =>
      createAgentProviderConfigurationIdentity(provider)
    ),
    ({ providerConfigurationId }) => providerConfigurationId
  );
  const models = canonicalArray(
    input.modelConfigurations.map((model) =>
      createAgentModelLineage(omitDigest(model, 'lineageDigest'))
    ),
    ({ lineageDigest }) => lineageDigest
  );
  const cases = canonicalArray(
    input.concreteCases.map((entry) =>
      createAgentModelEvaluationCase(omitDigest(entry, 'caseDigest'))
    ),
    ({ caseId }) => caseId
  );
  const contextTiers = canonicalArray(
    input.contextTiers.map((entry) =>
      createAgentEvaluationContextTier(omitDigest(entry, 'tierDigest'))
    ),
    (entry) => `${entry.caseId}\u0000${entry.tier}`
  );
  const mediaTiers = canonicalArray(
    input.mediaRepresentationTiers.map((entry) =>
      createAgentMediaRepresentationTier(omitDigest(entry, 'tierDigest'))
    ),
    (entry) => `${entry.caseId}\u0000${entry.tier}`
  );
  return Object.freeze({
    ...cloneAgentControlJson(input),
    providerConfigurations: providers,
    modelConfigurations: models,
    capabilityQualificationTargets: canonicalArray(
      input.capabilityQualificationTargets.map((entry) =>
        createAgentCapabilityQualificationTarget(
          omitDigest(entry, 'targetDigest')
        )
      ),
      ({ targetId }) => targetId
    ),
    endpointSmokeTargets: canonicalArray(
      input.endpointSmokeTargets.map((entry) =>
        createAgentEvaluationEndpointSmokeTarget(
          omitDigest(entry, 'targetDigest')
        )
      ),
      ({ smokeTargetId }) => smokeTargetId
    ),
    concreteCases: cases,
    contextTiers,
    mediaRepresentationTiers: mediaTiers,
    contextSentinelCaseIds: Object.freeze(
      [...input.contextSentinelCaseIds].sort(compareUnicodeCodePoints)
    ),
    mediaSentinelCaseIds: Object.freeze(
      [...input.mediaSentinelCaseIds].sort(compareUnicodeCodePoints)
    ),
    repetitionPolicy: createAgentEvaluationRepetitionPolicy(
      input.repetitionPolicy
    ),
    graderPlan: createAgentEvaluationGraderPlan(
      omitDigest(input.graderPlan, 'planDigest')
    ),
    thresholds: createAgentModelEvaluationThresholds(
      omitDigest(input.thresholds, 'thresholdsDigest')
    ),
    budget: createAgentModelEvaluationBudget(
      omitDigest(input.budget, 'budgetDigest')
    ),
  });
};

export const validateAgentModelEvaluationPlan = (
  plan: AgentModelEvaluationPlan
): readonly AgentEvaluationIssue[] => {
  const cached = planValidationCache.get(plan as object);
  if (cached) return cached;
  const issues: AgentEvaluationIssue[] = [];
  if (!hasExactAgentEvaluationPlanShape(plan)) {
    const invalidShape = Object.freeze([
      issue('AI-9001', '/', 'Evaluation plan shape or member set is invalid.'),
    ]);
    if (Object.isFrozen(plan)) planValidationCache.set(plan, invalidShape);
    return invalidShape;
  }
  if (inspectAgentControlJson(plan, 16_777_216).length > 0) {
    const unsafe = Object.freeze([
      issue('AI-9001', '/', 'Evaluation plan is not bounded safe JSON.'),
    ]);
    if (Object.isFrozen(plan)) planValidationCache.set(plan, unsafe);
    return unsafe;
  }
  try {
    const {
      planDigest: _planDigest,
      plannedJourneyCount,
      plannedAttemptSetDigest,
      ...input
    } = plan;
    const canonical = canonicalizePlanInput(input);
    if (!sameCanonicalJson(canonical, input)) {
      issues.push(
        issue('AI-9001', '/', 'Evaluation plan is not in canonical order.')
      );
    }
    issues.push(...validateCorpus(canonical.concreteCases));
    issues.push(
      ...validateSentinelBindings({
        cases: canonical.concreteCases,
        contextCaseIds: canonical.contextSentinelCaseIds,
        mediaCaseIds: canonical.mediaSentinelCaseIds,
        contextTiers: canonical.contextTiers,
        mediaTiers: canonical.mediaRepresentationTiers,
      })
    );
    issues.push(
      ...validateDiversity(
        canonical.providerConfigurations,
        canonical.modelConfigurations,
        canonical.capabilityQualificationTargets,
        canonical.endpointSmokeTargets
      )
    );
    const highAssurance = canonical.concreteCases
      .filter(({ riskClass }) => riskClass === 'high-assurance')
      .map(({ caseId }) => caseId)
      .sort(compareUnicodeCodePoints);
    if (
      highAssurance.length < 12 ||
      !sameCanonicalJson(
        highAssurance,
        canonical.repetitionPolicy.highAssuranceCaseIds
      )
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/repetitionPolicy/highAssuranceCaseIds',
          'High-assurance case identity must exactly match at least 12 corpus cases.'
        )
      );
    }
    if (
      canonical.concreteCases.some(
        ({ primaryBucket, riskClass }) =>
          primaryBucket === 'adversarial-security' && riskClass === 'ordinary'
      )
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/concreteCases/adversarial-security',
          'Every adversarial/security case must be critical or high-assurance.'
        )
      );
    }
    const keys = createScheduleKeys(
      canonical.concreteCases,
      canonical.capabilityQualificationTargets,
      canonical.repetitionPolicy
    );
    const expectedAttemptSetDigest = digestAgentCanonicalValue(keys);
    if (
      plannedJourneyCount !== keys.length ||
      plannedAttemptSetDigest !== expectedAttemptSetDigest ||
      keys.length < 11_640
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/plannedJourneyCount',
          'Evaluation schedule drifted or falls below the 11,640 journey floor.'
        )
      );
    }
    if (
      canonical.budget.budget.maxModelInvocations < keys.length ||
      canonical.budget.maxShards <
        new Set(keys.map(({ targetId }) => targetId)).size ||
      canonical.budget.maxHumanRatings <
        canonical.concreteCases
          .filter(({ subjectiveVisualQuality }) => subjectiveVisualQuality)
          .reduce(
            (total, evaluationCase) =>
              total +
              canonical.capabilityQualificationTargets.filter(
                ({ capabilityProfileId }) =>
                  capabilityProfileId === evaluationCase.capabilityProfileId
              ).length *
                canonical.graderPlan.minimumIndependentVisualRatings,
            0
          )
    ) {
      issues.push(
        issue(
          'AI-6002',
          '/budget',
          'Evaluation budget cannot reserve the frozen attempt/shard schedule.'
        )
      );
    }
    const base = Object.freeze({
      ...canonical,
      plannedJourneyCount,
      plannedAttemptSetDigest,
    });
    if (digestAgentCanonicalValue(base) !== plan.planDigest) {
      issues.push(
        issue('AI-9001', '/planDigest', 'Evaluation plan digest drifted.')
      );
    }
  } catch (caught) {
    issues.push(
      issue(
        'AI-9001',
        '/',
        caught instanceof Error
          ? caught.message
          : 'Evaluation plan semantic validation failed.'
      )
    );
  }
  const result = Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.code, right.code) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
  if (Object.isFrozen(plan)) planValidationCache.set(plan, result);
  return result;
};

export const createAgentModelEvaluationPlan = (
  input: PlanInput
): AgentModelEvaluationPlan => {
  const canonical = canonicalizePlanInput(input);
  const keys = createScheduleKeys(
    canonical.concreteCases,
    canonical.capabilityQualificationTargets,
    canonical.repetitionPolicy
  );
  const base = Object.freeze({
    ...canonical,
    plannedJourneyCount: keys.length,
    plannedAttemptSetDigest: digestAgentCanonicalValue(keys),
  });
  const plan = Object.freeze({
    ...base,
    planDigest: digestAgentCanonicalValue(base),
  });
  const issues = validateAgentModelEvaluationPlan(plan);
  if (issues.length > 0) {
    throw new TypeError(issues.map(({ message }) => message).join('; '));
  }
  return plan;
};

export const isAgentModelEvaluationPlan = (
  value: unknown
): value is AgentModelEvaluationPlan => {
  if (!value || typeof value !== 'object') return false;
  return (
    validateAgentModelEvaluationPlan(value as AgentModelEvaluationPlan)
      .length === 0
  );
};

export const planAgentModelEvaluationAttempts = (
  plan: AgentModelEvaluationPlan
): readonly AgentModelEvaluationAttemptDescriptor[] => {
  const cached = plannedDescriptorCache.get(plan as object);
  if (cached) return cached;
  const issues = validateAgentModelEvaluationPlan(plan);
  if (issues.length > 0) {
    throw new TypeError(
      `Cannot schedule invalid evaluation plan: ${issues.map(({ message }) => message).join('; ')}`
    );
  }
  const descriptors = Object.freeze(
    createScheduleKeys(
      plan.concreteCases,
      plan.capabilityQualificationTargets,
      plan.repetitionPolicy
    ).map((key) => {
      const samplingIdentityDigest = digestAgentCanonicalValue({
        planDigest: plan.planDigest,
        ...key,
      });
      const base = Object.freeze({
        attemptId: `evaluation-attempt:${samplingIdentityDigest.slice('sha256-'.length)}`,
        planDigest: plan.planDigest,
        shardId: `evaluation-shard:${digestAgentCanonicalValue({ targetId: key.targetId }).slice('sha256-'.length)}`,
        caseId: key.caseId,
        targetId: key.targetId,
        targetDigest: key.targetDigest,
        riskClass: key.riskClass,
        ...(key.contextTier ? { contextTier: key.contextTier } : {}),
        ...(key.mediaRepresentationTier
          ? { mediaRepresentationTier: key.mediaRepresentationTier }
          : {}),
        repetitionIndex: key.repetitionIndex,
        samplingIdentityDigest,
      });
      return Object.freeze({
        ...base,
        descriptorDigest: digestAgentCanonicalValue(base),
      });
    })
  );
  if (Object.isFrozen(plan)) plannedDescriptorCache.set(plan, descriptors);
  return descriptors;
};

export const minimumAgentEvaluationJourneyFloor = 11_640;
export const agentEvaluationRequiredCapabilityProfiles =
  requiredCapabilityProfiles;
export const agentEvaluationNativeProtocolFamilies = nativeProtocolFamilies;
