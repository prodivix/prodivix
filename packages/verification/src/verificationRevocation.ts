import { utf8ToBytes } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';

export const VERIFICATION_TRUST_REVOCATION_FORMAT =
  'prodivix.verification-trust-revocation' as const;
export const VERIFICATION_TRUST_REVOCATION_VERSION = 1 as const;
export const VERIFICATION_REVOCATION_VIEW_FORMAT =
  'prodivix.verification-revocation-view' as const;
export const VERIFICATION_REVOCATION_VIEW_VERSION = 1 as const;

const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$/u;
const maximumRecords = 10_000;
const maximumEvidence = 100_000;

export type VerificationTrustRevocationScope =
  | Readonly<{ kind: 'issuer'; issuer: string }>
  | Readonly<{ kind: 'key'; issuer: string; keyId: string }>
  | Readonly<{ kind: 'evidence'; evidenceId: string }>;

export type VerificationTrustRevocationRecordInput = Readonly<{
  id: string;
  scope: VerificationTrustRevocationScope;
  reasonCode: string;
  reason: string;
  actorId: string;
  recordedAt: string;
  effectiveAt: string;
}>;

export type VerificationTrustRevocationRecord =
  VerificationTrustRevocationRecordInput &
    Readonly<{
      format: typeof VERIFICATION_TRUST_REVOCATION_FORMAT;
      version: typeof VERIFICATION_TRUST_REVOCATION_VERSION;
      recordDigest: string;
    }>;

export type VerificationRevocableEvidence = Readonly<{
  evidenceId: string;
  attestation?: Readonly<{
    issuer: string;
    keyId: string;
  }>;
}>;

export type VerificationEffectiveRevocationView = Readonly<{
  format: typeof VERIFICATION_REVOCATION_VIEW_FORMAT;
  version: typeof VERIFICATION_REVOCATION_VIEW_VERSION;
  evaluationInstant: string;
  effectiveRecords: readonly VerificationTrustRevocationRecord[];
  revokedEvidenceIds: readonly string[];
  revocationRecordDigest: string;
}>;

const exactRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Readonly<Record<string, unknown>> | undefined => {
  try {
    if (!isPlainObject(value)) return undefined;
    const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length < requiredKeys.length ||
      ownKeys.length > allowedKeys.size
    )
      return undefined;
    const presentKeys = new Set<string>();
    const entries: [string, unknown][] = [];
    for (const key of ownKeys) {
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !allowedKeys.has(key)
      )
        return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      presentKeys.add(key);
      entries.push([key, descriptor.value]);
    }
    if (requiredKeys.some((key) => !presentKeys.has(key))) return undefined;
    return Object.freeze(Object.fromEntries(entries));
  } catch {
    return undefined;
  }
};

const exactDataArray = (
  value: unknown,
  maximumLength: number
): readonly unknown[] | undefined => {
  try {
    if (!Array.isArray(value)) return undefined;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (
      !lengthDescriptor ||
      !('value' in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maximumLength
    )
      return undefined;
    const length = lengthDescriptor.value as number;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1) return undefined;
    const items: unknown[] = [];
    for (const key of ownKeys) {
      if (key === 'length') continue;
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !/^(0|[1-9][0-9]*)$/u.test(key)
      )
        return undefined;
      const index = Number(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= length ||
        !descriptor?.enumerable ||
        !('value' in descriptor)
      )
        return undefined;
      items[index] = descriptor.value;
    }
    if (items.length !== length) return undefined;
    return Object.freeze(items);
  } catch {
    return undefined;
  }
};

const canonicalText = (
  value: unknown,
  maximumBytes = 512
): string | undefined => {
  if (typeof value !== 'string' || value.length < 1 || value !== value.trim())
    return undefined;
  const bytes = utf8ToBytes(value);
  const containsControl = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint < 32 || codePoint === 127;
  });
  return bytes.byteLength <= maximumBytes && !containsControl
    ? value
    : undefined;
};

