import type {
  DataJsonObject,
  DataJsonValue,
  DataStreamIncrementalCollectionPolicy,
} from './data.types';
import { cloneDataJsonValue } from './dataJsonRuntime';

export const DATA_INCREMENTAL_COLLECTION_ERROR_CODES = Object.freeze({
  cursorConflict: 'DATA_STREAM_COLLECTION_CURSOR_CONFLICT',
  eventInvalid: 'DATA_STREAM_COLLECTION_EVENT_INVALID',
  identityInvalid: 'DATA_STREAM_COLLECTION_IDENTITY_INVALID',
  identityConflict: 'DATA_STREAM_COLLECTION_IDENTITY_CONFLICT',
  capacity: 'DATA_STREAM_COLLECTION_CAPACITY',
} as const);

export type DataIncrementalCollectionErrorCode =
  (typeof DATA_INCREMENTAL_COLLECTION_ERROR_CODES)[keyof typeof DATA_INCREMENTAL_COLLECTION_ERROR_CODES];

export class DataIncrementalCollectionError extends Error {
  readonly code: DataIncrementalCollectionErrorCode;

  constructor(code: DataIncrementalCollectionErrorCode) {
    super('Data stream incremental collection event was rejected.');
    this.name = 'DataIncrementalCollectionError';
    this.code = code;
  }
}

export type DataIncrementalCollectionEvent =
  | Readonly<{ action: 'upsert'; entity: DataJsonObject }>
  | Readonly<{ action: 'delete'; id: string | number }>
  | Readonly<{ action: 'replace'; items: readonly DataJsonObject[] }>;

export type DataIncrementalCollectionSnapshot = Readonly<{
  cursor: number;
  appliedEvents: number;
  items: readonly DataJsonObject[];
}>;

export type DataIncrementalCollectionRuntime = Readonly<{
  getSnapshot(): DataIncrementalCollectionSnapshot;
  apply(
    input: Readonly<{ cursor: number; value: DataJsonValue }>
  ): DataIncrementalCollectionSnapshot;
}>;

const isDataJsonObject = (value: DataJsonValue): value is DataJsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const exactRecord = (
  value: DataJsonValue,
  required: readonly string[]
): DataJsonObject | undefined => {
  if (!isDataJsonObject(value)) return undefined;
  const keys = Object.keys(value);
  const expected = new Set(required);
  return keys.length === required.length &&
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => expected.has(key))
    ? value
    : undefined;
};

const pointerTokens = (pointer: string): readonly string[] => {
  if (!pointer.startsWith('/'))
    throw new DataIncrementalCollectionError(
      DATA_INCREMENTAL_COLLECTION_ERROR_CODES.identityInvalid
    );
  return Object.freeze(
    pointer
      .slice(1)
      .split('/')
      .map((token) => {
        if (/~(?:[^01]|$)/u.test(token))
          throw new DataIncrementalCollectionError(
            DATA_INCREMENTAL_COLLECTION_ERROR_CODES.identityInvalid
          );
        return token.replace(/~1/gu, '/').replace(/~0/gu, '~');
      })
  );
};

const readPointer = (
  value: DataJsonValue,
  tokens: readonly string[]
): DataJsonValue | undefined => {
  let current: DataJsonValue | undefined = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return undefined;
      current = current[Number(token)];
    } else if (
      current !== undefined &&
      isDataJsonObject(current) &&
      Object.hasOwn(current, token)
    ) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
};

const identity = (value: DataJsonValue | undefined): string => {
  if (
    (typeof value !== 'string' || !value) &&
    (typeof value !== 'number' || !Number.isSafeInteger(value))
  )
    throw new DataIncrementalCollectionError(
      DATA_INCREMENTAL_COLLECTION_ERROR_CODES.identityInvalid
    );
  return JSON.stringify(value);
};

