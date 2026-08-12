import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProviderResourceAuthority,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCanonicalValue,
  digestAgentCapabilityProbeProfile,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt,
  digestAgentEvaluationCapabilityProbeProviderResourceStage,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceResult,
} from './capabilityProbeProviderResourceClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_OPERATION,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_ROUTE_BINDING,
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';

const serviceToken = 'provider-resource-sidecar-token-0123456789';
const namespaceId = 'evaluation.provider-resource-sidecar.test';
const repositoryCommit = '1'.repeat(40);
const registeredAt = '2026-08-08T00:00:00.000Z';
const expiresAt = '2026-08-15T01:00:00.000Z';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'provider-resource-sidecar.test',
});
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provider-resource-sidecar-'));
  directories.push(directory);
  return directory;
};

const registrationRequest = () => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.provider-resource-sidecar.test',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue('resource.transport'),
    eventNormalizationDigest: digestAgentCanonicalValue(
      'resource.normalization'
    ),
  });
  const providerConfiguration = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.resource-sidecar.test',
    providerOperatorId: 'provider-operator.resource-sidecar.test',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue('resource.endpoint'),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue('resource.data-policy'),
  });
  const modelLineage = createAgentModelLineage({
    modelId: 'model.resource-sidecar.test',
    modelFamilyId: 'model-family.resource-sidecar.test',
    modelFamilyOwnerId: 'model-owner.resource-sidecar.test',
    immutableVersion: 'model.resource-sidecar.test',
  });
  const capabilityProfileId = 'g4-provider-hosted-retrieval-core' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  return createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
    {
      namespaceId,
      repositoryCommit,
      providerConfiguration,
      modelLineage,
      probeProgram: createAgentCapabilityProbeProgram({
        capabilityProfileId,
        capabilityProfileDigest,
      }),
      minimumExpiresAt: expiresAt,
    }
  );
};

const resourceResultFor = (
  request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest
): AgentEvaluationCapabilityProbeProviderResourceResult => {
  const descriptor =
    request.probeProgram.providerRequestIntent.publicProbeResource!;
  const providerResourceId = 'provider-resource.openai.sidecar-test';
  const manifestBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-manifest',
    version: 1 as const,
    requestDigest: request.requestDigest,
    probeProgramDigest: request.probeProgram.programDigest,
    publicResourceDescriptorDigest: descriptor.descriptorDigest,
    protocolFamily: 'openai-responses' as const,
    providerConfigurationId:
      request.providerConfiguration.providerConfigurationId,
    modelId: request.modelLineage.modelId,
    modelLineageDigest: request.modelLineage.lineageDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
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
    requestDigest: request.requestDigest,
    resourceManifestDigest: resourceManifest.manifestDigest,
    publicResourceDescriptorDigest: descriptor.descriptorDigest,
    providerResourceKind: 'openai-vector-store-id' as const,
    providerResourceId,
    contentDigest: descriptor.contentDigest,
    documentBytesDigest: descriptor.documentBytesDigest,
    dispatchIntentDigest: digestAgentCanonicalValue('resource.dispatch'),
    transportReceiptDigest: digestAgentCanonicalValue('resource.transport'),
    responseSpoolDigest: digestAgentCanonicalValue('resource.spool'),
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
          requestDigest: request.requestDigest,
          protocolFamily: 'openai-responses',
          providerResourceId,
          auxiliaryResourceIds: Object.freeze([]),
        }),
      registeredAt,
      expiresAt,
    });
  const providerResourceAuthority =
    createAgentCapabilityProbeProviderResourceAuthority(request.probeProgram, {
      protocolFamily: 'openai-responses',
      providerConfigurationId:
        request.providerConfiguration.providerConfigurationId,
      modelId: request.modelLineage.modelId,
      modelLineageDigest: request.modelLineage.lineageDigest,
      adapterDigest: request.providerConfiguration.adapter.adapterDigest,
      providerResourceId,
      resourceManifestDigest: resourceManifest.manifestDigest,
      contentUploadReceiptDigest:
        contentUploadReceipt.contentUploadReceiptDigest,
      deletionAuthorityReceiptDigest:
        deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
      registeredAt,
      expiresAt,
    });
  const base = Object.freeze({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-result',
    version: 1 as const,
    requestDigest: request.requestDigest,
    resourceManifest,
    contentUploadReceipt,
    deletionAuthorityReceipt,
    providerResourceAuthority,
  });
  return Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
};

const outerRequest = (
  payload: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  mode: 'stage' | 'execute' | 'reconcile',
  input: Readonly<{
    stageDigest?: string;
    dispatchAckDigest?: string;
    resultIngressDigest?: string;
    resultIngressReceiptDigest?: string;
    sealedProviderResourceResult?: AgentEvaluationCapabilityProbeProviderResourceResult;
  }> = {}
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'provider-capability',
    mode,
    namespaceId: payload.namespaceId,
    repositoryCommit: payload.repositoryCommit,
    operation: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_OPERATION,
    routeBinding:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_ROUTE_BINDING,
    requestDigest: payload.requestDigest,
    ownerImplementationDigest,
    ...input,
    claimGeneration: 1,
    payload,
  });

