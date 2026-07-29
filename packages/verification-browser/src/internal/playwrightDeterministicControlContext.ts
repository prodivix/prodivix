import type {
  DeterministicIsolationResidual,
  DeterministicRuntimeProviderHooks,
} from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type { Page } from 'playwright-core';
import type {
  BrowserRuntimeControlIdentifierNamespace,
  BrowserRuntimeControlLease,
} from '../browserRuntimeControlPort';
import { assertOrigin } from './playwrightBrowserShared';

export type PlaywrightBrowserPageResidual = Readonly<{
  localStorage: number;
  sessionStorage: number;
  indexedDb: number;
  cacheStorage: number;
  serviceWorkers: number;
  activeAnimations: number;
  pendingTimers: number;
  pendingStreams: number;
  activeWorkers: number;
}>;

export const emptyPlaywrightDeterministicResidual =
  (): DeterministicIsolationResidual =>
    Object.freeze({
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
    });

export const readPlaywrightPageResidual = async (
  page: Page,
  activityProbeKey: string | undefined
): Promise<PlaywrightBrowserPageResidual> =>
  page.evaluate(async (key) => {
    const databases =
      typeof indexedDB.databases === 'function'
        ? await indexedDB.databases()
        : [];
    const cacheKeys = typeof caches === 'undefined' ? [] : await caches.keys();
    const registrations =
      'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistrations()
        : [];
    const activity =
      key === undefined
        ? undefined
        : (
            globalThis as typeof globalThis &
              Record<
                string,
                | undefined
                | (() => {
                    pendingTimers: number;
                    pendingStreams: number;
                    activeWorkers: number;
                  })
              >
          )[key]?.();
    return {
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
      indexedDb: databases.length,
      cacheStorage: cacheKeys.length,
      serviceWorkers: registrations.length,
      activeAnimations: document
        .getAnimations()
        .filter(({ playState }) => playState === 'running').length,
      pendingTimers: activity?.pendingTimers ?? 0,
      pendingStreams: activity?.pendingStreams ?? 0,
      activeWorkers: activity?.activeWorkers ?? 0,
    };
  }, activityProbeKey);

export const clearPlaywrightBrowserStorage = async (
  page: Page
): Promise<void> => {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases
          .map(({ name }) => name)
          .filter((name): name is string => Boolean(name))
          .map(
            (name) =>
              new Promise<void>((resolvePromise, rejectPromise) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolvePromise();
                request.onerror = () =>
                  rejectPromise(
                    request.error ??
                      new Error('IndexedDB cleanup failed without an error.')
                  );
                request.onblocked = () =>
                  rejectPromise(
                    new Error('IndexedDB cleanup was blocked by an open owner.')
                  );
              })
          )
      );
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister())
      );
    }
  });
};

export const playwrightResidualFrom = (
  browser: PlaywrightBrowserPageResidual,
  cookies: number,
  effects = 0
): DeterministicIsolationResidual =>
  Object.freeze({
    storage: browser.localStorage + browser.sessionStorage,
    cookies,
    indexedDb: browser.indexedDb,
    cacheStorage: browser.cacheStorage,
    serviceWorkers: browser.serviceWorkers,
    workers: browser.activeWorkers,
    streams: browser.pendingStreams,
    timers: browser.pendingTimers,
    effects: browser.activeAnimations + effects,
    authSessions: 0,
  });

export const samePlaywrightControlRequestCoordinates = (
  request: Parameters<
    NonNullable<DeterministicRuntimeProviderHooks['reset']>
  >[0],
  lease: BrowserRuntimeControlLease
): boolean =>
  request.namespace.length > 0 &&
  request.plan.controlDigest === lease.expectedControlDigest &&
  sameCanonicalJson(request.plan, lease.plan);

export const assertPlaywrightLoopbackOrigin = (value: string): string => {
  const origin = assertOrigin(value);
  const hostname = new URL(origin).hostname
    .replace(/^\[/u, '')
    .replace(/\]$/u, '')
    .toLowerCase();
  if (
    hostname !== 'localhost' &&
    hostname !== '::1' &&
    !/^127(?:\.[0-9]{1,3}){3}$/u.test(hostname)
  ) {
    throw new Error(
      'Browser verification network sandbox only permits an exact loopback origin.'
    );
  }
  return origin;
};

export const freezePlaywrightIdentifierValues = (
  values: Readonly<
    Record<BrowserRuntimeControlIdentifierNamespace, readonly string[]>
  >
): Readonly<
  Record<BrowserRuntimeControlIdentifierNamespace, readonly string[]>
> =>
  Object.freeze({
    attempt: Object.freeze([...values.attempt]),
    step: Object.freeze([...values.step]),
    action: Object.freeze([...values.action]),
    operation: Object.freeze([...values.operation]),
  });
