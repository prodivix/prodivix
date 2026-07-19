import {
  createExecutableProjectSnapshot,
  DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import {
  createWorkspaceExecutionSnapshotRef,
  executionSourceTrace,
  packageManagerCommand,
  packageManagerRunArguments,
  readLockFilePath,
  readPackageManager,
} from '#src/executableProject/workspaceExecutableProject';
import {
  analyzeWorkspaceDataRuntimeTarget,
  PROVIDER_MOCK_DATA_RUNTIME_TARGET,
} from '#src/react/workspaceDataRuntimeTarget';
import {
  generateWorkspaceVueViteBundle,
  type WorkspaceVueViteCompileOptions,
} from '#src/vue/workspaceProject';

export type GenerateWorkspaceVueViteExecutableProjectOptions =
  WorkspaceVueViteCompileOptions;

export type WorkspaceVueViteExecutableProjectResult =
  | Readonly<{ status: 'ready'; snapshot: ExecutableProjectSnapshot }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly CompileDiagnostic[];
    }>;

/** Builds the controlled Vue/Vite target through the same provider-neutral v6 snapshot. */
export const generateWorkspaceVueViteExecutableProject = (
  workspace: WorkspaceSnapshot,
  options: GenerateWorkspaceVueViteExecutableProjectOptions = {}
): WorkspaceVueViteExecutableProjectResult => {
  const dataRuntime = analyzeWorkspaceDataRuntimeTarget(
    workspace,
    options.dataRuntimeTarget ??
      (options.dataMockProvision
        ? PROVIDER_MOCK_DATA_RUNTIME_TARGET
        : undefined)
  );
  const bundle = generateWorkspaceVueViteBundle(workspace, options);
  const serverRuntimeMetadata = bundle.metadata?.serverRuntime as
    | Readonly<{
        requirements?: Readonly<{
          requiresServerGateway?: unknown;
          requiresEnvironmentBinding?: unknown;
        }>;
      }>
    | undefined;
  const requiresServerFunctionGateway =
    serverRuntimeMetadata?.requirements?.requiresServerGateway === true;
  const requiresServerEnvironmentBinding =
    serverRuntimeMetadata?.requirements?.requiresEnvironmentBinding === true;
  const metadataBlockingDiagnostics = bundle.metadata?.blockingDiagnostics as
    readonly CompileDiagnostic[] | undefined;
  const blockingDiagnostics =
    metadataBlockingDiagnostics ??
    bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (bundle.metadata?.exportBlocked === true || blockingDiagnostics.length)
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([...blockingDiagnostics]),
    });

  const packageManager = readPackageManager(bundle.files);
  const lockFilePath = readLockFilePath(bundle.files);
  const requiresLiveDataNetwork =
    !options.dataMockProvision && dataRuntime.requirements.requiresNetwork;
  const requiresLiveEnvironmentBinding =
    requiresServerEnvironmentBinding ||
    (!options.dataMockProvision &&
      dataRuntime.requirements.requiresEnvironmentBinding);
  const snapshot = createExecutableProjectSnapshot({
    workspace: createWorkspaceExecutionSnapshotRef(workspace),
    target: { presetId: 'vue-vite', framework: 'vue', runtime: 'vite' },
    files: bundle.files.map((file) => ({
      path: file.path,
      contents: file.contents,
      sourceTrace: file.sourceTrace.map((trace) =>
        executionSourceTrace(trace, workspace.id)
      ),
    })),
    dependencyPlan: {
      manifestFilePath: 'package.json',
      ...(lockFilePath ? { lockFilePath } : {}),
    },
    entrypoints: [
      { kind: 'preview', path: 'index.html' },
      { kind: 'build', path: 'index.html' },
      { kind: 'test', path: 'src/App.test.ts' },
    ],
    capabilityRequirements: {
      preview: [
        'artifacts',
        'cancellation',
        'console',
        'dependency-install',
        ...(requiresLiveEnvironmentBinding
          ? (['environment-binding'] as const)
          : []),
        'filesystem',
        ...(requiresLiveDataNetwork ? (['network'] as const) : []),
        ...(!options.dataMockProvision &&
        dataRuntime.requirements.requiresDataStream
          ? (['data-stream'] as const)
          : []),
        ...(requiresServerFunctionGateway
          ? (['server-function'] as const)
          : []),
        'source-trace',
        'streaming-logs',
      ],
      build: [
        'artifacts',
        'build',
        'dependency-install',
        'filesystem',
        'source-trace',
      ],
      test: [
        'artifacts',
        'dependency-install',
        'filesystem',
        ...(options.serverRuntimeMockProvision
          ? (['server-function'] as const)
          : []),
        'source-trace',
        'test',
      ],
    },
    publicBuildConfiguration: [],
    resourceHints: {
      timeoutMs: 120_000,
      maxOutputBytes: 16 * 1024 * 1024,
    },
    cacheHints: { dependencyInstall: 'reuse-if-matched' },
    ...(options.dataMockProvision
      ? { dataMockProvision: options.dataMockProvision }
      : {}),
    ...(options.serverRuntimeMockProvision
      ? { serverRuntimeMockProvision: options.serverRuntimeMockProvision }
      : {}),
    installCommand: packageManagerCommand(packageManager, [
      'install',
      ...(packageManager === 'pnpm' ? ['--no-frozen-lockfile'] : []),
    ]),
    previewCommand: packageManagerCommand(
      packageManager,
      packageManagerRunArguments(packageManager, 'dev', ['--host', '0.0.0.0'])
    ),
    buildCommand: packageManagerCommand(
      packageManager,
      packageManagerRunArguments(packageManager, 'build')
    ),
    previewPlan: {
      mode: 'static-bundle',
      command: packageManagerCommand(
        packageManager,
        packageManagerRunArguments(packageManager, 'build')
      ),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    },
    buildPlan: { outputDirectoryPath: 'dist' },
    testPlan: {
      framework: 'vitest',
      command: packageManagerCommand(
        packageManager,
        packageManagerRunArguments(packageManager, 'test', [
          '--reporter=default',
          '--reporter=json',
          '--no-file-parallelism',
          `--outputFile.json=${DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH}`,
        ])
      ),
      reportFilePath: DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
    },
  });
  return Object.freeze({ status: 'ready', snapshot });
};
