import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import {
  applyWorkspaceMutation,
  getWorkspaceOperationId,
  getWorkspaceOperationSourceIds,
  reconcileWorkspaceOperationConfirmation,
  type DecodedWorkspaceMutation,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  applyPersistentWorkspaceOperation,
  blockWorkspaceOutboxEntry,
  canAcknowledgeWorkspaceOutboxEntry,
  createWorkspaceOutboxEntry,
  createWorkspaceResolutionOperation,
  failWorkspaceOutboxEntry,
  retryWorkspaceOutboxEntry,
  type WorkspaceConflictSession,
  type WorkspaceOutboxEntry,
  type WorkspaceOutboxFailure,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import { workspaceOutboxStore } from './indexedDbWorkspaceOutboxStore';
import { analyzeWorkspaceRevisionFailure } from './workspaceRevisionRecovery';
import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';
import {
  persistAcknowledgedWorkspaceLocalReplica,
  type WorkspaceLocalReplicaWriter,
} from './workspaceLocalReplica';

const OUTBOX_LEASE_DURATION_MS = 60_000;
const MAX_AUTOMATIC_REBASE_ATTEMPTS = 2;

export class WorkspaceOutboxExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceOutboxExecutionError';
  }
}

export type WorkspaceOutboxOperationExecutionResult =
  | {
      kind: 'acknowledged';
      mutation: DecodedWorkspaceMutation;
      operation: WorkspaceOperation;
      optimisticSnapshot: WorkspaceSnapshot;
      rebased: boolean;
      serverBaseSnapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'queued';
      entry: WorkspaceOutboxEntry;
      operation: WorkspaceOperation;
      optimisticSnapshot: WorkspaceSnapshot;
      rebased: boolean;
      retryAt?: number;
      serverBaseSnapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'already-applied';
      operation: WorkspaceOperation | null;
      snapshot: WorkspaceSnapshot;
    }
  | {
      kind: 'conflict';
      session: WorkspaceConflictSession;
    };

type ExecuteClaimedEntryInput = {
  automaticRebaseAttempts: number;
  entry: WorkspaceOutboxEntry;
  leaseOwnerId: string;
  optimisticSnapshot: WorkspaceSnapshot;
  rebased: boolean;
  store: WorkspaceOutboxStore;
  token: string;
  replicaWriter?: WorkspaceLocalReplicaWriter;
};

