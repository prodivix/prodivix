import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  normalizeVerificationCheckReportCandidate,
  type VerificationAdapterLifecycleResult,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createPerformanceEnvironmentDigest,
  createPerformanceSamplingDigest,
  type BrowserVerificationCellProfile,
} from '@prodivix/verification-browser';
import { GOLDEN_G3_V6_VISUAL_BASELINE_ASSET } from './goldenG3V6VisualBaseline';

const sorted = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values].sort(compareUnicodeCodePoints));

function assertCommonReport(
  cell: VerificationPlanCell,
  result: VerificationAdapterLifecycleResult
): asserts result is Extract<
  VerificationAdapterLifecycleResult,
  Readonly<{ status: 'reported' }>
> {
  if (
    result.status !== 'reported' ||
    result.cleanup.status !== 'clean' ||
    result.report.terminal.status !== 'completed' ||
    result.report.terminal.exitCode !== 0 ||
    result.report.cellId !== cell.id ||
    result.report.checkKind !== cell.checkKind ||
    result.report.inputDigest !== cell.inputDigest ||
    !sameCanonicalJson(result.report.adapter, cell.adapter) ||
    result.stagedArtifacts.length !== cell.artifactKinds.length ||
    !sameCanonicalJson(
      sorted(result.report.artifacts.map(({ kind }) => kind)),
      sorted(cell.artifactKinds)
    )
  ) {
    const diagnostic =
      result.status === 'reported'
        ? {
            status: result.status,
            cleanupStatus: result.cleanup.status,
            terminalStatus: result.report.terminal.status,
            terminalExitCode:
              result.report.terminal.status === 'completed'
                ? result.report.terminal.exitCode
                : undefined,
            reportCellId: result.report.cellId,
            reportCheckKind: result.report.checkKind,
            reportInputDigestMatches:
              result.report.inputDigest === cell.inputDigest,
            adapterMatches: sameCanonicalJson(
              result.report.adapter,
              cell.adapter
            ),
            stagedArtifactCount: result.stagedArtifacts.length,
            expectedArtifactCount: cell.artifactKinds.length,
            reportDiagnosticCodes: result.report.diagnosticCodes,
            payload:
              result.report.payload.kind === 'security'
                ? {
                    kind: result.report.payload.kind,
                    observedRuleIds: result.report.payload.observedRuleIds,
                    findings: result.report.payload.findings.map(
                      ({ ruleId, diagnosticCodes }) => ({
                        ruleId,
                        diagnosticCodes,
                      })
                    ),
                  }
                : { kind: result.report.payload.kind },
            reportedArtifactKinds: sorted(
              result.report.artifacts.map(({ kind }) => kind)
            ),
            expectedArtifactKinds: sorted(cell.artifactKinds),
          }
        : {
            status: result.status,
            reasonCode: result.reasonCode,
            failureClass: result.failureClass,
            cleanup: result.cleanup,
            events: result.events.map(({ event }) =>
              event.kind === 'diagnostic'
                ? { kind: event.kind, code: event.code }
                : { kind: event.kind }
            ),
          };
    throw new Error(
      `Golden V6 attempt for "${cell.id}" did not report an exact clean completed candidate: ${JSON.stringify(diagnostic)}.`
    );
  }
  const normalized = normalizeVerificationCheckReportCandidate(result.report);
  if (
    normalized.status !== 'ready' ||
    normalized.report.verdict !== 'passed' ||
    normalized.report.outcome !== 'passed'
  ) {
    throw new Error(
      `Golden V6 attempt for "${cell.id}" did not normalize to passed.`
    );
  }
}

const assertE2e = (
  payload: Extract<
    Extract<
      VerificationAdapterLifecycleResult,
      Readonly<{ status: 'reported' }>
    >['report']['payload'],
    Readonly<{ kind: 'e2e' }>
  >,
  program: BehaviorScenarioProgram
): void => {
  const expectedStepIds = sorted(
    program.observations.map(({ stepId }) => stepId)
  );
  if (
    payload.scenarioId !== program.scenarioId ||
    payload.steps.length !== program.observations.length ||
    payload.steps.some(
      (step) =>
        step.status !== 'passed' ||
        !step.blackBox ||
        step.diagnosticCodes.length !== 0
    ) ||
    !sameCanonicalJson(
      sorted(payload.steps.map(({ stepId }) => stepId)),
      expectedStepIds
    )
  ) {
    throw new Error(
      'Golden V6 E2E payload is incomplete, non-black-box, or Program-drifted.'
    );
  }
};

const assertVisual = (
  payload: Extract<
    Extract<
      VerificationAdapterLifecycleResult,
      Readonly<{ status: 'reported' }>
    >['report']['payload'],
    Readonly<{ kind: 'visual' }>
  >,
  profile: Extract<BrowserVerificationCellProfile, Readonly<{ kind: 'visual' }>>
): void => {
  const comparison = payload.comparisons[0];
  if (
    payload.comparisons.length !== 1 ||
    !comparison ||
    comparison.observationId !== profile.observationId ||
    comparison.status !== 'passed' ||
    comparison.changedPixels !== 0 ||
    comparison.thresholdPixels !== 0 ||
    comparison.currentDigest !==
      GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest ||
    comparison.baselineDigest !==
      GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest ||
    comparison.currentDigest !== comparison.baselineDigest ||
    comparison.maskIds.length !== 0
  ) {
    throw new Error(
      'Golden V6 visual payload did not exactly match its pre-adopted fixed raster.'
    );
  }
};

