import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgramReceipt,
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS,
  createAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  decodeAgentEvaluationCapabilityProbeSealedObservation,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  digestAgentEvaluationCapabilityProbeDispatchAck,
  digestAgentEvaluationCapabilityProbeOwnerAdmission,
  digestAgentEvaluationCapabilityProbeSealedObservation,
  type AgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeReferenceEntry,
  type AgentEvaluationCapabilityProbeSealedObservation,
} from './capabilityProbeAdmissionClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionPreplanOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';

const serviceToken = 'capability-probe-sidecar-token-012345';
const forbiddenCanary = 'capability-probe-forbidden-canary';
const observedAt = '2026-08-08T00:00:00.000Z';
const expiresAt = '2026-08-09T00:00:00.000Z';
const ownerImplementationDigest = digestAgentCanonicalValue({
  owner: 'production-capability-probe.test',
});
const authorityIssuerId = 'evaluation.capability-probe.test-owner';
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'capability-probe-sidecar-'));
  directories.push(directory);
  return directory;
};

const requestFixture = (): AgentEvaluationCapabilityProbeAdmissionRequest => {
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.capability-probe.test',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue(
      'capability-probe.transport-schema'
    ),
    eventNormalizationDigest: digestAgentCanonicalValue(
      'capability-probe.event-normalization'
    ),
  });
  const provider = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.capability-probe.test',
    providerOperatorId: 'provider-operator.capability-probe.test',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digestAgentCanonicalValue(
      'capability-probe.endpoint-profile'
    ),
    providerRegion: 'global',
    apiRevision: '2026-08-09',
    adapter,
    dataPolicyDigest: digestAgentCanonicalValue('capability-probe.data-policy'),
  });
  const model = createAgentModelLineage({
    modelId: 'model.capability-probe.test',
    modelFamilyId: 'model-family.capability-probe.test',
    modelFamilyOwnerId: 'model-owner.capability-probe.test',
    immutableVersion: 'model.capability-probe.test',
  });
  const capabilityProfileId = 'g4-provider-background-job' as const;
  const capabilityProfileDigest =
    digestAgentCapabilityProbeProfile(capabilityProfileId);
  const probeProgram = createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest,
  });
  return createAgentEvaluationCapabilityProbeAdmissionRequest({
    namespaceId: 'evaluation.namespace.capability-probe',
    repositoryCommit: 'a'.repeat(40),
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
};

const sealedObservationFor = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest
): AgentEvaluationCapabilityProbeSealedObservation => {
  const providerConfigurationDigest = digestAgentCanonicalValue(
    request.providerConfiguration
  );
  let previousReceiptDigest: string | null = null;
  const referenceBundle = AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.map(
    (kind, index) => {
      const sourceReceipt = Object.freeze({
        format: 'prodivix.test-observed-capability-probe-source',
        version: 1,
        kind,
        observationDigest: digestAgentCanonicalValue({ kind, index }),
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
          'capability-probe.test.denial'
        ),
      }),
      observedLimits,
      observedAt,
    }
  );
  const receipt = createAgentCapabilityProbeProgramReceipt({
    probeId: 'capability-probe.test.unsupported',
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
  const result = Object.freeze({
    probeEvidence,
    referenceBundle: Object.freeze(referenceBundle),
    ownerAdmissionDigest: digestAgentEvaluationCapabilityProbeOwnerAdmission(
      request,
      probeEvidence.evidenceDigest,
      ownerImplementationDigest,
      stageDigest
    ),
  });
  return decodeAgentEvaluationCapabilityProbeSealedObservation(
    result,
    request,
    ownerImplementationDigest,
    stageDigest
  );
};

const authorityResultFor = (
  observation: AgentEvaluationCapabilityProbeSealedObservation,
  request: AgentEvaluationCapabilityProbeAdmissionRequest
): AgentEvaluationCapabilityProbeAdmissionAuthorityResult =>
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
    Object.freeze({
      probeEvidence: observation.probeEvidence,
      ownerAdmissionDigest: observation.ownerAdmissionDigest,
    }),
    request,
    ownerImplementationDigest,
    digestAgentEvaluationCapabilityProbeAdmissionStage(
      request,
      ownerImplementationDigest
    )
  );

const outerRequest = (
  payload: AgentEvaluationCapabilityProbeAdmissionRequest,
  mode: 'stage' | 'execute' | 'reconcile',
  input: Readonly<{
    stageDigest?: string;
    dispatchAckDigest?: string;
    sealedProbeObservation?: AgentEvaluationCapabilityProbeSealedObservation;
    sealedProbeObservationDigest?: string;
  }> = {}
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'provider-capability',
    mode,
    namespaceId: payload.namespaceId,
    repositoryCommit: payload.repositoryCommit,
    operation: 'capability.probe',
    routeBinding: 'capability-probe-admission',
    requestDigest: payload.requestDigest,
    ownerImplementationDigest,
    ...input,
    claimGeneration: 1,
    payload,
  });

