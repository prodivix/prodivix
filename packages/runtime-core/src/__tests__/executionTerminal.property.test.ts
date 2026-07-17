import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSecretLeakGuard,
  createExecutionSessionCoordinator,
  createExecutionTerminalController,
  createExecutionTerminalCopyText,
  getExecutionTerminalAvailability,
  type CreateExecutionTerminalControllerInput,
  type ExecutionProviderDescriptor,
  type ExecutionTerminalReadResult,
} from '..';

const terminalProvider = createExecutionProviderDescriptor({
  id: 'remote-terminal-provider',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['terminal'],
});

const browserProvider = createExecutionProviderDescriptor({
  id: 'browser-provider',
  version: '1',
  isolation: 'sandboxed',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['console'],
});

const createTerminal = (
  overrides: Partial<CreateExecutionTerminalControllerInput> = {}
) => {
  let clock = 100;
  return createExecutionTerminalController({
    terminalSessionId: 'terminal-1',
    executionId: 'execution-1',
    jobId: 'job-1',
    provider: terminalProvider,
    capability: 'shell',
    grant: {
      grantId: 'grant-1',
      executionId: 'execution-1',
      jobId: 'job-1',
      providerId: terminalProvider.id,
      expiresAt: 10_000,
    },
    size: { columns: 100, rows: 30 },
    requestInput: () => undefined,
    requestResize: () => undefined,
    requestSignal: () => undefined,
    requestClose: () => undefined,
    now: () => clock++,
    ...overrides,
  });
};

const createJob = (provider: ExecutionProviderDescriptor) =>
  createExecutionJobController({
    jobId: `${provider.id}-job`,
    provider,
    request: createExecutionRequest({
      requestId: `${provider.id}-request`,
      profile: 'preview',
      runtimeZone: 'client',
      workspace: { workspaceId: 'workspace', snapshotId: 'snapshot' },
      invocation: {
        kind: 'workspace',
        targetRef: { kind: 'workspace', workspaceId: 'workspace' },
      },
    }),
  });

