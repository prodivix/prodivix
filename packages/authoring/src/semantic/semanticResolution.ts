import { compareSemanticText } from './semanticOrder';
import type {
  SemanticQueryContext,
  WorkspaceReferenceEdge,
  WorkspaceReferenceFact,
  WorkspaceScope,
  WorkspaceSymbol,
} from './semantic.types';

export type SemanticLookupTables = Readonly<{
  scopesById: ReadonlyMap<string, WorkspaceScope>;
  symbolsById: ReadonlyMap<string, WorkspaceSymbol>;
  symbolsByName: ReadonlyMap<string, readonly WorkspaceSymbol[]>;
}>;

type RankedSymbol = Readonly<{
  rank: number;
  symbol: WorkspaceSymbol;
}>;

const compareSymbols = (
  left: WorkspaceSymbol,
  right: WorkspaceSymbol
): number =>
  compareSemanticText(left.name, right.name) ||
  compareSemanticText(left.kind, right.kind) ||
  compareSemanticText(left.id, right.id);

const compareRankedSymbols = (
  left: RankedSymbol,
  right: RankedSymbol
): number =>
  left.rank - right.rank || compareSymbols(left.symbol, right.symbol);

const createScopeRanks = (
  scopeId: string,
  scopesById: ReadonlyMap<string, WorkspaceScope>
): ReadonlyMap<string, number> | null => {
  if (!scopesById.has(scopeId)) return null;

  const ranks = new Map<string, number>();
  let currentId: string | undefined = scopeId;
  let depth = 0;

  while (currentId) {
    const scope = scopesById.get(currentId);
    if (!scope) break;

    const lexicalRank = depth * 2;
    const previousRank = ranks.get(scope.id);
    if (previousRank === undefined || lexicalRank < previousRank) {
      ranks.set(scope.id, lexicalRank);
    }

    for (const importedScopeId of scope.importedScopeIds ?? []) {
      const importRank = lexicalRank + 1;
      const previousImportRank = ranks.get(importedScopeId);
      if (previousImportRank === undefined || importRank < previousImportRank) {
        ranks.set(importedScopeId, importRank);
      }
    }

    currentId = scope.parentId;
    depth += 1;
  }

  return ranks;
};

const hasRequiredCapabilities = (
  symbol: WorkspaceSymbol,
  requiredCapabilityIds: readonly string[] | undefined
): boolean => {
  if (!requiredCapabilityIds?.length) return true;
  const available = new Set(symbol.capabilityIds ?? []);
  return requiredCapabilityIds.every((capabilityId) =>
    available.has(capabilityId)
  );
};

const isCompatibleSymbol = (
  symbol: WorkspaceSymbol,
  expectedTypeRefs: readonly string[] | undefined,
  requiredCapabilityIds: readonly string[] | undefined,
  requiresDurableTarget: boolean
): boolean =>
  (!expectedTypeRefs?.length ||
    (symbol.typeRef !== undefined &&
      expectedTypeRefs.includes(symbol.typeRef))) &&
  hasRequiredCapabilities(symbol, requiredCapabilityIds) &&
  (!requiresDurableTarget || symbol.stability === 'durable');

const rankVisibleSymbols = (
  symbols: readonly WorkspaceSymbol[],
  scopeRanks: ReadonlyMap<string, number>
): RankedSymbol[] =>
  symbols
    .flatMap((symbol): RankedSymbol[] => {
      const rank = scopeRanks.get(symbol.scopeId);
      return rank === undefined ? [] : [{ rank, symbol }];
    })
    .sort(compareRankedSymbols);

const nearestSymbols = (symbols: readonly RankedSymbol[]): RankedSymbol[] => {
  const nearestRank = symbols[0]?.rank;
  if (nearestRank === undefined) return [];
  return symbols.filter(({ rank }) => rank === nearestRank);
};

