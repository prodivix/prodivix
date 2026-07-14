import { WgslParser, WgslScanner } from 'wgsl_reflect/wgsl_reflect.module.js';
import type { Statement, Token } from 'wgsl_reflect';
import {
  compareShaderText,
  scanShaderIdentifiers,
  sortShaderOccurrences,
  type ShaderLanguageAnalysis,
  type ShaderParseDiagnostic,
  type ShaderStage,
  type ShaderSymbol,
  type ShaderSymbolCategory,
  type ShaderSymbolOccurrence,
} from './shaderLanguage.types';

type WgslScope = {
  id: string;
  parentId?: string;
  from: number;
  to: number;
  depth: number;
};

type MutableShaderSymbol = Omit<ShaderSymbol, 'occurrences'> & {
  occurrences: ShaderSymbolOccurrence[];
};

const ROOT_SCOPE_ID = 'wgsl-scope:root';

const tokenName = (token: Token | undefined): string =>
  token?.type.name.trim() ?? '';

const isIdentifier = (token: Token | undefined): token is Token =>
  tokenName(token) === 'ident';

const nextIdentifierIndex = (
  tokens: readonly Token[],
  start: number,
  stopLexemes: readonly string[] = []
): number => {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (stopLexemes.includes(token.lexeme)) return -1;
    if (isIdentifier(token)) return index;
  }
  return -1;
};

const findMatchingToken = (
  tokens: readonly Token[],
  start: number,
  open: string,
  close: string
): number => {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const lexeme = tokens[index]!.lexeme;
    if (lexeme === open) depth += 1;
    if (lexeme === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const buildScopes = (
  tokens: readonly Token[],
  sourceLength: number
): readonly WgslScope[] => {
  const root: WgslScope = {
    id: ROOT_SCOPE_ID,
    from: 0,
    to: sourceLength,
    depth: 0,
  };
  const scopes = [root];
  const stack = [root];
  for (const token of tokens) {
    if (token.lexeme === '{') {
      const parent = stack.at(-1)!;
      const scope: WgslScope = {
        id: `wgsl-scope:block:${token.start}`,
        parentId: parent.id,
        from: token.end,
        to: sourceLength,
        depth: parent.depth + 1,
      };
      scopes.push(scope);
      stack.push(scope);
      continue;
    }
    if (token.lexeme === '}' && stack.length > 1) {
      const scope = stack.pop()!;
      scope.to = token.start;
    }
  }
  return scopes;
};

const findInnermostScope = (
  scopes: readonly WgslScope[],
  offset: number
): WgslScope =>
  scopes.reduce(
    (selected, scope) =>
      scope.from <= offset && offset <= scope.to && scope.depth > selected.depth
        ? scope
        : selected,
    scopes[0]!
  );

const findScopeByBrace = (
  scopes: readonly WgslScope[],
  brace: Token | undefined
): WgslScope | null =>
  brace
    ? (scopes.find((scope) => scope.id === `wgsl-scope:block:${brace.start}`) ??
      null)
    : null;

const entryStagesFromAst = (
  statements: readonly Statement[]
): ReadonlyMap<string, ShaderStage> => {
  const output = new Map<string, ShaderStage>();
  for (const statement of statements) {
    if (statement.astNodeType !== 'function' || !('name' in statement)) {
      continue;
    }
    const name = String(statement.name);
    const attributes =
      'attributes' in statement && Array.isArray(statement.attributes)
        ? statement.attributes
        : [];
    const stage = attributes
      .map((attribute) =>
        attribute && typeof attribute === 'object' && 'name' in attribute
          ? String(attribute.name)
          : ''
      )
      .find(
        (value): value is Exclude<ShaderStage, 'unknown'> =>
          value === 'vertex' || value === 'fragment' || value === 'compute'
      );
    if (stage) output.set(name, stage);
  }
  return output;
};

const stageBeforeFunction = (
  tokens: readonly Token[],
  functionIndex: number
): ShaderStage => {
  for (let index = functionIndex - 1; index >= 1; index -= 1) {
    const token = tokens[index]!;
    if (token.lexeme === ';' || token.lexeme === '{' || token.lexeme === '}') {
      break;
    }
    if (
      (token.lexeme === 'vertex' ||
        token.lexeme === 'fragment' ||
        token.lexeme === 'compute') &&
      tokens[index - 1]?.lexeme === '@'
    ) {
      return token.lexeme;
    }
  }
  return 'unknown';
};

const compactSignature = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().slice(0, 320);

const declarationOccurrence = (token: Token): ShaderSymbolOccurrence =>
  Object.freeze({ from: token.start, to: token.end, declaration: true });

const createSymbol = (input: {
  token: Token;
  category: ShaderSymbolCategory;
  scope: WgslScope;
  moduleLevel: boolean;
  signature: string;
  stage?: ShaderStage;
}): MutableShaderSymbol => {
  const declaration = declarationOccurrence(input.token);
  const id =
    input.category === 'entry'
      ? `wgsl:entry:${input.stage}:${input.token.lexeme}`
      : `wgsl:${input.scope.id}:${input.category}:${input.token.lexeme}:${input.token.start}`;
  return {
    id,
    name: input.token.lexeme,
    category: input.category,
    ...(input.stage ? { stage: input.stage } : {}),
    scopeId: input.scope.id,
    moduleLevel: input.moduleLevel,
    declaration,
    occurrences: [declaration],
    signature: input.signature,
  };
};

const collectAttributeTokenIndexes = (
  tokens: readonly Token[]
): ReadonlySet<number> => {
  const output = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]!.lexeme !== '@') continue;
    output.add(index);
    if (tokens[index + 1]) output.add(index + 1);
    if (tokens[index + 2]?.lexeme !== '(') continue;
    const close = findMatchingToken(tokens, index + 2, '(', ')');
    if (close < 0) continue;
    for (let nested = index + 2; nested <= close; nested += 1) {
      output.add(nested);
    }
  }
  return output;
};

