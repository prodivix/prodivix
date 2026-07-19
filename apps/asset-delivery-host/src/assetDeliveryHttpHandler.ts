import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  BinaryAssetQuarantinedError,
  BinaryAssetScannerUnavailableError,
  classifyBinaryAssetDelivery,
  createBinaryAssetBlobReference,
  createBinaryAssetJpegRasterReencodeRecipe,
  createBinaryAssetJpegSanitizeRecipe,
  createBinaryAssetMaterialization,
  createBinaryAssetPngRasterReencodeRecipe,
  createBinaryAssetPngSanitizeRecipe,
  createBinaryAssetScanAttestation,
  executeBinaryAssetTransformPipeline,
  normalizeBinaryAssetMediaType,
  type BinaryAssetContentScanner,
  type BinaryAssetDerivedCache,
  type BinaryAssetTransformer,
  type BinaryAssetTransformRecipe,
} from '@prodivix/assets';
import {
  AssetDeliveryCapacityError,
  type AssetDeliveryDisposition,
  type AssetDeliverySessionGrant,
  type AssetDeliverySessionStore,
} from './assetDeliverySessionStore';
import {
  createAssetDeliveryScannerSnapshot,
  createStaticAssetDeliveryScannerRuntime,
  type AssetDeliveryScannerRuntime,
  type AssetDeliveryScannerSnapshot,
} from './assetDeliveryScannerRuntime';
import { createAssetDeliverySecurityHeaders } from './assetDeliverySecurityPolicy';
import { AssetRasterTransformUnavailableError } from './sharpRasterTransformer';

export type CreateAssetDeliveryHttpHandlerOptions = Readonly<{
  internalToken: string;
  publicBaseUrl: string;
  store: AssetDeliverySessionStore;
  transformer?: BinaryAssetTransformer;
  transformers?: readonly BinaryAssetTransformer[];
  scannerRuntime?: AssetDeliveryScannerRuntime;
  scanners?: readonly BinaryAssetContentScanner[];
  scannerReadiness?: Readonly<{ assertReady(): Promise<unknown> }>;
  derivedCache: BinaryAssetDerivedCache;
  maximumUploadBytes?: number;
  defaultTtlMs?: number;
}>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const validServiceUrl = (value: string): URL => {
  const url = new URL(value);
  const loopback =
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.hostname.endsWith('.localhost');
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.hostname.split('.').length < 2
  ) {
    throw new TypeError(
      'Asset delivery public base URL must be an HTTPS origin.'
    );
  }
  return url;
};

const secureEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.byteLength === rightBytes.byteLength &&
    timingSafeEqual(leftBytes, rightBytes)
  );
};

const readBody = async (
  request: IncomingMessage,
  maximumBytes: number
): Promise<Uint8Array> => {
  if (request.headers['content-encoding']) {
    throw new TypeError('Compressed asset delivery uploads are forbidden.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBytes) {
      throw new RangeError('Asset delivery upload exceeded its byte limit.');
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
};

const responseJson = (
  response: ServerResponse,
  status: number,
  value: unknown
): void => {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'cache-control': 'private, no-store',
    'content-length': body.byteLength,
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
};

const requestCapability = (
  request: IncomingMessage,
  baseHostname: string
): string | undefined => {
  const host = request.headers.host?.trim().toLowerCase();
  if (!host) return undefined;
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return undefined;
  }
  const suffix = `.${baseHostname}`;
  if (!hostname.endsWith(suffix)) return undefined;
  const capability = hostname.slice(0, -suffix.length);
  return /^[a-f0-9]{64}$/u.test(capability) ? capability : undefined;
};

const requestMediaType = (request: IncomingMessage): string => {
  const raw = String(request.headers['content-type'] ?? '');
  if (raw.includes(';')) {
    throw new TypeError(
      'Asset delivery media type must not contain parameters.'
    );
  }
  return normalizeBinaryAssetMediaType(raw);
};

const requestDigest = (request: IncomingMessage): string => {
  const digest = String(request.headers['x-prodivix-asset-digest'] ?? '');
  if (!DIGEST_PATTERN.test(digest)) {
    throw new TypeError('Asset delivery digest is invalid.');
  }
  return digest;
};

const requestTtlMs = (
  request: IncomingMessage,
  defaultTtlMs: number
): number => {
  const seconds = Number(
    request.headers['x-prodivix-delivery-ttl-seconds'] ?? defaultTtlMs / 1_000
  );
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw new TypeError('Asset delivery TTL is invalid.');
  }
  return seconds * 1_000;
};

