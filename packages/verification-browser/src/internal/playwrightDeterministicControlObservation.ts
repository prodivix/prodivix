import type { DeterministicRuntimeSession } from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { digestVerificationValue } from '@prodivix/verification';
import {
  BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
  type BrowserRuntimeControlApplication,
  type BrowserRuntimeControlAttestationPhase,
  type BrowserRuntimeControlLease,
} from '../browserRuntimeControlPort';
import { assertPlaywrightLoopbackOrigin } from './playwrightDeterministicControlContext';
import type { PlaywrightDeterministicSettleResult } from './playwrightDeterministicControlOperation';
import type { RuntimeCursorProjection } from './playwrightDeterministicControlProtocol';
import type { PlaywrightDeterministicResourceRouterSnapshot } from './playwrightDeterministicResourceRouter';
import type { PlaywrightDenyProxyAuthoritySnapshot } from './playwrightDenyProxyAuthority';

export type PlaywrightDeterministicAttemptActivity = {
  documentInitializationCount: number;
  authoredAnimationCreationCount: number;
  authorAnimationFrameCreationCount: number;
  cryptoRandomCreationCount: number;
  nativeTimerCreationCount: number;
  streamCreationCount: number;
  workerCreationCount: number;
  deniedWorkerCreations: number;
  deniedRequests: number;
  authorRequestCreationCount: number;
};

