import { createHash } from 'node:crypto';
import {
  EXECUTION_BUILD_BUNDLE_FORMAT,
  createExecutionTestReport,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import {
  assertGoldenControlledStaticToolchainProjectionAuthority,
  decodeGoldenControlledStaticToolchainProjectionAuthority,
} from './generatedProjectToolchainProjectionAuthority';
import { createGoldenG3V6ExecutableSnapshot } from './goldenG3V6ExecutableSnapshot';
import { createGoldenG3ReactCatalogSnapshot } from './goldenG3ScenarioFixture';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const digestBytes = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('hex')}`;

const digestValue = (value: unknown): string =>
  digestBytes(utf8(canonicalJsonText(value)));

const envelope = (bytes: Uint8Array) =>
  Object.freeze({
    encoding: 'base64' as const,
    byteLength: bytes.byteLength,
    digest: digestBytes(bytes),
    contents: Buffer.from(bytes).toString('base64'),
  });

const fixture = () => {
  const snapshot = createGoldenG3V6ExecutableSnapshot(
    createGoldenG3ReactCatalogSnapshot()
  );
  const fileContents = utf8('<!doctype html><title>Golden</title>');
  const buildBundle: ExecutionBuildBundle = Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze([
      Object.freeze({
        path: 'index.html',
        size: fileContents.byteLength,
        digest: digestBytes(fileContents),
        contents: fileContents,
      }),
    ]),
  });
  const buildBundleWire = Object.freeze({
    format: buildBundle.format,
    snapshotDigest: buildBundle.snapshotDigest,
    target: buildBundle.target,
    files: Object.freeze(
      buildBundle.files.map((file) =>
        Object.freeze({
          path: file.path,
          size: file.size,
          digest: file.digest,
          encoding: 'base64' as const,
          contents: Buffer.from(file.contents).toString('base64'),
        })
      )
    ),
  });
  const rawBuildBundle = utf8(canonicalJsonText(buildBundleWire));
  const rawTestReport = utf8('{"numFailedTests":0,"testResults":[]}');
  const rawCoverageSummary = utf8(
    '{"total":{"branches":{"covered":1,"pct":100,"skipped":0,"total":1}}}'
  );
  const rawBuildLog = utf8('vite build completed');
  const buildSummary = utf8('canonical build summary');
  const coverageSummary = utf8('canonical coverage summary');
  const testReport = createExecutionTestReport({
    reportId: 'report:projection-authority',
    tool: { name: 'vitest', version: '4.1.9' },
    files: [
      {
        fileId: 'src/App.test.tsx',
        path: 'src/App.test.tsx',
        status: 'passed',
        cases: [
          {
            caseId: 'case:projection-authority',
            name: 'projects raw output',
            fullName: 'projects raw output',
            status: 'passed',
          },
        ],
      },
    ],
  });
  const buildFileSetDigest = digestValue(
    buildBundle.files.map(({ path, size, digest }) => ({
      digest,
      path,
      size,
    }))
  );
  const toolchainAuthorityReceiptDigest = digestValue({
    owner: 'controlled-static-toolchain',
  });
  const artifacts = Object.freeze({
    testReportDigest: digestBytes(rawTestReport),
    coverageSummaryDigest: digestBytes(rawCoverageSummary),
    buildLogDigest: digestBytes(rawBuildLog),
    buildFileSetDigest,
    buildFileCount: buildBundle.files.length,
  });
  const raw = Object.freeze({
    buildBundle: envelope(rawBuildBundle),
    testReport: envelope(rawTestReport),
    coverageSummary: envelope(rawCoverageSummary),
    buildLog: envelope(rawBuildLog),
  });
  const receiptBase = Object.freeze({
    format:
      'prodivix.controlled-static-toolchain-projection-receipt.v1' as const,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    toolchainAuthorityReceiptDigest,
    rawBuildBundleDigest: raw.buildBundle.digest,
    rawTestReportDigest: raw.testReport.digest,
    rawCoverageSummaryDigest: raw.coverageSummary.digest,
    rawBuildLogDigest: raw.buildLog.digest,
    projectedBuildBundleDigest: digestBytes(rawBuildBundle),
    projectedBuildSummaryDigest: digestBytes(buildSummary),
    projectedCoverageSummaryDigest: digestBytes(coverageSummary),
    projectedTestReportDigest: digestValue(testReport),
    buildFileSetDigest,
    buildFileCount: buildBundle.files.length,
  });
  const value = Object.freeze({
    format:
      'prodivix.controlled-static-toolchain-projection-authority.v1' as const,
    raw,
    receipt: Object.freeze({
      ...receiptBase,
      receiptDigest: digestValue(receiptBase),
    }),
  });
  const input = Object.freeze({
    snapshot,
    toolchainAuthorityReceiptDigest,
    artifacts,
    rawResultBuildBundle: buildBundleWire,
    outputs: Object.freeze({
      buildBundle,
      buildSummary,
      coverageSummary,
      testReport,
    }),
  });
  return Object.freeze({ value, input });
};

describe('Golden controlled static toolchain projection authority', () => {
  it('independently binds every raw envelope and projected output', () => {
    const { value, input } = fixture();
    const authority = decodeGoldenControlledStaticToolchainProjectionAuthority(
      value,
      input
    );

    expect(() =>
      assertGoldenControlledStaticToolchainProjectionAuthority(authority, {
        snapshotDigest: input.snapshot.contentDigest,
        target: input.snapshot.target,
        toolchainAuthorityReceiptDigest: input.toolchainAuthorityReceiptDigest,
        receiptDigest: value.receipt.receiptDigest,
      })
    ).not.toThrow();
  });

  it('rejects raw swaps and a projected-output swap even when outer fields are rehashed', () => {
    const { value, input } = fixture();
    const swappedRaw = Object.freeze({
      ...value,
      raw: Object.freeze({
        ...value.raw,
        testReport: value.raw.coverageSummary,
        coverageSummary: value.raw.testReport,
      }),
      receipt: Object.freeze({
        ...value.receipt,
        rawTestReportDigest: value.raw.coverageSummary.digest,
        rawCoverageSummaryDigest: value.raw.testReport.digest,
      }),
    });
    const swappedRawReceiptBase = Object.fromEntries(
      Object.entries(swappedRaw.receipt).filter(
        ([key]) => key !== 'receiptDigest'
      )
    );
    expect(() =>
      decodeGoldenControlledStaticToolchainProjectionAuthority(
        {
          ...swappedRaw,
          receipt: {
            ...swappedRawReceiptBase,
            receiptDigest: digestValue(swappedRawReceiptBase),
          },
        },
        input
      )
    ).toThrow(/raw and projected authority/u);

    const swappedOutputs = Object.freeze({
      ...input,
      outputs: Object.freeze({
        ...input.outputs,
        buildSummary: input.outputs.coverageSummary,
        coverageSummary: input.outputs.buildSummary,
      }),
    });
    expect(() =>
      decodeGoldenControlledStaticToolchainProjectionAuthority(
        value,
        swappedOutputs
      )
    ).toThrow(/raw and projected authority/u);
  });

  it('rejects a fully rehashed clone at the downstream owner boundary', () => {
    const { value, input } = fixture();
    const authority = decodeGoldenControlledStaticToolchainProjectionAuthority(
      value,
      input
    );
    const receiptBase = Object.fromEntries(
      Object.entries(authority.receipt).filter(
        ([key]) => key !== 'receiptDigest'
      )
    );
    const forged = Object.freeze({
      ...authority,
      receipt: Object.freeze({
        ...receiptBase,
        receiptDigest: digestValue(receiptBase),
      }),
    });

    expect(() =>
      assertGoldenControlledStaticToolchainProjectionAuthority(
        forged as typeof authority
      )
    ).toThrow(/strict Golden decoder/u);
  });
});
