import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  BINARY_ASSET_BLOB_REFERENCE_KIND,
  BINARY_ASSET_LIMITS,
  classifyBinaryAssetDelivery,
  computeBinaryAssetDigest,
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  createBinaryAssetPublicDeliveryRequest,
  createBinaryAssetTransformRecipe,
  readBinaryAssetBlobReference,
} from './index';

describe('binary asset current contract', () => {
  it('binds materialized bytes to one canonical digest and size', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (contents) => {
        const reference = createBinaryAssetBlobReference({
          contents,
          mediaType: 'image/png',
        });
        const materialized = createBinaryAssetMaterialization({
          assetDocumentId: 'asset-product-image',
          reference,
          contents,
        });
        expect(reference).toEqual({
          kind: BINARY_ASSET_BLOB_REFERENCE_KIND,
          digest: computeBinaryAssetDigest(contents),
          byteLength: contents.byteLength,
          mediaType: 'image/png',
        });
        expect(materialized.contents).toEqual(contents);
        contents.fill(0);
        expect(computeBinaryAssetDigest(materialized.contents)).toBe(
          reference.digest
        );
      })
    );
  });

  it('fails closed on unknown fields, canonical drift, size drift, and digest drift', () => {
    const contents = new Uint8Array([1, 2, 3]);
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/png',
    });
    expect(() =>
      readBinaryAssetBlobReference({ ...reference, signedUrl: 'canary' })
    ).toThrow(/invalid/u);
    expect(() =>
      readBinaryAssetBlobReference({
        ...reference,
        byteLength: BINARY_ASSET_LIMITS.maxBlobBytes + 1,
      })
    ).toThrow(/invalid/u);
    expect(() =>
      readBinaryAssetBlobReference({ ...reference, mediaType: 'Image/PNG' })
    ).toThrow(/canonical/u);
    expect(() =>
      createBinaryAssetBlobReference({
        contents,
        mediaType: 'application/vnd.example~json',
      })
    ).toThrow(/media type/u);
    expect(() =>
      createBinaryAssetMaterialization({
        assetDocumentId: 'asset-product-image',
        reference,
        contents: new Uint8Array([1, 2]),
      })
    ).toThrow(/length/u);
    expect(() =>
      createBinaryAssetMaterialization({
        assetDocumentId: 'asset-product-image',
        reference,
        contents: new Uint8Array([1, 2, 4]),
      })
    ).toThrow(/digest/u);
  });

  it('classifies active content separately from static media and downloads', () => {
    expect(classifyBinaryAssetDelivery('image/png')).toBe('static');
    expect(classifyBinaryAssetDelivery('image/svg+xml')).toBe('active-content');
    expect(classifyBinaryAssetDelivery('application/pdf')).toBe(
      'download-only'
    );
  });

  it('uses one target-neutral full raster public delivery policy', () => {
    expect(createBinaryAssetPublicDeliveryRequest('image/png')).toEqual({
      transform: 'png-raster-reencode',
      disposition: 'inline',
    });
    expect(createBinaryAssetPublicDeliveryRequest('image/jpeg')).toEqual({
      transform: 'jpeg-raster-reencode',
      disposition: 'inline',
    });
    expect(createBinaryAssetPublicDeliveryRequest('image/svg+xml')).toEqual({
      transform: 'original',
      disposition: 'attachment',
    });
    expect(createBinaryAssetPublicDeliveryRequest('application/pdf')).toEqual({
      transform: 'original',
      disposition: 'attachment',
    });
  });

  it('creates deterministic transform identities independent of object key order', () => {
    const sourceDigest = `sha256-${'a'.repeat(64)}`;
    const left = createBinaryAssetTransformRecipe({
      sourceDigest,
      transformerId: 'core.image.resize',
      transformerVersion: '1',
      outputMediaType: 'image/webp',
      parameters: { width: 640, fit: 'cover' },
    });
    const right = createBinaryAssetTransformRecipe({
      sourceDigest,
      transformerId: 'core.image.resize',
      transformerVersion: '1',
      outputMediaType: 'image/webp',
      parameters: { fit: 'cover', width: 640 },
    });
    expect(right).toEqual(left);
  });

  it('canonicalizes reserved JSON keys without prototype mutation', () => {
    const recipe = createBinaryAssetTransformRecipe({
      sourceDigest: `sha256-${'b'.repeat(64)}`,
      transformerId: 'core.image.metadata',
      transformerVersion: '1',
      outputMediaType: 'application/json',
      parameters: JSON.parse(
        '{"__proto__":{"polluted":true},"constructor":"literal"}'
      ),
    });

    expect(
      Object.keys(recipe.parameters as Readonly<Record<string, unknown>>)
    ).toEqual(['__proto__', 'constructor']);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
