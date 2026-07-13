import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import {
  applyWorkspaceMutation,
  type DecodedWorkspaceMutation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  canAcknowledgeWorkspaceOutboxEntry,
  createWorkspaceSettingsOutboxEntry,
  failWorkspaceOutboxEntry,
  mergeWorkspaceSettings,
  retryWorkspaceOutboxEntry,
  workspaceSettingsEqual,
  type WorkspaceOutboxFailure,
  type WorkspaceOutboxStore,
  type WorkspaceSettingsOutboxEntry,
} from '@prodivix/workspace-sync';
import { workspaceSettingsOutboxStore } from './indexedDbWorkspaceSettingsOutboxStore';
import { createWorkspaceClientOperationId } from './workspaceOperationIdentity';
import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';
import {
  persistAcknowledgedWorkspaceLocalReplica,
  type WorkspaceLocalReplicaWriter,
} from './workspaceLocalReplica';

const LEASE_DURATION_MS = 60_000;
const MAX_REBASE_ATTEMPTS = 2;

export type WorkspaceSettingsOutboxExecutionResult =
  | Readonly<{
      kind: 'acknowledged';
      baseSettings: Readonly<Record<string, unknown>>;
      mutation: DecodedWorkspaceMutation;
      settings: Readonly<Record<string, unknown>>;
      submittedSettings: Readonly<Record<string, unknown>>;
    }>
  | Readonly<{
      kind: 'queued';
      entry: WorkspaceSettingsOutboxEntry;
    }>
  | Readonly<{
      kind: 'already-applied';
      baseSnapshot: WorkspaceSnapshot;
      baseSettings: Readonly<Record<string, unknown>>;
      settings: Readonly<Record<string, unknown>>;
      snapshot: WorkspaceSnapshot;
      submittedSettings: Readonly<Record<string, unknown>>;
    }>;

type ExecuteClaimedInput = {
  automaticRebaseAttempts: number;
  entry: WorkspaceSettingsOutboxEntry;
  leaseOwnerId: string;
  store: WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>;
  token: string;
  replicaWriter?: WorkspaceLocalReplicaWriter;
};

