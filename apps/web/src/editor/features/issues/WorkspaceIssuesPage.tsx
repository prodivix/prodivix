import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  buildDiagnosticPresentation,
  queryDiagnosticIssues,
  summarizeDiagnosticIssues,
  type DiagnosticIssue,
  type DiagnosticIssueStatus,
  type ProdivixDiagnosticSeverity,
} from '@prodivix/diagnostics';
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LocateFixed,
  Search,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import {
  navigateToWorkspaceSemanticTarget,
  type WorkspaceNavigationSurface,
} from '@/editor/navigation';
import { executeWorkspaceIssueQuickFix } from './workspaceIssueQuickFixRegistry';
import { useWorkspaceIssuesStore } from './workspaceIssuesStore';

type StatusFilter = 'open' | DiagnosticIssueStatus | 'all';
type SeverityFilter = ProdivixDiagnosticSeverity | 'all';

const severityIcon = {
  fatal: <CircleAlert size={16} />,
  error: <AlertCircle size={16} />,
  warning: <TriangleAlert size={16} />,
  info: <CheckCircle2 size={16} />,
} satisfies Record<ProdivixDiagnosticSeverity, React.ReactNode>;

const statusQuery = (
  status: StatusFilter
): DiagnosticIssueStatus[] | undefined => {
  if (status === 'all') return undefined;
  if (status === 'open') return ['active', 'stale'];
  return [status];
};

const issueLocation = (issue: DiagnosticIssue): string => {
  const presentation = buildDiagnosticPresentation({
    diagnostic: issue.diagnostic,
  });
  return presentation.locations[0]?.label ?? issue.sources[0]?.providerId ?? '';
};

const preferredSurfaceForIssue = (
  issue: DiagnosticIssue
): WorkspaceNavigationSurface | undefined => {
  if (issue.diagnostic.domain === 'animation') return 'animation' as const;
  if (issue.diagnostic.domain === 'nodegraph') return 'nodegraph' as const;
  if (issue.diagnostic.domain === 'code') return 'resources' as const;
  return undefined;
};

