import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { inspectAgentControlJson } from '../control/agentControlValidation';
import type {
  AgentProviderProtocolFamily,
  AgentUsageUnit,
  Instant,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentProviderEvent } from './agentInvocation';
import type {
  AgentProviderAdapter,
  AgentProviderAdapterInvocationRequest,
} from './agentProviderAdapter';
import {
  encodeAgentProviderFact,
  type AgentProviderFact,
} from './agentProviderCodec';
import type {
  AgentProviderAdapterIdentity,
  AgentUsageAmount,
} from './agentProvider.types';
import {
  createAgentUsageVector,
  createUnknownAgentUsageVector,
} from '../usage/agentUsage';

export type AgentNativeProviderTransportRequest = Readonly<{
  protocolFamily: AgentProviderProtocolFamily;
  invocation: AgentProviderAdapterInvocationRequest;
}>;

export type AgentNativeProviderControlRequest = Readonly<{
  protocolFamily: AgentProviderProtocolFamily;
  invocationId: string;
  requestDigest: string;
}>;

/** Credentials and HTTP clients remain server-owned behind this callback. */
export interface AgentNativeProviderTransport {
  stream(
    request: AgentNativeProviderTransportRequest,
    signal?: AbortSignal
  ): AsyncIterable<unknown>;
  cancel?(request: AgentNativeProviderControlRequest): Promise<unknown>;
  reconcile?(request: AgentNativeProviderControlRequest): Promise<unknown>;
}

type NormalizedSignal = Readonly<{
  type:
    | 'output-delta'
    | 'tool-call'
    | 'refusal'
    | 'safety-block'
    | 'truncation'
    | 'cancelled'
    | 'timed-out'
    | 'partial'
    | 'completed'
    | 'failed';
  payload: unknown;
}>;

type NativeNormalization = Readonly<{
  signals: readonly NormalizedSignal[];
  usage: readonly AgentUsageAmount[];
}>;

type MutableNormalization = {
  signals: NormalizedSignal[];
  usage: Map<AgentUsageUnit, AgentUsageAmount>;
  terminal: boolean;
  refusal: boolean;
  truncation: boolean;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
};

const object = (value: unknown): Record<string, unknown> | undefined =>
  isPlainObject(value) ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const integer = (value: unknown): number | undefined =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;

const putUsage = (
  state: MutableNormalization,
  unit: AgentUsageUnit,
  value: unknown
): void => {
  const amount = integer(value);
  if (amount === undefined) return;
  state.usage.set(
    unit,
    Object.freeze({
      unit,
      logicalAmount: String(amount),
      billableAmount: String(amount),
      confidence: 'reported',
    })
  );
};

const append = (
  state: MutableNormalization,
  type: NormalizedSignal['type'],
  payload: unknown
): void => {
  if (state.terminal) return;
  state.signals.push(Object.freeze({ type, payload }));
  if (
    [
      'refusal',
      'safety-block',
      'truncation',
      'cancelled',
      'timed-out',
      'partial',
      'completed',
      'failed',
    ].includes(type)
  ) {
    state.terminal = true;
  }
};

const terminal = (state: MutableNormalization, payload: unknown): void => {
  append(
    state,
    state.refusal ? 'refusal' : state.truncation ? 'truncation' : 'completed',
    payload
  );
};

const initialState = (): MutableNormalization => ({
  signals: [],
  usage: new Map(),
  terminal: false,
  refusal: false,
  truncation: false,
  toolCalls: new Map(),
});

const readOpenAIUsage = (state: MutableNormalization, raw: unknown): void => {
  const usage = object(raw);
  if (!usage) return;
  putUsage(state, 'text-token-input', usage.input_tokens);
  putUsage(state, 'text-token-output', usage.output_tokens);
  putUsage(
    state,
    'cache-read-token',
    object(usage.input_tokens_details)?.cached_tokens
  );
  putUsage(
    state,
    'reasoning-token',
    object(usage.output_tokens_details)?.reasoning_tokens
  );
};

