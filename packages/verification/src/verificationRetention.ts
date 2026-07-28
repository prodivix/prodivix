import type {
  VerificationEvidence,
  VerificationEvidenceArtifactAvailabilityStatus,
  VerificationEvidenceTrust,
  VerificationEvidenceTrustVerificationStatus,
  VerificationEvidenceVerifiedView,
  VerificationEvidenceVerifiedViewRecord,
} from './verification.types';
import {
  compareVerificationText,
  digestVerificationValue,
  parseVerificationInstant,
  uniqueVerificationText,
} from './verificationCanonical';
import { MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS } from './verificationPlannerGraph';
import { hasSameVerificationEvidenceSupersessionLineage } from './verificationEvidenceSupersession';

export const VERIFICATION_EVIDENCE_VERIFIED_VIEW_FORMAT =
  'prodivix.verification-evidence-view.v1' as const;

export type VerificationEvidenceTrustStatus =
  VerificationEvidenceTrustVerificationStatus;

export type {
  VerificationEvidenceArtifactAvailabilityStatus,
  VerificationEvidenceRetentionState,
  VerificationEvidenceVerifiedView,
  VerificationEvidenceVerifiedViewRecord,
} from './verification.types';

export type VerificationEvidenceArtifactAvailability = Readonly<{
  artifactId: string;
  digest: string;
  status: VerificationEvidenceArtifactAvailabilityStatus;
}>;

/**
 * Retention protections are Backend-authored read projections. G3 can observe a
 * legal hold, but deliberately has no Core API for creating or releasing one.
 */
export const VERIFICATION_EVIDENCE_G3_MUTABLE_RETENTION_PROTECTION_KINDS =
  Object.freeze(['change', 'release'] as const);

export type VerificationEvidenceG3MutableRetentionProtectionKind =
  (typeof VERIFICATION_EVIDENCE_G3_MUTABLE_RETENTION_PROTECTION_KINDS)[number];

export type VerificationEvidenceRetentionProtectionKind =
  VerificationEvidenceG3MutableRetentionProtectionKind | 'legal-hold';

export type VerificationEvidenceRetentionProtection = Readonly<{
  id: string;
  evidenceId: string;
  kind: VerificationEvidenceRetentionProtectionKind;
  externalRef: string;
  active: true;
  version: number;
}>;

export {
  decodeVerificationEvidenceRetentionProtection,
  decodeVerificationEvidenceRetentionProtections,
  encodeVerificationEvidenceRetentionProtection,
  encodeVerificationEvidenceRetentionProtections,
  MAXIMUM_VERIFICATION_EVIDENCE_RETENTION_PROTECTIONS,
  type VerificationEvidenceRetentionProtectionDecodeResult,
  type VerificationEvidenceRetentionProtectionIssue,
  type VerificationEvidenceRetentionProtectionsDecodeResult,
} from './verificationRetentionProtectionCodec';

export type CreateVerificationEvidenceVerifiedViewInput = Readonly<{
  closureEvaluationInstant: string;
  revocationRecordDigest: string;
  records: readonly Omit<
    VerificationEvidenceVerifiedViewRecord,
    'recordDigest'
  >[];
}>;

export type VerificationEvidenceVerifiedViewResult =
  | Readonly<{
      status: 'ready';
      view: VerificationEvidenceVerifiedView;
    }>
  | Readonly<{
      status: 'invalid';
      message: string;
    }>;

export type VerificationEvidenceAcceptanceStatus =
  | 'acceptable'
  | 'unverified'
  | 'revoked'
  | 'expired'
  | 'tombstoned'
  | 'superseded'
  | 'artifact-unavailable'
  | 'invalid';

export type VerificationEvidenceAcceptance = Readonly<{
  status: VerificationEvidenceAcceptanceStatus;
  effectiveTrust?: VerificationEvidenceTrust;
  message?: string;
}>;

