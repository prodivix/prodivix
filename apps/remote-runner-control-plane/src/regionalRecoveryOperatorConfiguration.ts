import { isAbsolute } from 'node:path';

export type RemoteRegionalRecoveryOperatorConfiguration = Readonly<{
  deploymentId: string;
  sourceRegionId: string;
  targetRegionId: string;
  sourceDatabaseUrl: string;
  targetDatabaseUrl: string;
  trafficDatabaseUrl: string;
  authorizationPublicKeys: Readonly<Record<string, string>>;
  infrastructureFencePublicKeys: Readonly<Record<string, string>>;
  replicationAttestationPublicKeys: Readonly<Record<string, string>>;
  requestPath: string;
  authorizationProofPath: string;
  infrastructureFenceProofPath?: string;
  replicationAttestationPath?: string;
  evidencePath: string;
  maximumWorkerAttempts: number;
  maximumBatchSize: number;
  maximumConcurrentCaptures: number;
  maximumRequestAgeMs: number;
  maximumProofLifetimeMs: number;
  maximumAcceptedRpoMs: number;
}>;

const required = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): string => {
  const value = environment[name]?.trim();
  if (!value) throw new TypeError(`${name} is required.`);
  return value;
};

const identifier = (value: string, name: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value))
    throw new TypeError(`${name} is invalid.`);
  return value;
};

