import type {
  WorkspaceOperation,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { enqueueWorkspaceOperationOutboxAndDispatch } from './workspaceVfsOutboxExecutor';

export type WorkspaceAuthoringOperationOutcome =
  | Readonly<{ status: 'applied'; operationId: string }>
  | Readonly<{ status: 'rejected'; message: string }>;

const getOperationId = (operation: WorkspaceOperation): string =>
  operation.kind === 'command'
    ? operation.command.id
    : operation.transaction.id;

/**
 * Applies one canonical authoring operation through the persistence boundary
 * owned by the active Workspace. Browser-only projects are persisted by the
 * local Workspace repository; remote projects are persisted to the Durable
 * Outbox before their optimistic Command or Transaction is applied.
 */
export const dispatchWorkspaceAuthoringOperation = async (input: {
  operation: WorkspaceOperation;
  readonly: boolean;
  workspace: WorkspaceSnapshot | null | undefined;
}): Promise<WorkspaceAuthoringOperationOutcome> => {
  if (!input.workspace || input.readonly) {
    return {
      status: 'rejected',
      message: input.readonly
        ? 'This Workspace is read-only.'
        : 'No Workspace is loaded.',
    };
  }

  const operationId = getOperationId(input.operation);
  if (isLocalProjectId(input.workspace.id)) {
    const state = useEditorStore.getState();
    if (
      !state.workspace ||
      state.workspace.id !== input.workspace.id ||
      state.workspaceReadonly
    ) {
      return {
        status: 'rejected',
        message:
          'The active Workspace changed before the operation was applied.',
      };
    }
    const applied =
      input.operation.kind === 'command'
        ? state.dispatchWorkspaceCommand(input.operation.command)
        : state.dispatchWorkspaceTransaction(input.operation.transaction);
    if (!applied || applied.ok === false) {
      return {
        status: 'rejected',
        message:
          applied && applied.ok === false
            ? applied.issues[0]?.message ||
              'Could not apply the Workspace operation.'
            : 'Could not apply the Workspace operation.',
      };
    }
    return { status: 'applied', operationId };
  }

  const result = await enqueueWorkspaceOperationOutboxAndDispatch({
    workspace: input.workspace,
    operation: input.operation,
  });
  return result.status === 'applied'
    ? { status: 'applied', operationId }
    : result;
};
