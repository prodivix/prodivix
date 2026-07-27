import {
  createCodeReferenceSemanticTarget,
  createComponentSymbolId,
  createDataOperationSymbolId,
  createPirNodeScopeId,
  createPirNodeSymbolId,
  createPirDataSymbolId,
  createPirParamSymbolId,
  createPirRegionSymbolId,
  createPirStateSymbolId,
  createRouteSymbolId,
  createSemanticId,
  createWorkspaceDocumentSymbolId,
  type DataOperationInputBinding,
  type WorkspaceDependencyContribution,
} from '@prodivix/authoring';
import type { PIRDocument } from '../pir.types';
import { createPirInstanceSlotScopes } from '../pirBindingValidator';
import {
  createPirBindingScopeResolver,
  type PIRBindingScopeResolver,
} from './pirBindingScope';
import {
  addPirCollectionFacts,
  addPirNodeBindingFacts,
  createPirCollectionSymbolIds,
} from './pirSemanticBindingFacts';
import type { MutablePIRSemanticContribution } from './pirSemanticContractFacts';

export type PIRGraphDocumentType = 'pir-page' | 'pir-layout' | 'pir-component';

export type AddPIRDocumentGraphFactsInput = Readonly<{
  workspaceId: string;
  documentId: string;
  documentType: PIRGraphDocumentType;
  document: PIRDocument;
}>;

type DocumentFactsContext = AddPIRDocumentGraphFactsInput &
  Readonly<{
    baseScopeId: string;
    bindingScopeResolver: PIRBindingScopeResolver;
    collectionSymbolIds: ReadonlyMap<string, string>;
    instanceSlotScopesByNodeId: ReturnType<typeof createPirInstanceSlotScopes>;
  }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedEntries = <T>(
  value: Readonly<Record<string, T>>
): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const toJsonPointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const createDocumentOwnerRef = (workspaceId: string, documentId: string) =>
  ({ kind: 'document', workspaceId, documentId }) as const;

const createNodeOwnerRef = (documentId: string, nodeId: string) =>
  ({ kind: 'pir-node', documentId, nodeId }) as const;

const createInspectorFieldRef = (
  documentId: string,
  nodeId: string,
  fieldPath: string
) => ({ kind: 'inspector-field', documentId, nodeId, fieldPath }) as const;

const addDependency = (
  contribution: MutablePIRSemanticContribution,
  dependency: WorkspaceDependencyContribution
): void => {
  contribution.dependencies.push(dependency);
};

