import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  VERIFICATION_ARTIFACT_PROJECTION_LIMITS,
  decodePublicVerificationArtifactProjection,
  decodeVerificationArtifactProjectionSource,
  encodePublicVerificationArtifactProjection,
  readVerificationProjectionExactRecord,
  readVerificationProjectionRelativePath,
  readVerificationProjectionSafeInteger,
  readVerificationProjectionSourceTraces,
  type VerificationArtifactProjectionSourceIdentity,
  type VerificationArtifactProjectionSourceResolver,
} from './verificationArtifactProjectionSource';

export const VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE =
  'application/vnd.prodivix.verification-coverage-summary+json' as const;

export const VERIFICATION_COVERAGE_SUMMARY_FORMAT =
  'prodivix.verification-coverage-summary.v1' as const;

const COVERAGE_METRIC_NAMES = Object.freeze([
  'branches',
  'functions',
  'lines',
  'statements',
] as const);
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const readDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return value;
};

type CoverageMetricName = (typeof COVERAGE_METRIC_NAMES)[number];

export type VerificationCoverageCounts = Readonly<{
  total: number;
  covered: number;
  skipped: number;
}>;

export type VerificationCoverageSource = Readonly<{
  path: string;
  sourceTrace: VerificationArtifactProjectionSourceIdentity['sourceTrace'];
  counts: Readonly<Record<CoverageMetricName, VerificationCoverageCounts>>;
}>;

export type VerificationCoverageSummary = Readonly<{
  format: typeof VERIFICATION_COVERAGE_SUMMARY_FORMAT;
  subjectDigest: string;
  aggregate: Readonly<Record<CoverageMetricName, VerificationCoverageCounts>>;
  sources: readonly VerificationCoverageSource[];
}>;

export type ProjectVerificationCoverageSummaryInput = Readonly<{
  source: string | Uint8Array;
  subjectDigest: string;
  sourceResolver: VerificationArtifactProjectionSourceResolver;
}>;

export type ProjectedVerificationCoverageSummary = Readonly<{
  mediaType: typeof VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE;
  value: VerificationCoverageSummary;
  bytes: Uint8Array;
}>;

const readPercentage = (value: unknown, label: string): void => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new TypeError(`${label} must be a finite percentage.`);
  }
};

