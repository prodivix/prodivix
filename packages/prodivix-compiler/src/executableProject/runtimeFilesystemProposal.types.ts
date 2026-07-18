import type {
  ExecutionFilesystemDiff,
  ExecutionFilesystemDiffChange,
} from '@prodivix/runtime-core';
import type {
  BinaryAssetBlobReference,
  BinaryAssetBlobUploadResult,
} from '@prodivix/assets';
import type {
  WorkspaceCodeDocumentLanguage,
  WorkspaceAssetDocumentContent,
  WorkspaceSnapshot,
  WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';

export type RuntimeFilesystemProposalBlockReason =
  | 'incomplete-capture'
  | 'workspace-mismatch'
  | 'stale-workspace-revision'
  | 'stale-route-revision'
  | 'unsupported-change-kind'
  | 'missing-source-trace'
  | 'unexpected-source-trace'
  | 'ambiguous-source-trace'
  | 'partial-source-trace'
  | 'unsupported-source-owner'
  | 'unsupported-code-path'
  | 'path-conflict'
  | 'document-id-conflict'
  | 'missing-code-document'
  | 'missing-asset-document'
  | 'stale-content-revision'
  | 'stale-meta-revision'
  | 'baseline-drift'
  | 'binary-content'
  | 'asset-media-mismatch'
  | 'asset-deletion-unsupported'
  | 'active-code-artifact'
  | 'controlled-code-artifact'
  | 'lifecycle-unavailable'
  | 'operation-rejected'
  | 'duplicate-target'
  | 'unchanged-runtime';

export type RuntimeFilesystemProposalEntry = Readonly<{
  changeId: string;
  kind: ExecutionFilesystemDiffChange['kind'];
  path: string;
  status: 'eligible' | 'blocked';
  documentType?: 'code' | 'asset';
  documentId?: string;
  reason?: RuntimeFilesystemProposalBlockReason;
}>;

export type WorkspaceRuntimeFilesystemProposalAnalysis = Readonly<{
  complete: boolean;
  entries: readonly RuntimeFilesystemProposalEntry[];
  eligibleChangeIds: readonly string[];
}>;

export type CreateWorkspaceRuntimeFilesystemProposalInput = Readonly<{
  workspace: WorkspaceSnapshot;
  diff: ExecutionFilesystemDiff;
  selectedChangeIds: readonly string[];
  transactionId: string;
  issuedAt: string;
  assetUploadReceipts?: readonly RuntimeFilesystemAssetUploadReceipt[];
}>;

export type RuntimeFilesystemAssetUploadRequest = Readonly<{
  changeId: string;
  documentId: string;
  mediaType: string;
  contents: Uint8Array;
  expectedReference: BinaryAssetBlobReference;
}>;

export type RuntimeFilesystemAssetUploadReceipt = Readonly<{
  changeId: string;
  upload: BinaryAssetBlobUploadResult;
}>;

export type CreateWorkspaceRuntimeFilesystemAssetUploadPlanInput = Readonly<{
  workspace: WorkspaceSnapshot;
  diff: ExecutionFilesystemDiff;
  selectedChangeIds: readonly string[];
}>;

export type WorkspaceRuntimeFilesystemAssetUploadPlanResult =
  | Readonly<{
      status: 'ready';
      analysis: WorkspaceRuntimeFilesystemProposalAnalysis;
      uploads: readonly RuntimeFilesystemAssetUploadRequest[];
    }>
  | Readonly<{
      status: 'blocked';
      analysis: WorkspaceRuntimeFilesystemProposalAnalysis;
      reason: 'no-selection' | 'invalid-selection';
    }>;

export type WorkspaceRuntimeFilesystemProposalResult =
  | Readonly<{
      status: 'ready';
      analysis: WorkspaceRuntimeFilesystemProposalAnalysis;
      transaction: WorkspaceTransactionEnvelope;
    }>
  | Readonly<{
      status: 'blocked';
      analysis: WorkspaceRuntimeFilesystemProposalAnalysis;
      reason:
        | 'no-selection'
        | 'invalid-selection'
        | 'missing-asset-upload'
        | 'invalid-asset-upload'
        | 'operation-rejected';
    }>;

export type AnalyzedRuntimeFilesystemProposalEntry =
  RuntimeFilesystemProposalEntry &
    Readonly<{
      nextSource?: string;
      language?: WorkspaceCodeDocumentLanguage;
      nextAssetContent?: WorkspaceAssetDocumentContent;
      assetUpload?: RuntimeFilesystemAssetUploadRequest;
    }>;
