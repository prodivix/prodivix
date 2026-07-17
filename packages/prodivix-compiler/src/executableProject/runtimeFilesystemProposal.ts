import type { ExecutionFilesystemDiff } from '@prodivix/runtime-core';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceCodeDocumentIntentRequest,
  createWorkspaceCodeSourceUpdateCommand,
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
  WorkspaceRuntimeFilesystemProposalAnalysis,
  WorkspaceRuntimeFilesystemProposalResult,
} from './runtimeFilesystemProposal.types';

export type {
  CreateWorkspaceRuntimeFilesystemProposalInput,
  RuntimeFilesystemProposalBlockReason,
  RuntimeFilesystemProposalEntry,
  WorkspaceRuntimeFilesystemProposalAnalysis,
  WorkspaceRuntimeFilesystemProposalResult,
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
  const selected = new Set(input.selectedChangeIds);
  if (!selected.size)
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: 'no-selection',
    });
  if (
    selected.size !== input.selectedChangeIds.length ||
    [...selected].some(
      (changeId) =>
        !entries.some(
          (entry) => entry.changeId === changeId && entry.status === 'eligible'
        )
    )
  )
    return Object.freeze({
      status: 'blocked',
      analysis,
      reason: 'invalid-selection',
    });
  if (!input.transactionId.trim() || !input.issuedAt.trim())
    throw new TypeError('Runtime filesystem proposal identity is invalid.');
  const selectedEntries = entries.filter((entry) =>
    selected.has(entry.changeId)
  );
  const commands = planCommands(
    input.workspace,
    selectedEntries,
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
