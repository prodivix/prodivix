import {
  digestVerificationValue,
  normalizeVerificationCheckReportCandidate,
  type VerificationPlan,
} from '@prodivix/verification';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { createFirstPartyBrowserVerificationAdapterFactory } from '@prodivix/verification-browser';
import { createGoldenG3V6ArtifactTransport } from './goldenG3V6ArtifactTransport';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import {
  createGoldenG3V6ControlledMatrixManifest,
  type GoldenG3V6ControlledMatrixManifest,
  type GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import { GOLDEN_G3_V6_ADAPTER_REGISTRY_DIGEST } from './goldenG3V6AdapterRegistryFixture';
import {
  executeGoldenG3V6BrowserAttempt,
  type GoldenG3V6BrowserAttempt,
  type GoldenG3V6ReportedLifecycleResult,
} from './goldenG3V6BrowserAttemptExecution';
import {
  createGoldenG3V6AttemptCleanupScope,
  throwGoldenG3V6AttemptFailure,
} from './goldenG3V6BrowserAttemptLifecycle';
import {
  createGoldenG3V6SecurityAuthorityRegistry,
  createGoldenG3V6TargetLeaseRegistry,
  type GoldenG3V6SecurityAuthorityRegistry,
  type GoldenG3V6TargetLeaseRegistry,
} from './goldenG3V6BrowserMatrixPorts';
import {
  disposeGoldenG3V6Frameworks,
  goldenG3V6FrameworkForCell,
  prepareGoldenG3V6Frameworks,
} from './goldenG3V6BrowserMatrixProjects';
import {
  GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
  assertGoldenG3V6BrowserIdentityRegistry,
} from './goldenG3V6BrowserIdentityFixture';
import { GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST } from './goldenG3V6ControlledDimensionManifest';
import {
  createGoldenG3V6ControlledEnvironmentEvidence,
  type GoldenG3V6ControlledEnvironmentEvidence,
} from './goldenG3V6ControlledEnvironmentEvidence';
import {
  verifyGoldenG3V6ControlledDimensions,
  type GoldenG3V6ControlledDimensionVerificationEvidence,
} from './goldenG3V6ControlledDimensionVerification';
import {
  createGoldenG3V6RuntimeControlRegistry,
  type GoldenG3V6RuntimeControlRegistry,
} from './goldenG3V6RuntimeControlEvidence';
import {
  collectGoldenG3V6CanonicalAttemptAuthority,
  createGoldenG3V6CanonicalAttemptManifest,
  type GoldenG3V6CanonicalAttemptAuthority,
  type GoldenG3V6CanonicalAttemptManifest,
} from './goldenG3V6CanonicalAttemptManifest';
import {
  executeGoldenG3V6StaticAdapterCells,
  type GoldenG3V6StaticAdapterAttempt,
  type GoldenG3V6StaticArtifactRetirementEvidence,
  type GoldenG3V6StaticRuntimeControlEvidence,
} from './goldenG3V6StaticAdapterExecution';
import { assertGoldenControlledStaticToolchainProjectionAuthority } from './generatedProjectToolchainProjectionAuthority';
import {
  GOLDEN_G3_V6_VISUAL_BASELINE_ASSET,
  GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST,
  GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST_DIGEST,
  GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST,
  createGoldenG3V6VisualBaselineAssetPort,
} from './goldenG3V6VisualBaseline';

const EXPECTED_BROWSER_CELL_COUNT = 58;
const EXPECTED_BROWSER_ATTEMPT_COUNT = 72;
const EXPECTED_STATIC_ATTEMPT_COUNT = 8;
const EXPECTED_TOTAL_ATTEMPT_COUNT = 80;

export type GoldenG3V6MatrixStatusCounters = Readonly<{
  reported: number;
  passed: number;
  blocked: number;
  unsupported: number;
  skipped: number;
  todo: number;
  failed: number;
  residual: number;
}>;

export type GoldenG3V6RuntimeControlAggregateEvidence = Readonly<{
  attemptCount: 72;
  initialAttestationCount: 72;
  terminalAttestationCount: 72;
  cleanReleaseCount: 72;
  retiredAttemptCount: 72;
  compilerFixtureProjectionAttemptCount: 64;
  productionNoFixtureAttemptCount: 8;
  fixtureRuntimeDispatchCount: 64;
  fixtureRequestCount: 64;
  fixtureDispatchCount: 64;
  fixtureResponseCount: 64;
  registrySnapshot: Readonly<{
    registered: 0;
    acquired: 0;
    started: 0;
    released: 0;
    active: 0;
  }>;
  evidenceSetDigest: string;
}>;

export type GoldenG3V6BrowserArtifactRetirementEvidence = Readonly<{
  attemptCount: 72;
  retirementReceiptCount: 72;
  retirementCallCount: 72;
  duplicateRetirementCount: 0;
  lateWriteRejectionCount: 0;
  activeAttemptCount: 0;
  activeArtifactCount: 0;
  evidenceSetDigest: string;
}>;

const EXPECTED_STATUS_COUNTERS: GoldenG3V6MatrixStatusCounters = Object.freeze({
  reported: 80 as const,
  passed: 80 as const,
  blocked: 0 as const,
  unsupported: 0 as const,
  skipped: 0 as const,
  todo: 0 as const,
  failed: 0 as const,
  residual: 0 as const,
});

export type GoldenG3V6MatrixRowEvidence = Readonly<{
  rowId: GoldenG3V6MatrixRowManifest['id'];
  requiredCellCount: number;
  attemptCount: number;
}>;

export type GoldenG3V6ControlledAdapterMatrixEvidence = Readonly<{
  planDigest: string;
  manifestDigest: string;
  adapterRegistryDigest: string;
  browserIdentityRegistryDigest: string;
  visualIdentityManifestDigest: string;
  visualBaselineSetDigest: string;
  visualBaselineAssetDigest: string;
  visualBaselineRasterDigest: string;
  visualNormalizerDigest: string;
  controlledDimensions: GoldenG3V6ControlledDimensionVerificationEvidence;
  controlledEnvironment: GoldenG3V6ControlledEnvironmentEvidence;
  staticRuntimeControl: GoldenG3V6StaticRuntimeControlEvidence;
  staticArtifactRetirement: GoldenG3V6StaticArtifactRetirementEvidence;
  requiredCellCount: 66;
  aggregateRowCount: 8;
  browserCellCount: 58;
  browserAttemptCount: 72;
  staticAttemptCount: 8;
  totalAttemptCount: 80;
  statusCounters: GoldenG3V6MatrixStatusCounters;
  runtimeControl: GoldenG3V6RuntimeControlAggregateEvidence;
  browserArtifactRetirement: GoldenG3V6BrowserArtifactRetirementEvidence;
  attemptAuthority: GoldenG3V6CanonicalAttemptAuthority;
  attemptManifest: GoldenG3V6CanonicalAttemptManifest;
  rows: readonly GoldenG3V6MatrixRowEvidence[];
  attempts: readonly GoldenG3V6BrowserAttempt[];
  evidenceDigest: string;
}>;

const rowForCell = (
  manifest: GoldenG3V6ControlledMatrixManifest,
  cellId: string
): GoldenG3V6MatrixRowManifest => {
  const rows = manifest.rows.filter((row) =>
    row.cells.some((cell) => cell.cellId === cellId)
  );
  if (rows.length !== 1) {
    throw new Error(
      `Golden V6 cell "${cellId}" does not resolve exactly one matrix row.`
    );
  }
  return rows[0]!;
};

const assertStaticAttempts = (
  attempts: readonly GoldenG3V6StaticAdapterAttempt[]
): void => {
  if (attempts.length !== EXPECTED_STATIC_ATTEMPT_COUNT) {
    throw new Error('Golden V6 static attempt count drifted.');
  }
  for (const {
    attemptId,
    cellId,
    result,
    executableSnapshotDigest,
    runtimeEnvironmentDigest,
    toolchainAuthorityReceiptDigest,
    toolchainProjectionAuthorityReceiptDigest,
    toolchainProjectionAuthority,
    workspaceDiagnosticProjectionReceiptDigest,
    controlCapabilitySnapshotDigest,
    appliedControlDigest,
    retirementEvidenceDigest,
  } of attempts) {
    if (
      result.status !== 'reported' ||
      result.cleanup.status !== 'clean' ||
      result.report.terminal.status !== 'completed' ||
      result.report.terminal.exitCode !== 0 ||
      result.invocation.attemptId !== attemptId ||
      result.invocation.controlCapabilitySnapshotDigest !==
        controlCapabilitySnapshotDigest ||
      result.invocation.appliedControlDigest !== appliedControlDigest ||
      ![
        executableSnapshotDigest,
        runtimeEnvironmentDigest,
        toolchainAuthorityReceiptDigest,
        toolchainProjectionAuthorityReceiptDigest,
      ].every((digest) => /^sha256-[a-f0-9]{64}$/u.test(digest)) ||
      !/^sha256-[a-f0-9]{64}$/u.test(retirementEvidenceDigest)
    ) {
      throw new Error(
        `Golden V6 static attempt "${cellId}" did not complete cleanly.`
      );
    }
    assertGoldenControlledStaticToolchainProjectionAuthority(
      toolchainProjectionAuthority,
      {
        snapshotDigest: executableSnapshotDigest,
        toolchainAuthorityReceiptDigest,
        receiptDigest: toolchainProjectionAuthorityReceiptDigest,
      }
    );
    const normalized = normalizeVerificationCheckReportCandidate(result.report);
    if (
      normalized.status !== 'ready' ||
      normalized.report.verdict !== 'passed' ||
      normalized.report.outcome !== 'passed' ||
      (result.report.checkKind === 'diagnostics') !==
        (workspaceDiagnosticProjectionReceiptDigest !== null) ||
      (workspaceDiagnosticProjectionReceiptDigest !== null &&
        !/^sha256-[a-f0-9]{64}$/u.test(
          workspaceDiagnosticProjectionReceiptDigest
        ))
    ) {
      throw new Error(
        `Golden V6 static attempt "${cellId}" did not normalize to passed.`
      );
    }
  }
  const projectionDigestsByTarget = (['react-vite', 'vue-vite'] as const).map(
    (frameworkTarget) =>
      attempts.flatMap((attempt) =>
        attempt.toolchainProjectionAuthority.receipt.target.presetId ===
        frameworkTarget
          ? [attempt.toolchainProjectionAuthorityReceiptDigest]
          : []
      )
  );
  if (
    projectionDigestsByTarget.some(
      (digests) => digests.length !== 4 || new Set(digests).size !== 1
    ) ||
    new Set(projectionDigestsByTarget.flat()).size !== 2
  ) {
    throw new Error(
      'Golden V6 static attempts drifted from two exact framework projection authorities.'
    );
  }
};

const stableReportedEvidence = (
  result: GoldenG3V6ReportedLifecycleResult
): Readonly<{
  status: 'reported';
  verdict: 'passed';
  outcome: 'passed';
  reportDigest: string;
  resolvedInputSetDigest: string;
  cleanupDigest: string;
  stagedArtifactSetDigest: string;
}> => {
  const normalized = normalizeVerificationCheckReportCandidate(result.report);
  if (
    normalized.status !== 'ready' ||
    normalized.report.verdict !== 'passed' ||
    normalized.report.outcome !== 'passed'
  ) {
    throw new Error('Golden V6 stable evidence received a non-passing report.');
  }
  return Object.freeze({
    status: 'reported',
    verdict: 'passed',
    outcome: 'passed',
    reportDigest: digestVerificationValue(result.report),
    resolvedInputSetDigest: result.resolvedInputSetDigest,
    cleanupDigest: digestVerificationValue(result.cleanup),
    stagedArtifactSetDigest: digestVerificationValue(result.stagedArtifacts),
  });
};

const aggregateRows = (
  manifest: GoldenG3V6ControlledMatrixManifest,
  attempts: readonly GoldenG3V6BrowserAttempt[],
  staticAttempts: readonly GoldenG3V6StaticAdapterAttempt[]
): readonly GoldenG3V6MatrixRowEvidence[] => {
  const rows = Object.freeze(
    manifest.rows.map((row) =>
      Object.freeze({
        rowId: row.id,
        requiredCellCount: row.requiredCellCount,
        attemptCount:
          attempts.filter(({ rowId }) => rowId === row.id).length +
          staticAttempts.filter(
            ({ cellId }) => rowForCell(manifest, cellId).id === row.id
          ).length,
      })
    )
  );
  if (
    rows.reduce((total, row) => total + row.attemptCount, 0) !==
    EXPECTED_TOTAL_ATTEMPT_COUNT
  ) {
    throw new Error('Golden V6 aggregate row attempt count drifted.');
  }
  return rows;
};

const assertAttemptAggregates = (
  attempts: readonly GoldenG3V6BrowserAttempt[],
  leases: GoldenG3V6TargetLeaseRegistry,
  authorities: GoldenG3V6SecurityAuthorityRegistry,
  runtimeControls: GoldenG3V6RuntimeControlRegistry,
  artifactTransport: ReturnType<typeof createGoldenG3V6ArtifactTransport>
): void => {
  if (attempts.length !== EXPECTED_BROWSER_ATTEMPT_COUNT) {
    throw new Error(
      `Golden V6 expected ${String(EXPECTED_BROWSER_ATTEMPT_COUNT)} browser attempts, received ${String(attempts.length)}.`
    );
  }
  const securityAttempts = attempts.filter(
    ({ checkKind }) => checkKind === 'security'
  );
  if (
    securityAttempts.length !== 8 ||
    securityAttempts.some(({ securityResolutionAudit: audit }) => {
      if (
        !audit ||
        !audit.exact ||
        audit.totalResolveCount !== 3 ||
        audit.totalAttemptCount !== 3 ||
        audit.successfulRuleIds.length !== 3 ||
        audit.ruleResolutionCounts.some(({ count }) => count !== 1)
      ) {
        return true;
      }
      return Object.values(audit.failureCounts).some((count) => count !== 0);
    })
  ) {
    throw new Error(
      'Golden V6 security attempts did not resolve each of the three owner rules exactly once.'
    );
  }
  const remoteAttempts = attempts.filter(
    ({ providerMode }) => providerMode === 'remote'
  );
  if (
    remoteAttempts.length !== 14 ||
    remoteAttempts.some(
      ({ remoteEvidence, remoteCleanupEvidenceDigest }) =>
        !remoteEvidence ||
        !remoteCleanupEvidenceDigest ||
        remoteEvidence.readiness !== 'ready' ||
        remoteEvidence.health !== 'healthy' ||
        remoteEvidence.terminalCheckpoint.confirmedAfterCursor !== 5
    )
  ) {
    throw new Error(
      'Golden V6 did not execute and clean all fourteen real Remote Preview attempts.'
    );
  }
  const artifactSnapshot = artifactTransport.snapshot();
  if (
    leases.snapshot().registered !== 0 ||
    authorities.size() !== 0 ||
    Object.values(runtimeControls.snapshot()).some((count) => count !== 0) ||
    artifactSnapshot.activeAttemptCount !== 0 ||
    artifactSnapshot.activeArtifactCount !== 0
  ) {
    throw new Error(
      'Golden V6 matrix left target, authority, or artifact residual state.'
    );
  }
};

const createRuntimeControlAggregateEvidence = (
  attempts: readonly GoldenG3V6BrowserAttempt[],
  runtimeControls: GoldenG3V6RuntimeControlRegistry
): GoldenG3V6RuntimeControlAggregateEvidence => {
  const registrySnapshot = runtimeControls.snapshot();
  const evidence = attempts
    .map(({ attemptId, checkKind, providerMode, runtimeControlEvidence }) => {
      const expectedProviderKind =
        providerMode === 'standalone-export' ? 'export' : providerMode;
      const security = checkKind === 'security';
      const digestValues = [
        runtimeControlEvidence.targetLeaseBindingDigest,
        runtimeControlEvidence.executableSnapshotDigest,
        runtimeControlEvidence.originDigest,
        runtimeControlEvidence.controlCapabilitySnapshotDigest,
        runtimeControlEvidence.appliedControlDigest,
        runtimeControlEvidence.resourceManifestDigest,
        runtimeControlEvidence.fixtureBindingDigest,
        runtimeControlEvidence.fixtureProjectionAuthorityDigest,
        runtimeControlEvidence.fixtureRuntimeDispatchDigest,
        runtimeControlEvidence.fixtureDispatchLedgerDigest,
        runtimeControlEvidence.fixtureConsumptionLedgerDigest,
        runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
        ...(runtimeControlEvidence.fixtureResponseDigest
          ? [runtimeControlEvidence.fixtureResponseDigest]
          : []),
        ...(runtimeControlEvidence.fixtureResolutionDigest
          ? [runtimeControlEvidence.fixtureResolutionDigest]
          : []),
        ...(runtimeControlEvidence.remoteBindingDigest
          ? [runtimeControlEvidence.remoteBindingDigest]
          : []),
        runtimeControlEvidence.initialAttestationDigest,
        runtimeControlEvidence.terminalAttestationDigest,
        runtimeControlEvidence.cleanupCanaryDigest,
        runtimeControlEvidence.releaseReceiptDigest,
        runtimeControlEvidence.retirementEvidenceDigest,
        runtimeControlEvidence.evidenceDigest,
      ];
      if (
        runtimeControlEvidence.attemptId !== attemptId ||
        runtimeControlEvidence.generation !== 1 ||
        runtimeControlEvidence.providerKind !== expectedProviderKind ||
        (security
          ? runtimeControlEvidence.fixtureProjectionMode !==
              'production-no-fixture' ||
            runtimeControlEvidence.fixtureRuntimeDispatchCount !== 0 ||
            runtimeControlEvidence.fixtureRequestCount !== 0 ||
            runtimeControlEvidence.fixtureDispatchCount !== 0 ||
            runtimeControlEvidence.fixtureResponseCount !== 0 ||
            runtimeControlEvidence.fixtureResponseDigest !== null ||
            runtimeControlEvidence.fixtureResolutionDigest !== null ||
            runtimeControlEvidence.fixtureDispatchLedgerDigest !==
              digestVerificationValue([]) ||
            runtimeControlEvidence.fixtureConsumptionLedgerDigest !==
              digestVerificationValue([])
          : runtimeControlEvidence.fixtureProjectionMode !==
              'compiler-auth-fixture' ||
            runtimeControlEvidence.fixtureRuntimeDispatchCount !== 1 ||
            runtimeControlEvidence.fixtureRequestCount !== 1 ||
            runtimeControlEvidence.fixtureDispatchCount !== 1 ||
            runtimeControlEvidence.fixtureResponseCount !== 1 ||
            runtimeControlEvidence.fixtureResponseDigest === null ||
            runtimeControlEvidence.fixtureResolutionDigest === null) ||
        (providerMode === 'remote') !==
          (runtimeControlEvidence.remoteBindingDigest !== undefined) ||
        digestValues.some((digest) => !/^sha256-[a-f0-9]{64}$/u.test(digest))
      ) {
        throw new Error(
          `Golden V6 runtime-control evidence for "${attemptId}" drifted from its attempt identity.`
        );
      }
      return Object.freeze({
        attemptId,
        providerKind: runtimeControlEvidence.providerKind,
        providerId: runtimeControlEvidence.providerId,
        leaseId: runtimeControlEvidence.leaseId,
        targetLeaseBindingDigest:
          runtimeControlEvidence.targetLeaseBindingDigest,
        executableSnapshotDigest:
          runtimeControlEvidence.executableSnapshotDigest,
        originDigest: runtimeControlEvidence.originDigest,
        controlCapabilitySnapshotDigest:
          runtimeControlEvidence.controlCapabilitySnapshotDigest,
        appliedControlDigest: runtimeControlEvidence.appliedControlDigest,
        resourceManifestDigest: runtimeControlEvidence.resourceManifestDigest,
        fixtureBindingDigest: runtimeControlEvidence.fixtureBindingDigest,
        fixtureProjectionMode: runtimeControlEvidence.fixtureProjectionMode,
        fixtureProjectionAuthorityDigest:
          runtimeControlEvidence.fixtureProjectionAuthorityDigest,
        fixtureRuntimeDispatchCount:
          runtimeControlEvidence.fixtureRuntimeDispatchCount,
        fixtureRuntimeDispatchDigest:
          runtimeControlEvidence.fixtureRuntimeDispatchDigest,
        fixtureRequestCount: runtimeControlEvidence.fixtureRequestCount,
        fixtureDispatchCount: runtimeControlEvidence.fixtureDispatchCount,
        fixtureResponseCount: runtimeControlEvidence.fixtureResponseCount,
        fixtureDispatchLedgerDigest:
          runtimeControlEvidence.fixtureDispatchLedgerDigest,
        fixtureResponseDigest: runtimeControlEvidence.fixtureResponseDigest,
        fixtureResolutionDigest: runtimeControlEvidence.fixtureResolutionDigest,
        fixtureConsumptionLedgerDigest:
          runtimeControlEvidence.fixtureConsumptionLedgerDigest,
        fixtureRuntimeConsumptionBindingDigest:
          runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
        remoteBindingDigest: runtimeControlEvidence.remoteBindingDigest ?? null,
        initialAttestationDigest:
          runtimeControlEvidence.initialAttestationDigest,
        terminalAttestationDigest:
          runtimeControlEvidence.terminalAttestationDigest,
        cleanupCanaryDigest: runtimeControlEvidence.cleanupCanaryDigest,
        releaseReceiptDigest: runtimeControlEvidence.releaseReceiptDigest,
        retirementEvidenceDigest:
          runtimeControlEvidence.retirementEvidenceDigest,
        evidenceDigest: runtimeControlEvidence.evidenceDigest,
      });
    })
    .sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    );
  const uniqueAttemptIds = new Set(evidence.map(({ attemptId }) => attemptId));
  const uniqueEvidenceDigests = new Set(
    evidence.map(({ evidenceDigest }) => evidenceDigest)
  );
  const compilerFixtureProjectionAttemptCount = evidence.filter(
    ({ fixtureProjectionMode }) =>
      fixtureProjectionMode === 'compiler-auth-fixture'
  ).length;
  const productionNoFixtureAttemptCount = evidence.filter(
    ({ fixtureProjectionMode }) =>
      fixtureProjectionMode === 'production-no-fixture'
  ).length;
  const fixtureRuntimeDispatchCount = evidence.reduce(
    (count, attempt) => count + attempt.fixtureRuntimeDispatchCount,
    0
  );
  const fixtureRequestCount = evidence.reduce(
    (count, attempt) => count + attempt.fixtureRequestCount,
    0
  );
  const fixtureDispatchCount = evidence.reduce(
    (count, attempt) => count + attempt.fixtureDispatchCount,
    0
  );
  const fixtureResponseCount = evidence.reduce(
    (count, attempt) => count + attempt.fixtureResponseCount,
    0
  );
  if (
    evidence.length !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    uniqueAttemptIds.size !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    uniqueEvidenceDigests.size !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    compilerFixtureProjectionAttemptCount !== 64 ||
    productionNoFixtureAttemptCount !== 8 ||
    fixtureRuntimeDispatchCount !== 64 ||
    fixtureRequestCount !== 64 ||
    fixtureDispatchCount !== 64 ||
    fixtureResponseCount !== 64 ||
    Object.values(registrySnapshot).some((count) => count !== 0)
  ) {
    throw new Error(
      'Golden V6 runtime-control aggregate evidence is incomplete or active.'
    );
  }
  return Object.freeze({
    attemptCount: 72,
    initialAttestationCount: 72,
    terminalAttestationCount: 72,
    cleanReleaseCount: 72,
    retiredAttemptCount: 72,
    compilerFixtureProjectionAttemptCount: 64,
    productionNoFixtureAttemptCount: 8,
    fixtureRuntimeDispatchCount: 64,
    fixtureRequestCount: 64,
    fixtureDispatchCount: 64,
    fixtureResponseCount: 64,
    registrySnapshot: Object.freeze({
      registered: 0,
      acquired: 0,
      started: 0,
      released: 0,
      active: 0,
    }),
    evidenceSetDigest: digestVerificationValue({
      format: 'prodivix.golden-g3-v6-runtime-control-evidence-set',
      version: 1,
      attempts: evidence,
      registrySnapshot,
    }),
  });
};

