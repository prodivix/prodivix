import {
  BINARY_ASSET_LIMITS,
  createBinaryAssetBlobReference,
  createBinaryAssetMaterialization,
  readBinaryAssetBlobReference,
  type BinaryAssetBlobReadRequest,
  type BinaryAssetBlobReader,
  type BinaryAssetBlobReference,
  type BinaryAssetBlobUploader,
  type BinaryAssetBlobUploadResult,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';

const LOCAL_ASSET_DB_NAME = 'prodivix-local-workspace-assets';
const LOCAL_ASSET_DB_VERSION = 1;
const LOCAL_ASSET_STORE_NAME = 'blobs';
const LOCAL_ASSET_WORKSPACE_INDEX = 'workspaceId';
const MAX_LOCAL_ASSET_COPY_COUNT = 1_024;
const MAX_LOCAL_ASSET_COPY_BYTES = 256 * 1024 * 1024;
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

type PersistedLocalWorkspaceAssetBlob = Readonly<{
  id: string;
  workspaceId: string;
  digest: string;
  mediaType: string;
  byteLength: number;
  contents: ArrayBuffer;
  createdAt: string;
}>;

const normalizeWorkspaceId = (value: string): string => {
  const workspaceId = value.trim();
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new TypeError('Local asset Workspace identity is invalid.');
  }
  return workspaceId;
};

const createBlobId = (workspaceId: string, digest: string): string =>
  JSON.stringify([workspaceId, digest]);

const copyContentsToArrayBuffer = (contents: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(contents.byteLength);
  copy.set(contents);
  return copy.buffer;
};

const openLocalAssetDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = indexedDB.open(LOCAL_ASSET_DB_NAME, LOCAL_ASSET_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_ASSET_STORE_NAME)) {
        const store = database.createObjectStore(LOCAL_ASSET_STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex(LOCAL_ASSET_WORKSPACE_INDEX, 'workspaceId', {
          unique: false,
        });
      }
    };
    request.onblocked = () =>
      reject(new Error('Local asset database upgrade is blocked.'));
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open local assets.'));
    request.onsuccess = () => resolve(request.result);
  });

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onerror = () =>
      reject(request.error ?? new Error('Local asset request failed.'));
    request.onsuccess = () => resolve(request.result);
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Local asset transaction aborted.')
      );
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Local asset transaction failed.'));
  });

const readPersistedBlob = async (
  workspaceId: string,
  digest: string
): Promise<unknown | undefined> => {
  const database = await openLocalAssetDatabase();
  try {
    const transaction = database.transaction(
      LOCAL_ASSET_STORE_NAME,
      'readonly'
    );
    const [result] = await Promise.all([
      requestResult(
        transaction
          .objectStore(LOCAL_ASSET_STORE_NAME)
          .get(createBlobId(workspaceId, digest))
      ),
      transactionComplete(transaction),
    ]);
    return result;
  } finally {
    database.close();
  }
};

const validatePersistedBlob = (
  value: unknown,
  workspaceId: string,
  expectedReference?: BinaryAssetBlobReference
): Readonly<{
  reference: BinaryAssetBlobReference;
  contents: Uint8Array;
}> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('AST-1004: Local asset blob record is invalid.');
  }
  const source = value as Partial<PersistedLocalWorkspaceAssetBlob>;
  const storedContents = source.contents as ArrayBuffer | undefined;
  if (
    source.workspaceId !== workspaceId ||
    typeof source.digest !== 'string' ||
    typeof source.mediaType !== 'string' ||
    typeof source.byteLength !== 'number' ||
    !Number.isSafeInteger(source.byteLength) ||
    Object.prototype.toString.call(storedContents) !== '[object ArrayBuffer]' ||
    typeof source.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(source.createdAt))
  ) {
    throw new TypeError('AST-1004: Local asset blob record is invalid.');
  }
  const contents = new Uint8Array(storedContents!.slice(0));
  const reference = createBinaryAssetBlobReference({
    contents,
    mediaType: source.mediaType,
  });
  if (
    reference.digest !== source.digest ||
    reference.byteLength !== source.byteLength ||
    (expectedReference &&
      (reference.digest !== expectedReference.digest ||
        reference.byteLength !== expectedReference.byteLength ||
        reference.mediaType !== expectedReference.mediaType))
  ) {
    throw new TypeError('AST-1004: Local asset blob identity drifted.');
  }
  return Object.freeze({ reference, contents });
};

const addPersistedBlob = async (
  record: PersistedLocalWorkspaceAssetBlob
): Promise<void> => {
  const database = await openLocalAssetDatabase();
  try {
    const transaction = database.transaction(
      LOCAL_ASSET_STORE_NAME,
      'readwrite'
    );
    const completion = transactionComplete(transaction);
    transaction.objectStore(LOCAL_ASSET_STORE_NAME).add(record);
    await completion;
  } finally {
    database.close();
  }
};

