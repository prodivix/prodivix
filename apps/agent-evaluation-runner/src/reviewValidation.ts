import {
  createPrivateKey,
  createPublicKey,
  sign as signEd25519,
  timingSafeEqual,
  verify as verifyEd25519,
  type KeyObject,
} from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
  agentEvaluationHumanReviewAdjudicationPayload,
  agentEvaluationHumanReviewIndependencePayload,
  agentEvaluationHumanReviewRatingPayload,
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
  isAgentEvaluationValidatedHumanReviewArtifact,
  isAgentHumanReviewReport,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  normalizeAgentEvaluationHumanReviewCriterionVerdicts,
  validateAgentEvaluationReviewRasterBytes,
  verdictForRequiredHumanReviewCriteria,
  type AgentEvaluationHumanReviewCriterionVerdict,
  type AgentEvaluationHumanReviewAdjudicationDecision,
  type AgentEvaluationHumanReviewArtifactPayload,
  type AgentEvaluationHumanReviewCandidateAdjudication,
  type AgentEvaluationHumanReviewImport,
  type AgentEvaluationHumanReviewIndependenceAttestation,
  type AgentEvaluationHumanReviewSignedRating,
  type AgentEvaluationHumanReviewSourceProvenance,
  type AgentEvaluationHumanReviewValidationReceipt,
  type AgentEvaluationValidatedHumanReviewArtifact,
  type AgentHumanReviewReport,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationBlindReviewBundle,
  AgentEvaluationCoordinatorFilePort,
  AgentEvaluationHumanReviewAuthorityContext,
  AgentEvaluationHumanReviewImportVerifier,
  AgentEvaluationReviewValidationService,
  AgentEvaluationValidateReviewCommand,
} from './coordinator';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { createSignedAgentEvaluationHumanReviewImport } from './reviewerAuthority';
import { loadProductionAgentEvaluationRunConfigArtifact } from './productionRunConfigArtifact';
import { validateAgentEvaluationPublicReviewRubric } from './reviewWorkflow';
import {
  type AgentEvaluationHumanReviewTrustAuthority,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import {
  createCredentialCanarySignatures,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';

export const AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES = Object.freeze({
  privateKey: 'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_PRIVATE_KEY',
  repositoryCommit: 'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT',
  runConfigPath: 'PRODIVIX_G4_MODEL_EVAL_RUN_CONFIG_PATH',
  workflowName: 'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_WORKFLOW_NAME',
  workflowRunAttempt:
    'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_WORKFLOW_RUN_ATTEMPT',
  workflowRunId: 'PRODIVIX_G4_MODEL_EVAL_HUMAN_REVIEW_WORKFLOW_RUN_ID',
} as const);

const blindBundleFormat = 'prodivix.g4-model-evaluation-blind-review' as const;
const submissionFormat = 'prodivix.g4-human-review-submission' as const;
const independenceRegistryFormat =
  'prodivix.g4-human-review-independence-registry' as const;
const ratingFormat = 'prodivix.g4-human-review-signed-rating' as const;
const independenceFormat =
  'prodivix.g4-human-review-independence-attestation' as const;
const adjudicationFormat =
  'prodivix.g4-human-review-adjudication-decision' as const;
const validationReceiptFormat =
  'prodivix.g4-human-review-validation-receipt' as const;
const outputFormat =
  'prodivix.g4-model-evaluation-human-review-import' as const;
const workflowName = 'g4-real-model-human-review' as const;
const maximumInboxDocumentBytes = 16_777_216;
const maximumBlindBundleBytes = 67_108_864;
const maximumRatings = 1_000_000;
const maximumAttestations = 64;
const maximumDecisions = 500_000;
const commitPattern = /^[0-9a-f]{40}$/u;
const githubArtifactDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const signaturePattern = /^[A-Za-z0-9_-]{86}$/u;
const privateKeyPattern = /^[A-Za-z0-9_-]{64}$/u;
const publicKeyPattern = /^[A-Za-z0-9_-]{43}$/u;
const ed25519Pkcs8Prefix = Buffer.from(
  '302e020100300506032b657004220420',
  'hex'
);
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');

export type AgentEvaluationHumanReviewSubmission = Readonly<{
  format: typeof submissionFormat;
  version: 1;
  submissionId: string;
  blindBundleDigest: string;
  reviewLeaseDigest: string;
  blindedArtifactSetDigest: string;
  randomizedPresentationPolicyDigest: string;
  sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
  signedRatings: readonly AgentEvaluationHumanReviewSignedRating[];
  adjudicationDecisions: readonly AgentEvaluationHumanReviewAdjudicationDecision[];
  independenceRegistryDigest: string;
  submittedAt: string;
  submissionDigest: string;
}>;

export type AgentEvaluationHumanReviewIndependenceRegistry = Readonly<{
  format: typeof independenceRegistryFormat;
  version: 1;
  submissionId: string;
  planDigest: string;
  repositoryCommit: string;
  planPlannedAt: string;
  blindBundleDigest: string;
  reviewLeaseDigest: string;
  blindedArtifactSetDigest: string;
  trustRegistryDigest: string;
  adjudicationPolicyDigest: string;
  attestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
  registryDigest: string;
}>;

export type AgentEvaluationHumanReviewValidationInput = Readonly<{
  bundle: AgentEvaluationBlindReviewBundle;
  submission: AgentEvaluationHumanReviewSubmission;
  independenceRegistry: AgentEvaluationHumanReviewIndependenceRegistry;
  config: AgentEvaluationProductionFrozenRunConfig;
  sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
  validatedAt: string;
}>;

type ExactRecord = Readonly<Record<string, unknown>>;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const signatureInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const secretUnavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
  );
};

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): ExactRecord => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey)
  ) {
    return invalid();
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.has(key)) ||
    keys.length !==
      required.length +
        optional.filter((key) => Object.hasOwn(value, key)).length
  ) {
    return invalid();
  }
  return value;
};

const identity = (value: unknown): string =>
  isAgentControlIdentity(value) ? value : invalid();

const digest = (value: unknown): string =>
  isAgentCanonicalDigest(value) ? value : invalid();

const instant = (value: unknown): string =>
  isAgentControlInstant(value) ? value : invalid();

const canonicalSignature = (value: unknown): string => {
  if (typeof value !== 'string' || !signaturePattern.test(value)) {
    return invalid();
  }
  let bytes: Buffer | undefined;
  try {
    bytes = Buffer.from(value, 'base64url');
    if (bytes.byteLength !== 64 || bytes.toString('base64url') !== value) {
      return invalid();
    }
    return value;
  } catch {
    return invalid();
  } finally {
    bytes?.fill(0);
  }
};

const positiveInteger = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) return invalid();
  return Number(value);
};

const boundedCanonicalBytes = (value: unknown, maximumBytes: number): void => {
  let bytes: Uint8Array | undefined;
  try {
    bytes = new TextEncoder().encode(canonicalJsonText(value));
    if (bytes.byteLength < 2 || bytes.byteLength > maximumBytes) invalid();
  } finally {
    bytes?.fill(0);
  }
};

const sortedUniqueIdentities = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return invalid();
  const identities = value.map(identity);
  if (
    new Set(identities).size !== identities.length ||
    !sameCanonicalJson(
      identities,
      [...identities].sort(compareUnicodeCodePoints)
    )
  ) {
    return invalid();
  }
  return Object.freeze(identities);
};

const sortedUniqueDigests = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return invalid();
  const digests = value.map(digest);
  if (
    new Set(digests).size !== digests.length ||
    !sameCanonicalJson(digests, [...digests].sort(compareUnicodeCodePoints))
  ) {
    return invalid();
  }
  return Object.freeze(digests);
};

const sourceProvenance = (
  value: unknown
): AgentEvaluationHumanReviewSourceProvenance => {
  const record = exact(value, [
    'sourceRunId',
    'sourceRunAttempt',
    'sourceArtifactName',
    'sourceArtifactDigest',
  ]);
  if (
    typeof record.sourceRunId !== 'string' ||
    !/^[1-9][0-9]*$/u.test(record.sourceRunId) ||
    !Number.isSafeInteger(Number(record.sourceRunId)) ||
    typeof record.sourceArtifactDigest !== 'string' ||
    !githubArtifactDigestPattern.test(record.sourceArtifactDigest)
  ) {
    return invalid();
  }
  return Object.freeze({
    sourceRunId: record.sourceRunId,
    sourceRunAttempt: positiveInteger(record.sourceRunAttempt),
    sourceArtifactName: identity(record.sourceArtifactName),
    sourceArtifactDigest: record.sourceArtifactDigest,
  });
};

const parseCriterionVerdicts = (
  value: unknown,
  expectedCriterionIds?: readonly string[]
): readonly AgentEvaluationHumanReviewCriterionVerdict[] => {
  if (!Array.isArray(value)) return invalid();
  try {
    return normalizeAgentEvaluationHumanReviewCriterionVerdicts(
      value as readonly AgentEvaluationHumanReviewCriterionVerdict[],
      expectedCriterionIds
    );
  } catch {
    return invalid();
  }
};

