import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useAuthStore } from '@/auth/useAuthStore';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { enqueueWorkspaceSettingsOutboxCommit } from '@/editor/workspaceSync/workspaceSettingsOutboxExecutor';
import { adoptWorkspaceSettingsOutboxResult } from '@/editor/workspaceSync/workspaceSettingsOutboxAdoption';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { workspaceSettingsEqual } from '@prodivix/workspace-sync';
import {
  applyThemePreference,
  normalizeThemePreference,
  watchSystemThemePreference,
} from '@/theme/themeRuntime';

const DEFAULT_HISTORY_LIMIT = 80;

const normalizeHistoryLimit = (value: unknown): number => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_LIMIT;
  return Math.min(500, Math.max(0, parsed));
};

export const SettingsEffects = () => {
  const { i18n } = useTranslation();
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const workspace = useEditorStore(selectWorkspace);
  const workspaceId = workspace?.id;
  const workspaceRev = workspace?.workspaceRev;
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
  const settingsSyncRequestSeqRef = useRef(0);
  const syncedSettingsValueRef =
    useRef<Readonly<Record<string, unknown>>>(settingsPayload);
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
    syncedSettingsValueRef.current = settingsPayload;
  }, [workspaceId, settingsPayload]);

  useEffect(() => {
    if (!projectId) return;
    if (isLocalProjectId(projectId)) return;
    if (!isAuthenticated || !token) return;
    if (!workspace) return;
    if (typeof workspaceRev !== 'number' || workspaceRev <= 0) return;
    if (
      workspaceSettingsEqual(settingsPayload, syncedSettingsValueRef.current)
    ) {
      return;
    }

    let disposed = false;
    const requestSeq = settingsSyncRequestSeqRef.current + 1;
    settingsSyncRequestSeqRef.current = requestSeq;
    const baseSettings = syncedSettingsValueRef.current;
    const timeoutId = window.setTimeout(() => {
      void enqueueWorkspaceSettingsOutboxCommit({
        baseSnapshot: workspace,
        baseSettings,
        settings: settingsPayload,
        commitId: createWorkspaceClientOperationId('settings'),
      })
        .then((result) => {
          if (disposed || settingsSyncRequestSeqRef.current !== requestSeq) {
            return;
          }
          adoptWorkspaceSettingsOutboxResult(result);
          const syncedSettings =
            result.kind === 'queued' ? settingsPayload : result.settings;
          syncedSettingsValueRef.current = syncedSettings;
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
    settingsPayload,
    isAuthenticated,
    projectId,
    token,
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
