import {
  WORKSPACE_OUTBOX_FORMAT_VERSION,
  type WorkspaceOutboxStore,
  type WorkspaceSettingsOutboxEntry,
} from '@prodivix/workspace-sync';
import {
  createIndexedDbCausalOutboxStore,
  WORKSPACE_SETTINGS_OUTBOX_STORE,
} from './indexedDbCausalOutboxStore';

type IndexedDbWorkspaceSettingsOutboxStoreOptions = Readonly<{
  databaseName?: string;
  indexedDb?: IDBFactory;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const decodeStoredWorkspaceSettingsOutboxEntry = (
  value: unknown
): WorkspaceSettingsOutboxEntry | null => {
  if (!isRecord(value)) return null;
  const entry = value as WorkspaceSettingsOutboxEntry;
  if (
    entry.formatVersion !== WORKSPACE_OUTBOX_FORMAT_VERSION ||
    entry.entryKind !== 'settings' ||
    typeof entry.id !== 'string' ||
    !entry.id ||
    typeof entry.workspaceId !== 'string' ||
    !entry.workspaceId ||
    typeof entry.causalOrderId !== 'string' ||
    !entry.causalOrderId ||
    entry.baseSnapshot?.id !== entry.workspaceId ||
    entry.request?.commitId !== entry.id ||
    entry.request?.expectedWorkspaceRev !== entry.baseSnapshot.workspaceRev ||
    !isRecord(entry.baseSettings) ||
    !isRecord(entry.request?.settings) ||
    !Number.isFinite(entry.createdAt) ||
    !Number.isFinite(entry.updatedAt) ||
    !Number.isSafeInteger(entry.attemptCount) ||
    entry.attemptCount < 0 ||
    !isRecord(entry.state) ||
    !['queued', 'sending', 'retry-wait', 'failed'].includes(
      String(entry.state.kind)
    )
  ) {
    return null;
  }
  return entry;
};

export const createIndexedDbWorkspaceSettingsOutboxStore = (
  options: IndexedDbWorkspaceSettingsOutboxStoreOptions = {}
): WorkspaceOutboxStore<WorkspaceSettingsOutboxEntry> =>
  createIndexedDbCausalOutboxStore({
    storeName: WORKSPACE_SETTINGS_OUTBOX_STORE,
    decode: decodeStoredWorkspaceSettingsOutboxEntry,
    ...(options.databaseName ? { databaseName: options.databaseName } : {}),
    ...(options.indexedDb ? { indexedDb: options.indexedDb } : {}),
  });

export const workspaceSettingsOutboxStore =
  createIndexedDbWorkspaceSettingsOutboxStore();
