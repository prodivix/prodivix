import type {
  WorkspaceCommandEnvelope,
  WorkspaceSnapshot,
} from '@prodivix/workspace';

export const issuedAt = '2026-07-12T00:00:00.000Z';

export const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 8,
  routeRev: 4,
  opSeq: 21,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['node-code'],
    },
    'node-code': {
      id: 'node-code',
      kind: 'doc',
      name: 'main.ts',
      parentId: 'root',
      docId: 'doc-code',
    },
  },
  docsById: {
    'doc-code': {
      id: 'doc-code',
      type: 'code',
      name: 'main.ts',
      path: '/main.ts',
      contentRev: 5,
      metaRev: 2,
      content: { language: 'ts', source: 'export const value = 1;' },
    },
  },
  routeManifest: { version: '1', root: { id: 'root' } },
  activeDocumentId: 'doc-code',
  activeRouteNodeId: 'root',
});

export const codeCommand = (
  id: string,
  before: string,
  after: string
): WorkspaceCommandEnvelope => ({
  id,
  namespace: 'core.code',
  type: 'source.update',
  version: '1.0',
  issuedAt,
  target: { workspaceId: 'workspace-1', documentId: 'doc-code' },
  domainHint: 'code',
  forwardOps: [{ op: 'replace', path: '/source', value: after }],
  reverseOps: [{ op: 'replace', path: '/source', value: before }],
});
