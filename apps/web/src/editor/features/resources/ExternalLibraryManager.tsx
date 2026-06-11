import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  DEFAULT_PACKAGE_SIZE_THRESHOLDS,
  normalizePackageSizeThresholds,
} from './externalLibraryManager/viewUtils';
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
  PRE_RELEASE_PATTERN,
  getExternalSelectionStorageKey,
  getIconSelectionStorageKey,
  getManagerMetadataStorageKey,
  getManagerModeStorageKey,
  getManagerSizeThresholdsStorageKey,
  getManagerStateStorageKey,
  normalizeLicenseText,
  parseStoredLibraryIds,
  parseStoredManagerState,
  parseStoredMetadataCache,
  parseStoredSizeThresholds,
  pickVersionByMode,
  type NpmMetadata,
} from './externalLibraryManager/managerState';
import { useExternalLibraryManagerRuntimeRefs } from './externalLibraryManager/managerRuntimeRefs';
import { isAbortError } from '@/infra/api';

type ExternalLibraryManagerProps = {
  projectId?: string;
};

export function ExternalLibraryManager({
  projectId,
}: ExternalLibraryManagerProps) {
  const { t } = useTranslation('editor');
  const [registeredComponentLibraries, setRegisteredComponentLibraries] =
    useState<LibraryEntry[]>([]);
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
  const {
    loadTokensRef,
    timeoutIdsRef,
    metadataRequestsRef,
    metadataControllersRef,
  } = useExternalLibraryManagerRuntimeRefs();

  const componentLibraryById = useMemo(
    () =>
      new Map(
        registeredComponentLibraries.map((library) => [library.id, library])
      ),
    [registeredComponentLibraries]
  );
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
        resolvedScope === 'component'
          ? (componentLibraryById.get(libraryId)?.label ?? catalog.label)
          : resolvedScope === 'icon'
            ? (iconLibraryById.get(libraryId)?.label ?? catalog.label)
            : catalog.label,
      scope: resolvedScope,
      version: pickVersionByMode(catalog.versions, globalMode),
      status: 'idle',
      description: catalog.description,
      license: catalog.license,
      packageSizeKb: catalog.packageSizeKb,
      components: catalog.components,
      versions: catalog.versions,
      isRegistered:
        resolvedScope === 'component'
          ? componentLibraryById.has(libraryId)
          : resolvedScope === 'icon'
            ? iconLibraryById.has(libraryId)
            : false,
      errorMessage: null,
      updatedAt: Date.now(),
    };
  };

  const persistConfiguredComponentLibraryIds = (libraryIds: string[]) => {
    const nextIds = normalizeExternalComponentLibraryIds(libraryIds);
    setConfiguredComponentLibraryIds(nextIds);
    window.localStorage.setItem(
      getExternalSelectionStorageKey(projectId),
      JSON.stringify(nextIds)
    );
    void import('@/editor/features/design/blueprint/external').then(
      (externalRuntime) => {
        externalRuntime.setConfiguredExternalLibraryIds(nextIds);
      }
    );
  };

  const persistConfiguredIconLibraryIds = (libraryIds: string[]) => {
    const nextIds = normalizeLibraryIds(libraryIds);
    setConfiguredIconLibraryIds(nextIds);
    window.localStorage.setItem(
      getIconSelectionStorageKey(projectId),
      JSON.stringify(nextIds)
    );
    void import('@/pir/renderer/iconRegistry').then((iconRegistry) => {
      iconRegistry.setConfiguredIconLibraryIds(nextIds);
    });
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
      persistConfiguredComponentLibraryIds(nextIds);
      return;
    }
    if (scope === 'icon') {
      const nextIds =
        action === 'add'
          ? [...configuredIconLibraryIds, libraryId]
          : configuredIconLibraryIds.filter((item) => item !== libraryId);
      persistConfiguredIconLibraryIds(nextIds);
    }
  };

  const updatePackageSizeThreshold = (
    field: keyof PackageSizeThresholds,
    value: number
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setPackageSizeThresholds((current) => {
      const next = normalizePackageSizeThresholds({
        ...current,
        [field]: Math.floor(value),
      });
      if (
        next.cautionKb === current.cautionKb &&
        next.warningKb === current.warningKb &&
        next.criticalKb === current.criticalKb
      ) {
        return current;
      }
      return next;
    });
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
          updatedAt: Date.now(),
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

  const triggerLoad = (libraryId: string, version: string) => {
    const normalized = normalizeLibraryIds([libraryId])[0];
    if (!normalized) return;
    const token = (loadTokensRef.current.get(normalized) ?? 0) + 1;
    loadTokensRef.current.set(normalized, token);
    setActiveLibraries((current) =>
      current.map((library) =>
        library.id === normalized
          ? {
              ...library,
              version,
              status: 'loading',
              errorMessage: null,
              updatedAt: Date.now(),
            }
          : library
      )
    );
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      if (loadTokensRef.current.get(normalized) !== token) return;
      setActiveLibraries((current) =>
        current.map((library) => {
          if (library.id !== normalized) return library;
          if (PRE_RELEASE_PATTERN.test(version)) {
            return {
              ...library,
              version,
              status: 'error',
              errorMessage:
                'Simulated load failure: pre-release channel returned unstable metadata.',
              updatedAt: Date.now(),
            };
          }
          return {
            ...library,
            version,
            status:
              library.packageSizeKb > packageSizeThresholds.cautionKb
                ? 'warning'
                : 'success',
            errorMessage: null,
            updatedAt: Date.now(),
          };
        })
      );
    }, 620);
    timeoutIdsRef.current.add(timeoutId);
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
        status: 'loading',
        updatedAt: Date.now(),
      },
      ...current,
    ]);
    setSelectedLibraryId(normalized);
    syncScope(normalized, library.scope, 'add');
    hydrateNpmMetadata([normalized]);
    triggerLoad(normalized, nextVersion);
  };

  useEffect(() => {
    let disposed = false;
    setBootstrapping(true);
    void Promise.all([
      import('@/editor/features/design/blueprint/external'),
      import('@/pir/renderer/iconRegistry'),
    ])
      .then(([externalRuntime, iconRegistry]) => {
        if (disposed) return;
        setRegisteredComponentLibraries(
          externalRuntime.getRegisteredExternalLibraries()
        );
        setRegisteredIconLibraries(iconRegistry.getRegisteredIconLibraries());

        const storedComponentIds = parseStoredLibraryIds(
          window.localStorage.getItem(getExternalSelectionStorageKey(projectId))
        );
        const storedIconIds = parseStoredLibraryIds(
          window.localStorage.getItem(getIconSelectionStorageKey(projectId))
        );
        const componentIds = normalizeExternalComponentLibraryIds(
          storedComponentIds ??
            (projectId ? [] : externalRuntime.getConfiguredExternalLibraryIds())
        );
        const iconIds = normalizeLibraryIds(
          storedIconIds ??
            (projectId ? [] : iconRegistry.getConfiguredIconLibraryIds())
        );
        setConfiguredComponentLibraryIds(componentIds);
        setConfiguredIconLibraryIds(iconIds);

        const storedMode = window.localStorage.getItem(
          getManagerModeStorageKey(projectId)
        );
        const nextMode: LibraryMode =
          storedMode === 'latest' || storedMode === 'dev'
            ? storedMode
            : 'locked';
        setGlobalMode(nextMode);
        setPackageSizeThresholds(
          parseStoredSizeThresholds(
            window.localStorage.getItem(
              getManagerSizeThresholdsStorageKey(projectId)
            )
          ) ?? DEFAULT_PACKAGE_SIZE_THRESHOLDS
        );
        setMetadataCache(
          parseStoredMetadataCache(
            window.localStorage.getItem(getManagerMetadataStorageKey(projectId))
          )
        );

        const storedManagerState = parseStoredManagerState(
          window.localStorage.getItem(getManagerStateStorageKey(projectId))
        );
        const mergedIds = normalizeLibraryIds([
          ...storedManagerState.map((item) => item.id),
          ...componentIds,
          ...iconIds,
        ]);
        const stateById = new Map(
          storedManagerState.map((item) => [item.id, item])
        );
        const inferredComponentIds: string[] = [];
        const inferredIconIds: string[] = [];
        const nextLibraries = mergedIds.map((libraryId) => {
          const persisted = stateById.get(libraryId);
          const scope =
            persisted?.scope ??
            (componentIds.includes(libraryId)
              ? 'component'
              : iconIds.includes(libraryId)
                ? 'icon'
                : inferScope(libraryId));
          if (!componentIds.includes(libraryId) && scope === 'component') {
            inferredComponentIds.push(libraryId);
          }
          if (!iconIds.includes(libraryId) && scope === 'icon') {
            inferredIconIds.push(libraryId);
          }
          const library = createLibraryItem(libraryId, scope);
          return {
            ...library,
            version: persisted?.version ?? library.version,
            status:
              persisted?.status ?? (scope === 'utility' ? 'idle' : 'success'),
          };
        });
        if (storedManagerState.length > 0 && inferredComponentIds.length > 0) {
          persistConfiguredComponentLibraryIds([
            ...componentIds,
            ...inferredComponentIds,
          ]);
        }
        if (storedManagerState.length > 0 && inferredIconIds.length > 0) {
          persistConfiguredIconLibraryIds([...iconIds, ...inferredIconIds]);
        }
        setActiveLibraries(nextLibraries);
        hydrateNpmMetadata(mergedIds);
      })
      .finally(() => {
        if (!disposed) setBootstrapping(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId]);

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
    window.localStorage.setItem(
      getManagerModeStorageKey(projectId),
      globalMode
    );
  }, [globalMode, projectId]);

  useEffect(() => {
    if (isBootstrapping) return;
    window.localStorage.setItem(
      getManagerSizeThresholdsStorageKey(projectId),
      JSON.stringify(packageSizeThresholds)
    );
  }, [isBootstrapping, packageSizeThresholds, projectId]);

  useEffect(() => {
    if (isBootstrapping) return;
    window.localStorage.setItem(
      getManagerMetadataStorageKey(projectId),
      JSON.stringify(metadataCache)
    );
  }, [isBootstrapping, metadataCache, projectId]);

  useEffect(() => {
    if (isBootstrapping) return;
    setActiveLibraries((current) =>
      current.map((library) => {
        if (library.status !== 'success' && library.status !== 'warning') {
          return library;
        }
        const nextStatus =
          library.packageSizeKb > packageSizeThresholds.cautionKb
            ? 'warning'
            : 'success';
        if (nextStatus === library.status) return library;
        return {
          ...library,
          status: nextStatus,
          updatedAt: Date.now(),
        };
      })
    );
  }, [isBootstrapping, packageSizeThresholds.cautionKb]);

  useEffect(() => {
    if (isBootstrapping || activeLibraries.length === 0) return;
    hydrateNpmMetadata(activeLibraries.map((library) => library.id));
  }, [activeLibraries, isBootstrapping, metadataCache]);

  useEffect(() => {
    if (isBootstrapping) return;
    window.localStorage.setItem(
      getManagerStateStorageKey(projectId),
      JSON.stringify(
        activeLibraries.map((library) => ({
          id: library.id,
          scope: library.scope,
          version: library.version,
          status: library.status,
        }))
      )
    );
  }, [activeLibraries, isBootstrapping, projectId]);

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
        onModeChange={setGlobalMode}
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
          onRemoveLibrary={(libraryId) => {
            const target = activeLibraries.find(
              (item) => item.id === libraryId
            );
            if (target) syncScope(target.id, target.scope, 'remove');
            setActiveLibraries((current) =>
              current.filter((item) => item.id !== libraryId)
            );
          }}
          onRetryLibrary={triggerLoad}
          onVersionChange={triggerLoad}
        />
        <ExternalLibraryDetailsPanel
          selectedLibrary={selectedLibrary}
          packageSizeThresholds={packageSizeThresholds}
          onVersionQuickSwitch={triggerLoad}
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
