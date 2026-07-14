import {
  isSameSemanticSnapshotIdentity,
  type SemanticSnapshotIdentity,
  type WorkspaceSemanticIndex,
  type WorkspaceReferenceEdge,
} from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type {
  WorkspaceResolvedNavigationLocation,
  WorkspaceSemanticNavigationResolution,
  WorkspaceSemanticNavigationTarget,
} from './workspaceSemanticNavigation.types';

const isIndexBoundToWorkspace = (
  index: WorkspaceSemanticIndex,
  workspace: WorkspaceSnapshot
): boolean => {
  const revisions = index.snapshotIdentity.workspaceRevisions;
  if (
    revisions.workspaceId !== workspace.id ||
    revisions.workspaceRev !== workspace.workspaceRev ||
    revisions.routeRev !== workspace.routeRev ||
    revisions.opSeq !== workspace.opSeq
  ) {
    return false;
  }

  const documentIds = Object.keys(workspace.docsById).sort();
  const indexedDocumentIds = Object.keys(revisions.documentRevs).sort();
  if (
    documentIds.length !== indexedDocumentIds.length ||
    documentIds.some(
      (documentId, index) => documentId !== indexedDocumentIds[index]
    )
  ) {
    return false;
  }

  return documentIds.every((documentId) => {
    const document = workspace.docsById[documentId];
    const revision = revisions.documentRevs[documentId];
    return (
      Boolean(document && revision) &&
      document!.contentRev === revision!.contentRev &&
      document!.metaRev === revision!.metaRev
    );
  });
};

const isExpectedIdentityCurrent = (
  index: WorkspaceSemanticIndex,
  expectedSnapshotIdentity?: SemanticSnapshotIdentity
): boolean =>
  !expectedSnapshotIdentity ||
  isSameSemanticSnapshotIdentity(
    index.snapshotIdentity,
    expectedSnapshotIdentity
  );

const referenceSourceLocation = (
  reference: WorkspaceReferenceEdge,
  preferSourceSpan: boolean
): WorkspaceResolvedNavigationLocation =>
  preferSourceSpan && reference.sourceSpan
    ? { kind: 'source-span', sourceSpan: reference.sourceSpan }
    : { kind: 'diagnostic-target', targetRef: reference.sourceRef };

const symbolDefinitionLocation = (
  symbol: NonNullable<ReturnType<WorkspaceSemanticIndex['getSymbol']>>
): WorkspaceResolvedNavigationLocation =>
  symbol.sourceSpan
    ? { kind: 'source-span', sourceSpan: symbol.sourceSpan }
    : { kind: 'diagnostic-target', targetRef: symbol.ownerRef };

const unavailable = (
  reason: Extract<
    WorkspaceSemanticNavigationResolution,
    { status: 'unavailable' }
  >['reason']
): WorkspaceSemanticNavigationResolution => ({ status: 'unavailable', reason });

/**
 * Resolves semantic identities against one immutable Workspace Semantic Index.
 * The index must match every canonical partition revision before owner or
 * reference locations are exposed to browser surface routing.
 */
export const resolveWorkspaceSemanticNavigationLocation = (input: {
  workspace: WorkspaceSnapshot | null;
  semanticIndex?: WorkspaceSemanticIndex | null;
  target: WorkspaceSemanticNavigationTarget;
}): WorkspaceSemanticNavigationResolution => {
  if (input.target.kind === 'diagnostic-target') {
    return {
      status: 'resolved',
      location: input.target,
    };
  }
  if (input.target.kind === 'source-span') {
    return {
      status: 'resolved',
      location: input.target,
    };
  }
  if (!input.workspace) return unavailable('workspace-unavailable');
  if (!input.semanticIndex) return unavailable('semantic-index-unavailable');
  if (
    !isIndexBoundToWorkspace(input.semanticIndex, input.workspace) ||
    !isExpectedIdentityCurrent(
      input.semanticIndex,
      input.target.expectedSnapshotIdentity
    )
  ) {
    return unavailable('semantic-index-stale');
  }

  const queryOptions = {
    expectedSnapshotIdentity:
      input.target.expectedSnapshotIdentity ??
      input.semanticIndex.snapshotIdentity,
  };

  if (input.target.kind === 'semantic-reference') {
    if (input.target.destination === 'source') {
      const reference = input.semanticIndex.getReference(
        input.target.referenceId
      );
      return reference
        ? {
            status: 'resolved',
            location: referenceSourceLocation(reference, true),
          }
        : unavailable('semantic-reference-missing');
    }

    const definition = input.semanticIndex.getDefinition(
      input.target.referenceId,
      queryOptions
    );
    if (definition.status === 'stale') {
      return unavailable('semantic-index-stale');
    }
    if (definition.status === 'missing') {
      return unavailable('semantic-reference-missing');
    }
    if (definition.status !== 'resolved') {
      return unavailable('semantic-reference-unresolved');
    }
    return {
      status: 'resolved',
      location: symbolDefinitionLocation(definition.symbol),
    };
  }

  const symbolTarget = input.target;
  const symbol = input.semanticIndex.getSymbol(symbolTarget.symbolId);
  if (!symbol) return unavailable('semantic-symbol-missing');
  if (
    !symbolTarget.destination ||
    symbolTarget.destination.kind === 'definition'
  ) {
    return {
      status: 'resolved',
      location: symbolDefinitionLocation(symbol),
    };
  }

  const references = input.semanticIndex.getReferences(
    symbolTarget.symbolId,
    queryOptions
  );
  if (references.status === 'stale') {
    return unavailable('semantic-index-stale');
  }
  if (references.status === 'missing') {
    return unavailable('semantic-symbol-missing');
  }
  const referenceDestination = symbolTarget.destination;
  const reference = referenceDestination.referenceId
    ? references.references.find(
        ({ id }) => id === referenceDestination.referenceId
      )
    : references.references[0];
  if (!reference) {
    return unavailable(
      referenceDestination.referenceId
        ? 'semantic-reference-not-owned-by-symbol'
        : 'semantic-reference-missing'
    );
  }
  return {
    status: 'resolved',
    location: referenceSourceLocation(
      reference,
      referenceDestination.preferSourceSpan !== false
    ),
  };
};