const assertAccessibility = (
  payload: Extract<
    Extract<
      VerificationAdapterLifecycleResult,
      Readonly<{ status: 'reported' }>
    >['report']['payload'],
    Readonly<{ kind: 'accessibility' }>
  >,
  profile: Extract<
    BrowserVerificationCellProfile,
    Readonly<{ kind: 'accessibility' }>
  >
): void => {
  const expectedSteps = profile.keyboardFocusJourney.steps;
  const expectedTargetId = (step: (typeof expectedSteps)[number]): string =>
    'expectedTargetId' in step
      ? step.expectedTargetId
      : step.announcementTargetId;
  const dynamicStep = expectedSteps.find(
    ({ assertionCode }) => assertionCode === 'dynamic-announcement'
  );
  const dynamicResult = payload.journeys.find(
    ({ assertionCode }) => assertionCode === 'dynamic-announcement'
  );
  if (
    payload.findings.length !== 0 ||
    payload.journeys.length !== expectedSteps.length ||
    payload.journeys.some(
      (journey) =>
        journey.status !== 'passed' ||
        journey.diagnosticCodes.length !== 0 ||
        !expectedSteps.some(
          (step) =>
            step.stepId === journey.stepId &&
            step.assertionCode === journey.assertionCode &&
            expectedTargetId(step) === journey.targetId
        )
    ) ||
    !dynamicStep ||
    dynamicStep.assertionCode !== 'dynamic-announcement' ||
    !dynamicResult?.announcement ||
    dynamicResult.announcement.triggerTargetId !==
      dynamicStep.triggerTargetId ||
    dynamicResult.announcement.role !== dynamicStep.expectedRole ||
    dynamicResult.announcement.live !== dynamicStep.expectedLive ||
    dynamicResult.announcement.afterTextDigest !==
      dynamicStep.expectedTextDigest ||
    dynamicResult.announcement.beforeTextDigest ===
      dynamicResult.announcement.afterTextDigest
  ) {
    throw new Error(
      'Golden V6 accessibility payload lacks exact subtree scan, focus, and live-region evidence.'
    );
  }
};

const assertPerformance = (
  payload: Extract<
    Extract<
      VerificationAdapterLifecycleResult,
      Readonly<{ status: 'reported' }>
    >['report']['payload'],
    Readonly<{ kind: 'performance' }>
  >,
  profile: Extract<
    BrowserVerificationCellProfile,
    Readonly<{ kind: 'performance' }>
  >
): void => {
  const expected = new Map<string, (typeof profile.policy.thresholds)[number]>(
    profile.policy.thresholds.map((threshold) => [
      threshold.metricId,
      threshold,
    ])
  );
  if (
    !payload.comparable ||
    payload.environmentDigest !==
      createPerformanceEnvironmentDigest(profile.policy.expectedEnvironment) ||
    payload.samplingDigest !==
      createPerformanceSamplingDigest(profile.policy.sampling) ||
    payload.metrics.length !== expected.size ||
    payload.metrics.some((metric) => {
      const threshold = expected.get(metric.metricId);
      return (
        !threshold ||
        metric.sampleCount !== profile.policy.sampling.sampleCount ||
        metric.unit !== threshold.unit ||
        metric.operator !== threshold.operator ||
        metric.threshold !== threshold.threshold ||
        (metric.operator === 'less-than-or-equal'
          ? metric.value > metric.threshold
          : metric.value < metric.threshold)
      );
    })
  ) {
    throw new Error(
      'Golden V6 performance payload is incomparable, policy-drifted, or over budget.'
    );
  }
};

const assertSecurity = (
  payload: Extract<
    Extract<
      VerificationAdapterLifecycleResult,
      Readonly<{ status: 'reported' }>
    >['report']['payload'],
    Readonly<{ kind: 'security' }>
  >,
  profile: Extract<
    BrowserVerificationCellProfile,
    Readonly<{ kind: 'security' }>
  >
): void => {
  const expectedRuleIds = sorted(
    profile.policy.expectedChecks.map(({ ruleId }) => ruleId)
  );
  if (
    expectedRuleIds.length !== 9 ||
    payload.observedRuleIds.length !== 9 ||
    payload.findings.length !== 0 ||
    !sameCanonicalJson(sorted(payload.observedRuleIds), expectedRuleIds)
  ) {
    throw new Error(
      'Golden V6 security payload did not reach exact clean nine-rule finalization.'
    );
  }
};

export function assertGoldenG3V6ReportedPass(
  cell: VerificationPlanCell,
  result: VerificationAdapterLifecycleResult,
  profile: BrowserVerificationCellProfile,
  program: BehaviorScenarioProgram
): asserts result is Extract<
  VerificationAdapterLifecycleResult,
  Readonly<{ status: 'reported' }>
> {
  assertCommonReport(cell, result);
  const payload = result.report.payload;
  if (payload.kind !== profile.kind) {
    throw new Error(
      `Golden V6 report kind "${payload.kind}" drifted from profile "${profile.kind}".`
    );
  }
  switch (payload.kind) {
    case 'e2e':
      assertE2e(payload, program);
      break;
    case 'visual':
      assertVisual(
        payload,
        profile as Extract<
          BrowserVerificationCellProfile,
          Readonly<{ kind: 'visual' }>
        >
      );
      break;
    case 'accessibility':
      assertAccessibility(
        payload,
        profile as Extract<
          BrowserVerificationCellProfile,
          Readonly<{ kind: 'accessibility' }>
        >
      );
      break;
    case 'performance':
      assertPerformance(
        payload,
        profile as Extract<
          BrowserVerificationCellProfile,
          Readonly<{ kind: 'performance' }>
        >
      );
      break;
    case 'security':
      assertSecurity(
        payload,
        profile as Extract<
          BrowserVerificationCellProfile,
          Readonly<{ kind: 'security' }>
        >
      );
      break;
    default:
      throw new Error('Golden V6 browser payload has an unsupported kind.');
  }
}