const createBrowserArtifactRetirementEvidence = (
  plan: VerificationPlan,
  attempts: readonly GoldenG3V6BrowserAttempt[],
  artifactTransport: ReturnType<typeof createGoldenG3V6ArtifactTransport>
): GoldenG3V6BrowserArtifactRetirementEvidence => {
  const snapshot = artifactTransport.snapshot();
  const receipts = attempts
    .map(({ attemptId, cellId, artifactRetirementEvidenceDigest }) => {
      const receipt = artifactTransport.readRetirementReceipt({
        planDigest: plan.planDigest,
        cellId,
        attemptId,
        generation: 1,
      });
      if (
        receipt.receiptDigest !== artifactRetirementEvidenceDigest ||
        receipt.planDigest !== plan.planDigest ||
        receipt.cellId !== cellId ||
        receipt.attemptId !== attemptId ||
        receipt.generation !== 1 ||
        receipt.postState.writable !== false ||
        receipt.postState.activeArtifactCount !== 0
      ) {
        throw new Error(
          `Golden V6 artifact retirement receipt for "${attemptId}" drifted.`
        );
      }
      return Object.freeze({
        attemptId,
        receiptDigest: receipt.receiptDigest,
        retiredArtifactCount: receipt.retiredArtifactCount,
      });
    })
    .sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    );
  if (
    snapshot.attemptCount !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    snapshot.retiredAttemptCount !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    snapshot.retirementReceiptCount !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    snapshot.retirementCallCount !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    snapshot.duplicateRetirementCount !== 0 ||
    snapshot.lateWriteRejectionCount !== 0 ||
    snapshot.activeAttemptCount !== 0 ||
    snapshot.activeArtifactCount !== 0 ||
    receipts.length !== EXPECTED_BROWSER_ATTEMPT_COUNT ||
    new Set(receipts.map(({ receiptDigest }) => receiptDigest)).size !==
      EXPECTED_BROWSER_ATTEMPT_COUNT
  ) {
    throw new Error(
      'Golden V6 browser artifact retirement did not produce exactly one clean first receipt per attempt.'
    );
  }
  return Object.freeze({
    attemptCount: 72,
    retirementReceiptCount: 72,
    retirementCallCount: 72,
    duplicateRetirementCount: 0,
    lateWriteRejectionCount: 0,
    activeAttemptCount: 0,
    activeArtifactCount: 0,
    evidenceSetDigest: digestVerificationValue({
      format: 'prodivix.golden-g3-v6-browser-artifact-retirement-evidence-set',
      version: 1,
      receipts,
      snapshot,
    }),
  });
};

