import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Component,
  Flame,
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { PdxEmpty } from '@prodivix/ui';
import {
  communityApi,
  type CommunityProjectSummary,
  type CommunityResourceType,
} from './communityApi';
import { isAbortError } from '@/infra/api';

type ResourceFilter = CommunityResourceType | 'all';
type SortType = 'latest' | 'popular';

const PAGE_SIZE = 12;

const typeToIcon = (type: CommunityResourceType) => {
  switch (type) {
    case 'component':
      return <Component size={16} />;
    case 'nodegraph':
      return <Workflow size={16} />;
    default:
      return <Boxes size={16} />;
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

export function CommunityPage() {
  const { t } = useTranslation('community');
  const [projects, setProjects] = useState<CommunityProjectSummary[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [resourceType, setResourceType] = useState<ResourceFilter>('all');
  const [sort, setSort] = useState<SortType>('latest');
  const [page, setPage] = useState(1);

  const normalizedKeyword = keyword.trim();

  useEffect(() => {
    let cancelled = false;
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const requestOptions: RequestInit = controller
      ? { signal: controller.signal }
      : {};
    setLoading(true);
    setError(null);

    communityApi
      .listProjects(
        {
          keyword: normalizedKeyword,
          resourceType,
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
        requestOptions
      )
      .then((payload) => {
        if (cancelled) return;
        setProjects(payload.projects);
      })
      .catch((requestError: unknown) => {
        if (cancelled || isAbortError(requestError)) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('error.load', 'Could not load community projects.')
        );
        setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [normalizedKeyword, page, resourceType, sort, t]);

  useEffect(() => {
    setPage(1);
  }, [normalizedKeyword, resourceType, sort]);

  const hasNextPage = useMemo(() => projects.length >= PAGE_SIZE, [projects]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(155deg,#ffffff_0%,#f4f4f4_48%,#ffffff_100%)] px-6 py-8 text-black md:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute top-[-180px] -left-20 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.08),transparent_70%)]" />
        <div className="absolute -right-16 bottom-[-220px] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.1),transparent_72%)]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col gap-7">
        <a
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-black/20 bg-white px-4 py-2 text-sm font-semibold text-black no-underline transition-all hover:border-black/40"
        >
          <ChevronLeft size={16} />
          {t('backHome', 'Back to Home')}
        </a>

        <header className="rounded-3xl border border-black/10 bg-white/85 p-7 shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/15 bg-black px-3 py-1 text-xs font-semibold tracking-[0.16em] text-white uppercase">
            <Sparkles size={13} />
            {t('badge', 'Community')}
          </div>
          <h1 className="text-3xl leading-tight font-black tracking-tight text-balance md:text-4xl">
            {t('title', 'Public PIR Showcase')}
          </h1>
          <p className="mt-3 max-w-[760px] text-sm leading-6 text-black/65 md:text-base">
            {t(
              'subtitle',
              'Explore projects, components, and node graphs shared by creators.'
            )}
          </p>
        </header>

        <section className="grid gap-3 rounded-3xl border border-black/10 bg-white/85 p-4 shadow-[0_12px_24px_rgba(0,0,0,0.04)] backdrop-blur md:grid-cols-[1.5fr_0.8fr_0.7fr_auto] md:p-5">
          <label className="group relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-black/40"
              size={16}
            />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t(
                'search.placeholder',
                'Search by title, author, description...'
              )}
              className="h-11 w-full rounded-xl border border-black/20 bg-white pr-3 pl-9 text-sm ring-0 transition-all outline-none placeholder:text-black/45 focus:border-black/45"
            />
          </label>

          <select
            value={resourceType}
            onChange={(event) =>
              setResourceType(event.target.value as ResourceFilter)
            }
            className="h-11 rounded-xl border border-black/20 bg-white px-3 text-sm transition-all outline-none focus:border-black/45"
          >
            <option value="all">{t('filter.all', 'All types')}</option>
            <option value="project">{t('filter.project', 'Projects')}</option>
            <option value="component">
              {t('filter.component', 'Components')}
            </option>
            <option value="nodegraph">
              {t('filter.nodegraph', 'Node Graphs')}
            </option>
          </select>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortType)}
            className="h-11 rounded-xl border border-black/20 bg-white px-3 text-sm transition-all outline-none focus:border-black/45"
          >
            <option value="latest">{t('sort.latest', 'Latest')}</option>
            <option value="popular">{t('sort.popular', 'Popular')}</option>
          </select>

          <div className="inline-flex h-11 items-center justify-center rounded-xl border border-black/20 bg-black px-4 text-xs font-semibold tracking-[0.14em] text-white uppercase">
            {projects.length > 0 ? (
              <span className="inline-flex items-end gap-1 tracking-normal normal-case">
                <span className="text-base leading-none font-black md:text-lg">
                  {projects.length}
                </span>
                <span className="text-[10px] font-medium text-white/80 uppercase md:text-[11px]">
                  {t('count', 'results')}
                </span>
              </span>
            ) : (
              <span className="tracking-normal normal-case">
                {t('countNone', 'No results')}
              </span>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-black/20 bg-white p-4 text-sm text-black/75">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {!isLoading &&
            projects.map((project) => (
              <a
                key={project.id}
                href={`/community/${project.id}`}
                className="group relative flex min-h-[240px] flex-col justify-between rounded-2xl border border-black/15 bg-white p-5 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-black/40 hover:shadow-[0_18px_35px_rgba(0,0,0,0.08)]"
              >
                <div className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full border border-black/15 bg-white px-2 py-1 text-[11px] text-black/60">
                  <Flame size={12} />
                  {project.starsCount}
                </div>
                <div>
                  <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-black/15 bg-black/5 px-2 py-1 text-[11px] font-semibold tracking-[0.12em] text-black/75 uppercase">
                    {typeToIcon(project.resourceType)}
                    {project.resourceType}
                  </div>
                  <h2 className="pr-12 text-xl font-bold tracking-tight">
                    {project.name || t('card.untitled', 'Untitled')}
                  </h2>
                  <p className="mt-3 max-h-[96px] overflow-hidden text-sm leading-6 text-black/65">
                    {project.description ||
                      t('card.emptyDesc', 'No description provided yet.')}
                  </p>
                </div>
                <div className="mt-5 border-t border-black/10 pt-4 text-xs text-black/55">
                  <div className="flex items-center justify-between">
                    <span>
                      {project.authorName || t('card.unknown', 'Unknown')}
                    </span>
                    <span>{formatTime(project.updatedAt)}</span>
                  </div>
                </div>
              </a>
            ))}

          {isLoading && (
            <div className="col-span-full grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`skel-${index}`}
                  className="h-[240px] animate-pulse rounded-2xl border border-black/10 bg-white"
                />
              ))}
            </div>
          )}

          {!isLoading && projects.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-black/20 bg-white p-8">
              <PdxEmpty
                icon={<Boxes size={24} />}
                title={t('empty.title', 'No public projects found')}
                description={t(
                  'empty.body',
                  'Try another keyword, switch the type filter, or sort by latest.'
                )}
                className="text-black"
              />
            </div>
          )}
        </section>

        <footer className="mt-1 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page <= 1 || isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/20 bg-white px-4 text-sm font-medium transition-all hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ChevronLeft size={16} />
            {t('pagination.prev', 'Prev')}
          </button>
          <div className="inline-flex h-10 items-center rounded-xl border border-black/20 bg-black px-4 text-sm font-semibold text-white">
            {t('pagination.page', 'Page')} {page}
          </div>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!hasNextPage || isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/20 bg-white px-4 text-sm font-medium transition-all hover:border-black/40 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t('pagination.next', 'Next')}
            <ChevronRight size={16} />
          </button>
        </footer>
      </div>
    </div>
  );
}
