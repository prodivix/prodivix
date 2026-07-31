import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  buildDiagnosticPresentation,
  queryDiagnosticIssues,
  summarizeDiagnosticIssues,
  type DiagnosticIssue,
  type DiagnosticIssueStatus,
  type DiagnosticTargetRef,
  type ProdivixDiagnosticSeverity,
} from '@prodivix/diagnostics';
import { PdxSelect, type PdxSelectOption } from '@prodivix/ui';
import {
  AlertCircle,
  Activity,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  LocateFixed,
  RotateCcw,
  Search,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import {
  navigateToWorkspaceSemanticTarget,
  type WorkspaceNavigationSurface,
} from '@/editor/navigation';
import { useExecutionCenterNavigationStore } from '@/editor/features/execution/executionCenterNavigation';
import { requeueFailedWorkspaceOutboxOperation } from '@/editor/workspaceSync/workspaceOutboxExecutor';
import { executeWorkspaceIssueQuickFix } from './workspaceIssueQuickFixRegistry';
import { useWorkspaceIssuesStore } from './workspaceIssuesStore';

type StatusFilter = 'open' | DiagnosticIssueStatus | 'all';
type SeverityFilter = ProdivixDiagnosticSeverity | 'all';
type G3DomainFilter = 'all' | 'behavior' | 'verification';
type IssueFacet =
  | 'scenario'
  | 'check'
  | 'family'
  | 'surface'
  | 'target'
  | 'provider'
  | 'revision';

const ALL_FACETS = '__all__';

const severityIcon = {
  fatal: <CircleAlert size={16} />,
  error: <AlertCircle size={16} />,
  warning: <TriangleAlert size={16} />,
  info: <CheckCircle2 size={16} />,
} satisfies Record<ProdivixDiagnosticSeverity, React.ReactNode>;

const statusIcon = {
  active: <Activity size={13} aria-hidden="true" />,
  stale: <RotateCcw size={13} aria-hidden="true" />,
  resolved: <CheckCircle2 size={13} aria-hidden="true" />,
} satisfies Record<DiagnosticIssueStatus, React.ReactNode>;

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
  if (issue.diagnostic.domain === 'data') return 'resources' as const;
  return undefined;
};

export const matchesDataIssueTarget = (
  issue: DiagnosticIssue,
  documentId: string | undefined,
  operationId: string | undefined
): boolean => {
  if (!documentId) return issue.diagnostic.domain === 'data';
  const target = issue.diagnostic.targetRef;
  if (!target) return false;
  if (target.kind === 'data-source') {
    return !operationId && target.documentId === documentId;
  }
  if (target.kind !== 'data-operation') return false;
  return (
    target.documentId === documentId &&
    (!operationId || target.operationId === operationId)
  );
};

const metaString = (
  issue: DiagnosticIssue,
  ...keys: readonly string[]
): string | undefined => {
  for (const key of keys) {
    const value = issue.diagnostic.meta?.[key];
    if (typeof value === 'string' && value.length) return value;
  }
  return undefined;
};

const targetIdentity = (
  target: DiagnosticTargetRef | undefined
): string | undefined => {
  if (!target) return undefined;
  switch (target.kind) {
    case 'behavior-scenario':
      return target.documentId;
    case 'behavior-step':
      return `${target.documentId}#${target.stepId}`;
    case 'behavior-replay-record':
    case 'verification-plan-cell':
    case 'verification-evidence':
      return `${target.planDigest}#${target.cellId}`;
    case 'verification-closure':
      return target.planDigest;
    case 'verification-policy':
    case 'document':
      return target.documentId;
    case 'code-artifact':
      return target.artifactId;
    case 'data-source':
      return target.documentId;
    case 'data-operation':
      return `${target.documentId}#${target.operationId}`;
    case 'route':
      return target.routeId;
    default:
      return target.kind;
  }
};

