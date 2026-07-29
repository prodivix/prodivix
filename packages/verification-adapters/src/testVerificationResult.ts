import {
  readExecutionTestReportValue,
  type ExecutionTestReport,
} from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  canonicalizeArtifacts,
  decodeCanonicalJsonBytes,
  encodeCanonicalJsonBytes,
  readArtifacts,
  readDigest,
  readExactRecord,
  readSafeInteger,
  readSortedDigestArray,
  type PreparedVerificationAdapterArtifact,
  type VerificationAdapterArtifactSource,
} from './verificationAdapterInputPrimitives';
import { decodeVerificationCoverageSummary } from './coverageSummaryProjection';
import { decodeVerificationTrace } from './verificationTraceProjection';

export const TEST_VERIFICATION_RESULT_FORMAT =
  'prodivix.verification-test-result' as const;
export const TEST_VERIFICATION_RESULT_VERSION = 1 as const;
export const TEST_VERIFICATION_RESULT_MEDIA_TYPE =
  'application/vnd.prodivix.verification-test-result+json' as const;

export type IntegrationVerificationIsolation = Readonly<{
  lifecycle: 'ephemeral';
  network: 'fixture-only';
  liveEgress: false;
}>;

type TestVerificationResultBaseInput = Readonly<{
  cellInputDigest: string;
  snapshotDigest: string;
  reportDigest: string;
  controlProfileDigest: string;
  status: 'passed' | 'failed';
  exitCode: number;
  artifacts: readonly VerificationAdapterArtifactSource[];
}>;

export type UnitVerificationResultInput = TestVerificationResultBaseInput &
  Readonly<{
    checkKind: 'unit';
  }>;

export type IntegrationVerificationResultInput =
  TestVerificationResultBaseInput &
    Readonly<{
      checkKind: 'integration';
      executableBundleDigest: string;
      fixtureSetDigests: readonly string[];
      isolation: IntegrationVerificationIsolation;
    }>;

export type TestVerificationResultInput =
  UnitVerificationResultInput | IntegrationVerificationResultInput;

export type UnitVerificationResult = Omit<
  UnitVerificationResultInput,
  'artifacts'
> &
  Readonly<{
    artifacts: readonly PreparedVerificationAdapterArtifact[];
  }>;

export type IntegrationVerificationResult = Omit<
  IntegrationVerificationResultInput,
  'artifacts'
> &
  Readonly<{
    artifacts: readonly PreparedVerificationAdapterArtifact[];
  }>;

export type TestVerificationResult =
  UnitVerificationResult | IntegrationVerificationResult;

const assertTestArtifactBinding = (
  artifacts: readonly VerificationAdapterArtifactSource[],
  checkKind: 'unit' | 'integration',
  snapshotDigest: string
): void => {
  const coverage = artifacts.filter(({ kind }) => kind === 'coverage-summary');
  const traces = artifacts.filter(({ kind }) => kind === 'trace');
  if (
    coverage.length !== 1 ||
    (checkKind === 'unit'
      ? artifacts.length !== 1 || traces.length !== 0
      : artifacts.length !== 2 || traces.length !== 1)
  ) {
    throw new TypeError(
      `${checkKind} verification artifacts do not match the canonical artifact set.`
    );
  }
  if (
    decodeVerificationCoverageSummary(coverage[0]!.bytes).subjectDigest !==
    snapshotDigest
  ) {
    throw new TypeError(
      `${checkKind} coverage executable snapshot binding drifted.`
    );
  }
  if (checkKind === 'integration') {
    const trace = decodeVerificationTrace(traces[0]!.bytes);
    if (
      trace.traceKind !== 'integration' ||
      trace.subjectDigest !== snapshotDigest
    ) {
      throw new TypeError(
        'Integration trace kind or executable snapshot binding drifted.'
      );
    }
  }
};

export const encodeCanonicalExecutionTestReport = (
  report: ExecutionTestReport
): Uint8Array => {
  if (!readExecutionTestReportValue(report)) {
    throw new TypeError('ExecutionTestReport is not canonical.');
  }
  return encodeCanonicalJsonBytes(report);
};

export const decodeCanonicalExecutionTestReport = (
  bytes: Uint8Array
): ExecutionTestReport => {
  const value = decodeCanonicalJsonBytes(bytes, 'ExecutionTestReport');
  const report = readExecutionTestReportValue(value);
  if (!report) {
    throw new TypeError(
      'ExecutionTestReport does not satisfy the public codec.'
    );
  }
  return report;
};

