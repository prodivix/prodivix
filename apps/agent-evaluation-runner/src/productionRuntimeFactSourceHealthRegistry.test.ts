import {
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  createAgentProductionEvaluationRuntimeFactSourceIdentity,
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
  type AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
  createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner,
  type AgentEvaluationProductionRuntimeFactSourceHealthRegistry,
  type AgentEvaluationProductionRuntimeFactSourceRegistryHealth,
  type AgentEvaluationProductionRuntimeFactSourceRegistryLookup,
} from './productionRuntimeFactSourceHealthRegistry';
import {
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';

const checkedAt = '2026-08-09T05:00:00.000Z';
const now = new Date('2026-08-09T05:01:00.000Z');
const minimumExpiresAt = '2026-08-10T05:00:00.000Z';
const expiresAt = '2026-08-11T05:00:00.000Z';

const profileBinding = (
  profileId: AgentProductionEvaluationFactBackedOptionalCapabilityProfileId
) => {
  switch (profileId) {
    case 'g4-provider-background-job':
      return Object.freeze({
        capabilityId: 'provider.background-job',
        sourceKind: 'sealed-provider-response-metadata',
        routePrefix: 'provider-runtime-metadata',
      } as const);
    case 'g4-provider-hosted-retrieval-core':
    case 'g4-provider-hosted-retrieval-document':
      return Object.freeze({
        capabilityId: 'provider.hosted-retrieval',
        sourceKind: 'sealed-hosted-owner-result',
        routePrefix: 'hosted-capability-runtime',
      } as const);
    case 'g4-provider-isolated-cache':
      return Object.freeze({
        capabilityId: 'provider.isolated-cache',
        sourceKind: 'sealed-provider-response-metadata',
        routePrefix: 'provider-runtime-metadata',
      } as const);
    case 'g4-provider-reasoning-continuation':
      return Object.freeze({
        capabilityId: 'provider.reasoning-continuation',
        sourceKind: 'sealed-provider-response-metadata',
        routePrefix: 'provider-runtime-metadata',
      } as const);
  }
};

const identityFor = (
  protocolFamily: AgentProductionEvaluationNativeProtocolFamily,
  capabilityProfileId: AgentProductionEvaluationFactBackedOptionalCapabilityProfileId
): AgentProductionEvaluationRuntimeFactSourceIdentity => {
  const profile = profileBinding(capabilityProfileId);
  return createAgentProductionEvaluationRuntimeFactSourceIdentity({
    kind: 'shared-durable-capability',
    sourceKind: profile.sourceKind,
    sourceAuthorityId: `runtime-source.production.${protocolFamily}.${capabilityProfileId}`,
    sourceAuthorityImplementationDigest: digestAgentCanonicalValue({
      owner: 'real-effect-owner',
      protocolFamily,
      capabilityProfileId,
    }),
    routeBinding: `${profile.routePrefix}.${capabilityProfileId}`,
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
    capabilityId: profile.capabilityId,
    protocolFamily,
    providerConfigurationId: `provider.${protocolFamily}.production`,
    modelId: `model.${protocolFamily}.immutable`,
    modelLineageDigest: digestAgentCanonicalValue({
      model: protocolFamily,
      lineage: 1,
    }),
    adapterDigest: digestAgentCanonicalValue({
      adapter: protocolFamily,
      version: 1,
    }),
    ...(profile.capabilityId === 'provider.hosted-retrieval' &&
    protocolFamily !== 'anthropic-messages'
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
              providerConfigurationId: `provider.${protocolFamily}.production`,
              providerConfigurationDigest: digestAgentCanonicalValue({
                provider: protocolFamily,
                configuration: 'production',
              }),
              protocolFamily,
              modelId: `model.${protocolFamily}.immutable`,
              modelLineageDigest: digestAgentCanonicalValue({
                model: protocolFamily,
                lineage: 1,
              }),
              adapterDigest: digestAgentCanonicalValue({
                adapter: protocolFamily,
                version: 1,
              }),
              capabilityProfileId:
                capabilityProfileId === 'g4-provider-hosted-retrieval-core'
                  ? 'g4-provider-hosted-retrieval-core'
                  : 'g4-provider-hosted-retrieval-document',
              capabilityProfileDigest:
                digestAgentCapabilityProbeProfile(capabilityProfileId),
              probeProgramDigest: digestAgentCanonicalValue({
                probeProgram: capabilityProfileId,
              }),
              publicResourceDescriptorDigest: digestAgentCanonicalValue({
                publicResource: capabilityProfileId,
              }),
            }).intentDigest,
        }
      : {}),
    registrationAuthorityIssuerId:
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
  });
};

const expectedIdentities =
  (): readonly AgentProductionEvaluationRuntimeFactSourceIdentity[] =>
    Object.freeze(
      AGENT_PRODUCTION_EVALUATION_NATIVE_PROTOCOL_FAMILIES.flatMap(
        (protocolFamily) =>
          AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.map(
            (profileId) => identityFor(protocolFamily, profileId)
          )
      )
    );

