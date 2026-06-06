import type { PIRDocument } from '@/core/types/engine.types';
import {
  createDefaultPirDocV13,
  normalizePirDocumentToV13,
} from '@/pir/graph/normalize';
import {
  hasDirectPirShape,
  tryResolveFromWorkspaceShape,
} from './resolveWorkspaceShape';

export { resolveCanonicalWorkspaceDocumentId } from './resolveWorkspaceShape';

export const createDefaultPirDoc = (): PIRDocument => createDefaultPirDocV13();

export const normalizePirToV13 = (source: unknown): PIRDocument =>
  normalizePirDocumentToV13(source);

export const normalizePirDocument = normalizePirToV13;

/**
 * Resolve an arbitrary input (already-normalized PIR, raw PIR with legacy
 * shape, or a workspace snapshot) into a v1.3 PIRDocument. The input is
 * dispatched to the most specific resolver: direct PIR shape wins; otherwise
 * try to extract the canonical document from a workspace snapshot; otherwise
 * fall back to running the normalizer over the raw payload.
 */
export const resolvePirDocument = (source: unknown): PIRDocument => {
  if (hasDirectPirShape(source)) {
    return normalizePirToV13(source);
  }
  const resolved = tryResolveFromWorkspaceShape(source);
  if (resolved) return resolved;
  return normalizePirToV13(source);
};
