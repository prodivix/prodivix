import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
} from '@prodivix/assets';
import { CLAMAV_MALWARE_FINDING_CODE } from '../src/clamAvContentScanner';
import {
  initializeClamAvScannerFleetRuntime,
  type InitializedClamAvScannerFleetRuntime,
} from '../src/clamAvScannerFleet';
import { createRequiredAssetDeliveryScannerRuntime } from '../src/requiredScannerRuntime';
import {
  initializeYaraXScannerRuntime,
  YARAX_MALWARE_FINDING_CODE,
} from '../src/yaraXScannerRuntime';

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
};

const host = process.env.PRODIVIX_CLAMAV_HOST?.trim() || '127.0.0.1';
const port = positiveInteger('PRODIVIX_CLAMAV_PORT', 13310);
const timeoutMs = positiveInteger('PRODIVIX_CLAMAV_TIMEOUT_MS', 15_000);
const startupTimeoutMs = positiveInteger(
  'PRODIVIX_CLAMAV_GATE_STARTUP_TIMEOUT_MS',
  10 * 60 * 1_000
);
const runtimeOptions = {
  engines: [
    {
      id: 'clamav',
      replicas: [{ id: 'primary', host, port }],
    },
  ],
  timeoutMs,
  maximumResponseBytes: 4 * 1024,
  maximumDatabaseAgeMs:
    positiveInteger('PRODIVIX_CLAMAV_MAXIMUM_DATABASE_AGE_HOURS', 7 * 24) *
    60 *
    60 *
    1_000,
  maximumFutureSkewMs: 5 * 60 * 1_000,
  readinessCacheMs: 0,
  basePolicyVersion: 'github-clamav-gate-v1',
};

const initializeWithRetry =
  async (): Promise<InitializedClamAvScannerFleetRuntime> => {
    const deadline = Date.now() + startupTimeoutMs;
    for (;;) {
      try {
        return await initializeClamAvScannerFleetRuntime(runtimeOptions);
      } catch (error) {
        if (
          !(error instanceof BinaryAssetScannerUnavailableError) ||
          error.reason === 'stale-database' ||
          error.reason === 'policy-drift' ||
          Date.now() >= deadline
        ) {
          throw error;
        }
        await delay(1_000);
      }
    }
  };

const runtime = await initializeWithRetry();
const yaraXBinaryPath = process.env.PRODIVIX_YARAX_BINARY_PATH?.trim();
if (!yaraXBinaryPath) {
  throw new TypeError('PRODIVIX_YARAX_BINARY_PATH is required.');
}
const yaraXRulesDigest = process.env.PRODIVIX_YARAX_RULES_DIGEST?.trim();
const yaraXRuntime = await initializeYaraXScannerRuntime({
  binaryPath: yaraXBinaryPath,
  rulesPath:
    process.env.PRODIVIX_YARAX_RULES_PATH?.trim() ||
    fileURLToPath(new URL('../rules/prodivix-baseline.yar', import.meta.url)),
  expectedVersion:
    process.env.PRODIVIX_YARAX_EXPECTED_VERSION?.trim() || '1.15.0',
  ...(yaraXRulesDigest ? { expectedRulesDigest: yaraXRulesDigest } : {}),
  basePolicyVersion: 'github-yarax-gate-v1',
  timeoutSeconds: positiveInteger('PRODIVIX_YARAX_TIMEOUT_SECONDS', 15),
  wallTimeoutMs: positiveInteger('PRODIVIX_YARAX_WALL_TIMEOUT_MS', 20_000),
  maximumOutputBytes: 64 * 1024,
  maximumRulesBytes: 4 * 1024 * 1024,
  maximumRulesAgeMs:
    positiveInteger('PRODIVIX_YARAX_MAXIMUM_RULES_AGE_HOURS', 24) *
    60 *
    60 *
    1_000,
  maximumConcurrentScans: 2,
  readinessCacheMs: 0,
});
const requiredRuntime = createRequiredAssetDeliveryScannerRuntime({
  primary: runtime,
  required: [yaraXRuntime],
});
const snapshot = await requiredRuntime.acquire();
const fleet = runtime.inspect();
const yaraX = yaraXRuntime.inspect();
const engine = fleet.engines[0];
if (!engine) throw new Error('ClamAV Gate fleet inspection is missing.');
const matchingScanners = snapshot.scanners.filter((scanner) =>
  scanner.descriptor.supportedMediaTypes.includes('application/octet-stream')
);
if (matchingScanners.length !== 1) {
  throw new Error('ClamAV Gate scanner coverage is invalid.');
}
const scanner = matchingScanners[0];
if (!scanner) throw new Error('ClamAV Gate scanner is missing.');
const scan = async (contents: Uint8Array) =>
  scanner.scan({
    reference: createBinaryAssetBlobReference({
      contents,
      mediaType: 'application/octet-stream',
    }),
    contents,
  });

const clean = await scan(
  new TextEncoder().encode('Prodivix ClamAV clean integration canary.')
);
if (clean.verdict !== 'clean' || clean.findingCodes.length !== 0) {
  throw new Error('ClamAV Gate did not accept the clean canary.');
}

const antivirusCanary = [
  'X5O!P%@AP',
  '[4\\PZX54(P^)7CC)7}$',
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!',
  '$H+H*',
].join('');
const quarantined = await scan(new TextEncoder().encode(antivirusCanary));
const expectedFindingCodes = [
  CLAMAV_MALWARE_FINDING_CODE,
  YARAX_MALWARE_FINDING_CODE,
].sort();
if (
  quarantined.verdict !== 'quarantined' ||
  JSON.stringify(quarantined.findingCodes) !==
    JSON.stringify(expectedFindingCodes)
) {
  throw new Error('Required malware engines did not quarantine the canary.');
}

const evidence = Object.freeze({
  gate: 'g2-binary-asset-required-malware-engines',
  engines: Object.freeze({
    clamav: Object.freeze({
      transport: 'clamd-instream',
      engineVersion: engine.engineVersion,
      databaseVersion: engine.databaseVersion,
      databaseTimestamp: new Date(engine.databaseTimestampMs).toISOString(),
      policyDigest: engine.policyDigest,
    }),
    yaraX: Object.freeze({
      transport: 'isolated-cli-exact-file',
      engineVersion: yaraX.engineVersion,
      rulesDigest: yaraX.rulesDigest,
      rulesTimestamp: new Date(yaraX.rulesTimestampMs).toISOString(),
      scannerPolicyVersion: yaraX.policyVersion,
    }),
  }),
  scannerPolicyVersion: snapshot.policyVersion,
  cleanVerdict: clean.verdict,
  quarantineVerdict: quarantined.verdict,
  findingCodes: quarantined.findingCodes,
});
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(
  process.env.PRODIVIX_MALWARE_GATE_EVIDENCE_PATH ??
    process.env.PRODIVIX_CLAMAV_GATE_EVIDENCE_PATH ??
    'binary-asset-malware-gate.json',
  serialized,
  'utf8'
);
process.stdout.write(serialized);
