import { createHash } from 'node:crypto';
import {
  decodeExecutionBuildBundle,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import { canonicalJsonText } from '@prodivix/shared/canonical';

const PROJECTION_AUTHORITY_FORMAT =
  'prodivix.controlled-static-toolchain-projection-authority.v1' as const;
const PROJECTION_RECEIPT_FORMAT =
  'prodivix.controlled-static-toolchain-projection-receipt.v1' as const;
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MAXIMUM_RAW_PROJECTION_BYTES = 256 * 1024 * 1024;

export type GoldenControlledStaticToolchainRawEnvelope = Readonly<{
  encoding: 'base64';
  byteLength: number;
  digest: string;
  contents: string;
}>;

export type GoldenControlledStaticToolchainProjectionReceipt = Readonly<{
  format: typeof PROJECTION_RECEIPT_FORMAT;
  snapshotDigest: string;
  target: ExecutableProjectSnapshot['target'];
  toolchainAuthorityReceiptDigest: string;
  rawBuildBundleDigest: string;
  rawTestReportDigest: string;
  rawCoverageSummaryDigest: string;
  rawBuildLogDigest: string;
  projectedBuildBundleDigest: string;
  projectedBuildSummaryDigest: string;
  projectedCoverageSummaryDigest: string;
  projectedTestReportDigest: string;
  buildFileSetDigest: string;
  buildFileCount: number;
  receiptDigest: string;
}>;

export type GoldenControlledStaticToolchainProjectionAuthority = Readonly<{
  format: typeof PROJECTION_AUTHORITY_FORMAT;
  raw: Readonly<{
    buildBundle: GoldenControlledStaticToolchainRawEnvelope;
    testReport: GoldenControlledStaticToolchainRawEnvelope;
    coverageSummary: GoldenControlledStaticToolchainRawEnvelope;
    buildLog: GoldenControlledStaticToolchainRawEnvelope;
  }>;
  receipt: GoldenControlledStaticToolchainProjectionReceipt;
}>;

type ProjectionArtifacts = Readonly<{
  testReportDigest: string;
  coverageSummaryDigest: string;
  buildLogDigest: string;
  buildFileSetDigest: string;
  buildFileCount: number;
}>;

type ProjectionOutputs = Readonly<{
  buildBundle: ExecutionBuildBundle;
  buildSummary: Uint8Array;
  coverageSummary: Uint8Array;
  testReport: ExecutionTestReport;
}>;

const validatedProjectionAuthorities = new WeakSet<object>();

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  const record = value as Record<string, unknown>;
  if (
    keys.some((key) => !(key in record)) ||
    Object.keys(record).some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
  return record;
};

const digestBytes = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('hex')}`;

const digestCanonicalValue = (value: unknown): string =>
  digestBytes(new TextEncoder().encode(canonicalJsonText(value)));

const exactDigest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} is not canonical SHA-256.`);
  }
  return value;
};

const exactNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} is not a non-negative integer.`);
  }
  return value as number;
};

const decodeRawEnvelope = (
  value: unknown,
  label: string
): Readonly<{
  envelope: GoldenControlledStaticToolchainRawEnvelope;
  bytes: Uint8Array;
}> => {
  const record = exactRecord(
    value,
    ['encoding', 'byteLength', 'digest', 'contents'],
    label
  );
  const byteLength = exactNonNegativeInteger(
    record.byteLength,
    `${label}.byteLength`
  );
  if (
    record.encoding !== 'base64' ||
    typeof record.contents !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      record.contents
    ) ||
    byteLength > MAXIMUM_RAW_PROJECTION_BYTES
  ) {
    throw new Error(`${label} is not a bounded canonical base64 envelope.`);
  }
  const bytes = new Uint8Array(Buffer.from(record.contents, 'base64'));
  const digest = exactDigest(record.digest, `${label}.digest`);
  if (
    Buffer.from(bytes).toString('base64') !== record.contents ||
    bytes.byteLength !== byteLength ||
    digestBytes(bytes) !== digest
  ) {
    throw new Error(`${label} bytes drifted from their envelope authority.`);
  }
  return Object.freeze({
    envelope: Object.freeze({
      encoding: 'base64' as const,
      byteLength,
      digest,
      contents: record.contents,
    }),
    bytes,
  });
};

const buildBundleWire = (
  bundle: ExecutionBuildBundle
): Readonly<{
  format: ExecutionBuildBundle['format'];
  snapshotDigest: string;
  target: ExecutionBuildBundle['target'];
  files: readonly Readonly<{
    path: string;
    size: number;
    digest: string;
    encoding: 'base64';
    contents: string;
  }>[];
}> =>
  Object.freeze({
    format: bundle.format,
    snapshotDigest: bundle.snapshotDigest,
    target: bundle.target,
    files: Object.freeze(
      bundle.files.map((file) =>
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

const buildFileSetDigest = (bundle: ExecutionBuildBundle): string =>
  digestCanonicalValue(
    bundle.files.map(({ path, size, digest }) => ({
      digest,
      path,
      size,
    }))
  );

const decodeCanonicalJson = (bytes: Uint8Array, label: string): unknown => {
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not strict UTF-8 JSON.`);
  }
  if (canonicalJsonText(value) !== text) {
    throw new Error(`${label} is not canonical JSON.`);
  }
  return value;
};

