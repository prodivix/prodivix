import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  canTransitionExecutionJob,
  createExecutionProviderDescriptor,
  createExecutionRequest,
  type ExecutionJobEvent,
  type ExecutionJobStatus,
} from '@prodivix/runtime-core';
import type {
  RemoteExecutionCancelMutationResult,
  RemoteExecutionClaimResult,
  RemoteExecutionCreateMutationResult,
  RemoteExecutionLease,
  RemoteExecutionRepository,
  RemoteExecutionStoredRecord,
} from '@prodivix/runtime-remote';
import {
  createRemoteExecutionServerAuthorityLease,
  projectRemoteExecutionArtifact,
  readRemoteExecutionServerAuthority,
  type RemoteExecutionServerAuthority,
} from '@prodivix/runtime-remote';
import { withPostgresTransaction } from './postgresTransaction';

type ExecutionRow = {
  execution_id: string;
  owner_id: string;
  request_id: string;
  identity_key: string;
  snapshot_id: string;
  snapshot_digest: string;
  request_json: unknown;
  provider_json: unknown;
  status: ExecutionJobStatus;
  latest_cursor: string | number;
  created_at: string | number;
  started_at: string | number | null;
  completed_at: string | number | null;
  cancellation_ids: unknown;
  artifacts_json: unknown;
  lease_worker_id: string | null;
  lease_token: string | null;
  lease_attempt: number;
  lease_acquired_at: string | number | null;
  lease_expires_at: string | number | null;
};

type EventRow = {
  cursor: string | number;
  event_json: ExecutionJobEvent;
  worker_event_id: string | null;
  worker_event_identity: string | null;
};
type ServerAuthorityRow = {
  authority_json: unknown;
  expires_at: string | number;
};
type Queryable = Pick<Pool | PoolClient, 'query'>;
const terminal = new Set<ExecutionJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);

const integer = (value: string | number, label: string): number => {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new TypeError(`${label} is corrupt.`);
  return result;
};
const optionalInteger = (value: string | number | null, label: string) =>
  value === null ? undefined : integer(value, label);
const strings = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
    throw new TypeError('Stored remote cancellation identities are corrupt.');
  return Object.freeze([...value]);
};

const selectExecution = `SELECT * FROM remote_executions`;

const load = async (
  queryable: Queryable,
  row: ExecutionRow
): Promise<RemoteExecutionStoredRecord> => {
  const request = createExecutionRequest(
    row.request_json as Parameters<typeof createExecutionRequest>[0]
  );
  const provider = createExecutionProviderDescriptor(
    row.provider_json as Parameters<typeof createExecutionProviderDescriptor>[0]
  );
  const eventResult = await queryable.query<EventRow>(
    `SELECT cursor, event_json, worker_event_id, worker_event_identity
       FROM remote_execution_events
      WHERE execution_id = $1 ORDER BY cursor ASC`,
    [row.execution_id]
  );
  const events = Object.freeze(
    eventResult.rows.map((eventRow, index) => {
      const cursor = integer(eventRow.cursor, 'Stored remote event cursor');
      if (cursor !== index + 1 || eventRow.event_json.sequence !== cursor)
        throw new TypeError('Stored remote event sequence is corrupt.');
      return Object.freeze({
        cursor,
        event: Object.freeze(eventRow.event_json),
        ...(eventRow.worker_event_id === null
          ? {}
          : { workerEventId: eventRow.worker_event_id }),
        ...(eventRow.worker_event_identity === null
          ? {}
          : { workerEventIdentity: eventRow.worker_event_identity }),
      });
    })
  );
  const latestCursor = integer(
    row.latest_cursor,
    'Stored remote latest cursor'
  );
  if (events.length !== latestCursor)
    throw new TypeError('Stored remote event cursor drifted.');
  const createdAt = integer(row.created_at, 'Stored remote createdAt');
  const startedAt = optionalInteger(row.started_at, 'Stored remote startedAt');
  const completedAt = optionalInteger(
    row.completed_at,
    'Stored remote completedAt'
  );
  const lease =
    row.lease_worker_id &&
    row.lease_token &&
    row.lease_acquired_at !== null &&
    row.lease_expires_at !== null
      ? Object.freeze({
          workerId: row.lease_worker_id,
          token: row.lease_token,
          attempt: row.lease_attempt,
          acquiredAt: integer(row.lease_acquired_at, 'Stored lease acquiredAt'),
          expiresAt: integer(row.lease_expires_at, 'Stored lease expiresAt'),
        })
      : undefined;
  const artifacts = Array.isArray(row.artifacts_json) ? row.artifacts_json : [];
  return Object.freeze({
    ownerId: row.owner_id,
    identityKey: row.identity_key,
    request,
    snapshotId: row.snapshot_id,
    record: Object.freeze({
      executionId: row.execution_id,
      requestId: row.request_id,
      snapshotDigest: row.snapshot_digest,
      provider,
      status: row.status,
      latestCursor,
      createdAt,
      ...(startedAt === undefined ? {} : { startedAt }),
      ...(completedAt === undefined ? {} : { completedAt }),
    }),
    events,
    artifacts: Object.freeze(
      artifacts as RemoteExecutionStoredRecord['artifacts']
    ),
    cancellationIds: strings(row.cancellation_ids),
    ...(lease ? { lease } : {}),
  });
};

