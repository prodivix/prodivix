import type {
  PIRCollectionNode,
  PIRDocument,
  PIRElementNode,
  PIRNode,
  PIRTriggerBinding,
  PIRUiGraph,
  PIRValueBinding,
} from '../pir.types';
import {
  insertPirGraphFragment,
  type PIRGraphFragment,
} from './pirGraphFragmentMutation';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  collectPirSubtreeNodeIds,
  createPirMutationIssue,
  findPirNodePlacement,
  freezePirMutationIssues,
  resolvePirGraphPlacement,
  type PIRComponentMutationIssue,
  type PIRGraphPlacementTarget,
  type PIRResolvedGraphPlacement,
} from './pirMutationGraph';
import {
  validatePirMutationDocument,
  validatePirPlacementTargetInput,
} from './pirMutationValidation';

type PIRGraphMutationFailure = Readonly<{
  ok: false;
  changed: false;
  issues: readonly PIRComponentMutationIssue[];
}>;

export type MovePIRGraphSubtreeInput = Readonly<{
  document: PIRDocument;
  nodeId: string;
  target: PIRGraphPlacementTarget;
}>;

export type MovePIRGraphSubtreeResult =
  | Readonly<{
      ok: true;
      changed: boolean;
      document: PIRDocument;
      nodeId: string;
      placement: PIRResolvedGraphPlacement;
    }>
  | PIRGraphMutationFailure;

export type DeletePIRGraphSubtreeInput = Readonly<{
  document: PIRDocument;
  nodeId: string;
}>;

export type DeletePIRGraphSubtreeResult =
  | Readonly<{
      ok: true;
      changed: true;
      document: PIRDocument;
      deletedNodeIds: readonly string[];
    }>
  | PIRGraphMutationFailure;

export type PIRGraphDuplicateIdKind = 'node' | 'collection-symbol';

export type DuplicatePIRGraphSubtreeInput = Readonly<{
  document: PIRDocument;
  nodeId: string;
  target: PIRGraphPlacementTarget;
  createId: (kind: PIRGraphDuplicateIdKind, sourceId: string) => string;
}>;

export type DuplicatePIRGraphSubtreeResult =
  | Readonly<{
      ok: true;
      changed: true;
      document: PIRDocument;
      sourceNodeId: string;
      duplicatedRootNodeId: string;
      insertedNodeIds: readonly string[];
      placement: PIRResolvedGraphPlacement;
    }>
  | PIRGraphMutationFailure;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const failure = (
  issues: readonly PIRComponentMutationIssue[]
): PIRGraphMutationFailure =>
  Object.freeze({
    ok: false,
    changed: false,
    issues: freezePirMutationIssues(issues),
  });

const invalidSubtree = (path: string, message: string) =>
  failure([
    createPirMutationIssue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidSubtreeOperation,
      path,
      message
    ),
  ]);

const validateSourceNode = (
  document: PIRDocument,
  nodeId: string
):
  | Readonly<{ ok: true; document: PIRDocument; graph: PIRUiGraph }>
  | PIRGraphMutationFailure => {
  const source = validatePirMutationDocument(document, 'source');
  if (!source.ok) return failure(source.issues);
  if (!nodeId.trim() || !source.document.ui.graph.nodesById[nodeId]) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
        '/nodeId',
        'Subtree root does not exist in the PIR graph.'
      ),
    ]);
  }
  if (source.document.ui.graph.rootId === nodeId) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.rootReplacement,
        '/nodeId',
        'The document root cannot be moved, deleted, or duplicated as a sibling.'
      ),
    ]);
  }
  return {
    ok: true,
    document: source.document,
    graph: source.document.ui.graph,
  };
};

const withValidatedGraph = (
  document: PIRDocument,
  graph: PIRUiGraph
): PIRDocument | PIRGraphMutationFailure => {
  const result = validatePirMutationDocument(
    { ...document, ui: { ...document.ui, graph } },
    'result'
  );
  return result.ok ? result.document : failure(result.issues);
};

