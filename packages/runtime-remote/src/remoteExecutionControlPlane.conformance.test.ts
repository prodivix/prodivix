import {
  createExecutionNetworkTrace,
  toExecutionNetworkTraceValue,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  createActiveExecutionQuotaPolicy,
  createRemoteExecutionControlPlane,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
} from './remoteExecutionControlPlane';
import {
  createMemoryRemoteExecutionRepository,
  createMemoryRemoteExecutionSnapshotStore,
} from './remoteExecutionControlPlaneMemory';
import { createRemoteExecutionClient } from './remoteExecutionClient';
import type {
  RemoteExecutionControlPlane,
  RemoteExecutionPrincipal,
  RemoteExecutionTransport,
} from './index';
import {
  createRemoteFixtureRequest,
  createRemoteFixtureSnapshot,
  remoteFixtureProvider,
} from './__tests__/remoteExecutionFixtures';

const principal = (
  subjectId = 'user-1',
  scopes: readonly string[] = ['remote-execution:*']
): RemoteExecutionPrincipal => Object.freeze({ subjectId, scopes });

const createHarness = (maximumActiveExecutions = 4) => {
  let currentTime = 1_000;
  let executionSequence = 0;
  let leaseSequence = 0;
  const repository = createMemoryRemoteExecutionRepository();
  const snapshots = createMemoryRemoteExecutionSnapshotStore();
  const controlPlane = createRemoteExecutionControlPlane({
    repository,
    snapshots,
    authorization: createScopeRemoteExecutionAuthorizationPolicy(),
    quota: createActiveExecutionQuotaPolicy(maximumActiveExecutions),
    router: createStaticRemoteExecutionProviderRouter([remoteFixtureProvider]),
    now: () => currentTime,
    createExecutionId: () => `execution-${++executionSequence}`,
    createLeaseToken: () => `lease-${++leaseSequence}`,
  });
  return {
    controlPlane,
    repository,
    snapshots,
    setTime(value: number) {
      currentTime = value;
    },
  };
};

const transport = (
  controlPlane: RemoteExecutionControlPlane,
  authPrincipal?: RemoteExecutionPrincipal
): RemoteExecutionTransport =>
  Object.freeze({
    async send(envelope) {
      return controlPlane.handle(envelope, {
        ...(authPrincipal === undefined ? {} : { principal: authPrincipal }),
      });
    },
  });

const client = (
  controlPlane: RemoteExecutionControlPlane,
  authPrincipal?: RemoteExecutionPrincipal
) =>
  createRemoteExecutionClient({
    transport: transport(controlPlane, authPrincipal),
    retryPolicy: { maxAttempts: 1 },
  });

const start = async (
  controlPlane: RemoteExecutionControlPlane,
  requestId = 'request-1',
  authPrincipal = principal()
) =>
  client(controlPlane, authPrincipal).create({
    request: createRemoteFixtureRequest(requestId),
    snapshot: { kind: 'upload', snapshot: createRemoteFixtureSnapshot() },
  });

