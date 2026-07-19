import {
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  createBinaryAssetTransformRecipe,
  normalizeBinaryAssetMediaType,
  readBinaryAssetBlobReference,
  readBinaryAssetTransformRecipe,
} from './binaryAsset';
import {
  BINARY_ASSET_LIMITS,
  BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_ID,
  BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_VERSION,
  BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID,
  BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_VERSION,
  BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_ID,
  BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_VERSION,
  BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_ID,
  BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_VERSION,
  BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID,
  BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_VERSION,
  BINARY_ASSET_PNG_STRUCTURAL_SCANNER_ID,
  BINARY_ASSET_PNG_STRUCTURAL_SCANNER_VERSION,
  BINARY_ASSET_SCAN_ATTESTATION_FORMAT,
  type BinaryAssetContentScanner,
  type BinaryAssetContentScannerDescriptor,
  type BinaryAssetDerivedCache,
  type BinaryAssetDerivedMaterialization,
  type BinaryAssetImageMetadata,
  type BinaryAssetMaterialization,
  type BinaryAssetScanAttestation,
  type BinaryAssetScanResult,
  type BinaryAssetScanVerdict,
  type BinaryAssetTransformPipelineResult,
  type BinaryAssetTransformRecipe,
  type BinaryAssetTransformer,
  type BinaryAssetTransformerDescriptor,
} from './binaryAsset.types';
import {
  BinaryAssetJpegValidationError,
  sanitizeBinaryAssetJpeg,
} from './jpegAsset';
import {
  BinaryAssetPngValidationError,
  sanitizeBinaryAssetPng,
} from './pngAsset';

const IDENTITY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const FINDING_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  return (
    actual.length === normalizedExpected.length &&
    actual.every((key, index) => key === normalizedExpected[index])
  );
};

const normalizeIdentity = (
  value: string,
  label: string,
  pattern: RegExp
): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > BINARY_ASSET_LIMITS.maxIdentityLength ||
    !pattern.test(normalized)
  ) {
    throw new TypeError(`Binary asset ${label} is invalid.`);
  }
  return normalized;
};

const normalizeMediaTypes = (values: readonly string[]): readonly string[] => {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new TypeError('Binary asset media type capability is invalid.');
  }
  const normalized = [
    ...new Set(values.map(normalizeBinaryAssetMediaType)),
  ].sort();
  if (
    normalized.length !== values.length ||
    normalized.some((mediaType, index) => mediaType !== values[index])
  ) {
    throw new TypeError(
      'Binary asset media type capability must be canonical.'
    );
  }
  return Object.freeze(normalized);
};

const readTransformerDescriptor = (
  value: BinaryAssetTransformerDescriptor
): BinaryAssetTransformerDescriptor =>
  Object.freeze({
    id: normalizeIdentity(value.id, 'transformer id', IDENTITY_PATTERN),
    version: normalizeIdentity(
      value.version,
      'transformer version',
      VERSION_PATTERN
    ),
    inputMediaTypes: normalizeMediaTypes(value.inputMediaTypes),
    outputMediaTypes: normalizeMediaTypes(value.outputMediaTypes),
  });

export const readBinaryAssetContentScannerDescriptor = (
  value: BinaryAssetContentScannerDescriptor
): BinaryAssetContentScannerDescriptor =>
  Object.freeze({
    id: normalizeIdentity(value.id, 'scanner id', IDENTITY_PATTERN),
    version: normalizeIdentity(
      value.version,
      'scanner version',
      VERSION_PATTERN
    ),
    supportedMediaTypes: normalizeMediaTypes(value.supportedMediaTypes),
  });

