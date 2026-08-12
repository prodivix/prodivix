import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type {
  AgentModelEvaluationAttempt,
  AgentModelEvaluationPlan,
  AgentHumanReviewReport,
} from './agentEvaluation.types';
import {
  isAgentModelEvaluationAttempt,
  isAgentHumanReviewReport,
} from './agentEvaluationResults';
import { validateAgentModelEvaluationPlan } from './agentEvaluationPlan';
import {
  isAgentEvaluationValidatedHumanReviewArtifact,
  type AgentEvaluationHumanReviewCandidateAdjudication,
  type AgentEvaluationValidatedHumanReviewArtifact,
} from './agentEvaluationValidatedHumanReview';
import {
  normalizeAgentEvaluationHumanReviewCriterionVerdicts,
  validateAgentEvaluationPublicReviewRubric,
  type AgentEvaluationHumanReviewCriterionVerdict,
  type AgentEvaluationPublicReviewRubric,
} from './agentEvaluationHumanReviewRubric';

export const AGENT_EVALUATION_VALIDATED_HUMAN_METRIC_OBSERVATION_FORMAT =
  'prodivix.agent-evaluation-validated-human-metric-observation' as const;

export type AgentEvaluationValidatedHumanMetricObservation = Readonly<{
  format: typeof AGENT_EVALUATION_VALIDATED_HUMAN_METRIC_OBSERVATION_FORMAT;
  version: 1;
  observationId: string;
  planDigest: string;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: string;
  randomizedPresentationId: string;
  rubricDigest: string;
  metricId: string;
  graderId: string;
  graderKind: 'blind-human-rubric';
  authority: 'human';
  verdict: 'failed' | 'passed';
  basis: 'rubric-all-pass' | 'inter-rater-disagreement';
  criterionIds: readonly string[];
  ratingDigests: readonly string[];
  reviewerAuthorityIds: readonly string[];
  candidateAdjudicationDigest: string;
  decisionDigest?: string;
  reviewLeaseDigest: string;
  humanReviewReportDigest: string;
  validatedHumanReviewArtifactDigest: string;
  observedAt: string;
  observationDigest: string;
}>;

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
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const sortedUniqueIdentities = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isAgentControlIdentity) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 || compareUnicodeCodePoints(value[index - 1]!, entry) < 0
  );

const sortedUniqueDigests = (value: unknown): value is readonly string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isAgentCanonicalDigest) &&
  new Set(value).size === value.length &&
  value.every(
    (entry, index) =>
      index === 0 || compareUnicodeCodePoints(value[index - 1]!, entry) < 0
  );

const observationBase = (
  input: Omit<
    AgentEvaluationValidatedHumanMetricObservation,
    'observationDigest'
  >
) => Object.freeze({ ...input });

export const isAgentEvaluationValidatedHumanMetricObservation = (
  value: unknown
): value is AgentEvaluationValidatedHumanMetricObservation => {
  if (
    !exact(
      value,
      [
        'format',
        'version',
        'observationId',
        'planDigest',
        'repositoryCommit',
        'attemptId',
        'descriptorDigest',
        'randomizedPresentationId',
        'rubricDigest',
        'metricId',
        'graderId',
        'graderKind',
        'authority',
        'verdict',
        'basis',
        'criterionIds',
        'ratingDigests',
        'reviewerAuthorityIds',
        'candidateAdjudicationDigest',
        'reviewLeaseDigest',
        'humanReviewReportDigest',
        'validatedHumanReviewArtifactDigest',
        'observedAt',
        'observationDigest',
      ],
      ['decisionDigest']
    ) ||
    value.format !==
      AGENT_EVALUATION_VALIDATED_HUMAN_METRIC_OBSERVATION_FORMAT ||
    value.version !== 1 ||
    !isAgentControlIdentity(value.observationId) ||
    !isAgentCanonicalDigest(value.planDigest) ||
    typeof value.repositoryCommit !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(value.repositoryCommit) ||
    !isAgentControlIdentity(value.attemptId) ||
    !isAgentCanonicalDigest(value.descriptorDigest) ||
    !isAgentControlIdentity(value.randomizedPresentationId) ||
    !isAgentCanonicalDigest(value.rubricDigest) ||
    !isAgentControlIdentity(value.metricId) ||
    !isAgentControlIdentity(value.graderId) ||
    value.graderKind !== 'blind-human-rubric' ||
    value.authority !== 'human' ||
    (value.verdict !== 'failed' && value.verdict !== 'passed') ||
    (value.basis !== 'rubric-all-pass' &&
      value.basis !== 'inter-rater-disagreement') ||
    !sortedUniqueIdentities(value.criterionIds) ||
    !sortedUniqueDigests(value.ratingDigests) ||
    !sortedUniqueIdentities(value.reviewerAuthorityIds) ||
    !isAgentCanonicalDigest(value.candidateAdjudicationDigest) ||
    (value.decisionDigest !== undefined &&
      !isAgentCanonicalDigest(value.decisionDigest)) ||
    !isAgentCanonicalDigest(value.reviewLeaseDigest) ||
    !isAgentCanonicalDigest(value.humanReviewReportDigest) ||
    !isAgentCanonicalDigest(value.validatedHumanReviewArtifactDigest) ||
    !isAgentControlInstant(value.observedAt) ||
    !isAgentCanonicalDigest(value.observationDigest)
  ) {
    return false;
  }
  const { observationDigest: _observationDigest, ...base } = value;
  const identity = Object.freeze({
    planDigest: value.planDigest,
    attemptId: value.attemptId,
    metricId: value.metricId,
    validatedHumanReviewArtifactDigest:
      value.validatedHumanReviewArtifactDigest,
  });
  return (
    value.observationId ===
      `human-metric-observation:${digestAgentCanonicalValue(identity).slice('sha256-'.length)}` &&
    value.observationDigest === digestAgentCanonicalValue(base)
  );
};

