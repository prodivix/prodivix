import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  createVerificationArtifactPolicy,
  readCanonicalVerificationArtifactPath,
  readVerificationArtifactTargetPolicy,
} from './verificationArtifactPolicy';
import {
  IMAGE_VERIFICATION_ARTIFACT_KINDS,
  isVerificationArtifactJsonMediaType,
  JSON_VERIFICATION_ARTIFACT_KINDS,
  normalizeVerificationArtifactMediaType,
  SUPPORTED_VERIFICATION_ARTIFACT_KINDS,
} from './verificationArtifactMedia';
import { readExactVerificationArtifactDataValues } from './verificationArtifactObjectBoundary';
import {
  createVerificationEvidenceStatementDigest,
  verificationTrustForOrigin,
  verifyVerificationEvidenceAttestation,
  type VerificationEvidenceAttestationVerifier,
  type VerificationVerifiedClaims,
} from './verificationAttestation';
import { validateVerificationEvidenceCandidate } from './verificationEvidenceCodec';
import {
  createVerificationEvidenceManifest,
  createVerificationEvidenceStatementForCandidate,
  type VerificationEvidenceManifest,
} from './verificationEvidenceManifest';
import type {
  VerificationEvidencePromotionRecord,
  VerificationEvidenceRepository,
} from './verificationEvidenceRepository';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import { DIGEST_PATTERN } from './verificationEvidenceCandidateSchema';
import { hasSameVerificationEvidenceSupersessionLineage } from './verificationEvidenceSupersession';
import type {
  VerificationArtifactKind,
  VerificationArtifactManifest,
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateArtifact,
} from './verification.types';

export type VerificationEvidenceArtifactPromotionResult =
  | Readonly<{
      status: 'accepted';
      artifacts: readonly VerificationArtifactManifest[];
    }>
  | Readonly<{
      status: 'rejected';
      reasonCode: 'VER-5002' | 'VER-5005';
    }>;

/**
 * Backend composition owns staging capabilities, byte scanning, and the
 * content-addressed store. The Core port receives only candidate identity and
 * returns safe durable descriptors; implementations must be idempotent.
 */
export type VerificationEvidenceArtifactPromotionPort = Readonly<{
  promoteCandidateArtifacts(
    candidate: VerificationEvidenceCandidate
  ): Promise<VerificationEvidenceArtifactPromotionResult>;
}>;

export type VerificationEvidencePromotionAttestation = Readonly<{
  issuer: string;
  audience: string;
  subject: string;
  nonce: string;
  policyGeneration: number;
  verificationInstant: string;
  maximumLifetimeMs: number;
  proof: Uint8Array;
}>;

export type PromoteVerificationEvidenceInput = Readonly<{
  candidate: VerificationEvidenceCandidate;
  supersedes?: string;
  attestation?: VerificationEvidencePromotionAttestation;
}>;

export type VerificationEvidencePromotionResult =
  | Readonly<{
      status: 'completed';
      promotion: VerificationEvidencePromotionRecord;
      evidence: VerificationEvidenceManifest;
    }>
  | Readonly<{
      status: 'invalid';
      reasonCode:
        'VER-4002' | 'VER-5001' | 'VER-5002' | 'VER-5003' | 'VER-5005';
      message: string;
    }>;

export type VerificationEvidencePromotionCoordinator = Readonly<{
  promote(
    input: PromoteVerificationEvidenceInput
  ): Promise<VerificationEvidencePromotionResult>;
}>;

export type CreateVerificationEvidencePromotionCoordinatorOptions = Readonly<{
  repository: VerificationEvidenceRepository;
  artifactPromotion: VerificationEvidenceArtifactPromotionPort;
  attestationVerifier?: VerificationEvidenceAttestationVerifier;
}>;

const invalid = (
  reasonCode: 'VER-4002' | 'VER-5001' | 'VER-5002' | 'VER-5003' | 'VER-5005',
  message: string
): VerificationEvidencePromotionResult =>
  Object.freeze({ status: 'invalid', reasonCode, message });

