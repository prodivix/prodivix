/**
 * Canonical encode order decides persisted bytes and therefore every
 * downstream digest, idempotency key and conflict comparison. The comparator
 * itself is owned by `@prodivix/shared/canonical`; this module only gives the
 * Workspace kernel and `@prodivix/workspace-sync` (which reaches it through
 * the public entry point) a stable import site.
 */
export { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
