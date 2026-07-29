import { createServer } from 'node:http';
import type { ExecutionPreviewBundle } from '@prodivix/runtime-core';
import { GOLDEN_BROWSER_RESPONSE_POLICIES } from './generatedProjectHarness';
import { digestGoldenG3V6RemotePreviewBytes } from './goldenG3V6RemotePreviewBundle';

const contentTypeFor = (path: string): string => {
  const extension = path.toLowerCase().split('.').at(-1);
  switch (extension) {
    case 'css':
      return 'text/css; charset=utf-8';
    case 'html':
      return 'text/html; charset=utf-8';
    case 'ico':
      return 'image/x-icon';
    case 'js':
      return 'text/javascript; charset=utf-8';
    case 'json':
    case 'map':
      return 'application/json; charset=utf-8';
    case 'svg':
      return 'image/svg+xml';
    case 'woff':
      return 'font/woff';
    case 'woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
};

export type GoldenG3V6RemotePreviewHost = Readonly<{
  origin: string;
  entryUrl: string;
  entryDigest: string;
  isActive(): boolean;
  close(): Promise<void>;
}>;

/**
 * Serves the resolver-decoded bundle from memory on an independent origin.
 * The initial readiness request proves that the served entry bytes retain
 * their content-addressed file digest.
 */
export const startGoldenG3V6RemotePreviewHost = async (
  bundle: ExecutionPreviewBundle,
  excludedOrigins: readonly string[]
): Promise<GoldenG3V6RemotePreviewHost> => {
  const files = new Map(bundle.files.map((file) => [file.path, file] as const));
  const entry = files.get(bundle.entryFilePath);
  if (!entry) {
    throw new Error(
      'Golden V6 Remote Preview materializer cannot find the decoded entrypoint.'
    );
  }

  let active = true;
  const server = createServer((request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { allow: 'GET, HEAD' });
        response.end();
        return;
      }
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const hostDocument =
        requestUrl.pathname === '/__prodivix-golden-host.html';
      let selected = entry;
      if (!hostDocument) {
        let decodedPath = '';
        try {
          decodedPath = decodeURIComponent(requestUrl.pathname).replace(
            /^\/+/u,
            ''
          );
        } catch {
          decodedPath = '';
        }
        if (
          decodedPath &&
          !decodedPath.split('/').some((segment) => segment === '..')
        ) {
          selected = files.get(decodedPath) ?? entry;
        }
      }
      const contents = hostDocument
        ? Buffer.from(
            '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
            'utf8'
          )
        : Buffer.from(selected.contents);
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': String(contents.byteLength),
        'content-security-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.contentSecurityPolicy,
        'content-type': hostDocument
          ? 'text/html; charset=utf-8'
          : contentTypeFor(selected.path),
        'permissions-policy':
          GOLDEN_BROWSER_RESPONSE_POLICIES.permissionsPolicy,
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      response.writeHead(500, {
        'content-type': 'text/plain; charset=utf-8',
      });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error(
      'Golden V6 Remote Preview materializer has no TCP address.'
    );
  }
  const origin = `http://127.0.0.1:${address.port}`;
  const normalizedExcludedOrigins = new Set(
    excludedOrigins.map((candidate) => new URL(candidate).origin)
  );
  if (normalizedExcludedOrigins.has(origin)) {
    server.close();
    throw new Error(
      'Golden V6 Remote Preview materializer reused an excluded origin.'
    );
  }
  const entryUrl = new URL(bundle.entryFilePath, `${origin}/`).href;
  const response = await fetch(entryUrl);
  const servedEntry = new Uint8Array(await response.arrayBuffer());
  if (
    !response.ok ||
    servedEntry.byteLength !== entry.contents.byteLength ||
    digestGoldenG3V6RemotePreviewBytes(servedEntry) !== entry.digest
  ) {
    server.closeAllConnections();
    server.close();
    throw new Error(
      'Golden V6 Remote Preview origin did not serve the decoded bundle bytes.'
    );
  }

  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    origin,
    entryUrl,
    entryDigest: entry.digest,
    isActive: () => active,
    close: async (): Promise<void> => {
      if (closePromise) return closePromise;
      active = false;
      closePromise = new Promise<void>((resolvePromise, rejectPromise) => {
        server.closeAllConnections();
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise()
        );
      });
      return closePromise;
    },
  });
};
