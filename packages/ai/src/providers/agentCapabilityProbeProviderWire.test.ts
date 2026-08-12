import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
  type AgentCapabilityProbeProfileId,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';
import {
  createAgentCapabilityProbeProviderRequestPolicy,
  type AgentCapabilityProbeProviderRequestPolicy,
} from './agentCapabilityProbeProviderRequest';
import { createAgentCapabilityProbeProviderResourceAuthority } from './agentCapabilityProbeProviderResource';
import {
  createAgentCapabilityProbeProviderExecutionEvidence,
  createAgentCapabilityProbeProviderRequestMaterial,
  decodeAgentCapabilityProbeProviderPhaseResponse,
  isAgentCapabilityProbeProviderRequestProjection,
  matchAgentCapabilityProbeProviderPhaseObservation,
  matchAgentCapabilityProbeProviderRequestMaterial,
  type AgentCapabilityProbeProviderPhaseRecord,
  type AgentCapabilityProbeProviderRequestMaterial,
} from './agentCapabilityProbeProviderWire';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';

const observedAt = '2026-08-09T05:00:00.000Z';
const digest = (label: string) => digestAgentCanonicalValue({ label });

const programFor = (profileId: AgentCapabilityProbeProfileId) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId: profileId,
    capabilityProfileDigest: digestAgentCapabilityProbeProfile(profileId),
  });

const binding = (protocolFamily: AgentNativeProviderProtocol) =>
  Object.freeze({
    protocolFamily,
    providerConfigurationId: `provider.release.${protocolFamily}`,
    modelId: `model.release.${protocolFamily}`,
    modelLineageDigest: digest(`lineage.${protocolFamily}`),
    adapterDigest: digest(`adapter.${protocolFamily}`),
  });

const resourceAuthority = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: 'gemini-interactions' | 'openai-responses'
) => {
  const common = binding(protocolFamily);
  return createAgentCapabilityProbeProviderResourceAuthority(program, {
    ...common,
    providerResourceId:
      protocolFamily === 'openai-responses'
        ? 'vs_capability_probe'
        : 'fileSearchStores/capability-probe',
    resourceManifestDigest: digest('resource-manifest'),
    contentUploadReceiptDigest: digest('resource-upload'),
    deletionAuthorityReceiptDigest: digest('resource-delete'),
    registeredAt: '2026-08-09T04:00:00.000Z',
    expiresAt: '2026-08-09T06:00:00.000Z',
  });
};

const policyAndMaterial = (
  program: AgentCapabilityProbeProgram,
  protocolFamily: AgentNativeProviderProtocol,
  sequence: number,
  stateHandle: string | null = null
): Readonly<{
  policy: AgentCapabilityProbeProviderRequestPolicy;
  material: AgentCapabilityProbeProviderRequestMaterial;
}> => {
  const authority =
    program.profileProjection.capabilityId === 'provider.hosted-retrieval' &&
    protocolFamily !== 'anthropic-messages'
      ? resourceAuthority(program, protocolFamily)
      : null;
  const policy = createAgentCapabilityProbeProviderRequestPolicy(program, {
    ...binding(protocolFamily),
    sequence,
    observedAt,
    providerResourceAuthority: authority,
  });
  return Object.freeze({
    policy,
    material: createAgentCapabilityProbeProviderRequestMaterial(
      program,
      policy,
      {
        observedAt,
        providerStateHandle: stateHandle,
        providerResourceAuthority: authority,
      }
    ),
  });
};

const record = (
  policy: AgentCapabilityProbeProviderRequestPolicy,
  material: AgentCapabilityProbeProviderRequestMaterial,
  observation: AgentCapabilityProbeProviderPhaseRecord['observation']
): AgentCapabilityProbeProviderPhaseRecord =>
  Object.freeze({
    policy,
    requestProjection: material.projection,
    observation,
  });

