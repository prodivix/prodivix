import type {
  PIRCollectionNode,
  PIRDocument,
  PIRElementNode,
  PIRUiGraph,
} from '../pir.types';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  createPirMutationIssue,
  findPirNodePlacement,
  freezePirMutationIssues,
  type PIRComponentMutationIssue,
  type PIRResolvedGraphPlacement,
} from './pirMutationGraph';
import { validatePirMutationDocument } from './pirMutationValidation';

type PIRAuthoringMutationFailure = Readonly<{
  ok: false;
  changed: false;
  issues: readonly PIRComponentMutationIssue[];
}>;

export type UpdatePIRElementNodeInput = Readonly<{
  document: PIRDocument;
  nodeId: string;
  node: PIRElementNode;
}>;

export type UpdatePIRElementNodeResult =
  | Readonly<{
      ok: true;
      changed: boolean;
      document: PIRDocument;
      node: PIRElementNode;
    }>
  | PIRAuthoringMutationFailure;

export type UpdatePIRElementNodesInput = Readonly<{
  document: PIRDocument;
  updates: readonly Readonly<{
    nodeId: string;
    node: PIRElementNode;
  }>[];
}>;

export type UpdatePIRElementNodesResult =
  | Readonly<{
      ok: true;
      changed: boolean;
      document: PIRDocument;
      nodes: readonly PIRElementNode[];
    }>
  | PIRAuthoringMutationFailure;

export type UnwrapPIRCollectionInput = Readonly<{
  document: PIRDocument;
  collectionId: string;
}>;

export type UnwrapPIRCollectionResult =
  | Readonly<{
      ok: true;
      changed: true;
      document: PIRDocument;
      collection: PIRCollectionNode;
      promotedNodeId: string;
      placement?: PIRResolvedGraphPlacement;
    }>
  | PIRAuthoringMutationFailure;

const failure = (
  issues: readonly PIRComponentMutationIssue[]
): PIRAuthoringMutationFailure =>
  Object.freeze({
    ok: false,
    changed: false,
    issues: freezePirMutationIssues(issues),
  });

const issue = (
  code: PIRComponentMutationIssue['code'],
  path: string,
  message: string
): PIRAuthoringMutationFailure =>
  failure([createPirMutationIssue(code, path, message)]);

const withValidatedGraph = (
  document: PIRDocument,
  graph: PIRUiGraph
): PIRDocument | PIRAuthoringMutationFailure => {
  const result = validatePirMutationDocument(
    { ...document, ui: { ...document.ui, graph } },
    'result'
  );
  return result.ok ? result.document : failure(result.issues);
};

const isFailure = (
  value: PIRDocument | PIRAuthoringMutationFailure
): value is PIRAuthoringMutationFailure => 'ok' in value && value.ok === false;

/** Replaces one element's typed authoring fields without changing its identity. */
export const updatePirElementNode = (
  input: UpdatePIRElementNodeInput
): UpdatePIRElementNodeResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const current = source.document.ui.graph.nodesById[input.nodeId];
  if (!current) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
      '/nodeId',
      'Element update target does not exist in the PIR graph.'
    );
  }
  if (current.kind !== 'element' || input.node.kind !== 'element') {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidInstance,
      '/node',
      'Element authoring can update only an existing element node.'
    );
  }
  if (input.node.id !== input.nodeId) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
      '/node/id',
      'Element updates must preserve stable node identity.'
    );
  }
  const candidate = withValidatedGraph(source.document, {
    ...source.document.ui.graph,
    nodesById: {
      ...source.document.ui.graph.nodesById,
      [input.nodeId]: input.node,
    },
  });
  if (isFailure(candidate)) return candidate;
  const changed = JSON.stringify(current) !== JSON.stringify(input.node);
  return Object.freeze({
    ok: true,
    changed,
    document: changed ? candidate : source.document,
    node: (changed ? candidate : source.document).ui.graph.nodesById[
      input.nodeId
    ] as PIRElementNode,
  });
};

