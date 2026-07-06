import { nativeClassEngine } from './engines/nativeClassEngine';
import { tailwind4ClassEngine } from './engines/tailwind4ClassEngine';
import type { ClassProtocolEngine, ClassSuggestion } from './types';
import { parseClassTokens } from './tokenizer';

const mergeSuggestions = (
  suggestions: ClassSuggestion[],
  limit: number
): ClassSuggestion[] => {
  const deduped = new Map<string, ClassSuggestion>();
  suggestions.forEach((item) => {
    const key = item.insertText ?? item.token;
    const current = deduped.get(key);
    if (!current || item.score > current.score) {
      deduped.set(key, item);
    }
  });
  return [...deduped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

class CompositeClassProtocolEngine implements ClassProtocolEngine {
  private readonly engines: ClassProtocolEngine[];

  constructor(engines: ClassProtocolEngine[]) {
    this.engines = engines;
  }

  tokenize(input: string) {
    const tailwindTokens = this.engines[0]?.tokenize(input) ?? [];
    return tailwindTokens.length
      ? tailwindTokens
      : this.engines.flatMap((engine) => engine.tokenize(input));
  }

  suggest(context: { query: string; tokens: string[]; limit: number }) {
    const all = this.engines.flatMap((engine) => engine.suggest(context));
    return mergeSuggestions(all, context.limit);
  }

  resolveConflict(tokens: string[]) {
    if (!this.engines.length) return parseClassTokens(tokens.join(' '));
    return this.engines.reduce(
      (next, engine) => engine.resolveConflict(next),
      tokens
    );
  }
}

export const classProtocolEngine = new CompositeClassProtocolEngine([
  tailwind4ClassEngine,
  nativeClassEngine,
]);