export function WorkspaceIssuesPage() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const collection = useWorkspaceIssuesStore((state) => state.collection);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const issues = useMemo(() => {
    if (!collection) return [];
    return queryDiagnosticIssues(collection, {
      statuses: statusQuery(status),
      severities: severity === 'all' ? undefined : [severity],
      text: search,
    });
  }, [collection, search, severity, status]);
  const openIssues = useMemo(
    () =>
      collection
        ? queryDiagnosticIssues(collection, { statuses: ['active', 'stale'] })
        : [],
    [collection]
  );
  const summary = useMemo(
    () => summarizeDiagnosticIssues(openIssues),
    [openIssues]
  );
  const selectedIssue =
    issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null;
  const presentation = selectedIssue
    ? buildDiagnosticPresentation({ diagnostic: selectedIssue.diagnostic })
    : null;

  const openTarget = () => {
    if (!projectId || !selectedIssue?.diagnostic.targetRef) return;
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      target: {
        kind: 'diagnostic-target',
        targetRef: selectedIssue.diagnostic.targetRef,
      },
      navigate,
      preferredSurface: preferredSurfaceForIssue(selectedIssue),
    });
    if (result.status === 'unavailable') {
      setActionMessage(t('issues.actions.targetUnavailable'));
    }
  };
  const openSource = () => {
    if (!projectId || !selectedIssue?.diagnostic.sourceSpan) return;
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      target: {
        kind: 'source-span',
        sourceSpan: selectedIssue.diagnostic.sourceSpan,
      },
      navigate,
    });
    if (result.status === 'unavailable') {
      setActionMessage(t('issues.actions.sourceUnavailable'));
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-(--bg-canvas) text-(--text-primary)">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-(--border-subtle) px-6 py-5">
        <div className="space-y-1">
          <h1 className="m-0 text-xl font-semibold">{t('issues.title')}</h1>
          <p className="m-0 text-sm text-(--text-secondary)">
            {t('issues.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-(--text-secondary)">
          <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
            {t('issues.summary.open', { count: summary.total })}
          </span>
          <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
            {t('issues.summary.errors', {
              count: summary.bySeverity.error + summary.bySeverity.fatal,
            })}
          </span>
          <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
            {t('issues.summary.warnings', {
              count: summary.bySeverity.warning,
            })}
          </span>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3 border-b border-(--border-subtle) px-6 py-3">
        <label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2">
          <Search size={15} className="text-(--text-muted)" />
          <input
            type="search"
            value={search}
            placeholder={t('issues.filters.search')}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-(--text-primary) outline-none placeholder:text-(--text-muted)"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label={t('issues.filters.status')}
          value={status}
          className="rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm"
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          <option value="open">{t('issues.status.open')}</option>
          <option value="active">{t('issues.status.active')}</option>
          <option value="stale">{t('issues.status.stale')}</option>
          <option value="resolved">{t('issues.status.resolved')}</option>
          <option value="all">{t('issues.status.all')}</option>
        </select>
        <select
          aria-label={t('issues.filters.severity')}
          value={severity}
          className="rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm"
          onChange={(event) =>
            setSeverity(event.target.value as SeverityFilter)
          }
        >
          <option value="all">{t('issues.severity.all')}</option>
          <option value="fatal">{t('issues.severity.fatal')}</option>
          <option value="error">{t('issues.severity.error')}</option>
          <option value="warning">{t('issues.severity.warning')}</option>
          <option value="info">{t('issues.severity.info')}</option>
        </select>
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.9fr)_minmax(380px,1.1fr)]">
        <div className="overflow-auto border-r border-(--border-subtle)">
          {issues.length ? (
            <ul className="m-0 list-none p-2">
              {issues.map((issue) => {
                const itemPresentation = buildDiagnosticPresentation({
                  diagnostic: issue.diagnostic,
                });
                const isSelected = selectedIssue?.id === issue.id;
                return (
                  <li key={issue.id}>
                    <button
                      type="button"
                      className={`flex w-full gap-3 rounded-lg border-0 px-3 py-3 text-left transition ${
                        isSelected
                          ? 'bg-(--bg-raised)'
                          : 'bg-transparent hover:bg-(--bg-panel)'
                      }`}
                      onClick={() => {
                        setSelectedId(issue.id);
                        setActionMessage(null);
                      }}
                    >
                      <span className="mt-0.5 text-(--text-secondary)">
                        {severityIcon[issue.diagnostic.severity]}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <code className="text-xs font-semibold">
                            {issue.diagnostic.code}
                          </code>
                          <span className="rounded-full bg-(--bg-panel) px-2 py-0.5 text-[10px] text-(--text-muted) uppercase">
                            {t(`issues.status.${issue.status}`)}
                          </span>
                        </span>
                        <span className="block truncate text-sm font-medium">
                          {itemPresentation.summary}
                        </span>
                        <span className="block truncate text-xs text-(--text-muted)">
                          {issueLocation(issue)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-6 text-center">
              <CheckCircle2 size={24} className="text-(--text-muted)" />
              <p className="m-0 text-sm font-medium">
                {t('issues.empty.title')}
              </p>
              <p className="m-0 text-xs text-(--text-muted)">
                {t('issues.empty.description')}
              </p>
            </div>
          )}
        </div>

        <aside className="overflow-auto p-6">
          {selectedIssue && presentation ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-(--text-muted)">
                  <code className="font-semibold text-(--text-primary)">
                    {presentation.code}
                  </code>
                  <span>·</span>
                  <span>{t(`issues.severity.${presentation.severity}`)}</span>
                  <span>·</span>
                  <span>{presentation.domain}</span>
                  <span>·</span>
                  <span>{t(`issues.status.${selectedIssue.status}`)}</span>
                </div>
                <h2 className="m-0 text-lg font-semibold">
                  {presentation.summary}
                </h2>
                {presentation.detail && (
                  <p className="m-0 text-sm leading-6 text-(--text-secondary)">
                    {presentation.detail}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedIssue.diagnostic.targetRef && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-(--text-primary) px-3 py-2 text-sm text-(--bg-canvas)"
                    onClick={openTarget}
                  >
                    <LocateFixed size={15} />
                    {t('issues.actions.openTarget')}
                  </button>
                )}
                {selectedIssue.diagnostic.sourceSpan && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm"
                    onClick={openSource}
                  >
                    <LocateFixed size={15} />
                    {t('issues.actions.openSource')}
                  </button>
                )}
                {selectedIssue.diagnostic.quickFixes?.map((quickFix) => (
                  <button
                    key={quickFix.id}
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm"
                    onClick={() => {
                      const result = executeWorkspaceIssueQuickFix(
                        quickFix,
                        selectedIssue.diagnostic
                      );
                      setActionMessage(t(`issues.quickFix.${result.status}`));
                    }}
                  >
                    <Wrench size={15} />
                    {quickFix.label}
                  </button>
                ))}
                {presentation.docsUrl && (
                  <a
                    href={presentation.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm text-(--text-primary) no-underline"
                  >
                    <ExternalLink size={15} />
                    {t('issues.actions.openDocs')}
                  </a>
                )}
              </div>
              {actionMessage && (
                <p className="m-0 text-xs text-(--text-secondary)">
                  {actionMessage}
                </p>
              )}

              <section className="space-y-3">
                <h3 className="m-0 text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  {t('issues.details.location')}
                </h3>
                {presentation.locations.length ? (
                  presentation.locations.map((location) => (
                    <div
                      key={location.id}
                      className="rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-sm"
                    >
                      {location.label}
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-sm text-(--text-muted)">
                    {t('issues.details.noLocation')}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="m-0 text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  {t('issues.details.sources')}
                </h3>
                <div className="space-y-2">
                  {selectedIssue.sources.map((source) => (
                    <div
                      key={source.providerId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-(--border-subtle) px-3 py-2 text-xs"
                    >
                      <code>{source.providerId}</code>
                      <span className="text-(--text-muted)">
                        {source.status} · ×{source.occurrenceCount}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

export default WorkspaceIssuesPage;
