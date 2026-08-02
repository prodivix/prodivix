import {
  createAgentCapabilityQualificationTarget,
  createAgentEvaluationEndpointSmokeTarget,
  createAgentEvaluationGraderPlan,
  createAgentEvaluationMetricObservation,
  createAgentEvaluationRepetitionPolicy,
  createAgentHoldoutExecutionReceipt,
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
  createAgentModelEvaluationAttempt,
  createAgentModelEvaluationBudget,
  createAgentModelEvaluationPlan,
  createAgentModelEvaluationThresholds,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
  createAgentModelLineage,
  createAgentQualificationSliceDigest,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  planAgentModelEvaluationAttempts,
  type AgentCapabilityQualificationTarget,
  type AgentEvaluationGraderReport,
  type AgentEvaluationMetricReport,
  type AgentHoldoutExecutionReceipt,
  type AgentHumanReviewReport,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationPlan,
  type AgentProviderProtocolFamily,
} from '../index';

export const V8_TIME = Object.freeze({
  planned: '2026-08-02T00:00:00.000Z',
  started: '2026-08-02T01:00:00.000Z',
  completed: '2026-08-02T02:00:00.000Z',
  evaluated: '2026-08-02T03:00:00.000Z',
  expires: '2026-08-09T00:00:00.000Z',
});

const providerSpec = (
  family: AgentProviderProtocolFamily,
  operator: string,
  owner: string
) => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: `adapter.${family}.v8`,
    adapterVersion: '1.0.0',
    protocolFamily: family,
    transportSchemaDigest: digestAgentCanonicalValue({ family, version: 1 }),
    eventNormalizationDigest: digestAgentCanonicalValue({
      normalized: 'agent-provider-event-v1',
    }),
  });
  const dataPolicy = createAgentProviderDataPolicy({
    region: 'evaluation-region',
    maximumSensitivity: 'internal',
    training: 'disabled',
    telemetry: 'disabled',
    retentionDays: 0,
    deletionReceipt: 'available',
    ambientMemory: 'disabled',
    storage: 'disabled',
    cacheIsolation: 'invocation',
  });
  const provider = createAgentProviderConfigurationIdentity({
    providerConfigurationId: `provider.${family}.v8`,
    providerOperatorId: operator,
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue({ family, endpoint: 1 }),
    providerRegion: 'evaluation-region',
    apiRevision: '2026-08-02',
    adapter,
    dataPolicyDigest: dataPolicy.policyDigest,
  });
  const model = createAgentModelLineage({
    modelId: `model.${family}.v8`,
    modelFamilyId: `family.${family}.v8`,
    modelFamilyOwnerId: owner,
    immutableVersion: '2026-08-02',
  });
  return Object.freeze({ adapter, dataPolicy, provider, model });
};

export const V8_NATIVE_CONFIGURATIONS = Object.freeze([
  providerSpec('openai-responses', 'operator.openai.v8', 'owner.openai.v8'),
  providerSpec(
    'anthropic-messages',
    'operator.anthropic.v8',
    'owner.anthropic.v8'
  ),
  providerSpec('gemini-interactions', 'operator.google.v8', 'owner.google.v8'),
]);

const policyDigest = digestAgentCanonicalValue('g4-v8-policy');
const profileIds = Object.freeze([
  'g4-core-text-tools',
  'g4-document-input',
  'g4-visual-input',
]);

const qualificationTargets =
  (): readonly AgentCapabilityQualificationTarget[] =>
    Object.freeze(
      V8_NATIVE_CONFIGURATIONS.flatMap(({ provider, model }) =>
        profileIds.map((profileId) => {
          const profileDigest = digestAgentCanonicalValue({ profileId });
          return createAgentCapabilityQualificationTarget({
            targetId: `target.${provider.adapter.protocolFamily}.${profileId}`,
            providerConfigurationId: provider.providerConfigurationId,
            providerIdentityDigest: digestAgentCanonicalValue(provider),
            protocolFamily: provider.adapter.protocolFamily,
            providerOperatorId: provider.providerOperatorId,
            modelId: model.modelId,
            modelLineageDigest: model.lineageDigest,
            modelFamilyOwnerId: model.modelFamilyOwnerId,
            capabilityProfileId: profileId,
            capabilityProfileDigest: profileDigest,
            inferenceConfigurationDigest: digestAgentCanonicalValue({
              profileId,
              inference: 'v8',
            }),
            qualificationSliceDigest: createAgentQualificationSliceDigest({
              provider,
              model,
              capabilityProfileDigest: profileDigest,
              policyProfileDigest: policyDigest,
            }),
          });
        })
      )
    );