const openAIResponse = (
  id: string,
  input: Readonly<{
    status?: string;
    text?: string;
    cachedTokens?: number;
    toolCalls?: readonly Readonly<{
      id: string;
      name: string;
    }>[];
  }> = {}
) =>
  Object.freeze({
    object: 'response',
    id,
    status: input.status ?? 'completed',
    output: Object.freeze([
      ...(input.text === undefined
        ? []
        : [
            Object.freeze({
              type: 'message',
              content: Object.freeze([
                Object.freeze({ type: 'output_text', text: input.text }),
              ]),
            }),
          ]),
      ...(input.toolCalls ?? []).map(({ id: callId, name }) =>
        Object.freeze({
          type: 'function_call',
          id: callId,
          call_id: callId,
          name,
          arguments: '{"marker":"prodivix-capability-probe-v1"}',
        })
      ),
    ]),
    usage: Object.freeze({
      input_tokens: 64,
      output_tokens: 8,
      input_tokens_details: Object.freeze({
        cached_tokens: input.cachedTokens ?? 0,
      }),
    }),
  });

const anthropicResponse = (cachedTokens: number) =>
  Object.freeze({
    type: 'message',
    id: `msg_cache_${cachedTokens}`,
    stop_reason: 'end_turn',
    content: Object.freeze([
      Object.freeze({ type: 'text', text: 'cache probe completed' }),
    ]),
    usage: Object.freeze({
      input_tokens: 4_200,
      output_tokens: 8,
      cache_read_input_tokens: cachedTokens,
      cache_creation_input_tokens: cachedTokens === 0 ? 4_096 : 0,
    }),
  });

const geminiResponse = (
  id: string,
  input: Readonly<{
    text?: string;
    cachedTokens?: number;
    status?: string;
  }> = {}
) =>
  Object.freeze({
    id,
    status: input.status ?? 'completed',
    steps: Object.freeze([
      Object.freeze({
        type: 'model_output',
        text: input.text ?? 'probe completed',
      }),
    ]),
    usage: Object.freeze({
      total_input_tokens: 64,
      total_output_tokens: 8,
      total_cached_tokens: input.cachedTokens ?? 0,
    }),
  });

