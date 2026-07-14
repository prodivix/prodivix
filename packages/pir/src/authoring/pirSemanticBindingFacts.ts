import {
  createAnimationTimelineSymbolId,
  createCodeReferenceSemanticTarget,
  createComponentContractMemberSymbolId,
  createComponentSlotPropSymbolId,
  createComponentSymbolId,
  createComponentVariantOptionSymbolId,
  createPirCollectionErrorScopeId,
  createPirCollectionErrorSymbolId,
  createPirCollectionIndexSymbolId,
  createPirCollectionItemSymbolId,
  createPirCollectionScopeId,
  createPirDataSymbolId,
  createPirNodeSymbolId,
  createPirParamSymbolId,
  createPirStateSymbolId,
  createRouteSymbolId,
  createSemanticId,
  createWorkspaceDocumentSymbolId,
  type WorkspaceReferenceFact,
} from '@prodivix/authoring';
import type {
  PIRCollectionNode,
  PIRDocument,
  PIRNode,
  PIRTriggerBinding,
  PIRUiGraph,
  PIRValueBinding,
} from '../pir.types';
import type { PIRInstanceSlotScope } from '../pirBindingValidator';
import type { MutablePIRSemanticContribution } from './pirSemanticContractFacts';

export type PIRSemanticBindingContext = Readonly<{
  workspaceId: string;
  documentId: string;
  document: PIRDocument;
  collectionSymbolIds: ReadonlyMap<string, string>;
  instanceSlotScopesByNodeId: ReadonlyMap<string, PIRInstanceSlotScope>;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <T>(
  value: Readonly<Record<string, T>>
): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const toJsonPointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const createNodeOwnerRef = (documentId: string, nodeId: string) =>
  ({ kind: 'pir-node', documentId, nodeId }) as const;

const createInspectorFieldRef = (
  documentId: string,
  nodeId: string,
  fieldPath: string
) => ({ kind: 'inspector-field', documentId, nodeId, fieldPath }) as const;

const addReference = (
  contribution: MutablePIRSemanticContribution,
  input: {
    context: PIRSemanticBindingContext;
    nodeId: string;
    fieldPath: string;
    role: string;
    scopeId: string;
    kind: WorkspaceReferenceFact['kind'];
    target: WorkspaceReferenceFact['target'];
    diagnosticPolicy?: WorkspaceReferenceFact['diagnosticPolicy'];
    resolutionMode?: WorkspaceReferenceFact['resolutionMode'];
    requiresDurableTarget?: boolean;
  }
): void => {
  contribution.references.push({
    id: createSemanticId(
      'pir-reference',
      input.context.workspaceId,
      input.context.documentId,
      input.nodeId,
      input.fieldPath,
      input.role
    ),
    kind: input.kind,
    sourceRef: createInspectorFieldRef(
      input.context.documentId,
      input.nodeId,
      input.fieldPath
    ),
    sourceSymbolId: createPirNodeSymbolId(
      input.context.workspaceId,
      input.context.documentId,
      input.nodeId
    ),
    scopeId: input.scopeId,
    target: input.target,
    resolutionMode:
      input.resolutionMode ??
      (input.target.kind === 'symbol-id' ? 'addressable' : 'visible'),
    ...(input.requiresDurableTarget !== false &&
    (input.target.kind === 'symbol-id' ||
      input.resolutionMode === 'addressable')
      ? { requiresDurableTarget: true }
      : {}),
    ...(input.diagnosticPolicy
      ? { diagnosticPolicy: input.diagnosticPolicy }
      : {}),
  });
};

const addValueBindingReference = (
  contribution: MutablePIRSemanticContribution,
  input: {
    context: PIRSemanticBindingContext;
    nodeId: string;
    fieldPath: string;
    scopeId: string;
    value: PIRValueBinding | undefined;
    kind?: WorkspaceReferenceFact['kind'];
  }
): void => {
  if (!input.value || input.value.kind === 'literal') return;
  let target: WorkspaceReferenceFact['target'];
  let role: string = input.value.kind;
  let requiresDurableTarget: boolean | undefined;
  let resolutionMode: WorkspaceReferenceFact['resolutionMode'] | undefined;
  switch (input.value.kind) {
    case 'param':
      target = {
        kind: 'symbol-id',
        symbolId: createPirParamSymbolId(
          input.context.workspaceId,
          input.context.documentId,
          input.value.paramId
        ),
      };
      break;
    case 'state':
      target = {
        kind: 'symbol-id',
        symbolId: createPirStateSymbolId(
          input.context.workspaceId,
          input.context.documentId,
          input.value.stateId
        ),
      };
      break;
    case 'data':
      target = {
        kind: 'symbol-id',
        symbolId: createPirDataSymbolId(
          input.context.workspaceId,
          input.context.documentId,
          input.value.dataId
        ),
      };
      requiresDurableTarget = false;
      break;
    case 'collection-symbol': {
      const symbolId = input.context.collectionSymbolIds.get(
        input.value.symbolId
      );
      target = {
        kind: 'symbol-id',
        symbolId:
          symbolId ??
          createSemanticId(
            'pir-unresolved-collection-symbol',
            input.context.workspaceId,
            input.context.documentId,
            input.value.symbolId
          ),
      };
      break;
    }
    case 'component-prop':
      target = {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          input.context.workspaceId,
          input.context.documentId,
          'prop',
          input.value.memberId
        ),
      };
      break;
    case 'component-variant':
      target = {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          input.context.workspaceId,
          input.context.documentId,
          'variant',
          input.value.memberId
        ),
      };
      break;
    case 'slot-prop': {
      const slotScope = input.context.instanceSlotScopesByNodeId.get(
        input.nodeId
      );
      target = {
        kind: 'symbol-id',
        symbolId: slotScope
          ? createComponentSlotPropSymbolId(
              input.context.workspaceId,
              slotScope.componentDocumentId,
              slotScope.slotMemberId,
              input.value.memberId
            )
          : createSemanticId(
              'pir-unresolved-slot-prop',
              input.context.workspaceId,
              input.context.documentId,
              input.nodeId,
              input.value.memberId
            ),
      };
      break;
    }
    case 'code':
      target = createCodeReferenceSemanticTarget(
        input.context.workspaceId,
        input.value.reference
      );
      role =
        input.value.reference.symbolId || input.value.reference.exportName
          ? 'code-symbol'
          : 'code-artifact';
      if (input.value.reference.exportName && !input.value.reference.symbolId) {
        resolutionMode = 'addressable';
      }
      break;
  }
  addReference(contribution, {
    ...input,
    role,
    kind: input.kind ?? 'binding',
    target,
    resolutionMode,
    requiresDurableTarget,
  });
};

