import { createServer, type Server } from 'node:http';
import { normalizeExecutableProjectPath } from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import {
  PRODUCTION_BROWSER_CONTROL_HOST_PATH,
  createProductionBrowserRemoteExecutionEvidence,
} from './productionChromiumBrowserAuthorityResources';
import type {
  ProductionBrowserPreviewHostLease,
  ProductionBrowserPreviewHostPort,
  ProductionBrowserPreviewHostReleaseResult,
  ProductionBrowserPreviewResource,
  ProductionBrowserRemoteExecutionEvidence,
} from './productionChromiumBrowserAuthority.types';

export const PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST =
  digestVerificationValue({
    format: 'prodivix.production-browser-loopback-preview-host',
    version: 1,
    address: '127.0.0.1:ephemeral',
    servingMode: 'route-verified-content-addressed',
    requestMethod: 'GET',
    maximumActiveReservations: 20_000,
    maximumResources: 20_000,
    maximumBytes: 256 * 1024 * 1024,
    cleanupTimeoutMs: 5_000,
    reservation: 'request-identity-idempotent-before-materialization',
    materialization: 'exact-reservation-consumer',
  });

export const PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_CLEANUP_TIMEOUT_MS =
  5_000 as const;

const maximumResources = 20_000;
const maximumActiveReservations = 20_000;
const maximumBytes = 256 * 1024 * 1024;
const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

const cleanRelease = Object.freeze({
  status: 'clean' as const,
  residualCanaryIds: Object.freeze([]),
  diagnosticCodes: Object.freeze([]),
});

const failedRelease = (
  leaseId: string
): ProductionBrowserPreviewHostReleaseResult =>
  Object.freeze({
    status: 'failed' as const,
    residualCanaryIds: Object.freeze([
      `canary:production-preview:${leaseId.slice(
        'preview:'.length,
        'preview:'.length + 32
      )}`,
    ]),
    diagnosticCodes: Object.freeze([
      'VER-PRODUCTION-PREVIEW-HOST-CLEANUP-FAILED',
    ]),
  });

const fail = (message: string): never => {
  throw new TypeError(`PRODUCTION_BROWSER_PREVIEW_HOST_INVALID: ${message}`);
};

const exactIdentifier = (value: string, label: string): string => {
  if (!identifierPattern.test(value)) fail(`${label} is invalid.`);
  return value;
};

const exactDigest = (value: string, label: string): string => {
  if (!digestPattern.test(value)) fail(`${label} is invalid.`);
  return value;
};

const exactResourcePath = (value: string): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4_096 ||
    !value.startsWith('/') ||
    value.includes('\\')
  ) {
    return fail('Preview resource path is invalid.');
  }
  const parsed = new URL(value, 'http://127.0.0.1');
  const normalized = `${parsed.pathname}${parsed.search}`;
  if (
    parsed.origin !== 'http://127.0.0.1' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    normalized !== value
  ) {
    return fail('Preview resource path is not canonical.');
  }
  return normalized;
};

