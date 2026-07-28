import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  containsVerificationEvidenceControlCodePoint,
  isVerificationEvidenceCanonicalNfc,
  verificationEvidencePointerSegment,
  verificationEvidenceUtf8Length,
} from './verificationEvidenceCodec.primitives';
import type {
  VerificationEvidenceRetentionProtection,
  VerificationEvidenceRetentionProtectionKind,
} from './verificationRetention';

export const MAXIMUM_VERIFICATION_EVIDENCE_RETENTION_PROTECTIONS = 10_000;

const MAXIMUM_IDENTIFIER_BYTES = 256;
const MAXIMUM_ISSUES = 128;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const URL_OR_QUERY_PATTERN = /(?:^[A-Za-z][A-Za-z0-9+.-]*:\/\/)|[/?#&=@]/u;
const CREDENTIAL_LABEL_PATTERN =
  /(?:^|[._:-])(?:authorization|bearer|cookie|set-cookie|api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|password|passwd|private[-_]?key|secret)(?:$|[._:-])/iu;
const CREDENTIAL_VALUE_PATTERNS = Object.freeze([
  /^AKIA[0-9A-Z]{16}$/u,
  /^gh[pousr]_[A-Za-z0-9_]{20,}$/u,
  /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u,
  /^sk-[A-Za-z0-9_-]{16,}$/u,
]);
const PROTECTION_KINDS = new Set<VerificationEvidenceRetentionProtectionKind>([
  'change',
  'release',
  'legal-hold',
]);
const REQUIRED_KEYS = Object.freeze([
  'id',
  'evidenceId',
  'kind',
  'externalRef',
  'active',
  'version',
] as const);

export type VerificationEvidenceRetentionProtectionIssue = Readonly<{
  code: 'VER-5001' | 'VER-5002';
  path: string;
  message: string;
}>;

export type VerificationEvidenceRetentionProtectionDecodeResult =
  | Readonly<{
      ok: true;
      value: VerificationEvidenceRetentionProtection;
    }>
  | Readonly<{
      ok: false;
      issues: readonly VerificationEvidenceRetentionProtectionIssue[];
    }>;

export type VerificationEvidenceRetentionProtectionsDecodeResult =
  | Readonly<{
      ok: true;
      value: readonly VerificationEvidenceRetentionProtection[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly VerificationEvidenceRetentionProtectionIssue[];
    }>;

type ExactRecord = Readonly<Record<string, unknown>>;

const addIssue = (
  issues: VerificationEvidenceRetentionProtectionIssue[],
  code: VerificationEvidenceRetentionProtectionIssue['code'],
  path: string,
  message: string
): void => {
  if (issues.length < MAXIMUM_ISSUES) {
    issues.push(Object.freeze({ code, path, message }));
  }
};

const childPath = (path: string, key: string): string =>
  `${path === '/' ? '' : path}/${verificationEvidencePointerSegment(key)}`;

const exactRecord = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): ExactRecord | undefined => {
  const issueCount = issues.length;
  try {
    if (!isPlainObject(value)) {
      addIssue(
        issues,
        'VER-5001',
        path,
        'Retention protection must be a plain object.'
      );
      return undefined;
    }
    const allowedKeys = new Set<string>(REQUIRED_KEYS);
    const entries: [string, unknown][] = [];
    const presentKeys = new Set<string>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        addIssue(
          issues,
          'VER-5001',
          path,
          'Retention protection cannot contain symbol fields.'
        );
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        isUnsafeObjectKey(key) ||
        !allowedKeys.has(key) ||
        !descriptor?.enumerable ||
        !('value' in descriptor)
      ) {
        addIssue(
          issues,
          'VER-5001',
          childPath(path, key),
          'Retention protection contains an unsupported, unsafe, or accessor-backed field.'
        );
        continue;
      }
      presentKeys.add(key);
      entries.push([key, descriptor.value]);
    }
    for (const key of REQUIRED_KEYS) {
      if (!presentKeys.has(key)) {
        addIssue(
          issues,
          'VER-5001',
          childPath(path, key),
          `Retention protection is missing required field: ${key}.`
        );
      }
    }
    return issues.length === issueCount
      ? Object.freeze(Object.fromEntries(entries))
      : undefined;
  } catch {
    addIssue(
      issues,
      'VER-5001',
      path,
      'Retention protection could not be inspected safely.'
    );
    return undefined;
  }
};

