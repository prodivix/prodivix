import type {
  PIRComponentContract,
  PIRDocument,
  PIRNode,
  PIRTriggerBinding,
  PIRUiGraph,
  PIRValueBinding,
} from './pir.types';

export const PIR_BINDING_VALIDATION_CODES = Object.freeze({
  componentEventEmission: 'PIR_COMPONENT_EVENT_EMISSION',
  componentPropBinding: 'PIR_COMPONENT_PROP_BINDING',
  componentVariantBinding: 'PIR_COMPONENT_VARIANT_BINDING',
  slotPropScope: 'PIR_SLOT_PROP_SCOPE',
  slotPropMember: 'PIR_SLOT_PROP_MEMBER',
  slotOutletBinding: 'PIR_SLOT_OUTLET_BINDING',
  collectionSymbolUnresolved: 'PIR_COLLECTION_SYMBOL_UNRESOLVED',
  collectionSymbolScope: 'PIR_COLLECTION_SYMBOL_SCOPE',
} as const);

export type PIRBindingValidationCode =
  (typeof PIR_BINDING_VALIDATION_CODES)[keyof typeof PIR_BINDING_VALIDATION_CODES];

export type PIRBindingValidationIssue = Readonly<{
  code: PIRBindingValidationCode;
  path: string;
  message: string;
}>;

export type PIRBindingValidationOptions = Readonly<{
  /**
   * Resolves the target Definition Contract for consumer-owned instance slot
   * regions. When supplied, slot-prop member existence is validated locally.
   */
  resolveComponentContract?: (
    componentDocumentId: string
  ) => PIRComponentContract | undefined;
}>;

type ParentPlacement = Readonly<{
  ownerNodeId: string;
  regionName?: string;
}>;

type CollectionSymbolOwner = Readonly<{
  nodeId: string;
  role: 'item' | 'index' | 'error';
}>;

type CollectionBindingOccurrenceKind =
  'node' | 'collection-source' | 'collection-key';

export type PIRInstanceSlotScope = Readonly<{
  instanceNodeId: string;
  componentDocumentId: string;
  slotMemberId: string;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <T>(
  value: Readonly<Record<string, T>>
): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

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

const createInstanceSlotScopeResolver = (
  graph: PIRUiGraph,
  placements: ReadonlyMap<string, ParentPlacement>
) => {
  const memo = new Map<string, PIRInstanceSlotScope | null>();
  const resolve = (nodeId: string): PIRInstanceSlotScope | undefined => {
    const cached = memo.get(nodeId);
    if (cached !== undefined) return cached ?? undefined;
    const visited = new Set<string>();
    let currentNodeId = nodeId;
    while (!visited.has(currentNodeId)) {
      visited.add(currentNodeId);
      const placement = placements.get(currentNodeId);
      if (!placement) break;
      const owner = graph.nodesById[placement.ownerNodeId];
      if (
        owner?.kind === 'component-instance' &&
        placement.regionName !== undefined
      ) {
        const scope = {
          instanceNodeId: placement.ownerNodeId,
          componentDocumentId: owner.componentDocumentId,
          slotMemberId: placement.regionName,
        };
        memo.set(nodeId, scope);
        return scope;
      }
      currentNodeId = placement.ownerNodeId;
    }
    memo.set(nodeId, null);
    return undefined;
  };
  return resolve;
};

const createCollectionSymbolOwners = (
  graph: PIRUiGraph
): ReadonlyMap<string, CollectionSymbolOwner> => {
  const owners = new Map<string, CollectionSymbolOwner>();
  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    if (node.kind !== 'collection') continue;
    owners.set(node.symbols.itemId, { nodeId, role: 'item' });
    owners.set(node.symbols.indexId, { nodeId, role: 'index' });
    if (node.symbols.errorId) {
      owners.set(node.symbols.errorId, { nodeId, role: 'error' });
    }
  }
  return owners;
};

