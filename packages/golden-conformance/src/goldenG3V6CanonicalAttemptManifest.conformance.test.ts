import { describe, expect, it } from 'vitest';
import {
  digestVerificationValue,
  type VerificationPlan,
} from '@prodivix/verification';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import { createGoldenG3V6ControlledMatrixManifest } from './goldenG3V6AdapterMatrixManifest';
import {
  assertGoldenG3V6RawBrowserPlanBinding,
  assertGoldenG3V6RawLifecycleInvocationIdentity,
} from './goldenG3V6CanonicalAttemptAuthority';
import {
  assertGoldenG3V6CanonicalAttemptDimensions,
  assertGoldenG3V6CanonicalAttemptManifest,
  type GoldenG3V6CanonicalAttemptAuthority,
  type GoldenG3V6CanonicalAttemptAuthorityEntry,
  type GoldenG3V6CanonicalAttemptEvidence,
  type GoldenG3V6CanonicalAttemptDimension,
  type GoldenG3V6CanonicalAttemptManifest,
} from './goldenG3V6CanonicalAttemptManifest';

const digest = (fill: string): string => `sha256-${fill.repeat(64)}`;

const dimensions = (): Readonly<{
  plan: VerificationPlan;
  matrix: ReturnType<typeof createGoldenG3V6ControlledMatrixManifest>;
  entries: readonly GoldenG3V6CanonicalAttemptDimension[];
}> => {
  const planResult = createGoldenG3V6Plan();
  if (planResult.status !== 'ready') {
    throw new Error('Golden V6 test Plan is not ready.');
  }
  const plan = planResult.plan;
  const matrix = createGoldenG3V6ControlledMatrixManifest(plan);
  let sequence = 0;
  const entries = matrix.rows.flatMap((row) =>
    row.cells.flatMap((matrixCell) => {
      const cell = plan.cells.find(({ id }) => id === matrixCell.cellId);
      if (!cell) {
        throw new Error(`Missing test cell "${matrixCell.cellId}".`);
      }
      return row.attemptProviderDimension.providers.map((provider) => {
        sequence += 1;
        return Object.freeze({
          attemptId: `attempt:dimension:${String(sequence).padStart(3, '0')}`,
          executionBoundary:
            cell.browserEngine === undefined
              ? ('node' as const)
              : ('browser' as const),
          rowId: row.id,
          cellId: cell.id,
          checkId: cell.checkId,
          checkKind: cell.checkKind,
          surface: cell.surface,
          frameworkTarget: cell.frameworkTarget,
          browserEngine: cell.browserEngine ?? null,
          motion: cell.motion,
          adapterId: cell.adapter.adapterId,
          adapterFactorySlotId: matrixCell.adapterFactorySlotId,
          providerKind:
            provider.mode === 'standalone-export'
              ? ('export' as const)
              : provider.mode,
          providerId: provider.providerId,
          providerOrigin: provider.origin,
        });
      });
    })
  );
  return Object.freeze({ plan, matrix, entries: Object.freeze(entries) });
};

