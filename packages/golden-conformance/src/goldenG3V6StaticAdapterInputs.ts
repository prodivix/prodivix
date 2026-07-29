import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  createExecutionTestReport,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import {
  assertWorkspaceDiagnosticProjectionReceipt,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
  type WorkspaceDiagnosticProjectionReceipt,
} from '@prodivix/prodivix-compiler';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationArtifactKind,
  type VerificationInputKind,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  TEST_VERIFICATION_RESULT_MEDIA_TYPE,
  VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
  VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
  VERIFICATION_TRACE_MEDIA_TYPE,
  createExecutionBuildOutputManifestDigest,
  digestVerificationAdapterBytes,
  encodeBuildVerificationResult,
  encodeCanonicalExecutionTestReport,
  encodeDiagnosticVerificationSnapshot,
  encodeTestVerificationResult,
  encodeVerificationTrace,
  type VerificationAdapterArtifactSource,
} from '@prodivix/verification-adapters';
import {
  GOLDEN_G3_V6_INTEGRATION_CASE_NAME,
  GOLDEN_G3_V6_INTEGRATION_TEST_PATH,
} from './goldenG3V6ExecutableSnapshot';
import type { GoldenPreparedProjectToolchainEvidence } from './generatedProjectHarness';
import { assertGoldenControlledStaticToolchainProjectionAuthority } from './generatedProjectToolchainProjectionAuthority';
import { createGoldenG3V6StaticRuntimeEnvironmentEvidence } from './goldenG3V6ControlledEnvironmentEvidence';
import { GOLDEN_G3_CATALOG_WORKSPACE } from './goldenG3ScenarioFixture';

export type GoldenG3V6StaticInputEntry = Readonly<{
  id: string;
  kind: VerificationInputKind;
  mediaType: string;
  bytes: Uint8Array;
}>;

export type GoldenG3V6StaticInputSet = Readonly<{
  entries: readonly GoldenG3V6StaticInputEntry[];
  executableSnapshotDigest: string;
  runtimeEnvironmentDigest: string;
  toolchainAuthorityReceiptDigest: string;
  toolchainProjectionAuthorityReceiptDigest: string;
  workspaceDiagnosticProjectionReceiptDigest: string | null;
}>;

export type GoldenG3V6FrameworkToolchainEvidence = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  toolchain: GoldenPreparedProjectToolchainEvidence;
  diagnosticProjection: Readonly<{
    input: IssueWorkspaceDiagnosticProjectionReceiptInput;
    receipt: WorkspaceDiagnosticProjectionReceipt;
  }>;
}>;

export type GoldenG3V6StaticToolchainEvidence = Readonly<{
  'react-vite': GoldenG3V6FrameworkToolchainEvidence;
  'vue-vite': GoldenG3V6FrameworkToolchainEvidence;
}>;

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const encodeExecutionBuildBundle = (bundle: ExecutionBuildBundle): Uint8Array =>
  utf8(
    canonicalJsonText({
      format: bundle.format,
      snapshotDigest: bundle.snapshotDigest,
      target: bundle.target,
      files: bundle.files.map((file) => ({
        path: file.path,
        size: file.size,
        digest: file.digest,
        encoding: 'base64',
        contents: Buffer.from(file.contents).toString('base64'),
      })),
    })
  );

const createArtifactSource = (
  cell: VerificationPlanCell,
  kind: VerificationArtifactKind,
  mediaType: string,
  bytes: Uint8Array
): VerificationAdapterArtifactSource =>
  Object.freeze({
    id: `artifact:${digestVerificationValue({
      cellId: cell.id,
      kind,
    }).slice('sha256-'.length)}`,
    kind,
    mediaType,
    bytes: new Uint8Array(bytes),
  });

