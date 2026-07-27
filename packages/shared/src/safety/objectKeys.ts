/**
 * Keys that mutate an object's prototype chain instead of adding an own
 * property. Any code path that assigns a caller-supplied name onto a plain
 * object — protocol decoding, props transforms, dynamic record building —
 * must reject these first, or a hostile name silently rewrites the prototype
 * every later lookup resolves through.
 *
 * Only `__proto__` belongs here, because only `__proto__` breaks that
 * invariant. `constructor` and `prototype` look dangerous but assign as
 * ordinary own properties, so listing them would reject authored payloads that
 * are merely unusual — an API parameter named `constructor` is legal. The
 * hazard those two carry is on *lookup*, not assignment, and the defence for
 * that is reading through `Object.prototype.hasOwnProperty.call` or checking
 * `isPlainObject` first, not a wider name blacklist.
 */
const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__']);

/** True when assigning `key` onto a plain object would not create an own property. */
export const isUnsafeObjectKey = (key: string): boolean =>
  UNSAFE_OBJECT_KEYS.has(key);

/** The rejected names, for diagnostics that need to name what is disallowed. */
export const unsafeObjectKeys = (): readonly string[] => [...UNSAFE_OBJECT_KEYS];

/**
 * True when `value` is a plain object safe to index: an own-property bag whose
 * prototype is `Object.prototype` or null. A decoded payload whose prototype is
 * anything else was built by something other than a JSON decoder.
 */
export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};
