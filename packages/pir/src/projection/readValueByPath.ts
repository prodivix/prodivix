type UnknownRecord = Readonly<Record<string, unknown>>;

const PATH_SEGMENT_PATTERN = /[^.[\]]+|\[(\d+)\]/g;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a projected runtime value without importing legacy PIR references. */
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
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
};
