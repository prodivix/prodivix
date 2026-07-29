import { describe, expect, it } from 'vitest';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
} from './privateBoundary';
import {
  createPerformanceEnvironmentDigest,
  createPerformancePolicyDigest,
  createPerformanceSamplingDigest,
  decodePerformancePayload,
  evaluatePerformance,
  type PerformanceEnvironmentProfile,
  type PerformancePolicyProfile,
} from './performance';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const environment = (
  overrides: Partial<PerformanceEnvironmentProfile> = {}
): PerformanceEnvironmentProfile => ({
  machineClass: 'ci.standard-4',
  operatingSystemImageDigest: sha('1'),
  browserImageDigest: sha('2'),
  browserEngine: 'chromium',
  browserVersion: '123.0.0',
  fontSetDigest: sha('3'),
  viewport: {
    widthCssPixels: 1280,
    heightCssPixels: 720,
    devicePixelRatio: 1,
  },
  colorScheme: 'light',
  motionPreference: 'reduced',
  locale: 'en-US',
  cacheClass: 'warm',
  ...overrides,
});

const policy = (
  overrides: Partial<PerformancePolicyProfile> = {}
): PerformancePolicyProfile => ({
  expectedEnvironment: environment(),
  sampling: {
    warmupRuns: 1,
    sampleCount: 3,
    statistic: 'median',
  },
  thresholds: [
    {
      metricId: 'navigation-lcp',
      unit: 'ms',
      operator: 'less-than-or-equal',
      threshold: 100,
    },
    {
      metricId: 'animation-frame-rate',
      unit: 'fps',
      operator: 'greater-than-or-equal',
      threshold: 50,
    },
  ],
  ...overrides,
});

const sample = (id: string, lcp: number, frameRate = 60) => ({
  sampleId: id,
  metrics: [
    { metricId: 'navigation-lcp', unit: 'ms', value: lcp },
    {
      metricId: 'animation-frame-rate',
      unit: 'fps',
      value: frameRate,
    },
  ],
});

const performanceReport = (
  profile: PerformancePolicyProfile,
  overrides: Record<string, unknown> = {}
) => ({
  format: 'prodivix.browser-performance-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('4'),
  },
  complete: true,
  profileDigest: createPerformancePolicyDigest(profile),
  environment: profile.expectedEnvironment,
  warmupRuns: profile.sampling.warmupRuns,
  samples: [
    sample('sample-3', 90),
    sample('sample-1', 70),
    sample('sample-2', 80),
  ],
  ...overrides,
});

