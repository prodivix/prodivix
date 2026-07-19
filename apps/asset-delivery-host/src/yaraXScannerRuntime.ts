import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import { ASSET_DELIVERY_SCANNED_MEDIA_TYPES } from './assetDeliveryScannerPolicy';
import {
  createAssetDeliveryScannerSnapshot,
  type AssetDeliveryScannerRuntime,
  type AssetDeliveryScannerSnapshot,
} from './assetDeliveryScannerRuntime';

export const YARAX_MALWARE_FINDING_CODE = 'AST-SCAN-YARAX-DETECTED' as const;
export const YARAX_SCANNER_ID = 'prodivix.scanner.yarax' as const;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/u;

export type YaraXCommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type YaraXCommandRunner = (input: {
  binaryPath: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maximumOutputBytes: number;
}) => Promise<YaraXCommandResult>;

export type InitializeYaraXScannerRuntimeOptions = Readonly<{
  binaryPath: string;
  rulesPath: string;
  expectedVersion: string;
  expectedRulesDigest?: string;
  basePolicyVersion: string;
  timeoutSeconds: number;
  wallTimeoutMs: number;
  maximumOutputBytes: number;
  maximumRulesBytes: number;
  maximumRulesAgeMs: number;
  maximumFutureSkewMs?: number;
  maximumConcurrentScans: number;
  readinessCacheMs: number;
  now?: () => number;
  runCommand?: YaraXCommandRunner;
}>;

export type YaraXScannerRuntimeInspection = Readonly<{
  generation: number;
  policyVersion: string;
  engineVersion: string;
  rulesDigest: string;
  rulesTimestampMs: number;
}>;

export type InitializedYaraXScannerRuntime = AssetDeliveryScannerRuntime &
  Readonly<{ inspect(): YaraXScannerRuntimeInspection }>;

const boundedInteger = (
  value: number,
  minimum: number,
  maximum: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`YARA-X ${label} is invalid.`);
  }
  return value;
};

const runYaraXCommand: YaraXCommandRunner = async (input) =>
  new Promise<YaraXCommandResult>((resolve, reject) => {
    execFile(
      input.binaryPath,
      [...input.args],
      {
        cwd: input.cwd,
        encoding: 'utf8',
        env: {
          LANG: 'C',
          LC_ALL: 'C',
          PATH: process.env.PATH ?? '',
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
        },
        maxBuffer: input.maximumOutputBytes,
        timeout: input.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (
          Buffer.byteLength(stdout) > input.maximumOutputBytes ||
          Buffer.byteLength(stderr) > input.maximumOutputBytes
        ) {
          reject(new BinaryAssetScannerUnavailableError('protocol'));
          return;
        }
        if (error) {
          const detail = error as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: string;
          };
          if (detail.killed || detail.signal) {
            reject(new BinaryAssetScannerUnavailableError('timeout'));
            return;
          }
          if (detail.code === 'ENOENT') {
            reject(new BinaryAssetScannerUnavailableError('connection'));
            return;
          }
          resolve({
            exitCode:
              typeof detail.code === 'number' &&
              Number.isSafeInteger(detail.code)
                ? detail.code
                : 1,
            stdout,
            stderr,
          });
          return;
        }
        resolve({ exitCode: 0, stdout, stderr });
      }
    );
  });

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return (
    actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index])
  );
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readScanMatches = (
  stdout: string,
  targetPath: string,
  expectedVersion: string,
  maximumMatches: number
): readonly string[] => {
  if (!stdout || stdout.includes('\0')) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  if (
    !isRecord(parsed) ||
    !exactKeys(parsed, ['matches', 'version']) ||
    parsed.version !== expectedVersion ||
    !Array.isArray(parsed.matches) ||
    parsed.matches.length > maximumMatches
  ) {
    throw new BinaryAssetScannerUnavailableError('protocol');
  }
  const rules: string[] = [];
  for (const match of parsed.matches) {
    if (
      !isRecord(match) ||
      !exactKeys(match, ['file', 'rule']) ||
      typeof match.file !== 'string' ||
      typeof match.rule !== 'string' ||
      match.file !== targetPath ||
      !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(match.rule)
    ) {
      throw new BinaryAssetScannerUnavailableError('protocol');
    }
    rules.push(match.rule);
  }
  return Object.freeze(rules);
};

