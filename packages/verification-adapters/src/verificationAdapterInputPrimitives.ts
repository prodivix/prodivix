import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  VerificationArtifactKind,
  VerificationNormalizedFinding,
} from '@prodivix/verification';
import {
  VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE,
  decodeVerificationBuildSummary,
} from './buildLogProjection';
import {
  VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE,
  decodeVerificationCoverageSummary,
} from './coverageSummaryProjection';
import {
  VERIFICATION_TRACE_MEDIA_TYPE,
  decodeVerificationTrace,
} from './verificationTraceProjection';

export const VERIFICATION_ADAPTER_INPUT_LIMITS = Object.freeze({
  maximumJsonBytes: 16 * 1024 * 1024,
  maximumBuildBundleBytes: 512 * 1024 * 1024,
  maximumArtifacts: 128,
  maximumFindings: 4_096,
  maximumTextBytes: 1_024,
});

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const ARTIFACT_KINDS = new Set<VerificationArtifactKind>([
  'screenshot',
  'visual-diff',
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'build-log',
  'replay-record',
]);

export type VerificationAdapterArtifactSource = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  mediaType: string;
  bytes: Uint8Array;
}>;

export type PreparedVerificationAdapterArtifact = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  mediaType: string;
  digest: string;
  size: number;
  bytes: Uint8Array;
}>;

type ArtifactWire = Readonly<{
  id: string;
  kind: VerificationArtifactKind;
  mediaType: string;
  digest: string;
  size: number;
  encoding: 'base64';
  contents: string;
}>;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export const readExactRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key))
    )
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

export const readCanonicalText = (
  value: unknown,
  label: string,
  maximumBytes: number = VERIFICATION_ADAPTER_INPUT_LIMITS.maximumTextBytes
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    // eslint-disable-next-line no-control-regex -- rejecting controls is the contract
    /[\u0000-\u001f\u007f]/u.test(value) ||
    utf8Encoder.encode(value).byteLength > maximumBytes
  ) {
    throw new TypeError(`${label} must be bounded canonical text.`);
  }
  return value;
};

export const readToken = (value: unknown, label: string): string => {
  const normalized = readCanonicalText(value, label, 256);
  if (!TOKEN_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a canonical identifier.`);
  }
  return normalized;
};

export const readDigest = (value: unknown, label: string): string => {
  const normalized = readCanonicalText(value, label, 71);
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a canonical SHA-256 digest.`);
  }
  return normalized;
};

