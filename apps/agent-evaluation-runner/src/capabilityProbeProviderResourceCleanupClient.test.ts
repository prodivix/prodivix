import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceCleanupResponse,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope,
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient,
  decodeAgentEvaluationCapabilityProbeProviderResourceCleanupList,
} from './capabilityProbeProviderResourceCleanupClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';

const namespaceId = 'evaluation.probe-resource-cleanup.test';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const token = 'capability-probe-resource-cleanup-token-123456789';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'capability-probe-resource-cleanup.test',
});
const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const response = (value: unknown): Response =>
  new Response(canonicalJsonText(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const deletionAuthorityReceipt =
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
    resourceManifestDigest: digestAgentCanonicalValue({ manifest: 'cleanup' }),
    deletionRequestProjection:
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: digestAgentCanonicalValue({ registration: 'cleanup' }),
        protocolFamily: 'openai-responses',
        providerResourceId: 'vs-cleanup-client',
        auxiliaryResourceIds: Object.freeze(['file-cleanup-client']),
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
        resourceId: 'vs-cleanup-client',
        resourceRole: 'primary',
        outcome: 'deleted',
        dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 'store' }),
        transportReceiptDigest: digestAgentCanonicalValue({
          transport: 'store',
        }),
        completedAt: '2026-08-09T00:01:00.000Z',
      }),
      createAgentCapabilityProbeProviderResourceCleanupResourceResult({
        resourceId: 'file-cleanup-client',
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

const cleanupResponse =
  createAgentCapabilityProbeProviderResourceCleanupResponse({
    repositoryCommit,
    resourceRegistrationRequestDigest: deletionAuthorityReceipt.requestDigest,
    ownerImplementationDigest,
    cleanupReceipt,
  });

const emptyList = () => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
    namespaceId,
    repositoryCommit,
    records: Object.freeze([]),
  });
  return Object.freeze({
    ...base,
    listDigest: digestAgentCanonicalValue(base),
  });
};

describe('capability probe provider resource cleanup client', () => {
  it('lists with authenticated bodyless GET and rejects a list digest swap', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(
        `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/capability-probe-provider-resource-cleanups/${repositoryCommit}`
      );
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(headers.get('Idempotency-Key')).toBeNull();
      return response(emptyList());
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
        { namespaceId, repositoryCommit, environment, fetch: fetchSpy }
      );

    await expect(client.list(new AbortController().signal)).resolves.toEqual(
      emptyList()
    );
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(() =>
      decodeAgentEvaluationCapabilityProbeProviderResourceCleanupList(
        {
          ...emptyList(),
          listDigest: digestAgentCanonicalValue({ swapped: true }),
        },
        { namespaceId, repositoryCommit }
      )
    ).toThrow(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  });

  it('uses cleanupRequestDigest idempotency for cleanup and result ingress, then rejects an ACK swap', async () => {
    const envelope =
      createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope(
        {
          namespaceId,
          repositoryCommit,
          cleanupRequest,
          ownerImplementationDigest,
          cleanupReceipt,
        }
      );
    const expectedIngressReceipt =
      digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt({
        resultIngressDigest: envelope.resultIngressDigest,
        cleanupReceiptDigest: envelope.cleanupReceiptDigest,
      });
    const fetchSpy = vi.fn<typeof fetch>(async (url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(headers.get('Idempotency-Key')).toBe(
        cleanupRequest.cleanupRequestDigest
      );
      if (String(url).endsWith('capability-probe-provider-resource-cleanups')) {
        expect(JSON.parse(String(init?.body))).toEqual(cleanupRequest);
        return response(cleanupResponse);
      }
      expect(String(url)).toContain(
        'capability-probe-provider-resource-cleanup-results'
      );
      expect(JSON.parse(String(init?.body))).toEqual(envelope);
      return response({
        format:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
        version:
          AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
        cleanupRequestDigest: envelope.cleanupRequestDigest,
        cleanupReceiptDigest: envelope.cleanupReceiptDigest,
        dispatchAckDigest: envelope.dispatchAckDigest,
        resultIngressDigest: envelope.resultIngressDigest,
        resultIngressReceiptDigest: expectedIngressReceipt,
        replayed: false,
      });
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
        { namespaceId, repositoryCommit, environment, fetch: fetchSpy }
      );

    await expect(
      client.cleanup(cleanupRequest, new AbortController().signal)
    ).resolves.toEqual(cleanupResponse);
    await expect(
      client.storeResult(envelope, new AbortController().signal)
    ).resolves.toMatchObject({
      resultIngressReceiptDigest: expectedIngressReceipt,
      replayed: false,
    });

    const swapped =
      createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
        {
          namespaceId,
          repositoryCommit,
          environment,
          fetch: async () =>
            response({
              format:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
              version:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
              cleanupRequestDigest: envelope.cleanupRequestDigest,
              cleanupReceiptDigest: envelope.cleanupReceiptDigest,
              dispatchAckDigest: digestAgentCanonicalValue({ swapped: true }),
              resultIngressDigest: envelope.resultIngressDigest,
              resultIngressReceiptDigest: expectedIngressReceipt,
              replayed: true,
            }),
        }
      );
    await expect(
      swapped.storeResult(envelope, new AbortController().signal)
    ).rejects.toThrow(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  });
});
