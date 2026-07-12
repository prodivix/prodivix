import type {
  WorkspaceDocumentType,
  WorkspaceSnapshot,
} from '@prodivix/workspace';

export const createPirContent = () => ({
  version: '1.3' as const,
  ui: {
    graph: {
      version: 1 as const,
      rootId: 'root',
      nodesById: {
        root: { id: 'root', type: 'container' },
      },
      childIdsById: { root: [] },
    },
  },
  logic: {
    graphs: [
      {
        id: 'graph-main',
        name: 'Main',
        nodes: [
          { id: 'node-a', label: 'A', value: 1 },
          { id: 'node-b', label: 'B', value: 1 },
        ],
        edges: [
          {
            id: 'edge-a-b',
            source: 'node-a',
            target: 'node-b',
            label: 'next',
          },
        ],
      },
      { id: 'graph-secondary', name: 'Secondary', nodes: [], edges: [] },
    ],
  },
  animation: {
    version: 1 as const,
    timelines: [
      {
        id: 'timeline-main',
        name: 'Main',
        durationMs: 1000,
        bindings: [
          {
            id: 'binding-a',
            targetNodeId: 'root',
            tracks: [
              {
                id: 'track-opacity',
                kind: 'style' as const,
                property: 'opacity' as const,
                keyframes: [
                  { atMs: 0, value: 0 },
                  { atMs: 1000, value: 1 },
                ],
              },
              {
                id: 'track-color',
                kind: 'style' as const,
                property: 'color' as const,
                keyframes: [
                  { atMs: 0, value: '#000' },
                  { atMs: 1000, value: '#fff' },
                ],
              },
            ],
          },
          { id: 'binding-b', targetNodeId: 'root', tracks: [] },
        ],
      },
      {
        id: 'timeline-secondary',
        name: 'Secondary',
        durationMs: 500,
        bindings: [],
      },
    ],
  },
});

export const createWorkspace = (
  content: unknown = createPirContent(),
  type: WorkspaceDocumentType = 'pir-page'
): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'document-1',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['document-node'],
    },
    'document-node': {
      id: 'document-node',
      kind: 'doc',
      name: type === 'code' ? 'main.ts' : 'page.pir.json',
      parentId: 'root',
      docId: 'document-1',
    },
  },
  docsById: {
    'document-1': {
      id: 'document-1',
      type,
      path: type === 'code' ? '/main.ts' : '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      updatedAt: '2026-07-12T00:00:00.000Z',
      content,
    },
  },
  routeManifest: { version: '1', root: { id: 'root' } },
});

export const cloneWorkspace = (
  workspace: WorkspaceSnapshot
): WorkspaceSnapshot => structuredClone(workspace);
