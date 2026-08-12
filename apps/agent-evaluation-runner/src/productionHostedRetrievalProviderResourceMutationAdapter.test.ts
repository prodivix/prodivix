import {
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest,
  createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  digestAgentCanonicalValue,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation,
  executeAgentEvaluationCapabilityProbeProviderResourceMutation,
  executeAgentEvaluationCapabilityProbeProviderResourceReconciliation,
  executeAgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt,
  projectAgentEvaluationHostedRetrievalProviderResourceMutation,
  projectAgentEvaluationHostedRetrievalProviderResourceReconciliation,
  type AgentEvaluationHostedRetrievalProviderResourceMutation,
} from './productionHostedRetrievalProviderResourceMutationAdapter';
import { createAgentEvaluationProviderResourceTransport } from './productionProviderResourceTransport';

const NOW = '2026-08-12T01:00:00.000Z' as Instant;
const EXPIRES = '2026-08-12T01:02:00.000Z' as Instant;
const COMMIT = 'a'.repeat(40);
const OPENAI_SECRET = 'openai-adapter-secret-123456789';
const GEMINI_SECRET = 'gemini-adapter-secret-123456789';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ test: 'provider-mutation-adapter', label });

const response = (
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
  status = 200
): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers,
  });

const environment = (name: string): string | undefined => {
  if (name === 'PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY') {
    return OPENAI_SECRET;
  }
  if (name === 'PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY') {
    return GEMINI_SECRET;
  }
  return undefined;
};

const resolveHost = async (): Promise<readonly string[]> =>
  Object.freeze(['8.8.8.8']);

const openAiSecretUse = (useId: string) =>
  Object.freeze({
    protocolFamily: 'openai-responses' as const,
    providerConfigurationId:
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses']
        .providerConfigurationId,
    secretRef:
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses'].secretRef,
    purpose: 'hosted-retrieval-resource-lifecycle' as const,
    runtimeZone: 'server' as const,
    useId,
  });

const geminiSecretUse = (useId: string) =>
  Object.freeze({
    protocolFamily: 'gemini-interactions' as const,
    providerConfigurationId:
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions']
        .providerConfigurationId,
    secretRef:
      AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions'].secretRef,
    purpose: 'hosted-retrieval-resource-lifecycle' as const,
    runtimeZone: 'server' as const,
    useId,
  });

const openAiCreateMutation = (
  displayName = 'prodivix-runtime-adapter'
): AgentEvaluationHostedRetrievalProviderResourceMutation =>
  Object.freeze({
    protocolFamily: 'openai-responses' as const,
    mutationKind: 'create-primary' as const,
    displayName,
    auxiliaryResourceId: 'file-runtime-adapter-1',
    signal: new AbortController().signal,
  });

const dispatchIntentFor = (
  mutation: AgentEvaluationHostedRetrievalProviderResourceMutation
): AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent => {
  const projection =
    projectAgentEvaluationHostedRetrievalProviderResourceMutation(mutation);
  return createAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent({
    intentId: 'intent.provider-mutation-adapter.0001',
    lifecycleOwnerAuthorityIssuerId: 'authority.provider-mutation-adapter',
    lifecycleOwnerImplementationDigest: digest('owner-implementation'),
    namespaceId: 'namespace.provider-mutation-adapter',
    repositoryCommit: COMMIT,
    planDigest: digest('plan'),
    frozenRunDigest: digest('frozen-run'),
    runConfigArtifactBindingDigest: digest('run-config-binding'),
    runtimeResourceSetId: 'runtime-resource-set.provider-mutation-adapter',
    registrationIntentDigest: digest('registration-intent'),
    registrationRequestDigest: digest('registration-request'),
    authorityDigest: null,
    lifecycleClaimReceiptDigest: null,
    protocolFamily: mutation.protocolFamily,
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    providerConfigurationId:
      AGENT_EVALUATION_PROVIDER_DEFINITIONS[mutation.protocolFamily]
        .providerConfigurationId,
    providerConfigurationDigest: digest('provider-configuration'),
    budgetReservationId: 'budget-reservation.provider-mutation-adapter',
    budgetReservationAuthorityDigest: digest('budget-authority'),
    operation: 'create',
    mutationKind: mutation.mutationKind,
    mutationSequence: 0,
    resourceId: null,
    resourceRole: 'primary',
    endpointId: projection.endpointId,
    endpointClass: 'provider-hosted-retrieval-resource',
    method: 'POST',
    requestProjectionDigest: projection.requestProjectionDigest,
    requestBodyDigest: projection.requestBodyDigest,
    requestBytes: projection.requestBytes,
    providerIdempotencyKeyBinding: 'dispatch-intent-digest',
    createdAt: NOW,
  });
};

