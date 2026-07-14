import type {
  PIRComponentContract,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRUiGraph,
} from '../pir.types';
import {
  PIR_COMPONENT_MUTATION_ISSUE_CODES,
  collectPirSubtreeNodeIds,
  createPirMutationIssue,
  findPirNodePlacement,
  freezePirMutationIssues,
  insertPirComponentInstanceGraph,
  replacePirSubtreeGraph,
  resolvePirGraphPlacement,
  type PIRComponentSlotRegions,
  type PIRComponentMutationIssue,
  type PIRGraphPlacementTarget,
  type PIRResolvedGraphPlacement,
} from './pirMutationGraph';
import { resolvePirComponentSlotRegions } from './pirSlotRegionMutation';
import {
  validatePirComponentInstanceInput,
  validatePirMutationDocument,
  validatePirPlacementTargetInput,
} from './pirMutationValidation';

export { PIR_COMPONENT_MUTATION_ISSUE_CODES } from './pirMutationGraph';
export type {
  PIRComponentMutationIssue,
  PIRComponentMutationIssueCode,
  PIRComponentSlotRegions,
  PIRGraphPlacementTarget,
  PIRResolvedGraphPlacement,
} from './pirMutationGraph';

export type InsertPIRComponentInstanceInput = Readonly<{
  document: PIRDocument;
  instance: PIRComponentInstanceNode;
  target: PIRGraphPlacementTarget;
  slotRegions?: PIRComponentSlotRegions;
}>;

export type ReplacePIRSubtreeWithComponentInstanceInput = Readonly<{
  document: PIRDocument;
  subtreeRootId: string;
  instance: PIRComponentInstanceNode;
}>;

export type ReplacePIRComponentContractInput = Readonly<{
  document: PIRDocument;
  componentContract: PIRComponentContract;
}>;

export type UpdatePIRComponentContractInput = Readonly<{
  document: PIRDocument;
  update: (current: PIRComponentContract | undefined) => PIRComponentContract;
}>;

type MutationFailure = Readonly<{
  ok: false;
  changed: false;
  issues: readonly PIRComponentMutationIssue[];
}>;

type ComponentInstanceMutationSuccess = Readonly<{
  ok: true;
  changed: true;
  document: PIRDocument;
  instanceNodeId: string;
  placement: PIRResolvedGraphPlacement;
}>;

type ComponentInstanceInsertionSuccess = ComponentInstanceMutationSuccess &
  Readonly<{
    relocatedChildNodeIds: readonly string[];
  }>;

type ComponentInstanceReplacementSuccess = ComponentInstanceMutationSuccess &
  Readonly<{
    removedNodeIds: readonly string[];
  }>;

type ComponentContractMutationSuccess = Readonly<{
  ok: true;
  changed: boolean;
  document: PIRDocument;
}>;

export type InsertPIRComponentInstanceResult =
  ComponentInstanceInsertionSuccess | MutationFailure;

export type ReplacePIRSubtreeWithComponentInstanceResult =
  ComponentInstanceReplacementSuccess | MutationFailure;

export type PIRComponentContractMutationResult =
  ComponentContractMutationSuccess | MutationFailure;

const failure = (
  issues: readonly PIRComponentMutationIssue[]
): MutationFailure =>
  Object.freeze({
    ok: false,
    changed: false,
    issues: freezePirMutationIssues(issues),
  });

const withGraph = (document: PIRDocument, graph: PIRUiGraph): PIRDocument => ({
  ...document,
  ui: { ...document.ui, graph },
});

const validateResultDocument = (
  document: PIRDocument
): PIRDocument | MutationFailure => {
  const result = validatePirMutationDocument(document, 'result');
  return result.ok ? result.document : failure(result.issues);
};

const hasMutationFailure = (
  value: PIRDocument | MutationFailure
): value is MutationFailure => 'ok' in value && value.ok === false;

const validateInstanceAndConflict = (
  graph: PIRUiGraph,
  instance: PIRComponentInstanceNode,
  allowedExistingNodeId?: string
):
  | Readonly<{ ok: true; instance: PIRComponentInstanceNode }>
  | MutationFailure => {
  const validation = validatePirComponentInstanceInput(instance);
  if (!validation.ok) return failure(validation.issues);
  if (
    graph.nodesById[validation.instance.id] &&
    validation.instance.id !== allowedExistingNodeId
  ) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeIdConflict,
        '/instance/id',
        'Component Instance node id already exists in the PIR graph.'
      ),
    ]);
  }
  return { ok: true, instance: validation.instance };
};

