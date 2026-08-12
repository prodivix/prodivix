import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { AgentJsonValue } from '../domain/agent.types';
import type { AgentHumanReviewReport } from './agentEvaluation.types';
import { isAgentHumanReviewReport } from './agentEvaluationResults';
import {
  normalizeAgentEvaluationHumanReviewCriterionVerdicts,
  validateAgentEvaluationPublicReviewRubric,
  verdictForRequiredHumanReviewCriteria,
  type AgentEvaluationHumanReviewCriterionVerdict,
  type AgentEvaluationPublicReviewRubric,
} from './agentEvaluationHumanReviewRubric';

export const AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT =
  'prodivix.g4-model-evaluation-human-review-import' as const;
export const AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT =
  'prodivix.agent-evaluation-validated-human-review-artifact' as const;
export const AGENT_EVALUATION_HUMAN_REVIEW_ARTIFACT_MAXIMUM_BYTES = 16_777_216;
export const AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_MAXIMUM_BYTES = 16_842_752;
export const AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS =
  Object.freeze([
    'adjudicationAuthorityId',
    'adjudicatorPseudonym',
    'blindedArtifactSetDigest',
    'candidateDigest',
    'criterionVerdicts',
    'decidedAt',
    'decision',
    'decisionId',
    'format',
    'keyId',
    'planDigest',
    'policyDigest',
    'randomizedPresentationId',
    'ratingDigests',
    'reviewerAuthorityIds',
    'rubricDigest',
    'version',
  ] as const);

export type AgentEvaluationHumanReviewSourceProvenance = Readonly<{
  sourceRunId: string;
  sourceRunAttempt: number;
  sourceArtifactName: string;
  /** GitHub REST artifact digest; it intentionally uses the sha256: namespace. */
  sourceArtifactDigest: string;
}>;

export type AgentEvaluationHumanReviewSignedRating = Readonly<{
  format: 'prodivix.g4-human-review-signed-rating';
  version: 1;
  ratingId: string;
  randomizedPresentationId: string;
  rubricDigest: string;
  blindedArtifactSetDigest: string;
  reviewerAuthorityId: string;
  reviewerPseudonym: string;
  keyId: string;
  criterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[];
  verdict: 'failed' | 'passed';
  ratedAt: string;
  ratingDigest: string;
  signatureBase64Url: string;
}>;

export type AgentEvaluationHumanReviewIndependenceAttestation = Readonly<{
  format: 'prodivix.g4-human-review-independence-attestation';
  version: 1;
  attestationId: string;
  planDigest: string;
  blindedArtifactSetDigest: string;
  authorityId: string;
  authorityPseudonym: string;
  role: 'reviewer' | 'adjudicator';
  keyId: string;
  independencePolicyDigest: string;
  testedModelFamilyOwnerSetDigest: string;
  conflictModelFamilyOwnerSetDigest: string;
  issuedAt: string;
  expiresAt: string;
  attestationDigest: string;
  signatureBase64Url: string;
}>;

export type AgentEvaluationHumanReviewAdjudicationDecision = Readonly<{
  format: 'prodivix.g4-human-review-adjudication-decision';
  version: 1;
  decisionId: string;
  randomizedPresentationId: string;
  rubricDigest: string;
  blindedArtifactSetDigest: string;
  adjudicationAuthorityId: string;
  adjudicatorPseudonym: string;
  keyId: string;
  candidateDigest: string;
  planDigest: string;
  policyDigest: string;
  ratingDigests: readonly string[];
  reviewerAuthorityIds: readonly string[];
  criterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[];
  decision: 'failed' | 'passed';
  decidedAt: string;
  decisionDigest: string;
  signatureBase64Url: string;
}>;

export type AgentEvaluationHumanReviewCandidateAdjudication = Readonly<{
  randomizedPresentationId: string;
  candidateDigest: string;
  rubricDigest: string;
  ratingDigests: readonly string[];
  reviewerAuthorityIds: readonly string[];
  criterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[];
  verdict: 'failed' | 'passed';
  decisionDigest?: string;
}>;

export type AgentEvaluationHumanReviewValidationReceipt = Readonly<{
  format: 'prodivix.g4-human-review-validation-receipt';
  version: 1;
  receiptId: string;
  submissionId: string;
  submissionDigest: string;
  planDigest: string;
  repositoryCommit: string;
  blindBundleDigest: string;
  reviewLeaseDigest: string;
  blindedArtifactSetDigest: string;
  randomizedPresentationPolicyDigest: string;
  sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
  trustRegistryDigest: string;
  authoritySetDigest: string;
  adjudicationPolicyDigest: string;
  ratingSignatureSetDigest: string;
  independenceAttestationSetDigest: string;
  adjudicationDecisionSetDigest: string;
  candidateAdjudications: readonly AgentEvaluationHumanReviewCandidateAdjudication[];
  candidateAdjudicationSetDigest: string;
  adjudicationDigest: string;
  validatedAt: string;
  receiptDigest: string;
}>;

