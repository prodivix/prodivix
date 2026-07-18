import { describe, expect, it } from 'vitest';
import { REMOTE_EXECUTION_POSTGRES_MIGRATION } from './schema';

describe('remote execution PostgreSQL contract', () => {
  it('declares tenant idempotency, content-addressed grants, and lease shape constraints', () => {
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'UNIQUE (owner_id, request_id)'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'PRIMARY KEY (owner_id, snapshot_id, content_digest)'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'remote_execution_lease_shape_check'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      "content_digest ~ '^sha256-[0-9a-f]{64}$'"
    );
  });

  it('indexes FIFO provider claims and expired lease recovery', () => {
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'idx_remote_executions_claim'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'idx_remote_executions_expired_lease'
    );
  });

  it('stores server authority outside request and snapshot JSON with bounded expiry', () => {
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'remote_execution_server_authorities'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'idx_remote_execution_server_authority_expiry'
    );
    expect(REMOTE_EXECUTION_POSTGRES_MIGRATION).toContain(
      'execution_id TEXT PRIMARY KEY REFERENCES remote_executions(execution_id) ON DELETE CASCADE'
    );
  });
});
