import { describe, expect, it } from 'vitest';
import {
  captureWorkspaceRevisions,
  diffWorkspaceRevisions,
  workspaceRevisionsEqual,
} from '..';
import { cloneWorkspace, createWorkspace } from './testWorkspace';

describe('workspace revisions', () => {
  it('captures only server counters and reports partition drift', () => {
    const base = createWorkspace();
    const current = cloneWorkspace(base);
    current.workspaceRev = 2;
    current.opSeq = 4;
    current.docsById['document-1']!.contentRev = 3;

    const expectedRevisions = captureWorkspaceRevisions(base);
    const currentRevisions = captureWorkspaceRevisions(current);

    expect(workspaceRevisionsEqual(expectedRevisions, currentRevisions)).toBe(
      false
    );
    expect(diffWorkspaceRevisions(expectedRevisions, currentRevisions)).toEqual(
      [
        { partition: 'workspace', expected: 1, current: 2 },
        {
          partition: 'document-content',
          documentId: 'document-1',
          expected: 1,
          current: 3,
        },
        { partition: 'operation-sequence', expected: 1, current: 4 },
      ]
    );
  });

  it('reports document creation and deletion without synthetic zero revisions', () => {
    const base = captureWorkspaceRevisions(createWorkspace());
    const withoutDocument = {
      ...base,
      documentRevs: {},
    };

    expect(diffWorkspaceRevisions(base, withoutDocument)).toEqual([
      {
        partition: 'document-content',
        documentId: 'document-1',
        expected: 1,
      },
      {
        partition: 'document-metadata',
        documentId: 'document-1',
        expected: 1,
      },
    ]);
  });
});
