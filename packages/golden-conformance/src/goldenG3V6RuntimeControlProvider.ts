import {
  EMPTY_BROWSER_RUNTIME_RESIDUAL,
  createBrowserDeterministicReplayProvider,
  type BrowserDeterministicControlHost,
} from '@prodivix/runtime-browser';
import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  createCiDeterministicRuntimeProvider,
  createExportDeterministicRuntimeProvider,
  digestDeterministicRuntimeValue,
  type DeterministicRuntimeCapabilitySnapshot,
  type DeterministicRuntimeControlId,
  type DeterministicRuntimeControlPlan,
  type DeterministicRuntimeFixture,
  type DeterministicRuntimePlanCell,
  type DeterministicRuntimeProvider,
  type DeterministicRuntimeSession,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import { createRemoteDeterministicReplayProvider } from '@prodivix/runtime-remote';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  createBrowserRuntimeControlUuid,
  type BrowserRuntimeControlExpectedWitness,
  type BrowserRuntimeControlHost,
  type BrowserRuntimeControlLiveWitness,
} from '@prodivix/verification-browser';
import type {
  GoldenG3V6ControlledProviderKind,
  GoldenG3V6RuntimeControlRegistrationInput,
} from './goldenG3V6RuntimeControlEvidence';

const canonicalControlIds: readonly DeterministicRuntimeControlId[] =
  Object.freeze(
    [...DETERMINISTIC_RUNTIME_CONTROL_IDS].sort(compareUnicodeCodePoints)
  );

export type GoldenG3V6DeferredControlHost = Readonly<{
  hooks: BrowserDeterministicControlHost;
  bind(host: BrowserRuntimeControlHost): void;
}>;

export const createGoldenG3V6RuntimePlanCell = (
  input: GoldenG3V6RuntimeControlRegistrationInput
): DeterministicRuntimePlanCell => {
  if (!input.cell.browserEngine) {
    throw new Error(
      `Golden V6 browser cell "${input.cell.id}" has no browser engine.`
    );
  }
  return Object.freeze({
    id: `${input.cell.id}:${input.providerKind}`,
    frameworkTarget: input.cell.frameworkTarget,
    surface: input.providerKind,
    browserEngine: input.cell.browserEngine,
    viewport: input.cell.viewport,
    colorScheme: input.cell.colorScheme,
    motion: input.cell.motion,
    locale: input.cell.locale,
  });
};

const createDeferredHost = (
  attemptId: string
): GoldenG3V6DeferredControlHost => {
  let host: BrowserRuntimeControlHost | undefined;
  const requireHost = (): BrowserRuntimeControlHost => {
    if (!host) {
      throw new Error(
        `Golden V6 runtime control host for "${attemptId}" is not bound.`
      );
    }
    return host;
  };
  return Object.freeze({
    bind(nextHost) {
      if (host) {
        throw new Error(
          `Golden V6 runtime control host for "${attemptId}" is already bound.`
        );
      }
      host = nextHost;
    },
    hooks: Object.freeze({
      reset: (request: Parameters<BrowserRuntimeControlHost['reset']>[0]) =>
        requireHost().reset(request),
      async apply(request: Parameters<BrowserRuntimeControlHost['apply']>[0]) {
        const applied = await requireHost().apply(request);
        return Object.freeze({
          appliedControlDigest: applied.appliedControlDigest,
          fontReady: applied.fontReady ?? false,
        });
      },
      probe: (request: Parameters<BrowserRuntimeControlHost['probe']>[0]) =>
        requireHost().probe(request),
      cleanup: (request: Parameters<BrowserRuntimeControlHost['cleanup']>[0]) =>
        requireHost().cleanup(request),
    }),
  });
};

const createProvider = (
  providerKind: GoldenG3V6ControlledProviderKind,
  deferredHost: GoldenG3V6DeferredControlHost
): DeterministicRuntimeProvider => {
  const implementationDigest = digestDeterministicRuntimeValue({
    package: '@prodivix/golden-conformance',
    contract: 'g3-v6-runtime-control-registry',
    providerKind,
    version: 1,
  });
  switch (providerKind) {
    case 'browser':
      return createBrowserDeterministicReplayProvider({
        implementationDigest,
        host: deferredHost.hooks,
      });
    case 'remote':
      return createRemoteDeterministicReplayProvider({
        implementationDigest,
        transport: deferredHost.hooks,
      });
    case 'export':
      return createExportDeterministicRuntimeProvider({
        implementationDigest,
        hooks: deferredHost.hooks,
      });
    case 'ci':
      return createCiDeterministicRuntimeProvider({
        implementationDigest,
        hooks: deferredHost.hooks,
      });
  }
};

