import type {
  ExportDependency,
  ExportSourceOrigin,
  ExportSourceOwner,
  ExportUpdatePolicy,
} from '#src/export/types';
import { resolvePackageExportSource } from '#src/export/sourceResolver';

export type ExportPackageMetadata = {
  license?: string;
  owner?: ExportSourceOwner;
};

export type ExportPackageOriginOptions = {
  updatePolicy?: ExportUpdatePolicy;
  metadata?: Record<string, ExportPackageMetadata>;
};

export const EXPORT_KNOWN_PACKAGE_METADATA: Record<
  string,
  ExportPackageMetadata
> = {
  '@prodivix/shared': {
    license: 'UNLICENSED',
    owner: 'prodivix',
  },
  '@prodivix/themes': {
    license: 'UNLICENSED',
    owner: 'prodivix',
  },
  '@prodivix/ui': {
    license: 'UNLICENSED',
    owner: 'prodivix',
  },
  '@types/react': {
    license: 'MIT',
    owner: 'third-party',
  },
  '@types/react-dom': {
    license: 'MIT',
    owner: 'third-party',
  },
  '@vitejs/plugin-react': {
    license: 'MIT',
    owner: 'third-party',
  },
  react: {
    license: 'MIT',
    owner: 'third-party',
  },
  'react-dom': {
    license: 'MIT',
    owner: 'third-party',
  },
  typescript: {
    license: 'Apache-2.0',
    owner: 'third-party',
  },
  vite: {
    license: 'MIT',
    owner: 'third-party',
  },
};

export const createExportPackageOrigin = (
  name: string,
  version: string,
  options: ExportPackageOriginOptions = {}
): ExportSourceOrigin => {
  const metadata = {
    ...EXPORT_KNOWN_PACKAGE_METADATA[name],
    ...options.metadata?.[name],
  };
  return resolvePackageExportSource({
    packageName: name,
    packageVersion: version,
    license: metadata.license,
    owner: metadata.owner,
    updatePolicy: options.updatePolicy ?? 'pin',
  }).origin;
};

export const completeExportDependencyOrigin = (
  dependency: ExportDependency,
  options: ExportPackageOriginOptions = {}
): ExportDependency => {
  const fallbackOrigin = createExportPackageOrigin(
    dependency.name,
    dependency.version,
    options
  );
  return {
    ...dependency,
    origin: {
      ...fallbackOrigin,
      ...dependency.origin,
      owner: dependency.origin?.owner ?? fallbackOrigin.owner,
      license: dependency.origin?.license ?? fallbackOrigin.license,
      writePolicy: dependency.origin?.writePolicy ?? fallbackOrigin.writePolicy,
      updatePolicy:
        dependency.origin?.updatePolicy ?? fallbackOrigin.updatePolicy,
    },
  };
};

export const recordToExportDependencies = (
  dependencies: Record<string, string>,
  options: ExportPackageOriginOptions & {
    kind?: ExportDependency['kind'];
    origins?: Record<string, ExportSourceOrigin>;
  } = {}
): ExportDependency[] =>
  Object.entries(dependencies).map(([name, version]) =>
    completeExportDependencyOrigin(
      {
        name,
        version,
        kind: options.kind ?? 'dependency',
        origin: options.origins?.[name],
      },
      options
    )
  );
