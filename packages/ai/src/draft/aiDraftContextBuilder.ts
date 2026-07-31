import type { AiDraftContextBundle, AiDraftContextEntry } from './draft.types';

export class AiDraftContextBuilder {
  private readonly entries: AiDraftContextEntry[] = [];
  private readonly omittedContext: string[] = [];

  add<TValue>(entry: AiDraftContextEntry<TValue>): this {
    if (entry.instructionBoundary !== 'data-only') {
      throw new Error('AI draft context must remain data-only.');
    }
    if (this.entries.some((current) => current.id === entry.id)) {
      throw new Error(`AI draft context entry already exists: ${entry.id}`);
    }
    this.entries.push(entry);
    return this;
  }

  omit(reason: string): this {
    this.omittedContext.push(reason);
    return this;
  }

  build(maxInputTokens?: number): AiDraftContextBundle {
    return {
      entries: [...this.entries],
      omittedContext: [...this.omittedContext],
      maxInputTokens,
    };
  }
}
