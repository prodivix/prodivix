import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  isPirDocumentContent,
  resolveCanonicalWorkspaceDocumentId,
  selectActivePirDocument,
  selectDocumentPath,
  selectWorkspaceTree,
  type WorkspaceSnapshot,
} from '..';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['home-node'],
    },
    'home-node': {
      id: 'home-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root' },
  },
});

describe('workspace selectors', () => {
  it('selects active PIR content and derives VFS document paths', () => {
    const workspace = createWorkspace();

    expect(selectActivePirDocument(workspace)).toBe(
      workspace.docsById['page-home']
    );
    expect(selectDocumentPath(workspace, 'page-home')).toBe(
      '/pages/home.pir.json'
    );
    expect(selectWorkspaceTree(workspace)?.children[0]?.path).toBe('/pages');
  });

  it('does not treat legacy ui.root content as current PIR content', () => {
    expect(
      isPirDocumentContent({
        ui: {
          root: { id: 'root', type: 'container' },
        },
      })
    ).toBe(false);
  });

  it('returns no active PIR record for standalone graph documents', () => {
    const workspace = createWorkspace();
    workspace.docsById['page-home'] = {
      ...workspace.docsById['page-home'],
      type: 'pir-graph',
      content: { version: 1, nodes: [], edges: [] },
    };

    expect(selectActivePirDocument(workspace)).toBeUndefined();
  });

  it('prefers the canonical /pir.json page over legacy root paths', () => {
    expect(
      resolveCanonicalWorkspaceDocumentId([
        { id: 'legacy-root', type: 'pir-page', path: '/' },
        { id: 'nested', type: 'pir-page', path: '/pages/home.pir.json' },
        { id: 'canonical-root', type: 'pir-page', path: '/pir.json' },
      ])
    ).toBe('canonical-root');
  });
});
