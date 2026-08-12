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
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS,
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  digestAgentEvaluationCapabilityProbeOwnerAdmission,
  type AgentEvaluationCapabilityProbeReferenceEntry,
} from './capabilityProbeAdmissionClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT,
  createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient,
} from './capabilityProbeReferenceIngressClient';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';

const namespaceId = 'evaluation.capability-probe.reference-ingress';
const repositoryCommit = 'a'.repeat(40);
const serviceToken = 'capability-probe-reference-token-012345';
const forbiddenCanary = 'capability-probe-reference-forbidden-canary';
const observedAt = '2026-08-09T02:00:00.000Z';
const expiresAt = '2026-08-16T02:00:00.000Z';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'capability-probe-reference-ingress.test',
});
const authorityIssuerId = 'evaluation.capability-probe.reference-owner';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: repositoryCommit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: serviceToken,
});

const fixture = () => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.capability-probe.reference-ingress',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue(
      'capability-probe-reference.transport-schema'
    ),
    eventNormalizationDigest: digestAgentCanonicalValue(
      'capability-probe-reference.event-normalization'
    ),
  });
  const providerConfiguration = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.capability-probe.reference-ingress',
    providerOperatorId: 'provider-operator.capability-probe.reference-ingress',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue(
      'capability-probe-reference.endpoint-profile'
    ),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue(
      'capability-probe-reference.data-policy'
    ),
  });
  const modelLineage = createAgentModelLineage({
    modelId: 'model.capability-probe.reference-ingress',
    modelFamilyId: 'model-family.capability-probe.reference-ingress',
    modelFamilyOwnerId: 'model-owner.capability-probe.reference-ingress',
    immutableVersion: 'model.capability-probe.reference-ingress',
  });
  const capabilityProfileId = 'g4-provider-background-job' as const;
  const qualificationCapabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest: qualificationCapabilityProfileDigest,
  });
  const request = createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId,
    repositoryCommit,
    providerConfiguration,
    modelLineage,
    qualificationCapabilityProfileId: capabilityProfileId,
    qualificationCapabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: Object.freeze([
      qualificationCapabilityProfileDigest,
    ]),
    probeProgram,
    probeProviderResourceAuthority: null,
    minimumExpiresAt: expiresAt,
  });
  const providerConfigurationDigest = digestAgentCanonicalValue(
    request.providerConfiguration
  );
  let previousReceiptDigest: string | null = null;
  const referenceBundle = AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.map(
    (kind, index) => {
      const sourceReceipt = Object.freeze({
        format: 'prodivix.test-capability-probe-reference-source',
        version: 1,
        kind,
        sourceProjectionDigest: digestAgentCanonicalValue({ kind, index }),
      });
      const receipt = Object.freeze({
        format: AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS[index]!,
        version: 1 as const,
        admissionRequestDigest: request.requestDigest,
        providerConfigurationDigest,
        modelLineageDigest: request.modelLineage.lineageDigest,
        qualificationCapabilityProfileDigest:
          request.qualificationCapabilityProfileDigest,
        capabilityId: request.capabilityId,
        probeProgramDigest: request.probeProgram.programDigest,
        profileProjectionDigest: request.probeProgram.profileProjectionDigest,
        adapterDigest: request.providerConfiguration.adapter.adapterDigest,
        ownerImplementationDigest,
        authorityIssuerId,
        previousReceiptDigest,
        observedAt,
        sourceReceipt,
        sourceReceiptDigest: digestAgentCanonicalValue(sourceReceipt),
      });
      const entry = Object.freeze({
        kind,
        receipt,
        receiptDigest: digestAgentCanonicalValue(receipt),
      }) as AgentEvaluationCapabilityProbeReferenceEntry;
      previousReceiptDigest = entry.receiptDigest;
      return entry;
    }
  );
  const observedLimits = createAgentCapabilityProbeObservedLimits(
    request.probeProgram,
    {
      requestBytes: 0,
      responseBytes: 0,
      normalizedFactCount: 0,
      toolCallCount: 0,
      providerRoundTripCount: 1,
      pollAttemptCount: 0,
      observedMaximumSingleDispatchMs: 1,
      observedExecutionDurationMs: 1,
    }
  );
  const normalizedObservation = createAgentCapabilityProbeProgramObservation(
    request.probeProgram,
    {
      providerConfigurationDigest,
      modelLineageDigest: request.modelLineage.lineageDigest,
      adapterDigest: request.providerConfiguration.adapter.adapterDigest,
      probeRequestDigest: referenceBundle[0]!.receiptDigest,
      providerResponseDigest: referenceBundle[1]!.receiptDigest,
      normalizedEventSetDigest: referenceBundle[5]!.receiptDigest,
      status: 'unsupported',
      observedFacts: Object.freeze([]),
      semanticProof: null,
      denial: Object.freeze({
        denialKind: 'provider-request-denied',
        denialFactDigest: digestAgentCanonicalValue(
          'capability-probe-reference.denial'
        ),
      }),
      observedLimits,
      observedAt,
    }
  );
  const receipt = createAgentCapabilityProbeProgramReceipt({
    probeId: 'capability-probe.reference-ingress.unsupported',
    program: request.probeProgram,
    observation: normalizedObservation,
    declaredCapabilityProfileDigests: request.declaredCapabilityProfileDigests,
    probedAt: observedAt,
    expiresAt,
  });
  const probeEvidence = createAgentEvaluationProductionCapabilityProbeEvidence({
    authorityKind: 'sealed-provider-capability-probe',
    authorityIssuerId,
    ownerImplementationDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
    probeRequestDigest: referenceBundle[0]!.receiptDigest,
    probeResponseDigest: referenceBundle[1]!.receiptDigest,
    dispatchReceiptDigest: referenceBundle[2]!.receiptDigest,
    transportReceiptDigest: referenceBundle[3]!.receiptDigest,
    responseSpoolDigest: referenceBundle[4]!.receiptDigest,
    normalizedEventSetDigest: referenceBundle[5]!.receiptDigest,
    probeProgram: request.probeProgram,
    normalizedObservation,
    receipt,
  });
  const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
    request,
    ownerImplementationDigest
  );
  const authorityResult =
    decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
      Object.freeze({
        probeEvidence,
        ownerAdmissionDigest:
          digestAgentEvaluationCapabilityProbeOwnerAdmission(
            request,
            probeEvidence.evidenceDigest,
            ownerImplementationDigest,
            stageDigest
          ),
      }),
      request,
      ownerImplementationDigest,
      stageDigest
    );
  return Object.freeze({
    request,
    authorityResult,
    ownerImplementationDigest,
    stageDigest,
    referenceBundle: Object.freeze(referenceBundle),
  });
};