const bundlePath = (path: string): string =>
  `/${normalizeExecutableProjectPath(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

const contentType = (resource: ProductionBrowserPreviewResource): string => {
  if (resource.kind === 'control-host' || resource.kind === 'entry') {
    return 'text/html; charset=utf-8';
  }
  const pathname = new URL(resource.path, 'http://127.0.0.1').pathname;
  if (pathname.endsWith('.html') || pathname.endsWith('.htm')) {
    return 'text/html; charset=utf-8';
  }
  if (pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8';
  }
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
};

export type ProductionBrowserLoopbackPreviewReservationInput = Omit<
  Parameters<ProductionBrowserPreviewHostPort['materialize']>[0],
  'entryRoutes' | 'resources'
>;

type NormalizedReservation = Readonly<{
  reservationDigest: string;
  attemptId: string;
  generation: number;
  requestId: string;
  executionId: string;
  snapshotDigest: string;
  buildBundleDigest: string;
  entryFilePath: string;
  entryDigest: string;
  buildFileCount: number;
}>;

type NormalizedMaterialization = NormalizedReservation &
  Readonly<{
    inputDigest: string;
    resources: ReadonlyMap<string, ProductionBrowserPreviewResource>;
  }>;

const wipeResources = (
  resources: ReadonlyMap<string, ProductionBrowserPreviewResource>
): void => {
  for (const resource of resources.values()) resource.contents.fill(0);
};

const normalizeReservation = (
  input: ProductionBrowserLoopbackPreviewReservationInput
): NormalizedReservation => {
  exactIdentifier(input.attemptId, 'Attempt id');
  exactIdentifier(input.requestId, 'Remote request id');
  exactIdentifier(input.executionId, 'Remote execution id');
  exactDigest(input.snapshotDigest, 'Snapshot digest');
  exactDigest(input.buildBundleDigest, 'Build bundle digest');
  exactDigest(input.entryDigest, 'Entry digest');
  const entryFilePath = normalizeExecutableProjectPath(input.entryFilePath);
  if (
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    !Number.isSafeInteger(input.buildFileCount) ||
    input.buildFileCount < 1
  ) {
    return fail('Reservation counts or generation are invalid.');
  }
  const identity = Object.freeze({
    attemptId: input.attemptId,
    generation: input.generation,
    requestId: input.requestId,
    executionId: input.executionId,
    snapshotDigest: input.snapshotDigest,
    buildBundleDigest: input.buildBundleDigest,
    entryFilePath,
    entryDigest: input.entryDigest,
    buildFileCount: input.buildFileCount,
  });
  return Object.freeze({
    ...identity,
    reservationDigest: digestVerificationValue(identity),
  });
};

const normalizeMaterialization = (
  input: Parameters<ProductionBrowserPreviewHostPort['materialize']>[0]
): NormalizedMaterialization => {
  const reservation = normalizeReservation(input);
  if (
    input.resources.length < 2 ||
    input.resources.length > maximumResources ||
    input.entryRoutes.length < 1 ||
    input.entryRoutes.length > maximumResources
  ) {
    return fail('Materialization counts are invalid.');
  }
  const resources = new Map<string, ProductionBrowserPreviewResource>();
  try {
    let totalBytes = 0;
    for (const resource of input.resources) {
      const path = exactResourcePath(resource.path);
      if (
        resources.has(path) ||
        !['control-host', 'entry', 'bundle'].includes(resource.kind) ||
        !(resource.contents instanceof Uint8Array)
      ) {
        return fail('Preview resource is duplicated or invalid.');
      }
      const contents = new Uint8Array(resource.contents);
      const digest = exactDigest(resource.contentDigest, 'Resource digest');
      totalBytes += contents.byteLength;
      if (
        !Number.isSafeInteger(totalBytes) ||
        totalBytes > maximumBytes ||
        digestBrowserVerificationBytes(contents) !== digest
      ) {
        contents.fill(0);
        return fail('Preview resource byte budget or content address drifted.');
      }
      resources.set(
        path,
        Object.freeze({
          path,
          kind: resource.kind,
          contentDigest: digest,
          contents,
        })
      );
    }
    const routes = input.entryRoutes.map(exactResourcePath);
    if (
      new Set(routes).size !== routes.length ||
      routes.some((path) => {
        const resource = resources.get(path);
        return (
          resource?.kind !== 'entry' ||
          resource.contentDigest !== input.entryDigest
        );
      }) ||
      resources.get(PRODUCTION_BROWSER_CONTROL_HOST_PATH)?.kind !==
        'control-host' ||
      resources.get(bundlePath(reservation.entryFilePath))?.contentDigest !==
        input.entryDigest
    ) {
      return fail('Preview routes, control host, or entry binding drifted.');
    }
    const identity = Object.freeze({
      reservationDigest: reservation.reservationDigest,
      entryRoutes: Object.freeze([...routes].sort(compareUnicodeCodePoints)),
      resources: Object.freeze(
        [...resources.values()]
          .map(({ path, kind, contentDigest, contents }) =>
            Object.freeze({
              path,
              kind,
              contentDigest,
              byteLength: contents.byteLength,
            })
          )
          .sort((left, right) =>
            compareUnicodeCodePoints(left.path, right.path)
          )
      ),
    });
    return Object.freeze({
      ...reservation,
      inputDigest: digestVerificationValue(identity),
      resources,
    });
  } catch (error) {
    wipeResources(resources);
    throw error;
  }
};

const listen = (server: Server): Promise<string> =>
  new Promise((resolvePromise, rejectPromise) => {
    const reject = (error: Error) => rejectPromise(error);
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        rejectPromise(new TypeError('Preview host address is unavailable.'));
        return;
      }
      resolvePromise(`http://127.0.0.1:${address.port}`);
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolvePromise, rejectPromise) => {
    if (!server.listening) {
      resolvePromise();
      return;
    }
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
    server.closeAllConnections();
  });