const isCollectionSymbolVisible = (
  owner: CollectionSymbolOwner,
  occurrenceNodeId: string,
  occurrenceKind: CollectionBindingOccurrenceKind,
  placements: ReadonlyMap<string, ParentPlacement>
): boolean => {
  if (owner.nodeId === occurrenceNodeId) {
    return occurrenceKind === 'collection-key' && owner.role !== 'error';
  }
  const visited = new Set<string>();
  let currentNodeId = occurrenceNodeId;
  while (!visited.has(currentNodeId)) {
    visited.add(currentNodeId);
    const placement = placements.get(currentNodeId);
    if (!placement) return false;
    if (placement.ownerNodeId === owner.nodeId) {
      return owner.role === 'error'
        ? placement.regionName === 'error'
        : placement.regionName === 'item';
    }
    currentNodeId = placement.ownerNodeId;
  }
  return false;
};

export const createPirInstanceSlotScopes = (
  graph: PIRUiGraph
): ReadonlyMap<string, PIRInstanceSlotScope> => {
  const resolve = createInstanceSlotScopeResolver(
    graph,
    buildParentPlacements(graph)
  );
  const scopes = new Map<string, PIRInstanceSlotScope>();
  for (const nodeId of Object.keys(graph.nodesById).sort(compareText)) {
    const scope = resolve(nodeId);
    if (scope) scopes.set(nodeId, scope);
  }
  return scopes;
};

const nodeFieldPath = (nodeId: string, fieldPath: string): string =>
  `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}${fieldPath}`;

