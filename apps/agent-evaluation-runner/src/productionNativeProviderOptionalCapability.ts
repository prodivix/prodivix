import {
  createAgentNativeProviderCacheIsolationAuthority,
  createAgentNativeProviderExecutionIdentityAuthority,
  extractAgentNativeProviderOptionalCapability,
  type AgentJsonValue,
  type AgentNativeProviderStateVaultAuthority,
  type AgentNativeProviderStateVaultPort,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { AgentEvaluationNativeOptionalCapabilityBootstrapResolver } from './providerTransport';
import type { AgentEvaluationProductionFrozenRunConfig } from './runConfig';

export type CreateProductionAgentEvaluationNativeOptionalCapabilityResolverInput =
  Readonly<{
    plan: AgentEvaluationProductionFrozenRunConfig['plan'];
    expectedStateVaultAuthority: AgentNativeProviderStateVaultAuthority;
    stateVault: AgentNativeProviderStateVaultPort;
    protectedMaterialCanaries: () => readonly string[];
    secretCanaries: () => readonly string[];
  }>;

export const createProductionAgentEvaluationNativeOptionalCapabilityResolver = (
  input: CreateProductionAgentEvaluationNativeOptionalCapabilityResolverInput
): AgentEvaluationNativeOptionalCapabilityBootstrapResolver => {
  if (
    !sameCanonicalJson(
      input.stateVault.authority,
      input.expectedStateVaultAuthority
    )
  ) {
    throw new TypeError('Native Provider state-vault authority drifted.');
  }
  return async (resolutionInput) => {
    const target = input.plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === resolutionInput.descriptor.targetId
    );
    const provider = input.plan.providerConfigurations.find(
      ({ providerConfigurationId }) =>
        providerConfigurationId === target?.providerConfigurationId
    );
    const optionalAuthority = target?.optionalCapabilitySupportAuthority;
    const runtimeFactSourceAuthority =
      optionalAuthority?.runtimeFactSourceAuthority;
    if (
      !target ||
      !provider ||
      !optionalAuthority ||
      !runtimeFactSourceAuthority ||
      optionalAuthority.capabilityId === 'provider.hosted-retrieval'
    ) {
      return undefined;
    }
    const program = optionalAuthority.probeEvidence.probeProgram;
    const profileId = program.profileProjection.capabilityProfileId;
    const protocolFamily = resolutionInput.request.protocolFamily;
    if (
      ![
        'g4-provider-background-job',
        'g4-provider-isolated-cache',
        'g4-provider-reasoning-continuation',
      ].includes(profileId) ||
      protocolFamily === 'openai-compatible' ||
      target.protocolFamily === 'openai-compatible' ||
      resolutionInput.turnIndex !== 0 ||
      protocolFamily !== target.protocolFamily ||
      resolutionInput.request.invocation.providerConfigurationId !==
        target.providerConfigurationId ||
      resolutionInput.request.invocation.modelLineageDigest !==
        target.modelLineageDigest ||
      resolutionInput.request.invocation.capabilityProfileDigest !==
        target.capabilityProfileDigest ||
      resolutionInput.transportReceipt.outcome !== 'completed' ||
      resolutionInput.transportReceipt.httpStatus === undefined ||
      resolutionInput.transportReceipt.responseBodyDigest === undefined
    ) {
      throw new TypeError(
        'Native optional capability extraction binding drifted.'
      );
    }
    const executionIdentityAuthority =
      createAgentNativeProviderExecutionIdentityAuthority({
        invocationId: resolutionInput.request.invocation.invocationId,
        taskId: resolutionInput.descriptor.attemptId,
        runId: `evaluation-run.${resolutionInput.descriptor.samplingIdentityDigest.slice('sha256-'.length)}`,
        generation: resolutionInput.descriptor.repetitionIndex,
      });
    const cacheIsolationAuthority =
      profileId === 'g4-provider-isolated-cache'
        ? createAgentNativeProviderCacheIsolationAuthority({
            program,
            semanticProof:
              optionalAuthority.probeEvidence.normalizedObservation
                .semanticProof!,
            runtimeFactSourceAuthorityDigest:
              runtimeFactSourceAuthority.authorityDigest,
            providerConfigurationId: target.providerConfigurationId,
          })
        : null;
    const candidate = await extractAgentNativeProviderOptionalCapability(
      program,
      {
        binding: Object.freeze({
          protocolFamily,
          attemptId: resolutionInput.descriptor.attemptId,
          capabilityProfileDigest: target.capabilityProfileDigest,
          invocationId: resolutionInput.request.invocation.invocationId,
          requestDigest: resolutionInput.request.invocation.requestDigest,
          responseDigest: resolutionInput.responseDigest,
          providerConfigurationId: target.providerConfigurationId,
          modelLineageDigest: target.modelLineageDigest,
          adapterDigest: provider.adapter.adapterDigest,
          executionIdentityAuthority,
          observedAt: resolutionInput.transportReceipt.completedAt,
          responseBodyDigest:
            resolutionInput.transportReceipt.responseBodyDigest,
          runtimeFactOccurredAt: resolutionInput.transportReceipt.startedAt,
          transportCompletedAt: resolutionInput.transportReceipt.completedAt,
          httpStatus: resolutionInput.transportReceipt.httpStatus,
          taskId: executionIdentityAuthority.taskId,
          runId: executionIdentityAuthority.runId,
          generation: executionIdentityAuthority.generation,
          cacheIsolationAuthority,
          providerRegion: null,
        }),
        sealedResponseJson: JSON.parse(
          canonicalJsonText(resolutionInput.providerEvents)
        ) as AgentJsonValue,
        stateVault:
          profileId === 'g4-provider-isolated-cache' ? null : input.stateVault,
        sanitization: Object.freeze({
          protectedMaterialCanaries: Object.freeze([
            ...input.protectedMaterialCanaries(),
          ]),
          secretCanaries: Object.freeze([...input.secretCanaries()]),
        }),
      }
    );
    return Object.freeze({
      program,
      outcome: candidate.outcome,
      nativeSourceReceipt: candidate.sourceReceipt,
    });
  };
};