const isMutationFailure = (
  value: PIRDocument | PIRGraphMutationFailure
): value is PIRGraphMutationFailure => 'ok' in value && value.ok === false;

const samePlacementContainer = (
  left: PIRResolvedGraphPlacement,
  right: PIRResolvedGraphPlacement
): boolean =>
  left.parentId === right.parentId && left.regionName === right.regionName;

const removeNodeFromPlacements = (
  graph: PIRUiGraph,
  nodeId: string
): Readonly<{
  childIdsById: Record<string, readonly string[]>;
  regionsById: Record<string, Record<string, readonly string[]>>;
}> => ({
  childIdsById: Object.fromEntries(
    Object.entries(graph.childIdsById).map(([ownerId, childIds]) => [
      ownerId,
      childIds.filter((childId) => childId !== nodeId),
    ])
  ),
  regionsById: Object.fromEntries(
    Object.entries(graph.regionsById ?? {}).map(([ownerId, regions]) => [
      ownerId,
      Object.fromEntries(
        Object.entries(regions).map(([regionName, childIds]) => [
          regionName,
          childIds.filter((childId) => childId !== nodeId),
        ])
      ),
    ])
  ),
});

const insertNodeAtPlacement = (
  placements: ReturnType<typeof removeNodeFromPlacements>,
  placement: PIRResolvedGraphPlacement,
  nodeId: string
): void => {
  if (placement.regionName === undefined) {
    const current = placements.childIdsById[placement.parentId] ?? [];
    placements.childIdsById[placement.parentId] = [
      ...current.slice(0, placement.index),
      nodeId,
      ...current.slice(placement.index),
    ];
    return;
  }
  const regions = placements.regionsById[placement.parentId] ?? {};
  const current = regions[placement.regionName] ?? [];
  placements.regionsById[placement.parentId] = {
    ...regions,
    [placement.regionName]: [
      ...current.slice(0, placement.index),
      nodeId,
      ...current.slice(placement.index),
    ],
  };
};

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

/** Moves one complete normalized subtree to a canonical child or region slot. */
export const movePirGraphSubtree = (
  input: MovePIRGraphSubtreeInput
): MovePIRGraphSubtreeResult => {
  const source = validateSourceNode(input.document, input.nodeId);
  if (!source.ok) return source;
  const targetShapeIssues = validatePirPlacementTargetInput(input.target);
  const target = resolvePirGraphPlacement(source.graph, input.target);
  if (targetShapeIssues.length > 0 || !target.ok) {
    return failure([...targetShapeIssues, ...(target.ok ? [] : target.issues)]);
  }
  const subtreeIds = new Set(
    collectPirSubtreeNodeIds(source.graph, input.nodeId)
  );
  if (subtreeIds.has(target.placement.parentId)) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.cyclicPlacement,
        '/target/parentId',
        'A subtree cannot be moved into itself or one of its descendants.'
      ),
    ]);
  }
  const previous = findPirNodePlacement(source.graph, input.nodeId);
  if (!previous) {
    return invalidSubtree(
      '/nodeId',
      'The subtree root does not have one canonical parent placement.'
    );
  }
  const placement = Object.freeze({
    ...target.placement,
    index:
      samePlacementContainer(previous, target.placement) &&
      previous.index < target.placement.index
        ? target.placement.index - 1
        : target.placement.index,
  });
  if (
    samePlacementContainer(previous, placement) &&
    previous.index === placement.index
  ) {
    return Object.freeze({
      ok: true,
      changed: false,
      document: source.document,
      nodeId: input.nodeId,
      placement: previous,
    });
  }

  const placements = removeNodeFromPlacements(source.graph, input.nodeId);
  insertNodeAtPlacement(placements, placement, input.nodeId);
  const candidate = withValidatedGraph(source.document, {
    ...withCanonicalRegions(source.graph, placements.regionsById),
    childIdsById: placements.childIdsById,
  });
  if (isMutationFailure(candidate)) return candidate;
  return Object.freeze({
    ok: true,
    changed: true,
    document: candidate,
    nodeId: input.nodeId,
    placement,
  });
};