const addDocumentLogicFacts = (
  contribution: MutablePIRSemanticContribution,
  context: DocumentFactsContext
): void => {
  const ownerRef = createDocumentOwnerRef(
    context.workspaceId,
    context.documentId
  );
  const ownerSymbolId =
    context.documentType === 'pir-component'
      ? createComponentSymbolId(context.workspaceId, context.documentId)
      : createWorkspaceDocumentSymbolId(
          context.workspaceId,
          context.documentId
        );
  const dependencyKind =
    context.documentType === 'pir-component' ? 'component' : 'document';

  for (const [paramId, definition] of sortedEntries(
    context.document.logic?.props ?? {}
  )) {
    const symbolId = createPirParamSymbolId(
      context.workspaceId,
      context.documentId,
      paramId
    );
    contribution.symbols.push({
      id: symbolId,
      stability: 'durable',
      kind: 'param',
      name: definition.name ?? paramId,
      qualifiedName: `${context.documentId}.logic.props.${paramId}`,
      scopeId: context.baseScopeId,
      ownerRef,
      typeRef: definition.typeRef,
    });
    addDependency(contribution, {
      id: createSemanticId(
        'pir-logic-dependency',
        context.workspaceId,
        context.documentId,
        'param',
        paramId
      ),
      kind: dependencyKind,
      sourceSymbolId: symbolId,
      targetSymbolId: ownerSymbolId,
    });
  }
  for (const [stateId, definition] of sortedEntries(
    context.document.logic?.state ?? {}
  )) {
    const symbolId = createPirStateSymbolId(
      context.workspaceId,
      context.documentId,
      stateId
    );
    contribution.symbols.push({
      id: symbolId,
      stability: 'durable',
      kind: 'state',
      name: definition.name ?? stateId,
      qualifiedName: `${context.documentId}.logic.state.${stateId}`,
      scopeId: context.baseScopeId,
      ownerRef,
      ...(definition.typeRef ? { typeRef: definition.typeRef } : {}),
    });
    addDependency(contribution, {
      id: createSemanticId(
        'pir-logic-dependency',
        context.workspaceId,
        context.documentId,
        'state',
        stateId
      ),
      kind: dependencyKind,
      sourceSymbolId: symbolId,
      targetSymbolId: ownerSymbolId,
    });
  }
  for (const [dataId, binding] of sortedEntries(
    context.document.logic?.dataById ?? {}
  )) {
    const symbolId = createPirDataSymbolId(
      context.workspaceId,
      context.documentId,
      dataId
    );
    const operationSymbolId = createDataOperationSymbolId(
      context.workspaceId,
      binding.operation.documentId,
      binding.operation.operationId
    );
    contribution.symbols.push({
      id: symbolId,
      stability: 'durable',
      kind: 'data',
      name: dataId,
      qualifiedName: `${context.documentId}.logic.dataById.${dataId}`,
      scopeId: context.baseScopeId,
      ownerRef,
      typeRef: 'data-operation-result',
      capabilityIds: ['data-operation-binding'],
    });
    contribution.references.push({
      id: createSemanticId(
        'pir-data-operation-reference',
        context.workspaceId,
        context.documentId,
        dataId
      ),
      kind: 'data-operation',
      sourceRef: ownerRef,
      sourceSymbolId: symbolId,
      scopeId: context.baseScopeId,
      target: { kind: 'symbol-id', symbolId: operationSymbolId },
      resolutionMode: 'addressable',
      expectedTypeRefs: ['data-operation:query'],
      requiresDurableTarget: true,
    });
    const addInputReference = (
      input: DataOperationInputBinding,
      fieldPath: string
    ): void => {
      if (input.kind === 'runtime-value') {
        contribution.references.push({
          id: createSemanticId(
            'pir-data-input-reference',
            context.workspaceId,
            context.documentId,
            dataId,
            fieldPath
          ),
          kind: 'binding',
          sourceRef: ownerRef,
          sourceSymbolId: symbolId,
          scopeId: context.baseScopeId,
          target: { kind: 'symbol-id', symbolId: input.valueId },
          resolutionMode: 'visible',
        });
        return;
      }
      if (input.kind === 'code') {
        const referencePath = `${fieldPath}/reference`;
        contribution.references.push({
          id: createSemanticId(
            'pir-data-input-code-reference',
            context.workspaceId,
            context.documentId,
            dataId,
            referencePath
          ),
          kind: 'code-reference',
          sourceRef: ownerRef,
          sourceSymbolId: symbolId,
          scopeId: context.baseScopeId,
          target: createCodeReferenceSemanticTarget(
            context.workspaceId,
            input.reference
          ),
          resolutionMode:
            input.reference.exportName && !input.reference.symbolId
              ? 'addressable'
              : 'visible',
          requiresDurableTarget: true,
        });
        addInputReference(input.input, `${fieldPath}/input`);
        return;
      }
      if (input.kind === 'object') {
        Object.entries(input.propertiesByKey).forEach(([key, child]) =>
          addInputReference(child, `${fieldPath}/propertiesByKey/${key}`)
        );
        return;
      }
      if (input.kind === 'array')
        input.items.forEach((child, index) =>
          addInputReference(child, `${fieldPath}/items/${index}`)
        );
    };
    if (binding.input) addInputReference(binding.input, 'input');
    binding.activations?.forEach((activation, index) => {
      if (activation.kind === 'document') return;
      contribution.references.push({
        id: createSemanticId(
          'pir-data-activation-reference',
          context.workspaceId,
          context.documentId,
          dataId,
          String(index)
        ),
        kind: 'binding',
        sourceRef: ownerRef,
        sourceSymbolId: symbolId,
        scopeId: context.baseScopeId,
        target: {
          kind: 'symbol-id',
          symbolId:
            activation.kind === 'route'
              ? createRouteSymbolId(context.workspaceId, activation.routeId)
              : activation.dependencyId,
        },
        resolutionMode: 'visible',
      });
    });
  }
};

