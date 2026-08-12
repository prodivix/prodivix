import {
  AGENT_CAPABILITY_PROBE_PROFILE_IDS,
  compareAgentDecimals,
  createAgentCapabilityProbeProgram,
  createAgentUsageVector,
  multiplyAgentDecimals,
  normalizeAgentCosts,
  normalizeAgentDecimal,
  planAgentModelEvaluationAttempts,
  priceAgentUsage,
  resolveAgentEvaluationCapabilityDescriptor,
  type AgentBudgetDemand,
  type AgentCapabilityProbeProfileId,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type AgentUsageAmount,
  type AgentUsageUnit,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentEvaluationControlledRuntimeConfiguration,
  AgentEvaluationFrozenPricingAuthority,
  AgentEvaluationRunConfigPricingAuthorityKey,
} from './runConfig';

export const PRODUCTION_AGENT_EVALUATION_MAXIMUM_OUTPUT_TOKENS_PER_TURN =
  4_096 as const;

export const PRODUCTION_AGENT_EVALUATION_EXACT_ATTEMPT_USAGE_UNITS =
  Object.freeze([
    'hosted-search-query',
    'hosted-tool-call',
    'provider-upload-byte',
    'provider-storage-byte-second',
  ] as const satisfies readonly AgentUsageUnit[]);

const exactAttemptUsageUnits = new Set<AgentUsageUnit>(
  PRODUCTION_AGENT_EVALUATION_EXACT_ATTEMPT_USAGE_UNITS
);

/** Floors a share at the canonical precision already frozen by the ceiling. */
const divideAgentDecimalFloor = (
  maximumInput: string,
  divisor: number
): string => {
  const maximum = normalizeAgentDecimal(maximumInput);
  if (!Number.isSafeInteger(divisor) || divisor < 1) {
    throw new TypeError('Production budget share divisor is invalid.');
  }
  const [whole, fraction = ''] = maximum.split('.');
  const coefficient = BigInt(`${whole}${fraction}`);
  const quotient = coefficient / BigInt(divisor);
  const scale = fraction.length;
  const raw = quotient.toString().padStart(scale + 1, '0');
  const value =
    scale === 0 ? raw : `${raw.slice(0, -scale)}.${raw.slice(-scale)}`;
  return normalizeAgentDecimal(value);
};

const scaledShare = (
  maximum: string,
  plannedJourneyCount: number,
  descriptorCount: number
): string =>
  multiplyAgentDecimals(
    divideAgentDecimalFloor(maximum, plannedJourneyCount),
    String(descriptorCount)
  );

const scaledIntegerShare = (
  maximum: number,
  plannedJourneyCount: number,
  descriptorCount: number,
  label: string
): number => {
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 0 ||
    !Number.isSafeInteger(plannedJourneyCount) ||
    plannedJourneyCount < 1 ||
    !Number.isSafeInteger(descriptorCount) ||
    descriptorCount < 0
  ) {
    throw new TypeError(`${label} share is invalid.`);
  }
  const share =
    (BigInt(maximum) / BigInt(plannedJourneyCount)) * BigInt(descriptorCount);
  if (share > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError(`${label} share exceeds the production bound.`);
  }
  return Number(share);
};

const checkedDescriptorContexts = (
  plan: AgentModelEvaluationPlan,
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[]
) => {
  if (
    descriptors.length > plan.plannedJourneyCount ||
    new Set(descriptors.map(({ descriptorDigest }) => descriptorDigest))
      .size !== descriptors.length
  ) {
    throw new TypeError('Production budget descriptors are not an exact set.');
  }
  const plannedByDigest = new Map(
    planAgentModelEvaluationAttempts(plan).map((descriptor) => [
      descriptor.descriptorDigest,
      descriptor,
    ])
  );
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
  return descriptors.map((descriptor) => {
    const planned = plannedByDigest.get(descriptor.descriptorDigest);
    const evaluationCase = casesById.get(descriptor.caseId);
    const target = targetsById.get(descriptor.targetId);
    if (
      !planned ||
      !evaluationCase ||
      !target ||
      !sameCanonicalJson(planned, descriptor)
    ) {
      throw new TypeError(
        'Production budget descriptor drifted from the frozen plan.'
      );
    }
    const capability = resolveAgentEvaluationCapabilityDescriptor(
      evaluationCase,
      target
    );
    if (capability.descriptorDigest !== descriptor.capabilityDescriptorDigest) {
      throw new TypeError(
        'Production budget capability drifted from the frozen descriptor.'
      );
    }
    return Object.freeze({ descriptor, target, capability });
  });
};

