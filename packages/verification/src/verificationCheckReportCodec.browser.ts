import type {
  VerificationAccessibilityFindingReport,
  VerificationAccessibilityJourneyReport,
  VerificationCheckReportPayload,
  VerificationPerformanceMetricReport,
  VerificationSecurityFindingReport,
  VerificationVisualComparisonReport,
} from './verificationCheckReport.types';
import type { VerificationCheckKind } from './verification.types';
import { readVerificationBehaviorAssertionReceipt } from './verificationCheckReportCodec.behavior';
import {
  addVerificationReportIssue,
  readVerificationReportArray,
  sortUniqueVerificationReportValues,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
  verificationReportBoolean,
  verificationReportDigest,
  verificationReportInteger,
  verificationReportNumber,
  verificationReportOneOf,
  verificationReportRecord,
  verificationReportToken,
  verificationReportTokenArray,
  type VerificationReportDecodeState,
} from './verificationCheckReportCodec.common';

const readVisualComparison = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationVisualComparisonReport | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'observationId',
      'compatibilityKey',
      'baselineDigest',
      'currentDigest',
      'changedPixels',
      'totalPixels',
      'thresholdPixels',
      'status',
      'maskIds',
    ],
    ['diffDigest', 'sourceTraceDigest'],
    path,
    state
  );
  if (!data) return undefined;
  const observationId = verificationReportToken(
    data.observationId,
    `${path}/observationId`,
    state
  );
  const compatibilityKey = verificationReportToken(
    data.compatibilityKey,
    `${path}/compatibilityKey`,
    state
  );
  const baselineDigest = verificationReportDigest(
    data.baselineDigest,
    `${path}/baselineDigest`,
    state
  );
  const currentDigest = verificationReportDigest(
    data.currentDigest,
    `${path}/currentDigest`,
    state
  );
  const diffDigest =
    data.diffDigest === undefined
      ? undefined
      : verificationReportDigest(data.diffDigest, `${path}/diffDigest`, state);
  const changedPixels = verificationReportInteger(
    data.changedPixels,
    `${path}/changedPixels`,
    state,
    1_000_000_000
  );
  const totalPixels = verificationReportInteger(
    data.totalPixels,
    `${path}/totalPixels`,
    state,
    1_000_000_000,
    1
  );
  const thresholdPixels = verificationReportInteger(
    data.thresholdPixels,
    `${path}/thresholdPixels`,
    state,
    1_000_000_000
  );
  const status = verificationReportOneOf(
    data.status,
    ['passed', 'failed', 'incompatible'] as const,
    `${path}/status`,
    state
  );
  const maskIds = verificationReportTokenArray(
    data.maskIds,
    `${path}/maskIds`,
    state,
    1_024
  );
  const sourceTraceDigest =
    data.sourceTraceDigest === undefined
      ? undefined
      : verificationReportDigest(
          data.sourceTraceDigest,
          `${path}/sourceTraceDigest`,
          state
        );
  if (
    changedPixels !== undefined &&
    totalPixels !== undefined &&
    (changedPixels > totalPixels ||
      (status === 'passed' && changedPixels > (thresholdPixels ?? -1)) ||
      (status === 'failed' && changedPixels <= (thresholdPixels ?? -1)))
  ) {
    addVerificationReportIssue(
      state,
      path,
      'Visual status does not match its pixel facts.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  return observationId &&
    compatibilityKey &&
    baselineDigest &&
    currentDigest &&
    (data.diffDigest === undefined || diffDigest) &&
    changedPixels !== undefined &&
    totalPixels !== undefined &&
    thresholdPixels !== undefined &&
    status &&
    maskIds &&
    (data.sourceTraceDigest === undefined || sourceTraceDigest)
    ? Object.freeze({
        observationId,
        compatibilityKey,
        baselineDigest,
        currentDigest,
        ...(diffDigest ? { diffDigest } : {}),
        changedPixels,
        totalPixels,
        thresholdPixels,
        status,
        maskIds,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
      })
    : undefined;
};

const readAccessibilityFinding = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationAccessibilityFindingReport | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'ruleId',
      'impact',
      'targetId',
      'messageKey',
      'relatedNodeCount',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest'],
    path,
    state
  );
  if (!data) return undefined;
  const ruleId = verificationReportToken(data.ruleId, `${path}/ruleId`, state);
  const impact = verificationReportOneOf(
    data.impact,
    ['minor', 'moderate', 'serious', 'critical'] as const,
    `${path}/impact`,
    state
  );
  const targetId = verificationReportToken(
    data.targetId,
    `${path}/targetId`,
    state
  );
  const messageKey = verificationReportToken(
    data.messageKey,
    `${path}/messageKey`,
    state
  );
  const relatedNodeCount = verificationReportInteger(
    data.relatedNodeCount,
    `${path}/relatedNodeCount`,
    state,
    1_024
  );
  const diagnosticCodes = verificationReportTokenArray(
    data.diagnosticCodes,
    `${path}/diagnosticCodes`,
    state
  );
  const sourceTraceDigest =
    data.sourceTraceDigest === undefined
      ? undefined
      : verificationReportDigest(
          data.sourceTraceDigest,
          `${path}/sourceTraceDigest`,
          state
        );
  return ruleId &&
    impact &&
    targetId &&
    messageKey &&
    relatedNodeCount !== undefined &&
    diagnosticCodes &&
    (data.sourceTraceDigest === undefined || sourceTraceDigest)
    ? Object.freeze({
        ruleId,
        impact,
        targetId,
        messageKey,
        relatedNodeCount,
        diagnosticCodes,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
      })
    : undefined;
};

