import { describe, expect, it } from 'vitest';
import { createExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  BrowserProjectCommandError,
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
      snapshot('data', undefined, 'reuse-if-matched', true),
      'preview'
    );
    await expect(
      host.readFile(
        'public/.prodivix/data-mock-provision.json',
        preparation.lease
      )
    ).resolves.toContain('browser-runtime-test');
    await expect(
      host.readFile('public/.prodivix/data-runtime.json', preparation.lease)
    ).resolves.toContain('"mode":"mock"');
    const buildPreparation = await host.prepare(
      'owner-data',
      snapshot('data', undefined, 'reuse-if-matched', true),
      'build'
    );
    await expect(
      host.readFile(
        'public/.prodivix/data-runtime.json',
        buildPreparation.lease
      )
    ).resolves.toContain('"mode":"live"');
    await expect(
      host.readFile(
        'public/.prodivix/data-mock-provision.json',
        buildPreparation.lease
      )
    ).rejects.toThrow('Missing runtime file');
    await host.dispose();
  });

  it('lazily shares files and installs while preserving owner-scoped processes', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    const output: string[] = [];
    const outputIdentity: Array<{
      label: string;
      ownerId: string;
      generation: number;
      processId: string;
    }> = [];
    host.subscribe((event) => {
      if (event.kind === 'output') {
        output.push(`${event.ownerId}:${event.label}:${event.message}`);
        outputIdentity.push({
          label: event.label,
          ownerId: event.ownerId,
          generation: event.generation,
          processId: event.processId,
        });
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
    expect(outputIdentity).toEqual(
      expect.arrayContaining([
        {
          label: 'a',
          ownerId: 'owner-a',
          generation: ownerAPreparation.lease.generation,
          processId: ownerAProcess.processId,
        },
        {
          label: 'b',
          ownerId: 'owner-b',
          generation: ownerBPreparation.lease.generation,
          processId: ownerBProcess.processId,
        },
      ])
    );

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

  it('does not cache a failed install and recovers on the next preparation', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    harness.queueInstallCommand({ exitCode: 17, output: 'install failed\n' });
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });

    await expect(
      host.prepare('owner-a', snapshot('failed-install'))
    ).rejects.toBeInstanceOf(BrowserProjectCommandError);
    const recovered = await host.prepare('owner-a', snapshot('failed-install'));

    expect(recovered.dependenciesInstalled).toBe(true);
    expect(
      harness.commands.filter((command) => command.args?.includes('install'))
    ).toHaveLength(2);
    await host.dispose();
  });

  it('serializes competing preparations and generation-fences the older lease', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });

    const [older, current] = await Promise.all([
      host.prepare('owner-a', snapshot('race-a')),
      host.prepare('owner-b', snapshot('race-b', 'export const value = 2;')),
    ]);

    await expect(
      host.spawn(
        'owner-a',
        { command: 'node', args: ['src/main.ts'] },
        { lease: older.lease }
      )
    ).rejects.toThrow('lease is stale');
    const process = await host.spawn(
      'owner-b',
      { command: 'node', args: ['src/main.ts'] },
      { lease: current.lease }
    );
    await expect(process.exit).resolves.toBe(0);
    await host.dispose();
  });

  it('restarts the runtime so a retired server source cannot impersonate the next generation', async () => {
    const firstRuntime = createBrowserProjectRuntimeHarness();
    const secondRuntime = createBrowserProjectRuntimeHarness();
    const runtimes = [firstRuntime, secondRuntime];
    let bootCount = 0;
    const host = createBrowserProjectRuntimeHost({
      createRuntime: async () => {
        const harness = runtimes[bootCount];
        bootCount += 1;
        if (!harness) throw new Error('Unexpected browser runtime reboot.');
        return harness.runtime;
      },
    });
    const projected: Array<
      | {
          kind: 'server-ready';
          processId: string;
          generation: number;
          url: string;
        }
      | {
          kind: 'preview-error';
          processId: string;
          generation: number;
          message: string;
        }
    > = [];
    host.subscribe((event) => {
      if (event.kind === 'server-ready') {
        projected.push({
          kind: event.kind,
          processId: event.processId,
          generation: event.generation,
          url: event.url,
        });
      }
      if (event.kind === 'preview-error') {
        projected.push({
          kind: event.kind,
          processId: event.processId,
          generation: event.generation,
          message: event.error.message,
        });
      }
    });

    const firstPreparation = await host.prepare(
      'owner-a',
      snapshot('server-one')
    );
    firstRuntime.queueCommand({ pending: true });
    await host.spawn(
      'owner-a',
      { command: 'npm', args: ['run', 'dev'] },
      {
        lease: firstPreparation.lease,
        label: 'dev',
        kind: 'server',
      }
    );
    const retiredReady = firstRuntime.captureServerReadyListeners().at(0);
    const retiredPreviewError = firstRuntime
      .capturePreviewErrorListeners()
      .at(0);
    if (!retiredReady || !retiredPreviewError) {
      throw new Error('Retired runtime listeners were not attached.');
    }
    await host.stopOwner('owner-a');

    const secondPreparation = await host.prepare(
      'owner-a',
      snapshot('server-two')
    );
    expect(bootCount).toBe(2);
    expect(firstRuntime.disposeCount()).toBe(1);
    secondRuntime.queueCommand({ pending: true });
    const currentProcess = await host.spawn(
      'owner-a',
      { command: 'npm', args: ['run', 'dev'] },
      {
        lease: secondPreparation.lease,
        label: 'dev',
        kind: 'server',
      }
    );

    retiredReady('https://retired.preview.local', 5173);
    retiredPreviewError({ message: 'retired preview failure' });
    secondRuntime.emitServerReady('https://current.preview.local');
    secondRuntime.emitPreviewError({ message: 'current preview failure' });

    expect(projected).toEqual([
      {
        kind: 'server-ready',
        processId: currentProcess.processId,
        generation: secondPreparation.lease.generation,
        url: 'https://current.preview.local',
      },
      {
        kind: 'preview-error',
        processId: currentProcess.processId,
        generation: secondPreparation.lease.generation,
        message: 'current preview failure',
      },
    ]);
    await host.dispose();
  });

  it('waits for an in-flight spawn to stop before owner cleanup completes', async () => {
    const harness = createBrowserProjectRuntimeHarness();
    const host = createBrowserProjectRuntimeHost({
      createRuntime: harness.createRuntime,
    });
    const preparation = await host.prepare(
      'owner-a',
      snapshot('pending-spawn')
    );
    let releaseSpawn!: () => void;
    let markSpawnStarted!: () => void;
    const spawnGate = new Promise<void>((resolve) => {
      releaseSpawn = resolve;
    });
    const spawnStarted = new Promise<void>((resolve) => {
      markSpawnStarted = resolve;
    });
    harness.queueCommand({
      pending: true,
      beforeSpawn: () => {
        markSpawnStarted();
        return spawnGate;
      },
    });

    const spawn = host.spawn(
      'owner-a',
      { command: 'node', args: ['pending.js'] },
      { lease: preparation.lease }
    );
    await spawnStarted;
    let stopped = false;
    const stop = host.stopOwner('owner-a').then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    releaseSpawn();
    await expect(spawn).rejects.toThrow(
      'was stopped before its process started'
    );
    await stop;
    expect(harness.processes.at(-1)?.killed()).toBe(true);
    await host.dispose();
  });
});
