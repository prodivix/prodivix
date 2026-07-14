import { parse } from '@shaderfrog/glsl-parser';
import type {
  AstNode,
  LocationObject,
  Program,
} from '@shaderfrog/glsl-parser/ast/index.js';
import type {
  Scope,
  ScopeEntry,
} from '@shaderfrog/glsl-parser/parser/scope.js';
import {
  compareShaderText,
  scanShaderIdentifiers,
  sortShaderOccurrences,
  type ShaderLanguageAnalysis,
  type ShaderParseDiagnostic,
  type ShaderSymbol,
  type ShaderSymbolCategory,
  type ShaderSymbolOccurrence,
} from './shaderLanguage.types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object';

const isLocation = (value: unknown): value is LocationObject => {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) {
    return false;
  }
  return (
    typeof value.start.offset === 'number' &&
    typeof value.end.offset === 'number'
  );
};

const findNamedLocation = (
  value: unknown,
  name: string,
  seen = new WeakSet<object>()
): LocationObject | null => {
  if (!isRecord(value) || seen.has(value)) return null;
  seen.add(value);

  if (
    (value.type === 'identifier' || value.type === 'type_name') &&
    value.identifier === name &&
    isLocation(value.location)
  ) {
    return Object.freeze({
      start: value.location.start,
      end: Object.freeze({
        offset: value.location.start.offset + name.length,
        line: value.location.start.line,
        column: value.location.start.column + name.length,
      }),
    });
  }

  const preferredKeys = [
    'name',
    'identifier',
    'prototype',
    'header',
    'specifier',
    'declaration',
  ];
  for (const key of preferredKeys) {
    const location = findNamedLocation(value[key], name, seen);
    if (location) return location;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      preferredKeys.includes(key) ||
      key === 'location' ||
      key === 'whitespace' ||
      key === 'scope' ||
      key === 'scopes' ||
      key === 'parent'
    ) {
      continue;
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        const location = findNamedLocation(item, name, seen);
        if (location) return location;
      }
      continue;
    }
    const location = findNamedLocation(child, name, seen);
    if (location) return location;
  }
  return null;
};

const toOccurrence = (
  location: LocationObject,
  declarationLocation: LocationObject
): ShaderSymbolOccurrence =>
  Object.freeze({
    from: location.start.offset,
    to: location.end.offset,
    declaration:
      location.start.offset === declarationLocation.start.offset &&
      location.end.offset === declarationLocation.end.offset,
  });

const scopeId = (scope: Scope, index: number): string =>
  `glsl-scope:${scope.name}:${scope.location?.start.offset ?? index}`;

const bindingCategory = (
  scope: Scope,
  declaration: AstNode
): ShaderSymbolCategory => {
  if (scope.name === 'global') return 'resource';
  return declaration.type === 'parameter_declaration'
    ? 'parameter'
    : 'variable';
};

const collectEntryOccurrences = (
  name: string,
  entry: ScopeEntry,
  declarationLocation: LocationObject
): readonly ShaderSymbolOccurrence[] =>
  sortShaderOccurrences(
    [entry.declaration, ...entry.references]
      .map((node) => (node ? findNamedLocation(node, name) : null))
      .filter((location): location is LocationObject => Boolean(location))
      .map((location) => toOccurrence(location, declarationLocation))
  );

const createBindingSymbol = (input: {
  name: string;
  entry: ScopeEntry;
  scope: Scope;
  scopeIndex: number;
}): ShaderSymbol | null => {
  if (!input.entry.declaration) return null;
  const declarationLocation = findNamedLocation(
    input.entry.declaration,
    input.name
  );
  if (!declarationLocation) return null;
  const category = bindingCategory(input.scope, input.entry.declaration);
  const declaration = toOccurrence(declarationLocation, declarationLocation);
  return Object.freeze({
    id: `glsl:${scopeId(input.scope, input.scopeIndex)}:${category}:${input.name}:${declaration.from}`,
    name: input.name,
    category,
    scopeId: scopeId(input.scope, input.scopeIndex),
    moduleLevel: input.scope.name === 'global',
    declaration,
    occurrences: collectEntryOccurrences(
      input.name,
      input.entry,
      declarationLocation
    ),
    signature: `${category} ${input.name}`,
  });
};

const createTypeSymbol = (input: {
  name: string;
  entry: Scope['types'][string];
  scope: Scope;
  scopeIndex: number;
}): ShaderSymbol | null => {
  if (!input.entry.declaration) return null;
  const declarationLocation = findNamedLocation(
    input.entry.declaration,
    input.name
  );
  if (!declarationLocation) return null;
  const declaration = toOccurrence(declarationLocation, declarationLocation);
  return Object.freeze({
    id: `glsl:${scopeId(input.scope, input.scopeIndex)}:type:${input.name}:${declaration.from}`,
    name: input.name,
    category: 'type',
    scopeId: scopeId(input.scope, input.scopeIndex),
    moduleLevel: input.scope.name === 'global',
    declaration,
    occurrences: collectEntryOccurrences(
      input.name,
      input.entry,
      declarationLocation
    ),
    signature: `struct ${input.name}`,
  });
};

