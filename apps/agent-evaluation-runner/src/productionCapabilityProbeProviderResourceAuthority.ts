import {
  AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES,
  AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES,
  isAgentControlIdentity,
  isAgentControlInstant,
  matchAgentCapabilityProbeProviderResourceAuthority,
  resolveAgentProductionEvaluationNativeProviderIdentity,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
} from '@prodivix/ai';
import {
  createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient,
  type AgentEvaluationCapabilityProbeProviderResourceClient,
  type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceClientInput,
} from './capabilityProbeProviderResourceClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationProbeProviderResourceAuthorityPreparationInput,
  AgentEvaluationProbeProviderResourceAuthorityPreparationPort,
} from './productionQualification';

export type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPortInput =
  Readonly<
    Pick<
      CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceClientInput,
      'environment' | 'fetch'
    >
  >;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

export const prepareAgentEvaluationCapabilityProbeProviderResourceAuthorities =
  async (
    input: AgentEvaluationProbeProviderResourceAuthorityPreparationInput,
    client: AgentEvaluationCapabilityProbeProviderResourceClient
  ): ReturnType<AgentEvaluationProbeProviderResourceAuthorityPreparationPort> => {
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !isAgentControlInstant(input.minimumExpiresAt) ||
      input.deadlineSignal.aborted ||
      input.providerLanes.length !==
        AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES.length ||
      input.providerLanes.some(
        (lane, index) =>
          lane.protocolFamily !==
            AGENT_PRODUCTION_EVALUATION_PROBE_PROVIDER_RESOURCE_PROTOCOL_FAMILIES[
              index
            ] || lane.identity.protocolFamily !== lane.protocolFamily
      )
    ) {
      return invalid();
    }

    const laneEntries = await Promise.all(
      input.providerLanes.map(async ({ protocolFamily, identity }) => {
        const { provider, model } =
          resolveAgentProductionEvaluationNativeProviderIdentity(identity);
        const profileEntries: Array<readonly [string, unknown]> = [];
        for (const profileId of AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES) {
          if (input.deadlineSignal.aborted) return unavailable();
          const probeProgram = identity.capabilityProbePrograms[profileId];
          const request =
            createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
              {
                namespaceId: input.namespaceId,
                repositoryCommit: input.template.repositoryCommit,
                providerConfiguration: provider,
                modelLineage: model,
                probeProgram,
                minimumExpiresAt: input.minimumExpiresAt,
              }
            );
          const registration = await client.register(
            request,
            input.deadlineSignal
          );
          const authority = registration.providerResourceAuthority;
          if (
            !matchAgentCapabilityProbeProviderResourceAuthority(
              authority,
              probeProgram,
              {
                protocolFamily,
                providerConfigurationId: provider.providerConfigurationId,
                modelId: model.modelId,
                modelLineageDigest: model.lineageDigest,
                adapterDigest: provider.adapter.adapterDigest,
                authorityDigest: authority.authorityDigest,
                observedAt: authority.registeredAt,
              }
            ) ||
            Date.parse(authority.expiresAt) < Date.parse(input.minimumExpiresAt)
          ) {
            return invalid();
          }
          profileEntries.push([profileId, authority] as const);
        }
        return [
          protocolFamily,
          Object.freeze(Object.fromEntries(profileEntries)),
        ] as const;
      })
    );
    if (input.deadlineSignal.aborted) return unavailable();
    return Object.freeze({
      authorities: Object.freeze(
        Object.fromEntries(laneEntries)
      ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['authorities'],
    });
  };

export const createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPort =

    (
      options: CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityPreparationPortInput = Object.freeze(
        {}
      )
    ): AgentEvaluationProbeProviderResourceAuthorityPreparationPort =>
    async (input) =>
      prepareAgentEvaluationCapabilityProbeProviderResourceAuthorities(
        input,
        createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient({
          namespaceId: input.namespaceId,
          repositoryCommit: input.template.repositoryCommit,
          ...(options.environment ? { environment: options.environment } : {}),
          ...(options.fetch ? { fetch: options.fetch } : {}),
        })
      );