const normalizeFindingCodes = (
  verdict: BinaryAssetScanVerdict,
  values: readonly string[]
): readonly string[] => {
  if (
    !Array.isArray(values) ||
    values.length > BINARY_ASSET_LIMITS.maxScanFindings
  ) {
    throw new TypeError('Binary asset scan findings exceed limits.');
  }
  const normalized = [...new Set(values.map((value) => value.trim()))].sort();
  if (
    normalized.length !== values.length ||
    normalized.some(
      (value, index) =>
        value !== values[index] ||
        value.length > BINARY_ASSET_LIMITS.maxScanFindingCodeLength ||
        !FINDING_CODE_PATTERN.test(value)
    ) ||
    (verdict === 'clean' && normalized.length !== 0) ||
    (verdict === 'quarantined' && normalized.length === 0)
  ) {
    throw new TypeError('Binary asset scan findings are invalid.');
  }
  return Object.freeze(normalized);
};

export const createBinaryAssetScanAttestation = (input: {
  subjectDigest: string;
  scannerId: string;
  scannerVersion: string;
  verdict: BinaryAssetScanVerdict;
  findingCodes: readonly string[];
}): BinaryAssetScanAttestation => {
  readBinaryAssetBlobReference({
    kind: 'workspace-blob',
    digest: input.subjectDigest,
    byteLength: 0,
    mediaType: 'application/octet-stream',
  });
  if (input.verdict !== 'clean' && input.verdict !== 'quarantined') {
    throw new TypeError('Binary asset scan verdict is invalid.');
  }
  return Object.freeze({
    format: BINARY_ASSET_SCAN_ATTESTATION_FORMAT,
    subjectDigest: input.subjectDigest,
    scannerId: normalizeIdentity(
      input.scannerId,
      'scanner id',
      IDENTITY_PATTERN
    ),
    scannerVersion: normalizeIdentity(
      input.scannerVersion,
      'scanner version',
      VERSION_PATTERN
    ),
    verdict: input.verdict,
    findingCodes: normalizeFindingCodes(input.verdict, input.findingCodes),
  });
};

export const readBinaryAssetScanAttestation = (
  value: unknown
): BinaryAssetScanAttestation => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'format',
      'subjectDigest',
      'scannerId',
      'scannerVersion',
      'verdict',
      'findingCodes',
    ]) ||
    value.format !== BINARY_ASSET_SCAN_ATTESTATION_FORMAT ||
    typeof value.subjectDigest !== 'string' ||
    typeof value.scannerId !== 'string' ||
    typeof value.scannerVersion !== 'string' ||
    (value.verdict !== 'clean' && value.verdict !== 'quarantined') ||
    !Array.isArray(value.findingCodes) ||
    value.findingCodes.some((entry) => typeof entry !== 'string')
  ) {
    throw new TypeError('Binary asset scan attestation is invalid.');
  }
  return createBinaryAssetScanAttestation({
    subjectDigest: value.subjectDigest,
    scannerId: value.scannerId,
    scannerVersion: value.scannerVersion,
    verdict: value.verdict,
    findingCodes: value.findingCodes as string[],
  });
};

export class BinaryAssetQuarantinedError extends Error {
  readonly attestation: BinaryAssetScanAttestation;

  constructor(attestation: BinaryAssetScanAttestation) {
    super('Binary asset was quarantined by content policy.');
    this.name = 'BinaryAssetQuarantinedError';
    this.attestation = attestation;
  }
}

export type BinaryAssetScannerUnavailableReason =
  | 'configuration'
  | 'connection'
  | 'daemon-error'
  | 'policy-drift'
  | 'protocol'
  | 'replicas-exhausted'
  | 'stale-database'
  | 'timeout';

/** Carries only a bounded reason code so scanner infrastructure details never enter delivery responses. */
export class BinaryAssetScannerUnavailableError extends Error {
  readonly reason: BinaryAssetScannerUnavailableReason;

  constructor(reason: BinaryAssetScannerUnavailableReason) {
    super('Binary asset content scanner is unavailable.');
    this.name = 'BinaryAssetScannerUnavailableError';
    this.reason = reason;
  }
}

const REPLICA_FAILOVER_REASONS: ReadonlySet<BinaryAssetScannerUnavailableReason> =
  new Set(['connection', 'daemon-error', 'protocol', 'timeout']);

