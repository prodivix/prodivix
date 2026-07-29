import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';

export type GoldenGeneratedProjectBundle = Readonly<{
  files: readonly Readonly<{
    path: string;
    contents: string | Uint8Array;
  }>[];
}>;

const resolveSafeOutputPath = (root: string, filePath: string): string => {
  const target = resolve(root, filePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Generated file escaped the Golden build root: ${filePath}`
    );
  }
  return target;
};

export const writeGoldenGeneratedProjectBundle = async (
  root: string,
  bundle: GoldenGeneratedProjectBundle
): Promise<void> => {
  for (const file of bundle.files) {
    const target = resolveSafeOutputPath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents);
  }
};

const terminateProcessTree = async (child: ChildProcess): Promise<void> => {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return;
  }
  await new Promise<void>((resolvePromise) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise();
    };
    const timeout = setTimeout(() => {
      killer.kill();
      finish();
    }, 10_000);
    killer.once('error', finish);
    killer.once('close', finish);
  });
};

const runPnpm = async (
  root: string,
  packageManager: string,
  args: readonly string[],
  timeoutMs = 300_000
): Promise<string> => {
  const command = `corepack ${packageManager} ${args.join(' ')}`;
  return new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: root,
      env: {
        ...process.env,
        CI: '1',
        COREPACK_ENABLE_PROJECT_SPEC: '0',
      },
      shell: true,
      windowsHide: true,
    });
    let output = '';
    const collect = (chunk: Buffer | string): void => {
      output = `${output}${String(chunk)}`.slice(-32_000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child).finally(() => {
        rejectPromise(
          new Error(`${command} exceeded ${timeoutMs}ms.\n${output}`)
        );
      });
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      if (timedOut) return;
      rejectPromise(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) return;
      if (code === 0) resolvePromise(output);
      else
        rejectPromise(
          new Error(`${command} exited with code ${code}.\n${output}`)
        );
    });
  });
};

export const readGoldenGeneratedProjectPackageManager = (
  bundle: GoldenGeneratedProjectBundle
): string => {
  const packageFile = bundle.files.find(({ path }) => path === 'package.json');
  if (!packageFile || typeof packageFile.contents !== 'string') {
    throw new Error('Golden standalone export has no package.json.');
  }
  const packageManager = (
    JSON.parse(packageFile.contents) as Readonly<{ packageManager?: unknown }>
  ).packageManager;
  if (
    typeof packageManager !== 'string' ||
    !/^pnpm@[0-9A-Za-z._+-]+$/.test(packageManager)
  ) {
    throw new Error(
      'Golden standalone export must declare one executable pnpm version.'
    );
  }
  return packageManager;
};

export const withGoldenCoverageDependency = (
  bundle: GoldenGeneratedProjectBundle
): GoldenGeneratedProjectBundle => {
  const packageFile = bundle.files.find(({ path }) => path === 'package.json');
  if (!packageFile || typeof packageFile.contents !== 'string') {
    throw new Error('Golden coverage project has no package.json.');
  }
  const manifest = JSON.parse(packageFile.contents) as Readonly<{
    devDependencies?: Readonly<Record<string, string>>;
  }>;
  const packageContents = `${JSON.stringify(
    {
      ...manifest,
      devDependencies: {
        ...(manifest.devDependencies ?? {}),
        '@vitest/coverage-v8': manifest.devDependencies?.vitest ?? '4.1.9',
      },
    },
    null,
    2
  )}\n`;
  return Object.freeze({
    files: Object.freeze(
      bundle.files.map((file) =>
        file.path === 'package.json'
          ? Object.freeze({ ...file, contents: packageContents })
          : file
      )
    ),
  });
};

export const runGoldenStandaloneProjectCommands = async (
  root: string,
  packageManager: string,
  executableSnapshot?: ExecutableProjectSnapshot
): Promise<Readonly<{ buildLog: string; testLog: string }>> => {
  const commandArguments = (
    command: ExecutableProjectSnapshot['buildCommand'],
    label: string
  ): readonly string[] => {
    if (command.command === 'pnpm') {
      return command.args ?? Object.freeze([]);
    }
    if (command.command === 'corepack' && command.args?.[0] === 'pnpm') {
      return Object.freeze(command.args.slice(1));
    }
    throw new Error(
      `Golden ${label} command must use the pinned pnpm project owner.`
    );
  };
  await runPnpm(
    root,
    packageManager,
    executableSnapshot
      ? commandArguments(executableSnapshot.installCommand, 'install')
      : ['install', '--frozen-lockfile=false', '--prefer-offline']
  );
  await runPnpm(root, packageManager, ['typecheck']);
  const testLog = await runPnpm(
    root,
    packageManager,
    executableSnapshot
      ? Object.freeze([
          ...commandArguments(executableSnapshot.testPlan.command, 'test'),
          '--coverage',
          '--coverage.provider=v8',
          '--coverage.reporter=json-summary',
          '--coverage.reportsDirectory=.prodivix/coverage',
        ])
      : ['test']
  );
  const buildLog = await runPnpm(
    root,
    packageManager,
    executableSnapshot
      ? commandArguments(executableSnapshot.buildCommand, 'build')
      : ['build']
  );
  return Object.freeze({ buildLog, testLog });
};