const exactCapabilities = (
  snapshot: DeterministicRuntimeCapabilitySnapshot
): readonly DeterministicRuntimeControlId[] => {
  const actual = Object.freeze(
    snapshot.controls
      .map(({ controlId }) => controlId)
      .sort(compareUnicodeCodePoints)
  );
  if (
    actual.length !== canonicalControlIds.length ||
    actual.some(
      (controlId, index) => controlId !== canonicalControlIds[index]
    ) ||
    snapshot.controls.some(({ status }) => status !== 'supported')
  ) {
    throw new Error(
      'Golden V6 runtime provider capability snapshot is incomplete.'
    );
  }
  return actual;
};

export const exactGoldenG3V6ExpectedControlIds = (
  value: readonly string[]
): readonly DeterministicRuntimeControlId[] => {
  const sorted = Object.freeze([...value].sort(compareUnicodeCodePoints));
  if (
    sorted.length !== canonicalControlIds.length ||
    sorted.some((controlId, index) => controlId !== canonicalControlIds[index])
  ) {
    throw new TypeError('Golden V6 runtime control capability ids drifted.');
  }
  return sorted as readonly DeterministicRuntimeControlId[];
};

export const createGoldenG3V6RuntimeControlProvider = (input: {
  registration: GoldenG3V6RuntimeControlRegistrationInput;
  plan: DeterministicRuntimeControlPlan;
}): Readonly<{
  provider: DeterministicRuntimeProvider;
  deferredHost: GoldenG3V6DeferredControlHost;
  capabilitySnapshot: DeterministicRuntimeCapabilitySnapshot;
  controlCapabilityIds: readonly DeterministicRuntimeControlId[];
}> => {
  const deferredHost = createDeferredHost(input.registration.attemptId);
  const provider = createProvider(
    input.registration.providerKind,
    deferredHost
  );
  const capabilitySnapshot = provider.inspect(input.plan);
  return Object.freeze({
    provider,
    deferredHost,
    capabilitySnapshot,
    controlCapabilityIds: exactCapabilities(capabilitySnapshot),
  });
};

export const createGoldenG3V6ExpectedControlWitness = (
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
      'Golden V6 runtime control Plan must declare all identifier namespaces.'
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
    operationUuid: createBrowserRuntimeControlUuid(identifierSamples.operation),
  });
};

export type GoldenG3V6FixtureRuntimeDispatchEvidence =
  | Readonly<{
      mode: 'auth-session';
      dispatchCount: 1;
      fixtureId: string;
      targetKind: 'auth-session';
      resourceId: string;
      inputDigest: string;
      outcomeDigest: string;
      eventDigest: string;
      dispatchDigest: string;
    }>
  | Readonly<{
      mode: 'no-fixture';
      dispatchCount: 0;
      dispatchDigest: string;
    }>;

type GoldenG3V6AuthFixture = DeterministicRuntimeFixture &
  Readonly<{
    target: Readonly<{
      kind: 'auth-session';
      resourceId: string;
    }>;
    outcome: Extract<
      DeterministicRuntimeFixture['outcome'],
      Readonly<{ kind: 'result' }>
    >;
  }>;

export type GoldenG3V6AuthFixtureResolution = Readonly<{
  status: 'matched';
  dispatchSequence: number;
  dispatchLogicalTime: number;
  fixtureId: string;
  targetKind: 'auth-session';
  resourceId: string;
  inputDigest: string;
  outcomeDigest: string;
  value: ExecutionValue;
  resolutionDigest: string;
}>;

const exactGoldenAuthFixture = (
  plan: DeterministicRuntimeControlPlan
): GoldenG3V6AuthFixture => {
  const fixtures = plan.network.fixtures.filter(
    ({ target }) => target.kind === 'auth-session'
  );
  if (fixtures.length !== 1 || fixtures[0]?.outcome.kind !== 'result') {
    throw new TypeError(
      'Golden V6 runtime controls require one exact auth-session result fixture.'
    );
  }
  return fixtures[0] as GoldenG3V6AuthFixture;
};

/**
 * Resolves the authenticated Golden fixture through the live Core session.
 * The returned digest binds the exact request, result value, and Core event.
 */
