import { ANTD_OFFICIAL_PLUGIN } from '@prodivix/plugin-antd';
import { MUI_OFFICIAL_PLUGIN } from '@prodivix/plugin-mui';
import { RADIX_OFFICIAL_PLUGIN } from '@prodivix/plugin-radix';
import {
  createBundledPluginCatalog,
  planBundledPluginReconciliation,
  type BundledPluginArtifactV1,
  type BundledPluginReconciliationPlan,
  type GeneratedOfficialPluginCatalog,
} from '@prodivix/plugin-package';
import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnostic,
} from '@prodivix/plugin-contracts';
import type { PIRNode } from '@prodivix/pir';
import type { OfficialHostModuleCatalogEntry } from '@prodivix/plugin-react-host';
import type {
  RendererComponentProjection,
  WebPluginPackageService,
} from '@/plugins/platform/types';

type BundledOfficialReactPlugin = Readonly<{
  artifact: BundledPluginArtifactV1;
  catalog: GeneratedOfficialPluginCatalog;
  loadHostModule: OfficialHostModuleCatalogEntry['load'];
}>;

const definitions: readonly BundledOfficialReactPlugin[] = Object.freeze([
  ANTD_OFFICIAL_PLUGIN,
  MUI_OFFICIAL_PLUGIN,
  RADIX_OFFICIAL_PLUGIN,
]);

const runtimeOwnerByType = new Map<
  string,
  Readonly<{
    catalogId: string;
    pluginId: string;
    displayName: string;
    libraryId: string;
    availability: 'catalog' | 'unsupported';
  }>
>();
const registerRuntimeOwner = (
  definition: BundledOfficialReactPlugin,
  runtimeType: string,
  availability: 'catalog' | 'unsupported'
) => {
  const current = runtimeOwnerByType.get(runtimeType);
  if (current) {
    if (
      current.pluginId !== definition.catalog.pluginId ||
      current.availability !== availability
    ) {
      throw new Error(
        `Official runtime type ${JSON.stringify(runtimeType)} has multiple package owners or support states.`
      );
    }
    return;
  }
  runtimeOwnerByType.set(
    runtimeType,
    Object.freeze({
      catalogId: definition.catalog.catalogId,
      pluginId: definition.catalog.pluginId,
      displayName: definition.catalog.displayName,
      libraryId: definition.catalog.libraryId,
      availability,
    })
  );
};
definitions.forEach((definition) => {
  definition.catalog.components.forEach((component) =>
    registerRuntimeOwner(definition, component.runtimeType, 'catalog')
  );
  (definition.catalog.unsupportedRuntimeTypes ?? []).forEach((runtimeType) =>
    registerRuntimeOwner(definition, runtimeType, 'unsupported')
  );
});

const catalogResult =
  createBundledPluginCatalog<GeneratedOfficialPluginCatalog>(
    definitions.map((definition) => ({
      catalogId: definition.catalog.catalogId,
      pluginId: definition.catalog.pluginId,
      artifact: definition.artifact,
      metadata: definition.catalog,
    }))
  );
if (catalogResult.ok === false) {
  throw new Error(
    `Bundled official plugin catalog is invalid: ${catalogResult.message}`
  );
}

export const BUNDLED_OFFICIAL_PLUGIN_CATALOG = catalogResult.catalog;

export const BUNDLED_OFFICIAL_HOST_MODULE_CATALOG = Object.freeze(
  definitions.map((definition): OfficialHostModuleCatalogEntry =>
    Object.freeze({
      pluginId: definition.catalog.pluginId,
      packageDigest: definition.artifact.packageDigest,
      load: definition.loadHostModule,
    })
  )
);

export const getBundledOfficialPlugin = (catalogId: string) =>
  BUNDLED_OFFICIAL_PLUGIN_CATALOG.get(catalogId.trim());

export const collectUnavailableBundledOfficialComponentDiagnostics = (
  nodesById: Readonly<Record<string, PIRNode>>,
  rendererComponents: readonly RendererComponentProjection[]
): readonly PluginDiagnostic[] => {
  const effectiveRendererByRuntimeType = new Map(
    rendererComponents.map((projection) => [projection.runtimeType, projection])
  );
  return Object.values(nodesById)
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((node) => {
      if (node.kind !== 'element') return [];
      const owner = runtimeOwnerByType.get(node.type);
      const renderer = effectiveRendererByRuntimeType.get(node.type);
      if (
        !owner ||
        (owner.availability === 'catalog' &&
          renderer?.owner.pluginId === owner.pluginId &&
          renderer.libraryId === owner.libraryId)
      ) {
        return [];
      }
      const unsupported = owner.availability === 'unsupported';
      return [
        createPluginDiagnostic(
          unsupported
            ? PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNSUPPORTED
            : PLUGIN_DIAGNOSTIC_CODES.OFFICIAL_COMPONENT_UNAVAILABLE,
          unsupported
            ? `${owner.displayName} no longer supports legacy runtime type ${JSON.stringify(node.type)}.`
            : `${owner.displayName} component ${JSON.stringify(node.type)} is unavailable in the current workspace.`,
          {
            pluginId: owner.pluginId,
            catalogId: owner.catalogId,
            libraryId: owner.libraryId,
            runtimeType: node.type,
            nodeId: node.id,
            reasonCode: unsupported
              ? 'official-component-runtime-unsupported'
              : 'official-component-runtime-unavailable',
          }
        ),
      ];
    });
};

