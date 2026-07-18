import {
  createBinaryAssetJpegStructuralScanner,
  createBinaryAssetPngStructuralScanner,
  createBinaryAssetScannerChain,
  createBinaryAssetScannerFailoverPool,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';
import { createClamAvContentScanner } from './clamAvContentScanner';

export const ASSET_DELIVERY_SCANNED_MEDIA_TYPES = Object.freeze([
  'application/gzip',
  'application/javascript',
  'application/json',
  'application/octet-stream',
  'application/pdf',
  'application/wasm',
  'application/xhtml+xml',
  'application/xml',
  'application/zip',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'text/css',
  'text/html',
  'text/javascript',
  'text/plain',
  'text/xml',
] as const);

export const ASSET_DELIVERY_PNG_SCANNER_POLICY_ID =
  'prodivix.scanner.png-delivery-policy' as const;

export const ASSET_DELIVERY_JPEG_SCANNER_POLICY_ID =
  'prodivix.scanner.jpeg-delivery-policy' as const;

export const ASSET_DELIVERY_BINARY_SCANNER_POLICY_ID =
  'prodivix.scanner.binary-delivery-policy' as const;

export type AssetDeliveryMalwareEngineConfiguration = Readonly<{
  id: string;
  replicas: readonly Readonly<{
    id: string;
    host: string;
    port: number;
  }>[];
}>;

export const createAssetDeliveryScannerPolicy = (options: {
  malwareEngines: readonly AssetDeliveryMalwareEngineConfiguration[];
  clamAvTimeoutMs: number;
  policyVersion: string;
  clamAvChunkBytes?: number;
  clamAvMaximumResponseBytes?: number;
}): readonly BinaryAssetContentScanner[] => {
  if (
    !Array.isArray(options.malwareEngines) ||
    options.malwareEngines.length < 1 ||
    options.malwareEngines.length > 8
  ) {
    throw new TypeError('Asset delivery malware engine policy is invalid.');
  }
  const engineScanner = (
    engine: AssetDeliveryMalwareEngineConfiguration,
    supportedMediaTypes: readonly string[]
  ): BinaryAssetContentScanner =>
    createBinaryAssetScannerFailoverPool({
      id: `prodivix.scanner.malware-engine.${engine.id}`,
      version: options.policyVersion,
      supportedMediaTypes,
      replicas: engine.replicas.map((replica) => ({
        replicaId: replica.id,
        scanner: createClamAvContentScanner({
          host: replica.host,
          port: replica.port,
          timeoutMs: options.clamAvTimeoutMs,
          policyVersion: options.policyVersion,
          supportedMediaTypes,
          chunkBytes: options.clamAvChunkBytes,
          maximumResponseBytes: options.clamAvMaximumResponseBytes,
        }),
      })),
    });
  const nonImageTransformMediaTypes = ASSET_DELIVERY_SCANNED_MEDIA_TYPES.filter(
    (mediaType) => mediaType !== 'image/png' && mediaType !== 'image/jpeg'
  );
  const pngPolicy = createBinaryAssetScannerChain({
    id: ASSET_DELIVERY_PNG_SCANNER_POLICY_ID,
    version: options.policyVersion,
    supportedMediaTypes: ['image/png'],
    scanners: [
      createBinaryAssetPngStructuralScanner(),
      ...options.malwareEngines.map((engine) =>
        engineScanner(engine, ['image/png'])
      ),
    ],
  });
  const jpegPolicy = createBinaryAssetScannerChain({
    id: ASSET_DELIVERY_JPEG_SCANNER_POLICY_ID,
    version: options.policyVersion,
    supportedMediaTypes: ['image/jpeg'],
    scanners: [
      createBinaryAssetJpegStructuralScanner(),
      ...options.malwareEngines.map((engine) =>
        engineScanner(engine, ['image/jpeg'])
      ),
    ],
  });
  const binaryPolicy = createBinaryAssetScannerChain({
    id: ASSET_DELIVERY_BINARY_SCANNER_POLICY_ID,
    version: options.policyVersion,
    supportedMediaTypes: nonImageTransformMediaTypes,
    scanners: options.malwareEngines.map((engine) =>
      engineScanner(engine, nonImageTransformMediaTypes)
    ),
  });
  return Object.freeze([pngPolicy, jpegPolicy, binaryPolicy]);
};
