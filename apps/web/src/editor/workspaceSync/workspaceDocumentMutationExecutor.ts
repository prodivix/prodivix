import { editorApi } from '@/editor/editorApi';
import type { DecodedWorkspaceMutation } from '@prodivix/workspace';
import {
  getWorkspaceOperationSourceIds,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceResolutionOperation,
  type WorkspaceConflictSession,
} from '@prodivix/workspace-sync';
import { analyzeWorkspaceRevisionFailure } from './workspaceRevisionRecovery';

export class WorkspaceDocumentMutationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceDocumentMutationExecutionError';
  }
}

export type WorkspaceDocumentMutationExecutionResult =
  | {
      kind: 'acknowledged';
      mutation: DecodedWorkspaceMutation;
      operation: WorkspaceOperation;
      optimisticSnapshot: WorkspaceSnapshot;
      rebased: boolean;
      serverBaseSnapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'already-applied';
      snapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'conflict';
      session: WorkspaceConflictSession;
    };

const MAX_AUTOMATIC_REBASE_ATTEMPTS = 2;

const createOperationId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `workspace-rebase-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const assertDocumentCommand = (operation: WorkspaceOperation) => {
  if (operation.kind !== 'command' || !operation.command.target.documentId) {
    throw new WorkspaceDocumentMutationExecutionError(
      'Document mutation recovery requires one document command.'
    );
  }
  return operation.command;
};

const sendDocumentOperation = async (
  token: string,
  expectedSnapshot: WorkspaceSnapshot,
  operation: WorkspaceOperation
): Promise<DecodedWorkspaceMutation> => {
  const command = assertDocumentCommand(operation);
  const documentId = command.target.documentId!;
  const expectedDocument = expectedSnapshot.docsById[documentId];
  if (!expectedDocument) {
    throw new WorkspaceDocumentMutationExecutionError(
      `Document ${documentId} is missing from the expected snapshot.`
    );
  }
  const mutation = await editorApi.patchWorkspaceDocument(
    token,
    expectedSnapshot,
    documentId,
    {
      expectedContentRev: expectedDocument.contentRev,
      command,
      clientMutationId: command.id,
    }
  );
  if (mutation.acceptedMutationId !== command.id) {
    throw new WorkspaceDocumentMutationExecutionError(
      'The server did not acknowledge the requested workspace mutation.'
    );
  }
  return mutation;
};

const executeAttempt = async (input: {
  automaticRebaseAttempts: number;
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  token: string;
}): Promise<WorkspaceDocumentMutationExecutionResult> => {
  try {
    const mutation = await sendDocumentOperation(
      input.token,
      input.baseSnapshot,
      input.operation
    );
    return {
      kind: 'acknowledged',
      mutation,
      operation: input.operation,
      optimisticSnapshot: input.localSnapshot,
      rebased: input.automaticRebaseAttempts > 0,
      serverBaseSnapshot: input.baseSnapshot,
    };
  } catch (error) {
    const recovery = await analyzeWorkspaceRevisionFailure({
      error,
      token: input.token,
      baseSnapshot: input.baseSnapshot,
      localSnapshot: input.localSnapshot,
      sourceOperation: input.operation,
    });
    if (recovery.kind === 'not-conflict') throw error;
    if (recovery.kind === 'conflict') {
      return { kind: 'conflict', session: recovery.session };
    }
    if (recovery.status === 'already-applied') {
      return { kind: 'already-applied', snapshot: recovery.snapshot };
    }
    if (input.automaticRebaseAttempts >= MAX_AUTOMATIC_REBASE_ATTEMPTS) {
      throw new WorkspaceDocumentMutationExecutionError(
        'The workspace changed repeatedly while rebasing. Retry the save.'
      );
    }
    const operationId = createOperationId();
    const rebuilt = createWorkspaceResolutionOperation({
      remoteSnapshot: recovery.remoteSnapshot,
      resolvedSnapshot: recovery.snapshot,
      operationId,
      issuedAt: new Date().toISOString(),
      label: 'Rebase workspace document',
      sourceOperationIds: getWorkspaceOperationSourceIds(input.operation),
    });
    if (rebuilt.ok === false) {
      throw new WorkspaceDocumentMutationExecutionError(
        rebuilt.issues[0]?.message ||
          'Could not build a safe workspace rebase operation.'
      );
    }
    if (!rebuilt.operation) {
      return { kind: 'already-applied', snapshot: recovery.snapshot };
    }
    assertDocumentCommand(rebuilt.operation);
    return executeAttempt({
      token: input.token,
      baseSnapshot: recovery.remoteSnapshot,
      localSnapshot: recovery.snapshot,
      operation: rebuilt.operation,
      automaticRebaseAttempts: input.automaticRebaseAttempts + 1,
    });
  }
};

/** Sends one document command and performs bounded semantic 409 recovery. */
export const executeWorkspaceDocumentMutation = (input: {
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
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
  return executeAttempt({ ...input, automaticRebaseAttempts: 0 });
};
