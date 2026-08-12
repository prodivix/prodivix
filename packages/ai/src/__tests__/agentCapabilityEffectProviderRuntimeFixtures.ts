import type { AgentJsonValue, CanonicalDigest } from '../domain/agent.types';
import { isAgentControlIdentity } from '../control/agentControlValidation';
import {
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
} from '../evaluation/agentEvaluationEvidenceAuthenticity';
import type {
  AgentEvaluationProviderResultSpoolEnvelope,
  AgentEvaluationTransportErrorCategory,
} from '../evaluation/agentEvaluationEvidenceAuthenticity.types';
import type { AgentEvaluationCapabilityPreEffectIntent } from '../evaluation/agentEvaluationCapabilityEffectAuthority';
import {
  createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  createAgentEvaluationCapabilityEffectProviderJournalResultRecord,
  createAgentEvaluationCapabilityEffectProviderJournalStageRecord,
  createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  type AgentEvaluationCapabilityEffectProviderJournalResultRecord,
  type AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  type AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord,
} from '../evaluation/agentEvaluationCapabilityEffectProviderJournal';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectProviderSpoolAad,
  createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
  createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  createAgentEvaluationCapabilityEffectProviderSpoolReceipt,
  createAgentEvaluationCapabilityEffectProviderSpoolRef,
  digestAgentEvaluationCapabilityEffectProviderSpoolAad,
  type AgentEvaluationCapabilityEffectProviderSpoolAad,
  type AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  type AgentEvaluationCapabilityEffectProviderSpoolReceipt,
} from '../evaluation/agentEvaluationCapabilityEffectProviderJournalSpool';
import {
  createAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  createAgentEvaluationCapabilityEffectProviderReadinessReceipt,
  createAgentEvaluationCapabilityEffectProviderRuntimeResult,
  createAgentEvaluationCapabilityEffectProviderStageRequest,
  type AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  type AgentEvaluationCapabilityEffectProviderRuntimeResult,
  type AgentEvaluationCapabilityEffectProviderStageRequest,
  type CreateAgentEvaluationCapabilityEffectProviderReadinessReceiptInput,
  type CreateAgentEvaluationCapabilityEffectProviderStageRequestInput,
} from '../evaluation/agentEvaluationCapabilityEffectProviderRuntime';
import { createAgentEvaluationProviderResultSpoolEnvelope } from '../evaluation/agentEvaluationEvidenceAuthenticity';
import type { AgentCapabilityProbeProgram } from '../providers/agentCapabilityProbeProgram';
import {
  decodeAgentNativeProviderCapabilityRuntimeResponse,
  type AgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
  type AgentNativeProviderCapabilityRuntimeResponseDecodeResult,
} from '../providers/agentNativeProviderCapabilityRuntime';
import type {
  AgentNativeProviderStateVaultRetirementReceipt,
  AgentNativeProviderStateVaultRetireRequest,
  AgentNativeProviderStateVaultSealReceipt,
  AgentNativeProviderStateVaultSealRequestProjection,
} from '../providers/agentNativeProviderStateVault';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';

export type AgentCapabilityEffectProviderRuntimeFixtureExecutionInput =
  Readonly<{
    requestMaterial: AgentNativeProviderCapabilityRuntimeRequestMaterial;
    cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null;
    transportOutcome: 'failed' | 'received' | 'timed-out';
    httpStatus: number | null;
    sealedResponseJson: AgentJsonValue | null;
    pollSequence: number;
    createdAt: string;
    startedAt: string;
    completedAt: string;
    observedAt: string;
    executedAt: string;
    dispatchState?: 'dispatched' | 'not-dispatched';
    errorCategory?: AgentEvaluationTransportErrorCategory;
    endpointId?: string;
    budgetReservationId?: string;
    providerRequestId?: string;
  }>;

export type CreateAgentCapabilityEffectProviderRuntimeJournalFixtureInput =
  Readonly<{
    program: AgentCapabilityProbeProgram;
    intent: AgentEvaluationCapabilityPreEffectIntent;
    readiness: CreateAgentEvaluationCapabilityEffectProviderReadinessReceiptInput;
    stage: Omit<
      CreateAgentEvaluationCapabilityEffectProviderStageRequestInput,
      'readinessReceipt' | 'requestProjection'
    >;
    executions: readonly AgentCapabilityEffectProviderRuntimeFixtureExecutionInput[];
    stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest | null;
    stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt | null;
    nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
    nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
    sealedAt: string;
  }>;