const normalizeOpenAIResponses = (
  events: readonly unknown[]
): NativeNormalization => {
  const state = initialState();
  for (const raw of events) {
    const event = object(raw);
    const type = text(event?.type);
    if (!event || !type) {
      append(state, 'failed', { reason: 'malformed-native-event' });
      break;
    }
    if (type === 'response.output_text.delta') {
      append(state, 'output-delta', { delta: event.delta });
    } else if (
      type === 'response.refusal.delta' ||
      type === 'response.refusal.done'
    ) {
      state.refusal = true;
    } else if (type === 'response.function_call_arguments.done') {
      append(state, 'tool-call', {
        itemId: event.item_id,
        name: event.name,
        argumentsDigest: digestAgentCanonicalValue(event.arguments ?? ''),
      });
    } else if (type === 'response.completed') {
      const response = object(event.response);
      readOpenAIUsage(state, response?.usage);
      terminal(state, { responseId: response?.id, status: response?.status });
    } else if (type === 'response.incomplete') {
      const response = object(event.response);
      readOpenAIUsage(state, response?.usage);
      state.truncation =
        text(object(response?.incomplete_details)?.reason) ===
          'max_output_tokens' || response?.status === 'incomplete';
      append(state, state.truncation ? 'truncation' : 'partial', {
        responseId: response?.id,
      });
    } else if (type === 'response.failed' || type === 'error') {
      append(state, 'failed', {
        code: event.code ?? object(event.error)?.code,
      });
    } else if (type === 'response.cancelled') {
      append(state, 'cancelled', { response: object(event.response)?.id });
    } else if (
      ![
        'response.created',
        'response.in_progress',
        'response.queued',
        'response.output_item.added',
        'response.output_item.done',
        'response.content_part.added',
        'response.content_part.done',
        'response.output_text.done',
        'response.function_call_arguments.delta',
      ].includes(type)
    ) {
      append(state, 'failed', { reason: 'unknown-native-event', type });
    }
  }
  if (!state.terminal) append(state, 'failed', { reason: 'stream-ended' });
  return Object.freeze({
    signals: Object.freeze(state.signals),
    usage: Object.freeze([...state.usage.values()]),
  });
};

const normalizeAnthropicMessages = (
  events: readonly unknown[]
): NativeNormalization => {
  const state = initialState();
  for (const raw of events) {
    const event = object(raw);
    const type = text(event?.type);
    if (!event || !type) {
      append(state, 'failed', { reason: 'malformed-native-event' });
      break;
    }
    if (type === 'message_start') {
      const message = object(event.message);
      const usage = object(message?.usage);
      putUsage(state, 'text-token-input', usage?.input_tokens);
      putUsage(state, 'cache-read-token', usage?.cache_read_input_tokens);
      putUsage(state, 'cache-write-token', usage?.cache_creation_input_tokens);
    } else if (type === 'content_block_start') {
      const block = object(event.content_block);
      if (block?.type === 'tool_use') {
        state.toolCalls.set(integer(event.index) ?? 0, {
          id: text(block.id) ?? 'unknown-tool-call',
          name: text(block.name) ?? 'unknown-tool',
          arguments: '',
        });
      }
    } else if (type === 'content_block_delta') {
      const delta = object(event.delta);
      if (delta?.type === 'text_delta') {
        append(state, 'output-delta', { delta: delta.text });
      } else if (delta?.type === 'input_json_delta') {
        const call = state.toolCalls.get(integer(event.index) ?? 0);
        if (call) call.arguments += text(delta.partial_json) ?? '';
      } else if (
        !['thinking_delta', 'signature_delta'].includes(text(delta?.type) ?? '')
      ) {
        append(state, 'failed', {
          reason: 'unknown-content-delta',
          type: delta?.type,
        });
      }
    } else if (type === 'content_block_stop') {
      const call = state.toolCalls.get(integer(event.index) ?? 0);
      if (call) {
        append(state, 'tool-call', {
          id: call.id,
          name: call.name,
          argumentsDigest: digestAgentCanonicalValue(call.arguments),
        });
        state.toolCalls.delete(integer(event.index) ?? 0);
      }
    } else if (type === 'message_delta') {
      const delta = object(event.delta);
      const usage = object(event.usage);
      putUsage(state, 'text-token-output', usage?.output_tokens);
      state.refusal = delta?.stop_reason === 'refusal';
      state.truncation = delta?.stop_reason === 'max_tokens';
    } else if (type === 'message_stop') {
      terminal(state, { type: 'message_stop' });
    } else if (type === 'error') {
      append(state, 'failed', { code: object(event.error)?.type });
    } else if (!['ping', 'content_block_stop'].includes(type)) {
      append(state, 'failed', { reason: 'unknown-native-event', type });
    }
  }
  if (!state.terminal) append(state, 'failed', { reason: 'stream-ended' });
  return Object.freeze({
    signals: Object.freeze(state.signals),
    usage: Object.freeze([...state.usage.values()]),
  });
};

