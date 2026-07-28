import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { VerificationVerifiedClaims } from './verificationAttestation';
import { parseVerificationInstant } from './verificationCanonical';
import {
  validateVerificationEvidenceManifest,
  type VerificationEvidenceManifest,
} from './verificationEvidenceManifest';
import type { VerificationArtifactManifest } from './verification.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$/u;

export type VerificationEvidencePromotionState =
  'acquired' | 'checkpointed' | 'completed' | 'failed';

export type VerificationEvidencePromotionCheckpoint = Readonly<{
  artifacts: readonly VerificationArtifactManifest[];
  statementDigest: string;
  verifiedClaims?: VerificationVerifiedClaims;
}>;

export type VerificationEvidencePromotionRecord = Readonly<{
  promotionId: string;
  idempotencyKey: string;
  candidateId: string;
  candidateDigest: string;
  promotionIntentDigest: string;
  workspaceId: string;
  planDigest: string;
  cellId: string;
  attemptId: string;
  evidenceId: string;
  createdAt: string;
  deadline: string;
  state: VerificationEvidencePromotionState;
  version: number;
  checkpoint?: VerificationEvidencePromotionCheckpoint;
  manifestDigest?: string;
  failureCode?: 'VER-5001' | 'VER-5002' | 'VER-5003' | 'VER-5005';
}>;

export type VerificationEvidencePromotionAcquireInput = Readonly<{
  idempotencyKey: string;
  candidateId: string;
  candidateDigest: string;
  promotionIntentDigest: string;
  workspaceId: string;
  planDigest: string;
  cellId: string;
  attemptId: string;
  deadline: string;
}>;

export type VerificationEvidencePromotionAcquireResult =
  | Readonly<{
      status: 'acquired' | 'resumed';
      promotion: VerificationEvidencePromotionRecord;
    }>
  | Readonly<{
      status: 'completed';
      promotion: VerificationEvidencePromotionRecord;
      evidence: VerificationEvidenceManifest;
    }>
  | Readonly<{
      status: 'conflict';
      reasonCode: 'VER-5001';
      message: string;
    }>;

export type VerificationEvidencePromotionMutationResult =
  | Readonly<{
      status: 'updated';
      promotion: VerificationEvidencePromotionRecord;
    }>
  | Readonly<{
      status: 'completed';
      promotion: VerificationEvidencePromotionRecord;
      evidence: VerificationEvidenceManifest;
    }>
  | Readonly<{
      status: 'conflict';
      reasonCode: 'VER-5001' | 'VER-5003';
      message: string;
    }>;

export type VerificationEvidenceRepository = Readonly<{
  acquirePromotion(
    input: VerificationEvidencePromotionAcquireInput
  ): Promise<VerificationEvidencePromotionAcquireResult>;
  checkpointPromotion(input: {
    promotionId: string;
    expectedVersion: number;
    checkpoint: VerificationEvidencePromotionCheckpoint;
  }): Promise<VerificationEvidencePromotionMutationResult>;
  finalizePromotion(input: {
    promotionId: string;
    expectedVersion: number;
    manifest: VerificationEvidenceManifest;
  }): Promise<VerificationEvidencePromotionMutationResult>;
  failPromotion(input: {
    promotionId: string;
    expectedVersion: number;
    failureCode: 'VER-5001' | 'VER-5002' | 'VER-5003' | 'VER-5005';
  }): Promise<VerificationEvidencePromotionMutationResult>;
  getEvidence(
    evidenceId: string
  ): Promise<VerificationEvidenceManifest | undefined>;
  listEvidence(input: {
    workspaceId: string;
    planDigest?: string;
    cellId?: string;
  }): Promise<readonly VerificationEvidenceManifest[]>;
  getPromotion(
    promotionId: string
  ): Promise<VerificationEvidencePromotionRecord | undefined>;
  getArtifactReferenceCount(digest: string): Promise<number>;
}>;

export type CreateInMemoryVerificationEvidenceRepositoryOptions = Readonly<{
  now(): string;
  allocatePromotionId(input: VerificationEvidencePromotionAcquireInput): string;
  allocateEvidenceId(input: VerificationEvidencePromotionAcquireInput): string;
}>;

const conflict = (
  message: string,
  reasonCode: 'VER-5001' | 'VER-5003' = 'VER-5001'
): VerificationEvidencePromotionMutationResult =>
  Object.freeze({ status: 'conflict', reasonCode, message });

const acquireConflict = (
  message: string
): VerificationEvidencePromotionAcquireResult =>
  Object.freeze({ status: 'conflict', reasonCode: 'VER-5001', message });

