import type { WorkspacePirDocument } from './workspacePirDocument';
import type {
  WorkspaceCommandDomain,
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';

export const WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS = {
  internalMovesWithSubtree: 'internal/moves-with-subtree',
  rewritableToPublicContract: 'rewritable-to-public-contract',
  externalOwnerMoves: 'external-owner-moves',
  unsupportedBlocking: 'unsupported/blocking',
} as const;

export type WorkspaceComponentExtractionReferenceClassification =
  (typeof WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS)[keyof typeof WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS];

export const WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES = {
  inputInvalid: 'WKS_EXTRACTION_REFERENCE_INPUT_INVALID',
  sourceMissing: 'WKS_EXTRACTION_REFERENCE_SOURCE_MISSING',
  sourceInvalid: 'WKS_EXTRACTION_REFERENCE_SOURCE_INVALID',
  movedNodeMissing: 'WKS_EXTRACTION_REFERENCE_MOVED_NODE_MISSING',
  mappingInvalid: 'WKS_EXTRACTION_REFERENCE_MAPPING_INVALID',
  providerDuplicate: 'WKS_EXTRACTION_REFERENCE_PROVIDER_DUPLICATE',
  providerFailed: 'WKS_EXTRACTION_REFERENCE_PROVIDER_FAILED',
  providerContributionInvalid:
    'WKS_EXTRACTION_REFERENCE_PROVIDER_CONTRIBUTION_INVALID',
  duplicateReference: 'WKS_EXTRACTION_REFERENCE_DUPLICATE',
  unsupportedReference: 'WKS_EXTRACTION_REFERENCE_UNSUPPORTED',
} as const;

export type WorkspaceComponentExtractionReferenceIssueCode =
  (typeof WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_ISSUE_CODES];

export type WorkspaceComponentExtractionReferenceIssue = Readonly<{
  code: WorkspaceComponentExtractionReferenceIssueCode;
  path: string;
  message: string;
  providerId?: string;
  referenceId?: string;
  documentId?: string;
  nodeId?: string;
}>;

export type WorkspaceComponentExtractionPublicMemberKind =
  'prop' | 'event' | 'slot' | 'variant';

export type WorkspaceComponentExtractionPublicMemberSource = Readonly<{
  kind:
    | 'param'
    | 'state'
    | 'data'
    | 'collection-symbol'
    | 'component-prop'
    | 'component-variant'
    | 'slot-prop'
    | 'component-event'
    | 'component-slot';
  id: string;
}>;

export type WorkspaceComponentExtractionPublicMemberMapping = Readonly<{
  source: WorkspaceComponentExtractionPublicMemberSource;
  target: Readonly<{
    kind: WorkspaceComponentExtractionPublicMemberKind;
    memberId: string;
  }>;
}>;

export type WorkspaceComponentExtractionPublicPartMapping = Readonly<{
  sourceNodeId: string;
  memberId: string;
}>;

export type WorkspaceComponentExtractionNodeAddress = Readonly<{
  documentId: string;
  nodeId: string;
}>;

export type WorkspaceComponentExtractionNodeRelocationInput = Readonly<{
  sourceNodeId: string;
  definitionNodeId: string;
}>;

export type WorkspaceComponentExtractionNodeRelocation = Readonly<{
  source: WorkspaceComponentExtractionNodeAddress;
  definition: WorkspaceComponentExtractionNodeAddress;
  replacementInstance: WorkspaceComponentExtractionNodeAddress;
  publicPartMemberId?: string;
}>;

export type WorkspaceComponentExtractionReferenceOwner = Readonly<{
  domain:
    'pir' | 'route' | 'nodegraph' | 'animation' | 'code' | `plugin:${string}`;
  path: string;
  movesWithSubtree: boolean;
  documentId?: string;
  nodeId?: string;
  entityId?: string;
}>;

export type WorkspaceComponentExtractionReferenceTarget =
  | Readonly<{ kind: 'pir-node'; documentId: string; nodeId: string }>
  | Readonly<{
      kind: 'pir-lexical';
      documentId: string;
      symbolKind:
        | 'param'
        | 'state'
        | 'data'
        | 'collection-symbol'
        | 'component-prop'
        | 'component-variant'
        | 'slot-prop'
        | 'component-event'
        | 'component-slot';
      symbolId: string;
      ownerNodeId?: string;
    }>
  | Readonly<{ kind: 'component'; documentId: string }>
  | Readonly<{
      kind: 'component-member';
      documentId: string;
      memberKind:
        WorkspaceComponentExtractionPublicMemberKind | 'part' | 'slot-prop';
      memberId: string;
      optionId?: string;
      parentMemberId?: string;
    }>
  | Readonly<{ kind: 'route'; routeId: string }>
  | Readonly<{ kind: 'nodegraph'; documentId: string }>
  | Readonly<{
      kind: 'animation';
      timelineId: string;
      documentId: string;
    }>
  | Readonly<{
      kind: 'code';
      artifactId: string;
      symbolId?: string;
      exportName?: string;
    }>
  | Readonly<{ kind: `plugin:${string}`; identity: string }>;

export type WorkspaceComponentExtractionPublicTarget =
  | Readonly<{
      kind: 'component-member';
      componentDocumentId: string;
      memberKind: WorkspaceComponentExtractionPublicMemberKind;
      memberId: string;
    }>
  | Readonly<{
      kind: 'component-part';
      componentDocumentId: string;
      memberId: string;
    }>;

type ExtractionDocumentDomain = Exclude<
  WorkspaceCommandDomain,
  'workspace' | 'route'
>;

export type WorkspaceComponentExtractionReferenceRewrite = Readonly<{
  publicTarget: WorkspaceComponentExtractionPublicTarget;
  documentId: string;
  domainHint: ExtractionDocumentDomain;
  forwardOps: readonly WorkspacePatchOperation[];
  reverseOps: readonly WorkspacePatchOperation[];
}>;

export type WorkspaceComponentExtractionReferenceContribution = Readonly<{
  id: string;
  kind: string;
  owner: WorkspaceComponentExtractionReferenceOwner;
  target: WorkspaceComponentExtractionReferenceTarget;
  classification: WorkspaceComponentExtractionReferenceClassification;
  reason: string;
  rewrite?: WorkspaceComponentExtractionReferenceRewrite;
}>;

export type WorkspaceComponentExtractionReference =
  WorkspaceComponentExtractionReferenceContribution &
    Readonly<{
      providerId: string;
      commandId?: string;
    }>;

export type WorkspaceComponentExtractionReferenceProviderContext = Readonly<{
  workspace: WorkspaceSnapshot;
  sourceDocumentId: string;
  sourceDocument: WorkspacePirDocument;
  targetComponentDocumentId: string;
  replacementInstanceNodeId: string;
  pirBoundaryAlreadyApplied: boolean;
  movedNodeIds: readonly string[];
  nodeRelocations: readonly WorkspaceComponentExtractionNodeRelocation[];
  publicPartMappings: readonly WorkspaceComponentExtractionPublicPartMapping[];
  publicMemberMappings: readonly WorkspaceComponentExtractionPublicMemberMapping[];
}>;

export type WorkspaceComponentExtractionReferenceProvider = Readonly<{
  descriptor: Readonly<{ id: string; version: string }>;
  contribute(
    context: WorkspaceComponentExtractionReferenceProviderContext
  ): readonly WorkspaceComponentExtractionReferenceContribution[];
}>;

export type AnalyzeWorkspaceComponentExtractionReferencesInput = Readonly<{
  workspace: WorkspaceSnapshot;
  sourceDocumentId: string;
  targetComponentDocumentId: string;
  replacementInstanceNodeId: string;
  pirBoundaryAlreadyApplied?: boolean;
  movedNodeIds: readonly string[];
  nodeRelocations?: readonly WorkspaceComponentExtractionNodeRelocationInput[];
  publicPartMappings?: readonly WorkspaceComponentExtractionPublicPartMapping[];
  publicMemberMappings?: readonly WorkspaceComponentExtractionPublicMemberMapping[];
  transactionId: string;
  issuedAt: string;
  providers?: readonly WorkspaceComponentExtractionReferenceProvider[];
}>;

export type WorkspaceComponentExtractionReferencePlan = Readonly<{
  status: 'ready' | 'blocked';
  references: readonly WorkspaceComponentExtractionReference[];
  commands: readonly WorkspaceCommandEnvelope[];
  issues: readonly WorkspaceComponentExtractionReferenceIssue[];
}>;

export type NormalizedWorkspaceComponentExtractionReferenceContext =
  WorkspaceComponentExtractionReferenceProviderContext &
    Readonly<{
      movedNodeIdSet: ReadonlySet<string>;
      memberMappingsBySource: ReadonlyMap<
        string,
        WorkspaceComponentExtractionPublicMemberMapping
      >;
      partMappingsByNodeId: ReadonlyMap<
        string,
        WorkspaceComponentExtractionPublicPartMapping
      >;
      relocationsBySourceNodeId: ReadonlyMap<
        string,
        WorkspaceComponentExtractionNodeRelocation
      >;
    }>;

export const createWorkspaceComponentExtractionMemberSourceKey = (
  source: WorkspaceComponentExtractionPublicMemberSource
): string => `${source.kind}\u0000${source.id}`;