export type AgentCapabilityEffectProviderRuntimeJournalFixture = Readonly<{
  stageRequest: AgentEvaluationCapabilityEffectProviderStageRequest;
  stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
  executionReceipts: readonly AgentEvaluationCapabilityEffectProviderExecutionReceipt[];
  executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
  executionWrites: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionWrite[];
  responses: readonly AgentNativeProviderCapabilityRuntimeResponseDecodeResult[];
  spoolReceipts: readonly (AgentEvaluationCapabilityEffectProviderSpoolReceipt | null)[];
  runtimeResult: AgentEvaluationCapabilityEffectProviderRuntimeResult;
  resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord;
}>;

const encoder = new TextEncoder();

export type CreateAgentHostedRetrievalProviderResponseFixtureInput = Readonly<{
  protocolFamily: 'gemini-interactions' | 'openai-responses';
  responseId: string;
  citationResourceId: string | null;
  text?: string;
}>;

/**
 * Test-only real Provider response shape. A non-null citation is carried in
 * the protocol-owned annotation field and must name one runtime authority
 * resource; a null citation exercises the freshness-only path.
 */
export const createAgentHostedRetrievalProviderResponseFixture = (
  input: CreateAgentHostedRetrievalProviderResponseFixtureInput
): AgentJsonValue => {
  if (
    !isAgentControlIdentity(input.responseId) ||
    (input.citationResourceId !== null &&
      !isAgentControlIdentity(input.citationResourceId))
  ) {
    throw new TypeError(
      'Hosted retrieval Provider response fixture is invalid.'
    );
  }
  const text = input.text ?? 'prodivix-capability-probe-v1';
  if (input.protocolFamily === 'openai-responses') {
    return Object.freeze({
      object: 'response',
      id: input.responseId,
      status: 'completed',
      output: Object.freeze([
        Object.freeze({
          type: 'message',
          content: Object.freeze([
            Object.freeze({
              type: 'output_text',
              text,
              ...(input.citationResourceId === null
                ? {}
                : {
                    annotations: Object.freeze([
                      Object.freeze({
                        type: 'file_citation',
                        file_id: input.citationResourceId,
                      }),
                    ]),
                  }),
            }),
          ]),
        }),
      ]),
      usage: Object.freeze({
        input_tokens: 64,
        output_tokens: 8,
        input_tokens_details: Object.freeze({ cached_tokens: 0 }),
      }),
    });
  }
  return Object.freeze({
    id: input.responseId,
    status: 'completed',
    steps: Object.freeze([
      Object.freeze({
        type: 'model_output',
        text,
        content: Object.freeze([
          Object.freeze({
            type: 'text',
            text,
            ...(input.citationResourceId === null
              ? {}
              : {
                  annotations: Object.freeze([
                    Object.freeze({
                      type: 'file_citation',
                      document_uri: input.citationResourceId,
                    }),
                  ]),
                }),
          }),
        ]),
      }),
    ]),
    usage: Object.freeze({
      total_input_tokens: 64,
      total_output_tokens: 8,
      total_cached_tokens: 0,
    }),
  });
};

const base64UrlAlphabet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const base64Url = (bytes: Uint8Array): string => {
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset]!;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    const word =
      (first << 16) | ((second ?? 0) << 8) | (third === undefined ? 0 : third);
    encoded += base64UrlAlphabet[(word >>> 18) & 0x3f]!;
    encoded += base64UrlAlphabet[(word >>> 12) & 0x3f]!;
    if (second !== undefined) {
      encoded += base64UrlAlphabet[(word >>> 6) & 0x3f]!;
    }
    if (third !== undefined) {
      encoded += base64UrlAlphabet[word & 0x3f]!;
    }
  }
  return encoded;
};

const nonceFor = (sequence: number): string => {
  const bytes = new Uint8Array(12);
  bytes[8] = (sequence >>> 24) & 0xff;
  bytes[9] = (sequence >>> 16) & 0xff;
  bytes[10] = (sequence >>> 8) & 0xff;
  bytes[11] = sequence & 0xff;
  return base64Url(bytes);
};

const expectedExecutionCount = (
  bindingKind: AgentEvaluationCapabilityEffectProviderStageRequest['bindingKind'],
  observed: number
): boolean => {
  switch (bindingKind) {
    case 'hosted-retrieval-query':
    case 'opaque-continuation':
      return observed === 1;
    case 'provider-cache':
      return observed === 2;
    case 'provider-job':
      return observed >= 1 && observed <= 4;
  }
};

