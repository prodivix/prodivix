import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentCost,
  AgentModelEvaluationQualification,
} from '../providers/agentProvider.types';
import {
  compareAgentDecimals,
  createAgentUsageVector,
  normalizeAgentCosts,
  normalizeAgentDecimal,
} from '../usage/agentUsage';
import {
  createAgentBudgetLedger,
  isAgentBudgetLedgerState,
  reserveAgentBudget,
} from '../usage/agentBudgetLedger';
import type {
  AgentEvaluationGraderKind,
  AgentEvaluationGraderReport,
  AgentEvaluationIssue,
  AgentEvaluationShardCheckpoint,
  AgentEvaluationMetricObservation,
  AgentEvaluationMetricReport,
  AgentEvaluationMetricSlice,
  AgentEvaluationRiskClass,
  AgentHoldoutExecutionReceipt,
  AgentHumanReviewRating,
  AgentHumanReviewReport,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationAttemptRef,
  AgentModelEvaluationManifest,
  AgentModelEvaluationMissingAttemptRef,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import {
  planAgentModelEvaluationAttempts,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import {
  hasExactAgentEvaluationAttemptShape,
  hasExactAgentEvaluationCheckpointShape,
  hasExactAgentEvaluationDescriptorShape,
  hasExactAgentEvaluationGraderReportShape,
  hasExactAgentEvaluationHoldoutReceiptShape,
  hasExactAgentEvaluationHumanReportShape,
  hasExactAgentEvaluationManifestShape,
  hasExactAgentEvaluationMetricReportShape,
} from './agentEvaluationShape';

const riskClasses = new Set(['ordinary', 'critical', 'high-assurance']);
const contextTiers = new Set(['small', 'representative', 'near-limit']);
const mediaRepresentationTiers = new Set([
  'source-faithful',
  'representative-transform',
  'near-limit-transform',
]);
const graderKinds = new Set([
  'strict-decoder',
  'deterministic-rule',
  'domain-dry-run',
  'g3-closure',
  'perceptual-metric',
  'model-judge',
  'blind-human-rubric',
]);
const observationAuthorities = new Set(['deterministic', 'auxiliary', 'human']);
const verdicts = new Set(['passed', 'failed', 'inconclusive']);
const attemptStatuses = new Set([
  'completed',
  'provider-error',
  'timed-out',
  'rate-limited',
  'schema-failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
]);
const missingReasons = new Set([
  'missing',
  'provider-error',
  'timed-out',
  'rate-limited',
  'schema-failed',
  'blocked',
  'cancelled',
  'infrastructure-error',
]);
const protocolFamilies = new Set([
  'openai-responses',
  'anthropic-messages',
  'gemini-interactions',
  'openai-compatible',
]);
const primaryBuckets = new Set([
  'positive-cross-domain',
  'adversarial-security',
  'recovery-repair-reconciliation',
  'capability-differential',
]);

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

const assertIdentity: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentControlIdentity(value)) {
    throw new TypeError(`${label} is not a bounded canonical identity.`);
  }
};

const assertDigest: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
};

const assertInstant: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentControlInstant(value)) {
    throw new TypeError(`${label} is not a canonical instant.`);
  }
};