const trustValues = new Set<VerificationEvidenceTrust>([
  'local-unattested',
  'remote-attested',
  'ci-attested',
  'imported-untrusted',
]);
const trustRank: Readonly<Record<VerificationEvidenceTrust, number>> =
  Object.freeze({
    'imported-untrusted': 0,
    'local-unattested': 1,
    'remote-attested': 2,
    'ci-attested': 3,
  });
const trustStatuses = new Set<VerificationEvidenceTrustStatus>([
  'verified',
  'unverified',
  'revoked',
  'expired',
]);
const retentionStates = new Set([
  'active',
  'tombstoned',
  'references-released',
] as const);
const artifactAvailabilityStatuses =
  new Set<VerificationEvidenceArtifactAvailabilityStatus>([
    'available',
    'missing',
    'deleted',
  ]);
const recordKeys = new Set([
  'evidenceId',
  'manifestDigest',
  'materializedEvidenceDigest',
  'effectiveTrust',
  'trustStatus',
  'attestationDigest',
  'retentionState',
  'retentionExpiresAt',
  'supersededByEvidenceId',
  'revocationRecordDigests',
  'tombstoneDigest',
  'artifacts',
]);
const artifactKeys = new Set(['artifactId', 'digest', 'status']);
const viewKeys = new Set([
  'format',
  'closureEvaluationInstant',
  'revocationRecordDigest',
  'records',
  'viewDigest',
]);
const digestPattern = /^sha256-[a-f0-9]{64}$/u;

const hasOnlyKeys = (
  value: object,
  allowedKeys: ReadonlySet<string>
): boolean => Object.keys(value).every((key) => allowedKeys.has(key));

const normalizedIdentifier = (value: string, label: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (
    !normalized ||
    normalized !== value ||
    normalized.length > 512 ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint < 32 || codePoint === 127;
    })
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
};

const normalizedOptionalIdentifier = (
  value: string | undefined,
  label: string
): string | undefined =>
  value === undefined ? undefined : normalizedIdentifier(value, label);

