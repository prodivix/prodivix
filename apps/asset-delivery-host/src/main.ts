import { createServer } from 'node:http';
import {
  createBinaryAssetJpegSanitizeTransformer,
  createBinaryAssetPngSanitizeTransformer,
  createInMemoryBinaryAssetDerivedCache,
} from '@prodivix/assets';
import { createAssetDeliveryHttpHandler } from './assetDeliveryHttpHandler';
import { createAssetDeliverySessionStore } from './assetDeliverySessionStore';
import {
  initializeClamAvScannerFleetRuntime,
  readClamAvScannerEngineConfiguration,
} from './clamAvScannerFleet';

const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
};

const internalToken = process.env.ASSET_DELIVERY_HOST_TOKEN?.trim();
if (!internalToken) {
  throw new TypeError('ASSET_DELIVERY_HOST_TOKEN is required.');
}
const scannerPolicyVersion =
  process.env.ASSET_DELIVERY_SCANNER_POLICY_VERSION?.trim();
if (!scannerPolicyVersion) {
  throw new TypeError('ASSET_DELIVERY_SCANNER_POLICY_VERSION is required.');
}

const maximumTtlMs =
  positiveInteger('ASSET_DELIVERY_MAXIMUM_TTL_SECONDS', 600) * 1_000;
const clamAvHost = process.env.ASSET_DELIVERY_CLAMAV_HOST ?? '127.0.0.1';
const clamAvPort = positiveInteger('ASSET_DELIVERY_CLAMAV_PORT', 3310);
const clamAvTimeoutMs = positiveInteger(
  'ASSET_DELIVERY_CLAMAV_TIMEOUT_MS',
  15_000
);
const clamAvMaximumResponseBytes = positiveInteger(
  'ASSET_DELIVERY_CLAMAV_MAXIMUM_RESPONSE_BYTES',
  4 * 1024
);
const scannerRuntime = await initializeClamAvScannerFleetRuntime({
  engines: readClamAvScannerEngineConfiguration(
    process.env.ASSET_DELIVERY_CLAMAV_ENGINES_JSON,
    { host: clamAvHost, port: clamAvPort }
  ),
  timeoutMs: clamAvTimeoutMs,
  maximumResponseBytes: clamAvMaximumResponseBytes,
  maximumDatabaseAgeMs:
    positiveInteger('ASSET_DELIVERY_CLAMAV_MAXIMUM_DATABASE_AGE_HOURS', 72) *
    60 *
    60 *
    1_000,
  maximumFutureSkewMs:
    positiveInteger('ASSET_DELIVERY_CLAMAV_MAXIMUM_FUTURE_SKEW_SECONDS', 300) *
    1_000,
  readinessCacheMs:
    positiveInteger('ASSET_DELIVERY_CLAMAV_READINESS_CACHE_SECONDS', 30) *
    1_000,
  basePolicyVersion: scannerPolicyVersion,
  chunkBytes: positiveInteger('ASSET_DELIVERY_CLAMAV_CHUNK_BYTES', 64 * 1024),
});
const maximumTotalBytes = positiveInteger(
  'ASSET_DELIVERY_MAXIMUM_TOTAL_BYTES',
  256 * 1024 * 1024
);
const store = createAssetDeliverySessionStore({
  maximumSessions: positiveInteger('ASSET_DELIVERY_MAXIMUM_SESSIONS', 256),
  maximumTotalBytes,
  maximumTtlMs,
});
const derivedCache = createInMemoryBinaryAssetDerivedCache({
  maximumEntries: positiveInteger(
    'ASSET_DELIVERY_DERIVED_CACHE_MAXIMUM_ENTRIES',
    512
  ),
  maximumTotalBytes: positiveInteger(
    'ASSET_DELIVERY_DERIVED_CACHE_MAXIMUM_BYTES',
    maximumTotalBytes
  ),
});
const handler = createAssetDeliveryHttpHandler({
  internalToken,
  publicBaseUrl:
    process.env.ASSET_DELIVERY_PUBLIC_BASE_URL ??
    'http://asset-delivery.localhost:4190',
  store,
  transformers: [
    createBinaryAssetPngSanitizeTransformer(),
    createBinaryAssetJpegSanitizeTransformer(),
  ],
  scannerRuntime,
  derivedCache,
  maximumUploadBytes: positiveInteger(
    'ASSET_DELIVERY_MAXIMUM_UPLOAD_BYTES',
    32 * 1024 * 1024
  ),
  defaultTtlMs: Math.min(
    positiveInteger('ASSET_DELIVERY_DEFAULT_TTL_SECONDS', 600) * 1_000,
    maximumTtlMs
  ),
});
const port = positiveInteger('ASSET_DELIVERY_PORT', 4190);
const host = process.env.ASSET_DELIVERY_HOST ?? '127.0.0.1';

createServer(handler).listen(port, host, () => {
  process.stdout.write(`Asset Delivery Host listening on ${host}:${port}.\n`);
});
