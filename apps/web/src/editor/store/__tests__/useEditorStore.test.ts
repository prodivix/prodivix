import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@/editor/editorApi';
import { createPirDoc, resetEditorStore } from '@/test-utils/editorStore';
import { useEditorStore } from '@/editor/store/useEditorStore';

const createWorkspaceSnapshot = (
  workspaceId: string,
  documents: WorkspaceSnapshot['documents'],
  overrides: Partial<WorkspaceSnapshot> = {}
): WorkspaceSnapshot => ({
  id: workspaceId,
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  tree: {},
  routeManifest: {},
  activeRouteNodeId: undefined,
  documents,
  ...overrides,
});

const createDocumentContent = (nodeId: string) =>
  createPirDoc([{ id: nodeId, type: 'PdxText', text: nodeId }]);

describe('useEditorStore workspace state', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('resets capabilities when switching to another workspace snapshot', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot('ws-1', [
        {
          id: 'page-root',
          type: 'pir-page',
          path: '/',
          contentRev: 1,
          metaRev: 1,
          content: createDocumentContent('ws1-root'),
        },
      ])
    );
    store.setWorkspaceCapabilities('ws-1', {
      'core.pir.document.update@1.0': true,
    });
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot('ws-2', [
        {
          id: 'page-root-2',
          type: 'pir-page',
          path: '/',
          contentRev: 1,
          metaRev: 1,
          content: createDocumentContent('ws2-root'),
        },
      ])
    );

    const state = useEditorStore.getState();
    expect(state.workspaceId).toBe('ws-2');
    expect(state.workspaceCapabilitiesLoaded).toBe(false);
    expect(state.workspaceCapabilities).toEqual({});
  });

  it('prefers workspace activeRouteNodeId when it exists in routeManifest', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
        ],
        {
          routeManifest: {
            version: '1',
            root: {
              id: 'custom-root-id-ignored',
              children: [
                { id: 'route-home', index: true },
                { id: 'route-about', segment: 'about' },
              ],
            },
          },
          activeRouteNodeId: 'route-about',
        }
      )
    );

    const state = useEditorStore.getState();
    expect(state.routeManifest.root.id).toBe('root');
    expect(state.activeRouteNodeId).toBe('route-about');
  });

  it('falls back to first route when workspace activeRouteNodeId is invalid', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
        ],
        {
          routeManifest: {
            version: '1',
            root: {
              id: 'root',
              children: [{ id: 'route-home', index: true }],
            },
          },
          activeRouteNodeId: 'missing-route',
        }
      )
    );

    const state = useEditorStore.getState();
    expect(state.activeRouteNodeId).toBe('route-home');
  });

  it('normalizes workspace tree and drops unknown doc references', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
        ],
        {
          tree: {
            treeRootId: 'root-node',
            treeById: {
              'root-node': {
                id: 'root-node',
                kind: 'dir',
                name: 'root',
                parentId: null,
                children: ['doc-valid', 'doc-missing'],
              },
              'doc-valid': {
                id: 'doc-valid',
                kind: 'doc',
                name: 'home',
                parentId: 'root-node',
                docId: 'page-root',
              },
              'doc-missing': {
                id: 'doc-missing',
                kind: 'doc',
                name: 'ghost',
                parentId: 'root-node',
                docId: 'not-found',
              },
            },
          },
        }
      )
    );

    const state = useEditorStore.getState();
    expect(state.treeRootId).toBe('root-node');
    expect(state.treeById['doc-valid']?.docId).toBe('page-root');
    expect(state.treeById['doc-missing']).toBeUndefined();
  });

  it('preserves code document content without normalizing it as PIR', () => {
    const store = useEditorStore.getState();
    const previousPirDoc = store.pirDoc;
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/pages/home.pir.json',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
          {
            id: 'code-open-dialog',
            type: 'code',
            path: '/src/openDialog.ts',
            contentRev: 1,
            metaRev: 1,
            content: {
              language: 'ts',
              source: 'export function openDialog() {}',
            },
          },
        ],
        {
          tree: {
            treeRootId: 'root',
            treeById: {
              root: {
                id: 'root',
                kind: 'dir',
                name: '/',
                parentId: null,
                children: ['pages', 'src'],
              },
              pages: {
                id: 'pages',
                kind: 'dir',
                name: 'pages',
                parentId: 'root',
                children: ['page-root-node'],
              },
              'page-root-node': {
                id: 'page-root-node',
                kind: 'doc',
                name: 'home.pir.json',
                parentId: 'pages',
                docId: 'page-root',
              },
              src: {
                id: 'src',
                kind: 'dir',
                name: 'src',
                parentId: 'root',
                children: ['code-open-dialog-node'],
              },
              'code-open-dialog-node': {
                id: 'code-open-dialog-node',
                kind: 'doc',
                name: 'openDialog.ts',
                parentId: 'src',
                docId: 'code-open-dialog',
              },
            },
          },
        }
      )
    );

    store.setActiveDocumentId('code-open-dialog');

    const state = useEditorStore.getState();
    expect(state.workspaceDocumentsById['code-open-dialog']?.content).toEqual({
      language: 'ts',
      source: 'export function openDialog() {}',
    });
    expect(state.activeDocumentId).toBe('code-open-dialog');
    expect(state.pirDoc).not.toHaveProperty('language');
    expect(previousPirDoc).not.toBe(state.pirDoc);
  });

  it('does not choose a code document as the active PIR document', () => {
    const store = useEditorStore.getState();
    const previousPirDoc = store.pirDoc;
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot('ws-1', [
        {
          id: 'code-open-dialog',
          type: 'code',
          path: '/src/openDialog.ts',
          contentRev: 1,
          metaRev: 1,
          content: {
            language: 'ts',
            source: 'export function openDialog() {}',
          },
        },
      ])
    );

    const state = useEditorStore.getState();
    expect(state.activeDocumentId).toBeUndefined();
    expect(state.workspaceDocumentsById['code-open-dialog']?.content).toEqual({
      language: 'ts',
      source: 'export function openDialog() {}',
    });
    expect(state.pirDoc).toBe(previousPirDoc);
  });

  it('creates fallback workspace tree when snapshot tree is unavailable', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot('ws-1', [
        {
          id: 'page-root',
          type: 'pir-page',
          path: '/',
          contentRev: 1,
          metaRev: 1,
          content: createDocumentContent('root'),
        },
      ])
    );

    const state = useEditorStore.getState();
    expect(state.treeRootId).toBe('root');
    expect(state.treeById.root?.kind).toBe('dir');
    expect(state.treeById['doc-page-root']?.docId).toBe('page-root');
  });

  it('applies create-child-route intent and links document + tree', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
        ],
        {
          routeManifest: {
            version: '1',
            root: { id: 'root', children: [{ id: 'route-home', index: true }] },
          },
          activeRouteNodeId: 'route-home',
        }
      )
    );

    store.applyRouteIntent({
      type: 'create-child-route',
      parentRouteNodeId: 'route-home',
      segment: 'about',
      routeNodeId: 'route-about',
      pageDocId: 'page-about',
    });

    const state = useEditorStore.getState();
    const home = state.routeManifest.root.children?.find(
      (node) => node.id === 'route-home'
    );
    const about = home?.children?.find((node) => node.id === 'route-about');
    expect(about?.pageDocId).toBe('page-about');
    expect(state.workspaceDocumentsById['page-about']?.type).toBe('pir-page');
    expect(state.treeById['doc-page-about']?.docId).toBe('page-about');
    expect(state.activeRouteNodeId).toBe('route-about');
  });

  it('applies split-layout intent and writes layout document', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
        ],
        {
          routeManifest: {
            version: '1',
            root: { id: 'root', children: [{ id: 'route-home', index: true }] },
          },
        }
      )
    );

    store.applyRouteIntent({
      type: 'split-layout',
      routeNodeId: 'route-home',
      layoutDocId: 'layout-root',
    });

    const state = useEditorStore.getState();
    const home = state.routeManifest.root.children?.find(
      (node) => node.id === 'route-home'
    );
    expect(home?.layoutDocId).toBe('layout-root');
    expect(state.workspaceDocumentsById['layout-root']?.type).toBe(
      'pir-layout'
    );
    expect(state.treeById['doc-layout-root']?.docId).toBe('layout-root');
  });

  it('applies delete-route intent and removes unreferenced route docs', () => {
    const store = useEditorStore.getState();
    store.setWorkspaceSnapshot(
      createWorkspaceSnapshot(
        'ws-1',
        [
          {
            id: 'page-root',
            type: 'pir-page',
            path: '/',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('root'),
          },
          {
            id: 'page-about',
            type: 'pir-page',
            path: '/about',
            contentRev: 1,
            metaRev: 1,
            content: createDocumentContent('about'),
          },
        ],
        {
          routeManifest: {
            version: '1',
            root: {
              id: 'root',
              children: [
                { id: 'route-home', index: true, pageDocId: 'page-root' },
                {
                  id: 'route-about',
                  segment: 'about',
                  pageDocId: 'page-about',
                },
              ],
            },
          },
          activeRouteNodeId: 'route-about',
        }
      )
    );

    store.applyRouteIntent({
      type: 'delete-route',
      routeNodeId: 'route-about',
    });

    const state = useEditorStore.getState();
    expect(
      state.routeManifest.root.children?.some(
        (node) => node.id === 'route-about'
      )
    ).toBe(false);
    expect(state.workspaceDocumentsById['page-about']).toBeUndefined();
    expect(state.treeById['doc-page-about']).toBeUndefined();
  });

  it('patches runtime state by project without mutating pirDoc', () => {
    const store = useEditorStore.getState();
    const previousPirDoc = store.pirDoc;

    store.patchRuntimeState('project-a', { products: [{ id: 'p-1' }] });
    store.patchRuntimeState('project-a', { selected: 'p-1' });

    const state = useEditorStore.getState();
    expect(state.runtimeStateByProject['project-a']).toEqual({
      products: [{ id: 'p-1' }],
      selected: 'p-1',
    });
    expect(state.pirDoc).toBe(previousPirDoc);
  });

  it('resets runtime state for one project or all projects', () => {
    const store = useEditorStore.getState();

    store.patchRuntimeState('project-a', { count: 1 });
    store.patchRuntimeState('project-b', { count: 2 });
    store.resetRuntimeState('project-a');
    expect(useEditorStore.getState().runtimeStateByProject['project-a']).toBe(
      undefined
    );
    expect(
      useEditorStore.getState().runtimeStateByProject['project-b']
    ).toEqual({ count: 2 });

    store.resetRuntimeState();
    expect(useEditorStore.getState().runtimeStateByProject).toEqual({});
  });
});