const createStableMatrixEvidence = (input: {
  plan: VerificationPlan;
  manifest: GoldenG3V6ControlledMatrixManifest;
  controlledDimensions: GoldenG3V6ControlledDimensionVerificationEvidence;
  controlledEnvironment: GoldenG3V6ControlledEnvironmentEvidence;
  rows: readonly GoldenG3V6MatrixRowEvidence[];
  attempts: readonly GoldenG3V6BrowserAttempt[];
  staticAttempts: readonly GoldenG3V6StaticAdapterAttempt[];
  staticRuntimeControl: GoldenG3V6StaticRuntimeControlEvidence;
  staticArtifactRetirement: GoldenG3V6StaticArtifactRetirementEvidence;
  runtimeControl: GoldenG3V6RuntimeControlAggregateEvidence;
  browserArtifactRetirement: GoldenG3V6BrowserArtifactRetirementEvidence;
  attemptAuthority: GoldenG3V6CanonicalAttemptAuthority;
  attemptManifest: GoldenG3V6CanonicalAttemptManifest;
}) => {
  const attempts = input.attempts.map((attempt) =>
    Object.freeze({
      rowId: attempt.rowId,
      cellId: attempt.cellId,
      checkKind: attempt.checkKind,
      providerId: attempt.providerId,
      providerMode: attempt.providerMode,
      attemptId: attempt.attemptId,
      executableSnapshotDigest: attempt.executableSnapshotDigest,
      targetOriginDigest: attempt.targetOriginDigest,
      runtimeEnvironmentDigest: attempt.runtimeEnvironmentDigest,
      controlCapabilitySnapshotDigest: attempt.controlCapabilitySnapshotDigest,
      appliedControlDigest: attempt.appliedControlDigest,
      runtimeControlEvidenceDigest:
        attempt.runtimeControlEvidence.evidenceDigest,
      runtimeControlInitialAttestationDigest:
        attempt.runtimeControlEvidence.initialAttestationDigest,
      runtimeControlTerminalAttestationDigest:
        attempt.runtimeControlEvidence.terminalAttestationDigest,
      runtimeControlCleanupCanaryDigest:
        attempt.runtimeControlEvidence.cleanupCanaryDigest,
      runtimeControlReleaseReceiptDigest:
        attempt.runtimeControlEvidence.releaseReceiptDigest,
      runtimeControlRetirementEvidenceDigest:
        attempt.runtimeControlEvidence.retirementEvidenceDigest,
      runtimeControlResourceManifestDigest:
        attempt.runtimeControlEvidence.resourceManifestDigest,
      runtimeControlFixtureBindingDigest:
        attempt.runtimeControlEvidence.fixtureBindingDigest,
      runtimeControlFixtureProjectionMode:
        attempt.runtimeControlEvidence.fixtureProjectionMode,
      runtimeControlFixtureProjectionAuthorityDigest:
        attempt.runtimeControlEvidence.fixtureProjectionAuthorityDigest,
      runtimeControlFixtureRuntimeDispatchCount:
        attempt.runtimeControlEvidence.fixtureRuntimeDispatchCount,
      runtimeControlFixtureRuntimeDispatchDigest:
        attempt.runtimeControlEvidence.fixtureRuntimeDispatchDigest,
      runtimeControlFixtureRequestCount:
        attempt.runtimeControlEvidence.fixtureRequestCount,
      runtimeControlFixtureDispatchCount:
        attempt.runtimeControlEvidence.fixtureDispatchCount,
      runtimeControlFixtureResponseCount:
        attempt.runtimeControlEvidence.fixtureResponseCount,
      runtimeControlFixtureDispatchLedgerDigest:
        attempt.runtimeControlEvidence.fixtureDispatchLedgerDigest,
      runtimeControlFixtureResponseDigest:
        attempt.runtimeControlEvidence.fixtureResponseDigest,
      runtimeControlFixtureResolutionDigest:
        attempt.runtimeControlEvidence.fixtureResolutionDigest,
      runtimeControlFixtureConsumptionLedgerDigest:
        attempt.runtimeControlEvidence.fixtureConsumptionLedgerDigest,
      runtimeControlFixtureRuntimeConsumptionBindingDigest:
        attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
      runtimeControlRemoteBindingDigest:
        attempt.runtimeControlEvidence.remoteBindingDigest ?? null,
      artifactRetirementEvidenceDigest:
        attempt.artifactRetirementEvidenceDigest,
      ...stableReportedEvidence(attempt.result),
      remoteEvidenceDigest:
        attempt.remoteEvidence === undefined
          ? null
          : digestVerificationValue(attempt.remoteEvidence),
      remoteCleanupEvidenceDigest: attempt.remoteCleanupEvidenceDigest ?? null,
      securityBundleEvidenceDigest:
        attempt.securityBundleEvidenceDigest ?? null,
      securityResolutionAuditDigest:
        attempt.securityResolutionAudit?.auditDigest ?? null,
      securityResolutionEvidenceDigest:
        attempt.securityResolutionAudit?.evidenceDigest ?? null,
      productionFixtureAbsenceReceiptDigest:
        attempt.productionFixtureAbsenceReceiptDigest ?? null,
    })
  );
  const staticAttempts = input.staticAttempts.map(
    ({
      attemptId,
      cellId,
      result,
      executableSnapshotDigest,
      runtimeEnvironmentDigest,
      toolchainAuthorityReceiptDigest,
      toolchainProjectionAuthorityReceiptDigest,
      workspaceDiagnosticProjectionReceiptDigest,
      controlCapabilitySnapshotDigest,
      appliedControlDigest,
      retirementEvidenceDigest,
    }) => {
      if (result.status !== 'reported') {
        throw new Error(
          `Golden V6 static attempt "${cellId}" lost its report.`
        );
      }
      return Object.freeze({
        attemptId,
        cellId,
        rowId: rowForCell(input.manifest, cellId).id,
        executableSnapshotDigest,
        runtimeEnvironmentDigest,
        toolchainAuthorityReceiptDigest,
        toolchainProjectionAuthorityReceiptDigest,
        workspaceDiagnosticProjectionReceiptDigest,
        controlCapabilitySnapshotDigest,
        appliedControlDigest,
        retirementEvidenceDigest,
        ...stableReportedEvidence(result),
      });
    }
  );
  const requiredCellCount = input.rows.reduce(
    (total, row) => total + row.requiredCellCount,
    0
  );
  const aggregateRowCount = input.rows.length;
  const browserCellCount = new Set(input.attempts.map(({ cellId }) => cellId))
    .size;
  const browserAttemptCount = attempts.length;
  const staticAttemptCount = staticAttempts.length;
  const totalAttemptCount = browserAttemptCount + staticAttemptCount;
  const statusCounters: GoldenG3V6MatrixStatusCounters = Object.freeze({
    reported: attempts.length + staticAttempts.length,
    passed:
      attempts.filter(({ verdict }) => verdict === 'passed').length +
      staticAttempts.filter(({ verdict }) => verdict === 'passed').length,
    blocked: 0,
    unsupported: 0,
    skipped: 0,
    todo: 0,
    failed: 0,
    residual: 0,
  });
  if (
    requiredCellCount !== 66 ||
    aggregateRowCount !== 8 ||
    browserCellCount !== 58 ||
    browserAttemptCount !== 72 ||
    staticAttemptCount !== 8 ||
    totalAttemptCount !== 80 ||
    Object.entries(EXPECTED_STATUS_COUNTERS).some(
      ([key, count]) =>
        statusCounters[key as keyof GoldenG3V6MatrixStatusCounters] !== count
    )
  ) {
    throw new Error('Golden V6 actual matrix evidence counts drifted.');
  }
  return Object.freeze({
    format: 'prodivix.golden-g3-v6-controlled-matrix-evidence' as const,
    version: 1,
    planDigest: input.plan.planDigest,
    manifestDigest: input.manifest.manifestDigest,
    adapterRegistryDigest: GOLDEN_G3_V6_ADAPTER_REGISTRY_DIGEST,
    browserIdentityRegistryDigest:
      GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
    visualIdentityManifestDigest: GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST_DIGEST,
    visualBaselineSetDigest: GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST,
    visualBaselineAssetDigest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest,
    visualBaselineRasterDigest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest,
    visualNormalizerDigest: GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST,
    controlledDimensions: input.controlledDimensions,
    controlledEnvironment: input.controlledEnvironment,
    staticRuntimeControl: input.staticRuntimeControl,
    staticArtifactRetirement: input.staticArtifactRetirement,
    controlledDimensionManifestDigest:
      GOLDEN_G3_V6_CONTROLLED_DIMENSION_MANIFEST.manifestDigest,
    requiredCellCount,
    aggregateRowCount,
    browserCellCount,
    browserAttemptCount,
    staticAttemptCount,
    totalAttemptCount,
    statusCounters,
    runtimeControl: input.runtimeControl,
    browserArtifactRetirement: input.browserArtifactRetirement,
    attemptAuthority: input.attemptAuthority,
    attemptManifest: input.attemptManifest,
    rows: input.rows,
    attempts,
    staticAttempts,
  });
};

