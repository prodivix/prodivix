import {
  createAgentNativeProviderStateVaultOpaqueRef,
  createAgentNativeProviderStateVaultResolveReceipt,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  digestAgentCanonicalValue,
  digestAgentNativeProviderStateReference,
  type AgentNativeProviderStateVaultPurpose,
  type AgentNativeProviderStateVaultProtocol,
  type CanonicalDigest,
} from '@prodivix/ai';

export type AgentEvaluationTestStateVaultSeal = Readonly<{
  callbackLocalProviderStateHandle: string;
  sealRequest: ReturnType<
    typeof createAgentNativeProviderStateVaultSealRequest
  >;
  sealReceipt: ReturnType<
    typeof createAgentNativeProviderStateVaultSealReceipt
  >;
}>;

export const createAgentEvaluationTestStateVaultSeal = (input: {
  purpose: AgentNativeProviderStateVaultPurpose;
  attemptId: string;
  protocolFamily: AgentNativeProviderStateVaultProtocol;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  taskId: string;
  runId: string;
  generation: number;
  observedAt: string;
  expiresAt: string;
  callbackLocalProviderStateHandle?: string;
  authorityDigest?: CanonicalDigest;
  probeProgramDigest?: CanonicalDigest;
  capabilityProfileDigest?: CanonicalDigest;
}): AgentEvaluationTestStateVaultSeal => {
  const callbackLocalProviderStateHandle =
    input.callbackLocalProviderStateHandle ??
    `provider-state.${input.invocationId}`;
  const sealRequest = createAgentNativeProviderStateVaultSealRequest({
    authorityDigest:
      input.authorityDigest ??
      digestAgentCanonicalValue({ fixture: 'state-vault-authority' }),
    purpose: input.purpose,
    attemptId: input.attemptId,
    protocolFamily: input.protocolFamily,
    providerStateReferenceKind:
      input.protocolFamily === 'openai-responses'
        ? 'response-id'
        : 'interaction-id',
    providerStateReferenceDigest: digestAgentNativeProviderStateReference(
      input.protocolFamily === 'openai-responses'
        ? 'response-id'
        : 'interaction-id',
      callbackLocalProviderStateHandle
    ),
    probeProgramDigest:
      input.probeProgramDigest ??
      digestAgentCanonicalValue({ fixture: 'state-vault-probe-program' }),
    capabilityProfileDigest:
      input.capabilityProfileDigest ??
      digestAgentCanonicalValue({ fixture: 'state-vault-profile' }),
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    responseDigest: input.responseDigest,
    responseBodyDigest: digestAgentCanonicalValue({
      fixture: 'state-vault-response-body',
      responseDigest: input.responseDigest,
    }),
    sealedResponseJsonDigest: digestAgentCanonicalValue({
      fixture: 'state-vault-sealed-response-json',
      responseDigest: input.responseDigest,
    }),
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    taskId: input.taskId,
    runId: input.runId,
    generation: input.generation,
    observedAt: input.observedAt,
    expiresAt: input.expiresAt,
  });
  const stateKeyCreationReceiptDigest = digestAgentCanonicalValue({
    fixture: 'state-vault-data-key-created',
    sealRequestDigest: sealRequest.sealRequestDigest,
  });
  const sealReceipt = createAgentNativeProviderStateVaultSealReceipt(
    sealRequest,
    {
      status: 'sealed',
      opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
        authorityDigest: sealRequest.authorityDigest,
        sealRequestDigest: sealRequest.sealRequestDigest,
        stateKeyCreationReceiptDigest,
      }),
      stateKeyCreationReceiptDigest,
      sealedAt: input.observedAt,
    }
  );
  return Object.freeze({
    callbackLocalProviderStateHandle,
    sealRequest,
    sealReceipt,
  });
};

export const createAgentEvaluationTestStateVaultConsumedLifecycle = (
  seal: AgentEvaluationTestStateVaultSeal,
  input: {
    consumerAttemptId: string;
    consumerInvocationId: string;
    requestedAt: string;
  }
) => {
  const resolveRequest = createAgentNativeProviderStateVaultResolveRequest({
    sealRequest: seal.sealRequest,
    sealReceipt: seal.sealReceipt,
    consumerAttemptId: input.consumerAttemptId,
    consumerInvocationId: input.consumerInvocationId,
    consumerGeneration: seal.sealRequest.generation,
    requestedAt: input.requestedAt,
  });
  const resolveReceipt = createAgentNativeProviderStateVaultResolveReceipt(
    resolveRequest,
    {
      status: 'resolved',
      callbackLocalProviderStateHandle: seal.callbackLocalProviderStateHandle,
      resolvedAt: input.requestedAt,
    }
  );
  const retireRequest = createAgentNativeProviderStateVaultRetireRequest({
    sealRequest: seal.sealRequest,
    sealReceipt: seal.sealReceipt,
    resolveRequest,
    resolveReceipt,
    disposition: 'consumed',
    requestedAt: input.requestedAt,
  });
  const retirementReceipt =
    createAgentNativeProviderStateVaultRetirementReceipt(
      retireRequest,
      seal.sealRequest,
      seal.sealReceipt,
      {
        status: 'retired',
        stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
          fixture: 'state-vault-data-key-destroyed',
          retireRequestDigest: retireRequest.retireRequestDigest,
        }),
        opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
          fixture: 'state-vault-record-deleted',
          retireRequestDigest: retireRequest.retireRequestDigest,
        }),
        retiredAt: input.requestedAt,
      }
    );
  return Object.freeze({
    stateVaultResolveRequest: resolveRequest,
    stateVaultResolveReceipt: resolveReceipt,
    stateVaultRetireRequest: retireRequest,
    stateVaultRetirementReceipt: retirementReceipt,
  });
};
