import { beforeAll, describe, expect, it } from 'vitest';
import {
  V8_TIME,
  createPassingV8Attempts,
  createV8EvaluationPlan,
  createV8HoldoutReceipt,
  createV8HumanReviewReport,
} from '../__tests__/agentV8Fixtures';
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
import {
  buildAgentEvaluationGraderReport,
  buildAgentEvaluationMetricReport,
  createAgentModelEvaluationManifest,
  createAgentModelEvaluationQualification,
  isAgentModelEvaluationManifest,
  validateAgentModelEvaluationManifest,
} from './agentEvaluationResults';

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
  let holdout: AgentHoldoutExecutionReceipt;
  let manifest: AgentModelEvaluationManifest;

  beforeAll(() => {
    plan = createV8EvaluationPlan();
    const descriptors = planAgentModelEvaluationAttempts(plan);
    attempts = createPassingV8Attempts(plan);
    metric = buildAgentEvaluationMetricReport({
      reportId: 'metric-report.g4-v8.passing',
      plan,
      descriptors,
      attempts,
      generatedAt: V8_TIME.evaluated,
    });
    grader = buildAgentEvaluationGraderReport({
      reportId: 'grader-report.g4-v8.passing',
      plan,
      attempts,
      generatedAt: V8_TIME.evaluated,
    });
    human = createV8HumanReviewReport(plan);
    holdout = createV8HoldoutReceipt(plan);
    manifest = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.passing',
      plan,
      descriptors,
      attempts,
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
    const descriptors = planAgentModelEvaluationAttempts(plan);
    const incompleteMetric = buildAgentEvaluationMetricReport({
      reportId: 'metric-report.g4-v8.incomplete',
      plan,
      descriptors,
      attempts: incompleteAttempts,
      generatedAt: V8_TIME.evaluated,
    });
    const incompleteGrader = buildAgentEvaluationGraderReport({
      reportId: 'grader-report.g4-v8.incomplete',
      plan,
      attempts: incompleteAttempts,
      generatedAt: V8_TIME.evaluated,
    });
    const incomplete = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.incomplete',
      plan,
      descriptors,
      attempts: incompleteAttempts,
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

  it('fails closed when the protected holdout leaks or the manifest expires', () => {
    const leakedReceipt = {
      ...holdout,
      leakedCaseIds: [holdout.executedCaseIds[0]!],
    } as AgentHoldoutExecutionReceipt;
    const leaked = createAgentModelEvaluationManifest({
      manifestId: 'manifest.g4-v8.leaked',
      plan,
      attempts,
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