const criterionIdsForRubric = (
  rubric: AgentEvaluationPublicReviewRubric
): readonly string[] =>
  Object.freeze(
    rubric.criteria
      .filter(({ required }) => required)
      .map(({ criterionId }) => criterionId)
  );

const verdictMap = (
  values: readonly AgentEvaluationHumanReviewCriterionVerdict[],
  expectedCriterionIds: readonly string[]
): ReadonlyMap<string, 'failed' | 'passed'> =>
  new Map(
    normalizeAgentEvaluationHumanReviewCriterionVerdicts(
      values,
      expectedCriterionIds
    ).map(({ criterionId, verdict }) => [criterionId, verdict])
  );

/** Exact criterion-level projection shared with the production finalizer. */
export const deriveAgentEvaluationValidatedHumanMetricVerdict = (input: {
  basis: AgentEvaluationValidatedHumanMetricObservation['basis'];
  requiredCriterionIds: readonly string[];
  metricCriterionIds: readonly string[];
  finalCriterionVerdicts: readonly AgentEvaluationHumanReviewCriterionVerdict[];
  signedRatingCriterionVerdicts: readonly (readonly AgentEvaluationHumanReviewCriterionVerdict[])[];
}): 'failed' | 'passed' => {
  if (
    input.requiredCriterionIds.length < 1 ||
    input.metricCriterionIds.length < 1 ||
    input.signedRatingCriterionVerdicts.length < 2
  ) {
    throw new TypeError('Human metric criterion authority is incomplete.');
  }
  const required = [...input.requiredCriterionIds].sort(
    compareUnicodeCodePoints
  );
  const metric = [...input.metricCriterionIds].sort(compareUnicodeCodePoints);
  if (
    new Set(required).size !== required.length ||
    new Set(metric).size !== metric.length ||
    !sameCanonicalJson(required, input.requiredCriterionIds) ||
    !sameCanonicalJson(metric, input.metricCriterionIds) ||
    metric.some((criterionId) => !required.includes(criterionId))
  ) {
    throw new TypeError('Human metric criterion identities are invalid.');
  }
  const finalVerdicts = verdictMap(
    input.finalCriterionVerdicts,
    input.requiredCriterionIds
  );
  const ratingVerdicts = input.signedRatingCriterionVerdicts.map((values) =>
    verdictMap(values, input.requiredCriterionIds)
  );
  if (input.basis === 'rubric-all-pass') {
    return input.metricCriterionIds.every(
      (criterionId) => finalVerdicts.get(criterionId) === 'passed'
    )
      ? 'passed'
      : 'failed';
  }
  if (
    input.basis !== 'inter-rater-disagreement' ||
    !sameCanonicalJson(input.metricCriterionIds, input.requiredCriterionIds)
  ) {
    throw new TypeError('Human disagreement criterion coverage is invalid.');
  }
  return input.requiredCriterionIds.some(
    (criterionId) =>
      new Set(ratingVerdicts.map((values) => values.get(criterionId))).size > 1
  )
    ? 'failed'
    : 'passed';
};

