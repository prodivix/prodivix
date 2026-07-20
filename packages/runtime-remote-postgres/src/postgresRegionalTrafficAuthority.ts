import type { Pool, PoolClient } from 'pg';
import type {
  RemoteExecutionRegionalTrafficAuthority,
  RemoteExecutionRegionalTrafficCutoverEvidence,
  RemoteExecutionRegionalTrafficPermit,
  RemoteExecutionRegionalTrafficState,
} from '@prodivix/runtime-remote';

export const REMOTE_EXECUTION_REGIONAL_TRAFFIC_POSTGRES_MIGRATION = `
CREATE TABLE IF NOT EXISTS remote_execution_regional_traffic_authorities (
  deployment_id TEXT PRIMARY KEY,
  active_region_id TEXT NOT NULL,
  epoch BIGINT NOT NULL CHECK (epoch >= 1),
  checkpoint_digest TEXT,
  updated_at BIGINT NOT NULL CHECK (updated_at >= 0),
  CONSTRAINT remote_execution_regional_deployment_id_check
    CHECK (length(deployment_id) BETWEEN 1 AND 256),
  CONSTRAINT remote_execution_regional_region_id_check
    CHECK (length(active_region_id) BETWEEN 1 AND 128),
  CONSTRAINT remote_execution_regional_checkpoint_digest_check
    CHECK (checkpoint_digest IS NULL OR checkpoint_digest ~ '^sha256-[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS remote_execution_regional_traffic_cutovers (
  deployment_id TEXT NOT NULL REFERENCES remote_execution_regional_traffic_authorities(deployment_id) ON DELETE CASCADE,
  epoch BIGINT NOT NULL CHECK (epoch >= 2),
  source_region_id TEXT NOT NULL,
  target_region_id TEXT NOT NULL,
  checkpoint_digest TEXT NOT NULL,
  cutover_at BIGINT NOT NULL CHECK (cutover_at >= 0),
  PRIMARY KEY (deployment_id, epoch),
  CONSTRAINT remote_execution_regional_cutover_regions_check
    CHECK (source_region_id <> target_region_id),
  CONSTRAINT remote_execution_regional_cutover_source_check
    CHECK (length(source_region_id) BETWEEN 1 AND 128),
  CONSTRAINT remote_execution_regional_cutover_target_check
    CHECK (length(target_region_id) BETWEEN 1 AND 128),
  CONSTRAINT remote_execution_regional_cutover_digest_check
    CHECK (checkpoint_digest ~ '^sha256-[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS remote_execution_regional_operator_grants (
  grant_digest TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL CHECK (expires_at >= 0),
  consumed_at BIGINT NOT NULL CHECK (consumed_at >= 0),
  CONSTRAINT remote_execution_regional_operator_grant_digest_check
    CHECK (grant_digest ~ '^sha256-[0-9a-f]{64}$'),
  CONSTRAINT remote_execution_regional_operator_grant_time_check
    CHECK (expires_at > consumed_at)
);

CREATE INDEX IF NOT EXISTS remote_execution_regional_operator_grants_expiry_idx
  ON remote_execution_regional_operator_grants (expires_at);
`;

type TrafficRow = Readonly<{
  deployment_id: string;
  active_region_id: string;
  epoch: string | number;
  checkpoint_digest: string | null;
  updated_at: string | number;
}>;

type CutoverRow = Readonly<{
  deployment_id: string;
  epoch: string | number;
  source_region_id: string;
  target_region_id: string;
  checkpoint_digest: string;
  cutover_at: string | number;
}>;

