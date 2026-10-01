import { execFile } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPlainObject } from '@prodivix/shared/safety';
import type { G3DriverConfiguration } from '#src/g3/config.js';

/** Resource readiness is checked before this service accepts dispatches. */
export const checkG3DriverResources = async (
  config: G3DriverConfiguration
): Promise<void> => {
  if (process.platform !== 'linux' || process.versions.node !== '22.23.1')
    throw new Error(
      'G3 requires the adopted Linux rootless host and frozen Node 22.23.1.'
    );
  const root = await realpath(config.repositoryRoot);
  await readFile(
    resolve(
      root,
      'packages/verification-adapters/scripts/runControlledStaticToolchain.ts'
    )
  );
  const image = process.env.PRODIVIX_CONTROLLED_STATIC_SANDBOX_IMAGE;
  if (!image || !/^sha256:[a-f0-9]{64}$/u.test(image))
    throw new Error('G3 rootless image is not pinned.');
  const environment: NodeJS.ProcessEnv = {};
  for (const name of [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
  ])
    if (process.env[name]) environment[name] = process.env[name];
  const command = (args: string[]): Promise<string> =>
    new Promise((resolveResult, reject) => {
      execFile(
        'podman',
        args,
        {
          env: environment,
          timeout: 5000,
          maxBuffer: 262144,
          windowsHide: true,
        },
        (error, stdout) =>
          error
            ? reject(new Error('G3 rootless resource probe failed.'))
            : resolveResult(stdout)
      );
    });
  const info: unknown = JSON.parse(await command(['info', '--format', 'json']));
  if (
    !isPlainObject(info) ||
    !isPlainObject(info.host) ||
    !isPlainObject(info.host.security) ||
    info.host.security.rootless !== true
  )
    throw new Error('G3 provider is not rootless.');
  await command(['image', 'inspect', image]);
};