const readAccessibilityJourney = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationAccessibilityJourneyReport | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'journeyId',
      'stepId',
      'targetId',
      'assertionCode',
      'status',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest', 'announcement'],
    path,
    state
  );
  if (!data) return undefined;
  const journeyId = verificationReportToken(
    data.journeyId,
    `${path}/journeyId`,
    state
  );
  const stepId = verificationReportToken(data.stepId, `${path}/stepId`, state);
  const targetId = verificationReportToken(
    data.targetId,
    `${path}/targetId`,
    state
  );
  const assertionCode = verificationReportToken(
    data.assertionCode,
    `${path}/assertionCode`,
    state
  );
  const status = verificationReportOneOf(
    data.status,
    ['passed', 'failed', 'blocked'] as const,
    `${path}/status`,
    state
  );
  const diagnosticCodes = verificationReportTokenArray(
    data.diagnosticCodes,
    `${path}/diagnosticCodes`,
    state
  );
  const sourceTraceDigest =
    data.sourceTraceDigest === undefined
      ? undefined
      : verificationReportDigest(
          data.sourceTraceDigest,
          `${path}/sourceTraceDigest`,
          state
        );
  const announcement =
    data.announcement === undefined
      ? undefined
      : (() => {
          const announcementData = verificationReportRecord(
            data.announcement,
            [
              'triggerTargetId',
              'role',
              'live',
              'beforeTextDigest',
              'afterTextDigest',
            ],
            [],
            `${path}/announcement`,
            state
          );
          if (!announcementData) return undefined;
          const triggerTargetId = verificationReportToken(
            announcementData.triggerTargetId,
            `${path}/announcement/triggerTargetId`,
            state
          );
          const role = verificationReportOneOf(
            announcementData.role,
            ['status', 'alert', 'log'] as const,
            `${path}/announcement/role`,
            state
          );
          const live = verificationReportOneOf(
            announcementData.live,
            ['polite', 'assertive'] as const,
            `${path}/announcement/live`,
            state
          );
          const beforeTextDigest = verificationReportDigest(
            announcementData.beforeTextDigest,
            `${path}/announcement/beforeTextDigest`,
            state
          );
          const afterTextDigest = verificationReportDigest(
            announcementData.afterTextDigest,
            `${path}/announcement/afterTextDigest`,
            state
          );
          return triggerTargetId &&
            role &&
            live &&
            beforeTextDigest &&
            afterTextDigest
            ? Object.freeze({
                triggerTargetId,
                role,
                live,
                beforeTextDigest,
                afterTextDigest,
              })
            : undefined;
        })();
  return journeyId &&
    stepId &&
    targetId &&
    assertionCode &&
    status &&
    diagnosticCodes &&
    (data.sourceTraceDigest === undefined || sourceTraceDigest) &&
    (data.announcement === undefined || announcement)
    ? Object.freeze({
        journeyId,
        stepId,
        targetId,
        assertionCode,
        status,
        diagnosticCodes,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
        ...(announcement ? { announcement } : {}),
      })
    : undefined;
};