const readCoverageCounts = (
  value: unknown,
  label: string
): VerificationCoverageCounts => {
  const record = readVerificationProjectionExactRecord(
    value,
    ['total', 'covered', 'skipped', 'pct'],
    [],
    label
  );
  const total = readVerificationProjectionSafeInteger(
    record.total,
    `${label}.total`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  const covered = readVerificationProjectionSafeInteger(
    record.covered,
    `${label}.covered`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  const skipped = readVerificationProjectionSafeInteger(
    record.skipped,
    `${label}.skipped`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  if (record.pct === 'Unknown') {
    if (total !== 0 || covered !== 0 || skipped !== 0) {
      throw new TypeError(
        `${label}.pct may be Unknown only when all counts are zero.`
      );
    }
  } else {
    readPercentage(record.pct, `${label}.pct`);
  }
  if (covered > total || skipped > total || covered + skipped > total) {
    throw new TypeError(`${label} counts are internally inconsistent.`);
  }
  return Object.freeze({ total, covered, skipped });
};

const readCoverageMetricSet = (
  value: unknown,
  label: string,
  allowBranchesTrue: boolean
): Readonly<Record<CoverageMetricName, VerificationCoverageCounts>> => {
  const record = readVerificationProjectionExactRecord(
    value,
    COVERAGE_METRIC_NAMES,
    allowBranchesTrue ? ['branchesTrue'] : [],
    label
  );
  if (record.branchesTrue !== undefined) {
    readCoverageCounts(record.branchesTrue, `${label}.branchesTrue`);
  }
  return Object.freeze(
    Object.fromEntries(
      COVERAGE_METRIC_NAMES.map((metric) => [
        metric,
        readCoverageCounts(record[metric], `${label}.${metric}`),
      ])
    ) as Record<CoverageMetricName, VerificationCoverageCounts>
  );
};

const addCounts = (
  left: VerificationCoverageCounts,
  right: VerificationCoverageCounts
): VerificationCoverageCounts => {
  const total = left.total + right.total;
  const covered = left.covered + right.covered;
  const skipped = left.skipped + right.skipped;
  if (
    total > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount ||
    covered > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount ||
    skipped > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  ) {
    throw new TypeError('Coverage aggregate exceeds its count budget.');
  }
  return Object.freeze({ total, covered, skipped });
};

const emptyAggregate = (): Record<
  CoverageMetricName,
  VerificationCoverageCounts
> => ({
  branches: Object.freeze({ total: 0, covered: 0, skipped: 0 }),
  functions: Object.freeze({ total: 0, covered: 0, skipped: 0 }),
  lines: Object.freeze({ total: 0, covered: 0, skipped: 0 }),
  statements: Object.freeze({ total: 0, covered: 0, skipped: 0 }),
});

const sameCounts = (
  left: VerificationCoverageCounts,
  right: VerificationCoverageCounts
): boolean =>
  left.total === right.total &&
  left.covered === right.covered &&
  left.skipped === right.skipped;

const readProjectedCounts = (
  value: unknown,
  label: string
): VerificationCoverageCounts => {
  const record = readVerificationProjectionExactRecord(
    value,
    ['total', 'covered', 'skipped'],
    [],
    label
  );
  const total = readVerificationProjectionSafeInteger(
    record.total,
    `${label}.total`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  const covered = readVerificationProjectionSafeInteger(
    record.covered,
    `${label}.covered`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  const skipped = readVerificationProjectionSafeInteger(
    record.skipped,
    `${label}.skipped`,
    0,
    VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  );
  if (covered > total || skipped > total || covered + skipped > total) {
    throw new TypeError(`${label} counts are internally inconsistent.`);
  }
  return Object.freeze({ total, covered, skipped });
};

const readProjectedMetricSet = (
  value: unknown,
  label: string
): Readonly<Record<CoverageMetricName, VerificationCoverageCounts>> => {
  const record = readVerificationProjectionExactRecord(
    value,
    COVERAGE_METRIC_NAMES,
    [],
    label
  );
  return Object.freeze(
    Object.fromEntries(
      COVERAGE_METRIC_NAMES.map((metric) => [
        metric,
        readProjectedCounts(record[metric], `${label}.${metric}`),
      ])
    ) as Record<CoverageMetricName, VerificationCoverageCounts>
  );
};

export const decodeVerificationCoverageSummary = (
  bytes: Uint8Array
): VerificationCoverageSummary => {
  const record = readVerificationProjectionExactRecord(
    decodePublicVerificationArtifactProjection(
      bytes,
      'Canonical coverage summary'
    ),
    ['format', 'subjectDigest', 'aggregate', 'sources'],
    [],
    'Canonical coverage summary'
  );
  if (record.format !== VERIFICATION_COVERAGE_SUMMARY_FORMAT) {
    throw new TypeError('Canonical coverage summary format is unsupported.');
  }
  const declaredAggregate = readProjectedMetricSet(
    record.aggregate,
    'Canonical coverage summary aggregate'
  );
  if (
    !Array.isArray(record.sources) ||
    record.sources.length === 0 ||
    record.sources.length >
      VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumSources
  ) {
    throw new TypeError(
      'Canonical coverage summary sources must be a non-empty bounded array.'
    );
  }
  const aggregate = emptyAggregate();
  let previousPath: string | undefined;
  const sources = record.sources.map(
    (entry, index): VerificationCoverageSource => {
      const source = readVerificationProjectionExactRecord(
        entry,
        ['path', 'sourceTrace', 'counts'],
        [],
        `Canonical coverage summary sources[${index}]`
      );
      const path = readVerificationProjectionRelativePath(
        source.path,
        `Canonical coverage summary sources[${index}].path`
      );
      if (
        previousPath !== undefined &&
        compareUnicodeCodePoints(previousPath, path) >= 0
      ) {
        throw new TypeError(
          'Canonical coverage summary sources must be uniquely sorted.'
        );
      }
      previousPath = path;
      const counts = readProjectedMetricSet(
        source.counts,
        `Canonical coverage summary sources[${index}].counts`
      );
      for (const metric of COVERAGE_METRIC_NAMES) {
        aggregate[metric] = addCounts(aggregate[metric], counts[metric]);
      }
      return Object.freeze({
        path,
        sourceTrace: readVerificationProjectionSourceTraces(
          source.sourceTrace,
          `Canonical coverage summary sources[${index}].sourceTrace`
        ),
        counts,
      });
    }
  );
  for (const metric of COVERAGE_METRIC_NAMES) {
    if (!sameCounts(declaredAggregate[metric], aggregate[metric])) {
      throw new TypeError(
        `Canonical coverage summary ${metric} aggregate does not match its sources.`
      );
    }
  }
  return Object.freeze({
    format: VERIFICATION_COVERAGE_SUMMARY_FORMAT,
    subjectDigest: readDigest(
      record.subjectDigest,
      'Canonical coverage summary subjectDigest'
    ),
    aggregate: declaredAggregate,
    sources: Object.freeze(sources),
  });
};

/**
 * Converts the private JSON-summary reporter schema into a bounded,
 * provider-independent coverage artifact. Reporter percentages and auxiliary
 * fields are validated but never cross the projection boundary.
 */
export const projectVerificationCoverageSummary = (
  input: ProjectVerificationCoverageSummaryInput
): ProjectedVerificationCoverageSummary => {
  const decoded = decodeVerificationArtifactProjectionSource(
    input.source,
    'Coverage summary'
  );
  let raw: unknown;
  try {
    raw = JSON.parse(decoded) as unknown;
  } catch {
    throw new TypeError('Coverage summary must be valid JSON.');
  }
  if (!isPlainObject(raw)) {
    throw new TypeError('Coverage summary must be a plain object.');
  }
  const keys = Object.keys(raw);
  if (
    !keys.includes('total') ||
    keys.length <= 1 ||
    keys.length - 1 > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumSources ||
    keys.some(isUnsafeObjectKey)
  ) {
    throw new TypeError(
      'Coverage summary must contain a bounded set of safe source entries.'
    );
  }

  const declaredAggregate = readCoverageMetricSet(
    raw.total,
    'Coverage summary total',
    true
  );
  const aggregate = emptyAggregate();
  const seenPaths = new Set<string>();
  const sources = keys
    .filter((key) => key !== 'total')
    .map((reportedPath, index): VerificationCoverageSource => {
      const identity = input.sourceResolver.resolve(reportedPath);
      if (seenPaths.has(identity.path)) {
        throw new TypeError(
          `Coverage summary maps multiple reporter entries to ${identity.path}.`
        );
      }
      seenPaths.add(identity.path);
      const counts = readCoverageMetricSet(
        raw[reportedPath],
        `Coverage summary source[${index}]`,
        false
      );
      for (const metric of COVERAGE_METRIC_NAMES) {
        aggregate[metric] = addCounts(aggregate[metric], counts[metric]);
      }
      return Object.freeze({
        path: identity.path,
        sourceTrace: identity.sourceTrace,
        counts,
      });
    })
    .sort((left, right) => compareUnicodeCodePoints(left.path, right.path));

  for (const metric of COVERAGE_METRIC_NAMES) {
    if (!sameCounts(declaredAggregate[metric], aggregate[metric])) {
      throw new TypeError(
        `Coverage summary ${metric} aggregate does not match its mapped sources.`
      );
    }
  }
  const value: VerificationCoverageSummary = Object.freeze({
    format: VERIFICATION_COVERAGE_SUMMARY_FORMAT,
    subjectDigest: readDigest(
      input.subjectDigest,
      'Coverage summary subjectDigest'
    ),
    aggregate: Object.freeze(aggregate),
    sources: Object.freeze(sources),
  });
  const bytes = encodePublicVerificationArtifactProjection(
    value,
    'Canonical coverage summary'
  );
  decodeVerificationCoverageSummary(bytes);
  return Object.freeze({
    mediaType: VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
    value,
    bytes,
  });
};
