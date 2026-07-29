import { describe, expect, it } from 'vitest';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
} from './privateBoundary';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from './playwrightPrivatePayload';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const report = (overrides: Record<string, unknown> = {}) => ({
  format: 'prodivix.playwright-browser-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('a'),
  },
  scenarioId: 'scenario.catalog',
  complete: true,
  exitCode: 0,
  checks: [
    {
      checkId: 'check.visible',
      stepId: 'step.visible',
      targetId: 'target.catalog',
      assertionCode: 'catalog.visible',
      status: 'passed',
      blackBox: true,
      durationMs: 5,
      diagnosticCodes: [],
      sourceTraceDigest: sha('b'),
    },
  ],
  ...overrides,
});

describe('Playwright private payload boundary', () => {
  it('decodes only the bounded projection and derives a passing result', () => {
    const decoded = decodePlaywrightBehaviorPayload(
      JSON.stringify(
        report({
          checks: [
            {
              checkId: 'check.z',
              stepId: 'step.z',
              targetId: 'target.z',
              assertionCode: 'z.visible',
              status: 'passed',
              blackBox: true,
              durationMs: 2,
              diagnosticCodes: ['VER-Z'],
            },
            {
              checkId: 'check.a',
              stepId: 'step.a',
              targetId: 'target.a',
              assertionCode: 'a.visible',
              status: 'passed',
              blackBox: true,
              durationMs: 1,
              diagnosticCodes: [],
            },
          ],
        })
      )
    );

    expect(decoded.checks.map(({ checkId }) => checkId)).toEqual([
      'check.a',
      'check.z',
    ]);
    expect(evaluatePlaywrightBehavior(decoded)).toMatchObject({
      verdict: 'passed',
      exitCode: 0,
    });
    expect(JSON.stringify(decoded)).not.toContain('Page');
    expect(JSON.stringify(decoded)).not.toContain('Locator');
  });

  it.each([
    ['unknown root field', report({ page: { handle: true } }), 'unknown-field'],
    ['partial report', report({ complete: false }), 'partial-result'],
    ['unknown version', report({ version: 2 }), 'partial-result'],
    [
      'non-canonical source digest',
      report({
        checks: [
          {
            ...report().checks[0],
            sourceTraceDigest: `sha256-${'A'.repeat(64)}`,
          },
        ],
      }),
      'invalid-field',
    ],
  ])('rejects a %s', (_label, value, code) => {
    expect(() => decodePlaywrightBehaviorPayload(value)).toThrowError(
      expect.objectContaining({ code })
    );
  });

  it('rejects unsafe object keys before assigning decoded fields', () => {
    const source = JSON.stringify(report()).replace(
      /}$/,
      ',"__proto__":{"polluted":true}}'
    );
    expect(() => decodePlaywrightBehaviorPayload(source)).toThrowError(
      expect.objectContaining({ code: 'unsafe-value' })
    );
    expect(
      (Object.prototype as Record<string, unknown>).polluted
    ).toBeUndefined();
  });

  it('rejects invalid UTF-8 before JSON parsing', () => {
    expect(() =>
      decodePlaywrightBehaviorPayload(Uint8Array.from([0xc3, 0x28]))
    ).toThrowError(expect.objectContaining({ code: 'invalid-json' }));
  });

  it('rejects NaN and negative zero from direct object input', () => {
    for (const durationMs of [Number.NaN, Number.POSITIVE_INFINITY, -0]) {
      expect(() =>
        decodePlaywrightBehaviorPayload(
          report({
            checks: [{ ...report().checks[0], durationMs }],
          })
        )
      ).toThrow(BrowserPrivatePayloadError);
    }
  });

  it('rejects accessors, symbol keys, and sparse arrays from direct inputs', () => {
    const accessor = report();
    Object.defineProperty(accessor, 'scenarioId', {
      enumerable: true,
      get: () => 'scenario.catalog',
    });
    expect(() => decodePlaywrightBehaviorPayload(accessor)).toThrowError(
      expect.objectContaining({ code: 'unsafe-value' })
    );

    const symbolKeyed = report() as Record<PropertyKey, unknown>;
    symbolKeyed[Symbol('hidden')] = true;
    expect(() => decodePlaywrightBehaviorPayload(symbolKeyed)).toThrowError(
      expect.objectContaining({ code: 'unsafe-value' })
    );

    const sparseChecks = new Array(1);
    expect(() =>
      decodePlaywrightBehaviorPayload(
        report({ exitCode: 1, checks: sparseChecks })
      )
    ).toThrowError(expect.objectContaining({ code: 'unsafe-value' }));
  });

  it('rejects duplicate stable check identities', () => {
    const check = report().checks[0]!;
    expect(() =>
      decodePlaywrightBehaviorPayload(
        report({ exitCode: 1, checks: [check, check] })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
  });

  it.each([
    ['zero exit with failed check', 0, 'failed'],
    ['non-zero exit with passing check', 1, 'passed'],
  ])('rejects result drift for %s', (_label, exitCode, status) => {
    expect(() =>
      decodePlaywrightBehaviorPayload(
        report({
          exitCode,
          checks: [{ ...report().checks[0], status }],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'result-drift' }));
  });

  it('does not accept white-box-only proof as a pass', () => {
    expect(() =>
      decodePlaywrightBehaviorPayload(
        report({
          checks: [{ ...report().checks[0], blackBox: false }],
        })
      )
    ).toThrow('must include black-box proof');
  });

  it('enforces input and direct-object UTF-8 byte budgets', () => {
    const oversized =
      'x'.repeat(BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes) + 'x';
    expect(() => decodePlaywrightBehaviorPayload(oversized)).toThrowError(
      expect.objectContaining({ code: 'input-too-large' })
    );

    const astral = '😀'.repeat(
      Math.floor(BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes / 4) + 1
    );
    expect(() =>
      decodePlaywrightBehaviorPayload({ padding: astral })
    ).toThrowError(expect.objectContaining({ code: 'budget-exceeded' }));
  });
});
