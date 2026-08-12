import { describe, expect, it } from 'vitest';
import type { AgentProviderProtocolFamily } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import {
  createAgentEvaluationEndpointSmokeDispatchIntent,
  createAgentEvaluationEndpointSmokeReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationEndpointSmokeResultSpoolReceipt,
  createAgentEvaluationEndpointSmokeValidationFailureReceipt,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  digestAgentEvaluationEndpointSmokeDispatchIntentSet,
  digestAgentEvaluationEndpointSmokeReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet,
  digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet,
  digestAgentEvaluationEndpointSmokeTransportReceiptSet,
  digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet,
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  validateAgentEvaluationEndpointSmokeTargetBinding,
  type AgentEvaluationEndpointSmokePassedReceipt,
  type AgentEvaluationEndpointSmokeFailureCategory,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
  type CreateAgentEvaluationEndpointSmokeReceiptInput,
} from './agentEvaluationEndpointSmoke';
import {
  matchAgentEvaluationEndpointSmokeAuthorityFacts,
  qualifiesAgentEvaluationEndpointSmokeReceipt,
  qualifiesAgentEvaluationEndpointSmokeSet,
} from './agentEvaluationEndpointSmokeAuthenticity';
import type { AgentEvaluationEndpointSmokeTarget } from './agentEvaluation.types';

const repositoryCommit = 'a'.repeat(40);
const startedAt = '2026-08-08T00:00:00.000Z';
const completedAt = '2026-08-08T00:00:01.000Z';
const digest = (label: string) => digestAgentCanonicalValue({ label });

const targetFor = (
  protocolFamily: AgentProviderProtocolFamily,
  modelId: string,
  immutableModelVersion: string,
  identity: string = protocolFamily,
  endpointClass: AgentEvaluationEndpointSmokeTarget['endpointClass'] = 'first-party-hosted'
): AgentEvaluationEndpointSmokeTarget => {
  const smokeTargetId = `smoke.${identity}`;
  const base = Object.freeze({
    smokeTargetId,
    endpointClass,
    endpointRef: `endpoint.${protocolFamily}`,
    protocolFamily,
    providerConfigurationId: `provider.${protocolFamily}`,
    modelId,
    immutableModelVersion,
    modelLineageDigest: digest(`${smokeTargetId}.model-lineage`),
    inferenceConfigurationDigest: digest(`${smokeTargetId}.inference`),
    adapterDigest: digest(`${smokeTargetId}.adapter`),
    pricingAuthorityDigest: digest(`${smokeTargetId}.pricing-authority`),
    responseSpoolEncryptionPolicyDigest: digest(
      `${smokeTargetId}.response-spool-encryption-policy`
    ),
    smokeProfileDigest: digest(`${smokeTargetId}.profile`),
  });
  return Object.freeze({
    ...base,
    targetDigest: digestAgentCanonicalValue(base),
  });
};

const dispatchIntentFor = (target: AgentEvaluationEndpointSmokeTarget) =>
  createAgentEvaluationEndpointSmokeDispatchIntent({
    intentId: `intent.${target.smokeTargetId}`,
    planDigest: digest('plan'),
    repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    endpointClass: target.endpointClass,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    immutableModelVersion: target.immutableModelVersion,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    adapterDigest: target.adapterDigest,
    pricingAuthorityDigest: target.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      target.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: target.smokeProfileDigest,
    invocationId: `invocation.${target.smokeTargetId}`,
    budgetReservationId: `reservation.${target.smokeTargetId}`,
    demandDigest: digest(`${target.smokeTargetId}.demand`),
    requestDigest: digest(`${target.smokeTargetId}.request`),
    endpointId: `endpoint-id.${target.smokeTargetId}`,
    requestBodyDigest: digest(`${target.smokeTargetId}.request-body`),
    requestBytes: 128,
    createdAt: startedAt,
  });

type PassedInput = Extract<
  CreateAgentEvaluationEndpointSmokeReceiptInput,
  Readonly<{ outcome: 'passed' }>
