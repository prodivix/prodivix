import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
  type AgentCapabilityProbeProfileId,
} from './agentCapabilityProbeProgram';
import {
  createAgentCapabilityProbeProviderRequestBodyDirectives,
  createAgentCapabilityProbeProviderRequestPolicy,
  createAgentCapabilityProbeProviderStateReferenceDirective,
  isAgentCapabilityProbeProviderRequestPolicy,
  matchAgentCapabilityProbeProviderRequestPolicy,
  resolveAgentCapabilityProbeProviderRequestCodecAvailability,
  type CreateAgentCapabilityProbeProviderRequestPolicyInput,
} from './agentCapabilityProbeProviderRequest';
import { createAgentCapabilityProbeProviderResourceAuthority } from './agentCapabilityProbeProviderResource';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const observedAt = '2026-08-09T03:00:00.000Z';

const programFor = (capabilityProfileId: AgentCapabilityProbeProfileId) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
  });

const binding = (
  protocolFamily: AgentNativeProviderProtocol,
  sequence = 0
): Omit<
  CreateAgentCapabilityProbeProviderRequestPolicyInput,
  'providerResourceAuthority'
> =>
  Object.freeze({
    protocolFamily,
    providerConfigurationId: `provider.release.${protocolFamily}`,
    modelId: `model.release.${protocolFamily}`,
    modelLineageDigest: digest(`model-lineage.${protocolFamily}`),
    adapterDigest: digest(`adapter.${protocolFamily}`),
    sequence,
    observedAt,
  });

const retrievalAuthority = (
  protocolFamily: 'gemini-interactions' | 'openai-responses',
  profileId:
    | 'g4-provider-hosted-retrieval-core'
    | 'g4-provider-hosted-retrieval-document'
) => {
  const program = programFor(profileId);
  const common = binding(protocolFamily);
  return Object.freeze({
    program,
    common,
    authority: createAgentCapabilityProbeProviderResourceAuthority(program, {
      protocolFamily,
      providerConfigurationId: common.providerConfigurationId,
      modelId: common.modelId,
      modelLineageDigest: common.modelLineageDigest,
      adapterDigest: common.adapterDigest,
      providerResourceId:
        protocolFamily === 'openai-responses'
          ? 'vs_prodivix_probe'
          : 'fileSearchStores/prodivix-probe',
      resourceManifestDigest: digest('resource-manifest'),
      contentUploadReceiptDigest: digest('resource-upload'),
      deletionAuthorityReceiptDigest: digest('resource-deletion'),
      registeredAt: '2026-08-09T02:00:00.000Z',
      expiresAt: '2026-08-09T04:00:00.000Z',
    }),
  });
};