const backend = (tamper?: 'canary' | 'receipt') => {
  const calls: Array<Readonly<{ url: string; init: RequestInit }>> = [];
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      if (!init) throw new TypeError('missing-init');
      const url = String(input);
      const value = JSON.parse(String(init.body)) as Record<string, unknown>;
      const entry = value.entry as Record<string, unknown>;
      const ordinal = calls.length % 6;
      calls.push(Object.freeze({ url, init }));
      const response = {
        format:
          AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT,
        version: 1,
        ingressDigest: value.ingressDigest,
        admissionRequestDigest: value.admissionRequestDigest,
        kind:
          tamper === 'canary' && ordinal === 2 ? forbiddenCanary : entry.kind,
        ordinal,
        receiptDigest:
          tamper === 'receipt' && ordinal === 2
            ? digestAgentCanonicalValue('swapped-reference-receipt')
            : entry.receiptDigest,
        replayed: calls.length > 6,
      };
      return new Response(canonicalJsonText(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  );
  return Object.freeze({ calls, fetch });
};

describe('capability probe reference ingress client', () => {
  it('stores the exact six-reference chain and replays every idempotent receipt', async () => {
    const server = backend();
    const client =
      createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: server.fetch as typeof fetch,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
      });
    const input = fixture();
    const first = await client.storeReferenceBundle(input);
    const replay = await client.storeReferenceBundle(input);

    expect(first).toHaveLength(6);
    expect(first.every((receipt) => receipt.replayed === false)).toBe(true);
    expect(replay.every((receipt) => receipt.replayed === true)).toBe(true);
    expect(server.calls).toHaveLength(12);
    for (const [index, call] of server.calls.entries()) {
      const body = JSON.parse(String(call.init.body)) as Record<
        string,
        unknown
      >;
      const headers = call.init.headers as Headers;
      expect(call.url).toBe(
        `http://127.0.0.1:8790/v1/evaluations/${namespaceId}/capability-probe-reference-receipts`
      );
      expect(call.init.cache).toBe('no-store');
      expect(call.init.credentials).toBe('omit');
      expect(call.init.redirect).toBe('error');
      expect(headers.get('Idempotency-Key')).toBe(body.ingressDigest);
      expect(headers.get('Authorization')).toBeNull();
      expect((body.entry as Record<string, unknown>).kind).toBe(
        AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS[index % 6]
      );
    }
  });

  it.each([
    ['receipt', AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid],
    ['canary', AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak],
  ] as const)(
    'rejects a %s response before accepting the reference bundle',
    async (tamper, code) => {
      const server = backend(tamper);
      const client =
        createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient({
          namespaceId,
          repositoryCommit,
          environment,
          fetch: server.fetch as typeof fetch,
          forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        });
      await expect(
        client.storeReferenceBundle(fixture())
      ).rejects.toMatchObject({ code });
      expect(server.calls).toHaveLength(3);
    }
  );
});
