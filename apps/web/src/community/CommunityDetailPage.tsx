import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Boxes, Component, Flame, Workflow } from 'lucide-react';
import { PdxEmpty } from '@prodivix/ui';
import { communityApi, type CommunityProjectDetail } from './communityApi';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';
import { isAbortError } from '@/infra/api';
import {
  getRuntimeRegistryRevision,
  runtimeRegistryUpdatedEvent,
} from '@/pir/renderer/registry';
import { resolvePirDocument } from '@/pir/resolvePirDocument';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
import { useEditorStore } from '@/editor/store/useEditorStore';

const typeIcon = (type: CommunityProjectDetail['resourceType']) => {
  switch (type) {
    case 'component':
      return <Component size={14} />;
    case 'nodegraph':
      return <Workflow size={14} />;
    default:
      return <Boxes size={14} />;
  }
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function CommunityDetailPage() {
  const { t } = useTranslation('community');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const setEditorProject = useEditorStore((state) => state.setProject);
  const setPirDoc = useEditorStore((state) => state.setPirDoc);
  const [project, setCommunityProject] =
    useState<CommunityProjectDetail | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [runtimeRegistryRevision, setRuntimeRegistryRevision] = useState(() =>
    getRuntimeRegistryRevision()
  );

  useEffect(() => {
    if (!projectId) {
      setError(t('detail.error.missing', 'Project ID is missing.'));
      return;
    }

    let cancelled = false;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions: RequestInit = controller
      ? { signal: controller.signal }
      : {};
    setLoading(true);
    setError(null);

    communityApi
      .getProject(projectId, requestOptions)
      .then((payload) => {
        if (cancelled) return;
        setCommunityProject(payload.project);
      })
      .catch((requestError: unknown) => {
        if (cancelled || isAbortError(requestError)) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('detail.error.load', 'Could not load project detail.')
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [projectId, t]);

  const pirText = useMemo(
    () =>
      project ? JSON.stringify(resolvePirDocument(project.pir), null, 2) : '',
    [project]
  );
  const previewPirDoc = useMemo(
    () => resolvePirDocument(project?.pir),
    [project?.pir]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRegistryUpdate = () =>
      setRuntimeRegistryRevision(getRuntimeRegistryRevision());
    window.addEventListener(runtimeRegistryUpdatedEvent, handleRegistryUpdate);
    return () =>
      window.removeEventListener(
        runtimeRegistryUpdatedEvent,
        handleRegistryUpdate
      );
  }, []);

  const handleClone = async () => {
    if (!project || isCloning) return;
    if (currentUser?.id && project.ownerId === currentUser.id) {
      setCloneError(
        t(
          'detail.error.cloneSelf',
          'You cannot clone your own project from community.'
        )
      );
      return;
    }
    if (!token) {
      navigate('/auth');
      return;
    }

    setCloning(true);
    setCloneError(null);
    const pirDoc = JSON.parse(JSON.stringify(previewPirDoc));
    const fallbackName = t('card.untitled', 'Untitled');

    try {
      const { project: createdProject } = await editorApi.createProject(token, {
        name: `${project.name || fallbackName} (Copy)`,
        description: project.description || undefined,
        resourceType: project.resourceType,
        isPublic: false,
        pir: pirDoc,
      });
      setEditorProject({
        id: createdProject.id,
        name: createdProject.name,
        description: createdProject.description,
        type: createdProject.resourceType,
        isPublic: createdProject.isPublic,
        starsCount: createdProject.starsCount,
      });
      setPirDoc(pirDoc);

      if (createdProject.resourceType === 'component') {
        navigate(`/editor/project/${createdProject.id}/component`);
      } else if (createdProject.resourceType === 'nodegraph') {
        navigate(`/editor/project/${createdProject.id}/nodegraph`);
      } else {
        navigate(`/editor/project/${createdProject.id}/blueprint`);
      }
    } catch (requestError) {
      setCloneError(
        requestError instanceof Error
          ? requestError.message
          : t('detail.error.clone', 'Could not clone this project.')
      );
    } finally {
      setCloning(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(155deg,#ffffff_0%,#f5f5f5_50%,#ffffff_100%)] px-6 py-8 text-black md:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute top-[-160px] -left-20 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.08),transparent_68%)]" />
        <div className="absolute -right-10 bottom-[-180px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.1),transparent_72%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <div className="inline-flex flex-wrap items-center gap-3">
          <a
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-black no-underline transition-all hover:border-black/40"
          >
            <ArrowLeft size={16} />
            {t('backHome', 'Back to Home')}
          </a>
          <a
            href="/community"
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-black no-underline transition-all hover:border-black/40"
          >
            <ArrowLeft size={16} />
            {t('detail.back', 'Back to Community')}
          </a>
        </div>

        {error && (
          <div className="rounded-2xl border border-black/20 bg-white p-6">
            <PdxEmpty
              icon={<Boxes size={22} />}
              title={t('detail.error.title', 'Unable to load this project')}
              description={error}
              action={
                <a
                  href="/community"
                  className="inline-flex rounded-lg border border-black/20 px-3 py-1 text-xs font-semibold text-black no-underline transition-colors hover:border-black/40"
                >
                  {t('detail.back', 'Back to Community')}
                </a>
              }
              className="text-black"
            />
          </div>
        )}

        {isLoading && (
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="h-[320px] animate-pulse rounded-3xl border border-black/10 bg-white" />
            <div className="h-[320px] animate-pulse rounded-3xl border border-black/10 bg-white" />
          </div>
        )}

        {project && (
          <>
            <header className="rounded-3xl border border-black/10 bg-white/90 p-7 shadow-[0_10px_24px_rgba(0,0,0,0.06)] backdrop-blur">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-black/15 bg-black/5 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-black/70 uppercase">
                {typeIcon(project.resourceType)}
                {project.resourceType}
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">
                {project.name || t('card.untitled', 'Untitled')}
              </h1>
              <p className="mt-3 max-w-[900px] text-sm leading-6 text-black/65 md:text-base">
                {project.description ||
                  t('card.emptyDesc', 'No description provided yet.')}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-black/60">
                <span className="rounded-full border border-black/15 bg-white px-3 py-1">
                  {t('detail.author', 'Author')}:{' '}
                  {project.authorName || 'Unknown'}
                </span>
                <span className="rounded-full border border-black/15 bg-white px-3 py-1">
                  {t('detail.updated', 'Updated')}:{' '}
                  {formatTime(project.updatedAt)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-white px-3 py-1">
                  <Flame size={12} />
                  {project.starsCount}
                </span>
                <button
                  type="button"
                  onClick={handleClone}
                  disabled={isCloning}
                  className="inline-flex items-center rounded-full border border-black/15 bg-black px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCloning
                    ? t('detail.cloning', 'Cloning...')
                    : t('detail.clone', 'Clone to My Workspace')}
                </button>
              </div>
              {cloneError && (
                <p className="mt-3 text-xs text-black/65">{cloneError}</p>
              )}
            </header>

            <section className="grid gap-5 lg:grid-cols-2">
              <article className="w-full min-w-0 rounded-3xl border border-black/10 bg-white p-4 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
                <h2 className="mb-3 text-sm font-bold tracking-[0.12em] text-black/70 uppercase">
                  {t('detail.preview', 'Read-only Preview')}
                </h2>
                <div className="max-w-full overflow-auto rounded-2xl border border-black/10 bg-white p-3">
                  <PIRRenderer
                    key={`community-preview-${runtimeRegistryRevision}`}
                    pirDoc={previewPirDoc}
                  />
                </div>
              </article>

              <article className="w-full min-w-0 rounded-3xl border border-black/10 bg-white p-4 shadow-[0_10px_20px_rgba(0,0,0,0.04)]">
                <h2 className="mb-3 text-sm font-bold tracking-[0.12em] text-black/70 uppercase">
                  {t('detail.pir', 'PIR Document')}
                </h2>
                <pre className="max-h-[520px] overflow-auto rounded-2xl border border-black/10 bg-[#fafafa] p-4 text-xs leading-5 text-black/75">
                  {pirText}
                </pre>
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
