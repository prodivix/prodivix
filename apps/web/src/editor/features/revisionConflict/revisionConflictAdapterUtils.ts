import type { WorkspaceChangeValue } from '@prodivix/workspace-sync';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const indexStableEntities = (
  owner: Record<string, unknown> | undefined,
  arrayField: string,
  recordField: string
): Record<string, Record<string, unknown>> => {
  if (!owner) return {};
  const record = owner[recordField];
  if (isRecord(record)) {
    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, Record<string, unknown>] =>
          Boolean(entry[0]) && isRecord(entry[1])
      )
    );
  }
  const array = owner[arrayField];
  if (!Array.isArray(array)) return {};
  const result: Record<string, Record<string, unknown>> = {};
  array.forEach((entry) => {
    if (!isRecord(entry)) return;
    const id = asNonEmptyString(entry.id);
    if (id && !Object.hasOwn(result, id)) result[id] = entry;
  });
  return result;
};

export const formatWorkspaceChangeValue = (
  state: WorkspaceChangeValue
): string | undefined => {
  if (!state.present) return undefined;
  if (typeof state.value === 'string') return state.value;
  if (
    state.value === null ||
    typeof state.value === 'number' ||
    typeof state.value === 'boolean'
  ) {
    return String(state.value);
  }
  try {
    return JSON.stringify(state.value, null, 2);
  } catch {
    return String(state.value);
  }
};

export const uniqueSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