const frameworkEvidenceForCell = (
  cell: VerificationPlanCell,
  evidence: GoldenG3V6StaticToolchainEvidence
): GoldenG3V6FrameworkToolchainEvidence => {
  if (
    cell.frameworkTarget !== 'react-vite' &&
    cell.frameworkTarget !== 'vue-vite'
  ) {
    throw new Error(
      `Golden V6 static cell "${cell.id}" has unsupported framework "${cell.frameworkTarget}".`
    );
  }
  const targetEvidence = evidence[cell.frameworkTarget];
  if (
    targetEvidence.snapshot.target.presetId !== cell.frameworkTarget ||
    targetEvidence.toolchain.buildBundle.snapshotDigest !==
      targetEvidence.snapshot.contentDigest ||
    targetEvidence.toolchain.buildBundle.target.presetId !==
      cell.frameworkTarget
  ) {
    throw new Error(
      `Golden V6 ${cell.frameworkTarget} toolchain output is not bound to its executable snapshot.`
    );
  }
  assertGoldenControlledStaticToolchainProjectionAuthority(
    targetEvidence.toolchain.projectionAuthority,
    {
      snapshotDigest: targetEvidence.snapshot.contentDigest,
      target: targetEvidence.snapshot.target,
      toolchainAuthorityReceiptDigest:
        targetEvidence.toolchain.authorityReceipt.receiptDigest,
    }
  );
  if (cell.checkKind === 'diagnostics') {
    const { input, receipt } = targetEvidence.diagnosticProjection;
    assertWorkspaceDiagnosticProjectionReceipt(receipt, input);
    if (
      !sameCanonicalJson(input.workspace, GOLDEN_G3_CATALOG_WORKSPACE) ||
      !sameCanonicalJson(input.snapshot, targetEvidence.snapshot) ||
      input.compiler.presetId !== cell.frameworkTarget ||
      !input.fixtureProjectionAuthority ||
      !sameCanonicalJson(
        input.fixtureProjectionAuthority.buildBundle,
        targetEvidence.toolchain.buildBundle
      ) ||
      input.testExtensionReceipts?.length !== 1 ||
      receipt.compilerProjectionDigest !==
        targetEvidence.snapshot.contentDigest ||
      !sameCanonicalJson(receipt.target, targetEvidence.snapshot.target) ||
      receipt.trace.subjectDigest !== targetEvidence.snapshot.contentDigest ||
      receipt.lineage.testExtensionReceiptDigests.length !== 1 ||
      receipt.lineage.fixtureProjectionReceiptDigest !==
        input.fixtureProjectionAuthority.receipt.receiptDigest
    ) {
      throw new Error(
        `Golden V6 ${cell.frameworkTarget} diagnostic owner receipt is not bound to its exact Workspace/Compiler/toolchain lineage.`
      );
    }
  }
  return targetEvidence;
};

const controlledCommandForStage = (
  evidence: GoldenG3V6FrameworkToolchainEvidence,
  stage: 'test' | 'build'
) => {
  const command = evidence.toolchain.authorityReceipt.commands.find(
    (candidate) => candidate.stage === stage
  );
  if (
    !command ||
    command.exitCode === null ||
    command.signal !== null ||
    command.timedOut
  ) {
    throw new Error(
      `Golden V6 ${evidence.snapshot.target.presetId} ${stage} process authority is incomplete.`
    );
  }
  return Object.freeze({
    ...command,
    exitCode: command.exitCode,
  });
};

const controlledLiveEgress = (
  evidence: GoldenG3V6FrameworkToolchainEvidence
): false => {
  if (
    evidence.toolchain.authorityReceipt.isolation.liveEgressSuccessCount !== 0
  ) {
    throw new Error(
      `Golden V6 ${evidence.snapshot.target.presetId} observed forbidden live egress.`
    );
  }
  return false;
};

const diagnosticTraceBytes = (
  evidence: GoldenG3V6FrameworkToolchainEvidence
): Uint8Array => {
  const { trace } = evidence.diagnosticProjection.receipt;
  return encodeVerificationTrace({
    traceKind: trace.traceKind,
    subjectDigest: trace.subjectDigest,
    entries: trace.entries,
  });
};

const integrationTraceBytes = (
  evidence: GoldenG3V6FrameworkToolchainEvidence
): Uint8Array => {
  const report = selectActualTestReport(evidence, 'integration');
  return encodeVerificationTrace({
    traceKind: 'integration',
    subjectDigest: evidence.snapshot.contentDigest,
    entries: report.files.map((file) => ({
      path: file.path,
      sourceTrace: file.sourceTrace?.length
        ? file.sourceTrace
        : [
            {
              sourceRef: {
                kind: 'workspace',
                workspaceId: evidence.snapshot.workspace.workspaceId,
              },
              label: 'Golden integration source',
            },
          ],
      caseIds: file.cases.map(({ caseId }) => caseId),
    })),
  });
};

