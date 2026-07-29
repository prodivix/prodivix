import {
  compareVerificationText,
  digestVerificationValue,
  type VerificationBrowserEngine,
  type VerificationColorScheme,
  type VerificationMotion,
} from '@prodivix/verification';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  decodePrivateJson,
  strictArray,
  strictBoolean,
  strictEnum,
  strictFiniteNumber,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  strictString,
  throwPartial,
} from './privateBoundary';

export const PERFORMANCE_METRIC_UNITS = Object.freeze({
  'navigation-lcp': 'ms',
  'layout-shift': 'ratio',
  'interaction-inp': 'ms',
  'total-blocking-time': 'ms',
  'long-task-count': 'count',
  'resource-count': 'count',
  'resource-bytes': 'bytes',
  'scenario-duration': 'ms',
  'animation-missed-frame-count': 'count',
  'animation-frame-rate': 'fps',
} as const);

export type PerformanceMetricId = keyof typeof PERFORMANCE_METRIC_UNITS;
export type PerformanceMetricUnit =
  (typeof PERFORMANCE_METRIC_UNITS)[PerformanceMetricId];
export type PerformanceCacheClass = 'cold' | 'warm';
export type PerformanceStatistic = 'median' | 'p75' | 'p95' | 'maximum';

export type PerformanceEnvironmentProfile = Readonly<{
  machineClass: string;
  operatingSystemImageDigest: string;
  browserImageDigest: string;
  browserEngine: VerificationBrowserEngine;
  browserVersion: string;
  fontSetDigest: string;
  viewport: Readonly<{
    widthCssPixels: number;
    heightCssPixels: number;
    devicePixelRatio: number;
  }>;
  colorScheme: VerificationColorScheme;
  motionPreference: VerificationMotion;
  locale: string;
  cacheClass: PerformanceCacheClass;
}>;

export type PerformanceEnvironmentField =
  | 'machine-class'
  | 'os-image'
  | 'browser-image'
  | 'browser-engine'
  | 'browser-version'
  | 'font'
  | 'viewport'
  | 'dpr'
  | 'color'
  | 'motion'
  | 'locale'
  | 'cache';

export type PerformanceSample = Readonly<{
  sampleId: string;
  metrics: readonly Readonly<{
    metricId: PerformanceMetricId;
    unit: PerformanceMetricUnit;
    value: number;
  }>[];
}>;

export type DecodedPerformancePayload = Readonly<{
  format: 'prodivix.browser-performance-report';
  version: 1;
  tool: Readonly<{
    name: 'playwright';
    version: string;
    schemaDigest: string;
  }>;
  profileDigest: string;
  environment: PerformanceEnvironmentProfile;
  warmupRuns: number;
  samples: readonly PerformanceSample[];
}>;

export type PerformanceThreshold = Readonly<{
  metricId: PerformanceMetricId;
  unit: PerformanceMetricUnit;
  operator: 'less-than-or-equal' | 'greater-than-or-equal';
  threshold: number;
}>;

export type PerformancePolicyProfile = Readonly<{
  expectedEnvironment: PerformanceEnvironmentProfile;
  sampling: Readonly<{
    warmupRuns: number;
    sampleCount: number;
    statistic: PerformanceStatistic;
  }>;
  thresholds: readonly PerformanceThreshold[];
}>;

export type NormalizedPerformanceMetric = Readonly<{
  metricId: PerformanceMetricId;
  unit: PerformanceMetricUnit;
  operator: PerformanceThreshold['operator'];
  statistic: PerformanceStatistic;
  value: number;
  threshold: number;
  sampleCount: number;
  status: 'passed' | 'failed' | 'view-only';
}>;

