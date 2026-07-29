import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from './verificationCanonical';
import { createVerificationBehaviorAssertionReceipt } from './verificationBehaviorAssertionReceipt';
import {
  decodeVerificationAdapterCheckReportCandidate,
  decodeVerificationCheckReportCandidate,
  finalizeVerificationAdapterCheckReportCandidate,
  VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
  VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
} from './verificationCheckReportCodec';
import { normalizeVerificationCheckReportCandidate } from './verificationCheckReportNormalization';
import type { VerificationCheckReportCandidate } from './verificationCheckReport.types';
import type { VerificationCheckKind } from './verification.types';

const sha = (value: string): string => digestVerificationValue(value);
const adapter = Object.freeze({
  adapterId: 'adapter:strict',
  descriptorDigest: sha('descriptor'),
  toolchainDigest: sha('toolchain'),
  capabilityDigest: sha('capability'),
});
const tool = Object.freeze({
  name: '@prodivix/strict-verifier',
  version: '1.0.0',
  schemaVersion: 1,
  schemaDigest: sha('schema'),
});

const payloads = Object.freeze({
  diagnostics: Object.freeze({
    kind: 'diagnostics' as const,
    findings: Object.freeze([]),
  }),
  build: Object.freeze({
    kind: 'build' as const,
    outputManifestDigest: sha('manifest'),
    findings: Object.freeze([]),
  }),
  unit: Object.freeze({
    kind: 'unit' as const,
    suites: Object.freeze([
      Object.freeze({
        suiteId: 'suite:unit',
        status: 'passed' as const,
        cases: Object.freeze([
          Object.freeze({
            caseId: 'case:unit',
            status: 'passed' as const,
            diagnosticCodes: Object.freeze([]),
          }),
        ]),
      }),
    ]),
  }),
  integration: Object.freeze({
    kind: 'integration' as const,
    suites: Object.freeze([
      Object.freeze({
        suiteId: 'suite:integration',
        status: 'passed' as const,
        cases: Object.freeze([
          Object.freeze({
            caseId: 'case:integration',
            status: 'passed' as const,
            diagnosticCodes: Object.freeze([]),
          }),
        ]),
      }),
    ]),
  }),
  e2e: Object.freeze({
    kind: 'e2e' as const,
    scenarioId: 'scenario:checkout',
    steps: Object.freeze([
      Object.freeze({
        stepId: 'step:submit',
        targetId: 'target:submit',
        assertionCode: 'assert:visible',
        status: 'passed' as const,
        blackBox: true,
        diagnosticCodes: Object.freeze([]),
      }),
    ]),
  }),
  visual: Object.freeze({
    kind: 'visual' as const,
    comparisons: Object.freeze([
      Object.freeze({
        observationId: 'visual:checkout',
        compatibilityKey: 'compat:chromium',
        baselineDigest: sha('baseline'),
        currentDigest: sha('current'),
        changedPixels: 0,
        totalPixels: 1,
        thresholdPixels: 0,
        status: 'passed' as const,
        maskIds: Object.freeze([]),
      }),
    ]),
  }),
  accessibility: Object.freeze({
    kind: 'accessibility' as const,
    findings: Object.freeze([]),
    journeys: Object.freeze([
      Object.freeze({
        journeyId: 'journey:keyboard',
        stepId: 'step:focus-root',
        targetId: 'target:root',
        assertionCode: 'assert:focus-order',
        status: 'passed' as const,
        diagnosticCodes: Object.freeze([]),
      }),
    ]),
  }),
  performance: Object.freeze({
    kind: 'performance' as const,
    environmentDigest: sha('environment'),
    samplingDigest: sha('sampling'),
    comparable: true,
    metrics: Object.freeze([
      Object.freeze({
        metricId: 'metric:lcp',
        unit: 'ms' as const,
        operator: 'less-than-or-equal' as const,
        value: 1_000,
        threshold: 2_500,
        sampleCount: 3,
      }),
    ]),
  }),
  security: Object.freeze({
    kind: 'security' as const,
    observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
    findings: Object.freeze([]),
  }),
});

type CandidatePayload = Readonly<
  { kind: VerificationCheckKind } & Record<string, unknown>
>;

