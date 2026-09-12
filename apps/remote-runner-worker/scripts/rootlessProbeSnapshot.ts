import { readFileSync } from 'node:fs';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';

/** Binds the rootless Test install to one frozen graph, including Vite's peer resolution. */
export const createRootlessProbeSnapshot = (
  executionId: string,
  source: string,
  profile: 'preview' | 'build' | 'test' = 'build',
  installCommand: Readonly<{
    command: 'node' | 'npm';
    args: readonly string[];
  }> = profile === 'test'
    ? {
        command: 'npm',
        args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      }
    : { command: 'node', args: ['-e', 'process.exit(0)'] }
) => {
  const files =
    profile === 'test'
      ? ['package.json', 'package-lock.json'].map((path) => ({
          path,
          contents: readFileSync(
            new URL(`./fixtures/rootless-test-probe/${path}`, import.meta.url),
            'utf8'
          ),
        }))
      : [{ path: 'package.json', contents: '{"private":true}' }];
  return createExecutableProjectSnapshot({
    workspace: {
      workspaceId: `workspace-${executionId}`,
      snapshotId: `snapshot-${executionId}`,
      partitionRevisions: { workspace: '1' },
    },
    target: { presetId: 'rootless-gate', framework: 'node', runtime: 'node' },
    files: files.map((file) => ({
      ...file,
      sourceTrace: [
        {
          sourceRef: {
            kind: 'workspace',
            workspaceId: `workspace-${executionId}`,
          },
        },
      ],
    })),
    dependencyPlan: {
      manifestFilePath: 'package.json',
      ...(profile === 'test' ? { lockFilePath: 'package-lock.json' } : {}),
    },
    entrypoints: [{ kind: profile, path: 'package.json' }],
    capabilityRequirements: {
      preview: ['filesystem'],
      build: ['filesystem', 'build'],
      test: ['filesystem', 'test'],
    },
    publicBuildConfiguration: [],
    resourceHints: {
      cpuCores: 1,
      memoryMb: profile === 'test' ? 512 : 256,
      diskMb: profile === 'test' ? 256 : 64,
    },
    cacheHints: { dependencyInstall: 'isolated' },
    installCommand,
    buildCommand: {
      command: 'node',
      args: ['--input-type=module', '-e', source],
    },
    testPlan: {
      framework: 'vitest',
      command: {
        command: 'node',
        args: ['--input-type=module', '-e', source],
      },
      reportFilePath: '.prodivix/test-report.json',
    },
  });
};
