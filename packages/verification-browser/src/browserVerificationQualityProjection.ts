import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  decodeAxeAccessibilityPayload,
  decodeKeyboardFocusPayload,
  evaluateAccessibility,
  evaluateKeyboardFocusJourney,
  normalizeAutomatedAccessibility,
} from './accessibility';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
} from './browserAdapter.types';
import type { BrowserBehaviorAssertionObservation } from './browserBehaviorAssertionReceipt';
import { createStructuredBrowserVerificationArtifact } from './browserVerificationArtifacts';
import type { BrowserToolSession } from './browserVerificationPort';
import {
  blockedBrowserTerminal,
  browserArtifactId,
  browserDiagnosticCodes,
  completedBrowserTerminal,
  createBrowserReplayArtifact,
  sourceTraceDigestFor,
  type BrowserVerificationProjection,
} from './browserVerificationProjectionSupport';
import { decodePerformancePayload, evaluatePerformance } from './performance';
import { evaluateBrowserSecurity } from './security';
import { composeBrowserSecurityPayload } from './securityObservationSet';

export const projectBrowserAccessibility = async (
  cell: VerificationPlanCell,
  input: BrowserVerificationCellInput,
  policy: Extract<
    BrowserVerificationCellPolicy,
    Readonly<{ kind: 'accessibility' }>
  >,
  session: BrowserToolSession,
  behavior: BrowserBehaviorAssertionObservation
): Promise<BrowserVerificationProjection> => {
  if (input.profile.kind !== 'accessibility') {
    throw new TypeError(
      'Accessibility projection received a non-accessibility profile.'
    );
  }
  const automatedReport = decodeAxeAccessibilityPayload(
    await session.scanAccessibility(
      input.profile.scanTargetId,
      policy.program.targetManifest
    )
  );
  if (automatedReport.targetId !== input.profile.scanTargetId) {
    throw new TypeError('Accessibility scan target identity drifted.');
  }
  const automated = normalizeAutomatedAccessibility(automatedReport);
  const keyboard = evaluateKeyboardFocusJourney(
    input.profile.keyboardFocusJourney,
    decodeKeyboardFocusPayload(
      await session.executeKeyboardFocusJourney(
        input.profile.keyboardFocusJourney,
        policy.program.targetManifest,
        policy.program.budgets.settleMs
      )
    )
  );
  const evaluation = evaluateAccessibility(automated, keyboard);
  const codes = browserDiagnosticCodes([
    ...automated.findings.map(({ diagnosticCodes: values }) => values),
    ...keyboard.steps.map(({ diagnosticCodes: values }) => values),
  ]);
  const sourceTraceDigest = sourceTraceDigestFor(input);
  const accessibilityArtifact = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'accessibility-report'),
    kind: 'accessibility-report',
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'accessibility-report',
      summary: {
        passed: evaluation.verdict === 'passed' ? 1 : 0,
        failed: automated.findings.filter(
          ({ disposition }) => disposition === 'violation'
        ).length,
        incomplete: automated.findings.filter(
          ({ disposition }) => disposition === 'incomplete'
        ).length,
        violations: automated.findings.map((finding) => ({
          ruleId: finding.ruleId,
          impact: finding.impact,
          nodeCount: finding.relatedNodeCount,
          diagnosticCodes: finding.diagnosticCodes,
          sourceTraceDigest,
        })),
      },
    },
  });
  return Object.freeze({
    terminal:
      evaluation.verdict === 'blocked'
        ? blockedBrowserTerminal('environment', 'VER-A11Y-INCOMPLETE')
        : completedBrowserTerminal(evaluation.verdict === 'failed' ? 1 : 0),
    payload: Object.freeze({
      kind: 'accessibility',
      behaviorAssertionReceipt: behavior.receipt,
      findings: automated.findings.map((finding) =>
        Object.freeze({
          ruleId: finding.ruleId,
          impact: finding.impact,
          targetId: finding.targetId,
          messageKey: finding.messageKey,
          relatedNodeCount: finding.relatedNodeCount,
          diagnosticCodes: finding.diagnosticCodes,
          sourceTraceDigest,
        })
      ),
      journeys: keyboard.steps.map((step) =>
        Object.freeze({
          journeyId: step.journeyId,
          stepId: step.stepId,
          targetId: step.targetId,
          assertionCode: step.assertionCode,
          status: step.status,
          diagnosticCodes: step.diagnosticCodes,
          sourceTraceDigest,
          ...(step.announcement === undefined
            ? {}
            : { announcement: step.announcement }),
        })
      ),
    }),
    artifacts: Object.freeze([
      accessibilityArtifact,
      createBrowserReplayArtifact({
        cell,
        sourceTraceDigest,
        eventCount: keyboard.steps.length,
        assertionCount: keyboard.steps.length + automated.findings.length,
        durationMs: 0,
        outcome: evaluation.verdict,
        diagnosticCodes: codes,
      }),
    ]),
    diagnosticCodes: codes,
  });
};

