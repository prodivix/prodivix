import type {
  PIRCollectionNode,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRUiGraph,
} from '../pir.types';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  createPirMutationIssue,
  freezePirMutationIssues,
  resolvePirGraphPlacement,
  type PIRCollectionRegions,
  type PIRComponentMutationIssue,
  type PIRGraphPlacementTarget,
  type PIRResolvedGraphPlacement,
} from './pirMutationGraph';
import {
  validatePirComponentInstanceInput,
  validatePirMutationDocument,
  validatePirPlacementTargetInput,
} from './pirMutationValidation';
import { resolvePirCollectionRegions } from './pirSlotRegionMutation';

export type PIRComponentInstanceBindings = PIRComponentInstanceNode['bindings'];

export type UpdatePIRComponentInstanceBindingsInput = Readonly<{
  document: PIRDocument;
  nodeId: string;
  bindings: PIRComponentInstanceBindings;
}>;

export type InsertPIRCollectionInput = Readonly<{
  document: PIRDocument;
  collection: PIRCollectionNode;
  target: PIRGraphPlacementTarget;
  regions?: PIRCollectionRegions;
}>;

export type UpdatePIRCollectionInput = Readonly<{
  document: PIRDocument;
  collection: PIRCollectionNode;
  regions?: PIRCollectionRegions;
}>;

type MutationFailure = Readonly<{
  ok: false;
  changed: false;
  issues: readonly PIRComponentMutationIssue[];
}>;

type NodeUpdateSuccess<Node> = Readonly<{
  ok: true;
  changed: boolean;
  document: PIRDocument;
  node: Node;
}>;

type CollectionInsertionSuccess = Readonly<{
  ok: true;
  changed: true;
  document: PIRDocument;
  node: PIRCollectionNode;
  placement: PIRResolvedGraphPlacement;
  relocatedChildNodeIds: readonly string[];
}>;

export type UpdatePIRComponentInstanceBindingsResult =
  NodeUpdateSuccess<PIRComponentInstanceNode> | MutationFailure;

export type InsertPIRCollectionResult =
  CollectionInsertionSuccess | MutationFailure;

export type UpdatePIRCollectionResult =
  NodeUpdateSuccess<PIRCollectionNode> | MutationFailure;

const failure = (
  issues: readonly PIRComponentMutationIssue[]
): MutationFailure =>
  Object.freeze({
    ok: false,
    changed: false,
    issues: freezePirMutationIssues(issues),
  });

const validateResultDocument = (
  document: PIRDocument
): PIRDocument | MutationFailure => {
  const result = validatePirMutationDocument(document, 'result');
  return result.ok ? result.document : failure(result.issues);
};

const isMutationFailure = (
  value: PIRDocument | MutationFailure
): value is MutationFailure => 'ok' in value && value.ok === false;

const withGraph = (document: PIRDocument, graph: PIRUiGraph): PIRDocument => ({
  ...document,
  ui: { ...document.ui, graph },
});

const compareGraph = (left: PIRUiGraph, right: PIRUiGraph): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const cloneRegions = (
  graph: PIRUiGraph
): Record<string, Record<string, readonly string[]>> =>
  Object.fromEntries(
    Object.entries(graph.regionsById ?? {}).map(([ownerId, regions]) => [
      ownerId,
      Object.fromEntries(
        Object.entries(regions).map(([regionName, childIds]) => [
          regionName,
          [...childIds],
        ])
      ),
    ])
  );

const withoutRelocatedChildren = (
  graph: PIRUiGraph,
  relocatedChildNodeIds: readonly string[]
): Readonly<{
  childIdsById: Record<string, readonly string[]>;
  regionsById: Record<string, Record<string, readonly string[]>>;
}> => {
  const relocated = new Set(relocatedChildNodeIds);
  const childIdsById = Object.fromEntries(
    Object.entries(graph.childIdsById).map(([ownerId, childIds]) => [
      ownerId,
      childIds.filter((childId) => !relocated.has(childId)),
    ])
  );
  const regionsById = cloneRegions(graph);
  for (const [ownerId, regions] of Object.entries(regionsById)) {
    regionsById[ownerId] = Object.fromEntries(
      Object.entries(regions).map(([regionName, childIds]) => [
        regionName,
        childIds.filter((childId) => !relocated.has(childId)),
      ])
    );
  }
  return { childIdsById, regionsById };
};

