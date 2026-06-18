import type {
  LlmProvider,
  LlmProviderGenerateResult,
  LlmProviderRequest,
  LlmStructuredOutput,
} from './types.js';

export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';

  constructor(private readonly output: LlmStructuredOutput) {}

  generate(_request: LlmProviderRequest): Promise<LlmProviderGenerateResult> {
    return Promise.resolve(this.output);
  }
}
