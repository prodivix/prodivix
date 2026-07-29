import { createServer } from 'node:http';
import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  issueCompilerFixtureProjectionReceipt,
} from '@prodivix/prodivix-compiler';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  projectExecutableProjectRuntimeFiles,
  type DeterministicFixtureNetworkEvent,
  type DeterministicIsolationResidual,
  type DeterministicRuntimeSession,
  type ExecutionAuthSessionFixtureResponse,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
  createBrowserRuntimeControlUuid,
  createBrowserVerificationTargetBinding,
  digestBrowserVerificationBytes,
  dirtyBrowserRuntimeControlResidual,
  type BrowserRuntimeControlApplication,
  type BrowserRuntimeControlFixtureRequest,
  type BrowserRuntimeControlHost,
  type BrowserRuntimeControlLease,
  type BrowserVerificationTargetLease,
} from '@prodivix/verification-browser';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import { createGoldenG3V6ExecutableSnapshot } from './goldenG3V6ExecutableSnapshot';
import { createGoldenG3V6BrowserRuntimeIdentity } from './goldenG3V6BrowserIdentityFixture';
import {
  GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT,
  type GoldenG3V6ControlledProviderKind,
  type GoldenG3V6RuntimeControlRegistrationInput,
  type GoldenG3V6RuntimeControlRegistry,
} from './goldenG3V6RuntimeControlEvidence';
import {
  digestGoldenG3V6RemotePreviewBytes,
  encodeGoldenG3V6RemotePreviewBundle,
} from './goldenG3V6RemotePreviewBundle';
import type { GoldenG3V6RemotePreviewEvidence } from './goldenG3V6RemotePreviewHarness';
import {
  createGoldenG3CatalogProgram,
  createGoldenG3V6ReactCatalogSnapshot,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
} from './goldenG3ScenarioFixture';

export const GOLDEN_G3_V6_TEST_SIGNAL: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

export const goldenG3V6AbortedTestSignal = (): VerificationAbortSignal =>
  Object.freeze({
    aborted: true,
    subscribe: () => () => undefined,
  });

const browserCell = (
  providerKind: GoldenG3V6ControlledProviderKind
): VerificationPlanCell => {
  const planned = createGoldenG3V6Plan();
  if (planned.status !== 'ready') {
    throw new Error('Golden V6 test Plan is not ready.');
  }
  const surface =
    providerKind === 'browser' || providerKind === 'remote'
      ? 'preview'
      : providerKind;
  const cell = planned.plan.cells.find(
    (candidate) =>
      candidate.requirement === 'required' &&
      candidate.frameworkTarget === 'react-vite' &&
      candidate.surface === surface &&
      candidate.browserEngine === 'chromium' &&
      candidate.checkKind === 'e2e' &&
      candidate.motion === 'full'
  );
  if (!cell) {
    throw new Error(
      `Golden V6 test cannot find a ${providerKind} browser cell.`
    );
  }
  return cell;
};

const startResourceServer = async (
  resources: ReadonlyMap<string, Uint8Array>,
  options: Readonly<{
    driftControlHost?: boolean;
    redirectEntry?: boolean;
  }> = {}
): Promise<Readonly<{ origin: string; close(): Promise<void> }>> => {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (options.redirectEntry && requestUrl.pathname === '/') {
      response.writeHead(302, { location: '/index.html' });
      response.end();
      return;
    }
    const path =
      requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const contents =
      path === '/__prodivix-golden-host.html'
        ? new TextEncoder().encode(
            options.driftControlHost
              ? `${GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT} `
              : GOLDEN_G3_V6_RUNTIME_CONTROL_HOST_DOCUMENT
          )
        : resources.get(path);
    if (!contents) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': String(contents.byteLength),
      'content-type': path.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/javascript; charset=utf-8',
    });
    response.end(contents);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Golden V6 test resource server has no TCP address.');
  }
  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.closeAllConnections();
        server.close((error) =>
          error ? rejectPromise(error) : resolvePromise()
        );
      }),
  });
};