const readGeminiUsage = (state: MutableNormalization, raw: unknown): void => {
  const usage = object(raw);
  if (!usage) return;
  putUsage(
    state,
    'text-token-input',
    usage.total_input_tokens ?? usage.prompt_tokens
  );
  putUsage(
    state,
    'text-token-output',
    usage.total_output_tokens ?? usage.completion_tokens
  );
  putUsage(state, 'cache-read-token', usage.total_cached_tokens);
  putUsage(state, 'reasoning-token', usage.total_thought_tokens);
};

const normalizeGeminiInteractions = (
  events: readonly unknown[]
): NativeNormalization => {
  const state = initialState();
  for (const raw of events) {
    const event = object(raw);
    const type = text(event?.event_type) ?? text(event?.type);
    if (!event || !type) {
      append(state, 'failed', { reason: 'malformed-native-event' });
      break;
    }
    if (type === 'step.start') {
      const step = object(event.step);
      if (step?.type === 'function_call') {
        state.toolCalls.set(integer(event.index) ?? 0, {
          id: text(step.id) ?? 'unknown-tool-call',
          name: text(step.name) ?? 'unknown-tool',
          arguments:
            typeof step.arguments === 'string'
              ? step.arguments
              : step.arguments
                ? JSON.stringify(step.arguments)
                : '',
        });
      }
    } else if (type === 'step.delta') {
      const delta = object(event.delta);
      if (delta?.type === 'text') {
        append(state, 'output-delta', { delta: delta.text });
      } else if (
        delta?.type === 'arguments_delta' ||
        delta?.type === 'arguments'
      ) {
        const call = state.toolCalls.get(integer(event.index) ?? 0);
        if (call) {
          call.arguments +=
            text(delta.arguments_delta) ??
            text(delta.partial_arguments) ??
            text(delta.arguments) ??
            '';
        }
      } else if (
        ![
          'thought',
          'thought_signature',
          'thought_summary',
          'image',
          'audio',
        ].includes(text(delta?.type) ?? '')
      ) {
        append(state, 'failed', {
          reason: 'unknown-step-delta',
          type: delta?.type,
        });
      }
    } else if (type === 'step.stop') {
      const call = state.toolCalls.get(integer(event.index) ?? 0);
      if (call) {
        append(state, 'tool-call', {
          id: call.id,
          name: call.name,
          argumentsDigest: digestAgentCanonicalValue(call.arguments),
        });
        state.toolCalls.delete(integer(event.index) ?? 0);
      }
    } else if (
      type === 'interaction.completed' ||
      type === 'interaction.complete' ||
      type === 'interaction.requires_action'
    ) {
      const interaction = object(event.interaction);
      readGeminiUsage(state, interaction?.usage ?? event.usage);
      terminal(state, {
        interactionId: interaction?.id,
        status: interaction?.status,
      });
    } else if (type === 'interaction.failed' || type === 'error') {
      append(state, 'failed', {
        code: event.code ?? object(event.error)?.code,
      });
    } else if (type === 'interaction.cancelled') {
      append(state, 'cancelled', {
        interaction: object(event.interaction)?.id,
      });
    } else if (
      ![
        'interaction.created',
        'interaction.in_progress',
        'interaction.status_update',
      ].includes(type)
    ) {
      append(state, 'failed', { reason: 'unknown-native-event', type });
    }
  }
  if (!state.terminal) append(state, 'failed', { reason: 'stream-ended' });
  return Object.freeze({
    signals: Object.freeze(state.signals),
    usage: Object.freeze([...state.usage.values()]),
  });
};

