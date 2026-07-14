import type { PIRComponentContract } from '@prodivix/pir';
import {
  deleteWorkspaceDocumentIntentRequest,
  renameWorkspaceDocumentIntentRequest,
} from '../workspaceCommand';
import { createWorkspaceVfsIntentCommandPlan } from '../workspaceVfsIntent';
import { analyzeWorkspaceComponentImpact } from './workspaceComponentImpactAnalysis';
import {
  WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES,
  type CreateWorkspaceComponentDeleteTransactionInput,
  type CreateWorkspaceComponentRenameTransactionInput,
  type WorkspaceComponentImpact,
  type WorkspaceComponentImpactPlanIssue,
  type WorkspaceComponentImpactTransactionPlanResult,
  type WorkspaceComponentPlanInputBase,
  type WorkspaceComponentRenameTarget,
} from './workspaceComponentImpact.types';
import {
  createWorkspaceComponentContractUpdateTransactionPlan,
  type WorkspaceComponentAuthoringPlanIssue,
} from './workspaceComponentAuthoringTransaction';
import { decodeWorkspacePirDocument } from './workspacePirDocument';

export { analyzeWorkspaceComponentImpact } from './workspaceComponentImpactAnalysis';
export { WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES } from './workspaceComponentImpact.types';
export type {
  AnalyzeWorkspaceComponentImpactInput,
  CreateWorkspaceComponentDeleteTransactionInput,
  CreateWorkspaceComponentRenameTransactionInput,
  WorkspaceComponentContractMemberImpact,
  WorkspaceComponentContractSymbolTarget,
  WorkspaceComponentImpact,
  WorkspaceComponentImpactAnalysisResult,
  WorkspaceComponentImpactPlanIssue,
  WorkspaceComponentImpactPlanIssueCode,
  WorkspaceComponentImpactTransactionPlan,
  WorkspaceComponentImpactTransactionPlanResult,
  WorkspaceComponentInstanceImpact,
  WorkspaceComponentReferenceImpact,
  WorkspaceComponentRenameTarget,
} from './workspaceComponentImpact.types';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

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

const validatePlanEnvelope = (
  input: WorkspaceComponentPlanInputBase
): readonly WorkspaceComponentImpactPlanIssue[] => {
  const issues: WorkspaceComponentImpactPlanIssue[] = [];
  if (
    !Number.isSafeInteger(input.baseRevision) ||
    input.baseRevision !== input.workspace.workspaceRev
  ) {
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.baseRevisionMismatch,
      path: '/baseRevision',
      message: `Base revision must equal Workspace revision ${input.workspace.workspaceRev}.`,
      documentId: input.componentDocumentId,
    });
  }
  for (const [path, value, label] of [
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
  ] as const) {
    if (isCanonicalRequiredText(value)) continue;
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
      documentId: input.componentDocumentId,
    });
  }
  return issues.sort(compareIssues);
};

const createBlockedDeleteIssues = (
  impact: WorkspaceComponentImpact
): readonly WorkspaceComponentImpactPlanIssue[] => {
  const issues: WorkspaceComponentImpactPlanIssue[] = [];
  for (const instance of impact.instances) {
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.consumerBlocksDelete,
      path: `/docsById/${escapeJsonPointerSegment(instance.documentId)}/content/ui/graph/nodesById/${escapeJsonPointerSegment(instance.nodeId)}/componentDocumentId`,
      message:
        'Component Definition cannot be deleted while an Instance consumes it.',
      documentId: instance.documentId,
      nodeId: instance.nodeId,
      referenceId: instance.componentReferenceId,
    });
  }
  for (const route of impact.routeReferences) {
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.routeBlocksDelete,
      path: `/routeManifest/${escapeJsonPointerSegment(route.routeId ?? '')}`,
      message:
        'Component Definition cannot be deleted while a route references it.',
      routeId: route.routeId,
      referenceId: route.referenceId,
    });
  }
  for (const referenceId of impact.unsupportedReferenceIds) {
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.unsupportedReference,
      path: `/semanticIndex/references/${escapeJsonPointerSegment(referenceId)}`,
      message:
        'Component Definition cannot be deleted because a reference owner has no safe rewrite.',
      referenceId,
    });
  }
  for (const dependencyId of impact.unsupportedDependencyIds) {
    issues.push({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.unsupportedDependency,
      path: `/semanticIndex/dependencies/${escapeJsonPointerSegment(dependencyId)}`,
      message:
        'Component Definition cannot be deleted because a dependency owner has no safe rewrite.',
      dependencyId,
    });
  }
  return issues.sort(compareIssues);
};

