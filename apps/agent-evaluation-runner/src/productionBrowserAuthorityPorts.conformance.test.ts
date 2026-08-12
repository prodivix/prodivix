import { request as httpRequest } from 'node:http';

import { digestVerificationValue } from '@prodivix/verification';
import {
  digestBrowserVerificationBytes,
  PRODUCTION_BROWSER_CONTROL_HOST_PATH,
} from '@prodivix/verification-browser';
import { describe, expect, it } from 'vitest';
import {
  createProductionAgentEvaluationBrowserCanaryScanner,
  createProductionAgentEvaluationBrowserPreviewAuthority,
  createProductionAgentEvaluationRemoteRuntimeProvider,
} from './productionBrowserAuthorityPorts';

const signal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const previewIdentity = (suffix: string) => ({
  attemptId: `attempt.preview.${suffix}`,
  generation: 1,
  requestId: `request.preview.${suffix}`,
  executionId: `execution.preview.${suffix}`,
  snapshotDigest: digestVerificationValue({ snapshot: suffix }),
  buildBundleDigest: digestVerificationValue({ bundle: suffix }),
  entryFilePath: 'index.html',
  entryDigest: digestVerificationValue({ entry: suffix }),
  buildFileCount: 1,
});

const rawRequest = (
  origin: string,
  input: Readonly<{ method: string; path: string; host?: string }>
): Promise<number> =>
  new Promise((resolve, reject) => {
    const url = new URL(origin);
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port: Number(url.port),
        method: input.method,
        path: input.path,
        headers: { Host: input.host ?? url.host },
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response.statusCode ?? 0));
      }
    );
    request.once('error', reject);
    request.end();
  });

describe('production browser authority ports', () => {
  it('serves only the exact reserved content-addressed route and retires cleanly', async () => {
    const authority = createProductionAgentEvaluationBrowserPreviewAuthority();
    const bytes = new TextEncoder().encode('<!doctype html><main>ready</main>');
    const digest = digestBrowserVerificationBytes(bytes);
    const controlHostBytes = new TextEncoder().encode(
      '<!doctype html><title>control</title>'
    );
    const identity = { ...previewIdentity('positive'), entryDigest: digest };
    const evidence = await authority.reserve(identity);
    const lease = await authority.port.materialize(
      {
        ...identity,
        entryDigest: digest,
        entryRoutes: ['/'],
        resources: [
          {
            path: '/',
            kind: 'entry',
            contentDigest: digest,
            contents: bytes,
          },
          {
            path: PRODUCTION_BROWSER_CONTROL_HOST_PATH,
            kind: 'control-host',
            contentDigest: digestBrowserVerificationBytes(controlHostBytes),
            contents: controlHostBytes,
          },
          {
            path: '/index.html',
            kind: 'bundle',
            contentDigest: digest,
            contents: bytes,
          },
        ],
      },
      signal
    );

    expect(lease.remoteExecution).toEqual(evidence);
    expect(await rawRequest(lease.origin, { method: 'GET', path: '/' })).toBe(
      200
    );
    expect(
      await rawRequest(lease.origin, { method: 'GET', path: '/fallback' })
    ).toBe(404);
    expect(await rawRequest(lease.origin, { method: 'POST', path: '/' })).toBe(
      405
    );
    expect(
      await rawRequest(lease.origin, {
        method: 'GET',
        path: '/',
        host: 'example.test',
      })
    ).toBe(421);
    await expect(lease.retire(signal)).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    await expect(lease.retire(signal)).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    await expect(authority.drainAndDispose()).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
  });

  it('destroys a reserved server and its sockets during crash-style drain', async () => {
    const authority = createProductionAgentEvaluationBrowserPreviewAuthority();
    const identity = previewIdentity('drain');
    await authority.reserve(identity);
    const origin = authority.originFor(identity.requestId)!;
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);

    await expect(authority.drainAndDispose()).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    await expect(fetch(`${origin}/`)).rejects.toThrow();
    await expect(authority.reserve(previewIdentity('late'))).rejects.toThrow(
      /closed/u
    );
  });

  it('reads the callback-bound canary set for every scan and fails closed on a match', async () => {
    let canaries = ['PRODIVIX-SECRET-CANARY-PREVIEW-0001'];
    const scanner = createProductionAgentEvaluationBrowserCanaryScanner(
      () => canaries
    );
    await expect(
      scanner.scan(
        {
          sourceKind: 'production-bundle',
          sourceId: 'entry.js',
          contents: new TextEncoder().encode(canaries[0]!),
        },
        signal
      )
    ).rejects.toThrow(/Sensitive canary material/u);

    canaries = ['PRODIVIX-SECRET-CANARY-PREVIEW-0002'];
    await expect(
      scanner.scan(
        {
          sourceKind: 'production-bundle',
          sourceId: 'entry.js',
          contents: new TextEncoder().encode('clean'),
        },
        signal
      )
    ).resolves.toMatchObject({ verdict: 'clean' });
    await expect(
      scanner.scan(
        {
          sourceKind: 'production-bundle',
          sourceId: 'entry.js',
          contents: new TextEncoder().encode(canaries[0]!),
        },
        signal
      )
    ).rejects.toThrow(/Sensitive canary material/u);
  });

  it('binds runtime-remote descriptor identity to the production port', () => {
    const port = createProductionAgentEvaluationRemoteRuntimeProvider();
    const provider = port.create({
      reset: async () => undefined,
      apply: async ({ expectedControlDigest }) => ({
        appliedControlDigest: expectedControlDigest,
        fontReady: true,
      }),
      probe: async () => ({
        storage: 0,
        cookies: 0,
        indexedDb: 0,
        cacheStorage: 0,
        serviceWorkers: 0,
        workers: 0,
        streams: 0,
        timers: 0,
        effects: 0,
        authSessions: 0,
      }),
      cleanup: async () => undefined,
    });
    expect(provider.descriptor).toMatchObject({
      id: port.providerId,
      version: port.providerVersion,
      surface: 'remote',
    });
    expect(port.implementationDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
  });
});