const exactArray = (
  value: unknown,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): readonly unknown[] | undefined => {
  try {
    if (!Array.isArray(value)) {
      addIssue(
        issues,
        'VER-5001',
        '/',
        'Retention protections must be an array.'
      );
      return undefined;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value >
        MAXIMUM_VERIFICATION_EVIDENCE_RETENTION_PROTECTIONS
    ) {
      addIssue(
        issues,
        'VER-5001',
        '/',
        'Retention protection collection exceeds its bounded length.'
      );
      return undefined;
    }
    const length = lengthDescriptor.value as number;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1) {
      addIssue(
        issues,
        'VER-5001',
        '/',
        'Retention protection collection must be dense and contain no custom fields.'
      );
      return undefined;
    }
    const result: unknown[] = [];
    for (const key of ownKeys) {
      if (key === 'length') continue;
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !/^(?:0|[1-9][0-9]*)$/u.test(key)
      ) {
        addIssue(
          issues,
          'VER-5001',
          '/',
          'Retention protection collection contains an unsafe field.'
        );
        return undefined;
      }
      const index = Number(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= length ||
        !descriptor?.enumerable ||
        !('value' in descriptor)
      ) {
        addIssue(
          issues,
          'VER-5001',
          childPath('/', key),
          'Retention protection collection contains an accessor or invalid index.'
        );
        return undefined;
      }
      result[index] = descriptor.value;
    }
    if (result.length !== length) {
      addIssue(
        issues,
        'VER-5001',
        '/',
        'Retention protection collection must be dense.'
      );
      return undefined;
    }
    return Object.freeze(result);
  } catch {
    addIssue(
      issues,
      'VER-5001',
      '/',
      'Retention protection collection could not be inspected safely.'
    );
    return undefined;
  }
};

const canonicalIdentifier = (
  value: unknown,
  path: string,
  label: string,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !isVerificationEvidenceCanonicalNfc(value) ||
    containsVerificationEvidenceControlCodePoint(value) ||
    verificationEvidenceUtf8Length(value) > MAXIMUM_IDENTIFIER_BYTES ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    addIssue(
      issues,
      'VER-5001',
      path,
      `${label} must be a bounded canonical Backend identifier.`
    );
    return undefined;
  }
  return value;
};

const credentialLikeExternalRef = (value: string): boolean =>
  URL_OR_QUERY_PATTERN.test(value) ||
  CREDENTIAL_LABEL_PATTERN.test(value) ||
  CREDENTIAL_VALUE_PATTERNS.some((pattern) => pattern.test(value));

const canonicalExternalRef = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): string | undefined => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !isVerificationEvidenceCanonicalNfc(value) ||
    containsVerificationEvidenceControlCodePoint(value) ||
    verificationEvidenceUtf8Length(value) > MAXIMUM_IDENTIFIER_BYTES
  ) {
    addIssue(
      issues,
      'VER-5001',
      path,
      'Retention external reference must be bounded, well-formed NFC text.'
    );
    return undefined;
  }
  if (credentialLikeExternalRef(value)) {
    addIssue(
      issues,
      'VER-5002',
      path,
      'Retention external reference cannot contain URL, query, or credential-like material.'
    );
    return undefined;
  }
  if (!DIGEST_PATTERN.test(value) && !IDENTIFIER_PATTERN.test(value)) {
    addIssue(
      issues,
      'VER-5001',
      path,
      'Retention external reference must be a sha256 digest or opaque Backend identifier.'
    );
    return undefined;
  }
  return value;
};

const protectionKind = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): VerificationEvidenceRetentionProtectionKind | undefined => {
  if (
    typeof value !== 'string' ||
    !PROTECTION_KINDS.has(value as VerificationEvidenceRetentionProtectionKind)
  ) {
    addIssue(
      issues,
      'VER-5001',
      path,
      'Retention protection kind is unsupported.'
    );
    return undefined;
  }
  return value as VerificationEvidenceRetentionProtectionKind;
};

