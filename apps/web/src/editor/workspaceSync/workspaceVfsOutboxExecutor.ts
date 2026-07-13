import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceRouteIntentPlan,
  createWorkspaceVfsIntentPlan,
  type WorkspaceCommandEnvelope,
  type WorkspaceOperation,
  type WorkspaceRouteIntent,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import {
  createWorkspaceOutboxEntry,
  type WorkspaceOutboxEntry,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import { workspaceOutboxStore } from './indexedDbWorkspaceOutboxStore';
import {
  executeWorkspaceOutboxOperation,
  type WorkspaceOutboxOperationExecutionResult,
} from './workspaceOutboxExecutor';
import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';

export type WorkspaceOperationOutboxExecutionResult =
  | Readonly<{
      status: 'applied';
      result: WorkspaceOutboxOperationExecutionResult;
    }>
  | Readonly<{
      status: 'conflict';
      result: Extract<
        WorkspaceOutboxOperationExecutionResult,
        { kind: 'conflict' }
      >;
    }>
  | Readonly<{
      status: 'rejected';
      message: string;
    }>;

export type WorkspaceOperationOutboxDispatchResult =
  | Readonly<{ status: 'applied'; entry: WorkspaceOutboxEntry }>
  | Readonly<{ status: 'rejected'; message: string }>;

/** Persists before applying an optimistic operation; the global effect drains it. */
export const enqueueWorkspaceOperationOutboxAndDispatch = async (input: {
  operation: WorkspaceOperation;
  outboxStore?: WorkspaceOutboxStore;
  workspace: WorkspaceSnapshot;
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
  const applied =
    input.operation.kind === 'command'
      ? state.dispatchWorkspaceCommand(input.operation.command)
      : state.dispatchWorkspaceTransaction(input.operation.transaction);
  if (!applied || applied.ok === false) {
    await store.remove(created.entry.id);
    return {
      status: 'rejected',
      message:
        applied && applied.ok === false
          ? applied.issues[0]?.message ||
            'Could not apply the Workspace operation.'
          : 'Could not apply the Workspace operation.',
    };
  }
  notifyWorkspaceOutboxChanged(created.entry.workspaceId);
  return { status: 'applied', entry: created.entry };
};

export const executeWorkspaceOperationOutboxAndAdopt = async (input: {
  operation: WorkspaceOperation;
  outboxStore?: WorkspaceOutboxStore;
  token: string;
  workspace: WorkspaceSnapshot;
}): Promise<WorkspaceOperationOutboxExecutionResult> => {
  let localSnapshot: WorkspaceSnapshot;
  if (input.operation.kind === 'command') {
    const applied = applyWorkspaceCommand(
      input.workspace,
      input.operation.command
    );
    if (applied.ok === false) {
      return {
        status: 'rejected',
        message:
          applied.issues[0]?.message ||
          'Could not apply the Workspace operation.',
      };
    }
    localSnapshot = applied.snapshot;
  } else {
    const applied = applyWorkspaceTransaction(
      input.workspace,
      input.operation.transaction
    );
    if (applied.ok === false) {
      return {
        status: 'rejected',
        message:
          applied.issues[0]?.message ||
          'Could not apply the Workspace operation.',
      };
    }
    localSnapshot = applied.snapshot;
  }
  const expectedDocumentEditSeqById = {
    ...useEditorStore.getState().documentEditSeqById,
  };
  const result = await executeWorkspaceOutboxOperation({
    token: input.token,
    baseSnapshot: input.workspace,
    localSnapshot,
    operation: input.operation,
    ...(input.outboxStore ? { store: input.outboxStore } : {}),
  });
  if (result.kind === 'conflict') {
    useEditorStore.getState().openWorkspaceRevisionConflict(result.session);
    return { status: 'conflict', result };
  }
  const rebasedSnapshot =
    result.kind === 'already-applied'
      ? result.snapshot
      : result.optimisticSnapshot;
  const operation =
    result.kind === 'already-applied'
      ? (result.operation ?? {
          ...input.operation,
        })
      : result.operation;
  const serverBaseSnapshot =
    result.kind === 'already-applied'
      ? input.workspace
      : result.serverBaseSnapshot;
  const adoption = useEditorStore.getState().adoptRebasedWorkspaceOperation({
    requestSnapshot: input.workspace,
    serverBaseSnapshot,
    rebasedSnapshot,
    operation,
    ...(result.kind === 'acknowledged' ? { mutation: result.mutation } : {}),
    expectedDocumentEditSeqById,
  });
  if (adoption.status === 'conflict') {
    return {
      status: 'conflict',
      result: { kind: 'conflict', session: adoption.session },
    };
  }
  if (adoption.status === 'rejected') {
    return { status: 'rejected', message: adoption.message };
  }
  return { status: 'applied', result };
};

export const executeWorkspaceCommandOutboxAndAdopt = async (input: {
  command: WorkspaceCommandEnvelope;
  outboxStore?: WorkspaceOutboxStore;
  token: string;
  workspace: WorkspaceSnapshot;
}): Promise<WorkspaceOperationOutboxExecutionResult> =>
  executeWorkspaceOperationOutboxAndAdopt({
    token: input.token,
    workspace: input.workspace,
    operation: { kind: 'command', command: input.command },
    ...(input.outboxStore ? { outboxStore: input.outboxStore } : {}),
  });

/** Plans legacy VFS actions as Operations, persists them, then adopts safely. */
export const executeWorkspaceVfsOutboxIntent = async (input: {
  outboxStore?: WorkspaceOutboxStore;
  request: WorkspaceVfsIntentRequest;
  token: string;
  workspace: WorkspaceSnapshot;
}): Promise<WorkspaceOperationOutboxExecutionResult> => {
  const plan = createWorkspaceVfsIntentPlan(input.workspace, input.request);
  if (!plan) {
    return {
      status: 'rejected',
      message: 'Could not plan the Workspace VFS operation.',
    };
  }
  return executeWorkspaceCommandOutboxAndAdopt({
    token: input.token,
    workspace: input.workspace,
    command: plan.command,
    ...(input.outboxStore ? { outboxStore: input.outboxStore } : {}),
  });
};

export const enqueueWorkspaceRouteIntentOutboxAndDispatch = async (input: {
  intent: WorkspaceRouteIntent;
  outboxStore?: WorkspaceOutboxStore;
  workspace: WorkspaceSnapshot;
}): Promise<WorkspaceOperationOutboxDispatchResult> => {
  const plan = createWorkspaceRouteIntentPlan(input.workspace, input.intent);
  if (!plan) {
    return {
      status: 'rejected',
      message: 'Could not plan the Route operation.',
    };
  }
  return enqueueWorkspaceOperationOutboxAndDispatch({
    workspace: input.workspace,
    operation:
      plan.kind === 'command'
        ? { kind: 'command', command: plan.command }
        : { kind: 'transaction', transaction: plan.transaction },
    ...(input.outboxStore ? { outboxStore: input.outboxStore } : {}),
  });
};
