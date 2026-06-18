import { antdExternalLibraryProfile } from './libraries/antdProfile';
import { muiExternalLibraryProfile } from './libraries/muiProfile';
import { ensureExternalLibrary } from './runtime/engine';
import { clearRegisteredExternalLibraries } from './runtime/registry';
import {
  getExternalLibraryProfile,
  listExternalLibraryIds,
  registerExternalLibraryProfile,
  unregisterExternalLibraryProfile,
} from './runtime/profileRegistry';
import type {
  ExternalLibraryDiagnostic,
  ExternalLibraryProfile,
} from './runtime/types';
export type { ExternalLibraryDiagnostic } from './runtime/types';

const DEFAULT_LIBRARY_IDS: string[] = [];
const LEGACY_ICON_LIBRARY_IDS = new Set([
  'fontawesome',
  'ant-design-icons',
  'mui-icons',
  'heroicons',
]);
const EXTERNAL_LIBRARY_DISPLAY_NAME: Record<string, string> = {
  antd: 'Ant Design',
  mui: 'Material UI',
};
export const externalLibraryConfigUpdatedEvent =
  'prodivix:external-library-config-updated';
let bootstrapped = false;
let latestDiagnostics: ExternalLibraryDiagnostic[] = [];
let isLoadingExternalLibraries = false;
let configuredExternalLibraryIds = [...DEFAULT_LIBRARY_IDS];
export type ExternalLibraryLoadStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error';
export type ExternalLibraryRuntimeState = {
  libraryId: string;
  status: ExternalLibraryLoadStatus;
  diagnostics: ExternalLibraryDiagnostic[];
  lastUpdatedAt: number;
};
const externalLibraryStateById = new Map<string, ExternalLibraryRuntimeState>();
const diagnosticListeners = new Set<
  (diagnostics: ExternalLibraryDiagnostic[]) => void
>();
const loadingListeners = new Set<(isLoading: boolean) => void>();
const stateListeners = new Set<
  (states: ExternalLibraryRuntimeState[]) => void
>();

const ensureBootstrap = () => {
  if (bootstrapped) return;
  registerExternalLibraryProfile(antdExternalLibraryProfile);
  registerExternalLibraryProfile(muiExternalLibraryProfile);
  bootstrapped = true;
};

export const getExternalLibraryDisplayName = (libraryId: string) => {
  const normalizedId = libraryId.trim();
  const fromMap = EXTERNAL_LIBRARY_DISPLAY_NAME[normalizedId];
  if (fromMap) return fromMap;
  const profile = getExternalLibraryProfile(normalizedId);
  const packageName = profile?.descriptor().packageName;
  if (packageName === '@mui/material') return 'Material UI';
  if (packageName === 'antd') return 'Ant Design';
  return normalizedId;
};

const normalizeLibraryId = (libraryId: string) =>
  libraryId.trim().toLowerCase();

const sanitizeConfiguredExternalLibraryIds = (libraryIds: string[]) =>
  libraryIds.filter(
    (libraryId) => !LEGACY_ICON_LIBRARY_IDS.has(normalizeLibraryId(libraryId))
  );

const unknownLibraryDiagnostic = (
  libraryId: string
): ExternalLibraryDiagnostic => ({
  code: 'ELIB-1004',
  level: 'error',
  stage: 'load',
  message: `External library "${libraryId}" is not registered.`,
  hint: 'Register a library profile before loading it.',
  retryable: false,
  libraryId,
});

const offlineLibraryDiagnostic = (
  libraryId: string
): ExternalLibraryDiagnostic => ({
  code: 'ELIB-1002',
  level: 'error',
  stage: 'load',
  message: `Skipped loading external library "${libraryId}" while offline.`,
  hint: 'Reconnect to the network and retry external library loading.',
  retryable: true,
  libraryId,
});

const isExternalLibraryRuntimeOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const setLatestDiagnostics = (diagnostics: ExternalLibraryDiagnostic[]) => {
  latestDiagnostics = diagnostics;
  diagnosticListeners.forEach((listener) => listener(latestDiagnostics));
};

const setLoadingState = (isLoading: boolean) => {
  isLoadingExternalLibraries = isLoading;
  loadingListeners.forEach((listener) => listener(isLoadingExternalLibraries));
};

const emitExternalLibraryStates = () => {
  const states = Array.from(externalLibraryStateById.values());
  stateListeners.forEach((listener) => listener(states));
};

const setExternalLibraryState = (
  libraryId: string,
  status: ExternalLibraryLoadStatus,
  diagnostics: ExternalLibraryDiagnostic[]
) => {
  externalLibraryStateById.set(libraryId, {
    libraryId,
    status,
    diagnostics,
    lastUpdatedAt: Date.now(),
  });
  emitExternalLibraryStates();
};

export const getConfiguredExternalLibraryIds = (): string[] => {
  ensureBootstrap();
  return [...configuredExternalLibraryIds];
};

export const setConfiguredExternalLibraryIds = (libraryIds: string[]) => {
  ensureBootstrap();
  const uniqueIds = sanitizeConfiguredExternalLibraryIds(
    [...new Set(libraryIds.map((item) => item.trim()))].filter(
      (item) => item.length > 0
    )
  );
  configuredExternalLibraryIds = uniqueIds;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(externalLibraryConfigUpdatedEvent, {
        detail: {
          libraryIds: uniqueIds,
        },
      })
    );
  }
  return uniqueIds;
};

