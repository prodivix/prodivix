import { beforeAll, describe, expect, it } from 'vitest';
import {
  V8_TIME,
  createPassingV8Attempts,
  createV8EvaluationPlan,
  createV8HoldoutReceipt,
  createV8HumanReviewReport,
  createV8ValidatedHumanMetricObservations,
} from '../__tests__/agentV8Fixtures';
import type { AgentEvaluationValidatedHumanMetricObservation } from './agentEvaluationHumanMetricAuthority';
import type {
  AgentEvaluationGraderReport,
  AgentEvaluationMetricReport,
  AgentHoldoutExecutionReceipt,
  AgentHumanReviewReport,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationManifest,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import { planAgentModelEvaluationAttempts } from './agentEvaluationPlan';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  buildAgentEvaluationGraderReport,
  buildAgentEvaluationMetricReport,
  createAgentEvaluationTransportAttemptReceipt,
  createAgentEvaluationTransportRetryReceipt,
  createAgentModelEvaluationAttempt,
  createAgentModelEvaluationManifest,
  createAgentModelEvaluationQualification,
  isAgentModelEvaluationAttempt,
  isAgentModelEvaluationManifest,
  validateAgentModelEvaluationManifest,
} from './agentEvaluationResults';

const attemptAuthority = (label: string) =>
  Object.freeze({
    dispatchIntentSetDigest: digestAgentCanonicalValue({
      label,
      authority: 'dispatch-intents',
    }),
    transportReceiptSetDigest: digestAgentCanonicalValue({
      label,
      authority: 'transport-receipts',
    }),
    invocationTurnReceiptSetDigest: digestAgentCanonicalValue({
      label,
      authority: 'invocation-turn-receipts',
    }),
    invocationTurnSetReceiptDigest: digestAgentCanonicalValue({
      label,
      authority: 'invocation-turn-set',
    }),
    capabilityExecutionReceiptSetDigest: digestAgentCanonicalValue({
      label,
      authority: 'capability-execution-receipt-set',
    }),
    verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue({
      verificationAttemptGrantReceiptDigests: [],
    }),
  });

describe('G4 V8 attempt authenticity hard cut', () => {
  it('requires four-level authority for a recorded terminal failure', () => {
    const plan = createV8EvaluationPlan();
    const descriptor = planAgentModelEvaluationAttempts(plan)[0]!;
    const requestDigest = digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      request: 'stable',
    });
    const sealedTry = createAgentEvaluationTransportAttemptReceipt({
      sequence: 1,
      requestDigest,
      status: 'rate-limited',
      retryable: false,
      startedAt: V8_TIME.started,
      completedAt: V8_TIME.completed,
    });
    const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
      policyDigest: digestAgentCanonicalValue('bounded-transport-retry'),
      maximumAttempts: 1,
      attempts: [sealedTry],
      exhausted: false,
    });
    expect(() =>
      createAgentModelEvaluationAttempt({
        descriptor,
        independentRunId: 'run.non-completed-without-lineage',
        status: 'rate-limited',
        outcome: 'inconclusive',
        metricObservations: [],
        usage: createAgentUsageVector([]),
        cost: [],
        startedAt: V8_TIME.started,
        completedAt: V8_TIME.completed,
      } as never)
    ).toThrow(/digest/u);
    expect(() =>
      createAgentEvaluationTransportRetryReceipt({
        policyDigest: digestAgentCanonicalValue('bounded-transport-retry'),
        maximumAttempts: 2,
        attempts: [sealedTry],
        exhausted: false,
      })
    ).toThrow(/exactly one sealed try/u);
    const attempt = createAgentModelEvaluationAttempt({
      descriptor,
      independentRunId: 'run.non-completed-with-lineage',
      ...attemptAuthority('terminal-failure'),
      status: 'rate-limited',
      outcome: 'inconclusive',
      metricObservations: [],
      usage: createAgentUsageVector([]),
      cost: [],
      startedAt: V8_TIME.started,
      completedAt: V8_TIME.completed,
    });
    expect(attempt).toMatchObject({
      status: 'rate-limited',
      ...attemptAuthority('terminal-failure'),
    });
    expect(transportRetryReceipt).toMatchObject({
      maximumAttempts: 1,
      exhausted: false,
    });
  });

  it('requires a terminal response and binds all four authority levels on completion', () => {
    const descriptor = planAgentModelEvaluationAttempts(
      createV8EvaluationPlan()
    )[0]!;
    const responseDigest = digestAgentCanonicalValue({
      descriptorDigest: descriptor.descriptorDigest,
      response: 'completed',
    });
    const attempt = createAgentModelEvaluationAttempt({
      descriptor,
      independentRunId: 'run.completed-with-authority',
      ...attemptAuthority('completed'),
      responseDigest,
      status: 'completed',
      outcome: 'passed',
      metricObservations: [],
      usage: createAgentUsageVector([]),
      cost: [],
      startedAt: V8_TIME.started,
      completedAt: V8_TIME.completed,
    });

    expect(isAgentModelEvaluationAttempt(attempt)).toBe(true);
    expect(attempt).toMatchObject({
      ...attemptAuthority('completed'),
      responseDigest,
    });
    expect(() =>
      createAgentModelEvaluationAttempt({
        descriptor,
        independentRunId: 'run.completed-without-response',
        ...attemptAuthority('missing-response'),
        status: 'completed',
        outcome: 'passed',
        metricObservations: [],
        usage: createAgentUsageVector([]),
        cost: [],
        startedAt: V8_TIME.started,
        completedAt: V8_TIME.completed,
      })
    ).toThrow(/terminal response/u);
  });
});

