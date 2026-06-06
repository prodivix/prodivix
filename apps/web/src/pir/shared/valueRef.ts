import type {
  DataReference,
  IndexReference,
  ItemReference,
  ParamReference,
  StateReference,
  ValueOrRef,
} from '@/core/types/engine.types';

type UnsafeRecord = Record<string, unknown>;

export type ValueRefContext = {
  params?: Record<string, unknown>;
  state?: Record<string, unknown>;
  data?: unknown;
  item?: unknown;
  index?: number;
};

export const VALUE_REF_PATH_SEGMENT_PATTERN = /[^.[\]]+|\[(\d+)\]/g;
export const VALUE_REF_IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const PATH_SEGMENT_PATTERN = VALUE_REF_PATH_SEGMENT_PATTERN;

export const parseValueRefPathSegments = (path: string): string[] => {
  const trimmed = path.trim();
  if (!trimmed) return [];
  return Array.from(trimmed.matchAll(VALUE_REF_PATH_SEGMENT_PATTERN)).map(
    (token) => token[1] ?? token[0]
  );
};

const isPlainObject = (value: unknown): value is UnsafeRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isParamReference = (value: unknown): value is ParamReference =>
  isPlainObject(value) &&
  typeof value.$param === 'string' &&
  Object.keys(value).length === 1;

export const isStateReference = (value: unknown): value is StateReference =>
  isPlainObject(value) &&
  typeof value.$state === 'string' &&
  Object.keys(value).length === 1;

export const isDataReference = (value: unknown): value is DataReference =>
  isPlainObject(value) &&
  typeof value.$data === 'string' &&
  Object.keys(value).length === 1;

export const isItemReference = (value: unknown): value is ItemReference =>
  isPlainObject(value) &&
  typeof value.$item === 'string' &&
  Object.keys(value).length === 1;

export const isIndexReference = (value: unknown): value is IndexReference =>
  isPlainObject(value) &&
  value.$index === true &&
  Object.keys(value).length === 1;

export const isValueReference = (
  value: unknown
): value is
  | ParamReference
  | StateReference
  | DataReference
  | ItemReference
  | IndexReference =>
  isParamReference(value) ||
  isStateReference(value) ||
  isDataReference(value) ||
  isItemReference(value) ||
  isIndexReference(value);

export const readValueByPath = (source: unknown, path: string): unknown => {
  const trimmed = path.trim();
  if (!trimmed) return source;
  let cursor: unknown = source;
  const tokens = Array.from(trimmed.matchAll(PATH_SEGMENT_PATTERN)).map(
    (token) => token[1] ?? token[0]
  );
  for (const token of tokens) {
    if (cursor === null || cursor === undefined) return undefined;
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
};

const resolveReferenceValue = (
  value: unknown,
  context: ValueRefContext
): unknown => {
  if (isParamReference(value)) {
    return readValueByPath(context.params, value.$param);
  }
  if (isStateReference(value)) {
    return readValueByPath(context.state, value.$state);
  }
  if (isDataReference(value)) {
    return readValueByPath(context.data, value.$data);
  }
  if (isItemReference(value)) {
    return readValueByPath(context.item, value.$item);
  }
  if (isIndexReference(value)) {
    return context.index;
  }
  return value;
};

export const resolveValueOrRef = (
  value: unknown,
  context: ValueRefContext
): unknown => resolveReferenceValue(value, context);

export const deepResolveValueOrRef = (
  value: unknown,
  context: ValueRefContext,
  depth = 0,
  maxDepth = 12
): unknown => {
  if (depth > maxDepth) return value;
  const resolved = resolveReferenceValue(value, context);
  if (resolved === null || resolved === undefined) return resolved;
  if (Array.isArray(resolved)) {
    return resolved.map((entry) =>
      deepResolveValueOrRef(entry, context, depth + 1, maxDepth)
    );
  }
  if (isPlainObject(resolved) && !isValueReference(resolved)) {
    const next: UnsafeRecord = {};
    Object.entries(resolved).forEach(([key, entry]) => {
      next[key] = deepResolveValueOrRef(entry, context, depth + 1, maxDepth);
    });
    return next;
  }
  return resolved;
};
