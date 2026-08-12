import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage,
  digestAgentCanonicalValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope,
} from './capabilityProbeProviderResourceCleanupClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OPERATION,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ROUTE_BINDING,
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';

const serviceToken = 'cleanup-sidecar-token-0000000000000000000001';
const namespaceId = 'evaluation.cleanup-sidecar.test';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const cleanupImplementationDigest = digestAgentCanonicalValue({
  owner: 'cleanup-sidecar-test',
});
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const stateDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'prodivix-cleanup-sidecar-'));
  directories.push(directory);
  return directory;
};

const deletionAuthorityReceipt =
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
    resourceManifestDigest: digestAgentCanonicalValue({ manifest: 'cleanup' }),
    deletionRequestProjection:
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: digestAgentCanonicalValue({ registration: 'cleanup' }),
        protocolFamily: 'openai-responses',
        providerResourceId: 'vs-cleanup-sidecar',
        auxiliaryResourceIds: Object.freeze(['file-cleanup-sidecar']),
      }),
    registeredAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-16T00:00:00.000Z',
  });

const cleanupRequest =
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
    repositoryCommit,
    resourceRegistrationRequestDigest: deletionAuthorityReceipt.requestDigest,
    deletionAuthorityReceiptDigest:
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
  });

const cleanupReceipt = createAgentCapabilityProbeProviderResourceCleanupReceipt(
  {
    deletionAuthorityReceipt,
    resourceResults: Object.freeze([
      createAgentCapabilityProbeProviderResourceCleanupResourceResult({
        resourceId: 'vs-cleanup-sidecar',
        resourceRole: 'primary',
        outcome: 'deleted',
        dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 'store' }),
        transportReceiptDigest: digestAgentCanonicalValue({
          transport: 'store',
        }),
        completedAt: '2026-08-09T00:01:00.000Z',
      }),
      createAgentCapabilityProbeProviderResourceCleanupResourceResult({
        resourceId: 'file-cleanup-sidecar',
        resourceRole: 'auxiliary',
        outcome: 'already-absent',
        dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 'file' }),
        transportReceiptDigest: digestAgentCanonicalValue({
          transport: 'file',
        }),
        completedAt: '2026-08-09T00:01:01.000Z',
      }),
    ]),
  }
);

const stageDigest =
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
    cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
    ownerImplementationDigest: cleanupImplementationDigest,
  });

const ingressEnvelope =
  createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope(
    {
      namespaceId,
      repositoryCommit,
      cleanupRequest,
      ownerImplementationDigest: cleanupImplementationDigest,
      cleanupReceipt,
    }
  );

const requestFor = (
  mode: 'execute' | 'reconcile' | 'stage',
  overrides: Readonly<Record<string, unknown>> = Object.freeze({})
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: 1,
    serviceKind: 'provider-capability',
    mode,
    namespaceId,
    repositoryCommit,
    operation:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OPERATION,
    routeBinding:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ROUTE_BINDING,
    requestDigest: cleanupRequest.cleanupRequestDigest,
    ownerImplementationDigest: cleanupImplementationDigest,
    claimGeneration: 1,
    payload: Object.freeze({ cleanupRequest, deletionAuthorityReceipt }),
    ...(mode === 'stage' ? {} : { stageDigest }),
    ...(mode === 'reconcile'
      ? {
          dispatchAckDigest: ingressEnvelope.dispatchAckDigest,
          resultIngressDigest: ingressEnvelope.resultIngressDigest,
          resultIngressReceiptDigest:
            digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt(
              {
                resultIngressDigest: ingressEnvelope.resultIngressDigest,
                cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
              }
            ),
          sealedProviderResourceCleanupReceipt: cleanupReceipt,
        }
      : {}),
    ...overrides,
  }) as AgentEvaluationOwnerAuthorityRequest;

