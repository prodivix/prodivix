import {
  validateAiDraftPlan,
  type AiDraftRequest,
  type AiDraftStreamEvent,
} from '@prodivix/ai';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { apiRequest } from '@/infra/api';
import type { BlueprintAssistantPreferences } from '@/ai/aiSettingsStore';

export type PublicDraftProvider = Readonly<{
  id: string;
  displayName: string;
  models: readonly Readonly<{ id: string; displayName?: string }>[];
  capabilities: Readonly<{ plan: true }>;
}>;
const text = (value: unknown, maximum = 256): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value;
const record = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && !Object.keys(value).some(isUnsafeObjectKey);
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
const bytes = (value: string) => new TextEncoder().encode(value).length;
const invalid = (): never => {
  throw new TypeError('The server returned an invalid plan-only AI response.');
};

export const listDraftProviders = async (
  token: string,
  signal?: AbortSignal
): Promise<readonly PublicDraftProvider[]> => {
  const response = await apiRequest<unknown>('/agent/providers', {
    token,
    signal,
    maxResponseBytes: 1048576,
  });
  if (
    !record(response) ||
    !only(response, ['providers']) ||
    !Array.isArray(response.providers) ||
    response.providers.length > 64
  )
    return invalid();
  const ids = new Set<string>();
  return response.providers.map((provider) => {
    if (
      !record(provider) ||
      !only(provider, ['id', 'displayName', 'models', 'capabilities']) ||
      !text(provider.id) ||
      ids.has(provider.id) ||
      !text(provider.displayName) ||
      !Array.isArray(provider.models) ||
      provider.models.length > 256 ||
      !record(provider.capabilities) ||
      !only(provider.capabilities, ['plan']) ||
      provider.capabilities.plan !== true
    )
      return invalid();
    ids.add(provider.id);
    const models = new Set<string>();
    return {
      id: provider.id,
      displayName: provider.displayName,
      capabilities: { plan: true as const },
      models: provider.models.map((model) => {
        if (
          !record(model) ||
          !only(model, ['id', 'displayName']) ||
          !text(model.id) ||
          models.has(model.id) ||
          (model.displayName !== undefined && !text(model.displayName))
        )
          return invalid();
        models.add(model.id);
        return {
          id: model.id,
          ...(model.displayName === undefined
            ? {}
            : { displayName: model.displayName as string }),
        };
      }),
    };
  });
};

export const createServerDraftPayload = (
  draft: AiDraftRequest,
  preferences: BlueprintAssistantPreferences
) => {
  if (
    preferences.provider !== 'server' ||
    !text(preferences.providerId) ||
    !text(preferences.modelId)
  )
    throw new TypeError(
      'Select a configured server provider and model in AI settings.'
    );
  if (
    !text(draft.id) ||
    !text(draft.intent, 16384) ||
    draft.allowedTools.length ||
    draft.context.entries.length > 64
  )
    throw new TypeError('The AI draft exceeds its plan-only input boundary.');
  const budget = {
    temperature: preferences.budget?.temperature ?? 0.2,
    maxOutputTokens: preferences.budget?.maxOutputTokens ?? 4096,
    timeoutMs: preferences.budget?.timeoutMs ?? 60000,
  };
  if (
    !Number.isFinite(budget.temperature) ||
    budget.temperature < 0 ||
    budget.temperature > 2 ||
    !Number.isSafeInteger(budget.maxOutputTokens) ||
    budget.maxOutputTokens < 1 ||
    budget.maxOutputTokens > 32768 ||
    !Number.isSafeInteger(budget.timeoutMs) ||
    budget.timeoutMs < 1 ||
    budget.timeoutMs > 300000
  )
    throw new TypeError('The AI draft execution budget is invalid.');
  const payload = {
    providerId: preferences.providerId,
    modelId: preferences.modelId,
    draft: {
      id: draft.id,
      intent: draft.intent,
      context: {
        entries: draft.context.entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          authority: entry.authority,
          value: entry.value,
          instructionBoundary: entry.instructionBoundary,
          ...(entry.description === undefined
            ? {}
            : { description: entry.description }),
        })),
        ...(draft.context.maxInputTokens === undefined
          ? {}
          : { maxInputTokens: draft.context.maxInputTokens }),
        ...(draft.context.omittedContext === undefined
          ? {}
          : { omittedContext: draft.context.omittedContext }),
      },
      allowedTools: [],
      responseMode: 'json',
      streaming: false,
      budget,
    },
  };
  if (bytes(JSON.stringify(payload)) > 262144)
    throw new TypeError('AI draft context exceeds its input budget.');
  return payload;
};

