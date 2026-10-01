import type {
  AiDraftProvider,
  AiDraftProviderGenerateResult,
  AiDraftProviderRequest,
  AiDraftStreamEvent,
} from '../draft/draft.types';
import { AiDraftProviderError } from '../draft/draft.types';
import {
  normalizeBaseURL,
  splitLines,
  splitSseFrames,
  stripJsonFence,
} from '@prodivix/shared/safety';
import { validateAiDraftPlan } from '../draft/validateAiDraftPlan';
import { assertOpenAICompatibleCredentialTransport } from './credentialTransport';
import { createOpenAICompatibleMessages } from './openAICompatiblePrompt';
import { isBoundedAiDraftRawResponse } from '../draft/draftLimits';

const maximumTransportBytes = 1_048_576;
const encoder = new TextEncoder();
const bounded = (value: string): string => {
  if (!isBoundedAiDraftRawResponse(value))
    throw new AiDraftProviderError(
      'AI draft response exceeds its byte limit.',
      { code: 'AI-4010' }
    );
  return value;
};

const abortable = async <T>(
  operation: Promise<T>,
  signal?: AbortSignal
): Promise<T> => {
  if (!signal) return operation;
  if (signal.aborted)
    throw new AiDraftProviderError(
      'AI draft request was aborted or timed out.',
      { code: 'AI-4010' }
    );
  let abort: () => void = () => undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        abort = () =>
          reject(
            new AiDraftProviderError(
              'AI draft request was aborted or timed out.',
              { code: 'AI-4010' }
            )
          );
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
};

const requestLifetime = (request: AiDraftProviderRequest) => {
  const controller = new AbortController();
  const caller = request.draft.providerMetadata?.abortSignal as
    AbortSignal | undefined;
  const abort = () => controller.abort();
  if (caller?.aborted) abort();
  else caller?.addEventListener('abort', abort, { once: true });
  const timeoutMs = request.draft.budget?.timeoutMs ?? 60_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300_000
  ) {
    caller?.removeEventListener('abort', abort);
    throw new AiDraftProviderError('AI draft timeout budget is invalid.', {
      code: 'AI-1002',
    });
  }
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', abort);
    },
  };
};

const readBoundedResponseText = async (
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): Promise<string> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  let ended = false;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) {
        ended = true;
        break;
      }
      total += value.byteLength;
      if (total > maximumTransportBytes)
        throw new AiDraftProviderError(
          'AI draft transport exceeds its byte limit.',
          { code: 'AI-1002' }
        );
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    if (!ended) {
      try {
        await reader.cancel('draft-consumer-closed');
      } catch {
        /* Preserve the original failure. */
      }
    }
    reader.releaseLock();
  }
};

export type ProdivixAiFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  body?: ReadableStream<Uint8Array> | null;
  text?(): Promise<string>;
  json(): Promise<unknown>;
};

export type ProdivixAiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<ProdivixAiFetchResponse>;

export const readOpenAICompatibleJsonResponse = async (
  response: ProdivixAiFetchResponse,
  signal?: AbortSignal
): Promise<unknown> => {
  let rawResponse: string | undefined;
  try {
    if (response.body || response.text) {
      rawResponse = response.body
        ? await readBoundedResponseText(response.body, signal)
        : await abortable(response.text!(), signal);
      if (encoder.encode(rawResponse).byteLength > maximumTransportBytes)
        throw new AiDraftProviderError(
          'AI draft transport exceeds its byte limit.',
          { code: 'AI-1002' }
        );
      return JSON.parse(rawResponse) as unknown;
    }
    const value = await abortable(response.json(), signal);
    if (
      encoder.encode(JSON.stringify(value)).byteLength > maximumTransportBytes
    )
      throw new AiDraftProviderError(
        'AI draft transport exceeds its byte limit.',
        { code: 'AI-1002' }
      );
    return value;
  } catch (caught) {
    throw new AiDraftProviderError(
      caught instanceof Error
        ? `OpenAI-compatible provider returned invalid JSON: ${caught.message}`
        : 'OpenAI-compatible provider returned invalid JSON.',
      {
        code: 'AI-1002',
        rawResponse:
          rawResponse !== undefined && isBoundedAiDraftRawResponse(rawResponse)
            ? rawResponse
            : undefined,
      }
    );
  }
};

