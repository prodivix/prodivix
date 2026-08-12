import {
  generateKeyPairSync,
  sign as signEd25519,
  type KeyObject,
} from 'node:crypto';
import {
  AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  agentEvaluationHumanReviewAdjudicationPayload,
  agentEvaluationHumanReviewIndependencePayload,
  agentEvaluationHumanReviewRatingPayload,
  createAgentEvaluationValidatedHumanReviewArtifact,
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
  type AgentEvaluationHumanReviewAdjudicationDecision,
  type AgentEvaluationHumanReviewIndependenceAttestation,
  type AgentEvaluationHumanReviewSignedRating,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import type { AgentEvaluationBlindReviewBundle } from './coordinator';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import { createSignedAgentEvaluationHumanReviewImport } from './reviewerAuthority';
import {
  createAgentEvaluationHumanReviewValidationPayload,
  decodeAgentEvaluationBlindReviewBundle,
  decodeAgentEvaluationHumanReviewSubmission,
  verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig,
  verifyProductionAgentEvaluationValidatedHumanReviewArtifact,
  type AgentEvaluationHumanReviewIndependenceRegistry,
  type AgentEvaluationHumanReviewSubmission,
  type AgentEvaluationHumanReviewValidationInput,
} from './reviewValidation';
import type {
  AgentEvaluationHumanReviewAdjudicationPolicy,
  AgentEvaluationHumanReviewTrustAuthority,
  AgentEvaluationHumanReviewTrustRegistry,
  AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const plannedAt = '2026-08-08T00:00:00.000Z';
const exportedAt = '2026-08-08T01:00:00.000Z';
const ratedAt = '2026-08-08T02:00:00.000Z';
const validatedAt = '2026-08-08T03:00:00.000Z';
const expiresAt = '2026-08-15T00:00:00.000Z';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const digest = (label: string): string => digestAgentCanonicalValue({ label });

type SigningIdentity = Readonly<{
  authorityId: string;
  pseudonym: string;
  role: 'reviewer' | 'adjudicator';
  keyId: string;
  privateKey: KeyObject;
  publicKeyBase64Url: string;
}>;

const signingIdentity = (
  authorityId: string,
  pseudonym: string,
  role: SigningIdentity['role']
): SigningIdentity => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  return Object.freeze({
    authorityId,
    pseudonym,
    role,
    keyId: `key.${authorityId}.v1`,
    privateKey,
    publicKeyBase64Url: publicDer.subarray(-32).toString('base64url'),
  });
};

const signatureFor = (
  privateKey: KeyObject,
  payload: object,
  digestName: string,
  valueDigest: string
): string =>
  signEd25519(
    null,
    new TextEncoder().encode(
      canonicalJsonText({ ...payload, [digestName]: valueDigest })
    ),
    privateKey
  ).toString('base64url');

const authorityFor = (
  identity: SigningIdentity,
  independencePolicyDigest: string
): AgentEvaluationHumanReviewTrustAuthority => {
  const base = Object.freeze({
    authorityId: identity.authorityId,
    pseudonym: identity.pseudonym,
    role: identity.role,
    keyId: identity.keyId,
    publicKeyBase64Url: identity.publicKeyBase64Url,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2030-01-01T00:00:00.000Z',
    independencePolicyDigest,
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

const trustRegistryFor = (
  authorities: readonly AgentEvaluationHumanReviewTrustAuthority[]
): AgentEvaluationHumanReviewTrustRegistry => {
  const authoritySetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-authority-set',
    version: 1,
    authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
  });
  const base = Object.freeze({
    format: 'prodivix.g4-human-review-trust-registry' as const,
    version: 1 as const,
    registryId: 'registry.g4-human-review.test-v1',
    authorities: Object.freeze([...authorities]),
    authoritySetDigest,
  });
  return Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
};

const policyFor = (
  registry: AgentEvaluationHumanReviewTrustRegistry,
  reviewerAuthorityIds: readonly string[],
  adjudicator: SigningIdentity,
  independencePolicyDigest: string
): AgentEvaluationHumanReviewAdjudicationPolicy => {
  const base = Object.freeze({
    minimumIndependentRatings: 2,
    reviewerAuthorityIds,
    adjudicationAuthorityId: adjudicator.authorityId,
    adjudicatorKeyId: adjudicator.keyId,
    trigger: 'reviewer-disagreement' as const,
    trustRegistryDigest: registry.registryDigest,
    independencePolicyDigest,
    consensusRule: 'unanimous' as const,
    disagreementRule: 'escalate-to-independent-adjudicator' as const,
    reviewerRatingSignaturesRequired: true as const,
    adjudicatorDecisionSignatureRequired: true as const,
    signatureAlgorithm: 'Ed25519' as const,
    decisionPayloadFields:
      AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  });
  return Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
};

const publicRubric = (() => {
  const base = Object.freeze({
    format: 'prodivix.g4-public-human-review-rubric' as const,
    version: 1 as const,
    rubricId: 'rubric.visual.test',
    title: 'Blind visual review',
    criteria: Object.freeze([
      Object.freeze({
        criterionId: 'visual-quality',
        label: 'Visual quality',
        instruction: 'Judge only the supplied raster.',
        required: true,
        anchors: Object.freeze([
          Object.freeze({
            verdict: 'failed' as const,
            label: 'Failed',
            description: 'The supplied raster fails the criterion.',
          }),
          Object.freeze({
            verdict: 'passed' as const,
            label: 'Passed',
            description: 'The supplied raster passes the criterion.',
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
      Object.freeze({
        metricId: 'visual.information-hierarchy-quality',
        criterionIds: Object.freeze(['visual-quality']),
        aggregation: 'all-pass' as const,
      }),
      Object.freeze({
        metricId: 'visual.usability-quality',
        criterionIds: Object.freeze(['visual-quality']),
        aggregation: 'all-pass' as const,
      }),
    ]),
    interRaterDisagreementMetricId: 'visual.inter-rater-disagreement',
    scale: 'binary-pass-fail' as const,
    accessibilityInstructions: Object.freeze([
      'Assess at the supplied dimensions.',
    ]),
  });
  return Object.freeze({
    ...base,
    rubricDigest: digestAgentCanonicalValue(base),
  });
})();

const blindPresentationId = `blind-review:${'A'.repeat(43)}`;

const blindBundle = (): AgentEvaluationBlindReviewBundle => {
  const bytes = Buffer.from(pngBase64, 'base64');
  const candidate = Object.freeze({
    randomizedPresentationId: blindPresentationId,
    rubricDigest: publicRubric.rubricDigest,
    mediaType: 'image/png' as const,
    width: 1,
    height: 1,
    bytesBase64: pngBase64,
    bytesDigest: digestAgentCanonicalBytes(bytes),
    byteLength: bytes.byteLength,
  });
  const blindedArtifactSetDigest = digestAgentCanonicalValue([
    {
      randomizedPresentationId: candidate.randomizedPresentationId,
      rubricDigest: candidate.rubricDigest,
      artifactDigest: candidate.bytesDigest,
    },
  ]);
  const base = Object.freeze({
    format: 'prodivix.g4-model-evaluation-blind-review' as const,
    version: 1 as const,
    reviewLeaseDigest: digest('review-lease'),
    randomizedPresentationPolicyDigest: digest('presentation-policy'),
    rubrics: Object.freeze([publicRubric]),
    candidates: Object.freeze([candidate]),
    blindedArtifactSetDigest,
    exportedAt,
  });
  return Object.freeze({
    ...base,
    bundleDigest: digestAgentCanonicalValue(base),
  });
};

const signedRating = (
  identity: SigningIdentity,
  bundle: AgentEvaluationBlindReviewBundle,
  verdict: 'failed' | 'passed',
  suffix = identity.authorityId
): AgentEvaluationHumanReviewSignedRating => {
  const base = Object.freeze({
    format: 'prodivix.g4-human-review-signed-rating' as const,
    version: 1 as const,
    ratingId: `rating.${suffix}`,
    randomizedPresentationId: blindPresentationId,
    rubricDigest: publicRubric.rubricDigest,
    blindedArtifactSetDigest: bundle.blindedArtifactSetDigest,
    reviewerAuthorityId: identity.authorityId,
    reviewerPseudonym: identity.pseudonym,
    keyId: identity.keyId,
    criterionVerdicts: Object.freeze([
      Object.freeze({ criterionId: 'visual-quality', verdict }),
    ]),
    verdict,
    ratedAt,
  });
  const ratingDigest = digestAgentCanonicalValue(base);
  const draft = { ...base, ratingDigest, signatureBase64Url: '' };
  return Object.freeze({
    ...base,
    ratingDigest,
    signatureBase64Url: signatureFor(
      identity.privateKey,
      agentEvaluationHumanReviewRatingPayload(draft),
      'ratingDigest',
      ratingDigest
    ),
  });
};

const signedIndependence = (
  identity: SigningIdentity,
  input: Readonly<{
    planDigest: string;
    blindedArtifactSetDigest: string;
    independencePolicyDigest: string;
    testedModelFamilyOwnerSetDigest: string;
    conflictModelFamilyOwnerSetDigest?: string;
  }>
): AgentEvaluationHumanReviewIndependenceAttestation => {
  const base = Object.freeze({
    format: 'prodivix.g4-human-review-independence-attestation' as const,
    version: 1 as const,
    attestationId: `independence.${identity.authorityId}`,
    planDigest: input.planDigest,
    blindedArtifactSetDigest: input.blindedArtifactSetDigest,
    authorityId: identity.authorityId,
    authorityPseudonym: identity.pseudonym,
    role: identity.role,
    keyId: identity.keyId,
    independencePolicyDigest: input.independencePolicyDigest,
    testedModelFamilyOwnerSetDigest: input.testedModelFamilyOwnerSetDigest,
    conflictModelFamilyOwnerSetDigest:
      input.conflictModelFamilyOwnerSetDigest ??
      digestAgentCanonicalValue({
        format: 'prodivix.g4-conflict-model-family-owner-set',
        version: 1,
        ownerIds: [],
      }),
    issuedAt: exportedAt,
    expiresAt,
  });
  const attestationDigest = digestAgentCanonicalValue(base);
  const draft = { ...base, attestationDigest, signatureBase64Url: '' };
  return Object.freeze({
    ...base,
    attestationDigest,
    signatureBase64Url: signatureFor(
      identity.privateKey,
      agentEvaluationHumanReviewIndependencePayload(draft),
      'attestationDigest',
      attestationDigest
    ),
  });
};

const registryWith = (
  fixture: Fixture,
  attestations: readonly AgentEvaluationHumanReviewIndependenceAttestation[],
  overrides: Partial<
    Omit<AgentEvaluationHumanReviewIndependenceRegistry, 'registryDigest'>
  > = {}
): AgentEvaluationHumanReviewIndependenceRegistry => {
  const base = Object.freeze({
    format: 'prodivix.g4-human-review-independence-registry' as const,
    version: 1 as const,
    submissionId: 'submission.review.test',
    planDigest: fixture.config.plan.planDigest,
    repositoryCommit,
    planPlannedAt: plannedAt,
    blindBundleDigest: fixture.bundle.bundleDigest,
    reviewLeaseDigest: fixture.bundle.reviewLeaseDigest,
    blindedArtifactSetDigest: fixture.bundle.blindedArtifactSetDigest,
    trustRegistryDigest:
      fixture.config.execution.humanReview.trustRegistry.registryDigest,
    adjudicationPolicyDigest:
      fixture.config.execution.humanReview.adjudicationPolicy.policyDigest,
    attestations: Object.freeze([...attestations]),
    ...overrides,
  });
  return Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
};

const submissionWith = (
  fixture: Fixture,
  ratings: readonly AgentEvaluationHumanReviewSignedRating[],
  registry: AgentEvaluationHumanReviewIndependenceRegistry,
  decisions: readonly AgentEvaluationHumanReviewAdjudicationDecision[] = []
): AgentEvaluationHumanReviewSubmission => {
  const base = Object.freeze({
    format: 'prodivix.g4-human-review-submission' as const,
    version: 1 as const,
    submissionId: registry.submissionId,
    blindBundleDigest: fixture.bundle.bundleDigest,
    reviewLeaseDigest: fixture.bundle.reviewLeaseDigest,
    blindedArtifactSetDigest: fixture.bundle.blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      fixture.bundle.randomizedPresentationPolicyDigest,
    sourceProvenance: fixture.sourceProvenance,
    signedRatings: Object.freeze([...ratings]),
    adjudicationDecisions: Object.freeze([...decisions]),
    independenceRegistryDigest: registry.registryDigest,
    submittedAt: ratedAt,
  });
  return Object.freeze({
    ...base,
    submissionDigest: digestAgentCanonicalValue(base),
  });
};

type Fixture = Readonly<{
  adjudicator: SigningIdentity;
  reviewers: readonly [SigningIdentity, SigningIdentity];
  config: AgentEvaluationProductionFrozenRunConfig;
  bundle: AgentEvaluationBlindReviewBundle;
  sourceProvenance: Readonly<{
    sourceRunId: string;
    sourceRunAttempt: number;
    sourceArtifactName: string;
    sourceArtifactDigest: string;
  }>;
  registry: AgentEvaluationHumanReviewIndependenceRegistry;
  submission: AgentEvaluationHumanReviewSubmission;
  input: AgentEvaluationHumanReviewValidationInput;
}>;

const fixture = (): Fixture => {
  const adjudicator = signingIdentity(
    'authority.review.adjudicator',
    'adjudicator-c',
    'adjudicator'
  );
  const reviewers = Object.freeze([
    signingIdentity('authority.review.a', 'reviewer-a', 'reviewer'),
    signingIdentity('authority.review.b', 'reviewer-b', 'reviewer'),
  ]) as readonly [SigningIdentity, SigningIdentity];
  const independencePolicyDigest = digest('independence-policy');
  const trustRegistry = trustRegistryFor(
    [adjudicator, ...reviewers]
      .map((entry) => authorityFor(entry, independencePolicyDigest))
      .sort((left, right) => left.authorityId.localeCompare(right.authorityId))
  );
  const reviewerAuthorityIds = Object.freeze(
    reviewers.map(({ authorityId }) => authorityId)
  );
  const adjudicationPolicy = policyFor(
    trustRegistry,
    reviewerAuthorityIds,
    adjudicator,
    independencePolicyDigest
  );
  const bundle = blindBundle();
  const plan = {
    planDigest: digest('plan'),
    repositoryCommit,
    plannedAt,
    expiresAt,
    modelConfigurations: Object.freeze([
      Object.freeze({ modelFamilyOwnerId: 'model-owner.alpha' }),
    ]),
  } as unknown as AgentModelEvaluationPlan;
  const config = {
    purpose: 'production',
    plan,
    execution: {
      humanReview: {
        minimumIndependentRatings: 2,
        reviewerAuthorityIds,
        adjudicationAuthorityId: adjudicator.authorityId,
        artifactMaximumBytes: 16_777_216,
        reviewerTrustRegistryDigest: trustRegistry.registryDigest,
        randomizedPresentationPolicyDigest:
          bundle.randomizedPresentationPolicyDigest,
        publicRubrics: bundle.rubrics,
        trustRegistry,
        adjudicationPolicy,
      },
    },
  } as unknown as AgentEvaluationProductionFrozenRunConfig;
  const sourceProvenance = Object.freeze({
    sourceRunId: '123456789',
    sourceRunAttempt: 1,
    sourceArtifactName: 'g4-blind-review',
    sourceArtifactDigest: `sha256:${'a'.repeat(64)}`,
  });
  const partial = { adjudicator, reviewers, config, bundle, sourceProvenance };
  const testedModelFamilyOwnerSetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-tested-model-family-owner-set',
    version: 1,
    ownerIds: ['model-owner.alpha'],
  });
  const attestations = reviewers.map((reviewer) =>
    signedIndependence(reviewer, {
      planDigest: plan.planDigest,
      blindedArtifactSetDigest: bundle.blindedArtifactSetDigest,
      independencePolicyDigest,
      testedModelFamilyOwnerSetDigest,
    })
  );
  const holder = partial as Fixture;
  const registry = registryWith(holder, attestations);
  const submission = submissionWith(
    holder,
    reviewers.map((reviewer) => signedRating(reviewer, bundle, 'passed')),
    registry
  );
  const input = Object.freeze({
    bundle,
    submission,
    independenceRegistry: registry,
    config,
    sourceProvenance,
    validatedAt,
  });
  return Object.freeze({
    ...partial,
    registry,
    submission,
    input,
  });
};

const expectRejected = (callback: () => unknown): void => {
  expect(callback).toThrow(
    expect.objectContaining({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    })
  );
};

describe('human review validation', () => {
  it('accepts two independent unanimous ratings and preserves raw signatures', () => {
    const value = fixture();
    expect(decodeAgentEvaluationBlindReviewBundle(value.bundle)).toEqual(
      value.bundle
    );
    expect(
      decodeAgentEvaluationHumanReviewSubmission(value.submission)
    ).toEqual(value.submission);
    const payload = createAgentEvaluationHumanReviewValidationPayload(
      value.input
    );
    expect(payload.signedRatings).toEqual(value.submission.signedRatings);
    expect(payload.independenceAttestations).toEqual(
      value.registry.attestations
    );
    expect(payload.validationReceipt.candidateAdjudications).toEqual([
      expect.objectContaining({
        randomizedPresentationId: blindPresentationId,
        verdict: 'passed',
      }),
    ]);
  });

  it('re-verifies every retained signature and the normalized artifact binding', async () => {
    const value = fixture();
    const payload = createAgentEvaluationHumanReviewValidationPayload(
      value.input
    );
    const reviewArtifact = await createSignedAgentEvaluationHumanReviewImport({
      payload,
      authority: Object.freeze({
        authorityId: value.adjudicator.authorityId,
        keyId: value.adjudicator.keyId,
        workflowName: 'g4-real-model-human-review',
        workflowRunId: 'workflow-run.review-validation-test',
        workflowRunAttempt: 1,
        signedAt: validatedAt,
      }),
      sign: (message) =>
        signEd25519(null, message, value.adjudicator.privateKey).toString(
          'base64url'
        ),
    });
    const ratings = Object.freeze(
      reviewArtifact.signedRatings.map((rating) =>
        createAgentHumanReviewRating({
          ratingId: rating.ratingId,
          attemptId: `evaluation-attempt:${'c'.repeat(64)}`,
          reviewerPseudonym: rating.reviewerPseudonym,
          randomizedPresentationId: rating.randomizedPresentationId,
          rubricDigest: rating.rubricDigest,
          criterionVerdicts: rating.criterionVerdicts,
          verdict: rating.verdict,
        })
      )
    );
    const humanReviewReport = createAgentHumanReviewReport({
      reportId: 'evaluation-human-review:review-validation-test',
      planDigest: reviewArtifact.planDigest,
      blindedArtifactSetDigest: reviewArtifact.blindedArtifactSetDigest,
      ratings,
      adjudicationDigest: reviewArtifact.validationReceipt.adjudicationDigest,
      generatedAt: '2026-08-08T03:00:00.001Z',
    });
    const validatedArtifact = createAgentEvaluationValidatedHumanReviewArtifact(
      {
        reviewArtifact,
        humanReviewReport,
        publicRubrics: value.bundle.rubrics,
        trustRegistry: value.config.execution.humanReview.trustRegistry,
        adjudicationPolicy:
          value.config.execution.humanReview.adjudicationPolicy,
      }
    );

    expect(
      verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig(
        reviewArtifact,
        value.config
      )
    ).toBe(true);
    expect(
      verifyProductionAgentEvaluationValidatedHumanReviewArtifact({
        plan: value.config.plan,
        artifact: validatedArtifact,
        humanReviewReport,
        config: value.config,
      })
    ).toBe(true);

    const signedRating = reviewArtifact.signedRatings[0]!;
    expect(
      verifyProductionAgentEvaluationHumanReviewImportAgainstFrozenConfig(
        {
          ...reviewArtifact,
          signedRatings: Object.freeze([
            Object.freeze({
              ...signedRating,
              criterionVerdicts: Object.freeze([
                Object.freeze({
                  criterionId: 'visual-quality',
                  verdict: 'failed' as const,
                }),
              ]),
            }),
            reviewArtifact.signedRatings[1]!,
          ]),
        },
        value.config
      )
    ).toBe(false);
  });

  it('rejects a self-signed rating and frozen trust-registry drift', () => {
    const value = fixture();
    const [first, second] = value.reviewers;
    const firstRating = signedRating(first, value.bundle, 'passed');
    const forged = Object.freeze({
      ...firstRating,
      signatureBase64Url: signatureFor(
        value.adjudicator.privateKey,
        agentEvaluationHumanReviewRatingPayload(firstRating),
        'ratingDigest',
        firstRating.ratingDigest
      ),
    });
    const forgedSubmission = submissionWith(
      value,
      [forged, signedRating(second, value.bundle, 'passed')],
      value.registry
    );
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: forgedSubmission,
      })
    );

    const driftedRegistry = registryWith(value, value.registry.attestations, {
      trustRegistryDigest: digest('self-authorized-registry'),
    });
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        independenceRegistry: driftedRegistry,
        submission: submissionWith(
          value,
          value.submission.signedRatings,
          driftedRegistry
        ),
      })
    );
  });

  it('rejects duplicate reviewers and model-owner independence drift', () => {
    const value = fixture();
    const first = value.reviewers[0];
    const duplicateRatings = [
      signedRating(first, value.bundle, 'passed', 'duplicate-a'),
      signedRating(first, value.bundle, 'passed', 'duplicate-b'),
    ];
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: submissionWith(value, duplicateRatings, value.registry),
      })
    );

    const driftedAttestation = signedIndependence(first, {
      planDigest: value.config.plan.planDigest,
      blindedArtifactSetDigest: value.bundle.blindedArtifactSetDigest,
      independencePolicyDigest:
        value.config.execution.humanReview.adjudicationPolicy
          .independencePolicyDigest,
      testedModelFamilyOwnerSetDigest: digest('wrong-model-owner-set'),
    });
    const driftedRegistry = registryWith(value, [
      driftedAttestation,
      value.registry.attestations[1]!,
    ]);
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        independenceRegistry: driftedRegistry,
        submission: submissionWith(
          value,
          value.submission.signedRatings,
          driftedRegistry
        ),
      })
    );
  });

  it('rejects GitHub source/run drift and repository commit drift', () => {
    const value = fixture();
    const { submissionDigest: _submissionDigest, ...submissionWithoutDigest } =
      value.submission;
    const leaseDriftBase = Object.freeze({
      ...submissionWithoutDigest,
      reviewLeaseDigest: digest('swapped-review-lease'),
    });
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: Object.freeze({
          ...leaseDriftBase,
          submissionDigest: digestAgentCanonicalValue(leaseDriftBase),
        }),
      })
    );
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        sourceProvenance: {
          ...value.sourceProvenance,
          sourceRunId: '987654321',
        },
      })
    );
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        sourceProvenance: {
          ...value.sourceProvenance,
          sourceArtifactDigest: `sha256:${'b'.repeat(64)}`,
        },
      })
    );
    const commitDrift = registryWith(value, value.registry.attestations, {
      repositoryCommit: 'f'.repeat(40),
    });
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        independenceRegistry: commitDrift,
        submission: submissionWith(
          value,
          value.submission.signedRatings,
          commitDrift
        ),
      })
    );

    const invalidSource = {
      ...value.submission,
      sourceProvenance: {
        ...value.sourceProvenance,
        sourceArtifactDigest: `sha256-${'a'.repeat(64)}`,
      },
    };
    expect(() =>
      decodeAgentEvaluationHumanReviewSubmission(invalidSource)
    ).toThrow(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
      })
    );
  });

  it('rejects missing or extra blind IDs and missing adjudication', () => {
    const value = fixture();
    const emptySubmission = submissionWith(value, [], value.registry);
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: emptySubmission,
      })
    );
    const unknownIdRatings = value.submission.signedRatings.map((rating) => {
      const identity = value.reviewers.find(
        ({ authorityId }) => authorityId === rating.reviewerAuthorityId
      )!;
      const base = {
        ...rating,
        randomizedPresentationId: `blind-review:${'B'.repeat(43)}`,
      };
      const payload = agentEvaluationHumanReviewRatingPayload(base);
      const ratingDigest = digestAgentCanonicalValue(payload);
      return Object.freeze({
        ...base,
        ratingDigest,
        signatureBase64Url: signatureFor(
          identity.privateKey,
          payload,
          'ratingDigest',
          ratingDigest
        ),
      });
    });
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: submissionWith(value, unknownIdRatings, value.registry),
      })
    );

    const disagreement = submissionWith(
      value,
      [
        signedRating(value.reviewers[0], value.bundle, 'passed'),
        signedRating(value.reviewers[1], value.bundle, 'failed'),
      ],
      value.registry
    );
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: disagreement,
      })
    );
  });

  it('rejects an invalid adjudicator decision and public identity leaks', () => {
    const value = fixture();
    const ratings = [
      signedRating(value.reviewers[0], value.bundle, 'passed'),
      signedRating(value.reviewers[1], value.bundle, 'failed'),
    ];
    const decisionBase = Object.freeze({
      format: 'prodivix.g4-human-review-adjudication-decision' as const,
      version: 1 as const,
      decisionId: 'decision.review.test',
      randomizedPresentationId: blindPresentationId,
      rubricDigest: publicRubric.rubricDigest,
      blindedArtifactSetDigest: value.bundle.blindedArtifactSetDigest,
      adjudicationAuthorityId: value.adjudicator.authorityId,
      adjudicatorPseudonym: value.adjudicator.pseudonym,
      keyId: value.adjudicator.keyId,
      candidateDigest: digestAgentCanonicalValue(value.bundle.candidates[0]),
      planDigest: value.config.plan.planDigest,
      policyDigest:
        value.config.execution.humanReview.adjudicationPolicy.policyDigest,
      ratingDigests: Object.freeze(
        ratings.map(({ ratingDigest }) => ratingDigest).sort()
      ),
      reviewerAuthorityIds: Object.freeze(
        ratings.map(({ reviewerAuthorityId }) => reviewerAuthorityId).sort()
      ),
      criterionVerdicts: Object.freeze([
        Object.freeze({
          criterionId: 'visual-quality',
          verdict: 'passed' as const,
        }),
      ]),
      decision: 'passed' as const,
      decidedAt: validatedAt,
    });
    const decisionDigest = digestAgentCanonicalValue(
      agentEvaluationHumanReviewAdjudicationPayload({
        ...decisionBase,
        decisionDigest: digest('placeholder'),
        signatureBase64Url: 'A'.repeat(86),
      })
    );
    const invalidDecision = Object.freeze({
      ...decisionBase,
      decisionDigest,
      signatureBase64Url: signatureFor(
        value.reviewers[0].privateKey,
        agentEvaluationHumanReviewAdjudicationPayload({
          ...decisionBase,
          decisionDigest,
          signatureBase64Url: 'A'.repeat(86),
        }),
        'decisionDigest',
        decisionDigest
      ),
    });
    expectRejected(() =>
      createAgentEvaluationHumanReviewValidationPayload({
        ...value.input,
        submission: submissionWith(value, ratings, value.registry, [
          invalidDecision,
        ]),
      })
    );

    for (const leak of [
      { attemptId: 'evaluation-attempt.secret' },
      { providerConfigurationId: 'provider.secret' },
      { rawResponse: 'credential-canary-secret' },
    ]) {
      const candidate = { ...value.bundle.candidates[0], ...leak };
      const unsafeBundle = {
        ...value.bundle,
        candidates: [candidate],
      };
      expect(() =>
        decodeAgentEvaluationBlindReviewBundle(unsafeBundle)
      ).toThrow(
        expect.objectContaining({
          code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
        })
      );
    }
  });
});