const databaseUrl = (
  value: string,
  name: string
): Readonly<{ value: string; authority: string }> => {
  if (value.length > 8_192 || /[\r\n\0]/u.test(value))
    throw new TypeError(`${name} is invalid.`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} is invalid.`);
  }
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    !parsed.hostname ||
    parsed.pathname.length < 2 ||
    parsed.hash
  )
    throw new TypeError(`${name} is invalid.`);
  return Object.freeze({
    value,
    // Credentials and query options cannot make one physical database count
    // as a distinct DR authority. DNS aliases still require deployment-time
    // topology verification and are called out in the runbook.
    authority: `${parsed.hostname.toLowerCase()}:${parsed.port || '5432'}${parsed.pathname}`,
  });
};

const absolutePath = (value: string, name: string): string => {
  if (!isAbsolute(value) || value.length > 4_096 || /[\r\n\0]/u.test(value))
    throw new TypeError(`${name} must be a bounded absolute path.`);
  return value;
};

const optionalAbsolutePath = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined => {
  const value = environment[name]?.trim();
  return value ? absolutePath(value, name) : undefined;
};

const integer = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  const raw = environment[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new TypeError(`${name} is invalid.`);
  return value;
};

const publicKeys = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): Readonly<Record<string, string>> => {
  const raw = required(environment, name);
  if (raw.length > 64 * 1_024)
    throw new TypeError(`${name} exceeds its configuration budget.`);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new TypeError(`${name} must be valid JSON.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${name} must be an object.`);
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (
    entries.length < 1 ||
    entries.length > 8 ||
    entries.some(
      ([keyId, encoded]) =>
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(keyId) ||
        typeof encoded !== 'string' ||
        encoded.length < 32 ||
        encoded.length > 16 * 1_024
    )
  )
    throw new TypeError(`${name} contains an invalid public key.`);
  return Object.freeze(Object.fromEntries(entries));
};

/**
 * The DR job has a separate, all-explicit configuration surface. It is never
 * inferred from the public Control Plane HTTP process.
 */
export const readRemoteRegionalRecoveryOperatorConfiguration = (
  environment: Readonly<Record<string, string | undefined>>
): RemoteRegionalRecoveryOperatorConfiguration => {
  const sourceRegionId = identifier(
    required(environment, 'REMOTE_DR_SOURCE_REGION_ID'),
    'REMOTE_DR_SOURCE_REGION_ID'
  );
  const targetRegionId = identifier(
    required(environment, 'REMOTE_DR_TARGET_REGION_ID'),
    'REMOTE_DR_TARGET_REGION_ID'
  );
  if (sourceRegionId === targetRegionId)
    throw new TypeError('REMOTE_DR source and target regions must differ.');
  const sourceDatabase = databaseUrl(
    required(environment, 'REMOTE_DR_SOURCE_DATABASE_URL'),
    'REMOTE_DR_SOURCE_DATABASE_URL'
  );
  const targetDatabase = databaseUrl(
    required(environment, 'REMOTE_DR_TARGET_DATABASE_URL'),
    'REMOTE_DR_TARGET_DATABASE_URL'
  );
  const trafficDatabase = databaseUrl(
    required(environment, 'REMOTE_DR_TRAFFIC_DATABASE_URL'),
    'REMOTE_DR_TRAFFIC_DATABASE_URL'
  );
  if (
    new Set([
      sourceDatabase.authority,
      targetDatabase.authority,
      trafficDatabase.authority,
    ]).size !== 3
  )
    throw new TypeError('REMOTE_DR database authorities must be distinct.');
  const requestPath = absolutePath(
    required(environment, 'REMOTE_DR_REQUEST_PATH'),
    'REMOTE_DR_REQUEST_PATH'
  );
  const authorizationProofPath = absolutePath(
    required(environment, 'REMOTE_DR_AUTHORIZATION_PROOF_PATH'),
    'REMOTE_DR_AUTHORIZATION_PROOF_PATH'
  );
  const infrastructureFenceProofPath = optionalAbsolutePath(
    environment,
    'REMOTE_DR_INFRASTRUCTURE_FENCE_PROOF_PATH'
  );
  const replicationAttestationPath = optionalAbsolutePath(
    environment,
    'REMOTE_DR_REPLICATION_ATTESTATION_PATH'
  );
  const evidencePath = absolutePath(
    required(environment, 'REMOTE_DR_EVIDENCE_PATH'),
    'REMOTE_DR_EVIDENCE_PATH'
  );
  const paths = [
    requestPath,
    authorizationProofPath,
    infrastructureFenceProofPath,
    replicationAttestationPath,
    evidencePath,
  ].filter((value): value is string => value !== undefined);
  if (new Set(paths).size !== paths.length)
    throw new TypeError('REMOTE_DR input and evidence paths must be distinct.');
  return Object.freeze({
    deploymentId: identifier(
      required(environment, 'REMOTE_DR_DEPLOYMENT_ID'),
      'REMOTE_DR_DEPLOYMENT_ID'
    ),
    sourceRegionId,
    targetRegionId,
    sourceDatabaseUrl: sourceDatabase.value,
    targetDatabaseUrl: targetDatabase.value,
    trafficDatabaseUrl: trafficDatabase.value,
    authorizationPublicKeys: publicKeys(
      environment,
      'REMOTE_DR_AUTHORIZATION_PUBLIC_KEYS_JSON'
    ),
    infrastructureFencePublicKeys: publicKeys(
      environment,
      'REMOTE_DR_INFRASTRUCTURE_FENCE_PUBLIC_KEYS_JSON'
    ),
    replicationAttestationPublicKeys: publicKeys(
      environment,
      'REMOTE_DR_REPLICATION_ATTESTATION_PUBLIC_KEYS_JSON'
    ),
    requestPath,
    authorizationProofPath,
    ...(infrastructureFenceProofPath ? { infrastructureFenceProofPath } : {}),
    ...(replicationAttestationPath ? { replicationAttestationPath } : {}),
    evidencePath,
    maximumWorkerAttempts: integer(
      environment,
      'REMOTE_DR_MAXIMUM_WORKER_ATTEMPTS',
      3,
      1,
      32
    ),
    maximumBatchSize: integer(
      environment,
      'REMOTE_DR_MAXIMUM_BATCH_SIZE',
      128,
      1,
      128
    ),
    maximumConcurrentCaptures: integer(
      environment,
      'REMOTE_DR_MAXIMUM_CONCURRENT_CAPTURES',
      8,
      1,
      16
    ),
    maximumRequestAgeMs: integer(
      environment,
      'REMOTE_DR_MAXIMUM_REQUEST_AGE_MS',
      5 * 60_000,
      1,
      60 * 60_000
    ),
    maximumProofLifetimeMs: integer(
      environment,
      'REMOTE_DR_MAXIMUM_PROOF_LIFETIME_MS',
      10 * 60_000,
      1,
      60 * 60_000
    ),
    maximumAcceptedRpoMs: integer(
      environment,
      'REMOTE_DR_MAXIMUM_ACCEPTED_RPO_MS',
      60_000,
      0,
      60 * 60_000
    ),
  });
};
