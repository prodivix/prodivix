import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  type ExecutionBuildBundle,
  type ExecutionTestReport,
  type ExecutionTestStatus,
} from '@prodivix/runtime-core';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationAdapterFactory,
  type VerificationPlanCell,
  type VerificationTestSuiteReport,
} from '@prodivix/verification';
import {
  BUILD_VERIFICATION_ADAPTER_DESCRIPTOR,
  BUILD_VERIFICATION_ADAPTER_TOOL,
  DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR,
  DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL,
  INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR,
  INTEGRATION_VERIFICATION_ADAPTER_TOOL,
  UNIT_VERIFICATION_ADAPTER_DESCRIPTOR,
  UNIT_VERIFICATION_ADAPTER_TOOL,
} from './verificationAdapterDescriptors';
import {
  BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
  TEST_VERIFICATION_RESULT_MEDIA_TYPE,
  createExecutionBuildOutputManifestDigest,
  decodeBuildVerificationResult,
  decodeCanonicalExecutionBuildBundle,
  decodeCanonicalExecutionTestReport,
  decodeDiagnosticVerificationSnapshot,
  decodeTestVerificationResult,
  digestVerificationAdapterBytes,
  type IntegrationVerificationResult,
  type TestVerificationResult,
} from './verificationAdapterInputs';
import {
  VerificationAdapterContractError,
  createStaticVerificationAdapterFactory,
  type StaticVerificationProjection,
} from './staticVerificationAdapter';

export const FIRST_PARTY_VERIFICATION_INPUT_IDS = Object.freeze({
  diagnosticSnapshot: 'diagnostics.snapshot',
  buildBundle: 'build.bundle',
  buildResult: 'build.result',
  testReport: 'test.report',
  testResult: 'test.result',
  integrationExecutable: 'integration.executable',
});

const contractError = (message: string): VerificationAdapterContractError =>
  new VerificationAdapterContractError('VER-4001', message);

const controlProfileDigest = (cell: VerificationPlanCell): string => {
  const value = cell.controlProfileRef.digest;
  if (!value) {
    throw contractError('Plan cell control profile is not digest-bound.');
  }
  return value;
};

const validateCellInputDigest = (
  cell: VerificationPlanCell,
  actual: string
): void => {
  if (actual !== cell.inputDigest) {
    throw contractError(
      'Verification result does not bind the exact Plan cell input digest.'
    );
  }
};

const validateBundleBinding = (
  bundle: ExecutionBuildBundle,
  cell: VerificationPlanCell,
  executableSnapshotDigest: string
): void => {
  if (
    bundle.target.presetId !== cell.frameworkTarget ||
    bundle.snapshotDigest !== executableSnapshotDigest
  ) {
    throw contractError(
      'ExecutionBuildBundle target or snapshot does not match the exact Plan execution context.'
    );
  }
};

const completed = (exitCode: number) =>
  Object.freeze({
    status: 'completed' as const,
    complete: true as const,
    exitCode,
  });

const testCaseStatus = (
  status: ExecutionTestStatus
): VerificationTestSuiteReport['cases'][number]['status'] => status;

const sourceTraceDigest = (
  sourceTrace: ExecutionTestReport['files'][number]['sourceTrace']
): string | undefined =>
  sourceTrace && sourceTrace.length > 0
    ? digestVerificationValue(sourceTrace)
    : undefined;

const caseIdentityDigest = (
  testCase: ExecutionTestReport['files'][number]['cases'][number]
): string => {
  const traceDigest = sourceTraceDigest(testCase.sourceTrace);
  return digestVerificationValue(
    traceDigest
      ? { sourceTraceDigest: traceDigest }
      : {
          name: testCase.name,
          ...(testCase.fullName ? { fullName: testCase.fullName } : {}),
        }
  );
};

const suiteIdentityDigest = (
  file: ExecutionTestReport['files'][number]
): string => {
  const traceDigest = sourceTraceDigest(file.sourceTrace);
  return digestVerificationValue(
    traceDigest
      ? { sourceTraceDigest: traceDigest }
      : {
          canonicalCaseIdentities: file.cases
            .map(caseIdentityDigest)
            .sort(compareUnicodeCodePoints),
        }
  );
};

