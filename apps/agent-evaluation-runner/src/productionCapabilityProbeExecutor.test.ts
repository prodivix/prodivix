import {
  createAgentCapabilityProbeProgram,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT,
  type AgentEvaluationCapabilityProbeReferenceIngressClient,
} from './capabilityProbeReferenceIngressClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT,
  type AgentEvaluationCapabilityProbeResponseSpoolIngressClient,
} from './capabilityProbeResponseSpoolIngressClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS,
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  type AgentEvaluationCapabilityProbeReferenceEntry,
} from './capabilityProbeAdmissionClient';
import {
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST,
  createProductionAgentEvaluationCapabilityProbeExecutor,
  type AgentEvaluationCapabilityProbePhaseTransport,
} from './productionCapabilityProbeExecutor';

const namespaceId = 'evaluation.capability-probe.production-executor';
const repositoryCommit = 'a'.repeat(40);
const observedAt = '2026-08-09T02:00:00.000Z';
const expiresAt = '2026-08-16T02:00:00.000Z';
const encryptionPolicyDigest = digestAgentCanonicalValue({
  policy: 'capability-probe-production-executor',
});
const normalizerImplementationDigest = digestAgentCanonicalValue({
  normalizer: 'capability-probe-production-executor',
});

const createRequest = () => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.capability-probe.production-executor',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue(
      'capability-probe-production-executor.transport-schema'
    ),
    eventNormalizationDigest: digestAgentCanonicalValue(
      'capability-probe-production-executor.event-normalization'
    ),
  });
  const providerConfiguration = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.capability-probe.production-executor',
    providerOperatorId:
      'provider-operator.capability-probe.production-executor',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue(
      'capability-probe-production-executor.endpoint-profile'
    ),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue(
      'capability-probe-production-executor.data-policy'
    ),
  });
  const modelLineage = createAgentModelLineage({
    modelId: 'model.capability-probe.production-executor',
    modelFamilyId: 'model-family.capability-probe.production-executor',
    modelFamilyOwnerId: 'model-owner.capability-probe.production-executor',
    immutableVersion: 'model.capability-probe.production-executor',
  });
  const qualificationCapabilityProfileId =
    'g4-provider-background-job' as const;
  const qualificationCapabilityProfileDigest =
    digestAgentCapabilityProbeProfile(qualificationCapabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId: qualificationCapabilityProfileId,
    capabilityProfileDigest: qualificationCapabilityProfileDigest,
  });
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId,
    repositoryCommit,
    providerConfiguration,
    modelLineage,
    qualificationCapabilityProfileId,
    qualificationCapabilityProfileDigest,
    capabilityId: probeProgram.profileProjection.capabilityId,
    declaredCapabilityProfileDigests: Object.freeze([
      qualificationCapabilityProfileDigest,
    ]),
    probeProgram,
    probeProviderResourceAuthority: null,
    minimumExpiresAt: expiresAt,
  });
};

const createHarness = (
  options: Readonly<{
    excessiveResponseBytes?: boolean;
    swapReferenceDigest?: boolean;
  }> = {}
) => {
  const events: string[] = [];
  const request = createRequest();
  const spoolCalls: Array<
    Readonly<{ phase: string; sequence: number; ciphertextBase64: string }>
  > = [];
  let referenceBundle: readonly AgentEvaluationCapabilityProbeReferenceEntry[] =
    Object.freeze([]);
  const executePhase = vi.fn<
    AgentEvaluationCapabilityProbePhaseTransport['executePhase']
  >(async ({ phase, sequence }) => {
    events.push(`phase:${sequence}`);
    const dispatchedAt = new Date(
      Date.parse(observedAt) + sequence * 10
    ).toISOString();
    const completedAt = new Date(Date.parse(dispatchedAt) + 5).toISOString();
    return Object.freeze({
      phase,
      sequence,
      requestDigest: digestAgentCanonicalValue({
        kind: 'provider-request',
        phase,
        sequence,
      }),
      requestBytes: 32,
      responseDigest: digestAgentCanonicalValue({
        kind: 'provider-response',
        phase,
        sequence,
      }),
      responseBytes:
        options.excessiveResponseBytes && sequence === 1 ? 262_145 : 64,
      outcome: sequence === 0 ? ('completed' as const) : ('refused' as const),
      programTerminal: sequence === 1,
      providerJobStatus:
        sequence === 0 ? ('queued' as const) : ('failed' as const),
      dispatchIntentDigest: digestAgentCanonicalValue({
        kind: 'dispatch-intent',
        phase,
        sequence,
      }),
      transportReceiptDigest: digestAgentCanonicalValue({
        kind: 'transport-receipt',
        phase,
        sequence,
      }),
      dispatchedAt,
      completedAt,
      spoolRef: `capability-probe-spool.${sequence}`,
      envelopeDigest: digestAgentCanonicalValue({
        kind: 'ciphertext-envelope',
        phase,
        sequence,
      }),
      ciphertextBase64: Buffer.from(
        `sealed-provider-response-${sequence}`,
        'utf8'
      ).toString('base64'),
      aadDigest: digestAgentCanonicalValue({ kind: 'aad', phase, sequence }),
      encryptionProfileDigest: digestAgentCanonicalValue({
        kind: 'encryption-profile',
      }),
      keyRefDigest: digestAgentCanonicalValue({
        kind: 'key-reference',
      }),
    });
  });
  const phaseTransport: AgentEvaluationCapabilityProbePhaseTransport =
    Object.freeze({
      executePhase,
      normalize: vi.fn(async () =>
        Object.freeze({
          status: 'unsupported' as const,
          observedFacts: Object.freeze([]),
          semanticProof: null,
          denial: Object.freeze({
            denialKind: 'provider-request-denied' as const,
            denialFactDigest: digestAgentCanonicalValue({
              denial: 'provider-request-denied',
            }),
          }),
        })
      ),
      close: vi.fn(async () =>
        Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([] as const),
          residualCanaryIds: Object.freeze([] as const),
        })
      ),
    });
  const responseSpoolIngress: AgentEvaluationCapabilityProbeResponseSpoolIngressClient =
    Object.freeze({
      async storeResponseSpool(
        input: Parameters<
          AgentEvaluationCapabilityProbeResponseSpoolIngressClient['storeResponseSpool']
        >[0]
      ) {
        events.push(`spool:${input.sequence}`);
        spoolCalls.push(
          Object.freeze({
            phase: input.phase,
            sequence: input.sequence,
            ciphertextBase64: input.ciphertextBase64,
          })
        );
        return Object.freeze({
          format:
            AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT,
          version: 1 as const,
          ingressDigest: digestAgentCanonicalValue({
            kind: 'spool-ingress',
            sequence: input.sequence,
          }),
          admissionRequestDigest: input.request.requestDigest,
          phase: input.phase,
          sequence: input.sequence,
          spoolRef: input.spoolRef,
          ciphertextDigest: digestAgentCanonicalValue({
            ciphertextBase64: input.ciphertextBase64,
          }),
          replayed: false,
        });
      },
    });
  const referenceIngress: AgentEvaluationCapabilityProbeReferenceIngressClient =
    Object.freeze({
      async storeReferenceBundle(
        input: Parameters<
          AgentEvaluationCapabilityProbeReferenceIngressClient['storeReferenceBundle']
        >[0]
      ) {
        events.push('references');
        referenceBundle = input.referenceBundle;
        return Object.freeze(
          input.referenceBundle.map((entry, ordinal) =>
            Object.freeze({
              format:
                AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT,
              version: 1 as const,
              ingressDigest: digestAgentCanonicalValue({
                kind: 'reference-ingress',
                ordinal,
              }),
              admissionRequestDigest: input.request.requestDigest,
              kind: entry.kind,
              ordinal,
              receiptDigest:
                options.swapReferenceDigest && ordinal === 2
                  ? digestAgentCanonicalValue({ swapped: ordinal })
                  : entry.receiptDigest,
              replayed: false,
            })
          )
        );
      },
    });
  const executor = createProductionAgentEvaluationCapabilityProbeExecutor({
    phaseTransport,
    responseSpoolIngress,
    referenceIngress,
    encryptionPolicyDigest,
    normalizerImplementationDigest,
  });
  return Object.freeze({
    events,
    executePhase,
    executor,
    request,
    get referenceBundle() {
      return referenceBundle;
    },
    spoolCalls,
  });
};

