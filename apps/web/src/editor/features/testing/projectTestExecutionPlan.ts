import {
  generateWorkspaceReactViteExecutableProject,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  type CompileDiagnostic,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionRequest,
  type ExecutableProjectSnapshot,
  type ExecutionRequest,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createClientExecutionRequestId } from '@/editor/features/execution';

export type ProjectTestExecutionPlan =
  | Readonly<{
      status: 'ready';
      snapshot: ExecutableProjectSnapshot;
      request: ExecutionRequest;
    }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly CompileDiagnostic[];
    }>;

/** Compiles the exact canonical Workspace revision into the exported test project. */
export const createProjectTestExecutionPlan = (
  workspace: WorkspaceSnapshot
): ProjectTestExecutionPlan => {
  const project = generateWorkspaceReactViteExecutableProject(workspace, {
    dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  });
  if (project.status === 'blocked') return project;
  const request = createExecutionRequest({
    requestId: createClientExecutionRequestId('project-test'),
    profile: 'test',
    runtimeZone: 'test',
    workspace: project.snapshot.workspace,
    invocation: {
      kind: 'test',
      targetRef: { kind: 'workspace', workspaceId: workspace.id },
      entrypoint: 'workspace',
    },
    requiredCapabilities: [
      'artifacts',
      'cancellation',
      'dependency-install',
      'diagnostics',
      'filesystem',
      'source-trace',
      'streaming-logs',
      'test',
      'timeout',
    ],
    timeoutMs: 120_000,
  });
  return Object.freeze({
    status: 'ready',
    snapshot: project.snapshot,
    request,
  });
};