describe('execution Terminal contract', () => {
  it('requires exact provider capability, grant identity, and an unexpired lease', () => {
    expect(() =>
      createTerminal({
        provider: browserProvider,
        grant: {
          grantId: 'grant-1',
          executionId: 'execution-1',
          jobId: 'job-1',
          providerId: browserProvider.id,
          expiresAt: 10_000,
        },
      })
    ).toThrow(/terminal capability/u);
    expect(() =>
      createTerminal({
        grant: {
          grantId: 'grant-1',
          executionId: 'another-execution',
          jobId: 'job-1',
          providerId: terminalProvider.id,
          expiresAt: 10_000,
        },
      })
    ).toThrow(/execution\/provider fence/u);
    expect(() =>
      createTerminal({
        grant: {
          grantId: 'grant-1',
          executionId: 'execution-1',
          jobId: 'job-1',
          providerId: terminalProvider.id,
          expiresAt: 99,
        },
      })
    ).toThrow(/unexpired/u);
  });

  it('renews the exact lease monotonically and rejects identity drift', () => {
    const terminal = createTerminal();
    expect(
      terminal.renewGrant({
        grantId: 'grant-2',
        executionId: 'execution-1',
        jobId: 'job-1',
        providerId: terminalProvider.id,
        expiresAt: 20_000,
      }).leaseExpiresAt
    ).toBe(20_000);
    expect(() =>
      terminal.renewGrant({
        grantId: 'grant-3',
        executionId: 'execution-1',
        jobId: 'job-1',
        providerId: terminalProvider.id,
        expiresAt: 15_000,
      })
    ).toThrow(/must not shorten/u);
    expect(() =>
      terminal.renewGrant({
        grantId: 'grant-4',
        executionId: 'another-execution',
        jobId: 'job-1',
        providerId: terminalProvider.id,
        expiresAt: 30_000,
      })
    ).toThrow(/execution\/provider fence/u);
  });

  it('serializes stdin, deduplicates reconnect retries, and rejects drift or gaps', async () => {
    const acceptedInputs: string[] = [];
    const terminal = createTerminal({
      maximumInputFingerprints: 2,
      requestInput: async ({ data }) => {
        await Promise.resolve();
        acceptedInputs.push(data);
      },
    });

    expect(
      await terminal.session.write({ data: 'second', clientSequence: 2 })
    ).toEqual({
      status: 'out-of-order',
      clientSequence: 2,
      expectedClientSequence: 1,
    });
    const concurrent = await Promise.all([
      terminal.session.write({ data: 'first', clientSequence: 1 }),
      terminal.session.write({ data: 'first', clientSequence: 1 }),
    ]);
    expect(concurrent).toEqual([
      { status: 'accepted', clientSequence: 1 },
      { status: 'duplicate', clientSequence: 1 },
    ]);
    expect(
      await terminal.session.write({ data: 'drifted', clientSequence: 1 })
    ).toEqual({ status: 'conflict', clientSequence: 1 });
    await terminal.session.write({ data: 'second', clientSequence: 2 });
    await terminal.session.write({ data: 'third', clientSequence: 3 });

    expect(
      await terminal.session.write({ data: 'first', clientSequence: 1 })
    ).toEqual({ status: 'stale', clientSequence: 1 });
    expect(acceptedInputs).toEqual(['first', 'second', 'third']);
    expect(terminal.session.getSnapshot().latestClientSequence).toBe(3);
  });

  it('replays ordered output with an explicit retention gap and byte truncation', () => {
    const terminal = createTerminal({
      maximumOutputRecords: 2,
      maximumRetainedOutputBytes: 64,
    });
    terminal.emitOutput({ stream: 'stdout', data: 'first\n' });
    terminal.emitOutput({ stream: 'stderr', data: 'second\n' });
    const truncated = terminal.emitOutput({
      stream: 'stdout',
      data: 'x'.repeat(128),
    });

    expect(truncated).toMatchObject({ cursor: 3, truncated: true });
    expect(truncated?.byteLength).toBeLessThanOrEqual(64);
    const replay = terminal.session.read({ afterCursor: 0 });
    expect(replay.gap).toBe(true);
    expect(replay.records.map(({ cursor }) => cursor)).toEqual([3]);
    expect(replay.latestCursor).toBe(3);
    expect(replay.nextCursor).toBe(3);
    expect(terminal.session.read({ afterCursor: 3 }).records).toEqual([]);
    expect(() => terminal.session.read({ afterCursor: 4 })).toThrow(
      /ahead of the latest cursor/u
    );
  });

  it('redacts known Secret material and re-redacts the bounded copy projection', () => {
    const canary = 'terminal-canary-value';
    const terminal = createTerminal({
      secretLeakGuard: createExecutionSecretLeakGuard({
        secretValues: [canary],
      }),
    });
    terminal.emitOutput({
      stream: 'stdout',
      data: `resolved=${canary}`,
    });
    terminal.emitOutput({
      stream: 'stdout',
      data: 'Authorization: Bearer terminal-token-value\n',
    });
    const replay = terminal.session.read({ afterCursor: 0 });
    const encoded = JSON.stringify(replay);

    expect(encoded).toContain('[REDACTED]');
    expect(encoded).not.toContain(canary);
    expect(encoded).not.toContain('terminal-token-value');

    const forgedCopyInput: ExecutionTerminalReadResult = Object.freeze({
      ...replay,
      gap: true,
      records: Object.freeze([
        Object.freeze({
          ...replay.records[0]!,
          data: 'Cookie: session=forged-cookie-value\n',
        }),
      ]),
    });
    const copy = createExecutionTerminalCopyText(forgedCopyInput);
    expect(copy).toContain('[TRUNCATED]');
    expect(copy).toContain('[REDACTED]');
    expect(copy).not.toContain('forged-cookie-value');
  });

  it('orders resize, signal, and close controls and keeps close idempotent', async () => {
    const controls: string[] = [];
    const terminal = createTerminal({
      requestResize: ({ columns, rows }) => {
        controls.push(`resize:${columns}x${rows}`);
      },
      requestSignal: (signal) => {
        controls.push(`signal:${signal}`);
      },
      requestClose: (reason) => {
        controls.push(`close:${reason}`);
      },
    });

    const results = await Promise.all([
      terminal.session.resize({ columns: 120, rows: 40 }),
      terminal.session.signal('interrupt'),
      terminal.session.close(),
    ]);
    expect(results).toEqual([
      { status: 'accepted', size: { columns: 120, rows: 40 } },
      { status: 'accepted', signal: 'interrupt' },
      { status: 'closed' },
    ]);
    expect(controls).toEqual([
      'resize:120x40',
      'signal:interrupt',
      'close:client-closed',
    ]);
    expect(await terminal.session.close()).toEqual({
      status: 'already-closed',
    });
    expect(
      await terminal.session.write({ data: 'late', clientSequence: 1 })
    ).toEqual({ status: 'closed', clientSequence: 1 });
    expect(terminal.emitOutput({ stream: 'stdout', data: 'late' })).toBe(
      undefined
    );
  });

  it('revokes an expired lease and asks the adapter to clean up once', async () => {
    let clock = 10;
    const requestClose = vi.fn();
    const terminal = createTerminal({
      grant: {
        grantId: 'grant-1',
        executionId: 'execution-1',
        jobId: 'job-1',
        providerId: terminalProvider.id,
        expiresAt: 20,
      },
      requestClose,
      now: () => clock,
    });
    clock = 20;

    expect(terminal.session.getSnapshot()).toMatchObject({
      status: 'closed',
      closeReason: 'lease-expired',
    });
    terminal.session.getSnapshot();
    await Promise.resolve();
    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(requestClose).toHaveBeenCalledWith('lease-expired');
  });

  it('projects provider capability and permission as explicit product states', () => {
    const browserJob = createJob(browserProvider);
    const browserSessions = createExecutionSessionCoordinator();
    browserSessions.activate({
      sessionId: 'browser-session',
      job: browserJob.job,
    });
    browserJob.markRunning();
    const browserSession = browserSessions.getSnapshot('browser-session');
    expect(browserSession?.activeJob?.capabilities).toEqual(['console']);
    expect(
      getExecutionTerminalAvailability({ session: browserSession })
    ).toEqual({
      status: 'unsupported',
      reason: 'provider-capability',
      providerId: browserProvider.id,
    });

    const remoteJob = createJob(terminalProvider);
    const remoteSessions = createExecutionSessionCoordinator();
    remoteSessions.activate({
      sessionId: 'remote-session',
      job: remoteJob.job,
    });
    remoteJob.markRunning();
    const remoteSession = remoteSessions.getSnapshot('remote-session');
    expect(
      getExecutionTerminalAvailability({ session: remoteSession })
    ).toMatchObject({ status: 'permission-required' });
    expect(
      getExecutionTerminalAvailability({
        session: remoteSession,
        permission: 'denied',
      })
    ).toMatchObject({ status: 'denied' });
    expect(
      getExecutionTerminalAvailability({
        session: remoteSession,
        permission: 'allowed',
      })
    ).toMatchObject({
      status: 'available',
      providerId: terminalProvider.id,
      jobId: remoteJob.job.id,
    });
  });

  it('keeps cursor ordering and retained record count invariant', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 64 }), {
          minLength: 1,
          maxLength: 60,
        }),
        fc.integer({ min: 1, max: 20 }),
        (chunks, maximumOutputRecords) => {
          const terminal = createTerminal({ maximumOutputRecords });
          chunks.forEach((data, index) => {
            terminal.emitOutput({
              stream: index % 2 ? 'stderr' : 'stdout',
              data,
            });
          });
          const replay = terminal.session.read({ afterCursor: 0 });
          expect(replay.latestCursor).toBe(chunks.length);
          expect(replay.records.length).toBeLessThanOrEqual(
            maximumOutputRecords
          );
          expect(replay.records.map(({ cursor }) => cursor)).toEqual(
            [...replay.records]
              .map(({ cursor }) => cursor)
              .sort((left, right) => left - right)
          );
          expect(new Set(replay.records.map(({ cursor }) => cursor)).size).toBe(
            replay.records.length
          );
        }
      )
    );
  });
});
