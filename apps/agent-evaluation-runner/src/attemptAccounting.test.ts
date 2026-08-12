import { readFileSync } from 'node:fs';
import {
  getG4V8PublicEvaluationCaseMaterials,
  createAgentEvaluationTransportReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationAttemptStatus,
  type AgentEvaluationCaseMaterial,
  type AgentProviderAdapterInvocationRequest,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import type { AgentEvaluationAttemptAccountingInput } from './attemptExecutor';
import {
  AGENT_EVALUATION_ATTEMPT_FAILURE_SOURCE_URI,
  createAgentEvaluationProductionAttemptAccounting,
  createAgentEvaluationPlanPricingSourceReceipt,
} from './attemptAccounting';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import type { AgentEvaluationTransportReceipt } from './providerTransport';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const plannedAt = '2026-08-08T00:00:00.000Z';
const requestDigest = digestAgentCanonicalValue({ request: 'accounting-test' });
const responseDigest = digestAgentCanonicalValue({
  response: 'accounting-test',
});

let cachedProductionConfig:
  AgentEvaluationProductionFrozenRunConfig | undefined;
const productionConfig = (): AgentEvaluationProductionFrozenRunConfig => {
  if (cachedProductionConfig) return cachedProductionConfig;
  const source = JSON.parse(readFileSync(examplePath, 'utf8')) as Record<
    string,
    unknown
  >;
  materializeAgentEvaluationTestProductionRunConfig(source);
  cachedProductionConfig = requireProductionAgentEvaluationFrozenRunConfig(
    decodeAgentEvaluationFrozenRunConfig(source, {
      clock: () => plannedAt,
      expectedRepositoryCommit: exactCommit,
    }),
    exactCommit
  );
  return cachedProductionConfig;
};
productionConfig();

const fixture = (
  protocolFamily:
    | 'openai-responses'
    | 'anthropic-messages'
    | 'gemini-interactions' = 'openai-responses'
) => {
  const config = productionConfig();
  const material = getG4V8PublicEvaluationCaseMaterials().find((candidate) =>
    config.plan.concreteCases.some(({ caseId }) => caseId === candidate.caseId)
  ) as AgentEvaluationCaseMaterial | undefined;
  if (!material) throw new Error('Accounting test material is unavailable.');
  const descriptor = planAgentModelEvaluationAttempts(config.plan).find(
    (candidate) => {
      const target = config.plan.capabilityQualificationTargets.find(
        ({ targetId }) => targetId === candidate.targetId
      );
      return (
        candidate.caseId === material.caseId &&
        target?.protocolFamily === protocolFamily
      );
    }
  );
  if (!descriptor)
    throw new Error('Accounting test descriptor is unavailable.');
  const target = config.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor.targetId
  )!;
  const invocation: AgentProviderAdapterInvocationRequest = Object.freeze({
    invocationId: `evaluation-invocation:${descriptor.samplingIdentityDigest.slice('sha256-'.length)}:1`,
    requestDigest,
    providerConfigurationId: target.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    capabilityProfileDigest: target.capabilityProfileDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    contextPackDigest: digestAgentCanonicalValue({ context: material.caseId }),
  });
  return { config, material, descriptor, target, invocation };
};

type AccountingInputWithoutTransport = Omit<
  AgentEvaluationAttemptAccountingInput,
  'transportReceipt'
>;

const accountingInputBase = (
  status: AgentEvaluationAttemptStatus = 'completed',
  protocolFamily:
    | 'openai-responses'
    | 'anthropic-messages'
    | 'gemini-interactions' = 'openai-responses'
): AccountingInputWithoutTransport => {
  const { config, material, descriptor, invocation } = fixture(protocolFamily);
  return Object.freeze({
    plan: config.plan,
    descriptor,
    material,
    protocolFamily,
    invocation,
    turnIndex: 0,
    phase: 'domain-tools',
    status,
    responseDigest,
    reportedUsage:
      status === 'completed'
        ? createAgentUsageVector([
            {
              unit: 'text-token-input',
              logicalAmount: '12',
              billableAmount: '12',
              confidence: 'reported',
            },
            {
              unit: 'text-token-output',
              logicalAmount: '4',
              billableAmount: '4',
              confidence: 'reported',
            },
          ])
        : createAgentUsageVector([
            { unit: 'text-token-input', confidence: 'unknown' },
            { unit: 'text-token-output', confidence: 'unknown' },
          ]),
    events: Object.freeze([]),
    terminalEvent: Object.freeze({}) as never,
    startedAt: '2026-08-08T00:00:00.001Z',
    completedAt: '2026-08-08T00:00:00.004Z',
  });
};

