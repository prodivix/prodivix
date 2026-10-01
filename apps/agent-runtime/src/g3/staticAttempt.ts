import {
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
  issueWorkspaceDiagnosticProjectionReceipt,
  PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
  createCompilerFixtureProjectionSnapshot,
  issueCompilerFixtureProjectionReceipt,
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
} from '@prodivix/prodivix-compiler';
import {
  BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
  TEST_VERIFICATION_RESULT_MEDIA_TYPE,
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  createBuildVerificationAdapter,
  createDiagnosticsVerificationAdapter,
  createUnitVerificationAdapter,
  createIntegrationVerificationAdapter,
  createExecutionBuildOutputManifestDigest,
  encodeBuildVerificationResult,
  encodeCanonicalExecutionTestReport,
  encodeDiagnosticVerificationSnapshot,
  encodeTestVerificationResult,
  encodeVerificationTrace,
  digestVerificationAdapterBytes,
  runControlledStaticToolchainProduction,
  VERIFICATION_TRACE_MEDIA_TYPE,
  VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
  VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
  type ControlledStaticToolchainResult,
} from '@prodivix/verification-adapters';
import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  type ExecutableProjectSnapshot,
  projectExecutableProjectRuntimeFiles,
} from '@prodivix/runtime-core';
import {
  createVerificationAbortController,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleContext,
  type VerificationAdapterRegistrySnapshot,
  type VerificationPlanCell,
  type VerificationEvidenceSourceTrace,
  type VerificationEvidenceCandidate,
} from '@prodivix/verification';
import type {
  DriverCanonicalContext,
  DriverAttemptResult,
  DriverAttemptGrant,
} from '#src/g3/ports.js';
import type { G3DriverConfiguration } from '#src/g3/config.js';
import type { createDriverArtifactStaging } from '#src/g3/staging.js';
import { readDriverControls } from '#src/g3/material.js';
import { compileDriverScenario } from '#src/g3/scenario.js';
import { isPlainObject } from '@prodivix/shared/safety';

const compilerOptionsForCell = (
  context: Pick<DriverCanonicalContext, 'workspace'>,
  cell: VerificationPlanCell
) => {
  const controls = readDriverControls(context.workspace, cell);
  const fixtures = controls.fixtures.flatMap((set) => set.fixtures);
  const authFixture = fixtures.find(
    (fixture) => fixture.target.kind === 'auth-session'
  );
  if (
    authFixture &&
    (fixtures.length !== 1 ||
      authFixture.outcome.kind !== 'result' ||
      !isPlainObject(authFixture.outcome.value) ||
      Object.keys(authFixture.outcome.value).some(
        (key) => !['principalId', 'permissionIds'].includes(key)
      ) ||
      typeof authFixture.outcome.value.principalId !== 'string' ||
      !Array.isArray(authFixture.outcome.value.permissionIds) ||
      authFixture.outcome.value.permissionIds.some(
        (id) => typeof id !== 'string'
      ))
  )
    throw new Error(
      'G3 auth fixture must carry an exact principal and permissions result.'
    );
  const provision =
    authFixture &&
    authFixture.outcome.kind === 'result' &&
    isPlainObject(authFixture.outcome.value)
      ? {
          format: 'prodivix.server-runtime-test-provision.v1' as const,
          fixtureSetId: controls.fixtures[0]!.id,
          principal: {
            providerId: authFixture.target.resourceId,
            principalId: authFixture.outcome.value.principalId as string,
          },
          permissions: (
            authFixture.outcome.value.permissionIds as string[]
          ).map((permissionId) => ({ permissionId, allowed: true })),
          fixtures: [],
        }
      : undefined;
  if (cell.checkKind === 'security' && provision)
    throw new Error(
      'G3 shipping production security projection must not contain test fixtures.'
    );
  return {
    ...(cell.checkKind === 'security'
      ? {}
      : {
          verificationProfile:
            PRODUCTION_WORKSPACE_VERIFICATION_COMPILE_PROFILE,
        }),
    ...(provision
      ? {
          serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
          serverRuntimeMockProvision: provision,
        }
      : {}),
  };
};
export const compileDriverSnapshot = (
  context: Pick<DriverCanonicalContext, 'workspace'>,
  cell: VerificationPlanCell
): ExecutableProjectSnapshot => {
  const controls = readDriverControls(context.workspace, cell);
  const options = compilerOptionsForCell(context, cell);
  const provision = options.serverRuntimeMockProvision;
  const result =
    cell.frameworkTarget === 'react-vite'
      ? generateWorkspaceReactViteExecutableProject(context.workspace, options)
      : cell.frameworkTarget === 'vue-vite'
        ? generateWorkspaceVueViteExecutableProject(context.workspace, options)
        : undefined;
  if (
    result?.status !== 'ready' ||
    result.snapshot.dataMockProvision !== undefined ||
    (result.snapshot.serverRuntimeMockProvision !== undefined && !provision)
  )
    throw new Error('G3 production compiler projection is blocked.');
  if (cell.checkKind === 'integration' || provision) {
    if (controls.fixtures.length !== 1)
      throw new Error('G3 integration requires one canonical fixture set.');
    return createCompilerFixtureProjectionSnapshot({
      snapshot: result.snapshot,
      fixtureSets: controls.fixtures,
      controlProfile: controls.profile,
    });
  }
  return result.snapshot;
};

