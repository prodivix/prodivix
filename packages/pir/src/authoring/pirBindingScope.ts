import {
  createComponentScopeId,
  createComponentSlotScopeId,
  createPirCollectionErrorScopeId,
  createPirCollectionScopeId,
  createPirNodeScopeId,
  createWorkspaceDocumentScopeId,
  type WorkspaceScopeKind,
} from '@prodivix/authoring';
import type { PIRDocument, PIRUiGraph } from '../pir.types';

export const PIR_COLLECTION_BINDING_LOCATIONS = Object.freeze([
  'source',
  'key',
  'item',
  'empty',
  'loading',
  'error',
] as const);

export type PIRCollectionBindingLocation =
  (typeof PIR_COLLECTION_BINDING_LOCATIONS)[number];

export type PIRBindingScopeDocumentType =
  'pir-page' | 'pir-layout' | 'pir-component';

export type PIRBindingScopeOwner =
  | Readonly<{ kind: 'workspace-document'; documentId: string }>
  | Readonly<{ kind: 'component-definition'; documentId: string }>
  | Readonly<{ kind: 'pir-node'; nodeId: string }>
  | Readonly<{
      kind: 'component-slot';
      instanceNodeId: string;
      componentDocumentId: string;
      slotMemberId: string;
    }>
  | Readonly<{ kind: 'collection-item'; collectionNodeId: string }>
  | Readonly<{ kind: 'collection-error'; collectionNodeId: string }>;

export type PIRBindingScopeDescriptor = Readonly<{
  scopeId: string;
  scopeKind: WorkspaceScopeKind;
  owner: PIRBindingScopeOwner;
}>;

export type PIRCollectionBindingScopeDescriptor = PIRBindingScopeDescriptor &
  Readonly<{
    collectionNodeId: string;
    location: PIRCollectionBindingLocation;
    localCollectionSymbolIds: readonly string[];
  }>;

export type CreatePIRBindingScopeResolverInput = Readonly<{
  workspaceId: string;
  documentId: string;
  documentType: PIRBindingScopeDocumentType;
  document: PIRDocument;
}>;

export type ResolvePIRCollectionBindingScopeInput =
  CreatePIRBindingScopeResolverInput &
    Readonly<{
      collectionNodeId: string;
      location: PIRCollectionBindingLocation;
    }>;

export type PIRBindingScopeResolver = Readonly<{
  baseScope: PIRBindingScopeDescriptor;
  resolveNodeParentScope(nodeId: string): PIRBindingScopeDescriptor | undefined;
  resolveCollectionBindingScope(
    collectionNodeId: string,
    location: PIRCollectionBindingLocation
  ): PIRCollectionBindingScopeDescriptor | undefined;
}>;

