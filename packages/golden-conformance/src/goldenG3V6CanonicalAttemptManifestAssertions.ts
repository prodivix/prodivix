import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationPlan,
} from '@prodivix/verification';
import type {
  GoldenG3V6AttemptProvider,
  GoldenG3V6ControlledMatrixManifest,
  GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import type {
  GoldenG3V6CanonicalAttemptAuthority,
  GoldenG3V6CanonicalAttemptAuthorityEntry,
  GoldenG3V6CanonicalAttemptDimension,
  GoldenG3V6CanonicalAttemptManifest,
  GoldenG3V6ProviderKind,
} from './goldenG3V6CanonicalAttemptManifestTypes';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const providerKindForMode = (
  mode: GoldenG3V6AttemptProvider['mode']
): GoldenG3V6ProviderKind => (mode === 'standalone-export' ? 'export' : mode);

const expectedAttemptBindings = (
  manifest: GoldenG3V6ControlledMatrixManifest
): ReadonlyMap<
  string,
  Readonly<{
    row: GoldenG3V6MatrixRowManifest;
    provider: GoldenG3V6AttemptProvider;
  }>
> => {
  const bindings = new Map<
    string,
    Readonly<{
      row: GoldenG3V6MatrixRowManifest;
      provider: GoldenG3V6AttemptProvider;
    }>
  >();
  for (const row of manifest.rows) {
    for (const cell of row.cells) {
      for (const provider of row.attemptProviderDimension.providers) {
        const key = `${cell.cellId}\u0000${provider.providerId}`;
        if (bindings.has(key)) {
          throw new Error(
            `Golden V6 canonical expected binding "${key}" is duplicated.`
          );
        }
        bindings.set(key, Object.freeze({ row, provider }));
      }
    }
  }
  return bindings;
};

export const assertGoldenG3V6CanonicalAttemptDimensions = (
  entries: readonly GoldenG3V6CanonicalAttemptDimension[],
  plan: VerificationPlan,
  matrix: GoldenG3V6ControlledMatrixManifest
): void => {
  const expected = expectedAttemptBindings(matrix);
  const actualBindings = new Set<string>();
  const attemptIds = new Set<string>();
  const cellIds = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.cellId}\u0000${entry.providerId}`;
    const binding = expected.get(key);
    const cell = plan.cells.find(({ id }) => id === entry.cellId);
    const matrixCell = binding?.row.cells.find(
      ({ cellId }) => cellId === entry.cellId
    );
    if (
      !binding ||
      !cell ||
      !matrixCell ||
      actualBindings.has(key) ||
      attemptIds.has(entry.attemptId) ||
      entry.rowId !== binding.row.id ||
      entry.checkId !== cell.checkId ||
      entry.checkKind !== cell.checkKind ||
      entry.surface !== cell.surface ||
      entry.frameworkTarget !== cell.frameworkTarget ||
      entry.browserEngine !== (cell.browserEngine ?? null) ||
      entry.motion !== cell.motion ||
      entry.adapterId !== cell.adapter.adapterId ||
      entry.adapterFactorySlotId !== matrixCell.adapterFactorySlotId ||
      entry.providerKind !== providerKindForMode(binding.provider.mode) ||
      entry.providerOrigin !== binding.provider.origin ||
      entry.executionBoundary !==
        (cell.browserEngine === undefined ? 'node' : 'browser')
    ) {
      throw new Error(
        `Golden V6 canonical attempt dimension "${key}" drifted or duplicated.`
      );
    }
    actualBindings.add(key);
    attemptIds.add(entry.attemptId);
    cellIds.add(entry.cellId);
  }
  if (
    expected.size !== 80 ||
    entries.length !== 80 ||
    actualBindings.size !== expected.size ||
    [...expected.keys()].some((key) => !actualBindings.has(key)) ||
    attemptIds.size !== 80 ||
    cellIds.size !== 66 ||
    entries.filter(({ executionBoundary }) => executionBoundary === 'browser')
      .length !== 72 ||
    entries.filter(({ executionBoundary }) => executionBoundary === 'node')
      .length !== 8
  ) {
    throw new Error(
      'Golden V6 canonical dimensions must cover exactly 66 cells and 80 unique attempts.'
    );
  }
};

const assertDigest = (value: string, label: string): void => {
  if (!DIGEST_PATTERN.test(value)) {
    throw new Error(`Golden V6 canonical ${label} is not a digest.`);
  }
};

const assertCanonicalAttemptAuthority = (
  authority: GoldenG3V6CanonicalAttemptAuthority
): ReadonlyMap<string, GoldenG3V6CanonicalAttemptAuthorityEntry> => {
  const { authorityDigest, ...identity } = authority;
  const attemptIds = authority.entries.map(({ attemptId }) => attemptId);
  const coordinateKeys = authority.entries.map(
    ({ cellId, providerId }) => `${cellId}\u0000${providerId}`
  );
  const browserReceiptDigests = authority.entries.flatMap((entry) =>
    entry.executionBoundary === 'browser' &&
    entry.behaviorAssertionReceiptDigest
      ? [entry.behaviorAssertionReceiptDigest]
      : []
  );
  const workspaceDiagnosticProjectionReceiptDigests = authority.entries.flatMap(
    (entry) =>
      entry.workspaceDiagnosticProjectionReceiptDigest
        ? [entry.workspaceDiagnosticProjectionReceiptDigest]
        : []
  );
  const productionFixtureAbsenceReceiptDigests = authority.entries.flatMap(
    (entry) =>
      entry.productionFixtureAbsenceReceiptDigest
        ? [entry.productionFixtureAbsenceReceiptDigest]
        : []
  );
  const toolchainProjectionAuthorityReceiptDigests = authority.entries.flatMap(
    (entry) =>
      entry.toolchainProjectionAuthorityReceiptDigest
        ? [entry.toolchainProjectionAuthorityReceiptDigest]
        : []
  );
  if (
    authority.format !== 'prodivix.golden-g3-v6-canonical-attempt-authority' ||
    authority.version !== 1 ||
    authority.attemptCount !== 80 ||
    authority.entries.length !== 80 ||
    new Set(attemptIds).size !== 80 ||
    new Set(coordinateKeys).size !== 80 ||
    browserReceiptDigests.length !== 72 ||
    new Set(browserReceiptDigests).size !== 72 ||
    workspaceDiagnosticProjectionReceiptDigests.length !== 2 ||
    new Set(workspaceDiagnosticProjectionReceiptDigests).size !== 2 ||
    productionFixtureAbsenceReceiptDigests.length !== 8 ||
    new Set(productionFixtureAbsenceReceiptDigests).size !== 8 ||
    toolchainProjectionAuthorityReceiptDigests.length !== 8 ||
    new Set(toolchainProjectionAuthorityReceiptDigests).size !== 2 ||
    authority.entries.filter(
      ({ executionBoundary }) => executionBoundary === 'browser'
    ).length !== 72 ||
    authority.entries.filter(
      ({ executionBoundary }) => executionBoundary === 'node'
    ).length !== 8 ||
    authority.entries.some(
      ({ attemptId }, index) =>
        index > 0 &&
        compareUnicodeCodePoints(
          authority.entries[index - 1]!.attemptId,
          attemptId
        ) >= 0
    ) ||
    digestVerificationValue(identity) !== authorityDigest
  ) {
    throw new Error(
      'Golden V6 canonical attempt authority is incomplete or drifted.'
    );
  }
  assertDigest(authorityDigest, 'attempt authority digest');
  assertDigest(
    authority.controlledEnvironmentDigest,
    'attempt authority controlled environment digest'
  );
  for (const entry of authority.entries) {
    const digests = [
      entry.executableSnapshotDigest,
      entry.reportDigest,
      entry.runtimeEnvironmentDigest,
      entry.controlledEnvironmentDigest,
      entry.resolvedInputSetDigest,
      entry.workspaceDiagnosticProjectionReceiptDigest,
      entry.toolchainProjectionAuthorityReceiptDigest,
      entry.stagedArtifactSetDigest,
      entry.artifactRetirementReceiptDigest,
      entry.controlDigest,
      entry.scenarioProgramDigest,
      entry.behaviorAssertionReceiptDigest,
      entry.blackBoxAssertionSetDigest,
      entry.runtimeControlEvidenceDigest,
      entry.fixtureProjectionAuthorityDigest,
      entry.fixtureRuntimeDispatchDigest,
      entry.fixtureDispatchLedgerDigest,
      entry.fixtureResponseDigest,
      entry.fixtureResolutionDigest,
      entry.fixtureConsumptionLedgerDigest,
      entry.fixtureRuntimeConsumptionBindingDigest,
      entry.remoteEvidenceDigest,
      entry.remoteCleanupEvidenceDigest,
      entry.securityBundleEvidenceDigest,
      entry.securityResolutionAuditDigest,
      entry.securityResolutionEvidenceDigest,
      entry.productionFixtureAbsenceReceiptDigest,
    ].filter((value): value is string => value !== null);
    if (digests.some((digest) => !DIGEST_PATTERN.test(digest))) {
      throw new Error(
        `Golden V6 canonical attempt authority "${entry.attemptId}" contains a non-digest.`
      );
    }
    if (
      entry.controlledEnvironmentDigest !==
        authority.controlledEnvironmentDigest ||
      digestVerificationValue(
        [...entry.artifactKinds].sort(compareUnicodeCodePoints)
      ) !== digestVerificationValue(entry.artifactKinds)
    ) {
      throw new Error(
        `Golden V6 canonical attempt authority "${entry.attemptId}" artifact kinds are not canonical.`
      );
    }
    if (entry.executionBoundary === 'browser') {
      const expectedFixtureCount =
        entry.fixtureProjectionMode === 'compiler-auth-fixture'
          ? 1
          : entry.fixtureProjectionMode === 'production-no-fixture'
            ? 0
            : -1;
      const emptyLedgerDigest = digestVerificationValue([]);
      if (
        entry.fixtureRuntimeDispatchCount !== expectedFixtureCount ||
        entry.fixtureRequestCount !== expectedFixtureCount ||
        entry.fixtureDispatchCount !== expectedFixtureCount ||
        entry.fixtureResponseCount !== expectedFixtureCount ||
        !entry.fixtureDispatchLedgerDigest ||
        !entry.fixtureConsumptionLedgerDigest ||
        !entry.fixtureRuntimeConsumptionBindingDigest ||
        entry.workspaceDiagnosticProjectionReceiptDigest !== null ||
        entry.toolchainProjectionAuthorityReceiptDigest !== null ||
        (entry.fixtureProjectionMode === 'production-no-fixture') !==
          (entry.productionFixtureAbsenceReceiptDigest !== null) ||
        (expectedFixtureCount === 0
          ? entry.fixtureResponseDigest !== null ||
            entry.fixtureResolutionDigest !== null ||
            entry.fixtureDispatchLedgerDigest !== emptyLedgerDigest ||
            entry.fixtureConsumptionLedgerDigest !== emptyLedgerDigest
          : entry.fixtureResponseDigest === null ||
            entry.fixtureResolutionDigest === null)
      ) {
        throw new Error(
          `Golden V6 canonical attempt authority "${entry.attemptId}" has incomplete causal Fixture evidence.`
        );
      }
    } else if (
      [
        entry.fixtureRequestCount,
        entry.fixtureDispatchCount,
        entry.fixtureResponseCount,
        entry.fixtureDispatchLedgerDigest,
        entry.fixtureResponseDigest,
        entry.fixtureResolutionDigest,
        entry.fixtureConsumptionLedgerDigest,
        entry.fixtureRuntimeConsumptionBindingDigest,
        entry.productionFixtureAbsenceReceiptDigest,
      ].some((value) => value !== null)
    ) {
      throw new Error(
        `Golden V6 canonical static authority "${entry.attemptId}" contains Browser Fixture evidence.`
      );
    }
  }
  return new Map(authority.entries.map((entry) => [entry.attemptId, entry]));
};

export const assertGoldenG3V6CanonicalAttemptManifest = (
  attemptManifest: GoldenG3V6CanonicalAttemptManifest,
  plan: VerificationPlan,
  matrix: GoldenG3V6ControlledMatrixManifest,
  authority: GoldenG3V6CanonicalAttemptAuthority
): void => {
  const authorityByAttemptId = assertCanonicalAttemptAuthority(authority);
  assertGoldenG3V6CanonicalAttemptDimensions(
    attemptManifest.entries,
    plan,
    matrix
  );
  const expected = expectedAttemptBindings(matrix);
  const actualBindings = new Set<string>();
  const attemptIds = new Set<string>();
  const cellIds = new Set<string>();
  for (const entry of attemptManifest.entries) {
    const key = `${entry.cellId}\u0000${entry.providerId}`;
    const binding = expected.get(key);
    const cell = plan.cells.find(({ id }) => id === entry.cellId);
    const matrixCell = binding?.row.cells.find(
      ({ cellId }) => cellId === entry.cellId
    );
    const authorityEntry = authorityByAttemptId.get(entry.attemptId);
    if (
      !binding ||
      !cell ||
      !matrixCell ||
      actualBindings.has(key) ||
      attemptIds.has(entry.attemptId) ||
      entry.rowId !== binding.row.id ||
      entry.checkId !== cell.checkId ||
      entry.checkKind !== cell.checkKind ||
      entry.surface !== cell.surface ||
      entry.frameworkTarget !== cell.frameworkTarget ||
      entry.browserEngine !== (cell.browserEngine ?? null) ||
      entry.motion !== cell.motion ||
      entry.adapterId !== cell.adapter.adapterId ||
      entry.adapterFactorySlotId !== matrixCell.adapterFactorySlotId ||
      entry.providerKind !== providerKindForMode(binding.provider.mode) ||
      entry.providerOrigin !== binding.provider.origin ||
      entry.executionBoundary !==
        (cell.browserEngine === undefined ? 'node' : 'browser') ||
      digestVerificationValue(
        Object.fromEntries(
          Object.entries(entry).filter(([field]) => field !== 'entryDigest')
        )
      ) !== entry.entryDigest
    ) {
      throw new Error(
        `Golden V6 canonical attempt binding "${key}" drifted or duplicated.`
      );
    }
    const requiredDigests = [
      entry.executableSnapshotDigest,
      entry.runtimeEnvironmentDigest,
      entry.controlledEnvironmentDigest,
      entry.reportDigest,
      entry.resolvedInputSetDigest,
      entry.stagedArtifactSetDigest,
      entry.artifactRetirementReceiptDigest,
      entry.control.controlCapabilitySnapshotDigest,
      entry.control.appliedControlDigest,
      entry.entryDigest,
    ];
    if (
      requiredDigests.some((digest) => !DIGEST_PATTERN.test(digest)) ||
      [...entry.artifactKinds]
        .sort(compareUnicodeCodePoints)
        .some((kind, index) => kind !== entry.artifactKinds[index]) ||
      entry.lifecycleStatus !== 'reported' ||
      entry.terminalStatus !== 'completed' ||
      entry.terminalExitCode !== 0 ||
      entry.cleanupStatus !== 'clean' ||
      entry.verdict !== 'passed' ||
      entry.outcome !== 'passed'
    ) {
      throw new Error(
        `Golden V6 canonical attempt "${entry.attemptId}" is incomplete.`
      );
    }
    if (
      (entry.executionBoundary === 'node' &&
        entry.checkKind === 'diagnostics') !==
        (entry.workspaceDiagnosticProjectionReceiptDigest !== null) ||
      (entry.workspaceDiagnosticProjectionReceiptDigest !== null &&
        !DIGEST_PATTERN.test(entry.workspaceDiagnosticProjectionReceiptDigest))
    ) {
      throw new Error(
        `Golden V6 diagnostic projection receipt "${entry.attemptId}" is incomplete or misplaced.`
      );
    }
    if (
      (entry.executionBoundary === 'node') !==
        (entry.toolchainProjectionAuthorityReceiptDigest !== null) ||
      (entry.toolchainProjectionAuthorityReceiptDigest !== null &&
        !DIGEST_PATTERN.test(entry.toolchainProjectionAuthorityReceiptDigest))
    ) {
      throw new Error(
        `Golden V6 toolchain projection receipt "${entry.attemptId}" is incomplete or misplaced.`
      );
    }
    if (entry.control.kind === 'deterministic-runtime') {
      const runtimeDigests = [
        entry.control.resourceManifestDigest,
        entry.control.targetLeaseBindingDigest,
        entry.control.fixtureBindingDigest,
        entry.control.fixtureProjectionAuthorityDigest,
        entry.control.fixtureRuntimeDispatchDigest,
        entry.control.fixtureDispatchLedgerDigest,
        entry.control.fixtureConsumptionLedgerDigest,
        entry.control.fixtureRuntimeConsumptionBindingDigest,
        entry.control.initialAttestationDigest,
        entry.control.terminalAttestationDigest,
        entry.control.cleanupCanaryDigest,
        entry.control.releaseReceiptDigest,
        entry.control.retirementEvidenceDigest,
        entry.control.evidenceDigest,
        entry.behaviorAssertionReceiptDigest,
        entry.blackBoxAssertionSetDigest,
        entry.behaviorCrossBindingDigest,
      ];
      const expectedFixtureSetDigests = Object.freeze(
        cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
      );
      const fixtureRuntimeConsumptionBindingDigest =
        entry.control.fixtureBindingDigest &&
        entry.control.fixtureRequestCount !== null &&
        entry.control.fixtureDispatchCount !== null &&
        entry.control.fixtureResponseCount !== null &&
        entry.control.fixtureDispatchLedgerDigest &&
        entry.control.fixtureConsumptionLedgerDigest
          ? digestVerificationValue({
              format: 'prodivix.browser-runtime-fixture-consumption-binding',
              version: 1,
              fixtureSetDigests: expectedFixtureSetDigests,
              fixtureBindingDigest: entry.control.fixtureBindingDigest,
              fixtureRequestCount: entry.control.fixtureRequestCount,
              fixtureDispatchCount: entry.control.fixtureDispatchCount,
              fixtureResponseCount: entry.control.fixtureResponseCount,
              fixtureDispatchLedgerDigest:
                entry.control.fixtureDispatchLedgerDigest,
              fixtureResponseDigest: entry.control.fixtureResponseDigest,
              fixtureResolutionDigest: entry.control.fixtureResolutionDigest,
              fixtureConsumptionLedgerDigest:
                entry.control.fixtureConsumptionLedgerDigest,
            })
          : null;
      const behaviorReceiptDigest =
        cell.scenarioId &&
        cell.controlProfileRef.digest &&
        entry.scenarioProgramDigest &&
        entry.control.targetLeaseBindingDigest &&
        entry.control.fixtureRuntimeConsumptionBindingDigest &&
        entry.behaviorAssertionReceiptDigest &&
        entry.blackBoxAssertionSetDigest
          ? digestVerificationValue({
              format: 'prodivix.verification-behavior-assertion-receipt',
              version: 1,
              attemptId: entry.attemptId,
              cellId: entry.cellId,
              scenarioId: cell.scenarioId,
              executableSnapshotDigest: entry.executableSnapshotDigest,
              scenarioProgramDigest: entry.scenarioProgramDigest,
              controlProfileDigest: cell.controlProfileRef.digest,
              fixtureSetDigests: expectedFixtureSetDigests,
              targetLeaseBindingDigest: entry.control.targetLeaseBindingDigest,
              runtimeFixtureBindingDigest:
                entry.control.fixtureRuntimeConsumptionBindingDigest,
              blackBoxAssertionSetDigest: entry.blackBoxAssertionSetDigest,
            })
          : null;
      const behaviorCrossBindingDigest =
        behaviorReceiptDigest &&
        entry.control.fixtureProjectionAuthorityDigest &&
        entry.control.fixtureRuntimeDispatchDigest
          ? digestVerificationValue({
              format: 'prodivix.golden-g3-v6-behavior-cross-binding',
              version: 1,
              attemptId: entry.attemptId,
              generation: 1,
              cellId: entry.cellId,
              scenarioId: cell.scenarioId,
              executableSnapshotDigest: entry.executableSnapshotDigest,
              scenarioProgramDigest: entry.scenarioProgramDigest,
              controlProfileDigest: cell.controlProfileRef.digest,
              fixtureSetDigests: expectedFixtureSetDigests,
              targetLeaseBindingDigest: entry.control.targetLeaseBindingDigest,
              fixtureBindingDigest: entry.control.fixtureBindingDigest,
              runtimeFixtureBindingDigest:
                entry.control.fixtureRuntimeConsumptionBindingDigest,
              fixtureProjectionAuthorityDigest:
                entry.control.fixtureProjectionAuthorityDigest,
              fixtureProjectionMode: entry.control.fixtureProjectionMode,
              fixtureRuntimeDispatchCount:
                entry.control.fixtureRuntimeDispatchCount,
              fixtureRuntimeDispatchDigest:
                entry.control.fixtureRuntimeDispatchDigest,
              fixtureRequestCount: entry.control.fixtureRequestCount,
              fixtureDispatchCount: entry.control.fixtureDispatchCount,
              fixtureResponseCount: entry.control.fixtureResponseCount,
              fixtureDispatchLedgerDigest:
                entry.control.fixtureDispatchLedgerDigest,
              fixtureResponseDigest: entry.control.fixtureResponseDigest,
              fixtureResolutionDigest: entry.control.fixtureResolutionDigest,
              fixtureConsumptionLedgerDigest:
                entry.control.fixtureConsumptionLedgerDigest,
              behaviorAssertionReceiptDigest: behaviorReceiptDigest,
              blackBoxAssertionSetDigest: entry.blackBoxAssertionSetDigest,
            })
          : null;
      if (
        entry.executionBoundary !== 'browser' ||
        !entry.scenarioProgramDigest ||
        !DIGEST_PATTERN.test(entry.scenarioProgramDigest) ||
        runtimeDigests.some(
          (digest) => digest === null || !DIGEST_PATTERN.test(digest)
        ) ||
        fixtureRuntimeConsumptionBindingDigest !==
          entry.control.fixtureRuntimeConsumptionBindingDigest ||
        behaviorReceiptDigest !== entry.behaviorAssertionReceiptDigest ||
        behaviorCrossBindingDigest !== entry.behaviorCrossBindingDigest ||
        (entry.checkKind === 'security'
          ? entry.control.fixtureProjectionMode !== 'production-no-fixture' ||
            entry.control.fixtureRuntimeDispatchCount !== 0 ||
            entry.control.fixtureRequestCount !== 0 ||
            entry.control.fixtureDispatchCount !== 0 ||
            entry.control.fixtureResponseCount !== 0 ||
            entry.control.fixtureResponseDigest !== null ||
            entry.control.fixtureResolutionDigest !== null ||
            entry.control.fixtureDispatchLedgerDigest !==
              digestVerificationValue([]) ||
            entry.control.fixtureConsumptionLedgerDigest !==
              digestVerificationValue([]) ||
            expectedFixtureSetDigests.length !== 0
          : entry.control.fixtureProjectionMode !== 'compiler-auth-fixture' ||
            entry.control.fixtureRuntimeDispatchCount !== 1 ||
            entry.control.fixtureRequestCount !== 1 ||
            entry.control.fixtureDispatchCount !== 1 ||
            entry.control.fixtureResponseCount !== 1 ||
            entry.control.fixtureResponseDigest === null ||
            !DIGEST_PATTERN.test(entry.control.fixtureResponseDigest) ||
            entry.control.fixtureResolutionDigest === null ||
            !DIGEST_PATTERN.test(entry.control.fixtureResolutionDigest) ||
            expectedFixtureSetDigests.length !== 1) ||
        (entry.providerKind === 'remote') !==
          (entry.control.remoteBindingDigest !== null) ||
        (entry.control.remoteBindingDigest !== null &&
          !DIGEST_PATTERN.test(entry.control.remoteBindingDigest))
      ) {
        throw new Error(
          `Golden V6 runtime-control manifest entry "${entry.attemptId}" is incomplete.`
        );
      }
    } else if (
      entry.executionBoundary !== 'node' ||
      entry.scenarioProgramDigest !== null ||
      [
        entry.control.targetLeaseBindingDigest,
        entry.control.resourceManifestDigest,
        entry.control.fixtureBindingDigest,
        entry.control.fixtureProjectionMode,
        entry.control.fixtureProjectionAuthorityDigest,
        entry.control.fixtureRuntimeDispatchCount,
        entry.control.fixtureRuntimeDispatchDigest,
        entry.control.fixtureRequestCount,
        entry.control.fixtureDispatchCount,
        entry.control.fixtureResponseCount,
        entry.control.fixtureDispatchLedgerDigest,
        entry.control.fixtureResponseDigest,
        entry.control.fixtureResolutionDigest,
        entry.control.fixtureConsumptionLedgerDigest,
        entry.control.fixtureRuntimeConsumptionBindingDigest,
        entry.control.remoteBindingDigest,
        entry.control.initialAttestationDigest,
        entry.control.terminalAttestationDigest,
        entry.control.cleanupCanaryDigest,
        entry.control.releaseReceiptDigest,
        entry.control.retirementEvidenceDigest,
        entry.control.evidenceDigest,
        entry.behaviorAssertionReceiptDigest,
        entry.blackBoxAssertionSetDigest,
        entry.behaviorCrossBindingDigest,
      ].some((value) => value !== null)
    ) {
      throw new Error(
        `Golden V6 static control manifest entry "${entry.attemptId}" is not explicitly empty.`
      );
    }
    const remoteDigests = [
      entry.remoteEvidenceDigest,
      entry.remoteCleanupEvidenceDigest,
    ];
    if (
      (entry.providerKind === 'remote') !==
        remoteDigests.every(
          (digest) => digest !== null && DIGEST_PATTERN.test(digest)
        ) ||
      (entry.providerKind !== 'remote' &&
        remoteDigests.some((digest) => digest !== null))
    ) {
      throw new Error(
        `Golden V6 remote manifest entry "${entry.attemptId}" is incomplete or misplaced.`
      );
    }
    const securityDigests = [
      entry.securityBundleEvidenceDigest,
      entry.securityResolutionAuditDigest,
      entry.securityResolutionEvidenceDigest,
      entry.productionFixtureAbsenceReceiptDigest,
    ];
    if (
      (entry.checkKind === 'security') !==
        securityDigests.every(
          (digest) => digest !== null && DIGEST_PATTERN.test(digest)
        ) ||
      (entry.checkKind !== 'security' &&
        securityDigests.some((digest) => digest !== null))
    ) {
      throw new Error(
        `Golden V6 security manifest entry "${entry.attemptId}" is incomplete or misplaced.`
      );
    }
    if (
      !authorityEntry ||
      entry.cellId !== authorityEntry.cellId ||
      entry.providerId !== authorityEntry.providerId ||
      entry.executionBoundary !== authorityEntry.executionBoundary ||
      entry.executableSnapshotDigest !==
        authorityEntry.executableSnapshotDigest ||
      entry.reportDigest !== authorityEntry.reportDigest ||
      entry.runtimeEnvironmentDigest !==
        authorityEntry.runtimeEnvironmentDigest ||
      entry.controlledEnvironmentDigest !==
        authorityEntry.controlledEnvironmentDigest ||
      entry.scenarioProgramDigest !== authorityEntry.scenarioProgramDigest ||
      entry.resolvedInputSetDigest !== authorityEntry.resolvedInputSetDigest ||
      entry.workspaceDiagnosticProjectionReceiptDigest !==
        authorityEntry.workspaceDiagnosticProjectionReceiptDigest ||
      entry.toolchainProjectionAuthorityReceiptDigest !==
        authorityEntry.toolchainProjectionAuthorityReceiptDigest ||
      entry.stagedArtifactSetDigest !==
        authorityEntry.stagedArtifactSetDigest ||
      digestVerificationValue(entry.artifactKinds) !==
        digestVerificationValue(authorityEntry.artifactKinds) ||
      entry.artifactRetirementReceiptDigest !==
        authorityEntry.artifactRetirementReceiptDigest ||
      entry.behaviorAssertionReceiptDigest !==
        authorityEntry.behaviorAssertionReceiptDigest ||
      entry.blackBoxAssertionSetDigest !==
        authorityEntry.blackBoxAssertionSetDigest ||
      digestVerificationValue(entry.control) !== authorityEntry.controlDigest ||
      entry.control.evidenceDigest !==
        authorityEntry.runtimeControlEvidenceDigest ||
      entry.control.fixtureProjectionMode !==
        authorityEntry.fixtureProjectionMode ||
      entry.control.fixtureProjectionAuthorityDigest !==
        authorityEntry.fixtureProjectionAuthorityDigest ||
      entry.control.fixtureRuntimeDispatchCount !==
        authorityEntry.fixtureRuntimeDispatchCount ||
      entry.control.fixtureRuntimeDispatchDigest !==
        authorityEntry.fixtureRuntimeDispatchDigest ||
      entry.control.fixtureRequestCount !==
        authorityEntry.fixtureRequestCount ||
      entry.control.fixtureDispatchCount !==
        authorityEntry.fixtureDispatchCount ||
      entry.control.fixtureResponseCount !==
        authorityEntry.fixtureResponseCount ||
      entry.control.fixtureDispatchLedgerDigest !==
        authorityEntry.fixtureDispatchLedgerDigest ||
      entry.control.fixtureResponseDigest !==
        authorityEntry.fixtureResponseDigest ||
      entry.control.fixtureResolutionDigest !==
        authorityEntry.fixtureResolutionDigest ||
      entry.control.fixtureConsumptionLedgerDigest !==
        authorityEntry.fixtureConsumptionLedgerDigest ||
      entry.control.fixtureRuntimeConsumptionBindingDigest !==
        authorityEntry.fixtureRuntimeConsumptionBindingDigest ||
      entry.remoteEvidenceDigest !== authorityEntry.remoteEvidenceDigest ||
      entry.remoteCleanupEvidenceDigest !==
        authorityEntry.remoteCleanupEvidenceDigest ||
      entry.securityBundleEvidenceDigest !==
        authorityEntry.securityBundleEvidenceDigest ||
      entry.securityResolutionAuditDigest !==
        authorityEntry.securityResolutionAuditDigest ||
      entry.securityResolutionEvidenceDigest !==
        authorityEntry.securityResolutionEvidenceDigest ||
      entry.productionFixtureAbsenceReceiptDigest !==
        authorityEntry.productionFixtureAbsenceReceiptDigest
    ) {
      throw new Error(
        `Golden V6 canonical attempt "${entry.attemptId}" drifted from actual attempt authority.`
      );
    }
    actualBindings.add(key);
    attemptIds.add(entry.attemptId);
    cellIds.add(entry.cellId);
  }
  const toolchainProjectionDigestsByTarget = (
    ['react-vite', 'vue-vite'] as const
  ).map((frameworkTarget) =>
    attemptManifest.entries.flatMap((entry) =>
      entry.executionBoundary === 'node' &&
      entry.frameworkTarget === frameworkTarget &&
      entry.toolchainProjectionAuthorityReceiptDigest
        ? [entry.toolchainProjectionAuthorityReceiptDigest]
        : []
    )
  );
  if (
    attemptManifest.planDigest !== plan.planDigest ||
    attemptManifest.matrixManifestDigest !== matrix.manifestDigest ||
    attemptManifest.attemptAuthorityDigest !== authority.authorityDigest ||
    attemptManifest.controlledEnvironmentDigest !==
      authority.controlledEnvironmentDigest ||
    attemptManifest.entries.some(
      ({ controlledEnvironmentDigest }) =>
        controlledEnvironmentDigest !==
        attemptManifest.controlledEnvironmentDigest
    ) ||
    expected.size !== 80 ||
    attemptManifest.entries.length !== 80 ||
    attemptManifest.entries.some(
      ({ attemptId }, index) =>
        index > 0 &&
        compareUnicodeCodePoints(
          attemptManifest.entries[index - 1]!.attemptId,
          attemptId
        ) >= 0
    ) ||
    actualBindings.size !== expected.size ||
    [...expected.keys()].some((key) => !actualBindings.has(key)) ||
    attemptIds.size !== 80 ||
    cellIds.size !== 66 ||
    attemptManifest.entries.filter(
      ({ executionBoundary }) => executionBoundary === 'browser'
    ).length !== 72 ||
    attemptManifest.entries.filter(
      ({ executionBoundary }) => executionBoundary === 'node'
    ).length !== 8 ||
    toolchainProjectionDigestsByTarget.some(
      (digests) => digests.length !== 4 || new Set(digests).size !== 1
    ) ||
    new Set(toolchainProjectionDigestsByTarget.flat()).size !== 2
  ) {
    throw new Error(
      'Golden V6 canonical attempt manifest does not cover exactly 66 cells and 80 unique attempts.'
    );
  }
  assertDigest(attemptManifest.manifestDigest, 'attempt manifest digest');
  const { manifestDigest, ...manifestIdentity } = attemptManifest;
  if (digestVerificationValue(manifestIdentity) !== manifestDigest) {
    throw new Error('Golden V6 canonical attempt manifest digest drifted.');
  }
};