const nextOccurrence = (
  occurrences: Map<string, number>,
  identity: string
): number => {
  const occurrence = occurrences.get(identity) ?? 0;
  occurrences.set(identity, occurrence + 1);
  return occurrence;
};

const normalizedCase = (
  suiteIdentity: string,
  testCase: ExecutionTestReport['files'][number]['cases'][number],
  occurrence: number
): VerificationTestSuiteReport['cases'][number] =>
  Object.freeze({
    caseId: `case:${digestVerificationValue({
      suiteIdentity,
      caseIdentity: caseIdentityDigest(testCase),
      occurrence,
    })}`,
    status: testCaseStatus(testCase.status),
    diagnosticCodes: Object.freeze(
      testCase.status === 'failed' ? ['TST-5001'] : []
    ),
    ...(sourceTraceDigest(testCase.sourceTrace)
      ? { sourceTraceDigest: sourceTraceDigest(testCase.sourceTrace)! }
      : {}),
  });

const syntheticFailureCase = (
  owner: Readonly<{ kind: 'file' | 'report'; id: string }>,
  sourceTrace?: ExecutionTestReport['files'][number]['sourceTrace']
): VerificationTestSuiteReport['cases'][number] =>
  Object.freeze({
    caseId: `case:${digestVerificationValue(owner)}`,
    status: 'failed',
    diagnosticCodes: Object.freeze(['TST-5001']),
    ...(sourceTraceDigest(sourceTrace)
      ? { sourceTraceDigest: sourceTraceDigest(sourceTrace)! }
      : {}),
  });

const toVerificationTestSuites = (
  report: ExecutionTestReport
): readonly VerificationTestSuiteReport[] => {
  const totalCases = report.files.reduce(
    (total, file) => total + file.cases.length,
    0
  );
  const runnableCases = report.files.reduce(
    (total, file) =>
      total +
      file.cases.filter(
        ({ status }) => status === 'passed' || status === 'failed'
      ).length,
    0
  );
  if (totalCases === 0 || runnableCases === 0) {
    throw contractError(
      'ExecutionTestReport has zero runnable cases or only skipped/todo cases.'
    );
  }

  const suiteOccurrences = new Map<string, number>();
  const suites: VerificationTestSuiteReport[] = report.files.map((file) => {
    const baseSuiteIdentity = suiteIdentityDigest(file);
    const suiteOccurrence = nextOccurrence(suiteOccurrences, baseSuiteIdentity);
    const suiteId = `suite:${digestVerificationValue({
      baseSuiteIdentity,
      occurrence: suiteOccurrence,
    })}`;
    const caseOccurrences = new Map<string, number>();
    const cases = file.cases.map((testCase) => {
      const identity = caseIdentityDigest(testCase);
      return normalizedCase(
        suiteId,
        testCase,
        nextOccurrence(caseOccurrences, identity)
      );
    });
    if (
      file.status === 'failed' &&
      !cases.some(({ status }) => status === 'failed')
    ) {
      cases.push(
        syntheticFailureCase({ kind: 'file', id: suiteId }, file.sourceTrace)
      );
    }
    return Object.freeze({
      suiteId,
      status: file.status,
      cases: Object.freeze(
        cases.sort((left, right) =>
          compareUnicodeCodePoints(left.caseId, right.caseId)
        )
      ),
    });
  });

  if (
    report.status === 'failed' &&
    !suites.some(({ cases }) => cases.some(({ status }) => status === 'failed'))
  ) {
    const reportSuiteId = `suite:${digestVerificationValue({
      owner: 'report',
      suiteIds: suites
        .map(({ suiteId }) => suiteId)
        .sort(compareUnicodeCodePoints),
    })}`;
    suites.push(
      Object.freeze({
        suiteId: reportSuiteId,
        status: 'failed',
        cases: Object.freeze([
          syntheticFailureCase({ kind: 'report', id: reportSuiteId }),
        ]),
      })
    );
  }
  return Object.freeze(
    suites.sort((left, right) =>
      compareUnicodeCodePoints(left.suiteId, right.suiteId)
    )
  );
};

