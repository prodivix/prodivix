import {
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeProgramReceipt,
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  digestAgentEvaluationCapabilityProbeDispatchAck,
  digestAgentEvaluationCapabilityProbeOwnerAdmission,
} from './capabilityProbeAdmissionClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_CLIENT_TIMEOUT_MS,
  AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT,
  createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient,
} from './capabilityProbeAdmissionHttpClient';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';

const namespaceId = 'evaluation.capability-probe-http.test';
const repositoryCommit = 'a'.repeat(40);
const serviceToken = 'capability-probe-http-service-token-1234';
const observedAt = '2026-08-08T00:00:00.000Z';
const expiresAt = '2026-08-16T00:00:00.000Z';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'capability-probe-http.test',
});
const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: serviceToken,
});

const request = (() => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.capability-probe-http.test',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue('transport-schema'),
    eventNormalizationDigest: digestAgentCanonicalValue('normalizer'),
  });
  const provider = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.capability-probe-http.test',
    providerOperatorId: 'operator.capability-probe-http.test',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue('endpoint-profile'),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue('data-policy'),
  });
  const model = createAgentModelLineage({
    modelId: 'model.capability-probe-http.test',
    modelFamilyId: 'model-family.capability-probe-http.test',
    modelFamilyOwnerId: 'owner.capability-probe-http.test',
    immutableVersion: 'model.capability-probe-http.test',
  });
  const capabilityProfileId = 'g4-provider-isolated-cache' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId,
    repositoryCommit,
    providerConfiguration: provider,
    modelLineage: model,
    qualificationCapabilityProfileId: capabilityProfileId,
    qualificationCapabilityProfileDigest: capabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: Object.freeze([capabilityProfileDigest]),
    probeProgram,
    probeProviderResourceAuthority: null,
    minimumExpiresAt: expiresAt,
  });
})();

