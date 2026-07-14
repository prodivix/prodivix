import type {
  SemanticImpact,
  WorkspaceReferenceEdge,
  WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import type { WorkspaceTransactionEnvelope } from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';

export const WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES = {
  baseRevisionMismatch: 'WKS_COMPONENT_IMPACT_BASE_REVISION_MISMATCH',
  inputInvalid: 'WKS_COMPONENT_IMPACT_INPUT_INVALID',
  targetMissing: 'WKS_COMPONENT_IMPACT_TARGET_MISSING',
  targetTypeInvalid: 'WKS_COMPONENT_IMPACT_TARGET_TYPE_INVALID',
  targetInvalid: 'WKS_COMPONENT_IMPACT_TARGET_INVALID',
  targetContractMissing: 'WKS_COMPONENT_IMPACT_TARGET_CONTRACT_MISSING',
  semanticIndexStale: 'WKS_COMPONENT_IMPACT_SEMANTIC_INDEX_STALE',
  semanticIndexIncomplete: 'WKS_COMPONENT_IMPACT_SEMANTIC_INDEX_INCOMPLETE',
  consumerBlocksDelete: 'WKS_COMPONENT_IMPACT_CONSUMER_BLOCKS_DELETE',
  routeBlocksDelete: 'WKS_COMPONENT_IMPACT_ROUTE_BLOCKS_DELETE',
  unsupportedReference: 'WKS_COMPONENT_IMPACT_UNSUPPORTED_REFERENCE',
  unsupportedDependency: 'WKS_COMPONENT_IMPACT_UNSUPPORTED_DEPENDENCY',
  nameReferenceBlocksRename:
    'WKS_COMPONENT_IMPACT_NAME_REFERENCE_BLOCKS_RENAME',
  renameTargetMissing: 'WKS_COMPONENT_IMPACT_RENAME_TARGET_MISSING',
  unchanged: 'WKS_COMPONENT_IMPACT_UNCHANGED',
  vfsPlanFailed: 'WKS_COMPONENT_IMPACT_VFS_PLAN_FAILED',
  contractRenameRejected: 'WKS_COMPONENT_IMPACT_CONTRACT_RENAME_REJECTED',
} as const;

export type WorkspaceComponentImpactPlanIssueCode =
  (typeof WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES];

export type WorkspaceComponentImpactPlanIssue = Readonly<{
  code: WorkspaceComponentImpactPlanIssueCode;
  path: string;
  message: string;
  documentId?: string;
  nodeId?: string;
  routeId?: string;
  referenceId?: string;
  dependencyId?: string;
  causeCode?: string;
}>;

export type WorkspaceComponentContractSymbolTarget = Readonly<{
  symbolId: string;
  kind:
    | 'prop'
    | 'event'
    | 'slot'
    | 'slot-prop'
    | 'variant'
    | 'variant-option'
    | 'part';
  memberId: string;
  parentMemberId?: string;
  name: string;
}>;

export type WorkspaceComponentReferenceImpact = Readonly<{
  referenceId: string;
  targetSymbolId: string;
  kind: WorkspaceReferenceEdge['kind'];
  addressing: 'durable-id' | 'name';
  sourceKind: WorkspaceReferenceEdge['sourceRef']['kind'];
  sourceSymbolId?: string;
  sourceDocumentId?: string;
  sourceNodeId?: string;
  routeId?: string;
}>;

export type WorkspaceComponentInstanceImpact = Readonly<{
  documentId: string;
  nodeId: string;
  componentReferenceId: string;
  propMemberIds: readonly string[];
  eventMemberIds: readonly string[];
  variantBindings: readonly Readonly<{
    memberId: string;
    optionId: string;
  }>[];
  slotMemberIds: readonly string[];
}>;

export type WorkspaceComponentContractMemberImpact =
  WorkspaceComponentContractSymbolTarget &
    Readonly<{ referenceIds: readonly string[] }>;

export type WorkspaceComponentImpact = Readonly<{
  componentDocumentId: string;
  componentSymbolId: string;
  workspaceDocumentSymbolId: string;
  contractSymbols: readonly WorkspaceComponentContractSymbolTarget[];
  consumingDocumentIds: readonly string[];
  transitiveConsumingComponentDocumentIds: readonly string[];
  instances: readonly WorkspaceComponentInstanceImpact[];
  routeReferences: readonly WorkspaceComponentReferenceImpact[];
  contractMemberImpacts: readonly WorkspaceComponentContractMemberImpact[];
  directReferences: readonly WorkspaceComponentReferenceImpact[];
  semanticImpact: SemanticImpact;
  componentDependencyOrder: readonly string[] | null;
  affectedComponentDependencyOrder: readonly string[] | null;
  unsupportedReferenceIds: readonly string[];
  unsupportedDependencyIds: readonly string[];
  nameAddressedReferenceIds: readonly string[];
}>;

export type AnalyzeWorkspaceComponentImpactInput = Readonly<{
  workspace: WorkspaceSnapshot;
  semanticIndex: WorkspaceSemanticIndex;
  componentDocumentId: string;
}>;

export type WorkspaceComponentImpactAnalysisResult =
  | Readonly<{ status: 'ready'; impact: WorkspaceComponentImpact }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceComponentImpactPlanIssue[];
    }>;

export type WorkspaceComponentPlanInputBase =
  AnalyzeWorkspaceComponentImpactInput &
    Readonly<{
      baseRevision: number;
      transactionId: string;
      issuedAt: string;
    }>;

export type CreateWorkspaceComponentDeleteTransactionInput =
  WorkspaceComponentPlanInputBase;

export type WorkspaceComponentRenameTarget =
  | Readonly<{ kind: 'component-document'; nextPath: string }>
  | Readonly<{
      kind: 'contract-member';
      memberKind: 'prop' | 'event' | 'slot' | 'variant' | 'part';
      memberId: string;
      nextName: string;
    }>
  | Readonly<{
      kind: 'variant-option';
      variantMemberId: string;
      optionId: string;
      nextName: string;
    }>
  | Readonly<{
      kind: 'slot-prop';
      slotMemberId: string;
      propId: string;
      nextName: string;
    }>;

export type CreateWorkspaceComponentRenameTransactionInput =
  WorkspaceComponentPlanInputBase &
    Readonly<{ target: WorkspaceComponentRenameTarget }>;

export type WorkspaceComponentImpactTransactionPlan = Readonly<{
  baseRevision: number;
  componentDocumentId: string;
  stableSymbolIds: readonly string[];
  impact: WorkspaceComponentImpact;
  transaction: WorkspaceTransactionEnvelope;
}>;

export type WorkspaceComponentImpactTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceComponentImpactTransactionPlan;
    }>
  | Readonly<{
      status: 'blocked';
      impact: WorkspaceComponentImpact;
      issues: readonly WorkspaceComponentImpactPlanIssue[];
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceComponentImpactPlanIssue[];
    }>;
