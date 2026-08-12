import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProgram,
} from '../providers/agentCapabilityProbeProgram';
import {
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import type { AgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluation.types';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentEvaluationProviderCapabilityObservationSanitization,
  type AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
} from './agentEvaluationProviderCapabilityObservation';

export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-request' as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-receipt' as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_STAGE_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-stage' as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-dispatch-ack' as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION =
  1 as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_MAXIMUM_BYTES =
  32_768 as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_MAXIMUM_SEAL_DELAY_MS =
  30_000 as const;

export type AgentEvaluationNativeOptionalCapabilityBootstrapOutcome =
  'observed' | 'unavailable' | 'failed';

export type AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact =
  Extract<
    AgentEvaluationProviderCapabilitySharedObservedFact,
    Readonly<{
      factKind:
        | 'opaque-continuation'
        | 'provider-cache-receipt'
        | 'provider-job-receipt';
    }>
  >;

export type AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_REQUEST_FORMAT;
    version: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    turnIndex: number;
    invocationId: string;
    providerRequestDigest: CanonicalDigest;
    providerResponseDigest: CanonicalDigest;
    protocolFamily:
      'anthropic-messages' | 'gemini-interactions' | 'openai-responses';
    providerConfigurationId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    resultSpoolReceiptDigest: CanonicalDigest;
    normalizedEventSetDigest: CanonicalDigest;
    transportCompletedAt: Instant;
    runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
    probeProgramDigest: CanonicalDigest;
    outcome: AgentEvaluationNativeOptionalCapabilityBootstrapOutcome;
    nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
    nativeSourceReceiptDigest: CanonicalDigest | null;
    fact: AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact | null;
    observedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput =
  Omit<
    AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
    | 'format'
    | 'version'
    | 'probeProgramDigest'
    | 'nativeSourceReceiptDigest'
    | 'fact'
    | 'requestDigest'
  >;

/**
 * This receipt becomes authoritative only after its request, raw Provider
 * preimage, registered source owner, stage, and ACK are durably joined by
 * 8790. Its self-digests provide canonical bytes and do not grant support.
 */
export type AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_RECEIPT_FORMAT;
    version: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION;
    sourceRequest: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest;
    sourceRequestDigest: CanonicalDigest;
    sourceOwnerStageDigest: CanonicalDigest;
    sourceOwnerDispatchAckDigest: CanonicalDigest;
    sealedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceiptInput =
  Readonly<{
    sourceRequest: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest;
    sealedAt: Instant;
  }>;

const sourceRequestInputKeys = Object.freeze([
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'turnIndex',
  'invocationId',
  'providerRequestDigest',
  'providerResponseDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelLineageDigest',
  'adapterDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'transportCompletedAt',
  'runtimeFactSourceAuthority',
  'outcome',
  'nativeSourceReceipt',
  'observedAt',
] as const);

const sourceRequestKeys = Object.freeze([
  'format',
  'version',
  ...sourceRequestInputKeys,
  'probeProgramDigest',
  'nativeSourceReceiptDigest',
  'fact',
  'requestDigest',
] as const);

const sourceReceiptKeys = Object.freeze([
  'format',
  'version',
  'sourceRequest',
  'sourceRequestDigest',
  'sourceOwnerStageDigest',
  'sourceOwnerDispatchAckDigest',
  'sealedAt',
  'receiptDigest',
] as const);

const capabilityIdByProfile = Object.freeze({
  'g4-provider-background-job': 'provider.background-job',
  'g4-provider-isolated-cache': 'provider.isolated-cache',
  'g4-provider-reasoning-continuation': 'provider.reasoning-continuation',
} as const);

const emptySanitization = Object.freeze({
  protectedMaterialCanaries: Object.freeze([]),
  secretCanaries: Object.freeze([]),
});

const isSafeBootstrapValue = (
  value: unknown,
  sanitization: AgentEvaluationProviderCapabilityObservationSanitization
): boolean =>
  inspectAgentControlJson(
    value,
    AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_MAXIMUM_BYTES
  ).length === 0 &&
  !containsAgentControlCredentialLikeText(canonicalJsonText(value)) &&
  (sanitization.protectedMaterialCanaries.length === 0 ||
    scanAgentArtifactForProtectedHoldoutLeak(
      value,
      sanitization.protectedMaterialCanaries
    ).length === 0) &&
  (sanitization.secretCanaries.length === 0 ||
    scanAgentArtifactForSecretCanaries(value, sanitization.secretCanaries)
      .length === 0);

const observedFactFromNativeReceipt = (
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt
): AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact => {
  switch (receipt.fact.factType) {
    case 'provider-job-receipt':
    case 'provider-cache-receipt':
      return Object.freeze({
        factKind: receipt.fact.factType,
        factDigest: receipt.fact.value.receiptDigest,
        value: receipt.fact.value,
      }) as AgentEvaluationNativeOptionalCapabilityBootstrapObservedFact;
    case 'opaque-continuation':
      return Object.freeze({
        factKind: receipt.fact.factType,
        factDigest: receipt.fact.value.continuationDigest,
        value: receipt.fact.value,
      });
  }
};

const sourceRequestBase = (
  input: Omit<
    AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
    'requestDigest'
  >
) => Object.freeze({ ...input });

export const digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest =
  (
    input: Omit<
      AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
      'requestDigest'
    >
  ): CanonicalDigest => digestAgentCanonicalValue(sourceRequestBase(input));

const runtimeAuthorityMatchesRequest = (
  authority: AgentEvaluationRuntimeFactSourceAuthority,
  program: AgentCapabilityProbeProgram,
  input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput
): boolean => {
  const expectedCapabilityId =
    capabilityIdByProfile[
      program.profileProjection
        .capabilityProfileId as keyof typeof capabilityIdByProfile
    ];
  return (
    expectedCapabilityId !== undefined &&
    authority.kind === 'shared-durable-capability' &&
    authority.sourceKind === 'sealed-provider-response-metadata' &&
    authority.capabilityProfileId ===
      program.profileProjection.capabilityProfileId &&
    authority.capabilityProfileDigest ===
      program.profileProjection.capabilityProfileDigest &&
    authority.capabilityId === expectedCapabilityId &&
    authority.protocolFamily === input.protocolFamily &&
    authority.providerConfigurationId === input.providerConfigurationId &&
    authority.modelLineageDigest === input.modelLineageDigest &&
    authority.adapterDigest === input.adapterDigest
  );
};

export const createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest =
  (
    program: AgentCapabilityProbeProgram,
    input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput,
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
  ): AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest => {
    if (
      !isAgentCapabilityProbeProgram(program) ||
      !hasExactAgentControlKeys(input, sourceRequestInputKeys) ||
      ![
        'anthropic-messages',
        'gemini-interactions',
        'openai-responses',
      ].includes(input.protocolFamily) ||
      !['observed', 'unavailable', 'failed'].includes(input.outcome) ||
      ![
        input.namespaceId,
        input.attemptId,
        input.invocationId,
        input.providerConfigurationId,
      ].every(isAgentControlIdentity) ||
      !/^[0-9a-f]{40}$/u.test(input.repositoryCommit) ||
      !Number.isSafeInteger(input.turnIndex) ||
      input.turnIndex < 0 ||
      input.turnIndex >= 7 ||
      ![
        input.planDigest,
        input.descriptorDigest,
        input.providerRequestDigest,
        input.providerResponseDigest,
        input.modelLineageDigest,
        input.adapterDigest,
        input.dispatchIntentDigest,
        input.transportReceiptDigest,
        input.resultSpoolReceiptDigest,
        input.normalizedEventSetDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlInstant(input.transportCompletedAt) ||
      !isAgentControlInstant(input.observedAt) ||
      Date.parse(input.observedAt) < Date.parse(input.transportCompletedAt) ||
      Date.parse(input.observedAt) - Date.parse(input.transportCompletedAt) >
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_MAXIMUM_SEAL_DELAY_MS
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source request is invalid.'
      );
    }
    let runtimeFactSourceAuthority: AgentEvaluationRuntimeFactSourceAuthority;
    try {
      const { authorityDigest: _authorityDigest, ...authorityInput } =
        input.runtimeFactSourceAuthority;
      runtimeFactSourceAuthority =
        createAgentEvaluationRuntimeFactSourceAuthority(authorityInput);
    } catch {
      throw new TypeError(
        'Native optional capability bootstrap source authority is invalid.'
      );
    }
    if (
      !sameCanonicalJson(
        runtimeFactSourceAuthority,
        input.runtimeFactSourceAuthority
      ) ||
      !runtimeAuthorityMatchesRequest(
        runtimeFactSourceAuthority,
        program,
        input
      )
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source authority drifted.'
      );
    }
    const observed = input.outcome === 'observed';
    if (
      observed !== (input.nativeSourceReceipt !== null) ||
      (input.nativeSourceReceipt !== null &&
        (!isAgentNativeProviderOptionalCapabilitySourceReceipt(
          input.nativeSourceReceipt,
          program
        ) ||
          input.nativeSourceReceipt.protocolFamily !== input.protocolFamily ||
          input.nativeSourceReceipt.capabilityProfileId !==
            program.profileProjection.capabilityProfileId ||
          input.nativeSourceReceipt.capabilityProfileDigest !==
            program.profileProjection.capabilityProfileDigest ||
          input.nativeSourceReceipt.invocationId !== input.invocationId ||
          input.nativeSourceReceipt.requestDigest !==
            input.providerRequestDigest ||
          input.nativeSourceReceipt.responseDigest !==
            input.providerResponseDigest ||
          input.nativeSourceReceipt.providerConfigurationId !==
            input.providerConfigurationId ||
          input.nativeSourceReceipt.modelLineageDigest !==
            input.modelLineageDigest ||
          input.nativeSourceReceipt.adapterDigest !== input.adapterDigest ||
          input.nativeSourceReceipt.observedAt !== input.observedAt))
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source receipt drifted.'
      );
    }
    const nativeSourceReceiptDigest =
      input.nativeSourceReceipt?.receiptDigest ?? null;
    const fact =
      input.nativeSourceReceipt === null
        ? null
        : observedFactFromNativeReceipt(input.nativeSourceReceipt);
    const base = sourceRequestBase({
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_REQUEST_FORMAT,
      version: AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION,
      ...input,
      runtimeFactSourceAuthority,
      probeProgramDigest: program.programDigest,
      nativeSourceReceiptDigest,
      fact,
    });
    const request = Object.freeze({
      ...base,
      requestDigest:
        digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
          base
        ),
    });
    if (!isSafeBootstrapValue(request, sanitization)) {
      throw new TypeError(
        'Native optional capability bootstrap source request is unsafe or unbounded.'
      );
    }
    return request;
  };

