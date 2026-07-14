import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceRouteIntentPlan,
  type WorkspaceSnapshot,
} from '..';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 9,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages', 'layouts'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['doc-page-home', 'doc-page-about', 'doc-page-team'],
    },
    layouts: {
      id: 'layouts',
      kind: 'dir',
      name: 'layouts',
      parentId: 'root',
      children: ['doc-layout-about'],
    },
    'doc-page-home': {
      id: 'doc-page-home',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
    'doc-page-about': {
      id: 'doc-page-about',
      kind: 'doc',
      name: 'about.pir.json',
      parentId: 'pages',
      docId: 'page-about',
    },
    'doc-page-team': {
      id: 'doc-page-team',
      kind: 'doc',
      name: 'team.pir.json',
      parentId: 'pages',
      docId: 'page-team',
    },
    'doc-layout-about': {
      id: 'doc-layout-about',
      kind: 'doc',
      name: 'about.pir.json',
      parentId: 'layouts',
      docId: 'layout-about',
    },
  },
  docsById: Object.fromEntries(
    [
      ['page-home', 'pir-page', '/pages/home.pir.json'],
      ['page-about', 'pir-page', '/pages/about.pir.json'],
      ['page-team', 'pir-page', '/pages/team.pir.json'],
      ['layout-about', 'pir-layout', '/layouts/about.pir.json'],
    ].map(([id, type, path]) => [
      id,
      {
        id,
        type,
        path,
        contentRev: 1,
        metaRev: 1,
        content: createEmptyPirDocument(),
      },
    ])
  ) as WorkspaceSnapshot['docsById'],
  routeManifest: {
    version: '1',
    root: {
      id: 'route-root',
      children: [
        { id: 'route-home', index: true, pageDocId: 'page-home' },
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
  activeRouteNodeId: 'route-about',
  activeDocumentId: 'page-about',
});

const applyPlan = (
  workspace: WorkspaceSnapshot,
  plan: NonNullable<ReturnType<typeof createWorkspaceRouteIntentPlan>>
) =>
  plan.kind === 'command'
    ? applyWorkspaceCommand(workspace, plan.command)
    : applyWorkspaceTransaction(workspace, plan.transaction);

describe('createWorkspaceRouteIntentPlan', () => {
  it('creates page documents and route nodes as one canonical transaction', () => {
    const workspace = createWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      workspace,
      {
        type: 'create-child-route',
        parentRouteNodeId: 'route-about',
        segment: 'careers',
        routeNodeId: 'route-careers',
        pageDocId: 'page-careers',
      },
      { id: 'transaction-careers', issuedAt: '2026-07-12T00:00:00.000Z' }
    );

    expect(plan?.kind).toBe('transaction');
    if (!plan || plan.kind !== 'transaction') return;
    expect(plan.transaction.commands).toHaveLength(2);
    expect(
      plan.transaction.commands[0]?.forwardOps.map(({ path }) => path)
    ).toContain('/docsById/page-careers');
    expect(
      plan.transaction.commands[0]?.forwardOps.map(({ path }) => path)
    ).not.toContain('/docsById');

    const result = applyPlan(workspace, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['page-careers']).toMatchObject({
      type: 'pir-page',
      path: '/pages/page-careers.pir.json',
    });
    expect(result.snapshot.treeById['doc_page-careers']).toMatchObject({
      parentId: 'pages',
      docId: 'page-careers',
    });
    expect(result.snapshot.activeRouteNodeId).toBe('route-careers');
    expect(result.snapshot.activeDocumentId).toBe('page-careers');
  });

  it('keeps route-only mutations as one reversible command', () => {
    const workspace = createWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      workspace,
      {
        type: 'rename-segment',
        routeNodeId: 'route-team',
        segment: 'people',
      },
      { id: 'command-route-rename', issuedAt: '2026-07-12T00:00:00.000Z' }
    );

    expect(plan?.kind).toBe('command');
    if (!plan || plan.kind !== 'command') return;
    expect(plan.command).toMatchObject({
      namespace: 'core.route',
      type: 'node.rename-segment',
      target: { workspaceId: 'workspace-1' },
      domainHint: 'route',
    });
    const result = applyPlan(workspace, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.snapshot.routeManifest.root.children?.[1].children?.[0].segment
    ).toBe('people');
  });

  it('deletes routes without deleting their documents and realigns authoring', () => {
    const workspace = createWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      workspace,
      { type: 'delete-route', routeNodeId: 'route-about' },
      { id: 'command-route-delete', issuedAt: '2026-07-12T00:00:00.000Z' }
    );
    expect(plan?.kind).toBe('command');
    if (!plan) return;

    const result = applyPlan(workspace, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.snapshot.routeManifest.root.children?.map(({ id }) => id)
    ).toEqual(['route-home']);
    expect(result.snapshot.docsById['page-about']).toBeDefined();
    expect(result.snapshot.docsById['layout-about']).toBeDefined();
    expect(result.snapshot.activeRouteNodeId).toBe('route-home');
    expect(result.snapshot.activeDocumentId).toBe('page-home');
  });

  it('creates and attaches a layout atomically', () => {
    const workspace = createWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      workspace,
      {
        type: 'attach-layout',
        routeNodeId: 'route-home',
        layoutDocId: 'layout-home',
      },
      { id: 'transaction-layout', issuedAt: '2026-07-12T00:00:00.000Z' }
    );
    expect(plan?.kind).toBe('transaction');
    if (!plan) return;

    const result = applyPlan(workspace, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['layout-home']).toMatchObject({
      type: 'pir-layout',
      path: '/layouts/layout-home.pir.json',
    });
    expect(result.snapshot.routeManifest.root.children?.[0].layoutDocId).toBe(
      'layout-home'
    );
    expect(result.snapshot.activeDocumentId).toBe('layout-home');
  });

  it('uses injected ids and clock for deterministic route planning', () => {
    const counters = new Map<string, number>();
    const idFactory = (prefix: string) => {
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}-generated-${next}`;
    };
    const workspace = createWorkspace();

    const plan = createWorkspaceRouteIntentPlan(
      workspace,
      { type: 'create-page', path: '/docs/guides' },
      {
        idFactory,
        clock: () => '2026-07-12T08:00:00.000Z',
      }
    );

    expect(plan?.kind).toBe('transaction');
    if (!plan || plan.kind !== 'transaction') return;
    expect(plan.transaction).toMatchObject({
      id: 'route-operation-generated-1',
      issuedAt: '2026-07-12T08:00:00.000Z',
    });

    const result = applyPlan(workspace, plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['page-generated-1']).toMatchObject({
      type: 'pir-page',
      path: '/pages/page-generated-1.pir.json',
    });
    const docsRoute = result.snapshot.routeManifest.root.children?.find(
      (node) => node.id === 'route-generated-2'
    );
    expect(docsRoute).toMatchObject({
      segment: 'docs',
      children: [
        {
          id: 'route-generated-1',
          segment: 'guides',
          pageDocId: 'page-generated-1',
        },
      ],
    });
  });
});
