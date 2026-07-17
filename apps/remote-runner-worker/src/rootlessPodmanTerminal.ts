import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type {
  ExecutionTerminalSignal,
  ExecutionTerminalSize,
} from '@prodivix/runtime-core';
import type { RemoteWorkerTerminalProcess } from './worker.types';

const execFileAsync = promisify(execFile);
const terminalEntryPath = '/opt/prodivix/terminal-entry.sh';
const controlRetryMs = 25;
const controlAttempts = 80;

export type CreateRootlessPodmanTerminalOptions = Readonly<{
  podmanCommand: string;
  containerName: string;
  environment: NodeJS.ProcessEnv;
}>;

const terminalPidFile = (terminalSessionId: string): string =>
  `/tmp/prodivix-terminal-${createHash('sha256')
    .update(terminalSessionId)
    .digest('hex')
    .slice(0, 32)}.pid`;

export const createRootlessPodmanTerminalExecArguments = (input: {
  containerName: string;
  terminalSessionId: string;
  size: ExecutionTerminalSize;
}): readonly string[] =>
  Object.freeze([
    'exec',
    '--interactive',
    '--workdir=/workspace',
    '--env=TERM=xterm-256color',
    `--env=PRODIVIX_TERMINAL_PID_FILE=${terminalPidFile(input.terminalSessionId)}`,
    `--env=PRODIVIX_TERMINAL_COLUMNS=${input.size.columns}`,
    `--env=PRODIVIX_TERMINAL_ROWS=${input.size.rows}`,
    input.containerName,
    terminalEntryPath,
  ]);

const controlScript = Object.freeze({
  ready: 'test -s "$1" && kill -0 "$(cat "$1")"',
  resize: 'pid="$(cat "$1")"; stty cols "$2" rows "$3" < "/proc/$pid/fd/0"',
  terminate: 'pid="$(cat "$1")"; kill -TERM "$pid"',
  kill: 'pid="$(cat "$1")"; kill -KILL "$pid"',
  remove: 'rm -f -- "$1"',
});

/** Creates a PTY inside an already isolated rootless execution container. */
export const createRootlessPodmanTerminalProcess = (
  options: CreateRootlessPodmanTerminalOptions
): RemoteWorkerTerminalProcess => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(options.containerName))
    throw new TypeError('Rootless Terminal container name is invalid.');
  let child: ChildProcessWithoutNullStreams | undefined;
  let pidFile: string | undefined;
  let exited = false;
  let onExit: ((exitCode?: number) => void) | undefined;
  let closeTask: Promise<void> | undefined;

  const control = async (
    script: string,
    ...args: readonly string[]
  ): Promise<void> => {
    await execFileAsync(
      options.podmanCommand,
      [
        'exec',
        options.containerName,
        '/bin/sh',
        '-eu',
        '-c',
        script,
        'prodivix-terminal-control',
        ...args,
      ],
      { env: options.environment }
    );
  };

  const requireOpen = (): Readonly<{
    child: ChildProcessWithoutNullStreams;
    pidFile: string;
  }> => {
    if (!child || !pidFile || exited)
      throw new Error('Rootless Terminal process is not open.');
    return { child, pidFile };
  };

  const waitUntilReady = async (): Promise<void> => {
    for (let attempt = 0; attempt < controlAttempts; attempt += 1) {
      if (exited) throw new Error('Rootless Terminal exited before readiness.');
      try {
        await control(controlScript.ready, pidFile!);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, controlRetryMs));
      }
    }
    throw new Error('Rootless Terminal readiness timed out.');
  };

  const process: RemoteWorkerTerminalProcess = Object.freeze({
    async open(input) {
      if (child) throw new Error('Rootless Terminal is already open.');
      pidFile = terminalPidFile(input.terminalSessionId);
      child = spawn(
        options.podmanCommand,
        [
          ...createRootlessPodmanTerminalExecArguments({
            containerName: options.containerName,
            terminalSessionId: input.terminalSessionId,
            size: input.size,
          }),
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: options.environment,
        }
      );
      onExit = input.onExit;
      child.stdout.on('data', (chunk: Buffer) =>
        input.onOutput({ stream: 'stdout', data: chunk.toString('utf8') })
      );
      child.stderr.on('data', (chunk: Buffer) =>
        input.onOutput({ stream: 'stderr', data: chunk.toString('utf8') })
      );
      child.once('close', (code) => {
        exited = true;
        onExit?.(code ?? undefined);
      });
      child.once('error', () => {
        exited = true;
        onExit?.();
      });
      try {
        await waitUntilReady();
      } catch (error) {
        await process.close('transport-lost');
        throw error;
      }
    },
    async write(data) {
      const active = requireOpen();
      await new Promise<void>((resolve, reject) => {
        active.child.stdin.write(data, (error) =>
          error ? reject(error) : resolve()
        );
      });
    },
    async resize(size) {
      const active = requireOpen();
      await control(
        controlScript.resize,
        active.pidFile,
        String(size.columns),
        String(size.rows)
      );
    },
    async signal(signal: ExecutionTerminalSignal) {
      const active = requireOpen();
      if (signal === 'interrupt') {
        await new Promise<void>((resolve, reject) => {
          active.child.stdin.write('\u0003', (error) =>
            error ? reject(error) : resolve()
          );
        });
        return;
      }
      await control(controlScript.terminate, active.pidFile);
    },
    async close() {
      if (closeTask) return closeTask;
      closeTask = (async () => {
        if (!child || !pidFile) return;
        const activeChild = child;
        const activePidFile = pidFile;
        if (!exited)
          await control(controlScript.terminate, activePidFile).catch(
            () => undefined
          );
        activeChild.stdin.end();
        if (!exited) {
          await Promise.race([
            new Promise<void>((resolve) =>
              activeChild.once('close', () => resolve())
            ),
            new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
          ]);
        }
        if (!exited) {
          await control(controlScript.kill, activePidFile).catch(
            () => undefined
          );
          activeChild.kill('SIGKILL');
        }
        await control(controlScript.remove, activePidFile).catch(
          () => undefined
        );
      })();
      return closeTask;
    },
  });
  return process;
};
