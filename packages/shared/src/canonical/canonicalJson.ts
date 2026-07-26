import { compareUnicodeCodePoints } from './codePointOrder.js';

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort(compareUnicodeCodePoints)) {
    const entry = record[key];
    // Match JSON.stringify: absent and explicitly-undefined keys are the same.
    if (entry === undefined) continue;
    result[key] = canonicalize(entry);
  }
  return result;
};

/**
 * Serializes a JSON-compatible value with object keys in code-point order, so
 * two structurally equal values always produce the same text regardless of
 * property insertion order.
 *
 * Use this instead of raw `JSON.stringify` whenever the text is compared,
 * hashed, or persisted — a plain stringify is key-order sensitive, which makes
 * a codec round-trip look like a divergence.
 */
export const canonicalJsonText = (value: unknown, space?: number): string =>
  JSON.stringify(canonicalize(value), null, space);

/** Structural equality via canonical serialization. */
export const sameCanonicalJson = (left: unknown, right: unknown): boolean =>
  canonicalJsonText(left) === canonicalJsonText(right);