describe('capability probe Provider request wire', () => {
  it('materializes OpenAI background and Gemini continuation state only in callback-local wire', () => {
    const background = programFor('g4-provider-background-job');
    const submit = policyAndMaterial(background, 'openai-responses', 0);
    expect(submit.material.callbackLocalPath).toBe('/v1/responses');
    expect(submit.material.callbackLocalBody).toMatchObject({
      model: binding('openai-responses').modelId,
      background: true,
      store: true,
      stream: false,
    });
    const poll = policyAndMaterial(
      background,
      'openai-responses',
      1,
      'resp_background_1'
    );
    expect(poll.material.callbackLocalPath).toBe(
      '/v1/responses/resp_background_1'
    );
    expect(poll.material.callbackLocalBody).toBeNull();
    expect(JSON.stringify(poll.material.projection)).not.toContain(
      'resp_background_1'
    );

    const continuation = programFor('g4-provider-reasoning-continuation');
    const resume = policyAndMaterial(
      continuation,
      'gemini-interactions',
      1,
      'interaction_parent_1'
    );
    expect(resume.material.callbackLocalPath).toBe('/v1/interactions?alt=json');
    expect(resume.material.projection).toMatchObject({
      apiVersion: 'v1',
      responseQuery: 'alt=json',
    });
    expect(resume.material.callbackLocalBody).toMatchObject({
      previous_interaction_id: 'interaction_parent_1',
      store: true,
      background: false,
    });
    expect(
      isAgentCapabilityProbeProviderRequestProjection(
        resume.material.projection,
        continuation,
        resume.policy
      )
    ).toBe(true);

    const backgroundSubmit = policyAndMaterial(
      background,
      'gemini-interactions',
      0
    );
    const backgroundPoll = policyAndMaterial(
      background,
      'gemini-interactions',
      1,
      'interaction_background_1'
    );
    expect(backgroundSubmit.material.callbackLocalPath).toBe(
      '/v1/interactions?alt=json'
    );
    expect(backgroundPoll.material.callbackLocalPath).toBe(
      '/v1/interactions/interaction_background_1?alt=json'
    );
  });

  it.each([
    ['openai-responses', 'prompt_cache_key'],
    ['anthropic-messages', 'cache_control'],
    ['gemini-interactions', 'input'],
  ] as const)(
    'materializes the repo-owned cold/warm cache prefix for %s',
    (protocolFamily, expectedField) => {
      const program = programFor('g4-provider-isolated-cache');
      const cold = policyAndMaterial(program, protocolFamily, 0);
      const warm = policyAndMaterial(program, protocolFamily, 1);
      const coldText = JSON.stringify(cold.material.callbackLocalBody);
      const warmText = JSON.stringify(warm.material.callbackLocalBody);
      expect(coldText).toContain('Cold pass');
      expect(warmText).toContain('Warm pass');
      expect(coldText).toContain('prodivix prodivix');
      expect(coldText).toContain(expectedField);
      expect(cold.material.projection.bodyDigest).not.toBe(
        warm.material.projection.bodyDigest
      );
    }
  );

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'binds %s hosted retrieval to a fresh dynamic resource authority',
    (protocolFamily) => {
      const program = programFor('g4-provider-hosted-retrieval-core');
      const { policy, material } = policyAndMaterial(
        program,
        protocolFamily,
        0
      );
      expect(material.callbackLocalBody).toMatchObject({
        tools: [
          {
            type: 'file_search',
            [protocolFamily === 'openai-responses'
              ? 'vector_store_ids'
              : 'file_search_store_names']:
              protocolFamily === 'openai-responses'
                ? ['vs_capability_probe']
                : ['fileSearchStores/capability-probe'],
          },
        ],
      });
      expect(JSON.stringify(material.callbackLocalBody)).not.toContain(
        'prodivix-capability-probe-v1'
      );
      expect(
        matchAgentCapabilityProbeProviderRequestMaterial(
          material,
          program,
          policy,
          {
            observedAt,
            providerStateHandle: null,
            providerResourceAuthority: resourceAuthority(
              program,
              protocolFamily
            ),
          }
        )
      ).toBe(true);
    }
  );

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'materializes exact two-tool parallel policy for %s',
    (protocolFamily) => {
      const program = programFor('g4-provider-parallel-tool');
      const { material } = policyAndMaterial(program, protocolFamily, 0);
      const body = material.callbackLocalBody as Readonly<
        Record<string, unknown>
      >;
      expect(body.tools).toHaveLength(2);
      expect(JSON.stringify(body.tools)).toContain('capability_probe_alpha');
      expect(JSON.stringify(body.tools)).toContain('capability_probe_beta');
      if (protocolFamily === 'openai-responses') {
        expect(body).toMatchObject({
          tool_choice: 'required',
          parallel_tool_calls: true,
        });
      }
      if (protocolFamily === 'anthropic-messages') {
        expect(body.tool_choice).toEqual({
          type: 'any',
          disable_parallel_tool_use: false,
        });
      }
      if (protocolFamily === 'gemini-interactions') {
        expect(material.callbackLocalPath).toBe('/v1/interactions?alt=sse');
      }
    }
  );

  it('keeps unavailable Anthropic background, retrieval, and continuation fail-closed', () => {
    for (const profileId of [
      'g4-provider-background-job',
      'g4-provider-hosted-retrieval-core',
      'g4-provider-reasoning-continuation',
    ] as const) {
      const program = programFor(profileId);
      expect(() => policyAndMaterial(program, 'anthropic-messages', 0)).toThrow(
        /policy is invalid/u
      );
    }
  });

  it('rejects state, resource, and fully recomputed projection swaps', () => {
    const program = programFor('g4-provider-background-job');
    expect(() =>
      policyAndMaterial(program, 'openai-responses', 1, null)
    ).toThrow(/state reference is invalid/u);
    expect(() =>
      policyAndMaterial(
        programFor('g4-provider-hosted-retrieval-core'),
        'openai-responses',
        0,
        null
      )
    ).not.toThrow();
    const { policy, material } = policyAndMaterial(
      program,
      'openai-responses',
      0
    );
    const { projectionDigest: _projectionDigest, ...base } = {
      ...material.projection,
      publicPayloadDigest: digest('swapped-payload'),
    };
    const tampered = Object.freeze({
      ...base,
      projectionDigest: digestAgentCanonicalValue(base),
    });
    expect(
      isAgentCapabilityProbeProviderRequestProjection(tampered, program, policy)
    ).toBe(false);
  });
});

