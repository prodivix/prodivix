import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import { BinaryAssetScannerUnavailableError } from '@prodivix/assets';

const CLAMAV_CONTROL_COMMANDS = ['PING', 'VERSIONCOMMANDS'] as const;
const REQUIRED_COMMANDS = Object.freeze([
  'INSTREAM',
  'PING',
  'VERSION',
  'VERSIONCOMMANDS',
]);
const MONTH_BY_NAME = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
} as const);
const DAY_BY_NAME = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
} as const);

type ClamAvControlCommand = (typeof CLAMAV_CONTROL_COMMANDS)[number];

export type ClamAvDaemonMetadata = Readonly<{
  engineVersion: string;
  databaseVersion: number;
  databaseTimestampMs: number;
  policyDigest: string;
  checkedAtMs: number;
}>;

export type ClamAvDaemonReadinessGate = Readonly<{
  assertReady(): Promise<ClamAvDaemonMetadata>;
}>;

export type InitializedClamAvDaemonRuntime = Readonly<{
  metadata: ClamAvDaemonMetadata;
  scannerPolicyVersion: string;
  readiness: ClamAvDaemonReadinessGate;
}>;

export type InitializeClamAvDaemonRuntimeOptions = Readonly<{
  host: string;
  port: number;
  timeoutMs: number;
  maximumResponseBytes?: number;
  maximumDatabaseAgeMs: number;
  maximumFutureSkewMs?: number;
  readinessCacheMs: number;
  basePolicyVersion: string;
  now?: () => number;
}>;

type NormalizedProbeOptions = Readonly<{
  host: string;
  port: number;
  timeoutMs: number;
  maximumResponseBytes: number;
  maximumDatabaseAgeMs: number;
  maximumFutureSkewMs: number;
  now: () => number;
}>;

const boundedInteger = (
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`ClamAV readiness ${label} is invalid.`);
  }
  return value;
};

const normalizeProbeOptions = (
  options: InitializeClamAvDaemonRuntimeOptions
): NormalizedProbeOptions => {
  const host = options.host.trim();
  if (!host || host.length > 253 || !/^[A-Za-z0-9._:%-]+$/u.test(host)) {
    throw new TypeError('ClamAV readiness host is invalid.');
  }
  return Object.freeze({
    host,
    port: boundedInteger(options.port, 1, 65_535, 'port'),
    timeoutMs: boundedInteger(options.timeoutMs, 1, 60_000, 'timeout'),
    maximumResponseBytes: boundedInteger(
      options.maximumResponseBytes ?? 4 * 1024,
      64,
      64 * 1024,
      'response byte limit'
    ),
    maximumDatabaseAgeMs: boundedInteger(
      options.maximumDatabaseAgeMs,
      1,
      30 * 24 * 60 * 60 * 1_000,
      'database age limit'
    ),
    maximumFutureSkewMs: boundedInteger(
      options.maximumFutureSkewMs ?? 5 * 60 * 1_000,
      0,
      24 * 60 * 60 * 1_000,
      'future clock skew'
    ),
    now: options.now ?? Date.now,
  });
};

const requestControlRecord = (
  options: NormalizedProbeOptions,
  command: ClamAvControlCommand
): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: options.host, port: options.port });
    let response = Buffer.alloc(0);
    let settled = false;
    const fail = (
      reason: ConstructorParameters<
        typeof BinaryAssetScannerUnavailableError
      >[0]
    ): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new BinaryAssetScannerUnavailableError(reason));
    };
    const finish = (value: string): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(options.timeoutMs);
    socket.once('timeout', () => fail('timeout'));
    socket.once('error', () => fail('connection'));
    socket.once('end', () => fail('protocol'));
    socket.once('close', () => fail('protocol'));
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (
        chunk.byteLength >
        options.maximumResponseBytes - response.byteLength
      ) {
        fail('protocol');
        return;
      }
      response = Buffer.concat([response, chunk]);
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      if (terminator !== response.byteLength - 1) {
        fail('protocol');
        return;
      }
      try {
        finish(
          new TextDecoder('utf-8', { fatal: true }).decode(
            response.subarray(0, terminator)
          )
        );
      } catch {
        fail('protocol');
      }
    });
    socket.once('connect', () => {
      socket.setNoDelay(true);
      socket.write(Buffer.from(`z${command}\0`, 'ascii'), (error) => {
        if (error) fail('connection');
      });
    });
  });

const parseDatabaseTimestampUtc = (value: string): number => {
  const match =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+([0-9]{1,2})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})\s+([0-9]{4})$/u.exec(
      value
    );
  if (!match) throw new BinaryAssetScannerUnavailableError('protocol');
  const dayName = match[1] as keyof typeof DAY_BY_NAME;
  const monthName = match[2] as keyof typeof MONTH_BY_NAME;
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const year = Number(match[7]);
  const timestamp = Date.UTC(
    year,
    MONTH_BY_NAME[monthName],
    day,
    hour,
    minute,
    second
  );
  const parsed = new Date(timestamp);
  if (
    year < 2000 ||
    year > 9999 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== MONTH_BY_NAME[monthName] ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second ||
    parsed.getUTCDay() !== DAY_BY_NAME[dayName]
  ) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  return timestamp;
};

