import { describe, expect, it } from 'vitest';
import {
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  DETERMINISTIC_RUNTIME_CONTROL_IDS,
  type DeterministicRuntimeControlPlan,
} from '@prodivix/runtime-core';
import {
  createVerificationAdapterInputDigest,
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  type PreparedVerificationInvocation,
  type VerificationAbortSignal,
  type VerificationAdapterContext,
  type VerificationAdapterInputRef,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  type BrowserVerificationRuntimeIdentity,
} from './browserAdapter.types';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION } from './browserVerificationAdapterDescriptor';
import {
  createBrowserVerificationProfileInputRef,
  digestBrowserVerificationBytes,
} from './browserVerificationCellInput';
import { createBrowserRuntimeFixtureConsumptionBindingDigest } from './browserBehaviorAssertionReceipt';
import { createFirstPartyBrowserVerificationAdapterFactoryInternal } from './firstPartyBrowserVerificationAdapter';
import { createBrowserScenarioProgramInputRef } from './browserVerificationInputMaterial';
import {
  BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
  createBrowserRuntimeControlAttestation,
  createBrowserRuntimeControlFixtureBinding,
  createBrowserRuntimeControlResourceManifest,
  createBrowserRuntimeControlUuid,
  type BrowserRuntimeControlApplication,
  type BrowserRuntimeControlAttestation,
  type BrowserRuntimeControlLease,
  type BrowserRuntimeControlLiveWitness,
} from './browserRuntimeControlPort';
import type {
  BrowserToolPool,
  BrowserToolSession,
} from './browserVerificationPort';
import { createBrowserVerificationTargetBinding } from './browserRuntimeIdentity';

const sha = (value: unknown): string => digestVerificationValue(value);

const signal: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

const programFor = (
  executableSnapshotDigest: string,
  fixtureDigest: string
): BehaviorScenarioProgram => {
  const withoutDigest = {
    scenarioId: 'scenario:catalog',
    scenarioDigest: sha('scenario'),
    workspaceRevision: 7,
    semanticSnapshotDigest: sha('semantic'),
    executableSnapshotDigest,
    compilerDigest: sha('compiler'),
    registryDigest: sha('registry'),
    controlProfileDigest: sha('control-profile'),
    fixtureSetDigests: Object.freeze([fixtureDigest]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([]),
    capabilityManifest: Object.freeze([]),
    targetManifest: Object.freeze([
      Object.freeze({
        targetId: 'target:catalog',
        semanticSymbolId: 'symbol:catalog',
        capability: 'behavior:pir:visible',
        source: Object.freeze({
          workspaceDocumentId: 'document:catalog',
          path: '/nodesById/catalog-root',
        }),
      }),
    ]),
    instructions: Object.freeze([]),
    observations: Object.freeze([]),
    sourceTrace: Object.freeze([]),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 1_000,
    }),
  };
  return Object.freeze({
    ...withoutDigest,
    programDigest: digestBehaviorValue(withoutDigest),
  });
};

const runtimeIdentity = (): BrowserVerificationRuntimeIdentity =>
  Object.freeze({
    machineClass: 'golden-ci',
    operatingSystemImageDigest: sha('os-image'),
    browserImageDigest: sha('browser-image'),
    browserEngine: 'chromium',
    browserVersion: '140.0.0',
    fontSetDigest: sha('font-set'),
    viewport: Object.freeze({
      widthCssPixels: 1280,
      heightCssPixels: 720,
      devicePixelRatio: 1,
    }),
    colorScheme: 'light',
    motionPreference: 'reduced',
    locale: 'en-US',
    cacheClass: 'cold',
    rendererGeneration: 'renderer:v1',
    normalizer: Object.freeze({ id: 'pdx-rgba', version: '1' }),
  });

