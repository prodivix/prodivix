import type {
  PIRCollectionNode,
  PIRComponentContract,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRUiGraph,
} from './pir.types';
import {
  PIR_BINDING_VALIDATION_CODES,
  validatePirBindings,
  type PIRBindingValidationOptions,
} from './pirBindingValidator';

export const PIR_VALIDATION_CODES = {
  graphNodeId: 'PIR_GRAPH_NODE_ID',
  graphReference: 'PIR_GRAPH_REFERENCE',
  graphRoot: 'PIR_GRAPH_ROOT',
  graphParent: 'PIR_GRAPH_PARENT',
  graphCycle: 'PIR_GRAPH_CYCLE',
  graphReachability: 'PIR_GRAPH_REACHABILITY',
  contractMapId: 'PIR_CONTRACT_MAP_ID',
  contractMemberName: 'PIR_CONTRACT_MEMBER_NAME',
  contractMemberType: 'PIR_CONTRACT_MEMBER_TYPE',
  contractSlotCardinality: 'PIR_CONTRACT_SLOT_CARDINALITY',
  contractVariant: 'PIR_CONTRACT_VARIANT',
  contractPartTarget: 'PIR_CONTRACT_PART_TARGET',
  contractToken: 'PIR_CONTRACT_TOKEN',
  slotOutlet: 'PIR_SLOT_OUTLET',
  slotOutletDuplicate: 'PIR_SLOT_OUTLET_DUPLICATE',
  collectionSymbolId: 'PIR_COLLECTION_SYMBOL_ID',
  collectionSymbolName: 'PIR_COLLECTION_SYMBOL_NAME',
  collectionSource: 'PIR_COLLECTION_SOURCE',
  collectionKey: 'PIR_COLLECTION_KEY',
  collectionChildren: 'PIR_COLLECTION_CHILDREN',
  collectionRegion: 'PIR_COLLECTION_REGION',
  graphRegionOwner: 'PIR_GRAPH_REGION_OWNER',
  componentInstanceChildren: 'PIR_COMPONENT_INSTANCE_CHILDREN',
  componentInstanceBindingKey: 'PIR_COMPONENT_INSTANCE_BINDING_KEY',
  componentInstanceRegionKey: 'PIR_COMPONENT_INSTANCE_REGION_KEY',
  ...PIR_BINDING_VALIDATION_CODES,
} as const;

export type PIRValidationCode =
  (typeof PIR_VALIDATION_CODES)[keyof typeof PIR_VALIDATION_CODES];

export type PIRValidationIssue = Readonly<{
  code: PIRValidationCode;
  path: string;
  message: string;
}>;

export type PIRValidationResult = Readonly<{
  valid: boolean;
  issues: readonly PIRValidationIssue[];
}>;

export type PIRValidationOptions = PIRBindingValidationOptions;

type IssueList = PIRValidationIssue[];
type GraphEdge = Readonly<{ childId: string; path: string }>;

const COLLECTION_REGION_NAMES = new Set(['item', 'empty', 'loading', 'error']);

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapeJsonPointerSegment = (value: string) =>
  value.replace(/~/g, '~0').replace(/\//g, '~1');

const sortedEntries = <T>(record: Readonly<Record<string, T>>) =>
  Object.entries(record).sort(([left], [right]) => left.localeCompare(right));

const addIssue = (
  issues: IssueList,
  code: PIRValidationCode,
  path: string,
  message: string
) => {
  issues.push({ code, path, message });
};

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(isJsonValue);
};

const isValueBinding = (value: unknown): boolean => {
  if (!isPlainObject(value) || !isNonEmptyString(value.kind)) return false;

  switch (value.kind) {
    case 'literal':
      return hasOwn(value, 'value') && isJsonValue(value.value);
    case 'param':
      return isNonEmptyString(value.paramId);
    case 'state':
      return isNonEmptyString(value.stateId);
    case 'data':
      return isNonEmptyString(value.dataId);
    case 'collection-symbol':
      return isNonEmptyString(value.symbolId);
    case 'component-prop':
      return isNonEmptyString(value.memberId);
    case 'component-variant':
    case 'slot-prop':
      return isNonEmptyString(value.memberId);
    case 'code':
      return (
        isPlainObject(value.reference) &&
        isNonEmptyString(value.reference.artifactId)
      );
    default:
      return false;
  }
};