const normalizedDigest = (value: string, label: string): string => {
  const normalized = normalizedIdentifier(value, label);
  if (!digestPattern.test(normalized)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
};

const normalizedOptionalDigest = (
  value: string | undefined,
  label: string
): string | undefined =>
  value === undefined ? undefined : normalizedDigest(value, label);

const compareAvailability = (
  left: VerificationEvidenceArtifactAvailability,
  right: VerificationEvidenceArtifactAvailability
): number =>
  compareVerificationText(left.artifactId, right.artifactId) ||
  compareVerificationText(left.digest, right.digest) ||
  compareVerificationText(left.status, right.status);

const recordWithoutDigest = (
  input: Omit<VerificationEvidenceVerifiedViewRecord, 'recordDigest'>
): Omit<VerificationEvidenceVerifiedViewRecord, 'recordDigest'> => {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !hasOnlyKeys(input, recordKeys) ||
    !trustValues.has(input.effectiveTrust) ||
    !trustStatuses.has(input.trustStatus) ||
    !retentionStates.has(input.retentionState)
  ) {
    throw new TypeError('Verification Evidence view record is invalid.');
  }
  const evidenceId = normalizedIdentifier(
    input.evidenceId,
    'Verification Evidence view evidence id'
  );
  const manifestDigest = normalizedDigest(
    input.manifestDigest,
    'Verification Evidence view manifest digest'
  );
  const materializedEvidenceDigest = normalizedDigest(
    input.materializedEvidenceDigest,
    'Verification Evidence view materialized evidence digest'
  );
  const attestationDigest = normalizedOptionalDigest(
    input.attestationDigest,
    'Verification Evidence view attestation digest'
  );
  const retentionExpiresAt = input.retentionExpiresAt;
  if (
    retentionExpiresAt !== undefined &&
    parseVerificationInstant(retentionExpiresAt) === undefined
  ) {
    throw new TypeError(
      'Verification Evidence view retention expiry is invalid.'
    );
  }
  const supersededByEvidenceId = normalizedOptionalIdentifier(
    input.supersededByEvidenceId,
    'Verification Evidence view superseding id'
  );
  if (supersededByEvidenceId === evidenceId) {
    throw new TypeError('Verification Evidence cannot supersede itself.');
  }
  const tombstoneDigest = normalizedOptionalDigest(
    input.tombstoneDigest,
    'Verification Evidence view tombstone digest'
  );
  if (
    (input.retentionState === 'active' && tombstoneDigest !== undefined) ||
    (input.retentionState !== 'active' && tombstoneDigest === undefined)
  ) {
    throw new TypeError(
      'Verification Evidence tombstone does not match its retention state.'
    );
  }
  if (
    (input.effectiveTrust === 'remote-attested' ||
      input.effectiveTrust === 'ci-attested') &&
    input.trustStatus === 'verified' &&
    attestationDigest === undefined
  ) {
    throw new TypeError(
      'Attested Verification Evidence requires a verified attestation digest.'
    );
  }
  const revocationRecordDigests = uniqueVerificationText(
    input.revocationRecordDigests.map((digest) =>
      normalizedDigest(digest, 'Verification Evidence view revocation digest')
    )
  );
  if (input.trustStatus === 'revoked' && revocationRecordDigests.length === 0) {
    throw new TypeError(
      'Revoked Verification Evidence requires a revocation record.'
    );
  }
  if (input.trustStatus !== 'revoked' && revocationRecordDigests.length > 0) {
    throw new TypeError(
      'Verification Evidence revocation records require revoked trust status.'
    );
  }
  const artifacts = Object.freeze(
    input.artifacts
      .map((artifact) =>
        (() => {
          if (
            artifact === null ||
            typeof artifact !== 'object' ||
            Array.isArray(artifact) ||
            !hasOnlyKeys(artifact, artifactKeys) ||
            !artifactAvailabilityStatuses.has(artifact.status)
          ) {
            throw new TypeError(
              'Verification Evidence artifact availability is invalid.'
            );
          }
          return Object.freeze({
            artifactId: normalizedIdentifier(
              artifact.artifactId,
              'Verification Evidence artifact availability id'
            ),
            digest: normalizedDigest(
              artifact.digest,
              'Verification Evidence artifact availability digest'
            ),
            status: artifact.status,
          });
        })()
      )
      .sort(compareAvailability)
  );
  if (
    new Set(artifacts.map(({ artifactId }) => artifactId)).size !==
    artifacts.length
  ) {
    throw new TypeError(
      'Verification Evidence artifact availability ids must be unique.'
    );
  }
  return Object.freeze({
    evidenceId,
    manifestDigest,
    materializedEvidenceDigest,
    effectiveTrust: input.effectiveTrust,
    trustStatus: input.trustStatus,
    ...(attestationDigest ? { attestationDigest } : {}),
    retentionState: input.retentionState,
    ...(retentionExpiresAt ? { retentionExpiresAt } : {}),
    ...(supersededByEvidenceId ? { supersededByEvidenceId } : {}),
    revocationRecordDigests,
    ...(tombstoneDigest ? { tombstoneDigest } : {}),
    artifacts,
  });
};

const normalizeRecord = (
  input: Omit<VerificationEvidenceVerifiedViewRecord, 'recordDigest'>
): VerificationEvidenceVerifiedViewRecord => {
  const normalized = recordWithoutDigest(input);
  return Object.freeze({
    ...normalized,
    recordDigest: digestVerificationValue(normalized),
  });
};

const compareRecord = (
  left: VerificationEvidenceVerifiedViewRecord,
  right: VerificationEvidenceVerifiedViewRecord
): number => compareVerificationText(left.evidenceId, right.evidenceId);

