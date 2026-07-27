import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Pool } from 'pg';
import {
  decodeRemoteExecutableProjectSnapshot,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
  REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
  type RemoteExecutionRegionalRecoveryCheckpoint,
  type RemoteExecutionRegionalRecoveryProbe,
} from '@prodivix/runtime-remote';
import type { ExecutionJobStatus } from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { withPostgresTransaction } from './postgresTransaction';

type ExecutionRow = Readonly<{
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
}>;

const statuses = new Set<ExecutionJobStatus>([
  'queued',
  'starting',
  'running',
  'cancelling',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]);

const integer = (
  value: string | number,
  label: string,
  minimum = 0
): number => {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < minimum)
    throw new TypeError(`${label} is corrupt.`);
  return result;
};

const optionalInteger = (
  value: string | number | null,
  label: string
): number | null => (value === null ? null : integer(value, label));

const digestBytes = (value: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(value))}`;
const digestText = (value: string): string => digestBytes(utf8ToBytes(value));

const exactObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export type CreatePostgresRemoteExecutionRegionalRecoveryProbeOptions =
  Readonly<{
    regionId: string;
    maximumEvents?: number;
    maximumArtifacts?: number;
    maximumArtifactBytes?: number;
  }>;

/**
 * Captures one repeatable-read recovery checkpoint. Raw credentials never
 * leave the adapter: the lease token contributes only through stateDigest.
 */
export const createPostgresRemoteExecutionRegionalRecoveryProbe = (
  pool: Pool,
  options: CreatePostgresRemoteExecutionRegionalRecoveryProbeOptions
): RemoteExecutionRegionalRecoveryProbe => {
  const maximumEvents = options.maximumEvents ?? 20_000;
  const maximumArtifacts = options.maximumArtifacts ?? 256;
  const maximumArtifactBytes =
    options.maximumArtifactBytes ?? 128 * 1024 * 1024;
  if (
    !options.regionId.trim() ||
    options.regionId.length > 128 ||
    !Number.isSafeInteger(maximumEvents) ||
    maximumEvents < 1 ||
    !Number.isSafeInteger(maximumArtifacts) ||
    maximumArtifacts < 1 ||
    !Number.isSafeInteger(maximumArtifactBytes) ||
    maximumArtifactBytes < 1
  )
    throw new TypeError('Remote regional recovery probe options are invalid.');

  return Object.freeze({
    async capture(executionId, capturedAt) {
      if (
        !executionId.trim() ||
        executionId.length > 4_096 ||
        !Number.isSafeInteger(capturedAt) ||
        capturedAt < 0
      )
        throw new TypeError('Remote regional recovery capture is invalid.');
      return withPostgresTransaction(pool, async (client) => {
        await client.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
        );
        const executionResult = await client.query<ExecutionRow>(
          `SELECT execution_id, owner_id, request_id, identity_key,
                  snapshot_id, snapshot_digest, request_json, provider_json,
                  status, latest_cursor, created_at, started_at, completed_at,
                  cancellation_ids, artifacts_json, lease_worker_id,
                  lease_token, lease_attempt, lease_acquired_at, lease_expires_at
             FROM remote_executions
            WHERE execution_id=$1`,
          [executionId]
        );
        if (executionResult.rowCount !== 1) return undefined;
        const row = executionResult.rows[0]!;
        const provider = exactObject(row.provider_json);
        if (
          !provider ||
          typeof provider.id !== 'string' ||
          !statuses.has(row.status)
        )
          return undefined;
        const latestCursor = integer(
          row.latest_cursor,
          'Recovery latest cursor',
          1
        );
        const snapshotResult = await client.query<{
          snapshot_json: unknown;
          stored_at: string | number;
          granted_at: string | number;
        }>(
          `SELECT b.snapshot_json, b.stored_at, g.granted_at
             FROM remote_execution_snapshot_blobs b
             JOIN remote_execution_snapshot_grants g
               USING (snapshot_id, content_digest)
            WHERE g.owner_id=$1 AND b.snapshot_id=$2 AND b.content_digest=$3`,
          [row.owner_id, row.snapshot_id, row.snapshot_digest]
        );
        if (snapshotResult.rowCount !== 1) return undefined;
        const snapshotRow = snapshotResult.rows[0]!;
        let snapshot;
        try {
          snapshot = decodeRemoteExecutableProjectSnapshot(
            snapshotRow.snapshot_json
          );
        } catch {
          return undefined;
        }
        if (
          snapshot.workspace.snapshotId !== row.snapshot_id ||
          snapshot.contentDigest !== row.snapshot_digest
        )
          return undefined;

        const events = await client.query<{
          cursor: string | number;
          event_json: unknown;
          worker_event_id: string | null;
          worker_event_identity: string | null;
          emitted_at: string | number;
        }>(
          `SELECT cursor, event_json, worker_event_id, worker_event_identity, emitted_at
             FROM remote_execution_events
            WHERE execution_id=$1
            ORDER BY cursor ASC
            LIMIT $2`,
          [executionId, maximumEvents + 1]
        );
        if (
          events.rows.length > maximumEvents ||
          events.rows.length !== latestCursor ||
          events.rows.some(
            (event, index) =>
              integer(event.cursor, 'Recovery event cursor', 1) !== index + 1
          )
        )
          return undefined;

        const artifactRows = await client.query<{
          artifact_id: string;
          digest: string;
          descriptor_json: unknown;
          expires_at: string | number;
          size: string | number;
          contents: Buffer;
        }>(
          `SELECT g.artifact_id, g.digest, g.descriptor_json, g.expires_at,
                  b.size, b.contents
             FROM remote_execution_artifact_grants g
             JOIN remote_execution_artifact_blobs b USING (digest)
            WHERE g.execution_id=$1
            ORDER BY g.artifact_id ASC
            LIMIT $2`,
          [executionId, maximumArtifacts + 1]
        );
        if (artifactRows.rows.length > maximumArtifacts) return undefined;
        let artifactBytes = 0;
        const artifacts: unknown[] = [];
        for (const artifact of artifactRows.rows) {
          const size = integer(artifact.size, 'Recovery artifact size');
          artifactBytes += size;
          if (
            artifactBytes > maximumArtifactBytes ||
            artifact.contents.byteLength !== size ||
            digestBytes(artifact.contents) !== artifact.digest
          )
            return undefined;
          artifacts.push({
            artifactId: artifact.artifact_id,
            digest: artifact.digest,
            descriptor: artifact.descriptor_json,
            expiresAt: integer(artifact.expires_at, 'Recovery artifact expiry'),
            size,
          });
        }

        const authorityResult = await client.query<{
          authority_json: unknown;
          expires_at: string | number;
        }>(
          `SELECT authority_json, expires_at
             FROM remote_execution_server_authorities
            WHERE execution_id=$1`,
          [executionId]
        );
        if ((authorityResult.rowCount ?? 0) > 1) return undefined;
        const terminalResult = await client.query<{
          terminal_session_id: string;
          state_revision: string | number;
          expires_at: string | number;
          sealed_state: Buffer;
        }>(
          `SELECT terminal_session_id, state_revision, expires_at, sealed_state
             FROM remote_execution_terminal_sessions
            WHERE execution_id=$1`,
          [executionId]
        );
        if ((terminalResult.rowCount ?? 0) > 1) return undefined;
        const terminalRow = terminalResult.rows[0];
        const terminal = terminalRow
          ? Object.freeze({
              terminalSessionId: terminalRow.terminal_session_id,
              revision: integer(
                terminalRow.state_revision,
                'Recovery Terminal revision',
                1
              ),
              expiresAt: integer(
                terminalRow.expires_at,
                'Recovery Terminal expiry'
              ),
              sealedStateDigest: digestBytes(terminalRow.sealed_state),
            })
          : undefined;

        const hasLease = row.lease_worker_id !== null;
        if (
          hasLease !== (row.lease_token !== null) ||
          hasLease !== (row.lease_acquired_at !== null) ||
          hasLease !== (row.lease_expires_at !== null)
        )
          return undefined;
        const lease = hasLease
          ? Object.freeze({
              workerId: row.lease_worker_id!,
              attempt: integer(row.lease_attempt, 'Recovery lease attempt', 1),
              acquiredAt: integer(
                row.lease_acquired_at!,
                'Recovery lease acquired time'
              ),
              expiresAt: integer(
                row.lease_expires_at!,
                'Recovery lease expiry'
              ),
            })
          : undefined;
        const executionState = {
          execution: {
            executionId: row.execution_id,
            ownerId: row.owner_id,
            requestId: row.request_id,
            identityKey: row.identity_key,
            snapshotId: row.snapshot_id,
            snapshotDigest: row.snapshot_digest,
            request: row.request_json,
            provider: row.provider_json,
            status: row.status,
            latestCursor,
            createdAt: integer(row.created_at, 'Recovery created time'),
            startedAt: optionalInteger(row.started_at, 'Recovery started time'),
            completedAt: optionalInteger(
              row.completed_at,
              'Recovery completed time'
            ),
            cancellationIds: row.cancellation_ids,
            artifacts: row.artifacts_json,
            lease: lease
              ? {
                  ...lease,
                  tokenDigest: digestText(row.lease_token!),
                }
              : null,
          },
          snapshot: {
            json: snapshotRow.snapshot_json,
            storedAt: integer(
              snapshotRow.stored_at,
              'Recovery snapshot stored time'
            ),
            grantedAt: integer(
              snapshotRow.granted_at,
              'Recovery snapshot grant time'
            ),
          },
          events: events.rows.map((event) => ({
            cursor: integer(event.cursor, 'Recovery event cursor', 1),
            event: event.event_json,
            workerEventId: event.worker_event_id,
            workerEventIdentity: event.worker_event_identity,
            emittedAt: integer(event.emitted_at, 'Recovery event time'),
          })),
          artifacts,
          authority: authorityResult.rows[0]
            ? {
                value: authorityResult.rows[0].authority_json,
                expiresAt: integer(
                  authorityResult.rows[0].expires_at,
                  'Recovery authority expiry'
                ),
              }
            : null,
        };
        const executionStateDigest = digestText(
          canonicalJsonText(executionState)
        );
        const stateDigest = digestText(
          canonicalJsonText({
            executionStateDigest,
            terminal: terminal ?? null,
          })
        );
        return Object.freeze({
          format: REMOTE_EXECUTION_REGIONAL_RECOVERY_FORMAT,
          version: REMOTE_EXECUTION_REGIONAL_RECOVERY_VERSION,
          regionId: options.regionId,
          executionId: row.execution_id,
          ownerId: row.owner_id,
          requestId: row.request_id,
          providerId: provider.id,
          snapshotId: row.snapshot_id,
          snapshotDigest: row.snapshot_digest,
          status: row.status,
          latestCursor,
          executionStateDigest,
          stateDigest,
          capturedAt,
          ...(lease ? { lease } : {}),
          ...(terminal ? { terminal } : {}),
        } satisfies RemoteExecutionRegionalRecoveryCheckpoint);
      });
    },
  });
};
