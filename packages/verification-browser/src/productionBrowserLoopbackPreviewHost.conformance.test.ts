import { Server as NetServer } from 'node:net';
import { digestVerificationValue } from '@prodivix/verification';
import { describe, expect, it, vi } from 'vitest';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import {
  PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST,
  PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_CLEANUP_TIMEOUT_MS,
  createProductionBrowserLoopbackPreviewHost,
} from './productionBrowserLoopbackPreviewHost';
import { PRODUCTION_BROWSER_CONTROL_HOST_PATH } from './productionChromiumBrowserAuthorityResources';
import type { ProductionBrowserPreviewResource } from './productionChromiumBrowserAuthority.types';

const encoder = new TextEncoder();
const passiveSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const resource = (
  path: string,
  kind: ProductionBrowserPreviewResource['kind'],
  source: string
): ProductionBrowserPreviewResource => {
  const contents = encoder.encode(source);
  return Object.freeze({
    path,
    kind,
    contentDigest: digestBrowserVerificationBytes(contents),
    contents,
  });
};

const materialization = () => {
  const entry = resource('/index.html', 'bundle', '<main>catalog</main>');
  return Object.freeze({
    attemptId: 'attempt:preview-production',
    generation: 1,
    snapshotDigest: digestVerificationValue('snapshot'),
    buildBundleDigest: digestVerificationValue('build-bundle'),
    requestId: 'request:preview-production',
    executionId: 'execution:preview-production',
    entryFilePath: 'index.html',
    entryDigest: entry.contentDigest,
    buildFileCount: 1,
    entryRoutes: Object.freeze(['/']),
    resources: Object.freeze([
      resource('/', 'entry', '<main>catalog</main>'),
      resource(
        PRODUCTION_BROWSER_CONTROL_HOST_PATH,
        'control-host',
        '<!doctype html><title>control</title>'
      ),
      entry,
    ]),
  });
};

const reservation = (input: ReturnType<typeof materialization>) => {
  const {
    entryRoutes: _entryRoutes,
    resources: _resources,
    ...identity
  } = input;
  return identity;
};