const createSpool = (input: {
  intent: AgentEvaluationCapabilityPreEffectIntent;
  stage: AgentEvaluationCapabilityEffectProviderStageRequest;
  executionSequence: number;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult;
}): Readonly<{
  aad: AgentEvaluationCapabilityEffectProviderSpoolAad | null;
  envelope: AgentEvaluationProviderResultSpoolEnvelope | null;
  envelopeAuthority: AgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority | null;
  receipt: AgentEvaluationCapabilityEffectProviderSpoolReceipt | null;
}> => {
  const projection = input.response.projection;
  if (projection.responseBodyDigest === null) {
    return Object.freeze({
      aad: null,
      envelope: null,
      envelopeAuthority: null,
      receipt: null,
    });
  }
  const aad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
    namespaceDigest: digestAgentCanonicalValue({
      namespaceId: input.intent.namespaceId,
    }),
    planDigest: input.intent.planDigest,
    repositoryCommit: input.intent.repositoryCommit,
    attemptId: input.intent.attemptId,
    descriptorDigest: input.intent.descriptorDigest,
    turnIndex: input.intent.turnIndex,
    invocationId: input.intent.invocationId,
    ownerRequestDigest: input.intent.ownerRequestDigest,
    stageDigest: input.stage.stageDigest,
    executionSequence: input.executionSequence,
    dispatchIntentDigest: input.dispatchIntentDigest,
    transportReceiptDigest: input.transportReceiptDigest,
    responseBodyDigest: projection.responseBodyDigest,
    responseProjectionDigest: projection.projectionDigest,
    responseDigest: projection.responseDigest,
    normalizedEventSetDigest: projection.normalizedEventSetDigest,
  });
  const envelope = createAgentEvaluationProviderResultSpoolEnvelope({
    spoolId: createAgentEvaluationCapabilityEffectProviderSpoolRef(aad),
    algorithm: 'aes-256-gcm',
    keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
    keyVersion: 1,
    keyRefDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
    encryptionProfileDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
    nonceBase64Url: nonceFor(input.executionSequence),
    authenticationTagBase64Url: base64Url(new Uint8Array(16)),
    ciphertextBase64Url: 'AQ',
    aadDigest: digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
  });
  const envelopeAuthority =
    createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
      envelope
    );
  const receipt = createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
    aad,
    envelopeAuthority,
    retentionPolicyDigest:
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
    createdAt: projection.observedAt,
    expiresAt: input.stage.expiresAt,
  });
  return Object.freeze({ aad, envelope, envelopeAuthority, receipt });
};

/**
 * Test-only canonical builder shared by the 14,040-case verifier and runtime
 * unit tests. Callers provide real profile-specific request/response and vault
 * authorities; this function owns every repeated journal/transport/spool join.
 */