const readPerformanceMetric = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationPerformanceMetricReport | undefined => {
  const data = verificationReportRecord(
    value,
    ['metricId', 'unit', 'operator', 'value', 'threshold', 'sampleCount'],
    [],
    path,
    state
  );
  if (!data) return undefined;
  const metricId = verificationReportToken(
    data.metricId,
    `${path}/metricId`,
    state
  );
  const unit = verificationReportOneOf(
    data.unit,
    ['ms', 'bytes', 'count', 'ratio', 'fps'] as const,
    `${path}/unit`,
    state
  );
  const operator = verificationReportOneOf(
    data.operator,
    ['less-than-or-equal', 'greater-than-or-equal'] as const,
    `${path}/operator`,
    state
  );
  const metricValue = verificationReportNumber(
    data.value,
    `${path}/value`,
    state
  );
  const threshold = verificationReportNumber(
    data.threshold,
    `${path}/threshold`,
    state
  );
  const sampleCount = verificationReportInteger(
    data.sampleCount,
    `${path}/sampleCount`,
    state,
    1_000_000,
    1
  );
  return metricId &&
    unit &&
    operator &&
    metricValue !== undefined &&
    threshold !== undefined &&
    sampleCount
    ? Object.freeze({
        metricId,
        unit,
        operator,
        value: metricValue,
        threshold,
        sampleCount,
      })
    : undefined;
};

const readSecurityFinding = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationSecurityFindingReport | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'ruleId',
      'severity',
      'targetId',
      'messageKey',
      'count',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest'],
    path,
    state
  );
  if (!data) return undefined;
  const ruleId = verificationReportToken(data.ruleId, `${path}/ruleId`, state);
  const severity = verificationReportOneOf(
    data.severity,
    ['info', 'low', 'medium', 'high', 'critical'] as const,
    `${path}/severity`,
    state
  );
  const targetId = verificationReportToken(
    data.targetId,
    `${path}/targetId`,
    state
  );
  const messageKey = verificationReportToken(
    data.messageKey,
    `${path}/messageKey`,
    state
  );
  const count = verificationReportInteger(
    data.count,
    `${path}/count`,
    state,
    1_000_000_000,
    1
  );
  const diagnosticCodes = verificationReportTokenArray(
    data.diagnosticCodes,
    `${path}/diagnosticCodes`,
    state
  );
  const sourceTraceDigest =
    data.sourceTraceDigest === undefined
      ? undefined
      : verificationReportDigest(
          data.sourceTraceDigest,
          `${path}/sourceTraceDigest`,
          state
        );
  return ruleId &&
    severity &&
    targetId &&
    messageKey &&
    count &&
    diagnosticCodes &&
    (data.sourceTraceDigest === undefined || sourceTraceDigest)
    ? Object.freeze({
        ruleId,
        severity,
        targetId,
        messageKey,
        count,
        diagnosticCodes,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
      })
    : undefined;
};