const remoteEvidence = (
  input: GoldenG3V6RuntimeControlRegistrationInput
): GoldenG3V6RemotePreviewEvidence => {
  const bytes = encodeGoldenG3V6RemotePreviewBundle(
    input.snapshot,
    input.buildBundle
  );
  const artifactDigest = digestGoldenG3V6RemotePreviewBytes(bytes);
  const entry = input.buildBundle.files.find(
    ({ path }) => path === input.snapshot.previewPlan.entryFilePath
  )!;
  return Object.freeze({
    attemptId: input.attemptId,
    requestId: `request:${input.attemptId}`,
    executionId: `execution:${input.attemptId}`,
    providerId: 'test.remote-preview',
    workerId: `worker:${input.attemptId}`,
    workerAttempt: 1,
    snapshotId: input.snapshot.workspace.snapshotId,
    snapshotDigest: input.snapshot.contentDigest,
    snapshotUploadVerified: true,
    resumeCheckpoint: Object.freeze({
      confirmedAfterCursor: 2,
      generation: 1,
    }),
    terminalCheckpoint: Object.freeze({
      confirmedAfterCursor: 5,
      generation: 2,
    }),
    terminalStatus: 'succeeded',
    readiness: 'ready',
    health: 'healthy',
    artifactId: `artifact:${input.attemptId}`,
    artifactDigest,
    artifactSize: bytes.byteLength,
    materializedBundleDigest: artifactDigest,
    materializedOrigin: input.targetLease.origin,
    materializedEntryUrl: new URL(
      input.snapshot.previewPlan.entryFilePath,
      `${input.targetLease.origin}/`
    ).href,
    materializedEntryFilePath: input.snapshot.previewPlan.entryFilePath,
    materializedEntryDigest: entry.digest,
    materializedFileCount: input.buildBundle.files.length,
  });
};

export type GoldenG3V6RuntimeControlTestFixture = Readonly<{
  input: GoldenG3V6RuntimeControlRegistrationInput;
  close(): Promise<void>;
}>;

export const createGoldenG3V6RuntimeControlTestFixture = async (
  providerKind: GoldenG3V6ControlledProviderKind,
  serverOptions: Readonly<{
    driftControlHost?: boolean;
    redirectEntry?: boolean;
  }> = {}
): Promise<GoldenG3V6RuntimeControlTestFixture> => {
  const cell = browserCell(providerKind);
  const snapshot = createGoldenG3V6ExecutableSnapshot(
    createGoldenG3V6ReactCatalogSnapshot()
  );
  const entryBytes = new TextEncoder().encode(
    '<!doctype html><html><body><main>Golden</main></body></html>'
  );
  const scriptBytes = new TextEncoder().encode('globalThis.golden = true;');
  const projectionSource = snapshot.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  if (!projectionSource) {
    throw new Error(
      'Golden V6 runtime control test snapshot has no Compiler fixture projection.'
    );
  }
  const projectionBytes =
    typeof projectionSource.contents === 'string'
      ? new TextEncoder().encode(projectionSource.contents)
      : new Uint8Array(projectionSource.contents);
  const buildBundle: ExecutionBuildBundle = Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze([
      Object.freeze({
        path: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
        size: projectionBytes.byteLength,
        digest: digestBrowserVerificationBytes(projectionBytes),
        contents: projectionBytes,
      }),
      Object.freeze({
        path: 'assets/app.js',
        size: scriptBytes.byteLength,
        digest: digestBrowserVerificationBytes(scriptBytes),
        contents: scriptBytes,
      }),
      Object.freeze({
        path: snapshot.previewPlan.entryFilePath,
        size: entryBytes.byteLength,
        digest: digestBrowserVerificationBytes(entryBytes),
        contents: entryBytes,
      }),
    ]),
  });
  const server = await startResourceServer(
    new Map<string, Uint8Array>([
      ['/assets/app.js', scriptBytes],
      [`/${COMPILER_FIXTURE_PROJECTION_BUILD_PATH}`, projectionBytes],
      [`/${snapshot.previewPlan.entryFilePath}`, entryBytes],
    ]),
    serverOptions
  );
  const attemptId = `attempt:g3-v6-runtime-control:${providerKind}`;
  const binding = createBrowserVerificationTargetBinding({
    origin: server.origin,
    attemptId,
    generation: 1,
    executableSnapshotDigest: snapshot.contentDigest,
    cell,
    runtimeIdentity: createGoldenG3V6BrowserRuntimeIdentity(cell),
  });
  const targetLease: BrowserVerificationTargetLease = Object.freeze({
    leaseId: `target-lease:${providerKind}`,
    origin: server.origin,
    binding: binding.binding,
    bindingDigest: binding.bindingDigest,
    runtimeIdentity: createGoldenG3V6BrowserRuntimeIdentity(cell),
  });
  const base: GoldenG3V6RuntimeControlRegistrationInput = Object.freeze({
    cell,
    providerKind,
    attemptId,
    generation: 1,
    program: createGoldenG3CatalogProgram(snapshot.contentDigest),
    targetLease,
    snapshot,
    buildBundle,
    fixtureProjectionReceipt: issueCompilerFixtureProjectionReceipt({
      snapshot,
      fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
      controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
      generatedFiles: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
      buildBundle,
    }),
  });
  return Object.freeze({
    input:
      providerKind === 'remote'
        ? Object.freeze({
            ...base,
            remoteEvidence: remoteEvidence(base),
          })
        : base,
    close: server.close,
  });
};

