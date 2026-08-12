import {
  createAgentNativeProviderStateVaultSealReceipt,
  createAgentNativeProviderStateVaultSealRequest,
  createAgentNativeProviderStateVaultResolveRequest,
  createAgentNativeProviderStateVaultRetireRequest,
  digestAgentNativeProviderStateReference,
  isAgentNativeProviderStateVaultAuthority,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  resolveAgentNativeProviderStateVaultState,
  retireAgentNativeProviderStateVaultState,
  type AgentCapabilityProbeProgram,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderRuntimeFactSanitization,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
  type AgentNativeProviderCapabilityRuntimeResponseDecodeResult,
  type AgentNativeProviderStateVaultAuthority,
  type AgentNativeProviderStateVaultPort,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultResolveRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultSealRequestProjection,
  type CanonicalDigest,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentEvaluationProductionSharedEffectExecutionMaterial,
  AgentEvaluationProductionSharedEffectExternalOwnerHealth,
  AgentEvaluationProductionSharedEffectStatefulOwner,
} from './productionSharedEffectExecutor';
import type { AgentEvaluationProductionNativeProviderStateVaultHealthReader } from './productionNativeProviderStateVaultHealthClient';
import type {
  AgentEvaluationProductionSharedEffectBinding,
  AgentEvaluationProductionSharedEffectHealthInput,
  AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';

export type AgentEvaluationProductionSharedEffectStatefulTransportMaterial =
  Omit<
    AgentEvaluationProductionSharedEffectExecutionMaterial,
    'stateVaultResolveRequest' | 'stateVaultResolveReceipt'
  >;

/**
 * The effect transport receives the official Provider state handle only for
 * one callback. Its readiness receipt covers both Provider execution and the
 * purpose-bound 8790 vault lifecycle.
 */
export type AgentEvaluationProductionSharedEffectStatefulTransport = Readonly<{
  authorityKind: 'production-native-provider-state-shared-effect';
  readinessAuthority: 'state-vault-and-provider-effect-owner';
  execute(
    input: Readonly<{
      binding: AgentEvaluationProductionSharedEffectBinding;
      stage: AgentEvaluationProductionSharedEffectStage;
      program: AgentCapabilityProbeProgram;
      nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt;
      callbackLocalProviderStateHandle: string;
      stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest;
      stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt;
      vaultOwnerInstanceId: string;
      vaultHealthDigest: CanonicalDigest;
      completeStateLifecycle(input: {
        requestMaterial: AgentNativeProviderCapabilityRuntimeRequestMaterial;
        response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult;
        executionStatus: 'completed' | 'failed' | 'unavailable';
      }): Promise<
        Readonly<{
          stateVaultRetireRequest: AgentNativeProviderStateVaultRetireRequest;
          stateVaultRetirementReceipt: AgentNativeProviderStateVaultRetirementReceipt;
          nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null;
          nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null;
          sealedAt: string;
        }>
      >;
    }>
  ): Promise<
    AgentEvaluationProductionSharedEffectStatefulTransportMaterial | undefined
  >;
  checkReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}>;

export type CreateProductionAgentEvaluationSharedEffectStatefulOwnerInput =
  Readonly<{
    expectedVaultAuthority: AgentNativeProviderStateVaultAuthority;
    stateVaultFor(
      binding: AgentEvaluationProductionSharedEffectBinding
    ): AgentNativeProviderStateVaultPort;
    stateVaultHealth: AgentEvaluationProductionNativeProviderStateVaultHealthReader;
    transport: AgentEvaluationProductionSharedEffectStatefulTransport;
    forbiddenCanaries: () => readonly string[];
    clock?: () => Date;
  }>;

const cleanReceipt = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

const fail = (code: string): never => {
  throw new TypeError(
    `G4_PRODUCTION_SHARED_EFFECT_STATEFUL_OWNER_INVALID: ${code}`
  );
};

const nativeSourceMatchesVault = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt,
  expectedAuthority: AgentNativeProviderStateVaultAuthority,
  sanitization: AgentNativeProviderRuntimeFactSanitization
) => {
  const authority = binding.toolInput.preEffectIntent.inputAuthorityBinding;
  const sealRequest = authority.stateVaultSealRequest;
  const sealReceipt = authority.stateVaultSealReceipt;
  if (
    !sealRequest ||
    !sealReceipt ||
    !isAgentNativeProviderStateVaultSealRequest(sealRequest) ||
    !isAgentNativeProviderStateVaultSealReceipt(
      sealReceipt,
      sealRequest,
      sanitization
    ) ||
    sealReceipt.status !== 'sealed' ||
    sealRequest.authorityDigest !== expectedAuthority.authorityDigest ||
    sealRequest.attemptId !== binding.toolInput.attemptId ||
    sealRequest.invocationId !== authority.sourceInvocationId ||
    sealRequest.requestDigest !== authority.sourceProviderRequestDigest ||
    sealRequest.responseDigest !== authority.sourceResponseDigest ||
    sealRequest.providerConfigurationId !==
      binding.sourceIdentity.providerConfigurationId ||
    sealRequest.modelLineageDigest !==
      binding.sourceIdentity.modelLineageDigest ||
    sealRequest.adapterDigest !== binding.sourceIdentity.adapterDigest ||
    receipt.invocationId !== sealRequest.invocationId ||
    receipt.requestDigest !== sealRequest.requestDigest ||
    receipt.responseDigest !== sealRequest.responseDigest ||
    !sameCanonicalJson(
      receipt.executionIdentityAuthority,
      Object.freeze({
        format: receipt.executionIdentityAuthority.format,
        version: receipt.executionIdentityAuthority.version,
        invocationId: sealRequest.invocationId,
        taskId: sealRequest.taskId,
        runId: sealRequest.runId,
        generation: sealRequest.generation,
        authorityDigest: receipt.executionIdentityAuthority.authorityDigest,
      })
    )
  ) {
    return undefined;
  }
  const source = receipt.source;
  const background =
    binding.sourceIdentity.capabilityId === 'provider.background-job';
  const continuation =
    binding.sourceIdentity.capabilityId === 'provider.reasoning-continuation';
  if (
    (!background && !continuation) ||
    (background &&
      (sealRequest.purpose !== 'background-job-state' ||
        source.sourceKind !== 'provider-job-active-status')) ||
    (continuation &&
      (sealRequest.purpose !== 'reasoning-continuation-state' ||
        source.sourceKind !== 'provider-stored-continuation')) ||
    (source.sourceKind !== 'provider-job-active-status' &&
      source.sourceKind !== 'provider-stored-continuation') ||
    source.providerStateReferenceDigest !==
      sealRequest.providerStateReferenceDigest ||
    source.opaqueProviderStateRef !== sealReceipt.opaqueProviderStateRef ||
    source.stateVaultAuthorityDigest !== sealRequest.authorityDigest ||
    source.stateVaultSealRequestDigest !== sealRequest.sealRequestDigest ||
    source.stateVaultSealReceiptDigest !== sealReceipt.receiptDigest ||
    source.taskId !== sealRequest.taskId ||
    source.runId !== sealRequest.runId ||
    source.generation !== sealRequest.generation
  ) {
    return undefined;
  }
  return Object.freeze({ sealRequest, sealReceipt });
};

