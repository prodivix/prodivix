import type { ClassToken } from './types';

export const parseClassTokens = (input: string): string[] =>
  input
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

export const parseClassProtocolTokens = (
  input: string,
  source: ClassToken['source']
): ClassToken[] => parseClassTokens(input).map((value) => ({ value, source }));

export const normalizeClassTokens = (tokens: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  tokens.forEach((token) => {
    if (!token || seen.has(token)) return;
    seen.add(token);
    next.push(token);
  });
  return next;
};

export const toClassNameValue = (tokens: string[]) =>
  normalizeClassTokens(tokens).join(' ');