const closeServerBounded = async (server: Server): Promise<void> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closeServer(server),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new TypeError('Preview host cleanup timed out.')),
          PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_CLEANUP_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

type PreviewLeaseState = {
  readonly reservation: NormalizedReservation;
  readonly server: Server;
  readonly lease: ProductionBrowserPreviewHostLease;
  resources?: ReadonlyMap<string, ProductionBrowserPreviewResource>;
  materializationDigest?: string;
  retired: boolean;
  release?: Promise<ProductionBrowserPreviewHostReleaseResult>;
  unsubscribeAbort?: () => void;
  unsubscribeMaterializationAbort?: () => void;
};

export type ProductionBrowserLoopbackPreviewHost =
  ProductionBrowserPreviewHostPort &
    Readonly<{
      reserve(
        input: ProductionBrowserLoopbackPreviewReservationInput,
        signal: Parameters<ProductionBrowserPreviewHostPort['materialize']>[1]
      ): Promise<ProductionBrowserRemoteExecutionEvidence>;
      snapshot(): Readonly<{
        state: 'accepting' | 'draining' | 'closed';
        activeLeaseCount: number;
      }>;
      drainAndDispose(): Promise<ProductionBrowserPreviewHostReleaseResult>;
    }>;

/**
 * Serves one exact, already-built remote preview projection per attempt on an
 * ephemeral numeric-loopback origin. It never compiles, fetches, or forwards
 * resources and clears its owned byte copies during bounded retirement.
 */
