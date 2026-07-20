import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
} from '@prodivix/runtime-core';
import {
  assessRemoteExecutionRegionalRecovery,
  createRemoteExecutionRegionalTrafficGate,
} from '@prodivix/runtime-remote';
import { createPostgresRemoteExecutionRegionalRecoveryProbe } from './postgresRegionalRecovery';
import { createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore } from './postgresRegionalRecoveryOperatorGrantStore';
import { createPostgresRemoteExecutionRepository } from './postgresExecutionRepository';
import {
  createPostgresRemoteExecutionRegionalTrafficAuthority,
  migrateRemoteExecutionRegionalTrafficPostgres,
} from './postgresRegionalTrafficAuthority';
import { createPostgresRemoteExecutionSnapshotStore } from './postgresSnapshotStore';
import { migrateRemoteExecutionPostgres } from './schema';

const databaseUrl = process.env.PRODIVIX_REMOTE_POSTGRES_TEST_URL;
const integration = databaseUrl ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const sourceSchema = `prodivix_dr_source_${suffix}`;
const targetSchema = `prodivix_dr_target_${suffix}`;
const trafficSchema = `prodivix_dr_traffic_${suffix}`;
let admin: Pool;
let sourcePool: Pool;
let targetPool: Pool;
let trafficPool: Pool;