const collectParameterIndexes = (
  tokens: readonly Token[],
  open: number,
  close: number
): readonly number[] => {
  const output: number[] = [];
  let parenDepth = 0;
  let angleDepth = 0;
  let bracketDepth = 0;
  for (let index = open + 1; index < close; index += 1) {
    const lexeme = tokens[index]!.lexeme;
    if (lexeme === '(') parenDepth += 1;
    else if (lexeme === ')') parenDepth -= 1;
    else if (lexeme === '<') angleDepth += 1;
    else if (lexeme === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (lexeme === '[') bracketDepth += 1;
    else if (lexeme === ']') bracketDepth -= 1;
    else if (
      lexeme === ':' &&
      parenDepth === 0 &&
      angleDepth === 0 &&
      bracketDepth === 0
    ) {
      const candidate = index - 1;
      if (isIdentifier(tokens[candidate])) output.push(candidate);
    }
  }
  return output;
};

const collectStructMemberIndexes = (
  tokens: readonly Token[],
  open: number,
  close: number
): readonly number[] => {
  const output: number[] = [];
  let nestedDepth = 0;
  for (let index = open + 1; index < close; index += 1) {
    const lexeme = tokens[index]!.lexeme;
    if (lexeme === '{' || lexeme === '(' || lexeme === '<' || lexeme === '[') {
      nestedDepth += 1;
      continue;
    }
    if (lexeme === '}' || lexeme === ')' || lexeme === '>' || lexeme === ']') {
      nestedDepth = Math.max(0, nestedDepth - 1);
      continue;
    }
    if (lexeme === ':' && nestedDepth === 0) {
      const candidate = index - 1;
      if (isIdentifier(tokens[candidate])) output.push(candidate);
    }
  }
  return output;
};

const collectSymbols = (input: {
  source: string;
  tokens: readonly Token[];
  scopes: readonly WgslScope[];
  entryStages: ReadonlyMap<string, ShaderStage>;
}): Readonly<{
  symbols: readonly ShaderSymbol[];
  declarationTokenIndexes: ReadonlySet<number>;
  ignoredTokenIndexes: ReadonlySet<number>;
}> => {
  const symbols: MutableShaderSymbol[] = [];
  const declarationTokenIndexes = new Set<number>();
  const ignoredTokenIndexes = new Set<number>(
    collectAttributeTokenIndexes(input.tokens)
  );
  const handledDeclarationKeywords = new Set<number>();

  const addSymbol = (
    tokenIndex: number,
    category: ShaderSymbolCategory,
    scope: WgslScope,
    signature: string,
    stage?: ShaderStage
  ) => {
    const token = input.tokens[tokenIndex];
    if (!token) return;
    declarationTokenIndexes.add(tokenIndex);
    symbols.push(
      createSymbol({
        token,
        category,
        scope,
        moduleLevel: scope.id === ROOT_SCOPE_ID,
        signature,
        ...(stage ? { stage } : {}),
      })
    );
  };

  for (let index = 0; index < input.tokens.length; index += 1) {
    const token = input.tokens[index]!;
    if (token.lexeme === 'fn') {
      handledDeclarationKeywords.add(index);
      const nameIndex = nextIdentifierIndex(input.tokens, index + 1, ['(']);
      if (nameIndex < 0) continue;
      const open = input.tokens.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > nameIndex && candidate.lexeme === '('
      );
      const close =
        open >= 0 ? findMatchingToken(input.tokens, open, '(', ')') : -1;
      const braceIndex =
        close >= 0
          ? input.tokens.findIndex(
              (candidate, candidateIndex) =>
                candidateIndex > close && candidate.lexeme === '{'
            )
          : -1;
      const functionScope = findScopeByBrace(
        input.scopes,
        input.tokens[braceIndex]
      );
      const name = input.tokens[nameIndex]!.lexeme;
      const stage =
        input.entryStages.get(name) ?? stageBeforeFunction(input.tokens, index);
      const category = stage === 'unknown' ? 'function' : 'entry';
      const signatureEnd =
        braceIndex >= 0
          ? input.tokens[braceIndex]!.start
          : input.tokens[nameIndex]!.end;
      addSymbol(
        nameIndex,
        category,
        input.scopes[0]!,
        compactSignature(input.source.slice(token.start, signatureEnd)),
        stage === 'unknown' ? undefined : stage
      );
      if (open >= 0 && close >= 0 && functionScope) {
        for (const parameterIndex of collectParameterIndexes(
          input.tokens,
          open,
          close
        )) {
          addSymbol(
            parameterIndex,
            'parameter',
            functionScope,
            `parameter ${input.tokens[parameterIndex]!.lexeme}`
          );
        }
      }
      continue;
    }

    if (token.lexeme === 'struct') {
      handledDeclarationKeywords.add(index);
      const nameIndex = nextIdentifierIndex(input.tokens, index + 1, ['{']);
      if (nameIndex < 0) continue;
      addSymbol(
        nameIndex,
        'type',
        input.scopes[0]!,
        `struct ${input.tokens[nameIndex]!.lexeme}`
      );
      const open = input.tokens.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > nameIndex && candidate.lexeme === '{'
      );
      const close =
        open >= 0 ? findMatchingToken(input.tokens, open, '{', '}') : -1;
      if (open >= 0 && close >= 0) {
        for (const memberIndex of collectStructMemberIndexes(
          input.tokens,
          open,
          close
        )) {
          ignoredTokenIndexes.add(memberIndex);
        }
      }
      continue;
    }

    if (token.lexeme === 'alias') {
      handledDeclarationKeywords.add(index);
      const nameIndex = nextIdentifierIndex(input.tokens, index + 1, [
        '=',
        ';',
      ]);
      if (nameIndex >= 0) {
        addSymbol(
          nameIndex,
          'type',
          input.scopes[0]!,
          `alias ${input.tokens[nameIndex]!.lexeme}`
        );
      }
    }
  }

  const variableKeywords = new Set(['var', 'let', 'const', 'override']);
  for (let index = 0; index < input.tokens.length; index += 1) {
    const token = input.tokens[index]!;
    if (
      !variableKeywords.has(token.lexeme) ||
      handledDeclarationKeywords.has(index)
    ) {
      continue;
    }
    const nameIndex = nextIdentifierIndex(input.tokens, index + 1, [
      ':',
      '=',
      ';',
    ]);
    if (nameIndex < 0) continue;
    const scope = findInnermostScope(input.scopes, token.start);
    addSymbol(
      nameIndex,
      scope.id === ROOT_SCOPE_ID ? 'resource' : 'variable',
      scope,
      `${token.lexeme} ${input.tokens[nameIndex]!.lexeme}`
    );
  }

  const symbolsByName = new Map<string, MutableShaderSymbol[]>();
  for (const symbol of symbols) {
    const entries = symbolsByName.get(symbol.name) ?? [];
    entries.push(symbol);
    symbolsByName.set(symbol.name, entries);
  }
  const scopesById = new Map(input.scopes.map((scope) => [scope.id, scope]));

  for (let index = 0; index < input.tokens.length; index += 1) {
    const token = input.tokens[index]!;
    if (
      !isIdentifier(token) ||
      declarationTokenIndexes.has(index) ||
      ignoredTokenIndexes.has(index) ||
      input.tokens[index - 1]?.lexeme === '.'
    ) {
      continue;
    }
    const candidates = symbolsByName.get(token.lexeme);
    if (!candidates?.length) continue;
    const resolved = candidates
      .filter((candidate) => {
        const scope = scopesById.get(candidate.scopeId);
        if (!scope || token.start < scope.from || token.start > scope.to) {
          return false;
        }
        return (
          scope.id === ROOT_SCOPE_ID ||
          candidate.category === 'parameter' ||
          candidate.declaration.from <= token.start
        );
      })
      .sort((left, right) => {
        const leftScope = scopesById.get(left.scopeId)!;
        const rightScope = scopesById.get(right.scopeId)!;
        return (
          rightScope.depth - leftScope.depth ||
          right.declaration.from - left.declaration.from
        );
      })[0];
    if (!resolved) continue;
    resolved.occurrences.push(
      Object.freeze({ from: token.start, to: token.end, declaration: false })
    );
  }

  return Object.freeze({
    symbols: Object.freeze(
      symbols
        .map((symbol) =>
          Object.freeze({
            ...symbol,
            occurrences: sortShaderOccurrences(symbol.occurrences),
          })
        )
        .sort(
          (left, right) =>
            left.declaration.from - right.declaration.from ||
            compareShaderText(left.id, right.id)
        )
    ),
    declarationTokenIndexes,
    ignoredTokenIndexes,
  });
};

