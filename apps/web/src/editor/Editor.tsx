import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import EditorBar from './EditorBar/EditorBar';
import { EditorDebugFloatingBall } from './EditorDebugFloatingBall';
import { SettingsEffects } from './features/settings/SettingsEffects';
import { WorkspaceRevisionConflictSurface } from './features/revisionConflict/WorkspaceRevisionConflictSurface';
import { WorkspaceOutboxEffects } from './workspaceSync/WorkspaceOutboxEffects';
import { WorkspaceIssuesEffects } from './features/issues';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi, type ProjectSummary } from './editorApi';
import { EditorShortcutProvider, useEditorShortcut } from './shortcuts';
import { ApiError } from '@/auth/authApi';
import { isAbortError } from '@/infra/api';
import {
  getLocalProject,
  isLocalProjectId,
  isSyncedLocalProject,
  LOCAL_READONLY_WORKSPACE_CAPABILITIES,
  LOCAL_WORKSPACE_CAPABILITIES,
  saveLocalWorkspaceSnapshot,
} from './localProjectStore';
import { selectWorkspace, useEditorStore } from './store/useEditorStore';
import { useSettingsStore } from './store/useSettingsStore';
import { WebPluginPlatformProvider } from '@/plugins/platform';
import { createEditorPluginGatewayServices } from '@/editor/pluginGatewayServices';
import { saveWorkspaceLocalReplica } from './workspaceSync/indexedDbWorkspaceLocalReplicaStore';
import {
  canOpenWorkspaceLocalReplicaAfter,
  loadMaterializedWorkspaceLocalReplica,
} from './workspaceSync/workspaceLocalReplica';

