import {
  generateWorkspaceReactViteExecutableProject,
  type CompileDiagnostic,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionRequest,
  type ExecutableProjectSnapshot,
  type ExecutionRequest,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { createClientExecutionRequestId } from '@/editor/features/execution';

export type BlueprintProjectRunPlan =
  | Readonly<{
      status: 'ready';
      snapshot: ExecutableProjectSnapshot;
      request: ExecutionRequest;
    }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly CompileDiagnostic[];
    }>;

/** Compiles one canonical Workspace revision into a standalone runner input. */
export const createBlueprintProjectRunPlan = (
  workspace: WorkspaceSnapshot,
  provider: 'browser' | 'remote' = 'browser'
): BlueprintProjectRunPlan => {
  const project = generateWorkspaceReactViteExecutableProject(workspace);
  if (project.status === 'blocked') return project;
  const request = createExecutionRequest({
    requestId: createClientExecutionRequestId('project-run'),
    profile: 'preview',
    runtimeZone: 'client',
    workspace: project.snapshot.workspace,
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: workspace.id },
    },
    requiredCapabilities:
      provider === 'remote'
        ? [
            'artifacts',
            'cancellation',
            'console',
            'dependency-install',
            'filesystem',
            'source-trace',
            'streaming-logs',
          ]
        : [
            'artifacts',
            'cancellation',
            'console',
            'dependency-install',
            'filesystem',
            'hmr',
            'streaming-logs',
          ],
  });
  return Object.freeze({
    status: 'ready',
    snapshot: project.snapshot,
    request,
  });
};
