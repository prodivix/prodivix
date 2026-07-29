import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  type VerificationAbortSignal,
  type VerificationAdapterFactory,
  type VerificationAdapterInputRef,
  type VerificationAdapterLifecycleContext,
  type VerificationAdapterLifecycleResult,
  type VerificationAdapterRegistrySnapshot,
  type VerificationArtifactKind,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createBuildVerificationAdapter,
  createDiagnosticsVerificationAdapter,
  createIntegrationVerificationAdapter,
  createUnitVerificationAdapter,
  digestVerificationAdapterBytes,
} from '@prodivix/verification-adapters';
import { createGoldenG3V6ArtifactTransport } from './goldenG3V6ArtifactTransport';
import {
  createGoldenG3V6AttemptCleanupScope,
  throwGoldenG3V6AttemptFailure,
} from './goldenG3V6BrowserAttemptLifecycle';
import { GOLDEN_G3_V6_ADAPTERS } from './goldenG3V6AdapterRegistryFixture';
import { GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS } from './goldenG3V6ProductionSecurityBundle';
import {
  createGoldenG3V6StaticInputs,
  type GoldenG3V6FrameworkToolchainEvidence,
  type GoldenG3V6StaticInputEntry,
  type GoldenG3V6StaticInputSet,
  type GoldenG3V6StaticToolchainEvidence,
} from './goldenG3V6StaticAdapterInputs';
import type { GoldenControlledStaticToolchainProjectionAuthority } from './generatedProjectToolchainProjectionAuthority';

export type {
  GoldenG3V6FrameworkToolchainEvidence,
  GoldenG3V6StaticToolchainEvidence,
} from './goldenG3V6StaticAdapterInputs';

export type GoldenG3V6StaticAdapterAttempt = Readonly<{
  attemptId: string;
  cellId: string;
  result: VerificationAdapterLifecycleResult;
  executableSnapshotDigest: string;
  runtimeEnvironmentDigest: string;
  toolchainAuthorityReceiptDigest: string;
  toolchainProjectionAuthorityReceiptDigest: string;
  toolchainProjectionAuthority: GoldenControlledStaticToolchainProjectionAuthority;
  workspaceDiagnosticProjectionReceiptDigest: string | null;
  workspaceDiagnosticProjectionAuthority:
    GoldenG3V6FrameworkToolchainEvidence['diagnosticProjection'] | null;
  artifactKinds: readonly VerificationArtifactKind[];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  retirementEvidenceDigest: string;
}>;

export type GoldenG3V6StaticRuntimeControlEvidence = Readonly<{
  kind: 'static-adapter-no-runtime-controls';
  controlCapabilityIds: readonly [];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  evidenceDigest: string;
}>;

export type GoldenG3V6StaticArtifactRetirementEvidence = Readonly<{
  attemptCount: 8;
  retiredAttemptCount: 8;
  retirementReceiptCount: 8;
  retirementCallCount: 8;
  duplicateRetirementCount: 0;
  lateWriteRejectionCount: 0;
  activeAttemptCount: 0;
  activeArtifactCount: 0;
  inspectedArtifactCount: 10;
  forbiddenMarkerCount: 1;
  forbiddenMarkerHitCount: 0;
  artifactKinds: readonly ['build-log', 'coverage-summary', 'trace'];
  evidenceDigest: string;
}>;

export type GoldenG3V6StaticAdapterExecutionEvidence = Readonly<{
  attempts: readonly GoldenG3V6StaticAdapterAttempt[];
  runtimeControl: GoldenG3V6StaticRuntimeControlEvidence;
  artifactRetirement: GoldenG3V6StaticArtifactRetirementEvidence;
}>;

const STATIC_FACTORIES = new Map<string, VerificationAdapterFactory>([
  ['adapter:g3-v6:diagnostics', createDiagnosticsVerificationAdapter],
  ['adapter:g3-v6:build', createBuildVerificationAdapter],
  ['adapter:g3-v6:unit', createUnitVerificationAdapter],
  ['adapter:g3-v6:integration', createIntegrationVerificationAdapter],
]);

const STATIC_NO_RUNTIME_CONTROL_DESCRIPTOR = Object.freeze({
  format: 'prodivix.golden-g3-v6-static-runtime-control',
  version: 1,
  kind: 'static-adapter-no-runtime-controls',
  owner: '@prodivix/verification-adapters',
  controlCapabilityIds: Object.freeze([] as const),
});

const STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST = digestVerificationValue({
  format: 'prodivix.verification-control-capability-snapshot',
  version: 1,
  descriptor: STATIC_NO_RUNTIME_CONTROL_DESCRIPTOR,
});

const STATIC_APPLIED_CONTROL_DIGEST = digestVerificationValue({
  format: 'prodivix.verification-applied-control',
  version: 1,
  descriptor: STATIC_NO_RUNTIME_CONTROL_DESCRIPTOR,
  applied: false,
});

const inactiveSignal = (): VerificationAbortSignal =>
  Object.freeze({
    aborted: false,
    subscribe: () => () => undefined,
  });

const inputRef = (
  entry: GoldenG3V6StaticInputEntry
): VerificationAdapterInputRef =>
  Object.freeze({
    id: entry.id,
    kind: entry.kind,
    digest: digestVerificationAdapterBytes(entry.bytes),
    size: entry.bytes.byteLength,
    mediaType: entry.mediaType,
  });

const createStaticContext = (
  cell: VerificationPlanCell,
  registry: VerificationAdapterRegistrySnapshot,
  inputSet: GoldenG3V6StaticInputSet,
  artifactStaging: VerificationAdapterLifecycleContext['artifactStaging']
): VerificationAdapterLifecycleContext => {
  const entries = inputSet.entries;
  const byId = new Map(entries.map((entry) => [entry.id, entry.bytes]));
  return Object.freeze({
    registrySnapshotDigest: registry.snapshotDigest,
    adapter: cell.adapter,
    runtimeZone: 'node',
    runtimeEnvironmentDigest: inputSet.runtimeEnvironmentDigest,
    inputDigest: cell.inputDigest,
    executableSnapshotDigest: inputSet.executableSnapshotDigest,
    controlProfileDigest: cell.controlProfileRef.digest!,
    fixtureSetDigests: Object.freeze(
      cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
    ),
    controlCapabilityIds:
      STATIC_NO_RUNTIME_CONTROL_DESCRIPTOR.controlCapabilityIds,
    controlCapabilitySnapshotDigest: STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST,
    appliedControlDigest: STATIC_APPLIED_CONTROL_DIGEST,
    inputRefs: Object.freeze(entries.map(inputRef)),
    inputResolver: Object.freeze({
      read: async (ref: VerificationAdapterInputRef) => {
        const bytes = byId.get(ref.id);
        if (!bytes) {
          throw new Error(`Golden V6 input "${ref.id}" is unavailable.`);
        }
        return new Uint8Array(bytes);
      },
    }),
    artifactStaging,
    abortSignal: inactiveSignal(),
  });
};