const projectionReceiptBase = (
  receipt: GoldenControlledStaticToolchainProjectionReceipt
): Omit<GoldenControlledStaticToolchainProjectionReceipt, 'receiptDigest'> =>
  Object.freeze({
    format: receipt.format,
    snapshotDigest: receipt.snapshotDigest,
    target: receipt.target,
    toolchainAuthorityReceiptDigest: receipt.toolchainAuthorityReceiptDigest,
    rawBuildBundleDigest: receipt.rawBuildBundleDigest,
    rawTestReportDigest: receipt.rawTestReportDigest,
    rawCoverageSummaryDigest: receipt.rawCoverageSummaryDigest,
    rawBuildLogDigest: receipt.rawBuildLogDigest,
    projectedBuildBundleDigest: receipt.projectedBuildBundleDigest,
    projectedBuildSummaryDigest: receipt.projectedBuildSummaryDigest,
    projectedCoverageSummaryDigest: receipt.projectedCoverageSummaryDigest,
    projectedTestReportDigest: receipt.projectedTestReportDigest,
    buildFileSetDigest: receipt.buildFileSetDigest,
    buildFileCount: receipt.buildFileCount,
  });

const assertProjectionAuthorityIdentity = (
  authority: GoldenControlledStaticToolchainProjectionAuthority
): void => {
  const raw = authority.raw;
  const receipt = authority.receipt;
  const decodedRaw = {
    buildBundle: decodeRawEnvelope(
      raw.buildBundle,
      'Controlled raw build bundle'
    ),
    testReport: decodeRawEnvelope(raw.testReport, 'Controlled raw Test report'),
    coverageSummary: decodeRawEnvelope(
      raw.coverageSummary,
      'Controlled raw Coverage summary'
    ),
    buildLog: decodeRawEnvelope(raw.buildLog, 'Controlled raw Build log'),
  };
  if (
    authority.format !== PROJECTION_AUTHORITY_FORMAT ||
    receipt.format !== PROJECTION_RECEIPT_FORMAT ||
    receipt.rawBuildBundleDigest !== decodedRaw.buildBundle.envelope.digest ||
    receipt.rawTestReportDigest !== decodedRaw.testReport.envelope.digest ||
    receipt.rawCoverageSummaryDigest !==
      decodedRaw.coverageSummary.envelope.digest ||
    receipt.rawBuildLogDigest !== decodedRaw.buildLog.envelope.digest ||
    receipt.projectedBuildBundleDigest !==
      decodedRaw.buildBundle.envelope.digest ||
    receipt.receiptDigest !==
      digestCanonicalValue(projectionReceiptBase(receipt))
  ) {
    throw new Error(
      'Controlled static toolchain projection authority identity drifted.'
    );
  }
};