type ParentPlacement = Readonly<{
  ownerNodeId: string;
  regionName?: string;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <Value>(
  value: Readonly<Record<string, Value>>
): Array<[string, Value]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const buildParentPlacements = (
  graph: PIRUiGraph
): ReadonlyMap<string, ParentPlacement> => {
  const placements = new Map<string, ParentPlacement>();
  for (const [ownerNodeId, childIds] of sortedEntries(graph.childIdsById)) {
    for (const childId of childIds) placements.set(childId, { ownerNodeId });
  }
  for (const [ownerNodeId, regions] of sortedEntries(graph.regionsById ?? {})) {
    for (const [regionName, childIds] of sortedEntries(regions)) {
      for (const childId of childIds) {
        placements.set(childId, { ownerNodeId, regionName });
      }
    }
  }
  return placements;
};

const freezeScope = (
  scopeId: string,
  scopeKind: WorkspaceScopeKind,
  owner: PIRBindingScopeOwner
): PIRBindingScopeDescriptor =>
  Object.freeze({ scopeId, scopeKind, owner: Object.freeze(owner) });

/**
 * Builds the canonical lexical-scope resolver shared by semantic indexing and
 * current authoring surfaces. Callers select scopes; they never infer graph
 * ancestry, Collection state visibility, or Component slot ownership.
 */
export const createPirBindingScopeResolver = (
  input: CreatePIRBindingScopeResolverInput
): PIRBindingScopeResolver => {
  const graph = input.document.ui.graph;
  const placements = buildParentPlacements(graph);
  const baseScope =
    input.documentType === 'pir-component'
      ? freezeScope(
          createComponentScopeId(input.workspaceId, input.documentId),
          'component',
          { kind: 'component-definition', documentId: input.documentId }
        )
      : freezeScope(
          createWorkspaceDocumentScopeId(input.workspaceId, input.documentId),
          'document',
          { kind: 'workspace-document', documentId: input.documentId }
        );
  const parentScopeByNodeId = new Map<string, PIRBindingScopeDescriptor>();

  const resolveNodeParentScope = (
    nodeId: string,
    visiting = new Set<string>()
  ): PIRBindingScopeDescriptor | undefined => {
    if (!graph.nodesById[nodeId]) return undefined;
    const cached = parentScopeByNodeId.get(nodeId);
    if (cached) return cached;
    if (nodeId === graph.rootId || visiting.has(nodeId)) return baseScope;

    visiting.add(nodeId);
    const placement = placements.get(nodeId);
    const owner = placement
      ? graph.nodesById[placement.ownerNodeId]
      : undefined;
    let scope = baseScope;
    if (placement && owner?.kind === 'collection') {
      if (placement.regionName === 'item') {
        scope = freezeScope(
          createPirCollectionScopeId(
            input.workspaceId,
            input.documentId,
            placement.ownerNodeId
          ),
          'collection-item',
          { kind: 'collection-item', collectionNodeId: placement.ownerNodeId }
        );
      } else if (placement.regionName === 'error' && owner.symbols.errorId) {
        scope = freezeScope(
          createPirCollectionErrorScopeId(
            input.workspaceId,
            input.documentId,
            placement.ownerNodeId
          ),
          'collection-error',
          { kind: 'collection-error', collectionNodeId: placement.ownerNodeId }
        );
      } else if (
        placement.regionName === 'empty' ||
        placement.regionName === 'loading' ||
        placement.regionName === 'error'
      ) {
        scope =
          resolveNodeParentScope(placement.ownerNodeId, visiting) ?? baseScope;
      }
    } else if (
      placement &&
      owner?.kind === 'component-instance' &&
      placement.regionName !== undefined
    ) {
      scope = freezeScope(
        createComponentSlotScopeId(
          input.workspaceId,
          owner.componentDocumentId,
          placement.regionName
        ),
        'component-slot',
        {
          kind: 'component-slot',
          instanceNodeId: placement.ownerNodeId,
          componentDocumentId: owner.componentDocumentId,
          slotMemberId: placement.regionName,
        }
      );
    } else if (placement && owner) {
      scope = freezeScope(
        createPirNodeScopeId(
          input.workspaceId,
          input.documentId,
          placement.ownerNodeId
        ),
        'pir-node',
        { kind: 'pir-node', nodeId: placement.ownerNodeId }
      );
    }
    visiting.delete(nodeId);
    parentScopeByNodeId.set(nodeId, scope);
    return scope;
  };

  const resolveCollectionBindingScope = (
    collectionNodeId: string,
    location: PIRCollectionBindingLocation
  ): PIRCollectionBindingScopeDescriptor | undefined => {
    const collection = graph.nodesById[collectionNodeId];
    if (collection?.kind !== 'collection') return undefined;

    let scope: PIRBindingScopeDescriptor | undefined;
    let localCollectionSymbolIds: readonly string[] = Object.freeze([]);
    if (location === 'key' || location === 'item') {
      scope = freezeScope(
        createPirCollectionScopeId(
          input.workspaceId,
          input.documentId,
          collectionNodeId
        ),
        'collection-item',
        { kind: 'collection-item', collectionNodeId }
      );
      localCollectionSymbolIds = Object.freeze([
        collection.symbols.itemId,
        collection.symbols.indexId,
      ]);
    } else if (location === 'error' && collection.symbols.errorId) {
      scope = freezeScope(
        createPirCollectionErrorScopeId(
          input.workspaceId,
          input.documentId,
          collectionNodeId
        ),
        'collection-error',
        { kind: 'collection-error', collectionNodeId }
      );
      localCollectionSymbolIds = Object.freeze([collection.symbols.errorId]);
    } else {
      scope = resolveNodeParentScope(collectionNodeId);
    }
    if (!scope) return undefined;
    return Object.freeze({
      ...scope,
      collectionNodeId,
      location,
      localCollectionSymbolIds,
    });
  };

  return Object.freeze({
    baseScope,
    resolveNodeParentScope,
    resolveCollectionBindingScope,
  });
};

export const resolvePirCollectionBindingScope = (
  input: ResolvePIRCollectionBindingScopeInput
): PIRCollectionBindingScopeDescriptor | undefined =>
  createPirBindingScopeResolver(input).resolveCollectionBindingScope(
    input.collectionNodeId,
    input.location
  );