describe('production capability probe executor', () => {
  it('spools ciphertext before committing the exact six-receipt authority chain', async () => {
    const harness = createHarness();
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      harness.request,
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST
    );

    const result = await harness.executor.port.execute({
      request: harness.request,
      stageDigest,
    });

    expect(harness.events).toEqual([
      'phase:0',
      'phase:1',
      'spool:0',
      'spool:1',
      'references',
    ]);
    expect(harness.spoolCalls).toHaveLength(2);
    expect(harness.referenceBundle.map(({ kind }) => kind)).toEqual(
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS
    );
    expect(
      harness.referenceBundle.every(
        (entry, ordinal) =>
          entry.receipt.previousReceiptDigest ===
          (ordinal === 0
            ? null
            : harness.referenceBundle[ordinal - 1]!.receiptDigest)
      )
    ).toBe(true);
    const encryptedSpoolSource = harness.referenceBundle[4]!.receipt
      .sourceReceipt as Readonly<Record<string, unknown>>;
    expect(encryptedSpoolSource).not.toHaveProperty('ciphertextBase64');
    expect(encryptedSpoolSource.spoolReceipts).toEqual(
      expect.arrayContaining([
        expect.not.objectContaining({ ciphertextBase64: expect.anything() }),
      ])
    );
    const normalizedSource = harness.referenceBundle[5]!.receipt
      .sourceReceipt as Readonly<Record<string, unknown>>;
    expect(normalizedSource.semanticProofPhaseLeaves).toBeNull();
    expect(normalizedSource.semanticProofPhaseLeavesDigest).toBeNull();
    expect(result.probeEvidence.normalizedObservation.status).toBe(
      'unsupported'
    );
    expect(result.probeEvidence.probeRequestDigest).toBe(
      harness.referenceBundle[0]!.receiptDigest
    );
    expect(result.probeEvidence.normalizedEventSetDigest).toBe(
      harness.referenceBundle[5]!.receiptDigest
    );
    await expect(harness.executor.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
  });

  it('rejects phase totals outside the repository-owned program budget before durable ingress', async () => {
    const harness = createHarness({ excessiveResponseBytes: true });
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      harness.request,
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST
    );

    await expect(
      harness.executor.port.execute({ request: harness.request, stageDigest })
    ).rejects.toThrow('G4_CAPABILITY_PROBE_EXECUTOR_INVALID: phase-limits');
    expect(harness.spoolCalls).toHaveLength(0);
    expect(harness.referenceBundle).toHaveLength(0);
  });

  it('rejects a swapped durable reference acknowledgement', async () => {
    const harness = createHarness({ swapReferenceDigest: true });
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      harness.request,
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST
    );

    await expect(
      harness.executor.port.execute({ request: harness.request, stageDigest })
    ).rejects.toThrow(
      'G4_CAPABILITY_PROBE_EXECUTOR_INVALID: reference-ingress'
    );
    expect(harness.spoolCalls).toHaveLength(2);
    expect(harness.referenceBundle).toHaveLength(6);
  });
});
