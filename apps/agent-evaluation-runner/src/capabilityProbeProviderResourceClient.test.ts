import { readFileSync } from 'node:fs';

import {
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES,
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  digestAgentCanonicalValue,
  type AgentCapabilityProbeProviderResourceAuthority,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceResult,
} from './capabilityProbeProviderResourceClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import { createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPort } from './productionCapabilityProbeProviderResourceAuthority';
import { refreshAgentEvaluationTestMaterialCatalogDigests } from './runConfig.fixture';
import { decodeAgentEvaluationRunConfigQualificationTemplate } from './runConfig';

const namespaceId = 'evaluation.probe-resource.test';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const token = 'capability-probe-provider-resource-token-123456789';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'capability-probe-provider-resource.test',
});
const registeredAt = '2026-08-08T00:00:00.000Z';
const expiresAt = '2026-08-15T01:00:00.000Z';
const minimumExpiresAt = '2026-08-15T00:00:00.000Z';
const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);

const template = () => {
  const value = JSON.parse(readFileSync(examplePath, 'utf8')) as Record<
    string,
    unknown
  >;
  refreshAgentEvaluationTestMaterialCatalogDigests(value);
  return decodeAgentEvaluationRunConfigQualificationTemplate(value);
};

const response = (value: unknown): Response =>
  new Response(canonicalJsonText(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const authorityFor = (
  request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  suffix = 'default'
): AgentCapabilityProbeProviderResourceAuthority =>
  createAgentCapabilityProbeProviderResourceAuthority(request.probeProgram, {
    protocolFamily: request.providerConfiguration.adapter.protocolFamily as
      'gemini-interactions' | 'openai-responses',
    providerConfigurationId:
      request.providerConfiguration.providerConfigurationId,
    modelId: request.modelLineage.modelId,
    modelLineageDigest: request.modelLineage.lineageDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
    providerResourceId: `provider-resource.${request.providerConfiguration.adapter.protocolFamily}.${request.probeProgram.profileProjection.capabilityProfileId}.${suffix}`,
    resourceManifestDigest: digestAgentCanonicalValue({
      manifest: request.requestDigest,
      suffix,
    }),
    contentUploadReceiptDigest: digestAgentCanonicalValue({
      upload: request.requestDigest,
      suffix,
    }),
    deletionAuthorityReceiptDigest: digestAgentCanonicalValue({
      deletion: request.requestDigest,
      suffix,
    }),
    registeredAt,
    expiresAt,
  });

const registrationResponseFor = (
  request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  authority: AgentCapabilityProbeProviderResourceAuthority
) => {
  const resourceResultDigest = digestAgentCanonicalValue({
    result: request.requestDigest,
  });
  const stageDigest = digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-stage',
    version: 1,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });
  const ownerAdmissionDigest = digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-owner-admission',
    version: 1,
    requestDigest: request.requestDigest,
    resourceResultDigest,
    ownerImplementationDigest,
    stageDigest,
  });
  const dispatchAckDigest = digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-ack',
    version: 1,
    requestDigest: request.requestDigest,
    resourceResultDigest,
    ownerAdmissionDigest,
    ownerImplementationDigest,
    stageDigest,
  });
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
    requestDigest: request.requestDigest,
    providerResourceAuthority: authority,
    resourceResultDigest,
    ownerImplementationDigest,
    stageDigest,
    dispatchAckDigest,
  });
  return Object.freeze({
    ...base,
    registrationReceiptDigest: digestAgentCanonicalValue(base),
  });
};