export const createAgentEvaluationValidatedHumanMetricObservation = (
  input: Omit<
    AgentEvaluationValidatedHumanMetricObservation,
    'format' | 'version' | 'observationId' | 'observationDigest'
  >
): AgentEvaluationValidatedHumanMetricObservation => {
  const identity = Object.freeze({
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    metricId: input.metricId,
    validatedHumanReviewArtifactDigest:
      input.validatedHumanReviewArtifactDigest,
  });
  const base = observationBase({
    format: AGENT_EVALUATION_VALIDATED_HUMAN_METRIC_OBSERVATION_FORMAT,
    version: 1,
    observationId: `human-metric-observation:${digestAgentCanonicalValue(identity).slice('sha256-'.length)}`,
    ...input,
  });
  const observation = Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
  if (!isAgentEvaluationValidatedHumanMetricObservation(observation)) {
    throw new TypeError('Validated human metric observation is invalid.');
  }
  return observation;
};

const adjudicationByPresentation = (
  artifact: AgentEvaluationValidatedHumanReviewArtifact
): ReadonlyMap<string, AgentEvaluationHumanReviewCandidateAdjudication> => {
  const entries =
    artifact.reviewArtifact.validationReceipt.candidateAdjudications;
  const result = new Map(
    entries.map((entry) => [entry.randomizedPresentationId, entry])
  );
  if (result.size !== entries.length) {
    throw new TypeError('Human candidate adjudications are duplicated.');
  }
  return result;
};

/**
 * Projects verified human records into one candidate-by-metric authority set.
 * Reviewers and model repetitions never become independent metric samples.
 */