export const createProductionAgentEvaluationSharedEffectStatefulOwner = (
  input: CreateProductionAgentEvaluationSharedEffectStatefulOwnerInput
): AgentEvaluationProductionSharedEffectStatefulOwner => {
  if (
    !isAgentNativeProviderStateVaultAuthority(input.expectedVaultAuthority) ||
    typeof input.stateVaultFor !== 'function' ||
    !isAgentNativeProviderStateVaultAuthority(
      input.stateVaultHealth?.authority
    ) ||
    !sameCanonicalJson(
      input.stateVaultHealth.authority,
      input.expectedVaultAuthority
    ) ||
    typeof input.stateVaultHealth.readHealth !== 'function' ||
    input.transport?.authorityKind !==
      'production-native-provider-state-shared-effect' ||
    input.transport.readinessAuthority !==
      'state-vault-and-provider-effect-owner' ||
    ![
      input.transport.execute,
      input.transport.checkReadiness,
      input.transport.close,
    ].every((candidate) => typeof candidate === 'function') ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('composition');
  }
  const clock = input.clock ?? (() => new Date());
  const sanitization = (): AgentNativeProviderRuntimeFactSanitization =>
    Object.freeze({
      protectedMaterialCanaries: Object.freeze([...input.forbiddenCanaries()]),
      secretCanaries: Object.freeze([...input.forbiddenCanaries()]),
    });
  const nowInstant = () => {
    const now = clock();
    if (!Number.isFinite(now.getTime())) return fail('clock');
    return now.toISOString();
  };
  let closed = false;
  let active = 0;
  let closePromise: Promise<typeof cleanReceipt> | undefined;

  const owner: AgentEvaluationProductionSharedEffectStatefulOwner = {
    lifecycle: 'callback-bound-resolve-effect-retire' as const,
    async execute(executionInput) {
      const { binding, stage, program, nativeSourceReceipt } = executionInput;
      if (closed) return fail('closed');
      const vaultSource = nativeSourceMatchesVault(
        binding,
        nativeSourceReceipt,
        input.expectedVaultAuthority,
        sanitization()
      );
      if (!vaultSource) return undefined;
      const stateVault = input.stateVaultFor(binding);
      if (
        !isAgentNativeProviderStateVaultAuthority(stateVault?.authority) ||
        !sameCanonicalJson(
          stateVault.authority,
          input.expectedVaultAuthority
        ) ||
        ![
          stateVault.resolve,
          stateVault.retire,
          stateVault.lookupRetirementReceipt,
        ].every((candidate) => typeof candidate === 'function')
      ) {
        return fail('state-vault-port');
      }
      active += 1;
      try {
        const resolveRequest =
          createAgentNativeProviderStateVaultResolveRequest({
            sealRequest: vaultSource.sealRequest,
            sealReceipt: vaultSource.sealReceipt,
            consumerAttemptId: binding.toolInput.attemptId,
            consumerInvocationId: binding.toolInput.invocationId,
            consumerGeneration: vaultSource.sealRequest.generation,
            requestedAt: nowInstant(),
          });
        const resolved = await resolveAgentNativeProviderStateVaultState(
          stateVault,
          resolveRequest,
          sanitization()
        );
        const vaultHealth = await input.stateVaultHealth.readHealth();
        if (
          !vaultHealth ||
          vaultHealth.status !== 'ready' ||
          vaultHealth.overdueActiveRecordCount !== 0 ||
          !sameCanonicalJson(
            vaultHealth.authority,
            input.expectedVaultAuthority
          )
        ) {
          return undefined;
        }
        let callbackLocalProviderStateHandle =
          resolved.callbackLocalProviderStateHandle;
        if (!callbackLocalProviderStateHandle) return undefined;
        let material:
          | AgentEvaluationProductionSharedEffectStatefulTransportMaterial
          | undefined;
        let failure: unknown;
        let lifecycleCompleted = false;
        try {
          material = await input.transport.execute({
            binding,
            stage,
            program,
            nativeSourceReceipt,
            callbackLocalProviderStateHandle,
            stateVaultResolveRequest: resolveRequest,
            stateVaultResolveReceipt: resolved.receipt,
            vaultOwnerInstanceId: vaultHealth.vaultOwnerInstanceId,
            vaultHealthDigest: vaultHealth.healthDigest,
            async completeStateLifecycle({
              requestMaterial,
              response,
              executionStatus,
            }) {
              if (lifecycleCompleted) return fail('state-lifecycle-reentry');
              let nextStateVaultSealRequest: AgentNativeProviderStateVaultSealRequestProjection | null =
                null;
              let nextStateVaultSealReceipt: AgentNativeProviderStateVaultSealReceipt | null =
                null;
              let nextProviderStateHandle =
                response.callbackLocalProviderStateHandle;
              try {
                if (
                  binding.sourceIdentity.capabilityId ===
                    'provider.reasoning-continuation' &&
                  executionStatus === 'completed'
                ) {
                  if (
                    nextProviderStateHandle === null ||
                    requestMaterial.projection.protocolFamily ===
                      'anthropic-messages' ||
                    response.projection.providerStateReferenceKind === null ||
                    response.projection.responseBodyDigest === null ||
                    response.projection.sealedResponseJsonDigest === null
                  ) {
                    return fail('next-state-handle');
                  }
                  nextStateVaultSealRequest =
                    createAgentNativeProviderStateVaultSealRequest({
                      authorityDigest:
                        input.expectedVaultAuthority.authorityDigest,
                      purpose: 'reasoning-continuation-state',
                      attemptId: binding.toolInput.attemptId,
                      protocolFamily: requestMaterial.projection.protocolFamily,
                      providerStateReferenceKind:
                        response.projection.providerStateReferenceKind,
                      providerStateReferenceDigest:
                        digestAgentNativeProviderStateReference(
                          response.projection.providerStateReferenceKind,
                          nextProviderStateHandle
                        ),
                      probeProgramDigest: program.programDigest,
                      capabilityProfileDigest:
                        program.profileProjection.capabilityProfileDigest,
                      invocationId: binding.toolInput.invocationId,
                      requestDigest: requestMaterial.projection.requestDigest,
                      responseDigest: response.projection.responseDigest,
                      responseBodyDigest:
                        response.projection.responseBodyDigest,
                      sealedResponseJsonDigest:
                        response.projection.sealedResponseJsonDigest,
                      providerConfigurationId:
                        binding.sourceIdentity.providerConfigurationId,
                      modelLineageDigest:
                        binding.sourceIdentity.modelLineageDigest,
                      adapterDigest: binding.sourceIdentity.adapterDigest,
                      taskId: vaultSource.sealRequest.taskId,
                      runId: vaultSource.sealRequest.runId,
                      generation: vaultSource.sealRequest.generation + 1,
                      observedAt: response.projection.observedAt,
                      expiresAt: stage.expiresAt,
                    });
                  const sealResult = await stateVault.seal({
                    request: nextStateVaultSealRequest,
                    callbackLocalProviderStateHandle: nextProviderStateHandle,
                  });
                  nextStateVaultSealReceipt =
                    createAgentNativeProviderStateVaultSealReceipt(
                      nextStateVaultSealRequest,
                      sealResult,
                      sanitization()
                    );
                  if (nextStateVaultSealReceipt.status !== 'sealed') {
                    return fail('next-state-seal');
                  }
                }
              } finally {
                nextProviderStateHandle = null;
              }
              const retireRequest =
                createAgentNativeProviderStateVaultRetireRequest({
                  sealRequest: vaultSource.sealRequest,
                  sealReceipt: vaultSource.sealReceipt,
                  resolveRequest,
                  resolveReceipt: resolved.receipt,
                  disposition: 'consumed',
                  requestedAt: nowInstant(),
                });
              const retirementReceipt =
                await retireAgentNativeProviderStateVaultState(
                  stateVault,
                  retireRequest,
                  vaultSource.sealRequest,
                  vaultSource.sealReceipt,
                  sanitization()
                );
              lifecycleCompleted = true;
              return Object.freeze({
                stateVaultRetireRequest: retireRequest,
                stateVaultRetirementReceipt: retirementReceipt,
                nextStateVaultSealRequest,
                nextStateVaultSealReceipt,
                sealedAt: new Date(
                  Math.max(
                    Date.parse(retirementReceipt.retiredAt),
                    Date.parse(
                      nextStateVaultSealReceipt?.sealedAt ??
                        retirementReceipt.retiredAt
                    )
                  )
                ).toISOString(),
              });
            },
          });
        } catch (caught) {
          failure = caught;
        } finally {
          callbackLocalProviderStateHandle = null;
        }
        if (!lifecycleCompleted) {
          const fallbackRetireRequest =
            createAgentNativeProviderStateVaultRetireRequest({
              sealRequest: vaultSource.sealRequest,
              sealReceipt: vaultSource.sealReceipt,
              resolveRequest,
              resolveReceipt: resolved.receipt,
              disposition: 'consumed',
              requestedAt: nowInstant(),
            });
          await retireAgentNativeProviderStateVaultState(
            stateVault,
            fallbackRetireRequest,
            vaultSource.sealRequest,
            vaultSource.sealReceipt,
            sanitization()
          );
        }
        if (failure !== undefined) throw failure;
        if (!material || !lifecycleCompleted) return undefined;
        return Object.freeze({
          ...material,
          stateVaultResolveRequest: resolveRequest,
          stateVaultResolveReceipt: resolved.receipt,
        });
      } finally {
        active -= 1;
      }
    },
    async checkReadiness(healthInput) {
      if (closed) return undefined;
      const vaultHealth = await input.stateVaultHealth.readHealth();
      if (
        !vaultHealth ||
        vaultHealth.status !== 'ready' ||
        vaultHealth.overdueActiveRecordCount !== 0 ||
        !sameCanonicalJson(vaultHealth.authority, input.expectedVaultAuthority)
      ) {
        return undefined;
      }
      return input.transport.checkReadiness(healthInput);
    },
    close() {
      closePromise ??= (async () => {
        closed = true;
        while (active > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const receipt = await input.transport.close();
        if (!sameCanonicalJson(receipt, cleanReceipt)) {
          return fail('close');
        }
        return cleanReceipt;
      })();
      return closePromise;
    },
  };
  return Object.freeze(owner);
};
