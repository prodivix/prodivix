import type { WorkspaceCommandEnvelope } from '../workspaceCommand';
import { createBuiltInWorkspaceComponentExtractionReferenceProviders } from './workspaceComponentExtractionReferenceBuiltInProvider';
import { normalizeWorkspaceComponentExtractionReferenceInput } from './workspaceComponentExtractionReferenceInput';
import {
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS,
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES,
  type AnalyzeWorkspaceComponentExtractionReferencesInput,
  type NormalizedWorkspaceComponentExtractionReferenceContext,
  type WorkspaceComponentExtractionReference,
  type WorkspaceComponentExtractionReferenceContribution,
  type WorkspaceComponentExtractionReferenceIssue,
  type WorkspaceComponentExtractionReferencePlan,
  type WorkspaceComponentExtractionReferenceTarget,
} from './workspaceComponentExtractionReference.types';

const CLASSIFICATIONS = new Set<string>(
  Object.values(WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS)
);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: WorkspaceComponentExtractionReferenceIssue,
  right: WorkspaceComponentExtractionReferenceIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.providerId ?? '', right.providerId ?? '') ||
  compareText(left.referenceId ?? '', right.referenceId ?? '') ||
  compareText(left.message, right.message);

const compareContributions = (
  left: WorkspaceComponentExtractionReference,
  right: WorkspaceComponentExtractionReference
): number =>
  compareText(left.providerId, right.providerId) ||
  compareText(left.id, right.id);

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isCanonicalText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value === value.trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type NormalizedContext = NormalizedWorkspaceComponentExtractionReferenceContext;

const targetMovesWithSubtree = (
  context: NormalizedContext,
  target: WorkspaceComponentExtractionReferenceTarget
): boolean =>
  (target.kind === 'pir-node' &&
    target.documentId === context.sourceDocumentId &&
    context.movedNodeIdSet.has(target.nodeId)) ||
  (target.kind === 'pir-lexical' &&
    target.documentId === context.sourceDocumentId &&
    Boolean(
      target.ownerNodeId && context.movedNodeIdSet.has(target.ownerNodeId)
    ));

const validateContribution = (
  context: NormalizedContext,
  providerId: string,
  contribution: WorkspaceComponentExtractionReferenceContribution
): WorkspaceComponentExtractionReferenceIssue | null => {
  const path = `/providers/${escapeJsonPointerSegment(providerId)}/references`;
  if (
    !isRecord(contribution) ||
    !isCanonicalText(contribution.id) ||
    !isCanonicalText(contribution.kind) ||
    !isCanonicalText(contribution.reason) ||
    !isRecord(contribution.owner) ||
    !isCanonicalText(contribution.owner.path) ||
    typeof contribution.owner.movesWithSubtree !== 'boolean' ||
    !isRecord(contribution.target) ||
    !CLASSIFICATIONS.has(contribution.classification)
  ) {
    return {
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerContributionInvalid,
      path,
      message: 'Reference provider returned a malformed contribution.',
      providerId,
    };
  }
  const targetMoves = targetMovesWithSubtree(context, contribution.target);
  if (
    contribution.classification ===
      WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.internalMovesWithSubtree &&
    (!contribution.owner.movesWithSubtree || !targetMoves)
  ) {
    return {
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerContributionInvalid,
      path,
      message:
        'An internal reference requires both its owner and target to move with the subtree.',
      providerId,
      referenceId: contribution.id,
    };
  }
  if (
    contribution.classification ===
      WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.externalOwnerMoves &&
    (!contribution.owner.movesWithSubtree || targetMoves)
  ) {
    return {
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerContributionInvalid,
      path,
      message:
        'An external-owner reference requires a moving owner and a target outside the moved subtree.',
      providerId,
      referenceId: contribution.id,
    };
  }
  if (
    contribution.classification ===
    WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract
  ) {
    const rewrite = contribution.rewrite;
    if (
      !rewrite ||
      rewrite.publicTarget.componentDocumentId !==
        context.targetComponentDocumentId ||
      !isCanonicalText(rewrite.documentId) ||
      rewrite.forwardOps.length === 0 ||
      rewrite.reverseOps.length === 0
    ) {
      return {
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerContributionInvalid,
        path,
        message:
          'A public-contract rewrite requires exact document-target forward/reverse operations and a public target in the extracted Component.',
        providerId,
        referenceId: contribution.id,
      };
    }
  } else if (contribution.rewrite) {
    return {
      code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerContributionInvalid,
      path,
      message:
        'Only a public-contract classification may contribute a rewrite.',
      providerId,
      referenceId: contribution.id,
    };
  }
  return null;
};

