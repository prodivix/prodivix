import {
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentProviderRuntimeEvent,
  digestAgentCanonicalValue,
  type AgentModelEvaluationAttemptDescriptor,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RECEIPT_FORMAT,
  AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT,
  createAgentEvaluationCapabilityEffectCurrentTurnEventRequest,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryRequest,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityRequest,
  createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient,
  type AgentEvaluationCapabilityEffectCurrentTurnEventReceipt,
} from './capabilityEffectInputAuthorityClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const namespaceId = 'evaluation.capability-effect.input-authority';
const repositoryCommit = 'a'.repeat(40);
const planDigest = digestAgentCanonicalValue({ plan: 'capability-effect' });
const serviceToken = 'capability-effect-input-authority-token-012345';
const issuedAt = '2026-08-09T07:00:00.000Z';
const expiresAt = '2026-08-09T07:02:05.000Z';
const forbiddenCanary = 'capability-effect-input-forbidden-canary';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: repositoryCommit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: serviceToken,
});

const capabilityDescriptorDigest = digestAgentCanonicalValue({
  capability: 'provider.hosted-retrieval',
});
const targetDigest = digestAgentCanonicalValue({ target: 'openai' });
const samplingBase = Object.freeze({
  planDigest,
  caseId: 'evaluation.case.hosted-retrieval',
  capabilityDescriptorDigest,
  targetId: 'evaluation.target.openai',
  targetDigest,
  riskClass: 'ordinary' as const,
  repetitionIndex: 0,
});
const samplingIdentityDigest = digestAgentCanonicalValue(samplingBase);
const descriptorBase = Object.freeze({
  attemptId: `evaluation-attempt:${samplingIdentityDigest.slice(7)}`,
  shardId: 'evaluation.shard.0',
  ...samplingBase,
  samplingIdentityDigest,
});
const descriptor = Object.freeze({
  ...descriptorBase,
  descriptorDigest: digestAgentCanonicalValue(descriptorBase),
}) as AgentModelEvaluationAttemptDescriptor;

const invocationId = 'evaluation.invocation.hosted-retrieval.0';
const targetRef = 'evaluation.target.release-retrieval';
const requestRefRequest =
  createAgentEvaluationCapabilityEffectRequestRefAuthorityRequest({
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    descriptor,
    turnIndex: 0,
    invocationId,
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    toolId: 'provider.retrieval.search',
    targetRef,
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.configuration.openai',
    modelLineageDigest: digestAgentCanonicalValue({ model: 'lineage' }),
    adapterDigest: digestAgentCanonicalValue({ adapter: 'openai' }),
    runtimeFactSourceAuthorityDigest: digestAgentCanonicalValue({
      source: 'authority',
    }),
    registrationReceiptDigest: digestAgentCanonicalValue({
      registration: 'receipt',
    }),
    issuedAt,
    expiresAt,
  });

const requestRefReceipt =
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    toolId: 'provider.retrieval.search',
    targetRef,
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.configuration.openai',
    modelLineageDigest: requestRefRequest.modelLineageDigest,
    adapterDigest: requestRefRequest.adapterDigest,
    runtimeFactSourceAuthorityDigest:
      requestRefRequest.runtimeFactSourceAuthorityDigest,
    registrationReceiptDigest: requestRefRequest.registrationReceiptDigest,
    issuedAt,
    expiresAt,
  });

