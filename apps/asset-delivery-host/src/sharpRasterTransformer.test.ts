import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID,
  BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID,
  createBinaryAssetBlobReference,
  createBinaryAssetJpegRasterReencodeRecipe,
  createBinaryAssetMaterialization,
  createBinaryAssetPngRasterReencodeRecipe,
  sanitizeBinaryAssetJpeg,
  sanitizeBinaryAssetPng,
  type BinaryAssetTransformer,
} from '@prodivix/assets';
import {
  AssetRasterTransformUnavailableError,
  createSharpRasterReencodeTransformers,
} from './sharpRasterTransformer';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (contents: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of contents) {
    value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data = new Uint8Array()): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  const result = Buffer.alloc(data.byteLength + 12);
  result.writeUInt32BE(data.byteLength, 0);
  result.set(typeBytes, 4);
  result.set(data, 8);
  result.writeUInt32BE(
    crc32(result.subarray(4, 8 + data.byteLength)),
    8 + data.byteLength
  );
  return result;
};

const malformedPixelPng = (): Uint8Array => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array([0])),
    chunk('IEND'),
  ]);
};

const materialize = (contents: Uint8Array, mediaType: string) => {
  const reference = createBinaryAssetBlobReference({ contents, mediaType });
  return createBinaryAssetMaterialization({
    assetDocumentId: 'asset-raster-source',
    reference,
    contents,
  });
};

const transformerById = (
  transformers: readonly BinaryAssetTransformer[],
  id: string
): BinaryAssetTransformer => {
  const transformer = transformers.find((entry) => entry.descriptor.id === id);
  if (!transformer)
    throw new TypeError('Expected raster transformer is missing.');
  return transformer;
};

describe('Sharp raster re-encode transformers', () => {
  it('fully decodes, auto-orients, strips metadata, and deterministically emits canonical baseline JPEG', async () => {
    const source = new Uint8Array(
      await sharp({
        create: {
          width: 2,
          height: 3,
          channels: 3,
          background: { r: 20, g: 80, b: 160 },
        },
      })
        .withMetadata({ orientation: 6 })
        .jpeg({ progressive: true, quality: 84 })
        .toBuffer()
    );
    expect(() => sanitizeBinaryAssetJpeg(source)).toThrow();
    const sourceMaterialization = materialize(source, 'image/jpeg');
    const recipe = createBinaryAssetJpegRasterReencodeRecipe(
      sourceMaterialization.reference.digest
    );
    const transformer = transformerById(
      createSharpRasterReencodeTransformers({
        maximumConcurrentTransforms: 2,
        timeoutSeconds: 5,
      }),
      BINARY_ASSET_JPEG_RASTER_REENCODE_TRANSFORMER_ID
    );

    const first = await transformer.transform({
      recipe,
      source: sourceMaterialization,
    });
    const second = await transformer.transform({
      recipe,
      source: sourceMaterialization,
    });

    expect(first.contents).toEqual(second.contents);
    expect(first.contents).not.toEqual(source);
    expect(sanitizeBinaryAssetJpeg(first.contents).metadata).toEqual({
      width: 3,
      height: 2,
    });
  });

  it('rejects a structurally valid PNG whose compressed pixel stream cannot be decoded', async () => {
    const source = malformedPixelPng();
    expect(sanitizeBinaryAssetPng(source).metadata).toEqual({
      width: 1,
      height: 1,
    });
    const sourceMaterialization = materialize(source, 'image/png');
    const transformer = transformerById(
      createSharpRasterReencodeTransformers({
        maximumConcurrentTransforms: 1,
        timeoutSeconds: 5,
      }),
      BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID
    );

    await expect(
      transformer.transform({
        recipe: createBinaryAssetPngRasterReencodeRecipe(
          sourceMaterialization.reference.digest
        ),
        source: sourceMaterialization,
      })
    ).rejects.toThrow();
  });

  it('fails closed instead of queueing unbounded concurrent decoder work', async () => {
    const source = new Uint8Array(
      await sharp({
        create: {
          width: 512,
          height: 512,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer()
    );
    const sourceMaterialization = materialize(source, 'image/png');
    const recipe = createBinaryAssetPngRasterReencodeRecipe(
      sourceMaterialization.reference.digest
    );
    const transformer = transformerById(
      createSharpRasterReencodeTransformers({
        maximumConcurrentTransforms: 1,
        timeoutSeconds: 5,
      }),
      BINARY_ASSET_PNG_RASTER_REENCODE_TRANSFORMER_ID
    );

    const results = await Promise.allSettled([
      transformer.transform({ recipe, source: sourceMaterialization }),
      transformer.transform({ recipe, source: sourceMaterialization }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: expect.any(AssetRasterTransformUnavailableError),
    });
  });
});
