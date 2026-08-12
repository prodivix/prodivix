import {
  createPrivateKey,
  createPublicKey,
  sign as signEd25519,
} from 'node:crypto';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import {
  buildAgentEvaluationGraderReport,
  buildAgentEvaluationMetricReport,
  createAgentEvaluationGraderPlan,
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
  createAgentModelEvaluationPlan,
  createAgentModelEvaluationThresholds,
  digestAgentCanonicalValue,
  digestAgentEvaluationAttemptGrading,
  planAgentModelEvaluationAttempts,
} from '../packages/ai/src/index.ts';
import {
  AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
  agentEvaluationHumanReviewAdjudicationPayload,
  agentEvaluationHumanReviewIndependencePayload,
  agentEvaluationHumanReviewRatingPayload,
  createAgentEvaluationValidatedHumanReviewArtifact,
} from '../packages/ai/src/evaluation/agentEvaluationValidatedHumanReview.ts';
import {
  createAgentEvaluationValidatedHumanMetricObservations,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
} from '../packages/ai/src/evaluation/agentEvaluationHumanMetricAuthority.ts';
import {
  createPassingV8Attempts,
  createV8EvaluationPlan,
  createV8PublicReviewRubric,
} from '../packages/ai/src/__tests__/agentV8Fixtures.ts';

const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
const identity = (authorityId, pseudonym, role, fill) => {
  const seed = Buffer.alloc(32, fill);
  const privateKey = createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  seed.fill(0);
  const publicDer = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  });
  return Object.freeze({
    authorityId,
    pseudonym,
    role,
    keyId: `key.${pseudonym}`,
    privateKey,
    publicKeyBase64Url: publicDer
      .subarray(publicDer.length - 32)
      .toString('base64url'),
  });
};

const signCanonical = (privateKey, value) =>
  signEd25519(
    null,
    Buffer.from(canonicalJsonText(value), 'utf8'),
    privateKey
  ).toString('base64url');

const signatureMessage = (payload, digestField, digest) =>
  Object.freeze({ ...payload, [digestField]: digest });

let cachedVector;