/** Atomically replaces multiple elements while preserving every stable identity. */
export const updatePirElementNodes = (
  input: UpdatePIRElementNodesInput
): UpdatePIRElementNodesResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  if (input.updates.length === 0) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidInstance,
      '/updates',
      'Batch element authoring requires at least one element update.'
    );
  }

  const seenNodeIds = new Set<string>();
  const issues: PIRComponentMutationIssue[] = [];
  const nextNodesById = { ...source.document.ui.graph.nodesById };
  let changed = false;

  input.updates.forEach((update, index) => {
    const path = `/updates/${index}`;
    if (seenNodeIds.has(update.nodeId)) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict,
          `${path}/nodeId`,
          'Batch element updates must target each stable node identity once.'
        )
      );
      return;
    }
    seenNodeIds.add(update.nodeId);
    const current = source.document.ui.graph.nodesById[update.nodeId];
    if (!current) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
          `${path}/nodeId`,
          'Element update target does not exist in the PIR graph.'
        )
      );
      return;
    }
    if (current.kind !== 'element' || update.node.kind !== 'element') {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidInstance,
          `${path}/node`,
          'Element authoring can update only an existing element node.'
        )
      );
      return;
    }
    if (update.node.id !== update.nodeId) {
      issues.push(
        createPirMutationIssue(
          PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
          `${path}/node/id`,
          'Element updates must preserve stable node identity.'
        )
      );
      return;
    }
    nextNodesById[update.nodeId] = update.node;
    changed ||= JSON.stringify(current) !== JSON.stringify(update.node);
  });
  if (issues.length > 0) return failure(issues);

  const candidate = withValidatedGraph(source.document, {
    ...source.document.ui.graph,
    nodesById: nextNodesById,
  });
  if (isFailure(candidate)) return candidate;
  const document = changed ? candidate : source.document;
  return Object.freeze({
    ok: true,
    changed,
    document,
    nodes: Object.freeze(
      input.updates.map(
        ({ nodeId }) => document.ui.graph.nodesById[nodeId] as PIRElementNode
      )
    ),
  });
};

const replacePlacementValue = (
  values: readonly string[],
  collectionId: string,
  promotedNodeId: string
): readonly string[] =>
  values.map((nodeId) => (nodeId === collectionId ? promotedNodeId : nodeId));

/** Removes a single-template Collection wrapper and promotes its item in place. */
export const unwrapPirCollection = (
  input: UnwrapPIRCollectionInput
): UnwrapPIRCollectionResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const graph = source.document.ui.graph;
  const collection = graph.nodesById[input.collectionId];
  if (!collection) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
      '/collectionId',
      'Collection unwrap target does not exist in the PIR graph.'
    );
  }
  if (collection.kind !== 'collection') {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidCollection,
      '/collectionId',
      'Collection unwrap requires a first-class Collection node.'
    );
  }
  const regions = graph.regionsById?.[collection.id] ?? {};
  const itemNodeIds = regions.item ?? [];
  const alternateNodeIds = [
    ...(regions.empty ?? []),
    ...(regions.loading ?? []),
    ...(regions.error ?? []),
  ];
  if (itemNodeIds.length !== 1 || alternateNodeIds.length > 0) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidCollection,
      `/ui/graph/regionsById/${collection.id}`,
      'A Collection can be unwrapped only when it owns one item template and no alternate-state templates.'
    );
  }
  const promotedNodeId = itemNodeIds[0]!;
  const placement = findPirNodePlacement(graph, collection.id);
  if (graph.rootId !== collection.id && !placement) {
    return issue(
      PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidSubtreeOperation,
      '/collectionId',
      'Collection unwrap target has no canonical parent placement.'
    );
  }

  const nodesById = { ...graph.nodesById };
  delete nodesById[collection.id];
  const childIdsById = Object.fromEntries(
    Object.entries(graph.childIdsById)
      .filter(([ownerId]) => ownerId !== collection.id)
      .map(([ownerId, childIds]) => [
        ownerId,
        replacePlacementValue(childIds, collection.id, promotedNodeId),
      ])
  );
  const regionsById = Object.fromEntries(
    Object.entries(graph.regionsById ?? {})
      .filter(([ownerId]) => ownerId !== collection.id)
      .map(([ownerId, ownerRegions]) => [
        ownerId,
        Object.fromEntries(
          Object.entries(ownerRegions).map(([regionName, childIds]) => [
            regionName,
            replacePlacementValue(childIds, collection.id, promotedNodeId),
          ])
        ),
      ])
  );
  const { regionsById: _previousRegions, ...graphWithoutRegions } = graph;
  const candidate = withValidatedGraph(source.document, {
    ...graphWithoutRegions,
    rootId: graph.rootId === collection.id ? promotedNodeId : graph.rootId,
    nodesById,
    childIdsById,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
  });
  if (isFailure(candidate)) return candidate;
  return Object.freeze({
    ok: true,
    changed: true,
    document: candidate,
    collection,
    promotedNodeId,
    ...(placement ? { placement } : {}),
  });
};
