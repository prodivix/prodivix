import { createHash } from 'node:crypto';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXECUTION_PREVIEW_BUNDLE_FORMAT,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import { createPreviewHttpHandler } from './previewHttpHandler';
import { createPreviewSessionStore } from './previewSessionStore';

const digest = (contents: Uint8Array | string): string =>
  `sha256-${createHash('sha256').update(contents).digest('hex')}`;

const file = (path: string, contents: string) => ({
  path,
  size: Buffer.byteLength(contents),
  digest: digest(contents),
  encoding: 'base64',
  contents: Buffer.from(contents).toString('base64'),
});

const bundle = (): Buffer =>
  Buffer.from(
    JSON.stringify({
      format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
      entryFilePath: 'index.html',
      bundle: {
        format: 'prodivix.execution-build-bundle.v1',
        snapshotDigest: `sha256-${'a'.repeat(64)}`,
        target: {
          presetId: 'react-vite',
          framework: 'react',
          runtime: 'browser',
        },
        files: [
          file('assets/app.js', 'document.body.dataset.ready = "true";'),
          file(
            'index.html',
            '<script type="module" src="/assets/app.js"></script>'
          ),
        ],
      },
    })
  );

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
          Host: input.host ?? 'preview.example.test',
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

describe('Remote Preview Host', () => {
  it('issues a short-lived origin and serves exact files plus SPA fallback', async () => {
    let now = 1_000;
    const capability = 'b'.repeat(64);
    const store = createPreviewSessionStore({
      maximumSessions: 2,
      maximumTotalBytes: 1_024 * 1_024,
      maximumTtlMs: 60_000,
      now: () => now,
      createCapability: () => capability,
    });
    const server = createServer(
      createPreviewHttpHandler({
        internalToken: 'internal-token',
        publicBaseUrl: 'https://preview.example.test',
        editorOrigins: ['https://editor.example.test'],
        store,
      })
    );
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const port = (server.address() as AddressInfo).port;
    const contents = bundle();
    const created = await call(port, {
      method: 'POST',
      path: '/internal/preview-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
        'X-Prodivix-Artifact-Digest': digest(contents),
        'X-Prodivix-Snapshot-Digest': `sha256-${'a'.repeat(64)}`,
        'X-Prodivix-Preview-Ttl-Seconds': '30',
      },
      body: contents,
    });
    expect(created.status).toBe(201);
    expect(JSON.parse(created.body.toString())).toEqual({
      previewUrl: `https://${capability}.preview.example.test/`,
      expiresAt: 31_000,
    });

    const document = await call(port, {
      method: 'GET',
      path: '/routes/settings',
      host: `${capability}.preview.example.test`,
      headers: { Accept: 'text/html' },
    });
    expect(document.status).toBe(200);
    expect(document.body.toString()).toContain('/assets/app.js');
    expect(document.headers['content-security-policy']).toContain(
      'sandbox allow-scripts'
    );
    expect(document.headers['content-security-policy']).toContain(
      'frame-ancestors https://editor.example.test'
    );
    expect(document.headers['permissions-policy']).toContain('camera=()');
    expect(document.headers['set-cookie']).toBeUndefined();

    const asset = await call(port, {
      method: 'GET',
      path: '/assets/app.js',
      host: `${capability}.preview.example.test`,
    });
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toBe(
      'text/javascript; charset=utf-8'
    );

    now = 31_000;
    expect(
      (
        await call(port, {
          method: 'GET',
          path: '/',
          host: `${capability}.preview.example.test`,
          headers: { Accept: 'text/html' },
        })
      ).status
    ).toBe(404);
  });

  it('rejects invalid authority, media type, and artifact digest', async () => {
    const store = createPreviewSessionStore({
      maximumSessions: 1,
      maximumTotalBytes: 1_024 * 1_024,
      maximumTtlMs: 60_000,
    });
    const server = createServer(
      createPreviewHttpHandler({
        internalToken: 'internal-token',
        publicBaseUrl: 'https://preview.example.test',
        editorOrigins: ['https://editor.example.test'],
        store,
      })
    );
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const port = (server.address() as AddressInfo).port;
    const contents = bundle();
    const unauthorized = await call(port, {
      method: 'POST',
      path: '/internal/preview-sessions',
      headers: {
        Authorization: 'Bearer wrong-token',
        'Content-Type': EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
        'X-Prodivix-Artifact-Digest': digest(contents),
        'X-Prodivix-Snapshot-Digest': `sha256-${'a'.repeat(64)}`,
      },
      body: contents,
    });
    expect(unauthorized.status).toBe(403);
    const mismatched = await call(port, {
      method: 'POST',
      path: '/internal/preview-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
        'X-Prodivix-Artifact-Digest': `sha256-${'0'.repeat(64)}`,
        'X-Prodivix-Snapshot-Digest': `sha256-${'a'.repeat(64)}`,
      },
      body: contents,
    });
    expect(mismatched.status).toBe(400);
    const snapshotMismatched = await call(port, {
      method: 'POST',
      path: '/internal/preview-sessions',
      headers: {
        Authorization: 'Bearer internal-token',
        'Content-Type': EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
        'X-Prodivix-Artifact-Digest': digest(contents),
        'X-Prodivix-Snapshot-Digest': `sha256-${'0'.repeat(64)}`,
      },
      body: contents,
    });
    expect(snapshotMismatched.status).toBe(400);
    expect(store.inspect()).toEqual({ sessions: 0, usedBytes: 0 });
  });
});
