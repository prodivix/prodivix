import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  CircleDashed,
  CircleMinus,
  CircleSlash2,
  Code2,
  FileCode2,
  ListChecks,
  LoaderCircle,
  LocateFixed,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from 'lucide-react';
import { PdxSelect, PdxTooltip } from '@prodivix/ui';
import type {
  ExecutionSourceTrace,
  ExecutionTestStatus,
} from '@prodivix/runtime-core';
import {
  createWorkspaceExecutionSnapshotId,
  ExecutionCenter,
  useWorkspaceExecutionSourceNavigation,
} from '@/editor/features/execution';
import { selectWorkspace, useEditorStore } from '@/editor/store/useEditorStore';
import { useProjectTestRunner } from './useProjectTestRunner';
import { resolveProjectTestPrimarySourceTrace } from './projectTestReportModel';

const activeStatuses = new Set([
  'compiling',
  'queued',
  'starting',
  'running',
  'cancelling',
]);

const statusIcon = (status: ExecutionTestStatus) => {
  if (status === 'passed') return <CheckCircle2 size={14} />;
  if (status === 'failed') return <XCircle size={14} />;
  return <CircleDashed size={14} />;
};

const statusClass = (status: ExecutionTestStatus): string => {
  if (status === 'failed') return 'text-(--danger-color)';
  if (status === 'passed') return 'text-(--text-primary)';
  return 'text-(--text-muted)';
};

