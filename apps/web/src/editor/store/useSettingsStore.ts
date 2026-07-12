import { create } from 'zustand';
import {
  createGlobalDefaults,
  createProjectDefaults,
  getGlobalSettingsKeys,
  isProjectOverridableSetting,
  type GlobalSettingsState,
  type OverrideState,
} from '@/editor/features/settings/SettingsDefaults';

type ProjectGlobalSettingsState = {
  values: GlobalSettingsState;
  overrides: OverrideState;
};

export type WorkspaceSettingsSnapshot = {
  global: GlobalSettingsState;
  projectGlobalById: Record<string, ProjectGlobalSettingsState>;
};

type SettingsStore = {
  global: GlobalSettingsState;
  projectGlobalById: Record<string, ProjectGlobalSettingsState>;
  setGlobal: (partial: Partial<GlobalSettingsState>) => void;
  setGlobalValue: <K extends keyof GlobalSettingsState>(
    key: K,
    value: GlobalSettingsState[K]
  ) => void;
  ensureProjectGlobal: (projectId: string) => void;
  setProjectGlobalValue: <K extends keyof GlobalSettingsState>(
    projectId: string,
    key: K,
    value: GlobalSettingsState[K]
  ) => void;
  hydrateWorkspaceSettings: (settings: unknown) => void;
  toggleProjectOverride: (
    projectId: string,
    key: keyof GlobalSettingsState
  ) => void;
  getEffectiveGlobalValue: <K extends keyof GlobalSettingsState>(
    projectId: string | undefined,
    key: K
  ) => GlobalSettingsState[K];
};

const getInitialLanguage = (): 'en' | 'zh-CN' => {
  // Check localStorage first (i18next stores language here)
  if (typeof window !== 'undefined') {
    const stored = window.localStorage?.getItem('i18nextLng');
    if (stored === 'en' || stored === 'zh-CN') {
      return stored;
    }
  }

  // Detect from browser language
  if (typeof navigator !== 'undefined') {
    const browserLang =
      navigator.language ||
      (navigator as { userLanguage?: string }).userLanguage;
    if (browserLang?.startsWith('zh')) {
      return 'zh-CN';
    }
  }

  // Default to English
  return 'en';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneDefaultOverrides = (): OverrideState =>
  getGlobalSettingsKeys().reduce<OverrideState>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

const normalizeSettingValue = (
  fallback: GlobalSettingsState[keyof GlobalSettingsState],
  candidate: unknown
) => {
  if (Array.isArray(fallback)) {
    if (!Array.isArray(candidate)) return fallback;
    return candidate.filter((item): item is string => typeof item === 'string');
  }
  if (typeof fallback === 'number') {
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? candidate
      : fallback;
  }
  if (typeof fallback === 'string') {
    return typeof candidate === 'string' ? candidate : fallback;
  }
  if (typeof fallback === 'boolean') {
    return typeof candidate === 'boolean' ? candidate : fallback;
  }
  return fallback;
};

const normalizeGlobalSettings = (
  value: unknown,
  fallback: GlobalSettingsState
): GlobalSettingsState => {
  if (!isRecord(value)) return fallback;
  const next: GlobalSettingsState = { ...fallback };
  const mutableNext = next as Record<
    keyof GlobalSettingsState,
    GlobalSettingsState[keyof GlobalSettingsState]
  >;
  (Object.keys(fallback) as Array<keyof GlobalSettingsState>).forEach((key) => {
    mutableNext[key] = normalizeSettingValue(
      fallback[key],
      value[key]
    ) as GlobalSettingsState[keyof GlobalSettingsState];
  });
  return next;
};

const normalizeOverrides = (value: unknown): OverrideState => {
  const fallback = cloneDefaultOverrides();
  if (!isRecord(value)) return fallback;
  getGlobalSettingsKeys().forEach((key) => {
    fallback[key] =
      isProjectOverridableSetting(key) && typeof value[key] === 'boolean'
        ? Boolean(value[key])
        : false;
  });
  return fallback;
};

const normalizeProjectGlobalById = (
  value: unknown
): Record<string, ProjectGlobalSettingsState> => {
  if (!isRecord(value)) return {};
  const normalized: Record<string, ProjectGlobalSettingsState> = {};
  Object.entries(value).forEach(([projectId, projectValue]) => {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId || !isRecord(projectValue)) return;
    normalized[normalizedProjectId] = {
      values: normalizeGlobalSettings(
        projectValue.values,
        createProjectDefaults()
      ),
      overrides: normalizeOverrides(projectValue.overrides),
    };
  });
  return normalized;
};

export const useSettingsStore = create<SettingsStore>()((set) => ({
  global: {
    ...createGlobalDefaults(),
    language: getInitialLanguage(),
  },
  projectGlobalById: {},
  setGlobal: (partial) =>
    set((state) => ({
      global: { ...state.global, ...partial },
    })),
  setGlobalValue: (key, value) =>
    set((state) => {
      if (state.global[key] === value) return state;
      return {
        global: { ...state.global, [key]: value },
      };
    }),
  ensureProjectGlobal: (projectId) =>
    set((state) => {
      if (!projectId || state.projectGlobalById[projectId]) return state;
      const overrides = cloneDefaultOverrides();
      return {
        projectGlobalById: {
          ...state.projectGlobalById,
          [projectId]: {
            values: createProjectDefaults(),
            overrides,
          },
        },
      };
    }),
  setProjectGlobalValue: (projectId, key, value) =>
    set((state) => {
      if (!projectId) return state;
      if (!isProjectOverridableSetting(key)) return state;
      const current = state.projectGlobalById[projectId] ?? {
        values: createProjectDefaults(),
        overrides: cloneDefaultOverrides(),
      };
      return {
        projectGlobalById: {
          ...state.projectGlobalById,
          [projectId]: {
            ...current,
            values: { ...current.values, [key]: value },
          },
        },
      };
    }),
  hydrateWorkspaceSettings: (settings) =>
    set((state) => {
      if (!isRecord(settings)) return state;
      const hasGlobal = Object.prototype.hasOwnProperty.call(
        settings,
        'global'
      );
      const hasProjectGlobalById = Object.prototype.hasOwnProperty.call(
        settings,
        'projectGlobalById'
      );
      if (!hasGlobal && !hasProjectGlobalById) return state;

      return {
        global: hasGlobal
          ? normalizeGlobalSettings(settings.global, state.global)
          : state.global,
        projectGlobalById: hasProjectGlobalById
          ? normalizeProjectGlobalById(settings.projectGlobalById)
          : state.projectGlobalById,
      };
    }),
  toggleProjectOverride: (projectId, key) =>
    set((state) => {
      if (!projectId) return state;
      if (!isProjectOverridableSetting(key)) return state;
      const current = state.projectGlobalById[projectId] ?? {
        values: createProjectDefaults(),
        overrides: cloneDefaultOverrides(),
      };
      return {
        projectGlobalById: {
          ...state.projectGlobalById,
          [projectId]: {
            ...current,
            overrides: {
              ...current.overrides,
              [key]: !current.overrides[key],
            },
          },
        },
      };
    }),
  getEffectiveGlobalValue: (projectId, key) => {
    if (!projectId) {
      return useSettingsStore.getState().global[key];
    }
    const state = useSettingsStore.getState();
    const projectSettings = state.projectGlobalById[projectId];
    if (!projectSettings) return state.global[key];
    return isProjectOverridableSetting(key) && projectSettings.overrides[key]
      ? projectSettings.values[key]
      : state.global[key];
  },
}));
