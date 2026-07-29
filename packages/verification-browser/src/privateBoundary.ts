import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const BROWSER_PRIVATE_PAYLOAD_LIMITS = Object.freeze({
  maximumInputBytes: 1_048_576,
  maximumDepth: 24,
  maximumNodes: 24_000,
  maximumObjectKeys: 64,
  maximumArrayEntries: 4_096,
  maximumStringCharacters: 4_096,
  maximumIdentifierCharacters: 256,
  maximumDiagnosticCodes: 32,
  maximumChecks: 2_048,
  maximumAccessibilityRules: 512,
  maximumAccessibilityNodesPerRule: 32,
  maximumJourneySteps: 256,
  maximumPerformanceSamples: 100,
  maximumMetricsPerSample: 32,
  maximumSecurityChecks: 32,
  maximumVisualPixels: 16_777_216,
  maximumVisualMasks: 128,
} as const);

export type BrowserPrivatePayloadErrorCode =
  | 'input-too-large'
  | 'invalid-json'
  | 'unsafe-value'
  | 'unknown-field'
  | 'missing-field'
  | 'invalid-field'
  | 'duplicate-identity'
  | 'budget-exceeded'
  | 'partial-result'
  | 'result-drift';

export class BrowserPrivatePayloadError extends Error {
  readonly code: BrowserPrivatePayloadErrorCode;
  readonly path: string;

  constructor(
    code: BrowserPrivatePayloadErrorCode,
    path: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'BrowserPrivatePayloadError';
    this.code = code;
    this.path = path;
  }
}

const fail = (
  code: BrowserPrivatePayloadErrorCode,
  path: string,
  message: string
): never => {
  throw new BrowserPrivatePayloadError(code, path, message);
};

const plainObject = (
  value: unknown,
  path: string
): Readonly<Record<string, unknown>> => {
  try {
    if (isPlainObject(value)) return value;
  } catch {
    // A hostile Proxy can throw while its prototype is inspected.
  }
  return fail(
    'unsafe-value',
    path,
    'Private browser payload objects must have a plain or null prototype.'
  );
};

const ownDataProperty = (
  value: object,
  key: string,
  path: string,
  enumerable: boolean
): unknown => {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload property descriptors must be inspectable.'
    );
  }
  if (
    descriptor === undefined ||
    descriptor.enumerable !== enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload properties must be enumerable data properties.'
    );
  }
  return descriptor.value;
};

const ownKeys = (value: object, path: string): readonly string[] => {
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload keys must be inspectable.'
    );
  }
  if (keys.some((key) => typeof key === 'symbol')) {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload cannot contain symbol-keyed properties.'
    );
  }
  return keys as readonly string[];
};

const denseArrayEntries = (
  value: readonly unknown[],
  path: string
): readonly unknown[] => {
  const keys = ownKeys(value, path);
  const allowed = new Set<string>(['length']);
  const entries: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowed.add(key);
    entries.push(ownDataProperty(value, key, `${path}[${index}]`, true));
  }
  if (keys.some((key) => !allowed.has(key))) {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload arrays cannot contain holes or extra properties.'
    );
  }
  ownDataProperty(value, 'length', `${path}.length`, false);
  return entries;
};

const measureJsonTree = (
  value: unknown,
  path: string,
  depth: number,
  seen: Set<object>,
  budget: { nodes: number; textBytes: number }
): void => {
  budget.nodes += 1;
  if (budget.nodes > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumNodes) {
    fail(
      'budget-exceeded',
      path,
      `Private browser payload exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumNodes} node limit.`
    );
  }
  if (depth > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumDepth) {
    fail(
      'budget-exceeded',
      path,
      `Private browser payload exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumDepth} level depth limit.`
    );
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    if (
      typeof value === 'string' &&
      value.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumStringCharacters
    ) {
      fail(
        'budget-exceeded',
        path,
        `String exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumStringCharacters} character limit.`
      );
    }
    if (typeof value === 'string') {
      budget.textBytes += new TextEncoder().encode(value).byteLength;
      if (budget.textBytes > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes) {
        fail(
          'budget-exceeded',
          path,
          `Private browser payload text exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes} byte aggregate limit.`
        );
      }
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(
        'unsafe-value',
        path,
        'Private browser payload numbers must be finite and cannot be negative zero.'
      );
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload must contain JSON-compatible values only.'
    );
  }
  if (seen.has(value)) {
    return fail(
      'unsafe-value',
      path,
      'Private browser payload cannot contain object cycles.'
    );
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumArrayEntries) {
      fail(
        'budget-exceeded',
        path,
        `Array exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumArrayEntries} entry limit.`
      );
    }
    denseArrayEntries(value, path).forEach((entry, index) =>
      measureJsonTree(entry, `${path}[${index}]`, depth + 1, seen, budget)
    );
    seen.delete(value);
    return;
  }
  const record = plainObject(value, path);
  const keys = ownKeys(record, path);
  if (keys.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumObjectKeys) {
    fail(
      'budget-exceeded',
      path,
      `Object exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumObjectKeys} key limit.`
    );
  }
  for (const key of keys) {
    budget.textBytes += new TextEncoder().encode(key).byteLength;
    if (budget.textBytes > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes) {
      fail(
        'budget-exceeded',
        path,
        `Private browser payload text exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes} byte aggregate limit.`
      );
    }
    if (isUnsafeObjectKey(key)) {
      fail(
        'unsafe-value',
        `${path}.${key}`,
        `Private browser payload contains the unsafe object key "${key}".`
      );
    }
    measureJsonTree(
      ownDataProperty(record, key, `${path}.${key}`, true),
      `${path}.${key}`,
      depth + 1,
      seen,
      budget
    );
  }
  seen.delete(record);
};