export const projectPlaywrightRuntimeControlApplication = (input: {
  lease: BrowserRuntimeControlLease;
  phase: BrowserRuntimeControlAttestationPhase;
  origin: string;
  session: DeterministicRuntimeSession;
  runtimeSession: DeterministicRuntimeSession | undefined;
  settle: PlaywrightDeterministicSettleResult;
  activity: Readonly<PlaywrightDeterministicAttemptActivity>;
  manifestViolations: number;
  routes: PlaywrightDeterministicResourceRouterSnapshot;
  proxy: PlaywrightDenyProxyAuthoritySnapshot | undefined;
  cursorLedger: RuntimeCursorProjection;
  cursorViolationCount: number;
  createdPageCount: number;
  childFrameAttachmentCount: number;
  contextPageCount: number;
  pageFrameCount: number;
  pageErrorMessages: readonly string[];
  policyViolationDirectives: readonly string[];
  cleanAtReset: boolean;
  virtualAnimationTimeMs: number;
  animationClockSyncCount: number;
}): BrowserRuntimeControlApplication => {
  const witness = input.settle.snapshot;
  const storage = witness.storage;
  const render = witness.rendering;
  const registrations = storage.serviceWorkerRegistrations;
  const schedulerSnapshot = input.session.scheduler.snapshot();
  const fixtureDispatchLedger = input.session.network.events();
  const declaredFixtureCount =
    input.lease.fixtureBinding.expectedRuntimeDispatchCount;
  const observedFixtureCount = input.routes.fixtureRequestCount;
  const expectedAuthorRequestCount = input.routes.requestLedger.filter(
    ({ resourceType }) => resourceType === 'fetch' || resourceType === 'xhr'
  ).length;
  const expectedFixtureCount =
    input.phase === 'initial' && declaredFixtureCount === 1
      ? observedFixtureCount
      : declaredFixtureCount;
  const fixtureResolution = input.routes.fixtureResolutionLedger[0];
  const completedOperationCount = schedulerSnapshot.events.filter(
    ({ kind, lane }) =>
      kind === 'task-completed' && lane === 'browser-operation'
  ).length;
  const attemptSettle = Object.freeze({
    ...input.settle.observation,
    authoredAnimationCreationCount:
      input.activity.authoredAnimationCreationCount,
    authorAnimationFrameCreationCount:
      input.activity.authorAnimationFrameCreationCount,
    cryptoRandomCreationCount: input.activity.cryptoRandomCreationCount,
    animationClockSyncCount: input.animationClockSyncCount,
    nativeTimerCreationCount: input.activity.nativeTimerCreationCount,
    streamCreationCount: input.activity.streamCreationCount,
    workerCreationCount: input.activity.workerCreationCount,
    deniedWorkerCreations: input.activity.deniedWorkerCreations,
  });
  if (
    (declaredFixtureCount === 1 &&
      input.phase === 'initial' &&
      expectedFixtureCount !== 0 &&
      expectedFixtureCount !== 1) ||
    (input.phase === 'terminal' &&
      observedFixtureCount !== declaredFixtureCount) ||
    input.routes.fixtureRequestCount !== expectedFixtureCount ||
    fixtureDispatchLedger.length !== expectedFixtureCount ||
    input.routes.fixtureResponseCount !== expectedFixtureCount ||
    input.routes.fixtureResolutionLedger.length !== expectedFixtureCount
  ) {
    throw new Error(
      [
        'Browser runtime fixture causal ledger mismatch.',
        `expected=${expectedFixtureCount}`,
        `request=${input.routes.fixtureRequestCount}`,
        `dispatch=${fixtureDispatchLedger.length}`,
        `response=${input.routes.fixtureResponseCount}`,
        `resolution=${input.routes.fixtureResolutionLedger.length}`,
      ].join(' ')
    );
  }
  const proxy = input.proxy;
  if (!proxy) {
    throw new Error(
      'Browser runtime controls observed tamper, undeclared effects, or resource drift: proxy.'
    );
  }
  const driftedFields = (
    [
      [
        'witness.namespace',
        witness.namespace !== input.session.applied.namespace,
      ],
      [
        'witness.fixtureBindingDigest',
        witness.fixtureBindingDigest !==
          input.lease.fixtureBinding.bindingDigest,
      ],
      [
        'witness.executableSnapshotDigest',
        witness.executableSnapshotDigest !==
          input.lease.executableSnapshotDigest,
      ],
      [
        'render.origin',
        render.origin !== assertPlaywrightLoopbackOrigin(input.origin),
      ],
      ['manifestViolations', input.manifestViolations !== 0],
      ['routes.deniedRouteRequests', input.routes.deniedRouteRequests !== 0],
      ['routes.manifestViolations', input.routes.manifestViolations !== 0],
      ['routes.activeRouteRequests', input.routes.activeRouteRequests !== 0],
      [
        'activity.documentInitializationCount',
        input.activity.documentInitializationCount < 1,
      ],
      [
        'witness.cursor',
        !sameCanonicalJson(witness.cursor, input.cursorLedger),
      ],
      ['cursorViolationCount', input.cursorViolationCount !== 0],
      ['cursorLedger.witnessCaptured', !input.cursorLedger.witnessCaptured],
      ['createdPageCount', input.createdPageCount !== 1],
      ['childFrameAttachmentCount', input.childFrameAttachmentCount !== 0],
      ['contextPageCount', input.contextPageCount !== 1],
      ['pageFrameCount', input.pageFrameCount !== 1],
      ['pageErrorMessages', input.pageErrorMessages.length !== 0],
      [
        `activity.policyViolationDirectives(${input.policyViolationDirectives.join('|')})`,
        input.policyViolationDirectives.length !== 0,
      ],
      [
        `activity.deniedRequests(actual=${input.activity.deniedRequests},expected=0)`,
        input.activity.deniedRequests !== 0,
      ],
      [
        `activity.authorRequestCreationCount(actual=${input.activity.authorRequestCreationCount},expected=${expectedAuthorRequestCount})`,
        input.activity.authorRequestCreationCount !==
          expectedAuthorRequestCount,
      ],
      [
        'activity.nativeTimerCreationCount',
        input.activity.nativeTimerCreationCount !== 0,
      ],
      [
        `activity.streamCreationCount(actual=${input.activity.streamCreationCount},expected=${expectedAuthorRequestCount})`,
        input.activity.streamCreationCount !== expectedAuthorRequestCount,
      ],
      [
        'activity.workerCreationCount',
        input.activity.workerCreationCount !== 0,
      ],
      [
        'activity.authoredAnimationCreationCount',
        input.activity.authoredAnimationCreationCount !== 0,
      ],
      [
        'activity.authorAnimationFrameCreationCount',
        input.activity.authorAnimationFrameCreationCount !== 0,
      ],
      [
        'activity.cryptoRandomCreationCount',
        input.activity.cryptoRandomCreationCount !== 0,
      ],
      [
        'witness.virtualAnimationTimeMs',
        witness.virtualAnimationTimeMs !== input.session.clock.now(),
      ],
      [
        'virtualAnimationTimeMs',
        input.virtualAnimationTimeMs !== input.session.clock.now(),
      ],
      ['witness.animationClockSyncCount', witness.animationClockSyncCount < 1],
      [
        'animationClockSyncCount',
        input.animationClockSyncCount !== completedOperationCount,
      ],
      ['routes.responseCount', input.routes.responseCount < 1],
      ['runtimeSession', input.runtimeSession !== input.session],
      ['proxy.connectionAttemptCount', proxy.connectionAttemptCount !== 0],
      ['proxy.activeConnectionCount', proxy.activeConnectionCount !== 0],
      ['proxy.connectAttemptCount', proxy.connectAttemptCount !== 0],
      ['proxy.httpRequestAttemptCount', proxy.httpRequestAttemptCount !== 0],
      ['proxy.unknownAttemptCount', proxy.unknownAttemptCount !== 0],
      ['proxy.faultCount', proxy.faultCount !== 0],
    ] as const
  )
    .filter(([, drifted]) => drifted)
    .map(([field]) => field);
  if (driftedFields.length > 0) {
    throw new Error(
      `Browser runtime controls observed tamper, undeclared effects, or resource drift: ${driftedFields.join(', ')}.`
    );
  }
  return Object.freeze({
    clock: Object.freeze({
      epoch: input.lease.plan.clock.epoch,
      observedEpochMs: witness.now,
    }),
    random: Object.freeze({
      algorithm: input.lease.plan.random.algorithm,
      expectedSample: witness.expectedRandomSample,
      observedSample: witness.observedRandomSample,
    }),
    identifiers: Object.freeze({
      namespaces: Object.freeze([...input.lease.plan.identifiers.namespaces]),
      expectedSamples: witness.expectedIdentifierSamples,
      observedSamples: witness.observedIdentifierSamples,
      expectedOperationUuid: witness.expectedOperationUuid,
      observedOperationUuid: witness.observedOperationUuid,
    }),
    consumption: Object.freeze({
      documentInitializationCount:
        input.cursorLedger.documentInitializationCount,
      randomSampleCount: input.cursorLedger.randomSampleCount,
      identifierSampleCounts: Object.freeze({
        ...input.cursorLedger.identifierSampleCounts,
      }),
      witnessCaptured: true as const,
      ledgerDigest: digestVerificationValue({
        documentInitializationCount:
          input.cursorLedger.documentInitializationCount,
        randomSampleCount: input.cursorLedger.randomSampleCount,
        identifierSampleCounts: input.cursorLedger.identifierSampleCounts,
        witnessCaptured: true,
      }),
    }),
    scheduler: Object.freeze({
      maximumConcurrency: input.lease.plan.scheduler.maximumConcurrency,
      lane: 'browser-operation' as const,
      status: schedulerSnapshot.status,
      turns: schedulerSnapshot.turns,
      pendingTaskCount: schedulerSnapshot.pendingTaskIds.length,
      pendingBarrierCount: schedulerSnapshot.pendingBarrierIds.length,
      droppedEventCount: schedulerSnapshot.droppedEventCount,
      completedOperationCount,
      snapshotDigest: digestVerificationValue(schedulerSnapshot),
    }),
    network: Object.freeze({
      mode: input.lease.plan.network.mode,
      undeclaredRequest: 'reject' as const,
      egressPolicy: 'exact-loopback-origin-only' as const,
      sandboxProfileDigest: BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
      proxyEndpointDigest: proxy.endpointDigest,
      proxyConnectionAttemptCount: proxy.connectionAttemptCount,
      proxyActiveConnectionCount: proxy.activeConnectionCount,
      proxyConnectAttemptCount: proxy.connectAttemptCount,
      proxyHttpRequestAttemptCount: proxy.httpRequestAttemptCount,
      proxyUnknownAttemptCount: proxy.unknownAttemptCount,
      proxyFaultCount: proxy.faultCount,
      proxyAttemptLedgerDigest: proxy.attemptLedgerDigest,
      allowedOriginDigest: input.lease.originDigest,
      resourceManifestDigest: input.lease.resourceManifest.manifestDigest,
      observedRequestLedgerDigest: digestVerificationValue(
        input.routes.requestLedger
      ),
      observedResponseCount: input.routes.responseCount,
      observedAuthorRequestCount: expectedAuthorRequestCount,
      authorRequestCreationCount: input.activity.authorRequestCreationCount,
      deniedRequestCount:
        input.manifestViolations +
        input.routes.deniedRouteRequests +
        input.routes.manifestViolations +
        input.activity.deniedRequests,
      activeRequestCount:
        input.routes.activeRouteRequests + witness.pendingStreams,
      fixtureBindingDigest: input.lease.fixtureBinding.bindingDigest,
      fixtureRequestCount: input.routes.fixtureRequestCount,
      fixtureDispatchCount: fixtureDispatchLedger.length,
      fixtureResponseCount: input.routes.fixtureResponseCount,
      fixtureDispatchLedgerDigest: digestVerificationValue(
        fixtureDispatchLedger
      ),
      fixtureResponseDigest: fixtureResolution?.responseDigest ?? null,
      fixtureResolutionDigest: fixtureResolution?.resolutionDigest ?? null,
      fixtureConsumptionLedgerDigest: digestVerificationValue(
        input.routes.fixtureResolutionLedger
      ),
    }),
    storage: Object.freeze({
      namespace: input.session.applied.namespace,
      executableSnapshotDigest: input.lease.executableSnapshotDigest,
      bootstrapFixtureDigest: input.lease.fixtureBinding.storageBootstrapDigest,
      cleanAtReset: input.cleanAtReset,
      localStorageEntries: storage.localStorageEntries,
      sessionStorageEntries: storage.sessionStorageEntries,
      sessionStorageKeysDigest: digestVerificationValue(
        storage.sessionStorageKeys
      ),
      indexedDbDatabases: storage.indexedDbDatabases,
      cacheStorageEntries: storage.cacheStorageEntries,
    }),
    rendering: Object.freeze({
      viewport: Object.freeze({
        width: render.width,
        height: render.height,
      }),
      devicePixelRatio: render.devicePixelRatio,
      colorScheme: render.colorScheme,
      motion: render.motion,
      locale: render.locale,
      timezone: render.timezone,
      fontReady: render.fontReady,
      animationPolicy: 'no-active-authored-animations' as const,
      animationClock: 'virtual' as const,
      observedAnimationTimeMs: input.virtualAnimationTimeMs,
      nativeTiming: Object.freeze({
        timeOrigin: input.settle.timeOrigin,
        performanceNowDelta: input.settle.performanceNowDelta,
        animationFrameTimestamp: input.settle.animationFrameTimestamp,
      }),
      settle: attemptSettle,
    }),
    serviceWorker: Object.freeze({
      mode: input.lease.plan.serviceWorker.mode,
      registrations,
    }),
  });
};