let cachedEvaluationPlan: AgentModelEvaluationPlan | undefined;

export const createV8EvaluationPlan = (): AgentModelEvaluationPlan => {
  if (cachedEvaluationPlan) return cachedEvaluationPlan;
  const highAssuranceCaseIds = G4_V8_MINIMUM_EVALUATION_CORPUS.cases
    .filter(({ riskClass }) => riskClass === 'high-assurance')
    .map(({ caseId }) => caseId);
  cachedEvaluationPlan = createAgentModelEvaluationPlan({
    evaluationPlanId: 'evaluation-plan.g4-v8.minimum',
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    policyDigest,
    contextBuilderDigest: digestAgentCanonicalValue('context-builder-v8'),
    semanticProviderSetDigest: digestAgentCanonicalValue(
      'semantic-provider-set-v8'
    ),
    promptPolicyDigest: digestAgentCanonicalValue('prompt-policy-v8'),
    outputSchemaDigest: digestAgentCanonicalValue('output-schema-v8'),
    toolRegistryDigest: digestAgentCanonicalValue('tool-registry-v8'),
    actionRegistryDigest: digestAgentCanonicalValue('action-registry-v8'),
    providerConfigurations: V8_NATIVE_CONFIGURATIONS.map(
      ({ provider }) => provider
    ),
    modelConfigurations: V8_NATIVE_CONFIGURATIONS.map(({ model }) => model),
    capabilityQualificationTargets: qualificationTargets(),
    endpointSmokeTargets: Object.freeze([
      createAgentEvaluationEndpointSmokeTarget({
        smokeTargetId: 'smoke.openai-compatible.hosted',
        endpointClass: 'aggregator',
        protocolFamily: 'openai-compatible',
        providerConfigurationId: 'provider.compatible.hosted',
        adapterDigest: digestAgentCanonicalValue('compatible-hosted-adapter'),
        smokeProfileDigest: digestAgentCanonicalValue('compatible-smoke'),
      }),
      createAgentEvaluationEndpointSmokeTarget({
        smokeTargetId: 'smoke.openai-compatible.local',
        endpointClass: 'local',
        protocolFamily: 'openai-compatible',
        providerConfigurationId: 'provider.compatible.local',
        adapterDigest: digestAgentCanonicalValue('compatible-local-adapter'),
        smokeProfileDigest: digestAgentCanonicalValue('compatible-smoke'),
      }),
    ]),
    publicCorpusDigest: G4_V8_MINIMUM_EVALUATION_CORPUS.publicCorpusDigest,
    protectedHoldoutManifestDigest:
      G4_V8_MINIMUM_EVALUATION_CORPUS.protectedHoldoutManifestDigest,
    rotatingCorpusPolicyDigest: digestAgentCanonicalValue(
      'rotating-counterexample-policy-v8'
    ),
    concreteCases: G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
    contextTiers: G4_V8_MINIMUM_EVALUATION_CORPUS.contextTiers,
    mediaRepresentationTiers:
      G4_V8_MINIMUM_EVALUATION_CORPUS.mediaRepresentationTiers,
    contextSentinelCaseIds:
      G4_V8_MINIMUM_EVALUATION_CORPUS.contextSentinelCaseIds,
    mediaSentinelCaseIds: G4_V8_MINIMUM_EVALUATION_CORPUS.mediaSentinelCaseIds,
    repetitionPolicy: createAgentEvaluationRepetitionPolicy({
      rules: Object.freeze([
        Object.freeze({
          riskClass: 'ordinary',
          minimumIndependentAttempts: 10,
          confidenceLevel: '0.95',
        }),
        Object.freeze({
          riskClass: 'critical',
          minimumIndependentAttempts: 30,
          confidenceLevel: '0.95',
          maximumFailureRateBound: '0.1',
        }),
        Object.freeze({
          riskClass: 'high-assurance',
          minimumIndependentAttempts: 100,
          confidenceLevel: '0.95',
          maximumFailureRateBound: '0.03',
        }),
      ]),
      highAssuranceCaseIds,
      samplingIndependencePolicyDigest: digestAgentCanonicalValue(
        'independent-run-per-attempt-v8'
      ),
      cacheAndStateIsolationPolicyDigest: digestAgentCanonicalValue(
        'invocation-isolated-cache-state-v8'
      ),
    }),
    graderPlan: createAgentEvaluationGraderPlan({
      graders: Object.freeze([
        Object.freeze({
          graderId: 'grader.strict-authority.v8',
          kind: 'deterministic-rule',
          authority: 'deterministic',
          configurationDigest: digestAgentCanonicalValue('strict-authority-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
        Object.freeze({
          graderId: 'grader.auxiliary-judge.v8',
          kind: 'model-judge',
          authority: 'auxiliary',
          configurationDigest: digestAgentCanonicalValue('auxiliary-judge-v8'),
          providerConfigurationId: 'provider.judge.v8',
          modelLineageDigest: digestAgentCanonicalValue('judge-lineage-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
        Object.freeze({
          graderId: 'grader.blind-human.v8',
          kind: 'blind-human-rubric',
          authority: 'human',
          configurationDigest: digestAgentCanonicalValue('visual-rubric-v8'),
          testedModelFamilyOwnerIds: Object.freeze([]),
        }),
      ]),
      deterministicAuthorityGraderIds: Object.freeze([
        'grader.strict-authority.v8',
      ]),
      auxiliaryJudgeGraderIds: Object.freeze(['grader.auxiliary-judge.v8']),
      blindHumanGraderIds: Object.freeze(['grader.blind-human.v8']),
      minimumIndependentVisualRatings: 2,
      disagreementPolicyDigest: digestAgentCanonicalValue(
        'human-adjudication-v8'
      ),
      randomizedPresentationPolicyDigest: digestAgentCanonicalValue(
        'blind-randomized-presentation-v8'
      ),
    }),
    thresholds: createAgentModelEvaluationThresholds({
      metrics: Object.freeze([
        Object.freeze({
          metricId: 'authority.correctness',
          requiredAuthority: 'deterministic',
          maximumObservedFailureRate: '0',
          maximumUpperConfidenceBound: '0.5',
          minimumSampleCount: 10,
        }),
      ]),
      multipleComparisonPolicyDigest: digestAgentCanonicalValue(
        'multiple-comparison-v8'
      ),
      slicePolicyDigest: digestAgentCanonicalValue('exact-slice-policy-v8'),
    }),
    budget: createAgentModelEvaluationBudget({
      budget: Object.freeze({
        usageLimits: Object.freeze([
          Object.freeze({
            unit: 'text-token-input',
            maximum: '10000000000',
          }),
          Object.freeze({
            unit: 'text-token-output',
            maximum: '10000000000',
          }),
          Object.freeze({ unit: 'image-pixel', maximum: '1000000000000' }),
          Object.freeze({ unit: 'document-page', maximum: '10000000' }),
          Object.freeze({ unit: 'hosted-tool-call', maximum: '10000000' }),
        ]),
        costLimits: Object.freeze([
          Object.freeze({ currency: 'USD', maximum: '1000000' }),
        ]),
        maxModelInvocations: 1_000_000,
        maxToolCalls: 10_000_000,
        maxRepairRounds: 0,
        maxTransactions: 100_000,
        maxArtifactBytes: 10_000_000_000,
        maxElapsedMs: 604_800_000,
      }),
      maxProviderJobs: 1_000_000,
      maxShards: 64,
      maxHumanRatings: 100_000,
      reservePolicyDigest: digestAgentCanonicalValue('shard-reserve-v8'),
    }),
    plannedAt: V8_TIME.planned,
    expiresAt: V8_TIME.expires,
  });
  return cachedEvaluationPlan;
};

const cachedPassingAttempts = new WeakMap<
  object,
  readonly AgentModelEvaluationAttempt[]
>();

export const createPassingV8Attempts = (
  plan: AgentModelEvaluationPlan
): readonly AgentModelEvaluationAttempt[] => {
  const cached = cachedPassingAttempts.get(plan);
  if (cached) return cached;
  const attempts = Object.freeze(
    planAgentModelEvaluationAttempts(plan).map((descriptor) =>
      createAgentModelEvaluationAttempt({
        descriptor,
        independentRunId: `run.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
        invocationReceiptDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          receipt: true,
        }),
        responseDigest: digestAgentCanonicalValue({
          attemptId: descriptor.attemptId,
          response: true,
        }),
        status: 'completed',
        outcome: 'passed',
        metricObservations: Object.freeze([
          createAgentEvaluationMetricObservation({
            metricId: 'authority.correctness',
            graderId: 'grader.strict-authority.v8',
            graderKind: 'deterministic-rule',
            authority: 'deterministic',
            verdict: 'passed',
          }),
        ]),
        usage: createAgentUsageVector([
          Object.freeze({
            unit: 'text-token-input',
            logicalAmount: '1',
            billableAmount: '1',
            confidence: 'reported',
          }),
          Object.freeze({
            unit: 'text-token-output',
            logicalAmount: '1',
            billableAmount: '1',
            confidence: 'reported',
          }),
        ]),
        cost: Object.freeze([
          Object.freeze({
            currency: 'USD',
            amount: '0.000001',
            confidence: 'measured',
          }),
        ]),
        startedAt: V8_TIME.started,
        completedAt: V8_TIME.completed,
      })
    )
  );
  cachedPassingAttempts.set(plan, attempts);
  return attempts;
};

export const createV8HumanReviewReport = (
  plan: AgentModelEvaluationPlan
): AgentHumanReviewReport => {
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const subjective = new Map<string, (typeof descriptors)[number]>();
  const subjectiveCaseIds = new Set(
    plan.concreteCases
      .filter(({ subjectiveVisualQuality }) => subjectiveVisualQuality)
      .map(({ caseId }) => caseId)
  );
  for (const descriptor of descriptors) {
    if (!subjectiveCaseIds.has(descriptor.caseId)) continue;
    const key = `${descriptor.caseId}\u0000${descriptor.targetId}`;
    if (!subjective.has(key)) subjective.set(key, descriptor);
  }
  return createAgentHumanReviewReport({
    reportId: 'human-review.g4-v8.minimum',
    planDigest: plan.planDigest,
    blindedArtifactSetDigest: digestAgentCanonicalValue('blinded-artifacts-v8'),
    ratings: Object.freeze(
      [...subjective.values()].flatMap((descriptor) =>
        ['reviewer-a', 'reviewer-b'].map((reviewer, index) =>
          createAgentHumanReviewRating({
            ratingId: `rating.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}.${index}`,
            attemptId: descriptor.attemptId,
            reviewerPseudonym: reviewer,
            randomizedPresentationId: `presentation.${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
            rubricDigest: digestAgentCanonicalValue('visual-rubric-v8'),
            verdict: 'passed',
          })
        )
      )
    ),
    adjudicationDigest: digestAgentCanonicalValue('no-disagreement-v8'),
    generatedAt: V8_TIME.evaluated,
  });
};

export const createV8HoldoutReceipt = (
  plan: AgentModelEvaluationPlan
): AgentHoldoutExecutionReceipt =>
  createAgentHoldoutExecutionReceipt({
    receiptId: 'holdout-receipt.g4-v8.minimum',
    planDigest: plan.planDigest,
    protectedHoldoutManifestDigest: plan.protectedHoldoutManifestDigest,
    accessPolicyDigest: digestAgentCanonicalValue('holdout-access-v8'),
    encryptedCorpusDigest: digestAgentCanonicalValue('encrypted-holdout-v8'),
    executedCaseIds: plan.concreteCases
      .filter(({ access }) => access === 'protected-holdout')
      .map(({ caseId }) => caseId),
    publicArtifactScanDigest: digestAgentCanonicalValue(
      'holdout-scan-clean-v8'
    ),
    leakedCaseIds: Object.freeze([]),
    executorPrincipalId: 'evaluation-holdout-runner',
    executedAt: V8_TIME.evaluated,
  });

export type V8Reports = Readonly<{
  metric: AgentEvaluationMetricReport;
  grader: AgentEvaluationGraderReport;
  human: AgentHumanReviewReport;
  holdout: AgentHoldoutExecutionReceipt;
}>;
