import type { PIRDocument } from '@prodivix/shared/types/pir';
import {
  createDefaultPirDocument,
  normalizePirDocumentToCurrentSchema,
} from '@/pir/graph/normalize';
import {
  hasDirectPirShape,
  tryResolveFromWorkspaceShape,
} from './resolveWorkspaceShape';

export { resolveCanonicalWorkspaceDocumentId } from './resolveWorkspaceShape';

export const createDefaultPirDoc = (): PIRDocument =>
  createDefaultPirDocument();

export const normalizePirDocument = (source: unknown): PIRDocument =>
  normalizePirDocumentToCurrentSchema(source);

/**
 * Resolve an arbitrary input (already-normalized PIR, raw PIR with legacy
 * shape, or a workspace snapshot) into a current PIRDocument. The input is
 * dispatched to the most specific resolver: direct PIR shape wins; otherwise
 * try to extract the canonical document from a workspace snapshot; otherwise
 * fall back to running the normalizer over the raw payload.
 */
export const resolvePirDocument = (source: unknown): PIRDocument => {
  if (hasDirectPirShape(source)) {
    return normalizePirDocument(source);
  }
  const resolved = tryResolveFromWorkspaceShape(source);
  if (resolved) return resolved;
  return normalizePirDocument(source);
};
