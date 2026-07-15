import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  compareWorkspaceOutboxEntries,
  type WorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import {
  getLocalProject,
  saveLocalWorkspaceSnapshot,
  type LocalProjectRecord,
} from '@/editor/localProjectStore';
import { workspaceOutboxStore } from './indexedDbWorkspaceOutboxStore';
import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';

const localCommitChains = new Map<string, Promise<LocalProjectRecord | null>>();

const authoringSnapshotJson = (snapshot: WorkspaceSnapshot): string => {
  const authoring = { ...snapshot };
  delete authoring.activeDocumentId;
  delete authoring.activeRouteNodeId;
  return JSON.stringify(authoring);
};

const sameAuthoringSnapshot = (
  left: WorkspaceSnapshot,
  right: WorkspaceSnapshot
): boolean => authoringSnapshotJson(left) === authoringSnapshotJson(right);

const applyOperation = (
  snapshot: WorkspaceSnapshot,
  operation: WorkspaceOperation
): WorkspaceSnapshot => {
  const result =
    operation.kind === 'command'
      ? applyWorkspaceCommand(snapshot, operation.command)
      : applyWorkspaceTransaction(snapshot, operation.transaction);
  if (result.ok === false) {
    throw new Error(
      result.issues[0]?.message ||
        'A pending local Workspace operation could not be replayed.'
    );
  }
  return result.snapshot;
};

export type LocalProjectWorkspaceOutboxMaterialization = Readonly<{
  snapshot: WorkspaceSnapshot;
  persistedPrefix: number;
}>;

/** Resolves any durably saved operation prefix to the same final snapshot. */
export const materializeLocalProjectWorkspaceOperationChain = (
  persistedSnapshot: WorkspaceSnapshot,
  entries: readonly WorkspaceOutboxEntry[]
): LocalProjectWorkspaceOutboxMaterialization => {
  if (entries.length === 0) {
    return { snapshot: persistedSnapshot, persistedPrefix: 0 };
  }
  const snapshots: WorkspaceSnapshot[] = [entries[0]!.baseSnapshot];
  for (const entry of entries) {
    const current = snapshots.at(-1)!;
    if (!sameAuthoringSnapshot(current, entry.baseSnapshot)) {
      throw new Error(
        `Local Workspace operation ${entry.id} does not continue the durable causal chain.`
      );
    }
    snapshots.push(applyOperation(current, entry.operation));
  }

  let persistedPrefix = -1;
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (sameAuthoringSnapshot(persistedSnapshot, snapshots[index]!)) {
      persistedPrefix = index;
      break;
    }
  }
  if (persistedPrefix < 0) {
    throw new Error(
      'The local canonical Workspace diverged from its durable operation chain.'
    );
  }
  return {
    snapshot: snapshots.at(-1)!,
    persistedPrefix,
  };
};

const materializeLocalProjectOutbox = async (
  project: LocalProjectRecord
): Promise<LocalProjectRecord> => {
  const entries = [...(await workspaceOutboxStore.list(project.id))].sort(
    compareWorkspaceOutboxEntries
  );
  if (entries.length === 0) return project;
  const blocked = entries.find(
    (entry) => entry.state.kind === 'conflict' || entry.state.kind === 'failed'
  );
  if (blocked) {
    throw new Error(
      `Local Workspace operation ${blocked.id} requires recovery before the project can open.`
    );
  }

  const materialized = materializeLocalProjectWorkspaceOperationChain(
    project.workspace,
    entries
  );
  const committed =
    materialized.persistedPrefix === entries.length
      ? project
      : await saveLocalWorkspaceSnapshot(
          project.id,
          materialized.snapshot,
          project.workspaceSettings
        );
  if (!committed) {
    throw new Error('The local canonical Workspace is unavailable.');
  }
  for (const entry of entries) await workspaceOutboxStore.remove(entry.id);
  notifyWorkspaceOutboxChanged(project.id);
  return committed;
};

const serializeLocalCommit = (
  workspaceId: string,
  task: () => Promise<LocalProjectRecord | null>
): Promise<LocalProjectRecord | null> => {
  const previous = localCommitChains.get(workspaceId) ?? Promise.resolve(null);
  const next = previous.then(task, task);
  localCommitChains.set(workspaceId, next);
  const cleanup = () => {
    if (localCommitChains.get(workspaceId) === next) {
      localCommitChains.delete(workspaceId);
    }
  };
  void next.then(cleanup, cleanup);
  return next;
};

/** Replays durable local Operations into the canonical local project record. */
export const resumeLocalProjectWorkspaceOutbox = (
  project: LocalProjectRecord
): Promise<LocalProjectRecord | null> =>
  serializeLocalCommit(project.id, () =>
    materializeLocalProjectOutbox(project)
  );

/** Commits every accepted local Operation currently waiting in causal order. */
export const commitLocalProjectWorkspaceOutbox = (
  workspaceId: string
): Promise<LocalProjectRecord | null> =>
  serializeLocalCommit(workspaceId, async () => {
    const project = await getLocalProject(workspaceId);
    return project ? materializeLocalProjectOutbox(project) : null;
  });
