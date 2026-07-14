import type { SemanticWorkspaceRevisions } from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '../types';

const compareDocumentIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Captures the canonical Workspace partitions consumed by every semantic
 * provider. The returned value contains server-owned revisions only; the
 * composition root supplies the semantic schema and provider-set identity.
 */
export const captureWorkspaceSemanticRevisions = (
  snapshot: WorkspaceSnapshot
): SemanticWorkspaceRevisions =>
  Object.freeze({
    workspaceId: snapshot.id,
    workspaceRev: snapshot.workspaceRev,
    routeRev: snapshot.routeRev,
    opSeq: snapshot.opSeq,
    documentRevs: Object.freeze(
      Object.fromEntries(
        Object.entries(snapshot.docsById)
          .sort(([left], [right]) => compareDocumentIds(left, right))
          .map(([documentId, document]) => [
            documentId,
            Object.freeze({
              contentRev: document.contentRev,
              metaRev: document.metaRev,
            }),
          ])
      )
    ),
  });
