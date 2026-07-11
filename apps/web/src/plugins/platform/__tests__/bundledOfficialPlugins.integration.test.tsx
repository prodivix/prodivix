import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  CURRENT_PIR_VERSION,
  type ComponentNode,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import { PLUGIN_DIAGNOSTIC_CODES } from '@prodivix/plugin-contracts';
import { generateReactBundle } from '@prodivix/prodivix-compiler';
import {
  createBundledPluginArtifact,
  type BundledPluginArtifactV1,
} from '@prodivix/plugin-package';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import { InspectorContext } from '@/editor/features/blueprint/editor/inspector/InspectorContext';
import type { InspectorContextValue } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { InspectorComponentPropsFields } from '@/editor/features/blueprint/editor/inspector/fields/InspectorComponentPropsFields';
import { resolveInspectorComponentMeta } from '@/editor/features/blueprint/editor/inspector/meta/componentMetaProjection';
import { findActiveBlueprintCompositionIssue } from '@/editor/features/blueprint/editor/runtime/useBundledOfficialPluginRuntime';
import {
  listIconNamesByProvider,
  resolveIconRef,
} from '@/pir/renderer/iconRegistry';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';
import {
  BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
  BUNDLED_OFFICIAL_PLUGIN_CATALOG,
  collectUnavailableBundledOfficialComponentDiagnostics,
  createRendererProjectionRegistry,
  createWebPluginPlatform,
  getBundledOfficialPlugin,
  reconcileBundledOfficialPlugins,
  type OfficialHostModuleCatalogEntry,
  type WebPluginPackageService,
  type WebPluginPlatform,
} from '@/plugins/platform';
import {
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';
import { createNeutralOfficialPlugin } from '@/plugins/platform/__tests__/neutralOfficialPlugin.fixture';

const platforms = new Set<WebPluginPlatform>();

const createPlatform = (
  officialHostModules: readonly OfficialHostModuleCatalogEntry[] = BUNDLED_OFFICIAL_HOST_MODULE_CATALOG
) => {
  const result = createWebPluginPlatform({
    workspaceId: `bundled-official-test-${platforms.size + 1}`,
    officialHostModules,
  });
  if (result.ok === false) {
    throw new Error('Bundled official plugin test platform must initialize.');
  }
  platforms.add(result.value);
  return result.value;
};

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createFirstInstallReturnBarrier = (platform: WebPluginPlatform) => {
  const firstInstallCompleted = createDeferred<void>();
  const releaseFirstInstallResult = createDeferred<void>();
  let shouldHoldResult = true;
  const installBundled = vi.fn(
    async (...args: Parameters<WebPluginPackageService['installBundled']>) => {
      const result = await platform.runtime.packages.installBundled(...args);
      if (shouldHoldResult) {
        shouldHoldResult = false;
        firstInstallCompleted.resolve();
        await releaseFirstInstallResult.promise;
      }
      return result;
    }
  );
  const packages = {
    ...platform.runtime.packages,
    installBundled,
  } satisfies WebPluginPackageService;
  return {
    packages,
    installBundled,
    firstInstallCompleted,
    releaseFirstInstallResult,
  };
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
      (diagnostic) =>
        diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
    )
  ).toEqual([]);
  return result;
};

const createDocument = (name: string): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name },
  ui: {
    graph: {
      version: 1,
      rootId: 'root',
      nodesById: { root: { id: 'root', type: 'PdxDiv' } },
      childIdsById: { root: [] },
    },
  },
});

const insertPaletteItem = (
  platform: WebPluginPlatform,
  itemId: string,
  name = itemId
) => {
  const inserted = applyPaletteItemInsertion(
    createDocument(name),
    platform.queries.palette,
    {
      workspaceId: platform.workspaceId,
      documentId: `document:${itemId}`,
      itemId,
      preferredTargetId: 'root',
      commandId: `command:${itemId}`,
      issuedAt: '2026-07-11T00:00:00.000Z',
    }
  );
  if (inserted.ok === false) {
    throw new Error(`${itemId} insertion failed: ${inserted.reason}`);
  }
  return inserted;
};

const paletteItemCount = (platform: WebPluginPlatform) =>
  platform.queries.palette
    .getSnapshot()
    .groups.reduce((count, group) => count + group.items.length, 0);

const createReplacementArtifact = async (
  artifact: BundledPluginArtifactV1,
  catalogId: string
) =>
  createBundledPluginArtifact({
    manifestPath: artifact.manifestPath,
    resources: [
      ...artifact.resources,
      {
        path: `plugin/update-${catalogId}.json`,
        bytes: new TextEncoder().encode(
          JSON.stringify({ catalogId, revision: 2 })
        ),
      },
    ],
  });