const addTriggerReference = (
  contribution: MutablePIRSemanticContribution,
  input: {
    context: PIRSemanticBindingContext;
    nodeId: string;
    fieldPath: string;
    scopeId: string;
    trigger: PIRTriggerBinding;
  }
): void => {
  switch (input.trigger.kind) {
    case 'open-url':
      return;
    case 'call-code':
      addReference(contribution, {
        ...input,
        role:
          input.trigger.reference.symbolId || input.trigger.reference.exportName
            ? 'code-symbol'
            : 'code-artifact',
        kind: 'code-reference',
        target: createCodeReferenceSemanticTarget(
          input.context.workspaceId,
          input.trigger.reference
        ),
        ...(input.trigger.reference.exportName &&
        !input.trigger.reference.symbolId
          ? { resolutionMode: 'addressable' as const }
          : {}),
      });
      return;
    case 'navigate-route':
      addReference(contribution, {
        ...input,
        role: 'route',
        kind: 'binding',
        target: {
          kind: 'symbol-id',
          symbolId: createRouteSymbolId(
            input.context.workspaceId,
            input.trigger.routeId
          ),
        },
      });
      return;
    case 'run-nodegraph':
      addReference(contribution, {
        ...input,
        role: 'nodegraph',
        kind: 'binding',
        target: {
          kind: 'symbol-id',
          symbolId: createWorkspaceDocumentSymbolId(
            input.context.workspaceId,
            input.trigger.documentId
          ),
        },
        diagnosticPolicy: 'report',
      });
      return;
    case 'play-animation':
      addReference(contribution, {
        ...input,
        role: 'animation-timeline',
        kind: 'binding',
        target: {
          kind: 'symbol-id',
          symbolId: createAnimationTimelineSymbolId(
            input.context.workspaceId,
            input.trigger.documentId,
            input.trigger.timelineId
          ),
        },
        diagnosticPolicy: 'report',
      });
      return;
    case 'emit-component-event':
      addReference(contribution, {
        ...input,
        role: 'component-event-emission',
        kind: 'component-member',
        target: {
          kind: 'symbol-id',
          symbolId: createComponentContractMemberSymbolId(
            input.context.workspaceId,
            input.context.documentId,
            'event',
            input.trigger.memberId
          ),
        },
      });
      addValueBindingReference(contribution, {
        context: input.context,
        nodeId: input.nodeId,
        fieldPath: `${input.fieldPath}/payload`,
        scopeId: input.scopeId,
        value: input.trigger.payload,
      });
  }
};