const toFailure = (error: unknown): WorkspaceOutboxFailure => {
  if (error instanceof ApiError) {
    return {
      code: error.code || `HTTP_${error.status}`,
      message: error.message || 'Workspace settings commit failed.',
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
      message: error.message || 'Workspace settings commit failed.',
      retryable: error.name === 'TypeError',
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Workspace settings commit failed.',
    retryable: false,
  };
};

const persistFailure = async (
  input: ExecuteClaimedInput,
  error: unknown
): Promise<WorkspaceSettingsOutboxExecutionResult> => {
  const failure = toFailure(error);
  const next = failure.retryable
    ? retryWorkspaceOutboxEntry(input.entry, {
        leaseOwnerId: input.leaseOwnerId,
        now: Date.now(),
        failure,
        entropy: Math.random(),
      })
    : failWorkspaceOutboxEntry(input.entry, {
        leaseOwnerId: input.leaseOwnerId,
        now: Date.now(),
        failure,
      });
  if (!next || !(await input.store.update(next, input.leaseOwnerId))) {
    throw error;
  }
  notifyWorkspaceOutboxChanged(input.entry.workspaceId);
  return { kind: 'queued', entry: next };
};

const persistAcknowledgementFailure = async (
  input: ExecuteClaimedInput,
  error: unknown
): Promise<WorkspaceSettingsOutboxExecutionResult> => {
  const retrying = retryWorkspaceOutboxEntry(input.entry, {
    leaseOwnerId: input.leaseOwnerId,
    now: Date.now(),
    failure: {
      code: 'LOCAL_ACK_PERSISTENCE_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'The acknowledged settings could not be persisted locally.',
      retryable: true,
    },
    entropy: Math.random(),
  });
  if (!retrying || !(await input.store.update(retrying, input.leaseOwnerId))) {
    throw new Error(
      'The acknowledged settings remain persisted, but their retry lease could not be updated.'
    );
  }
  notifyWorkspaceOutboxChanged(input.entry.workspaceId);
  return { kind: 'queued', entry: retrying };
};

const removeAcknowledgedEntry = async (
  input: ExecuteClaimedInput
): Promise<void> => {
  if (!(await input.store.remove(input.entry.id, input.leaseOwnerId))) {
    throw new Error(
      'The acknowledged settings could not be removed from the outbox.'
    );
  }
};

const claimReplacement = async (
  store: WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>,
  entry: WorkspaceSettingsOutboxEntry,
  leaseOwnerId: string
): Promise<WorkspaceSettingsOutboxEntry> => {
  const claimed = await store.claim({
    entryId: entry.id,
    leaseOwnerId,
    now: Date.now(),
    leaseDurationMs: LEASE_DURATION_MS,
  });
  if (!claimed) throw new Error('Could not claim rebased settings commit.');
  return claimed;
};

const recoverRevision = async (
  input: ExecuteClaimedInput
): Promise<WorkspaceSettingsOutboxExecutionResult> => {
  if (input.automaticRebaseAttempts >= MAX_REBASE_ATTEMPTS) {
    return persistFailure(
      input,
      new TypeError('The workspace kept changing while settings were rebased.')
    );
  }
  let latest;
  try {
    latest = await editorApi.getWorkspace(
      input.token,
      input.entry.workspaceId,
      { cache: 'no-store' }
    );
  } catch (latestError) {
    return persistFailure(input, latestError);
  }
  const mergedSettings = mergeWorkspaceSettings(
    input.entry.baseSettings,
    input.entry.request.settings,
    latest.settings
  );
  if (workspaceSettingsEqual(mergedSettings, latest.settings)) {
    try {
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
        baseSnapshot: input.entry.baseSnapshot,
        baseSettings: input.entry.baseSettings,
        submittedSettings: input.entry.request.settings,
        snapshot: latest.workspace,
        settings: latest.settings,
      };
    } catch (persistenceError) {
      return persistAcknowledgementFailure(input, persistenceError);
    }
  }
  const created = createWorkspaceSettingsOutboxEntry({
    baseSnapshot: latest.workspace,
    baseSettings: latest.settings,
    settings: mergedSettings,
    commitId: createWorkspaceClientOperationId('settings-rebase'),
    issuedAt: new Date().toISOString(),
    now: input.entry.createdAt,
  });
  if (created.ok === false) throw new Error(created.message);
  const replacement = {
    ...created.entry,
    attemptCount: input.entry.attemptCount,
    updatedAt: Date.now(),
  };
  const replaced = await input.store.replace(
    input.entry.id,
    replacement,
    input.leaseOwnerId
  );
  if (!replaced) throw new Error('Settings outbox changed during rebase.');
  notifyWorkspaceOutboxChanged(input.entry.workspaceId);
  return executeClaimed({
    ...input,
    entry: await claimReplacement(input.store, replacement, input.leaseOwnerId),
    automaticRebaseAttempts: input.automaticRebaseAttempts + 1,
  });
};