/** Stores exact local-only Workspace bytes before their reference is committed. */
export const putLocalWorkspaceAssetBlob = async (input: {
  workspaceId: string;
  contents: Uint8Array;
  mediaType: string;
}): Promise<BinaryAssetBlobUploadResult> => {
  const workspaceId = normalizeWorkspaceId(input.workspaceId);
  const reference = createBinaryAssetBlobReference({
    contents: input.contents,
    mediaType: input.mediaType,
  });
  const existing = await readPersistedBlob(workspaceId, reference.digest);
  if (existing !== undefined) {
    const verified = validatePersistedBlob(existing, workspaceId);
    if (verified.reference.mediaType !== reference.mediaType) {
      throw new TypeError('AST-2003: Local asset blob identity conflicts.');
    }
    return Object.freeze({ kind: 'existing', reference });
  }
  const record = Object.freeze({
    id: createBlobId(workspaceId, reference.digest),
    workspaceId,
    digest: reference.digest,
    mediaType: reference.mediaType,
    byteLength: reference.byteLength,
    contents: copyContentsToArrayBuffer(input.contents),
    createdAt: new Date().toISOString(),
  });
  try {
    await addPersistedBlob(record);
    return Object.freeze({ kind: 'stored', reference });
  } catch (error) {
    if (
      !error ||
      typeof error !== 'object' ||
      !('name' in error) ||
      error.name !== 'ConstraintError'
    ) {
      throw error;
    }
    const raced = await readPersistedBlob(workspaceId, reference.digest);
    const verified = validatePersistedBlob(raced, workspaceId);
    if (verified.reference.mediaType !== reference.mediaType) {
      throw new TypeError('AST-2003: Local asset blob identity conflicts.');
    }
    return Object.freeze({ kind: 'existing', reference });
  }
};

/** Materializes one exact local-only blob without exposing IndexedDB to Compiler/runtime owners. */
export const getLocalWorkspaceAssetBlob = async (input: {
  workspaceId: string;
  assetDocumentId: string;
  reference: BinaryAssetBlobReference;
  signal?: AbortSignal;
}): Promise<BinaryAssetMaterialization | undefined> => {
  input.signal?.throwIfAborted();
  const workspaceId = normalizeWorkspaceId(input.workspaceId);
  const reference = readBinaryAssetBlobReference(input.reference);
  const persisted = await readPersistedBlob(workspaceId, reference.digest);
  input.signal?.throwIfAborted();
  if (persisted === undefined) return undefined;
  const verified = validatePersistedBlob(persisted, workspaceId, reference);
  return createBinaryAssetMaterialization({
    assetDocumentId: input.assetDocumentId,
    reference,
    contents: verified.contents,
  });
};

export const localWorkspaceAssetBlobUploader: BinaryAssetBlobUploader =
  Object.freeze({ upload: putLocalWorkspaceAssetBlob });

export const localWorkspaceAssetBlobReader: BinaryAssetBlobReader =
  Object.freeze({
    async read(
      request: BinaryAssetBlobReadRequest
    ): Promise<Uint8Array | undefined> {
      const materialization = await getLocalWorkspaceAssetBlob(request);
      return materialization?.contents;
    },
  });

/** Copies only exact referenced blobs before a duplicated Workspace is committed. */
export const copyLocalWorkspaceAssetBlobs = async (input: {
  sourceWorkspaceId: string;
  targetWorkspaceId: string;
  references: readonly BinaryAssetBlobReference[];
}): Promise<void> => {
  const sourceWorkspaceId = normalizeWorkspaceId(input.sourceWorkspaceId);
  const targetWorkspaceId = normalizeWorkspaceId(input.targetWorkspaceId);
  if (sourceWorkspaceId === targetWorkspaceId) {
    throw new TypeError('Local asset copy requires distinct Workspaces.');
  }
  const referencesByDigest = new Map<string, BinaryAssetBlobReference>();
  let totalBytes = 0;
  for (const candidate of input.references) {
    const reference = readBinaryAssetBlobReference(candidate);
    const existing = referencesByDigest.get(reference.digest);
    if (
      existing &&
      (existing.byteLength !== reference.byteLength ||
        existing.mediaType !== reference.mediaType)
    ) {
      throw new TypeError('AST-2003: Local asset references conflict.');
    }
    if (!existing) {
      referencesByDigest.set(reference.digest, reference);
      totalBytes += reference.byteLength;
    }
  }
  if (
    referencesByDigest.size > MAX_LOCAL_ASSET_COPY_COUNT ||
    totalBytes > MAX_LOCAL_ASSET_COPY_BYTES
  ) {
    throw new TypeError('Local asset copy exceeds its bounded budget.');
  }
  for (const reference of referencesByDigest.values()) {
    const materialization = await getLocalWorkspaceAssetBlob({
      workspaceId: sourceWorkspaceId,
      assetDocumentId: `local-copy-${reference.digest.slice(-32)}`,
      reference,
    });
    if (!materialization) {
      throw new Error('AST-1001: Referenced local asset blob is unavailable.');
    }
    await putLocalWorkspaceAssetBlob({
      workspaceId: targetWorkspaceId,
      contents: materialization.contents,
      mediaType: reference.mediaType,
    });
  }
};

/** Removes one deleted Workspace partition; document deletion alone never destroys a shared blob. */
export const deleteLocalWorkspaceAssetBlobs = async (
  workspaceIdInput: string
): Promise<void> => {
  const workspaceId = normalizeWorkspaceId(workspaceIdInput);
  const database = await openLocalAssetDatabase();
  try {
    const transaction = database.transaction(
      LOCAL_ASSET_STORE_NAME,
      'readwrite'
    );
    const store = transaction.objectStore(LOCAL_ASSET_STORE_NAME);
    const keysRequest = requestResult(
      store.index(LOCAL_ASSET_WORKSPACE_INDEX).getAllKeys(workspaceId)
    );
    const completion = transactionComplete(transaction);
    void completion.catch(() => undefined);
    const keys = await keysRequest;
    for (const key of keys) store.delete(key);
    await completion;
  } finally {
    database.close();
  }
};

export const LOCAL_WORKSPACE_ASSET_BLOB_LIMITS = Object.freeze({
  maximumBlobBytes: BINARY_ASSET_LIMITS.maxBlobBytes,
  maximumCopyCount: MAX_LOCAL_ASSET_COPY_COUNT,
  maximumCopyBytes: MAX_LOCAL_ASSET_COPY_BYTES,
});