export type PerformanceEvaluation =
  | Readonly<{
      verdict: 'blocked';
      comparable: false;
      environmentDigest: string;
      expectedEnvironmentDigest: string;
      samplingDigest: string;
      reasonCode: string;
      metrics: readonly [];
    }>
  | Readonly<{
      verdict: 'view-only';
      comparable: false;
      environmentDigest: string;
      expectedEnvironmentDigest: string;
      samplingDigest: string;
      incompatibleFields: readonly PerformanceEnvironmentField[];
      metrics: readonly NormalizedPerformanceMetric[];
    }>
  | Readonly<{
      verdict: 'passed' | 'failed';
      comparable: true;
      environmentDigest: string;
      expectedEnvironmentDigest: string;
      samplingDigest: string;
      metrics: readonly NormalizedPerformanceMetric[];
    }>;

const normalizeEnvironment = (
  input: PerformanceEnvironmentProfile,
  path: string
): PerformanceEnvironmentProfile => {
  const decoded = decodePrivateJson(input, 'Performance environment');
  const environment = strictObject(decoded, path, [
    'machineClass',
    'operatingSystemImageDigest',
    'browserImageDigest',
    'browserEngine',
    'browserVersion',
    'fontSetDigest',
    'viewport',
    'colorScheme',
    'motionPreference',
    'locale',
    'cacheClass',
  ]);
  const viewport = strictObject(environment.viewport, `${path}.viewport`, [
    'widthCssPixels',
    'heightCssPixels',
    'devicePixelRatio',
  ]);
  return Object.freeze({
    machineClass: strictIdentifier(
      environment.machineClass,
      `${path}.machineClass`
    ),
    operatingSystemImageDigest: strictSha256Digest(
      environment.operatingSystemImageDigest,
      `${path}.operatingSystemImageDigest`
    ),
    browserImageDigest: strictSha256Digest(
      environment.browserImageDigest,
      `${path}.browserImageDigest`
    ),
    browserEngine: strictEnum(
      environment.browserEngine,
      `${path}.browserEngine`,
      ['chromium', 'firefox', 'webkit'] as const
    ),
    browserVersion: strictString(
      environment.browserVersion,
      `${path}.browserVersion`,
      64
    ),
    fontSetDigest: strictSha256Digest(
      environment.fontSetDigest,
      `${path}.fontSetDigest`
    ),
    viewport: Object.freeze({
      widthCssPixels: strictSafeInteger(
        viewport.widthCssPixels,
        `${path}.viewport.widthCssPixels`,
        { minimum: 1, maximum: 32_768 }
      ),
      heightCssPixels: strictSafeInteger(
        viewport.heightCssPixels,
        `${path}.viewport.heightCssPixels`,
        { minimum: 1, maximum: 32_768 }
      ),
      devicePixelRatio: strictFiniteNumber(
        viewport.devicePixelRatio,
        `${path}.viewport.devicePixelRatio`,
        { minimum: 0.25, maximum: 8 }
      ),
    }),
    colorScheme: strictEnum(environment.colorScheme, `${path}.colorScheme`, [
      'light',
      'dark',
    ] as const),
    motionPreference: strictEnum(
      environment.motionPreference,
      `${path}.motionPreference`,
      ['full', 'reduced'] as const
    ),
    locale: strictIdentifier(environment.locale, `${path}.locale`),
    cacheClass: strictEnum(environment.cacheClass, `${path}.cacheClass`, [
      'cold',
      'warm',
    ] as const),
  });
};

export const createPerformanceEnvironmentDigest = (
  environment: PerformanceEnvironmentProfile
): string =>
  digestVerificationValue({
    kind: 'browser-performance-environment',
    version: 1,
    environment: normalizeEnvironment(environment, '$'),
  });

const metricIds = Object.freeze(
  Object.keys(PERFORMANCE_METRIC_UNITS).sort(
    compareVerificationText
  ) as PerformanceMetricId[]
);