const validateTestResult = (
  result: TestVerificationResult,
  report: ExecutionTestReport,
  cell: VerificationPlanCell,
  reportBytes: Uint8Array,
  executableSnapshotDigest: string
): void => {
  validateCellInputDigest(cell, result.cellInputDigest);
  if (
    result.checkKind !== cell.checkKind ||
    result.snapshotDigest !== executableSnapshotDigest ||
    result.reportDigest !== digestVerificationAdapterBytes(reportBytes) ||
    result.controlProfileDigest !== controlProfileDigest(cell) ||
    result.status !== report.status ||
    (result.exitCode === 0) !== (report.status === 'passed')
  ) {
    throw contractError(
      'ExecutionTestReport does not bind the exact executable snapshot (target or snapshot mismatch); identity, controls, status, or exit result drifted.'
    );
  }
};

const testProjection = (
  result: TestVerificationResult,
  report: ExecutionTestReport
): StaticVerificationProjection =>
  Object.freeze({
    terminal: completed(result.exitCode),
    payload: Object.freeze({
      kind: result.checkKind,
      suites: toVerificationTestSuites(report),
    }),
    artifacts: result.artifacts,
    diagnosticCodes: Object.freeze(
      report.status === 'failed' ? ['TST-5001'] : []
    ),
  });

export const createDiagnosticsVerificationAdapter: VerificationAdapterFactory =
  createStaticVerificationAdapterFactory({
    descriptor: DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR,
    tool: DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL,
    expectedInputs: Object.freeze([
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot,
        kind: 'diagnostic-snapshot',
        mediaType: DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE,
      }),
    ]),
    prepareProjection: async ({ input, readInput }) => {
      const snapshot = decodeDiagnosticVerificationSnapshot(
        await readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.diagnosticSnapshot)
      );
      validateCellInputDigest(input.cell, snapshot.cellInputDigest);
      const blocking = snapshot.findings.some(
        ({ severity }) => severity === 'error' || severity === 'fatal'
      );
      return Object.freeze({
        terminal: completed(blocking ? 1 : 0),
        payload: Object.freeze({
          kind: 'diagnostics' as const,
          findings: snapshot.findings,
        }),
        artifacts: snapshot.artifacts,
        diagnosticCodes: Object.freeze([]),
      });
    },
  });

export const createBuildVerificationAdapter: VerificationAdapterFactory =
  createStaticVerificationAdapterFactory({
    descriptor: BUILD_VERIFICATION_ADAPTER_DESCRIPTOR,
    tool: BUILD_VERIFICATION_ADAPTER_TOOL,
    expectedInputs: Object.freeze([
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildBundle,
        kind: 'executable-snapshot',
        mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
        maximumBytes: 512 * 1024 * 1024,
      }),
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildResult,
        kind: 'executable-snapshot',
        mediaType: BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
      }),
    ]),
    prepareProjection: async ({ input, readInput }) => {
      const [bundle, result] = await Promise.all([
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.buildBundle).then(
          decodeCanonicalExecutionBuildBundle
        ),
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.buildResult).then(
          decodeBuildVerificationResult
        ),
      ]);
      validateCellInputDigest(input.cell, result.cellInputDigest);
      validateBundleBinding(
        bundle,
        input.cell,
        input.context.executableSnapshotDigest
      );
      if (
        result.snapshotDigest !== bundle.snapshotDigest ||
        !sameCanonicalJson(result.target, bundle.target) ||
        result.outputManifestDigest !==
          createExecutionBuildOutputManifestDigest(bundle)
      ) {
        throw contractError(
          'Build target, snapshot, or output manifest does not match ExecutionBuildBundle.'
        );
      }
      return Object.freeze({
        terminal: completed(result.exitCode),
        payload: Object.freeze({
          kind: 'build' as const,
          outputManifestDigest: result.outputManifestDigest,
          findings: result.findings,
        }),
        artifacts: result.artifacts,
        diagnosticCodes: Object.freeze([]),
      });
    },
  });

