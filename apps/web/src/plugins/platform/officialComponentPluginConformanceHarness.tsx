import { createRoot, type Root } from 'react-dom/client';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import '@/index.css';
import { PIRRenderer } from '@prodivix/pir-react-renderer';
import {
  BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
  BUNDLED_OFFICIAL_PLUGIN_CATALOG,
  createRendererProjectionRegistry,
  createWebPluginPlatform,
  reconcileBundledOfficialPlugins,
  type WebPluginPlatform,
} from '@/plugins/platform';
import {
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';

type HarnessPhase = 'ready' | 'disabled' | 'shutdown';

type PluginLifecycleSnapshot = Readonly<{
  pluginId: string;
  installationId: string;
  generation: number;
  availability: string;
}>;

type SurfaceLeaseLifecycleSnapshot = Readonly<{
  pluginId: string;
  installationId: string;
  generation: number;
  leaseCount: number;
}>;

type OfficialComponentPluginConformanceSnapshot = Readonly<{
  phase: HarnessPhase;
  workspaceId: string;
  catalogIds: readonly string[];
  pluginSnapshotCount: number;
  plugins: readonly PluginLifecycleSnapshot[];
  contributionCount: number;
  implementationCount: number;
  surfaceLeaseCount: number;
  surfaceLeases: readonly SurfaceLeaseLifecycleSnapshot[];
  paletteItemCount: number;
  templateCount: number;
  rendererComponentCount: number;
}>;

type OfficialComponentPluginConformanceApi = Readonly<{
  ready(): Promise<OfficialComponentPluginConformanceSnapshot>;
  snapshot(): Promise<OfficialComponentPluginConformanceSnapshot>;
  disableAll(): Promise<OfficialComponentPluginConformanceSnapshot>;
  reinstallAll(): Promise<OfficialComponentPluginConformanceSnapshot>;
  shutdown(): Promise<OfficialComponentPluginConformanceSnapshot>;
}>;

type HarnessDocuments = Readonly<{
  antdButton: PIRDocument;
  muiButton: PIRDocument;
  radixAccordion: PIRDocument;
  radixTabs: PIRDocument;
  radixDialog: PIRDocument;
  radixTooltip: PIRDocument;
}>;

type HarnessController = Readonly<{
  snapshot(): OfficialComponentPluginConformanceSnapshot;
  disableAll(): Promise<OfficialComponentPluginConformanceSnapshot>;
  reinstallAll(): Promise<OfficialComponentPluginConformanceSnapshot>;
  shutdown(): Promise<OfficialComponentPluginConformanceSnapshot>;
}>;

declare global {
  interface Window {
    prodivixOfficialComponentPluginConformance: OfficialComponentPluginConformanceApi;
  }
}

const desiredCatalogIds = Object.freeze(['antd', 'mui', 'radix'] as const);

const createDocument = (name: string): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name },
  ui: {
    graph: {
      version: 1,
      rootId: 'root',
      nodesById: {
        root: { id: 'root', type: 'div' },
      },
      childIdsById: { root: [] },
    },
  },
});

const insertPaletteItem = (platform: WebPluginPlatform, itemId: string) => {
  const inserted = applyPaletteItemInsertion(
    createDocument(`Official plugin conformance: ${itemId}`),
    platform.queries.palette,
    {
      workspaceId: platform.workspaceId,
      documentId: `official-plugin-conformance:${itemId}`,
      documentType: 'pir-page',
      itemId,
      preferredTargetId: 'root',
      commandId: `official-plugin-conformance:${itemId}:insert`,
      issuedAt: '2026-07-11T00:00:00.000Z',
    }
  );
  if (inserted.ok === false) {
    throw new Error(`${itemId} insertion failed: ${inserted.reason}`);
  }
  return inserted;
};

const withPrimaryText = (
  inserted: ReturnType<typeof insertPaletteItem>,
  text: string
): PIRDocument => {
  const node = inserted.doc.ui.graph.nodesById[inserted.nextNodeId];
  if (!node) throw new Error('Inserted Palette item has no primary node.');
  return {
    ...inserted.doc,
    ui: {
      ...inserted.doc.ui,
      graph: {
        ...inserted.doc.ui.graph,
        nodesById: {
          ...inserted.doc.ui.graph.nodesById,
          [inserted.nextNodeId]: { ...node, text },
        },
      },
    },
  };
};

const createHarnessDocuments = (
  platform: WebPluginPlatform
): HarnessDocuments =>
  Object.freeze({
    antdButton: withPrimaryText(
      insertPaletteItem(platform, 'antd-button'),
      'Ant Design action'
    ),
    muiButton: withPrimaryText(
      insertPaletteItem(platform, 'mui-button'),
      'Material UI action'
    ),
    radixAccordion: insertPaletteItem(platform, 'radix-accordion').doc,
    radixTabs: insertPaletteItem(platform, 'radix-tabs').doc,
    radixDialog: insertPaletteItem(platform, 'radix-dialog').doc,
    radixTooltip: insertPaletteItem(platform, 'radix-tooltip').doc,
  });

const waitForPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

const formatDiagnostics = (
  diagnostics: readonly Readonly<{ code: string; message: string }>[]
) => diagnostics.map(({ code, message }) => `${code}: ${message}`).join('; ');

const assertLifecycleResult = (
  action: string,
  result: Awaited<ReturnType<WebPluginPlatform['shutdown']>>
) => {
  const errors = result.diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
  );
  if (result.ok === false || errors.length > 0) {
    throw new Error(
      `${action} failed: ${formatDiagnostics(result.diagnostics)}`
    );
  }
};

function ConformanceApp({
  platform,
  documents,
  phase,
}: Readonly<{
  platform: WebPluginPlatform;
  documents: HarnessDocuments;
  phase: HarnessPhase;
}>) {
  const registry = createRendererProjectionRegistry(
    platform.queries.extensions.getSnapshot()
  );
  const status =
    phase === 'ready'
      ? 'Ready'
      : phase === 'disabled'
        ? 'Disabled'
        : 'Shutdown';
  return (
    <OfficialSurfaceLeaseRegistryContext.Provider
      value={platform.runtime.surfaceLeases}
    >
      <main className="min-h-screen bg-neutral-50 p-6 text-neutral-950">
        <header className="mb-6 border-b border-neutral-300 pb-4">
          <h1 className="text-2xl font-semibold">
            Official component plugin conformance
          </h1>
          <p role="status" aria-live="polite" className="mt-2 text-sm">
            {status}
          </p>
        </header>
        <div className="relative min-h-[620px]">
          <OfficialReactSurfaceBoundary>
            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-label="Ant Design render" className="border-t pt-4">
                <h2 className="mb-3 text-base font-semibold">Ant Design</h2>
                <PIRRenderer
                  pirDoc={documents.antdButton}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
              <section
                aria-label="Material UI render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Material UI</h2>
                <PIRRenderer
                  pirDoc={documents.muiButton}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
              <section
                aria-label="Radix Accordion render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Accordion</h2>
                <PIRRenderer
                  pirDoc={documents.radixAccordion}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
              <section aria-label="Radix Tabs render" className="border-t pt-4">
                <h2 className="mb-3 text-base font-semibold">Tabs</h2>
                <PIRRenderer
                  pirDoc={documents.radixTabs}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
              <section
                aria-label="Radix Dialog render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Dialog</h2>
                <PIRRenderer
                  pirDoc={documents.radixDialog}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
              <section
                aria-label="Radix Tooltip render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Tooltip</h2>
                <PIRRenderer
                  pirDoc={documents.radixTooltip}
                  registry={registry}
                  interactionMode="interactive"
                />
              </section>
            </div>
          </OfficialReactSurfaceBoundary>
        </div>
      </main>
    </OfficialSurfaceLeaseRegistryContext.Provider>
  );
}