describe('production browser loopback preview host', () => {
  it('serves exact content-addressed bytes, replays one request idempotently, and retires cleanly', async () => {
    expect(PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_CLEANUP_TIMEOUT_MS).toBe(
      5_000
    );
    const host = createProductionBrowserLoopbackPreviewHost();
    const input = materialization();
    const [reserved, reservedReplay] = await Promise.all([
      host.reserve(reservation(input), passiveSignal),
      host.reserve(reservation(input), passiveSignal),
    ]);
    expect((await fetch(reserved.materializedOrigin)).status).toBe(503);
    const [lease, replay] = await Promise.all([
      host.materialize(input, passiveSignal),
      host.materialize(input, passiveSignal),
    ]);

    expect(reservedReplay).toEqual(reserved);
    expect(lease.remoteExecution).toEqual(reserved);
    expect(replay).toBe(lease);
    expect(lease.servingMode).toBe('route-verified-content-addressed');
    expect(lease.remoteExecution).toMatchObject({
      attemptId: input.attemptId,
      generation: input.generation,
      requestId: input.requestId,
      executionId: input.executionId,
      snapshotDigest: input.snapshotDigest,
      materializedBundleDigest: input.buildBundleDigest,
      materializedOrigin: lease.origin,
      materializedEntryUrl: `${lease.origin}/index.html`,
      materializedEntryFilePath: input.entryFilePath,
      materializedEntryDigest: input.entryDigest,
      materializedFileCount: input.buildFileCount,
    });
    const response = await fetch(`${lease.origin}/index.html`);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(
      String(body.byteLength)
    );
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(digestBrowserVerificationBytes(body)).toBe(input.entryDigest);
    expect((await fetch(`${lease.origin}/missing`)).status).toBe(404);
    expect(
      (
        await fetch(`${lease.origin}/index.html`, {
          headers: { Range: 'bytes=0-1' },
        })
      ).status
    ).toBe(400);
    expect(
      (await fetch(`${lease.origin}/index.html`, { method: 'POST' })).status
    ).toBe(405);
    expect(host.snapshot()).toEqual({
      state: 'accepting',
      activeLeaseCount: 1,
    });

    await expect(lease.retire(passiveSignal)).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    await expect(lease.retire(passiveSignal)).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    expect(host.snapshot().activeLeaseCount).toBe(0);
    await expect(
      host.reserve(reservation(input), passiveSignal)
    ).rejects.toThrow(/retired/u);
    await expect(host.drainAndDispose()).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    expect(host.snapshot()).toEqual({
      state: 'closed',
      activeLeaseCount: 0,
    });
  });

  it('fails closed on an aborted request, replay drift, and resource digest drift', async () => {
    const aborted = createProductionBrowserLoopbackPreviewHost();
    await expect(
      aborted.reserve(reservation(materialization()), {
        aborted: true,
        reason: 'test-abort',
        subscribe: () => () => undefined,
      })
    ).rejects.toThrow(/aborted/u);
    expect(aborted.snapshot().activeLeaseCount).toBe(0);
    await aborted.drainAndDispose();

    const host = createProductionBrowserLoopbackPreviewHost();
    const input = materialization();
    await host.reserve(reservation(input), passiveSignal);
    const lease = await host.materialize(input, passiveSignal);
    const driftedEntry = resource(
      '/index.html',
      'bundle',
      '<main>drifted</main>'
    );
    await expect(
      host.materialize(
        {
          ...input,
          entryDigest: driftedEntry.contentDigest,
          resources: Object.freeze([
            resource('/', 'entry', '<main>drifted</main>'),
            input.resources[1]!,
            driftedEntry,
          ]),
        },
        passiveSignal
      )
    ).rejects.toThrow(/reservation drifted|replay drifted/u);

    await expect(
      host.reserve(
        {
          ...reservation(input),
          entryDigest: driftedEntry.contentDigest,
        },
        passiveSignal
      )
    ).rejects.toThrow(/replay drifted/u);

    const unknown = createProductionBrowserLoopbackPreviewHost();
    await expect(unknown.materialize(input, passiveSignal)).rejects.toThrow(
      /no active reservation/u
    );
    await unknown.drainAndDispose();

    const invalid = createProductionBrowserLoopbackPreviewHost();
    await invalid.reserve(reservation(input), passiveSignal);
    await expect(
      invalid.materialize(
        {
          ...input,
          resources: Object.freeze([
            ...input.resources.slice(0, 2),
            Object.freeze({
              ...input.resources[2]!,
              contentDigest: digestVerificationValue('wrong-resource'),
            }),
          ]),
        },
        passiveSignal
      )
    ).rejects.toThrow(/content address drifted/u);
    await invalid.drainAndDispose();
    await lease.retire(passiveSignal);
    await host.drainAndDispose();
  });

  it('drains an active lease through the same bounded cleanup authority', async () => {
    const host = createProductionBrowserLoopbackPreviewHost();
    await host.reserve(reservation(materialization()), passiveSignal);
    const startedAt = Date.now();
    await expect(host.drainAndDispose()).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    expect(Date.now() - startedAt).toBeLessThanOrEqual(
      PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_CLEANUP_TIMEOUT_MS + 1_000
    );
    expect(host.snapshot()).toEqual({
      state: 'closed',
      activeLeaseCount: 0,
    });
  });

  it('reports the exact residual family when bounded server cleanup fails', async () => {
    const originalClose = NetServer.prototype.close;
    const closeSpy = vi
      .spyOn(NetServer.prototype, 'close')
      .mockImplementation(function (
        this: NetServer,
        callback?: (error?: Error) => void
      ) {
        return originalClose.call(this, () =>
          callback?.(new Error('injected close receipt failure'))
        );
      });
    try {
      const host = createProductionBrowserLoopbackPreviewHost();
      const evidence = await host.reserve(
        reservation(materialization()),
        passiveSignal
      );
      await expect(host.drainAndDispose()).resolves.toMatchObject({
        status: 'failed',
        residualCanaryIds: [
          expect.stringMatching(/^canary:production-preview:/u),
        ],
        diagnosticCodes: ['VER-PRODUCTION-PREVIEW-HOST-CLEANUP-FAILED'],
      });
      await expect(fetch(evidence.materializedOrigin)).rejects.toThrow();
      expect(host.snapshot()).toEqual({
        state: 'closed',
        activeLeaseCount: 1,
      });
    } finally {
      closeSpy.mockRestore();
    }
  });
});