const createYaraXContentScanner = (input: {
  binaryPath: string;
  rulesContents: Uint8Array;
  engineVersion: string;
  policyVersion: string;
  timeoutSeconds: number;
  wallTimeoutMs: number;
  maximumOutputBytes: number;
  maximumConcurrentScans: number;
  runCommand: YaraXCommandRunner;
}): BinaryAssetContentScanner => {
  let activeScans = 0;
  return Object.freeze({
    descriptor: Object.freeze({
      id: YARAX_SCANNER_ID,
      version: input.policyVersion,
      supportedMediaTypes: ASSET_DELIVERY_SCANNED_MEDIA_TYPES,
    }),
    async scan(request) {
      const reference = createBinaryAssetBlobReference({
        contents: request.contents,
        mediaType: request.reference.mediaType,
      });
      if (
        reference.digest !== request.reference.digest ||
        reference.byteLength !== request.reference.byteLength ||
        activeScans >= input.maximumConcurrentScans
      ) {
        throw new BinaryAssetScannerUnavailableError(
          activeScans >= input.maximumConcurrentScans
            ? 'replicas-exhausted'
            : 'protocol'
        );
      }
      activeScans += 1;
      const directory = await mkdtemp(join(tmpdir(), 'prodivix-yarax-'));
      try {
        const rulesPath = join(directory, 'rules.yar');
        const targetPath = join(directory, 'target.bin');
        await Promise.all([
          writeFile(rulesPath, input.rulesContents, {
            flag: 'wx',
            mode: 0o600,
          }),
          writeFile(targetPath, request.contents, { flag: 'wx', mode: 0o600 }),
        ]);
        const result = await input.runCommand({
          binaryPath: input.binaryPath,
          args: [
            'scan',
            '--disable-console-logs',
            '--disable-warnings=text_as_hex',
            '--no-mmap',
            '--max-matches-per-pattern',
            '32',
            '--output-format',
            'json',
            '--threads',
            '1',
            '--timeout',
            String(input.timeoutSeconds),
            rulesPath,
            targetPath,
          ],
          cwd: directory,
          timeoutMs: input.wallTimeoutMs,
          maximumOutputBytes: input.maximumOutputBytes,
        });
        if (result.exitCode !== 0) {
          throw new BinaryAssetScannerUnavailableError('daemon-error');
        }
        if (result.stderr.trim()) {
          throw new BinaryAssetScannerUnavailableError('protocol');
        }
        const matches = readScanMatches(
          result.stdout,
          targetPath,
          input.engineVersion,
          32
        );
        return matches.length
          ? Object.freeze({
              verdict: 'quarantined' as const,
              findingCodes: Object.freeze([YARAX_MALWARE_FINDING_CODE]),
            })
          : Object.freeze({
              verdict: 'clean' as const,
              findingCodes: Object.freeze([]),
            });
      } finally {
        activeScans -= 1;
        await rm(directory, { force: true, recursive: true });
      }
    },
  });
};

const readRegularFile = async (
  path: string,
  maximumBytes: number,
  label: string
): Promise<Readonly<{ contents: Uint8Array; timestampMs: number }>> => {
  if (!isAbsolute(path)) {
    throw new TypeError(`YARA-X ${label} path must be absolute.`);
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximumBytes) {
    throw new BinaryAssetScannerUnavailableError('configuration');
  }
  const canonical = await realpath(path);
  if (canonical !== path) {
    throw new BinaryAssetScannerUnavailableError('configuration');
  }
  const contents = new Uint8Array(await readFile(path));
  if (contents.byteLength !== info.size) {
    throw new BinaryAssetScannerUnavailableError('policy-drift');
  }
  return Object.freeze({ contents, timestampMs: Math.trunc(info.mtimeMs) });
};

