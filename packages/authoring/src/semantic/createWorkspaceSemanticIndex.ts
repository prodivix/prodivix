import { collectCanonicalSemanticFacts } from './semanticFacts';
import {
  createSemanticResolutionDiagnostics,
  createSemanticStaleDiagnostic,
  SEMANTIC_RESOLUTION_DIAGNOSTIC_PROVIDER_ID,
  SEMANTIC_SNAPSHOT_DIAGNOSTIC_PROVIDER_ID,
} from './semanticDiagnostics';
import { compareSemanticText } from './semanticOrder';
import {
  createSemanticSnapshotIdentity,
  isSameSemanticSnapshotIdentity,
} from './semanticSnapshotIdentity';
import {
  queryVisibleSymbolsFromTables,
  resolveReferenceFact,
  type SemanticLookupTables,
} from './semanticResolution';
import type {
  CreateWorkspaceSemanticIndexInput,
  SemanticDiagnosticContribution,
  SemanticDiagnosticsResult,
  SemanticIndexBuildResult,
  SemanticQueryOptions,
  SemanticResolutionResult,
  SemanticSnapshotIdentity,
  SemanticStaleResult,
  WorkspaceDependencyEdge,
  WorkspaceReferenceEdge,
  WorkspaceSemanticIndex,
  WorkspaceSymbol,
} from './semantic.types';

const toFrozenMap = <Value extends { id: string }>(
  values: readonly Value[]
): ReadonlyMap<string, Value> =>
  new Map(values.map((value) => [value.id, value] as const));

const groupSymbolsByName = (
  symbols: readonly WorkspaceSymbol[]
): ReadonlyMap<string, readonly WorkspaceSymbol[]> => {
  const mutable = new Map<string, WorkspaceSymbol[]>();
  for (const symbol of symbols) {
    const group = mutable.get(symbol.name) ?? [];
    group.push(symbol);
    mutable.set(symbol.name, group);
  }
  return new Map(
    Array.from(mutable.entries())
      .sort(([left], [right]) => compareSemanticText(left, right))
      .map(([name, group]) => [
        name,
        Object.freeze(
          group.sort((left, right) => compareSemanticText(left.id, right.id))
        ),
      ])
  );
};

const groupReferencesByTarget = (
  references: readonly WorkspaceReferenceEdge[]
): ReadonlyMap<string, readonly WorkspaceReferenceEdge[]> => {
  const mutable = new Map<string, WorkspaceReferenceEdge[]>();
  for (const reference of references) {
    if (reference.status !== 'resolved' || !reference.targetSymbolId) continue;
    const group = mutable.get(reference.targetSymbolId) ?? [];
    group.push(reference);
    mutable.set(reference.targetSymbolId, group);
  }
  return new Map(
    Array.from(mutable.entries())
      .sort(([left], [right]) => compareSemanticText(left, right))
      .map(([symbolId, group]) => [
        symbolId,
        Object.freeze(
          group.sort((left, right) => compareSemanticText(left.id, right.id))
        ),
      ])
  );
};

const groupDependenciesByTarget = (
  dependencies: readonly WorkspaceDependencyEdge[]
): ReadonlyMap<string, readonly WorkspaceDependencyEdge[]> => {
  const mutable = new Map<string, WorkspaceDependencyEdge[]>();
  for (const dependency of dependencies) {
    const group = mutable.get(dependency.targetSymbolId) ?? [];
    group.push(dependency);
    mutable.set(dependency.targetSymbolId, group);
  }
  return new Map(
    Array.from(mutable.entries())
      .sort(([left], [right]) => compareSemanticText(left, right))
      .map(([symbolId, group]) => [
        symbolId,
        Object.freeze(
          group.sort((left, right) => compareSemanticText(left.id, right.id))
        ),
      ])
  );
};

const createStaleResult = (
  expectedSnapshotIdentity: SemanticSnapshotIdentity,
  actualSnapshotIdentity: SemanticSnapshotIdentity
): SemanticStaleResult =>
  Object.freeze({
    status: 'stale',
    expectedSnapshotIdentity,
    actualSnapshotIdentity,
  });

const getStaleResult = (
  actualSnapshotIdentity: SemanticSnapshotIdentity,
  options: SemanticQueryOptions | undefined
): SemanticStaleResult | null => {
  const expected = options?.expectedSnapshotIdentity;
  if (
    !expected ||
    isSameSemanticSnapshotIdentity(expected, actualSnapshotIdentity)
  ) {
    return null;
  }
  return createStaleResult(expected, actualSnapshotIdentity);
};

