import {
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
  type CompileDiagnostic,
} from '@prodivix/prodivix-compiler';
import type { BinaryAssetMaterialization } from '@prodivix/assets';
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
      composition: BlueprintProjectRunComposition;
    }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly CompileDiagnostic[];
    }>;

export type BlueprintProjectRunTarget = 'react-vite' | 'vue-vite';

export type BlueprintProjectRunComposition = Readonly<{
  mode: 'run';
  provider: 'browser' | 'remote';
  target: BlueprintProjectRunTarget;
  runtimeZone: 'client';
  environmentPolicy: 'public-client' | 'execution-parent-gateway';
  requiredCapabilities: readonly ExecutionProviderCapability[];
}>;

/** Compiles one canonical Workspace revision into a standalone runner input. */
export const createBlueprintProjectRunPlan = (
  workspace: WorkspaceSnapshot,
  provider: 'browser' | 'remote' = 'browser',
  assetMaterializations: readonly BinaryAssetMaterialization[] = [],
  target: BlueprintProjectRunTarget = 'react-vite'
): BlueprintProjectRunPlan => {
  const generateExecutableProject =
    target === 'vue-vite'
      ? generateWorkspaceVueViteExecutableProject
      : generateWorkspaceReactViteExecutableProject;
  const project = generateExecutableProject(
    workspace,
    provider === 'remote'
      ? {
          dataRuntimeTarget: EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
          serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
          assetMaterializations,
        }
      : { assetMaterializations }
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
  const composition = Object.freeze({
    mode: 'run' as const,
    provider,
    target,
    runtimeZone: 'client' as const,
    environmentPolicy:
      provider === 'remote'
        ? ('execution-parent-gateway' as const)
        : ('public-client' as const),
    requiredCapabilities,
  });
  return Object.freeze({
    status: 'ready',
    snapshot: project.snapshot,
    request,
    composition,
  });
};
