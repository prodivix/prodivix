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
  remoteServerFunctionExecutionProviderDescriptor,
  remoteTestExecutionProviderDescriptor,
} from '@prodivix/runtime-remote';
import {
  createPostgresRemoteExecutionRepository,
  createPostgresRemoteExecutionSnapshotStore,
  migrateRemoteExecutionPostgres,
} from '@prodivix/runtime-remote-postgres';
import {
  readIsolatedServerFunctionExecutionRequest,
  readIsolatedServerFunctionPlan,
} from '@prodivix/server-runtime';
import { createRemoteExecutionHttpHandler } from './httpHandler';
import {
  createRemoteExecutionSecretBroker,
  isRemoteExecutionSecretResolutionLeaseEligible,
} from './secretBrokerClient';

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
const secretBrokerUrl =
  process.env.REMOTE_CONTROL_PLANE_SECRET_BROKER_URL?.trim();
const secretBrokerToken =
  process.env.REMOTE_CONTROL_PLANE_SECRET_BROKER_TOKEN?.trim();
if (Boolean(secretBrokerUrl) !== Boolean(secretBrokerToken))
  throw new TypeError(
    'REMOTE_CONTROL_PLANE_SECRET_BROKER_URL and REMOTE_CONTROL_PLANE_SECRET_BROKER_TOKEN must be configured together.'
  );
const secretBroker =
  secretBrokerUrl && secretBrokerToken
    ? createRemoteExecutionSecretBroker({
        baseUrl: secretBrokerUrl,
        token: secretBrokerToken,
        timeoutMs: integer(
          'REMOTE_CONTROL_PLANE_SECRET_BROKER_TIMEOUT_MS',
          5_000
        ),
      })
    : undefined;
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
    remoteServerFunctionExecutionProviderDescriptor,
  ]),
  createExecutionId: () => `execution-${randomUUID()}`,
  createLeaseToken: () => `lease-${randomUUID()}`,
  outputGuard: createExecutionSecretLeakGuard({
    secretValues: [
      clientToken,
      databaseUrl,
      ...Object.values(workerTokenById),
      ...(secretBrokerToken ? [secretBrokerToken] : []),
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
    ...(secretBrokerToken ? [secretBrokerToken] : []),
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
  ...(secretBroker
    ? {
        async resolveClaimedServerFunctionSecrets(input: {
          executionId: string;
          workerId: string;
          leaseToken: string;
          recipientPublicKey: string;
        }) {
          const execution = await repository.get(input.executionId);
          if (
            !execution?.lease ||
            !isRemoteExecutionSecretResolutionLeaseEligible(
              execution,
              input,
              Date.now()
            )
          )
            return undefined;
          const stored = await snapshots.get(
            execution.ownerId,
            execution.snapshotId,
            execution.record.snapshotDigest
          );
          const invocation = stored
            ? readIsolatedServerFunctionExecutionRequest(
                execution.request,
                stored.snapshot.serverFunctionPlan
              )
            : undefined;
          const plan = stored
            ? readIsolatedServerFunctionPlan(stored.snapshot.serverFunctionPlan)
            : undefined;
          if (
            !stored ||
            !invocation ||
            !plan?.definition.environment ||
            !execution.request.requiredCapabilities.includes(
              'environment-binding'
            )
          )
            return undefined;
          const identity = Object.freeze({
            executionId: input.executionId,
            workerId: input.workerId,
            workerAttempt: execution.lease.attempt,
            workspaceId: stored.snapshot.workspace.workspaceId,
            snapshotId: stored.snapshot.workspace.snapshotId,
            functionRef: invocation.functionRef,
            invocationId: invocation.invocationId,
            recipientPublicKey: input.recipientPublicKey,
          });
          const envelope = await secretBroker.resolve(identity);
          return envelope &&
            envelope.executionId === identity.executionId &&
            envelope.workerId === identity.workerId &&
            envelope.workerAttempt === identity.workerAttempt &&
            envelope.workspaceId === identity.workspaceId &&
            envelope.snapshotId === identity.snapshotId &&
            envelope.functionRef.artifactId ===
              identity.functionRef.artifactId &&
            envelope.functionRef.exportName ===
              identity.functionRef.exportName &&
            envelope.invocationId === identity.invocationId &&
            envelope.recipientPublicKey === identity.recipientPublicKey
            ? envelope
            : undefined;
        },
      }
    : {}),
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
