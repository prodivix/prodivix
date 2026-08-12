import {
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityEffectToolArguments,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  getG4V8PublicEvaluationCaseMaterials,
  planAgentModelEvaluationAttempts,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import { createV8EvaluationPlan } from '../../../packages/ai/src/__tests__/agentV8Fixtures';
import {
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RECEIPT_FORMAT,
  createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient,
} from './attemptAuthorityResultIngressClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  createAgentEvaluationTestStateVaultConsumedLifecycle,
  createAgentEvaluationTestStateVaultSeal,
} from './stateVault.fixture';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';

const now = '2026-08-09T04:00:00.000Z';
const namespaceId = 'evaluation.attempt-authority-result-ingress';
const repositoryCommit = 'a'.repeat(40);
const serviceToken = 'attempt-authority-result-ingress-token-012345';
const ownerImplementationDigest = digestAgentCanonicalValue({
  implementation: 'attempt-authority-result-ingress-owner',
});
const plan = createV8EvaluationPlan();

const sharedEffectFixture = (() => {
  const materials = getG4V8PublicEvaluationCaseMaterials();
  const concreteCase = plan.concreteCases.find(
    ({ caseId, capabilityDescriptor }) =>
      capabilityDescriptor.expectedReceiptKinds.includes(
        'background-job-receipt'
      ) && materials.some((candidate) => candidate.caseId === caseId)
  );
  const material = materials.find(
    ({ caseId }) => caseId === concreteCase?.caseId
  );
  const descriptor = planAgentModelEvaluationAttempts(plan).find(
    ({ caseId, capabilityDescriptorDigest, targetId }) =>
      caseId === concreteCase?.caseId &&
      capabilityDescriptorDigest ===
        concreteCase?.capabilityDescriptor.descriptorDigest &&
      plan.capabilityQualificationTargets.some(
        (candidate) =>
          candidate.targetId === targetId &&
          candidate.protocolFamily === 'openai-responses'
      )
  );
  const target = plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === descriptor?.targetId
  );
  const runtimeFactSourceAuthority =
    target?.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
  if (
    !target ||
    !concreteCase ||
    !material ||
    !descriptor ||
    !runtimeFactSourceAuthority
  ) {
    throw new TypeError(
      `Shared-effect result ingress fixture is missing: ${canonicalJsonText({
        concreteCase: Boolean(concreteCase),
        descriptor: Boolean(descriptor),
        material: Boolean(material),
        runtimeFactSourceAuthority: Boolean(runtimeFactSourceAuthority),
        target: Boolean(target),
      })}`
    );
  }
  const protocolFamily = runtimeFactSourceAuthority.protocolFamily;
  if (
    protocolFamily !== 'anthropic-messages' &&
    protocolFamily !== 'gemini-interactions' &&
    protocolFamily !== 'openai-responses'
  ) {
    throw new TypeError('Shared-effect result ingress protocol is invalid.');
  }
  const toolId = concreteCase.capabilityDescriptor.expectedToolIds[0]!;
  const turnIndex = 1;
  const invocationId = 'invocation.attempt-authority-result-ingress';
  const targetRef = 'target.attempt-authority-result-ingress';
  const requestRefAuthority =
    createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
      namespaceId,
      planDigest: plan.planDigest,
      repositoryCommit,
      attemptId: descriptor.attemptId,
      descriptorDigest: descriptor.descriptorDigest,
      turnIndex,
      invocationId,
      bindingKind: 'provider-job',
      capabilityId: 'provider.background-job',
      toolId,
      targetRef,
      protocolFamily,
      providerConfigurationId:
        runtimeFactSourceAuthority.providerConfigurationId,
      modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
      adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      runtimeFactSourceAuthorityDigest:
        runtimeFactSourceAuthority.authorityDigest,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      issuedAt: now,
      expiresAt: new Date(Date.parse(now) + 125_000).toISOString(),
    });
  const argumentsValue = Object.freeze({
    requestRef: requestRefAuthority.requestRef,
    targetRef,
  });
  const providerRequestDigest = digestAgentCanonicalValue({
    requestRef: requestRefAuthority.requestRef,
    providerRequest: 'closed',
  });
  const sourceProviderRequestDigest =
    digestAgentCanonicalValue('source-request');
  const sourceResponseDigest = digestAgentCanonicalValue('source-response');
  const stateVault = createAgentEvaluationTestStateVaultSeal({
    purpose: 'background-job-state',
    attemptId: descriptor.attemptId,
    protocolFamily: 'openai-responses',
    invocationId: 'invocation.attempt-authority-result-source',
    requestDigest: sourceProviderRequestDigest,
    responseDigest: sourceResponseDigest,
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    capabilityProfileDigest: runtimeFactSourceAuthority.capabilityProfileDigest,
    taskId: 'task.attempt-authority-result-source',
    runId: 'run.attempt-authority-result-source',
    generation: 1,
    observedAt: now,
    expiresAt: new Date(Date.parse(now) + 125_000).toISOString(),
  });
  const inputAuthorityBinding =
    createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
      createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
        bindingKind: 'provider-job',
        capabilityId: 'provider.background-job',
        requestRef: requestRefAuthority.requestRef,
        targetRef,
        requestRefAuthority,
        requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
        sourceAttemptId: descriptor.attemptId,
        sourceTurnIndex: 0,
        sourceInvocationId: 'invocation.attempt-authority-result-source',
        sourceProviderRequestDigest,
        sourceResponseDigest,
        sourceDispatchIntentDigest:
          digestAgentCanonicalValue('source-dispatch'),
        sourceTransportReceiptDigest:
          digestAgentCanonicalValue('source-transport'),
        sourceResultSpoolReceiptDigest:
          digestAgentCanonicalValue('source-spool'),
        sourceNormalizedEventSetDigest:
          digestAgentCanonicalValue('source-normalized'),
        sourceObservationReceiptDigest:
          digestAgentCanonicalValue('source-observation'),
        sourceFactKind: 'provider-job-receipt',
        sourceProviderEventType: null,
        sourceProviderToolCallId: null,
        sourceToolId: null,
        sourceArgumentsDigest: null,
        sourceHandleDigest: stateVault.sealRequest.providerStateReferenceDigest,
        stateVaultSealRequest: stateVault.sealRequest,
        stateVaultSealReceipt: stateVault.sealReceipt,
        protocolFamily,
        providerConfigurationId:
          runtimeFactSourceAuthority.providerConfigurationId,
        modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
        adapterDigest: runtimeFactSourceAuthority.adapterDigest,
      })
    );
  const intentInput = Object.freeze({
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    turnIndex,
    invocationId,
    toolId,
    toolCallId: 'tool-call.attempt-authority-result-ingress',
    providerToolCallId: 'provider-tool-call.attempt-authority-result-ingress',
    providerRequestDigest,
    argumentsDigest:
      digestAgentEvaluationCapabilityEffectToolArguments(argumentsValue),
    requestedAt: now,
    inputAuthorityBinding,
    runtimeFactSourceAuthority,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
  });
  const preEffectIntent = createAgentEvaluationCapabilityPreEffectIntent({
    ...intentInput,
    ...createAgentEvaluationCapabilityEffectOwnerRequestIdentity(intentInput),
  });
  const result = Object.freeze({
    status: 'unavailable',
    reason: 'bounded-test-owner-unavailable',
  });
  const resultDigest = digestAgentCanonicalValue(result);
  const stateVaultLifecycle =
    createAgentEvaluationTestStateVaultConsumedLifecycle(stateVault, {
      consumerAttemptId: descriptor.attemptId,
      consumerInvocationId: invocationId,
      requestedAt: now,
    });
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(preEffectIntent, {
      intentDigest: preEffectIntent.intentDigest,
      ownerRequestId: preEffectIntent.ownerRequestId,
      ownerRequestDigest: preEffectIntent.ownerRequestDigest,
      runtimeFactSourceAuthority,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      effectStatus: 'unavailable',
      businessResultDigest: resultDigest,
      providerRuntimeJournalResultRecordDigest: digestAgentCanonicalValue(
        'effect-journal-result'
      ),
      providerRuntimeResultSealReceiptDigest: digestAgentCanonicalValue(
        'effect-journal-result-seal'
      ),
      sourceFactKind: null,
      sourceFactDigest: null,
      stageDigest: digestAgentCanonicalValue('effect-stage'),
      dispatchAckDigest: digestAgentCanonicalValue('effect-ack'),
      transportReceiptDigest: digestAgentCanonicalValue('effect-transport'),
      resultSpoolReceiptDigest: digestAgentCanonicalValue('effect-spool'),
      normalizedEventSetDigest: digestAgentCanonicalValue('effect-normalized'),
      ...stateVaultLifecycle,
      specificReceiptDigests: Object.freeze([]),
      sealedAt: now,
    });
  const response = Object.freeze({
    executionAuthorityKind: 'shared-effect' as const,
    outcome: 'unsupported' as const,
    result,
    resultDigest,
    continuationReceiptDigest: digestAgentCanonicalValue({
      requestDigest: providerRequestDigest,
      resultDigest,
      continuation: 'unavailable',
    }),
    effectSourceReceipt,
    effectSourceFact: null,
    specificReceipts: Object.freeze([]) as readonly [],
  });
  const requestDigest = digestAgentCanonicalValue({
    serviceKind: 'provider-capability',
    operation: 'tool.execute',
    payloadDigest: digestAgentCanonicalValue({
      executionAuthorityKind: 'shared-effect',
      preEffectIntent,
    }),
  });
  const requestBase = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'provider-capability' as const,
    mode: 'execute' as const,
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit,
    operation: 'tool.execute',
    routeBinding: 'capability-runtime/execute-tool',
    requestDigest,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    shardLeaseOwnerId: 'worker.attempt-authority-result-ingress',
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: digestAgentCanonicalValue(
      'verification-grant-set'
    ),
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet([]),
    ownerImplementationDigest,
    claimGeneration: 1,
    payload: Object.freeze({
      executionAuthorityKind: 'shared-effect' as const,
      preEffectIntent,
    }),
  });
  const request = Object.freeze({
    ...requestBase,
    stageDigest: createAgentEvaluationAttemptAuthorityDispatchStageDigest(
      requestBase,
      ownerImplementationDigest
    ),
  }) satisfies AgentEvaluationOwnerAuthorityRequest;
  return Object.freeze({ request, response, targetRef });
})();

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: repositoryCommit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: serviceToken,
});

