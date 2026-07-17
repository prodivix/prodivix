import {
  createExecutionSecretTextStreamRedactor,
  EXECUTION_TERMINAL_LIMITS,
  type ExecutionTerminalCloseReason,
} from '@prodivix/runtime-core';
import type {
  RemoteWorkerTerminalControlPlaneClient,
  RemoteWorkerTerminalCoordinator,
} from './worker.types';

export type CreateRemoteWorkerTerminalCoordinatorOptions = Readonly<{
  client: RemoteWorkerTerminalControlPlaneClient;
  pollIntervalMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
}>;

const defaultDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const maximumTransportAttempts = 3;

const splitOutput = (value: string): readonly string[] => {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (
      current &&
      currentBytes + characterBytes >
        EXECUTION_TERMINAL_LIMITS.maximumOutputChunkBytes
    ) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current) chunks.push(current);
  return Object.freeze(chunks);
};

/**
 * Bridges one lease-fenced worker process to the ephemeral Terminal mailbox.
 * Commands are acknowledged only after the local PTY side effect succeeds.
 */
export const createRemoteWorkerTerminalCoordinator = (
  options: CreateRemoteWorkerTerminalCoordinatorOptions
): RemoteWorkerTerminalCoordinator => {
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1)
    throw new TypeError('Remote worker Terminal poll interval is invalid.');
  const delay = options.delay ?? defaultDelay;

  return Object.freeze({
    async connect(input) {
      let stopped = false;
      let opened = false;
      let acknowledgedCommandCursor = 0;
      let terminalSessionId: string | undefined;
      let outputSequence = 0;
      let outputTail: Promise<void> = Promise.resolve();
      let closeTask: Promise<void> | undefined;
      let transportFailureTask: Promise<void> | undefined;
      let transportFailureScheduled = false;
      let desiredCloseReason: ExecutionTerminalCloseReason | undefined;
      let consecutiveReadFailures = 0;
      const outputRedactors = Object.freeze({
        stdout: createExecutionSecretTextStreamRedactor({
          secretValues: input.redactValues,
        }),
        stderr: createExecutionSecretTextStreamRedactor({
          secretValues: input.redactValues,
        }),
      });

      const scheduleTransportFailure = (): void => {
        if (transportFailureScheduled || transportFailureTask) return;
        transportFailureScheduled = true;
        globalThis.queueMicrotask(() => {
          transportFailureScheduled = false;
          void failTransport().catch(() => undefined);
        });
      };

      const publishOutput = (
        stream: 'stdout' | 'stderr',
        data: string,
        redacted: boolean
      ): void => {
        if (!terminalSessionId || !data) return;
        for (const chunk of splitOutput(data)) {
          outputSequence += 1;
          const workerOutputId = `${input.workerAttempt}:terminal:${terminalSessionId}:${outputSequence}`;
          outputTail = outputTail
            .then(async () => {
              for (
                let attempt = 1;
                attempt <= maximumTransportAttempts;
                attempt += 1
              ) {
                try {
                  const result = await options.client.publishTerminalOutput({
                    executionId: input.executionId,
                    workerId: input.workerId,
                    leaseToken: input.leaseToken,
                    terminalSessionId: terminalSessionId!,
                    workerOutputId,
                    stream,
                    data: chunk,
                    redacted,
                  });
                  if (result === 'stored' || result === 'existing') return;
                  throw new Error(`Remote Terminal output rejected: ${result}`);
                } catch (error) {
                  if (attempt === maximumTransportAttempts) throw error;
                  await delay(pollIntervalMs);
                }
              }
            })
            .catch(() => scheduleTransportFailure());
        }
      };

      const flushOutput = (): void => {
        (['stdout', 'stderr'] as const).forEach((stream) => {
          const flushed = outputRedactors[stream].flush();
          publishOutput(stream, flushed.value, flushed.redacted);
        });
      };

      const publishClose = async (
        reason: ExecutionTerminalCloseReason,
        exitCode?: number
      ): Promise<void> => {
        if (!terminalSessionId) return;
        closeTask ??= (async () => {
          flushOutput();
          await outputTail.catch(() => undefined);
          await options.client
            .closeTerminal({
              executionId: input.executionId,
              workerId: input.workerId,
              leaseToken: input.leaseToken,
              terminalSessionId: terminalSessionId!,
              reason,
              ...(exitCode === undefined ? {} : { exitCode }),
            })
            .catch(() => false);
        })();
        await closeTask;
      };

      const failTransport = async (): Promise<void> => {
        transportFailureTask ??= (async () => {
          desiredCloseReason = 'transport-lost';
          stopped = true;
          await input.process.close('transport-lost').catch(() => undefined);
          await publishClose('transport-lost');
        })();
        await transportFailureTask;
      };

      const run = async (): Promise<void> => {
        while (!stopped && !input.signal.aborted) {
          let page;
          try {
            page = await options.client.readTerminalCommands({
              executionId: input.executionId,
              workerId: input.workerId,
              leaseToken: input.leaseToken,
              acknowledgedCommandCursor,
            });
          } catch {
            consecutiveReadFailures += 1;
            if (consecutiveReadFailures >= maximumTransportAttempts) {
              await failTransport();
              return;
            }
            await delay(pollIntervalMs);
            continue;
          }
          consecutiveReadFailures = 0;
          if (!page) {
            await delay(pollIntervalMs);
            continue;
          }
          if (
            terminalSessionId !== undefined &&
            terminalSessionId !== page.terminalSessionId
          ) {
            await failTransport();
            return;
          }
          terminalSessionId = page.terminalSessionId;
          for (const command of page.commands) {
            if (stopped || input.signal.aborted) return;
            try {
              switch (command.kind) {
                case 'open':
                  if (opened) throw new Error('Terminal already opened.');
                  await input.process.open({
                    terminalSessionId: command.terminalSessionId,
                    size: command.size,
                    onOutput(output) {
                      const safe = outputRedactors[output.stream].push(
                        output.data
                      );
                      publishOutput(output.stream, safe.value, safe.redacted);
                    },
                    onExit(exitCode) {
                      stopped = true;
                      void publishClose(
                        desiredCloseReason ?? 'provider-closed',
                        exitCode
                      );
                    },
                  });
                  opened = true;
                  break;
                case 'input':
                  if (!opened) throw new Error('Terminal is not open.');
                  await input.process.write(command.data);
                  break;
                case 'resize':
                  if (!opened) throw new Error('Terminal is not open.');
                  await input.process.resize(command.size);
                  break;
                case 'signal':
                  if (!opened) throw new Error('Terminal is not open.');
                  await input.process.signal(command.signal);
                  break;
                case 'close':
                  desiredCloseReason = command.reason;
                  await input.process.close(command.reason);
                  stopped = true;
                  await publishClose(command.reason);
                  break;
              }
              acknowledgedCommandCursor = command.cursor;
            } catch {
              await failTransport();
              return;
            }
          }
          if (!page.commands.length || page.hasMore === false)
            await delay(pollIntervalMs);
        }
      };

      const task = run();
      return async () => {
        const reason: ExecutionTerminalCloseReason = input.signal.aborted
          ? 'transport-lost'
          : 'execution-ended';
        desiredCloseReason = reason;
        stopped = true;
        await input.process.close(reason).catch(() => undefined);
        await publishClose(reason);
        await task.catch(() => undefined);
        await outputTail.catch(() => undefined);
      };
    },
  });
};