export const getConfiguredExternalLibraries = () =>
  getConfiguredExternalLibraryIds().map((libraryId) => ({
    id: libraryId,
    label: getExternalLibraryDisplayName(libraryId),
  }));

export const ensureExternalLibraryById = async (
  libraryId: string,
  options: { signal?: AbortSignal } = {}
): Promise<ExternalLibraryDiagnostic[]> => {
  if (options.signal?.aborted) return [];
  ensureBootstrap();
  if (isExternalLibraryRuntimeOffline()) {
    const diagnostics = [offlineLibraryDiagnostic(libraryId)];
    setExternalLibraryState(libraryId, 'error', diagnostics);
    setLatestDiagnostics(diagnostics);
    return diagnostics;
  }
  setExternalLibraryState(libraryId, 'loading', []);
  const profile = getExternalLibraryProfile(libraryId);
  if (!profile) {
    const diagnostics = [unknownLibraryDiagnostic(libraryId)];
    setExternalLibraryState(libraryId, 'error', diagnostics);
    setLatestDiagnostics(diagnostics);
    return diagnostics;
  }
  const diagnostics = await ensureExternalLibrary(profile, options);
  setExternalLibraryState(
    libraryId,
    diagnostics.some((item) => item.level === 'error') ? 'error' : 'success',
    diagnostics
  );
  setLatestDiagnostics(diagnostics);
  return diagnostics;
};

export const ensureConfiguredExternalLibraries = async (
  libraryIds: string[] = getConfiguredExternalLibraryIds(),
  options: { signal?: AbortSignal } = {}
): Promise<ExternalLibraryDiagnostic[]> => {
  if (options.signal?.aborted) return [];
  ensureBootstrap();
  if (libraryIds.length === 0) {
    clearRegisteredExternalLibraries();
    setLatestDiagnostics([]);
    Array.from(externalLibraryStateById.keys()).forEach((libraryId) => {
      if (!libraryIds.includes(libraryId)) {
        externalLibraryStateById.delete(libraryId);
      }
    });
    emitExternalLibraryStates();
    return [];
  }
  if (isExternalLibraryRuntimeOffline()) {
    const uniqueIds = [...new Set(libraryIds)];
    const diagnostics = uniqueIds.map((libraryId) =>
      offlineLibraryDiagnostic(libraryId)
    );
    Array.from(externalLibraryStateById.keys()).forEach((libraryId) => {
      if (!uniqueIds.includes(libraryId)) {
        externalLibraryStateById.delete(libraryId);
      }
    });
    diagnostics.forEach((diagnostic) => {
      if (!diagnostic.libraryId) return;
      setExternalLibraryState(diagnostic.libraryId, 'error', [diagnostic]);
    });
    setLoadingState(false);
    setLatestDiagnostics(diagnostics);
    emitExternalLibraryStates();
    return diagnostics;
  }
  clearRegisteredExternalLibraries();
  setLoadingState(true);
  try {
    const uniqueIds = [...new Set(libraryIds)];
    Array.from(externalLibraryStateById.keys()).forEach((libraryId) => {
      if (!uniqueIds.includes(libraryId)) {
        externalLibraryStateById.delete(libraryId);
      }
    });
    emitExternalLibraryStates();
    const results = await Promise.all(
      uniqueIds.map((libraryId) =>
        ensureExternalLibraryById(libraryId, options)
      )
    );
    const diagnostics = results.flat();
    setLatestDiagnostics(diagnostics);
    return diagnostics;
  } finally {
    setLoadingState(false);
  }
};

export const ensureDefaultExternalLibrary = () =>
  ensureExternalLibraryById('antd');

export const getRegisteredExternalLibraryIds = () => {
  ensureBootstrap();
  return listExternalLibraryIds();
};

export const getRegisteredExternalLibraries = () => {
  ensureBootstrap();
  return listExternalLibraryIds().map((libraryId) => ({
    id: libraryId,
    label: getExternalLibraryDisplayName(libraryId),
  }));
};

export const registerExternalLibrary = (profile: ExternalLibraryProfile) => {
  ensureBootstrap();
  return registerExternalLibraryProfile(profile);
};

export const unregisterExternalLibrary = (libraryId: string) => {
  ensureBootstrap();
  unregisterExternalLibraryProfile(libraryId);
  externalLibraryStateById.delete(libraryId);
  emitExternalLibraryStates();
};

export const getExternalLibraryDiagnostics = () => latestDiagnostics;
export const getExternalLibraryLoadingState = () => isLoadingExternalLibraries;
export const getExternalLibraryState = (
  libraryId: string
): ExternalLibraryRuntimeState => {
  return (
    externalLibraryStateById.get(libraryId) ?? {
      libraryId,
      status: 'idle',
      diagnostics: [],
      lastUpdatedAt: 0,
    }
  );
};
export const getExternalLibraryStates = () =>
  Array.from(externalLibraryStateById.values());
export const retryExternalLibraryById = (
  libraryId: string,
  options: { signal?: AbortSignal } = {}
) => ensureExternalLibraryById(libraryId, options);

export const subscribeExternalLibraryDiagnostics = (
  listener: (diagnostics: ExternalLibraryDiagnostic[]) => void
) => {
  diagnosticListeners.add(listener);
  return () => {
    diagnosticListeners.delete(listener);
  };
};

export const subscribeExternalLibraryLoading = (
  listener: (isLoading: boolean) => void
) => {
  loadingListeners.add(listener);
  return () => {
    loadingListeners.delete(listener);
  };
};

export const subscribeExternalLibraryState = (
  listener: (states: ExternalLibraryRuntimeState[]) => void
) => {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
};