export const createPirCollectionSymbolIds = (
  workspaceId: string,
  documentId: string,
  graph: PIRUiGraph
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    if (node.kind !== 'collection') continue;
    result.set(
      node.symbols.itemId,
      createPirCollectionItemSymbolId(
        workspaceId,
        documentId,
        nodeId,
        node.symbols.itemId
      )
    );
    result.set(
      node.symbols.indexId,
      createPirCollectionIndexSymbolId(
        workspaceId,
        documentId,
        nodeId,
        node.symbols.indexId
      )
    );
    if (node.symbols.errorId) {
      result.set(
        node.symbols.errorId,
        createPirCollectionErrorSymbolId(
          workspaceId,
          documentId,
          nodeId,
          node.symbols.errorId
        )
      );
    }
  }
  return result;
};

export const addPirCollectionFacts = (
  contribution: MutablePIRSemanticContribution,
  context: PIRSemanticBindingContext,
  nodeId: string,
  node: PIRCollectionNode,
  nodeScopeId: string,
  nodeParentScopeId: string
): void => {
  const collectionScopeId = createPirCollectionScopeId(
    context.workspaceId,
    context.documentId,
    nodeId
  );
  contribution.scopes.push({
    id: collectionScopeId,
    kind: 'collection-item',
    ownerRef: createNodeOwnerRef(context.documentId, nodeId),
    parentId: nodeScopeId,
  });
  const itemSymbolId = createPirCollectionItemSymbolId(
    context.workspaceId,
    context.documentId,
    nodeId,
    node.symbols.itemId
  );
  const indexSymbolId = createPirCollectionIndexSymbolId(
    context.workspaceId,
    context.documentId,
    nodeId,
    node.symbols.indexId
  );
  contribution.symbols.push(
    {
      id: itemSymbolId,
      stability: 'durable',
      kind: 'collection-item',
      name: node.symbols.itemName,
      qualifiedName: `${context.documentId}#${nodeId}.${node.symbols.itemId}`,
      scopeId: collectionScopeId,
      ownerRef: createInspectorFieldRef(
        context.documentId,
        nodeId,
        '/symbols/itemId'
      ),
    },
    {
      id: indexSymbolId,
      stability: 'durable',
      kind: 'collection-index',
      name: node.symbols.indexName,
      qualifiedName: `${context.documentId}#${nodeId}.${node.symbols.indexId}`,
      scopeId: collectionScopeId,
      ownerRef: createInspectorFieldRef(
        context.documentId,
        nodeId,
        '/symbols/indexId'
      ),
      typeRef: 'number',
    }
  );
  for (const [role, symbolId] of [
    ['item', itemSymbolId],
    ['index', indexSymbolId],
  ] as const) {
    contribution.dependencies.push({
      id: createSemanticId(
        'pir-collection-symbol-dependency',
        context.workspaceId,
        context.documentId,
        nodeId,
        role
      ),
      kind: 'document',
      sourceSymbolId: symbolId,
      targetSymbolId: createPirNodeSymbolId(
        context.workspaceId,
        context.documentId,
        nodeId
      ),
    });
  }
  if (node.symbols.errorId) {
    const errorScopeId = createPirCollectionErrorScopeId(
      context.workspaceId,
      context.documentId,
      nodeId
    );
    const errorSymbolId = createPirCollectionErrorSymbolId(
      context.workspaceId,
      context.documentId,
      nodeId,
      node.symbols.errorId
    );
    contribution.scopes.push({
      id: errorScopeId,
      kind: 'collection-error',
      ownerRef: createNodeOwnerRef(context.documentId, nodeId),
      parentId: nodeScopeId,
    });
    contribution.symbols.push({
      id: errorSymbolId,
      stability: 'durable',
      kind: 'collection-error',
      name: 'error',
      qualifiedName: `${context.documentId}#${nodeId}.${node.symbols.errorId}`,
      scopeId: errorScopeId,
      ownerRef: createInspectorFieldRef(
        context.documentId,
        nodeId,
        '/symbols/errorId'
      ),
      typeRef: 'unknown',
    });
    contribution.dependencies.push({
      id: createSemanticId(
        'pir-collection-symbol-dependency',
        context.workspaceId,
        context.documentId,
        nodeId,
        'error'
      ),
      kind: 'document',
      sourceSymbolId: errorSymbolId,
      targetSymbolId: createPirNodeSymbolId(
        context.workspaceId,
        context.documentId,
        nodeId
      ),
    });
  }

  if (node.source.kind === 'binding') {
    addValueBindingReference(contribution, {
      context,
      nodeId,
      fieldPath: '/source',
      scopeId: nodeParentScopeId,
      value: node.source.value,
      kind: 'collection-source',
    });
  }
  if (node.key.kind === 'binding') {
    addValueBindingReference(contribution, {
      context,
      nodeId,
      fieldPath: '/key',
      scopeId: collectionScopeId,
      value: node.key.value,
      kind: 'collection-key',
    });
  }
};

