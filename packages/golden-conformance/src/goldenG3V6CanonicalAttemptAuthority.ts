import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { assertWorkspaceDiagnosticProjectionReceipt } from '@prodivix/prodivix-compiler';
import {
  digestVerificationValue,
  normalizeVerificationCheckReportCandidate,
  type VerificationAdapterLifecycleResult,
  type VerificationArtifactKind,
  type VerificationBehaviorAssertionReceipt,
  type VerificationPlan,
} from '@prodivix/verification';
import type {
  GoldenG3V6AttemptProvider,
  GoldenG3V6ControlledMatrixManifest,
  GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import type { GoldenG3V6BrowserAttempt } from './goldenG3V6BrowserAttemptExecution';
import type {
  GoldenG3V6CanonicalAttemptAuthority,
  GoldenG3V6CanonicalAttemptAuthorityEntry,
  GoldenG3V6ProviderKind,
} from './goldenG3V6CanonicalAttemptManifestTypes';
import { assertGoldenControlledStaticToolchainProjectionAuthority } from './generatedProjectToolchainProjectionAuthority';
import { assertGoldenG3V6ProductionFixtureAbsenceReceipt } from './goldenG3V6ProductionFixtureAbsenceReceipt';
import type { GoldenG3V6StaticAdapterAttempt } from './goldenG3V6StaticAdapterExecution';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const providerKindForMode = (
  mode: GoldenG3V6AttemptProvider['mode']
): GoldenG3V6ProviderKind => (mode === 'standalone-export' ? 'export' : mode);

const rowForCell = (
  manifest: GoldenG3V6ControlledMatrixManifest,
  cellId: string
): GoldenG3V6MatrixRowManifest => {
  const rows = manifest.rows.filter((row) =>
    row.cells.some((cell) => cell.cellId === cellId)
  );
  if (rows.length !== 1) {
    throw new Error(
      `Golden V6 canonical attempt cell "${cellId}" must resolve exactly one row.`
    );
  }
  return rows[0]!;
};

type RawLifecycleAuthority = Readonly<{
  attemptId: string;
  providerKind: string;
  cellId: string;
  checkKind: string;
  reportDigest: string;
  resolvedInputSetDigest: string;
  stagedArtifactSetDigest: string;
  artifactKinds: readonly VerificationArtifactKind[];
  behaviorAssertionReceipt: VerificationBehaviorAssertionReceipt | null;
}>;

const collectRawLifecycleAuthority = (
  result: VerificationAdapterLifecycleResult
): RawLifecycleAuthority => {
  if (
    result.status !== 'reported' ||
    result.cleanup.status !== 'clean' ||
    result.report.terminal.status !== 'completed' ||
    result.report.terminal.exitCode !== 0
  ) {
    throw new Error(
      'Golden V6 raw attempt authority requires a clean reported lifecycle.'
    );
  }
  const normalized = normalizeVerificationCheckReportCandidate(result.report);
  if (
    normalized.status !== 'ready' ||
    normalized.report.verdict !== 'passed' ||
    normalized.report.outcome !== 'passed'
  ) {
    throw new Error(
      'Golden V6 raw attempt authority requires a normalized passing report.'
    );
  }
  return Object.freeze({
    attemptId: result.invocation.attemptId,
    providerKind: result.invocation.providerKind,
    cellId: result.report.cellId,
    checkKind: result.report.checkKind,
    reportDigest: digestVerificationValue(result.report),
    resolvedInputSetDigest: result.resolvedInputSetDigest,
    stagedArtifactSetDigest: digestVerificationValue(result.stagedArtifacts),
    artifactKinds: Object.freeze(
      result.stagedArtifacts
        .map(({ kind }) => kind)
        .sort(compareUnicodeCodePoints)
    ),
    behaviorAssertionReceipt:
      'behaviorAssertionReceipt' in result.report.payload
        ? result.report.payload.behaviorAssertionReceipt
        : null,
  });
};

export const assertGoldenG3V6RawLifecycleInvocationIdentity = (
  lifecycle: Pick<
    RawLifecycleAuthority,
    'attemptId' | 'providerKind' | 'cellId' | 'checkKind'
  >,
  expected: Readonly<{
    attemptId: string;
    providerMode: GoldenG3V6AttemptProvider['mode'];
    cellId: string;
    checkKind: string;
  }>
): void => {
  if (
    lifecycle.attemptId !== expected.attemptId ||
    lifecycle.providerKind !== providerKindForMode(expected.providerMode) ||
    lifecycle.cellId !== expected.cellId ||
    lifecycle.checkKind !== expected.checkKind
  ) {
    throw new Error(
      `Golden V6 raw lifecycle invocation "${expected.attemptId}" drifted from its outer attempt coordinates.`
    );
  }
};

export const assertGoldenG3V6RawBrowserPlanBinding = (
  actual: Pick<
    GoldenG3V6BrowserAttempt,
    'rowId' | 'cellId' | 'checkKind' | 'providerId' | 'providerMode'
  >,
  expected: Readonly<{
    rowId: GoldenG3V6MatrixRowManifest['id'];
    cellId: string;
    checkKind: string;
    providerId: string;
    providerMode: GoldenG3V6AttemptProvider['mode'];
  }>
): void => {
  if (
    actual.rowId !== expected.rowId ||
    actual.cellId !== expected.cellId ||
    actual.checkKind !== expected.checkKind ||
    actual.providerId !== expected.providerId ||
    actual.providerMode !== expected.providerMode
  ) {
    throw new Error(
      `Golden V6 raw browser attempt "${actual.cellId}" drifted from its Plan and matrix coordinates.`
    );
  }
};

export const assertGoldenG3V6RawProductionFixtureAbsenceAuthority = (
  attempt: GoldenG3V6BrowserAttempt,
  cell: VerificationPlan['cells'][number]
): string | null => {
  const receipt = attempt.productionFixtureAbsenceReceipt;
  const receiptDigest = attempt.productionFixtureAbsenceReceiptDigest;
  const authority = attempt.productionSecurityAuthority;
  const audit = attempt.securityResolutionAudit;
  const security = cell.checkKind === 'security';
  if (
    security !== Boolean(receipt && receiptDigest && authority && audit) ||
    (!security &&
      [
        receipt,
        receiptDigest,
        authority,
        audit,
        attempt.securityBundleEvidenceDigest,
      ].some((value) => value !== undefined))
  ) {
    throw new Error(
      `Golden V6 raw browser attempt "${attempt.attemptId}" has incomplete or misplaced production fixture-absence authority.`
    );
  }
  if (!security || !receipt || !receiptDigest || !authority || !audit) {
    return null;
  }
  assertGoldenG3V6ProductionFixtureAbsenceReceipt(receipt, authority, audit);
  if (
    receipt.receiptDigest !== receiptDigest ||
    receipt.cellId !== cell.id ||
    receipt.attemptId !== attempt.attemptId ||
    receipt.generation !== 1 ||
    receipt.executableSnapshotDigest !== attempt.executableSnapshotDigest ||
    receipt.runtimeEnvironmentDigest !== attempt.runtimeEnvironmentDigest ||
    receipt.controlProfileDigest !== cell.controlProfileRef.digest ||
    receipt.originDigest !== attempt.targetOriginDigest ||
    receipt.securityEvidenceDigest !== attempt.securityBundleEvidenceDigest ||
    receipt.resolutionAuditDigest !== audit.auditDigest ||
    receipt.resolutionAuditEvidenceDigest !== audit.evidenceDigest
  ) {
    throw new Error(
      `Golden V6 raw browser attempt "${attempt.attemptId}" production fixture-absence receipt drifted from its raw attempt coordinates.`
    );
  }
  return receiptDigest;
};

const browserAuthorityEntry = (
  plan: VerificationPlan,
  matrix: GoldenG3V6ControlledMatrixManifest,
  attempt: GoldenG3V6BrowserAttempt,
  controlledEnvironmentDigest: string
): GoldenG3V6CanonicalAttemptAuthorityEntry => {
  const lifecycle = collectRawLifecycleAuthority(attempt.result);
  const receipt = lifecycle.behaviorAssertionReceipt;
  const runtime = attempt.runtimeControlEvidence;
  const cell = plan.cells.find(({ id }) => id === attempt.cellId);
  const row = rowForCell(matrix, attempt.cellId);
  const provider = row.attemptProviderDimension.providers.find(
    ({ providerId }) => providerId === attempt.providerId
  );
  if (!cell || !cell.browserEngine || !provider) {
    throw new Error(
      `Golden V6 raw browser authority "${attempt.attemptId}" has no Plan and matrix coordinates.`
    );
  }
  assertGoldenG3V6RawBrowserPlanBinding(attempt, {
    rowId: row.id,
    cellId: cell.id,
    checkKind: cell.checkKind,
    providerId: provider.providerId,
    providerMode: provider.mode,
  });
  assertGoldenG3V6RawLifecycleInvocationIdentity(lifecycle, {
    attemptId: attempt.attemptId,
    providerMode: provider.mode,
    cellId: cell.id,
    checkKind: cell.checkKind,
  });
  const productionFixtureAbsenceReceiptDigest =
    assertGoldenG3V6RawProductionFixtureAbsenceAuthority(attempt, cell);
  const observedFixtureCount = receipt?.fixtureSetDigests.length ?? -1;
  const emptyLedgerDigest = digestVerificationValue([]);
  const runtimeFixtureConsumptionBindingDigest = receipt
    ? digestVerificationValue({
        format: 'prodivix.browser-runtime-fixture-consumption-binding',
        version: 1,
        fixtureSetDigests: receipt.fixtureSetDigests,
        fixtureBindingDigest: runtime.fixtureBindingDigest,
        fixtureRequestCount: runtime.fixtureRequestCount,
        fixtureDispatchCount: runtime.fixtureDispatchCount,
        fixtureResponseCount: runtime.fixtureResponseCount,
        fixtureDispatchLedgerDigest: runtime.fixtureDispatchLedgerDigest,
        fixtureResponseDigest: runtime.fixtureResponseDigest,
        fixtureResolutionDigest: runtime.fixtureResolutionDigest,
        fixtureConsumptionLedgerDigest: runtime.fixtureConsumptionLedgerDigest,
      })
    : null;
  if (
    !receipt ||
    receipt.attemptId !== attempt.attemptId ||
    receipt.cellId !== attempt.cellId ||
    receipt.executableSnapshotDigest !== attempt.executableSnapshotDigest ||
    receipt.scenarioProgramDigest !== attempt.scenarioProgramDigest ||
    receipt.targetLeaseBindingDigest !== runtime.targetLeaseBindingDigest ||
    receipt.runtimeFixtureBindingDigest !==
      runtime.fixtureRuntimeConsumptionBindingDigest ||
    runtimeFixtureConsumptionBindingDigest !==
      runtime.fixtureRuntimeConsumptionBindingDigest ||
    (observedFixtureCount !== 0 && observedFixtureCount !== 1) ||
    runtime.fixtureRequestCount !== observedFixtureCount ||
    runtime.fixtureDispatchCount !== observedFixtureCount ||
    runtime.fixtureResponseCount !== observedFixtureCount ||
    runtime.fixtureRuntimeDispatchCount !== observedFixtureCount ||
    (observedFixtureCount === 0
      ? runtime.fixtureResponseDigest !== null ||
        runtime.fixtureResolutionDigest !== null ||
        runtime.fixtureDispatchLedgerDigest !== emptyLedgerDigest ||
        runtime.fixtureConsumptionLedgerDigest !== emptyLedgerDigest
      : runtime.fixtureResponseDigest === null ||
        runtime.fixtureResolutionDigest === null)
  ) {
    throw new Error(
      `Golden V6 raw browser authority "${attempt.attemptId}" has an invalid owner receipt.`
    );
  }
  const control = Object.freeze({
    kind: 'deterministic-runtime' as const,
    controlCapabilitySnapshotDigest:
      attempt.runtimeControlEvidence.controlCapabilitySnapshotDigest,
    appliedControlDigest: attempt.runtimeControlEvidence.appliedControlDigest,
    targetLeaseBindingDigest:
      attempt.runtimeControlEvidence.targetLeaseBindingDigest,
    resourceManifestDigest:
      attempt.runtimeControlEvidence.resourceManifestDigest,
    fixtureBindingDigest: attempt.runtimeControlEvidence.fixtureBindingDigest,
    fixtureProjectionMode: attempt.runtimeControlEvidence.fixtureProjectionMode,
    fixtureProjectionAuthorityDigest:
      attempt.runtimeControlEvidence.fixtureProjectionAuthorityDigest,
    fixtureRuntimeDispatchCount:
      attempt.runtimeControlEvidence.fixtureRuntimeDispatchCount,
    fixtureRuntimeDispatchDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeDispatchDigest,
    fixtureRequestCount: attempt.runtimeControlEvidence.fixtureRequestCount,
    fixtureDispatchCount: attempt.runtimeControlEvidence.fixtureDispatchCount,
    fixtureResponseCount: attempt.runtimeControlEvidence.fixtureResponseCount,
    fixtureDispatchLedgerDigest:
      attempt.runtimeControlEvidence.fixtureDispatchLedgerDigest,
    fixtureResponseDigest: attempt.runtimeControlEvidence.fixtureResponseDigest,
    fixtureResolutionDigest:
      attempt.runtimeControlEvidence.fixtureResolutionDigest,
    fixtureConsumptionLedgerDigest:
      attempt.runtimeControlEvidence.fixtureConsumptionLedgerDigest,
    fixtureRuntimeConsumptionBindingDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
    remoteBindingDigest:
      attempt.runtimeControlEvidence.remoteBindingDigest ?? null,
    initialAttestationDigest:
      attempt.runtimeControlEvidence.initialAttestationDigest,
    terminalAttestationDigest:
      attempt.runtimeControlEvidence.terminalAttestationDigest,
    cleanupCanaryDigest: attempt.runtimeControlEvidence.cleanupCanaryDigest,
    releaseReceiptDigest: attempt.runtimeControlEvidence.releaseReceiptDigest,
    retirementEvidenceDigest:
      attempt.runtimeControlEvidence.retirementEvidenceDigest,
    evidenceDigest: attempt.runtimeControlEvidence.evidenceDigest,
  });
  return Object.freeze({
    attemptId: attempt.attemptId,
    cellId: attempt.cellId,
    providerId: attempt.providerId,
    executionBoundary: 'browser',
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    reportDigest: lifecycle.reportDigest,
    runtimeEnvironmentDigest: attempt.runtimeEnvironmentDigest,
    controlledEnvironmentDigest,
    scenarioProgramDigest: attempt.scenarioProgramDigest,
    resolvedInputSetDigest: lifecycle.resolvedInputSetDigest,
    workspaceDiagnosticProjectionReceiptDigest: null,
    toolchainProjectionAuthorityReceiptDigest: null,
    stagedArtifactSetDigest: lifecycle.stagedArtifactSetDigest,
    artifactKinds: lifecycle.artifactKinds,
    artifactRetirementReceiptDigest: attempt.artifactRetirementEvidenceDigest,
    behaviorAssertionReceiptDigest: receipt.receiptDigest,
    blackBoxAssertionSetDigest: receipt.blackBoxAssertionSetDigest,
    controlDigest: digestVerificationValue(control),
    runtimeControlEvidenceDigest: attempt.runtimeControlEvidence.evidenceDigest,
    fixtureProjectionMode: attempt.runtimeControlEvidence.fixtureProjectionMode,
    fixtureProjectionAuthorityDigest:
      attempt.runtimeControlEvidence.fixtureProjectionAuthorityDigest,
    fixtureRuntimeDispatchCount:
      attempt.runtimeControlEvidence.fixtureRuntimeDispatchCount,
    fixtureRuntimeDispatchDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeDispatchDigest,
    fixtureRequestCount: attempt.runtimeControlEvidence.fixtureRequestCount,
    fixtureDispatchCount: attempt.runtimeControlEvidence.fixtureDispatchCount,
    fixtureResponseCount: attempt.runtimeControlEvidence.fixtureResponseCount,
    fixtureDispatchLedgerDigest:
      attempt.runtimeControlEvidence.fixtureDispatchLedgerDigest,
    fixtureResponseDigest: attempt.runtimeControlEvidence.fixtureResponseDigest,
    fixtureResolutionDigest:
      attempt.runtimeControlEvidence.fixtureResolutionDigest,
    fixtureConsumptionLedgerDigest:
      attempt.runtimeControlEvidence.fixtureConsumptionLedgerDigest,
    fixtureRuntimeConsumptionBindingDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
    remoteEvidenceDigest: attempt.remoteEvidence
      ? digestVerificationValue(attempt.remoteEvidence)
      : null,
    remoteCleanupEvidenceDigest: attempt.remoteCleanupEvidenceDigest ?? null,
    securityBundleEvidenceDigest: attempt.securityBundleEvidenceDigest ?? null,
    securityResolutionAuditDigest:
      attempt.securityResolutionAudit?.auditDigest ?? null,
    securityResolutionEvidenceDigest:
      attempt.securityResolutionAudit?.evidenceDigest ?? null,
    productionFixtureAbsenceReceiptDigest,
  });
};

export const assertGoldenG3V6RawStaticDiagnosticProjectionAuthority = (
  attempt: GoldenG3V6StaticAdapterAttempt,
  cell: VerificationPlan['cells'][number]
): void => {
  const diagnosticProjection = attempt.workspaceDiagnosticProjectionAuthority;
  if (
    (cell.checkKind === 'diagnostics') !== (diagnosticProjection !== null) ||
    (cell.checkKind === 'diagnostics') !==
      (attempt.workspaceDiagnosticProjectionReceiptDigest !== null)
  ) {
    throw new Error(
      `Golden V6 raw static authority "${attempt.cellId}" has misplaced diagnostic projection authority.`
    );
  }
  if (!diagnosticProjection) return;
  assertWorkspaceDiagnosticProjectionReceipt(
    diagnosticProjection.receipt,
    diagnosticProjection.input
  );
  if (
    diagnosticProjection.receipt.receiptDigest !==
      attempt.workspaceDiagnosticProjectionReceiptDigest ||
    diagnosticProjection.input.snapshot.contentDigest !==
      attempt.executableSnapshotDigest ||
    diagnosticProjection.input.compiler.presetId !== cell.frameworkTarget ||
    diagnosticProjection.receipt.compilerProjectionDigest !==
      attempt.executableSnapshotDigest ||
    diagnosticProjection.receipt.target.presetId !== cell.frameworkTarget
  ) {
    throw new Error(
      `Golden V6 raw static authority "${attempt.cellId}" drifted from its Compiler diagnostic projection receipt.`
    );
  }
};

export const assertGoldenG3V6RawStaticToolchainProjectionAuthority = (
  attempt: GoldenG3V6StaticAdapterAttempt,
  cell: VerificationPlan['cells'][number]
): void => {
  assertGoldenControlledStaticToolchainProjectionAuthority(
    attempt.toolchainProjectionAuthority,
    {
      snapshotDigest: attempt.executableSnapshotDigest,
      toolchainAuthorityReceiptDigest: attempt.toolchainAuthorityReceiptDigest,
      receiptDigest: attempt.toolchainProjectionAuthorityReceiptDigest,
    }
  );
  if (
    attempt.toolchainProjectionAuthority.receipt.target.presetId !==
      cell.frameworkTarget ||
    attempt.toolchainProjectionAuthority.receipt.receiptDigest !==
      attempt.toolchainProjectionAuthorityReceiptDigest
  ) {
    throw new Error(
      `Golden V6 raw static authority "${attempt.cellId}" drifted from its toolchain projection authority.`
    );
  }
};

const staticAuthorityEntry = (
  plan: VerificationPlan,
  matrix: GoldenG3V6ControlledMatrixManifest,
  attempt: GoldenG3V6StaticAdapterAttempt,
  controlledEnvironmentDigest: string
): GoldenG3V6CanonicalAttemptAuthorityEntry => {
  const lifecycle = collectRawLifecycleAuthority(attempt.result);
  const row = rowForCell(matrix, attempt.cellId);
  const provider = row.attemptProviderDimension.providers.find(
    ({ mode }) => providerKindForMode(mode) === lifecycle.providerKind
  );
  if (
    !provider ||
    !attempt.runtimeEnvironmentDigest ||
    !attempt.executableSnapshotDigest ||
    !attempt.toolchainProjectionAuthorityReceiptDigest ||
    lifecycle.behaviorAssertionReceipt
  ) {
    throw new Error(
      `Golden V6 raw static authority "${attempt.cellId}" is incomplete.`
    );
  }
  const cell = plan.cells.find(({ id }) => id === attempt.cellId);
  if (!cell || cell.browserEngine !== undefined) {
    throw new Error(
      `Golden V6 raw static authority "${attempt.cellId}" has no static Plan cell.`
    );
  }
  assertGoldenG3V6RawStaticDiagnosticProjectionAuthority(attempt, cell);
  assertGoldenG3V6RawStaticToolchainProjectionAuthority(attempt, cell);
  assertGoldenG3V6RawLifecycleInvocationIdentity(lifecycle, {
    attemptId: attempt.attemptId,
    providerMode: provider.mode,
    cellId: cell.id,
    checkKind: cell.checkKind,
  });
  const control = Object.freeze({
    kind: 'static-no-runtime-controls' as const,
    controlCapabilitySnapshotDigest: attempt.controlCapabilitySnapshotDigest,
    appliedControlDigest: attempt.appliedControlDigest,
    targetLeaseBindingDigest: null,
    resourceManifestDigest: null,
    fixtureBindingDigest: null,
    fixtureProjectionMode: null,
    fixtureProjectionAuthorityDigest: null,
    fixtureRuntimeDispatchCount: null,
    fixtureRuntimeDispatchDigest: null,
    fixtureRequestCount: null,
    fixtureDispatchCount: null,
    fixtureResponseCount: null,
    fixtureDispatchLedgerDigest: null,
    fixtureResponseDigest: null,
    fixtureResolutionDigest: null,
    fixtureConsumptionLedgerDigest: null,
    fixtureRuntimeConsumptionBindingDigest: null,
    remoteBindingDigest: null,
    initialAttestationDigest: null,
    terminalAttestationDigest: null,
    cleanupCanaryDigest: null,
    releaseReceiptDigest: null,
    retirementEvidenceDigest: null,
    evidenceDigest: null,
  });
  return Object.freeze({
    attemptId: lifecycle.attemptId,
    cellId: attempt.cellId,
    providerId: provider.providerId,
    executionBoundary: 'node',
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    reportDigest: lifecycle.reportDigest,
    runtimeEnvironmentDigest: attempt.runtimeEnvironmentDigest,
    controlledEnvironmentDigest,
    scenarioProgramDigest: null,
    resolvedInputSetDigest: lifecycle.resolvedInputSetDigest,
    workspaceDiagnosticProjectionReceiptDigest:
      attempt.workspaceDiagnosticProjectionReceiptDigest,
    toolchainProjectionAuthorityReceiptDigest:
      attempt.toolchainProjectionAuthorityReceiptDigest,
    stagedArtifactSetDigest: lifecycle.stagedArtifactSetDigest,
    artifactKinds: lifecycle.artifactKinds,
    artifactRetirementReceiptDigest: attempt.retirementEvidenceDigest,
    behaviorAssertionReceiptDigest: null,
    blackBoxAssertionSetDigest: null,
    controlDigest: digestVerificationValue(control),
    runtimeControlEvidenceDigest: null,
    fixtureProjectionMode: null,
    fixtureProjectionAuthorityDigest: null,
    fixtureRuntimeDispatchCount: null,
    fixtureRuntimeDispatchDigest: null,
    fixtureRequestCount: null,
    fixtureDispatchCount: null,
    fixtureResponseCount: null,
    fixtureDispatchLedgerDigest: null,
    fixtureResponseDigest: null,
    fixtureResolutionDigest: null,
    fixtureConsumptionLedgerDigest: null,
    fixtureRuntimeConsumptionBindingDigest: null,
    remoteEvidenceDigest: null,
    remoteCleanupEvidenceDigest: null,
    securityBundleEvidenceDigest: null,
    securityResolutionAuditDigest: null,
    securityResolutionEvidenceDigest: null,
    productionFixtureAbsenceReceiptDigest: null,
  });
};

export const collectGoldenG3V6CanonicalAttemptAuthority = (input: {
  plan: VerificationPlan;
  matrix: GoldenG3V6ControlledMatrixManifest;
  browserAttempts: readonly GoldenG3V6BrowserAttempt[];
  staticAttempts: readonly GoldenG3V6StaticAdapterAttempt[];
  controlledEnvironmentDigest: string;
}): GoldenG3V6CanonicalAttemptAuthority => {
  if (!DIGEST_PATTERN.test(input.controlledEnvironmentDigest)) {
    throw new Error(
      'Golden V6 raw attempt authority requires controlled environment evidence.'
    );
  }
  const authorityEntries = Object.freeze(
    [
      ...input.browserAttempts.map((attempt) =>
        browserAuthorityEntry(
          input.plan,
          input.matrix,
          attempt,
          input.controlledEnvironmentDigest
        )
      ),
      ...input.staticAttempts.map((attempt) =>
        staticAuthorityEntry(
          input.plan,
          input.matrix,
          attempt,
          input.controlledEnvironmentDigest
        )
      ),
    ].sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    )
  );
  const coordinateKeys = authorityEntries.map(
    ({ cellId, providerId }) => `${cellId}\u0000${providerId}`
  );
  const browserReceiptDigests = authorityEntries.flatMap((entry) =>
    entry.executionBoundary === 'browser' &&
    entry.behaviorAssertionReceiptDigest
      ? [entry.behaviorAssertionReceiptDigest]
      : []
  );
  const productionFixtureAbsenceReceiptDigests = authorityEntries.flatMap(
    ({ productionFixtureAbsenceReceiptDigest }) =>
      productionFixtureAbsenceReceiptDigest
        ? [productionFixtureAbsenceReceiptDigest]
        : []
  );
  const toolchainProjectionAuthorityReceiptDigests = authorityEntries.flatMap(
    ({ toolchainProjectionAuthorityReceiptDigest }) =>
      toolchainProjectionAuthorityReceiptDigest
        ? [toolchainProjectionAuthorityReceiptDigest]
        : []
  );
  const staticProjectionDigestsByTarget = (
    ['react-vite', 'vue-vite'] as const
  ).map((frameworkTarget) =>
    authorityEntries.flatMap((entry) => {
      if (
        entry.executionBoundary !== 'node' ||
        !entry.toolchainProjectionAuthorityReceiptDigest
      ) {
        return [];
      }
      const cell = input.plan.cells.find(({ id }) => id === entry.cellId);
      return cell?.frameworkTarget === frameworkTarget
        ? [entry.toolchainProjectionAuthorityReceiptDigest]
        : [];
    })
  );
  if (
    input.browserAttempts.length !== 72 ||
    input.staticAttempts.length !== 8 ||
    authorityEntries.length !== 80 ||
    new Set(authorityEntries.map(({ attemptId }) => attemptId)).size !== 80 ||
    new Set(coordinateKeys).size !== 80 ||
    browserReceiptDigests.length !== 72 ||
    new Set(browserReceiptDigests).size !== 72 ||
    productionFixtureAbsenceReceiptDigests.length !== 8 ||
    new Set(productionFixtureAbsenceReceiptDigests).size !== 8 ||
    toolchainProjectionAuthorityReceiptDigests.length !== 8 ||
    new Set(toolchainProjectionAuthorityReceiptDigests).size !== 2 ||
    staticProjectionDigestsByTarget.some(
      (digests) => digests.length !== 4 || new Set(digests).size !== 1
    ) ||
    authorityEntries.filter(
      ({ executionBoundary }) => executionBoundary === 'browser'
    ).length !== 72 ||
    authorityEntries.filter(
      ({ executionBoundary }) => executionBoundary === 'node'
    ).length !== 8
  ) {
    throw new Error(
      'Golden V6 raw attempt authority must cover 80 unique attempts.'
    );
  }
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v6-canonical-attempt-authority' as const,
    version: 1 as const,
    attemptCount: 80 as const,
    controlledEnvironmentDigest: input.controlledEnvironmentDigest,
    entries: authorityEntries,
  });
  return Object.freeze({
    ...identity,
    authorityDigest: digestVerificationValue(identity),
  });
};