const canonicalArtifacts = (
  artifacts: readonly VerificationArtifactManifest[]
): readonly VerificationArtifactManifest[] =>
  Object.freeze(
    [...artifacts]
      .map((artifact) => Object.freeze({ ...artifact }))
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.id, right.id) ||
          compareUnicodeCodePoints(left.digest, right.digest)
      )
  );

const checkpoint = (
  value: VerificationEvidencePromotionCheckpoint
): VerificationEvidencePromotionCheckpoint =>
  Object.freeze({
    artifacts: canonicalArtifacts(value.artifacts),
    statementDigest: value.statementDigest,
    ...(value.verifiedClaims
      ? { verifiedClaims: Object.freeze({ ...value.verifiedClaims }) }
      : {}),
  });

const record = (
  value: VerificationEvidencePromotionRecord
): VerificationEvidencePromotionRecord =>
  Object.freeze({
    ...value,
    ...(value.checkpoint ? { checkpoint: checkpoint(value.checkpoint) } : {}),
  });

const validAcquireInput = (
  input: VerificationEvidencePromotionAcquireInput
): boolean =>
  ID_PATTERN.test(input.idempotencyKey) &&
  ID_PATTERN.test(input.candidateId) &&
  DIGEST_PATTERN.test(input.candidateDigest) &&
  DIGEST_PATTERN.test(input.promotionIntentDigest) &&
  ID_PATTERN.test(input.workspaceId) &&
  DIGEST_PATTERN.test(input.planDigest) &&
  ID_PATTERN.test(input.cellId) &&
  ID_PATTERN.test(input.attemptId) &&
  parseVerificationInstant(input.deadline) !== undefined;

const samePromotionIdentity = (
  left: VerificationEvidencePromotionRecord,
  right: VerificationEvidencePromotionAcquireInput
): boolean =>
  left.idempotencyKey === right.idempotencyKey &&
  left.candidateId === right.candidateId &&
  left.candidateDigest === right.candidateDigest &&
  left.promotionIntentDigest === right.promotionIntentDigest &&
  left.workspaceId === right.workspaceId &&
  left.planDigest === right.planDigest &&
  left.cellId === right.cellId &&
  left.attemptId === right.attemptId &&
  left.deadline === right.deadline;

const attemptKey = (input: {
  workspaceId: string;
  planDigest: string;
  cellId: string;
  attemptId: string;
}): string =>
  `${input.workspaceId}\0${input.planDigest}\0${input.cellId}\0${input.attemptId}`;

const candidateKey = (input: {
  workspaceId: string;
  candidateId: string;
}): string => `${input.workspaceId}\0${input.candidateId}`;

/**
 * Atomic in-memory reference adapter. Durable implementations must pass the
 * same conflict, replay, append-only, and finalize conformance.
 */