/** Composes independent scanners into one versioned fail-closed policy identity. */
export const createBinaryAssetScannerChain = (input: {
  id: string;
  version: string;
  supportedMediaTypes: readonly string[];
  scanners: readonly BinaryAssetContentScanner[];
}): BinaryAssetContentScanner => {
  const descriptor = readBinaryAssetContentScannerDescriptor({
    id: input.id,
    version: input.version,
    supportedMediaTypes: input.supportedMediaTypes,
  });
  if (
    !Array.isArray(input.scanners) ||
    input.scanners.length < 1 ||
    input.scanners.length > 16
  ) {
    throw new TypeError('Binary asset scanner chain is invalid.');
  }
  const scanners = input.scanners.map((scanner) =>
    Object.freeze({
      scanner,
      descriptor: readBinaryAssetContentScannerDescriptor(scanner.descriptor),
    })
  );
  if (
    new Set(scanners.map((entry) => entry.descriptor.id)).size !==
      scanners.length ||
    scanners.some((entry) =>
      descriptor.supportedMediaTypes.some(
        (mediaType) => !entry.descriptor.supportedMediaTypes.includes(mediaType)
      )
    )
  ) {
    throw new TypeError(
      'Binary asset scanner chain members do not cover its policy.'
    );
  }

  return Object.freeze({
    descriptor,
    async scan(request) {
      const materialization = createBinaryAssetMaterialization({
        assetDocumentId: 'binary-asset-scanner-chain',
        reference: request.reference,
        contents: request.contents,
      });
      if (
        !descriptor.supportedMediaTypes.includes(
          materialization.reference.mediaType
        )
      ) {
        throw new BinaryAssetScannerUnavailableError('configuration');
      }
      const findingCodes = new Set<string>();
      for (const entry of scanners) {
        const result = await entry.scanner.scan({
          reference: materialization.reference,
          contents: new Uint8Array(materialization.contents),
        });
        const attestation = createBinaryAssetScanAttestation({
          subjectDigest: materialization.reference.digest,
          scannerId: entry.descriptor.id,
          scannerVersion: entry.descriptor.version,
          verdict: result.verdict,
          findingCodes: result.findingCodes,
        });
        for (const findingCode of attestation.findingCodes) {
          findingCodes.add(findingCode);
        }
      }
      const normalizedFindingCodes = [...findingCodes].sort();
      const attestation = createBinaryAssetScanAttestation({
        subjectDigest: materialization.reference.digest,
        scannerId: descriptor.id,
        scannerVersion: descriptor.version,
        verdict: normalizedFindingCodes.length === 0 ? 'clean' : 'quarantined',
        findingCodes: normalizedFindingCodes,
      });
      return Object.freeze({
        verdict: attestation.verdict,
        findingCodes: attestation.findingCodes,
      });
    },
  });
};

/**
 * Gives one logical scanner deterministic infrastructure failover without
 * weakening a quarantine verdict into a later clean result.
 */