const parseSignedRating = (
  value: unknown
): AgentEvaluationHumanReviewSignedRating => {
  const record = exact(value, [
    'format',
    'version',
    'ratingId',
    'randomizedPresentationId',
    'rubricDigest',
    'blindedArtifactSetDigest',
    'reviewerAuthorityId',
    'reviewerPseudonym',
    'keyId',
    'criterionVerdicts',
    'verdict',
    'ratedAt',
    'ratingDigest',
    'signatureBase64Url',
  ]);
  if (
    record.format !== ratingFormat ||
    record.version !== 1 ||
    !['failed', 'passed'].includes(String(record.verdict))
  ) {
    return invalid();
  }
  const rating = Object.freeze({
    format: ratingFormat,
    version: 1 as const,
    ratingId: identity(record.ratingId),
    randomizedPresentationId: identity(record.randomizedPresentationId),
    rubricDigest: digest(record.rubricDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    reviewerAuthorityId: identity(record.reviewerAuthorityId),
    reviewerPseudonym: identity(record.reviewerPseudonym),
    keyId: identity(record.keyId),
    criterionVerdicts: parseCriterionVerdicts(record.criterionVerdicts),
    verdict: record.verdict as 'failed' | 'passed',
    ratedAt: instant(record.ratedAt),
    ratingDigest: digest(record.ratingDigest),
    signatureBase64Url: canonicalSignature(record.signatureBase64Url),
  });
  if (
    rating.verdict !==
      verdictForRequiredHumanReviewCriteria(rating.criterionVerdicts) ||
    rating.ratingDigest !==
      digestAgentCanonicalValue(
        agentEvaluationHumanReviewRatingPayload(rating)
      ) ||
    !sameCanonicalJson(value, rating)
  ) {
    return invalid();
  }
  return rating;
};

const parseIndependenceAttestation = (
  value: unknown
): AgentEvaluationHumanReviewIndependenceAttestation => {
  const record = exact(value, [
    'format',
    'version',
    'attestationId',
    'planDigest',
    'blindedArtifactSetDigest',
    'authorityId',
    'authorityPseudonym',
    'role',
    'keyId',
    'independencePolicyDigest',
    'testedModelFamilyOwnerSetDigest',
    'conflictModelFamilyOwnerSetDigest',
    'issuedAt',
    'expiresAt',
    'attestationDigest',
    'signatureBase64Url',
  ]);
  if (
    record.format !== independenceFormat ||
    record.version !== 1 ||
    !['reviewer', 'adjudicator'].includes(String(record.role))
  ) {
    return invalid();
  }
  const attestation = Object.freeze({
    format: independenceFormat,
    version: 1 as const,
    attestationId: identity(record.attestationId),
    planDigest: digest(record.planDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    authorityId: identity(record.authorityId),
    authorityPseudonym: identity(record.authorityPseudonym),
    role: record.role as 'reviewer' | 'adjudicator',
    keyId: identity(record.keyId),
    independencePolicyDigest: digest(record.independencePolicyDigest),
    testedModelFamilyOwnerSetDigest: digest(
      record.testedModelFamilyOwnerSetDigest
    ),
    conflictModelFamilyOwnerSetDigest: digest(
      record.conflictModelFamilyOwnerSetDigest
    ),
    issuedAt: instant(record.issuedAt),
    expiresAt: instant(record.expiresAt),
    attestationDigest: digest(record.attestationDigest),
    signatureBase64Url: canonicalSignature(record.signatureBase64Url),
  });
  if (
    Date.parse(attestation.expiresAt) <= Date.parse(attestation.issuedAt) ||
    attestation.attestationDigest !==
      digestAgentCanonicalValue(
        agentEvaluationHumanReviewIndependencePayload(attestation)
      ) ||
    !sameCanonicalJson(value, attestation)
  ) {
    return invalid();
  }
  return attestation;
};

const parseAdjudicationDecision = (
  value: unknown
): AgentEvaluationHumanReviewAdjudicationDecision => {
  const record = exact(value, [
    'format',
    'version',
    'decisionId',
    'randomizedPresentationId',
    'rubricDigest',
    'blindedArtifactSetDigest',
    'adjudicationAuthorityId',
    'adjudicatorPseudonym',
    'keyId',
    'candidateDigest',
    'planDigest',
    'policyDigest',
    'ratingDigests',
    'reviewerAuthorityIds',
    'criterionVerdicts',
    'decision',
    'decidedAt',
    'decisionDigest',
    'signatureBase64Url',
  ]);
  if (
    record.format !== adjudicationFormat ||
    record.version !== 1 ||
    !['failed', 'passed'].includes(String(record.decision))
  ) {
    return invalid();
  }
  const decision = Object.freeze({
    format: adjudicationFormat,
    version: 1 as const,
    decisionId: identity(record.decisionId),
    randomizedPresentationId: identity(record.randomizedPresentationId),
    rubricDigest: digest(record.rubricDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    adjudicationAuthorityId: identity(record.adjudicationAuthorityId),
    adjudicatorPseudonym: identity(record.adjudicatorPseudonym),
    keyId: identity(record.keyId),
    candidateDigest: digest(record.candidateDigest),
    planDigest: digest(record.planDigest),
    policyDigest: digest(record.policyDigest),
    ratingDigests: sortedUniqueDigests(record.ratingDigests),
    reviewerAuthorityIds: sortedUniqueIdentities(record.reviewerAuthorityIds),
    criterionVerdicts: parseCriterionVerdicts(record.criterionVerdicts),
    decision: record.decision as 'failed' | 'passed',
    decidedAt: instant(record.decidedAt),
    decisionDigest: digest(record.decisionDigest),
    signatureBase64Url: canonicalSignature(record.signatureBase64Url),
  });
  if (
    decision.decision !==
      verdictForRequiredHumanReviewCriteria(decision.criterionVerdicts) ||
    decision.decisionDigest !==
      digestAgentCanonicalValue(
        agentEvaluationHumanReviewAdjudicationPayload(decision)
      ) ||
    !sameCanonicalJson(value, decision)
  ) {
    return invalid();
  }
  return decision;
};

const parseBlindBundleCandidate = (
  value: unknown
): AgentEvaluationBlindReviewBundle['candidates'][number] => {
  const record = exact(value, [
    'randomizedPresentationId',
    'rubricDigest',
    'mediaType',
    'width',
    'height',
    'bytesBase64',
    'bytesDigest',
    'byteLength',
  ]);
  if (
    !['image/png', 'image/webp'].includes(String(record.mediaType)) ||
    !Number.isSafeInteger(record.width) ||
    Number(record.width) < 1 ||
    Number(record.width) > 4_096 ||
    !Number.isSafeInteger(record.height) ||
    Number(record.height) < 1 ||
    Number(record.height) > 4_096 ||
    Number(record.width) * Number(record.height) > 16_777_216 ||
    typeof record.bytesBase64 !== 'string' ||
    !Number.isSafeInteger(record.byteLength) ||
    Number(record.byteLength) < 1 ||
    Number(record.byteLength) > AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES
  ) {
    return invalid();
  }
  const candidate = Object.freeze({
    randomizedPresentationId: identity(record.randomizedPresentationId),
    rubricDigest: digest(record.rubricDigest),
    mediaType: record.mediaType as 'image/png' | 'image/webp',
    width: Number(record.width),
    height: Number(record.height),
    bytesBase64: record.bytesBase64,
    bytesDigest: digest(record.bytesDigest),
    byteLength: Number(record.byteLength),
  });
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeCanonicalBase64(candidate.bytesBase64, {
      label: 'Human review blind raster',
      maximumBytes: AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
    });
    if (
      bytes.byteLength !== candidate.byteLength ||
      digestAgentCanonicalBytes(bytes) !== candidate.bytesDigest
    ) {
      return invalid();
    }
    validateAgentEvaluationReviewRasterBytes(
      bytes,
      candidate.mediaType,
      candidate.width,
      candidate.height
    );
  } catch {
    return invalid();
  } finally {
    bytes?.fill(0);
  }
  if (!sameCanonicalJson(value, candidate)) return invalid();
  return candidate;
};

export const decodeAgentEvaluationBlindReviewBundle = (
  value: unknown
): AgentEvaluationBlindReviewBundle => {
  const record = exact(value, [
    'format',
    'version',
    'reviewLeaseDigest',
    'randomizedPresentationPolicyDigest',
    'rubrics',
    'candidates',
    'blindedArtifactSetDigest',
    'exportedAt',
    'bundleDigest',
  ]);
  if (
    record.format !== blindBundleFormat ||
    record.version !== 1 ||
    !Array.isArray(record.rubrics) ||
    record.rubrics.length < 1 ||
    record.rubrics.length > 16 ||
    !Array.isArray(record.candidates) ||
    record.candidates.length < 1 ||
    record.candidates.length > maximumRatings
  ) {
    return invalid();
  }
  const rubrics = Object.freeze(
    record.rubrics.map((entry) =>
      validateAgentEvaluationPublicReviewRubric(entry)
    )
  );
  const candidates = Object.freeze(
    record.candidates.map(parseBlindBundleCandidate)
  );
  if (
    new Set(rubrics.map(({ rubricDigest }) => rubricDigest)).size !==
      rubrics.length ||
    !sameCanonicalJson(
      rubrics.map(({ rubricDigest }) => rubricDigest),
      rubrics
        .map(({ rubricDigest }) => rubricDigest)
        .sort(compareUnicodeCodePoints)
    ) ||
    new Set(
      candidates.map(({ randomizedPresentationId }) => randomizedPresentationId)
    ).size !== candidates.length ||
    !sameCanonicalJson(
      candidates.map(
        ({ randomizedPresentationId }) => randomizedPresentationId
      ),
      candidates
        .map(({ randomizedPresentationId }) => randomizedPresentationId)
        .sort(compareUnicodeCodePoints)
    ) ||
    candidates.some(
      ({ rubricDigest }) =>
        !rubrics.some((rubric) => rubric.rubricDigest === rubricDigest)
    )
  ) {
    return invalid();
  }
  const base = Object.freeze({
    format: blindBundleFormat,
    version: 1 as const,
    reviewLeaseDigest: digest(record.reviewLeaseDigest),
    randomizedPresentationPolicyDigest: digest(
      record.randomizedPresentationPolicyDigest
    ),
    rubrics,
    candidates,
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    exportedAt: instant(record.exportedAt),
  });
  const bundle = Object.freeze({
    ...base,
    bundleDigest: digestAgentCanonicalValue(base),
  });
  const blindedArtifactSetDigest = digestAgentCanonicalValue(
    candidates.map(
      ({ randomizedPresentationId, rubricDigest, bytesDigest }) => ({
        randomizedPresentationId,
        rubricDigest,
        artifactDigest: bytesDigest,
      })
    )
  );
  if (
    bundle.blindedArtifactSetDigest !== blindedArtifactSetDigest ||
    !sameCanonicalJson(value, bundle)
  ) {
    return invalid();
  }
  boundedCanonicalBytes(bundle, maximumBlindBundleBytes);
  return bundle;
};

export const decodeAgentEvaluationHumanReviewSubmission = (
  value: unknown
): AgentEvaluationHumanReviewSubmission => {
  const record = exact(value, [
    'format',
    'version',
    'submissionId',
    'blindBundleDigest',
    'reviewLeaseDigest',
    'blindedArtifactSetDigest',
    'randomizedPresentationPolicyDigest',
    'sourceProvenance',
    'signedRatings',
    'adjudicationDecisions',
    'independenceRegistryDigest',
    'submittedAt',
    'submissionDigest',
  ]);
  if (
    record.format !== submissionFormat ||
    record.version !== 1 ||
    !Array.isArray(record.signedRatings) ||
    record.signedRatings.length < 1 ||
    record.signedRatings.length > maximumRatings ||
    !Array.isArray(record.adjudicationDecisions) ||
    record.adjudicationDecisions.length > maximumDecisions
  ) {
    return invalid();
  }
  const signedRatings = Object.freeze(
    record.signedRatings.map(parseSignedRating)
  );
  const adjudicationDecisions = Object.freeze(
    record.adjudicationDecisions.map(parseAdjudicationDecision)
  );
  if (
    new Set(signedRatings.map(({ ratingId }) => ratingId)).size !==
      signedRatings.length ||
    new Set(adjudicationDecisions.map(({ decisionId }) => decisionId)).size !==
      adjudicationDecisions.length ||
    !sameCanonicalJson(
      signedRatings.map(
        ({ randomizedPresentationId, reviewerAuthorityId }) =>
          `${randomizedPresentationId}\u0000${reviewerAuthorityId}`
      ),
      signedRatings
        .map(
          ({ randomizedPresentationId, reviewerAuthorityId }) =>
            `${randomizedPresentationId}\u0000${reviewerAuthorityId}`
        )
        .sort(compareUnicodeCodePoints)
    ) ||
    !sameCanonicalJson(
      adjudicationDecisions.map(
        ({ randomizedPresentationId }) => randomizedPresentationId
      ),
      adjudicationDecisions
        .map(({ randomizedPresentationId }) => randomizedPresentationId)
        .sort(compareUnicodeCodePoints)
    )
  ) {
    return invalid();
  }
  const base = Object.freeze({
    format: submissionFormat,
    version: 1 as const,
    submissionId: identity(record.submissionId),
    blindBundleDigest: digest(record.blindBundleDigest),
    reviewLeaseDigest: digest(record.reviewLeaseDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    randomizedPresentationPolicyDigest: digest(
      record.randomizedPresentationPolicyDigest
    ),
    sourceProvenance: sourceProvenance(record.sourceProvenance),
    signedRatings,
    adjudicationDecisions,
    independenceRegistryDigest: digest(record.independenceRegistryDigest),
    submittedAt: instant(record.submittedAt),
  });
  const submission = Object.freeze({
    ...base,
    submissionDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(value, submission)) return invalid();
  boundedCanonicalBytes(submission, maximumInboxDocumentBytes);
  return submission;
};

export const decodeAgentEvaluationHumanReviewIndependenceRegistry = (
  value: unknown
): AgentEvaluationHumanReviewIndependenceRegistry => {
  const record = exact(value, [
    'format',
    'version',
    'submissionId',
    'planDigest',
    'repositoryCommit',
    'planPlannedAt',
    'blindBundleDigest',
    'reviewLeaseDigest',
    'blindedArtifactSetDigest',
    'trustRegistryDigest',
    'adjudicationPolicyDigest',
    'attestations',
    'registryDigest',
  ]);
  if (
    record.format !== independenceRegistryFormat ||
    record.version !== 1 ||
    typeof record.repositoryCommit !== 'string' ||
    !commitPattern.test(record.repositoryCommit) ||
    !Array.isArray(record.attestations) ||
    record.attestations.length < 2 ||
    record.attestations.length > maximumAttestations
  ) {
    return invalid();
  }
  const attestations = Object.freeze(
    record.attestations.map(parseIndependenceAttestation)
  );
  if (
    new Set(attestations.map(({ attestationId }) => attestationId)).size !==
      attestations.length ||
    new Set(attestations.map(({ authorityId }) => authorityId)).size !==
      attestations.length ||
    !sameCanonicalJson(
      attestations.map(({ authorityId }) => authorityId),
      attestations
        .map(({ authorityId }) => authorityId)
        .sort(compareUnicodeCodePoints)
    )
  ) {
    return invalid();
  }
  const base = Object.freeze({
    format: independenceRegistryFormat,
    version: 1 as const,
    submissionId: identity(record.submissionId),
    planDigest: digest(record.planDigest),
    repositoryCommit: record.repositoryCommit,
    planPlannedAt: instant(record.planPlannedAt),
    blindBundleDigest: digest(record.blindBundleDigest),
    reviewLeaseDigest: digest(record.reviewLeaseDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    trustRegistryDigest: digest(record.trustRegistryDigest),
    adjudicationPolicyDigest: digest(record.adjudicationPolicyDigest),
    attestations,
  });
  const registry = Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(value, registry)) return invalid();
  boundedCanonicalBytes(registry, maximumInboxDocumentBytes);
  return registry;
};

const signatureMessage = <T extends object>(
  payload: T,
  digestName: string,
  valueDigest: string
): Uint8Array =>
  new TextEncoder().encode(
    canonicalJsonText(Object.freeze({ ...payload, [digestName]: valueDigest }))
  );

const verifyAuthoritySignature = (
  authority: AgentEvaluationHumanReviewTrustAuthority,
  payload: object,
  digestName: string,
  valueDigest: string,
  signatureBase64Url: string
): boolean => {
  let publicBytes: Buffer | undefined;
  let publicDer: Buffer | undefined;
  let signature: Buffer | undefined;
  let message: Uint8Array | undefined;
  try {
    if (
      !publicKeyPattern.test(authority.publicKeyBase64Url) ||
      !signaturePattern.test(signatureBase64Url)
    ) {
      return false;
    }
    publicBytes = Buffer.from(authority.publicKeyBase64Url, 'base64url');
    signature = Buffer.from(signatureBase64Url, 'base64url');
    if (
      publicBytes.byteLength !== 32 ||
      signature.byteLength !== 64 ||
      publicBytes.toString('base64url') !== authority.publicKeyBase64Url ||
      signature.toString('base64url') !== signatureBase64Url
    ) {
      return false;
    }
    publicDer = Buffer.concat([ed25519SpkiPrefix, publicBytes]);
    const publicKey = createPublicKey({
      format: 'der',
      type: 'spki',
      key: publicDer,
    });
    message = signatureMessage(payload, digestName, valueDigest);
    return verifyEd25519(null, message, publicKey, signature);
  } catch {
    return false;
  } finally {
    publicBytes?.fill(0);
    publicDer?.fill(0);
    signature?.fill(0);
    message?.fill(0);
  }
};

const testedOwnerSetDigest = (plan: AgentModelEvaluationPlan): string =>
  digestAgentCanonicalValue({
    format: 'prodivix.g4-tested-model-family-owner-set',
    version: 1,
    ownerIds: plan.modelConfigurations
      .map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
      .sort(compareUnicodeCodePoints),
  });

const emptyConflictOwnerSetDigest = digestAgentCanonicalValue({
  format: 'prodivix.g4-conflict-model-family-owner-set',
  version: 1,
  ownerIds: [],
});

const blindCandidateDigest = (
  candidate: AgentEvaluationBlindReviewBundle['candidates'][number]
): string => digestAgentCanonicalValue(candidate);

const ratingSetDigest = (
  ratings: readonly AgentEvaluationHumanReviewSignedRating[]
): string =>
  digestAgentCanonicalValue(
    ratings.map(({ ratingDigest, signatureBase64Url }) => ({
      ratingDigest,
      signatureBase64Url,
    }))
  );

const independenceSetDigest = (
  attestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[]
): string =>
  digestAgentCanonicalValue(
    attestations.map(({ attestationDigest, signatureBase64Url }) => ({
      attestationDigest,
      signatureBase64Url,
    }))
  );

const decisionSetDigest = (
  decisions: readonly AgentEvaluationHumanReviewAdjudicationDecision[]
): string =>
  digestAgentCanonicalValue(
    decisions.map(({ decisionDigest, signatureBase64Url }) => ({
      decisionDigest,
      signatureBase64Url,
    }))
  );

type CandidateAdjudication = AgentEvaluationHumanReviewCandidateAdjudication;

const parseCandidateAdjudication = (value: unknown): CandidateAdjudication => {
  const record = exact(
    value,
    [
      'randomizedPresentationId',
      'candidateDigest',
      'rubricDigest',
      'ratingDigests',
      'reviewerAuthorityIds',
      'criterionVerdicts',
      'verdict',
    ],
    ['decisionDigest']
  );
  if (!['failed', 'passed'].includes(String(record.verdict))) return invalid();
  const result = Object.freeze({
    randomizedPresentationId: identity(record.randomizedPresentationId),
    candidateDigest: digest(record.candidateDigest),
    rubricDigest: digest(record.rubricDigest),
    ratingDigests: sortedUniqueDigests(record.ratingDigests),
    reviewerAuthorityIds: sortedUniqueIdentities(record.reviewerAuthorityIds),
    criterionVerdicts: parseCriterionVerdicts(record.criterionVerdicts),
    verdict: record.verdict as 'failed' | 'passed',
    ...(record.decisionDigest === undefined
      ? {}
      : { decisionDigest: digest(record.decisionDigest) }),
  });
  if (
    result.verdict !==
      verdictForRequiredHumanReviewCriteria(result.criterionVerdicts) ||
    !sameCanonicalJson(value, result)
  ) {
    return invalid();
  }
  return result;
};

const parseCandidateAdjudications = (
  value: unknown
): readonly CandidateAdjudication[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumRatings
  ) {
    return invalid();
  }
  const results = Object.freeze(value.map(parseCandidateAdjudication));
  if (
    new Set(
      results.map(({ randomizedPresentationId }) => randomizedPresentationId)
    ).size !== results.length ||
    !sameCanonicalJson(
      results.map(({ randomizedPresentationId }) => randomizedPresentationId),
      results
        .map(({ randomizedPresentationId }) => randomizedPresentationId)
        .sort(compareUnicodeCodePoints)
    )
  ) {
    return invalid();
  }
  return results;
};

const adjudicationDigest = (
  policyDigest: string,
  candidates: readonly CandidateAdjudication[]
): string =>
  digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-adjudication-set',
    version: 1,
    policyDigest,
    candidates,
  });

const authorityAt = (
  config: AgentEvaluationProductionFrozenRunConfig,
  authorityId: string,
  keyId: string,
  role: 'reviewer' | 'adjudicator',
  instantValue: string
): AgentEvaluationHumanReviewTrustAuthority => {
  const authority = config.execution.humanReview.trustRegistry.authorities.find(
    (entry) =>
      entry.authorityId === authorityId &&
      entry.keyId === keyId &&
      entry.role === role
  );
  if (
    !authority ||
    Date.parse(instantValue) < Date.parse(authority.validFrom) ||
    Date.parse(instantValue) > Date.parse(authority.validUntil)
  ) {
    return signatureInvalid();
  }
  return authority;
};

const validateIndependence = (
  attestation: AgentEvaluationHumanReviewIndependenceAttestation,
  config: AgentEvaluationProductionFrozenRunConfig,
  blindedArtifactSetDigest: string,
  validatedAt: string
): void => {
  const authority = authorityAt(
    config,
    attestation.authorityId,
    attestation.keyId,
    attestation.role,
    attestation.issuedAt
  );
  if (
    attestation.planDigest !== config.plan.planDigest ||
    attestation.blindedArtifactSetDigest !== blindedArtifactSetDigest ||
    attestation.authorityPseudonym !== authority.pseudonym ||
    attestation.independencePolicyDigest !==
      config.execution.humanReview.adjudicationPolicy
        .independencePolicyDigest ||
    attestation.testedModelFamilyOwnerSetDigest !==
      testedOwnerSetDigest(config.plan) ||
    attestation.conflictModelFamilyOwnerSetDigest !==
      emptyConflictOwnerSetDigest ||
    Date.parse(attestation.issuedAt) < Date.parse(config.plan.plannedAt) ||
    Date.parse(attestation.expiresAt) <= Date.parse(validatedAt) ||
    !verifyAuthoritySignature(
      authority,
      agentEvaluationHumanReviewIndependencePayload(attestation),
      'attestationDigest',
      attestation.attestationDigest,
      attestation.signatureBase64Url
    )
  ) {
    signatureInvalid();
  }
};

const validateReviewAuthorities = (
  input: AgentEvaluationHumanReviewValidationInput
): Readonly<{
  candidateAdjudications: readonly CandidateAdjudication[];
  participatingAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
}> => {
  const { bundle, submission, independenceRegistry, config, validatedAt } =
    input;
  const humanReview = config.execution.humanReview;
  const candidateById = new Map(
    bundle.candidates.map((candidate) => [
      candidate.randomizedPresentationId,
      candidate,
    ])
  );
  const rubricByDigest = new Map(
    bundle.rubrics.map((rubric) => [rubric.rubricDigest, rubric])
  );
  const attestationByAuthority = new Map(
    independenceRegistry.attestations.map((attestation) => [
      attestation.authorityId,
      attestation,
    ])
  );
  const participatingAuthorities = new Set<string>();
  const ratingsByCandidate = new Map<
    string,
    AgentEvaluationHumanReviewSignedRating[]
  >();
  for (const rating of submission.signedRatings) {
    const candidate = candidateById.get(rating.randomizedPresentationId);
    const rubric = candidate
      ? rubricByDigest.get(candidate.rubricDigest)
      : undefined;
    const requiredCriterionIds = rubric?.criteria
      .filter(({ required }) => required)
      .map(({ criterionId }) => criterionId);
    const authority = authorityAt(
      config,
      rating.reviewerAuthorityId,
      rating.keyId,
      'reviewer',
      rating.ratedAt
    );
    if (
      !candidate ||
      !humanReview.reviewerAuthorityIds.includes(rating.reviewerAuthorityId) ||
      rating.reviewerPseudonym !== authority.pseudonym ||
      rating.rubricDigest !== candidate.rubricDigest ||
      !requiredCriterionIds ||
      !sameCanonicalJson(
        parseCriterionVerdicts(rating.criterionVerdicts, requiredCriterionIds),
        rating.criterionVerdicts
      ) ||
      rating.blindedArtifactSetDigest !== bundle.blindedArtifactSetDigest ||
      Date.parse(rating.ratedAt) < Date.parse(bundle.exportedAt) ||
      Date.parse(rating.ratedAt) > Date.parse(validatedAt) ||
      !verifyAuthoritySignature(
        authority,
        agentEvaluationHumanReviewRatingPayload(rating),
        'ratingDigest',
        rating.ratingDigest,
        rating.signatureBase64Url
      )
    ) {
      signatureInvalid();
    }
    participatingAuthorities.add(rating.reviewerAuthorityId);
    const ratings =
      ratingsByCandidate.get(rating.randomizedPresentationId) ?? [];
    ratings.push(rating);
    ratingsByCandidate.set(rating.randomizedPresentationId, ratings);
  }
  const decisionByCandidate = new Map(
    submission.adjudicationDecisions.map((decision) => [
      decision.randomizedPresentationId,
      decision,
    ])
  );
  const candidateAdjudications: CandidateAdjudication[] = [];
  let usesAdjudicator = false;
  for (const candidate of bundle.candidates) {
    const ratings =
      ratingsByCandidate.get(candidate.randomizedPresentationId) ?? [];
    const reviewerAuthorityIds = ratings
      .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
      .sort(compareUnicodeCodePoints);
    const ratingDigests = ratings
      .map(({ ratingDigest }) => ratingDigest)
      .sort(compareUnicodeCodePoints);
    const rubric =
      rubricByDigest.get(candidate.rubricDigest) ?? signatureInvalid();
    const requiredCriterionIds = rubric.criteria
      .filter(({ required }) => required)
      .map(({ criterionId }) => criterionId);
    const criterionVerdictSets = new Map(
      requiredCriterionIds.map((criterionId) => [
        criterionId,
        new Set(
          ratings.map(
            (rating) =>
              rating.criterionVerdicts.find(
                (entry) => entry.criterionId === criterionId
              )?.verdict
          )
        ),
      ])
    );
    const hasDisagreement = [...criterionVerdictSets.values()].some(
      (verdictSet) => verdictSet.size > 1
    );
    if (
      ratings.length < humanReview.minimumIndependentRatings ||
      new Set(reviewerAuthorityIds).size !== reviewerAuthorityIds.length
    ) {
      signatureInvalid();
    }
    const decision = decisionByCandidate.get(
      candidate.randomizedPresentationId
    );
    const candidateDigest = blindCandidateDigest(candidate);
    let criterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[];
    let verdict: 'failed' | 'passed';
    if (!hasDisagreement) {
      if (decision) signatureInvalid();
      criterionVerdicts = parseCriterionVerdicts(
        ratings[0]!.criterionVerdicts,
        requiredCriterionIds
      );
      verdict = verdictForRequiredHumanReviewCriteria(criterionVerdicts);
    } else {
      const adjudicationDecision = decision ?? signatureInvalid();
      usesAdjudicator = true;
      const policy = humanReview.adjudicationPolicy;
      const authority = authorityAt(
        config,
        adjudicationDecision.adjudicationAuthorityId,
        adjudicationDecision.keyId,
        'adjudicator',
        adjudicationDecision.decidedAt
      );
      if (
        adjudicationDecision.adjudicationAuthorityId !==
          policy.adjudicationAuthorityId ||
        adjudicationDecision.adjudicatorPseudonym !== authority.pseudonym ||
        adjudicationDecision.randomizedPresentationId !==
          candidate.randomizedPresentationId ||
        adjudicationDecision.rubricDigest !== candidate.rubricDigest ||
        adjudicationDecision.blindedArtifactSetDigest !==
          bundle.blindedArtifactSetDigest ||
        adjudicationDecision.candidateDigest !== candidateDigest ||
        adjudicationDecision.planDigest !== config.plan.planDigest ||
        adjudicationDecision.policyDigest !== policy.policyDigest ||
        !sameCanonicalJson(adjudicationDecision.ratingDigests, ratingDigests) ||
        !sameCanonicalJson(
          adjudicationDecision.reviewerAuthorityIds,
          reviewerAuthorityIds
        ) ||
        !sameCanonicalJson(
          parseCriterionVerdicts(
            adjudicationDecision.criterionVerdicts,
            requiredCriterionIds
          ),
          adjudicationDecision.criterionVerdicts
        ) ||
        Date.parse(adjudicationDecision.decidedAt) <
          Math.max(...ratings.map(({ ratedAt }) => Date.parse(ratedAt))) ||
        Date.parse(adjudicationDecision.decidedAt) > Date.parse(validatedAt) ||
        !verifyAuthoritySignature(
          authority,
          agentEvaluationHumanReviewAdjudicationPayload(adjudicationDecision),
          'decisionDigest',
          adjudicationDecision.decisionDigest,
          adjudicationDecision.signatureBase64Url
        )
      ) {
        signatureInvalid();
      }
      participatingAuthorities.add(
        adjudicationDecision.adjudicationAuthorityId
      );
      criterionVerdicts = adjudicationDecision.criterionVerdicts;
      verdict = verdictForRequiredHumanReviewCriteria(criterionVerdicts);
    }
    candidateAdjudications.push(
      Object.freeze({
        randomizedPresentationId: candidate.randomizedPresentationId,
        candidateDigest,
        rubricDigest: candidate.rubricDigest,
        ratingDigests: Object.freeze(ratingDigests),
        reviewerAuthorityIds: Object.freeze(reviewerAuthorityIds),
        criterionVerdicts,
        verdict,
        ...(decision ? { decisionDigest: decision.decisionDigest } : {}),
      })
    );
  }
  if (
    decisionByCandidate.size !== submission.adjudicationDecisions.length ||
    submission.adjudicationDecisions.length !==
      candidateAdjudications.filter(({ decisionDigest }) => decisionDigest)
        .length ||
    (usesAdjudicator &&
      participatingAuthorities.has(humanReview.adjudicationAuthorityId) ===
        false)
  ) {
    signatureInvalid();
  }
  const participatingAttestations = [...participatingAuthorities]
    .sort(compareUnicodeCodePoints)
    .map((authorityId) => {
      const attestation = attestationByAuthority.get(authorityId);
      if (!attestation) return signatureInvalid();
      validateIndependence(
        attestation,
        config,
        bundle.blindedArtifactSetDigest,
        validatedAt
      );
      return attestation;
    });
  if (
    participatingAttestations.length !==
    independenceRegistry.attestations.length
  ) {
    signatureInvalid();
  }
  return Object.freeze({
    candidateAdjudications: Object.freeze(candidateAdjudications),
    participatingAttestations: Object.freeze(participatingAttestations),
  });
};

const validateCrossBindings = (
  input: AgentEvaluationHumanReviewValidationInput
): Readonly<{
  adjudicationDigest: string;
  candidateAdjudications: readonly CandidateAdjudication[];
  participatingAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
}> => {
  const {
    bundle,
    submission,
    independenceRegistry,
    config,
    sourceProvenance,
    validatedAt,
  } = input;
  const humanReview = config.execution.humanReview;
  if (
    submission.submissionId !== independenceRegistry.submissionId ||
    submission.blindBundleDigest !== bundle.bundleDigest ||
    submission.reviewLeaseDigest !== bundle.reviewLeaseDigest ||
    submission.blindedArtifactSetDigest !== bundle.blindedArtifactSetDigest ||
    submission.randomizedPresentationPolicyDigest !==
      bundle.randomizedPresentationPolicyDigest ||
    !sameCanonicalJson(submission.sourceProvenance, sourceProvenance) ||
    submission.independenceRegistryDigest !==
      independenceRegistry.registryDigest ||
    independenceRegistry.planDigest !== config.plan.planDigest ||
    independenceRegistry.repositoryCommit !== config.plan.repositoryCommit ||
    independenceRegistry.planPlannedAt !== config.plan.plannedAt ||
    independenceRegistry.blindBundleDigest !== bundle.bundleDigest ||
    independenceRegistry.reviewLeaseDigest !== bundle.reviewLeaseDigest ||
    independenceRegistry.blindedArtifactSetDigest !==
      bundle.blindedArtifactSetDigest ||
    independenceRegistry.trustRegistryDigest !==
      humanReview.trustRegistry.registryDigest ||
    independenceRegistry.adjudicationPolicyDigest !==
      humanReview.adjudicationPolicy.policyDigest ||
    bundle.randomizedPresentationPolicyDigest !==
      humanReview.randomizedPresentationPolicyDigest ||
    !sameCanonicalJson(bundle.rubrics, humanReview.publicRubrics) ||
    Date.parse(bundle.exportedAt) < Date.parse(config.plan.plannedAt) ||
    Date.parse(submission.submittedAt) < Date.parse(bundle.exportedAt) ||
    Date.parse(submission.submittedAt) > Date.parse(validatedAt) ||
    Date.parse(validatedAt) > Date.parse(config.plan.expiresAt)
  ) {
    signatureInvalid();
  }
  const { candidateAdjudications, participatingAttestations } =
    validateReviewAuthorities(input);
  return Object.freeze({
    adjudicationDigest: adjudicationDigest(
      humanReview.adjudicationPolicy.policyDigest,
      candidateAdjudications
    ),
    candidateAdjudications,
    participatingAttestations,
  });
};

const validationReceipt = (
  input: Readonly<{
    submission: AgentEvaluationHumanReviewSubmission;
    independenceAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
    config: AgentEvaluationProductionFrozenRunConfig;
    sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
    candidateAdjudications: readonly CandidateAdjudication[];
    adjudicationDigest: string;
    validatedAt: string;
  }>
): AgentEvaluationHumanReviewValidationReceipt => {
  const base = Object.freeze({
    format: validationReceiptFormat,
    version: 1 as const,
    receiptId: `human-review-validation:${input.submission.submissionDigest.slice('sha256-'.length)}`,
    submissionId: input.submission.submissionId,
    submissionDigest: input.submission.submissionDigest,
    planDigest: input.config.plan.planDigest,
    repositoryCommit: input.config.plan.repositoryCommit,
    blindBundleDigest: input.submission.blindBundleDigest,
    reviewLeaseDigest: input.submission.reviewLeaseDigest,
    blindedArtifactSetDigest: input.submission.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      input.submission.randomizedPresentationPolicyDigest,
    sourceProvenance: input.sourceProvenance,
    trustRegistryDigest:
      input.config.execution.humanReview.trustRegistry.registryDigest,
    authoritySetDigest:
      input.config.execution.humanReview.trustRegistry.authoritySetDigest,
    adjudicationPolicyDigest:
      input.config.execution.humanReview.adjudicationPolicy.policyDigest,
    ratingSignatureSetDigest: ratingSetDigest(input.submission.signedRatings),
    independenceAttestationSetDigest: independenceSetDigest(
      input.independenceAttestations
    ),
    adjudicationDecisionSetDigest: decisionSetDigest(
      input.submission.adjudicationDecisions
    ),
    candidateAdjudications: input.candidateAdjudications,
    candidateAdjudicationSetDigest: digestAgentCanonicalValue(
      input.candidateAdjudications
    ),
    adjudicationDigest: input.adjudicationDigest,
    validatedAt: input.validatedAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const humanReviewPayload = (
  input: Readonly<{
    submission: AgentEvaluationHumanReviewSubmission;
    independenceAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
    config: AgentEvaluationProductionFrozenRunConfig;
    sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
    candidateAdjudications: readonly CandidateAdjudication[];
    adjudicationDigest: string;
    validatedAt: string;
  }>
): AgentEvaluationHumanReviewArtifactPayload => {
  const receipt = validationReceipt(input);
  return Object.freeze({
    format: outputFormat,
    version: 1 as const,
    planDigest: input.config.plan.planDigest,
    repositoryCommit: input.config.plan.repositoryCommit,
    blindBundleDigest: input.submission.blindBundleDigest,
    reviewLeaseDigest: input.submission.reviewLeaseDigest,
    blindedArtifactSetDigest: input.submission.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      input.submission.randomizedPresentationPolicyDigest,
    sourceProvenance: input.sourceProvenance,
    signedRatings: input.submission.signedRatings,
    independenceAttestations: input.independenceAttestations,
    adjudicationDecisions: input.submission.adjudicationDecisions,
    validationReceipt: receipt,
    reviewedAt: input.submission.submittedAt,
  });
};

/**
 * Verifies the blind bundle, frozen trust root, every raw reviewer signature,
 * independence evidence, and any required adjudicator decision before the
 * workflow authority signs the import wrapper.
 */
export const createAgentEvaluationHumanReviewValidationPayload = (
  input: AgentEvaluationHumanReviewValidationInput
): AgentEvaluationHumanReviewArtifactPayload => {
  const result = validateCrossBindings(input);
  return humanReviewPayload({
    submission: input.submission,
    independenceAttestations: result.participatingAttestations,
    config: input.config,
    sourceProvenance: input.sourceProvenance,
    candidateAdjudications: result.candidateAdjudications,
    adjudicationDigest: result.adjudicationDigest,
    validatedAt: input.validatedAt,
  });
};

const parseValidationReceipt = (
  value: unknown
): AgentEvaluationHumanReviewValidationReceipt => {
  const record = exact(value, [
    'format',
    'version',
    'receiptId',
    'submissionId',
    'submissionDigest',
    'planDigest',
    'repositoryCommit',
    'blindBundleDigest',
    'reviewLeaseDigest',
    'blindedArtifactSetDigest',
    'randomizedPresentationPolicyDigest',
    'sourceProvenance',
    'trustRegistryDigest',
    'authoritySetDigest',
    'adjudicationPolicyDigest',
    'ratingSignatureSetDigest',
    'independenceAttestationSetDigest',
    'adjudicationDecisionSetDigest',
    'candidateAdjudications',
    'candidateAdjudicationSetDigest',
    'adjudicationDigest',
    'validatedAt',
    'receiptDigest',
  ]);
  if (
    record.format !== validationReceiptFormat ||
    record.version !== 1 ||
    typeof record.repositoryCommit !== 'string' ||
    !commitPattern.test(record.repositoryCommit)
  ) {
    return invalid();
  }
  const receipt = Object.freeze({
    format: validationReceiptFormat,
    version: 1 as const,
    receiptId: identity(record.receiptId),
    submissionId: identity(record.submissionId),
    submissionDigest: digest(record.submissionDigest),
    planDigest: digest(record.planDigest),
    repositoryCommit: record.repositoryCommit,
    blindBundleDigest: digest(record.blindBundleDigest),
    reviewLeaseDigest: digest(record.reviewLeaseDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    randomizedPresentationPolicyDigest: digest(
      record.randomizedPresentationPolicyDigest
    ),
    sourceProvenance: sourceProvenance(record.sourceProvenance),
    trustRegistryDigest: digest(record.trustRegistryDigest),
    authoritySetDigest: digest(record.authoritySetDigest),
    adjudicationPolicyDigest: digest(record.adjudicationPolicyDigest),
    ratingSignatureSetDigest: digest(record.ratingSignatureSetDigest),
    independenceAttestationSetDigest: digest(
      record.independenceAttestationSetDigest
    ),
    adjudicationDecisionSetDigest: digest(record.adjudicationDecisionSetDigest),
    candidateAdjudications: parseCandidateAdjudications(
      record.candidateAdjudications
    ),
    candidateAdjudicationSetDigest: digest(
      record.candidateAdjudicationSetDigest
    ),
    adjudicationDigest: digest(record.adjudicationDigest),
    validatedAt: instant(record.validatedAt),
    receiptDigest: digest(record.receiptDigest),
  });
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  if (
    receipt.candidateAdjudicationSetDigest !==
      digestAgentCanonicalValue(receipt.candidateAdjudications) ||
    receipt.receiptDigest !== digestAgentCanonicalValue(base) ||
    !sameCanonicalJson(value, receipt)
  ) {
    return invalid();
  }
  return receipt;
};

const parseArtifactAuthority = (
  value: unknown
): AgentEvaluationHumanReviewImport['artifactAuthority'] => {
  const record = exact(value, [
    'authorityId',
    'keyId',
    'workflowName',
    'workflowRunId',
    'workflowRunAttempt',
    'signedAt',
    'payloadDigest',
    'signatureBase64Url',
  ]);
  if (record.workflowName !== workflowName) return invalid();
  const authority = Object.freeze({
    authorityId: identity(record.authorityId),
    keyId: identity(record.keyId),
    workflowName,
    workflowRunId: identity(record.workflowRunId),
    workflowRunAttempt: positiveInteger(record.workflowRunAttempt),
    signedAt: instant(record.signedAt),
    payloadDigest: digest(record.payloadDigest),
    signatureBase64Url: canonicalSignature(record.signatureBase64Url),
  });
  if (!sameCanonicalJson(value, authority)) return invalid();
  return authority;
};

export const humanReviewArtifactPayloadFromImport = (
  value: AgentEvaluationHumanReviewImport
): AgentEvaluationHumanReviewArtifactPayload =>
  Object.freeze({
    format: value.format,
    version: value.version,
    planDigest: value.planDigest,
    repositoryCommit: value.repositoryCommit,
    blindBundleDigest: value.blindBundleDigest,
    reviewLeaseDigest: value.reviewLeaseDigest,
    blindedArtifactSetDigest: value.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      value.randomizedPresentationPolicyDigest,
    sourceProvenance: value.sourceProvenance,
    signedRatings: value.signedRatings,
    independenceAttestations: value.independenceAttestations,
    adjudicationDecisions: value.adjudicationDecisions,
    validationReceipt: value.validationReceipt,
    reviewedAt: value.reviewedAt,
  });

export const decodeAgentEvaluationHumanReviewImport = (
  value: unknown
): AgentEvaluationHumanReviewImport => {
  const record = exact(value, [
    'format',
    'version',
    'planDigest',
    'repositoryCommit',
    'blindBundleDigest',
    'reviewLeaseDigest',
    'blindedArtifactSetDigest',
    'randomizedPresentationPolicyDigest',
    'sourceProvenance',
    'signedRatings',
    'independenceAttestations',
    'adjudicationDecisions',
    'validationReceipt',
    'reviewedAt',
    'artifactAuthority',
    'artifactDigest',
  ]);
  if (
    record.format !== outputFormat ||
    record.version !== 1 ||
    typeof record.repositoryCommit !== 'string' ||
    !commitPattern.test(record.repositoryCommit) ||
    !Array.isArray(record.signedRatings) ||
    record.signedRatings.length < 1 ||
    record.signedRatings.length > maximumRatings ||
    !Array.isArray(record.independenceAttestations) ||
    record.independenceAttestations.length < 2 ||
    record.independenceAttestations.length > maximumAttestations ||
    !Array.isArray(record.adjudicationDecisions) ||
    record.adjudicationDecisions.length > maximumDecisions
  ) {
    return invalid();
  }
  const artifact = Object.freeze({
    format: outputFormat,
    version: 1 as const,
    planDigest: digest(record.planDigest),
    repositoryCommit: record.repositoryCommit,
    blindBundleDigest: digest(record.blindBundleDigest),
    reviewLeaseDigest: digest(record.reviewLeaseDigest),
    blindedArtifactSetDigest: digest(record.blindedArtifactSetDigest),
    randomizedPresentationPolicyDigest: digest(
      record.randomizedPresentationPolicyDigest
    ),
    sourceProvenance: sourceProvenance(record.sourceProvenance),
    signedRatings: Object.freeze(record.signedRatings.map(parseSignedRating)),
    independenceAttestations: Object.freeze(
      record.independenceAttestations.map(parseIndependenceAttestation)
    ),
    adjudicationDecisions: Object.freeze(
      record.adjudicationDecisions.map(parseAdjudicationDecision)
    ),
    validationReceipt: parseValidationReceipt(record.validationReceipt),
    reviewedAt: instant(record.reviewedAt),
    artifactAuthority: parseArtifactAuthority(record.artifactAuthority),
    artifactDigest: digest(record.artifactDigest),
  });
  const payload = humanReviewArtifactPayloadFromImport(artifact);
  if (
    artifact.artifactAuthority.payloadDigest !==
      digestAgentCanonicalValue(payload) ||
    artifact.artifactDigest !==
      digestAgentCanonicalValue({
        ...payload,
        artifactAuthority: artifact.artifactAuthority,
      }) ||
    !sameCanonicalJson(value, artifact)
  ) {
    return invalid();
  }
  boundedCanonicalBytes(artifact, maximumInboxDocumentBytes);
  return artifact;
};

const verifyArtifactWrapper = (
  artifact: AgentEvaluationHumanReviewImport,
  config: AgentEvaluationProductionFrozenRunConfig
): boolean => {
  const authority = config.execution.humanReview.trustRegistry.authorities.find(
    (entry) =>
      entry.authorityId === artifact.artifactAuthority.authorityId &&
      entry.keyId === artifact.artifactAuthority.keyId &&
      entry.role === 'adjudicator'
  );
  if (
    !authority ||
    authority.authorityId !==
      config.execution.humanReview.adjudicationAuthorityId ||
    artifact.artifactAuthority.signedAt !==
      artifact.validationReceipt.validatedAt ||
    Date.parse(artifact.artifactAuthority.signedAt) <
      Date.parse(authority.validFrom) ||
    Date.parse(artifact.artifactAuthority.signedAt) >
      Date.parse(authority.validUntil)
  ) {
    return false;
  }
  let publicBytes: Buffer | undefined;
  let publicDer: Buffer | undefined;
  let signature: Buffer | undefined;
  let message: Uint8Array | undefined;
  try {
    publicBytes = Buffer.from(authority.publicKeyBase64Url, 'base64url');
    signature = Buffer.from(
      artifact.artifactAuthority.signatureBase64Url,
      'base64url'
    );
    if (publicBytes.byteLength !== 32 || signature.byteLength !== 64) {
      return false;
    }
    publicDer = Buffer.concat([ed25519SpkiPrefix, publicBytes]);
    const publicKey = createPublicKey({
      format: 'der',
      type: 'spki',
      key: publicDer,
    });
    message = new TextEncoder().encode(
      canonicalJsonText(humanReviewArtifactPayloadFromImport(artifact))
    );
    return verifyEd25519(null, message, publicKey, signature);
  } catch {
    return false;
  } finally {
    publicBytes?.fill(0);
    publicDer?.fill(0);
    signature?.fill(0);
    message?.fill(0);
  }
};

export const verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig =
  (
    artifact: AgentEvaluationHumanReviewImport,
    config: AgentEvaluationProductionFrozenRunConfig
  ): boolean => {
    try {
      const receipt = artifact.validationReceipt;
      const humanReview = config.execution.humanReview;
      const rubricByDigest = new Map(
        humanReview.publicRubrics.map((rubric) => [rubric.rubricDigest, rubric])
      );
      if (
        artifact.planDigest !== config.plan.planDigest ||
        artifact.repositoryCommit !== config.plan.repositoryCommit ||
        artifact.randomizedPresentationPolicyDigest !==
          humanReview.randomizedPresentationPolicyDigest ||
        receipt.planDigest !== artifact.planDigest ||
        receipt.repositoryCommit !== artifact.repositoryCommit ||
        receipt.blindBundleDigest !== artifact.blindBundleDigest ||
        receipt.blindedArtifactSetDigest !==
          artifact.blindedArtifactSetDigest ||
        receipt.randomizedPresentationPolicyDigest !==
          artifact.randomizedPresentationPolicyDigest ||
        !sameCanonicalJson(
          receipt.sourceProvenance,
          artifact.sourceProvenance
        ) ||
        receipt.trustRegistryDigest !==
          humanReview.trustRegistry.registryDigest ||
        receipt.authoritySetDigest !==
          humanReview.trustRegistry.authoritySetDigest ||
        receipt.adjudicationPolicyDigest !==
          humanReview.adjudicationPolicy.policyDigest ||
        receipt.ratingSignatureSetDigest !==
          ratingSetDigest(artifact.signedRatings) ||
        receipt.independenceAttestationSetDigest !==
          independenceSetDigest(artifact.independenceAttestations) ||
        receipt.adjudicationDecisionSetDigest !==
          decisionSetDigest(artifact.adjudicationDecisions) ||
        receipt.candidateAdjudicationSetDigest !==
          digestAgentCanonicalValue(receipt.candidateAdjudications) ||
        receipt.receiptId !==
          `human-review-validation:${receipt.submissionDigest.slice('sha256-'.length)}` ||
        Date.parse(artifact.reviewedAt) > Date.parse(receipt.validatedAt) ||
        Date.parse(receipt.validatedAt) > Date.parse(config.plan.expiresAt) ||
        !verifyArtifactWrapper(artifact, config)
      ) {
        return false;
      }
      const attestations = new Map(
        artifact.independenceAttestations.map((attestation) => [
          attestation.authorityId,
          attestation,
        ])
      );
      const participants = new Set<string>();
      const ratingsByCandidate = new Map<
        string,
        AgentEvaluationHumanReviewSignedRating[]
      >();
      for (const rating of artifact.signedRatings) {
        const rubric = rubricByDigest.get(rating.rubricDigest);
        const requiredCriterionIds = rubric?.criteria
          .filter(({ required }) => required)
          .map(({ criterionId }) => criterionId);
        const authority = authorityAt(
          config,
          rating.reviewerAuthorityId,
          rating.keyId,
          'reviewer',
          rating.ratedAt
        );
        if (
          !humanReview.reviewerAuthorityIds.includes(
            rating.reviewerAuthorityId
          ) ||
          rating.reviewerPseudonym !== authority.pseudonym ||
          rating.blindedArtifactSetDigest !==
            artifact.blindedArtifactSetDigest ||
          !requiredCriterionIds ||
          !sameCanonicalJson(
            parseCriterionVerdicts(
              rating.criterionVerdicts,
              requiredCriterionIds
            ),
            rating.criterionVerdicts
          ) ||
          Date.parse(rating.ratedAt) > Date.parse(receipt.validatedAt) ||
          !verifyAuthoritySignature(
            authority,
            agentEvaluationHumanReviewRatingPayload(rating),
            'ratingDigest',
            rating.ratingDigest,
            rating.signatureBase64Url
          )
        ) {
          return false;
        }
        participants.add(rating.reviewerAuthorityId);
        const entries =
          ratingsByCandidate.get(rating.randomizedPresentationId) ?? [];
        entries.push(rating);
        ratingsByCandidate.set(rating.randomizedPresentationId, entries);
      }
      const decisionByCandidate = new Map(
        artifact.adjudicationDecisions.map((decision) => [
          decision.randomizedPresentationId,
          decision,
        ])
      );
      if (decisionByCandidate.size !== artifact.adjudicationDecisions.length) {
        return false;
      }
      const reconstructed: CandidateAdjudication[] = [];
      for (const adjudication of receipt.candidateAdjudications) {
        const ratings =
          ratingsByCandidate.get(adjudication.randomizedPresentationId) ?? [];
        const ratingDigests = ratings
          .map(({ ratingDigest }) => ratingDigest)
          .sort(compareUnicodeCodePoints);
        const reviewerAuthorityIds = ratings
          .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
          .sort(compareUnicodeCodePoints);
        const rubricDigests = new Set(
          ratings.map(({ rubricDigest }) => rubricDigest)
        );
        const rubric = rubricByDigest.get(adjudication.rubricDigest);
        const requiredCriterionIds = rubric?.criteria
          .filter(({ required }) => required)
          .map(({ criterionId }) => criterionId);
        if (
          !requiredCriterionIds ||
          ratings.length < humanReview.minimumIndependentRatings ||
          new Set(reviewerAuthorityIds).size !== reviewerAuthorityIds.length ||
          rubricDigests.size !== 1 ||
          !rubricDigests.has(adjudication.rubricDigest) ||
          !sameCanonicalJson(adjudication.ratingDigests, ratingDigests) ||
          !sameCanonicalJson(
            adjudication.reviewerAuthorityIds,
            reviewerAuthorityIds
          ) ||
          !sameCanonicalJson(
            parseCriterionVerdicts(
              adjudication.criterionVerdicts,
              requiredCriterionIds
            ),
            adjudication.criterionVerdicts
          )
        ) {
          return false;
        }
        const hasDisagreement = requiredCriterionIds.some((criterionId) => {
          const values = new Set(
            ratings.map(
              (rating) =>
                rating.criterionVerdicts.find(
                  (entry) => entry.criterionId === criterionId
                )?.verdict
            )
          );
          return values.size > 1;
        });
        const decision = decisionByCandidate.get(
          adjudication.randomizedPresentationId
        );
        if (!hasDisagreement) {
          if (
            decision ||
            adjudication.decisionDigest !== undefined ||
            !sameCanonicalJson(
              adjudication.criterionVerdicts,
              ratings[0]!.criterionVerdicts
            ) ||
            adjudication.verdict !==
              verdictForRequiredHumanReviewCriteria(
                adjudication.criterionVerdicts
              )
          ) {
            return false;
          }
        } else {
          if (
            !decision ||
            adjudication.decisionDigest !== decision.decisionDigest ||
            adjudication.verdict !== decision.decision ||
            !sameCanonicalJson(
              adjudication.criterionVerdicts,
              decision.criterionVerdicts
            ) ||
            adjudication.candidateDigest !== decision.candidateDigest ||
            adjudication.rubricDigest !== decision.rubricDigest ||
            decision.blindedArtifactSetDigest !==
              artifact.blindedArtifactSetDigest ||
            decision.planDigest !== artifact.planDigest ||
            decision.policyDigest !==
              humanReview.adjudicationPolicy.policyDigest ||
            decision.adjudicationAuthorityId !==
              humanReview.adjudicationAuthorityId ||
            !sameCanonicalJson(decision.ratingDigests, ratingDigests) ||
            !sameCanonicalJson(
              decision.reviewerAuthorityIds,
              reviewerAuthorityIds
            )
          ) {
            return false;
          }
          const authority = authorityAt(
            config,
            decision.adjudicationAuthorityId,
            decision.keyId,
            'adjudicator',
            decision.decidedAt
          );
          if (
            decision.adjudicatorPseudonym !== authority.pseudonym ||
            Date.parse(decision.decidedAt) <
              Math.max(...ratings.map(({ ratedAt }) => Date.parse(ratedAt))) ||
            Date.parse(decision.decidedAt) > Date.parse(receipt.validatedAt) ||
            !verifyAuthoritySignature(
              authority,
              agentEvaluationHumanReviewAdjudicationPayload(decision),
              'decisionDigest',
              decision.decisionDigest,
              decision.signatureBase64Url
            )
          ) {
            return false;
          }
          participants.add(decision.adjudicationAuthorityId);
        }
        reconstructed.push(adjudication);
      }
      if (
        reconstructed.length !== ratingsByCandidate.size ||
        reconstructed.filter(({ decisionDigest }) => decisionDigest).length !==
          artifact.adjudicationDecisions.length ||
        receipt.adjudicationDigest !==
          adjudicationDigest(
            humanReview.adjudicationPolicy.policyDigest,
            reconstructed
          )
      ) {
        return false;
      }
      for (const authorityId of participants) {
        const attestation = attestations.get(authorityId);
        if (!attestation) return false;
        validateIndependence(
          attestation,
          config,
          artifact.blindedArtifactSetDigest,
          receipt.validatedAt
        );
      }
      return attestations.size === participants.size;
    } catch {
      return false;
    }
  };

/**
 * Re-verifies the persisted wrapper, normalized report, frozen public rubric,
 * trust registry, adjudication policy, and every retained Ed25519 authority
 * record. Finalization calls this boundary after reloading the admitted config.
 */
export const verifyProductionAgentEvaluationValidatedHumanReviewArtifact = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    artifact: AgentEvaluationValidatedHumanReviewArtifact;
    humanReviewReport: AgentHumanReviewReport;
    config: AgentEvaluationProductionFrozenRunConfig;
  }>
): boolean => {
  const humanReview = input.config.execution.humanReview;
  return (
    sameCanonicalJson(input.config.plan, input.plan) &&
    isAgentHumanReviewReport(input.humanReviewReport) &&
    isAgentEvaluationValidatedHumanReviewArtifact(
      input.artifact,
      input.humanReviewReport
    ) &&
    input.artifact.planDigest === input.plan.planDigest &&
    input.artifact.repositoryCommit === input.plan.repositoryCommit &&
    sameCanonicalJson(
      input.artifact.publicRubrics,
      humanReview.publicRubrics
    ) &&
    sameCanonicalJson(
      input.artifact.trustRegistry,
      humanReview.trustRegistry
    ) &&
    sameCanonicalJson(
      input.artifact.adjudicationPolicy,
      humanReview.adjudicationPolicy
    ) &&
    input.artifact.reviewArtifact.randomizedPresentationPolicyDigest ===
      humanReview.randomizedPresentationPolicyDigest &&
    verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig(
      input.artifact.reviewArtifact,
      input.config
    )
  );
};

const environmentReader = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const signedWrapper = async (
  input: Readonly<{
    payload: AgentEvaluationHumanReviewArtifactPayload;
    config: AgentEvaluationProductionFrozenRunConfig;
    environment: AgentEvaluationEnvironmentReader;
    signedAt: string;
  }>
): Promise<AgentEvaluationHumanReviewImport> => {
  const humanReview = input.config.execution.humanReview;
  const adjudicator = humanReview.trustRegistry.authorities.find(
    ({ authorityId, role }) =>
      authorityId === humanReview.adjudicationAuthorityId &&
      role === 'adjudicator'
  );
  const runtimeWorkflowName = input.environment(
    AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES.workflowName
  );
  const runtimeWorkflowRunId = input.environment(
    AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES.workflowRunId
  );
  const runtimeWorkflowRunAttempt = input.environment(
    AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES.workflowRunAttempt
  );
  if (
    !adjudicator ||
    runtimeWorkflowName !== workflowName ||
    !isAgentControlIdentity(runtimeWorkflowRunId) ||
    typeof runtimeWorkflowRunAttempt !== 'string' ||
    !/^[1-9][0-9]*$/u.test(runtimeWorkflowRunAttempt)
  ) {
    return invalid();
  }
  const runAttempt = Number(runtimeWorkflowRunAttempt);
  if (!Number.isSafeInteger(runAttempt)) return invalid();
  let privateKeySource: string | undefined;
  let privateText: Uint8Array | undefined;
  let privateDer: Buffer | undefined;
  let derivedPublicDer: Buffer | undefined;
  let expectedPublic: Buffer | undefined;
  let privateKey: KeyObject | undefined;
  const sign = (message: Uint8Array): string => {
    let signature: Buffer | undefined;
    try {
      privateKeySource = input.environment(
        AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES.privateKey
      );
      if (
        typeof privateKeySource !== 'string' ||
        !privateKeyPattern.test(privateKeySource)
      ) {
        return secretUnavailable();
      }
      privateText = new TextEncoder().encode(privateKeySource);
      privateDer = Buffer.from(privateKeySource, 'base64url');
      privateKeySource = undefined;
      if (
        privateDer.byteLength !== 48 ||
        !timingSafeEqual(
          privateDer.subarray(0, ed25519Pkcs8Prefix.byteLength),
          ed25519Pkcs8Prefix
        )
      ) {
        return secretUnavailable();
      }
      privateKey = createPrivateKey({
        format: 'der',
        type: 'pkcs8',
        key: privateDer,
      });
      const publicKey = createPublicKey(
        privateKey as unknown as Parameters<typeof createPublicKey>[0]
      );
      derivedPublicDer = publicKey.export({ format: 'der', type: 'spki' });
      expectedPublic = Buffer.from(adjudicator.publicKeyBase64Url, 'base64url');
      if (
        derivedPublicDer.byteLength !== ed25519SpkiPrefix.byteLength + 32 ||
        expectedPublic.byteLength !== 32 ||
        !timingSafeEqual(
          derivedPublicDer.subarray(ed25519SpkiPrefix.byteLength),
          expectedPublic
        )
      ) {
        return secretUnavailable();
      }
      signature = signEd25519(null, message, privateKey);
      if (
        signature.byteLength !== 64 ||
        !verifyEd25519(null, message, publicKey, signature)
      ) {
        return signatureInvalid();
      }
      return signature.toString('base64url');
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return secretUnavailable();
    } finally {
      privateKeySource = undefined;
      privateDer?.fill(0);
      derivedPublicDer?.fill(0);
      expectedPublic?.fill(0);
      signature?.fill(0);
      privateKey = undefined;
    }
  };
  try {
    const artifact = await createSignedAgentEvaluationHumanReviewImport({
      payload: input.payload,
      authority: Object.freeze({
        authorityId: adjudicator.authorityId,
        keyId: adjudicator.keyId,
        workflowName,
        workflowRunId: runtimeWorkflowRunId,
        workflowRunAttempt: runAttempt,
        signedAt: input.signedAt,
      }),
      sign,
    });
    if (
      !verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig(
        artifact,
        input.config
      ) ||
      (privateText !== undefined &&
        valueContainsCredentialCanary(
          artifact,
          privateText,
          createCredentialCanarySignatures(privateText)
        ))
    ) {
      return signatureInvalid();
    }
    return artifact;
  } finally {
    privateText?.fill(0);
  }
};

const canonicalInboxFile = (
  inboxRoot: string,
  submissionId: string,
  name: 'human-review-submission.json' | 'independence-registry.json'
): string => {
  if (!isAbsolute(inboxRoot) || !isAgentControlIdentity(submissionId)) {
    return invalid();
  }
  const root = resolve(inboxRoot);
  const path = resolve(root, submissionId, name);
  const displacement = relative(root, path);
  if (
    displacement.length < 1 ||
    displacement === '..' ||
    displacement.startsWith(`..${sep}`) ||
    isAbsolute(displacement)
  ) {
    return invalid();
  }
  return path;
};

const expectedSourceProvenance = (
  input: AgentEvaluationValidateReviewCommand
): AgentEvaluationHumanReviewSourceProvenance =>
  sourceProvenance({
    sourceRunId: input.sourceRunId,
    sourceRunAttempt: input.sourceRunAttempt,
    sourceArtifactName: input.sourceArtifactName,
    sourceArtifactDigest: input.sourceArtifactDigest,
  });

const loadReviewConfig = async (
  input: Readonly<{
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    configPath: string;
    registry: AgentEvaluationHumanReviewIndependenceRegistry;
    expectedRepositoryCommit: string;
  }>
): Promise<AgentEvaluationProductionFrozenRunConfig> => {
  const loaded = await loadProductionAgentEvaluationRunConfigArtifact({
    files: input.files,
    environment: input.environment,
    expectedRepositoryCommit: input.expectedRepositoryCommit,
    expectedPlanDigest: input.registry.planDigest,
    observedAt: input.registry.planPlannedAt,
  });
  if (loaded.absolutePath !== input.configPath) return invalid();
  return loaded.config;
};

export type ProductionAgentEvaluationReviewValidationOptions = Readonly<{
  files: AgentEvaluationCoordinatorFilePort;
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  now?: () => string;
}>;

/** Produces one independently signed, offline-reverifiable human-review artifact. */
export class ProductionAgentEvaluationReviewValidationService implements AgentEvaluationReviewValidationService {
  readonly #files: AgentEvaluationCoordinatorFilePort;
  readonly #environment: AgentEvaluationEnvironmentReader;
  readonly #now: () => string;

  constructor(options: ProductionAgentEvaluationReviewValidationOptions) {
    if (typeof options.files.readCanonicalJson !== 'function') invalid();
    this.#files = options.files;
    this.#environment = environmentReader(options.environment ?? process.env);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async validate(
    input: AgentEvaluationValidateReviewCommand
  ): Promise<AgentEvaluationHumanReviewImport> {
    try {
      const expectedCommit = this.#environment(
        AGENT_EVALUATION_HUMAN_REVIEW_ENVIRONMENT_NAMES.repositoryCommit
      );
      if (
        typeof expectedCommit !== 'string' ||
        !commitPattern.test(expectedCommit)
      ) {
        return invalid();
      }
      const readCanonical = this.#files.readCanonicalJson!;
      const [bundleRaw, submissionRaw, registryRaw] = await Promise.all([
        readCanonical.call(this.#files, input.reviewBundlePath),
        readCanonical.call(
          this.#files,
          canonicalInboxFile(
            input.inboxRoot,
            input.submissionId,
            'human-review-submission.json'
          )
        ),
        readCanonical.call(
          this.#files,
          canonicalInboxFile(
            input.inboxRoot,
            input.submissionId,
            'independence-registry.json'
          )
        ),
      ]);
      const bundle = decodeAgentEvaluationBlindReviewBundle(bundleRaw);
      const submission =
        decodeAgentEvaluationHumanReviewSubmission(submissionRaw);
      const registry =
        decodeAgentEvaluationHumanReviewIndependenceRegistry(registryRaw);
      if (
        submission.submissionId !== input.submissionId ||
        registry.submissionId !== input.submissionId
      ) {
        return invalid();
      }
      const config = await loadReviewConfig({
        files: this.#files,
        environment: this.#environment,
        configPath: input.configPath,
        registry,
        expectedRepositoryCommit: expectedCommit,
      });
      const validatedAt = instant(this.#now());
      const source = expectedSourceProvenance(input);
      const payload = createAgentEvaluationHumanReviewValidationPayload({
        bundle,
        submission,
        independenceRegistry: registry,
        config,
        sourceProvenance: source,
        validatedAt,
      });
      const artifact = await signedWrapper({
        payload,
        config,
        environment: this.#environment,
        signedAt: validatedAt,
      });
      boundedCanonicalBytes(
        artifact,
        config.execution.humanReview.artifactMaximumBytes
      );
      await this.#files.createCanonicalJson(input.outputPath, artifact);
      return artifact;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      return invalid();
    }
  }
}

export const createProductionAgentEvaluationReviewValidationService = (
  options: ProductionAgentEvaluationReviewValidationOptions
): ProductionAgentEvaluationReviewValidationService =>
  new ProductionAgentEvaluationReviewValidationService(options);

export type ProductionAgentEvaluationHumanReviewImportVerifierOptions =
  Readonly<{
    files: Pick<AgentEvaluationCoordinatorFilePort, 'readCanonicalJson'>;
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  }>;

/** Reloads frozen trust and re-verifies every human signature during import/finalize. */
export class ProductionAgentEvaluationHumanReviewImportVerifier implements AgentEvaluationHumanReviewImportVerifier {
  readonly #files: Pick<
    AgentEvaluationCoordinatorFilePort,
    'readCanonicalJson'
  >;
  readonly #environment: AgentEvaluationEnvironmentReader;

  constructor(
    options: ProductionAgentEvaluationHumanReviewImportVerifierOptions
  ) {
    this.#files = options.files;
    this.#environment = environmentReader(options.environment ?? process.env);
  }

  async verify(input: {
    plan: AgentModelEvaluationPlan;
    artifact: AgentEvaluationHumanReviewImport;
  }): Promise<AgentEvaluationHumanReviewAuthorityContext | undefined> {
    try {
      const config = (
        await loadProductionAgentEvaluationRunConfigArtifact({
          files: this.#files,
          environment: this.#environment,
          expectedRepositoryCommit: input.plan.repositoryCommit,
          expectedPlanDigest: input.plan.planDigest,
          expectedPlan: input.plan,
          observedAt: input.plan.plannedAt,
        })
      ).config;
      if (
        sameCanonicalJson(config.plan, input.plan) &&
        input.artifact.planDigest === input.plan.planDigest &&
        input.artifact.repositoryCommit === input.plan.repositoryCommit &&
        verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig(
          input.artifact,
          config
        )
      ) {
        return Object.freeze({
          publicRubrics: config.execution.humanReview.publicRubrics,
          trustRegistry: config.execution.humanReview.trustRegistry,
          adjudicationPolicy: config.execution.humanReview.adjudicationPolicy,
          randomizedPresentationPolicyDigest:
            config.execution.humanReview.randomizedPresentationPolicyDigest,
        });
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}

export const createProductionAgentEvaluationHumanReviewImportVerifier = (
  options: ProductionAgentEvaluationHumanReviewImportVerifierOptions
): ProductionAgentEvaluationHumanReviewImportVerifier =>
  new ProductionAgentEvaluationHumanReviewImportVerifier(options);