export const queryVisibleSymbolsFromTables = (
  context: SemanticQueryContext,
  tables: SemanticLookupTables
): readonly WorkspaceSymbol[] | null => {
  const scopeRanks = createScopeRanks(context.scopeId, tables.scopesById);
  if (!scopeRanks) return null;

  const allowedKinds = context.symbolKinds
    ? new Set(context.symbolKinds)
    : null;
  const ranked = rankVisibleSymbols(
    Array.from(tables.symbolsById.values()).filter(
      (symbol) =>
        (!context.name || symbol.name === context.name) &&
        (!allowedKinds || allowedKinds.has(symbol.kind))
    ),
    scopeRanks
  );

  const nearestByNameAndKind = new Map<string, RankedSymbol[]>();
  for (const candidate of ranked) {
    const key = `${candidate.symbol.kind}\u0000${candidate.symbol.name}`;
    const current = nearestByNameAndKind.get(key);
    if (!current || candidate.rank < current[0]!.rank) {
      nearestByNameAndKind.set(key, [candidate]);
      continue;
    }
    if (candidate.rank === current[0]!.rank) current.push(candidate);
  }

  return Object.freeze(
    Array.from(nearestByNameAndKind.values())
      .flat()
      .map(({ symbol }) => symbol)
      .filter((symbol) =>
        isCompatibleSymbol(
          symbol,
          context.expectedTypeRef ? [context.expectedTypeRef] : undefined,
          context.requiredCapabilityIds,
          false
        )
      )
      .sort(compareSymbols)
  );
};

type IndexedReferenceFact = WorkspaceReferenceFact &
  Readonly<{ providerId: string }>;

const createReferenceEdge = (
  fact: IndexedReferenceFact,
  status: WorkspaceReferenceEdge['status'],
  candidates: readonly WorkspaceSymbol[]
): WorkspaceReferenceEdge => {
  const candidateSymbolIds = Object.freeze(
    candidates.map(({ id }) => id).sort(compareSemanticText)
  );
  const targetSymbolId =
    status === 'resolved' ? candidateSymbolIds[0] : undefined;

  return Object.freeze({
    ...fact,
    status,
    ...(targetSymbolId ? { targetSymbolId } : {}),
    ...(status === 'resolved' ? {} : { candidateSymbolIds }),
  });
};

export const resolveReferenceFact = (
  fact: IndexedReferenceFact,
  tables: SemanticLookupTables
): WorkspaceReferenceEdge => {
  const target = fact.target;
  const targetCandidates =
    target.kind === 'symbol-id'
      ? [tables.symbolsById.get(target.symbolId)].filter(
          (symbol): symbol is WorkspaceSymbol => Boolean(symbol)
        )
      : (tables.symbolsByName.get(target.name) ?? []).filter(
          (symbol) =>
            (!target.symbolKinds?.length ||
              target.symbolKinds.includes(symbol.kind)) &&
            (!target.targetScopeId || symbol.scopeId === target.targetScopeId)
        );

  if (!targetCandidates.length) {
    return createReferenceEdge(fact, 'missing', []);
  }

  let nearestCandidates: readonly WorkspaceSymbol[] = targetCandidates;
  if (fact.resolutionMode === 'visible') {
    const scopeRanks = createScopeRanks(fact.scopeId, tables.scopesById);
    const rankedCandidates = scopeRanks
      ? rankVisibleSymbols(targetCandidates, scopeRanks)
      : [];
    if (!rankedCandidates.length) {
      return createReferenceEdge(fact, 'not-visible', targetCandidates);
    }
    nearestCandidates = nearestSymbols(rankedCandidates).map(
      ({ symbol }) => symbol
    );
  }

  const compatibleCandidates = nearestCandidates.filter((symbol) =>
    isCompatibleSymbol(
      symbol,
      fact.expectedTypeRefs,
      fact.requiredCapabilityIds,
      fact.requiresDurableTarget ?? false
    )
  );
  if (!compatibleCandidates.length) {
    return createReferenceEdge(fact, 'type-incompatible', nearestCandidates);
  }
  if (compatibleCandidates.length > 1) {
    return createReferenceEdge(fact, 'ambiguous', compatibleCandidates);
  }
  return createReferenceEdge(fact, 'resolved', compatibleCandidates);
};