export const createProductionBrowserLoopbackPreviewHost =
  (): ProductionBrowserLoopbackPreviewHost => {
    const states = new Map<string, Promise<PreviewLeaseState>>();
    const retiredRequestIds = new Set<string>();
    let lifecycle: 'accepting' | 'draining' | 'closed' = 'accepting';
    let drainPromise:
      Promise<ProductionBrowserPreviewHostReleaseResult> | undefined;

    const reserve = async (
      input: ProductionBrowserLoopbackPreviewReservationInput,
      signal: Parameters<ProductionBrowserPreviewHostPort['materialize']>[1]
    ): Promise<PreviewLeaseState> => {
      if (lifecycle !== 'accepting' || signal.aborted) {
        return fail('Preview host is closed or the request was aborted.');
      }
      const normalized = normalizeReservation(input);
      const key = normalized.requestId;
      if (retiredRequestIds.has(key)) {
        return fail(
          'Preview reservation request identity was already retired.'
        );
      }
      const existing = states.get(key);
      if (existing) {
        const state = await existing;
        if (
          signal.aborted ||
          state.retired ||
          state.reservation.reservationDigest !== normalized.reservationDigest
        ) {
          return fail('Preview reservation replay drifted or was retired.');
        }
        return state;
      }
      if (states.size >= maximumActiveReservations) {
        return fail('Preview reservation capacity is exhausted.');
      }

      const pending = (async (): Promise<PreviewLeaseState> => {
        let state: PreviewLeaseState | undefined;
        const server = createServer((request, response) => {
          if (!state || state.retired || !state.resources) {
            response.writeHead(503, {
              'content-length': '0',
              'cache-control': 'no-store',
            });
            response.end();
            return;
          }
          if (request.headers.host !== new URL(state.lease.origin).host) {
            response.writeHead(421, {
              'content-length': '0',
              'cache-control': 'no-store',
            });
            response.end();
            return;
          }
          if (request.method !== 'GET') {
            response.writeHead(405, {
              allow: 'GET',
              'content-length': '0',
              'cache-control': 'no-store',
            });
            response.end();
            return;
          }
          if (
            request.headers.range !== undefined ||
            request.headers['content-encoding'] !== undefined ||
            request.headers.upgrade !== undefined
          ) {
            response.writeHead(400, {
              'content-length': '0',
              'cache-control': 'no-store',
            });
            response.end();
            return;
          }
          const resource = state.resources.get(request.url ?? '');
          if (!resource) {
            response.writeHead(404, {
              'content-length': '0',
              'cache-control': 'no-store',
            });
            response.end();
            return;
          }
          response.writeHead(200, {
            'content-length': String(resource.contents.byteLength),
            'content-type': contentType(resource),
            'content-encoding': 'identity',
            'content-security-policy':
              "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            'cross-origin-resource-policy': 'same-origin',
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
            'x-content-type-options': 'nosniff',
            'x-dns-prefetch-control': 'off',
          });
          response.end(resource.contents);
        });
        let origin: string;
        try {
          origin = await listen(server);
        } catch (error) {
          await closeServerBounded(server).catch(() => undefined);
          throw error;
        }
        const remoteExecution = createProductionBrowserRemoteExecutionEvidence({
          attemptId: normalized.attemptId,
          generation: normalized.generation,
          requestId: normalized.requestId,
          executionId: normalized.executionId,
          snapshotDigest: normalized.snapshotDigest,
          materializedBundleDigest: normalized.buildBundleDigest,
          materializedOrigin: origin,
          materializedEntryUrl: new URL(
            bundlePath(normalized.entryFilePath),
            `${origin}/`
          ).href,
          materializedEntryFilePath: normalized.entryFilePath,
          materializedEntryDigest: normalized.entryDigest,
          materializedFileCount: normalized.buildFileCount,
        });
        const leaseId = `preview:${digestVerificationValue({
          authorityDigest:
            PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST,
          reservationDigest: normalized.reservationDigest,
          remoteExecutionDigest: remoteExecution.evidenceDigest,
        }).slice('sha256-'.length)}`;
        const lease: ProductionBrowserPreviewHostLease = Object.freeze({
          leaseId,
          origin,
          servingMode: 'route-verified-content-addressed' as const,
          remoteExecution,
          retire: async () => {
            if (!state) {
              return failedRelease(leaseId);
            }
            state.release ??= (async () => {
              state.retired = true;
              state.unsubscribeAbort?.();
              state.unsubscribeMaterializationAbort?.();
              let result: ProductionBrowserPreviewHostReleaseResult;
              try {
                await closeServerBounded(server);
                result = cleanRelease;
              } catch {
                result = failedRelease(leaseId);
              } finally {
                if (state.resources) wipeResources(state.resources);
                state.resources = undefined;
                if (result!.status === 'clean') {
                  retiredRequestIds.add(key);
                  states.delete(key);
                }
              }
              return result;
            })();
            return state.release;
          },
        });
        state = {
          reservation: normalized,
          server,
          lease,
          retired: false,
        };
        state.unsubscribeAbort = signal.subscribe(() => {
          void lease.retire(signal).catch(() => undefined);
        });
        if (signal.aborted) {
          await lease.retire(signal);
          return fail('Preview reservation was aborted during startup.');
        }
        return state;
      })();
      states.set(key, pending);
      try {
        return await pending;
      } catch (error) {
        if (states.get(key) === pending) states.delete(key);
        throw error;
      }
    };

    const materialize: ProductionBrowserPreviewHostPort['materialize'] = async (
      input,
      signal
    ) => {
      if (lifecycle !== 'accepting' || signal.aborted) {
        return fail('Preview host is closed or the request was aborted.');
      }
      const reservation = normalizeReservation(input);
      const pending = states.get(reservation.requestId);
      if (!pending || retiredRequestIds.has(reservation.requestId)) {
        return fail('Preview materialization has no active reservation.');
      }
      const state = await pending;
      if (
        state.retired ||
        state.reservation.reservationDigest !== reservation.reservationDigest
      ) {
        return fail(
          'Preview materialization reservation drifted or was retired.'
        );
      }
      const normalized = normalizeMaterialization(input);
      if (signal.aborted) {
        wipeResources(normalized.resources);
        return fail('Preview materialization was aborted.');
      }
      if (state.materializationDigest !== undefined) {
        try {
          if (state.materializationDigest !== normalized.inputDigest) {
            return fail('Preview materialization replay drifted.');
          }
          return state.lease;
        } finally {
          wipeResources(normalized.resources);
        }
      }
      state.materializationDigest = normalized.inputDigest;
      state.resources = normalized.resources;
      state.unsubscribeMaterializationAbort = signal.subscribe(() => {
        void state.lease.retire(signal).catch(() => undefined);
      });
      if (signal.aborted) {
        await state.lease.retire(signal);
        return fail('Preview materialization was aborted during activation.');
      }
      return state.lease;
    };

    return Object.freeze({
      authorityDigest:
        PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST,
      reserve: async (input, signal) =>
        (await reserve(input, signal)).lease.remoteExecution,
      materialize,
      snapshot: () =>
        Object.freeze({
          state: lifecycle,
          activeLeaseCount: states.size,
        }),
      drainAndDispose() {
        drainPromise ??= (async () => {
          lifecycle = 'draining';
          const settled = await Promise.allSettled(
            [...states.values()].map(async (pending) => {
              const state = await pending;
              return state.lease.retire({
                aborted: false,
                subscribe: () => () => undefined,
              });
            })
          );
          lifecycle = 'closed';
          const results = settled.map((entry) =>
            entry.status === 'fulfilled'
              ? entry.value
              : Object.freeze({
                  status: 'failed' as const,
                  residualCanaryIds: Object.freeze([
                    'canary:production-preview:drain',
                  ]),
                  diagnosticCodes: Object.freeze([
                    'VER-PRODUCTION-PREVIEW-HOST-DRAIN-FAILED',
                  ]),
                })
          );
          const failed = results.filter(({ status }) => status !== 'clean');
          if (failed.length === 0 && states.size === 0) return cleanRelease;
          return Object.freeze({
            status: 'failed' as const,
            residualCanaryIds: Object.freeze(
              [
                ...new Set(
                  failed.flatMap((result) => result.residualCanaryIds)
                ),
              ].sort(compareUnicodeCodePoints)
            ),
            diagnosticCodes: Object.freeze(
              [
                ...new Set(failed.flatMap((result) => result.diagnosticCodes)),
              ].sort(compareUnicodeCodePoints)
            ),
          });
        })();
        return drainPromise;
      },
    });
  };

// Compile-time guard for the fixed implementation identity.
if (
  !digestPattern.test(
    PRODUCTION_BROWSER_LOOPBACK_PREVIEW_HOST_AUTHORITY_DIGEST
  ) ||
  !sameCanonicalJson(cleanRelease, {
    status: 'clean',
    residualCanaryIds: [],
    diagnosticCodes: [],
  })
) {
  fail('Preview host implementation identity is invalid.');
}