const executeStaticAttempt = async (input: {
  plan: VerificationPlan;
  cell: VerificationPlanCell;
  toolchainEvidence: GoldenG3V6StaticToolchainEvidence;
  registry: VerificationAdapterRegistrySnapshot;
  artifactTransport: ReturnType<typeof createGoldenG3V6ArtifactTransport>;
}): Promise<GoldenG3V6StaticAdapterAttempt> => {
  const { plan, cell, toolchainEvidence, registry, artifactTransport } = input;
  const attemptId = `attempt:${digestVerificationValue({
    cellId: cell.id,
    providerKind: cell.surface,
  }).slice('sha256-'.length)}`;
  const cleanup = createGoldenG3V6AttemptCleanupScope();
  let retirementEvidenceDigest: string | undefined;
  const coordinates = Object.freeze({
    planDigest: plan.planDigest,
    cellId: cell.id,
    attemptId,
    generation: 1,
  });
  cleanup.defer('artifact-retirement-attestation', async () => {
    if (result?.status === 'reported') {
      const retirement = await artifactTransport.retirement.retireAttempt(
        coordinates,
        inactiveSignal()
      );
      if (retirement.status !== 'retired') {
        throw new Error(
          `Golden V6 static attempt "${attemptId}" did not perform its first artifact retirement.`
        );
      }
    }
    retirementEvidenceDigest =
      artifactTransport.readRetirementReceipt(coordinates).receiptDigest;
  });
  let result: VerificationAdapterLifecycleResult | undefined;
  let inputSet: GoldenG3V6StaticInputSet | undefined;
  let primaryError: unknown;
  try {
    const factory = STATIC_FACTORIES.get(cell.adapter.adapterId);
    if (!factory) {
      throw new Error(
        `Golden V6 static cell "${cell.id}" has no first-party factory.`
      );
    }
    inputSet = createGoldenG3V6StaticInputs(cell, toolchainEvidence);
    result = await executeVerificationAdapterLifecycle({
      factory,
      registrySnapshot: registry,
      planDigest: plan.planDigest,
      cell,
      attemptId,
      generation: 1,
      providerKind: cell.surface === 'export' ? 'export' : 'ci',
      context: createStaticContext(
        cell,
        registry,
        inputSet,
        artifactTransport.staging
      ),
      artifactRetirement: artifactTransport.retirement,
    });
    if (
      result.status === 'reported' &&
      (result.invocation.controlCapabilitySnapshotDigest !==
        STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST ||
        result.invocation.appliedControlDigest !==
          STATIC_APPLIED_CONTROL_DIGEST)
    ) {
      throw new Error(
        `Golden V6 static attempt "${attemptId}" drifted from the empty runtime-control descriptor.`
      );
    }
  } catch (error) {
    primaryError = error;
  }
  const cleanupErrors = await cleanup.runAll();
  throwGoldenG3V6AttemptFailure(attemptId, primaryError, cleanupErrors);
  if (!result || !inputSet || !retirementEvidenceDigest) {
    throw new Error(
      `Golden V6 static attempt "${attemptId}" produced incomplete lifecycle evidence.`
    );
  }
  const workspaceDiagnosticProjectionAuthority =
    cell.checkKind === 'diagnostics'
      ? cell.frameworkTarget === 'react-vite' ||
        cell.frameworkTarget === 'vue-vite'
        ? toolchainEvidence[cell.frameworkTarget].diagnosticProjection
        : (() => {
            throw new Error(
              `Golden V6 diagnostic cell "${cell.id}" has no Compiler projection authority.`
            );
          })()
      : null;
  if (
    cell.frameworkTarget !== 'react-vite' &&
    cell.frameworkTarget !== 'vue-vite'
  ) {
    throw new Error(
      `Golden V6 static attempt "${cell.id}" has no controlled framework toolchain.`
    );
  }
  const toolchainProjectionAuthority =
    toolchainEvidence[cell.frameworkTarget].toolchain.projectionAuthority;
  return Object.freeze({
    attemptId,
    cellId: cell.id,
    result,
    executableSnapshotDigest: inputSet.executableSnapshotDigest,
    runtimeEnvironmentDigest: inputSet.runtimeEnvironmentDigest,
    toolchainAuthorityReceiptDigest: inputSet.toolchainAuthorityReceiptDigest,
    toolchainProjectionAuthorityReceiptDigest:
      inputSet.toolchainProjectionAuthorityReceiptDigest,
    toolchainProjectionAuthority,
    workspaceDiagnosticProjectionReceiptDigest:
      inputSet.workspaceDiagnosticProjectionReceiptDigest,
    workspaceDiagnosticProjectionAuthority,
    artifactKinds: Object.freeze(
      result.status === 'reported'
        ? result.stagedArtifacts
            .map(({ kind }) => kind)
            .sort(compareUnicodeCodePoints)
        : []
    ),
    controlCapabilitySnapshotDigest: STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST,
    appliedControlDigest: STATIC_APPLIED_CONTROL_DIGEST,
    retirementEvidenceDigest,
  });
};

/**
 * Runs every non-browser V6 cell through the actual first-party static
 * factories, waits for all eight lifecycles, and retires every staged byte.
 */
