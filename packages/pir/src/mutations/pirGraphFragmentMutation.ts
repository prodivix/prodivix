import type { PIRDocument, PIRNode, PIRUiGraph } from '../pir.types';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  createPirMutationIssue,
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

export type PIRGraphFragment = Readonly<{
  rootNodeIds: readonly string[];
  primaryNodeId: string;
  nodesById: Readonly<Record<string, PIRNode>>;
  childIdsById: Readonly<Record<string, readonly string[]>>;
  regionsById?: Readonly<
    Record<string, Readonly<Record<string, readonly string[]>>>
  >;
}>;

export type InsertPIRGraphFragmentInput = Readonly<{
  document: PIRDocument;
  fragment: PIRGraphFragment;
  target: PIRGraphPlacementTarget;
}>;

export type InsertPIRGraphFragmentResult =
  | Readonly<{
      ok: true;
      changed: true;
      document: PIRDocument;
      primaryNodeId: string;
      insertedNodeIds: readonly string[];
      placement: PIRResolvedGraphPlacement;
    }>
  | Readonly<{
      ok: false;
      changed: false;
      issues: readonly PIRComponentMutationIssue[];
    }>;

const failure = (
  issues: readonly PIRComponentMutationIssue[]
): Extract<InsertPIRGraphFragmentResult, { ok: false }> =>
  Object.freeze({
    ok: false,
    changed: false,
    issues: freezePirMutationIssues(issues),
  });

const invalidFragment = (
  path: string,
  message: string
): PIRComponentMutationIssue =>
  createPirMutationIssue(
    PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidFragment,
    path,
    message
  );

const validateFragment = (
  source: PIRUiGraph,
  fragment: PIRGraphFragment
): readonly PIRComponentMutationIssue[] => {
  const issues: PIRComponentMutationIssue[] = [];
  const nodeIds = Object.keys(fragment.nodesById);
  const nodeIdSet = new Set(nodeIds);
  const rootIds = new Set(fragment.rootNodeIds);
  const parentCountByNodeId = new Map(nodeIds.map((nodeId) => [nodeId, 0]));

  if (fragment.rootNodeIds.length === 0) {
    issues.push(
      invalidFragment('/fragment/rootNodeIds', 'Fragment must declare a root.')
    );
  }
  if (rootIds.size !== fragment.rootNodeIds.length) {
    issues.push(
      invalidFragment(
        '/fragment/rootNodeIds',
        'Fragment root node ids must be unique.'
      )
    );
  }
  if (!nodeIdSet.has(fragment.primaryNodeId)) {
    issues.push(
      invalidFragment(
        '/fragment/primaryNodeId',
        'Fragment primaryNodeId must reference a fragment node.'
      )
    );
  }

  for (const [nodeId, node] of Object.entries(fragment.nodesById)) {
    if (!nodeId.trim() || node.id !== nodeId) {
      issues.push(
        invalidFragment(
          `/fragment/nodesById/${nodeId}/id`,
          'Fragment node keys must be non-empty and match node.id.'
        )
      );
    }
    if (source.nodesById[nodeId]) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict,
          `/fragment/nodesById/${nodeId}`,
          'Fragment node id already exists in the destination graph.'
        )
      );
    }
  }

  const visitEdges = (
    ownerId: string,
    childIds: readonly string[],
    path: string
  ) => {
    if (!nodeIdSet.has(ownerId)) {
      issues.push(
        invalidFragment(path, 'Fragment edge owner must be a fragment node.')
      );
    }
    childIds.forEach((childId, index) => {
      if (!nodeIdSet.has(childId)) {
        issues.push(
          invalidFragment(
            `${path}/${index}`,
            'Fragment child must be a fragment node.'
          )
        );
        return;
      }
      parentCountByNodeId.set(
        childId,
        (parentCountByNodeId.get(childId) ?? 0) + 1
      );
    });
  };

  for (const [ownerId, childIds] of Object.entries(fragment.childIdsById)) {
    visitEdges(ownerId, childIds, `/fragment/childIdsById/${ownerId}`);
  }
  for (const [ownerId, regions] of Object.entries(fragment.regionsById ?? {})) {
    for (const [regionName, childIds] of Object.entries(regions)) {
      visitEdges(
        ownerId,
        childIds,
        `/fragment/regionsById/${ownerId}/${regionName}`
      );
    }
  }

  for (const nodeId of nodeIds) {
    const parentCount = parentCountByNodeId.get(nodeId) ?? 0;
    if (rootIds.has(nodeId) ? parentCount !== 0 : parentCount !== 1) {
      issues.push(
        invalidFragment(
          `/fragment/nodesById/${nodeId}`,
          rootIds.has(nodeId)
            ? 'Fragment roots must not have an internal parent.'
            : 'Every non-root fragment node must have exactly one internal parent.'
        )
      );
    }
  }
  for (const [index, rootNodeId] of fragment.rootNodeIds.entries()) {
    if (!nodeIdSet.has(rootNodeId)) {
      issues.push(
        invalidFragment(
          `/fragment/rootNodeIds/${index}`,
          'Fragment root must reference a fragment node.'
        )
      );
    }
  }
  return freezePirMutationIssues(issues);
};

