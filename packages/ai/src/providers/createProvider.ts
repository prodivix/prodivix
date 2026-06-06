import type { LlmProvider, LlmStructuredOutput } from '@prodivix/shared';
import { MockLlmProvider } from '@prodivix/shared';
import type { ProdivixAiSettings } from '../settings/aiSettings';
import {
  type ProdivixAiFetch,
  OpenAICompatibleProvider,
} from './openAICompatibleProvider';

export interface CreateProdivixAiProviderOptions {
  settings: ProdivixAiSettings;
  fetcher?: ProdivixAiFetch;
  mockOutput?: LlmStructuredOutput;
}

const defaultMockOutput: LlmStructuredOutput = {
  goal: 'Draft an MFE AI task plan',
  assumptions: ['Use the current editor context summary only.'],
  milestones: [
    {
      id: 'inspect-context',
      title: 'Inspect available editor context',
    },
    {
      id: 'prepare-dry-run',
      title: 'Prepare a dry-run command batch',
    },
  ],
};

/**
 * 根据跨端 AI 设置创建 provider。app 层只提供环境相关能力，例如 fetcher 或 mock 输出，
 * provider 选择逻辑保持在 @prodivix/ai 中复用。
 *
 * Creates a provider from cross-runtime AI settings. App layers only provide
 * environment-specific capabilities such as fetcher or mock output, while
 * provider selection stays reusable inside @prodivix/ai.
 */
export const createProdivixAiProvider = (
  options: CreateProdivixAiProviderOptions
): LlmProvider => {
  if (options.settings.provider === 'mock') {
    return new MockLlmProvider(options.mockOutput ?? defaultMockOutput);
  }

  if (!options.fetcher) {
    throw new Error('OpenAI-compatible provider requires a fetcher.');
  }

  return new OpenAICompatibleProvider({
    baseURL: options.settings.baseURL,
    apiKey: options.settings.apiKey,
    model: options.settings.model,
    fetcher: options.fetcher,
  });
};
