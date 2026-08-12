import { createHash } from 'node:crypto';

import {
  createAgentCapabilityProbeNormalizedObservationSourceProjection,
  createAgentCapabilityProbeObservedLimits,
  createAgentCapabilityProbeProgramObservation,
  createAgentCapabilityProbeProgramReceipt,
  createAgentEvaluationProductionCapabilityProbeEvidence,
  digestAgentCapabilityProbeNormalizedObservationSourceProjection,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  projectAgentCapabilityProbeSemanticProofPhaseLeaves,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  validateAgentCapabilityProbeNetworkRoundTripSequence,
  type AgentCapabilityProbeDenialProjection,
  type AgentCapabilityProbeObservedFactProjection,
  type AgentCapabilityProbeSupportedSemanticProof,
  type CanonicalDigest,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS,
  AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS,
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeReferenceBundle,
  digestAgentEvaluationCapabilityProbeOwnerAdmission,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeReferenceEntry,
} from './capabilityProbeAdmissionClient';
import type { AgentEvaluationCapabilityProbeReferenceIngressClient } from './capabilityProbeReferenceIngressClient';
import type { AgentEvaluationCapabilityProbeResponseSpoolIngressClient } from './capabilityProbeResponseSpoolIngressClient';
import type { AgentEvaluationCapabilityProbeOwnerPort } from './productionOwnerAuthoritySidecar';

export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_AUTHORITY_ID =
  'evaluation.capability-probe.active-provider-owner.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-capability-probe-executor-implementation',
    version: 1,
    phaseAuthority: 'bounded-provider-dispatch-with-durable-ciphertext-spool',
    referenceAuthority: 'typed-six-receipt-chain',
    normalizationAuthority: 'repo-owned-program-semantic-proof',
  });

const sourceReceiptFormats = Object.freeze([
  'prodivix.agent-evaluation-capability-probe-provider-request-source-receipt',
  'prodivix.agent-evaluation-capability-probe-provider-response-source-receipt',
  'prodivix.agent-evaluation-capability-probe-dispatch-source-receipt',
  'prodivix.agent-evaluation-capability-probe-transport-source-receipt',
  'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt',
  'prodivix.agent-evaluation-capability-probe-normalized-event-set-source-receipt',
] as const);

type ProbePhase =
  AgentEvaluationCapabilityProbeAdmissionRequest['probeProgram']['providerRequestIntent']['requestPhases'][number];

export type AgentEvaluationCapabilityProbePhaseOutcome =
  'completed' | 'failed' | 'refused' | 'timed-out';

