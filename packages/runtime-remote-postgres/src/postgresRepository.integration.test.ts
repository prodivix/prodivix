import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
} from '@prodivix/runtime-core';
import { REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT } from '@prodivix/runtime-remote';
import { createPostgresRemoteExecutionRepository } from './postgresExecutionRepository';
import { createPostgresRemoteExecutionSnapshotStore } from './postgresSnapshotStore';
import { migrateRemoteExecutionPostgres } from './schema';

const databaseUrl = process.env.PRODIVIX_REMOTE_POSTGRES_TEST_URL;
const integration = databaseUrl ? describe : describe.skip;
const schema = `prodivix_remote_test_${randomBytes(8).toString('hex')}`;
let admin: Pool;
let pool: Pool;

const snapshot = createExecutableProjectSnapshot({
  workspace: {
    workspaceId: 'workspace-1',
    snapshotId: 'snapshot-1',
    partitionRevisions: { workspace: '1' },
  },
  target: { presetId: 'react-vite', framework: 'react', runtime: 'vite' },
  files: [{ path: 'package.json', contents: '{"private":true}' }],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [{ kind: 'preview', path: 'package.json' }],
  capabilityRequirements: {
    preview: ['filesystem'],
    build: ['filesystem', 'build'],
    test: ['filesystem', 'test'],
  },
  publicBuildConfiguration: [],
  resourceHints: { timeoutMs: 30_000 },
  cacheHints: { dependencyInstall: 'reuse-if-matched' },
});
const provider = createExecutionProviderDescriptor({
  id: 'prodivix.remote.integration',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['filesystem', 'cancellation'],
});
const request = (requestId: string) =>
  createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: snapshot.workspace,
    invocation: {
      kind: 'workspace',
      targetRef: { kind: 'workspace', workspaceId: 'workspace-1' },
    },
    requiredCapabilities: ['filesystem'],
  });
const ingestionLimits = {
  maximumEvents: 100,
  maximumEventBytes: 1024 * 1024,
  maximumLogBytes: 1024 * 1024,
  maximumArtifacts: 8,
  maximumArtifactBytes: 1024 * 1024,
  maximumSingleArtifactBytes: 512 * 1024,
  maximumArtifactRetentionMs: 60_000,
} as const;

