import type { ExecutionSourceTrace } from '@prodivix/runtime-core';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  VERIFICATION_ARTIFACT_PROJECTION_LIMITS,
  decodePublicVerificationArtifactProjection,
  encodePublicVerificationArtifactProjection,
  readVerificationProjectionCanonicalText,
  readVerificationProjectionExactRecord,
  readVerificationProjectionRelativePath,
  readVerificationProjectionSourceTraces,
} from './verificationArtifactProjectionSource';

export const VERIFICATION_TRACE_MEDIA_TYPE =
  'application/vnd.prodivix.verification-trace+json' as const;

export const VERIFICATION_TRACE_FORMAT =
  'prodivix.verification-trace.v1' as const;

export type VerificationTraceKind = 'diagnostics' | 'integration';

export type VerificationTraceEntry = Readonly<{
  path: string;
  sourceTrace: readonly ExecutionSourceTrace[];
  caseIds?: readonly string[];
}>;

export type VerificationTrace = Readonly<{
  format: typeof VERIFICATION_TRACE_FORMAT;
  traceKind: VerificationTraceKind;
  subjectDigest: string;
  entries: readonly VerificationTraceEntry[];
}>;

export type EncodeVerificationTraceInput = Readonly<{
  traceKind: VerificationTraceKind;
  subjectDigest: string;
  entries: readonly VerificationTraceEntry[];
}>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;

const readDigest = (value: unknown, label: string): string => {
  const digest = readVerificationProjectionCanonicalText(value, label, 71);
  if (!DIGEST_PATTERN.test(digest)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return digest;
};

const readCaseIds = (
  value: unknown,
  label: string
): readonly string[] | undefined => {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumCount
  ) {
    throw new TypeError(`${label} must be a non-empty bounded array.`);
  }
  let previous: string | undefined;
  const result = value.map((entry, index) => {
    const caseId = readVerificationProjectionCanonicalText(
      entry,
      `${label}[${index}]`,
      4_096
    );
    if (
      previous !== undefined &&
      compareUnicodeCodePoints(previous, caseId) >= 0
    ) {
      throw new TypeError(`${label} must be uniquely sorted.`);
    }
    previous = caseId;
    return caseId;
  });
  return Object.freeze(result);
};

export const decodeVerificationTrace = (
  bytes: Uint8Array
): VerificationTrace => {
  const record = readVerificationProjectionExactRecord(
    decodePublicVerificationArtifactProjection(bytes, 'Canonical trace'),
    ['format', 'traceKind', 'subjectDigest', 'entries'],
    [],
    'Canonical trace'
  );
  if (record.format !== VERIFICATION_TRACE_FORMAT) {
    throw new TypeError('Canonical trace format is unsupported.');
  }
  if (
    record.traceKind !== 'diagnostics' &&
    record.traceKind !== 'integration'
  ) {
    throw new TypeError('Canonical trace kind is unsupported.');
  }
  if (
    !Array.isArray(record.entries) ||
    record.entries.length === 0 ||
    record.entries.length >
      VERIFICATION_ARTIFACT_PROJECTION_LIMITS.maximumSources
  ) {
    throw new TypeError(
      'Canonical trace entries must be a non-empty bounded array.'
    );
  }
  let previousPath: string | undefined;
  const entries = record.entries.map((entry, index) => {
    const value = readVerificationProjectionExactRecord(
      entry,
      ['path', 'sourceTrace'],
      ['caseIds'],
      `Canonical trace entries[${index}]`
    );
    const path = readVerificationProjectionRelativePath(
      value.path,
      `Canonical trace entries[${index}].path`
    );
    if (
      previousPath !== undefined &&
      compareUnicodeCodePoints(previousPath, path) >= 0
    ) {
      throw new TypeError(
        'Canonical trace entries must be uniquely sorted by path.'
      );
    }
    previousPath = path;
    const caseIds = readCaseIds(
      value.caseIds,
      `Canonical trace entries[${index}].caseIds`
    );
    return Object.freeze({
      path,
      sourceTrace: readVerificationProjectionSourceTraces(
        value.sourceTrace,
        `Canonical trace entries[${index}].sourceTrace`
      ),
      ...(caseIds ? { caseIds } : {}),
    });
  });
  return Object.freeze({
    format: VERIFICATION_TRACE_FORMAT,
    traceKind: record.traceKind,
    subjectDigest: readDigest(
      record.subjectDigest,
      'Canonical trace subjectDigest'
    ),
    entries: Object.freeze(entries),
  });
};

export const encodeVerificationTrace = (
  input: EncodeVerificationTraceInput
): Uint8Array => {
  const entries = input.entries
    .map((entry) =>
      Object.freeze({
        path: readVerificationProjectionRelativePath(
          entry.path,
          'Verification trace entry path'
        ),
        sourceTrace: readVerificationProjectionSourceTraces(
          entry.sourceTrace,
          'Verification trace entry sourceTrace'
        ),
        ...(entry.caseIds
          ? {
              caseIds: Object.freeze(
                [...entry.caseIds].sort(compareUnicodeCodePoints)
              ),
            }
          : {}),
      })
    )
    .sort((left, right) => compareUnicodeCodePoints(left.path, right.path));
  const value: VerificationTrace = Object.freeze({
    format: VERIFICATION_TRACE_FORMAT,
    traceKind: input.traceKind,
    subjectDigest: readDigest(
      input.subjectDigest,
      'Verification trace subjectDigest'
    ),
    entries: Object.freeze(entries),
  });
  const bytes = encodePublicVerificationArtifactProjection(
    value,
    'Canonical trace'
  );
  decodeVerificationTrace(bytes);
  return bytes;
};
