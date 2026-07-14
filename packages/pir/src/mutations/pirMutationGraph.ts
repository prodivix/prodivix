import type { PIRComponentInstanceNode, PIRUiGraph } from '../pir.types';

export const PIR_COMPONENT_MUTATION_ISSUE_CODES = Object.freeze({
  sourceFormatInvalid: 'PIR_MUTATION_SOURCE_FORMAT_INVALID',
  sourceSemanticInvalid: 'PIR_MUTATION_SOURCE_SEMANTIC_INVALID',
  resultFormatInvalid: 'PIR_MUTATION_RESULT_FORMAT_INVALID',
  resultSemanticInvalid: 'PIR_MUTATION_RESULT_SEMANTIC_INVALID',
  invalidId: 'PIR_MUTATION_INVALID_ID',
  invalidInstance: 'PIR_MUTATION_INVALID_INSTANCE',
  unsupportedField: 'PIR_MUTATION_UNSUPPORTED_FIELD',
  nodeIdConflict: 'PIR_MUTATION_NODE_ID_CONFLICT',
  nodeNotFound: 'PIR_MUTATION_NODE_NOT_FOUND',
  rootReplacement: 'PIR_MUTATION_ROOT_REPLACEMENT',
  parentNotFound: 'PIR_MUTATION_PARENT_NOT_FOUND',
  invalidPlacementOwner: 'PIR_MUTATION_INVALID_PLACEMENT_OWNER',
  regionNotFound: 'PIR_MUTATION_REGION_NOT_FOUND',
  invalidPlacementIndex: 'PIR_MUTATION_INVALID_PLACEMENT_INDEX',
  invalidSlotRegion: 'PIR_MUTATION_INVALID_SLOT_REGION',
  slotChildNotFound: 'PIR_MUTATION_SLOT_CHILD_NOT_FOUND',
  duplicateSlotChild: 'PIR_MUTATION_DUPLICATE_SLOT_CHILD',
  invalidSlotChild: 'PIR_MUTATION_INVALID_SLOT_CHILD',
  invalidCollection: 'PIR_MUTATION_INVALID_COLLECTION',
  invalidFragment: 'PIR_MUTATION_INVALID_FRAGMENT',
  invalidSubtreeOperation: 'PIR_MUTATION_INVALID_SUBTREE_OPERATION',
  cyclicPlacement: 'PIR_MUTATION_CYCLIC_PLACEMENT',
  invalidCollectionRegion: 'PIR_MUTATION_INVALID_COLLECTION_REGION',
  collectionRegionChildNotFound:
    'PIR_MUTATION_COLLECTION_REGION_CHILD_NOT_FOUND',
  duplicateCollectionRegionChild:
    'PIR_MUTATION_DUPLICATE_COLLECTION_REGION_CHILD',
  invalidCollectionRegionChild: 'PIR_MUTATION_INVALID_COLLECTION_REGION_CHILD',
  updaterFailed: 'PIR_MUTATION_UPDATER_FAILED',
} as const);

export type PIRComponentMutationIssueCode =
  (typeof PIR_COMPONENT_MUTATION_ISSUE_CODES)[keyof typeof PIR_COMPONENT_MUTATION_ISSUE_CODES];

export type PIRComponentMutationIssue = Readonly<{
  code: PIRComponentMutationIssueCode;
  path: string;
  message: string;
}>;

export type PIRGraphPlacementTarget = Readonly<{
  parentId: string;
  index: number;
  regionName?: string;
}>;

export type PIRResolvedGraphPlacement = Readonly<{
  parentId: string;
  index: number;
  regionName?: string;
}>;

export type PIRComponentSlotRegions = Readonly<
  Record<string, readonly string[]>
>;

export type PIRCollectionRegions = Readonly<{
  item: readonly string[];
  empty?: readonly string[];
  loading?: readonly string[];
  error?: readonly string[];
}>;

export type PIRResolvedComponentSlotRegions = Readonly<{
  regions: PIRComponentSlotRegions;
  relocatedChildNodeIds: readonly string[];
  placement: PIRResolvedGraphPlacement;
}>;