const CORE_ARTIFACT_POLICY = createVerificationArtifactPolicy();
const ARTIFACT_MANIFEST_KEYS = new Set([
  'id',
  'path',
  'kind',
  'digest',
  'size',
  'mediaType',
]);
const ARTIFACT_MANIFEST_WITH_NORMALIZED_DIGEST_KEYS = new Set([
  ...ARTIFACT_MANIFEST_KEYS,
  'normalizedDigest',
]);
const ARTIFACT_MANIFEST_WITH_SOURCE_TRACE_DIGEST_KEYS = new Set([
  ...ARTIFACT_MANIFEST_KEYS,
  'sourceTraceDigest',
]);
const ARTIFACT_MANIFEST_WITH_ALL_OPTIONAL_KEYS = new Set([
  ...ARTIFACT_MANIFEST_WITH_NORMALIZED_DIGEST_KEYS,
  'sourceTraceDigest',
]);

type ArtifactPolicyPreflightResult =
  | Readonly<{
      status: 'accepted';
      artifactsById: ReadonlyMap<string, VerificationEvidenceCandidateArtifact>;
    }>
  | Readonly<{ status: 'rejected' }>;

const mediaTypeMatchesKind = (
  kind: VerificationArtifactKind,
  mediaType: string
): boolean =>
  IMAGE_VERIFICATION_ARTIFACT_KINDS.has(kind)
    ? mediaType === 'image/png' || mediaType === 'image/jpeg'
    : kind === 'build-log'
      ? mediaType === 'text/plain'
      : JSON_VERIFICATION_ARTIFACT_KINDS.has(kind) &&
        isVerificationArtifactJsonMediaType(mediaType);

/**
 * Checks only the canonical descriptor and policy facts available before the
 * staging port resolves bytes. Content sniffing, structure validation, and
 * sensitive-data scanning remain port responsibilities.
 */
const preflightCandidateArtifacts = (
  candidate: VerificationEvidenceCandidate
): ArtifactPolicyPreflightResult => {
  if (candidate.artifacts.length > CORE_ARTIFACT_POLICY.maximumArtifacts) {
    return Object.freeze({ status: 'rejected' });
  }
  let targetPolicy;
  try {
    targetPolicy = readVerificationArtifactTargetPolicy(
      candidate.redaction.targetPolicy
    );
  } catch {
    return Object.freeze({ status: 'rejected' });
  }
  if (
    targetPolicy.policyDigest !== candidate.policyDigest ||
    targetPolicy.semanticTargetId !== candidate.targetId
  ) {
    return Object.freeze({ status: 'rejected' });
  }

  let totalBytes = 0;
  const artifactsById = new Map<
    string,
    VerificationEvidenceCandidateArtifact
  >();
  const paths = new Set<string>();
  for (const artifact of candidate.artifacts) {
    let path: string;
    try {
      path = readCanonicalVerificationArtifactPath(
        artifact.path,
        CORE_ARTIFACT_POLICY
      );
    } catch {
      return Object.freeze({ status: 'rejected' });
    }
    const mediaType = normalizeVerificationArtifactMediaType(
      artifact.expectedMediaType
    );
    if (
      path !== artifact.path ||
      !mediaType ||
      mediaType !== artifact.expectedMediaType ||
      !SUPPORTED_VERIFICATION_ARTIFACT_KINDS.has(artifact.kind) ||
      !mediaTypeMatchesKind(artifact.kind, mediaType) ||
      artifactsById.has(artifact.id) ||
      paths.has(path) ||
      !Number.isSafeInteger(artifact.expectedSize) ||
      artifact.expectedSize < 0 ||
      artifact.expectedSize > CORE_ARTIFACT_POLICY.maximumSingleArtifactBytes ||
      (targetPolicy.capture === 'forbidden-sensitive' &&
        IMAGE_VERIFICATION_ARTIFACT_KINDS.has(artifact.kind))
    ) {
      return Object.freeze({ status: 'rejected' });
    }
    totalBytes += artifact.expectedSize;
    if (totalBytes > CORE_ARTIFACT_POLICY.maximumTotalArtifactBytes) {
      return Object.freeze({ status: 'rejected' });
    }
    artifactsById.set(artifact.id, artifact);
    paths.add(path);
  }
  return Object.freeze({
    status: 'accepted',
    artifactsById,
  });
};

