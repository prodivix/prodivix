import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  editorApi,
  createProjectPublicationExpected,
  type ProjectPublicationExpected,
  type ProjectSummary,
} from '@/editor/editorApi';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';

/** Publication is an explicit server projection; export remains compiler-owned. */
export default function ProjectDeploymentPage() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore(selectWorkspace);
  const readonly = useEditorStore((state) => state.workspaceReadonly);
  const setProject = useEditorStore((state) => state.setProject);
  const [project, setRemoteProject] = useState<ProjectSummary>();
  const [expected, setExpected] = useState<ProjectPublicationExpected>();
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const local = isLocalProjectId(projectId);
  useEffect(() => {
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    setRemoteProject(undefined);
    setExpected(undefined);
    setError('');
    setPublishing(false);
    if (!projectId || local || !token) {
      setLoading(false);
      return () => {
        generation.current += 1;
      };
    }
    setLoading(true);
    void Promise.all([
      editorApi.getProject(token, projectId, { signal: controller.signal }),
      editorApi.getWorkspace(token, projectId, { signal: controller.signal }),
    ])
      .then(([response, saved]) => {
        if (generation.current !== currentGeneration) return;
        if (
          response.project.id !== projectId ||
          saved.workspace.id !== projectId
        )
          throw new TypeError('Publication project identity drifted.');
        setRemoteProject(response.project);
        setExpected(createProjectPublicationExpected(saved.workspace));
      })
      .catch((caught: unknown) => {
        if (generation.current === currentGeneration)
          setError(
            caught instanceof Error
              ? caught.message
              : t('deployment.loadFailed')
          );
      })
      .finally(() => {
        if (generation.current === currentGeneration) setLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [projectId, local, token, refresh, t]);
  const canPublish = Boolean(
    projectId &&
    workspace?.id === projectId &&
    !local &&
    !readonly &&
    token &&
    project &&
    expected &&
    !loading &&
    !publishing
  );
  const publish = async () => {
    if (!canPublish || !projectId || !token) return;
    const currentGeneration = generation.current;
    setPublishing(true);
    setError('');
    try {
      const response = await editorApi.publishProject(
        token,
        projectId,
        expected
      );
      if (generation.current !== currentGeneration) return;
      if (response.project.id !== projectId || !response.project.isPublic)
        throw new TypeError(
          'The server did not confirm Community publication.'
        );
      setRemoteProject(response.project);
      setProject({
        id: response.project.id,
        name: response.project.name,
        description: response.project.description,
        type: response.project.resourceType,
        isPublic: response.project.isPublic,
        starsCount: response.project.starsCount,
      });
    } catch (caught: unknown) {
      if (generation.current === currentGeneration)
        setError(
          caught instanceof Error
            ? caught.message
            : t('deployment.publishFailed')
        );
    } finally {
      if (generation.current === currentGeneration) setPublishing(false);
    }
  };
  const basePath = projectId
    ? `/editor/project/${encodeURIComponent(projectId)}`
    : '/editor';
  return (
    <main className="flex max-w-4xl flex-col gap-6 p-6 text-(--text-primary)">
      <header>
        <h1 className="text-xl font-medium">{t('deployment.title')}</h1>
        <p className="mt-2 text-sm text-(--text-secondary)">
          {t('deployment.description')}
        </p>
      </header>
      <section
        className="space-y-3 rounded-xl border border-(--border-default) bg-(--bg-panel) p-4"
        aria-labelledby="community-publication-title"
      >
        <h2 id="community-publication-title" className="font-medium">
          {t('deployment.communityTitle')}
        </h2>
        <p className="text-sm text-(--text-secondary)">
          {t('deployment.communityDescription')}
        </p>
        {expected ? (
          <p className="text-sm text-(--text-secondary)">
            {t('deployment.revision', {
              workspaceRev: expected.workspaceRev,
              opSeq: expected.opSeq,
            })}
          </p>
        ) : null}
        <p role="status" className="text-sm">
          {local
            ? t('deployment.localOnly')
            : !token
              ? t('deployment.signIn')
              : loading
                ? t('deployment.loading')
                : project
                  ? project.isPublic
                    ? t('deployment.published')
                    : t('deployment.unpublished')
                  : t('deployment.unavailable')}
        </p>
        {readonly ? (
          <p className="text-sm text-(--text-secondary)">
            {t('deployment.readonly')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-(--danger-color)">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canPublish}
            onClick={() => void publish()}
            className="rounded-lg bg-(--accent-color) px-3 py-2 text-sm text-(--text-inverse) disabled:opacity-50"
          >
            {publishing
              ? t('deployment.publishing')
              : project?.isPublic
                ? t('deployment.republish')
                : t('deployment.publish')}
          </button>
          {!local && token ? (
            <button
              type="button"
              disabled={loading || publishing}
              onClick={() => setRefresh((value) => value + 1)}
              className="rounded-lg border border-(--border-default) px-3 py-2 text-sm disabled:opacity-50"
            >
              {t('deployment.refresh')}
            </button>
          ) : null}
          {project?.isPublic && projectId ? (
            <Link
              to={`/community/${encodeURIComponent(projectId)}`}
              className="text-sm underline"
            >
              {t('deployment.viewCommunity')}
            </Link>
          ) : null}
        </div>
      </section>
      <section
        className="space-y-3 rounded-xl border border-(--border-default) bg-(--bg-panel) p-4"
        aria-labelledby="standalone-build-title"
      >
        <h2 id="standalone-build-title" className="font-medium">
          {t('deployment.standaloneTitle')}
        </h2>
        <p className="text-sm text-(--text-secondary)">
          {t('deployment.exportDescription')}
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-(--text-secondary)">
          <li>{t('deployment.exportStep')}</li>
          <li>
            {t('deployment.buildStep')} <code>pnpm install</code>,{' '}
            <code>pnpm run build</code>
          </li>
          <li>{t('deployment.hostStep')}</li>
        </ol>
        <Link
          to={`${basePath}/export`}
          className="inline-block rounded-lg border border-(--border-default) px-3 py-2 text-sm"
        >
          {t('deployment.openExport')}
        </Link>
      </section>
    </main>
  );
}
