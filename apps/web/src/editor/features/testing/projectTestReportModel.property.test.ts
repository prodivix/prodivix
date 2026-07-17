import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createExecutionTestReport,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  toExecutionTestReportValue,
  type ExecutionSessionSnapshot,
  type ExecutionTestStatus,
} from '@prodivix/runtime-core';
import { createProjectTestReportPresentation } from './projectTestReportModel';

const statuses: readonly ExecutionTestStatus[] = [
  'passed',
  'failed',
  'skipped',
  'todo',
];

describe('project test report presentation', () => {
  it('always selects the latest normalized report in the bounded session', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...statuses), { minLength: 1, maxLength: 20 }),
        (generatedStatuses) => {
          const reports = generatedStatuses.map((status, index) =>
            createExecutionTestReport({
              reportId: `report-${index}`,
              tool: { name: 'vitest' },
              startedAt: index * 10,
              completedAt: index * 10 + 5,
              files: [
                {
                  fileId: `file-${index}`,
                  path: `src/file-${index}.test.ts`,
                  status,
                  cases: [
                    {
                      caseId: `case-${index}`,
                      name: `case ${index}`,
                      status,
                    },
                  ],
                },
              ],
            })
          );
          const session: ExecutionSessionSnapshot = {
            sessionId: 'workspace:test:project-tests',
            revision: reports.length,
            status: 'succeeded',
            observations: [],
            consoleObservations: [],
            activeJob: {
              jobId: `job-${reports.length - 1}`,
              requestId: `request-${reports.length - 1}`,
              providerId: 'prodivix.browser.web-container.test',
              providerVersion: '1',
              profile: 'test',
              runtimeZone: 'test',
              invocationKind: 'test',
              capabilities: ['test'],
              workspace: {
                workspaceId: 'workspace-test',
                snapshotId: `snapshot-${reports.length - 1}`,
              },
            },
            events: reports.map((report, index) => ({
              sessionId: 'workspace:test:project-tests',
              jobId: `job-${index}`,
              requestId: `request-${index}`,
              providerId: 'prodivix.browser.web-container.test',
              workspaceId: 'workspace-test',
              snapshotId: `snapshot-${index}`,
              event: {
                kind: 'trace',
                jobId: `job-${index}`,
                sequence: index + 1,
                emittedAt: index,
                trace: {
                  traceId: `trace-${index}`,
                  spanId: `span-${index}`,
                  name: EXECUTION_TEST_REPORT_TRACE_NAME,
                  phase: 'end',
                  detail: toExecutionTestReportValue(report),
                },
              },
            })),
          };

          const presentation = createProjectTestReportPresentation(session);

          expect(presentation?.report).toBe(reports.at(-1));
          expect(presentation?.jobId).toBe(`job-${reports.length - 1}`);
          expect(presentation?.snapshotId).toBe(
            `snapshot-${reports.length - 1}`
          );
        }
      )
    );
  });
});
