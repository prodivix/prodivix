import { utf8ToBytes } from '@noble/hashes/utils.js';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateIssue,
} from './verification.types';

export const VERIFICATION_EVIDENCE_CODEC_LIMITS = Object.freeze({
  maximumCandidateBytes: 1_048_576,
  maximumArtifacts: 128,
  maximumArtifactBytes: 512 * 1_024 * 1_024,
  maximumDocumentRevisions: 4_096,
  maximumDroppedFieldCounts: 2_048,
  maximumDiagnosticCodes: 2_048,
  maximumAppliedExemptionIds: 2_048,
  maximumFixtureSetDigests: 2_048,
  maximumSourceTraces: 256,
  maximumSourceTraceBytes: 256 * 1_024,
  maximumSourceTraceLabelBytes: 1_024,
  maximumIdentifierBytes: 256,
  maximumTextBytes: 4_096,
  maximumPathBytes: 512,
  maximumPathSegments: 16,
  maximumSummaryDepth: 32,
  maximumSummaryNodes: 16_384,
  maximumSummaryObjectKeys: 2_048,
  maximumSummaryKeyBytes: 512,
  maximumSummaryStringBytes: 64 * 1_024,
  maximumSummaryBytes: 512 * 1_024,
  maximumIssues: 128,
});

export const VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION = 1 as const;

export type VerificationEvidenceCandidateWire = VerificationEvidenceCandidate &
  Readonly<{
    wireVersion: typeof VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION;
  }>;

export type VerificationEvidenceWireRecord = Readonly<Record<string, unknown>>;

export const verificationEvidencePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

export const addVerificationEvidenceCodecIssue = (
  issues: VerificationEvidenceCandidateIssue[],
  code: VerificationEvidenceCandidateIssue['code'],
  path: string,
  message: string
): void => {
  if (issues.length < VERIFICATION_EVIDENCE_CODEC_LIMITS.maximumIssues) {
    issues.push(Object.freeze({ code, path, message }));
  }
};

export const verificationEvidenceUtf8Length = (value: string): number =>
  utf8ToBytes(value).byteLength;

export const isVerificationEvidenceUnicodeScalarText = (
  value: string
): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (
        !Number.isInteger(trailing) ||
        trailing < 0xdc00 ||
        trailing > 0xdfff
      ) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
};

export const isVerificationEvidenceCanonicalNfc = (value: string): boolean =>
  isVerificationEvidenceUnicodeScalarText(value) &&
  value === value.normalize('NFC');

export const containsVerificationEvidenceControlCodePoint = (
  value: string
): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
};

export const verificationEvidenceOwnDataValue = (
  record: VerificationEvidenceWireRecord,
  key: string
): unknown | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

export const readExactVerificationEvidenceRecord = (
  value: unknown,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  issues: VerificationEvidenceCandidateIssue[]
): VerificationEvidenceWireRecord | undefined => {
  if (!isPlainObject(value)) {
    addVerificationEvidenceCodecIssue(
      issues,
      'VER-4002',
      path,
      'Expected a plain EvidenceCandidate object.'
    );
    return undefined;
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key !== 'string') {
      addVerificationEvidenceCodecIssue(
        issues,
        'VER-4002',
        path,
        'EvidenceCandidate objects cannot contain symbol fields.'
      );
      continue;
    }
    const fieldPath =
      `${path}/${verificationEvidencePointerSegment(key)}`.replace('//', '/');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      isUnsafeObjectKey(key) ||
      !allowed.has(key) ||
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    ) {
      addVerificationEvidenceCodecIssue(
        issues,
        'VER-4002',
        fieldPath,
        `Unsupported or accessor-backed EvidenceCandidate field: ${key}.`
      );
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      const fieldPath =
        `${path}/${verificationEvidencePointerSegment(key)}`.replace('//', '/');
      addVerificationEvidenceCodecIssue(
        issues,
        'VER-4002',
        fieldPath,
        `Missing required EvidenceCandidate field: ${key}.`
      );
    }
  }
  return value;
};
