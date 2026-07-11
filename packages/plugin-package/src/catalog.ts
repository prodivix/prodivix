import type { BundledPluginArtifactV1 } from '#package/artifact';

export type GeneratedOfficialPluginSupportStatus =
  'supported' | 'template' | 'degraded';

export type GeneratedOfficialPluginHostImplementationKind =
  | 'component-library'
  | 'palette-projection'
  | 'render-policy'
  | 'icon-provider';

export type GeneratedOfficialPluginCatalog = Readonly<{
  schemaVersion: '1.0';
  catalogId: string;
  pluginId: string;
  displayName: string;
  description: string;
  libraryId: string;
  scope: 'component';
  package: Readonly<{
    name: string;
    version: string;
    license: string;
  }>;
  support: Readonly<{
    total: number;
    supported: number;
    template: number;
    degraded: number;
  }>;
  components: readonly Readonly<{
    path: string;
    exportName: string;
    runtimeType: string;
    paletteItemId?: string;
    support: GeneratedOfficialPluginSupportStatus;
    creation: 'direct' | 'template' | 'template-only';
  }>[];
  unsupportedRuntimeTypes?: readonly string[];
  hostImplementations: readonly Readonly<{
    id: string;
    kind: GeneratedOfficialPluginHostImplementationKind;
  }>[];
}>;

export type BundledPluginCatalogEntry<TMetadata = unknown> = Readonly<{
  catalogId: string;
  pluginId: string;
  artifact: BundledPluginArtifactV1;
  metadata: TMetadata;
}>;

export type BundledPluginCatalog<TMetadata = unknown> = Readonly<{
  entries: readonly BundledPluginCatalogEntry<TMetadata>[];
  get(catalogId: string): BundledPluginCatalogEntry<TMetadata> | undefined;
}>;

export type BundledPluginCatalogResult<TMetadata = unknown> =
  | Readonly<{ ok: true; catalog: BundledPluginCatalog<TMetadata> }>
  | Readonly<{ ok: false; message: string; catalogId?: string }>;

export type BundledPluginInstallationState = Readonly<{
  pluginId: string;
  packageDigest: string;
}>;

export type BundledPluginReconciliationPlan<TMetadata = unknown> = Readonly<{
  install: readonly BundledPluginCatalogEntry<TMetadata>[];
  replace: readonly BundledPluginCatalogEntry<TMetadata>[];
  retain: readonly BundledPluginCatalogEntry<TMetadata>[];
  disable: readonly BundledPluginInstallationState[];
  unknown: readonly string[];
}>;

export const createBundledPluginCatalog = <TMetadata>(
  entries: readonly BundledPluginCatalogEntry<TMetadata>[]
): BundledPluginCatalogResult<TMetadata> => {
  const byCatalogId = new Map<string, BundledPluginCatalogEntry<TMetadata>>();
  const pluginIds = new Set<string>();
  for (const entry of entries) {
    const catalogId = entry.catalogId.trim();
    const pluginId = entry.pluginId.trim();
    if (!catalogId || !pluginId) {
      return {
        ok: false,
        message: 'Bundled plugin catalog identities cannot be empty.',
      };
    }
    if (byCatalogId.has(catalogId)) {
      return {
        ok: false,
        message: 'Bundled plugin catalog id is duplicated.',
        catalogId,
      };
    }
    if (pluginIds.has(pluginId)) {
      return {
        ok: false,
        message: 'Bundled plugin id is duplicated.',
        catalogId,
      };
    }
    const frozen = Object.freeze({ ...entry, catalogId, pluginId });
    byCatalogId.set(catalogId, frozen);
    pluginIds.add(pluginId);
  }
  const sorted = Object.freeze(
    [...byCatalogId.values()].sort((left, right) =>
      left.catalogId.localeCompare(right.catalogId)
    )
  );
  return {
    ok: true,
    catalog: Object.freeze({
      entries: sorted,
      get: (catalogId: string) => byCatalogId.get(catalogId),
    }),
  };
};

export const planBundledPluginReconciliation = <TMetadata>(
  desiredCatalogIds: readonly string[],
  current: readonly BundledPluginInstallationState[],
  catalog: BundledPluginCatalog<TMetadata>
): BundledPluginReconciliationPlan<TMetadata> => {
  const desired = [
    ...new Set(desiredCatalogIds.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  const currentByPluginId = new Map(
    current.map((state) => [state.pluginId, state])
  );
  const desiredPluginIds = new Set<string>();
  const install: BundledPluginCatalogEntry<TMetadata>[] = [];
  const replace: BundledPluginCatalogEntry<TMetadata>[] = [];
  const retain: BundledPluginCatalogEntry<TMetadata>[] = [];
  const unknown: string[] = [];

  desired.forEach((catalogId) => {
    const entry = catalog.get(catalogId);
    if (!entry) {
      unknown.push(catalogId);
      return;
    }
    desiredPluginIds.add(entry.pluginId);
    const state = currentByPluginId.get(entry.pluginId);
    if (!state) {
      install.push(entry);
    } else if (state.packageDigest === entry.artifact.packageDigest) {
      retain.push(entry);
    } else {
      replace.push(entry);
    }
  });

  const disable = current
    .filter((state) => !desiredPluginIds.has(state.pluginId))
    .sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  return Object.freeze({
    install: Object.freeze(install),
    replace: Object.freeze(replace),
    retain: Object.freeze(retain),
    disable: Object.freeze(disable),
    unknown: Object.freeze(unknown),
  });
};