const selectActualTestReport = (
  evidence: GoldenG3V6FrameworkToolchainEvidence,
  checkKind: 'unit' | 'integration'
): ExecutionTestReport => {
  const expectedUnitCase =
    evidence.snapshot.target.presetId === 'react-vite'
      ? 'exports the React application entry'
      : 'exports the canonical operation manifest';
  const expectedCase =
    checkKind === 'unit'
      ? expectedUnitCase
      : GOLDEN_G3_V6_INTEGRATION_CASE_NAME;
  const expectedPath =
    checkKind === 'unit'
      ? evidence.snapshot.target.presetId === 'react-vite'
        ? 'src/App.test.tsx'
        : 'src/App.test.ts'
      : GOLDEN_G3_V6_INTEGRATION_TEST_PATH;
  const matchingFiles = evidence.toolchain.testReport.files.flatMap((file) => {
    if (file.path !== expectedPath || file.fileId !== expectedPath) {
      return [];
    }
    const matchingCases = file.cases.filter(
      (testCase) => testCase.name === expectedCase
    );
    return matchingCases.length === 0
      ? []
      : [
          Object.freeze({
            ...file,
            status: matchingCases.every(({ status }) => status === 'passed')
              ? ('passed' as const)
              : ('failed' as const),
            cases: Object.freeze(matchingCases),
            failureMessages: Object.freeze(
              matchingCases.flatMap(({ failureMessages }) => failureMessages)
            ),
          }),
        ];
  });
  if (
    matchingFiles.length !== 1 ||
    matchingFiles[0]!.cases.length !== 1 ||
    matchingFiles[0]!.cases[0]!.status !== 'passed'
  ) {
    throw new Error(
      `Golden V6 ${evidence.snapshot.target.presetId} ${checkKind} tool output does not contain its exact passed case.`
    );
  }
  return createExecutionTestReport({
    reportId: `${evidence.toolchain.testReport.reportId}:${checkKind}`,
    tool: evidence.toolchain.testReport.tool,
    ...(evidence.toolchain.testReport.startedAt === undefined
      ? {}
      : { startedAt: evidence.toolchain.testReport.startedAt }),
    ...(evidence.toolchain.testReport.completedAt === undefined
      ? {}
      : { completedAt: evidence.toolchain.testReport.completedAt }),
    files: Object.freeze(matchingFiles),
    failureMessages: Object.freeze(
      matchingFiles.flatMap(({ failureMessages }) => failureMessages)
    ),
  });
};

const artifactsForCell = (
  cell: VerificationPlanCell,
  evidence: GoldenG3V6FrameworkToolchainEvidence
): readonly VerificationAdapterArtifactSource[] => {
  switch (cell.checkKind) {
    case 'diagnostics':
      return Object.freeze([
        createArtifactSource(
          cell,
          'trace',
          VERIFICATION_TRACE_MEDIA_TYPE,
          diagnosticTraceBytes(evidence)
        ),
      ]);
    case 'build':
      return Object.freeze([
        createArtifactSource(
          cell,
          'build-log',
          VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
          evidence.toolchain.buildSummary
        ),
      ]);
    case 'unit':
      return Object.freeze([
        createArtifactSource(
          cell,
          'coverage-summary',
          VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
          evidence.toolchain.coverageSummary
        ),
      ]);
    case 'integration':
      return Object.freeze([
        createArtifactSource(
          cell,
          'coverage-summary',
          VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
          evidence.toolchain.coverageSummary
        ),
        createArtifactSource(
          cell,
          'trace',
          VERIFICATION_TRACE_MEDIA_TYPE,
          integrationTraceBytes(evidence)
        ),
      ]);
    default:
      throw new Error(
        `Golden V6 static executor cannot stage artifacts for "${cell.checkKind}".`
      );
  }
};

