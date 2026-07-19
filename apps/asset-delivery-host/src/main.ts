import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
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
import {
  configureSharpRasterRuntime,
  createSharpRasterReencodeTransformers,
} from './sharpRasterTransformer';
import { createRequiredAssetDeliveryScannerRuntime } from './requiredScannerRuntime';
import { initializeYaraXScannerRuntime } from './yaraXScannerRuntime';

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
const clamAvScannerRuntime = await initializeClamAvScannerFleetRuntime({
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
const yaraXBinaryPath = process.env.ASSET_DELIVERY_YARAX_BINARY_PATH?.trim();
if (!yaraXBinaryPath) {
  throw new TypeError('ASSET_DELIVERY_YARAX_BINARY_PATH is required.');
}
const yaraXRulesDigest = process.env.ASSET_DELIVERY_YARAX_RULES_DIGEST?.trim();
const yaraXScannerRuntime = await initializeYaraXScannerRuntime({
  binaryPath: yaraXBinaryPath,
  rulesPath:
    process.env.ASSET_DELIVERY_YARAX_RULES_PATH?.trim() ||
    fileURLToPath(new URL('../rules/prodivix-baseline.yar', import.meta.url)),
  expectedVersion:
    process.env.ASSET_DELIVERY_YARAX_EXPECTED_VERSION?.trim() || '1.15.0',
  ...(yaraXRulesDigest ? { expectedRulesDigest: yaraXRulesDigest } : {}),
  basePolicyVersion: scannerPolicyVersion,
  timeoutSeconds: positiveInteger('ASSET_DELIVERY_YARAX_TIMEOUT_SECONDS', 15),
  wallTimeoutMs: positiveInteger(
    'ASSET_DELIVERY_YARAX_WALL_TIMEOUT_MS',
    20_000
  ),
  maximumOutputBytes: positiveInteger(
    'ASSET_DELIVERY_YARAX_MAXIMUM_OUTPUT_BYTES',
    64 * 1024
  ),
  maximumRulesBytes: positiveInteger(
    'ASSET_DELIVERY_YARAX_MAXIMUM_RULES_BYTES',
    4 * 1024 * 1024
  ),
  maximumRulesAgeMs:
    positiveInteger('ASSET_DELIVERY_YARAX_MAXIMUM_RULES_AGE_HOURS', 30 * 24) *
    60 *
    60 *
    1_000,
  maximumFutureSkewMs:
    positiveInteger('ASSET_DELIVERY_YARAX_MAXIMUM_FUTURE_SKEW_SECONDS', 300) *
    1_000,
  maximumConcurrentScans: positiveInteger(
    'ASSET_DELIVERY_YARAX_MAXIMUM_CONCURRENT',
    4
  ),
  readinessCacheMs:
    positiveInteger('ASSET_DELIVERY_YARAX_READINESS_CACHE_SECONDS', 30) * 1_000,
});
const scannerRuntime = createRequiredAssetDeliveryScannerRuntime({
  primary: clamAvScannerRuntime,
  required: [yaraXScannerRuntime],
});
await scannerRuntime.acquire();
const maximumTotalBytes = positiveInteger(
  'ASSET_DELIVERY_MAXIMUM_TOTAL_BYTES',
  256 * 1024 * 1024
);
configureSharpRasterRuntime({
  concurrency: positiveInteger('ASSET_DELIVERY_RASTER_THREADS', 2),
  cacheMemoryMegabytes: positiveInteger(
    'ASSET_DELIVERY_RASTER_CACHE_MEMORY_MIB',
    64
  ),
  cacheItems: positiveInteger('ASSET_DELIVERY_RASTER_CACHE_ITEMS', 64),
});
const rasterTransformers = createSharpRasterReencodeTransformers({
  maximumConcurrentTransforms: positiveInteger(
    'ASSET_DELIVERY_RASTER_MAXIMUM_CONCURRENT',
    2
  ),
  timeoutSeconds: positiveInteger('ASSET_DELIVERY_RASTER_TIMEOUT_SECONDS', 15),
});
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
    ...rasterTransformers,
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
