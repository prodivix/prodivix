import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import {
  isPirDocumentContent,
  selectActivePirDocument,
  selectDocumentPath,
  selectWorkspaceTree,
  type StableWorkspaceSnapshot,
} from '..';

const createWorkspace = (): StableWorkspaceSnapshot => ({
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
      content: createDefaultPirDoc(),
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
      workspace.docsById['page-home'].content
    );
    expect(selectDocumentPath(workspace, 'page-home')).toBe(
      '/pages/home.pir.json'
    );
    expect(selectWorkspaceTree(workspace)?.children[0]?.path).toBe('/pages');
  });

  it('does not treat legacy ui.root content as PIR v1.3 content', () => {
    expect(
      isPirDocumentContent({
        version: '1.3',
        ui: {
          root: { id: 'root', type: 'container' },
        },
      })
    ).toBe(false);
  });
});