export const decodePrivateJson = (
  source: string | Uint8Array | unknown,
  label: string
): unknown => {
  let value = source;
  if (typeof source === 'string' || source instanceof Uint8Array) {
    if (
      typeof source === 'string' &&
      source.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes
    ) {
      fail(
        'input-too-large',
        '$',
        `${label} exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes} byte input limit.`
      );
    }
    const bytes =
      typeof source === 'string' ? new TextEncoder().encode(source) : source;
    if (bytes.byteLength > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes) {
      fail(
        'input-too-large',
        '$',
        `${label} exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes} byte input limit.`
      );
    }
    let text: string;
    try {
      text =
        typeof source === 'string'
          ? source
          : new TextDecoder('utf-8', { fatal: true }).decode(source);
    } catch (error) {
      throw new BrowserPrivatePayloadError(
        'invalid-json',
        '$',
        `${label} is not valid UTF-8.`,
        { cause: error }
      );
    }
    try {
      value = JSON.parse(text) as unknown;
    } catch (error) {
      throw new BrowserPrivatePayloadError(
        'invalid-json',
        '$',
        `${label} is not valid JSON.`,
        { cause: error }
      );
    }
  }
  measureJsonTree(value, '$', 0, new Set<object>(), {
    nodes: 0,
    textBytes: 0,
  });
  return value;
};

export const strictObject = (
  value: unknown,
  path: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Readonly<Record<string, unknown>> => {
  const record = plainObject(value, path);
  const keys = ownKeys(record, path);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of keys) {
    ownDataProperty(record, key, `${path}.${key}`, true);
    if (isUnsafeObjectKey(key)) {
      return fail(
        'unsafe-value',
        `${path}.${key}`,
        `${path} contains the unsafe object key "${key}".`
      );
    }
    if (!allowed.has(key)) {
      return fail(
        'unknown-field',
        `${path}.${key}`,
        `${path} contains the unknown field "${key}".`
      );
    }
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      return fail(
        'missing-field',
        `${path}.${key}`,
        `${path} is missing the required field "${key}".`
      );
    }
  }
  return record;
};

export const strictArray = (
  value: unknown,
  path: string,
  maximumEntries: number = BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumArrayEntries
): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return fail('invalid-field', path, `${path} must be an array.`);
  }
  if (value.length > maximumEntries) {
    return fail(
      'budget-exceeded',
      path,
      `${path} exceeds the ${maximumEntries} entry limit.`
    );
  }
  return denseArrayEntries(value, path);
};

export const strictString = (
  value: unknown,
  path: string,
  maximumCharacters: number = BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumStringCharacters
): string => {
  const containsControlCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    });
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumCharacters ||
    value.trim() !== value ||
    value.normalize('NFC') !== value ||
    containsControlCharacter
  ) {
    return fail(
      'invalid-field',
      path,
      `${path} must be a non-empty, trimmed string of at most ${maximumCharacters} characters.`
    );
  }
  return value;
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u;

export const strictIdentifier = (value: unknown, path: string): string => {
  const result = strictString(
    value,
    path,
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumIdentifierCharacters
  );
  if (!IDENTIFIER_PATTERN.test(result)) {
    return fail(
      'invalid-field',
      path,
      `${path} must contain only stable identifier characters.`
    );
  }
  return result;
};

export const strictEnum = <T extends string>(
  value: unknown,
  path: string,
  values: readonly T[]
): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    return fail(
      'invalid-field',
      path,
      `${path} must be one of: ${values.join(', ')}.`
    );
  }
  return value as T;
};

export const strictBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    return fail('invalid-field', path, `${path} must be a boolean.`);
  }
  return value;
};

export const strictFiniteNumber = (
  value: unknown,
  path: string,
  options: Readonly<{ minimum?: number; maximum?: number }> = {}
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Object.is(value, -0) ||
    (options.minimum !== undefined && value < options.minimum) ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    return fail(
      'invalid-field',
      path,
      `${path} must be a finite number within its declared bounds.`
    );
  }
  return value;
};

export const strictSafeInteger = (
  value: unknown,
  path: string,
  options: Readonly<{ minimum?: number; maximum?: number }> = {}
): number => {
  const result = strictFiniteNumber(value, path, options);
  if (!Number.isSafeInteger(result)) {
    return fail('invalid-field', path, `${path} must be a safe integer.`);
  }
  return result;
};

const SHA256_PATTERN = /^sha256-[0-9a-f]{64}$/u;

export const strictSha256Digest = (value: unknown, path: string): string => {
  const digest = strictString(value, path, 71);
  if (!SHA256_PATTERN.test(digest)) {
    return fail(
      'invalid-field',
      path,
      `${path} must be a lowercase sha256 digest.`
    );
  }
  return digest;
};

export const strictDiagnosticCodes = (
  value: unknown,
  path: string
): readonly string[] => {
  const entries = strictArray(
    value,
    path,
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumDiagnosticCodes
  ).map((entry, index) => strictIdentifier(entry, `${path}[${index}]`));
  return uniqueSorted(entries, path);
};

export const uniqueSorted = (
  values: readonly string[],
  path: string
): readonly string[] => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      return fail(
        'duplicate-identity',
        path,
        `${path} contains duplicate identity "${value}".`
      );
    }
    seen.add(value);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

export const assertUniqueIdentities = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  path: string
): void => {
  const seen = new Set<string>();
  for (const value of values) {
    const id = identity(value);
    if (seen.has(id)) {
      fail(
        'duplicate-identity',
        path,
        `${path} contains duplicate identity "${id}".`
      );
    }
    seen.add(id);
  }
};

export const throwPartial = (path: string, message: string): never =>
  fail('partial-result', path, message);

export const throwDrift = (path: string, message: string): never =>
  fail('result-drift', path, message);
