import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  decodeExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  normalizeVerificationCheckReportCandidate,
  type VerificationNormalizedFinding,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import {
  BUILD_VERIFICATION_ADAPTER_DESCRIPTOR,
  BUILD_VERIFICATION_ADAPTER_REGISTRATION,
  BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
  FIRST_PARTY_VERIFICATION_INPUT_IDS,
  createBuildVerificationAdapter,
  createExecutionBuildOutputManifestDigest,
  digestVerificationAdapterBytes,
  encodeBuildVerificationResult,
} from './index';
import {
  adapterHarness,
  artifactSource,
  buildBundleBytes,
  cellFor,
  prepareHarnessInvocation,
  sha,
  type InputEntry,
} from './__tests__/verificationAdapterTestHarness';

const buildCell = () =>
  cellFor(
    BUILD_VERIFICATION_ADAPTER_REGISTRATION,
    'build',
    'export',
    ['executable-snapshot'],
    ['build-log']
  );

const buildEntries = (
  bundleBytes: Uint8Array,
  resultBytes: Uint8Array
): readonly InputEntry[] =>
  Object.freeze([
    {
      id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildBundle,
      kind: 'executable-snapshot',
      mediaType: EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
      bytes: bundleBytes,
    },
    {
      id: FIRST_PARTY_VERIFICATION_INPUT_IDS.buildResult,
      kind: 'executable-snapshot',
      mediaType: BUILD_VERIFICATION_RESULT_MEDIA_TYPE,
      bytes: resultBytes,
    },
  ]);

const buildResultBytes = (
  cell: ReturnType<typeof buildCell>,
  bundleBytes: Uint8Array,
  overrides: Readonly<{
    snapshotDigest?: string;
    outputManifestDigest?: string;
    status?: 'succeeded' | 'failed';
    exitCode?: number;
    findings?: readonly VerificationNormalizedFinding[];
  }> = {}
): Uint8Array => {
  const bundle = decodeExecutionBuildBundle(bundleBytes);
  return encodeBuildVerificationResult({
    cellInputDigest: cell.inputDigest,
    snapshotDigest: overrides.snapshotDigest ?? bundle.snapshotDigest,
    target: bundle.target,
    outputManifestDigest:
      overrides.outputManifestDigest ??
      createExecutionBuildOutputManifestDigest(bundle),
    status: overrides.status ?? 'succeeded',
    exitCode: overrides.exitCode ?? 0,
    findings: overrides.findings ?? [],
    artifacts: [
      artifactSource('build-log', {
        subjectDigest: overrides.snapshotDigest ?? bundle.snapshotDigest,
      }),
    ],
  });
};

describe('build verification adapter conformance', () => {
  it('exports the controlled Golden V6 build descriptor', () => {
    expect(BUILD_VERIFICATION_ADAPTER_DESCRIPTOR).toMatchObject({
      id: 'adapter:g3-v6:build',
      checkKinds: ['build'],
      surfaces: ['export'],
      targets: ['react-vite', 'vue-vite'],
      browserEngines: [],
      inputKinds: ['executable-snapshot'],
      artifactKinds: ['build-log'],
    });
  });

  it('validates target, snapshot, output manifest, exit result, and build-log staging', async () => {
    const cell = buildCell();
    const bundleBytes = buildBundleBytes();
    const bundle = decodeExecutionBuildBundle(bundleBytes);
    expect(digestVerificationAdapterBytes(bundleBytes)).not.toBe(
      bundle.snapshotDigest
    );
    const resultBytes = buildResultBytes(cell, bundleBytes);
    const harness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(bundleBytes, resultBytes)
    );
    const invocation = await prepareHarnessInvocation(harness);
    const candidate = await harness.adapter.execute(invocation, harness.sink);
    expect(candidate).toMatchObject({
      terminal: { status: 'completed', exitCode: 0 },
      payload: {
        kind: 'build',
        outputManifestDigest: createExecutionBuildOutputManifestDigest(bundle),
        findings: [],
      },
      artifacts: [{ id: 'artifact:build-log', kind: 'build-log' }],
    });
    expect(normalizeVerificationCheckReportCandidate(candidate)).toMatchObject({
      status: 'ready',
      report: { verdict: 'passed' },
    });
  });

  it('preserves a structured build failure instead of treating it as adapter infrastructure', async () => {
    const cell = buildCell();
    const bundleBytes = buildBundleBytes();
    const resultBytes = buildResultBytes(cell, bundleBytes, {
      status: 'failed',
      exitCode: 1,
      findings: [
        {
          ruleId: 'build.compile-failed',
          severity: 'error',
          targetId: 'target:catalog',
          messageKey: 'build.compile-failed',
          count: 1,
          diagnosticCodes: ['GEN-1001'],
        },
      ],
    });
    const harness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(bundleBytes, resultBytes)
    );
    const invocation = await prepareHarnessInvocation(harness);
    const candidate = await harness.adapter.execute(invocation, harness.sink);
    expect(normalizeVerificationCheckReportCandidate(candidate)).toMatchObject({
      status: 'ready',
      report: {
        verdict: 'failed',
        failureClass: 'product-diagnostic-build',
      },
    });
  });

  it.each([
    ['snapshot', { snapshotDigest: sha('wrong-snapshot') }, /snapshot/u],
    [
      'output manifest',
      { outputManifestDigest: sha('wrong-manifest') },
      /output manifest/u,
    ],
  ] as const)('rejects %s drift', async (_label, overrides, expected) => {
    const cell = buildCell();
    const bundleBytes = buildBundleBytes();
    const resultBytes = buildResultBytes(cell, bundleBytes, overrides);
    const harness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(bundleBytes, resultBytes)
    );
    await expect(harness.adapter.prepare(harness.prepareInput)).rejects.toThrow(
      expected
    );
  });

  it('rejects target drift and status/exit/result disagreement', async () => {
    const cell = buildCell();
    const wrongTargetBundle = buildBundleBytes({ presetId: 'vue-vite' });
    const targetHarness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(wrongTargetBundle, buildResultBytes(cell, wrongTargetBundle))
    );
    await expect(
      targetHarness.adapter.prepare(targetHarness.prepareInput)
    ).rejects.toThrow(/target or snapshot/u);

    const bundleBytes = buildBundleBytes();
    const inconsistent = buildResultBytes(cell, bundleBytes, {
      status: 'failed',
      exitCode: 0,
      findings: [
        {
          ruleId: 'build.compile-failed',
          severity: 'error',
          targetId: 'target:catalog',
          messageKey: 'build.compile-failed',
          count: 1,
          diagnosticCodes: ['GEN-1001'],
        },
      ],
    });
    const exitHarness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(bundleBytes, inconsistent)
    );
    await expect(
      exitHarness.adapter.prepare(exitHarness.prepareInput)
    ).rejects.toThrow(/status, exit code, and findings disagree/u);
  });

  it('rejects a drifted Executable Snapshot coordinate even when bundle and result agree', async () => {
    const cell = buildCell();
    const bundleBytes = buildBundleBytes();
    const resultBytes = buildResultBytes(cell, bundleBytes);
    const harness = adapterHarness(
      BUILD_VERIFICATION_ADAPTER_REGISTRATION,
      createBuildVerificationAdapter,
      cell,
      buildEntries(bundleBytes, resultBytes),
      {
        executableSnapshotDigest: sha('wrong-executable-snapshot'),
      }
    );
    await expect(harness.adapter.prepare(harness.prepareInput)).rejects.toThrow(
      /target or snapshot/u
    );
  });
});
