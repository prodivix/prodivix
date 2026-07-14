import type {
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionPublicMemberMapping,
  WorkspaceComponentExtractionPublicMemberSource,
  WorkspaceComponentExtractionPublicTarget,
  WorkspaceComponentExtractionReferenceContribution,
  WorkspaceComponentExtractionReferenceOwner,
  WorkspaceComponentExtractionReferenceRewrite,
} from './workspaceComponentExtractionReference.types';
import { WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS } from './workspaceComponentExtractionReference.types';

type NormalizedContext = NormalizedWorkspaceComponentExtractionReferenceContext;

export const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

export const memberSourceKey = (
  source: WorkspaceComponentExtractionPublicMemberSource
): string => `${source.kind}\u0000${source.id}`;

export const createPirOwner = (
  documentId: string,
  nodeId: string,
  path: string
): WorkspaceComponentExtractionReferenceOwner => ({
  domain: 'pir',
  documentId,
  nodeId,
  path,
  movesWithSubtree: true,
});

export const createPublicMemberTarget = (
  context: NormalizedContext,
  mapping: WorkspaceComponentExtractionPublicMemberMapping
): WorkspaceComponentExtractionPublicTarget => ({
  kind: 'component-member',
  componentDocumentId: context.targetComponentDocumentId,
  memberKind: mapping.target.kind,
  memberId: mapping.target.memberId,
});

export const createPirRewrite = (
  context: NormalizedContext,
  sourceNodeId: string,
  path: string,
  before: unknown,
  after: unknown,
  mapping: WorkspaceComponentExtractionPublicMemberMapping
): WorkspaceComponentExtractionReferenceRewrite => ({
  publicTarget: createPublicMemberTarget(context, mapping),
  documentId: context.targetComponentDocumentId,
  domainHint: 'pir',
  forwardOps: [
    {
      op: 'replace',
      path: path.replace(
        `/nodesById/${escapeJsonPointerSegment(sourceNodeId)}`,
        `/nodesById/${escapeJsonPointerSegment(
          context.relocationsBySourceNodeId.get(sourceNodeId)!.definition.nodeId
        )}`
      ),
      value: after,
    },
  ],
  reverseOps: [
    {
      op: 'replace',
      path: path.replace(
        `/nodesById/${escapeJsonPointerSegment(sourceNodeId)}`,
        `/nodesById/${escapeJsonPointerSegment(
          context.relocationsBySourceNodeId.get(sourceNodeId)!.definition.nodeId
        )}`
      ),
      value: before,
    },
  ],
});

export const createStableExternalContribution = (
  input: Omit<
    WorkspaceComponentExtractionReferenceContribution,
    'classification' | 'reason'
  >,
  reason: string
): WorkspaceComponentExtractionReferenceContribution => ({
  ...input,
  classification:
    WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.externalOwnerMoves,
  reason,
});

export const createUnsupportedContribution = (
  input: Omit<
    WorkspaceComponentExtractionReferenceContribution,
    'classification' | 'reason'
  >,
  reason: string
): WorkspaceComponentExtractionReferenceContribution => ({
  ...input,
  classification:
    WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.unsupportedBlocking,
  reason,
});