const validateMemberIdentity = (
  mapKey: string,
  member: Readonly<{ id: string; name: string }>,
  path: string,
  issues: IssueList
) => {
  if (!isNonEmptyString(mapKey) || member.id !== mapKey) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.contractMapId,
      `${path}/id`,
      'Contract map key must be non-empty and match member.id.'
    );
  }
  if (!isNonEmptyString(member.name)) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.contractMemberName,
      `${path}/name`,
      'Contract member name must be non-empty.'
    );
  }
};

const validatePropMap = (
  propsById: PIRComponentContract['propsById'],
  path: string,
  issues: IssueList
) => {
  for (const [memberId, member] of sortedEntries(propsById)) {
    const memberPath = `${path}/${escapeJsonPointerSegment(memberId)}`;
    validateMemberIdentity(memberId, member, memberPath, issues);
    if (!isNonEmptyString(member.typeRef)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractMemberType,
        `${memberPath}/typeRef`,
        'Component prop typeRef must be non-empty.'
      );
    }
  }
};

const validateComponentContract = (
  contract: PIRComponentContract | undefined,
  graph: PIRUiGraph,
  issues: IssueList
) => {
  if (!contract) return;

  validatePropMap(contract.propsById, '/componentContract/propsById', issues);

  for (const [memberId, member] of sortedEntries(contract.eventsById)) {
    const path = `/componentContract/eventsById/${escapeJsonPointerSegment(memberId)}`;
    validateMemberIdentity(memberId, member, path, issues);
    if (
      member.payloadTypeRef !== undefined &&
      !isNonEmptyString(member.payloadTypeRef)
    ) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractMemberType,
        `${path}/payloadTypeRef`,
        'Component event payloadTypeRef must be non-empty when provided.'
      );
    }
  }

  for (const [memberId, member] of sortedEntries(contract.slotsById)) {
    const path = `/componentContract/slotsById/${escapeJsonPointerSegment(memberId)}`;
    validateMemberIdentity(memberId, member, path, issues);
    if (member.propsById) {
      validatePropMap(member.propsById, `${path}/propsById`, issues);
    }

    const minChildrenIsValid =
      member.minChildren === undefined ||
      (Number.isInteger(member.minChildren) && member.minChildren >= 0);
    const maxChildrenIsValid =
      member.maxChildren === undefined ||
      (Number.isInteger(member.maxChildren) && member.maxChildren >= 0);
    if (!minChildrenIsValid) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractSlotCardinality,
        `${path}/minChildren`,
        'Slot minChildren must be a non-negative integer when provided.'
      );
    }
    if (!maxChildrenIsValid) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractSlotCardinality,
        `${path}/maxChildren`,
        'Slot maxChildren must be a non-negative integer when provided.'
      );
    }
    if (
      minChildrenIsValid &&
      maxChildrenIsValid &&
      member.minChildren !== undefined &&
      member.maxChildren !== undefined &&
      member.minChildren > member.maxChildren
    ) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractSlotCardinality,
        `${path}/maxChildren`,
        'Slot maxChildren must be greater than or equal to minChildren.'
      );
    }
  }

  for (const [memberId, member] of sortedEntries(contract.variantAxesById)) {
    const path = `/componentContract/variantAxesById/${escapeJsonPointerSegment(memberId)}`;
    validateMemberIdentity(memberId, member, path, issues);

    if (Object.keys(member.optionsById).length === 0) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractVariant,
        `${path}/optionsById`,
        'Component variant axis must define at least one option.'
      );
    }

    for (const [optionId, option] of sortedEntries(member.optionsById)) {
      validateMemberIdentity(
        optionId,
        option,
        `${path}/optionsById/${escapeJsonPointerSegment(optionId)}`,
        issues
      );
    }

    if (
      member.defaultOptionId !== undefined &&
      !hasOwn(member.optionsById, member.defaultOptionId)
    ) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractVariant,
        `${path}/defaultOptionId`,
        'Component variant defaultOptionId must reference a local option.'
      );
    }
  }

  for (const [memberId, member] of sortedEntries(contract.partsById ?? {})) {
    const path = `/componentContract/partsById/${escapeJsonPointerSegment(memberId)}`;
    validateMemberIdentity(memberId, member, path, issues);
    if (!hasOwn(graph.nodesById, member.targetNodeId)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractPartTarget,
        `${path}/targetNodeId`,
        'Component part targetNodeId must reference a node in this document.'
      );
    }
  }

  const tokenIds = new Set<string>();
  contract.tokenBindings?.forEach((token, index) => {
    const path = `/componentContract/tokenBindings/${index}`;
    if (!isNonEmptyString(token.id)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractToken,
        `${path}/id`,
        'Component token binding id must be non-empty.'
      );
    } else if (tokenIds.has(token.id)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractToken,
        `${path}/id`,
        'Component token binding id must be unique in this contract.'
      );
    } else {
      tokenIds.add(token.id);
    }

    if (!isNonEmptyString(token.tokenPath)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractToken,
        `${path}/tokenPath`,
        'Component token binding tokenPath must be non-empty.'
      );
    }

    const targetExists =
      isNonEmptyString(token.target.memberId) &&
      (token.target.kind === 'prop'
        ? hasOwn(contract.propsById, token.target.memberId)
        : hasOwn(contract.partsById ?? {}, token.target.memberId));
    if (!targetExists) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.contractToken,
        `${path}/target/memberId`,
        'Component token target must reference a local prop or part member.'
      );
    }
  });
};

