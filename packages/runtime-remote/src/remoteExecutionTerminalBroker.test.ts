import { describe, expect, it } from 'vitest';
import {
  createExecutionProviderDescriptor,
  createExecutionRequest,
  EXECUTION_SECRET_REDACTION_MARKER,
} from '@prodivix/runtime-core';
import type { RemoteExecutionStoredRecord } from './remoteExecutionControlPlane.types';
import {
  createRemoteExecutionTerminalBroker,
  RemoteExecutionTerminalBrokerError,
} from './remoteExecutionTerminalBroker';

const provider = createExecutionProviderDescriptor({
  id: 'prodivix.remote.preview',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['terminal'],
});

const request = createExecutionRequest({
  requestId: 'request-1',
  profile: 'preview',
  runtimeZone: 'client',
  workspace: { workspaceId: 'workspace-1', snapshotId: 'snapshot-1' },
  invocation: {
    kind: 'workspace',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
  },
});

const createExecution = (): RemoteExecutionStoredRecord =>
  Object.freeze({
    ownerId: 'principal-1',
    identityKey: 'identity-1',
    request,
    snapshotId: 'snapshot-1',
    record: Object.freeze({
      executionId: 'execution-1',
      requestId: request.requestId,
      snapshotDigest:
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      provider,
      status: 'running',
      latestCursor: 1,
      createdAt: 10,
      startedAt: 20,
    }),
    events: Object.freeze([]),
    artifacts: Object.freeze([]),
    cancellationIds: Object.freeze([]),
    lease: Object.freeze({
      workerId: 'worker-1',
      token: 'worker-lease-secret',
      attempt: 1,
      acquiredAt: 20,
      expiresAt: 10_000,
    }),
  });

