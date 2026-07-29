import { describe, expect, it } from 'vitest';
import {
  decodeVerificationCoverageSummary,
  projectVerificationCoverageSummary,
} from './coverageSummaryProjection';
import { createVerificationArtifactProjectionSourceResolver } from './verificationArtifactProjectionSource';

const providerRoot = '/provider/coverage-project';
const sourcePath = 'src/App.ts';
const subjectDigest =
  'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sourceTrace = Object.freeze([
  Object.freeze({
    sourceRef: Object.freeze({
      kind: 'workspace' as const,
      workspaceId: 'workspace:coverage-projection',
    }),
    label: 'Coverage projection source',
  }),
]);
const emptyMetric = Object.freeze({
  total: 0,
  covered: 0,
  skipped: 0,
  pct: 100,
});

const projectEmptyCoverage = (branchesTruePct: unknown) =>
  projectVerificationCoverageSummary({
    source: JSON.stringify({
      total: {
        branches: emptyMetric,
        functions: emptyMetric,
        lines: emptyMetric,
        statements: emptyMetric,
        branchesTrue: {
          total: 0,
          covered: 0,
          skipped: 0,
          pct: branchesTruePct,
        },
      },
      [`${providerRoot}/${sourcePath}`]: {
        branches: emptyMetric,
        functions: emptyMetric,
        lines: emptyMetric,
        statements: emptyMetric,
      },
    }),
    subjectDigest,
    sourceResolver: createVerificationArtifactProjectionSourceResolver(
      providerRoot,
      [{ path: sourcePath, sourceTrace }]
    ),
  });

describe('verification coverage summary projection', () => {
  it('accepts the reporter Unknown percentage only for an empty auxiliary metric', () => {
    const projected = projectEmptyCoverage('Unknown');
    const decoded = decodeVerificationCoverageSummary(projected.bytes);

    expect(decoded).toEqual(projected.value);
    expect(decoded.aggregate.branches).toEqual({
      total: 0,
      covered: 0,
      skipped: 0,
    });
    expect(decoded.sources).toEqual([
      {
        path: sourcePath,
        sourceTrace,
        counts: {
          branches: { total: 0, covered: 0, skipped: 0 },
          functions: { total: 0, covered: 0, skipped: 0 },
          lines: { total: 0, covered: 0, skipped: 0 },
          statements: { total: 0, covered: 0, skipped: 0 },
        },
      },
    ]);
    expect(
      JSON.parse(new TextDecoder().decode(projected.bytes))
    ).not.toHaveProperty('aggregate.branchesTrue');
  });

  it('rejects Unknown for a non-empty metric and rejects other strings', () => {
    expect(() =>
      projectVerificationCoverageSummary({
        source: JSON.stringify({
          total: {
            branches: emptyMetric,
            functions: emptyMetric,
            lines: emptyMetric,
            statements: emptyMetric,
            branchesTrue: {
              total: 1,
              covered: 0,
              skipped: 0,
              pct: 'Unknown',
            },
          },
          [`${providerRoot}/${sourcePath}`]: {
            branches: emptyMetric,
            functions: emptyMetric,
            lines: emptyMetric,
            statements: emptyMetric,
          },
        }),
        subjectDigest,
        sourceResolver: createVerificationArtifactProjectionSourceResolver(
          providerRoot,
          [{ path: sourcePath, sourceTrace }]
        ),
      })
    ).toThrow(/may be Unknown only when all counts are zero/u);
    expect(() => projectEmptyCoverage('unknown')).toThrow(
      /must be a finite percentage/u
    );
  });
});