const argumentsDigest = digestAgentCanonicalValue({
  requestRef: requestRefReceipt.requestRef,
  targetRef,
});
const providerToolCallId = 'provider.tool-call.hosted-retrieval.0';
const runtimeEvent = createAgentProviderRuntimeEvent({
  eventId: 'provider.event.hosted-retrieval.0',
  invocationId,
  sequence: 0,
  type: 'tool-call',
  payload: {
    itemId: providerToolCallId,
    name: 'provider.retrieval.search',
    arguments: {
      requestRef: requestRefReceipt.requestRef,
      targetRef,
    },
    argumentsDigest,
  },
  occurredAt: '2026-08-09T07:00:01.000Z',
});
const currentTurnRequest =
  createAgentEvaluationCapabilityEffectCurrentTurnEventRequest({
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    turnIndex: 0,
    invocationId,
    requestRefAuthorityReceiptDigest: requestRefReceipt.receiptDigest,
    requestRef: requestRefReceipt.requestRef,
    targetRef,
    providerToolCallId,
    toolId: 'provider.retrieval.search',
    argumentsDigest,
    selectedEventDigest: runtimeEvent.durableEvent.eventDigest,
    normalizedEvents: Object.freeze([runtimeEvent]),
    recordedAt: '2026-08-09T07:00:02.000Z',
  });

const createCurrentTurnReceipt = (
  request = currentTurnRequest
): AgentEvaluationCapabilityEffectCurrentTurnEventReceipt => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RECEIPT_FORMAT,
    version: 1 as const,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    turnIndex: request.turnIndex,
    invocationId: request.invocationId,
    requestRefAuthorityReceiptDigest: request.requestRefAuthorityReceiptDigest,
    requestRef: request.requestRef,
    targetRef: request.targetRef,
    providerRequestDigest: digestAgentCanonicalValue({ provider: 'request' }),
    responseDigest: digestAgentCanonicalValue({ provider: 'response' }),
    dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 'intent' }),
    transportReceiptDigest: digestAgentCanonicalValue({ transport: 'receipt' }),
    resultSpoolReceiptDigest: digestAgentCanonicalValue({ spool: 'receipt' }),
    normalizedEventSetDigest: request.normalizedEventSetDigest,
    selectedEventDigest: request.selectedEventDigest,
    providerToolCallId: request.providerToolCallId,
    toolId: request.toolId,
    argumentsDigest: request.argumentsDigest,
    recordedAt: request.recordedAt,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const currentTurnReceipt = createCurrentTurnReceipt();
const registryRequest =
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryRequest({
    namespaceId,
    planDigest,
    repositoryCommit,
    requestRefAuthorityReceiptDigest: requestRefReceipt.receiptDigest,
    requestRef: requestRefReceipt.requestRef,
    targetRef,
    requestedAt: '2026-08-09T07:00:03.000Z',
  });
const registryReceipt =
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    requestRef: requestRefReceipt.requestRef,
    targetRef,
    requestRefAuthority: requestRefReceipt,
    requestRefAuthorityReceiptDigest: requestRefReceipt.receiptDigest,
    sourceAttemptId: descriptor.attemptId,
    sourceTurnIndex: 0,
    sourceInvocationId: invocationId,
    sourceProviderRequestDigest: currentTurnReceipt.providerRequestDigest,
    sourceResponseDigest: currentTurnReceipt.responseDigest,
    sourceDispatchIntentDigest: currentTurnReceipt.dispatchIntentDigest,
    sourceTransportReceiptDigest: currentTurnReceipt.transportReceiptDigest,
    sourceResultSpoolReceiptDigest: currentTurnReceipt.resultSpoolReceiptDigest,
    sourceNormalizedEventSetDigest: currentTurnReceipt.normalizedEventSetDigest,
    sourceObservationReceiptDigest: null,
    sourceFactKind: 'provider-event',
    sourceProviderEventType: 'tool-call',
    sourceProviderToolCallId: providerToolCallId,
    sourceToolId: 'provider.retrieval.search',
    sourceArgumentsDigest: argumentsDigest,
    sourceHandleDigest: runtimeEvent.durableEvent.eventDigest,
    stateVaultSealRequest: null,
    stateVaultSealReceipt: null,
    protocolFamily: 'openai-responses',
    providerConfigurationId: requestRefReceipt.providerConfigurationId,
    modelLineageDigest: requestRefReceipt.modelLineageDigest,
    adapterDigest: requestRefReceipt.adapterDigest,
  });

