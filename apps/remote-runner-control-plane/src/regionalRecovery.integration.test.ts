import {
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createExecutableProjectSnapshot,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  createExecutionSecretLeakGuard,
} from '@prodivix/runtime-core';
import {
  createActiveExecutionQuotaPolicy,
  createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest,
  createRemoteExecutionRegionalRecoveryExecutionSetDigest,
  createRemoteExecutionRegionalRecoveryOperator,
  createRemoteExecutionControlPlane,
  createRemoteExecutionRegionalRecoveryCoordinator,
  createRemoteExecutionRegionalTrafficGate,
  createReplicatedRemoteExecutionTerminalBroker,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
  type RemoteExecutionControlPlane,
  type RemoteExecutionRegionalTrafficAuthority,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
  type RemoteExecutionRepository,
  type RemoteExecutionSnapshotStore,
  type RemoteExecutionTerminalBroker,
} from '@prodivix/runtime-remote';
import {
  createPostgresRemoteExecutionRegionalRecoveryProbe,
  createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore,
  createPostgresRemoteExecutionRegionalTrafficAuthority,
  createPostgresRemoteExecutionRepository,
  createPostgresRemoteExecutionSnapshotStore,
  createPostgresRemoteExecutionTerminalStateStore,
  migrateRemoteExecutionPostgres,
  migrateRemoteExecutionRegionalTrafficPostgres,
} from '@prodivix/runtime-remote-postgres';
import { createRemoteExecutionHttpHandler } from './httpHandler';
import { createAesGcmRemoteExecutionTerminalStateCipher } from './terminalStateCipher';
import {
  createRemoteRegionalRecoverySignedProofPorts,
  encodeRemoteRegionalRecoverySignedProof,
  encodeRemoteRegionalRecoverySignedProofPayload,
  type RemoteRegionalRecoveryUnsignedProof,
} from './regionalRecoverySignedProof';

const databaseUrl = process.env.PRODIVIX_REMOTE_POSTGRES_TEST_URL;
const integration = databaseUrl ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const schemaA = `prodivix_cp_dr_a_${suffix}`;
const schemaB = `prodivix_cp_dr_b_${suffix}`;
const trafficSchema = `prodivix_cp_dr_traffic_${suffix}`;
let admin: Pool;
let trafficPool: Pool;

const snapshot = createExecutableProjectSnapshot({
  workspace: {
    workspaceId: 'workspace-regional',
    snapshotId: 'snapshot-regional',
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
  id: 'prodivix.remote.regional-dr',
  version: '1',
  isolation: 'remote-isolated',
  profiles: ['preview'],
  runtimeZones: ['client'],
  invocationKinds: ['workspace'],
  capabilities: ['filesystem', 'cancellation', 'terminal'],
});

type Region = Readonly<{
  id: string;
  schema: string;
  pool: Pool;
  repository: RemoteExecutionRepository;
  snapshots: RemoteExecutionSnapshotStore;
  controlPlane: RemoteExecutionControlPlane;
  terminalBroker: RemoteExecutionTerminalBroker;
  setNow(value: number): void;
}>;

const createRegion = async (id: string, schema: string): Promise<Region> => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 12,
    options: `-c search_path=${schema}`,
  });
  await migrateRemoteExecutionPostgres(pool);
  const repository = createPostgresRemoteExecutionRepository(pool);
  const snapshots = createPostgresRemoteExecutionSnapshotStore(pool);
  let now = 1_000;
  let identity = 0;
  const controlPlane = createRemoteExecutionControlPlane({
    repository,
    snapshots,
    authorization: createScopeRemoteExecutionAuthorizationPolicy(),
    quota: createActiveExecutionQuotaPolicy(8),
    router: createStaticRemoteExecutionProviderRouter([provider]),
    now: () => now,
    createExecutionId: () => `${id}-execution-${++identity}`,
    createLeaseToken: () => `${id}-lease-${++identity}`,
    maximumWorkerAttempts: 3,
    outputGuard: createExecutionSecretLeakGuard({
      secretValues: ['dr-canary'],
    }),
  });
  const terminalBroker = createReplicatedRemoteExecutionTerminalBroker({
    stateStore: createPostgresRemoteExecutionTerminalStateStore(pool),
    stateCipher: createAesGcmRemoteExecutionTerminalStateCipher({
      activeKeyId: 'regional-key',
      keys: [{ keyId: 'regional-key', key: new Uint8Array(32).fill(0x41) }],
    }),
    resolveExecution: (executionId) => repository.get(executionId),
    createTerminalSessionId: () => `${id}-terminal-${++identity}`,
    createAccessToken: () => `${id}-access-${++identity}-opaque-token`,
    accessTokenTtlMs: 1_000,
    secretValues: ['dr-canary'],
    now: () => now,
  });
  return Object.freeze({
    id,
    schema,
    pool,
    repository,
    snapshots,
    controlPlane,
    terminalBroker,
    setNow(value: number) {
      now = value;
    },
  });
};