const SESSION_STORAGE_KEYS = Object.freeze([
  '__prodivix_executable_snapshot__',
  '__prodivix_fixture_binding__',
  '__prodivix_runtime_cursor_seal__',
  '__prodivix_verification_namespace__',
]);

export const createGoldenG3V6RuntimeFixtureTestRequest = (
  lease: BrowserRuntimeControlLease,
  overrides: Partial<BrowserRuntimeControlFixtureRequest> = {}
): BrowserRuntimeControlFixtureRequest =>
  Object.freeze({
    method: 'GET',
    url: new URL(
      EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
      `${new URL(lease.controlHostUrl).origin}/`
    ).href,
    invocationId: createBrowserRuntimeControlUuid(
      `test-fixture:${lease.attemptId}`
    ),
    attempt: lease.plan.network.fixtures[0]?.attempt ?? 1,
    ...overrides,
  });

export const createGoldenG3V6RuntimeControlTestHost = (
  lease: BrowserRuntimeControlLease,
  options: Readonly<{
    applyDigestDrift?: boolean;
    cleanupResidualField?: keyof DeterministicIsolationResidual;
    skipRuntimeFixtureConsumption?: boolean;
  }> = {}
): BrowserRuntimeControlHost => {
  let namespace = '';
  let cleaned = false;
  let operationScheduled = false;
  let fixtureResolution:
    | Readonly<{
        request: BrowserRuntimeControlFixtureRequest;
        dispatchEvent: DeterministicFixtureNetworkEvent;
        response: ExecutionAuthSessionFixtureResponse;
        responseDigest: string;
        resolutionDigest: string;
      }>
    | undefined;
  return Object.freeze({
    reset(request) {
      namespace = request.namespace;
      cleaned = false;
    },
    apply(request) {
      return Object.freeze({
        appliedControlDigest: options.applyDigestDrift
          ? digestVerificationValue('drift')
          : request.expectedControlDigest,
        fontReady: true,
      });
    },
    probe({ phase }) {
      if (phase === 'after-cleanup' && options.cleanupResidualField) {
        return dirtyBrowserRuntimeControlResidual(options.cleanupResidualField);
      }
      return Object.freeze({
        storage: 0,
        cookies: 0,
        indexedDb: 0,
        cacheStorage: 0,
        serviceWorkers: 0,
        workers: 0,
        streams: 0,
        timers: 0,
        effects: cleaned || phase === 'after-reset' ? 0 : 1,
        authSessions: 0,
      });
    },
    cleanup() {
      cleaned = true;
    },
    async observe(
      session: DeterministicRuntimeSession,
      phase
    ): Promise<BrowserRuntimeControlApplication> {
      if (
        lease.fixtureBinding.expectedRuntimeDispatchCount === 1 &&
        !fixtureResolution &&
        !options.skipRuntimeFixtureConsumption
      ) {
        if (!lease.resolveRuntimeFixture) {
          throw new Error(
            'Golden V6 test host requires a runtime fixture resolver.'
          );
        }
        const request = createGoldenG3V6RuntimeFixtureTestRequest(lease);
        const response = await lease.resolveRuntimeFixture(request);
        const events = session.network.events();
        const dispatchEvent = events[0];
        if (!dispatchEvent || events.length !== 1) {
          throw new Error(
            'Golden V6 test host did not observe one Core fixture event.'
          );
        }
        const responseDigest = digestBrowserVerificationBytes(
          new TextEncoder().encode(canonicalJsonText(response))
        );
        const resolutionIdentity = Object.freeze({
          request,
          dispatchEvent,
          response,
          responseDigest,
        });
        fixtureResolution = Object.freeze({
          ...resolutionIdentity,
          resolutionDigest: digestVerificationValue(resolutionIdentity),
        });
      }
      if (!operationScheduled) {
        operationScheduled = true;
        session.scheduler.enqueue({
          id: `operation:${lease.attemptId}`,
          lane: 'browser-operation',
          readyAt: session.clock.now(),
          run: () => undefined,
        });
        await session.scheduler.runUntilIdle();
      }
      const witness = lease.expectedWitness();
      const live = lease.liveWitness();
      const fixtureDispatchLedger = session.network.events();
      return Object.freeze({
        clock: Object.freeze({
          epoch: lease.plan.clock.epoch,
          observedEpochMs: Date.parse(lease.plan.clock.epoch),
        }),
        random: Object.freeze({
          algorithm: lease.plan.random.algorithm,
          expectedSample: witness.randomSample,
          observedSample: witness.randomSample,
        }),
        identifiers: Object.freeze({
          namespaces: lease.plan.identifiers.namespaces,
          expectedSamples: witness.identifierSamples,
          observedSamples: witness.identifierSamples,
          expectedOperationUuid: witness.operationUuid,
          observedOperationUuid: witness.operationUuid,
        }),
        consumption: Object.freeze({
          documentInitializationCount: 1,
          randomSampleCount: 1,
          identifierSampleCounts: Object.freeze({
            attempt: 1,
            step: 1,
            action: 1,
            operation: 1,
          }),
          witnessCaptured: true,
          ledgerDigest: digestVerificationValue({
            documentInitializationCount: 1,
            randomSampleCount: 1,
            identifierSampleCounts: Object.freeze({
              attempt: 1,
              step: 1,
              action: 1,
              operation: 1,
            }),
            witnessCaptured: true,
          }),
        }),
        scheduler: Object.freeze({
          maximumConcurrency: lease.plan.scheduler.maximumConcurrency,
          lane: 'browser-operation',
          status: live.schedulerStatus,
          turns: live.schedulerTurns,
          pendingTaskCount: live.schedulerPendingTaskCount,
          pendingBarrierCount: live.schedulerPendingBarrierCount,
          droppedEventCount: live.schedulerDroppedEventCount,
          completedOperationCount: live.schedulerCompletedOperationCount,
          snapshotDigest: live.schedulerSnapshotDigest,
        }),
        network: Object.freeze({
          mode: lease.plan.network.mode,
          undeclaredRequest: 'reject',
          egressPolicy: 'exact-loopback-origin-only',
          sandboxProfileDigest: BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
          proxyEndpointDigest: digestVerificationValue({
            owner: 'golden-g3-v6-test-host',
            attemptId: lease.attemptId,
          }),
          proxyConnectionAttemptCount: 0,
          proxyActiveConnectionCount: 0,
          proxyConnectAttemptCount: 0,
          proxyHttpRequestAttemptCount: 0,
          proxyUnknownAttemptCount: 0,
          proxyFaultCount: 0,
          proxyAttemptLedgerDigest: digestVerificationValue([]),
          allowedOriginDigest: lease.originDigest,
          resourceManifestDigest: lease.resourceManifest.manifestDigest,
          observedRequestLedgerDigest: digestVerificationValue({
            phase,
            resources: lease.resourceManifest.resources,
          }),
          observedResponseCount: lease.resourceManifest.resources.length,
          observedAuthorRequestCount: fixtureResolution ? 1 : 0,
          authorRequestCreationCount: fixtureResolution ? 1 : 0,
          deniedRequestCount: 0,
          activeRequestCount: 0,
          fixtureBindingDigest: lease.fixtureBinding.bindingDigest,
          fixtureRequestCount: fixtureResolution ? 1 : 0,
          fixtureDispatchCount: live.fixtureDispatchCount,
          fixtureResponseCount: fixtureResolution ? 1 : 0,
          fixtureDispatchLedgerDigest: digestVerificationValue(
            fixtureDispatchLedger
          ),
          fixtureResponseDigest: fixtureResolution?.responseDigest ?? null,
          fixtureResolutionDigest: fixtureResolution?.resolutionDigest ?? null,
          fixtureConsumptionLedgerDigest: digestVerificationValue(
            fixtureResolution ? [fixtureResolution] : []
          ),
        }),
        storage: Object.freeze({
          namespace,
          executableSnapshotDigest: lease.executableSnapshotDigest,
          bootstrapFixtureDigest: lease.fixtureBinding.storageBootstrapDigest,
          cleanAtReset: true,
          localStorageEntries: 0,
          sessionStorageEntries: SESSION_STORAGE_KEYS.length,
          sessionStorageKeysDigest:
            digestVerificationValue(SESSION_STORAGE_KEYS),
          indexedDbDatabases: 0,
          cacheStorageEntries: 0,
        }),
        rendering: Object.freeze({
          viewport: lease.plan.cell.viewport,
          devicePixelRatio: lease.plan.rendering.devicePixelRatio,
          colorScheme: lease.plan.cell.colorScheme,
          motion: lease.plan.cell.motion,
          locale: lease.plan.cell.locale,
          timezone: lease.plan.timezone,
          fontReady: true,
          animationPolicy: 'no-active-authored-animations',
          animationClock: lease.plan.rendering.animationClock,
          observedAnimationTimeMs: live.schedulerLogicalTime,
          nativeTiming: Object.freeze({
            timeOrigin: 1,
            performanceNowDelta: phase === 'initial' ? 1 : 2,
            animationFrameTimestamp: phase === 'initial' ? 16 : 32,
          }),
          settle: Object.freeze({
            conditions: lease.plan.settle.conditions,
            maximumFrames: lease.plan.settle.maximumFrames,
            observedFrames: 1,
            fontReady: true,
            activeAnimations: 0,
            pendingTimers: 0,
            pendingStreams: 0,
            activeWorkers: 0,
            authoredAnimationCreationCount: 0,
            authorAnimationFrameCreationCount: 0,
            cryptoRandomCreationCount: 0,
            animationClockSyncCount: live.schedulerCompletedOperationCount,
            nativeTimerCreationCount: 0,
            streamCreationCount: fixtureResolution ? 1 : 0,
            workerCreationCount: 0,
            deniedWorkerCreations: 0,
          }),
        }),
        serviceWorker: Object.freeze({
          mode: lease.plan.serviceWorker.mode,
          registrations: 0,
        }),
      });
    },
  });
};

export const acquireGoldenG3V6RuntimeControlTestLease = async (
  registry: GoldenG3V6RuntimeControlRegistry,
  fixture: GoldenG3V6RuntimeControlTestFixture
): Promise<
  Readonly<{
    lease: BrowserRuntimeControlLease;
    registration: Awaited<ReturnType<typeof registry.register>>;
  }>
> => {
  const registration = await registry.register(fixture.input);
  const lease = await registry.port.acquire(
    {
      cell: fixture.input.cell,
      targetLease: fixture.input.targetLease,
      attemptId: fixture.input.attemptId,
      generation: fixture.input.generation,
      providerKind: fixture.input.providerKind,
      executableSnapshotDigest: fixture.input.snapshot.contentDigest,
      expectedControlDigest: registration.expectation.expectedControlDigest,
      expectedCapabilitySnapshotDigest:
        registration.expectation.controlCapabilitySnapshotDigest,
      expectedControlCapabilityIds:
        registration.expectation.controlCapabilityIds,
    },
    GOLDEN_G3_V6_TEST_SIGNAL
  );
  return Object.freeze({ lease, registration });
};