export interface OpenAICompatibleProviderOptions {
  baseURL: string;
  apiKey?: string;
  model: string;
  fetcher: ProdivixAiFetch;
}

const extractRawResponse = (response: unknown): string => {
  const choice = readPath(response, ['choices', 0, 'message', 'content']);
  if (typeof choice === 'string') {
    return choice;
  }

  return JSON.stringify(response, null, 2);
};

const extractStructuredOutput = (response: unknown): unknown => {
  const choice = readPath(response, ['choices', 0, 'message', 'content']);
  if (typeof choice !== 'string') {
    return response;
  }

  return JSON.parse(stripJsonFence(choice));
};

const parseStructuredOutputText = (rawResponse: string): unknown =>
  JSON.parse(stripJsonFence(rawResponse));

const readPath = (value: unknown, path: readonly (string | number)[]) =>
  path.reduce<unknown>((current, key) => {
    if (typeof key === 'number') {
      return Array.isArray(current) ? current[key] : undefined;
    }

    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);

const createRequestBody = (
  model: string,
  request: AiDraftProviderRequest,
  options?: { stream?: boolean }
) =>
  JSON.stringify({
    model,
    messages: createOpenAICompatibleMessages(request.draft),
    temperature: request.draft.budget?.temperature ?? 0.2,
    max_tokens: request.draft.budget?.maxOutputTokens,
    response_format: request.draft.modelPreferences?.jsonMode
      ? { type: 'json_object' }
      : undefined,
    stream: options?.stream || undefined,
  });

const readSseDataLines = async function* (
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reachedEnd = false;
  let transportBytes = 0;

  const readFrameData = (frame: string): string | null => {
    const values = splitLines(frame).flatMap((line) => {
      if (!line.startsWith('data:')) return [];
      const value = line.slice(5);
      return [value.startsWith(' ') ? value.slice(1) : value];
    });
    if (values.length === 0) return null;
    const data = values.join('\n');
    return data.trim() ? data : null;
  };

  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);

      if (done) {
        reachedEnd = true;
        break;
      }

      transportBytes += value.byteLength;
      if (transportBytes > maximumTransportBytes)
        throw new AiDraftProviderError(
          'AI draft stream exceeds its byte limit.',
          { code: 'AI-4010' }
        );
      buffer += decoder.decode(value, { stream: true });
      const { frames, remainder } = splitSseFrames(buffer);
      buffer = remainder;

      for (const frame of frames) {
        const data = readFrameData(frame);
        if (data !== null) yield data;
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      const data = readFrameData(buffer);
      if (data !== null) yield data;
    }
  } finally {
    if (!reachedEnd) {
      try {
        await reader.cancel('sse-consumer-closed');
      } catch {
        // Preserve the stream consumer's original completion or failure.
      }
    }
    reader.releaseLock();
  }
};

const extractDeltaContent = (data: string): string => {
  const parsed = JSON.parse(data) as unknown;
  const content = readPath(parsed, ['choices', 0, 'delta', 'content']);

  return typeof content === 'string' ? content : '';
};