export const projectBrowserPerformance = async (
  cell: VerificationPlanCell,
  input: BrowserVerificationCellInput,
  policy: Extract<
    BrowserVerificationCellPolicy,
    Readonly<{ kind: 'performance' }>
  >,
  session: BrowserToolSession,
  behavior: BrowserBehaviorAssertionObservation
): Promise<BrowserVerificationProjection> => {
  if (input.profile.kind !== 'performance') {
    throw new TypeError(
      'Performance projection received a non-performance profile.'
    );
  }
  const evaluation = evaluatePerformance(
    decodePerformancePayload(
      await session.collectPerformance(
        input.profile.policy,
        input.profile.profileDigest,
        policy.program
      )
    ),
    input.profile.policy
  );
  const metrics = evaluation.metrics.map((metric) =>
    Object.freeze({
      metricId: metric.metricId,
      unit: metric.unit,
      operator: metric.operator,
      value: metric.value,
      threshold: metric.threshold,
      sampleCount: metric.sampleCount,
    })
  );
  const metricValue = (id: string): number | null =>
    evaluation.metrics.find(({ metricId }) => metricId === id)?.value ?? null;
  const sourceTraceDigest = sourceTraceDigestFor(input);
  const performanceArtifact = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'performance-profile'),
    kind: 'performance-profile',
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'performance-profile',
      summary: {
        durationMs: metricValue('scenario-duration') ?? 0,
        sampleCount:
          evaluation.metrics[0]?.sampleCount ??
          input.profile.policy.sampling.sampleCount,
        largestContentfulPaintMs: metricValue('navigation-lcp'),
        cumulativeLayoutShift: metricValue('layout-shift'),
        interactionToNextPaintMs: metricValue('interaction-inp'),
        totalBlockingTimeMs: metricValue('total-blocking-time'),
      },
    },
  });
  return Object.freeze({
    terminal: completedBrowserTerminal(evaluation.verdict === 'failed' ? 1 : 0),
    payload: Object.freeze({
      kind: 'performance',
      behaviorAssertionReceipt: behavior.receipt,
      environmentDigest: evaluation.environmentDigest,
      samplingDigest: evaluation.samplingDigest,
      comparable: evaluation.comparable,
      metrics: Object.freeze(metrics),
    }),
    artifacts: Object.freeze([
      performanceArtifact,
      createBrowserReplayArtifact({
        cell,
        sourceTraceDigest,
        eventCount: metrics.length,
        assertionCount: metrics.length,
        durationMs: metricValue('scenario-duration') ?? 0,
        outcome:
          evaluation.verdict === 'view-only' || evaluation.verdict === 'blocked'
            ? 'blocked'
            : evaluation.verdict,
        diagnosticCodes:
          evaluation.verdict === 'blocked' ? [evaluation.reasonCode] : [],
      }),
    ]),
    diagnosticCodes: Object.freeze(
      evaluation.verdict === 'blocked' ? [evaluation.reasonCode] : []
    ),
  });
};

export const projectBrowserSecurity = async (
  cell: VerificationPlanCell,
  input: BrowserVerificationCellInput,
  policy: Extract<
    BrowserVerificationCellPolicy,
    Readonly<{ kind: 'security' }>
  >,
  session: BrowserToolSession,
  behavior: BrowserBehaviorAssertionObservation
): Promise<BrowserVerificationProjection> => {
  if (input.profile.kind !== 'security') {
    throw new TypeError('Security projection received a non-security profile.');
  }
  if (input.fixtureSetDigests.length !== 0) {
    throw new TypeError(
      'Production security verification cannot carry test Fixture Sets.'
    );
  }
  const evaluation = evaluateBrowserSecurity(
    composeBrowserSecurityPayload(
      await session.collectSecurity(input.profile.policy),
      policy.observationSet,
      input.profile.policy
    )
  );
  const observedRuleIds = evaluation.checks
    .map(({ ruleId }) => ruleId)
    .sort(compareVerificationText);
  const expectedRuleIds = [
    ...VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  ].sort(compareVerificationText);
  if (!sameCanonicalJson(observedRuleIds, expectedRuleIds)) {
    throw new TypeError('Security collector did not observe all hard rules.');
  }
  const codes = browserDiagnosticCodes(
    evaluation.findings.map(({ diagnosticCodes: values }) => values)
  );
  const sourceTraceDigest = sourceTraceDigestFor(input);
  const securityArtifact = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'security-report'),
    kind: 'security-report',
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'security-report',
      summary: {
        passed: expectedRuleIds.length - evaluation.findings.length,
        failed: evaluation.findings.length,
        findings: evaluation.findings.map((finding) => ({
          ruleId: finding.ruleId,
          severity: finding.severity,
          count: finding.count,
          diagnosticCodes: finding.diagnosticCodes,
          ...(finding.sourceTraceDigest === undefined
            ? {}
            : { sourceTraceDigest: finding.sourceTraceDigest }),
        })),
      },
    },
  });
  const networkArtifact = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'network-summary'),
    kind: 'network-summary',
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'network-summary',
      operations: await session.collectNetworkSummary(),
    },
  });
  return Object.freeze({
    terminal:
      evaluation.verdict === 'blocked'
        ? blockedBrowserTerminal(
            'security-denial',
            'VER-SEC-OBSERVATION-BLOCKED'
          )
        : completedBrowserTerminal(evaluation.verdict === 'failed' ? 1 : 0),
    payload: Object.freeze({
      kind: 'security',
      behaviorAssertionReceipt: behavior.receipt,
      observedRuleIds: Object.freeze(observedRuleIds),
      findings: Object.freeze(
        evaluation.findings.map((finding) =>
          Object.freeze({
            ruleId: finding.ruleId,
            severity: finding.severity,
            targetId: finding.targetId,
            messageKey: finding.messageKey,
            count: finding.count,
            diagnosticCodes: finding.diagnosticCodes,
            sourceTraceDigest,
          })
        )
      ),
    }),
    artifacts: Object.freeze([
      securityArtifact,
      networkArtifact,
      createBrowserReplayArtifact({
        cell,
        sourceTraceDigest,
        eventCount: evaluation.checks.length,
        assertionCount: evaluation.checks.length,
        durationMs: 0,
        outcome: evaluation.verdict,
        diagnosticCodes: codes,
      }),
    ]),
    diagnosticCodes: codes,
  });
};
