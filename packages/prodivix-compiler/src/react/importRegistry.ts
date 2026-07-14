import type { AdapterImportSpec } from '#src/core/adapter';
import { resolvePackageImport } from '#src/core/packageResolver';
import { createExportPackageOrigin } from '#src/export/packageOriginResolver';
import { dedupeExportImportIntents } from '#src/export/importPlanner';
import type { ExportDependency, ExportImportIntent } from '#src/export/types';
import type { PackageResolverOptions } from '#src/core/packageResolver';

const toIdentifier = (value: string): string => {
  const candidate = value.replace(/[^a-zA-Z0-9_$]/g, '_');
  return /^[a-zA-Z_$]/.test(candidate) ? candidate : `_${candidate}`;
};

const adapterImportKey = (item: AdapterImportSpec): string =>
  `${item.kind}\u0000${item.source}\u0000${item.imported}\u0000${item.local ?? ''}`;

export class PIRReactImportRegistry {
  private readonly adapterLocalByKey = new Map<string, string>();
  private readonly internalLocalByTarget = new Map<string, string>();
  private readonly usedLocals = new Map<string, string>();
  private readonly intents: ExportImportIntent[] = [];
  private readonly dependenciesByName = new Map<string, ExportDependency>();

  constructor(private readonly packageResolver?: PackageResolverOptions) {}

  addInternalDefault(targetModuleId: string, local: string): string {
    const existing = this.internalLocalByTarget.get(targetModuleId);
    if (existing) return existing;
    const key = `internal\u0000${targetModuleId}`;
    const requested = toIdentifier(local);
    let resolvedLocal = requested;
    let suffix = 2;
    while (
      this.usedLocals.has(resolvedLocal) &&
      this.usedLocals.get(resolvedLocal) !== key
    ) {
      resolvedLocal = `${requested}${suffix}`;
      suffix += 1;
    }
    this.usedLocals.set(resolvedLocal, key);
    this.internalLocalByTarget.set(targetModuleId, resolvedLocal);
    const intent: ExportImportIntent = {
      kind: 'default',
      source: targetModuleId,
      targetModuleId,
      local: resolvedLocal,
    };
    this.intents.push(intent);
    return resolvedLocal;
  }

  addAdapterImports(items: readonly AdapterImportSpec[]): void {
    for (const item of items) {
      const key = adapterImportKey(item);
      if (this.adapterLocalByKey.has(key)) continue;
      const requested = toIdentifier(item.local ?? item.imported);
      let local = requested;
      let suffix = 2;
      while (this.usedLocals.has(local) && this.usedLocals.get(local) !== key) {
        local = `${requested}${suffix}`;
        suffix += 1;
      }
      this.usedLocals.set(local, key);
      this.adapterLocalByKey.set(key, local);

      const resolution = resolvePackageImport(
        item.source,
        this.packageResolver
      );
      this.intents.push({
        kind: item.kind,
        source: resolution.importSource,
        imported: item.imported,
        ...(local !== item.imported ? { local } : {}),
      });
      if (resolution.packageName && resolution.declareDependency) {
        const version = resolution.packageVersion ?? 'latest';
        this.dependenciesByName.set(resolution.packageName, {
          name: resolution.packageName,
          version,
          kind: 'dependency',
          origin: createExportPackageOrigin(resolution.packageName, version, {
            updatePolicy: 'follow-package',
          }),
        });
      }
    }
  }

  addNamedPackageImport(source: string, imported: string): string {
    const item: AdapterImportSpec = {
      source,
      kind: 'named',
      imported,
    };
    this.addAdapterImports([item]);
    return this.adapterLocalByKey.get(adapterImportKey(item)) ?? imported;
  }

  resolveElementLocal(
    element: string,
    items: readonly AdapterImportSpec[]
  ): string {
    const matching = items.find((item) => item.imported === element);
    return matching
      ? (this.adapterLocalByKey.get(adapterImportKey(matching)) ?? element)
      : element;
  }

  getImports(): ExportImportIntent[] {
    return dedupeExportImportIntents(this.intents);
  }

  getDependencies(): ExportDependency[] {
    return [...this.dependenciesByName.values()].sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    );
  }
}