export const executeGoldenG3V6ControlledAdapterMatrix =
  async (): Promise<GoldenG3V6ControlledAdapterMatrixEvidence> => {
    assertGoldenG3V6BrowserIdentityRegistry();
    const controlledDimensions = await verifyGoldenG3V6ControlledDimensions();
    const planResult = createGoldenG3V6Plan();
    if (planResult.status !== 'ready') {
      throw new Error('Golden V6 controlled matrix Plan is not ready.');
    }
    const plan = planResult.plan;
    const manifest = createGoldenG3V6ControlledMatrixManifest(plan);
    const browserCells = plan.cells.filter(
      (cell) =>
        cell.requirement === 'required' && cell.browserEngine !== undefined
    );
    if (browserCells.length !== EXPECTED_BROWSER_CELL_COUNT) {
      throw new Error('Golden V6 controlled Plan cell counts drifted.');
    }

    const frameworks = await prepareGoldenG3V6Frameworks();
    const matrixCleanup = createGoldenG3V6AttemptCleanupScope();
    matrixCleanup.defer('prepared-frameworks', () =>
      disposeGoldenG3V6Frameworks(frameworks)
    );
    let evidence: GoldenG3V6ControlledAdapterMatrixEvidence | undefined;
    let primaryError: unknown;
    try {
      const leases = createGoldenG3V6TargetLeaseRegistry();
      const authorities = createGoldenG3V6SecurityAuthorityRegistry();
      const runtimeControls = createGoldenG3V6RuntimeControlRegistry();
      const artifactTransport = createGoldenG3V6ArtifactTransport();
      const factory = createFirstPartyBrowserVerificationAdapterFactory({
        targetLease: leases.port,
        runtimeControls: runtimeControls.port,
        securityObservationAuthority: authorities.port,
        baselineAssets: createGoldenG3V6VisualBaselineAssetPort(),
      });
      matrixCleanup.defer('browser-factory', factory.dispose);
      const reactDiagnosticProjection =
        frameworks['react-vite'].testDiagnosticProjection;
      const vueDiagnosticProjection =
        frameworks['vue-vite'].testDiagnosticProjection;
      if (!reactDiagnosticProjection || !vueDiagnosticProjection) {
        throw new Error(
          'Golden V6 canonical frameworks have no Compiler-owned diagnostic projection authority.'
        );
      }
      const staticToolchainEvidence = Object.freeze({
        'react-vite': {
          snapshot: frameworks['react-vite'].testSnapshot,
          toolchain: frameworks['react-vite'].testProject.toolchain!,
          diagnosticProjection: reactDiagnosticProjection,
        },
        'vue-vite': {
          snapshot: frameworks['vue-vite'].testSnapshot,
          toolchain: frameworks['vue-vite'].testProject.toolchain!,
          diagnosticProjection: vueDiagnosticProjection,
        },
      });
      const staticExecution = await executeGoldenG3V6StaticAdapterCells(
        plan,
        staticToolchainEvidence
      );
      const staticAttempts = staticExecution.attempts;
      assertStaticAttempts(staticAttempts);

      const attempts: GoldenG3V6BrowserAttempt[] = [];
      for (const row of manifest.rows) {
        for (const cellManifest of row.cells) {
          const cell = plan.cells.find(
            (candidate) => candidate.id === cellManifest.cellId
          );
          if (!cell?.browserEngine) continue;
          for (const provider of row.attemptProviderDimension.providers) {
            attempts.push(
              await executeGoldenG3V6BrowserAttempt({
                plan,
                row,
                cell,
                provider,
                framework: goldenG3V6FrameworkForCell(cell, frameworks),
                factory,
                leases,
                authorities,
                runtimeControls,
                artifactTransport,
              })
            );
          }
        }
      }
      assertAttemptAggregates(
        attempts,
        leases,
        authorities,
        runtimeControls,
        artifactTransport
      );
      const runtimeControl = createRuntimeControlAggregateEvidence(
        attempts,
        runtimeControls
      );
      const browserArtifactRetirement = createBrowserArtifactRetirementEvidence(
        plan,
        attempts,
        artifactTransport
      );
      const rows = aggregateRows(manifest, attempts, staticAttempts);
      const controlledEnvironment =
        createGoldenG3V6ControlledEnvironmentEvidence({
          plan,
          browserAttempts: attempts,
          staticAttempts,
          toolchainEvidence: staticToolchainEvidence,
        });
      const attemptAuthority = collectGoldenG3V6CanonicalAttemptAuthority({
        plan,
        matrix: manifest,
        browserAttempts: attempts,
        staticAttempts,
        controlledEnvironmentDigest: controlledEnvironment.evidenceDigest,
      });
      const attemptManifest = createGoldenG3V6CanonicalAttemptManifest({
        plan,
        matrix: manifest,
        browserAttempts: attempts,
        staticAttempts,
        authority: attemptAuthority,
        controlledEnvironmentDigest: controlledEnvironment.evidenceDigest,
      });
      const stableEvidence = createStableMatrixEvidence({
        plan,
        manifest,
        controlledDimensions,
        controlledEnvironment,
        rows,
        attempts,
        staticAttempts,
        staticRuntimeControl: staticExecution.runtimeControl,
        staticArtifactRetirement: staticExecution.artifactRetirement,
        runtimeControl,
        browserArtifactRetirement,
        attemptAuthority,
        attemptManifest,
      });
      evidence = Object.freeze({
        planDigest: plan.planDigest,
        manifestDigest: manifest.manifestDigest,
        adapterRegistryDigest: GOLDEN_G3_V6_ADAPTER_REGISTRY_DIGEST,
        browserIdentityRegistryDigest:
          GOLDEN_G3_V6_BROWSER_IDENTITY_REGISTRY_DIGEST,
        visualIdentityManifestDigest:
          GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST_DIGEST,
        visualBaselineSetDigest: GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST,
        visualBaselineAssetDigest:
          GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest,
        visualBaselineRasterDigest:
          GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest,
        visualNormalizerDigest: GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST,
        controlledDimensions,
        controlledEnvironment,
        staticRuntimeControl: staticExecution.runtimeControl,
        staticArtifactRetirement: staticExecution.artifactRetirement,
        requiredCellCount: 66,
        aggregateRowCount: 8,
        browserCellCount: 58,
        browserAttemptCount: 72,
        staticAttemptCount: 8,
        totalAttemptCount: 80,
        statusCounters: stableEvidence.statusCounters,
        runtimeControl,
        browserArtifactRetirement,
        attemptAuthority,
        attemptManifest,
        rows,
        attempts: Object.freeze(attempts),
        evidenceDigest: digestVerificationValue(stableEvidence),
      });
    } catch (error) {
      primaryError = error;
    }
    const cleanupErrors = await matrixCleanup.runAll();
    throwGoldenG3V6AttemptFailure('matrix:g3-v6', primaryError, cleanupErrors);
    if (!evidence) {
      throw new Error('Golden V6 matrix produced no aggregate evidence.');
    }
    return evidence;
  };