/** Validates all current PIR binding semantics that are local to one graph. */
export const validatePirBindings = (
  document: PIRDocument,
  options: PIRBindingValidationOptions = {}
): readonly PIRBindingValidationIssue[] => {
  const issues: PIRBindingValidationIssue[] = [];
  const graph = document.ui.graph;
  const placements = buildParentPlacements(graph);
  const slotScopesByNodeId = createPirInstanceSlotScopes(graph);
  const collectionSymbolOwners = createCollectionSymbolOwners(graph);

  const addIssue = (
    code: PIRBindingValidationCode,
    path: string,
    message: string
  ): void => {
    issues.push({ code, path, message });
  };

  const validateValue = (
    nodeId: string,
    fieldPath: string,
    value: PIRValueBinding | undefined,
    slotScope: PIRInstanceSlotScope | undefined,
    occurrenceKind: CollectionBindingOccurrenceKind = 'node'
  ): void => {
    if (!value) return;
    if (value.kind === 'collection-symbol') {
      const symbolPath = `${nodeFieldPath(nodeId, fieldPath)}/symbolId`;
      const owner = collectionSymbolOwners.get(value.symbolId);
      if (!owner) {
        addIssue(
          PIR_BINDING_VALIDATION_CODES.collectionSymbolUnresolved,
          symbolPath,
          `collection-symbol "${value.symbolId}" does not resolve in this document.`
        );
      } else if (
        !isCollectionSymbolVisible(owner, nodeId, occurrenceKind, placements)
      ) {
        addIssue(
          PIR_BINDING_VALIDATION_CODES.collectionSymbolScope,
          symbolPath,
          `Collection ${owner.role} symbol "${value.symbolId}" is not visible from this lexical scope.`
        );
      }
      return;
    }
    if (value.kind === 'component-prop') {
      if (
        !document.componentContract ||
        !hasOwn(document.componentContract.propsById, value.memberId)
      ) {
        addIssue(
          PIR_BINDING_VALIDATION_CODES.componentPropBinding,
          `${nodeFieldPath(nodeId, fieldPath)}/memberId`,
          'component-prop must reference a prop in this Definition Contract.'
        );
      }
      return;
    }
    if (value.kind === 'component-variant') {
      if (
        !document.componentContract ||
        !hasOwn(document.componentContract.variantAxesById, value.memberId)
      ) {
        addIssue(
          PIR_BINDING_VALIDATION_CODES.componentVariantBinding,
          `${nodeFieldPath(nodeId, fieldPath)}/memberId`,
          'component-variant must reference an axis in this Definition Contract.'
        );
      }
      return;
    }
    if (value.kind !== 'slot-prop') return;
    const memberPath = `${nodeFieldPath(nodeId, fieldPath)}/memberId`;
    if (!slotScope) {
      addIssue(
        PIR_BINDING_VALIDATION_CODES.slotPropScope,
        memberPath,
        'slot-prop is only visible inside a Component Instance slot region.'
      );
      return;
    }
    if (!options.resolveComponentContract) return;
    const targetContract = options.resolveComponentContract(
      slotScope.componentDocumentId
    );
    const slot = targetContract?.slotsById[slotScope.slotMemberId];
    if (!slot || !hasOwn(slot.propsById ?? {}, value.memberId)) {
      addIssue(
        PIR_BINDING_VALIDATION_CODES.slotPropMember,
        memberPath,
        `slot-prop must reference a prop of slot "${slotScope.slotMemberId}" on Component "${slotScope.componentDocumentId}".`
      );
    }
  };

  const validateTrigger = (
    nodeId: string,
    fieldPath: string,
    trigger: PIRTriggerBinding,
    slotScope: PIRInstanceSlotScope | undefined
  ): void => {
    if (trigger.kind !== 'emit-component-event') return;
    if (
      !document.componentContract ||
      !hasOwn(document.componentContract.eventsById, trigger.memberId)
    ) {
      addIssue(
        PIR_BINDING_VALIDATION_CODES.componentEventEmission,
        `${nodeFieldPath(nodeId, fieldPath)}/memberId`,
        'emit-component-event must reference an event in this Definition Contract.'
      );
    }
    validateValue(nodeId, `${fieldPath}/payload`, trigger.payload, slotScope);
  };

  const validateElement = (
    nodeId: string,
    node: Extract<PIRNode, { kind: 'element' }>,
    slotScope: PIRInstanceSlotScope | undefined
  ): void => {
    validateValue(nodeId, '/text', node.text, slotScope);
    for (const [name, value] of sortedEntries(node.style ?? {})) {
      validateValue(
        nodeId,
        `/style/${escapeJsonPointerSegment(name)}`,
        value,
        slotScope
      );
    }
    for (const [name, value] of sortedEntries(node.props ?? {})) {
      validateValue(
        nodeId,
        `/props/${escapeJsonPointerSegment(name)}`,
        value,
        slotScope
      );
    }
    if (node.data) {
      for (const [field, value] of [
        ['source', node.data.source],
        ['value', node.data.value],
        ['mock', node.data.mock],
      ] as const) {
        validateValue(nodeId, `/data/${field}`, value, slotScope);
      }
      for (const [name, value] of sortedEntries(node.data.extend ?? {})) {
        validateValue(
          nodeId,
          `/data/extend/${escapeJsonPointerSegment(name)}`,
          value,
          slotScope
        );
      }
    }
    for (const [eventName, trigger] of sortedEntries(node.events ?? {})) {
      validateTrigger(
        nodeId,
        `/events/${escapeJsonPointerSegment(eventName)}`,
        trigger,
        slotScope
      );
    }
  };

  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    const slotScope = slotScopesByNodeId.get(nodeId);
    if (node.kind === 'element') {
      validateElement(nodeId, node, slotScope);
      continue;
    }
    if (node.kind === 'component-instance') {
      for (const [memberId, value] of sortedEntries(node.bindings.props)) {
        validateValue(
          nodeId,
          `/bindings/props/${escapeJsonPointerSegment(memberId)}`,
          value,
          slotScope
        );
      }
      for (const [memberId, trigger] of sortedEntries(node.bindings.events)) {
        validateTrigger(
          nodeId,
          `/bindings/events/${escapeJsonPointerSegment(memberId)}`,
          trigger,
          slotScope
        );
      }
      continue;
    }
    if (node.kind === 'component-slot-outlet') {
      const slot = document.componentContract?.slotsById[node.slotMemberId];
      for (const [memberId, value] of sortedEntries(node.bindings.props)) {
        const fieldPath = `/bindings/props/${escapeJsonPointerSegment(memberId)}`;
        if (slot && !hasOwn(slot.propsById ?? {}, memberId)) {
          addIssue(
            PIR_BINDING_VALIDATION_CODES.slotOutletBinding,
            nodeFieldPath(nodeId, fieldPath),
            'Slot outlet binding keys must reference props of its local slot Contract.'
          );
        }
        // Outlet values always evaluate in Definition scope, not consumer slot scope.
        validateValue(nodeId, fieldPath, value, undefined);
      }
      continue;
    }
    if (node.source.kind === 'binding') {
      validateValue(
        nodeId,
        '/source/value',
        node.source.value,
        slotScope,
        'collection-source'
      );
    }
    if (node.key.kind === 'binding') {
      validateValue(
        nodeId,
        '/key/value',
        node.key.value,
        slotScope,
        'collection-key'
      );
    }
  }

  return issues.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.code, right.code) ||
      compareText(left.message, right.message)
  );
};