const readPromotedArtifact = (
  value: unknown
): VerificationArtifactManifest | undefined => {
  const data =
    readExactVerificationArtifactDataValues(value, ARTIFACT_MANIFEST_KEYS) ??
    readExactVerificationArtifactDataValues(
      value,
      ARTIFACT_MANIFEST_WITH_NORMALIZED_DIGEST_KEYS
    ) ??
    readExactVerificationArtifactDataValues(
      value,
      ARTIFACT_MANIFEST_WITH_SOURCE_TRACE_DIGEST_KEYS
    ) ??
    readExactVerificationArtifactDataValues(
      value,
      ARTIFACT_MANIFEST_WITH_ALL_OPTIONAL_KEYS
    );
  if (!data) return undefined;
  const normalizedDigest = Object.hasOwn(data, 'normalizedDigest')
    ? data.normalizedDigest
    : undefined;
  const sourceTraceDigest = Object.hasOwn(data, 'sourceTraceDigest')
    ? data.sourceTraceDigest
    : undefined;
  if (
    typeof data.id !== 'string' ||
    typeof data.path !== 'string' ||
    typeof data.kind !== 'string' ||
    typeof data.digest !== 'string' ||
    typeof data.size !== 'number' ||
    typeof data.mediaType !== 'string' ||
    (normalizedDigest !== undefined &&
      (typeof normalizedDigest !== 'string' ||
        !DIGEST_PATTERN.test(normalizedDigest))) ||
    (sourceTraceDigest !== undefined &&
      (typeof sourceTraceDigest !== 'string' ||
        !DIGEST_PATTERN.test(sourceTraceDigest)))
  ) {
    return undefined;
  }
  return Object.freeze({
    id: data.id,
    path: data.path,
    kind: data.kind as VerificationArtifactKind,
    digest: data.digest,
    ...(normalizedDigest ? { normalizedDigest } : {}),
    ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
    size: data.size,
    mediaType: data.mediaType,
  });
};

const validatePromotedArtifacts = (
  value: unknown,
  preflight: Extract<ArtifactPolicyPreflightResult, { status: 'accepted' }>
): readonly VerificationArtifactManifest[] | undefined => {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length !== preflight.artifactsById.size ||
      Reflect.ownKeys(value).length !== value.length + 1 ||
      !Object.hasOwn(value, 'length')
    ) {
      return undefined;
    }
    const artifacts: VerificationArtifactManifest[] = [];
    const returnedIds = new Set<string>();
    let totalBytes = 0;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      const artifact = readPromotedArtifact(descriptor.value);
      const expected = artifact
        ? preflight.artifactsById.get(artifact.id)
        : undefined;
      if (
        !artifact ||
        !expected ||
        returnedIds.has(artifact.id) ||
        artifact.path !== expected.path ||
        artifact.kind !== expected.kind ||
        artifact.digest !== expected.expectedDigest ||
        artifact.size !== expected.expectedSize ||
        artifact.mediaType !== expected.expectedMediaType ||
        (artifact.sourceTraceDigest !== undefined &&
          artifact.sourceTraceDigest !== expected.sourceTraceDigest) ||
        artifact.size > CORE_ARTIFACT_POLICY.maximumSingleArtifactBytes ||
        !mediaTypeMatchesKind(artifact.kind, artifact.mediaType)
      ) {
        return undefined;
      }
      totalBytes += artifact.size;
      if (totalBytes > CORE_ARTIFACT_POLICY.maximumTotalArtifactBytes) {
        return undefined;
      }
      returnedIds.add(artifact.id);
      artifacts.push(
        Object.freeze({
          ...artifact,
          ...(expected.sourceTraceDigest
            ? { sourceTraceDigest: expected.sourceTraceDigest }
            : {}),
        })
      );
    }
    return canonicalArtifacts(artifacts);
  } catch {
    return undefined;
  }
};