let regionA: Region;
let regionB: Region;
let authority: RemoteExecutionRegionalTrafficAuthority;

const tables = [
  'remote_execution_snapshot_blobs',
  'remote_execution_snapshot_grants',
  'remote_executions',
  'remote_execution_terminal_sessions',
  'remote_execution_server_authorities',
  'remote_execution_events',
  'remote_execution_artifact_blobs',
  'remote_execution_artifact_grants',
] as const;

const replicate = async (source: Region, target: Region): Promise<void> => {
  await admin.query('BEGIN');
  try {
    await admin.query(
      `TRUNCATE ${target.schema}.remote_execution_snapshot_blobs CASCADE`
    );
    for (const table of tables)
      await admin.query(
        `INSERT INTO ${target.schema}.${table} SELECT * FROM ${source.schema}.${table}`
      );
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
};

const createExecution = async (
  region: Region,
  executionId: string,
  requestId: string
): Promise<void> => {
  const request = createExecutionRequest({
    requestId,
    profile: 'preview',
    runtimeZone: 'client',
    workspace: snapshot.workspace,
    invocation: {
      kind: 'workspace',
      targetRef: {
        kind: 'workspace',
        workspaceId: snapshot.workspace.workspaceId,
      },
    },
    requiredCapabilities: ['filesystem'],
  });
  await region.snapshots.put('owner-regional', snapshot, 1_000);
  const result = await region.repository.createOrGet({
    ownerId: 'owner-regional',
    identityKey: `identity-${requestId}`,
    request,
    snapshotId: snapshot.workspace.snapshotId,
    snapshotDigest: snapshot.contentDigest,
    provider,
    executionId,
    createdAt: 1_000,
    maximumActiveExecutions: 8,
  });
  expect(result.kind).toBe('created');
};

const startRegion = async (
  region: Region,
  deploymentId: string
): Promise<Readonly<{ server: Server; baseUrl: string }>> => {
  const handler = createRemoteExecutionHttpHandler({
    controlPlane: region.controlPlane,
    terminalBroker: region.terminalBroker,
    regionalTrafficGate: createRemoteExecutionRegionalTrafficGate({
      authority,
      deploymentId,
      regionId: region.id,
    }),
    authenticator: {
      async authenticateClient(token) {
        return token === 'client-token'
          ? {
              subjectId: 'owner-regional',
              scopes: ['remote-execution:*'],
            }
          : undefined;
      },
      async authenticateWorker(token, workerId) {
        return token === 'worker-token' && workerId.startsWith('worker-');
      },
    },
    async resolveClaimedSnapshot(input) {
      const execution = await region.repository.get(input.executionId);
      return execution?.lease?.workerId === input.workerId &&
        execution.lease.token === input.leaseToken
        ? { contentDigest: execution.record.snapshotDigest }
        : undefined;
    },
    async isCancellationRequested(input) {
      const execution = await region.repository.get(input.executionId);
      return execution?.lease?.workerId === input.workerId &&
        execution.lease.token === input.leaseToken
        ? execution.record.status === 'cancelling'
        : undefined;
    },
  });
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return Object.freeze({
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  });
};

const stop = (server: Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

const post = async (
  baseUrl: string,
  path: string,
  body: unknown,
  client = false
): Promise<Readonly<{ status: number; body: any }>> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${client ? 'client-token' : 'worker-token'}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return Object.freeze({
    status: response.status,
    body: await response.json(),
  });
};

const signedRecoveryProof = (
  proof: RemoteRegionalRecoveryUnsignedProof,
  privateKey: KeyObject
): Uint8Array =>
  encodeRemoteRegionalRecoverySignedProof(
    proof,
    sign(
      null,
      encodeRemoteRegionalRecoverySignedProofPayload(proof),
      privateKey
    )
  );

integration('regional Control Plane disaster-recovery drill', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl, max: 4 });
    for (const schema of [schemaA, schemaB, trafficSchema])
      await admin.query(`CREATE SCHEMA ${schema}`);
    regionA = await createRegion('region-a', schemaA);
    regionB = await createRegion('region-b', schemaB);
    trafficPool = new Pool({
      connectionString: databaseUrl,
      max: 16,
      options: `-c search_path=${trafficSchema}`,
    });
    await migrateRemoteExecutionRegionalTrafficPostgres(trafficPool);
    authority =
      createPostgresRemoteExecutionRegionalTrafficAuthority(trafficPool);
  });

  beforeEach(async () => {
    await Promise.all(
      [regionA, regionB].map((region) =>
        region.pool.query('TRUNCATE remote_execution_snapshot_blobs CASCADE')
      )
    );
    await trafficPool.query(
      'TRUNCATE remote_execution_regional_traffic_authorities CASCADE'
    );
    regionA.setNow(1_000);
    regionB.setNow(1_000);
  });

  afterAll(async () => {
    await Promise.all([
      regionA?.pool.end(),
      regionB?.pool.end(),
      trafficPool?.end(),
    ]);
    if (admin) {
      for (const schema of [schemaA, schemaB, trafficSchema])
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('moves one signed and replay-fenced execution batch through a single traffic epoch', async () => {
    const deploymentId = 'deployment-batch-operator';
    await authority.initialize({
      deploymentId,
      activeRegionId: regionA.id,
      initializedAt: 1_000,
    });
    await Promise.all([
      createExecution(regionA, 'execution-batch-a', 'request-batch-a'),
      createExecution(regionA, 'execution-batch-b', 'request-batch-b'),
    ]);
    await replicate(regionA, regionB);

    const authorizationKey = generateKeyPairSync('ed25519');
    const fenceKey = generateKeyPairSync('ed25519');
    const replicationKey = generateKeyPairSync('ed25519');
    const publicKey = (key: KeyObject) =>
      key.export({ type: 'spki', format: 'pem' }).toString();
    const proofPorts = createRemoteRegionalRecoverySignedProofPorts({
      authorizationPublicKeys: {
        authorization: publicKey(authorizationKey.publicKey),
      },
      infrastructureFencePublicKeys: {
        fence: publicKey(fenceKey.publicKey),
      },
      replicationAttestationPublicKeys: {
        replication: publicKey(replicationKey.publicKey),
      },
      grantReplayStore:
        createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore(
          trafficPool
        ),
      now: () => 2_000,
    });
    const request = Object.freeze({
      format: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_FORMAT,
      version: REMOTE_EXECUTION_REGIONAL_RECOVERY_OPERATOR_VERSION,
      operationId: 'operation-batch-1',
      mode: 'planned' as const,
      executionIds: Object.freeze(['execution-batch-b', 'execution-batch-a']),
      expectedTrafficEpoch: 1,
      initiatedAt: 1_900,
      cutoverAt: 2_000,
    });
    const scope = Object.freeze({
      format: request.format,
      version: request.version,
      operationId: request.operationId,
      deploymentId,
      sourceRegionId: regionA.id,
      targetRegionId: regionB.id,
      mode: request.mode,
      expectedTrafficEpoch: request.expectedTrafficEpoch,
      executionCount: request.executionIds.length,
      executionSetDigest:
        createRemoteExecutionRegionalRecoveryExecutionSetDigest(
          request.executionIds
        ),
      initiatedAt: request.initiatedAt,
      cutoverAt: request.cutoverAt,
    });
    const grant = signedRecoveryProof(
      {
        kind: 'operator-authorization',
        keyId: 'authorization',
        claim: {
          scopeDigest:
            createRemoteExecutionRegionalRecoveryAuthorizationScopeDigest(
              scope
            ),
          principalDigest: `sha256-${'a'.repeat(64)}`,
          expiresAt: 2_500,
        },
      },
      authorizationKey.privateKey
    );
    let nowCalls = 0;
    const operator = createRemoteExecutionRegionalRecoveryOperator({
      deploymentId,
      sourceRegionId: regionA.id,
      targetRegionId: regionB.id,
      source: createPostgresRemoteExecutionRegionalRecoveryProbe(regionA.pool, {
        regionId: regionA.id,
      }),
      target: createPostgresRemoteExecutionRegionalRecoveryProbe(regionB.pool, {
        regionId: regionB.id,
      }),
      trafficAuthority: authority,
      authorization: proofPorts.authorization,
      infrastructureFence: proofPorts.infrastructureFence,
      replicationAttestation: proofPorts.replicationAttestation,
      targetTerminalBroker: regionB.terminalBroker,
      maximumWorkerAttempts: 3,
      maximumRequestAgeMs: 1_000,
      maximumProofLifetimeMs: 1_000,
      maximumAcceptedRpoMs: 500,
      now: () => (nowCalls++ === 0 ? 2_000 : 2_100),
    });
    const result = await operator.execute(request, {
      authorizationGrant: grant,
    });
    expect(result).toMatchObject({
      kind: 'cutover',
      state: { activeRegionId: regionB.id, epoch: 2 },
      evidence: {
        executionCount: 2,
        outcomes: { queuedClaim: 2 },
      },
    });
    await expect(
      operator.execute(request, { authorizationGrant: grant })
    ).rejects.toMatchObject({ code: 'authorization-denied' });
    const cutovers = await authority.listCutovers(deploymentId, 10);
    expect(cutovers).toHaveLength(1);
    if (result.kind !== 'cutover') throw new Error('expected cutover');
    expect(cutovers[0]?.checkpointDigest).toBe(result.evidence.evidenceDigest);
  });

  it('continues one exact live lease on the target and fences the old HTTP plane', async () => {
    const deploymentId = 'deployment-live-worker';
    await authority.initialize({
      deploymentId,
      activeRegionId: regionA.id,
      initializedAt: 1_000,
    });
    const [httpA, httpB] = await Promise.all([
      startRegion(regionA, deploymentId),
      startRegion(regionB, deploymentId),
    ]);
    try {
      await createExecution(regionA, 'execution-live', 'request-live');
      const standbyHealth = await fetch(`${httpB.baseUrl}/healthz`);
      expect(standbyHealth.status).toBe(200);
      expect((await fetch(`${httpA.baseUrl}/readyz`)).status).toBe(200);
      expect((await fetch(`${httpB.baseUrl}/readyz`)).status).toBe(503);
      expect(
        await post(httpB.baseUrl, '/internal/v1/claims', {
          workerId: 'worker-live',
          providerId: provider.id,
          leaseDurationMs: 1_000,
        })
      ).toMatchObject({
        status: 503,
        body: { error: { code: 'region-standby' } },
      });
      const claimed = await post(httpA.baseUrl, '/internal/v1/claims', {
        workerId: 'worker-live',
        providerId: provider.id,
        leaseDurationMs: 1_000,
      });
      expect(claimed.status).toBe(200);
      const lease = claimed.body.claim.lease as {
        token: string;
        attempt: number;
      };
      expect(lease.attempt).toBe(1);
      regionA.setNow(1_001);
      await expect(
        post(
          httpA.baseUrl,
          '/internal/v1/executions/execution-live/transition',
          {
            workerId: 'worker-live',
            leaseToken: lease.token,
            status: 'running',
          }
        )
      ).resolves.toMatchObject({ status: 200 });
      await replicate(regionA, regionB);

      const coordinator = createRemoteExecutionRegionalRecoveryCoordinator({
        deploymentId,
        sourceRegionId: regionA.id,
        targetRegionId: regionB.id,
        source: createPostgresRemoteExecutionRegionalRecoveryProbe(
          regionA.pool,
          {
            regionId: regionA.id,
          }
        ),
        target: createPostgresRemoteExecutionRegionalRecoveryProbe(
          regionB.pool,
          {
            regionId: regionB.id,
          }
        ),
        trafficAuthority: authority,
        maximumWorkerAttempts: 3,
      });
      await expect(
        coordinator.cutover({
          executionId: 'execution-live',
          expectedTrafficEpoch: 1,
          cutoverAt: 1_100,
        })
      ).resolves.toMatchObject({
        kind: 'cutover',
        state: { activeRegionId: regionB.id, epoch: 2 },
        result: { kind: 'ready', mode: 'same-worker-continuation' },
      });
      regionA.setNow(1_101);
      regionB.setNow(1_101);
      expect((await fetch(`${httpA.baseUrl}/readyz`)).status).toBe(503);
      expect((await fetch(`${httpB.baseUrl}/readyz`)).status).toBe(200);
      expect(
        await post(
          httpA.baseUrl,
          '/internal/v1/executions/execution-live/transition',
          {
            workerId: 'worker-live',
            leaseToken: lease.token,
            status: 'succeeded',
          }
        )
      ).toMatchObject({
        status: 503,
        body: { error: { code: 'region-standby' } },
      });
      expect(
        await post(
          httpB.baseUrl,
          '/internal/v1/executions/execution-live/lease',
          {
            workerId: 'worker-live',
            leaseToken: lease.token,
            leaseDurationMs: 1_000,
          }
        )
      ).toMatchObject({
        status: 200,
        body: { lease: { workerId: 'worker-live', attempt: 1 } },
      });
      expect(
        (await regionA.repository.get('execution-live'))?.record.status
      ).toBe('running');
    } finally {
      await Promise.all([stop(httpA.server), stop(httpB.server)]);
    }
  });

  it('reclaims an expired worker as attempt 2 and replaces, rather than migrates, its PTY generation', async () => {
    const deploymentId = 'deployment-worker-loss';
    await authority.initialize({
      deploymentId,
      activeRegionId: regionA.id,
      initializedAt: 1_000,
    });
    const [httpA, httpB] = await Promise.all([
      startRegion(regionA, deploymentId),
      startRegion(regionB, deploymentId),
    ]);
    try {
      await createExecution(regionA, 'execution-loss', 'request-loss');
      const claimed = await post(httpA.baseUrl, '/internal/v1/claims', {
        workerId: 'worker-lost',
        providerId: provider.id,
        leaseDurationMs: 100,
      });
      const oldLease = claimed.body.claim.lease as {
        token: string;
        attempt: number;
      };
      regionA.setNow(1_001);
      await post(
        httpA.baseUrl,
        '/internal/v1/executions/execution-loss/transition',
        {
          workerId: 'worker-lost',
          leaseToken: oldLease.token,
          status: 'running',
        }
      );
      const oldTerminal = await post(
        httpA.baseUrl,
        '/v1/executions/execution-loss/terminal-sessions',
        { size: { columns: 80, rows: 24 } },
        true
      );
      expect(oldTerminal.status).toBe(201);
      const oldTerminalSessionId = oldTerminal.body.snapshot.terminalSessionId;
      await replicate(regionA, regionB);
      regionA.setNow(1_101);
      regionB.setNow(1_101);

      const targetTerminalStore =
        createPostgresRemoteExecutionTerminalStateStore(regionB.pool);
      expect(
        await targetTerminalStore.getByExecution('execution-loss')
      ).toMatchObject({ terminalSessionId: oldTerminalSessionId });
      const coordinator = createRemoteExecutionRegionalRecoveryCoordinator({
        deploymentId,
        sourceRegionId: regionA.id,
        targetRegionId: regionB.id,
        source: createPostgresRemoteExecutionRegionalRecoveryProbe(
          regionA.pool,
          {
            regionId: regionA.id,
          }
        ),
        target: createPostgresRemoteExecutionRegionalRecoveryProbe(
          regionB.pool,
          {
            regionId: regionB.id,
          }
        ),
        trafficAuthority: authority,
        maximumWorkerAttempts: 3,
        targetTerminalBroker: regionB.terminalBroker,
      });
      await expect(
        coordinator.cutover({
          executionId: 'execution-loss',
          expectedTrafficEpoch: 1,
          cutoverAt: 1_101,
        })
      ).resolves.toMatchObject({
        kind: 'cutover',
        result: {
          kind: 'ready',
          mode: 'worker-reclaim',
          nextWorkerAttempt: 2,
          terminalAction: 'close-transport-lost',
        },
      });
      await expect(
        targetTerminalStore.getByExecution('execution-loss')
      ).resolves.toBeUndefined();

      const reclaimed = await post(httpB.baseUrl, '/internal/v1/claims', {
        workerId: 'worker-replacement',
        providerId: provider.id,
        leaseDurationMs: 1_000,
      });
      expect(reclaimed).toMatchObject({
        status: 200,
        body: {
          claim: {
            lease: { workerId: 'worker-replacement', attempt: 2 },
          },
        },
      });
      const newLease = reclaimed.body.claim.lease as { token: string };
      expect(
        await post(
          httpB.baseUrl,
          '/internal/v1/executions/execution-loss/transition',
          {
            workerId: 'worker-lost',
            leaseToken: oldLease.token,
            status: 'succeeded',
          }
        )
      ).toMatchObject({
        status: 409,
        body: { error: { code: 'lease-rejected' } },
      });
      const newTerminal = await post(
        httpB.baseUrl,
        '/v1/executions/execution-loss/terminal-sessions',
        { size: { columns: 100, rows: 30 } },
        true
      );
      expect(newTerminal.status).toBe(201);
      expect(newTerminal.body.snapshot.terminalSessionId).not.toBe(
        oldTerminalSessionId
      );
      expect(newLease.token).not.toBe(oldLease.token);
    } finally {
      await Promise.all([stop(httpA.server), stop(httpB.server)]);
    }
  });
});
