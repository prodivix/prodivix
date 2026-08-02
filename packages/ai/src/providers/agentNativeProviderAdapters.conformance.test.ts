import { describe, expect, it } from 'vitest';
import { TEST_PROFILE, testDigest } from '../__tests__/agentV1Fixtures';
import { createAgentProviderAdapterIdentity } from './agentProviderIdentity';
import {
  runAgentProviderAdapterConformance,
  type AgentProviderAdapterInvocationRequest,
} from './agentProviderAdapter';
import {
  createAnthropicMessagesAgentProviderAdapter,
  createGeminiInteractionsAgentProviderAdapter,
  createOpenAICompatibleAgentProviderAdapter,
  createOpenAIResponsesAgentProviderAdapter,
  type AgentNativeProviderControlRequest,
  type AgentNativeProviderTransport,
} from './agentNativeProviderAdapters';
import type { AgentProviderProtocolFamily } from '../domain/agent.types';

const NOW = '2026-08-02T00:00:00.000Z';
const REQUEST: AgentProviderAdapterInvocationRequest = Object.freeze({
  invocationId: 'invocation.native.v8',
  requestDigest: testDigest('native-request'),
  providerConfigurationId: 'provider.native.v8',
  modelLineageDigest: testDigest('native-model'),
  capabilityProfileDigest: TEST_PROFILE.profileDigest,
  inferenceConfigurationDigest: testDigest('native-inference'),
  contextPackDigest: testDigest('native-context'),
});

const identity = (family: AgentProviderProtocolFamily) =>
  createAgentProviderAdapterIdentity({
    adapterId: `adapter.${family}.v8-test`,
    adapterVersion: '1.0.0',
    protocolFamily: family,
    transportSchemaDigest: testDigest({ family, schema: 1 }),
    eventNormalizationDigest: testDigest('native-normalization-v8'),
  });

const transport = (events: readonly unknown[]): AgentNativeProviderTransport =>
  Object.freeze({
    async *stream() {
      for (const event of events) yield event;
    },
  });

const common = (
  family: AgentProviderProtocolFamily,
  events: readonly unknown[]
) => ({
  identity: identity(family),
  declaredProfileDigests: [TEST_PROFILE.profileDigest],
  supportedProfileDigests: [TEST_PROFILE.profileDigest],
  transport: transport(events),
  now: () => NOW,
});

describe('G4 V8 native provider adapter conformance', () => {
  it.each([
    [
      'openai-responses' as const,
      createOpenAIResponsesAgentProviderAdapter,
      [
        { type: 'response.created', response: { id: 'resp_1' } },
        {
          type: 'response.output_text.delta',
          item_id: 'msg_1',
          delta: 'hello',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_1',
          name: 'read_source',
          arguments: '{"id":"source-1"}',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp_1',
            status: 'completed',
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              input_tokens_details: { cached_tokens: 2 },
              output_tokens_details: { reasoning_tokens: 1 },
            },
          },
        },
      ],
    ],
    [
      'anthropic-messages' as const,
      createAnthropicMessagesAgentProviderAdapter,
      [
        {
          type: 'message_start',
          message: { id: 'msg_1', usage: { input_tokens: 10 } },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_source',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"id":"source-1"}',
          },
        },
        { type: 'content_block_stop', index: 1 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use' },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ],
    ],
    [
      'gemini-interactions' as const,
      createGeminiInteractionsAgentProviderAdapter,
      [
        {
          event_type: 'interaction.created',
          interaction: { id: 'interaction_1', status: 'in_progress' },
        },
        {
          event_type: 'step.start',
          index: 0,
          step: { type: 'model_output' },
        },
        {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text: 'hello' },
        },
        { event_type: 'step.stop', index: 0 },
        {
          event_type: 'step.start',
          index: 1,
          step: {
            type: 'function_call',
            id: 'call_1',
            name: 'read_source',
            arguments: '',
          },
        },
        {
          event_type: 'step.delta',
          index: 1,
          delta: {
            type: 'arguments_delta',
            arguments_delta: '{"id":"source-1"}',
          },
        },
        { event_type: 'step.stop', index: 1 },
        {
          event_type: 'interaction.completed',
          interaction: {
            id: 'interaction_1',
            status: 'completed',
            usage: {
              total_input_tokens: 10,
              total_output_tokens: 5,
              total_cached_tokens: 2,
              total_thought_tokens: 1,
            },
          },
        },
      ],
    ],
    [
      'openai-compatible' as const,
      createOpenAICompatibleAgentProviderAdapter,
      [
        {
          choices: [
            {
              delta: { content: 'hello' },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: {
                      name: 'read_source',
                      arguments: '{"id":"source-1"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      ],
    ],
  ])(
    'normalizes %s text, tool, terminal, and usage facts',
    async (family, factory, events) => {
      const result = await runAgentProviderAdapterConformance(
        factory(common(family, events)),
        REQUEST
      );
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      const types = result.facts.flatMap((fact) =>
        fact.factType === 'provider-event' ? [fact.value.type] : []
      );
      expect(types).toContain('output-delta');
      expect(types).toContain('tool-call');
      expect(types.at(-1)).toBe('completed');
      expect(
        result.facts.filter(({ factType }) => factType === 'usage-vector')
      ).toHaveLength(1);
    }
  );

  it('turns unknown or malformed native events into bounded failure facts', async () => {
    const adapter = createOpenAIResponsesAgentProviderAdapter(
      common('openai-responses', [{ type: 'response.future_unsafe_event' }])
    );
    const result = await runAgentProviderAdapterConformance(adapter, REQUEST);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(
      result.facts.find(
        (fact) =>
          fact.factType === 'provider-event' && fact.value.type === 'failed'
      )
    ).toBeDefined();
  });

  it('forwards cancellation and reconciliation without forging invocation identity fields', async () => {
    const controls: unknown[] = [];
    const adapter = createOpenAIResponsesAgentProviderAdapter({
      ...common('openai-responses', [
        {
          type: 'response.completed',
          response: { id: 'resp_control', status: 'completed' },
        },
      ]),
      transport: Object.freeze({
        async *stream() {
          yield {
            type: 'response.completed',
            response: { id: 'resp_control', status: 'completed' },
          };
        },
        async cancel(request: AgentNativeProviderControlRequest) {
          controls.push(request);
        },
        async reconcile(request: AgentNativeProviderControlRequest) {
          controls.push(request);
        },
      }),
    });
    await adapter.cancel?.({
      invocationId: REQUEST.invocationId,
      requestDigest: REQUEST.requestDigest,
    });
    await adapter.reconcile?.({
      invocationId: REQUEST.invocationId,
      requestDigest: REQUEST.requestDigest,
    });
    expect(controls).toEqual([
      {
        protocolFamily: 'openai-responses',
        invocationId: REQUEST.invocationId,
        requestDigest: REQUEST.requestDigest,
      },
      {
        protocolFamily: 'openai-responses',
        invocationId: REQUEST.invocationId,
        requestDigest: REQUEST.requestDigest,
      },
    ]);
  });
});
