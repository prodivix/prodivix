import { readFileSync } from 'node:fs';
import {
  createAgentCapabilityProbeProgram,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  createAgentNativeProviderRuntimeFactEnvelope,
  digestAgentCanonicalValue,
  digestAgentCapabilityProbeProfile,
  normalizeNativeAgentProviderRuntimeEvents,
  type AgentNativeProviderTransportRequest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  loadAgentEvaluationRunnerConfig,
  type AgentEvaluationNativeProtocol,
} from './config';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  createAgentEvaluationProviderTransport,
  type AgentEvaluationFetch,
  type AgentEvaluationJsonObject,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationTransportObservation,
  type AgentEvaluationTransportReceipt,
  type AgentEvaluationTransportCloseInput,
} from './providerTransport';
import {
  createAgentEvaluationAesGcmResultSpoolCipher,
  EnvironmentAgentEvaluationResultSpoolKeyResolver,
} from './resultSpoolCipher';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';
import {
  EnvironmentAgentProviderSecretResolver,
  type AgentProviderSecretResolver,
} from './secretResolver';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_ENABLED: '1',
  PRODIVIX_G4_MODEL_EVAL_OPENAI_MODEL_ID: 'openai-configured-model',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_MODEL_ID: 'anthropic-configured-model',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_MODEL_ID: 'gemini-configured-model',
  PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY: 'openai-test-secret-123',
  PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY: 'anthropic-test-secret-123',
  PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY: 'gemini-test-secret-123',
});

const config = loadAgentEvaluationRunnerConfig(environment);
if (!config.enabled) throw new Error('test configuration was disabled');
const frozenConfig = decodeAgentEvaluationFrozenRunConfig(
  materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(
      readFileSync(
        new URL(
          '../../../specs/evaluation/g4-real-model-evaluation.example.json',
          import.meta.url
        ),
        'utf8'
      )
    ) as Record<string, unknown>
  ),
  {
    clock: () => '2026-08-08T00:00:00.000Z',
    expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  }
);

it('pre-normalizes callback-local output facts into exact replay envelopes', () => {
  const invocationId = 'provider-runtime-normalization-test';
  const requestDigest = digestAgentCanonicalValue({ request: invocationId });
  const facts = normalizeNativeAgentProviderRuntimeEvents(
    'openai-responses',
    [
      {
        type: 'response.output_text.delta',
        item_id: 'msg_test',
        delta: 'safe output',
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_test',
          status: 'completed',
          usage: { input_tokens: 8, output_tokens: 4 },
        },
      },
    ],
    { invocationId, occurredAt: '2026-08-08T00:00:00.000Z' }
  );
  expect(
    facts.map((fact) =>
      createAgentNativeProviderRuntimeFactEnvelope(
        {
          protocolFamily: 'openai-responses',
          invocationId,
          requestDigest,
          providerConfigurationId: 'provider.runtime-normalization-test',
          modelLineageDigest: digestAgentCanonicalValue({ model: 'runtime' }),
          fact,
        },
        {
          protectedMaterialCanaries: Object.freeze([]),
          secretCanaries: Object.freeze([]),
        }
      )
    )
  ).toHaveLength(3);
});

const bodyFor = (
  protocolFamily: AgentEvaluationNativeProtocol
): AgentEvaluationJsonObject => {
  switch (protocolFamily) {
    case 'openai-responses':
      return Object.freeze({ input: 'safe provider request' });
    case 'anthropic-messages':
      return Object.freeze({
        max_tokens: 16,
        messages: Object.freeze([
          Object.freeze({ role: 'user', content: 'safe provider request' }),
        ]),
      });
    case 'gemini-interactions':
      return Object.freeze({ input: 'safe provider request' });
  }
};

const requestFor = (
  protocolFamily: AgentEvaluationNativeProtocol,
  suffix = '1'
): AgentNativeProviderTransportRequest => {
  const provider = config.providers[protocolFamily];
  const digest = (label: string) =>
    digestAgentCanonicalValue({ label, protocolFamily, suffix });
  return Object.freeze({
    protocolFamily,
    invocation: Object.freeze({
      invocationId: `invocation.${protocolFamily}.${suffix}`,
      requestDigest: digest('request'),
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: digest('model'),
      capabilityProfileDigest: digest('capability'),
      inferenceConfigurationDigest: digest('inference'),
      contextPackDigest: digest('context'),
    }),
  });
};

