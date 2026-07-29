import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  createExecutionTestReport,
  decodeExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { normalizeVerificationCheckReportCandidate } from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR,
  INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
  TEST_VERIFICATION_RESULT_MEDIA_TYPE,
  UNIT_VERIFICATION_ADAPTER_DESCRIPTOR,
  UNIT_VERIFICATION_ADAPTER_REGISTRATION,
  createIntegrationVerificationAdapter,
  createUnitVerificationAdapter,
  digestVerificationAdapterBytes,
  encodeCanonicalExecutionTestReport,
  encodeTestVerificationResult,
  type IntegrationVerificationResultInput,
} from './index';
import {
  adapterHarness,
  artifactSource,
  buildBundleBytes,
  cellFor,
  prepareHarnessInvocation,
  reportBytes,
  sha,
  testResultInput,
  utf8,
  type InputEntry,
} from './__tests__/verificationAdapterTestHarness';

const unitCell = () =>
  cellFor(
    UNIT_VERIFICATION_ADAPTER_REGISTRATION,
    'unit',
    'ci',
    ['test-report'],
    ['coverage-summary']
  );

const unitEntries = (
  report: Uint8Array,
  result: Uint8Array
): readonly InputEntry[] =>
  Object.freeze([
    {
      id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testReport,
      kind: 'test-report',
      mediaType: EXECUTION_TEST_REPORT_MEDIA_TYPE,
      bytes: report,
    },
    {
      id: FIRST_PARTY_VERIFICATION_INPUT_IDS.testResult,
      kind: 'test-report',
      mediaType: TEST_VERIFICATION_RESULT_MEDIA_TYPE,
      bytes: result,
    },
  ]);

const integrationCell = (fixtureDigest: string) =>
  cellFor(
    INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
    'integration',
    'ci',
    ['executable-snapshot', 'test-report'],
    ['coverage-summary', 'trace'],
    { fixtureDigest }
  );

const integrationResultInput = (
  cell: ReturnType<typeof integrationCell>,
  executable: Uint8Array,
  report: Uint8Array,
  fixtureDigest: string
): IntegrationVerificationResultInput => {
  const snapshotDigest = decodeExecutionBuildBundle(executable).snapshotDigest;
  return {
    ...testResultInput(
      cell,
      report,
      [
        artifactSource('coverage-summary', { subjectDigest: snapshotDigest }),
        artifactSource('trace', {
          traceKind: 'integration',
          subjectDigest: snapshotDigest,
        }),
      ],
      { snapshotDigest }
    ),
    checkKind: 'integration',
    executableBundleDigest: digestVerificationAdapterBytes(executable),
    fixtureSetDigests: [fixtureDigest],
    isolation: {
      lifecycle: 'ephemeral',
      network: 'fixture-only',
      liveEgress: false,
    },
  };
};

const integrationEntries = (
  executable: Uint8Array,
  report: Uint8Array,
  result: Uint8Array
): readonly InputEntry[] =>
  Object.freeze([
    {
      id: FIRST_PARTY_VERIFICATION_INPUT_IDS.integrationExecutable,
      kind: 'executable-snapshot',
      mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
      bytes: executable,
    },
    ...unitEntries(report, result),
  ]);