const insertAll = (
  values: readonly string[],
  index: number,
  inserted: readonly string[]
): readonly string[] => [
  ...values.slice(0, index),
  ...inserted,
  ...values.slice(index),
];

const insertFragmentGraph = (
  graph: PIRUiGraph,
  fragment: PIRGraphFragment,
  placement: PIRResolvedGraphPlacement
): PIRUiGraph => {
  const childIdsById: Record<string, readonly string[]> = {
    ...graph.childIdsById,
    ...fragment.childIdsById,
  };
  const regionsById: Record<
    string,
    Readonly<Record<string, readonly string[]>>
  > = {
    ...(graph.regionsById ?? {}),
    ...(fragment.regionsById ?? {}),
  };
  if (placement.regionName === undefined) {
    childIdsById[placement.parentId] = insertAll(
      childIdsById[placement.parentId] ?? [],
      placement.index,
      fragment.rootNodeIds
    );
  } else {
    regionsById[placement.parentId] = {
      ...regionsById[placement.parentId],
      [placement.regionName]: insertAll(
        regionsById[placement.parentId]?.[placement.regionName] ?? [],
        placement.index,
        fragment.rootNodeIds
      ),
    };
  }
  return {
    ...graph,
    nodesById: { ...graph.nodesById, ...fragment.nodesById },
    childIdsById,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
  };
};

/** Inserts an immutable normalized graph fragment through one legal placement. */
export const insertPirGraphFragment = (
  input: InsertPIRGraphFragmentInput
): InsertPIRGraphFragmentResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const fragmentIssues = validateFragment(
    source.document.ui.graph,
    input.fragment
  );
  const targetIssues = validatePirPlacementTargetInput(input.target);
  const placement = resolvePirGraphPlacement(
    source.document.ui.graph,
    input.target
  );
  if (fragmentIssues.length > 0 || targetIssues.length > 0 || !placement.ok) {
    return failure([
      ...fragmentIssues,
      ...targetIssues,
      ...(placement.ok ? [] : placement.issues),
    ]);
  }
  const candidate: PIRDocument = {
    ...source.document,
    ui: {
      ...source.document.ui,
      graph: insertFragmentGraph(
        source.document.ui.graph,
        input.fragment,
        placement.placement
      ),
    },
  };
  const result = validatePirMutationDocument(candidate, 'result');
  if (!result.ok) return failure(result.issues);
  return Object.freeze({
    ok: true,
    changed: true,
    document: result.document,
    primaryNodeId: input.fragment.primaryNodeId,
    insertedNodeIds: Object.freeze(
      Object.keys(input.fragment.nodesById).sort((left, right) =>
        left.localeCompare(right)
      )
    ),
    placement: placement.placement,
  });
};
