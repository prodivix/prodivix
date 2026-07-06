import { twMerge } from 'tailwind-merge';
import type {
  ClassProtocolEngine,
  ClassSuggestion,
} from '@/editor/features/blueprint/editor/inspector/components/classProtocol/types';
import { parseClassProtocolTokens } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/tokenizer';

const NATIVE_HINTS = [
  'container',
  'row',
  'col',
  'card',
  'card-header',
  'card-body',
  'btn',
  'btn-primary',
  'btn-secondary',
];

const rankNativeSuggestion = (
  token: string,
  query: string,
  activeTokens: Set<string>
) => {
  if (activeTokens.has(token)) return -1;
  if (!query) return 20;
  const lowerToken = token.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerToken === lowerQuery) return 110;
  if (lowerToken.startsWith(lowerQuery)) return 90;
  if (lowerToken.includes(lowerQuery)) return 60;
  return -1;
};

export const nativeClassEngine: ClassProtocolEngine = {
  tokenize: (input) => parseClassProtocolTokens(input, 'native'),
  suggest: ({ query, tokens, limit }) => {
    const activeTokens = new Set(tokens);
    const ranked: ClassSuggestion[] = [];
    NATIVE_HINTS.forEach((token) => {
      const score = rankNativeSuggestion(token, query, activeTokens);
      if (score < 0) return;
      ranked.push({ token, source: 'native', score });
    });
    return ranked
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  },
  resolveConflict: (tokens) =>
    twMerge(tokens.join(' ')).split(/\s+/).filter(Boolean),
};