type Entry = Readonly<{ ref: VerificationAdapterInputRef; bytes: Uint8Array }>;
const entry = (
  id: string,
  kind: VerificationAdapterInputRef['kind'],
  mediaType: string,
  bytes: Uint8Array
): Entry => ({
  ref: {
    id,
    kind,
    mediaType,
    digest: digestVerificationAdapterBytes(bytes),
    size: bytes.byteLength,
  },
  bytes,
});

/** Receipts come from the real compiler and isolated toolchain, never model output. */
export const executeDriverStaticAttempt = async (input: {
  config: G3DriverConfiguration;
  context: DriverCanonicalContext;
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  registry: VerificationAdapterRegistrySnapshot;
  staging: ReturnType<typeof createDriverArtifactStaging>;
  signal: AbortSignal;
  snapshot?: ExecutableProjectSnapshot;
  toolchain?: ControlledStaticToolchainResult;
  scannerDigest: string;
  resourceScope: string;
  authorize(
    run: VerificationEvidenceCandidate['run']
  ): Promise<DriverAttemptGrant>;
}): Promise<DriverAttemptResult> => {
  const { context, cell } = input;
  const snapshot = input.snapshot ?? compileDriverSnapshot(context, cell);
  const scenario = compileDriverScenario(
    context.workspace,
    cell,
    snapshot.contentDigest
  );
  const grant = await input.authorize({
    runId: context.run.runId,
    providerId: context.run.providerId,
    surface: cell.surface,
    frameworkTarget: cell.frameworkTarget,
    runtimeZone: 'node',
    viewport: cell.viewport,
    devicePixelRatio: 1,
    colorScheme: cell.colorScheme,
    motion: cell.motion,
    locale: cell.locale,
    timezone: 'UTC',
    fontSetDigest: digestVerificationValue({ fontSet: 'static-no-browser' }),
  });
  const startedAt = new Date(
    Math.max(Date.now(), Date.parse(grant.issuedAt))
  ).toISOString();
  const toolchain =
    input.toolchain ??
    (await runControlledStaticToolchainProduction({
      repositoryRoot: input.config.repositoryRoot,
      snapshot,
      signal: input.signal,
      resourceScope: input.resourceScope,
    }));
  if (
    toolchain.authorityReceipt.snapshotDigest !== snapshot.contentDigest ||
    toolchain.projectionAuthority.receipt.snapshotDigest !==
      snapshot.contentDigest
  )
    throw new Error('G3 isolated toolchain receipt drifted.');
  const bundleBytes = Buffer.from(
    toolchain.projectionAuthority.raw.buildBundle.contents,
    'base64'
  );
  let entries: Entry[];
  let factory;
  const artifactId = (kind: string) => `artifact:${kind}:${input.attemptId}`;
  if (cell.checkKind === 'diagnostics') {
    const controls = readDriverControls(context.workspace, cell);
    const generatedFiles = projectExecutableProjectRuntimeFiles(
      snapshot,
      'test'
    );
    const fixtureReceipt = controls.fixtures.length
      ? issueCompilerFixtureProjectionReceipt({
          snapshot,
          fixtureSets: controls.fixtures,
          controlProfile: controls.profile,
          generatedFiles,
          buildBundle: toolchain.buildBundle,
        })
      : undefined;
    const receipt = issueWorkspaceDiagnosticProjectionReceipt({
      workspace: context.workspace,
      snapshot,
      compiler: {
        presetId: cell.frameworkTarget as 'react-vite' | 'vue-vite',
        options: compilerOptionsForCell(context, cell),
      },
      ...(fixtureReceipt
        ? {
            fixtureProjectionAuthority: {
              fixtureSets: controls.fixtures,
              controlProfile: controls.profile,
              generatedFiles,
              buildBundle: toolchain.buildBundle,
              receipt: fixtureReceipt,
            },
          }
        : {}),
    });
    const trace = encodeVerificationTrace(receipt.trace);
    entries = [
      entry(
        FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
        'diagnostic-snapshot',
        DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
        encodeDiagnosticVerificationSnapshot({
          cellInputDigest: cell.inputDigest,
          workspaceSnapshotDigest: receipt.workspaceSnapshotDigest,
          semanticIndexDigest: receipt.semanticIndexDigest,
          compilerProjectionDigest: receipt.compilerProjectionDigest,
          findings: receipt.findings,
          artifacts: [
            {
              id: artifactId('trace'),
              kind: 'trace',
              mediaType: VERIFICATION_TRACE_MEDIA_TYPE,
              bytes: trace,
            },
          ],
        })
      ),
    ];
    factory = createDiagnosticsVerificationAdapter;
  } else if (cell.checkKind === 'build') {
    entries = [
      entry(
        FIRST_PARTY_VERIFICATION_INPUT_IDS.buildBundle,
        'executable-snapshot',
        EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
        bundleBytes
      ),
      entry(
        FIRST_PARTY_VERIFICATION_INPUT_IDS.buildResult,
        'executable-snapshot',
        BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
        encodeBuildVerificationResult({
          cellInputDigest: cell.inputDigest,
          snapshotDigest: snapshot.contentDigest,
          target: snapshot.target,
          outputManifestDigest: createExecutionBuildOutputManifestDigest(
            toolchain.buildBundle
          ),
          status: 'succeeded',
          exitCode: 0,
          findings: [],
          artifacts: [
            {
              id: artifactId('build-log'),
              kind: 'build-log',
              mediaType: VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
              bytes: toolchain.buildSummary,
            },
          ],
        })
      ),
    ];
    factory = createBuildVerificationAdapter;
  } else if (cell.checkKind === 'unit' || cell.checkKind === 'integration') {
    const report = encodeCanonicalExecutionTestReport(toolchain.testReport);
    const artifacts = [
      {
        id: artifactId('coverage'),
        kind: 'coverage-summary' as const,
        mediaType: VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
        bytes: toolchain.coverageSummary,
      },
    ];
    const base = {
      cellInputDigest: cell.inputDigest,
      snapshotDigest: snapshot.contentDigest,
      reportDigest: digestVerificationAdapterBytes(report),
      controlProfileDigest: cell.controlProfileRef.digest!,
      status: toolchain.testReport.status,
      exitCode: toolchain.testReport.status === 'passed' ? 0 : 1,
    };
    let resultBytes: Uint8Array;
    if (cell.checkKind === 'integration') {
      const controls = readDriverControls(context.workspace, cell);
      issueCompilerFixtureProjectionReceipt({
        snapshot,
        fixtureSets: controls.fixtures,
        controlProfile: controls.profile,
        generatedFiles: projectExecutableProjectRuntimeFiles(snapshot, 'test'),
        buildBundle: toolchain.buildBundle,
      });
      const trace = encodeVerificationTrace({
        traceKind: 'integration',
        subjectDigest: snapshot.contentDigest,
        entries: toolchain.testReport.files.map((file) => ({
          path: file.path,
          sourceTrace: file.sourceTrace ?? [],
        })),
      });
      resultBytes = encodeTestVerificationResult({
        ...base,
        checkKind: 'integration',
        executableBundleDigest: digestVerificationAdapterBytes(bundleBytes),
        fixtureSetDigests: [cell.fixtureSetRef!.digest!],
        isolation: {
          lifecycle: 'ephemeral',
          network: 'fixture-only',
          liveEgress: false,
        },
        artifacts: [
          ...artifacts,
          {
            id: artifactId('trace'),
            kind: 'trace',
            mediaType: VERIFICATION_TRACE_MEDIA_TYPE,
            bytes: trace,
          },
        ],
      });
      entries = [
        entry(
          FIRST_PARTY_VERIFICATION_INPUT_IDS.integrationExecutable,
          'executable-snapshot',
          EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
          bundleBytes
        ),
      ];
      factory = createIntegrationVerificationAdapter;
    } else {
      resultBytes = encodeTestVerificationResult({
        ...base,
        checkKind: 'unit',
        artifacts,
      });
      entries = [];
      factory = createUnitVerificationAdapter;
    }
    entries.push(
      entry(
        FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
        'test-report',
        EXECUTION_TEST_REPORT_MEDIA_TYPE,
        report
      ),
      entry(
        FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
        'test-report',
        TEST_VERIFICATION_RESULT_MEDIA_TYPE,
        resultBytes
      )
    );
  } else
    throw new Error(
      'G3 static cell requires an adopted production material adapter.'
    );
  const controller = createVerificationAbortController();
  const abort = () => controller.abort('ordinary-agent-cancelled');
  input.signal.addEventListener('abort', abort, { once: true });
  if (input.signal.aborted) abort();
  const byId = new Map(entries.map((value) => [value.ref.id, value]));
  const controls = {
    profileDigest: cell.controlProfileRef.digest!,
    capabilityIds: [],
    isolatedToolchainReceiptDigest: toolchain.authorityReceipt.receiptDigest,
  };
  const lifecycleContext: VerificationAdapterLifecycleContext = {
    registrySnapshotDigest: input.registry.snapshotDigest,
    adapter: cell.adapter,
    runtimeZone: 'node',
    runtimeEnvironmentDigest: digestVerificationValue(
      toolchain.authorityReceipt
    ),
    inputDigest: cell.inputDigest,
    executableSnapshotDigest: snapshot.contentDigest,
    controlProfileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: cell.fixtureSetRef?.digest
      ? [cell.fixtureSetRef.digest]
      : [],
    controlCapabilityIds: [],
    controlCapabilitySnapshotDigest: digestVerificationValue({
      capabilityIds: [],
      provider: toolchain.authorityReceipt.provider,
    }),
    appliedControlDigest: digestVerificationValue(controls),
    inputRefs: entries.map(({ ref }) => ref),
    inputResolver: {
      async read(ref) {
        const value = byId.get(ref.id);
        if (!value || value.ref.digest !== ref.digest)
          throw new Error('G3 input changed.');
        return new Uint8Array(value.bytes);
      },
    },
    artifactStaging: input.staging.staging,
    abortSignal: controller.signal,
  };
  try {
    const lifecycle = await executeVerificationAdapterLifecycle({
      factory,
      registrySnapshot: input.registry,
      planDigest: context.plan.planDigest,
      cell,
      attemptId: input.attemptId,
      generation: input.generation,
      providerKind: 'remote',
      context: lifecycleContext,
      artifactRetirement: input.staging.retirement,
    });
    if (lifecycle.status !== 'reported')
      throw new Error(`G3 adapter ended ${lifecycle.status}.`);
    const completedAt = new Date().toISOString();
    const sourceTraces: VerificationEvidenceSourceTrace[] = [
      ...new Map(
        snapshot.files
          .flatMap(({ sourceTrace }) => sourceTrace ?? [])
          .map((trace) => [digestVerificationValue(trace), trace])
      ).values(),
    ];
    const artifacts = new Map(
      lifecycle.stagedArtifacts.map((artifact) => [
        artifact.id,
        input.staging.read(artifact.stagingArtifactId),
      ])
    );
    return {
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
          runtimeEnvironmentDigest: lifecycleContext.runtimeEnvironmentDigest,
          executableSnapshotDigest: snapshot.contentDigest,
          controlProfileDigest: lifecycleContext.controlProfileDigest,
          fixtureSetDigests: lifecycleContext.fixtureSetDigests,
          controlCapabilityIds: [],
          controlCapabilitySnapshotDigest:
            lifecycleContext.controlCapabilitySnapshotDigest,
          appliedControlDigest: lifecycleContext.appliedControlDigest,
          inputRefs: lifecycleContext.inputRefs,
          ...(scenario
            ? { scenarioProgramDigest: scenario.program.programDigest }
            : {}),
        },
        report: lifecycle.report,
        ...(scenario ? { scenario: scenario.scenario } : {}),
        run: {
          runId: context.run.runId,
          providerId: context.run.providerId,
          runtimeZone: 'node',
          operatingSystemIdentity: toolchain.authorityReceipt.provider,
          devicePixelRatio: 1,
          timezone: 'UTC',
          fontSetDigest: digestVerificationValue({
            fontSet: 'static-no-browser',
          }),
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
        sourceTraces,
        dependencyLockDigest: toolchain.authorityReceipt.toolchain.lockDigest,
        provenance: {
          origin: 'remote',
          producerId: 'prodivix.agent-runtime-g3',
          providerId: context.run.providerId,
          issuedAt: startedAt,
        },
        redaction: {
          policyId: 'redaction:callback-canary-v1',
          scannerSetDigest: input.scannerDigest,
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
  } finally {
    input.signal.removeEventListener('abort', abort);
  }
};