export const executeGoldenG3V6StaticAdapterCells = async (
  plan: VerificationPlan,
  toolchainEvidence: GoldenG3V6StaticToolchainEvidence,
  registry: VerificationAdapterRegistrySnapshot = createVerificationAdapterRegistrySnapshot(
    GOLDEN_G3_V6_ADAPTERS
  )
): Promise<GoldenG3V6StaticAdapterExecutionEvidence> => {
  if (plan.status !== 'ready') {
    throw new Error('Golden V6 static execution requires a ready Plan.');
  }
  const cells = plan.cells.filter(
    (cell) =>
      cell.requirement === 'required' && cell.browserEngine === undefined
  );
  const artifactTransport = createGoldenG3V6ArtifactTransport({
    forbiddenTextMarkers: GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS,
  });
  const settled = await Promise.allSettled(
    cells.map((cell) =>
      executeStaticAttempt({
        plan,
        cell,
        toolchainEvidence,
        registry,
        artifactTransport,
      })
    )
  );
  const failures = settled.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  const transportSnapshot = artifactTransport.snapshot();
  if (
    transportSnapshot.activeAttemptCount !== 0 ||
    transportSnapshot.activeArtifactCount !== 0
  ) {
    failures.push(
      new Error(
        'Golden V6 static adapter execution left active attempt artifacts.'
      )
    );
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Golden V6 static adapter execution did not quiesce every attempt.'
    );
  }
  const attempts = Object.freeze(
    settled.map(
      (result) =>
        (result as PromiseFulfilledResult<GoldenG3V6StaticAdapterAttempt>).value
    )
  );
  const artifactKinds = Object.freeze(
    [...new Set(attempts.flatMap((attempt) => attempt.artifactKinds))].sort(
      compareUnicodeCodePoints
    )
  );
  const stableRetirementEvidence = Object.freeze({
    format: 'prodivix.golden-g3-v6-static-artifact-retirement',
    version: 1,
    attemptCount: transportSnapshot.attemptCount,
    retiredAttemptCount: transportSnapshot.retiredAttemptCount,
    retirementReceiptCount: transportSnapshot.retirementReceiptCount,
    retirementCallCount: transportSnapshot.retirementCallCount,
    duplicateRetirementCount: transportSnapshot.duplicateRetirementCount,
    lateWriteRejectionCount: transportSnapshot.lateWriteRejectionCount,
    activeAttemptCount: transportSnapshot.activeAttemptCount,
    activeArtifactCount: transportSnapshot.activeArtifactCount,
    inspectedArtifactCount: transportSnapshot.inspectedArtifactCount,
    forbiddenMarkerCount: GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS.length,
    forbiddenMarkerHitCount: transportSnapshot.forbiddenMarkerHitCount,
    artifactKinds,
    attempts: attempts.map(
      ({ cellId, artifactKinds: kinds, retirementEvidenceDigest }) =>
        Object.freeze({
          cellId,
          artifactKinds: kinds,
          retirementEvidenceDigest,
        })
    ),
  });
  if (
    transportSnapshot.attemptCount !== 8 ||
    transportSnapshot.retiredAttemptCount !== 8 ||
    transportSnapshot.retirementReceiptCount !== 8 ||
    transportSnapshot.retirementCallCount !== 8 ||
    transportSnapshot.duplicateRetirementCount !== 0 ||
    transportSnapshot.lateWriteRejectionCount !== 0 ||
    transportSnapshot.inspectedArtifactCount !== 10 ||
    transportSnapshot.forbiddenMarkerHitCount !== 0 ||
    GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS.length !== 1 ||
    artifactKinds.length !== 3 ||
    artifactKinds[0] !== 'build-log' ||
    artifactKinds[1] !== 'coverage-summary' ||
    artifactKinds[2] !== 'trace'
  ) {
    throw new Error(
      `Golden V6 static artifact retirement did not cover the exact clean artifact set: ${canonicalJsonText(
        {
          artifactKinds,
          forbiddenMarkerCount: GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS.length,
          transport: transportSnapshot,
        }
      )}`
    );
  }
  return Object.freeze({
    attempts,
    runtimeControl: Object.freeze({
      kind: 'static-adapter-no-runtime-controls',
      controlCapabilityIds: Object.freeze([] as const),
      controlCapabilitySnapshotDigest:
        STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST,
      appliedControlDigest: STATIC_APPLIED_CONTROL_DIGEST,
      evidenceDigest: digestVerificationValue({
        format: 'prodivix.golden-g3-v6-static-runtime-control-evidence',
        version: 1,
        descriptor: STATIC_NO_RUNTIME_CONTROL_DESCRIPTOR,
        controlCapabilitySnapshotDigest:
          STATIC_CONTROL_CAPABILITY_SNAPSHOT_DIGEST,
        appliedControlDigest: STATIC_APPLIED_CONTROL_DIGEST,
      }),
    }),
    artifactRetirement: Object.freeze({
      attemptCount: 8,
      retiredAttemptCount: 8,
      retirementReceiptCount: 8,
      retirementCallCount: 8,
      duplicateRetirementCount: 0,
      lateWriteRejectionCount: 0,
      activeAttemptCount: 0,
      activeArtifactCount: 0,
      inspectedArtifactCount: 10,
      forbiddenMarkerCount: 1,
      forbiddenMarkerHitCount: 0,
      artifactKinds: Object.freeze([
        'build-log',
        'coverage-summary',
        'trace',
      ] as const),
      evidenceDigest: digestVerificationValue(stableRetirementEvidence),
    }),
  });
};
