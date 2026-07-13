import type { ProjectSummary } from '@/editor/editorApi';
import {
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
  type WorkspaceSnapshotWireDto,
} from '@prodivix/workspace';
import {
  WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION,
  advanceWorkspaceLocalReplica,
  createWorkspaceLocalReplica,
  type WorkspaceLocalReplica,
  type WorkspaceOutboxEntry,
  type WorkspaceSettingsOutboxEntry,
} from '@prodivix/workspace-sync';
import {
  WORKSPACE_LOCAL_REPLICA_STORE,
  WORKSPACE_OPERATION_OUTBOX_STORE,
  WORKSPACE_SETTINGS_OUTBOX_STORE,
  openWorkspacePersistenceDatabase,
  type WorkspacePersistenceDatabaseOptions,
} from './indexedDbCausalOutboxStore';
import { decodeStoredWorkspaceOutboxEntry } from './indexedDbWorkspaceOutboxStore';
import { decodeStoredWorkspaceSettingsOutboxEntry } from './indexedDbWorkspaceSettingsOutboxStore';

export type WorkspaceLocalReplicaEnvelope = Readonly<{
  replica: WorkspaceLocalReplica;
  project: ProjectSummary;
  capabilities: Readonly<Record<string, boolean>>;
}>;

export type WorkspaceLocalReplicaPersistenceState = Readonly<{
  envelope: WorkspaceLocalReplicaEnvelope;
  operationEntries: readonly WorkspaceOutboxEntry[];
  settingsEntries: readonly WorkspaceSettingsOutboxEntry[];
}>;

type PersistedWorkspaceLocalReplica = Readonly<{
  id: string;
  formatVersion: typeof WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION;
  workspace: WorkspaceSnapshotWireDto;
  settingsOpSeq: number;
  savedAt: number;
  acknowledgedEntryIds: readonly string[];
  project: ProjectSummary;
  capabilities: Readonly<Record<string, boolean>>;
}>;

export class WorkspaceLocalReplicaRecordError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'WorkspaceLocalReplicaRecordError';
    this.path = path;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requireRecord = (
  value: unknown,
  path: string
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new WorkspaceLocalReplicaRecordError(path, 'Expected an object.');
  }
  return value;
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new WorkspaceLocalReplicaRecordError(
      path,
      'Expected a canonical non-empty string.'
    );
  }
  return value;
};

const decodeProject = (value: unknown, workspaceId: string): ProjectSummary => {
  const source = requireRecord(value, '/project');
  const id = requireString(source.id, '/project/id');
  if (id !== workspaceId) {
    throw new WorkspaceLocalReplicaRecordError(
      '/project/id',
      'Project id must match the replica workspace.'
    );
  }
  if (
    source.resourceType !== 'project' &&
    source.resourceType !== 'component' &&
    source.resourceType !== 'nodegraph'
  ) {
    throw new WorkspaceLocalReplicaRecordError(
      '/project/resourceType',
      'Unsupported project resource type.'
    );
  }
  if (typeof source.isPublic !== 'boolean') {
    throw new WorkspaceLocalReplicaRecordError(
      '/project/isPublic',
      'Expected a boolean.'
    );
  }
  if (
    !Number.isSafeInteger(source.starsCount) ||
    Number(source.starsCount) < 0
  ) {
    throw new WorkspaceLocalReplicaRecordError(
      '/project/starsCount',
      'Expected a non-negative safe integer.'
    );
  }
  const createdAt = requireString(source.createdAt, '/project/createdAt');
  const updatedAt = requireString(source.updatedAt, '/project/updatedAt');
  if (
    Number.isNaN(Date.parse(createdAt)) ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    throw new WorkspaceLocalReplicaRecordError(
      '/project',
      'Project timestamps must be valid dates.'
    );
  }
  const description =
    source.description === undefined
      ? undefined
      : requireString(source.description, '/project/description');
  return {
    id,
    resourceType: source.resourceType,
    name: requireString(source.name, '/project/name'),
    ...(description ? { description } : {}),
    isPublic: source.isPublic,
    starsCount: Number(source.starsCount),
    createdAt,
    updatedAt,
  };
};

