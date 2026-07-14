import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createComponentContractMemberSymbolId,
  createComponentScopeId,
  createComponentSlotPropSymbolId,
  createComponentSymbolId,
  createComponentVariantOptionSymbolId,
  createPirNodeSymbolId,
  createWorkspaceDocumentSymbolId,
  isSameSemanticWorkspaceRevisions,
  type WorkspaceReferenceEdge,
  type WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import type { PIRComponentContract } from '@prodivix/pir';
import { captureWorkspaceSemanticRevisions } from '../authoring/workspaceSemanticRevision';
import { validateWorkspaceComponentGraph } from './workspaceComponentGraph';
import {
  WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES,
  type AnalyzeWorkspaceComponentImpactInput,
  type WorkspaceComponentContractSymbolTarget,
  type WorkspaceComponentImpactAnalysisResult,
  type WorkspaceComponentImpactPlanIssue,
  type WorkspaceComponentInstanceImpact,
  type WorkspaceComponentReferenceImpact,
} from './workspaceComponentImpact.types';
import { decodeWorkspacePirDocument } from './workspacePirDocument';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedKeys = (value: Readonly<Record<string, unknown>>): string[] =>
  Object.keys(value).sort(compareText);

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isCanonicalRequiredText = (value: string): boolean =>
  value.length > 0 && value === value.trim();

const compareIssues = (
  left: WorkspaceComponentImpactPlanIssue,
  right: WorkspaceComponentImpactPlanIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message) ||
  compareText(left.referenceId ?? '', right.referenceId ?? '') ||
  compareText(left.dependencyId ?? '', right.dependencyId ?? '');

const reject = (
  issues: readonly WorkspaceComponentImpactPlanIssue[]
): WorkspaceComponentImpactAnalysisResult => ({
  status: 'rejected',
  issues: [...issues].sort(compareIssues),
});

const getSourceDocumentId = (
  reference: WorkspaceReferenceEdge
): string | undefined => {
  switch (reference.sourceRef.kind) {
    case 'document':
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'animation-timeline':
    case 'animation-track':
    case 'component-slot':
      return reference.sourceRef.documentId;
    case 'code-artifact':
      return reference.sourceRef.artifactId;
    default:
      return undefined;
  }
};

const getSourceNodeId = (
  reference: WorkspaceReferenceEdge
): string | undefined => {
  switch (reference.sourceRef.kind) {
    case 'pir-node':
    case 'inspector-field':
    case 'nodegraph-node':
    case 'nodegraph-port':
    case 'component-slot':
      return reference.sourceRef.nodeId;
    default:
      return undefined;
  }
};

const summarizeReference = (
  reference: WorkspaceReferenceEdge
): WorkspaceComponentReferenceImpact => ({
  referenceId: reference.id,
  targetSymbolId: reference.targetSymbolId!,
  kind: reference.kind,
  addressing: reference.target.kind === 'symbol-id' ? 'durable-id' : 'name',
  sourceKind: reference.sourceRef.kind,
  ...(reference.sourceSymbolId
    ? { sourceSymbolId: reference.sourceSymbolId }
    : {}),
  ...(getSourceDocumentId(reference)
    ? { sourceDocumentId: getSourceDocumentId(reference) }
    : {}),
  ...(getSourceNodeId(reference)
    ? { sourceNodeId: getSourceNodeId(reference) }
    : {}),
  ...(reference.sourceRef.kind === 'route'
    ? { routeId: reference.sourceRef.routeId }
    : {}),
});