const behaviorReceipt = (
  kind: Extract<
    VerificationCheckKind,
    'e2e' | 'visual' | 'accessibility' | 'performance' | 'security'
  >,
  scenarioId: string
) =>
  createVerificationBehaviorAssertionReceipt({
    attemptId: `attempt:${kind}`,
    cellId: `cell:${kind}`,
    scenarioId,
    executableSnapshotDigest: sha(`snapshot:${kind}`),
    scenarioProgramDigest: sha(`program:${kind}`),
    controlProfileDigest: sha(`control:${kind}`),
    fixtureSetDigests: [],
    targetLeaseBindingDigest: sha(`target-lease:${kind}`),
    runtimeFixtureBindingDigest: sha(`runtime-fixture:${kind}`),
    blackBoxAssertionSetDigest: sha(`assertions:${kind}`),
  });

const candidate = (
  payload: CandidatePayload,
  terminal: VerificationCheckReportCandidate['terminal'] = {
    status: 'completed',
    complete: true,
    exitCode: 0,
  }
): VerificationCheckReportCandidate => {
  const browserKind =
    payload.kind === 'e2e' ||
    payload.kind === 'visual' ||
    payload.kind === 'accessibility' ||
    payload.kind === 'performance' ||
    payload.kind === 'security'
      ? payload.kind
      : undefined;
  const boundPayload =
    browserKind === undefined || 'behaviorAssertionReceipt' in payload
      ? payload
      : Object.freeze({
          ...payload,
          behaviorAssertionReceipt: behaviorReceipt(
            browserKind,
            payload.kind === 'e2e' && typeof payload.scenarioId === 'string'
              ? payload.scenarioId
              : `scenario:${browserKind}`
          ),
        });
  return Object.freeze({
    format: 'prodivix.verification-check-report-candidate',
    version: 1,
    cellId: `cell:${payload.kind}`,
    attemptId: `attempt:${payload.kind}`,
    checkKind: payload.kind,
    inputDigest: sha(`input:${payload.kind}`),
    adapter,
    tool,
    terminal,
    payload: boundPayload,
    artifacts: Object.freeze([]),
    diagnosticCodes: Object.freeze([]),
  }) as unknown as VerificationCheckReportCandidate;
};