const genericPorts = (
  resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult,
  executeCalls: { value: number }
): AgentEvaluationProductionPreplanOwnerAuthorityPorts => {
  const unused = (family: string) =>
    Object.freeze({
      authorityId: `${family}.provider-resource.test`,
      implementationDigest: digestAgentCanonicalValue(family),
      async execute(): Promise<never> {
        throw new TypeError(`unexpected ${family} execute`);
      },
    });
  const capabilityProbeProviderResource = Object.freeze({
    authorityId: 'provider-resource.owner.test',
    implementationDigest: ownerImplementationDigest,
    async execute() {
      executeCalls.value += 1;
      return resourceResult;
    },
  });
  const capabilityProbeProviderResourceCleanup = Object.freeze({
    authorityId: 'provider-resource-cleanup.owner.test',
    implementationDigest: digestAgentCanonicalValue({
      owner: 'provider-resource-cleanup.owner.test',
    }),
    async execute(): Promise<never> {
      throw new TypeError('unexpected provider resource cleanup');
    },
  });
  const ports = Object.freeze({
    purpose: 'preplan' as const,
    capabilityProbe: unused('capability-probe'),
    capabilityProbeProviderResource,
    capabilityProbeProviderResourceCleanup,
    runtimeFactSourceRegistration: Object.freeze({
      ...unused('runtime-fact-source-registration'),
      async reconcile(): Promise<undefined> {
        return undefined;
      },
    }),
  });
  return Object.freeze({
    ...ports,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        ports
      );
    },
  });
};

const post = (baseUrl: string, request: AgentEvaluationOwnerAuthorityRequest) =>
  fetch(`${baseUrl}/v1/capability-runtime/${request.mode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body: canonicalJsonText(request),
  });

describe('production owner sidecar capability probe provider resource', () => {
  it('stages, durably ingresses, and cross-host reconciles one exact resource result', async () => {
    const payload = registrationRequest();
    const resourceResult = resourceResultFor(payload);
    const stageDigest =
      digestAgentEvaluationCapabilityProbeProviderResourceStage(
        payload.requestDigest,
        ownerImplementationDigest
      );
    const ingressRequest =
      createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest({
        namespaceId,
        repositoryCommit,
        registrationRequest: payload,
        ownerImplementationDigest,
        stageDigest,
        resourceResult,
      });
    const resultIngressReceiptDigest =
      digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt(
        payload.requestDigest,
        ingressRequest.ingressDigest,
        ingressRequest.resourceResultDigest,
        ingressRequest.dispatchAckDigest
      );
    const executeCalls = { value: 0 };
    const ingressCalls = { value: 0 };
    const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
      serviceToken,
      authorities: genericPorts(resourceResult, executeCalls),
      journal: await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        await temporaryDirectory()
      ),
      forbiddenCanaries: () => Object.freeze([serviceToken]),
      capabilityProbeProviderResourceResultIngress: Object.freeze({
        async seal(input) {
          ingressCalls.value += 1;
          expect(input.resourceResult).toEqual(resourceResult);
          return Object.freeze({
            format:
              AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
            version:
              AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
            requestDigest: payload.requestDigest,
            ingressDigest: ingressRequest.ingressDigest,
            resourceResultDigest: ingressRequest.resourceResultDigest,
            dispatchAckDigest: ingressRequest.dispatchAckDigest,
            resultIngressReceiptDigest,
            replayed: false,
          });
        },
      }),
      capabilityProbeProviderResourceCleanupResultIngress: Object.freeze({
        async seal(): Promise<never> {
          throw new TypeError('unexpected provider resource cleanup ingress');
        },
      }),
    });
    const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
    try {
      const staged = await post(
        listener.baseUrl,
        outerRequest(payload, 'stage')
      );
      expect(staged.status).toBe(200);
      expect(await staged.json()).toMatchObject({
        mode: 'stage',
        stageDigest,
        ownerImplementationDigest,
      });

      const executed = await post(
        listener.baseUrl,
        outerRequest(payload, 'execute', { stageDigest })
      );
      expect(executed.status).toBe(200);
      expect(await executed.json()).toMatchObject({
        mode: 'execute',
        resourceResultDigest: ingressRequest.resourceResultDigest,
        dispatchAckDigest: ingressRequest.dispatchAckDigest,
        resultIngressDigest: ingressRequest.ingressDigest,
        resultIngressReceiptDigest,
      });
      expect(executeCalls.value).toBe(1);
      expect(ingressCalls.value).toBe(1);

      const reconciled = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', {
          stageDigest,
          dispatchAckDigest: ingressRequest.dispatchAckDigest,
          resultIngressDigest: ingressRequest.ingressDigest,
          resultIngressReceiptDigest,
          sealedProviderResourceResult: resourceResult,
        })
      );
      expect(reconciled.status).toBe(200);
      expect(await reconciled.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        resultIngressReceiptDigest,
      });
      expect(executeCalls.value).toBe(1);
      expect(ingressCalls.value).toBe(1);

      const swapped = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', {
          stageDigest,
          dispatchAckDigest: ingressRequest.dispatchAckDigest,
          resultIngressDigest: ingressRequest.ingressDigest,
          resultIngressReceiptDigest: digestAgentCanonicalValue('swapped'),
          sealedProviderResourceResult: resourceResult,
        })
      );
      expect(swapped.status).toBe(503);
      expect(executeCalls.value).toBe(1);
    } finally {
      await listener.close();
    }
  });
});
