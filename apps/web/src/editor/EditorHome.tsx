import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { EditorBarExitModal } from './EditorBar/EditorBarExitModal';
import { EditorTipsRandom } from './EditorTipsRandom';
import { ProjectCard } from './ProjectCard';
import type { ProjectBusyState, ProjectHomeItem } from './EditorHomeTypes';
import NewResourceModal from './features/newfile/NewResourceModal';
import { editorApi, type ProjectSummary } from './editorApi';
import { useAuthStore } from '@/auth/useAuthStore';
import { isAbortError } from '@/infra/api';
import { useEditorShortcut } from './shortcuts';
import { useEditorStore } from './store/useEditorStore';
import { materializeWorkspaceBinaryAssets } from './features/execution/workspaceAssetMaterialization';
import {
  deleteLocalProject,
  duplicateLocalProject,
  isLocalProjectId,
  isSyncedLocalProject,
  listLocalProjectRecords,
  markLocalProjectSynced,
  updateLocalProject,
  type LocalProjectRecord,
} from './localProjectStore';

const toRemoteItem = (project: ProjectSummary): ProjectHomeItem => ({
  ...project,
  source: 'remote',
});

const toLocalItem = (project: LocalProjectRecord): ProjectHomeItem => ({
  id: project.id,
  resourceType: project.resourceType,
  name: project.name,
  description: project.description,
  isPublic: project.isPublic,
  starsCount: project.starsCount,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  source: 'local',
  localRecord: project,
});