const createFunctionSymbol = (input: {
  name: string;
  signatureKey: string;
  entry: Scope['functions'][string][string];
  scope: Scope;
  scopeIndex: number;
}): ShaderSymbol | null => {
  if (!input.entry.declaration) return null;
  const declarationLocation = findNamedLocation(
    input.entry.declaration,
    input.name
  );
  if (!declarationLocation) return null;
  const declaration = toOccurrence(declarationLocation, declarationLocation);
  const isEntry = input.scope.name === 'global' && input.name === 'main';
  const category = isEntry ? 'entry' : 'function';
  const parameterList = input.entry.parameterTypes.join(', ');
  return Object.freeze({
    id: isEntry
      ? 'glsl:entry:unknown:main'
      : `glsl:${scopeId(input.scope, input.scopeIndex)}:function:${input.name}:${input.signatureKey}:${declaration.from}`,
    name: input.name,
    category,
    ...(isEntry ? { stage: 'unknown' as const } : {}),
    scopeId: scopeId(input.scope, input.scopeIndex),
    moduleLevel: input.scope.name === 'global',
    declaration,
    occurrences: sortShaderOccurrences(
      [input.entry.declaration, ...input.entry.references]
        .map((node) => findNamedLocation(node, input.name))
        .filter((location): location is LocationObject => Boolean(location))
        .map((location) => toOccurrence(location, declarationLocation))
    ),
    signature: `${input.entry.returnType} ${input.name}(${parameterList})`,
  });
};

const collectSymbols = (program: Program): readonly ShaderSymbol[] => {
  const symbols: ShaderSymbol[] = [];
  program.scopes.forEach((scope, scopeIndex) => {
    for (const [name, entry] of Object.entries(scope.bindings)) {
      const symbol = createBindingSymbol({ name, entry, scope, scopeIndex });
      if (symbol) symbols.push(symbol);
    }
    for (const [name, entry] of Object.entries(scope.types)) {
      const symbol = createTypeSymbol({ name, entry, scope, scopeIndex });
      if (symbol) symbols.push(symbol);
    }
    for (const [name, overloads] of Object.entries(scope.functions)) {
      for (const [signatureKey, entry] of Object.entries(overloads)) {
        const symbol = createFunctionSymbol({
          name,
          signatureKey,
          entry,
          scope,
          scopeIndex,
        });
        if (symbol) symbols.push(symbol);
      }
    }
  });
  return Object.freeze(
    symbols.sort(
      (left, right) =>
        left.declaration.from - right.declaration.from ||
        compareShaderText(left.id, right.id)
    )
  );
};

const normalizeParseError = (
  error: unknown,
  sourceLength: number
): ShaderParseDiagnostic => {
  const record = isRecord(error) ? error : {};
  const location = isLocation(record.location) ? record.location : null;
  const rawMessage =
    error instanceof Error
      ? error.message
      : 'The GLSL source could not be parsed.';
  const message =
    rawMessage
      .split(/\r?\n/u)[0]
      ?.replace(/^Error:\s*/u, '')
      .trim() || 'The GLSL source could not be parsed.';
  return Object.freeze({
    from: Math.min(sourceLength, location?.start.offset ?? 0),
    to: Math.min(
      sourceLength,
      Math.max(location?.start.offset ?? 0, location?.end.offset ?? 0)
    ),
    message,
    upstreamCode: 'glsl-parser',
  });
};

export const analyzeGlslSource = (source: string): ShaderLanguageAnalysis => {
  let program: Program | null = null;
  let parseDiagnostics: readonly ShaderParseDiagnostic[] = Object.freeze([]);
  try {
    program = parse(source, {
      includeLocation: true,
      quiet: true,
      stage: 'either',
    });
  } catch (error) {
    parseDiagnostics = Object.freeze([
      normalizeParseError(error, source.length),
    ]);
  }

  const scopeRanges: Record<string, Readonly<{ from: number; to: number }>> = {
    'glsl-scope:global:0': Object.freeze({ from: 0, to: source.length }),
  };
  program?.scopes.forEach((scope, index) => {
    if (!scope.location) return;
    scopeRanges[scopeId(scope, index)] = Object.freeze({
      from: scope.location.start.offset,
      to: scope.location.end.offset,
    });
  });

  return Object.freeze({
    symbols: program ? collectSymbols(program) : Object.freeze([]),
    identifierTokens: scanShaderIdentifiers(source),
    parseDiagnostics,
    scopeRanges: Object.freeze(scopeRanges),
  });
};