function EditorGlobalShortcuts({
  projectId,
  pathname,
}: {
  projectId?: string;
  pathname: string;
}) {
  const navigate = useNavigate();

  useEditorShortcut(
    'Alt+1',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+2',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/blueprint`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+3',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/nodegraph`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+4',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/animation`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+5',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/component`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+6',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/resources`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+7',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/test`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+8',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/export`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+9',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/deployment`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );
  useEditorShortcut(
    'Alt+0',
    () => {
      if (!projectId) return;
      const nextPath = `/editor/project/${projectId}/issues`;
      if (pathname === nextPath) return;
      navigate(nextPath);
    },
    { enabled: Boolean(projectId) }
  );

  return null;
}

function EditorSurface() {
  return (
    <div className="flex h-screen min-h-screen flex-row overflow-hidden bg-[linear-gradient(120deg,var(--bg-canvas)_20%,var(--bg-panel)_100%)]">
      <SettingsEffects />
      <WorkspaceOutboxEffects />
      <WorkspaceIssuesEffects />
      <WorkspaceRevisionConflictSurface />
      <EditorBar />
      <div className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <Outlet />
      </div>
      <EditorDebugFloatingBall />
    </div>
  );
}

function Editor() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<string | null>(null);
  const showLoadError = Boolean(projectId) && Boolean(loadError);
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const setProject = useEditorStore((state) => state.setProject);
  const setWorkspaceSnapshot = useEditorStore(
    (state) => state.setWorkspaceSnapshot
  );
  const setWorkspaceCapabilities = useEditorStore(
    (state) => state.setWorkspaceCapabilities
  );
  const setWorkspaceReadonly = useEditorStore(
    (state) => state.setWorkspaceReadonly
  );
  const hydrateWorkspaceSettings = useSettingsStore(
    (state) => state.hydrateWorkspaceSettings
  );
  const clearWorkspaceState = useEditorStore(
    (state) => state.clearWorkspaceState
  );
  const workspace = useEditorStore(selectWorkspace);
  const globalSettings = useSettingsStore((state) => state.global);
  const projectGlobalById = useSettingsStore(
    (state) => state.projectGlobalById
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const isProjectWorkspaceLoaded =
    !projectId || Boolean(workspace && workspace.id === projectId);
  const showWorkspaceLoading =
    Boolean(projectId) && !showLoadError && !isProjectWorkspaceLoaded;
  const pluginGatewayServices = useMemo(
    () =>
      projectId ? createEditorPluginGatewayServices(projectId) : undefined,
    [projectId]
  );

  useEffect(() => {
    if (projectId) return;
    clearWorkspaceState();
  }, [clearWorkspaceState, projectId]);

  useEffect(() => {
    if (!projectId) return;
    if (!isLocalProjectId(projectId)) return;

    let cancelled = false;
    clearWorkspaceState();
    setLoadError(null);

    void getLocalProject(projectId)
      .then((project) => {
        if (cancelled) return;
        if (!project) {
          setLoadError('Local project not found.');
          return;
        }
        const isReadonlyCache = isSyncedLocalProject(project);
        setProject({
          id: project.id,
          name: project.name,
          description: project.description,
          type: project.resourceType,
          isPublic: project.isPublic,
          starsCount: project.starsCount,
        });
        hydrateWorkspaceSettings(project.workspaceSettings);
        setWorkspaceSnapshot(project.workspace);
        setWorkspaceReadonly(isReadonlyCache);
        setWorkspaceCapabilities(
          project.workspace.id,
          isReadonlyCache
            ? LOCAL_READONLY_WORKSPACE_CAPABILITIES
            : LOCAL_WORKSPACE_CAPABILITIES
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : 'Could not load project.'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    clearWorkspaceState,
    hydrateWorkspaceSettings,
    projectId,
    setProject,
    setWorkspaceCapabilities,
    setWorkspaceReadonly,
    setWorkspaceSnapshot,
  ]);

  useEffect(() => {
    if (!projectId) return;
    if (isLocalProjectId(projectId)) return;
    clearWorkspaceState();
    setLoadError(null);
    if (!isAuthenticated || !token) {
      setLoadError('Authentication is required to open this workspace.');
      return;
    }
    let cancelled = false;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions: RequestInit = controller
      ? { signal: controller.signal }
      : {};
    void (async () => {
      const cachedReplicaPromise = loadMaterializedWorkspaceLocalReplica(
        projectId
      ).then(
        (replica) => replica,
        (error) => {
          console.warn(
            '[workspace-replica] cached replica is unavailable',
            error
          );
          return null;
        }
      );
      const remoteWorkspacePromise = Promise.all([
        editorApi.getProject(token, projectId, requestOptions),
        editorApi.getWorkspace(token, projectId, requestOptions),
      ]).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error })
      );
      const [cachedReplica, remoteWorkspace] = await Promise.all([
        cachedReplicaPromise,
        remoteWorkspacePromise,
      ]);
      if (cancelled) return;

      try {
        if (remoteWorkspace.ok === false) throw remoteWorkspace.error;
        const [{ project }, workspaceEnvelope] = remoteWorkspace.value;
        const projectSummary: ProjectSummary = {
          id: project.id,
          resourceType: project.resourceType,
          name: project.name,
          ...(project.description ? { description: project.description } : {}),
          isPublic: project.isPublic,
          starsCount: project.starsCount,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        };
        let loadedWorkspace = workspaceEnvelope.workspace;
        let loadedSettings = workspaceEnvelope.settings;
        let loadedCapabilities = cachedReplica?.capabilities ?? {};
        try {
          await saveWorkspaceLocalReplica({
            workspace: workspaceEnvelope.workspace,
            settings: workspaceEnvelope.settings,
            settingsOpSeq: workspaceEnvelope.workspace.opSeq,
            project: projectSummary,
            capabilities: loadedCapabilities,
          });
          const materialized =
            await loadMaterializedWorkspaceLocalReplica(projectId);
          if (!materialized) {
            throw new TypeError('The saved Workspace replica is unavailable.');
          }
          loadedWorkspace = materialized.workspace;
          loadedSettings = materialized.settings;
          loadedCapabilities = materialized.capabilities;
        } catch (error) {
          console.warn(
            '[workspace-replica] canonical snapshot was not cached',
            error
          );
        }
        if (cancelled) return;
        setWorkspaceReadonly(false);
        setProject({
          id: projectSummary.id,
          name: projectSummary.name,
          description: projectSummary.description,
          type: projectSummary.resourceType,
          isPublic: projectSummary.isPublic,
          starsCount: projectSummary.starsCount,
        });
        hydrateWorkspaceSettings(loadedSettings);
        setWorkspaceSnapshot(loadedWorkspace);
        setWorkspaceCapabilities(projectSummary.id, loadedCapabilities);
        void editorApi
          .getWorkspaceCapabilities(
            token,
            workspaceEnvelope.workspace.id,
            requestOptions
          )
          .then(async (response) => {
            if (cancelled) return;
            setWorkspaceCapabilities(
              response.workspaceId,
              response.capabilities
            );
            try {
              await saveWorkspaceLocalReplica({
                workspace: workspaceEnvelope.workspace,
                settings: workspaceEnvelope.settings,
                settingsOpSeq: workspaceEnvelope.workspace.opSeq,
                project: projectSummary,
                capabilities: response.capabilities,
              });
            } catch (error) {
              console.warn(
                '[workspace-replica] capabilities were not cached',
                error
              );
            }
          })
          .catch((error: unknown) => {
            if (cancelled || isAbortError(error)) return;
          });
      } catch (error) {
        if (cancelled || isAbortError(error)) return;
        if (cachedReplica && canOpenWorkspaceLocalReplicaAfter(error)) {
          try {
            const materialized =
              (await loadMaterializedWorkspaceLocalReplica(projectId)) ??
              cachedReplica;
            if (cancelled) return;
            setWorkspaceReadonly(false);
            setProject({
              id: materialized.project.id,
              name: materialized.project.name,
              description: materialized.project.description,
              type: materialized.project.resourceType,
              isPublic: materialized.project.isPublic,
              starsCount: materialized.project.starsCount,
            });
            hydrateWorkspaceSettings(materialized.settings);
            setWorkspaceSnapshot(materialized.workspace);
            setWorkspaceCapabilities(
              materialized.project.id,
              materialized.capabilities
            );
            return;
          } catch (replicaError) {
            console.warn(
              '[workspace-replica] offline materialization failed',
              replicaError
            );
          }
        }
        clearWorkspaceState();
        if (error instanceof ApiError && error.status === 422) {
          setLoadError(
            error.message ||
              'This project uses an unsupported PIR wire contract and cannot be migrated to PIR-current.'
          );
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : 'Could not load project.'
        );
      }
    })();

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [
    projectId,
    isAuthenticated,
    token,
    clearWorkspaceState,
    hydrateWorkspaceSettings,
    setProject,
    setWorkspaceCapabilities,
    setWorkspaceReadonly,
    setWorkspaceSnapshot,
  ]);

  useEffect(() => {
    if (!projectId || !isLocalProjectId(projectId)) return;
    if (workspaceReadonly) return;
    if (!workspace || workspace.id !== projectId) return;

    const timeoutId = window.setTimeout(() => {
      void saveLocalWorkspaceSnapshot(projectId, workspace, {
        global: globalSettings,
        projectGlobalById,
      })
        .then((saved) => {
          if (!saved) return;
          setProject({
            id: saved.id,
            name: saved.name,
            description: saved.description,
            type: saved.resourceType,
            isPublic: saved.isPublic,
            starsCount: saved.starsCount,
          });
        })
        .catch((error: unknown) => {
          console.warn('[editor] local workspace save failed', error);
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    globalSettings,
    projectId,
    projectGlobalById,
    setProject,
    workspace,
    workspaceReadonly,
  ]);

  return (
    <EditorShortcutProvider>
      <EditorGlobalShortcuts
        projectId={projectId}
        pathname={location.pathname}
      />
      {showLoadError ? (
        <div className="flex min-h-screen items-center justify-center bg-(--bg-canvas) px-6 py-10">
          <div className="max-w-xl space-y-4 text-left">
            <p className="text-sm font-medium tracking-[0.18em] text-(--text-secondary) uppercase">
              Project unavailable
            </p>
            <h1 className="text-2xl font-semibold text-(--text-primary)">
              This project cannot be opened
            </h1>
            <p className="text-sm leading-6 text-(--text-secondary)">
              {loadError}
            </p>
            <button
              type="button"
              className="rounded-md border border-(--border-subtle) bg-(--bg-panel) px-4 py-2 text-sm font-medium text-(--text-primary) transition hover:bg-(--bg-raised)"
              onClick={() => {
                setLoadError(null);
                navigate('/editor');
              }}
            >
              Back to projects
            </button>
          </div>
        </div>
      ) : showWorkspaceLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-(--bg-canvas) text-sm text-(--text-secondary)">
          Loading workspace…
        </div>
      ) : projectId && pluginGatewayServices ? (
        <WebPluginPlatformProvider
          workspaceId={projectId}
          gatewayServices={pluginGatewayServices}
        >
          <EditorSurface />
        </WebPluginPlatformProvider>
      ) : (
        <EditorSurface />
      )}
    </EditorShortcutProvider>
  );
}

export default Editor;
