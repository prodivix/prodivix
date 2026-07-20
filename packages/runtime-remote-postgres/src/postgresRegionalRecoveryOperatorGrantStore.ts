import type { Pool } from 'pg';
import type { RemoteExecutionRegionalRecoveryGrantReplayStore } from '@prodivix/runtime-remote';

const digestPattern = /^sha256-[0-9a-f]{64}$/u;

const timestamp = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

/**
 * Persists only a proof digest and bounded timestamps. Raw signed grants and
 * operator identity material never enter PostgreSQL.
 */
export const createPostgresRemoteExecutionRegionalRecoveryGrantReplayStore = (
  pool: Pick<Pool, 'query'>
): RemoteExecutionRegionalRecoveryGrantReplayStore =>
  Object.freeze({
    async consume(input) {
      if (!digestPattern.test(input.grantDigest))
        throw new TypeError(
          'Remote regional recovery grant digest is invalid.'
        );
      const expiresAt = timestamp(
        input.expiresAt,
        'Remote regional recovery grant expiry'
      );
      const consumedAt = timestamp(
        input.consumedAt,
        'Remote regional recovery grant consumption time'
      );
      if (expiresAt <= consumedAt)
        throw new TypeError('Remote regional recovery grant is expired.');
      const result = await pool.query<{ inserted: boolean }>(
        `WITH expired AS (
           DELETE FROM remote_execution_regional_operator_grants
            WHERE ctid IN (
              SELECT ctid
                FROM remote_execution_regional_operator_grants
               WHERE expires_at <= $3
               ORDER BY expires_at
               LIMIT 128
            )
         ), inserted AS (
           INSERT INTO remote_execution_regional_operator_grants
             (grant_digest, expires_at, consumed_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (grant_digest) DO NOTHING
           RETURNING TRUE AS inserted
         )
         SELECT COALESCE((SELECT inserted FROM inserted), FALSE) AS inserted`,
        [input.grantDigest, expiresAt, consumedAt]
      );
      return result.rowCount === 1 && result.rows[0]?.inserted === true;
    },
  });
