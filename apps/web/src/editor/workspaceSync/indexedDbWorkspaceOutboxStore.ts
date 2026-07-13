import { getWorkspaceOperationId } from '@prodivix/workspace';
import {
  WORKSPACE_OUTBOX_FORMAT_VERSION,
  type WorkspaceOutboxEntry,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import {
  createIndexedDbCausalOutboxStore,
  WORKSPACE_OPERATION_OUTBOX_STORE,
} from './indexedDbCausalOutboxStore';

type IndexedDbWorkspaceOutboxStoreOptions = Readonly<{
  databaseName?: string;
  indexedDb?: IDBFactory;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const decodeStoredWorkspaceOutboxEntry = (
  value: unknown
): WorkspaceOutboxEntry | null => {
  if (!isRecord(value)) return null;
  const entry = value as WorkspaceOutboxEntry;
  if (
    entry.formatVersion !== WORKSPACE_OUTBOX_FORMAT_VERSION ||
    entry.entryKind !== 'operation' ||
    typeof entry.id !== 'string' ||
    !entry.id ||
    typeof entry.workspaceId !== 'string' ||
    !entry.workspaceId ||
    typeof entry.causalOrderId !== 'string' ||
    !entry.causalOrderId ||
    entry.baseSnapshot?.id !== entry.workspaceId ||
    getWorkspaceOperationId(entry.operation) !== entry.id ||
    getWorkspaceOperationId(entry.request?.operation) !== entry.id ||
    !Number.isFinite(entry.createdAt) ||
    !Number.isFinite(entry.updatedAt) ||
    !Number.isSafeInteger(entry.attemptCount) ||
    entry.attemptCount < 0 ||
    !isRecord(entry.state) ||
    !['queued', 'sending', 'retry-wait', 'conflict', 'failed'].includes(
      String(entry.state.kind)
    )
  ) {
    return null;
  }
  return entry;
};

export const createIndexedDbWorkspaceOutboxStore = (
  options: IndexedDbWorkspaceOutboxStoreOptions = {}
): WorkspaceOutboxStore =>
  createIndexedDbCausalOutboxStore({
    storeName: WORKSPACE_OPERATION_OUTBOX_STORE,
    decode: decodeStoredWorkspaceOutboxEntry,
    ...(options.databaseName ? { databaseName: options.databaseName } : {}),
    ...(options.indexedDb ? { indexedDb: options.indexedDb } : {}),
  });

export const workspaceOutboxStore = createIndexedDbWorkspaceOutboxStore();