export const dispatchGoldenG3V6AuthFixture = async (
  session: DeterministicRuntimeSession,
  plan: DeterministicRuntimeControlPlan
): Promise<
  Readonly<{
    resolution: GoldenG3V6AuthFixtureResolution;
    evidence: GoldenG3V6FixtureRuntimeDispatchEvidence;
  }>
> => {
  if (session.network.events().length !== 0) {
    throw new Error(
      'Golden V6 auth fixture dispatch requires a fresh Core network ledger.'
    );
  }
  const fixture = exactGoldenAuthFixture(plan);
  const request = Object.freeze({
    kind: fixture.target.kind,
    resourceId: fixture.target.resourceId,
    inputDigest: fixture.inputDigest,
    ...(fixture.attempt === undefined ? {} : { attempt: fixture.attempt }),
    ...(fixture.page === undefined ? {} : { page: fixture.page }),
  });
  const result = await session.network.dispatch(request);
  const events = session.network.events();
  const event = events[0];
  if (
    result.status !== 'matched' ||
    result.fixtureId !== fixture.id ||
    !sameCanonicalJson(result.value, fixture.outcome.value) ||
    events.length !== 1 ||
    !event ||
    event.sequence !== 1 ||
    event.requestKind !== request.kind ||
    event.resourceId !== request.resourceId ||
    event.inputDigest !== request.inputDigest ||
    event.outcome !== 'matched' ||
    event.fixtureId !== fixture.id ||
    event.reason !== undefined
  ) {
    throw new TypeError(
      'Golden V6 Core auth fixture dispatch drifted from its exact Plan outcome.'
    );
  }
  const resolutionIdentity = Object.freeze({
    status: 'matched' as const,
    dispatchSequence: event.sequence,
    dispatchLogicalTime: event.logicalTime,
    fixtureId: fixture.id,
    targetKind: fixture.target.kind,
    resourceId: fixture.target.resourceId,
    inputDigest: fixture.inputDigest,
    outcomeDigest: digestVerificationValue(fixture.outcome),
    value: result.value,
  });
  const resolution = Object.freeze({
    ...resolutionIdentity,
    resolutionDigest: digestVerificationValue(resolutionIdentity),
  });
  const identity = Object.freeze({
    resolutionDigest: resolution.resolutionDigest,
    resultDigest: digestVerificationValue(result),
    eventDigest: digestVerificationValue(event),
  });
  return Object.freeze({
    resolution,
    evidence: Object.freeze({
      mode: 'auth-session',
      dispatchCount: 1,
      fixtureId: resolution.fixtureId,
      targetKind: resolution.targetKind,
      resourceId: resolution.resourceId,
      inputDigest: resolution.inputDigest,
      outcomeDigest: resolution.outcomeDigest,
      eventDigest: identity.eventDigest,
      dispatchDigest: digestVerificationValue(identity),
    }),
  });
};

export const createGoldenG3V6NoFixtureDispatchEvidence = (
  session: DeterministicRuntimeSession,
  plan: DeterministicRuntimeControlPlan
): GoldenG3V6FixtureRuntimeDispatchEvidence => {
  if (
    plan.fixtureSetDigests.length !== 0 ||
    plan.network.fixtures.length !== 0 ||
    plan.storage.bootstrapFixtureIds.length !== 0 ||
    session.network.events().length !== 0
  ) {
    throw new TypeError(
      'Golden V6 no-fixture controls drifted from an empty Plan or network ledger.'
    );
  }
  return Object.freeze({
    mode: 'no-fixture',
    dispatchCount: 0,
    dispatchDigest: digestVerificationValue({
      mode: 'no-fixture',
      controlDigest: plan.controlDigest,
      fixtureSetDigests: plan.fixtureSetDigests,
      networkFixtures: plan.network.fixtures,
      storageBootstrapFixtureIds: plan.storage.bootstrapFixtureIds,
      events: session.network.events(),
    }),
  });
};

export const readGoldenG3V6LiveControlWitness = (
  session: DeterministicRuntimeSession,
  attemptId: string
): BrowserRuntimeControlLiveWitness => {
  if (!session) {
    throw new Error(
      `Golden V6 runtime control "${attemptId}" has no live Core session.`
    );
  }
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

export const GOLDEN_G3_V6_EMPTY_RUNTIME_RESIDUAL = Object.freeze({
  ...EMPTY_BROWSER_RUNTIME_RESIDUAL,
});
