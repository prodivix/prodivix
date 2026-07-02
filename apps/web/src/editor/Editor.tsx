import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import EditorBar from './EditorBar/EditorBar';
import { EditorDebugFloatingBall } from './EditorDebugFloatingBall';
import { SettingsEffects } from './features/settings/SettingsEffects';
import { useAuthStore } from '@/auth/useAuthStore';
import { mountGraphExecutionBridge } from '@/core/executor/executor';
import { mountDefaultNodeGraphExecutor } from '@/core/executor/nodeGraph/mountDefaultNodeGraphExecutor';
import { editorApi } from './editorApi';
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
import { useEditorStore } from './store/useEditorStore';
import { useSettingsStore } from './store/useSettingsStore';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';

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

  return null;
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
  const setPirDoc = useEditorStore((state) => state.setPirDoc);
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
  const workspaceId = useEditorStore((state) => state.workspaceId);
  const workspaceRev = useEditorStore((state) => state.workspaceRev);
  const routeRev = useEditorStore((state) => state.routeRev);
  const opSeq = useEditorStore((state) => state.opSeq);
  const treeRootId = useEditorStore((state) => state.treeRootId);
  const treeById = useEditorStore((state) => state.treeById);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const activeRouteNodeId = useEditorStore((state) => state.activeRouteNodeId);
  const globalSettings = useSettingsStore((state) => state.global);
  const projectGlobalById = useSettingsStore(
    (state) => state.projectGlobalById
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);

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
        hydrateWorkspaceSettings(project.workspace.settings);
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
    if (!projectId || !isAuthenticated || !token) return;
    if (isLocalProjectId(projectId)) return;
    let cancelled = false;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions: RequestInit = controller
      ? { signal: controller.signal }
      : {};
    setLoadError(null);

    editorApi
      .getProject(token, projectId, requestOptions)
      .then(({ project }) => {
        if (cancelled) return;
        setWorkspaceReadonly(false);
        setProject({
          id: project.id,
          name: project.name,
          description: project.description,
          type: project.resourceType,
          isPublic: project.isPublic,
          starsCount: project.starsCount,
        });
        editorApi
          .getWorkspace(token, projectId, requestOptions)
          .then(({ workspace }) => {
            if (cancelled) return;
            hydrateWorkspaceSettings(workspace.settings);
            setWorkspaceSnapshot(workspace);
            editorApi
              .getWorkspaceCapabilities(token, workspace.id, requestOptions)
              .then((response) => {
                if (cancelled) return;
                setWorkspaceCapabilities(
                  response.workspaceId,
                  response.capabilities
                );
              })
              .catch((error: unknown) => {
                if (cancelled || isAbortError(error)) return;
                setWorkspaceCapabilities(workspace.id, {});
              });
          })
          .catch((error: unknown) => {
            if (cancelled || isAbortError(error)) return;
            clearWorkspaceState();
            if (error instanceof ApiError && error.status === 422) {
              setLoadError(
                error.message ||
                  `This project uses a legacy PIR document and cannot be opened in ${CURRENT_PIR_VERSION}.`
              );
              return;
            }
            setPirDoc(project.pir);
          });
      })
      .catch((error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        clearWorkspaceState();
        if (error instanceof ApiError && error.status === 422) {
          setLoadError(
            error.message ||
              `This project uses a legacy PIR document and cannot be opened in ${CURRENT_PIR_VERSION}.`
          );
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : 'Could not load project.'
        );
      });

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
    setPirDoc,
    setProject,
    setWorkspaceCapabilities,
    setWorkspaceReadonly,
    setWorkspaceSnapshot,
  ]);

  useEffect(() => {
    if (!projectId || !isLocalProjectId(projectId)) return;
    if (workspaceReadonly) return;
    if (workspaceId !== projectId || !treeRootId) return;
    const documents = Object.values(workspaceDocumentsById);
    if (!documents.length) return;

    const timeoutId = window.setTimeout(() => {
      void saveLocalWorkspaceSnapshot(projectId, {
        id: workspaceId,
        workspaceRev: workspaceRev ?? 1,
        routeRev: routeRev ?? 1,
        opSeq: opSeq ?? 1,
        tree: {
          treeRootId,
          treeById,
        },
        documents,
        routeManifest,
        settings: { global: globalSettings, projectGlobalById },
        activeRouteNodeId,
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
    activeRouteNodeId,
    globalSettings,
    projectId,
    projectGlobalById,
    routeManifest,
    routeRev,
    opSeq,
    setProject,
    treeById,
    treeRootId,
    workspaceDocumentsById,
    workspaceId,
    workspaceReadonly,
    workspaceRev,
  ]);

  useEffect(() => {
    if (showLoadError) return;
    const unmountBridge = mountGraphExecutionBridge();
    const unmountNodeGraphExecutor = mountDefaultNodeGraphExecutor({
      getPirDoc: () => useEditorStore.getState().pirDoc,
    });
    return () => {
      unmountNodeGraphExecutor();
      unmountBridge();
    };
  }, [showLoadError]);

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
      ) : (
        <div className="flex max-h-screen min-h-screen flex-row bg-[linear-gradient(120deg,var(--bg-canvas)_20%,var(--bg-panel)_100%)]">
          <SettingsEffects />
          <EditorBar />
          <div className="min-h-screen flex-1 overflow-auto">
            <Outlet />
          </div>
          <EditorDebugFloatingBall />
        </div>
      )}
    </EditorShortcutProvider>
  );
}

export default Editor;
