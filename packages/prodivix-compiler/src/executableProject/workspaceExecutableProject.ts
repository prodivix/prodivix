import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import {
  createExecutableProjectSnapshot,
  DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
  type ExecutableProjectCommand,
  type ExecutableProjectDataMockProvision,
  type ExecutableProjectSnapshot,
  type ExecutionSourceTrace,
  type ExecutionWorkspaceSnapshotRef,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { ExportSourceTrace } from '#src/export/types';
import { generateWorkspaceReactViteBundle } from '#src/react/workspaceProject';

export type WorkspaceExecutableProjectResult =
  | Readonly<{
      status: 'ready';
      snapshot: ExecutableProjectSnapshot;
    }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly CompileDiagnostic[];
    }>;

export type GenerateWorkspaceExecutableProjectOptions = Readonly<{
  dataMockProvision?: ExecutableProjectDataMockProvision;
}>;

type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

const readPackageManager = (
  files: readonly Readonly<{ path: string; contents: string | Uint8Array }>[]
): PackageManagerName => {
  const packageFile = files.find((file) => file.path === 'package.json');
  if (!packageFile || typeof packageFile.contents !== 'string') return 'npm';
  try {
    const value = JSON.parse(packageFile.contents) as {
      packageManager?: unknown;
    };
    const name =
      typeof value.packageManager === 'string'
        ? value.packageManager.split('@')[0]
        : undefined;
    return name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : 'npm';
  } catch {
    return 'npm';
  }
};

const readLockFilePath = (
  files: readonly Readonly<{ path: string }>[]
): string | undefined =>
  ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock'].find(
    (path) => files.some((file) => file.path === path)
  );

const packageManagerCommand = (
  packageManager: PackageManagerName,
  args: readonly string[]
): ExecutableProjectCommand =>
  packageManager === 'npm' || packageManager === 'bun'
    ? Object.freeze({
        command: packageManager,
        args: Object.freeze([...args]),
      })
    : Object.freeze({
        command: 'corepack',
        args: Object.freeze([packageManager, ...args]),
      });

const executionTargetRef = (
  trace: ExportSourceTrace,
  workspaceId: string
): DiagnosticTargetRef => {
  switch (trace.sourceRef.domain) {
    case 'workspace':
      return { kind: 'workspace', workspaceId };
    case 'workspace-document':
      return {
        kind: 'document',
        workspaceId,
        documentId: trace.sourceRef.id,
      };
    case 'code':
    case 'code-artifact':
      return { kind: 'code-artifact', artifactId: trace.sourceRef.id };
    case 'route':
      return { kind: 'route', routeId: trace.sourceRef.id };
    default:
      return { kind: 'workspace', workspaceId };
  }
};

const executionSourceTrace = (
  trace: ExportSourceTrace,
  workspaceId: string
): ExecutionSourceTrace =>
  Object.freeze({
    sourceRef: Object.freeze(executionTargetRef(trace, workspaceId)),
    ...(trace.sourceSpan
      ? {
          sourceSpan: Object.freeze({
            artifactId: trace.artifactId ?? trace.sourceRef.id,
            ...trace.sourceSpan,
          }),
        }
      : {}),
    label:
      trace.sourceRef.path?.trim() ||
      `${trace.sourceRef.domain}:${trace.sourceRef.id}`,
  });

const createWorkspaceExecutionSnapshotRef = (
  workspace: WorkspaceSnapshot
): ExecutionWorkspaceSnapshotRef => {
  const documents = Object.values(workspace.docsById).sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const documentRevisions = documents
    .map(
      (document) =>
        `${encodeURIComponent(document.id)}@${document.contentRev}.${document.metaRev}`
    )
    .join(',');
  return Object.freeze({
    workspaceId: workspace.id,
    snapshotId: `${workspace.id}|w=${workspace.workspaceRev}|r=${workspace.routeRev}|o=${workspace.opSeq}|d=${documentRevisions}`,
    partitionRevisions: Object.freeze({
      workspace: String(workspace.workspaceRev),
      route: String(workspace.routeRev),
      ...Object.fromEntries(
        documents.flatMap((document) => [
          [`document:${document.id}:content`, String(document.contentRev)],
          [`document:${document.id}:meta`, String(document.metaRev)],
        ])
      ),
    }),
  });
};

/** Compiles one exact Workspace revision into the provider-neutral project contract. */
export const generateWorkspaceReactViteExecutableProject = (
  workspace: WorkspaceSnapshot,
  options: GenerateWorkspaceExecutableProjectOptions = {}
): WorkspaceExecutableProjectResult => {
  const bundle = generateWorkspaceReactViteBundle(workspace, {
    ...(options.dataMockProvision
      ? { dataMockProvision: options.dataMockProvision }
      : {}),
  });
  const blockingDiagnostics =
    bundle.metadata?.blockingDiagnostics ??
    bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (bundle.metadata?.exportBlocked || blockingDiagnostics.length) {
    return Object.freeze({
      status: 'blocked',
      diagnostics: Object.freeze([...blockingDiagnostics]),
    });
  }

  const packageManager = readPackageManager(bundle.files);
  const lockFilePath = readLockFilePath(bundle.files);
  const snapshot = createExecutableProjectSnapshot({
    workspace: createWorkspaceExecutionSnapshotRef(workspace),
    target: {
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    },
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
      { kind: 'test', path: 'src/App.test.tsx' },
    ],
    capabilityRequirements: {
      preview: [
        'artifacts',
        'cancellation',
        'console',
        'dependency-install',
        'filesystem',
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
    installCommand: packageManagerCommand(packageManager, [
      'install',
      ...(packageManager === 'pnpm' ? ['--no-frozen-lockfile'] : []),
    ]),
    previewCommand: packageManagerCommand(packageManager, [
      'run',
      'dev',
      '--',
      '--host',
      '0.0.0.0',
    ]),
    buildCommand: packageManagerCommand(packageManager, ['run', 'build']),
    previewPlan: {
      mode: 'static-bundle',
      command: packageManagerCommand(packageManager, ['run', 'build']),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    },
    buildPlan: { outputDirectoryPath: 'dist' },
    testPlan: {
      framework: 'vitest',
      command: packageManagerCommand(packageManager, [
        'run',
        'test',
        '--',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH}`,
      ]),
      reportFilePath: DEFAULT_EXECUTABLE_PROJECT_TEST_REPORT_PATH,
    },
  });
  return Object.freeze({ status: 'ready', snapshot });
};