const parseProtection = (
  value: unknown,
  path: string,
  issues: VerificationEvidenceRetentionProtectionIssue[]
): VerificationEvidenceRetentionProtection | undefined => {
  const record = exactRecord(value, path, issues);
  if (!record) return undefined;
  const issueCount = issues.length;
  const id = canonicalIdentifier(
    record.id,
    childPath(path, 'id'),
    'Retention protection id',
    issues
  );
  const evidenceId = canonicalIdentifier(
    record.evidenceId,
    childPath(path, 'evidenceId'),
    'Retention protection evidence id',
    issues
  );
  const kind = protectionKind(record.kind, childPath(path, 'kind'), issues);
  const externalRef = canonicalExternalRef(
    record.externalRef,
    childPath(path, 'externalRef'),
    issues
  );
  if (record.active !== true) {
    addIssue(
      issues,
      'VER-5001',
      childPath(path, 'active'),
      'Retention protection read projection must be active.'
    );
  }
  if (!Number.isSafeInteger(record.version) || (record.version as number) < 0) {
    addIssue(
      issues,
      'VER-5001',
      childPath(path, 'version'),
      'Retention protection version must be a nonnegative safe integer.'
    );
  }
  if (
    issues.length !== issueCount ||
    !id ||
    !evidenceId ||
    !kind ||
    !externalRef
  ) {
    return undefined;
  }
  return Object.freeze({
    id,
    evidenceId,
    kind,
    externalRef,
    active: true,
    version: record.version as number,
  });
};

const compareProtection = (
  left: VerificationEvidenceRetentionProtection,
  right: VerificationEvidenceRetentionProtection
): number =>
  compareUnicodeCodePoints(left.id, right.id) ||
  compareUnicodeCodePoints(left.evidenceId, right.evidenceId) ||
  compareUnicodeCodePoints(left.kind, right.kind) ||
  compareUnicodeCodePoints(left.externalRef, right.externalRef);

const invalid = (
  issues: VerificationEvidenceRetentionProtectionIssue[]
): Readonly<{
  ok: false;
  issues: readonly VerificationEvidenceRetentionProtectionIssue[];
}> => Object.freeze({ ok: false, issues: Object.freeze(issues) });

export const decodeVerificationEvidenceRetentionProtection = (
  value: unknown
): VerificationEvidenceRetentionProtectionDecodeResult => {
  const issues: VerificationEvidenceRetentionProtectionIssue[] = [];
  const protection = parseProtection(value, '/', issues);
  return protection && issues.length === 0
    ? Object.freeze({ ok: true, value: protection })
    : invalid(issues);
};

/**
 * Canonical read order follows the immutable protection id first, then
 * evidenceId, kind, and externalRef by Unicode code point as deterministic
 * tie-breakers. The Backend storage identity (evidenceId, kind, externalRef)
 * and the protection id must both be unique.
 */
export const decodeVerificationEvidenceRetentionProtections = (
  value: unknown
): VerificationEvidenceRetentionProtectionsDecodeResult => {
  const issues: VerificationEvidenceRetentionProtectionIssue[] = [];
  const values = exactArray(value, issues);
  if (!values) return invalid(issues);

  const parsed = values
    .map((entry, index) => ({
      index,
      protection: parseProtection(entry, `/${index}`, issues),
    }))
    .filter(
      (
        entry
      ): entry is Readonly<{
        index: number;
        protection: VerificationEvidenceRetentionProtection;
      }> => entry.protection !== undefined
    );
  const ids = new Set<string>();
  const storageIdentities = new Set<string>();
  for (const { index, protection } of parsed) {
    if (ids.has(protection.id)) {
      addIssue(
        issues,
        'VER-5001',
        `/${index}/id`,
        'Retention protection ids must be unique.'
      );
    }
    ids.add(protection.id);
    const storageIdentity = canonicalJsonText([
      protection.evidenceId,
      protection.kind,
      protection.externalRef,
    ]);
    if (storageIdentities.has(storageIdentity)) {
      addIssue(
        issues,
        'VER-5001',
        `/${index}`,
        'Retention protection Backend storage identities must be unique.'
      );
    }
    storageIdentities.add(storageIdentity);
  }
  if (issues.length > 0) return invalid(issues);
  return Object.freeze({
    ok: true,
    value: Object.freeze(
      parsed.map(({ protection }) => protection).sort(compareProtection)
    ),
  });
};

const issueMessage = (
  issues: readonly VerificationEvidenceRetentionProtectionIssue[]
): string =>
  issues.map(({ path, message }) => `${path}: ${message}`).join('; ');

export const encodeVerificationEvidenceRetentionProtection = (
  value: VerificationEvidenceRetentionProtection
): VerificationEvidenceRetentionProtection => {
  const decoded = decodeVerificationEvidenceRetentionProtection(value);
  if (!decoded.ok) throw new TypeError(issueMessage(decoded.issues));
  return decoded.value;
};

export const encodeVerificationEvidenceRetentionProtections = (
  value: readonly VerificationEvidenceRetentionProtection[]
): readonly VerificationEvidenceRetentionProtection[] => {
  const decoded = decodeVerificationEvidenceRetentionProtections(value);
  if (!decoded.ok) throw new TypeError(issueMessage(decoded.issues));
  return decoded.value;
};