describe('capability probe sealed Provider phase response', () => {
  it('closes a real OpenAI background submit/poll lifecycle', () => {
    const program = programFor('g4-provider-background-job');
    const submit = policyAndMaterial(program, 'openai-responses', 0);
    const submitted = decodeAgentCapabilityProbeProviderPhaseResponse(
      program,
      submit.policy,
      {
        requestProjection: submit.material.projection,
        priorPhases: Object.freeze([]),
        requestLeafDigest: digest('background-submit-request'),
        responseLeafDigest: digest('background-submit-response'),
        transportOutcome: 'received',
        httpStatus: 200,
        responseBody: openAIResponse('resp_background_1', {
          status: 'queued',
        }),
        observedAt,
      }
    );
    expect(submitted).toMatchObject({
      callbackLocalProviderStateHandle: 'resp_background_1',
      observation: {
        phase: 'submit',
        programTerminal: false,
        providerJobStatus: 'queued',
      },
    });
    const submitRecord = record(
      submit.policy,
      submit.material,
      submitted.observation
    );
    const poll = policyAndMaterial(
      program,
      'openai-responses',
      1,
      submitted.callbackLocalProviderStateHandle
    );
    const completed = decodeAgentCapabilityProbeProviderPhaseResponse(
      program,
      poll.policy,
      {
        requestProjection: poll.material.projection,
        priorPhases: Object.freeze([submitRecord]),
        requestLeafDigest: digest('background-poll-request'),
        responseLeafDigest: digest('background-poll-response'),
        transportOutcome: 'received',
        httpStatus: 200,
        responseBody: openAIResponse('resp_background_1', {
          status: 'completed',
          text: 'completed',
        }),
        observedAt,
      }
    );
    expect(completed.observation).toMatchObject({
      programTerminal: true,
      providerJobStatus: 'completed',
      denial: null,
      semanticProof: { proofKind: 'background-job-lifecycle' },
      observedFacts: [{ factKind: 'provider-job-receipt' }],
    });
    const evidence = createAgentCapabilityProbeProviderExecutionEvidence(
      program,
      Object.freeze([
        submitRecord,
        record(poll.policy, poll.material, completed.observation),
      ])
    );
    expect(evidence).toMatchObject({
      status: 'supported',
      semanticProofPhaseLeaves: {
        proofKind: 'background-job-lifecycle',
      },
    });
  });

  it.each([
    [
      'openai-responses',
      openAIResponse('resp_cache_cold', { cachedTokens: 0 }),
      openAIResponse('resp_cache_warm', { cachedTokens: 12 }),
    ],
    ['anthropic-messages', anthropicResponse(0), anthropicResponse(12)],
    [
      'gemini-interactions',
      geminiResponse('interaction_cache_cold', { cachedTokens: 0 }),
      geminiResponse('interaction_cache_warm', { cachedTokens: 12 }),
    ],
  ] as const)(
    'closes exact cold-zero/warm-positive cache evidence for %s',
    (protocolFamily, coldBody, warmBody) => {
      const program = programFor('g4-provider-isolated-cache');
      const cold = policyAndMaterial(program, protocolFamily, 0);
      const coldResult = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        cold.policy,
        {
          requestProjection: cold.material.projection,
          priorPhases: Object.freeze([]),
          requestLeafDigest: digest(`${protocolFamily}.cold-request`),
          responseLeafDigest: digest(`${protocolFamily}.cold-response`),
          transportOutcome: 'received',
          httpStatus: 200,
          responseBody: coldBody,
          observedAt,
        }
      );
      expect(coldResult.observation).toMatchObject({
        programTerminal: false,
        cachedTokenCount: 0,
      });
      const coldRecord = record(
        cold.policy,
        cold.material,
        coldResult.observation
      );
      const warm = policyAndMaterial(program, protocolFamily, 1);
      const warmResult = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        warm.policy,
        {
          requestProjection: warm.material.projection,
          priorPhases: Object.freeze([coldRecord]),
          requestLeafDigest: digest(`${protocolFamily}.warm-request`),
          responseLeafDigest: digest(`${protocolFamily}.warm-response`),
          transportOutcome: 'received',
          httpStatus: 200,
          responseBody: warmBody,
          observedAt,
        }
      );
      expect(warmResult.observation).toMatchObject({
        programTerminal: true,
        cachedTokenCount: 12,
        observedFacts: [
          { factKind: 'provider-cache-receipt' },
          { factKind: 'usage-vector' },
        ],
        semanticProof: { proofKind: 'isolated-cache-roundtrip' },
      });
      expect(
        createAgentCapabilityProbeProviderExecutionEvidence(
          program,
          Object.freeze([
            coldRecord,
            record(warm.policy, warm.material, warmResult.observation),
          ])
        ).status
      ).toBe('supported');
    }
  );

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'requires the real retrieval marker for %s support',
    (protocolFamily) => {
      const program = programFor('g4-provider-hosted-retrieval-document');
      const success = policyAndMaterial(program, protocolFamily, 0);
      const response =
        protocolFamily === 'openai-responses'
          ? openAIResponse('resp_retrieval', {
              text: 'Source marker: prodivix-capability-probe-v1',
            })
          : geminiResponse('interaction_retrieval', {
              text: 'Source marker: prodivix-capability-probe-v1',
            });
      const result = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        success.policy,
        {
          requestProjection: success.material.projection,
          priorPhases: Object.freeze([]),
          requestLeafDigest: digest(`${protocolFamily}.retrieval-request`),
          responseLeafDigest: digest(`${protocolFamily}.retrieval-response`),
          transportOutcome: 'received',
          httpStatus: 200,
          responseBody: response,
          observedAt,
        }
      );
      expect(result.observation).toMatchObject({
        outputMarkerObserved: true,
        observedFacts: [{ factKind: 'retrieval-query-receipt' }],
        semanticProof: {
          proofKind: 'hosted-retrieval-public-document',
        },
      });

      const missing = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        success.policy,
        {
          requestProjection: success.material.projection,
          priorPhases: Object.freeze([]),
          requestLeafDigest: digest(`${protocolFamily}.retrieval-request-2`),
          responseLeafDigest: digest(`${protocolFamily}.retrieval-response-2`),
          transportOutcome: 'received',
          httpStatus: 200,
          responseBody:
            protocolFamily === 'openai-responses'
              ? openAIResponse('resp_retrieval_2', { text: 'no source' })
              : geminiResponse('interaction_retrieval_2', {
                  text: 'no source',
                }),
          observedAt,
        }
      );
      expect(missing.observation).toMatchObject({
        outcome: 'failed',
        observedFacts: [],
        denial: { denialKind: 'normalized-response-incomplete' },
      });
    }
  );

  it.each([
    [
      'openai-responses',
      openAIResponse('resp_parallel', {
        toolCalls: [
          { id: 'call_alpha', name: 'capability_probe_alpha' },
          { id: 'call_beta', name: 'capability_probe_beta' },
        ],
      }),
    ],
    [
      'anthropic-messages',
      Object.freeze({
        type: 'message',
        id: 'msg_parallel',
        stop_reason: 'tool_use',
        content: Object.freeze([
          Object.freeze({
            type: 'tool_use',
            id: 'call_alpha',
            name: 'capability_probe_alpha',
            input: Object.freeze({ marker: 'prodivix-capability-probe-v1' }),
          }),
          Object.freeze({
            type: 'tool_use',
            id: 'call_beta',
            name: 'capability_probe_beta',
            input: Object.freeze({ marker: 'prodivix-capability-probe-v1' }),
          }),
        ]),
        usage: Object.freeze({ input_tokens: 64, output_tokens: 8 }),
      }),
    ],
    [
      'gemini-interactions',
      Object.freeze({
        id: 'interaction_parallel',
        status: 'requires_action',
        steps: Object.freeze([
          Object.freeze({
            type: 'function_call',
            id: 'call_alpha',
            name: 'capability_probe_alpha',
            arguments: Object.freeze({
              marker: 'prodivix-capability-probe-v1',
            }),
          }),
          Object.freeze({
            type: 'function_call',
            id: 'call_beta',
            name: 'capability_probe_beta',
            arguments: Object.freeze({
              marker: 'prodivix-capability-probe-v1',
            }),
          }),
        ]),
        usage: Object.freeze({
          total_input_tokens: 64,
          total_output_tokens: 8,
        }),
      }),
    ],
  ] as const)(
    'requires exact two named tool calls for %s',
    (protocolFamily, response) => {
      const program = programFor('g4-provider-parallel-tool');
      const current = policyAndMaterial(program, protocolFamily, 0);
      const result = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        current.policy,
        {
          requestProjection: current.material.projection,
          priorPhases: Object.freeze([]),
          requestLeafDigest: digest(`${protocolFamily}.parallel-request`),
          responseLeafDigest: digest(`${protocolFamily}.parallel-response`),
          transportOutcome: 'received',
          httpStatus: 200,
          responseBody: Object.freeze([response]),
          observedAt,
        }
      );
      expect(result.observation).toMatchObject({
        programTerminal: true,
        observedFacts: [
          { factKind: 'provider-event', providerEventType: 'tool-call' },
          { factKind: 'provider-event', providerEventType: 'tool-call' },
        ],
        semanticProof: { proofKind: 'parallel-tool-call-set' },
      });
    }
  );

  it('binds a Gemini continuation parent handle to the resume request leaf', () => {
    const program = programFor('g4-provider-reasoning-continuation');
    const parent = policyAndMaterial(program, 'gemini-interactions', 0);
    const parentResult = decodeAgentCapabilityProbeProviderPhaseResponse(
      program,
      parent.policy,
      {
        requestProjection: parent.material.projection,
        priorPhases: Object.freeze([]),
        requestLeafDigest: digest('continuation-parent-request'),
        responseLeafDigest: digest('continuation-parent-response'),
        transportOutcome: 'received',
        httpStatus: 200,
        responseBody: geminiResponse('interaction_parent_1'),
        observedAt,
      }
    );
    const parentRecord = record(
      parent.policy,
      parent.material,
      parentResult.observation
    );
    const resume = policyAndMaterial(
      program,
      'gemini-interactions',
      1,
      parentResult.callbackLocalProviderStateHandle
    );
    const resumed = decodeAgentCapabilityProbeProviderPhaseResponse(
      program,
      resume.policy,
      {
        requestProjection: resume.material.projection,
        priorPhases: Object.freeze([parentRecord]),
        requestLeafDigest: digest('continuation-resume-request'),
        responseLeafDigest: digest('continuation-resume-response'),
        transportOutcome: 'received',
        httpStatus: 200,
        responseBody: geminiResponse('interaction_resumed_1'),
        observedAt,
      }
    );
    expect(resumed.observation).toMatchObject({
      observedFacts: [{ factKind: 'opaque-continuation' }],
      semanticProof: { proofKind: 'opaque-continuation-roundtrip' },
    });
  });

  it.each([
    [
      400,
      Object.freeze({ error: Object.freeze({ code: 'unsupported_feature' }) }),
      'unsupported',
    ],
    [
      401,
      Object.freeze({ error: Object.freeze({ code: 'unauthorized' }) }),
      'inconclusive',
    ],
  ] as const)(
    'maps HTTP %s to real denial status %s',
    (status, responseBody, expected) => {
      const program = programFor('g4-provider-parallel-tool');
      const current = policyAndMaterial(program, 'openai-responses', 0);
      const result = decodeAgentCapabilityProbeProviderPhaseResponse(
        program,
        current.policy,
        {
          requestProjection: current.material.projection,
          priorPhases: Object.freeze([]),
          requestLeafDigest: digest(`denial-request.${status}`),
          responseLeafDigest: digest(`denial-response.${status}`),
          transportOutcome: 'received',
          httpStatus: status,
          responseBody,
          observedAt,
        }
      );
      expect(
        createAgentCapabilityProbeProviderExecutionEvidence(
          program,
          Object.freeze([
            record(current.policy, current.material, result.observation),
          ])
        ).status
      ).toBe(expected);
    }
  );

  it('keeps timeout, secret response, phase-leaf swaps, and recomputed tamper fail-closed', () => {
    const program = programFor('g4-provider-parallel-tool');
    const current = policyAndMaterial(program, 'openai-responses', 0);
    const timeout = decodeAgentCapabilityProbeProviderPhaseResponse(
      program,
      current.policy,
      {
        requestProjection: current.material.projection,
        priorPhases: Object.freeze([]),
        requestLeafDigest: digest('timeout-request'),
        responseLeafDigest: digest('timeout-response'),
        transportOutcome: 'timed-out',
        httpStatus: null,
        responseBody: null,
        observedAt,
      }
    );
    expect(timeout.observation.denial?.denialKind).toBe(
      'probe-execution-timeout'
    );
    expect(() =>
      decodeAgentCapabilityProbeProviderPhaseResponse(program, current.policy, {
        requestProjection: current.material.projection,
        priorPhases: Object.freeze([]),
        requestLeafDigest: digest('secret-request'),
        responseLeafDigest: digest('secret-response'),
        transportOutcome: 'received',
        httpStatus: 200,
        responseBody: Object.freeze({
          object: 'response',
          id: 'resp_secret',
          status: 'completed',
          output: Object.freeze([
            Object.freeze({
              type: 'message',
              content: Object.freeze([
                Object.freeze({
                  type: 'output_text',
                  text: 'Bearer secret-value',
                }),
              ]),
            }),
          ]),
        }),
        observedAt,
      })
    ).toThrow(/unsafe/u);
    expect(
      matchAgentCapabilityProbeProviderPhaseObservation(
        timeout.observation,
        program,
        current.policy,
        current.material.projection,
        {
          requestLeafDigest: digest('swapped-request'),
          responseLeafDigest: timeout.observation.responseLeafDigest,
          responseBodyDigest: timeout.observation.responseBodyDigest,
          observedAt,
        }
      )
    ).toBe(false);
    const { phaseDigest: _phaseDigest, ...base } = {
      ...timeout.observation,
      requestLeafDigest: digest('recomputed-swap'),
    };
    const tampered = Object.freeze({
      ...base,
      phaseDigest: digestAgentCanonicalValue(base),
    });
    expect(
      matchAgentCapabilityProbeProviderPhaseObservation(
        tampered,
        program,
        current.policy,
        current.material.projection,
        {
          requestLeafDigest: timeout.observation.requestLeafDigest,
          responseLeafDigest: timeout.observation.responseLeafDigest,
          responseBodyDigest: timeout.observation.responseBodyDigest,
          observedAt,
        }
      )
    ).toBe(false);
  });
});
