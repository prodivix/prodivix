import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  type DeterministicIsolationCanary,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeCapabilitySnapshot,
  type DeterministicRuntimeControlId,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeProvider,
  type DeterministicRuntimeSession,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import type { BrowserVerificationTargetLease } from './browserAdapter.types';
import {
  assertBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlFixtureBinding,
  createBrowserRuntimeControlUuid,
  type BrowserRuntimeControlAttestation,
  type BrowserRuntimeControlExpectedWitness,
  type BrowserRuntimeControlHost,
  type BrowserRuntimeControlLease,
  type BrowserRuntimeControlLiveWitness,
  type BrowserRuntimeControlRemoteBinding,
  type BrowserRuntimeControlResourceManifest,
} from './browserRuntimeControlPort';
import type {
  ProductionBrowserRemoteRuntimeProviderPort,
  ProductionChromiumBrowserRegistrationInput,
} from './productionChromiumBrowserAuthority.types';

const digestPattern = /^sha256-[a-f0-9]{64}$/u;
const canonicalControlIds: readonly DeterministicRuntimeControlId[] =
  Object.freeze(
    [...DETERMINISTIC_RUNTIME_CONTROL_IDS].sort(compareUnicodeCodePoints)
  );

const emptyResidual = (): DeterministicIsolationResidual =>
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

const residualCanaryIds = (
  residual: DeterministicIsolationResidual,
  attemptId: string
): readonly string[] =>
  Object.freeze(
    Object.entries(residual)
      .filter(([, count]) => count !== 0)
      .map(([kind]) => `canary:browser:${attemptId}:${kind}`)
      .sort(compareUnicodeCodePoints)
  );

type DeferredHost = Readonly<{
  hooks: Required<
    Pick<BrowserRuntimeControlHost, 'reset' | 'apply' | 'probe' | 'cleanup'>
  >;
  bind(host: BrowserRuntimeControlHost): void;
  lastCleanupResidual(): DeterministicIsolationResidual | undefined;
}>;

const createDeferredHost = (attemptId: string): DeferredHost => {
  let host: BrowserRuntimeControlHost | undefined;
  let cleanupResidual: DeterministicIsolationResidual | undefined;
  const requireHost = (): BrowserRuntimeControlHost => {
    if (!host) {
      throw new Error(
        `Production browser runtime host for ${attemptId} is unavailable.`
      );
    }
    return host;
  };
  return Object.freeze({
    bind(nextHost) {
      if (host) {
        throw new Error(
          `Production browser runtime host for ${attemptId} is already bound.`
        );
      }
      host = nextHost;
    },
    hooks: Object.freeze({
      reset: (request: Parameters<BrowserRuntimeControlHost['reset']>[0]) =>
        requireHost().reset(request),
      apply: async (
        request: Parameters<BrowserRuntimeControlHost['apply']>[0]
      ) => {
        const applied = await requireHost().apply(request);
        return Object.freeze({
          appliedControlDigest: applied.appliedControlDigest,
          fontReady: applied.fontReady ?? false,
        });
      },
      async probe(request: Parameters<BrowserRuntimeControlHost['probe']>[0]) {
        const residual = await requireHost().probe(request);
        if (request.phase === 'after-cleanup') cleanupResidual = residual;
        return residual;
      },
      cleanup: (request: Parameters<BrowserRuntimeControlHost['cleanup']>[0]) =>
        requireHost().cleanup(request),
    }),
    lastCleanupResidual: () => cleanupResidual,
  });
};

const exactCapabilities = (
  snapshot: DeterministicRuntimeCapabilitySnapshot,
  provider: DeterministicRuntimeProvider,
  authority: ProductionBrowserRemoteRuntimeProviderPort
): readonly DeterministicRuntimeControlId[] => {
  const actual = Object.freeze(
    snapshot.controls
      .map(({ controlId }) => controlId)
      .sort(compareUnicodeCodePoints)
  );
  if (
    provider.descriptor.id !== authority.providerId ||
    provider.descriptor.version !== authority.providerVersion ||
    provider.descriptor.surface !== 'remote' ||
    snapshot.providerId !== authority.providerId ||
    snapshot.providerVersion !== authority.providerVersion ||
    snapshot.implementationDigest !== authority.implementationDigest ||
    !digestPattern.test(snapshot.snapshotDigest) ||
    actual.length !== canonicalControlIds.length ||
    actual.some(
      (controlId, index) => controlId !== canonicalControlIds[index]
    ) ||
    snapshot.controls.some(
      ({ status, implementationDigest }) =>
        status !== 'supported' ||
        implementationDigest !== authority.implementationDigest
    )
  ) {
    throw new TypeError(
      'Remote deterministic provider descriptor or capability authority drifted.'
    );
  }
  return actual;
};