export type BundledOfficialPluginReconciliationResult = Readonly<{
  plan: BundledPluginReconciliationPlan<GeneratedOfficialPluginCatalog>;
  diagnostics: readonly PluginDiagnostic[];
}>;

const EMPTY_RECONCILIATION_PLAN = Object.freeze({
  install: Object.freeze([]),
  replace: Object.freeze([]),
  retain: Object.freeze([]),
  disable: Object.freeze([]),
  unknown: Object.freeze([]),
}) satisfies BundledPluginReconciliationPlan<GeneratedOfficialPluginCatalog>;

const createCanceledReconciliationResult = (
  plan: BundledPluginReconciliationPlan<GeneratedOfficialPluginCatalog> = EMPTY_RECONCILIATION_PLAN,
  diagnostics: readonly PluginDiagnostic[] = []
): BundledOfficialPluginReconciliationResult =>
  Object.freeze({
    plan,
    diagnostics: Object.freeze(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED
      )
        ? [...diagnostics]
        : [
            ...diagnostics,
            createPluginDiagnostic(
              PLUGIN_DIAGNOSTIC_CODES.OPERATION_SUPERSEDED,
              'Bundled official plugin reconciliation was canceled.',
              {
                reasonCode: 'bundled-official-reconciliation-canceled',
              }
            ),
          ]
    ),
  });

const reconciliationTails = new WeakMap<
  WebPluginPackageService,
  Promise<void>
>();

const waitForReconciliationTurn = (
  ready: Promise<void>,
  signal?: AbortSignal
): Promise<boolean> => {
  if (!signal) return ready.then(() => true);
  if (signal.aborted) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (acquired: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', handleAbort);
      resolve(acquired);
    };
    const handleAbort = () => finish(false);
    signal.addEventListener('abort', handleAbort, { once: true });
    void ready.then(() => finish(!signal.aborted));
  });
};

const acquireReconciliation = async (
  packages: WebPluginPackageService,
  signal?: AbortSignal
) => {
  if (signal?.aborted) return undefined;

  const previous = reconciliationTails.get(packages) ?? Promise.resolve();
  const ready = previous.catch(() => undefined);
  let releaseGate = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const tail = ready.then(() => gate);
  reconciliationTails.set(packages, tail);

  const acquired = await waitForReconciliationTurn(ready, signal);
  if (!acquired) {
    releaseGate();
    void tail.then(() => {
      if (reconciliationTails.get(packages) === tail) {
        reconciliationTails.delete(packages);
      }
    });
    return undefined;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseGate();
    if (reconciliationTails.get(packages) === tail) {
      reconciliationTails.delete(packages);
    }
  };
};

/**
 * Reconciles workspace component-library ids against bundled package digests.
 * Each operation is independent: a failed candidate replacement leaves the
 * current generation and every other plugin installation untouched.
 */
export const reconcileBundledOfficialPlugins = async (
  packages: WebPluginPackageService,
  desiredLibraryIds: readonly string[],
  signal?: AbortSignal
): Promise<BundledOfficialPluginReconciliationResult> => {
  const release = await acquireReconciliation(packages, signal);
  if (!release) return createCanceledReconciliationResult();

  try {
    if (signal?.aborted) return createCanceledReconciliationResult();

    const plan = planBundledPluginReconciliation(
      desiredLibraryIds,
      packages.listBundledInstallations(),
      BUNDLED_OFFICIAL_PLUGIN_CATALOG
    );
    const diagnostics: PluginDiagnostic[] = plan.unknown.map((catalogId) =>
      createPluginDiagnostic(
        PLUGIN_DIAGNOSTIC_CODES.BUNDLED_OFFICIAL_LIBRARY_NOT_FOUND,
        `Bundled official component library ${JSON.stringify(catalogId)} is not available in this Host build.`,
        {
          catalogId,
          libraryId: catalogId,
          reasonCode: 'bundled-official-library-not-found',
        }
      )
    );

    for (const entry of [...plan.install, ...plan.replace]) {
      if (signal?.aborted) {
        return createCanceledReconciliationResult(plan, diagnostics);
      }
      const result = await packages.installBundled(entry.artifact, {
        installationId: `bundled:${entry.pluginId}`,
        sourceId: `bundled:${entry.pluginId}:${entry.artifact.packageDigest}`,
        trustLevel: 'official',
        publisherVerified: true,
        ...(signal ? { signal } : {}),
      });
      diagnostics.push(...result.diagnostics);
      if (signal?.aborted) {
        return createCanceledReconciliationResult(plan, diagnostics);
      }
    }
    for (const state of plan.disable) {
      if (signal?.aborted) {
        return createCanceledReconciliationResult(plan, diagnostics);
      }
      const result = await packages.disable(state.pluginId);
      diagnostics.push(...result.diagnostics);
      if (signal?.aborted) {
        return createCanceledReconciliationResult(plan, diagnostics);
      }
    }
    return Object.freeze({
      plan,
      diagnostics: Object.freeze(diagnostics),
    });
  } finally {
    release();
  }
};
