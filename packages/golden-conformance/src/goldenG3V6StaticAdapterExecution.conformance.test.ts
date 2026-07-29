import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  issueCompilerFixtureProjectionReceipt,
  issueWorkspaceDiagnosticProjectionReceipt,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
  type WorkspaceDiagnosticCompilerTarget,
} from '@prodivix/prodivix-compiler';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  prepareGoldenBrowserProject,
  type GoldenPreparedProjectToolchainEvidence,
} from './generatedProjectHarness';
import { createGoldenG3V6Plan } from './goldenG3V6AdapterMatrixFixture';
import {
  createGoldenG3V6ExecutableSnapshotAuthority,
  type GoldenG3V6ExecutableSnapshotAuthority,
} from './goldenG3V6ExecutableSnapshot';
import {
  assertGoldenG3V6RawStaticDiagnosticProjectionAuthority,
  assertGoldenG3V6RawStaticToolchainProjectionAuthority,
} from './goldenG3V6CanonicalAttemptAuthority';
import { executeGoldenG3V6StaticAdapterCells } from './goldenG3V6StaticAdapterExecution';
import {
  createGoldenG3V6StaticInputs,
  type GoldenG3V6FrameworkToolchainEvidence,
  type GoldenG3V6StaticToolchainEvidence,
} from './goldenG3V6StaticAdapterInputs';
import {
  GOLDEN_G3_CATALOG_WORKSPACE,
  GOLDEN_G3_LOGIN_FIXTURE_SET,
  createGoldenG3V6ReactCatalogSnapshot,
  createGoldenG3V6ReactCompilerTarget,
  createGoldenG3V6VueCatalogSnapshot,
  createGoldenG3V6VueCompilerTarget,
} from './goldenG3ScenarioFixture';

const createFrameworkEvidence = (
  authority: GoldenG3V6ExecutableSnapshotAuthority,
  compiler: WorkspaceDiagnosticCompilerTarget,
  toolchain: GoldenPreparedProjectToolchainEvidence
): GoldenG3V6FrameworkToolchainEvidence => {
  const generatedFiles = projectExecutableProjectRuntimeFiles(
    authority.snapshot,
    'test'
  );
  const fixtureProjectionReceipt = issueCompilerFixtureProjectionReceipt({
    snapshot: authority.snapshot,
    fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles,
    buildBundle: toolchain.buildBundle,
  });
  const diagnosticInput =
    Object.freeze<IssueWorkspaceDiagnosticProjectionReceiptInput>({
      workspace: GOLDEN_G3_CATALOG_WORKSPACE,
      snapshot: authority.snapshot,
      compiler,
      testExtensionReceipts: Object.freeze([authority.testExtensionReceipt]),
      fixtureProjectionAuthority: Object.freeze({
        fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
        controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
        generatedFiles,
        buildBundle: toolchain.buildBundle,
        receipt: fixtureProjectionReceipt,
      }),
    });
  return Object.freeze({
    snapshot: authority.snapshot,
    toolchain,
    diagnosticProjection: Object.freeze({
      input: diagnosticInput,
      receipt: issueWorkspaceDiagnosticProjectionReceipt(diagnosticInput),
    }),
  });
};

const gatedDescribe = describe.runIf(
  process.env.PRODIVIX_VERIFY_G3_V6_ADAPTER_MATRIX === '1'
);