export const readBrowserVerificationReportPayload = (
  value: unknown,
  kind: Extract<
    VerificationCheckKind,
    'visual' | 'accessibility' | 'performance' | 'security'
  >,
  path: string,
  state: VerificationReportDecodeState,
  securityObservationRuleIds: readonly string[] = VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS
): VerificationCheckReportPayload | undefined => {
  if (kind === 'visual') {
    const data = verificationReportRecord(
      value,
      ['kind', 'comparisons', 'behaviorAssertionReceipt'],
      [],
      path,
      state
    );
    const comparisons = data
      ? readVerificationReportArray(
          data.comparisons,
          `${path}/comparisons`,
          state,
          readVisualComparison,
          1
        )
      : undefined;
    const canonicalComparisons = comparisons
      ? sortUniqueVerificationReportValues(
          comparisons,
          ({ observationId }) => observationId,
          `${path}/comparisons`,
          state
        )
      : undefined;
    const behaviorAssertionReceipt = data
      ? readVerificationBehaviorAssertionReceipt(
          data.behaviorAssertionReceipt,
          `${path}/behaviorAssertionReceipt`,
          state
        )
      : undefined;
    return canonicalComparisons && behaviorAssertionReceipt
      ? Object.freeze({
          kind,
          comparisons: canonicalComparisons,
          behaviorAssertionReceipt,
        })
      : undefined;
  }
  if (kind === 'accessibility') {
    const data = verificationReportRecord(
      value,
      ['kind', 'findings', 'journeys', 'behaviorAssertionReceipt'],
      [],
      path,
      state
    );
    const findings = data
      ? readVerificationReportArray(
          data.findings,
          `${path}/findings`,
          state,
          readAccessibilityFinding
        )
      : undefined;
    const journeys = data
      ? readVerificationReportArray(
          data.journeys,
          `${path}/journeys`,
          state,
          readAccessibilityJourney,
          1
        )
      : undefined;
    const canonicalFindings = findings
      ? sortUniqueVerificationReportValues(
          findings,
          ({ ruleId, targetId }) => `${ruleId}\u0000${targetId}`,
          `${path}/findings`,
          state
        )
      : undefined;
    const canonicalJourneys = journeys
      ? sortUniqueVerificationReportValues(
          journeys,
          ({ stepId }) => stepId,
          `${path}/journeys`,
          state
        )
      : undefined;
    const behaviorAssertionReceipt = data
      ? readVerificationBehaviorAssertionReceipt(
          data.behaviorAssertionReceipt,
          `${path}/behaviorAssertionReceipt`,
          state
        )
      : undefined;
    return canonicalFindings && canonicalJourneys && behaviorAssertionReceipt
      ? Object.freeze({
          kind,
          findings: canonicalFindings,
          journeys: canonicalJourneys,
          behaviorAssertionReceipt,
        })
      : undefined;
  }
  if (kind === 'performance') {
    const data = verificationReportRecord(
      value,
      [
        'kind',
        'environmentDigest',
        'samplingDigest',
        'comparable',
        'metrics',
        'behaviorAssertionReceipt',
      ],
      [],
      path,
      state
    );
    const environmentDigest = data
      ? verificationReportDigest(
          data.environmentDigest,
          `${path}/environmentDigest`,
          state
        )
      : undefined;
    const samplingDigest = data
      ? verificationReportDigest(
          data.samplingDigest,
          `${path}/samplingDigest`,
          state
        )
      : undefined;
    const comparable = data
      ? verificationReportBoolean(data.comparable, `${path}/comparable`, state)
      : undefined;
    const metrics = data
      ? readVerificationReportArray(
          data.metrics,
          `${path}/metrics`,
          state,
          readPerformanceMetric,
          1
        )
      : undefined;
    const canonicalMetrics = metrics
      ? sortUniqueVerificationReportValues(
          metrics,
          ({ metricId }) => metricId,
          `${path}/metrics`,
          state
        )
      : undefined;
    const behaviorAssertionReceipt = data
      ? readVerificationBehaviorAssertionReceipt(
          data.behaviorAssertionReceipt,
          `${path}/behaviorAssertionReceipt`,
          state
        )
      : undefined;
    return environmentDigest &&
      samplingDigest &&
      comparable !== undefined &&
      canonicalMetrics &&
      behaviorAssertionReceipt
      ? Object.freeze({
          kind,
          environmentDigest,
          samplingDigest,
          comparable,
          metrics: canonicalMetrics,
          behaviorAssertionReceipt,
        })
      : undefined;
  }
  const data = verificationReportRecord(
    value,
    ['kind', 'observedRuleIds', 'findings', 'behaviorAssertionReceipt'],
    [],
    path,
    state
  );
  const observedRuleIds = data
    ? verificationReportTokenArray(
        data.observedRuleIds,
        `${path}/observedRuleIds`,
        state,
        VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.length
      )
    : undefined;
  const findings = data
    ? readVerificationReportArray(
        data.findings,
        `${path}/findings`,
        state,
        readSecurityFinding
      )
    : undefined;
  const canonicalFindings = findings
    ? sortUniqueVerificationReportValues(
        findings,
        ({ ruleId, targetId }) => `${ruleId}\u0000${targetId}`,
        `${path}/findings`,
        state
      )
    : undefined;
  const behaviorAssertionReceipt = data
    ? readVerificationBehaviorAssertionReceipt(
        data.behaviorAssertionReceipt,
        `${path}/behaviorAssertionReceipt`,
        state
      )
    : undefined;
  if (
    behaviorAssertionReceipt &&
    behaviorAssertionReceipt.fixtureSetDigests.length !== 0
  ) {
    addVerificationReportIssue(
      state,
      `${path}/behaviorAssertionReceipt/fixtureSetDigests`,
      'Production security Behavior receipts cannot claim test Fixture Sets.',
      'security-denial',
      'VER-4001'
    );
    return undefined;
  }
  if (
    observedRuleIds &&
    (observedRuleIds.length !== securityObservationRuleIds.length ||
      observedRuleIds.some(
        (ruleId, index) => ruleId !== securityObservationRuleIds[index]
      ))
  ) {
    addVerificationReportIssue(
      state,
      `${path}/observedRuleIds`,
      'Security reports must observe the exact rule registry for this lifecycle stage.',
      'security-denial',
      'VER-4001'
    );
    return undefined;
  }
  if (
    observedRuleIds &&
    canonicalFindings?.some(({ ruleId }) => !observedRuleIds.includes(ruleId))
  ) {
    addVerificationReportIssue(
      state,
      `${path}/findings`,
      'Security findings must reference an observed Core hard rule.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  return canonicalFindings && observedRuleIds && behaviorAssertionReceipt
    ? Object.freeze({
        kind: 'security',
        observedRuleIds,
        findings: canonicalFindings,
        behaviorAssertionReceipt,
      })
    : undefined;
};