const createPorts = (counts: {
  stage: number;
  execute: number;
  reconcile: number;
}): AgentEvaluationProductionPreplanOwnerAuthorityPorts => {
  const capabilityProbe = Object.freeze({
    authorityId: 'provider-capability.probe.test',
    implementationDigest: ownerImplementationDigest,
    async execute(input: {
      request: AgentEvaluationCapabilityProbeAdmissionRequest;
    }) {
      counts.execute += 1;
      return authorityResultFor(
        sealedObservationFor(input.request),
        input.request
      );
    },
  });
  const unused = (family: string) =>
    Object.freeze({
      authorityId: `${family}.capability-probe.test`,
      implementationDigest: digestAgentCanonicalValue(family),
      async execute(): Promise<never> {
        throw new TypeError(`unexpected ${family} execute`);
      },
    });
  const ports = Object.freeze({
    purpose: 'preplan' as const,
    capabilityProbe,
    capabilityProbeProviderResource: unused('provider-resource'),
    capabilityProbeProviderResourceCleanup: unused('provider-resource-cleanup'),
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

const start = async (
  stateDirectory: string,
  ports: AgentEvaluationProductionPreplanOwnerAuthorityPorts
) => {
  const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
    serviceToken,
    authorities: ports,
    journal:
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        stateDirectory
      ),
    forbiddenCanaries: () => Object.freeze([forbiddenCanary, serviceToken]),
  });
  return sidecar.listen({ host: '127.0.0.1', port: 0 });
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

describe('production owner sidecar capability probe admission', () => {
  it('accepts a pre-plan request and executes only its real probe owner port', async () => {
    const payload = requestFixture();
    const result = authorityResultFor(sealedObservationFor(payload), payload);
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      payload,
      ownerImplementationDigest
    );
    const counts = { stage: 0, execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const staged = await post(
        listener.baseUrl,
        outerRequest(payload, 'stage')
      );
      expect(staged.status).toBe(200);
      expect(await staged.json()).toEqual({
        format: 'prodivix.agent-evaluation-owner-authority-response',
        version: 1,
        serviceKind: 'provider-capability',
        mode: 'stage',
        requestDigest: payload.requestDigest,
        ownerImplementationDigest,
        stageDigest,
      });
      const executed = await post(
        listener.baseUrl,
        outerRequest(payload, 'execute', { stageDigest })
      );
      expect(executed.status).toBe(200);
      expect(await executed.json()).toEqual({
        format: 'prodivix.agent-evaluation-owner-authority-response',
        version: 1,
        serviceKind: 'provider-capability',
        mode: 'execute',
        requestDigest: payload.requestDigest,
        ...result,
        ownerImplementationDigest,
        stageDigest,
      });
      expect(counts).toEqual({ stage: 0, execute: 1, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });

  it('reconciles an empty host cache only from the exact 8790 sealed observation', async () => {
    const payload = requestFixture();
    const sealedObservation = sealedObservationFor(payload);
    const result = authorityResultFor(sealedObservation, payload);
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      payload,
      ownerImplementationDigest
    );
    const dispatchAckDigest = digestAgentEvaluationCapabilityProbeDispatchAck(
      payload,
      result,
      ownerImplementationDigest,
      stageDigest
    );
    const counts = { stage: 0, execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      const reconciled = await post(
        listener.baseUrl,
        outerRequest(payload, 'reconcile', {
          stageDigest,
          dispatchAckDigest,
          sealedProbeObservation: sealedObservation,
          sealedProbeObservationDigest:
            digestAgentEvaluationCapabilityProbeSealedObservation(
              sealedObservation
            ),
        })
      );
      expect(reconciled.status).toBe(200);
      expect(await reconciled.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        ...result,
        dispatchAckDigest,
      });
      expect(counts).toEqual({ stage: 0, execute: 0, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });

  it('rejects fake fences and a swapped sealed observation before owner execution', async () => {
    const payload = requestFixture();
    const sealedObservation = sealedObservationFor(payload);
    const result = authorityResultFor(sealedObservation, payload);
    const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
      payload,
      ownerImplementationDigest
    );
    const dispatchAckDigest = digestAgentEvaluationCapabilityProbeDispatchAck(
      payload,
      result,
      ownerImplementationDigest,
      stageDigest
    );
    const counts = { stage: 0, execute: 0, reconcile: 0 };
    const listener = await start(
      await temporaryDirectory(),
      createPorts(counts)
    );
    try {
      expect(
        (
          await post(
            listener.baseUrl,
            Object.freeze({
              ...outerRequest(payload, 'stage'),
              planDigest: digestAgentCanonicalValue('forbidden-probe-plan'),
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'execute', {
              stageDigest: digestAgentCanonicalValue('fake-stage'),
            })
          )
        ).status
      ).toBe(503);
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'reconcile', {
              stageDigest,
              dispatchAckDigest: digestAgentCanonicalValue('fake-ack'),
              sealedProbeObservation: sealedObservation,
              sealedProbeObservationDigest:
                digestAgentEvaluationCapabilityProbeSealedObservation(
                  sealedObservation
                ),
            })
          )
        ).status
      ).toBe(503);
      const swapped = Object.freeze({
        ...sealedObservation,
        ownerAdmissionDigest: digestAgentCanonicalValue('swapped-owner'),
      });
      expect(
        (
          await post(
            listener.baseUrl,
            outerRequest(payload, 'reconcile', {
              stageDigest,
              dispatchAckDigest,
              sealedProbeObservation: swapped,
              sealedProbeObservationDigest:
                digestAgentEvaluationCapabilityProbeSealedObservation(swapped),
            })
          )
        ).status
      ).toBe(503);
      expect(counts).toEqual({ stage: 0, execute: 0, reconcile: 0 });
    } finally {
      await listener.close();
    }
  });
});
