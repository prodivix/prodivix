import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import { G4_V8_MINIMUM_EVALUATION_CORPUS } from './agentEvaluationCorpus';
import {
  minimumAgentEvaluationJourneyFloor,
  planAgentModelEvaluationAttempts,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';

describe('G4 V8 frozen real-model evaluation plan', () => {
  it('freezes the normative corpus, diversity, sentinels, and repetition floor', () => {
    const plan = createV8EvaluationPlan();
    expect(plan.concreteCases).toHaveLength(128);
    expect(
      new Set(plan.concreteCases.map(({ familyId }) => familyId)).size
    ).toBe(52);
    expect(plan.contextSentinelCaseIds).toHaveLength(24);
    expect(plan.mediaSentinelCaseIds).toHaveLength(16);
    expect(plan.capabilityQualificationTargets).toHaveLength(9);
    expect(plan.plannedJourneyCount).toBeGreaterThanOrEqual(
      minimumAgentEvaluationJourneyFloor
    );
    expect(validateAgentModelEvaluationPlan(plan)).toEqual([]);

    const descriptors = planAgentModelEvaluationAttempts(plan);
    expect(descriptors).toHaveLength(plan.plannedJourneyCount);
    expect(new Set(descriptors.map(({ attemptId }) => attemptId)).size).toBe(
      descriptors.length
    );
    expect(
      new Set(
        descriptors.map(({ samplingIdentityDigest }) => samplingIdentityDigest)
      ).size
    ).toBe(descriptors.length);
  }, 30_000);

  it('keeps protected bodies out of the public fixture artifact', () => {
    const holdoutIds = G4_V8_MINIMUM_EVALUATION_CORPUS.cases
      .filter(({ access }) => access === 'protected-holdout')
      .map(({ caseId }) => caseId);
    const publicText = JSON.stringify(
      G4_V8_MINIMUM_EVALUATION_CORPUS.publicFixtures
    );
    expect(holdoutIds).toHaveLength(32);
    expect(holdoutIds.every((caseId) => !publicText.includes(caseId))).toBe(
      true
    );
  });

  it('fails closed after denominator, diversity, or holdout drift', () => {
    const plan = createV8EvaluationPlan();
    const denominatorDrift = {
      ...plan,
      plannedJourneyCount: plan.plannedJourneyCount - 1,
    };
    expect(validateAgentModelEvaluationPlan(denominatorDrift)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'AI-8010' })])
    );

    const diversityDrift = {
      ...plan,
      providerConfigurations: plan.providerConfigurations.slice(1),
    };
    expect(validateAgentModelEvaluationPlan(diversityDrift)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'AI-6010' })])
    );

    const holdoutDrift = {
      ...plan,
      concreteCases: plan.concreteCases.map((entry) =>
        entry.primaryBucket === 'positive-cross-domain' &&
        entry.access === 'protected-holdout'
          ? { ...entry, access: 'public' as const }
          : entry
      ),
    };
    expect(
      validateAgentModelEvaluationPlan(holdoutDrift).length
    ).toBeGreaterThan(0);
  }, 30_000);
});
