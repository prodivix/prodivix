import type {
  DiagnosticTargetRef,
  ProdivixDiagnostic,
  SourceSpan,
} from '@prodivix/diagnostics';
import { compareSemanticText, sortedUniqueSemanticText } from './semanticOrder';
import type {
  SemanticContributionProvider,
  SemanticDiagnosticContribution,
  SemanticIndexBuildIssue,
  SemanticIndexBuildIssueCode,
  SemanticSnapshotIdentity,
  WorkspaceDependencyContribution,
  WorkspaceDependencyEdge,
  WorkspaceReferenceFact,
  WorkspaceScope,
  WorkspaceScopeContribution,
  WorkspaceSymbol,
  WorkspaceSymbolContribution,
} from './semantic.types';
import { validateCanonicalSemanticFacts } from './semanticFactValidation';

export type IndexedReferenceFact = WorkspaceReferenceFact &
  Readonly<{ providerId: string }>;

export type CanonicalSemanticFacts = Readonly<{
  scopes: readonly WorkspaceScope[];
  symbols: readonly WorkspaceSymbol[];
  referenceFacts: readonly IndexedReferenceFact[];
  dependencies: readonly WorkspaceDependencyEdge[];
  diagnosticContributions: readonly SemanticDiagnosticContribution[];
}>;

export type SemanticFactCollectionResult =
  | Readonly<{ ok: true; facts: CanonicalSemanticFacts }>
  | Readonly<{ ok: false; issues: readonly SemanticIndexBuildIssue[] }>;

const freezeTargetRef = (targetRef: DiagnosticTargetRef): DiagnosticTargetRef =>
  Object.freeze({ ...targetRef });

const freezeSourceSpan = (sourceSpan: SourceSpan): SourceSpan =>
  Object.freeze({ ...sourceSpan });

const freezeDiagnostic = (diagnostic: ProdivixDiagnostic): ProdivixDiagnostic =>
  Object.freeze({
    ...diagnostic,
    ...(diagnostic.targetRef
      ? { targetRef: freezeTargetRef(diagnostic.targetRef) }
      : {}),
    ...(diagnostic.sourceSpan
      ? { sourceSpan: freezeSourceSpan(diagnostic.sourceSpan) }
      : {}),
    ...(diagnostic.meta ? { meta: Object.freeze({ ...diagnostic.meta }) } : {}),
    ...(diagnostic.quickFixes
      ? {
          quickFixes: Object.freeze(
            diagnostic.quickFixes.map((quickFix) =>
              Object.freeze({
                ...quickFix,
                operation: Object.freeze({ ...quickFix.operation }),
              })
            )
          ),
        }
      : {}),
  });

const diagnosticOrderKey = (diagnostic: ProdivixDiagnostic): string =>
  JSON.stringify([
    diagnostic.domain,
    diagnostic.code,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.targetRef ?? null,
    diagnostic.sourceSpan ?? null,
  ]);

const compareDiagnostics = (
  left: ProdivixDiagnostic,
  right: ProdivixDiagnostic
): number =>
  compareSemanticText(diagnosticOrderKey(left), diagnosticOrderKey(right));

const compareProviders = (
  left: SemanticContributionProvider,
  right: SemanticContributionProvider
): number =>
  compareSemanticText(left.descriptor.id, right.descriptor.id) ||
  compareSemanticText(
    left.descriptor.semanticVersion,
    right.descriptor.semanticVersion
  ) ||
  compareSemanticText(
    left.descriptor.configurationDigest ?? '',
    right.descriptor.configurationDigest ?? ''
  );

const compareFactsById = <Fact extends { id: string }>(
  left: Fact,
  right: Fact
): number => compareSemanticText(left.id, right.id);

const compareBuildIssues = (
  left: SemanticIndexBuildIssue,
  right: SemanticIndexBuildIssue
): number =>
  compareSemanticText(left.code, right.code) ||
  compareSemanticText(left.providerId ?? '', right.providerId ?? '') ||
  compareSemanticText(left.factId ?? '', right.factId ?? '') ||
  compareSemanticText(left.message, right.message);