export const isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
): value is AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest => {
  if (!hasExactAgentControlKeys(value, sourceRequestKeys)) return false;
  try {
    const request =
      value as AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest;
    const {
      format: _format,
      version: _version,
      probeProgramDigest: _probeProgramDigest,
      nativeSourceReceiptDigest: _nativeSourceReceiptDigest,
      fact: _fact,
      requestDigest: _requestDigest,
      ...input
    } = request;
    return sameCanonicalJson(
      request,
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        input,
        sanitization
      )
    );
  } catch {
    return false;
  }
};

export const projectAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage =
  (request: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest) =>
    Object.freeze({
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_STAGE_FORMAT,
      version: AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION,
      sourceRequestDigest: request.requestDigest,
      sourceAuthorityId: request.runtimeFactSourceAuthority.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        request.runtimeFactSourceAuthority.sourceAuthorityImplementationDigest,
      registrationReceiptDigest:
        request.runtimeFactSourceAuthority.registrationReceiptDigest,
      runtimeFactSourceAuthorityDigest:
        request.runtimeFactSourceAuthority.authorityDigest,
    });

export const digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage =
  (
    request: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest
  ): CanonicalDigest =>
    digestAgentCanonicalValue(
      projectAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage(
        request
      )
    );

export const projectAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck =
  (
    request: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
    sourceOwnerStageDigest: CanonicalDigest,
    sealedAt: Instant
  ) =>
    Object.freeze({
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_DISPATCH_ACK_FORMAT,
      version: AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION,
      sourceRequestDigest: request.requestDigest,
      sourceOwnerStageDigest,
      outcome: request.outcome,
      nativeSourceReceiptDigest: request.nativeSourceReceiptDigest,
      factDigest: request.fact?.factDigest ?? null,
      sealedAt,
    });

