import {
  compareUnicodeCodePoints,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  cloneAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  digestAgentCanonicalBytes,
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
  AgentEvaluationReviewCandidate,
  AgentEvaluationReviewCandidateRef,
  AgentEvaluationReviewRasterScanReceipt,
  AgentEvaluationRiskClass,
  AgentHoldoutExecutionReceipt,
  AgentHumanReviewRating,
  AgentHumanReviewReport,
  AgentEvaluationTransportAttemptReceipt,
  AgentEvaluationTransportRetryReceipt,
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
  hasExactAgentEvaluationReviewCandidateShape,
  hasExactAgentEvaluationReviewRasterScanReceiptShape,
} from './agentEvaluationShape';
import {
  normalizeAgentEvaluationHumanReviewCriterionVerdicts,
  verdictForRequiredHumanReviewCriteria,
} from './agentEvaluationHumanReviewRubric';
import {
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  isAgentEvaluationValidatedHumanMetricObservation,
  type AgentEvaluationValidatedHumanMetricObservation,
} from './agentEvaluationHumanMetricAuthority';

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

export const createAgentEvaluationTransportAttemptReceipt = (
  input: Omit<AgentEvaluationTransportAttemptReceipt, 'receiptDigest'>
): AgentEvaluationTransportAttemptReceipt => {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
    throw new TypeError(
      'Evaluation transport-attempt sequence must be a positive safe integer.'
    );
  }
  assertDigest(input.requestDigest, 'Evaluation transport request digest');
  if (!attemptStatuses.has(input.status)) {
    throw new TypeError('Evaluation transport-attempt status is invalid.');
  }
  if (typeof input.retryable !== 'boolean') {
    throw new TypeError(
      'Evaluation transport-attempt retryable flag is invalid.'
    );
  }
  if (input.invocationReceiptDigest !== undefined) {
    assertDigest(
      input.invocationReceiptDigest,
      'Evaluation transport invocation receipt digest'
    );
  }
  if (input.responseDigest !== undefined) {
    assertDigest(input.responseDigest, 'Evaluation transport response digest');
  }
  assertInstant(input.startedAt, 'Evaluation transport-attempt start');
  assertInstant(input.completedAt, 'Evaluation transport-attempt completion');
  if (Date.parse(input.completedAt) < Date.parse(input.startedAt)) {
    throw new TypeError(
      'Evaluation transport-attempt completion predates its start.'
    );
  }
  if (
    input.status === 'completed' &&
    (!input.invocationReceiptDigest || !input.responseDigest || input.retryable)
  ) {
    throw new TypeError(
      'Completed transport attempts require invocation/response receipts and terminate retry.'
    );
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationTransportRetryReceipt = (
  input: Omit<AgentEvaluationTransportRetryReceipt, 'receiptDigest'>
): AgentEvaluationTransportRetryReceipt => {
  assertDigest(input.policyDigest, 'Evaluation transport-retry policy digest');
  if (input.maximumAttempts !== 1) {
    throw new TypeError(
      'Evaluation transport retry authority requires exactly one sealed try per turn.'
    );
  }
  if (typeof input.exhausted !== 'boolean') {
    throw new TypeError(
      'Evaluation transport-retry exhausted flag is invalid.'
    );
  }
  const attempts = Object.freeze(
    input.attempts.map((attempt) => {
      const { receiptDigest: _receiptDigest, ...base } = attempt;
      const normalized = createAgentEvaluationTransportAttemptReceipt(base);
      if (!sameCanonicalJson(normalized, attempt)) {
        throw new TypeError('Evaluation transport-attempt receipt drifted.');
      }
      return normalized;
    })
  );
  if (attempts.length !== 1) {
    throw new TypeError(
      'Evaluation transport retry authority requires exactly one sealed try per turn.'
    );
  }
  const requestDigest = attempts[0]!.requestDigest;
  for (const [index, attempt] of attempts.entries()) {
    if (
      attempt.sequence !== index + 1 ||
      attempt.requestDigest !== requestDigest ||
      (index > 0 &&
        Date.parse(attempt.startedAt) <
          Date.parse(attempts[index - 1]!.completedAt)) ||
      (index < attempts.length - 1 &&
        (attempt.status === 'completed' || !attempt.retryable))
    ) {
      throw new TypeError(
        'Evaluation transport-retry lineage is non-contiguous or overwrites a terminal try.'
      );
    }
  }
  const terminal = attempts.at(-1)!;
  const expectedExhausted =
    terminal.status !== 'completed' &&
    terminal.retryable &&
    attempts.length === input.maximumAttempts;
  if (
    (terminal.status !== 'completed' &&
      terminal.retryable &&
      attempts.length < input.maximumAttempts) ||
    input.exhausted !== expectedExhausted
  ) {
    throw new TypeError(
      'Evaluation transport-retry lineage has an invalid terminal bound.'
    );
  }
  const base = Object.freeze({ ...input, attempts });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

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
    assertDigest(
      descriptor.capabilityDescriptorDigest,
      'Evaluation capability descriptor digest'
    );
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
      capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
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
  for (const [digest, label] of [
    [input.dispatchIntentSetDigest, 'Dispatch-intent set digest'],
    [input.transportReceiptSetDigest, 'Transport receipt-set digest'],
    [
      input.invocationTurnReceiptSetDigest,
      'Invocation turn-receipt set digest',
    ],
    [
      input.invocationTurnSetReceiptDigest,
      'Invocation turn-set receipt digest',
    ],
    [
      input.capabilityExecutionReceiptSetDigest,
      'Capability execution receipt-set digest',
    ],
    [
      input.verificationAttemptGrantReceiptSetDigest,
      'Verification AttemptGrant receipt-set digest',
    ],
  ] as const) {
    assertDigest(digest, label);
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
  if (input.status === 'completed' && input.responseDigest === undefined) {
    throw new TypeError(
      'Completed evaluation attempts require a terminal response binding.'
    );
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
    dispatchIntentSetDigest: input.dispatchIntentSetDigest,
    transportReceiptSetDigest: input.transportReceiptSetDigest,
    invocationTurnReceiptSetDigest: input.invocationTurnReceiptSetDigest,
    invocationTurnSetReceiptDigest: input.invocationTurnSetReceiptDigest,
    capabilityExecutionReceiptSetDigest:
      input.capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest:
      input.verificationAttemptGrantReceiptSetDigest,
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
    validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
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
  const humanObservationByKey = new Map(
    input.validatedHumanMetricObservations.map((entry) => [
      `${entry.attemptId}\u0000${entry.metricId}`,
      entry,
    ])
  );
  if (
    humanObservationByKey.size !==
      input.validatedHumanMetricObservations.length ||
    input.validatedHumanMetricObservations.some(
      (entry) =>
        !isAgentEvaluationValidatedHumanMetricObservation(entry) ||
        entry.planDigest !== input.plan.planDigest ||
        attempts.get(entry.attemptId)?.descriptor.descriptorDigest !==
          entry.descriptorDigest ||
        attempts.get(entry.attemptId)?.status !== 'completed'
    ) ||
    input.attempts.some((attempt) =>
      attempt.metricObservations.some(({ authority }) => authority === 'human')
    )
  ) {
    throw new TypeError('Metric report human authority set is invalid.');
  }
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
      const observation =
        threshold.requiredAuthority === 'human'
          ? humanObservationByKey.get(
              `${descriptor.attemptId}\u0000${threshold.metricId}`
            )
          : attempt?.metricObservations.find(
              (entry) =>
                entry.metricId === threshold.metricId &&
                entry.authority === threshold.requiredAuthority
            );
      if (threshold.requiredAuthority === 'human' && !observation) {
        continue;
      }
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
    validatedHumanMetricObservationSetDigest:
      digestAgentEvaluationValidatedHumanMetricObservationSet(
        input.validatedHumanMetricObservations
      ),
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
    assertDigest(
      value.validatedHumanMetricObservationSetDigest,
      'Metric report validated-human observation-set digest'
    );
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
    validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
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
  const humanByAttempt = new Map<
    string,
    AgentEvaluationValidatedHumanMetricObservation[]
  >();
  for (const observation of input.validatedHumanMetricObservations) {
    const attempt = input.attempts.find(
      ({ descriptor }) => descriptor.attemptId === observation.attemptId
    );
    if (
      !isAgentEvaluationValidatedHumanMetricObservation(observation) ||
      observation.planDigest !== input.plan.planDigest ||
      attempt?.status !== 'completed' ||
      attempt.descriptor.descriptorDigest !== observation.descriptorDigest
    ) {
      throw new TypeError('Grader report human authority set is invalid.');
    }
    const entries = humanByAttempt.get(observation.attemptId) ?? [];
    entries.push(observation);
    humanByAttempt.set(observation.attemptId, entries);
  }
  if (
    input.attempts.some((attempt) =>
      attempt.metricObservations.some(({ authority }) => authority === 'human')
    )
  ) {
    throw new TypeError(
      'Attempt-local human observations are not authoritative.'
    );
  }
  for (const attempt of input.attempts) {
    const target = targetById.get(attempt.descriptor.targetId);
    const deterministic = attempt.metricObservations.filter(
      ({ authority }) => authority === 'deterministic'
    );
    const auxiliary = attempt.metricObservations.filter(
      ({ authority }) => authority === 'auxiliary'
    );
    const human = humanByAttempt.get(attempt.descriptor.attemptId) ?? [];
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
    validatedHumanMetricObservationSetDigest:
      digestAgentEvaluationValidatedHumanMetricObservationSet(
        input.validatedHumanMetricObservations
      ),
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
      isAgentCanonicalDigest(value.validatedHumanMetricObservationSetDigest) &&
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
  const criterionVerdicts =
    normalizeAgentEvaluationHumanReviewCriterionVerdicts(
      input.criterionVerdicts
    );
  if (
    !['passed', 'failed'].includes(input.verdict) ||
    input.verdict !== verdictForRequiredHumanReviewCriteria(criterionVerdicts)
  ) {
    throw new TypeError('Human review verdict is invalid.');
  }
  const base = Object.freeze({ ...input, criterionVerdicts });
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

export const AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES = 2_097_152;
export const AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_DIMENSION = 4_096;
export const AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_PIXELS = 16_777_216;

const reviewCandidateInputKeys = Object.freeze([
  'candidateId',
  'attemptId',
  'planDigest',
  'repositoryCommit',
  'descriptorDigest',
  'responseDigest',
  'executionReceiptDigest',
  'graderArtifactDigest',
  'projectionAuthorityDigest',
  'mediaType',
  'width',
  'height',
  'bytesBase64',
  'scanReceipt',
  'generatedAt',
]);

const reviewRasterScanInputKeys = Object.freeze([
  'scanReceiptId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'projectionAuthorityDigest',
  'mediaType',
  'width',
  'height',
  'byteLength',
  'policyDigest',
  'bytesDigest',
  'decodedPixelDigest',
  'metadataProfileDigest',
  'canarySetDigest',
  'fingerprintSetDigest',
  'findingDigests',
  'verdict',
  'scannedAt',
]);

const reviewCandidateRefKeys = Object.freeze([
  'candidateId',
  'attemptId',
  'planDigest',
  'repositoryCommit',
  'descriptorDigest',
  'responseDigest',
  'executionReceiptDigest',
  'graderArtifactDigest',
  'projectionAuthorityDigest',
  'mediaType',
  'width',
  'height',
  'bytesDigest',
  'byteLength',
  'publicArtifactScanDigest',
  'generatedAt',
  'candidateDigest',
]);

const hasExactKeys = (value: unknown, keys: readonly string[]): boolean =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key)) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const rasterDimensionIsValid = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_DIMENSION;

const byteSequenceEquals = (
  value: Uint8Array,
  offset: number,
  expected: readonly number[]
): boolean =>
  offset >= 0 &&
  offset + expected.length <= value.byteLength &&
  expected.every((byte, index) => value[offset + index] === byte);

const readBigEndianUint32 = (value: Uint8Array, offset: number): number =>
  ((value[offset] ?? 0) * 0x100_0000 +
    (value[offset + 1] ?? 0) * 0x1_0000 +
    (value[offset + 2] ?? 0) * 0x100 +
    (value[offset + 3] ?? 0)) >>>
  0;

const readLittleEndianUint32 = (value: Uint8Array, offset: number): number =>
  ((value[offset] ?? 0) |
    ((value[offset + 1] ?? 0) << 8) |
    ((value[offset + 2] ?? 0) << 16) |
    ((value[offset + 3] ?? 0) << 24)) >>>
  0;

const pngDimensions = (
  value: Uint8Array
): Readonly<{ width: number; height: number }> | undefined => {
  if (
    value.byteLength < 45 ||
    !byteSequenceEquals(value, 0, [137, 80, 78, 71, 13, 10, 26, 10]) ||
    readBigEndianUint32(value, 8) !== 13 ||
    !byteSequenceEquals(value, 12, [73, 72, 68, 82])
  ) {
    return undefined;
  }
  const width = readBigEndianUint32(value, 16);
  const height = readBigEndianUint32(value, 20);
  let offset = 8;
  let chunkCount = 0;
  let sawImageData = false;
  let sawEnd = false;
  while (offset + 12 <= value.byteLength) {
    const chunkLength = readBigEndianUint32(value, offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > value.byteLength) {
      return undefined;
    }
    const isHeader = byteSequenceEquals(value, offset + 4, [73, 72, 68, 82]);
    const isImageData = byteSequenceEquals(value, offset + 4, [73, 68, 65, 84]);
    const isEnd = byteSequenceEquals(value, offset + 4, [73, 69, 78, 68]);
    if (
      (chunkCount === 0 && (!isHeader || chunkLength !== 13)) ||
      (chunkCount > 0 && isHeader) ||
      (isEnd && (chunkLength !== 0 || chunkEnd !== value.byteLength))
    ) {
      return undefined;
    }
    sawImageData ||= isImageData;
    sawEnd ||= isEnd;
    chunkCount += 1;
    offset = chunkEnd;
    if (isEnd) break;
  }
  return sawImageData && sawEnd && offset === value.byteLength
    ? Object.freeze({ width, height })
    : undefined;
};

const webpLossyDimensions = (
  value: Uint8Array,
  dataOffset: number,
  chunkLength: number
): Readonly<{ width: number; height: number }> | undefined => {
  if (
    chunkLength < 10 ||
    !byteSequenceEquals(value, dataOffset + 3, [157, 1, 42])
  ) {
    return undefined;
  }
  return Object.freeze({
    width:
      ((value[dataOffset + 6] ?? 0) | ((value[dataOffset + 7] ?? 0) << 8)) &
      0x3fff,
    height:
      ((value[dataOffset + 8] ?? 0) | ((value[dataOffset + 9] ?? 0) << 8)) &
      0x3fff,
  });
};

const webpLosslessDimensions = (
  value: Uint8Array,
  dataOffset: number,
  chunkLength: number
): Readonly<{ width: number; height: number }> | undefined => {
  if (chunkLength < 5 || value[dataOffset] !== 0x2f) return undefined;
  const first = value[dataOffset + 1] ?? 0;
  const second = value[dataOffset + 2] ?? 0;
  const third = value[dataOffset + 3] ?? 0;
  const fourth = value[dataOffset + 4] ?? 0;
  return Object.freeze({
    width: 1 + first + ((second & 0x3f) << 8),
    height: 1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
  });
};

const webpExtendedDimensions = (
  value: Uint8Array,
  dataOffset: number,
  chunkLength: number
): Readonly<{ width: number; height: number }> | undefined => {
  if (chunkLength < 10) return undefined;
  return Object.freeze({
    width:
      1 +
      (value[dataOffset + 4] ?? 0) +
      ((value[dataOffset + 5] ?? 0) << 8) +
      ((value[dataOffset + 6] ?? 0) << 16),
    height:
      1 +
      (value[dataOffset + 7] ?? 0) +
      ((value[dataOffset + 8] ?? 0) << 8) +
      ((value[dataOffset + 9] ?? 0) << 16),
  });
};

const webpDimensions = (
  value: Uint8Array
): Readonly<{ width: number; height: number }> | undefined => {
  if (
    value.byteLength < 30 ||
    !byteSequenceEquals(value, 0, [82, 73, 70, 70]) ||
    readLittleEndianUint32(value, 4) !== value.byteLength - 8 ||
    !byteSequenceEquals(value, 8, [87, 69, 66, 80])
  ) {
    return undefined;
  }
  let offset = 12;
  let dimensions: Readonly<{ width: number; height: number }> | undefined;
  while (offset + 8 <= value.byteLength) {
    const chunkLength = readLittleEndianUint32(value, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + chunkLength + (chunkLength % 2);
    if (!Number.isSafeInteger(nextOffset) || nextOffset > value.byteLength) {
      return undefined;
    }
    if (byteSequenceEquals(value, offset, [86, 80, 56, 88])) {
      dimensions ??= webpExtendedDimensions(value, dataOffset, chunkLength);
    } else if (byteSequenceEquals(value, offset, [86, 80, 56, 76])) {
      dimensions ??= webpLosslessDimensions(value, dataOffset, chunkLength);
    } else if (byteSequenceEquals(value, offset, [86, 80, 56, 32])) {
      dimensions ??= webpLossyDimensions(value, dataOffset, chunkLength);
    }
    offset = nextOffset;
  }
  return offset === value.byteLength ? dimensions : undefined;
};

/** Validates the exact bounded PNG/WebP bytes used by review candidates and blind projections. */
export const validateAgentEvaluationReviewRasterBytes = (
  bytes: Uint8Array,
  mediaType: AgentEvaluationReviewCandidate['mediaType'],
  width: number,
  height: number
): void => {
  const actualDimensions =
    mediaType === 'image/png' ? pngDimensions(bytes) : webpDimensions(bytes);
  if (
    !actualDimensions ||
    actualDimensions.width !== width ||
    actualDimensions.height !== height ||
    !rasterDimensionIsValid(width) ||
    !rasterDimensionIsValid(height) ||
    width * height > AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_PIXELS
  ) {
    throw new TypeError(
      'Evaluation review candidate raster or dimensions are invalid.'
    );
  }
};

export const createAgentEvaluationReviewRasterScanReceipt = (
  input: Omit<
    AgentEvaluationReviewRasterScanReceipt,
    'format' | 'version' | 'receiptDigest'
  >
): AgentEvaluationReviewRasterScanReceipt => {
  if (!hasExactKeys(input, reviewRasterScanInputKeys)) {
    throw new TypeError(
      'Evaluation review raster scan input shape is invalid.'
    );
  }
  assertIdentity(input.scanReceiptId, 'Evaluation raster scan receipt id');
  assertIdentity(input.attemptId, 'Evaluation raster scan attempt id');
  for (const [label, value] of [
    ['Evaluation raster scan plan digest', input.planDigest],
    ['Evaluation raster scan descriptor digest', input.descriptorDigest],
    [
      'Evaluation raster scan projection authority digest',
      input.projectionAuthorityDigest,
    ],
    ['Evaluation raster scan policy digest', input.policyDigest],
    ['Evaluation raster scan bytes digest', input.bytesDigest],
    ['Evaluation raster scan decoded pixel digest', input.decodedPixelDigest],
    [
      'Evaluation raster scan metadata profile digest',
      input.metadataProfileDigest,
    ],
    ['Evaluation raster scan canary set digest', input.canarySetDigest],
    [
      'Evaluation raster scan fingerprint set digest',
      input.fingerprintSetDigest,
    ],
  ] as const) {
    assertDigest(value, label);
  }
  if (
    !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
    !['image/png', 'image/webp'].includes(input.mediaType) ||
    !rasterDimensionIsValid(input.width) ||
    !rasterDimensionIsValid(input.height) ||
    input.width * input.height >
      AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_PIXELS ||
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES ||
    !Array.isArray(input.findingDigests) ||
    input.findingDigests.length > 1_000
  ) {
    throw new TypeError('Evaluation review raster scan metadata is invalid.');
  }
  const findingDigests = Object.freeze(
    [...input.findingDigests].sort(compareUnicodeCodePoints)
  );
  if (
    new Set(findingDigests).size !== findingDigests.length ||
    findingDigests.some((value) => !isAgentCanonicalDigest(value)) ||
    !sameCanonicalJson(findingDigests, input.findingDigests) ||
    (input.verdict === 'safe') !== (findingDigests.length === 0) ||
    !['safe', 'blocked'].includes(input.verdict)
  ) {
    throw new TypeError('Evaluation review raster scan verdict is invalid.');
  }
  assertInstant(input.scannedAt, 'Evaluation raster scan time');
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-review-raster-scan-receipt' as const,
    version: 1 as const,
    ...input,
    findingDigests,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationReviewRasterScanReceipt = (
  value: AgentEvaluationReviewRasterScanReceipt
): boolean => {
  try {
    if (!hasExactAgentEvaluationReviewRasterScanReceiptShape(value)) {
      return false;
    }
    const {
      format: _format,
      version: _version,
      receiptDigest: _digest,
      ...input
    } = value;
    return sameCanonicalJson(
      createAgentEvaluationReviewRasterScanReceipt(input),
      value
    );
  } catch {
    return false;
  }
};

export type CreateAgentEvaluationReviewCandidateInput = Omit<
  AgentEvaluationReviewCandidate,
  | 'format'
  | 'version'
  | 'bytesDigest'
  | 'byteLength'
  | 'publicArtifactScanDigest'
  | 'candidateDigest'
> &
  Readonly<{ scanReceipt: AgentEvaluationReviewRasterScanReceipt }>;

export const createAgentEvaluationReviewCandidate = (
  input: CreateAgentEvaluationReviewCandidateInput
): AgentEvaluationReviewCandidate => {
  if (!hasExactKeys(input, reviewCandidateInputKeys)) {
    throw new TypeError('Evaluation review candidate input shape is invalid.');
  }
  assertIdentity(input.candidateId, 'Evaluation review candidate id');
  assertIdentity(input.attemptId, 'Evaluation review candidate attempt id');
  for (const [label, value] of [
    ['Evaluation review plan digest', input.planDigest],
    ['Evaluation review descriptor digest', input.descriptorDigest],
    ['Evaluation review response digest', input.responseDigest],
    [
      'Evaluation review execution receipt digest',
      input.executionReceiptDigest,
    ],
    ['Evaluation review grader artifact digest', input.graderArtifactDigest],
    [
      'Evaluation review projection authority digest',
      input.projectionAuthorityDigest,
    ],
  ] as const) {
    assertDigest(value, label);
  }
  if (!/^[0-9a-f]{40}$/u.test(input.repositoryCommit)) {
    throw new TypeError('Evaluation review repository commit is invalid.');
  }
  if (!['image/png', 'image/webp'].includes(input.mediaType)) {
    throw new TypeError('Evaluation review candidate media type is invalid.');
  }
  assertInstant(input.generatedAt, 'Evaluation review candidate time');
  const bytes = decodeCanonicalBase64(input.bytesBase64, {
    label: 'Evaluation review candidate bytes',
    maximumBytes: AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
  });
  try {
    if (bytes.byteLength < 1) {
      throw new TypeError('Evaluation review candidate raster is empty.');
    }
    validateAgentEvaluationReviewRasterBytes(
      bytes,
      input.mediaType,
      input.width,
      input.height
    );
    const bytesDigest = digestAgentCanonicalBytes(bytes);
    const scanReceipt = input.scanReceipt;
    if (
      !isAgentEvaluationReviewRasterScanReceipt(scanReceipt) ||
      scanReceipt.verdict !== 'safe' ||
      scanReceipt.planDigest !== input.planDigest ||
      scanReceipt.repositoryCommit !== input.repositoryCommit ||
      scanReceipt.attemptId !== input.attemptId ||
      scanReceipt.descriptorDigest !== input.descriptorDigest ||
      scanReceipt.projectionAuthorityDigest !==
        input.projectionAuthorityDigest ||
      scanReceipt.mediaType !== input.mediaType ||
      scanReceipt.width !== input.width ||
      scanReceipt.height !== input.height ||
      scanReceipt.byteLength !== bytes.byteLength ||
      scanReceipt.bytesDigest !== bytesDigest ||
      Date.parse(scanReceipt.scannedAt) > Date.parse(input.generatedAt)
    ) {
      throw new TypeError(
        'Evaluation review candidate raster scan binding is invalid.'
      );
    }
    const base = Object.freeze({
      format: 'prodivix.agent-evaluation-review-candidate' as const,
      version: 2 as const,
      candidateId: input.candidateId,
      attemptId: input.attemptId,
      planDigest: input.planDigest,
      repositoryCommit: input.repositoryCommit,
      descriptorDigest: input.descriptorDigest,
      responseDigest: input.responseDigest,
      executionReceiptDigest: input.executionReceiptDigest,
      graderArtifactDigest: input.graderArtifactDigest,
      projectionAuthorityDigest: input.projectionAuthorityDigest,
      mediaType: input.mediaType,
      width: input.width,
      height: input.height,
      bytesBase64: input.bytesBase64,
      bytesDigest,
      byteLength: bytes.byteLength,
      publicArtifactScanDigest: scanReceipt.receiptDigest,
      generatedAt: input.generatedAt,
    });
    return Object.freeze({
      ...base,
      candidateDigest: digestAgentCanonicalValue(base),
    });
  } finally {
    bytes.fill(0);
  }
};

export const isAgentEvaluationReviewCandidate = (
  value: AgentEvaluationReviewCandidate
): boolean => {
  try {
    if (
      !hasExactAgentEvaluationReviewCandidateShape(value) ||
      value.format !== 'prodivix.agent-evaluation-review-candidate' ||
      value.version !== 2 ||
      !isAgentEvaluationReviewCandidateRef(
        (({
          format: _format,
          version: _version,
          bytesBase64: _bytesBase64,
          ...reference
        }) => reference)(value)
      )
    ) {
      return false;
    }
    const bytes = decodeCanonicalBase64(value.bytesBase64, {
      label: 'Evaluation review candidate bytes',
      maximumBytes: AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
    });
    try {
      validateAgentEvaluationReviewRasterBytes(
        bytes,
        value.mediaType,
        value.width,
        value.height
      );
      const { candidateDigest, ...base } = value;
      return (
        bytes.byteLength === value.byteLength &&
        digestAgentCanonicalBytes(bytes) === value.bytesDigest &&
        candidateDigest === digestAgentCanonicalValue(base)
      );
    } finally {
      bytes.fill(0);
    }
  } catch {
    return false;
  }
};

export const isAgentEvaluationReviewCandidateRef = (
  value: AgentEvaluationReviewCandidateRef
): boolean => {
  try {
    if (!hasExactKeys(value, reviewCandidateRefKeys)) return false;
    assertIdentity(value.candidateId, 'Evaluation review candidate id');
    assertIdentity(value.attemptId, 'Evaluation review candidate attempt id');
    for (const [label, digest] of [
      ['Evaluation review plan digest', value.planDigest],
      ['Evaluation review descriptor digest', value.descriptorDigest],
      ['Evaluation review response digest', value.responseDigest],
      [
        'Evaluation review execution receipt digest',
        value.executionReceiptDigest,
      ],
      ['Evaluation review grader artifact digest', value.graderArtifactDigest],
      [
        'Evaluation review projection authority digest',
        value.projectionAuthorityDigest,
      ],
      ['Evaluation review raster bytes digest', value.bytesDigest],
      ['Evaluation review scan digest', value.publicArtifactScanDigest],
      ['Evaluation review candidate digest', value.candidateDigest],
    ] as const) {
      assertDigest(digest, label);
    }
    assertInstant(value.generatedAt, 'Evaluation review candidate time');
    return (
      /^[0-9a-f]{40}$/u.test(value.repositoryCommit) &&
      ['image/png', 'image/webp'].includes(value.mediaType) &&
      rasterDimensionIsValid(value.width) &&
      rasterDimensionIsValid(value.height) &&
      value.width * value.height <=
        AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_PIXELS &&
      Number.isSafeInteger(value.byteLength) &&
      value.byteLength >= 1 &&
      value.byteLength <= AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES
    );
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
  descriptor: AgentModelEvaluationAttemptDescriptor
): AgentModelEvaluationMissingAttemptRef =>
  Object.freeze({
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    reason: 'missing',
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
    validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
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
    .filter((descriptor) => !attemptById.has(descriptor.attemptId))
    .map((descriptor) => missingReference(descriptor));
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
        validatedHumanMetricObservations:
          input.validatedHumanMetricObservations,
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
        validatedHumanMetricObservations:
          input.validatedHumanMetricObservations,
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
        if (attemptById.get(descriptor.attemptId)?.status !== 'completed') {
          continue;
        }
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
    input.plan.thresholds.metrics.every((threshold) =>
      input.metricReport.slices.some(
        ({ metricId }) => metricId === threshold.metricId
      )
    ) &&
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
    validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
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
      validatedHumanMetricObservations: input.validatedHumanMetricObservations,
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
