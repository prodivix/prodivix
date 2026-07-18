import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  BinaryAssetDerivedCacheConflictError,
  BinaryAssetPngValidationError,
  BinaryAssetQuarantinedError,
  BinaryAssetScannerUnavailableError,
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  createBinaryAssetPngSanitizeRecipe,
  createBinaryAssetPngSanitizeTransformer,
  createBinaryAssetPngStructuralScanner,
  createBinaryAssetScannerChain,
  createBinaryAssetScannerFailoverPool,
  createBinaryAssetScanAttestation,
  createInMemoryBinaryAssetDerivedCache,
  executeBinaryAssetTransformPipeline,
  readBinaryAssetScanAttestation,
  sanitizeBinaryAssetPng,
  type BinaryAssetContentScanner,
} from './index';

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

const uint32 = (value: number): Uint8Array => {
  const result = new Uint8Array(4);
  new DataView(result.buffer).setUint32(0, value);
  return result;
};

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

const chunk = (type: string, data = new Uint8Array()): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  return concat(
    uint32(data.byteLength),
    typeBytes,
    data,
    uint32(crc32(concat(typeBytes, data)))
  );
};

const png = (
  input: {
    width?: number;
    height?: number;
    text?: string;
    rgba?: readonly [number, number, number, number];
  } = {}
): Uint8Array => {
  const width = input.width ?? 1;
  const height = input.height ?? 1;
  const rgba = input.rgba ?? [12, 34, 56, 255];
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      rows.set(rgba, row + 1 + x * 4);
    }
  }
  const text = input.text
    ? [chunk('tEXt', new TextEncoder().encode(`comment\0${input.text}`))]
    : [];
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...text,
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND')
  );
};

const materialize = (contents: Uint8Array) => {
  const reference = createBinaryAssetBlobReference({
    contents,
    mediaType: 'image/png',
  });
  return createBinaryAssetMaterialization({
    assetDocumentId: 'asset-product-image',
    reference,
    contents,
  });
};

describe('binary asset PNG sanitizer', () => {
  it('strips ancillary metadata and preserves deterministic pixels and dimensions', () => {
    const source = png({ width: 2, height: 3, text: 'private-canary' });
    const left = sanitizeBinaryAssetPng(source);
    const right = sanitizeBinaryAssetPng(source);

    expect(left.metadata).toEqual({ width: 2, height: 3 });
    expect(left.contents).toEqual(right.contents);
    expect(left.contents.byteLength).toBeLessThan(source.byteLength);
    expect(new TextDecoder().decode(left.contents)).not.toContain(
      'private-canary'
    );
    expect(sanitizeBinaryAssetPng(left.contents).contents).toEqual(
      left.contents
    );
  });

  it('rejects CRC drift, oversized dimensions, and trailing bytes', () => {
    const crcDrift = png();
    crcDrift[20] = (crcDrift[20] ?? 0) ^ 1;
    expect(() => sanitizeBinaryAssetPng(crcDrift)).toThrow(
      BinaryAssetPngValidationError
    );
    expect(() => sanitizeBinaryAssetPng(png({ width: 8_193 }))).toThrow(
      /profile/u
    );
    expect(() =>
      sanitizeBinaryAssetPng(concat(png(), new Uint8Array([0])))
    ).toThrow(/IEND/u);
  });
});