export const encodeTestVerificationResult = (
  input: TestVerificationResultInput
): Uint8Array => {
  const snapshotDigest = readDigest(input.snapshotDigest, 'snapshotDigest');
  assertTestArtifactBinding(input.artifacts, input.checkKind, snapshotDigest);
  const common = {
    format: TEST_VERIFICATION_RESULT_FORMAT,
    version: TEST_VERIFICATION_RESULT_VERSION,
    checkKind: input.checkKind,
    cellInputDigest: readDigest(input.cellInputDigest, 'cellInputDigest'),
    snapshotDigest,
    reportDigest: readDigest(input.reportDigest, 'reportDigest'),
    controlProfileDigest: readDigest(
      input.controlProfileDigest,
      'controlProfileDigest'
    ),
    status: input.status,
    exitCode: readSafeInteger(input.exitCode, 'exitCode', 0, 255),
    artifacts: canonicalizeArtifacts(input.artifacts),
  };
  if (input.checkKind === 'unit') {
    return encodeCanonicalJsonBytes(common);
  }
  return encodeCanonicalJsonBytes({
    ...common,
    executableBundleDigest: readDigest(
      input.executableBundleDigest,
      'executableBundleDigest'
    ),
    fixtureSetDigests: Object.freeze(
      [...input.fixtureSetDigests]
        .map((entry, index) => readDigest(entry, `fixtureSetDigests[${index}]`))
        .sort(compareUnicodeCodePoints)
    ),
    isolation: {
      lifecycle: input.isolation.lifecycle,
      network: input.isolation.network,
      liveEgress: input.isolation.liveEgress,
    },
  });
};

export const decodeTestVerificationResult = (
  bytes: Uint8Array
): TestVerificationResult => {
  const raw = decodeCanonicalJsonBytes(bytes, 'Test verification result');
  const checkKind = raw.checkKind;
  if (checkKind !== 'unit' && checkKind !== 'integration') {
    throw new TypeError('Test verification result checkKind is unsupported.');
  }
  const requiredKeys = [
    'format',
    'version',
    'checkKind',
    'cellInputDigest',
    'snapshotDigest',
    'reportDigest',
    'controlProfileDigest',
    'status',
    'exitCode',
    'artifacts',
    ...(checkKind === 'integration'
      ? ['executableBundleDigest', 'fixtureSetDigests', 'isolation']
      : []),
  ];
  const record = readExactRecord(
    raw,
    requiredKeys,
    [],
    'Test verification result'
  );
  if (
    record.format !== TEST_VERIFICATION_RESULT_FORMAT ||
    record.version !== TEST_VERIFICATION_RESULT_VERSION
  ) {
    throw new TypeError('Test verification result version is unsupported.');
  }
  if (record.status !== 'passed' && record.status !== 'failed') {
    throw new TypeError('Test verification result status is unsupported.');
  }
  const status: 'passed' | 'failed' = record.status;
  const exitCode = readSafeInteger(record.exitCode, 'exitCode', 0, 255);
  if ((status === 'passed') !== (exitCode === 0)) {
    throw new TypeError(
      'Test verification result status and exit code disagree.'
    );
  }
  const snapshotDigest = readDigest(record.snapshotDigest, 'snapshotDigest');
  const artifacts = readArtifacts(record.artifacts);
  assertTestArtifactBinding(artifacts, checkKind, snapshotDigest);
  const common = {
    cellInputDigest: readDigest(record.cellInputDigest, 'cellInputDigest'),
    snapshotDigest,
    reportDigest: readDigest(record.reportDigest, 'reportDigest'),
    controlProfileDigest: readDigest(
      record.controlProfileDigest,
      'controlProfileDigest'
    ),
    status,
    exitCode,
    artifacts,
  };
  if (checkKind === 'unit') {
    return Object.freeze({
      ...common,
      checkKind: 'unit' as const,
    });
  }
  const isolation = readExactRecord(
    record.isolation,
    ['lifecycle', 'network', 'liveEgress'],
    [],
    'isolation'
  );
  if (
    isolation.lifecycle !== 'ephemeral' ||
    isolation.network !== 'fixture-only' ||
    isolation.liveEgress !== false
  ) {
    throw new TypeError(
      'Integration verification requires ephemeral fixture-only isolation with live egress disabled.'
    );
  }
  return Object.freeze({
    ...common,
    checkKind: 'integration',
    executableBundleDigest: readDigest(
      record.executableBundleDigest,
      'executableBundleDigest'
    ),
    fixtureSetDigests: readSortedDigestArray(
      record.fixtureSetDigests,
      'fixtureSetDigests'
    ),
    isolation: Object.freeze({
      lifecycle: 'ephemeral',
      network: 'fixture-only',
      liveEgress: false,
    }),
  });
};