const addGraphFacts = (
  contribution: MutablePIRSemanticContribution,
  context: DocumentFactsContext
): void => {
  const graph = context.document.ui.graph;
  const ownerSymbolId =
    context.documentType === 'pir-component'
      ? createComponentSymbolId(context.workspaceId, context.documentId)
      : createWorkspaceDocumentSymbolId(
          context.workspaceId,
          context.documentId
        );
  const dependencyKind =
    context.documentType === 'pir-component' ? 'component' : 'document';
  for (const [nodeId, node] of sortedEntries(graph.nodesById)) {
    const nodeScopeId = createPirNodeScopeId(
      context.workspaceId,
      context.documentId,
      nodeId
    );
    const nodeSymbolId = createPirNodeSymbolId(
      context.workspaceId,
      context.documentId,
      nodeId
    );
    const nodeParentScopeId =
      context.bindingScopeResolver.resolveNodeParentScope(nodeId)?.scopeId ??
      context.baseScopeId;
    contribution.scopes.push({
      id: nodeScopeId,
      kind: 'pir-node',
      ownerRef: createNodeOwnerRef(context.documentId, nodeId),
      parentId: nodeParentScopeId,
    });
    contribution.symbols.push({
      id: nodeSymbolId,
      stability: 'durable',
      kind: 'pir-node',
      name: nodeId,
      displayName: node.kind === 'element' ? node.type : node.kind,
      qualifiedName: `${context.documentId}#${nodeId}`,
      scopeId: context.baseScopeId,
      ownerRef: createNodeOwnerRef(context.documentId, nodeId),
      typeRef: `pir:node/${node.kind}`,
      capabilityIds: [
        ...(nodeId === graph.rootId
          ? ['pir:root', 'behavior:pir:lifecycle']
          : []),
        'behavior:pir:visible',
        ...(node.kind === 'element' ? ['behavior:pir:click'] : []),
        ...(node.kind === 'element' && Object.keys(node.events ?? {}).length
          ? ['behavior:pir:event']
          : []),
        ...(node.kind === 'element' &&
        /^(?:input|textarea|select)$/i.test(node.type)
          ? ['behavior:pir:input', 'behavior:pir:value']
          : []),
      ],
    });
    addDependency(contribution, {
      id: createSemanticId(
        'pir-owner-node-dependency',
        context.workspaceId,
        context.documentId,
        nodeId
      ),
      kind: dependencyKind,
      sourceSymbolId: nodeSymbolId,
      targetSymbolId: ownerSymbolId,
    });

    for (const regionName of Object.keys(
      graph.regionsById?.[nodeId] ?? {}
    ).sort(compareText)) {
      const regionSymbolId = createPirRegionSymbolId(
        context.workspaceId,
        context.documentId,
        nodeId,
        regionName
      );
      contribution.symbols.push({
        id: regionSymbolId,
        stability: 'durable',
        kind: 'pir-region',
        name: regionName,
        qualifiedName: `${context.documentId}#${nodeId}.${regionName}`,
        scopeId: nodeScopeId,
        ownerRef: createInspectorFieldRef(
          context.documentId,
          nodeId,
          `/regions/${toJsonPointerToken(regionName)}`
        ),
      });
      addDependency(contribution, {
        id: createSemanticId(
          'pir-region-dependency',
          context.workspaceId,
          context.documentId,
          nodeId,
          regionName
        ),
        kind: 'document',
        sourceSymbolId: regionSymbolId,
        targetSymbolId: nodeSymbolId,
      });
    }

    if (node.kind === 'collection') {
      addPirCollectionFacts(
        contribution,
        context,
        nodeId,
        node,
        nodeScopeId,
        nodeParentScopeId
      );
    }
    addPirNodeBindingFacts(contribution, context, nodeId, node, nodeScopeId);
  }
};

/** Adds PIR graph, logic, node, region, and lexical-scope semantic facts. */
export const addPirDocumentGraphFacts = (
  contribution: MutablePIRSemanticContribution,
  input: AddPIRDocumentGraphFactsInput
): void => {
  const bindingScopeResolver = createPirBindingScopeResolver(input);
  const context: DocumentFactsContext = {
    ...input,
    baseScopeId: bindingScopeResolver.baseScope.scopeId,
    bindingScopeResolver,
    collectionSymbolIds: createPirCollectionSymbolIds(
      input.workspaceId,
      input.documentId,
      input.document.ui.graph
    ),
    instanceSlotScopesByNodeId: createPirInstanceSlotScopes(
      input.document.ui.graph
    ),
  };
  addDocumentLogicFacts(contribution, context);
  addGraphFacts(contribution, context);
};