const validateGraph = (graph: PIRUiGraph, issues: IssueList) => {
  const nodeIds = Object.keys(graph.nodesById).sort((left, right) =>
    left.localeCompare(right)
  );
  const edgesByOwner = new Map<string, GraphEdge[]>(
    nodeIds.map((nodeId) => [nodeId, []])
  );
  const parentPathsByNode = new Map<string, string[]>();

  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    const path = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}/id`;
    if (!isNonEmptyString(nodeId) || node.id !== nodeId) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphNodeId,
        path,
        'nodesById key must be non-empty and match node.id.'
      );
    }
  }

  if (
    !isNonEmptyString(graph.rootId) ||
    !hasOwn(graph.nodesById, graph.rootId)
  ) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.graphRoot,
      '/ui/graph/rootId',
      'ui.graph.rootId must reference a node in nodesById.'
    );
  }

  const addEdges = (
    ownerId: string,
    childIds: readonly string[],
    path: string,
    reportMissingOwner = true
  ) => {
    const ownerExists = hasOwn(graph.nodesById, ownerId);
    if (!ownerExists && reportMissingOwner) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphReference,
        path,
        'Graph edge owner must reference a node in nodesById.'
      );
    }

    childIds.forEach((childId, index) => {
      const childPath = `${path}/${index}`;
      if (!hasOwn(graph.nodesById, childId)) {
        addIssue(
          issues,
          PIR_VALIDATION_CODES.graphReference,
          childPath,
          'Graph child must reference a node in nodesById.'
        );
        return;
      }
      if (!ownerExists) return;

      edgesByOwner.get(ownerId)?.push({ childId, path: childPath });
      const parentPaths = parentPathsByNode.get(childId) ?? [];
      parentPaths.push(childPath);
      parentPathsByNode.set(childId, parentPaths);
    });
  };

  for (const [ownerId, childIds] of sortedEntries(graph.childIdsById)) {
    addEdges(
      ownerId,
      childIds,
      `/ui/graph/childIdsById/${escapeJsonPointerSegment(ownerId)}`
    );
  }

  for (const [ownerId, regions] of sortedEntries(graph.regionsById ?? {})) {
    const ownerPath = `/ui/graph/regionsById/${escapeJsonPointerSegment(ownerId)}`;
    if (!hasOwn(graph.nodesById, ownerId)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphReference,
        ownerPath,
        'Graph region owner must reference a node in nodesById.'
      );
    }
    for (const [regionName, childIds] of sortedEntries(regions)) {
      addEdges(
        ownerId,
        childIds,
        `${ownerPath}/${escapeJsonPointerSegment(regionName)}`,
        false
      );
    }
  }

  for (const nodeId of nodeIds) {
    const parentPaths = parentPathsByNode.get(nodeId) ?? [];
    if (nodeId === graph.rootId && parentPaths.length > 0) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphRoot,
        parentPaths[0] ?? '/ui/graph/rootId',
        'The graph root must not have a parent.'
      );
      continue;
    }
    if (nodeId !== graph.rootId && parentPaths.length === 0) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphParent,
        `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`,
        'Every non-root node must have exactly one parent.'
      );
    } else if (parentPaths.length > 1) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphParent,
        parentPaths[1] ?? parentPaths[0] ?? '/ui/graph',
        'A node must not have more than one parent.'
      );
    }
  }

  const states = new Map<string, 'visiting' | 'visited'>();
  const visitForCycles = (nodeId: string) => {
    states.set(nodeId, 'visiting');
    for (const edge of edgesByOwner.get(nodeId) ?? []) {
      const childState = states.get(edge.childId);
      if (childState === 'visiting') {
        addIssue(
          issues,
          PIR_VALIDATION_CODES.graphCycle,
          edge.path,
          `Graph cycle detected at node "${edge.childId}".`
        );
      } else if (childState === undefined) {
        visitForCycles(edge.childId);
      }
    }
    states.set(nodeId, 'visited');
  };

  for (const nodeId of nodeIds) {
    if (states.get(nodeId) === undefined) visitForCycles(nodeId);
  }

  if (hasOwn(graph.nodesById, graph.rootId)) {
    const reachable = new Set<string>();
    const visitReachable = (nodeId: string) => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      for (const edge of edgesByOwner.get(nodeId) ?? []) {
        visitReachable(edge.childId);
      }
    };
    visitReachable(graph.rootId);

    for (const nodeId of nodeIds) {
      if (reachable.has(nodeId)) continue;
      addIssue(
        issues,
        PIR_VALIDATION_CODES.graphReachability,
        `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`,
        'Node must be reachable from ui.graph.rootId.'
      );
    }
  }
};

const validateCollection = (
  nodeId: string,
  node: PIRCollectionNode,
  graph: PIRUiGraph,
  collectionSymbolOwners: Map<string, string>,
  issues: IssueList
) => {
  const nodePath = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  const symbolIds = [
    ['itemId', node.symbols.itemId],
    ['indexId', node.symbols.indexId],
    ...(node.symbols.errorId === undefined
      ? []
      : ([['errorId', node.symbols.errorId]] as const)),
  ] as const;

  for (const [field, symbolId] of symbolIds) {
    const path = `${nodePath}/symbols/${field}`;
    if (!isNonEmptyString(symbolId)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.collectionSymbolId,
        path,
        'Collection symbol id must be non-empty.'
      );
      continue;
    }
    const previousOwner = collectionSymbolOwners.get(symbolId);
    if (previousOwner) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.collectionSymbolId,
        path,
        `Collection symbol id must be unique; it is already owned by "${previousOwner}".`
      );
    } else {
      collectionSymbolOwners.set(symbolId, nodeId);
    }
  }

  const symbolNames = [
    ['itemName', node.symbols.itemName],
    ['indexName', node.symbols.indexName],
  ] as const;
  const seenNames = new Set<string>();
  for (const [field, symbolName] of symbolNames) {
    const path = `${nodePath}/symbols/${field}`;
    if (!isNonEmptyString(symbolName)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.collectionSymbolName,
        path,
        'Collection symbol name must be non-empty.'
      );
      continue;
    }
    if (seenNames.has(symbolName)) {
      addIssue(
        issues,
        PIR_VALIDATION_CODES.collectionSymbolName,
        path,
        'Collection symbol names must be unique within the collection scope.'
      );
    }
    seenNames.add(symbolName);
  }

  const source = node.source as unknown;
  const validSource =
    isPlainObject(source) &&
    ((source.kind === 'literal' &&
      Array.isArray(source.value) &&
      source.value.every(isJsonValue)) ||
      (source.kind === 'binding' && isValueBinding(source.value)));
  if (!validSource) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.collectionSource,
      `${nodePath}/source`,
      'Collection source must be an array literal or a valid PIR value binding.'
    );
  }

  const key = node.key as unknown;
  const validKey =
    isPlainObject(key) &&
    (key.kind === 'index' ||
      (key.kind === 'binding' && isValueBinding(key.value)));
  if (!validKey) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.collectionKey,
      `${nodePath}/key`,
      'Collection key must explicitly use index or a valid PIR value binding.'
    );
  }

  if ((graph.childIdsById[nodeId] ?? []).length > 0) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.collectionChildren,
      `/ui/graph/childIdsById/${escapeJsonPointerSegment(nodeId)}`,
      'Collection nodes must own children only through named regions.'
    );
  }

  const regions = graph.regionsById?.[nodeId];
  if (!regions || !hasOwn(regions, 'item')) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.collectionRegion,
      `/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/item`,
      'Collection must define an item region.'
    );
  }
  for (const regionName of Object.keys(regions ?? {}).sort((left, right) =>
    left.localeCompare(right)
  )) {
    if (COLLECTION_REGION_NAMES.has(regionName)) continue;
    addIssue(
      issues,
      PIR_VALIDATION_CODES.collectionRegion,
      `/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(regionName)}`,
      'Collection regions are limited to item, empty, loading, and error.'
    );
  }
};

const validateComponentInstance = (
  nodeId: string,
  node: PIRComponentInstanceNode,
  graph: PIRUiGraph,
  issues: IssueList
) => {
  const nodePath = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  if ((graph.childIdsById[nodeId] ?? []).length > 0) {
    addIssue(
      issues,
      PIR_VALIDATION_CODES.componentInstanceChildren,
      `/ui/graph/childIdsById/${escapeJsonPointerSegment(nodeId)}`,
      'Component Instance children must be owned by contract slot regions.'
    );
  }
  const bindingMaps = [
    ['props', node.bindings.props],
    ['events', node.bindings.events],
    ['variants', node.bindings.variants],
  ] as const;

  for (const [bindingKind, bindings] of bindingMaps) {
    for (const memberId of Object.keys(bindings).sort((left, right) =>
      left.localeCompare(right)
    )) {
      if (isNonEmptyString(memberId)) continue;
      addIssue(
        issues,
        PIR_VALIDATION_CODES.componentInstanceBindingKey,
        `${nodePath}/bindings/${bindingKind}/${escapeJsonPointerSegment(memberId)}`,
        'Component instance binding keys must be non-empty contract member ids.'
      );
    }
  }

  for (const regionName of Object.keys(graph.regionsById?.[nodeId] ?? {}).sort(
    (left, right) => left.localeCompare(right)
  )) {
    if (isNonEmptyString(regionName)) continue;
    addIssue(
      issues,
      PIR_VALIDATION_CODES.componentInstanceRegionKey,
      `/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(regionName)}`,
      'Component instance region keys must be non-empty slot member ids.'
    );
  }
};

const validateStructuralNodes = (document: PIRDocument, issues: IssueList) => {
  const graph = document.ui.graph;
  const slotOutletPaths = new Map<string, string>();
  const collectionSymbolOwners = new Map<string, string>();

  for (const ownerId of Object.keys(graph.regionsById ?? {}).sort()) {
    const owner = graph.nodesById[ownerId];
    if (
      !owner ||
      owner.kind === 'collection' ||
      owner.kind === 'component-instance'
    ) {
      continue;
    }
    addIssue(
      issues,
      PIR_VALIDATION_CODES.graphRegionOwner,
      `/ui/graph/regionsById/${escapeJsonPointerSegment(ownerId)}`,
      'Named regions are owned only by Collection or Component Instance nodes.'
    );
  }

  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    const nodePath = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
    switch (node.kind) {
      case 'component-slot-outlet': {
        const slotPath = `${nodePath}/slotMemberId`;
        if (
          !isNonEmptyString(node.slotMemberId) ||
          !document.componentContract ||
          !hasOwn(document.componentContract.slotsById, node.slotMemberId)
        ) {
          addIssue(
            issues,
            PIR_VALIDATION_CODES.slotOutlet,
            slotPath,
            'Slot outlet must reference a slot in this document component contract.'
          );
        }
        if (isNonEmptyString(node.slotMemberId)) {
          const previousPath = slotOutletPaths.get(node.slotMemberId);
          if (previousPath) {
            addIssue(
              issues,
              PIR_VALIDATION_CODES.slotOutletDuplicate,
              slotPath,
              `Slot member already has an outlet at ${previousPath}.`
            );
          } else {
            slotOutletPaths.set(node.slotMemberId, slotPath);
          }
        }
        break;
      }
      case 'collection':
        validateCollection(nodeId, node, graph, collectionSymbolOwners, issues);
        break;
      case 'component-instance':
        validateComponentInstance(nodeId, node, graph, issues);
        break;
      case 'element':
        break;
    }
  }
};

/**
 * Validates the local structural invariants of a decoded PIR-current document.
 * Cross-document component resolution remains a Workspace validator concern.
 */
export const validatePirDocument = (
  document: PIRDocument,
  options: PIRValidationOptions = {}
): PIRValidationResult => {
  const issues: IssueList = [];
  validateGraph(document.ui.graph, issues);
  validateComponentContract(
    document.componentContract,
    document.ui.graph,
    issues
  );
  validateStructuralNodes(document, issues);
  issues.push(...validatePirBindings(document, options));

  return { valid: issues.length === 0, issues };
};