const identifier = (value: string, label: string, maximum: number): string => {
  if (!value.trim() || value !== value.trim() || value.length > maximum)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const timestamp = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${label} is invalid.`);
  return value;
};

const epoch = (value: string | number): number => {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 1)
    throw new TypeError('Stored regional traffic epoch is corrupt.');
  return result;
};

const hydrate = (row: TrafficRow): RemoteExecutionRegionalTrafficState =>
  Object.freeze({
    deploymentId: row.deployment_id,
    activeRegionId: row.active_region_id,
    epoch: epoch(row.epoch),
    ...(row.checkpoint_digest
      ? { checkpointDigest: row.checkpoint_digest }
      : {}),
    updatedAt: timestamp(
      Number(row.updated_at),
      'Stored regional traffic time'
    ),
  });

const hydrateCutover = (
  row: CutoverRow
): RemoteExecutionRegionalTrafficCutoverEvidence =>
  Object.freeze({
    deploymentId: row.deployment_id,
    epoch: epoch(row.epoch),
    sourceRegionId: row.source_region_id,
    targetRegionId: row.target_region_id,
    checkpointDigest: row.checkpoint_digest,
    cutoverAt: timestamp(
      Number(row.cutover_at),
      'Stored regional cutover time'
    ),
  });

const rollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query('ROLLBACK');
  } catch {
    // Preserve the authority error; pg discards an unusable connection.
  }
};

const lock = async (
  client: PoolClient,
  deploymentId: string,
  mode: 'shared' | 'exclusive'
): Promise<void> => {
  await client.query(
    mode === 'shared'
      ? `SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 71240721))`
      : `SELECT pg_advisory_xact_lock(hashtextextended($1, 71240721))`,
    [deploymentId]
  );
};

const select = async (
  client: Pick<PoolClient, 'query'>,
  deploymentId: string
): Promise<RemoteExecutionRegionalTrafficState | undefined> => {
  const result = await client.query<TrafficRow>(
    `SELECT deployment_id, active_region_id, epoch, checkpoint_digest, updated_at
       FROM remote_execution_regional_traffic_authorities
      WHERE deployment_id=$1`,
    [deploymentId]
  );
  return result.rowCount === 1 ? hydrate(result.rows[0]!) : undefined;
};

export const migrateRemoteExecutionRegionalTrafficPostgres = async (
  pool: Pick<Pool, 'connect'>
): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(REMOTE_EXECUTION_REGIONAL_TRAFFIC_POSTGRES_MIGRATION);
    await client.query('COMMIT');
  } catch (error) {
    await rollback(client as PoolClient);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * PostgreSQL advisory transaction locks make every accepted regional request
 * a shared reader and cutover an exclusive writer. The writer drains readers,
 * runs the exact recovery preparation, then advances the durable epoch.
 */
export const createPostgresRemoteExecutionRegionalTrafficAuthority = (
  pool: Pool
): RemoteExecutionRegionalTrafficAuthority =>
  Object.freeze({
    async initialize(input) {
      const deploymentId = identifier(
        input.deploymentId,
        'Remote regional deployment id',
        256
      );
      const activeRegionId = identifier(
        input.activeRegionId,
        'Remote regional active region id',
        128
      );
      timestamp(input.initializedAt, 'Remote regional initialization time');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lock(client, deploymentId, 'exclusive');
        await client.query(
          `INSERT INTO remote_execution_regional_traffic_authorities
             (deployment_id, active_region_id, epoch, checkpoint_digest, updated_at)
           VALUES ($1, $2, 1, NULL, $3)
           ON CONFLICT (deployment_id) DO NOTHING`,
          [deploymentId, activeRegionId, input.initializedAt]
        );
        const state = await select(client, deploymentId);
        if (!state)
          throw new TypeError(
            'Regional traffic authority could not initialize.'
          );
        await client.query('COMMIT');
        return state;
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
    async inspect(deploymentId) {
      return select(
        pool as unknown as Pick<PoolClient, 'query'>,
        identifier(deploymentId, 'Remote regional deployment id', 256)
      );
    },
    async listCutovers(deploymentId, maximumRecords) {
      const normalized = identifier(
        deploymentId,
        'Remote regional deployment id',
        256
      );
      if (
        !Number.isSafeInteger(maximumRecords) ||
        maximumRecords < 1 ||
        maximumRecords > 100
      )
        throw new TypeError(
          'Remote regional cutover evidence limit is invalid.'
        );
      const result = await pool.query<CutoverRow>(
        `SELECT deployment_id, epoch, source_region_id, target_region_id,
                checkpoint_digest, cutover_at
           FROM remote_execution_regional_traffic_cutovers
          WHERE deployment_id=$1
          ORDER BY epoch DESC
          LIMIT $2`,
        [normalized, maximumRecords]
      );
      return Object.freeze(result.rows.map(hydrateCutover));
    },
    async acquire(input) {
      const deploymentId = identifier(
        input.deploymentId,
        'Remote regional deployment id',
        256
      );
      const regionId = identifier(
        input.regionId,
        'Remote regional region id',
        128
      );
      const client = await pool.connect();
      let retained = false;
      try {
        await client.query('BEGIN');
        await lock(client, deploymentId, 'shared');
        const state = await select(client, deploymentId);
        if (!state || state.activeRegionId !== regionId) {
          await client.query('ROLLBACK');
          return undefined;
        }
        retained = true;
        let released = false;
        const permit: RemoteExecutionRegionalTrafficPermit = Object.freeze({
          deploymentId,
          regionId,
          epoch: state.epoch,
          async release() {
            if (released) return;
            released = true;
            try {
              await client.query('COMMIT');
            } catch (error) {
              await rollback(client);
              throw error;
            } finally {
              client.release();
            }
          },
        });
        return permit;
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        if (!retained) client.release();
      }
    },
    async cutover(input, prepare) {
      const deploymentId = identifier(
        input.deploymentId,
        'Remote regional deployment id',
        256
      );
      const sourceRegionId = identifier(
        input.sourceRegionId,
        'Remote regional source region id',
        128
      );
      const targetRegionId = identifier(
        input.targetRegionId,
        'Remote regional target region id',
        128
      );
      if (sourceRegionId === targetRegionId)
        throw new TypeError('Remote regional cutover regions must differ.');
      if (!Number.isSafeInteger(input.expectedEpoch) || input.expectedEpoch < 1)
        throw new TypeError('Remote regional expected epoch is invalid.');
      timestamp(input.cutoverAt, 'Remote regional cutover time');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await lock(client, deploymentId, 'exclusive');
        const current = await select(client, deploymentId);
        if (
          !current ||
          current.epoch !== input.expectedEpoch ||
          current.activeRegionId !== sourceRegionId
        ) {
          await client.query('ROLLBACK');
          return Object.freeze({
            kind: 'conflict',
            ...(current ? { state: current } : {}),
          });
        }
        if (input.cutoverAt < current.updatedAt)
          throw new TypeError('Remote regional cutover time moved backwards.');
        const prepared = await prepare();
        if (!/^sha256-[0-9a-f]{64}$/u.test(prepared.checkpointDigest))
          throw new TypeError('Remote regional checkpoint digest is invalid.');
        const updated = await client.query<TrafficRow>(
          `UPDATE remote_execution_regional_traffic_authorities
              SET active_region_id=$2, epoch=epoch+1,
                  checkpoint_digest=$3, updated_at=$4
            WHERE deployment_id=$1 AND active_region_id=$5 AND epoch=$6
            RETURNING deployment_id, active_region_id, epoch,
                      checkpoint_digest, updated_at`,
          [
            deploymentId,
            targetRegionId,
            prepared.checkpointDigest,
            input.cutoverAt,
            sourceRegionId,
            input.expectedEpoch,
          ]
        );
        if (updated.rowCount !== 1)
          throw new TypeError('Remote regional traffic authority drifted.');
        await client.query(
          `INSERT INTO remote_execution_regional_traffic_cutovers
             (deployment_id, epoch, source_region_id, target_region_id,
              checkpoint_digest, cutover_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            deploymentId,
            input.expectedEpoch + 1,
            sourceRegionId,
            targetRegionId,
            prepared.checkpointDigest,
            input.cutoverAt,
          ]
        );
        await client.query('COMMIT');
        return Object.freeze({
          kind: 'cutover',
          state: hydrate(updated.rows[0]!),
          result: prepared.result,
        });
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },
  });