async function executeClaimed(
  input: ExecuteClaimedInput
): Promise<WorkspaceSettingsOutboxExecutionResult> {
  let mutation: DecodedWorkspaceMutation;
  try {
    mutation = await editorApi.commitWorkspaceSettings(
      input.token,
      input.entry.baseSnapshot,
      input.entry.request
    );
    if (
      !canAcknowledgeWorkspaceOutboxEntry(input.entry, {
        leaseOwnerId: input.leaseOwnerId,
        acceptedOperationId: mutation.acceptedMutationId ?? '',
      })
    ) {
      throw new Error('The server acknowledged an unrelated settings commit.');
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return recoverRevision(input);
    }
    return persistFailure(input, error);
  }

  try {
    if (mutation.opSeq > input.entry.baseSnapshot.opSeq + 1) {
      const latest = await editorApi.getWorkspace(
        input.token,
        input.entry.workspaceId,
        { cache: 'no-store' }
      );
      if (latest.workspace.opSeq < mutation.opSeq) {
        throw new Error(
          'The refreshed workspace predates the settings acknowledgement.'
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
        baseSnapshot: input.entry.baseSnapshot,
        baseSettings: input.entry.baseSettings,
        submittedSettings: input.entry.request.settings,
        snapshot: latest.workspace,
        settings: latest.settings,
      };
    }
    const settings = mutation.settings ?? input.entry.request.settings;
    await input.replicaWriter?.({
      workspace: applyWorkspaceMutation(input.entry.baseSnapshot, mutation),
      settings,
      settingsOpSeq: mutation.opSeq,
      acknowledgedEntryId: input.entry.id,
    });
    await removeAcknowledgedEntry(input);
    notifyWorkspaceOutboxChanged(input.entry.workspaceId);
    return {
      kind: 'acknowledged',
      baseSettings: input.entry.baseSettings,
      submittedSettings: input.entry.request.settings,
      mutation,
      settings,
    };
  } catch (error) {
    return persistAcknowledgementFailure(input, error);
  }
}

export const executeWorkspaceSettingsOutboxCommit = async (input: {
  baseSettings: Readonly<Record<string, unknown>>;
  baseSnapshot: WorkspaceSnapshot;
  commitId: string;
  settings: Readonly<Record<string, unknown>>;
  replicaWriter?: WorkspaceLocalReplicaWriter;
  store?: WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>;
  token: string;
}): Promise<WorkspaceSettingsOutboxExecutionResult> => {
  const store = input.store ?? workspaceSettingsOutboxStore;
  const replicaWriter =
    input.replicaWriter ??
    (input.store ? undefined : persistAcknowledgedWorkspaceLocalReplica);
  const created = createWorkspaceSettingsOutboxEntry({
    baseSnapshot: input.baseSnapshot,
    baseSettings: input.baseSettings,
    settings: input.settings,
    commitId: input.commitId,
    issuedAt: new Date().toISOString(),
    now: Date.now(),
  });
  if (created.ok === false) throw new Error(created.message);
  await store.enqueue(created.entry);
  notifyWorkspaceOutboxChanged(created.entry.workspaceId);
  const leaseOwnerId = createWorkspaceClientOperationId('settings-owner');
  const claimed = await store.claim({
    entryId: created.entry.id,
    leaseOwnerId,
    now: Date.now(),
    leaseDurationMs: LEASE_DURATION_MS,
  });
  if (!claimed) {
    return {
      kind: 'queued',
      entry: (await store.get(created.entry.id)) ?? created.entry,
    };
  }
  return executeClaimed({
    automaticRebaseAttempts: 0,
    entry: claimed,
    leaseOwnerId,
    store,
    token: input.token,
    replicaWriter,
  });
};

export const resumeWorkspaceSettingsOutbox = async (input: {
  maxEntries?: number;
  replicaWriter?: WorkspaceLocalReplicaWriter;
  store?: WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry>;
  token: string;
  workspaceId: string;
}): Promise<readonly WorkspaceSettingsOutboxExecutionResult[]> => {
  const store = input.store ?? workspaceSettingsOutboxStore;
  const replicaWriter =
    input.replicaWriter ??
    (input.store ? undefined : persistAcknowledgedWorkspaceLocalReplica);
  const results: WorkspaceSettingsOutboxExecutionResult[] = [];
  const maximum = Math.max(1, Math.min(32, input.maxEntries ?? 16));
  for (let index = 0; index < maximum; index += 1) {
    const leaseOwnerId = createWorkspaceClientOperationId('settings-resume');
    const entry = await store.claimNext({
      workspaceId: input.workspaceId,
      leaseOwnerId,
      now: Date.now(),
      leaseDurationMs: LEASE_DURATION_MS,
    });
    if (!entry) break;
    const result = await executeClaimed({
      automaticRebaseAttempts: 0,
      entry,
      leaseOwnerId,
      store,
      token: input.token,
      replicaWriter,
    });
    results.push(result);
    if (result.kind === 'queued') break;
  }
  return results;
};

export const listWorkspaceSettingsOutboxEntries = (
  workspaceId: string,
  store: WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry> = workspaceSettingsOutboxStore
) => store.list(workspaceId);

export const applyAcknowledgedSettingsMutation = (
  snapshot: WorkspaceSnapshot,
  mutation: DecodedWorkspaceMutation
): WorkspaceSnapshot => applyWorkspaceMutation(snapshot, mutation);