const one = <Row extends QueryResultRow>(
  result: QueryResult<Row>
): Row | undefined => (result.rowCount === 1 ? result.rows[0] : undefined);

const loadServerAuthority = async (
  queryable: Queryable,
  executionId: string,
  now: number
): Promise<RemoteExecutionServerAuthority | undefined> => {
  const row = one(
    await queryable.query<ServerAuthorityRow>(
      `SELECT authority_json, expires_at
         FROM remote_execution_server_authorities
        WHERE execution_id=$1 AND expires_at>$2`,
      [executionId, now]
    )
  );
  if (!row) return undefined;
  const authority = readRemoteExecutionServerAuthority(row.authority_json);
  if (
    !authority ||
    authority.expiresAt !== integer(row.expires_at, 'authority expiresAt')
  )
    throw new TypeError('Stored remote execution authority is corrupt.');
  return authority;
};

const stateEvent = (
  row: ExecutionRow,
  status: ExecutionJobStatus,
  cursor: number,
  now: number,
  reason?: string
): ExecutionJobEvent =>
  Object.freeze({
    kind: 'state',
    jobId: row.execution_id,
    sequence: cursor,
    emittedAt: now,
    previousStatus: row.status,
    snapshot: Object.freeze({
      jobId: row.execution_id,
      requestId: row.request_id,
      providerId: (row.provider_json as { id: string }).id,
      status,
      latestEventSequence: cursor,
      createdAt: integer(row.created_at, 'createdAt'),
      ...(row.started_at === null
        ? {}
        : { startedAt: integer(row.started_at, 'startedAt') }),
      ...(terminal.has(status) ? { completedAt: now } : {}),
    }),
    ...(reason === undefined ? {} : { reason }),
  });

