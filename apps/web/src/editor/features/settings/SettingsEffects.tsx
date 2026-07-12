import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import {
  applyThemePreference,
  normalizeThemePreference,
  watchSystemThemePreference,
} from '@/theme/themeRuntime';

const SETTINGS_INTENT_CAPABILITY = 'core.settings.global.update@1.0';
const DEFAULT_HISTORY_LIMIT = 80;

const normalizeHistoryLimit = (value: unknown): number => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(500, Math.max(0, parsed));
};

const createIntentId = () => {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `intent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const SettingsEffects = () => {
  const { i18n } = useTranslation();
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const workspace = useEditorStore(selectWorkspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
  const routeRev = workspace?.routeRev;
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const canUpdateWorkspaceSettings = useEditorStore(
    (state) => state.workspaceCapabilities[SETTINGS_INTENT_CAPABILITY] === true
  );
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
  const setWorkspaceHistoryLimit = useEditorStore(
    (state) => state.setWorkspaceHistoryLimit
  );
  const globalSettings = useSettingsStore((state) => state.global);
  const projectGlobalById = useSettingsStore(
    (state) => state.projectGlobalById
  );
  const language = useSettingsStore((state) => {
    return state.global.language;
  });
  const theme = useSettingsStore((state) => {
    return state.global.theme;
  });
  const density = useSettingsStore((state) => {
    return state.global.density;
  });
  const fontScale = useSettingsStore((state) => {
    return state.global.fontScale;
  });
  const undoSteps = useSettingsStore((state) => state.global.undoSteps);
  const ensureProjectGlobal = useSettingsStore(
    (state) => state.ensureProjectGlobal
  );
  const settingsPayload = useMemo(
    () => ({
      global: globalSettings,
      projectGlobalById,
    }),
    [globalSettings, projectGlobalById]
  );
  const serializedSettingsPayload = useMemo(
    () => JSON.stringify(settingsPayload),
    [settingsPayload]
  );
  const settingsSyncRequestSeqRef = useRef(0);
  const syncedSettingsPayloadRef = useRef(serializedSettingsPayload);
  const syncedWorkspaceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    ensureProjectGlobal(projectId);
  }, [ensureProjectGlobal, projectId]);

  useEffect(() => {
    if (!workspaceId) {
      syncedWorkspaceRef.current = undefined;
      return;
    }
    if (syncedWorkspaceRef.current === workspaceId) return;
    syncedWorkspaceRef.current = workspaceId;
    syncedSettingsPayloadRef.current = serializedSettingsPayload;
  }, [workspaceId, serializedSettingsPayload]);

  useEffect(() => {
    if (!projectId) return;
    if (!isAuthenticated || !token) return;
    if (!workspace) return;
    if (!workspaceCapabilitiesLoaded || !canUpdateWorkspaceSettings) return;
    if (typeof workspaceRev !== 'number' || workspaceRev <= 0) return;
    if (serializedSettingsPayload === syncedSettingsPayloadRef.current) return;

    let disposed = false;
    const requestSeq = settingsSyncRequestSeqRef.current + 1;
    settingsSyncRequestSeqRef.current = requestSeq;
    const timeoutId = window.setTimeout(() => {
      void editorApi
        .applyWorkspaceIntent(token, workspace, {
          expectedWorkspaceRev: workspaceRev,
          ...(typeof routeRev === 'number' && routeRev > 0
            ? { expectedRouteRev: routeRev }
            : {}),
          intent: {
            id: createIntentId(),
            namespace: 'core.settings',
            type: 'global.update',
            version: '1.0',
            payload: { settings: settingsPayload },
            issuedAt: new Date().toISOString(),
          },
        })
        .then((mutation) => {
          if (disposed || settingsSyncRequestSeqRef.current !== requestSeq) {
            return;
          }
          applyWorkspaceMutation(mutation);
          syncedSettingsPayloadRef.current = serializedSettingsPayload;
        })
        .catch((error) => {
          if (disposed || settingsSyncRequestSeqRef.current !== requestSeq) {
            return;
          }
          console.warn('[settings] workspace settings sync failed', error);
        });
    }, 500);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    applyWorkspaceMutation,
    canUpdateWorkspaceSettings,
    routeRev,
    serializedSettingsPayload,
    settingsPayload,
    isAuthenticated,
    projectId,
    token,
    workspaceCapabilitiesLoaded,
    workspaceId,
    workspaceRev,
    workspace,
  ]);

  useEffect(() => {
    if (!language) return;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  useEffect(() => {
    const preference = normalizeThemePreference(theme) ?? 'home';

    applyThemePreference(preference, { persist: false });

    if (preference !== 'home') {
      return;
    }

    return watchSystemThemePreference(() =>
      applyThemePreference(preference, { persist: false })
    );
  }, [theme]);

  useEffect(() => {
    setWorkspaceHistoryLimit(normalizeHistoryLimit(undoSteps));
  }, [setWorkspaceHistoryLimit, undoSteps]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (density === 'comfortable') {
      delete document.body.dataset.density;
      return;
    }
    document.body.dataset.density = density;
  }, [density]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scale = Number(fontScale) ? Number(fontScale) / 100 : 1;
    document.documentElement.style.setProperty(
      '--app-font-scale',
      String(scale)
    );
  }, [fontScale]);

  return null;
};