const createSnapshot = (
  platform: WebPluginPlatform,
  phase: HarnessPhase
): OfficialComponentPluginConformanceSnapshot => {
  const reader = platform.runtime.packages.contributions;
  const extensions = platform.queries.extensions.getSnapshot();
  const palette = platform.queries.palette.getSnapshot();
  const plugins = Object.freeze(
    platform.runtime.packages.listSnapshots().map((snapshot) =>
      Object.freeze({
        pluginId: snapshot.pluginId,
        installationId: snapshot.installationId,
        generation: snapshot.generation,
        availability: snapshot.availability,
      })
    )
  );
  const surfaceLeases = Object.freeze(
    platform.runtime.surfaceLeases.listSnapshots().map((snapshot) =>
      Object.freeze({
        pluginId: snapshot.owner.pluginId,
        installationId: snapshot.owner.installationId,
        generation: snapshot.owner.generation,
        leaseCount: snapshot.leaseCount,
      })
    )
  );
  return Object.freeze({
    phase,
    workspaceId: platform.workspaceId,
    catalogIds: Object.freeze(
      BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map((entry) => entry.catalogId)
    ),
    pluginSnapshotCount: plugins.length,
    plugins,
    contributionCount:
      reader.list('paletteContribution').length +
      reader.list('externalLibrary').length +
      reader.list('blueprintTemplate').length +
      reader.list('renderPolicy').length +
      reader.list('codegenPolicy').length +
      reader.list('iconProvider').length,
    implementationCount: platform.listOfficialImplementationBindings().length,
    surfaceLeaseCount: surfaceLeases.reduce(
      (count, snapshot) => count + snapshot.leaseCount,
      0
    ),
    surfaceLeases,
    paletteItemCount: palette.groups.reduce(
      (count, group) => count + group.items.length,
      0
    ),
    templateCount: reader
      .list('blueprintTemplate')
      .reduce(
        (count, record) => count + record.value.descriptor.templates.length,
        0
      ),
    rendererComponentCount: extensions.rendererComponents.length,
  });
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Conformance root element is missing.');
const root = createRoot(rootElement);

const renderFailure = (target: Root, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  target.render(
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">
        Official component plugin conformance
      </h1>
      <p role="alert" className="mt-4 text-red-700">
        {message}
      </p>
    </main>
  );
};

const createHarnessController = async (): Promise<HarnessController> => {
  const catalogIds = BUNDLED_OFFICIAL_PLUGIN_CATALOG.entries.map(
    (entry) => entry.catalogId
  );
  if (catalogIds.join(',') !== desiredCatalogIds.join(',')) {
    throw new Error(
      `Official plugin catalog mismatch: expected ${desiredCatalogIds.join(',')}, received ${catalogIds.join(',')}.`
    );
  }
  const platformResult = createWebPluginPlatform({
    workspaceId: 'official-component-plugin-conformance',
    officialHostModules: BUNDLED_OFFICIAL_HOST_MODULE_CATALOG,
  });
  if (platformResult.ok === false) {
    throw new Error(
      `Official plugin platform initialization failed: ${formatDiagnostics(platformResult.diagnostics)}`
    );
  }
  const platform = platformResult.value;
  const installed = await reconcileBundledOfficialPlugins(
    platform.runtime.packages,
    desiredCatalogIds
  );
  const installErrors = installed.diagnostics.filter(
    (diagnostic) =>
      diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
  );
  if (
    installErrors.length > 0 ||
    installed.plan.install.length !== desiredCatalogIds.length ||
    installed.plan.unknown.length > 0
  ) {
    await platform.shutdown();
    throw new Error(
      `Official plugin installation failed: ${formatDiagnostics(installErrors) || 'catalog reconciliation did not install all three packages.'}`
    );
  }
  const documents = createHarnessDocuments(platform);
  let phase: HarnessPhase = 'ready';
  const render = () =>
    root.render(<ConformanceApp {...{ platform, documents, phase }} />);
  render();
  await waitForPaint();

  return Object.freeze({
    snapshot: () => createSnapshot(platform, phase),
    disableAll: async () => {
      const disabled = await reconcileBundledOfficialPlugins(
        platform.runtime.packages,
        []
      );
      const errors = disabled.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
      );
      if (errors.length > 0) {
        throw new Error(
          `Official plugin disable failed: ${formatDiagnostics(errors)}`
        );
      }
      phase = 'disabled';
      const cleanupSnapshot = createSnapshot(platform, phase);
      render();
      await waitForPaint();
      return cleanupSnapshot;
    },
    reinstallAll: async () => {
      const reinstalled = await reconcileBundledOfficialPlugins(
        platform.runtime.packages,
        desiredCatalogIds
      );
      const errors = reinstalled.diagnostics.filter(
        (diagnostic) =>
          diagnostic.severity === 'error' || diagnostic.severity === 'fatal'
      );
      if (
        errors.length > 0 ||
        reinstalled.plan.install.length !== desiredCatalogIds.length ||
        reinstalled.plan.replace.length > 0 ||
        reinstalled.plan.disable.length > 0 ||
        reinstalled.plan.unknown.length > 0
      ) {
        throw new Error(
          `Official plugin reinstallation failed: ${formatDiagnostics(errors) || 'catalog reconciliation did not reinstall all three packages.'}`
        );
      }
      phase = 'ready';
      render();
      await waitForPaint();
      return createSnapshot(platform, phase);
    },
    shutdown: async () => {
      const result = await platform.shutdown();
      assertLifecycleResult('Official plugin platform shutdown', result);
      phase = 'shutdown';
      const cleanupSnapshot = createSnapshot(platform, phase);
      render();
      await waitForPaint();
      return cleanupSnapshot;
    },
  });
};

const controllerResult = createHarnessController()
  .then((controller) => Object.freeze({ ok: true as const, controller }))
  .catch((error: unknown) => {
    renderFailure(root, error);
    return Object.freeze({ ok: false as const, error });
  });

const getController = async () => {
  const result = await controllerResult;
  if (result.ok === false) throw result.error;
  return result.controller;
};

window.prodivixOfficialComponentPluginConformance = Object.freeze({
  ready: async () => (await getController()).snapshot(),
  snapshot: async () => (await getController()).snapshot(),
  disableAll: async () => (await getController()).disableAll(),
  reinstallAll: async () => (await getController()).reinstallAll(),
  shutdown: async () => (await getController()).shutdown(),
});
