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
  version: 2 as const,
  nodes: [
    {
      id: 'node-a',
      descriptorRef: { id: 'core.process', version: '1' },
      ports: [
        {
          id: 'in.control.prev',
          direction: 'input' as const,
          flow: 'control' as const,
          required: false,
          cardinality: 'single' as const,
        },
        {
          id: 'out.control.next',
          direction: 'output' as const,
          flow: 'control' as const,
          required: false,
          cardinality: 'single' as const,
        },
      ],
      configuration: { label: 'A', value: 1 },
      editor: {},
    },
    {
      id: 'node-b',
      descriptorRef: { id: 'core.process', version: '1' },
      ports: [
        {
          id: 'in.control.prev',
          direction: 'input' as const,
          flow: 'control' as const,
          required: false,
          cardinality: 'single' as const,
        },
        {
          id: 'out.control.next',
          direction: 'output' as const,
          flow: 'control' as const,
          required: false,
          cardinality: 'single' as const,
        },
      ],
      configuration: { label: 'B', value: 1 },
      editor: {},
    },
  ],
  edges: [
    {
      id: 'edge-a-b',
      source: { nodeId: 'node-a', portId: 'out.control.next' },
      target: { nodeId: 'node-b', portId: 'in.control.prev' },
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
