import { describe, expect, it } from 'vitest';
import {
  VITEST_EXECUTION_TEST_REPORT_LIMITS,
  parseVitestExecutionTestReport as parseRawVitestExecutionTestReport,
  type ParseVitestExecutionTestReportInput,
} from './vitestExecutionTestReport';

const resolveWorkspaceFileIdentity = (reportedPath: string) => {
  const path = reportedPath.startsWith('/workspace/')
    ? reportedPath.slice('/workspace/'.length)
    : reportedPath.startsWith('/')
      ? undefined
      : reportedPath;
  return path ? { fileId: path, path } : undefined;
};

const parseVitestExecutionTestReport = (
  input: Omit<
    ParseVitestExecutionTestReportInput,
    'resolveFileIdentity' | 'toolVersion'
  > &
    Partial<
      Pick<
        ParseVitestExecutionTestReportInput,
        'resolveFileIdentity' | 'toolVersion'
      >
    >
) =>
  parseRawVitestExecutionTestReport({
    resolveFileIdentity: resolveWorkspaceFileIdentity,
    toolVersion: '4.1.9',
    ...input,
  });

const passingSource = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    success: true,
    startTime: 100,
    testResults: [
      {
        name: '/workspace/src/App.test.tsx',
        status: 'passed',
        assertionResults: [
          {
            title: 'renders',
            fullName: 'App renders',
            status: 'passed',
            duration: 5,
            failureMessages: [],
          },
        ],
      },
    ],
    ...overrides,
  });

