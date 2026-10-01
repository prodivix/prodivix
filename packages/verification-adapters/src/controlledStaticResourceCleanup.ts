import { execFile } from 'node:child_process';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';

export type ControlledStaticResourceCommandPort = Readonly<{
  run(args: readonly string[]): Promise<string>;
}>;
const productionCommands = (): ControlledStaticResourceCommandPort => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
  ])
    if (process.env[key]) environment[key] = process.env[key];
  return {
    run: (args) =>
      new Promise((resolve, reject) => {
        execFile(
          'podman',
          [...args],
          {
            env: environment,
            timeout: 15000,
            maxBuffer: 262144,
            windowsHide: true,
          },
          (error, stdout) =>
            error
              ? reject(new Error('Controlled static resource cleanup failed.'))
              : resolve(stdout)
        );
      }),
  };
};
/** Removes only the cryptographically selected attempt's labelled containers, then proves absence. */
export const cleanupControlledStaticToolchainResources = async (input: {
  resourceScope: string;
  commands?: ControlledStaticResourceCommandPort;
}): Promise<
  Readonly<{
    resourceScope: string;
    resourcesClean: true;
    removedContainerCount: number;
    receiptDigest: string;
  }>
> => {
  if (!/^[a-f0-9]{64}$/u.test(input.resourceScope))
    throw new TypeError('Controlled static resource scope is invalid.');
  if (!input.commands && process.platform !== 'linux')
    throw new Error('Controlled static rootless cleanup requires Linux.');
  const commands = input.commands ?? productionCommands();
  const info: unknown = JSON.parse(
    await commands.run(['info', '--format', 'json'])
  );
  if (
    !isPlainObject(info) ||
    !isPlainObject(info.host) ||
    !isPlainObject(info.host.security) ||
    info.host.security.rootless !== true
  )
    throw new Error('Controlled static cleanup requires a rootless provider.');
  const query = [
    'ps',
    '--all',
    '--filter',
    `label=prodivix.controlled-static-scope=${input.resourceScope}`,
    '--format',
    '{{.ID}}',
  ];
  const ids = (await commands.run(query))
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  if (
    ids.length > 16 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !/^[a-f0-9]{12,64}$/u.test(id))
  )
    throw new Error(
      'Controlled static cleanup resources exceed their exact budget.'
    );
  for (const id of ids) await commands.run(['rm', '--force', '--ignore', id]);
  if ((await commands.run(query)).trim() !== '')
    throw new Error('Controlled static cleanup has residual containers.');
  const receipt = {
    resourceScope: input.resourceScope,
    resourcesClean: true as const,
    removedContainerCount: ids.length,
  };
  return {
    ...receipt,
    receiptDigest: digestVerificationValue({
      contract: 'prodivix.controlled-static-resource-cleanup',
      ...receipt,
    }),
  };
};