export type AgentEvaluationCapabilityProbePhaseExecution = Readonly<{
  phase: ProbePhase;
  sequence: number;
  requestDigest: CanonicalDigest;
  requestBytes: number;
  responseDigest: CanonicalDigest;
  responseBytes: number;
  outcome: AgentEvaluationCapabilityProbePhaseOutcome;
  programTerminal: boolean;
  providerJobStatus:
    'cancelled' | 'completed' | 'failed' | 'in-progress' | 'queued' | null;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  dispatchedAt: string;
  completedAt: string;
  spoolRef: string;
  envelopeDigest: CanonicalDigest;
  ciphertextBase64: string;
  aadDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeNormalization = Readonly<{
  status: 'supported' | 'unsupported';
  observedFacts: readonly AgentCapabilityProbeObservedFactProjection[];
  semanticProof: AgentCapabilityProbeSupportedSemanticProof | null;
  denial: AgentCapabilityProbeDenialProjection | null;
}>;

export interface AgentEvaluationCapabilityProbePhaseTransport {
  executePhase(
    input: Readonly<{
      request: AgentEvaluationCapabilityProbeAdmissionRequest;
      phase: ProbePhase;
      sequence: number;
      priorPhases: readonly AgentEvaluationCapabilityProbePhaseExecution[];
    }>
  ): Promise<AgentEvaluationCapabilityProbePhaseExecution>;
  normalize(
    input: Readonly<{
      request: AgentEvaluationCapabilityProbeAdmissionRequest;
      phases: readonly AgentEvaluationCapabilityProbePhaseExecution[];
      requestReferenceDigest: CanonicalDigest;
      responseReferenceDigest: CanonicalDigest;
    }>
  ): Promise<AgentEvaluationCapabilityProbeNormalization>;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

export type CreateProductionAgentEvaluationCapabilityProbeExecutorInput =
  Readonly<{
    authorityId?: string;
    implementationDigest?: CanonicalDigest;
    phaseTransport: AgentEvaluationCapabilityProbePhaseTransport;
    responseSpoolIngress: AgentEvaluationCapabilityProbeResponseSpoolIngressClient;
    referenceIngress: AgentEvaluationCapabilityProbeReferenceIngressClient;
    encryptionPolicyDigest: CanonicalDigest;
    normalizerImplementationDigest: CanonicalDigest;
  }>;

export type ProductionAgentEvaluationCapabilityProbeExecutor = Readonly<{
  port: AgentEvaluationCapabilityProbeOwnerPort;
  close(): ReturnType<AgentEvaluationCapabilityProbePhaseTransport['close']>;
}>;

const fail = (code: string): never => {
  throw new TypeError(`G4_CAPABILITY_PROBE_EXECUTOR_INVALID: ${code}`);
};

const exactRecord = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const sha256Digest = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const decodeCiphertext = (source: string): Uint8Array => {
  if (typeof source !== 'string' || source.length < 4) {
    return fail('phase-ciphertext');
  }
  const bytes = Buffer.from(source, 'base64');
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > 262_144 ||
    bytes.toString('base64') !== source
  ) {
    bytes.fill(0);
    return fail('phase-ciphertext');
  }
  return bytes;
};

const validatePhase = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  phase: ProbePhase,
  sequence: number
): AgentEvaluationCapabilityProbePhaseExecution => {
  if (
    !exactRecord(value, [
      'phase',
      'sequence',
      'requestDigest',
      'requestBytes',
      'responseDigest',
      'responseBytes',
      'outcome',
      'programTerminal',
      'providerJobStatus',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'dispatchedAt',
      'completedAt',
      'spoolRef',
      'envelopeDigest',
      'ciphertextBase64',
      'aadDigest',
      'encryptionProfileDigest',
      'keyRefDigest',
    ]) ||
    value.phase !== phase ||
    value.sequence !== sequence ||
    ![
      value.requestDigest,
      value.responseDigest,
      value.dispatchIntentDigest,
      value.transportReceiptDigest,
      value.envelopeDigest,
      value.aadDigest,
      value.encryptionProfileDigest,
      value.keyRefDigest,
    ].every(isAgentCanonicalDigest) ||
    !Number.isSafeInteger(value.requestBytes) ||
    Number(value.requestBytes) < 1 ||
    !Number.isSafeInteger(value.responseBytes) ||
    Number(value.responseBytes) < 1 ||
    !['completed', 'failed', 'refused', 'timed-out'].includes(
      String(value.outcome)
    ) ||
    typeof value.programTerminal !== 'boolean' ||
    (value.providerJobStatus !== null &&
      !['cancelled', 'completed', 'failed', 'in-progress', 'queued'].includes(
        String(value.providerJobStatus)
      )) ||
    !isAgentControlInstant(value.dispatchedAt) ||
    !isAgentControlInstant(value.completedAt) ||
    Date.parse(String(value.completedAt)) <
      Date.parse(String(value.dispatchedAt)) ||
    Date.parse(String(value.completedAt)) -
      Date.parse(String(value.dispatchedAt)) >
      request.probeProgram.hardLimits.maximumSingleDispatchMs ||
    !isAgentControlIdentity(value.spoolRef)
  ) {
    return fail('phase-shape');
  }
  const ciphertext = decodeCiphertext(String(value.ciphertextBase64));
  ciphertext.fill(0);
  return Object.freeze({
    ...(value as unknown as AgentEvaluationCapabilityProbePhaseExecution),
  });
};

const commonSource = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  authorityId: string,
  implementationDigest: CanonicalDigest,
  observedAt: string,
  format: (typeof sourceReceiptFormats)[number]
) =>
  Object.freeze({
    format,
    version: 1 as const,
    admissionRequestDigest: request.requestDigest,
    probeProgramDigest: request.probeProgram.programDigest,
    profileProjectionDigest: request.probeProgram.profileProjectionDigest,
    providerConfigurationDigest: digestAgentCanonicalValue(
      request.providerConfiguration
    ),
    modelLineageDigest: request.modelLineage.lineageDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
    ownerImplementationDigest: implementationDigest,
    authorityIssuerId: authorityId,
    observedAt,
  });