const scannerForMediaType = (
  scanners: readonly BinaryAssetContentScanner[],
  mediaType: string
): BinaryAssetContentScanner => {
  const matches = scanners.filter((scanner) =>
    scanner.descriptor.supportedMediaTypes.includes(mediaType)
  );
  if (matches.length !== 1) {
    throw new BinaryAssetScannerUnavailableError('configuration');
  }
  return matches[0] as BinaryAssetContentScanner;
};

const transformerForRecipe = (
  transformers: readonly BinaryAssetTransformer[],
  recipe: BinaryAssetTransformRecipe
): BinaryAssetTransformer => {
  const matches = transformers.filter(
    (transformer) =>
      transformer.descriptor.id === recipe.transformerId &&
      transformer.descriptor.version === recipe.transformerVersion &&
      transformer.descriptor.outputMediaTypes.includes(recipe.outputMediaType)
  );
  if (matches.length !== 1) {
    throw new BinaryAssetScannerUnavailableError('configuration');
  }
  return matches[0] as BinaryAssetTransformer;
};

type AssetImageTransform =
  | 'jpeg-raster-reencode'
  | 'jpeg-sanitize'
  | 'png-raster-reencode'
  | 'png-sanitize';

const imageTransformRecipe = (
  request: IncomingMessage,
  mediaType: string,
  sourceDigest: string,
  legacyPngTransform: boolean
): BinaryAssetTransformRecipe => {
  const requested = String(
    request.headers['x-prodivix-image-transform'] ?? ''
  ) as AssetImageTransform | '';
  const transform =
    requested || (mediaType === 'image/png' ? 'png-sanitize' : 'jpeg-sanitize');
  if (legacyPngTransform && transform !== 'png-sanitize') {
    throw new TypeError('Legacy PNG transform cannot select another recipe.');
  }
  switch (transform) {
    case 'png-sanitize':
      if (mediaType !== 'image/png') break;
      return createBinaryAssetPngSanitizeRecipe(sourceDigest);
    case 'png-raster-reencode':
      if (mediaType !== 'image/png') break;
      return createBinaryAssetPngRasterReencodeRecipe(sourceDigest);
    case 'jpeg-sanitize':
      if (mediaType !== 'image/jpeg') break;
      return createBinaryAssetJpegSanitizeRecipe(sourceDigest);
    case 'jpeg-raster-reencode':
      if (mediaType !== 'image/jpeg') break;
      return createBinaryAssetJpegRasterReencodeRecipe(sourceDigest);
  }
  throw new TypeError('Asset delivery image transform is invalid.');
};

const sessionResponse = (
  publicBaseUrl: URL,
  grant: AssetDeliverySessionGrant,
  cacheStatus: 'cache-hit' | 'not-applicable' | 'transformed'
) => {
  const deliveryUrl = new URL(publicBaseUrl);
  deliveryUrl.hostname = `${grant.capability}.${publicBaseUrl.hostname}`;
  deliveryUrl.pathname = '/asset';
  return Object.freeze({
    deliveryUrl: deliveryUrl.href,
    expiresAt: grant.session.expiresAt,
    digest: grant.session.reference.digest,
    mediaType: grant.session.reference.mediaType,
    byteLength: grant.session.reference.byteLength,
    disposition: grant.session.disposition,
    deliveryClass: grant.session.deliveryClass,
    recipeDigest: grant.session.recipeDigest,
    metadata: grant.session.metadata,
    cacheStatus,
  });
};

