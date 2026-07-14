import type { CodeArtifact, CodeArtifactLanguage } from '@prodivix/authoring';

export const SHADER_CODE_LANGUAGES = Object.freeze(['glsl', 'wgsl'] as const);

export type ShaderCodeLanguage = Extract<
  CodeArtifactLanguage,
  (typeof SHADER_CODE_LANGUAGES)[number]
>;

export type ShaderStage = 'vertex' | 'fragment' | 'compute' | 'unknown';

export type ShaderSymbolCategory =
  'entry' | 'function' | 'parameter' | 'resource' | 'type' | 'variable';

export type ShaderOffsetRange = Readonly<{
  from: number;
  to: number;
}>;

export type ShaderIdentifierToken = ShaderOffsetRange &
  Readonly<{
    name: string;
  }>;

export type ShaderSymbolOccurrence = ShaderOffsetRange &
  Readonly<{
    declaration: boolean;
  }>;

export type ShaderSymbol = Readonly<{
  id: string;
  name: string;
  category: ShaderSymbolCategory;
  stage?: ShaderStage;
  scopeId: string;
  moduleLevel: boolean;
  declaration: ShaderSymbolOccurrence;
  occurrences: readonly ShaderSymbolOccurrence[];
  signature: string;
}>;

export type ShaderParseDiagnostic = ShaderOffsetRange &
  Readonly<{
    message: string;
    upstreamCode?: string;
  }>;

export type ShaderLanguageDocument = Readonly<{
  artifact: CodeArtifact & Readonly<{ language: ShaderCodeLanguage }>;
  symbols: readonly ShaderSymbol[];
  identifierTokens: readonly ShaderIdentifierToken[];
  parseDiagnostics: readonly ShaderParseDiagnostic[];
  getSymbolAtOffset(offset: number): ShaderSymbol | null;
  getIdentifierAtOffset(offset: number): ShaderIdentifierToken | null;
  getVisibleSymbols(offset: number): readonly ShaderSymbol[];
}>;

export type ShaderLanguageAnalysis = Readonly<{
  symbols: readonly ShaderSymbol[];
  identifierTokens: readonly ShaderIdentifierToken[];
  parseDiagnostics: readonly ShaderParseDiagnostic[];
  scopeRanges: Readonly<Record<string, ShaderOffsetRange>>;
}>;

export const compareShaderText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const containsShaderOffset = (
  range: ShaderOffsetRange,
  offset: number
): boolean => range.from <= offset && offset <= range.to;

export const sortShaderOccurrences = (
  occurrences: readonly ShaderSymbolOccurrence[]
): readonly ShaderSymbolOccurrence[] =>
  Object.freeze(
    [
      ...new Map(
        occurrences.map((occurrence) => [
          `${occurrence.from}:${occurrence.to}`,
          occurrence,
        ])
      ).values(),
    ].sort(
      (left, right) =>
        left.from - right.from ||
        left.to - right.to ||
        Number(right.declaration) - Number(left.declaration)
    )
  );

export const scanShaderIdentifiers = (
  source: string
): readonly ShaderIdentifierToken[] => {
  const output: ShaderIdentifierToken[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '/' && next === '/') {
      index += 2;
      while (index < source.length && !/\r|\n/u.test(source[index] ?? '')) {
        index += 1;
      }
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        index += 1;
      }
      index = Math.min(source.length, index + 2);
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character && /[A-Za-z_]/u.test(character)) {
      const from = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/u.test(source[index]!)) {
        index += 1;
      }
      output.push(
        Object.freeze({ name: source.slice(from, index), from, to: index })
      );
      continue;
    }
    index += 1;
  }

  return Object.freeze(output);
};