const createReferenceEntry = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  authorityId: string,
  implementationDigest: CanonicalDigest,
  observedAt: string,
  ordinal: number,
  previousReceiptDigest: CanonicalDigest | null,
  sourceReceipt: unknown
): AgentEvaluationCapabilityProbeReferenceEntry => {
  const kind = AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS[ordinal];
  const format = AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS[ordinal];
  if (!kind || !format) return fail('reference-ordinal');
  const receipt = Object.freeze({
    format,
    version: 1 as const,
    admissionRequestDigest: request.requestDigest,
    providerConfigurationDigest: digestAgentCanonicalValue(
      request.providerConfiguration
    ),
    modelLineageDigest: request.modelLineage.lineageDigest,
    qualificationCapabilityProfileDigest:
      request.qualificationCapabilityProfileDigest,
    capabilityId: request.capabilityId,
    probeProgramDigest: request.probeProgram.programDigest,
    profileProjectionDigest: request.probeProgram.profileProjectionDigest,
    adapterDigest: request.providerConfiguration.adapter.adapterDigest,
    ownerImplementationDigest: implementationDigest,
    authorityIssuerId: authorityId,
    previousReceiptDigest,
    observedAt,
    sourceReceipt,
    sourceReceiptDigest: digestAgentCanonicalValue(sourceReceipt),
  });
  return Object.freeze({
    kind,
    receipt,
    receiptDigest: digestAgentCanonicalValue(receipt),
  });
};

const duration = (start: string, end: string): number =>
  Date.parse(end) - Date.parse(start);

