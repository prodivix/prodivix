import {
  digestVerificationValue,
  normalizeVerificationCheckReportCandidate,
  type VerificationAdapterLifecycleResult,
  type VerificationArtifactKind,
  type VerificationBehaviorAssertionReceipt,
  type VerificationPlan,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  GoldenG3V6AttemptProvider,
  GoldenG3V6ControlledMatrixManifest,
  GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import type { GoldenG3V6BrowserAttempt } from './goldenG3V6BrowserAttemptExecution';
import { assertGoldenG3V6CanonicalAttemptManifest } from './goldenG3V6CanonicalAttemptManifestAssertions';
import type {
  GoldenG3V6CanonicalAttemptAuthority,
  GoldenG3V6CanonicalAttemptEvidence,
  GoldenG3V6CanonicalAttemptManifest,
  GoldenG3V6ProviderKind,
} from './goldenG3V6CanonicalAttemptManifestTypes';
import type { GoldenG3V6StaticAdapterAttempt } from './goldenG3V6StaticAdapterExecution';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

type StableResult = Readonly<{
  attemptId: string;
  providerKind: GoldenG3V6ProviderKind;
  runtimeEnvironmentDigest: string;
  lifecycleStatus: 'reported';
  terminalStatus: 'completed';
  terminalExitCode: 0;
  cleanupStatus: 'clean';
  verdict: 'passed';
  outcome: 'passed';
  reportDigest: string;
  resolvedInputSetDigest: string;
  stagedArtifactSetDigest: string;
  artifactKinds: readonly VerificationArtifactKind[];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  behaviorAssertionReceipt: VerificationBehaviorAssertionReceipt | null;
}>;

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

const stableResult = (
  result: VerificationAdapterLifecycleResult,
  runtimeEnvironmentDigest: string
): StableResult => {
  if (
    result.status !== 'reported' ||
    result.cleanup.status !== 'clean' ||
    result.report.terminal.status !== 'completed' ||
    result.report.terminal.exitCode !== 0 ||
    !DIGEST_PATTERN.test(runtimeEnvironmentDigest)
  ) {
    throw new Error(
      'Golden V6 canonical attempt requires a clean reported lifecycle.'
    );
  }
  const normalized = normalizeVerificationCheckReportCandidate(result.report);
  if (
    normalized.status !== 'ready' ||
    normalized.report.verdict !== 'passed' ||
    normalized.report.outcome !== 'passed'
  ) {
    throw new Error(
      'Golden V6 canonical attempt requires a normalized passing report.'
    );
  }
  const providerKind = result.invocation.providerKind;
  if (
    providerKind !== 'browser' &&
    providerKind !== 'remote' &&
    providerKind !== 'export' &&
    providerKind !== 'ci'
  ) {
    throw new Error(
      `Golden V6 canonical attempt has invalid provider "${providerKind}".`
    );
  }
  return Object.freeze({
    attemptId: result.invocation.attemptId,
    providerKind,
    runtimeEnvironmentDigest,
    lifecycleStatus: 'reported',
    terminalStatus: 'completed',
    terminalExitCode: 0,
    cleanupStatus: 'clean',
    verdict: 'passed',
    outcome: 'passed',
    reportDigest: digestVerificationValue(result.report),
    resolvedInputSetDigest: result.resolvedInputSetDigest,
    stagedArtifactSetDigest: digestVerificationValue(result.stagedArtifacts),
    artifactKinds: Object.freeze(
      result.stagedArtifacts
        .map(({ kind }) => kind)
        .sort(compareUnicodeCodePoints)
    ),
    controlCapabilitySnapshotDigest:
      result.invocation.controlCapabilitySnapshotDigest,
    appliedControlDigest: result.invocation.appliedControlDigest,
    behaviorAssertionReceipt:
      'behaviorAssertionReceipt' in result.report.payload
        ? result.report.payload.behaviorAssertionReceipt
        : null,
  });
};

const withEntryDigest = (
  entry: Omit<GoldenG3V6CanonicalAttemptEvidence, 'entryDigest'>
): GoldenG3V6CanonicalAttemptEvidence =>
  Object.freeze({
    ...entry,
    entryDigest: digestVerificationValue(entry),
  });

const browserEntry = (
  plan: VerificationPlan,
  manifest: GoldenG3V6ControlledMatrixManifest,
  attempt: GoldenG3V6BrowserAttempt,
  controlledEnvironmentDigest: string
): GoldenG3V6CanonicalAttemptEvidence => {
  const cell = plan.cells.find(({ id }) => id === attempt.cellId);
  const row = rowForCell(manifest, attempt.cellId);
  const cellManifest = row.cells.find(
    ({ cellId }) => cellId === attempt.cellId
  );
  const provider = row.attemptProviderDimension.providers.find(
    ({ providerId }) => providerId === attempt.providerId
  );
  if (
    !cell ||
    !cellManifest ||
    !provider ||
    !cell.browserEngine ||
    attempt.rowId !== row.id ||
    attempt.checkKind !== cell.checkKind ||
    attempt.providerMode !== provider.mode
  ) {
    throw new Error(
      `Golden V6 browser attempt "${attempt.attemptId}" has incomplete canonical dimensions.`
    );
  }
  const result = stableResult(attempt.result, attempt.runtimeEnvironmentDigest);
  if (
    result.attemptId !== attempt.attemptId ||
    result.providerKind !== providerKindForMode(provider.mode) ||
    !result.behaviorAssertionReceipt
  ) {
    throw new Error(
      `Golden V6 browser attempt "${attempt.attemptId}" drifted from lifecycle identity.`
    );
  }
  const receipt = result.behaviorAssertionReceipt;
  const expectedFixtureSetDigests = Object.freeze(
    cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
  );
  if (
    !cell.scenarioId ||
    !cell.controlProfileRef.digest ||
    receipt.attemptId !== attempt.attemptId ||
    receipt.cellId !== cell.id ||
    receipt.scenarioId !== cell.scenarioId ||
    receipt.executableSnapshotDigest !== attempt.executableSnapshotDigest ||
    receipt.scenarioProgramDigest !== attempt.scenarioProgramDigest ||
    receipt.controlProfileDigest !== cell.controlProfileRef.digest ||
    !sameCanonicalJson(receipt.fixtureSetDigests, expectedFixtureSetDigests) ||
    receipt.targetLeaseBindingDigest !==
      attempt.runtimeControlEvidence.targetLeaseBindingDigest ||
    receipt.runtimeFixtureBindingDigest !==
      attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest
  ) {
    throw new Error(
      `Golden V6 browser attempt "${attempt.attemptId}" behavior assertion receipt drifted from its runtime coordinates.`
    );
  }
  const behaviorCrossBindingDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-behavior-cross-binding',
    version: 1,
    attemptId: attempt.attemptId,
    generation: 1,
    cellId: cell.id,
    scenarioId: cell.scenarioId,
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    scenarioProgramDigest: attempt.scenarioProgramDigest,
    controlProfileDigest: cell.controlProfileRef.digest,
    fixtureSetDigests: expectedFixtureSetDigests,
    targetLeaseBindingDigest:
      attempt.runtimeControlEvidence.targetLeaseBindingDigest,
    fixtureBindingDigest: attempt.runtimeControlEvidence.fixtureBindingDigest,
    runtimeFixtureBindingDigest:
      attempt.runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
    fixtureProjectionAuthorityDigest:
      attempt.runtimeControlEvidence.fixtureProjectionAuthorityDigest,
    fixtureProjectionMode: attempt.runtimeControlEvidence.fixtureProjectionMode,
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
    behaviorAssertionReceiptDigest: receipt.receiptDigest,
    blackBoxAssertionSetDigest: receipt.blackBoxAssertionSetDigest,
  });
  return withEntryDigest({
    attemptId: attempt.attemptId,
    executionBoundary: 'browser',
    rowId: row.id,
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    surface: cell.surface,
    frameworkTarget: cell.frameworkTarget,
    browserEngine: cell.browserEngine,
    motion: cell.motion,
    adapterId: cell.adapter.adapterId,
    adapterFactorySlotId: cellManifest.adapterFactorySlotId,
    providerKind: result.providerKind,
    providerId: provider.providerId,
    providerOrigin: provider.origin,
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    scenarioProgramDigest: attempt.scenarioProgramDigest,
    runtimeEnvironmentDigest: attempt.runtimeEnvironmentDigest,
    controlledEnvironmentDigest,
    lifecycleStatus: result.lifecycleStatus,
    terminalStatus: result.terminalStatus,
    terminalExitCode: result.terminalExitCode,
    cleanupStatus: result.cleanupStatus,
    verdict: result.verdict,
    outcome: result.outcome,
    reportDigest: result.reportDigest,
    resolvedInputSetDigest: result.resolvedInputSetDigest,
    workspaceDiagnosticProjectionReceiptDigest: null,
    toolchainProjectionAuthorityReceiptDigest: null,
    stagedArtifactSetDigest: result.stagedArtifactSetDigest,
    artifactKinds: result.artifactKinds,
    artifactRetirementReceiptDigest: attempt.artifactRetirementEvidenceDigest,
    control: Object.freeze({
      kind: 'deterministic-runtime',
      controlCapabilitySnapshotDigest:
        attempt.runtimeControlEvidence.controlCapabilitySnapshotDigest,
      appliedControlDigest: attempt.runtimeControlEvidence.appliedControlDigest,
      targetLeaseBindingDigest:
        attempt.runtimeControlEvidence.targetLeaseBindingDigest,
      resourceManifestDigest:
        attempt.runtimeControlEvidence.resourceManifestDigest,
      fixtureBindingDigest: attempt.runtimeControlEvidence.fixtureBindingDigest,
      fixtureProjectionMode:
        attempt.runtimeControlEvidence.fixtureProjectionMode,
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
      fixtureResponseDigest:
        attempt.runtimeControlEvidence.fixtureResponseDigest,
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
    }),
    behaviorAssertionReceiptDigest: receipt.receiptDigest,
    blackBoxAssertionSetDigest: receipt.blackBoxAssertionSetDigest,
    behaviorCrossBindingDigest,
    remoteEvidenceDigest: attempt.remoteEvidence
      ? digestVerificationValue(attempt.remoteEvidence)
      : null,
    remoteCleanupEvidenceDigest: attempt.remoteCleanupEvidenceDigest ?? null,
    securityBundleEvidenceDigest: attempt.securityBundleEvidenceDigest ?? null,
    securityResolutionAuditDigest:
      attempt.securityResolutionAudit?.auditDigest ?? null,
    securityResolutionEvidenceDigest:
      attempt.securityResolutionAudit?.evidenceDigest ?? null,
    productionFixtureAbsenceReceiptDigest:
      attempt.productionFixtureAbsenceReceiptDigest ?? null,
  });
};