const decodeEvent = (value: DataJsonValue): DataIncrementalCollectionEvent => {
  const candidate = exactRecord(value, ['action', 'entity']);
  if (candidate?.action === 'upsert') {
    const entity = candidate.entity;
    if (!entity || !isDataJsonObject(entity))
      throw new DataIncrementalCollectionError(
        DATA_INCREMENTAL_COLLECTION_ERROR_CODES.eventInvalid
      );
    return Object.freeze({ action: 'upsert', entity });
  }
  const deletion = exactRecord(value, ['action', 'id']);
  if (
    deletion?.action === 'delete' &&
    (typeof deletion.id === 'string' || typeof deletion.id === 'number')
  )
    return Object.freeze({ action: 'delete', id: deletion.id });
  const replacement = exactRecord(value, ['action', 'items']);
  if (
    replacement?.action === 'replace' &&
    Array.isArray(replacement.items) &&
    replacement.items.every((item) => isDataJsonObject(item))
  )
    return Object.freeze({
      action: 'replace',
      items: replacement.items as readonly DataJsonObject[],
    });
  throw new DataIncrementalCollectionError(
    DATA_INCREMENTAL_COLLECTION_ERROR_CODES.eventInvalid
  );
};

/** Applies exact-cursor, immutable keyed events without creating durable state. */
export const createDataIncrementalCollectionRuntime = (input: {
  policy: DataStreamIncrementalCollectionPolicy;
  initialItems?: readonly DataJsonObject[];
}): DataIncrementalCollectionRuntime => {
  const tokens = pointerTokens(input.policy.entityIdPath);
  const normalizeItems = (
    values: readonly DataJsonObject[]
  ): readonly DataJsonObject[] => {
    if (values.length > input.policy.maxItems)
      throw new DataIncrementalCollectionError(
        DATA_INCREMENTAL_COLLECTION_ERROR_CODES.capacity
      );
    const seen = new Set<string>();
    return Object.freeze(
      values.map((value) => {
        const cloned = cloneDataJsonValue(value);
        if (!cloned || !isDataJsonObject(cloned))
          throw new DataIncrementalCollectionError(
            DATA_INCREMENTAL_COLLECTION_ERROR_CODES.eventInvalid
          );
        const key = identity(readPointer(cloned, tokens));
        if (seen.has(key))
          throw new DataIncrementalCollectionError(
            DATA_INCREMENTAL_COLLECTION_ERROR_CODES.identityConflict
          );
        seen.add(key);
        return cloned;
      })
    );
  };
  let snapshot: DataIncrementalCollectionSnapshot = Object.freeze({
    cursor: 0,
    appliedEvents: 0,
    items: normalizeItems(input.initialItems ?? []),
  });
  return Object.freeze({
    getSnapshot: () => snapshot,
    apply({ cursor, value }) {
      if (!Number.isSafeInteger(cursor) || cursor !== snapshot.cursor + 1)
        throw new DataIncrementalCollectionError(
          DATA_INCREMENTAL_COLLECTION_ERROR_CODES.cursorConflict
        );
      const event = decodeEvent(cloneDataJsonValue(value));
      let items: readonly DataJsonObject[];
      if (event.action === 'replace') {
        items = normalizeItems(event.items);
      } else if (event.action === 'delete') {
        const key = identity(event.id);
        items = Object.freeze(
          snapshot.items.filter(
            (candidate) => identity(readPointer(candidate, tokens)) !== key
          )
        );
      } else {
        const key = identity(readPointer(event.entity, tokens));
        const index = snapshot.items.findIndex(
          (candidate) => identity(readPointer(candidate, tokens)) === key
        );
        if (index < 0) {
          if (snapshot.items.length >= input.policy.maxItems)
            throw new DataIncrementalCollectionError(
              DATA_INCREMENTAL_COLLECTION_ERROR_CODES.capacity
            );
          items = Object.freeze([...snapshot.items, event.entity]);
        } else {
          const next = [...snapshot.items];
          next[index] = event.entity;
          items = Object.freeze(next);
        }
      }
      snapshot = Object.freeze({
        cursor,
        appliedEvents: snapshot.appliedEvents + 1,
        items,
      });
      return snapshot;
    },
  });
};