describe('Remote execution Terminal broker', () => {
  it('fences tokens and worker leases while preserving reconnect cursors', async () => {
    let clock = 100;
    let tokenSequence = 0;
    let execution = createExecution();
    const canary = 'terminal-secret-canary';
    const broker = createRemoteExecutionTerminalBroker({
      resolveExecution: async () => execution,
      createTerminalSessionId: () => 'terminal-1',
      createAccessToken: () => `terminal-token-${++tokenSequence}`,
      secretValues: [canary],
      now: () => clock,
    });
    const principal = Object.freeze({
      subjectId: 'principal-1',
      scopes: Object.freeze(['remote-execution:terminal']),
    });

    const opened = await broker.open({
      principal,
      executionId: 'execution-1',
      size: { columns: 100, rows: 30 },
    });
    expect(opened.access.token).toBe('terminal-token-1');
    expect(opened.snapshot).toMatchObject({
      status: 'open',
      executionId: 'execution-1',
      terminalSessionId: 'terminal-1',
    });

    expect(
      await broker.write({
        accessToken: opened.access.token,
        executionId: 'execution-1',
        terminalSessionId: 'terminal-1',
        data: 'echo safe\n',
        clientSequence: 1,
      })
    ).toEqual({ status: 'accepted', clientSequence: 1 });
    expect(
      await broker.write({
        accessToken: opened.access.token,
        executionId: 'execution-1',
        terminalSessionId: 'terminal-1',
        data: 'echo safe\n',
        clientSequence: 1,
      })
    ).toEqual({ status: 'duplicate', clientSequence: 1 });

    const commands = await broker.readWorkerCommands({
      executionId: 'execution-1',
      workerId: 'worker-1',
      leaseToken: 'worker-lease-secret',
      acknowledgedCommandCursor: 0,
    });
    expect(commands?.commands.map((command) => command.kind)).toEqual([
      'open',
      'input',
    ]);
    expect(
      await broker.readWorkerCommands({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: 'worker-lease-secret',
        acknowledgedCommandCursor: 2,
      })
    ).toMatchObject({ commands: [] });

    for (const [index, data] of [
      'visible:terminal-',
      'secret-',
      'canary:tail',
    ].entries()) {
      expect(
        await broker.publishWorkerOutput({
          executionId: 'execution-1',
          workerId: 'worker-1',
          leaseToken: 'worker-lease-secret',
          terminalSessionId: 'terminal-1',
          workerOutputId: `output-${index}`,
          stream: 'stdout',
          data,
          redacted: false,
        })
      ).toBe('stored');
    }
    const output = await broker.read({
      accessToken: opened.access.token,
      executionId: 'execution-1',
      terminalSessionId: 'terminal-1',
      afterCursor: 0,
    });
    const outputText = output.records.map((record) => record.data).join('');
    expect(outputText).toBe(
      `visible:${EXECUTION_SECRET_REDACTION_MARKER}:tail`
    );
    expect(outputText).not.toContain(canary);

    execution = Object.freeze({
      ...execution,
      lease: Object.freeze({ ...execution.lease!, expiresAt: 20_000 }),
    });
    const resumed = await broker.resume({
      principal,
      executionId: 'execution-1',
      terminalSessionId: 'terminal-1',
    });
    expect(resumed.access.token).toBe('terminal-token-2');
    expect(resumed.snapshot.leaseExpiresAt).toBe(20_000);
    await expect(
      broker.read({
        accessToken: opened.access.token,
        executionId: 'execution-1',
        terminalSessionId: 'terminal-1',
        afterCursor: output.nextCursor,
      })
    ).rejects.toMatchObject({ code: 'access-expired' });

    expect(broker.closeExecution('execution-1')).toBe(1);
    await expect(
      broker.read({
        accessToken: resumed.access.token,
        executionId: 'execution-1',
        terminalSessionId: 'terminal-1',
        afterCursor: output.nextCursor,
      })
    ).rejects.toBeInstanceOf(RemoteExecutionTerminalBrokerError);
    clock = resumed.access.expiresAt + 1;
    expect(broker.sweepExpired()).toBe(1);
  });

  it('rejects principal, lease, and output identity drift', async () => {
    const execution = createExecution();
    const broker = createRemoteExecutionTerminalBroker({
      resolveExecution: async () => execution,
      createTerminalSessionId: () => 'terminal-2',
      createAccessToken: () => 'terminal-token',
      now: () => 100,
    });
    await expect(
      broker.open({
        principal: { subjectId: 'other', scopes: ['remote-execution:*'] },
        executionId: 'execution-1',
        size: { columns: 80, rows: 24 },
      })
    ).rejects.toMatchObject({ code: 'forbidden' });
    const opened = await broker.open({
      principal: {
        subjectId: 'principal-1',
        scopes: ['remote-execution:*'],
      },
      executionId: 'execution-1',
      size: { columns: 80, rows: 24 },
    });
    expect(
      await broker.readWorkerCommands({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: 'wrong',
        acknowledgedCommandCursor: 0,
      })
    ).toBeUndefined();
    const base = {
      executionId: 'execution-1',
      workerId: 'worker-1',
      leaseToken: 'worker-lease-secret',
      terminalSessionId: opened.snapshot.terminalSessionId,
      workerOutputId: 'same-output',
      stream: 'stdout' as const,
      redacted: false,
    };
    expect(await broker.publishWorkerOutput({ ...base, data: 'first' })).toBe(
      'stored'
    );
    expect(await broker.publishWorkerOutput({ ...base, data: 'first' })).toBe(
      'existing'
    );
    expect(await broker.publishWorkerOutput({ ...base, data: 'drift' })).toBe(
      'identity-conflict'
    );
  });

  it('redacts stdout and stderr independently and sweeps an expired worker lease', async () => {
    let clock = 100;
    const execution = createExecution();
    const broker = createRemoteExecutionTerminalBroker({
      resolveExecution: async () => execution,
      createTerminalSessionId: () => 'terminal-streams',
      createAccessToken: () => 'terminal-token',
      secretValues: ['stdout-secret'],
      now: () => clock,
    });
    const opened = await broker.open({
      principal: {
        subjectId: 'principal-1',
        scopes: ['remote-execution:terminal'],
      },
      executionId: 'execution-1',
      size: { columns: 80, rows: 24 },
    });
    const publish = (input: {
      workerOutputId: string;
      stream: 'stdout' | 'stderr';
      data: string;
    }) =>
      broker.publishWorkerOutput({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: 'worker-lease-secret',
        terminalSessionId: opened.snapshot.terminalSessionId,
        redacted: false,
        ...input,
      });
    await publish({
      workerOutputId: 'stdout-prefix',
      stream: 'stdout',
      data: 'stdout-',
    });
    await publish({
      workerOutputId: 'stderr-safe',
      stream: 'stderr',
      data: 'stderr-safe\n',
    });
    await publish({
      workerOutputId: 'stdout-suffix',
      stream: 'stdout',
      data: 'secret\n',
    });
    const output = await broker.read({
      accessToken: opened.access.token,
      executionId: 'execution-1',
      terminalSessionId: opened.snapshot.terminalSessionId,
      afterCursor: 0,
    });
    const text = output.records.map((record) => record.data).join('');
    expect(text).toContain('stderr-safe');
    expect(text).toContain(EXECUTION_SECRET_REDACTION_MARKER);
    expect(text).not.toContain('stdout-secret');

    clock = execution.lease!.expiresAt + 1;
    expect(broker.sweepExpired()).toBe(1);
    await expect(
      broker.read({
        accessToken: opened.access.token,
        executionId: 'execution-1',
        terminalSessionId: opened.snapshot.terminalSessionId,
        afterCursor: output.nextCursor,
      })
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
