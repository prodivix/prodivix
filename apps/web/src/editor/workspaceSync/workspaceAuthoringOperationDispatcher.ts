import {
  createWorkspaceVfsIntentPlan,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import { augmentWorkspaceOperationWithControlledSource } from '@prodivix/prodivix-compiler';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { commitLocalProjectWorkspaceOutbox } from './localProjectWorkspaceOutbox';
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
 * local Workspace repository; all projects persist the exact Operation to the
 * Durable Outbox before their optimistic Command or Transaction is applied.
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

  const augmented = augmentWorkspaceOperationWithControlledSource({
    workspace: input.workspace,
    operation: input.operation,
  });
  if (augmented.status === 'rejected') {
    return {
      status: 'rejected',
      message:
        augmented.issues[0]?.message ??
        'The controlled visual/code operation was rejected.',
    };
  }
  const operation = augmented.operation;

  const operationId = getOperationId(operation);
  const result = await enqueueWorkspaceOperationOutboxAndDispatch({
    workspace: input.workspace,
    operation,
  });
  if (result.status === 'applied' && isLocalProjectId(input.workspace.id)) {
    try {
      await commitLocalProjectWorkspaceOutbox(input.workspace.id);
    } catch (error) {
      console.warn(
        '[local-workspace-outbox] operation remains durably queued',
        error
      );
    }
  }
  return result.status === 'applied'
    ? { status: 'applied', operationId }
    : result;
};

/** Plans a VFS intent and sends its reversible Command through the same boundary. */
export const dispatchWorkspaceVfsAuthoringIntent = (input: {
  request: WorkspaceVfsIntentRequest;
  readonly: boolean;
  workspace: WorkspaceSnapshot | null | undefined;
}): Promise<WorkspaceAuthoringOperationOutcome> => {
  if (!input.workspace) {
    return Promise.resolve({
      status: 'rejected',
      message: 'No Workspace is loaded.',
    });
  }
  const plan = createWorkspaceVfsIntentPlan(input.workspace, input.request);
  if (!plan) {
    return Promise.resolve({
      status: 'rejected',
      message: 'The VFS action is invalid in this Workspace revision.',
    });
  }
  return dispatchWorkspaceAuthoringOperation({
    workspace: input.workspace,
    readonly: input.readonly,
    operation: { kind: 'command', command: plan.command },
  });
};