export const createAgentCapabilityEffectProviderRuntimeJournalFixture = (
  input: CreateAgentCapabilityEffectProviderRuntimeJournalFixtureInput
): AgentCapabilityEffectProviderRuntimeJournalFixture => {
  const bindingKind = input.intent.inputAuthorityBinding.bindingKind;
  if (
    input.executions.length === 0 ||
    !expectedExecutionCount(bindingKind, input.executions.length)
  ) {
    throw new TypeError(
      'Capability effect Provider runtime fixture execution count is invalid.'
    );
  }
  const readiness =
    createAgentEvaluationCapabilityEffectProviderReadinessReceipt(
      input.intent,
      input.readiness
    );
  const stageRequest =
    createAgentEvaluationCapabilityEffectProviderStageRequest(
      input.program,
      input.intent,
      {
        ...input.stage,
        readinessReceipt: readiness,
        requestProjection: input.executions[0]!.requestMaterial.projection,
      }
    );
  const stageRecord =
    createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
      input.intent,
      stageRequest
    );
  const responses: AgentNativeProviderCapabilityRuntimeResponseDecodeResult[] =
    [];
  const executionReceipts: AgentEvaluationCapabilityEffectProviderExecutionReceipt[] =
    [];
  const executionRecords: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[] =
    [];
  const executionWrites: AgentEvaluationCapabilityEffectProviderJournalExecutionWrite[] =
    [];
  const spoolReceipts: (AgentEvaluationCapabilityEffectProviderSpoolReceipt | null)[] =
    [];
  let priorExecutionReceipt: AgentEvaluationCapabilityEffectProviderExecutionReceipt | null =
    null;
  let priorExecutionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null =
    null;

  for (const [index, executionInput] of input.executions.entries()) {
    const request = executionInput.requestMaterial.projection;
    const bodyDigest =
      executionInput.sealedResponseJson === null
        ? null
        : digestAgentCanonicalValue(executionInput.sealedResponseJson);
    const response = decodeAgentNativeProviderCapabilityRuntimeResponse(
      input.program,
      request,
      {
        transportOutcome: executionInput.transportOutcome,
        httpStatus: executionInput.httpStatus,
        responseBodyDigest: bodyDigest,
        sealedResponseJson: executionInput.sealedResponseJson,
        observedAt: executionInput.observedAt,
      }
    );
    const successful =
      executionInput.transportOutcome === 'received' &&
      executionInput.httpStatus !== null &&
      executionInput.httpStatus >= 200 &&
      executionInput.httpStatus < 300;
    const dispatchState =
      executionInput.dispatchState ??
      (executionInput.transportOutcome === 'failed'
        ? ('not-dispatched' as const)
        : ('dispatched' as const));
    const suffix = `${input.intent.ownerRequestDigest.slice('sha256-'.length)}.${executionInput.pollSequence}`;
    const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
      intentId: `provider-runtime-fixture-intent.${suffix}`,
      planDigest: input.intent.planDigest,
      repositoryCommit: input.intent.repositoryCommit,
      attemptId: input.intent.attemptId,
      descriptorDigest: input.intent.descriptorDigest,
      turnIndex: input.intent.turnIndex,
      protocolFamily: request.protocolFamily,
      providerConfigurationId: request.providerConfigurationId,
      modelLineageDigest: request.modelLineageDigest,
      inferenceConfigurationDigest: digestAgentCanonicalValue({
        programDigest: input.program.programDigest,
        requestDigest: request.requestDigest,
      }),
      invocationId: input.intent.invocationId,
      budgetReservationId:
        executionInput.budgetReservationId ??
        stageRequest.providerResourceAuthority?.budgetReservationAuthority
          .reservationId ??
        `provider-runtime-fixture-budget.${input.intent.ownerRequestDigest.slice('sha256-'.length)}`,
      demandDigest: input.intent.ownerRequestDigest,
      requestDigest: request.requestDigest,
      endpointId:
        executionInput.endpointId ??
        `provider-runtime-fixture-endpoint.${request.protocolFamily}`,
      endpointClass: 'first-party-hosted',
      requestBodyDigest: request.requestBodyDigest,
      requestBytes: request.requestBytes,
      createdAt: executionInput.createdAt,
    });
    const responseMetadata =
      executionInput.transportOutcome === 'received'
        ? {
            httpStatus: executionInput.httpStatus!,
            responseHeaderDigest: digestAgentCanonicalValue({
              fixtureResponseHeaders: suffix,
            }),
            ...(bodyDigest === null ? {} : { responseBodyDigest: bodyDigest }),
            ...(executionInput.providerRequestId === undefined && !successful
              ? {}
              : {
                  providerRequestId:
                    executionInput.providerRequestId ??
                    `provider-runtime-fixture-request.${suffix}`,
                }),
          }
        : {};
    const transportReceipt = createAgentEvaluationTransportReceipt({
      receiptId: `provider-runtime-fixture-transport.${suffix}`,
      protocolFamily: request.protocolFamily,
      providerConfigurationId: request.providerConfigurationId,
      invocationId: input.intent.invocationId,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      requestDigest: request.requestDigest,
      endpointId: dispatchIntent.endpointId,
      endpointClass: dispatchIntent.endpointClass,
      requestBodyDigest: request.requestBodyDigest,
      requestBytes: request.requestBytes,
      responseBytes:
        executionInput.sealedResponseJson === null
          ? 0
          : encoder.encode(JSON.stringify(executionInput.sealedResponseJson))
              .byteLength,
      sseEventCount: 0,
      dispatchState,
      outcome: successful ? 'completed' : 'failed',
      ...responseMetadata,
      ...(successful
        ? {}
        : {
            errorCategory:
              executionInput.errorCategory ??
              ('G4_RUNNER_TRANSPORT_FAILED' as const),
          }),
      startedAt: executionInput.startedAt,
      completedAt: executionInput.completedAt,
    });
    const spool = createSpool({
      intent: input.intent,
      stage: stageRequest,
      executionSequence: executionInput.pollSequence,
      dispatchIntentDigest: dispatchIntent.intentDigest,
      transportReceiptDigest: transportReceipt.receiptDigest,
      response,
    });
    const executionReceipt =
      createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
        input.program,
        input.intent,
        stageRequest,
        {
          requestProjection: request,
          cacheWarmAuthority: executionInput.cacheWarmAuthority,
          dispatchIntent,
          transportReceipt,
          resultSpoolReceipt: spool.receipt,
          responseProjection: response.projection,
          pollSequence: executionInput.pollSequence,
          priorExecutionReceipt,
          executedAt: executionInput.executedAt,
        }
      );
    const executionRecord =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord({
        stageRecord,
        executionReceipt,
        priorExecutionRecord,
        spoolAad: spool.aad,
        spoolEnvelopeAuthority: spool.envelopeAuthority,
      });
    const executionWrite =
      createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite(
        executionRecord,
        spool.envelope
      );
    responses.push(response);
    executionReceipts.push(executionReceipt);
    executionRecords.push(executionRecord);
    executionWrites.push(executionWrite);
    spoolReceipts.push(spool.receipt);
    priorExecutionReceipt = executionReceipt;
    priorExecutionRecord = executionRecord;
    if (
      executionReceipt.executionStatus !== 'in-progress' &&
      index !== input.executions.length - 1
    ) {
      throw new TypeError(
        'Capability effect Provider runtime fixture continued after a terminal execution.'
      );
    }
  }

  const terminalExecution = executionReceipts.at(-1)!;
  const terminalResponse = responses.at(-1)!;
  const runtimeResult =
    createAgentEvaluationCapabilityEffectProviderRuntimeResult(
      input.program,
      input.intent,
      stageRequest,
      terminalExecution,
      {
        response: terminalResponse,
        priorExecutionReceipt: executionReceipts.at(-2) ?? null,
        stateVaultRetireRequest: input.stateVaultRetireRequest,
        stateVaultRetirementReceipt: input.stateVaultRetirementReceipt,
        nextStateVaultSealRequest: input.nextStateVaultSealRequest,
        nextStateVaultSealReceipt: input.nextStateVaultSealReceipt,
        sealedAt: input.sealedAt,
      }
    );
  const dispositionReceipts = spoolReceipts.flatMap((receipt) =>
    receipt === null
      ? []
      : [
          createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt({
            spoolRef: receipt.spoolRef,
            spoolReceiptDigest: receipt.receiptDigest,
            planDigest: receipt.planDigest,
            repositoryCommit: receipt.repositoryCommit,
            attemptId: receipt.attemptId,
            descriptorDigest: receipt.descriptorDigest,
            turnIndex: receipt.turnIndex,
            invocationId: receipt.invocationId,
            ownerRequestDigest: receipt.ownerRequestDigest,
            stageDigest: receipt.stageDigest,
            executionSequence: receipt.executionSequence,
            disposition: 'consumed-and-destroyed',
            resultSealReceiptDigest:
              runtimeResult.resultSealReceipt.receiptDigest,
            abandonmentReason: null,
            retentionPolicyDigest: receipt.retentionPolicyDigest,
            disposedAt: input.sealedAt,
          }),
        ]
  );
  const resultRecord =
    createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
      stageRecord,
      executionRecords,
      businessResult: runtimeResult.businessResult,
      effectSourceFact: runtimeResult.fact,
      stateVaultRetireRequest: input.stateVaultRetireRequest,
      stateVaultRetirementReceipt: input.stateVaultRetirementReceipt,
      nextStateVaultSealRequest: input.nextStateVaultSealRequest,
      nextStateVaultSealReceipt: input.nextStateVaultSealReceipt,
      resultSealReceipt: runtimeResult.resultSealReceipt,
      spoolDispositionReceipts: dispositionReceipts,
    });
  return Object.freeze({
    stageRequest,
    stageRecord,
    executionReceipts: Object.freeze(executionReceipts),
    executionRecords: Object.freeze(executionRecords),
    executionWrites: Object.freeze(executionWrites),
    responses: Object.freeze(responses),
    spoolReceipts: Object.freeze(spoolReceipts),
    runtimeResult,
    resultRecord,
  });
};

export const finalizeAgentCapabilityEffectProviderRuntimeJournalFixture = (
  fixture: AgentCapabilityEffectProviderRuntimeJournalFixture,
  effectSourceReceiptDigest: CanonicalDigest
): AgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord =>
  createAgentEvaluationCapabilityEffectProviderRuntimeArchiveRecord({
    stageRecord: fixture.stageRecord,
    executionRecords: fixture.executionRecords,
    resultRecord: fixture.resultRecord,
    effectSourceReceiptDigest,
  });
