import { execFile } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const entrypointPath = '/opt/prodivix/sandbox-entry.mjs';

const materializeEntrypoint = async (
  dockerfilePath: string,
  omitEnvironmentModule = false
) => {
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), 'prodivix-sandbox-image-entry-')
  );
  try {
    const dockerfile = await readFile(
      resolve(repositoryRoot, dockerfilePath),
      'utf8'
    );
    const entrypointLine = dockerfile
      .split(/\r?\n/u)
      .find((line) => line.startsWith('ENTRYPOINT '));
    const entrypoint = JSON.parse(
      entrypointLine?.slice('ENTRYPOINT '.length) ?? 'null'
    ) as unknown;
    if (
      !Array.isArray(entrypoint) ||
      entrypoint[0] !== 'node' ||
      entrypoint[1] !== entrypointPath
    )
      throw new TypeError(
        'Sandbox image must use its declared Node entrypoint.'
      );
    const imageDirectory = resolve(temporaryRoot, 'image/opt/prodivix');
    await mkdir(imageDirectory, { recursive: true });
    for (const line of dockerfile.split(/\r?\n/u)) {
      const copy = /^COPY (\S+) (\/opt\/prodivix\/\S+)$/u.exec(line);
      if (!copy?.[1] || !copy[2]) continue;
      if (
        omitEnvironmentModule &&
        copy[2].endsWith('/packageManagerEnvironment.mjs')
      )
        continue;
      await copyFile(
        resolve(repositoryRoot, copy[1]),
        resolve(imageDirectory, basename(copy[2]))
      );
    }
    const launcher = resolve(temporaryRoot, 'launch.mjs');
    await writeFile(
      launcher,
      `
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const imageDirectory = process.argv[2];
// Translate only the container's absolute mount prefix; Node resolves actual
// copied modules and executes the unchanged production entrypoint itself.
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/opt/prodivix/'))
    return nextResolve(pathToFileURL(resolve(imageDirectory, specifier.slice('/opt/prodivix/'.length))).href, context);
  return nextResolve(specifier, context);
}});
await import(pathToFileURL(resolve(imageDirectory, 'sandbox-entry.mjs')).href);
`,
      'utf8'
    );
    return { temporaryRoot, imageDirectory, launcher };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
};

const launchEntrypoint = async (
  materialized: Awaited<ReturnType<typeof materializeEntrypoint>>
) =>
  new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
    (resolveRun, rejectRun) => {
      const child = execFile(
        process.execPath,
        [materialized.launcher, materialized.imageDirectory],
        {
          cwd: materialized.temporaryRoot,
          env: {
            PATH: dirname(process.execPath),
            HOME: materialized.temporaryRoot,
          },
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        }
      );
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.once('error', rejectRun);
      child.once('close', (exitCode) =>
        resolveRun({ exitCode, stdout, stderr })
      );
      child.stdin?.end();
    }
  );

describe('sandbox image runtime entrypoint closure', () => {
  for (const dockerfile of [
    'apps/remote-runner-worker/sandbox/Dockerfile',
    'apps/remote-runner-worker/controlled-static-sandbox/Dockerfile',
  ]) {
    it(`starts the actual copied entrypoint for ${dockerfile} and fails closed on absent payload`, async () => {
      const materialized = await materializeEntrypoint(dockerfile);
      try {
        const result = await launchEntrypoint(materialized);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
        expect(JSON.parse(result.stdout)).toMatchObject({
          protocol: 'prodivix.sandbox-result.v1',
          exitCode: 125,
          stdout: '',
          stderr: '',
          outputTruncated: false,
          artifacts: [],
        });
      } finally {
        await rm(materialized.temporaryRoot, { recursive: true, force: true });
      }
    });
  }

  it('rejects the actual entrypoint before its protocol when a copied runtime module is missing', async () => {
    const materialized = await materializeEntrypoint(
      'apps/remote-runner-worker/sandbox/Dockerfile',
      true
    );
    try {
      const result = await launchEntrypoint(materialized);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
      expect(result.stderr).toContain('packageManagerEnvironment.mjs');
    } finally {
      await rm(materialized.temporaryRoot, { recursive: true, force: true });
    }
  });
});
