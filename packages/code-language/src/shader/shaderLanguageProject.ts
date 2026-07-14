import {
  createCodeSourceSpanFromOffsets,
  createSemanticId,
  resolveCodeSourceSpanOffsets,
  type CodeArtifact,
  type CodeLanguagePosition,
} from '@prodivix/authoring';
import { analyzeGlslSource } from './glslLanguageAnalyzer';
import {
  compareShaderText,
  containsShaderOffset,
  SHADER_CODE_LANGUAGES,
  type ShaderCodeLanguage,
  type ShaderLanguageAnalysis,
  type ShaderLanguageDocument,
  type ShaderOffsetRange,
  type ShaderSymbol,
} from './shaderLanguage.types';
import { analyzeWgslSource } from './wgslLanguageAnalyzer';

export type ShaderLanguageProject = Readonly<{
  workspaceId: string;
  artifacts: readonly (CodeArtifact &
    Readonly<{ language: ShaderCodeLanguage }>)[];
  documents: readonly ShaderLanguageDocument[];
  getDocument(artifactId: string): ShaderLanguageDocument | null;
  getOffset(position: CodeLanguagePosition): number | null;
  createSourceSpan(
    artifactId: string,
    range: ShaderOffsetRange
  ): ReturnType<typeof createCodeSourceSpanFromOffsets>;
}>;

const isShaderArtifact = (
  artifact: CodeArtifact
): artifact is CodeArtifact & Readonly<{ language: ShaderCodeLanguage }> =>
  SHADER_CODE_LANGUAGES.some((language) => language === artifact.language);

export const createShaderSymbolId = (input: {
  workspaceId: string;
  artifactId: string;
  language: ShaderCodeLanguage;
  symbol: Pick<ShaderSymbol, 'category' | 'declaration' | 'name' | 'stage'>;
}): string =>
  input.symbol.category === 'entry'
    ? createShaderEntrySymbolId(
        input.workspaceId,
        input.artifactId,
        input.language,
        input.symbol.stage ?? 'unknown',
        input.symbol.name
      )
    : createSemanticId(
        'shader-symbol',
        input.workspaceId,
        input.artifactId,
        input.language,
        input.symbol.category,
        input.symbol.name,
        String(input.symbol.declaration.from)
      );

export const createShaderEntrySymbolId = (
  workspaceId: string,
  artifactId: string,
  language: ShaderCodeLanguage,
  stage: NonNullable<ShaderSymbol['stage']>,
  entryName: string
): string =>
  createSemanticId(
    'shader-entry',
    workspaceId,
    artifactId,
    language,
    stage,
    entryName
  );

const scopeSize = (
  scopeRanges: Readonly<Record<string, ShaderOffsetRange>>,
  symbol: ShaderSymbol
): number => {
  const range = scopeRanges[symbol.scopeId];
  return range ? range.to - range.from : Number.MAX_SAFE_INTEGER;
};

const createDocument = (input: {
  workspaceId: string;
  artifact: CodeArtifact & Readonly<{ language: ShaderCodeLanguage }>;
}): ShaderLanguageDocument => {
  const analysis: ShaderLanguageAnalysis =
    input.artifact.language === 'glsl'
      ? analyzeGlslSource(input.artifact.source)
      : analyzeWgslSource(input.artifact.source);
  const symbols = Object.freeze(
    analysis.symbols.map((symbol) =>
      Object.freeze({
        ...symbol,
        id: createShaderSymbolId({
          ...input,
          artifactId: input.artifact.id,
          language: input.artifact.language,
          symbol,
        }),
      })
    )
  );

  return Object.freeze({
    artifact: input.artifact,
    symbols,
    identifierTokens: analysis.identifierTokens,
    parseDiagnostics: analysis.parseDiagnostics,
    getSymbolAtOffset(offset) {
      return (
        symbols.find((symbol) =>
          symbol.occurrences.some((occurrence) =>
            containsShaderOffset(occurrence, offset)
          )
        ) ?? null
      );
    },
    getIdentifierAtOffset(offset) {
      return (
        analysis.identifierTokens.find((token) =>
          containsShaderOffset(token, offset)
        ) ?? null
      );
    },
    getVisibleSymbols(offset) {
      const visible = symbols.filter((symbol) => {
        if (symbol.moduleLevel) return true;
        const scope = analysis.scopeRanges[symbol.scopeId];
        return (
          Boolean(scope && containsShaderOffset(scope, offset)) &&
          (symbol.category === 'parameter' || symbol.declaration.from <= offset)
        );
      });
      const nearestByName = new Map<string, ShaderSymbol>();
      for (const symbol of visible) {
        const existing = nearestByName.get(symbol.name);
        if (
          !existing ||
          scopeSize(analysis.scopeRanges, symbol) <
            scopeSize(analysis.scopeRanges, existing)
        ) {
          nearestByName.set(symbol.name, symbol);
        }
      }
      return Object.freeze(
        [...nearestByName.values()].sort(
          (left, right) =>
            compareShaderText(left.name, right.name) ||
            compareShaderText(left.category, right.category) ||
            left.declaration.from - right.declaration.from
        )
      );
    },
  });
};

/** Builds one immutable, browser-safe shader language view of a revision set. */
export const createShaderLanguageProject = (input: {
  workspaceId: string;
  artifacts: readonly CodeArtifact[];
}): ShaderLanguageProject => {
  const artifacts = Object.freeze(
    input.artifacts
      .filter(isShaderArtifact)
      .sort(
        (left, right) =>
          compareShaderText(left.path, right.path) ||
          compareShaderText(left.id, right.id)
      )
  );
  const documents = Object.freeze(
    artifacts.map((artifact) =>
      createDocument({ workspaceId: input.workspaceId, artifact })
    )
  );
  const documentsById = new Map(
    documents.map((document) => [document.artifact.id, document])
  );

  return Object.freeze({
    workspaceId: input.workspaceId,
    artifacts,
    documents,
    getDocument(artifactId) {
      return documentsById.get(artifactId) ?? null;
    },
    getOffset(position) {
      const document = documentsById.get(position.artifactId);
      if (!document) return null;
      return (
        resolveCodeSourceSpanOffsets(document.artifact.source, {
          artifactId: position.artifactId,
          startLine: position.line,
          startColumn: position.column,
          endLine: position.line,
          endColumn: position.column,
        })?.from ?? null
      );
    },
    createSourceSpan(artifactId, range) {
      const document = documentsById.get(artifactId);
      if (!document) return null;
      return createCodeSourceSpanFromOffsets({
        artifactId,
        source: document.artifact.source,
        from: range.from,
        to: range.to,
      });
    },
  });
};
