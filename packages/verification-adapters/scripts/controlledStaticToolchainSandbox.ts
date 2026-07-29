import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { decodeControlledStaticToolchainLinuxResult } from './controlledStaticToolchainLinuxResult';
import { controlledStaticSandboxDigestBytes as digestBytes } from './controlledStaticToolchainSandboxProtocol';
import type {
  ControlledStaticToolchainSandboxAuthority,
  ControlledStaticToolchainSandboxExecution,
} from './controlledStaticToolchainSandboxTypes';
import { runControlledStaticToolchainWindowsSandbox } from './controlledStaticToolchainWindowsSandbox';

const REQUEST_FORMAT = 'prodivix.controlled-static-rootless-sandbox-request.v1';
const MAXIMUM_RESULT_BYTES = 384 * 1024 * 1024;
const SANDBOX_TIMEOUT_MS = 180_000;

type SandboxRuntimeFile = Readonly<{
  path: string;
  contents: string | Uint8Array;
}>;

export type {
  ControlledStaticToolchainSandboxAuthority,
  ControlledStaticToolchainSandboxExecution,
} from './controlledStaticToolchainSandboxTypes';

const encodedFile = (file: SandboxRuntimeFile) => {
  const contents =
    typeof file.contents === 'string'
      ? new TextEncoder().encode(file.contents)
      : new Uint8Array(file.contents);
  return Object.freeze({
    path: file.path,
    size: contents.byteLength,
    digest: digestBytes(contents),
    encoding: 'base64' as const,
    contents: Buffer.from(contents).toString('base64'),
  });
};

const minimalProviderEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'HOME',
    'XDG_RUNTIME_DIR',
    'DBUS_SESSION_BUS_ADDRESS',
    'CONTAINERS_CONF',
    'CONTAINERS_STORAGE_CONF',
    'PRODIVIX_CONTROLLED_STATIC_SANDBOX_IMAGE',
  ] as const) {
    const value = process.env[key];
    if (value) environment[key] = value;
  }
  return environment;
};

const terminateProviderTree = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid)
    return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ESRCH'
    )) {
      throw error;
    }
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(
      () =>
        rejectPromise(
          new Error('Controlled static sandbox provider did not terminate.')
        ),
      15_000
    );
    child.once('close', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
};

const runProvider = (
  request: string,
  bridgePath: string,
  repoRoot: string
): Promise<string> =>
  new Promise((resolvePromise, rejectPromise) => {
    const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
    const child = spawn(process.execPath, [tsxCli, bridgePath], {
      cwd: repoRoot,
      env: minimalProviderEnvironment(),
      detached: true,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let timedOut = false;
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAXIMUM_RESULT_BYTES) {
        timedOut = true;
        void terminateProviderTree(child).finally(() =>
          rejectOnce(
            new Error(
              'Controlled static sandbox provider result exceeded its budget.'
            )
          )
        );
        return;
      }
      output.push(chunk);
    });
    child.stderr.resume();
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateProviderTree(child).finally(() =>
        rejectOnce(new Error('Controlled static sandbox provider timed out.'))
      );
    }, SANDBOX_TIMEOUT_MS);
    child.once('error', () => {
      clearTimeout(timeout);
      rejectOnce(
        new Error('Controlled static sandbox provider could not start.')
      );
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut || settled) return;
      settled = true;
      if (code !== 0 || signal !== null) {
        rejectPromise(
          new Error('Controlled static sandbox provider failed closed.')
        );
        return;
      }
      resolvePromise(Buffer.concat(output).toString('utf8'));
    });
    child.stdin.end(request);
  });

export const runControlledStaticToolchainSandbox = async (
  root: string,
  requestDigest: string,
  snapshot: ExecutableProjectSnapshot,
  runtimeFiles: readonly SandboxRuntimeFile[],
  authority: ControlledStaticToolchainSandboxAuthority
): Promise<ControlledStaticToolchainSandboxExecution> => {
  if (process.platform === 'win32') {
    return runControlledStaticToolchainWindowsSandbox(
      root,
      requestDigest,
      snapshot,
      authority
    );
  }
  if (process.platform !== 'linux') {
    throw new Error(
      'Controlled static toolchain has no adopted sandbox provider for this operating system.'
    );
  }
  const request = canonicalJsonText({
    format: REQUEST_FORMAT,
    requestDigest,
    snapshotDigest: snapshot.contentDigest,
    workspace: snapshot.workspace,
    target: snapshot.target,
    files: runtimeFiles.map(encodedFile),
    toolchain: {
      pnpmVersion: authority.pnpmVersion,
      typescriptVersion: authority.typescriptVersion,
      vitestVersion: authority.vitestVersion,
      viteVersion: authority.viteVersion,
      rollupVersion: authority.rollupVersion,
      rollupImplementation: authority.rollupImplementation,
      rollupAliasSpec: authority.rollupAliasSpec,
      esbuildVersion: authority.esbuildVersion,
      esbuildImplementation: authority.esbuildImplementation,
      esbuildAliasSpec: authority.esbuildAliasSpec,
      manifestDigest: authority.manifestDigest,
      lockDigest: authority.lockDigest,
      toolchainFileSetDigest: authority.toolchainFileSetDigest,
      isolationProbeDigest: authority.isolationProbeDigest,
    },
    testReportFilePath: snapshot.testPlan.reportFilePath,
    coverageSummaryFilePath: '.prodivix/coverage/coverage-summary.json',
    buildOutputDirectoryPath: snapshot.buildPlan.outputDirectoryPath,
  });
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const bridgePath = resolve(
    repoRoot,
    'apps/remote-runner-worker/scripts/run-controlled-static-rootless-sandbox.ts'
  );
  const source = await runProvider(request, bridgePath, repoRoot);
  return decodeControlledStaticToolchainLinuxResult(
    source,
    snapshot,
    requestDigest,
    authority
  );
};