integration('remote execution PostgreSQL integration', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl, max: 2 });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    await migrateRemoteExecutionPostgres(pool);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE remote_execution_events, remote_executions, remote_execution_snapshot_grants, remote_execution_snapshot_blobs CASCADE'
    );
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('keeps snapshot grants tenant-scoped while deduplicating the blob', async () => {
    const store = createPostgresRemoteExecutionSnapshotStore(pool);
    await store.put('owner-1', snapshot, 1_000);
    await expect(
      store.get(
        'owner-1',
        snapshot.workspace.snapshotId,
        snapshot.contentDigest
      )
    ).resolves.toMatchObject({ contentDigest: snapshot.contentDigest });
    await expect(
      store.get(
        'owner-2',
        snapshot.workspace.snapshotId,
        snapshot.contentDigest
      )
    ).resolves.toBeUndefined();
    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM remote_execution_snapshot_blobs'
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('serializes concurrent create/quota mutations per owner', async () => {
    const store = createPostgresRemoteExecutionSnapshotStore(pool);
    const repository = createPostgresRemoteExecutionRepository(pool);
    await store.put('owner-1', snapshot, 1_000);
    const create = (sequence: number) =>
      repository.createOrGet({
        ownerId: 'owner-1',
        identityKey: `identity-${sequence}`,
        request: request(`request-${sequence}`),
        snapshotId: snapshot.workspace.snapshotId,
        snapshotDigest: snapshot.contentDigest,
        provider,
        executionId: `execution-${sequence}`,
        createdAt: 1_000 + sequence,
        maximumActiveExecutions: 1,
      });
    const results = await Promise.all([create(1), create(2)]);
    expect(results.map((result) => result.kind).sort()).toEqual([
      'created',
      'quota-exceeded',
    ]);
    await expect(repository.countActive('owner-1')).resolves.toBe(1);
  });

  it('atomically persists, claims and revokes server authority outside the execution record', async () => {
    const snapshots = createPostgresRemoteExecutionSnapshotStore(pool);
    const repository = createPostgresRemoteExecutionRepository(pool);
    await snapshots.put('owner-1', snapshot, 1_000);
    await repository.createOrGet({
      ownerId: 'owner-1',
      identityKey: 'authority-identity',
      request: request('authority-request'),
      snapshotId: snapshot.workspace.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      provider,
      executionId: 'authority-execution',
      createdAt: 1_000,
      maximumActiveExecutions: 1,
      serverAuthority: {
        format: REMOTE_EXECUTION_SERVER_AUTHORITY_FORMAT,
        principal: {
          providerId: 'prodivix-product-session',
          principalId: 'product-user-1',
        },
        permissions: ['workspace.owner'],
        workspaceId: snapshot.workspace.workspaceId,
        snapshotId: snapshot.workspace.snapshotId,
        expiresAt: 2_000,
      },
    });
    const execution = await repository.get('authority-execution');
    expect(JSON.stringify(execution)).not.toContain('product-user-1');
    const persisted = await pool.query<{
      request_text: string;
      authority_text: string;
    }>(
      `SELECT e.request_json::text AS request_text, a.authority_json::text AS authority_text
         FROM remote_executions e
         JOIN remote_execution_server_authorities a USING (execution_id)
        WHERE e.execution_id=$1`,
      ['authority-execution']
    );
    expect(persisted.rows[0]?.request_text).not.toContain('product-user-1');
    expect(persisted.rows[0]?.authority_text).toContain('product-user-1');
    expect(persisted.rows[0]?.authority_text).toContain('workspace.owner');

    const claim = await repository.claimNext({
      workerId: 'authority-worker',
      providerId: provider.id,
      leaseToken: 'authority-lease-token',
      now: 1_100,
      leaseDurationMs: 100,
    });
    expect(claim?.authority).toMatchObject({
      executionId: 'authority-execution',
      workerId: 'authority-worker',
      workerAttempt: 1,
      principal: { principalId: 'product-user-1' },
      permissions: ['workspace.owner'],
    });
    expect(JSON.stringify(claim?.authority)).not.toContain(
      'authority-lease-token'
    );
    await repository.transition({
      executionId: 'authority-execution',
      workerId: 'authority-worker',
      leaseToken: 'authority-lease-token',
      status: 'running',
      now: 1_101,
    });
    await repository.transition({
      executionId: 'authority-execution',
      workerId: 'authority-worker',
      leaseToken: 'authority-lease-token',
      status: 'succeeded',
      now: 1_102,
    });
    const remaining = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM remote_execution_server_authorities'
    );
    expect(remaining.rows[0]?.count).toBe('0');
  });

  it('uses SKIP LOCKED claims and fences an expired worker lease', async () => {
    const store = createPostgresRemoteExecutionSnapshotStore(pool);
    const repository = createPostgresRemoteExecutionRepository(pool);
    await store.put('owner-1', snapshot, 1_000);
    for (const sequence of [1, 2]) {
      await repository.createOrGet({
        ownerId: 'owner-1',
        identityKey: `identity-${sequence}`,
        request: request(`request-${sequence}`),
        snapshotId: snapshot.workspace.snapshotId,
        snapshotDigest: snapshot.contentDigest,
        provider,
        executionId: `execution-${sequence}`,
        createdAt: 1_000 + sequence,
        maximumActiveExecutions: 4,
      });
    }
    const [first, second] = await Promise.all([
      repository.claimNext({
        workerId: 'worker-1',
        providerId: provider.id,
        leaseToken: 'lease-1',
        now: 2_000,
        leaseDurationMs: 10,
      }),
      repository.claimNext({
        workerId: 'worker-2',
        providerId: provider.id,
        leaseToken: 'lease-2',
        now: 2_000,
        leaseDurationMs: 100,
      }),
    ]);
    expect(
      new Set([
        first?.execution.record.requestId,
        second?.execution.record.requestId,
      ])
    ).toEqual(new Set(['request-1', 'request-2']));
    const expiring = first!;
    const reclaimed = await repository.claimNext({
      workerId: 'worker-3',
      providerId: provider.id,
      leaseToken: 'lease-3',
      now: 2_011,
      leaseDurationMs: 100,
    });
    expect(reclaimed?.execution.record.executionId).toBe(
      expiring.execution.record.executionId
    );
    await expect(
      repository.transition({
        executionId: expiring.execution.record.executionId,
        workerId: expiring.lease.workerId,
        leaseToken: expiring.lease.token,
        status: 'running',
        now: 2_012,
      })
    ).resolves.toBeUndefined();
  });

  it('rolls back execution creation when the snapshot foreign key is absent', async () => {
    const repository = createPostgresRemoteExecutionRepository(pool);
    await expect(
      repository.createOrGet({
        ownerId: 'owner-1',
        identityKey: 'identity-1',
        request: request('request-1'),
        snapshotId: snapshot.workspace.snapshotId,
        snapshotDigest: snapshot.contentDigest,
        provider,
        executionId: 'execution-1',
        createdAt: 1_000,
        maximumActiveExecutions: 1,
      })
    ).rejects.toMatchObject({ code: '23503' });
    const count = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM remote_executions'
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('assigns durable event cursors transactionally and fences stale ingestion', async () => {
    const store = createPostgresRemoteExecutionSnapshotStore(pool);
    const repository = createPostgresRemoteExecutionRepository(pool);
    await store.put('owner-1', snapshot, 1_000);
    await repository.createOrGet({
      ownerId: 'owner-1',
      identityKey: 'identity-1',
      request: request('request-1'),
      snapshotId: snapshot.workspace.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      provider,
      executionId: 'execution-1',
      createdAt: 1_000,
      maximumActiveExecutions: 1,
    });
    const claimed = await repository.claimNext({
      workerId: 'worker-1',
      providerId: provider.id,
      leaseToken: 'lease-1',
      now: 2_000,
      leaseDurationMs: 100,
    });
    const appended = await repository.appendWorkerEvent({
      executionId: 'execution-1',
      workerId: 'worker-1',
      leaseToken: claimed!.lease.token,
      emittedAt: 2_001,
      workerEventId: 'attempt-1:stdout',
      limits: ingestionLimits,
      event: {
        kind: 'log',
        log: {
          stream: 'stdout',
          level: 'info',
          message: 'build complete',
          redacted: true,
        },
      },
    });
    expect(appended).toMatchObject({
      kind: 'stored',
      execution: { record: { latestCursor: 3 } },
    });
    expect(
      appended.kind === 'stored' ? appended.execution.events.at(-1) : undefined
    ).toMatchObject({
      cursor: 3,
      event: { kind: 'log', sequence: 3 },
    });
    await expect(
      repository.appendWorkerEvent({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        emittedAt: 2_002,
        workerEventId: 'attempt-1:stdout',
        limits: ingestionLimits,
        event: {
          kind: 'log',
          log: {
            stream: 'stdout',
            level: 'info',
            message: 'build complete',
            redacted: true,
          },
        },
      })
    ).resolves.toMatchObject({
      kind: 'existing',
      execution: { record: { latestCursor: 3 } },
    });
    await expect(
      repository.appendWorkerEvent({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        emittedAt: 2_003,
        workerEventId: 'attempt-1:stdout',
        limits: ingestionLimits,
        event: {
          kind: 'log',
          log: {
            stream: 'stdout',
            level: 'info',
            message: 'identity drift',
            redacted: true,
          },
        },
      })
    ).resolves.toEqual({ kind: 'identity-conflict' });
    await expect(
      repository.appendWorkerEvent({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claimed!.lease.token,
        emittedAt: 2_004,
        workerEventId: 'attempt-1:budget',
        event: {
          kind: 'log',
          log: {
            stream: 'stdout',
            level: 'info',
            message: 'budget overflow',
            redacted: true,
          },
        },
        limits: { ...ingestionLimits, maximumLogBytes: 1 },
      })
    ).resolves.toEqual({ kind: 'budget-exceeded' });
    await expect(
      repository.appendWorkerEvent({
        executionId: 'execution-1',
        workerId: 'worker-2',
        leaseToken: claimed!.lease.token,
        emittedAt: 2_002,
        workerEventId: 'attempt-1:stale',
        limits: ingestionLimits,
        event: {
          kind: 'log',
          log: { stream: 'stderr', level: 'error', message: 'stale' },
        },
      })
    ).resolves.toEqual({ kind: 'lease-rejected' });
  });

  it('stores content-addressed artifact bytes, enforces budgets, and sweeps expiry', async () => {
    const snapshots = createPostgresRemoteExecutionSnapshotStore(pool);
    const repository = createPostgresRemoteExecutionRepository(pool);
    await snapshots.put('owner-1', snapshot, 1_000);
    await repository.createOrGet({
      ownerId: 'owner-1',
      identityKey: 'identity-1',
      request: request('request-1'),
      snapshotId: snapshot.workspace.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      provider,
      executionId: 'execution-1',
      createdAt: 1_000,
      maximumActiveExecutions: 1,
    });
    const claim = await repository.claimNext({
      workerId: 'worker-1',
      providerId: provider.id,
      leaseToken: 'lease-1',
      now: 2_000,
      leaseDurationMs: 100,
    });
    const contents = new TextEncoder().encode('artifact contents');
    const digest = `sha256-${createHash('sha256').update(contents).digest('hex')}`;
    const descriptor = {
      artifactId: 'artifact-1',
      kind: 'bundle' as const,
      mediaType: 'application/zip',
      size: contents.byteLength,
      digest,
      expiresAt: 3_000,
      authorizationScope: 'execution:execution-1',
    };
    await expect(
      repository.putArtifact({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claim!.lease.token,
        workerEventId: 'attempt-1:artifact-1',
        emittedAt: 2_001,
        descriptor,
        contents,
        limits: ingestionLimits,
      })
    ).resolves.toMatchObject({
      kind: 'stored',
      execution: { record: { latestCursor: 3 } },
    });
    await expect(
      repository.putArtifact({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claim!.lease.token,
        workerEventId: 'attempt-1:artifact-1',
        emittedAt: 2_002,
        descriptor,
        contents,
        limits: ingestionLimits,
      })
    ).resolves.toMatchObject({ kind: 'existing' });
    await expect(
      repository.putArtifact({
        executionId: 'execution-1',
        workerId: 'worker-1',
        leaseToken: claim!.lease.token,
        workerEventId: 'attempt-1:artifact-budget',
        emittedAt: 2_003,
        descriptor: { ...descriptor, artifactId: 'artifact-budget' },
        contents,
        limits: { ...ingestionLimits, maximumSingleArtifactBytes: 1 },
      })
    ).resolves.toMatchObject({ kind: 'budget-exceeded' });
    await expect(
      repository.getArtifact({
        ownerId: 'owner-1',
        executionId: 'execution-1',
        artifactId: 'artifact-1',
        now: 2_500,
      })
    ).resolves.toMatchObject({ descriptor: { digest } });
    await expect(
      repository.getArtifact({
        ownerId: 'owner-2',
        executionId: 'execution-1',
        artifactId: 'artifact-1',
        now: 2_500,
      })
    ).resolves.toBeUndefined();
    await expect(
      repository.sweepExpiredArtifacts({ now: 3_001, limit: 10 })
    ).resolves.toBe(1);
    const blobCount = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM remote_execution_artifact_blobs'
    );
    expect(blobCount.rows[0]?.count).toBe('0');
  });
});
