import type { VerificationEvidenceCandidate } from './verification.types';

export const VERIFICATION_EVIDENCE_SUPERSESSION_LINEAGE_FIELDS = Object.freeze([
  'workspaceId',
  'checkId',
  'checkKind',
  'targetId',
] as const);

export type VerificationEvidenceSupersessionLineage = Readonly<
  Pick<
    VerificationEvidenceCandidate,
    (typeof VERIFICATION_EVIDENCE_SUPERSESSION_LINEAGE_FIELDS)[number]
  >
>;

export const hasSameVerificationEvidenceSupersessionLineage = (
  previous: VerificationEvidenceSupersessionLineage,
  next: VerificationEvidenceSupersessionLineage
): boolean =>
  previous.workspaceId === next.workspaceId &&
  previous.checkId === next.checkId &&
  previous.checkKind === next.checkKind &&
  previous.targetId === next.targetId;
