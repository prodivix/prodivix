export {
  VERIFICATION_EVIDENCE_CANDIDATE_WIRE_VERSION,
  VERIFICATION_EVIDENCE_CODEC_LIMITS,
  type VerificationEvidenceCandidateWire,
} from './verificationEvidenceCodec.primitives';
export {
  decodeVerificationEvidenceCandidate,
  encodeVerificationEvidenceCandidate,
  normalizeVerificationEvidenceCandidate,
  validateVerificationEvidenceCandidate,
} from './verificationEvidenceCandidateCodec';
export { verificationEvidenceCandidateWireSchema } from './verificationEvidenceCandidateSchema';
export {
  decodeVerificationEvidenceManifest,
  encodeVerificationEvidenceManifest,
  VERIFICATION_EVIDENCE_MANIFEST_WIRE_VERSION,
  verificationEvidenceManifestWireSchema,
  type VerificationEvidenceManifestWire,
} from './verificationEvidenceManifestCodec';
export {
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceVerifiedView,
  VERIFICATION_EVIDENCE_VERIFIED_VIEW_WIRE_VERSION,
  verificationEvidenceVerifiedViewWireSchema,
  type VerificationEvidenceVerifiedViewWire,
} from './verificationEvidenceVerifiedViewCodec';
export type {
  VerificationEvidenceWireDecodeResult,
  VerificationEvidenceWireIssue,
} from './verificationEvidenceWireCodec.shared';