const identifier = (value: unknown): string | undefined => {
  const normalized = canonicalText(value);
  return normalized && identifierPattern.test(normalized)
    ? normalized
    : undefined;
};

const digest = (value: unknown): string | undefined =>
  typeof value === 'string' && digestPattern.test(value) ? value : undefined;

const normalizeInstant = (value: unknown): string | undefined =>
  typeof value === 'string' && parseVerificationInstant(value) !== undefined
    ? value
    : undefined;

const normalizeScope = (
  value: VerificationTrustRevocationScope
): VerificationTrustRevocationScope => {
  {
    const record = exactRecord(value, ['kind', 'issuer']);
    const issuer = canonicalText(record?.issuer);
    if (record?.kind === 'issuer' && issuer)
      return Object.freeze({ kind: 'issuer', issuer });
  }
  {
    const record = exactRecord(value, ['kind', 'issuer', 'keyId']);
    const issuer = canonicalText(record?.issuer);
    const keyId = identifier(record?.keyId);
    if (record?.kind === 'key' && issuer && keyId)
      return Object.freeze({ kind: 'key', issuer, keyId });
  }
  {
    const record = exactRecord(value, ['kind', 'evidenceId']);
    const evidenceId = identifier(record?.evidenceId);
    if (record?.kind === 'evidence' && evidenceId)
      return Object.freeze({ kind: 'evidence', evidenceId });
  }
  throw new TypeError('Verification trust revocation scope is invalid.');
};

const normalizeRecordInput = (
  value: VerificationTrustRevocationRecordInput
): VerificationTrustRevocationRecordInput => {
  const record = exactRecord(value, [
    'id',
    'scope',
    'reasonCode',
    'reason',
    'actorId',
    'recordedAt',
    'effectiveAt',
  ]);
  const id = identifier(record?.id);
  const reasonCode = identifier(record?.reasonCode);
  const reason = canonicalText(record?.reason, 4_096);
  const actorId = identifier(record?.actorId);
  const recordedAt = normalizeInstant(record?.recordedAt);
  const effectiveAt = normalizeInstant(record?.effectiveAt);
  if (!id || !reasonCode || !reason || !actorId || !recordedAt || !effectiveAt)
    throw new TypeError('Verification trust revocation record is invalid.');
  return Object.freeze({
    id,
    scope: normalizeScope(record!.scope as VerificationTrustRevocationScope),
    reasonCode,
    reason,
    actorId,
    recordedAt,
    effectiveAt,
  });
};

const recordDigest = (value: VerificationTrustRevocationRecordInput): string =>
  digestVerificationValue(
    Object.freeze({
      format: VERIFICATION_TRUST_REVOCATION_FORMAT,
      version: VERIFICATION_TRUST_REVOCATION_VERSION,
      ...value,
    })
  );

export const createVerificationTrustRevocationRecord = (
  value: VerificationTrustRevocationRecordInput
): VerificationTrustRevocationRecord => {
  const normalized = normalizeRecordInput(value);
  return Object.freeze({
    format: VERIFICATION_TRUST_REVOCATION_FORMAT,
    version: VERIFICATION_TRUST_REVOCATION_VERSION,
    ...normalized,
    recordDigest: recordDigest(normalized),
  });
};

