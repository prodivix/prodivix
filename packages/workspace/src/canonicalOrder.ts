/**
 * Locale-independent string ordering for canonical Workspace persistence.
 *
 * `String.prototype.localeCompare` resolves against the host ICU locale, so the
 * same input can order differently between a browser, a Node CI runner and the
 * Go backend. Canonical encode order decides persisted bytes and therefore every
 * downstream digest, idempotency key and conflict comparison, so it must be
 * derived from Unicode code points only.
 *
 * This mirrors `compareUnicodeCodePoints` from `@prodivix/shared/canonical`,
 * which is the repository-wide owner. `@prodivix/workspace` cannot depend on
 * `@prodivix/shared` yet, so this module is the single owner for the Workspace
 * kernel and for `@prodivix/workspace-sync` (which reaches it through the public
 * `@prodivix/workspace` entry point). Do not add further copies; once
 * `@prodivix/shared` is a declared dependency this file becomes a re-export.
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