const transportReceipt = (
  input: AccountingInputWithoutTransport,
  options: Readonly<{
    dispatchState?: 'dispatched' | 'not-dispatched';
    providerRequestId?: string;
  }> = { providerRequestId: 'request.openai.accounting-test' }
): AgentEvaluationTransportReceipt => {
  const dispatched = options.dispatchState !== 'not-dispatched';
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  )!;
  const model = input.plan.modelConfigurations.find(
    ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
  )!;
  const base = Object.freeze({
    receiptId: 'provider-transport-receipt.accounting-test',
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.invocation.providerConfigurationId,
    invocationId: input.invocation.invocationId,
    requestDigest: input.invocation.requestDigest,
    endpointId: 'endpoint.openai-responses',
    endpointClass: 'first-party-hosted' as const,
    dispatchIntentDigest: digestAgentCanonicalValue({
      intent: 'accounting-test',
    }),
    requestBodyDigest: digestAgentCanonicalValue({ body: 'bounded' }),
    requestBytes: dispatched ? 128 : 0,
    responseBytes: dispatched ? 64 : 0,
    ...(dispatched
      ? { httpStatus: input.status === 'completed' ? 200 : 503 }
      : {}),
    ...(dispatched
      ? {
          responseHeaderDigest: digestAgentCanonicalValue({
            headers: 'allowlisted',
          }),
          responseBodyDigest: digestAgentCanonicalValue({
            body: 'provider-response',
          }),
        }
      : {}),
    ...(options.providerRequestId
      ? { providerRequestId: options.providerRequestId }
      : {}),
    ...(input.status === 'completed'
      ? {
          resolvedModelId: model.modelId,
          ...(input.protocolFamily === 'gemini-interactions'
            ? { resolvedModelVersion: model.immutableVersion }
            : {}),
        }
      : {}),
    sseEventCount: 0,
    dispatchState: dispatched
      ? ('dispatched' as const)
      : ('not-dispatched' as const),
    outcome:
      input.status === 'completed'
        ? ('completed' as const)
        : ('failed' as const),
    ...(input.status === 'completed'
      ? {}
      : {
          errorCategory: AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected,
        }),
    startedAt: '2026-08-08T00:00:00.002Z',
    completedAt: '2026-08-08T00:00:00.003Z',
  });
  return createAgentEvaluationTransportReceipt(base);
};

const accountingFor = async (input: AgentEvaluationAttemptAccountingInput) => {
  const config = productionConfig();
  const records: unknown[] = [];
  const resolve = createAgentEvaluationProductionAttemptAccounting({
    runConfig: config,
    persistAccountingRecord: (record) => {
      records.push(record);
      return record;
    },
  });
  return { accounting: await resolve(input), records };
};

const accountingInput = (
  status: AgentEvaluationAttemptStatus = 'completed',
  protocolFamily:
    | 'openai-responses'
    | 'anthropic-messages'
    | 'gemini-interactions' = 'openai-responses',
  receiptOptions?: Readonly<{
    dispatchState?: 'dispatched' | 'not-dispatched';
    providerRequestId?: string;
  }>
): AgentEvaluationAttemptAccountingInput => {
  const base = accountingInputBase(status, protocolFamily);
  return Object.freeze({
    ...base,
    transportReceipt: transportReceipt(base, receiptOptions),
  });
};

