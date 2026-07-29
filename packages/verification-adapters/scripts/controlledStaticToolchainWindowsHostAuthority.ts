import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import type { WindowsLauncherAuthority } from './controlledStaticToolchainWindowsLauncherTypes';

const MAXIMUM_LAUNCHER_OUTPUT_BYTES = 16 * 1024 * 1024;
export const WINDOWS_MAXIMUM_COMMAND_TIMEOUT_MS = 60_000;
export const WINDOWS_LAUNCHER_CLEANUP_GRACE_MS = 15_000;

const boundedDiagnostic = (source: Buffer | string): string =>
  (typeof source === 'string' ? source : source.toString('utf8'))
    .replace(/[A-Za-z]:\\[^:\r\n"']*/gu, '<private-windows-path>')
    .slice(0, 4_096)
    .trim();

export const digestBytes = (contents: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const compareCSharpOrdinalIgnoreCaseThenOrdinal = (
  left: string,
  right: string
): number => {
  const insensitive = compareUnicodeCodePoints(
    left.toUpperCase(),
    right.toUpperCase()
  );
  return insensitive || compareUnicodeCodePoints(left, right);
};

export const expectedMappedEnvironmentDigest = (
  sourceRoot: string,
  profileRoot: string,
  environment: Readonly<Record<string, string>>
): string => {
  if (
    [...sourceRoot, ...profileRoot, ...Object.values(environment)].some(
      (value) => /[^\u0020-\u007e]/u.test(value)
    )
  ) {
    throw new TypeError(
      'Windows AppContainer environment authority must use exact Basic Latin values.'
    );
  }
  const normalizedSourceRoot = sourceRoot.endsWith('\\')
    ? sourceRoot.slice(0, -1)
    : sourceRoot;
  const profileStorageRoot = dirname(profileRoot);
  const sourcePrefix = `${normalizedSourceRoot}\\`;
  const mappedEnvironment = Object.entries(environment)
    .sort(([left], [right]) =>
      compareCSharpOrdinalIgnoreCaseThenOrdinal(left, right)
    )
    .map(([key, value]) => {
      const lowerValue = value.toLowerCase();
      const lowerRoot = normalizedSourceRoot.toLowerCase();
      const lowerPrefix = sourcePrefix.toLowerCase();
      const mappedValue =
        key === 'APPDATA'
          ? resolve(profileStorageRoot, 'AppData')
          : key === 'HOME' || key === 'USERPROFILE'
            ? resolve(profileStorageRoot, 'Profile')
            : key === 'LOCALAPPDATA'
              ? profileStorageRoot
              : key === 'TEMP' || key === 'TMP'
                ? resolve(profileStorageRoot, 'Temp')
                : lowerValue === lowerRoot
                  ? profileRoot
                  : lowerValue.startsWith(lowerPrefix)
                    ? `${profileRoot}\\${value.slice(sourcePrefix.length)}`
                    : value;
      return Object.freeze({ key, value: mappedValue });
    });
  return digestBytes(JSON.stringify(mappedEnvironment));
};

export const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    keys.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new TypeError(`${label} fields drifted.`);
  }
  return value;
};

const terminateWindowsTree = async (child: ChildProcess): Promise<void> => {
  if (
    child.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    return;
  }
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot) {
    throw new Error('Windows process-tree authority has no SystemRoot.');
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const killer = spawn(
      resolve(systemRoot, 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      {
        env: { SystemRoot: systemRoot },
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      }
    );
    const timeout = setTimeout(() => {
      killer.kill('SIGKILL');
      rejectPromise(new Error('Windows process-tree cleanup timed out.'));
    }, 15_000);
    killer.once('error', rejectPromise);
    killer.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || child.exitCode !== null) resolvePromise();
      else rejectPromise(new Error('Windows process-tree cleanup failed.'));
    });
  });
};

export const runHostProcess = (
  application: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
  maximumOutputBytes = MAXIMUM_LAUNCHER_OUTPUT_BYTES
): Promise<
  Readonly<{
    stdout: Buffer;
    stderr: Buffer;
    startedAtEpochMs: number;
    completedAtEpochMs: number;
  }>
> => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs >
      WINDOWS_MAXIMUM_COMMAND_TIMEOUT_MS + WINDOWS_LAUNCHER_CLEANUP_GRACE_MS
  ) {
    return Promise.reject(
      new TypeError('Windows host process timeout is invalid.')
    );
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const startedAtEpochMs = Date.now();
    const child = spawn(application, [...args], {
      cwd,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let settled = false;
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      rejectPromise(error);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maximumOutputBytes) {
        timedOut = true;
        void terminateWindowsTree(child).finally(() =>
          rejectOnce(new Error('Windows host process output exceeded budget.'))
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > maximumOutputBytes) {
        timedOut = true;
        void terminateWindowsTree(child).finally(() =>
          rejectOnce(new Error('Windows host process output exceeded budget.'))
        );
        return;
      }
      stderr.push(chunk);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      void terminateWindowsTree(child).finally(() =>
        rejectOnce(new Error('Windows host process timed out.'))
      );
    }, timeoutMs);
    child.once('error', () => {
      clearTimeout(timeout);
      rejectOnce(new Error('Windows host process could not start.'));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut || settled) return;
      settled = true;
      if (code !== 0 || signal !== null) {
        const diagnostic =
          boundedDiagnostic(Buffer.concat(stderr)) ||
          boundedDiagnostic(Buffer.concat(stdout)) ||
          'no output';
        rejectPromise(
          new Error(
            `Windows host process failed closed (${code ?? signal ?? 'unknown'}): ${diagnostic}`
          )
        );
        return;
      }
      resolvePromise({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        startedAtEpochMs,
        completedAtEpochMs: Date.now(),
      });
    });
  });
};

const dotnetPath = (): string => {
  const programFiles = process.env.ProgramFiles;
  if (!programFiles) {
    throw new Error('Windows .NET authority has no ProgramFiles.');
  }
  return resolve(programFiles, 'dotnet/dotnet.exe');
};

export const dotnetHostEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
  };
  for (const name of [
    'SystemRoot',
    'PATH',
    'ProgramFiles',
    'USERPROFILE',
    'LOCALAPPDATA',
    'APPDATA',
    'TEMP',
    'TMP',
  ] as const) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  return environment;
};

const launcherSourceRoot = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), 'windows-sandbox');

const launcherSourceDigest = async (): Promise<string> => {
  const root = launcherSourceRoot();
  const names = (await readdir(root))
    .filter((name) => name.endsWith('.cs') || name.endsWith('.csproj'))
    .sort(compareUnicodeCodePoints);
  const facts = await Promise.all(
    names.map(async (name) => {
      const contents = new Uint8Array(await readFile(resolve(root, name)));
      return Object.freeze({
        path: name,
        size: contents.byteLength,
        digest: digestBytes(contents),
      });
    })
  );
  return digestBytes(canonicalJsonText(facts));
};

let launcherAuthorityTask: Promise<WindowsLauncherAuthority> | undefined;

export const prepareWindowsLauncherAuthority =
  (): Promise<WindowsLauncherAuthority> => {
    launcherAuthorityTask ??= (async () => {
      if (process.platform !== 'win32') {
        throw new Error('Windows AppContainer launcher requires Windows.');
      }
      const sourceRoot = launcherSourceRoot();
      const buildRoot = await mkdtemp(
        join(tmpdir(), 'prodivix-windows-launcher-')
      );
      const buildSourceRoot = resolve(buildRoot, 'src');
      const outputRoot = resolve(buildRoot, 'out');
      await mkdir(buildSourceRoot, { recursive: true });
      const sourceNames = (await readdir(sourceRoot)).filter(
        (name) => name.endsWith('.cs') || name.endsWith('.csproj')
      );
      await Promise.all(
        sourceNames.map((name) =>
          copyFile(resolve(sourceRoot, name), resolve(buildSourceRoot, name))
        )
      );
      const dotnet = dotnetPath();
      const environment = dotnetHostEnvironment();
      const { stdout: versionOutput } = await runHostProcess(
        dotnet,
        ['--version'],
        buildSourceRoot,
        environment,
        15_000
      );
      const dotnetVersion = versionOutput.toString('utf8').trim();
      if (
        !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(dotnetVersion)
      ) {
        throw new Error('Windows .NET SDK version is invalid.');
      }
      await runHostProcess(
        dotnet,
        [
          'build',
          'Prodivix.StaticSandbox.csproj',
          '--configuration',
          'Release',
          '--nologo',
          '--output',
          outputRoot,
        ],
        buildSourceRoot,
        environment,
        60_000
      );
      const assemblyPath = resolve(outputRoot, 'Prodivix.StaticSandbox.dll');
      const assembly = new Uint8Array(await readFile(assemblyPath));
      return Object.freeze({
        sourceDigest: await launcherSourceDigest(),
        assemblyDigest: digestBytes(assembly),
        dotnetVersion,
        assemblyPath,
        dotnetPath: dotnet,
      });
    })();
    return launcherAuthorityTask;
  };
