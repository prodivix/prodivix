import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import EditorBar from './EditorBar/EditorBar';
import { SettingsEffects } from './features/settings/SettingsEffects';
import { useAuthStore } from '@/auth/useAuthStore';
import { mountGraphExecutionBridge } from '@/core/executor/executor';
import { mountDefaultNodeGraphExecutor } from '@/core/executor/nodeGraph/mountDefaultNodeGraphExecutor';
import { editorApi } from './editorApi';
import { EditorShortcutProvider, useEditorShortcut } from './shortcuts';
import { ApiError } from '@/auth/authApi';
import { isAbortError } from '@/infra/api';
import { useEditorStore } from './store/useEditorStore';
import { useSettingsStore } from './store/useSettingsStore';

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
  const hydrateWorkspaceSettings = useSettingsStore(
    (state) => state.hydrateWorkspaceSettings
  );
  const clearWorkspaceState = useEditorStore(
    (state) => state.clearWorkspaceState
  );

  useEffect(() => {
    if (!projectId || !isAuthenticated || !token) return;
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
                  'This project uses a legacy PIR document and cannot be opened in v1.3.'
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
              'This project uses a legacy PIR document and cannot be opened in v1.3.'
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
    setWorkspaceSnapshot,
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
        </div>
      )}
    </EditorShortcutProvider>
  );
}

export default Editor;
