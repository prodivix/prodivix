import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  validatePirDocument,
  type PIRDocument,
  type PIRElementNode,
} from '@prodivix/pir';
import { PIRRenderer } from '@prodivix/pir-react-renderer';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import {
  BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
  BUNDLED_OFFICIAL_PLUGIN_CATALOG,
  collectUnavailableBundledOfficialComponentDiagnostics,
  createRendererProjectionRegistry,
  createWebPluginPlatform,
  reconcileBundledOfficialPlugins,
  type WebPluginPlatform,
} from '@/plugins/platform';
import {
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';
import { createPirWebRendererHost } from '@/pir/pirWebRendererHost';
import {
  createPirCurrentDocument,
  createPirCurrentProjectionPlan,
} from '@/plugins/platform/__tests__/pirCurrentRenderer.fixture';

const platforms = new Set<WebPluginPlatform>();
const officialCatalogIds = Object.freeze(['antd', 'mui', 'radix'] as const);
const ignoreTrigger = () => {};
const ignoreBlockingIssues = () => {};

const createPlatform = (): WebPluginPlatform => {
  const result = createWebPluginPlatform({
    workspaceId: `bundled-official-test-${platforms.size + 1}`,
    officialHostModules: BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
  });
  if (result.ok === false) {
    throw new Error('Bundled official plugin platform must initialize.');
  }
  platforms.add(result.value);
  return result.value;
};

const reconcile = async (
  platform: WebPluginPlatform,
  catalogIds: readonly string[]
) => {
  const result = await reconcileBundledOfficialPlugins(
    platform.runtime.packages,
    catalogIds
  );
  expect(
    result.diagnostics.filter(
      ({ severity }) => severity === 'error' || severity === 'fatal'
    )
  ).toEqual([]);
  return result;
};

const insertPaletteItem = (
  platform: WebPluginPlatform,
  document: PIRDocument,
  itemId: string
) => {
  const result = applyPaletteItemInsertion(document, platform.queries.palette, {
    workspaceId: platform.workspaceId,
    documentId: `document:${itemId}`,
    documentType: 'pir-page',
    itemId,
    preferredTargetId: 'root',
    commandId: `command:${itemId}`,
    issuedAt: '2026-07-11T00:00:00.000Z',
  });
  if (result.ok === false) {
    throw new Error(`${itemId} insertion failed: ${result.reason}`);
  }
  return result;
};

const literalTextElement = (
  id: string,
  type: string,
  text: string
): PIRElementNode => ({
  id,
  kind: 'element',
  type,
  text: { kind: 'literal', value: text },
});

afterEach(async () => {
  await Promise.all([...platforms].map((platform) => platform.shutdown()));
  platforms.clear();
});

describe('bundled official plugins', () => {
  it('publishes all official contribution surfaces from the canonical catalog', async () => {
    const platform = createPlatform();
    const result = await reconcile(platform, officialCatalogIds);

    expect(
      BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map(({ catalogId }) => catalogId)
    ).toEqual(officialCatalogIds);
    expect(result.plan.install.map(({ catalogId }) => catalogId)).toEqual(
      officialCatalogIds
    );
    expect(platform.queries.palette.getItemById('antd-button')).toBeDefined();
    expect(platform.queries.palette.getItemById('mui-button')).toBeDefined();
    expect(platform.queries.palette.getItemById('radix-dialog')).toBeDefined();

    const extensions = platform.queries.extensions.getSnapshot();
    expect(extensions.externalLibraries).toHaveLength(3);
    expect(extensions.rendererComponents.length).toBeGreaterThan(0);
    expect(extensions.codegenPolicy.libraries).toHaveLength(3);
    expect(
      platform.runtime.packages.contributions.list('blueprintTemplate')
    ).toHaveLength(3);
  }, 30_000);

  it('inserts official templates as valid PIR-current graph fragments', async () => {
    const platform = createPlatform();
    await reconcile(platform, officialCatalogIds);

    const antd = insertPaletteItem(
      platform,
      createPirCurrentDocument('Ant Design button'),
      'antd-button'
    );
    const mui = insertPaletteItem(
      platform,
      createPirCurrentDocument('Material UI accordion'),
      'mui-accordion'
    );
    const radix = insertPaletteItem(
      platform,
      createPirCurrentDocument('Radix tabs'),
      'radix-tabs'
    );

    for (const insertion of [antd, mui, radix]) {
      expect(validatePirDocument(insertion.doc).valid).toBe(true);
      expect(
        insertion.doc.ui.graph.nodesById[insertion.nextNodeId]
      ).toMatchObject({ kind: 'element' });
    }
    expect(
      mui.doc.ui.graph.childIdsById[mui.nextNodeId]?.map(
        (nodeId) => mui.doc.ui.graph.nodesById[nodeId]?.kind
      )
    ).toEqual(['element', 'element']);
    expect(
      radix.doc.ui.graph.childIdsById[radix.nextNodeId]?.map(
        (nodeId) => radix.doc.ui.graph.nodesById[nodeId]?.kind
      )
    ).toEqual(['element', 'element', 'element']);
  }, 30_000);

  it('renders official elements through the Workspace projection and shared Web host', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['antd', 'mui']);
    const document: PIRDocument = {
      metadata: { name: 'Official buttons' },
      ui: {
        graph: {
          rootId: 'root',
          nodesById: {
            root: { id: 'root', kind: 'element', type: 'div' },
            antd: literalTextElement('antd', 'AntdButton', 'Ant action'),
            mui: literalTextElement('mui', 'MuiButton', 'Material action'),
          },
          childIdsById: {
            root: ['antd', 'mui'],
            antd: [],
            mui: [],
          },
          order: { strategy: 'childIdsById' },
        },
      },
    };
    const registry = createRendererProjectionRegistry(
      platform.queries.extensions.getSnapshot()
    );
    const host = createPirWebRendererHost(registry);

    render(
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <PIRRenderer
              plan={createPirCurrentProjectionPlan(document)}
              host={host}
              dispatchTrigger={ignoreTrigger}
              onBlockingIssues={ignoreBlockingIssues}
            />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );

    expect(screen.getByRole('button', { name: 'Ant action' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Material action' })
    ).toBeTruthy();
  }, 30_000);

  it('removes projections and reports existing official elements after disable', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['mui']);
    await reconcile(platform, []);

    const extensions = platform.queries.extensions.getSnapshot();
    expect(platform.queries.palette.getItemById('mui-button')).toBeUndefined();
    expect(extensions.rendererComponents).toEqual([]);
    expect(extensions.codegenPolicy.libraries).toEqual([]);
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(
        {
          button: {
            id: 'button',
            kind: 'element',
            type: 'MuiButton',
          },
        },
        extensions.rendererComponents
      )
    ).toEqual([
      expect.objectContaining({
        meta: expect.objectContaining({
          nodeId: 'button',
          runtimeType: 'MuiButton',
        }),
      }),
    ]);
  });
});
