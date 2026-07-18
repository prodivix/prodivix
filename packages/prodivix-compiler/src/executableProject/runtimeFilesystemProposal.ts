import type { ExecutionFilesystemDiff } from '@prodivix/runtime-core';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceAssetContentUpdateCommand,
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceCodeSourceUpdateCommand,
  createWorkspaceDocumentIntentRequest,
  createWorkspaceVfsIntentPlan,
  deleteWorkspaceCodeDocumentIntentRequest,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import {
  analyzeRuntimeFilesystemEntries,
  projectRuntimeFilesystemAnalysis,
} from './runtimeFilesystemProposalAnalysis';
import type {
  AnalyzedRuntimeFilesystemProposalEntry,
  CreateWorkspaceRuntimeFilesystemProposalInput,
  CreateWorkspaceRuntimeFilesystemAssetUploadPlanInput,
  RuntimeFilesystemAssetUploadReceipt,
  WorkspaceRuntimeFilesystemAssetUploadPlanResult,
  WorkspaceRuntimeFilesystemProposalAnalysis,
  WorkspaceRuntimeFilesystemProposalResult,
} from './runtimeFilesystemProposal.types';

export type {
  CreateWorkspaceRuntimeFilesystemProposalInput,
  CreateWorkspaceRuntimeFilesystemAssetUploadPlanInput,
  RuntimeFilesystemAssetUploadReceipt,
  RuntimeFilesystemAssetUploadRequest,
  RuntimeFilesystemProposalBlockReason,
  RuntimeFilesystemProposalEntry,
  WorkspaceRuntimeFilesystemProposalAnalysis,
  WorkspaceRuntimeFilesystemProposalResult,
  WorkspaceRuntimeFilesystemAssetUploadPlanResult,
} from './runtimeFilesystemProposal.types';

const CHANGE_ORDER = Object.freeze({ added: 0, modified: 1, deleted: 2 });

/** Projects safe, revision-fenced whole-file code changes without mutating Workspace state. */
export const analyzeWorkspaceRuntimeFilesystemDiff = (
  workspace: WorkspaceSnapshot,
  diff: ExecutionFilesystemDiff
): WorkspaceRuntimeFilesystemProposalAnalysis => {
  const entries = analyzeRuntimeFilesystemEntries(workspace, diff);
  return projectRuntimeFilesystemAnalysis(diff, entries);
};

const createVfsCommand = (
  workspace: WorkspaceSnapshot,
  entry: AnalyzedRuntimeFilesystemProposalEntry,
  commandId: string,
  issuedAt: string
): WorkspaceCommandEnvelope | undefined => {
  if (!entry.documentId) return undefined;
  if (entry.kind === 'added') {
    if (entry.documentType === 'asset') {
      if (!entry.nextAssetContent) return undefined;
      const plan = createWorkspaceVfsIntentPlan(
        workspace,
        createWorkspaceDocumentIntentRequest({
          workspaceRev: workspace.workspaceRev,
          intentId: commandId,
          issuedAt,
          documentId: entry.documentId,
          path: `/${entry.path}`,
          type: 'asset',
          content: entry.nextAssetContent,
        })
      );
      return plan
        ? Object.freeze({
            ...plan.command,
            label: `Import runtime Asset /${entry.path}`,
          })
        : undefined;
    }
    if (!entry.language || entry.nextSource === undefined) return undefined;
    const plan = createWorkspaceVfsIntentPlan(
      workspace,
      createWorkspaceCodeDocumentIntentRequest({
        workspaceRev: workspace.workspaceRev,
        intentId: commandId,
        issuedAt,
        documentId: entry.documentId,
        path: `/${entry.path}`,
        content: { language: entry.language, source: entry.nextSource },
      })
    );
    return plan
      ? Object.freeze({
          ...plan.command,
          label: `Adopt added runtime file /${entry.path}`,
        })
      : undefined;
  }
  if (entry.kind === 'deleted') {
    const plan = createWorkspaceVfsIntentPlan(
      workspace,
      deleteWorkspaceCodeDocumentIntentRequest({
        workspaceRev: workspace.workspaceRev,
        intentId: commandId,
        issuedAt,
        documentId: entry.documentId,
      })
    );
    return plan
      ? Object.freeze({
          ...plan.command,
          label: `Adopt deleted runtime file ${entry.path}`,
        })
      : undefined;
  }
  return undefined;
};

