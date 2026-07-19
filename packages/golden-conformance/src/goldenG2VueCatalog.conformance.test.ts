import { describe, expect, it } from 'vitest';
import { generateWorkspaceVueViteExecutableProject } from '@prodivix/prodivix-compiler';
import { projectExecutableProjectRuntimeFiles } from '@prodivix/runtime-core';
import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from '@prodivix/runtime-remote';
import {
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createGoldenG2VueCatalogRemoteSnapshot,
  createGoldenG2VueCatalogTestSnapshot,
  GOLDEN_G2_VUE_CATALOG_IDS,
  GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY,
  GOLDEN_G2_VUE_CATALOG_WORKSPACE,
} from './goldenG2VueCatalogFixture';

const textFiles = (
  files: readonly Readonly<{ contents: string | Uint8Array }>[]
) =>
  files
    .filter(
      (file): file is Readonly<{ contents: string }> =>
        typeof file.contents === 'string'
    )
    .map(({ contents }) => contents)
    .join('\n');

type CatalogRouteNode = NonNullable<
  WorkspaceSnapshot['routeManifest']['root']['children']
>[number];

const catalogShellRoute = (): CatalogRouteNode => {
  const route =
    GOLDEN_G2_VUE_CATALOG_WORKSPACE.routeManifest.root.children?.[0];
  if (!route) throw new Error('Expected the Catalog Golden shell route.');
  return route;
};

const withCatalogShellRoute = (route: CatalogRouteNode): WorkspaceSnapshot => ({
  ...GOLDEN_G2_VUE_CATALOG_WORKSPACE,
  routeManifest: {
    ...GOLDEN_G2_VUE_CATALOG_WORKSPACE.routeManifest,
    root: {
      ...GOLDEN_G2_VUE_CATALOG_WORKSPACE.routeManifest.root,
      children: [route],
    },
  },
});

const vueDiagnosticCodes = (
  workspace: WorkspaceSnapshot
): readonly string[] => {
  const result = generateWorkspaceVueViteExecutableProject(workspace);
  if (result.status !== 'blocked')
    throw new Error(
      'Expected invalid Vue layout/outlet topology to fail closed.'
    );
  return result.diagnostics.map(({ code }) => code);
};

