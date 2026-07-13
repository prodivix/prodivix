import {
  claimWorkspaceOutboxEntry,
  compareWorkspaceOutboxEntries,
  inheritWorkspaceOutboxCausalOrder,
  selectWorkspaceOutboxClaimCandidate,
  type WorkspaceOutboxRecord,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';

export const WORKSPACE_PERSISTENCE_DATABASE_NAME =
  'prodivix-workspace-outbox-v3';
export const WORKSPACE_PERSISTENCE_DATABASE_VERSION = 3;
export const WORKSPACE_OPERATION_OUTBOX_STORE = 'operations';
export const WORKSPACE_SETTINGS_OUTBOX_STORE = 'settings';
export const WORKSPACE_LOCAL_REPLICA_STORE = 'replicas';

export type WorkspacePersistenceDatabaseOptions = Readonly<{
  databaseName?: string;
  indexedDb?: IDBFactory;
}>;

export type IndexedDbCausalOutboxStoreOptions<
  TEntry extends WorkspaceOutboxRecord,
> = Readonly<{
  databaseName?: string;
  decode: (value: unknown) => TEntry | null;
  indexedDb?: IDBFactory;
  storeName: string;
}>;

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

export const openWorkspacePersistenceDatabase = (
  options: WorkspacePersistenceDatabaseOptions = {}
): Promise<IDBDatabase> => {
  const factory = options.indexedDb ?? globalThis.indexedDB;
  if (!factory) {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  return new Promise((resolve, reject) => {
    const request = factory.open(
      options.databaseName ?? WORKSPACE_PERSISTENCE_DATABASE_NAME,
      WORKSPACE_PERSISTENCE_DATABASE_VERSION
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      [
        WORKSPACE_OPERATION_OUTBOX_STORE,
        WORKSPACE_SETTINGS_OUTBOX_STORE,
        WORKSPACE_LOCAL_REPLICA_STORE,
      ].forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open workspace storage.'));
    request.onblocked = () =>
      reject(new Error('Workspace storage database upgrade is blocked.'));
  });
};

const ownsExpectedLease = (
  entry: WorkspaceOutboxRecord,
  expectedLeaseOwnerId?: string
): boolean =>
  expectedLeaseOwnerId === undefined ||
  (entry.state.kind === 'sending' &&
    entry.state.leaseOwnerId === expectedLeaseOwnerId);

/** Generic IndexedDB adapter shared by authoring and settings queues. */
export const createIndexedDbCausalOutboxStore = <
  TEntry extends WorkspaceOutboxRecord,
>(
  options: IndexedDbCausalOutboxStoreOptions<TEntry>
): WorkspaceOutboxStore<TEntry> => {
  let databasePromise: Promise<IDBDatabase> | undefined;

  const openDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openWorkspacePersistenceDatabase({
      ...(options.databaseName ? { databaseName: options.databaseName } : {}),
      ...(options.indexedDb ? { indexedDb: options.indexedDb } : {}),
    }).then(
      (database) => {
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        return database;
      },
      (error) => {
        databasePromise = undefined;
        throw error;
      }
    );
    return databasePromise;
  };

  const readCurrent = async (
    store: IDBObjectStore,
    entryId: string
  ): Promise<TEntry | null> =>
    options.decode(await requestResult(store.get(entryId)));

  const enqueue = async (entry: TEntry): Promise<void> => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const existing = await readCurrent(store, entry.id);
    if (!existing) {
      store.put(entry);
    } else if (
      JSON.stringify(existing.request) !== JSON.stringify(entry.request)
    ) {
      transaction.abort();
    }
    await completed;
  };

  const get = async (entryId: string): Promise<TEntry | null> => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readonly');
    const completed = transactionComplete(transaction);
    const entry = await readCurrent(
      transaction.objectStore(options.storeName),
      entryId
    );
    await completed;
    return entry;
  };

  const list = async (workspaceId?: string): Promise<readonly TEntry[]> => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readonly');
    const completed = transactionComplete(transaction);
    const values = await requestResult(
      transaction.objectStore(options.storeName).getAll()
    );
    await completed;
    return values
      .map(options.decode)
      .filter((entry): entry is TEntry => Boolean(entry))
      .filter((entry) => !workspaceId || entry.workspaceId === workspaceId)
      .sort(compareWorkspaceOutboxEntries);
  };

  const claimNext: WorkspaceOutboxStore<TEntry>['claimNext'] = async (
    input
  ) => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const entries = (await requestResult(store.getAll()))
      .map(options.decode)
      .filter((entry): entry is TEntry => Boolean(entry));
    const candidate = selectWorkspaceOutboxClaimCandidate(
      entries,
      input.workspaceId,
      input.now
    );
    const claimed = candidate
      ? claimWorkspaceOutboxEntry(candidate, input)
      : null;
    if (claimed) store.put(claimed);
    await completed;
    return claimed;
  };

  const claim: WorkspaceOutboxStore<TEntry>['claim'] = async (input) => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const entries = (await requestResult(store.getAll()))
      .map(options.decode)
      .filter((entry): entry is TEntry => Boolean(entry));
    const target = entries.find((entry) => entry.id === input.entryId);
    const candidate = selectWorkspaceOutboxClaimCandidate(
      entries,
      target?.workspaceId ?? '',
      input.now
    );
    const claimed =
      candidate?.id === input.entryId
        ? claimWorkspaceOutboxEntry(candidate, input)
        : null;
    if (claimed) store.put(claimed);
    await completed;
    return claimed;
  };

  const update: WorkspaceOutboxStore<TEntry>['update'] = async (
    entry,
    expectedLeaseOwnerId
  ) => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const current = await readCurrent(store, entry.id);
    const updated = Boolean(
      current &&
      ownsExpectedLease(current, expectedLeaseOwnerId) &&
      current.updatedAt <= entry.updatedAt
    );
    if (updated) store.put(entry);
    await completed;
    return updated;
  };

  const remove: WorkspaceOutboxStore<TEntry>['remove'] = async (
    entryId,
    expectedLeaseOwnerId
  ) => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const current = await readCurrent(store, entryId);
    const removed = Boolean(
      current && ownsExpectedLease(current, expectedLeaseOwnerId)
    );
    if (removed) store.delete(entryId);
    await completed;
    return removed;
  };

  const replace: WorkspaceOutboxStore<TEntry>['replace'] = async (
    entryId,
    replacement,
    expectedLeaseOwnerId
  ) => {
    const database = await openDatabase();
    const transaction = database.transaction(options.storeName, 'readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(options.storeName);
    const current = await readCurrent(store, entryId);
    const collision =
      replacement.id === entryId
        ? null
        : await readCurrent(store, replacement.id);
    const replaced = Boolean(
      current && !collision && ownsExpectedLease(current, expectedLeaseOwnerId)
    );
    if (replaced) {
      const causallyOrderedReplacement = inheritWorkspaceOutboxCausalOrder(
        current,
        replacement
      );
      if (replacement.id !== entryId) store.delete(entryId);
      store.put(causallyOrderedReplacement);
    }
    await completed;
    return replaced;
  };

  return Object.freeze({
    enqueue,
    get,
    list,
    claim,
    claimNext,
    update,
    remove,
    replace,
  });
};
