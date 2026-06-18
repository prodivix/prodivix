import type { LlmContextBundle, LlmContextEntry } from './types.js';

export class LlmContextBuilder {
  private readonly entries: LlmContextEntry[] = [];
  private readonly omittedContext: string[] = [];

  add<TValue>(entry: LlmContextEntry<TValue>): this {
    if (this.entries.some((current) => current.id === entry.id)) {
      throw new Error(`LLM context entry already exists: ${entry.id}`);
    }

    this.entries.push(entry);
    return this;
  }

  omit(reason: string): this {
    this.omittedContext.push(reason);
    return this;
  }

  build(tokenBudget?: number): LlmContextBundle {
    return {
      entries: [...this.entries],
      omittedContext: [...this.omittedContext],
      tokenBudget,
    };
  }
}