const describeFullModelEvaluation = describe.runIf(
  (
    globalThis as typeof globalThis & {
      process?: { env?: Readonly<Record<string, string | undefined>> };
    }
  ).process?.env?.PRODIVIX_VERIFY_G4_V8_MODEL_EVAL === '1'
);

describeFullModelEvaluation('G4 V8 model-evaluation manifest', () => {
  let plan: AgentModelEvaluationPlan;
  let attempts: readonly AgentModelEvaluationAttempt[];
  let metric: AgentEvaluationMetricReport;
  let grader: AgentEvaluationGraderReport;
  let human: AgentHumanReviewReport;
  let humanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
  let holdout: AgentHoldoutExecutionReceipt;
  let manifest: AgentModelEvaluationManifest;

  beforeAll(() => {
    plan = createV8EvaluationPlan();
    const descriptors = planAgentModelEvaluationAttempts(plan);
    attempts = createPassingV8Attempts(plan);
    human = createV8HumanReviewReport(plan);
    humanMetricObservations = createV8ValidatedHumanMetricObservations(
      plan,
      attempts,
      human
    );
    metric = buildAgentEvaluationMetricReport({
      reportId: 'metric-report.g4-v8.passing',
      plan,
      descriptors,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    grader = buildAgentEvaluationGraderReport({
      reportId: 'grader-report.g4-v8.passing',
      plan,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    holdout = createV8HoldoutReceipt(plan);
    manifest = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.passing',
      plan,
      descriptors,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      metricReport: metric,
      graderReport: grader,
      humanReviewReport: human,
      holdoutExecutionReceipt: holdout,
      completedAt: V8_TIME.evaluated,
      expiresAt: '2026-08-08T00:00:00.000Z',
    });
  }, 60_000);

  it('accounts for every planned journey and admits only a satisfied fresh target', () => {
    expect(attempts.length).toBeGreaterThanOrEqual(11_640);
    expect(manifest.outcome).toBe('satisfied');
    expect(manifest.missingOrInfrastructureAttemptRefs).toEqual([]);
    expect(isAgentModelEvaluationManifest(manifest)).toBe(true);
    expect(
      validateAgentModelEvaluationManifest({
        manifest,
        plan,
        attempts,
        validatedHumanMetricObservations: humanMetricObservations,
        metricReport: metric,
        graderReport: grader,
        humanReviewReport: human,
        holdoutExecutionReceipt: holdout,
      })
    ).toEqual([]);
    const target = plan.capabilityQualificationTargets[0]!;
    expect(
      createAgentModelEvaluationQualification({
        manifest,
        plan,
        qualificationTargetDigest: target.targetDigest,
        qualificationSliceDigest: target.qualificationSliceDigest,
        evaluatedAt: '2026-08-04T00:00:00.000Z',
      })
    ).toMatchObject({
      manifestRef: manifest.manifestId,
      planDigest: plan.planDigest,
      qualificationTargetDigest: target.targetDigest,
    });
  }, 30_000);

  it('keeps missing attempts in the denominator and marks the manifest incomplete', () => {
    const incompleteAttempts = attempts.slice(1);
    const incompleteHumanMetricObservations = humanMetricObservations.filter(
      (observation) =>
        incompleteAttempts.some(
          ({ descriptor }) => descriptor.attemptId === observation.attemptId
        )
    );
    const descriptors = planAgentModelEvaluationAttempts(plan);
    const incompleteMetric = buildAgentEvaluationMetricReport({
      reportId: 'metric-report.g4-v8.incomplete',
      plan,
      descriptors,
      attempts: incompleteAttempts,
      validatedHumanMetricObservations: incompleteHumanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    const incompleteGrader = buildAgentEvaluationGraderReport({
      reportId: 'grader-report.g4-v8.incomplete',
      plan,
      attempts: incompleteAttempts,
      validatedHumanMetricObservations: incompleteHumanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    const incomplete = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.incomplete',
      plan,
      descriptors,
      attempts: incompleteAttempts,
      validatedHumanMetricObservations: incompleteHumanMetricObservations,
      metricReport: incompleteMetric,
      graderReport: incompleteGrader,
      humanReviewReport: human,
      holdoutExecutionReceipt: holdout,
      completedAt: V8_TIME.evaluated,
      expiresAt: '2026-08-08T00:00:00.000Z',
    });
    expect(incomplete.outcome).toBe('incomplete');
    expect(incomplete.missingOrInfrastructureAttemptRefs).toHaveLength(1);
    expect(() =>
      createAgentModelEvaluationQualification({
        manifest: incomplete,
        plan,
        qualificationTargetDigest:
          plan.capabilityQualificationTargets[0]!.targetDigest,
        qualificationSliceDigest:
          plan.capabilityQualificationTargets[0]!.qualificationSliceDigest,
        evaluatedAt: '2026-08-04T00:00:00.000Z',
      })
    ).toThrow(/satisfied exact evaluation target/u);
  }, 30_000);

  it('keeps recorded provider failures in the denominator and marks quality unsatisfied', () => {
    const descriptors = planAgentModelEvaluationAttempts(plan);
    const failedIndex = attempts.findIndex(({ descriptor }) => {
      const evaluationCase = plan.concreteCases.find(
        ({ caseId }) => caseId === descriptor.caseId
      );
      return evaluationCase?.subjectiveVisualQuality === false;
    });
    expect(failedIndex).toBeGreaterThanOrEqual(0);
    const passing = attempts[failedIndex]!;
    const failed = createAgentModelEvaluationAttempt({
      descriptor: passing.descriptor,
      independentRunId: passing.independentRunId,
      ...attemptAuthority('recorded-provider-failure'),
      status: 'rate-limited',
      outcome: 'inconclusive',
      metricObservations: [],
      usage: passing.usage,
      cost: passing.cost,
      startedAt: passing.startedAt,
      completedAt: passing.completedAt,
    });
    const recordedAttempts = attempts.map((attempt, index) =>
      index === failedIndex ? failed : attempt
    );
    const recordedMetric = buildAgentEvaluationMetricReport({
      reportId: 'metric-report.g4-v8.recorded-provider-failure',
      plan,
      descriptors,
      attempts: recordedAttempts,
      validatedHumanMetricObservations: humanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    const recordedGrader = buildAgentEvaluationGraderReport({
      reportId: 'grader-report.g4-v8.recorded-provider-failure',
      plan,
      attempts: recordedAttempts,
      validatedHumanMetricObservations: humanMetricObservations,
      generatedAt: V8_TIME.evaluated,
    });
    const recorded = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.recorded-provider-failure',
      plan,
      descriptors,
      attempts: recordedAttempts,
      validatedHumanMetricObservations: humanMetricObservations,
      metricReport: recordedMetric,
      graderReport: recordedGrader,
      humanReviewReport: human,
      holdoutExecutionReceipt: holdout,
      completedAt: V8_TIME.evaluated,
      expiresAt: '2026-08-08T00:00:00.000Z',
    });
    expect(recorded.missingOrInfrastructureAttemptRefs).toEqual([]);
    expect(recorded.attemptRefs).toHaveLength(descriptors.length);
    expect(
      recordedMetric.slices.reduce(
        (total, slice) => total + slice.inconclusive,
        0
      )
    ).toBeGreaterThan(0);
    expect(recorded.outcome).toBe('unsatisfied');
  }, 30_000);

  it('fails closed when the protected holdout leaks or the manifest expires', () => {
    const leakedReceipt = {
      ...holdout,
      leakedCaseIds: [holdout.executedCaseIds[0]!],
    } as AgentHoldoutExecutionReceipt;
    const leaked = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.leaked',
      plan,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      metricReport: metric,
      graderReport: grader,
      humanReviewReport: human,
      holdoutExecutionReceipt: leakedReceipt,
      completedAt: V8_TIME.evaluated,
      expiresAt: '2026-08-08T00:00:00.000Z',
    });
    expect(leaked.outcome).toBe('incomplete');
    const expired = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.expired',
      plan,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      metricReport: metric,
      graderReport: grader,
      humanReviewReport: human,
      holdoutExecutionReceipt: holdout,
      completedAt: plan.expiresAt,
      expiresAt: '2026-08-10T00:00:00.000Z',
    });
    expect(expired.outcome).toBe('expired');
  }, 30_000);

  it('recomputes metric reports from the frozen denominator instead of trusting a self-signed report', () => {
    const first = metric.slices[0]!;
    const { sliceDigest: _sliceDigest, ...sliceBase } = first;
    const tamperedSliceBase = { ...sliceBase, thresholdSatisfied: false };
    const tamperedSlice = {
      ...tamperedSliceBase,
      sliceDigest: digestAgentCanonicalValue(tamperedSliceBase),
    };
    const { reportDigest: _reportDigest, ...reportBase } = metric;
    const tamperedReportBase = {
      ...reportBase,
      slices: [tamperedSlice, ...metric.slices.slice(1)],
    };
    const tamperedReport = {
      ...tamperedReportBase,
      reportDigest: digestAgentCanonicalValue(tamperedReportBase),
    } as AgentEvaluationMetricReport;
    const rejected = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.self-signed-report',
      plan,
      attempts,
      validatedHumanMetricObservations: humanMetricObservations,
      metricReport: tamperedReport,
      graderReport: grader,
      humanReviewReport: human,
      holdoutExecutionReceipt: holdout,
      completedAt: V8_TIME.evaluated,
      expiresAt: '2026-08-08T00:00:00.000Z',
    });
    expect(rejected.outcome).toBe('incomplete');
  }, 30_000);
});
