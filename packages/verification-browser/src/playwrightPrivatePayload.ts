import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
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
  throwDrift,
  throwPartial,
} from './privateBoundary';

export type PlaywrightBehaviorCheck = Readonly<{
  checkId: string;
  stepId: string;
  targetId: string;
  assertionCode: string;
  status: 'passed' | 'failed' | 'blocked';
  blackBox: boolean;
  durationMs: number;
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
}>;

export type DecodedPlaywrightBehaviorPayload = Readonly<{
  format: 'prodivix.playwright-browser-report';
  version: 1;
  tool: Readonly<{
    name: 'playwright';
    version: string;
    schemaDigest: string;
  }>;
  scenarioId: string;
  exitCode: number;
  checks: readonly PlaywrightBehaviorCheck[];
}>;

export type PlaywrightBehaviorResult = Readonly<{
  scenarioId: string;
  verdict: 'passed' | 'failed' | 'blocked';
  exitCode: number;
  checks: readonly PlaywrightBehaviorCheck[];
  tool: DecodedPlaywrightBehaviorPayload['tool'];
}>;

const decodeTool = (
  value: unknown
): DecodedPlaywrightBehaviorPayload['tool'] => {
  const tool = strictObject(value, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  const name = strictEnum(tool.name, '$.tool.name', ['playwright'] as const);
  return Object.freeze({
    name,
    version: strictString(tool.version, '$.tool.version', 64),
    schemaDigest: strictSha256Digest(tool.schemaDigest, '$.tool.schemaDigest'),
  });
};

const decodeCheck = (
  value: unknown,
  index: number
): PlaywrightBehaviorCheck => {
  const path = `$.checks[${index}]`;
  const check = strictObject(
    value,
    path,
    [
      'checkId',
      'stepId',
      'targetId',
      'assertionCode',
      'status',
      'blackBox',
      'durationMs',
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
    checkId: strictIdentifier(check.checkId, `${path}.checkId`),
    stepId: strictIdentifier(check.stepId, `${path}.stepId`),
    targetId: strictIdentifier(check.targetId, `${path}.targetId`),
    assertionCode: strictIdentifier(
      check.assertionCode,
      `${path}.assertionCode`
    ),
    status: strictEnum(check.status, `${path}.status`, [
      'passed',
      'failed',
      'blocked',
    ] as const),
    blackBox: strictBoolean(check.blackBox, `${path}.blackBox`),
    durationMs: strictSafeInteger(check.durationMs, `${path}.durationMs`, {
      minimum: 0,
      maximum: 86_400_000,
    }),
    diagnosticCodes: strictDiagnosticCodes(
      check.diagnosticCodes,
      `${path}.diagnosticCodes`
    ),
    ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
  });
};

/**
 * Decodes the controlled reporter projection, never a Playwright Test object.
 * Browser/Page/Locator handles and arbitrary error stacks are intentionally
 * absent from the accepted schema.
 */
export const decodePlaywrightBehaviorPayload = (
  source: string | Uint8Array | unknown
): DecodedPlaywrightBehaviorPayload => {
  const decoded = decodePrivateJson(source, 'Playwright browser report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'scenarioId',
    'complete',
    'exitCode',
    'checks',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.playwright-browser-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'Playwright browser report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'Playwright browser report is partial and cannot be normalized.'
    );
  }
  const rawChecks = strictArray(
    root.checks,
    '$.checks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumChecks
  );
  if (rawChecks.length === 0) {
    throwPartial(
      '$.checks',
      'Playwright browser report did not contain any completed checks.'
    );
  }
  const checks = rawChecks.map(decodeCheck);
  assertUniqueIdentities(checks, ({ checkId }) => checkId, '$.checks');
  const orderedChecks = Object.freeze(
    [...checks].sort((left, right) =>
      compareUnicodeCodePoints(left.checkId, right.checkId)
    )
  );
  const exitCode = strictSafeInteger(root.exitCode, '$.exitCode', {
    minimum: 0,
    maximum: 255,
  });
  const structurallyPassed = orderedChecks.every(
    ({ status }) => status === 'passed'
  );
  if ((exitCode === 0) !== structurallyPassed) {
    throwDrift(
      '$.exitCode',
      'Playwright process exit code and structured check results diverged.'
    );
  }
  if (structurallyPassed && !orderedChecks.some(({ blackBox }) => blackBox)) {
    throwDrift(
      '$.checks',
      'A passing behavior report must include black-box proof.'
    );
  }
  return Object.freeze({
    format: 'prodivix.playwright-browser-report',
    version: 1,
    tool: decodeTool(root.tool),
    scenarioId: strictIdentifier(root.scenarioId, '$.scenarioId'),
    exitCode,
    checks: orderedChecks,
  });
};

export const evaluatePlaywrightBehavior = (
  report: DecodedPlaywrightBehaviorPayload
): PlaywrightBehaviorResult => {
  const verdict = report.checks.some(({ status }) => status === 'failed')
    ? 'failed'
    : report.checks.some(({ status }) => status === 'blocked')
      ? 'blocked'
      : 'passed';
  return Object.freeze({
    scenarioId: report.scenarioId,
    verdict,
    exitCode: report.exitCode,
    checks: report.checks,
    tool: report.tool,
  });
};
