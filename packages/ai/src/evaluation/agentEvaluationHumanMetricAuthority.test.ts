import { describe, expect, it } from 'vitest';
import {
  createPassingV8Attempts,
  createV8EvaluationPlan,
  createV8HumanReviewReport,
  createV8ValidatedHumanMetricObservations,
} from '../__tests__/agentV8Fixtures';
import {
  deriveAgentEvaluationValidatedHumanMetricVerdict,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  isAgentEvaluationValidatedHumanMetricObservation,
} from './agentEvaluationHumanMetricAuthority';

const requiredCriterionIds = Object.freeze([
  'composition-and-hierarchy',
  'finish-and-consistency',
  'legibility-and-contrast',
]);

const verdicts = (
  overrides: Readonly<Record<string, 'failed' | 'passed'>> = {}
) =>
  Object.freeze(
    requiredCriterionIds.map((criterionId) =>
      Object.freeze({
        criterionId,
        verdict: overrides[criterionId] ?? 'passed',
      })
    )
  );

describe('validated human metric authority', () => {
  it('projects quality through frozen all-pass mappings', () => {
    const ratings = Object.freeze([verdicts(), verdicts()]);
    expect(
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'rubric-all-pass',
        requiredCriterionIds,
        metricCriterionIds: Object.freeze(['composition-and-hierarchy']),
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: ratings,
      })
    ).toBe('passed');
    expect(
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'rubric-all-pass',
        requiredCriterionIds,
        metricCriterionIds: requiredCriterionIds,
        finalCriterionVerdicts: verdicts({
          'finish-and-consistency': 'failed',
        }),
        signedRatingCriterionVerdicts: ratings,
      })
    ).toBe('failed');
  });

  it('projects disagreement once per candidate from raw criterion verdicts', () => {
    expect(
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'inter-rater-disagreement',
        requiredCriterionIds,
        metricCriterionIds: requiredCriterionIds,
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: Object.freeze([verdicts(), verdicts()]),
      })
    ).toBe('passed');
    expect(
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'inter-rater-disagreement',
        requiredCriterionIds,
        metricCriterionIds: requiredCriterionIds,
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: Object.freeze([
          verdicts(),
          verdicts({ 'legibility-and-contrast': 'failed' }),
        ]),
      })
    ).toBe('failed');
  });

  it('rejects incomplete, duplicated, and non-canonical criterion authority', () => {
    expect(() =>
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'rubric-all-pass',
        requiredCriterionIds,
        metricCriterionIds: Object.freeze([
          'composition-and-hierarchy',
          'composition-and-hierarchy',
        ]),
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: Object.freeze([verdicts(), verdicts()]),
      })
    ).toThrow('Human metric criterion identities are invalid.');
    expect(() =>
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'inter-rater-disagreement',
        requiredCriterionIds,
        metricCriterionIds: Object.freeze(['composition-and-hierarchy']),
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: Object.freeze([verdicts(), verdicts()]),
      })
    ).toThrow('Human disagreement criterion coverage is invalid.');
    expect(() =>
      deriveAgentEvaluationValidatedHumanMetricVerdict({
        basis: 'rubric-all-pass',
        requiredCriterionIds,
        metricCriterionIds: Object.freeze(['composition-and-hierarchy']),
        finalCriterionVerdicts: verdicts(),
        signedRatingCriterionVerdicts: Object.freeze([verdicts()]),
      })
    ).toThrow('Human metric criterion authority is incomplete.');
  });

  it('binds one canonical four-metric set per reviewed candidate to report time', () => {
    const plan = createV8EvaluationPlan();
    const attempts = createPassingV8Attempts(plan);
    const report = createV8HumanReviewReport(plan);
    const observations = createV8ValidatedHumanMetricObservations(
      plan,
      attempts,
      report
    );
    const presentationIds = new Set(
      report.ratings.map(
        ({ randomizedPresentationId }) => randomizedPresentationId
      )
    );

    expect(observations).toHaveLength(presentationIds.size * 4);
    expect(
      observations.every(({ observedAt }) => observedAt === report.generatedAt)
    ).toBe(true);
    for (const randomizedPresentationId of presentationIds) {
      expect(
        observations
          .filter(
            (observation) =>
              observation.randomizedPresentationId === randomizedPresentationId
          )
          .map(({ metricId }) => metricId)
          .sort()
      ).toEqual(
        [
          'visual.human-quality',
          'visual.information-hierarchy-quality',
          'visual.inter-rater-disagreement',
          'visual.usability-quality',
        ].sort()
      );
    }
    expect(
      digestAgentEvaluationValidatedHumanMetricObservationSet(observations)
    ).toMatch(/^sha256-[0-9a-f]{64}$/u);
    expect(() =>
      digestAgentEvaluationValidatedHumanMetricObservationSet(
        Object.freeze([...observations].reverse())
      )
    ).toThrow('Validated human metric observation set is not canonical.');
    expect(
      isAgentEvaluationValidatedHumanMetricObservation({
        ...observations[0],
        observedAt: '2026-08-02T02:59:59.999Z',
      })
    ).toBe(false);
  }, 20_000);
});
