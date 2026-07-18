import { createHash } from 'node:crypto';
import { BinaryAssetScannerUnavailableError } from '@prodivix/assets';
import {
  createAssetDeliveryScannerPolicy,
  type AssetDeliveryMalwareEngineConfiguration,
} from './assetDeliveryScannerPolicy';
import {
  createAssetDeliveryScannerSnapshot,
  type AssetDeliveryScannerRuntime,
  type AssetDeliveryScannerSnapshot,
} from './assetDeliveryScannerRuntime';
import {
  probeClamAvDaemon,
  type ClamAvDaemonMetadata,
  type InitializeClamAvDaemonRuntimeOptions,
} from './clamAvDaemonReadiness';

export type ClamAvScannerReplicaConfiguration = Readonly<{
  id: string;
  host: string;
  port: number;
}>;

export type ClamAvScannerEngineConfiguration = Readonly<{
  id: string;
  replicas: readonly ClamAvScannerReplicaConfiguration[];
}>;

type ClamAvProbe = (
  options: InitializeClamAvDaemonRuntimeOptions
) => Promise<ClamAvDaemonMetadata>;

export type InitializeClamAvScannerFleetOptions = Readonly<{
  engines: readonly ClamAvScannerEngineConfiguration[];
  timeoutMs: number;
  maximumResponseBytes?: number;
  maximumDatabaseAgeMs: number;
  maximumFutureSkewMs?: number;
  readinessCacheMs: number;
  basePolicyVersion: string;
  chunkBytes?: number;
  now?: () => number;
  probe?: ClamAvProbe;
}>;

type EnginePolicy = Readonly<{
  id: string;
  engineVersion: string;
  policyDigest: string;
  databaseVersion: number;
  databaseTimestampMs: number;
  replicas: readonly ClamAvScannerReplicaConfiguration[];
}>;

export type ClamAvScannerFleetInspection = Readonly<{
  generation: number;
  policyVersion: string;
  engines: readonly Readonly<{
    id: string;
    engineVersion: string;
    policyDigest: string;
    databaseVersion: number;
    databaseTimestampMs: number;
    availableReplicas: number;
  }>[];
}>;

export type InitializedClamAvScannerFleetRuntime = AssetDeliveryScannerRuntime &
  Readonly<{ inspect(): ClamAvScannerFleetInspection }>;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasExactKeys = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const boundedInteger = (
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`ClamAV scanner fleet ${label} is invalid.`);
  }
  return value;
};

const normalizeId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 64 || !ID_PATTERN.test(normalized)) {
    throw new TypeError(`ClamAV scanner fleet ${label} is invalid.`);
  }
  return normalized;
};

const normalizeHost = (value: string): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 253 ||
    !/^[A-Za-z0-9._:%-]+$/u.test(normalized)
  ) {
    throw new TypeError('ClamAV scanner fleet host is invalid.');
  }
  return normalized;
};

const normalizeEngines = (
  values: readonly ClamAvScannerEngineConfiguration[]
): readonly ClamAvScannerEngineConfiguration[] => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 8) {
    throw new TypeError('ClamAV scanner fleet engine list is invalid.');
  }
  let totalReplicas = 0;
  const engines = values.map((engine) => {
    const id = normalizeId(engine.id, 'engine id');
    if (
      !Array.isArray(engine.replicas) ||
      engine.replicas.length < 1 ||
      engine.replicas.length > 16
    ) {
      throw new TypeError('ClamAV scanner fleet replica list is invalid.');
    }
    totalReplicas += engine.replicas.length;
    const replicas = engine.replicas.map(
      (replica: ClamAvScannerReplicaConfiguration) =>
        Object.freeze({
          id: normalizeId(replica.id, 'replica id'),
          host: normalizeHost(replica.host),
          port: boundedInteger(replica.port, 1, 65_535, 'port'),
        })
    );
    if (
      new Set(replicas.map((replica: { id: string }) => replica.id)).size !==
      replicas.length
    ) {
      throw new TypeError('ClamAV scanner fleet replica ids must be unique.');
    }
    return Object.freeze({ id, replicas: Object.freeze(replicas) });
  });
  if (
    totalReplicas > 32 ||
    new Set(engines.map((engine) => engine.id)).size !== engines.length
  ) {
    throw new TypeError('ClamAV scanner fleet topology is invalid.');
  }
  return Object.freeze(
    [...engines].sort((left, right) => left.id.localeCompare(right.id))
  );
};