const createRewriteCommand = (
  input: AnalyzeWorkspaceComponentExtractionReferencesInput,
  reference: WorkspaceComponentExtractionReferenceContribution &
    Readonly<{ providerId: string }>,
  index: number
): WorkspaceCommandEnvelope => {
  const rewrite = reference.rewrite!;
  return {
    id: `${input.transactionId}:reference:${index}`,
    namespace: 'core.pir.component-extraction',
    type: 'typed-reference.rewrite',
    version: '1.0',
    issuedAt: input.issuedAt,
    target: {
      workspaceId: input.workspace.id,
      documentId: rewrite.documentId,
    },
    domainHint: rewrite.domainHint,
    label: 'Rewrite extracted component reference',
    forwardOps: [...rewrite.forwardOps],
    reverseOps: [...rewrite.reverseOps],
  };
};

const blockedPlan = (
  issues: readonly WorkspaceComponentExtractionReferenceIssue[]
): WorkspaceComponentExtractionReferencePlan => ({
  status: 'blocked',
  references: [],
  commands: [],
  issues: [...issues].sort(compareIssues),
});

/**
 * Composes typed-reference owners before extraction. Every affected reference
 * is classified by its domain owner; only explicit public Contract rewrites
 * produce document-target Commands with exact reverse operations.
 */
export const analyzeWorkspaceComponentExtractionReferences = (
  input: AnalyzeWorkspaceComponentExtractionReferencesInput
): WorkspaceComponentExtractionReferencePlan => {
  const normalized = normalizeWorkspaceComponentExtractionReferenceInput(input);
  if (!normalized.ok) return blockedPlan(normalized.issues);
  const { context } = normalized;
  const issues: WorkspaceComponentExtractionReferenceIssue[] = [];
  const providers = [
    ...createBuiltInWorkspaceComponentExtractionReferenceProviders(context),
    ...(input.providers ?? []),
  ].sort(
    (left, right) =>
      compareText(left.descriptor.id, right.descriptor.id) ||
      compareText(left.descriptor.version, right.descriptor.version)
  );
  const providerIds = new Set<string>();
  const references: WorkspaceComponentExtractionReference[] = [];

  for (const provider of providers) {
    const { id: providerId, version } = provider.descriptor;
    if (
      !isCanonicalText(providerId) ||
      !isCanonicalText(version) ||
      providerIds.has(providerId)
    ) {
      issues.push({
        code: providerIds.has(providerId)
          ? WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerDuplicate
          : WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.inputInvalid,
        path: `/providers/${escapeJsonPointerSegment(String(providerId))}`,
        message: providerIds.has(providerId)
          ? `Duplicate extraction reference provider id: ${providerId}.`
          : 'Extraction reference providers require canonical id and version values.',
        providerId,
      });
      continue;
    }
    providerIds.add(providerId);
    let contributions: readonly WorkspaceComponentExtractionReferenceContribution[];
    try {
      contributions = provider.contribute(context);
      if (!Array.isArray(contributions)) {
        throw new Error('Provider contribution must be an array.');
      }
    } catch {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.providerFailed,
        path: `/providers/${escapeJsonPointerSegment(providerId)}`,
        message: `Extraction reference provider failed: ${providerId}.`,
        providerId,
      });
      continue;
    }
    for (const contribution of contributions) {
      const issue = validateContribution(context, providerId, contribution);
      if (issue) {
        issues.push(issue);
        continue;
      }
      references.push({ ...contribution, providerId });
    }
  }

  references.sort(compareContributions);
  const uniqueReferences: WorkspaceComponentExtractionReference[] = [];
  const referenceKeys = new Set<string>();
  for (const reference of references) {
    const key = `${reference.providerId}\u0000${reference.id}`;
    if (referenceKeys.has(key)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.duplicateReference,
        path: `/providers/${escapeJsonPointerSegment(reference.providerId)}/references`,
        message: `Duplicate extraction reference id: ${reference.id}.`,
        providerId: reference.providerId,
        referenceId: reference.id,
      });
      continue;
    }
    referenceKeys.add(key);
    uniqueReferences.push(reference);
  }

  const commands: WorkspaceCommandEnvelope[] = [];
  const finalizedReferences = uniqueReferences.map((reference) => {
    if (
      reference.classification ===
      WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.unsupportedBlocking
    ) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES.unsupportedReference,
        path: reference.owner.path,
        message: reference.reason,
        providerId: reference.providerId,
        referenceId: reference.id,
        ...(reference.owner.documentId
          ? { documentId: reference.owner.documentId }
          : {}),
        ...(reference.owner.nodeId ? { nodeId: reference.owner.nodeId } : {}),
      });
      return reference;
    }
    if (!reference.rewrite) return reference;
    const command = createRewriteCommand(input, reference, commands.length);
    commands.push(command);
    return { ...reference, commandId: command.id };
  });

  issues.sort(compareIssues);
  return {
    status: issues.length > 0 ? 'blocked' : 'ready',
    references: finalizedReferences,
    commands,
    issues,
  };
};