export const createBinaryAssetScannerFailoverPool = (input: {
  id: string;
  version: string;
  supportedMediaTypes: readonly string[];
  replicas: readonly Readonly<{
    replicaId: string;
    scanner: BinaryAssetContentScanner;
  }>[];
}): BinaryAssetContentScanner => {
  const descriptor = readBinaryAssetContentScannerDescriptor({
    id: input.id,
    version: input.version,
    supportedMediaTypes: input.supportedMediaTypes,
  });
  if (
    !Array.isArray(input.replicas) ||
    input.replicas.length < 1 ||
    input.replicas.length > 16
  ) {
    throw new TypeError('Binary asset scanner replica pool is invalid.');
  }
  const replicas = input.replicas.map((entry) =>
    Object.freeze({
      replicaId: normalizeIdentity(
        entry.replicaId,
        'scanner replica id',
        IDENTITY_PATTERN
      ),
      scanner: entry.scanner,
      descriptor: readBinaryAssetContentScannerDescriptor(
        entry.scanner.descriptor
      ),
    })
  );
  if (
    new Set(replicas.map((entry) => entry.replicaId)).size !==
      replicas.length ||
    replicas.some((entry) =>
      descriptor.supportedMediaTypes.some(
        (mediaType) => !entry.descriptor.supportedMediaTypes.includes(mediaType)
      )
    )
  ) {
    throw new TypeError(
      'Binary asset scanner replicas do not cover their logical policy.'
    );
  }

  return Object.freeze({
    descriptor,
    async scan(request) {
      const materialization = createBinaryAssetMaterialization({
        assetDocumentId: 'binary-asset-scanner-failover',
        reference: request.reference,
        contents: request.contents,
      });
      if (
        !descriptor.supportedMediaTypes.includes(
          materialization.reference.mediaType
        )
      ) {
        throw new BinaryAssetScannerUnavailableError('configuration');
      }
      for (const entry of replicas) {
        try {
          const result = await entry.scanner.scan({
            reference: materialization.reference,
            contents: new Uint8Array(materialization.contents),
          });
          const attestation = createBinaryAssetScanAttestation({
            subjectDigest: materialization.reference.digest,
            scannerId: entry.descriptor.id,
            scannerVersion: entry.descriptor.version,
            verdict: result.verdict,
            findingCodes: result.findingCodes,
          });
          return Object.freeze({
            verdict: attestation.verdict,
            findingCodes: attestation.findingCodes,
          });
        } catch (error) {
          if (
            error instanceof BinaryAssetScannerUnavailableError &&
            REPLICA_FAILOVER_REASONS.has(error.reason)
          ) {
            continue;
          }
          throw error;
        }
      }
      throw new BinaryAssetScannerUnavailableError('replicas-exhausted');
    },
  });
};

export class BinaryAssetDerivedCacheConflictError extends Error {
  constructor() {
    super('Binary asset derived cache identity conflicts with stored output.');
    this.name = 'BinaryAssetDerivedCacheConflictError';
  }
}

const readImageMetadata = (value: unknown): BinaryAssetImageMetadata | null => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !exactKeys(value, ['width', 'height']) ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width > BINARY_ASSET_LIMITS.maxImageWidth ||
    value.height > BINARY_ASSET_LIMITS.maxImageHeight ||
    value.width * value.height > BINARY_ASSET_LIMITS.maxImagePixels
  ) {
    throw new TypeError('Binary asset derived image metadata is invalid.');
  }
  return Object.freeze({ width: value.width, height: value.height });
};

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((byte, index) => byte === right[index]);

const validateDerivedMaterialization = (
  value: BinaryAssetDerivedMaterialization,
  expectedRecipe?: BinaryAssetTransformRecipe
): BinaryAssetDerivedMaterialization => {
  const recipe = readBinaryAssetTransformRecipe(value.recipe);
  if (expectedRecipe && recipe.recipeDigest !== expectedRecipe.recipeDigest) {
    throw new BinaryAssetDerivedCacheConflictError();
  }
  const materialization = createBinaryAssetMaterialization({
    assetDocumentId: value.materialization.assetDocumentId,
    reference: value.materialization.reference,
    contents: value.materialization.contents,
  });
  if (materialization.reference.mediaType !== recipe.outputMediaType) {
    throw new TypeError('Binary asset derived media type drifted.');
  }
  const scan = readBinaryAssetScanAttestation(value.scan);
  if (
    scan.subjectDigest !== materialization.reference.digest ||
    scan.verdict !== 'clean'
  ) {
    throw new TypeError('Binary asset derived scan attestation drifted.');
  }
  let metadata = readImageMetadata(value.metadata);
  if (recipe.outputMediaType === 'image/png') {
    const inspected = sanitizeBinaryAssetPng(materialization.contents);
    if (!equalBytes(inspected.contents, materialization.contents)) {
      throw new TypeError('Binary asset derived PNG is not canonical.');
    }
    if (
      !metadata ||
      metadata.width !== inspected.metadata.width ||
      metadata.height !== inspected.metadata.height
    ) {
      throw new TypeError('Binary asset derived PNG metadata drifted.');
    }
    metadata = inspected.metadata;
  } else if (recipe.outputMediaType === 'image/jpeg') {
    const inspected = sanitizeBinaryAssetJpeg(materialization.contents);
    if (!equalBytes(inspected.contents, materialization.contents)) {
      throw new TypeError('Binary asset derived JPEG is not canonical.');
    }
    if (
      !metadata ||
      metadata.width !== inspected.metadata.width ||
      metadata.height !== inspected.metadata.height
    ) {
      throw new TypeError('Binary asset derived JPEG metadata drifted.');
    }
    metadata = inspected.metadata;
  } else if (recipe.outputMediaType.startsWith('image/')) {
    throw new TypeError('Binary asset derived image format is unsupported.');
  } else if (metadata) {
    throw new TypeError(
      'Binary asset non-image output cannot carry dimensions.'
    );
  }
  return Object.freeze({ recipe, materialization, metadata, scan });
};

