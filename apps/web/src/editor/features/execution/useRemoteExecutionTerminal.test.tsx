import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  ExecutionTerminalAvailability,
  ExecutionTerminalSnapshot,
  ExecutionTerminalWriteResult,
} from '@prodivix/runtime-core';
import type { RemoteExecutionTerminalClient } from '@prodivix/runtime-remote';
import { describe, expect, it } from 'vitest';
import { useRemoteExecutionTerminal } from './useRemoteExecutionTerminal';

const availability: ExecutionTerminalAvailability = Object.freeze({
  status: 'available',
  providerId: 'remote',
  jobId: 'execution-1',
});

const snapshot = (): ExecutionTerminalSnapshot =>
  Object.freeze({
    terminalSessionId: 'terminal-1',
    executionId: 'execution-1',
    jobId: 'execution-1',
    providerId: 'remote',
    providerVersion: '1',
    capability: 'shell',
    status: 'open',
    revision: 1,
    size: { columns: 100, rows: 30 },
    openedAt: 0,
    updatedAt: 0,
    leaseExpiresAt: 600_000,
    latestOutputCursor: 0,
    earliestRetainedOutputCursor: 0,
    retainedOutputBytes: 0,
    droppedOutputRecords: 0,
    droppedOutputBytes: 0,
    latestClientSequence: 0,
  });

const createClient = (
  write: (input: {
    clientSequence: number;
    data: string;
  }) => Promise<ExecutionTerminalWriteResult>
) => {
  const writes: { clientSequence: number; data: string }[] = [];
  const client = {
    open: async () => ({
      protocol: 'prodivix.remote-execution-terminal',
      version: 1,
      snapshot: snapshot(),
      access: { token: 'access-1', expiresAt: Date.now() + 600_000 },
    }),
    resume: async () => ({
      protocol: 'prodivix.remote-execution-terminal',
      version: 1,
      snapshot: snapshot(),
      access: { token: 'access-1', expiresAt: Date.now() + 600_000 },
    }),
    read: async () => ({
      status: 'open',
      nextCursor: 0,
      latestCursor: 0,
      earliestAvailableCursor: 0,
      gap: false,
      hasMore: false,
      records: [],
    }),
    write: async (input: { clientSequence: number; data: string }) => {
      writes.push({ clientSequence: input.clientSequence, data: input.data });
      return write(input);
    },
    resize: async () => ({
      status: 'unchanged',
      size: { columns: 100, rows: 30 },
    }),
    signal: async () => ({ status: 'accepted' }),
    close: async () => ({ status: 'closed' }),
  } as unknown as RemoteExecutionTerminalClient;
  return { client, writes };
};

const openTerminal = async (client: RemoteExecutionTerminalClient) => {
  const hook = renderHook(() =>
    useRemoteExecutionTerminal({ enabled: true, availability, client })
  );
  await act(async () => {
    await hook.result.current.open();
  });
  await waitFor(() => expect(hook.result.current.view.phase).toBe('open'));
  return hook;
};