const cellFor = (
  executableSnapshotDigest: string,
  fixtureDigest: string
): VerificationPlanCell =>
  Object.freeze({
    id: 'cell:e2e:catalog',
    checkId: 'check:e2e:catalog',
    checkKind: 'e2e',
    scenarioId: 'scenario:catalog',
    targetId: 'target:catalog',
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: sha('policy'),
      semanticTargetId: 'target:catalog',
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'ci',
    browserEngine: 'chromium',
    viewport: Object.freeze({
      id: 'desktop',
      width: 1280,
      height: 720,
    }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: 'deterministic',
      digest: sha('control-profile'),
    }),
    fixtureSetRef: Object.freeze({
      documentId: 'fixture:catalog',
      digest: fixtureDigest,
    }),
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule:browser']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:none',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['ci-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze([
        'console-summary',
        'network-summary',
        'replay-record',
        'trace',
      ] as const),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ] as const),
    estimatedCost: Object.freeze({
      durationMs: 1_000,
      artifactBytes: 64_000,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: sha({
      executableSnapshotDigest,
      fixtureDigest,
    }),
  });

type Harness = Readonly<{
  factory: ReturnType<
    typeof createFirstPartyBrowserVerificationAdapterFactoryInternal
  >;
  adapter: ReturnType<
    ReturnType<typeof createFirstPartyBrowserVerificationAdapterFactoryInternal>
  >;
  cell: VerificationPlanCell;
  context: VerificationAdapterContext;
  prepareInput: Parameters<
    ReturnType<
      ReturnType<
        typeof createFirstPartyBrowserVerificationAdapterFactoryInternal
      >
    >['prepare']
  >[0];
  readIds: string[];
  sessionClosed: () => number;
  leaseReleased: () => number;
  runtimeControlReleased: () => number;
  runtimeControlReleaseAttestations: () => readonly (
    BrowserRuntimeControlAttestation | undefined
  )[];
  terminalRuntimeFixtureBindingDigest: () => string;
}>;

