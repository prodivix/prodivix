import {
  readBinaryAssetContentScannerDescriptor,
  type BinaryAssetContentScanner,
} from '@prodivix/assets';

export type AssetDeliveryScannerSnapshot = Readonly<{
  generation: number;
  policyVersion: string;
  scanners: readonly BinaryAssetContentScanner[];
}>;

export type AssetDeliveryScannerRuntime = Readonly<{
  acquire(): Promise<AssetDeliveryScannerSnapshot>;
}>;

const normalizeGeneration = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('Asset delivery scanner generation is invalid.');
  }
  return value;
};

/** Freezes one request-safe scanner generation with unique media ownership. */
export const createAssetDeliveryScannerSnapshot = (input: {
  generation: number;
  policyVersion: string;
  scanners: readonly BinaryAssetContentScanner[];
}): AssetDeliveryScannerSnapshot => {
  const generation = normalizeGeneration(input.generation);
  const policyVersion = input.policyVersion.trim();
  if (!policyVersion || policyVersion.length > 256) {
    throw new TypeError('Asset delivery scanner policy version is invalid.');
  }
  if (!Array.isArray(input.scanners) || input.scanners.length < 1) {
    throw new TypeError('At least one asset delivery scanner is required.');
  }
  const scanners = input.scanners.map((scanner) => {
    const descriptor = readBinaryAssetContentScannerDescriptor(
      scanner.descriptor
    );
    if (descriptor.version !== policyVersion) {
      throw new TypeError(
        'Asset delivery scanners must share their snapshot policy version.'
      );
    }
    return Object.freeze({
      descriptor,
      scan: scanner.scan.bind(scanner),
    });
  });
  const coveredMediaTypes = new Set<string>();
  for (const scanner of scanners) {
    for (const mediaType of scanner.descriptor.supportedMediaTypes) {
      if (coveredMediaTypes.has(mediaType)) {
        throw new TypeError(
          'Asset delivery scanner media coverage must be unique.'
        );
      }
      coveredMediaTypes.add(mediaType);
    }
  }
  return Object.freeze({
    generation,
    policyVersion,
    scanners: Object.freeze(scanners),
  });
};

/** Adapts the original fixed scanner/readiness composition to the snapshot port. */
export const createStaticAssetDeliveryScannerRuntime = (input: {
  scanners: readonly BinaryAssetContentScanner[];
  readiness: Readonly<{ assertReady(): Promise<unknown> }>;
}): AssetDeliveryScannerRuntime => {
  if (typeof input.readiness?.assertReady !== 'function') {
    throw new TypeError('Asset delivery scanner readiness is required.');
  }
  const policyVersions = [
    ...new Set(input.scanners.map((scanner) => scanner.descriptor.version)),
  ];
  if (policyVersions.length !== 1) {
    throw new TypeError(
      'Asset delivery scanners must share one static policy version.'
    );
  }
  const snapshot = createAssetDeliveryScannerSnapshot({
    generation: 1,
    policyVersion: policyVersions[0] as string,
    scanners: input.scanners,
  });
  return Object.freeze({
    async acquire() {
      await input.readiness.assertReady();
      return snapshot;
    },
  });
};
