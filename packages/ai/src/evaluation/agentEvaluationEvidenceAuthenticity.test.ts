import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentModelInvocationReceipt } from '../providers/agentProvider.types';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
} from '../providers/agentCapabilityProbeProgram';
import { createAgentNativeProviderCapabilityRuntimeRequestMaterial } from '../providers/agentNativeProviderCapabilityRuntime';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  createAgentEvaluationTransportAttemptReceipt,
  createAgentEvaluationTransportRetryReceipt,
  createAgentEvaluationReviewRasterScanReceipt,
} from './agentEvaluationResults';
import {
  createAgentEvaluationInvocationTurnReceipt,
  createAgentEvaluationInvocationTurnSetReceipt,
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolDispositionReceipt,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationProviderResultSpoolId,
  createAgentEvaluationProviderResultSpoolReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  digestAgentEvaluationProviderResultSpoolAad,
  digestAgentEvaluationResolvedModelIdentity,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import { createAgentEvaluationPreDispatchFailureReceipt } from './agentEvaluationPreDispatchFailure';
import {
  createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial,
  createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
} from './agentEvaluationCapabilityEffectAuthority';
import {
  validateAgentEvaluationPreDispatchFailureCoverage,
  validateAgentEvaluationReviewRasterScanCoverage,
} from './agentEvaluationEvidenceAuthenticityValidation';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const repositoryCommit = 'a'.repeat(40);
const startedAt = '2026-08-08T00:00:00.000Z';
const completedAt = '2026-08-08T00:00:01.000Z';
const backgroundProgram = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-background-job',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  ),
});

const createBootstrapProviderRequestAuthority = (
  invocationAuthority: ReturnType<
    typeof createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial
  >['authority'],
  inputText = 'Prepare one bounded background result.'
) =>
  createAgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority(
    backgroundProgram,
    {
      invocationAuthority,
      providerRequestProjection:
        createAgentNativeProviderCapabilityRuntimeRequestMaterial(
          backgroundProgram,
          {
            operation: 'background-submit',
            protocolFamily: 'openai-responses',
            providerConfigurationId: 'provider.openai',
            modelId: 'model.openai',
            modelLineageDigest: digest('model-lineage'),
            adapterDigest: digest('adapter'),
            callbackLocalBaseRequestBody: Object.freeze({
              model: 'model.openai',
              input: inputText,
            }),
            callbackLocalProviderStateHandle: null,
            providerResourceAuthority: null,
            providerResourceReadRequest: null,
            providerResourceReadReceipt: null,
            cacheKeyDigest: null,
            observedAt: startedAt,
          }
        ).projection,
      cacheWarmAuthority: null,
    }
  );

