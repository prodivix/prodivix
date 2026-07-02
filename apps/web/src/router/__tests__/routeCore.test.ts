import { describe, expect, it } from 'vitest';
import {
  buildRoutePath,
  composeRouteManifestWithModules,
  flattenRouteManifest,
  matchRouteManifest,
  matchRoutePattern,
  normalizeRoutePath,
  normalizeRouteSegment,
  resolveNavigateTarget,
  resolveOutletBinding,
  resolveRouteMatchChain,
  resolveRouteRuntimeContext,
  type WorkspaceRouteManifest,
  validateRouteManifest,
} from '@prodivix/shared/router';

const manifest: WorkspaceRouteManifest = {
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
        id: 'route-users',
        segment: 'users',
        layoutDocId: 'layout-users',
        children: [
          {
            id: 'route-users-index',
            index: true,
            pageDocId: 'page-users',
          },
          {
            id: 'route-user-detail',
            segment: ':userId',
            pageDocId: 'page-user-detail',
          },
        ],
      },
      {
        id: 'route-docs',
        segment: 'docs/[...slug]',
        pageDocId: 'page-docs',
      },
    ],
  },
};

describe('routeCore', () => {
  it('normalizes route paths without binding them to VFS paths', () => {
    expect(normalizeRoutePath(' users / :id / ')).toBe('/users/:id');
    expect(normalizeRoutePath('/users/42?tab=info#heading')).toBe('/users/42');
    expect(normalizeRoutePath('/')).toBe('/');
    expect(
      buildRoutePath('/admin', { id: 'settings', segment: 'settings' })
    ).toBe('/admin/settings');
  });

  it('normalizes route segments and reports dynamic params', () => {
    expect(normalizeRouteSegment('/users/:userId')).toEqual({
      ok: true,
      segment: 'users/:userId',
      params: ['userId'],
      wildcard: false,
    });
    expect(normalizeRouteSegment('docs/[...slug]')).toEqual({
      ok: true,
      segment: 'docs/[...slug]',
      params: ['slug'],
      wildcard: true,
    });
    expect(normalizeRouteSegment('docs/*/extra')).toMatchObject({
      ok: false,
    });
  });

  it('flattens route nodes with derived paths and display labels', () => {
    expect(
      flattenRouteManifest(manifest).map(({ id, path, label }) => ({
        id,
        path,
        label,
      }))
    ).toEqual([
      { id: 'route-home', path: '/', label: '(index)' },
      { id: 'route-users', path: '/users', label: 'users' },
      { id: 'route-users-index', path: '/users', label: '(index)' },
      {
        id: 'route-user-detail',
        path: '/users/:userId',
        label: ':userId',
      },
      { id: 'route-docs', path: '/docs/[...slug]', label: 'docs/[...slug]' },
    ]);
  });

  it('matches static, index, dynamic, and catch-all routes', () => {
    expect(matchRouteManifest(manifest, '/').map((node) => node.id)).toEqual([
      'root',
      'route-home',
    ]);
    expect(
      matchRouteManifest(manifest, '/users').map((node) => node.id)
    ).toEqual(['root', 'route-users', 'route-users-index']);
    expect(
      matchRouteManifest(manifest, '/users/42').map((node) => node.id)
    ).toEqual(['root', 'route-users', 'route-user-detail']);
    expect(
      matchRouteManifest(manifest, '/docs/api/routing').map((node) => node.id)
    ).toEqual(['root', 'route-docs']);
  });

  it('matches standalone route patterns with shared ranking rules', () => {
    expect(matchRoutePattern('/users/:userId', '/users/42')?.score).toBe(10360);
    expect(
      matchRoutePattern('docs/[...slug]', '/app/docs/api/routing')
    ).toEqual(
      expect.objectContaining({
        matchedPath: '/app/docs/api/routing',
        wildcard: true,
      })
    );
    expect(matchRoutePattern('/settings', '/users')).toBeNull();
  });

  it('resolves navigation by route id or path', () => {
    expect(
      resolveRouteMatchChain(manifest, 'route-user-detail').map(
        (node) => node.id
      )
    ).toEqual(['root', 'route-users', 'route-user-detail']);
    const runtimeContext = resolveRouteRuntimeContext(manifest, {
      currentPath: '/users/abc?tab=info#heading',
    });
    expect(runtimeContext.activeRouteNodeId).toBe('route-user-detail');
    expect(runtimeContext.params).toEqual({ userId: 'abc' });
    expect(runtimeContext.searchParams).toEqual({ tab: 'info' });
    expect(runtimeContext.hash).toBe('heading');

    expect(
      resolveNavigateTarget(manifest, runtimeContext, {
        routeNodeId: 'route-users-index',
      })
    ).toMatchObject({
      kind: 'internal',
      runtimeContext: {
        activeRouteNodeId: 'route-users-index',
        currentPath: '/users',
      },
    });
    expect(
      resolveNavigateTarget(manifest, runtimeContext, {
        to: '../../docs/api/routing',
      })
    ).toMatchObject({
      kind: 'internal',
      runtimeContext: {
        activeRouteNodeId: 'route-docs',
        params: { slug: 'api/routing' },
      },
    });
    expect(
      resolveNavigateTarget(manifest, runtimeContext, {
        to: 'https://example.com',
      })
    ).toEqual({ kind: 'external', url: 'https://example.com' });
  });

  it('resolves default and named outlet bindings from a route chain', () => {
    const chain = [
      {
        id: 'route-layout',
        segment: 'settings',
        outletNodeId: 'default-outlet',
        pageDocId: 'page-settings',
      },
      {
        id: 'route-profile',
        segment: 'profile',
        outletBindings: {
          sidebar: { outletNodeId: 'sidebar-outlet', pageDocId: 'page-side' },
        },
      },
    ];

    expect(resolveOutletBinding(chain)).toEqual({
      routeNodeId: 'route-layout',
      outletName: 'default',
      outletNodeId: 'default-outlet',
      pageDocId: 'page-settings',
    });
    expect(resolveOutletBinding(chain, 'sidebar')).toEqual({
      routeNodeId: 'route-profile',
      outletName: 'sidebar',
      outletNodeId: 'sidebar-outlet',
      pageDocId: 'page-side',
    });
  });

  it('validates duplicate routes, missing docs, index segments, and runtime refs', () => {
    const issues = validateRouteManifest({
      manifest: {
        version: '1',
        root: {
          id: 'root',
          children: [
            { id: 'index-a', index: true, segment: 'home' },
            { id: 'index-b', index: true },
            { id: 'users-a', segment: 'users' },
            { id: 'users-b', segment: '/users/' },
            { id: 'bad-wildcard', segment: 'docs/*/extra' },
            {
              id: 'settings',
              segment: 'settings',
              pageDocId: 'missing-page',
              runtime: {
                loaderRef: { artifactId: '' },
                actionRef: { artifactId: 'missing-action' },
              },
            },
          ],
        },
      },
      documentExists: (documentId) => documentId !== 'missing-page',
      codeArtifactExists: (artifactId) => artifactId !== 'missing-action',
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'RTE-1001',
        'RTE-1002',
        'RTE-1010',
        'RTE-2001',
        'RTE-2010',
        'RTE-2011',
      ])
    );
  });

  it('mounts route modules under different host routes with source trace', () => {
    const composed = composeRouteManifestWithModules({
      version: '1',
      root: {
        id: 'root',
        children: [
          { id: 'route-admin', segment: 'admin' },
          { id: 'route-customer', segment: 'customer' },
        ],
      },
      modules: {
        account: {
          moduleId: 'account',
          version: '1',
          root: {
            id: 'module-account-root',
            children: [
              {
                id: 'module-account-index',
                index: true,
                pageDocId: 'page-account',
              },
              { id: 'module-account-profile', segment: 'profile' },
            ],
          },
        },
      },
      mounts: [
        {
          mountId: 'admin-account',
          moduleRef: 'account',
          parentRouteNodeId: 'route-admin',
          mountPath: 'account',
        },
        {
          mountId: 'customer-account',
          moduleRef: 'account',
          parentRouteNodeId: 'route-customer',
          mountPath: 'account',
        },
      ],
    });

    expect(composed.skippedMounts).toEqual([]);
    expect(
      flattenRouteManifest(composed.manifest).map(({ id, path }) => ({
        id,
        path,
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          id: 'admin-account:module-account-root',
          path: '/admin/account',
        },
        {
          id: 'admin-account:module-account-profile',
          path: '/admin/account/profile',
        },
        {
          id: 'customer-account:module-account-root',
          path: '/customer/account',
        },
        {
          id: 'customer-account:module-account-profile',
          path: '/customer/account/profile',
        },
      ])
    );
    expect(composed.sourceTrace).toContainEqual({
      kind: 'route-module',
      moduleId: 'account',
      mountId: 'admin-account',
      sourceRouteNodeId: 'module-account-profile',
      hostRouteNodeId: 'admin-account:module-account-profile',
      path: '/admin/account/profile',
    });
  });
});