const canonicalArtifacts = (
  artifacts: readonly VerificationArtifactManifest[]
): readonly VerificationArtifactManifest[] =>
  Object.freeze(
    artifacts
      .map((artifact) => Object.freeze({ ...artifact }))
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.id, right.id) ||
          compareUnicodeCodePoints(left.digest, right.digest)
      )
  );

const checkpointMatches = (
  promotion: VerificationEvidencePromotionRecord,
  statementDigest: string,
  artifacts: readonly VerificationArtifactManifest[],
  verifiedClaims: VerificationVerifiedClaims | undefined
): boolean =>
  promotion.state === 'checkpointed' &&
  promotion.checkpoint !== undefined &&
  promotion.checkpoint.statementDigest === statementDigest &&
  canonicalJsonText(promotion.checkpoint.artifacts) ===
    canonicalJsonText(artifacts) &&
  canonicalJsonText(promotion.checkpoint.verifiedClaims ?? null) ===
    canonicalJsonText(verifiedClaims ?? null);

const safeFail = async (
  repository: VerificationEvidenceRepository,
  promotion: VerificationEvidencePromotionRecord,
  failureCode: 'VER-5001' | 'VER-5002' | 'VER-5003' | 'VER-5005'
): Promise<void> => {
  try {
    await repository.failPromotion({
      promotionId: promotion.promotionId,
      expectedVersion: promotion.version,
      failureCode,
    });
  } catch {
    // Failure recording is best-effort; it must never mask the fail-closed result.
  }
};

const verifyProvenance = async (
  candidate: VerificationEvidenceCandidate,
  statement: ReturnType<typeof createVerificationEvidenceStatementForCandidate>,
  attestation: VerificationEvidencePromotionAttestation | undefined,
  verifier: VerificationEvidenceAttestationVerifier | undefined
): Promise<VerificationVerifiedClaims | undefined | false> => {
  const attested =
    candidate.provenance.origin === 'remote' ||
    candidate.provenance.origin === 'ci';
  if (!attested) return attestation === undefined ? undefined : false;
  if (!attestation || !verifier) return false;
  const result = await verifyVerificationEvidenceAttestation({
    expected: {
      trust: verificationTrustForOrigin(candidate.provenance.origin) as
        'remote-attested' | 'ci-attested',
      issuer: attestation.issuer,
      audience: attestation.audience,
      subject: attestation.subject,
      nonce: attestation.nonce,
      policyGeneration: attestation.policyGeneration,
      verificationInstant: attestation.verificationInstant,
      maximumLifetimeMs: attestation.maximumLifetimeMs,
      statement,
    },
    proof: attestation.proof,
    verifier,
  });
  return result.status === 'verified' ? result.claims : false;
};

/**
 * Runs the bounded Candidate -> artifacts -> statement -> provenance ->
 * manifest transaction protocol. No raw proof or staging capability is passed
 * to the repository.
 */
