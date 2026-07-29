import type {
  VerificationCheckReportPayload,
  VerificationNormalizedFinding,
  VerificationScenarioStepReport,
  VerificationTestSuiteReport,
} from './verificationCheckReport.types';
import type { VerificationCheckKind } from './verification.types';
import { readVerificationBehaviorAssertionReceipt } from './verificationCheckReportCodec.behavior';
import {
  addVerificationReportIssue,
  readVerificationReportArray,
  sortUniqueVerificationReportValues,
  verificationReportDigest,
  verificationReportOneOf,
  verificationReportRecord,
  type VerificationReportDecodeState,
  verificationReportInteger,
  verificationReportToken,
  verificationReportTokenArray,
  verificationReportBoolean,
} from './verificationCheckReportCodec.common';

const readFinding = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationNormalizedFinding | undefined => {
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
    ['info', 'warning', 'error', 'fatal'] as const,
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

const readSuite = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationTestSuiteReport | undefined => {
  const data = verificationReportRecord(
    value,
    ['suiteId', 'status', 'cases'],
    [],
    path,
    state
  );
  if (!data) return undefined;
  const suiteId = verificationReportToken(
    data.suiteId,
    `${path}/suiteId`,
    state
  );
  const status = verificationReportOneOf(
    data.status,
    ['passed', 'failed', 'skipped', 'todo'] as const,
    `${path}/status`,
    state
  );
  const cases = readVerificationReportArray(
    data.cases,
    `${path}/cases`,
    state,
    (entry, entryPath, nextState) => {
      const item = verificationReportRecord(
        entry,
        ['caseId', 'status', 'diagnosticCodes'],
        ['sourceTraceDigest'],
        entryPath,
        nextState
      );
      if (!item) return undefined;
      const caseId = verificationReportToken(
        item.caseId,
        `${entryPath}/caseId`,
        nextState
      );
      const caseStatus = verificationReportOneOf(
        item.status,
        ['passed', 'failed', 'skipped', 'todo'] as const,
        `${entryPath}/status`,
        nextState
      );
      const diagnosticCodes = verificationReportTokenArray(
        item.diagnosticCodes,
        `${entryPath}/diagnosticCodes`,
        nextState
      );
      const sourceTraceDigest =
        item.sourceTraceDigest === undefined
          ? undefined
          : verificationReportDigest(
              item.sourceTraceDigest,
              `${entryPath}/sourceTraceDigest`,
              nextState
            );
      return caseId &&
        caseStatus &&
        diagnosticCodes &&
        (item.sourceTraceDigest === undefined || sourceTraceDigest)
        ? Object.freeze({
            caseId,
            status: caseStatus,
            diagnosticCodes,
            ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
          })
        : undefined;
    }
  );
  const canonicalCases = cases
    ? sortUniqueVerificationReportValues(
        cases,
        ({ caseId }) => caseId,
        `${path}/cases`,
        state
      )
    : undefined;
  return suiteId && status && canonicalCases
    ? Object.freeze({ suiteId, status, cases: canonicalCases })
    : undefined;
};

const readStep = (
  value: unknown,
  path: string,
  state: VerificationReportDecodeState
): VerificationScenarioStepReport | undefined => {
  const data = verificationReportRecord(
    value,
    [
      'stepId',
      'targetId',
      'assertionCode',
      'status',
      'blackBox',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest'],
    path,
    state
  );
  if (!data) return undefined;
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
  const blackBox = verificationReportBoolean(
    data.blackBox,
    `${path}/blackBox`,
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
  return stepId &&
    targetId &&
    assertionCode &&
    status &&
    blackBox !== undefined &&
    diagnosticCodes &&
    (data.sourceTraceDigest === undefined || sourceTraceDigest)
    ? Object.freeze({
        stepId,
        targetId,
        assertionCode,
        status,
        blackBox,
        diagnosticCodes,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
      })
    : undefined;
};

export const readFunctionalVerificationReportPayload = (
  value: unknown,
  kind: Extract<
    VerificationCheckKind,
    'diagnostics' | 'build' | 'unit' | 'integration' | 'e2e'
  >,
  path: string,
  state: VerificationReportDecodeState
): VerificationCheckReportPayload | undefined => {
  if (kind === 'diagnostics' || kind === 'build') {
    const data = verificationReportRecord(
      value,
      kind === 'build'
        ? ['kind', 'outputManifestDigest', 'findings']
        : ['kind', 'findings'],
      [],
      path,
      state
    );
    const findings = data
      ? readVerificationReportArray(
          data.findings,
          `${path}/findings`,
          state,
          readFinding
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
    if (!data || !canonicalFindings) return undefined;
    if (kind === 'diagnostics') {
      return Object.freeze({ kind, findings: canonicalFindings });
    }
    const outputManifestDigest = verificationReportDigest(
      data.outputManifestDigest,
      `${path}/outputManifestDigest`,
      state
    );
    return outputManifestDigest
      ? Object.freeze({
          kind,
          outputManifestDigest,
          findings: canonicalFindings,
        })
      : undefined;
  }
  if (kind === 'unit' || kind === 'integration') {
    const data = verificationReportRecord(
      value,
      ['kind', 'suites'],
      [],
      path,
      state
    );
    const suites = data
      ? readVerificationReportArray(
          data.suites,
          `${path}/suites`,
          state,
          readSuite
        )
      : undefined;
    const canonicalSuites = suites
      ? sortUniqueVerificationReportValues(
          suites,
          ({ suiteId }) => suiteId,
          `${path}/suites`,
          state
        )
      : undefined;
    return data && canonicalSuites
      ? Object.freeze({ kind, suites: canonicalSuites })
      : undefined;
  }
  const data = verificationReportRecord(
    value,
    ['kind', 'scenarioId', 'steps', 'behaviorAssertionReceipt'],
    [],
    path,
    state
  );
  const scenarioId = data
    ? verificationReportToken(data.scenarioId, `${path}/scenarioId`, state)
    : undefined;
  const steps = data
    ? readVerificationReportArray(
        data.steps,
        `${path}/steps`,
        state,
        readStep,
        1
      )
    : undefined;
  const canonicalSteps = steps
    ? sortUniqueVerificationReportValues(
        steps,
        ({ stepId }) => stepId,
        `${path}/steps`,
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
    scenarioId &&
    behaviorAssertionReceipt &&
    scenarioId !== behaviorAssertionReceipt.scenarioId
  ) {
    addVerificationReportIssue(
      state,
      `${path}/behaviorAssertionReceipt/scenarioId`,
      'E2E payload Scenario and Behavior assertion receipt drifted.',
      'contract-mismatch',
      'VER-4001'
    );
    return undefined;
  }
  return scenarioId && canonicalSteps && behaviorAssertionReceipt
    ? Object.freeze({
        kind: 'e2e',
        scenarioId,
        steps: canonicalSteps,
        behaviorAssertionReceipt,
      })
    : undefined;
};