export const createAgentEvaluationValidatedHumanMetricObservations = (input: {
  plan: AgentModelEvaluationPlan;
  attempts: readonly AgentModelEvaluationAttempt[];
  humanReviewReport: AgentHumanReviewReport;
  validatedHumanReviewArtifact: AgentEvaluationValidatedHumanReviewArtifact;
}): readonly AgentEvaluationValidatedHumanMetricObservation[] => {
  if (
    validateAgentModelEvaluationPlan(input.plan).length > 0 ||
    !isAgentHumanReviewReport(input.humanReviewReport) ||
    !isAgentEvaluationValidatedHumanReviewArtifact(
      input.validatedHumanReviewArtifact,
      input.humanReviewReport
    ) ||
    input.humanReviewReport.planDigest !== input.plan.planDigest ||
    input.validatedHumanReviewArtifact.planDigest !== input.plan.planDigest ||
    input.validatedHumanReviewArtifact.repositoryCommit !==
      input.plan.repositoryCommit
  ) {
    throw new TypeError('Validated human metric authority input is invalid.');
  }
  const graderIds = input.plan.graderPlan.blindHumanGraderIds;
  const graders = graderIds.map((graderId) =>
    input.plan.graderPlan.graders.find((grader) => grader.graderId === graderId)
  );
  if (
    graders.length !== 1 ||
    graders[0]?.kind !== 'blind-human-rubric' ||
    graders[0].authority !== 'human'
  ) {
    throw new TypeError('Human metric authority requires one blind grader.');
  }
  const grader = graders[0];
  const attempts = new Map(
    input.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  if (
    attempts.size !== input.attempts.length ||
    input.attempts.some(
      (attempt) =>
        !isAgentModelEvaluationAttempt(attempt) ||
        attempt.descriptor.planDigest !== input.plan.planDigest
    )
  ) {
    throw new TypeError('Human metric attempts are invalid.');
  }
  const cases = new Map(
    input.plan.concreteCases.map((entry) => [entry.caseId, entry])
  );
  const rubrics = new Map(
    input.validatedHumanReviewArtifact.publicRubrics.map((rubric) => {
      const normalized = validateAgentEvaluationPublicReviewRubric(rubric);
      return [normalized.rubricDigest, normalized] as const;
    })
  );
  if (
    rubrics.size !== input.validatedHumanReviewArtifact.publicRubrics.length
  ) {
    throw new TypeError('Human review rubric digests are duplicated.');
  }
  const humanMetricIds = new Set(
    input.plan.thresholds.metrics
      .filter(({ requiredAuthority }) => requiredAuthority === 'human')
      .map(({ metricId }) => metricId)
  );
  const adjudications = adjudicationByPresentation(
    input.validatedHumanReviewArtifact
  );
  const signedRatingsByPresentation = new Map<
    string,
    typeof input.validatedHumanReviewArtifact.reviewArtifact.signedRatings
  >();
  for (const rating of input.validatedHumanReviewArtifact.reviewArtifact
    .signedRatings) {
    signedRatingsByPresentation.set(
      rating.randomizedPresentationId,
      Object.freeze([
        ...(signedRatingsByPresentation.get(rating.randomizedPresentationId) ??
          []),
        rating,
      ])
    );
  }
  const reportRatingsByPresentation = new Map<
    string,
    typeof input.humanReviewReport.ratings
  >();
  for (const rating of input.humanReviewReport.ratings) {
    reportRatingsByPresentation.set(
      rating.randomizedPresentationId,
      Object.freeze([
        ...(reportRatingsByPresentation.get(rating.randomizedPresentationId) ??
          []),
        rating,
      ])
    );
  }
  if (
    adjudications.size !== signedRatingsByPresentation.size ||
    adjudications.size !== reportRatingsByPresentation.size
  ) {
    throw new TypeError('Human metric candidate coverage is incomplete.');
  }
  const observations: AgentEvaluationValidatedHumanMetricObservation[] = [];
  for (const adjudication of adjudications.values()) {
    const signedRatings =
      signedRatingsByPresentation.get(adjudication.randomizedPresentationId) ??
      [];
    const reportRatings =
      reportRatingsByPresentation.get(adjudication.randomizedPresentationId) ??
      [];
    const rubric = rubrics.get(adjudication.rubricDigest);
    const attemptIds = new Set(reportRatings.map(({ attemptId }) => attemptId));
    const rubricDigests = new Set(
      reportRatings.map(({ rubricDigest }) => rubricDigest)
    );
    if (
      !rubric ||
      attemptIds.size !== 1 ||
      rubricDigests.size !== 1 ||
      !rubricDigests.has(rubric.rubricDigest) ||
      signedRatings.length !== reportRatings.length ||
      signedRatings.length <
        input.plan.graderPlan.minimumIndependentVisualRatings
    ) {
      throw new TypeError('Human metric candidate binding is invalid.');
    }
    const attemptId = reportRatings[0]!.attemptId;
    const attempt = attempts.get(attemptId);
    const evaluationCase = attempt
      ? cases.get(attempt.descriptor.caseId)
      : undefined;
    if (
      !attempt ||
      attempt.status !== 'completed' ||
      !evaluationCase?.subjectiveVisualQuality ||
      evaluationCase.access !== 'public'
    ) {
      throw new TypeError('Human metric attempt is not review eligible.');
    }
    const requiredCriterionIds = criterionIdsForRubric(rubric);
    const ratingDigests = signedRatings
      .map(({ ratingDigest }) => ratingDigest)
      .sort(compareUnicodeCodePoints);
    const reviewerAuthorityIds = signedRatings
      .map(({ reviewerAuthorityId }) => reviewerAuthorityId)
      .sort(compareUnicodeCodePoints);
    if (
      !sameCanonicalJson(ratingDigests, adjudication.ratingDigests) ||
      !sameCanonicalJson(
        reviewerAuthorityIds,
        adjudication.reviewerAuthorityIds
      ) ||
      reportRatings.some(
        (rating) =>
          !sameCanonicalJson(
            normalizeAgentEvaluationHumanReviewCriterionVerdicts(
              rating.criterionVerdicts,
              requiredCriterionIds
            ),
            rating.criterionVerdicts
          )
      ) ||
      signedRatings.some(
        (rating) =>
          !sameCanonicalJson(
            normalizeAgentEvaluationHumanReviewCriterionVerdicts(
              rating.criterionVerdicts,
              requiredCriterionIds
            ),
            rating.criterionVerdicts
          )
      )
    ) {
      throw new TypeError('Human metric rating authority drifted.');
    }
    const common = Object.freeze({
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId,
      descriptorDigest: attempt.descriptor.descriptorDigest,
      randomizedPresentationId: adjudication.randomizedPresentationId,
      rubricDigest: rubric.rubricDigest,
      graderId: grader.graderId,
      graderKind: 'blind-human-rubric' as const,
      authority: 'human' as const,
      ratingDigests: Object.freeze(ratingDigests),
      reviewerAuthorityIds: Object.freeze(reviewerAuthorityIds),
      candidateAdjudicationDigest: digestAgentCanonicalValue(adjudication),
      ...(adjudication.decisionDigest
        ? { decisionDigest: adjudication.decisionDigest }
        : {}),
      reviewLeaseDigest: input.validatedHumanReviewArtifact.reviewLeaseDigest,
      humanReviewReportDigest: input.humanReviewReport.reportDigest,
      validatedHumanReviewArtifactDigest:
        input.validatedHumanReviewArtifact.artifactDigest,
      observedAt: input.humanReviewReport.generatedAt,
    });
    for (const mapping of rubric.metricMappings) {
      if (!humanMetricIds.has(mapping.metricId)) {
        throw new TypeError('Rubric maps an unplanned human metric.');
      }
      observations.push(
        createAgentEvaluationValidatedHumanMetricObservation({
          ...common,
          metricId: mapping.metricId,
          verdict: deriveAgentEvaluationValidatedHumanMetricVerdict({
            basis: 'rubric-all-pass',
            requiredCriterionIds,
            metricCriterionIds: mapping.criterionIds,
            finalCriterionVerdicts: adjudication.criterionVerdicts,
            signedRatingCriterionVerdicts: signedRatings.map(
              ({ criterionVerdicts }) => criterionVerdicts
            ),
          }),
          basis: 'rubric-all-pass',
          criterionIds: mapping.criterionIds,
        })
      );
    }
    if (!humanMetricIds.has(rubric.interRaterDisagreementMetricId)) {
      throw new TypeError('Rubric disagreement metric is not planned.');
    }
    observations.push(
      createAgentEvaluationValidatedHumanMetricObservation({
        ...common,
        metricId: rubric.interRaterDisagreementMetricId,
        verdict: deriveAgentEvaluationValidatedHumanMetricVerdict({
          basis: 'inter-rater-disagreement',
          requiredCriterionIds,
          metricCriterionIds: requiredCriterionIds,
          finalCriterionVerdicts: adjudication.criterionVerdicts,
          signedRatingCriterionVerdicts: signedRatings.map(
            ({ criterionVerdicts }) => criterionVerdicts
          ),
        }),
        basis: 'inter-rater-disagreement',
        criterionIds: requiredCriterionIds,
      })
    );
  }
  const canonical = Object.freeze(
    observations.sort((left, right) =>
      compareUnicodeCodePoints(left.observationId, right.observationId)
    )
  );
  const keys = canonical.map(
    ({ attemptId, metricId }) => `${attemptId}\u0000${metricId}`
  );
  const expectedMetricsPerCandidate = humanMetricIds.size;
  if (
    new Set(keys).size !== keys.length ||
    canonical.length !== adjudications.size * expectedMetricsPerCandidate ||
    [...adjudications.keys()].some(
      (presentationId) =>
        canonical.filter(
          ({ randomizedPresentationId }) =>
            randomizedPresentationId === presentationId
        ).length !== expectedMetricsPerCandidate
    )
  ) {
    throw new TypeError('Human metric observation coverage is invalid.');
  }
  return canonical;
};

export const digestAgentEvaluationValidatedHumanMetricObservationSet = (
  observations: readonly AgentEvaluationValidatedHumanMetricObservation[]
): string => {
  if (
    !Array.isArray(observations) ||
    !observations.every(isAgentEvaluationValidatedHumanMetricObservation)
  ) {
    throw new TypeError('Validated human metric observation set is invalid.');
  }
  const canonical =
    canonicalAgentEvaluationValidatedHumanMetricObservationOrder(observations);
  if (!sameCanonicalJson(canonical, observations)) {
    throw new TypeError(
      'Validated human metric observation set is not canonical.'
    );
  }
  return digestAgentCanonicalValue({
    validatedHumanMetricObservationDigests: canonical.map(
      ({ observationDigest }) => observationDigest
    ),
  });
};

export const canonicalAgentEvaluationValidatedHumanMetricObservationOrder = (
  observations: readonly AgentEvaluationValidatedHumanMetricObservation[]
): readonly AgentEvaluationValidatedHumanMetricObservation[] => {
  if (
    !Array.isArray(observations) ||
    !observations.every(isAgentEvaluationValidatedHumanMetricObservation)
  ) {
    throw new TypeError('Validated human metric observation set is invalid.');
  }
  return Object.freeze(
    [...observations].sort((left, right) =>
      compareUnicodeCodePoints(left.observationId, right.observationId)
    )
  );
};
