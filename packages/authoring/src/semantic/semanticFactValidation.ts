import { compareSemanticText } from './semanticOrder';
import type {
  SemanticIndexBuildIssue,
  SemanticIndexBuildIssueCode,
  WorkspaceDependencyEdge,
  WorkspaceReferenceFact,
  WorkspaceScope,
  WorkspaceSymbol,
} from './semantic.types';

type IndexedReferenceFact = WorkspaceReferenceFact &
  Readonly<{ providerId: string }>;

type SemanticFactsToValidate = Readonly<{
  scopes: readonly WorkspaceScope[];
  symbols: readonly WorkspaceSymbol[];
  referenceFacts: readonly IndexedReferenceFact[];
  dependencies: readonly WorkspaceDependencyEdge[];
}>;

const createIssue = (
  code: SemanticIndexBuildIssueCode,
  message: string,
  details: Omit<SemanticIndexBuildIssue, 'code' | 'message'> = {}
): SemanticIndexBuildIssue => ({ code, message, ...details });

const validateScopeGraph = (
  scopes: readonly WorkspaceScope[],
  scopesById: ReadonlyMap<string, WorkspaceScope>,
  issues: SemanticIndexBuildIssue[]
): void => {
  for (const scope of scopes) {
    if (scope.parentId && !scopesById.has(scope.parentId)) {
      issues.push(
        createIssue(
          'missing-parent-scope',
          `Scope "${scope.id}" references missing parent "${scope.parentId}".`,
          {
            providerId: scope.providerId,
            factId: scope.id,
            relatedIds: [scope.parentId],
          }
        )
      );
    }
    for (const importedScopeId of scope.importedScopeIds ?? []) {
      if (scopesById.has(importedScopeId)) continue;
      issues.push(
        createIssue(
          'missing-imported-scope',
          `Scope "${scope.id}" imports missing scope "${importedScopeId}".`,
          {
            providerId: scope.providerId,
            factId: scope.id,
            relatedIds: [importedScopeId],
          }
        )
      );
    }
  }

  const completed = new Set<string>();
  const reportedCycles = new Set<string>();
  for (const scopeId of scopes.map(({ id }) => id).sort(compareSemanticText)) {
    if (completed.has(scopeId)) continue;
    const path: string[] = [];
    let cursor: string | undefined = scopeId;
    while (cursor && scopesById.has(cursor) && !completed.has(cursor)) {
      const cycleStart = path.indexOf(cursor);
      if (cycleStart >= 0) {
        const cycleIds = path.slice(cycleStart).sort(compareSemanticText);
        const cycleKey = cycleIds.join('\u0000');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const cycleScope = scopesById.get(cycleIds[0]!);
          issues.push(
            createIssue(
              'scope-cycle',
              `Scope parent cycle contains ${cycleIds.join(', ')}.`,
              {
                providerId: cycleScope?.providerId,
                factId: cycleIds[0],
                relatedIds: cycleIds,
              }
            )
          );
        }
        break;
      }
      path.push(cursor);
      cursor = scopesById.get(cursor)?.parentId;
    }
    path.forEach((id) => completed.add(id));
  }
};

export const validateCanonicalSemanticFacts = ({
  scopes,
  symbols,
  referenceFacts,
  dependencies,
}: SemanticFactsToValidate): readonly SemanticIndexBuildIssue[] => {
  const issues: SemanticIndexBuildIssue[] = [];
  const scopesById = new Map(scopes.map((scope) => [scope.id, scope]));
  const symbolsById = new Map(symbols.map((symbol) => [symbol.id, symbol]));

  validateScopeGraph(scopes, scopesById, issues);

  for (const symbol of symbols) {
    if (scopesById.has(symbol.scopeId)) continue;
    issues.push(
      createIssue(
        'missing-symbol-scope',
        `Symbol "${symbol.id}" references missing scope "${symbol.scopeId}".`,
        {
          providerId: symbol.providerId,
          factId: symbol.id,
          relatedIds: [symbol.scopeId],
        }
      )
    );
  }

  for (const reference of referenceFacts) {
    if (!scopesById.has(reference.scopeId)) {
      issues.push(
        createIssue(
          'missing-reference-scope',
          `Reference "${reference.id}" uses missing scope "${reference.scopeId}".`,
          {
            providerId: reference.providerId,
            factId: reference.id,
            relatedIds: [reference.scopeId],
          }
        )
      );
    }
    if (
      reference.sourceSymbolId &&
      !symbolsById.has(reference.sourceSymbolId)
    ) {
      issues.push(
        createIssue(
          'missing-reference-source-symbol',
          `Reference "${reference.id}" uses missing source symbol "${reference.sourceSymbolId}".`,
          {
            providerId: reference.providerId,
            factId: reference.id,
            relatedIds: [reference.sourceSymbolId],
          }
        )
      );
    }
  }

  for (const dependency of dependencies) {
    if (!symbolsById.has(dependency.sourceSymbolId)) {
      issues.push(
        createIssue(
          'missing-dependency-source-symbol',
          `Dependency "${dependency.id}" uses missing source symbol "${dependency.sourceSymbolId}".`,
          {
            providerId: dependency.providerId,
            factId: dependency.id,
            relatedIds: [dependency.sourceSymbolId],
          }
        )
      );
    }
    if (!symbolsById.has(dependency.targetSymbolId)) {
      issues.push(
        createIssue(
          'missing-dependency-target-symbol',
          `Dependency "${dependency.id}" uses missing target symbol "${dependency.targetSymbolId}".`,
          {
            providerId: dependency.providerId,
            factId: dependency.id,
            relatedIds: [dependency.targetSymbolId],
          }
        )
      );
    }
  }

  return issues;
};
