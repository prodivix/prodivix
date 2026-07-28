import { verificationEvidenceCandidateWireSchema } from './verificationEvidenceCandidateSchema';
import {
  VERIFICATION_EVIDENCE_VERIFIED_VIEW_FORMAT,
  validateVerificationEvidenceVerifiedView,
} from './verificationRetention';
import { MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS } from './verificationPlannerGraph';
import type { VerificationEvidenceVerifiedView } from './verification.types';
import {
  cloneCanonicalVerificationEvidenceWire,
  compileVerificationEvidenceWireSchema,
  verificationEvidenceWireSchemaFailure,
  type VerificationEvidenceWireDecodeResult,
} from './verificationEvidenceWireCodec.shared';

export const VERIFICATION_EVIDENCE_VERIFIED_VIEW_WIRE_VERSION = 1 as const;

export type VerificationEvidenceVerifiedViewWire =
  VerificationEvidenceVerifiedView &
    Readonly<{
      wireVersion: typeof VERIFICATION_EVIDENCE_VERIFIED_VIEW_WIRE_VERSION;
    }>;

const VIEW_REQUIRED_KEYS = Object.freeze([
  'wireVersion',
  'format',
  'closureEvaluationInstant',
  'revocationRecordDigest',
  'records',
  'viewDigest',
] as const);

const RECORD_REQUIRED_KEYS = Object.freeze([
  'evidenceId',
  'manifestDigest',
  'materializedEvidenceDigest',
  'effectiveTrust',
  'trustStatus',
  'retentionState',
  'revocationRecordDigests',
  'artifacts',
  'recordDigest',
] as const);

/** Immutable v1 schema for the Backend-produced Closure acceptance view. */
export const verificationEvidenceVerifiedViewWireSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://prodivix.dev/schemas/verification/evidence-view/v1.json',
  title: 'Prodivix VerificationEvidenceVerifiedView wire document',
  type: 'object',
  required: VIEW_REQUIRED_KEYS,
  properties: {
    wireVersion: {
      const: VERIFICATION_EVIDENCE_VERIFIED_VIEW_WIRE_VERSION,
    },
    format: { const: VERIFICATION_EVIDENCE_VERIFIED_VIEW_FORMAT },
    closureEvaluationInstant: { $ref: '#/$defs/instant' },
    revocationRecordDigest: { $ref: '#/$defs/digest' },
    records: {
      type: 'array',
      maxItems: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS,
      items: { $ref: '#/$defs/record' },
    },
    viewDigest: { $ref: '#/$defs/digest' },
  },
  additionalProperties: false,
  $defs: {
    canonicalId: verificationEvidenceCandidateWireSchema.$defs.canonicalId,
    digest: verificationEvidenceCandidateWireSchema.$defs.digest,
    instant: verificationEvidenceCandidateWireSchema.$defs.instant,
    serverId: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$',
    },
    artifactAvailability: {
      type: 'object',
      required: ['artifactId', 'digest', 'status'],
      properties: {
        artifactId: { $ref: '#/$defs/canonicalId' },
        digest: { $ref: '#/$defs/digest' },
        status: { enum: ['available', 'missing', 'deleted'] },
      },
      additionalProperties: false,
    },
    record: {
      type: 'object',
      required: RECORD_REQUIRED_KEYS,
      properties: {
        evidenceId: { $ref: '#/$defs/serverId' },
        manifestDigest: { $ref: '#/$defs/digest' },
        materializedEvidenceDigest: { $ref: '#/$defs/digest' },
        effectiveTrust: {
          enum: [
            'local-unattested',
            'remote-attested',
            'ci-attested',
            'imported-untrusted',
          ],
        },
        trustStatus: {
          enum: ['verified', 'unverified', 'revoked', 'expired'],
        },
        attestationDigest: { $ref: '#/$defs/digest' },
        retentionState: {
          enum: ['active', 'tombstoned', 'references-released'],
        },
        retentionExpiresAt: { $ref: '#/$defs/instant' },
        supersededByEvidenceId: { $ref: '#/$defs/serverId' },
        revocationRecordDigests: {
          type: 'array',
          maxItems: 10_000,
          uniqueItems: true,
          items: { $ref: '#/$defs/digest' },
        },
        tombstoneDigest: { $ref: '#/$defs/digest' },
        artifacts: {
          type: 'array',
          maxItems: 128,
          items: { $ref: '#/$defs/artifactAvailability' },
        },
        recordDigest: { $ref: '#/$defs/digest' },
      },
      additionalProperties: false,
    },
  },
} as const;

const validateWire = compileVerificationEvidenceWireSchema(
  verificationEvidenceVerifiedViewWireSchema
);

export const decodeVerificationEvidenceVerifiedView = (
  value: unknown
): VerificationEvidenceWireDecodeResult<VerificationEvidenceVerifiedView> => {
  const cloned = cloneCanonicalVerificationEvidenceWire(value);
  if (!cloned.ok) return cloned;
  if (!validateWire(cloned.value)) {
    return verificationEvidenceWireSchemaFailure(validateWire.errors);
  }
  const { wireVersion: _wireVersion, ...current } = cloned.value;
  const validation = validateVerificationEvidenceVerifiedView(
    current as VerificationEvidenceVerifiedView
  );
  return validation.status === 'ready'
    ? Object.freeze({ ok: true, value: validation.view })
    : Object.freeze({
        ok: false,
        issues: Object.freeze([
          Object.freeze({
            code: 'VER-5001' as const,
            path: '/',
            message: validation.message,
          }),
        ]),
      });
};

export const encodeVerificationEvidenceVerifiedView = (
  value: VerificationEvidenceVerifiedView
): VerificationEvidenceVerifiedViewWire => {
  const validation = validateVerificationEvidenceVerifiedView(value);
  if (validation.status !== 'ready') throw new TypeError(validation.message);
  const wire = {
    ...validation.view,
    wireVersion: VERIFICATION_EVIDENCE_VERIFIED_VIEW_WIRE_VERSION,
  } as VerificationEvidenceVerifiedViewWire;
  const decoded = decodeVerificationEvidenceVerifiedView(wire);
  if (!decoded.ok) {
    throw new TypeError(
      decoded.issues.map(({ message }) => message).join('; ')
    );
  }
  return Object.freeze(wire);
};