/** Inserts a canonical Component Instance into default children or a region. */
export const insertPirComponentInstance = (
  input: InsertPIRComponentInstanceInput
): InsertPIRComponentInstanceResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);

  const instance = validateInstanceAndConflict(
    source.document.ui.graph,
    input.instance
  );
  if (!instance.ok) return instance;

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
  const slotRegions = resolvePirComponentSlotRegions(
    source.document.ui.graph,
    input.slotRegions,
    placement.placement
  );
  if (!slotRegions.ok) return failure(slotRegions.issues);

  const next = validateResultDocument(
    withGraph(
      source.document,
      insertPirComponentInstanceGraph(
        source.document.ui.graph,
        instance.instance,
        slotRegions.value.regions,
        slotRegions.value.relocatedChildNodeIds,
        slotRegions.value.placement
      )
    )
  );
  if (hasMutationFailure(next)) return next;
  return Object.freeze({
    ok: true,
    changed: true,
    document: next,
    instanceNodeId: instance.instance.id,
    placement: slotRegions.value.placement,
    relocatedChildNodeIds: slotRegions.value.relocatedChildNodeIds,
  });
};

/**
 * Replaces a non-root subtree at its exact parent/region/index placement. The
 * removed ids and placement let an extraction Transaction persist the new
 * Component definition and its instance atomically.
 */
export const replacePirSubtreeWithComponentInstance = (
  input: ReplacePIRSubtreeWithComponentInstanceInput
): ReplacePIRSubtreeWithComponentInstanceResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const graph = source.document.ui.graph;
  const issues: PIRComponentMutationIssue[] = [];
  if (!input.subtreeRootId.trim()) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.invalidId,
        '/subtreeRootId',
        'Subtree root id must be non-empty.'
      )
    );
  } else if (!graph.nodesById[input.subtreeRootId]) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.nodeNotFound,
        '/subtreeRootId',
        'Subtree root does not exist in the PIR graph.'
      )
    );
  } else if (input.subtreeRootId === graph.rootId) {
    issues.push(
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.rootReplacement,
        '/subtreeRootId',
        'The document root cannot be replaced because it has no parent placement.'
      )
    );
  }
  if (issues.length > 0) return failure(issues);

  const instance = validateInstanceAndConflict(
    graph,
    input.instance,
    input.subtreeRootId
  );
  if (!instance.ok) return instance;
  const placement = findPirNodePlacement(graph, input.subtreeRootId);
  if (!placement) {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.sourceSemanticInvalid,
        '/subtreeRootId',
        'Subtree root has no canonical parent placement.'
      ),
    ]);
  }

  const removedNodeIds = collectPirSubtreeNodeIds(graph, input.subtreeRootId);
  const next = validateResultDocument(
    withGraph(
      source.document,
      replacePirSubtreeGraph(
        graph,
        removedNodeIds,
        instance.instance,
        placement
      )
    )
  );
  if (hasMutationFailure(next)) return next;
  return Object.freeze({
    ok: true,
    changed: true,
    document: next,
    instanceNodeId: instance.instance.id,
    placement,
    removedNodeIds,
  });
};

/** Atomically replaces the document's complete current PIR Component contract. */
export const replacePirComponentContract = (
  input: ReplacePIRComponentContractInput
): PIRComponentContractMutationResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  const next = validateResultDocument({
    ...source.document,
    componentContract: input.componentContract,
  });
  if (hasMutationFailure(next)) return next;
  const changed =
    JSON.stringify(source.document.componentContract) !==
    JSON.stringify(next.componentContract);
  return Object.freeze({
    ok: true,
    changed,
    document: changed ? next : source.document,
  });
};

/** Computes and validates a complete Component contract replacement. */
export const updatePirComponentContract = (
  input: UpdatePIRComponentContractInput
): PIRComponentContractMutationResult => {
  const source = validatePirMutationDocument(input.document, 'source');
  if (!source.ok) return failure(source.issues);
  let componentContract: PIRComponentContract;
  try {
    componentContract = input.update(source.document.componentContract);
  } catch {
    return failure([
      createPirMutationIssue(
        PIR_COMPONENT_MUTATION_ISSUE_CODES.updaterFailed,
        '/componentContract',
        'Component contract updater did not complete.'
      ),
    ]);
  }
  return replacePirComponentContract({
    document: source.document,
    componentContract,
  });
};