function EditorHome() {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const hasAuthHydrated = useAuthStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const [isResourceModalOpen, setResourceModalOpen] = useState(false);
  const [isExitModalOpen, setExitModalOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectHomeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyByProject, setBusyByProject] = useState<
    Record<string, ProjectBusyState | undefined>
  >({});
  const setProjectsInStore = useEditorStore((state) => state.setProjects);
  const setProjectInStore = useEditorStore((state) => state.setProject);
  const removeProjectInStore = useEditorStore((state) => state.removeProject);

  useEditorShortcut(
    'Escape',
    () => {
      setExitModalOpen(true);
    },
    {
      enabled: !isResourceModalOpen && !isExitModalOpen,
    }
  );

  useEffect(() => {
    if (!hasAuthHydrated) {
      return;
    }
    if (!isAuthenticated || !token) {
      let cancelled = false;
      setLoadError(null);
      setIsLoading(true);
      void listLocalProjectRecords()
        .then((localProjects) => {
          if (cancelled) return;
          const items = localProjects.map(toLocalItem);
          setProjects(items);
          setProjectsInStore(
            items.map((project) => ({
              id: project.id,
              name: project.name,
              description: project.description,
              type: project.resourceType,
              isPublic: project.isPublic,
              starsCount: project.starsCount,
            }))
          );
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoadError(
            error instanceof Error
              ? error.message
              : t('home.localLoadFailed', 'Failed to load local projects.')
          );
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions: RequestInit = controller
      ? { signal: controller.signal }
      : {};
    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      editorApi.listProjects(token, requestOptions),
      listLocalProjectRecords(),
    ])
      .then(([{ projects: remoteProjects }, localProjects]) => {
        if (cancelled) return;
        const remoteItems = remoteProjects.map(toRemoteItem);
        const remoteIds = new Set(remoteProjects.map((project) => project.id));
        const unsyncedLocalItems = localProjects
          .filter((project) => {
            const remoteProjectId = project.syncBinding?.remoteProjectId;
            if (!remoteProjectId) return true;
            return !remoteIds.has(remoteProjectId);
          })
          .map(toLocalItem);
        const items = [...remoteItems, ...unsyncedLocalItems];
        setProjects(items);
        setProjectsInStore(
          items.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            type: project.resourceType,
            isPublic: project.isPublic,
            starsCount: project.starsCount,
          }))
        );
      })
      .catch((error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        setLoadError(
          error instanceof Error ? error.message : 'Failed to load projects.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [hasAuthHydrated, isAuthenticated, token, setProjectsInStore, t]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [projects]
  );

  const openProject = (project: ProjectHomeItem) => {
    if (project.source === 'local' && isAuthenticated) {
      const remoteProjectId = project.localRecord?.syncBinding?.remoteProjectId;
      if (remoteProjectId) {
        openProject({ ...project, id: remoteProjectId, source: 'remote' });
        return;
      }
    }
    switch (project.resourceType) {
      case 'component':
        navigate(`/editor/project/${project.id}/component`);
        return;
      case 'nodegraph':
        navigate(`/editor/project/${project.id}/nodegraph`);
        return;
      default:
        navigate(`/editor/project/${project.id}/blueprint`);
    }
  };

  const publishProject = async (project: ProjectHomeItem) => {
    const isClonedProject = /\(copy\)\s*$/i.test(project.name || '');
    if (
      isLocalProjectId(project.id) ||
      !token ||
      project.isPublic ||
      busyByProject[project.id] ||
      isClonedProject
    )
      return;
    setBusyByProject((prev) => ({ ...prev, [project.id]: 'publishing' }));
    try {
      const { project: published } = await editorApi.publishProject(
        token,
        project.id
      );
      setProjects((prev) =>
        prev.map((item) =>
          item.id === project.id
            ? {
                ...item,
                isPublic: published.isPublic,
                starsCount: published.starsCount,
                updatedAt: published.updatedAt,
              }
            : item
        )
      );
      setProjectInStore({
        id: published.id,
        name: published.name,
        description: published.description,
        type: published.resourceType,
        isPublic: published.isPublic,
        starsCount: published.starsCount,
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : t('home.card.publishFailed', 'Failed to publish project.')
      );
    } finally {
      setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
    }
  };

  const renameProject = async (project: ProjectHomeItem, name: string) => {
    if (isSyncedLocalProject(project.localRecord)) return false;

    if (project.source === 'local' || isLocalProjectId(project.id)) {
      if (busyByProject[project.id]) return false;
      setBusyByProject((prev) => ({ ...prev, [project.id]: 'renaming' }));
      try {
        const renamed = await updateLocalProject(project.id, { name });
        if (!renamed) {
          setLoadError(
            t('home.card.renameFailed', 'Failed to rename project.')
          );
          return false;
        }
        setProjects((prev) =>
          prev.map((item) =>
            item.id === project.id
              ? {
                  ...item,
                  name: renamed.name,
                  description: renamed.description,
                  updatedAt: renamed.updatedAt,
                  localRecord: renamed,
                }
              : item
          )
        );
        setProjectInStore({
          id: renamed.id,
          name: renamed.name,
          description: renamed.description,
          type: renamed.resourceType,
          isPublic: renamed.isPublic,
          starsCount: renamed.starsCount,
        });
        return true;
      } finally {
        setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
      }
    }

    if (!token || busyByProject[project.id]) return false;
    setBusyByProject((prev) => ({ ...prev, [project.id]: 'renaming' }));
    try {
      const { project: renamed } = await editorApi.updateProject(
        token,
        project.id,
        {
          name,
        }
      );
      setProjects((prev) =>
        prev.map((item) =>
          item.id === project.id
            ? {
                ...item,
                name: renamed.name,
                description: renamed.description,
                updatedAt: renamed.updatedAt,
              }
            : item
        )
      );
      setProjectInStore({
        id: renamed.id,
        name: renamed.name,
        description: renamed.description,
        type: renamed.resourceType,
        isPublic: renamed.isPublic,
        starsCount: renamed.starsCount,
      });
      return true;
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : t('home.card.renameFailed', 'Failed to rename project.')
      );
      return false;
    } finally {
      setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
    }
  };

  const syncLocalProject = async (project: ProjectHomeItem) => {
    if (!token || !isAuthenticated || project.source !== 'local') return;
    if (busyByProject[project.id] || !project.localRecord) return;
    if (isSyncedLocalProject(project.localRecord)) return;

    setBusyByProject((prev) => ({ ...prev, [project.id]: 'syncing' }));
    try {
      const assetMaterializations = await materializeWorkspaceBinaryAssets({
        workspace: project.localRecord.workspace,
        token: null,
      });
      const { project: remoteProject, workspace } =
        await editorApi.importLocalProject(token, {
          name: project.localRecord.name,
          description: project.localRecord.description,
          resourceType: project.localRecord.resourceType,
          workspace: project.localRecord.workspace,
          settings: project.localRecord.workspaceSettings,
          assetMaterializations,
        });
      await markLocalProjectSynced(project.id, {
        remoteProjectId: remoteProject.id,
        remoteWorkspaceId: workspace.id,
        workspaceRev: workspace.workspaceRev,
      });
      setProjects((prev) => {
        const withoutLocal = prev.filter((item) => item.id !== project.id);
        const withoutDuplicateRemote = withoutLocal.filter(
          (item) => item.id !== remoteProject.id
        );
        return [toRemoteItem(remoteProject), ...withoutDuplicateRemote];
      });
      setProjectInStore({
        id: remoteProject.id,
        name: remoteProject.name,
        description: remoteProject.description,
        type: remoteProject.resourceType,
        isPublic: remoteProject.isPublic,
        starsCount: remoteProject.starsCount,
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : t('home.card.syncFailed', 'Failed to sync local project.')
      );
    } finally {
      setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
    }
  };

  const duplicateProject = async (project: ProjectHomeItem) => {
    if (project.source !== 'local') return;
    if (busyByProject[project.id]) return;
    setBusyByProject((prev) => ({ ...prev, [project.id]: 'duplicating' }));
    try {
      const duplicated = await duplicateLocalProject(project.id, {
        name: t('home.card.localCopyName', '{{name}} (local copy)', {
          name: project.name || t('home.card.untitled', 'Untitled'),
        }),
      });
      if (!duplicated) {
        setLoadError(t('home.card.copyFailed', 'Failed to create local copy.'));
        return;
      }
      setProjects((prev) => [toLocalItem(duplicated), ...prev]);
      setProjectInStore({
        id: duplicated.id,
        name: duplicated.name,
        description: duplicated.description,
        type: duplicated.resourceType,
        isPublic: duplicated.isPublic,
        starsCount: duplicated.starsCount,
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : t('home.card.copyFailed', 'Failed to create local copy.')
      );
    } finally {
      setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
    }
  };

  const deleteProject = async (project: ProjectHomeItem) => {
    if (busyByProject[project.id]) return;
    const confirmed = window.confirm(
      t('home.card.deleteConfirm', 'Delete this project permanently?')
    );
    if (!confirmed) return;
    setBusyByProject((prev) => ({ ...prev, [project.id]: 'deleting' }));
    try {
      if (project.source === 'local' || isLocalProjectId(project.id)) {
        await deleteLocalProject(project.id);
        setProjects((prev) => prev.filter((item) => item.id !== project.id));
        removeProjectInStore(project.id);
        return;
      }
      if (!token) return;
      await editorApi.deleteProject(token, project.id);
      setProjects((prev) => prev.filter((item) => item.id !== project.id));
      removeProjectInStore(project.id);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : t('home.card.deleteFailed', 'Failed to delete project.')
      );
    } finally {
      setBusyByProject((prev) => ({ ...prev, [project.id]: undefined }));
    }
  };

  return (
    <div className="flex h-full w-full flex-1 bg-(--bg-canvas) text-(--text-primary)">
      <div className="flex flex-1 flex-col gap-[32px] overflow-y-auto p-[40px]">
        <header className="flex w-full flex-col gap-[8px]">
          <h1 className="m-0 text-(length:--font-size-3xl) leading-[1.25] font-semibold text-(--text-primary)">
            {t('home.welcomeTitle')}
          </h1>
        </header>

        {loadError && (
          <p className="m-0 rounded-[12px] border border-(--border-default) bg-(--bg-panel) p-[12px] text-(length:--font-size-sm) text-(--text-secondary)">
            {loadError}
          </p>
        )}

        <div className="grid auto-rows-[minmax(280px,auto)] grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[20px] max-[1200px]:grid-cols-3 max-[900px]:grid-cols-2 max-[600px]:grid-cols-1">
          <button
            className="flex h-full min-h-[280px] w-full cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-(--border-default) bg-(--bg-panel) text-(length:--font-size-xl) text-(--text-primary) transition-all duration-[300ms] ease-[ease] hover:border-(--border-strong) hover:bg-(--bg-raised)"
            onClick={() => setResourceModalOpen(true)}
          >
            <Plus size={48} />
            <span className="text-(length:--font-size-lg)">
              {t('home.actions.newProject')}
            </span>
          </button>

          {hasAuthHydrated && !isAuthenticated && (
            <div className="flex min-h-[280px] items-center justify-center rounded-[16px] border border-(--border-subtle) bg-(--bg-panel) p-[24px] text-(length:--font-size-sm) text-(--text-muted)">
              {t(
                'home.localModeHint',
                'Local projects are saved in this browser. Sign in to sync and publish.'
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex min-h-[280px] items-center justify-center rounded-[16px] border border-(--border-subtle) bg-(--bg-panel) p-[24px] text-(length:--font-size-sm) text-(--text-muted)">
              {t('common.loading', 'Loading...')}
            </div>
          )}

          {!isLoading &&
            sortedProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={openProject}
                onRename={renameProject}
                onPublish={publishProject}
                onSync={syncLocalProject}
                onDuplicate={duplicateProject}
                onDelete={deleteProject}
                canSyncLocalProject={Boolean(isAuthenticated && token)}
                isRenaming={busyByProject[project.id] === 'renaming'}
                isPublishing={busyByProject[project.id] === 'publishing'}
                isSyncing={busyByProject[project.id] === 'syncing'}
                isDuplicating={busyByProject[project.id] === 'duplicating'}
                isDeleting={busyByProject[project.id] === 'deleting'}
              />
            ))}
        </div>

        <div className="mt-auto flex items-center justify-center pt-[48px] pb-[20px]">
          <EditorTipsRandom />
        </div>
      </div>

      <NewResourceModal
        open={isResourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        onCreated={(project) => {
          setProjects((prev) => {
            const next = prev.filter((item) => item.id !== project.id);
            return [
              isLocalProjectId(project.id)
                ? toLocalItem(project as LocalProjectRecord)
                : toRemoteItem(project),
              ...next,
            ];
          });
        }}
      />
      <EditorBarExitModal
        isOpen={isExitModalOpen}
        exitLabel={t('bar.exitToHome')}
        cancelLabel={t('bar.cancel')}
        exitText={t('bar.exit')}
        title={t('bar.exitTitle')}
        onClose={() => setExitModalOpen(false)}
        onConfirm={() => {
          setExitModalOpen(false);
          navigate('/');
        }}
      />
    </div>
  );
}

export default EditorHome;
