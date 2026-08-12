import { describe, expect, it } from 'vitest';
import {
  createV8EvaluationPlan,
  createV8HumanReviewReport,
  createV8ValidatedHumanReviewArtifact,
} from '../__tests__/agentV8Fixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
} from './agentEvaluationResults';
import {
  AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
  AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT,
  agentEvaluationHumanReviewIndependencePayload,
  agentEvaluationHumanReviewRatingPayload,
  createAgentEvaluationValidatedHumanReviewArtifact,
  isAgentEvaluationHumanReviewImport,
  isAgentEvaluationValidatedHumanReviewArtifact,
  type AgentEvaluationHumanReviewImport,
  type AgentEvaluationHumanReviewAdjudicationPolicy,
  type AgentEvaluationHumanReviewIndependenceAttestation,
  type AgentEvaluationHumanReviewSignedRating,
  type AgentEvaluationHumanReviewTrustAuthority,
  type AgentEvaluationHumanReviewTrustRegistry,
} from './agentEvaluationValidatedHumanReview';

const planDigest = digestAgentCanonicalValue('plan');
const repositoryCommit = 'a'.repeat(40);
const blindBundleDigest = digestAgentCanonicalValue('blind-bundle');
const reviewLeaseDigest = digestAgentCanonicalValue('review-lease');
const blindedArtifactSetDigest = digestAgentCanonicalValue('blind-set');
const criterionVerdicts = Object.freeze([
  Object.freeze({ criterionId: 'visual-quality', verdict: 'passed' as const }),
]);
const publicRubricBase = Object.freeze({
  format: 'prodivix.g4-public-human-review-rubric' as const,
  version: 1 as const,
  rubricId: 'rubric.visual-quality',
  title: 'Visual quality',
  criteria: Object.freeze([
    Object.freeze({
      criterionId: 'visual-quality',
      label: 'Visual quality',
      instruction: 'Apply the frozen visual-quality anchors.',
      required: true,
      anchors: Object.freeze([
        Object.freeze({
          verdict: 'failed' as const,
          label: 'Failed',
          description: 'The visible result fails the criterion.',
        }),
        Object.freeze({
          verdict: 'passed' as const,
          label: 'Passed',
          description: 'The visible result passes the criterion.',
        }),
      ]),
    }),
  ]),
  metricMappings: Object.freeze([
    Object.freeze({
      metricId: 'visual.human-quality',
      criterionIds: Object.freeze(['visual-quality']),
      aggregation: 'all-pass' as const,
    }),
  ]),
  interRaterDisagreementMetricId: 'visual.inter-rater-disagreement',
  scale: 'binary-pass-fail' as const,
  accessibilityInstructions: Object.freeze(['Use the supplied raster only.']),
});
const publicRubric = Object.freeze({
  ...publicRubricBase,
  rubricDigest: digestAgentCanonicalValue(publicRubricBase),
});
const rubricDigest = publicRubric.rubricDigest;
const policyDigest = digestAgentCanonicalValue('presentation-policy');
const validatedAt = '2026-08-08T01:00:00.000Z';
const signatureBase64Url = 'A'.repeat(86);
const independencePolicyDigest = digestAgentCanonicalValue(
  'independence-policy'
);

