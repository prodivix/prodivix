import type {
  ExecutionFilesystemDiff,
  ExecutionFilesystemDiffChange,
} from '@prodivix/runtime-core';
import type {
  WorkspaceCodeDocumentLanguage,
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
  | 'stale-content-revision'
  | 'stale-meta-revision'
  | 'baseline-drift'
  | 'binary-content'
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
      reason: 'no-selection' | 'invalid-selection' | 'operation-rejected';
    }>;

export type AnalyzedRuntimeFilesystemProposalEntry =
  RuntimeFilesystemProposalEntry &
    Readonly<{
      nextSource?: string;
      language?: WorkspaceCodeDocumentLanguage;
    }>;