export type PIRResolvedCollectionRegions = Readonly<{
  regions: PIRCollectionRegions;
  relocatedChildNodeIds: readonly string[];
  placement: PIRResolvedGraphPlacement;
}>;

type PlacementResolution =
  | Readonly<{
      ok: true;
      placement: PIRResolvedGraphPlacement;
    }>
  | Readonly<{
      ok: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const createPirMutationIssue = (
  code: PIRComponentMutationIssueCode,
  path: string,
  message: string
): PIRComponentMutationIssue => Object.freeze({ code, path, message });

export const freezePirMutationIssues = (
  issues: readonly PIRComponentMutationIssue[]
): readonly PIRComponentMutationIssue[] =>
  Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.code, right.code) ||
        compareText(left.message, right.message)
    )
  );

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

const withRegions = (
  graph: PIRUiGraph,
  regionsById: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >
): PIRUiGraph => {
  const { regionsById: _regionsById, ...withoutRegions } = graph;
  return {
    ...withoutRegions,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
  };
};

/** Resolves a legal default-child or named-region insertion point. */
export const resolvePirGraphPlacement = (
  graph: PIRUiGraph,
  target: PIRGraphPlacementTarget
): PlacementResolution => {
  const issues: PIRComponentMutationIssue[] = [];
  if (!target.parentId.trim()) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
        '/target/parentId',
        'Placement parentId must be non-empty.'
      )
    );
  }
  const owner = graph.nodesById[target.parentId];
  if (target.parentId.trim() && !owner) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.parentNotFound,
        '/target/parentId',
        'Placement parent does not exist in the PIR graph.'
      )
    );
  }

  let targetIds: readonly string[] | undefined;
  if (owner && target.regionName === undefined) {
    if (owner.kind === 'collection' || owner.kind === 'component-instance') {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidPlacementOwner,
          '/target/parentId',
          'Collection and Component Instance nodes accept children only through named regions.'
        )
      );
    } else {
      targetIds = graph.childIdsById[target.parentId] ?? [];
    }
  } else if (owner) {
    if (!target.regionName?.trim()) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
          '/target/regionName',
          'Placement regionName must be non-empty when provided.'
        )
      );
    } else if (
      owner.kind !== 'collection' &&
      owner.kind !== 'component-instance'
    ) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidPlacementOwner,
          '/target/parentId',
          'Only Collection and Component Instance nodes own named regions.'
        )
      );
    } else {
      const regions = graph.regionsById?.[target.parentId];
      if (!regions || !Object.hasOwn(regions, target.regionName)) {
        if (owner.kind === 'component-instance') {
          targetIds = [];
        } else {
          issues.push(
            createPirMutationIssue(
              PIR_COMPONENT_MUTATION_ISSUE_CODES.regionNotFound,
              '/target/regionName',
              'Placement region does not exist on the parent node.'
            )
          );
        }
      } else {
        targetIds = regions[target.regionName] ?? [];
      }
    }
  }

  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    (targetIds !== undefined && target.index > targetIds.length)
  ) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidPlacementIndex,
        '/target/index',
        'Placement index must be an integer within the target child range.'
      )
    );
  }
  if (issues.length > 0) {
    return { ok: false, issues: freezePirMutationIssues(issues) };
  }
  return {
    ok: true,
    placement: Object.freeze({
      parentId: target.parentId,
      index: target.index,
      ...(target.regionName === undefined
        ? {}
        : { regionName: target.regionName }),
    }),
  };
};

/** Finds the sole canonical parent placement of a non-root node. */
export const findPirNodePlacement = (
  graph: PIRUiGraph,
  nodeId: string
): PIRResolvedGraphPlacement | undefined => {
  for (const parentId of Object.keys(graph.childIdsById).sort(compareText)) {
    const index = graph.childIdsById[parentId]!.indexOf(nodeId);
    if (index >= 0) return Object.freeze({ parentId, index });
  }
  for (const parentId of Object.keys(graph.regionsById ?? {}).sort(
    compareText
  )) {
    const regions = graph.regionsById?.[parentId] ?? {};
    for (const regionName of Object.keys(regions).sort(compareText)) {
      const index = regions[regionName]!.indexOf(nodeId);
      if (index >= 0) {
        return Object.freeze({ parentId, regionName, index });
      }
    }
  }
  return undefined;
};

