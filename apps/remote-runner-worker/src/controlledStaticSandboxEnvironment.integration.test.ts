import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

type Environment = Readonly<Record<string, string | undefined>>;
type EnvironmentOwner = Readonly<{
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
const workerUrl = new URL(
  '../scripts/controlledStaticRootlessStageWorker.mjs',
  import.meta.url
);
const runtimeUrl = new URL(
  '../../../packages/verification-adapters/scripts/toolchains/controlledStaticSandboxRuntime.mjs',
  import.meta.url
);
const owner = (await import(ownerUrl.href)) as EnvironmentOwner;
const execFileAsync = promisify(execFile);
const environments = owner.createSandboxPackageManagerEnvironments(
  {
    PATH: dirname(process.execPath),
    HTTP_PROXY: 'http://install-proxy.invalid:8080',
    HTTPS_PROXY: 'http://install-proxy.invalid:8080',
    NO_PROXY: '',
  },
  []
);

const runControlledVersion = async (environment: Environment) =>
  execFileAsync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
import { spawnSync } from 'node:child_process';
// Windows augments execFile environments with OS identity variables. Rebuild
// the actual provider projection before exercising the Linux inner contract.
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, ${JSON.stringify(environment)});
const worker = await import(${JSON.stringify(workerUrl.href)});
worker.sanitizeControlledStaticRootlessExecutionEnvironment();
const runtime = await import(${JSON.stringify(runtimeUrl.href)});
const authority = runtime.controlledExecutionEnvironment();
const version = spawnSync(process.execPath, ['--version'], {
  env: process.env, encoding: 'utf8', windowsHide: true,
});
if (version.error) throw version.error;
if (version.status !== 0) throw new Error('Controlled version subprocess failed.');
process.stdout.write(JSON.stringify({
  authority, environment: process.env, version: version.stdout.trim(),
  exitCode: version.status, stderr: version.stderr,
}));
`,
    ],
    {
      cwd: tmpdir(),
      env: environment,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }
  );

describe('controlled static wrapper environment boundary', () => {
  it('projects actual wrapper environments to the strict inner authority before a real version subprocess', async () => {
    for (const environment of [
      environments.installEnvironment,
      environments.executionEnvironment,
    ]) {
      const result = await runControlledVersion(environment);
      const observed = JSON.parse(result.stdout) as {
        authority: { keys: string[]; digest: string };
        environment: Environment;
        version: string;
        exitCode: number;
        stderr: string;
      };
      expect(observed.authority.keys).toEqual(['HOME', 'PATH']);
      expect(observed.authority.digest).toMatch(/^sha256-[a-f0-9]{64}$/u);
      expect(observed.environment).toEqual({
        HOME: '/tmp',
        PATH: dirname(process.execPath),
      });
      expect(observed.version).toBe(`v${process.versions.node}`);
      expect(observed.exitCode).toBe(0);
      expect(observed.stderr).toBe('');
      expect(result.stderr).not.toContain(
        'Controlled sandbox inherited forbidden environment'
      );
    }
  });

  it('rejects an unowned Corepack control instead of stripping every matching prefix', async () => {
    await expect(
      runControlledVersion({
        ...environments.installEnvironment,
        COREPACK_ENABLE_PROJECT_SPEC: '0',
      })
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Controlled sandbox inherited forbidden environment'
      ),
    });
  });

  it('rejects an unexpected secret at the inner command boundary', async () => {
    await expect(
      runControlledVersion({
        ...environments.installEnvironment,
        FOREIGN_SECRET: 'controlled-secret-canary',
      })
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Controlled sandbox inherited forbidden environment'
      ),
    });
  });
});