const createRuntimeId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const toOutboxFailure = (error: unknown): WorkspaceOutboxFailure => {
  if (error instanceof ApiError) {
    return {
      code: error.code || `HTTP_${error.status}`,
      message: error.message || 'Workspace commit failed.',
      retryable:
        error.retryable === true ||
        error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        error.status >= 500,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return {
      code: error.name === 'TypeError' ? 'NETWORK_ERROR' : 'CLIENT_ERROR',
      message: error.message || 'Workspace commit failed.',
      retryable: error.name === 'TypeError',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Workspace commit failed.',
    retryable: false,
  };
};

const queuedResult = (
  entry: WorkspaceOutboxEntry,
  optimisticSnapshot: WorkspaceSnapshot,
  rebased: boolean
): WorkspaceOutboxOperationExecutionResult => ({
  kind: 'queued',
  entry,
  operation: entry.operation,
  optimisticSnapshot,
  rebased,
  serverBaseSnapshot: entry.baseSnapshot,
  ...(entry.state.kind === 'retry-wait'
    ? { retryAt: entry.state.nextAttemptAt }
    : {}),
});

const persistFailure = async (
  input: ExecuteClaimedEntryInput,
  error: unknown
): Promise<WorkspaceOutboxOperationExecutionResult> => {
  const failure = toOutboxFailure(error);
  const now = Date.now();
  if (failure.retryable) {
    const retrying = retryWorkspaceOutboxEntry(input.entry, {
      leaseOwnerId: input.leaseOwnerId,
      now,
      failure,
      entropy: Math.random(),
    });
    if (!retrying) {
      throw new WorkspaceOutboxExecutionError(
        'Workspace outbox retry lost its sending lease.'
      );
    }
    await input.store.update(retrying, input.leaseOwnerId);
    notifyWorkspaceOutboxChanged(input.entry.workspaceId);
    return queuedResult(retrying, input.optimisticSnapshot, input.rebased);
  }
  const failed = failWorkspaceOutboxEntry(input.entry, {
    leaseOwnerId: input.leaseOwnerId,
    now,
    failure,
  });
  if (failed) await input.store.update(failed, input.leaseOwnerId);
  throw error;
};

const persistAcknowledgementFailure = async (
  input: ExecuteClaimedEntryInput,
  error: unknown
): Promise<WorkspaceOutboxOperationExecutionResult> => {
  const retrying = retryWorkspaceOutboxEntry(input.entry, {
    leaseOwnerId: input.leaseOwnerId,
    now: Date.now(),
    failure: {
      code: 'LOCAL_ACK_PERSISTENCE_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'The acknowledged operation could not be persisted locally.',
      retryable: true,
    },
    entropy: Math.random(),
  });
  if (!retrying || !(await input.store.update(retrying, input.leaseOwnerId))) {
    throw new WorkspaceOutboxExecutionError(
      'The acknowledged operation remains persisted, but its retry lease could not be updated.'
    );
  }
  notifyWorkspaceOutboxChanged(input.entry.workspaceId);
  return queuedResult(retrying, input.optimisticSnapshot, input.rebased);
};

const removeAcknowledgedEntry = async (
  input: ExecuteClaimedEntryInput
): Promise<void> => {
  if (!(await input.store.remove(input.entry.id, input.leaseOwnerId))) {
    throw new WorkspaceOutboxExecutionError(
      'The acknowledged operation could not be removed from the outbox.'
    );
  }
};

const claimReplacement = async (
  store: WorkspaceOutboxStore,
  entry: WorkspaceOutboxEntry,
  leaseOwnerId: string
): Promise<WorkspaceOutboxEntry> => {
  const claimed = await store.claim({
    entryId: entry.id,
    leaseOwnerId,
    now: Date.now(),
    leaseDurationMs: OUTBOX_LEASE_DURATION_MS,
  });
  if (!claimed) {
    throw new WorkspaceOutboxExecutionError(
      'Rebased workspace operation could not acquire its outbox lease.'
    );
  }
  return claimed;
};

const recoverClaimedEntry = async (
  input: ExecuteClaimedEntryInput,
  error: unknown
): Promise<WorkspaceOutboxOperationExecutionResult> => {
  let recovery;
  try {
    recovery = await analyzeWorkspaceRevisionFailure({
      error,
      token: input.token,
      baseSnapshot: input.entry.baseSnapshot,
      localSnapshot: input.optimisticSnapshot,
      sourceOperation: input.entry.operation,
    });
  } catch (recoveryError) {
    return persistFailure(input, recoveryError);
  }
  if (recovery.kind === 'not-conflict') {
    return persistFailure(input, error);
  }
  if (recovery.kind === 'conflict') {
    const blocked = blockWorkspaceOutboxEntry(input.entry, {
      leaseOwnerId: input.leaseOwnerId,
      now: Date.now(),
      session: recovery.session,
    });
    if (!blocked) {
      throw new WorkspaceOutboxExecutionError(
        'Workspace conflict lost its outbox sending lease.'
      );
    }
    await input.store.update(blocked, input.leaseOwnerId);
    notifyWorkspaceOutboxChanged(input.entry.workspaceId);
    return { kind: 'conflict', session: recovery.session };
  }
  if (recovery.status === 'already-applied') {
    try {
      await input.replicaWriter?.({
        workspace: recovery.snapshot,
        acknowledgedEntryId: input.entry.id,
      });
      await removeAcknowledgedEntry(input);
      notifyWorkspaceOutboxChanged(input.entry.workspaceId);
      return {
        kind: 'already-applied',
        operation: input.entry.operation,
        snapshot: recovery.snapshot,
      };
    } catch (persistenceError) {
      return persistAcknowledgementFailure(input, persistenceError);
    }
  }
  if (input.automaticRebaseAttempts >= MAX_AUTOMATIC_REBASE_ATTEMPTS) {
    return persistFailure(
      input,
      new TypeError(
        'The workspace kept changing while the outbox operation was rebased.'
      )
    );
  }
  const rebuilt = createWorkspaceResolutionOperation({
    remoteSnapshot: recovery.remoteSnapshot,
    resolvedSnapshot: recovery.snapshot,
    operationId: createRuntimeId('workspace-outbox-rebase'),
    issuedAt: new Date().toISOString(),
    label: 'Rebase durable workspace operation',
    sourceOperationIds: getWorkspaceOperationSourceIds(input.entry.operation),
  });
  if (rebuilt.ok === false) {
    return persistFailure(
      input,
      new WorkspaceOutboxExecutionError(
        rebuilt.issues[0]?.message ||
          'Could not rebuild the durable workspace operation.'
      )
    );
  }
  if (!rebuilt.operation) {
    try {
      await input.replicaWriter?.({
        workspace: recovery.snapshot,
        acknowledgedEntryId: input.entry.id,
      });
      await removeAcknowledgedEntry(input);
      notifyWorkspaceOutboxChanged(input.entry.workspaceId);
      return {
        kind: 'already-applied',
        operation: input.entry.operation,
        snapshot: recovery.snapshot,
      };
    } catch (persistenceError) {
      return persistAcknowledgementFailure(input, persistenceError);
    }
  }
  const created = createWorkspaceOutboxEntry({
    baseSnapshot: recovery.remoteSnapshot,
    operation: rebuilt.operation,
    now: Date.now(),
  });
  if (created.ok === false) {
    return persistFailure(
      input,
      new WorkspaceOutboxExecutionError(
        created.issues[0]?.message ||
          'Could not enqueue the rebased workspace operation.'
      )
    );
  }
  const replaced = await input.store.replace(
    input.entry.id,
    created.entry,
    input.leaseOwnerId
  );
  if (!replaced) {
    throw new WorkspaceOutboxExecutionError(
      'Workspace outbox changed before the rebased operation was persisted.'
    );
  }
  notifyWorkspaceOutboxChanged(created.entry.workspaceId);
  const claimed = await claimReplacement(
    input.store,
    created.entry,
    input.leaseOwnerId
  );
  return executeClaimedEntry({
    ...input,
    entry: claimed,
    optimisticSnapshot: recovery.snapshot,
    rebased: true,
    automaticRebaseAttempts: input.automaticRebaseAttempts + 1,
  });
};

async function executeClaimedEntry(
  input: ExecuteClaimedEntryInput
): Promise<WorkspaceOutboxOperationExecutionResult> {
  let mutation: DecodedWorkspaceMutation;
  try {
    mutation = await editorApi.commitWorkspaceOperation(
      input.token,
      input.entry.baseSnapshot,
      input.entry.request,
      input.entry.operation
    );
    const operationId = getWorkspaceOperationId(input.entry.operation);
    if (
      !canAcknowledgeWorkspaceOutboxEntry(input.entry, {
        leaseOwnerId: input.leaseOwnerId,
        acceptedOperationId: mutation.acceptedMutationId ?? '',
      }) ||
      mutation.acceptedMutationId !== operationId
    ) {
      throw new WorkspaceOutboxExecutionError(
        'The server acknowledged an unrelated workspace operation.'
      );
    }
  } catch (error) {
    return recoverClaimedEntry(input, error);
  }

  try {
    if (mutation.opSeq > input.entry.baseSnapshot.opSeq + 1) {
      const latest = await editorApi.getWorkspace(
        input.token,
        input.entry.workspaceId,
        { cache: 'no-store' }
      );
      if (latest.workspace.opSeq < mutation.opSeq) {
        throw new WorkspaceOutboxExecutionError(
          'The refreshed workspace predates the outbox acknowledgement.'
        );
      }
      await input.replicaWriter?.({
        workspace: latest.workspace,
        settings: latest.settings,
        settingsOpSeq: latest.workspace.opSeq,
        acknowledgedEntryId: input.entry.id,
      });
      await removeAcknowledgedEntry(input);
      notifyWorkspaceOutboxChanged(input.entry.workspaceId);
      return {
        kind: 'already-applied',
        operation:
          latest.workspace.opSeq === mutation.opSeq
            ? reconcileWorkspaceOperationConfirmation(
                input.entry.operation,
                latest.workspace,
                mutation.updatedDocuments.map(({ id }) => id)
              )
            : null,
        snapshot: latest.workspace,
      };
    }
    await input.replicaWriter?.({
      workspace: applyWorkspaceMutation(input.entry.baseSnapshot, mutation),
      acknowledgedEntryId: input.entry.id,
    });
    await removeAcknowledgedEntry(input);
    notifyWorkspaceOutboxChanged(input.entry.workspaceId);
    return {
      kind: 'acknowledged',
      mutation,
      operation: input.entry.operation,
      optimisticSnapshot: input.optimisticSnapshot,
      rebased: input.rebased,
      serverBaseSnapshot: input.entry.baseSnapshot,
    };
  } catch (error) {
    return persistAcknowledgementFailure(input, error);
  }
}

const persistInitialEntry = async (
  store: WorkspaceOutboxStore,
  entry: WorkspaceOutboxEntry,
  replaceEntryId?: string
): Promise<void> => {
  if (replaceEntryId) {
    const existing = await store.get(replaceEntryId);
    if (existing?.state.kind === 'conflict') {
      const replaced = await store.replace(replaceEntryId, entry);
      if (replaced) return;
    }
  }
  await store.enqueue(entry);
};

/** Persists before sending, then uses only Atomic Commit for every retry. */
export const executeWorkspaceOutboxOperation = async (input: {
  baseSnapshot: WorkspaceSnapshot;
  localSnapshot: WorkspaceSnapshot;
  operation: WorkspaceOperation;
  replaceEntryId?: string;
  replicaWriter?: WorkspaceLocalReplicaWriter;
  store?: WorkspaceOutboxStore;
  token: string;
}): Promise<WorkspaceOutboxOperationExecutionResult> => {
  const store = input.store ?? workspaceOutboxStore;
  const replicaWriter =
    input.replicaWriter ??
    (input.store ? undefined : persistAcknowledgedWorkspaceLocalReplica);
  const created = createWorkspaceOutboxEntry({
    baseSnapshot: input.baseSnapshot,
    operation: input.operation,
    now: Date.now(),
  });
  if (created.ok === false) {
    throw new WorkspaceOutboxExecutionError(
      created.issues[0]?.message || 'Could not create workspace outbox entry.'
    );
  }
  await persistInitialEntry(store, created.entry, input.replaceEntryId);
  notifyWorkspaceOutboxChanged(created.entry.workspaceId);
  const leaseOwnerId = createRuntimeId('workspace-outbox-owner');
  const claimed = await store.claim({
    entryId: created.entry.id,
    leaseOwnerId,
    now: Date.now(),
    leaseDurationMs: OUTBOX_LEASE_DURATION_MS,
  });
  if (!claimed) {
    const persisted = (await store.get(created.entry.id)) ?? created.entry;
    return queuedResult(persisted, input.localSnapshot, false);
  }
  return executeClaimedEntry({
    automaticRebaseAttempts: 0,
    entry: claimed,
    leaseOwnerId,
    optimisticSnapshot: input.localSnapshot,
    rebased: false,
    store,
    token: input.token,
    replicaWriter,
  });
};

export const resumeWorkspaceOutbox = async (input: {
  maxEntries?: number;
  replicaWriter?: WorkspaceLocalReplicaWriter;
  store?: WorkspaceOutboxStore;
  token: string;
  workspaceId: string;
}): Promise<readonly WorkspaceOutboxOperationExecutionResult[]> => {
  const store = input.store ?? workspaceOutboxStore;
  const replicaWriter =
    input.replicaWriter ??
    (input.store ? undefined : persistAcknowledgedWorkspaceLocalReplica);
  const results: WorkspaceOutboxOperationExecutionResult[] = [];
  const maximum = Math.max(1, Math.min(100, input.maxEntries ?? 32));
  for (let index = 0; index < maximum; index += 1) {
    const leaseOwnerId = createRuntimeId('workspace-outbox-resume');
    const entry = await store.claimNext({
      workspaceId: input.workspaceId,
      leaseOwnerId,
      now: Date.now(),
      leaseDurationMs: OUTBOX_LEASE_DURATION_MS,
    });
    if (!entry) break;
    const optimisticSnapshot = applyPersistentWorkspaceOperation(
      entry.baseSnapshot,
      entry.operation
    );
    if (!optimisticSnapshot) {
      const failure: WorkspaceOutboxFailure = {
        code: 'OUTBOX_OPERATION_INVALID',
        message: 'Persisted workspace operation no longer applies to its base.',
        retryable: false,
      };
      const failed = failWorkspaceOutboxEntry(entry, {
        leaseOwnerId,
        now: Date.now(),
        failure,
      });
      if (failed) await store.update(failed, leaseOwnerId);
      break;
    }
    const result = await executeClaimedEntry({
      automaticRebaseAttempts: 0,
      entry,
      leaseOwnerId,
      optimisticSnapshot,
      rebased: false,
      store,
      token: input.token,
      replicaWriter,
    });
    results.push(result);
    if (result.kind === 'queued' || result.kind === 'conflict') break;
  }
  return results;
};

export const listWorkspaceOutboxEntries = (
  workspaceId: string,
  store: WorkspaceOutboxStore = workspaceOutboxStore
) => store.list(workspaceId);
