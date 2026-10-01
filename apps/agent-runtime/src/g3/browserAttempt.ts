import { createRemoteDeterministicReplayProvider } from '@prodivix/runtime-remote';
import {
  encodeExecutableProjectSnapshotArtifact,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import { issueCompilerFixtureProjectionReceipt } from '@prodivix/prodivix-compiler';
import {
  runControlledStaticToolchainProduction,
  type ControlledStaticToolchainResult,
} from '@prodivix/verification-adapters';
import {
  createVerificationAbortController,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  type VerificationAdapterRegistrySnapshot,
  type VerificationPlanCell,
  type VerificationEvidenceCandidate,
  type VerificationAdapterLifecycleContext,
} from '@prodivix/verification';
import {
  createProductionBrowserLoopbackPreviewHost,
  createProductionChromiumBrowserAuthority,
  createProductionBrowserBuildBundleDigest,
  createProductionBrowserExecutableSnapshotReceipt,
  createProductionBrowserRuntimeIdentity,
  createBrowserVerificationRuntimeEnvironmentDigest,
  createBrowserVerificationProfileInputRef,
  createBrowserScenarioProgramInputRef,
  createBrowserBaselineSetInputRef,
  createBrowserSecurityObservationSetInputRef,
  createBrowserVerificationEvidenceSourceTrace,
  createBrowserNetworkObservationDigest,
  createBrowserSecurityPolicyDigest,
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  type ProductionBrowserCanaryScannerPort,
  type BrowserVerificationCellProfile,
} from '@prodivix/verification-browser';
import { compileDriverSnapshot } from '#src/g3/staticAttempt.js';
import { compileDriverScenario } from '#src/g3/scenario.js';
import {
  readDriverControls,
  readDriverBaseline,
  readDriverBrowserProfile,
} from '#src/g3/material.js';
import { inspectDriverSecurity } from '#src/g3/security.js';
import type {
  DriverCanonicalContext,
  DriverAttemptResult,
  DriverBackendPort,
  DriverAttemptGrant,
} from '#src/g3/ports.js';
import type { DriverCoordinates } from '#src/g3/contract.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import type { createDriverArtifactStaging } from '#src/g3/staging.js';

/** One attempt owns one physical preview, Browser context, deterministic lease and cleanup. */
export const executeDriverBrowserAttempt = async (input: {
  config: G3DriverConfiguration;
  context: DriverCanonicalContext;
  coordinates: DriverCoordinates;
  backend: DriverBackendPort;
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  registry: VerificationAdapterRegistrySnapshot;
  staging: ReturnType<typeof createDriverArtifactStaging>;
  scanner: ProductionBrowserCanaryScannerPort;
  canaries(): readonly string[];
  recordBrowserActive(active: boolean): Promise<void>;
  signal: AbortSignal;
  resourceScope: string;
  snapshot?: ExecutableProjectSnapshot;
  toolchain?: ControlledStaticToolchainResult;
  authorize(
    run: VerificationEvidenceCandidate['run']
  ): Promise<DriverAttemptGrant>;
}): Promise<DriverAttemptResult> => {
  const { context, cell, config } = input;
  if (!config.chromium || cell.browserEngine !== 'chromium')
    throw new Error('G3 requires a configured observed Chromium authority.');
  const snapshot = input.snapshot ?? compileDriverSnapshot(context, cell);
  const scenario = compileDriverScenario(
    context.workspace,
    cell,
    snapshot.contentDigest
  );
  if (!scenario)
    throw new Error('G3 Browser checks require one canonical Scenario.');
  const controls = readDriverControls(context.workspace, cell);
  const authored = readDriverBrowserProfile(context.workspace, cell);
  const baseline = readDriverBaseline(context.workspace, cell);
  const grant = await input.authorize({
    runId: context.run.runId,
    providerId: context.run.providerId,
    surface: cell.surface,
    frameworkTarget: cell.frameworkTarget,
    runtimeZone: 'browser',
    browserEngine: 'chromium',
    viewport: cell.viewport,
    devicePixelRatio: config.chromium.devicePixelRatio,
    colorScheme: cell.colorScheme,
    motion: cell.motion,
    locale: cell.locale,
    timezone: 'UTC',
    fontSetDigest: config.chromium.fontSetDigest,
  });
  const startedAt = new Date(
    Math.max(Date.now(), Date.parse(grant.issuedAt))
  ).toISOString();
  const toolchain =
    input.toolchain ??
    (await runControlledStaticToolchainProduction({
      repositoryRoot: config.repositoryRoot,
      snapshot,
      signal: input.signal,
      resourceScope: input.resourceScope,
    }));
  if (
    toolchain.authorityReceipt.snapshotDigest !== snapshot.contentDigest ||
    toolchain.projectionAuthority.receipt.snapshotDigest !==
      snapshot.contentDigest
  )
    throw new Error('G3 Browser build receipt drifted.');
  const controller = createVerificationAbortController();
  const abort = () => controller.abort('ordinary-agent-cancelled');
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) abort();
  await input.recordBrowserActive(true);
  const host = createProductionBrowserLoopbackPreviewHost();
  const providerImplementation = digestVerificationValue({
    owner: '@prodivix/runtime-remote',
    entry: 'createRemoteDeterministicReplayProvider',
    composition: 'ordinary-production-chromium',
  });
  let authority:
    | Awaited<ReturnType<typeof createProductionChromiumBrowserAuthority>>
    | undefined;
  let outcome: DriverAttemptResult | undefined;
  let failure: unknown;
  try {
    authority = await createProductionChromiumBrowserAuthority({
      runtimeAuthority: config.chromium,
      previewHost: host,
      canaryScanner: input.scanner,
      runtimeProvider: {
        providerId: 'prodivix.agent-runtime.remote-replay',
        providerVersion: '1',
        implementationDigest: providerImplementation,
        create: (hooks) =>
          createRemoteDeterministicReplayProvider({
            id: 'prodivix.agent-runtime.remote-replay',
            version: '1',
            implementationDigest: providerImplementation,
            transport: {
              reset: hooks.reset,
              apply: async (request) => {
                const result = await hooks.apply(request);
                return { ...result, fontReady: result.fontReady ?? false };
              },
              probe: hooks.probe,
              cleanup: hooks.cleanup,
            },
          }),
      },
      baselineAssets: {
        async read(entry, signal) {
          if (signal.aborted) return undefined;
          return input.backend.asset(
            context,
            input.coordinates,
            cell.id,
            entry,
            input.signal
          );
        },
      },
    });
    const runtimeIdentity = createProductionBrowserRuntimeIdentity(
      authority.runtimeAuthority,
      cell
    );
    const runtimeEnvironmentDigest =
      createBrowserVerificationRuntimeEnvironmentDigest(runtimeIdentity);
    const sourceTrace = createBrowserVerificationEvidenceSourceTrace({
      scenarioId: scenario.scenario.id,
    });
    const sourceTraceDigest = digestVerificationValue(sourceTrace);
    const security =
      cell.checkKind === 'security'
        ? inspectDriverSecurity({
            toolchain,
            binding: {
              cellId: cell.id,
              attemptId: input.attemptId,
              generation: input.generation,
              executableSnapshotDigest: snapshot.contentDigest,
              runtimeEnvironmentDigest,
              controlProfileDigest: cell.controlProfileRef.digest!,
            },
            targetId: cell.targetId,
            sourceTraceDigest,
            canaries: input.canaries(),
          })
        : undefined;
    const entry = toolchain.buildBundle.files.find(
      ({ path }) => path === snapshot.previewPlan.entryFilePath
    );
    if (!entry) throw new Error('G3 build has no preview entry.');
    const fixtureReceipt = controls.fixtures.length
      ? issueCompilerFixtureProjectionReceipt({
          snapshot,
          fixtureSets: controls.fixtures,
          controlProfile: controls.profile,
          generatedFiles: projectExecutableProjectRuntimeFiles(
            snapshot,
            'test'
          ),
          buildBundle: toolchain.buildBundle,
        })
      : undefined;
    const auth = fixtureReceipt?.authSessionTransport;
    const authBinding = auth
      ? {
          format: auth.responseFormat,
          version: auth.responseVersion,
          fixtureSetId: auth.fixtureSetId,
          fixtureSetDigest: auth.fixtureSetDigest,
          fixtureId: auth.fixtureId,
          resourceId: auth.resourceId,
          inputDigest: auth.inputDigest,
          outcomeDigest: auth.outcomeDigest,
          projectionDigest: auth.projectionDigest,
          providerId: auth.providerId,
          principalId: auth.principalId,
          permissionIds: auth.permissionIds,
        }
      : undefined;
    const remoteExecution = await host.reserve(
      {
        attemptId: input.attemptId,
        generation: input.generation,
        requestId: `request:${input.attemptId}`,
        executionId: `execution:${input.attemptId}`,
        snapshotDigest: snapshot.contentDigest,
        buildBundleDigest: createProductionBrowserBuildBundleDigest(
          toolchain.buildBundle
        ),
        entryFilePath: entry.path,
        entryDigest: entry.digest,
        buildFileCount: toolchain.buildBundle.files.length,
      },
      controller.signal
    );
    const registration = await authority.register(
      {
        cell,
        attemptId: input.attemptId,
        generation: input.generation,
        providerKind: 'remote',
        snapshot,
        buildBundle: toolchain.buildBundle,
        program: scenario.program,
        controlProfile: controls.profile,
        fixtureSets: controls.fixtures,
        ...(authBinding
          ? {
              authSessionFixtureBinding: authBinding,
              fixtureProjectionReceiptDigest: fixtureReceipt!.receiptDigest,
            }
          : {}),
        runtimeAuthority: authority.runtimeAuthority,
        remoteExecution,
        projectionAuthorityDigest:
          toolchain.projectionAuthority.receipt.receiptDigest,
        executableSnapshotReceipt:
          createProductionBrowserExecutableSnapshotReceipt({
            snapshot,
            sourceRef: `workspace:${context.workspace.id}`,
            compilerProjectionReceiptDigest:
              toolchain.projectionAuthority.receipt.receiptDigest,
          }),
        ...(security ? { securityObservationSet: security } : {}),
      },
      controller.signal
    );
    let profile: BrowserVerificationCellProfile;
    if (cell.checkKind === 'e2e')
      profile = {
        kind: 'e2e',
        scenarioId: scenario.program.scenarioId,
        programDigest: scenario.program.programDigest,
      };
    else if (authored?.kind === 'security' && security) {
      const policy = {
        ...authored.policy,
        allowedOrigins: [registration.origin],
        expectedChecks: authored.policy.expectedChecks.map((check) =>
          check.ruleId === 'security.unexpected-network'
            ? {
                ...check,
                expectedDigest: createBrowserNetworkObservationDigest([
                  registration.origin,
                ]),
              }
            : check
        ),
      };
      profile = {
        kind: 'security',
        policy,
        profileDigest: createBrowserSecurityPolicyDigest(policy),
        observationSetDigest: digestVerificationValue(security),
      };
    } else if (authored && authored.kind !== 'security') profile = authored;
    else throw new Error('G3 authored Browser profile is unavailable.');
    const snapshotArtifact = encodeExecutableProjectSnapshotArtifact(snapshot);
    const entries = [
      {
        ref: {
          id: 'executable.snapshot',
          kind: 'executable-snapshot' as const,
          mediaType: snapshotArtifact.mediaType,
          digest: snapshotArtifact.artifactDigest,
          size: snapshotArtifact.size,
        },
        bytes: snapshotArtifact.bytes,
      },
      createBrowserScenarioProgramInputRef(
        'scenario.program',
        scenario.program
      ),
      createBrowserVerificationProfileInputRef('verification.profile', {
        format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
        version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
        cellId: cell.id,
        checkKind: profile.kind,
        scenarioId: scenario.program.scenarioId,
        targetId: cell.targetId,
        frameworkTarget: cell.frameworkTarget,
        surface: cell.surface,
        browserEngine: 'chromium',
        viewport: { width: cell.viewport.width, height: cell.viewport.height },
        colorScheme: cell.colorScheme,
        motion: cell.motion,
        locale: cell.locale,
        executableSnapshotDigest: snapshot.contentDigest,
        scenarioProgramDigest: scenario.program.programDigest,
        controlProfileDigest: cell.controlProfileRef.digest!,
        fixtureSetDigests: controls.fixtures.length
          ? [cell.fixtureSetRef!.digest!]
          : [],
        ...(baseline
          ? { baselineSetDigest: cell.baselineSetRef!.digest! }
          : {}),
        targetLeaseBindingDigest: registration.lease.bindingDigest,
        profile,
      }),
      ...(baseline
        ? [createBrowserBaselineSetInputRef('baseline.set', baseline)]
        : []),
      ...(security
        ? [
            createBrowserSecurityObservationSetInputRef(
              'security.observations',
              security
            ),
          ]
        : []),
    ];
    const byId = new Map(entries.map((entry) => [entry.ref.id, entry]));
    const lifecycleContext: VerificationAdapterLifecycleContext = {
      registrySnapshotDigest: input.registry.snapshotDigest,
      adapter: cell.adapter,
      runtimeZone: 'browser',
      runtimeEnvironmentDigest: registration.runtimeEnvironmentDigest,
      inputDigest: cell.inputDigest,
      executableSnapshotDigest: snapshot.contentDigest,
      scenarioProgramDigest: scenario.program.programDigest,
      controlProfileDigest: cell.controlProfileRef.digest!,
      fixtureSetDigests: cell.fixtureSetRef?.digest
        ? [cell.fixtureSetRef.digest]
        : [],
      ...(baseline ? { baselineSetDigest: cell.baselineSetRef!.digest! } : {}),
      controlCapabilityIds: registration.controlCapabilityIds,
      controlCapabilitySnapshotDigest:
        registration.controlCapabilitySnapshotDigest,
      appliedControlDigest: registration.appliedControlDigest,
      inputRefs: entries.map(({ ref }) => ref),
      inputResolver: {
        async read(ref) {
          const entry = byId.get(ref.id);
          if (!entry || entry.ref.digest !== ref.digest)
            throw new Error('G3 Browser input drifted.');
          return new Uint8Array(entry.bytes);
        },
      },
      artifactStaging: input.staging.staging,
      abortSignal: controller.signal,
    };
    const lifecycle = await executeVerificationAdapterLifecycle({
      factory: authority.adapterFactory,
      registrySnapshot: input.registry,
      planDigest: context.plan.planDigest,
      cell,
      attemptId: input.attemptId,
      generation: input.generation,
      providerKind: 'remote',
      context: lifecycleContext,
      artifactRetirement: input.staging.retirement,
    });
    const retired = await registration.retire();
    if (retired.status !== 'clean' || lifecycle.status !== 'reported')
      throw new Error(
        'G3 Browser attempt did not report after clean retirement.'
      );
    const completedAt = new Date().toISOString();
    const artifacts = new Map(
      lifecycle.stagedArtifacts.map((artifact) => [
        artifact.id,
        input.staging.read(artifact.stagingArtifactId),
      ])
    );
    outcome = {
      artifacts,
      input: {
        projectId: context.projectId,
        plan: context.plan,
        adapterRegistry: input.registry,
        cellId: cell.id,
        context: {
          cell,
          attemptId: input.attemptId,
          resolvedInputSetDigest: lifecycle.resolvedInputSetDigest,
          runtimeEnvironmentDigest: registration.runtimeEnvironmentDigest,
          executableSnapshotDigest: snapshot.contentDigest,
          scenarioProgramDigest: scenario.program.programDigest,
          controlProfileDigest: cell.controlProfileRef.digest!,
          fixtureSetDigests: lifecycleContext.fixtureSetDigests,
          ...(baseline
            ? { baselineSetDigest: cell.baselineSetRef!.digest! }
            : {}),
          controlCapabilityIds: registration.controlCapabilityIds,
          controlCapabilitySnapshotDigest:
            registration.controlCapabilitySnapshotDigest,
          appliedControlDigest: registration.appliedControlDigest,
          inputRefs: lifecycleContext.inputRefs,
        },
        report: lifecycle.report,
        scenario: scenario.scenario,
        run: {
          runId: context.run.runId,
          providerId: context.run.providerId,
          runtimeZone: 'browser',
          operatingSystemIdentity: runtimeIdentity.operatingSystemImageDigest,
          devicePixelRatio: runtimeIdentity.viewport.devicePixelRatio,
          timezone: 'UTC',
          fontSetDigest: runtimeIdentity.fontSetDigest,
          sandboxImageDigest: runtimeIdentity.browserImageDigest,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        },
        artifacts: lifecycle.stagedArtifacts.map((artifact) => ({
          id: artifact.id,
          path: `g3/${artifact.kind}/${artifact.digest.slice(7)}.json`,
        })),
        stagedArtifacts: lifecycle.stagedArtifacts,
        sourceTraces: [sourceTrace],
        dependencyLockDigest: toolchain.authorityReceipt.toolchain.lockDigest,
        provenance: {
          origin: 'remote',
          producerId: 'prodivix.agent-runtime-g3',
          providerId: context.run.providerId,
          issuedAt: startedAt,
        },
        redaction: {
          policyId: 'redaction:callback-canary-v1',
          scannerSetDigest: input.scanner.authorityDigest,
          droppedFieldCounts: {},
        },
        promotion: {
          idempotencyKey: `promotion:${context.run.runId}:${input.attemptId}`,
          deadline: new Date(
            Math.min(Date.now() + 120000, Date.parse(grant.expiresAt))
          ).toISOString(),
        },
      },
    };
  } catch (error) {
    failure = error;
  } finally {
    input.signal.removeEventListener('abort', abort);
    const browserClean = await authority?.drainAndDispose();
    const hostClean = await host.drainAndDispose();
    if (
      (browserClean && browserClean.status !== 'clean') ||
      hostClean.status !== 'clean'
    )
      failure = new Error('G3 Browser cleanup has residual resources.');
    else await input.recordBrowserActive(false);
  }
  if (failure) throw failure;
  if (!outcome)
    throw new Error('G3 Browser produced no bounded attempt result.');
  return outcome;
};
