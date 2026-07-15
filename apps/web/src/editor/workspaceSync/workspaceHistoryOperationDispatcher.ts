import {
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceHistoryScopeSelector,
} from '@prodivix/workspace';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { commitLocalProjectWorkspaceOutbox } from './localProjectWorkspaceOutbox';
import type { WorkspaceAuthoringOperationOutcome } from './workspaceAuthoringOperationDispatcher';
import { createWorkspaceClientOperationId } from './workspaceOperationIdentity';
import { enqueueWorkspaceOperationOutboxAndDispatch } from './workspaceVfsOutboxExecutor';

export type WorkspaceHistoryDirection = 'undo' | 'redo';

const rejected = (message: string): WorkspaceAuthoringOperationOutcome => ({
  status: 'rejected',
  message,
});

/**
 * Turns a History traversal into a fresh causal WorkspaceOperation. Remote
 * workspaces persist that exact operation before the optimistic transition;
 * local workspaces commit the same transition to their canonical repository.
 */
export const dispatchWorkspaceHistoryOperation = async (input: {
  direction: WorkspaceHistoryDirection;
  scopes: WorkspaceHistoryScopeSelector;
}): Promise<WorkspaceAuthoringOperationOutcome> => {
  const state = useEditorStore.getState();
  const baseWorkspace = state.workspace;
  const baseHistory = state.workspaceHistory;
  if (!baseWorkspace || state.workspaceReadonly) {
    return rejected(
      state.workspaceReadonly
        ? 'This Workspace is read-only.'
        : 'No Workspace is loaded.'
    );
  }

  const operationId = createWorkspaceClientOperationId(
    `history-${input.direction}`
  );
  const issuedAt = new Date().toISOString();
  const options = {
    clock: () => issuedAt,
    idFactory: (context: {
      role: 'operation' | 'command';
      commandIndex?: number;
    }) =>
      context.role === 'operation'
        ? operationId
        : `${operationId}:command:${context.commandIndex ?? 0}`,
  };
  const result =
    input.direction === 'undo'
      ? undoWorkspaceHistory(baseWorkspace, baseHistory, input.scopes, options)
      : redoWorkspaceHistory(baseWorkspace, baseHistory, input.scopes, options);
  if (result.ok === false) {
    return rejected(
      result.issues[0]?.message ||
        `Could not ${input.direction} Workspace History.`
    );
  }

  const applyTransition = () => {
    const applied = useEditorStore.getState().commitWorkspaceHistoryTransition({
      baseWorkspace,
      baseHistory,
      result,
    });
    return {
      ok: applied,
      ...(!applied
        ? {
            message:
              'The Workspace changed before the History operation was applied.',
          }
        : {}),
    };
  };

  try {
    const dispatched = await enqueueWorkspaceOperationOutboxAndDispatch({
      workspace: baseWorkspace,
      operation: result.appliedOperation,
      applyOptimistically: applyTransition,
    });
    if (dispatched.status === 'applied' && isLocalProjectId(baseWorkspace.id)) {
      try {
        await commitLocalProjectWorkspaceOutbox(baseWorkspace.id);
      } catch (error) {
        console.warn(
          '[local-workspace-outbox] History operation remains durably queued',
          error
        );
      }
    }
    return dispatched.status === 'applied'
      ? { status: 'applied', operationId }
      : dispatched;
  } catch (error) {
    return rejected(
      error instanceof Error
        ? error.message
        : `Could not persist the ${input.direction} operation.`
    );
  }
};