const createContractSymbolTargets = (
  workspaceId: string,
  documentId: string,
  contract: PIRComponentContract
): readonly WorkspaceComponentContractSymbolTarget[] => {
  const result: WorkspaceComponentContractSymbolTarget[] = [];
  const addMembers = (
    kind: 'prop' | 'event' | 'slot' | 'variant' | 'part',
    members: Readonly<Record<string, Readonly<{ name: string }>>>
  ) => {
    for (const memberId of sortedKeys(members)) {
      result.push({
        symbolId: createComponentContractMemberSymbolId(
          workspaceId,
          documentId,
          kind,
          memberId
        ),
        kind,
        memberId,
        name: members[memberId]!.name,
      });
    }
  };

  addMembers('prop', contract.propsById);
  addMembers('event', contract.eventsById);
  addMembers('slot', contract.slotsById);
  addMembers('variant', contract.variantAxesById);
  addMembers('part', contract.partsById ?? {});
  for (const slotMemberId of sortedKeys(contract.slotsById)) {
    const slot = contract.slotsById[slotMemberId]!;
    for (const propId of sortedKeys(slot.propsById ?? {})) {
      result.push({
        symbolId: createComponentSlotPropSymbolId(
          workspaceId,
          documentId,
          slotMemberId,
          propId
        ),
        kind: 'slot-prop',
        memberId: propId,
        parentMemberId: slotMemberId,
        name: slot.propsById![propId]!.name,
      });
    }
  }
  for (const variantMemberId of sortedKeys(contract.variantAxesById)) {
    const variant = contract.variantAxesById[variantMemberId]!;
    for (const optionId of sortedKeys(variant.optionsById)) {
      result.push({
        symbolId: createComponentVariantOptionSymbolId(
          workspaceId,
          documentId,
          variantMemberId,
          optionId
        ),
        kind: 'variant-option',
        memberId: optionId,
        parentMemberId: variantMemberId,
        name: variant.optionsById[optionId]!.name,
      });
    }
  }
  return result.sort((left, right) =>
    compareText(left.symbolId, right.symbolId)
  );
};

const collectDirectReferences = (
  semanticIndex: WorkspaceSemanticIndex,
  symbolIds: readonly string[]
): readonly WorkspaceReferenceEdge[] => {
  const references = new Map<string, WorkspaceReferenceEdge>();
  for (const symbolId of symbolIds) {
    const result = semanticIndex.getReferences(symbolId);
    if (result.status !== 'resolved') continue;
    for (const reference of result.references) {
      references.set(reference.id, reference);
    }
  }
  return [...references.values()].sort((left, right) =>
    compareText(left.id, right.id)
  );
};

const collectTransitiveComponentConsumers = (
  targetDocumentId: string,
  edges: ReturnType<typeof validateWorkspaceComponentGraph>['graph']['edges'],
  componentDocumentIds: readonly string[]
): ReadonlySet<string> => {
  const components = new Set(componentDocumentIds);
  const affected = new Set<string>([targetDocumentId]);
  const queue = [targetDocumentId];
  for (let index = 0; index < queue.length; index += 1) {
    const targetId = queue[index]!;
    for (const edge of edges) {
      if (
        edge.targetDocumentId !== targetId ||
        !components.has(edge.sourceDocumentId) ||
        affected.has(edge.sourceDocumentId)
      ) {
        continue;
      }
      affected.add(edge.sourceDocumentId);
      queue.push(edge.sourceDocumentId);
    }
  }
  return affected;
};

const validateSemanticIndexIdentity = (
  input: AnalyzeWorkspaceComponentImpactInput
): readonly WorkspaceComponentImpactPlanIssue[] => {
  const identity = input.semanticIndex.snapshotIdentity;
  if (
    identity.schemaVersion === CURRENT_SEMANTIC_SCHEMA_VERSION &&
    isSameSemanticWorkspaceRevisions(
      identity.workspaceRevisions,
      captureWorkspaceSemanticRevisions(input.workspace)
    )
  ) {
    return [];
  }
  return [
    {
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.semanticIndexStale,
      path: '/semanticIndex/snapshotIdentity',
      message:
        'Component impact analysis requires the exact Workspace revisions and current semantic schema.',
      documentId: input.componentDocumentId,
    },
  ];
};

/**
 * Computes deletion/rename evidence exclusively from the canonical Component
 * graph and its revision-bound Semantic Index projection.
 */
