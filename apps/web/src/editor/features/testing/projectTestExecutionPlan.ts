import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  generateWorkspaceReactViteExecutableProject,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
  type CompileDiagnostic,
} from '@prodivix/prodivix-compiler';
import type { BinaryAssetMaterialization } from '@prodivix/assets';
import {
  decodeServerRuntimeProfile,
  type ServerRuntimeTestProvision,
} from '@prodivix/server-runtime';
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

export type ProjectTestExecutionPlanOptions = Readonly<{
  serverRuntimeMockProvision?: ServerRuntimeTestProvision;
  assetMaterializations?: readonly BinaryAssetMaterialization[];
}>;

const createDefaultAuthTestProvision = (
  workspace: WorkspaceSnapshot
): ServerRuntimeTestProvision | undefined => {
  const referencedFunctions = new Set<string>();
  const visitRoute = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const route = value as Readonly<Record<string, unknown>>;
    const runtime =
      route.runtime &&
      typeof route.runtime === 'object' &&
      !Array.isArray(route.runtime)
        ? (route.runtime as Readonly<Record<string, unknown>>)
        : undefined;
    ['loaderRef', 'actionRef', 'guardRef'].forEach((field) => {
      const reference = runtime?.[field];
      if (
        !reference ||
        typeof reference !== 'object' ||
        Array.isArray(reference)
      )
        return;
      const candidate = reference as Readonly<Record<string, unknown>>;
      if (
        typeof candidate.artifactId === 'string' &&
        typeof candidate.exportName === 'string'
      ) {
        referencedFunctions.add(
          `${candidate.artifactId}\0${candidate.exportName}`
        );
      }
    });
    if (Array.isArray(route.children)) route.children.forEach(visitRoute);
  };
  visitRoute(workspace.routeManifest.root);
  const functions = Object.values(workspace.docsById)
    .flatMap((document) => {
      if (
        document.type !== 'code' ||
        !document.content ||
        typeof document.content !== 'object' ||
        Array.isArray(document.content)
      ) {
        return [];
      }
      const content = document.content as Readonly<Record<string, unknown>>;
      const language = content.language;
      const metadata =
        content.metadata &&
        typeof content.metadata === 'object' &&
        !Array.isArray(content.metadata)
          ? (content.metadata as Readonly<Record<string, unknown>>)
          : undefined;
      if (language !== 'ts' && language !== 'js') return [];
      const decoded = decodeServerRuntimeProfile(metadata, language);
      if (decoded.status !== 'valid') return [];
      return Object.entries(decoded.profile.functionsByExport).map(
        ([exportName, definition]) => ({
          artifactId: document.id,
          exportName,
          definition,
        })
      );
    })
    .filter(({ artifactId, exportName }) =>
      referencedFunctions.has(`${artifactId}\0${exportName}`)
    )
    .sort(
      (left, right) =>
        left.artifactId.localeCompare(right.artifactId) ||
        left.exportName.localeCompare(right.exportName)
    );
  if (!functions.length) return undefined;
  const fixtures: ServerRuntimeTestProvision['fixtures'][number][] = [];
  functions.forEach(({ artifactId, exportName, definition }, index) => {
    const functionRef = Object.freeze({ artifactId, exportName });
    if (
      definition.adapterId === 'core.auth.current-principal' &&
      definition.kind === 'route-loader' &&
      definition.effect === 'read'
    ) {
      fixtures.push(
        Object.freeze({
          id: `default-auth-loader-${index + 1}`,
          functionRef,
          behavior: Object.freeze({
            kind: 'outcome' as const,
            outcome: Object.freeze({
              kind: 'value' as const,
              value: Object.freeze({
                providerId: 'prodivix-product-session',
                principalId: 'test-principal',
              }),
            }),
          }),
        })
      );
      return;
    }
    if (
      definition.adapterId === 'core.auth.require-workspace-owner' &&
      definition.kind === 'route-guard' &&
      definition.effect === 'read'
    ) {
      fixtures.push(
        Object.freeze({
          id: `default-auth-guard-${index + 1}`,
          functionRef,
          behavior: Object.freeze({
            kind: 'outcome' as const,
            outcome: Object.freeze({ kind: 'allow' as const }),
          }),
        })
      );
    }
  });
  return Object.freeze({
    format: 'prodivix.server-runtime-test-provision.v1',
    fixtureSetId: 'workspace-auth-default',
    principal: Object.freeze({
      providerId: 'prodivix-test-fixture',
      principalId: 'test-principal',
    }),
    permissions: Object.freeze([
      Object.freeze({ permissionId: 'workspace.owner', allowed: true }),
    ]),
    fixtures: Object.freeze(fixtures),
  });
};

/** Compiles the exact canonical Workspace revision into the exported test project. */
export const createProjectTestExecutionPlan = (
  workspace: WorkspaceSnapshot,
  options: ProjectTestExecutionPlanOptions = {}
): ProjectTestExecutionPlan => {
  const serverRuntimeMockProvision =
    options.serverRuntimeMockProvision ??
    createDefaultAuthTestProvision(workspace);
  const project = generateWorkspaceReactViteExecutableProject(workspace, {
    dataRuntimeTarget: PROVIDER_MOCK_DATA_RUNTIME_TARGET,
    serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
    assetMaterializations: options.assetMaterializations ?? [],
    ...(serverRuntimeMockProvision ? { serverRuntimeMockProvision } : {}),
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