describe('unit and integration verification adapter conformance', () => {
  it('exports the controlled Golden V6 test descriptors', () => {
    expect(UNIT_VERIFICATION_ADAPTER_DESCRIPTOR).toMatchObject({
      id: 'adapter:g3-v6:unit',
      checkKinds: ['unit'],
      surfaces: ['ci'],
      inputKinds: ['test-report'],
      artifactKinds: ['coverage-summary'],
    });
    expect(INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR).toMatchObject({
      id: 'adapter:g3-v6:integration',
      checkKinds: ['integration'],
      surfaces: ['ci'],
      inputKinds: ['executable-snapshot', 'test-report'],
      artifactKinds: ['coverage-summary', 'trace'],
    });
  });

  it('maps canonical ExecutionTestReport without leaking tool-private failure text', async () => {
    const cell = unitCell();
    const passedReport = reportBytes();
    const passedResult = encodeTestVerificationResult(
      testResultInput(cell, passedReport, [artifactSource('coverage-summary')])
    );
    const passed = adapterHarness(
      UNIT_VERIFICATION_ADAPTER_REGISTRATION,
      createUnitVerificationAdapter,
      cell,
      unitEntries(passedReport, passedResult)
    );
    const passedInvocation = await prepareHarnessInvocation(passed);
    const passedCandidate = await passed.adapter.execute(
      passedInvocation,
      passed.sink
    );
    expect(passedCandidate.payload).toMatchObject({
      kind: 'unit',
      suites: [{ status: 'passed', cases: [{ status: 'passed' }] }],
    });

    const failedReport = reportBytes('failed');
    const failedResult = encodeTestVerificationResult(
      testResultInput(
        cell,
        failedReport,
        [artifactSource('coverage-summary')],
        { status: 'failed', exitCode: 1 }
      )
    );
    const failed = adapterHarness(
      UNIT_VERIFICATION_ADAPTER_REGISTRATION,
      createUnitVerificationAdapter,
      cell,
      unitEntries(failedReport, failedResult)
    );
    const failedInvocation = await prepareHarnessInvocation(failed);
    const failedCandidate = await failed.adapter.execute(
      failedInvocation,
      failed.sink
    );
    expect(
      normalizeVerificationCheckReportCandidate(failedCandidate)
    ).toMatchObject({
      status: 'ready',
      report: {
        verdict: 'failed',
        failureClass: 'product-assertion-finding',
      },
    });
    expect(JSON.stringify(failedCandidate)).not.toContain(
      'redacted assertion failure'
    );
  });

  it('rejects zero/all-skipped reports, private Vitest JSON, and exit/report drift', async () => {
    const cell = unitCell();
    const skippedReport = reportBytes('skipped');
    const skippedResult = encodeTestVerificationResult(
      testResultInput(cell, skippedReport, [artifactSource('coverage-summary')])
    );
    const skipped = adapterHarness(
      UNIT_VERIFICATION_ADAPTER_REGISTRATION,
      createUnitVerificationAdapter,
      cell,
      unitEntries(skippedReport, skippedResult)
    );
    await expect(skipped.adapter.prepare(skipped.prepareInput)).rejects.toThrow(
      /zero runnable cases|only skipped/u
    );

    const privateJson = utf8(
      canonicalJsonText({
        success: true,
        testResults: [{ assertionResults: [] }],
      })
    );
    const privateResult = encodeTestVerificationResult(
      testResultInput(cell, privateJson, [artifactSource('coverage-summary')])
    );
    const privateHarness = adapterHarness(
      UNIT_VERIFICATION_ADAPTER_REGISTRATION,
      createUnitVerificationAdapter,
      cell,
      unitEntries(privateJson, privateResult)
    );
    await expect(
      privateHarness.adapter.prepare(privateHarness.prepareInput)
    ).rejects.toThrow(/ExecutionTestReport/u);

    const passedReport = reportBytes();
    const driftedResult = encodeTestVerificationResult(
      testResultInput(
        cell,
        passedReport,
        [artifactSource('coverage-summary')],
        { status: 'failed', exitCode: 1 }
      )
    );
    const exitDrift = adapterHarness(
      UNIT_VERIFICATION_ADAPTER_REGISTRATION,
      createUnitVerificationAdapter,
      cell,
      unitEntries(passedReport, driftedResult)
    );
    await expect(
      exitDrift.adapter.prepare(exitDrift.prepareInput)
    ).rejects.toThrow(/status, or exit result drifted/u);
  });

  it('normalizes Windows and POSIX absolute reporter identities into stable opaque tokens', async () => {
    const cell = unitCell();
    const sourceTrace = [
      {
        sourceRef: {
          kind: 'code-artifact' as const,
          artifactId: 'artifact:catalog-test',
        },
        sourceSpan: {
          artifactId: 'artifact:catalog-test',
          startLine: 1,
          startColumn: 1,
          endLine: 3,
          endColumn: 1,
        },
      },
    ];
    const candidateForPath = async (
      path: string,
      includeSourceTrace: boolean
    ) => {
      const report = encodeCanonicalExecutionTestReport(
        createExecutionTestReport({
          reportId: `report:${digestVerificationAdapterBytes(utf8(path))}`,
          tool: { name: 'vitest', version: '4.1.9' },
          files: [
            {
              fileId: path,
              path,
              status: 'passed',
              ...(includeSourceTrace ? { sourceTrace } : {}),
              cases: [
                {
                  caseId: `case:${path.length}:${path}:catalog renders`,
                  name: 'catalog renders',
                  fullName: 'catalog renders',
                  status: 'passed',
                  ...(includeSourceTrace ? { sourceTrace } : {}),
                },
              ],
            },
          ],
        })
      );
      const result = encodeTestVerificationResult(
        testResultInput(cell, report, [artifactSource('coverage-summary')])
      );
      const harness = adapterHarness(
        UNIT_VERIFICATION_ADAPTER_REGISTRATION,
        createUnitVerificationAdapter,
        cell,
        unitEntries(report, result)
      );
      const invocation = await prepareHarnessInvocation(harness);
      return harness.adapter.execute(invocation, harness.sink);
    };

    const windowsPath = 'C:\\temp\\run-17\\src\\catalog.test.ts';
    const posixPath = '/tmp/run-99/src/catalog.test.ts';
    const windows = await candidateForPath(windowsPath, true);
    const posix = await candidateForPath(posixPath, true);
    const windowsWithoutTrace = await candidateForPath(windowsPath, false);
    const posixWithoutTrace = await candidateForPath(posixPath, false);
    expect(windows.payload).toMatchObject({
      kind: 'unit',
      suites: [
        {
          suiteId: expect.stringMatching(/^suite:sha256-[a-f0-9]{64}$/u),
          cases: [
            {
              caseId: expect.stringMatching(/^case:sha256-[a-f0-9]{64}$/u),
            },
          ],
        },
      ],
    });
    expect(windows.payload).toEqual(posix.payload);
    expect(windowsWithoutTrace.payload).toEqual(posixWithoutTrace.payload);
    expect(JSON.stringify(windows)).not.toContain(windowsPath);
    expect(JSON.stringify(posix)).not.toContain(posixPath);
    expect(JSON.stringify(windowsWithoutTrace)).not.toContain(windowsPath);
    expect(JSON.stringify(posixWithoutTrace)).not.toContain(posixPath);
  });

  it('binds integration to exact executable, fixture, control, and isolated network policy', async () => {
    const fixtureDigest = sha('fixture');
    const cell = integrationCell(fixtureDigest);
    const executable = buildBundleBytes();
    expect(digestVerificationAdapterBytes(executable)).not.toBe(
      sha('snapshot')
    );
    const report = reportBytes();
    const baseResult = integrationResultInput(
      cell,
      executable,
      report,
      fixtureDigest
    );
    const result = encodeTestVerificationResult(baseResult);
    const entries = integrationEntries(executable, report, result);
    const harness = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      entries
    );
    const invocation = await prepareHarnessInvocation(harness);
    const candidate = await harness.adapter.execute(invocation, harness.sink);
    expect(candidate.payload).toMatchObject({
      kind: 'integration',
      suites: [{ cases: [{ status: 'passed' }] }],
    });

    const liveEgressValue = JSON.parse(
      new TextDecoder().decode(result)
    ) as Record<string, unknown>;
    liveEgressValue.isolation = {
      lifecycle: 'ephemeral',
      network: 'fixture-only',
      liveEgress: true,
    };
    const liveEgress = utf8(canonicalJsonText(liveEgressValue));
    const denied = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      integrationEntries(executable, report, liveEgress)
    );
    await expect(denied.adapter.prepare(denied.prepareInput)).rejects.toThrow(
      /live egress disabled/u
    );

    const fixtureDrift = encodeTestVerificationResult({
      ...baseResult,
      fixtureSetDigests: [sha('wrong-fixture')],
    });
    const fixtureHarness = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      integrationEntries(executable, report, fixtureDrift)
    );
    await expect(
      fixtureHarness.adapter.prepare(fixtureHarness.prepareInput)
    ).rejects.toThrow(/fixture set digest/u);

    const controlDrift = encodeTestVerificationResult({
      ...baseResult,
      controlProfileDigest: sha('wrong-control'),
    });
    const controlHarness = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      integrationEntries(executable, report, controlDrift)
    );
    await expect(
      controlHarness.adapter.prepare(controlHarness.prepareInput)
    ).rejects.toThrow(/controls/u);
  });

  it('rejects integration executable digest, snapshot, and target drift', async () => {
    const fixtureDigest = sha('fixture');
    const cell = integrationCell(fixtureDigest);
    const executable = buildBundleBytes();
    const report = reportBytes();
    const baseResult = integrationResultInput(
      cell,
      executable,
      report,
      fixtureDigest
    );

    for (const resultInput of [
      {
        ...baseResult,
        executableBundleDigest: sha('wrong-executable'),
      },
      {
        ...baseResult,
        snapshotDigest: sha('wrong-snapshot'),
        artifacts: [
          artifactSource('coverage-summary', {
            subjectDigest: sha('wrong-snapshot'),
          }),
          artifactSource('trace', {
            traceKind: 'integration',
            subjectDigest: sha('wrong-snapshot'),
          }),
        ],
      },
    ]) {
      const result = encodeTestVerificationResult(resultInput);
      const harness = adapterHarness(
        INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
        createIntegrationVerificationAdapter,
        cell,
        integrationEntries(executable, report, result)
      );
      await expect(
        harness.adapter.prepare(harness.prepareInput)
      ).rejects.toThrow(/exact executable snapshot/u);
    }

    const driftedSnapshot = sha('drifted-executable-snapshot');
    const wrongSnapshotExecutable = buildBundleBytes({
      snapshotDigest: driftedSnapshot,
    });
    const wrongSnapshotResult = encodeTestVerificationResult({
      ...integrationResultInput(
        cell,
        wrongSnapshotExecutable,
        report,
        fixtureDigest
      ),
      snapshotDigest: driftedSnapshot,
    });
    const snapshotContextHarness = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      integrationEntries(wrongSnapshotExecutable, report, wrongSnapshotResult)
    );
    await expect(
      snapshotContextHarness.adapter.prepare(
        snapshotContextHarness.prepareInput
      )
    ).rejects.toThrow(/target or snapshot/u);

    const wrongTargetExecutable = buildBundleBytes({ presetId: 'vue-vite' });
    const wrongTargetResult = encodeTestVerificationResult(
      integrationResultInput(cell, wrongTargetExecutable, report, fixtureDigest)
    );
    const targetHarness = adapterHarness(
      INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
      createIntegrationVerificationAdapter,
      cell,
      integrationEntries(wrongTargetExecutable, report, wrongTargetResult)
    );
    await expect(
      targetHarness.adapter.prepare(targetHarness.prepareInput)
    ).rejects.toThrow(/target or snapshot/u);
  });
});