export const analyzeWorkspaceComponentImpact = (
  input: AnalyzeWorkspaceComponentImpactInput
): WorkspaceComponentImpactAnalysisResult => {
  const identityIssues = validateSemanticIndexIdentity(input);
  if (identityIssues.length > 0) return reject(identityIssues);
  if (!isCanonicalRequiredText(input.componentDocumentId)) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.inputInvalid,
        path: '/componentDocumentId',
        message: 'Component document id must be non-empty and trimmed.',
      },
    ]);
  }

  const workspaceDocument = input.workspace.docsById[input.componentDocumentId];
  if (!workspaceDocument) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.targetMissing,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}`,
        message: 'Component document does not exist.',
        documentId: input.componentDocumentId,
      },
    ]);
  }
  if (workspaceDocument.type !== 'pir-component') {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.targetTypeInvalid,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/type`,
        message: 'Component impact target must be a pir-component document.',
        documentId: input.componentDocumentId,
      },
    ]);
  }
  const decoded = decodeWorkspacePirDocument(workspaceDocument, {
    workspaceId: input.workspace.id,
  });
  if (decoded.status !== 'valid') {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.targetInvalid,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/content`,
        message:
          'Component impact target must contain valid canonical PIR content.',
        documentId: input.componentDocumentId,
      },
    ]);
  }
  const contract = decoded.decodedContent.componentContract;
  if (!contract) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.targetContractMissing,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/content/componentContract`,
        message: 'Component impact target must own a Component Contract.',
        documentId: input.componentDocumentId,
      },
    ]);
  }

  const componentSymbolId = createComponentSymbolId(
    input.workspace.id,
    input.componentDocumentId
  );
  const workspaceDocumentSymbolId = createWorkspaceDocumentSymbolId(
    input.workspace.id,
    input.componentDocumentId
  );
  const contractSymbols = createContractSymbolTargets(
    input.workspace.id,
    input.componentDocumentId,
    contract
  );
  const rootSymbolIds = [
    componentSymbolId,
    workspaceDocumentSymbolId,
    ...contractSymbols.map(({ symbolId }) => symbolId),
  ].sort(compareText);
  const requiredSemanticFacts = [
    ...rootSymbolIds.map((symbolId) => input.semanticIndex.getSymbol(symbolId)),
    input.semanticIndex.getSymbol(
      createPirNodeSymbolId(
        input.workspace.id,
        input.componentDocumentId,
        decoded.decodedContent.ui.graph.rootId
      )
    ),
    input.semanticIndex.getScope(
      createComponentScopeId(input.workspace.id, input.componentDocumentId)
    ),
  ];
  if (requiredSemanticFacts.some((fact) => fact === null)) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.semanticIndexIncomplete,
        path: '/semanticIndex',
        message:
          'Semantic Index is missing canonical PIR Component facts for the target revision.',
        documentId: input.componentDocumentId,
      },
    ]);
  }
  const semanticImpactResult = input.semanticIndex.getImpact(rootSymbolIds);
  if (semanticImpactResult.status !== 'resolved') {
    return reject([
      {
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.semanticIndexIncomplete,
        path: '/semanticIndex/impact',
        message:
          'Semantic Index could not resolve the complete Component impact.',
        documentId: input.componentDocumentId,
      },
    ]);
  }

  const graphValidation = validateWorkspaceComponentGraph(input.workspace);
  const targetEdges = graphValidation.graph.edges.filter(
    (edge) => edge.targetDocumentId === input.componentDocumentId
  );
  const directReferenceEdges = collectDirectReferences(
    input.semanticIndex,
    rootSymbolIds
  );
  const componentReferenceByInstance = new Map<
    string,
    WorkspaceReferenceEdge
  >();
  for (const reference of directReferenceEdges) {
    if (
      reference.targetSymbolId === componentSymbolId &&
      reference.kind === 'component-instance' &&
      reference.sourceRef.kind === 'inspector-field'
    ) {
      componentReferenceByInstance.set(
        `${reference.sourceRef.documentId}\u0000${reference.sourceRef.nodeId}`,
        reference
      );
    }
  }
  const missingInstanceFacts = targetEdges.filter(
    (edge) =>
      !componentReferenceByInstance.has(
        `${edge.sourceDocumentId}\u0000${edge.instanceNodeId}`
      )
  );
  if (missingInstanceFacts.length > 0) {
    return reject(
      missingInstanceFacts.map((edge) => ({
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.semanticIndexIncomplete,
        path: edge.path,
        message:
          'Semantic Index is missing a Component Instance reference from the canonical dependency graph.',
        documentId: edge.sourceDocumentId,
        nodeId: edge.instanceNodeId,
      }))
    );
  }

  const instances: WorkspaceComponentInstanceImpact[] = [];
  for (const edge of targetEdges) {
    const sourceDocument = input.workspace.docsById[edge.sourceDocumentId];
    if (!sourceDocument) continue;
    const sourceRead = decodeWorkspacePirDocument(sourceDocument, {
      workspaceId: input.workspace.id,
    });
    if (sourceRead.status !== 'valid') continue;
    const node =
      sourceRead.decodedContent.ui.graph.nodesById[edge.instanceNodeId];
    if (!node || node.kind !== 'component-instance') continue;
    const reference = componentReferenceByInstance.get(
      `${edge.sourceDocumentId}\u0000${edge.instanceNodeId}`
    )!;
    instances.push({
      documentId: edge.sourceDocumentId,
      nodeId: edge.instanceNodeId,
      componentReferenceId: reference.id,
      propMemberIds: sortedKeys(node.bindings.props),
      eventMemberIds: sortedKeys(node.bindings.events),
      variantBindings: Object.entries(node.bindings.variants)
        .map(([memberId, optionId]) => ({ memberId, optionId }))
        .sort(
          (left, right) =>
            compareText(left.memberId, right.memberId) ||
            compareText(left.optionId, right.optionId)
        ),
      slotMemberIds: sortedKeys(
        sourceRead.decodedContent.ui.graph.regionsById?.[edge.instanceNodeId] ??
          {}
      ),
    });
  }
  instances.sort(
    (left, right) =>
      compareText(left.documentId, right.documentId) ||
      compareText(left.nodeId, right.nodeId)
  );

  const directReferences = directReferenceEdges.map(summarizeReference);
  const instanceKeys = new Set(
    instances.map(({ documentId, nodeId }) => `${documentId}\u0000${nodeId}`)
  );
  const routeReferences = directReferences.filter(
    (reference) => reference.sourceKind === 'route'
  );
  const unsupportedReferenceIds = directReferenceEdges
    .filter((reference) => {
      const sourceDocumentId = getSourceDocumentId(reference);
      if (sourceDocumentId === input.componentDocumentId) return false;
      if (reference.sourceRef.kind === 'route') return false;
      if (
        reference.sourceRef.kind === 'inspector-field' &&
        instanceKeys.has(
          `${reference.sourceRef.documentId}\u0000${reference.sourceRef.nodeId}`
        ) &&
        (reference.kind === 'component-instance' ||
          reference.kind === 'component-member' ||
          reference.kind === 'slot-projection')
      ) {
        return false;
      }
      return true;
    })
    .map(({ id }) => id)
    .sort(compareText);

  const unsupportedDependencyIds = semanticImpactResult.impact.dependencyIds
    .filter((dependencyId) => {
      const dependency = input.semanticIndex.getDependency(dependencyId);
      if (!dependency) return true;
      const source = input.semanticIndex.getSymbol(dependency.sourceSymbolId);
      if (!source) return true;
      const owner = source.ownerRef;
      if (
        ('documentId' in owner &&
          owner.documentId === input.componentDocumentId) ||
        (owner.kind === 'document' &&
          owner.documentId === input.componentDocumentId)
      ) {
        return false;
      }
      if (
        owner.kind === 'pir-node' &&
        instanceKeys.has(`${owner.documentId}\u0000${owner.nodeId}`)
      ) {
        return false;
      }
      if (
        (owner.kind === 'inspector-field' || owner.kind === 'component-slot') &&
        instanceKeys.has(`${owner.documentId}\u0000${owner.nodeId}`)
      ) {
        return false;
      }
      return true;
    })
    .sort(compareText);

  const referencesByTarget = new Map<string, string[]>();
  for (const reference of directReferences) {
    const ids = referencesByTarget.get(reference.targetSymbolId) ?? [];
    ids.push(reference.referenceId);
    referencesByTarget.set(reference.targetSymbolId, ids);
  }
  const contractMemberImpacts = contractSymbols.map((target) => ({
    ...target,
    referenceIds: (referencesByTarget.get(target.symbolId) ?? []).sort(
      compareText
    ),
  }));
  const transitiveConsumers = collectTransitiveComponentConsumers(
    input.componentDocumentId,
    graphValidation.graph.edges,
    graphValidation.graph.componentDocumentIds
  );
  const componentDependencyOrder =
    graphValidation.graph.componentTopologicalOrder;
  const affectedComponentDependencyOrder = componentDependencyOrder
    ? componentDependencyOrder.filter((documentId) =>
        transitiveConsumers.has(documentId)
      )
    : null;

  return {
    status: 'ready',
    impact: {
      componentDocumentId: input.componentDocumentId,
      componentSymbolId,
      workspaceDocumentSymbolId,
      contractSymbols,
      consumingDocumentIds: [
        ...new Set(instances.map(({ documentId }) => documentId)),
      ].sort(compareText),
      transitiveConsumingComponentDocumentIds: [...transitiveConsumers]
        .filter((documentId) => documentId !== input.componentDocumentId)
        .sort(compareText),
      instances,
      routeReferences,
      contractMemberImpacts,
      directReferences,
      semanticImpact: semanticImpactResult.impact,
      componentDependencyOrder,
      affectedComponentDependencyOrder,
      unsupportedReferenceIds,
      unsupportedDependencyIds,
      nameAddressedReferenceIds: directReferences
        .filter(({ addressing }) => addressing === 'name')
        .map(({ referenceId }) => referenceId)
        .sort(compareText),
    },
  };
};