export const createProductionAgentEvaluationCapabilityProbeExecutor = (
  input: CreateProductionAgentEvaluationCapabilityProbeExecutorInput
): ProductionAgentEvaluationCapabilityProbeExecutor => {
  const authorityId =
    input.authorityId ??
    PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_AUTHORITY_ID;
  const implementationDigest =
    input.implementationDigest ??
    PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_EXECUTOR_IMPLEMENTATION_DIGEST;
  if (
    !isAgentControlIdentity(authorityId) ||
    ![
      implementationDigest,
      input.encryptionPolicyDigest,
      input.normalizerImplementationDigest,
    ].every(isAgentCanonicalDigest) ||
    typeof input.phaseTransport?.executePhase !== 'function' ||
    typeof input.phaseTransport?.normalize !== 'function' ||
    typeof input.phaseTransport?.close !== 'function' ||
    typeof input.responseSpoolIngress?.storeResponseSpool !== 'function' ||
    typeof input.referenceIngress?.storeReferenceBundle !== 'function'
  ) {
    return fail('composition');
  }
  let draining = false;
  let active = 0;

  const port = Object.freeze({
    authorityId,
    implementationDigest,
    async execute({ request: inputRequest, stageDigest }) {
      if (draining) return fail('draining');
      const request =
        decodeAgentEvaluationCapabilityProbeAdmissionRequest(inputRequest);
      if (!isAgentCanonicalDigest(stageDigest)) return fail('stage');
      active += 1;
      try {
        const phases: AgentEvaluationCapabilityProbePhaseExecution[] = [];
        for (let sequence = 0; ; sequence += 1) {
          const phase = resolveAgentCapabilityProbeNetworkRoundTripPhase(
            request.probeProgram,
            sequence
          );
          if (phase === null) break;
          const execution = validatePhase(
            await input.phaseTransport.executePhase({
              request,
              phase,
              sequence,
              priorPhases: Object.freeze([...phases]),
            }),
            request,
            phase,
            sequence
          );
          phases.push(execution);
          if (execution.programTerminal) break;
        }
        try {
          validateAgentCapabilityProbeNetworkRoundTripSequence(
            request.probeProgram,
            phases.map(
              ({
                phase,
                sequence,
                outcome,
                programTerminal,
                providerJobStatus,
              }) =>
                Object.freeze({
                  phase,
                  sequence,
                  outcome,
                  programTerminal,
                  providerJobStatus,
                })
            )
          );
        } catch {
          return fail('phase-sequence');
        }
        const first = phases[0];
        const last = phases.at(-1);
        if (!first || !last) return fail('phase-count');
        const observedAt = last.completedAt;
        const totalRequestBytes = phases.reduce(
          (total, phase) => total + phase.requestBytes,
          0
        );
        const totalResponseBytes = phases.reduce(
          (total, phase) => total + phase.responseBytes,
          0
        );
        const observedExecutionDurationMs = duration(
          first.dispatchedAt,
          last.completedAt
        );
        if (
          totalRequestBytes >
            request.probeProgram.hardLimits.maximumRequestBytes ||
          totalResponseBytes >
            request.probeProgram.hardLimits.maximumResponseBytes ||
          observedExecutionDurationMs < 0 ||
          observedExecutionDurationMs >
            request.probeProgram.hardLimits.maximumExecutionDurationMs ||
          phases.some(
            (phase, index) =>
              index > 0 &&
              Date.parse(phase.dispatchedAt) <
                Date.parse(phases[index - 1]!.completedAt)
          )
        ) {
          return fail('phase-limits');
        }
        const phaseRequests = Object.freeze(
          phases.map((phase) =>
            Object.freeze({
              phase: phase.phase,
              sequence: phase.sequence,
              requestDigest: phase.requestDigest,
              requestBytes: phase.requestBytes,
            })
          )
        );
        const phaseResponses = Object.freeze(
          phases.map((phase) =>
            Object.freeze({
              phase: phase.phase,
              sequence: phase.sequence,
              requestDigest: phase.requestDigest,
              responseDigest: phase.responseDigest,
              responseBytes: phase.responseBytes,
              outcome: phase.outcome,
              programTerminal: phase.programTerminal,
              providerJobStatus: phase.providerJobStatus,
              completedAt: phase.completedAt,
            })
          )
        );
        const dispatchIntents = Object.freeze(
          phases.map((phase) =>
            Object.freeze({
              phase: phase.phase,
              sequence: phase.sequence,
              requestDigest: phase.requestDigest,
              dispatchIntentDigest: phase.dispatchIntentDigest,
              dispatchedAt: phase.dispatchedAt,
            })
          )
        );
        const transportReceipts = Object.freeze(
          phases.map((phase) =>
            Object.freeze({
              phase: phase.phase,
              sequence: phase.sequence,
              dispatchIntentDigest: phase.dispatchIntentDigest,
              transportReceiptDigest: phase.transportReceiptDigest,
              outcome: phase.outcome,
              responseDigest: phase.responseDigest,
              completedAt: phase.completedAt,
            })
          )
        );
        const spoolReceipts = [] as Record<string, unknown>[];
        for (const phase of phases) {
          const ciphertext = decodeCiphertext(phase.ciphertextBase64);
          let spoolReceipt: Readonly<Record<string, unknown>>;
          try {
            const spoolBase = Object.freeze({
              phase: phase.phase,
              sequence: phase.sequence,
              transportReceiptDigest: phase.transportReceiptDigest,
              responseDigest: phase.responseDigest,
              spoolRef: phase.spoolRef,
              envelopeDigest: phase.envelopeDigest,
              ciphertextDigest: sha256Digest(ciphertext),
              ciphertextByteLength: ciphertext.byteLength,
              aadDigest: phase.aadDigest,
              encryptionProfileDigest: phase.encryptionProfileDigest,
              keyRefDigest: phase.keyRefDigest,
            });
            spoolReceipt = Object.freeze({
              ...spoolBase,
              spoolReceiptDigest: digestAgentCanonicalValue(spoolBase),
            });
          } finally {
            ciphertext.fill(0);
          }
          await input.responseSpoolIngress.storeResponseSpool({
            request,
            phase: phase.phase,
            sequence: phase.sequence,
            spoolRef: phase.spoolRef,
            responseDigest: phase.responseDigest,
            transportReceiptDigest: phase.transportReceiptDigest,
            envelopeDigest: phase.envelopeDigest,
            ciphertextBase64: phase.ciphertextBase64,
            aadDigest: phase.aadDigest,
            encryptionProfileDigest: phase.encryptionProfileDigest,
            keyRefDigest: phase.keyRefDigest,
            spooledAt: phase.completedAt,
            expiresAt: request.minimumExpiresAt,
          });
          spoolReceipts.push(spoolReceipt);
        }
        const sourceReceipts: unknown[] = [
          Object.freeze({
            ...commonSource(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              sourceReceiptFormats[0]
            ),
            phaseRequests,
            requestPhaseSetDigest: digestAgentCanonicalValue({ phaseRequests }),
            publicProbeResourceDescriptorDigest:
              request.probeProgram.providerRequestIntent.publicProbeResource
                ?.descriptorDigest ?? null,
          }),
          Object.freeze({
            ...commonSource(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              sourceReceiptFormats[1]
            ),
            phaseResponses,
            responsePhaseSetDigest: digestAgentCanonicalValue({
              phaseResponses,
            }),
            terminalResponseDigest: last.responseDigest,
          }),
          Object.freeze({
            ...commonSource(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              sourceReceiptFormats[2]
            ),
            dispatchIntents,
            dispatchIntentSetDigest: digestAgentCanonicalValue({
              dispatchIntents,
            }),
          }),
          Object.freeze({
            ...commonSource(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              sourceReceiptFormats[3]
            ),
            transportReceipts,
            transportReceiptSetDigest: digestAgentCanonicalValue({
              transportReceipts,
            }),
          }),
          Object.freeze({
            ...commonSource(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              sourceReceiptFormats[4]
            ),
            encryptionPolicyDigest: input.encryptionPolicyDigest,
            spoolReceipts: Object.freeze(spoolReceipts),
            spoolReceiptSetDigest: digestAgentCanonicalValue({
              spoolReceipts,
            }),
          }),
        ];
        const entries: AgentEvaluationCapabilityProbeReferenceEntry[] = [];
        for (let ordinal = 0; ordinal < sourceReceipts.length; ordinal += 1) {
          entries.push(
            createReferenceEntry(
              request,
              authorityId,
              implementationDigest,
              observedAt,
              ordinal,
              entries.at(-1)?.receiptDigest ?? null,
              sourceReceipts[ordinal]
            )
          );
        }
        const normalized = await input.phaseTransport.normalize({
          request,
          phases: Object.freeze(phases),
          requestReferenceDigest: entries[0]!.receiptDigest,
          responseReferenceDigest: entries[1]!.receiptDigest,
        });
        if (
          !exactRecord(normalized, [
            'status',
            'observedFacts',
            'semanticProof',
            'denial',
          ]) ||
          !['supported', 'unsupported'].includes(normalized.status) ||
          !Array.isArray(normalized.observedFacts)
        ) {
          return fail('normalization-shape');
        }
        const observedLimits = createAgentCapabilityProbeObservedLimits(
          request.probeProgram,
          {
            requestBytes: totalRequestBytes,
            responseBytes: totalResponseBytes,
            normalizedFactCount: normalized.observedFacts.length,
            toolCallCount:
              normalized.semanticProof?.proofKind === 'parallel-tool-call-set'
                ? normalized.semanticProof.toolCalls.length
                : 0,
            providerRoundTripCount: phases.length,
            pollAttemptCount: phases.filter(({ phase }) => phase === 'poll')
              .length,
            observedMaximumSingleDispatchMs: Math.max(
              ...phases.map((phase) =>
                duration(phase.dispatchedAt, phase.completedAt)
              )
            ),
            observedExecutionDurationMs,
          }
        );
        const normalizedObservationProjection =
          createAgentCapabilityProbeNormalizedObservationSourceProjection(
            request.probeProgram,
            {
              providerConfigurationDigest: digestAgentCanonicalValue(
                request.providerConfiguration
              ),
              modelLineageDigest: request.modelLineage.lineageDigest,
              adapterDigest:
                request.providerConfiguration.adapter.adapterDigest,
              probeRequestDigest: entries[0]!.receiptDigest,
              providerResponseDigest: entries[1]!.receiptDigest,
              status: normalized.status,
              observedFacts: normalized.observedFacts,
              semanticProof: normalized.semanticProof,
              denial: normalized.denial,
              observedLimits,
              observedAt,
            }
          );
        const phaseLeaves = normalized.semanticProof
          ? projectAgentCapabilityProbeSemanticProofPhaseLeaves(
              request.probeProgram,
              normalized.semanticProof
            )
          : null;
        const normalizedSourceReceipt = Object.freeze({
          ...commonSource(
            request,
            authorityId,
            implementationDigest,
            observedAt,
            sourceReceiptFormats[5]
          ),
          normalizedObservationProjection,
          normalizedObservationProjectionDigest:
            digestAgentCapabilityProbeNormalizedObservationSourceProjection(
              normalizedObservationProjection,
              request.probeProgram
            ),
          normalizerImplementationDigest: input.normalizerImplementationDigest,
          semanticProofPhaseLeaves: phaseLeaves,
          semanticProofPhaseLeavesDigest: phaseLeaves?.projectionDigest ?? null,
        });
        entries.push(
          createReferenceEntry(
            request,
            authorityId,
            implementationDigest,
            observedAt,
            5,
            entries.at(-1)!.receiptDigest,
            normalizedSourceReceipt
          )
        );
        const normalizedObservation =
          createAgentCapabilityProbeProgramObservation(request.probeProgram, {
            providerConfigurationDigest:
              normalizedObservationProjection.providerConfigurationDigest,
            modelLineageDigest:
              normalizedObservationProjection.modelLineageDigest,
            adapterDigest: normalizedObservationProjection.adapterDigest,
            probeRequestDigest:
              normalizedObservationProjection.probeRequestDigest,
            providerResponseDigest:
              normalizedObservationProjection.providerResponseDigest,
            normalizedEventSetDigest: entries[5]!.receiptDigest,
            status: normalizedObservationProjection.status,
            observedFacts: normalizedObservationProjection.observedFacts,
            semanticProof: normalizedObservationProjection.semanticProof,
            denial: normalizedObservationProjection.denial,
            observedLimits: normalizedObservationProjection.observedLimits,
            observedAt: normalizedObservationProjection.observedAt,
          });
        const receipt = createAgentCapabilityProbeProgramReceipt({
          probeId: `capability-probe.${request.requestDigest.slice(7, 31)}`,
          program: request.probeProgram,
          observation: normalizedObservation,
          declaredCapabilityProfileDigests:
            request.declaredCapabilityProfileDigests,
          probedAt: observedAt,
          expiresAt: request.minimumExpiresAt,
        });
        const probeEvidence =
          createAgentEvaluationProductionCapabilityProbeEvidence({
            authorityKind: 'sealed-provider-capability-probe',
            authorityIssuerId: authorityId,
            ownerImplementationDigest: implementationDigest,
            adapterDigest: request.providerConfiguration.adapter.adapterDigest,
            probeRequestDigest: entries[0]!.receiptDigest,
            probeResponseDigest: entries[1]!.receiptDigest,
            dispatchReceiptDigest: entries[2]!.receiptDigest,
            transportReceiptDigest: entries[3]!.receiptDigest,
            responseSpoolDigest: entries[4]!.receiptDigest,
            normalizedEventSetDigest: entries[5]!.receiptDigest,
            probeProgram: request.probeProgram,
            normalizedObservation,
            receipt,
          });
        const authorityResult =
          decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
            {
              probeEvidence,
              ownerAdmissionDigest:
                digestAgentEvaluationCapabilityProbeOwnerAdmission(
                  request,
                  probeEvidence.evidenceDigest,
                  implementationDigest,
                  stageDigest
                ),
            },
            request,
            implementationDigest,
            stageDigest
          );
        const canonicalEntries =
          decodeAgentEvaluationCapabilityProbeReferenceBundle(
            entries,
            request,
            probeEvidence,
            implementationDigest
          );
        const stored = await input.referenceIngress.storeReferenceBundle({
          request,
          authorityResult,
          ownerImplementationDigest: implementationDigest,
          stageDigest,
          referenceBundle: canonicalEntries,
        });
        if (
          stored.length !== canonicalEntries.length ||
          stored.some(
            (response, ordinal) =>
              response.receiptDigest !==
                canonicalEntries[ordinal]?.receiptDigest ||
              response.ordinal !== ordinal
          )
        ) {
          return fail('reference-ingress');
        }
        return authorityResult;
      } finally {
        active -= 1;
      }
    },
  }) satisfies AgentEvaluationCapabilityProbeOwnerPort;

  let closePromise: ReturnType<
    AgentEvaluationCapabilityProbePhaseTransport['close']
  > | null = null;
  return Object.freeze({
    port,
    close() {
      draining = true;
      if (active !== 0) return fail('active-close');
      closePromise ??= input.phaseTransport.close();
      return closePromise.then((receipt) => {
        if (
          !sameCanonicalJson(receipt, {
            status: 'clean',
            residualResourceIds: [],
            residualCanaryIds: [],
          })
        ) {
          return fail('transport-retirement');
        }
        return receipt;
      });
    },
  });
};
