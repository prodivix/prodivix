import { createHash, timingSafeEqual } from 'node:crypto';
import { extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  decodeExecutionPreviewBundle,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import {
  PreviewSessionCapacityError,
  type PreviewSessionStore,
} from './previewSessionStore';
import { createPreviewSecurityHeaders } from './previewSecurityPolicy';

export type CreatePreviewHttpHandlerOptions = Readonly<{
  internalToken: string;
  publicBaseUrl: string;
  editorOrigins: readonly string[];
  store: PreviewSessionStore;
  maximumUploadBytes?: number;
  defaultTtlMs?: number;
}>;

const mediaTypes: Readonly<Record<string, string>> = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
});

const validServiceUrl = (value: string, label: string): URL => {
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
  )
    throw new TypeError(`${label} must be an HTTPS origin.`);
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
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maximumBytes)
      throw new RangeError('Preview upload exceeded its byte limit.');
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

const artifactDigest = (contents: Uint8Array): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

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

const requestFilePath = (request: IncomingMessage): string | undefined => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://preview.invalid')
      .pathname;
    const decoded = decodeURIComponent(pathname.slice(1));
    if (
      decoded.includes('\\') ||
      decoded.includes('\0') ||
      decoded.split('/').some((segment) => segment === '.' || segment === '..')
    )
      return undefined;
    return decoded;
  } catch {
    return undefined;
  }
};

const isDocumentNavigation = (request: IncomingMessage): boolean =>
  ['document', 'iframe'].includes(
    String(request.headers['sec-fetch-dest'] ?? '').toLowerCase()
  ) ||
  String(request.headers.accept ?? '')
    .toLowerCase()
    .includes('text/html');

/** Serves strict Preview bundles from per-session capability origins. */
export const createPreviewHttpHandler = (
  options: CreatePreviewHttpHandlerOptions
) => {
  if (!options.internalToken.trim())
    throw new TypeError('Preview internal token is required.');
  if (!options.editorOrigins.length)
    throw new TypeError('Preview editor origins are required.');
  const editorOrigins = options.editorOrigins.map((value) => {
    const url = new URL(value);
    const loopback =
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
      url.hostname.endsWith('.localhost');
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username ||
      url.password ||
      url.origin !== value
    )
      throw new TypeError('Preview editor origin is invalid.');
    return url.origin;
  });
  const publicBaseUrl = validServiceUrl(
    options.publicBaseUrl,
    'Preview public base URL'
  );
  const maximumUploadBytes = options.maximumUploadBytes ?? 64 * 1024 * 1024;
  const defaultTtlMs = options.defaultTtlMs ?? 10 * 60 * 1_000;
  if (!Number.isSafeInteger(maximumUploadBytes) || maximumUploadBytes < 1)
    throw new TypeError('Preview upload limit must be a positive integer.');
  if (!Number.isSafeInteger(defaultTtlMs) || defaultTtlMs < 1_000)
    throw new TypeError('Preview default TTL must be at least one second.');
  const securityHeaders = createPreviewSecurityHeaders(editorOrigins);

  return async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://preview.invalid');
      if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
        responseJson(response, 200, { status: 'ok' });
        return;
      }
      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/internal/preview-sessions'
      ) {
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
        const contentType = String(request.headers['content-type'] ?? '')
          .split(';', 1)[0]
          ?.trim()
          .toLowerCase();
        if (contentType !== EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE) {
          responseJson(response, 415, { error: 'unsupported-media-type' });
          return;
        }
        const expectedDigest = String(
          request.headers['x-prodivix-artifact-digest'] ?? ''
        );
        const expectedSnapshotDigest = String(
          request.headers['x-prodivix-snapshot-digest'] ?? ''
        );
        if (!/^sha256-[a-f0-9]{64}$/u.test(expectedDigest)) {
          responseJson(response, 400, { error: 'invalid-artifact-digest' });
          return;
        }
        if (!/^sha256-[a-f0-9]{64}$/u.test(expectedSnapshotDigest)) {
          responseJson(response, 400, { error: 'invalid-snapshot-digest' });
          return;
        }
        const contents = await readBody(request, maximumUploadBytes);
        if (artifactDigest(contents) !== expectedDigest) {
          responseJson(response, 400, { error: 'artifact-digest-mismatch' });
          return;
        }
        const bundle = decodeExecutionPreviewBundle(contents);
        if (bundle.snapshotDigest !== expectedSnapshotDigest) {
          responseJson(response, 400, { error: 'snapshot-digest-mismatch' });
          return;
        }
        const ttlHeader = Number(
          request.headers['x-prodivix-preview-ttl-seconds'] ??
            defaultTtlMs / 1_000
        );
        if (!Number.isSafeInteger(ttlHeader) || ttlHeader < 1) {
          responseJson(response, 400, { error: 'invalid-preview-ttl' });
          return;
        }
        const grant = options.store.create(bundle, ttlHeader * 1_000);
        const previewUrl = new URL(publicBaseUrl);
        previewUrl.hostname = `${grant.capability}.${publicBaseUrl.hostname}`;
        responseJson(response, 201, {
          previewUrl: previewUrl.href,
          expiresAt: grant.session.expiresAt,
        });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        responseJson(response, 404, { error: 'not-found' });
        return;
      }
      const capability = requestCapability(request, publicBaseUrl.hostname);
      const session = capability
        ? options.store.resolve(capability)
        : undefined;
      const requestedPath = requestFilePath(request);
      if (!session || requestedPath === undefined) {
        responseJson(response, 404, { error: 'not-found' });
        return;
      }
      const path = requestedPath || session.bundle.entryFilePath;
      const exact = session.bundle.files.find((file) => file.path === path);
      const file =
        exact ??
        (isDocumentNavigation(request)
          ? session.bundle.files.find(
              (candidate) => candidate.path === session.bundle.entryFilePath
            )
          : undefined);
      if (!file) {
        responseJson(response, 404, { error: 'not-found' });
        return;
      }
      const headers: Record<string, string | number> = {
        ...securityHeaders,
        'content-length': file.contents.byteLength,
        'content-type':
          mediaTypes[extname(file.path).toLowerCase()] ??
          'application/octet-stream',
        etag: `"${file.digest}"`,
      };
      response.writeHead(200, headers);
      response.end(
        request.method === 'HEAD' ? undefined : Buffer.from(file.contents)
      );
    } catch (error) {
      if (error instanceof RangeError) {
        responseJson(response, 413, { error: 'payload-too-large' });
        return;
      }
      if (error instanceof PreviewSessionCapacityError) {
        responseJson(response, 503, { error: 'preview-capacity-exhausted' });
        return;
      }
      responseJson(response, 400, { error: 'invalid-preview-request' });
    }
  };
};