const formatDuration = (durationMs: number | undefined): string => {
  if (durationMs === undefined) return '—';
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1_000).toFixed(2)} s`;
};

export default function ProjectTestingPage() {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const workspace = useEditorStore(selectWorkspace);
  const runner = useProjectTestRunner(workspace);
  const sourceNavigation = useWorkspaceExecutionSourceNavigation({
    workspace,
    originSurface: 'execution-center',
  });
  const [sourceNavigationFailure, setSourceNavigationFailure] = useState<
    'snapshot-stale' | 'source-unavailable'
  >();
  const counts = runner.report?.summary;
  const reportIsCurrent = Boolean(
    workspace &&
    runner.reportSnapshotId === createWorkspaceExecutionSnapshotId(workspace)
  );
  const active = activeStatuses.has(runner.status);
  const executionFailed =
    runner.status === 'failed' || runner.status === 'timed-out';
  const consoleDiagnostics = useMemo(
    () =>
      runner.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        severity: diagnostic.severity,
        message: diagnostic.message,
        path: diagnostic.path,
      })),
    [runner.diagnostics]
  );

  useEffect(() => {
    setSourceNavigationFailure(undefined);
  }, [runner.reportJobId, runner.reportSnapshotId]);

  const actionBaseClass =
    'inline-flex size-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const actionClass = `${actionBaseClass} border-(--border-default) bg-(--bg-canvas) text-(--text-primary) hover:bg-(--bg-raised)`;
  const primaryActionClass = `${actionBaseClass} border-(--text-primary) bg-(--text-primary) text-(--bg-canvas) hover:opacity-85`;
  const openSourceTrace = (trace: ExecutionSourceTrace | undefined): void => {
    if (
      !trace ||
      !runner.reportJobId ||
      !runner.reportProviderId ||
      !runner.reportSnapshotId
    ) {
      setSourceNavigationFailure('source-unavailable');
      return;
    }
    const result = sourceNavigation.openSourceTrace({
      jobId: runner.reportJobId,
      providerId: runner.reportProviderId,
      snapshotId: runner.reportSnapshotId,
      sourceTrace: trace,
    });
    setSourceNavigationFailure(
      result.status === 'unavailable' ? result.reason : undefined
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-(--bg-canvas) text-(--text-primary)">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-(--border-default) px-5">
        <h1 className="m-0 text-base font-semibold">{t('testing.title')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <PdxSelect
            aria-label={t('testing.target.label')}
            disabled={active}
            options={[
              { label: t('testing.target.react'), value: 'react-vite' },
              { label: t('testing.target.vue'), value: 'vue-vite' },
            ]}
            size="ExtraSmall"
            style={{ flex: '0 0 112px', width: 112 }}
            value={runner.target}
            onValueChange={(value) =>
              runner.setTarget(value === 'vue-vite' ? 'vue-vite' : 'react-vite')
            }
          />
          <PdxSelect
            aria-label={t('testing.provider.label')}
            disabled={active}
            options={[
              { label: t('testing.provider.browser'), value: 'browser' },
              {
                label: t('testing.provider.remote'),
                value: 'remote',
                disabled: !runner.remoteAvailable,
              },
            ]}
            size="ExtraSmall"
            style={{ flex: '0 0 104px', width: 104 }}
            title={
              runner.remoteAvailable
                ? undefined
                : t('testing.provider.remoteSignIn')
            }
            value={runner.provider}
            onValueChange={(value) =>
              runner.setProvider(value === 'remote' ? 'remote' : 'browser')
            }
          />
          <PdxTooltip content={t('testing.actions.openCode')}>
            <button
              type="button"
              className={actionClass}
              onClick={() =>
                workspace && navigate(`/editor/project/${workspace.id}/code`)
              }
              disabled={!workspace}
              aria-label={t('testing.actions.openCode')}
              title={t('testing.actions.openCode')}
            >
              <Code2 size={14} aria-hidden="true" />
            </button>
          </PdxTooltip>
          {active ? (
            <PdxTooltip content={t('testing.actions.stop')}>
              <button
                type="button"
                className={actionClass}
                onClick={() => void runner.stop()}
                aria-label={t('testing.actions.stop')}
                title={t('testing.actions.stop')}
              >
                <Square size={13} aria-hidden="true" />
              </button>
            </PdxTooltip>
          ) : (
            <PdxTooltip
              content={
                runner.report
                  ? t('testing.actions.rerun')
                  : t('testing.actions.run')
              }
            >
              <button
                type="button"
                className={primaryActionClass}
                onClick={() => void runner.run()}
                disabled={!workspace}
                aria-label={
                  runner.report
                    ? t('testing.actions.rerun')
                    : t('testing.actions.run')
                }
                title={
                  runner.report
                    ? t('testing.actions.rerun')
                    : t('testing.actions.run')
                }
              >
                {runner.report ? (
                  <RotateCcw size={14} aria-hidden="true" />
                ) : (
                  <Play size={14} aria-hidden="true" />
                )}
              </button>
            </PdxTooltip>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          {counts ? (
            <section
              className="flex flex-wrap items-center justify-end gap-1.5"
              aria-label={t('testing.report.title')}
            >
              {(
                [
                  ['files', counts.totalFiles, <FileCode2 size={13} />],
                  ['cases', counts.totalCases, <ListChecks size={13} />],
                  ['passed', counts.passedCases, <CheckCircle2 size={13} />],
                  ['failed', counts.failedCases, <XCircle size={13} />],
                  ['skipped', counts.skippedCases, <CircleMinus size={13} />],
                  ['todo', counts.todoCases, <CircleDashed size={13} />],
                ] as const
              ).map(([key, value, icon]) => {
                const label = t(`testing.summary.${key}`);
                const detail =
                  key === 'failed'
                    ? `${label}: ${value} · ${t('testing.summary.failedFiles', {
                        count: counts.failedFiles,
                      })}`
                    : `${label}: ${value}`;
                return (
                  <span
                    key={key}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 text-[11px] tabular-nums ${
                      key === 'failed' && value > 0
                        ? 'text-(--danger-color)'
                        : 'text-(--text-muted)'
                    }`}
                    aria-label={detail}
                    title={detail}
                  >
                    {icon}
                    <span>{value}</span>
                  </span>
                );
              })}
            </section>
          ) : null}

          {active && !runner.report ? (
            <section
              className="flex items-center justify-center gap-2 rounded-xl border border-(--border-default) bg-(--bg-panel) px-4 py-3"
              role="status"
            >
              <LoaderCircle
                size={15}
                className="animate-spin text-(--text-muted)"
                aria-hidden="true"
              />
              <span className="text-xs text-(--text-secondary)">
                {runner.message ?? t('testing.running.title')}
              </span>
            </section>
          ) : runner.report ? (
            <section className="overflow-hidden rounded-xl border border-(--border-default) bg-(--bg-panel)">
              <header className="flex items-center gap-3 border-b border-(--border-subtle) px-4 py-3">
                <div>
                  <div className="text-sm font-medium">
                    {t('testing.report.title')}
                  </div>
                  <div className="mt-0.5 text-[11px] text-(--text-muted)">
                    {runner.report.tool.name} ·{' '}
                    {formatDuration(runner.report.durationMs)}
                  </div>
                </div>
                <span className="ml-auto max-w-[45%] truncate font-mono text-[10px] text-(--text-muted)">
                  {t(
                    reportIsCurrent
                      ? 'testing.report.current'
                      : 'testing.report.outdated'
                  )}{' '}
                  · {runner.reportSnapshotId}
                </span>
              </header>
              {sourceNavigationFailure ? (
                <div
                  role="status"
                  className="border-b border-(--border-subtle) px-4 py-2 text-[11px] text-(--warning-color)"
                >
                  {t(
                    sourceNavigationFailure === 'snapshot-stale'
                      ? 'execution.sourceNavigation.snapshotStale'
                      : 'execution.sourceNavigation.sourceUnavailable'
                  )}
                </div>
              ) : null}
              {runner.report.failureMessages.map((message, index) => (
                <pre
                  key={`report-failure:${index}`}
                  className="m-3 overflow-auto rounded-md border border-(--border-subtle) bg-(--bg-canvas) p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-(--danger-color)"
                >
                  {message}
                </pre>
              ))}
              <div className="divide-y divide-(--border-subtle)">
                {runner.report.files.map((file) => {
                  const fileSourceTrace = resolveProjectTestPrimarySourceTrace(
                    file.sourceTrace
                  );
                  return (
                    <article key={file.fileId} className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <FileCode2 size={14} className="text-(--text-muted)" />
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {file.path}
                        </span>
                        <span className="text-[10px] font-normal text-(--text-muted)">
                          {formatDuration(file.durationMs)}
                        </span>
                        {fileSourceTrace ? (
                          <button
                            type="button"
                            className="inline-flex size-6 items-center justify-center rounded-md text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)"
                            title={t('testing.actions.openSource')}
                            aria-label={t('testing.actions.openSource')}
                            onClick={() => openSourceTrace(fileSourceTrace)}
                          >
                            <LocateFixed size={12} />
                          </button>
                        ) : null}
                      </div>
                      {file.failureMessages.map((message, index) => (
                        <pre
                          key={`${file.fileId}:failure:${index}`}
                          className="mt-2 overflow-auto rounded-md border border-(--border-subtle) bg-(--bg-canvas) p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-(--danger-color)"
                        >
                          {message}
                        </pre>
                      ))}
                      <div className="mt-2 grid gap-1">
                        {file.cases.map((testCase) => {
                          const caseSourceTrace =
                            resolveProjectTestPrimarySourceTrace(
                              testCase.sourceTrace
                            );
                          return (
                            <div
                              key={testCase.caseId}
                              className="rounded-lg bg-(--bg-canvas) px-3 py-2"
                            >
                              <div
                                className={`flex items-center gap-2 text-xs ${statusClass(testCase.status)}`}
                              >
                                {statusIcon(testCase.status)}
                                <span className="min-w-0 flex-1 truncate">
                                  {testCase.fullName ?? testCase.name}
                                </span>
                                <span className="text-[10px] text-(--text-muted)">
                                  {formatDuration(testCase.durationMs)}
                                </span>
                                {caseSourceTrace ? (
                                  <button
                                    type="button"
                                    className="inline-flex size-6 items-center justify-center rounded-md text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary)"
                                    title={t('testing.actions.openSource')}
                                    aria-label={t('testing.actions.openSource')}
                                    onClick={() =>
                                      openSourceTrace(caseSourceTrace)
                                    }
                                  >
                                    <LocateFixed size={12} />
                                  </button>
                                ) : null}
                              </div>
                              {testCase.failureMessages?.map(
                                (message, index) => (
                                  <pre
                                    key={`${testCase.caseId}:failure:${index}`}
                                    className="mt-2 overflow-auto rounded-md border border-(--border-subtle) bg-(--bg-panel) p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-(--danger-color)"
                                  >
                                    {message}
                                  </pre>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : runner.status === 'blocked' || executionFailed ? (
            <section
              className="flex items-center rounded-lg border border-(--border-default) bg-(--bg-panel) px-4 py-3"
              role="alert"
              aria-label={
                runner.status === 'blocked'
                  ? t('testing.blocked.title')
                  : t('testing.failed.title')
              }
            >
              <div className="flex max-w-xl items-center gap-3">
                {executionFailed ? (
                  <XCircle
                    size={18}
                    className="shrink-0 text-(--danger-color)"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleSlash2
                    size={18}
                    className="shrink-0 text-(--warning-color)"
                    aria-hidden="true"
                  />
                )}
                <p className="m-0 text-xs leading-5 text-(--text-secondary)">
                  {runner.message ??
                    (runner.status === 'blocked'
                      ? t('testing.blocked.description')
                      : t('testing.failed.description'))}
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <ExecutionCenter
        sessionId={runner.sessionId}
        status={runner.status}
        diagnostics={consoleDiagnostics}
        workspace={workspace ?? undefined}
        onOpenSourceTrace={sourceNavigation.openSourceTrace}
        onOpenDataOperation={sourceNavigation.openDataOperation}
        onRestart={() => void runner.run()}
        onStop={() => void runner.stop()}
      />
    </div>
  );
}
