import { VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS } from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
} from './privateBoundary';
import {
  BROWSER_SECURITY_HARD_RULES,
  BROWSER_SECURITY_NON_EXEMPTIBLE_RULE_IDS,
  BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS,
  createBrowserSecurityPolicyDigest,
  decodeBrowserSecurityPayload,
  evaluateBrowserSecurity,
  type BrowserSecurityHardRuleId,
  type BrowserSecurityPolicyProfile,
  type SecurityCheckObservation,
} from './security';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const observation = (
  ruleId: BrowserSecurityHardRuleId,
  overrides: Partial<SecurityCheckObservation> = {}
): SecurityCheckObservation =>
  ({
    ruleId,
    state: 'complete',
    targetId: `target.${ruleId.slice('security.'.length)}`,
    expectedDigest: sha('a'),
    observedDigest: sha('a'),
    violationCount: 0,
    diagnosticCodes: [],
    ...overrides,
  }) as SecurityCheckObservation;

const allChecks = (): readonly SecurityCheckObservation[] =>
  BROWSER_SECURITY_ADAPTER_OBSERVED_RULE_IDS.map((ruleId) =>
    observation(ruleId)
  );

const securityReport = (overrides: Record<string, unknown> = {}) => ({
  format: 'prodivix.browser-security-pre-finalization-report',
  version: 1,
  tool: {
    name: 'prodivix-security-aggregate',
    version: '1.0.0',
    schemaDigest: sha('b'),
  },
  complete: true,
  checks: allChecks(),
  ...overrides,
});

const collectorFor = (
  ruleId: BrowserSecurityHardRuleId
):
  | 'browser-network'
  | 'response-csp'
  | 'response-permissions-policy'
  | 'browser-sandbox'
  | 'core-resolved-observation'
  | 'core-finalization' =>
  (
    ({
      'security.secret-canary': 'core-resolved-observation',
      'security.unexpected-network': 'browser-network',
      'security.csp-policy': 'response-csp',
      'security.permissions-policy': 'response-permissions-policy',
      'security.sandbox-isolation': 'browser-sandbox',
      'security.production-probe-leak': 'core-resolved-observation',
      'security.artifact-digest-drift': 'core-finalization',
      'security.cleanup-residual': 'core-finalization',
      'security.output-artifact-uninspectable': 'core-resolved-observation',
    }) as const
  )[ruleId];

const securityPolicy = (): BrowserSecurityPolicyProfile => ({
  allowedOrigins: ['https://assets.example.test', 'https://app.example.test'],
  productionProbeMarkers: ['__PRODIVIX_VERIFICATION_PROBE__'],
  expectedChecks: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.map((ruleId) => ({
    ruleId,
    targetId: observation(ruleId).targetId,
    expectedDigest: observation(ruleId).expectedDigest,
    collector: collectorFor(ruleId),
  })),
});