const snapshot = createExecutableProjectSnapshot({
  workspace: {
    workspaceId: 'workspace-dr',
    snapshotId: 'snapshot-dr',
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
  id: 'prodivix.remote.dr',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['filesystem', 'cancellation', 'terminal'],
});
const request = createExecutionRequest({
  requestId: 'request-dr',
  profile: 'preview',
  runtimeZone: 'client',
  workspace: snapshot.workspace,
  invocation: {
    kind: 'workspace',
    targetRef: { kind: 'workspace', workspaceId: 'workspace-dr' },
  },
  requiredCapabilities: ['filesystem'],
});

const schemaPool = (schema: string, maximum = 8): Pool =>
  new Pool({
    connectionString: databaseUrl,
    max: maximum,
    options: `-c search_path=${schema}`,
  });

const executionTables = [
  'remote_execution_snapshot_blobs',
  'remote_execution_snapshot_grants',
  'remote_executions',
  'remote_execution_terminal_sessions',
  'remote_execution_server_authorities',
  'remote_execution_events',
  'remote_execution_artifact_blobs',
  'remote_execution_artifact_grants',
] as const;

const replicate = async (): Promise<void> => {
  await admin.query('BEGIN');
  try {
    await admin.query(
      `TRUNCATE ${targetSchema}.remote_execution_snapshot_blobs CASCADE`
    );
    for (const table of executionTables) {
      await admin.query(
        `INSERT INTO ${targetSchema}.${table} SELECT * FROM ${sourceSchema}.${table}`
      );
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
};

integration('remote execution regional PostgreSQL recovery', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl, max: 4 });
    for (const schema of [sourceSchema, targetSchema, trafficSchema])
      await admin.query(`CREATE SCHEMA ${schema}`);
    sourcePool = schemaPool(sourceSchema);
    targetPool = schemaPool(targetSchema);
    trafficPool = schemaPool(trafficSchema, 12);
    await Promise.all([
      migrateRemoteExecutionPostgres(sourcePool),
      migrateRemoteExecutionPostgres(targetPool),
      migrateRemoteExecutionRegionalTrafficPostgres(trafficPool),
    ]);

    const snapshots = createPostgresRemoteExecutionSnapshotStore(sourcePool);
    const repository = createPostgresRemoteExecutionRepository(sourcePool);
    await snapshots.put('owner-dr', snapshot, 1_000);
    await repository.createOrGet({
      ownerId: 'owner-dr',
      identityKey: 'identity-dr',
      request,
      snapshotId: snapshot.workspace.snapshotId,
      snapshotDigest: snapshot.contentDigest,
      provider,
      executionId: 'execution-dr',
      createdAt: 1_000,
      maximumActiveExecutions: 1,
    });
    const claim = await repository.claimNext({
      workerId: 'worker-dr',
      providerId: provider.id,
      leaseToken: 'lease-dr',
      now: 1_100,
      leaseDurationMs: 1_000,
      maximumAttempts: 3,
    });
    await repository.transition({
      executionId: 'execution-dr',
      workerId: claim!.lease.workerId,
      leaseToken: claim!.lease.token,
      status: 'running',
      now: 1_101,
    });
  });

  afterAll(async () => {
    await Promise.all([
      sourcePool?.end(),
      targetPool?.end(),
      trafficPool?.end(),
    ]);
    if (admin) {
      for (const schema of [sourceSchema, targetSchema, trafficSchema])
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('fails closed on lag/drift and accepts only an exact repeatable-read replica', async () => {
    const sourceProbe = createPostgresRemoteExecutionRegionalRecoveryProbe(
      sourcePool,
      { regionId: 'region-a' }
    );
    const targetProbe = createPostgresRemoteExecutionRegionalRecoveryProbe(
      targetPool,
      { regionId: 'region-b' }
    );
    const source = await sourceProbe.capture('execution-dr', 1_200);
    expect(
      assessRemoteExecutionRegionalRecovery({
        source,
        target: await targetProbe.capture('execution-dr', 1_200),
        now: 1_200,
        maximumWorkerAttempts: 3,
      })
    ).toMatchObject({
      kind: 'wait-for-replication',
      reason: 'target-missing',
    });

    await replicate();
    const exact = await targetProbe.capture('execution-dr', 1_200);
    expect(exact?.stateDigest).toBe(source?.stateDigest);
    expect(
      assessRemoteExecutionRegionalRecovery({
        source,
        target: exact,
        now: 1_200,
        maximumWorkerAttempts: 3,
      })
    ).toMatchObject({
      kind: 'ready',
      mode: 'same-worker-continuation',
    });

    const repository = createPostgresRemoteExecutionRepository(sourcePool);
    await repository.appendWorkerEvent({
      executionId: 'execution-dr',
      workerId: 'worker-dr',
      leaseToken: 'lease-dr',
      emittedAt: 1_201,
      workerEventId: 'dr-log-1',
      event: {
        kind: 'log',
        log: {
          stream: 'stdout',
          level: 'info',
          message: 'replication checkpoint',
        },
      },
      limits: {
        maximumEvents: 100,
        maximumEventBytes: 1024 * 1024,
        maximumLogBytes: 1024 * 1024,
        maximumArtifacts: 8,
        maximumArtifactBytes: 1024 * 1024,
        maximumSingleArtifactBytes: 512 * 1024,
        maximumArtifactRetentionMs: 60_000,
      },
    });
    expect(
      assessRemoteExecutionRegionalRecovery({
        source: await sourceProbe.capture('execution-dr', 1_202),
        target: await targetProbe.capture('execution-dr', 1_202),
        now: 1_202,
        maximumWorkerAttempts: 3,
      })
    ).toMatchObject({
      kind: 'wait-for-replication',
      reason: 'execution-cursor-behind',
    });
    await replicate();
    await targetPool.query(
      `UPDATE remote_executions
          SET request_json=jsonb_set(request_json, '{profile}', '"build"'::jsonb)
        WHERE execution_id='execution-dr'`
    );
    expect(
      assessRemoteExecutionRegionalRecovery({
        source: await sourceProbe.capture('execution-dr', 1_203),
        target: await targetProbe.capture('execution-dr', 1_203),
        now: 1_203,
        maximumWorkerAttempts: 3,
      })
    ).toMatchObject({ kind: 'blocked', reason: 'state-diverged' });
    await replicate();
  });

  it('drains shared request permits, advances one epoch, and rejects the old region', async () => {
    const authority =
      createPostgresRemoteExecutionRegionalTrafficAuthority(trafficPool);
    await authority.initialize({
      deploymentId: 'deployment-dr',
      activeRegionId: 'region-a',
      initializedAt: 1_000,
    });
    const sourceGate = createRemoteExecutionRegionalTrafficGate({
      authority,
      deploymentId: 'deployment-dr',
      regionId: 'region-a',
    });
    const targetGate = createRemoteExecutionRegionalTrafficGate({
      authority,
      deploymentId: 'deployment-dr',
      regionId: 'region-b',
    });
    const sourcePermit = await sourceGate.acquire();
    expect(sourcePermit?.epoch).toBe(1);
    await expect(targetGate.acquire()).resolves.toBeUndefined();

    const prepare = vi.fn(async () => ({
      checkpointDigest: `sha256-${'a'.repeat(64)}`,
      result: 'prepared',
    }));
    const pending = authority.cutover(
      {
        deploymentId: 'deployment-dr',
        expectedEpoch: 1,
        sourceRegionId: 'region-a',
        targetRegionId: 'region-b',
        cutoverAt: 2_000,
      },
      prepare
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(prepare).not.toHaveBeenCalled();
    await sourcePermit!.release();
    await expect(pending).resolves.toMatchObject({
      kind: 'cutover',
      state: { activeRegionId: 'region-b', epoch: 2 },
      result: 'prepared',
    });
    await expect(authority.listCutovers('deployment-dr', 10)).resolves.toEqual([
      {
        deploymentId: 'deployment-dr',
        epoch: 2,
        sourceRegionId: 'region-a',
        targetRegionId: 'region-b',
        checkpointDigest: `sha256-${'a'.repeat(64)}`,
        cutoverAt: 2_000,
      },
    ]);
    await expect(sourceGate.acquire()).resolves.toBeUndefined();
    const targetPermit = await targetGate.acquire();
    expect(targetPermit?.epoch).toBe(2);
    await targetPermit!.release();
    await expect(
      authority.cutover(
        {
          deploymentId: 'deployment-dr',
          expectedEpoch: 1,
          sourceRegionId: 'region-a',
          targetRegionId: 'region-b',
          cutoverAt: 2_001,
        },
        prepare
      )
    ).resolves.toMatchObject({
      kind: 'conflict',
      state: { activeRegionId: 'region-b', epoch: 2 },
    });

    await authority.initialize({
      deploymentId: 'deployment-dr-rollback',
      activeRegionId: 'region-a',
      initializedAt: 3_000,
    });
    await expect(
      authority.cutover(
        {
          deploymentId: 'deployment-dr-rollback',
          expectedEpoch: 1,
          sourceRegionId: 'region-a',
          targetRegionId: 'region-b',
          cutoverAt: 3_001,
        },
        async () => {
          throw new Error('replica not ready');
        }
      )
    ).rejects.toThrow('replica not ready');
    await expect(
      authority.inspect('deployment-dr-rollback')
    ).resolves.toMatchObject({ activeRegionId: 'region-a', epoch: 1 });
    await expect(
      authority.listCutovers('deployment-dr-rollback', 10)
    ).resolves.toEqual([]);
  });

  it('consumes only one copy of a concurrent signed operator grant', async () => {
    const store =
      createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore(
        trafficPool
      );
    const grantDigest = `sha256-${'f'.repeat(64)}`;
    const results = await Promise.all(
      Array.from({ length: 16 }, () =>
        store.consume({
          grantDigest,
          consumedAt: 4_000,
          expiresAt: 5_000,
        })
      )
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(
      store.consume({
        grantDigest: `sha256-${'e'.repeat(64)}`,
        consumedAt: 5_000,
        expiresAt: 5_000,
      })
    ).rejects.toThrow('grant is expired');
    const columns = await trafficPool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='remote_execution_regional_operator_grants'
        ORDER BY ordinal_position`
    );
    expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
      'grant_digest',
      'expires_at',
      'consumed_at',
    ]);
  });
});
