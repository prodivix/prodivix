import type {
  LlmProvider,
  LlmProviderGenerateResult,
  LlmProviderRequest,
} from '@prodivix/shared';
import { LlmProviderError } from '@prodivix/shared';
import { validateStructuredOutput } from '../validation/validateStructuredOutput';
import { createOpenAICompatibleMessages } from './openAICompatiblePrompt';

export type ProdivixAiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}>;

export interface OpenAICompatibleProviderOptions {
  baseURL: string;
  apiKey?: string;
  model: string;
  fetcher: ProdivixAiFetch;
}

const normalizeBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, '');

const stripJsonFence = (value: string) => {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
};

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

export class OpenAICompatibleProvider implements LlmProvider {
  readonly id = 'openai-compatible';
  readonly capabilities = {
    responseModes: ['json', 'tool-calls', 'text-with-json'],
    toolSchemaFormats: ['json-schema', 'openai-compatible'],
    supportsStreaming: false,
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
    this.baseURL = normalizeBaseURL(options.baseURL);
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetcher = options.fetcher;
  }

  /**
   * 把 MFE 内部的 LlmProviderRequest 翻译为 OpenAI-compatible 请求，
   * 再把模型返回的 JSON 解析回 MFE 结构化输出并执行通道校验。
   *
   * Translates MFE's LlmProviderRequest into an OpenAI-compatible request, then
   * parses the model JSON response back into MFE structured output and validates
   * the requested output channel.
   */
  async generate(
    request: LlmProviderRequest
  ): Promise<LlmProviderGenerateResult> {
    const response = await this.fetcher(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : null),
      },
      body: JSON.stringify({
        model: this.model,
        messages: createOpenAICompatibleMessages(request.task),
        temperature: request.task.budget?.temperature ?? 0.2,
        max_tokens: request.task.budget?.maxOutputTokens,
        response_format: request.task.modelPreferences?.jsonMode
          ? { type: 'json_object' }
          : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible provider failed: ${response.status} ${response.statusText}`
      );
    }

    const body = await response.json();
    const rawResponse = extractRawResponse(body);
    let structuredOutput: unknown;

    try {
      structuredOutput = extractStructuredOutput(body);
    } catch (error) {
      throw new LlmProviderError(
        error instanceof Error
          ? error.message
          : 'Failed to parse structured LLM output.',
        { rawResponse }
      );
    }

    const validation = validateStructuredOutput(
      structuredOutput,
      request.task.outputChannels
    );

    if (!validation.output) {
      throw new LlmProviderError(
        validation.diagnostics[0]?.message ?? 'Invalid structured LLM output.',
        { rawResponse }
      );
    }

    return { output: validation.output, rawResponse };
  }
}