export type AgentEvaluationHumanReviewArtifactAuthority = Readonly<{
  authorityId: string;
  keyId: string;
  workflowName: 'g4-real-model-human-review';
  workflowRunId: string;
  workflowRunAttempt: number;
  signedAt: string;
  payloadDigest: string;
  signatureBase64Url: string;
}>;

export type AgentEvaluationHumanReviewImport = Readonly<{
  format: typeof AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT;
  version: 1;
  planDigest: string;
  repositoryCommit: string;
  blindBundleDigest: string;
  reviewLeaseDigest: string;
  blindedArtifactSetDigest: string;
  randomizedPresentationPolicyDigest: string;
  sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
  signedRatings: readonly AgentEvaluationHumanReviewSignedRating[];
  independenceAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
  adjudicationDecisions: readonly AgentEvaluationHumanReviewAdjudicationDecision[];
  validationReceipt: AgentEvaluationHumanReviewValidationReceipt;
  reviewedAt: string;
  artifactAuthority: AgentEvaluationHumanReviewArtifactAuthority;
  artifactDigest: string;
}>;

export type AgentEvaluationHumanReviewArtifactPayload = Omit<
  AgentEvaluationHumanReviewImport,
  'artifactAuthority' | 'artifactDigest'
>;

export type AgentEvaluationHumanReviewTrustAuthority = Readonly<{
  authorityId: string;
  pseudonym: string;
  role: 'reviewer' | 'adjudicator';
  keyId: string;
  publicKeyBase64Url: string;
  validFrom: string;
  validUntil: string;
  independencePolicyDigest: string;
  authorityDigest: string;
}>;

/** Frozen public Ed25519 trust root; private key material is never represented. */
export type AgentEvaluationHumanReviewTrustRegistry = Readonly<{
  format: 'prodivix.g4-human-review-trust-registry';
  version: 1;
  registryId: string;
  authorities: readonly AgentEvaluationHumanReviewTrustAuthority[];
  authoritySetDigest: string;
  registryDigest: string;
}>;

export type AgentEvaluationHumanReviewAdjudicationPolicy = Readonly<{
  minimumIndependentRatings: number;
  reviewerAuthorityIds: readonly string[];
  adjudicationAuthorityId: string;
  adjudicatorKeyId: string;
  trigger: 'reviewer-disagreement';
  trustRegistryDigest: string;
  independencePolicyDigest: string;
  consensusRule: 'unanimous';
  disagreementRule: 'escalate-to-independent-adjudicator';
  reviewerRatingSignaturesRequired: true;
  adjudicatorDecisionSignatureRequired: true;
  signatureAlgorithm: 'Ed25519';
  decisionPayloadFields: readonly string[];
  policyDigest: string;
}>;

/** Durable raw signatures plus the normalized report they authorized. */
export type AgentEvaluationValidatedHumanReviewArtifact = Readonly<{
  format: typeof AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT;
  version: 1;
  artifactId: string;
  planDigest: string;
  repositoryCommit: string;
  reviewArtifact: AgentEvaluationHumanReviewImport;
  reviewArtifactDigest: string;
  reviewLeaseDigest: string;
  humanReviewReportDigest: string;
  publicRubrics: readonly AgentEvaluationPublicReviewRubric[];
  trustRegistry: AgentEvaluationHumanReviewTrustRegistry;
  adjudicationPolicy: AgentEvaluationHumanReviewAdjudicationPolicy;
  validatedAt: string;
  artifactDigest: string;
}>;

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const signaturePattern = /^[A-Za-z0-9_-]{86}$/u;
const githubArtifactDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const canonicalEd25519PublicKeyPattern =
  /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (
    !isPlainObject(value) ||
    Object.getOwnPropertySymbols(value).length > 0 ||
    Object.keys(value).some(isUnsafeObjectKey)
  ) {
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key)) &&
    keys.length >= required.length &&
    keys.length <= allowed.size
  );
};

const isIdentity = (value: unknown): value is string =>
  typeof value === 'string' && identityPattern.test(value);
