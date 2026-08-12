import {
  AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES,
  createAgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  matchAgentCapabilityProbeProviderResourceAuthority,
  matchAgentCapabilityProbeProviderResourceDeletionAuthority,
  resolveAgentProductionEvaluationNativeProviderIdentity,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient,
  type AgentEvaluationCapabilityProbeProviderResourceCleanupClient,
  type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClientInput,
} from './capabilityProbeProviderResourceCleanupClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationProbeProviderResourceAuthorityCleanupInput,
  AgentEvaluationProbeProviderResourceAuthorityCleanupPort,
} from './productionQualification';

export type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityCleanupPortInput =
  Readonly<
    Pick<
      CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClientInput,
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

export const cleanupAgentEvaluationCapabilityProbeProviderResourceAuthorities =
  async (
    input: AgentEvaluationProbeProviderResourceAuthorityCleanupInput,
    client: AgentEvaluationCapabilityProbeProviderResourceCleanupClient
  ): Promise<AgentProductionEvaluationProbeProviderResourceAuthorityBundle> => {
    if (input.deadlineSignal.aborted) return unavailable();
    const listed = await client.list(input.deadlineSignal);
    if (listed.records.length !== 4) return invalid();
    const deletionEntries: Array<readonly [string, unknown]> = [];
    const cleanupEntries: Array<readonly [string, unknown]> = [];
    const seen = new Set<string>();
    for (const { protocolFamily, identity } of input.providerLanes) {
      const { provider, model } =
        resolveAgentProductionEvaluationNativeProviderIdentity(identity);
      const deletionByProfile: Array<readonly [string, unknown]> = [];
      const cleanupByProfile: Array<readonly [string, unknown]> = [];
      for (const profileId of AGENT_PRODUCTION_EVALUATION_RETRIEVAL_CAPABILITY_PROFILES) {
        const program = identity.capabilityProbePrograms[profileId];
        const matches = listed.records.filter(
          ({ resourceRegistrationRequest }) =>
            resourceRegistrationRequest.providerConfiguration.adapter
              .protocolFamily === protocolFamily &&
            resourceRegistrationRequest.probeProgram.profileProjection
              .capabilityProfileId === profileId
        );
        if (matches.length !== 1) return invalid();
        const record = matches[0]!;
        const request = record.resourceRegistrationRequest;
        const authority = input.prepared.authorities[protocolFamily][profileId];
        const deletion = record.deletionAuthorityReceipt;
        if (
          seen.has(request.requestDigest) ||
          !sameCanonicalJson(request.providerConfiguration, provider) ||
          !sameCanonicalJson(request.modelLineage, model) ||
          !sameCanonicalJson(request.probeProgram, program) ||
          !sameCanonicalJson(
            record.registrationResponse.providerResourceAuthority,
            authority
          ) ||
          !matchAgentCapabilityProbeProviderResourceAuthority(
            authority,
            program,
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
          !matchAgentCapabilityProbeProviderResourceDeletionAuthority(
            deletion,
            authority,
            program,
            { requestDigest: request.requestDigest }
          )
        ) {
          return invalid();
        }
        seen.add(request.requestDigest);
        const cleanupResponse =
          record.cleanupResponse ??
          (await client.cleanup(record.cleanupRequest, input.deadlineSignal));
        if (
          cleanupResponse.cleanupRequestDigest !==
            record.cleanupRequest.cleanupRequestDigest ||
          cleanupResponse.resourceRegistrationRequestDigest !==
            request.requestDigest ||
          cleanupResponse.deletionAuthorityReceiptDigest !==
            deletion.deletionAuthorityReceiptDigest ||
          cleanupResponse.cleanupReceipt.requestDigest !==
            request.requestDigest ||
          cleanupResponse.cleanupReceipt.deletionAuthorityReceiptDigest !==
            deletion.deletionAuthorityReceiptDigest
        ) {
          return invalid();
        }
        deletionByProfile.push([profileId, deletion]);
        cleanupByProfile.push([profileId, cleanupResponse.cleanupReceipt]);
      }
      deletionEntries.push([
        protocolFamily,
        Object.freeze(Object.fromEntries(deletionByProfile)),
      ]);
      cleanupEntries.push([
        protocolFamily,
        Object.freeze(Object.fromEntries(cleanupByProfile)),
      ]);
    }
    if (seen.size !== listed.records.length || input.deadlineSignal.aborted) {
      return unavailable();
    }
    const bundle =
      createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
        authorities: input.prepared.authorities,
        deletionAuthorityReceipts: Object.freeze(
          Object.fromEntries(deletionEntries)
        ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['deletionAuthorityReceipts'],
        cleanupReceipts: Object.freeze(
          Object.fromEntries(cleanupEntries)
        ) as AgentProductionEvaluationProbeProviderResourceAuthorityBundle['cleanupReceipts'],
      });
    return Object.freeze({ ...bundle });
  };

export const createEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityCleanupPort =

    (
      options: CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceAuthorityCleanupPortInput = Object.freeze(
        {}
      )
    ): AgentEvaluationProbeProviderResourceAuthorityCleanupPort =>
    async (input) =>
      cleanupAgentEvaluationCapabilityProbeProviderResourceAuthorities(
        input,
        createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
          {
            namespaceId: input.namespaceId,
            repositoryCommit: input.template.repositoryCommit,
            ...(options.environment
              ? { environment: options.environment }
              : {}),
            ...(options.fetch ? { fetch: options.fetch } : {}),
          }
        )
      );
