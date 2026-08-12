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
import { digestAgentCanonicalValue } from '../domain/agentCanonical';

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

  it.each([
    [
      'openai-responses' as const,
      createOpenAIResponsesAgentProviderAdapter,
      {
        object: 'response',
        id: 'resp_full_1',
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'full response' }],
          },
          {
            type: 'function_call',
            id: 'item_full_1',
            call_id: 'call_full_1',
            name: 'read_source',
            arguments: '{"id":"source-full"}',
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 6,
          input_tokens_details: { cached_tokens: 3 },
        },
      },
    ],
    [
      'anthropic-messages' as const,
      createAnthropicMessagesAgentProviderAdapter,
      {
        type: 'message',
        id: 'msg_full_1',
        content: [
          { type: 'text', text: 'full message' },
          {
            type: 'tool_use',
            id: 'toolu_full_1',
            name: 'read_source',
            input: { id: 'source-full' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 12,
          output_tokens: 6,
          cache_read_input_tokens: 3,
        },
      },
    ],
    [
      'gemini-interactions' as const,
      createGeminiInteractionsAgentProviderAdapter,
      {
        id: 'interaction_full_1',
        status: 'completed',
        steps: [
          { type: 'model_output', text: 'full interaction' },
          {
            type: 'function_call',
            id: 'call_full_1',
            name: 'read_source',
            arguments: { id: 'source-full' },
          },
        ],
        usage: {
          total_input_tokens: 12,
          total_output_tokens: 6,
          total_cached_tokens: 3,
        },
      },
    ],
  ])(
    'normalizes a bounded full JSON %s response without synthesizing optional support',
    async (family, factory, response) => {
      const adapter = factory(common(family, [response]));
      const facts = [];
      for await (const fact of adapter.invokeRuntime(REQUEST)) facts.push(fact);
      const eventTypes = facts.flatMap((fact) =>
        fact.factType === 'provider-event' ? [fact.value.durableEvent.type] : []
      );

      expect(eventTypes).toEqual(['output-delta', 'tool-call', 'completed']);
      expect(
        facts.filter(({ factType }) => factType === 'usage-vector')
      ).toHaveLength(1);
      expect(
        facts.some(
          ({ factType }) =>
            factType === 'provider-job-receipt' ||
            factType === 'provider-cache-receipt' ||
            factType === 'opaque-continuation'
        )
      ).toBe(false);
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

  it('preserves bounded parsed tool arguments behind the exact durable payload digest', async () => {
    const adapter = createOpenAIResponsesAgentProviderAdapter(
      common('openai-responses', [
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_result_1',
          name: 'evaluation_result_submit',
          arguments: '{"caseId":"case.public.v8"}',
        },
        {
          type: 'response.completed',
          response: {
            id: 'resp_result_1',
            status: 'completed',
            usage: { input_tokens: 2, output_tokens: 1 },
          },
        },
      ])
    );
    const facts = [];
    for await (const fact of adapter.invokeRuntime(REQUEST)) facts.push(fact);
    const toolCall = facts.find(
      (fact) =>
        fact.factType === 'provider-event' &&
        fact.value.durableEvent.type === 'tool-call'
    );

    expect(toolCall).toBeDefined();
    if (!toolCall || toolCall.factType !== 'provider-event') return;
    expect(toolCall.value.payload).toEqual({
      itemId: 'call_result_1',
      name: 'evaluation_result_submit',
      arguments: { caseId: 'case.public.v8' },
      argumentsDigest: digestAgentCanonicalValue({
        caseId: 'case.public.v8',
      }),
    });
    expect(toolCall.value.durableEvent.payloadDigest).toBe(
      digestAgentCanonicalValue(toolCall.value.payload)
    );
  });

  it('fails closed when provider tool arguments are malformed JSON or a non-object', async () => {
    for (const argumentsValue of ['{"caseId":', '["case.public.v8"]']) {
      const adapter = createOpenAIResponsesAgentProviderAdapter(
        common('openai-responses', [
          {
            type: 'response.function_call_arguments.done',
            item_id: 'call_invalid',
            name: 'evaluation_result_submit',
            arguments: argumentsValue,
          },
        ])
      );
      const facts = [];
      for await (const fact of adapter.invokeRuntime(REQUEST)) facts.push(fact);
      expect(
        facts.find(
          (fact) =>
            fact.factType === 'provider-event' &&
            fact.value.durableEvent.type === 'failed'
        )
      ).toBeDefined();
    }
  });

  it('streams normalized payload bindings before the native transport completes', async () => {
    let pulls = 0;
    const adapter = createOpenAIResponsesAgentProviderAdapter({
      ...common('openai-responses', []),
      transport: Object.freeze({
        async *stream() {
          pulls += 1;
          yield { type: 'response.created', response: { id: 'resp_stream' } };
          pulls += 1;
          yield { type: 'response.output_text.delta', delta: 'first' };
          pulls += 1;
          yield {
            type: 'response.completed',
            response: { id: 'resp_stream', status: 'completed' },
          };
        },
      }),
    });
    const iterator = adapter.invokeRuntime(REQUEST)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(pulls).toBe(2);
    if (first.done || first.value.factType !== 'provider-event') return;
    expect(first.value.value).toMatchObject({ payload: { delta: 'first' } });
    expect(first.value.value.durableEvent.payloadDigest).toBe(
      digestAgentCanonicalValue(first.value.value.payload)
    );

    await iterator.return?.();
  });

  it('projects runtime bindings to the existing durable provider facts', async () => {
    const events = [
      { type: 'response.output_text.delta', delta: 'bound output' },
      {
        type: 'response.completed',
        response: { id: 'resp_bound', status: 'completed' },
      },
    ];
    const adapter = createOpenAIResponsesAgentProviderAdapter(
      common('openai-responses', events)
    );
    const runtimeEventDigests = [];
    for await (const fact of adapter.invokeRuntime(REQUEST)) {
      if (fact.factType === 'provider-event') {
        runtimeEventDigests.push(fact.value.durableEvent.eventDigest);
      }
    }
    const durable = await runAgentProviderAdapterConformance(adapter, REQUEST);

    expect(durable).toMatchObject({ ok: true });
    if (!durable.ok) return;
    expect(
      durable.facts.flatMap((fact) =>
        fact.factType === 'provider-event' ? [fact.value.eventDigest] : []
      )
    ).toEqual(runtimeEventDigests);
  });

  it.each([
    {
      name: 'event count',
      events: [
        { type: 'response.created' },
        { type: 'response.in_progress' },
        { type: 'response.queued' },
      ],
      runtimeLimits: { maximumEvents: 2 },
      reason: 'native-event-count-limit-exceeded',
    },
    {
      name: 'per-event bytes',
      events: [{ type: 'response.created', padding: 'x'.repeat(128) }],
      runtimeLimits: { maximumEventBytes: 64 },
      reason: 'unsafe-or-oversized-native-event',
    },
    {
      name: 'aggregate event bytes',
      events: [
        { type: 'response.created', padding: 'x'.repeat(48) },
        { type: 'response.in_progress', padding: 'x'.repeat(48) },
      ],
      runtimeLimits: {
        maximumEventBytes: 256,
        maximumAggregateEventBytes: 128,
      },
      reason: 'native-event-byte-limit-exceeded',
    },
    {
      name: 'output bytes',
      events: [{ type: 'response.output_text.delta', delta: '123456' }],
      runtimeLimits: { maximumOutputBytes: 5 },
      reason: 'output-byte-limit-exceeded',
    },
    {
      name: 'tool argument bytes',
      events: [
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_limit',
          name: 'read_source',
          arguments: '123456',
        },
      ],
      runtimeLimits: { maximumToolArgumentBytes: 5 },
      reason: 'tool-argument-byte-limit-exceeded',
    },
    {
      name: 'aggregate tool argument bytes',
      events: [
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_limit_1',
          name: 'read_source',
          arguments: '{"a":0}',
        },
        {
          type: 'response.function_call_arguments.done',
          item_id: 'call_limit_2',
          name: 'read_source',
          arguments: '{"b":0}',
        },
      ],
      runtimeLimits: {
        maximumToolArgumentBytes: 16,
        maximumAggregateToolArgumentBytes: 10,
      },
      reason: 'tool-argument-byte-limit-exceeded',
    },
  ])('fails closed at the $name boundary', async (testCase) => {
    const adapter = createOpenAIResponsesAgentProviderAdapter({
      ...common('openai-responses', testCase.events),
      runtimeLimits: testCase.runtimeLimits,
    });
    const facts = [];
    for await (const fact of adapter.invokeRuntime(REQUEST)) facts.push(fact);
    const failure = facts.find(
      (fact) =>
        fact.factType === 'provider-event' &&
        fact.value.durableEvent.type === 'failed'
    );

    expect(failure).toBeDefined();
    if (!failure || failure.factType !== 'provider-event') return;
    expect(failure.value.payload).toEqual({ reason: testCase.reason });
  });

  it('bounds normalized events produced by one native chunk', async () => {
    const adapter = createOpenAICompatibleAgentProviderAdapter({
      ...common('openai-compatible', [
        {
          choices: [
            { delta: { content: 'one' }, finish_reason: null },
            { delta: { content: 'two' }, finish_reason: null },
            { delta: { content: 'three' }, finish_reason: null },
          ],
        },
      ]),
      runtimeLimits: { maximumEvents: 2 },
    });
    const events = [];
    for await (const fact of adapter.invokeRuntime(REQUEST)) {
      if (fact.factType === 'provider-event') events.push(fact.value);
    }

    expect(events.map(({ durableEvent }) => durableEvent.type)).toEqual([
      'output-delta',
      'output-delta',
      'failed',
    ]);
    expect(events.at(-1)?.payload).toEqual({
      reason: 'normalized-event-count-limit-exceeded',
    });
  });

  it('rejects runtime limits that exceed the hard safety ceilings', () => {
    expect(() =>
      createOpenAIResponsesAgentProviderAdapter({
        ...common('openai-responses', []),
        runtimeLimits: { maximumEvents: 10_001 },
      })
    ).toThrow(/limits/u);
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
