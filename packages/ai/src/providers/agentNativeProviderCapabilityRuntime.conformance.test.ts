import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalProviderResponseFixture } from '../__tests__/agentCapabilityEffectProviderRuntimeFixtures';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceAuthority,
  createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority,
  createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt,
  createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection,
  createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResource';
import {
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  decodeAgentNativeProviderCapabilityRuntimeResponse,
  isAgentNativeProviderCapabilityRuntimeRequestProjection,
  isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf,
  isAgentNativeProviderCapabilityRuntimeResponseProjection,
  resolveAgentNativeProviderCapabilityRuntimeCodecAvailability,
  type AgentNativeProviderCapabilityRuntimeOperation,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
} from './agentNativeProviderCapabilityRuntime';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';

const observedAt = '2026-08-09T07:00:00.000Z';
const digest = (label: string) => digestAgentCanonicalValue({ label });

const programFor = (capabilityProfileId: AgentCapabilityProbeProfileId) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
  });

const identity = (protocolFamily: AgentNativeProviderProtocol) =>
  Object.freeze({
    protocolFamily,
    providerConfigurationId: `provider.release.${protocolFamily}`,
    modelId: `model.release.${protocolFamily}`,
    modelLineageDigest: digest(`lineage.${protocolFamily}`),
    adapterDigest: digest(`adapter.${protocolFamily}`),
  });

const commitmentFor = (
  authority: AgentHostedRetrievalRuntimeResourceAuthority
): AgentHostedRetrievalRuntimeResourceSetCommitment => {
  const keys = Object.freeze([
    ['gemini-interactions', 'g4-provider-hosted-retrieval-core'],
    ['gemini-interactions', 'g4-provider-hosted-retrieval-document'],
    ['openai-responses', 'g4-provider-hosted-retrieval-core'],
    ['openai-responses', 'g4-provider-hosted-retrieval-document'],
  ] as const);
  const authorityBindings = Object.freeze(
    keys.map(([protocolFamily, capabilityProfileId]) =>
      protocolFamily === authority.protocolFamily &&
      capabilityProfileId === authority.capabilityProfileId
        ? Object.freeze({
            authorityDigest: authority.authorityDigest,
            registrationIntentDigest: authority.registrationIntentDigest,
            protocolFamily,
            capabilityProfileId,
            providerConfigurationDigest: authority.providerConfigurationDigest,
            budgetReservationId:
              authority.budgetReservationAuthority.reservationId,
            budgetReservationAuthorityDigest:
              authority.budgetReservationAuthorityDigest,
            networkPolicyAuthorityDigest:
              authority.networkPolicyAuthorityDigest,
          })
        : Object.freeze({
            authorityDigest: digest(
              `foreign-authority.${protocolFamily}.${capabilityProfileId}`
            ),
            registrationIntentDigest: digest(
              `foreign-registration-intent.${protocolFamily}.${capabilityProfileId}`
            ),
            protocolFamily,
            capabilityProfileId,
            providerConfigurationDigest: digest(
              `foreign-provider.${protocolFamily}.${capabilityProfileId}`
            ),
            budgetReservationId: `foreign-budget.${protocolFamily}.${capabilityProfileId}`,
            budgetReservationAuthorityDigest: digest(
              `foreign-budget-authority.${protocolFamily}.${capabilityProfileId}`
            ),
            networkPolicyAuthorityDigest: digest(
              `foreign-network-policy.${protocolFamily}.${capabilityProfileId}`
            ),
          })
    )
  );
  const base = Object.freeze({
    format: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_SET_COMMITMENT_FORMAT,
    version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
    planDigest: authority.planDigest,
    frozenRunDigest: authority.frozenRunDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authoritySetDigest: digest('runtime-authority-set'),
    authorityBindings,
  });
  return Object.freeze({
    ...base,
    commitmentDigest: digestAgentCanonicalValue(base),
  });
};

