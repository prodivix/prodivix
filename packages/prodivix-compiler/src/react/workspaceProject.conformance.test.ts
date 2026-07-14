import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { compileWorkspaceToExportProgram } from './workspaceProject';

const workspace: WorkspaceSnapshot = {
  id: 'standalone-domain-export',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'graph-node', 'animation-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
    'graph-node': {
      id: 'graph-node',
      kind: 'doc',
      name: 'main.pir-graph.json',
      parentId: 'root',
      docId: 'graph-main',
    },
    'animation-node': {
      id: 'animation-node',
      kind: 'doc',
      name: 'main.pir-animation.json',
      parentId: 'root',
      docId: 'animation-main',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'graph-main': {
      id: 'graph-main',
      type: 'pir-graph',
      path: '/main.pir-graph.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        nodes: [{ id: 'start', data: { kind: 'start' } }],
        edges: [],
      },
    },
    'animation-main': {
      id: 'animation-main',
      type: 'pir-animation',
      path: '/main.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: 1,
        target: { kind: 'pir-document', documentId: 'page' },
        timelines: [
          {
            id: 'timeline-main',
            name: 'Main',
            durationMs: 300,
            bindings: [],
          },
        ],
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page' },
  },
};

describe('standalone domain export conformance', () => {
  it('compiles NodeGraph and Animation documents into the Workspace program', () => {
    const program = compileWorkspaceToExportProgram(workspace);

    expect(program.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'nodegraph:graph-main',
        'animation:animation-main:timeline-main',
      ])
    );
    expect(program.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'WKS-EXPORT-DOCUMENT-UNSUPPORTED' })
    );
  });
});