const addElementValueReferences = (
  contribution: MutablePIRSemanticContribution,
  context: PIRSemanticBindingContext,
  nodeId: string,
  node: Extract<PIRNode, { kind: 'element' }>,
  nodeScopeId: string
): void => {
  addValueBindingReference(contribution, {
    context,
    nodeId,
    fieldPath: '/text',
    scopeId: nodeScopeId,
    value: node.text,
  });
  for (const [name, value] of sortedEntries(node.style ?? {})) {
    addValueBindingReference(contribution, {
      context,
      nodeId,
      fieldPath: `/style/${toJsonPointerToken(name)}`,
      scopeId: nodeScopeId,
      value,
    });
  }
  for (const [name, value] of sortedEntries(node.props ?? {})) {
    addValueBindingReference(contribution, {
      context,
      nodeId,
      fieldPath: `/props/${toJsonPointerToken(name)}`,
      scopeId: nodeScopeId,
      value,
    });
  }
  if (node.data) {
    for (const [fieldPath, value] of [
      ['/data/source', node.data.source],
      ['/data/value', node.data.value],
      ['/data/mock', node.data.mock],
    ] as const) {
      addValueBindingReference(contribution, {
        context,
        nodeId,
        fieldPath,
        scopeId: nodeScopeId,
        value,
      });
    }
    for (const [name, value] of sortedEntries(node.data.extend ?? {})) {
      addValueBindingReference(contribution, {
        context,
        nodeId,
        fieldPath: `/data/extend/${toJsonPointerToken(name)}`,
        scopeId: nodeScopeId,
        value,
      });
    }
    contribution.symbols.push({
      id: createPirDataSymbolId(
        context.workspaceId,
        context.documentId,
        nodeId
      ),
      stability: 'revision-scoped',
      kind: 'data',
      name: '$data',
      scopeId: nodeScopeId,
      ownerRef: createInspectorFieldRef(context.documentId, nodeId, '/data'),
    });
  }
  for (const [eventName, trigger] of sortedEntries(node.events ?? {})) {
    addTriggerReference(contribution, {
      context,
      nodeId,
      fieldPath: `/events/${toJsonPointerToken(eventName)}`,
      scopeId: nodeScopeId,
      trigger,
    });
  }
};