const runtimeResource = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: 'gemini-interactions' | 'openai-responses'
): Readonly<{
  authority: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceAuthority
  >;
  readRequest: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceReadRequest
  >;
  readReceipt: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceReadReceipt
  >;
}> => {
  const publicResource = resolveAgentCapabilityProbePublicResource(program);
  if (publicResource === null) {
    throw new TypeError('Hosted retrieval fixture resource is missing.');
  }
  const providerResourceId =
    protocolFamily === 'openai-responses'
      ? 'vs_runtime_retrieval'
      : 'fileSearchStores/runtime-retrieval';
  const namespaceId = 'namespace.release';
  const planDigest = digest('plan');
  const frozenRunDigest = digest('frozen-run');
  const runConfigArtifactBindingDigest = digest('run-config-binding');
  const providerConfigurationDigest = digest(
    `provider-configuration.${protocolFamily}`
  );
  const budgetReservationAuthority =
    createAgentHostedRetrievalRuntimeResourceBudgetReservationAuthority({
      namespaceId,
      planDigest,
      reservePolicyDigest: digest('budget-reserve-policy'),
      budgetDigest: digest('budget'),
      reservationId: `budget-reservation.runtime-resource.${protocolFamily}`,
      ledgerRevision: 7,
      demandDigest: digest(`budget-demand.${protocolFamily}`),
      demandBytesDigest: digest(`budget-demand-bytes.${protocolFamily}`),
      reservedAt: '2026-08-09T05:59:00.000Z',
    });
  const networkPolicyAuthority =
    createAgentHostedRetrievalRuntimeResourceNetworkPolicyAuthority({
      namespaceId,
      repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
      planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      providerConfigurationId: identity(protocolFamily).providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily,
    });
  const registrationIntent =
    createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId: identity(protocolFamily).providerConfigurationId,
      providerConfigurationDigest,
      protocolFamily,
      modelId: identity(protocolFamily).modelId,
      modelLineageDigest: identity(protocolFamily).modelLineageDigest,
      adapterDigest: identity(protocolFamily).adapterDigest,
      capabilityProfileId: program.profileProjection.capabilityProfileId as
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document',
      capabilityProfileDigest:
        program.profileProjection.capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest:
        publicResource.descriptor.descriptorDigest,
    });
  const registrationRequest =
    createAgentHostedRetrievalRuntimeResourceRegistrationRequest({
      namespaceId,
      repositoryCommit: '1234567890abcdef1234567890abcdef12345678',
      planDigest,
      frozenRunDigest,
      runConfigArtifactBindingDigest,
      runtimeResourceSetId: 'runtime-resource-set.release.1',
      registrationIntent,
      registrationIntentDigest: registrationIntent.intentDigest,
      ...identity(protocolFamily),
      protocolFamily,
      providerConfigurationDigest,
      capabilityProfileId: program.profileProjection.capabilityProfileId as
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document',
      capabilityProfileDigest:
        program.profileProjection.capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest:
        publicResource.descriptor.descriptorDigest,
      budgetReservationAuthority,
      budgetReservationAuthorityDigest:
        budgetReservationAuthority.authorityDigest,
      networkPolicyAuthority,
      networkPolicyAuthorityDigest: networkPolicyAuthority.authorityDigest,
      minimumExpiresAt: '2026-08-09T08:00:00.000Z',
    });
  const deletionRequestProjection =
    createAgentHostedRetrievalRuntimeResourceDeletionRequestProjection({
      registrationRequestDigest: registrationRequest.requestDigest,
      runtimeResourceSetId: registrationRequest.runtimeResourceSetId,
      protocolFamily,
      providerResourceId,
      auxiliaryResourceIds: Object.freeze([]),
    });
  const deletionAuthorityReceipt =
    createAgentHostedRetrievalRuntimeResourceDeletionAuthorityReceipt({
      registrationRequest,
      resourceManifestDigest: digest('resource-manifest'),
      deletionRequestProjection,
      registeredAt: '2026-08-09T06:00:00.000Z',
      expiresAt: '2026-08-09T08:00:00.000Z',
    });
  const authority = createAgentHostedRetrievalRuntimeResourceAuthority(
    registrationRequest,
    {
      providerResourceId,
      auxiliaryResourceIds: Object.freeze([]),
      resourceManifestDigest: digest('resource-manifest'),
      contentUploadReceiptDigest: digest('content-upload'),
      creationDispatchIntentSetDigest: digest('creation-dispatch-set'),
      creationTransportReceiptSetDigest: digest('creation-transport-set'),
      creationResultSpoolReceiptSetDigest: digest('creation-spool-set'),
      deletionAuthorityReceipt,
      registeredAt: '2026-08-09T06:00:00.000Z',
      expiresAt: '2026-08-09T08:00:00.000Z',
    }
  );
  const resourceSetCommitment = commitmentFor(authority);
  const readRequest = createAgentHostedRetrievalRuntimeResourceReadRequest({
    namespaceId: registrationRequest.namespaceId,
    repositoryCommit: registrationRequest.repositoryCommit,
    planDigest: authority.planDigest,
    runConfigArtifactBindingDigest: authority.runConfigArtifactBindingDigest,
    runtimeResourceSetId: authority.runtimeResourceSetId,
    authorityDigest: authority.authorityDigest,
    resourceSetCommitmentDigest: resourceSetCommitment.commitmentDigest,
    readerOwnerInstanceId: 'hosted-owner.release.1',
    readLeaseId: `read-lease.${protocolFamily}.1`,
    minimumExpiresAt: '2026-08-09T07:02:35.000Z',
  });
  const activeState = createAgentHostedRetrievalRuntimeResourceActiveState(
    authority,
    resourceSetCommitment,
    {
      activeOwnerInstanceId: readRequest.readerOwnerInstanceId,
      claimGeneration: 1,
      readLeaseNotAfter: '2026-08-09T07:03:00.000Z',
      updatedAt: observedAt,
    }
  );
  const readReceipt = createAgentHostedRetrievalRuntimeResourceReadReceipt(
    readRequest,
    authority,
    resourceSetCommitment,
    {
      activeState,
      checkedAt: observedAt,
      expiresAt: '2026-08-09T07:02:40.000Z',
    }
  );
  return Object.freeze({ authority, readRequest, readReceipt });
};

