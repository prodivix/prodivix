import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createExecutionSecretLeakGuard,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectCommand,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type {
  RemoteWorkerSandbox,
  RemoteWorkerSandboxResult,
} from './worker.types';

export type CreateFilesystemProcessSandboxOptions = Readonly<{
  rootDirectory?: string;
  inheritedEnvironmentNames?: readonly string[];
}>;

const safeChildPath = (root: string, path: string): string => {
  const target = resolve(root, ...path.split('/'));
  const child = relative(root, target);
  if (
    !child ||
    child.startsWith(`..${sep}`) ||
    child === '..' ||
    isAbsolute(child)
  )
    throw new TypeError(
      'Remote worker snapshot path escaped the sandbox root.'
    );
  return target;
};

const terminate = (child: ReturnType<typeof spawn>): void => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // Fall through when the process group already exited.
    }
  }
  child.kill('SIGTERM');
};

const forceTerminate = (child: ReturnType<typeof spawn>): void => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Fall through when the process group already exited.
    }
  }
  child.kill('SIGKILL');
};

const commandFor = (
  snapshot: ExecutableProjectSnapshot,
  profile: 'preview' | 'test' | 'build'
): ExecutableProjectCommand =>
  profile === 'preview'
    ? snapshot.previewCommand
    : profile === 'test'
      ? snapshot.testPlan.command
      : snapshot.buildCommand;

type OutputCollector = {
  stdout: string;
  stderr: string;
  truncated: boolean;
  append(stream: 'stdout' | 'stderr', chunk: Buffer): void;
};

const collector = (maximumBytes: number): OutputCollector => {
  let used = 0;
  const output: OutputCollector = {
    stdout: '',
    stderr: '',
    truncated: false,
    append(stream, chunk) {
      const remaining = Math.max(0, maximumBytes - used);
      const accepted = chunk.subarray(0, remaining);
      output[stream] += accepted.toString('utf8');
      used += accepted.length;
      if (accepted.length < chunk.length) output.truncated = true;
    },
  };
  return output;
};

const run = async (
  input: Readonly<{
    root: string;
    command: ExecutableProjectCommand;
    environment: NodeJS.ProcessEnv;
    signal: AbortSignal;
    timeoutMs: number;
    output: OutputCollector;
  }>
): Promise<
  Readonly<{ exitCode?: number; timedOut: boolean; aborted: boolean }>
> =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      input.command.command,
      [...(input.command.args ?? [])],
      {
        cwd: input.root,
        env: input.environment,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let timedOut = false;
    let aborted = input.signal.aborted;
    let forceTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      terminate(child);
      forceTimer ??= setTimeout(() => forceTerminate(child), 1_000);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, input.timeoutMs);
    const onAbort = () => {
      aborted = true;
      stop();
    };
    input.signal.addEventListener('abort', onAbort, { once: true });
    child.stdout?.on('data', (chunk: Buffer) =>
      input.output.append('stdout', chunk)
    );
    child.stderr?.on('data', (chunk: Buffer) =>
      input.output.append('stderr', chunk)
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      input.signal.removeEventListener('abort', onAbort);
      rejectRun(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      input.signal.removeEventListener('abort', onAbort);
      resolveRun({
        ...(code === null ? {} : { exitCode: code }),
        timedOut,
        aborted,
      });
    });
    if (aborted) stop();
  });

/** Reference process supervisor; production deployments must place this worker inside an external rootless sandbox. */
export const createFilesystemProcessSandbox = (
  options: CreateFilesystemProcessSandboxOptions = {}
): RemoteWorkerSandbox => {
  const parent = resolve(options.rootDirectory ?? tmpdir());
  const inheritedNames = new Set(
    options.inheritedEnvironmentNames ?? [
      'PATH',
      'Path',
      'SYSTEMROOT',
      'SystemRoot',
      'COMSPEC',
      'PATHEXT',
      'TMP',
      'TEMP',
    ]
  );
  return Object.freeze({
    async execute(input): Promise<RemoteWorkerSandboxResult> {
      const outputGuard = createExecutionSecretLeakGuard({
        secretValues: input.redactValues,
      });
      await mkdir(parent, { recursive: true });
      const root = await mkdtemp(resolve(parent, 'prodivix-remote-'));
      if (relative(parent, root).startsWith('..'))
        throw new TypeError('Remote worker temporary root escaped its parent.');
      const output = collector(input.maximumOutputBytes);
      try {
        for (const file of projectExecutableProjectRuntimeFiles(
          input.snapshot,
          input.profile
        )) {
          const target = safeChildPath(root, file.path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, file.contents);
        }
        const environment: NodeJS.ProcessEnv = {};
        inheritedNames.forEach((name) => {
          if (process.env[name] !== undefined)
            environment[name] = process.env[name];
        });
        input.snapshot.publicBuildConfiguration.forEach((entry) => {
          environment[entry.name] = entry.value;
        });
        const startedAt = Date.now();
        const install = await run({
          root,
          command: input.snapshot.installCommand,
          environment,
          signal: input.signal,
          timeoutMs: input.timeoutMs,
          output,
        });
        let result = install;
        if (!install.timedOut && !install.aborted && install.exitCode === 0) {
          const remaining = Math.max(
            1,
            input.timeoutMs - (Date.now() - startedAt)
          );
          result = await run({
            root,
            command: commandFor(input.snapshot, input.profile),
            environment,
            signal: input.signal,
            timeoutMs: remaining,
            output,
          });
        }
        const stdout = outputGuard.redactText(output.stdout);
        const stderr = outputGuard.redactText(output.stderr);
        return Object.freeze({
          status: result.aborted
            ? 'cancelled'
            : result.timedOut
              ? 'timed-out'
              : result.exitCode === 0
                ? 'succeeded'
                : 'failed',
          ...(result.exitCode === undefined
            ? {}
            : { exitCode: result.exitCode }),
          stdout: stdout.value,
          stderr: stderr.value,
          outputTruncated: output.truncated,
          secretLeakDetected: stdout.redacted || stderr.redacted,
        });
      } finally {
        const resolvedRoot = resolve(root);
        if (
          resolvedRoot !== parent &&
          !relative(parent, resolvedRoot).startsWith('..')
        )
          await rm(resolvedRoot, { recursive: true, force: true });
      }
    },
  });
};