const cloneDerivedMaterialization = (
  value: BinaryAssetDerivedMaterialization
): BinaryAssetDerivedMaterialization =>
  validateDerivedMaterialization({
    recipe: value.recipe,
    materialization: {
      assetDocumentId: value.materialization.assetDocumentId,
      reference: value.materialization.reference,
      contents: new Uint8Array(value.materialization.contents),
    },
    metadata: value.metadata,
    scan: value.scan,
  });

export const createInMemoryBinaryAssetDerivedCache = (options: {
  maximumEntries: number;
  maximumTotalBytes: number;
}): BinaryAssetDerivedCache & {
  inspect(): Readonly<{ entries: number; totalBytes: number }>;
} => {
  if (
    !Number.isSafeInteger(options.maximumEntries) ||
    options.maximumEntries < 1 ||
    !Number.isSafeInteger(options.maximumTotalBytes) ||
    options.maximumTotalBytes < 1
  ) {
    throw new TypeError('Binary asset derived cache limits are invalid.');
  }
  const values = new Map<string, BinaryAssetDerivedMaterialization>();
  let totalBytes = 0;
  const removeOldest = (): void => {
    const recipeDigest = values.keys().next().value as string | undefined;
    if (!recipeDigest) return;
    const existing = values.get(recipeDigest);
    values.delete(recipeDigest);
    totalBytes -= existing?.materialization.contents.byteLength ?? 0;
  };
  return Object.freeze({
    async get(recipeDigest: string) {
      const existing = values.get(recipeDigest);
      if (!existing) return undefined;
      values.delete(recipeDigest);
      values.set(recipeDigest, existing);
      return cloneDerivedMaterialization(existing);
    },
    async put(value: BinaryAssetDerivedMaterialization) {
      const normalized = cloneDerivedMaterialization(value);
      const recipeDigest = normalized.recipe.recipeDigest;
      const existing = values.get(recipeDigest);
      if (existing) {
        if (
          existing.materialization.reference.digest !==
          normalized.materialization.reference.digest
        ) {
          throw new BinaryAssetDerivedCacheConflictError();
        }
        values.delete(recipeDigest);
        values.set(recipeDigest, normalized);
        return;
      }
      const byteLength = normalized.materialization.contents.byteLength;
      if (byteLength > options.maximumTotalBytes) return;
      while (
        values.size >= options.maximumEntries ||
        byteLength > options.maximumTotalBytes - totalBytes
      ) {
        removeOldest();
      }
      values.set(recipeDigest, normalized);
      totalBytes += byteLength;
    },
    inspect() {
      return Object.freeze({ entries: values.size, totalBytes });
    },
  });
};

const scanDerivedOutput = async (
  scanner: BinaryAssetContentScanner,
  materialization: BinaryAssetMaterialization
): Promise<BinaryAssetScanAttestation> => {
  const descriptor = readBinaryAssetContentScannerDescriptor(
    scanner.descriptor
  );
  if (
    !descriptor.supportedMediaTypes.includes(
      materialization.reference.mediaType
    )
  ) {
    throw new TypeError(
      'Binary asset scanner does not support output media type.'
    );
  }
  const result: BinaryAssetScanResult = await scanner.scan({
    reference: materialization.reference,
    contents: new Uint8Array(materialization.contents),
  });
  const attestation = createBinaryAssetScanAttestation({
    subjectDigest: materialization.reference.digest,
    scannerId: descriptor.id,
    scannerVersion: descriptor.version,
    verdict: result.verdict,
    findingCodes: result.findingCodes,
  });
  if (attestation.verdict !== 'clean') {
    throw new BinaryAssetQuarantinedError(attestation);
  }
  return attestation;
};

