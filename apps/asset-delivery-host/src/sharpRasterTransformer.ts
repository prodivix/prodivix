import sharp from 'sharp';
import {
  BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID,
  BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_VERSION,
  BINARY_ASSET_LIMITS,
  BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID,
  BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_VERSION,
  createBinaryAssetJpegRasterReencodeRecipe,
  createBinaryAssetPngRasterReencodeRecipe,
  sanitizeBinaryAssetJpeg,
  sanitizeBinaryAssetPng,
  type BinaryAssetTransformRequest,
  type BinaryAssetTransformResult,
  type BinaryAssetTransformer,
} from '@prodivix/assets';

export class AssetRasterTransformUnavailableError extends Error {
  constructor() {
    super('Binary asset raster transform capacity is unavailable.');
    this.name = 'AssetRasterTransformUnavailableError';
  }
}

export type SharpRasterRuntimeOptions = Readonly<{
  concurrency: number;
  cacheMemoryMegabytes: number;
  cacheItems: number;
}>;

export type SharpRasterTransformerOptions = Readonly<{
  maximumConcurrentTransforms: number;
  timeoutSeconds: number;
}>;

const positiveInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
};

/** Applies process-wide libvips budgets before the HTTP server accepts work. */
export const configureSharpRasterRuntime = (
  options: SharpRasterRuntimeOptions
): void => {
  const concurrency = positiveInteger(options.concurrency, 'Sharp concurrency');
  const memory = positiveInteger(
    options.cacheMemoryMegabytes,
    'Sharp cache memory'
  );
  const items = positiveInteger(options.cacheItems, 'Sharp cache items');
  sharp.concurrency(concurrency);
  sharp.cache({ files: 0, items, memory });
};

const assertRecipe = (
  request: BinaryAssetTransformRequest,
  mediaType: 'image/jpeg' | 'image/png'
): void => {
  const expected =
    mediaType === 'image/png'
      ? createBinaryAssetPngRasterReencodeRecipe(
          request.source.reference.digest
        )
      : createBinaryAssetJpegRasterReencodeRecipe(
          request.source.reference.digest
        );
  if (
    request.source.reference.mediaType !== mediaType ||
    request.recipe.recipeDigest !== expected.recipeDigest
  ) {
    throw new TypeError('Raster re-encode transform request is invalid.');
  }
};

const assertInputMetadata = (
  metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>,
  mediaType: 'image/jpeg' | 'image/png'
): void => {
  const expectedFormat = mediaType === 'image/png' ? 'png' : 'jpeg';
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    metadata.format !== expectedFormat ||
    (metadata.pages ?? 1) !== 1 ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > BINARY_ASSET_LIMITS.maxImageWidth ||
    height > BINARY_ASSET_LIMITS.maxImageHeight ||
    width * height > BINARY_ASSET_LIMITS.maxImagePixels ||
    (metadata.channels ?? 0) < 1 ||
    (metadata.channels ?? 0) > 4
  ) {
    throw new TypeError('Raster input exceeds the canonical image policy.');
  }
};

const transformRaster = async (
  request: BinaryAssetTransformRequest,
  mediaType: 'image/jpeg' | 'image/png',
  timeoutSeconds: number
): Promise<BinaryAssetTransformResult> => {
  assertRecipe(request, mediaType);
  const image = sharp(Buffer.from(request.source.contents), {
    animated: false,
    failOn: 'warning',
    limitInputChannels: 4,
    limitInputPixels: BINARY_ASSET_LIMITS.maxImagePixels,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  });
  const metadata = await image.metadata();
  assertInputMetadata(metadata, mediaType);
  const canonicalPixels = image
    .autoOrient()
    .toColourspace('srgb')
    .timeout({ seconds: timeoutSeconds });
  const encoded =
    mediaType === 'image/png'
      ? await canonicalPixels
          .png({
            adaptiveFiltering: false,
            compressionLevel: 9,
            palette: false,
            progressive: false,
          })
          .toBuffer()
      : await canonicalPixels
          .jpeg({
            chromaSubsampling: '4:4:4',
            mozjpeg: false,
            optimiseCoding: true,
            optimiseScans: false,
            overshootDeringing: false,
            progressive: false,
            quality: 90,
            quantisationTable: 0,
            trellisQuantisation: false,
          })
          .toBuffer();
  if (encoded.byteLength > BINARY_ASSET_LIMITS.maxBlobBytes) {
    throw new RangeError('Raster re-encode output exceeded its byte limit.');
  }
  const sanitized =
    mediaType === 'image/png'
      ? sanitizeBinaryAssetPng(new Uint8Array(encoded))
      : sanitizeBinaryAssetJpeg(new Uint8Array(encoded));
  return Object.freeze({
    mediaType,
    contents: sanitized.contents,
  });
};

/** Creates PNG/JPEG transformers that share one hard concurrent-work budget. */
export const createSharpRasterReencodeTransformers = (
  options: SharpRasterTransformerOptions
): readonly BinaryAssetTransformer[] => {
  const maximumConcurrentTransforms = positiveInteger(
    options.maximumConcurrentTransforms,
    'Maximum concurrent raster transforms'
  );
  const timeoutSeconds = positiveInteger(
    options.timeoutSeconds,
    'Raster transform timeout'
  );
  let activeTransforms = 0;
  const run = async (
    request: BinaryAssetTransformRequest,
    mediaType: 'image/jpeg' | 'image/png'
  ): Promise<BinaryAssetTransformResult> => {
    if (activeTransforms >= maximumConcurrentTransforms) {
      throw new AssetRasterTransformUnavailableError();
    }
    activeTransforms += 1;
    try {
      return await transformRaster(request, mediaType, timeoutSeconds);
    } catch (error) {
      if (error instanceof Error && /timeout/iu.test(error.message)) {
        throw new AssetRasterTransformUnavailableError();
      }
      throw error;
    } finally {
      activeTransforms -= 1;
    }
  };

  return Object.freeze([
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID,
        version: BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_VERSION,
        inputMediaTypes: Object.freeze(['image/png']),
        outputMediaTypes: Object.freeze(['image/png']),
      }),
      transform: (request: BinaryAssetTransformRequest) =>
        run(request, 'image/png'),
    }),
    Object.freeze({
      descriptor: Object.freeze({
        id: BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID,
        version: BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_VERSION,
        inputMediaTypes: Object.freeze(['image/jpeg']),
        outputMediaTypes: Object.freeze(['image/jpeg']),
      }),
      transform: (request: BinaryAssetTransformRequest) =>
        run(request, 'image/jpeg'),
    }),
  ]);
};