const createView = (
  input: CreateVerificationEvidenceVerifiedViewInput
): VerificationEvidenceVerifiedView => {
  if (input.records.length > MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS) {
    throw new TypeError(
      `Verification Evidence view cannot contain more than ${MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS} records.`
    );
  }
  if (parseVerificationInstant(input.closureEvaluationInstant) === undefined) {
    throw new TypeError(
      'Verification Evidence view requires an explicit UTC evaluation instant.'
    );
  }
  const revocationRecordDigest = normalizedDigest(
    input.revocationRecordDigest,
    'Verification Evidence view revocation record digest'
  );
  const records = Object.freeze(
    input.records.map(normalizeRecord).sort(compareRecord)
  );
  if (
    new Set(records.map(({ evidenceId }) => evidenceId)).size !== records.length
  ) {
    throw new TypeError('Verification Evidence view ids must be unique.');
  }
  const byId = new Map(records.map((record) => [record.evidenceId, record]));
  for (const record of records) {
    if (
      record.supersededByEvidenceId &&
      !byId.has(record.supersededByEvidenceId)
    ) {
      throw new TypeError(
        'Verification Evidence supersession target is absent from the view.'
      );
    }
    const visited = new Set<string>();
    let cursor: VerificationEvidenceVerifiedViewRecord | undefined = record;
    while (cursor?.supersededByEvidenceId) {
      if (visited.has(cursor.evidenceId)) {
        throw new TypeError(
          'Verification Evidence supersession contains a cycle.'
        );
      }
      visited.add(cursor.evidenceId);
      cursor = byId.get(cursor.supersededByEvidenceId);
    }
  }
  const viewWithoutDigest = Object.freeze({
    format: VERIFICATION_EVIDENCE_VERIFIED_VIEW_FORMAT,
    closureEvaluationInstant: input.closureEvaluationInstant,
    records,
    revocationRecordDigest,
  });
  return Object.freeze({
    ...viewWithoutDigest,
    viewDigest: digestVerificationValue(viewWithoutDigest),
  });
};

export const createVerificationEvidenceVerifiedView = (
  input: CreateVerificationEvidenceVerifiedViewInput
): VerificationEvidenceVerifiedView => createView(input);

export const validateVerificationEvidenceVerifiedView = (
  input: VerificationEvidenceVerifiedView
): VerificationEvidenceVerifiedViewResult => {
  try {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !hasOnlyKeys(input, viewKeys) ||
      input.format !== VERIFICATION_EVIDENCE_VERIFIED_VIEW_FORMAT
    ) {
      throw new TypeError('Verification Evidence view format is unsupported.');
    }
    for (const record of input.records) {
      const { recordDigest, ...withoutDigest } = record;
      if (normalizeRecord(withoutDigest).recordDigest !== recordDigest) {
        throw new TypeError(
          'Verification Evidence view record digest does not match.'
        );
      }
    }
    const normalized = createView({
      closureEvaluationInstant: input.closureEvaluationInstant,
      revocationRecordDigest: input.revocationRecordDigest,
      records: input.records.map(({ recordDigest: _recordDigest, ...record }) =>
        Object.freeze(record)
      ),
    });
    if (
      normalized.revocationRecordDigest !== input.revocationRecordDigest ||
      normalized.viewDigest !== input.viewDigest
    ) {
      throw new TypeError('Verification Evidence view digest does not match.');
    }
    return Object.freeze({ status: 'ready', view: normalized });
  } catch (error) {
    return Object.freeze({
      status: 'invalid',
      message:
        error instanceof Error
          ? error.message
          : 'Verification Evidence view is invalid.',
    });
  }
};