export const createVerificationEvidencePromotionCoordinator = (
  options: CreateVerificationEvidencePromotionCoordinatorOptions
): VerificationEvidencePromotionCoordinator =>
  Object.freeze({
    async promote(input) {
      if (Object.hasOwn(input as object, 'retention')) {
        return invalid(
          'VER-5001',
          'Evidence retention must come from the normalized candidate.'
        );
      }
      const candidateValidation = validateVerificationEvidenceCandidate(
        input.candidate
      );
      if (candidateValidation.status !== 'ready') {
        return invalid('VER-4002', 'EvidenceCandidate validation failed.');
      }
      const candidate = candidateValidation.candidate;
      if (
        parseVerificationInstant(candidate.promotion.deadline) === undefined
      ) {
        return invalid('VER-5001', 'Evidence promotion identity is invalid.');
      }
      const artifactPreflight = preflightCandidateArtifacts(candidate);
      if (input.supersedes) {
        let superseded: VerificationEvidenceManifest | undefined;
        try {
          superseded = await options.repository.getEvidence(input.supersedes);
        } catch {
          return invalid(
            'VER-5001',
            'Superseded Evidence lineage could not be resolved.'
          );
        }
        if (
          !superseded ||
          !hasSameVerificationEvidenceSupersessionLineage(
            superseded.evidence,
            candidate
          )
        ) {
          return invalid(
            'VER-5001',
            'Superseded Evidence must match workspace, check, kind, and semantic target.'
          );
        }
      }
      const promotionIntentDigest = digestVerificationValue({
        retention: candidate.requestedRetention,
        supersedes: input.supersedes ?? null,
      });
      const acquired = await options.repository.acquirePromotion({
        idempotencyKey: candidate.promotion.idempotencyKey,
        candidateId: candidate.candidateId,
        candidateDigest: candidate.candidateDigest,
        promotionIntentDigest,
        workspaceId: candidate.workspaceId,
        planDigest: candidate.planDigest,
        cellId: candidate.cellId,
        attemptId: candidate.attemptId,
        deadline: candidate.promotion.deadline,
      });
      if (acquired.status === 'conflict') {
        return invalid(acquired.reasonCode, acquired.message);
      }
      if (acquired.status === 'completed') {
        if (artifactPreflight.status !== 'accepted') {
          return invalid(
            'VER-5005',
            'Evidence artifact descriptor policy preflight failed.'
          );
        }
        return Object.freeze({
          status: 'completed',
          promotion: acquired.promotion,
          evidence: acquired.evidence,
        });
      }
      let promotion = acquired.promotion;
      if (artifactPreflight.status !== 'accepted') {
        await safeFail(options.repository, promotion, 'VER-5005');
        return invalid(
          'VER-5005',
          'Evidence artifact descriptor policy preflight failed.'
        );
      }
      if (input.supersedes === promotion.evidenceId) {
        return invalid('VER-5001', 'Evidence cannot supersede itself.');
      }
      let artifacts: readonly VerificationArtifactManifest[];
      let verifiedClaims: VerificationVerifiedClaims | undefined;
      if (promotion.state === 'checkpointed' && promotion.checkpoint) {
        const validatedArtifacts = validatePromotedArtifacts(
          promotion.checkpoint.artifacts,
          artifactPreflight
        );
        if (!validatedArtifacts) {
          await safeFail(options.repository, promotion, 'VER-5005');
          return invalid(
            'VER-5005',
            'Checkpointed artifact descriptors do not match the Candidate.'
          );
        }
        artifacts = validatedArtifacts;
        verifiedClaims = promotion.checkpoint.verifiedClaims;
      } else {
        let artifactResult: VerificationEvidenceArtifactPromotionResult;
        try {
          artifactResult =
            await options.artifactPromotion.promoteCandidateArtifacts(
              candidate
            );
        } catch {
          await safeFail(options.repository, promotion, 'VER-5005');
          return invalid('VER-5005', 'Artifact promotion failed.');
        }
        if (artifactResult.status !== 'accepted') {
          await safeFail(
            options.repository,
            promotion,
            artifactResult.reasonCode
          );
          return invalid(
            artifactResult.reasonCode,
            'Artifact safety validation failed.'
          );
        }
        const validatedArtifacts = validatePromotedArtifacts(
          artifactResult.artifacts,
          artifactPreflight
        );
        if (!validatedArtifacts) {
          await safeFail(options.repository, promotion, 'VER-5005');
          return invalid(
            'VER-5005',
            'Promoted artifact descriptors do not match the Candidate.'
          );
        }
        artifacts = validatedArtifacts;
        let statement;
        try {
          statement = createVerificationEvidenceStatementForCandidate(
            {
              candidate,
              evidenceId: promotion.evidenceId,
              createdAt: promotion.createdAt,
              artifacts,
              ...(input.supersedes ? { supersedes: input.supersedes } : {}),
            },
            artifacts
          );
        } catch {
          await safeFail(options.repository, promotion, 'VER-5001');
          return invalid('VER-5001', 'Evidence statement validation failed.');
        }
        const provenance = await verifyProvenance(
          candidate,
          statement,
          input.attestation,
          options.attestationVerifier
        );
        if (provenance === false) {
          await safeFail(options.repository, promotion, 'VER-5003');
          return invalid('VER-5003', 'Evidence attestation is invalid.');
        }
        verifiedClaims = provenance;
        const statementDigest =
          createVerificationEvidenceStatementDigest(statement);
        const checkpointInput = Object.freeze({
          artifacts,
          statementDigest,
          ...(verifiedClaims ? { verifiedClaims } : {}),
        });
        const checkpointed = await options.repository.checkpointPromotion({
          promotionId: promotion.promotionId,
          expectedVersion: promotion.version,
          checkpoint: checkpointInput,
        });
        if (checkpointed.status === 'completed') {
          return Object.freeze({
            status: 'completed',
            promotion: checkpointed.promotion,
            evidence: checkpointed.evidence,
          });
        }
        if (checkpointed.status === 'conflict') {
          const concurrent = await options.repository.getPromotion(
            promotion.promotionId
          );
          if (concurrent?.state === 'completed') {
            const stored = await options.repository.getEvidence(
              concurrent.evidenceId
            );
            if (
              stored &&
              stored.candidateDigest === candidate.candidateDigest
            ) {
              return Object.freeze({
                status: 'completed',
                promotion: concurrent,
                evidence: stored,
              });
            }
          }
          if (
            !concurrent ||
            !checkpointMatches(
              concurrent,
              statementDigest,
              artifacts,
              verifiedClaims
            )
          ) {
            return invalid(checkpointed.reasonCode, checkpointed.message);
          }
          promotion = concurrent;
        } else {
          promotion = checkpointed.promotion;
        }
      }
      const manifest = createVerificationEvidenceManifest({
        candidate,
        evidenceId: promotion.evidenceId,
        createdAt: promotion.createdAt,
        artifacts,
        ...(verifiedClaims ? { verifiedClaims } : {}),
        ...(input.supersedes ? { supersedes: input.supersedes } : {}),
      });
      if (manifest.status !== 'ready') {
        await safeFail(options.repository, promotion, manifest.reasonCode);
        return invalid(manifest.reasonCode, manifest.message);
      }
      const finalized = await options.repository.finalizePromotion({
        promotionId: promotion.promotionId,
        expectedVersion: promotion.version,
        manifest: manifest.manifest,
      });
      if (finalized.status === 'conflict') {
        const concurrent = await options.repository.getPromotion(
          promotion.promotionId
        );
        if (concurrent?.state === 'completed') {
          const stored = await options.repository.getEvidence(
            concurrent.evidenceId
          );
          if (stored?.manifestDigest === manifest.manifest.manifestDigest) {
            return Object.freeze({
              status: 'completed',
              promotion: concurrent,
              evidence: stored,
            });
          }
        }
        return invalid(finalized.reasonCode, finalized.message);
      }
      if (finalized.status !== 'completed') {
        return invalid('VER-5001', 'Evidence promotion did not complete.');
      }
      return Object.freeze({
        status: 'completed',
        promotion: finalized.promotion,
        evidence: finalized.evidence,
      });
    },
  });
