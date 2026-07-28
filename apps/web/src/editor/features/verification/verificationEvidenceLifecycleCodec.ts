import { digestVerificationValue } from '@prodivix/verification';
import {
  ARTIFACT_AVAILABILITIES,
  COMPARISON_COMPATIBILITIES,
  COMPARISON_MISMATCH_FIELDS,
  MAX_ARTIFACTS,
  MAX_VERIFIED_VIEW_RECORDS,
  RETENTION_STATES,
  TRUST_CLASSES,
  TRUST_STATUSES,
  digestArrayAt,
  digestAt,
  enumAt,
  exactKeys,
  fail,
  identifierAt,
  instantAt,
  recordAt,
} from './verificationEvidenceCodec.shared';
import type {
  VerificationEvidenceVerifiedView,
  VerificationEvidenceComparison,
  VerificationEvidenceVerifiedViewRecord,
} from './verificationEvidenceCodec.shared';

export const decodeVerificationEvidenceVerifiedViewRecordAt = (
  value: unknown,
  path: string
): VerificationEvidenceVerifiedViewRecord => {
  const record = recordAt(value, path);
  exactKeys(
    record,
    path,
    [
      'evidenceId',
      'manifestDigest',
      'materializedEvidenceDigest',
      'effectiveTrust',
      'trustStatus',
      'retentionState',
      'revocationRecordDigests',
      'artifacts',
      'recordDigest',
    ],
    [
      'attestationDigest',
      'retentionExpiresAt',
      'supersededByEvidenceId',
      'tombstoneDigest',
    ]
  );
  if (
    !Array.isArray(record.artifacts) ||
    record.artifacts.length > MAX_ARTIFACTS
  ) {
    fail(`${path}/artifacts`, 'expected a bounded artifact array');
  }
  const artifacts = Object.freeze(
    (record.artifacts as unknown[]).map((candidate, index) => {
      const artifactPath = `${path}/artifacts/${index}`;
      const artifact = recordAt(candidate, artifactPath);
      exactKeys(artifact, artifactPath, ['artifactId', 'digest', 'status']);
      return Object.freeze({
        artifactId: identifierAt(
          artifact.artifactId,
          `${artifactPath}/artifactId`
        ),
        digest: digestAt(artifact.digest, `${artifactPath}/digest`),
        status: enumAt(
          artifact.status,
          `${artifactPath}/status`,
          ARTIFACT_AVAILABILITIES
        ),
      });
    })
  );
  if (
    new Set(artifacts.map(({ artifactId }) => artifactId)).size !==
    artifacts.length
  ) {
    fail(`${path}/artifacts`, 'artifact ids must be unique');
  }
  const decoded = Object.freeze({
    evidenceId: identifierAt(record.evidenceId, `${path}/evidenceId`),
    manifestDigest: digestAt(record.manifestDigest, `${path}/manifestDigest`),
    materializedEvidenceDigest: digestAt(
      record.materializedEvidenceDigest,
      `${path}/materializedEvidenceDigest`
    ),
    effectiveTrust: enumAt(
      record.effectiveTrust,
      `${path}/effectiveTrust`,
      TRUST_CLASSES
    ),
    trustStatus: enumAt(
      record.trustStatus,
      `${path}/trustStatus`,
      TRUST_STATUSES
    ),
    ...(Object.hasOwn(record, 'attestationDigest')
      ? {
          attestationDigest: digestAt(
            record.attestationDigest,
            `${path}/attestationDigest`
          ),
        }
      : {}),
    retentionState: enumAt(
      record.retentionState,
      `${path}/retentionState`,
      RETENTION_STATES
    ),
    ...(Object.hasOwn(record, 'retentionExpiresAt')
      ? {
          retentionExpiresAt: instantAt(
            record.retentionExpiresAt,
            `${path}/retentionExpiresAt`
          ),
        }
      : {}),
    ...(Object.hasOwn(record, 'supersededByEvidenceId')
      ? {
          supersededByEvidenceId: identifierAt(
            record.supersededByEvidenceId,
            `${path}/supersededByEvidenceId`
          ),
        }
      : {}),
    revocationRecordDigests: digestArrayAt(
      record.revocationRecordDigests,
      `${path}/revocationRecordDigests`,
      128
    ),
    ...(Object.hasOwn(record, 'tombstoneDigest')
      ? {
          tombstoneDigest: digestAt(
            record.tombstoneDigest,
            `${path}/tombstoneDigest`
          ),
        }
      : {}),
    artifacts,
    recordDigest: digestAt(record.recordDigest, `${path}/recordDigest`),
  });
  const { recordDigest, ...withoutDigest } = decoded;
  if (
    recordDigest !== digestVerificationValue(withoutDigest) ||
    (decoded.retentionState === 'active') ===
      Boolean(decoded.tombstoneDigest) ||
    (decoded.trustStatus === 'revoked') !==
      decoded.revocationRecordDigests.length > 0 ||
    ((decoded.effectiveTrust === 'remote-attested' ||
      decoded.effectiveTrust === 'ci-attested') &&
      decoded.trustStatus === 'verified' &&
      !decoded.attestationDigest)
  ) {
    fail(path, 'verified Evidence view invariants do not match');
  }
  return decoded;
};

