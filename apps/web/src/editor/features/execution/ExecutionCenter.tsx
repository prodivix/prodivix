import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCcw,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react';
import type { ExecutionSessionStatus } from '@prodivix/runtime-core';
import { executionSessionCoordinator } from './executionSessionEnvironment';
import {
  createExecutionConsoleLines,
  type ExecutionConsoleDiagnostic,
  type ExecutionConsoleFilter,
} from './executionConsoleModel';
import { createExecutionNetworkEntries } from './executionNetworkModel';
import { useExecutionSession } from './useExecutionSession';

type ExecutionCenterProps = Readonly<{
  sessionId: string;
  status?: ExecutionCenterStatus;
  previewUrl?: string;
  diagnostics?: readonly ExecutionConsoleDiagnostic[];
  onRestart?(): void;
  onStop?(): void;
  onReloadPreview?(): void;
  onOpenPreview?(): void;
}>;

export type ExecutionCenterStatus =
  ExecutionSessionStatus | 'compiling' | 'blocked';

const activeStatuses = new Set<ExecutionCenterStatus>([
  'queued',
  'starting',
  'running',
  'cancelling',
  'compiling',
]);

const statusDotClass = (status: ExecutionCenterStatus): string => {
  if (status === 'failed' || status === 'timed-out' || status === 'blocked') {
    return 'bg-(--danger-color)';
  }
  if (status === 'running') return 'bg-(--text-primary)';
  return 'bg-(--text-muted)';
};

const lineToneClass = (level: 'info' | 'warning' | 'error'): string => {
  if (level === 'error') return 'text-(--danger-color)';
  if (level === 'warning') return 'text-(--warning-color)';
  return 'text-(--text-secondary)';
};