describe('remote execution terminal input', () => {
  it.each(['accepted', 'transport-error'] as const)(
    'isolates a reopened session from an old %s write completion',
    async (outcome) => {
      let settleOld!: (result: ExecutionTerminalWriteResult) => void;
      let rejectOld!: (error: Error) => void;
      let settleNew!: (result: ExecutionTerminalWriteResult) => void;
      const oldWrite = new Promise<ExecutionTerminalWriteResult>(
        (resolve, reject) => {
          settleOld = resolve;
          rejectOld = reject;
        }
      );
      const newWrite = new Promise<ExecutionTerminalWriteResult>((resolve) => {
        settleNew = resolve;
      });
      const { client, writes } = createClient(
        async ({ data, clientSequence }) =>
          data === 'old'
            ? oldWrite
            : data === 'new'
              ? newWrite
              : { status: 'accepted', clientSequence }
      );
      const { result } = await openTerminal(client);
      let oldInput!: Promise<boolean>;
      act(() => {
        oldInput = result.current.send('old');
      });
      await act(async () => {
        await result.current.close();
      });
      await expect(oldInput).resolves.toBe(false);
      await act(async () => {
        await result.current.open();
      });
      let newInput!: Promise<boolean>;
      act(() => {
        newInput = result.current.send('new');
      });
      expect(writes).toEqual([
        { clientSequence: 1, data: 'old' },
        { clientSequence: 1, data: 'new' },
      ]);
      await act(async () => {
        if (outcome === 'accepted')
          settleOld({ status: 'accepted', clientSequence: 1 });
        else rejectOld(new Error('Old transport disconnected'));
        await Promise.resolve();
      });
      expect(result.current.view.phase).toBe('open');
      expect(result.current.view.error).toBeUndefined();
      await act(async () => {
        settleNew({ status: 'accepted', clientSequence: 1 });
        await expect(newInput).resolves.toBe(true);
        await expect(result.current.send('next')).resolves.toBe(true);
      });
      expect(writes.at(-1)).toEqual({ clientSequence: 2, data: 'next' });
    }
  );

  it('ignores a resize result from a closed session', async () => {
    let settleResize!: (
      value: Awaited<ReturnType<RemoteExecutionTerminalClient['resize']>>
    ) => void;
    const { client } = createClient(async ({ clientSequence }) => ({
      status: 'accepted',
      clientSequence,
    }));
    const { result } = await openTerminal({
      ...client,
      resize: () =>
        new Promise((resolve) => {
          settleResize = resolve;
        }),
    });
    let resizing!: Promise<boolean>;
    act(() => {
      resizing = result.current.resize(120, 40);
    });
    await act(async () => {
      await result.current.close();
      await result.current.open();
    });
    await act(async () => {
      settleResize({ status: 'accepted', size: { columns: 120, rows: 40 } });
      await expect(resizing).resolves.toBe(false);
    });
    expect(result.current.emulator.size).toEqual({ columns: 100, rows: 30 });
  });

  it('reports discarded input instead of swallowing a refused write', async () => {
    const { client } = createClient(async ({ clientSequence }) => ({
      status: 'rejected',
      clientSequence,
    }));
    const { result } = await openTerminal(client);

    await act(async () => {
      await expect(result.current.send('npm test\r')).resolves.toBe(false);
    });

    expect(result.current.view.error).toBe('input-rejected');
  });

  it('keeps a refused-input error visible across output polls', async () => {
    const { client } = createClient(async ({ clientSequence }) => ({
      status: 'rejected',
      clientSequence,
    }));
    const { result } = await openTerminal(client);

    await act(async () => {
      await result.current.send('npm test\r');
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.view.error).toBe('input-rejected');
  });

  it('closes the view when the execution reports the terminal already closed', async () => {
    const { client } = createClient(async ({ clientSequence }) => ({
      status: 'closed',
      clientSequence,
    }));
    const { result } = await openTerminal(client);

    await act(async () => {
      await expect(result.current.send('ls\r')).resolves.toBe(false);
    });

    expect(result.current.view.phase).toBe('closed');
  });

  it('adopts the expected sequence and resends the exact chunk once', async () => {
    let refused = true;
    const { client, writes } = createClient(async ({ clientSequence }) => {
      if (refused) {
        refused = false;
        return {
          status: 'out-of-order',
          clientSequence,
          expectedClientSequence: 7,
        };
      }
      return { status: 'accepted', clientSequence };
    });
    const { result } = await openTerminal(client);

    await act(async () => {
      await expect(result.current.send('echo hi\r')).resolves.toBe(true);
    });

    expect(writes).toEqual([
      { clientSequence: 1, data: 'echo hi\r' },
      { clientSequence: 7, data: 'echo hi\r' },
    ]);
    expect(result.current.view.error).toBeUndefined();

    await act(async () => {
      await expect(result.current.send('echo bye\r')).resolves.toBe(true);
    });
    expect(writes.at(-1)).toEqual({ clientSequence: 8, data: 'echo bye\r' });
  });

  it('surfaces a desynchronized sequence the execution never resolves', async () => {
    const { client } = createClient(async ({ clientSequence }) => ({
      status: 'stale',
      clientSequence,
    }));
    const { result } = await openTerminal(client);

    await act(async () => {
      await expect(result.current.send('ls\r')).resolves.toBe(false);
    });

    expect(result.current.view.error).toBe('input-desynchronized');
  });

  it('abandons the queue behind a discarded chunk instead of reordering it', async () => {
    const { client, writes } = createClient(async ({ clientSequence }) => ({
      status: 'rejected',
      clientSequence,
    }));
    const { result } = await openTerminal(client);

    await act(async () => {
      const first = result.current.send('a');
      const second = result.current.send('b');
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
    });

    expect(writes).toEqual([{ clientSequence: 1, data: 'a' }]);
    expect(result.current.view.error).toBe('input-rejected');
  });
});
