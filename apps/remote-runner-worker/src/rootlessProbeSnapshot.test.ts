import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from '@prodivix/runtime-remote';
import { describe, expect, it } from 'vitest';
import { createRootlessProbeSnapshot } from '../scripts/rootlessProbeSnapshot';

describe('rootless Test probe dependencies', () => {
  const snapshot = createRootlessProbeSnapshot(
    'gate-test',
    'process.exit(0)',
    'test'
  );
  const manifest = JSON.parse(
    snapshot.files.find(({ path }) => path === 'package.json')!
      .contents as string
  );
  const lock = JSON.parse(
    snapshot.files.find(({ path }) => path === 'package-lock.json')!
      .contents as string
  );

  it('installs the exact manifest and integrity-locked graph with npm ci', () => {
    expect(snapshot.dependencyPlan.lockFilePath).toBe('package-lock.json');
    expect(snapshot.installCommand).toEqual({
      command: 'npm',
      args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    });
    expect(manifest.packageManager).toBe('npm@10.9.8');
    expect(manifest.devDependencies).toEqual({
      vite: '8.1.3',
      vitest: '4.1.9',
    });
    expect(manifest.overrides).toEqual({ vite: '$vite' });
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.packages[''].devDependencies).toEqual(manifest.devDependencies);
    for (const [path, entry] of Object.entries(lock.packages) as [
      string,
      { version: string; resolved: string; integrity: string },
    ][]) {
      if (path === '') continue;
      expect(entry.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//u);
      expect(entry.integrity).toMatch(/^sha512-/u);
      if (path.endsWith('node_modules/vite'))
        expect(entry.version).toBe(manifest.devDependencies.vite);
      if (path.endsWith('node_modules/vitest'))
        expect(entry.version).toBe(manifest.devDependencies.vitest);
    }
    expect(lock.packages['node_modules/vitest'].version).toBe('4.1.9');
    expect(lock.packages['node_modules/vite'].version).toBe('8.1.3');
    expect(
      lock.packages['node_modules/@rolldown/binding-linux-x64-gnu']
    ).toBeDefined();
  });

  it('preserves the frozen graph and install command across the Worker boundary', () => {
    const decoded = decodeRemoteExecutableProjectSnapshot(
      encodeRemoteExecutableProjectSnapshot(snapshot)
    );
    expect(decoded.contentDigest).toBe(snapshot.contentDigest);
    expect(decoded.dependencyPlan).toEqual(snapshot.dependencyPlan);
    expect(decoded.installCommand).toEqual(snapshot.installCommand);
    expect(decoded.files).toEqual(snapshot.files);
  });

  it.each(['package.json', 'package-lock.json'])(
    'rejects %s mutation under the original snapshot identity',
    (path) => {
      const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
      expect(() =>
        decodeRemoteExecutableProjectSnapshot({
          ...wire,
          files: wire.files.map((file) =>
            file.path === path
              ? { ...file, contents: { encoding: 'utf8', value: '{}' } }
              : file
          ),
        })
      ).toThrow();
    }
  );
});