const decodeSample = (value: unknown, index: number): PerformanceSample => {
  const path = `$.samples[${index}]`;
  const sample = strictObject(value, path, ['sampleId', 'metrics']);
  const metrics = strictArray(
    sample.metrics,
    `${path}.metrics`,
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumMetricsPerSample
  ).map((value, metricIndex) => {
    const metricPath = `${path}.metrics[${metricIndex}]`;
    const metric = strictObject(value, metricPath, [
      'metricId',
      'unit',
      'value',
    ]);
    const metricId = strictEnum(
      metric.metricId,
      `${metricPath}.metricId`,
      metricIds
    );
    const expectedUnit = PERFORMANCE_METRIC_UNITS[metricId];
    const unit = strictEnum(metric.unit, `${metricPath}.unit`, [
      expectedUnit,
    ] as const);
    return Object.freeze({
      metricId,
      unit,
      value: strictFiniteNumber(metric.value, `${metricPath}.value`, {
        minimum: 0,
      }),
    });
  });
  if (metrics.length === 0) {
    throwPartial(
      `${path}.metrics`,
      `${path} must contain at least one performance metric.`
    );
  }
  assertUniqueIdentities(
    metrics,
    ({ metricId }) => metricId,
    `${path}.metrics`
  );
  return Object.freeze({
    sampleId: strictIdentifier(sample.sampleId, `${path}.sampleId`),
    metrics: Object.freeze(
      [...metrics].sort((left, right) =>
        compareVerificationText(left.metricId, right.metricId)
      )
    ),
  });
};

export const decodePerformancePayload = (
  source: string | Uint8Array | unknown
): DecodedPerformancePayload => {
  const decoded = decodePrivateJson(source, 'browser performance report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'complete',
    'profileDigest',
    'environment',
    'warmupRuns',
    'samples',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.browser-performance-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'Browser performance report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'Browser performance report is partial and cannot be normalized.'
    );
  }
  const tool = strictObject(root.tool, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  const samples = strictArray(
    root.samples,
    '$.samples',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumPerformanceSamples
  ).map(decodeSample);
  if (samples.length === 0) {
    throwPartial(
      '$.samples',
      'Browser performance report did not contain any measured samples.'
    );
  }
  assertUniqueIdentities(samples, ({ sampleId }) => sampleId, '$.samples');
  return Object.freeze({
    format: 'prodivix.browser-performance-report',
    version: 1,
    tool: Object.freeze({
      name: strictEnum(tool.name, '$.tool.name', ['playwright'] as const),
      version: strictString(tool.version, '$.tool.version', 64),
      schemaDigest: strictSha256Digest(
        tool.schemaDigest,
        '$.tool.schemaDigest'
      ),
    }),
    profileDigest: strictSha256Digest(root.profileDigest, '$.profileDigest'),
    environment: normalizeEnvironment(
      root.environment as PerformanceEnvironmentProfile,
      '$.environment'
    ),
    warmupRuns: strictSafeInteger(root.warmupRuns, '$.warmupRuns', {
      minimum: 0,
      maximum: 20,
    }),
    samples: Object.freeze(
      [...samples].sort((left, right) =>
        compareVerificationText(left.sampleId, right.sampleId)
      )
    ),
  });
};

