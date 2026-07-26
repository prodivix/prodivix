/**
 * Keys that mutate an object's prototype chain instead of adding an own
 * property. Any code path that assigns a caller-supplied name onto a plain
 * object — protocol decoding, props transforms, dynamic record building —
 * must reject these first, or a hostile name silently rewrites the prototype
 * every later lookup resolves through.
 *
 * `__proto__` is the only name that triggers the accessor on assignment.
 * `constructor` and `prototype` are included because the same call sites reach
 * `Function.prototype` through them once a value is walked, and no legitimate
 * authored payload needs either as a record key.
 */
const UNSAFE_OBJECT_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

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