const material = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: AgentNativeProviderProtocol,
  operation: AgentNativeProviderCapabilityRuntimeOperation,
  stateHandle: string | null = null
): AgentNativeProviderCapabilityRuntimeRequestMaterial => {
  const retrieval = operation === 'hosted-retrieval-query';
  const cache = operation === 'cache-cold' || operation === 'cache-warm';
  const base =
    operation === 'background-submit' || operation === 'continuation-parent'
      ? Object.freeze({
          model: identity(protocolFamily).modelId,
          input: 'bounded runtime capability source request',
        })
      : null;
  const resource =
    retrieval && protocolFamily !== 'anthropic-messages'
      ? runtimeResource(program, protocolFamily)
      : null;
  return createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
    ...identity(protocolFamily),
    operation,
    callbackLocalBaseRequestBody: base,
    callbackLocalProviderStateHandle: stateHandle,
    providerResourceAuthority: resource?.authority ?? null,
    providerResourceReadRequest: resource?.readRequest ?? null,
    providerResourceReadReceipt: resource?.readReceipt ?? null,
    cacheKeyDigest: cache ? digest('runtime-cache-key') : null,
    observedAt,
  });
};

const openAiResponse = (input: {
  id: string;
  status?: string;
  text?: string;
  cachedTokens?: number;
  citationResourceIds?: readonly string[];
}) =>
  Object.freeze({
    object: 'response',
    id: input.id,
    status: input.status ?? 'completed',
    output: Object.freeze(
      input.text === undefined
        ? []
        : [
            Object.freeze({
              type: 'message',
              content: Object.freeze([
                Object.freeze({
                  type: 'output_text',
                  text: input.text,
                  ...(input.citationResourceIds === undefined
                    ? {}
                    : {
                        annotations: Object.freeze(
                          input.citationResourceIds.map((fileId) =>
                            Object.freeze({
                              type: 'file_citation',
                              file_id: fileId,
                            })
                          )
                        ),
                      }),
                }),
              ]),
            }),
          ]
    ),
    usage: Object.freeze({
      input_tokens: 4_200,
      output_tokens: 8,
      input_tokens_details: Object.freeze({
        cached_tokens: input.cachedTokens ?? 0,
      }),
    }),
  });