const freezeIssues = (
  issues: readonly SemanticIndexBuildIssue[]
): readonly SemanticIndexBuildIssue[] =>
  Object.freeze(
    [...issues].sort(compareBuildIssues).map((issue) =>
      Object.freeze({
        ...issue,
        ...(issue.relatedIds
          ? {
              relatedIds: Object.freeze(
                [...issue.relatedIds].sort(compareSemanticText)
              ),
            }
          : {}),
      })
    )
  );

const createFactCollectionFailure = (
  issues: readonly SemanticIndexBuildIssue[]
): Extract<SemanticFactCollectionResult, { ok: false }> =>
  Object.freeze({ ok: false, issues: freezeIssues(issues) });

const createIssue = (
  code: SemanticIndexBuildIssueCode,
  message: string,
  details: Omit<SemanticIndexBuildIssue, 'code' | 'message'> = {}
): SemanticIndexBuildIssue => ({ code, message, ...details });

const isValidDescriptorPart = (value: string): boolean =>
  value.length > 0 && value.trim() === value;

export const validateSemanticProviders = (
  providers: readonly SemanticContributionProvider[]
): readonly SemanticIndexBuildIssue[] => {
  const issues: SemanticIndexBuildIssue[] = [];
  const providerIds = new Set<string>();

  for (const provider of [...providers].sort(compareProviders)) {
    const { id, semanticVersion, configurationDigest } = provider.descriptor;
    if (
      !isValidDescriptorPart(id) ||
      !isValidDescriptorPart(semanticVersion) ||
      (configurationDigest !== undefined &&
        !isValidDescriptorPart(configurationDigest))
    ) {
      issues.push(
        createIssue(
          'invalid-provider-descriptor',
          `Semantic provider "${id}" has an invalid descriptor.`,
          { providerId: id || undefined }
        )
      );
    }
    if (providerIds.has(id)) {
      issues.push(
        createIssue(
          'duplicate-provider-id',
          `Semantic provider id "${id}" is registered more than once.`,
          { providerId: id }
        )
      );
    }
    providerIds.add(id);
  }

  return freezeIssues(issues);
};

const freezeScope = (
  providerId: string,
  scope: WorkspaceScopeContribution
): WorkspaceScope =>
  Object.freeze({
    ...scope,
    providerId,
    ownerRef: freezeTargetRef(scope.ownerRef),
    ...(scope.importedScopeIds
      ? {
          importedScopeIds: sortedUniqueSemanticText(scope.importedScopeIds),
        }
      : {}),
  });

const freezeSymbol = (
  providerId: string,
  symbol: WorkspaceSymbolContribution
): WorkspaceSymbol =>
  Object.freeze({
    ...symbol,
    providerId,
    ownerRef: freezeTargetRef(symbol.ownerRef),
    ...(symbol.sourceSpan
      ? { sourceSpan: freezeSourceSpan(symbol.sourceSpan) }
      : {}),
    ...(symbol.capabilityIds
      ? { capabilityIds: sortedUniqueSemanticText(symbol.capabilityIds) }
      : {}),
  });

const freezeReferenceFact = (
  providerId: string,
  reference: WorkspaceReferenceFact
): IndexedReferenceFact =>
  Object.freeze({
    ...reference,
    providerId,
    sourceRef: freezeTargetRef(reference.sourceRef),
    ...(reference.sourceSpan
      ? { sourceSpan: freezeSourceSpan(reference.sourceSpan) }
      : {}),
    target:
      reference.target.kind === 'symbol-id'
        ? Object.freeze({ ...reference.target })
        : Object.freeze({
            ...reference.target,
            ...(reference.target.symbolKinds
              ? {
                  symbolKinds: sortedUniqueSemanticText(
                    reference.target.symbolKinds
                  ),
                }
              : {}),
          }),
    ...(reference.requiredCapabilityIds
      ? {
          requiredCapabilityIds: sortedUniqueSemanticText(
            reference.requiredCapabilityIds
          ),
        }
      : {}),
    ...(reference.expectedTypeRefs
      ? {
          expectedTypeRefs: sortedUniqueSemanticText(
            reference.expectedTypeRefs
          ),
        }
      : {}),
  });

const freezeDependency = (
  providerId: string,
  dependency: WorkspaceDependencyContribution
): WorkspaceDependencyEdge => Object.freeze({ ...dependency, providerId });