describe('Vitest execution report conformance', () => {
  it('maps private failure data and source trace into the canonical report', () => {
    const report = parseVitestExecutionTestReport({
      source: JSON.stringify({
        success: false,
        startTime: 100,
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'failed',
            assertionResults: [
              {
                title: 'renders',
                fullName: 'App renders',
                status: 'failed',
                duration: 5,
                failureMessages: ['expected true to be false'],
              },
            ],
          },
        ],
      }),
      reportId: 'report-1',
      completedAt: 110,
      exitCode: 1,
      resolveSourceTrace: () => [
        {
          sourceRef: { kind: 'document', documentId: 'page-1' },
        },
      ],
    });

    expect(report).toMatchObject({
      kind: 'test-report',
      reportId: 'report-1',
      status: 'failed',
      tool: { name: 'vitest' },
      startedAt: 100,
      completedAt: 110,
      summary: { totalFiles: 1, failedFiles: 1, totalCases: 1, failedCases: 1 },
      files: [
        {
          path: 'src/App.test.tsx',
          status: 'failed',
          sourceTrace: [
            { sourceRef: { kind: 'document', documentId: 'page-1' } },
          ],
          cases: [
            {
              caseId: 'case:16:src/App.test.tsx:App renders',
              name: 'renders',
              status: 'failed',
              failureMessages: ['expected true to be false'],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('assertionResults');
  });

  it('derives content-bound case ids and canonical ordering independent of reporter order', () => {
    const testResults = [
      {
        name: '/workspace/src/Z.test.ts',
        status: 'passed',
        assertionResults: [
          {
            title: 'second',
            fullName: 'suite second',
            status: 'passed',
            failureMessages: [],
          },
          {
            title: 'first',
            fullName: 'suite first',
            status: 'passed',
            failureMessages: [],
          },
        ],
      },
      {
        name: '/workspace/src/A.test.ts',
        status: 'passed',
        assertionResults: [
          {
            title: 'only',
            fullName: 'suite only',
            status: 'passed',
            failureMessages: [],
          },
        ],
      },
    ];
    const parse = (value: typeof testResults) =>
      parseVitestExecutionTestReport({
        source: JSON.stringify({ success: true, testResults: value }),
        reportId: 'stable-order',
        completedAt: 1,
        exitCode: 0,
      });
    const first = parse(testResults);
    const second = parse(
      [...testResults].reverse().map((file) => ({
        ...file,
        assertionResults: [...file.assertionResults].reverse(),
      }))
    );

    expect(first).toEqual(second);
    expect(first.files.map(({ path }) => path)).toEqual([
      'src/A.test.ts',
      'src/Z.test.ts',
    ]);
    expect(first.files[1]?.cases.map(({ fullName }) => fullName)).toEqual([
      'suite first',
      'suite second',
    ]);
    expect(first.files[1]?.cases.map(({ caseId }) => caseId)).toEqual([
      'case:13:src/Z.test.ts:suite first',
      'case:13:src/Z.test.ts:suite second',
    ]);
  });

  it.each([
    ['file', 'unknown', 'passed'],
    ['case', 'passed', 'unknown'],
  ])('rejects an unknown %s status', (_owner, fileStatus, caseStatus) => {
    expect(() =>
      parseVitestExecutionTestReport({
        source: passingSource({
          testResults: [
            {
              name: '/workspace/src/App.test.tsx',
              status: fileStatus,
              assertionResults: [
                {
                  title: 'renders',
                  status: caseStatus,
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
        reportId: 'unknown-status',
        completedAt: 110,
      })
    ).toThrow('has an unsupported status');
  });

  it.each([
    ['missing', undefined],
    ['non-array', { partial: true }],
  ])(
    'rejects %s assertionResults instead of accepting a partial report',
    (_kind, assertionResults) => {
      expect(() =>
        parseVitestExecutionTestReport({
          source: passingSource({
            testResults: [
              {
                name: '/workspace/src/App.test.tsx',
                status: 'passed',
                ...(assertionResults === undefined ? {} : { assertionResults }),
              },
            ],
          }),
          reportId: 'partial-report',
          completedAt: 110,
        })
      ).toThrow('assertionResults in src/App.test.tsx must be an array');
    }
  );

  it.each([
    [
      'without files',
      {
        success: true,
        testResults: [],
      },
      'did not contain any test files',
    ],
    [
      'without cases',
      {
        success: true,
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'passed',
            assertionResults: [],
          },
        ],
      },
      'did not contain any test cases',
    ],
  ])('rejects a report %s', (_label, source, message) => {
    expect(() =>
      parseVitestExecutionTestReport({
        source: JSON.stringify(source),
        reportId: 'empty-report',
        completedAt: 1,
      })
    ).toThrow(message);
  });

  it('rejects an all-skipped/todo report instead of publishing a false pass', () => {
    expect(() =>
      parseVitestExecutionTestReport({
        source: JSON.stringify({
          success: true,
          testResults: [
            {
              name: '/workspace/src/App.test.tsx',
              status: 'passed',
              assertionResults: [
                {
                  title: 'later',
                  status: 'todo',
                  failureMessages: [],
                },
                {
                  title: 'disabled',
                  status: 'skipped',
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
        reportId: 'non-executed-report',
        completedAt: 1,
      })
    ).toThrow('contained only skipped or todo test cases');
  });

  it('rejects duplicate content-bound case identities', () => {
    expect(() =>
      parseVitestExecutionTestReport({
        source: JSON.stringify({
          success: true,
          testResults: [
            {
              name: '/workspace/src/App.test.tsx',
              status: 'passed',
              assertionResults: [
                {
                  title: 'first rendering',
                  fullName: 'App renders',
                  status: 'passed',
                  failureMessages: [],
                },
                {
                  title: 'second rendering',
                  fullName: 'App renders',
                  status: 'passed',
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
        reportId: 'duplicate-case',
        completedAt: 1,
      })
    ).toThrow('contains duplicate case identity');
  });

  it.each([
    ['passing report with non-zero exit', passingSource(), 1],
    [
      'failed report with zero exit',
      JSON.stringify({
        success: false,
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'failed',
            assertionResults: [
              {
                title: 'renders',
                status: 'failed',
                failureMessages: ['failed'],
              },
            ],
          },
        ],
      }),
      0,
    ],
  ])('rejects exit/result drift for a %s', (_label, source, exitCode) => {
    expect(() =>
      parseVitestExecutionTestReport({
        source,
        reportId: 'exit-drift',
        completedAt: 110,
        exitCode,
      })
    ).toThrow('process exit code and canonical report status diverged');
  });

  it('rejects private success/result drift', () => {
    expect(() =>
      parseVitestExecutionTestReport({
        source: passingSource({ success: false }),
        reportId: 'result-drift',
        completedAt: 110,
      })
    ).toThrow('success flag and canonical report status diverged');
  });

  it('maps provider-private file identities and redacts private failure locations before canonical publication', () => {
    const providerPath =
      'C:\\Users\\runner\\AppData\\Local\\Temp\\run-17\\src\\App.test.tsx';
    const report = parseVitestExecutionTestReport({
      source: JSON.stringify({
        success: false,
        testResults: [
          {
            name: providerPath,
            status: 'failed',
            assertionResults: [
              {
                title: 'renders',
                fullName: 'App renders',
                status: 'failed',
                failureMessages: [
                  `at render (${providerPath}:12:4)`,
                  'see file://C:/private/provider-stack.js',
                ],
              },
            ],
          },
        ],
      }),
      reportId: 'mapped-report',
      completedAt: 110,
      exitCode: 1,
      resolveFileIdentity: (reportedPath) =>
        reportedPath === providerPath
          ? {
              fileId: 'src/App.test.tsx',
              path: 'src/App.test.tsx',
              sourceTrace: [
                {
                  sourceRef: {
                    kind: 'code-artifact',
                    artifactId: 'artifact:app-test',
                  },
                },
              ],
            }
          : undefined,
    });

    expect(report.files[0]).toMatchObject({
      fileId: 'src/App.test.tsx',
      path: 'src/App.test.tsx',
      cases: [
        {
          caseId: 'case:16:src/App.test.tsx:App renders',
          failureMessages: [
            'Provider-private failure detail redacted.',
            'Provider-private failure detail redacted.',
          ],
        },
      ],
    });
    const published = JSON.stringify(report);
    expect(published).not.toContain(providerPath);
    expect(published).not.toContain('file://');
    expect(published).not.toContain('AppData');
  });

  it('fails closed on unmapped, duplicate, or non-relative file identities', () => {
    const source = JSON.stringify({
      success: true,
      testResults: [
        {
          name: '/tmp/provider-a/src/App.test.tsx',
          status: 'passed',
          assertionResults: [
            {
              title: 'renders',
              status: 'passed',
              failureMessages: [],
            },
          ],
        },
      ],
    });
    expect(() =>
      parseVitestExecutionTestReport({
        source,
        reportId: 'unmapped',
        completedAt: 1,
        resolveFileIdentity: () => undefined,
      })
    ).toThrow('is not mapped to the executable snapshot');
    expect(() =>
      parseVitestExecutionTestReport({
        source,
        reportId: 'absolute-map',
        completedAt: 1,
        resolveFileIdentity: () => ({
          fileId: '/tmp/provider-a/src/App.test.tsx',
          path: '/tmp/provider-a/src/App.test.tsx',
        }),
      })
    ).toThrow('snapshot-relative path');

    expect(() =>
      parseVitestExecutionTestReport({
        source: JSON.stringify({
          success: true,
          testResults: [
            {
              name: '/tmp/provider-a/src/App.test.tsx',
              status: 'passed',
              assertionResults: [
                {
                  title: 'renders',
                  status: 'passed',
                  failureMessages: [],
                },
              ],
            },
            {
              name: '/tmp/provider-b/src/App.test.tsx',
              status: 'passed',
              assertionResults: [
                {
                  title: 'renders elsewhere',
                  status: 'passed',
                  failureMessages: [],
                },
              ],
            },
          ],
        }),
        reportId: 'duplicate-map',
        completedAt: 1,
        resolveFileIdentity: () => ({
          fileId: 'src/App.test.tsx',
          path: 'src/App.test.tsx',
        }),
      })
    ).toThrow('duplicate mapped file identity');
  });

  it.each([
    ['root', passingSource({ privatePayload: { token: 'secret' } })],
    [
      'file',
      passingSource({
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'passed',
            privatePayload: { token: 'secret' },
            assertionResults: [
              {
                title: 'renders',
                status: 'passed',
                failureMessages: [],
              },
            ],
          },
        ],
      }),
    ],
    [
      'case',
      passingSource({
        testResults: [
          {
            name: '/workspace/src/App.test.tsx',
            status: 'passed',
            assertionResults: [
              {
                title: 'renders',
                status: 'passed',
                failureMessages: [],
                privatePayload: { token: 'secret' },
              },
            ],
          },
        ],
      }),
    ],
  ])('rejects unknown %s reporter fields', (_layer, source) => {
    expect(() =>
      parseVitestExecutionTestReport({
        source,
        reportId: 'private-field',
        completedAt: 1,
      })
    ).toThrow('unknown or unsafe field');
  });

  it('requires exact provider file identity and attested tool version inputs', () => {
    expect(() =>
      parseRawVitestExecutionTestReport({
        source: passingSource(),
        reportId: 'missing-resolver',
        completedAt: 1,
        toolVersion: '4.1.9',
      } as ParseVitestExecutionTestReportInput)
    ).toThrow(
      'must supply an exact executable snapshot file identity resolver'
    );
    expect(() =>
      parseVitestExecutionTestReport({
        source: passingSource(),
        reportId: 'invalid-version',
        completedAt: 1,
        toolVersion: 'latest',
      })
    ).toThrow('exact attested semantic version');
  });

  it('fails closed before an oversized report can enter execution history', () => {
    const testResults = Array.from(
      { length: VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles + 1 },
      (_, index) => ({
        name: `src/file-${index}.test.ts`,
        status: 'passed',
        assertionResults: [
          {
            title: `case ${index}`,
            status: 'passed',
            failureMessages: [],
          },
        ],
      })
    );

    expect(() =>
      parseVitestExecutionTestReport({
        source: JSON.stringify({ success: true, testResults }),
        reportId: 'bounded-report',
        completedAt: 1,
      })
    ).toThrow(
      `Vitest JSON report exceeds the ${VITEST_EXECUTION_TEST_REPORT_LIMITS.maxFiles} file limit.`
    );
  });
});