const normalizeOpenAICompatible = (
  events: readonly unknown[]
): NativeNormalization => {
  const state = initialState();
  for (const raw of events) {
    const chunk = object(raw);
    if (!chunk) {
      append(state, 'failed', { reason: 'malformed-native-event' });
      break;
    }
    if (chunk.error) {
      append(state, 'failed', { code: object(chunk.error)?.code });
      continue;
    }
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choiceRaw of choices) {
      const choice = object(choiceRaw);
      const delta = object(choice?.delta);
      if (typeof delta?.content === 'string') {
        append(state, 'output-delta', { delta: delta.content });
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const toolRaw of delta.tool_calls) {
          const tool = object(toolRaw);
          const index = integer(tool?.index) ?? 0;
          const current = state.toolCalls.get(index) ?? {
            id: text(tool?.id) ?? `compatible-tool-${index}`,
            name: '',
            arguments: '',
          };
          const fn = object(tool?.function);
          current.name ||= text(fn?.name) ?? '';
          current.arguments += text(fn?.arguments) ?? '';
          state.toolCalls.set(index, current);
        }
      }
      const reason = text(choice?.finish_reason);
      if (reason) {
        for (const call of state.toolCalls.values()) {
          append(state, 'tool-call', {
            id: call.id,
            name: call.name,
            argumentsDigest: digestAgentCanonicalValue(call.arguments),
          });
        }
        state.toolCalls.clear();
        if (reason === 'length') append(state, 'truncation', { reason });
        else if (reason === 'content_filter')
          append(state, 'safety-block', { reason });
        else terminal(state, { reason });
      }
    }
    readOpenAIUsage(state, chunk.usage);
  }
  if (!state.terminal) append(state, 'failed', { reason: 'stream-ended' });
  return Object.freeze({
    signals: Object.freeze(state.signals),
    usage: Object.freeze([...state.usage.values()]),
  });
};

const normalizers: Readonly<
  Record<
    AgentProviderProtocolFamily,
    (events: readonly unknown[]) => NativeNormalization
  >
> = Object.freeze({
  'openai-responses': normalizeOpenAIResponses,
  'anthropic-messages': normalizeAnthropicMessages,
  'gemini-interactions': normalizeGeminiInteractions,
  'openai-compatible': normalizeOpenAICompatible,
});

export const normalizeNativeAgentProviderEvents = (
  protocolFamily: AgentProviderProtocolFamily,
  events: readonly unknown[],
  input: Readonly<{ invocationId: string; occurredAt: Instant }>
): readonly AgentProviderFact[] => {
  if (
    events.length > 10_000 ||
    events.some((event) => inspectAgentControlJson(event, 1_048_576).length > 0)
  ) {
    events = Object.freeze([
      Object.freeze({ type: 'error', code: 'unsafe-native-event' }),
    ]);
  }
  const normalized = normalizers[protocolFamily](events);
  const facts: AgentProviderFact[] = normalized.signals.map(
    (signal, sequence) =>
      Object.freeze({
        factType: 'provider-event' as const,
        value: createAgentProviderEvent({
          eventId: `${input.invocationId}.provider-event.${sequence}`,
          invocationId: input.invocationId,
          sequence,
          type: signal.type,
          payloadDigest: digestAgentCanonicalValue(signal.payload),
          occurredAt: input.occurredAt,
        }),
      })
  );
  facts.push(
    Object.freeze({
      factType: 'usage-vector',
      value:
        normalized.usage.length > 0
          ? createAgentUsageVector(normalized.usage)
          : createUnknownAgentUsageVector([
              'text-token-input',
              'text-token-output',
            ]),
    })
  );
  return Object.freeze(facts);
};