const parseVersionCommands = (
  value: string,
  checkedAtMs: number
): ClamAvDaemonMetadata => {
  const separator = '| COMMANDS:';
  const separatorIndex = value.indexOf(separator);
  if (separatorIndex < 1 || separatorIndex !== value.lastIndexOf(separator)) {
    throw new BinaryAssetScannerUnavailableError(
      value.endsWith(' ERROR') ? 'daemon-error' : 'protocol'
    );
  }
  const version = value.slice(0, separatorIndex);
  const commands = value
    .slice(separatorIndex + separator.length)
    .trim()
    .split(/\s+/u);
  if (
    commands.some((command) => !/^[A-Z][A-Z0-9]*$/u.test(command)) ||
    REQUIRED_COMMANDS.some((command) => !commands.includes(command))
  ) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  const match =
    /^ClamAV ([A-Za-z0-9][A-Za-z0-9._+-]{0,63})\/([1-9][0-9]{0,9})\/(.+)$/u.exec(
      version
    );
  if (!match) throw new BinaryAssetScannerUnavailableError('protocol');
  const engineVersion = match[1] as string;
  const databaseVersion = Number(match[2]);
  if (!Number.isSafeInteger(databaseVersion)) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  const databaseTimestampMs = parseDatabaseTimestampUtc(match[3] as string);
  const policyDigest = `sha256-${createHash('sha256')
    .update(
      JSON.stringify({ engineVersion, databaseVersion, databaseTimestampMs })
    )
    .digest('hex')}`;
  return Object.freeze({
    engineVersion,
    databaseVersion,
    databaseTimestampMs,
    policyDigest,
    checkedAtMs,
  });
};

export const probeClamAvDaemon = async (
  options: InitializeClamAvDaemonRuntimeOptions
): Promise<ClamAvDaemonMetadata> => {
  const normalized = normalizeProbeOptions(options);
  const checkedAtMs = normalized.now();
  if (!Number.isSafeInteger(checkedAtMs) || checkedAtMs < 0) {
    throw new TypeError('ClamAV readiness clock is invalid.');
  }
  const [ping, versionCommands] = await Promise.all([
    requestControlRecord(normalized, 'PING'),
    requestControlRecord(normalized, 'VERSIONCOMMANDS'),
  ]);
  if (ping !== 'PONG') {
    throw new BinaryAssetScannerUnavailableError(
      ping.endsWith(' ERROR') ? 'daemon-error' : 'protocol'
    );
  }
  const metadata = parseVersionCommands(versionCommands, checkedAtMs);
  if (
    metadata.databaseTimestampMs >
      checkedAtMs + normalized.maximumFutureSkewMs ||
    checkedAtMs - metadata.databaseTimestampMs > normalized.maximumDatabaseAgeMs
  ) {
    throw new BinaryAssetScannerUnavailableError('stale-database');
  }
  return metadata;
};

/** Bootstraps and locks one daemon policy so signature updates force a safe Host restart. */
export const initializeClamAvDaemonRuntime = async (
  options: InitializeClamAvDaemonRuntimeOptions
): Promise<InitializedClamAvDaemonRuntime> => {
  const readinessCacheMs = boundedInteger(
    options.readinessCacheMs,
    0,
    10 * 60 * 1_000,
    'cache duration'
  );
  const basePolicyVersion = options.basePolicyVersion.trim();
  if (!basePolicyVersion || basePolicyVersion.length > 256) {
    throw new TypeError('ClamAV base policy version is invalid.');
  }
  const metadata = await probeClamAvDaemon(options);
  const scannerPolicyVersion = `clamav-${createHash('sha256')
    .update(`${basePolicyVersion}\0${metadata.policyDigest}`)
    .digest('hex')
    .slice(0, 32)}`;
  let cached: ClamAvDaemonMetadata | undefined = metadata;
  let cacheExpiresAt = metadata.checkedAtMs + readinessCacheMs;
  let pending: Promise<ClamAvDaemonMetadata> | undefined;
  const readiness = Object.freeze({
    async assertReady(): Promise<ClamAvDaemonMetadata> {
      const now = (options.now ?? Date.now)();
      if (cached && now < cacheExpiresAt) return cached;
      if (pending) return pending;
      pending = probeClamAvDaemon(options)
        .then((current) => {
          if (current.policyDigest !== metadata.policyDigest) {
            throw new BinaryAssetScannerUnavailableError('policy-drift');
          }
          cached = current;
          cacheExpiresAt = current.checkedAtMs + readinessCacheMs;
          return current;
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  });
  return Object.freeze({ metadata, scannerPolicyVersion, readiness });
};
