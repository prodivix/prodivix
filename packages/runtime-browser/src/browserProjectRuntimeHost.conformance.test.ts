import { describe, expect, it } from 'vitest';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  BrowserProjectRuntimeHostBusyError,
  createBrowserProjectRuntimeHost,
} from './browserProjectRuntimeHost';
import { createBrowserProjectRuntimeHarness } from './__tests__/browserProjectRuntimeHarness';

const snapshot = (
  version: string,
  source = 'export const value = 1;',
  dependencyInstall: 'reuse-if-matched' | 'isolated' = 'reuse-if-matched',
  withDataMock = false
) =>
  createExecutableProjectSnapshot({
    workspace: {
      workspaceId: 'workspace',
      snapshotId: `snapshot-${version}`,
    },
    target: {
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    },
    files: [
      {
        path: 'package.json',
        contents: JSON.stringify({ version, scripts: { test: 'vitest run' } }),
      },
      { path: 'src/main.ts', contents: source },
    ],
    dependencyPlan: { manifestFilePath: 'package.json' },
    entrypoints: [{ kind: 'preview', path: 'src/main.ts' }],
    capabilityRequirements: {
      preview: ['filesystem'],
      build: ['filesystem', 'build'],
      test: ['filesystem', 'test'],
    },
    cacheHints: { dependencyInstall },
    ...(withDataMock
      ? {
          dataMockProvision: {
            fixtureSetId: 'browser-runtime-test',
            emulatedAdapterIds: ['core.http'],
            fixtures: [],
          },
        }
      : {}),
  });

describe('browser project runtime host conformance', () => {
  it('honors an isolated dependency-install cache policy', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    await host.prepare('owner-a', snapshot('1', undefined, 'isolated'));
    await host.prepare('owner-a', snapshot('1', undefined, 'isolated'));
    expect(
      harness.commands.filter((command) => command.args?.includes('install'))
    ).toHaveLength(2);
    await host.dispose();
  });

  it('projects Data mock provisioning as a managed runtime file', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    const preparation = await host.prepare(
      'owner-data',
      snapshot('data', undefined, 'reuse-if-matched', true)
    );
    await expect(
      host.readFile(
        'public/.prodivix/data-mock-provision.json',
        preparation.lease
      )
    ).resolves.toContain('browser-runtime-test');
    await host.dispose();
  });

  it('lazily shares files and installs while preserving owner-scoped processes', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    const output: string[] = [];
    host.subscribe((event) => {
      if (event.kind === 'output') {
        output.push(`${event.ownerId}:${event.label}:${event.message}`);
      }
    });

    expect(harness.bootCount()).toBe(0);
    const ownerAPreparation = await host.prepare('owner-a', snapshot('1'));
    expect(ownerAPreparation.dependenciesInstalled).toBe(true);
    expect(harness.bootCount()).toBe(1);
    expect(
      harness.commands.filter((command) => command.args?.includes('install'))
    ).toHaveLength(1);
    await expect(
      host.readFile('src/main.ts', ownerAPreparation.lease)
    ).resolves.toBe('export const value = 1;');

    harness.queueCommand({ pending: true, output: 'owner a\n' });
    const ownerAProcess = await host.spawn(
      'owner-a',
      { command: 'node', args: ['a.js'] },
      { lease: ownerAPreparation.lease, label: 'a' }
    );
    const ownerBPreparation = await host.prepare('owner-b', snapshot('1'));
    expect(ownerBPreparation.dependenciesInstalled).toBe(false);
    harness.queueCommand({ pending: true, output: 'owner b\n' });
    const ownerBProcess = await host.spawn(
      'owner-b',
      { command: 'node', args: ['b.js'] },
      { lease: ownerBPreparation.lease, label: 'b' }
    );
    await Promise.all([
      ownerAProcess.outputCompletion,
      ownerBProcess.outputCompletion,
    ]);
    await host.stopOwner('owner-a');
    expect(ownerAProcess.wasStopRequested()).toBe(true);
    expect(ownerBProcess.wasStopRequested()).toBe(false);
    expect(output).toContain('owner-a:a:owner a');
    expect(output).toContain('owner-b:b:owner b');

    await expect(host.prepare('owner-a', snapshot('2'))).rejects.toBeInstanceOf(
      BrowserProjectRuntimeHostBusyError
    );
    await host.stopOwner('owner-b');
    const ownerASecondPreparation = await host.prepare(
      'owner-a',
      snapshot('2')
    );
    expect(ownerASecondPreparation.dependenciesInstalled).toBe(true);
    expect(
      harness.commands.filter((command) => command.args?.includes('install'))
    ).toHaveLength(2);

    harness.files.set('tmp/report.json', 'report');
    await expect(
      host.readFile('tmp/report.json', ownerASecondPreparation.lease)
    ).resolves.toBe('report');
    await host.remove('tmp/report.json', ownerASecondPreparation.lease);
    await expect(
      host.readFile('tmp/report.json', ownerASecondPreparation.lease)
    ).rejects.toThrow('Missing runtime file');
    const sourcePreparation = await host.prepare(
      'owner-a',
      snapshot('2', 'export const value = 2;')
    );
    await expect(
      host.readFile('src/main.ts', sourcePreparation.lease)
    ).resolves.toBe('export const value = 2;');

    await host.dispose();
    expect(harness.disposeCount()).toBe(1);
  });

  it('rejects a stale prepare lease before another snapshot can execute', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    const first = await host.prepare(
      'owner-a',
      snapshot('1', 'export const revision = 1;')
    );
    await host.prepare('owner-b', snapshot('1', 'export const revision = 2;'));

    await expect(
      host.spawn(
        'owner-a',
        { command: 'node', args: ['src/main.ts'] },
        { lease: first.lease, label: 'stale' }
      )
    ).rejects.toThrow('lease is stale');
    expect(
      harness.commands.filter((command) => command.command === 'node')
    ).toHaveLength(0);
    await host.dispose();
  });
});
