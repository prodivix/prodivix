import { createHash } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BinaryAssetScannerUnavailableError,
  createBinaryAssetJpegSanitizeTransformer,
  createBinaryAssetJpegRasterReencodeRecipe,
  createBinaryAssetJpegStructuralScanner,
  createBinaryAssetPngSanitizeTransformer,
  createBinaryAssetPngStructuralScanner,
  createInMemoryBinaryAssetDerivedCache,
  type BinaryAssetContentScanner,
  type BinaryAssetTransformer,
} from '@prodivix/assets';
import { createAssetDeliveryHttpHandler } from './assetDeliveryHttpHandler';
import {
  createAssetDeliveryScannerSnapshot,
  type AssetDeliveryScannerRuntime,
} from './assetDeliveryScannerRuntime';
import { createAssetDeliverySessionStore } from './assetDeliverySessionStore';
import { createSharpRasterReencodeTransformers } from './sharpRasterTransformer';

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

const png = (text?: string): Uint8Array => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  header.set([8, 6, 0, 0, 0], 8);
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    ...(text
      ? [chunk('tEXt', new TextEncoder().encode(`comment\0${text}`))]
      : []),
    chunk('IDAT', deflateSync(new Uint8Array([0, 1, 2, 3, 255]))),
    chunk('IEND')
  );
};

const jpeg = (comment?: string): Uint8Array => {
  const base = new Uint8Array(
    Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5iooor2Dyj//Z',
      'base64'
    )
  );
  if (!comment) return base;
  const data = new TextEncoder().encode(comment);
  const commentSegment = new Uint8Array(data.byteLength + 4);
  commentSegment.set([0xff, 0xfe], 0);
  new DataView(commentSegment.buffer).setUint16(2, data.byteLength + 2);
  commentSegment.set(data, 4);
  return concat(base.subarray(0, 2), commentSegment, base.subarray(2));
};

const digest = (contents: Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  );
});

