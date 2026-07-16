import { describe, expect, it } from 'vitest';
import {
  VITEST_EXECUTION_TEST_REPORT_LIMITS,
  parseVitestExecutionTestReport,
} from './vitestExecutionTestReport';

describe('Vitest execution report conformance', () => {
  it('maps private failure data and source trace into the canonical report', () => {
    const report = parseVitestExecutionTestReport({
      source: JSON.stringify({
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
          path: '/workspace/src/App.test.tsx',
          status: 'failed',
          sourceTrace: [
            { sourceRef: { kind: 'document', documentId: 'page-1' } },
          ],
          cases: [
            {
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
