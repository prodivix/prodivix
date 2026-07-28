export {
  COMPARISON_MISMATCH_FIELDS,
  isVerificationEvidenceComparisonMismatchField,
} from './verificationEvidenceCodec.shared';
export type {
  VerificationEvidenceArtifactAvailability,
  VerificationEvidenceArtifactDescriptor,
  VerificationEvidenceArtifactKind,
  VerificationEvidenceAttemptOutcome,
  VerificationEvidenceVerifiedView,
  VerificationEvidenceComparison,
  VerificationEvidenceComparisonMismatchField,
  VerificationEvidencePage,
  VerificationEvidencePartitionRevisions,
  VerificationEvidenceRetentionClass,
  VerificationEvidenceRetentionProtection,
  VerificationEvidenceRetentionState,
  VerificationEvidenceTransportRecord,
  VerificationEvidenceTrust,
  VerificationEvidenceTrustStatus,
  VerificationEvidenceVerifiedViewRecord,
} from './verificationEvidenceCodec.shared';
export {
  decodeVerificationEvidenceDetail,
  decodeVerificationEvidencePage,
} from './verificationEvidenceRecordCodec';
export {
  decodeVerificationEvidenceVerifiedView,
  decodeVerificationEvidenceComparison,
} from './verificationEvidenceLifecycleCodec';
