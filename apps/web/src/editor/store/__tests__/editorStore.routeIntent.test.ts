import { describe, expect, it } from 'vitest';
import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import { createRouteIntentCommand } from '@/editor/store/editorStore.routeCommands';
import { applyRouteIntentToState } from '@/editor/store/editorStore.routeIntent';
import type { RouteIntentState } from '@/editor/store/editorStore.routeIntent';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';

const createDocument = (
  id: string,
  path: string,
  type: WorkspaceDocumentRecord['type'] = 'pir-page'
): WorkspaceDocumentRecord => ({
  id,
  type,
  path,
  contentRev: 1,
  metaRev: 1,
  content: createDefaultPirDoc(),
});

const createState = (): RouteIntentState => ({
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [
        {
          id: 'route-home',
          index: true,
          pageDocId: 'page-home',
        },
        {
          id: 'route-about',
          segment: 'about',
          pageDocId: 'page-about',
          layoutDocId: 'layout-about',
          children: [
            {
              id: 'route-team',
              segment: 'team',
              pageDocId: 'page-team',
            },
          ],
        },
      ],
    },
  },
  workspaceDocumentsById: {
    'page-home': createDocument('page-home', '/pages/home.pir.json'),
    'page-about': createDocument('page-about', '/pages/about.pir.json'),
    'page-team': createDocument('page-team', '/pages/team.pir.json'),
    'layout-about': createDocument(
      'layout-about',
      '/layouts/about.pir.json',
      'pir-layout'
    ),
  },
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['doc-page-home', 'doc-page-about', 'doc-layout-about'],
    },
    'doc-page-home': {
      id: 'doc-page-home',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'doc-page-about': {
      id: 'doc-page-about',
      kind: 'doc',
      name: 'about.pir.json',
      parentId: 'root',
      docId: 'page-about',
    },
    'doc-layout-about': {
      id: 'doc-layout-about',
      kind: 'doc',
      name: 'about-layout.pir.json',
      parentId: 'root',
      docId: 'layout-about',
    },
    'doc-page-team': {
      id: 'doc-page-team',
      kind: 'doc',
      name: 'team.pir.json',
      parentId: 'root',
      docId: 'page-team',
    },
  },
  activeRouteNodeId: 'route-about',
  activeDocumentId: 'page-about',
  pirDoc: createDefaultPirDoc(),
});

