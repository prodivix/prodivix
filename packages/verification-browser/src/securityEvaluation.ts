import { compareVerificationText } from '@prodivix/verification';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  strictArray,
  strictEnum,
  strictIdentifier,
  strictObject,
} from './privateBoundary';
import {
  BROWSER_SECURITY_HARD_RULES,
  BROWSER_SECURITY_NON_EXEMPTIBLE_RULE_IDS,
  BROWSER_SECURITY_POST_CLEANUP_RULE_IDS,
  BROWSER_SECURITY_RULE_IDS,
  type BrowserSecurityEvaluation,
  type BrowserSecurityExemption,
  type BrowserSecurityFinding,
  type DecodedBrowserSecurityPayload,
} from './securityContract';

const ruleById = new Map(
  BROWSER_SECURITY_HARD_RULES.map((rule) => [rule.ruleId, rule] as const)
);

const assertNoHardRuleExemption = (
  exemptions: readonly BrowserSecurityExemption[]
): void => {
  const values = strictArray(
    exemptions,
    '$.exemptions',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumSecurityChecks
  ).map((value, index) => {
    const path = `$.exemptions[${index}]`;
    const exemption = strictObject(value, path, [
      'exemptionId',
      'ruleId',
      'reasonCode',
    ]);
    return Object.freeze({
      exemptionId: strictIdentifier(
        exemption.exemptionId,
        `${path}.exemptionId`
      ),
      ruleId: strictEnum(
        exemption.ruleId,
        `${path}.ruleId`,
        BROWSER_SECURITY_RULE_IDS
      ),
      reasonCode: strictIdentifier(exemption.reasonCode, `${path}.reasonCode`),
    });
  });
  assertUniqueIdentities(
    values,
    ({ exemptionId }) => exemptionId,
    '$.exemptions'
  );
  if (values.length > 0) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.exemptions',
      `Security hard rule "${values[0]!.ruleId}" is non-exemptible.`
    );
  }
};

export const evaluateBrowserSecurity = (
  report: DecodedBrowserSecurityPayload,
  options: Readonly<{
    exemptions?: readonly BrowserSecurityExemption[];
  }> = {}
): BrowserSecurityEvaluation => {
  assertNoHardRuleExemption(options.exemptions ?? []);
  const findings: BrowserSecurityFinding[] = [];
  for (const check of report.checks) {
    const rule = ruleById.get(check.ruleId)!;
    if (check.state === 'blocked') {
      findings.push(
        Object.freeze({
          ruleId: check.ruleId,
          severity: rule.severity,
          targetId: check.targetId,
          messageKey: rule.blockedMessageKey,
          count: 1,
          diagnosticCodes: Object.freeze(
            [...check.diagnosticCodes, check.reasonCode, rule.diagnosticCode]
              .filter((value, index, values) => values.indexOf(value) === index)
              .sort(compareVerificationText)
          ),
          ...(check.sourceTraceDigest === undefined
            ? {}
            : { sourceTraceDigest: check.sourceTraceDigest }),
          disposition: 'blocked' as const,
          nonExemptible: true as const,
        })
      );
      continue;
    }
    const failed =
      check.violationCount > 0 || check.expectedDigest !== check.observedDigest;
    if (!failed) continue;
    findings.push(
      Object.freeze({
        ruleId: check.ruleId,
        severity: rule.severity,
        targetId: check.targetId,
        messageKey: rule.failureMessageKey,
        count: Math.max(1, check.violationCount),
        diagnosticCodes: Object.freeze(
          [...check.diagnosticCodes, rule.diagnosticCode]
            .filter((value, index, values) => values.indexOf(value) === index)
            .sort(compareVerificationText)
        ),
        ...(check.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: check.sourceTraceDigest }),
        disposition: 'failed' as const,
        nonExemptible: true as const,
      })
    );
  }
  findings.sort((left, right) =>
    compareVerificationText(left.ruleId, right.ruleId)
  );
  return Object.freeze({
    verdict: findings.some(({ disposition }) => disposition === 'failed')
      ? 'failed'
      : findings.some(({ disposition }) => disposition === 'blocked')
        ? 'blocked'
        : 'passed',
    findings: Object.freeze(findings),
    checks: report.checks,
    nonExemptibleRuleIds: BROWSER_SECURITY_NON_EXEMPTIBLE_RULE_IDS,
    pendingFinalizationRuleIds: BROWSER_SECURITY_POST_CLEANUP_RULE_IDS,
    tool: report.tool,
  });
};
