import type { WorkspaceSnapshot } from '@prodivix/workspace';

export type WorkspaceDocumentRevisions = {
  contentRev: number;
  metaRev: number;
};

export type WorkspaceRevisions = {
  workspaceRev: number;
  routeRev: number;
  documentRevs: Record<string, WorkspaceDocumentRevisions>;
  opSeq: number;
};

export type WorkspaceRevisionDifference =
  | {
      partition: 'workspace' | 'route' | 'operation-sequence';
      expected: number;
      current: number;
    }
  | {
      partition: 'document-content' | 'document-metadata';
      documentId: string;
      expected?: number;
      current?: number;
    };

/** Captures only server-owned optimistic concurrency counters from a snapshot. */
export const captureWorkspaceRevisions = (
  snapshot: WorkspaceSnapshot
): WorkspaceRevisions => ({
  workspaceRev: snapshot.workspaceRev,
  routeRev: snapshot.routeRev,
  documentRevs: Object.fromEntries(
    Object.entries(snapshot.docsById).map(([documentId, document]) => [
      documentId,
      {
        contentRev: document.contentRev,
        metaRev: document.metaRev,
      },
    ])
  ),
  opSeq: snapshot.opSeq,
});

/** Reports server-owned counter drift without interpreting authoring content. */
export const diffWorkspaceRevisions = (
  expected: WorkspaceRevisions,
  current: WorkspaceRevisions
): WorkspaceRevisionDifference[] => {
  const differences: WorkspaceRevisionDifference[] = [];
  if (expected.workspaceRev !== current.workspaceRev) {
    differences.push({
      partition: 'workspace',
      expected: expected.workspaceRev,
      current: current.workspaceRev,
    });
  }
  if (expected.routeRev !== current.routeRev) {
    differences.push({
      partition: 'route',
      expected: expected.routeRev,
      current: current.routeRev,
    });
  }
  const documentIds = new Set([
    ...Object.keys(expected.documentRevs),
    ...Object.keys(current.documentRevs),
  ]);
  [...documentIds].sort().forEach((documentId) => {
    const expectedDocument = expected.documentRevs[documentId];
    const currentDocument = current.documentRevs[documentId];
    if (expectedDocument?.contentRev !== currentDocument?.contentRev) {
      differences.push({
        partition: 'document-content',
        documentId,
        ...(expectedDocument ? { expected: expectedDocument.contentRev } : {}),
        ...(currentDocument ? { current: currentDocument.contentRev } : {}),
      });
    }
    if (expectedDocument?.metaRev !== currentDocument?.metaRev) {
      differences.push({
        partition: 'document-metadata',
        documentId,
        ...(expectedDocument ? { expected: expectedDocument.metaRev } : {}),
        ...(currentDocument ? { current: currentDocument.metaRev } : {}),
      });
    }
  });
  if (expected.opSeq !== current.opSeq) {
    differences.push({
      partition: 'operation-sequence',
      expected: expected.opSeq,
      current: current.opSeq,
    });
  }
  return differences;
};

export const workspaceRevisionsEqual = (
  left: WorkspaceRevisions,
  right: WorkspaceRevisions
): boolean => diffWorkspaceRevisions(left, right).length === 0;