const createEntryCommand = (
  workspace: WorkspaceSnapshot,
  entry: AnalyzedRuntimeFilesystemProposalEntry,
  commandId: string,
  issuedAt: string
): WorkspaceCommandEnvelope | undefined => {
  if (entry.kind !== 'modified')
    return createVfsCommand(workspace, entry, commandId, issuedAt);
  if (entry.documentType === 'asset') {
    if (!entry.documentId || !entry.nextAssetContent) return undefined;
    const document = workspace.docsById[entry.documentId];
    const command = document
      ? createWorkspaceAssetContentUpdateCommand({
          workspaceId: workspace.id,
          document,
          content: entry.nextAssetContent,
          commandId,
          issuedAt,
          label: `Replace runtime Asset ${document.path}`,
        })
      : null;
    return command ? Object.freeze(command) : undefined;
  }
  if (!entry.documentId || entry.nextSource === undefined) return undefined;
  const document = workspace.docsById[entry.documentId];
  const command = document
    ? createWorkspaceCodeSourceUpdateCommand({
        workspaceId: workspace.id,
        document,
        source: entry.nextSource,
        commandId,
        issuedAt,
        label: `Adopt runtime change for ${document.path}`,
      })
    : null;
  return command ? Object.freeze(command) : undefined;
};

const selectEligibleEntries = (
  entries: readonly AnalyzedRuntimeFilesystemProposalEntry[],
  selectedChangeIds: readonly string[]
):
  | Readonly<{
      status: 'ready';
      entries: readonly AnalyzedRuntimeFilesystemProposalEntry[];
    }>
  | Readonly<{
      status: 'blocked';
      reason: 'no-selection' | 'invalid-selection';
    }> => {
  const selected = new Set(selectedChangeIds);
  if (!selected.size)
    return Object.freeze({ status: 'blocked', reason: 'no-selection' });
  if (
    selected.size !== selectedChangeIds.length ||
    [...selected].some(
      (changeId) =>
        !entries.some(
          (entry) => entry.changeId === changeId && entry.status === 'eligible'
        )
    )
  ) {
    return Object.freeze({ status: 'blocked', reason: 'invalid-selection' });
  }
  return Object.freeze({
    status: 'ready',
    entries: Object.freeze(
      entries.filter((entry) => selected.has(entry.changeId))
    ),
  });
};

/** Returns the exact bytes that composition roots must durably upload before authoring. */
export const createWorkspaceRuntimeFilesystemAssetUploadPlan = (
  input: CreateWorkspaceRuntimeFilesystemAssetUploadPlanInput
): WorkspaceRuntimeFilesystemAssetUploadPlanResult => {
  const entries = analyzeRuntimeFilesystemEntries(input.workspace, input.diff);
  const analysis = projectRuntimeFilesystemAnalysis(input.diff, entries);
  const selection = selectEligibleEntries(entries, input.selectedChangeIds);
  if (selection.status === 'blocked') {
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: selection.reason,
    });
  }
  return Object.freeze({
    status: 'ready',
    analysis,
    uploads: Object.freeze(
      selection.entries.flatMap((entry) =>
        entry.assetUpload
          ? [
              Object.freeze({
                ...entry.assetUpload,
                contents: new Uint8Array(entry.assetUpload.contents),
              }),
            ]
          : []
      )
    ),
  });
};

