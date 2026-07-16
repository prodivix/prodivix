import {
  createExecutionRequest,
  type ExecutableProjectSnapshot,
  type ExecutionRequest,
  type ExecutionSourceTrace,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import { parseVitestExecutionTestReport } from '@prodivix/runtime-vitest';
import { generateWorkspaceReactViteExecutableProject } from '@prodivix/prodivix-compiler';
import { authorGoldenWorkspace } from './goldenAuthoring';

export const GOLDEN_G2_REPORT_PATH = '.prodivix/test-report.json';
export const GOLDEN_G2_BROWSER_PREVIEW_URL =
  'https://browser-preview.golden.test/';
export const GOLDEN_G2_REMOTE_PREVIEW_URL = `https://${'a'.repeat(64)}.preview.golden.test/`;

const GOLDEN_G2_DATA_MOCK_PROVISION = Object.freeze({
  fixtureSetId: 'golden-g2-data',
  emulatedAdapterIds: Object.freeze(['core.http']),
  fixtures: Object.freeze([
    Object.freeze({
      id: 'golden-products',
      documentId: 'golden-data-products',
      operationId: 'list-products',
      operationKind: 'query' as const,
      behavior: Object.freeze({
        kind: 'result' as const,
        value: Object.freeze([Object.freeze({ id: 'golden-product' })]),
        empty: false,
      }),
    }),
  ]),
});

export const GOLDEN_G2_VITEST_REPORT = JSON.stringify({
  startTime: 1_000,
  success: true,
  testResults: [
    {
      name: 'src/App.test.tsx',
      status: 'passed',
      duration: 5,
      assertionResults: [
        {
          title: 'exports the React application entry',
          fullName: 'generated application exports the React application entry',
          status: 'passed',
          duration: 5,
          failureMessages: [],
        },
      ],
      failureMessages: [],
    },
  ],
});

export const createGoldenG2ExecutableSnapshot =
  (): ExecutableProjectSnapshot => {
    const workspace = authorGoldenWorkspace().editedWorkspace;
    const executable = generateWorkspaceReactViteExecutableProject(workspace, {
      dataMockProvision: GOLDEN_G2_DATA_MOCK_PROVISION,
    });
    if (executable.status === 'blocked')
      throw new Error(
        `Golden executable project is blocked: ${JSON.stringify(executable.diagnostics)}`
      );
    return executable.snapshot;
  };

export const goldenG2WorkspaceSourceTrace = (
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionSourceTrace[] =>
  Object.freeze([
    Object.freeze({
      sourceRef: {
        kind: 'workspace' as const,
        workspaceId: snapshot.workspace.workspaceId,
      },
      label: 'Golden executable project',
    }),
  ]);

export const goldenG2TestSourceTrace = (
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionSourceTrace[] =>
  snapshot.files.find((file) => file.path === 'src/App.test.tsx')
    ?.sourceTrace ?? goldenG2WorkspaceSourceTrace(snapshot);

export const createGoldenG2TestReport = (
  snapshot: ExecutableProjectSnapshot,
  reportId: string
): ExecutionTestReport =>
  parseVitestExecutionTestReport({
    source: GOLDEN_G2_VITEST_REPORT,
    reportId,
    completedAt: 2_000,
    resolveSourceTrace: () => goldenG2TestSourceTrace(snapshot),
  });

export const createGoldenG2ExecutionRequest = (
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build'
): ExecutionRequest =>
  createExecutionRequest({
    requestId: `golden-${profile}`,
    profile,
    runtimeZone:
      profile === 'preview' ? 'client' : profile === 'test' ? 'test' : 'build',
    workspace: snapshot.workspace,
    invocation:
      profile === 'preview'
        ? {
            kind: 'workspace',
            targetRef: {
              kind: 'workspace',
              workspaceId: snapshot.workspace.workspaceId,
            },
          }
        : {
            kind: profile,
            targetRef: {
              kind: 'workspace',
              workspaceId: snapshot.workspace.workspaceId,
            },
          },
    requiredCapabilities: snapshot.capabilityRequirements[profile],
  });

export type GoldenTestSemantics = Readonly<{
  status: ExecutionTestReport['status'];
  summary: ExecutionTestReport['summary'];
  files: readonly Readonly<{
    path: string;
    status: string;
    cases: readonly Readonly<{ name: string; status: string }>[];
  }>[];
}>;

export const projectGoldenTestSemantics = (
  report: ExecutionTestReport
): GoldenTestSemantics =>
  Object.freeze({
    status: report.status,
    summary: report.summary,
    files: Object.freeze(
      report.files.map((file) =>
        Object.freeze({
          path: file.path.replaceAll('\\', '/').split('/').at(-1) ?? file.path,
          status: file.status,
          cases: Object.freeze(
            file.cases.map((testCase) =>
              Object.freeze({ name: testCase.name, status: testCase.status })
            )
          ),
        })
      )
    ),
  });