const geminiResponse = (input: {
  id: string;
  status?: string;
  text?: string;
  cachedTokens?: number;
  citationResourceIds?: readonly string[];
}) =>
  Object.freeze({
    id: input.id,
    status: input.status ?? 'completed',
    steps: Object.freeze(
      input.text === undefined
        ? []
        : [
            Object.freeze({
              type: 'model_output',
              text: input.text,
              ...(input.citationResourceIds === undefined
                ? {}
                : {
                    content: Object.freeze([
                      Object.freeze({
                        type: 'text',
                        text: input.text,
                        annotations: Object.freeze(
                          input.citationResourceIds.map((documentUri) =>
                            Object.freeze({
                              type: 'file_citation',
                              document_uri: documentUri,
                            })
                          )
                        ),
                      }),
                    ]),
                  }),
            }),
          ]
    ),
    usage: Object.freeze({
      total_input_tokens: 4_200,
      total_output_tokens: 8,
      total_cached_tokens: input.cachedTokens ?? 0,
    }),
  });

const anthropicResponse = (cachedTokens: number) =>
  Object.freeze({
    id: 'msg_runtime_cache',
    type: 'message',
    role: 'assistant',
    content: Object.freeze([
      Object.freeze({ type: 'text', text: 'bounded cache result' }),
    ]),
    stop_reason: 'end_turn',
    usage: Object.freeze({
      input_tokens: 4_200,
      output_tokens: 8,
      cache_read_input_tokens: cachedTokens,
    }),
  });

const decodeReceived = (
  program: AgentCapabilityProbeProgram,
  request: AgentNativeProviderCapabilityRuntimeRequestMaterial,
  response: unknown
) =>
  decodeAgentNativeProviderCapabilityRuntimeResponse(
    program,
    request.projection,
    {
      transportOutcome: 'received',
      httpStatus: 200,
      responseBodyDigest: digestAgentCanonicalValue(response),
      sealedResponseJson: response as never,
      observedAt,
    }
  );

