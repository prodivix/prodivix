import {
  gatewayAuditRecordByteLength,
  normalizeGatewayAuditRecord,
  normalizeGatewayAuditRetentionPolicy,
  type GatewayAuditRecord,
  type GatewayAuditRetentionPolicy,
  type GatewayAuditStore,
} from '#browser/gateway/audit/gatewayAudit';

type StoredGatewayAuditRecord = Readonly<{
  eventId: string;
  occurredAt: number;
  byteLength: number;
  record: GatewayAuditRecord;
}>;

export type IndexedDbGatewayAuditStoreOptions = Readonly<{
  databaseName?: string;
  databaseVersion?: number;
  retention?: Partial<GatewayAuditRetentionPolicy>;
  indexedDb?: IDBFactory;
}>;

const STORE_NAME = 'gateway-events';
const OCCURRED_AT_INDEX = 'by-occurred-at';

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => undefined;
  });

/**
 * Opens the Host-owned persistent Gateway audit database. Every append and
 * retention prune is committed in one read-write transaction before a
 * sensitive Gateway effect may start.
 */
export const createIndexedDbGatewayAuditStore = (
  options: IndexedDbGatewayAuditStoreOptions = {}
): GatewayAuditStore => {
  const policy = normalizeGatewayAuditRetentionPolicy(options.retention);
  const factory = options.indexedDb ?? globalThis.indexedDB;
  const databaseName =
    options.databaseName ?? 'prodivix-plugin-gateway-audit-v1';
  const databaseVersion = options.databaseVersion ?? 1;
  let disposed = false;
  let databasePromise: Promise<IDBDatabase> | undefined;

  const forgetHandle = (pending: Promise<IDBDatabase>): void => {
    if (databasePromise === pending) databasePromise = undefined;
  };

  const openDatabase = (): Promise<IDBDatabase> => {
    if (disposed) return Promise.reject(new Error('Audit store is disposed.'));
    if (!factory) {
      return Promise.reject(new Error('IndexedDB is unavailable.'));
    }
    if (databasePromise) return databasePromise;
    const pending: Promise<IDBDatabase> = new Promise((resolve, reject) => {
      const request = factory.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, { keyPath: 'eventId' });
        if (!store.indexNames.contains(OCCURRED_AT_INDEX)) {
          store.createIndex(OCCURRED_AT_INDEX, 'occurredAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        // A handle closed by another tab's upgrade or by site-data clearing can
        // never serve another transaction, so the memo has to be dropped or the
        // whole required-before-effect Gateway surface would stay failed closed.
        database.onversionchange = () => {
          forgetHandle(pending);
          database.close();
        };
        database.onclose = () => forgetHandle(pending);
        resolve(database);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Unable to open audit database.'));
      request.onblocked = () =>
        reject(new Error('Audit database upgrade is blocked.'));
    });
    databasePromise = pending;
    void pending.catch(() => forgetHandle(pending));
    return pending;
  };

  /** Begins one audit transaction, reopening once when the memo went stale. */
  const beginTransaction = async (
    mode: IDBTransactionMode
  ): Promise<IDBTransaction> => {
    const pending = openDatabase();
    const database = await pending;
    try {
      return database.transaction(STORE_NAME, mode);
    } catch (error) {
      if (disposed) throw error;
      forgetHandle(pending);
      const reopened = await openDatabase();
      return reopened.transaction(STORE_NAME, mode);
    }
  };

  const append = async (input: GatewayAuditRecord): Promise<void> => {
    const record = normalizeGatewayAuditRecord(input);
    const byteLength = gatewayAuditRecordByteLength(record);
    if (byteLength > policy.maxBytes) {
      throw new Error('Gateway audit record exceeds the retention byte limit.');
    }
    const transaction = await beginTransaction('readwrite');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    store.put({
      eventId: record.eventId,
      occurredAt: record.occurredAt,
      byteLength,
      record,
    } satisfies StoredGatewayAuditRecord);

    const stored: Array<Readonly<{ eventId: string; byteLength: number }>> = [];
    let totalBytes = 0;
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.index(OCCURRED_AT_INDEX).openCursor();
      cursorRequest.onerror = () =>
        reject(
          cursorRequest.error ?? new Error('Audit retention scan failed.')
        );
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          const value = cursor.value as StoredGatewayAuditRecord;
          stored.push({
            eventId: value.eventId,
            byteLength: value.byteLength,
          });
          totalBytes += value.byteLength;
          cursor.continue();
          return;
        }
        while (
          stored.length > policy.maxRecords ||
          totalBytes > policy.maxBytes
        ) {
          const removed = stored.shift();
          if (!removed) break;
          totalBytes -= removed.byteLength;
          store.delete(removed.eventId);
        }
        resolve();
      };
    });
    await completed;
  };

  const readRecent = async (
    limit = 100
  ): Promise<readonly GatewayAuditRecord[]> => {
    const transaction = await beginTransaction('readonly');
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(STORE_NAME);
    const normalizedLimit =
      Number.isSafeInteger(limit) && limit > 0 ? limit : 100;
    const records: GatewayAuditRecord[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store
        .index(OCCURRED_AT_INDEX)
        .openCursor(undefined, 'prev');
      cursorRequest.onerror = () =>
        reject(cursorRequest.error ?? new Error('Audit read failed.'));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || records.length >= normalizedLimit) {
          resolve();
          return;
        }
        records.push((cursor.value as StoredGatewayAuditRecord).record);
        cursor.continue();
      };
    });
    await completed;
    return Object.freeze(records.map(normalizeGatewayAuditRecord));
  };

  return Object.freeze({
    append,
    readRecent,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      const pending = databasePromise;
      databasePromise = undefined;
      const database = await pending?.catch(() => undefined);
      database?.close();
    },
  });
};
