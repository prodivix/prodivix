import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { digestVerificationValue } from './verificationCanonical';
import { decodeVerificationCheckReportCandidate } from './verificationCheckReportCodec';
import {
  VERIFICATION_NORMALIZED_CHECK_REPORT_SCHEMA,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from './verificationCheckReportCodec.common';
import type {
  VerificationCheckReportCandidate,
  VerificationCheckReportIssue,
  VerificationCheckReportPayload,
  VerificationFailureClass,
  VerificationNormalizedCheckReport,
} from './verificationCheckReport.types';
import type { VerificationJsonValue } from './verification.types';

const HARD_SECURITY_RULES = new Set<string>(
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS
);

const payloadDiagnosticCodes = (
  payload: VerificationCheckReportPayload
): readonly string[] => {
  switch (payload.kind) {
    case 'diagnostics':
    case 'build':
      return payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes);
    case 'unit':
    case 'integration':
      return payload.suites.flatMap(({ cases }) =>
        cases.flatMap(({ diagnosticCodes }) => diagnosticCodes)
      );
    case 'e2e':
      return payload.steps.flatMap(({ diagnosticCodes }) => diagnosticCodes);
    case 'visual':
    case 'performance':
      return [];
    case 'accessibility':
      return [
        ...payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes),
        ...payload.journeys.flatMap(({ diagnosticCodes }) => diagnosticCodes),
      ];
    case 'security':
      return payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes);
  }
};

type PayloadVerdict = Readonly<{
  verdict: 'passed' | 'failed' | 'blocked';
  failureClass?: VerificationFailureClass;
}>;

const payloadVerdict = (
  payload: VerificationCheckReportPayload
): PayloadVerdict => {
  switch (payload.kind) {
    case 'diagnostics':
    case 'build':
      return payload.findings.some(({ severity }) =>
        ['error', 'fatal'].includes(severity)
      )
        ? {
            verdict: 'failed',
            failureClass: 'product-diagnostic-build',
          }
        : { verdict: 'passed' };
    case 'unit':
    case 'integration': {
      const cases = payload.suites.flatMap(({ cases: entries }) => entries);
      if (
        cases.length === 0 ||
        cases.every(({ status }) => status === 'skipped' || status === 'todo')
      ) {
        return { verdict: 'blocked', failureClass: 'contract-mismatch' };
      }
      return cases.some(({ status }) => status === 'failed')
        ? {
            verdict: 'failed',
            failureClass: 'product-assertion-finding',
          }
        : { verdict: 'passed' };
    }
    case 'e2e':
      if (payload.steps.some(({ status }) => status === 'blocked')) {
        return { verdict: 'blocked', failureClass: 'fixture-control' };
      }
      return payload.steps.some(({ status }) => status === 'failed')
        ? {
            verdict: 'failed',
            failureClass: 'product-assertion-finding',
          }
        : { verdict: 'passed' };
    case 'visual':
      if (payload.comparisons.some(({ status }) => status === 'incompatible')) {
        return { verdict: 'blocked', failureClass: 'environment' };
      }
      return payload.comparisons.some(({ status }) => status === 'failed')
        ? {
            verdict: 'failed',
            failureClass: 'product-assertion-finding',
          }
        : { verdict: 'passed' };
    case 'accessibility':
      if (payload.journeys.some(({ status }) => status === 'blocked')) {
        return { verdict: 'blocked', failureClass: 'fixture-control' };
      }
      return payload.findings.length > 0 ||
        payload.journeys.some(({ status }) => status === 'failed')
        ? {
            verdict: 'failed',
            failureClass: 'product-assertion-finding',
          }
        : { verdict: 'passed' };
    case 'performance':
      if (!payload.comparable) {
        return { verdict: 'blocked', failureClass: 'environment' };
      }
      return payload.metrics.some(({ operator, value, threshold }) =>
        operator === 'less-than-or-equal'
          ? value > threshold
          : value < threshold
      )
        ? {
            verdict: 'failed',
            failureClass: 'product-assertion-finding',
          }
        : { verdict: 'passed' };
    case 'security':
      return payload.findings.length === 0
        ? { verdict: 'passed' }
        : {
            verdict: 'failed',
            failureClass: payload.findings.some(({ ruleId }) =>
              HARD_SECURITY_RULES.has(ruleId)
            )
              ? 'security-denial'
              : 'product-assertion-finding',
          };
  }
};

export type NormalizeVerificationCheckReportCandidateResult =
  | Readonly<{
      status: 'ready';
      report: VerificationNormalizedCheckReport;
      candidate: VerificationCheckReportCandidate;
    }>
  | Readonly<{
      status: 'invalid';
      issues: readonly VerificationCheckReportIssue[];
    }>;

export const normalizeVerificationCheckReportCandidate = (
  value: unknown
): NormalizeVerificationCheckReportCandidateResult => {
  const decoded = decodeVerificationCheckReportCandidate(value);
  if (!decoded.ok) {
    return Object.freeze({ status: 'invalid', issues: decoded.issues });
  }
  const candidate = decoded.value;
  let verdict: PayloadVerdict;
  if (candidate.terminal.status === 'cancelled') {
    verdict = { verdict: 'blocked', failureClass: 'cancelled' };
  } else if (candidate.terminal.status === 'timed-out') {
    verdict = { verdict: 'blocked', failureClass: 'timeout' };
  } else if (candidate.terminal.status === 'failed') {
    verdict = {
      verdict: 'blocked',
      failureClass: candidate.terminal.failureClass,
    };
  } else {
    verdict = payloadVerdict(candidate.payload);
    if (candidate.terminal.exitCode !== 0 && verdict.verdict === 'passed') {
      verdict = {
        verdict: 'blocked',
        failureClass: 'contract-mismatch',
      };
    }
  }
  const outcome =
    candidate.terminal.status === 'cancelled'
      ? 'cancelled'
      : verdict.verdict === 'passed'
        ? 'passed'
        : verdict.verdict === 'failed'
          ? 'failed'
          : 'infrastructure-error';
  const reportIdentity = Object.freeze({
    cellId: candidate.cellId,
    attemptId: candidate.attemptId,
    checkKind: candidate.checkKind,
    inputDigest: candidate.inputDigest,
    adapter: candidate.adapter,
    tool: candidate.tool,
    terminal: candidate.terminal,
    payload: candidate.payload,
    artifacts: candidate.artifacts,
    diagnosticCodes: candidate.diagnosticCodes,
  });
  const candidateId = `candidate:${digestVerificationValue(reportIdentity)}`;
  const summary = Object.freeze({
    schema: VERIFICATION_NORMALIZED_CHECK_REPORT_SCHEMA,
    checkKind: candidate.checkKind,
    verdict: verdict.verdict,
    ...(verdict.failureClass ? { failureClass: verdict.failureClass } : {}),
    payload: candidate.payload,
  }) as unknown as VerificationJsonValue;
  const diagnosticCodes = Object.freeze(
    [
      ...new Set([
        ...candidate.diagnosticCodes,
        ...payloadDiagnosticCodes(candidate.payload),
      ]),
    ].sort(compareUnicodeCodePoints)
  );
  return Object.freeze({
    status: 'ready',
    candidate,
    report: Object.freeze({
      candidateId,
      outcome,
      verdict: verdict.verdict,
      ...(verdict.failureClass ? { failureClass: verdict.failureClass } : {}),
      summary,
      artifacts: candidate.artifacts,
      diagnosticCodes,
    }),
  });
};