gatedDescribe('Golden G3 V6 first-party static adapter execution', () => {
  it('reports all eight real tool outputs through the Core lifecycle', async () => {
    const result = createGoldenG3V6Plan();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const reactAuthority = createGoldenG3V6ExecutableSnapshotAuthority(
      createGoldenG3V6ReactCatalogSnapshot()
    );
    const vueAuthority = createGoldenG3V6ExecutableSnapshotAuthority(
      createGoldenG3V6VueCatalogSnapshot()
    );
    const reactSnapshot = reactAuthority.snapshot;
    const vueSnapshot = vueAuthority.snapshot;
    const reactProject = await prepareGoldenBrowserProject(
      {
        files: projectExecutableProjectRuntimeFiles(reactSnapshot, 'test'),
      },
      { executableSnapshot: reactSnapshot }
    );
    let vueProject:
      Awaited<ReturnType<typeof prepareGoldenBrowserProject>> | undefined;

    try {
      vueProject = await prepareGoldenBrowserProject(
        {
          files: projectExecutableProjectRuntimeFiles(vueSnapshot, 'test'),
        },
        { executableSnapshot: vueSnapshot }
      );
      expect(reactProject.toolchain?.testReport.status).toBe('passed');
      expect(vueProject.toolchain?.testReport.status).toBe('passed');
      if (!reactProject.toolchain || !vueProject.toolchain) {
        throw new Error('Golden V6 projects did not expose toolchain output.');
      }
      const toolchainEvidence: GoldenG3V6StaticToolchainEvidence =
        Object.freeze({
          'react-vite': createFrameworkEvidence(
            reactAuthority,
            createGoldenG3V6ReactCompilerTarget(),
            reactProject.toolchain
          ),
          'vue-vite': createFrameworkEvidence(
            vueAuthority,
            createGoldenG3V6VueCompilerTarget(),
            vueProject.toolchain
          ),
        });
      const reactDiagnosticCell = result.plan.cells.find(
        (cell) =>
          cell.requirement === 'required' &&
          cell.checkKind === 'diagnostics' &&
          cell.frameworkTarget === 'react-vite'
      );
      if (!reactDiagnosticCell) {
        throw new Error('Golden V6 React diagnostic cell is unavailable.');
      }
      expect(() =>
        createGoldenG3V6StaticInputs(reactDiagnosticCell, {
          ...toolchainEvidence,
          'react-vite': {
            ...toolchainEvidence['react-vite'],
            diagnosticProjection: {
              ...toolchainEvidence['react-vite'].diagnosticProjection,
              receipt: {
                ...toolchainEvidence['react-vite'].diagnosticProjection.receipt,
                semanticIndexDigest:
                  'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              },
            },
          },
        })
      ).toThrow(/does not match/u);

      const execution = await executeGoldenG3V6StaticAdapterCells(
        result.plan,
        toolchainEvidence
      );
      const attempts = execution.attempts;
      const diagnosticAttempt = attempts.find((attempt) =>
        result.plan.cells.some(
          ({ id, checkKind }) =>
            id === attempt.cellId && checkKind === 'diagnostics'
        )
      );
      const diagnosticCell = diagnosticAttempt
        ? result.plan.cells.find(({ id }) => id === diagnosticAttempt.cellId)
        : undefined;
      const buildAttempt = attempts.find((attempt) =>
        result.plan.cells.some(
          ({ id, checkKind }) => id === attempt.cellId && checkKind === 'build'
        )
      );
      const buildCell = buildAttempt
        ? result.plan.cells.find(({ id }) => id === buildAttempt.cellId)
        : undefined;
      if (
        !diagnosticAttempt ||
        !diagnosticCell ||
        !buildAttempt ||
        !buildCell ||
        !diagnosticAttempt.workspaceDiagnosticProjectionAuthority
      ) {
        throw new Error(
          'Golden V6 raw diagnostic projection authority fixture is incomplete.'
        );
      }
      expect(() =>
        assertGoldenG3V6RawStaticDiagnosticProjectionAuthority(
          diagnosticAttempt,
          diagnosticCell
        )
      ).not.toThrow();
      expect(() =>
        assertGoldenG3V6RawStaticDiagnosticProjectionAuthority(
          Object.freeze({
            ...diagnosticAttempt,
            workspaceDiagnosticProjectionReceiptDigest: `sha256-${'f'.repeat(64)}`,
          }),
          diagnosticCell
        )
      ).toThrow(/Compiler diagnostic projection receipt/u);
      expect(() =>
        assertGoldenG3V6RawStaticDiagnosticProjectionAuthority(
          Object.freeze({
            ...buildAttempt,
            workspaceDiagnosticProjectionReceiptDigest:
              diagnosticAttempt.workspaceDiagnosticProjectionReceiptDigest,
            workspaceDiagnosticProjectionAuthority:
              diagnosticAttempt.workspaceDiagnosticProjectionAuthority,
          }),
          buildCell
        )
      ).toThrow(/misplaced diagnostic projection authority/u);
      expect(() =>
        assertGoldenG3V6RawStaticToolchainProjectionAuthority(
          diagnosticAttempt,
          diagnosticCell
        )
      ).not.toThrow();
      const oppositeFrameworkAttempt = attempts.find(
        (attempt) =>
          attempt.toolchainProjectionAuthority.receipt.target.presetId !==
          diagnosticCell.frameworkTarget
      );
      if (!oppositeFrameworkAttempt) {
        throw new Error(
          'Golden V6 toolchain projection swap fixture is incomplete.'
        );
      }
      expect(() =>
        assertGoldenG3V6RawStaticToolchainProjectionAuthority(
          Object.freeze({
            ...diagnosticAttempt,
            toolchainProjectionAuthority:
              oppositeFrameworkAttempt.toolchainProjectionAuthority,
            toolchainProjectionAuthorityReceiptDigest:
              oppositeFrameworkAttempt.toolchainProjectionAuthorityReceiptDigest,
            toolchainAuthorityReceiptDigest:
              oppositeFrameworkAttempt.toolchainAuthorityReceiptDigest,
          }),
          diagnosticCell
        )
      ).toThrow(/toolchain projection authority/u);
      expect(() =>
        assertGoldenG3V6RawStaticToolchainProjectionAuthority(
          Object.freeze({
            ...diagnosticAttempt,
            toolchainProjectionAuthority: Object.freeze({
              ...diagnosticAttempt.toolchainProjectionAuthority,
              raw: Object.freeze({
                ...diagnosticAttempt.toolchainProjectionAuthority.raw,
              }),
              receipt: Object.freeze({
                ...diagnosticAttempt.toolchainProjectionAuthority.receipt,
              }),
            }),
          }),
          diagnosticCell
        )
      ).toThrow(/strict Golden decoder/u);
      expect(execution.artifactRetirement).toMatchObject({
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
        evidenceDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
      });
      expect(execution.runtimeControl).toMatchObject({
        kind: 'static-adapter-no-runtime-controls',
        controlCapabilityIds: [],
        controlCapabilitySnapshotDigest: expect.stringMatching(
          /^sha256-[a-f0-9]{64}$/u
        ),
        appliedControlDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
        evidenceDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
      });
      expect(attempts).toHaveLength(8);
      for (const attempt of attempts) {
        expect(attempt.controlCapabilitySnapshotDigest).toBe(
          execution.runtimeControl.controlCapabilitySnapshotDigest
        );
        expect(attempt.appliedControlDigest).toBe(
          execution.runtimeControl.appliedControlDigest
        );
        expect(attempt.retirementEvidenceDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
        const cell = result.plan.cells.find(({ id }) => id === attempt.cellId);
        expect(cell).toBeDefined();
        expect(attempt.result.status).toBe('reported');
        expect(attempt.result.cleanup.status).toBe('clean');
        if (!cell || attempt.result.status !== 'reported') continue;
        expect(attempt.result.report).toMatchObject({
          cellId: cell.id,
          checkKind: cell.checkKind,
          inputDigest: cell.inputDigest,
          adapter: cell.adapter,
          terminal: {
            status: 'completed',
            complete: true,
            exitCode: 0,
          },
        });
        const payload = attempt.result.report.payload;
        expect(attempt.toolchainProjectionAuthorityReceiptDigest).toBe(
          attempt.toolchainProjectionAuthority.receipt.receiptDigest
        );
        expect(() =>
          assertGoldenG3V6RawStaticToolchainProjectionAuthority(attempt, cell)
        ).not.toThrow();
        if (payload.kind === 'diagnostics') {
          if (
            cell.frameworkTarget !== 'react-vite' &&
            cell.frameworkTarget !== 'vue-vite'
          ) {
            throw new Error(
              `Golden V6 diagnostic cell "${cell.id}" has no framework receipt.`
            );
          }
          const receipt =
            toolchainEvidence[cell.frameworkTarget].diagnosticProjection
              .receipt;
          expect(payload.findings).toEqual(receipt.findings);
          expect(attempt.workspaceDiagnosticProjectionReceiptDigest).toBe(
            receipt.receiptDigest
          );
          expect(
            attempt.workspaceDiagnosticProjectionAuthority?.receipt
              .receiptDigest
          ).toBe(receipt.receiptDigest);
        } else if (payload.kind === 'build') {
          expect(payload.findings).toEqual([]);
          expect(attempt.workspaceDiagnosticProjectionReceiptDigest).toBeNull();
          expect(attempt.workspaceDiagnosticProjectionAuthority).toBeNull();
        } else if (payload.kind === 'unit' || payload.kind === 'integration') {
          expect(attempt.workspaceDiagnosticProjectionReceiptDigest).toBeNull();
          expect(attempt.workspaceDiagnosticProjectionAuthority).toBeNull();
          expect(payload.suites.length).toBeGreaterThan(0);
          expect(
            payload.suites.every(
              (suite) =>
                suite.status === 'passed' &&
                suite.cases.length > 0 &&
                suite.cases.every((testCase) => testCase.status === 'passed')
            )
          ).toBe(true);
        } else {
          throw new Error(
            `Golden V6 static cell "${cell.id}" returned unexpected payload "${payload.kind}".`
          );
        }
        expect(attempt.result.report.artifacts).toEqual(
          attempt.result.stagedArtifacts.map(
            ({ stagingArtifactId: _stagingArtifactId, ...artifact }) => artifact
          )
        );
        expect(attempt.result.stagedArtifacts).toHaveLength(
          cell.artifactKinds.length
        );
        expect(attempt.result.resolvedInputSetDigest).toMatch(
          /^sha256-[a-f0-9]{64}$/u
        );
      }

      const checkKinds = attempts
        .map(({ result: attemptResult }) =>
          attemptResult.status === 'reported'
            ? attemptResult.report.checkKind
            : attemptResult.status
        )
        .sort();
      expect(checkKinds).toEqual([
        'build',
        'build',
        'diagnostics',
        'diagnostics',
        'integration',
        'integration',
        'unit',
        'unit',
      ]);
      expect(
        new Set(
          attempts.map(({ result: attemptResult }) =>
            attemptResult.status === 'reported'
              ? attemptResult.report.attemptId
              : undefined
          )
        ).size
      ).toBe(8);
    } finally {
      await reactProject.dispose();
      await vueProject?.dispose();
    }
  }, 180_000);
});
