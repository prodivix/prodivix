import {
  isWorkspaceProjectConfigDocumentContent,
  type WorkspaceDocument,
} from '@prodivix/workspace';
import {
  normalizeExternalComponentLibraryIds,
  normalizeLibraryIds,
} from './externalLibraryManager/libraryScope';
import type {
  LibraryMode,
  PackageSizeThresholds,
  PersistedLibrary,
} from './externalLibraryManager/types';
import {
  DEFAULT_PACKAGE_SIZE_THRESHOLDS,
  normalizePackageSizeThresholds,
} from './externalLibraryManager/viewUtils';
import {
  normalizePersistedLibraries as normalizePersistedLibrariesValue,
  pickVersionByMode,
} from './externalLibraryManager/managerState';
import {
  findWorkspaceDocumentByPath,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';

export type WorkspaceExternalLibrariesValue = {
  componentLibraryIds: string[];
  iconLibraryIds: string[];
  activeLibraries: PersistedLibrary[];
  mode: LibraryMode;
  packageSizeThresholds: PackageSizeThresholds;
};

const normalizeMode = (value: unknown): LibraryMode =>
  value === 'latest' || value === 'dev' ? value : 'locked';

const normalizeWorkspacePersistedLibraries = (
  value: unknown
): PersistedLibrary[] => normalizePersistedLibrariesValue(value);

const createDefaultExternalLibrariesValue =
  (): WorkspaceExternalLibrariesValue => ({
    componentLibraryIds: [],
    iconLibraryIds: [],
    activeLibraries: [],
    mode: 'locked',
    packageSizeThresholds: DEFAULT_PACKAGE_SIZE_THRESHOLDS,
  });

export const normalizeExternalLibrariesValue = (
  value: unknown
): WorkspaceExternalLibrariesValue => {
  if (!value || typeof value !== 'object') {
    return createDefaultExternalLibrariesValue();
  }
  const record = value as Record<string, unknown>;
  const mode = normalizeMode(record.mode);
  return {
    componentLibraryIds: normalizeExternalComponentLibraryIds(
      Array.isArray(record.componentLibraryIds)
        ? record.componentLibraryIds.filter(
            (item): item is string => typeof item === 'string'
          )
        : []
    ),
    iconLibraryIds: normalizeLibraryIds(
      Array.isArray(record.iconLibraryIds)
        ? record.iconLibraryIds.filter(
            (item): item is string => typeof item === 'string'
          )
        : []
    ),
    activeLibraries: normalizeWorkspacePersistedLibraries(
      record.activeLibraries
    ),
    mode,
    packageSizeThresholds: normalizePackageSizeThresholds(
      record.packageSizeThresholds &&
        typeof record.packageSizeThresholds === 'object'
        ? (record.packageSizeThresholds as Partial<PackageSizeThresholds>)
        : DEFAULT_PACKAGE_SIZE_THRESHOLDS
    ),
  };
};

export const getWorkspaceExternalLibrariesDocument = (
  documentsById: Record<string, WorkspaceDocument>
) =>
  findWorkspaceDocumentByPath(
    documentsById,
    RESOURCE_ROOTS.external,
    'project-config'
  );

export const buildExternalLibrariesValueFromWorkspace = (
  documentsById: Record<string, WorkspaceDocument>
): WorkspaceExternalLibrariesValue => {
  const document = getWorkspaceExternalLibrariesDocument(documentsById);
  if (!document || !isWorkspaceProjectConfigDocumentContent(document.content)) {
    return createDefaultExternalLibrariesValue();
  }
  return normalizeExternalLibrariesValue(document.content.value);
};

const createPersistedLibraryValue = (
  libraryId: string,
  scope: PersistedLibrary['scope'],
  version: string,
  license?: string
): PersistedLibrary | null => {
  const id = normalizeLibraryIds([libraryId])[0];
  if (!id) return null;
  const normalizedLicense = license?.trim();
  return {
    id,
    scope,
    version,
    ...(normalizedLicense && normalizedLicense !== 'Unknown'
      ? { license: normalizedLicense }
      : {}),
  };
};

export const ensurePersistedLibrary = (
  value: WorkspaceExternalLibrariesValue,
  library: PersistedLibrary
): WorkspaceExternalLibrariesValue => ({
  ...value,
  activeLibraries: [
    library,
    ...value.activeLibraries.filter((item) => item.id !== library.id),
  ],
});

export const createInitialPersistedLibrary = (
  libraryId: string,
  scope: PersistedLibrary['scope'],
  versions: string[],
  mode: LibraryMode,
  preferredVersion?: string,
  license?: string
) =>
  createPersistedLibraryValue(
    libraryId,
    scope,
    preferredVersion?.trim() || pickVersionByMode(versions, mode),
    license
  );