const staticEntry = (
  plan: VerificationPlan,
  manifest: GoldenG3V6ControlledMatrixManifest,
  attempt: GoldenG3V6StaticAdapterAttempt,
  controlledEnvironmentDigest: string
): GoldenG3V6CanonicalAttemptEvidence => {
  const cell = plan.cells.find(({ id }) => id === attempt.cellId);
  const row = rowForCell(manifest, attempt.cellId);
  const cellManifest = row.cells.find(
    ({ cellId }) => cellId === attempt.cellId
  );
  const runtimeEnvironmentDigest = attempt.runtimeEnvironmentDigest;
  if (
    !cell ||
    !cellManifest ||
    cell.browserEngine !== undefined ||
    !runtimeEnvironmentDigest ||
    !attempt.executableSnapshotDigest ||
    !attempt.toolchainProjectionAuthorityReceiptDigest
  ) {
    throw new Error(
      `Golden V6 static attempt "${attempt.cellId}" has incomplete canonical dimensions or environment evidence.`
    );
  }
  const result = stableResult(attempt.result, runtimeEnvironmentDigest);
  const provider = row.attemptProviderDimension.providers.find(
    ({ mode }) => providerKindForMode(mode) === result.providerKind
  );
  if (
    !provider ||
    result.attemptId !== attempt.attemptId ||
    result.providerKind !== providerKindForMode(provider.mode)
  ) {
    throw new Error(
      `Golden V6 static attempt "${result.attemptId}" has no canonical provider.`
    );
  }
  return withEntryDigest({
    attemptId: result.attemptId,
    executionBoundary: 'node',
    rowId: row.id,
    cellId: cell.id,
    checkId: cell.checkId,
    checkKind: cell.checkKind,
    surface: cell.surface,
    frameworkTarget: cell.frameworkTarget,
    browserEngine: null,
    motion: cell.motion,
    adapterId: cell.adapter.adapterId,
    adapterFactorySlotId: cellManifest.adapterFactorySlotId,
    providerKind: result.providerKind,
    providerId: provider.providerId,
    providerOrigin: provider.origin,
    executableSnapshotDigest: attempt.executableSnapshotDigest,
    scenarioProgramDigest: null,
    runtimeEnvironmentDigest,
    controlledEnvironmentDigest,
    lifecycleStatus: result.lifecycleStatus,
    terminalStatus: result.terminalStatus,
    terminalExitCode: result.terminalExitCode,
    cleanupStatus: result.cleanupStatus,
    verdict: result.verdict,
    outcome: result.outcome,
    reportDigest: result.reportDigest,
    resolvedInputSetDigest: result.resolvedInputSetDigest,
    workspaceDiagnosticProjectionReceiptDigest:
      attempt.workspaceDiagnosticProjectionReceiptDigest,
    toolchainProjectionAuthorityReceiptDigest:
      attempt.toolchainProjectionAuthorityReceiptDigest,
    stagedArtifactSetDigest: result.stagedArtifactSetDigest,
    artifactKinds: result.artifactKinds,
    artifactRetirementReceiptDigest: attempt.retirementEvidenceDigest,
    control: Object.freeze({
      kind: 'static-no-runtime-controls',
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
    }),
    behaviorAssertionReceiptDigest: null,
    blackBoxAssertionSetDigest: null,
    behaviorCrossBindingDigest: null,
    remoteEvidenceDigest: null,
    remoteCleanupEvidenceDigest: null,
    securityBundleEvidenceDigest: null,
    securityResolutionAuditDigest: null,
    securityResolutionEvidenceDigest: null,
    productionFixtureAbsenceReceiptDigest: null,
  });
};

