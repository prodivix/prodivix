import type {
  WorkspaceSemanticIndex,
  WorkspaceSymbol,
  WorkspaceSymbolKind,
} from '@prodivix/authoring';
import {
  PIR_COLLECTION_BINDING_LOCATIONS,
  createPirBindingCandidate,
  resolvePirCollectionBindingScope,
  type PIRCollectionBindingLocation,
  type PIRCollectionKeyBinding,
  type PIRCollectionNode,
  type PIRCollectionSourceBinding,
  type PIRDocument,
  type PIRJsonValue,
  type PIRNode,
  type PIRValueBinding,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import {
  selectWorkspacePirDocument,
  type WorkspacePirDocumentType,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';

export const COLLECTION_INSPECTOR_REGIONS = Object.freeze([
  'item',
  'empty',
  'loading',
  'error',
] as const);

export type CollectionInspectorRegionName =
  (typeof COLLECTION_INSPECTOR_REGIONS)[number];

export type CollectionInspectorSymbolRole = 'item' | 'index' | 'error';

export type CollectionInspectorBindingReadonlyReason =
  'code-owned' | 'complex-binding';

export type CollectionInspectorBindingView = Readonly<{
  binding: PIRValueBinding;
  label: string;
  readOnly: boolean;
  readOnlyReason?: CollectionInspectorBindingReadonlyReason;
}>;

export type CollectionInspectorSourceView =
  | Readonly<{
      kind: 'literal';
      value: readonly PIRJsonValue[];
      itemCount: number;
      readOnly: false;
    }>
  | (Readonly<{ kind: 'binding' }> & CollectionInspectorBindingView);

export type CollectionInspectorKeyView =
  | Readonly<{ kind: 'index'; readOnly: false }>
  | (Readonly<{ kind: 'binding' }> & CollectionInspectorBindingView);

export type CollectionInspectorSymbolView<
  Role extends CollectionInspectorSymbolRole = CollectionInspectorSymbolRole,
> = Readonly<{
  role: Role;
  id: string;
  name: string;
  editableName: boolean;
}>;

export type CollectionInspectorRegionNodeView = Readonly<{
  id: string;
  kind: PIRNode['kind'];
  label: string;
}>;

export type CollectionInspectorRegionView = Readonly<{
  name: CollectionInspectorRegionName;
  nodeIds: readonly string[];
  nodes: readonly CollectionInspectorRegionNodeView[];
  count: number;
  state: 'configured' | 'empty';
}>;

export type CollectionInspectorBindingCandidate = Readonly<{
  id: string;
  symbolId: string;
  symbolKind: WorkspaceSymbolKind;
  label: string;
  detail?: string;
  typeRef?: string;
  binding: PIRValueBinding;
  local: boolean;
}>;

export type CollectionInspectorCandidateScope = Readonly<{
  location: PIRCollectionBindingLocation;
  status: 'ready' | 'unavailable' | 'stale';
  scopeId?: string;
  candidates: readonly CollectionInspectorBindingCandidate[];
}>;

export type CollectionInspectorSemanticStatus =
  | Readonly<{ status: 'ready' }>
  | Readonly<{
      status: 'unavailable';
      reason: 'index-build-blocked' | 'index-stale';
      messages: readonly string[];
    }>;

export type CollectionInspectorModel = Readonly<{
  location: PIRRenderLocation;
  document: PIRDocument;
  collection: PIRCollectionNode;
  source: CollectionInspectorSourceView;
  key: CollectionInspectorKeyView;
  symbols: Readonly<{
    item: CollectionInspectorSymbolView<'item'>;
    index: CollectionInspectorSymbolView<'index'>;
    error?: CollectionInspectorSymbolView<'error'>;
  }>;
  regions: Readonly<
    Record<CollectionInspectorRegionName, CollectionInspectorRegionView>
  >;
  candidateScopes: Readonly<
    Record<PIRCollectionBindingLocation, CollectionInspectorCandidateScope>
  >;
  semanticStatus: CollectionInspectorSemanticStatus;
}>;

export type CollectionInspectorProjectionResult =
  | Readonly<{ status: 'ready'; model: CollectionInspectorModel }>
  | Readonly<{
      status: 'unavailable';
      reason:
        | 'document-missing'
        | 'document-invalid'
        | 'node-missing'
        | 'node-not-collection';
      message: string;
    }>;

export type CreateCollectionInspectorModelInput = Readonly<{
  workspace: WorkspaceSnapshot;
  location: PIRRenderLocation;
  semanticIndex?: WorkspaceSemanticIndex | null;
}>;

const BINDABLE_SYMBOL_KINDS = Object.freeze([
  'param',
  'state',
  'data',
  'collection-item',
  'collection-index',
  'collection-error',
  'component-prop',
  'component-variant',
] satisfies readonly WorkspaceSymbolKind[]);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

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
  const documentIds = Object.keys(workspace.docsById).sort(compareText);
  const indexedDocumentIds = Object.keys(revisions.documentRevs).sort(
    compareText
  );
  if (
    documentIds.length !== indexedDocumentIds.length ||
    documentIds.some(
      (documentId, position) => documentId !== indexedDocumentIds[position]
    )
  ) {
    return false;
  }
  return documentIds.every((documentId) => {
    const document = workspace.docsById[documentId];
    const revision = revisions.documentRevs[documentId];
    return (
      document !== undefined &&
      revision !== undefined &&
      revision.contentRev === document.contentRev &&
      revision.metaRev === document.metaRev
    );
  });
};

const bindingPath = (binding: PIRValueBinding): string | undefined =>
  'path' in binding ? binding.path : undefined;

export const getCollectionInspectorBindingReadonlyReason = (
  binding: PIRValueBinding
): CollectionInspectorBindingReadonlyReason | undefined => {
  if (binding.kind === 'code') return 'code-owned';
  if (binding.kind === 'literal' || bindingPath(binding)) {
    return 'complex-binding';
  }
  return undefined;
};

export const formatCollectionInspectorBinding = (
  binding: PIRValueBinding
): string => {
  const path = bindingPath(binding);
  const suffix = path ? `.${path}` : '';
  switch (binding.kind) {
    case 'literal':
      return 'Inline value';
    case 'param':
      return `Param · ${binding.paramId}${suffix}`;
    case 'state':
      return `State · ${binding.stateId}${suffix}`;
    case 'data':
      return `Data · ${binding.dataId}${suffix}`;
    case 'collection-symbol':
      return `Collection · ${binding.symbolId}${suffix}`;
    case 'component-prop':
      return `Prop · ${binding.memberId}${suffix}`;
    case 'component-variant':
      return `Variant · ${binding.memberId}${suffix}`;
    case 'slot-prop':
      return `Slot prop · ${binding.memberId}${suffix}`;
    case 'code':
      return 'CodeReference';
  }
};

const projectBinding = (
  binding: PIRValueBinding
): CollectionInspectorBindingView => {
  const readOnlyReason = getCollectionInspectorBindingReadonlyReason(binding);
  return Object.freeze({
    binding,
    label: formatCollectionInspectorBinding(binding),
    readOnly: readOnlyReason !== undefined,
    ...(readOnlyReason ? { readOnlyReason } : {}),
  });
};

const projectSource = (
  source: PIRCollectionSourceBinding
): CollectionInspectorSourceView =>
  source.kind === 'literal'
    ? Object.freeze({
        kind: 'literal',
        value: source.value,
        itemCount: source.value.length,
        readOnly: false as const,
      })
    : Object.freeze({ kind: 'binding', ...projectBinding(source.value) });

const projectKey = (
  key: PIRCollectionKeyBinding
): CollectionInspectorKeyView =>
  key.kind === 'index'
    ? Object.freeze({ kind: 'index', readOnly: false as const })
    : Object.freeze({ kind: 'binding', ...projectBinding(key.value) });

const describeRegionNode = (node: PIRNode): string => {
  switch (node.kind) {
    case 'element':
      return node.type;
    case 'component-instance':
      return `Component · ${node.componentDocumentId}`;
    case 'component-slot-outlet':
      return `Slot · ${node.slotMemberId}`;
    case 'collection':
      return 'Collection';
  }
};

const projectRegion = (
  document: PIRDocument,
  collectionId: string,
  name: CollectionInspectorRegionName
): CollectionInspectorRegionView => {
  const nodeIds = Object.freeze([
    ...(document.ui.graph.regionsById?.[collectionId]?.[name] ?? []),
  ]);
  const nodes = Object.freeze(
    nodeIds.flatMap((nodeId) => {
      const node = document.ui.graph.nodesById[nodeId];
      return node
        ? [
            Object.freeze({
              id: node.id,
              kind: node.kind,
              label: describeRegionNode(node),
            }),
          ]
        : [];
    })
  );
  return Object.freeze({
    name,
    nodeIds,
    nodes,
    count: nodeIds.length,
    state: nodeIds.length > 0 ? 'configured' : 'empty',
  });
};

const projectRegions = (
  document: PIRDocument,
  collectionId: string
): CollectionInspectorModel['regions'] =>
  Object.freeze(
    Object.fromEntries(
      COLLECTION_INSPECTOR_REGIONS.map((name) => [
        name,
        projectRegion(document, collectionId, name),
      ])
    ) as Record<CollectionInspectorRegionName, CollectionInspectorRegionView>
  );

const bindingIdentity = (binding: PIRValueBinding): string => {
  switch (binding.kind) {
    case 'literal':
      return `literal:${JSON.stringify(binding.value)}`;
    case 'code':
      return `code:${JSON.stringify(binding.reference)}`;
    case 'param':
      return `param:${binding.paramId}:${binding.path ?? ''}`;
    case 'state':
      return `state:${binding.stateId}:${binding.path ?? ''}`;
    case 'data':
      return `data:${binding.dataId}:${binding.path ?? ''}`;
    case 'collection-symbol':
      return `collection-symbol:${binding.symbolId}:${binding.path ?? ''}`;
    case 'component-prop':
      return `component-prop:${binding.memberId}:${binding.path ?? ''}`;
    case 'component-variant':
      return `component-variant:${binding.memberId}:${binding.path ?? ''}`;
    case 'slot-prop':
      return `slot-prop:${binding.memberId}:${binding.path ?? ''}`;
  }
};

const candidateDetail = (symbol: WorkspaceSymbol): string | undefined =>
  symbol.typeRef ?? symbol.qualifiedName ?? undefined;

const projectCandidate = (
  workspaceId: string,
  documentId: string,
  document: PIRDocument,
  symbol: WorkspaceSymbol,
  localCollectionSymbolIds: readonly string[]
): CollectionInspectorBindingCandidate | undefined => {
  const result = createPirBindingCandidate({
    workspaceId,
    documentId,
    document,
    symbol,
  });
  if (result.status !== 'available') return undefined;
  const local =
    result.binding.kind === 'collection-symbol' &&
    localCollectionSymbolIds.includes(result.binding.symbolId);
  return Object.freeze({
    id: symbol.id,
    symbolId: symbol.id,
    symbolKind: symbol.kind,
    label: symbol.displayName ?? symbol.name,
    ...(candidateDetail(symbol) ? { detail: candidateDetail(symbol) } : {}),
    ...(symbol.typeRef ? { typeRef: symbol.typeRef } : {}),
    binding: result.binding,
    local,
  });
};

const compareCandidates = (
  left: CollectionInspectorBindingCandidate,
  right: CollectionInspectorBindingCandidate
): number =>
  Number(right.local) - Number(left.local) ||
  compareText(left.label, right.label) ||
  compareText(left.symbolKind, right.symbolKind) ||
  compareText(left.id, right.id);

const unavailableCandidateScopes = (
  status: 'unavailable' | 'stale'
): CollectionInspectorModel['candidateScopes'] =>
  Object.freeze(
    Object.fromEntries(
      PIR_COLLECTION_BINDING_LOCATIONS.map((location) => [
        location,
        Object.freeze({
          location,
          status,
          candidates: Object.freeze([]),
        }),
      ])
    ) as Record<PIRCollectionBindingLocation, CollectionInspectorCandidateScope>
  );

const projectCandidateScope = (input: {
  workspace: WorkspaceSnapshot;
  semanticIndex: WorkspaceSemanticIndex;
  documentId: string;
  documentType: WorkspacePirDocumentType;
  document: PIRDocument;
  collectionId: string;
  location: PIRCollectionBindingLocation;
}): CollectionInspectorCandidateScope => {
  const scope = resolvePirCollectionBindingScope({
    workspaceId: input.workspace.id,
    documentId: input.documentId,
    documentType: input.documentType,
    document: input.document,
    collectionNodeId: input.collectionId,
    location: input.location,
  });
  if (!scope) {
    return Object.freeze({
      location: input.location,
      status: 'unavailable',
      candidates: Object.freeze([]),
    });
  }
  const result = input.semanticIndex.queryVisibleSymbols({
    scopeId: scope.scopeId,
    symbolKinds: BINDABLE_SYMBOL_KINDS,
    expectedSnapshotIdentity: input.semanticIndex.snapshotIdentity,
  });
  if (result.status !== 'resolved') {
    return Object.freeze({
      location: input.location,
      status: result.status === 'stale' ? 'stale' : 'unavailable',
      scopeId: scope.scopeId,
      candidates: Object.freeze([]),
    });
  }
  const candidates = Object.freeze(
    result.symbols
      .flatMap((symbol) => {
        const candidate = projectCandidate(
          input.workspace.id,
          input.documentId,
          input.document,
          symbol,
          scope.localCollectionSymbolIds
        );
        return candidate ? [candidate] : [];
      })
      .filter(
        (candidate, position, all) =>
          all.findIndex(
            (current) =>
              bindingIdentity(current.binding) ===
              bindingIdentity(candidate.binding)
          ) === position
      )
      .sort(compareCandidates)
  );
  return Object.freeze({
    location: input.location,
    status: 'ready',
    scopeId: scope.scopeId,
    candidates,
  });
};

const projectCandidateScopes = (input: {
  workspace: WorkspaceSnapshot;
  semanticIndex: WorkspaceSemanticIndex;
  documentId: string;
  documentType: WorkspacePirDocumentType;
  document: PIRDocument;
  collectionId: string;
}): CollectionInspectorModel['candidateScopes'] =>
  Object.freeze(
    Object.fromEntries(
      PIR_COLLECTION_BINDING_LOCATIONS.map((location) => [
        location,
        projectCandidateScope({ ...input, location }),
      ])
    ) as Record<PIRCollectionBindingLocation, CollectionInspectorCandidateScope>
  );

const unavailable = (
  reason: Extract<
    CollectionInspectorProjectionResult,
    { status: 'unavailable' }
  >['reason'],
  message: string
): CollectionInspectorProjectionResult =>
  Object.freeze({ status: 'unavailable', reason, message });

/**
 * Projects a canonical Collection and its revision-bound semantic scopes into
 * a read model. Mutations stay outside this module and must enter Workspace
 * Command/Transaction through the caller's explicit callbacks.
 */
export const createCollectionInspectorModel = (
  input: CreateCollectionInspectorModelInput
): CollectionInspectorProjectionResult => {
  const read = selectWorkspacePirDocument(
    input.workspace,
    input.location.documentId
  );
  if (!read) {
    return unavailable(
      'document-missing',
      `PIR document "${input.location.documentId}" is not in this Workspace.`
    );
  }
  if (read.status !== 'valid') {
    return unavailable(
      'document-invalid',
      `Document "${input.location.documentId}" is not a valid PIR-current document.`
    );
  }
  const node = read.decodedContent.ui.graph.nodesById[input.location.nodeId];
  if (!node) {
    return unavailable(
      'node-missing',
      `PIR node "${input.location.nodeId}" does not exist.`
    );
  }
  if (node.kind !== 'collection') {
    return unavailable(
      'node-not-collection',
      `PIR node "${input.location.nodeId}" is not a Collection.`
    );
  }

  let semanticIndex = input.semanticIndex ?? undefined;
  let semanticStatus: CollectionInspectorSemanticStatus;
  if (
    semanticIndex &&
    !isIndexBoundToWorkspace(semanticIndex, input.workspace)
  ) {
    semanticIndex = undefined;
    semanticStatus = Object.freeze({
      status: 'unavailable',
      reason: 'index-stale',
      messages: Object.freeze([
        'Workspace Semantic Index does not match the current Workspace revisions.',
      ]),
    });
  } else if (semanticIndex) {
    semanticStatus = Object.freeze({ status: 'ready' });
  } else if (input.semanticIndex === null) {
    semanticStatus = Object.freeze({
      status: 'unavailable',
      reason: 'index-build-blocked',
      messages: Object.freeze(['Workspace Semantic Index is unavailable.']),
    });
  } else {
    const composition = createWorkspaceCodeLanguageEnvironment(
      input.workspace
    ).semanticComposition;
    if (composition.status === 'ready') {
      semanticIndex = composition.index;
      semanticStatus = Object.freeze({ status: 'ready' });
    } else {
      semanticStatus = Object.freeze({
        status: 'unavailable',
        reason: 'index-build-blocked',
        messages: Object.freeze(
          composition.issues.map((issue) => issue.message)
        ),
      });
    }
  }

  const candidateScopes = semanticIndex
    ? projectCandidateScopes({
        workspace: input.workspace,
        semanticIndex,
        documentId: input.location.documentId,
        documentType: read.document.type,
        document: read.decodedContent,
        collectionId: node.id,
      })
    : unavailableCandidateScopes(
        semanticStatus.status === 'unavailable' &&
          semanticStatus.reason === 'index-stale'
          ? 'stale'
          : 'unavailable'
      );

  return Object.freeze({
    status: 'ready',
    model: Object.freeze({
      location: input.location,
      document: read.decodedContent,
      collection: node,
      source: projectSource(node.source),
      key: projectKey(node.key),
      symbols: Object.freeze({
        item: Object.freeze({
          role: 'item',
          id: node.symbols.itemId,
          name: node.symbols.itemName,
          editableName: true,
        }),
        index: Object.freeze({
          role: 'index',
          id: node.symbols.indexId,
          name: node.symbols.indexName,
          editableName: true,
        }),
        ...(node.symbols.errorId
          ? {
              error: Object.freeze({
                role: 'error' as const,
                id: node.symbols.errorId,
                name: 'error',
                editableName: false,
              }),
            }
          : {}),
      }),
      regions: projectRegions(read.decodedContent, node.id),
      candidateScopes,
      semanticStatus,
    }),
  });
};