const exactHostedAttemptCount = (
  plan: AgentModelEvaluationPlan,
  descriptors: readonly AgentModelEvaluationAttemptDescriptor[]
): number =>
  checkedDescriptorContexts(plan, descriptors).filter(
    ({ target, capability }) => {
      if (
        capability.capabilityId !== 'provider.hosted-retrieval' ||
        capability.supportExpectation !== 'required'
      ) {
        return false;
      }
      const source =
        target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
      if (
        !source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
        (source.protocolFamily !== 'openai-responses' &&
          source.protocolFamily !== 'gemini-interactions') ||
        !AGENT_CAPABILITY_PROBE_PROFILE_IDS.includes(
          source.capabilityProfileId as AgentCapabilityProbeProfileId
        )
      ) {
        throw new TypeError(
          'Hosted attempt budget is missing its exact runtime resource intent.'
        );
      }
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId:
          source.capabilityProfileId as AgentCapabilityProbeProfileId,
        capabilityProfileDigest: source.capabilityProfileDigest,
      });
      if (
        program.profileProjection.capabilityId !==
          'provider.hosted-retrieval' ||
        program.hardLimits.maximumToolCalls !== 1 ||
        program.hardLimits.maximumProviderRoundTrips !== 1 ||
        !sameCanonicalJson(program.providerRequestIntent.requiredToolNames, [
          'provider.retrieval.search',
        ])
      ) {
        throw new TypeError('Hosted attempt budget program is not exact.');
      }
      return true;
    }
  ).length;

const createOrdinaryUsageShare = (
  plan: AgentModelEvaluationPlan,
  descriptorCount: number
): readonly AgentUsageAmount[] =>
  plan.budget.budget.usageLimits.flatMap(({ unit, maximum }) => {
    if (exactAttemptUsageUnits.has(unit) || descriptorCount === 0) return [];
    const amount = scaledShare(
      maximum,
      plan.plannedJourneyCount,
      descriptorCount
    );
    return compareAgentDecimals(amount, '0') === 0
      ? []
      : [
          Object.freeze({
            unit,
            logicalAmount: amount,
            billableAmount: amount,
            confidence: 'estimated' as const,
          }),
        ];
  });

/**
 * Creates one deterministic reservation demand. Ordinary decimal ceilings are
 * divided across the complete frozen matrix; Hosted request units stay tied to
 * the exact descriptors that can execute that program.
 */
export const createProductionAgentEvaluationAttemptBudgetDemand = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    controlledRuntime: AgentEvaluationControlledRuntimeConfiguration;
    descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
  }>
): AgentBudgetDemand => {
  const descriptorCount = input.descriptors.length;
  const hostedAttemptCount = exactHostedAttemptCount(
    input.plan,
    input.descriptors
  );
  const budget = input.plan.budget.budget;
  const usage = createAgentUsageVector([
    ...createOrdinaryUsageShare(input.plan, descriptorCount),
    ...(hostedAttemptCount === 0
      ? []
      : [
          Object.freeze({
            unit: 'hosted-search-query' as const,
            logicalAmount: String(hostedAttemptCount),
            billableAmount: String(hostedAttemptCount),
            confidence: 'estimated' as const,
          }),
          Object.freeze({
            unit: 'hosted-tool-call' as const,
            logicalAmount: String(hostedAttemptCount),
            billableAmount: String(hostedAttemptCount),
            confidence: 'estimated' as const,
          }),
        ]),
  ]);
  return Object.freeze({
    usage,
    cost: normalizeAgentCosts(
      descriptorCount === 0
        ? []
        : input.plan.budget.budget.costLimits.flatMap(
            ({ currency, maximum }) => {
              const amount = scaledShare(
                maximum,
                input.plan.plannedJourneyCount,
                descriptorCount
              );
              return compareAgentDecimals(amount, '0') === 0
                ? []
                : [
                    Object.freeze({
                      currency,
                      amount,
                      confidence: 'estimated' as const,
                    }),
                  ];
            }
          )
    ),
    modelInvocations: scaledIntegerShare(
      Math.min(budget.maxModelInvocations, input.plan.budget.maxProviderJobs),
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt model invocation ceiling'
    ),
    toolCalls: scaledIntegerShare(
      budget.maxToolCalls,
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt tool-call ceiling'
    ),
    repairRounds: scaledIntegerShare(
      budget.maxRepairRounds,
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt repair ceiling'
    ),
    transactions: scaledIntegerShare(
      budget.maxTransactions,
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt transaction ceiling'
    ),
    artifactBytes: scaledIntegerShare(
      budget.maxArtifactBytes,
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt artifact ceiling'
    ),
    elapsedMs: scaledIntegerShare(
      budget.maxElapsedMs,
      input.plan.plannedJourneyCount,
      descriptorCount,
      'Production attempt elapsed ceiling'
    ),
  });
};

const pricingAuthorityKeys = Object.freeze([
  'openaiResponses',
  'anthropicMessages',
  'geminiInteractions',
  'hostedCompatibility',
  'localCompatibility',
] as const satisfies readonly AgentEvaluationRunConfigPricingAuthorityKey[]);

