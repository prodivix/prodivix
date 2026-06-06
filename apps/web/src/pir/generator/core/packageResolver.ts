export type DependencySourceStrategy = 'workspace' | 'npm' | 'esm-sh';

export interface PackageResolverOptions {
  strategy?: DependencySourceStrategy;
  esmShBaseUrl?: string;
  packageVersions?: Record<string, string>;
}

export interface PackageResolution {
  importSource: string;
  packageName: string | null;
  packageVersion: string | null;
  declareDependency: boolean;
}

const isBareImport = (source: string) =>
  !source.startsWith('.') &&
  !source.startsWith('/') &&
  !/^https?:\/\//.test(source);

const getPackageName = (source: string) => {
  if (!isBareImport(source)) return null;
  const segments = source.split('/');
  if (source.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : source;
  }
  return segments[0] ?? source;
};

export const resolvePackageImport = (
  source: string,
  options?: PackageResolverOptions
): PackageResolution => {
  const strategy = options?.strategy ?? 'npm';
  const bare = isBareImport(source);
  const packageName = getPackageName(source);
  const packageVersion = packageName
    ? (options?.packageVersions?.[packageName] ?? null)
    : null;

  if (!bare) {
    return {
      importSource: source,
      packageName,
      packageVersion,
      declareDependency: false,
    };
  }

  if (strategy === 'esm-sh') {
    const base = (options?.esmShBaseUrl ?? 'https://esm.sh').replace(/\/$/, '');
    const versionSuffix = packageVersion ? `@${packageVersion}` : '';
    const importSource = `${base}/${source}${versionSuffix}`;
    return {
      importSource,
      packageName,
      packageVersion,
      declareDependency: false,
    };
  }

  return {
    importSource: source,
    packageName,
    packageVersion,
    declareDependency: Boolean(packageName),
  };
};