const validateAssetUploadReceipts = (
  selectedEntries: readonly AnalyzedRuntimeFilesystemProposalEntry[],
  receipts: readonly RuntimeFilesystemAssetUploadReceipt[] | undefined
): 'ready' | 'missing-asset-upload' | 'invalid-asset-upload' => {
  const expected = selectedEntries.filter((entry) => entry.assetUpload);
  const provided = receipts ?? [];
  if (provided.length < expected.length) return 'missing-asset-upload';
  if (provided.length !== expected.length) return 'invalid-asset-upload';
  const receiptsByChangeId = new Map<
    string,
    RuntimeFilesystemAssetUploadReceipt
  >();
  for (const receipt of provided) {
    if (receiptsByChangeId.has(receipt.changeId)) return 'invalid-asset-upload';
    receiptsByChangeId.set(receipt.changeId, receipt);
  }
  for (const entry of expected) {
    const receipt = receiptsByChangeId.get(entry.changeId);
    const expectedReference = entry.assetUpload!.expectedReference;
    const actual = receipt?.upload.reference;
    if (
      !receipt ||
      (receipt.upload.kind !== 'stored' &&
        receipt.upload.kind !== 'existing') ||
      !actual ||
      actual.kind !== expectedReference.kind ||
      actual.digest !== expectedReference.digest ||
      actual.byteLength !== expectedReference.byteLength ||
      actual.mediaType !== expectedReference.mediaType
    ) {
      return receipt ? 'invalid-asset-upload' : 'missing-asset-upload';
    }
  }
  return 'ready';
};

const planCommands = (
  workspace: WorkspaceSnapshot,
  entries: readonly AnalyzedRuntimeFilesystemProposalEntry[],
  transactionId: string,
  issuedAt: string
): WorkspaceCommandEnvelope[] | undefined => {
  const ordered = [...entries].sort(
    (left, right) =>
      CHANGE_ORDER[left.kind] - CHANGE_ORDER[right.kind] ||
      left.path.localeCompare(right.path) ||
      left.changeId.localeCompare(right.changeId)
  );
  const commands: WorkspaceCommandEnvelope[] = [];
  let current = workspace;
  for (let index = 0; index < ordered.length; index += 1) {
    const command = createEntryCommand(
      current,
      ordered[index]!,
      `${transactionId}:change:${index + 1}`,
      issuedAt
    );
    if (!command) return undefined;
    const applied = applyWorkspaceCommand(current, command);
    if (!applied.ok) return undefined;
    commands.push(command);
    current = applied.snapshot;
  }
  return commands;
};

/** Converts explicitly selected eligible changes into one reversible atomic Workspace transaction. */
export const createWorkspaceRuntimeFilesystemProposal = (
  input: CreateWorkspaceRuntimeFilesystemProposalInput
): WorkspaceRuntimeFilesystemProposalResult => {
  const entries = analyzeRuntimeFilesystemEntries(input.workspace, input.diff);
  const analysis = projectRuntimeFilesystemAnalysis(input.diff, entries);
  const selection = selectEligibleEntries(entries, input.selectedChangeIds);
  if (selection.status === 'blocked')
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: selection.reason,
    });
  const assetUploadStatus = validateAssetUploadReceipts(
    selection.entries,
    input.assetUploadReceipts
  );
  if (assetUploadStatus !== 'ready')
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: assetUploadStatus,
    });
  if (!input.transactionId.trim() || !input.issuedAt.trim())
    throw new TypeError('Runtime filesystem proposal identity is invalid.');
  const commands = planCommands(
    input.workspace,
    selection.entries,
    input.transactionId,
    input.issuedAt
  );
  if (!commands?.length)
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: 'operation-rejected',
    });
  const transaction: WorkspaceTransactionEnvelope = Object.freeze({
    id: input.transactionId,
    workspaceId: input.workspace.id,
    issuedAt: input.issuedAt,
    commands: [...commands],
    label: `Adopt ${commands.length} runtime filesystem ${
      commands.length === 1 ? 'change' : 'changes'
    }`,
  });
  if (!applyWorkspaceTransaction(input.workspace, transaction).ok)
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: 'operation-rejected',
    });
  return Object.freeze({
    status: 'ready',
    analysis,
    transaction,
  });
};