const harness = (
  overrides: Readonly<{
    observedRuntimeIdentity?: BrowserVerificationRuntimeIdentity;
    leaseGeneration?: number;
    tamperScenarioBytes?: boolean;
  }> = {}
): Harness => {
  const executableBytes = new TextEncoder().encode('executable snapshot');
  const executableSnapshotDigest =
    digestBrowserVerificationBytes(executableBytes);
  const fixtureDigest = sha('fixture');
  const program = programFor(executableSnapshotDigest, fixtureDigest);
  const cell = cellFor(executableSnapshotDigest, fixtureDigest);
  const identity = runtimeIdentity();
  const origin = 'https://verification.invalid';
  const attestation = createBrowserVerificationTargetBinding({
    origin,
    attemptId: 'attempt:1',
    generation: overrides.leaseGeneration ?? 1,
    executableSnapshotDigest,
    cell,
    runtimeIdentity: identity,
  });
  const profileInput = createBrowserVerificationProfileInputRef(
    'input:profile',
    Object.freeze({
      format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
      version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
      cellId: cell.id,
      checkKind: 'e2e',
      scenarioId: program.scenarioId,
      targetId: cell.targetId,
      frameworkTarget: cell.frameworkTarget,
      surface: cell.surface,
      browserEngine: 'chromium',
      viewport: Object.freeze({
        width: cell.viewport.width,
        height: cell.viewport.height,
      }),
      colorScheme: cell.colorScheme,
      motion: cell.motion,
      locale: cell.locale,
      executableSnapshotDigest,
      scenarioProgramDigest: program.programDigest,
      controlProfileDigest: cell.controlProfileRef.digest!,
      fixtureSetDigests: Object.freeze([fixtureDigest]),
      targetLeaseBindingDigest: attestation.bindingDigest,
      profile: Object.freeze({
        kind: 'e2e',
        scenarioId: program.scenarioId,
        programDigest: program.programDigest,
      }),
    })
  );
  const programInput = createBrowserScenarioProgramInputRef(
    'input:program',
    program
  );
  const executableRef: VerificationAdapterInputRef = Object.freeze({
    id: 'input:executable',
    kind: 'executable-snapshot',
    digest: executableSnapshotDigest,
    size: executableBytes.byteLength,
    mediaType: 'application/octet-stream',
  });
  const refs = Object.freeze([
    executableRef,
    programInput.ref,
    profileInput.ref,
  ]);
  const byId = new Map<string, Uint8Array>([
    [executableRef.id, executableBytes],
    [
      programInput.ref.id,
      overrides.tamperScenarioBytes
        ? new TextEncoder().encode('tampered')
        : programInput.bytes,
    ],
    [profileInput.ref.id, profileInput.bytes],
  ]);
  const registry = createVerificationAdapterRegistrySnapshot([
    FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  ]);
  const runtimeEnvironmentDigest = attestation.runtimeEnvironmentDigest;
  const controlCapabilitySnapshotDigest = sha('control-capabilities');
  const appliedControlDigest = sha('applied-controls');
  const controlPlan: DeterministicRuntimeControlPlan = Object.freeze({
    profileId: 'profile:test',
    profileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze([fixtureDigest]),
    clock: Object.freeze({
      epoch: '2025-01-01T00:00:00.000Z',
      tickMs: 1,
      maximumVirtualDurationMs: 30_000,
    }),
    timezone: 'UTC',
    random: Object.freeze({
      algorithm: 'xoshiro256ss',
      seed: 'browser-test-random',
    }),
    identifiers: Object.freeze({
      seed: 'browser-test-identifiers',
      namespaces: Object.freeze([
        'attempt',
        'step',
        'action',
        'operation',
      ] as const),
    }),
    scheduler: Object.freeze({
      seed: 'browser-test-scheduler',
      maximumTurns: 64,
      maximumConcurrency: 1,
    }),
    network: Object.freeze({
      mode: 'fixture-only',
      undeclaredRequest: 'reject',
      fixtures: Object.freeze([
        Object.freeze({
          id: 'fixture:auth-session',
          target: Object.freeze({
            kind: 'auth-session' as const,
            resourceId: 'provider:test-auth',
          }),
          inputDigest: sha('fixture-auth-input'),
          outcome: Object.freeze({
            kind: 'result' as const,
            value: Object.freeze({
              principalId: 'principal:test-owner',
              permissionIds: Object.freeze(['workspace.owner']),
            }),
          }),
        }),
      ]),
    }),
    storage: Object.freeze({
      bootstrapFixtureIds: Object.freeze([]),
      cleanup: 'required',
    }),
    rendering: Object.freeze({
      devicePixelRatio: identity.viewport.devicePixelRatio,
      animationClock: 'virtual',
      fontReadiness: 'required',
    }),
    serviceWorker: Object.freeze({
      mode: 'disabled',
      cache: 'empty',
    }),
    settle: Object.freeze({
      conditions: Object.freeze([
        'render-stable',
        'declared-effects-complete',
        'font-ready',
      ] as const),
      maximumFrames: 8,
    }),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 1_000,
      networkMs: 1_000,
      animationMs: 1_000,
    }),
    cell: Object.freeze({
      id: `${cell.id}:ci`,
      frameworkTarget: cell.frameworkTarget,
      surface: 'ci',
      browserEngine: 'chromium',
      viewport: cell.viewport,
      colorScheme: cell.colorScheme,
      motion: cell.motion,
      locale: cell.locale,
    }),
    controlDigest: appliedControlDigest,
  });
  const resourceManifest = createBrowserRuntimeControlResourceManifest({
    executableSnapshotDigest,
    resources: Object.freeze([
      Object.freeze({
        url: `${origin}/`,
        kind: 'entry',
        contentDigest: sha('entry'),
      }),
      Object.freeze({
        url: `${origin}/__prodivix-golden-host.html`,
        kind: 'control-host',
        contentDigest: sha('control-host'),
      }),
    ]),
  });
  const fixtureBinding = createBrowserRuntimeControlFixtureBinding({
    plan: controlPlan,
    executableSnapshotDigest,
    projectionAuthorityDigest: sha('projection-authority'),
    expectedRuntimeDispatchCount: 1,
  });
  const expectedWitness = Object.freeze({
    randomSample: 0.25,
    identifierSamples: Object.freeze({
      attempt: 'attempt-witness',
      step: 'step-witness',
      action: 'action-witness',
      operation: 'operation-witness',
    }),
    operationUuid: createBrowserRuntimeControlUuid('operation-witness'),
  });
  let liveWitness: BrowserRuntimeControlLiveWitness = Object.freeze({
    schedulerStatus: 'idle',
    schedulerTurns: 1,
    schedulerLogicalTime: 0,
    schedulerPendingTaskCount: 0,
    schedulerPendingBarrierCount: 0,
    schedulerDroppedEventCount: 0,
    schedulerCompletedOperationCount: 1,
    schedulerSnapshotDigest: sha('scheduler:initial'),
    fixtureDispatchCount: 0,
  });
  const capabilitySnapshot = Object.freeze({
    providerId: 'provider:test-ci',
    providerVersion: '1',
    implementationDigest: sha('runtime-control-implementation'),
    controls: Object.freeze(
      DETERMINISTIC_RUNTIME_CONTROL_IDS.map((controlId) =>
        Object.freeze({
          controlId,
          status: 'supported' as const,
          implementationDigest: sha(`control:${controlId}`),
        })
      )
    ),
    snapshotDigest: controlCapabilitySnapshotDigest,
  });
  const application = (): BrowserRuntimeControlApplication => {
    const fixtureConsumed = liveWitness.fixtureDispatchCount === 1;
    return Object.freeze({
      clock: Object.freeze({
        epoch: controlPlan.clock.epoch,
        observedEpochMs: Date.parse(controlPlan.clock.epoch),
      }),
      random: Object.freeze({
        algorithm: controlPlan.random.algorithm,
        expectedSample: expectedWitness.randomSample,
        observedSample: expectedWitness.randomSample,
      }),
      identifiers: Object.freeze({
        namespaces: controlPlan.identifiers.namespaces,
        expectedSamples: expectedWitness.identifierSamples,
        observedSamples: expectedWitness.identifierSamples,
        expectedOperationUuid: expectedWitness.operationUuid,
        observedOperationUuid: expectedWitness.operationUuid,
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
        ledgerDigest: sha({
          documentInitializationCount: 1,
          randomSampleCount: 1,
          identifierSampleCounts: {
            attempt: 1,
            step: 1,
            action: 1,
            operation: 1,
          },
          witnessCaptured: true,
        }),
      }),
      scheduler: Object.freeze({
        maximumConcurrency: 1,
        lane: 'browser-operation',
        status: liveWitness.schedulerStatus,
        turns: liveWitness.schedulerTurns,
        pendingTaskCount: liveWitness.schedulerPendingTaskCount,
        pendingBarrierCount: liveWitness.schedulerPendingBarrierCount,
        droppedEventCount: liveWitness.schedulerDroppedEventCount,
        completedOperationCount: liveWitness.schedulerCompletedOperationCount,
        snapshotDigest: liveWitness.schedulerSnapshotDigest,
      }),
      network: Object.freeze({
        mode: controlPlan.network.mode,
        undeclaredRequest: 'reject',
        egressPolicy: 'exact-loopback-origin-only',
        sandboxProfileDigest: BROWSER_RUNTIME_NETWORK_SANDBOX_PROFILE_DIGEST,
        proxyEndpointDigest: sha('proxy-endpoint'),
        proxyConnectionAttemptCount: 0,
        proxyActiveConnectionCount: 0,
        proxyConnectAttemptCount: 0,
        proxyHttpRequestAttemptCount: 0,
        proxyUnknownAttemptCount: 0,
        proxyFaultCount: 0,
        proxyAttemptLedgerDigest: digestVerificationValue([]),
        allowedOriginDigest: attestation.binding.originDigest,
        resourceManifestDigest: resourceManifest.manifestDigest,
        observedRequestLedgerDigest: sha('request-ledger'),
        observedResponseCount: 2,
        observedAuthorRequestCount: fixtureConsumed ? 1 : 0,
        authorRequestCreationCount: fixtureConsumed ? 1 : 0,
        deniedRequestCount: 0,
        activeRequestCount: 0,
        fixtureBindingDigest: fixtureBinding.bindingDigest,
        fixtureRequestCount: fixtureConsumed ? 1 : 0,
        fixtureDispatchCount: fixtureConsumed ? 1 : 0,
        fixtureResponseCount: fixtureConsumed ? 1 : 0,
        fixtureDispatchLedgerDigest: fixtureConsumed
          ? sha('fixture-dispatch-ledger')
          : digestVerificationValue([]),
        fixtureResponseDigest: fixtureConsumed ? sha('fixture-response') : null,
        fixtureResolutionDigest: fixtureConsumed
          ? sha('fixture-resolution')
          : null,
        fixtureConsumptionLedgerDigest: fixtureConsumed
          ? sha('fixture-consumption-ledger')
          : digestVerificationValue([]),
      }),
      storage: Object.freeze({
        namespace: 'provider:test-ci:attempt:1',
        executableSnapshotDigest,
        bootstrapFixtureDigest: fixtureBinding.storageBootstrapDigest,
        cleanAtReset: true,
        localStorageEntries: 0,
        sessionStorageEntries: 4,
        sessionStorageKeysDigest: sha([
          '__prodivix_executable_snapshot__',
          '__prodivix_fixture_binding__',
          '__prodivix_runtime_cursor_seal__',
          '__prodivix_verification_namespace__',
        ]),
        indexedDbDatabases: 0,
        cacheStorageEntries: 0,
      }),
      rendering: Object.freeze({
        viewport: controlPlan.cell.viewport,
        devicePixelRatio: controlPlan.rendering.devicePixelRatio,
        colorScheme: controlPlan.cell.colorScheme,
        motion: controlPlan.cell.motion,
        locale: controlPlan.cell.locale,
        timezone: controlPlan.timezone,
        fontReady: true,
        animationPolicy: 'no-active-authored-animations',
        animationClock: 'virtual',
        observedAnimationTimeMs: liveWitness.schedulerLogicalTime,
        nativeTiming: Object.freeze({
          timeOrigin: 1,
          performanceNowDelta: 1,
          animationFrameTimestamp: 1,
        }),
        settle: Object.freeze({
          conditions: controlPlan.settle.conditions,
          maximumFrames: controlPlan.settle.maximumFrames,
          observedFrames: 2,
          fontReady: true,
          activeAnimations: 0,
          pendingTimers: 0,
          pendingStreams: 0,
          activeWorkers: 0,
          authoredAnimationCreationCount: 0,
          authorAnimationFrameCreationCount: 0,
          cryptoRandomCreationCount: 0,
          animationClockSyncCount: liveWitness.schedulerCompletedOperationCount,
          nativeTimerCreationCount: 0,
          streamCreationCount: fixtureConsumed ? 1 : 0,
          workerCreationCount: 0,
          deniedWorkerCreations: 0,
        }),
      }),
      serviceWorker: Object.freeze({
        mode: controlPlan.serviceWorker.mode,
        registrations: 0,
      }),
    });
  };
  const resolvedInputSetDigest = createVerificationAdapterInputDigest({
    runtimeEnvironmentDigest,
    executableSnapshotDigest,
    scenarioProgramDigest: program.programDigest,
    controlProfileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze([fixtureDigest]),
    controlCapabilityIds:
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.descriptor
        .controlCapabilities,
    controlCapabilitySnapshotDigest,
    appliedControlDigest,
    inputRefs: refs,
  });
  const readIds: string[] = [];
  let closed = 0;
  let released = 0;
  let runtimeReleased = 0;
  const runtimeReleaseAttestations: Array<
    BrowserRuntimeControlAttestation | undefined
  > = [];
  let terminalSealed = false;
  let terminalRuntimeControlAttestation:
    BrowserRuntimeControlAttestation | undefined;
  const issuedAttestations = new Set<string>();
  let runtimeLease!: BrowserRuntimeControlLease;
  const issueAttestation = (
    phase: BrowserRuntimeControlAttestation['phase']
  ): BrowserRuntimeControlAttestation => {
    const value = createBrowserRuntimeControlAttestation({
      lease: runtimeLease,
      phase,
      providerId: capabilitySnapshot.providerId,
      namespace: 'provider:test-ci:attempt:1',
      capabilitySnapshotDigest: controlCapabilitySnapshotDigest,
      application: application(),
    });
    issuedAttestations.add(value.attestationDigest);
    return value;
  };
  runtimeLease = Object.freeze({
    leaseId: 'runtime-control:1',
    attemptId: 'attempt:1',
    generation: 1,
    providerKind: 'ci',
    targetLeaseBindingDigest: attestation.bindingDigest,
    originDigest: attestation.binding.originDigest,
    controlHostUrl: `${origin}/__prodivix-golden-host.html`,
    executableSnapshotDigest,
    resourceManifest,
    fixtureBinding,
    plan: controlPlan,
    expectedControlDigest: appliedControlDigest,
    expectedCapabilitySnapshot: capabilitySnapshot,
    controlCapabilityIds: DETERMINISTIC_RUNTIME_CONTROL_IDS,
    start: async () => {
      throw new Error('Injected conformance pool does not start Playwright.');
    },
    expectedWitness: () => expectedWitness,
    liveWitness: () => liveWitness,
    resolveRuntimeFixture: async () => {
      throw new Error(
        'Injected conformance pool does not route runtime fixtures.'
      );
    },
    attest: async (phase) => issueAttestation(phase),
    assertIssued: (value) => {
      if (!issuedAttestations.has(value.attestationDigest)) {
        throw new Error('Runtime control attestation was not issued.');
      }
      return value;
    },
    sealTerminal: (value) => {
      if (
        value.phase !== 'terminal' ||
        !issuedAttestations.has(value.attestationDigest)
      ) {
        throw new Error('Only an issued terminal attestation can seal.');
      }
      terminalSealed = true;
    },
    terminalSealed: () => terminalSealed,
  });
  const initialRuntimeControlAttestation = issueAttestation('initial');
  const session: BrowserToolSession = Object.freeze({
    observedRuntimeIdentity: overrides.observedRuntimeIdentity ?? identity,
    runtimeControlAttestation: initialRuntimeControlAttestation,
    executeBehavior: async () => ({
      format: 'prodivix.playwright-browser-report',
      version: 1,
      tool: {
        name: 'playwright',
        version: '1.61.1',
        schemaDigest: sha('playwright-schema'),
      },
      scenarioId: program.scenarioId,
      complete: true,
      exitCode: 0,
      checks: [
        {
          checkId: 'check:catalog-visible',
          stepId: 'step:catalog-visible',
          targetId: 'target:catalog',
          assertionCode: 'visible',
          status: 'passed',
          blackBox: true,
          durationMs: 1,
          diagnosticCodes: [],
        },
      ],
    }),
    scanAccessibility: async () => {
      throw new Error('not used');
    },
    executeKeyboardFocusJourney: async () => {
      throw new Error('not used');
    },
    captureVisual: async () => {
      throw new Error('not used');
    },
    collectPerformance: async () => {
      throw new Error('not used');
    },
    collectSecurity: async () => {
      throw new Error('not used');
    },
    collectNetworkSummary: async () => Object.freeze([]),
    collectConsoleSummary: async () => Object.freeze([]),
    finalizeRuntimeControls: async () => {
      liveWitness = Object.freeze({
        ...liveWitness,
        schedulerTurns: 2,
        schedulerCompletedOperationCount: 2,
        schedulerSnapshotDigest: sha('scheduler:terminal'),
        fixtureDispatchCount: 1,
      });
      terminalRuntimeControlAttestation = issueAttestation('terminal');
      return terminalRuntimeControlAttestation;
    },
    close: async () => {
      closed += 1;
    },
  });
  const pool: BrowserToolPool = Object.freeze({
    acquire: async () => session,
    dispose: async () => undefined,
  });
  const factory = createFirstPartyBrowserVerificationAdapterFactoryInternal(
    {
      targetLease: Object.freeze({
        acquire: async () =>
          Object.freeze({
            leaseId: 'lease:1',
            origin,
            binding: attestation.binding,
            bindingDigest: attestation.bindingDigest,
            runtimeIdentity: identity,
          }),
        release: async () => {
          released += 1;
          return Object.freeze({
            status: 'clean' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze([]),
          });
        },
      }),
      runtimeControls: Object.freeze({
        acquire: async () => runtimeLease,
        release: async (_lease, terminalAttestation) => {
          runtimeReleased += 1;
          runtimeReleaseAttestations.push(terminalAttestation);
          if (
            !terminalSealed ||
            terminalAttestation?.phase !== 'terminal' ||
            !issuedAttestations.has(terminalAttestation.attestationDigest)
          ) {
            return Object.freeze({
              status: 'failed' as const,
              residualCanaryIds: Object.freeze(['canary:runtime-control']),
              diagnosticCodes: Object.freeze([
                'TEST_RUNTIME_CONTROL_TERMINAL_MISSING',
              ]),
            });
          }
          return Object.freeze({
            status: 'clean' as const,
            residualCanaryIds: Object.freeze([]),
            diagnosticCodes: Object.freeze([]),
          });
        },
      }),
      securityObservationAuthority: Object.freeze({
        resolve: async () => undefined,
      }),
    },
    () => pool
  );
  const context: VerificationAdapterContext = Object.freeze({
    registrySnapshotDigest: registry.snapshotDigest,
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    runtimeZone: 'browser',
    runtimeEnvironmentDigest,
    inputDigest: cell.inputDigest,
    executableSnapshotDigest,
    scenarioProgramDigest: program.programDigest,
    controlProfileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze([fixtureDigest]),
    controlCapabilityIds:
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.descriptor
        .controlCapabilities,
    controlCapabilitySnapshotDigest,
    appliedControlDigest,
    inputRefs: refs,
    inputResolver: Object.freeze({
      read: async (ref: VerificationAdapterInputRef) => {
        readIds.push(ref.id);
        return new Uint8Array(byId.get(ref.id)!);
      },
    }),
    artifactStaging: Object.freeze({
      stage: async (
        artifact: Parameters<
          VerificationAdapterContext['artifactStaging']['stage']
        >[0]
      ) =>
        Object.freeze({
          status: 'staged' as const,
          stagingArtifactId: `staging:${artifact.id}`,
          digest: digestBrowserVerificationBytes(artifact.bytes),
          size: artifact.bytes.byteLength,
          mediaType: artifact.mediaType,
        }),
    }),
    abortSignal: signal,
    resolvedInputSetDigest,
  });
  const adapter = factory({
    descriptor:
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.descriptor,
    identity: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    tool: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.tool!,
    runtimeZone: 'browser',
    registrySnapshotDigest: registry.snapshotDigest,
  });
  return Object.freeze({
    factory,
    adapter,
    cell,
    context,
    prepareInput: Object.freeze({
      planDigest: sha('plan'),
      cell,
      attemptId: 'attempt:1',
      generation: 1,
      providerKind: 'ci',
      controlCapabilitySnapshotDigest,
      appliedControlDigest,
      context,
    }),
    readIds,
    sessionClosed: () => closed,
    leaseReleased: () => released,
    runtimeControlReleased: () => runtimeReleased,
    runtimeControlReleaseAttestations: () =>
      Object.freeze([...runtimeReleaseAttestations]),
    terminalRuntimeFixtureBindingDigest: () => {
      if (!terminalRuntimeControlAttestation) {
        throw new Error('Terminal runtime controls were not finalized.');
      }
      return createBrowserRuntimeFixtureConsumptionBindingDigest({
        attestation: terminalRuntimeControlAttestation,
        fixtureSetDigests: [fixtureDigest],
      });
    },
  });
};