export function ExecutionCenter({
  sessionId,
  status,
  previewUrl,
  diagnostics,
  onRestart,
  onStop,
  onReloadPreview,
  onOpenPreview,
}: ExecutionCenterProps) {
  const { t } = useTranslation('editor');
  const session = useExecutionSession(sessionId);
  const [collapsed, setCollapsed] = useState(false);
  const [surface, setSurface] = useState<'console' | 'network'>('console');
  const [filter, setFilter] = useState<ExecutionConsoleFilter>('all');
  const outputRef = useRef<HTMLDivElement | null>(null);
  const effectiveStatus = status ?? session?.status ?? 'idle';
  const lines = useMemo(
    () => createExecutionConsoleLines({ session, diagnostics, filter }),
    [diagnostics, filter, session]
  );
  const active = activeStatuses.has(effectiveStatus);
  const networkEntries = useMemo(
    () => createExecutionNetworkEntries(session),
    [session]
  );

  useEffect(() => {
    if (collapsed) return;
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [collapsed, lines.length, networkEntries.length, surface]);

  const iconButtonClass =
    'inline-flex size-7 items-center justify-center rounded-md text-(--text-muted) transition-colors hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-35';

  return (
    <section
      className={`flex shrink-0 flex-col border-t border-(--border-default) bg-(--bg-canvas) text-(--text-primary) ${collapsed ? 'h-9' : 'h-[210px]'}`}
      aria-label={t('execution.title')}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-(--border-subtle) px-2.5">
        <button
          type="button"
          className={iconButtonClass}
          onClick={() => setCollapsed((current) => !current)}
          title={collapsed ? t('execution.expand') : t('execution.collapse')}
          aria-label={
            collapsed ? t('execution.expand') : t('execution.collapse')
          }
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-xs font-medium">{t('execution.title')}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-(--border-default) px-2 py-0.5 text-[10px] text-(--text-muted)">
          <span
            className={`size-1.5 rounded-full ${statusDotClass(effectiveStatus)}`}
          />
          {t(`execution.status.${effectiveStatus}`, {
            defaultValue: effectiveStatus,
          })}
        </span>
        {session?.activeJob ? (
          <span
            className="min-w-0 truncate text-[10px] text-(--text-muted)"
            title={session.activeJob.workspace.snapshotId}
          >
            {session.activeJob.providerId} ·{' '}
            {session.activeJob.workspace.snapshotId.slice(-12)}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          {onRestart ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onRestart}
              title={t('execution.restart')}
              aria-label={t('execution.restart')}
            >
              <RefreshCcw size={13} />
            </button>
          ) : null}
          {onStop ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onStop}
              disabled={!active}
              title={t('execution.stop')}
              aria-label={t('execution.stop')}
            >
              <Square size={12} />
            </button>
          ) : null}
          {onReloadPreview ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onReloadPreview}
              disabled={!previewUrl}
              title={t('execution.reloadPreview')}
              aria-label={t('execution.reloadPreview')}
            >
              <RotateCw size={13} />
            </button>
          ) : null}
          {onOpenPreview ? (
            <button
              type="button"
              className={iconButtonClass}
              onClick={onOpenPreview}
              disabled={!previewUrl}
              title={t('execution.openPreview')}
              aria-label={t('execution.openPreview')}
            >
              <ExternalLink size={13} />
            </button>
          ) : null}
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => executionSessionCoordinator.clearEvents(sessionId)}
            disabled={!session?.events.length}
            title={t('execution.clear')}
            aria-label={t('execution.clear')}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      {!collapsed ? (
        <>
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-(--border-subtle) px-3">
            {(['console', 'network'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-2 py-1 text-[10px] ${surface === value ? 'bg-(--bg-raised) text-(--text-primary)' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
                aria-pressed={surface === value}
                onClick={() => setSurface(value)}
              >
                {t(`execution.surface.${value}`)}
              </button>
            ))}
            {surface === 'console'
              ? (['all', 'errors'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rounded-md px-2 py-1 text-[10px] ${filter === value ? 'text-(--text-primary)' : 'text-(--text-muted) hover:text-(--text-primary)'}`}
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {t(`execution.filter.${value}`)}
                  </button>
                ))
              : null}
            <span className="ml-auto text-[10px] text-(--text-muted)">
              {t('execution.eventCount', {
                count:
                  surface === 'console' ? lines.length : networkEntries.length,
              })}
            </span>
          </div>
          <div
            ref={outputRef}
            className="min-h-0 flex-1 overflow-auto bg-(--bg-panel) px-3 py-2 font-mono text-[10px] leading-4"
          >
            {surface === 'console' && lines.length ? (
              lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[72px_1fr] gap-2 py-0.5"
                >
                  <span className="truncate text-(--text-muted)">
                    {line.label}
                  </span>
                  <span className="min-w-0">
                    <span className={lineToneClass(line.level)}>
                      {line.message}
                    </span>
                    {line.detail ? (
                      <span className="ml-2 break-all text-(--text-muted)">
                        {line.detail}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))
            ) : surface === 'network' && networkEntries.length ? (
              networkEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[72px_minmax(160px,1fr)_72px_64px] gap-2 py-0.5"
                >
                  <span className="truncate text-(--text-secondary)">
                    {entry.trace.correlation
                      ? `${entry.trace.method} · ${entry.trace.correlation.operationId}`
                      : entry.trace.method}
                  </span>
                  <span
                    className="truncate text-(--text-secondary)"
                    title={entry.trace.sanitizedUrl}
                  >
                    {entry.trace.sanitizedUrl}
                  </span>
                  <span
                    className={
                      entry.trace.outcome === 'allowed'
                        ? 'text-(--text-muted)'
                        : 'text-(--danger-color)'
                    }
                  >
                    {entry.trace.status ?? entry.trace.outcome}
                  </span>
                  <span className="text-right text-(--text-muted)">
                    {entry.trace.durationMs} ms
                  </span>
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-(--text-muted)">
                {t(
                  surface === 'console'
                    ? 'execution.empty'
                    : 'execution.networkEmpty'
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