const lineStartOffset = (source: string, requestedLine: number): number => {
  if (requestedLine <= 1) return 0;
  let line = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      line += 1;
      if (line === requestedLine) return index + 1;
    }
  }
  return source.length;
};

const normalizeParseError = (
  error: unknown,
  source: string
): ShaderParseDiagnostic => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : 'The WGSL source could not be parsed.';
  const line = Number(/Line:\s*(\d+)/iu.exec(rawMessage)?.[1] ?? 1);
  const from = lineStartOffset(source, Number.isSafeInteger(line) ? line : 1);
  const message =
    rawMessage.replace(/\.?\s*Line:\s*\d+\.?\s*$/iu, '').trim() ||
    'The WGSL source could not be parsed.';
  return Object.freeze({
    from,
    to: Math.min(source.length, from + 1),
    message,
    upstreamCode: 'wgsl-reflect',
  });
};

/** Converts WGSL parser and scanner output into the parser-neutral shader model. */
export const analyzeWgslSource = (source: string): ShaderLanguageAnalysis => {
  let tokens: readonly Token[] = Object.freeze([]);
  let statements: readonly Statement[] = Object.freeze([]);
  let parseDiagnostics: readonly ShaderParseDiagnostic[] = Object.freeze([]);
  try {
    tokens = Object.freeze(new WgslScanner(source).scanTokens());
    statements = Object.freeze(WgslParser.Parse(source));
  } catch (error) {
    parseDiagnostics = Object.freeze([normalizeParseError(error, source)]);
    if (!tokens.length) {
      try {
        tokens = Object.freeze(new WgslScanner(source).scanTokens());
      } catch {
        tokens = Object.freeze([]);
      }
    }
  }

  const scopes = buildScopes(tokens, source.length);
  const collected = collectSymbols({
    source,
    tokens,
    scopes,
    entryStages: entryStagesFromAst(statements),
  });
  return Object.freeze({
    symbols: collected.symbols,
    identifierTokens: scanShaderIdentifiers(source),
    parseDiagnostics,
    scopeRanges: Object.freeze(
      Object.fromEntries(
        scopes.map((scope) => [
          scope.id,
          Object.freeze({ from: scope.from, to: scope.to }),
        ])
      )
    ),
  });
};
