import type { Pool, PoolClient } from 'pg';

export const REMOTE_EXECUTION_POSTGRES_MIGRATION = `
CREATE TABLE IF NOT EXISTS remote_execution_snapshot_blobs (
  snapshot_id TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  stored_at BIGINT NOT NULL CHECK (stored_at >= 0),
  PRIMARY KEY (snapshot_id, content_digest),
  CONSTRAINT remote_snapshot_digest_check
    CHECK (content_digest ~ '^sha256-[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS remote_execution_snapshot_grants (
  owner_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  content_digest TEXT NOT NULL,
  granted_at BIGINT NOT NULL CHECK (granted_at >= 0),
  PRIMARY KEY (owner_id, snapshot_id, content_digest),
  FOREIGN KEY (snapshot_id, content_digest)
    REFERENCES remote_execution_snapshot_blobs(snapshot_id, content_digest)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS remote_executions (
  execution_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL,
  request_json JSONB NOT NULL,
  provider_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'starting', 'running', 'cancelling',
    'succeeded', 'failed', 'cancelled', 'timed-out'
  )),
  latest_cursor BIGINT NOT NULL CHECK (latest_cursor >= 1),
  created_at BIGINT NOT NULL CHECK (created_at >= 0),
  started_at BIGINT,
  completed_at BIGINT,
  cancellation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  artifacts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  lease_worker_id TEXT,
  lease_token TEXT,
  lease_attempt INTEGER NOT NULL DEFAULT 0 CHECK (lease_attempt >= 0),
  lease_acquired_at BIGINT,
  lease_expires_at BIGINT,
  UNIQUE (owner_id, request_id),
  FOREIGN KEY (snapshot_id, snapshot_digest)
    REFERENCES remote_execution_snapshot_blobs(snapshot_id, content_digest),
  CONSTRAINT remote_execution_lease_shape_check CHECK (
    (lease_worker_id IS NULL AND lease_token IS NULL AND lease_acquired_at IS NULL AND lease_expires_at IS NULL)
    OR
    (lease_worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_acquired_at IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_remote_executions_owner_status
  ON remote_executions(owner_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_remote_executions_claim
  ON remote_executions((provider_json->>'id'), status, created_at, execution_id);
CREATE INDEX IF NOT EXISTS idx_remote_executions_expired_lease
  ON remote_executions(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS remote_execution_server_authorities (
  execution_id TEXT PRIMARY KEY REFERENCES remote_executions(execution_id) ON DELETE CASCADE,
  authority_json JSONB NOT NULL,
  expires_at BIGINT NOT NULL CHECK (expires_at >= 0)
);
CREATE INDEX IF NOT EXISTS idx_remote_execution_server_authority_expiry
  ON remote_execution_server_authorities(expires_at, execution_id);

CREATE TABLE IF NOT EXISTS remote_execution_events (
  execution_id TEXT NOT NULL REFERENCES remote_executions(execution_id) ON DELETE CASCADE,
  cursor BIGINT NOT NULL CHECK (cursor >= 1),
  event_json JSONB NOT NULL,
  worker_event_id TEXT,
  worker_event_identity TEXT,
  emitted_at BIGINT NOT NULL CHECK (emitted_at >= 0),
  PRIMARY KEY (execution_id, cursor)
);
ALTER TABLE remote_execution_events
  ADD COLUMN IF NOT EXISTS worker_event_id TEXT,
  ADD COLUMN IF NOT EXISTS worker_event_identity TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_execution_worker_event
  ON remote_execution_events(execution_id, worker_event_id)
  WHERE worker_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS remote_execution_artifact_blobs (
  digest TEXT PRIMARY KEY,
  size BIGINT NOT NULL CHECK (size >= 0),
  contents BYTEA NOT NULL,
  created_at BIGINT NOT NULL CHECK (created_at >= 0),
  CONSTRAINT remote_artifact_blob_digest_check
    CHECK (digest ~ '^sha256-[0-9a-f]{64}$'),
  CONSTRAINT remote_artifact_blob_size_check
    CHECK (octet_length(contents) = size)
);

CREATE TABLE IF NOT EXISTS remote_execution_artifact_grants (
  execution_id TEXT NOT NULL REFERENCES remote_executions(execution_id) ON DELETE CASCADE,
  artifact_id TEXT NOT NULL,
  digest TEXT NOT NULL REFERENCES remote_execution_artifact_blobs(digest),
  descriptor_json JSONB NOT NULL,
  expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
  PRIMARY KEY (execution_id, artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_remote_artifact_grants_expiry
  ON remote_execution_artifact_grants(expires_at, execution_id, artifact_id);
`;

export const migrateRemoteExecutionPostgres = async (
  pool: Pick<Pool, 'connect'>
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(REMOTE_EXECUTION_POSTGRES_MIGRATION);
    await client.query('COMMIT');
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
};

const rollback = async (client: Pick<PoolClient, 'query'>): Promise<void> => {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the migration failure; a broken connection is discarded by pg.
  }
};