describe('binary asset transform pipeline', () => {
  it('fails over scanner replicas only on bounded infrastructure unavailability', async () => {
    const source = materialize(png());
    const unavailableScan = vi.fn(async () => {
      throw new BinaryAssetScannerUnavailableError('timeout');
    });
    const cleanScan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const pool = createBinaryAssetScannerFailoverPool({
      id: 'test.malware-engine',
      version: 'daily-2',
      supportedMediaTypes: ['image/png'],
      replicas: [
        {
          replicaId: 'primary',
          scanner: {
            descriptor: {
              id: 'test.clamav',
              version: 'daily-2',
              supportedMediaTypes: ['image/png'],
            },
            scan: unavailableScan,
          },
        },
        {
          replicaId: 'secondary',
          scanner: {
            descriptor: {
              id: 'test.clamav',
              version: 'daily-2',
              supportedMediaTypes: ['image/png'],
            },
            scan: cleanScan,
          },
        },
      ],
    });

    await expect(
      pool.scan({ reference: source.reference, contents: source.contents })
    ).resolves.toEqual({ verdict: 'clean', findingCodes: [] });
    expect(unavailableScan).toHaveBeenCalledTimes(1);
    expect(cleanScan).toHaveBeenCalledTimes(1);
    expect(pool.descriptor.id).toBe('test.malware-engine');
  });

  it('treats quarantine as authoritative and fails closed when every replica is unavailable', async () => {
    const source = materialize(png());
    const fallbackScan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const quarantiningPool = createBinaryAssetScannerFailoverPool({
      id: 'test.quarantine-engine',
      version: '1',
      supportedMediaTypes: ['image/png'],
      replicas: [
        {
          replicaId: 'primary',
          scanner: {
            descriptor: {
              id: 'test.primary',
              version: '1',
              supportedMediaTypes: ['image/png'],
            },
            async scan() {
              return {
                verdict: 'quarantined',
                findingCodes: ['AST-SCAN-TEST-CANARY'],
              };
            },
          },
        },
        {
          replicaId: 'secondary',
          scanner: {
            descriptor: {
              id: 'test.secondary',
              version: '1',
              supportedMediaTypes: ['image/png'],
            },
            scan: fallbackScan,
          },
        },
      ],
    });
    await expect(
      quarantiningPool.scan({
        reference: source.reference,
        contents: source.contents,
      })
    ).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: ['AST-SCAN-TEST-CANARY'],
    });
    expect(fallbackScan).not.toHaveBeenCalled();

    const exhausted = createBinaryAssetScannerFailoverPool({
      id: 'test.exhausted-engine',
      version: '1',
      supportedMediaTypes: ['image/png'],
      replicas: ['first', 'second'].map((replicaId) => ({
        replicaId,
        scanner: {
          descriptor: {
            id: `test.${replicaId}`,
            version: '1',
            supportedMediaTypes: ['image/png'],
          },
          async scan() {
            throw new BinaryAssetScannerUnavailableError('connection');
          },
        },
      })),
    });
    await expect(
      exhausted.scan({ reference: source.reference, contents: source.contents })
    ).rejects.toMatchObject({
      name: BinaryAssetScannerUnavailableError.name,
      reason: 'replicas-exhausted',
    });

    const forbiddenFallback = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const drifted = createBinaryAssetScannerFailoverPool({
      id: 'test.drifted-engine',
      version: '1',
      supportedMediaTypes: ['image/png'],
      replicas: [
        {
          replicaId: 'primary',
          scanner: {
            descriptor: {
              id: 'test.drifted-primary',
              version: '1',
              supportedMediaTypes: ['image/png'],
            },
            async scan() {
              throw new BinaryAssetScannerUnavailableError('policy-drift');
            },
          },
        },
        {
          replicaId: 'secondary',
          scanner: {
            descriptor: {
              id: 'test.drifted-secondary',
              version: '1',
              supportedMediaTypes: ['image/png'],
            },
            scan: forbiddenFallback,
          },
        },
      ],
    });
    await expect(
      drifted.scan({ reference: source.reference, contents: source.contents })
    ).rejects.toMatchObject({ reason: 'policy-drift' });
    expect(forbiddenFallback).not.toHaveBeenCalled();
  });

  it('rejects duplicate replica identities and incomplete replica capabilities', () => {
    const scanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.pdf-only',
        version: '1',
        supportedMediaTypes: ['application/pdf'],
      },
      async scan() {
        return { verdict: 'clean', findingCodes: [] };
      },
    };
    expect(() =>
      createBinaryAssetScannerFailoverPool({
        id: 'test.bad-engine',
        version: '1',
        supportedMediaTypes: ['image/png'],
        replicas: [{ replicaId: 'primary', scanner }],
      })
    ).toThrow(/cover/u);
    expect(() =>
      createBinaryAssetScannerFailoverPool({
        id: 'test.duplicate-engine',
        version: '1',
        supportedMediaTypes: ['application/pdf'],
        replicas: [
          { replicaId: 'primary', scanner },
          { replicaId: 'primary', scanner },
        ],
      })
    ).toThrow(/cover/u);
  });

  it('runs every scanner in a versioned chain and aggregates bounded findings', async () => {
    const source = materialize(png());
    const cleanScan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const quarantineScan = vi.fn(async () => ({
      verdict: 'quarantined' as const,
      findingCodes: ['AST-SCAN-MALWARE-DETECTED'] as const,
    }));
    const chain = createBinaryAssetScannerChain({
      id: 'test.png-policy',
      version: '2026.07.18',
      supportedMediaTypes: ['image/png'],
      scanners: [
        {
          descriptor: {
            id: 'test.structure',
            version: '1',
            supportedMediaTypes: ['image/png'],
          },
          scan: cleanScan,
        },
        {
          descriptor: {
            id: 'test.malware',
            version: 'daily-1',
            supportedMediaTypes: ['image/png'],
          },
          scan: quarantineScan,
        },
      ],
    });

    await expect(
      chain.scan({
        reference: source.reference,
        contents: source.contents,
      })
    ).resolves.toEqual({
      verdict: 'quarantined',
      findingCodes: ['AST-SCAN-MALWARE-DETECTED'],
    });
    expect(cleanScan).toHaveBeenCalledTimes(1);
    expect(quarantineScan).toHaveBeenCalledTimes(1);
    expect(chain.descriptor).toEqual({
      id: 'test.png-policy',
      version: '2026.07.18',
      supportedMediaTypes: ['image/png'],
    });
  });

  it('propagates scanner unavailability and rejects incomplete chain capabilities', async () => {
    const source = materialize(png());
    const unavailable = new BinaryAssetScannerUnavailableError('timeout');
    const chain = createBinaryAssetScannerChain({
      id: 'test.png-policy',
      version: '1',
      supportedMediaTypes: ['image/png'],
      scanners: [
        {
          descriptor: {
            id: 'test.unavailable',
            version: '1',
            supportedMediaTypes: ['image/png'],
          },
          async scan() {
            throw unavailable;
          },
        },
      ],
    });

    await expect(
      chain.scan({
        reference: source.reference,
        contents: source.contents,
      })
    ).rejects.toBe(unavailable);
    expect(() =>
      createBinaryAssetScannerChain({
        id: 'test.bad-policy',
        version: '1',
        supportedMediaTypes: ['image/png'],
        scanners: [
          {
            descriptor: {
              id: 'test.pdf-only',
              version: '1',
              supportedMediaTypes: ['application/pdf'],
            },
            async scan() {
              return { verdict: 'clean', findingCodes: [] };
            },
          },
        ],
      })
    ).toThrow(/cover/u);
  });

  it('transforms, scans, caches, and revalidates exact derived bytes', async () => {
    const source = materialize(png({ width: 2, height: 2, text: 'strip-me' }));
    const recipe = createBinaryAssetPngSanitizeRecipe(source.reference.digest);
    const baseTransformer = createBinaryAssetPngSanitizeTransformer();
    const transform = vi.fn(baseTransformer.transform);
    const transformer = { ...baseTransformer, transform };
    const cache = createInMemoryBinaryAssetDerivedCache({
      maximumEntries: 2,
      maximumTotalBytes: 1024 * 1024,
    });

    const transformed = await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer,
      scanner: createBinaryAssetPngStructuralScanner(),
      cache,
    });
    const cached = await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer,
      scanner: createBinaryAssetPngStructuralScanner(),
      cache,
    });

    expect(transformed.kind).toBe('transformed');
    expect(transformed.derived.metadata).toEqual({ width: 2, height: 2 });
    expect(transformed.derived.scan).toMatchObject({
      verdict: 'clean',
      subjectDigest: transformed.derived.materialization.reference.digest,
    });
    expect(cached.kind).toBe('cache-hit');
    expect(cached.derived.materialization.contents).toEqual(
      transformed.derived.materialization.contents
    );
    expect(transform).toHaveBeenCalledTimes(1);
    expect(cache.inspect()).toEqual({
      entries: 1,
      totalBytes: transformed.derived.materialization.contents.byteLength,
    });
  });

  it('fails closed on quarantine and never caches rejected output', async () => {
    const source = materialize(png());
    const scanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.quarantine',
        version: '1',
        supportedMediaTypes: ['image/png'],
      },
      async scan() {
        return {
          verdict: 'quarantined',
          findingCodes: ['AST-SCAN-TEST-CANARY'],
        };
      },
    };
    const cache = createInMemoryBinaryAssetDerivedCache({
      maximumEntries: 2,
      maximumTotalBytes: 1024,
    });
    await expect(
      executeBinaryAssetTransformPipeline({
        source,
        recipe: createBinaryAssetPngSanitizeRecipe(source.reference.digest),
        transformer: createBinaryAssetPngSanitizeTransformer(),
        scanner,
        cache,
      })
    ).rejects.toMatchObject({
      name: BinaryAssetQuarantinedError.name,
      attestation: { findingCodes: ['AST-SCAN-TEST-CANARY'] },
    });
    expect(cache.inspect()).toEqual({ entries: 0, totalBytes: 0 });
  });

  it('re-scans cached bytes when scanner policy identity changes', async () => {
    const source = materialize(png());
    const recipe = createBinaryAssetPngSanitizeRecipe(source.reference.digest);
    const transformer = createBinaryAssetPngSanitizeTransformer();
    const transform = vi.fn(transformer.transform);
    const cache = createInMemoryBinaryAssetDerivedCache({
      maximumEntries: 2,
      maximumTotalBytes: 1024 * 1024,
    });
    await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer: { ...transformer, transform },
      scanner: createBinaryAssetPngStructuralScanner(),
      cache,
    });
    const scan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const result = await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer: { ...transformer, transform },
      scanner: {
        descriptor: {
          id: 'test.png-policy',
          version: '2',
          supportedMediaTypes: ['image/png'],
        },
        scan,
      },
      cache,
    });

    expect(result.kind).toBe('cache-hit');
    expect(result.derived.scan).toMatchObject({
      scannerId: 'test.png-policy',
      scannerVersion: '2',
    });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it('rejects a recipe-key collision with different clean output', async () => {
    const source = materialize(png());
    const recipe = createBinaryAssetPngSanitizeRecipe(source.reference.digest);
    const cache = createInMemoryBinaryAssetDerivedCache({
      maximumEntries: 2,
      maximumTotalBytes: 1024 * 1024,
    });
    const first = await executeBinaryAssetTransformPipeline({
      source,
      recipe,
      transformer: createBinaryAssetPngSanitizeTransformer(),
      scanner: createBinaryAssetPngStructuralScanner(),
    });
    await cache.put(first.derived);
    const other = materialize(png({ rgba: [99, 1, 2, 255] }));
    const scan = createBinaryAssetScanAttestation({
      subjectDigest: other.reference.digest,
      scannerId: 'test.clean',
      scannerVersion: '1',
      verdict: 'clean',
      findingCodes: [],
    });

    await expect(
      cache.put({
        recipe,
        materialization: other,
        metadata: { width: 1, height: 1 },
        scan,
      })
    ).rejects.toBeInstanceOf(BinaryAssetDerivedCacheConflictError);
  });

  it('strictly decodes scan attestations and rejects finding drift', () => {
    const attestation = createBinaryAssetScanAttestation({
      subjectDigest: `sha256-${'a'.repeat(64)}`,
      scannerId: 'test.scanner',
      scannerVersion: '1.0.0',
      verdict: 'clean',
      findingCodes: [],
    });
    expect(readBinaryAssetScanAttestation(attestation)).toEqual(attestation);
    expect(() =>
      readBinaryAssetScanAttestation({ ...attestation, token: 'canary' })
    ).toThrow(/invalid/u);
    expect(() =>
      createBinaryAssetScanAttestation({
        ...attestation,
        verdict: 'clean',
        findingCodes: ['AST-SCAN-DRIFT'],
      })
    ).toThrow(/findings/u);
  });
});