const createNativeAdapter = (
  input: Readonly<{
    identity: AgentProviderAdapterIdentity;
    protocolFamily: AgentProviderProtocolFamily;
    declaredProfileDigests: readonly string[];
    supportedProfileDigests: readonly string[];
    transport: AgentNativeProviderTransport;
    now: () => Instant;
  }>
): AgentProviderAdapter => {
  if (input.identity.protocolFamily !== input.protocolFamily) {
    throw new TypeError('Native adapter protocol identity drifted.');
  }
  const declaredProfileDigests = Object.freeze(
    [...input.declaredProfileDigests].sort(compareUnicodeCodePoints)
  );
  const supported = new Set(input.supportedProfileDigests);
  const transportRequest = (
    invocation: AgentProviderAdapterInvocationRequest
  ): AgentNativeProviderTransportRequest =>
    Object.freeze({ protocolFamily: input.protocolFamily, invocation });
  const controlRequest = (
    request: Readonly<{
      invocationId: string;
      requestDigest: string;
    }>
  ): AgentNativeProviderControlRequest =>
    Object.freeze({ protocolFamily: input.protocolFamily, ...request });
  const adapter: AgentProviderAdapter = {
    identity: input.identity,
    declaredProfileDigests,
    probe({
      profileDigest,
    }: Readonly<{
      providerConfigurationId: string;
      modelLineageDigest: string;
      profileDigest: string;
    }>) {
      const declared = declaredProfileDigests.includes(profileDigest);
      const supportedProfile = declared && supported.has(profileDigest);
      return Object.freeze({
        status: supportedProfile
          ? 'supported'
          : declared
            ? 'unsupported'
            : 'inconclusive',
        ...(supportedProfile ? { observedProfileDigest: profileDigest } : {}),
        observedLimitDigest: digestAgentCanonicalValue({
          adapterDigest: input.identity.adapterDigest,
          profileDigest,
          supported: supportedProfile,
        }),
      });
    },
    async *invoke(
      request: AgentProviderAdapterInvocationRequest,
      signal?: AbortSignal
    ) {
      const events: unknown[] = [];
      try {
        for await (const event of input.transport.stream(
          transportRequest(request),
          signal
        )) {
          events.push(event);
          if (events.length > 10_000) break;
        }
      } catch {
        events.push(Object.freeze({ type: 'error', code: 'transport-failed' }));
      }
      for (const fact of normalizeNativeAgentProviderEvents(
        input.protocolFamily,
        events,
        { invocationId: request.invocationId, occurredAt: input.now() }
      )) {
        yield encodeAgentProviderFact(fact);
      }
    },
    ...(input.transport.cancel
      ? {
          cancel: (
            request: Readonly<{
              invocationId: string;
              requestDigest: string;
            }>
          ) => input.transport.cancel!(controlRequest(request)),
        }
      : {}),
    ...(input.transport.reconcile
      ? {
          reconcile: (
            request: Readonly<{
              invocationId: string;
              requestDigest: string;
            }>
          ) => input.transport.reconcile!(controlRequest(request)),
        }
      : {}),
  };
  return Object.freeze(adapter);
};

type NativeFactoryInput = Omit<
  Parameters<typeof createNativeAdapter>[0],
  'protocolFamily'
>;

export const createOpenAIResponsesAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'openai-responses' });

export const createAnthropicMessagesAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'anthropic-messages' });

export const createGeminiInteractionsAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'gemini-interactions' });

export const createOpenAICompatibleAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'openai-compatible' });