/** Runs transformer, byte verification, image policy, scanner, and derived cache as one fail-closed unit. */
export const executeBinaryAssetTransformPipeline = async (input: {
  source: BinaryAssetMaterialization;
  recipe: BinaryAssetTransformRecipe;
  transformer: BinaryAssetTransformer;
  scanner: BinaryAssetContentScanner;
  cache?: BinaryAssetDerivedCache;
}): Promise<BinaryAssetTransformPipelineResult> => {
  const source = createBinaryAssetMaterialization({
    assetDocumentId: input.source.assetDocumentId,
    reference: input.source.reference,
    contents: input.source.contents,
  });
  const recipe = readBinaryAssetTransformRecipe(input.recipe);
  if (recipe.sourceDigest !== source.reference.digest) {
    throw new TypeError('Binary asset transform source digest drifted.');
  }
  const descriptor = readTransformerDescriptor(input.transformer.descriptor);
  if (
    recipe.transformerId !== descriptor.id ||
    recipe.transformerVersion !== descriptor.version ||
    !descriptor.inputMediaTypes.includes(source.reference.mediaType) ||
    !descriptor.outputMediaTypes.includes(recipe.outputMediaType)
  ) {
    throw new TypeError(
      'Binary asset transformer capability does not match recipe.'
    );
  }
  const scannerDescriptor = readBinaryAssetContentScannerDescriptor(
    input.scanner.descriptor
  );
  if (!scannerDescriptor.supportedMediaTypes.includes(recipe.outputMediaType)) {
    throw new TypeError(
      'Binary asset scanner does not support output media type.'
    );
  }
  const cached = await input.cache?.get(recipe.recipeDigest);
  if (cached) {
    const normalized = validateDerivedMaterialization(cached, recipe);
    if (
      normalized.scan.scannerId !== scannerDescriptor.id ||
      normalized.scan.scannerVersion !== scannerDescriptor.version
    ) {
      const scan = await scanDerivedOutput(
        input.scanner,
        normalized.materialization
      );
      const rescanned = validateDerivedMaterialization({
        ...normalized,
        scan,
      });
      await input.cache?.put(rescanned);
      return Object.freeze({ kind: 'cache-hit', derived: rescanned });
    }
    return Object.freeze({
      kind: 'cache-hit',
      derived: normalized,
    });
  }

  const transformed = await input.transformer.transform({ recipe, source });
  if (!(transformed.contents instanceof Uint8Array)) {
    throw new TypeError('Binary asset transformer must return bytes.');
  }
  const mediaType = normalizeBinaryAssetMediaType(transformed.mediaType);
  if (mediaType !== recipe.outputMediaType) {
    throw new TypeError('Binary asset transformer output media type drifted.');
  }
  const reference = createBinaryAssetBlobReference({
    contents: transformed.contents,
    mediaType,
  });
  const materialization = createBinaryAssetMaterialization({
    assetDocumentId: source.assetDocumentId,
    reference,
    contents: transformed.contents,
  });
  let metadata: BinaryAssetImageMetadata | null = null;
  if (mediaType === 'image/png') {
    const inspected = sanitizeBinaryAssetPng(materialization.contents);
    if (!equalBytes(inspected.contents, materialization.contents)) {
      throw new TypeError(
        'Binary asset transformer returned a non-canonical PNG.'
      );
    }
    metadata = inspected.metadata;
  } else if (mediaType === 'image/jpeg') {
    const inspected = sanitizeBinaryAssetJpeg(materialization.contents);
    if (!equalBytes(inspected.contents, materialization.contents)) {
      throw new TypeError(
        'Binary asset transformer returned a non-canonical JPEG.'
      );
    }
    metadata = inspected.metadata;
  } else if (mediaType.startsWith('image/')) {
    throw new TypeError(
      'Binary asset transformer output format is unsupported.'
    );
  }
  const scan = await scanDerivedOutput(input.scanner, materialization);
  const derived = validateDerivedMaterialization({
    recipe,
    materialization,
    metadata,
    scan,
  });
  await input.cache?.put(derived);
  return Object.freeze({ kind: 'transformed', derived });
};