const openAiBackgroundRuntimeFixture = (suffix: string, adapter = suffix) => {
  const program = createAgentCapabilityProbeProgram({
    capabilityProfileId: 'g4-provider-background-job',
    capabilityProfileDigest: digestAgentCapabilityProbeProfile(
      'g4-provider-background-job'
    ),
  });
  const baseRequest = requestFor('openai-responses', suffix);
  const provider = config.providers['openai-responses'];
  const runtimeMaterial =
    createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
      operation: 'background-submit',
      protocolFamily: 'openai-responses',
      providerConfigurationId: provider.providerConfigurationId,
      modelId: provider.modelId,
      modelLineageDigest: baseRequest.invocation.modelLineageDigest,
      adapterDigest: digestAgentCanonicalValue({ adapter }),
      callbackLocalBaseRequestBody: Object.freeze({
        input: 'safe request',
        model: provider.modelId,
      }),
      callbackLocalProviderStateHandle: null,
      providerResourceAuthority: null,
      providerResourceReadRequest: null,
      providerResourceReadReceipt: null,
      cacheKeyDigest: null,
      observedAt: '2026-08-08T00:00:00.000Z',
    });
  const request = Object.freeze({
    ...baseRequest,
    invocation: Object.freeze({
      ...baseRequest.invocation,
      requestDigest: runtimeMaterial.projection.requestDigest,
      capabilityProfileDigest:
        program.profileProjection.capabilityProfileDigest,
    }),
  });
  return Object.freeze({ program, request, runtimeMaterial });
};

const dispatchIntentAuthority = (
  request: AgentNativeProviderTransportRequest
) => {
  const planDigest = digestAgentCanonicalValue({ plan: 'transport-test' });
  const targetDigest = digestAgentCanonicalValue({
    target: request.protocolFamily,
  });
  const capabilityDescriptorDigest = digestAgentCanonicalValue({
    capability: request.protocolFamily,
  });
  const samplingBase = Object.freeze({
    planDigest,
    caseId: 'case.transport-test',
    capabilityDescriptorDigest,
    targetId: `target.${request.protocolFamily}`,
    targetDigest,
    riskClass: 'ordinary' as const,
    repetitionIndex: 0,
  });
  const samplingIdentityDigest = digestAgentCanonicalValue(samplingBase);
  const descriptorBase = Object.freeze({
    attemptId: `evaluation-attempt:${samplingIdentityDigest.slice('sha256-'.length)}`,
    planDigest,
    shardId: 'shard.transport-test',
    caseId: samplingBase.caseId,
    capabilityDescriptorDigest,
    targetId: samplingBase.targetId,
    targetDigest,
    riskClass: samplingBase.riskClass,
    repetitionIndex: samplingBase.repetitionIndex,
    samplingIdentityDigest,
  });
  return Object.freeze({
    descriptor: Object.freeze({
      ...descriptorBase,
      descriptorDigest: digestAgentCanonicalValue(descriptorBase),
    }),
    repositoryCommit: '0'.repeat(40),
    turnIndex: 0,
    budgetReservationId: 'budget-reservation.transport-test',
    demandDigest: digestAgentCanonicalValue({ demand: 'transport-test' }),
  });
};

const sseFor = (protocolFamily: AgentEvaluationNativeProtocol): string => {
  const events: readonly unknown[] =
    protocolFamily === 'openai-responses'
      ? [
          {
            type: 'response.created',
            response: { id: 'resp_123', model: 'openai-resolved-model' },
          },
          {
            type: 'response.completed',
            response: { id: 'resp_123', model: 'openai-resolved-model' },
          },
        ]
      : protocolFamily === 'anthropic-messages'
        ? [
            {
              type: 'message_start',
              message: { id: 'msg_123', model: 'anthropic-resolved-model' },
            },
            { type: 'message_stop' },
          ]
        : [
            {
              event_type: 'interaction.created',
              interaction: {
                id: 'interaction_123',
                model: 'gemini-resolved-model',
                model_version: 'gemini-resolved-version',
              },
            },
            {
              event_type: 'interaction.completed',
              interaction: {
                id: 'interaction_123',
                model: 'gemini-resolved-model',
                model_version: 'gemini-resolved-version',
              },
            },
          ];
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
};

type FetchCapture = Readonly<{
  url: string;
  body: string;
  sentHeaders: Readonly<Record<string, string | null>>;
  headerReference: Headers;
}>;

const createSuccessFetcher = (
  captures: FetchCapture[],
  timeline?: string[]
): AgentEvaluationFetch =>
  (async (
    input: string | URL | Request,
    init?: RequestInit,
    approvedAddresses?: readonly string[]
  ) => {
    timeline?.push('fetch');
    const url = String(input);
    const protocolFamily = (
      Object.entries(AGENT_EVALUATION_PROVIDER_DEFINITIONS) as readonly [
        AgentEvaluationNativeProtocol,
        (typeof AGENT_EVALUATION_PROVIDER_DEFINITIONS)[AgentEvaluationNativeProtocol],
      ][]
    ).find(([, definition]) => definition.endpoint === url)?.[0];
    if (
      !protocolFamily ||
      !(init?.headers instanceof Headers) ||
      !approvedAddresses?.includes('8.8.8.8')
    ) {
      throw new Error('invalid mock request');
    }
    const headers = init.headers;
    captures.push(
      Object.freeze({
        url,
        body: String(init.body),
        sentHeaders: Object.freeze({
          authorization: headers.get('authorization'),
          apiKey: headers.get('x-api-key'),
          googleApiKey: headers.get('x-goog-api-key'),
        }),
        headerReference: headers,
      })
    );
    return new Response(sseFor(protocolFamily), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'x-request-id': `request-${protocolFamily}`,
      },
    });
  }) as AgentEvaluationFetch;