export class OpenAICompatibleProvider implements AiDraftProvider {
  readonly id = 'openai-compatible';
  readonly capabilities = {
    responseModes: ['json', 'tool-calls', 'text-with-json'],
    toolSchemaFormats: ['json-schema', 'openai-compatible'],
    supportsStreaming: true,
    supportsJsonMode: true,
    supportsToolCalling: true,
    supportsVision: false,
    supportsLongContext: false,
  } as const;

  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly fetcher: ProdivixAiFetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    assertOpenAICompatibleCredentialTransport(options.baseURL, options.apiKey);
    this.baseURL = normalizeBaseURL(options.baseURL);
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetcher = options.fetcher;
  }

  /**
   * 把 Prodivix 内部的 AiDraftProviderRequest 翻译为 OpenAI-compatible 请求，
   * 再把模型返回的 JSON 解析回无写权限的 explain/plan 草稿。
   *
   * Translates Prodivix's AiDraftProviderRequest into an OpenAI-compatible request,
   * then validates the result as an admission-only explain/plan draft.
   */
  async generate(
    request: AiDraftProviderRequest
  ): Promise<AiDraftProviderGenerateResult> {
    const lifetime = requestLifetime(request);
    try {
      const response = await abortable(
        this.fetcher(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey
              ? { Authorization: `Bearer ${this.apiKey}` }
              : null),
          },
          body: this.createRequestBody(request),
          signal: lifetime.signal,
        }),
        lifetime.signal
      );

      if (!response.ok) {
        throw new AiDraftProviderError(
          `OpenAI-compatible provider failed: ${response.status} ${response.statusText}`,
          { code: 'AI-1002' }
        );
      }

      const body = await readOpenAICompatibleJsonResponse(
        response,
        lifetime.signal
      );
      const rawResponse = bounded(extractRawResponse(body));
      let structuredOutput: unknown;

      try {
        structuredOutput = extractStructuredOutput(body);
      } catch (error) {
        throw new AiDraftProviderError(
          error instanceof Error
            ? error.message
            : 'Failed to parse structured LLM output.',
          { code: 'AI-4002', rawResponse }
        );
      }

      const validation = validateAiDraftPlan(structuredOutput);

      if (!validation.output) {
        throw new AiDraftProviderError(
          validation.diagnostics[0]?.message ??
            'Invalid structured LLM output.',
          { code: 'AI-4002', rawResponse }
        );
      }

      return { output: validation.output, rawResponse };
    } finally {
      lifetime.dispose();
    }
  }

  async *stream(
    request: AiDraftProviderRequest
  ): AsyncIterable<AiDraftStreamEvent> {
    const lifetime = requestLifetime(request);
    try {
      const response = await abortable(
        this.fetcher(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey
              ? { Authorization: `Bearer ${this.apiKey}` }
              : null),
          },
          body: this.createRequestBody(request, { stream: true }),
          signal: lifetime.signal,
        }),
        lifetime.signal
      );

      if (!response.ok) {
        throw new AiDraftProviderError(
          `OpenAI-compatible provider failed: ${response.status} ${response.statusText}`,
          { code: 'AI-1002' }
        );
      }

      if (!response.body) {
        throw new AiDraftProviderError(
          'OpenAI-compatible provider did not return a readable stream.',
          { code: 'AI-4012', severity: 'warning' }
        );
      }

      let rawResponse = '';
      let receivedDone = false;

      try {
        for await (const data of readSseDataLines(
          response.body,
          lifetime.signal
        )) {
          if (data === '[DONE]') {
            receivedDone = true;
            break;
          }

          const delta = extractDeltaContent(data);

          if (!delta) {
            continue;
          }

          rawResponse = bounded(rawResponse + delta);
          yield { type: 'raw-delta', delta };
        }
      } catch (error) {
        throw new AiDraftProviderError(
          error instanceof Error
            ? error.message
            : 'Failed to read streaming LLM response.',
          { code: 'AI-4010', rawResponse }
        );
      }

      if (!receivedDone) {
        throw new AiDraftProviderError(
          'OpenAI-compatible provider streaming response ended before completion.',
          { code: 'AI-4010', rawResponse }
        );
      }

      let structuredOutput: unknown;

      try {
        structuredOutput = parseStructuredOutputText(rawResponse);
      } catch (error) {
        throw new AiDraftProviderError(
          error instanceof Error
            ? error.message
            : 'Failed to parse streaming LLM output.',
          { code: 'AI-4011', rawResponse }
        );
      }

      const validation = validateAiDraftPlan(structuredOutput);

      if (!validation.output) {
        throw new AiDraftProviderError(
          validation.diagnostics[0]?.message ??
            'Invalid structured LLM output.',
          { code: 'AI-4011', rawResponse }
        );
      }

      yield {
        type: 'validated-output',
        output: validation.output,
        rawResponse,
      };
    } finally {
      lifetime.dispose();
    }
  }

  private createRequestBody(
    request: AiDraftProviderRequest,
    options?: { stream?: boolean }
  ) {
    return createRequestBody(this.model, request, options);
  }
}
