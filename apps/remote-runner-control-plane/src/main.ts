import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { createExecutionSecretLeakGuard } from '@prodivix/runtime-core';
import {
  createActiveExecutionQuotaPolicy,
  createRemoteExecutionControlPlane,
  createRemoteExecutionTerminalBroker,
  createScopeRemoteExecutionAuthorizationPolicy,
  createStaticRemoteExecutionProviderRouter,
  encodeRemoteExecutableProjectSnapshot,
  remoteBuildExecutionProviderDescriptor,
  remotePreviewExecutionProviderDescriptor,
  remoteTestExecutionProviderDescriptor,
} from '@prodivix/runtime-remote';
import {
  createPostgresRemoteExecutionRepository,
  createPostgresRemoteExecutionSnapshotStore,
  migrateRemoteExecutionPostgres,
} from '@prodivix/runtime-remote-postgres';
import { createRemoteExecutionHttpHandler } from './httpHandler';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
};

const integer = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`);
  return value;
};

const optionalSecretValues = (name: string): readonly string[] => {
  const raw = process.env[name];
  if (raw === undefined) return Object.freeze([]);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(`${name} must be valid JSON.`);
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== 'string' || entry.length < 4 || entry.length > 8_192
    )
  )
    throw new TypeError(`${name} must be an array of bounded strings.`);
  return Object.freeze([...value]);
};

const workerTokens = (): Readonly<Record<string, string>> => {
  const raw = required('REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON');
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(
      'REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON must be valid JSON.'
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(
      'REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON must be an object.'
    );
  const entries = Object.entries(value);
  if (
    !entries.length ||
    entries.some(
      ([workerId, token]) =>
        !workerId.trim() ||
        workerId.length > 4_096 ||
        typeof token !== 'string' ||
        !token ||
        token.length > 8_192
    )
  ) {
    throw new TypeError(
      'REMOTE_CONTROL_PLANE_WORKER_TOKENS_JSON contains an invalid worker credential.'
    );
  }
  return Object.freeze(Object.fromEntries(entries));
};

const secretEqual = (provided: string, expected: string): boolean => {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const databaseUrl = required('REMOTE_CONTROL_PLANE_DATABASE_URL');
const clientToken = required('REMOTE_CONTROL_PLANE_CLIENT_TOKEN');
const clientSubject = required('REMOTE_CONTROL_PLANE_CLIENT_SUBJECT');
const workerTokenById = workerTokens();
const secretCanaries = optionalSecretValues(
  'REMOTE_CONTROL_PLANE_SECRET_CANARIES_JSON'
);
const port = integer('REMOTE_CONTROL_PLANE_PORT', 4310);
const maximumActiveExecutions = integer(
  'REMOTE_CONTROL_PLANE_MAX_ACTIVE_EXECUTIONS',
  4
);
const artifactSweepIntervalMs = integer(
  'REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_MS',
  60_000
);
const artifactSweepBatch = integer(
  'REMOTE_CONTROL_PLANE_ARTIFACT_SWEEP_BATCH',
  100
);

const pool = new Pool({ connectionString: databaseUrl });
await migrateRemoteExecutionPostgres(pool);
const repository = createPostgresRemoteExecutionRepository(pool);
const snapshots = createPostgresRemoteExecutionSnapshotStore(pool);
const controlPlane = createRemoteExecutionControlPlane({
  repository,
  snapshots,
  authorization: createScopeRemoteExecutionAuthorizationPolicy(),
  quota: createActiveExecutionQuotaPolicy(maximumActiveExecutions),
  router: createStaticRemoteExecutionProviderRouter([
    remotePreviewExecutionProviderDescriptor,
    remoteTestExecutionProviderDescriptor,
    remoteBuildExecutionProviderDescriptor,
  ]),
  createExecutionId: () => `execution-${randomUUID()}`,
  createLeaseToken: () => `lease-${randomUUID()}`,
  outputGuard: createExecutionSecretLeakGuard({
    secretValues: [
      clientToken,
      databaseUrl,
      ...Object.values(workerTokenById),
      ...secretCanaries,
    ],
  }),
});
const terminalBroker = createRemoteExecutionTerminalBroker({
  resolveExecution: (executionId) => repository.get(executionId),
  createTerminalSessionId: () => `terminal-${randomUUID()}`,
  createAccessToken: () => `terminal-access-${randomUUID()}-${randomUUID()}`,
  accessTokenTtlMs: integer('REMOTE_TERMINAL_ACCESS_TTL_MS', 60_000),
  secretValues: [
    clientToken,
    databaseUrl,
    ...Object.values(workerTokenById),
    ...secretCanaries,
  ],
});
const handler = createRemoteExecutionHttpHandler({
  controlPlane,
  terminalBroker,
  authenticator: Object.freeze({
    async authenticateClient(token: string) {
      return secretEqual(token, clientToken)
        ? Object.freeze({
            subjectId: clientSubject,
            scopes: Object.freeze(['remote-execution:*']),
          })
        : undefined;
    },
    async authenticateWorker(token: string, workerId: string) {
      const expected = workerTokenById[workerId];
      return expected !== undefined && secretEqual(token, expected);
    },
  }),
  async resolveClaimedSnapshot(input) {
    const execution = await repository.get(input.executionId);
    if (
      !execution?.lease ||
      execution.lease.workerId !== input.workerId ||
      execution.lease.token !== input.leaseToken ||
      execution.lease.expiresAt <= Date.now()
    )
      return undefined;
    const stored = await snapshots.get(
      execution.ownerId,
      execution.snapshotId,
      execution.record.snapshotDigest
    );
    return stored
      ? encodeRemoteExecutableProjectSnapshot(stored.snapshot)
      : undefined;
  },
  async isCancellationRequested(input) {
    const execution = await repository.get(input.executionId);
    if (
      !execution?.lease ||
      execution.lease.workerId !== input.workerId ||
      execution.lease.token !== input.leaseToken ||
      execution.lease.expiresAt <= Date.now()
    )
      return undefined;
    return execution.record.status === 'cancelling';
  },
});
const server = createServer((request, response) => {
  void handler(request, response);
});
let sweepBusy = false;
const artifactSweep = setInterval(() => {
  if (sweepBusy) return;
  sweepBusy = true;
  void controlPlane
    .sweepExpiredArtifacts(artifactSweepBatch)
    .then((swept) => swept + terminalBroker.sweepExpired())
    .catch(() => 0)
    .finally(() => {
      sweepBusy = false;
    });
}, artifactSweepIntervalMs);

const shutdown = async (): Promise<void> => {
  clearInterval(artifactSweep);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
server.listen(port, '0.0.0.0');
