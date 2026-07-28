import type {
  WorkspaceDependencyEdge,
  WorkspaceReferenceEdge,
  WorkspaceSemanticIndex,
  WorkspaceSymbol,
} from '@prodivix/authoring';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import type {
  VerificationImpactPath,
  VerificationImpactReason,
  VerificationPartitionRevisions,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type { WorkspaceSnapshot } from '../types';

export const verificationOwnerDocumentId = (
  ownerRef: DiagnosticTargetRef
): string | undefined => {
  switch (ownerRef.kind) {
    case 'document':
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'animation-timeline':
    case 'animation-track':
    case 'data-source':
    case 'data-operation':
    case 'behavior-scenario':
    case 'behavior-step':
    case 'verification-policy':
    case 'component-slot':
      return ownerRef.documentId;
    case 'code-artifact':
      return ownerRef.artifactId;
    case 'workspace':
    case 'workspace-node':
    case 'route':
    case 'behavior-replay-record':
    case 'verification-plan-cell':
    case 'verification-evidence':
    case 'verification-closure':
    case 'operation':
    case 'theme-token':
    case 'viewport':
    case 'runtime-dom':
      return undefined;
  }
};

const documentProjection = (
  snapshot: WorkspaceSnapshot,
  documentId: string
): unknown => {
  const document = snapshot.docsById[documentId];
  return document
    ? {
        id: document.id,
        type: document.type,
        name: document.name,
        path: document.path,
        content: document.content,
        capabilities: document.capabilities,
      }
    : undefined;
};

export const changedVerificationDocumentIds = (
  before: WorkspaceSnapshot | undefined,
  after: WorkspaceSnapshot
): readonly string[] => {
  if (!before) {
    return Object.freeze(
      Object.keys(after.docsById).sort(compareUnicodeCodePoints)
    );
  }
  return Object.freeze(
    [
      ...new Set([
        ...Object.keys(before.docsById),
        ...Object.keys(after.docsById),
      ]),
    ]
      .filter(
        (documentId) =>
          !sameCanonicalJson(
            documentProjection(before, documentId),
            documentProjection(after, documentId)
          )
      )
      .sort(compareUnicodeCodePoints)
  );
};

export const workspaceVerificationPartitionRevisions = (
  snapshot: WorkspaceSnapshot
): VerificationPartitionRevisions => {
  const documentRevisions: Record<
    string,
    Readonly<{ contentRev: number; metaRev: number }>
  > = Object.create(null);
  for (const document of Object.values(snapshot.docsById).sort((left, right) =>
    compareUnicodeCodePoints(left.id, right.id)
  )) {
    documentRevisions[document.id] = Object.freeze({
      contentRev: document.contentRev,
      metaRev: document.metaRev,
    });
  }
  return Object.freeze({
    workspaceRev: snapshot.workspaceRev,
    routeRev: snapshot.routeRev,
    opSeq: snapshot.opSeq,
    documentRevisions: Object.freeze(documentRevisions),
  });
};

export const verificationSymbolsOwnedByDocuments = (
  index: WorkspaceSemanticIndex,
  documentIds: ReadonlySet<string>,
  includeRoutes: boolean
): readonly WorkspaceSymbol[] =>
  Object.freeze(
    index
      .getSymbols()
      .filter((symbol) => {
        const documentId = verificationOwnerDocumentId(symbol.ownerRef);
        return (
          (documentId !== undefined && documentIds.has(documentId)) ||
          (includeRoutes && symbol.kind.startsWith('route'))
        );
      })
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
  );

export const verificationDomainForDocument = (
  snapshot: WorkspaceSnapshot,
  documentId: string | undefined
): string | undefined => {
  if (!documentId) return undefined;
  const document = snapshot.docsById[documentId];
  if (!document) return undefined;
  if (
    document.type === 'project-config' &&
    (document.path.includes('/auth') || document.path.includes('/server'))
  ) {
    return 'auth-server';
  }
  switch (document.type) {
    case 'pir-page':
    case 'pir-layout':
    case 'pir-component':
      return 'pir';
    case 'data-source':
      return 'data';
    case 'pir-graph':
      return 'nodegraph';
    case 'pir-animation':
      return 'animation';
    case 'behavior-scenario':
    case 'behavior-control-profile':
    case 'behavior-fixture-set':
      return 'behavior';
    case 'verification-policy':
    case 'verification-baseline-set':
      return 'verification';
    case 'code':
      return 'code';
    case 'design-tokens':
    case 'design-token-resolver':
      return 'tokens';
    case 'asset':
      return 'asset';
    default:
      return undefined;
  }
};

export const verificationDomainForSymbol = (
  symbol: WorkspaceSymbol,
  snapshot: WorkspaceSnapshot
): string => {
  const kind = symbol.kind;
  if (kind.startsWith('route')) return 'route';
  if (
    kind.startsWith('component') ||
    kind.startsWith('pir-') ||
    ['state', 'param'].includes(kind)
  ) {
    return 'pir';
  }
  if (kind.startsWith('data') || kind.startsWith('collection-')) {
    return 'data';
  }
  if (kind.startsWith('nodegraph')) return 'nodegraph';
  if (kind.startsWith('animation')) return 'animation';
  if (kind.startsWith('behavior')) return 'behavior';
  if (
    kind.startsWith('code') ||
    kind === 'css-symbol' ||
    kind === 'shader-entry'
  ) {
    return 'code';
  }
  if (kind === 'design-system' || kind.startsWith('token')) {
    return 'tokens';
  }
  if (kind === 'asset') return 'asset';
  if (kind === 'external-contract') return 'external';
  return (
    verificationDomainForDocument(
      snapshot,
      verificationOwnerDocumentId(symbol.ownerRef)
    ) ?? 'workspace'
  );
};

export type WorkspaceVerificationImpactTraversal = Readonly<{
  rootSymbolIds: readonly string[];
  impactedSymbolIds: readonly string[];
  paths: readonly VerificationImpactPath[];
  reasons: readonly VerificationImpactReason[];
  complete: boolean;
}>;

export const traverseWorkspaceVerificationIndex = (
  index: WorkspaceSemanticIndex,
  roots: readonly WorkspaceSymbol[],
  contributorId: string
): WorkspaceVerificationImpactTraversal => {
  if (roots.length === 0) {
    return Object.freeze({
      rootSymbolIds: Object.freeze([]),
      impactedSymbolIds: Object.freeze([]),
      paths: Object.freeze([]),
      reasons: Object.freeze([]),
      complete: true,
    });
  }
  const impactedSymbolIds = new Set<string>();
  const paths: VerificationImpactPath[] = [];
  const reasons: VerificationImpactReason[] = [];
  let complete = true;
  for (const root of roots) {
    const impact = index.getImpact([root.id]);
    if (impact.status !== 'resolved') {
      complete = false;
      reasons.push({
        id: `${contributorId}:impact-missing:${root.id}`,
        kind: 'contributor-incomplete',
        message: `The semantic graph could not resolve changed root ${root.id}.`,
        contributorId,
        sourceId: root.id,
      });
      continue;
    }
    impact.impact.impactedSymbolIds.forEach((id) => impactedSymbolIds.add(id));
    const permittedReferences = new Set(impact.impact.referenceIds);
    const dependencyByTarget = new Map<string, WorkspaceDependencyEdge[]>();
    for (const dependencyId of impact.impact.dependencyIds) {
      const dependency = index.getDependency(dependencyId);
      if (!dependency) continue;
      const list = dependencyByTarget.get(dependency.targetSymbolId) ?? [];
      list.push(dependency);
      dependencyByTarget.set(dependency.targetSymbolId, list);
    }
    const queue = [root.id];
    const pathBySymbol = new Map<string, readonly string[]>([
      [root.id, Object.freeze([root.id])],
    ]);
    for (let offset = 0; offset < queue.length; offset += 1) {
      const targetId = queue[offset]!;
      const targetPath = pathBySymbol.get(targetId)!;
      const references = index.getReferences(targetId);
      const referenceEdges: readonly WorkspaceReferenceEdge[] =
        references.status === 'resolved'
          ? references.references.filter((edge) =>
              permittedReferences.has(edge.id)
            )
          : Object.freeze([]);
      const edges = [
        ...referenceEdges.map((edge) => ({
          id: edge.id,
          sourceId: edge.sourceSymbolId,
          relationship: 'reference' as const,
        })),
        ...(dependencyByTarget.get(targetId) ?? []).map((edge) => ({
          id: edge.id,
          sourceId: edge.sourceSymbolId,
          relationship: 'dependency' as const,
        })),
      ].sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
      for (const edge of edges) {
        if (!edge.sourceId || pathBySymbol.has(edge.sourceId)) continue;
        const nextPath = Object.freeze([...targetPath, edge.sourceId]);
        pathBySymbol.set(edge.sourceId, nextPath);
        queue.push(edge.sourceId);
        const sourceSymbol = index.getSymbol(edge.sourceId);
        const targetIdentity =
          sourceSymbol?.kind === 'behavior-scenario'
            ? sourceSymbol.name
            : edge.sourceId;
        paths.push({
          id: `${contributorId}:path:${root.id}:${edge.id}`,
          relationship: edge.relationship,
          fromId: root.id,
          toId: targetIdentity,
          nodes: nextPath,
          contributorId,
        });
        reasons.push({
          id: `${contributorId}:reason:${root.id}:${edge.id}`,
          kind: edge.relationship,
          message: `${edge.relationship} ${edge.id} reaches ${targetIdentity}.`,
          contributorId,
          sourceId: targetId,
          targetId: targetIdentity,
        });
      }
    }
  }
  return Object.freeze({
    rootSymbolIds: Object.freeze(roots.map((symbol) => symbol.id)),
    impactedSymbolIds: Object.freeze(
      [...impactedSymbolIds].sort(compareUnicodeCodePoints)
    ),
    paths: Object.freeze(paths),
    reasons: Object.freeze(reasons),
    complete,
  });
};

export const allWorkspaceVerificationScenarioIds = (
  snapshot: WorkspaceSnapshot
): readonly string[] =>
  Object.freeze(
    Object.values(snapshot.docsById)
      .filter((document) => document.type === 'behavior-scenario')
      .flatMap((document) => {
        const content = document.content as Readonly<{ id?: unknown }>;
        return typeof content?.id === 'string' ? [content.id] : [];
      })
      .sort(compareUnicodeCodePoints)
  );

export const allWorkspaceVerificationDomains = (
  snapshot: WorkspaceSnapshot
): readonly string[] =>
  Object.freeze(
    [
      'route',
      ...Object.keys(snapshot.docsById).flatMap((documentId) => {
        const domain = verificationDomainForDocument(snapshot, documentId);
        return domain ? [domain] : [];
      }),
    ]
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort(compareUnicodeCodePoints)
  );
