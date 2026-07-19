import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createExecutionTestReport,
  EXECUTION_TEST_REPORT_LIMITS,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  isExecutionTestReport,
  readExecutionTestReportValue,
  toExecutionTestReportValue,
  type ExecutionSourceTrace,
  type ExecutionTestStatus,
} from '..';

const statuses = ['passed', 'failed', 'skipped', 'todo'] as const;

const expectDeepFrozen = (value: unknown, seen = new Set<object>()): void => {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach((entry) => expectDeepFrozen(entry, seen));
};

const createReportWithSourceSpan = (
  sourceSpan: NonNullable<ExecutionSourceTrace['sourceSpan']>
) =>
  createExecutionTestReport({
    reportId: 'source-span-report',
    tool: { name: 'portable-test-runner' },
    files: [
      {
        fileId: 'source-span-file',
        path: 'tests/source-span.test.ts',
        status: 'passed',
        cases: [
          {
            caseId: 'source-span-case',
            name: 'preserves source location',
            status: 'passed',
            sourceTrace: [
              {
                sourceRef: {
                  kind: 'code-artifact',
                  artifactId: sourceSpan.artifactId,
                },
                sourceSpan,
              },
            ],
          },
        ],
      },
    ],
  });

describe('execution test report properties', () => {
  it('derives canonical summaries and recursively freezes arbitrary results', () => {
    expect(EXECUTION_TEST_REPORT_TRACE_NAME).toBe('test.report');

    fc.assert(
      fc.property(
        fc.array(fc.array(fc.constantFrom(...statuses), { maxLength: 12 }), {
          maxLength: 8,
        }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (fileStatuses, startedAt, elapsedMs) => {
          const report = createExecutionTestReport({
            reportId: 'report-1',
            tool: { name: 'portable-test-runner', version: '1.0.0' },
            startedAt,
            completedAt: startedAt + elapsedMs,
            files: fileStatuses.map((caseStatuses, fileIndex) => {
              const fileFailed = caseStatuses.includes('failed');
              const fileStatus: ExecutionTestStatus = fileFailed
                ? 'failed'
                : (caseStatuses[0] ?? 'passed');
              return {
                fileId: `file-${fileIndex}`,
                path: `tests/file-${fileIndex}.test.ts`,
                status: fileStatus,
                cases: caseStatuses.map((status, caseIndex) => ({
                  caseId: `case-${caseIndex}`,
                  name: `case ${caseIndex}`,
                  fullName: `file ${fileIndex} case ${caseIndex}`,
                  status,
                  durationMs: caseIndex,
                  ...(status === 'failed'
                    ? { failureMessages: [`failure ${caseIndex}`] }
                    : {}),
                  sourceTrace: [
                    {
                      sourceRef: {
                        kind: 'code-artifact' as const,
                        artifactId: `artifact-${fileIndex}`,
                      },
                      label: `case ${caseIndex}`,
                    },
                  ],
                })),
              };
            }),
          });

          const flattenedStatuses = fileStatuses.flat();
          expect(report.summary).toMatchObject({
            totalFiles: fileStatuses.length,
            totalCases: flattenedStatuses.length,
            passedCases: flattenedStatuses.filter(
              (status) => status === 'passed'
            ).length,
            failedCases: flattenedStatuses.filter(
              (status) => status === 'failed'
            ).length,
            skippedCases: flattenedStatuses.filter(
              (status) => status === 'skipped'
            ).length,
            todoCases: flattenedStatuses.filter((status) => status === 'todo')
              .length,
          });
          expect(report.durationMs).toBe(elapsedMs);
          expect(report.status).toBe(
            flattenedStatuses.includes('failed') ? 'failed' : 'passed'
          );
          expectDeepFrozen(report);

          const value = toExecutionTestReportValue(report);
          expect(readExecutionTestReportValue(value)).toEqual(report);

          const transported = JSON.parse(JSON.stringify(value)) as Record<
            string,
            unknown
          >;
          expect(isExecutionTestReport(transported)).toBe(true);
          expect(readExecutionTestReportValue(transported)).toEqual(report);
          transported.summary = {
            ...(transported.summary as Record<string, unknown>),
            totalCases: flattenedStatuses.length + 1,
          };
          expect(isExecutionTestReport(transported)).toBe(false);
          expect(readExecutionTestReportValue(transported)).toBeUndefined();
        }
      ),
      { numRuns: 80, seed: 0x20_26_07_15 }
    );
  });

  it('accepts only one-based ordered source spans across transport', () => {
    fc.assert(
      fc.property(
        fc.record({
          startLine: fc.integer({ min: 1, max: 1_000 }),
          startColumn: fc.integer({ min: 1, max: 1_000 }),
          lineDelta: fc.integer({ min: 0, max: 20 }),
          columnValue: fc.integer({ min: 1, max: 1_000 }),
        }),
        ({ startLine, startColumn, lineDelta, columnValue }) => {
          const report = createReportWithSourceSpan({
            artifactId: 'artifact-source',
            startLine,
            startColumn,
            endLine: startLine + lineDelta,
            endColumn:
              lineDelta === 0 ? startColumn + columnValue : columnValue,
          });
          expect(
            readExecutionTestReportValue(toExecutionTestReportValue(report))
          ).toEqual(report);
        }
      ),
      { numRuns: 40, seed: 0x20_26_07_16 }
    );

    const invalidSpans: NonNullable<ExecutionSourceTrace['sourceSpan']>[] = [
      {
        artifactId: 'artifact-source',
        startLine: 0,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      {
        artifactId: 'artifact-source',
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 1,
      },
      {
        artifactId: 'artifact-source',
        startLine: 2,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      {
        artifactId: 'artifact-source',
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 1,
      },
    ];
    invalidSpans.forEach((sourceSpan) => {
      expect(() => createReportWithSourceSpan(sourceSpan)).toThrow(
        'invalid sourceSpan'
      );
    });
  });

  it('rejects unknown private fields and enforces canonical transport budgets', () => {
    const report = createExecutionTestReport({
      reportId: 'strict-report',
      tool: { name: 'portable-test-runner' },
      files: [
        {
          fileId: 'strict-file',
          path: 'tests/strict.test.ts',
          status: 'passed',
          cases: [
            {
              caseId: 'strict-case',
              name: 'stays transport neutral',
              status: 'passed',
              sourceTrace: [
                {
                  sourceRef: {
                    kind: 'code-artifact',
                    artifactId: 'artifact-strict',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const withPrivateAttachment = JSON.parse(JSON.stringify(report)) as Record<
      string,
      unknown
    >;
    withPrivateAttachment.attachments = [
      { url: 'https://runner.invalid/private-output' },
    ];
    expect(readExecutionTestReportValue(withPrivateAttachment)).toBeUndefined();

    const withPrivateTraceField = JSON.parse(JSON.stringify(report)) as Record<
      string,
      unknown
    >;
    const files = withPrivateTraceField.files as Record<string, unknown>[];
    const cases = files[0]!.cases as Record<string, unknown>[];
    const traces = cases[0]!.sourceTrace as Record<string, unknown>[];
    traces[0]!.principal = 'must-not-cross-the-boundary';
    expect(readExecutionTestReportValue(withPrivateTraceField)).toBeUndefined();

    expect(() =>
      createExecutionTestReport({
        reportId: 'too-many-files',
        tool: { name: 'portable-test-runner' },
        files: Array.from(
          { length: EXECUTION_TEST_REPORT_LIMITS.maxFiles + 1 },
          (_, index) => ({
            fileId: `file-${index}`,
            path: `tests/file-${index}.test.ts`,
            status: 'passed' as const,
            cases: [],
          })
        ),
      })
    ).toThrow('file limit');

    expect(() =>
      createExecutionTestReport({
        reportId: 'too-many-source-traces',
        tool: { name: 'portable-test-runner' },
        files: [
          {
            fileId: 'trace-file',
            path: 'tests/trace.test.ts',
            status: 'passed',
            cases: [
              {
                caseId: 'trace-case',
                name: 'bounded trace',
                status: 'passed',
                sourceTrace: Array.from(
                  {
                    length:
                      EXECUTION_TEST_REPORT_LIMITS.maxSourceTracePerOwner + 1,
                  },
                  (_, index) => ({
                    sourceRef: {
                      kind: 'code-artifact' as const,
                      artifactId: `artifact-${index}`,
                    },
                  })
                ),
              },
            ],
          },
        ],
      })
    ).toThrow('sourceTrace');
  });
});