export const digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck =
  (
    request: AgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
    sourceOwnerStageDigest: CanonicalDigest,
    sealedAt: Instant
  ): CanonicalDigest =>
    digestAgentCanonicalValue(
      projectAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck(
        request,
        sourceOwnerStageDigest,
        sealedAt
      )
    );

export const createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt =
  (
    program: AgentCapabilityProbeProgram,
    input: CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceiptInput,
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
  ): AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt => {
    if (
      !hasExactAgentControlKeys(input, ['sourceRequest', 'sealedAt']) ||
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        input.sourceRequest,
        program,
        sanitization
      ) ||
      !isAgentControlInstant(input.sealedAt) ||
      Date.parse(input.sealedAt) < Date.parse(input.sourceRequest.observedAt) ||
      Date.parse(input.sealedAt) - Date.parse(input.sourceRequest.observedAt) >
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_MAXIMUM_SEAL_DELAY_MS
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source receipt is invalid.'
      );
    }
    const sourceOwnerStageDigest =
      digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage(
        input.sourceRequest
      );
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_RECEIPT_FORMAT,
      version: AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_VERSION,
      sourceRequest: input.sourceRequest,
      sourceRequestDigest: input.sourceRequest.requestDigest,
      sourceOwnerStageDigest,
      sourceOwnerDispatchAckDigest:
        digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck(
          input.sourceRequest,
          sourceOwnerStageDigest,
          input.sealedAt
        ),
      sealedAt: input.sealedAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (!isSafeBootstrapValue(receipt, sanitization)) {
      throw new TypeError(
        'Native optional capability bootstrap source receipt is unsafe or unbounded.'
      );
    }
    return receipt;
  };