/** Strict bounded environment codec; endpoint details remain Host-local. */
export const readClamAvScannerEngineConfiguration = (
  raw: string | undefined,
  fallback: Readonly<{ host: string; port: number }>
): readonly ClamAvScannerEngineConfiguration[] => {
  if (raw === undefined || raw.trim() === '') {
    return normalizeEngines([
      { id: 'clamav', replicas: [{ id: 'primary', ...fallback }] },
    ]);
  }
  if (raw.length > 16 * 1024) {
    throw new TypeError('ClamAV scanner fleet configuration is too large.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError('ClamAV scanner fleet configuration is invalid.');
  }
  if (!Array.isArray(parsed)) {
    throw new TypeError('ClamAV scanner fleet configuration is invalid.');
  }
  const engines = parsed.map((engine): ClamAvScannerEngineConfiguration => {
    if (
      !isRecord(engine) ||
      !hasExactKeys(engine, ['id', 'replicas']) ||
      typeof engine.id !== 'string' ||
      !Array.isArray(engine.replicas)
    ) {
      throw new TypeError('ClamAV scanner fleet configuration is invalid.');
    }
    return {
      id: engine.id,
      replicas: engine.replicas.map((replica) => {
        if (
          !isRecord(replica) ||
          !hasExactKeys(replica, ['id', 'host', 'port']) ||
          typeof replica.id !== 'string' ||
          typeof replica.host !== 'string' ||
          typeof replica.port !== 'number'
        ) {
          throw new TypeError('ClamAV scanner fleet configuration is invalid.');
        }
        return { id: replica.id, host: replica.host, port: replica.port };
      }),
    };
  });
  return normalizeEngines(engines);
};

const readMetadata = (
  value: ClamAvDaemonMetadata,
  now: number,
  maximumDatabaseAgeMs: number,
  maximumFutureSkewMs: number
): ClamAvDaemonMetadata => {
  if (
    typeof value.engineVersion !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(value.engineVersion) ||
    !Number.isSafeInteger(value.databaseVersion) ||
    value.databaseVersion < 1 ||
    !Number.isSafeInteger(value.databaseTimestampMs) ||
    value.databaseTimestampMs < 0 ||
    !DIGEST_PATTERN.test(value.policyDigest) ||
    !Number.isSafeInteger(value.checkedAtMs) ||
    value.checkedAtMs < 0
  ) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  if (
    value.databaseTimestampMs > now + maximumFutureSkewMs ||
    now - value.databaseTimestampMs > maximumDatabaseAgeMs
  ) {
    throw new BinaryAssetScannerUnavailableError('stale-database');
  }
  return Object.freeze({ ...value });
};

const selectEnginePolicy = (
  engine: ClamAvScannerEngineConfiguration,
  available: readonly Readonly<{
    replica: ClamAvScannerReplicaConfiguration;
    metadata: ClamAvDaemonMetadata;
  }>[],
  previous: EnginePolicy | undefined
): EnginePolicy => {
  if (!available.length) {
    throw new BinaryAssetScannerUnavailableError('replicas-exhausted');
  }
  const frontier = available.filter((candidate) =>
    available.every(
      (other) =>
        candidate.metadata.databaseVersion >= other.metadata.databaseVersion &&
        candidate.metadata.databaseTimestampMs >=
          other.metadata.databaseTimestampMs
    )
  );
  if (!frontier.length) {
    throw new BinaryAssetScannerUnavailableError('policy-drift');
  }
  const policyDigests = new Set(
    frontier.map((candidate) => candidate.metadata.policyDigest)
  );
  if (policyDigests.size !== 1) {
    throw new BinaryAssetScannerUnavailableError('policy-drift');
  }
  const selected = frontier[0] as (typeof frontier)[number];
  if (
    previous &&
    (selected.metadata.databaseVersion < previous.databaseVersion ||
      selected.metadata.databaseTimestampMs < previous.databaseTimestampMs ||
      (selected.metadata.databaseVersion === previous.databaseVersion &&
        selected.metadata.databaseTimestampMs ===
          previous.databaseTimestampMs &&
        selected.metadata.policyDigest !== previous.policyDigest))
  ) {
    throw new BinaryAssetScannerUnavailableError('policy-drift');
  }
  const replicas = available
    .filter(
      (candidate) =>
        candidate.metadata.policyDigest === selected.metadata.policyDigest
    )
    .map((candidate) => candidate.replica);
  return Object.freeze({
    id: engine.id,
    engineVersion: selected.metadata.engineVersion,
    policyDigest: selected.metadata.policyDigest,
    databaseVersion: selected.metadata.databaseVersion,
    databaseTimestampMs: selected.metadata.databaseTimestampMs,
    replicas: Object.freeze(replicas),
  });
};

const effectivePolicyVersion = (
  basePolicyVersion: string,
  policies: readonly EnginePolicy[]
): string =>
  `clamav-fleet-${createHash('sha256')
    .update(
      JSON.stringify({
        basePolicyVersion,
        engines: policies.map((policy) => ({
          id: policy.id,
          policyDigest: policy.policyDigest,
        })),
      })
    )
    .digest('hex')
    .slice(0, 32)}`;

/**
 * Atomically refreshes every required engine, picks a single converged policy
 * cohort per engine, and publishes an immutable request snapshot.
 */
export const initializeClamAvScannerFleetRuntime = async (
  options: InitializeClamAvScannerFleetOptions
): Promise<InitializedClamAvScannerFleetRuntime> => {
  const engines = normalizeEngines(options.engines);
  const timeoutMs = boundedInteger(options.timeoutMs, 1, 60_000, 'timeout');
  const maximumResponseBytes = boundedInteger(
    options.maximumResponseBytes ?? 4 * 1024,
    64,
    64 * 1024,
    'response byte limit'
  );
  const maximumDatabaseAgeMs = boundedInteger(
    options.maximumDatabaseAgeMs,
    1,
    30 * 24 * 60 * 60 * 1_000,
    'database age limit'
  );
  const maximumFutureSkewMs = boundedInteger(
    options.maximumFutureSkewMs ?? 5 * 60 * 1_000,
    0,
    24 * 60 * 60 * 1_000,
    'future clock skew'
  );
  const readinessCacheMs = boundedInteger(
    options.readinessCacheMs,
    0,
    10 * 60 * 1_000,
    'cache duration'
  );
  const chunkBytes = boundedInteger(
    options.chunkBytes ?? 64 * 1024,
    1,
    1024 * 1024,
    'stream chunk size'
  );
  const basePolicyVersion = options.basePolicyVersion.trim();
  if (!basePolicyVersion || basePolicyVersion.length > 256) {
    throw new TypeError('ClamAV scanner fleet base policy version is invalid.');
  }
  const now = options.now ?? Date.now;
  const probe = options.probe ?? probeClamAvDaemon;
  let current:
    | Readonly<{
        snapshot: AssetDeliveryScannerSnapshot;
        policies: readonly EnginePolicy[];
      }>
    | undefined;
  let cacheExpiresAt = -1;
  let pending: Promise<AssetDeliveryScannerSnapshot> | undefined;

  const refresh = async (): Promise<AssetDeliveryScannerSnapshot> => {
    const checkedAt = now();
    if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) {
      throw new TypeError('ClamAV scanner fleet clock is invalid.');
    }
    const previousById = new Map(
      current?.policies.map((policy) => [policy.id, policy] as const) ?? []
    );
    const policies = await Promise.all(
      engines.map(async (engine) => {
        const outcomes = await Promise.all(
          engine.replicas.map(async (replica) => {
            try {
              const metadata = readMetadata(
                await probe({
                  host: replica.host,
                  port: replica.port,
                  timeoutMs,
                  maximumResponseBytes,
                  maximumDatabaseAgeMs,
                  maximumFutureSkewMs,
                  readinessCacheMs,
                  basePolicyVersion,
                  now,
                }),
                checkedAt,
                maximumDatabaseAgeMs,
                maximumFutureSkewMs
              );
              return Object.freeze({ replica, metadata });
            } catch (error) {
              if (error instanceof BinaryAssetScannerUnavailableError) {
                return undefined;
              }
              throw error;
            }
          })
        );
        return selectEnginePolicy(
          engine,
          outcomes.filter(
            (outcome): outcome is NonNullable<typeof outcome> =>
              outcome !== undefined
          ),
          previousById.get(engine.id)
        );
      })
    );
    const policyVersion = effectivePolicyVersion(basePolicyVersion, policies);
    const generation =
      current && current.snapshot.policyVersion === policyVersion
        ? current.snapshot.generation
        : (current?.snapshot.generation ?? 0) + 1;
    const malwareEngines: readonly AssetDeliveryMalwareEngineConfiguration[] =
      policies.map((policy) => ({
        id: policy.id,
        replicas: policy.replicas,
      }));
    const snapshot = createAssetDeliveryScannerSnapshot({
      generation,
      policyVersion,
      scanners: createAssetDeliveryScannerPolicy({
        malwareEngines,
        clamAvTimeoutMs: timeoutMs,
        clamAvMaximumResponseBytes: maximumResponseBytes,
        clamAvChunkBytes: chunkBytes,
        policyVersion,
      }),
    });
    current = Object.freeze({ snapshot, policies: Object.freeze(policies) });
    cacheExpiresAt = checkedAt + readinessCacheMs;
    return snapshot;
  };

  const runtime: InitializedClamAvScannerFleetRuntime = Object.freeze({
    async acquire(): Promise<AssetDeliveryScannerSnapshot> {
      const at = now();
      if (!Number.isSafeInteger(at) || at < 0) {
        throw new TypeError('ClamAV scanner fleet clock is invalid.');
      }
      if (current && at < cacheExpiresAt) return current.snapshot;
      if (pending) return pending;
      pending = refresh().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    inspect(): ClamAvScannerFleetInspection {
      if (!current) {
        throw new BinaryAssetScannerUnavailableError('configuration');
      }
      return Object.freeze({
        generation: current.snapshot.generation,
        policyVersion: current.snapshot.policyVersion,
        engines: Object.freeze(
          current.policies.map((policy) =>
            Object.freeze({
              id: policy.id,
              engineVersion: policy.engineVersion,
              policyDigest: policy.policyDigest,
              databaseVersion: policy.databaseVersion,
              databaseTimestampMs: policy.databaseTimestampMs,
              availableReplicas: policy.replicas.length,
            })
          )
        ),
      });
    },
  });
  await runtime.acquire();
  return runtime;
};