const createExpectedWitness = (
  session: DeterministicRuntimeSession,
  plan: DeterministicRuntimeControlPlan
): BrowserRuntimeControlExpectedWitness => {
  const randomSample = session.random.stream('browser-page').nextFloat();
  const samples = new Map<
    keyof BrowserRuntimeControlExpectedWitness['identifierSamples'],
    string
  >();
  for (const namespace of plan.identifiers.namespaces) {
    samples.set(namespace, session.identifiers.next(namespace));
  }
  const attempt = samples.get('attempt');
  const step = samples.get('step');
  const action = samples.get('action');
  const operation = samples.get('operation');
  if (!attempt || !step || !action || !operation || samples.size !== 4) {
    throw new TypeError(
      'Production browser runtime Plan must declare all identifier namespaces.'
    );
  }
  const identifierSamples = Object.freeze({
    attempt,
    step,
    action,
    operation,
  });
  return Object.freeze({
    randomSample,
    identifierSamples,
    operationUuid: createBrowserRuntimeControlUuid(operation),
  });
};

const readLiveWitness = (
  session: DeterministicRuntimeSession
): BrowserRuntimeControlLiveWitness => {
  const scheduler = session.scheduler.snapshot();
  return Object.freeze({
    schedulerStatus: scheduler.status,
    schedulerTurns: scheduler.turns,
    schedulerLogicalTime: scheduler.logicalTime,
    schedulerPendingTaskCount: scheduler.pendingTaskIds.length,
    schedulerPendingBarrierCount: scheduler.pendingBarrierIds.length,
    schedulerDroppedEventCount: scheduler.droppedEventCount,
    schedulerCompletedOperationCount: scheduler.events.filter(
      ({ kind, lane }) =>
        kind === 'task-completed' && lane === 'browser-operation'
    ).length,
    schedulerSnapshotDigest: digestVerificationValue(scheduler),
    fixtureDispatchCount: session.network.events().length,
  });
};

const wrapSession = (
  session: DeterministicRuntimeSession,
  state: ProductionBrowserRuntimeAttemptState
): DeterministicRuntimeSession => {
  let cleanupPromise: Promise<DeterministicIsolationCanary> | undefined;
  return Object.freeze({
    ...session,
    cleanup() {
      cleanupPromise ??= session.cleanup().then((canary) => {
        state.cleanupCanary = canary;
        return canary;
      });
      return cleanupPromise;
    },
  });
};

export type ProductionBrowserRuntimeAttemptState = {
  input: ProductionChromiumBrowserRegistrationInput;
  targetLease: BrowserVerificationTargetLease;
  plan: DeterministicRuntimeControlPlan;
  resourceManifest: BrowserRuntimeControlResourceManifest;
  remoteBinding: BrowserRuntimeControlRemoteBinding;
  projectionAuthorityDigest: string;
  providerAuthority: ProductionBrowserRemoteRuntimeProviderPort;
  deferredHost: DeferredHost;
  provider: DeterministicRuntimeProvider;
  capabilitySnapshot: DeterministicRuntimeCapabilitySnapshot;
  controlCapabilityIds: readonly DeterministicRuntimeControlId[];
  acquired: boolean;
  released: boolean;
  started: boolean;
  blocked: boolean;
  host?: BrowserRuntimeControlHost;
  session?: DeterministicRuntimeSession;
  exposedSession?: DeterministicRuntimeSession;
  witness?: BrowserRuntimeControlExpectedWitness;
  cleanupCanary?: DeterministicIsolationCanary;
  issued: Map<string, BrowserRuntimeControlAttestation>;
  terminal?: BrowserRuntimeControlAttestation;
  lease?: BrowserRuntimeControlLease;
};

export const createProductionBrowserRuntimeAttemptState = (input: {
  registration: ProductionChromiumBrowserRegistrationInput;
  targetLease: BrowserVerificationTargetLease;
  plan: DeterministicRuntimeControlPlan;
  resourceManifest: BrowserRuntimeControlResourceManifest;
  remoteBinding: BrowserRuntimeControlRemoteBinding;
  providerAuthority: ProductionBrowserRemoteRuntimeProviderPort;
}): ProductionBrowserRuntimeAttemptState => {
  if (!digestPattern.test(input.registration.projectionAuthorityDigest)) {
    throw new TypeError(
      'Production browser projection authority must be a canonical digest.'
    );
  }
  const deferredHost = createDeferredHost(input.registration.attemptId);
  const provider = input.providerAuthority.create(deferredHost.hooks);
  const capabilitySnapshot = provider.inspect(input.plan);
  const controlCapabilityIds = exactCapabilities(
    capabilitySnapshot,
    provider,
    input.providerAuthority
  );
  return {
    input: input.registration,
    targetLease: input.targetLease,
    plan: input.plan,
    resourceManifest: input.resourceManifest,
    remoteBinding: input.remoteBinding,
    projectionAuthorityDigest: input.registration.projectionAuthorityDigest,
    providerAuthority: input.providerAuthority,
    deferredHost,
    provider,
    capabilitySnapshot,
    controlCapabilityIds,
    acquired: false,
    released: false,
    started: false,
    blocked: false,
    issued: new Map(),
  };
};

