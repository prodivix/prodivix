import { useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createEmptyPirDocument, type PIRDocument } from '@prodivix/pir';
import {
  createWorkspacePirProjectionPlan,
  type WorkspacePirProjectionPlan,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { applyPaletteItemInsertion } from '@/editor/features/blueprint/editor/model/paletteCreation';
import '@/index.css';
import {
  PIRRenderer,
  type PIRRendererBlockingIssue,
  type PIRRendererHost,
} from '@prodivix/pir-react-renderer';
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
import { createPirWebRendererHost } from '@/pir/pirWebRendererHost';

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
  antdButton: WorkspacePirProjectionPlan;
  muiButton: WorkspacePirProjectionPlan;
  radixAccordion: WorkspacePirProjectionPlan;
  radixTabs: WorkspacePirProjectionPlan;
  radixDialog: WorkspacePirProjectionPlan;
  radixTooltip: WorkspacePirProjectionPlan;
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
  ...createEmptyPirDocument({ rootType: 'div' }),
  metadata: { name },
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
  if (node?.kind !== 'element') {
    throw new Error('Inserted Palette item has no primary Element node.');
  }
  return {
    ...inserted.doc,
    ui: {
      ...inserted.doc.ui,
      graph: {
        ...inserted.doc.ui.graph,
        nodesById: {
          ...inserted.doc.ui.graph.nodesById,
          [inserted.nextNodeId]: {
            ...node,
            text: { kind: 'literal', value: text },
          },
        },
      },
    },
  };
};

const createProjectionPlan = (
  documentId: string,
  document: PIRDocument
): WorkspacePirProjectionPlan => {
  const documentNodeId = `node:${documentId}`;
  const workspace: WorkspaceSnapshot = {
    id: 'official-component-plugin-conformance',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 0,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: [documentNodeId],
      },
      [documentNodeId]: {
        id: documentNodeId,
        kind: 'doc',
        name: `${documentId}.pir.json`,
        parentId: 'root',
        docId: documentId,
      },
    },
    docsById: {
      [documentId]: {
        id: documentId,
        type: 'pir-page',
        path: `/${documentId}.pir.json`,
        contentRev: 1,
        metaRev: 1,
        content: document,
      },
    },
    routeManifest: {
      version: '1',
      root: { id: `route:${documentId}`, pageDocId: documentId },
    },
    activeDocumentId: documentId,
  };
  const projection = createWorkspacePirProjectionPlan({
    workspace,
    entryDocumentId: documentId,
  });
  if (projection.status === 'blocked') {
    throw new Error(
      `PIR-current projection failed: ${projection.issues.map(({ code, message }) => `${code}: ${message}`).join('; ')}`
    );
  }
  return projection.plan;
};

const createHarnessDocuments = (
  platform: WebPluginPlatform
): HarnessDocuments =>
  Object.freeze({
    antdButton: createProjectionPlan(
      'antd-button',
      withPrimaryText(
        insertPaletteItem(platform, 'antd-button'),
        'Ant Design action'
      )
    ),
    muiButton: createProjectionPlan(
      'mui-button',
      withPrimaryText(
        insertPaletteItem(platform, 'mui-button'),
        'Material UI action'
      )
    ),
    radixAccordion: createProjectionPlan(
      'radix-accordion',
      insertPaletteItem(platform, 'radix-accordion').doc
    ),
    radixTabs: createProjectionPlan(
      'radix-tabs',
      insertPaletteItem(platform, 'radix-tabs').doc
    ),
    radixDialog: createProjectionPlan(
      'radix-dialog',
      insertPaletteItem(platform, 'radix-dialog').doc
    ),
    radixTooltip: createProjectionPlan(
      'radix-tooltip',
      insertPaletteItem(platform, 'radix-tooltip').doc
    ),
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
  const extensions = platform.queries.extensions.getSnapshot();
  const host = useMemo(
    () =>
      createPirWebRendererHost(createRendererProjectionRegistry(extensions)),
    [extensions]
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
                <HarnessRenderer plan={documents.antdButton} host={host} />
              </section>
              <section
                aria-label="Material UI render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Material UI</h2>
                <HarnessRenderer plan={documents.muiButton} host={host} />
              </section>
              <section
                aria-label="Radix Accordion render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Accordion</h2>
                <HarnessRenderer plan={documents.radixAccordion} host={host} />
              </section>
              <section aria-label="Radix Tabs render" className="border-t pt-4">
                <h2 className="mb-3 text-base font-semibold">Tabs</h2>
                <HarnessRenderer plan={documents.radixTabs} host={host} />
              </section>
              <section
                aria-label="Radix Dialog render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Dialog</h2>
                <HarnessRenderer plan={documents.radixDialog} host={host} />
              </section>
              <section
                aria-label="Radix Tooltip render"
                className="border-t pt-4"
              >
                <h2 className="mb-3 text-base font-semibold">Tooltip</h2>
                <HarnessRenderer plan={documents.radixTooltip} host={host} />
              </section>
            </div>
          </OfficialReactSurfaceBoundary>
        </div>
      </main>
    </OfficialSurfaceLeaseRegistryContext.Provider>
  );
}

const ignoreTrigger = () => {};

function HarnessRenderer({
  plan,
  host,
}: Readonly<{
  plan: WorkspacePirProjectionPlan;
  host: PIRRendererHost;
}>) {
  const [blockingIssues, setBlockingIssues] = useState<
    readonly PIRRendererBlockingIssue[]
  >([]);
  return (
    <>
      <PIRRenderer
        plan={plan}
        host={host}
        dispatchTrigger={ignoreTrigger}
        onBlockingIssues={setBlockingIssues}
      />
      {blockingIssues.length > 0 ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {blockingIssues
            .map(({ code, message }) => `${code}: ${message}`)
            .join('; ')}
        </p>
      ) : null}
    </>
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
