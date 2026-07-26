/**
 * Locale-independent string ordering for canonical serialization, persisted
 * bytes, and cross-process identity.
 *
 * `String.prototype.localeCompare` resolves against the host ICU locale, so the
 * same input can order differently between a browser, a Node CI runner, and the
 * Go backend. Anything that feeds a digest, a stored byte sequence, or an
 * idempotency key must use this comparator instead.
 */
export const compareUnicodeCodePoints = (
  left: string,
  right: string
): number => {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]! - rightPoints[index]!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
};