type IdentifiedFact = Readonly<{
  id: string;
  providerId: string;
}>;

const collectUniqueFact = <Fact extends IdentifiedFact>(
  fact: Fact,
  facts: Fact[],
  factsById: Map<string, Fact>,
  duplicateCode:
    | 'duplicate-scope-id'
    | 'duplicate-symbol-id'
    | 'duplicate-reference-id'
    | 'duplicate-dependency-id',
  label: string,
  issues: SemanticIndexBuildIssue[]
): void => {
  const existing = factsById.get(fact.id);
  if (existing) {
    issues.push(
      createIssue(
        duplicateCode,
        `${label} id "${fact.id}" is contributed more than once.`,
        {
          providerId: fact.providerId,
          factId: fact.id,
          relatedIds: [existing.providerId, fact.providerId],
        }
      )
    );
    return;
  }
  factsById.set(fact.id, fact);
  facts.push(fact);
};

export const collectCanonicalSemanticFacts = (
  identity: SemanticSnapshotIdentity,
  providers: readonly SemanticContributionProvider[]
): SemanticFactCollectionResult => {
  const providerIssues = validateSemanticProviders(providers);
  if (providerIssues.length) return createFactCollectionFailure(providerIssues);

  const issues: SemanticIndexBuildIssue[] = [];
  const scopes: WorkspaceScope[] = [];
  const symbols: WorkspaceSymbol[] = [];
  const referenceFacts: IndexedReferenceFact[] = [];
  const dependencies: WorkspaceDependencyEdge[] = [];
  const diagnosticContributions: SemanticDiagnosticContribution[] = [];
  const scopesById = new Map<string, WorkspaceScope>();
  const symbolsById = new Map<string, WorkspaceSymbol>();
  const referencesById = new Map<string, IndexedReferenceFact>();
  const dependenciesById = new Map<string, WorkspaceDependencyEdge>();

  for (const provider of [...providers].sort(compareProviders)) {
    const providerId = provider.descriptor.id;
    try {
      const contribution = provider.contribute(identity);
      for (const scope of [...(contribution.scopes ?? [])].sort(
        compareFactsById
      )) {
        collectUniqueFact(
          freezeScope(providerId, scope),
          scopes,
          scopesById,
          'duplicate-scope-id',
          'Scope',
          issues
        );
      }
      for (const symbol of [...(contribution.symbols ?? [])].sort(
        compareFactsById
      )) {
        collectUniqueFact(
          freezeSymbol(providerId, symbol),
          symbols,
          symbolsById,
          'duplicate-symbol-id',
          'Symbol',
          issues
        );
      }
      for (const reference of [...(contribution.references ?? [])].sort(
        compareFactsById
      )) {
        collectUniqueFact(
          freezeReferenceFact(providerId, reference),
          referenceFacts,
          referencesById,
          'duplicate-reference-id',
          'Reference',
          issues
        );
      }
      for (const dependency of [...(contribution.dependencies ?? [])].sort(
        compareFactsById
      )) {
        collectUniqueFact(
          freezeDependency(providerId, dependency),
          dependencies,
          dependenciesById,
          'duplicate-dependency-id',
          'Dependency',
          issues
        );
      }
      diagnosticContributions.push(
        Object.freeze({
          providerId,
          diagnostics: Object.freeze(
            [...(contribution.diagnostics ?? [])]
              .map(freezeDiagnostic)
              .sort(compareDiagnostics)
          ),
        })
      );
    } catch (cause) {
      issues.push(
        createIssue(
          'provider-contribution-failed',
          `Semantic provider "${providerId}" failed to contribute facts.`,
          { providerId, cause }
        )
      );
    }
  }

  if (issues.length) return createFactCollectionFailure(issues);

  issues.push(
    ...validateCanonicalSemanticFacts({
      scopes,
      symbols,
      referenceFacts,
      dependencies,
    })
  );

  if (issues.length) return createFactCollectionFailure(issues);

  return Object.freeze({
    ok: true,
    facts: Object.freeze({
      scopes: Object.freeze(scopes),
      symbols: Object.freeze(symbols),
      referenceFacts: Object.freeze(referenceFacts),
      dependencies: Object.freeze(dependencies),
      diagnosticContributions: Object.freeze(diagnosticContributions),
    }),
  });
};
