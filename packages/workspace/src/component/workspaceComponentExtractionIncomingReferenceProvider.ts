import type {
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from '@prodivix/router';
import type {
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionReferenceContribution,
} from './workspaceComponentExtractionReference.types';
import {
  compareText,
  createUnsupportedContribution,
  escapeJsonPointerSegment,
} from './workspaceComponentExtractionReferenceBuiltInUtils';

type NormalizedContext = NormalizedWorkspaceComponentExtractionReferenceContext;

const collectComponentPartReferences = (
  context: NormalizedContext
): WorkspaceComponentExtractionReferenceContribution[] => {
  const contributions: WorkspaceComponentExtractionReferenceContribution[] = [];
  for (const [memberId, part] of Object.entries(
    context.sourceDocument.content.componentContract?.partsById ?? {}
  ).sort(([left], [right]) => compareText(left, right))) {
    if (!context.movedNodeIdSet.has(part.targetNodeId)) continue;
    const path = `/componentContract/partsById/${escapeJsonPointerSegment(memberId)}/targetNodeId`;
    const proposedPart = context.partMappingsByNodeId.get(part.targetNodeId);
    contributions.push(
      createUnsupportedContribution(
        {
          id: `pir-contract:${context.sourceDocumentId}:${memberId}`,
          kind: 'component-part-target',
          owner: {
            domain: 'pir',
            documentId: context.sourceDocumentId,
            entityId: memberId,
            path,
            movesWithSubtree: false,
          },
          target: {
            kind: 'pir-node',
            documentId: context.sourceDocumentId,
            nodeId: part.targetNodeId,
          },
        },
        proposedPart
          ? 'The current Component part contract cannot delegate to a nested instance part without a typed public-part target contract.'
          : 'A source Component part would retain a forbidden reference to a moved Definition-internal node.'
      )
    );
  }
  return contributions;
};

const collectRouteNodeReferences = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  node: WorkspaceRouteNode,
  path: string
): void => {
  const collectOutlet = (
    outletNodeId: string,
    outletPath: string,
    role: string
  ) => {
    if (!context.movedNodeIdSet.has(outletNodeId)) return;
    if (node.layoutDocId && node.layoutDocId !== context.sourceDocumentId) {
      return;
    }
    const proposedPart = context.partMappingsByNodeId.get(outletNodeId);
    contributions.push(
      createUnsupportedContribution(
        {
          id: `route:${node.id}:${role}:${outletPath}`,
          kind: 'route-outlet-target',
          owner: {
            domain: 'route',
            path: outletPath,
            entityId: node.id,
            movesWithSubtree: false,
          },
          target: {
            kind: 'pir-node',
            documentId: node.layoutDocId ?? context.sourceDocumentId,
            nodeId: outletNodeId,
          },
        },
        !node.layoutDocId
          ? 'Route outlet target is not document-qualified, so matching a moved node id cannot be rewritten safely.'
          : proposedPart
            ? 'Route outlet storage cannot address an instance public part; rewriting it to a Definition-internal node is forbidden.'
            : 'Route outlet target points to a moved node without a public part mapping.'
      )
    );
  };

  if (node.outletNodeId) {
    collectOutlet(node.outletNodeId, `${path}/outletNodeId`, 'default');
  }
  for (const [outletName, binding] of Object.entries(
    node.outletBindings ?? {}
  ).sort(([left], [right]) => compareText(left, right))) {
    collectOutlet(
      binding.outletNodeId,
      `${path}/outletBindings/${escapeJsonPointerSegment(outletName)}/outletNodeId`,
      outletName
    );
  }
  for (const [index, child] of (node.children ?? []).entries()) {
    collectRouteNodeReferences(
      contributions,
      context,
      child,
      `${path}/children/${index}`
    );
  }
};

const collectRouteReferences = (
  context: NormalizedContext,
  manifest: WorkspaceRouteManifest
): WorkspaceComponentExtractionReferenceContribution[] => {
  const contributions: WorkspaceComponentExtractionReferenceContribution[] = [];
  collectRouteNodeReferences(
    contributions,
    context,
    manifest.root,
    '/routeManifest/root'
  );
  for (const [moduleId, module] of Object.entries(manifest.modules ?? {}).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    collectRouteNodeReferences(
      contributions,
      context,
      module.root,
      `/routeManifest/modules/${escapeJsonPointerSegment(moduleId)}/root`
    );
  }
  return contributions;
};

export const collectIncomingWorkspaceComponentExtractionReferences = (
  context: NormalizedContext
): readonly WorkspaceComponentExtractionReferenceContribution[] => [
  ...collectComponentPartReferences(context),
  ...collectRouteReferences(context, context.workspace.routeManifest),
];