describe('browser security hard-rule boundary', () => {
  it('derives the exact non-exemptible rule set from Core', () => {
    const core = [...VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS].sort();
    expect(
      BROWSER_SECURITY_HARD_RULES.map(({ ruleId }) => ruleId).sort()
    ).toEqual(core);
    expect([...BROWSER_SECURITY_NON_EXEMPTIBLE_RULE_IDS]).toEqual(core);
  });

  it('passes pre-finalization only when all seven adapter-stage observations are clean', () => {
    const result = evaluateBrowserSecurity(
      decodeBrowserSecurityPayload(securityReport())
    );
    expect(result).toMatchObject({
      verdict: 'passed',
      findings: [],
      pendingFinalizationRuleIds: [
        'security.artifact-digest-drift',
        'security.cleanup-residual',
      ],
      nonExemptibleRuleIds: [
        'security.artifact-digest-drift',
        'security.cleanup-residual',
        'security.csp-policy',
        'security.output-artifact-uninspectable',
        'security.permissions-policy',
        'security.production-probe-leak',
        'security.sandbox-isolation',
        'security.secret-canary',
        'security.unexpected-network',
      ],
    });
  });

  it.each([
    ['secret/canary hit', 'security.secret-canary', 1, sha('a')],
    ['unexpected network', 'security.unexpected-network', 2, sha('a')],
    ['CSP digest drift', 'security.csp-policy', 0, sha('c')],
    [
      'uninspectable output',
      'security.output-artifact-uninspectable',
      1,
      sha('a'),
    ],
  ] as const)(
    'makes %s an unavoidable failure',
    (_label, ruleId, violationCount, observedDigest) => {
      const checks = allChecks().map((check) =>
        check.ruleId === ruleId
          ? observation(ruleId, { violationCount, observedDigest })
          : check
      );
      const result = evaluateBrowserSecurity(
        decodeBrowserSecurityPayload(securityReport({ checks }))
      );
      expect(result.verdict).toBe('failed');
      expect(result.findings).toEqual([
        expect.objectContaining({
          ruleId,
          severity: 'critical',
          disposition: 'failed',
          nonExemptible: true,
        }),
      ]);
    }
  );

  it('keeps a blocked required observation blocked', () => {
    const checks = allChecks().map((check) =>
      check.ruleId === 'security.permissions-policy'
        ? {
            ruleId: check.ruleId,
            state: 'blocked' as const,
            targetId: check.targetId,
            expectedDigest: check.expectedDigest,
            reasonCode: 'VER-SEC-PERMISSION-OBSERVER-UNAVAILABLE',
            diagnosticCodes: [],
          }
        : check
    );
    const result = evaluateBrowserSecurity(
      decodeBrowserSecurityPayload(securityReport({ checks }))
    );
    expect(result).toMatchObject({
      verdict: 'blocked',
      findings: [
        {
          ruleId: 'security.permissions-policy',
          disposition: 'blocked',
          nonExemptible: true,
        },
      ],
    });
  });

  it('rejects every attempted hard-rule exemption', () => {
    const report = decodeBrowserSecurityPayload(securityReport());
    expect(() =>
      evaluateBrowserSecurity(report, {
        exemptions: [
          {
            exemptionId: 'exemption.security',
            ruleId: 'security.csp-policy',
            reasonCode: 'temporary',
          },
        ],
      })
    ).toThrow('non-exemptible');
  });

  it('rejects missing, duplicate, and unknown hard-rule observations', () => {
    expect(() =>
      decodeBrowserSecurityPayload(
        securityReport({ checks: allChecks().slice(1) })
      )
    ).toThrowError(expect.objectContaining({ code: 'partial-result' }));
    expect(() =>
      decodeBrowserSecurityPayload(
        securityReport({
          checks: [...allChecks(), allChecks()[0]],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
    expect(() =>
      decodeBrowserSecurityPayload(
        securityReport({
          checks: [
            ...allChecks().slice(1),
            {
              ...allChecks()[0],
              ruleId: 'security.vendor-defined-pass',
            },
          ],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid-field' }));
  });

  it('rejects attempts to pre-report Core post-cleanup rules', () => {
    expect(() =>
      decodeBrowserSecurityPayload(
        securityReport({
          checks: [...allChecks(), observation('security.cleanup-residual')],
        })
      )
    ).toThrow('cannot provide Core post-cleanup rule');
  });

  it('has no field that can carry a matched secret or raw network data', () => {
    for (const unsafeField of ['matchedSecret', 'headers', 'body', 'url']) {
      const checks = allChecks().map((check) =>
        check.ruleId === 'security.secret-canary'
          ? { ...check, [unsafeField]: 'sensitive-value' }
          : check
      );
      expect(() =>
        decodeBrowserSecurityPayload(securityReport({ checks }))
      ).toThrowError(expect.objectContaining({ code: 'unknown-field' }));
    }
  });

  it('enforces non-finite, unsafe-key, and report-size bounds', () => {
    const checks = allChecks().map((check) =>
      check.ruleId === 'security.secret-canary'
        ? { ...check, violationCount: Number.NaN }
        : check
    );
    expect(() =>
      decodeBrowserSecurityPayload(securityReport({ checks }))
    ).toThrow(BrowserPrivatePayloadError);

    const unsafe = JSON.stringify(securityReport()).replace(
      /}$/,
      ',"__proto__":{"polluted":true}}'
    );
    expect(() => decodeBrowserSecurityPayload(unsafe)).toThrowError(
      expect.objectContaining({ code: 'unsafe-value' })
    );

    expect(() =>
      decodeBrowserSecurityPayload(
        securityReport({
          checks: Array.from(
            {
              length: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumSecurityChecks + 1,
            },
            () => allChecks()[0]
          ),
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'budget-exceeded' }));
  });

  it('binds fixed collectors and accepts the compiler opaque probe marker', () => {
    expect(createBrowserSecurityPolicyDigest(securityPolicy())).toMatch(
      /^sha256-[0-9a-f]{64}$/u
    );
    const wrongCollector = securityPolicy().expectedChecks.map((check) =>
      check.ruleId === 'security.secret-canary'
        ? {
            ruleId: check.ruleId,
            targetId: check.targetId,
            expectedDigest: check.expectedDigest,
            collector: 'browser-network' as const,
          }
        : check
    );
    expect(() =>
      createBrowserSecurityPolicyDigest({
        ...securityPolicy(),
        expectedChecks: wrongCollector,
      })
    ).toThrow('cannot replace the fixed owner');
  });

  it('rejects missing, control-bearing, and over-budget probe markers', () => {
    expect(() =>
      createBrowserSecurityPolicyDigest({
        ...securityPolicy(),
        productionProbeMarkers: [],
      })
    ).toThrow('at least one production probe marker');
    expect(() =>
      createBrowserSecurityPolicyDigest({
        ...securityPolicy(),
        productionProbeMarkers: ['__PRODIVIX_\nPROBE__'],
      })
    ).toThrow(BrowserPrivatePayloadError);
    expect(() =>
      createBrowserSecurityPolicyDigest({
        ...securityPolicy(),
        productionProbeMarkers: ['😀'.repeat(65)],
      })
    ).toThrowError(expect.objectContaining({ code: 'budget-exceeded' }));
  });

  it('canonicalizes policy ordering and rejects embedded runtime facts', () => {
    const first = securityPolicy();
    const reordered: BrowserSecurityPolicyProfile = {
      allowedOrigins: [...first.allowedOrigins].reverse(),
      productionProbeMarkers: first.productionProbeMarkers,
      expectedChecks: [...first.expectedChecks].reverse(),
    };
    expect(createBrowserSecurityPolicyDigest(reordered)).toBe(
      createBrowserSecurityPolicyDigest(first)
    );

    const fakeCleanLiteral = {
      ...first,
      expectedChecks: first.expectedChecks.map((check) =>
        check.collector === 'core-resolved-observation'
          ? {
              ...check,
              observation: observation(check.ruleId, {
                targetId: check.targetId,
                expectedDigest: check.expectedDigest,
              }),
            }
          : check
      ),
    };
    expect(() =>
      createBrowserSecurityPolicyDigest(
        fakeCleanLiteral as BrowserSecurityPolicyProfile
      )
    ).toThrowError(expect.objectContaining({ code: 'unknown-field' }));
  });
});
