import { readFileSync } from 'node:fs';
import {
  compareAgentDecimals,
  createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand,
  planAgentModelEvaluationAttempts,
  resolveAgentEvaluationCapabilityDescriptor,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import {
  assertProductionAgentEvaluationAttemptBudgetPreflight,
  createProductionAgentEvaluationAttemptBudgetDemand,
} from './productionAttemptBudget';
import { deriveAgentEvaluationHostedRetrievalRuntimeResourceRegistrationContexts } from './productionHostedRetrievalRuntimeResourceLifecycleOwner';

const productionConfig = () => {
  let document: Record<string, unknown>;
  try {
    document = materializeAgentEvaluationTestProductionRunConfig(
      JSON.parse(
        readFileSync(
          new URL(
            '../../../specs/evaluation/g4-real-model-evaluation.example.json',
            import.meta.url
          ),
          'utf8'
        )
      ) as Record<string, unknown>
    );
  } catch (caught) {
    throw new Error('materialize failed', { cause: caught });
  }
  let decoded;
  try {
    decoded = decodeAgentEvaluationFrozenRunConfig(document, {
      clock: () => '2026-08-08T00:00:00.000Z',
      expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    });
  } catch (caught) {
    throw new Error('decode failed', { cause: caught });
  }
  return requireProductionAgentEvaluationFrozenRunConfig(
    decoded,
    '0123456789abcdef0123456789abcdef01234567'
  );
};

const amountByUnit = (
  demand: ReturnType<typeof createProductionAgentEvaluationAttemptBudgetDemand>
) =>
  new Map(
    demand.usage.amounts.map((amount) => [amount.unit, amount.logicalAmount])
  );

describe('production attempt budget', () => {
  it('partitions ordinary ceilings across the matrix and reserves exact required Hosted calls', () => {
    const config = productionConfig();
    const descriptors = planAgentModelEvaluationAttempts(config.plan);
    const demand = createProductionAgentEvaluationAttemptBudgetDemand({
      plan: config.plan,
      controlledRuntime: config.controlledRuntime,
      descriptors,
    });
    const amounts = amountByUnit(demand);

    expect(descriptors).toHaveLength(config.plan.plannedJourneyCount);
    expect(amounts.get('hosted-search-query')).toBe('210');
    expect(amounts.get('hosted-tool-call')).toBe('210');
    expect(amounts.has('provider-upload-byte')).toBe(false);
    expect(amounts.has('provider-storage-byte-second')).toBe(false);
    for (const { unit, maximum } of config.plan.budget.budget.usageLimits) {
      if (
        unit === 'provider-upload-byte' ||
        unit === 'provider-storage-byte-second'
      ) {
        continue;
      }
      expect(
        compareAgentDecimals(amounts.get(unit) ?? '0', maximum)
      ).toBeLessThanOrEqual(0);
    }
    expect(() =>
      assertProductionAgentEvaluationAttemptBudgetPreflight({
        plan: config.plan,
        controlledRuntime: config.controlledRuntime,
        pricingAuthorities: config.pricingAuthorities,
      })
    ).not.toThrow();
  }, 30_000);

  it('gives one query/tool unit only to a required Hosted descriptor', () => {
    const config = productionConfig();
    const targets = new Map(
      config.plan.capabilityQualificationTargets.map((target) => [
        target.targetId,
        target,
      ])
    );
    const cases = new Map(
      config.plan.concreteCases.map((evaluationCase) => [
        evaluationCase.caseId,
        evaluationCase,
      ])
    );
    const descriptors = planAgentModelEvaluationAttempts(config.plan);
    const classified = descriptors.map((descriptor) => {
      const target = targets.get(descriptor.targetId)!;
      const capability = resolveAgentEvaluationCapabilityDescriptor(
        cases.get(descriptor.caseId)!,
        target
      );
      return Object.freeze({ descriptor, target, capability });
    });
    const required = classified.find(
      ({ capability }) =>
        capability.capabilityId === 'provider.hosted-retrieval' &&
        capability.supportExpectation === 'required'
    )!;
    const expectedBlocked = classified.find(({ target, capability }) => {
      const source =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      return (
        capability.capabilityId === 'provider.hosted-retrieval' &&
        capability.supportExpectation !== 'required' &&
        source?.protocolFamily === 'openai-responses' &&
        source.capabilityProfileId === 'g4-provider-hosted-retrieval-core'
      );
    })!;

    const requiredAmounts = amountByUnit(
      createProductionAgentEvaluationAttemptBudgetDemand({
        plan: config.plan,
        controlledRuntime: config.controlledRuntime,
        descriptors: Object.freeze([required.descriptor]),
      })
    );
    const blockedAmounts = amountByUnit(
      createProductionAgentEvaluationAttemptBudgetDemand({
        plan: config.plan,
        controlledRuntime: config.controlledRuntime,
        descriptors: Object.freeze([expectedBlocked.descriptor]),
      })
    );
    expect(requiredAmounts.get('hosted-search-query')).toBe('1');
    expect(requiredAmounts.get('hosted-tool-call')).toBe('1');
    expect(blockedAmounts.has('hosted-search-query')).toBe(false);
    expect(blockedAmounts.has('hosted-tool-call')).toBe(false);
  }, 30_000);

  it('keeps exact-four lifecycle demand separate from attempt reservations', () => {
    const config = productionConfig();
    const contexts =
      deriveAgentEvaluationHostedRetrievalRuntimeResourceRegistrationContexts(
        config.plan
      );
    const totals = new Map<string, bigint>();
    for (const { intent, material } of contexts) {
      const demand =
        createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
          intent,
          material
        );
      for (const amount of demand.usage.amounts) {
        totals.set(
          amount.unit,
          (totals.get(amount.unit) ?? 0n) + BigInt(amount.logicalAmount ?? '0')
        );
      }
    }
    expect(contexts).toHaveLength(4);
    expect(totals.get('hosted-tool-call')).toBe(12n);
    expect(totals.get('provider-upload-byte')).toBe(310n);
    expect(totals.get('provider-storage-byte-second')).toBe(214_272_000n);
    expect(totals.has('hosted-search-query')).toBe(false);
  }, 30_000);
});