const decodeCapabilities = (
  value: unknown
): Readonly<Record<string, boolean>> => {
  const source = requireRecord(value, '/capabilities');
  const capabilities: Record<string, boolean> = {};
  Object.entries(source).forEach(([key, enabled]) => {
    const capability = requireString(key, '/capabilities');
    if (typeof enabled !== 'boolean') {
      throw new WorkspaceLocalReplicaRecordError(
        `/capabilities/${capability}`,
        'Expected a boolean.'
      );
    }
    capabilities[capability] = enabled;
  });
  return capabilities;
};

const decodePersistedReplica = (
  value: unknown
): WorkspaceLocalReplicaEnvelope => {
  const source = requireRecord(value, '/replica');
  if (source.formatVersion !== WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION) {
    throw new WorkspaceLocalReplicaRecordError(
      '/replica/formatVersion',
      'Unsupported local replica format.'
    );
  }
  const id = requireString(source.id, '/replica/id');
  const decoded = decodeWorkspaceSnapshot(source.workspace);
  if (decoded.workspace.id !== id) {
    throw new WorkspaceLocalReplicaRecordError(
      '/replica/workspace/id',
      'Workspace id must match the replica key.'
    );
  }
  if (!Array.isArray(source.acknowledgedEntryIds)) {
    throw new WorkspaceLocalReplicaRecordError(
      '/replica/acknowledgedEntryIds',
      'Expected an array.'
    );
  }
  const created = createWorkspaceLocalReplica({
    snapshot: decoded.workspace,
    settings: decoded.settings,
    settingsOpSeq: Number(source.settingsOpSeq),
    savedAt: Number(source.savedAt),
    acknowledgedEntryIds: source.acknowledgedEntryIds as string[],
  });
  if (created.ok === false) {
    throw new WorkspaceLocalReplicaRecordError(
      created.issues[0]?.path ?? '/replica',
      created.issues[0]?.message ?? 'Invalid local replica.'
    );
  }
  return {
    replica: created.replica,
    project: decodeProject(source.project, id),
    capabilities: decodeCapabilities(source.capabilities),
  };
};

const serializeReplica = (
  envelope: WorkspaceLocalReplicaEnvelope
): PersistedWorkspaceLocalReplica => ({
  id: envelope.replica.workspaceId,
  formatVersion: WORKSPACE_LOCAL_REPLICA_FORMAT_VERSION,
  workspace: encodeWorkspaceSnapshot(
    envelope.replica.confirmedSnapshot,
    envelope.replica.settings as Record<string, unknown>
  ),
  settingsOpSeq: envelope.replica.settingsOpSeq,
  savedAt: envelope.replica.savedAt,
  acknowledgedEntryIds: envelope.replica.acknowledgedEntryIds,
  project: envelope.project,
  capabilities: envelope.capabilities,
});

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed.'));
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => undefined;
  });

export const getWorkspaceLocalReplica = async (
  workspaceId: string,
  options: WorkspacePersistenceDatabaseOptions = {}
): Promise<WorkspaceLocalReplicaEnvelope | null> => {
  const database = await openWorkspacePersistenceDatabase(options);
  try {
    const transaction = database.transaction(
      WORKSPACE_LOCAL_REPLICA_STORE,
      'readonly'
    );
    const completed = transactionComplete(transaction);
    const value = await requestResult(
      transaction.objectStore(WORKSPACE_LOCAL_REPLICA_STORE).get(workspaceId)
    );
    await completed;
    return value === undefined ? null : decodePersistedReplica(value);
  } finally {
    database.close();
  }
};

/** Reads the replica and both queues from one IndexedDB snapshot. */
export const readWorkspaceLocalReplicaPersistenceState = async (
  workspaceId: string,
  options: WorkspacePersistenceDatabaseOptions = {}
): Promise<WorkspaceLocalReplicaPersistenceState | null> => {
  const database = await openWorkspacePersistenceDatabase(options);
  try {
    const transaction = database.transaction(
      [
        WORKSPACE_LOCAL_REPLICA_STORE,
        WORKSPACE_OPERATION_OUTBOX_STORE,
        WORKSPACE_SETTINGS_OUTBOX_STORE,
      ],
      'readonly'
    );
    const completed = transactionComplete(transaction);
    const [replicaValue, operationValues, settingsValues] = await Promise.all([
      requestResult(
        transaction.objectStore(WORKSPACE_LOCAL_REPLICA_STORE).get(workspaceId)
      ),
      requestResult(
        transaction.objectStore(WORKSPACE_OPERATION_OUTBOX_STORE).getAll()
      ),
      requestResult(
        transaction.objectStore(WORKSPACE_SETTINGS_OUTBOX_STORE).getAll()
      ),
    ]);
    await completed;
    if (replicaValue === undefined) return null;
    return {
      envelope: decodePersistedReplica(replicaValue),
      operationEntries: operationValues
        .map(decodeStoredWorkspaceOutboxEntry)
        .filter(
          (entry): entry is WorkspaceOutboxEntry =>
            entry?.workspaceId === workspaceId
        ),
      settingsEntries: settingsValues
        .map(decodeStoredWorkspaceSettingsOutboxEntry)
        .filter(
          (entry): entry is WorkspaceSettingsOutboxEntry =>
            entry?.workspaceId === workspaceId
        ),
    };
  } finally {
    database.close();
  }
};

