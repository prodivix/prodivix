import { describe, expect, it, vi } from 'vitest';
import {
  BinaryAssetJpegValidationError,
  createBinaryAssetBlobReference,
  createBinaryAssetJpegSanitizeRecipe,
  createBinaryAssetJpegSanitizeTransformer,
  createBinaryAssetJpegStructuralScanner,
  createBinaryAssetMaterialization,
  createInMemoryBinaryAssetDerivedCache,
  executeBinaryAssetTransformPipeline,
  sanitizeBinaryAssetJpeg,
} from './index';

const BASELINE_JPEG = new Uint8Array(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5iooor2Dyj//Z',
    'base64'
  )
);

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const segment = (marker: number, data: Uint8Array): Uint8Array => {
  const result = new Uint8Array(data.byteLength + 4);
  result.set([0xff, marker], 0);
  new DataView(result.buffer).setUint16(2, data.byteLength + 2);
  result.set(data, 4);
  return result;
};

const withSegments = (...segments: readonly Uint8Array[]): Uint8Array =>
  concat(BASELINE_JPEG.subarray(0, 2), ...segments, BASELINE_JPEG.subarray(2));

const exifOrientation = (orientation: number): Uint8Array => {
  const data = new Uint8Array(32);
  data.set([0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0], 0);
  const view = new DataView(data.buffer);
  view.setUint32(10, 8, true);
  view.setUint16(14, 1, true);
  view.setUint16(16, 0x0112, true);
  view.setUint16(18, 3, true);
  view.setUint32(20, 1, true);
  view.setUint16(24, orientation, true);
  view.setUint32(28, 0, true);
  return data;
};

describe('binary asset JPEG sanitizer', () => {
  it('strips application metadata and comments while preserving baseline image bytes', () => {
    const canonical = sanitizeBinaryAssetJpeg(BASELINE_JPEG);
    const source = withSegments(
      segment(0xe1, exifOrientation(1)),
      segment(0xfe, new TextEncoder().encode('private-canary'))
    );
    const sanitized = sanitizeBinaryAssetJpeg(source);

    expect(sanitized.metadata).toEqual({ width: 2, height: 3 });
    expect(sanitized.contents).toEqual(canonical.contents);
    expect(sanitized.contents.byteLength).toBeLessThan(source.byteLength);
    expect(new TextDecoder().decode(sanitized.contents)).not.toContain(
      'private-canary'
    );
    expect(sanitizeBinaryAssetJpeg(sanitized.contents)).toEqual(sanitized);
  });

  it('transforms, structurally scans, caches, and rejects non-canonical originals', async () => {
    const contents = withSegments(
      segment(0xe1, exifOrientation(1)),
      segment(0xfe, new TextEncoder().encode('strip-me'))
    );
    const reference = createBinaryAssetBlobReference({
      contents,
      mediaType: 'image/jpeg',
    });
    const source = createBinaryAssetMaterialization({
      assetDocumentId: 'asset-photo',
      reference,
      contents,
    });
    const transformer = createBinaryAssetJpegSanitizeTransformer();
    const transform = vi.fn(transformer.transform);
    const scanner = createBinaryAssetJpegStructuralScanner();
    const cache = createInMemoryBinaryAssetDerivedCache({
      maximumEntries: 2,
      maximumTotalBytes: 1024 * 1024,
    });

    const transformed = await executeBinaryAssetTransformPipeline({
      source,
      recipe: createBinaryAssetJpegSanitizeRecipe(reference.digest),
      transformer: { ...transformer, transform },
      scanner,
      cache,
    });
    const cached = await executeBinaryAssetTransformPipeline({
      source,
      recipe: createBinaryAssetJpegSanitizeRecipe(reference.digest),
      transformer: { ...transformer, transform },
      scanner,
      cache,
    });

    expect(transformed.kind).toBe('transformed');
    expect(transformed.derived.metadata).toEqual({ width: 2, height: 3 });
    expect(transformed.derived.materialization.reference.mediaType).toBe(
      'image/jpeg'
    );
    expect(
      new TextDecoder().decode(transformed.derived.materialization.contents)
    ).not.toContain('strip-me');
    expect(cached.kind).toBe('cache-hit');
    expect(transform).toHaveBeenCalledTimes(1);
    await expect(scanner.scan({ reference, contents })).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: ['AST-SCAN-JPEG-NONCANONICAL'],
    });
  });

  it('preserves one bounded rendering-critical Adobe marker', () => {
    const adobe = new Uint8Array([
      0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1,
    ]);
    const sanitized = sanitizeBinaryAssetJpeg(
      withSegments(segment(0xee, adobe))
    );

    expect(new TextDecoder().decode(sanitized.contents)).toContain('Adobe');
    expect(sanitizeBinaryAssetJpeg(sanitized.contents).contents).toEqual(
      sanitized.contents
    );
  });

  it('fails closed on orientation, progressive coding, invalid Huffman tables, truncation, and trailing bytes', () => {
    expect(() =>
      sanitizeBinaryAssetJpeg(withSegments(segment(0xe1, exifOrientation(6))))
    ).toThrow(/orientation/u);

    const progressive = new Uint8Array(BASELINE_JPEG);
    const frameOffset = progressive.findIndex(
      (value, index) => value === 0xff && progressive[index + 1] === 0xc0
    );
    progressive[frameOffset + 1] = 0xc2;
    expect(() => sanitizeBinaryAssetJpeg(progressive)).toThrow(
      BinaryAssetJpegValidationError
    );

    const oversubscribedHuffman = new Uint8Array(BASELINE_JPEG);
    const huffmanOffset = oversubscribedHuffman.findIndex(
      (value, index) =>
        value === 0xff && oversubscribedHuffman[index + 1] === 0xc4
    );
    oversubscribedHuffman.fill(0, huffmanOffset + 5, huffmanOffset + 21);
    oversubscribedHuffman[huffmanOffset + 5] = 2;
    oversubscribedHuffman[huffmanOffset + 6] = 10;
    expect(() => sanitizeBinaryAssetJpeg(oversubscribedHuffman)).toThrow(
      /oversubscribed/u
    );

    expect(() =>
      sanitizeBinaryAssetJpeg(BASELINE_JPEG.subarray(0, -2))
    ).toThrow(/incomplete|entropy/u);
    expect(() =>
      sanitizeBinaryAssetJpeg(concat(BASELINE_JPEG, new Uint8Array([0])))
    ).toThrow(/EOI/u);
  });
});
