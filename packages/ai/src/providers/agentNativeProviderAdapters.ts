import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  containsAgentControlCredentialLikeText,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import type {
  AgentJsonValue,
  AgentProviderProtocolFamily,
  AgentUsageUnit,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
} from '../security/agentSecurity';
import type {
  AgentProviderAdapter,
  AgentProviderAdapterInvocationRequest,
} from './agentProviderAdapter';
import {
  decodeAgentProviderFact,
  encodeAgentProviderFact,
  type AgentProviderFact,
} from './agentProviderCodec';
import type {
  AgentProviderAdapterIdentity,
  AgentOpaqueContinuationRef,
  AgentProviderCacheReceipt,
  AgentProviderJobReceipt,
  AgentUsageAmount,
  AgentUsageVector,
} from './agentProvider.types';
import {
  createAgentUsageVector,
  createUnknownAgentUsageVector,
} from '../usage/agentUsage';
import {
  createAgentProviderRuntimeEvent,
  normalizeAgentProviderRuntimePayload,
  validateAgentProviderRuntimeEventBinding,
  type AgentProviderRuntimeEvent,
} from './agentProviderRuntime';

export const AGENT_NATIVE_PROVIDER_MAXIMUM_EVENTS = 10_000;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_EVENT_BYTES = 1_048_576;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_EVENT_BYTES = 67_108_864;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_OUTPUT_BYTES = 16_777_216;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_CALLS = 128;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_ARGUMENT_BYTES = 1_048_576;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_TOOL_ARGUMENT_BYTES = 4_194_304;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_OPTIONAL_CAPABILITY_FACT_BYTES = 16_384;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_RUNTIME_FACT_ENVELOPE_BYTES =
  AGENT_NATIVE_PROVIDER_MAXIMUM_EVENT_BYTES + 16_384;
export const AGENT_NATIVE_PROVIDER_MAXIMUM_OBSERVATION_FACTS = 2;

export type AgentNativeProviderRuntimeLimits = Readonly<{
  maximumEvents: number;
  maximumEventBytes: number;
  maximumAggregateEventBytes: number;
  maximumOutputBytes: number;
  maximumToolCalls: number;
  maximumToolArgumentBytes: number;
  maximumAggregateToolArgumentBytes: number;
}>;

export const DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS: AgentNativeProviderRuntimeLimits =
  Object.freeze({
    maximumEvents: AGENT_NATIVE_PROVIDER_MAXIMUM_EVENTS,
    maximumEventBytes: AGENT_NATIVE_PROVIDER_MAXIMUM_EVENT_BYTES,
    maximumAggregateEventBytes:
      AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_EVENT_BYTES,
    maximumOutputBytes: AGENT_NATIVE_PROVIDER_MAXIMUM_OUTPUT_BYTES,
    maximumToolCalls: AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_CALLS,
    maximumToolArgumentBytes: AGENT_NATIVE_PROVIDER_MAXIMUM_TOOL_ARGUMENT_BYTES,
    maximumAggregateToolArgumentBytes:
      AGENT_NATIVE_PROVIDER_MAXIMUM_AGGREGATE_TOOL_ARGUMENT_BYTES,
  });

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

export type AgentNativeProviderRuntimeEventFact = Readonly<{
  factType: 'provider-event';
  value: AgentProviderRuntimeEvent;
}>;

export type AgentNativeProviderRuntimeUsageFact = Readonly<{
  factType: 'usage-vector';
  value: AgentUsageVector;
}>;

export type AgentNativeProviderRuntimeJobFact = Readonly<{
  factType: 'provider-job-receipt';
  value: AgentProviderJobReceipt;
}>;

export type AgentNativeProviderRuntimeCacheFact = Readonly<{
  factType: 'provider-cache-receipt';
  value: AgentProviderCacheReceipt;
}>;

export type AgentNativeProviderRuntimeContinuationFact = Readonly<{
  factType: 'opaque-continuation';
  value: AgentOpaqueContinuationRef;
}>;

export type AgentNativeProviderRuntimeOptionalCapabilityFact =
  | AgentNativeProviderRuntimeJobFact
  | AgentNativeProviderRuntimeCacheFact
  | AgentNativeProviderRuntimeContinuationFact;

export type AgentNativeProviderRuntimeFact =
  | AgentNativeProviderRuntimeEventFact
  | AgentNativeProviderRuntimeUsageFact
  | AgentNativeProviderRuntimeOptionalCapabilityFact;

export type AgentNativeProviderRuntimeFactSanitization = Readonly<{
  protectedMaterialCanaries: readonly string[];
  secretCanaries: readonly string[];
}>;

export type AgentNativeProviderRuntimeFactEnvelope = Readonly<{
  format: 'prodivix.agent-native-provider-runtime-fact-envelope';
  version: 1;
  protocolFamily: AgentProviderProtocolFamily;
  invocationId: string;
  requestDigest: string;
  providerConfigurationId: string;
  modelLineageDigest: string;
  fact: AgentNativeProviderRuntimeFact;
  envelopeDigest: string;
}>;

const emptyRuntimeFactSanitization: AgentNativeProviderRuntimeFactSanitization =
  Object.freeze({
    protectedMaterialCanaries: Object.freeze([]),
    secretCanaries: Object.freeze([]),
  });

