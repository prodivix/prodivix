import type {
  WorkspaceOperation,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { WorkspaceOutboxStore } from '@prodivix/workspace-sync';
import {
  executeWorkspaceOutboxOperation,
  type WorkspaceOutboxOperationExecutionResult,
} from './workspaceOutboxExecutor';

export class WorkspaceDocumentMutationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceDocumentMutationExecutionError';
  }
}

export type WorkspaceDocumentMutationExecutionResult =
  | Exclude<
      WorkspaceOutboxOperationExecutionResult,
      { kind: 'already-applied' }
    >
  | { kind: 'already-applied'; snapshot: WorkspaceSnapshot };

const assertDocumentCommand = (operation: WorkspaceOperation) => {
  if (operation.kind !== 'command' || !operation.command.target.documentId) {
    throw new WorkspaceDocumentMutationExecutionError(
      'Document mutation recovery requires one document command.'
    );
  }
  return operation.command;
};

/** Persists a document command before sending it through Atomic Commit. */
export const executeWorkspaceDocumentMutation = async (input: {
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  outboxStore?: WorkspaceOutboxStore;
  token: string;
}): Promise<WorkspaceDocumentMutationExecutionResult> => {
  if (
    input.baseSnapshot.id !== input.localSnapshot.id ||
    assertDocumentCommand(input.operation).target.workspaceId !==
      input.baseSnapshot.id
  ) {
    throw new WorkspaceDocumentMutationExecutionError(
      'Document mutation snapshots and operation must share a workspace.'
    );
  }
  const result = await executeWorkspaceOutboxOperation({
    token: input.token,
    baseSnapshot: input.baseSnapshot,
    localSnapshot: input.localSnapshot,
    operation: input.operation,
    ...(input.outboxStore ? { store: input.outboxStore } : {}),
  });
  return result.kind === 'already-applied'
    ? { kind: 'already-applied', snapshot: result.snapshot }
    : result;
};
