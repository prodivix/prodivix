import { compareUnicodeCodePoints } from './codePointOrder.js';

const collectKeys = (value: unknown, keys: Set<string>): void => {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectKeys(entry, keys);
  }
};

/**
 * Serializes a JSON-compatible value with object keys in code-point order, so
 * two structurally equal values always produce the same text regardless of
 * property insertion order.
 *
 * Use this instead of raw `JSON.stringify` whenever the text is compared,
 * hashed, or persisted — a plain stringify is key-order sensitive, which makes
 * a codec round-trip look like a divergence.
 *
 * The order is imposed through the replacer property list rather than by
 * rebuilding objects: ECMA-262 serializes an object's keys in property-list
 * order when one is given, which is the only way to control integer-like keys
 * — `{"10":1,"9":2}` enumerates numerically no matter the insertion order, so
 * a rebuilt object would silently serialize in JS enumeration order, which no
 * other runtime's canonical encoder would reproduce.
 */
export const canonicalJsonText = (value: unknown, space?: number): string => {
  const keys = new Set<string>();
  collectKeys(value, keys);
  return JSON.stringify(
    value,
    [...keys].sort(compareUnicodeCodePoints),
    space
  );
};

/** Structural equality via canonical serialization. */
export const sameCanonicalJson = (left: unknown, right: unknown): boolean =>
  canonicalJsonText(left) === canonicalJsonText(right);