>;

const passedInputFor = (
  target: AgentEvaluationEndpointSmokeTarget,
  resolvedModelId: string,
  resolvedModelVersion?: string
): PassedInput => {
  const usageSourceDigest = digest(`${target.smokeTargetId}.usage-source`);
  const costSourceDigest = digest(`${target.smokeTargetId}.cost-source`);
  const usage = createAgentUsageVector([
    {
      unit: 'text-token-input',
      logicalAmount: '4',
      billableAmount: '4',
      confidence: 'reported',
      sourceDigest: usageSourceDigest,
    },
  ]);
  return Object.freeze({
    receiptId: `receipt.${target.smokeTargetId}`,
    planDigest: digest('plan'),
    repositoryCommit,
    smokeTargetId: target.smokeTargetId,
    smokeTargetDigest: target.targetDigest,
    endpointClass: target.endpointClass,
    protocolFamily: target.protocolFamily,
    providerConfigurationId: target.providerConfigurationId,
    modelId: target.modelId,
    immutableModelVersion: target.immutableModelVersion,
    modelLineageDigest: target.modelLineageDigest,
    inferenceConfigurationDigest: target.inferenceConfigurationDigest,
    adapterDigest: target.adapterDigest,
    pricingAuthorityDigest: target.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      target.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: target.smokeProfileDigest,
    invocationId: `invocation.${target.smokeTargetId}`,
    budgetReservationId: `reservation.${target.smokeTargetId}`,
    demandDigest: digest(`${target.smokeTargetId}.demand`),
    settlementDigest: digest(`${target.smokeTargetId}.settlement`),
    dispatchIntentDigest: digest(`${target.smokeTargetId}.dispatch-intent`),
    transportReceiptDigest: digest(`${target.smokeTargetId}.transport`),
    requestDigest: digest(`${target.smokeTargetId}.request`),
    providerRequestId: `provider-request.${target.smokeTargetId}`,
    responseHeaderDigest: digest(`${target.smokeTargetId}.response-headers`),
    responseDigest: digest(`${target.smokeTargetId}.response`),
    resolvedModelId,
    ...(resolvedModelVersion ? { resolvedModelVersion } : {}),
    spoolReceiptDigest: digest(`${target.smokeTargetId}.spool`),
    spoolDispositionReceiptDigest: digest(
      `${target.smokeTargetId}.spool-disposition`
    ),
    usage,
    cost: Object.freeze([
      {
        currency: 'USD',
        amount: '0.01',
        confidence: 'reported' as const,
        sourceDigest: costSourceDigest,
      },
    ]),
    usageSourceReceiptDigest: digest(
      `${target.smokeTargetId}.usage-source-receipt`
    ),
    costSourceReceiptDigest: digest(
      `${target.smokeTargetId}.cost-source-receipt`
    ),
    outcome: 'passed' as const,
    startedAt,
    completedAt,
  });
};

const failedInputFor = (
  target: AgentEvaluationEndpointSmokeTarget,
  failureCategory: AgentEvaluationEndpointSmokeFailureCategory
) => {
  const passed = passedInputFor(target, target.modelId);
  return Object.freeze({
    receiptId: passed.receiptId,
    planDigest: passed.planDigest,
    repositoryCommit: passed.repositoryCommit,
    smokeTargetId: passed.smokeTargetId,
    smokeTargetDigest: passed.smokeTargetDigest,
    endpointClass: passed.endpointClass,
    protocolFamily: passed.protocolFamily,
    providerConfigurationId: passed.providerConfigurationId,
    modelId: passed.modelId,
    immutableModelVersion: passed.immutableModelVersion,
    modelLineageDigest: passed.modelLineageDigest,
    inferenceConfigurationDigest: passed.inferenceConfigurationDigest,
    adapterDigest: passed.adapterDigest,
    pricingAuthorityDigest: passed.pricingAuthorityDigest,
    responseSpoolEncryptionPolicyDigest:
      passed.responseSpoolEncryptionPolicyDigest,
    smokeProfileDigest: passed.smokeProfileDigest,
    invocationId: passed.invocationId,
    budgetReservationId: passed.budgetReservationId,
    demandDigest: passed.demandDigest,
    settlementDigest: passed.settlementDigest,
    dispatchIntentDigest: passed.dispatchIntentDigest,
    transportReceiptDigest: passed.transportReceiptDigest,
    requestDigest: passed.requestDigest,
    outcome: 'failed' as const,
    failureCategory,
    startedAt: passed.startedAt,
    completedAt: passed.completedAt,
  });
};