const pngSanitizeParameters = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, ['stripAncillaryMetadata']) &&
  value.stripAncillaryMetadata === true;

export const createBinaryAssetPngSanitizeRecipe = (
  sourceDigest: string
): BinaryAssetTransformRecipe =>
  createBinaryAssetTransformRecipe({
    sourceDigest,
    transformerId: BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_ID,
    transformerVersion: BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_VERSION,
    outputMediaType: 'image/png',
    parameters: { stripAncillaryMetadata: true },
  });

/** Canonical full-decode PNG recipe. The concrete decoder remains deployment-owned. */
export const createBinaryAssetPngRasterReencodeRecipe = (
  sourceDigest: string
): BinaryAssetTransformRecipe =>
  createBinaryAssetTransformRecipe({
    sourceDigest,
    transformerId: BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID,
    transformerVersion: BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_VERSION,
    outputMediaType: 'image/png',
    parameters: {
      autoOrient: true,
      colorSpace: 'srgb',
      compressionLevel: 9,
      stripMetadata: true,
    },
  });

export const createBinaryAssetPngSanitizeTransformer =
  (): BinaryAssetTransformer =>
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_ID,
        version: BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_VERSION,
        inputMediaTypes: Object.freeze(['image/png']),
        outputMediaTypes: Object.freeze(['image/png']),
      }),
      async transform(request) {
        if (
          request.recipe.transformerId !==
            BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_ID ||
          request.recipe.transformerVersion !==
            BINARY_ASSET_PNG_SANITIZE_TRANSFORMER_VERSION ||
          request.recipe.outputMediaType !== 'image/png' ||
          request.source.reference.mediaType !== 'image/png' ||
          !pngSanitizeParameters(request.recipe.parameters)
        ) {
          throw new TypeError('PNG sanitize transform request is invalid.');
        }
        const sanitized = sanitizeBinaryAssetPng(request.source.contents);
        return Object.freeze({
          mediaType: 'image/png',
          contents: sanitized.contents,
        });
      },
    });

export const createBinaryAssetPngStructuralScanner =
  (): BinaryAssetContentScanner =>
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_PNG_STRUCTURAL_SCANNER_ID,
        version: BINARY_ASSET_PNG_STRUCTURAL_SCANNER_VERSION,
        supportedMediaTypes: Object.freeze(['image/png']),
      }),
      async scan(request) {
        try {
          const reference = createBinaryAssetBlobReference({
            contents: request.contents,
            mediaType: request.reference.mediaType,
          });
          if (
            request.reference.mediaType !== 'image/png' ||
            reference.digest !== request.reference.digest ||
            reference.byteLength !== request.reference.byteLength
          ) {
            return Object.freeze({
              verdict: 'quarantined' as const,
              findingCodes: Object.freeze(['AST-SCAN-PNG-IDENTITY']),
            });
          }
          const sanitized = sanitizeBinaryAssetPng(request.contents);
          if (!equalBytes(sanitized.contents, request.contents)) {
            return Object.freeze({
              verdict: 'quarantined' as const,
              findingCodes: Object.freeze(['AST-SCAN-PNG-NONCANONICAL']),
            });
          }
          return Object.freeze({
            verdict: 'clean' as const,
            findingCodes: Object.freeze([]),
          });
        } catch (error) {
          if (!(error instanceof BinaryAssetPngValidationError)) throw error;
          return Object.freeze({
            verdict: 'quarantined' as const,
            findingCodes: Object.freeze(['AST-SCAN-PNG-INVALID']),
          });
        }
      },
    });