/** Deletes one complete non-root subtree without leaving dangling graph edges. */
export const deletePirGraphSubtree = (
  input: DeletePIRGraphSubtreeInput
): DeletePIRGraphSubtreeResult => {
  const source = validateSourceNode(input.document, input.nodeId);
  if (!source.ok) return source;
  if (!findPirNodePlacement(source.graph, input.nodeId)) {
    return invalidSubtree(
      '/nodeId',
      'The subtree root does not have one canonical parent placement.'
    );
  }
  const deletedNodeIds = collectPirSubtreeNodeIds(source.graph, input.nodeId);
  const deleted = new Set(deletedNodeIds);
  const graph: PIRUiGraph = withCanonicalRegions(
    {
      ...source.graph,
      nodesById: Object.fromEntries(
        Object.entries(source.graph.nodesById).filter(
          ([nodeId]) => !deleted.has(nodeId)
        )
      ),
      childIdsById: Object.fromEntries(
        Object.entries(source.graph.childIdsById)
          .filter(([ownerId]) => !deleted.has(ownerId))
          .map(([ownerId, childIds]) => [
            ownerId,
            childIds.filter((childId) => !deleted.has(childId)),
          ])
      ),
    },
    Object.fromEntries(
      Object.entries(source.graph.regionsById ?? {})
        .filter(([ownerId]) => !deleted.has(ownerId))
        .map(([ownerId, regions]) => [
          ownerId,
          Object.fromEntries(
            Object.entries(regions).map(([regionName, childIds]) => [
              regionName,
              childIds.filter((childId) => !deleted.has(childId)),
            ])
          ),
        ])
    )
  );
  const candidate = withValidatedGraph(source.document, graph);
  if (isMutationFailure(candidate)) return candidate;
  return Object.freeze({
    ok: true,
    changed: true,
    document: candidate,
    deletedNodeIds,
  });
};

const rewriteValueBinding = (
  binding: PIRValueBinding,
  nodeIds: ReadonlyMap<string, string>,
  symbolIds: ReadonlyMap<string, string>
): PIRValueBinding => {
  if (binding.kind === 'data') {
    const dataId = nodeIds.get(binding.dataId);
    return dataId ? { ...binding, dataId } : binding;
  }
  if (binding.kind === 'collection-symbol') {
    const symbolId = symbolIds.get(binding.symbolId);
    return symbolId ? { ...binding, symbolId } : binding;
  }
  return binding;
};

const rewriteTrigger = (
  trigger: PIRTriggerBinding,
  nodeIds: ReadonlyMap<string, string>,
  symbolIds: ReadonlyMap<string, string>
): PIRTriggerBinding =>
  trigger.kind === 'emit-component-event' && trigger.payload
    ? {
        ...trigger,
        payload: rewriteValueBinding(trigger.payload, nodeIds, symbolIds),
      }
    : trigger;

const rewriteBindingsRecord = (
  values: Readonly<Record<string, PIRValueBinding>>,
  nodeIds: ReadonlyMap<string, string>,
  symbolIds: ReadonlyMap<string, string>
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      rewriteValueBinding(value, nodeIds, symbolIds),
    ])
  );

