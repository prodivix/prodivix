import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

type Environment = Readonly<Record<string, string | undefined>>;
type SandboxEnvironmentOwner = Readonly<{
  sandboxCorepackHome: string;
  sandboxInstallCachePaths: readonly string[];
  createSandboxPackageManagerEnvironments: (
    imageEnvironment: Environment,
    publicEnvironment: unknown
  ) => Readonly<{
    installEnvironment: Environment;
    executionEnvironment: Environment;
  }>;
}>;
const ownerUrl = new URL(
  '../sandbox/packageManagerEnvironment.mjs',
  import.meta.url
);
const owner = (await import(ownerUrl.href)) as SandboxEnvironmentOwner;
const createEnvironments = owner.createSandboxPackageManagerEnvironments;
const execFileAsync = promisify(execFile);

describe('sandbox package manager environment policy', () => {
  it('uses the infrastructure proxy only for installation and retains one local manager cache', () => {
    const { installEnvironment, executionEnvironment } = createEnvironments(
      {
        PATH: '/image/bin',
        HOME: '/host/home',
        HTTP_PROXY: 'http://install-proxy:8080',
        HTTPS_PROXY: 'http://install-proxy:8080',
        NO_PROXY: '',
        REMOTE_WORKER_TOKEN: 'worker-secret-canary',
        COREPACK_HOME: '/host/manager-cache',
        NODE_OPTIONS: '--require=/host/credential-loader.cjs',
      },
      [{ name: 'VITE_PUBLIC_LABEL', value: 'fixture' }]
    );
    expect(installEnvironment).toMatchObject({
      PATH: '/image/bin',
      HOME: '/tmp',
      HTTP_PROXY: 'http://install-proxy:8080',
      HTTPS_PROXY: 'http://install-proxy:8080',
      COREPACK_ENABLE_NETWORK: '1',
      NODE_USE_ENV_PROXY: '1',
      COREPACK_HOME: owner.sandboxCorepackHome,
      VITE_PUBLIC_LABEL: 'fixture',
    });
    expect(executionEnvironment).toMatchObject({
      PATH: '/image/bin',
      HOME: '/tmp',
      COREPACK_HOME: owner.sandboxCorepackHome,
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_DEFAULT_TO_LATEST: '0',
      COREPACK_ENV_FILE: '0',
      NODE_USE_ENV_PROXY: '0',
      VITE_PUBLIC_LABEL: 'fixture',
    });
    for (const environment of [installEnvironment, executionEnvironment]) {
      expect(environment).not.toHaveProperty('REMOTE_WORKER_TOKEN');
      expect(environment).not.toHaveProperty('NODE_OPTIONS');
      expect(JSON.stringify(environment)).not.toContain('/host/');
    }
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY'])
      expect(executionEnvironment).not.toHaveProperty(name);
  });

  it('rejects public attempts to replace runtime, proxy, manager, or dependency cache controls', () => {
    for (const name of [
      'PATH',
      'path',
      'HOME',
      'XDG_CACHE_HOME',
      'LOCALAPPDATA',
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'ALL_PROXY',
      'all_proxy',
      'NO_PROXY',
      'no_proxy',
      'NODE_OPTIONS',
      'NODE_USE_ENV_PROXY',
      'NODE_TLS_REJECT_UNAUTHORIZED',
      'COREPACK_HOME',
      'corepack_home',
      'COREPACK_ENABLE_NETWORK',
      'COREPACK_ENABLE_PROJECT_SPEC',
      'COREPACK_INTEGRITY_KEYS',
      'npm_config_proxy',
      'npm_config_https_proxy',
      'npm_config_cache',
      'npm_config_store_dir',
      'YARN_CACHE_FOLDER',
      'BUN_INSTALL_CACHE_DIR',
    ]) {
      expect(() =>
        createEnvironments({ PATH: '/image/bin' }, [
          { name, value: 'override' },
        ])
      ).toThrow('overrides runtime policy');
    }
  });

  it('keeps public build values without copying the image environment', () => {
    const { executionEnvironment } = createEnvironments(
      {
        PATH: '/image/bin',
        SECRET_VALUE: 'secret',
        XDG_CACHE_HOME: '/host/cache',
      },
      [
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PUBLIC_API', value: '/api' },
      ]
    );
    expect(executionEnvironment).toMatchObject({
      NODE_ENV: 'production',
      PUBLIC_API: '/api',
    });
    expect(executionEnvironment).not.toHaveProperty('SECRET_VALUE');
    expect(executionEnvironment).not.toHaveProperty('XDG_CACHE_HOME');
  });

  it('rejects malformed or duplicated public environment entries before spawning', () => {
    for (const entries of [
      undefined,
      {},
      [{ name: 'not-valid', value: '' }],
      [{ name: 'PUBLIC_VALUE', value: 2 }],
      [
        { name: 'PUBLIC_VALUE', value: 'first' },
        { name: 'PUBLIC_VALUE', value: 'second' },
      ],
    ]) {
      expect(() => createEnvironments({ PATH: '/image/bin' }, entries)).toThrow(
        'public environment'
      );
    }
  });

  it('retires dependency stores while keeping only the execution-local Corepack tool cache', () => {
    const { installEnvironment, executionEnvironment } = createEnvironments(
      { PATH: '/image/bin' },
      []
    );
    expect(owner.sandboxInstallCachePaths).toEqual([
      '/tmp/.prodivix-npm-cache',
      '/tmp/.prodivix-pnpm-store',
      '/tmp/.prodivix-yarn-cache',
      '/tmp/.prodivix-bun-cache',
    ]);
    expect(owner.sandboxInstallCachePaths).not.toContain(
      owner.sandboxCorepackHome
    );
    expect(installEnvironment.COREPACK_HOME).toBe(
      executionEnvironment.COREPACK_HOME
    );
    for (const name of [
      'npm_config_cache',
      'npm_config_store_dir',
      'YARN_CACHE_FOLDER',
      'BUN_INSTALL_CACHE_DIR',
    ])
      expect(executionEnvironment).not.toHaveProperty(name);
  });

  it('makes real native Node fetch use the installation proxy and removes that route for execution', async () => {
    const requests: string[] = [];
    const proxy = createServer();
    proxy.on('connect', (request, socket) => {
      requests.push(request.url ?? '');
      socket.end(
        'HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'
      );
    });
    await new Promise<void>((resolveListen) =>
      proxy.listen(0, '127.0.0.1', resolveListen)
    );
    const port = (proxy.address() as AddressInfo).port;
    const { installEnvironment, executionEnvironment } = createEnvironments(
      {
        PATH: process.env.PATH,
        HTTP_PROXY: `http://127.0.0.1:${port}`,
        HTTPS_PROXY: `http://127.0.0.1:${port}`,
      },
      []
    );
    const script =
      "fetch('https://prodivix-manager-proxy.invalid/').then(()=>process.exit(2),()=>process.exit(0));";
    try {
      await execFileAsync(process.execPath, ['-e', script], {
        env: installEnvironment,
        timeout: 5000,
      });
      expect(requests).toEqual(['prodivix-manager-proxy.invalid:443']);
      await execFileAsync(process.execPath, ['-e', script], {
        env: executionEnvironment,
        timeout: 5000,
      });
      expect(requests).toEqual(['prodivix-manager-proxy.invalid:443']);
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolveClose) =>
        proxy.close(() => resolveClose())
      );
    }
  });
});