const responseFor = () => {
  const probeRequestDigest = digestAgentCanonicalValue({
    probe: request.requestDigest,
    phase: 'request',
  });
  const probeResponseDigest = digestAgentCanonicalValue({
    probe: request.requestDigest,
    phase: 'response',
  });
  const normalizedEventSetDigest = digestAgentCanonicalValue({
    probe: request.requestDigest,
    phase: 'normalized',
  });
  const observedLimits = createAgentCapabilityProbeObservedLimits(
    request.probeProgram,
    {
      requestBytes: 256,
      responseBytes: 256,
      normalizedFactCount: 0,
      toolCallCount: 0,
      providerRoundTripCount: 1,
      pollAttemptCount: 0,
      observedMaximumSingleDispatchMs: 100,
      observedExecutionDurationMs: 200,
    }
  );
  const normalizedObservation = createAgentCapabilityProbeProgramObservation(
    request.probeProgram,
    {
      providerConfigurationDigest: digestAgentCanonicalValue(
        request.providerConfiguration
      ),
      modelLineageDigest: request.modelLineage.lineageDigest,
      adapterDigest: request.providerConfiguration.adapter.adapterDigest,
      probeRequestDigest,
      providerResponseDigest: probeResponseDigest,
      normalizedEventSetDigest,
      status: 'unsupported',
      observedFacts: Object.freeze([]),
      semanticProof: null,
      denial: Object.freeze({
        denialKind: 'provider-feature-unavailable' as const,
        denialFactDigest: digestAgentCanonicalValue({
          probe: request.requestDigest,
          denial: true,
        }),
      }),
      observedLimits,
      observedAt,
    }
  );
  const receipt = createAgentCapabilityProbeProgramReceipt({
    probeId: 'probe.capability-probe-http.test',
    program: request.probeProgram,
    observation: normalizedObservation,
    declaredCapabilityProfileDigests: request.declaredCapabilityProfileDigests,
    probedAt: observedAt,
    expiresAt,
  });
  const probeEvidence = createAgentEvaluationProductionCapabilityProbeEvidence({
    authorityKind: 'sealed-provider-capability-probe',
    authorityIssuerId: 'authority.capability-probe-http.test',
    ownerImplementationDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
    probeRequestDigest,
    probeResponseDigest,
    dispatchReceiptDigest: digestAgentCanonicalValue({
      probe: request.requestDigest,
      phase: 'dispatch',
    }),
    transportReceiptDigest: digestAgentCanonicalValue({
      probe: request.requestDigest,
      phase: 'transport',
    }),
    responseSpoolDigest: digestAgentCanonicalValue({
      probe: request.requestDigest,
      phase: 'spool',
    }),
    normalizedEventSetDigest,
    probeProgram: request.probeProgram,
    normalizedObservation,
    receipt,
  });
  const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
    request,
    ownerImplementationDigest
  );
  const ownerAdmissionDigest =
    digestAgentEvaluationCapabilityProbeOwnerAdmission(
      request,
      probeEvidence.evidenceDigest,
      ownerImplementationDigest,
      stageDigest
    );
  const authorityResult = Object.freeze({
    probeEvidence,
    ownerAdmissionDigest,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT,
    version: 1 as const,
    requestDigest: request.requestDigest,
    probeEvidence,
    ownerImplementationDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest: digestAgentEvaluationCapabilityProbeDispatchAck(
      request,
      authorityResult,
      ownerImplementationDigest,
      stageDigest
    ),
  });
  return Object.freeze({
    ...base,
    admissionReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const jsonResponse = (value: unknown, status = 200) =>
  new Response(canonicalJsonText(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

describe('capability probe admission HTTP client', () => {
  it('submits one canonical idempotent admission and reuses the sealed response', async () => {
    const response = responseFor();
    const fetchSpy = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe(`Bearer ${serviceToken}`);
      expect(headers.get('Idempotency-Key')).toBe(request.requestDigest);
      expect(init).toMatchObject({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      expect(init?.body).toBe(canonicalJsonText(request));
      return jsonResponse(response);
    });
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: fetchSpy,
      });
    const first = await client.admit(request);
    const replay = await client.admit(request);

    expect(first).toEqual(replay);
    expect(first).toEqual(response);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/capability-probe-admissions`
    );
  });

  it('rejects stage, ACK, owner implementation, admission, and shape swaps', async () => {
    for (const mutate of [
      (value: Record<string, unknown>) => {
        value.stageDigest = digestAgentCanonicalValue('swapped-stage');
      },
      (value: Record<string, unknown>) => {
        value.dispatchAckDigest = digestAgentCanonicalValue('swapped-ack');
      },
      (value: Record<string, unknown>) => {
        value.ownerImplementationDigest =
          digestAgentCanonicalValue('swapped-owner');
      },
      (value: Record<string, unknown>) => {
        value.admissionReceiptDigest =
          digestAgentCanonicalValue('swapped-admission');
      },
      (value: Record<string, unknown>) => {
        const evidence = value.probeEvidence as Record<string, unknown>;
        evidence.evidenceDigest = digestAgentCanonicalValue('swapped-evidence');
      },
      (value: Record<string, unknown>) => {
        value.extra = true;
      },
    ]) {
      const tampered = structuredClone(responseFor()) as Record<
        string,
        unknown
      >;
      mutate(tampered);
      const client =
        createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
          namespaceId,
          repositoryCommit,
          environment,
          fetch: async () => jsonResponse(tampered),
        });
      await expect(client.admit(request)).rejects.toMatchObject({
        code: 'G4_RUNNER_RESPONSE_INVALID',
      });
    }
  });

  it('fails closed before accepting a non-JSON or unavailable ledger response', async () => {
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: async () =>
          new Response('unavailable', {
            status: 503,
            headers: { 'content-type': 'text/plain' },
          }),
      });
    await expect(client.admit(request)).rejects.toMatchObject({
      code: 'G4_RUNNER_PRODUCTION_SHARD_RUNTIME_UNAVAILABLE',
    });
  });

  it('keeps a legal 120 second active probe alive beyond the ordinary 30 second transport budget', async () => {
    vi.useFakeTimers();
    try {
      let completed = false;
      const client =
        createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
          namespaceId,
          repositoryCommit,
          environment,
          fetch: async () =>
            new Promise<Response>((resolve) => {
              setTimeout(() => {
                completed = true;
                resolve(jsonResponse(responseFor()));
              }, 120_000);
            }),
        });
      const pending = client.admit(request);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(pending).resolves.toEqual(responseFor());
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed at the bounded 125 second active probe deadline', async () => {
    vi.useFakeTimers();
    try {
      const client =
        createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient({
          namespaceId,
          repositoryCommit,
          environment,
          fetch: async (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('aborted', 'AbortError')),
                { once: true }
              );
            }),
        });
      const pending = expect(client.admit(request)).rejects.toMatchObject({
        code: 'G4_RUNNER_PRODUCTION_SHARD_RUNTIME_UNAVAILABLE',
      });

      await vi.advanceTimersByTimeAsync(
        AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_CLIENT_TIMEOUT_MS
      );
      await pending;
    } finally {
      vi.useRealTimers();
    }
  });
});