export const createInMemoryVerificationEvidenceRepository = (
  options: CreateInMemoryVerificationEvidenceRepositoryOptions
): VerificationEvidenceRepository => {
  const promotions = new Map<string, VerificationEvidencePromotionRecord>();
  const promotionByIdempotencyKey = new Map<string, string>();
  const promotionByCandidateKey = new Map<string, string>();
  const evidence = new Map<string, VerificationEvidenceManifest>();
  const evidenceByAttempt = new Map<string, string>();
  const replayKeys = new Map<string, string>();
  const artifactReferenceCounts = new Map<string, number>();

  const completed = (
    promotion: VerificationEvidencePromotionRecord
  ): VerificationEvidencePromotionMutationResult | undefined => {
    if (promotion.state !== 'completed' || !promotion.manifestDigest) {
      return undefined;
    }
    const manifest = evidence.get(promotion.evidenceId);
    return manifest
      ? Object.freeze({
          status: 'completed',
          promotion,
          evidence: manifest,
        })
      : conflict('Completed promotion references missing Evidence.');
  };

  return Object.freeze({
    async acquirePromotion(input) {
      if (!validAcquireInput(input)) {
        return acquireConflict('Promotion identity is invalid.');
      }
      const existingId = promotionByIdempotencyKey.get(input.idempotencyKey);
      if (existingId) {
        const existing = promotions.get(existingId)!;
        if (!samePromotionIdentity(existing, input)) {
          return acquireConflict(
            'The idempotency key is already bound to another candidate.'
          );
        }
        if (existing.state === 'completed' && existing.manifestDigest) {
          const manifest = evidence.get(existing.evidenceId);
          if (!manifest) {
            return acquireConflict(
              'Completed promotion references missing Evidence.'
            );
          }
          return Object.freeze({
            status: 'completed',
            promotion: existing,
            evidence: manifest,
          });
        }
        return Object.freeze({ status: 'resumed', promotion: existing });
      }
      if (promotionByCandidateKey.has(candidateKey(input))) {
        return acquireConflict(
          'The candidate id is already bound to another promotion identity.'
        );
      }
      const now = options.now();
      const promotionId = options.allocatePromotionId(input);
      const evidenceId = options.allocateEvidenceId(input);
      if (
        parseVerificationInstant(now) === undefined ||
        !ID_PATTERN.test(promotionId) ||
        !ID_PATTERN.test(evidenceId) ||
        promotions.has(promotionId) ||
        evidence.has(evidenceId)
      ) {
        return acquireConflict('Allocated promotion identity is invalid.');
      }
      if (
        parseVerificationInstant(input.deadline)! <=
        parseVerificationInstant(now)!
      ) {
        return acquireConflict('Promotion deadline has expired.');
      }
      const promotion = record({
        promotionId,
        idempotencyKey: input.idempotencyKey,
        candidateId: input.candidateId,
        candidateDigest: input.candidateDigest,
        promotionIntentDigest: input.promotionIntentDigest,
        workspaceId: input.workspaceId,
        planDigest: input.planDigest,
        cellId: input.cellId,
        attemptId: input.attemptId,
        evidenceId,
        createdAt: now,
        deadline: input.deadline,
        state: 'acquired',
        version: 1,
      });
      promotions.set(promotionId, promotion);
      promotionByIdempotencyKey.set(input.idempotencyKey, promotionId);
      promotionByCandidateKey.set(candidateKey(input), promotionId);
      return Object.freeze({ status: 'acquired', promotion });
    },

    async checkpointPromotion(input) {
      const current = promotions.get(input.promotionId);
      if (!current) return conflict('Promotion does not exist.');
      const alreadyCompleted = completed(current);
      if (alreadyCompleted) return alreadyCompleted;
      if (current.version !== input.expectedVersion) {
        return conflict('Promotion version drifted.');
      }
      const checkpointInstant = parseVerificationInstant(options.now());
      if (
        checkpointInstant === undefined ||
        checkpointInstant > parseVerificationInstant(current.deadline)!
      ) {
        return conflict('Promotion deadline has expired.');
      }
      const normalizedCheckpoint = checkpoint(input.checkpoint);
      if (
        !DIGEST_PATTERN.test(normalizedCheckpoint.statementDigest) ||
        normalizedCheckpoint.artifacts.length > 128 ||
        new Set(normalizedCheckpoint.artifacts.map(({ id }) => id)).size !==
          normalizedCheckpoint.artifacts.length
      ) {
        return conflict('Promotion checkpoint artifacts are invalid.');
      }
      const updated = record({
        ...current,
        checkpoint: normalizedCheckpoint,
        state: 'checkpointed',
        version: current.version + 1,
      });
      promotions.set(updated.promotionId, updated);
      return Object.freeze({ status: 'updated', promotion: updated });
    },

    async finalizePromotion(input) {
      const current = promotions.get(input.promotionId);
      if (!current) return conflict('Promotion does not exist.');
      const alreadyCompleted = completed(current);
      if (alreadyCompleted) {
        if (alreadyCompleted.status !== 'completed') return alreadyCompleted;
        return alreadyCompleted.evidence.manifestDigest ===
          input.manifest.manifestDigest
          ? alreadyCompleted
          : conflict('Completed promotion cannot be replaced.');
      }
      if (
        current.version !== input.expectedVersion ||
        current.state !== 'checkpointed' ||
        !current.checkpoint
      ) {
        return conflict(
          'Promotion is not at its expected finalize checkpoint.'
        );
      }
      const finalizeInstant = parseVerificationInstant(options.now());
      if (
        finalizeInstant === undefined ||
        finalizeInstant > parseVerificationInstant(current.deadline)!
      ) {
        return conflict('Promotion deadline has expired.');
      }
      const validation = validateVerificationEvidenceManifest(input.manifest);
      if (validation.status !== 'ready') {
        return conflict(validation.message);
      }
      const manifest = validation.manifest;
      if (
        manifest.candidateDigest !== current.candidateDigest ||
        manifest.statement.candidateId !== current.candidateId ||
        manifest.statement.evidenceId !== current.evidenceId ||
        manifest.statement.workspaceId !== current.workspaceId ||
        manifest.statement.planDigest !== current.planDigest ||
        manifest.statement.cellId !== current.cellId ||
        manifest.statement.attemptId !== current.attemptId ||
        manifest.statement.createdAt !== current.createdAt ||
        manifest.evidence.id !== current.evidenceId ||
        manifest.statementDigest !== current.checkpoint.statementDigest
      ) {
        return conflict('Manifest does not match the acquired promotion.');
      }
      const checkpointClaims = current.checkpoint.verifiedClaims;
      if (
        checkpointClaims === undefined
          ? manifest.verifiedProvenance.kind !== 'unattested'
          : manifest.verifiedProvenance.kind !== 'attested' ||
            !sameCanonicalJson(
              checkpointClaims,
              manifest.verifiedProvenance.claims
            )
      ) {
        return conflict('Manifest provenance drifted from the checkpoint.');
      }
      if (
        current.checkpoint.artifacts.length !==
          manifest.evidence.artifacts.length ||
        current.checkpoint.artifacts.some((artifact, index) => {
          const expected = manifest.evidence.artifacts[index];
          return (
            !expected ||
            artifact.id !== expected.id ||
            artifact.digest !== expected.digest ||
            artifact.size !== expected.size ||
            artifact.mediaType !== expected.mediaType
          );
        })
      ) {
        return conflict('Manifest artifacts drifted from the checkpoint.');
      }
      const identity = attemptKey(manifest.statement);
      const existingAttempt = evidenceByAttempt.get(identity);
      if (
        existingAttempt &&
        existingAttempt !== manifest.statement.evidenceId
      ) {
        return conflict('The Plan cell attempt already has another Evidence.');
      }
      const existingEvidence = evidence.get(manifest.statement.evidenceId);
      if (
        existingEvidence &&
        existingEvidence.manifestDigest !== manifest.manifestDigest
      ) {
        return conflict('Evidence id is already bound to another manifest.');
      }
      const replayKey =
        manifest.verifiedProvenance.kind === 'attested'
          ? manifest.verifiedProvenance.claims.replayKey
          : undefined;
      if (replayKey) {
        const existingReplay = replayKeys.get(replayKey);
        if (existingReplay && existingReplay !== manifest.manifestDigest) {
          return conflict(
            'Attestation replay key was already consumed.',
            'VER-5003'
          );
        }
      }
      evidence.set(manifest.statement.evidenceId, manifest);
      evidenceByAttempt.set(identity, manifest.statement.evidenceId);
      if (replayKey) replayKeys.set(replayKey, manifest.manifestDigest);
      if (!existingEvidence) {
        for (const artifact of manifest.evidence.artifacts) {
          artifactReferenceCounts.set(
            artifact.digest,
            (artifactReferenceCounts.get(artifact.digest) ?? 0) + 1
          );
        }
      }
      const updated = record({
        ...current,
        state: 'completed',
        version: current.version + 1,
        manifestDigest: manifest.manifestDigest,
      });
      promotions.set(updated.promotionId, updated);
      return Object.freeze({
        status: 'completed',
        promotion: updated,
        evidence: manifest,
      });
    },

    async failPromotion(input) {
      const current = promotions.get(input.promotionId);
      if (!current) return conflict('Promotion does not exist.');
      const alreadyCompleted = completed(current);
      if (alreadyCompleted) return alreadyCompleted;
      if (current.version !== input.expectedVersion) {
        return conflict('Promotion version drifted.');
      }
      const updated = record({
        ...current,
        state: 'failed',
        failureCode: input.failureCode,
        version: current.version + 1,
      });
      promotions.set(updated.promotionId, updated);
      return Object.freeze({ status: 'updated', promotion: updated });
    },

    async getEvidence(evidenceId) {
      return evidence.get(evidenceId);
    },

    async listEvidence(input) {
      return Object.freeze(
        [...evidence.values()]
          .filter(
            (manifest) =>
              manifest.statement.workspaceId === input.workspaceId &&
              (input.planDigest === undefined ||
                manifest.statement.planDigest === input.planDigest) &&
              (input.cellId === undefined ||
                manifest.statement.cellId === input.cellId)
          )
          .sort(
            (left, right) =>
              compareUnicodeCodePoints(
                left.statement.createdAt,
                right.statement.createdAt
              ) ||
              compareUnicodeCodePoints(
                left.statement.attemptId,
                right.statement.attemptId
              ) ||
              compareUnicodeCodePoints(
                left.statement.evidenceId,
                right.statement.evidenceId
              )
          )
      );
    },

    async getPromotion(promotionId) {
      return promotions.get(promotionId);
    },

    async getArtifactReferenceCount(digest) {
      return artifactReferenceCounts.get(digest) ?? 0;
    },
  });
};