const canonicalManifest = (): Readonly<{
  plan: VerificationPlan;
  matrix: ReturnType<typeof createGoldenG3V6ControlledMatrixManifest>;
  manifest: GoldenG3V6CanonicalAttemptManifest;
  authority: GoldenG3V6CanonicalAttemptAuthority;
}> => {
  const fixture = dimensions();
  const projections = Object.freeze(
    fixture.entries.map((dimension) => {
      const runtime = dimension.executionBoundary === 'browser';
      const remote = dimension.providerKind === 'remote';
      const security = dimension.checkKind === 'security';
      const workspaceDiagnosticProjectionReceiptDigest =
        !runtime && dimension.checkKind === 'diagnostics'
          ? digestVerificationValue({
              attemptId: dimension.attemptId,
              kind: 'workspace-diagnostic-projection',
            })
          : null;
      const toolchainProjectionAuthorityReceiptDigest = runtime
        ? null
        : dimension.frameworkTarget === 'react-vite'
          ? digest('a')
          : digest('b');
      const productionFixtureAbsenceReceiptDigest = security
        ? digestVerificationValue({
            attemptId: dimension.attemptId,
            kind: 'production-fixture-absence',
          })
        : null;
      const cell = fixture.plan.cells.find(({ id }) => id === dimension.cellId);
      if (!cell) {
        throw new Error(`Missing canonical test cell "${dimension.cellId}".`);
      }
      const scenarioProgramDigest = runtime ? digest('9') : null;
      const targetLeaseBindingDigest = runtime ? digest('0') : null;
      const fixtureBindingDigest = runtime ? digest('a') : null;
      const fixtureProjectionAuthorityDigest = runtime ? digest('b') : null;
      const fixtureProjectionMode = runtime
        ? security
          ? ('production-no-fixture' as const)
          : ('compiler-auth-fixture' as const)
        : null;
      const fixtureRuntimeDispatchCount = runtime
        ? security
          ? (0 as const)
          : (1 as const)
        : null;
      const fixtureRuntimeDispatchDigest = runtime ? digest('c') : null;
      const fixtureSetDigests = Object.freeze(
        cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
      );
      const fixtureRequestCount = fixtureRuntimeDispatchCount;
      const fixtureDispatchCount = fixtureRuntimeDispatchCount;
      const fixtureResponseCount = fixtureRuntimeDispatchCount;
      const fixtureDispatchLedgerDigest = runtime
        ? security
          ? digestVerificationValue([])
          : digest('4')
        : null;
      const fixtureResponseDigest = runtime && !security ? digest('5') : null;
      const fixtureResolutionDigest = runtime && !security ? digest('6') : null;
      const fixtureConsumptionLedgerDigest = runtime
        ? security
          ? digestVerificationValue([])
          : digest('7')
        : null;
      const fixtureRuntimeConsumptionBindingDigest =
        runtime &&
        fixtureBindingDigest &&
        fixtureRequestCount !== null &&
        fixtureDispatchCount !== null &&
        fixtureResponseCount !== null &&
        fixtureDispatchLedgerDigest &&
        fixtureConsumptionLedgerDigest
          ? digestVerificationValue({
              format: 'prodivix.browser-runtime-fixture-consumption-binding',
              version: 1,
              fixtureSetDigests,
              fixtureBindingDigest,
              fixtureRequestCount,
              fixtureDispatchCount,
              fixtureResponseCount,
              fixtureDispatchLedgerDigest,
              fixtureResponseDigest,
              fixtureResolutionDigest,
              fixtureConsumptionLedgerDigest,
            })
          : null;
      const blackBoxAssertionSetDigest = runtime ? digest('d') : null;
      const behaviorAssertionReceiptDigest =
        runtime &&
        cell.scenarioId &&
        cell.controlProfileRef.digest &&
        scenarioProgramDigest &&
        targetLeaseBindingDigest &&
        fixtureRuntimeConsumptionBindingDigest &&
        blackBoxAssertionSetDigest
          ? digestVerificationValue({
              format: 'prodivix.verification-behavior-assertion-receipt',
              version: 1,
              attemptId: dimension.attemptId,
              cellId: dimension.cellId,
              scenarioId: cell.scenarioId,
              executableSnapshotDigest: digest('1'),
              scenarioProgramDigest,
              controlProfileDigest: cell.controlProfileRef.digest,
              fixtureSetDigests,
              targetLeaseBindingDigest,
              runtimeFixtureBindingDigest:
                fixtureRuntimeConsumptionBindingDigest,
              blackBoxAssertionSetDigest,
            })
          : null;
      const behaviorCrossBindingDigest =
        runtime &&
        cell.scenarioId &&
        cell.controlProfileRef.digest &&
        scenarioProgramDigest &&
        targetLeaseBindingDigest &&
        fixtureBindingDigest &&
        fixtureRuntimeConsumptionBindingDigest &&
        fixtureProjectionAuthorityDigest &&
        fixtureRuntimeDispatchDigest &&
        behaviorAssertionReceiptDigest &&
        blackBoxAssertionSetDigest
          ? digestVerificationValue({
              format: 'prodivix.golden-g3-v6-behavior-cross-binding',
              version: 1,
              attemptId: dimension.attemptId,
              generation: 1,
              cellId: dimension.cellId,
              scenarioId: cell.scenarioId,
              executableSnapshotDigest: digest('1'),
              scenarioProgramDigest,
              controlProfileDigest: cell.controlProfileRef.digest,
              fixtureSetDigests,
              targetLeaseBindingDigest,
              fixtureBindingDigest,
              runtimeFixtureBindingDigest:
                fixtureRuntimeConsumptionBindingDigest,
              fixtureProjectionAuthorityDigest,
              fixtureProjectionMode,
              fixtureRuntimeDispatchCount,
              fixtureRuntimeDispatchDigest,
              fixtureRequestCount,
              fixtureDispatchCount,
              fixtureResponseCount,
              fixtureDispatchLedgerDigest,
              fixtureResponseDigest,
              fixtureResolutionDigest,
              fixtureConsumptionLedgerDigest,
              behaviorAssertionReceiptDigest,
              blackBoxAssertionSetDigest,
            })
          : null;
      const control: GoldenG3V6CanonicalAttemptEvidence['control'] = runtime
        ? Object.freeze({
            kind: 'deterministic-runtime' as const,
            controlCapabilitySnapshotDigest: digest('7'),
            appliedControlDigest: digest('8'),
            targetLeaseBindingDigest,
            resourceManifestDigest: digest('9'),
            fixtureBindingDigest,
            fixtureProjectionMode,
            fixtureProjectionAuthorityDigest,
            fixtureRuntimeDispatchCount,
            fixtureRuntimeDispatchDigest,
            fixtureRequestCount,
            fixtureDispatchCount,
            fixtureResponseCount,
            fixtureDispatchLedgerDigest,
            fixtureResponseDigest,
            fixtureResolutionDigest,
            fixtureConsumptionLedgerDigest,
            fixtureRuntimeConsumptionBindingDigest,
            remoteBindingDigest: remote ? digest('d') : null,
            initialAttestationDigest: digest('e'),
            terminalAttestationDigest: digest('f'),
            cleanupCanaryDigest: digest('0'),
            releaseReceiptDigest: digest('1'),
            retirementEvidenceDigest: digest('2'),
            evidenceDigest: digest('3'),
          })
        : Object.freeze({
            kind: 'static-no-runtime-controls' as const,
            controlCapabilitySnapshotDigest: digest('7'),
            appliedControlDigest: digest('8'),
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
      const identity: Omit<GoldenG3V6CanonicalAttemptEvidence, 'entryDigest'> =
        Object.freeze({
          ...dimension,
          executableSnapshotDigest: digest('1'),
          scenarioProgramDigest,
          runtimeEnvironmentDigest: digest('2'),
          controlledEnvironmentDigest: digest('e'),
          lifecycleStatus: 'reported',
          terminalStatus: 'completed',
          terminalExitCode: 0,
          cleanupStatus: 'clean',
          verdict: 'passed',
          outcome: 'passed',
          reportDigest: digest('3'),
          resolvedInputSetDigest: digest('4'),
          workspaceDiagnosticProjectionReceiptDigest,
          toolchainProjectionAuthorityReceiptDigest,
          stagedArtifactSetDigest: digest('5'),
          artifactKinds: Object.freeze([]),
          artifactRetirementReceiptDigest: digest('6'),
          control,
          behaviorAssertionReceiptDigest,
          blackBoxAssertionSetDigest,
          behaviorCrossBindingDigest,
          remoteEvidenceDigest: remote ? digest('2') : null,
          remoteCleanupEvidenceDigest: remote ? digest('3') : null,
          securityBundleEvidenceDigest: security ? digest('4') : null,
          securityResolutionAuditDigest: security ? digest('5') : null,
          securityResolutionEvidenceDigest: security ? digest('6') : null,
          productionFixtureAbsenceReceiptDigest,
        });
      const entry = Object.freeze({
        ...identity,
        entryDigest: digestVerificationValue(identity),
      });
      const authorityEntry: GoldenG3V6CanonicalAttemptAuthorityEntry =
        Object.freeze({
          attemptId: dimension.attemptId,
          cellId: dimension.cellId,
          providerId: dimension.providerId,
          executionBoundary: dimension.executionBoundary,
          executableSnapshotDigest: digest('1'),
          reportDigest: digest('3'),
          runtimeEnvironmentDigest: digest('2'),
          controlledEnvironmentDigest: digest('e'),
          scenarioProgramDigest,
          resolvedInputSetDigest: digest('4'),
          workspaceDiagnosticProjectionReceiptDigest,
          toolchainProjectionAuthorityReceiptDigest,
          stagedArtifactSetDigest: digest('5'),
          artifactKinds: Object.freeze([]),
          artifactRetirementReceiptDigest: digest('6'),
          behaviorAssertionReceiptDigest,
          blackBoxAssertionSetDigest,
          controlDigest: digestVerificationValue(control),
          runtimeControlEvidenceDigest: control.evidenceDigest,
          fixtureProjectionMode: control.fixtureProjectionMode,
          fixtureProjectionAuthorityDigest:
            control.fixtureProjectionAuthorityDigest,
          fixtureRuntimeDispatchCount: control.fixtureRuntimeDispatchCount,
          fixtureRuntimeDispatchDigest: control.fixtureRuntimeDispatchDigest,
          fixtureRequestCount: control.fixtureRequestCount,
          fixtureDispatchCount: control.fixtureDispatchCount,
          fixtureResponseCount: control.fixtureResponseCount,
          fixtureDispatchLedgerDigest: control.fixtureDispatchLedgerDigest,
          fixtureResponseDigest: control.fixtureResponseDigest,
          fixtureResolutionDigest: control.fixtureResolutionDigest,
          fixtureConsumptionLedgerDigest:
            control.fixtureConsumptionLedgerDigest,
          fixtureRuntimeConsumptionBindingDigest:
            control.fixtureRuntimeConsumptionBindingDigest,
          remoteEvidenceDigest: remote ? digest('2') : null,
          remoteCleanupEvidenceDigest: remote ? digest('3') : null,
          securityBundleEvidenceDigest: security ? digest('4') : null,
          securityResolutionAuditDigest: security ? digest('5') : null,
          securityResolutionEvidenceDigest: security ? digest('6') : null,
          productionFixtureAbsenceReceiptDigest,
        });
      return Object.freeze({ entry, authorityEntry });
    })
  );
  const entries = Object.freeze(projections.map(({ entry }) => entry));
  const authorityEntries = Object.freeze(
    projections.map(({ authorityEntry }) => authorityEntry)
  );
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v6-canonical-attempt-manifest' as const,
    version: 1 as const,
    planDigest: fixture.plan.planDigest,
    matrixManifestDigest: fixture.matrix.manifestDigest,
    attemptAuthorityDigest: '',
    controlledEnvironmentDigest: digest('e'),
    requiredCellCount: 66 as const,
    attemptCount: 80 as const,
    browserAttemptCount: 72 as const,
    staticAttemptCount: 8 as const,
    entries,
  });
  const authorityIdentity = Object.freeze({
    format: 'prodivix.golden-g3-v6-canonical-attempt-authority' as const,
    version: 1 as const,
    attemptCount: 80 as const,
    controlledEnvironmentDigest: digest('e'),
    entries: authorityEntries,
  });
  const authority: GoldenG3V6CanonicalAttemptAuthority = Object.freeze({
    ...authorityIdentity,
    authorityDigest: digestVerificationValue(authorityIdentity),
  });
  const manifestIdentity = Object.freeze({
    ...identity,
    attemptAuthorityDigest: authority.authorityDigest,
  });
  return Object.freeze({
    plan: fixture.plan,
    matrix: fixture.matrix,
    authority,
    manifest: Object.freeze({
      ...manifestIdentity,
      manifestDigest: digestVerificationValue(manifestIdentity),
    }),
  });
};