const issueFacetValues = (
  issue: DiagnosticIssue,
  facet: IssueFacet
): readonly string[] => {
  const target = issue.diagnostic.targetRef;
  let values: readonly (string | undefined)[];
  switch (facet) {
    case 'scenario':
      values = [
        metaString(issue, 'scenarioId'),
        target?.kind === 'behavior-scenario' || target?.kind === 'behavior-step'
          ? target.documentId
          : undefined,
      ];
      break;
    case 'check':
      values = [
        metaString(issue, 'checkId', 'checkKind'),
        target?.kind === 'verification-plan-cell' ||
        target?.kind === 'verification-evidence'
          ? target.cellId
          : undefined,
      ];
      break;
    case 'family':
      values = [metaString(issue, 'checkFamily', 'family')];
      break;
    case 'surface':
      values = [metaString(issue, 'surface')];
      break;
    case 'target':
      values = [
        metaString(issue, 'targetId', 'target'),
        targetIdentity(target),
      ];
      break;
    case 'provider':
      values = [
        metaString(issue, 'providerId'),
        ...issue.sources.map(({ providerId }) => providerId),
      ];
      break;
    case 'revision':
      values = [
        ...issue.sources.map(
          ({ revision }) => `${revision.key}:${String(revision.sequence)}`
        ),
        typeof issue.diagnostic.meta?.workspaceRevision === 'number'
          ? String(issue.diagnostic.meta.workspaceRevision)
          : metaString(issue, 'workspaceRevision'),
      ];
      break;
  }
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
};

const facetOptions = (
  issues: readonly DiagnosticIssue[],
  facet: IssueFacet,
  allLabel: string
): PdxSelectOption[] => [
  { label: allLabel, value: ALL_FACETS },
  ...[...new Set(issues.flatMap((issue) => issueFacetValues(issue, facet)))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value })),
];

