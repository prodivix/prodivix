import type {
  AiDraftPlan,
  AiDraftProvider,
  AiDraftProviderGenerateResult,
  AiDraftProviderRequest,
} from './draft.types';

export class MockAiDraftProvider implements AiDraftProvider {
  readonly id = 'mock';

  constructor(private readonly output: AiDraftPlan) {}

  generate(
    _request: AiDraftProviderRequest
  ): Promise<AiDraftProviderGenerateResult> {
    return Promise.resolve(this.output);
  }
}