/** Publishes immutable exact-rule YARA-X scanner generations. */
export const initializeYaraXScannerRuntime = async (
  options: InitializeYaraXScannerRuntimeOptions
): Promise<InitializedYaraXScannerRuntime> => {
  const expectedVersion = options.expectedVersion.trim();
  if (!VERSION_PATTERN.test(expectedVersion)) {
    throw new TypeError('YARA-X expected version is invalid.');
  }
  const basePolicyVersion = options.basePolicyVersion.trim();
  if (!basePolicyVersion || basePolicyVersion.length > 128) {
    throw new TypeError('YARA-X base policy version is invalid.');
  }
  const expectedRulesDigest = options.expectedRulesDigest?.trim();
  if (expectedRulesDigest && !DIGEST_PATTERN.test(expectedRulesDigest)) {
    throw new TypeError('YARA-X expected rules digest is invalid.');
  }
  const timeoutSeconds = boundedInteger(
    options.timeoutSeconds,
    1,
    60,
    'scan timeout'
  );
  const wallTimeoutMs = boundedInteger(
    options.wallTimeoutMs,
    timeoutSeconds * 1_000,
    120_000,
    'wall timeout'
  );
  const maximumOutputBytes = boundedInteger(
    options.maximumOutputBytes,
    1_024,
    1024 * 1024,
    'output byte limit'
  );
  const maximumRulesBytes = boundedInteger(
    options.maximumRulesBytes,
    1,
    16 * 1024 * 1024,
    'rules byte limit'
  );
  const maximumRulesAgeMs = boundedInteger(
    options.maximumRulesAgeMs,
    1,
    365 * 24 * 60 * 60 * 1_000,
    'rules age limit'
  );
  const maximumFutureSkewMs = boundedInteger(
    options.maximumFutureSkewMs ?? 5 * 60 * 1_000,
    0,
    24 * 60 * 60 * 1_000,
    'future clock skew'
  );
  const maximumConcurrentScans = boundedInteger(
    options.maximumConcurrentScans,
    1,
    64,
    'concurrent scan limit'
  );
  const readinessCacheMs = boundedInteger(
    options.readinessCacheMs,
    0,
    10 * 60 * 1_000,
    'readiness cache duration'
  );
  const binaryPath = options.binaryPath;
  const rulesPath = options.rulesPath;
  const now = options.now ?? Date.now;
  const runCommand = options.runCommand ?? runYaraXCommand;
  await readRegularFile(binaryPath, 256 * 1024 * 1024, 'binary');
  const versionResult = await runCommand({
    binaryPath,
    args: ['--version'],
    cwd: dirname(binaryPath),
    timeoutMs: wallTimeoutMs,
    maximumOutputBytes,
  });
  const versionMatch = /^yara-x-cli ([^\r\n]+)\r?\n?$/u.exec(
    versionResult.stdout
  );
  if (
    versionResult.exitCode !== 0 ||
    versionResult.stderr.trim() ||
    versionMatch?.[1] !== expectedVersion
  ) {
    throw new BinaryAssetScannerUnavailableError('configuration');
  }

  let current:
    | Readonly<{
        snapshot: AssetDeliveryScannerSnapshot;
        inspection: YaraXScannerRuntimeInspection;
      }>
    | undefined;
  let cacheExpiresAt = -1;
  let pending: Promise<AssetDeliveryScannerSnapshot> | undefined;

  const refresh = async (): Promise<AssetDeliveryScannerSnapshot> => {
    const checkedAt = now();
    if (!Number.isSafeInteger(checkedAt) || checkedAt < 0) {
      throw new TypeError('YARA-X clock is invalid.');
    }
    const rules = await readRegularFile(rulesPath, maximumRulesBytes, 'rules');
    if (
      rules.timestampMs > checkedAt + maximumFutureSkewMs ||
      checkedAt - rules.timestampMs > maximumRulesAgeMs
    ) {
      throw new BinaryAssetScannerUnavailableError('stale-database');
    }
    const rulesDigest = `sha256-${createHash('sha256')
      .update(rules.contents)
      .digest('hex')}`;
    if (expectedRulesDigest && rulesDigest !== expectedRulesDigest) {
      throw new BinaryAssetScannerUnavailableError('policy-drift');
    }
    if (
      current &&
      (rules.timestampMs < current.inspection.rulesTimestampMs ||
        (rules.timestampMs === current.inspection.rulesTimestampMs &&
          rulesDigest !== current.inspection.rulesDigest))
    ) {
      throw new BinaryAssetScannerUnavailableError('policy-drift');
    }
    const policyVersion = `yarax-${createHash('sha256')
      .update(
        JSON.stringify({ basePolicyVersion, expectedVersion, rulesDigest })
      )
      .digest('hex')
      .slice(0, 32)}`;
    const generation =
      current?.snapshot.policyVersion === policyVersion
        ? current.snapshot.generation
        : (current?.snapshot.generation ?? 0) + 1;
    const scanner = createYaraXContentScanner({
      binaryPath,
      rulesContents: rules.contents,
      engineVersion: expectedVersion,
      policyVersion,
      timeoutSeconds,
      wallTimeoutMs,
      maximumOutputBytes,
      maximumConcurrentScans,
      runCommand,
    });
    const cleanProbe = await scanner.scan({
      reference: createBinaryAssetBlobReference({
        contents: new Uint8Array(),
        mediaType: 'application/octet-stream',
      }),
      contents: new Uint8Array(),
    });
    if (cleanProbe.verdict !== 'clean') {
      throw new BinaryAssetScannerUnavailableError('policy-drift');
    }
    const snapshot = createAssetDeliveryScannerSnapshot({
      generation,
      policyVersion,
      scanners: [scanner],
    });
    const inspection = Object.freeze({
      generation,
      policyVersion,
      engineVersion: expectedVersion,
      rulesDigest,
      rulesTimestampMs: rules.timestampMs,
    });
    current = Object.freeze({ snapshot, inspection });
    cacheExpiresAt = checkedAt + readinessCacheMs;
    return snapshot;
  };

  const runtime: InitializedYaraXScannerRuntime = Object.freeze({
    async acquire() {
      const at = now();
      if (current && at < cacheExpiresAt) return current.snapshot;
      if (pending) return pending;
      pending = refresh().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    inspect() {
      if (!current) {
        throw new BinaryAssetScannerUnavailableError('configuration');
      }
      return current.inspection;
    },
  });
  await runtime.acquire();
  return runtime;
};