export async function* streamServerDraft(input: {
  token: string;
  draft: AiDraftRequest;
  preferences: BlueprintAssistantPreferences;
  signal?: AbortSignal;
}): AsyncIterable<AiDraftStreamEvent> {
  const payload = createServerDraftPayload(input.draft, input.preferences);
  const response = await apiRequest<unknown>('/agent/drafts', {
    token: input.token,
    signal: input.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: payload.draft.budget.timeoutMs + 5000,
    maxResponseBytes: 1048576,
  });
  if (
    !record(response) ||
    !only(response, ['events']) ||
    !Array.isArray(response.events) ||
    response.events.length < 1 ||
    response.events.length > 256 ||
    bytes(JSON.stringify(response)) > 1048576
  )
    return invalid();
  let completed = false;
  let rawBytes = 0;
  for (const event of response.events) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (!record(event) || completed) return invalid();
    if (event.type === 'started') {
      if (
        !only(event, ['type', 'requestId', 'traceId', 'providerId']) ||
        event.requestId !== input.draft.id ||
        event.providerId !== payload.providerId ||
        !text(event.traceId)
      )
        return invalid();
    } else if (event.type === 'raw-delta' || event.type === 'raw-snapshot') {
      const raw = event.type === 'raw-delta' ? event.delta : event.rawResponse;
      if (
        !only(
          event,
          event.type === 'raw-delta'
            ? ['type', 'delta']
            : ['type', 'rawResponse']
        ) ||
        typeof raw !== 'string'
      )
        return invalid();
      rawBytes = (event.type === 'raw-delta' ? rawBytes : 0) + bytes(raw);
      if (rawBytes > 262144) return invalid();
    } else if (event.type === 'validated-output') {
      if (
        !only(event, ['type', 'output', 'rawResponse']) ||
        typeof event.rawResponse !== 'string' ||
        bytes(event.rawResponse) > 262144
      )
        return invalid();
      const output = validateAiDraftPlan(event.output);
      if (!output.output) return invalid();
      event.output = output.output;
    } else if (event.type === 'diagnostic') {
      if (
        !only(event, ['type', 'diagnostic']) ||
        !isDraftDiagnostic(event.diagnostic)
      )
        return invalid();
    } else if (event.type === 'completed') {
      const result = event.result;
      if (
        !only(event, ['type', 'result']) ||
        !record(result) ||
        !only(result, [
          'requestId',
          'status',
          'output',
          'rawResponse',
          'diagnostics',
          'traceId',
        ]) ||
        result.requestId !== input.draft.id ||
        !['planned', 'failed'].includes(String(result.status)) ||
        !Array.isArray(result.diagnostics) ||
        result.diagnostics.length > 64 ||
        !result.diagnostics.every(isDraftDiagnostic) ||
        (result.traceId !== undefined && !text(result.traceId)) ||
        (result.rawResponse !== undefined &&
          (typeof result.rawResponse !== 'string' ||
            bytes(result.rawResponse) > 262144))
      )
        return invalid();
      if (result.output !== undefined || result.status === 'planned') {
        const output = validateAiDraftPlan(result.output);
        if (!output.output) return invalid();
        result.output = output.output;
      }
      completed = true;
    } else return invalid();
    yield event as unknown as AiDraftStreamEvent;
  }
  if (!completed) return invalid();
}

function isDraftDiagnostic(value: unknown) {
  return (
    record(value) &&
    only(value, ['code', 'message', 'severity', 'path']) &&
    text(value.code) &&
    text(value.message, 16384) &&
    ['info', 'warning', 'error'].includes(String(value.severity)) &&
    (value.path === undefined || text(value.path, 4096))
  );
}
