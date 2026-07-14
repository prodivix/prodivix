import type {
  WorkspaceDocumentType,
  WorkspaceSnapshot,
} from '@prodivix/workspace';

export const createPirContent = () => ({
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element' as const, type: 'container' },
      },
      childIdsById: { root: [] },
      order: { strategy: 'childIdsById' as const },
    },
  },
});

export const createNodeGraphContent = () => ({
  version: 1 as const,
  nodes: [
    { id: 'node-a', data: { label: 'A', value: 1 } },
    { id: 'node-b', data: { label: 'B', value: 1 } },
  ],
  edges: [
    {
      id: 'edge-a-b',
      source: 'node-a',
      target: 'node-b',
      sourceHandle: 'next',
    },
  ],
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
      name:
        type === 'code'
          ? 'main.ts'
          : type === 'pir-graph'
            ? 'main.pir-graph.json'
            : 'page.pir.json',
      parentId: 'root',
      docId: 'document-1',
    },
  },
  docsById: {
    'document-1': {
      id: 'document-1',
      type,
      path:
        type === 'code'
          ? '/main.ts'
          : type === 'pir-graph'
            ? '/main.pir-graph.json'
            : '/page.pir.json',
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
