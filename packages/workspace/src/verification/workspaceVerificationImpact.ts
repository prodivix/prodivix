import {
  createVerificationImpactSet,
  digestVerificationValue,
  type VerificationImpactContribution,
  type VerificationImpactPath,
  type VerificationImpactReason,
  type VerificationImpactSetResult,
} from '@prodivix/verification';
import {
  sameCanonicalJson,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '../types';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSemanticIndexCompositionOptions,
  type WorkspaceSemanticIndexIssue,
} from '../authoring/createWorkspaceSemanticIndexFromSnapshot';
import {
  allWorkspaceVerificationDomains,
  allWorkspaceVerificationScenarioIds,
  changedVerificationDocumentIds,
  traverseWorkspaceVerificationIndex,
  verificationDomainForDocument,
  verificationDomainForSymbol,
  verificationOwnerDocumentId,
  verificationSymbolsOwnedByDocuments,
  workspaceVerificationPartitionRevisions,
} from './workspaceVerificationImpactSemantic';

export type CreateWorkspaceVerificationImpactInput = Readonly<{
  before?: WorkspaceSnapshot;
  after: WorkspaceSnapshot;
  operationIds: readonly string[];
  frameworkTargets: readonly string[];
  beforeFrameworkTargets?: readonly string[];
  runtimeZones: readonly string[];
  maximumGraphSymbols?: number;
  semanticOptions?: WorkspaceSemanticIndexCompositionOptions;
  additionalContributions?: readonly VerificationImpactContribution[];
}>;

export type WorkspaceVerificationImpactResult =
  | VerificationImpactSetResult
  | Readonly<{
      status: 'blocked';
      reasonCode: 'VER-1001';
      message: string;
      semanticIssues: readonly WorkspaceSemanticIndexIssue[];
    }>;

/**
 * Composes exact before/after semantic impact in the Workspace composition
 * root, then delegates transport-neutral merging/digesting to Verification.
 */