const abortTransaction = async (
  transaction: IDBTransaction,
  completed: Promise<void>
): Promise<void> => {
  try {
    transaction.abort();
  } catch {
    // The transaction may already have completed or aborted.
  }
  await completed.catch(() => undefined);
};

export const saveWorkspaceLocalReplica = async (input: {
  workspace: WorkspaceSnapshot;
  settings?: Readonly<Record<string, unknown>>;
  settingsOpSeq?: number;
  project?: ProjectSummary;
  capabilities?: Readonly<Record<string, boolean>>;
  acknowledgedEntryIds?: readonly string[];
  savedAt?: number;
  options?: WorkspacePersistenceDatabaseOptions;
}): Promise<WorkspaceLocalReplicaEnvelope> => {
  const inputProject = input.project
    ? decodeProject(input.project, input.workspace.id)
    : undefined;
  const inputCapabilities = input.capabilities
    ? decodeCapabilities(input.capabilities)
    : undefined;
  const database = await openWorkspacePersistenceDatabase(input.options);
  const transaction = database.transaction(
    WORKSPACE_LOCAL_REPLICA_STORE,
    'readwrite'
  );
  const completed = transactionComplete(transaction);
  try {
    const store = transaction.objectStore(WORKSPACE_LOCAL_REPLICA_STORE);
    const value = await requestResult(store.get(input.workspace.id));
    let existing: WorkspaceLocalReplicaEnvelope | null = null;
    if (value !== undefined) {
      try {
        existing = decodePersistedReplica(value);
      } catch (error) {
        if (!inputProject || input.settings === undefined) {
          throw error;
        }
      }
    }
    const savedAt = input.savedAt ?? Date.now();
    const nextReplica = existing
      ? advanceWorkspaceLocalReplica(existing.replica, {
          snapshot: input.workspace,
          ...(input.settings !== undefined ? { settings: input.settings } : {}),
          ...(input.settingsOpSeq !== undefined
            ? { settingsOpSeq: input.settingsOpSeq }
            : {}),
          savedAt,
          acknowledgedEntryIds: input.acknowledgedEntryIds,
        })
      : input.settings === undefined
        ? {
            ok: false as const,
            issues: [
              {
                code: 'WKS_SYNC_REPLICA_INVALID' as const,
                path: '/settings',
                message: 'A new local replica requires workspace settings.',
              },
            ],
          }
        : createWorkspaceLocalReplica({
            snapshot: input.workspace,
            settings: input.settings,
            settingsOpSeq: input.settingsOpSeq,
            savedAt,
            acknowledgedEntryIds: input.acknowledgedEntryIds,
          });
    if (nextReplica.ok === false) {
      throw new WorkspaceLocalReplicaRecordError(
        nextReplica.issues[0]?.path ?? '/replica',
        nextReplica.issues[0]?.message ?? 'Could not save local replica.'
      );
    }
    const project = inputProject ?? existing?.project;
    if (!project) {
      throw new WorkspaceLocalReplicaRecordError(
        '/project',
        'A new local replica requires project metadata.'
      );
    }
    const envelope: WorkspaceLocalReplicaEnvelope = {
      replica: nextReplica.replica,
      project,
      capabilities: inputCapabilities ?? existing?.capabilities ?? {},
    };
    store.put(serializeReplica(envelope));
    await completed;
    return envelope;
  } catch (error) {
    await abortTransaction(transaction, completed);
    throw error;
  } finally {
    database.close();
  }
};