const jpegSanitizeParameters = (value: unknown): boolean =>
  isRecord(value) &&
  exactKeys(value, [
    'coding',
    'requiredOrientation',
    'stripApplicationMetadata',
  ]) &&
  value.coding === 'baseline-huffman' &&
  value.requiredOrientation === 1 &&
  value.stripApplicationMetadata === true;

export const createBinaryAssetJpegSanitizeRecipe = (
  sourceDigest: string
): BinaryAssetTransformRecipe =>
  createBinaryAssetTransformRecipe({
    sourceDigest,
    transformerId: BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_ID,
    transformerVersion: BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_VERSION,
    outputMediaType: 'image/jpeg',
    parameters: {
      coding: 'baseline-huffman',
      requiredOrientation: 1,
      stripApplicationMetadata: true,
    },
  });

/** Canonical full-decode baseline JPEG recipe. The concrete decoder remains deployment-owned. */
export const createBinaryAssetJpegRasterReencodeRecipe = (
  sourceDigest: string
): BinaryAssetTransformRecipe =>
  createBinaryAssetTransformRecipe({
    sourceDigest,
    transformerId: BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID,
    transformerVersion: BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_VERSION,
    outputMediaType: 'image/jpeg',
    parameters: {
      autoOrient: true,
      chromaSubsampling: '4:4:4',
      colorSpace: 'srgb',
      optimizeCoding: true,
      progressive: false,
      quality: 90,
      stripMetadata: true,
    },
  });

export const createBinaryAssetJpegSanitizeTransformer =
  (): BinaryAssetTransformer =>
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_ID,
        version: BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_VERSION,
        inputMediaTypes: Object.freeze(['image/jpeg']),
        outputMediaTypes: Object.freeze(['image/jpeg']),
      }),
      async transform(request) {
        if (
          request.recipe.transformerId !==
            BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_ID ||
          request.recipe.transformerVersion !==
            BINARY_ASSET_JPEG_SANITIZE_TRANSFORMER_VERSION ||
          request.recipe.outputMediaType !== 'image/jpeg' ||
          request.source.reference.mediaType !== 'image/jpeg' ||
          !jpegSanitizeParameters(request.recipe.parameters)
        ) {
          throw new TypeError('JPEG sanitize transform request is invalid.');
        }
        const sanitized = sanitizeBinaryAssetJpeg(request.source.contents);
        return Object.freeze({
          mediaType: 'image/jpeg',
          contents: sanitized.contents,
        });
      },
    });

export const createBinaryAssetJpegStructuralScanner =
  (): BinaryAssetContentScanner =>
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_ID,
        version: BINARY_ASSET_JPEG_STRUCTURAL_SCANNER_VERSION,
        supportedMediaTypes: Object.freeze(['image/jpeg']),
      }),
      async scan(request) {
        try {
          const reference = createBinaryAssetBlobReference({
            contents: request.contents,
            mediaType: request.reference.mediaType,
          });
          if (
            request.reference.mediaType !== 'image/jpeg' ||
            reference.digest !== request.reference.digest ||
            reference.byteLength !== request.reference.byteLength
          ) {
            return Object.freeze({
              verdict: 'quarantined' as const,
              findingCodes: Object.freeze(['AST-SCAN-JPEG-IDENTITY']),
            });
          }
          const sanitized = sanitizeBinaryAssetJpeg(request.contents);
          if (!equalBytes(sanitized.contents, request.contents)) {
            return Object.freeze({
              verdict: 'quarantined' as const,
              findingCodes: Object.freeze(['AST-SCAN-JPEG-NONCANONICAL']),
            });
          }
          return Object.freeze({
            verdict: 'clean' as const,
            findingCodes: Object.freeze([]),
          });
        } catch (error) {
          if (!(error instanceof BinaryAssetJpegValidationError)) throw error;
          return Object.freeze({
            verdict: 'quarantined' as const,
            findingCodes: Object.freeze(['AST-SCAN-JPEG-INVALID']),
          });
        }
      },
    });