const addComponentInstanceFacts = (
  contribution: MutablePIRSemanticContribution,
  context: PIRSemanticBindingContext,
  nodeId: string,
  node: Extract<PIRNode, { kind: 'component-instance' }>,
  nodeScopeId: string
): void => {
  const componentSymbolId = createComponentSymbolId(
    context.workspaceId,
    node.componentDocumentId
  );
  addReference(contribution, {
    context,
    nodeId,
    fieldPath: '/componentDocumentId',
    role: 'component-definition',
    scopeId: nodeScopeId,
    kind: 'component-instance',
    target: { kind: 'symbol-id', symbolId: componentSymbolId },
  });
  contribution.dependencies.push({
    id: createSemanticId(
      'pir-component-instance-dependency',
      context.workspaceId,
      context.documentId,
      nodeId,
      node.componentDocumentId
    ),
    kind: 'component',
    sourceSymbolId: createPirNodeSymbolId(
      context.workspaceId,
      context.documentId,
      nodeId
    ),
    targetSymbolId: componentSymbolId,
  });

  for (const [memberId, value] of sortedEntries(node.bindings.props)) {
    const fieldPath = `/bindings/props/${toJsonPointerToken(memberId)}`;
    addReference(contribution, {
      context,
      nodeId,
      fieldPath,
      role: 'component-prop',
      scopeId: nodeScopeId,
      kind: 'component-member',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          context.workspaceId,
          node.componentDocumentId,
          'prop',
          memberId
        ),
      },
    });
    addValueBindingReference(contribution, {
      context,
      nodeId,
      fieldPath: `${fieldPath}/value`,
      scopeId: nodeScopeId,
      value,
    });
  }
  for (const [memberId, trigger] of sortedEntries(node.bindings.events)) {
    const fieldPath = `/bindings/events/${toJsonPointerToken(memberId)}`;
    addReference(contribution, {
      context,
      nodeId,
      fieldPath,
      role: 'component-event',
      scopeId: nodeScopeId,
      kind: 'component-member',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          context.workspaceId,
          node.componentDocumentId,
          'event',
          memberId
        ),
      },
    });
    addTriggerReference(contribution, {
      context,
      nodeId,
      fieldPath: `${fieldPath}/trigger`,
      scopeId: nodeScopeId,
      trigger,
    });
  }
  for (const [memberId, optionId] of sortedEntries(node.bindings.variants)) {
    const fieldPath = `/bindings/variants/${toJsonPointerToken(memberId)}`;
    addReference(contribution, {
      context,
      nodeId,
      fieldPath,
      role: 'component-variant',
      scopeId: nodeScopeId,
      kind: 'component-member',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          context.workspaceId,
          node.componentDocumentId,
          'variant',
          memberId
        ),
      },
    });
    addReference(contribution, {
      context,
      nodeId,
      fieldPath,
      role: 'component-variant-option',
      scopeId: nodeScopeId,
      kind: 'component-member',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentVariantOptionSymbolId(
          context.workspaceId,
          node.componentDocumentId,
          memberId,
          optionId
        ),
      },
    });
  }
  for (const slotMemberId of Object.keys(
    context.document.ui.graph.regionsById?.[nodeId] ?? {}
  ).sort(compareText)) {
    addReference(contribution, {
      context,
      nodeId,
      fieldPath: `/regions/${toJsonPointerToken(slotMemberId)}`,
      role: 'component-slot',
      scopeId: nodeScopeId,
      kind: 'slot-projection',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          context.workspaceId,
          node.componentDocumentId,
          'slot',
          slotMemberId
        ),
      },
    });
  }
};

export const addPirNodeBindingFacts = (
  contribution: MutablePIRSemanticContribution,
  context: PIRSemanticBindingContext,
  nodeId: string,
  node: PIRNode,
  nodeScopeId: string
): void => {
  if (node.kind === 'element') {
    addElementValueReferences(contribution, context, nodeId, node, nodeScopeId);
    return;
  }
  if (node.kind === 'component-slot-outlet') {
    addReference(contribution, {
      context,
      nodeId,
      fieldPath: '/slotMemberId',
      role: 'slot-outlet',
      scopeId: nodeScopeId,
      kind: 'slot-projection',
      target: {
        kind: 'symbol-id',
        symbolId: createComponentContractMemberSymbolId(
          context.workspaceId,
          context.documentId,
          'slot',
          node.slotMemberId
        ),
      },
    });
    for (const [memberId, value] of sortedEntries(node.bindings.props)) {
      const fieldPath = `/bindings/props/${toJsonPointerToken(memberId)}`;
      addReference(contribution, {
        context,
        nodeId,
        fieldPath,
        role: 'slot-outlet-prop',
        scopeId: nodeScopeId,
        kind: 'component-member',
        target: {
          kind: 'symbol-id',
          symbolId: createComponentSlotPropSymbolId(
            context.workspaceId,
            context.documentId,
            node.slotMemberId,
            memberId
          ),
        },
      });
      addValueBindingReference(contribution, {
        context,
        nodeId,
        fieldPath: `${fieldPath}/value`,
        scopeId: nodeScopeId,
        value,
      });
    }
    return;
  }
  if (node.kind === 'component-instance') {
    addComponentInstanceFacts(contribution, context, nodeId, node, nodeScopeId);
  }
};