const nativeInvocationReceipt = (
  requestDigest = digest('request')
): AgentModelInvocationReceipt => {
  const usage = createAgentUsageVector([
    {
      unit: 'text-token-input',
      logicalAmount: '2',
      billableAmount: '2',
      confidence: 'reported',
      sourceDigest: digest('usage-source'),
    },
  ]);
  const base = {
    invocationId: 'invocation.1',
    taskId: 'task.1',
    runId: 'run.1',
    generation: 0,
    attempt: 1,
    provider: {
      providerConfigurationId: 'provider.openai',
      providerOperatorId: 'openai',
      endpointClass: 'first-party-hosted' as const,
      endpointProfileDigest: digest('endpoint-profile'),
      adapter: {
        adapterId: 'adapter.openai-responses',
        adapterVersion: '1',
        adapterDigest: digest('adapter'),
        protocolFamily: 'openai-responses' as const,
        transportSchemaDigest: digest('transport-schema'),
        eventNormalizationDigest: digest('event-normalization'),
      },
      dataPolicyDigest: digest('data-policy'),
    },
    model: {
      modelId: 'model.fixed',
      modelFamilyId: 'model-family.fixed',
      modelFamilyOwnerId: 'openai',
      immutableVersion: '2026-08-01',
      lineageDigest: digest('model-lineage'),
    },
    capabilityQualificationDigest: digest('qualification'),
    inferenceConfigurationDigest: digest('inference'),
    contextPackDigest: digest('context-pack'),
    requestDigest,
    responseDigest: digest('response'),
    outcome: 'completed' as const,
    usage,
    costStatus: 'priced' as const,
    cost: Object.freeze([
      {
        currency: 'USD',
        amount: '0.01',
        confidence: 'reported' as const,
        sourceDigest: digest('cost-source'),
      },
    ]),
    pricingSnapshotRef: 'pricing.1',
    startedAt,
    completedAt,
  };
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const bootstrapSourceInvocationMaterial = Object.freeze({
  blocks: Object.freeze([
    Object.freeze({
      kind: 'text' as const,
      blockId: 'block.bootstrap.1',
      role: 'user' as const,
      authority: 'user-provided' as const,
      instructionBoundary: 'data-only' as const,
      text: 'Prepare a sealed provider source.',
    }),
  ]),
  contextItems: Object.freeze([
    Object.freeze({
      contextItemId: 'context.bootstrap.1',
      sourceRef: 'context://bootstrap',
      authority: 'canonical-workspace' as const,
      instructionBoundary: 'data-only' as const,
      content: 'Public bootstrap context.',
      contentDigest: digest('bootstrap-context'),
    }),
  ]),
  tools: Object.freeze([
    Object.freeze({
      toolId: 'provider.background-job.poll',
      description: 'Poll one sealed provider background job.',
      effect: 'read-only' as const,
      inputSchema: Object.freeze({
        type: 'object',
        additionalProperties: false,
      }),
      definitionDigest: digest('background-job-poll-tool'),
    }),
  ]),
});

const successAuthority = (
  mode:
    'regular' | 'bootstrap-continuation' | 'capability-unavailable' = 'regular'
) => {
  const initialDecision =
    mode === 'regular'
      ? undefined
      : createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
          bindingKind: 'provider-job',
          turnIndex: 0,
          priorSourceTurnIndex: null,
          priorSourceObservationReceiptDigest: null,
          priorSourceDisposition: null,
          priorEffectResultSealReceiptDigest: null,
        });
  const bootstrapMaterial = initialDecision
    ? createAgentEvaluationCapabilityEffectBootstrapInvocationMaterial({
        invocation: bootstrapSourceInvocationMaterial,
        decision: initialDecision,
      })
    : undefined;
  const bootstrapProviderRequestAuthority = bootstrapMaterial
    ? createBootstrapProviderRequestAuthority(bootstrapMaterial.authority)
    : undefined;
  const requestDigest =
    bootstrapProviderRequestAuthority?.requestDigest ?? digest('request');
  const observationReceiptDigest = digest('bootstrap-observation');
  const postObservationDecision =
    mode === 'bootstrap-continuation'
      ? createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
          bindingKind: 'provider-job',
          turnIndex: 1,
          priorSourceTurnIndex: 0,
          priorSourceObservationReceiptDigest: observationReceiptDigest,
          priorSourceDisposition: 'active',
          priorEffectResultSealReceiptDigest: null,
        })
      : mode === 'capability-unavailable'
        ? createAgentEvaluationCapabilityEffectRequestRefIssuanceDecision({
            bindingKind: 'provider-job',
            turnIndex: 1,
            priorSourceTurnIndex: null,
            priorSourceObservationReceiptDigest: null,
            priorSourceDisposition: null,
            priorEffectResultSealReceiptDigest: null,
          })
        : undefined;
  const intent = createAgentEvaluationTransportDispatchIntent({
    intentId: 'dispatch-intent.1',
    planDigest: digest('plan'),
    repositoryCommit,
    attemptId: 'attempt.1',
    descriptorDigest: digest('descriptor'),
    turnIndex: 0,
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.openai',
    modelLineageDigest: digest('model-lineage'),
    inferenceConfigurationDigest: digest('inference'),
    invocationId: 'invocation.1',
    budgetReservationId: 'reservation.1',
    demandDigest: digest('demand'),
    requestDigest,
    endpointId: 'endpoint.openai.responses',
    endpointClass: 'first-party-hosted',
    requestBodyDigest: digest('request-body'),
    requestBytes: 128,
    createdAt: startedAt,
  });
  const transport = createAgentEvaluationTransportReceipt({
    receiptId: 'transport.1',
    protocolFamily: intent.protocolFamily,
    providerConfigurationId: intent.providerConfigurationId,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    requestDigest: intent.requestDigest,
    endpointId: intent.endpointId,
    endpointClass: intent.endpointClass,
    requestBodyDigest: intent.requestBodyDigest,
    requestBytes: intent.requestBytes,
    responseBytes: 256,
    httpStatus: 200,
    responseHeaderDigest: digest('response-headers'),
    responseBodyDigest: digest('response-body'),
    providerRequestId: 'provider-request.1',
    providerIdentityKind: 'response-id',
    providerResponseId: 'response.1',
    resolvedModelId: 'model.fixed',
    resolvedModelVersion: '2026-08-01',
    sseEventCount: 3,
    dispatchState: 'dispatched',
    outcome: 'completed',
    startedAt,
    completedAt,
  });
  const aad = createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: digest('namespace'),
    planDigest: intent.planDigest,
    repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: intent.turnIndex,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    responseBodyDigest: transport.responseBodyDigest!,
    normalizedEventSetDigest: digest('normalized-events'),
  });
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationProviderResultSpoolId(aad),
    algorithm: 'aes-256-gcm',
    keyId: 'key.g4-model-eval.result-spool.v1',
    keyVersion: 1,
    keyRefDigest: digest('key-ref'),
    encryptionProfileDigest: digest('encryption-profile'),
    nonceBase64Url: 'AAAAAAAAAAAAAAAA',
    authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
    ciphertextBase64Url: 'AQID',
    aadDigest: digestAgentEvaluationProviderResultSpoolAad(aad),
  });
  const spool = createAgentEvaluationProviderResultSpoolReceipt({
    aad,
    envelope,
    responseDigest: digest('response'),
    retentionClass: 'attempt-resume-only',
    retentionPolicyDigest: digest('retention-policy'),
    createdAt: completedAt,
    expiresAt: '2026-08-09T00:00:00.000Z',
  });
  const disposition =
    createAgentEvaluationProviderResultSpoolDispositionReceipt({
      spoolRef: spool.spoolRef,
      spoolReceiptDigest: spool.receiptDigest,
      planDigest: spool.planDigest,
      repositoryCommit,
      attemptId: spool.attemptId,
      descriptorDigest: spool.descriptorDigest,
      turnIndex: spool.turnIndex,
      invocationId: spool.invocationId,
      disposition: 'consumed-and-destroyed',
      retentionPolicyDigest: spool.retentionPolicyDigest,
      disposedAt: '2026-08-08T00:00:02.000Z',
    });
  const invocationReceipt = nativeInvocationReceipt(requestDigest);
  const transportAttempt = createAgentEvaluationTransportAttemptReceipt({
    sequence: 1,
    requestDigest: invocationReceipt.requestDigest,
    status: 'completed',
    retryable: false,
    invocationReceiptDigest: invocationReceipt.receiptDigest,
    responseDigest: invocationReceipt.responseDigest,
    startedAt,
    completedAt,
  });
  const transportRetryReceipt = createAgentEvaluationTransportRetryReceipt({
    policyDigest: digest('retry-policy'),
    maximumAttempts: 1,
    attempts: Object.freeze([transportAttempt]),
    exhausted: false,
  });
  const turnBase = {
    planDigest: intent.planDigest,
    repositoryCommit,
    attemptId: intent.attemptId,
    descriptorDigest: intent.descriptorDigest,
    turnIndex: 0,
    invocationId: intent.invocationId,
    status: 'completed',
    dispatchState: 'dispatched',
    dispatchIntentDigest: intent.intentDigest,
    transportReceiptDigest: transport.receiptDigest,
    transportRetryReceipt,
    invocationReceipt,
    providerRequestId: transport.providerRequestId!,
    resolvedModelId: transport.resolvedModelId,
    resolvedModelVersion: transport.resolvedModelVersion,
    resolvedModelIdentityDigest: digestAgentEvaluationResolvedModelIdentity({
      protocolFamily: intent.protocolFamily,
      transportReceiptDigest: transport.receiptDigest,
      frozenModelId: invocationReceipt.model.modelId,
      frozenImmutableModelVersion: invocationReceipt.model.immutableVersion,
      resolvedModelId: transport.resolvedModelId,
      resolvedModelVersion: transport.resolvedModelVersion,
    }),
    responseHeaderDigest: transport.responseHeaderDigest!,
    caseDefinitionDigest: digest('case-definition'),
    contextPackDigest: invocationReceipt.contextPackDigest,
    requestArtifactDigest: invocationReceipt.requestDigest,
    responseArtifactDigest: invocationReceipt.responseDigest!,
    providerResultSpoolReceiptDigest: spool.receiptDigest,
    usageSourceReceiptDigest: digest('usage-source-receipt'),
    costSourceReceiptDigest: digest('cost-source-receipt'),
  } as const;
  const turn =
    mode === 'regular'
      ? createAgentEvaluationInvocationTurnReceipt({
          ...turnBase,
          terminal: true,
          resultSubmissionReceiptDigest: digest('submission-receipt'),
          controlledRuntimeReceiptDigest: digest('runtime-receipt'),
        })
      : createAgentEvaluationInvocationTurnReceipt({
          ...turnBase,
          terminal: mode === 'bootstrap-continuation' ? false : true,
          zeroToolCallDisposition:
            mode === 'bootstrap-continuation'
              ? ('seal-observation-and-continue' as const)
              : ('grade-unavailable' as const),
          capabilityEffectBindingKind: 'provider-job' as const,
          postObservationRequestRefIssuanceDecision: postObservationDecision!,
          providerCapabilityObservationReceiptDigest: observationReceiptDigest,
          bootstrapInvocationAuthority: bootstrapMaterial!.authority,
          bootstrapProviderRequestAuthority: bootstrapProviderRequestAuthority!,
        } as never);
  const turnSet =
    mode === 'bootstrap-continuation'
      ? undefined
      : createAgentEvaluationInvocationTurnSetReceipt({
          planDigest: intent.planDigest,
          repositoryCommit,
          attemptId: intent.attemptId,
          descriptorDigest: intent.descriptorDigest,
          turns: Object.freeze([turn]),
        });
  return {
    intent,
    transport,
    aad,
    envelope,
    spool,
    disposition,
    turn,
    turnSet,
    initialDecision,
    postObservationDecision,
    bootstrapMaterial,
    bootstrapProviderRequestAuthority,
  };
};