const wrapper = (format: string, requestDigest: string, receipt: unknown) =>
  new Response(
    canonicalJsonText({
      format,
      version: 1,
      requestDigest,
      receipt,
      replayed: false,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );

describe('capability effect input authority client', () => {
  it('issues, seals, and resolves the exact same-turn retrieval authority', async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as Record<
          string,
          unknown
        >;
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
          request.requestDigest
        );
        if (String(url).endsWith('capability-effect-request-ref-authorities')) {
          return wrapper(
            AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT,
            String(request.requestDigest),
            requestRefReceipt
          );
        }
        if (String(url).endsWith('capability-effect-current-turn-events')) {
          return wrapper(
            AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT,
            String(request.requestDigest),
            currentTurnReceipt
          );
        }
        return wrapper(
          AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
          String(request.requestDigest),
          registryReceipt
        );
      }
    );
    const client =
      createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient({
        namespaceId,
        planDigest,
        repositoryCommit,
        environment,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        fetch: fetcher as typeof fetch,
      });

    await expect(client.issueRequestRef(requestRefRequest)).resolves.toEqual(
      requestRefReceipt
    );
    await expect(
      client.sealCurrentTurnEvent(currentTurnRequest)
    ).resolves.toEqual(currentTurnReceipt);
    await expect(
      client.resolveInputAuthority(registryRequest)
    ).resolves.toEqual(registryReceipt);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects a recomputed request-ref receipt with a swapped business target', async () => {
    const swapped =
      createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
        ...Object.fromEntries(
          Object.entries(requestRefReceipt).filter(
            ([key]) =>
              ![
                'format',
                'version',
                'authorityDigest',
                'requestRef',
                'receiptDigest',
              ].includes(key)
          )
        ),
        targetRef: 'evaluation.target.swapped',
      } as Parameters<
        typeof createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt
      >[0]);
    const fetcher = vi.fn(async () =>
      wrapper(
        AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT,
        requestRefRequest.requestDigest,
        swapped
      )
    );
    const client =
      createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient({
        namespaceId,
        planDigest,
        repositoryCommit,
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        fetch: fetcher as typeof fetch,
      });

    await expect(
      client.issueRequestRef(requestRefRequest)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('rejects a recomputed current-event identity swap and a registry target swap', async () => {
    const swappedCurrentBase = {
      ...currentTurnReceipt,
      selectedEventDigest: digestAgentCanonicalValue({
        event: 'swapped',
      }),
    };
    const { receiptDigest: _receiptDigest, ...currentBase } =
      swappedCurrentBase;
    const swappedCurrent = Object.freeze({
      ...currentBase,
      receiptDigest: digestAgentCanonicalValue(currentBase),
    });
    const swappedTargetRef = 'evaluation.target.swapped';
    const swappedRequestRefAuthority =
      createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
        namespaceId,
        planDigest,
        repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId,
        bindingKind: 'hosted-retrieval-query',
        capabilityId: 'provider.hosted-retrieval',
        toolId: 'provider.retrieval.search',
        targetRef: swappedTargetRef,
        protocolFamily: 'openai-responses',
        providerConfigurationId: requestRefReceipt.providerConfigurationId,
        modelLineageDigest: requestRefReceipt.modelLineageDigest,
        adapterDigest: requestRefReceipt.adapterDigest,
        runtimeFactSourceAuthorityDigest:
          requestRefReceipt.runtimeFactSourceAuthorityDigest,
        registrationReceiptDigest: requestRefReceipt.registrationReceiptDigest,
        issuedAt,
        expiresAt,
      });
    const swappedRegistry =
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind: 'hosted-retrieval-query',
        capabilityId: 'provider.hosted-retrieval',
        requestRef: swappedRequestRefAuthority.requestRef,
        targetRef: swappedTargetRef,
        requestRefAuthority: swappedRequestRefAuthority,
        requestRefAuthorityReceiptDigest:
          swappedRequestRefAuthority.receiptDigest,
        sourceAttemptId: descriptor.attemptId,
        sourceTurnIndex: 0,
        sourceInvocationId: invocationId,
        sourceProviderRequestDigest: currentTurnReceipt.providerRequestDigest,
        sourceResponseDigest: currentTurnReceipt.responseDigest,
        sourceDispatchIntentDigest: currentTurnReceipt.dispatchIntentDigest,
        sourceTransportReceiptDigest: currentTurnReceipt.transportReceiptDigest,
        sourceResultSpoolReceiptDigest:
          currentTurnReceipt.resultSpoolReceiptDigest,
        sourceNormalizedEventSetDigest:
          currentTurnReceipt.normalizedEventSetDigest,
        sourceObservationReceiptDigest: null,
        sourceFactKind: 'provider-event',
        sourceProviderEventType: 'tool-call',
        sourceProviderToolCallId: providerToolCallId,
        sourceToolId: 'provider.retrieval.search',
        sourceArgumentsDigest: digestAgentCanonicalValue({
          requestRef: swappedRequestRefAuthority.requestRef,
          targetRef: swappedTargetRef,
        }),
        sourceHandleDigest: runtimeEvent.durableEvent.eventDigest,
        stateVaultSealRequest: null,
        stateVaultSealReceipt: null,
        protocolFamily: 'openai-responses',
        providerConfigurationId: requestRefReceipt.providerConfigurationId,
        modelLineageDigest: requestRefReceipt.modelLineageDigest,
        adapterDigest: requestRefReceipt.adapterDigest,
      });
    let response = swappedCurrent as unknown;
    const fetcher = vi.fn(async (_url, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return wrapper(
        response === swappedCurrent
          ? AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT
          : AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
        String(request.requestDigest),
        response
      );
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient({
        namespaceId,
        planDigest,
        repositoryCommit,
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        fetch: fetcher as typeof fetch,
      });

    await expect(
      client.sealCurrentTurnEvent(currentTurnRequest)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    response = swappedRegistry;
    await expect(
      client.resolveInputAuthority(registryRequest)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('blocks forbidden canaries before transport', async () => {
    const fetcher = vi.fn();
    const client =
      createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient({
        namespaceId,
        planDigest,
        repositoryCommit,
        environment,
        forbiddenCanaries: () => Object.freeze([targetRef]),
        fetch: fetcher as typeof fetch,
      });

    await expect(
      client.issueRequestRef(requestRefRequest)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a fully recomputed current-turn event with a different tool name', () => {
    const swappedEvent = createAgentProviderRuntimeEvent({
      eventId: 'provider.event.hosted-retrieval.swapped-tool',
      invocationId,
      sequence: 0,
      type: 'tool-call',
      payload: {
        itemId: providerToolCallId,
        name: 'provider.background-job.poll',
        arguments: {
          requestRef: requestRefReceipt.requestRef,
          targetRef,
        },
        argumentsDigest,
      },
      occurredAt: '2026-08-09T07:00:01.000Z',
    });

    expect(() =>
      createAgentEvaluationCapabilityEffectCurrentTurnEventRequest({
        namespaceId,
        planDigest,
        repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId,
        requestRefAuthorityReceiptDigest: requestRefReceipt.receiptDigest,
        requestRef: requestRefReceipt.requestRef,
        targetRef,
        providerToolCallId,
        toolId: 'provider.retrieval.search',
        argumentsDigest,
        selectedEventDigest: swappedEvent.durableEvent.eventDigest,
        normalizedEvents: Object.freeze([swappedEvent]),
        recordedAt: '2026-08-09T07:00:02.000Z',
      })
    ).toThrow(
      expect.objectContaining({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
      })
    );
  });
});