const firstDeliveryClaimFor = (
  intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent
) => {
  const request =
    createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimRequest(
      {
        purpose:
          'hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim',
        dispatchIntentDigest: intent.intentDigest,
        lifecycleOwnerInstanceId: 'owner-instance.provider-mutation-adapter',
        expectedDispatchLedgerRevision: 0,
        expectedDispatchGeneration: 0,
        expectedPriorStageClaimReceiptDigest: null,
        expectedPriorClaimExpiresAt: null,
        requestedAt: NOW,
        minimumClaimExpiresAt: EXPIRES,
      }
    );
  return createAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
    intent,
    request,
    {
      dispatchAuthorityIssuerId: 'authority.provider-dispatch-stage',
      dispatchAuthorityImplementationDigest: digest(
        'dispatch-stage-implementation'
      ),
      dispatchLedgerRevision: 1,
      dispatchGeneration: 1,
      generationTransition: 'initial-first-delivery',
      deliveryDisposition: 'dispatch-authorized-first-delivery',
      claimedAt: NOW,
      claimExpiresAt: EXPIRES,
      priorTransportReceiptDigest: null,
      sealedJournalRecordDigest: null,
    }
  );
};

describe('production hosted-retrieval Provider mutation adapter', () => {
  it('binds first-delivery authority to the exact mutation projection and uses the intent digest as OpenAI idempotency', async () => {
    const mutation = openAiCreateMutation();
    const intent = dispatchIntentFor(mutation);
    const claim = firstDeliveryClaimFor(intent);
    const fetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const headers = init?.headers as Headers;
        expect(headers.get('authorization')).toBe(`Bearer ${OPENAI_SECRET}`);
        expect(headers.get('idempotency-key')).toBe(intent.intentDigest);
        return response(
          { object: 'vector_store', id: 'vs-runtime-adapter-1' },
          { 'x-request-id': 'request.runtime-adapter.0001' },
          201
        );
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    const result = await transport.use(
      openAiSecretUse('lifecycle.adapter.authorized-create.0001'),
      (session) =>
        executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation(
          session,
          {
            dispatchIntent: intent,
            dispatchStageClaimReceipt: claim,
            observedAt: NOW,
            mutation,
          }
        )
    );

    expect(result).toMatchObject({
      mutationKind: 'create-primary',
      outcome: 'created',
      resourceId: 'vs-runtime-adapter-1',
      resourceRole: 'primary',
      continuationEndpoint: null,
    });
    expect(result.transport.providerRequestId).toBe(
      'request.runtime-adapter.0001'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a recomputed foreign mutation before Provider dispatch', async () => {
    const intentMutation = openAiCreateMutation();
    const intent = dispatchIntentFor(intentMutation);
    const claim = firstDeliveryClaimFor(intent);
    const fetch = vi.fn(async () =>
      response(
        { object: 'vector_store', id: 'vs-should-not-dispatch' },
        {},
        201
      )
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    await expect(
      transport.use(
        openAiSecretUse('lifecycle.adapter.foreign-mutation.0001'),
        (session) =>
          executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation(
            session,
            {
              dispatchIntent: intent,
              dispatchStageClaimReceipt: claim,
              observedAt: NOW,
              mutation: openAiCreateMutation('foreign-display-name'),
            }
          )
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('executes Gemini create, upload-start, upload-finalize, list, read, and delete through normalized operations', async () => {
    const uploadUrl =
      'https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/store-adapter-1:uploadToFileSearchStore?upload_id=adapter_1&upload_protocol=resumable';
    const calls: string[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const endpoint = new URL(String(input));
        const key = `${init?.method} ${endpoint.pathname}${endpoint.search}`;
        calls.push(key);
        if (
          init?.method === 'POST' &&
          endpoint.pathname === '/v1/fileSearchStores'
        ) {
          return response({
            name: 'fileSearchStores/store-adapter-1',
            displayName: 'prodivix-adapter-gemini',
          });
        }
        if (
          init?.method === 'POST' &&
          endpoint.search === '' &&
          endpoint.pathname.startsWith('/upload/')
        ) {
          return response({}, { 'x-goog-upload-url': uploadUrl });
        }
        if (init?.method === 'POST' && endpoint.search !== '') {
          return response({
            name: 'fileSearchStores/store-adapter-1/upload/operations/op-1',
          });
        }
        if (
          init?.method === 'GET' &&
          endpoint.pathname === '/v1/fileSearchStores'
        ) {
          return response({
            fileSearchStores: [
              {
                name: 'fileSearchStores/store-adapter-1',
                displayName: 'prodivix-adapter-gemini',
              },
            ],
          });
        }
        if (init?.method === 'GET') {
          return response({
            name: 'fileSearchStores/store-adapter-1',
            activeDocumentsCount: 1,
            pendingDocumentsCount: 0,
            failedDocumentsCount: 0,
          });
        }
        return response(null, {}, 204);
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });
    const results = await transport.use(
      geminiSecretUse('lifecycle.adapter.gemini-sequence.0001'),
      async (session) => {
        const created =
          await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
            session,
            {
              mutation: {
                mutationKind: 'create-primary',
                protocolFamily: 'gemini-interactions',
                displayName: 'prodivix-adapter-gemini',
                signal: new AbortController().signal,
              },
            }
          );
        const started =
          await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
            session,
            {
              mutation: {
                mutationKind: 'upload-content-start',
                protocolFamily: 'gemini-interactions',
                providerResourceId: created.resourceId!,
                filename: 'adapter.txt',
                contentBytes: 7,
                signal: new AbortController().signal,
              },
            }
          );
        const uploaded =
          await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
            session,
            {
              mutation: {
                mutationKind: 'upload-content-finalize',
                protocolFamily: 'gemini-interactions',
                providerResourceId: created.resourceId!,
                continuationEndpoint: started.continuationEndpoint!,
                contentBytes: new TextEncoder().encode('fixture'),
                signal: new AbortController().signal,
              },
            }
          );
        const listed =
          await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
            session,
            {
              reconciliationKind: 'list-primary',
              protocolFamily: 'gemini-interactions',
              displayName: 'prodivix-adapter-gemini',
              signal: new AbortController().signal,
            }
          );
        const read =
          await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
            session,
            {
              reconciliationKind: 'read-resource',
              protocolFamily: 'gemini-interactions',
              resourceId: created.resourceId!,
              resourceRole: 'primary',
              signal: new AbortController().signal,
            }
          );
        const deleted =
          await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
            session,
            {
              mutation: {
                mutationKind: 'delete-resource',
                protocolFamily: 'gemini-interactions',
                resourceId: created.resourceId!,
                resourceRole: 'primary',
                signal: new AbortController().signal,
              },
            }
          );
        return { created, started, uploaded, listed, read, deleted };
      }
    );

    expect(results.created.outcome).toBe('created');
    expect(results.started.continuationEndpoint).toBe(uploadUrl);
    expect(results.uploaded.outcome).toBe('uploaded');
    expect(results.listed.matchingResourceId).toBe(
      'fileSearchStores/store-adapter-1'
    );
    expect(results.read.readiness).toBe('ready');
    expect(results.deleted.outcome).toBe('deleted');
    expect(calls).toHaveLength(6);
  });

  it('uses only read-only Provider reconciliation and returns unresolved when OpenAI lacks a frozen resource identity', async () => {
    const mutation = openAiCreateMutation();
    const intent = dispatchIntentFor(mutation);
    const claim = firstDeliveryClaimFor(intent);
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('GET');
        expect(new URL(String(input)).pathname).toBe(
          '/v1/vector_stores/vs-runtime-adapter-read'
        );
        return response({
          id: 'vs-runtime-adapter-read',
          object: 'vector_store',
          status: 'completed',
          file_counts: {
            failed: 0,
            cancelled: 0,
            completed: 1,
            in_progress: 0,
            total: 1,
          },
        });
      }
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });

    const attempts = await transport.use(
      openAiSecretUse('lifecycle.adapter.reconciliation.0001'),
      async (session) => {
        const unresolved =
          await executeAgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt(
            session,
            {
              dispatchIntent: intent,
              dispatchStageClaimReceipt: claim,
              observationRequest: null,
              providerResourceId: null,
              resourceRole: null,
              geminiDisplayName: null,
              signal: new AbortController().signal,
            }
          );
        const reconciliation = {
          reconciliationKind: 'read-resource' as const,
          protocolFamily: 'openai-responses' as const,
          resourceId: 'vs-runtime-adapter-read',
          resourceRole: 'primary' as const,
          signal: new AbortController().signal,
        };
        const projection =
          projectAgentEvaluationHostedRetrievalProviderResourceReconciliation(
            reconciliation
          );
        const observationRequest =
          createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
            {
              purpose:
                'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read',
              dispatchIntentDigest: intent.intentDigest,
              dispatchStageClaimReceiptDigest: claim.receiptDigest,
              transportReceiptDigest: digest('unknown-transport-receipt'),
              mutationKind: intent.mutationKind,
              mutationSequence: intent.mutationSequence,
              providerConfigurationId: intent.providerConfigurationId,
              endpointId: projection.endpointId,
              method: 'GET',
              requestedAt: NOW,
            }
          );
        const observed =
          await executeAgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt(
            session,
            {
              dispatchIntent: intent,
              dispatchStageClaimReceipt: claim,
              observationRequest,
              providerResourceId: 'vs-runtime-adapter-read',
              resourceRole: 'primary',
              geminiDisplayName: null,
              signal: reconciliation.signal,
            }
          );
        return { unresolved, observed };
      }
    );

    expect(attempts.unresolved).toEqual({
      status: 'unresolved',
      reason: 'provider-authoritative-read-unavailable',
      dispatchIntentDigest: intent.intentDigest,
      protocolFamily: 'openai-responses',
      mutationKind: 'create-primary',
    });
    expect(attempts.observed).toMatchObject({
      status: 'observed',
      result: { readiness: 'ready', outcome: 'created' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects response/status drift before producing normalized evidence', async () => {
    const fetch = vi.fn(async () =>
      response({ object: 'file', id: 'file-drift', bytes: 7 }, {}, 201)
    );
    const transport = createAgentEvaluationProviderResourceTransport({
      environment,
      fetch,
      resolveHost,
      clock: () => NOW,
    });
    await expect(
      transport.use(
        openAiSecretUse('lifecycle.adapter.response-drift.0001'),
        (session) =>
          executeAgentEvaluationCapabilityProbeProviderResourceMutation(
            session,
            {
              providerIdempotencyKey: 'idempotency.adapter.upload.0001',
              mutation: {
                mutationKind: 'upload-content',
                protocolFamily: 'openai-responses',
                contentBytes: new TextEncoder().encode('fixture'),
                filename: 'adapter.txt',
                lifetimeSeconds: 3_600,
                signal: new AbortController().signal,
              },
            }
          )
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });
});