const createIndex = (
  snapshotIdentity: SemanticSnapshotIdentity,
  facts: Extract<
    ReturnType<typeof collectCanonicalSemanticFacts>,
    { ok: true }
  >['facts']
): WorkspaceSemanticIndex => {
  const scopesById = toFrozenMap(facts.scopes);
  const symbolsById = toFrozenMap(facts.symbols);
  const symbolsByName = groupSymbolsByName(facts.symbols);
  const lookupTables: SemanticLookupTables = Object.freeze({
    scopesById,
    symbolsById,
    symbolsByName,
  });
  const references = Object.freeze(
    facts.referenceFacts.map((reference) =>
      resolveReferenceFact(reference, lookupTables)
    )
  );
  const referencesById = toFrozenMap(references);
  const dependenciesById = toFrozenMap(facts.dependencies);
  const referencesByTarget = groupReferencesByTarget(references);
  const dependenciesByTarget = groupDependenciesByTarget(facts.dependencies);
  const resolutionDiagnostics = createSemanticResolutionDiagnostics(references);
  const diagnosticContributions: readonly SemanticDiagnosticContribution[] =
    Object.freeze([
      ...facts.diagnosticContributions,
      Object.freeze({
        providerId: SEMANTIC_RESOLUTION_DIAGNOSTIC_PROVIDER_ID,
        diagnostics: resolutionDiagnostics,
      }),
    ]);
  const diagnostics = Object.freeze(
    diagnosticContributions.flatMap(({ diagnostics: providerDiagnostics }) =>
      Array.from(providerDiagnostics)
    )
  );

  const resolveReference = (
    referenceId: string,
    options?: SemanticQueryOptions
  ): SemanticResolutionResult => {
    const stale = getStaleResult(snapshotIdentity, options);
    if (stale) return Object.freeze({ ...stale, referenceId });

    const reference = referencesById.get(referenceId);
    if (!reference) {
      return Object.freeze({
        status: 'missing',
        referenceId,
        candidateSymbolIds: Object.freeze([]),
      });
    }
    if (reference.status !== 'resolved') {
      return Object.freeze({
        status: reference.status,
        referenceId,
        reference,
        candidateSymbolIds: reference.candidateSymbolIds ?? Object.freeze([]),
      });
    }
    if (!reference.targetSymbolId) {
      return Object.freeze({
        status: 'missing',
        referenceId,
        reference,
        candidateSymbolIds: Object.freeze([]),
      });
    }

    const symbol = symbolsById.get(reference.targetSymbolId);
    if (!symbol) {
      return Object.freeze({
        status: 'missing',
        referenceId,
        reference,
        candidateSymbolIds: Object.freeze([]),
      });
    }
    return Object.freeze({ status: 'resolved', reference, symbol });
  };

  const getSemanticDiagnostics = (
    options?: SemanticQueryOptions
  ): SemanticDiagnosticsResult => {
    const stale = getStaleResult(snapshotIdentity, options);
    if (stale) {
      const staleDiagnostic = createSemanticStaleDiagnostic(
        stale.expectedSnapshotIdentity,
        stale.actualSnapshotIdentity
      );
      return Object.freeze({
        ...stale,
        diagnostics: Object.freeze([staleDiagnostic]),
        contributions: Object.freeze([
          Object.freeze({
            providerId: SEMANTIC_SNAPSHOT_DIAGNOSTIC_PROVIDER_ID,
            diagnostics: Object.freeze([staleDiagnostic]),
          }),
        ]),
      });
    }
    return Object.freeze({
      status: 'resolved',
      diagnostics,
      contributions: diagnosticContributions,
    });
  };

  const queryVisibleSymbols: WorkspaceSemanticIndex['queryVisibleSymbols'] = (
    context
  ) => {
    const stale = getStaleResult(snapshotIdentity, context);
    if (stale) {
      return Object.freeze({ ...stale, symbols: Object.freeze([]) });
    }
    const symbols = queryVisibleSymbolsFromTables(context, lookupTables);
    if (!symbols) {
      return Object.freeze({
        status: 'missing',
        scopeId: context.scopeId,
        symbols: Object.freeze([]),
      });
    }
    return Object.freeze({ status: 'resolved', symbols });
  };

  return Object.freeze({
    snapshotIdentity,
    getScope: (id) => scopesById.get(id) ?? null,
    getSymbol: (id) => symbolsById.get(id) ?? null,
    getReference: (id) => referencesById.get(id) ?? null,
    getDependency: (id) => dependenciesById.get(id) ?? null,
    queryVisibleSymbols,
    resolveReference,
    getDefinition: resolveReference,
    getReferences(symbolId, options) {
      const stale = getStaleResult(snapshotIdentity, options);
      if (stale) {
        return Object.freeze({ ...stale, references: Object.freeze([]) });
      }
      const symbol = symbolsById.get(symbolId);
      if (!symbol) {
        return Object.freeze({
          status: 'missing',
          symbolId,
          references: Object.freeze([]),
        });
      }
      return Object.freeze({
        status: 'resolved',
        symbol,
        references: referencesByTarget.get(symbolId) ?? Object.freeze([]),
      });
    },
    getImpact(symbolIds, options) {
      const stale = getStaleResult(snapshotIdentity, options);
      if (stale) return stale;

      const rootSymbolIds = Array.from(new Set(symbolIds)).sort(
        compareSemanticText
      );
      const missingSymbolIds = rootSymbolIds.filter(
        (symbolId) => !symbolsById.has(symbolId)
      );
      if (missingSymbolIds.length) {
        return Object.freeze({
          status: 'missing',
          missingSymbolIds: Object.freeze(missingSymbolIds),
        });
      }

      const visited = new Set(rootSymbolIds);
      const impactedSymbolIds = new Set<string>();
      const referenceIds = new Set<string>();
      const dependencyIds = new Set<string>();
      const queue = [...rootSymbolIds];

      for (let index = 0; index < queue.length; index += 1) {
        const targetSymbolId = queue[index]!;
        for (const reference of referencesByTarget.get(targetSymbolId) ?? []) {
          referenceIds.add(reference.id);
          if (
            !reference.sourceSymbolId ||
            visited.has(reference.sourceSymbolId)
          ) {
            continue;
          }
          visited.add(reference.sourceSymbolId);
          impactedSymbolIds.add(reference.sourceSymbolId);
          queue.push(reference.sourceSymbolId);
        }
        for (const dependency of dependenciesByTarget.get(targetSymbolId) ??
          []) {
          dependencyIds.add(dependency.id);
          if (visited.has(dependency.sourceSymbolId)) continue;
          visited.add(dependency.sourceSymbolId);
          impactedSymbolIds.add(dependency.sourceSymbolId);
          queue.push(dependency.sourceSymbolId);
        }
      }

      return Object.freeze({
        status: 'resolved',
        impact: Object.freeze({
          rootSymbolIds: Object.freeze(rootSymbolIds),
          impactedSymbolIds: Object.freeze(
            Array.from(impactedSymbolIds).sort(compareSemanticText)
          ),
          referenceIds: Object.freeze(
            Array.from(referenceIds).sort(compareSemanticText)
          ),
          dependencyIds: Object.freeze(
            Array.from(dependencyIds).sort(compareSemanticText)
          ),
        }),
      });
    },
    getCompletions(context) {
      const visible = queryVisibleSymbols(context);
      if (visible.status === 'stale') {
        return Object.freeze({
          ...visible,
          completions: Object.freeze([]),
        });
      }
      if (visible.status === 'missing') {
        return Object.freeze({
          status: 'missing',
          scopeId: visible.scopeId,
          completions: Object.freeze([]),
        });
      }
      return Object.freeze({
        status: 'resolved',
        completions: Object.freeze(
          visible.symbols.map((symbol) =>
            Object.freeze({
              label: symbol.displayName ?? symbol.name,
              symbolId: symbol.id,
              kind: symbol.kind,
              ...(symbol.qualifiedName || symbol.typeRef
                ? { detail: symbol.qualifiedName ?? symbol.typeRef }
                : {}),
            })
          )
        ),
      });
    },
    getSemanticDiagnostics,
  });
};

/**
 * Builds one immutable semantic snapshot from complete provider facts. The
 * builder validates the entire contribution graph before exposing any query
 * surface, so duplicate identities or broken scope ownership never produce a
 * partial index.
 */
export const createWorkspaceSemanticIndex = (
  input: CreateWorkspaceSemanticIndexInput
): SemanticIndexBuildResult => {
  const snapshotIdentity = createSemanticSnapshotIdentity(
    input,
    input.providers.map(({ descriptor }) => descriptor)
  );
  const collected = collectCanonicalSemanticFacts(
    snapshotIdentity,
    input.providers
  );
  if (!collected.ok) return collected;
  return Object.freeze({
    ok: true,
    index: createIndex(snapshotIdentity, collected.facts),
  });
};