export const createWorkspaceVerificationImpactSet = (
  input: CreateWorkspaceVerificationImpactInput
): WorkspaceVerificationImpactResult => {
  if (
    input.before &&
    (input.before.id !== input.after.id ||
      input.before.workspaceRev > input.after.workspaceRev)
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message:
        'Before and after snapshots must belong to one Workspace and use an ascending revision range.',
    });
  }
  const afterComposition = createWorkspaceSemanticIndexFromSnapshot(
    input.after,
    input.semanticOptions
  );
  if (afterComposition.status === 'blocked') {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-1001',
      message:
        'The target revision semantic index is unavailable; precise or conservative planning cannot establish a trusted target identity.',
      semanticIssues: afterComposition.issues,
    });
  }
  const beforeComposition = input.before
    ? createWorkspaceSemanticIndexFromSnapshot(
        input.before,
        input.semanticOptions
      )
    : undefined;
  const changedDocuments = changedVerificationDocumentIds(
    input.before,
    input.after
  );
  const changedDocumentSet = new Set(changedDocuments);
  const routeChanged =
    !input.before ||
    input.before.routeRev !== input.after.routeRev ||
    !sameCanonicalJson(input.before.routeManifest, input.after.routeManifest);
  const afterRoots = verificationSymbolsOwnedByDocuments(
    afterComposition.index,
    changedDocumentSet,
    routeChanged
  );
  const beforeRoots =
    beforeComposition?.status === 'ready'
      ? verificationSymbolsOwnedByDocuments(
          beforeComposition.index,
          changedDocumentSet,
          routeChanged
        )
      : Object.freeze([]);
  const representedDocumentIds = new Set(
    [...afterRoots, ...beforeRoots].flatMap((symbol) => {
      if (symbol.kind === 'workspace-document') return [];
      const documentId = verificationOwnerDocumentId(symbol.ownerRef);
      return documentId ? [documentId] : [];
    })
  );
  const uncoveredChangedDocuments = changedDocuments.filter(
    (documentId) => !representedDocumentIds.has(documentId)
  );
  const maximumGraphSymbols = Math.max(
    1,
    Math.trunc(input.maximumGraphSymbols ?? 50_000)
  );
  const graphOverBudget =
    afterComposition.index.getSymbols().length > maximumGraphSymbols ||
    (beforeComposition?.status === 'ready' &&
      beforeComposition.index.getSymbols().length > maximumGraphSymbols);
  const afterTraversal = graphOverBudget
    ? undefined
    : traverseWorkspaceVerificationIndex(
        afterComposition.index,
        afterRoots,
        'workspace-semantic-after'
      );
  const beforeTraversal =
    graphOverBudget || beforeComposition?.status !== 'ready'
      ? undefined
      : traverseWorkspaceVerificationIndex(
          beforeComposition.index,
          beforeRoots,
          'workspace-semantic-before'
        );
  const allSymbolIds = [
    ...(afterTraversal?.rootSymbolIds ?? afterRoots.map((symbol) => symbol.id)),
    ...(afterTraversal?.impactedSymbolIds ?? []),
    ...(beforeTraversal?.rootSymbolIds ??
      beforeRoots.map((symbol) => symbol.id)),
    ...(beforeTraversal?.impactedSymbolIds ?? []),
  ];
  const symbols = allSymbolIds.flatMap((symbolId) => {
    const symbol =
      afterComposition.index.getSymbol(symbolId) ??
      (beforeComposition?.status === 'ready'
        ? beforeComposition.index.getSymbol(symbolId)
        : null);
    return symbol ? [symbol] : [];
  });
  const scenarioIdByDocument = new Map<string, string>();
  for (const snapshot of [input.after, input.before].filter(
    (candidate): candidate is WorkspaceSnapshot => candidate !== undefined
  )) {
    for (const document of Object.values(snapshot.docsById)) {
      if (document.type !== 'behavior-scenario') continue;
      const content = document.content as Readonly<{ id?: unknown }>;
      if (typeof content.id === 'string') {
        scenarioIdByDocument.set(document.id, content.id);
      }
    }
  }
  const behaviorScenarioBySymbol = new Map<string, string>();
  for (const symbol of symbols) {
    if (!symbol.kind.startsWith('behavior')) continue;
    const documentId = verificationOwnerDocumentId(symbol.ownerRef);
    const scenarioId =
      (documentId ? scenarioIdByDocument.get(documentId) : undefined) ??
      (symbol.kind === 'behavior-scenario' ? symbol.name : undefined);
    if (scenarioId) behaviorScenarioBySymbol.set(symbol.id, scenarioId);
  }
  const scenarioIds = [...behaviorScenarioBySymbol.values()];
  const semanticPaths = [
    ...(afterTraversal?.paths ?? []),
    ...(beforeTraversal?.paths ?? []),
  ];
  const scenarioPaths: VerificationImpactPath[] = [];
  for (const path of semanticPaths) {
    const terminalSymbolId = path.nodes[path.nodes.length - 1];
    const scenarioId = terminalSymbolId
      ? behaviorScenarioBySymbol.get(terminalSymbolId)
      : undefined;
    if (!scenarioId) continue;
    scenarioPaths.push({
      id: `${path.id}:scenario`,
      relationship: 'domain',
      fromId: path.fromId,
      toId: scenarioId,
      nodes: Object.freeze([...path.nodes, scenarioId]),
      contributorId: 'workspace-behavior-scenario-coverage',
    });
  }
  const domains = [
    ...symbols.map((symbol) =>
      verificationDomainForSymbol(symbol, input.after)
    ),
    ...changedDocuments.map((documentId) => {
      const owningSnapshot = input.after.docsById[documentId]
        ? input.after
        : input.before;
      return owningSnapshot
        ? (verificationDomainForDocument(owningSnapshot, documentId) ??
            'workspace')
        : 'workspace';
    }),
  ];
  const capabilities = symbols.flatMap((symbol) => [
    ...(symbol.capabilityIds ?? []),
  ]);
  const riskFlags = [
    ...(domains.includes('auth-server') ? ['auth-boundary'] : []),
    ...(domains.includes('code') ? ['shared-code'] : []),
    ...(domains.includes('route') ? ['route-guard'] : []),
    ...(capabilities.some((id) => id.includes('secret')) ? ['secret'] : []),
  ];
  const providerDrift =
    beforeComposition?.status === 'ready' &&
    beforeComposition.index.snapshotIdentity.providerSetDigest !==
      afterComposition.index.snapshotIdentity.providerSetDigest;
  const schemaDrift =
    beforeComposition?.status === 'ready' &&
    beforeComposition.index.snapshotIdentity.schemaVersion !==
      afterComposition.index.snapshotIdentity.schemaVersion;
  const targetChanged =
    input.beforeFrameworkTargets !== undefined &&
    !sameCanonicalJson(
      [...input.beforeFrameworkTargets].sort(compareUnicodeCodePoints),
      [...input.frameworkTargets].sort(compareUnicodeCodePoints)
    );
  const incomplete =
    !input.before ||
    beforeComposition?.status === 'blocked' ||
    graphOverBudget ||
    uncoveredChangedDocuments.length > 0 ||
    providerDrift ||
    schemaDrift ||
    afterTraversal?.complete === false ||
    beforeTraversal?.complete === false;
  const reasons: VerificationImpactReason[] = changedDocuments.map(
    (documentId) => ({
      id: `workspace:document:${digestVerificationValue(documentId)}`,
      kind: 'document-change',
      message: `Workspace document ${documentId} changed.`,
      contributorId: 'workspace-diff',
      sourceId: documentId,
    })
  );
  if (routeChanged) {
    reasons.push({
      id: 'workspace:route-change',
      kind: 'symbol-change',
      message: 'The canonical Route manifest changed.',
      contributorId: 'workspace-diff',
      sourceId: 'route-manifest',
    });
  }
  if (providerDrift) {
    reasons.push({
      id: 'workspace:provider-drift',
      kind: 'provider-drift',
      message: 'The before and after semantic provider sets differ.',
      contributorId: 'workspace-semantic',
    });
  }
  if (schemaDrift) {
    reasons.push({
      id: 'workspace:schema-drift',
      kind: 'schema-drift',
      message: 'The before and after semantic schemas differ.',
      contributorId: 'workspace-semantic',
    });
  }
  if (graphOverBudget) {
    reasons.push({
      id: 'workspace:graph-budget',
      kind: 'graph-budget-exceeded',
      message: `Semantic graph exceeds the ${maximumGraphSymbols} symbol traversal budget.`,
      contributorId: 'workspace-semantic',
    });
  }
  for (const documentId of uncoveredChangedDocuments) {
    reasons.push({
      id: `workspace:semantic-coverage:${digestVerificationValue(documentId)}`,
      kind: 'contributor-incomplete',
      message: `Changed Workspace document ${documentId} has no semantic owner contribution; scope is conservatively expanded.`,
      contributorId: 'workspace-semantic-coverage',
      sourceId: documentId,
    });
  }
  if (targetChanged) {
    reasons.push({
      id: 'workspace:target-change',
      kind: 'target-change',
      message: 'The controlled framework target set changed.',
      contributorId: 'workspace-targets',
    });
  }
  if (beforeComposition?.status === 'blocked') {
    reasons.push({
      id: 'workspace:before-index-unavailable',
      kind: 'contributor-incomplete',
      message:
        'The before revision semantic index is unavailable; scope is conservatively expanded.',
      contributorId: 'workspace-semantic-before',
    });
  }

  const coreContribution: VerificationImpactContribution = {
    contributorId: 'workspace-composition',
    completeness: incomplete ? 'conservative' : 'complete',
    changedDocumentIds: changedDocuments,
    changedSymbolIds: [
      ...afterRoots.map((symbol) => symbol.id),
      ...beforeRoots.map((symbol) => symbol.id),
    ],
    changedSourceSpans: [...afterRoots, ...beforeRoots].flatMap((symbol) =>
      symbol.sourceSpan ? [symbol.sourceSpan] : []
    ),
    impactedSymbolIds: allSymbolIds,
    impactedScenarioIds: scenarioIds,
    impactedDomains: domains,
    frameworkTargets: input.frameworkTargets,
    runtimeZones: input.runtimeZones,
    capabilityIds: capabilities,
    riskFlags,
    impactPaths: [...semanticPaths, ...scenarioPaths],
    reasons: [
      ...reasons,
      ...(afterTraversal?.reasons ?? []),
      ...(beforeTraversal?.reasons ?? []),
    ],
  };
  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const domainContributions: VerificationImpactContribution[] = [
    ...new Set(domains),
  ]
    .sort(compareUnicodeCodePoints)
    .map((domain) => {
      const domainSymbols = symbols.filter(
        (symbol) => verificationDomainForSymbol(symbol, input.after) === domain
      );
      const rootIds = new Set(domainSymbols.map((symbol) => symbol.id));
      const paths = [...semanticPaths, ...scenarioPaths].filter((path) => {
        const root = symbolById.get(path.fromId);
        return (
          rootIds.has(path.fromId) ||
          (root !== undefined &&
            verificationDomainForSymbol(root, input.after) === domain)
        );
      });
      return Object.freeze({
        contributorId: `workspace-domain:${domain}`,
        completeness: 'complete' as const,
        impactedScenarioIds: paths
          .map((path) => path.toId)
          .filter(
            (id) => scenarioIdByDocument.has(id) || scenarioIds.includes(id)
          ),
        impactedDomains: Object.freeze([domain]),
        capabilityIds: domainSymbols.flatMap((symbol) => [
          ...(symbol.capabilityIds ?? []),
        ]),
        impactPaths: paths,
        reasons: Object.freeze([
          {
            id: `workspace-domain:${domain}`,
            kind: 'capability-change' as const,
            message: `The ${domain} semantic contributor participated in impact analysis.`,
            contributorId: `workspace-domain:${domain}`,
          },
        ]),
      });
    });
  return createVerificationImpactSet({
    workspaceId: input.after.id,
    ...(input.before
      ? {
          baseRevision: input.before.workspaceRev,
          basePartitionRevisions: workspaceVerificationPartitionRevisions(
            input.before
          ),
        }
      : {}),
    targetRevision: input.after.workspaceRev,
    targetPartitionRevisions: workspaceVerificationPartitionRevisions(
      input.after
    ),
    semanticSchemaDigest: afterComposition.index.snapshotIdentity.schemaVersion,
    providerSetDigest:
      afterComposition.index.snapshotIdentity.providerSetDigest,
    operationIds: input.operationIds,
    contributions: [
      coreContribution,
      ...domainContributions,
      ...(input.additionalContributions ?? []),
    ],
    conservativeScope: {
      scenarioIds: allWorkspaceVerificationScenarioIds(input.after),
      domains: allWorkspaceVerificationDomains(input.after),
      frameworkTargets: input.frameworkTargets,
      runtimeZones: input.runtimeZones,
      capabilityIds: ['verification:project'],
      riskFlags: ['unknown-impact'],
    },
  });
};
