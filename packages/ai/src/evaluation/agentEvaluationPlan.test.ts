import { describe, expect, it } from 'vitest';
import { createV8EvaluationPlan } from '../__tests__/agentV8Fixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { G4_V8_MINIMUM_EVALUATION_CORPUS } from './agentEvaluationCorpus';
import {
  createAgentModelEvaluationCase,
  minimumAgentEvaluationJourneyFloor,
  planAgentModelEvaluationAttempts,
  resolveAgentEvaluationCapabilityDescriptor,
  resolveAgentModelEvaluationCaseExecutionRequirement,
  validateAgentModelEvaluationPlan,
} from './agentEvaluationPlan';
import { isAgentModelEvaluationAttemptDescriptor } from './agentEvaluationResults';

describe('G4 V8 frozen real-model evaluation plan', () => {
  it('freezes the normative corpus, diversity, sentinels, and repetition floor', () => {
    const plan = createV8EvaluationPlan();
    expect(plan.concreteCases).toHaveLength(128);
    expect(
      new Set(plan.concreteCases.map(({ familyId }) => familyId)).size
    ).toBe(52);
    expect(plan.contextSentinelCaseIds).toHaveLength(24);
    expect(plan.mediaSentinelCaseIds).toHaveLength(16);
    expect(plan.capabilityQualificationTargets).toHaveLength(27);
    expect(plan.endpointSmokeTargets).toHaveLength(5);
    expect(
      plan.endpointSmokeTargets.map(({ smokeTargetId }) => smokeTargetId)
    ).toEqual([
      'smoke.release.anthropic-messages.native',
      'smoke.release.gemini-interactions.native',
      'smoke.release.openai-compatible.hosted',
      'smoke.release.openai-compatible.local',
      'smoke.release.openai-responses.native',
    ]);
    expect(
      plan.endpointSmokeTargets.filter(
        ({ protocolFamily }) => protocolFamily !== 'openai-compatible'
      )
    ).toHaveLength(3);
    expect(plan.plannedJourneyCount).toBe(14_040);
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
    const casesById = new Map(
      plan.concreteCases.map((evaluationCase) => [
        evaluationCase.caseId,
        evaluationCase,
      ])
    );
    const targetsById = new Map(
      plan.capabilityQualificationTargets.map((target) => [
        target.targetId,
        target,
      ])
    );
    expect(
      descriptors.every((descriptor) => {
        const evaluationCase = casesById.get(descriptor.caseId);
        const target = targetsById.get(descriptor.targetId);
        return (
          evaluationCase !== undefined &&
          target !== undefined &&
          descriptor.capabilityDescriptorDigest ===
            resolveAgentEvaluationCapabilityDescriptor(evaluationCase, target)
              .descriptorDigest
        );
      })
    ).toBe(true);
  }, 30_000);

  it('keeps optional support and execution admission independent from case tags', () => {
    const plan = createV8EvaluationPlan();
    const evaluationCase = plan.concreteCases.find(
      ({ capabilityProfileId }) =>
        capabilityProfileId === 'g4-provider-background-job'
    )!;
    const target = plan.capabilityQualificationTargets.find(
      ({ capabilityProfileId }) =>
        capabilityProfileId === evaluationCase.capabilityProfileId
    )!;
    const tagsSwapped = Object.freeze({
      ...evaluationCase,
      tags: Object.freeze(['closure', 'repair', 'transaction']),
    });

    expect(
      resolveAgentEvaluationCapabilityDescriptor(tagsSwapped, target)
    ).toEqual(
      resolveAgentEvaluationCapabilityDescriptor(evaluationCase, target)
    );
    expect(
      resolveAgentModelEvaluationCaseExecutionRequirement(tagsSwapped, target)
    ).toEqual(
      resolveAgentModelEvaluationCaseExecutionRequirement(
        evaluationCase,
        target
      )
    );
  });

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

  it('rejects capability descriptor drift in a planned attempt descriptor', () => {
    const plan = createV8EvaluationPlan();
    const descriptor = planAgentModelEvaluationAttempts(plan)[0]!;
    const { descriptorDigest: _descriptorDigest, ...base } = descriptor;
    const driftedBase = {
      ...base,
      capabilityDescriptorDigest: digestAgentCanonicalValue(
        'drifted-capability-descriptor'
      ),
    };
    expect(
      isAgentModelEvaluationAttemptDescriptor({
        ...driftedBase,
        descriptorDigest: digestAgentCanonicalValue(driftedBase),
      })
    ).toBe(false);

    const evaluationCase = plan.concreteCases.find(
      ({ caseId }) => caseId === descriptor.caseId
    )!;
    const { caseDigest: _caseDigest, ...caseInput } = evaluationCase;
    expect(() =>
      createAgentModelEvaluationCase({
        ...caseInput,
        capabilityDescriptorDigest: digestAgentCanonicalValue(
          'drifted-case-capability-descriptor'
        ),
      })
    ).toThrow(/capability descriptor is invalid/u);
  });
});
