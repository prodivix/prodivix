import {
  createAgentCapabilityProbeProgram,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import { createAgentEvaluationCapabilityProbeAdmissionRequest } from './capabilityProbeAdmissionClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT,
  createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient,
} from './capabilityProbeResponseSpoolIngressClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const namespaceId = 'evaluation.capability-probe.response-spool';
const repositoryCommit = 'a'.repeat(40);
const serviceToken = 'capability-probe-response-spool-token-012345';
const forbiddenCanary = 'capability-probe-response-spool-forbidden-canary';
const spooledAt = '2026-08-09T04:00:00.000Z';
const expiresAt = '2026-08-16T04:00:00.000Z';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: repositoryCommit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: serviceToken,
});

const request = (() => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.capability-probe.response-spool',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue('transport-schema'),
    eventNormalizationDigest: digestAgentCanonicalValue('normalization'),
  });
  const providerConfiguration = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.capability-probe.response-spool',
    providerOperatorId: 'provider-operator.capability-probe.response-spool',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue('endpoint-profile'),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue('data-policy'),
  });
  const modelLineage = createAgentModelLineage({
    modelId: 'model.capability-probe.response-spool',
    modelFamilyId: 'model-family.capability-probe.response-spool',
    modelFamilyOwnerId: 'model-owner.capability-probe.response-spool',
    immutableVersion: 'model.capability-probe.response-spool',
  });
  const capabilityProfileId = 'g4-provider-background-job' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId,
    repositoryCommit,
    providerConfiguration,
    modelLineage,
    qualificationCapabilityProfileId: capabilityProfileId,
    qualificationCapabilityProfileDigest: capabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: Object.freeze([capabilityProfileDigest]),
    probeProgram,
    probeProviderResourceAuthority: null,
    minimumExpiresAt: expiresAt,
  });
})();

const input = Object.freeze({
  request,
  phase: 'submit' as const,
  sequence: 0,
  spoolRef: 'capability-probe.response-spool.submit.0',
  responseDigest: digestAgentCanonicalValue({ response: 'submit' }),
  transportReceiptDigest: digestAgentCanonicalValue({ transport: 'submit' }),
  envelopeDigest: digestAgentCanonicalValue({ envelope: 'submit' }),
  ciphertextBase64: Buffer.from('sealed-provider-response').toString('base64'),
  aadDigest: digestAgentCanonicalValue({ aad: 'submit' }),
  encryptionProfileDigest: digestAgentCanonicalValue({ encryption: 'profile' }),
  keyRefDigest: digestAgentCanonicalValue({ key: 'ref' }),
  spooledAt,
  expiresAt,
});

describe('capability probe response spool ingress client', () => {
  it('stores bounded ciphertext with exact digest, idempotency, and replay binding', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const ingress = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(ingress.format).toBe(
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_FORMAT
      );
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(
        ingress.ingressDigest
      );
      return new Response(
        canonicalJsonText({
          format:
            AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT,
          version: 1,
          ingressDigest: ingress.ingressDigest,
          admissionRequestDigest: ingress.admissionRequestDigest,
          phase: ingress.phase,
          sequence: ingress.sequence,
          spoolRef: ingress.spoolRef,
          ciphertextDigest: ingress.ciphertextDigest,
          replayed: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient(
        {
          namespaceId,
          repositoryCommit,
          environment,
          forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
          fetch: fetcher as typeof fetch,
        }
      );

    const result = await client.storeResponseSpool(input);

    expect(result).toMatchObject({
      admissionRequestDigest: request.requestDigest,
      phase: 'submit',
      sequence: 0,
      spoolRef: input.spoolRef,
      replayed: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects noncanonical base64 and ciphertext-bearing canaries before transport', async () => {
    const fetcher = vi.fn();
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient(
        {
          namespaceId,
          repositoryCommit,
          environment,
          forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
          fetch: fetcher as typeof fetch,
        }
      );

    await expect(
      client.storeResponseSpool({ ...input, ciphertextBase64: 'AA' })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    await expect(
      client.storeResponseSpool({
        ...input,
        spoolRef: forbiddenCanary,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a recomputed response that swaps the durable spool identity', async () => {
    const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const ingress = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        canonicalJsonText({
          format:
            AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT,
          version: 1,
          ingressDigest: ingress.ingressDigest,
          admissionRequestDigest: ingress.admissionRequestDigest,
          phase: ingress.phase,
          sequence: ingress.sequence,
          spoolRef: 'capability-probe.response-spool.swapped',
          ciphertextDigest: ingress.ciphertextDigest,
          replayed: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient(
        {
          namespaceId,
          repositoryCommit,
          environment,
          forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
          fetch: fetcher as typeof fetch,
        }
      );

    await expect(client.storeResponseSpool(input)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });
});