const requireReadySession = (
  state: ProductionBrowserRuntimeAttemptState
): Readonly<{
  host: BrowserRuntimeControlHost;
  session: DeterministicRuntimeSession;
  witness: BrowserRuntimeControlExpectedWitness;
}> => {
  if (
    !state.host ||
    !state.exposedSession ||
    !state.witness ||
    state.blocked ||
    state.released
  ) {
    throw new Error('Production browser runtime control lease is unavailable.');
  }
  return Object.freeze({
    host: state.host,
    session: state.exposedSession,
    witness: state.witness,
  });
};

export const createProductionBrowserRuntimeControlLease = (
  state: ProductionBrowserRuntimeAttemptState
): BrowserRuntimeControlLease => {
  const fixtureBinding = createBrowserRuntimeControlFixtureBinding({
    plan: state.plan,
    executableSnapshotDigest: state.input.snapshot.contentDigest,
    projectionAuthorityDigest: state.projectionAuthorityDigest,
    expectedRuntimeDispatchCount: 0,
  });
  const leaseId = `runtime-control:${digestVerificationValue({
    attemptId: state.input.attemptId,
    generation: state.input.generation,
    providerKind: state.input.providerKind,
    targetLeaseBindingDigest: state.targetLease.bindingDigest,
    controlDigest: state.plan.controlDigest,
    remoteBindingDigest: state.remoteBinding.bindingDigest,
  }).slice('sha256-'.length)}`;
  const lease: BrowserRuntimeControlLease = Object.freeze({
    leaseId,
    attemptId: state.input.attemptId,
    generation: state.input.generation,
    providerKind: 'remote',
    targetLeaseBindingDigest: state.targetLease.bindingDigest,
    originDigest: state.targetLease.binding.originDigest,
    controlHostUrl: state.resourceManifest.resources.find(
      ({ kind }) => kind === 'control-host'
    )!.url,
    executableSnapshotDigest: state.input.snapshot.contentDigest,
    resourceManifest: state.resourceManifest,
    fixtureBinding,
    plan: state.plan,
    expectedControlDigest: state.plan.controlDigest,
    expectedCapabilitySnapshot: state.capabilitySnapshot,
    controlCapabilityIds: state.controlCapabilityIds,
    remoteBinding: state.remoteBinding,
    async start(host) {
      if (!state.acquired || state.started || state.released || state.host) {
        throw new Error(
          'Production browser runtime control start is single-use and lease-bound.'
        );
      }
      state.started = true;
      state.host = host;
      state.deferredHost.bind(host);
      const result = await state.provider.startAttempt({
        attemptId: state.input.attemptId,
        plan: state.plan,
      });
      if (result.status !== 'ready') {
        state.blocked = true;
        return result;
      }
      if (result.session.network.events().length !== 0) {
        state.blocked = true;
        state.cleanupCanary = await result.session.cleanup();
        throw new TypeError(
          'Production browser no-fixture runtime started with network events.'
        );
      }
      state.session = result.session;
      state.exposedSession = wrapSession(result.session, state);
      state.witness = createExpectedWitness(state.exposedSession, state.plan);
      return Object.freeze({
        status: 'ready' as const,
        session: state.exposedSession,
      });
    },
    expectedWitness: () => requireReadySession(state).witness,
    liveWitness: () => readLiveWitness(requireReadySession(state).session),
    async attest(phase) {
      const ready = requireReadySession(state);
      const issued = [...state.issued.values()];
      if (
        state.exposedSession!.network.events().length !== 0 ||
        (phase === 'initial' &&
          issued.some((candidate) => candidate.phase === 'initial')) ||
        (phase === 'terminal' &&
          (!issued.some((candidate) => candidate.phase === 'initial') ||
            issued.some((candidate) => candidate.phase === 'terminal')))
      ) {
        throw new Error(
          'Production browser runtime attestation order or no-fixture ledger drifted.'
        );
      }
      const application = await ready.host.observe(ready.session, phase);
      const attestation = createBrowserRuntimeControlAttestation({
        lease,
        phase,
        providerId: state.provider.descriptor.id,
        namespace: ready.session.applied.namespace,
        capabilitySnapshotDigest:
          ready.session.applied.capabilitySnapshotDigest,
        application,
      });
      state.issued.set(attestation.attestationDigest, attestation);
      return attestation;
    },
    assertIssued(attestation) {
      const asserted = assertBrowserRuntimeControlAttestation(
        attestation,
        lease
      );
      const issued = state.issued.get(asserted.attestationDigest);
      if (!issued || !sameCanonicalJson(issued, asserted)) {
        throw new TypeError(
          'Production browser runtime attestation was not issued by this lease.'
        );
      }
      return asserted;
    },
    sealTerminal(attestation) {
      const asserted = lease.assertIssued(attestation);
      if (asserted.phase !== 'terminal' || state.terminal || state.released) {
        throw new Error(
          'Production browser terminal attestation cannot be sealed.'
        );
      }
      state.terminal = asserted;
    },
    terminalSealed: () => state.terminal !== undefined,
  });
  state.lease = lease;
  return lease;
};