export const collectPirSubtreeNodeIds = (
  graph: PIRUiGraph,
  rootId: string
): readonly string[] => {
  const collected = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (collected.has(nodeId)) continue;
    collected.add(nodeId);
    pending.push(...(graph.childIdsById[nodeId] ?? []));
    for (const childIds of Object.values(graph.regionsById?.[nodeId] ?? {})) {
      pending.push(...childIds);
    }
  }
  return Object.freeze([...collected].sort(compareText));
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

export const insertPirComponentInstanceGraph = (
  graph: PIRUiGraph,
  instance: PIRComponentInstanceNode,
  slotRegions: PIRComponentSlotRegions,
  relocatedChildNodeIds: readonly string[],
  placement: PIRResolvedGraphPlacement
): PIRUiGraph => {
  const relocated = new Set(relocatedChildNodeIds);
  const childIdsById: Record<string, readonly string[]> = Object.fromEntries(
    Object.entries(graph.childIdsById).map(([ownerId, childIds]) => [
      ownerId,
      childIds.filter((childId) => !relocated.has(childId)),
    ])
  );
  childIdsById[instance.id] = [];
  const regionsById = cloneRegions(graph);
  for (const [ownerId, regions] of Object.entries(regionsById)) {
    regionsById[ownerId] = Object.fromEntries(
      Object.entries(regions).map(([regionName, childIds]) => [
        regionName,
        childIds.filter((childId) => !relocated.has(childId)),
      ])
    );
  }
  if (Object.keys(slotRegions).length > 0) {
    regionsById[instance.id] = slotRegions;
  }
  if (placement.regionName === undefined) {
    childIdsById[placement.parentId] = insertId(
      childIdsById[placement.parentId] ?? [],
      placement.index,
      instance.id
    );
  } else {
    regionsById[placement.parentId] = {
      ...regionsById[placement.parentId],
      [placement.regionName]: insertId(
        regionsById[placement.parentId]?.[placement.regionName] ?? [],
        placement.index,
        instance.id
      ),
    };
  }
  return {
    ...withRegions(graph, regionsById),
    nodesById: { ...graph.nodesById, [instance.id]: instance },
    childIdsById,
  };
};

export const replacePirSubtreeGraph = (
  graph: PIRUiGraph,
  removedNodeIds: readonly string[],
  instance: PIRComponentInstanceNode,
  placement: PIRResolvedGraphPlacement
): PIRUiGraph => {
  const removed = new Set(removedNodeIds);
  const nodesById = Object.fromEntries(
    Object.entries(graph.nodesById).filter(([nodeId]) => !removed.has(nodeId))
  );
  nodesById[instance.id] = instance;

  const childIdsById: Record<string, readonly string[]> = Object.fromEntries(
    Object.entries(graph.childIdsById)
      .filter(([ownerId]) => !removed.has(ownerId))
      .map(([ownerId, childIds]) => [
        ownerId,
        childIds.filter((childId) => !removed.has(childId)),
      ])
  );
  childIdsById[instance.id] = [];

  const regionsById: Record<
    string,
    Readonly<Record<string, readonly string[]>>
  > = Object.fromEntries(
    Object.entries(graph.regionsById ?? {})
      .filter(([ownerId]) => !removed.has(ownerId))
      .map(([ownerId, regions]) => [
        ownerId,
        Object.fromEntries(
          Object.entries(regions).map(([regionName, childIds]) => [
            regionName,
            childIds.filter((childId) => !removed.has(childId)),
          ])
        ),
      ])
  );

  if (placement.regionName === undefined) {
    childIdsById[placement.parentId] = insertId(
      childIdsById[placement.parentId] ?? [],
      placement.index,
      instance.id
    );
  } else {
    regionsById[placement.parentId] = {
      ...regionsById[placement.parentId],
      [placement.regionName]: insertId(
        regionsById[placement.parentId]?.[placement.regionName] ?? [],
        placement.index,
        instance.id
      ),
    };
  }

  return {
    ...withRegions(graph, regionsById),
    nodesById,
    childIdsById,
  };
};