describe('applyRouteIntentToState', () => {
  it('deletes route manifest nodes without deleting page or layout documents', () => {
    const result = applyRouteIntentToState(createState(), {
      type: 'delete-route',
      routeNodeId: 'route-about',
    });

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.routeManifest.root.children?.map((node) => node.id)).toEqual([
      'route-home',
    ]);
    expect(Object.keys(result.workspaceDocumentsById).sort()).toEqual([
      'layout-about',
      'page-about',
      'page-home',
      'page-team',
    ]);
    expect(result.treeById['doc-page-about']).toMatchObject({
      kind: 'doc',
      docId: 'page-about',
    });
    expect(result.treeById['doc-layout-about']).toMatchObject({
      kind: 'doc',
      docId: 'layout-about',
    });
    expect(result.activeRouteNodeId).toBe('route-home');
    expect(result.activeDocumentId).toBe('page-about');
  });

  it('creates index routes, renames segments, and moves nodes without moving documents', () => {
    const withIndex = applyRouteIntentToState(createState(), {
      type: 'create-index',
      parentRouteNodeId: 'route-about',
      routeNodeId: 'route-about-index',
      pageDocId: 'page-about-index',
    });
    expect(withIndex).not.toBeNull();
    if (!withIndex) return;

    const about = withIndex.routeManifest.root.children?.find(
      (node) => node.id === 'route-about'
    );
    expect(about?.children?.[0]).toMatchObject({
      id: 'route-about-index',
      index: true,
      pageDocId: 'page-about-index',
    });
    expect(withIndex.workspaceDocumentsById['page-about-index']).toMatchObject({
      path: '/pages/page-about-index.pir.json',
    });

    const renamed = applyRouteIntentToState(withIndex, {
      type: 'rename-segment',
      routeNodeId: 'route-team',
      segment: 'people',
    });
    expect(renamed).not.toBeNull();
    if (!renamed) return;
    expect(
      renamed.routeManifest.root.children
        ?.find((node) => node.id === 'route-about')
        ?.children?.find((node) => node.id === 'route-team')
    ).toMatchObject({ segment: 'people' });
    expect(renamed.workspaceDocumentsById['page-team'].path).toBe(
      '/pages/team.pir.json'
    );

    const moved = applyRouteIntentToState(renamed, {
      type: 'move-route',
      routeNodeId: 'route-team',
      parentRouteNodeId: 'root',
      index: 1,
    });
    expect(moved).not.toBeNull();
    if (!moved) return;
    expect(moved.routeManifest.root.children?.map((node) => node.id)).toEqual([
      'route-home',
      'route-team',
      'route-about',
    ]);
  });

  it('binds outlets, attaches layouts, detaches layouts, and sets runtime refs', () => {
    const bound = applyRouteIntentToState(createState(), {
      type: 'bind-outlet',
      routeNodeId: 'route-about',
      outletNodeId: 'outlet-main',
    });
    expect(bound?.routeManifest.root.children?.[1].outletNodeId).toBe(
      'outlet-main'
    );
    expect(
      bound
        ? applyRouteIntentToState(bound, {
            type: 'bind-outlet',
            routeNodeId: 'route-about',
            outletNodeId: 'outlet-main',
          })
        : null
    ).toBeNull();

    const rebound = bound
      ? applyRouteIntentToState(bound, {
          type: 'bind-outlet',
          routeNodeId: 'route-home',
          outletNodeId: 'outlet-main',
        })
      : null;
    expect(rebound?.routeManifest.root.children?.[0].outletNodeId).toBe(
      'outlet-main'
    );
    expect(rebound?.routeManifest.root.children?.[1].outletNodeId).toBe(
      undefined
    );

    const withRuntime = rebound
      ? applyRouteIntentToState(rebound, {
          type: 'set-runtime-ref',
          routeNodeId: 'route-about',
          kind: 'loader',
          reference: { artifactId: 'code-route-loader', exportName: 'loader' },
        })
      : null;
    expect(withRuntime?.routeManifest.root.children?.[1].runtime).toEqual({
      loaderRef: { artifactId: 'code-route-loader', exportName: 'loader' },
    });

    const detached = withRuntime
      ? applyRouteIntentToState(withRuntime, {
          type: 'detach-layout',
          routeNodeId: 'route-about',
        })
      : null;
    expect(detached?.routeManifest.root.children?.[1].layoutDocId).toBe(
      undefined
    );
    expect(detached?.workspaceDocumentsById['layout-about']).toBeDefined();

    const attached = detached
      ? applyRouteIntentToState(detached, {
          type: 'attach-layout',
          routeNodeId: 'route-home',
          layoutDocId: 'layout-home',
        })
      : null;
    expect(attached?.routeManifest.root.children?.[0].layoutDocId).toBe(
      'layout-home'
    );
    expect(attached?.workspaceDocumentsById['layout-home']).toMatchObject({
      type: 'pir-layout',
      path: '/layouts/layout-home.pir.json',
    });
  });

  it('creates route command envelopes for route intents', () => {
    const before = createState().routeManifest;
    const after = {
      ...before,
      root: {
        ...before.root,
        children: [{ id: 'route-home', index: true }],
      },
    };

    expect(
      createRouteIntentCommand({
        workspaceId: 'workspace-1',
        commandId: 'command-route-rename',
        issuedAt: '2026-07-02T00:00:00.000Z',
        intent: {
          type: 'rename-segment',
          routeNodeId: 'route-about',
          segment: 'company',
        },
        before,
        after,
      })
    ).toMatchObject({
      namespace: 'core.route',
      type: 'route.rename-segment',
      domainHint: 'route',
      target: { workspaceId: 'workspace-1', routeNodeId: 'route-about' },
      forwardOps: [{ op: 'replace', path: '/routeManifest', value: after }],
      reverseOps: [{ op: 'replace', path: '/routeManifest', value: before }],
    });
  });
});