describe('evaluation evidence authenticity facts', () => {
  it('constructs the durable dispatch, encrypted spool, turn, and turn-set chain', () => {
    const authority = successAuthority();
    expect(isAgentEvaluationTransportDispatchIntent(authority.intent)).toBe(
      true
    );
    expect(isAgentEvaluationTransportReceipt(authority.transport)).toBe(true);
    expect(
      isAgentEvaluationProviderResultSpoolEnvelope(authority.envelope)
    ).toBe(true);
    expect(isAgentEvaluationProviderResultSpoolReceipt(authority.spool)).toBe(
      true
    );
    expect(isAgentEvaluationInvocationTurnReceipt(authority.turn)).toBe(true);
    expect(isAgentEvaluationInvocationTurnSetReceipt(authority.turnSet)).toBe(
      true
    );
    expect(authority.turnSet!.dispatchedInvocationCount).toBe(1);
    expect(createAgentEvaluationProviderResultSpoolId(authority.aad)).toBe(
      createAgentEvaluationProviderResultSpoolId({
        namespaceDigest: authority.aad.namespaceDigest,
        planDigest: authority.aad.planDigest,
        repositoryCommit: authority.aad.repositoryCommit,
        attemptId: authority.aad.attemptId,
        descriptorDigest: authority.aad.descriptorDigest,
        turnIndex: authority.aad.turnIndex,
        invocationId: authority.aad.invocationId,
      })
    );
  });

  it('binds a real zero-tool bootstrap response to continue or grade unavailable without synthetic runtime receipts', () => {
    const continued = successAuthority('bootstrap-continuation');
    expect(isAgentEvaluationInvocationTurnReceipt(continued.turn)).toBe(true);
    expect(continued.turn).toMatchObject({
      terminal: false,
      zeroToolCallDisposition: 'seal-observation-and-continue',
      capabilityEffectBindingKind: 'provider-job',
    });
    expect('resultSubmissionReceiptDigest' in continued.turn).toBe(false);
    expect('controlledRuntimeReceiptDigest' in continued.turn).toBe(false);
    expect('continuationReceiptDigest' in continued.turn).toBe(false);
    expect(
      continued.turn.bootstrapProviderRequestAuthority?.requestDigest
    ).toBe(continued.intent.requestDigest);
    expect(
      continued.turn.postObservationRequestRefIssuanceDecision
    ).toMatchObject({
      turnIndex: 1,
      disposition: 'issue-request-ref',
      priorSourceTurnIndex: 0,
      priorSourceObservationReceiptDigest:
        continued.turn.providerCapabilityObservationReceiptDigest,
    });

    const unavailable = successAuthority('capability-unavailable');
    expect(isAgentEvaluationInvocationTurnReceipt(unavailable.turn)).toBe(true);
    expect(isAgentEvaluationInvocationTurnSetReceipt(unavailable.turnSet)).toBe(
      true
    );
    expect(unavailable.turn).toMatchObject({
      terminal: true,
      zeroToolCallDisposition: 'grade-unavailable',
    });
    expect('resultSubmissionReceiptDigest' in unavailable.turn).toBe(false);
    expect('controlledRuntimeReceiptDigest' in unavailable.turn).toBe(false);
    expect('continuationReceiptDigest' in unavailable.turn).toBe(false);
    expect(unavailable.turnSet).toMatchObject({
      terminalStatus: 'completed',
      terminalZeroToolCallDisposition: 'grade-unavailable',
      terminalCapabilityEffectBindingKind: 'provider-job',
      terminalPostObservationRequestRefIssuanceDecisionDigest:
        unavailable.turn.postObservationRequestRefIssuanceDecision
          ?.decisionDigest,
      terminalProviderCapabilityObservationReceiptDigest:
        unavailable.turn.providerCapabilityObservationReceiptDigest,
      terminalBootstrapInvocationAuthorityDigest:
        unavailable.turn.bootstrapInvocationAuthority?.authorityDigest,
      terminalBootstrapProviderRequestDigest:
        unavailable.turn.bootstrapProviderRequestAuthority?.requestDigest,
    });

    const {
      evidenceDigest: _unavailableEvidenceDigest,
      ...unavailableTurnBase
    } = unavailable.turn;
    const swappedObservationBase = Object.freeze({
      ...unavailableTurnBase,
      capabilityEffectBindingKind: 'provider-cache' as const,
    });
    expect(
      isAgentEvaluationInvocationTurnReceipt({
        ...swappedObservationBase,
        evidenceDigest: digestAgentCanonicalValue(swappedObservationBase),
      })
    ).toBe(false);

    const swappedProviderAuthority = createBootstrapProviderRequestAuthority(
      continued.turn.bootstrapInvocationAuthority!,
      'Prepare a swapped bounded background result.'
    );
    const { evidenceDigest: _continuedEvidenceDigest, ...continuedTurnBase } =
      continued.turn;
    const swappedRequestBase = Object.freeze({
      ...continuedTurnBase,
      bootstrapProviderRequestAuthority: swappedProviderAuthority,
    });
    expect(
      isAgentEvaluationInvocationTurnReceipt({
        ...swappedRequestBase,
        evidenceDigest: digestAgentCanonicalValue(swappedRequestBase),
      })
    ).toBe(false);
  });

  it('rejects dispatch, ciphertext, key rotation, and retention tampering', () => {
    const authority = successAuthority();
    expect(
      isAgentEvaluationTransportDispatchIntent({
        ...authority.intent,
        demandDigest: digest('different-demand'),
      })
    ).toBe(false);
    expect(
      isAgentEvaluationProviderResultSpoolEnvelope({
        ...authority.envelope,
        ciphertextBase64Url: 'AQIE',
      })
    ).toBe(false);
    expect(
      isAgentEvaluationProviderResultSpoolReceipt({
        ...authority.spool,
        keyVersion: 2,
      })
    ).toBe(false);
    expect(() =>
      createAgentEvaluationProviderResultSpoolDispositionReceipt({
        ...authority.disposition,
        disposition: 'retained-encrypted',
        retainedUntil: undefined,
        receiptDigest: undefined,
      } as never)
    ).toThrow(/disposition receipt/u);
  });

  it('represents a not-created terminal failure with zero dispatched invocations', () => {
    const failureReceipt = createAgentEvaluationPreDispatchFailureReceipt({
      failureReceiptId: 'pre-dispatch-failure.1',
      planDigest: digest('plan'),
      repositoryCommit,
      attemptId: 'attempt.preflight-failure',
      descriptorDigest: digest('descriptor'),
      turnIndex: 0,
      invocationId: 'invocation.preflight-failure',
      stage: 'protected-material-resolution',
      reasonCode: 'protected-material-leak-blocked',
      policyDigest: digest('protected-material-policy'),
      inputDigest: digest('protected-material-input'),
      findingDigest: digest('protected-material-finding'),
      occurredAt: startedAt,
    });
    const turn = createAgentEvaluationInvocationTurnReceipt({
      planDigest: failureReceipt.planDigest,
      repositoryCommit,
      attemptId: failureReceipt.attemptId,
      descriptorDigest: failureReceipt.descriptorDigest,
      turnIndex: 0,
      invocationId: failureReceipt.invocationId,
      status: 'blocked',
      dispatchState: 'not-created',
      terminal: true,
      caseDefinitionDigest: digest('case-definition'),
      contextPackDigest: digest('context-pack'),
      executionFailureAuthorityReceiptDigest: failureReceipt.receiptDigest,
    });
    const turnSet = createAgentEvaluationInvocationTurnSetReceipt({
      planDigest: turn.planDigest,
      repositoryCommit,
      attemptId: turn.attemptId,
      descriptorDigest: turn.descriptorDigest,
      turns: Object.freeze([turn]),
    });
    expect(turnSet.dispatchedInvocationCount).toBe(0);
    expect(turnSet.aggregateUsage.amounts).toEqual([]);
    expect(turnSet.aggregateCost).toEqual([]);
    const {
      format: _failureFormat,
      version: _failureVersion,
      receiptDigest: _failureDigest,
      ...failureBase
    } = failureReceipt;
    expect(
      validateAgentEvaluationPreDispatchFailureCoverage({
        preDispatchFailureReceipts: [failureReceipt],
        invocationTurnReceipts: [turn],
      })
    ).toEqual([]);
    expect(
      validateAgentEvaluationPreDispatchFailureCoverage({
        preDispatchFailureReceipts: [],
        invocationTurnReceipts: [turn],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/invocationTurnReceipts/0/executionFailureAuthorityReceiptDigest',
        }),
      ])
    );
    expect(
      validateAgentEvaluationPreDispatchFailureCoverage({
        preDispatchFailureReceipts: [
          failureReceipt,
          createAgentEvaluationPreDispatchFailureReceipt({
            ...failureBase,
            failureReceiptId: 'pre-dispatch-failure.orphan',
            attemptId: 'attempt.orphan',
            invocationId: 'invocation.orphan',
          }),
        ],
        invocationTurnReceipts: [turn],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/preDispatchFailureReceipts/1' }),
      ])
    );
  });

  it('binds every pre-dispatch reason class to its metric status', () => {
    const cases = [
      [
        'protected-material-unavailable',
        'protected-material-resolution',
        'infrastructure-error',
      ],
      [
        'protected-material-integrity-failed',
        'protected-material-resolution',
        'blocked',
      ],
      [
        'protected-material-policy-rejected',
        'protected-material-resolution',
        'blocked',
      ],
      [
        'protected-material-leak-blocked',
        'protected-material-resolution',
        'blocked',
      ],
      [
        'invocation-payload-invalid',
        'invocation-payload-encoding',
        'schema-failed',
      ],
      ['budget-admission-rejected', 'budget-admission', 'blocked'],
      [
        'verification-attempt-grant-unavailable',
        'dispatch-admission',
        'infrastructure-error',
      ],
      ['cancelled-before-dispatch', 'dispatch-admission', 'cancelled'],
    ] as const;
    for (const [index, [reasonCode, stage, status]] of cases.entries()) {
      const failureReceipt = createAgentEvaluationPreDispatchFailureReceipt({
        failureReceiptId: `pre-dispatch-failure.reason-${index}`,
        planDigest: digest('plan'),
        repositoryCommit,
        attemptId: `attempt.reason-${index}`,
        descriptorDigest: digest(`descriptor-${index}`),
        turnIndex: 0,
        invocationId: `invocation.reason-${index}`,
        stage,
        reasonCode,
        policyDigest: digest('pre-dispatch-policy'),
        inputDigest: digest(`pre-dispatch-input-${index}`),
        findingDigest: digest(`pre-dispatch-finding-${index}`),
        occurredAt: startedAt,
      });
      const turn = createAgentEvaluationInvocationTurnReceipt({
        planDigest: failureReceipt.planDigest,
        repositoryCommit,
        attemptId: failureReceipt.attemptId,
        descriptorDigest: failureReceipt.descriptorDigest,
        turnIndex: 0,
        invocationId: failureReceipt.invocationId,
        status,
        dispatchState: 'not-created',
        terminal: true,
        caseDefinitionDigest: digest('case-definition'),
        contextPackDigest: digest('context-pack'),
        executionFailureAuthorityReceiptDigest: failureReceipt.receiptDigest,
      });
      expect(
        validateAgentEvaluationPreDispatchFailureCoverage({
          preDispatchFailureReceipts: [failureReceipt],
          invocationTurnReceipts: [turn],
        })
      ).toEqual([]);
      expect(
        validateAgentEvaluationPreDispatchFailureCoverage({
          preDispatchFailureReceipts: [failureReceipt],
          invocationTurnReceipts: [
            { ...turn, status: 'provider-error' } as typeof turn,
          ],
        })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: '/invocationTurnReceipts/0/executionFailureAuthorityReceiptDigest',
          }),
        ])
      );
    }
  });

  it('requires one safe raster scan per review candidate and rejects blocked or orphan scans', () => {
    const createScan = (
      attemptId: string,
      verdict: 'safe' | 'blocked' = 'safe'
    ) =>
      createAgentEvaluationReviewRasterScanReceipt({
        scanReceiptId: `review-raster-scan.${attemptId}`,
        planDigest: digest('plan'),
        repositoryCommit,
        attemptId,
        descriptorDigest: digest(`descriptor-${attemptId}`),
        projectionAuthorityDigest: digest(`projection-${attemptId}`),
        mediaType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 1,
        policyDigest: digest('review-raster-scan-policy'),
        bytesDigest: digest(`review-raster-bytes-${attemptId}`),
        decodedPixelDigest: digest(`decoded-pixels-${attemptId}`),
        metadataProfileDigest: digest('metadata-profile'),
        canarySetDigest: digest('canary-set'),
        fingerprintSetDigest: digest('fingerprint-set'),
        findingDigests:
          verdict === 'safe'
            ? Object.freeze([])
            : Object.freeze([digest('finding')]),
        verdict,
        scannedAt: completedAt,
      });
    const scan = createScan('attempt.review');
    const candidate = Object.freeze({
      candidateId: 'candidate.review',
      attemptId: scan.attemptId,
      planDigest: scan.planDigest,
      repositoryCommit,
      descriptorDigest: scan.descriptorDigest,
      responseDigest: digest('review-response'),
      executionReceiptDigest: digest('review-execution'),
      graderArtifactDigest: digest('review-grader-artifact'),
      projectionAuthorityDigest: scan.projectionAuthorityDigest,
      mediaType: scan.mediaType,
      width: scan.width,
      height: scan.height,
      bytesDigest: scan.bytesDigest,
      byteLength: scan.byteLength,
      publicArtifactScanDigest: scan.receiptDigest,
      generatedAt: completedAt,
      candidateDigest: digest('review-candidate'),
    });
    expect(
      validateAgentEvaluationReviewRasterScanCoverage({
        reviewCandidateRefs: [candidate],
        reviewRasterScanReceipts: [scan],
      })
    ).toEqual([]);
    expect(
      validateAgentEvaluationReviewRasterScanCoverage({
        reviewCandidateRefs: [
          {
            ...candidate,
            publicArtifactScanDigest: createScan('attempt.review', 'blocked')
              .receiptDigest,
          },
        ],
        reviewRasterScanReceipts: [createScan('attempt.review', 'blocked')],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '/reviewCandidateRefs/0/publicArtifactScanDigest',
        }),
      ])
    );
    expect(
      validateAgentEvaluationReviewRasterScanCoverage({
        reviewCandidateRefs: [candidate],
        reviewRasterScanReceipts: [scan, createScan('attempt.orphan')],
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/reviewRasterScanReceipts/1' }),
      ])
    );
  });

  it('rejects non-contiguous turn indexes and retry sequence zero', () => {
    const authority = successAuthority();
    const retryReceipt = authority.turn.transportRetryReceipt;
    if (!retryReceipt) throw new Error('Fixture retry receipt is missing.');
    expect(
      isAgentEvaluationInvocationTurnReceipt({
        ...authority.turn,
        transportRetryReceipt: {
          ...retryReceipt,
          attempts: [
            {
              ...retryReceipt.attempts[0]!,
              sequence: 0,
            },
          ],
        },
      })
    ).toBe(false);
    expect(() =>
      createAgentEvaluationInvocationTurnSetReceipt({
        planDigest: authority.turn.planDigest,
        repositoryCommit,
        attemptId: authority.turn.attemptId,
        descriptorDigest: authority.turn.descriptorDigest,
        turns: Object.freeze([{ ...authority.turn, turnIndex: 1 }]),
      })
    ).toThrow(/turn-set input/u);
  });
});