const requestFor = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity
): AgentEvaluationRuntimeFactSourceRegistrationRequest =>
  createAgentEvaluationRuntimeFactSourceRegistrationRequest({
    namespaceId: 'evaluation.namespace.runtime-source-production',
    repositoryCommit: 'a'.repeat(40),
    sourceAuthorityKind: identity.kind,
    sourceKind: identity.sourceKind,
    sourceAuthorityId: identity.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    routeBinding: identity.routeBinding,
    capabilityProfileId:
      identity.capabilityProfileId as AgentProductionEvaluationFactBackedOptionalCapabilityProfileId,
    capabilityProfileDigest: identity.capabilityProfileDigest,
    capabilityId: identity.capabilityId,
    protocolFamily:
      identity.protocolFamily as AgentProductionEvaluationNativeProtocolFamily,
    providerConfigurationId: identity.providerConfigurationId,
    modelId: identity.modelId,
    modelLineageDigest: identity.modelLineageDigest,
    adapterDigest: identity.adapterDigest,
    ...(identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      ? {
          hostedRetrievalRuntimeResourceRegistrationIntentDigest:
            identity.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
        }
      : {}),
    minimumExpiresAt,
  });

const healthFor = (
  lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup,
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity
): AgentEvaluationProductionRuntimeFactSourceRegistryHealth => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT,
    version:
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION,
    namespaceId: lookup.namespaceId,
    repositoryCommit: lookup.repositoryCommit,
    registrationRequestDigest: lookup.registrationRequestDigest,
    expectedIdentityDigest: lookup.expectedIdentityDigest,
    minimumExpiresAt: lookup.minimumExpiresAt,
    sourceAuthorityKind: identity.kind,
    sourceKind: identity.sourceKind,
    sourceAuthorityId: identity.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    effectOwnerAuthorityId: identity.sourceAuthorityId,
    effectOwnerImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    routeBinding: identity.routeBinding,
    capabilityProfileId: identity.capabilityProfileId,
    capabilityProfileDigest: identity.capabilityProfileDigest,
    capabilityId: identity.capabilityId,
    protocolFamily: identity.protocolFamily,
    providerConfigurationId: identity.providerConfigurationId,
    modelId: identity.modelId,
    modelLineageDigest: identity.modelLineageDigest,
    adapterDigest: identity.adapterDigest,
    registrationAuthorityIssuerId: identity.registrationAuthorityIssuerId,
    status: 'ready' as const,
    checkedAt,
    expiresAt,
    effectOwnerReadinessReceiptDigest: digestAgentCanonicalValue({
      owner: identity.sourceAuthorityId,
      implementation: identity.sourceAuthorityImplementationDigest,
      status: 'ready',
      checkedAt,
    }),
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const recommit = (
  health: AgentEvaluationProductionRuntimeFactSourceRegistryHealth,
  patch: Readonly<Record<string, unknown>>
): AgentEvaluationProductionRuntimeFactSourceRegistryHealth => {
  const { recordDigest: _recordDigest, ...current } = health;
  const base = Object.freeze({ ...current, ...patch });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  }) as unknown as AgentEvaluationProductionRuntimeFactSourceRegistryHealth;
};

const registryReturning = (
  identity: AgentProductionEvaluationRuntimeFactSourceIdentity,
  counts: { seal: number; read: number },
  mutate: (
    health: AgentEvaluationProductionRuntimeFactSourceRegistryHealth
  ) => AgentEvaluationProductionRuntimeFactSourceRegistryHealth = (health) =>
    health
): AgentEvaluationProductionRuntimeFactSourceHealthRegistry =>
  Object.freeze({
    async sealReadyHealth(
      lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
    ) {
      counts.seal += 1;
      return mutate(healthFor(lookup, identity));
    },
    async readSealedHealth(
      lookup: AgentEvaluationProductionRuntimeFactSourceRegistryLookup
    ) {
      counts.read += 1;
      return mutate(healthFor(lookup, identity));
    },
  });