const transitionLocked = async (
  client: PoolClient,
  row: ExecutionRow,
  status: ExecutionJobStatus,
  now: number,
  reason?: string
): Promise<ExecutionRow> => {
  if (!canTransitionExecutionJob(row.status, status))
    throw new TypeError(
      `Remote execution cannot transition from ${row.status} to ${status}.`
    );
  const cursor = integer(row.latest_cursor, 'latestCursor') + 1;
  const event = stateEvent(row, status, cursor, now, reason);
  await client.query(
    `INSERT INTO remote_execution_events(execution_id, cursor, event_json, emitted_at)
     VALUES ($1, $2, $3::jsonb, $4)`,
    [row.execution_id, cursor, JSON.stringify(event), now]
  );
  const updated = await client.query<ExecutionRow>(
    `UPDATE remote_executions SET status=$2, latest_cursor=$3,
       started_at=CASE WHEN $2='starting' AND started_at IS NULL THEN $4 ELSE started_at END,
       completed_at=CASE WHEN $2 = ANY($5::text[]) THEN $4 ELSE completed_at END,
       lease_worker_id=CASE WHEN $2 = ANY($5::text[]) THEN NULL ELSE lease_worker_id END,
       lease_token=CASE WHEN $2 = ANY($5::text[]) THEN NULL ELSE lease_token END,
       lease_acquired_at=CASE WHEN $2 = ANY($5::text[]) THEN NULL ELSE lease_acquired_at END,
       lease_expires_at=CASE WHEN $2 = ANY($5::text[]) THEN NULL ELSE lease_expires_at END
     WHERE execution_id=$1 RETURNING *`,
    [row.execution_id, status, cursor, now, [...terminal]]
  );
  if (terminal.has(status))
    await client.query(
      `DELETE FROM remote_execution_server_authorities WHERE execution_id=$1`,
      [row.execution_id]
    );
  return one(updated)!;
};