describe('production evaluation attempt accounting', () => {
  it('prices authoritative reported usage with the frozen snapshot and exact source lineage', async () => {
    const input = accountingInput('completed', 'openai-responses', {
      providerRequestId: 'request.openai.accounting-test',
    });
    const { accounting, records } = await accountingFor(input);

    expect(accounting).toMatchObject({
      dispatchState: 'dispatched',
      costStatus: 'priced',
      providerRequestId: 'request.openai.accounting-test',
    });
    expect(accounting.usage.amounts).toHaveLength(2);
    expect(accounting.cost).toEqual([
      expect.objectContaining({ currency: 'USD', confidence: 'reported' }),
    ]);
    expect(accounting.cost[0]?.amount).not.toBe('0');
    expect(accounting.costSourceReceipt.sourceKind).toBe('cost-calculation');
    expect(accounting.pricingSourceReceipt?.sourceKind).toBe(
      'pricing-snapshot'
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ turnIndex: 0 });
  });

  it('reuses one canonical pricing authority receipt across multiple plan invocations', async () => {
    const firstInput = accountingInput('completed', 'openai-responses', {
      providerRequestId: 'request.openai.pricing-singleton.1',
    });
    const first = (await accountingFor(firstInput)).accounting;
    const secondInvocation = Object.freeze({
      ...firstInput.invocation,
      invocationId: `${firstInput.invocation.invocationId}.second`,
      requestDigest: digestAgentCanonicalValue({
        request: 'accounting-test-second',
      }),
    });
    const secondBase = Object.freeze({
      ...firstInput,
      invocation: secondInvocation,
      turnIndex: 1,
      responseDigest: digestAgentCanonicalValue({
        response: 'accounting-test-second',
      }),
    });
    const secondInput = Object.freeze({
      ...secondBase,
      transportReceipt: transportReceipt(secondBase, {
        providerRequestId: 'request.openai.pricing-singleton.2',
      }),
    });
    const second = (await accountingFor(secondInput)).accounting;
    const config = productionConfig();
    const target = config.plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === firstInput.descriptor.targetId
    )!;
    const canonical = createAgentEvaluationPlanPricingSourceReceipt({
      planDigest: config.plan.planDigest,
      repositoryCommit: config.plan.repositoryCommit,
      modelLineageDigest: target.modelLineageDigest,
      authority: config.pricingAuthorities.openaiResponses,
    });

    expect(first.pricingSourceReceipt).toEqual(canonical);
    expect(second.pricingSourceReceipt).toEqual(canonical);
    expect(first.usageSourceReceipt.receiptDigest).not.toBe(
      second.usageSourceReceipt.receiptDigest
    );
  });

  it('keeps post-dispatch unknown cost empty and binds a sanitized transport failure authority', async () => {
    const input = accountingInput('provider-error', 'openai-responses', {
      dispatchState: 'dispatched',
    });
    const { accounting } = await accountingFor(input);

    expect(accounting).toMatchObject({
      dispatchState: 'dispatched',
      costStatus: 'unknown',
      cost: [],
      executionFailureSourceUri: AGENT_EVALUATION_ATTEMPT_FAILURE_SOURCE_URI,
    });
    expect(accounting.usage.amounts).toEqual([]);
    expect(accounting.providerRequestId).toBeUndefined();
    expect(accounting.costSourceReceipt).toMatchObject({
      sourceKind: 'provider-reported-cost',
      sourceUri: AGENT_EVALUATION_ATTEMPT_FAILURE_SOURCE_URI,
      outputCostDigest: digestAgentCanonicalValue([]),
    });
  });

  it('rejects not-dispatched turns before provider source accounting', async () => {
    const input = accountingInput('infrastructure-error', 'openai-responses', {
      dispatchState: 'not-dispatched',
    });
    await expect(accountingFor(input)).rejects.toThrow(/Not-dispatched/u);
  });

  it('fails closed on a cross-bound transport receipt', async () => {
    const base = accountingInputBase('provider-error');
    const captured = transportReceipt(base, { dispatchState: 'dispatched' });
    const input = Object.freeze({
      ...base,
      transportReceipt: Object.freeze({
        ...captured,
        requestDigest: digestAgentCanonicalValue({ request: 'other' }),
      }) as AgentEvaluationTransportReceipt,
    });
    await expect(accountingFor(input)).rejects.toThrow(/binding drifted/u);
  });

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'keeps %s missing or drifted response model identity unpriced and incomplete',
    async (protocolFamily) => {
      for (const identityCase of ['missing', 'drifted'] as const) {
        const baseInput = accountingInputBase('completed', protocolFamily);
        const captured = transportReceipt(baseInput, {
          providerRequestId: `request.${protocolFamily}.model-identity`,
        });
        const {
          receiptDigest: _receiptDigest,
          resolvedModelId: _resolvedModelId,
          resolvedModelVersion: _resolvedModelVersion,
          ...receiptBase
        } = captured;
        const adjustedBase = Object.freeze({
          ...receiptBase,
          ...(identityCase === 'drifted'
            ? {
                resolvedModelId: `drifted.${protocolFamily}.model`,
                ...(protocolFamily === 'gemini-interactions'
                  ? { resolvedModelVersion: 'drifted.version' }
                  : {}),
              }
            : {}),
        });
        const adjusted = createAgentEvaluationTransportReceipt(adjustedBase);
        const input = Object.freeze({
          ...baseInput,
          transportReceipt: adjusted,
        });

        const { accounting } = await accountingFor(input);

        expect(accounting).toMatchObject({
          statusOverride: 'infrastructure-error',
          dispatchState: 'dispatched',
          costStatus: 'unknown',
          cost: [],
        });
        expect(accounting.resolvedModelIdentityDigest).toMatch(/^sha256-/u);
      }
    }
  );
});