const insertId = (
  values: readonly string[],
  index: number,
  nodeId: string
): readonly string[] => [
  ...values.slice(0, index),
  nodeId,
  ...values.slice(index),
];

const withCanonicalRegions = (
  graph: PIRUiGraph,
  regionsById: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >
): PIRUiGraph => {
  const { regionsById: _previous, ...withoutRegions } = graph;
  return {
    ...withoutRegions,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
  };
};

const insertCollectionGraph = (
  graph: PIRUiGraph,
  collection: PIRCollectionNode,
  regions: PIRCollectionRegions,
  relocatedChildNodeIds: readonly string[],
  placement: PIRResolvedGraphPlacement
): PIRUiGraph => {
  const mutable = withoutRelocatedChildren(graph, relocatedChildNodeIds);
  mutable.childIdsById[collection.id] = [];
  mutable.regionsById[collection.id] = { ...regions };
  if (placement.regionName === undefined) {
    mutable.childIdsById[placement.parentId] = insertId(
      mutable.childIdsById[placement.parentId] ?? [],
      placement.index,
      collection.id
    );
  } else {
    mutable.regionsById[placement.parentId] = {
      ...mutable.regionsById[placement.parentId],
      [placement.regionName]: insertId(
        mutable.regionsById[placement.parentId]?.[placement.regionName] ?? [],
        placement.index,
        collection.id
      ),
    };
  }
  return {
    ...withCanonicalRegions(graph, mutable.regionsById),
    nodesById: { ...graph.nodesById, [collection.id]: collection },
    childIdsById: mutable.childIdsById,
  };
};

const updateCollectionGraph = (
  graph: PIRUiGraph,
  collection: PIRCollectionNode,
  regions: PIRCollectionRegions | undefined,
  relocatedChildNodeIds: readonly string[]
): PIRUiGraph => {
  if (!regions) {
    return {
      ...graph,
      nodesById: { ...graph.nodesById, [collection.id]: collection },
    };
  }
  const mutable = withoutRelocatedChildren(graph, relocatedChildNodeIds);
  mutable.regionsById[collection.id] = { ...regions };
  return {
    ...withCanonicalRegions(graph, mutable.regionsById),
    nodesById: { ...graph.nodesById, [collection.id]: collection },
    childIdsById: mutable.childIdsById,
  };
};

const invalidCollection = (path: string, message: string): MutationFailure =>
  failure([
    createPirMutationIssue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidCollection,
      path,
      message
    ),
  ]);

/** Replaces a Component Instance's complete typed Contract binding maps. */
export const updatePirComponentInstanceBindings = (
  input: UpdatePIRComponentInstanceBindingsInput
): UpdatePIRComponentInstanceBindingsResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const current = source.document.ui.graph.nodesById[input.nodeId];
  if (!current) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
        '/nodeId',
        'Component Instance node does not exist in the PIR graph.'
      ),
    ]);
  }
  if (current.kind !== 'component-instance') {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidInstance,
        '/nodeId',
        'Bindings can only be updated on a Component Instance node.'
      ),
    ]);
  }
  const validated = validatePirComponentInstanceInput({
    ...current,
    bindings: input.bindings,
  });
  if (!validated.ok) return failure(validated.issues);
  const graph: PIRUiGraph = {
    ...source.document.ui.graph,
    nodesById: {
      ...source.document.ui.graph.nodesById,
      [input.nodeId]: validated.instance,
    },
  };
  const next = validateResultDocument(withGraph(source.document, graph));
  if (isMutationFailure(next)) return next;
  const changed = !compareGraph(source.document.ui.graph, next.ui.graph);
  return Object.freeze({
    ok: true,
    changed,
    document: changed ? next : source.document,
    node: (changed ? next : source.document).ui.graph.nodesById[
      input.nodeId
    ] as PIRComponentInstanceNode,
  });
};