/** PostgreSQL implementation whose mutation boundaries provide quota, claim, and lease fencing atomicity. */
export const createPostgresRemoteExecutionRepository = (
  pool: Pool
): RemoteExecutionRepository => ({
  async createOrGet(input): Promise<RemoteExecutionCreateMutationResult> {
    return withPostgresTransaction(pool, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [input.ownerId]
      );
      const existing = one(
        await client.query<ExecutionRow>(
          `${selectExecution} WHERE owner_id=$1 AND request_id=$2 FOR UPDATE`,
          [input.ownerId, input.request.requestId]
        )
      );
      if (existing)
        return existing.identity_key === input.identityKey
          ? { kind: 'existing', execution: await load(client, existing) }
          : { kind: 'identity-conflict' };
      const active = one(
        await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM remote_executions
          WHERE owner_id=$1 AND status <> ALL($2::text[])`,
          [input.ownerId, [...terminal]]
        )
      );
      if (Number(active?.count ?? 0) >= input.maximumActiveExecutions)
        return { kind: 'quota-exceeded' };
      const event: ExecutionJobEvent = Object.freeze({
        kind: 'state',
        jobId: input.executionId,
        sequence: 1,
        emittedAt: input.createdAt,
        snapshot: Object.freeze({
          jobId: input.executionId,
          requestId: input.request.requestId,
          providerId: input.provider.id,
          status: 'queued',
          latestEventSequence: 1,
          createdAt: input.createdAt,
        }),
      });
      const inserted = one(
        await client.query<ExecutionRow>(
          `INSERT INTO remote_executions(execution_id,owner_id,request_id,identity_key,snapshot_id,
          snapshot_digest,request_json,provider_json,status,latest_cursor,created_at)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'queued',1,$9) RETURNING *`,
          [
            input.executionId,
            input.ownerId,
            input.request.requestId,
            input.identityKey,
            input.snapshotId,
            input.snapshotDigest,
            JSON.stringify(input.request),
            JSON.stringify(input.provider),
            input.createdAt,
          ]
        )
      )!;
      if (input.serverAuthority)
        await client.query(
          `INSERT INTO remote_execution_server_authorities(execution_id,authority_json,expires_at)
           VALUES($1,$2::jsonb,$3)`,
          [
            input.executionId,
            JSON.stringify(input.serverAuthority),
            input.serverAuthority.expiresAt,
          ]
        );
      await client.query(
        `INSERT INTO remote_execution_events(execution_id,cursor,event_json,emitted_at)
        VALUES($1,1,$2::jsonb,$3)`,
        [input.executionId, JSON.stringify(event), input.createdAt]
      );
      return { kind: 'created', execution: await load(client, inserted) };
    });
  },
  async get(executionId) {
    const row = one(
      await pool.query<ExecutionRow>(
        `${selectExecution} WHERE execution_id=$1`,
        [executionId]
      )
    );
    return row ? load(pool, row) : undefined;
  },
  async getByOwnerRequest(ownerId, requestId) {
    const row = one(
      await pool.query<ExecutionRow>(
        `${selectExecution} WHERE owner_id=$1 AND request_id=$2`,
        [ownerId, requestId]
      )
    );
    return row ? load(pool, row) : undefined;
  },
  async countActive(ownerId) {
    const row = one(
      await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM remote_executions
      WHERE owner_id=$1 AND status <> ALL($2::text[])`,
        [ownerId, [...terminal]]
      )
    );
    return Number(row?.count ?? 0);
  },
  async cancel(input): Promise<RemoteExecutionCancelMutationResult> {
    return withPostgresTransaction(pool, async (client) => {
      const row = one(
        await client.query<ExecutionRow>(
          `${selectExecution} WHERE execution_id=$1 FOR UPDATE`,
          [input.executionId]
        )
      );
      if (!row) return { kind: 'not-found' };
      if (row.owner_id !== input.ownerId) return { kind: 'forbidden' };
      const ids = strings(row.cancellation_ids);
      if (ids.includes(input.cancellationId))
        return {
          kind: 'cancelled',
          result: 'already-requested',
          execution: await load(client, row),
        };
      row.cancellation_ids = [...ids, input.cancellationId];
      await client.query(
        `UPDATE remote_executions SET cancellation_ids=$2::jsonb WHERE execution_id=$1`,
        [row.execution_id, JSON.stringify(row.cancellation_ids)]
      );
      if (terminal.has(row.status))
        return {
          kind: 'cancelled',
          result: 'already-terminal',
          execution: await load(client, row),
        };
      const updated = await transitionLocked(
        client,
        row,
        row.status === 'queued' ? 'cancelled' : 'cancelling',
        input.cancelledAt,
        input.reason
      );
      return {
        kind: 'cancelled',
        result: 'accepted',
        execution: await load(client, updated),
      };
    });
  },
  async claimNext(input): Promise<RemoteExecutionClaimResult | undefined> {
    return withPostgresTransaction(pool, async (client) => {
      let row = one(
        await client.query<ExecutionRow>(
          `${selectExecution}
        WHERE provider_json->>'id'=$1 AND (status='queued' OR
          (status=ANY($2::text[]) AND lease_expires_at <= $3))
        ORDER BY created_at, execution_id FOR UPDATE SKIP LOCKED LIMIT 1`,
          [input.providerId, ['starting', 'running', 'cancelling'], input.now]
        )
      );
      if (!row) return undefined;
      if (row.status === 'queued')
        row = await transitionLocked(client, row, 'starting', input.now);
      const result = one(
        await client.query<ExecutionRow>(
          `UPDATE remote_executions SET
        lease_worker_id=$2,lease_token=$3,lease_attempt=lease_attempt+1,
        lease_acquired_at=$4,lease_expires_at=$5 WHERE execution_id=$1 RETURNING *`,
          [
            row.execution_id,
            input.workerId,
            input.leaseToken,
            input.now,
            input.now + input.leaseDurationMs,
          ]
        )
      )!;
      const execution = await load(client, result);
      const lease = execution.lease!;
      const serverAuthority = await loadServerAuthority(
        client,
        execution.record.executionId,
        input.now
      );
      return {
        execution,
        lease,
        ...(serverAuthority
          ? {
              authority: createRemoteExecutionServerAuthorityLease({
                authority: serverAuthority,
                executionId: execution.record.executionId,
                workerId: input.workerId,
                workerAttempt: lease.attempt,
              }),
            }
          : {}),
      };
    });
  },
  async renewLease(input): Promise<RemoteExecutionLease | undefined> {
    const row = one(
      await pool.query<ExecutionRow>(
        `UPDATE remote_executions SET lease_expires_at=$5
      WHERE execution_id=$1 AND lease_worker_id=$2 AND lease_token=$3 AND lease_expires_at>$4
        AND status <> ALL($6::text[]) RETURNING *`,
        [
          input.executionId,
          input.workerId,
          input.leaseToken,
          input.now,
          input.now + input.leaseDurationMs,
          [...terminal],
        ]
      )
    );
    return row
      ? {
          workerId: row.lease_worker_id!,
          token: row.lease_token!,
          attempt: row.lease_attempt,
          acquiredAt: integer(row.lease_acquired_at!, 'lease acquiredAt'),
          expiresAt: integer(row.lease_expires_at!, 'lease expiresAt'),
        }
      : undefined;
  },
  async transition(input) {
    return withPostgresTransaction(pool, async (client) => {
      const row = one(
        await client.query<ExecutionRow>(
          `${selectExecution} WHERE execution_id=$1
        AND lease_worker_id=$2 AND lease_token=$3 AND lease_expires_at>$4 FOR UPDATE`,
          [input.executionId, input.workerId, input.leaseToken, input.now]
        )
      );
      if (!row) return undefined;
      return load(
        client,
        await transitionLocked(
          client,
          row,
          input.status,
          input.now,
          input.reason
        )
      );
    });
  },
  async appendWorkerEvent(input) {
    return withPostgresTransaction(pool, async (client) => {
      const row = one(
        await client.query<ExecutionRow>(
          `${selectExecution} WHERE execution_id=$1
        AND lease_worker_id=$2 AND lease_token=$3 AND lease_expires_at>$4
        AND status <> ALL($5::text[]) FOR UPDATE`,
          [
            input.executionId,
            input.workerId,
            input.leaseToken,
            input.emittedAt,
            [...terminal],
          ]
        )
      );
      if (!row) return { kind: 'lease-rejected' } as const;
      const identity = JSON.stringify(input.event);
      const existing = one(
        await client.query<EventRow>(
          `SELECT cursor,event_json,worker_event_id,worker_event_identity
             FROM remote_execution_events
            WHERE execution_id=$1 AND worker_event_id=$2`,
          [row.execution_id, input.workerEventId]
        )
      );
      if (existing)
        return existing.worker_event_identity === identity
          ? ({ kind: 'existing', execution: await load(client, row) } as const)
          : ({ kind: 'identity-conflict' } as const);
      const cursor = integer(row.latest_cursor, 'latestCursor') + 1;
      const event: ExecutionJobEvent = Object.freeze({
        jobId: row.execution_id,
        sequence: cursor,
        emittedAt: input.emittedAt,
        ...input.event,
      });
      const usage = one(
        await client.query<{
          event_count: string;
          event_bytes: string;
          log_bytes: string;
        }>(
          `SELECT COUNT(*)::text AS event_count,
             COALESCE(SUM(octet_length(event_json::text)),0)::text AS event_bytes,
             COALESCE(SUM(CASE WHEN event_json->>'kind'='log'
               THEN octet_length(COALESCE(event_json#>>'{log,message}','')) ELSE 0 END),0)::text AS log_bytes
           FROM remote_execution_events WHERE execution_id=$1`,
          [row.execution_id]
        )
      )!;
      const eventBytes = Buffer.byteLength(JSON.stringify(event));
      const incomingLogBytes =
        input.event.kind === 'log'
          ? Buffer.byteLength(input.event.log.message)
          : 0;
      if (
        Number(usage.event_count) >= input.limits.maximumEvents ||
        Number(usage.event_bytes) + eventBytes >
          input.limits.maximumEventBytes ||
        Number(usage.log_bytes) + incomingLogBytes >
          input.limits.maximumLogBytes
      )
        return { kind: 'budget-exceeded' } as const;
      await client.query(
        `INSERT INTO remote_execution_events(
           execution_id,cursor,event_json,emitted_at,worker_event_id,worker_event_identity
         ) VALUES($1,$2,$3::jsonb,$4,$5,$6)`,
        [
          row.execution_id,
          cursor,
          JSON.stringify(event),
          input.emittedAt,
          input.workerEventId,
          identity,
        ]
      );
      const updated = one(
        await client.query<ExecutionRow>(
          `UPDATE remote_executions SET latest_cursor=$2
           WHERE execution_id=$1 RETURNING *`,
          [row.execution_id, cursor]
        )
      )!;
      return {
        kind: 'stored',
        execution: await load(client, updated),
      } as const;
    });
  },
  async putArtifact(input) {
    if (
      input.descriptor.authorizationScope !==
        `execution:${input.executionId}` ||
      input.descriptor.expiresAt <= input.emittedAt ||
      input.descriptor.expiresAt - input.emittedAt >
        input.limits.maximumArtifactRetentionMs ||
      input.contents.byteLength !== input.descriptor.size
    )
      return { kind: 'identity-conflict' };
    const digest = `sha256-${Array.from(
      new Uint8Array(
        await globalThis.crypto.subtle.digest(
          'SHA-256',
          new Uint8Array(input.contents).buffer
        )
      )
    )
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')}`;
    if (digest !== input.descriptor.digest)
      return { kind: 'identity-conflict' };
    return withPostgresTransaction(pool, async (client) => {
      const row = one(
        await client.query<ExecutionRow>(
          `${selectExecution} WHERE execution_id=$1
           AND lease_worker_id=$2 AND lease_token=$3 AND lease_expires_at>$4
           AND status <> ALL($5::text[]) FOR UPDATE`,
          [
            input.executionId,
            input.workerId,
            input.leaseToken,
            input.emittedAt,
            [...terminal],
          ]
        )
      );
      if (!row) return { kind: 'lease-rejected' } as const;
      const identity = JSON.stringify(input.descriptor);
      const existingEvent = one(
        await client.query<EventRow>(
          `SELECT cursor,event_json,worker_event_id,worker_event_identity
           FROM remote_execution_events
           WHERE execution_id=$1 AND worker_event_id=$2`,
          [row.execution_id, input.workerEventId]
        )
      );
      if (existingEvent)
        return existingEvent.worker_event_identity === identity
          ? ({ kind: 'existing', execution: await load(client, row) } as const)
          : ({ kind: 'identity-conflict' } as const);
      const existingGrant = one(
        await client.query<{ descriptor_json: unknown }>(
          `SELECT descriptor_json FROM remote_execution_artifact_grants
           WHERE execution_id=$1 AND artifact_id=$2`,
          [row.execution_id, input.descriptor.artifactId]
        )
      );
      if (existingGrant)
        return JSON.stringify(existingGrant.descriptor_json) === identity
          ? ({ kind: 'existing', execution: await load(client, row) } as const)
          : ({ kind: 'identity-conflict' } as const);
      const usage = one(
        await client.query<{
          artifact_count: string;
          artifact_bytes: string;
          event_count: string;
          event_bytes: string;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM remote_execution_artifact_grants WHERE execution_id=$1)::text AS artifact_count,
             (SELECT COALESCE(SUM((descriptor_json->>'size')::bigint),0) FROM remote_execution_artifact_grants WHERE execution_id=$1)::text AS artifact_bytes,
             (SELECT COUNT(*) FROM remote_execution_events WHERE execution_id=$1)::text AS event_count,
             (SELECT COALESCE(SUM(octet_length(event_json::text)),0) FROM remote_execution_events WHERE execution_id=$1)::text AS event_bytes`,
          [row.execution_id]
        )
      )!;
      const cursor = integer(row.latest_cursor, 'latestCursor') + 1;
      const event: ExecutionJobEvent = Object.freeze({
        kind: 'artifact',
        jobId: row.execution_id,
        sequence: cursor,
        emittedAt: input.emittedAt,
        artifact: projectRemoteExecutionArtifact(input.descriptor),
      });
      if (
        input.contents.byteLength > input.limits.maximumSingleArtifactBytes ||
        Number(usage.artifact_count) >= input.limits.maximumArtifacts ||
        Number(usage.artifact_bytes) + input.contents.byteLength >
          input.limits.maximumArtifactBytes ||
        Number(usage.event_count) >= input.limits.maximumEvents ||
        Number(usage.event_bytes) + Buffer.byteLength(JSON.stringify(event)) >
          input.limits.maximumEventBytes
      )
        return { kind: 'budget-exceeded' } as const;
      await client.query(
        `INSERT INTO remote_execution_artifact_blobs(digest,size,contents,created_at)
         VALUES($1,$2,$3,$4) ON CONFLICT (digest) DO NOTHING`,
        [
          digest,
          input.contents.byteLength,
          Buffer.from(input.contents),
          input.emittedAt,
        ]
      );
      await client.query(
        `INSERT INTO remote_execution_artifact_grants(
          execution_id,artifact_id,digest,descriptor_json,expires_at
         ) VALUES($1,$2,$3,$4::jsonb,$5)`,
        [
          row.execution_id,
          input.descriptor.artifactId,
          digest,
          identity,
          input.descriptor.expiresAt,
        ]
      );
      await client.query(
        `INSERT INTO remote_execution_events(
          execution_id,cursor,event_json,emitted_at,worker_event_id,worker_event_identity
         ) VALUES($1,$2,$3::jsonb,$4,$5,$6)`,
        [
          row.execution_id,
          cursor,
          JSON.stringify(event),
          input.emittedAt,
          input.workerEventId,
          identity,
        ]
      );
      const artifacts = Array.isArray(row.artifacts_json)
        ? row.artifacts_json
        : [];
      const updated = one(
        await client.query<ExecutionRow>(
          `UPDATE remote_executions SET latest_cursor=$2,artifacts_json=$3::jsonb
           WHERE execution_id=$1 RETURNING *`,
          [
            row.execution_id,
            cursor,
            JSON.stringify([...artifacts, input.descriptor]),
          ]
        )
      )!;
      return {
        kind: 'stored',
        execution: await load(client, updated),
      } as const;
    });
  },
  async getArtifact(input) {
    const result = one(
      await pool.query<{
        descriptor_json: RemoteExecutionStoredRecord['artifacts'][number];
        contents: Buffer;
      }>(
        `SELECT g.descriptor_json,b.contents
         FROM remote_execution_artifact_grants g
         JOIN remote_execution_artifact_blobs b USING(digest)
         JOIN remote_executions e USING(execution_id)
         WHERE g.execution_id=$1 AND g.artifact_id=$2 AND e.owner_id=$3
           AND g.expires_at>$4`,
        [input.executionId, input.artifactId, input.ownerId, input.now]
      )
    );
    return result
      ? {
          descriptor: result.descriptor_json,
          contents: new Uint8Array(result.contents),
        }
      : undefined;
  },
  async sweepExpiredArtifacts(input) {
    return withPostgresTransaction(pool, async (client) => {
      const removed = await client.query<{ digest: string }>(
        `DELETE FROM remote_execution_artifact_grants
         WHERE (execution_id,artifact_id) IN (
           SELECT execution_id,artifact_id FROM remote_execution_artifact_grants
           WHERE expires_at <= $1 ORDER BY expires_at,execution_id,artifact_id LIMIT $2
           FOR UPDATE SKIP LOCKED
         ) RETURNING digest`,
        [input.now, input.limit]
      );
      if (removed.rows.length)
        await client.query(
          `DELETE FROM remote_execution_artifact_blobs b
           WHERE b.digest = ANY($1::text[])
             AND NOT EXISTS (
               SELECT 1 FROM remote_execution_artifact_grants g WHERE g.digest=b.digest
             )`,
          [removed.rows.map((row) => row.digest)]
        );
      return removed.rows.length;
    });
  },
});