export function WorkspaceIssuesPage() {
  const { t } = useTranslation('editor');
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const collection = useWorkspaceIssuesStore((state) => state.collection);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [domain, setDomain] = useState<G3DomainFilter>('all');
  const [scenario, setScenario] = useState(ALL_FACETS);
  const [check, setCheck] = useState(ALL_FACETS);
  const [family, setFamily] = useState(ALL_FACETS);
  const [surface, setSurface] = useState(ALL_FACETS);
  const [target, setTarget] = useState(ALL_FACETS);
  const [provider, setProvider] = useState(ALL_FACETS);
  const [revision, setRevision] = useState(ALL_FACETS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [retryingOperation, setRetryingOperation] = useState(false);
  const dataDomain = searchParams.get('domain') === 'data';
  const dataDocumentId = dataDomain
    ? (searchParams.get('documentId') ?? undefined)
    : undefined;
  const dataOperationId = dataDomain
    ? (searchParams.get('operationId') ?? undefined)
    : undefined;
  const allCollectionIssues = collection?.issues ?? [];
  const facetSelections = useMemo(
    () =>
      Object.freeze({
        scenario,
        check,
        family,
        surface,
        target,
        provider,
        revision,
      }),
    [check, family, provider, revision, scenario, surface, target]
  );

  const issues = useMemo(() => {
    if (!collection) return [];
    const queried = queryDiagnosticIssues(collection, {
      statuses: statusQuery(status),
      severities: severity === 'all' ? undefined : [severity],
      domains: dataDomain ? ['data'] : domain === 'all' ? undefined : [domain],
      text: search,
    });
    const scoped = dataDomain
      ? queried.filter((issue) =>
          matchesDataIssueTarget(issue, dataDocumentId, dataOperationId)
        )
      : queried;
    return scoped.filter((issue) =>
      (
        Object.entries(facetSelections) as readonly [IssueFacet, string][]
      ).every(
        ([facet, value]) =>
          value === ALL_FACETS || issueFacetValues(issue, facet).includes(value)
      )
    );
  }, [
    collection,
    dataDocumentId,
    dataDomain,
    dataOperationId,
    domain,
    facetSelections,
    search,
    severity,
    status,
  ]);
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
  const executionSessionId =
    selectedIssue?.status === 'active' &&
    typeof selectedIssue.diagnostic.meta?.executionSessionId === 'string'
      ? selectedIssue.diagnostic.meta.executionSessionId
      : undefined;
  const selectedRevision =
    selectedIssue?.sources
      .map(
        ({ revision: sourceRevision }) =>
          `${sourceRevision.key}:${String(sourceRevision.sequence)}`
      )
      .join(', ') ?? '';
  const selectedIssueHasExactCurrentRevision = Boolean(
    selectedIssue &&
    collection?.revision &&
    selectedIssue.status === 'active' &&
    selectedIssue.sources.some(
      (source) =>
        source.status === 'active' &&
        source.revision.key === collection.revision?.key &&
        source.revision.sequence === collection.revision.sequence
    )
  );
  const retryOperationId =
    selectedIssue?.status === 'active' &&
    selectedIssue.diagnostic.retryable === true &&
    selectedIssue.diagnostic.meta?.entryKind === 'operation' &&
    selectedIssue.diagnostic.targetRef?.kind === 'operation'
      ? selectedIssue.diagnostic.targetRef.operation
      : undefined;

  const openTarget = () => {
    if (!projectId || !selectedIssue?.diagnostic.targetRef) return;
    if (!selectedIssueHasExactCurrentRevision) {
      setActionMessage(
        t('issues.actions.historicalRevision', {
          revision: selectedRevision,
        })
      );
      return;
    }
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
    if (!selectedIssueHasExactCurrentRevision) {
      setActionMessage(
        t('issues.actions.historicalRevision', {
          revision: selectedRevision,
        })
      );
      return;
    }
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
  const openExecution = () => {
    if (!projectId || !collection || !selectedIssue || !executionSessionId)
      return;
    useExecutionCenterNavigationStore.getState().openExecutionDiagnostic({
      workspaceId: collection.workspaceId,
      sessionId: executionSessionId,
      diagnosticCode: selectedIssue.diagnostic.code,
    });
    navigate(`/editor/project/${projectId}/blueprint`);
  };
  const retryOperation = async () => {
    if (!collection || !retryOperationId || retryingOperation) return;
    setRetryingOperation(true);
    try {
      const result = await requeueFailedWorkspaceOutboxOperation({
        workspaceId: collection.workspaceId,
        entryId: retryOperationId,
      });
      setActionMessage(
        t(
          result === 'queued'
            ? 'issues.actions.retryQueued'
            : 'issues.actions.retryUnavailable'
        )
      );
    } finally {
      setRetryingOperation(false);
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
        <PdxSelect
          aria-label={t('issues.filters.status')}
          value={status}
          options={[
            { value: 'open', label: t('issues.status.open') },
            { value: 'active', label: t('issues.status.active') },
            { value: 'stale', label: t('issues.status.stale') },
            { value: 'resolved', label: t('issues.status.resolved') },
            { value: 'all', label: t('issues.status.all') },
          ]}
          size="Small"
          style={{ width: 132 }}
          onValueChange={(value) => setStatus(value as StatusFilter)}
        />
        <PdxSelect
          aria-label={t('issues.filters.severity')}
          value={severity}
          options={[
            { value: 'all', label: t('issues.severity.all') },
            { value: 'fatal', label: t('issues.severity.fatal') },
            { value: 'error', label: t('issues.severity.error') },
            { value: 'warning', label: t('issues.severity.warning') },
            { value: 'info', label: t('issues.severity.info') },
          ]}
          size="Small"
          style={{ width: 148 }}
          onValueChange={(value) => setSeverity(value as SeverityFilter)}
        />
        {!dataDomain ? (
          <PdxSelect
            aria-label={t('issues.filters.domain')}
            value={domain}
            options={[
              { value: 'all', label: t('issues.domain.all') },
              { value: 'behavior', label: t('issues.domain.behavior') },
              {
                value: 'verification',
                label: t('issues.domain.verification'),
              },
            ]}
            size="Small"
            style={{ width: 144 }}
            onValueChange={(value) => setDomain(value as G3DomainFilter)}
          />
        ) : null}
        {dataDomain ? (
          <button
            type="button"
            className="max-w-80 truncate rounded-lg border border-(--border-subtle) bg-(--bg-raised) px-3 py-2 text-left text-xs text-(--text-secondary)"
            title={`${dataDocumentId ?? 'data'}${dataOperationId ? `#${dataOperationId}` : ''}`}
            onClick={() => {
              setSearchParams({});
              setSelectedId(null);
            }}
          >
            {t('issues.filters.dataTarget', {
              target: `${dataDocumentId ?? 'data'}${dataOperationId ? `#${dataOperationId}` : ''}`,
            })}{' '}
            ×
          </button>
        ) : null}
      </section>
      {!dataDomain ? (
        <section className="flex flex-wrap items-center gap-2 border-b border-(--border-subtle) px-6 py-2">
          {(
            [
              ['scenario', scenario, setScenario],
              ['check', check, setCheck],
              ['family', family, setFamily],
              ['surface', surface, setSurface],
              ['target', target, setTarget],
              ['provider', provider, setProvider],
              ['revision', revision, setRevision],
            ] as const
          ).map(([facet, value, setValue]) => (
            <PdxSelect
              key={facet}
              aria-label={t(`issues.filters.${facet}`)}
              value={value}
              options={facetOptions(
                allCollectionIssues,
                facet,
                t(`issues.filters.${facet}All`)
              )}
              size="ExtraSmall"
              style={{ width: facet === 'revision' ? 170 : 138 }}
              onValueChange={setValue}
            />
          ))}
        </section>
      ) : null}

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
                      <span
                        className="mt-0.5 text-(--text-secondary)"
                        aria-label={t(
                          `issues.severity.${issue.diagnostic.severity}`
                        )}
                      >
                        {severityIcon[issue.diagnostic.severity]}
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-center gap-2">
                          <code className="text-xs font-semibold">
                            {issue.diagnostic.code}
                          </code>
                          <span
                            className="inline-flex size-6 items-center justify-center rounded-full bg-(--bg-panel) text-(--text-muted)"
                            aria-label={t(`issues.status.${issue.status}`)}
                            title={t(`issues.status.${issue.status}`)}
                          >
                            {statusIcon[issue.status]}
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
                  <span>·</span>
                  <code title={selectedRevision}>
                    {t('issues.details.revisionValue', {
                      revision: selectedRevision,
                    })}
                  </code>
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
                {retryOperationId && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-(--text-primary) px-3 py-2 text-sm text-(--bg-canvas) disabled:opacity-50"
                    disabled={retryingOperation}
                    onClick={() => void retryOperation()}
                  >
                    <RotateCcw size={15} />
                    {t('issues.actions.retry')}
                  </button>
                )}
                {executionSessionId && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg bg-(--text-primary) px-3 py-2 text-sm text-(--bg-canvas)"
                    onClick={openExecution}
                  >
                    <Activity size={15} />
                    {t('issues.actions.openExecution')}
                  </button>
                )}
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
                    onClick={async () => {
                      const result = await executeWorkspaceIssueQuickFix(
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
              {!selectedIssueHasExactCurrentRevision ? (
                <p
                  role="status"
                  className="m-0 rounded-lg border border-(--warning-color)/35 bg-(--warning-color)/8 px-3 py-2 text-xs text-(--warning-color)"
                >
                  {t('issues.details.historicalRevision', {
                    revision: selectedRevision,
                  })}
                </p>
              ) : null}

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