describe('production runtime fact source health registry owner', () => {
  it('requires all fifteen expected identities and seals real owner health', async () => {
    const identities = expectedIdentities();
    expect(identities).toHaveLength(15);
    const identity = identities[0]!;
    const request = requestFor(identity);
    const counts = { seal: 0, read: 0 };
    const owner =
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities: identities,
        healthRegistry: registryReturning(identity, counts),
        clock: () => now,
      });
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    );

    const result = await owner.execute({
      request,
      registrationAuthorityIssuerId:
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
      stageDigest,
    });

    expect(result.ownerHealth).toMatchObject({
      requestDigest: request.requestDigest,
      sourceAuthorityId: identity.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        identity.sourceAuthorityImplementationDigest,
      sourceKind: identity.sourceKind,
      routeBinding: identity.routeBinding,
      status: 'ready',
      checkedAt,
      expiresAt,
    });
    expect(counts).toEqual({ seal: 1, read: 0 });
  });

  it('uses only the durable registry read during ACK-loss reconcile', async () => {
    const identities = expectedIdentities();
    const identity = identities[7]!;
    const request = requestFor(identity);
    const counts = { seal: 0, read: 0 };
    const owner =
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities: identities,
        healthRegistry: registryReturning(identity, counts),
        clock: () => now,
      });
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    );

    const result = await owner.reconcile({
      request,
      registrationAuthorityIssuerId:
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
      stageDigest,
    });

    expect(result?.ownerHealth.sourceAuthorityId).toBe(
      identity.sourceAuthorityId
    );
    expect(counts).toEqual({ seal: 0, read: 1 });
  });

  it('keeps static membership unavailable without durable real health', async () => {
    const identities = expectedIdentities();
    const identity = identities[3]!;
    const request = requestFor(identity);
    const counts = { seal: 0, read: 0 };
    const healthRegistry = Object.freeze({
      async sealReadyHealth() {
        counts.seal += 1;
        return undefined;
      },
      async readSealedHealth() {
        counts.read += 1;
        return undefined;
      },
    }) satisfies AgentEvaluationProductionRuntimeFactSourceHealthRegistry;
    const owner =
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities: identities,
        healthRegistry,
        clock: () => now,
      });
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    );

    await expect(
      owner.execute({
        request,
        registrationAuthorityIssuerId:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
        stageDigest,
      })
    ).rejects.toThrow('real-effect-owner-health-missing');
    await expect(
      owner.reconcile({
        request,
        registrationAuthorityIssuerId:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
        stageDigest,
      })
    ).resolves.toBeUndefined();
    expect(counts).toEqual({ seal: 1, read: 1 });
  });

  it('rejects expired, future-checked, and overlong readiness windows', async () => {
    const identities = expectedIdentities();
    const identity = identities[0]!;
    const request = requestFor(identity);
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    );
    const windows = Object.freeze([
      { expiresAt: now.toISOString() },
      { checkedAt: '2026-08-09T05:02:00.000Z' },
      { expiresAt: '2026-08-17T05:00:00.001Z' },
    ]);
    for (const window of windows) {
      const owner =
        createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
          expectedSourceIdentities: identities,
          healthRegistry: registryReturning(
            identity,
            { seal: 0, read: 0 },
            (health) => recommit(health, window)
          ),
          clock: () => now,
        });
      await expect(
        owner.execute({
          request,
          registrationAuthorityIssuerId:
            AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
          stageDigest,
        })
      ).rejects.toThrow('registry-health-lifetime');
    }
  });

  it('rejects incomplete membership and exact owner or target swaps', async () => {
    const identities = expectedIdentities();
    expect(() =>
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities: identities.slice(0, 14),
        healthRegistry: registryReturning(identities[0]!, {
          seal: 0,
          read: 0,
        }),
      })
    ).toThrow('expected-identity-count');

    const identity = identities[0]!;
    const request = requestFor(identity);
    const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
      request,
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
    );
    const swaps = Object.freeze([
      {
        name: 'effect-owner-id',
        patch: { effectOwnerAuthorityId: 'runtime-source.production.swapped' },
      },
      {
        name: 'effect-owner-implementation',
        patch: {
          effectOwnerImplementationDigest: digestAgentCanonicalValue(
            'swapped-effect-owner-implementation'
          ),
        },
      },
      {
        name: 'route',
        patch: { routeBinding: 'provider-runtime-metadata.swapped' },
      },
      {
        name: 'provider',
        patch: { providerConfigurationId: 'provider.production.swapped' },
      },
      { name: 'model', patch: { modelId: 'model.production.swapped' } },
      {
        name: 'profile',
        patch: {
          capabilityProfileDigest: digestAgentCanonicalValue('swapped-profile'),
        },
      },
      {
        name: 'adapter',
        patch: { adapterDigest: digestAgentCanonicalValue('swapped-adapter') },
      },
    ]);
    for (const swap of swaps) {
      const owner =
        createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
          expectedSourceIdentities: identities,
          healthRegistry: registryReturning(
            identity,
            { seal: 0, read: 0 },
            (health) => recommit(health, swap.patch)
          ),
          clock: () => now,
        });
      await expect(
        owner.execute({
          request,
          registrationAuthorityIssuerId:
            AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
          stageDigest,
        }),
        swap.name
      ).rejects.toThrow('registry-health-binding');
    }

    const swappedRequest = requestFor(
      createAgentProductionEvaluationRuntimeFactSourceIdentity({
        ...identity,
        routeBinding: 'provider-runtime-metadata.request-swapped',
      })
    );
    const swappedStage =
      digestAgentEvaluationRuntimeFactSourceRegistrationStage(
        swappedRequest,
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID
      );
    const counts = { seal: 0, read: 0 };
    const owner =
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities: identities,
        healthRegistry: registryReturning(identity, counts),
        clock: () => now,
      });
    await expect(
      owner.execute({
        request: swappedRequest,
        registrationAuthorityIssuerId:
          AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_AUTHORITY_ISSUER_ID,
        stageDigest: swappedStage,
      })
    ).rejects.toThrow('expected-identity-missing');
    expect(counts).toEqual({ seal: 0, read: 0 });
  });
});