describe('capability probe provider request policy', () => {
  it('freezes real submit and repeated poll network operations', () => {
    const program = programFor('g4-provider-background-job');
    const submitInput = Object.freeze({
      ...binding('openai-responses', 0),
      providerResourceAuthority: null,
    });
    const submit = createAgentCapabilityProbeProviderRequestPolicy(
      program,
      submitInput
    );
    const poll = createAgentCapabilityProbeProviderRequestPolicy(program, {
      ...submitInput,
      sequence: 1,
    });

    expect(submit).toMatchObject({
      phase: 'submit',
      operation: 'responses.create',
      httpMethod: 'POST',
      responseMode: 'application-json',
      stream: false,
      store: true,
      background: true,
      providerStateReference: {
        required: false,
        kind: null,
        placement: null,
      },
    });
    expect(poll).toMatchObject({
      phase: 'poll',
      operation: 'responses.get',
      httpMethod: 'GET',
      providerStateReference: {
        required: true,
        kind: 'response-id',
        placement: 'path',
      },
    });
    expect(
      createAgentCapabilityProbeProviderRequestBodyDirectives(submit)
    ).toEqual({ stream: false, store: true, background: true });
    expect(
      createAgentCapabilityProbeProviderRequestBodyDirectives(poll)
    ).toEqual({});
    expect(
      createAgentCapabilityProbeProviderStateReferenceDirective(
        poll,
        'resp_background_1'
      )
    ).toEqual({ pathSegment: 'resp_background_1', bodyFields: {} });
  });

  it('binds OpenAI and Gemini continuation resume fields without embedding a handle', () => {
    const program = programFor('g4-provider-reasoning-continuation');
    const openAI = createAgentCapabilityProbeProviderRequestPolicy(program, {
      ...binding('openai-responses', 1),
      providerResourceAuthority: null,
    });
    const gemini = createAgentCapabilityProbeProviderRequestPolicy(program, {
      ...binding('gemini-interactions', 1),
      providerResourceAuthority: null,
    });

    expect(openAI.providerStateReference).toEqual({
      required: true,
      kind: 'response-id',
      placement: 'previous_response_id',
    });
    expect(gemini.providerStateReference).toEqual({
      required: true,
      kind: 'interaction-id',
      placement: 'previous_interaction_id',
    });
    expect(
      createAgentCapabilityProbeProviderRequestBodyDirectives(openAI)
    ).toEqual({ stream: false, store: true, background: false });
    expect(
      createAgentCapabilityProbeProviderStateReferenceDirective(
        openAI,
        'resp_parent_1'
      )
    ).toEqual({
      pathSegment: null,
      bodyFields: { previous_response_id: 'resp_parent_1' },
    });
    expect(
      createAgentCapabilityProbeProviderStateReferenceDirective(
        gemini,
        'interaction_parent_1'
      )
    ).toEqual({
      pathSegment: null,
      bodyFields: { previous_interaction_id: 'interaction_parent_1' },
    });
    expect(() =>
      createAgentCapabilityProbeProviderStateReferenceDirective(openAI, null)
    ).toThrow(/state reference is invalid/u);
  });

  it.each([
    ['openai-responses', 'openai-prompt-cache-key'],
    ['anthropic-messages', 'anthropic-ephemeral-prefix'],
    ['gemini-interactions', 'gemini-implicit-prefix'],
  ] as const)(
    'freezes the %s cache request directive from repo-owned prefix material',
    (protocolFamily, expectedKind) => {
      const program = programFor('g4-provider-isolated-cache');
      const policy = createAgentCapabilityProbeProviderRequestPolicy(program, {
        ...binding(protocolFamily),
        providerResourceAuthority: null,
      });
      expect(policy.cacheDirective?.kind).toBe(expectedKind);
      expect(policy.cacheDirective?.prefixDescriptorDigest).toBe(
        program.providerRequestIntent.cachePrefixResource?.descriptorDigest
      );
    }
  );

  it.each([
    ['openai-responses', 'vector_store_ids'],
    ['gemini-interactions', 'file_search_store_names'],
  ] as const)(
    'binds the %s hosted retrieval request to its fresh provider resource',
    (protocolFamily, resourceField) => {
      const { program, common, authority } = retrievalAuthority(
        protocolFamily,
        'g4-provider-hosted-retrieval-core'
      );
      const input = Object.freeze({
        ...common,
        providerResourceAuthority: authority,
      });
      const policy = createAgentCapabilityProbeProviderRequestPolicy(
        program,
        input
      );
      expect(policy.retrievalDirective).toMatchObject({
        toolType: 'file_search',
        resourceField,
        providerResourceId: authority.providerResourceId,
        providerResourceAuthorityDigest: authority.authorityDigest,
      });
      expect(
        createAgentCapabilityProbeProviderRequestBodyDirectives(policy)
      ).toMatchObject({
        tools: [
          {
            type: 'file_search',
            [resourceField]: [authority.providerResourceId],
          },
        ],
      });
      expect(
        matchAgentCapabilityProbeProviderRequestPolicy(policy, program, input)
      ).toBe(true);
    }
  );

  it('reports codec unavailability without producing active support', () => {
    for (const profileId of [
      'g4-provider-background-job',
      'g4-provider-hosted-retrieval-core',
      'g4-provider-reasoning-continuation',
    ] as const) {
      expect(
        resolveAgentCapabilityProbeProviderRequestCodecAvailability(
          'anthropic-messages',
          profileId
        ).availability
      ).toBe('unavailable');
      expect(() =>
        createAgentCapabilityProbeProviderRequestPolicy(programFor(profileId), {
          ...binding('anthropic-messages'),
          providerResourceAuthority: null,
        })
      ).toThrow(/policy is invalid/u);
    }
  });

  it('rejects missing, expired, swapped, and fully recomputed policy authority', () => {
    const { program, common, authority } = retrievalAuthority(
      'openai-responses',
      'g4-provider-hosted-retrieval-document'
    );
    expect(() =>
      createAgentCapabilityProbeProviderRequestPolicy(program, {
        ...common,
        providerResourceAuthority: null,
      })
    ).toThrow(/policy is invalid/u);
    expect(() =>
      createAgentCapabilityProbeProviderRequestPolicy(program, {
        ...common,
        observedAt: '2026-08-10T00:00:00.000Z',
        providerResourceAuthority: authority,
      })
    ).toThrow(/policy is invalid/u);

    const input = Object.freeze({
      ...common,
      providerResourceAuthority: authority,
    });
    const policy = createAgentCapabilityProbeProviderRequestPolicy(
      program,
      input
    );
    const { policyDigest: _policyDigest, ...swappedBase } = {
      ...policy,
      modelLineageDigest: digest('swapped-model-lineage'),
    };
    const recomputed = Object.freeze({
      ...swappedBase,
      policyDigest: digestAgentCanonicalValue(swappedBase),
    });
    expect(isAgentCapabilityProbeProviderRequestPolicy(recomputed)).toBe(true);
    expect(
      matchAgentCapabilityProbeProviderRequestPolicy(recomputed, program, input)
    ).toBe(false);
  });
});
