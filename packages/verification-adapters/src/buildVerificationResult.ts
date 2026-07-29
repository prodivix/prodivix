import {
  decodeExecutionBuildBundle,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import {
  digestVerificationValue,
  type VerificationNormalizedFinding,
} from '@prodivix/verification';
import {
  VERIFICATION_ADAPTER_INPUT_LIMITS,
  canonicalizeArtifacts,
  canonicalizeFindings,
  decodeCanonicalJsonBytes,
  encodeCanonicalJsonBytes,
  readArtifacts,
  readDigest,
  readExactRecord,
  readFindings,
  readSafeInteger,
  readToken,
  type PreparedVerificationAdapterArtifact,
  type VerificationAdapterArtifactSource,
} from './verificationAdapterInputPrimitives';
import { decodeVerificationBuildSummary } from './buildLogProjection';

export const BUILD_VERIFICATION_RESULT_FORMAT =
  'prodivix.verification-build-result' as const;
export const BUILD_VERIFICATION_RESULT_VERSION = 1 as const;
export const BUILD_VERIFICATION_RESULT_MEDIA_TYPE =
  'application/vnd.prodivix.verification-build-result+json' as const;

export type BuildVerificationResultInput = Readonly<{
  cellInputDigest: string;
  snapshotDigest: string;
  target: ExecutionBuildBundle['target'];
  outputManifestDigest: string;
  status: 'succeeded' | 'failed';
  exitCode: number;
  findings: readonly VerificationNormalizedFinding[];
  artifacts: readonly VerificationAdapterArtifactSource[];
}>;

export type BuildVerificationResult = Omit<
  BuildVerificationResultInput,
  'artifacts'
> &
  Readonly<{
    artifacts: readonly PreparedVerificationAdapterArtifact[];
  }>;

const assertBuildArtifactBinding = (
  artifacts: readonly VerificationAdapterArtifactSource[],
  snapshotDigest: string
): void => {
  if (artifacts.length !== 1 || artifacts[0]?.kind !== 'build-log') {
    throw new TypeError(
      'Build verification requires exactly one canonical build summary artifact.'
    );
  }
  if (
    decodeVerificationBuildSummary(artifacts[0].bytes).subjectDigest !==
    snapshotDigest
  ) {
    throw new TypeError('Build summary executable snapshot binding drifted.');
  }
};

const readTarget = (
  value: unknown,
  label: string
): ExecutionBuildBundle['target'] => {
  const record = readExactRecord(
    value,
    ['presetId', 'framework', 'runtime'],
    [],
    label
  );
  return Object.freeze({
    presetId: readToken(record.presetId, `${label}.presetId`),
    framework: readToken(record.framework, `${label}.framework`),
    runtime: readToken(record.runtime, `${label}.runtime`),
  });
};

export const createExecutionBuildOutputManifestDigest = (
  bundle: ExecutionBuildBundle
): string =>
  digestVerificationValue({
    format: 'prodivix.execution-build-output-manifest.v1',
    snapshotDigest: bundle.snapshotDigest,
    target: bundle.target,
    files: bundle.files.map(({ path, size, digest: fileDigest }) => ({
      path,
      size,
      digest: fileDigest,
    })),
  });

export const encodeBuildVerificationResult = (
  input: BuildVerificationResultInput
): Uint8Array => {
  const snapshotDigest = readDigest(input.snapshotDigest, 'snapshotDigest');
  assertBuildArtifactBinding(input.artifacts, snapshotDigest);
  return encodeCanonicalJsonBytes({
    format: BUILD_VERIFICATION_RESULT_FORMAT,
    version: BUILD_VERIFICATION_RESULT_VERSION,
    cellInputDigest: readDigest(input.cellInputDigest, 'cellInputDigest'),
    snapshotDigest,
    target: readTarget(input.target, 'target'),
    outputManifestDigest: readDigest(
      input.outputManifestDigest,
      'outputManifestDigest'
    ),
    status: input.status,
    exitCode: readSafeInteger(input.exitCode, 'exitCode', 0, 255),
    findings: canonicalizeFindings(input.findings),
    artifacts: canonicalizeArtifacts(input.artifacts),
  });
};

export const decodeBuildVerificationResult = (
  bytes: Uint8Array
): BuildVerificationResult => {
  const record = readExactRecord(
    decodeCanonicalJsonBytes(bytes, 'Build verification result'),
    [
      'format',
      'version',
      'cellInputDigest',
      'snapshotDigest',
      'target',
      'outputManifestDigest',
      'status',
      'exitCode',
      'findings',
      'artifacts',
    ],
    [],
    'Build verification result'
  );
  if (
    record.format !== BUILD_VERIFICATION_RESULT_FORMAT ||
    record.version !== BUILD_VERIFICATION_RESULT_VERSION
  ) {
    throw new TypeError('Build verification result version is unsupported.');
  }
  if (record.status !== 'succeeded' && record.status !== 'failed') {
    throw new TypeError('Build verification result status is unsupported.');
  }
  const exitCode = readSafeInteger(record.exitCode, 'exitCode', 0, 255);
  const findings = readFindings(record.findings);
  const hasBlockingFinding = findings.some(
    ({ severity }) => severity === 'error' || severity === 'fatal'
  );
  if (
    (record.status === 'succeeded' && (exitCode !== 0 || hasBlockingFinding)) ||
    (record.status === 'failed' && (exitCode === 0 || !hasBlockingFinding))
  ) {
    throw new TypeError(
      'Build verification result status, exit code, and findings disagree.'
    );
  }
  const snapshotDigest = readDigest(record.snapshotDigest, 'snapshotDigest');
  const artifacts = readArtifacts(record.artifacts);
  assertBuildArtifactBinding(artifacts, snapshotDigest);
  return Object.freeze({
    cellInputDigest: readDigest(record.cellInputDigest, 'cellInputDigest'),
    snapshotDigest,
    target: readTarget(record.target, 'target'),
    outputManifestDigest: readDigest(
      record.outputManifestDigest,
      'outputManifestDigest'
    ),
    status: record.status,
    exitCode,
    findings,
    artifacts,
  });
};

export const decodeCanonicalExecutionBuildBundle = (
  bytes: Uint8Array
): ExecutionBuildBundle => {
  decodeCanonicalJsonBytes(
    bytes,
    'ExecutionBuildBundle',
    VERIFICATION_ADAPTER_INPUT_LIMITS.maximumBuildBundleBytes
  );
  return decodeExecutionBuildBundle(bytes);
};