const tamperManifestEntry = (
  manifest: GoldenG3V6CanonicalAttemptManifest,
  predicate: (entry: GoldenG3V6CanonicalAttemptEvidence) => boolean,
  patch: (
    entry: GoldenG3V6CanonicalAttemptEvidence
  ) => Omit<GoldenG3V6CanonicalAttemptEvidence, 'entryDigest'>
): GoldenG3V6CanonicalAttemptManifest => {
  let patched = false;
  const entries = Object.freeze(
    manifest.entries.map((entry) => {
      if (patched || !predicate(entry)) return entry;
      patched = true;
      const identity = Object.freeze(patch(entry));
      return Object.freeze({
        ...identity,
        entryDigest: digestVerificationValue(identity),
      });
    })
  );
  if (!patched) throw new Error('Golden V6 tamper target was not found.');
  const identity = Object.freeze({
    format: manifest.format,
    version: manifest.version,
    planDigest: manifest.planDigest,
    matrixManifestDigest: manifest.matrixManifestDigest,
    attemptAuthorityDigest: manifest.attemptAuthorityDigest,
    controlledEnvironmentDigest: manifest.controlledEnvironmentDigest,
    requiredCellCount: manifest.requiredCellCount,
    attemptCount: manifest.attemptCount,
    browserAttemptCount: manifest.browserAttemptCount,
    staticAttemptCount: manifest.staticAttemptCount,
    entries,
  });
  return Object.freeze({
    ...identity,
    manifestDigest: digestVerificationValue(identity),
  });
};