const verifiedViewRecordsAt = (
  value: unknown,
  path: string
): readonly VerificationEvidenceVerifiedViewRecord[] => {
  if (!Array.isArray(value) || value.length > MAX_VERIFIED_VIEW_RECORDS) {
    fail(path, 'expected a bounded verified Evidence record array');
  }
  const records = (value as unknown[]).map((candidate, index) =>
    decodeVerificationEvidenceVerifiedViewRecordAt(
      candidate,
      `${path}/${index}`
    )
  );
  if (
    new Set(records.map(({ evidenceId }) => evidenceId)).size !== records.length
  ) {
    fail(path, 'Evidence ids must be unique');
  }
  return Object.freeze(records);
};

export const decodeVerificationEvidenceVerifiedView = (
  value: unknown
): VerificationEvidenceVerifiedView => {
  const envelope = recordAt(value, '/');
  exactKeys(envelope, '/', ['verifiedEvidenceView']);
  const path = '/verifiedEvidenceView';
  const record = recordAt(envelope.verifiedEvidenceView, path);
  exactKeys(record, path, [
    'format',
    'closureEvaluationInstant',
    'records',
    'revocationRecordDigest',
    'viewDigest',
  ]);
  if (record.format !== 'prodivix.verification-evidence-view.v1') {
    fail(`${path}/format`, 'unsupported Evidence view format');
  }
  const decoded = Object.freeze({
    format: 'prodivix.verification-evidence-view.v1',
    closureEvaluationInstant: instantAt(
      record.closureEvaluationInstant,
      `${path}/closureEvaluationInstant`
    ),
    records: verifiedViewRecordsAt(record.records, `${path}/records`),
    revocationRecordDigest: digestAt(
      record.revocationRecordDigest,
      `${path}/revocationRecordDigest`
    ),
    viewDigest: digestAt(record.viewDigest, `${path}/viewDigest`),
  });
  const { viewDigest, ...withoutDigest } = decoded;
  if (viewDigest !== digestVerificationValue(withoutDigest)) {
    fail(`${path}/viewDigest`, 'does not match the verified view');
  }
  return decoded;
};

export const decodeVerificationEvidenceComparison = (
  value: unknown
): VerificationEvidenceComparison => {
  const envelope = recordAt(value, '/');
  exactKeys(envelope, '/', ['comparison']);
  const record = recordAt(envelope.comparison, '/comparison');
  exactKeys(
    record,
    '/comparison',
    [
      'compatibility',
      'leftEvidenceId',
      'rightEvidenceId',
      'mismatchFields',
      'comparisonDigest',
    ],
    ['policyId', 'policyDigest']
  );
  if (
    !Array.isArray(record.mismatchFields) ||
    record.mismatchFields.length > COMPARISON_MISMATCH_FIELDS.length
  ) {
    fail('/comparison/mismatchFields', 'expected a bounded mismatch array');
  }
  const mismatchFields = Object.freeze(
    (record.mismatchFields as unknown[]).map((field, index) =>
      enumAt(
        field,
        `/comparison/mismatchFields/${index}`,
        COMPARISON_MISMATCH_FIELDS
      )
    )
  );
  if (
    new Set(mismatchFields).size !== mismatchFields.length ||
    mismatchFields.some(
      (field, index) => index > 0 && mismatchFields[index - 1]! >= field
    )
  ) {
    fail(
      '/comparison/mismatchFields',
      'expected unique canonically ordered mismatch fields'
    );
  }
  const compatibility = enumAt(
    record.compatibility,
    '/comparison/compatibility',
    COMPARISON_COMPATIBILITIES
  );
  const hasPolicyId = Object.hasOwn(record, 'policyId');
  const hasPolicyDigest = Object.hasOwn(record, 'policyDigest');
  if (
    hasPolicyId !== hasPolicyDigest ||
    (compatibility === 'exact-compatible') !== (mismatchFields.length === 0) ||
    (compatibility === 'policy-compatible' && !hasPolicyId)
  ) {
    fail('/comparison', 'comparison compatibility is internally inconsistent');
  }
  return Object.freeze({
    compatibility,
    leftEvidenceId: identifierAt(
      record.leftEvidenceId,
      '/comparison/leftEvidenceId'
    ),
    rightEvidenceId: identifierAt(
      record.rightEvidenceId,
      '/comparison/rightEvidenceId'
    ),
    mismatchFields,
    ...(hasPolicyId
      ? {
          policyId: identifierAt(record.policyId, '/comparison/policyId'),
          policyDigest: digestAt(
            record.policyDigest,
            '/comparison/policyDigest'
          ),
        }
      : {}),
    comparisonDigest: digestAt(
      record.comparisonDigest,
      '/comparison/comparisonDigest'
    ),
  });
};
