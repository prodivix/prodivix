import { describe, expect, it, vi } from 'vitest';
import type {
  RemoteExecutionTerminalCommand,
  RemoteExecutionTerminalWorkerReadResult,
} from '@prodivix/runtime-remote';
import type {
  RemoteWorkerTerminalControlPlaneClient,
  RemoteWorkerTerminalProcess,
} from './worker.types';
import { createRemoteWorkerTerminalCoordinator } from './workerTerminalCoordinator';

const page = (
  acknowledgedCommandCursor: number,
  commands: readonly RemoteExecutionTerminalCommand[]
): RemoteExecutionTerminalWorkerReadResult =>
  Object.freeze({
    terminalSessionId: 'terminal-1',
    executionId: 'execution-1',
    acknowledgedCommandCursor,
    latestCommandCursor: 5,
    hasMore: false,
    commands: Object.freeze(commands),
  });

describe('Remote worker Terminal coordinator', () => {
  it('acknowledges ordered PTY effects and redacts cross-chunk output before transport', async () => {
    const acknowledgements: number[] = [];
    const published: string[] = [];
    const outputAttempts: string[] = [];
    const redactions: boolean[] = [];
    const closeReasons: string[] = [];
    let resolveClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const firstCommands: readonly RemoteExecutionTerminalCommand[] = [
      {
        cursor: 1,
        kind: 'open',
        terminalSessionId: 'terminal-1',
        size: { columns: 80, rows: 24 },
      },
      {
        cursor: 2,
        kind: 'input',
        terminalSessionId: 'terminal-1',
        clientSequence: 1,
        data: 'pwd\n',
      },
      {
        cursor: 3,
        kind: 'resize',
        terminalSessionId: 'terminal-1',
        size: { columns: 100, rows: 30 },
      },
      {
        cursor: 4,
        kind: 'signal',
        terminalSessionId: 'terminal-1',
        signal: 'interrupt',
      },
    ];
    const client: RemoteWorkerTerminalControlPlaneClient = {
      async readTerminalCommands(input) {
        acknowledgements.push(input.acknowledgedCommandCursor);
        return input.acknowledgedCommandCursor === 0
          ? page(0, firstCommands)
          : page(4, [
              {
                cursor: 5,
                kind: 'close',
                terminalSessionId: 'terminal-1',
                reason: 'client-closed',
              },
            ]);
      },
      async publishTerminalOutput(input) {
        outputAttempts.push(input.workerOutputId);
        if (outputAttempts.length === 1)
          throw new Error('simulated response loss');
        published.push(input.data);
        redactions.push(input.redacted);
        return 'stored';
      },
      async closeTerminal(input) {
        closeReasons.push(input.reason);
        resolveClosed();
        return true;
      },
    };
    const effects: string[] = [];
    const process: RemoteWorkerTerminalProcess = {
      async open(input) {
        effects.push(`open:${input.size.columns}x${input.size.rows}`);
        input.onOutput({ stream: 'stdout', data: 'safe:worker-' });
        input.onOutput({ stream: 'stderr', data: 'stderr-safe\n' });
        input.onOutput({ stream: 'stdout', data: 'terminal-' });
        input.onOutput({ stream: 'stdout', data: 'canary:tail' });
      },
      async write(data) {
        effects.push(`write:${data}`);
      },
      async resize(size) {
        effects.push(`resize:${size.columns}x${size.rows}`);
      },
      async signal(signal) {
        effects.push(`signal:${signal}`);
      },
      async close(reason) {
        effects.push(`close:${reason}`);
      },
    };
    const coordinator = createRemoteWorkerTerminalCoordinator({
      client,
      delay: async () => undefined,
    });
    const disconnect = await coordinator.connect({
      executionId: 'execution-1',
      workerId: 'worker-1',
      leaseToken: 'lease-token',
      workerAttempt: 1,
      process,
      signal: new AbortController().signal,
      redactValues: ['worker-terminal-canary'],
    });
    await closed;
    await disconnect();

    expect(acknowledgements.slice(0, 2)).toEqual([0, 4]);
    expect(effects).toEqual([
      'open:80x24',
      'write:pwd\n',
      'resize:100x30',
      'signal:interrupt',
      'close:client-closed',
      'close:execution-ended',
    ]);
    expect(published.join('')).toBe('safe:stderr-safe\n[REDACTED]:tail');
    expect(published.join('')).not.toContain('worker-terminal-canary');
    expect(outputAttempts[0]).toBe(outputAttempts[1]);
    expect(redactions).toContain(true);
    expect(closeReasons).toEqual(['client-closed']);
  });

  it('fails closed when a PTY effect rejects before acknowledgement', async () => {
    const closeTerminal = vi.fn(async () => true);
    const processClose = vi.fn(async () => undefined);
    const coordinator = createRemoteWorkerTerminalCoordinator({
      client: {
        async readTerminalCommands() {
          return page(0, [
            {
              cursor: 1,
              kind: 'open',
              terminalSessionId: 'terminal-1',
              size: { columns: 80, rows: 24 },
            },
            {
              cursor: 2,
              kind: 'input',
              terminalSessionId: 'terminal-1',
              clientSequence: 1,
              data: 'unsafe\n',
            },
          ]);
        },
        async publishTerminalOutput() {
          return 'stored';
        },
        closeTerminal,
      },
      delay: async () => undefined,
    });
    const disconnect = await coordinator.connect({
      executionId: 'execution-1',
      workerId: 'worker-1',
      leaseToken: 'lease-token',
      workerAttempt: 1,
      signal: new AbortController().signal,
      redactValues: [],
      process: {
        async open() {},
        async write() {
          throw new Error('PTY write failed');
        },
        async resize() {},
        async signal() {},
        close: processClose,
      },
    });
    await vi.waitFor(() =>
      expect(closeTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'transport-lost' })
      )
    );
    await disconnect();
    expect(processClose).toHaveBeenCalledWith('transport-lost');
  });
});