const duplicateElementNode = (
  node: PIRElementNode,
  id: string,
  nodeIds: ReadonlyMap<string, string>,
  symbolIds: ReadonlyMap<string, string>
): PIRElementNode => ({
  ...node,
  id,
  ...(node.text
    ? { text: rewriteValueBinding(node.text, nodeIds, symbolIds) }
    : {}),
  ...(node.style
    ? { style: rewriteBindingsRecord(node.style, nodeIds, symbolIds) }
    : {}),
  ...(node.props
    ? { props: rewriteBindingsRecord(node.props, nodeIds, symbolIds) }
    : {}),
  ...(node.data
    ? {
        data: {
          ...node.data,
          ...(node.data.source
            ? {
                source: rewriteValueBinding(
                  node.data.source,
                  nodeIds,
                  symbolIds
                ),
              }
            : {}),
          ...(node.data.value
            ? {
                value: rewriteValueBinding(node.data.value, nodeIds, symbolIds),
              }
            : {}),
          ...(node.data.mock
            ? {
                mock: rewriteValueBinding(node.data.mock, nodeIds, symbolIds),
              }
            : {}),
          ...(node.data.extend
            ? {
                extend: rewriteBindingsRecord(
                  node.data.extend,
                  nodeIds,
                  symbolIds
                ),
              }
            : {}),
        },
      }
    : {}),
  ...(node.events
    ? {
        events: Object.fromEntries(
          Object.entries(node.events).map(([eventName, trigger]) => [
            eventName,
            rewriteTrigger(trigger, nodeIds, symbolIds),
          ])
        ),
      }
    : {}),
});

const duplicateCollectionNode = (
  node: PIRCollectionNode,
  id: string,
  symbolIds: ReadonlyMap<string, string>,
  nodeIds: ReadonlyMap<string, string>
): PIRCollectionNode => ({
  ...node,
  id,
  source:
    node.source.kind === 'literal'
      ? node.source
      : {
          kind: 'binding',
          value: rewriteValueBinding(node.source.value, nodeIds, symbolIds),
        },
  key:
    node.key.kind === 'index'
      ? node.key
      : {
          kind: 'binding',
          value: rewriteValueBinding(node.key.value, nodeIds, symbolIds),
        },
  symbols: {
    ...node.symbols,
    itemId: symbolIds.get(node.symbols.itemId)!,
    indexId: symbolIds.get(node.symbols.indexId)!,
    ...(node.symbols.errorId
      ? { errorId: symbolIds.get(node.symbols.errorId)! }
      : {}),
  },
});

const duplicateNode = (
  node: PIRNode,
  nodeIds: ReadonlyMap<string, string>,
  symbolIds: ReadonlyMap<string, string>
): PIRNode => {
  const id = nodeIds.get(node.id)!;
  if (node.kind === 'element') {
    return duplicateElementNode(node, id, nodeIds, symbolIds);
  }
  if (node.kind === 'collection') {
    return duplicateCollectionNode(node, id, symbolIds, nodeIds);
  }
  if (node.kind === 'component-instance') {
    return {
      ...node,
      id,
      bindings: {
        props: rewriteBindingsRecord(node.bindings.props, nodeIds, symbolIds),
        events: Object.fromEntries(
          Object.entries(node.bindings.events).map(([memberId, trigger]) => [
            memberId,
            rewriteTrigger(trigger, nodeIds, symbolIds),
          ])
        ),
        variants: node.bindings.variants,
      },
    };
  }
  return {
    ...node,
    id,
    bindings: {
      props: rewriteBindingsRecord(node.bindings.props, nodeIds, symbolIds),
    },
  };
};

