import { type ReactElement, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  Boxes,
  FileCog,
  FlaskConical,
  Folder,
  GitBranch,
  LayoutGrid,
  Package,
  ServerCog,
  Settings,
  Sparkles,
  Globe,
  CircleAlert,
  Code2,
} from 'lucide-react';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from './editorApi';

type ProjectAction = {
  key: string;
  path: string;
  icon: ReactElement;
};

function ProjectHome() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const setProject = useEditorStore((state) => state.setProject);
  const resolvedProjectId = projectId ?? '-';
  const isValidProject = Boolean(projectId);
  const [isPublishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const project = useEditorStore((state) =>
    projectId ? state.projectsById[projectId] : undefined
  );
  const projectName =
    project?.name?.trim() ||
    t('projectHome.untitled', { id: resolvedProjectId });
  const projectIsPublic = Boolean(project?.isPublic);

  const actions = useMemo<ProjectAction[]>(
    () => [
      {
        key: 'blueprint',
        path: `/editor/project/${resolvedProjectId}/blueprint`,
        icon: <LayoutGrid size={18} />,
      },
      {
        key: 'component',
        path: `/editor/project/${resolvedProjectId}/component`,
        icon: <Boxes size={18} />,
      },
      {
        key: 'code',
        path: `/editor/project/${resolvedProjectId}/code`,
        icon: <Code2 size={18} />,
      },
      {
        key: 'resources',
        path: `/editor/project/${resolvedProjectId}/resources`,
        icon: <Folder size={18} />,
      },
      {
        key: 'issues',
        path: `/editor/project/${resolvedProjectId}/issues`,
        icon: <CircleAlert size={18} />,
      },
      {
        key: 'nodegraph',
        path: `/editor/project/${resolvedProjectId}/nodegraph`,
        icon: <GitBranch size={18} />,
      },
      {
        key: 'animation',
        path: `/editor/project/${resolvedProjectId}/animation`,
        icon: <Sparkles size={18} />,
      },
      {
        key: 'testing',
        path: `/editor/project/${resolvedProjectId}/test`,
        icon: <FlaskConical size={18} />,
      },
      {
        key: 'export',
        path: `/editor/project/${resolvedProjectId}/export`,
        icon: <Package size={18} />,
      },
      {
        key: 'deployment',
        path: `/editor/project/${resolvedProjectId}/deployment`,
        icon: <ServerCog size={18} />,
      },
      {
        key: 'settings',
        path: `/editor/project/${resolvedProjectId}/settings`,
        icon: <Settings size={18} />,
      },
    ],
    [resolvedProjectId]
  );

  const handlePublish = async () => {
    if (
      !isAuthenticated ||
      !token ||
      !projectId ||
      projectIsPublic ||
      isPublishing
    )
      return;
    setPublishing(true);
    setPublishError(null);
    try {
      const { project: publishedProject } = await editorApi.publishProject(
        token,
        projectId
      );
      setProject({
        id: publishedProject.id,
        name: publishedProject.name,
        description: publishedProject.description,
        type: publishedProject.resourceType,
        isPublic: publishedProject.isPublic,
        starsCount: publishedProject.starsCount,
      });
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : 'Could not publish project.'
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-[16px] p-[18px_20px] text-(--text-primary)">
      <header className="flex items-center justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <h1 className="m-0 text-[18px] font-bold">
            {t('projectHome.title', { name: projectName })}
          </h1>
          <p className="m-0 text-[12px] text-(--text-muted)">
            {t('projectHome.subtitle')}
          </p>
        </div>
        <div className="inline-flex items-center gap-[6px]">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-[10px] border-0 bg-transparent p-[4px] text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-[0.45]"
            aria-label={t('projectHome.actions.settings.label')}
            title={t('projectHome.actions.settings.label')}
            onClick={() =>
              navigate(`/editor/project/${resolvedProjectId}/settings`)
            }
            disabled={!isValidProject}
          >
            <Settings size={16} />
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-[10px] border-0 bg-transparent p-[4px] text-(--text-muted) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-[0.45]"
            aria-label={t('projectHome.actions.projectInfo')}
            title={t('projectHome.actions.projectInfo')}
            onClick={() =>
              navigate(`/editor/project/${resolvedProjectId}/settings`)
            }
            disabled={!isValidProject}
          >
            <FileCog size={16} />
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-[8px]">
        <div className="inline-flex items-center gap-[8px] text-[12px]">
          <span className="text-(--text-muted)">
            {t('projectHome.fields.id')}
          </span>
          <span className="[font-family:var(--font-family-mono)] font-semibold text-(--text-primary)">
            {resolvedProjectId}
          </span>
        </div>
        <div className="inline-flex items-center gap-[8px] text-[12px]">
          <span className="text-(--text-muted)">
            {t('projectHome.fields.name')}
          </span>
          <span className="[font-family:var(--font-family-mono)] font-semibold text-(--text-primary)">
            {projectName}
          </span>
        </div>
        <div className="inline-flex items-center gap-[8px] text-[12px]">
          <span className="text-(--text-muted)">
            {t('projectHome.fields.visibility', 'Visibility')}
          </span>
          <span className="font-medium text-(--text-primary)">
            {projectIsPublic
              ? t('projectHome.visibility.public', 'Public')
              : t('projectHome.visibility.private', 'Private')}
          </span>
          {projectIsPublic && (
            <a
              href="/community"
              target="_blank"
              rel="noreferrer"
              className="rounded-[8px] border border-[rgba(0,0,0,0.12)] px-[8px] py-[2px] text-[11px] text-(--text-secondary) transition-colors duration-[150ms] ease-[ease] hover:text-(--text-primary)"
            >
              {t('projectHome.visibility.openCommunity', 'Open Community')}
            </a>
          )}
          <button
            type="button"
            onClick={handlePublish}
            disabled={
              !isValidProject ||
              projectIsPublic ||
              !isAuthenticated ||
              !token ||
              isPublishing
            }
            className="inline-flex items-center gap-[4px] rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-transparent px-[8px] py-[2px] text-[11px] text-(--text-secondary) transition-colors duration-[150ms] ease-[ease] hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-[0.45]"
          >
            <Globe size={12} />
            {projectIsPublic
              ? t('projectHome.visibility.published', 'Published to Community')
              : t('projectHome.visibility.publish', 'Publish')}
          </button>
        </div>
        {publishError && (
          <p className="m-0 text-[11px] text-(--text-muted)">{publishError}</p>
        )}
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-[10px]">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="group flex cursor-pointer items-center gap-[10px] rounded-[12px] border-0 bg-transparent p-[10px] text-left text-(--text-primary) transition-colors duration-[150ms] ease-[ease] hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-[0.45]"
            onClick={() => navigate(action.path)}
            disabled={!isValidProject}
          >
            <span className="inline-flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[10px] bg-[rgba(0,0,0,0.04)] text-(--text-secondary) transition-colors duration-[150ms] ease-[ease] group-hover:bg-[rgba(0,0,0,0.08)] group-hover:text-(--text-primary) dark:bg-[rgba(255,255,255,0.06)] dark:group-hover:bg-[rgba(255,255,255,0.1)]">
              {action.icon}
            </span>
            <span className="flex min-w-0 flex-col gap-[2px]">
              <span className="text-[13px] font-medium">
                {t(`projectHome.actions.${action.key}.label`)}
              </span>
              <span className="text-[11px] text-(--text-muted)">
                {t(`projectHome.actions.${action.key}.description`)}
              </span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

export default ProjectHome;