export const normalizeVerificationTrustRevocationRecord = (
  value: VerificationTrustRevocationRecord
): VerificationTrustRevocationRecord => {
  const record = exactRecord(value, [
    'format',
    'version',
    'id',
    'scope',
    'reasonCode',
    'reason',
    'actorId',
    'recordedAt',
    'effectiveAt',
    'recordDigest',
  ]);
  const storedDigest = digest(record?.recordDigest);
  if (
    !record ||
    record.format !== VERIFICATION_TRUST_REVOCATION_FORMAT ||
    record.version !== VERIFICATION_TRUST_REVOCATION_VERSION ||
    !storedDigest
  )
    throw new TypeError('Verification trust revocation record is invalid.');
  const normalized = normalizeRecordInput({
    id: record.id as string,
    scope: record.scope as VerificationTrustRevocationScope,
    reasonCode: record.reasonCode as string,
    reason: record.reason as string,
    actorId: record.actorId as string,
    recordedAt: record.recordedAt as string,
    effectiveAt: record.effectiveAt as string,
  });
  if (recordDigest(normalized) !== storedDigest)
    throw new TypeError('Verification trust revocation digest is invalid.');
  return Object.freeze({
    format: VERIFICATION_TRUST_REVOCATION_FORMAT,
    version: VERIFICATION_TRUST_REVOCATION_VERSION,
    ...normalized,
    recordDigest: storedDigest,
  });
};

const recordOrder = (
  left: VerificationTrustRevocationRecord,
  right: VerificationTrustRevocationRecord
): number => compareUnicodeCodePoints(left.id, right.id);

export const normalizeVerificationTrustRevocationRecords = (
  values: readonly VerificationTrustRevocationRecord[]
): readonly VerificationTrustRevocationRecord[] => {
  const recordValues = exactDataArray(values, maximumRecords);
  if (!recordValues)
    throw new TypeError('Verification trust revocation set is invalid.');
  const records = (recordValues as VerificationTrustRevocationRecord[])
    .map(normalizeVerificationTrustRevocationRecord)
    .sort(recordOrder);
  if (new Set(records.map(({ id }) => id)).size !== records.length)
    throw new TypeError('Verification trust revocation ids must be unique.');
  return Object.freeze(records);
};

/**
 * Returns a new immutable sequence. An identical id/digest replay is
 * idempotent; attempting to mutate an existing id is a hard conflict.
 */
export const appendVerificationTrustRevocationRecord = (
  existing: readonly VerificationTrustRevocationRecord[],
  input: VerificationTrustRevocationRecordInput
): readonly VerificationTrustRevocationRecord[] => {
  const records = normalizeVerificationTrustRevocationRecords(existing);
  const created = createVerificationTrustRevocationRecord(input);
  const previous = records.find(({ id }) => id === created.id);
  if (previous) {
    if (previous.recordDigest !== created.recordDigest)
      throw new TypeError('Verification trust revocation id conflicts.');
    return records;
  }
  return Object.freeze([...records, created].sort(recordOrder));
};

const normalizeEvidence = (
  value: VerificationRevocableEvidence
): VerificationRevocableEvidence => {
  const record = exactRecord(value, ['evidenceId'], ['attestation']);
  if (!record)
    throw new TypeError('Verification revocable Evidence identity is invalid.');
  const evidenceId = identifier(record.evidenceId);
  if (!evidenceId)
    throw new TypeError('Verification revocable Evidence identity is invalid.');
  if (record.attestation === undefined) return Object.freeze({ evidenceId });
  const attestation = exactRecord(record.attestation, ['issuer', 'keyId']);
  const issuer = canonicalText(attestation?.issuer);
  const keyId = identifier(attestation?.keyId);
  if (!issuer || !keyId)
    throw new TypeError('Verification revocable Evidence identity is invalid.');
  return Object.freeze({
    evidenceId,
    attestation: Object.freeze({ issuer, keyId }),
  });
};

const revocationApplies = (
  record: VerificationTrustRevocationRecord,
  evidence: VerificationRevocableEvidence
): boolean => {
  switch (record.scope.kind) {
    case 'evidence':
      return record.scope.evidenceId === evidence.evidenceId;
    case 'issuer':
      return evidence.attestation?.issuer === record.scope.issuer;
    case 'key':
      return (
        evidence.attestation?.issuer === record.scope.issuer &&
        evidence.attestation.keyId === record.scope.keyId
      );
  }
};