const canonicalSuccess = (
  ingress: Record<string, unknown>,
  replayed: boolean
) => {
  const receiptBase = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RECEIPT_FORMAT,
    version: 1,
    requestDigest: ingress.requestDigest,
    ingressDigest: ingress.ingressDigest,
    responseDigest: ingress.responseDigest,
    dispatchAckDigest: ingress.dispatchAckDigest,
  });
  return Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RESPONSE_FORMAT,
    version: 1,
    requestDigest: ingress.requestDigest,
    ingressDigest: ingress.ingressDigest,
    responseDigest: ingress.responseDigest,
    dispatchAckDigest: ingress.dispatchAckDigest,
    resultIngressReceiptDigest: digestAgentCanonicalValue(receiptBase),
    replayed,
  });
};

describe('attempt authority result ingress client', () => {
  it('retries the exact shared-effect result bytes and validates the sealed ACK', async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = String(init?.body);
      bodies.push(body);
      const ingress = JSON.parse(body) as Record<string, unknown>;
      const headers = new Headers(init?.headers);
      expect(String(url)).toContain('/attempt-authority-results');
      expect(headers.get('Authorization')).toBe(`Bearer ${serviceToken}`);
      expect(headers.get('Idempotency-Key')).toBe(ingress.requestDigest);
      if (bodies.length === 1) {
        return new Response(canonicalJsonText({ retry: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(canonicalJsonText(canonicalSuccess(ingress, true)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const client =
      createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient({
        environment,
        fetch: fetcher as typeof fetch,
        forbiddenCanaries: () => Object.freeze(['forbidden-canary']),
      });

    const result = await client.seal({
      request: sharedEffectFixture.request,
      response: sharedEffectFixture.response,
      ownerImplementationDigest,
    });

    expect(result.replayed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it('rejects a recomputed response with a swapped result receipt', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const ingress = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        canonicalJsonText({
          ...canonicalSuccess(ingress, false),
          resultIngressReceiptDigest: digestAgentCanonicalValue('swapped'),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    const client =
      createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient({
        environment,
        fetch: fetcher as typeof fetch,
        forbiddenCanaries: () => Object.freeze(['forbidden-canary']),
      });

    await expect(
      client.seal({
        request: sharedEffectFixture.request,
        response: sharedEffectFixture.response,
        ownerImplementationDigest,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('rejects a protected canary before opening transport', async () => {
    const fetcher = vi.fn();
    const client =
      createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient({
        environment,
        fetch: fetcher as typeof fetch,
        forbiddenCanaries: () => Object.freeze([sharedEffectFixture.targetRef]),
      });

    await expect(
      client.seal({
        request: sharedEffectFixture.request,
        response: sharedEffectFixture.response,
        ownerImplementationDigest,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
