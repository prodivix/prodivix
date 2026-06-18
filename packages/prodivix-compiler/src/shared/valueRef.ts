import type {
  DataReference,
  IndexReference,
  ItemReference,
  ParamReference,
  StateReference,
} from '@prodivix/shared/types/pir';

type UnsafeRecord = Record<string, unknown>;

export const VALUE_REF_PATH_SEGMENT_PATTERN = /[^.[\]]+|\[(\d+)\]/g;
export const VALUE_REF_IDENTIFIER_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

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