const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} is not a non-negative safe integer.`);
  }
};

const sortBy = <T>(
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

const validatedEvaluationAttempts = new WeakSet<object>();

export const isAgentModelEvaluationAttemptDescriptor = (
  descriptor: AgentModelEvaluationAttemptDescriptor
): boolean => {
  try {
    if (!hasExactAgentEvaluationDescriptorShape(descriptor)) return false;
    assertIdentity(descriptor.attemptId, 'Evaluation attempt id');
    assertIdentity(descriptor.shardId, 'Evaluation shard id');
    assertIdentity(descriptor.caseId, 'Evaluation case id');
    assertIdentity(descriptor.targetId, 'Evaluation target id');
    assertDigest(descriptor.planDigest, 'Evaluation plan digest');
    assertDigest(descriptor.targetDigest, 'Evaluation target digest');
    assertDigest(
      descriptor.samplingIdentityDigest,
      'Evaluation sampling identity digest'
    );
    assertDigest(descriptor.descriptorDigest, 'Evaluation descriptor digest');
    assertCount(descriptor.repetitionIndex, 'Evaluation repetition index');
    if (
      !riskClasses.has(descriptor.riskClass) ||
      (descriptor.contextTier !== undefined &&
        !contextTiers.has(descriptor.contextTier)) ||
      (descriptor.mediaRepresentationTier !== undefined &&
        !mediaRepresentationTiers.has(descriptor.mediaRepresentationTier))
    ) {
      return false;
    }
    const samplingBase = Object.freeze({
      planDigest: descriptor.planDigest,
      caseId: descriptor.caseId,
      targetId: descriptor.targetId,
      targetDigest: descriptor.targetDigest,
      riskClass: descriptor.riskClass,
      ...(descriptor.contextTier
        ? { contextTier: descriptor.contextTier }
        : {}),
      ...(descriptor.mediaRepresentationTier
        ? { mediaRepresentationTier: descriptor.mediaRepresentationTier }
        : {}),
      repetitionIndex: descriptor.repetitionIndex,
    });
    if (
      digestAgentCanonicalValue(samplingBase) !==
        descriptor.samplingIdentityDigest ||
      descriptor.attemptId !==
        `evaluation-attempt:${descriptor.samplingIdentityDigest.slice('sha256-'.length)}`
    ) {
      return false;
    }
    const { descriptorDigest: _descriptorDigest, ...base } = descriptor;
    return digestAgentCanonicalValue(base) === descriptor.descriptorDigest;
  } catch {
    return false;
  }
};

export const createAgentEvaluationMetricObservation = (
  input: Omit<AgentEvaluationMetricObservation, 'observationDigest'>
): AgentEvaluationMetricObservation => {
  assertIdentity(input.metricId, 'Metric id');
  assertIdentity(input.graderId, 'Grader id');
  if (
    !graderKinds.has(input.graderKind) ||
    !observationAuthorities.has(input.authority) ||
    !verdicts.has(input.verdict)
  ) {
    throw new TypeError(
      'Evaluation metric observation classification is invalid.'
    );
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeMetricObservation = (
  input: AgentEvaluationMetricObservation
): AgentEvaluationMetricObservation => {
  const { observationDigest: _observationDigest, ...base } = input;
  const normalized = createAgentEvaluationMetricObservation(base);
  if (!sameCanonicalJson(normalized, input)) {
    throw new TypeError('Evaluation metric observation digest drifted.');
  }
  return normalized;
};

export const createAgentModelEvaluationAttempt = (
  input: Omit<AgentModelEvaluationAttempt, 'attemptDigest'>
): AgentModelEvaluationAttempt => {
  if (!isAgentModelEvaluationAttemptDescriptor(input.descriptor)) {
    throw new TypeError('Evaluation attempt descriptor is invalid.');
  }
  assertIdentity(input.independentRunId, 'Independent evaluation Run id');
  if (input.invocationReceiptDigest !== undefined) {
    assertDigest(input.invocationReceiptDigest, 'Invocation receipt digest');
  }
  if (input.responseDigest !== undefined) {
    assertDigest(input.responseDigest, 'Response digest');
  }
  assertInstant(input.startedAt, 'Evaluation attempt start');
  assertInstant(input.completedAt, 'Evaluation attempt completion');
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) {
    throw new TypeError('Evaluation attempt completion predates its start.');
  }
  if (input.status !== 'completed' && input.outcome !== 'inconclusive') {
    throw new TypeError(
      'Non-completed evaluation attempts remain inconclusive in the denominator.'
    );
  }
  if (!attemptStatuses.has(input.status) || !verdicts.has(input.outcome)) {
    throw new TypeError('Evaluation attempt status or outcome is invalid.');
  }
  const metricObservations = sortBy(
    input.metricObservations.map(normalizeMetricObservation),
    ({ metricId, graderId }) => `${metricId}\u0000${graderId}`
  );
  if (
    new Set(
      metricObservations.map(
        ({ metricId, graderId }) => `${metricId}\u0000${graderId}`
      )
    ).size !== metricObservations.length
  ) {
    throw new TypeError(
      'Evaluation attempt contains duplicate grader metrics.'
    );
  }
  const usage = createAgentUsageVector(input.usage.amounts);
  const cost = normalizeAgentCosts(input.cost);
  const base = Object.freeze({
    descriptor: Object.freeze(cloneAgentControlJson(input.descriptor)),
    independentRunId: input.independentRunId,
    ...(input.invocationReceiptDigest
      ? { invocationReceiptDigest: input.invocationReceiptDigest }
      : {}),
    ...(input.responseDigest ? { responseDigest: input.responseDigest } : {}),
    status: input.status,
    outcome: input.outcome,
    metricObservations,
    usage,
    cost,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  });
  const attempt = Object.freeze({
    ...base,
    attemptDigest: digestAgentCanonicalValue(base),
  });
  validatedEvaluationAttempts.add(attempt);
  return attempt;
};

export const isAgentModelEvaluationAttempt = (
  value: unknown
): value is AgentModelEvaluationAttempt => {
  try {
    if (!hasExactAgentEvaluationAttemptShape(value)) return false;
    const objectValue = value as object;
    if (validatedEvaluationAttempts.has(objectValue)) return true;
    const attempt = value as AgentModelEvaluationAttempt;
    const { attemptDigest: _attemptDigest, ...base } = attempt;
    const valid = sameCanonicalJson(
      createAgentModelEvaluationAttempt(base),
      attempt
    );
    if (valid) validatedEvaluationAttempts.add(objectValue);
    return valid;
  } catch {
    return false;
  }
};

export const createAgentEvaluationShardCheckpoint = (
  input: Omit<AgentEvaluationShardCheckpoint, 'checkpointDigest'>
): AgentEvaluationShardCheckpoint => {
  assertDigest(input.planDigest, 'Checkpoint plan digest');
  assertIdentity(input.shardId, 'Checkpoint shard id');
  assertIdentity(input.leaseOwnerId, 'Checkpoint lease owner id');
  assertCount(input.revision, 'Checkpoint revision');
  assertCount(input.leaseGeneration, 'Checkpoint lease generation');
  assertInstant(input.updatedAt, 'Checkpoint update time');
  if (!isAgentBudgetLedgerState(input.budgetLedger)) {
    throw new TypeError('Checkpoint budget ledger is invalid.');
  }
  if (
    input.leaseGeneration < 1 ||
    !['running', 'completed', 'incomplete'].includes(input.state)
  ) {
    throw new TypeError('Checkpoint lease generation or state is invalid.');
  }
  const completedAttemptRefs = sortBy(
    input.completedAttemptRefs,
    ({ attemptId }) => attemptId
  );
  const missingAttemptRefs = sortBy(
    input.missingAttemptRefs,
    ({ attemptId }) => attemptId
  );
  const identities = [
    ...completedAttemptRefs.map(({ attemptId }) => attemptId),
    ...missingAttemptRefs.map(({ attemptId }) => attemptId),
  ];
  if (new Set(identities).size !== identities.length) {
    throw new TypeError('Checkpoint attempt references overlap or repeat.');
  }
  for (const ref of completedAttemptRefs) {
    assertIdentity(ref.attemptId, 'Checkpoint attempt id');
    assertDigest(ref.descriptorDigest, 'Checkpoint descriptor digest');
    assertDigest(ref.attemptDigest, 'Checkpoint attempt digest');
  }
  for (const ref of missingAttemptRefs) {
    assertIdentity(ref.attemptId, 'Checkpoint missing attempt id');
    assertDigest(ref.descriptorDigest, 'Checkpoint missing descriptor digest');
    if (!missingReasons.has(ref.reason)) {
      throw new TypeError('Checkpoint missing-attempt reason is invalid.');
    }
  }
  const base = Object.freeze({
    ...input,
    completedAttemptRefs,
    missingAttemptRefs,
    budgetLedger: Object.freeze(cloneAgentControlJson(input.budgetLedger)),
  });
  return Object.freeze({
    ...base,
    checkpointDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationShardCheckpoint = (
  value: AgentEvaluationShardCheckpoint
): boolean => {
  try {
    if (!hasExactAgentEvaluationCheckpointShape(value)) return false;
    const { checkpointDigest: _checkpointDigest, ...base } = value;
    return sameCanonicalJson(createAgentEvaluationShardCheckpoint(base), value);
  } catch {
    return false;
  }
};

const decimalFromRate = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return '1';
  const bounded = Math.min(1, value);
  return normalizeAgentDecimal(bounded.toFixed(8));
};

/** One-sided binomial upper bound; exact for the important zero-failure case. */
const inverseStandardNormal = (probability: number): number => {
  if (!(probability > 0 && probability < 1)) {
    throw new TypeError('Normal quantile probability must be between 0 and 1.');
  }
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
    -30.66479806614716, 2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416,
  ];
  const lower = 0.02425;
  const upper = 1 - lower;
  if (probability < lower) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (probability > upper) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  const q = probability - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r +
      a[5]!) *
      q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
};

export const computeAgentEvaluationFailureUpperBound = (
  failures: number,
  denominator: number,
  confidenceLevel: string
): string => {
  assertCount(failures, 'Failure count');
  assertCount(denominator, 'Failure denominator');
  if (denominator === 0 || failures > denominator) return '1';
  const confidence = Number(confidenceLevel);
  if (!(confidence > 0 && confidence < 1)) {
    throw new TypeError('Confidence level must be between 0 and 1.');
  }
  if (failures === 0) {
    return decimalFromRate(1 - (1 - confidence) ** (1 / denominator));
  }
  const proportion = failures / denominator;
  const z = inverseStandardNormal(confidence);
  const z2 = z * z;
  const denominatorAdjustment = 1 + z2 / denominator;
  const center = proportion + z2 / (2 * denominator);
  const spread =
    z *
    Math.sqrt(
      (proportion * (1 - proportion)) / denominator +
        z2 / (4 * denominator * denominator)
    );
  return decimalFromRate((center + spread) / denominatorAdjustment);
};

type MutableMetricSlice = {
  identity: Omit<
    AgentEvaluationMetricSlice,
    | 'sliceId'
    | 'passed'
    | 'failed'
    | 'inconclusive'
    | 'denominator'
    | 'observedFailureRate'
    | 'upperConfidenceBound'
    | 'thresholdSatisfied'
    | 'sliceDigest'
  >;
  passed: number;
  failed: number;
  inconclusive: number;
  threshold: AgentModelEvaluationPlan['thresholds']['metrics'][number];
  confidenceLevel: string;
  maximumFailureRateBound?: string;
};

const attemptSetDigest = (
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[],
  attempts: readonly AgentModelEvaluationAttempt[]
): string =>
  digestAgentCanonicalValue({
    plannedDescriptorDigests: descriptors
      .map(({ descriptorDigest }) => descriptorDigest)
      .sort(compareUnicodeCodePoints),
    attemptDigests: attempts
      .map(({ attemptDigest }) => attemptDigest)
      .sort(compareUnicodeCodePoints),
  });

const graderForAuthority = (
  plan: AgentModelEvaluationPlan,
  authority: 'deterministic' | 'human'
): Readonly<{ graderId: string; kind: AgentEvaluationGraderKind }> => {
  const ids =
    authority === 'deterministic'
      ? plan.graderPlan.deterministicAuthorityGraderIds
      : plan.graderPlan.blindHumanGraderIds;
  const grader = plan.graderPlan.graders.find(({ graderId }) =>
    ids.includes(graderId)
  );
  if (!grader) {
    throw new TypeError(`Evaluation plan has no ${authority} grader.`);
  }
  return grader;
};

export const buildAgentEvaluationMetricReport = (
  input: Readonly<{
    reportId: string;
    plan: AgentModelEvaluationPlan;
    descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
    attempts: readonly AgentModelEvaluationAttempt[];
    generatedAt: string;
  }>
): AgentEvaluationMetricReport => {
  assertIdentity(input.reportId, 'Metric report id');
  assertInstant(input.generatedAt, 'Metric report generation time');
  if (validateAgentModelEvaluationPlan(input.plan).length > 0) {
    throw new TypeError('Metric report requires a valid frozen plan.');
  }
  const cases = new Map(
    input.plan.concreteCases.map((entry) => [entry.caseId, entry])
  );
  const targets = new Map(
    input.plan.capabilityQualificationTargets.map((entry) => [
      entry.targetId,
      entry,
    ])
  );
  const attempts = new Map(
    input.attempts.map((entry) => [entry.descriptor.attemptId, entry])
  );
  const slices = new Map<string, MutableMetricSlice>();
  for (const descriptor of input.descriptors) {
    const evaluationCase = cases.get(descriptor.caseId);
    const target = targets.get(descriptor.targetId);
    if (!evaluationCase || !target) {
      throw new TypeError(
        'Metric descriptor references an unknown case/target.'
      );
    }
    const attempt = attempts.get(descriptor.attemptId);
    for (const threshold of input.plan.thresholds.metrics) {
      if (
        threshold.requiredAuthority === 'human' &&
        !evaluationCase.subjectiveVisualQuality
      ) {
        continue;
      }
      const fallbackGrader = graderForAuthority(
        input.plan,
        threshold.requiredAuthority
      );
      const observation = attempt?.metricObservations.find(
        (entry) =>
          entry.metricId === threshold.metricId &&
          entry.authority === threshold.requiredAuthority
      );
      const graderKind = observation?.graderKind ?? fallbackGrader.kind;
      const identity = Object.freeze({
        metricId: threshold.metricId,
        protocolFamily: target.protocolFamily,
        providerConfigurationId: target.providerConfigurationId,
        modelFamilyOwnerId: target.modelFamilyOwnerId,
        capabilityProfileId: target.capabilityProfileId,
        primaryBucket: evaluationCase.primaryBucket,
        familyId: evaluationCase.familyId,
        riskClass: evaluationCase.riskClass,
        ...(descriptor.contextTier
          ? { contextTier: descriptor.contextTier }
          : {}),
        ...(descriptor.mediaRepresentationTier
          ? {
              mediaRepresentationTier: descriptor.mediaRepresentationTier,
            }
          : {}),
        graderKind,
      });
      const key = digestAgentCanonicalValue(identity);
      const slice =
        slices.get(key) ??
        ({
          identity,
          passed: 0,
          failed: 0,
          inconclusive: 0,
          threshold,
          confidenceLevel:
            input.plan.repetitionPolicy.rules.find(
              ({ riskClass }) => riskClass === evaluationCase.riskClass
            )?.confidenceLevel ?? '0.95',
          maximumFailureRateBound: input.plan.repetitionPolicy.rules.find(
            ({ riskClass }) => riskClass === evaluationCase.riskClass
          )?.maximumFailureRateBound,
        } satisfies MutableMetricSlice);
      const verdict =
        attempt?.status === 'completed'
          ? (observation?.verdict ?? 'inconclusive')
          : 'inconclusive';
      slice[verdict] += 1;
      slices.set(key, slice);
    }
  }
  const canonicalSlices = Object.freeze(
    [...slices.values()]
      .map((slice): AgentEvaluationMetricSlice => {
        const denominator = slice.passed + slice.failed + slice.inconclusive;
        const failures = slice.failed + slice.inconclusive;
        const observedFailureRate = decimalFromRate(failures / denominator);
        const upperConfidenceBound = computeAgentEvaluationFailureUpperBound(
          failures,
          denominator,
          slice.confidenceLevel
        );
        const thresholdSatisfied =
          denominator >= slice.threshold.minimumSampleCount &&
          compareAgentDecimals(
            observedFailureRate,
            slice.threshold.maximumObservedFailureRate
          ) <= 0 &&
          (slice.threshold.maximumUpperConfidenceBound === undefined ||
            compareAgentDecimals(
              upperConfidenceBound,
              slice.threshold.maximumUpperConfidenceBound
            ) <= 0) &&
          (slice.maximumFailureRateBound === undefined ||
            compareAgentDecimals(
              upperConfidenceBound,
              slice.maximumFailureRateBound
            ) <= 0);
        const sliceId = `metric-slice:${digestAgentCanonicalValue(slice.identity).slice('sha256-'.length)}`;
        const base = Object.freeze({
          sliceId,
          ...slice.identity,
          passed: slice.passed,
          failed: slice.failed,
          inconclusive: slice.inconclusive,
          denominator,
          observedFailureRate,
          upperConfidenceBound,
          thresholdSatisfied,
        });
        return Object.freeze({
          ...base,
          sliceDigest: digestAgentCanonicalValue(base),
        });
      })
      .sort((left, right) =>
        compareUnicodeCodePoints(left.sliceId, right.sliceId)
      )
  );
  const base = Object.freeze({
    reportId: input.reportId,
    planDigest: input.plan.planDigest,
    attemptSetDigest: attemptSetDigest(input.descriptors, input.attempts),
    slices: canonicalSlices,
    generatedAt: input.generatedAt,
  });
  return Object.freeze({
    ...base,
    reportDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationMetricReport = (
  value: AgentEvaluationMetricReport
): boolean => {
  try {
    if (!hasExactAgentEvaluationMetricReportShape(value)) return false;
    assertIdentity(value.reportId, 'Metric report id');
    assertDigest(value.planDigest, 'Metric report plan digest');
    assertDigest(value.attemptSetDigest, 'Metric report attempt-set digest');
    assertInstant(value.generatedAt, 'Metric report generation time');
    const sliceIds: string[] = [];
    for (const slice of value.slices) {
      assertIdentity(slice.sliceId, 'Metric slice id');
      assertIdentity(slice.metricId, 'Metric slice metric id');
      assertIdentity(
        slice.providerConfigurationId,
        'Metric slice provider configuration id'
      );
      assertIdentity(
        slice.modelFamilyOwnerId,
        'Metric slice model-family owner'
      );
      assertIdentity(
        slice.capabilityProfileId,
        'Metric slice capability profile'
      );
      assertIdentity(slice.familyId, 'Metric slice family id');
      for (const [label, count] of [
        ['passed', slice.passed],
        ['failed', slice.failed],
        ['inconclusive', slice.inconclusive],
        ['denominator', slice.denominator],
      ] as const) {
        assertCount(count, `Metric slice ${label}`);
      }
      if (
        !protocolFamilies.has(slice.protocolFamily) ||
        !primaryBuckets.has(slice.primaryBucket) ||
        !riskClasses.has(slice.riskClass) ||
        !graderKinds.has(slice.graderKind) ||
        (slice.contextTier !== undefined &&
          !contextTiers.has(slice.contextTier)) ||
        (slice.mediaRepresentationTier !== undefined &&
          !mediaRepresentationTiers.has(slice.mediaRepresentationTier)) ||
        typeof slice.thresholdSatisfied !== 'boolean'
      ) {
        return false;
      }
      const identity = Object.freeze({
        metricId: slice.metricId,
        protocolFamily: slice.protocolFamily,
        providerConfigurationId: slice.providerConfigurationId,
        modelFamilyOwnerId: slice.modelFamilyOwnerId,
        capabilityProfileId: slice.capabilityProfileId,
        primaryBucket: slice.primaryBucket,
        familyId: slice.familyId,
        riskClass: slice.riskClass,
        ...(slice.contextTier ? { contextTier: slice.contextTier } : {}),
        ...(slice.mediaRepresentationTier
          ? { mediaRepresentationTier: slice.mediaRepresentationTier }
          : {}),
        graderKind: slice.graderKind,
      });
      const { sliceDigest: _sliceDigest, ...base } = slice;
      if (
        slice.sliceId !==
          `metric-slice:${digestAgentCanonicalValue(identity).slice('sha256-'.length)}` ||
        digestAgentCanonicalValue(base) !== slice.sliceDigest ||
        slice.denominator !==
          slice.passed + slice.failed + slice.inconclusive ||
        slice.denominator === 0 ||
        normalizeAgentDecimal(slice.observedFailureRate) !==
          slice.observedFailureRate ||
        normalizeAgentDecimal(slice.upperConfidenceBound) !==
          slice.upperConfidenceBound ||
        compareAgentDecimals(slice.observedFailureRate, '1') > 0 ||
        compareAgentDecimals(slice.upperConfidenceBound, '1') > 0 ||
        slice.observedFailureRate !==
          decimalFromRate(
            (slice.failed + slice.inconclusive) / slice.denominator
          )
      ) {
        return false;
      }
      sliceIds.push(slice.sliceId);
    }
    if (
      value.slices.length === 0 ||
      new Set(sliceIds).size !== sliceIds.length ||
      sliceIds.some(
        (entry, index) =>
          index > 0 &&
          compareUnicodeCodePoints(sliceIds[index - 1]!, entry) >= 0
      )
    ) {
      return false;
    }
    const { reportDigest: _reportDigest, ...base } = value;
    return digestAgentCanonicalValue(base) === value.reportDigest;
  } catch {
    return false;
  }
};

export const buildAgentEvaluationGraderReport = (
  input: Readonly<{
    reportId: string;
    plan: AgentModelEvaluationPlan;
    attempts: readonly AgentModelEvaluationAttempt[];
    generatedAt: string;
  }>
): AgentEvaluationGraderReport => {
  assertIdentity(input.reportId, 'Grader report id');
  assertInstant(input.generatedAt, 'Grader report generation time');
  let deterministicVerdictCount = 0;
  let auxiliaryVerdictCount = 0;
  let humanVerdictCount = 0;
  let disagreementCount = 0;
  const selfJudgeOnlyAttemptIds: string[] = [];
  const graderById = new Map(
    input.plan.graderPlan.graders.map((grader) => [grader.graderId, grader])
  );
  const targetById = new Map(
    input.plan.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  for (const attempt of input.attempts) {
    const target = targetById.get(attempt.descriptor.targetId);
    const deterministic = attempt.metricObservations.filter(
      ({ authority }) => authority === 'deterministic'
    );
    const auxiliary = attempt.metricObservations.filter(
      ({ authority }) => authority === 'auxiliary'
    );
    const human = attempt.metricObservations.filter(
      ({ authority }) => authority === 'human'
    );
    deterministicVerdictCount += deterministic.length;
    auxiliaryVerdictCount += auxiliary.length;
    humanVerdictCount += human.length;
    const authorityVerdicts = new Set(
      [...deterministic, ...human].map(({ verdict }) => verdict)
    );
    if (
      auxiliary.some(
        ({ verdict }) =>
          verdict !== 'inconclusive' &&
          authorityVerdicts.size > 0 &&
          !authorityVerdicts.has(verdict)
      )
    ) {
      disagreementCount += 1;
    }
    const onlyPassingEvidenceIsSelfJudge =
      deterministic.every(({ verdict }) => verdict !== 'passed') &&
      human.every(({ verdict }) => verdict !== 'passed') &&
      auxiliary.some(({ graderId, verdict }) => {
        const grader = graderById.get(graderId);
        return (
          verdict === 'passed' &&
          target !== undefined &&
          grader?.kind === 'model-judge' &&
          grader.testedModelFamilyOwnerIds.includes(target.modelFamilyOwnerId)
        );
      });
    if (onlyPassingEvidenceIsSelfJudge) {
      selfJudgeOnlyAttemptIds.push(attempt.descriptor.attemptId);
    }
  }
  const base = Object.freeze({
    reportId: input.reportId,
    planDigest: input.plan.planDigest,
    graderPlanDigest: input.plan.graderPlan.planDigest,
    deterministicVerdictCount,
    auxiliaryVerdictCount,
    humanVerdictCount,
    disagreementCount,
    selfJudgeOnlyAttemptIds: Object.freeze(
      selfJudgeOnlyAttemptIds.sort(compareUnicodeCodePoints)
    ),
    generatedAt: input.generatedAt,
  });
  return Object.freeze({
    ...base,
    reportDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationGraderReport = (
  value: AgentEvaluationGraderReport
): boolean => {
  try {
    if (!hasExactAgentEvaluationGraderReportShape(value)) return false;
    const { reportDigest: _reportDigest, ...base } = value;
    for (const count of [
      value.deterministicVerdictCount,
      value.auxiliaryVerdictCount,
      value.humanVerdictCount,
      value.disagreementCount,
    ]) {
      assertCount(count, 'Evaluation grader count');
    }
    const selfJudgeIds = value.selfJudgeOnlyAttemptIds;
    return (
      isAgentControlIdentity(value.reportId) &&
      isAgentCanonicalDigest(value.planDigest) &&
      isAgentCanonicalDigest(value.graderPlanDigest) &&
      isAgentControlInstant(value.generatedAt) &&
      new Set(selfJudgeIds).size === selfJudgeIds.length &&
      selfJudgeIds.every(
        (entry, index) =>
          isAgentControlIdentity(entry) &&
          (index === 0 ||
            compareUnicodeCodePoints(selfJudgeIds[index - 1]!, entry) < 0)
      ) &&
      digestAgentCanonicalValue(base) === value.reportDigest
    );
  } catch {
    return false;
  }
};

export const createAgentHumanReviewRating = (
  input: Omit<AgentHumanReviewRating, 'ratingDigest'>
): AgentHumanReviewRating => {
  for (const [label, value] of [
    ['Human rating id', input.ratingId],
    ['Human rating attempt id', input.attemptId],
    ['Reviewer pseudonym', input.reviewerPseudonym],
    ['Randomized presentation id', input.randomizedPresentationId],
  ] as const) {
    assertIdentity(value, label);
  }
  assertDigest(input.rubricDigest, 'Human review rubric digest');
  if (!['passed', 'failed'].includes(input.verdict)) {
    throw new TypeError('Human review verdict is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    ratingDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentHumanReviewReport = (
  input: Omit<AgentHumanReviewReport, 'reportDigest'>
): AgentHumanReviewReport => {
  assertIdentity(input.reportId, 'Human review report id');
  assertDigest(input.planDigest, 'Human review plan digest');
  assertDigest(input.blindedArtifactSetDigest, 'Blinded artifact-set digest');
  assertDigest(input.adjudicationDigest, 'Human review adjudication digest');
  assertInstant(input.generatedAt, 'Human review generation time');
  const ratings = sortBy(
    input.ratings.map((rating) => {
      const { ratingDigest: _ratingDigest, ...base } = rating;
      const normalized = createAgentHumanReviewRating(base);
      if (!sameCanonicalJson(normalized, rating)) {
        throw new TypeError('Human rating digest drifted.');
      }
      return normalized;
    }),
    ({ ratingId }) => ratingId
  );
  if (
    new Set(ratings.map(({ ratingId }) => ratingId)).size !== ratings.length
  ) {
    throw new TypeError('Human rating ids must be unique.');
  }
  const base = Object.freeze({ ...input, ratings });
  return Object.freeze({
    ...base,
    reportDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHumanReviewReport = (
  value: AgentHumanReviewReport
): boolean => {
  try {
    if (!hasExactAgentEvaluationHumanReportShape(value)) return false;
    const { reportDigest: _reportDigest, ...base } = value;
    const normalized = createAgentHumanReviewReport(base);
    return sameCanonicalJson(normalized, value);
  } catch {
    return false;
  }
};

export const createAgentHoldoutExecutionReceipt = (
  input: Omit<AgentHoldoutExecutionReceipt, 'receiptDigest'>
): AgentHoldoutExecutionReceipt => {
  assertIdentity(input.receiptId, 'Holdout execution receipt id');
  assertIdentity(input.executorPrincipalId, 'Holdout executor principal id');
  for (const [label, digest] of [
    ['Holdout plan digest', input.planDigest],
    ['Protected holdout manifest digest', input.protectedHoldoutManifestDigest],
    ['Holdout access policy digest', input.accessPolicyDigest],
    ['Encrypted holdout corpus digest', input.encryptedCorpusDigest],
    ['Public artifact scan digest', input.publicArtifactScanDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  assertInstant(input.executedAt, 'Holdout execution time');
  const executedCaseIds = Object.freeze(
    [...input.executedCaseIds].sort(compareUnicodeCodePoints)
  );
  const leakedCaseIds = Object.freeze(
    [...input.leakedCaseIds].sort(compareUnicodeCodePoints)
  );
  if (
    new Set(executedCaseIds).size !== executedCaseIds.length ||
    new Set(leakedCaseIds).size !== leakedCaseIds.length ||
    executedCaseIds.some((caseId) => !isAgentControlIdentity(caseId)) ||
    leakedCaseIds.some(
      (caseId) =>
        !isAgentControlIdentity(caseId) || !executedCaseIds.includes(caseId)
    )
  ) {
    throw new TypeError('Holdout receipt contains duplicate case identities.');
  }
  const base = Object.freeze({ ...input, executedCaseIds, leakedCaseIds });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentHoldoutExecutionReceipt = (
  value: AgentHoldoutExecutionReceipt
): boolean => {
  try {
    if (!hasExactAgentEvaluationHoldoutReceiptShape(value)) return false;
    const { receiptDigest: _receiptDigest, ...base } = value;
    return sameCanonicalJson(createAgentHoldoutExecutionReceipt(base), value);
  } catch {
    return false;
  }
};

const attemptReference = (
  attempt: AgentModelEvaluationAttempt
): AgentModelEvaluationAttemptRef =>
  Object.freeze({
    attemptId: attempt.descriptor.attemptId,
    descriptorDigest: attempt.descriptor.descriptorDigest,
    attemptDigest: attempt.attemptDigest,
  });

const missingReference = (
  descriptor: AgentModelEvaluationAttemptDescriptor,
  attempt?: AgentModelEvaluationAttempt
): AgentModelEvaluationMissingAttemptRef =>
  Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    reason:
      attempt && attempt.status !== 'completed' ? attempt.status : 'missing',
  });

const aggregateAttemptUsage = (
  attempts: readonly AgentModelEvaluationAttempt[]
) => createAgentUsageVector(attempts.flatMap(({ usage }) => usage.amounts));

const aggregateAttemptCosts = (
  attempts: readonly AgentModelEvaluationAttempt[]
): readonly AgentCost[] =>
  normalizeAgentCosts(attempts.flatMap(({ cost }) => cost));

const countByRisk = (
  attempts: readonly AgentModelEvaluationAttempt[]
): Readonly<Record<AgentEvaluationRiskClass, number>> =>
  Object.freeze({
    ordinary: attempts.filter(
      ({ descriptor }) => descriptor.riskClass === 'ordinary'
    ).length,
    critical: attempts.filter(
      ({ descriptor }) => descriptor.riskClass === 'critical'
    ).length,
    'high-assurance': attempts.filter(
      ({ descriptor }) => descriptor.riskClass === 'high-assurance'
    ).length,
  });

export const createAgentModelEvaluationManifest = (
  input: Readonly<{
    manifestId: string;
    plan: AgentModelEvaluationPlan;
    descriptors?: readonly AgentModelEvaluationAttemptDescriptor[];
    attempts: readonly AgentModelEvaluationAttempt[];
    metricReport: AgentEvaluationMetricReport;
    graderReport: AgentEvaluationGraderReport;
    humanReviewReport?: AgentHumanReviewReport;
    holdoutExecutionReceipt: AgentHoldoutExecutionReceipt;
    completedAt: string;
    expiresAt: string;
  }>
): AgentModelEvaluationManifest => {
  assertIdentity(input.manifestId, 'Evaluation manifest id');
  assertInstant(input.completedAt, 'Evaluation manifest completion');
  assertInstant(input.expiresAt, 'Evaluation manifest expiry');
  const planIssues = validateAgentModelEvaluationPlan(input.plan);
  if (planIssues.length > 0) {
    throw new TypeError('Evaluation manifest requires a valid frozen plan.');
  }
  const plannedDescriptors = planAgentModelEvaluationAttempts(input.plan);
  if (
    input.descriptors &&
    !sameCanonicalJson(input.descriptors, plannedDescriptors)
  ) {
    throw new TypeError(
      'Evaluation manifest descriptors must cover the exact frozen attempt set.'
    );
  }
  const descriptors = input.descriptors ?? plannedDescriptors;
  const planned = new Map(descriptors.map((entry) => [entry.attemptId, entry]));
  // Attempts are not retained by the manifest. Validate and sort references
  // without deep-cloning a five-figure evaluation run into a second graph.
  const attempts = Object.freeze(
    [...input.attempts].sort((left, right) =>
      compareUnicodeCodePoints(
        left.descriptor.attemptId,
        right.descriptor.attemptId
      )
    )
  );
  const attemptIds = attempts.map(({ descriptor }) => descriptor.attemptId);
  const duplicateAttemptIdentity =
    new Set(attemptIds).size !== attemptIds.length ||
    new Set(attempts.map(({ independentRunId }) => independentRunId)).size !==
      attempts.length ||
    new Set(attempts.map(({ descriptor }) => descriptor.samplingIdentityDigest))
      .size !== attempts.length;
  const malformedAttempt = attempts.some(
    (attempt) =>
      !isAgentModelEvaluationAttempt(attempt) ||
      !sameCanonicalJson(
        planned.get(attempt.descriptor.attemptId),
        attempt.descriptor
      )
  );
  const attemptById = new Map(
    attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const missing = descriptors
    .filter((descriptor) => {
      const attempt = attemptById.get(descriptor.attemptId);
      return !attempt || attempt.status !== 'completed';
    })
    .map((descriptor) =>
      missingReference(descriptor, attemptById.get(descriptor.attemptId))
    );
  const protectedCaseIds = input.plan.concreteCases
    .filter(({ access }) => access === 'protected-holdout')
    .map(({ caseId }) => caseId)
    .sort(compareUnicodeCodePoints);
  const holdoutValid =
    isAgentHoldoutExecutionReceipt(input.holdoutExecutionReceipt) &&
    input.holdoutExecutionReceipt.planDigest === input.plan.planDigest &&
    input.holdoutExecutionReceipt.protectedHoldoutManifestDigest ===
      input.plan.protectedHoldoutManifestDigest &&
    sameCanonicalJson(
      input.holdoutExecutionReceipt.executedCaseIds,
      protectedCaseIds
    ) &&
    input.holdoutExecutionReceipt.leakedCaseIds.length === 0;
  const reportsValid =
    isAgentEvaluationMetricReport(input.metricReport) &&
    input.metricReport.planDigest === input.plan.planDigest &&
    input.metricReport.attemptSetDigest ===
      attemptSetDigest(descriptors, attempts) &&
    sameCanonicalJson(
      input.metricReport,
      buildAgentEvaluationMetricReport({
        reportId: input.metricReport.reportId,
        plan: input.plan,
        descriptors,
        attempts,
        generatedAt: input.metricReport.generatedAt,
      })
    ) &&
    isAgentEvaluationGraderReport(input.graderReport) &&
    input.graderReport.planDigest === input.plan.planDigest &&
    input.graderReport.graderPlanDigest === input.plan.graderPlan.planDigest &&
    sameCanonicalJson(
      input.graderReport,
      buildAgentEvaluationGraderReport({
        reportId: input.graderReport.reportId,
        plan: input.plan,
        attempts,
        generatedAt: input.graderReport.generatedAt,
      })
    );
  const subjectiveCaseIds = new Set(
    input.plan.concreteCases
      .filter(({ subjectiveVisualQuality }) => subjectiveVisualQuality)
      .map(({ caseId }) => caseId)
  );
  let humanReviewValid = subjectiveCaseIds.size === 0;
  if (subjectiveCaseIds.size > 0 && input.humanReviewReport) {
    const humanRubricDigests = new Set(
      input.plan.graderPlan.graders
        .filter(({ graderId }) =>
          input.plan.graderPlan.blindHumanGraderIds.includes(graderId)
        )
        .map(({ configurationDigest }) => configurationDigest)
    );
    humanReviewValid =
      isAgentHumanReviewReport(input.humanReviewReport) &&
      input.humanReviewReport.planDigest === input.plan.planDigest &&
      input.humanReviewReport.ratings.length <=
        input.plan.budget.maxHumanRatings &&
      input.humanReviewReport.ratings.every((rating) => {
        const descriptor = planned.get(rating.attemptId);
        const attempt = attemptById.get(rating.attemptId);
        return (
          descriptor !== undefined &&
          attempt?.status === 'completed' &&
          subjectiveCaseIds.has(descriptor.caseId) &&
          humanRubricDigests.has(rating.rubricDigest)
        );
      });
    if (humanReviewValid) {
      const ratingsByCaseTarget = new Map<string, Set<string>>();
      const reviewerAssignments = new Set<string>();
      for (const rating of input.humanReviewReport.ratings) {
        const descriptor = planned.get(rating.attemptId);
        if (!descriptor || !subjectiveCaseIds.has(descriptor.caseId)) continue;
        const key = `${descriptor.caseId}\u0000${descriptor.targetId}`;
        const assignment = `${key}\u0000${rating.reviewerPseudonym}`;
        if (reviewerAssignments.has(assignment)) {
          humanReviewValid = false;
          break;
        }
        reviewerAssignments.add(assignment);
        const reviewers = ratingsByCaseTarget.get(key) ?? new Set<string>();
        reviewers.add(rating.reviewerPseudonym);
        ratingsByCaseTarget.set(key, reviewers);
      }
      for (const descriptor of descriptors) {
        if (!humanReviewValid) break;
        if (!subjectiveCaseIds.has(descriptor.caseId)) continue;
        const key = `${descriptor.caseId}\u0000${descriptor.targetId}`;
        if (
          (ratingsByCaseTarget.get(key)?.size ?? 0) <
          input.plan.graderPlan.minimumIndependentVisualRatings
        ) {
          humanReviewValid = false;
          break;
        }
      }
    }
  }
  const metricSatisfied =
    input.metricReport.slices.length > 0 &&
    input.metricReport.slices.every(({ thresholdSatisfied }) =>
      Boolean(thresholdSatisfied)
    );
  const usage = aggregateAttemptUsage(attempts);
  const cost = aggregateAttemptCosts(attempts);
  const timing = attempts.reduce(
    (current, attempt) => ({
      earliestStartedAt: Math.min(
        current.earliestStartedAt,
        Date.parse(attempt.startedAt)
      ),
      latestCompletedAt: Math.max(
        current.latestCompletedAt,
        Date.parse(attempt.completedAt)
      ),
    }),
    { earliestStartedAt: Number.POSITIVE_INFINITY, latestCompletedAt: 0 }
  );
  let budgetValid = false;
  try {
    budgetValid = reserveAgentBudget(
      createAgentBudgetLedger(input.plan.budget.budget),
      {
        reservationId: `evaluation-manifest-budget:${input.plan.planDigest.slice('sha256-'.length)}`,
        expectedRevision: 0,
        demand: Object.freeze({
          usage,
          cost,
          modelInvocations: attempts.length,
          toolCalls: 0,
          repairRounds: 0,
          transactions: 0,
          artifactBytes: 0,
          elapsedMs:
            attempts.length === 0
              ? 0
              : Math.max(
                  0,
                  timing.latestCompletedAt - timing.earliestStartedAt
                ),
        }),
        reservedAt: input.completedAt,
      }
    ).ok;
  } catch {
    budgetValid = false;
  }
  const expired =
    Date.parse(input.completedAt) >= Date.parse(input.plan.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.completedAt) ||
    Date.parse(input.expiresAt) > Date.parse(input.plan.expiresAt);
  const incomplete =
    missing.length > 0 ||
    duplicateAttemptIdentity ||
    malformedAttempt ||
    !holdoutValid ||
    !reportsValid ||
    !humanReviewValid ||
    !budgetValid ||
    attempts.length !== descriptors.length;
  const unsatisfied =
    !metricSatisfied || input.graderReport.selfJudgeOnlyAttemptIds.length > 0;
  const outcome = expired
    ? 'expired'
    : incomplete
      ? 'incomplete'
      : unsatisfied
        ? 'unsatisfied'
        : 'satisfied';
  const base = Object.freeze({
    manifestId: input.manifestId,
    planDigest: input.plan.planDigest,
    attemptRefs: Object.freeze(attempts.map(attemptReference)),
    attemptCountByRisk: countByRisk(attempts),
    missingOrInfrastructureAttemptRefs: Object.freeze(missing),
    usage,
    cost,
    metricReportRef: input.metricReport.reportId,
    metricReportDigest: input.metricReport.reportDigest,
    graderReportRef: input.graderReport.reportId,
    graderReportDigest: input.graderReport.reportDigest,
    ...(input.humanReviewReport
      ? {
          humanReviewReportRef: input.humanReviewReport.reportId,
          humanReviewReportDigest: input.humanReviewReport.reportDigest,
        }
      : {}),
    holdoutExecutionReceiptRef: input.holdoutExecutionReceipt.receiptId,
    holdoutExecutionReceiptDigest: input.holdoutExecutionReceipt.receiptDigest,
    qualificationTargetDigests: Object.freeze(
      input.plan.capabilityQualificationTargets
        .map(({ targetDigest }) => targetDigest)
        .sort(compareUnicodeCodePoints)
    ),
    outcome,
    completedAt: input.completedAt,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    ...base,
    manifestDigest: digestAgentCanonicalValue(base),
  });
};

/**
 * Checks the self-contained manifest fact without trusting referenced reports.
 * Cross-fact admission still uses validateAgentModelEvaluationManifest below.
 */
export const isAgentModelEvaluationManifest = (
  value: AgentModelEvaluationManifest
): boolean => {
  try {
    if (!hasExactAgentEvaluationManifestShape(value)) return false;
    assertIdentity(value.manifestId, 'Evaluation manifest id');
    assertDigest(value.planDigest, 'Evaluation manifest plan digest');
    assertDigest(value.metricReportDigest, 'Metric report digest');
    assertDigest(value.graderReportDigest, 'Grader report digest');
    assertDigest(
      value.holdoutExecutionReceiptDigest,
      'Holdout execution receipt digest'
    );
    assertIdentity(value.metricReportRef, 'Metric report ref');
    assertIdentity(value.graderReportRef, 'Grader report ref');
    assertIdentity(
      value.holdoutExecutionReceiptRef,
      'Holdout execution receipt ref'
    );
    assertInstant(value.completedAt, 'Evaluation manifest completion');
    assertInstant(value.expiresAt, 'Evaluation manifest expiry');
    if (
      !['satisfied', 'unsatisfied', 'incomplete', 'expired'].includes(
        value.outcome
      ) ||
      (value.humanReviewReportRef === undefined) !==
        (value.humanReviewReportDigest === undefined)
    ) {
      return false;
    }
    if (value.humanReviewReportRef !== undefined) {
      assertIdentity(value.humanReviewReportRef, 'Human review report ref');
      assertDigest(value.humanReviewReportDigest, 'Human review report digest');
    }
    const attemptIds = value.attemptRefs.map((entry) => {
      assertIdentity(entry.attemptId, 'Evaluation attempt ref id');
      assertDigest(entry.descriptorDigest, 'Evaluation descriptor ref digest');
      assertDigest(entry.attemptDigest, 'Evaluation attempt ref digest');
      return entry.attemptId;
    });
    if (
      new Set(attemptIds).size !== attemptIds.length ||
      attemptIds.some(
        (entry, index) =>
          index > 0 &&
          compareUnicodeCodePoints(attemptIds[index - 1]!, entry) >= 0
      )
    ) {
      return false;
    }
    const missingIds: string[] = [];
    for (const entry of value.missingOrInfrastructureAttemptRefs) {
      assertIdentity(entry.attemptId, 'Missing evaluation attempt id');
      assertDigest(entry.descriptorDigest, 'Missing descriptor digest');
      if (!missingReasons.has(entry.reason)) return false;
      missingIds.push(entry.attemptId);
    }
    for (const count of Object.values(value.attemptCountByRisk)) {
      assertCount(count, 'Evaluation attempt risk count');
    }
    if (
      Object.values(value.attemptCountByRisk).reduce(
        (total, count) => total + count,
        0
      ) !== value.attemptRefs.length
    ) {
      return false;
    }
    value.qualificationTargetDigests.forEach((digest) =>
      assertDigest(digest, 'Qualification target digest')
    );
    if (
      Date.parse(value.expiresAt) <= Date.parse(value.completedAt) ||
      new Set(missingIds).size !== missingIds.length ||
      missingIds.some(
        (entry, index) =>
          index > 0 &&
          compareUnicodeCodePoints(missingIds[index - 1]!, entry) >= 0
      ) ||
      new Set(value.qualificationTargetDigests).size !==
        value.qualificationTargetDigests.length ||
      value.qualificationTargetDigests.some(
        (entry, index) =>
          index > 0 &&
          compareUnicodeCodePoints(
            value.qualificationTargetDigests[index - 1]!,
            entry
          ) >= 0
      ) ||
      !sameCanonicalJson(
        value.usage,
        createAgentUsageVector(value.usage.amounts)
      ) ||
      !sameCanonicalJson(value.cost, normalizeAgentCosts(value.cost))
    ) {
      return false;
    }
    const { manifestDigest: _manifestDigest, ...base } = value;
    return digestAgentCanonicalValue(base) === value.manifestDigest;
  } catch {
    return false;
  }
};

export const validateAgentModelEvaluationManifest = (
  input: Readonly<{
    manifest: AgentModelEvaluationManifest;
    plan: AgentModelEvaluationPlan;
    descriptors?: readonly AgentModelEvaluationAttemptDescriptor[];
    attempts: readonly AgentModelEvaluationAttempt[];
    metricReport: AgentEvaluationMetricReport;
    graderReport: AgentEvaluationGraderReport;
    humanReviewReport?: AgentHumanReviewReport;
    holdoutExecutionReceipt: AgentHoldoutExecutionReceipt;
  }>
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  try {
    const expected = createAgentModelEvaluationManifest({
      manifestId: input.manifest.manifestId,
      plan: input.plan,
      descriptors: input.descriptors,
      attempts: input.attempts,
      metricReport: input.metricReport,
      graderReport: input.graderReport,
      humanReviewReport: input.humanReviewReport,
      holdoutExecutionReceipt: input.holdoutExecutionReceipt,
      completedAt: input.manifest.completedAt,
      expiresAt: input.manifest.expiresAt,
    });
    if (!sameCanonicalJson(expected, input.manifest)) {
      issues.push(
        issue(
          'AI-8011',
          '/manifestDigest',
          'Evaluation manifest omitted attempts, drifted reports, or changed its computed outcome.'
        )
      );
    }
  } catch (caught) {
    issues.push(
      issue(
        'AI-8011',
        '/',
        caught instanceof Error
          ? caught.message
          : 'Evaluation manifest validation failed.'
      )
    );
  }
  return Object.freeze(issues.sort(compareIssues));
};

export const createAgentModelEvaluationQualification = (
  input: Readonly<{
    manifest: AgentModelEvaluationManifest;
    plan: AgentModelEvaluationPlan;
    qualificationTargetDigest: string;
    qualificationSliceDigest: string;
    evaluatedAt: string;
  }>
): AgentModelEvaluationQualification => {
  if (
    input.manifest.outcome !== 'satisfied' ||
    input.manifest.planDigest !== input.plan.planDigest ||
    input.manifest.manifestDigest !==
      digestAgentCanonicalValue(
        (({ manifestDigest: _manifestDigest, ...base }) => base)(input.manifest)
      ) ||
    !input.manifest.qualificationTargetDigests.includes(
      input.qualificationTargetDigest
    ) ||
    !input.plan.capabilityQualificationTargets.some(
      (target) =>
        target.targetDigest === input.qualificationTargetDigest &&
        target.qualificationSliceDigest === input.qualificationSliceDigest
    )
  ) {
    throw new TypeError(
      'Release qualification requires a satisfied exact evaluation target.'
    );
  }
  assertInstant(input.evaluatedAt, 'Evaluation qualification time');
  if (
    Date.parse(input.evaluatedAt) < Date.parse(input.manifest.completedAt) ||
    Date.parse(input.evaluatedAt) >= Date.parse(input.manifest.expiresAt)
  ) {
    throw new TypeError(
      'Evaluation qualification time is outside manifest freshness.'
    );
  }
  const base = Object.freeze({
    manifestRef: input.manifest.manifestId,
    manifestDigest: input.manifest.manifestDigest,
    planDigest: input.plan.planDigest,
    qualificationTargetDigest: input.qualificationTargetDigest,
    qualificationSliceDigest: input.qualificationSliceDigest,
    evaluatedAt: input.evaluatedAt,
    expiresAt: input.manifest.expiresAt,
  });
  return Object.freeze({
    ...base,
    qualificationDigest: digestAgentCanonicalValue(base),
  });
};

export const evaluationAttemptSetDigest = attemptSetDigest;