export const createUnitVerificationAdapter: VerificationAdapterFactory =
  createStaticVerificationAdapterFactory({
    descriptor: UNIT_VERIFICATION_ADAPTER_DESCRIPTOR,
    tool: UNIT_VERIFICATION_ADAPTER_TOOL,
    expectedInputs: Object.freeze([
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
        kind: 'test-report',
        mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
      }),
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
        kind: 'test-report',
        mediaType: TEST_VERIFICATION_RESULT_MEDIA_TYPE,
      }),
    ]),
    prepareProjection: async ({ input, readInput }) => {
      const [reportBytes, resultBytes] = await Promise.all([
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport),
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult),
      ]);
      const report = decodeCanonicalExecutionTestReport(reportBytes);
      const result = decodeTestVerificationResult(resultBytes);
      if (result.checkKind !== 'unit') {
        throw contractError(
          'Unit adapter received a non-unit result manifest.'
        );
      }
      validateTestResult(
        result,
        report,
        input.cell,
        reportBytes,
        input.context.executableSnapshotDigest
      );
      return testProjection(result, report);
    },
  });

const validateIntegrationFixtureBinding = (
  result: IntegrationVerificationResult,
  cell: VerificationPlanCell
): void => {
  const fixtureDigest = cell.fixtureSetRef?.digest;
  if (
    !fixtureDigest ||
    result.fixtureSetDigests.length !== 1 ||
    result.fixtureSetDigests[0] !== fixtureDigest
  ) {
    throw contractError(
      'Integration result must bind the exact Plan fixture set digest.'
    );
  }
};

export const createIntegrationVerificationAdapter: VerificationAdapterFactory =
  createStaticVerificationAdapterFactory({
    descriptor: INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR,
    tool: INTEGRATION_VERIFICATION_ADAPTER_TOOL,
    expectedInputs: Object.freeze([
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.integrationExecutable,
        kind: 'executable-snapshot',
        mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
        maximumBytes: 512 * 1024 * 1024,
      }),
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
        kind: 'test-report',
        mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
      }),
      Object.freeze({
        id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
        kind: 'test-report',
        mediaType: TEST_VERIFICATION_RESULT_MEDIA_TYPE,
      }),
    ]),
    prepareProjection: async ({ input, readInput }) => {
      const [executableBytes, reportBytes, resultBytes] = await Promise.all([
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.integrationExecutable),
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport),
        readInput(FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult),
      ]);
      const executable = decodeCanonicalExecutionBuildBundle(executableBytes);
      const report = decodeCanonicalExecutionTestReport(reportBytes);
      const result = decodeTestVerificationResult(resultBytes);
      if (result.checkKind !== 'integration') {
        throw contractError(
          'Integration adapter received a non-integration result manifest.'
        );
      }
      validateTestResult(
        result,
        report,
        input.cell,
        reportBytes,
        input.context.executableSnapshotDigest
      );
      validateIntegrationFixtureBinding(result, input.cell);
      validateBundleBinding(
        executable,
        input.cell,
        input.context.executableSnapshotDigest
      );
      if (
        result.executableBundleDigest !==
          digestVerificationAdapterBytes(executableBytes) ||
        result.snapshotDigest !== executable.snapshotDigest
      ) {
        throw contractError(
          'Integration result does not bind the exact executable snapshot.'
        );
      }
      return testProjection(result, report);
    },
  });

export const DIAGNOSTICS_VERIFICATION_ADAPTER_FACTORY =
  createDiagnosticsVerificationAdapter;
export const BUILD_VERIFICATION_ADAPTER_FACTORY =
  createBuildVerificationAdapter;
export const UNIT_VERIFICATION_ADAPTER_FACTORY = createUnitVerificationAdapter;
export const INTEGRATION_VERIFICATION_ADAPTER_FACTORY =
  createIntegrationVerificationAdapter;
