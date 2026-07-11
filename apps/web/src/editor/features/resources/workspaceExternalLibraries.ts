import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
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
  normalizeMetadataCache as normalizeMetadataCacheValue,
  normalizePersistedLibraries as normalizePersistedLibrariesValue,
  pickVersionByMode,
  type NpmMetadata,
} from './externalLibraryManager/managerState';
import {
  findWorkspaceDocumentByPath,
  isWorkspaceConfigContent,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';

export type WorkspaceExternalLibrariesValue = {
  componentLibraryIds: string[];
  iconLibraryIds: string[];
  activeLibraries: PersistedLibrary[];
  mode: LibraryMode;
  packageSizeThresholds: PackageSizeThresholds;
  metadataCache: Record<string, NpmMetadata>;
};

const normalizeMode = (value: unknown): LibraryMode =>
  value === 'latest' || value === 'dev' ? value : 'locked';

const normalizeWorkspaceMetadataCache = (
  value: unknown
): Record<string, NpmMetadata> => normalizeMetadataCacheValue(value);

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
    metadataCache: {},
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
    metadataCache: normalizeWorkspaceMetadataCache(record.metadataCache),
  };
};

export const getWorkspaceExternalLibrariesDocument = (
  documentsById: Record<string, WorkspaceDocumentRecord>
) =>
  findWorkspaceDocumentByPath(
    documentsById,
    RESOURCE_ROOTS.external,
    'project-config'
  );

export const buildExternalLibrariesValueFromWorkspace = (
  documentsById: Record<string, WorkspaceDocumentRecord>
): WorkspaceExternalLibrariesValue => {
  const document = getWorkspaceExternalLibrariesDocument(documentsById);
  if (!document || !isWorkspaceConfigContent(document.content)) {
    return createDefaultExternalLibrariesValue();
  }
  return normalizeExternalLibrariesValue(document.content.value);
};

const createPersistedLibraryValue = (
  libraryId: string,
  scope: PersistedLibrary['scope'],
  version: string
): PersistedLibrary | null => {
  const id = normalizeLibraryIds([libraryId])[0];
  if (!id) return null;
  return { id, scope, version };
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
  preferredVersion?: string
) =>
  createPersistedLibraryValue(
    libraryId,
    scope,
    preferredVersion?.trim() || pickVersionByMode(versions, mode)
  );
