import type { VerificationNormalizedFinding } from '@prodivix/verification';
import {
  canonicalizeArtifacts,
  canonicalizeFindings,
  decodeCanonicalJsonBytes,
  encodeCanonicalJsonBytes,
  readArtifacts,
  readDigest,
  readExactRecord,
  readFindings,
  type PreparedVerificationAdapterArtifact,
  type VerificationAdapterArtifactSource,
} from './verificationAdapterInputPrimitives';
import { decodeVerificationTrace } from './verificationTraceProjection';

export const DIAGNOSTIC_VERIFICATION_SNAPSHOT_FORMAT =
  'prodivix.verification-diagnostic-snapshot' as const;
export const DIAGNOSTIC_VERIFICATION_SNAPSHOT_VERSION = 1 as const;
export const DIAGNOSTIC_VERIFICATION_SNAPSHOT_MEDIA_TYPE =
  'application/vnd.prodivix.verification-diagnostic-snapshot+json' as const;

export type DiagnosticVerificationSnapshotInput = Readonly<{
  cellInputDigest: string;
  workspaceSnapshotDigest: string;
  semanticIndexDigest: string;
  compilerProjectionDigest: string;
  findings: readonly VerificationNormalizedFinding[];
  artifacts: readonly VerificationAdapterArtifactSource[];
}>;

export type DiagnosticVerificationSnapshot = Omit<
  DiagnosticVerificationSnapshotInput,
  'artifacts'
> &
  Readonly<{
    artifacts: readonly PreparedVerificationAdapterArtifact[];
  }>;

const assertDiagnosticTraceBinding = (
  artifacts: readonly VerificationAdapterArtifactSource[],
  compilerProjectionDigest: string
): void => {
  if (artifacts.length !== 1 || artifacts[0]?.kind !== 'trace') {
    throw new TypeError(
      'Diagnostic verification requires exactly one canonical trace artifact.'
    );
  }
  const trace = decodeVerificationTrace(artifacts[0].bytes);
  if (
    trace.traceKind !== 'diagnostics' ||
    trace.subjectDigest !== compilerProjectionDigest
  ) {
    throw new TypeError(
      'Diagnostic trace kind or compiler projection binding drifted.'
    );
  }
};

export const encodeDiagnosticVerificationSnapshot = (
  input: DiagnosticVerificationSnapshotInput
): Uint8Array => {
  const compilerProjectionDigest = readDigest(
    input.compilerProjectionDigest,
    'compilerProjectionDigest'
  );
  assertDiagnosticTraceBinding(input.artifacts, compilerProjectionDigest);
  return encodeCanonicalJsonBytes({
    format: DIAGNOSTIC_VERIFICATION_SNAPSHOT_FORMAT,
    version: DIAGNOSTIC_VERIFICATION_SNAPSHOT_VERSION,
    cellInputDigest: readDigest(input.cellInputDigest, 'cellInputDigest'),
    workspaceSnapshotDigest: readDigest(
      input.workspaceSnapshotDigest,
      'workspaceSnapshotDigest'
    ),
    semanticIndexDigest: readDigest(
      input.semanticIndexDigest,
      'semanticIndexDigest'
    ),
    compilerProjectionDigest,
    findings: canonicalizeFindings(input.findings),
    artifacts: canonicalizeArtifacts(input.artifacts),
  });
};

export const decodeDiagnosticVerificationSnapshot = (
  bytes: Uint8Array
): DiagnosticVerificationSnapshot => {
  const record = readExactRecord(
    decodeCanonicalJsonBytes(bytes, 'Diagnostic verification snapshot'),
    [
      'format',
      'version',
      'cellInputDigest',
      'workspaceSnapshotDigest',
      'semanticIndexDigest',
      'compilerProjectionDigest',
      'findings',
      'artifacts',
    ],
    [],
    'Diagnostic verification snapshot'
  );
  if (
    record.format !== DIAGNOSTIC_VERIFICATION_SNAPSHOT_FORMAT ||
    record.version !== DIAGNOSTIC_VERIFICATION_SNAPSHOT_VERSION
  ) {
    throw new TypeError(
      'Diagnostic verification snapshot version is unsupported.'
    );
  }
  const artifacts = readArtifacts(record.artifacts);
  const compilerProjectionDigest = readDigest(
    record.compilerProjectionDigest,
    'compilerProjectionDigest'
  );
  assertDiagnosticTraceBinding(artifacts, compilerProjectionDigest);
  return Object.freeze({
    cellInputDigest: readDigest(record.cellInputDigest, 'cellInputDigest'),
    workspaceSnapshotDigest: readDigest(
      record.workspaceSnapshotDigest,
      'workspaceSnapshotDigest'
    ),
    semanticIndexDigest: readDigest(
      record.semanticIndexDigest,
      'semanticIndexDigest'
    ),
    compilerProjectionDigest,
    findings: readFindings(record.findings),
    artifacts,
  });
};
