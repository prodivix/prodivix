import { compareVerificationText } from '@prodivix/verification';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictArray,
  strictBoolean,
  strictDiagnosticCodes,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  strictString,
  throwPartial,
} from './privateBoundary';
import {
  BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS,
  BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS,
  BROWSER_SECURITY_RULE_IDS,
  type BrowserSecurityHardRuleId,
  type DecodedBrowserOwnedSecurityPayload,
  type DecodedBrowserSecurityPayload,
  type SecurityCheckObservation,
} from './securityContract';

export const decodeSecurityCheckObservation = (
  value: unknown,
  path: string
): SecurityCheckObservation => {
  const discriminant = strictObject(
    value,
    path,
    ['ruleId', 'state'],
    [
      'targetId',
      'expectedDigest',
      'observedDigest',
      'violationCount',
      'reasonCode',
      'diagnosticCodes',
      'sourceTraceDigest',
    ]
  );
  const ruleId = strictEnum(
    discriminant.ruleId,
    `${path}.ruleId`,
    BROWSER_SECURITY_RULE_IDS
  );
  const state = strictEnum(discriminant.state, `${path}.state`, [
    'complete',
    'blocked',
  ] as const);
  if (state === 'complete') {
    const check = strictObject(
      value,
      path,
      [
        'ruleId',
        'state',
        'targetId',
        'expectedDigest',
        'observedDigest',
        'violationCount',
        'diagnosticCodes',
      ],
      ['sourceTraceDigest']
    );
    const sourceTraceDigest =
      check.sourceTraceDigest === undefined
        ? undefined
        : strictSha256Digest(
            check.sourceTraceDigest,
            `${path}.sourceTraceDigest`
          );
    return Object.freeze({
      ruleId,
      state,
      targetId: strictIdentifier(check.targetId, `${path}.targetId`),
      expectedDigest: strictSha256Digest(
        check.expectedDigest,
        `${path}.expectedDigest`
      ),
      observedDigest: strictSha256Digest(
        check.observedDigest,
        `${path}.observedDigest`
      ),
      violationCount: strictSafeInteger(
        check.violationCount,
        `${path}.violationCount`,
        { minimum: 0, maximum: 1_000_000 }
      ),
      diagnosticCodes: strictDiagnosticCodes(
        check.diagnosticCodes,
        `${path}.diagnosticCodes`
      ),
      ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
    });
  }
  const check = strictObject(
    value,
    path,
    [
      'ruleId',
      'state',
      'targetId',
      'expectedDigest',
      'reasonCode',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest']
  );
  const sourceTraceDigest =
    check.sourceTraceDigest === undefined
      ? undefined
      : strictSha256Digest(
          check.sourceTraceDigest,
          `${path}.sourceTraceDigest`
        );
  return Object.freeze({
    ruleId,
    state,
    targetId: strictIdentifier(check.targetId, `${path}.targetId`),
    expectedDigest: strictSha256Digest(
      check.expectedDigest,
      `${path}.expectedDigest`
    ),
    reasonCode: strictIdentifier(check.reasonCode, `${path}.reasonCode`),
    diagnosticCodes: strictDiagnosticCodes(
      check.diagnosticCodes,
      `${path}.diagnosticCodes`
    ),
    ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
  });
};

/**
 * Decodes the complete pre-finalization aggregate: four browser observations
 * and three authority-resolved G2 observations. Core owns the remaining two
 * post-cleanup hard rules.
 */
export const decodeBrowserSecurityPayload = (
  source: string | Uint8Array | unknown
): DecodedBrowserSecurityPayload => {
  const decoded = decodePrivateJson(source, 'browser security report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'complete',
    'checks',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.browser-security-pre-finalization-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'Browser security pre-finalization report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'Browser security pre-finalization report is partial and cannot be normalized.'
    );
  }
  const tool = strictObject(root.tool, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  const checks = strictArray(
    root.checks,
    '$.checks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumSecurityChecks
  ).map((check, index) =>
    decodeSecurityCheckObservation(check, `$.checks[${index}]`)
  );
  assertUniqueIdentities(checks, ({ ruleId }) => ruleId, '$.checks');
  const expected = new Set<BrowserSecurityHardRuleId>(
    BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS
  );
  const unexpected = checks.filter(({ ruleId }) => !expected.has(ruleId));
  const observed = new Set(checks.map(({ ruleId }) => ruleId));
  const missing = BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS.filter(
    (ruleId) => !observed.has(ruleId)
  );
  if (unexpected.length > 0) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.checks',
      `Browser security pre-finalization report cannot provide Core post-cleanup rule "${unexpected[0]!.ruleId}".`
    );
  }
  if (missing.length > 0) {
    throwPartial(
      '$.checks',
      `Browser security pre-finalization report is missing required rules: ${missing.join(', ')}.`
    );
  }
  return Object.freeze({
    format: 'prodivix.browser-security-pre-finalization-report',
    version: 1,
    tool: Object.freeze({
      name: strictEnum(tool.name, '$.tool.name', [
        'prodivix-security-aggregate',
      ] as const),
      version: strictString(tool.version, '$.tool.version', 64),
      schemaDigest: strictSha256Digest(
        tool.schemaDigest,
        '$.tool.schemaDigest'
      ),
    }),
    checks: Object.freeze(
      [...checks].sort((left, right) =>
        compareVerificationText(left.ruleId, right.ruleId)
      )
    ),
  });
};

/**
 * Decodes only the four observations whose collector is the browser adapter.
 * Core-owned G2 observations cannot cross this private tool boundary.
 */
export const decodeBrowserOwnedSecurityPayload = (
  source: string | Uint8Array | unknown
): DecodedBrowserOwnedSecurityPayload => {
  const decoded = decodePrivateJson(source, 'browser-owned security report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'complete',
    'checks',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.browser-owned-security-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'Browser-owned security report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'Browser-owned security report is partial and cannot be normalized.'
    );
  }
  const tool = strictObject(root.tool, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  const checks = strictArray(
    root.checks,
    '$.checks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumSecurityChecks
  ).map((check, index) =>
    decodeSecurityCheckObservation(check, `$.checks[${index}]`)
  );
  assertUniqueIdentities(checks, ({ ruleId }) => ruleId, '$.checks');
  const expected = new Set<BrowserSecurityHardRuleId>(
    BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS
  );
  const unexpected = checks.filter(({ ruleId }) => !expected.has(ruleId));
  const observed = new Set(checks.map(({ ruleId }) => ruleId));
  const missing = BROWSER_SECURITY_BROWSER_OWNED_RULE_IDS.filter(
    (ruleId) => !observed.has(ruleId)
  );
  if (unexpected.length > 0) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.checks',
      `Browser-owned security report cannot provide Core-owned rule "${unexpected[0]!.ruleId}".`
    );
  }
  if (missing.length > 0) {
    throwPartial(
      '$.checks',
      `Browser-owned security report is missing required rules: ${missing.join(', ')}.`
    );
  }
  return Object.freeze({
    format: 'prodivix.browser-owned-security-report',
    version: 1,
    tool: Object.freeze({
      name: strictEnum(tool.name, '$.tool.name', ['playwright'] as const),
      version: strictString(tool.version, '$.tool.version', 64),
      schemaDigest: strictSha256Digest(
        tool.schemaDigest,
        '$.tool.schemaDigest'
      ),
    }),
    checks: Object.freeze(
      [...checks].sort((left, right) =>
        compareVerificationText(left.ruleId, right.ruleId)
      )
    ),
  });
};
