import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import {
  executeWorkspaceCommandOutboxAndAdopt,
  executeWorkspaceVfsOutboxIntent,
} from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import { ExternalLibraryAddModal } from './externalLibraryManager/ExternalLibraryAddModal';
import { ExternalLibraryDetailsPanel } from './externalLibraryManager/ExternalLibraryDetailsPanel';
import { ExternalLibraryListPanel } from './externalLibraryManager/ExternalLibraryListPanel';
import { ExternalLibraryToolbar } from './externalLibraryManager/ExternalLibraryToolbar';
import type {
  ActiveLibrary,
  LibraryEntry,
  LibraryMode,
  LibraryScope,
  PackageSizeThresholds,
} from './externalLibraryManager/types';
import { DEFAULT_PACKAGE_SIZE_THRESHOLDS } from './externalLibraryManager/viewUtils';
import {
  BUILTIN_LIBRARY_CATEGORIES,
  LIBRARY_CATALOG,
  MODE_OPTIONS,
} from './externalLibraryManager/libraryCatalog';
import {
  inferLibraryScopeFromPackageName,
  normalizeExternalComponentLibraryIds,
  normalizeLibraryIds,
} from './externalLibraryManager/libraryScope';
import {
  METADATA_CACHE_TTL_MS,
  normalizeLicenseText,
  pickVersionByMode,
  type NpmMetadata,
} from './externalLibraryManager/managerState';
import { useExternalLibraryManagerRuntimeRefs } from './externalLibraryManager/managerRuntimeRefs';
import { isAbortError } from '@/infra/api';
import { getBundledOfficialPlugin } from '@/plugins/platform/bundledOfficialPlugins';
import {
  buildExternalLibrariesValueFromWorkspace,
  createInitialPersistedLibrary,
  ensurePersistedLibrary,
  getWorkspaceExternalLibrariesDocument,
  type WorkspaceExternalLibrariesValue,
} from './workspaceExternalLibraries';
import {
  createWorkspaceResourceDocumentId,
  createWorkspaceResourceDocumentRequest,
  createWorkspaceResourceValueUpdateCommand,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';
import { createWorkspaceProjectConfigDocumentContent } from '@prodivix/workspace';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

const EMPTY_WORKSPACE_DOCUMENTS: WorkspaceSnapshot['docsById'] = {};

export function ExternalLibraryManager() {
  const { t } = useTranslation('editor');
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
  const workspaceDocumentsById =
    workspace?.docsById ?? EMPTY_WORKSPACE_DOCUMENTS;
  const externalResourceValue = useMemo(
    () => buildExternalLibrariesValueFromWorkspace(workspaceDocumentsById),
    [workspaceDocumentsById]
  );
  const [registeredIconLibraries, setRegisteredIconLibraries] = useState<
    LibraryEntry[]
  >([]);
  const [configuredComponentLibraryIds, setConfiguredComponentLibraryIds] =
    useState<string[]>([]);
  const [configuredIconLibraryIds, setConfiguredIconLibraryIds] = useState<
    string[]
  >([]);
  const [activeLibraries, setActiveLibraries] = useState<ActiveLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null
  );
  const [globalMode, setGlobalMode] = useState<LibraryMode>('locked');
  const [packageSizeThresholds, setPackageSizeThresholds] =
    useState<PackageSizeThresholds>(DEFAULT_PACKAGE_SIZE_THRESHOLDS);
  const [metadataCache, setMetadataCache] = useState<
    Record<string, NpmMetadata>
  >({});
  const [isBootstrapping, setBootstrapping] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchInput, setDebouncedSearchInput] = useState('');
  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [manualLibraryId, setManualLibraryId] = useState('');
  const [manualLibraryVersion, setManualLibraryVersion] = useState('');
  const { metadataRequestsRef, metadataControllersRef } =
    useExternalLibraryManagerRuntimeRefs();

  const iconLibraryById = useMemo(
    () =>
      new Map(registeredIconLibraries.map((library) => [library.id, library])),
    [registeredIconLibraries]
  );
  const componentConfiguredSet = useMemo(
    () => new Set(configuredComponentLibraryIds),
    [configuredComponentLibraryIds]
  );
  const iconConfiguredSet = useMemo(
    () => new Set(configuredIconLibraryIds),
    [configuredIconLibraryIds]
  );

  const inferScope = (
    libraryId: string,
    fallback: LibraryScope = 'utility'
  ) => {
    const fromCatalog = LIBRARY_CATALOG[libraryId]?.scope;
    if (fromCatalog) return fromCatalog;
    if (componentConfiguredSet.has(libraryId)) return 'component';
    if (iconConfiguredSet.has(libraryId)) return 'icon';
    const inferredScope = inferLibraryScopeFromPackageName(libraryId);
    if (inferredScope) return inferredScope;
    return fallback;
  };

  const createLibraryItem = (
    libraryId: string,
    scope?: LibraryScope
  ): ActiveLibrary => {
    const resolvedScope = scope ?? inferScope(libraryId);
    const catalog = LIBRARY_CATALOG[libraryId] ?? {
      id: libraryId,
      label: libraryId,
      scope: resolvedScope,
      description: 'Custom package without built-in metadata profile.',
      license: 'Unknown',
      packageSizeKb: 260,
      components: ['default export'],
      versions: ['latest', 'stable', 'next'],
    };
    return {
      id: libraryId,
      label:
        resolvedScope === 'icon'
          ? (iconLibraryById.get(libraryId)?.label ?? catalog.label)
          : catalog.label,
      scope: resolvedScope,
      version: pickVersionByMode(catalog.versions, globalMode),
      description: catalog.description,
      license: catalog.license,
      packageSizeKb: catalog.packageSizeKb,
      components: catalog.components,
      versions: catalog.versions,
    };
  };

  const applyConfiguredComponentLibraryIds = (libraryIds: string[]) => {
    const nextIds = normalizeExternalComponentLibraryIds(libraryIds);
    setConfiguredComponentLibraryIds(nextIds);
  };

  const applyConfiguredIconLibraryIds = (libraryIds: string[]) => {
    const nextIds = normalizeLibraryIds(libraryIds);
    setConfiguredIconLibraryIds(nextIds);
    void import('@prodivix/pir-react-renderer').then((iconRegistry) => {
      iconRegistry.setConfiguredIconLibraryIds(nextIds);
    });
  };

  const persistExternalResourceValue = async (
    value: WorkspaceExternalLibrariesValue
  ) => {
    if (!token || !workspace || !workspaceId || !workspaceRev) return;
    const existing = getWorkspaceExternalLibrariesDocument(
      workspaceDocumentsById
    );
    if (existing) {
      const command = createWorkspaceResourceValueUpdateCommand({
        workspaceId,
        document: existing,
        value,
        label: 'Update external libraries',
      });
      if (!command) return;
      const outcome = await executeWorkspaceCommandOutboxAndAdopt({
        token,
        workspace,
        command,
      });
      if (outcome.status === 'rejected') throw new Error(outcome.message);
      return;
    }
    const outcome = await executeWorkspaceVfsOutboxIntent({
      token,
      workspace,
      request: createWorkspaceResourceDocumentRequest({
        workspaceRev,
        documentId: createWorkspaceResourceDocumentId(
          'external_config',
          RESOURCE_ROOTS.external
        ),
        path: RESOURCE_ROOTS.external,
        type: 'project-config',
        content: createWorkspaceProjectConfigDocumentContent(value),
      }),
    });
    if (outcome.status === 'rejected') throw new Error(outcome.message);
  };

  const updateExternalResourceValue = (
    updater: (
      current: WorkspaceExternalLibrariesValue
    ) => WorkspaceExternalLibrariesValue
  ) => {
    if (isBootstrapping) return;
    void persistExternalResourceValue(updater(externalResourceValue));
  };

  const syncScope = (
    libraryId: string,
    scope: LibraryScope,
    action: 'add' | 'remove'
  ) => {
    if (scope === 'component') {
      const nextIds =
        action === 'add'
          ? [...configuredComponentLibraryIds, libraryId]
          : configuredComponentLibraryIds.filter((item) => item !== libraryId);
      applyConfiguredComponentLibraryIds(nextIds);
      return;
    }
    if (scope === 'icon') {
      const nextIds =
        action === 'add'
          ? [...configuredIconLibraryIds, libraryId]
          : configuredIconLibraryIds.filter((item) => item !== libraryId);
      applyConfiguredIconLibraryIds(nextIds);
    }
  };

  const applyMetadataToActiveLibraries = (
    libraryId: string,
    metadata: NpmMetadata
  ) => {
    setActiveLibraries((current) => {
      let hasChanges = false;
      const nextLibraries = current.map((library) => {
        if (library.id !== libraryId) return library;
        const nextDescription = metadata.description ?? library.description;
        const nextLicense = metadata.license ?? library.license;
        if (
          nextDescription === library.description &&
          nextLicense === library.license
        ) {
          return library;
        }
        hasChanges = true;
        return {
          ...library,
          description: nextDescription,
          license: nextLicense,
        };
      });

      return hasChanges ? nextLibraries : current;
    });
  };

  const requestNpmMetadata = async (libraryId: string) => {
    if (typeof window.fetch !== 'function') return;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    if (controller) {
      metadataControllersRef.current.get(libraryId)?.abort();
      metadataControllersRef.current.set(libraryId, controller);
    }
    try {
      const response = await window.fetch(
        `https://registry.npmjs.org/${encodeURIComponent(libraryId)}`,
        controller ? { signal: controller.signal } : {}
      );
      if (!response.ok) return;
      const payload = (await response.json()) as Record<string, unknown>;
      const distTags =
        payload['dist-tags'] && typeof payload['dist-tags'] === 'object'
          ? (payload['dist-tags'] as Record<string, unknown>)
          : null;
      const latestVersion =
        distTags && typeof distTags.latest === 'string'
          ? distTags.latest
          : null;
      const versions =
        payload.versions && typeof payload.versions === 'object'
          ? (payload.versions as Record<string, unknown>)
          : null;
      const latestManifest =
        latestVersion &&
        versions &&
        versions[latestVersion] &&
        typeof versions[latestVersion] === 'object'
          ? (versions[latestVersion] as Record<string, unknown>)
          : null;
      const description =
        (typeof latestManifest?.description === 'string' &&
        latestManifest.description.trim().length > 0
          ? latestManifest.description.trim()
          : null) ??
        (typeof payload.description === 'string' &&
        payload.description.trim().length > 0
          ? payload.description.trim()
          : null);
      const license =
        normalizeLicenseText(latestManifest?.license) ??
        normalizeLicenseText(payload.license);
      if (!description && !license) return;
      const metadata: NpmMetadata = {
        description,
        license,
        updatedAt: Date.now(),
      };
      setMetadataCache((current) => ({
        ...current,
        [libraryId]: metadata,
      }));
      updateExternalResourceValue((current) => ({
        ...current,
        metadataCache: {
          ...current.metadataCache,
          [libraryId]: metadata,
        },
      }));
      applyMetadataToActiveLibraries(libraryId, metadata);
    } catch (error) {
      if (isAbortError(error)) return;
      // ignore metadata fetch failure and keep local fallback
    } finally {
      if (
        controller &&
        metadataControllersRef.current.get(libraryId) === controller
      ) {
        metadataControllersRef.current.delete(libraryId);
      }
    }
  };

  const hydrateNpmMetadata = (libraryIds: string[]) => {
    const now = Date.now();
    libraryIds.forEach((libraryId) => {
      const normalized = normalizeLibraryIds([libraryId])[0];
      if (!normalized) return;
      if (getBundledOfficialPlugin(normalized)) return;
      const cached = metadataCache[normalized];
      if (cached) {
        applyMetadataToActiveLibraries(normalized, cached);
        if (now - cached.updatedAt <= METADATA_CACHE_TTL_MS) {
          return;
        }
      }
      if (metadataRequestsRef.current.has(normalized)) return;
      metadataRequestsRef.current.add(normalized);
      void requestNpmMetadata(normalized).finally(() => {
        metadataRequestsRef.current.delete(normalized);
      });
    });
  };

  const updateLibraryVersion = (libraryId: string, version: string) => {
    const normalized = normalizeLibraryIds([libraryId])[0];
    const nextVersion = version.trim();
    if (!normalized || !nextVersion) return;
    setActiveLibraries((current) =>
      current.map((library) =>
        library.id === normalized
          ? {
              ...library,
              version: nextVersion,
            }
          : library
      )
    );
    updateExternalResourceValue((current) => ({
      ...current,
      activeLibraries: current.activeLibraries.map((library) =>
        library.id === normalized
          ? { ...library, version: nextVersion }
          : library
      ),
    }));
  };

  const addLibrary = (libraryId: string, preferredVersion?: string) => {
    const normalized = normalizeLibraryIds([libraryId])[0];
    if (!normalized) return;
    if (activeLibraries.some((library) => library.id === normalized)) {
      setSelectedLibraryId(normalized);
      return;
    }
    const library = createLibraryItem(normalized);
    const nextVersion =
      preferredVersion && preferredVersion.trim().length > 0
        ? preferredVersion.trim()
        : pickVersionByMode(library.versions, globalMode);
    setActiveLibraries((current) => [
      {
        ...library,
        version: nextVersion,
      },
      ...current,
    ]);
    setSelectedLibraryId(normalized);
    syncScope(normalized, library.scope, 'add');
    const persisted = createInitialPersistedLibrary(
      normalized,
      library.scope,
      library.versions,
      globalMode,
      nextVersion
    );
    if (persisted) {
      const nextComponentIds =
        library.scope === 'component'
          ? normalizeExternalComponentLibraryIds([
              ...configuredComponentLibraryIds,
              normalized,
            ])
          : configuredComponentLibraryIds;
      const nextIconIds =
        library.scope === 'icon'
          ? normalizeLibraryIds([...configuredIconLibraryIds, normalized])
          : configuredIconLibraryIds;
      void persistExternalResourceValue(
        ensurePersistedLibrary(
          {
            ...externalResourceValue,
            componentLibraryIds: nextComponentIds,
            iconLibraryIds: nextIconIds,
            mode: globalMode,
            packageSizeThresholds,
            metadataCache,
          },
          persisted
        )
      );
    }
    hydrateNpmMetadata([normalized]);
  };

  const changeMode = (nextMode: LibraryMode) => {
    setGlobalMode(nextMode);
    updateExternalResourceValue((current) => ({
      ...current,
      mode: nextMode,
    }));
  };

  const removeLibrary = (libraryId: string) => {
    const target = activeLibraries.find((item) => item.id === libraryId);
    if (target) syncScope(target.id, target.scope, 'remove');
    const nextActiveLibraries = activeLibraries.filter(
      (item) => item.id !== libraryId
    );
    setActiveLibraries(nextActiveLibraries);
    updateExternalResourceValue((current) => ({
      ...current,
      componentLibraryIds:
        target?.scope === 'component'
          ? current.componentLibraryIds.filter((item) => item !== libraryId)
          : current.componentLibraryIds,
      iconLibraryIds:
        target?.scope === 'icon'
          ? current.iconLibraryIds.filter((item) => item !== libraryId)
          : current.iconLibraryIds,
      activeLibraries: current.activeLibraries.filter(
        (item) => item.id !== libraryId
      ),
    }));
  };

  useEffect(() => {
    let disposed = false;
    setBootstrapping(true);
    void import('@prodivix/pir-react-renderer')
      .then((iconRegistry) => {
        if (disposed) return;
        setRegisteredIconLibraries(iconRegistry.getRegisteredIconLibraries());

        const componentIds = normalizeExternalComponentLibraryIds(
          externalResourceValue.componentLibraryIds
        );
        const iconIds = normalizeLibraryIds(
          externalResourceValue.iconLibraryIds
        );
        setConfiguredComponentLibraryIds(componentIds);
        setConfiguredIconLibraryIds(iconIds);
        iconRegistry.setConfiguredIconLibraryIds(iconIds);

        const nextMode = externalResourceValue.mode;
        setGlobalMode(nextMode);
        setPackageSizeThresholds(externalResourceValue.packageSizeThresholds);
        setMetadataCache(externalResourceValue.metadataCache);

        const storedManagerState = externalResourceValue.activeLibraries;
        const mergedIds = normalizeLibraryIds([
          ...storedManagerState.map((item) => item.id),
          ...componentIds,
          ...iconIds,
        ]);
        const stateById = new Map(
          storedManagerState.map((item) => [item.id, item])
        );
        const nextLibraries = mergedIds.map((libraryId) => {
          const persisted = stateById.get(libraryId);
          const scope =
            persisted?.scope ??
            (componentIds.includes(libraryId)
              ? 'component'
              : iconIds.includes(libraryId)
                ? 'icon'
                : inferScope(libraryId));
          const library = createLibraryItem(libraryId, scope);
          return {
            ...library,
            version: persisted?.version ?? library.version,
          };
        });
        setActiveLibraries(nextLibraries);
        hydrateNpmMetadata(mergedIds);
      })
      .finally(() => {
        if (!disposed) setBootstrapping(false);
      });
    return () => {
      disposed = true;
    };
  }, [externalResourceValue]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchInput(searchInput.trim().toLowerCase());
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    setSelectedLibraryId((current) =>
      current && activeLibraries.some((item) => item.id === current)
        ? current
        : (activeLibraries[0]?.id ?? null)
    );
  }, [activeLibraries]);

  useEffect(() => {
    if (isBootstrapping || activeLibraries.length === 0) return;
    hydrateNpmMetadata(activeLibraries.map((library) => library.id));
  }, [activeLibraries, isBootstrapping, metadataCache]);

  const filteredLibraries = useMemo(() => {
    if (!debouncedSearchInput) return activeLibraries;
    return activeLibraries.filter((library) =>
      [
        library.id,
        library.label,
        library.description,
        library.components.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(debouncedSearchInput)
    );
  }, [activeLibraries, debouncedSearchInput]);

  const selectedLibrary =
    activeLibraries.find((library) => library.id === selectedLibraryId) ?? null;

  const modeOptions = useMemo(
    () =>
      MODE_OPTIONS.map((option) => ({
        id: option.id,
        label: t(`resourceManager.external.modes.${option.id}`),
      })),
    [t]
  );

  const builtinLibraryCategories = useMemo(
    () =>
      BUILTIN_LIBRARY_CATEGORIES.map((category) => ({
        ...category,
        label: t(`resourceManager.external.categories.${category.id}`),
      })),
    [t]
  );

  return (
    <article className="relative grid gap-4 rounded-2xl border border-(--border-subtle) bg-(--bg-canvas) p-5">
      <header>
        <h2 className="text-base font-medium text-(--text-primary)">
          {t('resourceManager.external.header.title')}
        </h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {t('resourceManager.external.header.description')}
        </p>
      </header>
      <ExternalLibraryToolbar
        searchInput={searchInput}
        mode={globalMode}
        modeOptions={modeOptions}
        builtinLibraryCategories={builtinLibraryCategories}
        libraryCatalog={LIBRARY_CATALOG}
        onSearchInputChange={setSearchInput}
        onModeChange={changeMode}
        onBuiltinLibraryAdd={addLibrary}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
        <ExternalLibraryListPanel
          activeLibraries={activeLibraries}
          filteredLibraries={filteredLibraries}
          selectedLibraryId={selectedLibraryId}
          searchInput={searchInput}
          debouncedSearchInput={debouncedSearchInput}
          packageSizeThresholds={packageSizeThresholds}
          onSelectLibrary={setSelectedLibraryId}
          onOpenAddModal={() => setAddModalOpen(true)}
          onRemoveLibrary={removeLibrary}
          onVersionChange={updateLibraryVersion}
        />
        <ExternalLibraryDetailsPanel
          selectedLibrary={selectedLibrary}
          packageSizeThresholds={packageSizeThresholds}
          onVersionQuickSwitch={updateLibraryVersion}
        />
      </div>
      {isBootstrapping ? (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-3 text-sm text-(--text-secondary)">
          {t('resourceManager.external.loading')}
        </div>
      ) : null}
      <ExternalLibraryAddModal
        isOpen={isAddModalOpen}
        libraryId={manualLibraryId}
        libraryVersion={manualLibraryVersion}
        onLibraryIdChange={setManualLibraryId}
        onLibraryVersionChange={setManualLibraryVersion}
        onClose={() => setAddModalOpen(false)}
        onSubmit={() => {
          addLibrary(manualLibraryId, manualLibraryVersion);
          setManualLibraryId('');
          setManualLibraryVersion('');
          setAddModalOpen(false);
        }}
      />
    </article>
  );
}