describe('native Provider shared-capability runtime codec', () => {
  it('freezes OpenAI background submit/poll and Gemini continuation JSON wire', () => {
    const background = programFor('g4-provider-background-job');
    const submit = material(
      background,
      'openai-responses',
      'background-submit'
    );
    expect(submit.callbackLocalPath).toBe('/v1/responses');
    expect(submit.callbackLocalBody).toMatchObject({
      stream: false,
      store: true,
      background: true,
    });
    expect(submit.projection).toMatchObject({
      pathTemplate: '/v1/responses',
      responseQuery: null,
      stream: false,
      store: true,
      background: true,
    });
    expect(
      isAgentNativeProviderCapabilityRuntimeRequestProjection(
        submit.projection,
        background
      )
    ).toBe(true);
    expect(
      isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(
        submit.projection
      )
    ).toBe(true);

    const poll = material(
      background,
      'openai-responses',
      'background-poll',
      'resp_runtime_background'
    );
    expect(poll.callbackLocalPath).toBe(
      '/v1/responses/resp_runtime_background'
    );
    expect(poll.callbackLocalBody).toBeNull();
    expect(JSON.stringify(poll.projection)).not.toContain(
      'resp_runtime_background'
    );

    const continuation = programFor('g4-provider-reasoning-continuation');
    const resume = material(
      continuation,
      'gemini-interactions',
      'continuation-resume',
      'interaction_parent_runtime'
    );
    expect(resume.callbackLocalPath).toBe('/v1/interactions?alt=json');
    expect(resume.callbackLocalBody).toMatchObject({
      previous_interaction_id: 'interaction_parent_runtime',
      stream: false,
      store: false,
      background: false,
    });
    expect(resume.projection).toMatchObject({
      apiVersion: 'v1',
      pathTemplate: '/v1/interactions',
      responseQuery: 'alt=json',
      responseMode: 'application-json',
    });
  });

  it('completes OpenAI continuation once and keeps callback handles out of durable projections', () => {
    const program = programFor('g4-provider-reasoning-continuation');
    const parent = material(program, 'openai-responses', 'continuation-parent');
    expect(parent.callbackLocalBody).toMatchObject({
      stream: false,
      store: true,
      background: false,
    });
    const parentResult = decodeReceived(
      program,
      parent,
      openAiResponse({
        id: 'resp_runtime_parent_once',
        text: 'parent stored',
      })
    );
    expect(parentResult.projection).toMatchObject({
      providerStatus: 'completed',
      denialKind: null,
    });
    expect(JSON.stringify(parentResult.projection)).not.toContain(
      'resp_runtime_parent_once'
    );

    const resume = material(
      program,
      'openai-responses',
      'continuation-resume',
      parentResult.callbackLocalProviderStateHandle
    );
    expect(resume.callbackLocalBody).toMatchObject({
      previous_response_id: 'resp_runtime_parent_once',
      store: false,
    });
    expect(JSON.stringify(resume.projection)).not.toContain(
      'resp_runtime_parent_once'
    );
    const resumed = decodeReceived(
      program,
      resume,
      openAiResponse({
        id: 'resp_runtime_resume_once',
        text: 'resumed terminal result',
      })
    );
    expect(resumed.projection).toMatchObject({
      providerStatus: 'completed',
      terminalEventType: 'completed',
      denialKind: null,
    });
  });

  it('accepts Gemini background submission and requires a terminal poll', () => {
    const program = programFor('g4-provider-background-job');
    const submit = material(
      program,
      'gemini-interactions',
      'background-submit'
    );
    expect(submit.callbackLocalPath).toBe('/v1/interactions?alt=json');
    expect(submit.projection).toMatchObject({
      apiVersion: 'v1',
      pathTemplate: '/v1/interactions',
      responseQuery: 'alt=json',
      background: true,
      store: true,
    });
    const submitted = decodeReceived(
      program,
      submit,
      geminiResponse({
        id: 'interaction_runtime_background',
        status: 'in_progress',
      })
    );
    expect(submitted.projection).toMatchObject({
      providerStatus: 'in-progress',
      terminalEventType: null,
      denialKind: null,
    });
    expect(JSON.stringify(submitted.projection)).not.toContain(
      'interaction_runtime_background'
    );

    const poll = material(
      program,
      'gemini-interactions',
      'background-poll',
      submitted.callbackLocalProviderStateHandle
    );
    expect(poll.callbackLocalPath).toBe(
      '/v1/interactions/interaction_runtime_background?alt=json'
    );
    const stillRunning = decodeReceived(
      program,
      poll,
      geminiResponse({
        id: 'interaction_runtime_background',
        status: 'queued',
      })
    );
    expect(stillRunning.projection).toMatchObject({
      denialKind: null,
      providerStatus: 'queued',
    });
    const terminal = decodeReceived(
      program,
      poll,
      geminiResponse({
        id: 'interaction_runtime_background',
        status: 'completed',
        text: 'bounded terminal background result',
      })
    );
    expect(terminal.projection).toMatchObject({
      providerStatus: 'completed',
      terminalEventType: 'completed',
      denialKind: null,
    });
  });

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'requires real cold-to-warm cache usage for %s',
    (protocolFamily) => {
      const program = programFor('g4-provider-isolated-cache');
      const cold = material(program, protocolFamily, 'cache-cold');
      const warm = material(program, protocolFamily, 'cache-warm');
      expect(cold.projection.cachePrefixDescriptorDigest).toBe(
        program.providerRequestIntent.cachePrefixResource?.descriptorDigest
      );
      if (protocolFamily === 'openai-responses') {
        expect(cold.callbackLocalBody).toMatchObject({
          prompt_cache_key: expect.stringContaining('runtime-cache.'),
          stream: false,
          store: false,
        });
      }
      const coldResult = decodeReceived(
        program,
        cold,
        protocolFamily === 'openai-responses'
          ? openAiResponse({ id: 'resp_cache_cold', cachedTokens: 0 })
          : geminiResponse({ id: 'interaction_cache_cold', cachedTokens: 0 })
      );
      const warmResult = decodeReceived(
        program,
        warm,
        protocolFamily === 'openai-responses'
          ? openAiResponse({ id: 'resp_cache_warm', cachedTokens: 1_024 })
          : geminiResponse({
              id: 'interaction_cache_warm',
              cachedTokens: 4_096,
            })
      );
      expect(coldResult.projection.denialKind).toBeNull();
      expect(coldResult.projection.cachedTokenCount).toBe(0);
      expect(warmResult.projection.denialKind).toBeNull();
      expect(warmResult.projection.cachedTokenCount).toBeGreaterThan(0);
      const warmAuthority =
        createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(program, {
          coldRequest: cold.projection,
          coldResponse: coldResult.projection,
          warmRequest: warm.projection,
          preparedAt: observedAt,
          expiresAt: '2026-08-09T07:02:05.000Z',
        });
      expect(warmAuthority).toMatchObject({
        coldCachedTokenCount: 0,
        coldRequestDigest: cold.projection.requestDigest,
        warmRequestDigest: warm.projection.requestDigest,
      });

      const missingWarm = decodeReceived(
        program,
        warm,
        protocolFamily === 'openai-responses'
          ? openAiResponse({ id: 'resp_cache_missing', cachedTokens: 0 })
          : geminiResponse({ id: 'interaction_cache_missing', cachedTokens: 0 })
      );
      expect(missingWarm.projection.denialKind).toBe('response-invalid');
    }
  );

  it('binds Anthropic cache cold/warm directives to reported cache usage', () => {
    const program = programFor('g4-provider-isolated-cache');
    const cold = material(program, 'anthropic-messages', 'cache-cold');
    const warm = material(program, 'anthropic-messages', 'cache-warm');
    expect(cold.callbackLocalBody).toMatchObject({ stream: false });
    expect(
      (
        cold.callbackLocalBody as {
          messages: readonly [
            { content: readonly [{ cache_control: unknown }] },
          ];
        }
      ).messages[0].content[0].cache_control
    ).toEqual({ type: 'ephemeral', ttl: '5m' });
    const coldResult = decodeReceived(program, cold, anthropicResponse(0));
    const warmResult = decodeReceived(program, warm, anthropicResponse(4_096));
    expect(coldResult.projection).toMatchObject({
      cachedTokenCount: 0,
      denialKind: null,
    });
    expect(warmResult.projection).toMatchObject({
      cachedTokenCount: 4_096,
      denialKind: null,
    });
    expect(
      createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(program, {
        coldRequest: cold.projection,
        coldResponse: coldResult.projection,
        warmRequest: warm.projection,
        preparedAt: observedAt,
        expiresAt: '2026-08-09T07:02:05.000Z',
      })
    ).toMatchObject({
      protocolFamily: 'anthropic-messages',
      coldCachedTokenCount: 0,
    });
  });

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'binds hosted retrieval to a live %s resource and a real marker',
    (protocolFamily) => {
      const program = programFor('g4-provider-hosted-retrieval-document');
      const citationResourceId =
        protocolFamily === 'openai-responses'
          ? 'vs_runtime_retrieval'
          : 'fileSearchStores/runtime-retrieval';
      const request = material(
        program,
        protocolFamily,
        'hosted-retrieval-query'
      );
      expect(request.callbackLocalBody).toMatchObject({
        tools: [
          expect.objectContaining({
            type: 'file_search',
          }),
        ],
        stream: false,
        store: false,
      });
      const result = decodeReceived(
        program,
        request,
        createAgentHostedRetrievalProviderResponseFixture({
          protocolFamily,
          responseId:
            protocolFamily === 'openai-responses'
              ? 'resp_retrieval_runtime'
              : 'interaction_retrieval_runtime',
          citationResourceId,
        })
      );
      expect(result.projection.denialKind).toBeNull();
      expect(result.projection.outputMarkerObserved).toBe(true);
      expect(result.projection.retrievalCitationResourceId).toBe(
        citationResourceId
      );
      expect(
        isAgentNativeProviderCapabilityRuntimeResponseProjection(
          result.projection,
          request.projection
        )
      ).toBe(true);
    }
  );

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'rejects ambiguous, malformed, oversized, and secret-bearing %s citations',
    (protocolFamily) => {
      const program = programFor('g4-provider-hosted-retrieval-document');
      const request = material(
        program,
        protocolFamily,
        'hosted-retrieval-query'
      );
      const responseFor = (citationResourceIds: readonly string[]) =>
        protocolFamily === 'openai-responses'
          ? openAiResponse({
              id: 'resp_retrieval_rejected',
              text: 'prodivix-capability-probe-v1',
              citationResourceIds,
            })
          : geminiResponse({
              id: 'interaction_retrieval_rejected',
              text: 'prodivix-capability-probe-v1',
              citationResourceIds,
            });
      expect(() =>
        decodeReceived(
          program,
          request,
          responseFor(Object.freeze(['resource.one', 'resource.two']))
        )
      ).toThrow(/ambiguous/u);
      expect(() =>
        decodeReceived(
          program,
          request,
          responseFor(Object.freeze([`r${'x'.repeat(256)}`]))
        )
      ).toThrow(/citation is invalid/u);

      const malformed =
        protocolFamily === 'openai-responses'
          ? Object.freeze({
              object: 'response',
              id: 'resp_retrieval_malformed',
              status: 'completed',
              output: Object.freeze([
                Object.freeze({
                  type: 'message',
                  content: Object.freeze([
                    Object.freeze({
                      type: 'output_text',
                      text: 'prodivix-capability-probe-v1',
                      annotations: Object.freeze({ invalid: true }),
                    }),
                  ]),
                }),
              ]),
              usage: Object.freeze({
                input_tokens: 64,
                output_tokens: 8,
                input_tokens_details: Object.freeze({ cached_tokens: 0 }),
              }),
            })
          : Object.freeze({
              id: 'interaction_retrieval_malformed',
              status: 'completed',
              steps: Object.freeze([
                Object.freeze({
                  type: 'model_output',
                  text: 'prodivix-capability-probe-v1',
                  annotations: Object.freeze({ invalid: true }),
                }),
              ]),
              usage: Object.freeze({
                total_input_tokens: 64,
                total_output_tokens: 8,
                total_cached_tokens: 0,
              }),
            });
      expect(() => decodeReceived(program, request, malformed)).toThrow(
        /annotations are invalid/u
      );

      const secretCanary = 'citation-secret-canary';
      const secretResponse = responseFor(Object.freeze([secretCanary]));
      expect(() =>
        decodeAgentNativeProviderCapabilityRuntimeResponse(
          program,
          request.projection,
          {
            transportOutcome: 'received',
            httpStatus: 200,
            responseBodyDigest: digestAgentCanonicalValue(secretResponse),
            sealedResponseJson: secretResponse,
            observedAt,
          },
          {
            protectedMaterialCanaries: Object.freeze([]),
            secretCanaries: Object.freeze([secretCanary]),
          }
        )
      ).toThrow(/no-leak|unsafe|secret/u);
    }
  );

  it('keeps unavailable Anthropic operations and mixed inputs fail-closed', () => {
    const background = programFor('g4-provider-background-job');
    const continuation = programFor('g4-provider-reasoning-continuation');
    const retrieval = programFor('g4-provider-hosted-retrieval-core');
    for (const [program, operation] of [
      [background, 'background-submit'],
      [continuation, 'continuation-parent'],
      [retrieval, 'hosted-retrieval-query'],
    ] as const) {
      expect(
        resolveAgentNativeProviderCapabilityRuntimeCodecAvailability(
          'anthropic-messages',
          operation
        ).availability
      ).toBe('unavailable');
      expect(() => material(program, 'anthropic-messages', operation)).toThrow(
        /invalid/u
      );
    }

    expect(() =>
      material(
        programFor('g4-provider-isolated-cache'),
        'openai-responses',
        'background-submit'
      )
    ).toThrow(/invalid/u);
  });

  it('rejects request swaps and unsafe or digest-drifted denial bodies', () => {
    const program = programFor('g4-provider-background-job');
    const request = material(program, 'openai-responses', 'background-submit');
    expect(
      isAgentNativeProviderCapabilityRuntimeRequestProjection(
        {
          ...request.projection,
          modelLineageDigest: digest('swapped-lineage'),
        },
        program
      )
    ).toBe(false);
    for (const drifted of [
      { ...request.projection, pathTemplate: '/v1/interactions' },
      { ...request.projection, responseQuery: 'alt=json' },
      { ...request.projection, requestBodyDigest: digest('swapped-body') },
      { ...request.projection, requestDigest: digest('swapped-request') },
    ]) {
      expect(
        isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(drifted)
      ).toBe(false);
    }

    const denial = Object.freeze({
      error: Object.freeze({ message: 'bounded provider denial' }),
    });
    expect(() =>
      decodeAgentNativeProviderCapabilityRuntimeResponse(
        program,
        request.projection,
        {
          transportOutcome: 'received',
          httpStatus: 400,
          responseBodyDigest: digest('swapped-denial-body'),
          sealedResponseJson: denial,
          observedAt,
        }
      )
    ).toThrow(/digest-drifted/u);
    expect(() =>
      decodeAgentNativeProviderCapabilityRuntimeResponse(
        program,
        request.projection,
        {
          transportOutcome: 'received',
          httpStatus: 400,
          responseBodyDigest: digestAgentCanonicalValue({
            error: { message: 'secret-runtime-canary' },
          }),
          sealedResponseJson: Object.freeze({
            error: Object.freeze({ message: 'secret-runtime-canary' }),
          }),
          observedAt,
        },
        {
          protectedMaterialCanaries: Object.freeze([]),
          secretCanaries: Object.freeze(['secret-runtime-canary']),
        }
      )
    ).toThrow(/no-leak|unsafe/u);
    const oversized = Object.freeze({
      padding: 'x'.repeat(program.hardLimits.maximumResponseBytes + 1),
    });
    expect(() =>
      decodeAgentNativeProviderCapabilityRuntimeResponse(
        program,
        request.projection,
        {
          transportOutcome: 'received',
          httpStatus: 400,
          responseBodyDigest: digestAgentCanonicalValue(oversized),
          sealedResponseJson: oversized,
          observedAt,
        }
      )
    ).toThrow(/byte limit|maximum|unbounded/u);
  });
});