export const decodeGoldenControlledStaticToolchainProjectionAuthority = (
  value: unknown,
  input: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    toolchainAuthorityReceiptDigest: string;
    artifacts: ProjectionArtifacts;
    rawResultBuildBundle: unknown;
    outputs: ProjectionOutputs;
  }>
): GoldenControlledStaticToolchainProjectionAuthority => {
  const authorityRecord = exactRecord(
    value,
    ['format', 'raw', 'receipt'],
    'Controlled static toolchain projection authority'
  );
  const rawRecord = exactRecord(
    authorityRecord.raw,
    ['buildBundle', 'testReport', 'coverageSummary', 'buildLog'],
    'Controlled static toolchain raw projection inputs'
  );
  const rawBuildBundle = decodeRawEnvelope(
    rawRecord.buildBundle,
    'Controlled raw build bundle'
  );
  const rawTestReport = decodeRawEnvelope(
    rawRecord.testReport,
    'Controlled raw Test report'
  );
  const rawCoverageSummary = decodeRawEnvelope(
    rawRecord.coverageSummary,
    'Controlled raw Coverage summary'
  );
  const rawBuildLog = decodeRawEnvelope(
    rawRecord.buildLog,
    'Controlled raw Build log'
  );
  const receiptRecord = exactRecord(
    authorityRecord.receipt,
    [
      'format',
      'snapshotDigest',
      'target',
      'toolchainAuthorityReceiptDigest',
      'rawBuildBundleDigest',
      'rawTestReportDigest',
      'rawCoverageSummaryDigest',
      'rawBuildLogDigest',
      'projectedBuildBundleDigest',
      'projectedBuildSummaryDigest',
      'projectedCoverageSummaryDigest',
      'projectedTestReportDigest',
      'buildFileSetDigest',
      'buildFileCount',
      'receiptDigest',
    ],
    'Controlled static toolchain projection receipt'
  );
  const receipt = Object.freeze({
    format: PROJECTION_RECEIPT_FORMAT,
    snapshotDigest: exactDigest(
      receiptRecord.snapshotDigest,
      'Controlled projection snapshot digest'
    ),
    target: input.snapshot.target,
    toolchainAuthorityReceiptDigest: exactDigest(
      receiptRecord.toolchainAuthorityReceiptDigest,
      'Controlled projection toolchain authority receipt digest'
    ),
    rawBuildBundleDigest: exactDigest(
      receiptRecord.rawBuildBundleDigest,
      'Controlled raw build bundle receipt digest'
    ),
    rawTestReportDigest: exactDigest(
      receiptRecord.rawTestReportDigest,
      'Controlled raw Test report receipt digest'
    ),
    rawCoverageSummaryDigest: exactDigest(
      receiptRecord.rawCoverageSummaryDigest,
      'Controlled raw Coverage summary receipt digest'
    ),
    rawBuildLogDigest: exactDigest(
      receiptRecord.rawBuildLogDigest,
      'Controlled raw Build log receipt digest'
    ),
    projectedBuildBundleDigest: exactDigest(
      receiptRecord.projectedBuildBundleDigest,
      'Controlled projected build bundle digest'
    ),
    projectedBuildSummaryDigest: exactDigest(
      receiptRecord.projectedBuildSummaryDigest,
      'Controlled projected build summary digest'
    ),
    projectedCoverageSummaryDigest: exactDigest(
      receiptRecord.projectedCoverageSummaryDigest,
      'Controlled projected Coverage summary digest'
    ),
    projectedTestReportDigest: exactDigest(
      receiptRecord.projectedTestReportDigest,
      'Controlled projected Test report digest'
    ),
    buildFileSetDigest: exactDigest(
      receiptRecord.buildFileSetDigest,
      'Controlled projected build file-set digest'
    ),
    buildFileCount: exactNonNegativeInteger(
      receiptRecord.buildFileCount,
      'Controlled projected build file count'
    ),
    receiptDigest: exactDigest(
      receiptRecord.receiptDigest,
      'Controlled projection receipt digest'
    ),
  });
  const rawBuildBundleValue = decodeCanonicalJson(
    rawBuildBundle.bytes,
    'Controlled raw build bundle'
  );
  const independentlyDecodedBuildBundle = decodeExecutionBuildBundle(
    rawBuildBundle.bytes
  );
  const expectedBuildBundleWire = buildBundleWire(input.outputs.buildBundle);
  const expectedFileSetDigest = buildFileSetDigest(input.outputs.buildBundle);
  const expectedReceiptBase = Object.freeze({
    format: PROJECTION_RECEIPT_FORMAT,
    snapshotDigest: input.snapshot.contentDigest,
    target: input.snapshot.target,
    toolchainAuthorityReceiptDigest: input.toolchainAuthorityReceiptDigest,
    rawBuildBundleDigest: rawBuildBundle.envelope.digest,
    rawTestReportDigest: rawTestReport.envelope.digest,
    rawCoverageSummaryDigest: rawCoverageSummary.envelope.digest,
    rawBuildLogDigest: rawBuildLog.envelope.digest,
    projectedBuildBundleDigest: digestCanonicalValue(expectedBuildBundleWire),
    projectedBuildSummaryDigest: digestBytes(input.outputs.buildSummary),
    projectedCoverageSummaryDigest: digestBytes(input.outputs.coverageSummary),
    projectedTestReportDigest: digestCanonicalValue(input.outputs.testReport),
    buildFileSetDigest: expectedFileSetDigest,
    buildFileCount: input.outputs.buildBundle.files.length,
  });
  if (
    authorityRecord.format !== PROJECTION_AUTHORITY_FORMAT ||
    receiptRecord.format !== PROJECTION_RECEIPT_FORMAT ||
    receipt.snapshotDigest !== input.snapshot.contentDigest ||
    canonicalJsonText(receiptRecord.target) !==
      canonicalJsonText(input.snapshot.target) ||
    receipt.toolchainAuthorityReceiptDigest !==
      input.toolchainAuthorityReceiptDigest ||
    canonicalJsonText(rawBuildBundleValue) !==
      canonicalJsonText(input.rawResultBuildBundle) ||
    canonicalJsonText(rawBuildBundleValue) !==
      canonicalJsonText(expectedBuildBundleWire) ||
    canonicalJsonText(buildBundleWire(independentlyDecodedBuildBundle)) !==
      canonicalJsonText(expectedBuildBundleWire) ||
    rawTestReport.envelope.digest !== input.artifacts.testReportDigest ||
    rawCoverageSummary.envelope.digest !==
      input.artifacts.coverageSummaryDigest ||
    rawBuildLog.envelope.digest !== input.artifacts.buildLogDigest ||
    expectedFileSetDigest !== input.artifacts.buildFileSetDigest ||
    input.outputs.buildBundle.files.length !== input.artifacts.buildFileCount ||
    canonicalJsonText(projectionReceiptBase(receipt)) !==
      canonicalJsonText(expectedReceiptBase) ||
    receipt.receiptDigest !== digestCanonicalValue(expectedReceiptBase)
  ) {
    throw new Error(
      'Controlled static toolchain projection receipt drifted from raw and projected authority.'
    );
  }
  const authority = Object.freeze({
    format: PROJECTION_AUTHORITY_FORMAT,
    raw: Object.freeze({
      buildBundle: rawBuildBundle.envelope,
      testReport: rawTestReport.envelope,
      coverageSummary: rawCoverageSummary.envelope,
      buildLog: rawBuildLog.envelope,
    }),
    receipt: Object.freeze({
      ...receipt,
      format: PROJECTION_RECEIPT_FORMAT,
    }),
  });
  assertProjectionAuthorityIdentity(authority);
  validatedProjectionAuthorities.add(authority);
  return authority;
};