const hasExactRuntimeFactKeys = (
  value: unknown,
  required: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

export const isAgentNativeProviderRuntimeOptionalCapabilityFact = (
  fact: AgentNativeProviderRuntimeFact
): fact is AgentNativeProviderRuntimeOptionalCapabilityFact =>
  fact.factType === 'provider-job-receipt' ||
  fact.factType === 'provider-cache-receipt' ||
  fact.factType === 'opaque-continuation';

const runtimeFactIsExact = (
  fact: AgentNativeProviderRuntimeFact,
  binding: Readonly<{
    invocationId: string;
    providerConfigurationId: string;
    modelLineageDigest: string;
  }>
): boolean => {
  try {
    if (!hasExactRuntimeFactKeys(fact, ['factType', 'value'])) return false;
    switch (fact.factType) {
      case 'usage-vector':
        return sameCanonicalJson(
          fact.value,
          createAgentUsageVector(fact.value.amounts)
        );
      case 'provider-event':
        return (
          fact.value.durableEvent.invocationId === binding.invocationId &&
          sameCanonicalJson(
            fact.value,
            validateAgentProviderRuntimeEventBinding(fact.value)
          )
        );
      case 'provider-job-receipt':
      case 'provider-cache-receipt':
      case 'opaque-continuation': {
        const decoded = decodeAgentProviderFact(
          Object.freeze({ ...fact, wireVersion: 1 })
        );
        if (
          !decoded.ok ||
          decoded.value.factType !== fact.factType ||
          !sameCanonicalJson(decoded.value, fact)
        ) {
          return false;
        }
        if (fact.factType === 'provider-job-receipt') {
          return fact.value.invocationId === binding.invocationId;
        }
        if (fact.factType === 'opaque-continuation') {
          return (
            fact.value.parentInvocationId === binding.invocationId &&
            fact.value.providerConfigurationId ===
              binding.providerConfigurationId &&
            fact.value.modelLineageDigest === binding.modelLineageDigest
          );
        }
        return true;
      }
    }
  } catch {
    return false;
  }
};

const runtimeFactIsSanitized = (
  fact: AgentNativeProviderRuntimeFact,
  sanitization?: AgentNativeProviderRuntimeFactSanitization
): boolean => {
  try {
    if (
      inspectAgentControlJson(
        fact,
        fact.factType === 'provider-event'
          ? AGENT_NATIVE_PROVIDER_MAXIMUM_RUNTIME_FACT_ENVELOPE_BYTES
          : AGENT_NATIVE_PROVIDER_MAXIMUM_OPTIONAL_CAPABILITY_FACT_BYTES
      ).length > 0 ||
      containsAgentControlCredentialLikeText(canonicalJsonText(fact))
    ) {
      return false;
    }
    if (!sanitization) return true;
    const protectedMaterialCanaries = sanitization.protectedMaterialCanaries;
    const secretCanaries = sanitization.secretCanaries;
    return (
      Array.isArray(protectedMaterialCanaries) &&
      Array.isArray(secretCanaries) &&
      (protectedMaterialCanaries.length === 0 ||
        scanAgentArtifactForProtectedHoldoutLeak(
          fact,
          protectedMaterialCanaries
        ).length === 0) &&
      (secretCanaries.length === 0 ||
        scanAgentArtifactForSecretCanaries(fact, secretCanaries).length === 0)
    );
  } catch {
    return false;
  }
};

const runtimeFactEnvelopeBase = (
  value: Omit<AgentNativeProviderRuntimeFactEnvelope, 'envelopeDigest'>
) =>
  Object.freeze({
    format: value.format,
    version: value.version,
    protocolFamily: value.protocolFamily,
    invocationId: value.invocationId,
    requestDigest: value.requestDigest,
    providerConfigurationId: value.providerConfigurationId,
    modelLineageDigest: value.modelLineageDigest,
    fact: value.fact,
  });

export const createAgentNativeProviderRuntimeFactEnvelope = (
  input: Readonly<{
    protocolFamily: AgentProviderProtocolFamily;
    invocationId: string;
    requestDigest: string;
    providerConfigurationId: string;
    modelLineageDigest: string;
    fact: AgentNativeProviderRuntimeFact;
  }>,
  sanitization: AgentNativeProviderRuntimeFactSanitization
): AgentNativeProviderRuntimeFactEnvelope => {
  const fact = normalizeAgentProviderRuntimePayload(input.fact, {
    maximumBytes:
      input.fact.factType === 'provider-event'
        ? AGENT_NATIVE_PROVIDER_MAXIMUM_RUNTIME_FACT_ENVELOPE_BYTES
        : AGENT_NATIVE_PROVIDER_MAXIMUM_OPTIONAL_CAPABILITY_FACT_BYTES,
  }) as AgentNativeProviderRuntimeFact;
  const base = runtimeFactEnvelopeBase({
    format: 'prodivix.agent-native-provider-runtime-fact-envelope',
    version: 1,
    protocolFamily: input.protocolFamily,
    invocationId: input.invocationId,
    requestDigest: input.requestDigest,
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    fact,
  });
  if (
    !isAgentControlIdentity(input.invocationId) ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    !isAgentControlIdentity(input.providerConfigurationId) ||
    !isAgentCanonicalDigest(input.modelLineageDigest) ||
    (input.protocolFamily === 'openai-compatible' &&
      fact.factType !== 'provider-event' &&
      fact.factType !== 'usage-vector') ||
    !runtimeFactIsExact(fact, input) ||
    !runtimeFactIsSanitized(fact, sanitization)
  ) {
    throw new TypeError('Native provider runtime fact is invalid.');
  }
  if (
    inspectAgentControlJson(
      base,
      AGENT_NATIVE_PROVIDER_MAXIMUM_RUNTIME_FACT_ENVELOPE_BYTES
    ).length > 0
  ) {
    throw new TypeError('Native provider runtime fact envelope is invalid.');
  }
  return Object.freeze({
    ...base,
    envelopeDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentNativeProviderRuntimeFactEnvelope = (
  value: unknown,
  sanitization: AgentNativeProviderRuntimeFactSanitization = emptyRuntimeFactSanitization
): value is AgentNativeProviderRuntimeFactEnvelope => {
  try {
    if (
      !isPlainObject(value) ||
      Object.keys(value).length !== 9 ||
      Object.getOwnPropertySymbols(value).length !== 0 ||
      Object.keys(value).some((key) => isUnsafeObjectKey(key)) ||
      value.format !== 'prodivix.agent-native-provider-runtime-fact-envelope' ||
      value.version !== 1 ||
      ![
        'openai-responses',
        'anthropic-messages',
        'gemini-interactions',
        'openai-compatible',
      ].includes(String(value.protocolFamily)) ||
      !isAgentControlIdentity(value.invocationId) ||
      !isAgentCanonicalDigest(value.requestDigest) ||
      !isAgentControlIdentity(value.providerConfigurationId) ||
      !isAgentCanonicalDigest(value.modelLineageDigest) ||
      !isPlainObject(value.fact) ||
      ![
        'provider-event',
        'usage-vector',
        'provider-job-receipt',
        'provider-cache-receipt',
        'opaque-continuation',
      ].includes(String(value.fact.factType)) ||
      typeof value.envelopeDigest !== 'string'
    ) {
      return false;
    }
    const envelope = value as AgentNativeProviderRuntimeFactEnvelope;
    return (
      !(
        envelope.protocolFamily === 'openai-compatible' &&
        envelope.fact.factType !== 'provider-event' &&
        envelope.fact.factType !== 'usage-vector'
      ) &&
      runtimeFactIsExact(envelope.fact, envelope) &&
      runtimeFactIsSanitized(envelope.fact, sanitization) &&
      inspectAgentControlJson(
        envelope,
        AGENT_NATIVE_PROVIDER_MAXIMUM_RUNTIME_FACT_ENVELOPE_BYTES
      ).length === 0 &&
      envelope.envelopeDigest ===
        digestAgentCanonicalValue(runtimeFactEnvelopeBase(envelope))
    );
  } catch {
    return false;
  }
};

const terminalRuntimeFactTypes = new Set<
  AgentProviderRuntimeEvent['durableEvent']['type']
>([
  'cancelled',
  'completed',
  'failed',
  'partial',
  'refusal',
  'safety-block',
  'timed-out',
  'truncation',
]);

/**
 * Selects at most two already-observed facts for one evaluation turn. The
 * expected optional type only selects among real facts; it never creates
 * support from a profile, tag, or probe declaration.
 */
export const selectAgentNativeProviderCapabilityObservationFacts = (input: {
  facts: readonly AgentNativeProviderRuntimeFact[];
  expectedOptionalFactType?: AgentNativeProviderRuntimeOptionalCapabilityFact['factType'];
}): readonly AgentNativeProviderRuntimeFact[] => {
  const terminals = input.facts.filter(
    (fact): fact is AgentNativeProviderRuntimeEventFact =>
      fact.factType === 'provider-event' &&
      terminalRuntimeFactTypes.has(fact.value.durableEvent.type)
  );
  const usage = input.facts.filter(
    (fact): fact is AgentNativeProviderRuntimeUsageFact =>
      fact.factType === 'usage-vector'
  );
  const optionals = input.facts.filter(
    (fact): fact is AgentNativeProviderRuntimeOptionalCapabilityFact =>
      fact.factType === 'provider-job-receipt' ||
      fact.factType === 'provider-cache-receipt' ||
      fact.factType === 'opaque-continuation'
  );
  if (
    terminals.length > 1 ||
    usage.length !== 1 ||
    new Set(optionals.map(({ factType }) => factType)).size !==
      optionals.length ||
    optionals.length > AGENT_NATIVE_PROVIDER_MAXIMUM_OBSERVATION_FACTS
  ) {
    throw new TypeError('Native provider observation facts are invalid.');
  }
  const expected = input.expectedOptionalFactType
    ? optionals.filter(
        ({ factType }) => factType === input.expectedOptionalFactType
      )
    : [];
  if (expected.length > 1) {
    throw new TypeError('Native provider observation fact is ambiguous.');
  }
  if (
    terminals.length === 0 &&
    (expected.length !== 1 ||
      input.expectedOptionalFactType !== 'provider-job-receipt')
  ) {
    throw new TypeError(
      'Native provider nonterminal observation omitted an active job fact.'
    );
  }
  const selected = expected[0]
    ? input.expectedOptionalFactType === 'provider-cache-receipt'
      ? [expected[0], usage[0]!]
      : terminals[0]
        ? [expected[0], terminals[0]]
        : [expected[0], usage[0]!]
    : [terminals[0]!, usage[0]!];
  return Object.freeze(
    [...selected].sort((left, right) =>
      compareUnicodeCodePoints(left.factType, right.factType)
    )
  );
};

export const digestAgentNativeProviderRuntimeResponse = (
  requestDigest: string,
  facts: readonly AgentNativeProviderRuntimeFact[]
): string =>
  digestAgentCanonicalValue({
    requestDigest,
    factDigests: facts.map((fact) => {
      switch (fact.factType) {
        case 'provider-event':
          return fact.value.durableEvent.eventDigest;
        case 'usage-vector':
          return fact.value.vectorDigest;
        case 'provider-job-receipt':
        case 'provider-cache-receipt':
          return fact.value.receiptDigest;
        case 'opaque-continuation':
          return fact.value.continuationDigest;
      }
    }),
  });

export interface AgentNativeProviderAdapter extends AgentProviderAdapter {
  /** Runtime-only stream; normalized payload bodies stay paired to facts here. */
  invokeRuntime(
    request: AgentProviderAdapterInvocationRequest,
    signal?: AbortSignal
  ): AsyncIterable<AgentNativeProviderRuntimeFact>;
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
  payload: AgentJsonValue;
}>;

type MutableNormalization = {
  signals: NormalizedSignal[];
  usage: Map<AgentUsageUnit, AgentUsageAmount>;
  terminal: boolean;
  /** One sealed full Provider response explicitly reported queued/in-progress. */
  nonterminalResponseClosed: boolean;
  refusal: boolean;
  truncation: boolean;
  toolCalls: Map<
    number,
    {
      id: string;
      name: string;
      argumentChunks: string[];
      argumentBytes: number;
    }
  >;
  eventCount: number;
  normalizedEventCount: number;
  aggregateEventBytes: number;
  outputBytes: number;
  aggregateToolArgumentBytes: number;
  toolCallCount: number;
  limits: AgentNativeProviderRuntimeLimits;
};

const encoder = new TextEncoder();

const byteLength = (value: string): number => encoder.encode(value).byteLength;

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
  if (state.normalizedEventCount >= state.limits.maximumEvents) {
    appendFailure(state, 'normalized-event-count-limit-exceeded');
    return;
  }
  let normalizedPayload: AgentJsonValue;
  try {
    normalizedPayload = normalizeAgentProviderRuntimePayload(payload);
  } catch {
    appendFailure(state, 'malformed-normalized-payload');
    return;
  }
  if (type === 'output-delta') {
    const delta = text(object(normalizedPayload)?.delta);
    if (delta === undefined) {
      appendFailure(state, 'malformed-output-delta');
      return;
    }
    state.outputBytes += byteLength(delta);
    if (state.outputBytes > state.limits.maximumOutputBytes) {
      appendFailure(state, 'output-byte-limit-exceeded');
      return;
    }
  }
  state.normalizedEventCount += 1;
  state.signals.push(Object.freeze({ type, payload: normalizedPayload }));
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

const appendFailure = (state: MutableNormalization, reason: string): void => {
  if (state.terminal) return;
  state.toolCalls.clear();
  state.signals.push(
    Object.freeze({ type: 'failed', payload: Object.freeze({ reason }) })
  );
  state.terminal = true;
};

const terminal = (state: MutableNormalization, payload: unknown): void => {
  if (state.toolCalls.size > 0) {
    appendFailure(state, 'incomplete-tool-call');
    return;
  }
  append(
    state,
    state.refusal ? 'refusal' : state.truncation ? 'truncation' : 'completed',
    payload
  );
};

const initialState = (
  limits: AgentNativeProviderRuntimeLimits
): MutableNormalization => ({
  signals: [],
  usage: new Map(),
  terminal: false,
  nonterminalResponseClosed: false,
  refusal: false,
  truncation: false,
  toolCalls: new Map(),
  eventCount: 0,
  normalizedEventCount: 0,
  aggregateEventBytes: 0,
  outputBytes: 0,
  aggregateToolArgumentBytes: 0,
  toolCallCount: 0,
  limits,
});

const startToolCall = (
  state: MutableNormalization,
  index: number,
  input: Readonly<{ id: string; name: string; arguments?: string }>
): void => {
  if (state.terminal) return;
  if (state.toolCalls.has(index)) {
    appendFailure(state, 'duplicate-tool-call-index');
    return;
  }
  if (state.toolCallCount >= state.limits.maximumToolCalls) {
    appendFailure(state, 'tool-call-count-limit-exceeded');
    return;
  }
  const argumentsText = input.arguments ?? '';
  const argumentBytes = byteLength(argumentsText);
  if (
    argumentBytes > state.limits.maximumToolArgumentBytes ||
    state.aggregateToolArgumentBytes + argumentBytes >
      state.limits.maximumAggregateToolArgumentBytes
  ) {
    appendFailure(state, 'tool-argument-byte-limit-exceeded');
    return;
  }
  state.aggregateToolArgumentBytes += argumentBytes;
  state.toolCallCount += 1;
  state.toolCalls.set(index, {
    id: input.id,
    name: input.name,
    argumentChunks: argumentsText ? [argumentsText] : [],
    argumentBytes,
  });
};

const appendToolArguments = (
  state: MutableNormalization,
  index: number,
  value: string
): void => {
  if (state.terminal) return;
  const call = state.toolCalls.get(index);
  if (!call) {
    appendFailure(state, 'tool-argument-without-call');
    return;
  }
  const addedBytes = byteLength(value);
  if (
    call.argumentBytes + addedBytes > state.limits.maximumToolArgumentBytes ||
    state.aggregateToolArgumentBytes + addedBytes >
      state.limits.maximumAggregateToolArgumentBytes
  ) {
    appendFailure(state, 'tool-argument-byte-limit-exceeded');
    return;
  }
  call.argumentChunks.push(value);
  call.argumentBytes += addedBytes;
  state.aggregateToolArgumentBytes += addedBytes;
};

const joinedToolArguments = (call: {
  argumentChunks: readonly string[];
}): string => call.argumentChunks.join('');

const parsedToolArguments = (
  state: MutableNormalization,
  argumentsText: string
): AgentJsonValue | undefined => {
  try {
    const parsed = JSON.parse(argumentsText || '{}') as unknown;
    if (!isPlainObject(parsed)) {
      appendFailure(state, 'tool-arguments-must-be-object');
      return undefined;
    }
    return normalizeAgentProviderRuntimePayload(parsed, {
      maximumBytes: state.limits.maximumToolArgumentBytes,
    });
  } catch {
    appendFailure(state, 'malformed-tool-arguments');
    return undefined;
  }
};

const appendParsedToolCall = (
  state: MutableNormalization,
  input: Readonly<{
    id: string;
    idKey?: 'id' | 'itemId';
    name: string;
    arguments: string;
  }>
): void => {
  const parsed = parsedToolArguments(state, input.arguments);
  if (parsed === undefined) return;
  append(state, 'tool-call', {
    [input.idKey ?? 'id']: input.id,
    name: input.name,
    arguments: parsed,
    argumentsDigest: digestAgentCanonicalValue(parsed),
  });
};

const appendCompleteToolCall = (
  state: MutableNormalization,
  input: Readonly<{
    id: string;
    idKey?: 'id' | 'itemId';
    name: string;
    arguments: string;
  }>
): void => {
  if (state.terminal) return;
  if (state.toolCallCount >= state.limits.maximumToolCalls) {
    appendFailure(state, 'tool-call-count-limit-exceeded');
    return;
  }
  const argumentBytes = byteLength(input.arguments);
  if (
    argumentBytes > state.limits.maximumToolArgumentBytes ||
    state.aggregateToolArgumentBytes + argumentBytes >
      state.limits.maximumAggregateToolArgumentBytes
  ) {
    appendFailure(state, 'tool-argument-byte-limit-exceeded');
    return;
  }
  state.aggregateToolArgumentBytes += argumentBytes;
  state.toolCallCount += 1;
  appendParsedToolCall(state, input);
};

const readOpenAIUsage = (state: MutableNormalization, raw: unknown): void => {
  const usage = object(raw);
  if (!usage) return;
  putUsage(
    state,
    'text-token-input',
    usage.input_tokens ?? usage.prompt_tokens
  );
  putUsage(
    state,
    'text-token-output',
    usage.output_tokens ?? usage.completion_tokens
  );
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

const consumeOpenAIFullResponse = (
  state: MutableNormalization,
  response: Record<string, unknown>
): boolean => {
  if (
    response.object !== 'response' &&
    !(typeof response.id === 'string' && Array.isArray(response.output))
  ) {
    return false;
  }
  const responseId = text(response.id);
  const status = text(response.status);
  if (!responseId || !status || !Array.isArray(response.output)) {
    appendFailure(state, 'malformed-native-response');
    return true;
  }
  for (const itemRaw of response.output) {
    const item = object(itemRaw);
    if (!item || typeof item.type !== 'string') {
      appendFailure(state, 'malformed-native-response-output');
      return true;
    }
    if (item.type === 'function_call') {
      const name = text(item.name);
      const callId = text(item.call_id) ?? text(item.id);
      const argumentsText = text(item.arguments);
      if (!name || !callId || argumentsText === undefined) {
        appendFailure(state, 'malformed-tool-arguments');
        return true;
      }
      appendCompleteToolCall(state, {
        id: callId,
        idKey: 'itemId',
        name,
        arguments: argumentsText,
      });
      if (state.terminal) return true;
      continue;
    }
    if (item.type !== 'message') continue;
    if (!Array.isArray(item.content)) {
      appendFailure(state, 'malformed-native-response-output');
      return true;
    }
    for (const contentRaw of item.content) {
      const content = object(contentRaw);
      if (!content || typeof content.type !== 'string') {
        appendFailure(state, 'malformed-native-response-output');
        return true;
      }
      if (content.type === 'output_text') {
        const value = text(content.text);
        if (value === undefined) {
          appendFailure(state, 'malformed-output-delta');
          return true;
        }
        append(state, 'output-delta', { delta: value });
      } else if (content.type === 'refusal') {
        state.refusal = true;
      }
      if (state.terminal) return true;
    }
  }
  readOpenAIUsage(state, response.usage);
  if (status === 'completed') {
    terminal(state, { responseId, status });
  } else if (status === 'incomplete') {
    state.truncation =
      text(object(response.incomplete_details)?.reason) === 'max_output_tokens';
    append(state, state.truncation ? 'truncation' : 'partial', {
      responseId,
      status,
    });
  } else if (status === 'failed') {
    append(state, 'failed', { responseId, status });
  } else if (status === 'cancelled') {
    append(state, 'cancelled', { responseId, status });
  } else if (status !== 'queued' && status !== 'in_progress') {
    appendFailure(state, 'unknown-native-response-status');
  } else {
    state.nonterminalResponseClosed = true;
  }
  return true;
};

const consumeOpenAIResponsesEvent = (
  state: MutableNormalization,
  raw: unknown
): void => {
  const event = object(raw);
  const type = text(event?.type);
  if (!event) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (consumeOpenAIFullResponse(state, event)) return;
  if (!type) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (type === 'response.output_text.delta') {
    append(state, 'output-delta', { delta: event.delta });
  } else if (
    type === 'response.refusal.delta' ||
    type === 'response.refusal.done'
  ) {
    state.refusal = true;
  } else if (type === 'response.function_call_arguments.done') {
    const argumentsText = text(event.arguments);
    if (argumentsText === undefined) {
      appendFailure(state, 'malformed-tool-arguments');
      return;
    }
    appendCompleteToolCall(state, {
      id: text(event.item_id) ?? 'unknown-tool-call',
      idKey: 'itemId',
      name: text(event.name) ?? 'unknown-tool',
      arguments: argumentsText,
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
    appendFailure(state, 'unknown-native-event');
  }
};

const consumeAnthropicFullMessage = (
  state: MutableNormalization,
  message: Record<string, unknown>
): boolean => {
  if (message.type !== 'message') return false;
  const messageId = text(message.id);
  const stopReason = text(message.stop_reason);
  if (!messageId || !Array.isArray(message.content)) {
    appendFailure(state, 'malformed-native-response');
    return true;
  }
  const usage = object(message.usage);
  putUsage(state, 'text-token-input', usage?.input_tokens);
  putUsage(state, 'text-token-output', usage?.output_tokens);
  putUsage(state, 'cache-read-token', usage?.cache_read_input_tokens);
  putUsage(state, 'cache-write-token', usage?.cache_creation_input_tokens);
  for (const [index, blockRaw] of message.content.entries()) {
    const block = object(blockRaw);
    if (!block || typeof block.type !== 'string') {
      appendFailure(state, 'malformed-native-response-output');
      return true;
    }
    if (block.type === 'text') {
      const value = text(block.text);
      if (value === undefined) {
        appendFailure(state, 'malformed-output-delta');
        return true;
      }
      append(state, 'output-delta', { delta: value });
    } else if (block.type === 'tool_use') {
      const id = text(block.id);
      const name = text(block.name);
      if (!id || !name || !isPlainObject(block.input)) {
        appendFailure(state, 'malformed-tool-arguments');
        return true;
      }
      appendCompleteToolCall(state, {
        id,
        name,
        arguments: canonicalJsonText(block.input),
      });
    } else if (block.type === 'refusal') {
      state.refusal = true;
    }
    if (state.terminal) return true;
    if (index >= state.limits.maximumEvents) {
      appendFailure(state, 'normalized-event-count-limit-exceeded');
      return true;
    }
  }
  state.refusal ||= stopReason === 'refusal';
  state.truncation ||= stopReason === 'max_tokens';
  terminal(state, { messageId, stopReason: stopReason ?? null });
  return true;
};

const consumeAnthropicMessagesEvent = (
  state: MutableNormalization,
  raw: unknown
): void => {
  const event = object(raw);
  const type = text(event?.type);
  if (!event) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (consumeAnthropicFullMessage(state, event)) return;
  if (!type) {
    appendFailure(state, 'malformed-native-event');
    return;
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
      startToolCall(state, integer(event.index) ?? 0, {
        id: text(block.id) ?? 'unknown-tool-call',
        name: text(block.name) ?? 'unknown-tool',
      });
    }
  } else if (type === 'content_block_delta') {
    const delta = object(event.delta);
    if (delta?.type === 'text_delta') {
      append(state, 'output-delta', { delta: delta.text });
    } else if (delta?.type === 'input_json_delta') {
      const partial = text(delta.partial_json);
      if (partial === undefined) {
        appendFailure(state, 'malformed-tool-arguments');
        return;
      }
      appendToolArguments(state, integer(event.index) ?? 0, partial);
    } else if (
      !['thinking_delta', 'signature_delta'].includes(text(delta?.type) ?? '')
    ) {
      appendFailure(state, 'unknown-content-delta');
    }
  } else if (type === 'content_block_stop') {
    const index = integer(event.index) ?? 0;
    const call = state.toolCalls.get(index);
    if (call) {
      appendParsedToolCall(state, {
        id: call.id,
        name: call.name,
        arguments: joinedToolArguments(call),
      });
      state.toolCalls.delete(index);
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
  } else if (type !== 'ping') {
    appendFailure(state, 'unknown-native-event');
  }
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

const consumeGeminiFullInteraction = (
  state: MutableNormalization,
  interaction: Record<string, unknown>
): boolean => {
  if (
    typeof interaction.id !== 'string' ||
    typeof interaction.status !== 'string' ||
    (!Array.isArray(interaction.steps) && !Array.isArray(interaction.outputs))
  ) {
    return false;
  }
  const interactionId = text(interaction.id)!;
  const status = text(interaction.status)!;
  const steps = Array.isArray(interaction.steps)
    ? interaction.steps
    : interaction.outputs;
  for (const stepRaw of steps as unknown[]) {
    const step = object(stepRaw);
    if (!step || typeof step.type !== 'string') {
      appendFailure(state, 'malformed-native-response-output');
      return true;
    }
    if (step.type === 'function_call') {
      const id = text(step.id);
      const name = text(step.name);
      const argumentsText =
        typeof step.arguments === 'string'
          ? step.arguments
          : isPlainObject(step.arguments)
            ? canonicalJsonText(step.arguments)
            : undefined;
      if (!id || !name || argumentsText === undefined) {
        appendFailure(state, 'malformed-tool-arguments');
        return true;
      }
      appendCompleteToolCall(state, { id, name, arguments: argumentsText });
    } else if (
      step.type === 'model_output' ||
      step.type === 'text' ||
      step.type === 'output_text'
    ) {
      const directText = text(step.text);
      if (directText !== undefined) {
        append(state, 'output-delta', { delta: directText });
      } else if (Array.isArray(step.content)) {
        for (const partRaw of step.content) {
          const part = object(partRaw);
          const partText = text(part?.text);
          if (!part || partText === undefined) {
            appendFailure(state, 'malformed-output-delta');
            return true;
          }
          append(state, 'output-delta', { delta: partText });
        }
      }
    }
    if (state.terminal) return true;
  }
  readGeminiUsage(state, interaction.usage);
  if (status === 'completed' || status === 'requires_action') {
    terminal(state, { interactionId, status });
  } else if (status === 'failed') {
    append(state, 'failed', { interactionId, status });
  } else if (status === 'cancelled') {
    append(state, 'cancelled', { interactionId, status });
  } else if (status !== 'queued' && status !== 'in_progress') {
    appendFailure(state, 'unknown-native-response-status');
  } else {
    state.nonterminalResponseClosed = true;
  }
  return true;
};

const consumeGeminiInteractionsEvent = (
  state: MutableNormalization,
  raw: unknown
): void => {
  const event = object(raw);
  const type = text(event?.event_type) ?? text(event?.type);
  if (!event) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (consumeGeminiFullInteraction(state, event)) return;
  if (!type) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (type === 'step.start') {
    const step = object(event.step);
    if (step?.type === 'function_call') {
      const argumentsText =
        typeof step.arguments === 'string'
          ? step.arguments
          : step.arguments === undefined || step.arguments === null
            ? ''
            : canonicalJsonText(step.arguments);
      startToolCall(state, integer(event.index) ?? 0, {
        id: text(step.id) ?? 'unknown-tool-call',
        name: text(step.name) ?? 'unknown-tool',
        arguments: argumentsText,
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
      const partial =
        text(delta.arguments_delta) ??
        text(delta.partial_arguments) ??
        text(delta.arguments);
      if (partial === undefined) {
        appendFailure(state, 'malformed-tool-arguments');
        return;
      }
      appendToolArguments(state, integer(event.index) ?? 0, partial);
    } else if (
      ![
        'thought',
        'thought_signature',
        'thought_summary',
        'image',
        'audio',
      ].includes(text(delta?.type) ?? '')
    ) {
      appendFailure(state, 'unknown-step-delta');
    }
  } else if (type === 'step.stop') {
    const index = integer(event.index) ?? 0;
    const call = state.toolCalls.get(index);
    if (call) {
      appendParsedToolCall(state, {
        id: call.id,
        name: call.name,
        arguments: joinedToolArguments(call),
      });
      state.toolCalls.delete(index);
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
    appendFailure(state, 'unknown-native-event');
  }
};

const consumeOpenAICompatibleEvent = (
  state: MutableNormalization,
  raw: unknown
): void => {
  const chunk = object(raw);
  if (!chunk) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  if (chunk.error) {
    append(state, 'failed', { code: object(chunk.error)?.code });
    return;
  }
  if (!Array.isArray(chunk.choices)) {
    appendFailure(state, 'malformed-native-event');
    return;
  }
  for (const choiceRaw of chunk.choices) {
    if (state.terminal) break;
    const choice = object(choiceRaw);
    if (!choice) {
      appendFailure(state, 'malformed-native-event');
      break;
    }
    const delta = object(choice.delta);
    if (typeof delta?.content === 'string') {
      append(state, 'output-delta', { delta: delta.content });
    }
    if (Array.isArray(delta?.tool_calls)) {
      for (const toolRaw of delta.tool_calls) {
        const tool = object(toolRaw);
        const index = integer(tool?.index) ?? 0;
        const fn = object(tool?.function);
        if (!state.toolCalls.has(index)) {
          startToolCall(state, index, {
            id: text(tool?.id) ?? `compatible-tool-${index}`,
            name: text(fn?.name) ?? '',
          });
        }
        const current = state.toolCalls.get(index);
        if (current && !current.name) current.name = text(fn?.name) ?? '';
        const partial = text(fn?.arguments);
        if (fn && fn.arguments !== undefined && partial === undefined) {
          appendFailure(state, 'malformed-tool-arguments');
          break;
        }
        if (partial !== undefined) appendToolArguments(state, index, partial);
      }
    }
    const reason = text(choice.finish_reason);
    if (reason) {
      for (const call of state.toolCalls.values()) {
        appendParsedToolCall(state, {
          id: call.id,
          name: call.name,
          arguments: joinedToolArguments(call),
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
};

const normalizers: Readonly<
  Record<
    AgentProviderProtocolFamily,
    (state: MutableNormalization, event: unknown) => void
  >
> = Object.freeze({
  'openai-responses': consumeOpenAIResponsesEvent,
  'anthropic-messages': consumeAnthropicMessagesEvent,
  'gemini-interactions': consumeGeminiInteractionsEvent,
  'openai-compatible': consumeOpenAICompatibleEvent,
});

const normalizeRuntimeLimits = (
  input: Partial<AgentNativeProviderRuntimeLimits> = {}
): AgentNativeProviderRuntimeLimits => {
  const allowedKeys = new Set([
    'maximumEvents',
    'maximumEventBytes',
    'maximumAggregateEventBytes',
    'maximumOutputBytes',
    'maximumToolCalls',
    'maximumToolArgumentBytes',
    'maximumAggregateToolArgumentBytes',
  ]);
  let normalizedInput: Record<string, unknown>;
  try {
    const normalized = normalizeAgentProviderRuntimePayload(input, {
      maximumBytes: 1_024,
    });
    if (
      !isPlainObject(normalized) ||
      Object.keys(normalized).some((key) => !allowedKeys.has(key))
    ) {
      throw new TypeError('invalid shape');
    }
    normalizedInput = normalized;
  } catch {
    throw new TypeError('Native provider runtime limits are invalid.');
  }
  const limits = Object.freeze({
    maximumEvents:
      (normalizedInput.maximumEvents as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumEvents,
    maximumEventBytes:
      (normalizedInput.maximumEventBytes as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumEventBytes,
    maximumAggregateEventBytes:
      (normalizedInput.maximumAggregateEventBytes as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumAggregateEventBytes,
    maximumOutputBytes:
      (normalizedInput.maximumOutputBytes as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumOutputBytes,
    maximumToolCalls:
      (normalizedInput.maximumToolCalls as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumToolCalls,
    maximumToolArgumentBytes:
      (normalizedInput.maximumToolArgumentBytes as number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumToolArgumentBytes,
    maximumAggregateToolArgumentBytes:
      (normalizedInput.maximumAggregateToolArgumentBytes as
        number | undefined) ??
      DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS.maximumAggregateToolArgumentBytes,
  });
  const ceilings: AgentNativeProviderRuntimeLimits =
    DEFAULT_AGENT_NATIVE_PROVIDER_RUNTIME_LIMITS;
  if (
    !Object.entries(limits).every(([key, value]) => {
      const ceiling = ceilings[key as keyof AgentNativeProviderRuntimeLimits];
      return Number.isSafeInteger(value) && value > 0 && value <= ceiling;
    })
  ) {
    throw new TypeError('Native provider runtime limits are invalid.');
  }
  return limits;
};

const consumeNativeEvent = (
  protocolFamily: AgentProviderProtocolFamily,
  state: MutableNormalization,
  raw: unknown
): void => {
  if (state.terminal) return;
  state.eventCount += 1;
  if (state.eventCount > state.limits.maximumEvents) {
    appendFailure(state, 'native-event-count-limit-exceeded');
    return;
  }
  let event: AgentJsonValue;
  try {
    event = normalizeAgentProviderRuntimePayload(raw, {
      maximumBytes: state.limits.maximumEventBytes,
    });
  } catch {
    appendFailure(state, 'unsafe-or-oversized-native-event');
    return;
  }
  state.aggregateEventBytes += byteLength(canonicalJsonText(event));
  if (state.aggregateEventBytes > state.limits.maximumAggregateEventBytes) {
    appendFailure(state, 'native-event-byte-limit-exceeded');
    return;
  }
  normalizers[protocolFamily](state, event);
};

const finishNativeStream = (state: MutableNormalization): void => {
  if (!state.terminal && !state.nonterminalResponseClosed) {
    appendFailure(state, 'stream-ended');
  }
};

const drainSignals = (
  state: MutableNormalization
): readonly NormalizedSignal[] => state.signals.splice(0, state.signals.length);

const runtimeEventFact = (
  signal: NormalizedSignal,
  input: Readonly<{
    invocationId: string;
    occurredAt: Instant;
    sequence: number;
  }>
): AgentNativeProviderRuntimeEventFact =>
  Object.freeze({
    factType: 'provider-event',
    value: createAgentProviderRuntimeEvent({
      eventId: `${input.invocationId}.provider-event.${input.sequence}`,
      invocationId: input.invocationId,
      sequence: input.sequence,
      type: signal.type,
      payload: signal.payload,
      occurredAt: input.occurredAt,
    }),
  });

const usageFact = (
  state: MutableNormalization
): AgentNativeProviderRuntimeUsageFact =>
  Object.freeze({
    factType: 'usage-vector',
    value:
      state.usage.size > 0
        ? createAgentUsageVector([...state.usage.values()])
        : createUnknownAgentUsageVector([
            'text-token-input',
            'text-token-output',
          ]),
  });

export const normalizeNativeAgentProviderEvents = (
  protocolFamily: AgentProviderProtocolFamily,
  events: readonly unknown[],
  input: Readonly<{ invocationId: string; occurredAt: Instant }>,
  runtimeLimits: Partial<AgentNativeProviderRuntimeLimits> = {}
): readonly AgentProviderFact[] => {
  const state = initialState(normalizeRuntimeLimits(runtimeLimits));
  for (const event of events) {
    consumeNativeEvent(protocolFamily, state, event);
    if (state.terminal) break;
  }
  finishNativeStream(state);
  const facts: AgentProviderFact[] = drainSignals(state).map(
    (signal, sequence) => {
      const fact = runtimeEventFact(signal, { ...input, sequence });
      return Object.freeze({
        factType: 'provider-event' as const,
        value: fact.value.durableEvent,
      });
    }
  );
  facts.push(usageFact(state));
  return Object.freeze(facts);
};

/**
 * Normalizes a bounded native event batch while retaining callback-local
 * payloads. Durable consumers continue to use normalizeNativeAgentProviderEvents;
 * server transports may use this form before sanitizing and encrypting replay.
 */
export const normalizeNativeAgentProviderRuntimeEvents = (
  protocolFamily: AgentProviderProtocolFamily,
  events: readonly unknown[],
  input: Readonly<{ invocationId: string; occurredAt: Instant }>,
  runtimeLimits: Partial<AgentNativeProviderRuntimeLimits> = {}
): readonly AgentNativeProviderRuntimeFact[] => {
  const state = initialState(normalizeRuntimeLimits(runtimeLimits));
  for (const event of events) {
    consumeNativeEvent(protocolFamily, state, event);
    if (state.terminal) break;
  }
  finishNativeStream(state);
  const facts: AgentNativeProviderRuntimeFact[] = drainSignals(state).map(
    (signal, sequence) =>
      runtimeEventFact(signal, {
        invocationId: input.invocationId,
        occurredAt: input.occurredAt,
        sequence,
      })
  );
  facts.push(usageFact(state));
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
    runtimeLimits?: Partial<AgentNativeProviderRuntimeLimits>;
    /** Callback-local canaries are consulted only while admitting envelopes. */
    runtimeFactSanitization?: AgentNativeProviderRuntimeFactSanitization;
  }>
): AgentNativeProviderAdapter => {
  if (input.identity.protocolFamily !== input.protocolFamily) {
    throw new TypeError('Native adapter protocol identity drifted.');
  }
  const declaredProfileDigests = Object.freeze(
    [...input.declaredProfileDigests].sort(compareUnicodeCodePoints)
  );
  const supported = new Set(input.supportedProfileDigests);
  const runtimeLimits = normalizeRuntimeLimits(input.runtimeLimits);
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
  const invokeRuntime = async function* (
    request: AgentProviderAdapterInvocationRequest,
    signal?: AbortSignal
  ): AsyncIterable<AgentNativeProviderRuntimeFact> {
    const state = initialState(runtimeLimits);
    const occurredAt = input.now();
    let sequence = 0;
    let receivedRawEvent = false;
    let receivedRuntimeEnvelope = false;
    let receivedUsageEnvelope = false;
    const receivedOptionalFactTypes = new Set<
      AgentNativeProviderRuntimeOptionalCapabilityFact['factType']
    >();
    try {
      for await (const event of input.transport.stream(
        transportRequest(request),
        signal
      )) {
        const declaresRuntimeEnvelope =
          isPlainObject(event) &&
          event.format ===
            'prodivix.agent-native-provider-runtime-fact-envelope';
        if (declaresRuntimeEnvelope) {
          if (
            !isAgentNativeProviderRuntimeFactEnvelope(
              event,
              input.runtimeFactSanitization ?? emptyRuntimeFactSanitization
            )
          ) {
            throw new TypeError(
              'Native provider pre-normalized runtime envelope is invalid.'
            );
          }
          if (
            receivedRawEvent ||
            receivedUsageEnvelope ||
            event.protocolFamily !== input.protocolFamily ||
            event.invocationId !== request.invocationId ||
            event.requestDigest !== request.requestDigest ||
            event.providerConfigurationId !== request.providerConfigurationId ||
            event.modelLineageDigest !== request.modelLineageDigest
          ) {
            throw new TypeError(
              'Native provider pre-normalized runtime stream drifted.'
            );
          }
          receivedRuntimeEnvelope = true;
          if (
            event.fact.factType === 'provider-job-receipt' ||
            event.fact.factType === 'provider-cache-receipt' ||
            event.fact.factType === 'opaque-continuation'
          ) {
            if (
              receivedOptionalFactTypes.has(event.fact.factType) ||
              receivedOptionalFactTypes.size >=
                AGENT_NATIVE_PROVIDER_MAXIMUM_OBSERVATION_FACTS
            ) {
              throw new TypeError(
                'Native provider optional capability fact set drifted.'
              );
            }
            receivedOptionalFactTypes.add(event.fact.factType);
          }
          receivedUsageEnvelope = event.fact.factType === 'usage-vector';
          yield event.fact;
          continue;
        }
        if (receivedRuntimeEnvelope) {
          throw new TypeError(
            'Native provider runtime stream mixed normalized and native events.'
          );
        }
        receivedRawEvent = true;
        consumeNativeEvent(input.protocolFamily, state, event);
        for (const normalized of drainSignals(state)) {
          yield runtimeEventFact(normalized, {
            invocationId: request.invocationId,
            occurredAt,
            sequence,
          });
          sequence += 1;
        }
        if (state.terminal) break;
      }
      if (receivedRuntimeEnvelope) {
        if (!receivedUsageEnvelope) {
          throw new TypeError(
            'Native provider pre-normalized runtime stream omitted usage.'
          );
        }
        return;
      }
    } catch (caught) {
      if (receivedRuntimeEnvelope) throw caught;
      appendFailure(
        state,
        signal?.aborted ? 'transport-aborted' : 'transport-failed'
      );
    }
    finishNativeStream(state);
    for (const normalized of drainSignals(state)) {
      yield runtimeEventFact(normalized, {
        invocationId: request.invocationId,
        occurredAt,
        sequence,
      });
      sequence += 1;
    }
    yield usageFact(state);
  };
  const adapter: AgentNativeProviderAdapter = {
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
    invokeRuntime,
    async *invoke(
      request: AgentProviderAdapterInvocationRequest,
      signal?: AbortSignal
    ) {
      for await (const fact of invokeRuntime(request, signal)) {
        const durableFact: AgentProviderFact =
          fact.factType === 'provider-event'
            ? Object.freeze({
                factType: 'provider-event',
                value: fact.value.durableEvent,
              })
            : fact;
        yield encodeAgentProviderFact(durableFact);
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
): AgentNativeProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'openai-responses' });

export const createAnthropicMessagesAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentNativeProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'anthropic-messages' });

export const createGeminiInteractionsAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentNativeProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'gemini-interactions' });

export const createOpenAICompatibleAgentProviderAdapter = (
  input: NativeFactoryInput
): AgentNativeProviderAdapter =>
  createNativeAdapter({ ...input, protocolFamily: 'openai-compatible' });