const assertPricingShare = (
  plan: AgentModelEvaluationPlan,
  pricingAuthorities: Readonly<
    Record<
      AgentEvaluationRunConfigPricingAuthorityKey,
      AgentEvaluationFrozenPricingAuthority
    >
  >
): void => {
  const ordinaryShareByUnit = new Map(
    plan.budget.budget.usageLimits
      .filter(({ unit }) => !exactAttemptUsageUnits.has(unit))
      .map(({ unit, maximum }) => [
        unit,
        divideAgentDecimalFloor(maximum, plan.plannedJourneyCount),
      ])
  );
  const costShareByCurrency = new Map(
    plan.budget.budget.costLimits.map(({ currency, maximum }) => [
      currency,
      divideAgentDecimalFloor(maximum, plan.plannedJourneyCount),
    ])
  );
  for (const key of pricingAuthorityKeys) {
    const pricing = pricingAuthorities[key].snapshot;
    const units = [...new Set(pricing.rates.map(({ unit }) => unit))].filter(
      (unit) => {
        const amount = ordinaryShareByUnit.get(unit);
        return amount !== undefined && compareAgentDecimals(amount, '0') > 0;
      }
    );
    const pricedUsage = createAgentUsageVector(
      units.map((unit) => {
        const amount = ordinaryShareByUnit.get(unit)!;
        return Object.freeze({
          unit,
          logicalAmount: amount,
          billableAmount: amount,
          confidence: 'estimated' as const,
        });
      })
    );
    for (const priced of priceAgentUsage(pricedUsage, pricing)) {
      const available = costShareByCurrency.get(priced.currency);
      if (
        priced.amount === undefined ||
        !available ||
        compareAgentDecimals(available, priced.amount) < 0
      ) {
        throw new TypeError(
          'Production per-attempt cost share cannot cover frozen pricing.'
        );
      }
    }
  }
};

/** Proves every per-attempt hard bound before any reservation or Provider call. */
export const assertProductionAgentEvaluationAttemptBudgetPreflight = (
  input: Readonly<{
    plan: AgentModelEvaluationPlan;
    controlledRuntime: AgentEvaluationControlledRuntimeConfiguration;
    pricingAuthorities: Readonly<
      Record<
        AgentEvaluationRunConfigPricingAuthorityKey,
        AgentEvaluationFrozenPricingAuthority
      >
    >;
  }>
): void => {
  const descriptors = planAgentModelEvaluationAttempts(input.plan);
  if (
    descriptors.length !== input.plan.plannedJourneyCount ||
    descriptors.length === 0
  ) {
    throw new TypeError('Production budget matrix is incomplete.');
  }
  const demand = createProductionAgentEvaluationAttemptBudgetDemand({
    plan: input.plan,
    controlledRuntime: input.controlledRuntime,
    descriptors,
  });
  const budget = input.plan.budget.budget;
  const amountByUnit = new Map(
    demand.usage.amounts.map((amount) => [amount.unit, amount])
  );
  const textOutputShare = divideAgentDecimalFloor(
    budget.usageLimits.find(({ unit }) => unit === 'text-token-output')
      ?.maximum ?? '0',
    input.plan.plannedJourneyCount
  );
  if (
    budget.usageLimits
      .filter(({ unit }) => !exactAttemptUsageUnits.has(unit))
      .some(
        ({ unit }) =>
          !amountByUnit.has(unit) ||
          compareAgentDecimals(
            amountByUnit.get(unit)?.logicalAmount ?? '0',
            '0'
          ) === 0
      ) ||
    budget.costLimits.some(
      ({ currency }) =>
        !demand.cost.some(
          (cost) =>
            cost.currency === currency &&
            compareAgentDecimals(cost.amount ?? '0', '0') > 0
        )
    ) ||
    compareAgentDecimals(
      textOutputShare,
      String(PRODUCTION_AGENT_EVALUATION_MAXIMUM_OUTPUT_TOKENS_PER_TURN)
    ) < 0 ||
    [
      demand.modelInvocations,
      demand.toolCalls,
      demand.repairRounds,
      demand.transactions,
      demand.artifactBytes,
      demand.elapsedMs,
    ].some((value) => value < 1) ||
    demand.modelInvocations > budget.maxModelInvocations ||
    demand.toolCalls > budget.maxToolCalls ||
    demand.repairRounds > budget.maxRepairRounds ||
    demand.transactions > budget.maxTransactions ||
    demand.artifactBytes > budget.maxArtifactBytes ||
    demand.elapsedMs > budget.maxElapsedMs ||
    demand.modelInvocations > input.plan.budget.maxProviderJobs
  ) {
    throw new TypeError(
      'Production budget cannot cover the frozen per-attempt execution ceiling.'
    );
  }
  assertPricingShare(input.plan, input.pricingAuthorities);
};