describe('capability probe provider resource client', () => {
  it('prepares exact four durable resource authorities through canonical 8790 registrations', async () => {
    const source = template();
    const calls: string[] = [];
    const fetchSpy = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/capability-probe-provider-resource-registrations`
      );
      const request =
        decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
          JSON.parse(String(init?.body))
        );
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(headers.get('Idempotency-Key')).toBe(request.requestDigest);
      calls.push(
        `${request.providerConfiguration.adapter.protocolFamily}:${request.probeProgram.profileProjection.capabilityProfileId}`
      );
      return response(
        registrationResponseFor(request, authorityFor(request, 'prepared'))
      );
    });
    const prepare =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPort(
        { environment, fetch: fetchSpy }
      );

    const bundle = await prepare({
      namespaceId,
      template: source,
      providerLanes:
        AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.map(
          (protocolFamily) => ({
            protocolFamily,
            identity: source.nativeIdentities.find(
              (identity) => identity.protocolFamily === protocolFamily
            )!,
          })
        ),
      minimumExpiresAt,
      deadlineSignal: new AbortController().signal,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(calls).toEqual([
      'gemini-interactions:g4-provider-hosted-retrieval-core',
      'openai-responses:g4-provider-hosted-retrieval-core',
      'gemini-interactions:g4-provider-hosted-retrieval-document',
      'openai-responses:g4-provider-hosted-retrieval-document',
    ]);
    expect(Object.keys(bundle.authorities)).toEqual([
      'gemini-interactions',
      'openai-responses',
    ]);
    for (const protocolFamily of AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES) {
      expect(Object.keys(bundle.authorities[protocolFamily])).toEqual(
        AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES
      );
    }
  }, 20_000);

  it('stores one exact resource result before the registration owner returns it', async () => {
    const source = template();
    const identity = source.nativeIdentities.find(
      (candidate) => candidate.protocolFamily === 'openai-responses'
    )!;
    const { provider, model } = await import('@prodivix/ai').then(
      ({ resolveAgentProductionEvaluationNativeProviderIdentity }) =>
        resolveAgentProductionEvaluationNativeProviderIdentity(identity)
    );
    const registrationRequest =
      createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest({
        namespaceId,
        repositoryCommit,
        providerConfiguration: provider,
        modelLineage: model,
        probeProgram:
          identity.capabilityProbePrograms['g4-provider-hosted-retrieval-core'],
        minimumExpiresAt,
      });
    const descriptor =
      registrationRequest.probeProgram.providerRequestIntent
        .publicProbeResource!;
    const providerResourceId = 'provider-resource.openai.test.result';
    const manifestBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-manifest',
      version: 1 as const,
      requestDigest: registrationRequest.requestDigest,
      probeProgramDigest: registrationRequest.probeProgram.programDigest,
      publicResourceDescriptorDigest: descriptor.descriptorDigest,
      protocolFamily: 'openai-responses' as const,
      providerConfigurationId: provider.providerConfigurationId,
      modelId: model.modelId,
      modelLineageDigest: model.lineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      providerResourceKind: 'openai-vector-store-id' as const,
      providerResourceId,
      contentDigest: descriptor.contentDigest,
      documentBytesDigest: descriptor.documentBytesDigest,
      registeredAt,
      expiresAt,
    });
    const resourceManifest = Object.freeze({
      ...manifestBase,
      manifestDigest: digestAgentCanonicalValue(manifestBase),
    });
    const uploadBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt',
      version: 1 as const,
      requestDigest: registrationRequest.requestDigest,
      resourceManifestDigest: resourceManifest.manifestDigest,
      publicResourceDescriptorDigest: descriptor.descriptorDigest,
      providerResourceKind: 'openai-vector-store-id' as const,
      providerResourceId,
      contentDigest: descriptor.contentDigest,
      documentBytesDigest: descriptor.documentBytesDigest,
      dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 1 }),
      transportReceiptDigest: digestAgentCanonicalValue({ transport: 1 }),
      responseSpoolDigest: digestAgentCanonicalValue({ spool: 1 }),
      uploadedAt: registeredAt,
    });
    const contentUploadReceipt = Object.freeze({
      ...uploadBase,
      contentUploadReceiptDigest: digestAgentCanonicalValue(uploadBase),
    });
    const deletionAuthorityReceipt =
      createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
        resourceManifestDigest: resourceManifest.manifestDigest,
        deletionRequestProjection:
          createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
            requestDigest: registrationRequest.requestDigest,
            protocolFamily: 'openai-responses',
            providerResourceId,
            auxiliaryResourceIds: Object.freeze(['file.test.cleanup']),
          }),
        registeredAt,
        expiresAt,
      });
    const providerResourceAuthority =
      createAgentCapabilityProbeProviderResourceAuthority(
        registrationRequest.probeProgram,
        {
          protocolFamily: 'openai-responses',
          providerConfigurationId: provider.providerConfigurationId,
          modelId: model.modelId,
          modelLineageDigest: model.lineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          providerResourceId,
          resourceManifestDigest: resourceManifest.manifestDigest,
          contentUploadReceiptDigest:
            contentUploadReceipt.contentUploadReceiptDigest,
          deletionAuthorityReceiptDigest:
            deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
          registeredAt,
          expiresAt,
        }
      );
    const resultBase = Object.freeze({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-result',
      version: 1 as const,
      requestDigest: registrationRequest.requestDigest,
      resourceManifest,
      contentUploadReceipt,
      deletionAuthorityReceipt,
      providerResourceAuthority,
    });
    const resourceResult = Object.freeze({
      ...resultBase,
      resultDigest: digestAgentCanonicalValue(resultBase),
    }) as AgentEvaluationCapabilityProbeProviderResourceResult;
    const stageDigest = digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-stage',
      version: 1,
      requestDigest: registrationRequest.requestDigest,
      ownerImplementationDigest,
    });
    const ingressRequest =
      createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest({
        namespaceId,
        repositoryCommit,
        registrationRequest,
        ownerImplementationDigest,
        stageDigest,
        resourceResult,
      });
    const resultIngressReceiptDigest = digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-receipt',
      version: 1,
      requestDigest: ingressRequest.requestDigest,
      ingressDigest: ingressRequest.ingressDigest,
      resourceResultDigest: ingressRequest.resourceResultDigest,
      dispatchAckDigest: ingressRequest.dispatchAckDigest,
    });
    const fetchSpy = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/capability-probe-provider-resource-results`
      );
      expect(init?.body).toBe(canonicalJsonText(ingressRequest));
      return response({
        format:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
        version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
        requestDigest: ingressRequest.requestDigest,
        ingressDigest: ingressRequest.ingressDigest,
        resourceResultDigest: ingressRequest.resourceResultDigest,
        dispatchAckDigest: ingressRequest.dispatchAckDigest,
        resultIngressReceiptDigest,
        replayed: false,
      });
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: fetchSpy,
      });

    const sealed = await client.storeResult(
      ingressRequest,
      new AbortController().signal
    );

    expect(sealed.resultIngressReceiptDigest).toBe(resultIngressReceiptDigest);
    expect(sealed.replayed).toBe(false);
  });

  it('rejects a fully recommitted cross-provider authority and an aborted dispatch', async () => {
    const source = template();
    const byProtocol = new Map(
      source.nativeIdentities.map((identity) => [
        identity.protocolFamily,
        identity,
      ])
    );
    const { resolveAgentProductionEvaluationNativeProviderIdentity } =
      await import('@prodivix/ai');
    const openai = byProtocol.get('openai-responses')!;
    const gemini = byProtocol.get('gemini-interactions')!;
    const openaiIdentity =
      resolveAgentProductionEvaluationNativeProviderIdentity(openai);
    const geminiIdentity =
      resolveAgentProductionEvaluationNativeProviderIdentity(gemini);
    const openaiRequest =
      createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest({
        namespaceId,
        repositoryCommit,
        providerConfiguration: openaiIdentity.provider,
        modelLineage: openaiIdentity.model,
        probeProgram:
          openai.capabilityProbePrograms[
            'g4-provider-hosted-retrieval-document'
          ],
        minimumExpiresAt,
      });
    const geminiRequest =
      createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest({
        namespaceId,
        repositoryCommit,
        providerConfiguration: geminiIdentity.provider,
        modelLineage: geminiIdentity.model,
        probeProgram:
          gemini.capabilityProbePrograms[
            'g4-provider-hosted-retrieval-document'
          ],
        minimumExpiresAt,
      });
    const swapped = registrationResponseFor(
      openaiRequest,
      authorityFor(geminiRequest, 'swapped')
    );

    expect(() =>
      decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse(
        swapped,
        openaiRequest
      )
    ).toThrow();

    const fetchSpy = vi.fn<typeof fetch>();
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: fetchSpy,
      });
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.register(openaiRequest, controller.signal)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
