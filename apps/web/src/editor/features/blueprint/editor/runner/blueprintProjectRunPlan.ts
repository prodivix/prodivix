import {
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  type CompileDiagnostic,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionRequest,
  type ExecutableProjectSnapshot,
  type ExecutionProviderCapability,
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
  const project = generateWorkspaceReactViteExecutableProject(
    workspace,
    provider === 'remote'
      ? { dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET }
      : {}
  );
  if (project.status === 'blocked') return project;
  const requiredCapabilities = Object.freeze([
    ...new Set<ExecutionProviderCapability>([
      ...project.snapshot.capabilityRequirements.preview,
      ...(provider === 'browser' ? (['hmr'] as const) : []),
    ]),
  ]);
  const request = createExecutionRequest({
    requestId: createClientExecutionRequestId('project-run'),
    profile: 'preview',
    runtimeZone: 'client',
    workspace: project.snapshot.workspace,
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: workspace.id },
    },
    requiredCapabilities,
  });
  return Object.freeze({
    status: 'ready',
    snapshot: project.snapshot,
    request,
  });
};