/** Shared TypeScript/Go human-review authority, projection, and report vector. */
export const createG4AgentEvaluationHumanAuthorityVector = () => {
  if (cachedVector) return cachedVector;
  const fixturePlan = createV8EvaluationPlan();
  const rubric = createV8PublicReviewRubric();
  const {
    plannedJourneyCount: _plannedJourneyCount,
    plannedAttemptSetDigest: _plannedAttemptSetDigest,
    planDigest: _planDigest,
    ...planInput
  } = fixturePlan;
  const { planDigest: _graderPlanDigest, ...graderPlanInput } =
    fixturePlan.graderPlan;
  const graderPlan = createAgentEvaluationGraderPlan({
    ...graderPlanInput,
    graders: Object.freeze(
      graderPlanInput.graders.map((grader) =>
        grader.graderId === graderPlanInput.blindHumanGraderIds[0]
          ? Object.freeze({
              ...grader,
              configurationDigest: rubric.rubricDigest,
            })
          : grader
      )
    ),
  });
  const humanMetrics = [
    ...rubric.metricMappings.map(({ metricId }) => metricId),
    rubric.interRaterDisagreementMetricId,
  ];
  const thresholds = createAgentModelEvaluationThresholds({
    metrics: Object.freeze([
      ...fixturePlan.thresholds.metrics,
      ...humanMetrics.map((metricId) =>
        Object.freeze({
          metricId,
          requiredAuthority: 'human',
          maximumObservedFailureRate: '1',
          minimumSampleCount: 1,
        })
      ),
    ]),
    multipleComparisonPolicyDigest:
      fixturePlan.thresholds.multipleComparisonPolicyDigest,
    slicePolicyDigest: fixturePlan.thresholds.slicePolicyDigest,
  });
  const plan = createAgentModelEvaluationPlan({
    ...planInput,
    graderPlan,
    thresholds,
  });
  const allAttempts = createPassingV8Attempts(plan);
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const cases = new Map(
    plan.concreteCases.map((entry) => [entry.caseId, entry])
  );
  const reviewedAttempts = allAttempts
    .filter((attempt) => {
      const entry = cases.get(attempt.descriptor.caseId);
      return entry?.access === 'public' && entry.subjectiveVisualQuality;
    })
    .slice(0, 2);
  if (reviewedAttempts.length !== 2) {
    throw new TypeError(
      'The V8 vector requires two public subjective attempts.'
    );
  }

  const criterionIds = rubric.criteria
    .filter(({ required }) => required)
    .map(({ criterionId }) => criterionId);
  const verdicts = (failedCriterionId) =>
    Object.freeze(
      criterionIds.map((criterionId) =>
        Object.freeze({
          criterionId,
          verdict: criterionId === failedCriterionId ? 'failed' : 'passed',
        })
      )
    );
  const reviewerA = identity(
    'reviewer.authority.a',
    'reviewer.a',
    'reviewer',
    1
  );
  const reviewerB = identity(
    'reviewer.authority.b',
    'reviewer.b',
    'reviewer',
    2
  );
  const adjudicator = identity(
    'adjudicator.authority.a',
    'adjudicator.a',
    'adjudicator',
    3
  );
  const identities = [adjudicator, reviewerA, reviewerB].sort((left, right) =>
    left.authorityId < right.authorityId ? -1 : 1
  );
  const independencePolicyDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-independence-policy',
    version: 1,
    prohibitedOwnerOverlap: true,
  });
  const authorities = Object.freeze(
    identities.map((entry) => {
      const base = Object.freeze({
        authorityId: entry.authorityId,
        pseudonym: entry.pseudonym,
        role: entry.role,
        keyId: entry.keyId,
        publicKeyBase64Url: entry.publicKeyBase64Url,
        validFrom: '2026-08-01T00:00:00.000Z',
        validUntil: '2026-08-10T00:00:00.000Z',
        independencePolicyDigest,
      });
      return Object.freeze({
        ...base,
        authorityDigest: digestAgentCanonicalValue(base),
      });
    })
  );
  const authoritySetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-authority-set',
    version: 1,
    authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
  });
  const trustRegistryBase = Object.freeze({
    format: 'prodivix.g4-human-review-trust-registry',
    version: 1,
    registryId: 'human-review.registry.vector',
    authorities,
    authoritySetDigest,
  });
  const trustRegistry = Object.freeze({
    ...trustRegistryBase,
    registryDigest: digestAgentCanonicalValue(trustRegistryBase),
  });
  const adjudicationPolicyBase = Object.freeze({
    minimumIndependentRatings: 2,
    reviewerAuthorityIds: Object.freeze([
      reviewerA.authorityId,
      reviewerB.authorityId,
    ]),
    adjudicationAuthorityId: adjudicator.authorityId,
    adjudicatorKeyId: adjudicator.keyId,
    trigger: 'reviewer-disagreement',
    trustRegistryDigest: trustRegistry.registryDigest,
    independencePolicyDigest,
    consensusRule: 'unanimous',
    disagreementRule: 'escalate-to-independent-adjudicator',
    reviewerRatingSignaturesRequired: true,
    adjudicatorDecisionSignatureRequired: true,
    signatureAlgorithm: 'Ed25519',
    decisionPayloadFields:
      AGENT_EVALUATION_HUMAN_REVIEW_ADJUDICATION_DECISION_PAYLOAD_FIELDS,
  });
  const adjudicationPolicy = Object.freeze({
    ...adjudicationPolicyBase,
    policyDigest: digestAgentCanonicalValue(adjudicationPolicyBase),
  });

  const blindedArtifactSetDigest = digestAgentCanonicalValue(
    'human-authority-vector-blinded-artifact-set'
  );
  const blindBundleDigest = digestAgentCanonicalValue(
    'human-authority-vector-blind-bundle'
  );
  const reviewLeaseDigest = digestAgentCanonicalValue(
    'human-authority-vector-review-lease'
  );
  const presentations = reviewedAttempts.map((attempt, index) =>
    Object.freeze({
      attempt,
      presentationId: `presentation.vector.${index + 1}`,
      candidateDigest: digestAgentCanonicalValue({
        attemptId: attempt.descriptor.attemptId,
        raster: `candidate-${index + 1}`,
      }),
    })
  );
  const ratingMessages = [];
  const signedRatings = Object.freeze(
    presentations.flatMap((presentation, presentationIndex) =>
      [reviewerA, reviewerB].map((reviewer, reviewerIndex) => {
        const failedCriterionId =
          presentationIndex === 1 && reviewerIndex === 1
            ? criterionIds.at(-1)
            : undefined;
        const payload = Object.freeze({
          format: 'prodivix.g4-human-review-signed-rating',
          version: 1,
          ratingId: `rating.vector.${presentationIndex + 1}.${reviewerIndex + 1}`,
          randomizedPresentationId: presentation.presentationId,
          rubricDigest: rubric.rubricDigest,
          blindedArtifactSetDigest,
          reviewerAuthorityId: reviewer.authorityId,
          reviewerPseudonym: reviewer.pseudonym,
          keyId: reviewer.keyId,
          criterionVerdicts: verdicts(failedCriterionId),
          verdict: failedCriterionId ? 'failed' : 'passed',
          ratedAt: `2026-08-02T02:1${presentationIndex * 2 + reviewerIndex}:00.000Z`,
        });
        const ratingDigest = digestAgentCanonicalValue(payload);
        const message = signatureMessage(payload, 'ratingDigest', ratingDigest);
        const rating = Object.freeze({
          ...payload,
          ratingDigest,
          signatureBase64Url: signCanonical(reviewer.privateKey, message),
        });
        if (
          digestAgentCanonicalValue(
            agentEvaluationHumanReviewRatingPayload(rating)
          ) !== ratingDigest
        ) {
          throw new TypeError('Rating payload helper drifted.');
        }
        ratingMessages.push(
          Object.freeze({
            id: rating.ratingId,
            publicKeyBase64Url: reviewer.publicKeyBase64Url,
            canonicalJson: canonicalJsonText(message),
            signatureBase64Url: rating.signatureBase64Url,
          })
        );
        return rating;
      })
    )
  );

  const ratingsFor = (presentationId) =>
    signedRatings.filter(
      ({ randomizedPresentationId }) =>
        randomizedPresentationId === presentationId
    );
  const disagreementRatings = ratingsFor(presentations[1].presentationId);
  const decisionPayload = Object.freeze({
    format: 'prodivix.g4-human-review-adjudication-decision',
    version: 1,
    decisionId: 'decision.vector.2',
    randomizedPresentationId: presentations[1].presentationId,
    rubricDigest: rubric.rubricDigest,
    blindedArtifactSetDigest,
    adjudicationAuthorityId: adjudicator.authorityId,
    adjudicatorPseudonym: adjudicator.pseudonym,
    keyId: adjudicator.keyId,
    candidateDigest: presentations[1].candidateDigest,
    planDigest: plan.planDigest,
    policyDigest: adjudicationPolicy.policyDigest,
    ratingDigests: Object.freeze(
      disagreementRatings
        .map(({ ratingDigest }) => ratingDigest)
        .sort(compareUnicodeCodePoints)
    ),
    reviewerAuthorityIds: Object.freeze(
      disagreementRatings
        .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
        .sort(compareUnicodeCodePoints)
    ),
    criterionVerdicts: verdicts(),
    decision: 'passed',
    decidedAt: '2026-08-02T02:20:00.000Z',
  });
  const decisionDigest = digestAgentCanonicalValue(decisionPayload);
  const decisionMessage = signatureMessage(
    decisionPayload,
    'decisionDigest',
    decisionDigest
  );
  const decision = Object.freeze({
    ...decisionPayload,
    decisionDigest,
    signatureBase64Url: signCanonical(adjudicator.privateKey, decisionMessage),
  });
  if (
    digestAgentCanonicalValue(
      agentEvaluationHumanReviewAdjudicationPayload(decision)
    ) !== decisionDigest
  ) {
    throw new TypeError('Adjudication payload helper drifted.');
  }

  const testedModelFamilyOwnerSetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-tested-model-family-owner-set',
    version: 1,
    ownerIds: plan.modelConfigurations
      .map(({ modelFamilyOwnerId }) => modelFamilyOwnerId)
      .sort(compareUnicodeCodePoints),
  });
  const conflictModelFamilyOwnerSetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-conflict-model-family-owner-set',
    version: 1,
    ownerIds: [],
  });
  const independenceMessages = [];
  const independenceAttestations = Object.freeze(
    identities.map((entry, index) => {
      const payload = Object.freeze({
        format: 'prodivix.g4-human-review-independence-attestation',
        version: 1,
        attestationId: `independence.vector.${index + 1}`,
        planDigest: plan.planDigest,
        blindedArtifactSetDigest,
        authorityId: entry.authorityId,
        authorityPseudonym: entry.pseudonym,
        role: entry.role,
        keyId: entry.keyId,
        independencePolicyDigest,
        testedModelFamilyOwnerSetDigest,
        conflictModelFamilyOwnerSetDigest,
        issuedAt: '2026-08-02T02:05:00.000Z',
        expiresAt: '2026-08-09T00:00:00.000Z',
      });
      const attestationDigest = digestAgentCanonicalValue(payload);
      const message = signatureMessage(
        payload,
        'attestationDigest',
        attestationDigest
      );
      const attestation = Object.freeze({
        ...payload,
        attestationDigest,
        signatureBase64Url: signCanonical(entry.privateKey, message),
      });
      if (
        digestAgentCanonicalValue(
          agentEvaluationHumanReviewIndependencePayload(attestation)
        ) !== attestationDigest
      ) {
        throw new TypeError('Independence payload helper drifted.');
      }
      independenceMessages.push(
        Object.freeze({
          id: attestation.attestationId,
          publicKeyBase64Url: entry.publicKeyBase64Url,
          canonicalJson: canonicalJsonText(message),
          signatureBase64Url: attestation.signatureBase64Url,
        })
      );
      return attestation;
    })
  );

  const candidateAdjudications = Object.freeze(
    presentations.map((presentation, index) => {
      const ratings = ratingsFor(presentation.presentationId);
      const base = {
        randomizedPresentationId: presentation.presentationId,
        candidateDigest: presentation.candidateDigest,
        rubricDigest: rubric.rubricDigest,
        ratingDigests: Object.freeze(
          ratings
            .map(({ ratingDigest }) => ratingDigest)
            .sort(compareUnicodeCodePoints)
        ),
        reviewerAuthorityIds: Object.freeze(
          ratings
            .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
            .sort(compareUnicodeCodePoints)
        ),
        criterionVerdicts: verdicts(),
        verdict: 'passed',
      };
      return Object.freeze(
        index === 1
          ? { ...base, decisionDigest: decision.decisionDigest }
          : base
      );
    })
  );
  const sourceProvenance = Object.freeze({
    sourceRunId: '123456',
    sourceRunAttempt: 1,
    sourceArtifactName: 'g4-human-authority-vector',
    sourceArtifactDigest: `sha256:${'a'.repeat(64)}`,
  });
  const submissionDigest = digestAgentCanonicalValue(
    'human-authority-vector-submission'
  );
  const validationReceiptBase = Object.freeze({
    format: 'prodivix.g4-human-review-validation-receipt',
    version: 1,
    receiptId: `human-review-validation:${submissionDigest.slice('sha256-'.length)}`,
    submissionId: 'submission.vector',
    submissionDigest,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    trustRegistryDigest: trustRegistry.registryDigest,
    authoritySetDigest: trustRegistry.authoritySetDigest,
    adjudicationPolicyDigest: adjudicationPolicy.policyDigest,
    ratingSignatureSetDigest: digestAgentCanonicalValue(
      signedRatings.map(({ ratingDigest, signatureBase64Url }) => ({
        ratingDigest,
        signatureBase64Url,
      }))
    ),
    independenceAttestationSetDigest: digestAgentCanonicalValue(
      independenceAttestations.map(
        ({ attestationDigest, signatureBase64Url }) => ({
          attestationDigest,
          signatureBase64Url,
        })
      )
    ),
    adjudicationDecisionSetDigest: digestAgentCanonicalValue([
      {
        decisionDigest: decision.decisionDigest,
        signatureBase64Url: decision.signatureBase64Url,
      },
    ]),
    candidateAdjudications,
    candidateAdjudicationSetDigest: digestAgentCanonicalValue(
      candidateAdjudications
    ),
    adjudicationDigest: digestAgentCanonicalValue({
      format: 'prodivix.g4-human-review-adjudication-set',
      version: 1,
      policyDigest: adjudicationPolicy.policyDigest,
      candidates: candidateAdjudications,
    }),
    validatedAt: '2026-08-02T02:30:00.000Z',
  });
  const validationReceipt = Object.freeze({
    ...validationReceiptBase,
    receiptDigest: digestAgentCanonicalValue(validationReceiptBase),
  });
  const reviewPayload = Object.freeze({
    format: AGENT_EVALUATION_HUMAN_REVIEW_IMPORT_FORMAT,
    version: 1,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    blindBundleDigest,
    reviewLeaseDigest,
    blindedArtifactSetDigest,
    randomizedPresentationPolicyDigest:
      plan.graderPlan.randomizedPresentationPolicyDigest,
    sourceProvenance,
    signedRatings,
    independenceAttestations,
    adjudicationDecisions: Object.freeze([decision]),
    validationReceipt,
    reviewedAt: '2026-08-02T02:25:00.000Z',
  });
  const artifactAuthority = Object.freeze({
    authorityId: adjudicator.authorityId,
    keyId: adjudicator.keyId,
    workflowName: 'g4-real-model-human-review',
    workflowRunId: '987654',
    workflowRunAttempt: 1,
    signedAt: validationReceipt.validatedAt,
    payloadDigest: digestAgentCanonicalValue(reviewPayload),
    signatureBase64Url: signCanonical(adjudicator.privateKey, reviewPayload),
  });
  const reviewArtifact = Object.freeze({
    ...reviewPayload,
    artifactAuthority,
    artifactDigest: digestAgentCanonicalValue({
      ...reviewPayload,
      artifactAuthority,
    }),
  });
  const humanReviewReport = createAgentHumanReviewReport({
    reportId: 'evaluation-human-review:human-authority-vector',
    planDigest: plan.planDigest,
    blindedArtifactSetDigest,
    ratings: Object.freeze(
      signedRatings.map((rating) => {
        const presentation = presentations.find(
          ({ presentationId }) =>
            presentationId === rating.randomizedPresentationId
        );
        return createAgentHumanReviewRating({
          ratingId: rating.ratingId,
          attemptId: presentation.attempt.descriptor.attemptId,
          reviewerPseudonym: rating.reviewerPseudonym,
          randomizedPresentationId: rating.randomizedPresentationId,
          rubricDigest: rating.rubricDigest,
          criterionVerdicts: rating.criterionVerdicts,
          verdict: rating.verdict,
        });
      })
    ),
    adjudicationDigest: validationReceipt.adjudicationDigest,
    generatedAt: '2026-08-02T03:00:00.000Z',
  });
  const validatedHumanReviewArtifact =
    createAgentEvaluationValidatedHumanReviewArtifact({
      reviewArtifact,
      humanReviewReport,
      publicRubrics: Object.freeze([rubric]),
      trustRegistry,
      adjudicationPolicy,
    });
  const validatedHumanMetricObservations =
    createAgentEvaluationValidatedHumanMetricObservations({
      plan,
      attempts: reviewedAttempts,
      humanReviewReport,
      validatedHumanReviewArtifact,
    });
  const completedAt = '2026-08-02T04:00:00.000Z';
  const metricReport = buildAgentEvaluationMetricReport({
    reportId: `evaluation-metric-report:${plan.planDigest.slice('sha256-'.length)}`,
    plan,
    descriptors,
    attempts: reviewedAttempts,
    validatedHumanMetricObservations,
    generatedAt: completedAt,
  });
  const graderReport = buildAgentEvaluationGraderReport({
    reportId: `evaluation-grader-report:${plan.planDigest.slice('sha256-'.length)}`,
    plan,
    attempts: reviewedAttempts,
    validatedHumanMetricObservations,
    generatedAt: completedAt,
  });

  const gradingAttempt = reviewedAttempts[0];
  const gradingExecution = Object.freeze({
    modelInvocations: 1,
    toolCalls: 0,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    capabilityExecutionReceiptSetDigest:
      gradingAttempt.capabilityExecutionReceiptSetDigest,
    verificationAttemptGrantReceiptSetDigest:
      gradingAttempt.verificationAttemptGrantReceiptSetDigest,
  });
  const terminalTurnReceiptDigest = digestAgentCanonicalValue({
    vector: 'human-authority-grading-terminal-turn',
  });
  const capabilityExecutionReceiptDigest = digestAgentCanonicalValue({
    vector: 'human-authority-grading-capability-execution',
  });
  const gradingDigest = digestAgentEvaluationAttemptGrading({
    descriptorDigest: gradingAttempt.descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest:
      gradingAttempt.invocationTurnSetReceiptDigest,
    terminalTurnReceiptDigest,
    capabilityExecutionReceiptDigest,
    metricObservations: gradingAttempt.metricObservations,
    execution: gradingExecution,
  });
  const gradingResponse = Object.freeze({
    metricObservations: gradingAttempt.metricObservations,
    gradingDigest,
  });
  const gradingResponseProjection =
    createAgentEvaluationAttemptAuthorityResponseProjection(
      'attempt-grading',
      'grade-and-persist',
      gradingResponse
    );
  const gradingOwnerReceipt = createAgentEvaluationAttemptAuthorityOwnerReceipt(
    {
      serviceKind: 'attempt-grading',
      operation: 'grade-and-persist',
      namespaceId: 'evaluation-production',
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      attemptId: gradingAttempt.descriptor.attemptId,
      descriptorDigest: gradingAttempt.descriptor.descriptorDigest,
      shardLeaseOwnerId: 'evaluation-shard-worker.vector',
      shardLeaseGeneration: 1,
      verificationGrantGeneration: 1,
      verificationAttemptGrantReceiptSetDigest:
        gradingAttempt.verificationAttemptGrantReceiptSetDigest,
      requestDigest: digestAgentCanonicalValue({
        vector: 'human-authority-grading-request',
      }),
      responseProjection: gradingResponseProjection,
      ownerImplementationDigest: digestAgentCanonicalValue({
        vector: 'human-authority-grading-owner-implementation',
      }),
      completedAt: gradingAttempt.completedAt,
    }
  );
  const gradingPreimage = Object.freeze({
    descriptorDigest: gradingAttempt.descriptor.descriptorDigest,
    invocationTurnSetReceiptDigest:
      gradingAttempt.invocationTurnSetReceiptDigest,
    terminalTurnReceiptDigest,
    capabilityExecutionReceiptDigest,
    observationDigests: Object.freeze(
      gradingAttempt.metricObservations
        .map(({ observationDigest }) => observationDigest)
        .sort(compareUnicodeCodePoints)
    ),
    execution: gradingExecution,
  });
  const gradingCommitLink = Object.freeze({
    namespaceId: gradingOwnerReceipt.namespaceId,
    planDigest: gradingOwnerReceipt.planDigest,
    repositoryCommit: gradingOwnerReceipt.repositoryCommit,
    attemptId: gradingOwnerReceipt.attemptId,
    receiptDigest: gradingOwnerReceipt.receiptDigest,
    attemptDigest: gradingAttempt.attemptDigest,
    committedAt: gradingAttempt.completedAt,
  });

  cachedVector = Object.freeze({
    format: 'prodivix.agent-evaluation-human-authority-vector',
    version: 1,
    plan,
    attempts: reviewedAttempts,
    humanReviewReport,
    validatedHumanReviewArtifact,
    validatedHumanMetricObservations,
    signatureMessages: Object.freeze({
      ratings: Object.freeze(ratingMessages),
      independence: Object.freeze(independenceMessages),
      decisions: Object.freeze([
        Object.freeze({
          id: decision.decisionId,
          publicKeyBase64Url: adjudicator.publicKeyBase64Url,
          canonicalJson: canonicalJsonText(decisionMessage),
          signatureBase64Url: decision.signatureBase64Url,
        }),
      ]),
      wrapper: Object.freeze({
        id: reviewArtifact.artifactDigest,
        publicKeyBase64Url: adjudicator.publicKeyBase64Url,
        canonicalJson: canonicalJsonText(reviewPayload),
        signatureBase64Url: artifactAuthority.signatureBase64Url,
      }),
    }),
    expected: Object.freeze({
      completedAt,
      validatedHumanMetricObservationSetDigest:
        digestAgentEvaluationValidatedHumanMetricObservationSet(
          validatedHumanMetricObservations
        ),
      metricReport,
      graderReport,
      attemptGradingAuthority: Object.freeze({
        attemptId: gradingAttempt.descriptor.attemptId,
        preimage: gradingPreimage,
        response: gradingResponse,
        responseProjection: gradingResponseProjection,
        ownerReceipt: gradingOwnerReceipt,
        commitLink: gradingCommitLink,
      }),
    }),
  });
  return cachedVector;
};