const normalizePolicy = (
  input: PerformancePolicyProfile
): PerformancePolicyProfile => {
  const policy = strictObject(input, '$.policy', [
    'expectedEnvironment',
    'sampling',
    'thresholds',
  ]);
  const sampling = strictObject(policy.sampling, '$.policy.sampling', [
    'warmupRuns',
    'sampleCount',
    'statistic',
  ]);
  const thresholds = strictArray(
    policy.thresholds,
    '$.policy.thresholds',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumMetricsPerSample
  ).map((value, index) => {
    const path = `$.policy.thresholds[${index}]`;
    const threshold = strictObject(value, path, [
      'metricId',
      'unit',
      'operator',
      'threshold',
    ]);
    const metricId = strictEnum(
      threshold.metricId,
      `${path}.metricId`,
      metricIds
    );
    const expectedUnit = PERFORMANCE_METRIC_UNITS[metricId];
    return Object.freeze({
      metricId,
      unit: strictEnum(threshold.unit, `${path}.unit`, [expectedUnit] as const),
      operator: strictEnum(threshold.operator, `${path}.operator`, [
        'less-than-or-equal',
        'greater-than-or-equal',
      ] as const),
      threshold: strictFiniteNumber(threshold.threshold, `${path}.threshold`, {
        minimum: 0,
      }),
    });
  });
  if (thresholds.length === 0) {
    throwPartial(
      '$.policy.thresholds',
      'Performance policy must declare at least one threshold.'
    );
  }
  assertUniqueIdentities(
    thresholds,
    ({ metricId }) => metricId,
    '$.policy.thresholds'
  );
  return Object.freeze({
    expectedEnvironment: normalizeEnvironment(
      policy.expectedEnvironment as PerformanceEnvironmentProfile,
      '$.policy.expectedEnvironment'
    ),
    sampling: Object.freeze({
      warmupRuns: strictSafeInteger(
        sampling.warmupRuns,
        '$.policy.sampling.warmupRuns',
        { minimum: 0, maximum: 20 }
      ),
      sampleCount: strictSafeInteger(
        sampling.sampleCount,
        '$.policy.sampling.sampleCount',
        {
          minimum: 1,
          maximum: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumPerformanceSamples,
        }
      ),
      statistic: strictEnum(sampling.statistic, '$.policy.sampling.statistic', [
        'median',
        'p75',
        'p95',
        'maximum',
      ] as const),
    }),
    thresholds: Object.freeze(
      [...thresholds].sort((left, right) =>
        compareVerificationText(left.metricId, right.metricId)
      )
    ),
  });
};

export const createPerformancePolicyDigest = (
  policy: PerformancePolicyProfile
): string =>
  digestVerificationValue({
    kind: 'browser-performance-policy',
    version: 1,
    policy: normalizePolicy(policy),
  });

export const createPerformanceSamplingDigest = (
  sampling: PerformancePolicyProfile['sampling']
): string => {
  const value = strictObject(sampling, '$.sampling', [
    'warmupRuns',
    'sampleCount',
    'statistic',
  ]);
  return digestVerificationValue({
    kind: 'browser-performance-sampling',
    version: 1,
    warmupRuns: strictSafeInteger(value.warmupRuns, '$.sampling.warmupRuns', {
      minimum: 0,
      maximum: 20,
    }),
    sampleCount: strictSafeInteger(
      value.sampleCount,
      '$.sampling.sampleCount',
      {
        minimum: 1,
        maximum: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumPerformanceSamples,
      }
    ),
    statistic: strictEnum(value.statistic, '$.sampling.statistic', [
      'median',
      'p75',
      'p95',
      'maximum',
    ] as const),
  });
};

const environmentDifferences = (
  expected: PerformanceEnvironmentProfile,
  actual: PerformanceEnvironmentProfile
): readonly PerformanceEnvironmentField[] => {
  const differences: PerformanceEnvironmentField[] = [];
  if (expected.machineClass !== actual.machineClass) {
    differences.push('machine-class');
  }
  if (
    expected.operatingSystemImageDigest !== actual.operatingSystemImageDigest
  ) {
    differences.push('os-image');
  }
  if (expected.browserImageDigest !== actual.browserImageDigest) {
    differences.push('browser-image');
  }
  if (expected.browserEngine !== actual.browserEngine) {
    differences.push('browser-engine');
  }
  if (expected.browserVersion !== actual.browserVersion) {
    differences.push('browser-version');
  }
  if (expected.fontSetDigest !== actual.fontSetDigest) {
    differences.push('font');
  }
  if (
    expected.viewport.widthCssPixels !== actual.viewport.widthCssPixels ||
    expected.viewport.heightCssPixels !== actual.viewport.heightCssPixels
  ) {
    differences.push('viewport');
  }
  if (expected.viewport.devicePixelRatio !== actual.viewport.devicePixelRatio) {
    differences.push('dpr');
  }
  if (expected.colorScheme !== actual.colorScheme) differences.push('color');
  if (expected.motionPreference !== actual.motionPreference) {
    differences.push('motion');
  }
  if (expected.locale !== actual.locale) differences.push('locale');
  if (expected.cacheClass !== actual.cacheClass) differences.push('cache');
  return Object.freeze(differences.sort(compareVerificationText));
};

