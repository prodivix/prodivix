import {
  cloneExecutionValue,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import {
  SERVER_ROUTE_ACTION_INPUT_FORMAT,
  type ServerRouteActionInput,
  type ServerRouteActionMethod,
} from './serverRuntime.types';

const canonicalIdentifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\0');

const canonicalPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 4_096 &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\0');

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = []
): Readonly<Record<string, unknown>> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set([...keys, ...optional]);
  return keys.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
    ? record
    : undefined;
};

const stringRecord = (
  value: unknown
): Readonly<Record<string, string>> | undefined => {
  const record = exactRecord(value, Object.keys((value ?? {}) as object));
  if (!record || Object.keys(record).length > 256) return undefined;
  const entries = Object.entries(record)
    .map(([key, entry]) =>
      canonicalIdentifier(key) &&
      typeof entry === 'string' &&
      entry.length <= 4_096 &&
      !entry.includes('\0')
        ? ([key, entry] as const)
        : undefined
    )
    .filter((entry): entry is readonly [string, string] => Boolean(entry))
    .sort(([left], [right]) => left.localeCompare(right));
  return entries.length === Object.keys(record).length
    ? Object.freeze(Object.fromEntries(entries))
    : undefined;
};

const searchRecord = (
  value: unknown
): ServerRouteActionInput['route']['searchParams'] | undefined => {
  const record = exactRecord(value, Object.keys((value ?? {}) as object));
  if (!record || Object.keys(record).length > 256) return undefined;
  const entries: [string, string | readonly string[]][] = [];
  for (const [key, entry] of Object.entries(record)) {
    if (!canonicalIdentifier(key)) return undefined;
    if (
      typeof entry === 'string' &&
      entry.length <= 4_096 &&
      !entry.includes('\0')
    ) {
      entries.push([key, entry]);
      continue;
    }
    if (
      !Array.isArray(entry) ||
      entry.length > 256 ||
      !entry.every(
        (item) =>
          typeof item === 'string' &&
          item.length <= 4_096 &&
          !item.includes('\0')
      )
    ) {
      return undefined;
    }
    entries.push([key, Object.freeze([...entry])]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return entries.length === Object.keys(record).length
    ? Object.freeze(Object.fromEntries(entries))
    : undefined;
};

const routeActionMethod = (
  value: unknown
): ServerRouteActionMethod | undefined =>
  value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE'
    ? value
    : undefined;

/** Strictly normalizes the framework-neutral Route action payload before an effect. */
export const readServerRouteActionInput = (
  value: unknown
): ServerRouteActionInput | undefined => {
  const root = exactRecord(value, ['format', 'route', 'submission']);
  const route = exactRecord(
    root?.route,
    ['routeNodeId', 'currentPath', 'matchedPath', 'params', 'searchParams'],
    ['hash']
  );
  const submission = exactRecord(root?.submission, [
    'method',
    'encType',
    'value',
  ]);
  const params = stringRecord(route?.params);
  const searchParams = searchRecord(route?.searchParams);
  const method = routeActionMethod(submission?.method);
  if (
    !root ||
    root.format !== SERVER_ROUTE_ACTION_INPUT_FORMAT ||
    !route ||
    !canonicalIdentifier(route.routeNodeId) ||
    !canonicalPath(route.currentPath) ||
    !canonicalPath(route.matchedPath) ||
    !params ||
    !searchParams ||
    (route.hash !== undefined &&
      (typeof route.hash !== 'string' ||
        route.hash.length > 4_096 ||
        route.hash.includes('\0'))) ||
    !submission ||
    !method ||
    (submission.encType !== 'application/json' &&
      submission.encType !== 'application/x-www-form-urlencoded')
  ) {
    return undefined;
  }
  let actionValue: ExecutionValue;
  try {
    actionValue = cloneExecutionValue(submission.value as ExecutionValue);
  } catch {
    return undefined;
  }
  return Object.freeze({
    format: SERVER_ROUTE_ACTION_INPUT_FORMAT,
    route: Object.freeze({
      routeNodeId: route.routeNodeId,
      currentPath: route.currentPath,
      matchedPath: route.matchedPath,
      params,
      searchParams,
      ...(route.hash === undefined ? {} : { hash: route.hash }),
    }),
    submission: Object.freeze({
      method,
      encType: submission.encType,
      value: actionValue,
    }),
  });
};

export const createServerRouteActionInput = (
  value: Omit<ServerRouteActionInput, 'format'>
): ServerRouteActionInput => {
  const normalized = readServerRouteActionInput({
    format: SERVER_ROUTE_ACTION_INPUT_FORMAT,
    ...value,
  });
  if (!normalized) throw new TypeError('Server Route action input is invalid.');
  return normalized;
};