/** Inserts a first-class Collection and atomically relocates initial regions. */
export const insertPirCollection = (
  input: InsertPIRCollectionInput
): InsertPIRCollectionResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const collection = input.collection as PIRCollectionNode;
  if (
    !collection ||
    collection.kind !== 'collection' ||
    typeof collection.id !== 'string' ||
    !collection.id.trim()
  ) {
    return invalidCollection(
      '/collection',
      'Collection must be a canonical node with a non-empty id.'
    );
  }
  if (source.document.ui.graph.nodesById[collection.id]) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict,
        '/collection/id',
        'Collection node id already exists in the PIR graph.'
      ),
    ]);
  }
  const targetShapeIssues = validatePirPlacementTargetInput(input.target);
  const placement = resolvePirGraphPlacement(
    source.document.ui.graph,
    input.target
  );
  if (targetShapeIssues.length > 0 || !placement.ok) {
    return failure([
      ...targetShapeIssues,
      ...(placement.ok ? [] : placement.issues),
    ]);
  }
  const regionResolution = resolvePirCollectionRegions(
    source.document.ui.graph,
    input.regions,
    placement.placement
  );
  if (!regionResolution.ok) return failure(regionResolution.issues);
  const next = validateResultDocument(
    withGraph(
      source.document,
      insertCollectionGraph(
        source.document.ui.graph,
        collection,
        regionResolution.value.regions,
        regionResolution.value.relocatedChildNodeIds,
        regionResolution.value.placement
      )
    )
  );
  if (isMutationFailure(next)) return next;
  return Object.freeze({
    ok: true,
    changed: true,
    document: next,
    node: next.ui.graph.nodesById[collection.id] as PIRCollectionNode,
    placement: regionResolution.value.placement,
    relocatedChildNodeIds: regionResolution.value.relocatedChildNodeIds,
  });
};

/** Atomically replaces a Collection node and, when supplied, all state regions. */
export const updatePirCollection = (
  input: UpdatePIRCollectionInput
): UpdatePIRCollectionResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const collection = input.collection as PIRCollectionNode;
  if (
    !collection ||
    collection.kind !== 'collection' ||
    typeof collection.id !== 'string' ||
    !collection.id.trim()
  ) {
    return invalidCollection(
      '/collection',
      'Collection must be a canonical node with a non-empty id.'
    );
  }
  const current = source.document.ui.graph.nodesById[collection.id];
  if (!current) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
        '/collection/id',
        'Collection node does not exist in the PIR graph.'
      ),
    ]);
  }
  if (current.kind !== 'collection') {
    return invalidCollection(
      '/collection/id',
      'Collection update target must already be a Collection node.'
    );
  }
  let regions = input.regions;
  let relocatedChildNodeIds: readonly string[] = Object.freeze([]);
  if (regions) {
    const resolution = resolvePirCollectionRegions(
      source.document.ui.graph,
      regions,
      { parentId: collection.id, index: 0 }
    );
    if (!resolution.ok) return failure(resolution.issues);
    regions = resolution.value.regions;
    relocatedChildNodeIds = resolution.value.relocatedChildNodeIds;
  }
  const next = validateResultDocument(
    withGraph(
      source.document,
      updateCollectionGraph(
        source.document.ui.graph,
        collection,
        regions,
        relocatedChildNodeIds
      )
    )
  );
  if (isMutationFailure(next)) return next;
  const changed = !compareGraph(source.document.ui.graph, next.ui.graph);
  return Object.freeze({
    ok: true,
    changed,
    document: changed ? next : source.document,
    node: (changed ? next : source.document).ui.graph.nodesById[
      collection.id
    ] as PIRCollectionNode,
  });
};

export type { PIRCollectionRegions } from './pirMutationGraph';