export const isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt = (
  value: unknown,
  program: AgentCapabilityProbeProgram,
  sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
): value is AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt => {
  if (!hasExactAgentControlKeys(value, sourceReceiptKeys)) return false;
  try {
    const receipt =
      value as AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt;
    return sameCanonicalJson(
      receipt,
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        {
          sourceRequest: receipt.sourceRequest,
          sealedAt: receipt.sealedAt,
        },
        sanitization
      )
    );
  } catch {
    return false;
  }
};

/** ACK-loss reconciliation returns the already persisted canonical bytes. */
export const reconcileAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt =
  (
    program: AgentCapabilityProbeProgram,
    persistedReceipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt | null,
    returnedReceipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
  ): AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt => {
    if (
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        returnedReceipt,
        program,
        sanitization
      )
    ) {
      throw new TypeError(
        'Returned native optional capability bootstrap source receipt is invalid.'
      );
    }
    if (persistedReceipt === null) return returnedReceipt;
    if (
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        persistedReceipt,
        program,
        sanitization
      ) ||
      !sameCanonicalJson(persistedReceipt, returnedReceipt)
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source reconciliation drifted.'
      );
    }
    return persistedReceipt;
  };

/**
 * Builds the shared runtime envelope only after 8790 has sealed the native
 * Provider preimage. Missing or failed native facts leave terminal/usage
 * evidence as the turn's fail-closed observation.
 */
export const createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt =
  (
    program: AgentCapabilityProbeProgram,
    receipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization = emptySanitization
  ): AgentEvaluationProviderCapabilityRuntimeFactEnvelope | null => {
    if (
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        receipt,
        program,
        sanitization
      )
    ) {
      throw new TypeError(
        'Native optional capability bootstrap source receipt is invalid.'
      );
    }
    const request = receipt.sourceRequest;
    if (request.outcome !== 'observed') return null;
    const fact = request.fact;
    if (fact === null) {
      throw new TypeError(
        'Observed native optional capability bootstrap fact is missing.'
      );
    }
    return createAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
      {
        sourceAuthorityKind: 'shared-durable-capability',
        sourceAuthorityId: request.runtimeFactSourceAuthority.sourceAuthorityId,
        sourceAuthorityImplementationDigest:
          request.runtimeFactSourceAuthority
            .sourceAuthorityImplementationDigest,
        sourceKind: request.runtimeFactSourceAuthority.sourceKind,
        routeBinding: request.runtimeFactSourceAuthority.routeBinding,
        registrationAuthorityIssuerId:
          request.runtimeFactSourceAuthority.registrationAuthorityIssuerId,
        registrationReceiptDigest:
          request.runtimeFactSourceAuthority.registrationReceiptDigest,
        runtimeFactSourceAuthorityDigest:
          request.runtimeFactSourceAuthority.authorityDigest,
        stageDigest: receipt.sourceOwnerStageDigest,
        dispatchAckDigest: receipt.sourceOwnerDispatchAckDigest,
        planDigest: request.planDigest,
        repositoryCommit: request.repositoryCommit,
        attemptId: request.attemptId,
        descriptorDigest: request.descriptorDigest,
        turnIndex: request.turnIndex,
        invocationId: request.invocationId,
        requestDigest: request.providerRequestDigest,
        responseDigest: request.providerResponseDigest,
        protocolFamily: request.protocolFamily,
        providerConfigurationId: request.providerConfigurationId,
        modelLineageDigest: request.modelLineageDigest,
        adapterDigest: request.adapterDigest,
        dispatchIntentDigest: request.dispatchIntentDigest,
        transportReceiptDigest: request.transportReceiptDigest,
        resultSpoolReceiptDigest: request.resultSpoolReceiptDigest,
        normalizedEventSetDigest: request.normalizedEventSetDigest,
        observedAt: request.observedAt,
        fact,
      },
      sanitization
    );
  };
