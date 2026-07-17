export const decodeRemoteExecutionTerminalExactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Remote Terminal value must be an object.');
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => record[key] === undefined) ||
    Object.keys(record).some((key) => !allowed.has(key))
  )
    throw new TypeError('Remote Terminal value has an invalid shape.');
  return record;
};

export const decodeRemoteExecutionTerminalText = (
  value: unknown,
  label: string,
  maximum = 4_096
): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > maximum
  )
    throw new TypeError(`${label} is invalid.`);
  return value;
};

export const decodeRemoteExecutionTerminalInteger = (
  value: unknown,
  label: string,
  minimum = 0
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} is invalid.`);
  return value as number;
};

export const decodeRemoteExecutionTerminalFinite = (
  value: unknown,
  label: string
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${label} is invalid.`);
  return value;
};

export const decodeRemoteExecutionTerminalBoolean = (
  value: unknown,
  label: string
): boolean => {
  if (typeof value !== 'boolean') throw new TypeError(`${label} is invalid.`);
  return value;
};