const trustAuthority = (
  authorityId: string,
  pseudonym: string,
  role: AgentEvaluationHumanReviewTrustAuthority['role']
): AgentEvaluationHumanReviewTrustAuthority => {
  const base = Object.freeze({
    authorityId,
    pseudonym,
    role,
    keyId: `key.${pseudonym}`,
    publicKeyBase64Url: 'A'.repeat(43),
    validFrom: '2026-08-01T00:00:00.000Z',
    validUntil: '2026-08-31T00:00:00.000Z',
    independencePolicyDigest,
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

const authorities = Object.freeze([
  trustAuthority('adjudicator.authority.1', 'adjudicator.one', 'adjudicator'),
  trustAuthority('reviewer.authority.1', 'reviewer.one', 'reviewer'),
  trustAuthority('reviewer.authority.2', 'reviewer.two', 'reviewer'),
]);
const authoritySetDigest = digestAgentCanonicalValue({
  format: 'prodivix.g4-human-review-authority-set',
  version: 1,
  authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
});
const trustRegistryBase = Object.freeze({
  format: 'prodivix.g4-human-review-trust-registry' as const,
  version: 1 as const,
  registryId: 'human-review.registry.1',
  authorities,
  authoritySetDigest,
});
const trustRegistry: AgentEvaluationHumanReviewTrustRegistry = Object.freeze({
  ...trustRegistryBase,
  registryDigest: digestAgentCanonicalValue(trustRegistryBase),
});
const adjudicationPolicyBase = Object.freeze({
  minimumIndependentRatings: 2,
  reviewerAuthorityIds: Object.freeze([
    'reviewer.authority.1',
    'reviewer.authority.2',
  ]),
  adjudicationAuthorityId: 'adjudicator.authority.1',
  adjudicatorKeyId: 'key.adjudicator.one',
  trigger: 'reviewer-disagreement' as const,
  trustRegistryDigest: trustRegistry.registryDigest,
  independencePolicyDigest,
  consensusRule: 'unanimous' as const,
  disagreementRule: 'escalate-to-independent-adjudicator' as const,
  reviewerRatingSignaturesRequired: true as const,
  adjudicatorDecisionSignatureRequired: true as const,
  signatureAlgorithm: 'Ed25519' as const,
  decisionPayloadFields:
    AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
});
const adjudicationPolicy: AgentEvaluationHumanReviewAdjudicationPolicy =
  Object.freeze({
    ...adjudicationPolicyBase,
    policyDigest: digestAgentCanonicalValue(adjudicationPolicyBase),
  });

const signedRating = (): AgentEvaluationHumanReviewSignedRating => {
  const unsigned = Object.freeze({
    format: 'prodivix.g4-human-review-signed-rating' as const,
    version: 1 as const,
    ratingId: 'rating.1',
    randomizedPresentationId:
      'blind-review:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    rubricDigest,
    blindedArtifactSetDigest,
    reviewerAuthorityId: 'reviewer.authority.1',
    reviewerPseudonym: 'reviewer.one',
    keyId: 'reviewer.key.1',
    criterionVerdicts,
    verdict: 'passed' as const,
    ratedAt: '2026-08-08T00:30:00.000Z',
  });
  return Object.freeze({
    ...unsigned,
    ratingDigest: digestAgentCanonicalValue(unsigned),
    signatureBase64Url,
  });
};

const independence = (
  authorityId: string,
  pseudonym: string
): AgentEvaluationHumanReviewIndependenceAttestation => {
  const unsigned = Object.freeze({
    format: 'prodivix.g4-human-review-independence-attestation' as const,
    version: 1 as const,
    attestationId: `independence.${pseudonym}`,
    planDigest,
    blindedArtifactSetDigest,
    authorityId,
    authorityPseudonym: pseudonym,
    role: 'reviewer' as const,
    keyId: `key.${pseudonym}`,
    independencePolicyDigest,
    testedModelFamilyOwnerSetDigest: digestAgentCanonicalValue('owner-set'),
    conflictModelFamilyOwnerSetDigest:
      digestAgentCanonicalValue('empty-conflict-set'),
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-09T00:00:00.000Z',
  });
  return Object.freeze({
    ...unsigned,
    attestationDigest: digestAgentCanonicalValue(unsigned),
    signatureBase64Url,
  });
};

const rawReview = (): AgentEvaluationHumanReviewImport => {
  const rating = signedRating();
  const attestations = Object.freeze([
    independence('reviewer.authority.1', 'reviewer.one'),
    independence('reviewer.authority.2', 'reviewer.two'),
  ]);
  const sourceProvenance = Object.freeze({
    sourceRunId: '12345',
    sourceRunAttempt: 1,
    sourceArtifactName: 'g4-blind-review',
    sourceArtifactDigest: `sha256:${'b'.repeat(64)}`,
  });
  const candidateAdjudications = Object.freeze([
    Object.freeze({
      randomizedPresentationId: rating.randomizedPresentationId,
      candidateDigest: digestAgentCanonicalValue('candidate'),
      rubricDigest,
      ratingDigests: Object.freeze([rating.ratingDigest]),
      reviewerAuthorityIds: Object.freeze([rating.reviewerAuthorityId]),
      criterionVerdicts,
      verdict: 'passed' as const,
    }),
  ]);
  const receiptBase = Object.freeze({
    format: 'prodivix.g4-human-review-validation-receipt' as const,
    version: 1 as const,
    receiptId: 'human-review-validation:fixture',
    submissionId: 'submission.1',
    submissionDigest: digestAgentCanonicalValue('submission'),
    planDigest,
    repositoryCommit,
    blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest: policyDigest,
    sourceProvenance,
    trustRegistryDigest: trustRegistry.registryDigest,
    authoritySetDigest: trustRegistry.authoritySetDigest,
    adjudicationPolicyDigest: adjudicationPolicy.policyDigest,
    ratingSignatureSetDigest: digestAgentCanonicalValue([
      {
        ratingDigest: rating.ratingDigest,
        signatureBase64Url: rating.signatureBase64Url,
      },
    ]),
    independenceAttestationSetDigest: digestAgentCanonicalValue(
      attestations.map(({ attestationDigest, signatureBase64Url }) => ({
        attestationDigest,
        signatureBase64Url,
      }))
    ),
    adjudicationDecisionSetDigest: digestAgentCanonicalValue([]),
    candidateAdjudications,
    candidateAdjudicationSetDigest: digestAgentCanonicalValue(
      candidateAdjudications
    ),
    adjudicationDigest: digestAgentCanonicalValue('adjudication'),
    validatedAt,
  });
  const validationReceipt = Object.freeze({
    ...receiptBase,
    receiptDigest: digestAgentCanonicalValue(receiptBase),
  });
  const payload = Object.freeze({
    format: AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
    version: 1 as const,
    planDigest,
    repositoryCommit,
    blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest: policyDigest,
    sourceProvenance,
    signedRatings: Object.freeze([rating]),
    independenceAttestations: attestations,
    adjudicationDecisions: Object.freeze([]),
    validationReceipt,
    reviewedAt: '2026-08-08T00:45:00.000Z',
  });
  const artifactAuthority = Object.freeze({
    authorityId: 'adjudicator.authority.1',
    keyId: 'key.adjudicator.one',
    workflowName: 'g4-real-model-human-review' as const,
    workflowRunId: '98765',
    workflowRunAttempt: 1,
    signedAt: validatedAt,
    payloadDigest: digestAgentCanonicalValue(payload),
    signatureBase64Url,
  });
  return Object.freeze({
    ...payload,
    artifactAuthority,
    artifactDigest: digestAgentCanonicalValue({
      ...payload,
      artifactAuthority,
    }),
  });
};

const reportFor = (
  artifact: AgentEvaluationHumanReviewImport,
  generatedAt = '2026-08-08T01:05:00.000Z'
) => {
  const signed = artifact.signedRatings[0]!;
  const rating = createAgentHumanReviewRating({
    ratingId: signed.ratingId,
    attemptId: `evaluation-attempt:${'c'.repeat(64)}`,
    reviewerPseudonym: signed.reviewerPseudonym,
    randomizedPresentationId: signed.randomizedPresentationId,
    rubricDigest: signed.rubricDigest,
    criterionVerdicts: signed.criterionVerdicts,
    verdict: signed.verdict,
  });
  return createAgentHumanReviewReport({
    reportId: 'evaluation-human-review:fixture',
    planDigest: artifact.planDigest,
    blindedArtifactSetDigest: artifact.blindedArtifactSetDigest,
    ratings: Object.freeze([rating]),
    adjudicationDigest: artifact.validationReceipt.adjudicationDigest,
    generatedAt,
  });
};

describe('validated human review artifact', () => {
  it('builds the shared production-shape V8 review fixture', () => {
    const plan = createV8EvaluationPlan();
    const report = createV8HumanReviewReport(plan);
    const artifact = createV8ValidatedHumanReviewArtifact(plan, report);

    expect(
      isAgentEvaluationValidatedHumanReviewArtifact(artifact, report)
    ).toBe(true);
    expect(artifact.humanReviewReportDigest).toBe(report.reportDigest);
    expect(artifact.reviewLeaseDigest).toBe(
      artifact.reviewArtifact.reviewLeaseDigest
    );
  }, 20_000);

  it('preserves every raw signed record and binds its normalized report', () => {
    const reviewArtifact = rawReview();
    const humanReviewReport = reportFor(reviewArtifact);
    const artifact = createAgentEvaluationValidatedHumanReviewArtifact({
      reviewArtifact,
      humanReviewReport,
      publicRubrics: Object.freeze([publicRubric]),
      trustRegistry,
      adjudicationPolicy,
    });

    expect(artifact.format).toBe(
      AGENT_EVALUATION_VALIDATED_HUMAN_REVIEW_ARTIFACT_FORMAT
    );
    expect(artifact.reviewArtifact).toEqual(reviewArtifact);
    expect(artifact.reviewLeaseDigest).toBe(reviewLeaseDigest);
    expect(artifact.humanReviewReportDigest).toBe(
      humanReviewReport.reportDigest
    );
    expect(
      isAgentEvaluationValidatedHumanReviewArtifact(artifact, humanReviewReport)
    ).toBe(true);
  });

  it('rejects signed-record mutation and arbitrary extra identity fields', () => {
    const reviewArtifact = rawReview();
    expect(isAgentEvaluationHumanReviewImport(reviewArtifact)).toBe(true);
    expect(
      isAgentEvaluationHumanReviewImport({
        ...reviewArtifact,
        signedRatings: [
          {
            ...reviewArtifact.signedRatings[0],
            attemptId: 'evaluation-attempt:leak',
          },
        ],
      })
    ).toBe(false);
    expect(
      isAgentEvaluationHumanReviewImport({
        ...reviewArtifact,
        signedRatings: [
          { ...reviewArtifact.signedRatings[0], verdict: 'failed' },
        ],
      })
    ).toBe(false);
  });

  it('rejects a normalized report that predates validation authority', () => {
    const reviewArtifact = rawReview();
    const humanReviewReport = reportFor(
      reviewArtifact,
      '2026-08-08T00:59:59.999Z'
    );

    expect(() =>
      createAgentEvaluationValidatedHumanReviewArtifact({
        reviewArtifact,
        humanReviewReport,
        publicRubrics: Object.freeze([publicRubric]),
        trustRegistry,
        adjudicationPolicy,
      })
    ).toThrow('Validated human review artifact binding is invalid.');
  });

  it('rejects a normalized report that drifted from the signed blind verdict', () => {
    const reviewArtifact = rawReview();
    const report = reportFor(reviewArtifact);
    expect(() =>
      createAgentEvaluationValidatedHumanReviewArtifact({
        reviewArtifact,
        humanReviewReport: {
          ...report,
          blindedArtifactSetDigest: digestAgentCanonicalValue('swapped-set'),
        },
        publicRubrics: Object.freeze([publicRubric]),
        trustRegistry,
        adjudicationPolicy,
      })
    ).toThrow('Validated human review artifact');
  });

  it('exports the exact payload digest helpers used by the runner verifier', () => {
    const reviewArtifact = rawReview();
    expect(
      digestAgentCanonicalValue(
        agentEvaluationHumanReviewRatingPayload(
          reviewArtifact.signedRatings[0]!
        )
      )
    ).toBe(reviewArtifact.signedRatings[0]!.ratingDigest);
    expect(
      digestAgentCanonicalValue(
        agentEvaluationHumanReviewIndependencePayload(
          reviewArtifact.independenceAttestations[0]!
        )
      )
    ).toBe(reviewArtifact.independenceAttestations[0]!.attestationDigest);
  });
});