export const verificationTrustRevocationApplies = (
  record: VerificationTrustRevocationRecord,
  evidence: VerificationRevocableEvidence
): boolean =>
  revocationApplies(
    normalizeVerificationTrustRevocationRecord(record),
    normalizeEvidence(evidence)
  );

/**
 * Builds the exact revocation view used by one Closure evaluation. Future or
 * not-yet-recorded revocations are retained in storage but excluded from this
 * view until both instants have been reached.
 */
export const createVerificationEffectiveRevocationView = (input: {
  records: readonly VerificationTrustRevocationRecord[];
  evidence: readonly VerificationRevocableEvidence[];
  evaluationInstant: string;
}): VerificationEffectiveRevocationView => {
  const inputRecord = exactRecord(input, [
    'records',
    'evidence',
    'evaluationInstant',
  ]);
  const evaluationInstant =
    typeof inputRecord?.evaluationInstant === 'string'
      ? inputRecord.evaluationInstant
      : '';
  const instant = parseVerificationInstant(evaluationInstant);
  const evidenceValues = exactDataArray(inputRecord?.evidence, maximumEvidence);
  if (instant === undefined || !evidenceValues)
    throw new TypeError('Verification revocation view input is invalid.');
  const records = normalizeVerificationTrustRevocationRecords(
    inputRecord!.records as readonly VerificationTrustRevocationRecord[]
  );
  const evidence = (evidenceValues as VerificationRevocableEvidence[])
    .map(normalizeEvidence)
    .sort((left, right) =>
      compareUnicodeCodePoints(left.evidenceId, right.evidenceId)
    );
  if (
    new Set(evidence.map(({ evidenceId }) => evidenceId)).size !==
    evidence.length
  )
    throw new TypeError('Verification revocable Evidence ids must be unique.');
  const effectiveRecords = Object.freeze(
    records.filter((record) => {
      const recordedAt = parseVerificationInstant(record.recordedAt)!;
      const effectiveAt = parseVerificationInstant(record.effectiveAt)!;
      return recordedAt <= instant && effectiveAt <= instant;
    })
  );
  const revokedIssuerIds = new Set<string>();
  const revokedKeyIds = new Map<string, Set<string>>();
  const explicitlyRevokedEvidenceIds = new Set<string>();
  for (const record of effectiveRecords)
    switch (record.scope.kind) {
      case 'issuer':
        revokedIssuerIds.add(record.scope.issuer);
        break;
      case 'key': {
        const keys =
          revokedKeyIds.get(record.scope.issuer) ?? new Set<string>();
        keys.add(record.scope.keyId);
        revokedKeyIds.set(record.scope.issuer, keys);
        break;
      }
      case 'evidence':
        explicitlyRevokedEvidenceIds.add(record.scope.evidenceId);
        break;
    }
  const revokedEvidenceIds = Object.freeze(
    evidence
      .filter(
        (candidate) =>
          explicitlyRevokedEvidenceIds.has(candidate.evidenceId) ||
          (candidate.attestation !== undefined &&
            (revokedIssuerIds.has(candidate.attestation.issuer) ||
              revokedKeyIds
                .get(candidate.attestation.issuer)
                ?.has(candidate.attestation.keyId) === true))
      )
      .map(({ evidenceId }) => evidenceId)
      .sort(compareUnicodeCodePoints)
  );
  const digestInput = Object.freeze({
    format: VERIFICATION_REVOCATION_VIEW_FORMAT,
    version: VERIFICATION_REVOCATION_VIEW_VERSION,
    evaluationInstant,
    records: effectiveRecords.map(({ id, recordDigest }) => ({
      id,
      recordDigest,
    })),
    revokedEvidenceIds,
  });
  return Object.freeze({
    format: VERIFICATION_REVOCATION_VIEW_FORMAT,
    version: VERIFICATION_REVOCATION_VIEW_VERSION,
    evaluationInstant,
    effectiveRecords,
    revokedEvidenceIds,
    revocationRecordDigest: digestVerificationValue(digestInput),
  });
};