/** Plans safe Definition deletion only after every typed consumer is absent. */
export const createWorkspaceComponentDeleteTransactionPlan = (
  input: CreateWorkspaceComponentDeleteTransactionInput
): WorkspaceComponentImpactTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input);
  if (envelopeIssues.length > 0) {
    return { status: 'rejected', issues: envelopeIssues };
  }
  const analysis = analyzeWorkspaceComponentImpact(input);
  if (analysis.status === 'rejected') return analysis;
  const blockingIssues = createBlockedDeleteIssues(analysis.impact);
  if (blockingIssues.length > 0) {
    return {
      status: 'blocked',
      impact: analysis.impact,
      issues: blockingIssues,
    };
  }
  const vfsPlan = createWorkspaceVfsIntentCommandPlan(
    input.workspace,
    deleteWorkspaceDocumentIntentRequest({
      workspaceRev: input.baseRevision,
      intentId: `${input.transactionId}:delete-document`,
      issuedAt: input.issuedAt,
      documentId: input.componentDocumentId,
      type: 'pir-component',
    })
  );
  if (!vfsPlan) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.vfsPlanFailed,
          path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}`,
          message: 'Canonical VFS owner could not plan Component deletion.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  return {
    status: 'ready',
    plan: {
      baseRevision: input.baseRevision,
      componentDocumentId: input.componentDocumentId,
      stableSymbolIds: [
        analysis.impact.workspaceDocumentSymbolId,
        analysis.impact.componentSymbolId,
        ...analysis.impact.contractSymbols.map(({ symbolId }) => symbolId),
      ].sort(compareText),
      impact: analysis.impact,
      transaction: {
        id: input.transactionId,
        workspaceId: input.workspace.id,
        issuedAt: input.issuedAt,
        label: `Delete component ${input.componentDocumentId}`,
        commands: [vfsPlan.command],
      },
    },
  };
};

const findRenameSymbolId = (
  impact: WorkspaceComponentImpact,
  target: Exclude<
    WorkspaceComponentRenameTarget,
    { kind: 'component-document' }
  >
): string | null => {
  const match = impact.contractSymbols.find((candidate) => {
    if (target.kind === 'contract-member') {
      return (
        candidate.kind === target.memberKind &&
        candidate.memberId === target.memberId
      );
    }
    if (target.kind === 'variant-option') {
      return (
        candidate.kind === 'variant-option' &&
        candidate.parentMemberId === target.variantMemberId &&
        candidate.memberId === target.optionId
      );
    }
    return (
      candidate.kind === 'slot-prop' &&
      candidate.parentMemberId === target.slotMemberId &&
      candidate.memberId === target.propId
    );
  });
  return match?.symbolId ?? null;
};

const renameContractTarget = (
  contract: PIRComponentContract,
  target: Exclude<
    WorkspaceComponentRenameTarget,
    { kind: 'component-document' }
  >,
  nextName: string
): PIRComponentContract | null => {
  if (target.kind === 'contract-member') {
    const mapName = {
      prop: 'propsById',
      event: 'eventsById',
      slot: 'slotsById',
      variant: 'variantAxesById',
      part: 'partsById',
    }[target.memberKind] as
      | 'propsById'
      | 'eventsById'
      | 'slotsById'
      | 'variantAxesById'
      | 'partsById';
    const members = contract[mapName] ?? {};
    const member = members[target.memberId];
    if (!member) return null;
    return {
      ...contract,
      [mapName]: {
        ...members,
        [target.memberId]: { ...member, name: nextName },
      },
    } as PIRComponentContract;
  }
  if (target.kind === 'variant-option') {
    const variant = contract.variantAxesById[target.variantMemberId];
    const option = variant?.optionsById[target.optionId];
    if (!variant || !option) return null;
    return {
      ...contract,
      variantAxesById: {
        ...contract.variantAxesById,
        [target.variantMemberId]: {
          ...variant,
          optionsById: {
            ...variant.optionsById,
            [target.optionId]: { ...option, name: nextName },
          },
        },
      },
    };
  }
  const slot = contract.slotsById[target.slotMemberId];
  const prop = slot?.propsById?.[target.propId];
  if (!slot || !prop) return null;
  return {
    ...contract,
    slotsById: {
      ...contract.slotsById,
      [target.slotMemberId]: {
        ...slot,
        propsById: {
          ...slot.propsById,
          [target.propId]: { ...prop, name: nextName },
        },
      },
    },
  };
};

const mapContractRenameIssues = (
  issues: readonly WorkspaceComponentAuthoringPlanIssue[]
): readonly WorkspaceComponentImpactPlanIssue[] =>
  issues
    .map((issue) => ({
      code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.contractRenameRejected,
      path: issue.path,
      message: issue.message,
      ...(issue.documentId ? { documentId: issue.documentId } : {}),
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
      causeCode: issue.code,
    }))
    .sort(compareIssues);

/**
 * Plans identity-preserving document/member renames. Only display metadata is
 * changed; durable documentId/memberId-derived semantic addresses never move.
 */
export const createWorkspaceComponentRenameTransactionPlan = (
  input: CreateWorkspaceComponentRenameTransactionInput
): WorkspaceComponentImpactTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input);
  if (envelopeIssues.length > 0) {
    return { status: 'rejected', issues: envelopeIssues };
  }
  const analysis = analyzeWorkspaceComponentImpact(input);
  if (analysis.status === 'rejected') return analysis;
  const affectedSymbolIds =
    input.target.kind === 'component-document'
      ? [
          analysis.impact.workspaceDocumentSymbolId,
          analysis.impact.componentSymbolId,
        ].sort(compareText)
      : [findRenameSymbolId(analysis.impact, input.target)].filter(
          (symbolId): symbolId is string => Boolean(symbolId)
        );
  if (affectedSymbolIds.length === 0) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.renameTargetMissing,
          path: '/target',
          message:
            'Rename target must identify an existing durable Contract member.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  const unsafeReferenceIds = analysis.impact.directReferences
    .filter(
      (reference) =>
        affectedSymbolIds.includes(reference.targetSymbolId) &&
        reference.addressing === 'name'
    )
    .map(({ referenceId }) => referenceId)
    .sort(compareText);
  if (unsafeReferenceIds.length > 0) {
    return {
      status: 'blocked',
      impact: analysis.impact,
      issues: unsafeReferenceIds.map((referenceId) => ({
        code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.nameReferenceBlocksRename,
        path: `/semanticIndex/references/${escapeJsonPointerSegment(referenceId)}`,
        message:
          'Name-addressed reference requires an owner-provided rewrite before rename.',
        referenceId,
      })),
    };
  }

  if (input.target.kind === 'component-document') {
    const currentDocument =
      input.workspace.docsById[input.componentDocumentId]!;
    if (input.target.nextPath === currentDocument.path) {
      return {
        status: 'rejected',
        issues: [
          {
            code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.unchanged,
            path: '/target/nextPath',
            message: 'Component document rename must change its path.',
            documentId: input.componentDocumentId,
          },
        ],
      };
    }
    const vfsPlan = createWorkspaceVfsIntentCommandPlan(
      input.workspace,
      renameWorkspaceDocumentIntentRequest({
        workspaceRev: input.baseRevision,
        intentId: `${input.transactionId}:rename-document`,
        issuedAt: input.issuedAt,
        documentId: input.componentDocumentId,
        path: input.target.nextPath,
        type: 'pir-component',
      })
    );
    if (!vfsPlan) {
      return {
        status: 'rejected',
        issues: [
          {
            code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.vfsPlanFailed,
            path: '/target/nextPath',
            message:
              'Canonical VFS owner rejected the Component path/display-name rename.',
            documentId: input.componentDocumentId,
          },
        ],
      };
    }
    return {
      status: 'ready',
      plan: {
        baseRevision: input.baseRevision,
        componentDocumentId: input.componentDocumentId,
        stableSymbolIds: affectedSymbolIds,
        impact: analysis.impact,
        transaction: {
          id: input.transactionId,
          workspaceId: input.workspace.id,
          issuedAt: input.issuedAt,
          label: `Rename component ${input.componentDocumentId}`,
          commands: [vfsPlan.command],
        },
      },
    };
  }

  const nextName = input.target.nextName;
  if (!isCanonicalRequiredText(nextName)) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.inputInvalid,
          path: '/target/nextName',
          message: 'Contract member name must be non-empty and trimmed.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  const currentContractSymbol = analysis.impact.contractSymbols.find(
    ({ symbolId }) => symbolId === affectedSymbolIds[0]
  )!;
  if (currentContractSymbol.name === nextName) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.unchanged,
          path: '/target/nextName',
          message: 'Contract member rename must change its display name.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  const workspaceDocument =
    input.workspace.docsById[input.componentDocumentId]!;
  const decoded = decodeWorkspacePirDocument(workspaceDocument, {
    workspaceId: input.workspace.id,
  });
  if (decoded.status !== 'valid' || !decoded.decodedContent.componentContract) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.targetInvalid,
          path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/content`,
          message: 'Component Contract is no longer available for rename.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  const nextContract = renameContractTarget(
    decoded.decodedContent.componentContract,
    input.target,
    nextName
  );
  if (!nextContract) {
    return {
      status: 'rejected',
      issues: [
        {
          code: WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.renameTargetMissing,
          path: '/target',
          message: 'Contract rename target no longer exists.',
          documentId: input.componentDocumentId,
        },
      ],
    };
  }
  const contractPlan = createWorkspaceComponentContractUpdateTransactionPlan({
    workspace: input.workspace,
    baseRevision: input.baseRevision,
    transactionId: input.transactionId,
    issuedAt: input.issuedAt,
    componentDocumentId: input.componentDocumentId,
    componentContract: nextContract,
  });
  if (contractPlan.status === 'rejected') {
    return {
      status: 'rejected',
      issues: mapContractRenameIssues(contractPlan.issues),
    };
  }
  return {
    status: 'ready',
    plan: {
      baseRevision: input.baseRevision,
      componentDocumentId: input.componentDocumentId,
      stableSymbolIds: affectedSymbolIds,
      impact: analysis.impact,
      transaction: contractPlan.plan.transaction,
    },
  };
};
