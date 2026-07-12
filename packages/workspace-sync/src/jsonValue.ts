export type JsonValueState =
  { present: false } | { present: true; value: unknown };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const cloneJsonValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry)])
    ) as T;
  }
  return value;
};

export const jsonValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((entry, index) => jsonValuesEqual(entry, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && jsonValuesEqual(left[key], right[key])
    )
  );
};

export type StableIdCollection = {
  order: string[];
  valuesById: Record<string, Record<string, unknown>>;
};

const STABLE_ID_ARRAY_FIELDS = new Set([
  'bindings',
  'edges',
  'graphs',
  'groups',
  'keyframes',
  'nodes',
  'primitives',
  'svgFilters',
  'timelines',
  'tracks',
]);

const pointerLastSegment = (path: string): string | undefined => {
  const segments = parseJsonPointer(path);
  return segments?.at(-1);
};

export const indexStableIdArray = (
  value: unknown
): StableIdCollection | null => {
  if (!Array.isArray(value)) return null;
  const order: string[] = [];
  const valuesById: Record<string, Record<string, unknown>> = {};
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()) {
      return null;
    }
    if (Object.hasOwn(valuesById, entry.id)) return null;
    order.push(entry.id);
    valuesById[entry.id] = entry;
  }
  return { order, valuesById };
};

export const resolveStableIdArrayPair = (
  left: unknown,
  right: unknown,
  path: string
): { left: StableIdCollection; right: StableIdCollection } | null => {
  if (!Array.isArray(left) || !Array.isArray(right)) return null;
  const leftCollection = indexStableIdArray(left);
  const rightCollection = indexStableIdArray(right);
  if (!leftCollection || !rightCollection) return null;
  const field = pointerLastSegment(path);
  if (!field || !STABLE_ID_ARRAY_FIELDS.has(field)) {
    return null;
  }
  return { left: leftCollection, right: rightCollection };
};

export const stableIdArrayPointer = (path: string): string => {
  const segments = parseJsonPointer(path);
  if (!segments?.length) return path;
  const field = segments.at(-1)!;
  segments[segments.length - 1] = field.endsWith('ById')
    ? field
    : `${field}ById`;
  return `/${segments.map(escapeJsonPointerSegment).join('/')}`;
};

/** Compares authoring JSON while treating stable-id entity arrays as maps. */
export const semanticJsonValuesEqual = (
  left: unknown,
  right: unknown,
  path = ''
): boolean => {
  if (Object.is(left, right)) return true;
  const stablePair = resolveStableIdArrayPair(left, right, path);
  if (stablePair) {
    const leftIds = Object.keys(stablePair.left.valuesById).sort();
    const rightIds = Object.keys(stablePair.right.valuesById).sort();
    if (
      leftIds.length !== rightIds.length ||
      leftIds.some((id, index) => id !== rightIds[index])
    ) {
      return false;
    }
    const collectionPath = stableIdArrayPointer(path);
    return leftIds.every((id) =>
      semanticJsonValuesEqual(
        stablePair.left.valuesById[id],
        stablePair.right.valuesById[id],
        appendJsonPointer(collectionPath, id)
      )
    );
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((entry, index) =>
        semanticJsonValuesEqual(
          entry,
          right[index],
          appendJsonPointer(path, String(index))
        )
      )
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        semanticJsonValuesEqual(
          left[key],
          right[key],
          appendJsonPointer(path, key)
        )
    )
  );
};

export const valueStatesEqual = (
  left: JsonValueState,
  right: JsonValueState
): boolean =>
  left.present === right.present &&
  (!left.present ||
    (right.present && jsonValuesEqual(left.value, right.value)));

export const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

export const decodeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~1', '/').replaceAll('~0', '~');

export const parseJsonPointer = (path: string): string[] | null => {
  if (path === '') return [];
  if (!path.startsWith('/')) return null;
  return path.slice(1).split('/').map(decodeJsonPointerSegment);
};

export const appendJsonPointer = (path: string, segment: string): string =>
  `${path}/${escapeJsonPointerSegment(segment)}`;

export const readJsonPointer = (
  value: unknown,
  path: string
): JsonValueState => {
  const segments = parseJsonPointer(path);
  if (!segments) return { present: false };
  let current = value;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { present: false };
    }
    current = current[segment];
  }
  return { present: true, value: cloneJsonValue(current) };
};

export const commonJsonPointerAncestor = (
  left: string,
  right: string
): string => {
  const leftSegments = parseJsonPointer(left) ?? [];
  const rightSegments = parseJsonPointer(right) ?? [];
  const shared: string[] = [];
  const length = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < length; index += 1) {
    if (leftSegments[index] !== rightSegments[index]) break;
    shared.push(leftSegments[index]!);
  }
  return shared.length
    ? `/${shared.map(escapeJsonPointerSegment).join('/')}`
    : '';
};

export const jsonPointersOverlap = (left: string, right: string): boolean =>
  left === right ||
  left === '' ||
  right === '' ||
  left.startsWith(`${right}/`) ||
  right.startsWith(`${left}/`);

type MutableRecord = Record<string, unknown>;

export const writeJsonPointer = (
  root: unknown,
  path: string,
  state: JsonValueState
): boolean => {
  const segments = parseJsonPointer(path);
  if (!segments || !segments.length || !isRecord(root)) return false;
  let parent: MutableRecord = root;
  for (const segment of segments.slice(0, -1)) {
    const child = parent[segment];
    if (!isRecord(child)) return false;
    parent = child;
  }
  const key = segments.at(-1)!;
  if (!state.present) {
    if (!Object.hasOwn(parent, key)) return false;
    delete parent[key];
    return true;
  }
  parent[key] = cloneJsonValue(state.value);
  return true;
};