const tamperAuthorityEntry = (
  authority: GoldenG3V6CanonicalAttemptAuthority,
  index: number,
  patch: (
    entry: GoldenG3V6CanonicalAttemptAuthorityEntry
  ) => GoldenG3V6CanonicalAttemptAuthorityEntry
): GoldenG3V6CanonicalAttemptAuthority => {
  const entries = Object.freeze(
    authority.entries.map((entry, entryIndex) =>
      entryIndex === index ? Object.freeze(patch(entry)) : entry
    )
  );
  const identity = Object.freeze({
    format: authority.format,
    version: authority.version,
    attemptCount: authority.attemptCount,
    controlledEnvironmentDigest: authority.controlledEnvironmentDigest,
    entries,
  });
  return Object.freeze({
    ...identity,
    authorityDigest: digestVerificationValue(identity),
  });
};

describe('Golden G3 V6 canonical attempt manifest dimensions', () => {
  it('rejects a raw Browser wrapper rebound away from Plan and matrix coordinates', () => {
    const fixture = dimensions();
    const dimension = fixture.entries.find(
      ({ executionBoundary }) => executionBoundary === 'browser'
    );
    const row = dimension
      ? fixture.matrix.rows.find(({ id }) => id === dimension.rowId)
      : undefined;
    const provider = row?.attemptProviderDimension.providers.find(
      ({ providerId }) => providerId === dimension?.providerId
    );
    if (!dimension || !row || !provider) {
      throw new Error('Raw Browser Plan-binding fixture is incomplete.');
    }
    const actual = Object.freeze({
      rowId: row.id,
      cellId: dimension.cellId,
      checkKind: dimension.checkKind,
      providerId: provider.providerId,
      providerMode: provider.mode,
    });
    expect(() =>
      assertGoldenG3V6RawBrowserPlanBinding(actual, actual)
    ).not.toThrow();
    for (const rebound of [
      Object.freeze({
        ...actual,
        rowId:
          fixture.matrix.rows.find(({ id }) => id !== actual.rowId)?.id ??
          actual.rowId,
      }),
      Object.freeze({
        ...actual,
        checkKind:
          actual.checkKind === 'e2e' ? ('security' as const) : ('e2e' as const),
      }),
      Object.freeze({
        ...actual,
        providerId: `${actual.providerId}:forged`,
      }),
      Object.freeze({
        ...actual,
        providerMode:
          actual.providerMode === 'remote'
            ? ('browser' as const)
            : ('remote' as const),
      }),
    ]) {
      expect(() =>
        assertGoldenG3V6RawBrowserPlanBinding(rebound, actual)
      ).toThrow(/Plan and matrix coordinates/u);
    }
  });

  it('rejects a cloned raw lifecycle with rebound invocation coordinates', () => {
    const lifecycle = Object.freeze({
      attemptId: 'attempt:g3-v6:owned',
      providerKind: 'browser',
      cellId: 'cell:g3-v6:owned',
      checkKind: 'e2e',
    });
    const expected = Object.freeze({
      attemptId: lifecycle.attemptId,
      providerMode: 'browser' as const,
      cellId: lifecycle.cellId,
      checkKind: lifecycle.checkKind,
    });
    expect(() =>
      assertGoldenG3V6RawLifecycleInvocationIdentity(lifecycle, expected)
    ).not.toThrow();
    for (const rebound of [
      Object.freeze({
        ...lifecycle,
        attemptId: 'attempt:g3-v6:forged',
      }),
      Object.freeze({
        ...lifecycle,
        providerKind: 'remote',
      }),
      Object.freeze({
        ...lifecycle,
        cellId: 'cell:g3-v6:forged',
      }),
      Object.freeze({
        ...lifecycle,
        checkKind: 'security',
      }),
    ]) {
      expect(() =>
        assertGoldenG3V6RawLifecycleInvocationIdentity(rebound, expected)
      ).toThrow(/outer attempt coordinates/u);
    }
  });

  it('covers exactly 66 cells and 80 unique provider attempts', () => {
    const fixture = dimensions();
    expect(() =>
      assertGoldenG3V6CanonicalAttemptDimensions(
        fixture.entries,
        fixture.plan,
        fixture.matrix
      )
    ).not.toThrow();
    expect(new Set(fixture.entries.map(({ cellId }) => cellId)).size).toBe(66);
    expect(
      new Set(fixture.entries.map(({ attemptId }) => attemptId)).size
    ).toBe(80);
  });

  it('rejects a duplicated attempt identity even when all bindings remain', () => {
    const fixture = dimensions();
    const entries = fixture.entries.map((entry, index) =>
      index === 1
        ? Object.freeze({
            ...entry,
            attemptId: fixture.entries[0]!.attemptId,
          })
        : entry
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptDimensions(
        entries,
        fixture.plan,
        fixture.matrix
      )
    ).toThrow(/drifted or duplicated/u);
  });

  it('rejects a cell dimension drift instead of accepting the aggregate count', () => {
    const fixture = dimensions();
    const entries = fixture.entries.map((entry, index) =>
      index === 0
        ? Object.freeze({
            ...entry,
            motion: entry.motion === 'full' ? 'reduced' : 'full',
          })
        : entry
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptDimensions(
        entries,
        fixture.plan,
        fixture.matrix
      )
    ).toThrow(/dimension/u);
  });

  it('binds exactly two static Diagnostics attempts to Compiler projection receipts', () => {
    const fixture = canonicalManifest();
    const diagnosticEntries = fixture.manifest.entries.filter(
      ({ executionBoundary, checkKind }) =>
        executionBoundary === 'node' && checkKind === 'diagnostics'
    );
    expect(diagnosticEntries).toHaveLength(2);
    expect(
      diagnosticEntries.every(
        ({ workspaceDiagnosticProjectionReceiptDigest }) =>
          /^sha256-[a-f0-9]{64}$/u.test(
            workspaceDiagnosticProjectionReceiptDigest ?? ''
          )
      )
    ).toBe(true);
    expect(
      fixture.manifest.entries
        .filter(
          ({ executionBoundary, checkKind }) =>
            executionBoundary !== 'node' || checkKind !== 'diagnostics'
        )
        .every(
          ({ workspaceDiagnosticProjectionReceiptDigest }) =>
            workspaceDiagnosticProjectionReceiptDigest === null
        )
    ).toBe(true);

    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ executionBoundary, checkKind }) =>
        executionBoundary === 'node' && checkKind === 'diagnostics',
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        workspaceDiagnosticProjectionReceiptDigest: digest('f'),
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);
  });

  it('binds all eight static attempts to exactly two toolchain projection authorities', () => {
    const fixture = canonicalManifest();
    const staticProjectionEntries = fixture.manifest.entries.filter(
      ({ toolchainProjectionAuthorityReceiptDigest }) =>
        toolchainProjectionAuthorityReceiptDigest !== null
    );
    expect(staticProjectionEntries).toHaveLength(8);
    expect(
      new Set(
        staticProjectionEntries.map(
          ({ toolchainProjectionAuthorityReceiptDigest }) =>
            toolchainProjectionAuthorityReceiptDigest
        )
      ).size
    ).toBe(2);
    expect(
      staticProjectionEntries.every(
        ({ executionBoundary }) => executionBoundary === 'node'
      )
    ).toBe(true);
    expect(
      fixture.manifest.entries
        .filter(({ executionBoundary }) => executionBoundary === 'browser')
        .every(
          ({ toolchainProjectionAuthorityReceiptDigest }) =>
            toolchainProjectionAuthorityReceiptDigest === null
        )
    ).toBe(true);

    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ executionBoundary }) => executionBoundary === 'node',
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        toolchainProjectionAuthorityReceiptDigest: digestVerificationValue({
          forged: entry.attemptId,
          projection: 'toolchain',
        }),
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);
  });

  it('rejects removed Remote evidence after entry and manifest digests are recomputed', () => {
    const fixture = canonicalManifest();
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        fixture.manifest,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).not.toThrow();
    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ providerKind }) => providerKind === 'remote',
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        remoteEvidenceDigest: null,
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/remote manifest/u);
  });

  it('rejects removed Security evidence after entry and manifest digests are recomputed', () => {
    const fixture = canonicalManifest();
    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ checkKind }) => checkKind === 'security',
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        securityResolutionEvidenceDigest: null,
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/security manifest/u);
  });

  it('rejects a fully rehashed production fixture-absence digest against raw attempt authority', () => {
    const fixture = canonicalManifest();
    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ checkKind }) => checkKind === 'security',
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        productionFixtureAbsenceReceiptDigest: digestVerificationValue({
          forged: entry.attemptId,
        }),
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);
  });

  it('rejects controlled environment drift at both manifest and attempt scope', () => {
    const fixture = canonicalManifest();
    const entryTamper = tamperManifestEntry(
      fixture.manifest,
      () => true,
      ({ entryDigest: _entryDigest, ...entry }) => ({
        ...entry,
        controlledEnvironmentDigest: digest('f'),
      })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        entryTamper,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);

    const { manifestDigest: _manifestDigest, ...manifestIdentity } =
      fixture.manifest;
    const topIdentity = Object.freeze({
      ...manifestIdentity,
      controlledEnvironmentDigest: digest('f'),
    });
    const topTamper = Object.freeze({
      ...topIdentity,
      manifestDigest: digestVerificationValue(topIdentity),
    });
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        topTamper,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/does not cover/u);
  });

  it('rejects a fully rehashed projection-authority forgery against actual attempt authority', () => {
    const fixture = canonicalManifest();
    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ executionBoundary }) => executionBoundary === 'browser',
      ({ entryDigest: _entryDigest, ...entry }) => {
        const cell = fixture.plan.cells.find(({ id }) => id === entry.cellId);
        const forgedProjectionAuthorityDigest = digest('f');
        if (
          !cell?.scenarioId ||
          !cell.controlProfileRef.digest ||
          !entry.scenarioProgramDigest ||
          !entry.control.targetLeaseBindingDigest ||
          !entry.control.fixtureBindingDigest ||
          !entry.control.fixtureRuntimeConsumptionBindingDigest ||
          !entry.control.fixtureProjectionMode ||
          entry.control.fixtureRuntimeDispatchCount === null ||
          !entry.control.fixtureRuntimeDispatchDigest ||
          entry.control.fixtureRequestCount === null ||
          entry.control.fixtureDispatchCount === null ||
          entry.control.fixtureResponseCount === null ||
          !entry.control.fixtureDispatchLedgerDigest ||
          !entry.control.fixtureConsumptionLedgerDigest ||
          !entry.behaviorAssertionReceiptDigest ||
          !entry.blackBoxAssertionSetDigest
        ) {
          throw new Error('Browser forgery fixture is incomplete.');
        }
        const fixtureSetDigests = Object.freeze(
          cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
        );
        return {
          ...entry,
          control: Object.freeze({
            ...entry.control,
            fixtureProjectionAuthorityDigest: forgedProjectionAuthorityDigest,
          }),
          behaviorCrossBindingDigest: digestVerificationValue({
            format: 'prodivix.golden-g3-v6-behavior-cross-binding',
            version: 1,
            attemptId: entry.attemptId,
            generation: 1,
            cellId: entry.cellId,
            scenarioId: cell.scenarioId,
            executableSnapshotDigest: entry.executableSnapshotDigest,
            scenarioProgramDigest: entry.scenarioProgramDigest,
            controlProfileDigest: cell.controlProfileRef.digest,
            fixtureSetDigests,
            targetLeaseBindingDigest: entry.control.targetLeaseBindingDigest,
            fixtureBindingDigest: entry.control.fixtureBindingDigest,
            runtimeFixtureBindingDigest:
              entry.control.fixtureRuntimeConsumptionBindingDigest,
            fixtureProjectionAuthorityDigest: forgedProjectionAuthorityDigest,
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
            behaviorAssertionReceiptDigest:
              entry.behaviorAssertionReceiptDigest,
            blackBoxAssertionSetDigest: entry.blackBoxAssertionSetDigest,
          }),
        };
      }
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);
  });

  it('rejects fully rehashed causal Fixture evidence against raw attempt authority', () => {
    const fixture = canonicalManifest();
    const tampered = tamperManifestEntry(
      fixture.manifest,
      ({ executionBoundary, checkKind }) =>
        executionBoundary === 'browser' && checkKind !== 'security',
      ({ entryDigest: _entryDigest, ...entry }) => {
        const cell = fixture.plan.cells.find(({ id }) => id === entry.cellId);
        const control = entry.control;
        if (
          !cell?.scenarioId ||
          !cell.controlProfileRef.digest ||
          !entry.scenarioProgramDigest ||
          !control.targetLeaseBindingDigest ||
          !control.fixtureBindingDigest ||
          !control.fixtureProjectionAuthorityDigest ||
          !control.fixtureProjectionMode ||
          control.fixtureRuntimeDispatchCount === null ||
          !control.fixtureRuntimeDispatchDigest ||
          control.fixtureRequestCount === null ||
          control.fixtureDispatchCount === null ||
          control.fixtureResponseCount === null ||
          !control.fixtureDispatchLedgerDigest ||
          !control.fixtureConsumptionLedgerDigest ||
          !entry.blackBoxAssertionSetDigest
        ) {
          throw new Error('Causal Fixture forgery fixture is incomplete.');
        }
        const fixtureSetDigests = Object.freeze(
          cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
        );
        const fixtureResponseDigest = digest('f');
        const fixtureRuntimeConsumptionBindingDigest = digestVerificationValue({
          format: 'prodivix.browser-runtime-fixture-consumption-binding',
          version: 1,
          fixtureSetDigests,
          fixtureBindingDigest: control.fixtureBindingDigest,
          fixtureRequestCount: control.fixtureRequestCount,
          fixtureDispatchCount: control.fixtureDispatchCount,
          fixtureResponseCount: control.fixtureResponseCount,
          fixtureDispatchLedgerDigest: control.fixtureDispatchLedgerDigest,
          fixtureResponseDigest,
          fixtureResolutionDigest: control.fixtureResolutionDigest,
          fixtureConsumptionLedgerDigest:
            control.fixtureConsumptionLedgerDigest,
        });
        const behaviorAssertionReceiptDigest = digestVerificationValue({
          format: 'prodivix.verification-behavior-assertion-receipt',
          version: 1,
          attemptId: entry.attemptId,
          cellId: entry.cellId,
          scenarioId: cell.scenarioId,
          executableSnapshotDigest: entry.executableSnapshotDigest,
          scenarioProgramDigest: entry.scenarioProgramDigest,
          controlProfileDigest: cell.controlProfileRef.digest,
          fixtureSetDigests,
          targetLeaseBindingDigest: control.targetLeaseBindingDigest,
          runtimeFixtureBindingDigest: fixtureRuntimeConsumptionBindingDigest,
          blackBoxAssertionSetDigest: entry.blackBoxAssertionSetDigest,
        });
        return {
          ...entry,
          control: Object.freeze({
            ...control,
            fixtureResponseDigest,
            fixtureRuntimeConsumptionBindingDigest,
          }),
          behaviorAssertionReceiptDigest,
          behaviorCrossBindingDigest: digestVerificationValue({
            format: 'prodivix.golden-g3-v6-behavior-cross-binding',
            version: 1,
            attemptId: entry.attemptId,
            generation: 1,
            cellId: entry.cellId,
            scenarioId: cell.scenarioId,
            executableSnapshotDigest: entry.executableSnapshotDigest,
            scenarioProgramDigest: entry.scenarioProgramDigest,
            controlProfileDigest: cell.controlProfileRef.digest,
            fixtureSetDigests,
            targetLeaseBindingDigest: control.targetLeaseBindingDigest,
            fixtureBindingDigest: control.fixtureBindingDigest,
            runtimeFixtureBindingDigest: fixtureRuntimeConsumptionBindingDigest,
            fixtureProjectionAuthorityDigest:
              control.fixtureProjectionAuthorityDigest,
            fixtureProjectionMode: control.fixtureProjectionMode,
            fixtureRuntimeDispatchCount: control.fixtureRuntimeDispatchCount,
            fixtureRuntimeDispatchDigest: control.fixtureRuntimeDispatchDigest,
            fixtureRequestCount: control.fixtureRequestCount,
            fixtureDispatchCount: control.fixtureDispatchCount,
            fixtureResponseCount: control.fixtureResponseCount,
            fixtureDispatchLedgerDigest: control.fixtureDispatchLedgerDigest,
            fixtureResponseDigest,
            fixtureResolutionDigest: control.fixtureResolutionDigest,
            fixtureConsumptionLedgerDigest:
              control.fixtureConsumptionLedgerDigest,
            behaviorAssertionReceiptDigest,
            blackBoxAssertionSetDigest: entry.blackBoxAssertionSetDigest,
          }),
        };
      }
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        tampered,
        fixture.plan,
        fixture.matrix,
        fixture.authority
      )
    ).toThrow(/actual attempt authority/u);
  });

  it('rejects missing one-to-one raw authority coordinates and owner receipts', () => {
    const fixture = canonicalManifest();
    const duplicateCoordinate = tamperAuthorityEntry(
      fixture.authority,
      1,
      (entry) =>
        Object.freeze({
          ...entry,
          cellId: fixture.authority.entries[0]!.cellId,
          providerId: fixture.authority.entries[0]!.providerId,
        })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        fixture.manifest,
        fixture.plan,
        fixture.matrix,
        duplicateCoordinate
      )
    ).toThrow(/authority is incomplete/u);

    const firstBrowserIndex = fixture.authority.entries.findIndex(
      ({ executionBoundary }) => executionBoundary === 'browser'
    );
    const secondBrowser = fixture.authority.entries
      .slice(firstBrowserIndex + 1)
      .find(({ executionBoundary }) => executionBoundary === 'browser');
    if (firstBrowserIndex < 0 || !secondBrowser) {
      throw new Error('Browser authority fixtures are unavailable.');
    }
    const duplicateReceipt = tamperAuthorityEntry(
      fixture.authority,
      firstBrowserIndex,
      (entry) =>
        Object.freeze({
          ...entry,
          behaviorAssertionReceiptDigest:
            secondBrowser.behaviorAssertionReceiptDigest,
        })
    );
    expect(() =>
      assertGoldenG3V6CanonicalAttemptManifest(
        fixture.manifest,
        fixture.plan,
        fixture.matrix,
        duplicateReceipt
      )
    ).toThrow(/authority is incomplete/u);
  });
});