describe('controlled browser performance sampling', () => {
  it('derives deterministic aggregates and evaluates policy thresholds', () => {
    const configured = policy();
    const result = evaluatePerformance(
      decodePerformancePayload(performanceReport(configured)),
      configured
    );

    expect(result).toMatchObject({
      verdict: 'passed',
      comparable: true,
      metrics: [
        {
          metricId: 'animation-frame-rate',
          value: 60,
          threshold: 50,
          sampleCount: 3,
          status: 'passed',
        },
        {
          metricId: 'navigation-lcp',
          value: 80,
          threshold: 100,
          sampleCount: 3,
          status: 'passed',
        },
      ],
    });
    expect(result.environmentDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(result.samplingDigest).toMatch(/^sha256-[0-9a-f]{64}$/u);
  });

  it('does not let the runner self-report a different policy profile', () => {
    const configured = policy();
    const report = decodePerformancePayload(
      performanceReport(configured, { profileDigest: sha('9') })
    );
    expect(evaluatePerformance(report, configured)).toMatchObject({
      verdict: 'blocked',
      comparable: false,
      reasonCode: 'VER-PERF-POLICY-DIGEST-MISMATCH',
      metrics: [],
    });
  });

  it.each([
    [
      'machine image',
      environment({ operatingSystemImageDigest: sha('8') }),
      ['os-image'],
    ],
    ['cache class', environment({ cacheClass: 'cold' }), ['cache']],
  ])(
    'makes an incompatible %s view-only',
    (_label, actualEnvironment, incompatibleFields) => {
      const configured = policy();
      const report = decodePerformancePayload(
        performanceReport(configured, {
          environment: actualEnvironment,
        })
      );
      expect(evaluatePerformance(report, configured)).toMatchObject({
        verdict: 'view-only',
        comparable: false,
        incompatibleFields,
        metrics: [{ status: 'view-only' }, { status: 'view-only' }],
      });
    }
  );

  it('blocks insufficient sampling before comparison', () => {
    const configured = policy();
    const result = evaluatePerformance(
      decodePerformancePayload(
        performanceReport(configured, {
          samples: [sample('sample-1', 70)],
        })
      ),
      configured
    );
    expect(result).toMatchObject({
      verdict: 'blocked',
      reasonCode: 'VER-PERF-SAMPLING-MISMATCH',
    });
  });

  it('blocks a required metric missing from any sample', () => {
    const configured = policy();
    const samples = [
      sample('sample-1', 70),
      {
        sampleId: 'sample-2',
        metrics: [{ metricId: 'navigation-lcp', unit: 'ms', value: 80 }],
      },
      sample('sample-3', 90),
    ];
    const result = evaluatePerformance(
      decodePerformancePayload(performanceReport(configured, { samples })),
      configured
    );
    expect(result).toMatchObject({
      verdict: 'blocked',
      reasonCode: 'VER-PERF-METRIC-PARTIAL',
    });
  });

  it('reports threshold regression without conflating environment failure', () => {
    const configured = policy();
    const samples = [
      sample('sample-1', 110, 49),
      sample('sample-2', 120, 48),
      sample('sample-3', 130, 47),
    ];
    const result = evaluatePerformance(
      decodePerformancePayload(performanceReport(configured, { samples })),
      configured
    );
    expect(result.verdict).toBe('failed');
    if (result.verdict === 'blocked') throw new Error('unexpected block');
    expect(result.metrics.every(({ status }) => status === 'failed')).toBe(
      true
    );
  });

  it('rejects unknown, partial, duplicate, and non-finite tool data', () => {
    const configured = policy();
    const { profileDigest: _profileDigest, ...missingProfileDigest } =
      performanceReport(configured);
    expect(_profileDigest).toMatch(/^sha256-/u);
    expect(() => decodePerformancePayload(missingProfileDigest)).toThrowError(
      expect.objectContaining({ code: 'missing-field' })
    );
    expect(() =>
      decodePerformancePayload(
        performanceReport(configured, { complete: false })
      )
    ).toThrowError(expect.objectContaining({ code: 'partial-result' }));
    expect(() =>
      decodePerformancePayload(
        performanceReport(configured, { vendorTrace: [] })
      )
    ).toThrowError(expect.objectContaining({ code: 'unknown-field' }));
    expect(() =>
      decodePerformancePayload(
        performanceReport(configured, {
          samples: [sample('sample-1', 1), sample('sample-1', 2)],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
    expect(() =>
      decodePerformancePayload(
        performanceReport(configured, {
          samples: [
            {
              sampleId: 'sample-1',
              metrics: [
                {
                  metricId: 'navigation-lcp',
                  unit: 'ms',
                  value: Number.NaN,
                },
              ],
            },
          ],
        })
      )
    ).toThrow(BrowserPrivatePayloadError);
  });

  it('rejects duplicate metrics and policy thresholds', () => {
    const configured = policy();
    const metric = sample('sample-1', 10).metrics[0]!;
    expect(() =>
      decodePerformancePayload(
        performanceReport(configured, {
          samples: [
            {
              sampleId: 'sample-1',
              metrics: [metric, metric],
            },
          ],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));

    expect(() =>
      createPerformancePolicyDigest(
        policy({
          thresholds: [configured.thresholds[0]!, configured.thresholds[0]!],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
  });

  it('enforces the sample budget before normalization', () => {
    const configured = policy({
      sampling: {
        warmupRuns: 1,
        sampleCount: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumPerformanceSamples,
        statistic: 'median',
      },
    });
    const samples = Array.from(
      {
        length: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumPerformanceSamples + 1,
      },
      (_, index) => sample(`sample-${index}`, index)
    );
    expect(() =>
      decodePerformancePayload(performanceReport(configured, { samples }))
    ).toThrowError(expect.objectContaining({ code: 'budget-exceeded' }));
  });

  it('makes environment, sampling, and policy digests order-independent', () => {
    const configured = policy();
    expect(createPerformanceEnvironmentDigest(environment())).toBe(
      createPerformanceEnvironmentDigest({ ...environment() })
    );
    expect(createPerformanceSamplingDigest(configured.sampling)).toBe(
      createPerformanceSamplingDigest({ ...configured.sampling })
    );
    expect(createPerformancePolicyDigest(configured)).toBe(
      createPerformancePolicyDigest({
        thresholds: [...configured.thresholds].reverse(),
        sampling: { ...configured.sampling },
        expectedEnvironment: { ...configured.expectedEnvironment },
      })
    );
  });
});