const post = async (
  baseUrl: string,
  request: AgentEvaluationOwnerAuthorityRequest
): Promise<Response> =>
  fetch(`${baseUrl}/v1/capability-runtime/${request.mode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body: canonicalJsonText(request),
  });

describe('production owner authority provider resource cleanup', () => {
  it('seals execute before response and replays a cross-host reconcile with zero cleanup execution', async () => {
    const cleanupExecute = vi.fn(async () => cleanupReceipt);
    const cleanupIngress = vi.fn(async () =>
      Object.freeze({
        format:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
        version:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
        cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
        cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
        dispatchAckDigest: ingressEnvelope.dispatchAckDigest,
        resultIngressDigest: ingressEnvelope.resultIngressDigest,
        resultIngressReceiptDigest:
          digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt(
            {
              resultIngressDigest: ingressEnvelope.resultIngressDigest,
              cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
            }
          ),
        replayed: false,
      })
    );
    const unusedPort = (authorityId: string) =>
      Object.freeze({
        authorityId,
        implementationDigest: digestAgentCanonicalValue({ authorityId }),
        async execute(): Promise<never> {
          throw new TypeError(`unexpected ${authorityId} execute`);
        },
      });
    let sidecarBaseUrl = '';
    let retiringCleanupCalls = 0;
    const authorityPorts = Object.freeze({
      purpose: 'preplan' as const,
      capabilityProbe: unusedPort('cleanup-test.probe'),
      capabilityProbeProviderResource: Object.freeze({
        authorityId: 'cleanup-test.resource',
        implementationDigest: digestAgentCanonicalValue({ owner: 'resource' }),
        execute: async () => {
          throw new TypeError('unexpected resource registration');
        },
      }),
      capabilityProbeProviderResourceCleanup: Object.freeze({
        authorityId: 'cleanup-test.resource-cleanup',
        implementationDigest: cleanupImplementationDigest,
        execute: cleanupExecute,
      }),
      runtimeFactSourceRegistration: Object.freeze({
        ...unusedPort('cleanup-test.runtime-registration'),
        async reconcile(): Promise<undefined> {
          return undefined;
        },
      }),
    });
    const authorities: AgentEvaluationProductionPreplanOwnerAuthorityPorts =
      Object.freeze({
        ...authorityPorts,
        close: async () => {
          expect((await fetch(`${sidecarBaseUrl}/healthz`)).status).toBe(503);
          const cleanupStage = await post(sidecarBaseUrl, requestFor('stage'));
          expect(cleanupStage.status).toBe(200);
          retiringCleanupCalls += 1;
          return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
            authorityPorts
          );
        },
      });
    const journal = await createFileAgentEvaluationOwnerAuthorityReplayJournal(
      await stateDirectory()
    );
    const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
      serviceToken,
      authorities,
      journal,
      forbiddenCanaries: () =>
        Object.freeze(['cleanup-sidecar-forbidden-canary-0001']),
      capabilityProbeProviderResourceCleanupResultIngress: Object.freeze({
        seal: cleanupIngress,
      }),
    });
    const listener = await sidecar.listen({ host: '127.0.0.1', port: 0 });
    sidecarBaseUrl = listener.baseUrl;
    try {
      const stageResponse = await post(listener.baseUrl, requestFor('stage'));
      expect(stageResponse.status).toBe(200);
      expect(await stageResponse.json()).toMatchObject({
        mode: 'stage',
        stageDigest,
        ownerImplementationDigest: cleanupImplementationDigest,
      });

      const executeResponse = await post(
        listener.baseUrl,
        requestFor('execute')
      );
      expect(executeResponse.status).toBe(200);
      expect(
        Object.keys((await executeResponse.json()) as object).sort()
      ).toEqual([
        'cleanupReceiptDigest',
        'dispatchAckDigest',
        'format',
        'mode',
        'ownerAdmissionDigest',
        'ownerImplementationDigest',
        'requestDigest',
        'resultIngressDigest',
        'resultIngressReceiptDigest',
        'serviceKind',
        'stageDigest',
        'version',
      ]);
      expect(cleanupExecute).toHaveBeenCalledOnce();
      expect(cleanupIngress).toHaveBeenCalledOnce();

      const reconcileResponse = await post(
        listener.baseUrl,
        requestFor('reconcile')
      );
      expect(reconcileResponse.status).toBe(200);
      expect(await reconcileResponse.json()).toMatchObject({
        reconciled: true,
        cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
      });
      expect(cleanupExecute).toHaveBeenCalledOnce();
      expect(cleanupIngress).toHaveBeenCalledOnce();

      const missingImplementation = requestFor('execute');
      const { ownerImplementationDigest: _missing, ...withoutImplementation } =
        missingImplementation;
      expect(
        await post(
          listener.baseUrl,
          withoutImplementation as AgentEvaluationOwnerAuthorityRequest
        )
      ).toMatchObject({ status: 503 });
      expect(
        await post(
          listener.baseUrl,
          requestFor('execute', {
            ownerImplementationDigest: digestAgentCanonicalValue({
              swapped: true,
            }) as CanonicalDigest,
          })
        )
      ).toMatchObject({ status: 503 });
      expect(cleanupExecute).toHaveBeenCalledOnce();
    } finally {
      await listener.close();
      expect(retiringCleanupCalls).toBe(1);
    }
  });
});