describe('Verification check report strict codec', () => {
  it('accepts and Core-normalizes all nine complete report families', () => {
    for (const payload of Object.values(payloads)) {
      expect(
        decodeVerificationCheckReportCandidate(candidate(payload))
      ).toMatchObject({
        ok: true,
      });
      expect(
        normalizeVerificationCheckReportCandidate(candidate(payload))
      ).toMatchObject({
        status: 'ready',
        report: { outcome: 'passed', verdict: 'passed' },
      });
    }
  });

  it('accepts multiple steps in one accessibility journey and rejects duplicate step identities', () => {
    const report = candidate(payloads.accessibility);
    if (report.payload.kind !== 'accessibility') {
      throw new Error('Expected an accessibility payload.');
    }
    const first = report.payload.journeys[0]!;
    const second = Object.freeze({
      ...first,
      stepId: 'step:announce-root',
      assertionCode: 'assert:dynamic-announcement',
    });
    expect(
      decodeVerificationCheckReportCandidate({
        ...report,
        payload: {
          ...report.payload,
          journeys: [first, second],
        },
      })
    ).toMatchObject({ ok: true });
    expect(
      decodeVerificationCheckReportCandidate({
        ...report,
        payload: {
          ...report.payload,
          journeys: [first, { ...second, stepId: first.stepId }],
        },
      })
    ).toMatchObject({ ok: false });
  });

  it('requires an exact attempt-bound Behavior assertion receipt for every browser family', () => {
    for (const payload of [
      payloads.e2e,
      payloads.visual,
      payloads.accessibility,
      payloads.performance,
      payloads.security,
    ]) {
      const report = candidate(payload);
      const browserPayload = report.payload as typeof report.payload & {
        behaviorAssertionReceipt: ReturnType<typeof behaviorReceipt>;
      };
      const { behaviorAssertionReceipt: _receipt, ...withoutReceipt } =
        browserPayload;
      expect(
        decodeVerificationCheckReportCandidate({
          ...report,
          payload: withoutReceipt,
        })
      ).toMatchObject({ ok: false });
      expect(
        decodeVerificationCheckReportCandidate({
          ...report,
          payload: {
            ...browserPayload,
            behaviorAssertionReceipt: {
              ...browserPayload.behaviorAssertionReceipt,
              blackBoxAssertionSetDigest: sha('forged-assertions'),
            },
          },
        })
      ).toMatchObject({ ok: false });
    }

    const visual = candidate(payloads.visual);
    if (visual.payload.kind !== 'visual') {
      throw new Error('Expected a visual payload.');
    }
    const coordinateDrift = createVerificationBehaviorAssertionReceipt({
      ...visual.payload.behaviorAssertionReceipt,
      attemptId: 'attempt:other',
    });
    expect(
      decodeVerificationCheckReportCandidate({
        ...visual,
        payload: {
          ...visual.payload,
          behaviorAssertionReceipt: coordinateDrift,
        },
      })
    ).toMatchObject({ ok: false });
  });

  it('allows declared Fixture bindings but rejects a test Fixture receipt on production security', () => {
    const visual = candidate(payloads.visual);
    if (visual.payload.kind !== 'visual') {
      throw new Error('Expected a visual payload.');
    }
    const fixtureBoundVisual = createVerificationBehaviorAssertionReceipt({
      ...visual.payload.behaviorAssertionReceipt,
      fixtureSetDigests: [sha('authenticated-fixture')],
    });
    expect(
      decodeVerificationCheckReportCandidate({
        ...visual,
        payload: {
          ...visual.payload,
          behaviorAssertionReceipt: fixtureBoundVisual,
        },
      })
    ).toMatchObject({ ok: true });
    const canonicalFixtureReceipt = createVerificationBehaviorAssertionReceipt({
      ...visual.payload.behaviorAssertionReceipt,
      fixtureSetDigests: [sha('fixture:b'), sha('fixture:a')],
    });
    expect(
      decodeVerificationCheckReportCandidate({
        ...visual,
        payload: {
          ...visual.payload,
          behaviorAssertionReceipt: {
            ...canonicalFixtureReceipt,
            fixtureSetDigests: [
              canonicalFixtureReceipt.fixtureSetDigests[1]!,
              canonicalFixtureReceipt.fixtureSetDigests[0]!,
            ],
          },
        },
      })
    ).toMatchObject({ ok: false });

    const security = candidate(payloads.security);
    if (security.payload.kind !== 'security') {
      throw new Error('Expected a security payload.');
    }
    const fixtureInjectedSecurity = createVerificationBehaviorAssertionReceipt({
      ...security.payload.behaviorAssertionReceipt,
      fixtureSetDigests: [sha('test-auth-fixture')],
    });
    expect(
      decodeVerificationCheckReportCandidate({
        ...security,
        payload: {
          ...security.payload,
          behaviorAssertionReceipt: fixtureInjectedSecurity,
        },
      })
    ).toMatchObject({ ok: false });
  });

  it('fails closed on empty evidence families and partial security observation', () => {
    for (const payload of [
      { kind: 'e2e', scenarioId: 'scenario:x', steps: [] },
      { kind: 'visual', comparisons: [] },
      { kind: 'accessibility', findings: [], journeys: [] },
      {
        kind: 'performance',
        environmentDigest: sha('environment'),
        samplingDigest: sha('sampling'),
        comparable: true,
        metrics: [],
      },
      {
        kind: 'security',
        observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS.slice(1),
        findings: [],
      },
    ]) {
      expect(
        decodeVerificationCheckReportCandidate(
          candidate(payload as CandidatePayload)
        )
      ).toMatchObject({ ok: false });
    }
  });

  it('keeps adapter seven-rule observations separate from the public nine-rule report', () => {
    const adapterCandidate = candidate({
      kind: 'security',
      observedRuleIds: VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
      findings: [],
    });
    const decodedAdapter =
      decodeVerificationAdapterCheckReportCandidate(adapterCandidate);
    expect(decodedAdapter).toMatchObject({ ok: true });
    expect(
      decodeVerificationCheckReportCandidate(adapterCandidate)
    ).toMatchObject({ ok: false });
    expect(
      decodedAdapter.ok
        ? finalizeVerificationAdapterCheckReportCandidate(decodedAdapter.value)
        : decodedAdapter
    ).toMatchObject({
      ok: true,
      value: {
        payload: {
          observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
        },
      },
    });

    const invalidObservedSets = [
      VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS.slice(1),
      [
        ...VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
        'security.cleanup-residual',
      ],
      [
        ...VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS.slice(0, -1),
        'security.fake-rule',
      ],
    ];
    for (const observedRuleIds of invalidObservedSets) {
      expect(
        decodeVerificationAdapterCheckReportCandidate(
          candidate({
            kind: 'security',
            observedRuleIds,
            findings: [],
          })
        )
      ).toMatchObject({ ok: false });
    }
    expect(
      decodeVerificationAdapterCheckReportCandidate(
        candidate({
          kind: 'security',
          observedRuleIds: VERIFICATION_ADAPTER_SECURITY_OBSERVATION_RULE_IDS,
          findings: [
            {
              ruleId: 'security.artifact-digest-drift',
              severity: 'critical',
              targetId: 'target:artifact',
              messageKey: 'verification.security.artifactDigestDrift',
              count: 1,
              diagnosticCodes: [],
            },
          ],
        })
      )
    ).toMatchObject({ ok: false });
  });

  it('derives product, environment, and hard-security outcomes without trusting exit code', () => {
    const failedUnit = candidate({
      kind: 'unit',
      suites: [
        {
          suiteId: 'suite:failed',
          status: 'failed',
          cases: [
            {
              caseId: 'case:failed',
              status: 'failed',
              diagnosticCodes: [],
            },
          ],
        },
      ],
    });
    expect(normalizeVerificationCheckReportCandidate(failedUnit)).toMatchObject(
      {
        status: 'ready',
        report: {
          outcome: 'failed',
          failureClass: 'product-assertion-finding',
        },
      }
    );
    expect(
      normalizeVerificationCheckReportCandidate(
        candidate(failedUnit.payload, {
          status: 'completed',
          complete: true,
          exitCode: 1,
        })
      )
    ).toMatchObject({
      status: 'ready',
      report: { outcome: 'failed' },
    });
    expect(
      normalizeVerificationCheckReportCandidate(
        candidate(payloads.unit, {
          status: 'completed',
          complete: true,
          exitCode: 1,
        })
      )
    ).toMatchObject({
      status: 'ready',
      report: {
        outcome: 'infrastructure-error',
        failureClass: 'contract-mismatch',
      },
    });
    const incompatibleVisual = candidate(payloads.visual);
    if (incompatibleVisual.payload.kind !== 'visual') {
      throw new Error('Expected a visual report candidate.');
    }
    expect(
      normalizeVerificationCheckReportCandidate({
        ...incompatibleVisual,
        payload: {
          ...incompatibleVisual.payload,
          comparisons: [
            {
              ...payloads.visual.comparisons[0]!,
              status: 'incompatible',
            },
          ],
        },
      })
    ).toMatchObject({
      status: 'ready',
      report: { failureClass: 'environment' },
    });
    expect(
      normalizeVerificationCheckReportCandidate(
        candidate({
          kind: 'security',
          observedRuleIds: VERIFICATION_SECURITY_HARD_FAILURE_RULE_IDS,
          findings: [
            {
              ruleId: 'security.secret-canary',
              severity: 'critical',
              targetId: 'target:artifact',
              messageKey: 'verification.security.secretCanary',
              count: 1,
              diagnosticCodes: [],
            },
          ],
        })
      )
    ).toMatchObject({
      status: 'ready',
      report: {
        outcome: 'failed',
        failureClass: 'security-denial',
      },
    });
  });

  it('rejects unknown/private/path/unsafe/oversize candidate data', () => {
    const base = candidate(payloads.diagnostics);
    expect(
      decodeVerificationCheckReportCandidate({
        ...base,
        vendorPayload: {},
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeVerificationCheckReportCandidate({
        ...base,
        tool: { ...base.tool, name: 'https://vendor.example/tool' },
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeVerificationCheckReportCandidate({
        ...base,
        payload: new (class PrivatePayload {
          kind = 'diagnostics';
          findings = [];
        })(),
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeVerificationCheckReportCandidate({
        ...base,
        payload: JSON.parse(
          '{"kind":"diagnostics","findings":[],"__proto__":{}}'
        ),
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeVerificationCheckReportCandidate({
        ...base,
        tool: { ...base.tool, version: 'x'.repeat(600_000) },
      })
    ).toMatchObject({ ok: false });
  });

  it('canonicalizes report ordering into a deterministic candidate id', () => {
    const left = candidate({
      kind: 'diagnostics',
      findings: [
        {
          ruleId: 'rule:z',
          severity: 'warning',
          targetId: 'target:z',
          messageKey: 'message:z',
          count: 1,
          diagnosticCodes: ['Z', 'A'],
        },
        {
          ruleId: 'rule:a',
          severity: 'info',
          targetId: 'target:a',
          messageKey: 'message:a',
          count: 1,
          diagnosticCodes: [],
        },
      ],
    });
    if (left.payload.kind !== 'diagnostics') {
      throw new Error('Expected diagnostics payload.');
    }
    const right = candidate({
      ...left.payload,
      findings: [...left.payload.findings].reverse(),
    });
    const first = normalizeVerificationCheckReportCandidate(left);
    const second = normalizeVerificationCheckReportCandidate(right);
    expect(first).toMatchObject({ status: 'ready' });
    expect(second).toMatchObject({ status: 'ready' });
    if (first.status === 'ready' && second.status === 'ready') {
      expect(first.report.candidateId).toBe(second.report.candidateId);
      expect(first.report.summary).toEqual(second.report.summary);
    }
  });
});