describe('Golden G2 authenticated Vue Catalog product surface', () => {
  it('keeps the authored PIR/Route/Auth/Server/Asset Workspace valid', () => {
    expect(validateWorkspaceSnapshot(GOLDEN_G2_VUE_CATALOG_WORKSPACE)).toEqual(
      expect.objectContaining({ valid: true, issues: [] })
    );
  });

  it('builds deterministic Test with PIR, authenticated Server Runtime, CRUD and exact Asset bytes', () => {
    const snapshot = createGoldenG2VueCatalogTestSnapshot();
    expect(snapshot.target).toEqual({
      presetId: 'vue-vite',
      framework: 'vue',
      runtime: 'vite',
    });
    expect(snapshot.serverRuntimeMockProvision).toMatchObject({
      fixtureSetId: 'golden-g2-vue-catalog-authenticated',
      principal: {
        providerId: 'prodivix-product-session',
        principalId: 'golden-catalog-owner',
      },
    });
    expect(snapshot.dataMockProvision?.fixtures).toHaveLength(5);
    expect(snapshot.capabilityRequirements.test).toContain('test');
    expect(snapshot.capabilityRequirements.preview).not.toContain(
      'server-function'
    );

    const files = projectExecutableProjectRuntimeFiles(snapshot, 'test');
    expect(files.some(({ path }) => path === 'src/App.vue')).toBe(true);
    expect(
      files.some(({ path }) => path === 'src/prodivix-pir-runtime.ts')
    ).toBe(true);
    expect(
      files.some(({ path }) => path === 'src/prodivix-workspace-app.ts')
    ).toBe(true);
    expect(
      files.some(({ path }) => path === 'src/prodivix-server-runtime.ts')
    ).toBe(true);
    expect(
      files.find(({ path }) => path === 'config/auth.json')?.contents
    ).toContain('workspace.owner');
    expect(
      files.find(({ path }) => path === 'public/catalog/product.png')?.contents
    ).toBeInstanceOf(Uint8Array);
    expect(
      (
        files.find(({ path }) => path === 'public/catalog/product.png')
          ?.contents as Uint8Array
      ).slice(0, 8)
    ).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const source = textFiles(files);
    expect(source).toContain('Authenticated Catalog');
    expect(source).toContain('Catalog Shell');
    expect(source).toContain('Featured products');
    expect(source).toContain('catalog-default-outlet');
    expect(source).toContain('catalog-sidebar-outlet');
    expect(source).toContain('dispatchWorkspaceRouteAction');
    expect(source).toContain('runs authenticated Route guard/loader/action');
    expect(source).not.toContain(GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY);
  });

  it('projects the same Vue product target through Remote Preview/Test/Build capabilities and strict codec', () => {
    const snapshot = createGoldenG2VueCatalogRemoteSnapshot();
    expect(snapshot.capabilityRequirements.preview).toContain(
      'server-function'
    );
    expect(snapshot.capabilityRequirements.preview).toEqual(
      expect.arrayContaining(['environment-binding', 'network'])
    );
    expect(snapshot.capabilityRequirements.build).toContain('build');
    expect(snapshot.capabilityRequirements.test).toContain('test');
    expect(snapshot.dataMockProvision).toBeUndefined();
    const decoded = decodeRemoteExecutableProjectSnapshot(
      encodeRemoteExecutableProjectSnapshot(snapshot)
    );
    expect(decoded.target).toEqual(snapshot.target);
    expect(decoded.contentDigest).toBe(snapshot.contentDigest);
    expect(decoded.capabilityRequirements).toEqual(
      snapshot.capabilityRequirements
    );
    expect(decoded.dataMockProvision).toBeUndefined();
    expect(
      decoded.files.find(({ path }) => path === 'src/prodivix-data-runtime.ts')
        ?.contents
    ).toContain('prodivix.execution-data-gateway-request.v1');
    expect(textFiles(decoded.files)).not.toContain(
      GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY
    );
  });

  it('fails closed on invalid Vue layout and outlet topology with precise diagnostics', () => {
    const route = catalogShellRoute();
    expect(
      vueDiagnosticCodes(
        withCatalogShellRoute({
          ...route,
          layoutDocId: GOLDEN_G2_VUE_CATALOG_IDS.page,
        })
      )
    ).toContain('VUE-EXPORT-LAYOUT-DOCUMENT');
    expect(
      vueDiagnosticCodes(
        withCatalogShellRoute({
          ...route,
          outletNodeId: 'missing-outlet-node',
        })
      )
    ).toContain('VUE-EXPORT-OUTLET-NODE');
    expect(
      vueDiagnosticCodes(
        withCatalogShellRoute({
          ...route,
          outletBindings: {
            ...route.outletBindings,
            duplicate: { outletNodeId: route.outletNodeId! },
          },
        })
      )
    ).toContain('VUE-EXPORT-OUTLET-CONFLICT');
    const { outletNodeId: _outletNodeId, ...withoutDefaultOutlet } = route;
    void _outletNodeId;
    expect(
      vueDiagnosticCodes(withCatalogShellRoute(withoutDefaultOutlet))
    ).toContain('VUE-EXPORT-LAYOUT-OUTLET-REQUIRED');
  });

  it('fails closed for static Vue export instead of leaking protected Server source', () => {
    const result = generateWorkspaceVueViteExecutableProject(
      GOLDEN_G2_VUE_CATALOG_WORKSPACE
    );
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(
      result.diagnostics.some(({ path }) => path === '/catalog.server.ts')
    ).toBe(true);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      GOLDEN_G2_VUE_CATALOG_SERVER_SOURCE_CANARY
    );
    expect(GOLDEN_G2_VUE_CATALOG_IDS.route).toBe('route-catalog');
  });
});
