import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {
  createExecutableProjectSnapshot,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import {
  CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS,
  CONTROLLED_STATIC_TOOLCHAIN_PRODUCTION_CLIENT_IMPLEMENTATION_DIGEST,
  CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS,
  decodeControlledStaticToolchainProductionResult,
  resolveControlledStaticToolchainExecutionTimeoutMs,
  runControlledStaticToolchainProduction,
} from './controlledStaticToolchainProductionClient';
import {
  CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT,
  decodeControlledStaticToolchainRequest,
  encodeControlledStaticToolchainRequest,
} from './controlledStaticToolchainProtocol';

const snapshot = (): ExecutableProjectSnapshot =>
  createExecutableProjectSnapshot({
    workspace: {
      workspaceId: 'workspace-production-client',
      snapshotId: 'snapshot-production-client',
      partitionRevisions: { route: '1', workspace: '1' },
    },
    target: {
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    },
    files: [
      { path: 'package.json', contents: '{"private":true}' },
      { path: 'src/main.ts', contents: 'export const value = 1;' },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [
      { kind: 'preview', path: 'src/main.ts' },
      { kind: 'build', path: 'src/main.ts' },
      { kind: 'test', path: 'src/main.ts' },
    ],
    capabilityRequirements: {
      preview: ['filesystem'],
      build: ['filesystem', 'build'],
      test: ['filesystem', 'test'],
    },
    publicBuildConfiguration: [],
  });

describe('controlled static toolchain production client conformance', () => {
  it('round-trips the exact current executable snapshot through its public request codec', () => {
    const expected = snapshot();
    const encoded = encodeControlledStaticToolchainRequest(expected);
    const wire = JSON.parse(encoded.source) as Record<string, unknown>;

    expect(wire.format).toBe(CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT);
    expect(canonicalJsonText(wire)).toBe(encoded.source);
    expect(encoded.requestDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(decodeControlledStaticToolchainRequest(encoded.source)).toEqual({
      format: CONTROLLED_STATIC_TOOLCHAIN_REQUEST_FORMAT,
      requestDigest: encoded.requestDigest,
      snapshot: expected,
    });
    expect(
      CONTROLLED_STATIC_TOOLCHAIN_PRODUCTION_CLIENT_IMPLEMENTATION_DIGEST
    ).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });

  it('fails before process dispatch when the repository root is not absolute', async () => {
    await expect(
      runControlledStaticToolchainProduction({
        repositoryRoot: 'relative/repository',
        snapshot: snapshot(),
      })
    ).rejects.toThrow(/repository root must be absolute/u);
  });

  it('freezes the independent build execution budget below the owner transport boundary', () => {
    expect(CONTROLLED_STATIC_TOOLCHAIN_EXECUTION_TIMEOUT_MS).toBe(170_000);
    expect(CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS).toBe(5_000);
    expect(resolveControlledStaticToolchainExecutionTimeoutMs(undefined)).toBe(
      170_000
    );
    expect(resolveControlledStaticToolchainExecutionTimeoutMs(169_000)).toBe(
      169_000
    );
    expect(() =>
      resolveControlledStaticToolchainExecutionTimeoutMs(170_001)
    ).toThrow(/1\.\.170000ms/u);
  });

  it('rejects a synthetic or incomplete result before exposing build evidence', () => {
    const expected = snapshot();
    const encoded = encodeControlledStaticToolchainRequest(expected);
    expect(() =>
      decodeControlledStaticToolchainProductionResult(
        canonicalJsonText({
          format: 'prodivix.controlled-static-toolchain-result.v1',
          buildBundle: {},
          buildSummary: {},
          coverageSummary: {},
          testReport: {},
          authorityReceipt: {},
          projectionAuthority: {},
        }),
        { snapshot: expected, requestDigest: encoded.requestDigest }
      )
    ).toThrow();
  });

  it('terminates the complete process tree inside the independent cleanup budget after timeout', async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), 'prodivix-toolchain-cleanup-')
    );
    const runnerDirectory = join(
      repositoryRoot,
      'packages',
      'verification-adapters',
      'scripts'
    );
    const pidPath = join(repositoryRoot, 'processes.json');
    try {
      await mkdir(runnerDirectory, { recursive: true });
      await writeFile(
        join(runnerDirectory, 'runControlledStaticToolchain.ts'),
        [
          "import { spawn } from 'node:child_process';",
          "import { writeFileSync } from 'node:fs';",
          `const descendant = spawn(process.execPath, ['-e', ${JSON.stringify(
            "process.on('SIGTERM', () => {}); setInterval(() => {}, 60_000);"
          )}], { stdio: 'ignore' });`,
          `writeFileSync(${JSON.stringify(
            pidPath
          )}, JSON.stringify({ parent: process.pid, descendant: descendant.pid }));`,
          'setInterval(() => {}, 60_000);',
        ].join('\n'),
        'utf8'
      );
      const startedAt = Date.now();
      const execution = runControlledStaticToolchainProduction({
        repositoryRoot,
        snapshot: snapshot(),
        timeoutMs: 5_000,
      });
      const timedOut = expect(execution).rejects.toThrow(/timed out/u);
      let processIds:
        Readonly<{ parent: number; descendant: number }> | undefined;
      const pidDeadline = startedAt + 4_500;
      while (!processIds && Date.now() < pidDeadline) {
        try {
          processIds = JSON.parse(await readFile(pidPath, 'utf8')) as Readonly<{
            parent: number;
            descendant: number;
          }>;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !('code' in error) ||
            error.code !== 'ENOENT'
          ) {
            throw error;
          }
          await wait(25);
        }
      }
      expect(processIds).toBeDefined();
      await timedOut;
      expect(Date.now() - startedAt).toBeLessThanOrEqual(
        5_000 + CONTROLLED_STATIC_TOOLCHAIN_CLEANUP_TIMEOUT_MS + 1_000
      );
      const alive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      expect(alive(processIds!.parent)).toBe(false);
      expect(alive(processIds!.descendant)).toBe(false);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }, 20_000);
});
