import type {
  ExecutionAuthSessionFixtureResponse,
  DeterministicIsolationResidual,
  DeterministicRuntimeAttemptStartResult,
  DeterministicRuntimeCapabilitySnapshot,
  DeterministicRuntimeControlId,
  DeterministicRuntimeControlPlan,
  DeterministicRuntimeProviderHooks,
  DeterministicRuntimeSession,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationAdapterPrepareInput,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type { BrowserVerificationTargetLease } from './browserAdapter.types';

export const BROWSER_RUNTIME_CONTROL_ATTESTATION_FORMAT =
  'prodivix.browser-runtime-control-attestation' as const;
export const BROWSER_RUNTIME_CONTROL_ATTESTATION_VERSION = 1 as const;
export const BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_FORMAT =
  'prodivix.browser-runtime-control-resource-manifest' as const;
export const BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_VERSION = 1 as const;
export const BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_FORMAT =
  'prodivix.browser-runtime-control-fixture-binding' as const;
export const BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_VERSION = 1 as const;
export const BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST =
  digestVerificationValue({
    format: 'prodivix.browser-network-sandbox-profile',
    version: 1,
    target: 'exact-loopback-origin',
    proxy: 'per-attempt-trusted-record-and-deny-authority',
    dns: 'prefetch-off-and-non-loopback-unresolvable',
    webrtc: 'non-proxied-udp-disabled-and-author-api-denied',
    parserSpeculation: 'source-scan-rejected',
    realmTransports: 'pre-author-denied',
  });

export type BrowserRuntimeControlProviderKind = Exclude<
  VerificationAdapterPrepareInput['providerKind'],
  'local'
>;
export type BrowserRuntimeControlAttestationPhase = 'initial' | 'terminal';
export type BrowserRuntimeControlIdentifierNamespace =
  DeterministicRuntimeControlPlan['identifiers']['namespaces'][number];

export type BrowserRuntimeControlFixtureRequest = Readonly<{
  method: 'GET';
  url: string;
  invocationId: string;
  attempt: number;
}>;

export type BrowserRuntimeControlResource = Readonly<{
  url: string;
  kind: 'control-host' | 'entry' | 'bundle';
  contentDigest: string;
}>;

export type BrowserRuntimeControlResourceManifest = Readonly<{
  format: typeof BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_FORMAT;
  version: typeof BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_VERSION;
  executableSnapshotDigest: string;
  resources: readonly BrowserRuntimeControlResource[];
  manifestDigest: string;
}>;

/**
 * This binds compiler-produced fixture metadata and the exact Core runtime
 * dispatch count to one executable snapshot. Browser HTTP resource serving
 * remains independently bound by the resource manifest.
 */
export type BrowserRuntimeControlFixtureBinding = Readonly<{
  format: typeof BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_FORMAT;
  version: typeof BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_VERSION;
  mode: 'compiled-snapshot';
  executableSnapshotDigest: string;
  fixtureSetDigests: readonly string[];
  networkFixturesDigest: string;
  storageBootstrapDigest: string;
  projectionAuthorityDigest: string;
  expectedRuntimeDispatchCount: number;
  bindingDigest: string;
}>;

export type BrowserRuntimeControlRemoteBinding = Readonly<{
  attemptId: string;
  requestId: string;
  executionId: string;
  snapshotDigest: string;
  materializedBundleDigest: string;
  materializedOriginDigest: string;
  materializedEntryDigest: string;
  bindingDigest: string;
}>;

export type BrowserRuntimeControlExpectedWitness = Readonly<{
  randomSample: number;
  identifierSamples: Readonly<
    Record<BrowserRuntimeControlIdentifierNamespace, string>
  >;
  operationUuid: string;
}>;

export type BrowserRuntimeControlLiveWitness = Readonly<{
  schedulerStatus:
    | 'idle'
    | 'running'
    | 'paused'
    | 'cancelled'
    | 'deadlocked'
    | 'budget-exceeded';
  schedulerTurns: number;
  schedulerLogicalTime: number;
  schedulerPendingTaskCount: number;
  schedulerPendingBarrierCount: number;
  schedulerDroppedEventCount: number;
  schedulerCompletedOperationCount: number;
  schedulerSnapshotDigest: string;
  fixtureDispatchCount: number;
}>;

export type BrowserRuntimeControlSchedulerObservation = Readonly<{
  maximumConcurrency: number;
  lane: 'browser-operation';
  status: BrowserRuntimeControlLiveWitness['schedulerStatus'];
  turns: number;
  pendingTaskCount: number;
  pendingBarrierCount: number;
  droppedEventCount: number;
  completedOperationCount: number;
  snapshotDigest: string;
}>;

export type BrowserRuntimeControlSettleObservation = Readonly<{
  conditions: DeterministicRuntimeControlPlan['settle']['conditions'];
  maximumFrames: number;
  observedFrames: number;
  fontReady: boolean;
  activeAnimations: number;
  pendingTimers: number;
  pendingStreams: number;
  activeWorkers: number;
  authoredAnimationCreationCount: number;
  authorAnimationFrameCreationCount: number;
  cryptoRandomCreationCount: number;
  animationClockSyncCount: number;
  nativeTimerCreationCount: number;
  streamCreationCount: number;
  workerCreationCount: number;
  deniedWorkerCreations: number;
}>;

export type BrowserRuntimeControlApplication = Readonly<{
  clock: Readonly<{
    epoch: string;
    observedEpochMs: number;
  }>;
  random: Readonly<{
    algorithm: string;
    expectedSample: number;
    observedSample: number;
  }>;
  identifiers: Readonly<{
    namespaces: DeterministicRuntimeControlPlan['identifiers']['namespaces'];
    expectedSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
    observedSamples: BrowserRuntimeControlExpectedWitness['identifierSamples'];
    expectedOperationUuid: string;
    observedOperationUuid: string;
  }>;
  consumption: Readonly<{
    documentInitializationCount: number;
    randomSampleCount: number;
    identifierSampleCounts: Readonly<
      Record<BrowserRuntimeControlIdentifierNamespace, number>
    >;
    witnessCaptured: true;
    ledgerDigest: string;
  }>;
  scheduler: BrowserRuntimeControlSchedulerObservation;
  network: Readonly<{
    mode: DeterministicRuntimeControlPlan['network']['mode'];
    undeclaredRequest: 'reject';
    egressPolicy: 'exact-loopback-origin-only';
    sandboxProfileDigest: string;
    proxyEndpointDigest: string;
    proxyConnectionAttemptCount: number;
    proxyActiveConnectionCount: number;
    proxyConnectAttemptCount: number;
    proxyHttpRequestAttemptCount: number;
    proxyUnknownAttemptCount: number;
    proxyFaultCount: number;
    proxyAttemptLedgerDigest: string;
    allowedOriginDigest: string;
    resourceManifestDigest: string;
    observedRequestLedgerDigest: string;
    observedResponseCount: number;
    observedAuthorRequestCount: number;
    authorRequestCreationCount: number;
    deniedRequestCount: number;
    activeRequestCount: number;
    fixtureBindingDigest: string;
    fixtureRequestCount: number;
    fixtureDispatchCount: number;
    fixtureResponseCount: number;
    fixtureDispatchLedgerDigest: string;
    fixtureResponseDigest: string | null;
    fixtureResolutionDigest: string | null;
    fixtureConsumptionLedgerDigest: string;
  }>;
  storage: Readonly<{
    namespace: string;
    executableSnapshotDigest: string;
    bootstrapFixtureDigest: string;
    cleanAtReset: boolean;
    localStorageEntries: number;
    sessionStorageEntries: number;
    sessionStorageKeysDigest: string;
    indexedDbDatabases: number;
    cacheStorageEntries: number;
  }>;
  rendering: Readonly<{
    viewport: Readonly<{ width: number; height: number }>;
    devicePixelRatio: number;
    colorScheme: DeterministicRuntimeControlPlan['cell']['colorScheme'];
    motion: DeterministicRuntimeControlPlan['cell']['motion'];
    locale: string;
    timezone: string;
    fontReady: boolean;
    animationPolicy: 'no-active-authored-animations';
    animationClock: 'virtual';
    observedAnimationTimeMs: number;
    nativeTiming: Readonly<{
      timeOrigin: number;
      performanceNowDelta: number;
      animationFrameTimestamp: number;
    }>;
    settle: BrowserRuntimeControlSettleObservation;
  }>;
  serviceWorker: Readonly<{
    mode: DeterministicRuntimeControlPlan['serviceWorker']['mode'];
    registrations: number;
  }>;
}>;

export type BrowserRuntimeControlAttestation = Readonly<{
  format: typeof BROWSER_RUNTIME_CONTROL_ATTESTATION_FORMAT;
  version: typeof BROWSER_RUNTIME_CONTROL_ATTESTATION_VERSION;
  phase: BrowserRuntimeControlAttestationPhase;
  leaseId: string;
  attemptId: string;
  generation: number;
  providerKind: BrowserRuntimeControlProviderKind;
  providerId: string;
  targetLeaseBindingDigest: string;
  originDigest: string;
  executableSnapshotDigest: string;
  resourceManifestDigest: string;
  fixtureBindingDigest: string;
  remoteBindingDigest?: string;
  namespace: string;
  controlDigest: string;
  capabilitySnapshotDigest: string;
  application: BrowserRuntimeControlApplication;
  applicationDigest: string;
  attestationDigest: string;
}>;

export type BrowserRuntimeControlHost = Required<
  Pick<
    DeterministicRuntimeProviderHooks,
    'reset' | 'apply' | 'probe' | 'cleanup'
  >
> &
  Readonly<{
    observe(
      session: DeterministicRuntimeSession,
      phase: BrowserRuntimeControlAttestationPhase
    ): Promise<BrowserRuntimeControlApplication>;
  }>;

export type BrowserRuntimeControlLease = Readonly<{
  leaseId: string;
  attemptId: string;
  generation: number;
  providerKind: BrowserRuntimeControlProviderKind;
  targetLeaseBindingDigest: string;
  originDigest: string;
  controlHostUrl: string;
  executableSnapshotDigest: string;
  resourceManifest: BrowserRuntimeControlResourceManifest;
  fixtureBinding: BrowserRuntimeControlFixtureBinding;
  plan: DeterministicRuntimeControlPlan;
  expectedControlDigest: string;
  expectedCapabilitySnapshot: DeterministicRuntimeCapabilitySnapshot;
  controlCapabilityIds: readonly DeterministicRuntimeControlId[];
  remoteBinding?: BrowserRuntimeControlRemoteBinding;
  start(
    host: BrowserRuntimeControlHost
  ): Promise<DeterministicRuntimeAttemptStartResult>;
  expectedWitness(): BrowserRuntimeControlExpectedWitness;
  liveWitness(): BrowserRuntimeControlLiveWitness;
  resolveRuntimeFixture?(
    request: BrowserRuntimeControlFixtureRequest
  ): Promise<ExecutionAuthSessionFixtureResponse>;
  attest(
    phase: BrowserRuntimeControlAttestationPhase
  ): Promise<BrowserRuntimeControlAttestation>;
  assertIssued(
    attestation: BrowserRuntimeControlAttestation
  ): BrowserRuntimeControlAttestation;
  sealTerminal(attestation: BrowserRuntimeControlAttestation): void;
  terminalSealed(): boolean;
}>;

export type BrowserRuntimeControlReleaseResult = Readonly<{
  status: 'clean' | 'residual' | 'failed';
  residualCanaryIds: readonly string[];
  diagnosticCodes: readonly string[];
}>;

export type BrowserRuntimeControlPort = Readonly<{
  acquire(
    input: Readonly<{
      cell: VerificationPlanCell;
      targetLease: BrowserVerificationTargetLease;
      attemptId: string;
      generation: number;
      providerKind: BrowserRuntimeControlProviderKind;
      executableSnapshotDigest: string;
      expectedControlDigest: string;
      expectedCapabilitySnapshotDigest: string;
      expectedControlCapabilityIds: readonly string[];
    }>,
    signal: VerificationAbortSignal
  ): Promise<BrowserRuntimeControlLease>;
  release(
    lease: BrowserRuntimeControlLease,
    terminalAttestation: BrowserRuntimeControlAttestation | undefined,
    signal: VerificationAbortSignal
  ): Promise<BrowserRuntimeControlReleaseResult>;
}>;

const sha256Pattern = /^sha256-[a-f0-9]{64}$/u;

const assertDigest = (value: string, label: string): void => {
  if (!sha256Pattern.test(value)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
};

const exactHttpUrl = (value: string, label: string): string => {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    value !== url.href
  ) {
    throw new TypeError(`${label} must be an exact canonical HTTP URL.`);
  }
  return url.href;
};

const identifierNamespaces = Object.freeze([
  'attempt',
  'step',
  'action',
  'operation',
] as const);
const internalSessionStorageKeys = Object.freeze([
  '__prodivix_executable_snapshot__',
  '__prodivix_fixture_binding__',
  '__prodivix_runtime_cursor_seal__',
  '__prodivix_verification_namespace__',
]);
const internalSessionStorageKeysDigest = digestVerificationValue(
  internalSessionStorageKeys
);

const exactIdentifierSamples = (
  value: BrowserRuntimeControlExpectedWitness['identifierSamples']
): BrowserRuntimeControlExpectedWitness['identifierSamples'] => {
  const entries = Object.entries(value);
  if (
    entries.length !== identifierNamespaces.length ||
    identifierNamespaces.some(
      (namespace) =>
        typeof value[namespace] !== 'string' ||
        !value[namespace] ||
        value[namespace] !== value[namespace].trim()
    )
  ) {
    throw new TypeError(
      'Browser runtime identifier witness must cover all exact namespaces.'
    );
  }
  return value;
};

export const createBrowserRuntimeControlUuid = (
  deterministicIdentifier: string
): string => {
  if (
    !deterministicIdentifier ||
    deterministicIdentifier !== deterministicIdentifier.trim()
  ) {
    throw new TypeError(
      'Deterministic browser UUID input must be a canonical identifier.'
    );
  }
  const hex = digestVerificationValue({
    deterministicIdentifier,
  }).slice('sha256-'.length);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const createBrowserRuntimeControlResourceManifest = (
  input: Readonly<{
    executableSnapshotDigest: string;
    resources: readonly BrowserRuntimeControlResource[];
  }>
): BrowserRuntimeControlResourceManifest => {
  assertDigest(input.executableSnapshotDigest, 'Executable snapshot');
  if (!input.resources.length) {
    throw new TypeError('Browser runtime resource manifest must not be empty.');
  }
  const resources = Object.freeze(
    input.resources
      .map((resource) => {
        assertDigest(resource.contentDigest, 'Browser resource content');
        if (
          resource.kind !== 'control-host' &&
          resource.kind !== 'entry' &&
          resource.kind !== 'bundle'
        ) {
          throw new TypeError('Browser resource kind is unsupported.');
        }
        return Object.freeze({
          url: exactHttpUrl(resource.url, 'Browser resource URL'),
          kind: resource.kind,
          contentDigest: resource.contentDigest,
        });
      })
      .sort((left, right) => compareUnicodeCodePoints(left.url, right.url))
  );
  if (
    new Set(resources.map(({ url }) => url)).size !== resources.length ||
    resources.filter(({ kind }) => kind === 'control-host').length !== 1 ||
    resources.filter(({ kind }) => kind === 'entry').length < 1
  ) {
    throw new TypeError(
      'Browser runtime resources require unique URLs, one control host, and an entry.'
    );
  }
  const identity = Object.freeze({
    format: BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_FORMAT,
    version: BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_VERSION,
    executableSnapshotDigest: input.executableSnapshotDigest,
    resources,
  });
  return Object.freeze({
    ...identity,
    manifestDigest: digestVerificationValue(identity),
  });
};

export const createBrowserRuntimeControlFixtureBinding = (
  input: Readonly<{
    plan: DeterministicRuntimeControlPlan;
    executableSnapshotDigest: string;
    projectionAuthorityDigest: string;
    expectedRuntimeDispatchCount: number;
  }>
): BrowserRuntimeControlFixtureBinding => {
  assertDigest(input.executableSnapshotDigest, 'Executable snapshot');
  assertDigest(input.projectionAuthorityDigest, 'Projection authority');
  if (
    !Number.isSafeInteger(input.expectedRuntimeDispatchCount) ||
    input.expectedRuntimeDispatchCount < 0 ||
    input.expectedRuntimeDispatchCount > 1
  ) {
    throw new TypeError(
      'Expected Core runtime fixture dispatch count must be zero or one.'
    );
  }
  const identity = Object.freeze({
    format: BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_FORMAT,
    version: BROWSER_RUNTIME_CONTROL_FIXTURE_BINDING_VERSION,
    mode: 'compiled-snapshot' as const,
    executableSnapshotDigest: input.executableSnapshotDigest,
    fixtureSetDigests: Object.freeze([...input.plan.fixtureSetDigests]),
    networkFixturesDigest: digestVerificationValue(input.plan.network.fixtures),
    storageBootstrapDigest: digestVerificationValue(
      input.plan.storage.bootstrapFixtureIds
    ),
    projectionAuthorityDigest: input.projectionAuthorityDigest,
    expectedRuntimeDispatchCount: input.expectedRuntimeDispatchCount,
  });
  return Object.freeze({
    ...identity,
    bindingDigest: digestVerificationValue(identity),
  });
};

const assertResourceManifest = (
  value: BrowserRuntimeControlResourceManifest,
  lease: BrowserRuntimeControlLease
): void => {
  const { manifestDigest, ...identity } = value;
  if (
    value.format !== BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_FORMAT ||
    value.version !== BROWSER_RUNTIME_CONTROL_RESOURCE_MANIFEST_VERSION ||
    value.executableSnapshotDigest !== lease.executableSnapshotDigest ||
    digestVerificationValue(identity) !== manifestDigest ||
    value.resources.find(({ kind }) => kind === 'control-host')?.url !==
      lease.controlHostUrl ||
    value.resources.some(
      ({ url }) => new URL(url).origin !== new URL(lease.controlHostUrl).origin
    )
  ) {
    throw new TypeError(
      'Browser runtime resource manifest drifted from its target lease.'
    );
  }
};

const assertFixtureBinding = (
  value: BrowserRuntimeControlFixtureBinding,
  lease: BrowserRuntimeControlLease
): void => {
  const expected = createBrowserRuntimeControlFixtureBinding({
    plan: lease.plan,
    executableSnapshotDigest: lease.executableSnapshotDigest,
    projectionAuthorityDigest: value.projectionAuthorityDigest,
    expectedRuntimeDispatchCount: value.expectedRuntimeDispatchCount,
  });
  if (!sameCanonicalJson(value, expected)) {
    throw new TypeError(
      'Browser runtime fixture binding drifted from its exact Plan.'
    );
  }
};

const assertRemoteBinding = (lease: BrowserRuntimeControlLease): void => {
  if (lease.providerKind !== 'remote') {
    if (lease.remoteBinding !== undefined) {
      throw new TypeError(
        'Only Remote runtime controls may carry Remote execution binding.'
      );
    }
    return;
  }
  const binding = lease.remoteBinding;
  if (
    !binding ||
    binding.attemptId !== lease.attemptId ||
    binding.snapshotDigest !== lease.executableSnapshotDigest ||
    binding.materializedOriginDigest !== lease.originDigest ||
    !lease.resourceManifest.resources.some(
      ({ kind, contentDigest }) =>
        kind === 'entry' && contentDigest === binding.materializedEntryDigest
    )
  ) {
    throw new TypeError(
      'Remote runtime controls require exact execution, snapshot, bundle, and origin binding.'
    );
  }
  const { bindingDigest, ...identity } = binding;
  assertDigest(binding.materializedBundleDigest, 'Remote materialized bundle');
  assertDigest(binding.materializedOriginDigest, 'Remote materialized origin');
  assertDigest(binding.materializedEntryDigest, 'Remote materialized entry');
  if (bindingDigest !== digestVerificationValue(identity)) {
    throw new TypeError('Remote runtime control binding digest drifted.');
  }
};

const validateApplication = (
  application: BrowserRuntimeControlApplication,
  lease: BrowserRuntimeControlLease,
  namespace: string,
  phase: BrowserRuntimeControlAttestationPhase
): void => {
  assertResourceManifest(lease.resourceManifest, lease);
  assertFixtureBinding(lease.fixtureBinding, lease);
  assertRemoteBinding(lease);
  const witness = lease.expectedWitness();
  const liveWitness = lease.liveWitness();
  const declaredFixtureCount =
    lease.fixtureBinding.expectedRuntimeDispatchCount;
  const observedFixtureCount = application.network.fixtureRequestCount;
  const expectedFixtureCount =
    phase === 'initial' && declaredFixtureCount === 1
      ? observedFixtureCount
      : declaredFixtureCount;
  const expectedAuthorRequestCount =
    application.network.observedAuthorRequestCount;
  exactIdentifierSamples(witness.identifierSamples);
  const scheduler = application.scheduler;
  const settle = application.rendering.settle;
  const integerObservations = [
    scheduler.turns,
    liveWitness.schedulerLogicalTime,
    scheduler.pendingTaskCount,
    scheduler.pendingBarrierCount,
    scheduler.droppedEventCount,
    scheduler.completedOperationCount,
    application.network.observedResponseCount,
    application.network.observedAuthorRequestCount,
    application.network.proxyConnectionAttemptCount,
    application.network.proxyActiveConnectionCount,
    application.network.proxyConnectAttemptCount,
    application.network.proxyHttpRequestAttemptCount,
    application.network.proxyUnknownAttemptCount,
    application.network.proxyFaultCount,
    application.network.authorRequestCreationCount,
    application.network.deniedRequestCount,
    application.network.activeRequestCount,
    application.network.fixtureRequestCount,
    application.network.fixtureDispatchCount,
    application.network.fixtureResponseCount,
    application.storage.localStorageEntries,
    application.storage.sessionStorageEntries,
    application.storage.indexedDbDatabases,
    application.storage.cacheStorageEntries,
    settle.maximumFrames,
    settle.observedFrames,
    settle.activeAnimations,
    settle.pendingTimers,
    settle.pendingStreams,
    settle.activeWorkers,
    settle.authoredAnimationCreationCount,
    settle.authorAnimationFrameCreationCount,
    settle.cryptoRandomCreationCount,
    settle.animationClockSyncCount,
    settle.nativeTimerCreationCount,
    settle.streamCreationCount,
    settle.workerCreationCount,
    settle.deniedWorkerCreations,
    application.serviceWorker.registrations,
    application.rendering.observedAnimationTimeMs,
    application.consumption.documentInitializationCount,
    application.consumption.randomSampleCount,
    ...identifierNamespaces.map(
      (identifierNamespace) =>
        application.consumption.identifierSampleCounts[identifierNamespace]
    ),
  ];
  if (
    integerObservations.some(
      (value) => !Number.isSafeInteger(value) || value < 0
    ) ||
    !Number.isFinite(witness.randomSample) ||
    witness.randomSample < 0 ||
    witness.randomSample >= 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      witness.operationUuid
    ) ||
    application.clock.epoch !== lease.plan.clock.epoch ||
    application.clock.observedEpochMs !== Date.parse(lease.plan.clock.epoch) ||
    application.random.algorithm !== lease.plan.random.algorithm ||
    application.random.expectedSample !== witness.randomSample ||
    application.random.observedSample !== witness.randomSample ||
    !sameCanonicalJson(
      application.identifiers.namespaces,
      lease.plan.identifiers.namespaces
    ) ||
    !sameCanonicalJson(
      application.identifiers.expectedSamples,
      witness.identifierSamples
    ) ||
    !sameCanonicalJson(
      application.identifiers.observedSamples,
      witness.identifierSamples
    ) ||
    application.identifiers.expectedOperationUuid !== witness.operationUuid ||
    application.identifiers.observedOperationUuid !== witness.operationUuid ||
    application.consumption.documentInitializationCount < 1 ||
    application.consumption.randomSampleCount < 1 ||
    Object.keys(application.consumption.identifierSampleCounts)
      .sort(compareUnicodeCodePoints)
      .join('\u0000') !==
      [...identifierNamespaces].sort(compareUnicodeCodePoints).join('\u0000') ||
    identifierNamespaces.some(
      (identifierNamespace) =>
        application.consumption.identifierSampleCounts[identifierNamespace] < 1
    ) ||
    application.consumption.witnessCaptured !== true ||
    application.consumption.ledgerDigest !==
      digestVerificationValue({
        documentInitializationCount:
          application.consumption.documentInitializationCount,
        randomSampleCount: application.consumption.randomSampleCount,
        identifierSampleCounts: application.consumption.identifierSampleCounts,
        witnessCaptured: application.consumption.witnessCaptured,
      }) ||
    lease.plan.scheduler.maximumConcurrency !== 1 ||
    scheduler.maximumConcurrency !== 1 ||
    scheduler.lane !== 'browser-operation' ||
    scheduler.status !== 'idle' ||
    scheduler.status !== liveWitness.schedulerStatus ||
    scheduler.turns !== liveWitness.schedulerTurns ||
    scheduler.pendingTaskCount !== 0 ||
    scheduler.pendingTaskCount !== liveWitness.schedulerPendingTaskCount ||
    scheduler.pendingBarrierCount !== 0 ||
    scheduler.pendingBarrierCount !==
      liveWitness.schedulerPendingBarrierCount ||
    scheduler.droppedEventCount !== 0 ||
    scheduler.droppedEventCount !== liveWitness.schedulerDroppedEventCount ||
    scheduler.completedOperationCount !==
      liveWitness.schedulerCompletedOperationCount ||
    scheduler.snapshotDigest !== liveWitness.schedulerSnapshotDigest ||
    scheduler.turns < 1 ||
    scheduler.completedOperationCount < 1 ||
    application.network.mode !== lease.plan.network.mode ||
    application.network.undeclaredRequest !==
      lease.plan.network.undeclaredRequest ||
    application.network.egressPolicy !== 'exact-loopback-origin-only' ||
    application.network.sandboxProfileDigest !==
      BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST ||
    application.network.proxyConnectionAttemptCount !== 0 ||
    application.network.proxyActiveConnectionCount !== 0 ||
    application.network.proxyConnectAttemptCount !== 0 ||
    application.network.proxyHttpRequestAttemptCount !== 0 ||
    application.network.proxyUnknownAttemptCount !== 0 ||
    application.network.proxyFaultCount !== 0 ||
    application.network.proxyAttemptLedgerDigest !==
      digestVerificationValue([]) ||
    application.network.allowedOriginDigest !== lease.originDigest ||
    application.network.resourceManifestDigest !==
      lease.resourceManifest.manifestDigest ||
    application.network.observedResponseCount < 1 ||
    (declaredFixtureCount === 1 &&
      phase === 'initial' &&
      observedFixtureCount !== 0 &&
      observedFixtureCount !== 1) ||
    (phase === 'terminal' && observedFixtureCount !== declaredFixtureCount) ||
    application.network.authorRequestCreationCount !==
      expectedAuthorRequestCount ||
    application.network.deniedRequestCount !== 0 ||
    application.network.activeRequestCount !== 0 ||
    application.network.fixtureBindingDigest !==
      lease.fixtureBinding.bindingDigest ||
    application.network.fixtureRequestCount !== expectedFixtureCount ||
    application.network.fixtureDispatchCount !== expectedFixtureCount ||
    application.network.fixtureDispatchCount !==
      liveWitness.fixtureDispatchCount ||
    application.network.fixtureResponseCount !== expectedFixtureCount ||
    (declaredFixtureCount === 0
      ? lease.resolveRuntimeFixture !== undefined
      : typeof lease.resolveRuntimeFixture !== 'function') ||
    (expectedFixtureCount === 0
      ? application.network.fixtureResponseDigest !== null ||
        application.network.fixtureResolutionDigest !== null ||
        application.network.fixtureConsumptionLedgerDigest !==
          digestVerificationValue([])
      : application.network.fixtureResponseDigest === null ||
        application.network.fixtureResolutionDigest === null) ||
    application.storage.namespace !== namespace ||
    application.storage.executableSnapshotDigest !==
      lease.executableSnapshotDigest ||
    application.storage.bootstrapFixtureDigest !==
      lease.fixtureBinding.storageBootstrapDigest ||
    !application.storage.cleanAtReset ||
    application.storage.localStorageEntries !== 0 ||
    application.storage.sessionStorageEntries !==
      internalSessionStorageKeys.length ||
    application.storage.sessionStorageKeysDigest !==
      internalSessionStorageKeysDigest ||
    application.storage.indexedDbDatabases !== 0 ||
    application.storage.cacheStorageEntries !== 0 ||
    !sameCanonicalJson(
      application.rendering.viewport,
      lease.plan.cell.viewport
    ) ||
    application.rendering.devicePixelRatio !==
      lease.plan.rendering.devicePixelRatio ||
    application.rendering.colorScheme !== lease.plan.cell.colorScheme ||
    application.rendering.motion !== lease.plan.cell.motion ||
    application.rendering.locale !== lease.plan.cell.locale ||
    application.rendering.timezone !== lease.plan.timezone ||
    !application.rendering.fontReady ||
    application.rendering.animationPolicy !== 'no-active-authored-animations' ||
    application.rendering.animationClock !==
      lease.plan.rendering.animationClock ||
    application.rendering.observedAnimationTimeMs !==
      liveWitness.schedulerLogicalTime ||
    !Number.isFinite(application.rendering.nativeTiming.timeOrigin) ||
    application.rendering.nativeTiming.timeOrigin <= 0 ||
    !Number.isFinite(application.rendering.nativeTiming.performanceNowDelta) ||
    application.rendering.nativeTiming.performanceNowDelta < 0 ||
    !Number.isFinite(
      application.rendering.nativeTiming.animationFrameTimestamp
    ) ||
    application.rendering.nativeTiming.animationFrameTimestamp < 0 ||
    !sameCanonicalJson(settle.conditions, lease.plan.settle.conditions) ||
    settle.maximumFrames !== lease.plan.settle.maximumFrames ||
    settle.observedFrames < 1 ||
    settle.observedFrames > settle.maximumFrames ||
    !settle.fontReady ||
    settle.activeAnimations !== 0 ||
    settle.pendingTimers !== 0 ||
    settle.pendingStreams !== 0 ||
    settle.activeWorkers !== 0 ||
    settle.authoredAnimationCreationCount !== 0 ||
    settle.authorAnimationFrameCreationCount !== 0 ||
    settle.cryptoRandomCreationCount !== 0 ||
    settle.animationClockSyncCount !== scheduler.completedOperationCount ||
    settle.nativeTimerCreationCount !== 0 ||
    settle.streamCreationCount !== expectedAuthorRequestCount ||
    settle.workerCreationCount !== 0 ||
    settle.deniedWorkerCreations !== 0 ||
    application.serviceWorker.mode !== lease.plan.serviceWorker.mode ||
    application.serviceWorker.registrations !== 0
  ) {
    throw new TypeError(
      'Browser runtime control observation drifted from its exact Plan or live witness.'
    );
  }
  assertDigest(
    application.network.observedRequestLedgerDigest,
    'Observed request ledger'
  );
  assertDigest(
    application.network.proxyEndpointDigest,
    'Trusted deny proxy endpoint'
  );
  assertDigest(
    application.network.proxyAttemptLedgerDigest,
    'Trusted deny proxy attempt ledger'
  );
  assertDigest(
    application.network.fixtureDispatchLedgerDigest,
    'Core fixture dispatch ledger'
  );
  assertDigest(
    application.network.fixtureConsumptionLedgerDigest,
    'Browser fixture consumption ledger'
  );
  if (application.network.fixtureResponseDigest !== null) {
    assertDigest(
      application.network.fixtureResponseDigest,
      'Browser fixture response'
    );
  }
  if (application.network.fixtureResolutionDigest !== null) {
    assertDigest(
      application.network.fixtureResolutionDigest,
      'Browser fixture resolution'
    );
  }
  assertDigest(scheduler.snapshotDigest, 'Scheduler snapshot');
};

export const createBrowserRuntimeControlAttestation = (
  input: Readonly<{
    lease: BrowserRuntimeControlLease;
    phase: BrowserRuntimeControlAttestationPhase;
    providerId: string;
    namespace: string;
    capabilitySnapshotDigest: string;
    application: BrowserRuntimeControlApplication;
  }>
): BrowserRuntimeControlAttestation => {
  if (
    input.lease.expectedControlDigest !== input.lease.plan.controlDigest ||
    input.capabilitySnapshotDigest !==
      input.lease.expectedCapabilitySnapshot.snapshotDigest
  ) {
    throw new TypeError(
      'Browser runtime control Plan or capability snapshot drifted.'
    );
  }
  validateApplication(
    input.application,
    input.lease,
    input.namespace,
    input.phase
  );
  const applicationDigest = digestVerificationValue(input.application);
  const identity = Object.freeze({
    format: BROWSER_RUNTIME_CONTROL_ATTESTATION_FORMAT,
    version: BROWSER_RUNTIME_CONTROL_ATTESTATION_VERSION,
    phase: input.phase,
    leaseId: input.lease.leaseId,
    attemptId: input.lease.attemptId,
    generation: input.lease.generation,
    providerKind: input.lease.providerKind,
    providerId: input.providerId,
    targetLeaseBindingDigest: input.lease.targetLeaseBindingDigest,
    originDigest: input.lease.originDigest,
    executableSnapshotDigest: input.lease.executableSnapshotDigest,
    resourceManifestDigest: input.lease.resourceManifest.manifestDigest,
    fixtureBindingDigest: input.lease.fixtureBinding.bindingDigest,
    ...(input.lease.remoteBinding
      ? { remoteBindingDigest: input.lease.remoteBinding.bindingDigest }
      : {}),
    namespace: input.namespace,
    controlDigest: input.lease.plan.controlDigest,
    capabilitySnapshotDigest: input.capabilitySnapshotDigest,
    application: input.application,
    applicationDigest,
  });
  return Object.freeze({
    ...identity,
    attestationDigest: digestVerificationValue(identity),
  });
};

export const assertBrowserRuntimeControlAttestation = (
  value: BrowserRuntimeControlAttestation,
  lease: BrowserRuntimeControlLease
): BrowserRuntimeControlAttestation => {
  const { attestationDigest, ...identity } = value;
  validateApplication(value.application, lease, value.namespace, value.phase);
  if (
    value.format !== BROWSER_RUNTIME_CONTROL_ATTESTATION_FORMAT ||
    value.version !== BROWSER_RUNTIME_CONTROL_ATTESTATION_VERSION ||
    (value.phase !== 'initial' && value.phase !== 'terminal') ||
    value.leaseId !== lease.leaseId ||
    value.attemptId !== lease.attemptId ||
    value.generation !== lease.generation ||
    value.providerKind !== lease.providerKind ||
    value.providerId !== lease.expectedCapabilitySnapshot.providerId ||
    value.targetLeaseBindingDigest !== lease.targetLeaseBindingDigest ||
    value.originDigest !== lease.originDigest ||
    value.executableSnapshotDigest !== lease.executableSnapshotDigest ||
    value.resourceManifestDigest !== lease.resourceManifest.manifestDigest ||
    value.fixtureBindingDigest !== lease.fixtureBinding.bindingDigest ||
    value.remoteBindingDigest !== lease.remoteBinding?.bindingDigest ||
    value.controlDigest !== lease.expectedControlDigest ||
    value.capabilitySnapshotDigest !==
      lease.expectedCapabilitySnapshot.snapshotDigest ||
    value.applicationDigest !== digestVerificationValue(value.application) ||
    attestationDigest !== digestVerificationValue(identity)
  ) {
    throw new TypeError(
      'Browser runtime control attestation identity or digest drifted.'
    );
  }
  return value;
};

export const dirtyBrowserRuntimeControlResidual = (
  field: keyof DeterministicIsolationResidual
): DeterministicIsolationResidual =>
  Object.freeze({
    storage: field === 'storage' ? 1 : 0,
    cookies: field === 'cookies' ? 1 : 0,
    indexedDb: field === 'indexedDb' ? 1 : 0,
    cacheStorage: field === 'cacheStorage' ? 1 : 0,
    serviceWorkers: field === 'serviceWorkers' ? 1 : 0,
    workers: field === 'workers' ? 1 : 0,
    streams: field === 'streams' ? 1 : 0,
    timers: field === 'timers' ? 1 : 0,
    effects: field === 'effects' ? 1 : 0,
    authSessions: field === 'authSessions' ? 1 : 0,
  });