describe('agent evaluation endpoint smoke authority', () => {
  it('binds dispatch intent to the complete frozen target authority', () => {
    const target = targetFor(
      'openai-responses',
      'gpt-5.2-2026-08-01',
      'gpt-5.2-2026-08-01'
    );
    const intent = dispatchIntentFor(target);

    expect(isAgentEvaluationEndpointSmokeDispatchIntent(intent)).toBe(true);
    expect(() =>
      validateAgentEvaluationEndpointSmokeTargetBinding(target, intent)
    ).not.toThrow();
    expect(
      digestAgentEvaluationEndpointSmokeDispatchIntentSet([intent])
    ).toBeTypeOf('string');
    expect(() =>
      validateAgentEvaluationEndpointSmokeTargetBinding(
        { ...target, immutableModelVersion: 'gpt-5.2-drifted' },
        intent
      )
    ).toThrow(/target binding drifted/u);
  });

  it.each([
    {
      protocolFamily: 'openai-responses' as const,
      modelId: 'gpt-5.2-2026-08-01',
      immutableModelVersion: 'gpt-5.2-2026-08-01',
      resolvedModelVersion: undefined,
    },
    {
      protocolFamily: 'anthropic-messages' as const,
      modelId: 'claude-sonnet-4-20260801',
      immutableModelVersion: 'claude-sonnet-4-20260801',
      resolvedModelVersion: undefined,
    },
    {
      protocolFamily: 'gemini-interactions' as const,
      modelId: 'models/gemini-2.5-pro',
      immutableModelVersion: 'gemini-2.5-pro-20260801',
      resolvedModelVersion: 'gemini-2.5-pro-20260801',
    },
  ])(
    'accepts authoritative $protocolFamily native model identity',
    ({
      protocolFamily,
      modelId,
      immutableModelVersion,
      resolvedModelVersion,
    }) => {
      const target = targetFor(protocolFamily, modelId, immutableModelVersion);
      const receipt = createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(target, modelId, resolvedModelVersion)
      );

      expect(receipt.outcome).toBe('passed');
      expect(isAgentEvaluationEndpointSmokeReceipt(receipt)).toBe(true);
      expect(receipt.resolvedModelId).toBe(modelId);
      expect(
        (receipt as AgentEvaluationEndpointSmokePassedReceipt)
          .resolvedModelIdentityDigest
      ).toBeTypeOf('string');
      expect(
        digestAgentEvaluationEndpointSmokeReceiptSet([receipt])
      ).toBeTypeOf('string');
    }
  );

  it('rejects aliases, response drift, and missing Gemini immutable versions', () => {
    const openAiAliasTarget = targetFor(
      'openai-responses',
      'gpt-5',
      'gpt-5.2-2026-08-01'
    );
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(openAiAliasTarget, 'gpt-5')
      )
    ).toThrow(/receipt is invalid/u);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(
          openAiAliasTarget,
          'gpt-5',
          openAiAliasTarget.immutableModelVersion
        )
      )
    ).toThrow(/receipt is invalid/u);

    const anthropicTarget = targetFor(
      'anthropic-messages',
      'claude-sonnet-4-20260801',
      'claude-sonnet-4-20260801'
    );
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(anthropicTarget, 'claude-sonnet-4-latest')
      )
    ).toThrow(/receipt is invalid/u);

    const geminiTarget = targetFor(
      'gemini-interactions',
      'models/gemini-2.5-pro',
      'gemini-2.5-pro-20260801'
    );
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(geminiTarget, geminiTarget.modelId)
      )
    ).toThrow(/receipt is invalid/u);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt(
        passedInputFor(
          geminiTarget,
          geminiTarget.modelId,
          'gemini-2.5-pro-20260701'
        )
      )
    ).toThrow(/receipt is invalid/u);
  });

  it('keeps pre-dispatch failures free of response, model, spool, and accounting facts', () => {
    const target = targetFor(
      'openai-responses',
      'gpt-5.2-2026-08-01',
      'gpt-5.2-2026-08-01'
    );
    const intent = dispatchIntentFor(target);
    const transport = createAgentEvaluationTransportReceipt({
      receiptId: `transport.${target.smokeTargetId}`,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: intent.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseBytes: 0,
      sseEventCount: 0,
      dispatchState: 'not-dispatched',
      outcome: 'failed',
      errorCategory: 'G4_RUNNER_SECRET_UNAVAILABLE',
      startedAt,
      completedAt,
    });
    const failed = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'transport-not-dispatched'),
      invocationId: intent.invocationId,
      budgetReservationId: intent.budgetReservationId,
      demandDigest: intent.demandDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      requestDigest: intent.requestDigest,
    });

    expect(failed.outcome).toBe('failed');
    expect(isAgentEvaluationEndpointSmokeReceipt(failed)).toBe(true);
    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport,
        receipt: failed,
      })
    ).toBe(true);
    expect(qualifiesAgentEvaluationEndpointSmokeReceipt(failed)).toBe(false);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...failed,
        receiptDigest: undefined,
        providerRequestId: 'provider-request.illegal',
        responseHeaderDigest: digest('illegal-response-headers'),
        responseDigest: digest('illegal-response'),
      } as never)
    ).toThrow(/receipt is invalid/u);
  });

  it('retains each sanitized post-dispatch failure branch without qualifying it', () => {
    const target = targetFor(
      'openai-responses',
      'gpt-5.2-2026-08-01',
      'gpt-5.2-2026-08-01'
    );
    const intent = dispatchIntentFor(target);
    const passed = passedInputFor(target, target.modelId);
    const responseAuthority = Object.freeze({
      providerRequestId: passed.providerRequestId,
      responseHeaderDigest: passed.responseHeaderDigest,
      responseDigest: passed.responseDigest,
    });
    const modelAuthority = Object.freeze({
      resolvedModelId: passed.resolvedModelId,
    });
    const spoolAuthority = Object.freeze({
      spoolReceiptDigest: passed.spoolReceiptDigest,
      spoolDispositionReceiptDigest: passed.spoolDispositionReceiptDigest,
    });

    const unknownTransport = createAgentEvaluationTransportReceipt({
      receiptId: `transport.${target.smokeTargetId}.unknown`,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: intent.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseBytes: 0,
      sseEventCount: 0,
      dispatchState: 'dispatched',
      outcome: 'post-dispatch-unknown',
      errorCategory: 'G4_RUNNER_TRANSPORT_FAILED',
      startedAt,
      completedAt,
    });
    const postDispatchUnknown = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'transport-post-dispatch-unknown'),
      invocationId: intent.invocationId,
      budgetReservationId: intent.budgetReservationId,
      demandDigest: intent.demandDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: unknownTransport.receiptDigest,
      requestDigest: intent.requestDigest,
    });
    const providerResponseInvalid = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'provider-response-invalid'),
      ...responseAuthority,
      ...spoolAuthority,
      validationFailureReceiptDigest: digest(
        `${target.smokeTargetId}.validation-failure-receipt`
      ),
    });
    const modelIdentityDrift = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'model-identity-drift'),
      ...responseAuthority,
      ...modelAuthority,
      resolvedModelId: 'gpt-5.2-drifted',
      ...spoolAuthority,
    });
    const usageUnavailable = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'usage-unavailable'),
      ...responseAuthority,
      ...modelAuthority,
      ...spoolAuthority,
    });
    const costUnavailable = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'cost-unavailable'),
      ...responseAuthority,
      ...modelAuthority,
      ...spoolAuthority,
      usage: passed.usage,
      usageSourceReceiptDigest: passed.usageSourceReceiptDigest,
    });

    for (const receipt of [
      postDispatchUnknown,
      providerResponseInvalid,
      modelIdentityDrift,
      usageUnavailable,
      costUnavailable,
    ]) {
      expect(receipt.outcome).toBe('failed');
      expect(isAgentEvaluationEndpointSmokeReceipt(receipt)).toBe(true);
      expect(qualifiesAgentEvaluationEndpointSmokeReceipt(receipt)).toBe(false);
    }
    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport: unknownTransport,
        receipt: postDispatchUnknown,
      })
    ).toBe(true);
    expect(modelIdentityDrift).toMatchObject({
      failureCategory: 'model-identity-drift',
      resolvedModelId: 'gpt-5.2-drifted',
    });
    expect(costUnavailable).toMatchObject({
      failureCategory: 'cost-unavailable',
      usage: passed.usage,
    });
    expect(costUnavailable.cost).toBeUndefined();
  });

  it('rejects partial response, spool, and accounting authority groups', () => {
    const target = targetFor(
      'openai-responses',
      'gpt-5.2-2026-08-01',
      'gpt-5.2-2026-08-01'
    );
    const base = failedInputFor(target, 'transport-failed');
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...base,
        providerRequestId: 'provider-request.partial',
      } as never)
    ).toThrow(/receipt is invalid/u);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...base,
        spoolReceiptDigest: digest('partial-spool'),
      } as never)
    ).toThrow(/receipt is invalid/u);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...base,
        usage: createAgentUsageVector([]),
      } as never)
    ).toThrow(/receipt is invalid/u);
  });

  it('qualifies only the exact five-target all-passed smoke set', () => {
    const targets = Object.freeze([
      targetFor(
        'openai-responses',
        'gpt-5.2-2026-08-01',
        'gpt-5.2-2026-08-01',
        'release.openai-responses.native'
      ),
      targetFor(
        'anthropic-messages',
        'claude-sonnet-4-20260801',
        'claude-sonnet-4-20260801',
        'release.anthropic-messages.native'
      ),
      targetFor(
        'gemini-interactions',
        'gemini-3.0-pro',
        'gemini-3.0-pro-2026-08-01',
        'release.gemini-interactions.native'
      ),
      targetFor(
        'openai-compatible',
        'compatible-hosted-v1',
        'compatible-hosted-v1',
        'release.openai-compatible.hosted',
        'self-hosted'
      ),
      targetFor(
        'openai-compatible',
        'compatible-local-v1',
        'compatible-local-v1',
        'release.openai-compatible.local',
        'local'
      ),
    ]);
    const passedReceipts = Object.freeze(
      targets.map((target) =>
        createAgentEvaluationEndpointSmokeReceipt(
          passedInputFor(
            target,
            target.modelId,
            target.protocolFamily === 'gemini-interactions'
              ? target.immutableModelVersion
              : undefined
          )
        )
      )
    );
    const failedReceipt = createAgentEvaluationEndpointSmokeReceipt(
      failedInputFor(targets[0]!, 'transport-not-dispatched')
    );

    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(targets, passedReceipts)
    ).toBe(true);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(targets.slice(0, 4), [
        ...passedReceipts.slice(0, 4),
      ])
    ).toBe(false);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(targets, [
        failedReceipt,
        ...passedReceipts.slice(1),
      ])
    ).toBe(false);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(
        [...targets.slice(0, 4), targets[0]!],
        passedReceipts
      )
    ).toBe(false);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(
        [
          ...targets.slice(0, 4),
          {
            ...targets[4]!,
            targetDigest: digest('drifted-release-target'),
          },
        ],
        passedReceipts
      )
    ).toBe(false);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(
        targets.map((target) => ({
          ...target,
          protocolFamily: 'openai-responses' as const,
        })),
        passedReceipts
      )
    ).toBe(false);
    expect(
      qualifiesAgentEvaluationEndpointSmokeSet(
        targets.map((target) =>
          target.smokeTargetId === 'smoke.release.openai-compatible.hosted'
            ? { ...target, endpointClass: 'local' as const }
            : target
        ),
        passedReceipts
      )
    ).toBe(false);
  });

  it('cross-binds completed transport, encrypted replay spool, disposition, and terminal receipt', () => {
    const target = targetFor(
      'openai-responses',
      'gpt-5.2-2026-08-01',
      'gpt-5.2-2026-08-01'
    );
    const intent = dispatchIntentFor(target);
    const transport = createAgentEvaluationTransportReceipt({
      receiptId: `transport.${target.smokeTargetId}`,
      protocolFamily: target.protocolFamily,
      providerConfigurationId: target.providerConfigurationId,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      requestDigest: intent.requestDigest,
      endpointId: intent.endpointId,
      endpointClass: intent.endpointClass,
      requestBodyDigest: intent.requestBodyDigest,
      requestBytes: intent.requestBytes,
      responseBytes: 512,
      httpStatus: 200,
      responseHeaderDigest: digest('smoke.response-headers'),
      responseBodyDigest: digest('smoke.response-body'),
      providerRequestId: 'provider-request.smoke',
      providerIdentityKind: 'response-id',
      providerResponseId: 'provider-response.smoke',
      resolvedModelId: target.modelId,
      sseEventCount: 2,
      dispatchState: 'dispatched',
      outcome: 'completed',
      startedAt,
      completedAt,
    });
    const aad: AgentEvaluationEndpointSmokeResultSpoolAad = Object.freeze({
      format: 'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad',
      version: 1,
      namespaceDigest: digest('smoke.spool-namespace'),
      planDigest: intent.planDigest,
      repositoryCommit,
      smokeTargetId: target.smokeTargetId,
      smokeTargetDigest: target.targetDigest,
      invocationId: intent.invocationId,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      responseBodyDigest: transport.responseBodyDigest!,
      normalizedEventSetDigest: digest('smoke.normalized-events'),
    });
    const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
      spoolId: createAgentEvaluationEndpointSmokeResultSpoolId(aad),
      algorithm: 'aes-256-gcm',
      keyId: 'key.g4-model-eval.result-spool.v1',
      keyVersion: 1,
      keyRefDigest: digest('smoke.key-ref'),
      encryptionProfileDigest: digest('smoke.encryption-profile'),
      nonceBase64Url: 'AAAAAAAAAAAAAAAA',
      authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
      ciphertextBase64Url: 'AQID',
      aadDigest: digestAgentEvaluationEndpointSmokeResultSpoolAad(aad),
    });
    const spool = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
      aad,
      envelope,
      responseDigest: digest('smoke.normalized-response'),
      retentionPolicyDigest: digest('smoke.retention-policy'),
      createdAt: completedAt,
      expiresAt: '2026-08-09T00:00:00.000Z',
    });
    const disposition =
      createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
        spoolRef: spool.spoolRef,
        spoolReceiptDigest: spool.receiptDigest,
        planDigest: spool.planDigest,
        repositoryCommit,
        smokeTargetId: target.smokeTargetId,
        smokeTargetDigest: target.targetDigest,
        invocationId: intent.invocationId,
        disposition: 'consumed-and-destroyed',
        retentionPolicyDigest: spool.retentionPolicyDigest,
        disposedAt: '2026-08-08T00:00:02.000Z',
      });
    const receipt = createAgentEvaluationEndpointSmokeReceipt({
      ...passedInputFor(target, target.modelId),
      invocationId: intent.invocationId,
      budgetReservationId: intent.budgetReservationId,
      demandDigest: intent.demandDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      requestDigest: intent.requestDigest,
      providerRequestId: transport.providerRequestId!,
      responseHeaderDigest: transport.responseHeaderDigest!,
      responseDigest: spool.responseDigest,
      spoolReceiptDigest: spool.receiptDigest,
      spoolDispositionReceiptDigest: disposition.receiptDigest,
    });

    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport,
        spool,
        disposition,
        receipt,
      })
    ).toBe(true);
    expect(qualifiesAgentEvaluationEndpointSmokeReceipt(receipt)).toBe(true);

    const completedFailureAuthority = Object.freeze({
      invocationId: intent.invocationId,
      budgetReservationId: intent.budgetReservationId,
      demandDigest: intent.demandDigest,
      dispatchIntentDigest: intent.intentDigest,
      transportReceiptDigest: transport.receiptDigest,
      requestDigest: intent.requestDigest,
      providerRequestId: transport.providerRequestId!,
      responseHeaderDigest: transport.responseHeaderDigest!,
      responseDigest: spool.responseDigest,
      resolvedModelId: target.modelId,
      spoolReceiptDigest: spool.receiptDigest,
      spoolDispositionReceiptDigest: disposition.receiptDigest,
    });
    const validationFailure =
      createAgentEvaluationEndpointSmokeValidationFailureReceipt({
        receiptId: `validation-failure.${target.smokeTargetId}`,
        planDigest: intent.planDigest,
        repositoryCommit,
        smokeTargetId: target.smokeTargetId,
        smokeTargetDigest: target.targetDigest,
        invocationId: intent.invocationId,
        dispatchIntentDigest: intent.intentDigest,
        transportReceiptDigest: transport.receiptDigest,
        spoolReceiptDigest: spool.receiptDigest,
        validationCategory: 'expected-output-mismatch',
        findingDigest: digest(`${target.smokeTargetId}.validation-finding`),
        observedAt: completedAt,
      });
    expect(
      isAgentEvaluationEndpointSmokeValidationFailureReceipt(validationFailure)
    ).toBe(true);
    expect(
      digestAgentEvaluationEndpointSmokeValidationFailureReceiptSet([
        validationFailure,
      ])
    ).toMatch(/^sha256-/u);
    for (const failureCategory of [
      'provider-response-invalid',
      'usage-unavailable',
    ] as const) {
      const failedReceipt = createAgentEvaluationEndpointSmokeReceipt({
        ...failedInputFor(target, failureCategory),
        ...completedFailureAuthority,
        ...(failureCategory === 'provider-response-invalid'
          ? {
              validationFailureReceiptDigest: validationFailure.receiptDigest,
            }
          : {}),
      });
      expect(
        matchAgentEvaluationEndpointSmokeAuthorityFacts({
          planDigest: intent.planDigest,
          repositoryCommit,
          target,
          intent,
          transport,
          spool,
          disposition,
          ...(failureCategory === 'provider-response-invalid'
            ? { validationFailure }
            : {}),
          receipt: failedReceipt,
        })
      ).toBe(true);
      expect(qualifiesAgentEvaluationEndpointSmokeReceipt(failedReceipt)).toBe(
        false
      );
    }
    const knownUsage = passedInputFor(target, target.modelId);
    const costUnavailableReceipt = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'cost-unavailable'),
      ...completedFailureAuthority,
      usage: knownUsage.usage,
      usageSourceReceiptDigest: knownUsage.usageSourceReceiptDigest,
    });
    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport,
        spool,
        disposition,
        receipt: costUnavailableReceipt,
      })
    ).toBe(true);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...failedInputFor(target, 'usage-unavailable'),
        ...completedFailureAuthority,
        usage: knownUsage.usage,
        usageSourceReceiptDigest: knownUsage.usageSourceReceiptDigest,
      })
    ).toThrow(/receipt is invalid/u);
    expect(() =>
      createAgentEvaluationEndpointSmokeReceipt({
        ...failedInputFor(target, 'cost-unavailable'),
        ...completedFailureAuthority,
        usage: knownUsage.usage,
        usageSourceReceiptDigest: knownUsage.usageSourceReceiptDigest,
        cost: knownUsage.cost,
        costSourceReceiptDigest: knownUsage.costSourceReceiptDigest,
      })
    ).toThrow(/receipt is invalid/u);
    const falselyRelabeledModelDrift =
      createAgentEvaluationEndpointSmokeReceipt({
        ...failedInputFor(target, 'model-identity-drift'),
        ...completedFailureAuthority,
      });
    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport,
        spool,
        disposition,
        receipt: falselyRelabeledModelDrift,
      })
    ).toBe(false);

    const driftedTransport = createAgentEvaluationTransportReceipt({
      ...transport,
      receiptId: `transport.${target.smokeTargetId}.model-drift`,
      resolvedModelId: 'gpt-5.2-drifted',
      receiptDigest: undefined,
    } as never);
    const driftedAad: AgentEvaluationEndpointSmokeResultSpoolAad =
      Object.freeze({
        ...aad,
        transportReceiptDigest: driftedTransport.receiptDigest,
        responseBodyDigest: driftedTransport.responseBodyDigest!,
      });
    const driftedEnvelope = createAgentEvaluationProviderResultSpoolEnvelope({
      ...envelope,
      spoolId: createAgentEvaluationEndpointSmokeResultSpoolId(driftedAad),
      aadDigest: digestAgentEvaluationEndpointSmokeResultSpoolAad(driftedAad),
      envelopeDigest: undefined,
      ciphertextDigest: undefined,
      ciphertextSizeBytes: undefined,
    } as never);
    const driftedSpool = createAgentEvaluationEndpointSmokeResultSpoolReceipt({
      aad: driftedAad,
      envelope: driftedEnvelope,
      responseDigest: spool.responseDigest,
      retentionPolicyDigest: spool.retentionPolicyDigest,
      createdAt: spool.createdAt,
      expiresAt: spool.expiresAt,
    });
    const driftedDisposition =
      createAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt({
        ...disposition,
        spoolRef: driftedSpool.spoolRef,
        spoolReceiptDigest: driftedSpool.receiptDigest,
        receiptDigest: undefined,
      } as never);
    const modelDriftReceipt = createAgentEvaluationEndpointSmokeReceipt({
      ...failedInputFor(target, 'model-identity-drift'),
      ...completedFailureAuthority,
      transportReceiptDigest: driftedTransport.receiptDigest,
      resolvedModelId: driftedTransport.resolvedModelId!,
      spoolReceiptDigest: driftedSpool.receiptDigest,
      spoolDispositionReceiptDigest: driftedDisposition.receiptDigest,
    });
    expect(
      matchAgentEvaluationEndpointSmokeAuthorityFacts({
        planDigest: intent.planDigest,
        repositoryCommit,
        target,
        intent,
        transport: driftedTransport,
        spool: driftedSpool,
        disposition: driftedDisposition,
        receipt: modelDriftReceipt,
      })
    ).toBe(true);
    expect(
      qualifiesAgentEvaluationEndpointSmokeReceipt(modelDriftReceipt)
    ).toBe(false);

    expect(isAgentEvaluationEndpointSmokeResultSpoolReceipt(spool)).toBe(true);
    expect(
      isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt(disposition)
    ).toBe(true);
    expect(isAgentEvaluationEndpointSmokeReceipt(receipt)).toBe(true);
    expect(
      digestAgentEvaluationEndpointSmokeTransportReceiptSet([transport])
    ).toBeTypeOf('string');
    expect(
      digestAgentEvaluationEndpointSmokeResultSpoolReceiptSet([spool])
    ).toBeTypeOf('string');
    expect(
      digestAgentEvaluationEndpointSmokeResultSpoolDispositionReceiptSet([
        disposition,
      ])
    ).toBeTypeOf('string');
    expect(() =>
      createAgentEvaluationEndpointSmokeResultSpoolReceipt({
        aad: { ...aad, transportReceiptDigest: digest('transport-drift') },
        envelope,
        responseDigest: spool.responseDigest,
        retentionPolicyDigest: spool.retentionPolicyDigest,
        createdAt: spool.createdAt,
        expiresAt: spool.expiresAt,
      })
    ).toThrow(/authority binding is invalid/u);
  });
});