export const validateVerificationEvidenceSupersessions = (
  evidence: readonly VerificationEvidence[],
  view: VerificationEvidenceVerifiedView
): string | undefined => {
  const evidenceById = new Map(
    evidence.map((candidate) => [candidate.id, candidate] as const)
  );
  const viewById = new Map(
    view.records.map((record) => [record.evidenceId, record] as const)
  );
  for (const record of view.records) {
    if (!record.supersededByEvidenceId) continue;
    const previous = evidenceById.get(record.evidenceId);
    const next = evidenceById.get(record.supersededByEvidenceId);
    const nextView = viewById.get(record.supersededByEvidenceId);
    if (
      !previous ||
      !next ||
      !nextView ||
      nextView.retentionState !== 'active' ||
      !hasSameVerificationEvidenceSupersessionLineage(previous, next) ||
      previous.attemptId === next.attemptId
    ) {
      return 'Verification Evidence supersession lineage is invalid.';
    }
    const previousCompletedAt = parseVerificationInstant(
      previous.timing.completedAt
    );
    const nextCompletedAt = parseVerificationInstant(next.timing.completedAt);
    if (
      previousCompletedAt === undefined ||
      nextCompletedAt === undefined ||
      nextCompletedAt < previousCompletedAt
    ) {
      return 'Verification Evidence supersession time is invalid.';
    }
  }
  return undefined;
};

export const assessVerificationEvidenceAcceptance = (
  evidence: VerificationEvidence,
  record: VerificationEvidenceVerifiedViewRecord,
  closureEvaluationInstant: string
): VerificationEvidenceAcceptance => {
  const instant = parseVerificationInstant(closureEvaluationInstant);
  if (
    instant === undefined ||
    record.evidenceId !== evidence.id ||
    record.manifestDigest !== evidence.manifestDigest ||
    record.materializedEvidenceDigest !== digestVerificationValue(evidence) ||
    trustRank[record.effectiveTrust] > trustRank[evidence.provenance.trust]
  ) {
    return Object.freeze({
      status: 'invalid',
      message: 'Verification Evidence view identity does not match.',
    });
  }
  if (record.retentionState !== 'active') {
    return Object.freeze({
      status: 'tombstoned',
      message: 'Verification Evidence has been tombstoned.',
    });
  }
  if (record.supersededByEvidenceId) {
    return Object.freeze({
      status: 'superseded',
      message: 'Verification Evidence was explicitly superseded.',
    });
  }
  const retentionExpiresAt = record.retentionExpiresAt
    ? parseVerificationInstant(record.retentionExpiresAt)
    : undefined;
  if (
    record.trustStatus === 'expired' ||
    (record.retentionExpiresAt !== undefined &&
      (retentionExpiresAt === undefined || instant >= retentionExpiresAt))
  ) {
    return Object.freeze({
      status: 'expired',
      message: 'Verification Evidence retention or trust has expired.',
    });
  }
  if (
    record.trustStatus === 'revoked' ||
    record.revocationRecordDigests.length > 0
  ) {
    return Object.freeze({
      status: 'revoked',
      message: 'Verification Evidence trust has been revoked.',
    });
  }
  if (record.trustStatus !== 'verified') {
    return Object.freeze({
      status: 'unverified',
      message: 'Verification Evidence trust has not been verified.',
    });
  }
  if (record.attestationDigest !== evidence.provenance.attestationDigest) {
    return Object.freeze({
      status: 'invalid',
      message: 'Verification Evidence attestation identity does not match.',
    });
  }
  const availabilityById = new Map(
    record.artifacts.map((artifact) => [artifact.artifactId, artifact] as const)
  );
  if (
    availabilityById.size !== evidence.artifacts.length ||
    evidence.artifacts.some((artifact) => {
      const availability = availabilityById.get(artifact.id);
      return (
        !availability ||
        availability.digest !== artifact.digest ||
        availability.status !== 'available'
      );
    })
  ) {
    return Object.freeze({
      status: 'artifact-unavailable',
      message: 'Verification Evidence artifact availability is incomplete.',
    });
  }
  return Object.freeze({
    status: 'acceptable',
    effectiveTrust: record.effectiveTrust,
  });
};
