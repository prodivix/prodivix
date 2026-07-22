import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceOutboxEntry,
  type WorkspaceOutboxEntry,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import { workspaceOutboxStore } from './indexedDbWorkspaceOutboxStore';
import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';

export type WorkspaceOperationOutboxDispatchResult =
  | Readonly<{ status: 'applied'; entry: WorkspaceOutboxEntry }>
  | Readonly<{ status: 'rejected'; message: string }>;

export type WorkspaceOptimisticApplyResult = Readonly<{
  ok: boolean;
  message?: string;
}>;

/** Persists before applying an optimistic operation; the global effect drains it. */
export const enqueueWorkspaceOperationOutboxAndDispatch = async (input: {
  operation: WorkspaceOperation;
  outboxStore?: WorkspaceOutboxStore;
  workspace: WorkspaceSnapshot;
  applyOptimistically?: () => WorkspaceOptimisticApplyResult;
}): Promise<WorkspaceOperationOutboxDispatchResult> => {
  const created = createWorkspaceOutboxEntry({
    baseSnapshot: input.workspace,
    operation: input.operation,
    now: Date.now(),
  });
  if (created.ok === false) {
    return {
      status: 'rejected',
      message:
        created.issues[0]?.message ||
        'Could not persist the Workspace operation.',
    };
  }
  const store = input.outboxStore ?? workspaceOutboxStore;
  await store.enqueue(created.entry);
  const state = useEditorStore.getState();
  if (!state.workspace || state.workspace.id !== input.workspace.id) {
    await store.remove(created.entry.id);
    return {
      status: 'rejected',
      message: 'The active Workspace changed before the operation was applied.',
    };
  }
  let applied = false;
  let rejectionMessage: string | undefined;
  try {
    if (input.applyOptimistically) {
      const result = input.applyOptimistically();
      applied = result.ok;
      rejectionMessage = result.message;
    } else {
      const result =
        input.operation.kind === 'command'
          ? state.dispatchWorkspaceCommand(input.operation.command)
          : state.dispatchWorkspaceTransaction(input.operation.transaction);
      applied = Boolean(result?.ok);
      rejectionMessage =
        result && result.ok === false ? result.issues[0]?.message : undefined;
    }
  } catch (error) {
    await store.remove(created.entry.id);
    return {
      status: 'rejected',
      message:
        error instanceof Error && error.message
          ? error.message
          : 'Could not apply the Workspace operation.',
    };
  }
  if (!applied) {
    await store.remove(created.entry.id);
    return {
      status: 'rejected',
      message: rejectionMessage || 'Could not apply the Workspace operation.',
    };
  }
  notifyWorkspaceOutboxChanged(created.entry.workspaceId);
  return { status: 'applied', entry: created.entry };
};