export const releaseProductionBrowserRuntimeState = async (
  state: ProductionBrowserRuntimeAttemptState,
  lease: BrowserRuntimeControlLease,
  terminalAttestation: BrowserRuntimeControlAttestation | undefined
): Promise<
  Readonly<{
    status: 'clean' | 'residual' | 'failed';
    residualCanaryIds: readonly string[];
    diagnosticCodes: readonly string[];
  }>
> => {
  if (
    !state.acquired ||
    state.released ||
    state.lease !== lease ||
    lease.attemptId !== state.input.attemptId
  ) {
    return Object.freeze({
      status: 'failed',
      residualCanaryIds: Object.freeze([
        `canary:browser:${lease.attemptId}:runtime-lease`,
      ]),
      diagnosticCodes: Object.freeze([
        'VER-PRODUCTION-BROWSER-RUNTIME-RELEASE-DRIFT',
      ]),
    });
  }
  state.released = true;
  let residual = state.cleanupCanary?.residual;
  if (!residual && state.blocked) {
    residual = state.deferredHost.lastCleanupResidual();
  }
  if (!state.started) residual = emptyResidual();
  if (!residual) {
    return Object.freeze({
      status: 'failed',
      residualCanaryIds: Object.freeze([
        `canary:browser:${state.input.attemptId}:cleanup-unattested`,
      ]),
      diagnosticCodes: Object.freeze([
        'VER-PRODUCTION-BROWSER-RUNTIME-CLEANUP-UNATTESTED',
      ]),
    });
  }
  const canaryIds = residualCanaryIds(residual, state.input.attemptId);
  if (canaryIds.length > 0) {
    return Object.freeze({
      status: 'residual',
      residualCanaryIds: canaryIds,
      diagnosticCodes: Object.freeze([
        'VER-PRODUCTION-BROWSER-RUNTIME-CLEANUP-RESIDUAL',
      ]),
    });
  }
  if (state.started && !state.blocked && terminalAttestation === undefined) {
    return Object.freeze({
      status: 'failed',
      residualCanaryIds: Object.freeze([]),
      diagnosticCodes: Object.freeze([
        'VER-PRODUCTION-BROWSER-TERMINAL-ATTESTATION-MISSING',
      ]),
    });
  }
  if (terminalAttestation !== undefined) {
    try {
      if (
        !state.terminal ||
        !lease.terminalSealed() ||
        !sameCanonicalJson(
          lease.assertIssued(terminalAttestation),
          state.terminal
        )
      ) {
        throw new TypeError('Terminal attestation is not exact.');
      }
    } catch {
      return Object.freeze({
        status: 'failed',
        residualCanaryIds: Object.freeze([]),
        diagnosticCodes: Object.freeze([
          'VER-PRODUCTION-BROWSER-TERMINAL-ATTESTATION-DRIFT',
        ]),
      });
    }
  }
  return Object.freeze({
    status: 'clean',
    residualCanaryIds: Object.freeze([]),
    diagnosticCodes: Object.freeze([]),
  });
};

export const forceCleanupProductionBrowserRuntimeState = async (
  state: ProductionBrowserRuntimeAttemptState
): Promise<readonly string[]> => {
  if (state.exposedSession && !state.cleanupCanary) {
    state.cleanupCanary = await state.exposedSession.cleanup();
  }
  const residual =
    state.cleanupCanary?.residual ??
    state.deferredHost.lastCleanupResidual() ??
    (state.started ? { ...emptyResidual(), effects: 1 } : emptyResidual());
  state.released = true;
  return residualCanaryIds(residual, state.input.attemptId);
};