afterEach(async () => {
  await Promise.all([...platforms].map((platform) => platform.shutdown()));
  platforms.clear();
});

describe('bundled official component plugins', () => {
  it('starts disabled and exposes the frozen three-package catalog', async () => {
    const platform = createPlatform();

    expect(
      BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map((entry) => entry.catalogId)
    ).toEqual(['antd', 'mui', 'radix']);
    expect(BUNDLED_OFFICIAL_HOST_MODULE_CATALOG).toHaveLength(3);
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
    expect(paletteItemCount(platform)).toBe(0);

    const result = await reconcile(platform, []);
    expect(result.plan).toMatchObject({
      install: [],
      replace: [],
      retain: [],
      disable: [],
      unknown: [],
    });
  });

  it.each([
    ['antd', 81, 81, 1, 1],
    ['mui', 18, 20, 1, 1],
    ['radix', 10, 37, 7, 0],
  ] as const)(
    'installs %s without publishing another official library',
    async (
      catalogId,
      expectedPaletteItems,
      expectedRuntimeTypes,
      expectedTemplates,
      expectedIconProviders
    ) => {
      const platform = createPlatform();
      const entry = getBundledOfficialPlugin(catalogId);
      if (!entry)
        throw new Error(`Missing bundled catalog entry ${catalogId}.`);

      const result = await reconcile(platform, [catalogId]);

      expect(result.plan.install.map((item) => item.catalogId)).toEqual([
        catalogId,
      ]);
      expect(
        platform.runtime.packages
          .listBundledInstallations()
          .map((item) => item.pluginId)
      ).toEqual([entry.pluginId]);
      expect(paletteItemCount(platform)).toBe(expectedPaletteItems);
      const extensions = platform.queries.extensions.getSnapshot();
      expect(extensions.externalLibraries).toHaveLength(1);
      expect(extensions.externalComponentsByRuntimeType.size).toBe(
        expectedRuntimeTypes
      );
      expect(extensions.rendererComponents).toHaveLength(expectedRuntimeTypes);
      expect(extensions.codegenPolicy.libraries).toHaveLength(1);
      expect(extensions.iconProviders).toHaveLength(expectedIconProviders);
      expect(
        platform.runtime.packages.contributions.list('blueprintTemplate')[0]
          ?.value.descriptor.templates
      ).toHaveLength(expectedTemplates);
    },
    30_000
  );

  it('edits declared props on template-only Radix primitives through the Inspector projection', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['radix']);
    expect(
      platform.queries.palette.getItemByRuntimeType('RadixAccordionItem')
    ).toBeUndefined();

    const componentMeta = resolveInspectorComponentMeta(
      'RadixAccordionItem',
      platform.queries.palette.getSnapshot(),
      platform.queries.extensions.getSnapshot()
    );
    expect(componentMeta?.propDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'value', valueType: 'string' }),
        expect.objectContaining({ name: 'disabled', valueType: 'boolean' }),
      ])
    );
    if (!componentMeta) {
      throw new Error('Radix Accordion.Item metadata must be projected.');
    }

    let selectedNode: ComponentNode = {
      id: 'accordion-item',
      type: 'RadixAccordionItem',
      props: { value: 'item-1' },
    };
    const updateSelectedNode = vi.fn(
      (updater: (node: ComponentNode) => ComponentNode) => {
        selectedNode = updater(selectedNode);
      }
    );
    render(
      <InspectorContext.Provider
        value={
          {
            t: (key: string, options?: Record<string, unknown>) =>
              String(options?.defaultValue ?? key),
            selectedNode,
            componentMeta,
            updateSelectedNode,
            dataModelFieldPaths: [],
          } as unknown as InspectorContextValue
        }
      >
        <InspectorComponentPropsFields />
      </InspectorContext.Provider>
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'value' }), {
      target: { value: 'item-2' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'disabled' }));

    expect(updateSelectedNode).toHaveBeenCalledTimes(2);
    expect(selectedNode.props).toMatchObject({
      value: 'item-2',
      disabled: true,
    });
  });

  it('does not coerce structured unknown Radix props into strings', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['radix']);
    const componentMeta = resolveInspectorComponentMeta(
      'RadixAccordionRoot',
      platform.queries.palette.getSnapshot(),
      platform.queries.extensions.getSnapshot()
    );
    if (!componentMeta) {
      throw new Error('Radix Accordion.Root metadata must be projected.');
    }
    const selectedNode: ComponentNode = {
      id: 'accordion-root',
      type: 'RadixAccordionRoot',
      props: { type: 'multiple', value: ['item-1'] },
    };
    const updateSelectedNode = vi.fn();

    render(
      <InspectorContext.Provider
        value={
          {
            t: (key: string, options?: Record<string, unknown>) =>
              String(options?.defaultValue ?? key),
            selectedNode,
            componentMeta,
            updateSelectedNode,
            dataModelFieldPaths: [],
          } as unknown as InspectorContextValue
        }
      >
        <InspectorComponentPropsFields />
      </InspectorContext.Provider>
    );

    expect(screen.queryByRole('textbox', { name: 'value' })).toBeNull();
    expect(selectedNode.props?.value).toEqual(['item-1']);
    expect(updateSelectedNode).not.toHaveBeenCalled();
  });

  it('revalidates existing compound structure when Radix is re-enabled', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['radix']);
    await reconcile(platform, []);
    const invalidGraph = {
      version: 1 as const,
      rootId: 'root',
      nodesById: {
        root: { id: 'root', type: 'PdxDiv' },
        item: {
          id: 'item',
          type: 'RadixAccordionItem',
          props: { value: 'item-1' },
        },
      },
      childIdsById: { root: ['item'], item: [] },
    };

    expect(
      findActiveBlueprintCompositionIssue(
        invalidGraph,
        platform.queries.palette
      )
    ).toBeUndefined();

    await reconcile(platform, ['radix']);
    expect(
      findActiveBlueprintCompositionIssue(
        invalidGraph,
        platform.queries.palette
      )
    ).toEqual({
      code: 'PIR-2011',
      nodeId: 'item',
      runtimeType: 'RadixAccordionItem',
      message:
        'Runtime type RadixAccordionItem cannot be inserted under PdxDiv.',
    });
  });

  it('reports unknown bundled component-library ids without remote loading', async () => {
    const platform = createPlatform();
    const result = await reconcileBundledOfficialPlugins(
      platform.runtime.packages,
      ['missing-library']
    );

    expect(result.plan.unknown).toEqual(['missing-library']);
    expect(result.plan.install).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: PLUGIN_DIAGNOSTIC_CODES.BUNDLED_OFFICIAL_LIBRARY_NOT_FOUND,
        meta: expect.objectContaining({
          libraryId: 'missing-library',
          reasonCode: 'bundled-official-library-not-found',
        }),
      }),
    ]);
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
  });

  it('reports legacy Radix placeholder runtime types as unsupported', () => {
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(
        {
          legacy: { id: 'legacy', type: 'RadixAccordion' },
        },
        []
      )
    ).toEqual([
      expect.objectContaining({
        code: PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNSUPPORTED,
        meta: expect.objectContaining({
          libraryId: 'radix',
          nodeId: 'legacy',
          runtimeType: 'RadixAccordion',
          reasonCode: 'official-component-runtime-unsupported',
        }),
      }),
    ]);
  });

  it('requires an effective Renderer projection owned by the official plugin', async () => {
    const platform = createPlatform();
    const neutral = createNeutralOfficialPlugin();
    const neutralLibrary = neutral.contributions.find(
      (contribution) => contribution.point === 'externalLibrary'
    );
    if (!neutralLibrary || neutralLibrary.point !== 'externalLibrary') {
      throw new Error('Neutral external-library fixture must exist.');
    }
    const descriptorOnly = await platform.runtime.packages.install({
      pluginId: '@prodivix/plugin-descriptor-only-collision',
      displayName: 'Descriptor-only Collision',
      version: '1.0.0',
      publisher: 'prodivix',
      installationId: 'fixture:descriptor-only-collision',
      trustLevel: 'official',
      publisherVerified: true,
      contributions: [
        {
          id: 'collision.library',
          point: 'externalLibrary',
          contractVersion: '1.0',
          descriptor: {
            schemaVersion: neutralLibrary.descriptor.schemaVersion,
            libraryId: 'mui',
            displayName: 'Descriptor-only MUI Collision',
            package: neutralLibrary.descriptor.package,
            exportDiscovery: neutralLibrary.descriptor.exportDiscovery,
            components: neutralLibrary.descriptor.components.map(
              (component) => ({
                ...component,
                runtimeType: 'MuiButton',
              })
            ),
            dependencies: neutralLibrary.descriptor.dependencies,
          },
        },
      ],
    });
    expect(descriptorOnly.ok).toBe(true);

    const descriptorSnapshot = platform.queries.extensions.getSnapshot();
    expect(
      descriptorSnapshot.externalComponentsByRuntimeType.get('MuiButton')?.owner
        .pluginId
    ).toBe('@prodivix/plugin-descriptor-only-collision');
    expect(descriptorSnapshot.rendererComponents).toEqual([]);
    const muiNode = {
      'mui-existing-node': {
        id: 'mui-existing-node',
        type: 'MuiButton',
      },
    } satisfies Readonly<Record<string, ComponentNode>>;
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(
        muiNode,
        descriptorSnapshot.rendererComponents
      )
    ).toEqual([
      expect.objectContaining({
        code: PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNAVAILABLE,
      }),
    ]);

    await reconcile(platform, ['antd']);
    const antd = getBundledOfficialPlugin('antd');
    const antdRenderer = platform.queries.extensions
      .getSnapshot()
      .rendererComponents.find(
        (projection) => projection.owner.pluginId === antd?.pluginId
      );
    if (!antd || !antdRenderer) {
      throw new Error('Ant Design Renderer projection must exist.');
    }
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(muiNode, [
        {
          ...antdRenderer,
          libraryId: 'mui',
          runtimeType: 'MuiButton',
        },
      ])
    ).toEqual([
      expect.objectContaining({
        code: PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNAVAILABLE,
        meta: expect.objectContaining({
          pluginId: getBundledOfficialPlugin('mui')?.pluginId,
          runtimeType: 'MuiButton',
        }),
      }),
    ]);
  });

  it('retains unchanged packages and isolates disable and re-enable generations', async () => {
    const platform = createPlatform();
    const allCatalogIds = ['antd', 'mui', 'radix'] as const;
    const installed = await reconcile(platform, allCatalogIds);

    expect(installed.plan.install).toHaveLength(3);
    expect(paletteItemCount(platform)).toBe(109);
    const allExtensions = platform.queries.extensions.getSnapshot();
    expect(allExtensions.externalLibraries).toHaveLength(3);
    expect(allExtensions.rendererComponents).toHaveLength(138);
    expect(allExtensions.iconProviders).toHaveLength(2);
    expect(allExtensions.codegenPolicy.libraries).toHaveLength(3);
    expect(
      platform.runtime.packages.contributions.list('blueprintTemplate')
    ).toHaveLength(3);
    const revision = allExtensions.revision;
    const generations = new Map(
      BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map((entry) => [
        entry.pluginId,
        platform.runtime.packages.getSnapshot(entry.pluginId)?.generation,
      ])
    );

    const retained = await reconcile(platform, allCatalogIds);
    expect(retained.plan.install).toEqual([]);
    expect(retained.plan.replace).toEqual([]);
    expect(retained.plan.retain.map((entry) => entry.catalogId)).toEqual([
      'antd',
      'mui',
      'radix',
    ]);
    expect(platform.queries.extensions.getSnapshot().revision).toBe(revision);

    const mui = getBundledOfficialPlugin('mui');
    const antd = getBundledOfficialPlugin('antd');
    const radix = getBundledOfficialPlugin('radix');
    if (!mui || !antd || !radix) {
      throw new Error('All bundled official definitions must exist.');
    }
    const disabledMui = await reconcile(platform, ['antd', 'radix']);
    expect(disabledMui.plan.disable.map((item) => item.pluginId)).toEqual([
      mui.pluginId,
    ]);
    expect(platform.queries.palette.getItemById('mui-button')).toBeUndefined();
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(
        {
          'mui-existing-node': {
            id: 'mui-existing-node',
            type: 'MuiButton',
          },
        },
        platform.queries.extensions.getSnapshot().rendererComponents
      )
    ).toEqual([
      expect.objectContaining({
        code: PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNAVAILABLE,
        meta: expect.objectContaining({
          pluginId: mui.pluginId,
          runtimeType: 'MuiButton',
          nodeId: 'mui-existing-node',
        }),
      }),
    ]);
    expect(platform.queries.palette.getItemById('antd-button')).toBeDefined();
    expect(platform.queries.palette.getItemById('radix-slot')).toBeDefined();
    expect(platform.runtime.packages.listBundledInstallations()).toHaveLength(
      2
    );
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);

    const reenabledMui = await reconcile(platform, allCatalogIds);
    expect(reenabledMui.plan.install.map((entry) => entry.catalogId)).toEqual([
      'mui',
    ]);
    expect(
      platform.runtime.packages.getSnapshot(mui.pluginId)?.generation
    ).toBeGreaterThan(generations.get(mui.pluginId) ?? 0);
    expect(
      platform.runtime.packages.getSnapshot(antd.pluginId)?.generation
    ).toBe(generations.get(antd.pluginId));
    expect(
      platform.runtime.packages.getSnapshot(radix.pluginId)?.generation
    ).toBe(generations.get(radix.pluginId));
    expect(
      collectUnavailableBundledOfficialComponentDiagnostics(
        {
          'mui-existing-node': {
            id: 'mui-existing-node',
            type: 'MuiButton',
          },
        },
        platform.queries.extensions.getSnapshot().rendererComponents
      )
    ).toEqual([]);

    await reconcile(platform, []);
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
    expect(paletteItemCount(platform)).toBe(0);
    expect(platform.queries.extensions.getSnapshot()).toMatchObject({
      externalLibraries: [],
      rendererComponents: [],
      iconProviders: [],
    });
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);
  });

  it('rediscovers the same bundled digest after disable cleanup fails', async () => {
    const platform = createPlatform();
    const mui = getBundledOfficialPlugin('mui');
    if (!mui) throw new Error('MUI bundled definition must exist.');
    await reconcile(platform, ['mui']);
    const firstSnapshot = platform.runtime.packages.getSnapshot(mui.pluginId);
    if (!firstSnapshot) throw new Error('MUI must be installed.');
    const cleanup = vi.fn(async () => {
      throw new Error('fixture surface cleanup failed');
    });
    platform.runtime.surfaceLeases.register(
      {
        pluginId: firstSnapshot.pluginId,
        installationId: firstSnapshot.installationId,
        generation: firstSnapshot.generation,
      },
      cleanup
    );

    const disabled = await reconcileBundledOfficialPlugins(
      platform.runtime.packages,
      []
    );
    expect(disabled.plan.disable.map((state) => state.pluginId)).toEqual([
      mui.pluginId,
    ]);
    expect(disabled.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OWNER_CLEANUP_FAILED
    );
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
    expect(
      platform.runtime.packages.getSnapshot(mui.pluginId)?.availability
    ).toBe('failed');
    expect(platform.queries.palette.getItemById('mui-button')).toBeUndefined();

    const reenabled = await reconcileBundledOfficialPlugins(
      platform.runtime.packages,
      ['mui']
    );
    expect(reenabled.plan.install.map((entry) => entry.catalogId)).toEqual([
      'mui',
    ]);
    expect(reenabled.plan.retain).toEqual([]);
    expect(
      reenabled.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
      )
    ).toEqual([]);
    expect(
      platform.runtime.packages.getSnapshot(mui.pluginId)?.generation
    ).toBeGreaterThan(firstSnapshot.generation);
    expect(platform.queries.palette.getItemById('mui-button')).toBeDefined();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight discovery before reconciling a newer desired state', async () => {
    const antd = getBundledOfficialPlugin('antd');
    const antdHost = BUNDLED_OFFICIAL_HOST_MODULE_CATALOG.find(
      (entry) => entry.pluginId === antd?.pluginId
    );
    if (!antd || !antdHost) {
      throw new Error(
        'Ant Design official package and Host Module must exist.'
      );
    }
    const loadStarted = createDeferred<void>();
    const releaseLoad = createDeferred<void>();
    const platform = createPlatform(
      BUNDLED_OFFICIAL_HOST_MODULE_CATALOG.map((entry) =>
        entry !== antdHost
          ? entry
          : {
              ...entry,
              load: async () => {
                loadStarted.resolve();
                await releaseLoad.promise;
                return entry.load();
              },
            }
      )
    );
    const controller = new AbortController();
    const stale = reconcileBundledOfficialPlugins(
      platform.runtime.packages,
      ['antd'],
      controller.signal
    );
    await loadStarted.promise;

    controller.abort('test-desired-state-replaced');
    const current = reconcileBundledOfficialPlugins(
      platform.runtime.packages,
      []
    );
    const staleResult = await stale;
    const currentResult = await current;
    releaseLoad.resolve();

    expect(staleResult.diagnostics.map((item) => item.code)).toContain(
      PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED
    );
    expect(currentResult.diagnostics).toEqual([]);
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
    expect(
      platform.runtime.packages.getSnapshot(antd.pluginId)
    ).toBeUndefined();
    expect(platform.queries.palette.getItemById('antd-button')).toBeUndefined();
    expect(platform.listOfficialImplementationBindings()).toEqual([]);
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);
  });

  it('reports a pre-canceled reconciliation without executing its plan', async () => {
    const platform = createPlatform();
    const installBundled = vi.fn(platform.runtime.packages.installBundled);
    const disable = vi.fn(platform.runtime.packages.disable);
    const packages = {
      ...platform.runtime.packages,
      installBundled,
      disable,
    } satisfies WebPluginPackageService;
    const controller = new AbortController();
    controller.abort('test-pre-canceled');

    const result = await reconcileBundledOfficialPlugins(
      packages,
      ['antd', 'mui', 'radix'],
      controller.signal
    );

    expect(result.plan).toMatchObject({
      install: [],
      replace: [],
      retain: [],
      disable: [],
      unknown: [],
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
    ]);
    expect(installBundled).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    expect(platform.runtime.packages.listBundledInstallations()).toEqual([]);
  });

  it('releases a canceled queued reconciliation without waiting for the active operation', async () => {
    const platform = createPlatform();
    const barrier = createFirstInstallReturnBarrier(platform);
    const active = reconcileBundledOfficialPlugins(barrier.packages, ['antd']);
    await barrier.firstInstallCompleted.promise;

    const controller = new AbortController();
    const queued = reconcileBundledOfficialPlugins(
      barrier.packages,
      ['mui'],
      controller.signal
    );
    controller.abort('test-queued-canceled');
    const queuedResult = await queued;

    barrier.releaseFirstInstallResult.resolve();
    const activeResult = await active;

    expect(queuedResult.plan).toMatchObject({
      install: [],
      replace: [],
      retain: [],
      disable: [],
      unknown: [],
    });
    expect(
      queuedResult.diagnostics.map((diagnostic) => diagnostic.code)
    ).toEqual([PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED]);
    expect(activeResult.diagnostics).toEqual([]);
    expect(barrier.installBundled).toHaveBeenCalledTimes(1);
    expect(
      platform.runtime.packages
        .listBundledInstallations()
        .map((installation) => installation.pluginId)
    ).toEqual([getBundledOfficialPlugin('antd')?.pluginId]);
  });

  it('stops a multi-library reconciliation after cancellation between operations', async () => {
    const platform = createPlatform();
    const barrier = createFirstInstallReturnBarrier(platform);
    const controller = new AbortController();
    const reconciliation = reconcileBundledOfficialPlugins(
      barrier.packages,
      ['antd', 'mui', 'radix'],
      controller.signal
    );
    await barrier.firstInstallCompleted.promise;

    controller.abort('test-multi-library-canceled');
    barrier.releaseFirstInstallResult.resolve();
    const result = await reconciliation;

    expect(result.plan.install.map((entry) => entry.catalogId)).toEqual([
      'antd',
      'mui',
      'radix',
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
    ]);
    expect(barrier.installBundled).toHaveBeenCalledTimes(1);
    expect(
      platform.runtime.packages
        .listBundledInstallations()
        .map((installation) => installation.pluginId)
    ).toEqual([getBundledOfficialPlugin('antd')?.pluginId]);
  });

  it.each(['antd', 'mui', 'radix'] as const)(
    'atomically replaces the real %s package artifact generation',
    async (catalogId) => {
      const entry = getBundledOfficialPlugin(catalogId);
      if (!entry) {
        throw new Error(`Missing bundled catalog entry ${catalogId}.`);
      }
      const currentHostModule = BUNDLED_OFFICIAL_HOST_MODULE_CATALOG.find(
        (candidate) => candidate.pluginId === entry.pluginId
      );
      if (!currentHostModule) {
        throw new Error(`Missing Host Module for ${entry.pluginId}.`);
      }
      const replacementArtifact = await createReplacementArtifact(
        entry.artifact,
        catalogId
      );
      const platform = createPlatform([
        ...BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
        Object.freeze({
          ...currentHostModule,
          packageDigest: replacementArtifact.packageDigest,
        }),
      ]);
      const installed = await reconcile(platform, [catalogId]);
      expect(installed.plan.install).toHaveLength(1);
      const firstGeneration = platform.runtime.packages.getSnapshot(
        entry.pluginId
      )?.generation;
      const expectedPaletteItems = paletteItemCount(platform);
      const expectedRuntimeTypes =
        platform.queries.extensions.getSnapshot()
          .externalComponentsByRuntimeType.size;

      const replaced = await platform.runtime.packages.installBundled(
        replacementArtifact,
        {
          installationId: `bundled:${entry.pluginId}`,
          sourceId: `bundled:${entry.pluginId}:${replacementArtifact.packageDigest}`,
          trustLevel: 'official',
          publisherVerified: true,
        }
      );

      expect(replaced.ok).toBe(true);
      if (!replaced.ok) return;
      expect(replaced.value.generation).toBeGreaterThan(firstGeneration ?? 0);
      expect(
        platform.runtime.packages
          .listBundledInstallations()
          .find((state) => state.pluginId === entry.pluginId)?.packageDigest
      ).toBe(replacementArtifact.packageDigest);
      expect(paletteItemCount(platform)).toBe(expectedPaletteItems);

      const extensions = platform.queries.extensions.getSnapshot();
      const componentOwners = [
        ...extensions.externalComponentsByRuntimeType.values(),
      ]
        .filter((component) => component.owner.pluginId === entry.pluginId)
        .map((component) => component.owner.generation);
      expect(componentOwners).toHaveLength(entry.metadata.components.length);
      expect(new Set(componentOwners)).toEqual(
        new Set([replaced.value.generation])
      );
      expect(extensions.externalComponentsByRuntimeType.size).toBe(
        expectedRuntimeTypes
      );
      expect(
        platform
          .listOfficialImplementationBindings()
          .filter((binding) => binding.owner.pluginId === entry.pluginId)
          .every(
            (binding) => binding.owner.generation === replaced.value.generation
          )
      ).toBe(true);
      expect(
        platform.runtime.packages.contributions
          .list('blueprintTemplate')
          .filter((record) => record.owner.pluginId === entry.pluginId)
          .every(
            (record) => record.owner.generation === replaced.value.generation
          )
      ).toBe(true);
    },
    30_000
  );

  it('creates direct and compound fragments and exports them through policy data', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['antd', 'mui', 'radix']);

    expect(
      platform.queries.palette.getCreationRecipe('antd-button')?.kind
    ).toBe('direct');
    expect(
      platform.queries.palette.getCreationRecipe('antd-form-item')?.kind
    ).toBe('template');
    expect(
      platform.queries.palette.getCreationRecipe('mui-accordion')?.kind
    ).toBe('template');
    expect(platform.queries.palette.getCreationRecipe('radix-tabs')?.kind).toBe(
      'template'
    );

    const directButton = insertPaletteItem(platform, 'antd-button');
    expect(
      directButton.doc.ui.graph.nodesById[directButton.nextNodeId]?.type
    ).toBe('AntdButton');

    const antdForm = insertPaletteItem(platform, 'antd-form-item');
    expect(antdForm.doc.ui.graph.nodesById[antdForm.nextNodeId]?.type).toBe(
      'AntdFormItem'
    );
    expect(
      antdForm.doc.ui.graph.childIdsById[antdForm.nextNodeId]?.map(
        (nodeId) => antdForm.doc.ui.graph.nodesById[nodeId]?.type
      )
    ).toEqual(['AntdInput']);

    const muiAccordion = insertPaletteItem(platform, 'mui-accordion');
    expect(
      muiAccordion.doc.ui.graph.childIdsById[muiAccordion.nextNodeId]?.map(
        (nodeId) => muiAccordion.doc.ui.graph.nodesById[nodeId]?.type
      )
    ).toEqual(['MuiAccordionSummary', 'MuiAccordionDetails']);

    const radixTabs = insertPaletteItem(platform, 'radix-tabs');
    expect(radixTabs.doc.ui.graph.nodesById[radixTabs.nextNodeId]?.type).toBe(
      'RadixTabsRoot'
    );
    expect(
      radixTabs.doc.ui.graph.childIdsById[radixTabs.nextNodeId]?.map(
        (nodeId) => radixTabs.doc.ui.graph.nodesById[nodeId]?.type
      )
    ).toEqual(['RadixTabsList', 'RadixTabsContent', 'RadixTabsContent']);

    const codegenPolicySnapshot =
      platform.queries.extensions.getSnapshot().codegenPolicy;
    const exports = [
      {
        bundle: generateReactBundle(antdForm.doc, { codegenPolicySnapshot }),
        dependency: 'antd',
        markers: ["from 'antd'", '<Form.Item', '<Input'],
      },
      {
        bundle: generateReactBundle(muiAccordion.doc, {
          codegenPolicySnapshot,
        }),
        dependency: '@mui/material',
        markers: [
          "from '@mui/material'",
          '<Accordion',
          '<AccordionSummary',
          '<AccordionDetails',
        ],
      },
      {
        bundle: generateReactBundle(radixTabs.doc, { codegenPolicySnapshot }),
        dependency: '@radix-ui/react-tabs',
        markers: ["from '@radix-ui/react-tabs'", '<Tabs.Root', '<Tabs.Trigger'],
      },
    ];
    exports.forEach(({ bundle, dependency, markers }) => {
      expect(
        bundle.diagnostics.filter(
          (diagnostic) => diagnostic.severity === 'error'
        )
      ).toEqual([]);
      expect(bundle.dependencies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: dependency,
            origin: expect.objectContaining({ license: 'MIT' }),
          }),
        ])
      );
      const app = bundle.files.find((file) => file.path === 'src/App.tsx');
      markers.forEach((marker) => expect(app?.contents).toContain(marker));
    });
  });

  it('renders real components in controlled surfaces and releases each owner', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['antd', 'mui', 'radix']);
    const extensions = platform.queries.extensions.getSnapshot();
    const registry = createRendererProjectionRegistry(extensions);
    expect(listIconNamesByProvider('ant-design-icons')).toContain('Search');
    expect(listIconNamesByProvider('mui-icons')).toContain('Add');
    const AntIcon = resolveIconRef({
      provider: 'ant-design-icons',
      name: 'Search',
    });
    const MuiIcon = resolveIconRef({ provider: 'mui-icons', name: 'Add' });
    if (!AntIcon || !MuiIcon) {
      throw new Error('Official icon providers must resolve static exports.');
    }
    const buttons: PIRDocument = {
      ...createDocument('Official Buttons'),
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: { id: 'root', type: 'PdxDiv' },
            antd: { id: 'antd', type: 'AntdButton', text: 'Ant action' },
            mui: { id: 'mui', type: 'MuiButton', text: 'Material action' },
          },
          childIdsById: { root: ['antd', 'mui'], antd: [], mui: [] },
        },
      },
    };
    const radixDialog = insertPaletteItem(platform, 'radix-dialog');

    const view = render(
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <span aria-label="Ant Design icon">
              <AntIcon size={18} />
            </span>
            <span aria-label="Material UI icon">
              <MuiIcon size={18} />
            </span>
            <PIRRenderer pirDoc={buttons} registry={registry} />
            <PIRRenderer
              pirDoc={radixDialog.doc}
              registry={registry}
              selectedId={radixDialog.nextNodeId}
            />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );

    expect(screen.getByRole('button', { name: 'Ant action' })).toBeTruthy();
    expect(screen.getByLabelText('Ant Design icon')).toBeTruthy();
    expect(screen.getByLabelText('Material UI icon')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Material action' })
    ).toBeTruthy();
    expect(
      await screen.findByRole('dialog', { name: 'Dialog title' })
    ).toBeTruthy();
    expect(
      platform.runtime.surfaceLeases
        .listSnapshots()
        .map((snapshot) => snapshot.owner.pluginId)
    ).toEqual(
      expect.arrayContaining([
        '@prodivix/plugin-antd',
        '@prodivix/plugin-mui',
        '@prodivix/plugin-radix',
      ])
    );

    await act(() => platform.runtime.packages.disable('@prodivix/plugin-mui'));
    expect(
      platform.runtime.surfaceLeases
        .listSnapshots()
        .some((snapshot) => snapshot.owner.pluginId === '@prodivix/plugin-mui')
    ).toBe(false);
    await act(() =>
      platform.runtime.packages.disable('@prodivix/plugin-radix')
    );
    await act(() => platform.runtime.packages.disable('@prodivix/plugin-antd'));
    expect(platform.runtime.surfaceLeases.listSnapshots()).toEqual([]);

    view.unmount();
  });

  it('remounts forced-open Canvas state when selection changes', async () => {
    const platform = createPlatform();
    await reconcile(platform, ['radix']);
    const registry = createRendererProjectionRegistry(
      platform.queries.extensions.getSnapshot()
    );
    const radixDialog = insertPaletteItem(platform, 'radix-dialog');
    const renderDialog = (selectedId?: string) => (
      <OfficialSurfaceLeaseRegistryContext.Provider
        value={platform.runtime.surfaceLeases}
      >
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <PIRRenderer
              pirDoc={radixDialog.doc}
              registry={registry}
              selectedId={selectedId}
            />
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );
    const view = render(renderDialog(radixDialog.nextNodeId));

    expect(
      await screen.findByRole('dialog', { name: 'Dialog title' })
    ).toBeTruthy();
    const selectedLeaseCount = platform.runtime.surfaceLeases
      .listSnapshots()
      .reduce((count, snapshot) => count + snapshot.leaseCount, 0);

    view.rerender(renderDialog());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Dialog title' })).toBeNull()
    );

    view.rerender(renderDialog(radixDialog.nextNodeId));
    expect(
      await screen.findByRole('dialog', { name: 'Dialog title' })
    ).toBeTruthy();
    expect(
      platform.runtime.surfaceLeases
        .listSnapshots()
        .reduce((count, snapshot) => count + snapshot.leaseCount, 0)
    ).toBe(selectedLeaseCount);

    view.unmount();
  });
});