const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && isAgentCanonicalDigest(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' &&
  instantPattern.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const isSignature = (value: unknown): value is string =>
  typeof value === 'string' && signaturePattern.test(value);
const isPositiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isSortedUnique = (
  values: unknown,
  predicate: (value: unknown) => value is string
): values is readonly string[] =>
  Array.isArray(values) &&
  values.length > 0 &&
  values.every(predicate) &&
  new Set(values).size === values.length &&
  sameCanonicalJson([...values].sort(compareUnicodeCodePoints), values);

const isSourceProvenance = (
  value: unknown
): value is AgentEvaluationHumanReviewSourceProvenance =>
  exact(value, [
    'sourceRunId',
    'sourceRunAttempt',
    'sourceArtifactName',
    'sourceArtifactDigest',
  ]) &&
  typeof value.sourceRunId === 'string' &&
  /^[1-9][0-9]*$/u.test(value.sourceRunId) &&
  Number.isSafeInteger(Number(value.sourceRunId)) &&
  isPositiveInteger(value.sourceRunAttempt) &&
  isIdentity(value.sourceArtifactName) &&
  typeof value.sourceArtifactDigest === 'string' &&
  githubArtifactDigestPattern.test(value.sourceArtifactDigest);

export const agentEvaluationHumanReviewRatingPayload = (
  rating: AgentEvaluationHumanReviewSignedRating
): Omit<
  AgentEvaluationHumanReviewSignedRating,
  'ratingDigest' | 'signatureBase64Url'
> =>
  Object.freeze({
    format: rating.format,
    version: rating.version,
    ratingId: rating.ratingId,
    randomizedPresentationId: rating.randomizedPresentationId,
    rubricDigest: rating.rubricDigest,
    blindedArtifactSetDigest: rating.blindedArtifactSetDigest,
    reviewerAuthorityId: rating.reviewerAuthorityId,
    reviewerPseudonym: rating.reviewerPseudonym,
    keyId: rating.keyId,
    criterionVerdicts: rating.criterionVerdicts,
    verdict: rating.verdict,
    ratedAt: rating.ratedAt,
  });

const isSignedRating = (
  value: unknown
): value is AgentEvaluationHumanReviewSignedRating =>
  exact(value, [
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
  ]) &&
  value.format === 'prodivix.g4-human-review-signed-rating' &&
  value.version === 1 &&
  isIdentity(value.ratingId) &&
  isIdentity(value.randomizedPresentationId) &&
  isDigest(value.rubricDigest) &&
  isDigest(value.blindedArtifactSetDigest) &&
  isIdentity(value.reviewerAuthorityId) &&
  isIdentity(value.reviewerPseudonym) &&
  isIdentity(value.keyId) &&
  (() => {
    try {
      return sameCanonicalJson(
        normalizeAgentEvaluationHumanReviewCriterionVerdicts(
          value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
        ),
        value.criterionVerdicts
      );
    } catch {
      return false;
    }
  })() &&
  (value.verdict === 'failed' || value.verdict === 'passed') &&
  value.verdict ===
    verdictForRequiredHumanReviewCriteria(
      value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
    ) &&
  isInstant(value.ratedAt) &&
  isDigest(value.ratingDigest) &&
  isSignature(value.signatureBase64Url) &&
  value.ratingDigest ===
    digestAgentCanonicalValue(
      agentEvaluationHumanReviewRatingPayload(
        value as AgentEvaluationHumanReviewSignedRating
      )
    );

export const agentEvaluationHumanReviewIndependencePayload = (
  attestation: AgentEvaluationHumanReviewIndependenceAttestation
): Omit<
  AgentEvaluationHumanReviewIndependenceAttestation,
  'attestationDigest' | 'signatureBase64Url'
> =>
  Object.freeze({
    format: attestation.format,
    version: attestation.version,
    attestationId: attestation.attestationId,
    planDigest: attestation.planDigest,
    blindedArtifactSetDigest: attestation.blindedArtifactSetDigest,
    authorityId: attestation.authorityId,
    authorityPseudonym: attestation.authorityPseudonym,
    role: attestation.role,
    keyId: attestation.keyId,
    independencePolicyDigest: attestation.independencePolicyDigest,
    testedModelFamilyOwnerSetDigest:
      attestation.testedModelFamilyOwnerSetDigest,
    conflictModelFamilyOwnerSetDigest:
      attestation.conflictModelFamilyOwnerSetDigest,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
  });

const isIndependenceAttestation = (
  value: unknown
): value is AgentEvaluationHumanReviewIndependenceAttestation =>
  exact(value, [
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
  ]) &&
  value.format === 'prodivix.g4-human-review-independence-attestation' &&
  value.version === 1 &&
  isIdentity(value.attestationId) &&
  isDigest(value.planDigest) &&
  isDigest(value.blindedArtifactSetDigest) &&
  isIdentity(value.authorityId) &&
  isIdentity(value.authorityPseudonym) &&
  (value.role === 'reviewer' || value.role === 'adjudicator') &&
  isIdentity(value.keyId) &&
  isDigest(value.independencePolicyDigest) &&
  isDigest(value.testedModelFamilyOwnerSetDigest) &&
  isDigest(value.conflictModelFamilyOwnerSetDigest) &&
  isInstant(value.issuedAt) &&
  isInstant(value.expiresAt) &&
  Date.parse(value.expiresAt) > Date.parse(value.issuedAt) &&
  isDigest(value.attestationDigest) &&
  isSignature(value.signatureBase64Url) &&
  value.attestationDigest ===
    digestAgentCanonicalValue(
      agentEvaluationHumanReviewIndependencePayload(
        value as AgentEvaluationHumanReviewIndependenceAttestation
      )
    );

export const agentEvaluationHumanReviewAdjudicationPayload = (
  decision: AgentEvaluationHumanReviewAdjudicationDecision
): Omit<
  AgentEvaluationHumanReviewAdjudicationDecision,
  'decisionDigest' | 'signatureBase64Url'
> =>
  Object.freeze({
    format: decision.format,
    version: decision.version,
    decisionId: decision.decisionId,
    randomizedPresentationId: decision.randomizedPresentationId,
    rubricDigest: decision.rubricDigest,
    blindedArtifactSetDigest: decision.blindedArtifactSetDigest,
    adjudicationAuthorityId: decision.adjudicationAuthorityId,
    adjudicatorPseudonym: decision.adjudicatorPseudonym,
    keyId: decision.keyId,
    candidateDigest: decision.candidateDigest,
    planDigest: decision.planDigest,
    policyDigest: decision.policyDigest,
    ratingDigests: decision.ratingDigests,
    reviewerAuthorityIds: decision.reviewerAuthorityIds,
    criterionVerdicts: decision.criterionVerdicts,
    decision: decision.decision,
    decidedAt: decision.decidedAt,
  });

const isAdjudicationDecision = (
  value: unknown
): value is AgentEvaluationHumanReviewAdjudicationDecision =>
  exact(value, [
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
  ]) &&
  value.format === 'prodivix.g4-human-review-adjudication-decision' &&
  value.version === 1 &&
  isIdentity(value.decisionId) &&
  isIdentity(value.randomizedPresentationId) &&
  isDigest(value.rubricDigest) &&
  isDigest(value.blindedArtifactSetDigest) &&
  isIdentity(value.adjudicationAuthorityId) &&
  isIdentity(value.adjudicatorPseudonym) &&
  isIdentity(value.keyId) &&
  isDigest(value.candidateDigest) &&
  isDigest(value.planDigest) &&
  isDigest(value.policyDigest) &&
  isSortedUnique(value.ratingDigests, isDigest) &&
  isSortedUnique(value.reviewerAuthorityIds, isIdentity) &&
  (() => {
    try {
      return sameCanonicalJson(
        normalizeAgentEvaluationHumanReviewCriterionVerdicts(
          value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
        ),
        value.criterionVerdicts
      );
    } catch {
      return false;
    }
  })() &&
  (value.decision === 'failed' || value.decision === 'passed') &&
  value.decision ===
    verdictForRequiredHumanReviewCriteria(
      value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
    ) &&
  isInstant(value.decidedAt) &&
  isDigest(value.decisionDigest) &&
  isSignature(value.signatureBase64Url) &&
  value.decisionDigest ===
    digestAgentCanonicalValue(
      agentEvaluationHumanReviewAdjudicationPayload(
        value as AgentEvaluationHumanReviewAdjudicationDecision
      )
    );

const isCandidateAdjudication = (
  value: unknown
): value is AgentEvaluationHumanReviewCandidateAdjudication =>
  exact(
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
  ) &&
  isIdentity(value.randomizedPresentationId) &&
  isDigest(value.candidateDigest) &&
  isDigest(value.rubricDigest) &&
  isSortedUnique(value.ratingDigests, isDigest) &&
  isSortedUnique(value.reviewerAuthorityIds, isIdentity) &&
  (() => {
    try {
      return sameCanonicalJson(
        normalizeAgentEvaluationHumanReviewCriterionVerdicts(
          value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
        ),
        value.criterionVerdicts
      );
    } catch {
      return false;
    }
  })() &&
  (value.verdict === 'failed' || value.verdict === 'passed') &&
  value.verdict ===
    verdictForRequiredHumanReviewCriteria(
      value.criterionVerdicts as readonly AgentEvaluationHumanReviewCriterionVerdict[]
    ) &&
  (value.decisionDigest === undefined || isDigest(value.decisionDigest));

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

const isValidationReceipt = (
  value: unknown,
  artifact: Readonly<{
    planDigest: string;
    repositoryCommit: string;
    blindBundleDigest: string;
    reviewLeaseDigest: string;
    blindedArtifactSetDigest: string;
    randomizedPresentationPolicyDigest: string;
    sourceProvenance: AgentEvaluationHumanReviewSourceProvenance;
    signedRatings: readonly AgentEvaluationHumanReviewSignedRating[];
    independenceAttestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[];
    adjudicationDecisions: readonly AgentEvaluationHumanReviewAdjudicationDecision[];
  }>
): value is AgentEvaluationHumanReviewValidationReceipt => {
  if (
    !exact(value, [
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
    ]) ||
    value.format !== 'prodivix.g4-human-review-validation-receipt' ||
    value.version !== 1 ||
    !isIdentity(value.receiptId) ||
    !isIdentity(value.submissionId) ||
    !isDigest(value.submissionDigest) ||
    value.planDigest !== artifact.planDigest ||
    value.repositoryCommit !== artifact.repositoryCommit ||
    value.blindBundleDigest !== artifact.blindBundleDigest ||
    value.reviewLeaseDigest !== artifact.reviewLeaseDigest ||
    value.blindedArtifactSetDigest !== artifact.blindedArtifactSetDigest ||
    value.randomizedPresentationPolicyDigest !==
      artifact.randomizedPresentationPolicyDigest ||
    !sameCanonicalJson(value.sourceProvenance, artifact.sourceProvenance) ||
    !isDigest(value.trustRegistryDigest) ||
    !isDigest(value.authoritySetDigest) ||
    !isDigest(value.adjudicationPolicyDigest) ||
    value.ratingSignatureSetDigest !==
      ratingSetDigest(artifact.signedRatings) ||
    value.independenceAttestationSetDigest !==
      independenceSetDigest(artifact.independenceAttestations) ||
    value.adjudicationDecisionSetDigest !==
      decisionSetDigest(artifact.adjudicationDecisions) ||
    !Array.isArray(value.candidateAdjudications) ||
    value.candidateAdjudications.length < 1 ||
    !value.candidateAdjudications.every(isCandidateAdjudication) ||
    !isDigest(value.candidateAdjudicationSetDigest) ||
    value.candidateAdjudicationSetDigest !==
      digestAgentCanonicalValue(value.candidateAdjudications) ||
    !isDigest(value.adjudicationDigest) ||
    !isInstant(value.validatedAt) ||
    !isDigest(value.receiptDigest)
  ) {
    return false;
  }
  const { receiptDigest: _receiptDigest, ...base } = value;
  return (
    value.receiptDigest === digestAgentCanonicalValue(base as AgentJsonValue)
  );
};

const humanReviewArtifactPayload = (
  artifact: AgentEvaluationHumanReviewImport
): AgentEvaluationHumanReviewArtifactPayload =>
  Object.freeze({
    format: artifact.format,
    version: artifact.version,
    planDigest: artifact.planDigest,
    repositoryCommit: artifact.repositoryCommit,
    blindBundleDigest: artifact.blindBundleDigest,
    reviewLeaseDigest: artifact.reviewLeaseDigest,
    blindedArtifactSetDigest: artifact.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      artifact.randomizedPresentationPolicyDigest,
    sourceProvenance: artifact.sourceProvenance,
    signedRatings: artifact.signedRatings,
    independenceAttestations: artifact.independenceAttestations,
    adjudicationDecisions: artifact.adjudicationDecisions,
    validationReceipt: artifact.validationReceipt,
    reviewedAt: artifact.reviewedAt,
  });

export const isAgentEvaluationHumanReviewImport = (
  value: unknown
): value is AgentEvaluationHumanReviewImport => {
  try {
    if (
      !exact(value, [
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
      ]) ||
      value.format !== AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT ||
      value.version !== 1 ||
      !isDigest(value.planDigest) ||
      typeof value.repositoryCommit !== 'string' ||
      !commitPattern.test(value.repositoryCommit) ||
      !isDigest(value.blindBundleDigest) ||
      !isDigest(value.reviewLeaseDigest) ||
      !isDigest(value.blindedArtifactSetDigest) ||
      !isDigest(value.randomizedPresentationPolicyDigest) ||
      !isSourceProvenance(value.sourceProvenance) ||
      !Array.isArray(value.signedRatings) ||
      value.signedRatings.length < 1 ||
      !value.signedRatings.every(isSignedRating) ||
      !Array.isArray(value.independenceAttestations) ||
      value.independenceAttestations.length < 2 ||
      !value.independenceAttestations.every(isIndependenceAttestation) ||
      !Array.isArray(value.adjudicationDecisions) ||
      !value.adjudicationDecisions.every(isAdjudicationDecision) ||
      !isInstant(value.reviewedAt) ||
      !exact(value.artifactAuthority, [
        'authorityId',
        'keyId',
        'workflowName',
        'workflowRunId',
        'workflowRunAttempt',
        'signedAt',
        'payloadDigest',
        'signatureBase64Url',
      ]) ||
      !isIdentity(value.artifactAuthority.authorityId) ||
      !isIdentity(value.artifactAuthority.keyId) ||
      value.artifactAuthority.workflowName !== 'g4-real-model-human-review' ||
      !isIdentity(value.artifactAuthority.workflowRunId) ||
      !isPositiveInteger(value.artifactAuthority.workflowRunAttempt) ||
      !isInstant(value.artifactAuthority.signedAt) ||
      !isDigest(value.artifactAuthority.payloadDigest) ||
      !isSignature(value.artifactAuthority.signatureBase64Url) ||
      !isDigest(value.artifactDigest)
    ) {
      return false;
    }
    const artifact = value as unknown as AgentEvaluationHumanReviewImport;
    if (
      !isValidationReceipt(artifact.validationReceipt, artifact) ||
      Date.parse(artifact.reviewedAt) >
        Date.parse(artifact.validationReceipt.validatedAt)
    ) {
      return false;
    }
    const payload = humanReviewArtifactPayload(artifact);
    return (
      artifact.artifactAuthority.payloadDigest ===
        digestAgentCanonicalValue(payload) &&
      artifact.artifactDigest ===
        digestAgentCanonicalValue({
          ...payload,
          artifactAuthority: artifact.artifactAuthority,
        }) &&
      new TextEncoder().encode(canonicalJsonText(artifact)).byteLength <=
        AGENT_EVALUATION_HUMAN_REVIEW_ARTIFACT_MAXIMUM_BYTES
    );
  } catch {
    return false;
  }
};

const normalizedRatingsMatch = (
  artifact: AgentEvaluationHumanReviewImport,
  report: AgentHumanReviewReport
): boolean => {
  if (artifact.signedRatings.length !== report.ratings.length) return false;
  const signedById = new Map(
    artifact.signedRatings.map((rating) => [rating.ratingId, rating])
  );
  return (
    signedById.size === artifact.signedRatings.length &&
    report.ratings.every((rating) => {
      const signed = signedById.get(rating.ratingId);
      return (
        signed !== undefined &&
        rating.randomizedPresentationId === signed.randomizedPresentationId &&
        rating.reviewerPseudonym === signed.reviewerPseudonym &&
        rating.rubricDigest === signed.rubricDigest &&
        sameCanonicalJson(rating.criterionVerdicts, signed.criterionVerdicts) &&
        rating.verdict === signed.verdict
      );
    })
  );
};

const isHumanReviewTrustAuthority = (
  value: unknown
): value is AgentEvaluationHumanReviewTrustAuthority => {
  if (
    !exact(value, [
      'authorityId',
      'pseudonym',
      'role',
      'keyId',
      'publicKeyBase64Url',
      'validFrom',
      'validUntil',
      'independencePolicyDigest',
      'authorityDigest',
    ]) ||
    !isIdentity(value.authorityId) ||
    !isIdentity(value.pseudonym) ||
    !['reviewer', 'adjudicator'].includes(String(value.role)) ||
    !isIdentity(value.keyId) ||
    typeof value.publicKeyBase64Url !== 'string' ||
    !canonicalEd25519PublicKeyPattern.test(value.publicKeyBase64Url) ||
    !isInstant(value.validFrom) ||
    !isInstant(value.validUntil) ||
    Date.parse(value.validUntil) <= Date.parse(value.validFrom) ||
    !isDigest(value.independencePolicyDigest) ||
    !isDigest(value.authorityDigest)
  ) {
    return false;
  }
  const { authorityDigest: _authorityDigest, ...base } = value;
  return value.authorityDigest === digestAgentCanonicalValue(base);
};

export const isAgentEvaluationHumanReviewTrustRegistry = (
  value: unknown
): value is AgentEvaluationHumanReviewTrustRegistry => {
  try {
    if (
      !exact(value, [
        'format',
        'version',
        'registryId',
        'authorities',
        'authoritySetDigest',
        'registryDigest',
      ]) ||
      value.format !== 'prodivix.g4-human-review-trust-registry' ||
      value.version !== 1 ||
      !isIdentity(value.registryId) ||
      !Array.isArray(value.authorities) ||
      value.authorities.length < 3 ||
      value.authorities.length > 17 ||
      !value.authorities.every(isHumanReviewTrustAuthority) ||
      !isDigest(value.authoritySetDigest) ||
      !isDigest(value.registryDigest)
    ) {
      return false;
    }
    const authorities = value.authorities;
    if (
      new Set(authorities.map(({ authorityId }) => authorityId)).size !==
        authorities.length ||
      new Set(authorities.map(({ pseudonym }) => pseudonym)).size !==
        authorities.length ||
      new Set(authorities.map(({ keyId }) => keyId)).size !==
        authorities.length ||
      !sameCanonicalJson(
        authorities.map(({ authorityId }) => authorityId),
        authorities
          .map(({ authorityId }) => authorityId)
          .sort(compareUnicodeCodePoints)
      ) ||
      value.authoritySetDigest !==
        digestAgentCanonicalValue({
          format: 'prodivix.g4-human-review-authority-set',
          version: 1,
          authorityDigests: authorities.map(
            ({ authorityDigest }) => authorityDigest
          ),
        })
    ) {
      return false;
    }
    const { registryDigest: _registryDigest, ...base } = value;
    return value.registryDigest === digestAgentCanonicalValue(base);
  } catch {
    return false;
  }
};

export const isAgentEvaluationHumanReviewAdjudicationPolicy = (
  value: unknown,
  registry?: AgentEvaluationHumanReviewTrustRegistry
): value is AgentEvaluationHumanReviewAdjudicationPolicy => {
  try {
    if (
      !exact(value, [
        'minimumIndependentRatings',
        'reviewerAuthorityIds',
        'adjudicationAuthorityId',
        'adjudicatorKeyId',
        'trigger',
        'trustRegistryDigest',
        'independencePolicyDigest',
        'consensusRule',
        'disagreementRule',
        'reviewerRatingSignaturesRequired',
        'adjudicatorDecisionSignatureRequired',
        'signatureAlgorithm',
        'decisionPayloadFields',
        'policyDigest',
      ]) ||
      !isPositiveInteger(value.minimumIndependentRatings) ||
      !isSortedUnique(value.reviewerAuthorityIds, isIdentity) ||
      !isIdentity(value.adjudicationAuthorityId) ||
      !isIdentity(value.adjudicatorKeyId) ||
      value.trigger !== 'reviewer-disagreement' ||
      !isDigest(value.trustRegistryDigest) ||
      !isDigest(value.independencePolicyDigest) ||
      value.consensusRule !== 'unanimous' ||
      value.disagreementRule !== 'escalate-to-independent-adjudicator' ||
      value.reviewerRatingSignaturesRequired !== true ||
      value.adjudicatorDecisionSignatureRequired !== true ||
      value.signatureAlgorithm !== 'Ed25519' ||
      !sameCanonicalJson(
        value.decisionPayloadFields,
        AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS
      ) ||
      !isDigest(value.policyDigest)
    ) {
      return false;
    }
    const { policyDigest: _policyDigest, ...base } = value;
    if (value.policyDigest !== digestAgentCanonicalValue(base)) return false;
    if (registry === undefined) return true;
    if (
      !isAgentEvaluationHumanReviewTrustRegistry(registry) ||
      value.trustRegistryDigest !== registry.registryDigest
    ) {
      return false;
    }
    const authorityById = new Map(
      registry.authorities.map((authority) => [
        authority.authorityId,
        authority,
      ])
    );
    const adjudicator = authorityById.get(value.adjudicationAuthorityId);
    return (
      value.reviewerAuthorityIds.length >= value.minimumIndependentRatings &&
      value.reviewerAuthorityIds.every((authorityId) => {
        const authority = authorityById.get(authorityId);
        return (
          authority?.role === 'reviewer' &&
          authority.independencePolicyDigest === value.independencePolicyDigest
        );
      }) &&
      adjudicator?.role === 'adjudicator' &&
      adjudicator.keyId === value.adjudicatorKeyId &&
      adjudicator.independencePolicyDigest === value.independencePolicyDigest
    );
  } catch {
    return false;
  }
};

export const isAgentEvaluationValidatedHumanReviewArtifact = (
  value: unknown,
  report?: AgentHumanReviewReport
): value is AgentEvaluationValidatedHumanReviewArtifact => {
  try {
    if (
      !exact(value, [
        'format',
        'version',
        'artifactId',
        'planDigest',
        'repositoryCommit',
        'reviewArtifact',
        'reviewArtifactDigest',
        'reviewLeaseDigest',
        'humanReviewReportDigest',
        'publicRubrics',
        'trustRegistry',
        'adjudicationPolicy',
        'validatedAt',
        'artifactDigest',
      ]) ||
      value.format !==
        AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT ||
      value.version !== 1 ||
      !isIdentity(value.artifactId) ||
      !isDigest(value.planDigest) ||
      typeof value.repositoryCommit !== 'string' ||
      !commitPattern.test(value.repositoryCommit) ||
      !isAgentEvaluationHumanReviewImport(value.reviewArtifact) ||
      value.reviewArtifactDigest !== value.reviewArtifact.artifactDigest ||
      value.reviewLeaseDigest !== value.reviewArtifact.reviewLeaseDigest ||
      value.planDigest !== value.reviewArtifact.planDigest ||
      value.repositoryCommit !== value.reviewArtifact.repositoryCommit ||
      value.validatedAt !==
        value.reviewArtifact.validationReceipt.validatedAt ||
      !isDigest(value.humanReviewReportDigest) ||
      !Array.isArray(value.publicRubrics) ||
      value.publicRubrics.length < 1 ||
      value.publicRubrics.length > 16 ||
      !isAgentEvaluationHumanReviewTrustRegistry(value.trustRegistry) ||
      !isAgentEvaluationHumanReviewAdjudicationPolicy(
        value.adjudicationPolicy,
        value.trustRegistry
      ) ||
      value.reviewArtifact.validationReceipt.trustRegistryDigest !==
        value.trustRegistry.registryDigest ||
      value.reviewArtifact.validationReceipt.authoritySetDigest !==
        value.trustRegistry.authoritySetDigest ||
      value.reviewArtifact.validationReceipt.adjudicationPolicyDigest !==
        value.adjudicationPolicy.policyDigest ||
      !isDigest(value.artifactDigest)
    ) {
      return false;
    }
    const reviewArtifact =
      value.reviewArtifact as AgentEvaluationHumanReviewImport;
    const publicRubrics = value.publicRubrics.map((rubric) =>
      validateAgentEvaluationPublicReviewRubric(rubric)
    );
    const rubricDigests = publicRubrics.map(({ rubricDigest }) => rubricDigest);
    const { artifactDigest: _artifactDigest, ...base } = value;
    const wrapperAuthority = value.trustRegistry.authorities.find(
      ({ authorityId, keyId, role }) =>
        authorityId === reviewArtifact.artifactAuthority.authorityId &&
        keyId === reviewArtifact.artifactAuthority.keyId &&
        role === 'adjudicator'
    );
    if (
      !wrapperAuthority ||
      wrapperAuthority.authorityId !==
        value.adjudicationPolicy.adjudicationAuthorityId ||
      Date.parse(reviewArtifact.artifactAuthority.signedAt) <
        Date.parse(wrapperAuthority.validFrom) ||
      Date.parse(reviewArtifact.artifactAuthority.signedAt) >
        Date.parse(wrapperAuthority.validUntil) ||
      new Set(rubricDigests).size !== rubricDigests.length ||
      !sameCanonicalJson(
        rubricDigests,
        [...rubricDigests].sort(compareUnicodeCodePoints)
      ) ||
      reviewArtifact.signedRatings.some(
        (rating) => !rubricDigests.includes(rating.rubricDigest)
      ) ||
      value.artifactDigest !==
        digestAgentCanonicalValue(base as AgentJsonValue) ||
      new TextEncoder().encode(canonicalJsonText(value)).byteLength >
        AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_MAXIMUM_BYTES
    ) {
      return false;
    }
    return (
      report === undefined ||
      (isAgentHumanReviewReport(report) &&
        report.planDigest === value.planDigest &&
        report.blindedArtifactSetDigest ===
          reviewArtifact.blindedArtifactSetDigest &&
        report.adjudicationDigest ===
          reviewArtifact.validationReceipt.adjudicationDigest &&
        report.reportDigest === value.humanReviewReportDigest &&
        Date.parse(report.generatedAt) >= Date.parse(value.validatedAt) &&
        normalizedRatingsMatch(reviewArtifact, report))
    );
  } catch {
    return false;
  }
};

export const createAgentEvaluationValidatedHumanReviewArtifact = (input: {
  reviewArtifact: AgentEvaluationHumanReviewImport;
  humanReviewReport: AgentHumanReviewReport;
  publicRubrics: readonly AgentEvaluationPublicReviewRubric[];
  trustRegistry: AgentEvaluationHumanReviewTrustRegistry;
  adjudicationPolicy: AgentEvaluationHumanReviewAdjudicationPolicy;
}): AgentEvaluationValidatedHumanReviewArtifact => {
  if (
    !isAgentEvaluationHumanReviewImport(input.reviewArtifact) ||
    !isAgentHumanReviewReport(input.humanReviewReport) ||
    !Array.isArray(input.publicRubrics) ||
    input.publicRubrics.length < 1 ||
    !isAgentEvaluationHumanReviewTrustRegistry(input.trustRegistry) ||
    !isAgentEvaluationHumanReviewAdjudicationPolicy(
      input.adjudicationPolicy,
      input.trustRegistry
    )
  ) {
    throw new TypeError('Validated human review artifact input is invalid.');
  }
  const publicRubrics = Object.freeze(
    input.publicRubrics
      .map((rubric) => validateAgentEvaluationPublicReviewRubric(rubric))
      .sort((left, right) =>
        compareUnicodeCodePoints(left.rubricDigest, right.rubricDigest)
      )
  );
  const base = Object.freeze({
    format: AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT,
    version: 1 as const,
    artifactId: `validated-human-review:${input.reviewArtifact.artifactDigest.slice('sha256-'.length)}`,
    planDigest: input.reviewArtifact.planDigest,
    repositoryCommit: input.reviewArtifact.repositoryCommit,
    reviewArtifact: input.reviewArtifact,
    reviewArtifactDigest: input.reviewArtifact.artifactDigest,
    reviewLeaseDigest: input.reviewArtifact.reviewLeaseDigest,
    humanReviewReportDigest: input.humanReviewReport.reportDigest,
    publicRubrics,
    trustRegistry: input.trustRegistry,
    adjudicationPolicy: input.adjudicationPolicy,
    validatedAt: input.reviewArtifact.validationReceipt.validatedAt,
  });
  const artifact = Object.freeze({
    ...base,
    artifactDigest: digestAgentCanonicalValue(base),
  });
  if (
    !isAgentEvaluationValidatedHumanReviewArtifact(
      artifact,
      input.humanReviewReport
    )
  ) {
    throw new TypeError('Validated human review artifact binding is invalid.');
  }
  return artifact;
};

export const canonicalAgentEvaluationValidatedHumanReviewArtifactOrder = (
  artifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[]
): readonly AgentEvaluationValidatedHumanReviewArtifact[] =>
  Object.freeze(
    [...artifacts].sort((left, right) =>
      compareUnicodeCodePoints(left.artifactId, right.artifactId)
    )
  );

export const isAgentEvaluationValidatedHumanReviewArtifactSet = (
  value: unknown
): value is readonly AgentEvaluationValidatedHumanReviewArtifact[] =>
  Array.isArray(value) &&
  value.length <= 1 &&
  value.every((artifact) =>
    isAgentEvaluationValidatedHumanReviewArtifact(artifact)
  ) &&
  new Set(value.map(({ artifactId }) => artifactId)).size === value.length &&
  new Set(value.map(({ artifactDigest }) => artifactDigest)).size ===
    value.length &&
  sameCanonicalJson(
    value,
    canonicalAgentEvaluationValidatedHumanReviewArtifactOrder(value)
  );

export const digestAgentEvaluationValidatedHumanReviewArtifactSet = (
  artifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[]
): string =>
  digestAgentCanonicalValue(
    canonicalAgentEvaluationValidatedHumanReviewArtifactOrder(artifacts).map(
      ({ artifactDigest }) => artifactDigest
    )
  );