export const createGoldenG3V6CanonicalAttemptManifest = (input: {
  plan: VerificationPlan;
  matrix: GoldenG3V6ControlledMatrixManifest;
  browserAttempts: readonly GoldenG3V6BrowserAttempt[];
  staticAttempts: readonly GoldenG3V6StaticAdapterAttempt[];
  authority: GoldenG3V6CanonicalAttemptAuthority;
  controlledEnvironmentDigest: string;
}): GoldenG3V6CanonicalAttemptManifest => {
  if (!DIGEST_PATTERN.test(input.controlledEnvironmentDigest)) {
    throw new Error(
      'Golden V6 canonical attempt manifest requires controlled environment evidence.'
    );
  }
  const entries = Object.freeze(
    [
      ...input.browserAttempts.map((attempt) =>
        browserEntry(
          input.plan,
          input.matrix,
          attempt,
          input.controlledEnvironmentDigest
        )
      ),
      ...input.staticAttempts.map((attempt) =>
        staticEntry(
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
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v6-canonical-attempt-manifest' as const,
    version: 1 as const,
    planDigest: input.plan.planDigest,
    matrixManifestDigest: input.matrix.manifestDigest,
    attemptAuthorityDigest: input.authority.authorityDigest,
    controlledEnvironmentDigest: input.controlledEnvironmentDigest,
    requiredCellCount: 66 as const,
    attemptCount: 80 as const,
    browserAttemptCount: 72 as const,
    staticAttemptCount: 8 as const,
    entries,
  });
  const attemptManifest: GoldenG3V6CanonicalAttemptManifest = Object.freeze({
    ...identity,
    manifestDigest: digestVerificationValue(identity),
  });
  assertGoldenG3V6CanonicalAttemptManifest(
    attemptManifest,
    input.plan,
    input.matrix,
    input.authority
  );
  return attemptManifest;
};
