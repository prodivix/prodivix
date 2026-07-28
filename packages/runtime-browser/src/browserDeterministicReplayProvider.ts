import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  createDeterministicRuntimeProvider,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeControlDeclaration,
  type DeterministicRuntimeControlId,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeProvider,
} from '@prodivix/runtime-core';

export type BrowserDeterministicControlHost = Readonly<{
  reset(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
  apply(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
      expectedControlDigest: string;
    }>
  ):
    | Readonly<{ appliedControlDigest: string; fontReady: boolean }>
    | Promise<Readonly<{ appliedControlDigest: string; fontReady: boolean }>>;
  probe(
    input: Readonly<{
      namespace: string;
      phase: 'after-reset' | 'after-cleanup';
    }>
  ): DeterministicIsolationResidual | Promise<DeterministicIsolationResidual>;
  cleanup(
    input: Readonly<{
      namespace: string;
      plan: DeterministicRuntimeControlPlan;
    }>
  ): void | Promise<void>;
}>;

export type CreateBrowserDeterministicReplayProviderInput = Readonly<{
  id?: string;
  version?: string;
  implementationDigest: string;
  host: BrowserDeterministicControlHost;
  partiallyControlled?: readonly DeterministicRuntimeControlId[];
}>;

/**
 * Browser adapter. The host owns real context/storage/render operations; this
 * wrapper owns the shared fail-closed preflight and attempt lifecycle.
 */
export const createBrowserDeterministicReplayProvider = (
  input: CreateBrowserDeterministicReplayProviderInput
): DeterministicRuntimeProvider => {
  const partial = new Set(input.partiallyControlled ?? []);
  const controls: readonly DeterministicRuntimeControlDeclaration[] =
    Object.freeze(
      DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) =>
        Object.freeze({
          controlId,
          status: partial.has(controlId)
            ? ('partially-controlled' as const)
            : ('supported' as const),
          implementationDigest: input.implementationDigest,
          ...(partial.has(controlId)
            ? {
                reason: `${controlId} is not fully controlled by this browser host.`,
              }
            : {}),
        })
      )
    );
  return createDeterministicRuntimeProvider({
    id: input.id ?? 'prodivix.browser.deterministic-replay',
    version: input.version ?? '1',
    surface: 'browser',
    implementationDigest: input.implementationDigest,
    controls,
    hooks: {
      reset: (request) => input.host.reset(request),
      async apply(request) {
        if (
          request.plan.cell.surface !== 'browser' ||
          request.plan.cell.browserEngine === 'none'
        ) {
          return Object.freeze({
            appliedControlDigest: 'surface-mismatch',
            fontReady: false,
          });
        }
        const applied = await input.host.apply(request);
        return Object.freeze({
          appliedControlDigest: applied.appliedControlDigest,
          fontReady: applied.fontReady,
        });
      },
      probe: (request) => input.host.probe(request),
      cleanup: (request) => input.host.cleanup(request),
    },
  });
};

export const EMPTY_BROWSER_RUNTIME_RESIDUAL: DeterministicIsolationResidual =
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