/** Serves only scanned bytes from per-session capability origins. */
export const createAssetDeliveryHttpHandler = (
  options: CreateAssetDeliveryHttpHandlerOptions
) => {
  if (!options.internalToken.trim()) {
    throw new TypeError('Asset delivery internal token is required.');
  }
  if (options.transformer && options.transformers) {
    throw new TypeError('Asset delivery transformer composition is ambiguous.');
  }
  const transformers = options.transformers
    ? Object.freeze([...options.transformers])
    : options.transformer
      ? Object.freeze([options.transformer])
      : Object.freeze([]);
  if (!transformers.length) {
    throw new TypeError('At least one asset delivery transformer is required.');
  }
  const hasDynamicRuntime = options.scannerRuntime !== undefined;
  if (
    hasDynamicRuntime &&
    (options.scanners !== undefined || options.scannerReadiness !== undefined)
  ) {
    throw new TypeError(
      'Asset delivery scanner runtime composition is ambiguous.'
    );
  }
  if (
    hasDynamicRuntime &&
    typeof options.scannerRuntime?.acquire !== 'function'
  ) {
    throw new TypeError('Asset delivery scanner runtime is invalid.');
  }
  const scannerRuntime =
    options.scannerRuntime ??
    createStaticAssetDeliveryScannerRuntime({
      scanners: options.scanners ?? [],
      readiness: options.scannerReadiness as Readonly<{
        assertReady(): Promise<unknown>;
      }>,
    });
  let observedSnapshot: AssetDeliveryScannerSnapshot | undefined;
  const acquireScannerSnapshot =
    async (): Promise<AssetDeliveryScannerSnapshot> => {
      const acquired = await scannerRuntime.acquire();
      const snapshot = createAssetDeliveryScannerSnapshot({
        generation: acquired.generation,
        policyVersion: acquired.policyVersion,
        scanners: acquired.scanners,
      });
      const previous = observedSnapshot;
      if (!previous) {
        observedSnapshot = snapshot;
        return snapshot;
      }
      if (
        snapshot.generation < previous.generation ||
        (snapshot.generation === previous.generation &&
          snapshot.policyVersion !== previous.policyVersion) ||
        (snapshot.generation !== previous.generation &&
          snapshot.policyVersion === previous.policyVersion)
      ) {
        throw new BinaryAssetScannerUnavailableError('policy-drift');
      }
      if (snapshot.generation > previous.generation) {
        options.store.revokeAll();
        observedSnapshot = snapshot;
      }
      return snapshot;
    };
  const assertSigningSnapshot = async (
    expected: AssetDeliveryScannerSnapshot
  ): Promise<void> => {
    const current = await acquireScannerSnapshot();
    if (
      current.generation !== expected.generation ||
      current.policyVersion !== expected.policyVersion
    ) {
      throw new BinaryAssetScannerUnavailableError('policy-drift');
    }
  };
  const publicBaseUrl = validServiceUrl(options.publicBaseUrl);
  const maximumUploadBytes = options.maximumUploadBytes ?? 32 * 1024 * 1024;
  const defaultTtlMs = options.defaultTtlMs ?? 10 * 60 * 1_000;
  if (!Number.isSafeInteger(maximumUploadBytes) || maximumUploadBytes < 1) {
    throw new TypeError('Asset delivery upload limit is invalid.');
  }
  if (!Number.isSafeInteger(defaultTtlMs) || defaultTtlMs < 1_000) {
    throw new TypeError('Asset delivery default TTL is invalid.');
  }

  return async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://asset.invalid');
      if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
        responseJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/readyz') {
        await acquireScannerSnapshot();
        responseJson(response, 200, { status: 'ready' });
        return;
      }

      const internalCreate =
        request.method === 'POST' &&
        (requestUrl.pathname === '/internal/delivery-sessions' ||
          requestUrl.pathname === '/internal/png-transform-delivery-sessions' ||
          requestUrl.pathname ===
            '/internal/image-transform-delivery-sessions');
      if (internalCreate) {
        const authorization = request.headers.authorization ?? '';
        if (
          !authorization.startsWith('Bearer ') ||
          !secureEqual(
            authorization.slice('Bearer '.length),
            options.internalToken
          )
        ) {
          responseJson(response, 403, { error: 'forbidden' });
          return;
        }
        const scannerSnapshot = await acquireScannerSnapshot();
        const mediaType = requestMediaType(request);
        const expectedDigest = requestDigest(request);
        const contents = await readBody(request, maximumUploadBytes);
        const reference = createBinaryAssetBlobReference({
          contents,
          mediaType,
        });
        if (reference.digest !== expectedDigest) {
          responseJson(response, 400, { error: 'asset-digest-mismatch' });
          return;
        }
        const ttlMs = requestTtlMs(request, defaultTtlMs);

        const imageTransform =
          requestUrl.pathname === '/internal/png-transform-delivery-sessions' ||
          requestUrl.pathname === '/internal/image-transform-delivery-sessions';
        if (imageTransform) {
          const legacyPngTransform =
            requestUrl.pathname === '/internal/png-transform-delivery-sessions';
          if (
            (legacyPngTransform && mediaType !== 'image/png') ||
            (mediaType !== 'image/png' && mediaType !== 'image/jpeg')
          ) {
            responseJson(response, 415, { error: 'unsupported-media-type' });
            return;
          }
          const requestedTransformDisposition = String(
            request.headers['x-prodivix-delivery-disposition'] ?? ''
          );
          if (
            requestedTransformDisposition !== 'inline' &&
            !(legacyPngTransform && requestedTransformDisposition === '')
          ) {
            responseJson(response, 400, { error: 'invalid-disposition' });
            return;
          }
          const source = createBinaryAssetMaterialization({
            assetDocumentId: 'asset-delivery-source',
            reference,
            contents,
          });
          const scanner = scannerForMediaType(
            scannerSnapshot.scanners,
            mediaType
          );
          const recipe = imageTransformRecipe(
            request,
            mediaType,
            reference.digest,
            legacyPngTransform
          );
          const transformer = transformerForRecipe(transformers, recipe);
          const transformed = await executeBinaryAssetTransformPipeline({
            source,
            recipe,
            transformer,
            scanner,
            cache: options.derivedCache,
          });
          await assertSigningSnapshot(scannerSnapshot);
          const grant = options.store.create(
            {
              reference: transformed.derived.materialization.reference,
              contents: transformed.derived.materialization.contents,
              scan: transformed.derived.scan,
              disposition: 'inline',
              recipeDigest: transformed.derived.recipe.recipeDigest,
              metadata: transformed.derived.metadata,
            },
            ttlMs
          );
          responseJson(
            response,
            201,
            sessionResponse(publicBaseUrl, grant, transformed.kind)
          );
          return;
        }

        const disposition = String(
          request.headers['x-prodivix-delivery-disposition'] ?? ''
        ) as AssetDeliveryDisposition;
        if (disposition !== 'inline' && disposition !== 'attachment') {
          responseJson(response, 400, { error: 'invalid-disposition' });
          return;
        }
        if (
          disposition === 'inline' &&
          classifyBinaryAssetDelivery(mediaType) !== 'static'
        ) {
          responseJson(response, 422, { error: 'active-inline-forbidden' });
          return;
        }
        const scanner = scannerForMediaType(
          scannerSnapshot.scanners,
          mediaType
        );
        const scanResult = await scanner.scan({ reference, contents });
        const scan = createBinaryAssetScanAttestation({
          subjectDigest: reference.digest,
          scannerId: scanner.descriptor.id,
          scannerVersion: scanner.descriptor.version,
          verdict: scanResult.verdict,
          findingCodes: scanResult.findingCodes,
        });
        if (scan.verdict !== 'clean') {
          throw new BinaryAssetQuarantinedError(scan);
        }
        await assertSigningSnapshot(scannerSnapshot);
        const grant = options.store.create(
          {
            reference,
            contents,
            scan,
            disposition,
            recipeDigest: null,
            metadata: null,
          },
          ttlMs
        );
        responseJson(
          response,
          201,
          sessionResponse(publicBaseUrl, grant, 'not-applicable')
        );
        return;
      }

      if (
        (request.method !== 'GET' && request.method !== 'HEAD') ||
        requestUrl.pathname !== '/asset' ||
        requestUrl.search ||
        requestUrl.hash
      ) {
        responseJson(response, 404, { error: 'not-found' });
        return;
      }
      const capability = requestCapability(request, publicBaseUrl.hostname);
      const session = capability
        ? options.store.resolve(capability)
        : undefined;
      if (!session) {
        responseJson(response, 404, { error: 'not-found' });
        return;
      }
      const attachment = session.disposition === 'attachment';
      const inlineFilename =
        session.reference.mediaType === 'image/jpeg'
          ? 'asset.jpg'
          : session.reference.mediaType === 'image/png'
            ? 'asset.png'
            : 'asset.bin';
      const headers: Record<string, string | number> = {
        ...createAssetDeliverySecurityHeaders(),
        'content-disposition': attachment
          ? 'attachment; filename="asset.bin"'
          : `inline; filename="${inlineFilename}"`,
        'content-length': session.contents.byteLength,
        'content-type': attachment
          ? 'application/octet-stream'
          : session.reference.mediaType,
        etag: `"${session.reference.digest}"`,
      };
      response.writeHead(200, headers);
      response.end(
        request.method === 'HEAD' ? undefined : Buffer.from(session.contents)
      );
    } catch (error) {
      if (error instanceof RangeError) {
        responseJson(response, 413, { error: 'payload-too-large' });
        return;
      }
      if (error instanceof BinaryAssetQuarantinedError) {
        responseJson(response, 422, {
          error: 'asset-quarantined',
          findingCodes: error.attestation.findingCodes,
        });
        return;
      }
      if (error instanceof BinaryAssetScannerUnavailableError) {
        responseJson(response, 503, { error: 'scanner-unavailable' });
        return;
      }
      if (error instanceof AssetDeliveryCapacityError) {
        responseJson(response, 503, { error: 'delivery-capacity-exhausted' });
        return;
      }
      if (error instanceof AssetRasterTransformUnavailableError) {
        responseJson(response, 503, { error: 'image-transform-unavailable' });
        return;
      }
      responseJson(response, 400, { error: 'invalid-delivery-request' });
    }
  };
};
