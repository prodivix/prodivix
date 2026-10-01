import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyVerificationRunEvent,
  createVerificationRunEvent,
  digestVerificationValue,
  encodeVerificationPlan,
} from '@prodivix/verification';
import { digestAgentCanonicalValue } from '@prodivix/ai';
import {
  createG3DriverService,
  type DriverServicePorts,
} from '#src/g3/service.js';
import { driverServiceFixture } from '#src/g3/serviceFixture.js';
import type { DriverBackendPort } from '#src/g3/ports.js';
import { DriverJournal } from '#src/g3/journal.js';
import { checkG3DriverResources } from '#src/g3/resources.js';
import { digestDriverExecutionRequest } from '#src/g3/contract.js';

const environment = {
  G3_BACKEND_CREDENTIAL: 'backend-private-canary-ordinary',
  G3_DRIVER_CREDENTIAL: 'driver-private-canary-ordinary',
  G3_PRIVATE_KEY: generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64url'),
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const start = async (ports: DriverServicePorts = {}, runId?: string) => {
  const directory = await mkdtemp(join(tmpdir(), 'prodivix-ordinary-g3-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const fixture = driverServiceFixture(directory, runId);
  let run = fixture.run;
  const backend: DriverBackendPort = {
    context: vi.fn(async (request) => ({
      started: true as const,
      workspace: fixture.workspace,
      plan: fixture.plan,
      run,
      projectId: 'project:ordinary',
      requestDigest: digestDriverExecutionRequest(request),
    })),
    acquire: vi.fn(async () => ({
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    })),
    event: vi.fn(async (_context, _coordinates, event) => {
      const reduced = applyVerificationRunEvent(
        run,
        createVerificationRunEvent(event)
      );
      if (reduced.status !== 'applied')
        throw new Error('Test owner event failed.');
      run = reduced.snapshot;
      return run;
    }),
    promote: vi.fn(async () => {
      throw new Error('No fixture Evidence.');
    }),
    upload: vi.fn(async () => {
      throw new Error('No fixture Evidence.');
    }),
    finalize: vi.fn(async () => {
      throw new Error('No fixture Evidence.');
    }),
    cancel: vi.fn(async (_request, _signal, requestDigest) => ({
      started: true,
      workspace: fixture.workspace,
      plan: fixture.plan,
      run,
      projectId: 'project:ordinary',
      requestDigest:
        requestDigest ?? digestAgentCanonicalValue(fixture.execution),
    })),
    cleanup: vi.fn(async () => {}),
    asset: vi.fn(async () => {
      throw new Error('No fixture baseline.');
    }),
  };
  const service = await createG3DriverService(fixture.config, {
    environment,
    backend,
    resources: async () => {},
    cleanup: async () => {},
    execute: async () => {},
    ...ports,
  });
  cleanups.push(() => service.close());
  await new Promise<void>((resolve) =>
    service.server.listen(0, '127.0.0.1', resolve)
  );
  const address = service.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Test server not listening.');
  const post = (body: unknown, credential = environment.G3_DRIVER_CREDENTIAL) =>
    fetch(`http://127.0.0.1:${address.port}/g3`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${credential}`,
      },
      body: JSON.stringify(body),
    });
  return { ...fixture, service, backend, post, directory };
};

describe('ordinary G3 driver HTTP composition (SPI contract, no production Evidence)', () => {
  it('blocks unavailable or malformed signing credentials before opening a dispatch service', async () => {
    const execute = vi.fn(async () => {});
    for (const value of [undefined, 'not-a-key-private-canary'])
      await expect(
        start({
          execute,
          environment: { ...environment, G3_PRIVATE_KEY: value },
        })
      ).rejects.toThrow(/credentials? (?:are |is )?unavailable/u);
    expect(execute).not.toHaveBeenCalled();
  });
  it('authenticates and rejects unknown fields or a credential canary before dispatch', async () => {
    const execute = vi.fn(async () => {});
    const { execution, backend, post } = await start({ execute });
    expect((await post(execution, 'incorrect-credential')).status).toBe(401);
    expect(
      (await post({ ...execution, unrecognizedAuthority: true })).status
    ).toBe(503);
    expect(
      (await post({ ...execution, taskId: environment.G3_BACKEND_CREDENTIAL }))
        .status
    ).toBe(503);
    expect(backend.context).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it('returns the exact public registry handshake only after real material projection and resource readiness', async () => {
    const resources = vi.fn(async () => {});
    const { preflight, registry, config, post, backend } = await start({
      resources,
    });
    const response = await post(preflight);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      requestDigest: digestAgentCanonicalValue(preflight),
      providerId: config.providerId,
      adapterRegistryDigest: registry.snapshotDigest,
      checkKinds: ['build'],
      resourcesReady: true,
    });
    expect(resources).toHaveBeenCalledOnce();
    expect(backend.context).not.toHaveBeenCalled();
  });
  it('blocks missing resources and a mismatched adapter registry', async () => {
    const resources = vi.fn(async () => {
      throw new Error('Podman missing.');
    });
    const { preflight, post } = await start({ resources });
    expect((await post(preflight)).status).toBe(503);
    expect(
      (
        await post({
          ...preflight,
          plan: {
            ...preflight.plan,
            adapterRegistryDigest: digestVerificationValue('unadopted'),
          },
        })
      ).status
    ).toBe(503);
    expect(resources).toHaveBeenCalledOnce();
  });
  it('rejects a validly digested Plan with different document partitions before checking resources', async () => {
    const resources = vi.fn(async () => {});
    const { preflight, plan, post } = await start({ resources });
    const { planDigest: _digest, ...identity } = plan;
    const changed = {
      ...identity,
      targetPartitionRevisions: {
        ...plan.targetPartitionRevisions!,
        documentRevisions: { page: { contentRev: 2, metaRev: 1 } },
      },
    };
    const response = await post({
      ...preflight,
      plan: encodeVerificationPlan({
        ...changed,
        planDigest: digestVerificationValue(changed),
      }),
    });
    expect(response.status).toBe(503);
    expect(resources).not.toHaveBeenCalled();
  });
  it('rejects retry or stability policies requiring additional physical attempts before resources or dispatch', async () => {
    const resources = vi.fn(async () => {});
    const { preflight, plan, post } = await start({ resources });
    for (const retry of [
      { maximumAttempts: 2, stabilitySamples: 1 },
      { maximumAttempts: 2, stabilitySamples: 2 },
    ]) {
      const { planDigest: _digest, ...identity } = plan;
      const changed = {
        ...identity,
        budget: {
          ...identity.budget,
          closureEvidenceRecords: retry.maximumAttempts,
        },
        cells: plan.cells.map((cell) => ({
          ...cell,
          retryPolicy: { ...cell.retryPolicy, ...retry },
        })),
      };
      expect(
        (
          await post({
            ...preflight,
            plan: encodeVerificationPlan({
              ...changed,
              planDigest: digestVerificationValue(changed),
            }),
          })
        ).status
      ).toBe(503);
    }
    expect(resources).not.toHaveBeenCalled();
  });
  it('dispatches once, returns a commitment ACK, and rejects semantic identity reuse', async () => {
    const gate = deferred();
    const entered = deferred();
    const execute = vi.fn(async () => {
      entered.resolve();
      await gate.promise;
    });
    const { execution, post, backend } = await start({ execute });
    const first = await post(execution);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      accepted: true,
      requestDigest: digestAgentCanonicalValue(execution),
      verificationRunId: 'verification:ordinary',
    });
    await entered.promise;
    expect((await post(execution)).status).toBe(200);
    const refreshed = {
      ...execution,
      authority: {
        ...execution.authority,
        observedAt: '2026-10-01T00:00:03.000Z',
      },
    };
    const replay = await post(refreshed);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      requestDigest: digestAgentCanonicalValue(refreshed),
    });
    expect((await post({ ...execution, taskId: 'task:other' })).status).toBe(
      503
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(backend.context).toHaveBeenCalledOnce();
    expect(backend.promote).not.toHaveBeenCalled();
    gate.resolve();
  });
  it('reserves capacity before awaiting resources, preventing concurrent admissions from exceeding the budget', async () => {
    const gate = deferred();
    const entered = deferred();
    const resources = vi.fn(async () => {
      entered.resolve();
      await gate.promise;
    });
    const { execution, post, config, directory } = await start({ resources });
    const first = post(execution);
    await entered.promise;
    const other = driverServiceFixture(
      directory,
      'verification:other'
    ).execution;
    expect(config.maximumConcurrentRuns).toBe(1);
    expect((await post(other)).status).toBe(503);
    expect(resources).toHaveBeenCalledOnce();
    gate.resolve();
    expect((await first).status).toBe(200);
  });
  it('authenticates cancellation before abort, then re-reads the canonical Run and cleans scopes added while abort settles', async () => {
    const entered = deferred();
    const scopes: string[] = [];
    let executionDigest = '';
    const execute: NonNullable<DriverServicePorts['execute']> = async (
      input
    ) => {
      executionDigest = input.coordinates.requestDigest;
      await input.recordResourceScope('a'.repeat(64));
      entered.resolve();
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true })
      );
      await input.recordResourceScope('b'.repeat(64));
      throw new Error('Cancelled.');
    };
    const { execution, post, backend, directory, plan, config } = await start({
      execute,
      cleanup: async (scope) => {
        scopes.push(scope);
      },
    });
    expect((await post(execution)).status).toBe(200);
    await entered.promise;
    const cancellation = {
      contract: 'prodivix.agent-runtime-g3-cancellation',
      taskId: execution.taskId,
      agentRunId: execution.agentRunId,
      workspaceId: execution.workspace.id,
      verificationRunId: 'verification:ordinary',
      planDigest: plan.planDigest,
      cancellationCommandId: 'cancel:ordinary',
    };
    const response = await post(cancellation);
    expect(response.status).toBe(200);
    expect(backend.cancel).toHaveBeenCalledTimes(2);
    expect(scopes).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
    const record = await new DriverJournal(directory).read(
      'verification:ordinary'
    );
    expect(record).toMatchObject({
      state: 'clean',
      browserActive: false,
      resourceScopes: scopes,
      requestDigest: executionDigest,
    });
    expect(backend.cleanup).toHaveBeenCalledWith(
      execution.workspace.id,
      expect.objectContaining({
        requestDigest: executionDigest,
        cancellationCommandId: 'cancel:ordinary',
      }),
      true,
      expect.any(AbortSignal),
      record!.completedAt
    );
    const cleanupCount = vi.mocked(backend.cleanup).mock.calls.length;
    expect((await post(cancellation)).status).toBe(200);
    expect(vi.mocked(backend.cleanup).mock.calls[cleanupCount]?.[4]).toBe(
      record!.completedAt
    );
    expect(await response.json()).toMatchObject({
      requestDigest: digestAgentCanonicalValue(cancellation),
      providerId: config.providerId,
    });
  });
  it('keeps concurrent cancellation from racing the exact resource journal and cleanup receipt', async () => {
    const entered = deferred();
    const cleanupEntered = deferred();
    const cleanupGate = deferred();
    const scope = 'e'.repeat(64);
    const cleanup = vi.fn(async () => {
      cleanupEntered.resolve();
      await cleanupGate.promise;
    });
    const fixture = await start({
      cleanup,
      execute: async (input) => {
        await input.recordResourceScope(scope);
        entered.resolve();
        await new Promise<void>((resolve) =>
          input.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        );
        throw new Error('Cancelled.');
      },
    });
    await fixture.post(fixture.execution);
    await entered.promise;
    const cancellation = {
      contract: 'prodivix.agent-runtime-g3-cancellation',
      taskId: fixture.execution.taskId,
      agentRunId: fixture.execution.agentRunId,
      workspaceId: fixture.workspace.id,
      verificationRunId: fixture.run.runId,
      planDigest: fixture.plan.planDigest,
      cancellationCommandId: 'cancel:concurrent',
    };
    const first = fixture.post(cancellation);
    await cleanupEntered.promise;
    try {
      expect((await fixture.post(cancellation)).status).toBe(503);
      expect(cleanup).toHaveBeenCalledOnce();
      expect(fixture.backend.cleanup).not.toHaveBeenCalled();
    } finally {
      cleanupGate.resolve();
    }
    expect((await first).status).toBe(200);
    const record = await new DriverJournal(fixture.directory).read(
      fixture.run.runId
    );
    expect(record).toMatchObject({ state: 'clean', resourceScopes: [scope] });
    expect((await fixture.post(cancellation)).status).toBe(200);
    expect(
      vi.mocked(fixture.backend.cleanup).mock.calls.map((call) => call[4])
    ).toEqual([record!.completedAt, record!.completedAt]);
  });
  it('does not attest cleanup when Browser retirement remains uncertain', async () => {
    const entered = deferred();
    const execute: NonNullable<DriverServicePorts['execute']> = async (
      input
    ) => {
      await input.recordBrowserActive(true);
      entered.resolve();
      await new Promise<void>((resolve) =>
        input.signal.addEventListener('abort', () => resolve(), { once: true })
      );
      throw new Error('Uncertain Browser cleanup.');
    };
    const { execution, post, backend, plan, directory } = await start({
      execute,
    });
    await post(execution);
    await entered.promise;
    expect(
      (
        await post({
          contract: 'prodivix.agent-runtime-g3-cancellation',
          taskId: execution.taskId,
          agentRunId: execution.agentRunId,
          workspaceId: execution.workspace.id,
          verificationRunId: 'verification:ordinary',
          planDigest: plan.planDigest,
          cancellationCommandId: 'cancel:uncertain',
        })
      ).status
    ).toBe(503);
    expect(backend.cleanup).not.toHaveBeenCalled();
    expect(backend.event).not.toHaveBeenCalled();
    expect(
      await new DriverJournal(directory).read('verification:ordinary')
    ).toMatchObject({ state: 'uncertain', browserActive: true });
  });
  it('stops an in-flight admission when shutdown starts before resources settle', async () => {
    const entered = deferred();
    const gate = deferred();
    const execute = vi.fn(async () => {});
    const fixture = await start({
      execute,
      resources: async () => {
        entered.resolve();
        await gate.promise;
      },
    });
    const response = fixture.post(fixture.execution);
    await entered.promise;
    const closed = fixture.service.close();
    gate.resolve();
    expect((await response).status).toBe(503);
    await closed;
    expect(fixture.backend.context).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(
      await new DriverJournal(fixture.directory).read(
        fixture.execution.run.runId
      )
    ).toBeUndefined();
  });
  it('requires scoped cleanup after a restart and replays a clean dispatch without executing again', async () => {
    const entered = deferred();
    const scope = 'c'.repeat(64);
    const fixture = await start({
      execute: async (input) => {
        await input.recordResourceScope(scope);
        entered.resolve();
        await new Promise<void>((resolve) =>
          input.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        );
        throw new Error('Process stopped.');
      },
    });
    expect((await fixture.post(fixture.execution)).status).toBe(200);
    await entered.promise;
    await fixture.service.close();
    expect(
      await new DriverJournal(fixture.directory).read(
        fixture.execution.run.runId
      )
    ).toMatchObject({ state: 'uncertain', resourceScopes: [scope] });
    const cleanup = vi.fn(async () => {});
    const execute = vi.fn(async () => {});
    const restarted = await createG3DriverService(fixture.config, {
      environment,
      backend: fixture.backend,
      resources: async () => {},
      cleanup,
      execute,
    });
    cleanups.push(() => restarted.close());
    await new Promise<void>((resolve) =>
      restarted.server.listen(0, '127.0.0.1', resolve)
    );
    const address = restarted.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Restarted server not listening.');
    const post = (body: unknown) =>
      fetch(`http://127.0.0.1:${address.port}/g3`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${environment.G3_DRIVER_CREDENTIAL}`,
        },
        body: JSON.stringify(body),
      });
    expect((await post(fixture.execution)).status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
    expect(
      (
        await post({
          contract: 'prodivix.agent-runtime-g3-cancellation',
          taskId: fixture.execution.taskId,
          agentRunId: fixture.execution.agentRunId,
          workspaceId: fixture.workspace.id,
          verificationRunId: fixture.run.runId,
          planDigest: fixture.plan.planDigest,
          cancellationCommandId: 'cancel:restart',
        })
      ).status
    ).toBe(200);
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(scope);
    expect((await post(fixture.execution)).status).toBe(200);
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps resource cleanup failures durable and retries them without issuing a false cleanup receipt', async () => {
    const entered = deferred();
    const scope = 'd'.repeat(64);
    const cleanup = vi
      .fn()
      .mockRejectedValueOnce(new Error('Container still running.'))
      .mockResolvedValue(undefined);
    const fixture = await start({
      cleanup,
      execute: async (input) => {
        await input.recordResourceScope(scope);
        entered.resolve();
        await new Promise<void>((resolve) =>
          input.signal.addEventListener('abort', () => resolve(), {
            once: true,
          })
        );
        throw new Error('Cancelled.');
      },
    });
    await fixture.post(fixture.execution);
    await entered.promise;
    const cancellation = {
      contract: 'prodivix.agent-runtime-g3-cancellation',
      taskId: fixture.execution.taskId,
      agentRunId: fixture.execution.agentRunId,
      workspaceId: fixture.workspace.id,
      verificationRunId: fixture.run.runId,
      planDigest: fixture.plan.planDigest,
      cancellationCommandId: 'cancel:residual',
    };
    expect((await fixture.post(cancellation)).status).toBe(503);
    expect(fixture.backend.cleanup).not.toHaveBeenCalled();
    expect(
      await new DriverJournal(fixture.directory).read(fixture.run.runId)
    ).toMatchObject({ state: 'uncertain' });
    expect((await fixture.post(cancellation)).status).toBe(200);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(fixture.backend.cleanup).toHaveBeenCalledOnce();
  });
  it.skipIf(
    process.platform === 'linux' && process.versions.node === '22.23.1'
  )(
    'rejects actual unavailable host resources without an injected SPI',
    async () => {
      const { config } = await start();
      await expect(checkG3DriverResources(config)).rejects.toThrow(
        'Linux rootless'
      );
    }
  );
});