const preparedInvocation = (
  candidate: Awaited<ReturnType<Harness['adapter']['prepare']>>,
  context: VerificationAdapterContext
): PreparedVerificationInvocation =>
  Object.freeze({
    ...candidate,
    resolvedInputSetDigest: context.resolvedInputSetDigest,
  });

describe('first-party browser adapter lifecycle', () => {
  it('consumes Core bytes, executes one black-box check, stages exact artifacts, and cleans up', async () => {
    const value = harness();
    expect(await value.adapter.preflight(value.cell, value.context)).toEqual({
      status: 'supported',
    });
    const invocation = preparedInvocation(
      await value.adapter.prepare(value.prepareInput),
      value.context
    );
    expect(value.readIds.sort()).toEqual(['input:profile', 'input:program']);
    const events: unknown[] = [];
    const candidate = await value.adapter.execute(
      invocation,
      Object.freeze({
        emit: (event) => {
          events.push(event);
          return Object.freeze({
            status: 'accepted' as const,
            sequence: events.length,
          });
        },
      })
    );

    expect(candidate.payload).toMatchObject({
      kind: 'e2e',
      scenarioId: 'scenario:catalog',
    });
    if (candidate.payload.kind !== 'e2e') {
      throw new Error('Expected the E2E conformance candidate.');
    }
    expect(
      candidate.payload.behaviorAssertionReceipt.runtimeFixtureBindingDigest
    ).toBe(value.terminalRuntimeFixtureBindingDigest());
    expect(candidate.artifacts.map(({ kind }) => kind).sort()).toEqual([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ]);
    expect(
      await value.adapter.cleanup({
        planDigest: value.prepareInput.planDigest,
        cellId: value.cell.id,
        attemptId: value.prepareInput.attemptId,
        generation: value.prepareInput.generation,
        cause: 'success',
        invocation,
        abortSignal: signal,
      })
    ).toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    expect(value.sessionClosed()).toBe(1);
    expect(value.leaseReleased()).toBe(1);
    expect(value.runtimeControlReleased()).toBe(1);
    await value.factory.dispose();
  });

  it('tracks a reused public adapter as active after its prior invocation was cleaned', async () => {
    const value = harness();
    const first = preparedInvocation(
      await value.adapter.prepare(value.prepareInput),
      value.context
    );
    await value.adapter.cleanup({
      planDigest: value.prepareInput.planDigest,
      cellId: value.cell.id,
      attemptId: value.prepareInput.attemptId,
      generation: value.prepareInput.generation,
      cause: 'success',
      invocation: first,
      abortSignal: signal,
    });

    const second = preparedInvocation(
      await value.adapter.prepare(value.prepareInput),
      value.context
    );
    await expect(value.factory.dispose()).rejects.toThrow(
      /attempts are active/u
    );
    await value.adapter.cleanup({
      planDigest: value.prepareInput.planDigest,
      cellId: value.cell.id,
      attemptId: value.prepareInput.attemptId,
      generation: value.prepareInput.generation,
      cause: 'success',
      invocation: second,
      abortSignal: signal,
    });
    await value.factory.dispose();

    expect(value.sessionClosed()).toBe(2);
    expect(value.leaseReleased()).toBe(2);
  });

  it('never presents an initial attestation as terminal release evidence after execution does not complete', async () => {
    const value = harness();
    const invocation = preparedInvocation(
      await value.adapter.prepare(value.prepareInput),
      value.context
    );

    await value.adapter.cleanup({
      planDigest: value.prepareInput.planDigest,
      cellId: value.cell.id,
      attemptId: value.prepareInput.attemptId,
      generation: value.prepareInput.generation,
      cause: 'execute-failed',
      invocation,
      abortSignal: signal,
    });

    expect(value.runtimeControlReleaseAttestations()).toEqual([undefined]);
    await value.factory.dispose();
  });

  it('rejects tampered Core Scenario Program bytes before acquiring a browser', async () => {
    const value = harness({ tamperScenarioBytes: true });
    await expect(value.adapter.prepare(value.prepareInput)).rejects.toThrow(
      /content address/u
    );
    expect(value.sessionClosed()).toBe(0);
    await value.adapter.cleanup({
      planDigest: value.prepareInput.planDigest,
      cellId: value.cell.id,
      attemptId: value.prepareInput.attemptId,
      generation: value.prepareInput.generation,
      cause: 'prepare-failed',
      abortSignal: signal,
    });
    await value.factory.dispose();
  });

  it('rejects lease replay and provider-observed runtime identity drift', async () => {
    const replay = harness({ leaseGeneration: 2 });
    await expect(replay.adapter.prepare(replay.prepareInput)).rejects.toThrow(
      /binding digest|attempt|generation|lease/u
    );
    await expect(
      replay.adapter.cleanup({
        planDigest: replay.prepareInput.planDigest,
        cellId: replay.cell.id,
        attemptId: replay.prepareInput.attemptId,
        generation: replay.prepareInput.generation,
        cause: 'prepare-failed',
        abortSignal: signal,
      })
    ).resolves.toEqual({
      status: 'clean',
      residualCanaryIds: [],
      diagnosticCodes: [],
    });
    expect(replay.leaseReleased()).toBe(1);
    await replay.factory.dispose();

    const drifted = runtimeIdentity();
    const runtimeDrift = harness({
      observedRuntimeIdentity: Object.freeze({
        ...drifted,
        browserVersion: '999.0.0',
      }),
    });
    await expect(
      runtimeDrift.adapter.prepare(runtimeDrift.prepareInput)
    ).rejects.toThrow(/Observed browser runtime identity drifted/u);
    expect(runtimeDrift.sessionClosed()).toBe(1);
    await runtimeDrift.adapter.cleanup({
      planDigest: runtimeDrift.prepareInput.planDigest,
      cellId: runtimeDrift.cell.id,
      attemptId: runtimeDrift.prepareInput.attemptId,
      generation: runtimeDrift.prepareInput.generation,
      cause: 'prepare-failed',
      abortSignal: signal,
    });
    await runtimeDrift.factory.dispose();
  });
});
