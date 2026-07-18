import { writeFile } from 'node:fs/promises';
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
const snapshot = await runtime.acquire();
const fleet = runtime.inspect();
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
if (
  quarantined.verdict !== 'quarantined' ||
  quarantined.findingCodes.length !== 1 ||
  quarantined.findingCodes[0] !== CLAMAV_MALWARE_FINDING_CODE
) {
  throw new Error('ClamAV Gate did not quarantine the antivirus canary.');
}

const evidence = Object.freeze({
  gate: 'g2-binary-asset-clamav',
  transport: 'clamd-instream',
  engineVersion: engine.engineVersion,
  databaseVersion: engine.databaseVersion,
  databaseTimestamp: new Date(engine.databaseTimestampMs).toISOString(),
  policyDigest: engine.policyDigest,
  scannerPolicyVersion: snapshot.policyVersion,
  cleanVerdict: clean.verdict,
  quarantineVerdict: quarantined.verdict,
  findingCodes: quarantined.findingCodes,
});
const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(
  process.env.PRODIVIX_CLAMAV_GATE_EVIDENCE_PATH ?? 'clamav-malware-gate.json',
  serialized,
  'utf8'
);
process.stdout.write(serialized);
