import { decodeWorkspacePirDocument } from './workspacePirDocument';
import {
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES,
  createWorkspaceComponentExtractionMemberSourceKey as memberSourceKey,
  type AnalyzeWorkspaceComponentExtractionReferencesInput,
  type NormalizedWorkspaceComponentExtractionReferenceContext,
  type WorkspaceComponentExtractionNodeRelocation,
  type WorkspaceComponentExtractionPublicMemberMapping,
  type WorkspaceComponentExtractionPublicPartMapping,
  type WorkspaceComponentExtractionReferenceIssue,
} from './workspaceComponentExtractionReference.types';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isCanonicalText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();

export const normalizeWorkspaceComponentExtractionReferenceInput = (
  input: AnalyzeWorkspaceComponentExtractionReferencesInput
):
  | Readonly<{
      ok: true;
      context: NormalizedWorkspaceComponentExtractionReferenceContext;
    }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceComponentExtractionReferenceIssue[];
    }> => {
  const issues: WorkspaceComponentExtractionReferenceIssue[] = [];
  for (const [path, value, label] of [
    ['/sourceDocumentId', input.sourceDocumentId, 'Source document id'],
    [
      '/targetComponentDocumentId',
      input.targetComponentDocumentId,
      'Target Component document id',
    ],
    [
      '/replacementInstanceNodeId',
      input.replacementInstanceNodeId,
      'Replacement Component Instance node id',
    ],
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
  ] as const) {
    if (isCanonicalText(value)) continue;
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
    });
  }
  if (input.sourceDocumentId === input.targetComponentDocumentId) {
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.inputInvalid,
      path: '/targetComponentDocumentId',
      message: 'Extraction target must be a different Workspace document.',
    });
  }
  const source = input.workspace.docsById[input.sourceDocumentId];
  if (!source) {
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.sourceMissing,
      path: `/docsById/${escapeJsonPointerSegment(input.sourceDocumentId)}`,
      message: 'Extraction source document does not exist.',
      documentId: input.sourceDocumentId,
    });
    return { ok: false, issues };
  }
  const read = decodeWorkspacePirDocument(source, {
    workspaceId: input.workspace.id,
  });
  if (read.status !== 'valid') {
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.sourceInvalid,
      path: `/docsById/${escapeJsonPointerSegment(input.sourceDocumentId)}/content`,
      message:
        'Extraction reference analysis requires a valid canonical PIR source document.',
      documentId: input.sourceDocumentId,
    });
    return { ok: false, issues };
  }

  const movedNodeIdSet = new Set<string>();
  for (const [index, nodeId] of input.movedNodeIds.entries()) {
    if (!isCanonicalText(nodeId)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.inputInvalid,
        path: `/movedNodeIds/${index}`,
        message: 'Moved node ids must be non-empty and trimmed.',
      });
      continue;
    }
    if (!read.decodedContent.ui.graph.nodesById[nodeId]) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.movedNodeMissing,
        path: `/movedNodeIds/${index}`,
        message: `Moved node does not exist in the source graph: ${nodeId}.`,
        documentId: input.sourceDocumentId,
        nodeId,
      });
      continue;
    }
    movedNodeIdSet.add(nodeId);
  }
  if (movedNodeIdSet.size === 0) {
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.inputInvalid,
      path: '/movedNodeIds',
      message: 'Reference analysis requires at least one moved node.',
    });
  }

  const memberMappingsBySource = new Map<
    string,
    WorkspaceComponentExtractionPublicMemberMapping
  >();
  for (const [index, mapping] of (input.publicMemberMappings ?? []).entries()) {
    const key = memberSourceKey(mapping.source);
    if (
      !isCanonicalText(mapping.source.id) ||
      !isCanonicalText(mapping.target.memberId) ||
      memberMappingsBySource.has(key)
    ) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.mappingInvalid,
        path: `/publicMemberMappings/${index}`,
        message:
          'Public member mappings require canonical ids and one target per source identity.',
      });
      continue;
    }
    memberMappingsBySource.set(key, mapping);
  }

  const partMappingsByNodeId = new Map<
    string,
    WorkspaceComponentExtractionPublicPartMapping
  >();
  for (const [index, mapping] of (input.publicPartMappings ?? []).entries()) {
    if (
      !isCanonicalText(mapping.sourceNodeId) ||
      !isCanonicalText(mapping.memberId) ||
      !movedNodeIdSet.has(mapping.sourceNodeId) ||
      partMappingsByNodeId.has(mapping.sourceNodeId)
    ) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.mappingInvalid,
        path: `/publicPartMappings/${index}`,
        message:
          'Public part mappings require one canonical member for an existing moved node.',
        nodeId: mapping.sourceNodeId,
      });
      continue;
    }
    partMappingsByNodeId.set(mapping.sourceNodeId, mapping);
  }
  const requestedRelocations = new Map<string, string>();
  for (const [index, relocation] of (input.nodeRelocations ?? []).entries()) {
    if (
      !isCanonicalText(relocation.sourceNodeId) ||
      !isCanonicalText(relocation.definitionNodeId) ||
      !movedNodeIdSet.has(relocation.sourceNodeId) ||
      requestedRelocations.has(relocation.sourceNodeId)
    ) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.mappingInvalid,
        path: `/nodeRelocations/${index}`,
        message:
          'Node relocation entries require one canonical Definition address per moved source node.',
        nodeId: relocation.sourceNodeId,
      });
      continue;
    }
    requestedRelocations.set(
      relocation.sourceNodeId,
      relocation.definitionNodeId
    );
  }
  const definitionNodeIds = new Set<string>();
  const relocationsBySourceNodeId = new Map<
    string,
    WorkspaceComponentExtractionNodeRelocation
  >();
  for (const sourceNodeId of movedNodeIdSet) {
    const definitionNodeId =
      requestedRelocations.get(sourceNodeId) ?? sourceNodeId;
    if (definitionNodeIds.has(definitionNodeId)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.mappingInvalid,
        path: '/nodeRelocations',
        message: `Definition relocation target is not unique: ${definitionNodeId}.`,
        nodeId: sourceNodeId,
      });
      continue;
    }
    definitionNodeIds.add(definitionNodeId);
    const partMapping = partMappingsByNodeId.get(sourceNodeId);
    relocationsBySourceNodeId.set(sourceNodeId, {
      source: { documentId: input.sourceDocumentId, nodeId: sourceNodeId },
      definition: {
        documentId: input.targetComponentDocumentId,
        nodeId: definitionNodeId,
      },
      replacementInstance: {
        documentId: input.sourceDocumentId,
        nodeId: input.replacementInstanceNodeId,
      },
      ...(partMapping ? { publicPartMemberId: partMapping.memberId } : {}),
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  const movedNodeIds = [...movedNodeIdSet].sort(compareText);
  const publicMemberMappings = [...memberMappingsBySource.values()].sort(
    (left, right) =>
      compareText(
        memberSourceKey(left.source),
        memberSourceKey(right.source)
      ) || compareText(left.target.memberId, right.target.memberId)
  );
  const publicPartMappings = [...partMappingsByNodeId.values()].sort(
    (left, right) => compareText(left.sourceNodeId, right.sourceNodeId)
  );
  const nodeRelocations = [...relocationsBySourceNodeId.values()].sort(
    (left, right) => compareText(left.source.nodeId, right.source.nodeId)
  );
  return {
    ok: true,
    context: {
      workspace: input.workspace,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocument: read.document,
      targetComponentDocumentId: input.targetComponentDocumentId,
      replacementInstanceNodeId: input.replacementInstanceNodeId,
      pirBoundaryAlreadyApplied: input.pirBoundaryAlreadyApplied ?? false,
      movedNodeIds,
      nodeRelocations,
      publicPartMappings,
      publicMemberMappings,
      movedNodeIdSet,
      memberMappingsBySource,
      partMappingsByNodeId,
      relocationsBySourceNodeId,
    },
  };
};