const aggregate = (
  values: readonly number[],
  statistic: PerformanceStatistic
): number => {
  const ordered = [...values].sort((left, right) => left - right);
  if (statistic === 'maximum') return ordered.at(-1)!;
  if (statistic === 'median') {
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 === 1
      ? ordered[middle]!
      : ordered[middle - 1]! / 2 + ordered[middle]! / 2;
  }
  const percentile = statistic === 'p75' ? 0.75 : 0.95;
  return ordered[Math.max(0, Math.ceil(ordered.length * percentile) - 1)]!;
};

export const evaluatePerformance = (
  report: DecodedPerformancePayload,
  policyInput: PerformancePolicyProfile
): PerformanceEvaluation => {
  const policy = normalizePolicy(policyInput);
  const environmentDigest = createPerformanceEnvironmentDigest(
    report.environment
  );
  const expectedEnvironmentDigest = createPerformanceEnvironmentDigest(
    policy.expectedEnvironment
  );
  const samplingDigest = createPerformanceSamplingDigest(policy.sampling);
  if (report.profileDigest !== createPerformancePolicyDigest(policy)) {
    return Object.freeze({
      verdict: 'blocked',
      comparable: false,
      environmentDigest,
      expectedEnvironmentDigest,
      samplingDigest,
      reasonCode: 'VER-PERF-POLICY-DIGEST-MISMATCH',
      metrics: Object.freeze([]) as readonly [],
    });
  }
  if (
    report.warmupRuns !== policy.sampling.warmupRuns ||
    report.samples.length !== policy.sampling.sampleCount
  ) {
    return Object.freeze({
      verdict: 'blocked',
      comparable: false,
      environmentDigest,
      expectedEnvironmentDigest,
      samplingDigest,
      reasonCode: 'VER-PERF-SAMPLING-MISMATCH',
      metrics: Object.freeze([]) as readonly [],
    });
  }
  const valuesByMetric = new Map<PerformanceMetricId, number[]>();
  for (const threshold of policy.thresholds) {
    valuesByMetric.set(threshold.metricId, []);
  }
  for (const sample of report.samples) {
    const sampleMetrics = new Map(
      sample.metrics.map((metric) => [metric.metricId, metric] as const)
    );
    for (const threshold of policy.thresholds) {
      const metric = sampleMetrics.get(threshold.metricId);
      if (metric === undefined || metric.unit !== threshold.unit) {
        return Object.freeze({
          verdict: 'blocked',
          comparable: false,
          environmentDigest,
          expectedEnvironmentDigest,
          samplingDigest,
          reasonCode: 'VER-PERF-METRIC-PARTIAL',
          metrics: Object.freeze([]) as readonly [],
        });
      }
      valuesByMetric.get(threshold.metricId)!.push(metric.value);
    }
  }
  const incompatibleFields = environmentDifferences(
    policy.expectedEnvironment,
    report.environment
  );
  const metrics = policy.thresholds.map((threshold) => {
    const value = aggregate(
      valuesByMetric.get(threshold.metricId)!,
      policy.sampling.statistic
    );
    const passed =
      threshold.operator === 'less-than-or-equal'
        ? value <= threshold.threshold
        : value >= threshold.threshold;
    return Object.freeze({
      ...threshold,
      statistic: policy.sampling.statistic,
      value,
      sampleCount: report.samples.length,
      status:
        incompatibleFields.length > 0
          ? ('view-only' as const)
          : passed
            ? ('passed' as const)
            : ('failed' as const),
    });
  });
  if (incompatibleFields.length > 0) {
    return Object.freeze({
      verdict: 'view-only',
      comparable: false,
      environmentDigest,
      expectedEnvironmentDigest,
      samplingDigest,
      incompatibleFields,
      metrics: Object.freeze(metrics),
    });
  }
  return Object.freeze({
    verdict: metrics.some(({ status }) => status === 'failed')
      ? 'failed'
      : 'passed',
    comparable: true,
    environmentDigest,
    expectedEnvironmentDigest,
    samplingDigest,
    metrics: Object.freeze(metrics),
  });
};