export const createGoldenG3V6StaticInputs = (
  cell: VerificationPlanCell,
  toolchainEvidence: GoldenG3V6StaticToolchainEvidence
): GoldenG3V6StaticInputSet => {
  const evidence = frameworkEvidenceForCell(cell, toolchainEvidence);
  if (
    cell.frameworkTarget !== 'react-vite' &&
    cell.frameworkTarget !== 'vue-vite'
  ) {
    throw new Error(
      `Golden V6 static cell "${cell.id}" has unsupported framework "${cell.frameworkTarget}".`
    );
  }
  const runtimeEnvironment = createGoldenG3V6StaticRuntimeEnvironmentEvidence({
    frameworkTarget: cell.frameworkTarget,
    executableSnapshotDigest: evidence.snapshot.contentDigest,
    authorityReceipt: evidence.toolchain.authorityReceipt,
  });
  const environmentBinding = Object.freeze({
    runtimeEnvironmentDigest: runtimeEnvironment.environmentDigest,
    toolchainAuthorityReceiptDigest:
      runtimeEnvironment.toolchainAuthorityReceiptDigest,
    toolchainProjectionAuthorityReceiptDigest:
      evidence.toolchain.projectionAuthority.receipt.receiptDigest,
    workspaceDiagnosticProjectionReceiptDigest:
      cell.checkKind === 'diagnostics'
        ? evidence.diagnosticProjection.receipt.receiptDigest
        : null,
  });
  const artifacts = artifactsForCell(cell, evidence);
  switch (cell.checkKind) {
    case 'diagnostics': {
      const executableSnapshotDigest = evidence.snapshot.contentDigest;
      const diagnosticReceipt = evidence.diagnosticProjection.receipt;
      return Object.freeze({
        ...environmentBinding,
        executableSnapshotDigest,
        entries: Object.freeze([
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
            kind: 'diagnostic-snapshot' as const,
            mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
            bytes: encodeDiagnosticVerificationSnapshot({
              cellInputDigest: cell.inputDigest,
              workspaceSnapshotDigest:
                diagnosticReceipt.workspaceSnapshotDigest,
              semanticIndexDigest: diagnosticReceipt.semanticIndexDigest,
              compilerProjectionDigest:
                diagnosticReceipt.compilerProjectionDigest,
              findings: diagnosticReceipt.findings,
              artifacts,
            }),
          }),
        ]),
      });
    }
    case 'build': {
      const bundle = evidence.toolchain.buildBundle;
      const buildCommand = controlledCommandForStage(evidence, 'build');
      const bytes = encodeExecutionBuildBundle(bundle);
      return Object.freeze({
        ...environmentBinding,
        executableSnapshotDigest: bundle.snapshotDigest,
        entries: Object.freeze([
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildBundle,
            kind: 'executable-snapshot' as const,
            mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
            bytes,
          }),
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildResult,
            kind: 'executable-snapshot' as const,
            mediaType: BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
            bytes: encodeBuildVerificationResult({
              cellInputDigest: cell.inputDigest,
              snapshotDigest: bundle.snapshotDigest,
              target: bundle.target,
              outputManifestDigest:
                createExecutionBuildOutputManifestDigest(bundle),
              status: buildCommand.exitCode === 0 ? 'succeeded' : 'failed',
              exitCode: buildCommand.exitCode,
              findings: Object.freeze([]),
              artifacts,
            }),
          }),
        ]),
      });
    }
    case 'unit':
    case 'integration': {
      const report = encodeCanonicalExecutionTestReport(
        selectActualTestReport(evidence, cell.checkKind)
      );
      const testCommand = controlledCommandForStage(evidence, 'test');
      const testStatus =
        testCommand.exitCode === 0 ? ('passed' as const) : ('failed' as const);
      if (
        (testStatus === 'passed') !==
        (evidence.toolchain.testReport.status === 'passed')
      ) {
        throw new Error(
          `Golden V6 ${cell.frameworkTarget} Test process and report status diverged.`
        );
      }
      const commonResult = {
        cellInputDigest: cell.inputDigest,
        reportDigest: digestVerificationAdapterBytes(report),
        controlProfileDigest: cell.controlProfileRef.digest!,
        status: testStatus,
        exitCode: testCommand.exitCode,
        artifacts,
      };
      if (cell.checkKind === 'unit') {
        const snapshotDigest = evidence.snapshot.contentDigest;
        return Object.freeze({
          ...environmentBinding,
          executableSnapshotDigest: snapshotDigest,
          entries: Object.freeze([
            Object.freeze({
              id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
              kind: 'test-report' as const,
              mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
              bytes: report,
            }),
            Object.freeze({
              id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
              kind: 'test-report' as const,
              mediaType: TEST_VERIFICATION_RESULT_MEDIA_TYPE,
              bytes: encodeTestVerificationResult({
                ...commonResult,
                checkKind: 'unit',
                snapshotDigest,
              }),
            }),
          ]),
        });
      }
      const bundle = evidence.toolchain.buildBundle;
      const bytes = encodeExecutionBuildBundle(bundle);
      return Object.freeze({
        ...environmentBinding,
        executableSnapshotDigest: bundle.snapshotDigest,
        entries: Object.freeze([
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.integrationExecutable,
            kind: 'executable-snapshot' as const,
            mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
            bytes,
          }),
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
            kind: 'test-report' as const,
            mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
            bytes: report,
          }),
          Object.freeze({
            id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
            kind: 'test-report' as const,
            mediaType: TEST_VERIFICATION_RESULT_MEDIA_TYPE,
            bytes: encodeTestVerificationResult({
              ...commonResult,
              checkKind: 'integration',
              snapshotDigest: bundle.snapshotDigest,
              executableBundleDigest: digestVerificationAdapterBytes(bytes),
              fixtureSetDigests: Object.freeze([cell.fixtureSetRef!.digest!]),
              isolation: Object.freeze({
                lifecycle: 'ephemeral',
                network: 'fixture-only',
                liveEgress: controlledLiveEgress(evidence),
              }),
            }),
          }),
        ]),
      });
    }
    default:
      throw new Error(
        `Golden V6 static executor cannot handle "${cell.checkKind}".`
      );
  }
};