describe('remote execution control plane conformance', () => {
  it('requires authorization and enforces operation scopes', async () => {
    const { controlPlane } = createHarness();
    await expect(
      client(controlPlane).create({
        request: createRemoteFixtureRequest(),
        snapshot: { kind: 'upload', snapshot: createRemoteFixtureSnapshot() },
      })
    ).rejects.toMatchObject({ remoteCode: 'unauthorized' });
    await expect(
      start(
        controlPlane,
        'request-1',
        principal('user-1', ['remote-execution:get'])
      )
    ).rejects.toMatchObject({ remoteCode: 'forbidden' });
  });

  it('creates once, replays the same identity, and isolates owners', async () => {
    const { controlPlane, repository } = createHarness();
    const first = await start(controlPlane);
    const replay = await start(controlPlane);
    expect(replay.execution.executionId).toBe(first.execution.executionId);
    expect(await repository.countActive('user-1')).toBe(1);

    const otherOwner = client(controlPlane, principal('user-2'));
    await expect(
      otherOwner.get(first.execution.executionId)
    ).rejects.toMatchObject({ remoteCode: 'not-found' });
  });

  it('does not let quota rejection break an existing idempotent replay', async () => {
    const { controlPlane } = createHarness(1);
    const first = await start(controlPlane, 'request-1');
    await expect(start(controlPlane, 'request-2')).rejects.toMatchObject({
      remoteCode: 'quota-exceeded',
    });
    const replay = await start(controlPlane, 'request-1');
    expect(replay.execution.executionId).toBe(first.execution.executionId);
  });

  it('enforces the active quota inside the atomic create mutation', async () => {
    const { controlPlane, repository } = createHarness(1);
    const results = await Promise.allSettled([
      start(controlPlane, 'request-1'),
      start(controlPlane, 'request-2'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected')
    ).toHaveLength(1);
    expect(await repository.countActive('user-1')).toBe(1);
  });

  it('resolves content-addressed references only after an authorized upload', async () => {
    const { controlPlane, snapshots } = createHarness();
    const snapshot = createRemoteFixtureSnapshot();
    await snapshots.put('user-1', snapshot, 900);
    const result = await client(controlPlane, principal()).create({
      request: createRemoteFixtureRequest(),
      snapshot: {
        kind: 'reference',
        snapshotId: snapshot.workspace.snapshotId,
        contentDigest: snapshot.contentDigest,
      },
    });
    expect(result.execution.snapshotDigest).toBe(snapshot.contentDigest);
    await expect(
      client(controlPlane, principal('user-2')).create({
        request: createRemoteFixtureRequest('request-other-owner'),
        snapshot: {
          kind: 'reference',
          snapshotId: snapshot.workspace.snapshotId,
          contentDigest: snapshot.contentDigest,
        },
      })
    ).rejects.toMatchObject({ remoteCode: 'not-found' });
  });

  it('rejects upload and reference snapshots that exceed the routed provider capabilities', async () => {
    const { controlPlane, snapshots } = createHarness();
    const incompatible = createRemoteFixtureSnapshot(undefined, [
      'filesystem',
      'hmr',
    ]);
    await expect(
      client(controlPlane, principal()).create({
        request: createRemoteFixtureRequest('request-upload-capability'),
        snapshot: { kind: 'upload', snapshot: incompatible },
      })
    ).rejects.toMatchObject({ remoteCode: 'invalid-request' });

    await snapshots.put('user-1', incompatible, 900);
    await expect(
      client(controlPlane, principal()).create({
        request: createRemoteFixtureRequest('request-reference-capability'),
        snapshot: {
          kind: 'reference',
          snapshotId: incompatible.workspace.snapshotId,
          contentDigest: incompatible.contentDigest,
        },
      })
    ).rejects.toMatchObject({ remoteCode: 'invalid-request' });
  });

  it('claims FIFO, renews the active lease, and rejects competing workers', async () => {
    const { controlPlane, setTime } = createHarness();
    await start(controlPlane, 'request-1');
    setTime(1_001);
    await start(controlPlane, 'request-2');
    setTime(1_010);

    const claimed = await controlPlane.claimNext({
      workerId: 'worker-1',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    expect(claimed?.execution.record.requestId).toBe('request-1');
    expect(claimed?.execution.record.status).toBe('starting');
    expect(claimed?.lease.attempt).toBe(1);

    const second = await controlPlane.claimNext({
      workerId: 'worker-2',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    expect(second?.execution.record.requestId).toBe('request-2');
    const renewed = await controlPlane.renewLease({
      executionId: claimed!.execution.record.executionId,
      workerId: 'worker-1',
      leaseToken: claimed!.lease.token,
      leaseDurationMs: 200,
    });
    expect(renewed?.expiresAt).toBe(1_210);
    await expect(
      controlPlane.renewLease({
        executionId: claimed!.execution.record.executionId,
        workerId: 'worker-2',
        leaseToken: claimed!.lease.token,
        leaseDurationMs: 200,
      })
    ).resolves.toBeUndefined();
  });

  it('normalizes Network events before every durable repository path', async () => {
    const { controlPlane, repository } = createHarness();
    const started = await start(controlPlane);
    const executionId = started.execution.executionId;
    const claimed = await controlPlane.claimNext({
      workerId: 'worker-1',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    const detail = toExecutionNetworkTraceValue(
      createExecutionNetworkTrace({
        requestId: 'request-1',
        phase: 'runtime',
        runtimeZone: 'client',
        mode: 'live',
        adapter: 'core.http',
        method: 'GET',
        sanitizedUrl: 'https://api.example.test/',
        protocol: 'https',
        startedAt: 1_000,
        completedAt: 1_001,
        outcome: 'allowed',
        status: 200,
        correlation: {
          kind: 'data-operation',
          documentId: 'data-products',
          operationId: 'list',
          invocationId: 'invocation-1',
          sequence: 1,
          attempt: 1,
        },
      })
    );

    await expect(
      controlPlane.appendWorkerEvent({
        executionId,
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        workerEventId: 'network-1',
        event: {
          kind: 'trace',
          trace: {
            traceId: 'network:execution-1',
            spanId: 'request-1',
            name: 'network.request',
            phase: 'event',
            detail,
          },
        },
      })
    ).resolves.toMatchObject({ kind: 'stored' });
    expect(
      (await repository.get(executionId))?.events.find(
        ({ event }) =>
          event.kind === 'trace' && event.trace.name === 'network.request'
      )
    ).toMatchObject({
      event: {
        trace: {
          detail: {
            correlation: { invocationId: 'invocation-1' },
            redacted: true,
          },
        },
      },
    });

    await expect(
      controlPlane.appendWorkerEvent({
        executionId,
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        workerEventId: 'network-unsafe',
        event: {
          kind: 'trace',
          trace: {
            traceId: 'network:execution-1',
            spanId: 'request-unsafe',
            name: 'network.request',
            phase: 'event',
            detail: {
              ...(detail as Readonly<Record<string, unknown>>),
              headers: { authorization: 'secret' },
            },
          },
        },
      })
    ).rejects.toThrow(/canonical Network trace/u);
  });

  it('reclaims expired work with a new fencing token and rejects the old lease', async () => {
    const { controlPlane, setTime } = createHarness();
    const started = await start(controlPlane);
    const first = await controlPlane.claimNext({
      workerId: 'worker-1',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 10,
    });
    await controlPlane.transition({
      executionId: started.execution.executionId,
      workerId: 'worker-1',
      leaseToken: first!.lease.token,
      status: 'running',
    });
    setTime(1_011);
    const reclaimed = await controlPlane.claimNext({
      workerId: 'worker-2',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    expect(reclaimed?.execution.record.executionId).toBe(
      started.execution.executionId
    );
    expect(reclaimed?.lease.attempt).toBe(2);
    await expect(
      controlPlane.transition({
        executionId: started.execution.executionId,
        workerId: 'worker-1',
        leaseToken: first!.lease.token,
        status: 'succeeded',
      })
    ).resolves.toBeUndefined();
    await expect(
      controlPlane.transition({
        executionId: started.execution.executionId,
        workerId: 'worker-2',
        leaseToken: reclaimed!.lease.token,
        status: 'succeeded',
      })
    ).resolves.toMatchObject({ record: { status: 'succeeded' } });
    await expect(
      controlPlane.claimNext({
        workerId: 'worker-3',
        providerId: remoteFixtureProvider.id,
        leaseDurationMs: 100,
      })
    ).resolves.toBeUndefined();
  });

  it('makes cancellation idempotent and prevents terminal resurrection', async () => {
    const { controlPlane, repository } = createHarness();
    const started = await start(controlPlane);
    const executionId = started.execution.executionId;
    const executionClient = client(controlPlane, principal());
    const first = await executionClient.cancel({
      executionId,
      cancellationId: 'cancel-1',
    });
    const replay = await executionClient.cancel({
      executionId,
      cancellationId: 'cancel-1',
    });
    expect(first.result.status).toBe('accepted');
    expect(replay.result.status).toBe('already-requested');
    expect((await repository.get(executionId))?.record.status).toBe(
      'cancelled'
    );

    const claim = await controlPlane.claimNext({
      workerId: 'worker-1',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    expect(claim).toBeUndefined();
    expect(
      (await executionClient.readEvents({ executionId, afterCursor: 0 })).events
    ).toHaveLength(2);
  });

  it('replays artifact grants as authority-free canonical Job events', async () => {
    const { controlPlane } = createHarness();
    const started = await start(controlPlane, 'request-artifact');
    const executionId = started.execution.executionId;
    const claimed = await controlPlane.claimNext({
      workerId: 'worker-1',
      providerId: remoteFixtureProvider.id,
      leaseDurationMs: 100,
    });
    await controlPlane.transition({
      executionId,
      workerId: 'worker-1',
      leaseToken: claimed!.lease.token,
      status: 'running',
    });
    const contents = new Uint8Array([1]);
    await expect(
      controlPlane.putArtifact({
        executionId,
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        workerEventId: 'artifact-1',
        descriptor: {
          artifactId: 'bundle-1',
          kind: 'bundle',
          mediaType: 'application/json',
          size: contents.byteLength,
          digest:
            'sha256-4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
          expiresAt: 2_000,
          authorizationScope: `execution:${executionId}`,
        },
        contents,
      })
    ).resolves.toMatchObject({ kind: 'stored' });

    const replay = await client(controlPlane, principal()).readEvents({
      executionId,
      afterCursor: 0,
    });
    const artifactEvent = replay.events.find(
      ({ event }) => event.kind === 'artifact'
    )?.event;
    expect(artifactEvent).toMatchObject({
      kind: 'artifact',
      artifact: { artifactId: 'bundle-1', kind: 'bundle' },
    });
    expect(JSON.stringify(artifactEvent)).not.toContain('authorizationScope');
    expect(JSON.stringify(artifactEvent)).not.toContain('expiresAt');
  });
});
