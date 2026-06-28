import type { ExportDependency } from '#src/export/types';

const dependencyKindRank: Record<
  NonNullable<ExportDependency['kind']>,
  number
> = {
  dependency: 0,
  peerDependency: 1,
  devDependency: 2,
};

const pickDependency = (
  previous: ExportDependency | undefined,
  next: ExportDependency
): ExportDependency => {
  if (!previous) return next;
  const previousKind = previous.kind ?? 'dependency';
  const nextKind = next.kind ?? 'dependency';
  const preferredKind =
    dependencyKindRank[nextKind] < dependencyKindRank[previousKind]
      ? nextKind
      : previousKind;

  return {
    ...previous,
    ...next,
    kind: preferredKind,
    version:
      previous.version === next.version ? previous.version : next.version,
    origin: previous.origin ?? next.origin,
  };
};

export const mergeExportDependencies = (
  dependencies: ExportDependency[]
): ExportDependency[] => {
  const byName = new Map<string, ExportDependency>();
  dependencies.forEach((dependency) => {
    byName.set(
      dependency.name,
      pickDependency(byName.get(dependency.name), dependency)
    );
  });
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
};

export const exportDependenciesToPackageFields = (
  dependencies: ExportDependency[]
) =>
  mergeExportDependencies(dependencies).reduce<{
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  }>(
    (acc, dependency) => {
      const kind = dependency.kind ?? 'dependency';
      if (kind === 'devDependency') {
        acc.devDependencies[dependency.name] = dependency.version;
        return acc;
      }
      if (kind === 'peerDependency') {
        acc.peerDependencies[dependency.name] = dependency.version;
        return acc;
      }
      acc.dependencies[dependency.name] = dependency.version;
      return acc;
    },
    {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    }
  );
