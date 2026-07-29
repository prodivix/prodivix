import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from '@prodivix/verification';
import { executeGoldenG3V6ControlledAdapterMatrix } from './goldenG3V6BrowserMatrixExecution';

describe('Golden G3 V6 controlled 66-cell / 80-attempt matrix', () => {
  it('reports every static, Browser, Remote Preview, Export, and CI attempt without skips', async () => {
    const evidence = await executeGoldenG3V6ControlledAdapterMatrix();

    expect(evidence).toMatchObject({
      requiredCellCount: 66,
      aggregateRowCount: 8,
      browserCellCount: 58,
      browserAttemptCount: 72,
      staticAttemptCount: 8,
      totalAttemptCount: 80,
      statusCounters: {
        reported: 80,
        passed: 80,
        blocked: 0,
        unsupported: 0,
        skipped: 0,
        todo: 0,
        failed: 0,
        residual: 0,
      },
      controlledDimensions: {
        controlledDimensionCount: 17,
        suiteCount: 8,
        actualPassedCaseCount: 28,
        ownerPassedCaseCount: 127,
        failedCaseCount: 0,
        skippedCaseCount: 0,
        todoCaseCount: 0,
      },
      staticArtifactRetirement: {
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
        artifactKinds: ['build-log', 'coverage-summary', 'trace'],
      },
      staticRuntimeControl: {
        kind: 'static-adapter-no-runtime-controls',
        controlCapabilityIds: [],
      },
      runtimeControl: {
        attemptCount: 72,
        initialAttestationCount: 72,
        terminalAttestationCount: 72,
        cleanReleaseCount: 72,
        retiredAttemptCount: 72,
        registrySnapshot: {
          registered: 0,
          acquired: 0,
          started: 0,
          released: 0,
          active: 0,
        },
      },
      browserArtifactRetirement: {
        attemptCount: 72,
        retirementReceiptCount: 72,
        retirementCallCount: 72,
        duplicateRetirementCount: 0,
        lateWriteRejectionCount: 0,
        activeAttemptCount: 0,
        activeArtifactCount: 0,
      },
      attemptManifest: {
        requiredCellCount: 66,
        attemptCount: 80,
        browserAttemptCount: 72,
        staticAttemptCount: 8,
      },
    });
    expect(
      evidence.rows.map(({ requiredCellCount }) => requiredCellCount)
    ).toEqual([7, 7, 10, 10, 12, 12, 4, 4]);
    expect(evidence.rows.map(({ attemptCount }) => attemptCount)).toEqual([
      14, 14, 10, 10, 12, 12, 4, 4,
    ]);
    expect(evidence.attempts).toHaveLength(72);
    expect(
      evidence.attempts.every(
        ({ result }) =>
          result.status === 'reported' && result.cleanup.status === 'clean'
      )
    ).toBe(true);
    expect(
      evidence.attempts.filter(({ providerMode }) => providerMode === 'remote')
    ).toHaveLength(14);
    expect(evidence.runtimeControl.evidenceSetDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(evidence.attemptManifest.entries).toHaveLength(80);
    expect(
      new Set(
        evidence.attemptManifest.entries.map(({ attemptId }) => attemptId)
      ).size
    ).toBe(80);
    expect(
      new Set(evidence.attemptManifest.entries.map(({ cellId }) => cellId)).size
    ).toBe(66);
    expect(
      evidence.attemptManifest.entries.filter(
        ({ executionBoundary }) => executionBoundary === 'node'
      )
    ).toHaveLength(8);
    const toolchainProjectionEntries = evidence.attemptManifest.entries.filter(
      ({ toolchainProjectionAuthorityReceiptDigest }) =>
        toolchainProjectionAuthorityReceiptDigest !== null
    );
    expect(toolchainProjectionEntries).toHaveLength(8);
    expect(
      new Set(
        toolchainProjectionEntries.map(
          ({ toolchainProjectionAuthorityReceiptDigest }) =>
            toolchainProjectionAuthorityReceiptDigest
        )
      ).size
    ).toBe(2);
    expect(
      toolchainProjectionEntries.every(
        ({ executionBoundary, toolchainProjectionAuthorityReceiptDigest }) =>
          executionBoundary === 'node' &&
          /^sha256-[a-f0-9]{64}$/u.test(
            toolchainProjectionAuthorityReceiptDigest ?? ''
          )
      )
    ).toBe(true);
    expect(
      evidence.attemptManifest.entries
        .filter(({ executionBoundary }) => executionBoundary === 'browser')
        .every(
          ({ toolchainProjectionAuthorityReceiptDigest }) =>
            toolchainProjectionAuthorityReceiptDigest === null
        )
    ).toBe(true);
    expect(evidence.attemptManifest.manifestDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(evidence.attemptAuthority.entries).toHaveLength(80);
    expect(evidence.attemptManifest.attemptAuthorityDigest).toBe(
      evidence.attemptAuthority.authorityDigest
    );
    expect(evidence.controlledEnvironment).toMatchObject({
      browserAttemptCount: 72,
      staticAttemptCount: 8,
      nodeVersion: '22.23.1',
      pnpmVersion: '11.9.0',
    });
    expect(evidence.controlledEnvironment.attemptBindings).toHaveLength(80);
    expect(
      evidence.controlledEnvironment.staticRuntimeEnvironments.every(
        (environment) =>
          environment.networkMode === 'none' &&
          environment.liveEgressAttemptCount >= 5 &&
          environment.liveEgressSuccessCount === 0 &&
          environment.hostMountCount === 0 &&
          /^sha256-[a-f0-9]{64}$/u.test(environment.nodeBinaryDigest)
      )
    ).toBe(true);
    const diagnosticProjectionEntries = evidence.attemptManifest.entries.filter(
      ({ workspaceDiagnosticProjectionReceiptDigest }) =>
        workspaceDiagnosticProjectionReceiptDigest !== null
    );
    expect(diagnosticProjectionEntries).toHaveLength(2);
    expect(
      diagnosticProjectionEntries.every(
        ({
          executionBoundary,
          checkKind,
          workspaceDiagnosticProjectionReceiptDigest,
        }) =>
          executionBoundary === 'node' &&
          checkKind === 'diagnostics' &&
          /^sha256-[a-f0-9]{64}$/u.test(
            workspaceDiagnosticProjectionReceiptDigest ?? ''
          )
      )
    ).toBe(true);
    expect(evidence.attemptManifest.controlledEnvironmentDigest).toBe(
      evidence.controlledEnvironment.evidenceDigest
    );
    expect(evidence.attemptAuthority.controlledEnvironmentDigest).toBe(
      evidence.controlledEnvironment.evidenceDigest
    );
    expect(
      evidence.attempts.every(({ runtimeControlEvidence }) =>
        [
          runtimeControlEvidence.initialAttestationDigest,
          runtimeControlEvidence.terminalAttestationDigest,
          runtimeControlEvidence.cleanupCanaryDigest,
          runtimeControlEvidence.releaseReceiptDigest,
          runtimeControlEvidence.retirementEvidenceDigest,
          runtimeControlEvidence.evidenceDigest,
        ].every((digest) => /^sha256-[a-f0-9]{64}$/u.test(digest))
      )
    ).toBe(true);

    const securityAttempts = evidence.attempts.filter(
      ({ checkKind }) => checkKind === 'security'
    );
    const authenticatedAttempts = evidence.attempts.filter(
      ({ checkKind }) => checkKind !== 'security'
    );
    expect(securityAttempts).toHaveLength(8);
    expect(authenticatedAttempts).toHaveLength(64);
    expect(evidence.runtimeControl).toMatchObject({
      compilerFixtureProjectionAttemptCount: 64,
      productionNoFixtureAttemptCount: 8,
      fixtureRuntimeDispatchCount: 64,
      fixtureRequestCount: 64,
      fixtureDispatchCount: 64,
      fixtureResponseCount: 64,
    });
    expect(
      securityAttempts.every(
        ({
          runtimeControlEvidence,
          securityBundleEvidenceDigest,
          productionFixtureAbsenceReceipt,
          productionFixtureAbsenceReceiptDigest,
          productionSecurityAuthority,
        }) =>
          runtimeControlEvidence.fixtureProjectionMode ===
            'production-no-fixture' &&
          runtimeControlEvidence.fixtureRuntimeDispatchCount === 0 &&
          runtimeControlEvidence.fixtureRequestCount === 0 &&
          runtimeControlEvidence.fixtureDispatchCount === 0 &&
          runtimeControlEvidence.fixtureResponseCount === 0 &&
          runtimeControlEvidence.fixtureDispatchLedgerDigest ===
            digestVerificationValue([]) &&
          runtimeControlEvidence.fixtureResponseDigest === null &&
          runtimeControlEvidence.fixtureResolutionDigest === null &&
          runtimeControlEvidence.fixtureConsumptionLedgerDigest ===
            digestVerificationValue([]) &&
          /^sha256-[a-f0-9]{64}$/u.test(
            runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest
          ) &&
          securityBundleEvidenceDigest !== undefined &&
          productionSecurityAuthority !== undefined &&
          productionFixtureAbsenceReceipt !== undefined &&
          productionFixtureAbsenceReceiptDigest ===
            productionFixtureAbsenceReceipt.receiptDigest
      )
    ).toBe(true);
    expect(
      authenticatedAttempts.every(
        ({
          runtimeControlEvidence,
          securityBundleEvidenceDigest,
          productionFixtureAbsenceReceipt,
          productionFixtureAbsenceReceiptDigest,
          productionSecurityAuthority,
        }) =>
          runtimeControlEvidence.fixtureProjectionMode ===
            'compiler-auth-fixture' &&
          runtimeControlEvidence.fixtureRuntimeDispatchCount === 1 &&
          runtimeControlEvidence.fixtureRequestCount === 1 &&
          runtimeControlEvidence.fixtureDispatchCount === 1 &&
          runtimeControlEvidence.fixtureResponseCount === 1 &&
          [
            runtimeControlEvidence.fixtureDispatchLedgerDigest,
            runtimeControlEvidence.fixtureResponseDigest,
            runtimeControlEvidence.fixtureResolutionDigest,
            runtimeControlEvidence.fixtureConsumptionLedgerDigest,
            runtimeControlEvidence.fixtureRuntimeConsumptionBindingDigest,
          ].every(
            (digest) => digest !== null && /^sha256-[a-f0-9]{64}$/u.test(digest)
          ) &&
          securityBundleEvidenceDigest === undefined &&
          productionSecurityAuthority === undefined &&
          productionFixtureAbsenceReceipt === undefined &&
          productionFixtureAbsenceReceiptDigest === undefined
      )
    ).toBe(true);
    expect(
      evidence.attemptManifest.entries.filter(
        ({ productionFixtureAbsenceReceiptDigest }) =>
          productionFixtureAbsenceReceiptDigest !== null
      )
    ).toHaveLength(8);
    expect(
      evidence.attemptAuthority.entries.filter(
        ({ productionFixtureAbsenceReceiptDigest }) =>
          productionFixtureAbsenceReceiptDigest !== null
      )
    ).toHaveLength(8);
    const browserManifestEntries = evidence.attemptManifest.entries.filter(
      ({ executionBoundary }) => executionBoundary === 'browser'
    );
    expect(browserManifestEntries).toHaveLength(72);
    expect(
      browserManifestEntries.every(
        ({
          behaviorAssertionReceiptDigest,
          blackBoxAssertionSetDigest,
          behaviorCrossBindingDigest,
        }) =>
          [
            behaviorAssertionReceiptDigest,
            blackBoxAssertionSetDigest,
            behaviorCrossBindingDigest,
          ].every(
            (digest) => digest !== null && /^sha256-[a-f0-9]{64}$/u.test(digest)
          )
      )
    ).toBe(true);

    const previewByCell = new Map<
      string,
      (typeof evidence.attempts)[number][]
    >();
    for (const attempt of evidence.attempts.filter(
      ({ providerMode }) =>
        providerMode === 'browser' || providerMode === 'remote'
    )) {
      const values = previewByCell.get(attempt.cellId) ?? [];
      values.push(attempt);
      previewByCell.set(attempt.cellId, values);
    }
    expect(previewByCell.size).toBe(14);
    for (const attempts of previewByCell.values()) {
      expect(attempts).toHaveLength(2);
      expect(new Set(attempts.map(({ providerId }) => providerId)).size).toBe(
        2
      );
      expect(
        new Set(attempts.map(({ targetOriginDigest }) => targetOriginDigest))
          .size
      ).toBe(2);
    }

    expect(evidence.evidenceDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    console.info(
      `[g3-v6] cells=66 rows=8 browser-attempts=72 static-attempts=8 total-attempts=80 plan=${evidence.planDigest} matrix=${evidence.manifestDigest} attempts=${evidence.attemptManifest.manifestDigest} adapters=${evidence.adapterRegistryDigest} browser-identities=${evidence.browserIdentityRegistryDigest} visual-identities=${evidence.visualIdentityManifestDigest} baseline-set=${evidence.visualBaselineSetDigest} baseline-asset=${evidence.visualBaselineAssetDigest} baseline-raster=${evidence.visualBaselineRasterDigest} visual-normalizer=${evidence.visualNormalizerDigest} controlled-manifest=${evidence.controlledDimensions.manifestDigest} controlled-evidence=${evidence.controlledDimensions.evidenceDigest} controlled-environment=${evidence.controlledEnvironment.evidenceDigest} runtime-controls=${evidence.runtimeControl.evidenceSetDigest} evidence=${evidence.evidenceDigest}`
    );
    for (const row of evidence.rows) {
      console.info(
        `[g3-v6] row=${row.rowId} cells=${row.requiredCellCount} attempts=${row.attemptCount}`
      );
    }
  }, 1_800_000);
});
