import type { PIRComponentInstanceNode, PIRNode } from '@prodivix/pir';
import type {
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionPublicMemberSource,
  WorkspaceComponentExtractionReferenceContribution,
  WorkspaceComponentExtractionReferenceTarget,
} from './workspaceComponentExtractionReference.types';
import { WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS } from './workspaceComponentExtractionReference.types';
import {
  collectCollectionSymbolOwners,
  collectNodeValueBindings,
  collectTriggerContribution,
  collectValueBindingContribution,
} from './workspaceComponentExtractionPirBindingReferences';
import {
  compareText,
  createPirOwner,
  createPirRewrite,
  createStableExternalContribution,
  createUnsupportedContribution,
  escapeJsonPointerSegment,
  memberSourceKey,
} from './workspaceComponentExtractionReferenceBuiltInUtils';

type NormalizedContext = NormalizedWorkspaceComponentExtractionReferenceContext;

const collectComponentInstanceReferences = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  node: PIRComponentInstanceNode
): void => {
  const base = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  const owner = createPirOwner(
    context.sourceDocumentId,
    nodeId,
    `${base}/componentDocumentId`
  );
  contributions.push(
    createStableExternalContribution(
      {
        id: `pir:${context.sourceDocumentId}:${nodeId}:${base}/componentDocumentId`,
        kind: 'component-reference',
        owner,
        target: { kind: 'component', documentId: node.componentDocumentId },
      },
      'Component Definition identity is document-stable and remains typed after extraction.'
    )
  );

  for (const [memberId, value] of Object.entries(node.bindings.props).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const path = `${base}/bindings/props/${escapeJsonPointerSegment(memberId)}`;
    contributions.push(
      createStableExternalContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${path}:member`,
          kind: 'component-member-reference',
          owner: createPirOwner(context.sourceDocumentId, nodeId, path),
          target: {
            kind: 'component-member',
            documentId: node.componentDocumentId,
            memberKind: 'prop',
            memberId,
          },
        },
        'Component prop identity is qualified by the target Definition document.'
      )
    );
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      path,
      value
    );
  }
  for (const [memberId, trigger] of Object.entries(node.bindings.events).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const path = `${base}/bindings/events/${escapeJsonPointerSegment(memberId)}`;
    contributions.push(
      createStableExternalContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${path}:member`,
          kind: 'component-member-reference',
          owner: createPirOwner(context.sourceDocumentId, nodeId, path),
          target: {
            kind: 'component-member',
            documentId: node.componentDocumentId,
            memberKind: 'event',
            memberId,
          },
        },
        'Component event identity is qualified by the target Definition document.'
      )
    );
    collectTriggerContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${path}/trigger`,
      trigger
    );
  }
  for (const [memberId, optionId] of Object.entries(
    node.bindings.variants
  ).sort(([left], [right]) => compareText(left, right))) {
    const path = `${base}/bindings/variants/${escapeJsonPointerSegment(memberId)}`;
    contributions.push(
      createStableExternalContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${path}:member`,
          kind: 'component-member-reference',
          owner: createPirOwner(context.sourceDocumentId, nodeId, path),
          target: {
            kind: 'component-member',
            documentId: node.componentDocumentId,
            memberKind: 'variant',
            memberId,
            optionId,
          },
        },
        'Component variant identity is qualified by the target Definition document.'
      )
    );
  }
  for (const slotMemberId of Object.keys(
    context.sourceDocument.content.ui.graph.regionsById?.[nodeId] ?? {}
  ).sort(compareText)) {
    const path = `/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(slotMemberId)}`;
    contributions.push(
      createStableExternalContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${path}:slot`,
          kind: 'component-member-reference',
          owner: createPirOwner(context.sourceDocumentId, nodeId, path),
          target: {
            kind: 'component-member',
            documentId: node.componentDocumentId,
            memberKind: 'slot',
            memberId: slotMemberId,
          },
        },
        'Component slot identity is qualified by the target Definition document.'
      )
    );
  }
};

const collectSlotOutletReference = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  node: Extract<PIRNode, { kind: 'component-slot-outlet' }>
): void => {
  const path = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}/slotMemberId`;
  const owner = createPirOwner(context.sourceDocumentId, nodeId, path);
  const source: WorkspaceComponentExtractionPublicMemberSource = {
    kind: 'component-slot',
    id: node.slotMemberId,
  };
  const target: WorkspaceComponentExtractionReferenceTarget = {
    kind: 'pir-lexical',
    documentId: context.sourceDocumentId,
    symbolKind: 'component-slot',
    symbolId: node.slotMemberId,
  };
  const mapping = context.memberMappingsBySource.get(memberSourceKey(source));
  if (mapping?.target.kind === 'slot') {
    contributions.push({
      id: `pir:${context.sourceDocumentId}:${nodeId}:${path}`,
      kind: 'component-slot-reference',
      owner,
      target,
      classification:
        WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract,
      reason:
        'The source slot dependency is explicitly promoted to the extracted Component Contract.',
      rewrite: createPirRewrite(
        context,
        nodeId,
        path,
        node.slotMemberId,
        mapping.target.memberId,
        mapping
      ),
    });
  } else {
    contributions.push(
      createUnsupportedContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${path}`,
          kind: 'component-slot-reference',
          owner,
          target,
        },
        mapping
          ? 'A Component Slot Outlet can only map to a public slot.'
          : 'A moved Slot Outlet still targets the source Component Contract without a public slot mapping.'
      )
    );
  }

  const base = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  for (const [memberId, value] of Object.entries(node.bindings.props).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const bindingPath = `${base}/bindings/props/${escapeJsonPointerSegment(memberId)}`;
    contributions.push(
      createStableExternalContribution(
        {
          id: `pir:${context.sourceDocumentId}:${nodeId}:${bindingPath}:member`,
          kind: 'component-member-reference',
          owner: createPirOwner(context.sourceDocumentId, nodeId, bindingPath),
          target: {
            kind: 'component-member',
            documentId: context.sourceDocumentId,
            memberKind: 'slot-prop',
            memberId,
            parentMemberId: node.slotMemberId,
          },
        },
        'Slot prop identity is qualified by its owning Definition and slot.'
      )
    );
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      bindingPath,
      value
    );
  }
};

const collectCollectionReferences = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  node: Extract<PIRNode, { kind: 'collection' }>
): void => {
  const base = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  if (node.source.kind === 'binding') {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/source/value`,
      node.source.value
    );
  }
  if (node.key.kind === 'binding') {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/key/value`,
      node.key.value
    );
  }
};

export const collectMovedPirExtractionReferences = (
  context: NormalizedContext
): WorkspaceComponentExtractionReferenceContribution[] => {
  const contributions: WorkspaceComponentExtractionReferenceContribution[] = [];
  const graph = context.sourceDocument.content.ui.graph;
  const collectionSymbolOwners = collectCollectionSymbolOwners(
    context.sourceDocument.content
  );
  for (const nodeId of context.movedNodeIds) {
    const node = graph.nodesById[nodeId]!;
    if (node.kind === 'element') {
      collectNodeValueBindings(
        contributions,
        context,
        collectionSymbolOwners,
        nodeId,
        node
      );
    } else if (node.kind === 'component-instance') {
      collectComponentInstanceReferences(
        contributions,
        context,
        collectionSymbolOwners,
        nodeId,
        node
      );
    } else if (node.kind === 'component-slot-outlet') {
      collectSlotOutletReference(
        contributions,
        context,
        collectionSymbolOwners,
        nodeId,
        node
      );
    } else {
      collectCollectionReferences(
        contributions,
        context,
        collectionSymbolOwners,
        nodeId,
        node
      );
    }
  }
  return contributions;
};