export const assertGoldenControlledStaticToolchainProjectionAuthority = (
  authority: GoldenControlledStaticToolchainProjectionAuthority,
  expected?: Readonly<{
    snapshotDigest?: string;
    target?: ExecutableProjectSnapshot['target'];
    toolchainAuthorityReceiptDigest?: string;
    receiptDigest?: string;
  }>
): void => {
  if (!validatedProjectionAuthorities.has(authority)) {
    throw new Error(
      'Controlled static toolchain projection authority was not issued by the strict Golden decoder.'
    );
  }
  assertProjectionAuthorityIdentity(authority);
  if (
    (expected?.snapshotDigest !== undefined &&
      authority.receipt.snapshotDigest !== expected.snapshotDigest) ||
    (expected?.target !== undefined &&
      canonicalJsonText(authority.receipt.target) !==
        canonicalJsonText(expected.target)) ||
    (expected?.toolchainAuthorityReceiptDigest !== undefined &&
      authority.receipt.toolchainAuthorityReceiptDigest !==
        expected.toolchainAuthorityReceiptDigest) ||
    (expected?.receiptDigest !== undefined &&
      authority.receipt.receiptDigest !== expected.receiptDigest)
  ) {
    throw new Error(
      'Controlled static toolchain projection authority expected identity drifted.'
    );
  }
};