const createDuplicateIds = (
  graph: PIRUiGraph,
  sourceNodeIds: readonly string[],
  createId: DuplicatePIRGraphSubtreeInput['createId']
):
  | Readonly<{
      ok: true;
      nodeIds: ReadonlyMap<string, string>;
      symbolIds: ReadonlyMap<string, string>;
    }>
  | PIRGraphMutationFailure => {
  const nodeIds = new Map<string, string>();
  const symbolIds = new Map<string, string>();
  const generated = new Set<string>();
  const issues: PIRComponentMutationIssue[] = [];
  const reserve = (
    kind: PIRGraphDuplicateIdKind,
    sourceId: string,
    id: string,
    existing: boolean
  ): string => {
    if (!id.trim() || id !== id.trim() || existing || generated.has(id)) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict,
          `/createId/${kind}/${sourceId}`,
          `Duplicate ${kind} ids must be canonical and unique in the document.`
        )
      );
    }
    generated.add(id);
    return id;
  };
  for (const sourceId of [...sourceNodeIds].sort(compareText)) {
    const id = createId('node', sourceId);
    nodeIds.set(
      sourceId,
      reserve('node', sourceId, id, Boolean(graph.nodesById[id]))
    );
  }
  const existingSymbols = new Set<string>();
  for (const node of Object.values(graph.nodesById)) {
    if (node.kind !== 'collection') continue;
    existingSymbols.add(node.symbols.itemId);
    existingSymbols.add(node.symbols.indexId);
    if (node.symbols.errorId) existingSymbols.add(node.symbols.errorId);
  }
  for (const sourceNodeId of sourceNodeIds) {
    const node = graph.nodesById[sourceNodeId];
    if (node?.kind !== 'collection') continue;
    for (const symbolId of [
      node.symbols.itemId,
      node.symbols.indexId,
      ...(node.symbols.errorId ? [node.symbols.errorId] : []),
    ]) {
      const id = createId('collection-symbol', symbolId);
      symbolIds.set(
        symbolId,
        reserve('collection-symbol', symbolId, id, existingSymbols.has(id))
      );
    }
  }
  return issues.length > 0
    ? failure(issues)
    : Object.freeze({ ok: true, nodeIds, symbolIds });
};

/** Duplicates one normalized subtree and rewrites its internal node/symbol identities. */
export const duplicatePirGraphSubtree = (
  input: DuplicatePIRGraphSubtreeInput
): DuplicatePIRGraphSubtreeResult => {
  const source = validateSourceNode(input.document, input.nodeId);
  if (!source.ok) return source;
  const sourceNodeIds = collectPirSubtreeNodeIds(source.graph, input.nodeId);
  const ids = createDuplicateIds(source.graph, sourceNodeIds, input.createId);
  if (!ids.ok) return ids;
  const rootNodeId = ids.nodeIds.get(input.nodeId)!;
  const fragment: PIRGraphFragment = {
    rootNodeIds: [rootNodeId],
    primaryNodeId: rootNodeId,
    nodesById: Object.fromEntries(
      sourceNodeIds.map((sourceNodeId) => {
        const node = source.graph.nodesById[sourceNodeId]!;
        const duplicated = duplicateNode(node, ids.nodeIds, ids.symbolIds);
        return [duplicated.id, duplicated];
      })
    ),
    childIdsById: Object.fromEntries(
      sourceNodeIds.map((sourceNodeId) => [
        ids.nodeIds.get(sourceNodeId)!,
        (source.graph.childIdsById[sourceNodeId] ?? []).map((childId) =>
          ids.nodeIds.get(childId)!
        ),
      ])
    ),
    regionsById: Object.fromEntries(
      sourceNodeIds.flatMap((sourceNodeId) => {
        const regions = source.graph.regionsById?.[sourceNodeId];
        return regions
          ? [
              [
                ids.nodeIds.get(sourceNodeId)!,
                Object.fromEntries(
                  Object.entries(regions).map(([regionName, childIds]) => [
                    regionName,
                    childIds.map((childId) => ids.nodeIds.get(childId)!),
                  ])
                ),
              ] as const,
            ]
          : [];
      })
    ),
  };
  const inserted = insertPirGraphFragment({
    document: source.document,
    fragment,
    target: input.target,
  });
  if (!inserted.ok) return failure(inserted.issues);
  return Object.freeze({
    ok: true,
    changed: true,
    document: inserted.document,
    sourceNodeId: input.nodeId,
    duplicatedRootNodeId: rootNodeId,
    insertedNodeIds: inserted.insertedNodeIds,
    placement: inserted.placement,
  });
};