const call = async (
  port: number,
  input: Readonly<{
    method: string;
    path: string;
    host?: string;
    headers?: Readonly<Record<string, string>>;
    body?: Uint8Array;
  }>
) =>
  new Promise<
    Readonly<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>
  >((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: input.method,
        path: input.path,
        headers: {
          Host: input.host ?? 'asset.example.test',
          ...input.headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    request.once('error', reject);
    if (input.body) request.write(input.body);
    request.end();
  });

const startHost = async (input?: {
  scanners?: readonly BinaryAssetContentScanner[];
  scannerReadiness?: Readonly<{ assertReady(): Promise<unknown> }>;
  scannerRuntime?: AssetDeliveryScannerRuntime;
  transformers?: readonly BinaryAssetTransformer[];
  now?: () => number;
  capabilities?: readonly string[];
}) => {
  let capabilityIndex = 0;
  const store = createAssetDeliverySessionStore({
    maximumSessions: 4,
    maximumTotalBytes: 1024 * 1024,
    maximumTtlMs: 60_000,
    now: input?.now,
    createCapability: () =>
      input?.capabilities?.[capabilityIndex++] ?? 'b'.repeat(64),
  });
  const server = createServer(
    createAssetDeliveryHttpHandler({
      internalToken: 'internal-token',
      publicBaseUrl: 'https://asset.example.test',
      store,
      ...(input?.transformers
        ? { transformers: input.transformers }
        : { transformer: createBinaryAssetPngSanitizeTransformer() }),
      ...(input?.scannerRuntime
        ? { scannerRuntime: input.scannerRuntime }
        : {
            scanners: input?.scanners ?? [
              createBinaryAssetPngStructuralScanner(),
            ],
            scannerReadiness: input?.scannerReadiness ?? {
              async assertReady() {
                return undefined;
              },
            },
          }),
      derivedCache: createInMemoryBinaryAssetDerivedCache({
        maximumEntries: 4,
        maximumTotalBytes: 1024 * 1024,
      }),
    })
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    store,
  };
};

describe('Asset Delivery Host', () => {
  it('rejects duplicate scanner media coverage before serving requests', () => {
    const duplicate = createBinaryAssetPngStructuralScanner();

    expect(() =>
      createAssetDeliveryHttpHandler({
        internalToken: 'internal-token',
        publicBaseUrl: 'https://asset.example.test',
        store: createAssetDeliverySessionStore({
          maximumSessions: 1,
          maximumTotalBytes: 1024,
          maximumTtlMs: 1_000,
        }),
        transformer: createBinaryAssetPngSanitizeTransformer(),
        scanners: [createBinaryAssetPngStructuralScanner(), duplicate],
        scannerReadiness: {
          async assertReady() {
            return undefined;
          },
        },
        derivedCache: createInMemoryBinaryAssetDerivedCache({
          maximumEntries: 1,
          maximumTotalBytes: 1024,
        }),
      })
    ).toThrow(/coverage/u);
  });

  it('sanitizes PNG metadata and serves exact derived bytes from a capability origin', async () => {
    let now = 1_000;
    const { port, store } = await startHost({ now: () => now });
    const source = png('private-canary');
    const created = await call(port, {
      method: 'POST',
      path: '/internal/image-transform-delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'image/png',
        'X-Prodivix-Asset-Digest': digest(source),
        'X-Prodivix-Delivery-Disposition': 'inline',
        'X-Prodivix-Delivery-Ttl-Seconds': '30',
      },
      body: source,
    });

    expect(created.status).toBe(201);
    const result = JSON.parse(created.body.toString()) as Record<
      string,
      unknown
    >;
    expect(result).toMatchObject({
      deliveryUrl: `https://${'b'.repeat(64)}.asset.example.test/asset`,
      expiresAt: 31_000,
      mediaType: 'image/png',
      disposition: 'inline',
      deliveryClass: 'static',
      metadata: { width: 1, height: 1 },
      cacheStatus: 'transformed',
    });
    expect(result.digest).not.toBe(digest(source));
    expect(store.inspect().sessions).toBe(1);

    const delivered = await call(port, {
      method: 'GET',
      path: '/asset',
      host: `${'b'.repeat(64)}.asset.example.test`,
    });
    expect(delivered.status).toBe(200);
    expect(delivered.headers['content-type']).toBe('image/png');
    expect(delivered.headers['content-disposition']).toBe(
      'inline; filename="asset.png"'
    );
    expect(delivered.headers['content-security-policy']).toContain(
      "script-src 'none'"
    );
    expect(delivered.headers['content-security-policy']).toContain('sandbox');
    expect(delivered.headers['cross-origin-resource-policy']).toBe(
      'cross-origin'
    );
    expect(delivered.headers['set-cookie']).toBeUndefined();
    expect(delivered.body.toString()).not.toContain('private-canary');
    expect(digest(delivered.body)).toBe(result.digest);

    now = 31_000;
    expect(
      (
        await call(port, {
          method: 'GET',
          path: '/asset',
          host: `${'b'.repeat(64)}.asset.example.test`,
        })
      ).status
    ).toBe(404);
  });

  it('sanitizes baseline JPEG metadata through the generic image transform endpoint', async () => {
    const capability = 'c'.repeat(64);
    const { port } = await startHost({
      capabilities: [capability],
      scanners: [
        createBinaryAssetPngStructuralScanner(),
        createBinaryAssetJpegStructuralScanner(),
      ],
      transformers: [
        createBinaryAssetPngSanitizeTransformer(),
        createBinaryAssetJpegSanitizeTransformer(),
      ],
    });
    const source = jpeg('private-jpeg-canary');
    const created = await call(port, {
      method: 'POST',
      path: '/internal/image-transform-delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'image/jpeg',
        'X-Prodivix-Asset-Digest': digest(source),
        'X-Prodivix-Delivery-Disposition': 'inline',
      },
      body: source,
    });

    expect(created.status).toBe(201);
    const result = JSON.parse(created.body.toString()) as Record<
      string,
      unknown
    >;
    expect(result).toMatchObject({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      mediaType: 'image/jpeg',
      disposition: 'inline',
      deliveryClass: 'static',
      metadata: { width: 2, height: 3 },
      cacheStatus: 'transformed',
    });
    expect(result.digest).not.toBe(digest(source));

    const delivered = await call(port, {
      method: 'GET',
      path: '/asset',
      host: `${capability}.asset.example.test`,
    });
    expect(delivered.status).toBe(200);
    expect(delivered.headers['content-type']).toBe('image/jpeg');
    expect(delivered.headers['content-disposition']).toBe(
      'inline; filename="asset.jpg"'
    );
    expect(delivered.body.toString()).not.toContain('private-jpeg-canary');
    expect(digest(delivered.body)).toBe(result.digest);
  });

  it('selects the explicit full raster recipe when sanitize and re-encode capabilities coexist', async () => {
    const capability = 'f'.repeat(64);
    const rasterTransformers = createSharpRasterReencodeTransformers({
      maximumConcurrentTransforms: 1,
      timeoutSeconds: 5,
    });
    const { port } = await startHost({
      capabilities: [capability],
      scanners: [
        createBinaryAssetPngStructuralScanner(),
        createBinaryAssetJpegStructuralScanner(),
      ],
      transformers: [
        createBinaryAssetPngSanitizeTransformer(),
        createBinaryAssetJpegSanitizeTransformer(),
        ...rasterTransformers,
      ],
    });
    const source = jpeg('full-raster-canary');
    const expectedRecipe = createBinaryAssetJpegRasterReencodeRecipe(
      digest(source)
    );
    const created = await call(port, {
      method: 'POST',
      path: '/internal/image-transform-delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'image/jpeg',
        'X-Prodivix-Asset-Digest': digest(source),
        'X-Prodivix-Delivery-Disposition': 'inline',
        'X-Prodivix-Image-Transform': 'jpeg-raster-reencode',
      },
      body: source,
    });

    expect(created.status).toBe(201);
    expect(JSON.parse(created.body.toString())).toMatchObject({
      deliveryUrl: `https://${capability}.asset.example.test/asset`,
      mediaType: 'image/jpeg',
      recipeDigest: expectedRecipe.recipeDigest,
      metadata: { width: 2, height: 3 },
      cacheStatus: 'transformed',
    });
  });

  it('never serves active content inline and forces clean active bytes to attachment', async () => {
    const svgScanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.svg-scanner',
        version: '1',
        supportedMediaTypes: ['image/svg+xml'],
      },
      async scan() {
        return { verdict: 'clean', findingCodes: [] };
      },
    };
    const capability = 'c'.repeat(64);
    const { port } = await startHost({
      scanners: [createBinaryAssetPngStructuralScanner(), svgScanner],
      capabilities: [capability],
    });
    const source = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    );
    const headers = {
      Authorization: 'Bearer internal-token',
      'Content-Type': 'image/svg+xml',
      'X-Prodivix-Asset-Digest': digest(source),
    };
    const inline = await call(port, {
      method: 'POST',
      path: '/internal/delivery-sessions',
      headers: { ...headers, 'X-Prodivix-Delivery-Disposition': 'inline' },
      body: source,
    });
    expect(inline.status).toBe(422);
    expect(JSON.parse(inline.body.toString())).toEqual({
      error: 'active-inline-forbidden',
    });

    const attachment = await call(port, {
      method: 'POST',
      path: '/internal/delivery-sessions',
      headers: { ...headers, 'X-Prodivix-Delivery-Disposition': 'attachment' },
      body: source,
    });
    expect(attachment.status).toBe(201);
    const delivered = await call(port, {
      method: 'GET',
      path: '/asset',
      host: `${capability}.asset.example.test`,
    });
    expect(delivered.status).toBe(200);
    expect(delivered.headers['content-type']).toBe('application/octet-stream');
    expect(delivered.headers['content-disposition']).toBe(
      'attachment; filename="asset.bin"'
    );
    expect(delivered.headers['x-download-options']).toBe('noopen');
    expect(delivered.body).toEqual(Buffer.from(source));
  });

  it('rejects unauthorized, drifted, unscanned, and quarantined uploads', async () => {
    const { port, store } = await startHost();
    const source = png('must-be-stripped');
    const base = {
      'Content-Type': 'image/png',
      'X-Prodivix-Asset-Digest': digest(source),
      'X-Prodivix-Delivery-Disposition': 'inline',
    };
    expect(
      (
        await call(port, {
          method: 'POST',
          path: '/internal/delivery-sessions',
          headers: base,
          body: source,
        })
      ).status
    ).toBe(403);
    expect(
      (
        await call(port, {
          method: 'POST',
          path: '/internal/delivery-sessions',
          headers: {
            ...base,
            Authorization: 'Bearer internal-token',
            'X-Prodivix-Asset-Digest': `sha256-${'0'.repeat(64)}`,
          },
          body: source,
        })
      ).status
    ).toBe(400);
    const quarantined = await call(port, {
      method: 'POST',
      path: '/internal/delivery-sessions',
      headers: { ...base, Authorization: 'Bearer internal-token' },
      body: source,
    });
    expect(quarantined.status).toBe(422);
    expect(JSON.parse(quarantined.body.toString())).toEqual({
      error: 'asset-quarantined',
      findingCodes: ['AST-SCAN-PNG-NONCANONICAL'],
    });
    const pdf = new TextEncoder().encode('%PDF-1.7');
    expect(
      (
        await call(port, {
          method: 'POST',
          path: '/internal/delivery-sessions',
          headers: {
            Authorization: 'Bearer internal-token',
            'Content-Type': 'application/pdf',
            'X-Prodivix-Asset-Digest': digest(pdf),
            'X-Prodivix-Delivery-Disposition': 'attachment',
          },
          body: pdf,
        })
      ).status
    ).toBe(503);
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
  });

  it('maps scanner infrastructure failures to a fail-closed service response', async () => {
    const unavailableScanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.malware-scanner',
        version: '1',
        supportedMediaTypes: ['application/pdf'],
      },
      async scan() {
        throw new BinaryAssetScannerUnavailableError('timeout');
      },
    };
    const { port, store } = await startHost({
      scanners: [createBinaryAssetPngStructuralScanner(), unavailableScanner],
    });
    const source = new TextEncoder().encode('%PDF-1.7');
    const response = await call(port, {
      method: 'POST',
      path: '/internal/delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'application/pdf',
        'X-Prodivix-Asset-Digest': digest(source),
        'X-Prodivix-Delivery-Disposition': 'attachment',
      },
      body: source,
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body.toString())).toEqual({
      error: 'scanner-unavailable',
    });
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
  });

  it('separates liveness from scanner readiness and gates delivery before upload', async () => {
    const { port, store } = await startHost({
      scannerReadiness: {
        async assertReady() {
          throw new BinaryAssetScannerUnavailableError('stale-database');
        },
      },
    });
    expect((await call(port, { method: 'GET', path: '/healthz' })).status).toBe(
      200
    );
    const ready = await call(port, { method: 'GET', path: '/readyz' });
    expect(ready.status).toBe(503);
    expect(JSON.parse(ready.body.toString())).toEqual({
      error: 'scanner-unavailable',
    });

    const source = png();
    const delivery = await call(port, {
      method: 'POST',
      path: '/internal/png-transform-delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'image/png',
        'X-Prodivix-Asset-Digest': digest(source),
      },
      body: source,
    });
    expect(delivery.status).toBe(503);
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
  });

  it('revokes old delivery sessions and re-scans cached exact bytes after a fresh policy update', async () => {
    const v1Scan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const v2Scan = vi.fn(async () => ({
      verdict: 'clean' as const,
      findingCodes: [] as const,
    }));
    const scanner = (
      version: string,
      scan: BinaryAssetContentScanner['scan']
    ): BinaryAssetContentScanner => ({
      descriptor: {
        id: 'test.dynamic-policy',
        version,
        supportedMediaTypes: ['image/png'],
      },
      scan,
    });
    let snapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'policy-v1',
      scanners: [scanner('policy-v1', v1Scan)],
    });
    const runtime: AssetDeliveryScannerRuntime = {
      async acquire() {
        return snapshot;
      },
    };
    const firstCapability = 'd'.repeat(64);
    const secondCapability = 'e'.repeat(64);
    const { port, store } = await startHost({
      scannerRuntime: runtime,
      capabilities: [firstCapability, secondCapability],
    });
    const source = png('fresh-policy-canary');
    const headers = {
      Authorization: 'Bearer internal-token',
      'Content-Type': 'image/png',
      'X-Prodivix-Asset-Digest': digest(source),
    };
    const first = await call(port, {
      method: 'POST',
      path: '/internal/png-transform-delivery-sessions',
      headers,
      body: source,
    });
    expect(first.status).toBe(201);
    expect(JSON.parse(first.body.toString())).toMatchObject({
      cacheStatus: 'transformed',
    });
    expect(store.inspect().sessions).toBe(1);

    snapshot = createAssetDeliveryScannerSnapshot({
      generation: 2,
      policyVersion: 'policy-v2',
      scanners: [scanner('policy-v2', v2Scan)],
    });
    expect((await call(port, { method: 'GET', path: '/readyz' })).status).toBe(
      200
    );
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
    expect(
      (
        await call(port, {
          method: 'GET',
          path: '/asset',
          host: `${firstCapability}.asset.example.test`,
        })
      ).status
    ).toBe(404);

    const second = await call(port, {
      method: 'POST',
      path: '/internal/png-transform-delivery-sessions',
      headers,
      body: source,
    });
    expect(second.status).toBe(201);
    expect(JSON.parse(second.body.toString())).toMatchObject({
      cacheStatus: 'cache-hit',
      deliveryUrl: `https://${secondCapability}.asset.example.test/asset`,
    });
    expect(v1Scan).toHaveBeenCalledTimes(1);
    expect(v2Scan).toHaveBeenCalledTimes(1);
  });

  it('generation-fences an in-flight scan before it can sign an old-policy session', async () => {
    let releaseScan = (): void => undefined;
    const scanReleased = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    let markScanStarted = (): void => undefined;
    const scanStarted = new Promise<void>((resolve) => {
      markScanStarted = resolve;
    });
    const oldScanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.racing-policy',
        version: 'policy-v1',
        supportedMediaTypes: ['image/png'],
      },
      async scan() {
        markScanStarted();
        await scanReleased;
        return { verdict: 'clean', findingCodes: [] };
      },
    };
    const newScanner: BinaryAssetContentScanner = {
      descriptor: {
        id: 'test.racing-policy',
        version: 'policy-v2',
        supportedMediaTypes: ['image/png'],
      },
      async scan() {
        return { verdict: 'clean', findingCodes: [] };
      },
    };
    let snapshot = createAssetDeliveryScannerSnapshot({
      generation: 1,
      policyVersion: 'policy-v1',
      scanners: [oldScanner],
    });
    const { port, store } = await startHost({
      scannerRuntime: {
        async acquire() {
          return snapshot;
        },
      },
    });
    const source = png();
    const pendingDelivery = call(port, {
      method: 'POST',
      path: '/internal/png-transform-delivery-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': 'image/png',
        'X-Prodivix-Asset-Digest': digest(source),
      },
      body: source,
    });
    await scanStarted;
    snapshot = createAssetDeliveryScannerSnapshot({
      generation: 2,
      policyVersion: 'policy-v2',
      scanners: [newScanner],
    });
    releaseScan();

    const delivery = await pendingDelivery;
    expect(delivery.status).toBe(503);
    expect(JSON.parse(delivery.body.toString())).toEqual({
      error: 'scanner-unavailable',
    });
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
  });
});