describe('first-party agent evaluation provider transport', () => {
  it('uses each exact endpoint and provider-specific credential header once', async () => {
    const captures: FetchCapture[] = [];
    const receipts: AgentEvaluationTransportReceipt[] = [];
    const dispatchIntents: AgentEvaluationTransportDispatchIntent[] = [];
    const observations: AgentEvaluationTransportObservation[] = [];
    const timeline: string[] = [];
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: ({ protocolFamily }) => ({
        body: bodyFor(protocolFamily as AgentEvaluationNativeProtocol),
      }),
      fetcher: createSuccessFetcher(captures, timeline),
      resolveHost: async () => ['8.8.8.8'],
      now: () => new Date('2026-08-08T00:00:00.000Z'),
      putDispatchIntent: async ({ intent }) => {
        timeline.push('intent');
        dispatchIntents.push(intent);
      },
      recordReceipt: async (receipt) => {
        timeline.push('receipt');
        receipts.push(receipt);
      },
      observe: (observation) => observations.push(observation),
    });

    for (const protocolFamily of [
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
    ] as const) {
      const execution = await transport.execute(requestFor(protocolFamily));
      expect(execution.receipt).toMatchObject({
        protocolFamily,
        providerConfigurationId:
          config.providers[protocolFamily].providerConfigurationId,
        httpStatus: 200,
        outcome: 'completed',
        sseEventCount: 2,
      });
      expect(execution.receipt.responseBodyDigest).toMatch(
        /^sha256-[0-9a-f]{64}$/u
      );
      expect(execution.receipt.providerResponseId).toBe(
        protocolFamily === 'openai-responses'
          ? 'resp_123'
          : protocolFamily === 'anthropic-messages'
            ? 'msg_123'
            : 'interaction_123'
      );
    }

    expect(captures).toHaveLength(3);
    expect(dispatchIntents).toHaveLength(3);
    expect(timeline).toEqual([
      'intent',
      'fetch',
      'receipt',
      'intent',
      'fetch',
      'receipt',
      'intent',
      'fetch',
      'receipt',
    ]);
    expect(
      receipts.every(
        (receipt, index) =>
          receipt.dispatchIntentDigest === dispatchIntents[index]?.intentDigest
      )
    ).toBe(true);
    expect(captures[0]?.sentHeaders).toMatchObject({
      authorization: `Bearer ${environment.PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY}`,
      apiKey: null,
      googleApiKey: null,
    });
    expect(captures[1]?.sentHeaders).toMatchObject({
      authorization: null,
      apiKey: environment.PRODIVIX_G4_MODEL_EVAL_ANTHROPIC_API_KEY,
      googleApiKey: null,
    });
    expect(captures[2]?.sentHeaders).toMatchObject({
      authorization: null,
      apiKey: null,
      googleApiKey: environment.PRODIVIX_G4_MODEL_EVAL_GEMINI_API_KEY,
    });
    expect(captures[2]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1/interactions?alt=sse'
    );
    expect(new URL(captures[2]!.url).searchParams.has('key')).toBe(false);

    for (const capture of captures) {
      expect(capture.headerReference.get('authorization')).toBeNull();
      expect(capture.headerReference.get('x-api-key')).toBeNull();
      expect(capture.headerReference.get('x-goog-api-key')).toBeNull();
      expect(capture.body).not.toContain('test-secret');
      const body = JSON.parse(capture.body) as Record<string, unknown>;
      expect(body.stream).toBe(true);
      if (capture.url.includes('anthropic.com'))
        expect(body.store).toBeUndefined();
      else expect(body.store).toBe(false);
    }

    const safeCapture = JSON.stringify({ receipts, observations });
    expect(safeCapture).not.toContain('test-secret');
    expect(receipts).toHaveLength(3);
    expect(
      observations.filter(({ phase }) => phase === 'started')
    ).toHaveLength(3);
    expect(
      observations.filter(({ phase }) => phase === 'completed')
    ).toHaveLength(3);
  });

  it('supports bounded JSON responses while reporting zero SSE events', async () => {
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: (async () =>
        new Response(
          JSON.stringify({ id: 'resp_json_1', model: 'openai-json-model' }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'request-openai-json',
            },
          }
        )) as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
    });
    const execution = await transport.execute(
      requestFor('openai-responses', 'json')
    );
    expect(execution.receipt).toMatchObject({
      providerResponseId: 'resp_json_1',
      resolvedModelId: 'openai-json-model',
      sseEventCount: 0,
    });
  });

  it.each([
    {
      protocolFamily: 'openai-responses',
      profileId: 'g4-provider-background-job',
      operation: 'background-submit',
      expectedPath: '/v1/responses',
    },
    {
      protocolFamily: 'anthropic-messages',
      profileId: 'g4-provider-isolated-cache',
      operation: 'cache-cold',
      expectedPath: '/v1/messages',
    },
    {
      protocolFamily: 'gemini-interactions',
      profileId: 'g4-provider-background-job',
      operation: 'background-submit',
      expectedPath: '/v1/interactions?alt=json',
    },
  ] as const)(
    'sends the exact $protocolFamily callback-bound native capability runtime request',
    async ({ protocolFamily, profileId, operation, expectedPath }) => {
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId: profileId,
        capabilityProfileDigest: digestAgentCapabilityProbeProfile(profileId),
      });
      const baseRequest = requestFor(
        protocolFamily,
        `runtime-material-${protocolFamily}`
      );
      const provider = config.providers[protocolFamily];
      const runtimeMaterial =
        createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
          operation,
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          modelId: provider.modelId,
          modelLineageDigest: baseRequest.invocation.modelLineageDigest,
          adapterDigest: digestAgentCanonicalValue({
            adapter: `runtime-material-${protocolFamily}`,
          }),
          callbackLocalBaseRequestBody:
            protocolFamily === 'anthropic-messages'
              ? null
              : Object.freeze({
                  input: 'safe capability bootstrap',
                  model: provider.modelId,
                }),
          callbackLocalProviderStateHandle: null,
          providerResourceAuthority: null,
          providerResourceReadRequest: null,
          providerResourceReadReceipt: null,
          cacheKeyDigest:
            protocolFamily === 'anthropic-messages'
              ? digestAgentCanonicalValue({ cache: protocolFamily })
              : null,
          observedAt: '2026-08-08T00:00:00.000Z',
        });
      const request = Object.freeze({
        ...baseRequest,
        invocation: Object.freeze({
          ...baseRequest.invocation,
          requestDigest: runtimeMaterial.projection.requestDigest,
          capabilityProfileDigest:
            program.profileProjection.capabilityProfileDigest,
        }),
      });
      const dispatchIntents: AgentEvaluationTransportDispatchIntent[] = [];
      const expectedUrl = new URL(expectedPath, provider.endpoint).toString();
      const expectedBody = canonicalJsonText(runtimeMaterial.callbackLocalBody);
      const expectedRequestBytes =
        new TextEncoder().encode(expectedPath).byteLength +
        new TextEncoder().encode(expectedBody).byteLength;
      expect(runtimeMaterial.callbackLocalPath).toBe(expectedPath);
      expect(runtimeMaterial.projection.pathDigest).toBe(
        digestAgentCanonicalValue({ path: expectedPath })
      );
      expect(runtimeMaterial.projection.requestBodyDigest).toBe(
        digestAgentCanonicalValue({
          body: runtimeMaterial.callbackLocalBody,
        })
      );
      expect(runtimeMaterial.projection.requestBytes).toBe(
        expectedRequestBytes
      );
      const fetcher = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          expect(String(input)).toBe(expectedUrl);
          expect(init?.method).toBe('POST');
          expect(String(init?.body)).toBe(expectedBody);
          expect((init?.headers as Headers).get('content-type')).toBe(
            'application/json'
          );
          return new Response(
            JSON.stringify(
              protocolFamily === 'openai-responses'
                ? {
                    id: 'resp_runtime_material',
                    model: provider.modelId,
                    status: 'in_progress',
                  }
                : protocolFamily === 'anthropic-messages'
                  ? {
                      type: 'message',
                      id: 'msg_runtime_material',
                      model: provider.modelId,
                      content: [{ type: 'text', text: 'safe result' }],
                      stop_reason: 'end_turn',
                      usage: {
                        input_tokens: 4_096,
                        output_tokens: 4,
                        cache_creation_input_tokens: 4_096,
                      },
                    }
                  : {
                      id: 'interaction_runtime_material',
                      model: provider.modelId,
                      status: 'in_progress',
                      steps: [],
                    }
            ),
            {
              status: 200,
              headers: {
                'content-type': 'application/json; charset=utf-8',
                'x-request-id': `request-${protocolFamily}-runtime-material`,
              },
            }
          );
        }
      );
      const transport = createAgentEvaluationProviderTransport({
        config,
        resolveDispatchIntentAuthority: () => dispatchIntentAuthority(request),
        secrets: new EnvironmentAgentProviderSecretResolver(environment),
        resolvePayload: () => ({
          body: { input: 'safe capability bootstrap' },
          capabilityRuntimeRequestMaterial: runtimeMaterial,
        }),
        fetcher: fetcher as AgentEvaluationFetch,
        resolveHost: async () => ['8.8.8.8'],
        putDispatchIntent: async ({ intent }) => {
          dispatchIntents.push(intent);
        },
      });

      const execution = await transport.execute(request);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(dispatchIntents).toHaveLength(1);
      expect(dispatchIntents[0]?.requestBodyDigest).toBe(
        runtimeMaterial.projection.requestBodyDigest
      );
      expect(dispatchIntents[0]?.requestBytes).toBe(expectedRequestBytes);
      expect(execution.receipt).toMatchObject({
        requestDigest: runtimeMaterial.projection.requestDigest,
        requestBodyDigest: runtimeMaterial.projection.requestBodyDigest,
        requestBytes: expectedRequestBytes,
        sseEventCount: 0,
      });
    }
  );

  it('rejects a recomputed native capability runtime body swap before dispatch', async () => {
    const program = createAgentCapabilityProbeProgram({
      capabilityProfileId: 'g4-provider-background-job',
      capabilityProfileDigest: digestAgentCapabilityProbeProfile(
        'g4-provider-background-job'
      ),
    });
    const baseRequest = requestFor('openai-responses', 'runtime-body-swap');
    const provider = config.providers['openai-responses'];
    const runtimeMaterial =
      createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
        operation: 'background-submit',
        protocolFamily: 'openai-responses',
        providerConfigurationId: provider.providerConfigurationId,
        modelId: provider.modelId,
        modelLineageDigest: baseRequest.invocation.modelLineageDigest,
        adapterDigest: digestAgentCanonicalValue({
          adapter: 'runtime-body-swap',
        }),
        callbackLocalBaseRequestBody: Object.freeze({
          input: 'safe request',
          model: provider.modelId,
        }),
        callbackLocalProviderStateHandle: null,
        providerResourceAuthority: null,
        providerResourceReadRequest: null,
        providerResourceReadReceipt: null,
        cacheKeyDigest: null,
        observedAt: '2026-08-08T00:00:00.000Z',
      });
    const request = Object.freeze({
      ...baseRequest,
      invocation: Object.freeze({
        ...baseRequest.invocation,
        requestDigest: runtimeMaterial.projection.requestDigest,
        capabilityProfileDigest:
          program.profileProjection.capabilityProfileDigest,
      }),
    });
    const fetcher = vi.fn();
    const putDispatchIntent = vi.fn();
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: () => dispatchIntentAuthority(request),
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({
        body: { input: 'safe request' },
        capabilityRuntimeRequestMaterial: Object.freeze({
          ...runtimeMaterial,
          callbackLocalBody: Object.freeze({
            ...(runtimeMaterial.callbackLocalBody as Record<string, unknown>),
            input: 'swapped request',
          }),
        }),
      }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
      putDispatchIntent,
    });

    await expect(transport.execute(request)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(putDispatchIntent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a recomputed native capability runtime path swap before egress or dispatch', async () => {
    const { request: exactRequest, runtimeMaterial } =
      openAiBackgroundRuntimeFixture('runtime-path-swap');
    const tamperedPath = '/v1/responses/resp_path_swap';
    const tamperedRequestBytes =
      new TextEncoder().encode(tamperedPath).byteLength +
      new TextEncoder().encode(
        canonicalJsonText(runtimeMaterial.callbackLocalBody)
      ).byteLength;
    const {
      requestDigest: originalProjectionDigest,
      ...tamperedProjectionBase
    } = Object.freeze({
      ...runtimeMaterial.projection,
      pathDigest: digestAgentCanonicalValue({ path: tamperedPath }),
      requestBytes: tamperedRequestBytes,
    });
    expect(originalProjectionDigest).toBe(
      runtimeMaterial.projection.requestDigest
    );
    const tamperedProjection = Object.freeze({
      ...tamperedProjectionBase,
      requestDigest: digestAgentCanonicalValue(tamperedProjectionBase),
    });
    const request = Object.freeze({
      ...exactRequest,
      invocation: Object.freeze({
        ...exactRequest.invocation,
        requestDigest: tamperedProjection.requestDigest,
      }),
    });
    const resolveHost = vi.fn(async () => ['8.8.8.8']);
    const putDispatchIntent = vi.fn();
    const fetcher = vi.fn();
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: () => dispatchIntentAuthority(request),
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({
        body: { input: 'safe request' },
        capabilityRuntimeRequestMaterial: Object.freeze({
          projection: tamperedProjection,
          callbackLocalPath: tamperedPath,
          callbackLocalBody: runtimeMaterial.callbackLocalBody,
        }),
      }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost,
      putDispatchIntent,
    });

    await expect(transport.execute(request)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(putDispatchIntent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a native capability runtime projection swap before egress or dispatch', async () => {
    const first = openAiBackgroundRuntimeFixture(
      'runtime-projection-swap',
      'runtime-projection-first'
    );
    const second = openAiBackgroundRuntimeFixture(
      'runtime-projection-swap',
      'runtime-projection-second'
    );
    expect(second.runtimeMaterial.callbackLocalPath).toBe(
      first.runtimeMaterial.callbackLocalPath
    );
    expect(second.runtimeMaterial.callbackLocalBody).toEqual(
      first.runtimeMaterial.callbackLocalBody
    );
    expect(second.runtimeMaterial.projection.requestDigest).not.toBe(
      first.runtimeMaterial.projection.requestDigest
    );
    const resolveHost = vi.fn(async () => ['8.8.8.8']);
    const putDispatchIntent = vi.fn();
    const fetcher = vi.fn();
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: () =>
        dispatchIntentAuthority(first.request),
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({
        body: { input: 'safe request' },
        capabilityRuntimeRequestMaterial: Object.freeze({
          ...first.runtimeMaterial,
          projection: second.runtimeMaterial.projection,
        }),
      }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost,
      putDispatchIntent,
    });

    await expect(transport.execute(first.request)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(resolveHost).not.toHaveBeenCalled();
    expect(putDispatchIntent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires application/json for a native capability runtime response', async () => {
    const { request, runtimeMaterial } = openAiBackgroundRuntimeFixture(
      'runtime-json-response'
    );
    const putDispatchIntent = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response(
          'data: {"type":"response.completed","response":{"id":"resp_runtime_sse"}}\n\n',
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }
        )
    );
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: () => dispatchIntentAuthority(request),
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({
        body: { input: 'safe request' },
        capabilityRuntimeRequestMaterial: runtimeMaterial,
      }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
      putDispatchIntent,
    });

    await expect(transport.execute(request)).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    expect(putDispatchIntent).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('atomically closes a completed transport with an authority-bound encrypted result spool', async () => {
    const captures: FetchCapture[] = [];
    const closed: AgentEvaluationTransportCloseInput[] = [];
    const cipher = createAgentEvaluationAesGcmResultSpoolCipher({
      keys: new EnvironmentAgentEvaluationResultSpoolKeyResolver({
        profile: frozenConfig.responseSpoolEncryption,
        environment: {
          PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: Buffer.alloc(
            32,
            9
          ).toString('base64'),
        },
      }),
      randomBytes: (size) => new Uint8Array(size).fill(4),
    });
    const program = createAgentCapabilityProbeProgram({
      capabilityProfileId: 'g4-provider-background-job',
      capabilityProfileDigest: digestAgentCapabilityProbeProfile(
        'g4-provider-background-job'
      ),
    });
    const baseRequest = requestFor('openai-responses', 'atomic-close');
    const request = Object.freeze({
      ...baseRequest,
      invocation: Object.freeze({
        ...baseRequest.invocation,
        capabilityProfileDigest:
          program.profileProjection.capabilityProfileDigest,
      }),
    });
    const authority = dispatchIntentAuthority(request);
    const resolveNativeOptionalCapabilityBootstrap = vi.fn(async (input) => {
      expect(input.providerEvents).toHaveLength(2);
      expect(input.runtimeEvents.length).toBeGreaterThanOrEqual(2);
      return Object.freeze({
        program,
        outcome: 'unavailable' as const,
        nativeSourceReceipt: null,
      });
    });
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: () => authority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: createSuccessFetcher(captures),
      resolveHost: async () => ['8.8.8.8'],
      putDispatchIntent: async () => undefined,
      closeTransport: async (input) => {
        closed.push(input);
      },
      resultSpoolCipher: cipher,
      responseSpoolEncryption: frozenConfig.responseSpoolEncryption,
      resolveNativeOptionalCapabilityBootstrap,
      recoverNativeOptionalCapabilityBootstrap: async () => 'missing' as const,
    });

    const execution = await transport.execute(request);
    expect(execution.receipt.outcome).toBe('completed');
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      receipt: { receiptDigest: execution.receipt.receiptDigest },
      resultSpoolAad: {
        namespaceDigest: frozenConfig.responseSpoolEncryption.namespaceDigest,
        planDigest: authority.descriptor.planDigest,
        repositoryCommit: authority.repositoryCommit,
        attemptId: authority.descriptor.attemptId,
        descriptorDigest: authority.descriptor.descriptorDigest,
        turnIndex: authority.turnIndex,
        invocationId: request.invocation.invocationId,
        dispatchIntentDigest: execution.receipt.dispatchIntentDigest,
        transportReceiptDigest: execution.receipt.receiptDigest,
        responseBodyDigest: execution.receipt.responseBodyDigest,
      },
      encryptedResultSpool: {
        keyId: frozenConfig.responseSpoolEncryption.keyId,
        keyVersion: frozenConfig.responseSpoolEncryption.keyVersion,
        keyRefDigest: frozenConfig.responseSpoolEncryption.keyRefDigest,
        encryptionProfileDigest:
          frozenConfig.responseSpoolEncryption.encryptionProfileDigest,
      },
      nativeOptionalCapabilityBootstrapIngress: {
        attemptId: authority.descriptor.attemptId,
        descriptorDigest: authority.descriptor.descriptorDigest,
        turnIndex: 0,
        invocationId: request.invocation.invocationId,
        providerRequestDigest: request.invocation.requestDigest,
        transportReceiptDigest: execution.receipt.receiptDigest,
        outcome: 'unavailable',
        nativeSourceReceipt: null,
      },
    });
    expect(resolveNativeOptionalCapabilityBootstrap).toHaveBeenCalledOnce();
    const close = closed[0];
    if (!close?.resultSpoolAad || !close.encryptedResultSpool) {
      throw new Error('Expected an encrypted result spool.');
    }
    await expect(
      cipher.useDecrypted(
        close.encryptedResultSpool,
        close.resultSpoolAad,
        async (bytes) => JSON.parse(new TextDecoder().decode(bytes))
      )
    ).resolves.toEqual(execution.runtimeEvents);
  });

  it.each(['sealed', 'missing'] as const)(
    'recovers an ambiguous native bootstrap close from a %s authority read',
    async (recoveryState) => {
      const program = createAgentCapabilityProbeProgram({
        capabilityProfileId: 'g4-provider-background-job',
        capabilityProfileDigest: digestAgentCapabilityProbeProfile(
          'g4-provider-background-job'
        ),
      });
      const baseRequest = requestFor(
        'openai-responses',
        `native-ack-${recoveryState}`
      );
      const request = Object.freeze({
        ...baseRequest,
        invocation: Object.freeze({
          ...baseRequest.invocation,
          capabilityProfileDigest:
            program.profileProjection.capabilityProfileDigest,
        }),
      });
      const cipher = createAgentEvaluationAesGcmResultSpoolCipher({
        keys: new EnvironmentAgentEvaluationResultSpoolKeyResolver({
          profile: frozenConfig.responseSpoolEncryption,
          environment: {
            PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: Buffer.alloc(
              32,
              7
            ).toString('base64'),
          },
        }),
        randomBytes: (size) => new Uint8Array(size).fill(6),
      });
      const closeTransport = vi.fn(
        async (_input: AgentEvaluationTransportCloseInput) => {
          if (closeTransport.mock.calls.length === 1) {
            throw new Error('simulated close acknowledgement loss');
          }
        }
      );
      const recoverNativeOptionalCapabilityBootstrap = vi.fn(
        async () => recoveryState
      );
      const transport = createAgentEvaluationProviderTransport({
        config,
        resolveDispatchIntentAuthority: () => dispatchIntentAuthority(request),
        secrets: new EnvironmentAgentProviderSecretResolver(environment),
        resolvePayload: () => ({ body: { input: 'safe request' } }),
        fetcher: createSuccessFetcher([]),
        resolveHost: async () => ['8.8.8.8'],
        putDispatchIntent: async () => undefined,
        closeTransport,
        resultSpoolCipher: cipher,
        responseSpoolEncryption: frozenConfig.responseSpoolEncryption,
        resolveNativeOptionalCapabilityBootstrap: async () =>
          Object.freeze({
            program,
            outcome: 'unavailable' as const,
            nativeSourceReceipt: null,
          }),
        recoverNativeOptionalCapabilityBootstrap,
      });

      await expect(transport.execute(request)).resolves.toMatchObject({
        receipt: { outcome: 'completed' },
      });
      expect(recoverNativeOptionalCapabilityBootstrap).toHaveBeenCalledOnce();
      expect(closeTransport).toHaveBeenCalledTimes(
        recoveryState === 'sealed' ? 1 : 2
      );
      expect(closeTransport.mock.calls[0]?.[0]).toEqual(
        closeTransport.mock.calls.at(-1)?.[0]
      );
    }
  );

  it('maps provider rejection to a context-free error and receipt', async () => {
    const secret = environment.PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY;
    const receipts: AgentEvaluationTransportReceipt[] = [];
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: (async () =>
        new Response(`upstream body echoed ${secret}`, {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'provider-request-401',
          },
        })) as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
      recordReceipt: (receipt) => receipts.push(receipt),
    });

    const failure = transport.execute(requestFor('openai-responses', '401'));
    await expect(failure).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
      httpStatus: 401,
    });
    expect(JSON.stringify(receipts)).not.toContain(secret);
    expect(receipts).toEqual([
      expect.objectContaining({
        httpStatus: 401,
        providerRequestId: 'provider-request-401',
        responseHeaderDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
        outcome: 'failed',
        errorCategory:
          AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
      }),
    ]);
  });

  it('fails when a provider response reflects raw credential material', async () => {
    const secret = environment.PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY;
    const receipts: AgentEvaluationTransportReceipt[] = [];
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: (async () =>
        new Response(
          `data: ${JSON.stringify({ type: 'error', detail: secret })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        )) as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
      recordReceipt: (receipt) => receipts.push(receipt),
    });
    await expect(
      transport.execute(requestFor('openai-responses', 'reflected-secret'))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
    });
    expect(JSON.stringify(receipts)).not.toContain(secret);
  });

  it('rejects credential-shaped payload fields before fetch', async () => {
    const fetcher = vi.fn();
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({
        body: { input: 'safe request', access_token: 'payload-secret' },
      }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
    });
    await expect(
      transport.execute(requestFor('openai-responses', 'unsafe-payload'))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      'quote',
      'abc"defgh',
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { id: 'abc"defgh', model: 'safe-model' },
      })}\n\n`,
    ],
    [
      'backslash',
      'abc\\defgh',
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { id: 'abc\\defgh', model: 'safe-model' },
      })}\n\n`,
    ],
    [
      'unicode-escape',
      'abcdefgh',
      'data: {"type":"response.completed","response":{"id":"abcd\\u0065fgh","model":"safe-model"}}\n\n',
    ],
  ])(
    'blocks decoded credential reconstruction through %s JSON',
    async (_name, secret, body) => {
      const receipts: AgentEvaluationTransportReceipt[] = [];
      const transport = createAgentEvaluationProviderTransport({
        config,
        resolveDispatchIntentAuthority: dispatchIntentAuthority,
        secrets: new EnvironmentAgentProviderSecretResolver({
          ...environment,
          PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY: secret,
        }),
        resolvePayload: () => ({ body: { input: 'safe request' } }),
        fetcher: (async () =>
          new Response(body, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })) as AgentEvaluationFetch,
        resolveHost: async () => ['8.8.8.8'],
        recordReceipt: (receipt) => receipts.push(receipt),
      });
      let caught: unknown;
      try {
        await transport.execute(
          requestFor('openai-responses', `decoded-${_name}`)
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
        provider: 'openai-responses',
      });
      expect(JSON.stringify({ caught, receipts })).not.toContain(secret);
    }
  );

  it.each([
    'application/jsonp',
    'text/event-streaming',
    'text/plain+json-junk',
  ])('rejects non-canonical response media type %s', async (contentType) => {
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: (async () =>
        new Response('{"id":"response-media"}', {
          status: 200,
          headers: { 'content-type': contentType },
        })) as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
    });
    await expect(
      transport.execute(
        requestFor(
          'openai-responses',
          `media-${digestAgentCanonicalValue(contentType).slice('sha256-'.length, 'sha256-'.length + 16)}`
        )
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('isolates throwing telemetry and receipt hooks from secret-bearing errors', async () => {
    const captures: FetchCapture[] = [];
    const secret = environment.PRODIVIX_G4_MODEL_EVAL_OPENAI_API_KEY;
    const reusableSecrets: AgentProviderSecretResolver = {
      async use(_request, consumer) {
        const material = new TextEncoder().encode(secret);
        try {
          return await consumer(material);
        } finally {
          material.fill(0);
        }
      },
    };
    const request = requestFor('openai-responses', 'throwing-hook');
    const telemetryTransport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: reusableSecrets,
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: createSuccessFetcher(captures),
      resolveHost: async () => ['8.8.8.8'],
      observe: () => {
        throw new Error(`telemetry exposed ${secret}`);
      },
    });
    await expect(telemetryTransport.execute(request)).resolves.toMatchObject({
      receipt: { outcome: 'completed' },
    });
    await expect(telemetryTransport.execute(request)).resolves.toMatchObject({
      receipt: { outcome: 'completed' },
    });

    const captureTransport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: reusableSecrets,
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: createSuccessFetcher(captures),
      resolveHost: async () => ['8.8.8.8'],
      recordReceipt: () => {
        throw new Error(`receipt exposed ${secret}`);
      },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let caught: unknown;
      try {
        await captureTransport.execute(request);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
        provider: 'openai-responses',
      });
      expect(JSON.stringify(caught)).not.toContain(secret);
    }
  });

  it('fails closed before fetch when the durable dispatch intent is not acknowledged', async () => {
    const fetcher = vi.fn();
    const receipts: AgentEvaluationTransportReceipt[] = [];
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
      putDispatchIntent: async () => {
        throw new Error('durable intent unavailable');
      },
      recordReceipt: async (receipt) => {
        receipts.push(receipt);
      },
    });

    await expect(
      transport.execute(requestFor('openai-responses', 'intent-ack-failed'))
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(receipts).toHaveLength(0);
  });

  it('stops before secret use and fetch when cancellation arrives during preflight', async () => {
    const fetcher = vi.fn();
    const use = vi.fn();
    let releasePayload:
      ((value: { body: AgentEvaluationJsonObject }) => void) | undefined;
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: { use } as unknown as AgentProviderSecretResolver,
      resolvePayload: () =>
        new Promise((resolve) => {
          releasePayload = resolve;
        }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
    });
    const controller = new AbortController();
    const pending = transport.execute(
      requestFor('openai-responses', 'abort-payload'),
      controller.signal
    );
    controller.abort();
    releasePayload?.({ body: { input: 'safe request' } });
    await expect(pending).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
    });
    expect(use).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('honors an already-aborted caller signal', async () => {
    const fetcher = vi.fn();
    const transport = createAgentEvaluationProviderTransport({
      config,
      resolveDispatchIntentAuthority: dispatchIntentAuthority,
      secrets: new EnvironmentAgentProviderSecretResolver(environment),
      resolvePayload: () => ({ body: { input: 'safe request' } }),
      fetcher: fetcher as AgentEvaluationFetch,
      resolveHost: async () => ['8.8.8.8'],
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport.execute(
        requestFor('openai-responses', 'pre-aborted'),
        controller.signal
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
      provider: 'openai-responses',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