export const readMediaType = (value: unknown, label: string): string => {
  const normalized = readCanonicalText(value, label, 256);
  if (!MEDIA_TYPE_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a canonical media type.`);
  }
  return normalized;
};

export const readSafeInteger = (
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new TypeError(`${label} must be a bounded safe integer.`);
  }
  return value as number;
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const decodeBase64 = (value: unknown, label: string): Uint8Array => {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new TypeError(`${label} must be canonical base64.`);
  }
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64(bytes) !== value) {
    throw new TypeError(`${label} must use canonical base64 padding.`);
  }
  return bytes;
};

const assertCanonicalStaticArtifact = (
  kind: VerificationArtifactKind,
  mediaType: string,
  bytes: Uint8Array
): void => {
  switch (kind) {
    case 'build-log':
      if (mediaType !== VERIFICATION_BUILD_SUMMARY_MEDIA_TYPE) {
        throw new TypeError(
          'build-log artifacts must use the canonical build summary media type.'
        );
      }
      decodeVerificationBuildSummary(bytes);
      return;
    case 'coverage-summary':
      if (mediaType !== VERIFICATION_COVERAGE_SUMMARY_MEDIA_TYPE) {
        throw new TypeError(
          'coverage-summary artifacts must use the canonical coverage summary media type.'
        );
      }
      decodeVerificationCoverageSummary(bytes);
      return;
    case 'trace':
      if (mediaType !== VERIFICATION_TRACE_MEDIA_TYPE) {
        throw new TypeError(
          'trace artifacts must use the canonical trace media type.'
        );
      }
      decodeVerificationTrace(bytes);
      return;
    default:
      // Other artifact kinds remain opaque by their current domain contract.
      return;
  }
};

export const digestVerificationAdapterBytes = (bytes: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(bytes))}`;

const artifactIdentity = (
  artifact: Pick<VerificationAdapterArtifactSource, 'id'>
): string => artifact.id;

const findingIdentity = (finding: VerificationNormalizedFinding): string =>
  [
    finding.ruleId,
    finding.targetId,
    finding.messageKey,
    finding.severity,
    finding.sourceTraceDigest ?? '',
  ].join('\u0000');

export const assertStrictOrder = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string
): void => {
  let previous: string | undefined;
  for (const value of values) {
    const current = identity(value);
    if (
      previous !== undefined &&
      compareUnicodeCodePoints(previous, current) >= 0
    ) {
      throw new TypeError(`${label} must be uniquely sorted.`);
    }
    previous = current;
  }
};

const readStringArray = (
  value: unknown,
  label: string,
  reader: (entry: unknown, entryLabel: string) => string,
  maximum = 256
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded array.`);
  }
  const result = value.map((entry, index) =>
    reader(entry, `${label}[${index}]`)
  );
  assertStrictOrder(result, (entry) => entry, label);
  return Object.freeze(result);
};

const readFinding = (
  value: unknown,
  index: number
): VerificationNormalizedFinding => {
  const record = readExactRecord(
    value,
    [
      'ruleId',
      'severity',
      'targetId',
      'messageKey',
      'count',
      'diagnosticCodes',
    ],
    ['sourceTraceDigest'],
    `findings[${index}]`
  );
  const severity = record.severity;
  if (
    severity !== 'info' &&
    severity !== 'warning' &&
    severity !== 'error' &&
    severity !== 'fatal'
  ) {
    throw new TypeError(`findings[${index}].severity is unsupported.`);
  }
  const sourceTraceDigest =
    record.sourceTraceDigest === undefined
      ? undefined
      : readDigest(
          record.sourceTraceDigest,
          `findings[${index}].sourceTraceDigest`
        );
  return Object.freeze({
    ruleId: readToken(record.ruleId, `findings[${index}].ruleId`),
    severity,
    targetId: readToken(record.targetId, `findings[${index}].targetId`),
    messageKey: readToken(record.messageKey, `findings[${index}].messageKey`),
    count: readSafeInteger(
      record.count,
      `findings[${index}].count`,
      1,
      1_000_000_000
    ),
    diagnosticCodes: readStringArray(
      record.diagnosticCodes,
      `findings[${index}].diagnosticCodes`,
      readToken
    ),
    ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
  });
};

export const readFindings = (
  value: unknown
): readonly VerificationNormalizedFinding[] => {
  if (
    !Array.isArray(value) ||
    value.length > VERIFICATION_ADAPTER_INPUT_LIMITS.maximumFindings
  ) {
    throw new TypeError('findings must be a bounded array.');
  }
  const findings = value.map(readFinding);
  assertStrictOrder(findings, findingIdentity, 'findings');
  return Object.freeze(findings);
};

export const canonicalizeFindings = (
  value: readonly VerificationNormalizedFinding[]
): readonly VerificationNormalizedFinding[] => {
  const findings = value
    .map((finding) => readFinding(finding, 0))
    .sort((left, right) =>
      compareUnicodeCodePoints(findingIdentity(left), findingIdentity(right))
    );
  assertStrictOrder(findings, findingIdentity, 'findings');
  return Object.freeze(findings);
};

const toArtifactWire = (
  artifact: VerificationAdapterArtifactSource
): ArtifactWire => {
  if (!ARTIFACT_KINDS.has(artifact.kind)) {
    throw new TypeError('artifact.kind is unsupported.');
  }
  const bytes = new Uint8Array(artifact.bytes);
  const mediaType = readMediaType(artifact.mediaType, 'artifact.mediaType');
  assertCanonicalStaticArtifact(artifact.kind, mediaType, bytes);
  return Object.freeze({
    id: readToken(artifact.id, 'artifact.id'),
    kind: artifact.kind,
    mediaType,
    digest: digestVerificationAdapterBytes(bytes),
    size: bytes.byteLength,
    encoding: 'base64',
    contents: encodeBase64(bytes),
  });
};

const readArtifact = (
  value: unknown,
  index: number
): PreparedVerificationAdapterArtifact => {
  const record = readExactRecord(
    value,
    ['id', 'kind', 'mediaType', 'digest', 'size', 'encoding', 'contents'],
    [],
    `artifacts[${index}]`
  );
  if (
    typeof record.kind !== 'string' ||
    !ARTIFACT_KINDS.has(record.kind as VerificationArtifactKind)
  ) {
    throw new TypeError(`artifacts[${index}].kind is unsupported.`);
  }
  if (record.encoding !== 'base64') {
    throw new TypeError(`artifacts[${index}].encoding is unsupported.`);
  }
  const bytes = decodeBase64(record.contents, `artifacts[${index}].contents`);
  const expectedDigest = digestVerificationAdapterBytes(bytes);
  const declaredDigest = readDigest(
    record.digest,
    `artifacts[${index}].digest`
  );
  const size = readSafeInteger(
    record.size,
    `artifacts[${index}].size`,
    0,
    VERIFICATION_ADAPTER_INPUT_LIMITS.maximumJsonBytes
  );
  if (declaredDigest !== expectedDigest || size !== bytes.byteLength) {
    throw new TypeError(`artifacts[${index}] content identity does not match.`);
  }
  const mediaType = readMediaType(
    record.mediaType,
    `artifacts[${index}].mediaType`
  );
  assertCanonicalStaticArtifact(
    record.kind as VerificationArtifactKind,
    mediaType,
    bytes
  );
  return Object.freeze({
    id: readToken(record.id, `artifacts[${index}].id`),
    kind: record.kind as VerificationArtifactKind,
    mediaType,
    digest: expectedDigest,
    size,
    bytes,
  });
};

export const readArtifacts = (
  value: unknown
): readonly PreparedVerificationAdapterArtifact[] => {
  if (
    !Array.isArray(value) ||
    value.length > VERIFICATION_ADAPTER_INPUT_LIMITS.maximumArtifacts
  ) {
    throw new TypeError('artifacts must be a bounded array.');
  }
  const artifacts = value.map(readArtifact);
  assertStrictOrder(artifacts, artifactIdentity, 'artifacts');
  return Object.freeze(artifacts);
};

export const canonicalizeArtifacts = (
  value: readonly VerificationAdapterArtifactSource[]
): readonly ArtifactWire[] => {
  const artifacts = value
    .map(toArtifactWire)
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  assertStrictOrder(artifacts, artifactIdentity, 'artifacts');
  return Object.freeze(artifacts);
};

export const encodeCanonicalJsonBytes = (value: unknown): Uint8Array =>
  utf8Encoder.encode(canonicalJsonText(value));

export const decodeCanonicalJsonBytes = (
  bytes: Uint8Array,
  label: string,
  maximumBytes = VERIFICATION_ADAPTER_INPUT_LIMITS.maximumJsonBytes
): Record<string, unknown> => {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > maximumBytes
  ) {
    throw new TypeError(`${label} bytes are missing or over budget.`);
  }
  let text: string;
  let value: unknown;
  try {
    text = utf8Decoder.decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch {
    throw new TypeError(`${label} must be strict UTF-8 JSON.`);
  }
  if (canonicalJsonText(value) !== text) {
    throw new TypeError(`${label} bytes must use canonical JSON encoding.`);
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must contain a JSON object.`);
  }
  return value;
};

export const readSortedDigestArray = (
  value: unknown,
  label: string
): readonly string[] => readStringArray(value, label, readDigest);
